'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../store');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ledger-store-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}
function makeEntry(over) {
  return Object.assign({
    decision_id: 'cycle-m1',
    gate: 'mccp-pr-codex',
    verdict: 'converged',
    version: '1.18.3',
    completed_at: '2026-06-24T03:00:00.000Z',
    commit_sha: 'abc1234',
    plan_basename: 'cycle-m1.plan.md',
    plan_file_hash: 'sha256:' + 'a'.repeat(64),
    risks_closed: ['r1', 'r2'],
    oq_closed: ['q1'],
    receipt_hash: 'sha256:' + 'd'.repeat(64),
  }, over || {});
}

test('writeEntry: valid entry creates <id>.json with {schema_version, entry} shape', () => {
  const root = tmpRepo();
  try {
    const res = store.writeEntry(root, makeEntry());
    assert.equal(res.ok, true);
    assert.equal(res.noop, false);
    assert.ok(fs.existsSync(res.path));
    const parsed = JSON.parse(fs.readFileSync(res.path, 'utf8'));
    assert.equal(parsed.schema_version, 'v1');
    assert.equal(parsed.entry.decision_id, 'cycle-m1');
    assert.deepEqual(parsed.entry.risks_closed, ['r1', 'r2']);
    // id = <decision>__<hash12> (sha256: prefix stripped, 12 hex)
    assert.match(path.basename(res.path), /^cycle-m1__d{12}\.json$/);
  } finally { cleanup(root); }
});

test('writeEntry: idempotent no-op when same <id> already exists', () => {
  const root = tmpRepo();
  try {
    const first = store.writeEntry(root, makeEntry());
    const mtime1 = fs.statSync(first.path).mtimeMs;
    // Same decision_id + receipt_hash → identical id → no-op (content untouched).
    const second = store.writeEntry(root, makeEntry({ completed_at: '2099-01-01T00:00:00.000Z' }));
    assert.equal(second.ok, true);
    assert.equal(second.noop, true);
    const parsed = JSON.parse(fs.readFileSync(first.path, 'utf8'));
    assert.equal(parsed.entry.completed_at, '2026-06-24T03:00:00.000Z',
      'idempotent: first content preserved, second skipped');
    assert.equal(fs.statSync(first.path).mtimeMs, mtime1);
  } finally { cleanup(root); }
});

test('writeEntry: invalid entry refused (no file written, fail-open ok:false, never throws)', () => {
  const root = tmpRepo();
  try {
    assert.doesNotThrow(() => {
      const bad = store.writeEntry(root, makeEntry({ completed_at: 'not-an-iso' }));
      assert.equal(bad.ok, false);
      assert.match(bad.error, /completed_at/);
    });
    const badVerdict = store.writeEntry(root, makeEntry({ verdict: 'bogus' }));
    assert.equal(badVerdict.ok, false);
    const unknownKey = store.writeEntry(root, makeEntry({ surprise: 1 }));
    assert.equal(unknownKey.ok, false);
    assert.match(unknownKey.error, /unknown entry key/);
    const dir = store.ledgerDir(root);
    const fileCount = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).length
      : 0;
    assert.equal(fileCount, 0, 'no file written for any invalid entry');
  } finally { cleanup(root); }
});

test('readLedger: empty / missing dir → ok with empty entries', () => {
  const root = tmpRepo();
  try {
    const res = store.readLedger(root);
    assert.equal(res.ok, true);
    assert.deepEqual(res.entries, []);
    assert.equal(res.degraded, false);
  } finally { cleanup(root); }
});

test('readLedger: dedup by decision_id (latest completed_at wins)', () => {
  const root = tmpRepo();
  try {
    store.writeEntry(root, makeEntry({
      receipt_hash: 'sha256:' + 'a'.repeat(64),
      completed_at: '2026-06-20T00:00:00.000Z',
    }));
    store.writeEntry(root, makeEntry({
      receipt_hash: 'sha256:' + 'b'.repeat(64),
      completed_at: '2026-06-24T00:00:00.000Z',
    }));
    const res = store.readLedger(root);
    assert.equal(res.entries.length, 1, 'same decision_id deduped to one');
    assert.equal(res.entries[0].completed_at, '2026-06-24T00:00:00.000Z', 'latest wins');
  } finally { cleanup(root); }
});

test('readLedger: malformed json file → invalid_count++ + degraded=true (loud fail-open)', () => {
  const root = tmpRepo();
  try {
    store.writeEntry(root, makeEntry());
    fs.writeFileSync(path.join(store.ledgerDir(root), 'broken.json'), '{ "entry": ', 'utf8');
    const res = store.readLedger(root);
    assert.equal(res.ok, true);
    assert.equal(res.entries.length, 1);
    assert.ok(res.invalid_count >= 1);
    assert.equal(res.degraded, true);
  } finally { cleanup(root); }
});

test('2-worktree merge sim: distinct receipt_hash → distinct filenames → zero collision (F2)', () => {
  const root = tmpRepo();
  try {
    // Two worktrees ship the SAME decision_id but with different receipt_hash.
    // one-file-per-entry means distinct filenames — a git merge of the two
    // worktree trees unions the two files with NO single-array tail conflict.
    const w1 = store.writeEntry(root, makeEntry({ receipt_hash: 'sha256:' + '1'.repeat(64) }));
    const w2 = store.writeEntry(root, makeEntry({ receipt_hash: 'sha256:' + '2'.repeat(64) }));
    assert.notEqual(w1.path, w2.path, 'distinct files (no tail collision)');
    assert.ok(fs.existsSync(w1.path) && fs.existsSync(w2.path), 'both coexist in union');
    const files = fs.readdirSync(store.ledgerDir(root)).filter(f => f.endsWith('.json'));
    assert.equal(files.length, 2);
    // Reader dedups the union back to a single decision_id.
    assert.equal(store.readLedger(root).entries.length, 1);
  } finally { cleanup(root); }
});

// --- isLedgerAppendSafe (Task 2 / F1) — injectable runGit ---

function fakeGit(spec) {
  return (args) => {
    const key = args.join(' ');
    if (key === 'rev-parse HEAD') {
      if (spec.headThrows) throw new Error('unborn HEAD');
      return spec.head || 'a'.repeat(40);
    }
    if (key === 'rev-parse --abbrev-ref HEAD') return spec.branch || 'feature';
    if (key === 'status --porcelain') return spec.status || '';
    throw new Error('unexpected git ' + key);
  };
}

test('isLedgerAppendSafe: clean tree → safe + commit_sha', () => {
  const root = tmpRepo();
  try {
    const s = store.isLedgerAppendSafe(root, { runGit: fakeGit({ head: 'b'.repeat(40), status: '' }) });
    assert.equal(s.safe, true);
    assert.equal(s.commit_sha, 'b'.repeat(40));
  } finally { cleanup(root); }
});

test('isLedgerAppendSafe: dirty (allowlist-excluded only) → still safe', () => {
  const root = tmpRepo();
  try {
    const status = [
      ' M .claude/state/STATE.md',
      '?? .claude/cache/status.html',
      ' M .claude/state/completion-ledger/x.json',
      '?? .claude/receipts/mccp-pr-codex/cycle.json',
    ].join('\n');
    const s = store.isLedgerAppendSafe(root, { runGit: fakeGit({ status }) });
    assert.equal(s.safe, true, 'mccp self-bookkeeping artifacts do not count as dirty');
  } finally { cleanup(root); }
});

test('isLedgerAppendSafe: dirty source file (outside allowlist) → unsafe', () => {
  const root = tmpRepo();
  try {
    const status = [
      ' M .claude/cache/status.html',         // allowlisted
      ' M plugins/mccp/scripts/foo.js',       // NOT allowlisted → dirty
    ].join('\n');
    const s = store.isLedgerAppendSafe(root, { runGit: fakeGit({ status }) });
    assert.equal(s.safe, false);
    assert.equal(s.reason, 'dirty-working-tree');
  } finally { cleanup(root); }
});

test('isLedgerAppendSafe: renamed source file resolves to its new path for allowlist check', () => {
  const root = tmpRepo();
  try {
    const status = 'R  old/name.js -> plugins/mccp/scripts/new.js';
    const s = store.isLedgerAppendSafe(root, { runGit: fakeGit({ status }) });
    assert.equal(s.safe, false, 'rename target outside allowlist → dirty');
  } finally { cleanup(root); }
});

test('isLedgerAppendSafe: detached HEAD → unsafe', () => {
  const root = tmpRepo();
  try {
    const s = store.isLedgerAppendSafe(root, { runGit: fakeGit({ branch: 'HEAD' }) });
    assert.equal(s.safe, false);
    assert.equal(s.reason, 'detached-head');
  } finally { cleanup(root); }
});

test('isLedgerAppendSafe: unborn HEAD (rev-parse throws) → unsafe', () => {
  const root = tmpRepo();
  try {
    const s = store.isLedgerAppendSafe(root, { runGit: fakeGit({ headThrows: true }) });
    assert.equal(s.safe, false);
    assert.equal(s.reason, 'unborn-head');
  } finally { cleanup(root); }
});
