'use strict';

// v1.3.0-m2 briefing cost-tier × env policy × PR-phase re-entrancy gate.
//
// Single export shouldSkipBriefing(opts) → { skip, reason, tier }.
//
// Decision order (first match wins):
//   1. MCCP_BRIEFING=off        → ENV_OFF
//   2. MCCP_CODEX_DISABLED=1    → ENV_CODEX_DISABLED
//   3. pr-phase.lock w/ codex-review subphase → PR_PHASE_LOCKED (Codex R1 F3)
//   4. cost-tier ∈ autoDisableTiers          → TIER_* (default: notice/warning/critical)
//   5. otherwise → OK_RUN

const fs = require('fs');
const path = require('path');
const costState = require('../cost-state');
const subscription = require('../subscription');
const contextState = require('../context-state');

const REASONS = Object.freeze({
  OK_RUN: 'ok-run',
  TIER_NOTICE: 'tier-notice',
  TIER_WARNING: 'tier-warning',
  TIER_CRITICAL: 'tier-critical',
  ENV_OFF: 'env-off',
  ENV_CODEX_DISABLED: 'env-codex-disabled',
  PR_PHASE_LOCKED: 'pr-phase-locked',
  // cost-model-subscription M1 — positive context-overflow critical under
  // MCCP_SUBSCRIPTION (replaces order 4 USD tier autoDisable).
  SUBSCRIPTION_OVERFLOW: 'subscription-overflow',
});

const AUTODISABLE_TIERS_DEFAULT = Object.freeze(
  new Set(['notice', 'warning', 'critical'])
);

function parseTierOverride(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const tiers = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (tiers.length === 0) return null;
  const allowed = new Set(['green', 'notice', 'warning', 'critical']);
  for (let i = 0; i < tiers.length; i++) {
    if (!allowed.has(tiers[i])) return null;
  }
  return new Set(tiers);
}

// Codex R1 F3 absorption — mechanical PR-phase guard.
//
// If pr-phase.lock exists with active subphase=codex-review, briefing MUST NOT
// spawn a second Codex process (re-entrancy + lock contention risk). Reading
// the lock JSON is best-effort: missing/corrupt/different-shape lock counts
// as "not in codex-review subphase" (fail-open — the worst case is briefing
// runs harmlessly during a non-codex subphase).
function isInPRCodexReviewSubphase(repoRoot) {
  if (!repoRoot || typeof repoRoot !== 'string') return false;
  try {
    const lockPath = path.join(repoRoot, '.claude', 'state', 'pr-phase.lock');
    if (!fs.existsSync(lockPath)) return false;
    const raw = fs.readFileSync(lockPath, 'utf8');
    const obj = JSON.parse(raw);
    return !!(obj && obj.subphase === 'codex-review');
  } catch (_e) {
    return false;
  }
}

function shouldSkipBriefing(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const repoRoot = opts.repoRoot || null;
  const read = opts.costStateRead || costState.readState;
  const lockProbe = opts.lockProbe || isInPRCodexReviewSubphase;

  if (env.MCCP_BRIEFING === 'off') {
    return { skip: true, reason: REASONS.ENV_OFF, tier: null };
  }
  if (env.MCCP_CODEX_DISABLED === '1') {
    return { skip: true, reason: REASONS.ENV_CODEX_DISABLED, tier: null };
  }
  if (lockProbe(repoRoot)) {
    return { skip: true, reason: REASONS.PR_PHASE_LOCKED, tier: null };
  }

  // cost-model-subscription M1 — subscription bypass. Orders 1-3 (env-off /
  // codex-disabled / pr-phase-locked) are NOT USD gates and stay above. This
  // replaces order 4 (USD tier autoDisable) with the context overflow axis,
  // fail-OPEN (Codex F1, user-accepted): absent/green runs, positive critical skips.
  if (subscription.isSubscriptionMode(env)) {
    const ctxRead = opts.contextStateRead || contextState.readState;
    let ctx;
    try { ctx = ctxRead(); } catch (_e) { ctx = null; }
    const of = subscription.evaluateOverflow({
      contextRemainingPct: ctx ? ctx.context_remaining_pct : null,
      toolCount: ctx ? ctx.tool_count : null,
      thresholds: subscription.parseOverflowThresholds(env),
    });
    if (of.overflow) return { skip: true, reason: REASONS.SUBSCRIPTION_OVERFLOW, tier: of.tier };
    return { skip: false, reason: REASONS.OK_RUN, tier: of.tier };
  }

  const autoDisableTiers = parseTierOverride(env.MCCP_BRIEFING_AUTODISABLE_TIER)
    || AUTODISABLE_TIERS_DEFAULT;

  const cs = read();
  if (!cs) {
    return { skip: false, reason: REASONS.OK_RUN, tier: null };
  }
  const tier = cs.threshold_tier || costState.tierFor(cs.cost_usd);
  if (autoDisableTiers.has(tier)) {
    const r = tier === 'notice' ? REASONS.TIER_NOTICE
      : tier === 'warning' ? REASONS.TIER_WARNING
      : REASONS.TIER_CRITICAL;
    return { skip: true, reason: r, tier: tier };
  }
  return { skip: false, reason: REASONS.OK_RUN, tier: tier };
}

module.exports = {
  shouldSkipBriefing: shouldSkipBriefing,
  isInPRCodexReviewSubphase: isInPRCodexReviewSubphase,
  REASONS: REASONS,
  AUTODISABLE_TIERS_DEFAULT: AUTODISABLE_TIERS_DEFAULT,
};
