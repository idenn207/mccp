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

test('isSubscriptionMode — 1/on (ci) true; else false', () => {
  for (const v of ['1', 'on', 'ON', 'On', ' on ']) {
    assert.equal(sub.isSubscriptionMode({ MCCP_SUBSCRIPTION: v }), true, String(v));
  }
  for (const v of ['', '0', 'off', 'yes', 'true', undefined]) {
    assert.equal(sub.isSubscriptionMode({ MCCP_SUBSCRIPTION: v }), false, String(v));
  }
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
