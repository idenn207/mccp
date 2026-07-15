'use strict';

// plan-fanout budget/mode oracle — decides whether the /mccp:plan GROUND fan-out
// runs, and with what fleet, given routing mode × PRD-mode × cost tier.
//
// Pure, dep-free: cost-state is INJECTED via opts.costStateRead so the oracle
// stays unit-testable without touching disk. Mirrors briefing/cost-guard.js
// (shouldSkipBriefing decision tree, frozen REASONS, parseTierOverride) and
// cost-thresholds.js (loud fail-open env parse + stderr warn + default).
//
// live-activation M1 — DEFAULT FIRING FLIPPED. parseFanoutMode now defaults ON
// (opt-OUT via 'off'/'0'), and a missing/corrupt cost-state fails OPEN (green
// assumed + COST_FAILOPEN) when costFailOpen is true (the default). The former
// fail-CLOSED behavior is preserved verbatim under costFailOpen=false — the
// MCCP_ORCHESTRATION_COST_FAIL_OPEN=0 kill switch restores the old contract.
//
// live-activation M3 — OPERATIONAL USD RETIRED AS A FIRING BLOCKER (mirror of
// implement-dispatch/budget.js; see that header for the full rationale). M1 only
// assumed green when cost-state was ABSENT, so a PRESENT sticky critical still
// skipped every fan-out. M3 gates the hard_ceiling skip behind usdBomb, empties
// AUTODISABLE_TIERS_DEFAULT, adds a catastrophic-USD ceiling as the replacement
// bomb detector (Codex F1), and applies the runaway clamp on EVERY run path rather
// than only the fail-open branch (Codex F2 — the agent-count cap is now the
// primary structural backstop for the metered path too). Keeping the clamp
// injected (not required) preserves this oracle's pure/dep-free invariant.
//
// Decision order (first match wins):
//   1. mode === 'off'                     → ENV_OFF            (default ON — opt-out)
//   2. prdMode !== true                   → NOT_PRD_MODE
//   3. cost-state missing/corrupt (null):
//        costFailOpen  → OK path, tier 'green', COST_FAILOPEN
//        !costFailOpen → COST_STATE_UNKNOWN (skip — legacy fail-closed)
//   4. usdBomb && hard_ceiling_reached    → HARD_CEILING       (M1 bomb — opt-in only)
//   5. cost-tier ∈ autoDisableTiers       → TIER_*             (M3 default: EMPTY)
//   6. cost_usd ≥ catastrophicUsd         → CATASTROPHIC_USD   (M3 replacement bomb)
//   7. otherwise                          → OK_RUN + fleetSize + minRemaining
// The injected runaway clamp then applies to EVERY run path (M3). A clamp of 0 (the
// atomic reserve could not record the launch) skips with LOCK_EXHAUSTED.

const subscription = require('../subscription');

const REASONS = Object.freeze({
  OK_RUN: 'ok-run',
  ENV_OFF: 'env-off',
  NOT_PRD_MODE: 'not-prd-mode',
  COST_STATE_UNKNOWN: 'cost-state-unknown',
  // live-activation M1 — fail-open (cost-state absent → green assumed + run).
  COST_FAILOPEN: 'cost-failopen',
  // live-activation M1 — operational USD bomb detector (hard_ceiling_reached
  // sticky true). M3: reachable ONLY under the usdBomb kill switch.
  HARD_CEILING: 'hard-ceiling',
  TIER_NOTICE: 'tier-notice',
  TIER_WARNING: 'tier-warning',
  TIER_CRITICAL: 'tier-critical',
  // live-activation M3 — replacement bomb detector (Codex F1), far above the
  // operational tiers.
  CATASTROPHIC_USD: 'catastrophic-usd',
  // cost-model-subscription M1 — positive context-overflow critical under
  // MCCP_SUBSCRIPTION (replaces the USD cost-state + tier gates).
  SUBSCRIPTION_OVERFLOW: 'subscription-overflow',
  // M3 follow-up (PR-Codex R1 F1) — the injected reserve granted 0: it could not
  // take the counter lock, so a launch here would go unrecorded and bypass the cap.
  // Mirrors orchestration-runaway REASONS.LOCK_EXHAUSTED.
  LOCK_EXHAUSTED: 'lock-exhausted',
});

const FLEET_SIZE = 4;
const MIN_PER_AGENT_DEFAULT = 150000;

// live-activation M3 — EMPTY by default (was critical-only in M1). Operational USD
// spend no longer blocks fan-out at any tier; the catastrophic-USD ceiling is the
// replacement bomb detector and the atomic agent-count cap is the structural
// backstop. usdBomb restores the M1 critical-only set (USD_BOMB_TIERS); an explicit
// MCCP_PLAN_FANOUT_AUTODISABLE_TIER override wins over either default.
const AUTODISABLE_TIERS_DEFAULT = Object.freeze(new Set([]));
const USD_BOMB_TIERS = Object.freeze(new Set(['critical']));

const ENV_MODE = 'MCCP_PLAN_FANOUT';
const ENV_MIN_PER_AGENT = 'MCCP_PLAN_FANOUT_BUDGET';
const ENV_AUTODISABLE = 'MCCP_PLAN_FANOUT_AUTODISABLE_TIER';

function warn(line) {
  process.stderr.write('[mccp:plan-fanout] ' + line + '\n');
}

// parseFanoutMode(env) → 'off' | 'on'. Default ON (live-activation M1 — explicit
// opt-OUT). A case-insensitive 'off' or '0' turns it off; anything else (incl.
// unset) is on.
function parseFanoutMode(env) {
  const raw = String((env && env[ENV_MODE]) || '').trim().toLowerCase();
  return (raw === 'off' || raw === '0') ? 'off' : 'on';
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
        '"; falling back to the default tier policy.');
      return null;
    }
  }
  return new Set(tiers);
}

// resolveFanout({env, prdMode, costStateRead, tierFor, costFailOpen, usdBomb,
//                catastrophicUsd, runawayClamp})
//   → { run, reason, tier, fleetSize, minRemaining, degraded, runawayReason }
//
// costStateRead() returns a cost-state object ({cost_usd, threshold_tier,
// hard_ceiling_reached}) or null (missing/corrupt). tierFor (optional) recomputes
// a tier from cost_usd when the stored threshold_tier is absent; default fallback
// is 'green'. costFailOpen (default true) — when cost-state is null, run instead
// of skipping (live-activation M1).
//
// M3 opts (caller parses the env — the oracle stays pure/injected):
//   usdBomb         (default false) restore the M1 operational-USD bomb detector.
//   catastrophicUsd (number) the replacement ceiling; ≤0 / non-finite disables it.
//   runawayClamp(n) → {n, degraded, reason}; now applied on EVERY run path.
function resolveFanout(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const prdMode = opts.prdMode === true;
  const read = typeof opts.costStateRead === 'function'
    ? opts.costStateRead
    : function () { return null; };
  const costFailOpen = opts.costFailOpen !== false;
  const usdBomb = opts.usdBomb === true;
  const catastrophicUsd = Number.isFinite(opts.catastrophicUsd) ? opts.catastrophicUsd : 0;
  const minPerAgent = parseFanoutMinPerAgent(env);
  const minRemaining = minPerAgent * FLEET_SIZE;

  const skip = function (reason, tier) {
    return {
      run: false, reason: reason, tier: tier || null, fleetSize: 0,
      minRemaining: minRemaining, degraded: false, runawayReason: null,
    };
  };

  // run(tier, reason) — the single RUN exit. M3 (Codex F2): applies the injected
  // runaway clamp on EVERY run path, not just the fail-open branch — with the
  // operational-USD block retired, the metered path has no USD backstop either, so
  // the atomic agent-count cap must govern both. The clamp only ever lowers the
  // fleet, so a far-from-cap session is unaffected.
  const run = function (tier, reason) {
    let fleet = FLEET_SIZE;
    let degraded = false;
    let runawayReason = null;
    if (typeof opts.runawayClamp === 'function') {
      const c = opts.runawayClamp(FLEET_SIZE);
      // n === 0 — the atomic reserve refused to grant (PR-Codex R1 F1: the counter
      // lock was unavailable, so any launch would be unrecorded and the cap would
      // be bypassed). SKIP: plan.md then keeps the inline Pattern Grounding, which
      // spawns no agent and consumes no cap, so the plan is still never blocked.
      // Checked before the n >= 1 branch, which would otherwise ignore the 0 and
      // leave the full fleet in place.
      if (c && c.n === 0) {
        return Object.assign(skip(c.reason || REASONS.LOCK_EXHAUSTED, tier), {
          degraded: true, runawayReason: c.reason || REASONS.LOCK_EXHAUSTED,
        });
      }
      if (c && Number.isInteger(c.n) && c.n >= 1 && c.n < fleet) {
        fleet = c.n;
        degraded = c.degraded === true;
        runawayReason = c.reason || null;
      } else if (c && c.degraded === true) {
        degraded = true;
        runawayReason = c.reason || null;
      }
    }
    return {
      run: true, reason: reason, tier: tier, fleetSize: fleet,
      minRemaining: minPerAgent * fleet, degraded: degraded, runawayReason: runawayReason,
    };
  };

  if (parseFanoutMode(env) === 'off') return skip(REASONS.ENV_OFF);
  if (!prdMode) return skip(REASONS.NOT_PRD_MODE);

  // cost-model-subscription M1 — subscription bypass. Skip the USD cost-state
  // (order 3) + tier (order 5) gates and gate on the context overflow axis.
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
    return run(of.tier, REASONS.OK_RUN);
  }

  // live-activation M1 — metered path. Missing cost-state now fails OPEN by
  // default (COST_FAILOPEN + runaway clamp); the =0 kill switch restores the old
  // COST_STATE_UNKNOWN fail-closed skip verbatim.
  let cs;
  try {
    cs = read();
  } catch (_e) {
    cs = null;
  }
  if (!cs) {
    if (costFailOpen) return run('green', REASONS.COST_FAILOPEN);
    return skip(REASONS.COST_STATE_UNKNOWN);
  }

  // M1 operational USD bomb detector. M3: opt-in only — by default a sticky hard
  // ceiling ($100 operational) does NOT block fan-out.
  if (usdBomb && cs.hard_ceiling_reached === true) {
    return skip(REASONS.HARD_CEILING, cs.threshold_tier || 'critical');
  }

  // cost-tier autoDisable. M3 default is EMPTY; usdBomb restores critical-only.
  // An explicit env override wins over either.
  const dflt = usdBomb ? USD_BOMB_TIERS : AUTODISABLE_TIERS_DEFAULT;
  const autoDisableTiers = parseTierOverride(env[ENV_AUTODISABLE]) || dflt;
  const tierForFn = typeof opts.tierFor === 'function' ? opts.tierFor : null;
  const tier = cs.threshold_tier || (tierForFn ? tierForFn(cs.cost_usd) : 'green');
  if (autoDisableTiers.has(tier)) {
    const r = tier === 'notice' ? REASONS.TIER_NOTICE
      : tier === 'warning' ? REASONS.TIER_WARNING
        : REASONS.TIER_CRITICAL;
    return skip(r, tier);
  }

  // M3 replacement bomb detector (Codex F1). Independent of usdBomb: even with the
  // operational block retired, a catastrophic spend still stops the fan-out.
  if (catastrophicUsd > 0 && Number.isFinite(cs.cost_usd) && cs.cost_usd >= catastrophicUsd) {
    return skip(REASONS.CATASTROPHIC_USD, tier);
  }

  return run(tier, REASONS.OK_RUN);
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
  USD_BOMB_TIERS: USD_BOMB_TIERS,
  ENV_MODE: ENV_MODE,
  ENV_MIN_PER_AGENT: ENV_MIN_PER_AGENT,
  ENV_AUTODISABLE: ENV_AUTODISABLE,
};
