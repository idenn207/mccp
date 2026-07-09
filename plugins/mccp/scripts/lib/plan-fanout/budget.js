'use strict';

// plan-fanout budget/mode oracle — decides whether the /mccp:plan GROUND fan-out
// runs, and with what fleet, given routing mode × PRD-mode × cost tier.
//
// Pure, dep-free: cost-state is INJECTED via opts.costStateRead so the oracle
// stays unit-testable without touching disk. Mirrors briefing/cost-guard.js
// (shouldSkipBriefing decision tree, frozen REASONS, parseTierOverride) and
// cost-thresholds.js (loud fail-open env parse + stderr warn + default).
//
// DELIBERATE DIFFERENCE from cost-guard (Codex F2): briefing is cheap, so
// cost-guard RUNS when cost-state is missing (fail-open). Fan-out is expensive
// (4 parallel agents), so a missing/corrupt cost-state SKIPS here (fail-closed,
// conservative) — the fleet is never spent blind.
//
// Decision order (first match wins):
//   1. mode !== 'on'                      → ENV_OFF            (default off — Codex F3)
//   2. prdMode !== true                   → NOT_PRD_MODE
//   3. cost-state missing/corrupt (null)  → COST_STATE_UNKNOWN (skip — Codex F2)
//   4. cost-tier ∈ autoDisableTiers       → TIER_*             (default notice/warning/critical)
//   5. otherwise                          → OK_RUN + fleetSize + minRemaining

const subscription = require('../subscription');

const REASONS = Object.freeze({
  OK_RUN: 'ok-run',
  ENV_OFF: 'env-off',
  NOT_PRD_MODE: 'not-prd-mode',
  COST_STATE_UNKNOWN: 'cost-state-unknown',
  TIER_NOTICE: 'tier-notice',
  TIER_WARNING: 'tier-warning',
  TIER_CRITICAL: 'tier-critical',
  // cost-model-subscription M1 — positive context-overflow critical under
  // MCCP_SUBSCRIPTION (replaces the USD cost-state + tier gates).
  SUBSCRIPTION_OVERFLOW: 'subscription-overflow',
});

const FLEET_SIZE = 4;
const MIN_PER_AGENT_DEFAULT = 150000;

const AUTODISABLE_TIERS_DEFAULT = Object.freeze(
  new Set(['notice', 'warning', 'critical'])
);

const ENV_MODE = 'MCCP_PLAN_FANOUT';
const ENV_MIN_PER_AGENT = 'MCCP_PLAN_FANOUT_BUDGET';
const ENV_AUTODISABLE = 'MCCP_PLAN_FANOUT_AUTODISABLE_TIER';

function warn(line) {
  process.stderr.write('[mccp:plan-fanout] ' + line + '\n');
}

// parseFanoutMode(env) → 'off' | 'on'. Default OFF (Codex F3 — explicit opt-in).
// Anything other than a case-insensitive 'on' is off.
function parseFanoutMode(env) {
  const raw = (env && env[ENV_MODE]) || '';
  return String(raw).trim().toLowerCase() === 'on' ? 'on' : 'off';
}

// parseFanoutMinPerAgent(env) → positive integer token estimate per perspective.
// Loud fail-open to default (mirror cost-thresholds.parseEnvOverride).
function parseFanoutMinPerAgent(env) {
  const raw = env && env[ENV_MIN_PER_AGENT];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return MIN_PER_AGENT_DEFAULT;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    warn(ENV_MIN_PER_AGENT + ' must be a positive token count; got "' + raw +
      '". Falling back to default ' + MIN_PER_AGENT_DEFAULT + '.');
    return MIN_PER_AGENT_DEFAULT;
  }
  return Math.floor(n);
}

// parseTierOverride(raw) → Set|null. Loud fail-open on unknown token.
function parseTierOverride(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const tiers = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (tiers.length === 0) return null;
  const allowed = new Set(['green', 'notice', 'warning', 'critical']);
  for (let i = 0; i < tiers.length; i++) {
    if (!allowed.has(tiers[i])) {
      warn(ENV_AUTODISABLE + ' has unknown tier "' + tiers[i] +
        '"; falling back to default (notice/warning/critical).');
      return null;
    }
  }
  return new Set(tiers);
}

// resolveFanout({env, prdMode, costStateRead, tierFor})
//   → { run, reason, tier, fleetSize, minRemaining }
//
// costStateRead() returns a cost-state object ({cost_usd, threshold_tier, ...})
// or null (missing/corrupt). tierFor (optional) recomputes a tier from cost_usd
// when the stored threshold_tier is absent; default fallback is 'green'.
function resolveFanout(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const prdMode = opts.prdMode === true;
  const read = typeof opts.costStateRead === 'function'
    ? opts.costStateRead
    : function () { return null; };
  const minRemaining = parseFanoutMinPerAgent(env) * FLEET_SIZE;

  const skip = function (reason, tier) {
    return { run: false, reason: reason, tier: tier || null, fleetSize: 0, minRemaining: minRemaining };
  };

  if (parseFanoutMode(env) !== 'on') return skip(REASONS.ENV_OFF);
  if (!prdMode) return skip(REASONS.NOT_PRD_MODE);

  // cost-model-subscription M1 — subscription bypass. Skip the USD cost-state
  // (order 3) + tier (order 4) gates and gate on the context overflow axis.
  // DELIBERATE fail-OPEN (Codex F1, user-accepted): an absent/green signal RUNS;
  // only a POSITIVE critical overflow skips. subscriptionMode is passed explicitly
  // by the command-body caller (isSubscriptionMode(env)); contextStateRead is
  // injected (default ()=>null) so the oracle stays disk-free + unit-testable.
  if (opts.subscriptionMode === true) {
    const ctxRead = typeof opts.contextStateRead === 'function' ? opts.contextStateRead : function () { return null; };
    let ctx;
    try { ctx = ctxRead(); } catch (_e) { ctx = null; }
    const of = subscription.evaluateOverflow({
      contextRemainingPct: ctx ? ctx.context_remaining_pct : null,
      toolCount: ctx ? ctx.tool_count : null,
      thresholds: subscription.parseOverflowThresholds(env),
    });
    if (of.overflow) return skip(REASONS.SUBSCRIPTION_OVERFLOW, of.tier);
    return { run: true, reason: REASONS.OK_RUN, tier: of.tier, fleetSize: FLEET_SIZE, minRemaining: minRemaining };
  }

  // Codex F2 — expensive fan-out fails CLOSED on unknown cost-state.
  let cs;
  try {
    cs = read();
  } catch (_e) {
    cs = null;
  }
  if (!cs) return skip(REASONS.COST_STATE_UNKNOWN);

  const autoDisableTiers = parseTierOverride(env[ENV_AUTODISABLE]) || AUTODISABLE_TIERS_DEFAULT;
  const tierForFn = typeof opts.tierFor === 'function' ? opts.tierFor : null;
  const tier = cs.threshold_tier || (tierForFn ? tierForFn(cs.cost_usd) : 'green');
  if (autoDisableTiers.has(tier)) {
    const r = tier === 'notice' ? REASONS.TIER_NOTICE
      : tier === 'warning' ? REASONS.TIER_WARNING
        : REASONS.TIER_CRITICAL;
    return skip(r, tier);
  }

  return { run: true, reason: REASONS.OK_RUN, tier: tier, fleetSize: FLEET_SIZE, minRemaining: minRemaining };
}

// shouldSkipForBudget({budgetTotal, remaining, minRemaining}) → boolean
// Pure predicate mirroring the plan-fanout.js in-sandbox budget pre-guard
// (Codex F2). The Workflow sandbox has no `require`, so the Workflow inlines the
// same 1-line rule; this exported twin is what the unit test exercises (the
// "budget smoke" at the pure-logic level — real Workflow integration is the
// Task 7 dogfood). budgetTotal falsy (null / 0 — no +Nk target set) → NEVER
// skip: the structural caps (fixed fleetSize + effort:'low') are the only
// ceiling. Otherwise skip when the remaining pool can't cover the whole fleet.
function shouldSkipForBudget(opts) {
  opts = opts || {};
  if (!opts.budgetTotal) return false;
  const remaining = Number.isFinite(opts.remaining) ? opts.remaining : 0;
  const minRemaining = Number.isFinite(opts.minRemaining) ? opts.minRemaining : 0;
  return remaining < minRemaining;
}

module.exports = {
  parseFanoutMode: parseFanoutMode,
  parseFanoutMinPerAgent: parseFanoutMinPerAgent,
  parseTierOverride: parseTierOverride,
  resolveFanout: resolveFanout,
  shouldSkipForBudget: shouldSkipForBudget,
  REASONS: REASONS,
  FLEET_SIZE: FLEET_SIZE,
  MIN_PER_AGENT_DEFAULT: MIN_PER_AGENT_DEFAULT,
  AUTODISABLE_TIERS_DEFAULT: AUTODISABLE_TIERS_DEFAULT,
  ENV_MODE: ENV_MODE,
  ENV_MIN_PER_AGENT: ENV_MIN_PER_AGENT,
  ENV_AUTODISABLE: ENV_AUTODISABLE,
};
