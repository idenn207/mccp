'use strict';

// gate-guard-integrity M2 축 A — 자기 정규화 성능 판정 오라클.
//
// 대체 대상은 `derive/tests/perf-budget.test.js`의 절대 wall-clock 단언
// (`elapsed < 1000`)이었다. 그 단언은 **derive의 비용 + 머신 경합**을 함께 잰다 —
// 전수 병렬 실행이 코어 수를 초과해 프로세스를 띄우면 코드가 한 줄도 안 바뀌어도
// 발화한다. 즉 신호가 아니라 잡음을 측정하는 축이 섞여 있었다.
//
// 대신 **같은 fixture를 크기만 바꿔 두 번** 재고 그 비율을 본다. 두 측정이 같은
// 경합을 받으므로 경합이 상쇄되고 남는 것은 알고리즘의 스케일링이다.
//
// 판정을 여기(순수 함수)로 떼어낸 이유는 부정 케이스를 wall-clock 없이 결정적으로
// 단언하기 위해서다 — `design-critique-decide.js`의 `decideCritique` 분리와 같은
// 형태다. 시간 측정은 test가 하고, 판정은 I/O 없는 이 함수가 한다.
//
// **소재지가 lib인 것도 계약이다.** `.test.js`가 오라클을 export하면 소비 경로가
// test 실행 부수효과에 묶인다. 이 파일이 오라클을 소유하고,
// `lib/tests/perf-scaling.test.js`가 그 부정 케이스를 소유한다.
//
// ── 이 대체가 **잡지 못하는 것**(정직한 한정) ────────────────────────────────
// 비율 판정은 **복잡도** 회귀를 잡고 **상수 배수** 회귀는 잡지 못한다. derive가
// 선형을 유지한 채 전체적으로 10배 느려지면 ratio는 그대로라 통과한다. 원 단언은
// 그것을 잡았다. 그래서 소비처는 비율 단언과 별개로 **경합 잡음보다 한참 위**에
// 있는 느슨한 절대 상한을 함께 둔다 — 그 상한은 경합에 발화하지 않을 만큼 크고
// 파국적 상수 폭증에는 발화한다. 두 축은 서로를 대체하지 않는다.

// 선형 대비 허용 계수. N=10→100에서 선형은 ratio≈10이므로 상한은 20이 되고,
// 2차(ratio≈100)는 기각된다. 2는 "선형의 두 배까지는 측정 잡음·상수항으로 본다"는
// 뜻이며, 이 값이 커질수록 2차 회귀 탐지가 늦어진다.
const DEFAULT_SLACK = 2;

function isPositiveFinite(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

// judgeScaling({ small: {n, ms}, large: {n, ms}, slack }) → { ok, ratio, linearRatio, reason }
//
//   linearRatio = large.n / small.n
//   ratio       = large.ms / small.ms
//   ok          = ratio <= linearRatio * slack
//
// `small.ms === 0`(측정 분해능 미만)은 **fail-closed**다. 0으로 나눠 Infinity를
// 만들거나 "빠르니까 통과"로 읽으면, 분해능 아래로 내려간 순간 이 축이 조용히
// 꺼진다 — 통과 신호의 존재가 검사를 의미하지 않게 되는 바로 그 형태다.
function judgeScaling(input) {
  const i = input || {};
  const small = i.small || {};
  const large = i.large || {};
  const slack = i.slack === undefined ? DEFAULT_SLACK : i.slack;

  const base = { ok: false, ratio: null, linearRatio: null };

  if (!isPositiveFinite(slack)) {
    return Object.assign({}, base, { reason: 'invalid-slack' });
  }
  if (!isPositiveFinite(small.n) || !isPositiveFinite(large.n)) {
    return Object.assign({}, base, { reason: 'invalid-sizes' });
  }
  if (large.n <= small.n) {
    return Object.assign({}, base, { reason: 'large.n must exceed small.n for a scaling ratio' });
  }
  if (typeof small.ms !== 'number' || !Number.isFinite(small.ms) || small.ms < 0
      || typeof large.ms !== 'number' || !Number.isFinite(large.ms) || large.ms < 0) {
    return Object.assign({}, base, { reason: 'invalid-durations' });
  }
  const linearRatio = large.n / small.n;
  if (small.ms === 0) {
    return Object.assign({}, base, {
      linearRatio: linearRatio,
      reason: 'unmeasurable (small.ms = 0 — below clock resolution; raise the small fixture size)',
    });
  }

  const ratio = large.ms / small.ms;
  const limit = linearRatio * slack;
  const ok = ratio <= limit;
  return {
    ok: ok,
    ratio: ratio,
    linearRatio: linearRatio,
    reason: ok ? null
      : 'ratio ' + ratio.toFixed(2) + ' exceeds linear*' + slack + ' = ' + limit.toFixed(2)
        + ' (super-linear scaling between n=' + small.n + ' and n=' + large.n + ')',
  };
}

module.exports = {
  judgeScaling: judgeScaling,
  DEFAULT_SLACK: DEFAULT_SLACK,
};
