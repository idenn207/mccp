'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('../review-target');
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-target-test-'));
  try {
    t.git(root, ['init', '-q']);
    t.git(root, ['config', 'user.name', 'Test']); t.git(root, ['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(root, 'plan.md'), '# Plan\n\n## Tasks\nImplement this.\n');
    fs.writeFileSync(path.join(root, 'app.js'), 'original\n');
    t.git(root, ['add', '.']); t.git(root, ['commit', '-qm', 'fixture']);
    const capture = () => t.capture({ cwd: root, planPath: 'plan.md', gateId: 'mccp-implement-codex', decisionId: 'fixture' });
    fn(root, capture);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('immutable input rejects unstaged, staged and untracked product changes', () => fixture((root, capture) => {
  const c = capture();
  fs.appendFileSync(path.join(root, 'app.js'), 'changed');
  assert.throws(() => t.assertCurrent(c), /dirty/);
  t.git(root, ['add', 'app.js']); assert.throws(capture, /dirty/);
  fs.writeFileSync(path.join(root, 'app.js'), 'original\n');
  assert.throws(capture, /dirty/); // index/worktree changes must not cancel
  t.git(root, ['reset', '--hard', 'HEAD']);
  fs.writeFileSync(path.join(root, 'new.js'), 'new'); assert.throws(capture, /dirty/);
}));
test('exact review-section injection preserves input while task and duplicate section changes fail', () => fixture((root, capture) => {
  const c = capture(); const file = path.join(root, 'plan.md'); const old = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, old + '\n## Codex Adversarial Review\nApproved.\n');
  assert.equal(t.assertCurrent(c), undefined);
  fs.appendFileSync(file, '\n## Codex Adversarial Review\nAnother.\n'); assert.throws(() => t.assertCurrent(c), /ambiguous/);
  fs.writeFileSync(file, old.replace('Implement this.', 'Implement something else.')); assert.throws(() => t.assertCurrent(c), /plan changed/);
}));
test('historical upstream evidence survives a code commit, current-target does not', () => fixture((root, capture) => {
  const c = capture(); fs.appendFileSync(path.join(root, 'app.js'), 'new');
  t.git(root, ['add', '.']); t.git(root, ['commit', '-qm', 'change']);
  assert.equal(t.verify(c.reviewedInput, root, { mode: 'upstream' }), true);
  assert.throws(() => t.assertCurrent(c), /HEAD changed/);
}));
test('snapshot uses committed blob data and cleans up even on reviewer failure', () => fixture((root, capture) => {
  const sentinel = path.join(root, '.git', 'hook-sentinel');
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\ntouch "' + sentinel + '"\n', { mode: 0o700 });
  fs.symlinkSync('/outside-must-not-read', path.join(root, 'link')); t.git(root, ['add', '.']); t.git(root, ['commit', '-qm', 'symlink object']);
  const c = capture(); let work;
  assert.throws(() => t.snapshot(c, data => { work = data.cwd; assert.ok(data.reviewText.includes('"mode":"120000"')); throw Error('review failed'); }), /review failed/);
  assert.equal(fs.existsSync(work), false); assert.equal(t.git(root, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1);
  assert.equal(fs.existsSync(sentinel), false);
}));
test('caller exclusions and mutable context cannot authorize product dirt', () => fixture((root, capture) => {
  const c = capture(); assert.throws(() => t.assertCurrent({ ...c }), /untrusted/);
  assert.throws(() => { c.reviewedInput.target_commit = 'a'.repeat(40); }, TypeError);
  fs.writeFileSync(path.join(root, 'arbitrary'), 'dirty');
  assert.throws(() => t.capture({ cwd: root, planPath: 'plan.md', gateId: 'mccp-implement-codex', decisionId: 'fixture', allowed: ['arbitrary'] }), /dirty/);
}));
