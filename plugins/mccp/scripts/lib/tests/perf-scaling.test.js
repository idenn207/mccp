'use strict';

// gate-guard-integrity M2 축 A — `judgeScaling` 부정 케이스.
//
// 합성 측정치만 쓴다. wall-clock에 의존하지 않으므로 이 파일의 단언은 머신 부하와
// 무관하게 결정적이다 — 그것이 판정을 순수 함수로 떼어낸 이유 자체다.

const test = require('node:test');
const assert = require('node:assert');

const { judgeScaling, DEFAULT_SLACK } = require('../perf-scaling');

test('judgeScaling: linear scaling passes, quadratic scaling is rejected', () => {
  // N=10 → 100 에서 선형은 ratio≈10, 상한은 linear*slack = 20.
  const lin = judgeScaling({ small: { n: 10, ms: 10 }, large: { n: 100, ms: 100 } });
  assert.strictEqual(lin.ok, true, 'linear growth must pass: ' + lin.reason);
  assert.strictEqual(lin.ratio, 10);
  assert.strictEqual(lin.linearRatio, 10);

  // 2차는 ratio≈100 > 20.
  const quad = judgeScaling({ small: { n: 10, ms: 10 }, large: { n: 100, ms: 1000 } });
  assert.strictEqual(quad.ok, false, 'quadratic growth must be rejected');
  assert.strictEqual(quad.ratio, 100);
  assert.match(quad.reason, /super-linear/);
});

test('judgeScaling: the boundary is inclusive at exactly linear*slack', () => {
  const at = judgeScaling({ small: { n: 10, ms: 10 }, large: { n: 100, ms: 200 } });
  assert.strictEqual(at.ok, true, 'ratio == limit is inside the budget');
  const just = judgeScaling({ small: { n: 10, ms: 10 }, large: { n: 100, ms: 201 } });
  assert.strictEqual(just.ok, false, 'one tick over the limit fails');
});

test('judgeScaling: a tighter slack rejects growth the default would allow', () => {
  const m = { small: { n: 10, ms: 10 }, large: { n: 100, ms: 150 } };
  assert.strictEqual(judgeScaling(m).ok, true);
  assert.strictEqual(judgeScaling(Object.assign({ slack: 1 }, m)).ok, false);
  assert.strictEqual(DEFAULT_SLACK, 2, 'the documented default must stay 2');
});

test('judgeScaling: small.ms = 0 is unmeasurable, NOT a pass', () => {
  // 분해능 아래로 내려간 순간 이 축이 조용히 꺼지면 안 된다. 0으로 나눈
  // Infinity 를 통과시키거나 "빠르니 ok"로 읽는 구현을 이 단언이 거른다.
  const r = judgeScaling({ small: { n: 10, ms: 0 }, large: { n: 100, ms: 5 } });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /unmeasurable/);
  assert.strictEqual(r.ratio, null, 'no ratio may be reported from a zero denominator');
});

test('judgeScaling: malformed input is fail-closed', () => {
  assert.strictEqual(judgeScaling().ok, false);
  assert.strictEqual(judgeScaling({}).ok, false);
  assert.strictEqual(judgeScaling({ small: { n: 10, ms: 1 }, large: { n: 10, ms: 2 } }).ok, false,
    'large.n must exceed small.n or the ratio means nothing');
  assert.strictEqual(judgeScaling({ small: { n: 10, ms: -1 }, large: { n: 100, ms: 2 } }).ok, false);
  assert.strictEqual(judgeScaling({ small: { n: 10, ms: 1 }, large: { n: 100, ms: NaN } }).ok, false);
  assert.strictEqual(judgeScaling({ small: { n: 10, ms: 1 }, large: { n: 100, ms: 2 }, slack: 0 }).ok, false);
});
