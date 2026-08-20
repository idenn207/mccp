'use strict';

// workflow-orchestration live-activation M2 Task 1 — firing-preview oracle + CLI.
//
// M1 flipped the fan-out / parallel / route oracles to DEFAULT firing (opt-out) +
// cost fail-open + a cost-state-independent runaway backstop, but the real
// LLM-runtime firing was never OBSERVED. Running /mccp:work end-to-end to observe
// it is recursive + expensive, so M2 splits observation into two axes. This file
// is axis (1): a LOW-COST firing-preview tool that reuses the EXACT Step 3 oracles
// (resolveFanout / resolveFleet / resolveWorkRoute / parseMergedVerifyMode /
// runaway readCounter) READ-ONLY to answer "what WOULD fire right now?" with ZERO
// LLM spend — measuring the default firing rate without spending, and pre-clearing
// broken wiring before a live run.
//
// CORRECTNESS SPINE (Codex F1) — oracle `run` is a COMPONENT signal, NOT proof of
// firing. The Step 3 route (inline / task / workflow-single / workflow-parallel)
// decides what actually fires, gated by caller-side premises (isolate, prepared
// artifacts) the oracle never sees. So the preview:
//   - calls the SAME oracles (single SoT — never re-implements the decision tree),
//   - projects the mid-run artifact presence honestly (labelled *_assumed),
//   - runs resolveWorkRoute as the PRIMARY firing decision, and
//   - emits oracle_run (raw) AND effective_fire (route-composed) SEPARATELY, so
//     "oracle says run" can never be mistaken for "it fires" (e.g. ISOLATE=0 or a
//     single-partition plan → run:true but parallel_fires:false).
//
// READ-ONLY INVARIANT — this module imports readCounter / clampForRunaway /
// parseMaxAgents / parseUsdBomb / parseCatastrophicUsd from orchestration-runaway
// but NEVER a mutating counter API; the injected costStateRead / contextStateRead
// / runawayRead are all read-side. Observation must never mutate the state it
// observes. (The static invariant test strips comments then asserts the mutating
// symbols have no import/call path in the code.)
//
// M3 — the firing callers now clamp through the ATOMIC reserveWorkers, which
// grants AND bumps in one critical section. The preview must NOT use it: a
// preview that reserved workers would consume the session's runaway headroom just
// by looking. So it keeps injecting the PURE clampForRunaway, and instead
// forwards the two new M3 axes (usdBomb / catastrophicUsd) to the oracles so the
// preview verdict still matches what the command bodies would decide.
//
// Mirrors: work.md:188-208 oracle composition, budget.js / plan-fanout/budget.js
// injected-read pure oracles, orchestration-runaway.js:92 read-only counter,
// route.js:55 resolveWorkRoute caller-gate SoT, dep-check.js require.main CLI.

const fanoutBudget = require('./plan-fanout/budget');
const fleetBudget = require('./implement-dispatch/budget');
const routeOracle = require('./implement-dispatch/route');
const verifyOracle = require('./implement-dispatch/verify');
const partition = require('./implement-dispatch/partition');
// readCounter + clampForRunaway + parseMaxAgents + the M3 env parsers ONLY — the
// mutating counter APIs are never imported/called here (the read-only invariant; a
// comment-stripped static scan of this file must find no mutating import/call path).
const runaway = require('./orchestration-runaway');
const envValue = require('./env-contract/value');

function warn(line) {
  process.stderr.write('[mccp:orchestration-preview] ' + line + '\n');
}

// costFailOpen mirror of work.md Step 3 — default true; only an explicit '=0'
// restores the legacy fail-closed COST_STATE_UNKNOWN skip.
function parseCostFailOpen(env) {
  return envValue.parseBool(env || process.env, 'MCCP_ORCHESTRATION_COST_FAIL_OPEN');
}

// mergeStrategy — explicit opt wins; else env MCCP_WORK_MERGE_STRATEGY default
// worktree-merge (mirror of work.md `${MCCP_WORK_MERGE_STRATEGY:-worktree-merge}`).
function resolveMergeStrategy(opts, env) {
  if (typeof opts.mergeStrategy === 'string' && opts.mergeStrategy.trim() !== '') {
    return opts.mergeStrategy;
  }
  const raw = env && env.MCCP_WORK_MERGE_STRATEGY;
  return (raw === undefined || raw === null || String(raw).trim() === '')
    ? 'worktree-merge' : String(raw).trim();
}

// isolate — mirror of work.md `ISOLATE="${MCCP_WORK_ISOLATE_IMPLEMENT:-1}"` then
// `[ "$ISOLATE" != "0" ]`.
function resolveIsolate(env) {
  return envValue.parseBool(env || process.env, 'MCCP_WORK_ISOLATE_IMPLEMENT');
}

// previewFiring(opts) → structured firing snapshot. PURE — every disk touch is an
// INJECTED read-only function (costStateRead / contextStateRead / runawayRead).
// No fs, no spawn, no counter mutation, no cost/state write.
//
//   env               process.env-like
//   planText          plan markdown string (fleet requestedN via partition) | null
//   prdMode           PRD-artifact mode (enables the fan-out gate)
//   mergeStrategy     optional override; default from env (worktree-merge)
//   costStateRead     () → cost-state | null   (injected; read-only)
//   tierFor           (usd) → tier             (injected; optional)
//   contextStateRead  () → context-state | null (injected; subscription axis)
//   runawayRead       () → { launched, sessionId } (injected readCounter)
//   subscriptionMode  boolean (MCCP_SUBSCRIPTION active)
function previewFiring(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const planText = typeof opts.planText === 'string' ? opts.planText : null;
  const prdMode = opts.prdMode === true;
  const subscriptionMode = opts.subscriptionMode === true;
  const costFailOpen = parseCostFailOpen(env);
  const mergeStrategy = resolveMergeStrategy(opts, env);
  const isolate = resolveIsolate(env);
  // M3 — same env parse the command bodies run, so the preview verdict cannot
  // drift from the real firing decision.
  const usdBomb = runaway.parseUsdBomb(env);
  const catastrophicUsd = runaway.parseCatastrophicUsd(env);

  // Memoize the injected cost-state read: ONE disk touch, and the display view is
  // guaranteed identical to what the oracles saw. Read-only either way.
  const rawCostRead = typeof opts.costStateRead === 'function' ? opts.costStateRead : function () { return null; };
  let csResolved = false;
  let csValue = null;
  const costStateRead = function () {
    if (!csResolved) {
      try { csValue = rawCostRead(); } catch (_e) { csValue = null; }
      csResolved = true;
    }
    return csValue;
  };
  const tierFor = typeof opts.tierFor === 'function' ? opts.tierFor : null;
  const contextStateRead = typeof opts.contextStateRead === 'function' ? opts.contextStateRead : function () { return null; };
  const runawayRead = typeof opts.runawayRead === 'function' ? opts.runawayRead : function () { return { launched: 0 }; };

  // ── read-only observation of the session runaway counter ──────────────────
  let launched = 0;
  let sessionId = runaway.resolveSessionKey(env);
  try {
    const rc = runawayRead() || {};
    if (Number.isFinite(rc.launched) && rc.launched >= 0) launched = Math.floor(rc.launched);
    if (typeof rc.sessionId === 'string' && rc.sessionId) sessionId = rc.sessionId;
  } catch (_e) { /* fail-open — launched stays 0 */ }
  const maxAgents = runaway.parseMaxAgents(env);

  // injected PURE clamp (mirror of work.md Step 3 — no disk).
  const runawayClamp = function (n) {
    return runaway.clampForRunaway({ requestedN: n, launchedSoFar: launched, env: env });
  };

  // ── fan-out oracle (plan GROUND gate) — component signal ───────────────────
  const fanout = fanoutBudget.resolveFanout({
    env: env, prdMode: prdMode, costStateRead: costStateRead, tierFor: tierFor,
    costFailOpen: costFailOpen, usdBomb: usdBomb, catastrophicUsd: catastrophicUsd,
    runawayClamp: runawayClamp,
    subscriptionMode: subscriptionMode, contextStateRead: contextStateRead,
  });

  // ── fleet oracle (work Step 3 parallel gate) — component signal ────────────
  let partitionResult = null;
  let requestedN = null;
  let fleet = null;
  if (planText !== null) {
    partitionResult = partition.partitionFromPlanText(planText, fleetBudget.parseMaxWorkers(env));
    requestedN = partitionResult.n;
    fleet = fleetBudget.resolveFleet({
      env: env, mergeStrategy: mergeStrategy, requestedN: requestedN,
      costStateRead: costStateRead, tierFor: tierFor, costFailOpen: costFailOpen,
      usdBomb: usdBomb, catastrophicUsd: catastrophicUsd,
      runawayClamp: runawayClamp, subscriptionMode: subscriptionMode, contextStateRead: contextStateRead,
    });
  }

  // ── caller-side gates the command body layers ON TOP of the oracle (F1) ─────
  // isolate / workflow_mode / partition_n are REAL derivations (env + plan);
  // the *_assumed flags are honest projections of mid-run artifacts that do not
  // exist at preview time (dispatch-*-args.json), NOT real probes.
  const workflowMode = routeOracle.parseWorkflowMode(env);
  const callerGates = {
    isolate: isolate,
    workflow_mode: workflowMode,
    partition_n: requestedN,
    prepare_assumed: true,
    fleet_args_assumed: true,
    workflow_available_assumed: true,
  };

  // ── route projection (PRIMARY firing decision — F1) ────────────────────────
  // Feed the projected artifact presence into the SAME resolveWorkRoute the
  // command body calls. hasFleetArgs is derived from the oracle output (fleet
  // args are only emitted when fleet.run && n>1), so a single-partition or
  // opt-out plan can never project a parallel route. isolate=0 dominates → inline.
  const hasFleetArgs = !!(fleet && fleet.run === true && fleet.n > 1);
  const hasPrepare = isolate && !hasFleetArgs;   // single prepare runs when isolate on & no fleet
  const hasWorkflowArgs = hasPrepare;            // workflow args emitted alongside prepare
  const workflowAvailable = true;                // projection (workflow_available_assumed)
  const routeInputs = {
    isolate: isolate, hasFleetArgs: hasFleetArgs, hasPrepare: hasPrepare,
    hasWorkflowArgs: hasWorkflowArgs, workflowAvailable: workflowAvailable,
  };
  let route = routeOracle.resolveWorkRoute(Object.assign({ env: env }, routeInputs));

  // ── single-worker cap projection (Implement-Codex R1 F1, 7th round) ────────
  // Step 3.route now reserves ONE worker at the common pre-launch boundary whenever
  // no fleet reservation exists and the route launches an agent — the fix for the cap
  // having only ever counted parallel fleets. At cap that reserve is refused and the
  // route degrades to inline, so projecting the raw route here would report
  // "task fires" for a session that will actually run inline: precisely the false
  // green-light effective_fire exists to block (M2 Codex F1), and the same reasoning
  // that made the 5th round share clampForRunaway's formula with the firing path.
  //
  // hasFleetArgs ⇒ resolveFleet already reserved, so the boundary reserve does not
  // apply. Uses the injected PURE clamp — observing headroom must never consume it.
  let singleReserveDenied = false;
  if (!hasFleetArgs && routeOracle.requiresReservation(route)) {
    const c = runawayClamp(1);
    if (c && c.n === 0) {
      singleReserveDenied = true;
      route = routeOracle.ROUTES.INLINE;
    }
  }

  // ── merged-verify axis (enforce/warn/off) ──────────────────────────────────
  const mergedVerify = { mode: verifyOracle.parseMergedVerifyMode(env) };

  // ── effective firing = oracle run AND route (F1 — false green-light block) ──
  const fleetRun = fleet ? fleet.run === true : false;
  const effectiveFire = {
    fanout_fires: fanout.run === true,   // fan-out is a plan-GROUND gate, route-independent
    parallel_fires: fleetRun && route === routeOracle.ROUTES.WORKFLOW_PARALLEL,
    single_fires: route === routeOracle.ROUTES.WORKFLOW_SINGLE,
    task_fires: route === routeOracle.ROUTES.TASK,
    inline: route === routeOracle.ROUTES.INLINE,
  };

  // ── cost-state display (read from the same memoized reader) ────────────────
  const cs = costStateRead();
  const costState = {
    present: !!cs,
    tier: cs ? (cs.threshold_tier || null) : null,
    hard_ceiling: cs ? cs.hard_ceiling_reached === true : false,
    // M3 — surfaced so the operator can see how far the observed spend is from the
    // catastrophic ceiling (operational tiers no longer block firing).
    cost_usd: cs && Number.isFinite(cs.cost_usd) ? cs.cost_usd : null,
  };

  return {
    env_summary: {
      plan_fanout: fanoutBudget.parseFanoutMode(env),
      parallel: fleetBudget.parseParallelMode(env),
      workflow_mode: workflowMode,
      merge_strategy: mergeStrategy,
      cost_fail_open: costFailOpen,
      subscription: subscriptionMode,
      isolate: isolate,
      max_agents: maxAgents,
      // M3 axes — usd_bomb restores the M1 operational-USD block; catastrophic_usd
      // is the replacement ceiling that survives its retirement.
      usd_bomb: usdBomb,
      catastrophic_usd: catastrophicUsd,
    },
    cost_state: costState,
    runaway: {
      session_id: sessionId,
      launched: launched,
      max_agents: maxAgents,
      headroom: Math.max(0, maxAgents - launched),
      // 7th round F1 — the boundary reserve would be refused, so a route that names a
      // worker actually degrades to inline. Surfaced so `route` is never silently
      // rewritten: the projection is visible, not just its effect.
      single_reserve_denied: singleReserveDenied,
    },
    fanout: fanout,                 // raw resolveFanout return (byte-consistent w/ direct call)
    fleet: fleet,                   // raw resolveFleet return | null (no --plan)
    merged_verify: mergedVerify,
    caller_gates: callerGates,
    route: route,                   // raw resolveWorkRoute return (string)
    route_inputs: routeInputs,      // projected inputs (transparency + test reconstruction)
    oracle_run: {
      fanout: fanout.run === true,
      fleet: fleet ? fleet.run === true : null,
    },
    effective_fire: effectiveFire,
    partition: partitionResult
      ? { n: partitionResult.n, reason: partitionResult.reason, collapsed: partitionResult.collapsed }
      : null,
  };
}

// ── human-readable renderer ───────────────────────────────────────────────────

function fireMark(b) { return b ? '✅ 발화' : '⛔ skip'; }

function renderHuman(r) {
  const e = r.env_summary;
  const lines = [];
  lines.push('mccp orchestration firing-preview  (read-only · LLM 소비 0)');
  lines.push('');
  lines.push('env      : fan-out=' + e.plan_fanout + ' parallel=' + e.parallel +
    ' workflow=' + e.workflow_mode + ' isolate=' + e.isolate);
  lines.push('           merge=' + e.merge_strategy + ' cost_fail_open=' + e.cost_fail_open +
    ' subscription=' + e.subscription + ' max_agents=' + e.max_agents);
  lines.push('           usd_bomb=' + e.usd_bomb + ' (on=M1 operational-USD 차단 복원)' +
    ' catastrophic_usd=$' + e.catastrophic_usd);
  lines.push('cost-state: ' + (r.cost_state.present
    ? ('present tier=' + r.cost_state.tier + ' hard_ceiling=' + r.cost_state.hard_ceiling +
      (r.cost_state.cost_usd === null ? '' : ' cost=$' + r.cost_state.cost_usd) +
      (e.usd_bomb ? ' — operational USD 차단 활성(usd_bomb=on)'
        : ' — operational USD 비차단(M3); catastrophic $' + e.catastrophic_usd + '만 차단'))
    : 'ABSENT — fail-open green 가정 (cost_fail_open=' + e.cost_fail_open + ')'));
  lines.push('runaway  : launched=' + r.runaway.launched + '/' + r.runaway.max_agents +
    ' headroom=' + r.runaway.headroom + ' (session=' + r.runaway.session_id + ')' +
    (r.runaway.single_reserve_denied
      ? ' — cap 소진: 단일 worker 예약 거부 → route가 inline으로 강등된다'
      : ''));
  lines.push('');
  lines.push('── component signals (oracle run — 필요조건이지 발화 보장 아님) ──');
  lines.push('  fan-out : run=' + r.fanout.run + ' reason=' + r.fanout.reason +
    ' fleetSize=' + r.fanout.fleetSize + (r.fanout.degraded ? ' [degraded ' + r.fanout.runawayReason + ']' : ''));
  if (r.fleet) {
    lines.push('  fleet   : run=' + r.fleet.run + ' reason=' + r.fleet.reason +
      ' n=' + r.fleet.n + ' (partition N=' + r.caller_gates.partition_n +
      (r.partition ? '/' + r.partition.reason : '') + ')' +
      (r.fleet.degraded ? ' [degraded ' + r.fleet.runawayReason + ']' : ''));
  } else {
    lines.push('  fleet   : N/A (no --plan; requestedN 미도출)');
  }
  lines.push('  verify  : mode=' + r.merged_verify.mode);
  lines.push('');
  lines.push('── route (PRIMARY firing decision) ──');
  lines.push('  route=' + r.route);
  lines.push('  inputs: isolate=' + r.route_inputs.isolate + ' fleetArgs*=' + r.route_inputs.hasFleetArgs +
    ' prepare*=' + r.route_inputs.hasPrepare + ' wfArgs*=' + r.route_inputs.hasWorkflowArgs +
    ' wfAvail*=' + r.route_inputs.workflowAvailable);
  lines.push('  * = mid-run 아티팩트 투영 가정 (실 probe 아님 — caller_gates.*_assumed)');
  lines.push('');
  lines.push('── effective_fire (oracle run AND route) ──');
  lines.push('  fan-out (plan GROUND) : ' + fireMark(r.effective_fire.fanout_fires));
  lines.push('  parallel implement    : ' + fireMark(r.effective_fire.parallel_fires));
  lines.push('  single-worker (wf)    : ' + fireMark(r.effective_fire.single_fires));
  lines.push('  task isolate          : ' + fireMark(r.effective_fire.task_fires));
  lines.push('  inline                : ' + (r.effective_fire.inline ? '✅ (격리 off / prepare 실패)' : '—'));
  return lines.join('\n');
}

function printUsage() {
  process.stdout.write([
    'Usage: node orchestration-preview.js [--plan <path>] [--prd] [--json]',
    '  --plan <path>  derive the fleet requestedN from the plan markdown (partition oracle)',
    '  --prd          treat input as PRD-artifact mode (enables the plan fan-out gate)',
    '  --json         machine-readable JSON (default: human-readable)',
    '',
    'Read-only: reuses the /mccp:work Step 3 oracles (resolveFanout / resolveFleet /',
    'resolveWorkRoute / merged-verify / runaway readCounter) to preview what WOULD fire',
    'under the current env + cost-state + runaway counter. NEVER mutates any state.',
  ].join('\n') + '\n');
}

// ── require.main CLI (lib + thin CLI, mirror of dep-check.js) ──────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let planPath = null;
  let prdMode = false;
  let asJson = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--plan') {
      planPath = args[i + 1];
      i++;
      if (!planPath) { warn('--plan requires a path argument; ignoring.'); planPath = null; }
    } else if (a === '--prd') {
      prdMode = true;
    } else if (a === '--json') {
      asJson = true;
    } else if (a === '-h' || a === '--help') {
      printUsage();
      process.exit(0);
    } else {
      warn('unknown argument "' + a + '" (ignored — loud fail-open).');
    }
  }

  const fs = require('fs');
  const costState = require('./cost-state');
  const contextState = require('./context-state');
  const subscription = require('./subscription');

  let planText = null;
  if (planPath) {
    try {
      planText = fs.readFileSync(planPath, 'utf8');
    } catch (err) {
      warn('could not read --plan "' + planPath + '": ' + err.message + ' (fleet N/A).');
      planText = null;
    }
  }

  const env = process.env;
  const sessionId = runaway.resolveSessionKey(env);
  const report = previewFiring({
    env: env,
    planText: planText,
    prdMode: prdMode,
    subscriptionMode: subscription.isSubscriptionMode(env),
    costStateRead: costState.readState,
    tierFor: costState.tierFor,
    contextStateRead: contextState.readState,
    runawayRead: function () { return runaway.readCounter({ sessionId: sessionId }); },
  });

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(renderHuman(report) + '\n');
  }
}

module.exports = {
  previewFiring: previewFiring,
  renderHuman: renderHuman,
};
