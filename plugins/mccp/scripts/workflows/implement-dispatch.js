export const meta = {
  name: 'mccp-implement-dispatch',
  description: 'Single-worker implement dispatch — one isolated agent() runs the prp-implement contract (M2a).',
  phases: [
    { title: 'Implement', detail: 'one isolated worker agent runs prp-implement Phase 2.5→4' },
  ],
};

// workflow-orchestration M2a Task 2 — thin Workflow that migrates the /mccp:work
// Step 3 implement dispatch from a manual Task call to a Workflow agent() call.
// M2a does NOT parallelize: exactly ONE worker runs, and the schema-validated
// return value becomes the reconciliation TRIGGER the controller crosses against
// the envelope + receipt store (result-schema.js deriveVerdict). M2b extends this
// single agent() into `parallel(list.map(...))` — this file is that seam.
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
