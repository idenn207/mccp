'use strict';

// santa/terminator — patch-chasing 종료 oracle (santa-adjudication M3 / P1 소유).
//
// 라운드 N의 수정이 라운드 N+1의 표적이 되어 루프가 자연 종료하지 않는 것을
// 끝내는 축이다. **판정은 리뷰어가 하지 않는다**(UI10) — 리뷰어는 대조 가능한
// 사실(파일·라인)만 내고, 그것을 직전 패치의 hunk 범위와 대조해 여기서 분류한다.
// 자기 선언을 받으면 위조 비용이 0이고, 그 선언은 **루프를 끝내는 권한**이라
// M1이 `failure_scenario` 자기 선언을 거부한 것과 같은 이유로 거부한다.
//
// **순수 모듈이다.** 디스크·git·시각을 모르고 env는 아래 파서 1종만 읽는다
// (`adjudication.js`·`gate.js`의 경계와 동형 — 판정 함수는 인자만 본다).
// git 호출과 hunk 추출은 `cli.js`가 하고 여기는 그 결과(`patchRanges`)를 받는다.
//
// mirror: adjudication.js:68 `parseEnum`(env 파싱 + 열거 검사 + loud fallback) ·
// gate.js:312 `analyzeReviewers`(전역 함수 — 어떤 입력에도 던지지 않는다).

const ENV_TERMINATOR = 'MCCP_SANTA_TERMINATOR';
const TERMINATOR_DEFAULT = 'enforce';
const TERMINATOR_VALUES = ['enforce', 'off'];

// 종료 사유 열거 — M3 이후 정확히 2값이고 부재(`null`)가 세 번째 상태다(DD1).
// `cap_reached`는 `ledger.beginRound`의 거부 분기가 쓰고(무변경), `patch_chasing`은
// `ledger.terminate`가 쓴다. 두 값이 **한 집합**에 사는 이유는 `ledger.js`의
// 읽기 검증(`assertTerminationMarker`)과 쓰기가 같은 어휘를 봐야 하기 때문이다 —
// 쓰기만 넓히면 마커 직후의 첫 `read()`가 `SANTA_LEDGER_CORRUPT`로 던져 그 slug의
// 원장이 통째로 읽히지 않는다(DD2 한 커밋 불변식).
const EXIT_REASON = {
  CAP_REACHED: 'cap_reached',
  PATCH_CHASING: 'patch_chasing',
};

// 분류 3종(DD3). **`targets`는 계산된 판정이고 `locations`가 그 입력이다** —
// 리뷰어가 주는 것은 위치뿐이고 이 어휘는 집계 단계만 쓴다.
const TARGETS = {
  ROUND_N_PATCH: 'round_n_patch',
  PREEXISTING: 'preexisting',
  UNKNOWN: 'unknown',
};

// "라운드 2 이후"를 0-based index >= 1로 읽는다(DD6). index >= 2로 읽으면 기본 캡
// 3에서 terminator가 **마지막으로 허용된 라운드에서만** 판정할 수 있는데, 그 뒤는
// 어차피 캡이 끝내고 `capAllowsAnotherRound` 항이 그 경우를 배제하므로 기본 설정의
// terminator가 구조적으로 절대 발화하지 않는다. index 0에 직전 패치가 없다는
// 기계적 필요조건과도 일치한다.
const MIN_ROUND = 1;

// 리뷰어 입력 상한. 절삭은 **정규화이지 판정이 아니므로** 반환에 흔적을 남기지
// 않는다 — 남기면 소비자가 그 값에 분기할 자리가 생기고, 위치 표기 개수가 판정에
// 영향을 주기 시작한다.
const MAX_LOCATIONS = 20;
const MAX_FILE_CHARS = 300;

// 미발화 사유 토큰. **사람이 읽는 짧은 문자열이되 값이 고정된다** — Task 3의
// kill-switch 계약이 `off`에서 정확히 `'env-off'`를 요구하므로 자유 문장을 쓸 수
// 없고, 하이픈 토큰은 어느 항이 막았는지를 그대로 지목한다(항목 69·85).
const NO_FIRE = {
  ENV_OFF: 'env-off',
  ROUND_BELOW_MIN: 'round-below-min',
  NO_EFFECTIVE_BLOCKING: 'no-effective-blocking',
  NOT_ALL_ROUND_N_PATCH: 'not-all-round-n-patch',
  CAP_WOULD_END_THIS_RUN: 'cap-would-end-this-run',
};

function warn(line) {
  process.stderr.write('[mccp:santa-terminator] ' + line + '\n');
}

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── env 파서 ─────────────────────────────────────────────────────────────────
//
// 미설정은 default, 열거 밖(대소문자 불일치 포함)은 loud stderr warn 후 default.
//
// **default가 `enforce`인 것은 완화 방향이고 그것을 숨기지 않는다**(DD10). 같은
// 모듈군의 `MCCP_SANTA_ADJUDICATION_GATE`는 default가 엄격한 쪽이라 이 비대칭이
// 없었는데, terminator는 반대다 — `off`가 더 엄격하다(루프가 캡까지 돈다).
// 그럼에도 `enforce`를 default로 두는 이유는 셋이다: (1) default가 `off`면 M3은
// 다크 배송이고 PRD가 측정하겠다는 "자연 종료 비율"의 분자가 구조적으로 0이 된다,
// (2) 오타가 kill switch를 켜지 않는 방향이 유지된다(끈 줄 알았는데 켜져 있는
// 상태가 아니라 켠 줄 알았는데 켜져 있는 상태다), (3) 되돌리는 비용이 낮다 —
// 운영자가 동의하지 않으면 `off`로 같은 slug를 재개하면 `beginRound`가 마커를 지운다.
function parseTerminator(env) {
  const raw = env && env[ENV_TERMINATOR];
  if (raw === undefined || raw === null || String(raw).trim() === '') return TERMINATOR_DEFAULT;
  const v = String(raw).trim();
  if (TERMINATOR_VALUES.indexOf(v) === -1) {
    warn(ENV_TERMINATOR + ' must be one of [' + TERMINATOR_VALUES.join('|') + ']; got "' +
      raw + '". Falling back to default ' + TERMINATOR_DEFAULT + '.');
    return TERMINATOR_DEFAULT;
  }
  return v;
}

// ── normalizeLocations ───────────────────────────────────────────────────────
//
// **전역 함수 — 어떤 입력에도 던지지 않는다.** 리뷰어 JSON에서 온 비신뢰 입력이
// 유일한 인자이고, 여기서 던지면 위치 표기 오류 하나가 `deriveFinding` 전체를
// 죽여 **실재 blocking을 지운다**(DD3 — `evidence`의 선례와 같은 방향).
//
// 반환 원소는 `{file, line}` 2키 고정이고 `line`은 양의 정수이거나 `null`이다.
// 키를 생략하지 않는 이유는 소비자가 `'line' in loc`과 `loc.line === null`을
// 구별할 필요가 없게 하기 위해서다 — 둘 다 "라인 미지정"이라는 같은 뜻이다.
//
// **입력 배열을 변형하지 않는다**(항목 63). 상한에 도달하면 순회를 멈추므로
// 거대한 배열이 비용을 만들지도 않는다.
function normalizeLocations(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let i = 0; i < raw.length && out.length < MAX_LOCATIONS; i++) {
    const el = raw[i];
    if (!isRecord(el)) continue;
    const file = el.file;
    if (typeof file !== 'string' || file.length < 1 || file.length > MAX_FILE_CHARS) continue;
    const line = el.line;
    out.push({
      file: file,
      line: (Number.isInteger(line) && line > 0) ? line : null,
    });
  }
  return out;
}

// ── classifyTarget ───────────────────────────────────────────────────────────
//
// DD11의 표. **전역 함수**다.
//
//   locations 없음/빈 배열        → 'unknown'
//   patchRanges 빈 집합           → 'unknown'
//   모든 location이 patch에 속함  → 'round_n_patch'
//   하나라도 patch 밖             → 'preexisting'
//
// "patch에 속한다"는 `file`이 patch의 파일 집합에 있고, `line`이 주어졌으면 그
// 파일의 hunk 범위 중 하나에 들어가는 것이다. `line`이 없으면 **파일 단위 일치로
// 충분하다** — 라인을 요구하면 대부분의 지적이 `unknown`으로 떨어져 terminator가
// 사실상 죽고, 파일 단위 일치는 약한 주장이지만 전량 조건(DD5) 아래에서만 쓰이므로
// 단독으로 종료를 만들지 못한다.
//
// `patchRanges[file]`이 **빈 배열**인 것은 "파일은 손댔지만 추가 라인이 없다"는
// 뜻이다(삭제 전용 hunk). 그 파일에 라인을 지정한 지적은 어느 범위에도 못 들어가
// `preexisting`이 된다 — 지워진 라인을 겨누는 지적은 존재할 수 없으므로 안전한
// 쪽이다. 그 구분을 읽기 위해 파일 집합과 범위를 두 자료구조로 나누지 않는다.
function classifyTarget(input) {
  const o = isRecord(input) ? input : {};
  const locations = normalizeLocations(o.locations);
  if (locations.length === 0) return TARGETS.UNKNOWN;

  const ranges = isRecord(o.patchRanges) ? o.patchRanges : null;
  if (ranges === null || Object.keys(ranges).length === 0) return TARGETS.UNKNOWN;

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    // `patchRanges`는 `Object.create(null)`로 만들어지지만(cli.js — 경로가
    // `__proto__`인 파일이 own property를 잃지 않게), 손으로 만든 리터럴이
    // 들어올 수도 있으므로 own-property 검사를 우회하지 않는다.
    if (!Object.prototype.hasOwnProperty.call(ranges, loc.file)) return TARGETS.PREEXISTING;
    if (loc.line === null) continue;
    const spans = Array.isArray(ranges[loc.file]) ? ranges[loc.file] : [];
    let hit = false;
    for (let j = 0; j < spans.length; j++) {
      const s = spans[j];
      if (Array.isArray(s) && Number.isInteger(s[0]) && Number.isInteger(s[1]) &&
          loc.line >= s[0] && loc.line <= s[1]) {
        hit = true;
        break;
      }
    }
    if (!hit) return TARGETS.PREEXISTING;
  }
  return TARGETS.ROUND_N_PATCH;
}

// ── decideTermination ────────────────────────────────────────────────────────
//
// DD5의 AND 5항. 셋은 fail-closed이고 하나(`capAllowsAnotherRound`)는 지표를
// 정직하게 만든다.
//
//   terminate ⟺  mode === 'enforce'
//              ∧ round >= minRound
//              ∧ effectiveBlocking.length > 0
//              ∧ classified.every(c => c.target === 'round_n_patch')
//              ∧ capAllowsAnotherRound
//
// **전량 조건이 읽는 것은 `classified`이지 입력 행이 아니다.** 입력 blocking 행에는
// `target`/`targets` 키가 **존재하지 않는다** — 리뷰어가 준 `locations`와 집계가
// 낸 분류를 한 객체에 섞으면 DD3의 분리가 이름만 남는다. 그래서 이 함수는 입력을
// 읽기만 하고 어떤 행도 변형하지 않는다(항목 72가 그 비변형을 단언한다).
//
// `length > 0`을 따로 세우는 이유는 빈 배열에 `every`가 참이 되기 때문이다.
// blocking 0건 라운드는 NICE이고 루프의 정상 종료는 이미 그쪽이라, 그 라운드를
// `patch_chasing`으로 봉인하면 수렴을 종료로 오기록한다.
//
// `capAllowsAnotherRound`는 안전이 아니라 **정직성**이다: 캡이 이미 끝낼 run을
// terminator가 자기 공으로 가져가면 "자연 종료 비율"이 부풀고 두 종료 사유가
// 배타가 아니게 되어 분포가 무의미해진다. terminator는 자기가 실제로 줄인 run만
// 주장한다.
function decideTermination(input) {
  const o = isRecord(input) ? input : {};
  // `mode`는 파서가 준 값이다. `'enforce'`가 아닌 모든 값(부재 포함)은 미발화
  // 쪽으로 접는다 — 오라클이 자기 default를 들면 판정 자리가 둘이 된다(DD7).
  const enforcing = o.mode === 'enforce';
  const blocking = Array.isArray(o.effectiveBlocking) ? o.effectiveBlocking : [];
  const patchRanges = isRecord(o.patchRanges) ? o.patchRanges : {};
  const round = Number.isInteger(o.round) ? o.round : -1;
  const minRound = Number.isInteger(o.minRound) ? o.minRound : MIN_ROUND;
  const capAllows = o.capAllowsAnotherRound === true;

  const classified = blocking.map(function (b) {
    const row = isRecord(b) ? b : {};
    return {
      issueId: (typeof row.issueId === 'string' && row.issueId) ? row.issueId : null,
      target: classifyTarget({ locations: row.locations, patchRanges: patchRanges }),
    };
  });

  const targetsBreakdown = { round_n_patch: 0, preexisting: 0, unknown: 0 };
  classified.forEach(function (c) { targetsBreakdown[c.target] += 1; });

  // 미해결 항목(DD9 (1)) — 발화 여부와 무관하게 항상 낸다. 발화했으면 이것이
  // 종료 시점의 미해결 목록이고, 아니면 그 라운드의 blocking 그대로다.
  const unresolved = blocking.map(function (b, i) {
    const row = isRecord(b) ? b : {};
    return {
      issueId: classified[i].issueId,
      severity: typeof row.severity === 'string' ? row.severity : null,
      claim: typeof row.claim === 'string' ? row.claim : '',
      targets: classified[i].target,
    };
  });

  let reason = null;
  if (!enforcing) reason = NO_FIRE.ENV_OFF;
  else if (round < minRound) reason = NO_FIRE.ROUND_BELOW_MIN;
  else if (blocking.length === 0) reason = NO_FIRE.NO_EFFECTIVE_BLOCKING;
  else if (targetsBreakdown.round_n_patch !== classified.length) reason = NO_FIRE.NOT_ALL_ROUND_N_PATCH;
  else if (!capAllows) reason = NO_FIRE.CAP_WOULD_END_THIS_RUN;

  const terminate = reason === null;
  return {
    terminate: terminate,
    exitReason: terminate ? EXIT_REASON.PATCH_CHASING : null,
    reason: reason,
    classified: classified,
    targetsBreakdown: targetsBreakdown,
    unresolved: unresolved,
  };
}

module.exports = {
  parseTerminator: parseTerminator,
  normalizeLocations: normalizeLocations,
  classifyTarget: classifyTarget,
  decideTermination: decideTermination,
  ENV_TERMINATOR: ENV_TERMINATOR,
  TERMINATOR_DEFAULT: TERMINATOR_DEFAULT,
  TERMINATOR_VALUES: TERMINATOR_VALUES,
  EXIT_REASON: EXIT_REASON,
  TARGETS: TARGETS,
  MIN_ROUND: MIN_ROUND,
  MAX_LOCATIONS: MAX_LOCATIONS,
  MAX_FILE_CHARS: MAX_FILE_CHARS,
  NO_FIRE: NO_FIRE,
};
