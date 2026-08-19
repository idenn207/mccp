'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sub = require('../subscription');

// Silence the loud fail-open stderr warns during intentional invariant-violation
// tests so the runner output stays clean.
function silent(fn) {
  const orig = process.stderr.write;
  process.stderr.write = function () { return true; };
  try { return fn(); } finally { process.stderr.write = orig; }
}

// v1.29.1 — 공유 규약(env-contract/value.js)으로 이관하면서 수용 집합이 넓어졌다.
// `yes`/`true`/`enabled`는 예전에는 무시됐지만 지금은 ON이다. 이 토글은 리뷰 게이트를
// 약화하는 축이 아니라 비용 모델 전환이라 `bool` kind이고, DD1의 별칭 집합을 그대로
// 받는다. 예전 동작을 여기서 그대로 두면 test가 구 어휘를 고정해 이관을 되돌리게 된다.
test('isSubscriptionMode — DD1 별칭 집합 전량 true; off 계열과 미설정은 false', () => {
  const wrapped = (v) => silent(() => sub.isSubscriptionMode({ MCCP_SUBSCRIPTION: v }));
  for (const v of ['1', 'on', 'ON', 'On', ' on ', 'true', 'yes', 'enabled', 'TRUE']) {
    assert.equal(wrapped(v), true, String(v));
  }
  for (const v of ['', '0', 'off', 'false', 'no', 'disabled', 'OFF', undefined]) {
    assert.equal(wrapped(v), false, String(v));
  }
  // 열거 밖 값은 레지스트리 default(off)로 되돌아간다 — 오타가 비용 모델을 바꾸지 않는다.
  assert.equal(wrapped('onn'), false, 'typo falls back to the registry default');
  assert.equal(sub.isSubscriptionMode({}), false);
  assert.equal(sub.isSubscriptionMode(undefined), false);
});

test('parseOverflowThresholds — defaults when unset', () => {
  const t = sub.parseOverflowThresholds({});
  assert.deepEqual(t, { contextWarnPct: 35, contextCriticalPct: 25, toolWarn: 0, toolCritical: 0 });
});

test('parseOverflowThresholds — valid context override', () => {
  const t = sub.parseOverflowThresholds({
    MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT: '40',
    MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT: '30',
  });
  assert.equal(t.contextWarnPct, 40);
  assert.equal(t.contextCriticalPct, 30);
});

test('parseOverflowThresholds — invalid context invariant → default context', () => {
  const t = silent(() => sub.parseOverflowThresholds({
    MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT: '20',   // warn < critical → violates
    MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT: '30',
  }));
  assert.equal(t.contextWarnPct, 35);
  assert.equal(t.contextCriticalPct, 25);
});

test('parseOverflowThresholds — tool axis default disabled', () => {
  const t = sub.parseOverflowThresholds({});
  assert.equal(t.toolWarn, 0);
  assert.equal(t.toolCritical, 0);
});

test('parseOverflowThresholds — valid tool override', () => {
  const t = sub.parseOverflowThresholds({
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN: '100',
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL: '200',
  });
  assert.equal(t.toolWarn, 100);
  assert.equal(t.toolCritical, 200);
});

test('parseOverflowThresholds — invalid tool invariant → disabled', () => {
  const t = silent(() => sub.parseOverflowThresholds({
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN: '300',
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL: '200', // warn > critical
  }));
  assert.equal(t.toolWarn, 0);
  assert.equal(t.toolCritical, 0);
});

test('evaluateOverflow — no signal → fail-open green (signal-unknown)', () => {
  const r = sub.evaluateOverflow({ thresholds: sub.DEFAULT_THRESHOLDS });
  assert.equal(r.tier, 'green');
  assert.equal(r.overflow, false);
  assert.equal(r.reason, sub.REASONS.SIGNAL_UNKNOWN);
});

test('evaluateOverflow — null signal explicitly → fail-open green', () => {
  const r = sub.evaluateOverflow({ contextRemainingPct: null, toolCount: null, thresholds: sub.DEFAULT_THRESHOLDS });
  assert.equal(r.tier, 'green');
  assert.equal(r.reason, sub.REASONS.SIGNAL_UNKNOWN);
});

test('evaluateOverflow — context critical', () => {
  const r = sub.evaluateOverflow({ contextRemainingPct: 20, thresholds: sub.DEFAULT_THRESHOLDS });
  assert.equal(r.tier, 'critical');
  assert.equal(r.overflow, true);
  assert.equal(r.reason, sub.REASONS.CONTEXT_CRITICAL);
});

test('evaluateOverflow — context critical boundary (== critical pct)', () => {
  const r = sub.evaluateOverflow({ contextRemainingPct: 25, thresholds: sub.DEFAULT_THRESHOLDS });
  assert.equal(r.tier, 'critical');
});

test('evaluateOverflow — context warning', () => {
  const r = sub.evaluateOverflow({ contextRemainingPct: 30, thresholds: sub.DEFAULT_THRESHOLDS });
  assert.equal(r.tier, 'warning');
  assert.equal(r.overflow, false);
  assert.equal(r.reason, sub.REASONS.CONTEXT_WARNING);
});

test('evaluateOverflow — context green above warn', () => {
  const r = sub.evaluateOverflow({ contextRemainingPct: 60, thresholds: sub.DEFAULT_THRESHOLDS });
  assert.equal(r.tier, 'green');
  assert.equal(r.reason, sub.REASONS.GREEN);
});

test('evaluateOverflow — tool axis disabled → tool count ignored, fail-open', () => {
  const r = sub.evaluateOverflow({ toolCount: 100000, thresholds: sub.DEFAULT_THRESHOLDS });
  assert.equal(r.tier, 'green');
  assert.equal(r.reason, sub.REASONS.SIGNAL_UNKNOWN);
});

test('evaluateOverflow — tool critical when enabled', () => {
  const th = sub.parseOverflowThresholds({
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN: '100',
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL: '200',
  });
  const r = sub.evaluateOverflow({ toolCount: 250, thresholds: th });
  assert.equal(r.tier, 'critical');
  assert.equal(r.reason, sub.REASONS.TOOL_CRITICAL);
});

test('evaluateOverflow — most-severe axis wins (context critical over tool green)', () => {
  const th = sub.parseOverflowThresholds({
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN: '100',
    MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL: '200',
  });
  const r = sub.evaluateOverflow({ contextRemainingPct: 10, toolCount: 5, thresholds: th });
  assert.equal(r.tier, 'critical');
  assert.equal(r.reason, sub.REASONS.CONTEXT_CRITICAL);
});
