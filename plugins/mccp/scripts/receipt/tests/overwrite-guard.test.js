'use strict';

// durable-evidence-substrate Task A3-b (Codex R3/R4 F1) — overwrite HALT guard.
//
// A git-tracked ship receipt is an audit-binding anchor (the completion-ledger
// entry filename is `<decision>__<receipt_hash[0:12]>`). Overwriting it with a
// DIFFERENT hash snaps that binding (E4). The guard lives in
// store.js#writeReceipt — the ONLY path that replaces the canonical receipt — so
// it covers every caller, not just /mccp:pr. These tests exercise the writer
// DIRECTLY via a same-slug repeat with NO rebase (the R4 requirement: rebase is
// only one instance of the defect).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { writeReceipt, readReceipt } = require('../store');
const { makeSkeleton } = require('../schema');
const { subjectHash, receiptHash } = require('../hash');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
}

function initRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ovg-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  return root;
}

// Build a sealed ship receipt. `mutate` optionally perturbs a field BEFORE
// sealing so the receipt_hash differs.
function sealedReceipt(decisionId, mutate) {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = decisionId;
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'a'.repeat(40);
  r.meta.command = '/mccp-pr-codex';
  if (mutate) mutate(r);
  r.subject_hash = subjectHash(r);
  r.receipt_hash = receiptHash(r);
  return r;
}

test('(c) tracked + same hash (idempotent rewrite) → passes', () => {
  const root = initRepo();
  const r = sealedReceipt('idem');
  const p = writeReceipt(root, r);
  git(root, ['add', '--', p]);
  git(root, ['commit', '-q', '-m', 'add receipt']);
  // rewrite the byte-identical receipt — must NOT throw
  assert.doesNotThrow(() => writeReceipt(root, r));
  assert.equal(readReceipt(root, 'mccp-pr-codex', 'idem').receipt_hash, r.receipt_hash);
});

test('(a) tracked + different hash → throws + file unchanged (same-slug, no rebase)', () => {
  const root = initRepo();
  const original = sealedReceipt('reship');
  const p = writeReceipt(root, original);
  git(root, ['add', '--', p]);
  git(root, ['commit', '-q', '-m', 'add receipt']);

  const onDiskBefore = fs.readFileSync(p, 'utf8');

  // same decision slug, a genuinely different receipt (new head_sha → new hash)
  const reship = sealedReceipt('reship', (x) => { x.head_sha = 'b'.repeat(40); });
  assert.notEqual(reship.receipt_hash, original.receipt_hash);

  assert.throws(
    () => writeReceipt(root, reship),
    (err) => err && err.code === 'TRACKED_RECEIPT_OVERWRITE',
    'must fail-closed with TRACKED_RECEIPT_OVERWRITE',
  );

  // file on disk is byte-identical — the guard ran BEFORE fs.writeFileSync
  assert.equal(fs.readFileSync(p, 'utf8'), onDiskBefore, 'tracked receipt must be untouched');
  assert.equal(readReceipt(root, 'mccp-pr-codex', 'reship').receipt_hash, original.receipt_hash);
});

test('(b) untracked (brand-new decision) → normal write', () => {
  const root = initRepo();
  const r = sealedReceipt('fresh');
  // never committed → untracked → guard is a no-op
  assert.doesNotThrow(() => writeReceipt(root, r));
  assert.equal(readReceipt(root, 'mccp-pr-codex', 'fresh').receipt_hash, r.receipt_hash);
});

test('(b2) untracked existing file with different hash → overwrite allowed', () => {
  const root = initRepo();
  const first = sealedReceipt('wt', (x) => { x.head_sha = 'c'.repeat(40); });
  writeReceipt(root, first); // on disk but NOT committed (untracked)
  const second = sealedReceipt('wt', (x) => { x.head_sha = 'd'.repeat(40); });
  assert.notEqual(second.receipt_hash, first.receipt_hash);
  // untracked ephemera — overwriting is allowed even with a different hash
  assert.doesNotThrow(() => writeReceipt(root, second));
  assert.equal(readReceipt(root, 'mccp-pr-codex', 'wt').receipt_hash, second.receipt_hash);
});

test('escape route (operator deadlock avoidance): a NEW slug writes cleanly', () => {
  const root = initRepo();
  const original = sealedReceipt('shipped');
  const p = writeReceipt(root, original);
  git(root, ['add', '--', p]);
  git(root, ['commit', '-q', '-m', 'add receipt']);
  // same content, different decision slug → new file, guard does not fire
  const reshipped = sealedReceipt('shipped-v2', (x) => { x.head_sha = 'e'.repeat(40); });
  assert.doesNotThrow(() => writeReceipt(root, reshipped));
  assert.equal(readReceipt(root, 'mccp-pr-codex', 'shipped-v2').receipt_hash, reshipped.receipt_hash);
});
