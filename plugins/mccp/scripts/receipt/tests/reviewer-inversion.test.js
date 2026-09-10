'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const evidence = require('../../lib/reviewer-evidence');
const { resolveEffectiveVerdict } = require('../../lib/review-verdict');
const { isConvergedVerdict } = require('../../lib/receipt-convergence');
const hash = 'sha256:' + 'a'.repeat(64);
function pair() {
  return { reviewer_verdict: 'converged', reviewer_execution: { schema_version: 1,
    gate_id: 'mccp-implement-codex', decision_id: 'fixture', host_family: 'codex', reviewer_family: 'claude',
    actual_model: 'claude-opus-5', run_nonce: '00000000-0000-4000-8000-000000000000',
    subject_hash: hash, evidence_path: '.claude/reviews/fixture.json', evidence_hash: hash } };
}
test('new pair owns the verdict and rejects partial, same-family, or mixed approval', () => {
  assert.equal(evidence.validatePair(pair()).ok, true);
  for (const r of [ { reviewer_verdict: 'converged' },
    { ...pair(), codex_verdict: 'converged' },
    { ...pair(), reviewer_execution: { ...pair().reviewer_execution, reviewer_family: 'codex' } },
    { ...pair(), reviewer_execution: { ...pair().reviewer_execution, evidence_path: '../outside.json' } } ]) {
    assert.equal(resolveEffectiveVerdict(r).verdict, 'unavailable');
    assert.equal(isConvergedVerdict({ ...r, converged: true }), false);
  }
  assert.equal(resolveEffectiveVerdict({ codex_verdict: 'converged' }).verdict, 'converged');
});
test('evidence must exist and match gate, decision, subject and content hash', () => {
  assert.equal(evidence.verify(pair(), { repoRoot: process.cwd(), gateId: 'mccp-pr-codex' }).ok, false);
  assert.equal(evidence.verify(pair(), { repoRoot: process.cwd() }).ok, false);
});
