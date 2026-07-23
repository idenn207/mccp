'use strict';

// durable-evidence-substrate Task A3 — new-receipt meta.cwd normalization.
//
// Storing the absolute cwd leaked the working-tree path (and, in old worktrees,
// the prior repo name) into what becomes a git-tracked audit corpus (E7). New
// writes normalize meta.cwd to repo-relative; existing receipts are never
// re-read/re-written, and NO meta.cwd carve-out is added to hash.js (E4) — so
// the existing 33 hashes stay byte-identical. This suite pins the normalizer's
// branches, the end-to-end relative value, and the carve-out-absence property.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildReceipt, normalizeReceiptCwd } = require('../write');
const { makeSkeleton } = require('../schema');
const { receiptHash } = require('../hash');

function initRepo() {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'cwdnorm-'));
  execFileSync('git', ['init', '-q'], { cwd: raw });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: raw });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: raw });
  // Anchor `root` on git's own toplevel (long-name form) so it matches what
  // buildReceipt's internal gitRepoRoot returns. Windows os.tmpdir() can carry
  // an 8.3 short name (SKYPAR~1) that realpathSync preserves but git expands —
  // a fixture artifact, not a production path shape.
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: raw, encoding: 'utf8' }).trim();
  const root = path.normalize(top);
  fs.writeFileSync(path.join(root, 'seed.txt'), 'seed');
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: root });
  return root;
}

test('normalizeReceiptCwd: repo root → "."', () => {
  const root = initRepo();
  assert.equal(normalizeReceiptCwd(root, root), '.');
});

test('normalizeReceiptCwd: subdir → relative path', () => {
  const root = initRepo();
  const sub = path.join(root, 'plugins', 'mccp');
  assert.equal(normalizeReceiptCwd(sub, root), 'plugins/mccp');
});

test('normalizeReceiptCwd: outside repo → placeholder (no absolute leak)', () => {
  const root = initRepo();
  const outside = path.join(root, '..');
  assert.equal(normalizeReceiptCwd(outside, root), '<outside-repo>');
});

test('normalizeReceiptCwd: no repo root → "." (never leak)', () => {
  assert.equal(normalizeReceiptCwd('C:\\anything\\here', null), '.');
  assert.equal(normalizeReceiptCwd('/anything/here', ''), '.');
});

test('end-to-end: buildReceipt at repo root stores meta.cwd === "."', () => {
  const root = initRepo();
  const planPath = path.join(root, 'plan.md');
  fs.writeFileSync(planPath, '# plan\n\n## Codex Adversarial Review\n\nconverged\n');
  const { receipt } = buildReceipt({
    gate: 'mccp-implement-codex',
    decision: 'cwdtest',
    plan: planPath,
    cwd: root,
  });
  assert.equal(receipt.meta.cwd, '.');
  assert.ok(!path.isAbsolute(receipt.meta.cwd), 'meta.cwd must not be absolute');
});

test('end-to-end: buildReceipt in a subdir stores a relative meta.cwd', () => {
  const root = initRepo();
  const sub = path.join(root, 'plugins');
  fs.mkdirSync(sub, { recursive: true });
  const planPath = path.join(root, 'plan.md');
  fs.writeFileSync(planPath, '# plan\n\n## Codex Adversarial Review\n\nconverged\n');
  const { receipt } = buildReceipt({
    gate: 'mccp-implement-codex',
    decision: 'cwdtest-sub',
    plan: planPath,
    cwd: sub,
  });
  assert.equal(receipt.meta.cwd, 'plugins');
});

test('carve-out absence: meta.cwd IS part of receiptHash (existing 33 unaffected)', () => {
  // If a carve-out were added, changing meta.cwd would NOT change the hash and
  // the existing 33 absolute-cwd receipts would all fail validation (E4). The
  // hash MUST remain sensitive to meta.cwd.
  const a = makeSkeleton({});
  a.gate_id = 'mccp-pr-codex';
  a.decision_id = 'x';
  a.meta.command = '/mccp-pr-codex';
  a.meta.cwd = 'C:\\fixture\\abs\\path'; // synthetic absolute path — never the real repo root (F-I pre-push leak gate)
  const b = JSON.parse(JSON.stringify(a));
  b.meta.cwd = '.';
  assert.notEqual(receiptHash(a), receiptHash(b),
    'meta.cwd must remain inside the canonical hash (no carve-out)');
});
