'use strict';

// workflow-orchestration M2b Task 2 — fleet budget/mode oracle.
//
// Decides whether the /mccp:work Step 3 implement dispatch runs N-worker parallel
// (and with what N), given the parallel opt-in × the Task-0-measured merge
// strategy × cost tier × token budget. N-worker parallel spends tokens ~N× (deep-
// research §4: 5-agent ~3×), so this is the expensive-fan-out cost guard —
// modelled on plan-fanout/budget.js resolveFanout (same loud fail-open env parse,
// same fail-CLOSED on unknown cost-state, same minRemaining = est × N).
//
// live-activation M1 — DEFAULT FIRING FLIPPED. parseParallelMode now defaults ON
// (opt-OUT via 'off'/'0'), and a missing/corrupt cost-state fails OPEN (green
// assumed + COST_FAILOPEN) when costFailOpen is true (the default). The former
// fail-CLOSED skip is preserved verbatim under costFailOpen=false (the
// MCCP_ORCHESTRATION_COST_FAIL_OPEN=0 kill switch).
//
// live-activation M3 — OPERATIONAL USD RETIRED AS A FIRING BLOCKER. M1's fail-open
// only assumed green when cost-state was ABSENT, so a PRESENT sticky critical
// (measured: $186.92 + hard_ceiling_reached, mtime fresh enough to dodge the v1.22.0
// 6h decay) still skipped every fan-out / parallel dispatch — the PRD's root problem
// survived M1+M2. The operator contract is that operational spend is not a bomb
// (cost gates exist to bound hallucination, not to save money), so:
//   - hard_ceiling_reached no longer skips (order 5 is now gated on usdBomb),
//   - AUTODISABLE_TIERS_DEFAULT drops to EMPTY (was critical-only),
//   - a catastrophic-USD ceiling (order 7) becomes the REPLACEMENT bomb detector,
//     set far above operational ($500 default vs the $100 hard ceiling) so $186
//     fires while a genuine runaway still stops (Codex F1),
//   - the runaway clamp now applies to EVERY run path, not just the fail-open one:
//     with USD no longer blocking, the atomic agent-count cap is the primary
//     structural backstop and the metered path needs it just as much (Codex F2),
//   - MCCP_ORCHESTRATION_USD_BOMB restores all of the M1 behavior (Codex F4).
// The merge-strategy, single-partition and budget gates are UNCHANGED (structural
// safety preserved), and an explicit MCCP_WORK_PARALLEL_AUTODISABLE_TIER override
// still wins over the default in both directions.
//
// DELIBERATE DIFFERENCES from resolveFanout:
//   - a MERGE-STRATEGY gate (Task 0 / Codex F3): parallel is structurally
//     impossible unless the worktree→parent merge mechanism is PROVEN
//     (mergeStrategy === 'worktree-merge'). Any other value ('disable-parallel',
//     'same-worktree', absent) fails CLOSED to N=1 — same-worktree is forbidden
//     until atomic-merge protection ships.
//   - a SINGLE-PARTITION short-circuit: when the partition oracle already
//     collapsed to n=1 (requestedN ≤ 1) there is nothing to parallelize.
//   - an optional in-oracle budget cap (DD6 iv): when the caller supplies
//     budgetTotal + budgetRemaining, N is capped to what the remaining pool can
//     afford; otherwise minRemaining is returned and the Workflow-sandbox
//     pre-guard (shouldSkipForBudget) enforces the same rule at spawn time.
//
// Decision order (first match wins):
//   1. MCCP_WORK_IMPLEMENT_PARALLEL === off/0   → ENV_OFF                 (default ON — opt-out)
//   2. mergeStrategy !== 'worktree-merge'       → MERGE_STRATEGY_DISABLED (fail-closed)
//   3. requestedN ≤ 1                           → SINGLE_PARTITION        (nothing to split)
//   4. cost-state missing/corrupt (null):
//        costFailOpen  → tier 'green', COST_FAILOPEN
//        !costFailOpen → COST_STATE_UNKNOWN         (legacy fail-closed)
//   5. usdBomb && hard_ceiling_reached          → HARD_CEILING            (M1 bomb — opt-in only)
//   6. cost-tier ∈ autoDisableTiers             → TIER_*                  (M3 default: EMPTY)
//   7. cost_usd ≥ catastrophicUsd               → CATASTROPHIC_USD        (M3 replacement bomb)
//   8. budgetTotal set & unaffordable           → BUDGET_INSUFFICIENT     (N=1)
//   9. otherwise                                → OK_RUN / COST_FAILOPEN + n + minRemaining
// The injected runaway clamp then applies to EVERY run path (M3) — it only ever
// lowers N, so a far-from-cap session is unaffected.

const subscription = require('../subscription');

const REASONS = Object.freeze({
  OK_RUN: 'ok-run',
  ENV_OFF: 'env-off',
  MERGE_STRATEGY_DISABLED: 'merge-strategy-disabled',
  SINGLE_PARTITION: 'single-partition',
  COST_STATE_UNKNOWN: 'cost-state-unknown',
  // live-activation M1 — fail-open (cost-state absent → green assumed + run).
  COST_FAILOPEN: 'cost-failopen',
  // live-activation M1 — operational USD bomb detector (hard_ceiling_reached
  // sticky true). M3: reachable ONLY under the usdBomb kill switch.
  HARD_CEILING: 'hard-ceiling',
  TIER_NOTICE: 'tier-notice',
  TIER_WARNING: 'tier-warning',
  TIER_CRITICAL: 'tier-critical',
  // live-activation M3 — replacement bomb detector (Codex F1). Distinct from the
  // operational tiers: fires only at a catastrophic ceiling far above $100.
  CATASTROPHIC_USD: 'catastrophic-usd',
  BUDGET_INSUFFICIENT: 'budget-insufficient',
  // cost-model-subscription M1 — positive context-overflow critical under
  // MCCP_SUBSCRIPTION (replaces the USD cost-state + tier gates, orders 4-6).
  SUBSCRIPTION_OVERFLOW: 'subscription-overflow',
});

// MAX_WORKERS_DEFAULT (+ MCCP_WORK_PARALLEL_MAX override) is the per-dispatch
// worker ABSOLUTE ceiling — N is NEVER allowed above it (n = min(reqN, maxWorkers)
// below). This is the per-burst runaway cap; the session-cumulative runaway cap
// (across repeated / recursive / retried dispatches) is the independent
// orchestration-runaway.js counter, injected as opts.runawayClamp.
const MAX_WORKERS_DEFAULT = 4;
const MIN_PER_WORKER_DEFAULT = 150000;
const ENABLING_MERGE_STRATEGY = 'worktree-merge';

// live-activation M3 — EMPTY by default (was critical-only in M1). Operational USD
// spend no longer blocks firing at any tier; the replacement bomb detector is the
// catastrophic-USD ceiling, and the atomic agent-count cap is the structural
// backstop. Under the usdBomb kill switch the M1 critical-only set is restored
// (USD_BOMB_TIERS). An explicit MCCP_WORK_PARALLEL_AUTODISABLE_TIER override wins
// over either default.
const AUTODISABLE_TIERS_DEFAULT = Object.freeze(new Set([]));
const USD_BOMB_TIERS = Object.freeze(new Set(['critical']));

const ENV_MODE = 'MCCP_WORK_IMPLEMENT_PARALLEL';
const ENV_MAX = 'MCCP_WORK_PARALLEL_MAX';
const ENV_BUDGET = 'MCCP_WORK_PARALLEL_BUDGET';
const ENV_AUTODISABLE = 'MCCP_WORK_PARALLEL_AUTODISABLE_TIER';

function warn(line) {
  process.stderr.write('[mccp:work-parallel] ' + line + '\n');
}

// parseParallelMode(env) → 'off' | 'on'. Default ON (live-activation M1 — explicit
// opt-OUT). A case-insensitive 'off' or '0' turns it off; anything else (incl.
// unset) is on.
function parseParallelMode(env) {
  const raw = String((env && env[ENV_MODE]) || '').trim().toLowerCase();
  return (raw === 'off' || raw === '0') ? 'off' : 'on';
}

function parsePositiveInt(env, key, def) {
  const raw = env && env[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return def;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    warn(key + ' must be a positive integer; got "' + raw + '". Falling back to default ' + def + '.');
    return def;
  }
  return Math.floor(n);
}

function parseMaxWorkers(env) { return parsePositiveInt(env, ENV_MAX, MAX_WORKERS_DEFAULT); }
function parsePerWorkerBudget(env) { return parsePositiveInt(env, ENV_BUDGET, MIN_PER_WORKER_DEFAULT); }

// parseTierOverride(raw) → Set|null. Loud fail-open on unknown token (mirror of
// plan-fanout/budget.js).
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

// resolveFleet({ env, costStateRead, tierFor, requestedN, mergeStrategy,
//                budgetTotal, budgetRemaining, costFailOpen, usdBomb,
//                catastrophicUsd, runawayClamp })
//   → { n, run, reason, minRemaining, perWorkerEstimate, tier, mergeStrategy,
//       degraded, runawayReason }
//
// costStateRead() returns a cost-state object ({cost_usd, threshold_tier,
// hard_ceiling_reached}) or null (missing/corrupt). tierFor (optional) recomputes
// a tier from cost_usd when the stored threshold_tier is absent (default fallback
// 'green'). requestedN is the partition oracle's n (the ceiling of useful
// parallelism). costFailOpen (default true) — when cost-state is null, run
// instead of skipping.
//
// M3 opts (caller parses the env — the oracle stays pure/injected):
//   usdBomb         (default false) restore the M1 operational-USD bomb detector.
//   catastrophicUsd (number) the replacement ceiling; ≤0 / non-finite disables it.
//   runawayClamp(n) → {n, degraded, reason}; now applied on EVERY run path.
function resolveFleet(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const perWorker = parsePerWorkerBudget(env);
  const maxWorkers = parseMaxWorkers(env);
  const mergeStrategy = typeof opts.mergeStrategy === 'string' ? opts.mergeStrategy : null;
  const reqN = (Number.isInteger(opts.requestedN) && opts.requestedN >= 1) ? opts.requestedN : 1;
  const costFailOpen = opts.costFailOpen !== false;
  const usdBomb = opts.usdBomb === true;
  const catastrophicUsd = Number.isFinite(opts.catastrophicUsd) ? opts.catastrophicUsd : 0;

  const skip = function (reason, extra) {
    return Object.assign({
      n: 1, run: false, reason: reason, minRemaining: perWorker,
      perWorkerEstimate: perWorker, tier: null, mergeStrategy: mergeStrategy,
      degraded: false, runawayReason: null,
    }, extra || {});
  };

  // 1 — parallel opt-in (default ON — opt-out via off/0).
  if (parseParallelMode(env) === 'off') return skip(REASONS.ENV_OFF);

  // 2 — merge-strategy structural gate (Task 0 / Codex F3). Only a PROVEN
  // worktree→parent merge unlocks parallel. Anything else fails closed to N=1.
  if (mergeStrategy !== ENABLING_MERGE_STRATEGY) return skip(REASONS.MERGE_STRATEGY_DISABLED);

  // 3 — nothing to parallelize (partition oracle already collapsed).
  if (reqN <= 1) return skip(REASONS.SINGLE_PARTITION);

  // 4-6 — tier gate. Metered path: USD cost-state (fail-OPEN on unknown by
  // default) + hard_ceiling bomb detector + tier autoDisable. Subscription path
  // (cost-model-subscription M1): bypass ALL of it and gate on the context
  // overflow axis, fail-OPEN (Codex F1). Orders 1/2/3/7 unchanged.
  let tier;
  let failOpen = false;
  if (opts.subscriptionMode === true) {
    const ctxRead = typeof opts.contextStateRead === 'function' ? opts.contextStateRead : function () { return null; };
    let ctx;
    try { ctx = ctxRead(); } catch (_e) { ctx = null; }
    const of = subscription.evaluateOverflow({
      contextRemainingPct: ctx ? ctx.context_remaining_pct : null,
      toolCount: ctx ? ctx.tool_count : null,
      thresholds: subscription.parseOverflowThresholds(env),
    });
    if (of.overflow) return skip(REASONS.SUBSCRIPTION_OVERFLOW, { tier: of.tier });
    tier = of.tier;
  } else {
    let cs;
    try {
      cs = typeof opts.costStateRead === 'function' ? opts.costStateRead() : null;
    } catch (_e) {
      cs = null;
    }
    if (!cs) {
      // 4 — live-activation M1: missing cost-state fails OPEN by default; the =0
      // kill switch restores the old COST_STATE_UNKNOWN fail-closed skip.
      if (!costFailOpen) return skip(REASONS.COST_STATE_UNKNOWN);
      tier = 'green';
      failOpen = true;
    } else {
      // 5 — M1 operational USD bomb detector. M3: opt-in only. By default a sticky
      // hard ceiling ($100 operational) does NOT block firing.
      if (usdBomb && cs.hard_ceiling_reached === true) {
        return skip(REASONS.HARD_CEILING, { tier: cs.threshold_tier || 'critical' });
      }
      // 6 — cost-tier autoDisable. M3 default is EMPTY; usdBomb restores
      // critical-only. An explicit env override wins over either.
      const dflt = usdBomb ? USD_BOMB_TIERS : AUTODISABLE_TIERS_DEFAULT;
      const autoDisableTiers = parseTierOverride(env[ENV_AUTODISABLE]) || dflt;
      const tierForFn = typeof opts.tierFor === 'function' ? opts.tierFor : null;
      tier = cs.threshold_tier || (tierForFn ? tierForFn(cs.cost_usd) : 'green');
      if (autoDisableTiers.has(tier)) {
        const r = tier === 'notice' ? REASONS.TIER_NOTICE
          : tier === 'warning' ? REASONS.TIER_WARNING
            : REASONS.TIER_CRITICAL;
        return skip(r, { tier: tier });
      }
      // 7 — M3 replacement bomb detector (Codex F1). Independent of usdBomb: even
      // with the operational block retired, a catastrophic spend still stops the
      // fleet. Disable only by setting the ceiling absurdly high.
      if (catastrophicUsd > 0 && Number.isFinite(cs.cost_usd) && cs.cost_usd >= catastrophicUsd) {
        return skip(REASONS.CATASTROPHIC_USD, { tier: tier });
      }
    }
  }

  // cap N by the structural max, then (optionally) by the affordable budget.
  let n = Math.min(reqN, maxWorkers);

  // 8 — in-oracle budget cap (DD6 iv). Only when the caller has real budget
  // numbers; otherwise minRemaining is returned for the Workflow pre-guard.
  if (opts.budgetTotal && Number.isFinite(opts.budgetRemaining)) {
    const affordable = Math.floor(opts.budgetRemaining / perWorker);
    if (affordable < 2) return skip(REASONS.BUDGET_INSUFFICIENT, { tier: tier });
    n = Math.min(n, affordable);
  }

  // Catastrophic-runaway backstop. M3 (Codex F2): applied on EVERY run path, not
  // just the fail-open one — with operational USD retired, the metered path has no
  // USD block either, so the agent-count cap is its backstop too. The injected
  // clamp is the ATOMIC reserveWorkers for firing callers (it grants AND counts)
  // and the pure clampForRunaway for the read-only preview. Never raises N.
  let degraded = false;
  let runawayReason = null;
  if (typeof opts.runawayClamp === 'function') {
    const c = opts.runawayClamp(n);
    if (c && Number.isInteger(c.n) && c.n >= 1) {
      if (c.n < n) n = c.n;
      degraded = c.degraded === true;
      runawayReason = c.reason || null;
    }
  }

  return {
    n: n,
    run: true,
    reason: failOpen ? REASONS.COST_FAILOPEN : REASONS.OK_RUN,
    minRemaining: perWorker * n,
    perWorkerEstimate: perWorker,
    tier: tier,
    mergeStrategy: mergeStrategy,
    degraded: degraded,
    runawayReason: runawayReason,
  };
}

// shouldSkipForBudget({budgetTotal, remaining, minRemaining}) → boolean
// Pure predicate the Workflow sandbox inlines (no `require` there). budgetTotal
// falsy (no +Nk target) → NEVER skip; the structural caps govern. Otherwise skip
// when the remaining pool can't cover the whole fleet. Identical contract to
// plan-fanout/budget.js shouldSkipForBudget.
function shouldSkipForBudget(opts) {
  opts = opts || {};
  if (!opts.budgetTotal) return false;
  const remaining = Number.isFinite(opts.remaining) ? opts.remaining : 0;
  const minRemaining = Number.isFinite(opts.minRemaining) ? opts.minRemaining : 0;
  return remaining < minRemaining;
}

module.exports = {
  resolveFleet: resolveFleet,
  shouldSkipForBudget: shouldSkipForBudget,
  parseParallelMode: parseParallelMode,
  parseMaxWorkers: parseMaxWorkers,
  parsePerWorkerBudget: parsePerWorkerBudget,
  parseTierOverride: parseTierOverride,
  REASONS: REASONS,
  MAX_WORKERS_DEFAULT: MAX_WORKERS_DEFAULT,
  MIN_PER_WORKER_DEFAULT: MIN_PER_WORKER_DEFAULT,
  ENABLING_MERGE_STRATEGY: ENABLING_MERGE_STRATEGY,
  AUTODISABLE_TIERS_DEFAULT: AUTODISABLE_TIERS_DEFAULT,
  USD_BOMB_TIERS: USD_BOMB_TIERS,
  ENV_MODE: ENV_MODE,
  ENV_MAX: ENV_MAX,
  ENV_BUDGET: ENV_BUDGET,
  ENV_AUTODISABLE: ENV_AUTODISABLE,
};
