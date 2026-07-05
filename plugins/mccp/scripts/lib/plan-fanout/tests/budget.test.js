'use strict';

// plan-fanout Task 2 validate — mode × PRD-mode × cost-tier decision tree.
// Mirror of briefing/tests/cost-guard.test.js. Codex F2: unknown cost-state
// SKIPS (fail-closed) — the deliberate divergence from cost-guard's fail-open.

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveFanout, shouldSkipForBudget, REASONS, FLEET_SIZE } = require('../budget');

function green() { return { cost_usd: 5, threshold_tier: 'green' }; }
function notice() { return { cost_usd: 55, threshold_tier: 'notice' }; }
function critical() { return { cost_usd: 105, threshold_tier: 'critical' }; }
function nullState() { return null; }

test('mode unset (default off) → skip ENV_OFF (Codex F3 explicit opt-in)', function () {
  const r = resolveFanout({ env: {}, prdMode: true, costStateRead: green });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.ENV_OFF);
  assert.equal(r.fleetSize, 0);
});

test('mode=on but non-PRD → skip NOT_PRD_MODE', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: false, costStateRead: green });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.NOT_PRD_MODE);
});

test('mode=on + PRD + cost-state null → skip COST_STATE_UNKNOWN (Codex F2 fail-closed)', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true, costStateRead: nullState });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

test('mode=on + PRD + costStateRead throws → skip COST_STATE_UNKNOWN (guarded)', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true,
    costStateRead: function () { throw new Error('boom'); },
  });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.COST_STATE_UNKNOWN);
});

test('mode=on + PRD + notice tier → skip TIER_NOTICE', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true, costStateRead: notice });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_NOTICE);
  assert.equal(r.tier, 'notice');
});

test('mode=on + PRD + critical tier → skip TIER_CRITICAL', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true, costStateRead: critical });
  assert.equal(r.run, false);
  assert.equal(r.reason, REASONS.TIER_CRITICAL);
});

test('mode=on + PRD + green tier → RUN, fleetSize 4', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true, costStateRead: green });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.tier, 'green');
  assert.equal(r.fleetSize, FLEET_SIZE);
  assert.equal(r.minRemaining, 150000 * 4);
});

test('mode is case-insensitive (ON) and trims', function () {
  const r = resolveFanout({ env: { MCCP_PLAN_FANOUT: '  ON ' }, prdMode: true, costStateRead: green });
  assert.equal(r.run, true);
});

test('MCCP_PLAN_FANOUT_AUTODISABLE_TIER="critical" → notice now RUNS', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT: 'on', MCCP_PLAN_FANOUT_AUTODISABLE_TIER: 'critical' },
    prdMode: true, costStateRead: notice,
  });
  assert.equal(r.run, true);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('MCCP_PLAN_FANOUT_BUDGET override changes minRemaining', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT: 'on', MCCP_PLAN_FANOUT_BUDGET: '100000' },
    prdMode: true, costStateRead: green,
  });
  assert.equal(r.minRemaining, 100000 * 4);
});

test('invalid MCCP_PLAN_FANOUT_BUDGET falls back to default (loud fail-open)', function () {
  const r = resolveFanout({
    env: { MCCP_PLAN_FANOUT: 'on', MCCP_PLAN_FANOUT_BUDGET: 'garbage' },
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
    env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true,
    costStateRead: function () { return { cost_usd: 90 }; },
  });
  assert.equal(rDefault.run, true, 'no tierFor + no threshold_tier defaults to green → run');

  const rComputed = resolveFanout({
    env: { MCCP_PLAN_FANOUT: 'on' }, prdMode: true,
    costStateRead: function () { return { cost_usd: 90 }; },
    tierFor: function (usd) { return usd >= 80 ? 'warning' : 'green'; },
  });
  assert.equal(rComputed.run, false, 'tierFor recomputes warning → skip');
  assert.equal(rComputed.reason, REASONS.TIER_WARNING);
});
