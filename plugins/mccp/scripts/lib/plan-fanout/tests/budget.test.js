'use strict';

// plan-fanout budget validate — mode × PRD-mode × cost-tier decision tree.
// live-activation M1: default FIRING flipped ON (opt-out), missing cost-state
// fails OPEN by default (COST_FAILOPEN) with the =0 kill switch restoring the old
// fail-closed COST_STATE_UNKNOWN. The former off/fail-closed asserts are preserved
// as opt-out/kill-switch cases.
//
// live-activation M3 — the OPERATIONAL USD block is retired, so several M1
// assertions here are deliberately INVERTED (mirror of implement-dispatch/tests/
// budget.test.js): hard_ceiling and a critical tier now FIRE by default (they only
// skip under usdBomb or an explicit tier override), the catastrophic-USD ceiling is
// the replacement bomb detector, and the runaway clamp applies to EVERY run path.

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

// M3 — the operational USD block is RETIRED by default (mirror of resolveFleet).
test('M3: hard_ceiling_reached → RUNS by default (operational USD retired)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: ceiling });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('M3: usdBomb=true → hard_ceiling skips again (M1 restore)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: ceiling, usdBomb: true });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.HARD_CEILING);
});

test('M3: sticky $186.92 critical + hard_ceiling → RUNS (the dogfood blocker)', function () {
  const sticky = function () {
    return { cost_usd: 186.92, threshold_tier: 'critical', hard_ceiling_reached: true };
  };
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: sticky, catastrophicUsd: 500 });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.fleetSize, FLEET_SIZE);

  const restored = resolveFanout({
    env: {}, prdMode: true, costStateRead: sticky, catastrophicUsd: 500, usdBomb: true,
  });
  assert.equal(restored.run, false);
  assert.equal(restored.reason, REASONS.HARD_CEILING);
});

// ── catastrophic-USD — the replacement bomb detector (Codex F1) ───────────────

test('M3: cost_usd >= catastrophicUsd → skip CATASTROPHIC_USD', function () {
  const r = resolveFanout({
    env: {}, prdMode: true, catastrophicUsd: 500,
    costStateRead: function () { return { cost_usd: 600, threshold_tier: 'critical' }; },
  });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.CATASTROPHIC_USD);
  assert.equal(r.tier, 'critical');
});

test('M3: catastrophic fires at the exact boundary, and $186 stays under it', function () {
  const at = resolveFanout({
    env: {}, prdMode: true, catastrophicUsd: 500,
    costStateRead: function () { return { cost_usd: 500, threshold_tier: 'critical' }; },
  });
  assert.equal(at.reason, REASONS.CATASTROPHIC_USD, '>= is inclusive');

  const under = resolveFanout({
    env: {}, prdMode: true, catastrophicUsd: 500,
    costStateRead: function () { return { cost_usd: 186.92, threshold_tier: 'critical' }; },
  });
  assert.equal(under.run, true, 'operational spend well below catastrophic must fire');
});

test('M3: catastrophic applies even under usdBomb (independent axis)', function () {
  const r = resolveFanout({
    env: {}, prdMode: true, catastrophicUsd: 500, usdBomb: true,
    costStateRead: function () { return { cost_usd: 600, threshold_tier: 'green' }; },
  });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.CATASTROPHIC_USD);
});

test('M3: catastrophicUsd absent/0 disables the ceiling (no accidental block)', function () {
  const r = resolveFanout({
    env: {}, prdMode: true,
    costStateRead: function () { return { cost_usd: 99999, threshold_tier: 'green' }; },
  });
  assert.equal(r.run, true, 'an un-injected ceiling must not silently block');
});

// ── tier autoDisable — M3 default EMPTY ───────────────────────────────────────

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

test('M3: critical tier → RUNS by default (autoDisable default now EMPTY)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: critical });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('M3: usdBomb=true → critical tier skips again (M1 restore)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: critical, usdBomb: true });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_CRITICAL);
});

test('M3: AUTODISABLE_TIER=critical override → re-blocks even with usdBomb off', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT_AUTODISABLE_TIER: 'critical' },
    prdMode: true, costStateRead: critical,
  });
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

// M3 (Codex F2) — INVERTED from M1: the cap governs every run path now.
test('M3: runaway clamp IS applied on the metered (cost-state present) path', function () {
  let called = false;
  const r = resolveFanout({
    env: {}, prdMode: true, costStateRead: green,
    runawayClamp: function () { called = true; return { n: 1, degraded: true, reason: 'runaway-clamp' }; },
  });
  assert.equal(called, true, 'the cap is now the primary backstop — it must govern metered runs too');
  assert.equal(r.fleetSize, 1);
  assert.equal(r.degraded, true);
  assert.equal(r.runawayReason, 'runaway-clamp');
});

test('M3: metered far-from-cap clamp is a no-op (never raises, never degrades)', function () {
  const r = resolveFanout({
    env: {}, prdMode: true, costStateRead: green,
    runawayClamp: function (n) { return { n: n, degraded: false, reason: 'ok' }; },
  });
  assert.equal(r.fleetSize, FLEET_SIZE, 'headroom available → fleet unchanged');
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

  // M3: a recomputed critical no longer blocks by itself, so assert the recompute
  // through a surface that still acts on it (usdBomb restores critical-only).
  const rComputed = resolveFanout({
    env: {}, prdMode: true,
    costStateRead: function () { return { cost_usd: 200 }; },
    tierFor: function (usd) { return usd >= 100 ? 'critical' : 'green'; },
    usdBomb: true,
  });
  assert.equal(rComputed.run, false, 'tierFor recomputes critical → skip under usdBomb');
  assert.equal(rComputed.reason, REASONS.TIER_CRITICAL);

  const rComputedDefault = resolveFanout({
    env: {}, prdMode: true,
    costStateRead: function () { return { cost_usd: 200 }; },
    tierFor: function (usd) { return usd >= 100 ? 'critical' : 'green'; },
  });
  assert.equal(rComputedDefault.run, true, 'M3 default: a recomputed critical still fires');
  assert.equal(rComputedDefault.tier, 'critical', 'tier is still reported honestly');
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

// ── M3 follow-up (PR-Codex R1 F1) — a clamp of 0 must SKIP, not be ignored ────
//
// Mirror of implement-dispatch/tests/budget.test.js. reserveWorkers grants 0 when
// the counter lock is unavailable; the old `c.n >= 1 && c.n < fleet` guard let that
// 0 fall through and kept the FULL fleet. plan.md's inline Pattern Grounding spawns
// no agent, so skipping here never blocks a plan.

const GREEN_CS = function () { return { cost_usd: 1, threshold_tier: 'green', hard_ceiling_reached: false }; };

function fanoutWithClamp(clampN, extra) {
  return resolveFanout(Object.assign({
    env: {}, prdMode: true, costStateRead: GREEN_CS,
    runawayClamp: function () { return { n: clampN, degraded: true, reason: 'lock-exhausted' }; },
  }, extra || {}));
}

test('R1 F1: runawayClamp n=0 → run:false + lock-exhausted (never a fleet)', function () {
  const r = fanoutWithClamp(0);
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.LOCK_EXHAUSTED);
  assert.equal(r.fleetSize, 0);
  assert.equal(r.degraded, true);
});

test('R1 F1: n=0 skips on the metered path too, not just fail-open', function () {
  const sticky = function () { return { cost_usd: 186.92, threshold_tier: 'critical', hard_ceiling_reached: true }; };
  assert.equal(fanoutWithClamp(0, { costStateRead: sticky }).reason, REASONS.LOCK_EXHAUSTED);
  assert.equal(fanoutWithClamp(0, { costStateRead: null }).reason, REASONS.LOCK_EXHAUSTED);
});

test('R1 F1: a normal degrade to 1 still RUNS (only 0 blocks)', function () {
  const r = fanoutWithClamp(1);
  assert.equal(r.run, true);
  assert.equal(r.fleetSize, 1);
  assert.equal(r.degraded, true);
});
