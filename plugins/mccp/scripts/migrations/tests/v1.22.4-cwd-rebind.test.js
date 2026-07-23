'use strict';

// v1.22.4 cwd-rebind contract (durable-evidence-substrate Phase A follow-up · F1).
//
// The rebind is the highest-risk step: it re-hashes 33 tracked ship receipts and
// atomically re-keys the tracked completion-ledger entries bound to them. These
// tests pin the safety invariants Codex R1-R6 hardened:
//   F-A tracked-only re-key (untracked E6 byte-for-byte untouched)
//   F-B fail-closed lock + TOCTOU + new→receipt→unlink-old + post-apply scan
//   F-C post-apply scan is index-independent (never git ls-files post-rename)
//   F-D fail-closed lock (does NOT inherit withLedgerLock fail-open proceed)
//   F-E explicit planned-set staging (never `git add -A` the ledger dir)
//   F-G exact-manifest gate catches a missing planned deletion (concurrent recreate)
//
// Fixture paths are built in JS (path.join) — NEVER a bash heredoc, whose `\`
// literals collapse in the Bash tool ([[bash-tool-backslash-collapse]]).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const rebind = require('../v1.22.4-cwd-rebind');
const { receiptHash } = require('../../receipt/hash');
const { entryId } = require('../../lib/completion-ledger/store');

// ── fixture helpers ──────────────────────────────────────────────────────────

function g(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function initRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwdrebind-'));
  g(root, ['init', '-q']);
  g(root, ['config', 'user.email', 'test@test.local']);
  g(root, ['config', 'user.name', 'test']);
  g(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, '.claude', 'receipts', 'mccp-pr-codex'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'completion-ledger'), { recursive: true });
  return root;
}

function receiptDir(root) { return path.join(root, '.claude', 'receipts', 'mccp-pr-codex'); }
function ledgerDir(root) { return path.join(root, '.claude', 'state', 'completion-ledger'); }

// Write a receipt with an ABSOLUTE cwd. Returns { file, oldHash, newExpectedHash }.
function writeReceipt(root, decision, cwd) {
  const receipt = {
    gate_id: 'mccp-pr-codex',
    decision_id: decision,
    subject_hash: 'sha256:subj-' + decision,
    meta: { cwd: cwd, created_at: '2026-01-01T00:00:00.000Z', command: '/mccp:pr' },
    resolution: { converged: true, codex_verdict: 'converged' },
  };
  const oldHash = receiptHash(receipt);
  receipt.receipt_hash = oldHash;
  const file = path.join(receiptDir(root), decision + '.json');
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return { file: file, oldHash: oldHash, decision: decision };
}

function ledgerEntryObj(decision, receipt_hash) {
  return {
    decision_id: decision,
    gate: 'mccp-pr-codex',
    verdict: 'converged',
    version: null,
    completed_at: '2026-01-01T00:00:00.000Z',
    commit_sha: null,
    plan_basename: decision + '.plan.md',
    plan_file_hash: null,
    risks_closed: [],
    oq_closed: [],
    receipt_hash: receipt_hash,
  };
}

// Write a ledger file bound to receipt_hash. Returns absolute path + basename.
function writeLedger(root, decision, receipt_hash) {
  const entry = ledgerEntryObj(decision, receipt_hash);
  const name = entryId(entry) + '.json';
  const abs = path.join(ledgerDir(root), name);
  fs.writeFileSync(abs, JSON.stringify({ schema_version: 'v1', entry: entry }, null, 2) + '\n', 'utf8');
  return { abs: abs, name: name };
}

function commitAll(root, msg) {
  g(root, ['add', '-A']);
  g(root, ['-c', 'user.name=test', '-c', 'user.email=test@test.local', 'commit', '-q', '-m', msg, '--no-verify']);
}

function readReceiptCwd(file) { return JSON.parse(fs.readFileSync(file, 'utf8')).meta.cwd; }
function readReceiptHash(file) { return JSON.parse(fs.readFileSync(file, 'utf8')).receipt_hash; }
function readLedgerHash(abs) { return JSON.parse(fs.readFileSync(abs, 'utf8')).entry.receipt_hash; }

// ── tests ────────────────────────────────────────────────────────────────────

test('bound pair: --apply redacts cwd, rehashes receipt, re-keys the tracked ledger, binding holds', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'demo', root); // cwd === repoRoot → redacts to '.'
  const led = writeLedger(root, 'demo', rc.oldHash);
  commitAll(root, 'seed');

  const plan = rebind.planRebind(root);
  assert.equal(plan.receipts.length, 1);
  assert.equal(plan.renames.length, 1);
  const newHash = plan.receipts[0].newHash;
  const blobs = rebind.applyRebind(root, plan);
  const scan = rebind.postApplyScan(root, plan);
  assert.equal(scan.ok, true, JSON.stringify(scan.violations));

  assert.equal(readReceiptCwd(rc.file), '.');            // redacted
  assert.equal(readReceiptHash(rc.file), newHash);       // rehashed
  assert.notEqual(newHash, rc.oldHash);
  const newLedgerAbs = path.join(ledgerDir(root), entryId(ledgerEntryObj('demo', newHash)) + '.json');
  assert.ok(fs.existsSync(newLedgerAbs), 'new-named ledger exists');
  assert.ok(!fs.existsSync(led.abs), 'old-named ledger unlinked');
  assert.equal(readLedgerHash(newLedgerAbs), newHash);   // binding preserved
  assert.ok(blobs[plan.receipts[0].relPath]);            // manifest blob recorded
});

test('old-repo absolute cwd → <outside-repo> (no path leaked), platform-aware', function () {
  const root = initRepo();
  const oldRepoCwd = path.join(root, '..', 'OLD-my-claude-code-plugin'); // outside repoRoot
  const rc = writeReceipt(root, 'oldrepo', oldRepoCwd);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  rebind.applyRebind(root, plan);
  const cwd = readReceiptCwd(rc.file);
  assert.equal(cwd, '<outside-repo>');
  assert.ok(!path.isAbsolute(cwd));
  assert.ok(!/^[A-Za-z]:[\\/]/.test(cwd));
});

test('unbound receipt (no ledger entry): cwd redacted, no ledger write', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'lonely', root);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  assert.equal(plan.renames.length, 0);
  rebind.applyRebind(root, plan);
  assert.equal(readReceiptCwd(rc.file), '.');
  assert.equal(fs.readdirSync(ledgerDir(root)).length, 0);
});

test('F-A: untracked E6 ledger is byte-for-byte untouched; its receipt IS redacted (locally dangling)', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'e6demo', root);
  commitAll(root, 'seed receipt (tracked)');
  // E6: bound ledger, but NEVER git-added → untracked.
  const e6 = writeLedger(root, 'e6demo', rc.oldHash);
  const before = fs.readFileSync(e6.abs);

  const plan = rebind.planRebind(root);
  assert.equal(plan.renames.length, 0, 'tracked-only filter excluded the untracked E6 binding');
  rebind.applyRebind(root, plan);

  assert.deepEqual(fs.readFileSync(e6.abs), before, 'E6 byte-for-byte unchanged');
  assert.equal(readReceiptCwd(rc.file), '.', 'the E6 receipt IS redacted');
  // E6 now points at the old hash while the receipt moved to a new hash → locally dangling (accepted).
  assert.notEqual(readLedgerHash(e6.abs), readReceiptHash(rc.file));
});

test('F-B TOCTOU: on-disk receipt hash changes between plan and apply → whole run aborts', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'toctou', root);
  writeLedger(root, 'toctou', rc.oldHash);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  // mutate the receipt hash under the run.
  const obj = JSON.parse(fs.readFileSync(rc.file, 'utf8'));
  obj.receipt_hash = 'sha256:MUTATED';
  fs.writeFileSync(rc.file, JSON.stringify(obj, null, 2) + '\n');
  assert.throws(function () { rebind.applyRebind(root, plan); }, /TOCTOU/);
});

test('F-B crash-recovery: seed partial state (old + new ledger both present) → idempotent apply + scan converge', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'partial', root);
  const oldLed = writeLedger(root, 'partial', rc.oldHash);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  const newHash = plan.receipts[0].newHash;
  // simulate a crash after new-ledger written but before unlink-old: both present.
  const newLed = writeLedger(root, 'partial', newHash);
  assert.ok(fs.existsSync(oldLed.abs) && fs.existsSync(newLed.abs));

  rebind.applyRebind(root, plan);
  const scan = rebind.postApplyScan(root, plan);
  assert.equal(scan.ok, true, JSON.stringify(scan.violations));
  assert.ok(!fs.existsSync(oldLed.abs), 'old-ledger unlinked after heal');
  assert.ok(fs.existsSync(newLed.abs), 'new-ledger preserved + bound');
});

test('F-B post-apply scan is fail-closed: a NEW tracked dangling → scan.ok=false', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'scanfail', root);
  writeLedger(root, 'scanfail', rc.oldHash);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  rebind.applyRebind(root, plan);
  // corrupt: revert the receipt cwd so its hash no longer matches the new-ledger.
  const obj = JSON.parse(fs.readFileSync(rc.file, 'utf8'));
  obj.meta.cwd = 'C:\\evil\\abs';
  obj.receipt_hash = 'sha256:REVERTED';
  fs.writeFileSync(rc.file, JSON.stringify(obj, null, 2) + '\n');
  const scan = rebind.postApplyScan(root, plan);
  assert.equal(scan.ok, false);
});

test('F-C post-apply scan is index-independent (passes BEFORE any git add; git ls-files would miss the new file)', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'idx', root);
  writeLedger(root, 'idx', rc.oldHash);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  rebind.applyRebind(root, plan);
  // BEFORE any `git add`: the new ledger file is untracked-in-index.
  const newLedgerName = entryId(ledgerEntryObj('idx', plan.receipts[0].newHash)) + '.json';
  const tracked = g(root, ['ls-files', '--', '.claude/state/completion-ledger/']);
  assert.ok(tracked.indexOf(newLedgerName) === -1, 'new file is untracked-in-index right now');
  const scan = rebind.postApplyScan(root, plan); // still passes — reads plan + disk, not the index
  assert.equal(scan.ok, true, JSON.stringify(scan.violations));
});

test('F-D fail-closed lock: a live (non-stale) lock → acquire throws BEFORE any write', function () {
  const root = initRepo();
  const lp = rebind.lockPath(root);
  fs.mkdirSync(path.dirname(lp), { recursive: true });
  fs.writeFileSync(lp, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), token: 'live' }));
  assert.throws(function () { rebind.acquireLockFailClosed(root); }, /FAIL-CLOSED|could not acquire/);
});

test('F-D lock: a stale lock (mtime > 30s) is reclaimed and the run proceeds', function () {
  const root = initRepo();
  const lp = rebind.lockPath(root);
  fs.mkdirSync(path.dirname(lp), { recursive: true });
  fs.writeFileSync(lp, JSON.stringify({ pid: 999999, token: 'stale' }));
  const past = Date.now() / 1000 - 120;
  fs.utimesSync(lp, past, past);
  const lock = rebind.acquireLockFailClosed(root);
  assert.ok(lock && lock.token);
  rebind.releaseLock(root, lock.token);
  assert.ok(!fs.existsSync(lp), 'lock released');
});

test('F-E explicit staging leaves untracked E6 UNSTAGED; exact-manifest gate passes', function () {
  const root = initRepo();
  const rcMain = writeReceipt(root, 'mainpair', root);
  writeLedger(root, 'mainpair', rcMain.oldHash);       // tracked bound → re-keyed
  const rcE6 = writeReceipt(root, 'e6pair', root);      // tracked receipt
  commitAll(root, 'seed tracked receipts + main ledger');
  // E6: this receipt's ledger is UNtracked (written after the commit) — exactly
  // the real E6 shape (bound to a tracked receipt, but git-untracked).
  const e6led = writeLedger(root, 'e6pair', rcE6.oldHash);
  const before = fs.readFileSync(e6led.abs);

  const plan = rebind.planRebind(root);
  assert.equal(plan.renames.length, 1, 'only the TRACKED mainpair ledger is re-keyed');
  const blobs = rebind.applyRebind(root, plan);
  rebind.writeManifest(root, plan, blobs);
  const staged = rebind.stagePlanned(root);
  assert.equal(staged.ok, true, JSON.stringify(staged.violations));
  assert.deepEqual(fs.readFileSync(e6led.abs), before, 'E6 untouched');
  const stagedNames = g(root, ['diff', '--cached', '--name-only']);
  assert.ok(stagedNames.indexOf(e6led.name) === -1, 'E6 left UNSTAGED by the explicit planned-set staging');
});

test('F-G exact-manifest gate ABORTS on a missing planned deletion (concurrent recreate of old ledger)', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'recreate', root);
  const oldLed = writeLedger(root, 'recreate', rc.oldHash);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  const blobs = rebind.applyRebind(root, plan);
  rebind.writeManifest(root, plan, blobs);
  // A concurrent writeEntry recreates the just-unlinked old ledger file with its
  // committed (HEAD) content → `git add -u` will silently skip its D.
  fs.writeFileSync(oldLed.abs, JSON.stringify({
    schema_version: 'v1', entry: ledgerEntryObj('recreate', rc.oldHash),
  }, null, 2) + '\n');
  const staged = rebind.stagePlanned(root);
  assert.equal(staged.ok, false, 'gate must abort — the planned deletion is missing');
  assert.ok(staged.violations.some(function (v) { return /NOT staged|expected D/.test(v); }));
});

test('F-E/E6 negative: if E6 is force-staged, the exact-manifest gate reports an unexpected path', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'e6stage', root);
  writeLedger(root, 'e6stage', rc.oldHash);
  commitAll(root, 'seed');
  const e6 = writeLedger(root, 'e6stage', rc.oldHash + 'ff'); // untracked E6
  const plan = rebind.planRebind(root);
  const blobs = rebind.applyRebind(root, plan);
  rebind.writeManifest(root, plan, blobs);
  rebind.stagePlanned(root);       // stage the planned set (gate passes)
  g(root, ['add', '--', e6.abs]);  // operator error: force-stage E6
  const res = rebind.verifyManifest(root);
  assert.equal(res.ok, false);
  assert.ok(res.violations.some(function (v) { return /UNEXPECTED/.test(v); }));
});

test('idempotency: a second --apply plans 0 receipts', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'idem', root);
  writeLedger(root, 'idem', rc.oldHash);
  commitAll(root, 'seed');
  rebind.applyRebind(root, rebind.planRebind(root));
  const plan2 = rebind.planRebind(root);
  assert.equal(plan2.receipts.length, 0);
  assert.equal(plan2.skipped, 1);
});

test('collision pre-flight: two receipts computing the same target ledger name → whole run aborts', function () {
  const root = initRepo();
  // craft a genuine target-filename collision: pre-create the new-named ledger
  // file for a DIFFERENT decision at the path our re-key would produce.
  const rc = writeReceipt(root, 'collide', root);
  writeLedger(root, 'collide', rc.oldHash);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  const newName = entryId(ledgerEntryObj('collide', plan.receipts[0].newHash)) + '.json';
  // a different decision already occupies the target name.
  fs.writeFileSync(path.join(ledgerDir(root), newName), JSON.stringify({
    schema_version: 'v1', entry: ledgerEntryObj('SOMEONE-ELSE', plan.receipts[0].newHash),
  }, null, 2) + '\n');
  g(root, ['add', '-A']);
  g(root, ['-c', 'user.name=test', '-c', 'user.email=test@test.local', 'commit', '-q', '-m', 'collide', '--no-verify']);
  assert.throws(function () { rebind.planRebind(root); }, /collision|already exists/i);
});

test('dangling (no-receipt) ledger entries are untouched', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'keep', root);
  writeLedger(root, 'keep', rc.oldHash);
  const dangling = writeLedger(root, 'orphan', 'sha256:no-such-receipt');
  const before = fs.readFileSync(dangling.abs);
  commitAll(root, 'seed');
  const plan = rebind.planRebind(root);
  assert.equal(plan.preRunDangling, 1);
  rebind.applyRebind(root, plan);
  assert.deepEqual(fs.readFileSync(dangling.abs), before, 'dangling entry untouched');
});

test('R2 F3: an UNTRACKED receipt is excluded from the rewrite plan and left byte-untouched', function () {
  const root = initRepo();
  // A tracked bound receipt gives the run real work; an untracked receipt with an
  // absolute cwd would be a rewrite target if the tracked filter were absent.
  const tracked = writeReceipt(root, 'tracked-one', root);
  commitAll(root, 'seed tracked receipt');
  const untracked = writeReceipt(root, 'untracked-one', root); // never git-added
  const before = fs.readFileSync(untracked.file);

  const plan = rebind.planRebind(root);
  const plannedFiles = plan.receipts.map(function (r) { return r.file; });
  assert.ok(plannedFiles.indexOf('untracked-one.json') === -1, 'untracked receipt excluded from rewrite plan');
  assert.ok(plannedFiles.indexOf('tracked-one.json') !== -1, 'tracked receipt still planned');
  assert.ok(plan.skipped >= 1, 'untracked receipt counted as skipped');

  rebind.applyRebind(root, plan);
  assert.deepEqual(fs.readFileSync(untracked.file), before, 'untracked receipt byte-for-byte untouched');
  assert.equal(readReceiptCwd(tracked.file), '.', 'the tracked receipt IS still redacted');
});

test('R3 F2: partial-crash (receipt redacted, new ledger written, old ledger NOT unlinked) → next run cleans the stranded old ledger', function () {
  const root = initRepo();
  const rc = writeReceipt(root, 'partial2', '.');            // ALREADY redacted (relative cwd)
  const curHash = rc.oldHash;                                // its current hash = the "new" hash
  const newLed = writeLedger(root, 'partial2', curHash);     // correctly bound (written before the receipt, pre-crash)
  const staleHash = 'sha256:' + 'd'.repeat(64);
  const oldLed = writeLedger(root, 'partial2', staleHash);   // stranded old ledger (dangling, the unlink that never ran)
  commitAll(root, 'seed post-crash partial state');

  const plan = rebind.planRebind(root);
  assert.equal(plan.renames.length, 0, 'receipt already relative → no rekey planned');
  assert.equal(plan.strandedUnlinks.length, 1, 'stranded old ledger detected by binding, not by absolute cwd');
  assert.equal(plan.strandedUnlinks[0].basename, oldLed.name);

  rebind.applyRebind(root, plan);
  assert.ok(!fs.existsSync(oldLed.abs), 'stranded old ledger unlinked');
  assert.ok(fs.existsSync(newLed.abs), 'correctly-bound new ledger preserved');
  assert.equal(readReceiptCwd(rc.file), '.', 'redacted receipt untouched');

  const scan = rebind.postApplyScan(root, plan);
  assert.ok(scan.ok, 'post-apply scan clean: ' + JSON.stringify(scan.violations));
});

test('R3 F2 negative: a legitimately dangling ledger (no correctly-bound sibling) is NOT unlinked', function () {
  const root = initRepo();
  writeReceipt(root, 'legit', '.');                          // redacted receipt (curHash), but NO ledger binds curHash
  const staleHash = 'sha256:' + 'e'.repeat(64);
  const dangling = writeLedger(root, 'legit', staleHash);    // dangling with no correctly-bound sibling
  commitAll(root, 'seed legit dangling');
  const before = fs.readFileSync(dangling.abs);

  const plan = rebind.planRebind(root);
  assert.equal(plan.strandedUnlinks.length, 0, 'no correctly-bound sibling → conservative, not stranded');
  rebind.applyRebind(root, plan);
  assert.deepEqual(fs.readFileSync(dangling.abs), before, 'legit dangling entry preserved byte-for-byte');
});
