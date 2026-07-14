'use strict';

// plan-fanout budget validate — mode × PRD-mode × cost-tier decision tree.
// live-activation M1: default FIRING flipped ON (opt-out), missing cost-state
// fails OPEN by default (COST_FAILOPEN) with the =0 kill switch restoring the old
// fail-closed COST_STATE_UNKNOWN, tier autoDisable narrowed to critical-only, a
// hard_ceiling bomb-detector skip, and an injected runaway clamp on the fail-open
// path. The former off/fail-closed asserts are preserved as opt-out/kill-switch
// cases.

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveFanout, shouldSkipForBudget, REASONS, FLEET_SIZE } = require('../budget');

function green() { return { cost_usd: 5, threshold_tier: 'green' }; }
function notice() { return { cost_usd: 55, threshold_tier: 'notice' }; }
function warning() { return { cost_usd: 85, threshold_tier: 'warning' }; }
function critical() { return { cost_usd: 105, threshold_tier: 'critical' }; }
function ceiling() { return { cost_usd: 105, threshold_tier: 'green', hard_ceiling_reached: true }; }
function nullState() { return null; }

// ── default-firing flip (opt-out) ─────────────────────────────────────────────

test('mode unset (default ON) + PRD + green → RUN (live-activation flip)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: green });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.fleetSize, FLEET_SIZE);
});

test('mode=off → skip ENV_OFF (explicit opt-out)', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: 'off' }, prdMode: true, costStateRead: green });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.ENV_OFF);
  assert.equal(r.fleetSize, 0);
});

test('mode=0 → skip ENV_OFF (numeric opt-out)', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: '0' }, prdMode: true, costStateRead: green });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.ENV_OFF);
});

test('mode=OFF is case-insensitive and trims', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: '  OFF ' }, prdMode: true, costStateRead: green });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.ENV_OFF);
});

test('non-PRD → skip NOT_PRD_MODE (default-on)', function () {
  const r = resolveFanout({ env: {}, prdMode: false, costStateRead: green });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.NOT_PRD_MODE);
});

// ── cost-state fail-open (default) + kill-switch fail-closed (back-compat) ─────

test('cost-state null (default costFailOpen) → RUN COST_FAILOPEN tier green', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: nullState });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.COST_FAILOPEN);
  assert.equal(r.tier, 'green');
  assert.equal(r.fleetSize, FLEET_SIZE);
});

test('costStateRead throws (default costFailOpen) → RUN COST_FAILOPEN (guarded)', function () {
  const r = resolveFanout({
    env: {}, prdMode: true,
    costStateRead: function () { throw new Error('boom'); },
  });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.COST_FAILOPEN);
});

test('kill switch costFailOpen=false + null → skip COST_STATE_UNKNOWN (back-compat)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: nullState, costFailOpen: false });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

test('kill switch costFailOpen=false + throw → skip COST_STATE_UNKNOWN (back-compat)', function () {
  const r = resolveFanout({
    env: {}, prdMode: true, costFailOpen: false,
    costStateRead: function () { throw new Error('boom'); },
  });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

// ── hard_ceiling bomb detector ────────────────────────────────────────────────

test('hard_ceiling_reached → skip HARD_CEILING regardless of tier', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: ceiling });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.HARD_CEILING);
});

// ── tier autoDisable narrowed to critical-only ────────────────────────────────

test('notice tier → RUNS now (critical-only narrow)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: notice });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.tier, 'notice');
});

test('warning tier → RUNS now (critical-only narrow)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: warning });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.tier, 'warning');
});

test('critical tier → skip TIER_CRITICAL (still a bomb)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: critical });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_CRITICAL);
});

test('AUTODISABLE_TIER="notice,critical" override → notice skips again', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT_AUTODISABLE_TIER: 'notice,critical' },
    prdMode: true, costStateRead: notice,
  });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_NOTICE);
});

// ── runaway clamp (fail-open path only) ───────────────────────────────────────

test('runaway clamp degrades fleetSize on the fail-open path', function () {
  const r = resolveFanout({
    env: {}, prdMode: true, costStateRead: nullState,
    runawayClamp: function () { return { n: 1, degraded: true, reason: 'runaway-clamp' }; },
  });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.COST_FAILOPEN);
  assert.equal(r.fleetSize, 1);
  assert.equal(r.degraded, true);
  assert.equal(r.runawayReason, 'runaway-clamp');
});

test('runaway clamp NOT applied on the normal (cost-state present) path', function () {
  let called = false;
  const r = resolveFanout({
    env: {}, prdMode: true, costStateRead: green,
    runawayClamp: function () { called = true; return { n: 1, degraded: true }; },
  });
  assert.equal(called, false, 'clamp must only fire on the telemetry-absent fail-open branch');
  assert.equal(r.fleetSize, FLEET_SIZE);
  assert.equal(r.degraded, false);
});

test('runaway clamp returning full fleet leaves fleetSize unchanged (no degrade)', function () {
  const r = resolveFanout({
    env: {}, prdMode: true, costStateRead: nullState,
    runawayClamp: function (n) { return { n: n, degraded: false, reason: 'ok' }; },
  });
  assert.equal(r.fleetSize, FLEET_SIZE);
  assert.equal(r.degraded, false);
});

// ── budget knobs ──────────────────────────────────────────────────────────────

test('green tier → RUN, fleetSize 4, minRemaining = 150000 × 4', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true, costStateRead: green });
  assert.equal(r.run, true);
  assert.equal(r.fleetSize, FLEET_SIZE);
  assert.equal(r.minRemaining, 150000 * 4);
});

test('MCCP_PLAN_FANOUT_BUDGET override changes minRemaining', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT_BUDGET: '100000' },
    prdMode: true, costStateRead: green,
  });
  assert.equal(r.minRemaining, 100000 * 4);
});

test('invalid MCCP_PLAN_FANOUT_BUDGET falls back to default (loud fail-open)', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT_BUDGET: 'garbage' },
    prdMode: true, costStateRead: green,
  });
  assert.equal(r.minRemaining, 150000 * 4);
});

// --- budget pre-guard predicate (Codex F2 smoke, pure-logic level) ---

test('shouldSkipForBudget: no budget target (null) → never skip (structural caps govern)', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: null, remaining: 1, minRemaining: 600000 }), false);
  assert.equal(shouldSkipForBudget({ budgetTotal: 0, remaining: 1, minRemaining: 600000 }), false);
});

test('shouldSkipForBudget: target set + remaining < fleet minimum → SKIP (agent() 0 times)', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: 700000, remaining: 100000, minRemaining: 600000 }), true);
});

test('shouldSkipForBudget: target set + remaining covers fleet → run', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: 2000000, remaining: 900000, minRemaining: 600000 }), false);
});

test('shouldSkipForBudget: non-finite remaining treated as 0 → skip when a target is set', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: 700000, minRemaining: 600000 }), true);
});

test('threshold_tier absent → tierFor injection recomputes; else defaults green', function () {
  const rDefault = resolveFanout({
    env: {}, prdMode: true,
    costStateRead: function () { return { cost_usd: 90 }; },
  });
  assert.equal(rDefault.run, true, 'no tierFor + no threshold_tier defaults to green → run');

  const rComputed = resolveFanout({
    env: {}, prdMode: true,
    costStateRead: function () { return { cost_usd: 200 }; },
    tierFor: function (usd) { return usd >= 100 ? 'critical' : 'green'; },
  });
  assert.equal(rComputed.run, false, 'tierFor recomputes critical → skip');
  assert.equal(rComputed.reason, REASONS.TIER_CRITICAL);
});

// --- cost-model-subscription M1 — subscription-path (Task 4) ---
const ON_FANOUT = { MCCP_PLAN_FANOUT: 'on' };
function ctxReadFan(v) { return function () { return v; }; }

test('subscription: context critical -> skip SUBSCRIPTION_OVERFLOW', () => {
  const r = resolveFanout({ env: ON_FANOUT, prdMode: true, subscriptionMode: true, contextStateRead: ctxReadFan({ context_remaining_pct: 20, tool_count: 5 }) });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.SUBSCRIPTION_OVERFLOW);
});

test('subscription: context green -> run (fleetSize 4), bypasses USD cost-state', () => {
  const r = resolveFanout({ env: ON_FANOUT, prdMode: true, subscriptionMode: true, contextStateRead: ctxReadFan({ context_remaining_pct: 70, tool_count: 5 }), costStateRead: () => null });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.fleetSize, FLEET_SIZE);
});

test('subscription: absent context -> fail-open run (Codex F1)', () => {
  const r = resolveFanout({ env: ON_FANOUT, prdMode: true, subscriptionMode: true, contextStateRead: () => null, costStateRead: () => null });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});
