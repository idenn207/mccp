'use strict';

// santa/scope-always — 상시 스코프 oracle (santa-evidence-diversity M2 / P2 소유).
//
// 리뷰 스코프가 `git diff`인 한, **두 문서의 관계**인 불변식(계획이 단언하는 마일스톤
// 수·회부 건수가 지금 워킹트리의 PRD와 맞는가)은 PRD가 diff에 없을 때 구조적으로
// 검증 불가다 — #125가 실측한 결함이 정확히 그것이다. 이 모듈은 **현재 decision의
// plan과 그 plan이 스스로 선언한 Source PRD**를 diff 여부와 무관하게 스코프에 넣을 수
// 있도록 판정만 제공한다. 리뷰어 수는 늘리지 않는다(UI2) — 바뀌는 것은 *무엇이
// 스코프에 들어가는가* 하나다.
//
// **순수 모듈이다.** 디스크·git·시각을 모르고 env는 아래 파서 1종만 읽는다
// (`lanes.js`·`terminator.js`·`gate.js`의 경계와 동형). 파일 읽기·디렉토리 열거·
// 존재 확인은 전부 `cli.js#cmdScopeAlways`가 진다(DD2 — CLI는 후보를 낼 뿐 주입하지
// 못하고, `SCOPE_PATHS_JSON`의 생산자는 여전히 `santa-loop.md` Step 1이다).
//
// mirror: lanes.js:26-70(env 파서 1종 + 고정 문구 상수 + 조용하지 않은 절삭) ·
// derive/sources/plans.js:18-30(Source PRD 정규식 2종 + `stripWrap`).
//
// **왜 재사용이 아니라 미러인가**: `derive/sources/plans.js`를 require하면 이 순수
// oracle이 `fs`와 `PLAN_DIRS`를 끌어오고 santa 모듈군의 외부 의존 목록이 늘어난다.
// 가져오는 것은 정규식 2개와 8줄짜리 헬퍼뿐이므로 미러가 싸다. 원본이 바뀌면 이
// 주석이 재검토 지점이다.

const path = require('path');

const ENV_ALWAYS_SCOPE = 'MCCP_SANTA_ALWAYS_SCOPE';
const ALWAYS_SCOPE_DEFAULT = 'enforce';
const ALWAYS_SCOPE_VALUES = ['enforce', 'off'];

// 상시 항목의 개수 상한. 이 목록은 "decision 범위의 관계 폐포"(DD1)이고 실측 크기는
// plan 1~2개 + PRD 1개다. 40은 정상 폐포를 절대 자르지 않으면서, slug 매칭이 예상 밖으로
// 넓어졌을 때 번들 리뷰어의 컨텍스트가 폭발하는 것만 막는다. **절삭은 조용히 하지
// 않는다** — `mergeScope`가 `truncated` 수를 내고 호출자가 그것을 표면화한다.
const MAX_ALWAYS_PATHS = 40;

// UI4·UI5 고정 문구. 축의 전부가 이 한 문단이라 자유 문장으로 두지 않는다 — 문구가
// 호출마다 흔들리면 "무엇을 지시했는가"가 사후에 재현 불가가 된다
// (`DO_NOT_TRUST_NARRATIVE`와 같은 취급).
//
// 핵심은 **워킹트리의 PRD를 다시 읽으라**는 지시다. plan이 본문에 적어 둔 PRD 요약을
// 근거로 삼으면 대조가 성립하지 않는다 — 불일치는 정확히 그 요약과 실제 PRD 사이에서
// 생기기 때문이다.
const CONSISTENCY_RUBRIC =
  'Plan/PRD consistency (always-on scope): for each plan and Source PRD pair listed ' +
  'in the target paths, re-read BOTH files from the current working tree with your ' +
  'own tools. Do NOT rely on any summary of the PRD written inside the plan — the ' +
  'mismatch you are looking for lives precisely between that summary and the real ' +
  'file. Check that the milestone identifiers, the milestone count, and the counts ' +
  'of deferred/open items the plan asserts all match the PRD as it exists right now. ' +
  'Any mismatch is CRITICAL, and its locations MUST name both files.';

function warn(line) {
  process.stderr.write('[mccp:santa-scope-always] ' + line + '\n');
}

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── env 파서 ─────────────────────────────────────────────────────────────────
//
// 미설정은 default, 열거 밖은 loud stderr warn 후 default. trim + 소문자 정규화를 먼저
// 한다(`Off`/` enforce `가 오타로 취급돼 warn을 내는 것은 소음이다).
//
// **default가 `enforce`(발화 쪽)인 것은 의도다**(DD8). `off`가 default면 오타 하나가
// kill switch를 켜고 **그 실행이 M2 이전과 똑같아 보인다** — 상시 스코프가 0건 추가된
// 라운드는 정상 실행과 구분되지 않는다. `MCCP_SANTA_BLIND_LANE`·`MCCP_SANTA_TERMINATOR`가
// 같은 근거로 발화를 default에 둔다. `off` 방향이 덜 엄격하다는 비대칭은 ENVIRONMENT.md에
// 명시한다. 던지지 않는다.
function parseAlwaysScope(env) {
  const raw = env && env[ENV_ALWAYS_SCOPE];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return ALWAYS_SCOPE_DEFAULT;
  }
  const v = String(raw).trim().toLowerCase();
  if (ALWAYS_SCOPE_VALUES.indexOf(v) === -1) {
    warn(ENV_ALWAYS_SCOPE + ' must be one of ' + JSON.stringify(ALWAYS_SCOPE_VALUES) +
      '; got "' + raw + '". Falling back to default "' + ALWAYS_SCOPE_DEFAULT + '".');
    return ALWAYS_SCOPE_DEFAULT;
  }
  return v;
}

// ── Source PRD 추출 ──────────────────────────────────────────────────────────

// derive/sources/plans.js:18-21의 두 정규식을 그대로 미러한다. 링크 형태 우선, 실패 시
// 평문 형태(백틱 path 포함).
const SOURCE_PRD_LINK_RE = /\*\*Source PRD\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/;
const SOURCE_PRD_PLAIN_RE = /\*\*Source PRD\*\*:[ \t]*(.+?\.prd\.md)[ \t\x60'"\]>)]*$/m;

// derive/sources/plans.js:26-28 동형. 백틱·인용부호·꺾쇠를 벗긴다.
function stripWrap(s) {
  return String(s == null ? '' : s).trim().replace(/^[`'"<[]+|[`'">\]]+$/g, '').trim();
}

// 경로 문자열을 repo 상대 posix 형태로 정규화하거나, 저장소를 벗어날 수 있는 형태면
// `null`을 낸다. **export한다** — CLI의 발견 단계가 후보 경로를 같은 규칙으로 접어야
// `pairs`의 표기와 `paths`의 표기가 갈리지 않는다(code-review L2).
//
// **이 함수가 이 모듈의 보안 경계다**(implement-gate security review, CRITICAL 1).
// `sourcePrdFrom`은 순수 함수라 `fs.realpathSync`로 방어할 수 없다 — 그래서 거부는
// **문자열 단계에서** 끝나야 한다. `path.posix.normalize('../../etc/passwd')`는
// `../../etc/passwd` 그대로이므로 정규화만으로는 아무것도 막히지 않는다. 도달했을 때의
// 폭발 반경이 "임의 파일 내용이 블라인드 리뷰어 프롬프트에 실린다"라서, 애매한 입력은
// 전부 `null`로 접는다.
function toRepoRelative(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  // NUL은 파일시스템 계층에서 절단을 일으킬 수 있고 경로 성분으로 정당한 쓰임이 없다.
  if (raw.indexOf('\0') !== -1) return null;
  // 윈도우 구분자를 posix로 접은 뒤 posix 규칙 하나로만 판정한다 — 두 규칙을 섞으면
  // 어느 쪽에서도 안 걸리는 형태가 생긴다.
  const unified = raw.replace(/\\/g, '/');
  // 절대경로 3형태: posix 루트 · UNC(`//host/share`) · 드라이브 문자(`C:/`).
  if (unified.charAt(0) === '/') return null;
  if (/^[A-Za-z]:/.test(unified)) return null;
  const norm = path.posix.normalize(unified);
  // 정규화 **후에** 판정한다. 정규화 전 검사는 `a/../../x`처럼 접힌 뒤에야 드러나는
  // 이탈을 놓친다.
  if (norm === '..' || norm.indexOf('../') === 0 || norm.indexOf('/../') !== -1) return null;
  if (norm === '' || norm === '.' || norm === '/') return null;
  if (norm.charAt(0) === '/') return null;
  return norm.replace(/^\.\//, '');
}

// plan 본문에서 그 plan이 **스스로 선언한** Source PRD 경로를 repo 상대로 낸다.
// 미선언(free-form plan)·판독 불가·이탈 형태는 전부 `null`이며 던지지 않는다 —
// free-form plan은 정상 입력이고, 그 드롭이 라운드를 막아서는 안 된다(DD4).
//
// `planPath`는 링크가 plan 기준 상대경로(`../prds/x.prd.md`)일 때만 쓴다. 그 형태인데
// `planPath`가 없으면 기준점이 없으므로 `null`이다 — 저장소 루트 기준으로 추측하면
// 존재하지 않는 포인터를 만들어 낸다.
function sourcePrdFrom(planText, opts) {
  if (typeof planText !== 'string' || planText === '') return null;
  const o = isRecord(opts) ? opts : {};
  const planPath = typeof o.planPath === 'string' ? o.planPath : '';

  const link = planText.match(SOURCE_PRD_LINK_RE);
  const raw = link ? stripWrap(link[2]) : (function () {
    const plain = planText.match(SOURCE_PRD_PLAIN_RE);
    return plain ? stripWrap(plain[1]) : '';
  }());
  if (!raw) return null;
  if (raw.indexOf('\0') !== -1) return null;

  const unified = raw.replace(/\\/g, '/');
  // plan 기준 상대 표기(`./` `../`)만 planPath로 환원한다. 그 외는 repo 상대 표기로
  // 읽는다 — 이 저장소의 plan은 두 형태를 모두 쓴다(PRD 표는 링크 + `../`, plan 머리말은
  // 백틱 + repo 상대).
  if (unified.indexOf('./') === 0 || unified.indexOf('../') === 0) {
    const base = toRepoRelative(planPath);
    if (base === null) return null;
    const dir = path.posix.dirname(base);
    return toRepoRelative(path.posix.join(dir === '.' ? '' : dir, unified));
  }
  return toRepoRelative(unified);
}

// ── 스코프 병합 ──────────────────────────────────────────────────────────────

// diff 스코프에 상시 항목을 합친다. diff 순서를 보존하고 상시 항목을 뒤에 append하며,
// 중복 제거는 정규화된 posix 경로 기준이다. `added`는 diff에 없던 상시 항목만 담는다.
//
// 상한 초과는 **조용히 자르지 않는다** — 잘린 수를 `truncated`로 내고 호출자가 그것을
// 표면화한다(lanes.js `buildBlindPrompt`의 `TRUNCATED:` 줄과 같은 취급). 상한은 상시
// 항목에만 걸린다: diff 스코프를 자르는 것은 이 축의 소관이 아니다.
//
// **드롭도 조용히 하지 않는다**(code-review M4). `toRepoRelative`가 접는 입력은 스코프에서
// 사라지는데, diff 쪽에서 그 일이 생기면 그것은 "변경된 파일이 검토 대상에서 빠졌다"이고
// 절삭보다 나쁘다. 정규화에 실패한 **원본 문자열**을 `dropped`로 내고 호출자가 표면화한다
// — 중복 제거로 사라진 것은 담지 않는다(그쪽은 손실이 아니다).
function mergeScope(opts) {
  const o = isRecord(opts) ? opts : {};
  const diffRaw = Array.isArray(o.diffPaths) ? o.diffPaths : [];
  const alwaysRaw = Array.isArray(o.alwaysPaths) ? o.alwaysPaths : [];

  const seen = Object.create(null);
  const paths = [];
  const dropped = [];
  diffRaw.forEach(function (p) {
    const n = toRepoRelative(p);
    if (n === null) { dropped.push(typeof p === 'string' ? p : JSON.stringify(p)); return; }
    if (seen[n]) return;
    seen[n] = true;
    paths.push(n);
  });

  const candidates = [];
  alwaysRaw.forEach(function (p) {
    const n = toRepoRelative(p);
    if (n === null) { dropped.push(typeof p === 'string' ? p : JSON.stringify(p)); return; }
    if (seen[n]) return;
    // 상시 후보 안에서의 중복도 같은 표로 제거한다 — 먼저 본 것만 남긴다.
    seen[n] = true;
    candidates.push(n);
  });

  const added = candidates.slice(0, MAX_ALWAYS_PATHS);
  const truncated = candidates.length - added.length;
  added.forEach(function (p) { paths.push(p); });

  return { paths: paths, added: added, truncated: truncated, dropped: dropped };
}

module.exports = {
  ENV_ALWAYS_SCOPE: ENV_ALWAYS_SCOPE,
  ALWAYS_SCOPE_DEFAULT: ALWAYS_SCOPE_DEFAULT,
  ALWAYS_SCOPE_VALUES: ALWAYS_SCOPE_VALUES,
  MAX_ALWAYS_PATHS: MAX_ALWAYS_PATHS,
  CONSISTENCY_RUBRIC: CONSISTENCY_RUBRIC,
  parseAlwaysScope: parseAlwaysScope,
  toRepoRelative: toRepoRelative,
  sourcePrdFrom: sourcePrdFrom,
  mergeScope: mergeScope,
};
