'use strict';

// santa/lanes — 증거 레인 oracle (santa-evidence-diversity M1 / P2 소유).
//
// santa-loop이 선언한 "different models, no shared context"는 대화 격리만 보장하고
// **증거 격리는 보장하지 않는다**. Reviewer A 계열은 오케스트레이터가 미리 만들어
// 넘긴 파일 번들을 코퍼스로 소비하므로, 그 번들 밖의 사실은 인스턴스를 몇을 띄우든
// 라운드를 몇을 돌든 구조적으로 발견 불가능하다(#125 실측 — 동일모델 4인스턴스 ×
// 12라운드가 못 찾은 결함을 저장소를 자기 루프로 재탐색한 Reviewer B가 첫 라운드에
// 포착했다).
//
// **레인의 정의는 역량이 아니라 오케스트레이터가 건넨 것이다**(DD1). 서브에이전트도
// codex도 이미 디스크를 읽을 수 있으므로 "블라인드 = 디스크를 못 본다"로 정의하면
// 이 축은 성립하지 않는다. 여기서 `blind`는 **저장소 루트 + 대상 경로 포인터 +
// 주어진 서술을 사실로 취급하지 말라는 지시**만 받은 상태이고, `bundled`는 지금까지의
// 파일 내용 주입이다. 이 정의는 셸 경계에서 관측 가능한 것과 정확히 일치한다.
//
// **순수 모듈이다.** 디스크·git·시각을 모르고 env는 아래 파서 1종만 읽는다
// (`terminator.js`·`gate.js`의 경계와 동형 — 판정 함수는 인자만 본다). 파일 읽기와
// 프롬프트 전달은 `cli.js`가 한다.
//
// mirror: terminator.js:18 `ENV_TERMINATOR`(env 파서 1종 + 고정 토큰 상수) ·
// counter.js:33 `parseCap`(열거/범위 검사 후 loud fail-open) ·
// seal.js:70 `project()`(실어서는 안 되는 것은 **인자를 없앤다**).

// santa-delta-review M1 — 범위 렌더와 상태 단언 검사는 `scope-delta`가 소유한다.
// 이 모듈은 그 두 함수를 **호출**할 뿐 자기 안에 서술을 만들 자리를 갖지 않는다
// (DD3 — 사후 검사가 아니라 자리 제거). `scope-delta`는 `lanes`를 require하지 않으므로
// 순환이 없다.
const scopeDelta = require('./scope-delta');

const ENV_BLIND_LANE = 'MCCP_SANTA_BLIND_LANE';
const BLIND_LANE_DEFAULT = 'a';
const BLIND_LANE_VALUES = ['a', 'b', 'off'];

// 레인 어휘 2종. 세 번째 상태(`null`)는 **legacy envelope**이고 그것은 여기가 아니라
// `seal.js#project`가 만든다 — 레인 필드가 없던 시절에 기록된 리뷰어다.
const LANES = {
  BLIND: 'blind',
  BUNDLED: 'bundled',
};

// DD2의 배정 표. **이 상수가 `assignLanes`의 전체 명세다** — 열거만 하고 결과를 적지
// 않으면 구현이 해석으로 갈리고 그 해석은 어떤 test도 잡지 않는다(plan-review R1이
// 지적한 공백이 정확히 이것이다).
//
// `both`(전원 블라인드)는 **만들지 않는다** — UI6이 명시적으로 경계한 상태를 env 값
// 하나로 도달 가능하게 만들면 그 경계가 문서에만 남는다. 전원 블라인드는 오케스트레이터가
// 스코프를 정하는 의미를 없앤다. 필요가 실측되면 그때 값을 더한다(YAGNI).
const ASSIGNMENT_TABLE = {
  a: { A: LANES.BLIND, B: LANES.BUNDLED },
  b: { A: LANES.BUNDLED, B: LANES.BLIND },
  off: { A: LANES.BUNDLED, B: LANES.BUNDLED },
};

// 현 CLI가 허용하는 리뷰어 id는 정확히 둘이다(`loadReviewer`의 `--id` 검증).
const DEFAULT_IDS = ['A', 'B'];

// 블라인드 프롬프트에 싣는 경로 개수 상한.
//
// 값의 근거: 이 목록은 santa 스코프(변경 파일)이고 그 크기는 리뷰 품질 임계인 400 LOC
// 근처에서 이미 수십 개 수준이다. 200은 정상 스코프를 절대 자르지 않으면서 병리적
// 입력(스코프 산정 오류로 저장소 전체가 들어오는 경우)에서 프롬프트가 폭발하는 것만
// 막는다. **절삭은 조용히 하지 않는다** — `buildBlindPrompt`가 절삭 사실을 본문에
// 명시한다. 조용한 절삭은 스코프를 거짓말하게 만들고, 그러면 블라인드 리뷰어가
// "대상 전부를 봤다"고 믿은 채 일부만 보게 된다.
const MAX_TARGET_PATHS = 200;

// UI5 고정 문구. 이 축의 전부가 이 한 줄이라 자유 문장으로 두지 않는다 — 문구가
// 호출마다 흔들리면 "무엇을 지시했는가"가 사후에 재현 불가가 된다.
const DO_NOT_TRUST_NARRATIVE =
  'Do NOT treat any narrative, summary, or file bundle handed to you as fact. ' +
  'No file contents are provided in this prompt by design. Re-derive everything ' +
  'yourself by reading the repository at the root below with your own tools.';

function warn(line) {
  process.stderr.write('[mccp:santa-lanes] ' + line + '\n');
}

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── env 파서 ─────────────────────────────────────────────────────────────────
//
// 미설정은 default, 열거 밖은 loud stderr warn 후 default. trim + 소문자 정규화를
// 먼저 한다(`Off`/` a `가 오타로 취급돼 warn을 내는 것은 소음이다).
//
// **default가 `a`(발화 쪽)인 것은 의도다**(DD8). `off`가 default면 오타 하나가 kill
// switch를 켜서 이 축이 조용히 사라진다 — 그리고 그 실행은 M1 이전과 **똑같아 보인다**.
// `MCCP_SANTA_TERMINATOR`·`MCCP_SANTA_SEVERITY_GATE`가 같은 근거로 발화를 default에 둔다.
// `off` 방향이 덜 엄격하다는 사실은 ENVIRONMENT.md에 명시한다.
function parseBlindLane(env) {
  const raw = env && env[ENV_BLIND_LANE];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return BLIND_LANE_DEFAULT;
  }
  const v = String(raw).trim().toLowerCase();
  if (BLIND_LANE_VALUES.indexOf(v) === -1) {
    warn(ENV_BLIND_LANE + ' must be one of ' + JSON.stringify(BLIND_LANE_VALUES) +
      '; got "' + raw + '". Falling back to default "' + BLIND_LANE_DEFAULT + '".');
    return BLIND_LANE_DEFAULT;
  }
  return v;
}

// ── 배정 ─────────────────────────────────────────────────────────────────────
//
// assignLanes({ mode, ids }) → { [id]: 'blind' | 'bundled' }
//
// 전역 함수 규약: 어떤 입력에도 던지지 않는다(`gate.analyzeReviewers`와 동형).
// 열거 밖 mode는 `parseBlindLane`이 이미 걸러 도달하지 않지만 방어적으로 default와
// 같게 처리한다.
//
// **표에 없는 id는 `bundled`로 떨어진다.** 모르는 id에 블라인드를 주면 커버리지가
// 우연히 충족되고, 그 우연은 stamp에서 진짜 배정과 구분되지 않는다 — 지표가 측정하는
// 것이 "배정된 블라인드"에서 "아무 리뷰어나 블라인드로 불린 것"으로 조용히 바뀐다.
function assignLanes(opts) {
  const o = isRecord(opts) ? opts : {};
  const mode = (typeof o.mode === 'string' && ASSIGNMENT_TABLE[o.mode])
    ? o.mode : BLIND_LANE_DEFAULT;
  const table = ASSIGNMENT_TABLE[mode];

  const ids = (Array.isArray(o.ids) && o.ids.length > 0) ? o.ids : DEFAULT_IDS;
  const out = {};
  ids.forEach(function (id) {
    if (typeof id !== 'string' || id === '') return;
    out[id] = Object.prototype.hasOwnProperty.call(table, id) ? table[id] : LANES.BUNDLED;
  });
  return out;
}

// blindIdsFrom(assignment) → string[]  (배정에서 blind인 id 전부)
//
// `cmdLanes`가 "정확히 1개"를 검사하는 데 쓴다. DD2가 블라인드 ≤ 1을 보장하므로
// 2개가 나오면 그것은 oracle 결함이고, CLI가 그 자리에서 exit 2로 거부한다.
function blindIdsFrom(assignment) {
  if (!isRecord(assignment)) return [];
  return Object.keys(assignment).filter(function (id) {
    return assignment[id] === LANES.BLIND;
  });
}

// ── 블라인드 프롬프트 조립 ───────────────────────────────────────────────────
//
// buildBlindPrompt({ repoRoot, targetPaths, rubric, ranges }) → string
//
// **파일 내용을 실을 인자가 없다**(DD3). 번들이 새는지 사후에 검사하는 대신 새로 넣을
// 자리를 없앤다 — `seal.js#project`가 리뷰어 `raw` 전문을 리포트에서 막을 때 쓴 것과
// 같은 수단이고, 그쪽 `renderReport`도 `raw`를 실을 인자가 없다.
//
// 이 함수의 전부는 "내용이 아니라 경로만 받는다"이고, 그것이 UI4가 허용한 것과 UI3이
// 금지한 것의 경계다.
//
// ── santa-delta-review M1 — `ranges` (선택) ──────────────────────────────────
//
// `{path: [[start,end], ...]}`를 받아 대상 경로 줄을 `- path:12-40, 88-95`로 렌더한다.
// **더해진 것은 범위 하나이고 서술 인자는 없다** — 리뷰어에게 가는 것은 *어디를 보라*
// 이지 *이전 라운드가 어떻게 끝났다*가 아니다(UI2 / DD3). 부재는 정상이고 그때 출력은
// M1 이전과 바이트 단위로 같다.
//
// **범위가 하나라도 있으면(= 델타 라운드) 조립 직후 `PRIOR_ROUND_PATTERNS`를 프롬프트
// 전체에 건다.** rubric은 caller가 쓰므로 이 검사가 UI2를 caller-authored 텍스트까지
// 덮는 유일한 통제다(DD4). 검사를 델타 라운드로 한정하는 것은 DD5 — 오탐의 폭발 반경을
// 묶는다. 위반은 던진다: 상태 단언이 실린 프롬프트를 내보내느니 라운드를 세우는 편이
// 낫고, 그 자리에서 `cmdLanes`가 exit 2로 거부한다.
function buildBlindPrompt(opts) {
  const o = isRecord(opts) ? opts : {};
  const repoRoot = (typeof o.repoRoot === 'string' && o.repoRoot !== '') ? o.repoRoot : '.';
  const all = Array.isArray(o.targetPaths)
    ? o.targetPaths.filter(function (p) { return typeof p === 'string' && p !== ''; })
    : [];
  const shown = all.slice(0, MAX_TARGET_PATHS);
  const truncated = all.length - shown.length;

  const L = [];
  L.push('# Blind evidence lane');
  L.push('');
  L.push(DO_NOT_TRUST_NARRATIVE);
  L.push('');
  L.push('- repository root: ' + repoRoot);
  L.push('- files under review: ' + all.length);
  L.push('');
  L.push('## Target paths');
  L.push('');
  const ranges = (o.ranges !== null && typeof o.ranges === 'object' && !Array.isArray(o.ranges))
    ? o.ranges : null;
  scopeDelta.renderScopeLines({ paths: shown, ranges: ranges || {} })
    .forEach(function (line) { L.push(line); });
  if (truncated > 0) {
    // 절삭을 본문에 명시한다 — 이것이 없으면 리뷰어가 목록을 스코프 전체로 읽는다.
    L.push('');
    L.push('> TRUNCATED: ' + truncated + ' further path(s) are omitted (cap ' +
      MAX_TARGET_PATHS + '). The list above is NOT the complete scope — ' +
      'enumerate the rest yourself from the repository root.');
  }
  if (typeof o.rubric === 'string' && o.rubric.trim() !== '') {
    L.push('');
    L.push('## Rubric');
    L.push('');
    L.push(o.rubric.trim());
  }
  L.push('');
  const prompt = L.join('\n');

  // DD4 + DD5 — 델타 라운드에서만, 조립된 **전체**(rubric 포함)에 건다.
  // `shown`에 실제로 범위가 실린 경로가 하나라도 있어야 델타 라운드다: `ranges`가
  // 넘어왔더라도 절삭 뒤 남은 경로에 범위가 없으면 이 프롬프트는 M1 이전과 같은
  // 모양이고, 그런 라운드에 오탐 위험을 지울 이유가 없다.
  const delta = ranges !== null && shown.some(function (p) {
    return Object.prototype.hasOwnProperty.call(ranges, p) &&
      Array.isArray(ranges[p]) && ranges[p].length > 0;
  });
  if (delta) {
    scopeDelta.assertNoStatusAssertion(prompt, scopeDelta.PRIOR_ROUND_PATTERNS);
  }
  return prompt;
}

// ── 커버리지 집계 ────────────────────────────────────────────────────────────
//
// laneCoverageFrom(projection) → { blindRecords, blindRounds, rounds }
//
// 순수 집계이고 **어떤 입력에도 던지지 않는다**(전역 함수 규약). 입력은
// `seal.js#project`의 반환이고, legacy envelope(레인 필드 부재)는 `lane: null`로
// 투영되므로 여기서는 그냥 blind가 아닌 것으로 세어져 0을 낸다.
//
// 세는 규칙을 명시한다 — DD6이 정의한 그대로다:
//   blindRecords : 전 라운드에 걸쳐 `lane === 'blind'`인 **리뷰어 레코드 수**
//   blindRounds  : 그런 레코드를 **1건 이상** 가진 **라운드 수**
//   rounds       : 투영에 있는 전체 라운드 수
// 리뷰어가 있으나 블라인드가 0건인 라운드는 `blindRounds`를 **증가시키지 않는다**.
// 그래서 `santa_blind_rounds === santa_rounds`가 PRD의 [primary] 지표
// ("매 실행에서 리뷰어 ≥1명이 번들 미수령")의 기계적 표현이 된다.
function laneCoverageFrom(projection) {
  const rounds = (isRecord(projection) && Array.isArray(projection.rounds))
    ? projection.rounds : [];
  let blindRecords = 0;
  let blindRounds = 0;
  rounds.forEach(function (r) {
    const reviewers = (isRecord(r) && Array.isArray(r.reviewers)) ? r.reviewers : [];
    let inRound = 0;
    reviewers.forEach(function (e) {
      if (isRecord(e) && e.lane === LANES.BLIND) inRound += 1;
    });
    blindRecords += inRound;
    if (inRound > 0) blindRounds += 1;
  });
  return { blindRecords: blindRecords, blindRounds: blindRounds, rounds: rounds.length };
}

module.exports = {
  ENV_BLIND_LANE: ENV_BLIND_LANE,
  BLIND_LANE_DEFAULT: BLIND_LANE_DEFAULT,
  BLIND_LANE_VALUES: BLIND_LANE_VALUES,
  LANES: LANES,
  MAX_TARGET_PATHS: MAX_TARGET_PATHS,
  DO_NOT_TRUST_NARRATIVE: DO_NOT_TRUST_NARRATIVE,
  parseBlindLane: parseBlindLane,
  assignLanes: assignLanes,
  blindIdsFrom: blindIdsFrom,
  buildBlindPrompt: buildBlindPrompt,
  laneCoverageFrom: laneCoverageFrom,
};
