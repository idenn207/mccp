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
// DELIBERATE DIFFERENCES from resolveFanout:
//   - a MERGE-STRATEGY gate (Task 0 / Codex F3): parallel is structurally
//     impossible unless the worktree→parent merge mechanism is PROVEN
//     (mergeStrategy === 'worktree-merge'). Any other value ('disable-parallel',
//     'same-worktree', absent) fails CLOSED to N=1 — same-worktree is forbidden
//     until atomic-merge protection ships. The M2b spike measured
//     'disable-parallel'; M4 (Task 0 run wf_1f689994-fb8) PROVED the live
//     worktree↔dispatchId correlation and flipped the work.md default to
//     'worktree-merge', so this gate now unlocks parallel under an explicit
//     opt-in (the ENABLING_MERGE_STRATEGY constant was already 'worktree-merge').
//   - a SINGLE-PARTITION short-circuit: when the partition oracle already
//     collapsed to n=1 (requestedN ≤ 1) there is nothing to parallelize.
//   - an optional in-oracle budget cap (DD6 iv): when the caller supplies
//     budgetTotal + budgetRemaining, N is capped to what the remaining pool can
//     afford; otherwise minRemaining is returned and the Workflow-sandbox
//     pre-guard (shouldSkipForBudget) enforces the same rule at spawn time.
//
// Decision order (first match wins):
//   1. MCCP_WORK_IMPLEMENT_PARALLEL != on/1     → ENV_OFF                 (default off)
//   2. mergeStrategy !== 'worktree-merge'       → MERGE_STRATEGY_DISABLED (fail-closed)
//   3. requestedN ≤ 1                           → SINGLE_PARTITION        (nothing to split)
//   4. cost-state missing/corrupt (null)        → COST_STATE_UNKNOWN      (fail-closed)
//   5. cost-tier ∈ autoDisableTiers             → TIER_*                  (notice/warning/critical)
//   6. budgetTotal set & unaffordable           → BUDGET_INSUFFICIENT     (N=1)
//   7. otherwise                                → OK_RUN + n + minRemaining

const REASONS = Object.freeze({
  OK_RUN: 'ok-run',
  ENV_OFF: 'env-off',
  MERGE_STRATEGY_DISABLED: 'merge-strategy-disabled',
  SINGLE_PARTITION: 'single-partition',
  COST_STATE_UNKNOWN: 'cost-state-unknown',
  TIER_NOTICE: 'tier-notice',
  TIER_WARNING: 'tier-warning',
  TIER_CRITICAL: 'tier-critical',
  BUDGET_INSUFFICIENT: 'budget-insufficient',
});

const MAX_WORKERS_DEFAULT = 4;
const MIN_PER_WORKER_DEFAULT = 150000;
const ENABLING_MERGE_STRATEGY = 'worktree-merge';

const AUTODISABLE_TIERS_DEFAULT = Object.freeze(
  new Set(['notice', 'warning', 'critical'])
);

const ENV_MODE = 'MCCP_WORK_IMPLEMENT_PARALLEL';
const ENV_MAX = 'MCCP_WORK_PARALLEL_MAX';
const ENV_BUDGET = 'MCCP_WORK_PARALLEL_BUDGET';
const ENV_AUTODISABLE = 'MCCP_WORK_PARALLEL_AUTODISABLE_TIER';

function warn(line) {
  process.stderr.write('[mccp:work-parallel] ' + line + '\n');
}

// parseParallelMode(env) → 'off' | 'on'. Default OFF (explicit opt-in, mirror of
// the MCCP_WORK_IMPLEMENT_WORKFLOW 0|1 kill switch). '1' or 'on' (ci) enables.
function parseParallelMode(env) {
  const raw = String((env && env[ENV_MODE]) || '').trim().toLowerCase();
  return (raw === '1' || raw === 'on') ? 'on' : 'off';
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
        '"; falling back to default (notice/warning/critical).');
      return null;
    }
  }
  return new Set(tiers);
}

// resolveFleet({ env, costStateRead, tierFor, requestedN, mergeStrategy,
//                budgetTotal, budgetRemaining })
//   → { n, run, reason, minRemaining, perWorkerEstimate, tier, mergeStrategy }
//
// costStateRead() returns a cost-state object ({cost_usd, threshold_tier}) or
// null (missing/corrupt). tierFor (optional) recomputes a tier from cost_usd
// when the stored threshold_tier is absent (default fallback 'green').
// requestedN is the partition oracle's n (the ceiling of useful parallelism).
function resolveFleet(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const perWorker = parsePerWorkerBudget(env);
  const maxWorkers = parseMaxWorkers(env);
  const mergeStrategy = typeof opts.mergeStrategy === 'string' ? opts.mergeStrategy : null;
  const reqN = (Number.isInteger(opts.requestedN) && opts.requestedN >= 1) ? opts.requestedN : 1;

  const skip = function (reason, extra) {
    return Object.assign({
      n: 1, run: false, reason: reason, minRemaining: perWorker,
      perWorkerEstimate: perWorker, tier: null, mergeStrategy: mergeStrategy,
    }, extra || {});
  };

  // 1 — parallel opt-in.
  if (parseParallelMode(env) !== 'on') return skip(REASONS.ENV_OFF);

  // 2 — merge-strategy structural gate (Task 0 / Codex F3). Only a PROVEN
  // worktree→parent merge unlocks parallel. Anything else fails closed to N=1.
  if (mergeStrategy !== ENABLING_MERGE_STRATEGY) return skip(REASONS.MERGE_STRATEGY_DISABLED);

  // 3 — nothing to parallelize (partition oracle already collapsed).
  if (reqN <= 1) return skip(REASONS.SINGLE_PARTITION);

  // 4 — expensive parallel fails CLOSED on unknown cost-state (mirror F2).
  let cs;
  try {
    cs = typeof opts.costStateRead === 'function' ? opts.costStateRead() : null;
  } catch (_e) {
    cs = null;
  }
  if (!cs) return skip(REASONS.COST_STATE_UNKNOWN);

  // 5 — cost-tier autoDisable.
  const autoDisableTiers = parseTierOverride(env[ENV_AUTODISABLE]) || AUTODISABLE_TIERS_DEFAULT;
  const tierForFn = typeof opts.tierFor === 'function' ? opts.tierFor : null;
  const tier = cs.threshold_tier || (tierForFn ? tierForFn(cs.cost_usd) : 'green');
  if (autoDisableTiers.has(tier)) {
    const r = tier === 'notice' ? REASONS.TIER_NOTICE
      : tier === 'warning' ? REASONS.TIER_WARNING
        : REASONS.TIER_CRITICAL;
    return skip(r, { tier: tier });
  }

  // cap N by the structural max, then (optionally) by the affordable budget.
  let n = Math.min(reqN, maxWorkers);

  // 6 — in-oracle budget cap (DD6 iv). Only when the caller has real budget
  // numbers; otherwise minRemaining is returned for the Workflow pre-guard.
  if (opts.budgetTotal && Number.isFinite(opts.budgetRemaining)) {
    const affordable = Math.floor(opts.budgetRemaining / perWorker);
    if (affordable < 2) return skip(REASONS.BUDGET_INSUFFICIENT, { tier: tier });
    n = Math.min(n, affordable);
  }

  return {
    n: n,
    run: true,
    reason: REASONS.OK_RUN,
    minRemaining: perWorker * n,
    perWorkerEstimate: perWorker,
    tier: tier,
    mergeStrategy: mergeStrategy,
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
  ENV_MODE: ENV_MODE,
  ENV_MAX: ENV_MAX,
  ENV_BUDGET: ENV_BUDGET,
  ENV_AUTODISABLE: ENV_AUTODISABLE,
};
