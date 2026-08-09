'use strict';

// diverse-agent-review M1 — the seam the unit suites did not cover.
//
// Every pre-existing converged test fed decideReview a FULL panel (responded === of),
// so the composition chain was only ever exercised on its happy row. The defects
// this file pins all lived one step off that row:
//
//   1. a passing `3of4` quorum built a proof that isReviewProofStructurallyValid
//      rejected, silently downgrading a legitimate approval to `unavailable` and
//      making the documented default unsatisfiable;
//   2. review_proof.quorum.roles recorded the CONFIGURED minimum instead of the
//      observed count, so the evidence record understated its own evidence;
//   3. perspectives were collected with a looser predicate than the quorum counted
//      with, so a malformed-but-labelled result could push the array past
//      `responded` and break the proof's self-consistency.
//
// These assertions walk quorum → decide → proof → schema in one line each, which
// is the only place they are visible.

const test = require('node:test');
const assert = require('node:assert');

const { decideQuorum } = require('../plan-review/quorum');
const { decideReview } = require('../plan-review/decide');
const { resolveEffectiveVerdict, isReviewProofStructurallyValid } = require('../review-verdict');

const L1_OK = { verdict: 'converged', violations: [] };
const HASH = 'sha256:' + 'b'.repeat(64);
const EVIDENCE = ['.claude/state/plan-review/l2.json'];

function pass(perspective) {
  return { perspective: perspective, verdict: 'pass', findings: [], refutationAttempted: 'x' };
}

function compose(results, opts) {
  const o = opts || {};
  const quorum = decideQuorum({
    results: results,
    required: o.required === undefined ? 3 : o.required,
    of: o.of === undefined ? results.length : o.of,
    rolesMin: o.rolesMin === undefined ? 3 : o.rolesMin,
  });
  const decision = decideReview({
    mode: o.mode || 'multi-agent',
    l1: L1_OK,
    l2: { quorum: quorum, results: results },
    l3: o.l3 || null,
    dispatchEvidence: EVIDENCE,
    reviewedPlanHash: HASH,
    currentPlanHash: HASH,
  });
  return { quorum: quorum, decision: decision };
}

// ── 1. M-of-N with M < N must actually approve ────────────────────────────────

test('3-of-4: one reviewer never answered, the panel still approves end-to-end', () => {
  const { quorum, decision } = compose(
    [pass('architect'), pass('security'), pass('test'), null], { of: 4 });

  assert.equal(quorum.passed, true, 'the quorum oracle passes 3 of 4');
  assert.equal(decision.review_verdict, 'converged');
  assert.equal(decision.review_source, 'multi-agent');
  assert.equal(isReviewProofStructurallyValid(decision.review_proof), true,
    'the proof the quorum produced must survive the oracle that reads it back');

  // The whole point: the approval must still read as converged downstream.
  const eff = resolveEffectiveVerdict({
    review_verdict: decision.review_verdict,
    review_source: decision.review_source,
    review_proof: decision.review_proof,
  });
  assert.equal(eff.verdict, 'converged');
  assert.equal(eff.proofFailed, false,
    'a 3of4 pass must not be downgraded to unavailable');
});

test('3-of-4 approval survives the receipt schema (the wall that rejected it)', () => {
  const { decision } = compose(
    [pass('architect'), pass('security'), pass('test'), null], { of: 4 });

  // schema.js requires a structurally valid proof for a converged review_verdict;
  // import lazily so this file states its dependency at the point of use.
  const { validate } = require('../../receipt/schema');
  const { makeSkeleton } = require('../../receipt/schema');
  const r = makeSkeleton({});
  r.gate_id = 'mccp-plan-codex';
  r.phase = 'plan';
  r.decision_id = 'partial-panel';
  r.resolution.review_verdict = decision.review_verdict;
  r.resolution.review_source = decision.review_source;
  r.resolution.review_proof = decision.review_proof;

  const errs = validate(r).errors.filter(function (e) {
    return e.indexOf('review_proof') !== -1;
  });
  assert.deepEqual(errs, [], 'no review_proof complaint for a legitimate 3of4 approval');
});

test('below the threshold still fails: 2 of 4 with required 3', () => {
  const { quorum, decision } = compose(
    [pass('architect'), pass('security'), null, null], { of: 4 });
  assert.equal(quorum.passed, false);
  assert.equal(decision.review_verdict, 'divergent');
  assert.equal(decision.review_proof, null);
});

// ── 2. the proof records observations, not thresholds ─────────────────────────

test('review_proof.quorum.roles is the OBSERVED count, not MCCP_PLAN_REVIEW_ROLES_MIN', () => {
  const { decision } = compose(
    [pass('architect'), pass('security'), pass('test'), pass('invariant')],
    { of: 4, rolesMin: 2 });

  assert.equal(decision.review_verdict, 'converged');
  assert.equal(decision.review_proof.quorum.roles, 4,
    'four distinct lenses answered — a proof claiming 2 understates its evidence');
  assert.equal(decision.review_proof.quorum.responded, 4);
  assert.equal(decision.review_proof.quorum.required, 3, 'thresholds stay in required/of');
});

// ── 3. perspectives are filtered exactly as the quorum counted ────────────────

test('a malformed-but-labelled result is excluded from perspectives, not just from the count', () => {
  const results = [
    pass('architect'),
    pass('security'),
    pass('test'),
    // Carries a perspective string, so the old looser filter admitted it, but the
    // quorum rejects it as malformed — the two disagreeing broke the proof.
    { perspective: 'invariant', verdict: 'maybe', findings: [] },
  ];
  const { quorum, decision } = compose(results, { of: 4 });

  assert.equal(quorum.responded, 3);
  assert.equal(quorum.malformed, 1);
  assert.equal(decision.review_verdict, 'converged');
  assert.equal(decision.review_proof.perspectives.length, 3,
    'perspectives must mirror the set the quorum counted');
  assert.equal(isReviewProofStructurallyValid(decision.review_proof), true);
});

// ── 4. hybrid L3 must produce a verdict from the vocabulary ───────────────────

test('hybrid with an empty L3 verdict is unavailable, not a sealed empty string', () => {
  const panel = [pass('architect'), pass('security'), pass('test'), pass('invariant')];
  // printf with an unset shell variable writes exactly this.
  const { decision } = compose(panel,
    { of: 4, mode: 'hybrid', l3: { invoked: true, verdict: '', reason: '' } });

  assert.equal(decision.review_verdict, 'unavailable');
  assert.equal(decision.review_source, 'multi-agent',
    'requested hybrid is not hybrid happened');
  assert.equal(decision.forwardCodexVerdict, false);
});

test('hybrid with a real L3 verdict still seals normally', () => {
  const panel = [pass('architect'), pass('security'), pass('test'), pass('invariant')];
  const { decision } = compose(panel,
    { of: 4, mode: 'hybrid', l3: { invoked: true, verdict: 'converged', reason: 'ok' } });

  assert.equal(decision.review_verdict, 'converged');
  assert.equal(decision.review_source, 'hybrid');
  assert.equal(decision.review_proof.layers.l3, 'converged');
  assert.equal(decision.forwardCodexVerdict, true);
});
