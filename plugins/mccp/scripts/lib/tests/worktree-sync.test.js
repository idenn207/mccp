'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sync = require('../worktree-sync');

const DISPATCH_ID = '019eced3-cce9-7be3-81a1-c8a5c30a27fe';

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-sync-test-'));
  const worker = path.join(root, 'worker');
  const parent = path.join(root, 'parent');
  fs.mkdirSync(worker, { recursive: true });
  fs.mkdirSync(parent, { recursive: true });
  return { root: root, worker: worker, parent: parent };
}

function rimraf(target) {
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
}

function plantEnvelope(worktreePath, dispatchId, body) {
  const target = path.join(worktreePath, sync.envelopeRelPath(dispatchId));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body || '{"placeholder":true}', 'utf8');
  return target;
}

test('envelopeRelPath returns expected joined path', () => {
  const expected = path.join('.claude', 'state', 'dispatches', DISPATCH_ID + '.envelope.json');
  assert.strictEqual(sync.envelopeRelPath(DISPATCH_ID), expected);
});

test('syncEnvelopeOut: happy path moves file atomically', () => {
  const sb = makeSandbox();
  try {
    const src = plantEnvelope(sb.worker, DISPATCH_ID, '{"hello":"world"}');
    const result = sync.syncEnvelopeOut(sb.worker, sb.parent, DISPATCH_ID);
    assert.strictEqual(result.ok, true, result.error);
    assert.strictEqual(fs.existsSync(src), false, 'source must be gone after rename');
    const dst = path.join(sb.parent, sync.envelopeRelPath(DISPATCH_ID));
    assert.strictEqual(result.envelopePath, dst);
    assert.strictEqual(fs.readFileSync(dst, 'utf8'), '{"hello":"world"}');
  } finally { rimraf(sb.root); }
});

test('syncEnvelopeOut: cross-device fallback (EXDEV → copy+unlink)', () => {
  const sb = makeSandbox();
  try {
    plantEnvelope(sb.worker, DISPATCH_ID, '{"crossdev":true}');
    let renameAttempts = 0;
    let copyHits = 0;
    let unlinkHits = 0;
    const real = sync.defaultFs();
    const wrapped = {
      statSync: real.statSync,
      mkdirSync: real.mkdirSync,
      renameSync: function () {
        renameAttempts += 1;
        const err = new Error('simulated cross-device move');
        err.code = 'EXDEV';
        throw err;
      },
      copyFileSync: function (src, dst) { copyHits += 1; real.copyFileSync(src, dst); },
      unlinkSync: function (target) { unlinkHits += 1; real.unlinkSync(target); },
      rmSync: real.rmSync,
    };
    const result = sync.syncEnvelopeOut(sb.worker, sb.parent, DISPATCH_ID, { fsImpl: wrapped });
    assert.strictEqual(result.ok, true, result.error);
    assert.strictEqual(result.crossDevice, true, 'crossDevice flag must propagate');
    assert.strictEqual(renameAttempts, 1, 'rename attempted exactly once');
    assert.strictEqual(copyHits, 1, 'copy fallback fired');
    assert.strictEqual(unlinkHits, 1, 'source unlinked after copy');
    const dst = path.join(sb.parent, sync.envelopeRelPath(DISPATCH_ID));
    assert.strictEqual(fs.existsSync(dst), true);
    assert.strictEqual(fs.readFileSync(dst, 'utf8'), '{"crossdev":true}');
  } finally { rimraf(sb.root); }
});

test('syncEnvelopeOut: source missing → loud error', () => {
  const sb = makeSandbox();
  try {
    const result = sync.syncEnvelopeOut(sb.worker, sb.parent, DISPATCH_ID);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf('source envelope missing') !== -1, result.error);
  } finally { rimraf(sb.root); }
});

test('syncEnvelopeOut: destination collision → loud error (no overwrite)', () => {
  const sb = makeSandbox();
  try {
    plantEnvelope(sb.worker, DISPATCH_ID, '{"from":"worker"}');
    plantEnvelope(sb.parent, DISPATCH_ID, '{"from":"squat"}');
    const result = sync.syncEnvelopeOut(sb.worker, sb.parent, DISPATCH_ID);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf('destination already exists') !== -1, result.error);
    const dst = path.join(sb.parent, sync.envelopeRelPath(DISPATCH_ID));
    assert.strictEqual(fs.readFileSync(dst, 'utf8'), '{"from":"squat"}',
      'pre-existing dst must NOT be overwritten');
  } finally { rimraf(sb.root); }
});

test('syncEnvelopeOut: arg validation rejects empty strings', () => {
  assert.strictEqual(sync.syncEnvelopeOut('', 'p', DISPATCH_ID).ok, false);
  assert.strictEqual(sync.syncEnvelopeOut('w', '', DISPATCH_ID).ok, false);
  assert.strictEqual(sync.syncEnvelopeOut('w', 'p', '').ok, false);
});

test('cleanupWorktree: keep is no-op (worktree preserved)', () => {
  const sb = makeSandbox();
  try {
    const result = sync.cleanupWorktree(sb.worker, 'keep');
    assert.strictEqual(result.ok, true, result.error);
    assert.strictEqual(result.action, 'keep');
    assert.strictEqual(fs.existsSync(sb.worker), true,
      'worktree must survive keep');
  } finally { rimraf(sb.root); }
});

test('cleanupWorktree: remove deletes the worktree directory', () => {
  const sb = makeSandbox();
  try {
    fs.writeFileSync(path.join(sb.worker, 'marker.txt'), 'x', 'utf8');
    const result = sync.cleanupWorktree(sb.worker, 'remove');
    assert.strictEqual(result.ok, true, result.error);
    assert.strictEqual(result.action, 'remove');
    assert.strictEqual(fs.existsSync(sb.worker), false,
      'worktree must be gone after remove');
  } finally { rimraf(sb.root); }
});

test('cleanupWorktree: rejects unknown action loudly', () => {
  const sb = makeSandbox();
  try {
    const result = sync.cleanupWorktree(sb.worker, 'nuke-from-orbit');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.indexOf("action must be 'keep' or 'remove'") !== -1,
      result.error);
  } finally { rimraf(sb.root); }
});
