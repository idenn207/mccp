'use strict';

// 경로 redaction. reporter(ESM)와 run.js(CJS)가 **같은 규칙**을 써야 하므로 모듈로
// 뗀다 — plan의 `Files to Change`는 scripts/test-suite에 3파일을 적었고 이것이 4번째다.
// 복제를 택하지 않은 이유: 두 사본 중 하나만 고쳐지는 날 조용히 새고, 그 유출은
// git-tracked 증거와 CI artifact 양쪽에 동시에 들어간다(DD7).
//
// 이 파일이 지키는 계약은 둘이다.
//   1. 알려진 root는 placeholder로 치환한다 (substitution).
//   2. 치환 후에도 남은 절대경로가 있으면 **거짓으로 통과시키지 않는다** (invariant).
// 2가 1의 백스톱인 이유는 1이 반드시 새기 때문이다 — 등록된 root만 아는 치환은
// 정의상 등록 밖 경로(%APPDATA%\npm-cache, /home/runner/.cache, env echo)를 놓친다.
//
// ── santa-loop round 0 회귀 (2026-09-01) ───────────────────────────────────────
// 이 파일의 첫 판본은 **파싱조차 되지 않았다**(`node --check` exit 1). 원인은 열한 개의
// 독립 실수가 아니라 하나였다: 파일이 백슬래시를 보존하지 못하는 채널(heredoc)로
// 쓰이면서 모든 `\\`가 `\`로 붕괴했다. 그 결과 구분자 클래스가 전부 forward slash
// 전용이 되어 **두 계약이 같은 입력에서 같은 방향으로 동시에 실패했다** — 2가 1의
// 백스톱이라는 위 전제가 무너진 것이다. 두 리뷰어(blind·bundled)가 독립적으로 같은
// 근본 원인에 도달했다.
//
// 그래서 이 파일을 고칠 때의 규칙: **셸 heredoc으로 쓰지 마라.** 백슬래시를 보존하는
// 경로로 쓰고, 저장 직후 `node --check scripts/test-suite/redact.js`로 확인하라.
//
// ── santa-loop round 1 (2026-09-01) ──────────────────────────────────────────
// 두 리뷰어가 다시 같은 단일 결함에 수렴했다: `redactPath`의 fold 판정을 호스트의
// `path` 구현에 맡기면 **POSIX 호스트가 Windows 형태를 "절대경로가 아니다"라고 답한다.**
// 그러면 계정 경로가 repo-relative 집계 키로 그대로 나간다. 판정을 형태 기반으로
// 옮겼다(아래 `redactPath` 주석 참조).

const os = require('os');
const fs = require('fs');
const path = require('path');

const WIN = process.platform === 'win32';

// realpathSync는 symlink만 해석하고 Win32 GetLongPathName을 호출하지 않으므로
// 8.3 단축형을 확장하지 않는다. 이 머신 실측:
//   os.tmpdir()                  C:\Users\ADMINI~1\AppData\Local\Temp
//   fs.realpathSync(tmpdir)      C:\Users\ADMINI~1\AppData\Local\Temp   ← 동일
//   fs.realpathSync.native(...)  C:\Users\Administrator\AppData\Local\Temp
// 즉 `.native`가 없으면 plan이 "두 후보"라 부른 것이 실제로는 한 값이고,
// 장형 별칭(`C:\Users\Administrator\...`)이 치환도 invariant도 통과한다.
//
// 두 catch는 **같은 정책**을 쓴다 — 어느 쪽이든 후보 하나를 잃은 사실을 `onDegrade`로
// 올린다. round 1 리뷰: 이전 판본은 헤더가 "구분해서 보고한다"고 선언해 놓고 앞의
// catch만 무구분 폐기해, 권한 오류로 realpath가 죽은 경우가 아무 흔적도 남기지 않았다.
function rootVariants(dir, onDegrade) {
  const out = [];
  if (!dir) return out;
  out.push(dir);
  const tryPush = (fn, which) => {
    try {
      out.push(fn(dir));
    } catch (err) {
      if (typeof onDegrade === 'function') {
        onDegrade({ which: which, code: (err && err.code) || 'UNKNOWN' });
      }
    }
  };
  tryPush(fs.realpathSync, 'realpath');
  tryPush(fs.realpathSync.native, 'realpath-native');
  return out;
}

// 정규식 메타문자를 중화한다. 이 저장소에서 실제로 값을 하는 문자는 `.`다
// (`.worktrees` 세그먼트 — 중화하지 않으면 wildcard가 되어 sibling worktree를 삼킨다).
// 백슬래시는 `rootRegex`가 split으로 먼저 걷어내므로 세그먼트 안에 남지 않지만,
// 이 함수는 root 전용이 아니므로 클래스에 유지한다.
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 하나의 root를 문자열 안에서 찾기 위한 정규식. 구분자는 `\`와 `/`를 서로
// 호환으로 보고(Windows 진단 텍스트는 둘을 섞는다), Windows에서는 대소문자를
// 무시한다. `file://` 스킴은 접두로 함께 먹는다 — ESM 스택 프레임이
// `file:///C:/Users/...` 형태로 렌더링되고, 그것은 backslash 비교를 통째로 회피한다.
//
// split의 클래스와 join의 문자열이 **둘 다** 양 구분자를 담아야 한다. 하나라도
// forward slash 전용이면 Windows root는 split이 1조각을 내고 join이 아예 일어나지
// 않아, 패턴 본문이 raw root가 되고 자기 자신과도 매치되지 않는다.
function rootRegex(root) {
  const body = root.split(/[\\/]/).map(escapeRe).join('[\\\\/]+');
  return new RegExp('(?:file:/{2,3})?' + body, WIN ? 'gi' : 'g');
}

// 절대경로 **형태** 술어. 호스트의 `path.isAbsolute`를 쓰지 않는 이유는 그것이
// 플랫폼 구현이기 때문이다 — `path.posix.isAbsolute('C:\\Users\\x')`는 false다.
const WIN_ABS_RE = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/;   // 드라이브 절대 또는 UNC
const URL_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:\/{2}/;    // file:// http:// 등

// 치환 후에도 남은 **절대경로 형태**를 잡는 구조적 스캔.
//
// Windows 축(`win-drive-abs`)은 드라이브 문자 + 구분자라는 형태를 보므로 등록 여부와
// 무관하게 `C:\…`와 `C:/…`를 함께 잡는다. 다만 **전수는 아니다**, 그리고 그 한계는
// 둘이다: (a) UNC(`\\server\share`)와 드라이브 상대(`\Users\x`)는 이 형태에 해당하지
// 않아 잡히지 않는다. (b) 앞의 `(?<![A-Za-z0-9])`는 `https://`의 `s:/`를 배제하지만,
// 그 대가로 **앞 문자가 영숫자면 매치하지 않는다** — `node20C:\Users\x`처럼 구분자
// 없이 앞말과 붙은 경로는 통과한다. 두 한계 모두 backlog에 이연돼 있다
// (.claude/plans/codex-findings-backlog.md, 2026-09-01 santa round 1 행).
//
// POSIX 축은 **열거다.** 형태만으로는 경로와 비경로를 가를 수 없기 때문이다 —
// `/mccp:plan`도 `--flag=/x`도 `/`로 시작한다. 그래서 이 축은 알려진 홈/임시
// 계열만 본다. 열거는 반드시 빠뜨리므로 **이것은 1차 방어가 아니다**: CI-origin
// 유출에 대한 1차 방어는 producer가 자기 머신에서 봉인한 `redaction_ok`이고
// (그 머신만이 자기 root를 안다), 이 스캔은 그 위에 얹는 2차다.
const RESIDUAL_PATTERNS = [
  { name: 'win-drive-abs', re: /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/g },
  { name: 'posix-home', re: /\/(?:home|Users|root)\/[^\s"'`,;)\]}]+/g },
  { name: 'posix-tmp', re: /\/(?:tmp|private\/var|var\/folders)\/[^\s"'`,;)\]}]+/g },
  { name: 'file-url', re: /file:\/{2,3}[^\s"'`,;)\]}]+/g },
];

// 재귀 상한. 흡수표 C-4/C-5가 재귀 깊이를 20으로 고정했으므로 그 값을 쓴다 — 다른
// 가드가 다른 깊이를 보면 그 사이 구간을 한쪽만 검사하게 된다.
const MAX_DEPTH = 20;
// hit 상한은 흡수표가 정한 값이 **아니다**(어느 행도 hit 수를 고정하지 않는다).
// 20은 진단 가독성을 위한 이 모듈의 선택이며, 조기 반환 시점에 이미 hits가
// 비어있지 않으므로 "깨끗함"으로 읽힐 수 없다.
const MAX_HITS = 20;

function createRedactor(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot || process.cwd();

  // 후보 생산자가 죽은 경우를 규칙 개수와 함께 노출한다. **경로는 싣지 않는다** —
  // round 1 리뷰: 이 배열은 caller가 산출에 stamp하도록 안내된 표면인데 raw
  // 절대경로를 담고 있었다. 그러면 유출을 지우는 모듈이 스스로 유출 채널이 된다.
  const degraded = [];
  const onDegrade = (d) => degraded.push(d);

  // placeholder는 길이 내림차순으로 적용한다. repoRoot가 tmpdir 아래에 있는
  // 구성(test fixture)에서 짧은 root를 먼저 치환하면 긴 root가 영영 매치되지 않는다.
  const specs = [];
  rootVariants(repoRoot, onDegrade).forEach((r) => specs.push({ root: r, tag: '<repo>' }));
  rootVariants(os.tmpdir(), onDegrade).forEach((r) => specs.push({ root: r, tag: '<tmp>' }));
  rootVariants(os.homedir(), onDegrade).forEach((r) => specs.push({ root: r, tag: '<home>' }));

  const seen = new Set();
  const rules = [];
  specs
    .filter((s) => s.root && typeof s.root === 'string')
    .sort((a, b) => b.root.length - a.root.length)
    .forEach((s) => {
      const key = WIN ? s.root.toLowerCase() : s.root;
      if (seen.has(key)) return;
      seen.add(key);
      rules.push({ tag: s.tag, re: rootRegex(s.root) });
    });

  // 자유 텍스트용. 알려진 root를 태그로 접고, 남은 구분자는 POSIX로 정규화한다.
  function redactText(input) {
    if (input == null) return input;
    let s = String(input);
    for (let i = 0; i < rules.length; i++) {
      rules[i].re.lastIndex = 0;
      s = s.replace(rules[i].re, rules[i].tag);
    }
    // 태그 뒤에 붙은 backslash만 정규화한다(`<tmp>\a\b` → `<tmp>/a/b`).
    // 문자열 전역을 건드리면 경로가 아닌 텍스트의 역슬래시까지 바꾼다.
    s = s.replace(/(<(?:repo|tmp|home|external)>)((?:[\\/][^\s"'`,;)\]}]*)+)/g,
      (m, tag, rest) => tag + rest.replace(/\\/g, '/'));
    return s;
  }

  // 집계 키가 repo 밖을 가리킬 때의 표현. 마지막 실질 세그먼트만 남긴다 —
  // `..`/`.`를 걸러내므로 어떤 입력도 부모를 탈출하는 키를 만들 수 없다.
  function externalKey(raw) {
    const parts = String(raw).split(/[\\/]/)
      .filter((p) => p && p !== '.' && p !== '..');
    return '<external>/' + (parts.length ? parts[parts.length - 1] : 'unknown');
  }

  // 집계 키용. write.js:54-60(normalizeReceiptCwd)의 3조건을 그대로 채택하되,
  // **판정을 호스트의 `path`에 맡기지 않는다.**
  //
  // round 1 리뷰가 실측한 것: `path.relative`/`isAbsolute`는 플랫폼 구현이라
  // POSIX 호스트가 `C:\Users\...`를 받으면 "절대경로가 아니고 부모를 탈출하지도
  // 않는다"고 답한다. 그러면 세 조건이 전부 통과해 계정 경로가 **repo-relative
  // 키로 그대로** 나간다. Task 5의 matrix가 ubuntu-latest이므로 CI 원소가 정확히
  // 그 경로를 탄다. 키에는 `redactText`가 적용되지 않으므로 백스톱도 없다.
  //
  // 그래서 (1) 형태로 먼저 거르고, (2) 입력의 형태에 맞는 `path` 구현으로 계산한다.
  function redactPath(abs) {
    if (!abs) return null;
    const raw = String(abs);

    // URL 형태는 경로가 아니다 — 어떤 flavour로도 relative를 계산하면 안 된다.
    if (URL_SCHEME_RE.test(raw)) return externalKey(raw);

    const rawWinAbs = WIN_ABS_RE.test(raw);
    const rawRooted = raw.charAt(0) === '/' || raw.charAt(0) === '\\';

    // 절대경로가 아니면 이미 상대다. 구분자만 정규화하고 탈출만 막는다.
    if (!rawWinAbs && !rawRooted) {
      const norm = raw.split(/[\\/]/).join('/');
      return (norm === '..' || norm.startsWith('../')) ? externalKey(raw) : norm;
    }

    // 입력과 repoRoot의 형태가 다르면 같은 트리일 수 없다.
    const rootWinAbs = WIN_ABS_RE.test(repoRoot);
    if (rawWinAbs !== rootWinAbs) return externalKey(raw);

    const impl = rawWinAbs ? path.win32 : path.posix;
    const rel = impl.relative(repoRoot, raw);
    if (rel && rel !== '..' && !rel.startsWith('..' + impl.sep) && !rel.startsWith('../')
        && !impl.isAbsolute(rel) && !WIN_ABS_RE.test(rel)) {
      return rel.split(/[\\/]/).join('/');
    }
    return externalKey(raw);
  }

  // 산출 전체를 훑어 잔여 절대경로를 찾는다.
  //
  // **반환은 배열이 아니라 `{hits, truncated}`다.** 빈 배열 하나로 "깨끗함"과
  // "상한에 걸려 못 봤음"을 동시에 표현하면 후자가 전자로 읽히고, 그것이 곧
  // `redaction_ok=true` 오봉인이다. 호출자는 `hits.length === 0 && !truncated`
  // 일 때만 통과시켜야 한다.
  //
  // 객체는 **키도 검사한다**. `per_file`처럼 경로를 키로 쓰는 맵이 산출에 있고,
  // 값만 훑으면 그 경로는 구조적으로 보이지 않는다.
  function scanResidual(value) {
    const hits = [];
    let truncated = false;

    const testString = (s, at) => {
      for (let i = 0; i < RESIDUAL_PATTERNS.length; i++) {
        const p = RESIDUAL_PATTERNS[i];
        p.re.lastIndex = 0;
        const m = p.re.exec(s);
        if (m) { hits.push({ at: at, rule: p.name, sample: m[0].slice(0, 80) }); return; }
      }
    };

    const walk = (v, at, depth) => {
      if (hits.length >= MAX_HITS) return;
      if (depth > MAX_DEPTH) { truncated = true; return; }
      if (typeof v === 'string') { testString(v, at); return; }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, at + '[' + i + ']', depth + 1)); return; }
      if (v && typeof v === 'object') {
        Object.keys(v).forEach((k) => {
          testString(k, at + '.{key}');
          walk(v[k], at + '.' + k, depth + 1);
        });
      }
    };

    walk(value, '$', 0);
    return { hits: hits, truncated: truncated };
  }

  return {
    redactText,
    redactPath,
    scanResidual,
    repoRoot,
    ruleCount: rules.length,
    degraded: degraded,
  };
}

module.exports = { createRedactor, RESIDUAL_PATTERNS, MAX_DEPTH, MAX_HITS };
