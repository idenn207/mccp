'use strict';

const test = require('node:test');
const assert = require('node:assert');

const det = require('../breakpoint-detector');

function mkCost(opts) {
  return {
    cost_usd: opts.cost_usd,
    threshold_tier: opts.tier || tierFromCost(opts.cost_usd),
    hard_ceiling_reached: !!opts.hard_ceiling_reached,
    last_write_ts: Date.now(),
  };
}

function tierFromCost(c) {
  if (!Number.isFinite(c)) return 'green';
  if (c >= 100) return 'critical';
  if (c >= 80) return 'warning';
  if (c >= 50) return 'notice';
  return 'green';
}

function mkState(opts) {
  return {
    frontmatter: {
      last_event: opts.last_event || null,
      last_event_at: opts.last_event_at || null,
    },
  };
}

test('scenario 1: green tier → below-notice, no handoff', () => {
  const r = det.detect({
    root: '/tmp/fake',
    costStateOverride: mkCost({ cost_usd: 10 }),
    staleOverride: false,
  });
  assert.strictEqual(r.tier, 'green');
  assert.strictEqual(r.shouldHandoff, false);
  assert.strictEqual(r.reason, det.REASONS.BELOW_NOTICE);
  assert.strictEqual(r.unsafeCheckpoint, undefined);
});

test('scenario 2: notice tier → notice-stderr-only, no handoff', () => {
  const r = det.detect({
    root: '/tmp/fake',
    costStateOverride: mkCost({ cost_usd: 65 }),
    staleOverride: false,
  });
  assert.strictEqual(r.tier, 'notice');
  assert.strictEqual(r.shouldHandoff, false);
  assert.strictEqual(r.reason, det.REASONS.NOTICE_STDERR_ONLY);
});

test('scenario 3: warning tier + safe-event + no fix-task → SPAWN', () => {
  const now = Date.now();
  const r = det.detect({
    root: '/tmp/fake',
    now: now,
    costStateOverride: mkCost({ cost_usd: 85 }),
    staleOverride: false,
    stateOverride: mkState({
      last_event: 'stop_loop_pass',
      last_event_at: new Date(now - 5_000).toISOString(),
    }),
    fixTaskExistsOverride: false,
  });
  assert.strictEqual(r.tier, 'warning');
  assert.strictEqual(r.shouldHandoff, true);
  assert.strictEqual(r.reason, det.REASONS.SOFT_SAFE_NO_FIX_TASK);
});

test('scenario 4: warning tier + safe-event + fix-task pending → DEFER', () => {
  const now = Date.now();
  const r = det.detect({
    root: '/tmp/fake',
    now: now,
    costStateOverride: mkCost({ cost_usd: 90 }),
    staleOverride: false,
    stateOverride: mkState({
      last_event: 'pr_created',
      last_event_at: new Date(now - 10_000).toISOString(),
    }),
    fixTaskExistsOverride: true,
  });
  assert.strictEqual(r.shouldHandoff, false);
  assert.strictEqual(r.reason, det.REASONS.SOFT_DEFER_FIX_TASK);
});

test('scenario 5a: warning tier + unsafe-event (precompact) → DEFER', () => {
  const now = Date.now();
  const r = det.detect({
    root: '/tmp/fake',
    now: now,
    costStateOverride: mkCost({ cost_usd: 95 }),
    staleOverride: false,
    stateOverride: mkState({
      last_event: 'precompact',
      last_event_at: new Date(now - 1_000).toISOString(),
    }),
    fixTaskExistsOverride: false,
  });
  assert.strictEqual(r.shouldHandoff, false);
  assert.strictEqual(r.reason, det.REASONS.SOFT_DEFER_UNSAFE_EVENT);
});

test('scenario 5b: warning tier + safe-event but window expired → DEFER', () => {
  const now = Date.now();
  const r = det.detect({
    root: '/tmp/fake',
    now: now,
    costStateOverride: mkCost({ cost_usd: 85 }),
    staleOverride: false,
    stateOverride: mkState({
      last_event: 'stop_loop_pass',
      last_event_at: new Date(now - 70_000).toISOString(), // 70s old > 60s window
    }),
    fixTaskExistsOverride: false,
  });
  assert.strictEqual(r.shouldHandoff, false);
  assert.strictEqual(r.reason, det.REASONS.SOFT_DEFER_UNSAFE_EVENT);
});

test('scenario 6: hard ceiling → unconditional spawn + unsafe_checkpoint', () => {
  const r = det.detect({
    root: '/tmp/fake',
    costStateOverride: mkCost({ cost_usd: 120 }),
    staleOverride: false,
    stateOverride: mkState({
      last_event: 'fix_task_applied', // unsafe — but hard overrides
      last_event_at: new Date().toISOString(),
    }),
    fixTaskExistsOverride: true, // pending — but hard overrides
  });
  assert.strictEqual(r.tier, 'critical');
  assert.strictEqual(r.shouldHandoff, true);
  assert.strictEqual(r.reason, det.REASONS.HARD_CEILING_FORCE);
  assert.strictEqual(r.unsafeCheckpoint, true);
});

test('scenario 7: cost-state stale → conservative no-handoff', () => {
  const r = det.detect({
    root: '/tmp/fake',
    costStateOverride: mkCost({ cost_usd: 95, tier: 'warning' }),
    staleOverride: true,
  });
  assert.strictEqual(r.shouldHandoff, false);
  assert.strictEqual(r.reason, det.REASONS.COST_STATE_STALE);
  assert.strictEqual(r.stale, true);
});

test('scenario 8: cost-state missing → no handoff', () => {
  const r = det.detect({
    root: '/tmp/fake',
    costStateOverride: null,
  });
  assert.strictEqual(r.shouldHandoff, false);
  assert.strictEqual(r.reason, det.REASONS.COST_STATE_MISSING);
});

test('isSafeEvent: only whitelisted events qualify', () => {
  const now = Date.now();
  const iso = new Date(now - 1000).toISOString();
  assert.strictEqual(det.isSafeEvent('stop_loop_pass', iso, now), true);
  assert.strictEqual(det.isSafeEvent('receipt_write', iso, now), true);
  assert.strictEqual(det.isSafeEvent('pr_created', iso, now), true);
  assert.strictEqual(det.isSafeEvent('fix_task_applied', iso, now), false);
  assert.strictEqual(det.isSafeEvent('precompact', iso, now), false);
  assert.strictEqual(det.isSafeEvent('unknown_event', iso, now), false);
  assert.strictEqual(det.isSafeEvent(null, iso, now), false);
  assert.strictEqual(det.isSafeEvent('stop_loop_pass', null, now), false);
  assert.strictEqual(det.isSafeEvent('stop_loop_pass', 'not-a-date', now), false);
});
