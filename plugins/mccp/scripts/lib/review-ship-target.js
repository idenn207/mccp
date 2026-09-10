'use strict';

const fs = require('fs');
const path = require('path');
const t = require('./review-target');
const evidence = require('./reviewer-evidence');
const hashes = require('../receipt/hash');
const schema = require('../receipt/schema');
function validateReceipt(root, receipt) {
  const e = receipt && receipt.resolution && receipt.resolution.reviewer_execution;
  if (!e || receipt.gate_id !== 'mccp-pr-codex' || receipt.resolution.reviewer_verdict !== 'converged' ||
      !schema.validate(receipt).ok || hashes.subjectHash(receipt) !== receipt.subject_hash ||
      hashes.receiptHash(receipt) !== receipt.receipt_hash ||
      receipt.head_sha !== e.reviewed_input.target_commit ||
      !evidence.verify(receipt.resolution, { repoRoot: root, gateId: receipt.gate_id, decisionId: receipt.decision_id,
        subjectHash: receipt.subject_hash, planHash: receipt.plan_hash, hostFamily: 'codex', mode: 'upstream' }).ok) throw Error('invalid ship receipt');
  return e;
}
function describe(root, receipt) {
  const e = validateReceipt(root, receipt);
  const roles = t.outputs(receipt.gate_id, receipt.decision_id, e.run_nonce);
  const files = ['proof', 'receipt'].map(role => {
    const p = roles[role]; const full = t.contained(root, p);
    const bytes = fs.readFileSync(full);
    if (role === 'receipt' && t.canonical(JSON.parse(bytes)) !== t.canonical(receipt)) throw Error('ship receipt replaced');
    if (role === 'proof' && t.digest(bytes) !== e.evidence_hash) throw Error('ship proof replaced');
    if (fs.statSync(full).mode & 0o111) throw Error('executable evidence refused');
    // Git only tracks the executable bit for regular files.
    return { role, path: p, hash: t.digest(bytes), mode: fs.statSync(full).mode & 0o111 ? '100755' : '100644' };
  });
  return { version: 1, gate_id: receipt.gate_id, decision_id: receipt.decision_id, run_nonce: e.run_nonce,
    receipt_hash: receipt.receipt_hash, reviewed_input_hash: e.reviewed_input_hash,
    reviewed_commit: e.reviewed_input.target_commit, files };
}
function seal(run, receipt, root) {
  const reviewer = require('./reviewer-invoke');
  const c = reviewer.executionContext(run);
  if (!reviewer.isExecutionResult(run) || !t.isCapture(c) || c.runNonce !== receipt.resolution.reviewer_execution.run_nonce) throw Error('ship manifest requires execution owner');
  t.assertCurrent(c);
  const manifest = describe(root, receipt);
  const full = path.join(root, c.outputPaths.manifest);
  fs.writeFileSync(full, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return c.outputPaths.manifest;
}
function verify(root, receipt, candidate) {
  try {
    const e = validateReceipt(root, receipt);
    const roles = t.outputs(receipt.gate_id, receipt.decision_id, e.run_nonce);
    const manifest = describe(root, receipt);
    const manifestBytes = fs.readFileSync(t.contained(root, roles.manifest));
    if (fs.statSync(path.join(root, roles.manifest)).mode & 0o111) throw Error('executable manifest refused');
    if (t.canonical(JSON.parse(manifestBytes)) !== t.canonical(manifest)) throw Error('ship manifest mismatch');
    const h = t.git(root, ['rev-parse', '--verify', (candidate || 'HEAD') + '^{commit}']).trim();
    const r = e.reviewed_input.target_commit;
    t.git(root, ['merge-base', '--is-ancestor', r, h]);
    const expected = [...manifest.files, { role: 'manifest', path: roles.manifest, hash: t.digest(manifestBytes),
      mode: fs.statSync(path.join(root, roles.manifest)).mode & 0o111 ? '100755' : '100644' }];
    const commits = t.git(root, ['rev-list', '--reverse', r + '..' + h]).trim().split('\n').filter(Boolean);
    if (!commits.length) throw Error('evidence commit required');
    for (const commit of commits) {
      if (t.git(root, ['rev-list', '--parents', '-n', '1', commit]).trim().split(' ').length !== 2) throw Error('merge ship commit refused');
      const changes = t.git(root, ['diff-tree', '--no-commit-id', '--name-status', '--no-renames', '-r', '-z', commit]).split('\0').filter(Boolean);
      for (let i = 0; i < changes.length; i += 2) {
        const status = changes[i]; const p = changes[i + 1]; const authorized = expected.find(x => x.path === p);
        if (!authorized || !['A', 'M'].includes(status)) throw Error('non-evidence descendant change');
        const entry = t.git(root, ['ls-tree', commit, '--', p]).trim();
        const m = /^(100644|100755) blob ([a-f0-9]+)\t/.exec(entry);
        if (!m || m[1] !== authorized.mode || t.digest(t.git(root, ['cat-file', 'blob', m[2]], true)) !== authorized.hash) throw Error('descendant output differs from sealed bytes');
      }
    }
    for (const f of expected) {
      const m = /^(100644|100755) blob ([a-f0-9]+)\t/.exec(t.git(root, ['ls-tree', h, '--', f.path]));
      if (!m || m[1] !== f.mode || t.digest(t.git(root, ['cat-file', 'blob', m[2]], true)) !== f.hash) throw Error('ship outputs missing or changed');
      if (f.role === 'receipt' && t.canonical(JSON.parse(t.git(root, ['cat-file', 'blob', m[2]]))) !== t.canonical(receipt)) throw Error('candidate receipt mismatch');
      if (f.role === 'proof' && t.digest(t.git(root, ['cat-file', 'blob', m[2]], true)) !== e.evidence_hash) throw Error('candidate proof mismatch');
    }
    t.clean(root, []);
    return { ok: true, reviewedCommit: r, shipCommit: h };
  } catch (err) { return { ok: false, reason: err.message }; }
}
module.exports = { seal, verify };
