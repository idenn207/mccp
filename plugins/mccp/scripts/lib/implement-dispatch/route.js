'use strict';

// workflow-orchestration live-activation M1 Task 4b — /mccp:work Step 3 route
// oracle (Codex F3 absorption).
//
// The Step 3.route decision (inline / task / workflow-single / workflow-parallel)
// used to live ONLY in work.md markdown — untested, and the very surface this
// milestone is trying to activate. This pure function lifts that decision tree
// into a single SoT the command body calls, so the firing route is mechanically
// testable (route.test.js exercises the full env × artifact matrix).
//
// Inputs (all derived by the command body from artifact presence + env):
//   env               process.env-like (reads MCCP_WORK_IMPLEMENT_WORKFLOW)
//   isolate           MCCP_WORK_ISOLATE_IMPLEMENT != 0 (isolation active)
//   hasFleetArgs      dispatch-fleet-args.json present (parallel prep succeeded)
//   hasPrepare        dispatch-prepare.json present (single isolate prep succeeded)
//   hasWorkflowArgs   dispatch-workflow-args.json present (Workflow args emitted)
//   workflowAvailable Workflow tool available this session (LLM-provided boolean)
//   reserveDenied     dispatch-cap-denied.json present (the atomic reserve granted
//                     0 — the counter lock was unavailable, so NO launch here can
//                     be recorded)
//
// Route enum (first match wins):
//   'inline'            → Step 3.F  (isolation off OR single prepare failed)
//   'task'              → Step 3.I  (Task dispatch — the fallback isolate path)
//   'workflow-single'   → Step 3.W  (single-worker Workflow agent())
//   'workflow-parallel' → Step 3.WP (N-worker parallel())
//
// Decision order:
//   1. !isolate                                        → inline
//   2. reserveDenied                                   → inline
//   3. hasFleetArgs && workflowAvailable               → workflow-parallel
//      (hasFleetArgs && !workflowAvailable → fleet artifact cannot fire; fall
//       through to the single-path logic — degrade, do not force parallel)
//   4. !hasPrepare                                     → inline
//   5. WF=on && hasWorkflowArgs && workflowAvailable   → workflow-single
//   6. otherwise                                       → task

const ROUTES = Object.freeze({
  INLINE: 'inline',
  TASK: 'task',
  WORKFLOW_SINGLE: 'workflow-single',
  WORKFLOW_PARALLEL: 'workflow-parallel',
});

// requiresReservation(route) → true when the route SPAWNS AT LEAST ONE AGENT and
// therefore must hold a recorded cap reservation before it runs.
//
// Implement-Codex R1 F1 (7th round). The cap used to be reserved inside
// resolveFleet, which work.md only reaches behind a 4-way parallel guard
// (ISOLATE≠0 ∧ PARALLEL≠off ∧ merge-strategy=worktree-merge ∧ partitions). Every
// other route still launched a worker — task and workflow-single each spawn one —
// with no reservation at all, so `launched` stayed 0 forever on the default
// single-worker configuration and the cap bounded only parallel fleets. The
// invariant "every agent launch is recorded" was false by construction.
//
// Predicate, not an enumeration of skip reasons: what decides whether the cap is
// consumed is the ROUTE (does an agent spawn?), never whether some upstream oracle
// happened to attempt a reserve. The 6th-round fix-task got this exactly backwards —
// it classified "never reserved" as "consumes no cap", when it actually means
// "consumes cap without recording".
function requiresReservation(route) {
  return route === ROUTES.TASK
    || route === ROUTES.WORKFLOW_SINGLE
    || route === ROUTES.WORKFLOW_PARALLEL;
}

const ENV_WORKFLOW = 'MCCP_WORK_IMPLEMENT_WORKFLOW';

// parseWorkflowMode(env) → 'on' | 'off'. Default OFF (M2a kill switch — the Task
// isolate path stays the default; Workflow-single is an explicit opt-in). A
// case-insensitive '1' or 'on' enables. Mirror of budget.js#parseParallelMode
// (pre-flip polarity: this axis is NOT flipped by live-activation M1 — Codex F1).
function parseWorkflowMode(env) {
  const raw = String((env && env[ENV_WORKFLOW]) || '').trim().toLowerCase();
  return (raw === '1' || raw === 'on') ? 'on' : 'off';
}

// resolveWorkRoute({ env, isolate, hasFleetArgs, hasPrepare, hasWorkflowArgs,
//                     workflowAvailable, reserveDenied }) → one of ROUTES.*
function resolveWorkRoute(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const isolate = opts.isolate !== false; // default true (MCCP_WORK_ISOLATE_IMPLEMENT default 1)
  const hasFleetArgs = opts.hasFleetArgs === true;
  const hasPrepare = opts.hasPrepare === true;
  const hasWorkflowArgs = opts.hasWorkflowArgs === true;
  const workflowAvailable = opts.workflowAvailable === true;
  const reserveDenied = opts.reserveDenied === true;

  // 1 — isolation off → implement inline (no worker dispatch at all).
  if (!isolate) return ROUTES.INLINE;

  // 2 — the reserve granted 0 (PR-Codex R1 F1). Skipping the FLEET is not enough:
  // task / workflow-single each still launch ONE worker, and with no reservation
  // that worker is invisible to the counter — the same per-call leak, just smaller.
  // Inline is the only route that launches nothing, so it is the only one that
  // keeps "every agent launch is recorded" true. Costs main-context tokens, not
  // correctness.
  if (reserveDenied) return ROUTES.INLINE;

  // 3 — parallel fleet prepared AND Workflow tool present → N-worker parallel.
  // Fleet prep already required PARALLEL=1 + worktree-merge + N>1 + run=true, so
  // reaching here with the artifact means those held. If the Workflow tool is
  // unavailable the fleet cannot fire → fall through (degrade to single path).
  if (hasFleetArgs && workflowAvailable) return ROUTES.WORKFLOW_PARALLEL;

  // 4 — no single-isolate prepare artifact → inline (ISOLATE=0-equivalent or
  // prepare-single failed and removed its artifact).
  if (!hasPrepare) return ROUTES.INLINE;

  // 5 — Workflow-single opt-in: WF=on + args emitted + tool present.
  if (parseWorkflowMode(env) === 'on' && hasWorkflowArgs && workflowAvailable) {
    return ROUTES.WORKFLOW_SINGLE;
  }

  // 6 — otherwise the Task isolate path (the M2a fallback default).
  return ROUTES.TASK;
}

module.exports = {
  resolveWorkRoute: resolveWorkRoute,
  requiresReservation: requiresReservation,
  parseWorkflowMode: parseWorkflowMode,
  ROUTES: ROUTES,
  ENV_WORKFLOW: ENV_WORKFLOW,
};
