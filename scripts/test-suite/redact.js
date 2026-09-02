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
// **1은 2를 무력화해서는 안 된다.** 치환이 부분 매치를 하면 남은 문자열이 절대경로
// 형태를 잃어 2가 구조적으로 못 본다 — 치환하지 않았으면 잡혔을 유출이 치환 때문에
// clean이 된다. 그것이 아래 경계 규칙이 존재하는 이유다(round 2).
//
// ── santa-loop 회귀 이력 ──────────────────────────────────────────────────────
// **round 0** — 파일이 파싱조차 되지 않았다(`node --check` exit 1). 원인은 하나였다:
// 백슬래시를 보존하지 못하는 채널(heredoc)로 쓰이면서 모든 `\\`가 `\`로 붕괴했다.
// 구분자 클래스가 전부 forward slash 전용이 되어 두 계약이 같은 입력에서 같은 방향으로
// 동시에 실패했다. **이 파일을 고칠 때는 셸 heredoc을 쓰지 말고**, 저장 직후
// `node --check scripts/test-suite/redact.js`로 확인하라.
//
// **round 1** — `redactPath`의 fold 판정을 호스트 `path`에 맡겨, POSIX 호스트가
// Windows 형태를 "절대경로가 아니다"라고 답했다. 계정 경로가 집계 키로 나갔다.
// 판정을 형태 기반으로 옮겼다.
//
// **round 2** — 두 축이 더 드러났다. (a) root 패턴에 앞뒤 경계가 없어 부분 매치가
// 났다: POSIX root(`/tmp`)는 split의 선행 빈 세그먼트 때문에 문자열 중간의 `/tmp`에도
// 걸려 `/var/tmp/corp/token.txt`가 `/var<tmp>/corp/token.txt`가 되고 잔여 스캔이
// clean을 냈다. 후행 경계 부재는 `.../Administrator` 규칙이 `AdministratorBACKUP`을
// 삼켰다. (b) `scanResidual`의 **반환값 자체**가 원문 경로를 실었다 — 이 모듈이
// `degraded`에서 이미 고친 실패 모드를 `hits`에 그대로 남겨 뒀다.

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
// 올리고, 경로는 싣지 않는다.
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
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 경로 세그먼트를 이룰 수 있는 문자. root 매치의 앞뒤 경계를 이 집합의 부재로 정의한다.
const SEG_CHAR = 'A-Za-z0-9_.~$%+\\-';

// 하나의 root를 문자열 안에서 찾기 위한 정규식.
//
// 구분자는 `\`와 `/`를 서로 호환으로 본다(Windows 진단 텍스트는 둘을 섞는다).
// Windows에서는 대소문자를 무시한다. `file://` 스킴은 접두로 함께 먹는다 — ESM
// 스택 프레임이 `file:///C:/Users/...` 형태로 렌더링되기 때문이다.
//
// **경계 둘이 핵심이다**(round 2).
//   - 빈 세그먼트를 버리고 rooted 여부를 따로 기록한다. 버리지 않으면 join이
//     본문 앞에 수량자를 만들어 (i) `/tmp`가 `/var/tmp` 중간에 매치하고,
//     (ii) UNC root는 빈 세그먼트가 둘이라 인접 수량자 `[\/]+[\/]+`가 생겨
//     구분자 연속 입력에서 초선형 backtracking에 빠진다(실측 O(n³)).
//   - 앞뒤로 «세그먼트 문자가 아님»을 요구한다. 후행이 없으면
//     `…\Administrator` 규칙이 `AdministratorBACKUP`을 삼켜, 남은 문자열이
//     절대경로 형태를 잃고 잔여 스캔이 못 본다.
function rootRegex(root) {
  const segs = root.split(/[\\/]/);
  const rooted = segs.length > 0 && segs[0] === '';
  const parts = segs.filter((s) => s !== '');
  if (parts.length === 0) return null;          // 구분자뿐인 root — 규칙을 만들지 않는다
  const body = parts.map(escapeRe).join('[\\\\/]+');
  const lead = rooted ? '[\\\\/]+' : '';
  return new RegExp(
    '(?<![' + SEG_CHAR + '])(?:file:/{2,3})?' + lead + body + '(?![' + SEG_CHAR + '])',
    WIN ? 'gi' : 'g'
  );
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
// 없이 앞말과 붙은 경로는 통과한다.
//
// POSIX 축은 **열거다.** 형태만으로는 경로와 비경로를 가를 수 없기 때문이다 —
// `/mccp:plan`도 `--flag=/x`도 `/`로 시작한다. 그래서 이 축은 알려진 홈/임시
// 계열만 본다. 열거는 반드시 빠뜨리므로 **이것은 1차 방어가 아니다**: CI-origin
// 유출에 대한 1차 방어는 producer가 자기 머신에서 봉인한 `redaction_ok`이고
// (그 머신만이 자기 root를 안다), 이 스캔은 그 위에 얹는 2차다.
//
// **이 목록은 exhaustive하지 않다.** 위 둘 외에도 원장에 이 모듈의 미커버 축이
// 있다 — 퇴화 root(세그먼트 1개짜리 root가 catch-all이 된다) · `RESIDUAL_PATTERNS`
// export의 공유 `lastIndex` · `Map`/`Set`/`Error`/`toJSON` 값 미순회 · POSIX 패턴의
// 비앵커 오탐 · A-2 퍼센트 디코드 미구현. 전부
// `.claude/plans/codex-findings-backlog.md`의 2026-09-01 santa 행에 있다.
// **run.js를 쓰기 전에 그 행들을 읽어라** — 특히 export 함정은 흡수행 C-2가 요구하는
// merge-time 2차 스캔의 실행 지점에서 발화한다.
const RESIDUAL_PATTERNS = [
  { name: 'win-drive-abs', re: /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/g },
  { name: 'posix-home', re: /\/(?:home|Users|root)\/[^\s"'`,;)\]}]+/g },
  { name: 'posix-tmp', re: /\/(?:tmp|private\/var|var\/folders)\/[^\s"'`,;)\]}]+/g },
  { name: 'file-url', re: /file:\/{2,3}[^\s"'`,;)\]}]+/g },
];

// 재귀 상한. 흡수표 C-4/C-5가 재귀 깊이를 20으로 고정했으므로 그 값을 쓴다.
const MAX_DEPTH = 20;
// hit 상한은 흡수표가 정한 값이 **아니다**(어느 행도 hit 수를 고정하지 않는다).
// 20은 진단 가독성을 위한 이 모듈의 선택이며, 조기 반환 시점에 이미 hits가
// 비어있지 않으므로 "깨끗함"으로 읽힐 수 없다.
const MAX_HITS = 20;
// 라벨에 그대로 실을 수 있는 객체 키의 최대 길이. 넘으면 서수로 대체한다.
const MAX_LABEL_KEY = 64;

function createRedactor(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot || process.cwd();

  // 후보 생산자가 죽은 경우를 규칙 개수와 함께 노출한다. **경로는 싣지 않는다** —
  // 이 배열은 caller가 산출에 stamp하도록 안내된 표면이고, raw 절대경로를 담으면
  // 유출을 지우는 모듈이 스스로 유출 채널이 된다. 같은 이유가 `scanResidual`의
  // 반환값에도 적용된다(아래).
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
      const re = rootRegex(s.root);
      if (re) rules.push({ tag: s.tag, re: re });
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
  // `.`/`..`를 걸러내므로 이 함수는 절대·탈출 키를 만들 수 없다.
  function externalKey(raw) {
    const parts = String(raw).split(/[\\/]/)
      .filter((p) => p && p !== '.' && p !== '..');
    return '<external>/' + (parts.length ? parts[parts.length - 1] : 'unknown');
  }

  // 집계 키용. write.js:54-60(normalizeReceiptCwd)의 3조건을 그대로 채택하되,
  // **판정을 호스트의 `path`에 맡기지 않는다.** `path.relative`/`isAbsolute`는 플랫폼
  // 구현이라 POSIX 호스트가 `C:\Users\...`를 받으면 "절대경로가 아니고 부모를
  // 탈출하지도 않는다"고 답한다(round 1 실측).
  //
  // 그래서 (1) 형태로 먼저 거르고, (2) 입력의 형태에 맞는 `path` 구현으로 계산한다.
  // 상대 입력도 `..`가 **어디에 있든** 걸러 `externalKey`로 보낸다 — 선행 `../`만
  // 보면 `a/../../b`가 통과해 부모를 탈출하는 키가 만들어진다(round 2 실측).
  function redactPath(abs) {
    if (!abs) return null;
    const raw = String(abs);

    // URL 형태는 경로가 아니다 — 어떤 flavour로도 relative를 계산하면 안 된다.
    if (URL_SCHEME_RE.test(raw)) return externalKey(raw);

    const rawWinAbs = WIN_ABS_RE.test(raw);
    const rawRooted = raw.charAt(0) === '/' || raw.charAt(0) === '\\';

    // 절대경로가 아니면 이미 상대다. 구분자만 정규화하고, 탈출 세그먼트가 하나라도
    // 있으면 repo 밖으로 본다.
    if (!rawWinAbs && !rawRooted) {
      const segs = raw.split(/[\\/]/);
      if (segs.indexOf('..') !== -1) return externalKey(raw);
      return segs.filter((p) => p !== '' && p !== '.').join('/') || externalKey(raw);
    }

    // 입력과 repoRoot의 형태가 다르면 같은 트리일 수 없다.
    const rootWinAbs = WIN_ABS_RE.test(repoRoot);
    if (rawWinAbs !== rootWinAbs) return externalKey(raw);

    const impl = rawWinAbs ? path.win32 : path.posix;
    const rel = impl.relative(repoRoot, raw);
    if (rel === '') return '.';                       // repo 루트 자신
    if (rel && rel !== '..' && !rel.startsWith('..' + impl.sep) && !rel.startsWith('../')
        && !impl.isAbsolute(rel) && !WIN_ABS_RE.test(rel)) {
      return rel.split(/[\\/]/).join('/');
    }
    return externalKey(raw);
  }

  // 한 문자열이 잔여 규칙에 걸리는지 본다. **매치 원문은 돌려주지 않는다** — 길이만.
  function matchRule(s) {
    for (let i = 0; i < RESIDUAL_PATTERNS.length; i++) {
      const p = RESIDUAL_PATTERNS[i];
      p.re.lastIndex = 0;
      const m = p.re.exec(s);
      if (m) return { rule: p.name, length: m[0].length };
    }
    return null;
  }

  // 산출 전체를 훑어 잔여 절대경로를 찾는다.
  //
  // **반환은 배열이 아니라 `{hits, truncated}`다.** 빈 배열 하나로 "깨끗함"과
  // "상한에 걸려 못 봤음"을 동시에 표현하면 후자가 전자로 읽히고, 그것이 곧
  // `redaction_ok=true` 오봉인이다. 호출자는 `hits.length === 0 && !truncated`
  // 일 때만 통과시켜야 한다.
  //
  // **반환값은 경로 원문을 싣지 않는다**(round 2). `hits[i]`는 `{at, rule, length}`
  // 이고 매치 텍스트는 없다. 이 배열의 유일한 용도가 `redaction_ok:false`의 진단을
  // 산출에 stamp하는 것이므로, 원문을 실으면 redaction 실패를 보고하는 행위 자체가
  // 유출을 완성한다(CI artifact는 `if: always()`로 업로드된다). 라벨의 객체 키도
  // 같은 이유로 규칙에 걸리거나 지나치게 길면 서수로 대체한다.
  //
  // 객체는 **키도 검사한다**. `per_file`처럼 경로를 키로 쓰는 맵이 산출에 있고,
  // 값만 훑으면 그 경로는 구조적으로 보이지 않는다.
  //
  // 미순회 축(`Map`/`Set`/`Error`/`toJSON`)은 위 RESIDUAL_PATTERNS 주석의 backlog
  // 목록에 있다 — 이 함수는 own enumerable key만 본다.
  function scanResidual(value) {
    const hits = [];
    let truncated = false;

    const walk = (v, at, depth) => {
      if (hits.length >= MAX_HITS) return;
      if (depth > MAX_DEPTH) { truncated = true; return; }
      if (typeof v === 'string') {
        const m = matchRule(v);
        if (m) hits.push({ at: at, rule: m.rule, length: m.length });
        return;
      }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, at + '[' + i + ']', depth + 1)); return; }
      if (v && typeof v === 'object') {
        Object.keys(v).forEach((k, i) => {
          const km = matchRule(k);
          // 키가 규칙에 걸리거나 너무 길면 라벨에 원문을 싣지 않는다.
          const label = (km || k.length > MAX_LABEL_KEY) ? at + '.{key:' + i + '}' : at + '.' + k;
          if (km) hits.push({ at: label, rule: km.rule, length: km.length });
          walk(v[k], label, depth + 1);
        });
      }
    };

    walk(value, '$', 0);
    return { hits: hits, truncated: truncated };
  }

  // `repoRoot`는 **반환하지 않는다** — 원문 절대경로이고, 위 두 주석이 세운
  // "반환 표면은 경로를 싣지 않는다" 규칙의 예외가 될 이유가 없다. 필요한 caller는
  // 자기가 넘긴 `opts.repoRoot`를 이미 갖고 있다.
  return {
    redactText,
    redactPath,
    scanResidual,
    ruleCount: rules.length,
    degraded: degraded,
  };
}

module.exports = { createRedactor, RESIDUAL_PATTERNS, MAX_DEPTH, MAX_HITS };
