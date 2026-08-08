'use strict';

// diverse-agent-review M1 Task 11 assertion (4) — MODE ROLLBACK.
//
// The plan's rollback claim is "MCCP_PLAN_REVIEW=codex restores v1.23.0
// byte-for-byte". A manual dry-run is not evidence for that: it exercises one
// path once and leaves no artifact. This file pins the claim mechanically —
// every env input is enumerated, and the two that must NOT fire the panel are
// asserted to produce no review_* fields at all.

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseReviewMode, decideReview, DEFAULT_MODE, TYPO_MODE, MODES } =
  require('../plan-review/decide');

function captureWarns(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = function (c) { lines.push(String(c)); return true; };
  try { return { value: fn(), warns: lines.join('') }; } finally { process.stderr.write = orig; }
}

// The five inputs the plan names, plus the empty-string edge.
const ENV_CASES = [
  { raw: undefined, expect: 'multi-agent', label: 'unset' },
  { raw: '', expect: 'multi-agent', label: 'empty' },
  { raw: 'multi-agent', expect: 'multi-agent', label: 'explicit multi-agent' },
  { raw: 'hybrid', expect: 'hybrid', label: 'explicit hybrid' },
  { raw: 'codex', expect: 'codex', label: 'explicit codex (rollback)' },
  { raw: 'cod-ex', expect: 'codex', label: 'typo' },
];

test('parseReviewMode: exhaustive env → mode mapping', () => {
  ENV_CASES.forEach(function (c) {
    const env = {};
    if (c.raw !== undefined) env.MCCP_PLAN_REVIEW = c.raw;
    const got = captureWarns(function () { return parseReviewMode(env); }).value;
    assert.equal(got, c.expect, c.label);
  });
});

test('parseReviewMode: only the typo path warns', () => {
  const typo = captureWarns(function () {
    return parseReviewMode({ MCCP_PLAN_REVIEW: 'cod-ex' });
  });
  assert.match(typo.warns, /unknown MCCP_PLAN_REVIEW/);

  ['codex', 'multi-agent', 'hybrid'].forEach(function (m) {
    const clean = captureWarns(function () {
      return parseReviewMode({ MCCP_PLAN_REVIEW: m });
    });
    assert.equal(clean.warns, '', m + ' must not warn');
  });
});

test('DD7 direction: unset opts IN to the panel, a typo opts OUT to the legacy path', () => {
  // The two defaults point in opposite directions on purpose. Unset means the
  // operator has not opted out, so they get the new default. A typo means we
  // cannot tell what they wanted, and the safe landing for "who issues approval"
  // is the already-verified path — NOT the strictest new one (that is the
  // opposite of parseMergedVerifyMode, deliberately).
  assert.equal(parseReviewMode({}), DEFAULT_MODE);
  assert.equal(DEFAULT_MODE, 'multi-agent');
  const typo = captureWarns(function () {
    return parseReviewMode({ MCCP_PLAN_REVIEW: 'multiagent' });
  }).value;
  assert.equal(typo, TYPO_MODE);
  assert.equal(TYPO_MODE, 'codex');
});

// ── the load-bearing half: no review_* fields on the rollback paths ───────────

function fullyPassingInputs(mode) {
  return {
    mode: mode,
    l1: { verdict: 'converged', violations: [] },
    l2: {
      quorum: {
        passed: true, responded: 4, roles: 4, of: 4, required: 3, rolesMin: 3,
        malformed: 0, blockingFindings: [], reason: 'quorum satisfied',
      },
      results: ['architect', 'security', 'test', 'invariant'].map(function (p) {
        return { perspective: p, verdict: 'pass', findings: [], refutationAttempted: 'x' };
      }),
    },
    l3: { invoked: true, verdict: 'converged' },
    dispatchEvidence: ['.claude/state/dispatches/abc.envelope.json'],
    reviewedPlanHash: 'sha256:' + 'a'.repeat(64),
    currentPlanHash: 'sha256:' + 'a'.repeat(64),
  };
}

test('codex mode produces NO review_* fields even when L1+L2+L3 all passed', () => {
  const d = decideReview(fullyPassingInputs('codex'));
  assert.equal(d.review_verdict, null);
  assert.equal(d.review_source, null);
  assert.equal(d.review_proof, null);
  assert.equal(d.block, false);
  assert.equal(d.forwardCodexVerdict, true);
});

test('a typo env produces NO review_* fields (multi-agent never fires)', () => {
  const mode = captureWarns(function () {
    return parseReviewMode({ MCCP_PLAN_REVIEW: 'cod-ex' });
  }).value;
  const d = decideReview(fullyPassingInputs(mode));
  assert.equal(d.review_verdict, null,
    'a typo must not silently hand approval to the panel');
  assert.equal(d.review_source, null);
  assert.equal(d.review_proof, null);
});

test('the rollback receipt shape is indistinguishable from a pre-M1 one', () => {
  // What write.js would stamp: the review triple is skipped entirely, so the
  // resolution keeps exactly its v1.23.0 key set.
  const d = decideReview(fullyPassingInputs('codex'));
  const resolution = { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] };
  if (d.review_verdict) resolution.review_verdict = d.review_verdict;
  if (d.review_source) resolution.review_source = d.review_source;
  if (d.review_proof) resolution.review_proof = d.review_proof;
  assert.deepEqual(Object.keys(resolution).sort(),
    ['accepted', 'converged', 'open_questions', 'rejected', 'rounds']);
});

test('MODES is exactly the three documented values', () => {
  assert.deepEqual(MODES.slice().sort(), ['codex', 'hybrid', 'multi-agent']);
});
