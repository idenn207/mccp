'use strict';

// workflow-orchestration M2b Task 2 validate — fleet mode × merge-strategy ×
// cost-tier × budget decision tree. Mirror of plan-fanout/tests/budget.test.js
// with the two M2b-specific gates (merge-strategy, single-partition) added.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveFleet, shouldSkipForBudget, REASONS,
  MAX_WORKERS_DEFAULT, MIN_PER_WORKER_DEFAULT, ENABLING_MERGE_STRATEGY,
} = require('../budget');

const ON = { MCCP_WORK_IMPLEMENT_PARALLEL: '1' };
function green() { return { cost_usd: 5, threshold_tier: 'green' }; }
function notice() { return { cost_usd: 55, threshold_tier: 'notice' }; }
function critical() { return { cost_usd: 105, threshold_tier: 'critical' }; }
function nullState() { return null; }

function ok(over) {
  return Object.assign({
    env: ON, mergeStrategy: ENABLING_MERGE_STRATEGY, requestedN: 3, costStateRead: green,
  }, over || {});
}

// ── gate 1: parallel opt-in ───────────────────────────────────────────────────

test('mode unset (default off) → skip ENV_OFF', function () {
  const r = resolveFleet({ env: {}, mergeStrategy: ENABLING_MERGE_STRATEGY, requestedN: 3, costStateRead: green });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.ENV_OFF);
  assert.equal(r.n, 1);
});

test('mode accepts "1" and case-insensitive "on"', function () {
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1' } })).run, true);
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: ' ON ' } })).run, true);
  assert.equal(resolveFleet(ok({ env: { MCCP_WORK_IMPLEMENT_PARALLEL: '0' } })).run, false);
});

// ── gate 2: merge-strategy structural gate (Task 0 / Codex F3) ────────────────

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

// ── gate 3: single-partition short-circuit ────────────────────────────────────

test('requestedN=1 → skip SINGLE_PARTITION (nothing to parallelize)', function () {
  const r = resolveFleet(ok({ requestedN: 1 }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.SINGLE_PARTITION);
});

test('invalid requestedN falls back to 1 → SINGLE_PARTITION', function () {
  const r = resolveFleet(ok({ requestedN: 0 }));
  assert.equal(r.reason, REASONS.SINGLE_PARTITION);
});

// ── gate 4: cost-state fail-closed ────────────────────────────────────────────

test('cost-state null → skip COST_STATE_UNKNOWN (expensive fan-out fails closed)', function () {
  const r = resolveFleet(ok({ costStateRead: nullState }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

test('costStateRead throws → skip COST_STATE_UNKNOWN (guarded)', function () {
  const r = resolveFleet(ok({ costStateRead: function () { throw new Error('boom'); } }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

// ── gate 5: cost-tier autoDisable ─────────────────────────────────────────────

test('notice tier → skip TIER_NOTICE', function () {
  const r = resolveFleet(ok({ costStateRead: notice }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_NOTICE);
  assert.equal(r.tier, 'notice');
});

test('critical tier → skip TIER_CRITICAL', function () {
  const r = resolveFleet(ok({ costStateRead: critical }));
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_CRITICAL);
});

test('AUTODISABLE_TIER=critical override → notice now runs', function () {
  const r = resolveFleet(ok({
    env: { MCCP_WORK_IMPLEMENT_PARALLEL: '1', MCCP_WORK_PARALLEL_AUTODISABLE_TIER: 'critical' },
    costStateRead: notice,
  }));
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('threshold_tier absent → tierFor recomputes; else defaults green', function () {
  const rDefault = resolveFleet(ok({ costStateRead: function () { return { cost_usd: 90 }; } }));
  assert.equal(rDefault.run, true, 'no tierFor + no threshold_tier → green → run');

  const rComputed = resolveFleet(ok({
    costStateRead: function () { return { cost_usd: 90 }; },
    tierFor: function (usd) { return usd >= 80 ? 'warning' : 'green'; },
  }));
  assert.equal(rComputed.run, false);
  assert.equal(rComputed.reason, REASONS.TIER_WARNING);
});

// ── run path: N capping ───────────────────────────────────────────────────────

test('green + requestedN=3 → RUN n=3, minRemaining = est × n', function () {
  const r = resolveFleet(ok({ requestedN: 3 }));
  assert.equal(r.run, true);
  assert.equal(r.n, 3);
  assert.equal(r.minRemaining, MIN_PER_WORKER_DEFAULT * 3);
  assert.equal(r.perWorkerEstimate, MIN_PER_WORKER_DEFAULT);
});

test('requestedN above MCCP_WORK_PARALLEL_MAX default → capped to 4', function () {
  const r = resolveFleet(ok({ requestedN: 9 }));
  assert.equal(r.n, MAX_WORKERS_DEFAULT);
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

// ── gate 6: in-oracle budget cap (DD6 iv) ─────────────────────────────────────

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
