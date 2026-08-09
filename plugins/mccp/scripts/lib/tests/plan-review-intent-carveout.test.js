'use strict';

// diverse-agent-review M1 × codex-intent-context M1 — the seam between the two.
//
// origin/main moved the mccp-plan-codex receipt write into plan-codex-runner.js and
// made write.js demand a programmatic `intentDecision` for every PRD-mode plan. The
// panel paths have no runner (Codex is never invoked), so without a carve-out the
// default review mode could not seal a receipt for any PRD-driven plan at all.
//
// The carve-out mirrors main's own DD1 free-form branch: the gate does not apply,
// and that is a MECHANICAL fact read off the receipt being sealed rather than a
// judgement call. `review_source === 'multi-agent'` is that fact — the review_*
// triple is all-or-nothing (DD11), its proof is structurally validated, and a
// receipt carrying both 'multi-agent' and a codex_verdict is rejected outright.
//
// What this file pins is not just "the carve-out works" but WHERE IT STOPS:
//   - hybrid (L3 fired ⇒ Codex spoke) must stay fail-closed
//   - a bare write with no review axis must stay fail-closed
//   - the carve-out must buy NOTHING on the cross-model axis (DD2 unchanged)
//   - the two skip-proof lists must not drift apart

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildReceipt } = require('../../receipt/write');
const { planAwareMarkdownHash } = require('../../receipt/hash');
const { validate, makeSkeleton } = require('../../receipt/schema');
const { crossModelConverged } = require('../../receipt/dedupe');
const { SKIP_PROOFS, isIntentApproved, classifyIntentMeta } = require('../intent-context');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const PLAN_REL = '.claude/plans/diverse-agent-review-m1.plan.md';
const PLAN_ABS = path.join(REPO_ROOT, PLAN_REL);

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-carveout-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents, 'utf8');
  return p;
}

function proof(extra) {
  return Object.assign({
    layers: { l1: 'converged', l2: 'converged', l3: null },
    verification_verdict: 'converged',
    quorum: { passed: true, required: 3, of: 4, roles: 4, responded: 4 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
      { perspective: 'test', verdict: 'pass' },
      { perspective: 'invariant', verdict: 'pass' },
    ],
    dispatch_evidence: ['.claude/state/plan-review/l2.json'],
    reviewed_plan_hash: planAwareMarkdownHash(PLAN_ABS),
  }, extra || {});
}

function args(extra) {
  return Object.assign({
    gate: 'mccp-plan-codex',
    decision: 'diverse-agent-review-m1',
    plan: PLAN_REL,
    cwd: REPO_ROOT,
  }, extra || {});
}

function panelArgs(extra) {
  return args(Object.assign({
    'review-verdict': 'converged',
    'review-source': 'multi-agent',
    'review-proof-file': tmpFile('proof.json', JSON.stringify(proof())),
  }, extra || {}));
}

// The environment must not leak the audited override into these assertions — it
// would make every fail-closed case below pass for the wrong reason.
function withoutOverride(fn) {
  const saved = process.env.MCCP_SKIP_INTENT_GATE;
  delete process.env.MCCP_SKIP_INTENT_GATE;
  try { return fn(); } finally {
    if (saved !== undefined) process.env.MCCP_SKIP_INTENT_GATE = saved;
  }
}

// ── the carve-out itself ─────────────────────────────────────────────────────

test('a multi-agent panel receipt seals on a PRD-mode plan with no runner decision', () => {
  const r = withoutOverride(() => buildReceipt(panelArgs()).receipt);

  assert.equal(r.resolution.review_source, 'multi-agent');
  assert.equal(r.meta.intent_gate_verdict, 'skipped');
  assert.equal(r.meta.intent_skip_proof, 'codex_not_invoked');
  assert.equal(r.meta.intent_gate_force_override, false,
    'a mechanical skip is not an override — the audit record must not claim one');
  assert.equal(r.meta.intent_run_nonce, null, 'no runner ran, so there is no nonce to cite');
  assert.equal(validate(r).ok, true, JSON.stringify(validate(r).errors));
});

test('the stamped digest binds to the plan actually sealed (DD4-2 shape)', () => {
  const r = withoutOverride(() => buildReceipt(panelArgs()).receipt);
  assert.equal(r.meta.intent_plan_digest, r.plan_hash);
  assert.equal(isIntentApproved(r), true,
    'a proven skip classifies as approved on the intent axis — same as DD1 free-form');
});

// ── where it stops ───────────────────────────────────────────────────────────

test('hybrid stays fail-closed: L3 means Codex spoke and owes adjudication', () => {
  const hybridProof = proof({
    layers: { l1: 'converged', l2: 'converged', l3: 'converged' },
  });
  let threw = null;
  withoutOverride(() => {
    try {
      buildReceipt(args({
        'review-verdict': 'converged',
        'review-source': 'hybrid',
        'review-proof-file': tmpFile('hybrid.json', JSON.stringify(hybridProof)),
        'codex-verdict': 'converged',
      }));
    } catch (e) { threw = e; }
  });
  assert.ok(threw, 'a hybrid receipt must not inherit the panel carve-out');
  assert.equal(threw.code, 'INTENT_GATE_BLOCKED', threw.message);
  assert.match(threw.message, /hybrid/,
    'the operator gets told why hybrid is different, not a generic refusal');
});

test('the carve-out did not widen the hole: a bare write is still refused', () => {
  let threw = null;
  withoutOverride(() => {
    try { buildReceipt(args({})); } catch (e) { threw = e; }
  });
  assert.ok(threw, 'no review axis and no runner decision must still fail closed');
  assert.equal(threw.code, 'INTENT_GATE_BLOCKED', threw.message);
});

// ── the carve-out buys nothing on the cross-model axis ───────────────────────

test('DD2 is untouched: an intent-skipped panel receipt is still not cross-model corroboration', () => {
  const r = withoutOverride(() => buildReceipt(panelArgs()).receipt);

  // Both halves matter. The intent axis says "approved" (the gate genuinely does
  // not apply), and the review axis still says "no Codex here" — so cross-gate
  // dedupe refuses the skip and PR-Codex fires at the ship point. If this ever
  // flips, the panel would silently delete cross-model review from the pipeline
  // rather than relocate it, which is the one thing DD2 exists to prevent.
  assert.equal(isIntentApproved(r), true, 'intent axis: the skip is proven');
  assert.equal(crossModelConverged(r), false, 'review axis: still no cross-model evidence');
});

// ── the two enums must not drift ─────────────────────────────────────────────

test('every intent-context SKIP_PROOFS value is accepted by the receipt schema', () => {
  // write-side (schema.js INTENT_SKIP_PROOFS) and read-side (intent-context.js
  // SKIP_PROOFS) are separate literals. A value in one but not the other splits
  // them on what counts as a valid skip: the reader would classify a
  // schema-legal receipt as 'blocked', or the schema would reject a receipt the
  // reader treats as approved. Assert behaviourally so the lists cannot drift.
  assert.ok(SKIP_PROOFS.indexOf('codex_not_invoked') !== -1,
    'the new proof must be in the read-side list');
  SKIP_PROOFS.forEach(function (sp) {
    const r = makeSkeleton({
      gate_id: 'mccp-plan-codex',
      phase: 'plan',
      decision_id: 'enum-lockstep',
      task_id: 'T1',
      plan_hash: 'sha256:' + 'a'.repeat(64),
      base_sha: 'a'.repeat(40),
      head_sha: 'a'.repeat(40),
      subject_hash: 'sha256:' + 'b'.repeat(64),
    });
    r.receipt_hash = 'sha256:' + 'c'.repeat(64);
    r.meta.command = 'mccp:plan';
    r.meta.intent_gate_verdict = 'skipped';
    r.meta.intent_skip_proof = sp;
    r.meta.intent_plan_digest = r.plan_hash;
    const res = validate(r);
    assert.equal(res.ok, true, sp + ' rejected by schema: ' + JSON.stringify(res.errors));
    assert.equal(classifyIntentMeta(r.meta), 'approved',
      sp + ' is schema-legal but the reader does not treat it as a proven skip');
  });
});
