export const meta = {
  name: 'mccp-implement-dispatch',
  description: 'Implement dispatch — one (M2a single) or N (M2b fleet) isolated agent(s) run the prp-implement contract.',
  phases: [
    { title: 'Implement', detail: 'isolated worker agent(s) run prp-implement Phase 2.5→4' },
  ],
};

// workflow-orchestration M2a Task 2 + M2b Task 5 — the Workflow that runs the
// /mccp:work Step 3 implement dispatch as agent() call(s). The schema-validated
// return value(s) become the reconciliation TRIGGER the controller crosses
// against the envelope + receipt store (result-schema.js deriveVerdict /
// mergeVerdicts).
//
// Two shapes:
//   - SINGLE (M2a): args.workerPrompt → one agent(), NO isolation (the sole
//     worker edits the parent worktree directly). Returns { result, dispatchId }.
//   - FLEET (M2b): args.fleet[] → parallel(fleet.map(...)). When N>1 each worker
//     runs with isolation:'worktree' so disjoint partitions never race (the
//     frontier file-race answer). A budget pre-guard (mirror of plan-fanout)
//     skips the whole fleet WITHOUT spawning an agent when a +Nk target can't
//     cover it. Returns { workers:[{dispatchId,result}], dispatchIds, skipped }.
//
// The FLEET branch is only reached when the caller resolved
// merge_strategy='worktree-merge' (resolveFleet run=true); the M2b spike measured
// 'disable-parallel', so work.md keeps the SINGLE branch by default and this
// parallel seam stays dormant until a merge mechanism is proven.
//
// Self-contained by necessity: the Workflow execution sandbox exposes no
// `require`/Node module access (Workflow runtime contract: "No filesystem or
// Node.js API access"), so IMPLEMENT_RESULT_SCHEMA below is a FAITHFUL PORT of
// lib/implement-dispatch/result-schema.js IMPLEMENT_RESULT_SCHEMA. That lib stays
// the unit-tested reference (deriveVerdict validates the same shape caller-side).
// Keep the two in sync when either changes.
//
// No Date.now()/Math.random()/new Date() (they throw in the Workflow sandbox).
// The dispatchId + envelope path are generated caller-side by
// `dispatch-cli.js prepare-single` and injected via `args`.

const IMPLEMENT_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'receiptsAdded', 'changedFiles', 'testResult'],
  properties: {
    status: { type: 'string', enum: ['ok', 'failure', 'timeout', 'crashed'] },
    receiptsAdded: { type: 'array', items: { type: 'string' } },
    changedFiles: { type: 'array', items: { type: 'string' } },
    testResult: { type: 'string' },
    nextAction: { type: ['string', 'null'] },
    findings: { type: 'array', items: { type: 'object' } },
  },
};

// ── Workflow body ──────────────────────────────────────────────────────────
const input = args || {};

// ── FLEET (M2b) ──────────────────────────────────────────────────────────────
const fleet = Array.isArray(input.fleet) ? input.fleet.filter(Boolean) : null;
if (fleet && fleet.length > 0) {
  const minRemaining = Number.isFinite(input.minRemaining) ? input.minRemaining : 0;
  // Budget pre-guard (Codex F2 mirror). A +Nk target that can't cover the fleet
  // skips WITHOUT spawning a single agent. budget.total null → structural caps
  // (resolveFleet's MAX + partition n) are the only ceiling; proceed.
  if (budget.total && budget.remaining() < minRemaining) {
    log('[mccp:implement-dispatch] budget-exhausted skip: remaining '
      + budget.remaining() + ' < minRemaining ' + minRemaining);
    return {
      workers: [],
      dispatchIds: fleet.map(function (w) { return w.dispatchId || null; }),
      skipped: true,
      reason: 'budget',
    };
  }
  // isolation:'worktree' only for genuine multi-worker parallelism — a lone
  // worker edits the parent worktree directly (mirror of the M2a single path).
  const useIsolation = fleet.length > 1;
  phase('Implement');
  const results = await parallel(fleet.map(function (w) {
    return function () {
      const opts = {
        agentType: w.agentType || 'general-purpose',
        label: 'implement:' + (w.dispatchId || 'worker'),
        phase: 'Implement',
        schema: IMPLEMENT_RESULT_SCHEMA,
      };
      if (useIsolation) opts.isolation = 'worktree';
      return agent(w.workerPrompt, opts);
    };
  }));
  return {
    workers: fleet.map(function (w, i) {
      return { dispatchId: w.dispatchId || null, result: results[i] };
    }),
    dispatchIds: fleet.map(function (w) { return w.dispatchId || null; }),
    skipped: false,
    reason: useIsolation ? 'parallel' : 'single-worker',
  };
}

// ── SINGLE (M2a, unchanged) ──────────────────────────────────────────────────
const workerPrompt = input.workerPrompt || null;
const agentType = input.agentType || 'general-purpose';
const dispatchId = input.dispatchId || null;

if (!workerPrompt) {
  // A missing worker prompt is a caller wiring bug — return a null result so the
  // controller's deriveVerdict yields `result-unreadable` and HALTs (rather than
  // spawning an agent with an empty prompt).
  log('[mccp:implement-dispatch] no workerPrompt in args — nothing to dispatch');
  return { result: null, dispatchId: dispatchId, skipped: true, reason: 'no-worker-prompt' };
}

phase('Implement');
const result = await agent(workerPrompt, {
  agentType: agentType,
  label: 'implement:' + (dispatchId || 'worker'),
  phase: 'Implement',
  schema: IMPLEMENT_RESULT_SCHEMA,
});

// agent() returns null when the worker dies / hits a terminal API error after
// retries. Pass it straight through — deriveVerdict maps null → result-unreadable.
return { result: result, dispatchId: dispatchId };
