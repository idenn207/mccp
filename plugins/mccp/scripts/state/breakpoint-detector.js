'use strict';

// v0.3.0 S10b — cost-tier × safe-event AND-gate decision module.
//
// Architecture §4 priority policy:
//   1. green / notice tiers          → no handoff (notice tier may stderr-only signal upstream)
//   2. hard ceiling (critical tier)  → unconditional handoff, unsafe_checkpoint=true,
//                                       fix-task is overridden (next session inherits)
//   3. warning tier ("soft")         → handoff iff safe-event recently fired AND no fix-task pending
//   4. cost-state stale (>5s)        → conservative no-handoff (no telemetry → no decision)
//
// Pure function — no I/O side effects. Reads cost-state.readState() +
// state-writer.readState() + fixTaskPath existence; all three are
// injectable via opts for test isolation.
//
// API: detect({ root, now?, costStateOverride?, stateOverride?, fixTaskExistsOverride? })
//        → {
//            tier:               'green'|'notice'|'warning'|'critical',
//            shouldHandoff:      boolean,
//            reason:             one of REASON_*,
//            unsafeCheckpoint?:  true (only when reason === 'hard-ceiling-force'),
//            lastEvent?:         string,
//            lastEventAt?:       string (ISO),
//            costUsd?:           number,
//            stale?:             boolean,
//          }
//
// Tier vocabulary mirrors cost-state.js#tierFor:
//   plan-level "soft" = cost-state "warning", plan-level "hard" = "critical".
//   The output uses the cost-state vocabulary so downstream consumers
//   (auto-handoff hook, session-spawner) speak one language.

const path = require('path');
const fs = require('fs');

const costState = require('../lib/cost-state');
const stateWriter = require('./state-writer');
const fixTask = require('./fix-task');

const SAFE_EVENTS = new Set(['stop_loop_pass', 'receipt_write', 'pr_created']);
const SAFE_EVENT_WINDOW_MS = 60 * 1000;
const COST_STATE_MAX_AGE_MS = 5 * 1000;

// Single-source reasons so downstream telemetry can dedupe / aggregate.
const REASONS = Object.freeze({
  BELOW_NOTICE: 'below-notice',
  NOTICE_STDERR_ONLY: 'notice-stderr-only',
  SOFT_SAFE_NO_FIX_TASK: 'soft-safe-no-fix-task',
  SOFT_DEFER_FIX_TASK: 'soft-defer-fix-task',
  SOFT_DEFER_UNSAFE_EVENT: 'soft-defer-unsafe-event',
  HARD_CEILING_FORCE: 'hard-ceiling-force',
  COST_STATE_STALE: 'cost-state-stale',
  COST_STATE_MISSING: 'cost-state-missing',
});

function isSafeEvent(lastEvent, lastEventAtIso, nowMs) {
  if (!lastEvent || !SAFE_EVENTS.has(lastEvent)) return false;
  if (!lastEventAtIso) return false;
  const ts = Date.parse(lastEventAtIso);
  if (!Number.isFinite(ts)) return false;
  return (nowMs - ts) < SAFE_EVENT_WINDOW_MS;
}

function detect(opts) {
  const o = opts || {};
  const nowMs = Number.isFinite(o.now) ? o.now : Date.now();
  const root = o.root;

  // cost-state: stale guard FIRST so we never blame a tier on phantom telemetry.
  const cs = (o.costStateOverride !== undefined)
    ? o.costStateOverride
    : costState.readState();
  if (!cs) {
    return {
      tier: 'green',
      shouldHandoff: false,
      reason: REASONS.COST_STATE_MISSING,
    };
  }
  const stale = (o.staleOverride !== undefined)
    ? !!o.staleOverride
    : costState.isStale(COST_STATE_MAX_AGE_MS);
  if (stale) {
    return {
      tier: cs.threshold_tier || 'green',
      shouldHandoff: false,
      reason: REASONS.COST_STATE_STALE,
      stale: true,
      costUsd: cs.cost_usd,
    };
  }

  const tier = cs.threshold_tier || costState.tierFor(cs.cost_usd);
  const meta = { tier: tier, costUsd: cs.cost_usd };

  if (tier === 'green') {
    return Object.assign({}, meta, {
      shouldHandoff: false,
      reason: REASONS.BELOW_NOTICE,
    });
  }
  if (tier === 'notice') {
    return Object.assign({}, meta, {
      shouldHandoff: false,
      reason: REASONS.NOTICE_STDERR_ONLY,
    });
  }
  if (tier === 'critical') {
    // Hard ceiling override — fix-task is preserved on disk but NOT honored
    // as a defer signal; session-spawner will carry it as next_chunk.
    return Object.assign({}, meta, {
      shouldHandoff: true,
      reason: REASONS.HARD_CEILING_FORCE,
      unsafeCheckpoint: true,
    });
  }

  // warning ("soft") tier — AND-gate.
  const state = (o.stateOverride !== undefined)
    ? o.stateOverride
    : (root ? stateWriter.readState(root) : null);
  const lastEvent = state && state.frontmatter && state.frontmatter.last_event;
  const lastEventAt = state && state.frontmatter && state.frontmatter.last_event_at;
  const safe = isSafeEvent(lastEvent, lastEventAt, nowMs);

  const fixTaskPending = (o.fixTaskExistsOverride !== undefined)
    ? !!o.fixTaskExistsOverride
    : (root ? fs.existsSync(fixTask.fixTaskPath(root)) : false);

  const base = Object.assign({}, meta, {
    lastEvent: lastEvent || null,
    lastEventAt: lastEventAt || null,
  });

  if (!safe) {
    return Object.assign(base, {
      shouldHandoff: false,
      reason: REASONS.SOFT_DEFER_UNSAFE_EVENT,
    });
  }
  if (fixTaskPending) {
    return Object.assign(base, {
      shouldHandoff: false,
      reason: REASONS.SOFT_DEFER_FIX_TASK,
    });
  }
  return Object.assign(base, {
    shouldHandoff: true,
    reason: REASONS.SOFT_SAFE_NO_FIX_TASK,
  });
}

module.exports = {
  detect: detect,
  REASONS: REASONS,
  SAFE_EVENTS: SAFE_EVENTS,
  SAFE_EVENT_WINDOW_MS: SAFE_EVENT_WINDOW_MS,
  COST_STATE_MAX_AGE_MS: COST_STATE_MAX_AGE_MS,
  isSafeEvent: isSafeEvent,
};
