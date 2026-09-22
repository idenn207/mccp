'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const t = require('../review-target');
const store = require('../../receipt/store');
const ship = require('../review-ship-target');
function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-gate-e2e-'));
  const root = path.join(temp, 'repo'); const binDir = path.join(temp, 'bin'); fs.mkdirSync(root); fs.mkdirSync(binDir);
  const oldEnv = { ...process.env };
  try {
    t.git(root, ['init', '-q']); t.git(root, ['config', 'user.name', 'Test']); t.git(root, ['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(root, 'plan.md'), '# Plan\n\n## Tasks\nReview fixture implementation.\n');
    fs.writeFileSync(path.join(root, '.gitignore'), '.claude/state/\n');
    t.git(root, ['add', '.']); t.git(root, ['commit', '-qm', 'fixture']);
    const raw = [ { type: 'assistant', message: { model: 'claude-opus-5' } },
      { type: 'result', subtype: 'success', is_error: false, structured_output: { verdict: 'approve', summary: 'ok', findings: [] } } ].map(JSON.stringify).join('\n');
    const bin = path.join(binDir, 'claude');
    fs.writeFileSync(bin, '#!' + process.execPath + '\nconst fs=require("fs");const input=fs.readFileSync(0,"utf8");if(!input.includes("Committed tree"))process.exit(9);process.stdout.write(' + JSON.stringify(raw) + ');', { mode: 0o700 });
    Object.assign(process.env, { PATH: binDir + path.delimiter + process.env.PATH, MCCP_HARNESS: 'codex', MCCP_BRIEFING: 'off',
      CLAUDE_PLUGIN_ROOT: path.resolve(__dirname, '../../..') });
    fs.writeFileSync(path.join(root, '.git', 'body.md'), 'Fixture PR body');
    fn(root, bin);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in oldEnv)) delete process.env[k];
    Object.assign(process.env, oldEnv); fs.rmSync(temp, { recursive: true, force: true });
  }
}
function invoke(root, gate) {
  if (gate === 'plan') return require('../plan-codex-runner').run({ cwd: root, plan: 'plan.md', decision: 'fixture', runNonce: crypto.randomUUID(), codexTimeoutMs: 5000 }).exitCode;
  if (gate === 'implement') return require('../implement-review-runner').run({ cwd: root, plan: 'plan.md', decision: 'fixture', timeoutMs: 5000 }).exitCode;
  return require('../pr-phase-helpers/codex-runner').runMain({ cwd: root, plan: 'plan.md', decision: 'fixture', base: 'HEAD', 'body-file': path.join(root, '.git', 'body.md'), 'timeout-ms': '5000' });
}
for (const gate of ['plan', 'implement', 'pr']) {
  test(gate + ' actual entry invokes Claude executable and seals opposite-family evidence', () => fixture(root => {
    assert.equal(invoke(root, gate), 0);
    const receipt = store.readReceipt(root, 'mccp-' + gate + '-codex', 'fixture');
    assert.equal(receipt.resolution.reviewer_verdict, 'converged'); assert.equal(receipt.resolution.codex_verdict, undefined);
    assert.equal(receipt.resolution.reviewer_execution.host_family, 'codex');
    assert.equal(receipt.resolution.reviewer_execution.reviewer_family, 'claude');
  }));
  test(gate + ' unavailable executable cannot issue approval', () => fixture((root, bin) => {
    fs.writeFileSync(bin, '#!' + process.execPath + '\nprocess.exit(1);');
    assert.notEqual(invoke(root, gate), 0);
    assert.equal(store.readReceipt(root, 'mccp-' + gate + '-codex', 'fixture'), null);
  }));
}
test('PR owner lock survives the read-only phase and rejects a concurrent owner', () => fixture(root => {
  const dir = path.join(root, '.git', 'mccp', 'pr-review'); fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, 'fixture.lock'); fs.writeFileSync(lock, 'existing owner');
  assert.notEqual(invoke(root, 'pr'), 0);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'existing owner');
  assert.equal(store.readReceipt(root, 'mccp-pr-codex', 'fixture'), null);
}));
test('plan intent applicability cannot turn a divergent Claude verdict into gate success', () => fixture((root, bin) => {
  const text = fs.readFileSync(bin, 'utf8'); fs.writeFileSync(bin, text.replace('approve', 'needs-attention'));
  assert.notEqual(invoke(root, 'plan'), 0);
  assert.equal(store.readReceipt(root, 'mccp-plan-codex', 'fixture').resolution.reviewer_verdict, 'divergent');
}));
test('evidence commit preserves R; product edit/revert and output tampering cannot ship', () => fixture(root => {
  assert.equal(invoke(root, 'pr'), 0);
  const receipt = store.readReceipt(root, 'mccp-pr-codex', 'fixture');
  const r = receipt.head_sha;
  t.git(root, ['add', '.claude/reviews', '.claude/receipts']); t.git(root, ['commit', '-qm', 'evidence']);
  const h = t.git(root, ['rev-parse', 'HEAD']).trim();
  assert.deepEqual(ship.verify(root, receipt), { ok: true, reviewedCommit: r, shipCommit: h });
  fs.writeFileSync(path.join(root, 'product.js'), 'hidden change'); t.git(root, ['add', '.']); t.git(root, ['commit', '-qm', 'product']);
  t.git(root, ['revert', '--no-edit', 'HEAD']); assert.equal(ship.verify(root, receipt).ok, false);
  t.git(root, ['reset', '--hard', h]);
  const roles = t.outputs(receipt.gate_id, receipt.decision_id, receipt.resolution.reviewer_execution.run_nonce);
  fs.writeFileSync(path.join(root, roles.receipt), '{"forged":"not a receipt"}');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, roles.manifest)));
  manifest.files.find(f => f.role === 'receipt').hash = t.digest(fs.readFileSync(path.join(root, roles.receipt)));
  fs.writeFileSync(path.join(root, roles.manifest), JSON.stringify(manifest));
  t.git(root, ['add', '.']); t.git(root, ['commit', '-qm', 'forged receipt']);
  assert.equal(ship.verify(root, receipt).ok, false);
  t.git(root, ['reset', '--hard', h]);
  fs.appendFileSync(path.join(root, receipt.resolution.reviewer_execution.evidence_path), ' ');
  assert.equal(ship.verify(root, receipt).ok, false);
}));
