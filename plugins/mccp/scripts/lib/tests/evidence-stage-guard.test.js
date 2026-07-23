'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const guard = require('../evidence-stage-guard');
const { receiptHash } = require('../../receipt/hash');

// Fixtures use a SYNTHETIC absolute path (`C:\fixture\abs\path`), never this
// repo's real root — else the F-H/F-I history-leak gate would flag this very test.

function validReceipt(over) {
  const r = Object.assign({
    gate_id: 'mccp-pr-codex',
    decision_id: 'demo',
    resolution: { converged: true, codex_verdict: 'converged' },
    meta: { cwd: '.', command: '/mccp:pr', created_at: '2026-01-01T00:00:00.000Z' },
  }, over || {});
  r.receipt_hash = receiptHash(r);
  return r;
}

// ── isAbsoluteCwd ─────────────────────────────────────────────────────────────

test('isAbsoluteCwd: drive-letter, POSIX-absolute leak; repo-relative + placeholder are safe', () => {
  assert.equal(guard.isAbsoluteCwd('C:\\fixture\\abs\\path'), true);
  assert.equal(guard.isAbsoluteCwd('C:/fixture/abs/path'), true);
  assert.equal(guard.isAbsoluteCwd('/home/user/repo'), true);
  assert.equal(guard.isAbsoluteCwd('.'), false);
  assert.equal(guard.isAbsoluteCwd('sub/dir'), false);
  assert.equal(guard.isAbsoluteCwd('<outside-repo>'), false);
  assert.equal(guard.isAbsoluteCwd(''), false);
  assert.equal(guard.isAbsoluteCwd(undefined), false);
});

// ── validateContent (pure — the R3/F1 integrity core) ─────────────────────────

test('validateContent: a receipt whose declared hash matches → ok', () => {
  const r = validReceipt();
  assert.equal(guard.validateContent('r.json', JSON.stringify(r)), null);
});

test('validateContent: R3/F1 — tampered codex_verdict with stale receipt_hash → offender', () => {
  const r = validReceipt({ resolution: { converged: true, codex_verdict: 'converged' } });
  r.receipt_hash = receiptHash(r);
  // Forge: flip the audited verdict but leave the OLD hash (the exact attack the
  // non-empty-string check missed).
  r.resolution.codex_verdict = 'divergent';
  const bad = guard.validateContent('forged.json', JSON.stringify(r));
  assert.ok(bad, 'tampered receipt must be caught');
  assert.match(bad.reason, /receipt_hash mismatch/);
});

test('validateContent: any stale/wrong hash string → offender', () => {
  const r = validReceipt();
  r.receipt_hash = 'sha256:' + '0'.repeat(64);
  const bad = guard.validateContent('stale.json', JSON.stringify(r));
  assert.match(bad.reason, /receipt_hash mismatch/);
});

test('validateContent: absolute meta.cwd (even with a valid hash) → offender', () => {
  const r = validReceipt({ meta: { cwd: 'C:\\fixture\\abs\\path', command: '/mccp:pr', created_at: '2026-01-01T00:00:00.000Z' } });
  const bad = guard.validateContent('leak.json', JSON.stringify(r));
  assert.match(bad.reason, /absolute meta\.cwd/);
});

test('validateContent: unparseable JSON → offender (NOT silently skipped)', () => {
  const bad = guard.validateContent('corrupt.json', '{ not valid json ');
  assert.match(bad.reason, /unparseable/);
});

test('validateContent: missing receipt_hash → offender', () => {
  const bad = guard.validateContent('nohash.json', JSON.stringify({ meta: { cwd: '.' } }));
  assert.match(bad.reason, /receipt_hash/);
});

// ── validateStaged (git integration — validates the STAGED blob, not worktree) ──

function initRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stageguard-'));
  const g = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g(['init', '-q']);
  g(['config', 'user.email', 'test@test.local']);
  g(['config', 'user.name', 'test']);
  g(['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex'), { recursive: true });
  return { root, g };
}
function rel(name) { return '.claude/receipts/mccp-pr-codex/' + name; }
function writeAndStage(root, g, name, r) {
  fs.writeFileSync(path.join(root, rel(name)), JSON.stringify(r, null, 2) + '\n', 'utf8');
  g(['add', '--', rel(name)]);
  return rel(name);
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ } }

test('validateStaged: a staged valid receipt → ok', () => {
  const { root, g } = initRepo();
  try {
    const p = writeAndStage(root, g, 'ok.json', validReceipt());
    const res = guard.validateStaged(root, [p]);
    assert.equal(res.ok, true, JSON.stringify(res.offenders));
  } finally { cleanup(root); }
});

test('validateStaged: R3/F1 — validates the STAGED blob, so a post-add worktree edit cannot smuggle a leak', () => {
  const { root, g } = initRepo();
  try {
    const r = validReceipt();
    const p = writeAndStage(root, g, 'clean.json', r); // clean bytes are what got staged
    // Diverge the WORKING TREE after `git add` — an absolute-cwd forgery. The guard
    // must read the staged blob (clean) and pass, proving it never trusts worktree.
    const forged = validReceipt({ meta: { cwd: 'C:\\fixture\\abs\\path', command: '/mccp:pr', created_at: '2026-01-01T00:00:00.000Z' } });
    fs.writeFileSync(path.join(root, p), JSON.stringify(forged, null, 2) + '\n', 'utf8');
    const res = guard.validateStaged(root, [p]);
    assert.equal(res.ok, true, 'staged (clean) blob is validated, not the diverged worktree');
  } finally { cleanup(root); }
});

test('validateStaged: an unstaged path → offender (git show :path fails)', () => {
  const { root } = initRepo();
  try {
    const res = guard.validateStaged(root, [rel('ghost.json')]);
    assert.equal(res.ok, false);
    assert.match(res.offenders[0].reason, /not staged|unreadable/);
  } finally { cleanup(root); }
});

test('validateStaged: blank lines are skipped, but R4/F1 a stray non-JSON staged path is REJECTED', () => {
  const { root, g } = initRepo();
  try {
    const p = writeAndStage(root, g, 'ok.json', validReceipt());
    // blank/whitespace lines (from the diff trailing newline) are skipped.
    const okRes = guard.validateStaged(root, ['', '  ', p]);
    assert.equal(okRes.ok, true, JSON.stringify(okRes.offenders));
    // a stray non-JSON file staged under the receipt corpus must be rejected.
    const badRes = guard.validateStaged(root, [p, '.claude/receipts/mccp-pr-codex/scratch.txt']);
    assert.equal(badRes.ok, false);
    assert.match(badRes.offenders[0].reason, /non-JSON path/);
  } finally { cleanup(root); }
});
