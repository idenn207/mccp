'use strict';

// diverse-agent-review M1 Task 1 — review-verdict pure oracle.
//
// Covers: the review>codex precedence, the DD11 no-fallback rule (a partial
// review_* stamp must NEVER resolve to source='codex'), every structural proof
// invariant individually, the DD5 path-format invariant including the Windows/
// UNC cases the Security Reviewer flagged (S3), the DD13 hash-format bind, and
// the DD2 cross-model predicate.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveEffectiveVerdict,
  isReviewProofStructurallyValid,
  isRepoRelativeEvidencePath,
  isCrossModelCorroborated,
  SOURCES,
  CROSS_MODEL_SOURCES,
} = require('../review-verdict');

// A proof that satisfies every invariant. Tests mutate ONE field at a time so a
// failure names exactly which invariant broke.
function validProof(overrides) {
  const p = {
    layers: { l1: 'converged', l2: 'converged', l3: null },
    verification_verdict: 'converged',
    quorum: { passed: true, required: 3, of: 4, roles: 3, responded: 4 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
      { perspective: 'test', verdict: 'pass' },
      { perspective: 'invariant', verdict: 'pass' },
    ],
    dispatch_evidence: ['.claude/state/dispatches/abc.envelope.json'],
    reviewed_plan_hash: 'sha256:' + 'a'.repeat(64),
  };
  return Object.assign(p, overrides || {});
}

function reviewResolution(overrides) {
  return Object.assign({
    converged: true,
    rounds: 1,
    review_verdict: 'converged',
    review_source: 'multi-agent',
    review_proof: validProof(),
  }, overrides || {});
}

// ── precedence ────────────────────────────────────────────────────────────────

test('review axis wins over codex_verdict when both present', () => {
  const r = reviewResolution({ review_verdict: 'divergent', codex_verdict: 'converged' });
  const eff = resolveEffectiveVerdict(r);
  assert.equal(eff.verdict, 'divergent');
  assert.equal(eff.source, 'multi-agent');
});

test('legacy receipt (no review_*) falls back to codex_verdict with source=codex', () => {
  const eff = resolveEffectiveVerdict({ converged: true, codex_verdict: 'converged' });
  assert.deepEqual(eff,
    { verdict: 'converged', source: 'codex', axis: 'codex', proofFailed: false });
});

test('neither axis present → null verdict, null source', () => {
  const eff = resolveEffectiveVerdict({ converged: true, rounds: 1 });
  assert.deepEqual(eff, { verdict: null, source: null, axis: 'none', proofFailed: false });
});

test('non-object resolution is null-safe', () => {
  [null, undefined, 'x', 42, []].forEach((bad) => {
    assert.deepEqual(resolveEffectiveVerdict(bad),
      { verdict: null, source: null, axis: 'none', proofFailed: false });
  });
});

test('axis names which field answered', () => {
  assert.equal(resolveEffectiveVerdict({ codex_verdict: 'converged' }).axis, 'codex');
  assert.equal(resolveEffectiveVerdict(reviewResolution()).axis, 'review');
  assert.equal(resolveEffectiveVerdict({ converged: true }).axis, 'none');
  // A partial stamp is still firmly on the review axis even though source is null.
  const partial = resolveEffectiveVerdict({ review_verdict: 'converged', codex_verdict: 'converged' });
  assert.equal(partial.axis, 'review');
  assert.equal(partial.source, null);
});

test('every legacy codex_verdict value passes through unchanged', () => {
  ['converged', 'divergent', 'critical', 'unavailable', 'skipped'].forEach((cv) => {
    const eff = resolveEffectiveVerdict({ converged: true, codex_verdict: cv });
    assert.equal(eff.verdict, cv, cv);
    assert.equal(eff.source, 'codex', cv);
    assert.equal(eff.proofFailed, false, cv);
  });
});

// ── DD11 — partial stamp must never fall back to codex ────────────────────────

test('DD11: review_verdict alone (source+proof missing) → unavailable, NOT codex', () => {
  const eff = resolveEffectiveVerdict({
    converged: true, review_verdict: 'converged', codex_verdict: 'converged',
  });
  assert.equal(eff.verdict, 'unavailable');
  assert.notEqual(eff.source, 'codex');
  assert.equal(eff.proofFailed, true);
});

test('DD11: review_source alone → unavailable, NOT codex', () => {
  const eff = resolveEffectiveVerdict({
    converged: true, review_source: 'multi-agent', codex_verdict: 'converged',
  });
  assert.equal(eff.verdict, 'unavailable');
  assert.equal(eff.proofFailed, true);
  assert.equal(isCrossModelCorroborated({
    converged: true, review_source: 'multi-agent', codex_verdict: 'converged',
  }), false);
});

test('DD11: review_proof alone → unavailable, NOT codex', () => {
  const eff = resolveEffectiveVerdict({
    converged: true, review_proof: validProof(), codex_verdict: 'converged',
  });
  assert.equal(eff.verdict, 'unavailable');
  assert.equal(eff.proofFailed, true);
});

test('DD11: missing proof only → unavailable', () => {
  const r = reviewResolution();
  delete r.review_proof;
  assert.equal(resolveEffectiveVerdict(r).verdict, 'unavailable');
});

test('unknown review_source → unavailable with null source', () => {
  const eff = resolveEffectiveVerdict(reviewResolution({ review_source: 'panel' }));
  assert.equal(eff.verdict, 'unavailable');
  assert.equal(eff.source, null);
  assert.equal(eff.proofFailed, true);
});

test('unknown review_verdict value → unavailable', () => {
  const eff = resolveEffectiveVerdict(reviewResolution({ review_verdict: 'approved' }));
  assert.equal(eff.verdict, 'unavailable');
  assert.equal(eff.proofFailed, true);
});

test('non-converged review verdicts are returned as-is without proof scrutiny', () => {
  ['divergent', 'critical', 'unavailable', 'skipped'].forEach((v) => {
    const eff = resolveEffectiveVerdict(reviewResolution({ review_verdict: v, review_proof: {} }));
    assert.equal(eff.verdict, v, v);
    assert.equal(eff.proofFailed, false, v);
  });
});

// ── proof structural invariants ───────────────────────────────────────────────

test('valid proof passes', () => {
  assert.equal(isReviewProofStructurallyValid(validProof()), true);
});

test('proof must be a plain object', () => {
  [null, undefined, 'x', 7, [], true].forEach((bad) => {
    assert.equal(isReviewProofStructurallyValid(bad), false, String(bad));
  });
});

test('L1 not converged invalidates the proof (DD3 gatekeeper)', () => {
  assert.equal(isReviewProofStructurallyValid(
    validProof({ layers: { l1: 'divergent', l2: 'converged', l3: null } })), false);
  assert.equal(isReviewProofStructurallyValid(
    validProof({ layers: { l1: 'inconclusive', l2: 'converged', l3: null } })), false);
});

test('L2 not converged invalidates the proof', () => {
  assert.equal(isReviewProofStructurallyValid(
    validProof({ layers: { l1: 'converged', l2: 'divergent', l3: null } })), false);
});

test('L3 absent is fine; L3 present-and-failed is not', () => {
  assert.equal(isReviewProofStructurallyValid(
    validProof({ layers: { l1: 'converged', l2: 'converged', l3: 'converged' } })), true);
  assert.equal(isReviewProofStructurallyValid(
    validProof({ layers: { l1: 'converged', l2: 'converged', l3: 'divergent' } })), false);
});

test('verification_verdict must be converged', () => {
  assert.equal(isReviewProofStructurallyValid(
    validProof({ verification_verdict: 'divergent' })), false);
});

test('quorum.passed must be strictly true', () => {
  [false, 'true', 1, null].forEach((v) => {
    assert.equal(isReviewProofStructurallyValid(
      validProof({ quorum: { passed: v, required: 3, of: 4, roles: 3 } })), false, String(v));
  });
});

test('quorum.required below 2 is not a quorum', () => {
  assert.equal(isReviewProofStructurallyValid(
    validProof({ quorum: { passed: true, required: 1, of: 4, roles: 1 } })), false);
  assert.equal(isReviewProofStructurallyValid(
    validProof({ quorum: { passed: true, required: 0, of: 4, roles: 1 } })), false);
});

test('quorum.of must be >= required', () => {
  assert.equal(isReviewProofStructurallyValid(
    validProof({ quorum: { passed: true, required: 4, of: 3, roles: 3 } })), false);
});

test('quorum counters must be non-negative integers', () => {
  [{ required: 2.5, of: 4, roles: 3 }, { required: 3, of: '4', roles: 3 },
   { required: 3, of: 4, roles: -1 }].forEach((q) => {
    assert.equal(isReviewProofStructurallyValid(
      validProof({ quorum: Object.assign({ passed: true }, q) })), false, JSON.stringify(q));
  });
});

// This assertion used to read "perspectives length must equal quorum.of", which
// fixed a defect in place as the specification: it made the DOCUMENTED default
// quorum `3of4` unsatisfiable. A run where three of four reviewers answered
// passed decideQuorum and then produced a proof this oracle rejected, so a
// legitimate approval was silently downgraded to `unavailable`. The binding is to
// the OBSERVATION (`responded`), not to the panel that was fielded.
test('perspectives length must equal quorum.responded, not quorum.of', () => {
  const partial = validProof({
    quorum: { passed: true, required: 3, of: 4, roles: 3, responded: 3 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
      { perspective: 'test', verdict: 'pass' },
    ],
  });
  assert.equal(isReviewProofStructurallyValid(partial), true,
    'M-of-N with M < N must be expressible — this is the 3of4 default');

  // Still rejected when the array and the count disagree.
  const lying = validProof();
  lying.perspectives = lying.perspectives.slice(0, 3);   // responded still says 4
  assert.equal(isReviewProofStructurallyValid(lying), false);
});

test('quorum.responded must clear required and sit inside of', () => {
  const three = [
    { perspective: 'architect', verdict: 'pass' },
    { perspective: 'security', verdict: 'pass' },
    { perspective: 'test', verdict: 'pass' },
  ];
  // responded < required — the quorum could not have passed.
  assert.equal(isReviewProofStructurallyValid(validProof({
    quorum: { passed: true, required: 4, of: 4, roles: 3, responded: 3 },
    perspectives: three,
  })), false, 'responded below the threshold');
  // responded > of — more answers than reviewers fielded.
  assert.equal(isReviewProofStructurallyValid(validProof({
    quorum: { passed: true, required: 2, of: 2, roles: 2, responded: 3 },
    perspectives: three,
  })), false, 'responded exceeds the panel');
  // roles > responded — more distinct lenses than answers.
  assert.equal(isReviewProofStructurallyValid(validProof({
    quorum: { passed: true, required: 3, of: 4, roles: 4, responded: 3 },
    perspectives: three,
  })), false, 'more roles than responses');
  // responded absent entirely.
  assert.equal(isReviewProofStructurallyValid(validProof({
    quorum: { passed: true, required: 3, of: 4, roles: 3 },
    perspectives: three,
  })), false, 'responded missing');
});

test('duplicate roles are rejected even when the count matches', () => {
  const p = validProof();
  p.perspectives[3] = { perspective: 'architect', verdict: 'pass' };
  assert.equal(isReviewProofStructurallyValid(p), false);
});

test('unique roles below quorum.roles is rejected', () => {
  // 2 distinct roles, of=2, required=2, but K=3 demanded.
  assert.equal(isReviewProofStructurallyValid(validProof({
    quorum: { passed: true, required: 2, of: 2, roles: 3 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
    ],
  })), false);
});

test('malformed perspective entries are rejected', () => {
  [[{ perspective: '' }], ['architect'], [null], [{ verdict: 'pass' }]].forEach((list) => {
    assert.equal(isReviewProofStructurallyValid(validProof({
      quorum: { passed: true, required: 2, of: 2, roles: 1, responded: 1 },
      perspectives: list,
    })), false, JSON.stringify(list));
  });
});

test('dispatch_evidence must be a non-empty array', () => {
  assert.equal(isReviewProofStructurallyValid(validProof({ dispatch_evidence: [] })), false);
  assert.equal(isReviewProofStructurallyValid(validProof({ dispatch_evidence: 'x' })), false);
  assert.equal(isReviewProofStructurallyValid(validProof({ dispatch_evidence: null })), false);
});

// ── DD5 / S3 — path format ────────────────────────────────────────────────────

test('repo-relative evidence paths are accepted', () => {
  ['.claude/state/dispatches/a.json', 'plugins/mccp/x.json', 'a'].forEach((p) => {
    assert.equal(isRepoRelativeEvidencePath(p), true, p);
  });
});

test('absolute, drive-letter, UNC and backslash paths are rejected (S3)', () => {
  [
    '/etc/passwd',                              // POSIX absolute
    '//unc/share/x',                            // UNC via forward slashes
    '\\\\server\\share\\x',                     // UNC via backslashes
    'C:/Windows/temp',                          // drive letter, forward slash
    'C:\\Windows\\temp',                        // drive letter, backslash
    'a/b\\c',                                   // mixed separators
    '.claude\\state\\x.json',                   // all-backslash relative
  ].forEach((p) => {
    assert.equal(isRepoRelativeEvidencePath(p), false, p);
  });
});

test('traversal and un-normalized segments are rejected', () => {
  ['../../etc/passwd', '..', 'a/../b', './a', 'a/./b', 'a//b', 'a/', ''].forEach((p) => {
    assert.equal(isRepoRelativeEvidencePath(p), false, JSON.stringify(p));
  });
});

test('whitespace-padded, NUL-bearing and non-string paths are rejected', () => {
  [' a/b', 'a/b ', 'a\0b', 42, null, undefined, {}].forEach((p) => {
    assert.equal(isRepoRelativeEvidencePath(p), false, String(p));
  });
});

test('a bad evidence path invalidates the whole proof', () => {
  assert.equal(isReviewProofStructurallyValid(
    validProof({ dispatch_evidence: ['.claude/ok.json', '../escape.json'] })), false);
});

test('converged review verdict with a leaking evidence path downgrades to unavailable', () => {
  const eff = resolveEffectiveVerdict(reviewResolution({
    review_proof: validProof({ dispatch_evidence: ['C:/Users/x/secret.json'] }),
  }));
  assert.equal(eff.verdict, 'unavailable');
  assert.equal(eff.proofFailed, true);
  assert.equal(eff.source, 'multi-agent');
});

// ── DD13 — reviewed_plan_hash format ──────────────────────────────────────────

test('reviewed_plan_hash must be sha256:<64hex>', () => {
  ['', 'sha256:', 'sha256:' + 'a'.repeat(63), 'sha256:' + 'A'.repeat(64),
   'a'.repeat(64), 'sha1:' + 'a'.repeat(64), null, 42].forEach((h) => {
    assert.equal(isReviewProofStructurallyValid(
      validProof({ reviewed_plan_hash: h })), false, String(h));
  });
});

test('missing reviewed_plan_hash invalidates the proof (DD13 bind is mandatory)', () => {
  const p = validProof();
  delete p.reviewed_plan_hash;
  assert.equal(isReviewProofStructurallyValid(p), false);
});

// ── DD2 — cross-model predicate ───────────────────────────────────────────────

test('DD2: multi-agent converged is NOT cross-model corroborated', () => {
  assert.equal(isCrossModelCorroborated(reviewResolution()), false);
});

test('DD2: hybrid converged IS cross-model corroborated', () => {
  assert.equal(isCrossModelCorroborated(reviewResolution({ review_source: 'hybrid' })), true);
});

test('DD2: legacy codex converged IS cross-model corroborated', () => {
  assert.equal(isCrossModelCorroborated({ converged: true, codex_verdict: 'converged' }), true);
});

test('DD2: non-converged verdicts are never corroborated regardless of source', () => {
  ['divergent', 'critical', 'unavailable', 'skipped'].forEach((v) => {
    assert.equal(isCrossModelCorroborated({ converged: true, codex_verdict: v }), false, v);
    assert.equal(isCrossModelCorroborated(
      reviewResolution({ review_verdict: v, review_source: 'hybrid', review_proof: {} })), false, v);
  });
});

test('DD2: hybrid converged with a structurally broken proof is not corroborated', () => {
  assert.equal(isCrossModelCorroborated(reviewResolution({
    review_source: 'hybrid',
    review_proof: validProof({ quorum: { passed: false, required: 3, of: 4, roles: 3 } }),
  })), false);
});

// ── exported vocabulary ───────────────────────────────────────────────────────

test('source vocabulary is fixed and cross-model is a strict subset', () => {
  assert.deepEqual(SOURCES, ['codex', 'multi-agent', 'hybrid']);
  assert.deepEqual(CROSS_MODEL_SOURCES, ['codex', 'hybrid']);
  CROSS_MODEL_SOURCES.forEach((s) => assert.ok(SOURCES.indexOf(s) !== -1, s));
  assert.equal(CROSS_MODEL_SOURCES.indexOf('multi-agent'), -1);
});
