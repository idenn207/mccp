'use strict';

// fleet budget validate — mode × merge-strategy × cost-tier × budget decision
// tree. live-activation M1: default FIRING flipped ON (opt-out), missing
// cost-state fails OPEN by default (COST_FAILOPEN) with the =0 kill switch
// restoring the old fail-closed COST_STATE_UNKNOWN.
//
// live-activation M3 — the OPERATIONAL USD block is retired, so several M1
// assertions here are deliberately INVERTED: hard_ceiling and a critical tier now
// FIRE by default (they only skip under usdBomb or an explicit tier override), the
// catastrophic-USD ceiling is the replacement bomb detector, and the runaway clamp
// applies to EVERY run path rather than only the fail-open branch. The
// merge-strategy + single-partition + budget-cap gates are UNCHANGED (structural
// safety preserved).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveFleet, shouldSkipForBudget, REASONS,
  MAX_WORKERS_DEFAULT, MIN_PER_WORKER_DEFAULT, ENABLING_MERGE_STRATEGY,
} = require('../budget');

const ON = { MCCP_WORK_IMPLEMENT_PARALLEL: '1' };
function green() { return { cost_usd: 5, threshold_tier: 'green' }; }
function notice() { return { cost_usd: 55, threshold_tier: 'notice' }; }
function warning() { return { cost_usd: 85, threshold_tier: 'warning' }; }
function critical() { return { cost_usd: 105, threshold_tier: 'critical' }; }
function ceiling() { return { cost_usd: 105, threshold_tier: 'green', hard_ceiling_reached: true }; }
function nullState() { return null; }

function ok(over) {
  return Object.assign({
    env: ON, mergeStrategy: ENABLING_MERGE_STRATEGY, requestedN: 3, costStateRead: green,
  }, over || {});
}

// ── gate 1: parallel opt-in (default ON — opt-out) ────────────────────────────

test('mode unset (default ON) → runs (live-activation flip)', function () {
  const r = resolveFleet({ env: {}, mergeStrategy: ENABLING_MERGE_STRATEGY, requestedN: 3, costStateRead: green });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('mode=off / mode=0 → skip ENV_OFF (explicit opt-out)', function () {
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: 'off' } })).reason, REASONS.ENV_OFF);
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: '0' } })).reason, REASONS.ENV_OFF);
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: '  OFF ' } })).reason, REASONS.ENV_OFF);
});

test('mode accepts "1" and case-insensitive "on" (still on)', function () {
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1' } })).run, true);
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: ' ON ' } })).run, true);
});

// ── gate 2: merge-strategy structural gate (Task 0 / Codex F3) — UNCHANGED ─────

test('merge_strategy=disable-parallel → skip MERGE_STRATEGY_DISABLED (Task 0 measured)', function () {
  const r = resolveFleet(ok({ mergeStrategy: 'disable-parallel' }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.MERGE_STRATEGY_DISABLED);
  assert.equal(r.n, 1);
});

test('merge_strategy=same-worktree → still skip (A2 forbidden until protection ships)', function () {
  const r = resolveFleet(ok({ mergeStrategy: 'same-worktree' }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.MERGE_STRATEGY_DISABLED);
});

test('merge_strategy absent → skip (fail-closed default)', function () {
  const r = resolveFleet(ok({ mergeStrategy: null }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.MERGE_STRATEGY_DISABLED);
});

test('merge_strategy=worktree-merge unlocks parallel (only enabling value)', function () {
  const r = resolveFleet(ok());
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

// ── gate 3: single-partition short-circuit — UNCHANGED ────────────────────────

test('requestedN=1 → skip SINGLE_PARTITION (nothing to parallelize)', function () {
  const r = resolveFleet(ok({ requestedN: 1 }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.SINGLE_PARTITION);
});

test('invalid requestedN falls back to 1 → SINGLE_PARTITION', function () {
  const r = resolveFleet(ok({ requestedN: 0 }));
  assert.equal(r.reason, REASONS.SINGLE_PARTITION);
});

// ── gate 4: cost-state fail-open (default) + kill-switch fail-closed ───────────

test('cost-state null (default costFailOpen) → RUN COST_FAILOPEN tier green', function () {
  const r = resolveFleet(ok({ costStateRead: nullState }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.COST_FAILOPEN);
  assert.equal(r.tier, 'green');
});

test('costStateRead throws (default costFailOpen) → RUN COST_FAILOPEN (guarded)', function () {
  const r = resolveFleet(ok({ costStateRead: function () { throw new Error('boom'); } }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.COST_FAILOPEN);
});

test('kill switch costFailOpen=false + null → skip COST_STATE_UNKNOWN (back-compat)', function () {
  const r = resolveFleet(ok({ costStateRead: nullState, costFailOpen: false }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

test('kill switch costFailOpen=false + throw → skip COST_STATE_UNKNOWN (back-compat)', function () {
  const r = resolveFleet(ok({ costFailOpen: false, costStateRead: function () { throw new Error('boom'); } }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

// ── gate 5: hard_ceiling bomb detector ────────────────────────────────────────

// M3 — the operational USD block is RETIRED by default. This is the milestone's
// whole point: the measured dogfood state (sticky $186.92 + hard_ceiling) was
// skipping every dispatch, so the flip only ever fired on machines with no
// cost-state at all.
test('M3: hard_ceiling_reached → RUNS by default (operational USD retired)', function () {
  const r = resolveFleet(ok({ costStateRead: ceiling }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('M3: usdBomb=true → hard_ceiling skips again (M1 restore)', function () {
  const r = resolveFleet(ok({ costStateRead: ceiling, usdBomb: true }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.HARD_CEILING);
});

// The measured dogfood state, end to end: sticky critical AND hard_ceiling at
// $186.92 must fire under the M3 default and skip under the kill switch.
test('M3: sticky $186.92 critical + hard_ceiling → RUNS (the dogfood blocker)', function () {
  const sticky = function () {
    return { cost_usd: 186.92, threshold_tier: 'critical', hard_ceiling_reached: true };
  };
  const r = resolveFleet(ok({ costStateRead: sticky, catastrophicUsd: 500 }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.n, 3);

  const restored = resolveFleet(ok({ costStateRead: sticky, catastrophicUsd: 500, usdBomb: true }));
  assert.equal(restored.run, false);
  assert.equal(restored.reason, REASONS.HARD_CEILING);
});

// ── gate 6: cost-tier autoDisable — M3 default EMPTY ──────────────────────────

test('notice tier → RUNS now (critical-only narrow)', function () {
  const r = resolveFleet(ok({ costStateRead: notice }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.tier, 'notice');
});

test('warning tier → RUNS now (critical-only narrow)', function () {
  const r = resolveFleet(ok({ costStateRead: warning }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('M3: critical tier → RUNS by default (autoDisable default now EMPTY)', function () {
  const r = resolveFleet(ok({ costStateRead: critical }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('M3: usdBomb=true → critical tier skips again (M1 restore)', function () {
  const r = resolveFleet(ok({ costStateRead: critical, usdBomb: true }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_CRITICAL);
});

// An explicit env override outranks BOTH defaults — the operator can re-block a
// tier without turning the whole M1 USD bomb back on.
test('M3: AUTODISABLE_TIER=critical override → re-blocks even with usdBomb off', function () {
  const r = resolveFleet(ok({
    env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1', MCCP_WORK_PARALLEL_AUTODISABLE_TIER: 'critical' },
    costStateRead: critical,
  }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_CRITICAL);
});

// ── gate 7: catastrophic-USD — the replacement bomb detector (Codex F1) ───────

test('M3: cost_usd >= catastrophicUsd → skip CATASTROPHIC_USD', function () {
  const r = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 600, threshold_tier: 'critical' }; },
    catastrophicUsd: 500,
  }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.CATASTROPHIC_USD);
  assert.equal(r.tier, 'critical');
});

test('M3: catastrophic fires at the exact boundary, and $186 stays under it', function () {
  const at = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 500, threshold_tier: 'critical' }; },
    catastrophicUsd: 500,
  }));
  assert.equal(at.reason, REASONS.CATASTROPHIC_USD, '>= is inclusive');

  const under = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 186.92, threshold_tier: 'critical' }; },
    catastrophicUsd: 500,
  }));
  assert.equal(under.run, true, 'operational spend well below catastrophic must fire');
});

test('M3: catastrophic applies even under usdBomb (independent axis)', function () {
  const r = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 600, threshold_tier: 'green' }; },
    catastrophicUsd: 500, usdBomb: true,
  }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.CATASTROPHIC_USD);
});

test('M3: catastrophicUsd absent/0 disables the ceiling (no accidental block)', function () {
  const r = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 99999, threshold_tier: 'green' }; },
  }));
  assert.equal(r.run, true, 'an un-injected ceiling must not silently block');
});

test('AUTODISABLE_TIER="notice,critical" override → notice skips again', function () {
  const r = resolveFleet(ok({
    env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1', MCCP_WORK_PARALLEL_AUTODISABLE_TIER: 'notice,critical' },
    costStateRead: notice,
  }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_NOTICE);
});

test('threshold_tier absent → tierFor recomputes; else defaults green', function () {
  const rDefault = resolveFleet(ok({ costStateRead: function () { return { cost_usd: 90 }; } }));
  assert.equal(rDefault.run, true, 'no tierFor + no threshold_tier → green → run');

  // M3: the recomputed tier no longer blocks by itself, so assert the recompute
  // through a surface that still acts on it (usdBomb restores critical-only).
  const rComputed = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 200 }; },
    tierFor: function (usd) { return usd >= 100 ? 'critical' : 'green'; },
    usdBomb: true,
  }));
  assert.equal(rComputed.run, false);
  assert.equal(rComputed.reason, REASONS.TIER_CRITICAL);

  const rComputedDefault = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 200 }; },
    tierFor: function (usd) { return usd >= 100 ? 'critical' : 'green'; },
  }));
  assert.equal(rComputedDefault.run, true, 'M3 default: a recomputed critical still fires');
  assert.equal(rComputedDefault.tier, 'critical', 'tier is still reported honestly');
});

// ── run path: N capping (per-dispatch structural runaway cap) ─────────────────

test('green + requestedN=3 → RUN n=3, minRemaining = est × n', function () {
  const r = resolveFleet(ok({ requestedN: 3 }));
  assert.equal(r.run, true);
  assert.equal(r.n, 3);
  assert.equal(r.minRemaining, MIN_PER_WORKER_DEFAULT * 3);
  assert.equal(r.perWorkerEstimate, MIN_PER_WORKER_DEFAULT);
});

test('requestedN above MCCP_WORK_PARALLEL_MAX default → capped to 4 (per-dispatch cap)', function () {
  const r = resolveFleet(ok({ requestedN: 9 }));
  assert.equal(r.n, MAX_WORKERS_DEFAULT);
});

test('N never exceeds maxWorkers even on the fail-open path', function () {
  const r = resolveFleet(ok({ requestedN: 99, costStateRead: nullState }));
  assert.equal(r.reason, REASONS.COST_FAILOPEN);
  assert.ok(r.n <= MAX_WORKERS_DEFAULT, 'fail-open N still bounded by the per-dispatch cap');
});

test('MCCP_WORK_PARALLEL_MAX override caps N', function () {
  const r = resolveFleet(ok({
    env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1', MCCP_WORK_PARALLEL_MAX: '2' },
    requestedN: 4,
  }));
  assert.equal(r.n, 2);
});

test('MCCP_WORK_PARALLEL_BUDGET override changes est + minRemaining', function () {
  const r = resolveFleet(ok({
    env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1', MCCP_WORK_PARALLEL_BUDGET: '100000' },
    requestedN: 2,
  }));
  assert.equal(r.perWorkerEstimate, 100000);
  assert.equal(r.minRemaining, 100000 * 2);
});

test('invalid MCCP_WORK_PARALLEL_BUDGET falls back to default (loud fail-open)', function () {
  const r = resolveFleet(ok({
    env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1', MCCP_WORK_PARALLEL_BUDGET: 'garbage' },
    requestedN: 2,
  }));
  assert.equal(r.perWorkerEstimate, MIN_PER_WORKER_DEFAULT);
});

// ── runaway clamp (fail-open path only) ───────────────────────────────────────

test('runaway clamp degrades N on the fail-open path', function () {
  const r = resolveFleet(ok({
    requestedN: 4, costStateRead: nullState,
    runawayClamp: function () { return { n: 1, degraded: true, reason: 'runaway-clamp' }; },
  }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.COST_FAILOPEN);
  assert.equal(r.n, 1);
  assert.equal(r.degraded, true);
  assert.equal(r.runawayReason, 'runaway-clamp');
});

// M3 (Codex F2) — INVERTED from M1. With operational USD retired, the metered path
// has no USD backstop either, so the agent-count cap must govern every run path.
test('M3: runaway clamp IS applied on the metered (cost-state present) path', function () {
  let called = false;
  const r = resolveFleet(ok({
    requestedN: 3, costStateRead: green,
    runawayClamp: function () { called = true; return { n: 1, degraded: true, reason: 'runaway-clamp' }; },
  }));
  assert.equal(called, true, 'the cap is now the primary backstop — it must govern metered runs too');
  assert.equal(r.n, 1);
  assert.equal(r.degraded, true);
  assert.equal(r.runawayReason, 'runaway-clamp');
});

test('M3: metered far-from-cap clamp is a no-op (never raises, never degrades)', function () {
  const r = resolveFleet(ok({
    requestedN: 3, costStateRead: green,
    runawayClamp: function (n) { return { n: n, degraded: false, reason: 'ok' }; },
  }));
  assert.equal(r.n, 3, 'headroom available → N unchanged');
  assert.equal(r.degraded, false);
});

test('runaway clamp never RAISES N (min with clamp)', function () {
  const r = resolveFleet(ok({
    requestedN: 2, costStateRead: nullState,
    runawayClamp: function () { return { n: 9, degraded: false, reason: 'ok' }; },
  }));
  assert.equal(r.n, 2, 'clamp returning a larger n must not increase N');
});

// ── gate 7: in-oracle budget cap (DD6 iv) — UNCHANGED ─────────────────────────

test('budget cap: remaining cannot afford 2 workers → BUDGET_INSUFFICIENT n=1', function () {
  const r = resolveFleet(ok({ requestedN: 3, budgetTotal: 1000000, budgetRemaining: 100000 }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.BUDGET_INSUFFICIENT);
  assert.equal(r.n, 1);
});

test('budget cap: remaining affords 2 not 3 → n capped to 2, still runs', function () {
  const r = resolveFleet(ok({ requestedN: 3, budgetTotal: 1000000, budgetRemaining: 350000 }));
  assert.equal(r.run, true);
  assert.equal(r.n, 2);
});

test('no budgetTotal → no in-oracle cap (Workflow pre-guard enforces via minRemaining)', function () {
  const r = resolveFleet(ok({ requestedN: 3, budgetRemaining: 50 }));
  assert.equal(r.run, true);
  assert.equal(r.n, 3);
});

// ── shouldSkipForBudget predicate (Workflow-sandbox inline twin) ──────────────

test('shouldSkipForBudget: no target (null/0) → never skip', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: null, remaining: 1, minRemaining: 600000 }), false);
  assert.equal(shouldSkipForBudget({ budgetTotal: 0, remaining: 1, minRemaining: 600000 }), false);
});

test('shouldSkipForBudget: target set + remaining < fleet minimum → SKIP', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: 700000, remaining: 100000, minRemaining: 600000 }), true);
});

test('shouldSkipForBudget: target set + remaining covers fleet → run', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: 2000000, remaining: 900000, minRemaining: 600000 }), false);
});

test('shouldSkipForBudget: non-finite remaining treated as 0 → skip when target set', function () {
  assert.equal(shouldSkipForBudget({ budgetTotal: 700000, minRemaining: 600000 }), true);
});

// --- cost-model-subscription M1 — subscription-path (Task 5) ---
function ctxReadFleet(v) { return function () { return v; }; }
const SUB_FLEET = { MCCP_WORK_IMPLEMENT_PARALLEL: '1' };

test('subscription: context critical -> skip SUBSCRIPTION_OVERFLOW', () => {
  const r = resolveFleet({ env: SUB_FLEET, mergeStrategy: ENABLING_MERGE_STRATEGY, requestedN: 3, subscriptionMode: true, contextStateRead: ctxReadFleet({ context_remaining_pct: 15, tool_count: 9 }) });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.SUBSCRIPTION_OVERFLOW);
});

test('subscription: context green -> run N, bypasses USD cost-state', () => {
  const r = resolveFleet({ env: SUB_FLEET, mergeStrategy: ENABLING_MERGE_STRATEGY, requestedN: 3, subscriptionMode: true, contextStateRead: ctxReadFleet({ context_remaining_pct: 70, tool_count: 9 }), costStateRead: () => null });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.n, 3);
});

test('subscription: order 2 merge-strategy still gates (disable-parallel -> N=1)', () => {
  const r = resolveFleet({ env: SUB_FLEET, mergeStrategy: 'disable-parallel', requestedN: 3, subscriptionMode: true, contextStateRead: ctxReadFleet({ context_remaining_pct: 70, tool_count: 9 }) });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.MERGE_STRATEGY_DISABLED);
});

test('subscription: absent context -> fail-open run', () => {
  const r = resolveFleet({ env: SUB_FLEET, mergeStrategy: ENABLING_MERGE_STRATEGY, requestedN: 2, subscriptionMode: true, contextStateRead: () => null, costStateRead: () => null });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});
