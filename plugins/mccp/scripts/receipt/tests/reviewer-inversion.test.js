'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const evidence = require('../../lib/reviewer-evidence');
const { resolveEffectiveVerdict } = require('../../lib/review-verdict');
const { isConvergedVerdict } = require('../../lib/receipt-convergence');
const fs = require('fs');
const os = require('os');
const path = require('path');
const reviewer = require('../../lib/reviewer-invoke');
const hash = 'sha256:' + 'a'.repeat(64);
function pair() {
  return { reviewer_verdict: 'converged', reviewer_execution: { schema_version: 1,
    gate_id: 'mccp-implement-codex', decision_id: 'fixture', host_family: 'codex', reviewer_family: 'claude',
    actual_model: 'claude-opus-5', run_nonce: '00000000-0000-4000-8000-000000000000',
    subject_hash: hash, evidence_path: '.claude/reviews/fixture.json', evidence_hash: hash } };
}
test('new pair owns the verdict and rejects partial, same-family, or mixed approval', () => {
  assert.equal(evidence.validatePair(pair()).ok, false); // v1 checkpoint lacks reviewed_input
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

test('only a bound in-process execution seals; tampering and symlinks fail', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-evidence-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-outside-'));
  try {
    const t = require('../../lib/review-target');
    t.git(root, ['init', '-q']); t.git(root, ['config', 'user.name', 'Test']); t.git(root, ['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(root, 'plan.md'), '# Fixture plan\n');
    t.git(root, ['add', '.']); t.git(root, ['commit', '-qm', 'fixture']);
    const contextInput = evidence.prepareContext({ cwd: root, planPath: 'plan.md', gateId: 'mccp-implement-codex', decisionId: 'fixture' });
    const receipt = { gate_id: 'mccp-implement-codex', decision_id: 'fixture', subject_hash: hash,
      plan_hash: require('../hash').planAwareMarkdownHash(path.join(root, 'plan.md')),
      head_sha: contextInput.reviewedInput.target_commit, base_sha: contextInput.reviewedInput.base_commit };
    const raw = { status: 0, stdout: [
      { type: 'assistant', message: { model: 'claude-opus-5' } },
      { type: 'result', subtype: 'success', is_error: false, structured_output: { verdict: 'approve', summary: 'ok', findings: [] } },
    ].map(JSON.stringify).join('\n') };
    const run = reviewer.invokeAdversarialReview('fixture', { env: { MCCP_HARNESS: 'codex' },
      budget: { allowed: true, canRecord: false }, spawn: () => raw,
      reviewContext: contextInput });
    assert.throws(() => evidence.seal({ ...run }, receipt, root), /untrusted/);
    assert.throws(() => evidence.seal(run, { ...receipt, decision_id: 'changed' }, root), /target changed/);
    const sealed = evidence.seal(run, receipt, root);
    const context = { repoRoot: root, subjectHash: hash, gateId: receipt.gate_id, decisionId: receipt.decision_id, hostFamily: 'codex' };
    assert.equal(evidence.verify(sealed, context).ok, true);
    assert.equal(resolveEffectiveVerdict(sealed).verdict, 'unavailable');
    assert.equal(resolveEffectiveVerdict(sealed, context).verdict, 'converged');
    const file = path.join(root, sealed.reviewer_execution.evidence_path);
    const bytes = fs.readFileSync(file);
    fs.appendFileSync(file, ' ');
    assert.equal(evidence.verify(sealed, context).ok, false);
    fs.unlinkSync(file);
    fs.writeFileSync(path.join(outside, 'proof.json'), bytes);
    fs.symlinkSync(path.join(outside, 'proof.json'), file);
    assert.equal(evidence.verify(sealed, context).ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
