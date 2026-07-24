'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const guard = require('../evidence-stage-guard');
const { receiptHash } = require('../../receipt/hash');
const { makeSkeleton } = require('../../receipt/schema');

// Fixtures use a SYNTHETIC absolute path (`C:\fixture\abs\path`), never this
// repo's real root — else the F-H/F-I history-leak gate would flag this very test.
//
// M1 Task 2 (R5-F1): validateContent now requires schema.validate + gate_id +
// phase + filename-slug === decision_id, so a fixture must be a FULL valid ship
// receipt (built from makeSkeleton) and its filename basename must match its
// decision_id. `full(decisionId, over)` recomputes receipt_hash AFTER applying
// overrides so the tamper check still sees a self-consistent hash.
function full(decisionId, over) {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = decisionId;
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'b'.repeat(40);
  r.subject_hash = 'sha256:' + 'c'.repeat(64);
  r.resolution.converged = true;
  r.resolution.codex_verdict = 'converged';
  r.meta.command = '/mccp:pr';
  r.meta.cwd = '.';
  if (over) {
    if (over.meta) Object.assign(r.meta, over.meta);
    if (over.resolution) Object.assign(r.resolution, over.resolution);
    for (const k of Object.keys(over)) {
      if (k !== 'meta' && k !== 'resolution') r[k] = over[k];
    }
  }
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

// ── validateContent (pure — the R3/F1 integrity core + M1 R5-F1 schema/gate) ───

test('validateContent: a full valid receipt whose declared hash matches → ok', () => {
  const r = full('demo');
  assert.equal(guard.validateContent('demo.json', JSON.stringify(r)), null);
});

test('validateContent: R3/F1 — tampered codex_verdict with stale receipt_hash → offender', () => {
  const r = full('demo');
  // Forge: flip the audited verdict but leave the OLD hash (the exact attack the
  // non-empty-string check missed). Hash-recompute fires before schema/gate/slug.
  r.resolution.codex_verdict = 'divergent';
  const bad = guard.validateContent('demo.json', JSON.stringify(r));
  assert.ok(bad, 'tampered receipt must be caught');
  assert.match(bad.reason, /receipt_hash mismatch/);
});

test('validateContent: any stale/wrong hash string → offender', () => {
  const r = full('demo');
  r.receipt_hash = 'sha256:' + '0'.repeat(64);
  const bad = guard.validateContent('demo.json', JSON.stringify(r));
  assert.match(bad.reason, /receipt_hash mismatch/);
});

test('validateContent: absolute meta.cwd (even with a valid hash) → offender', () => {
  const r = full('leak', { meta: { cwd: 'C:\\fixture\\abs\\path' } });
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

// ── M1 Task 2 (R5-F1): schema / gate / phase / slug — hash-valid but not a real
// pr-codex ship receipt for THIS decision ────────────────────────────────────

test('validateContent: R5-F1 — hash-valid but wrong gate_id → offender', () => {
  const r = full('demo', { gate_id: 'mccp-plan-codex', phase: 'plan' });
  const bad = guard.validateContent('demo.json', JSON.stringify(r));
  assert.ok(bad, 'a plan-codex receipt in the ship corpus must be rejected');
  assert.match(bad.reason, /wrong gate_id/);
});

test('validateContent: R5-F1 — hash-valid but wrong phase → offender', () => {
  const r = full('demo', { phase: 'implement' });
  const bad = guard.validateContent('demo.json', JSON.stringify(r));
  assert.match(bad.reason, /wrong phase/);
});

test('validateContent: R5-F1 — hash-valid but schema-invalid body → offender', () => {
  // round out of the [1,10] range is a clean schema violation; the hash is still
  // self-consistent so ONLY schema.validate can catch it.
  const r = full('demo', { round: 99 });
  const bad = guard.validateContent('demo.json', JSON.stringify(r));
  assert.match(bad.reason, /schema invalid/);
});

test('validateContent: R5-F1 — filename slug != decision_id → offender', () => {
  const r = full('demo');
  const bad = guard.validateContent('other.json', JSON.stringify(r));
  assert.match(bad.reason, /filename slug/);
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
    const p = writeAndStage(root, g, 'ok.json', full('ok'));
    const res = guard.validateStaged(root, [p]);
    assert.equal(res.ok, true, JSON.stringify(res.offenders));
  } finally { cleanup(root); }
});

test('validateStaged: R3/F1 — validates the STAGED blob, so a post-add worktree edit cannot smuggle a leak', () => {
  const { root, g } = initRepo();
  try {
    const p = writeAndStage(root, g, 'clean.json', full('clean')); // clean bytes are what got staged
    // Diverge the WORKING TREE after `git add` — an absolute-cwd forgery. The guard
    // must read the staged blob (clean) and pass, proving it never trusts worktree.
    const forged = full('clean', { meta: { cwd: 'C:\\fixture\\abs\\path' } });
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
    const p = writeAndStage(root, g, 'ok.json', full('ok'));
    // blank/whitespace lines (from the diff trailing newline) are skipped.
    const okRes = guard.validateStaged(root, ['', '  ', p]);
    assert.equal(okRes.ok, true, JSON.stringify(okRes.offenders));
    // a stray non-JSON file staged under the receipt corpus must be rejected.
    const badRes = guard.validateStaged(root, [p, '.claude/receipts/mccp-pr-codex/scratch.txt']);
    assert.equal(badRes.ok, false);
    assert.match(badRes.offenders[0].reason, /non-JSON path/);
  } finally { cleanup(root); }
});
