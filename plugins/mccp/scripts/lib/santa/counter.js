'use strict';

// santa/counter — 순수 캡 oracle (santa-loop-materialize M1 / Task 1).
//
// 디스크를 모른다. env 문자열 하나와 "지금까지 몇 라운드 열렸는가" 하나만 받아
// 다음 라운드를 열어도 되는지 답한다. 라운드 수의 단일 출처는 `ledger`이고
// (DD1 — 상태는 하나여야 한다), 여기는 그 수를 **인자로** 받는다. counter가
// 자기 카운터를 들면 즉시 drift하므로 그 필드는 존재하지 않는다.
//
// mirror: orchestration-runaway.js:145 `parseMaxAgents`(env 파싱 + 범위 검사 +
// 불량값 loud fail-open) · :231 `clampForRunaway`(인자만으로 결정하는 순수 판정).

const ENV_CAP = 'MCCP_SANTA_ROUND_CAP';
const DEFAULT_CAP = 3;
const MIN_CAP = 1;
const MAX_CAP = 10;

// exitReason enum — DD10대로 camelCase 필드에 담기는 값. 'cap_reached'는
// CLI exit 12와 1:1이고, 그 12는 **cap 전용**이다(다른 실패에 재사용 금지).
const REASONS = { OK: null, CAP_REACHED: 'cap_reached' };

function warn(line) {
  process.stderr.write('[mccp:santa-counter] ' + line + '\n');
}

// parseCap(env) → [MIN_CAP..MAX_CAP] 정수. 불량값은 loud fail-open to default.
//
// 상한을 두는 이유: 캡은 리뷰어 토큰의 지출 한도라 "무제한"이 유효한 값이 아니다.
// 하한이 1인 이유: 0을 허용하면 santa-loop이 아무것도 리뷰하지 않고 통과하는
// 조용한 kill switch가 되어, 게이트가 있다는 사실 자체가 거짓이 된다.
function parseCap(env) {
  const raw = env && env[ENV_CAP];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_CAP;
  }
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < MIN_CAP || n > MAX_CAP) {
    warn(ENV_CAP + ' must be an integer in [' + MIN_CAP + '..' + MAX_CAP + ']; got "' +
      raw + '". Falling back to default ' + DEFAULT_CAP + '.');
    return DEFAULT_CAP;
  }
  return n;
}

// decideRound({ roundsSoFar, cap }) → { allowed, roundIndex, exitReason }
//
// roundIndex는 0-based이고 거부 시 null이다 — 거부에 인덱스를 실어 보내면
// 호출자가 그 값으로 `record --round N`을 시도할 수 있고, 그것이 DD11이 막는
// 바로 그 경로다. 값을 주지 않는 편이 오용면을 줄인다.
function decideRound(opts) {
  opts = opts || {};
  const cap = (Number.isInteger(opts.cap) && opts.cap >= MIN_CAP) ? opts.cap : DEFAULT_CAP;
  const roundsSoFar = (Number.isInteger(opts.roundsSoFar) && opts.roundsSoFar >= 0)
    ? opts.roundsSoFar : 0;

  if (roundsSoFar >= cap) {
    return { allowed: false, roundIndex: null, exitReason: REASONS.CAP_REACHED };
  }
  return { allowed: true, roundIndex: roundsSoFar, exitReason: REASONS.OK };
}

module.exports = {
  parseCap: parseCap,
  decideRound: decideRound,
  ENV_CAP: ENV_CAP,
  DEFAULT_CAP: DEFAULT_CAP,
  MIN_CAP: MIN_CAP,
  MAX_CAP: MAX_CAP,
  REASONS: REASONS,
};
