'use strict';

// v1.3.0-m2 Task 2 validate — cost-guard decision tree.
//
// 9 paths covering env policy × cost tier × PR-phase re-entrancy.

const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldSkipBriefing, REASONS } = require('../cost-guard');

function noLock() { return false; }
function locked() { return true; }

test('MCCP_BRIEFING=off → ENV_OFF (env policy wins over all)', function () {
  const r = shouldSkipBriefing({
    env: { MCCP_BRIEFING: 'off' },
    costStateRead: function () { return { cost_usd: 0, threshold_tier: 'green' }; },
    lockProbe: noLock,
  });
  assert.equal(r.skip, true);
  assert.equal(r.reason, REASONS.ENV_OFF);
  assert.equal(r.tier, null);
});

test('MCCP_CODEX_DISABLED=1 → ENV_CODEX_DISABLED', function () {
  const r = shouldSkipBriefing({
    env: { MCCP_CODEX_DISABLED: '1' },
    costStateRead: function () { return { cost_usd: 0, threshold_tier: 'green' }; },
    lockProbe: noLock,
  });
  assert.equal(r.skip, true);
  assert.equal(r.reason, REASONS.ENV_CODEX_DISABLED);
});

test('cost-tier green → OK_RUN', function () {
  const r = shouldSkipBriefing({
    env: {},
    costStateRead: function () { return { cost_usd: 5, threshold_tier: 'green' }; },
    lockProbe: noLock,
  });
  assert.equal(r.skip, false);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.tier, 'green');
});

test('cost-tier notice → TIER_NOTICE', function () {
  const r = shouldSkipBriefing({
    env: {},
    costStateRead: function () { return { cost_usd: 55, threshold_tier: 'notice' }; },
    lockProbe: noLock,
  });
  assert.equal(r.skip, true);
  assert.equal(r.reason, REASONS.TIER_NOTICE);
  assert.equal(r.tier, 'notice');
});

test('cost-tier critical → TIER_CRITICAL', function () {
  const r = shouldSkipBriefing({
    env: {},
    costStateRead: function () { return { cost_usd: 105, threshold_tier: 'critical' }; },
    lockProbe: noLock,
  });
  assert.equal(r.skip, true);
  assert.equal(r.reason, REASONS.TIER_CRITICAL);
  assert.equal(r.tier, 'critical');
});

test('no cost-state (null) → OK_RUN (fail-open default)', function () {
  const r = shouldSkipBriefing({
    env: {},
    costStateRead: function () { return null; },
    lockProbe: noLock,
  });
  assert.equal(r.skip, false);
  assert.equal(r.reason, REASONS.OK_RUN);
  assert.equal(r.tier, null);
});

test('MCCP_BRIEFING_AUTODISABLE_TIER="critical" → only critical skips, notice runs', function () {
  const rNotice = shouldSkipBriefing({
    env: { MCCP_BRIEFING_AUTODISABLE_TIER: 'critical' },
    costStateRead: function () { return { cost_usd: 55, threshold_tier: 'notice' }; },
    lockProbe: noLock,
  });
  assert.equal(rNotice.skip, false);
  assert.equal(rNotice.reason, REASONS.OK_RUN);

  const rCritical = shouldSkipBriefing({
    env: { MCCP_BRIEFING_AUTODISABLE_TIER: 'critical' },
    costStateRead: function () { return { cost_usd: 105, threshold_tier: 'critical' }; },
    lockProbe: noLock,
  });
  assert.equal(rCritical.skip, true);
  assert.equal(rCritical.reason, REASONS.TIER_CRITICAL);
});

test('pr-phase.lock w/ subphase=codex-review → PR_PHASE_LOCKED (Codex R1 F3)', function () {
  const r = shouldSkipBriefing({
    env: {},
    costStateRead: function () { return { cost_usd: 5, threshold_tier: 'green' }; },
    lockProbe: locked,
  });
  assert.equal(r.skip, true);
  assert.equal(r.reason, REASONS.PR_PHASE_LOCKED);
  assert.equal(r.tier, null,
    'PR_PHASE_LOCKED is an env-class reason — tier is not surfaced');
});

test('pr-phase.lock present but subphase != codex-review → OK_RUN (probe returns false)', function () {
  const r = shouldSkipBriefing({
    env: {},
    costStateRead: function () { return { cost_usd: 5, threshold_tier: 'green' }; },
    lockProbe: function () { return false; },
  });
  assert.equal(r.skip, false);
  assert.equal(r.reason, REASONS.OK_RUN);
});

// --- cost-model-subscription M1 — subscription-path (Task 6) ---
function ctxReadBrief(v) { return function () { return v; }; }

test('subscription: context critical -> skip SUBSCRIPTION_OVERFLOW', function () {
  const r = shouldSkipBriefing({ env: { MCCP_SUBSCRIPTION: '1' }, lockProbe: noLock, contextStateRead: ctxReadBrief({ context_remaining_pct: 20, tool_count: 5 }) });
  assert.equal(r.skip, true);
  assert.equal(r.reason, REASONS.SUBSCRIPTION_OVERFLOW);
});

test('subscription: context green -> run, bypasses USD tier (critical cost-state)', function () {
  const r = shouldSkipBriefing({ env: { MCCP_SUBSCRIPTION: '1' }, lockProbe: noLock, contextStateRead: ctxReadBrief({ context_remaining_pct: 70, tool_count: 5 }), costStateRead: () => ({ cost_usd: 999, threshold_tier: 'critical' }) });
  assert.equal(r.skip, false);
  assert.equal(r.reason, REASONS.OK_RUN);
});

test('subscription: orders 1-3 still win (MCCP_BRIEFING=off)', function () {
  const r = shouldSkipBriefing({ env: { MCCP_SUBSCRIPTION: '1', MCCP_BRIEFING: 'off' }, lockProbe: noLock, contextStateRead: ctxReadBrief({ context_remaining_pct: 70, tool_count: 5 }) });
  assert.equal(r.skip, true);
  assert.equal(r.reason, REASONS.ENV_OFF);
});

test('subscription: absent context -> fail-open run', function () {
  const r = shouldSkipBriefing({ env: { MCCP_SUBSCRIPTION: '1' }, lockProbe: noLock, contextStateRead: () => null, costStateRead: () => ({ cost_usd: 999, threshold_tier: 'critical' }) });
  assert.equal(r.skip, false);
  assert.equal(r.reason, REASONS.OK_RUN);
});
