'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ledger = require('../index');
const store = require('../store');
const { makeSkeleton } = require('../../../receipt/schema');
const { writeReceipt } = require('../../../receipt/store');
const { receiptHash } = require('../../../receipt/hash');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ledger-facade-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function makeReceipt(root, over) {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = 'cycle-m1';
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'a'.repeat(40);
  r.resolution.converged = true;
  r.subject_hash = 'sha256:' + 'b'.repeat(64);
  r.meta.command = '/mccp-pr-codex';
  Object.assign(r, over || {});
  r.receipt_hash = receiptHash(r);
  const p = writeReceipt(root, r);
  return { receipt: r, path: p };
}

test('gate-gating: non-pr-codex gate → no-op (no safety probe, no write, no restamp)', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, { gate_id: 'mccp-plan-codex', phase: 'plan' });
    let safeCalled = 0; let writeCalled = 0;
    ledger.triggerLedgerAppend(root, receipt, p, {
      isLedgerAppendSafe: () => { safeCalled++; return { safe: true, commit_sha: 'a'.repeat(40) }; },
      writeEntry: () => { writeCalled++; return { ok: true }; },
    });
    assert.equal(safeCalled, 0);
    assert.equal(writeCalled, 0);
    assert.equal(store.readLedger(root).entries.length, 0);
  } finally { cleanup(root); }
});

test('converged-gating: pr-codex but converged !== true → no-op', () => {
  const root = tmpRepo();
  try {
    const r = makeSkeleton({});
    r.gate_id = 'mccp-pr-codex';
    r.decision_id = 'cycle-m1';
    r.resolution.converged = false;
    r.receipt_hash = receiptHash(r);
    const p = writeReceipt(root, r);
    let writeCalled = 0;
    ledger.triggerLedgerAppend(root, r, p, {
      isLedgerAppendSafe: () => ({ safe: true, commit_sha: 'a'.repeat(40) }),
      writeEntry: () => { writeCalled++; return { ok: true }; },
    });
    assert.equal(writeCalled, 0);
  } finally { cleanup(root); }
});

test('git-safe happy path: assembles entry + writes ledger; receipt NOT restamped (F3)', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root);
    ledger.triggerLedgerAppend(root, receipt, p, {
      planPath: '.claude/plans/foo-m1.plan.md',
      isLedgerAppendSafe: () => ({ safe: true, commit_sha: 'c'.repeat(40) }),
      resolveVersion: () => '1.18.3',
      readPlanSnapshot: () => ({ risks: ['r1', 'r2'], openQuestions: ['q1'] }),
    });
    const led = store.readLedger(root);
    assert.equal(led.entries.length, 1);
    const e = led.entries[0];
    assert.equal(e.decision_id, 'cycle-m1');
    assert.equal(e.gate, 'mccp-pr-codex');
    assert.equal(e.verdict, 'converged');
    assert.equal(e.version, '1.18.3');
    assert.equal(e.commit_sha, 'c'.repeat(40));
    assert.equal(e.plan_basename, 'foo-m1.plan.md');
    assert.equal(e.plan_file_hash, receipt.plan_hash);
    assert.deepEqual(e.risks_closed, ['r1', 'r2']);
    assert.deepEqual(e.oq_closed, ['q1']);
    assert.equal(e.receipt_hash, receipt.receipt_hash);
    // F3 — entry existence is authoritative; receipt is NOT mutated on success.
    const onDisk = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal('ledger_write_skipped' in onDisk.meta, false,
      'success path must not stamp the diagnostic flag');
    assert.equal(onDisk.receipt_hash, receipt.receipt_hash, 'receipt_hash unchanged on success');
  } finally { cleanup(root); }
});

test('verdict resolution: advisory + skipped reflected in entry', () => {
  const root = tmpRepo();
  try {
    for (const [over, expected] of [
      [{ meta_advisory: true }, 'advisory'],
      [{ meta_skipped: true }, 'skipped'],
    ]) {
      const r = makeSkeleton({});
      r.gate_id = 'mccp-pr-codex';
      r.decision_id = 'verdict-' + expected;
      r.resolution.converged = true;
      if (over.meta_advisory) r.meta.advisory = true;
      if (over.meta_skipped) r.meta.skipped = true;
      r.receipt_hash = receiptHash(r);
      const p = writeReceipt(root, r);
      let captured = null;
      ledger.triggerLedgerAppend(root, r, p, {
        isLedgerAppendSafe: () => ({ safe: true, commit_sha: 'd'.repeat(40) }),
        resolveVersion: () => null,
        readPlanSnapshot: () => ({ risks: [], openQuestions: [] }),
        writeEntry: (_root, entry) => { captured = entry; return { ok: true }; },
      });
      assert.equal(captured.verdict, expected);
    }
  } finally { cleanup(root); }
});

test('git-unsafe (dirty): write skipped + diagnostic stamp; receipt_hash invariant (carve-out)', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root);
    const before = receipt.receipt_hash;
    ledger.triggerLedgerAppend(root, receipt, p, {
      planPath: '.claude/plans/foo-m1.plan.md',
      isLedgerAppendSafe: () => ({ safe: false, reason: 'dirty-working-tree' }),
    });
    assert.equal(store.readLedger(root).entries.length, 0, 'no write on git-unsafe');
    const onDisk = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(onDisk.meta.ledger_write_skipped, true, 'diagnostic flag stamped');
    assert.equal(onDisk.receipt_hash, before, 'stored receipt_hash NOT recomputed');
    assert.equal(receiptHash(onDisk), before,
      'carve-out: ledger_write_skipped excluded from canonical hash → invariant');
  } finally { cleanup(root); }
});

test('fail-open: store.writeEntry throwing does NOT propagate out of the facade', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root);
    assert.doesNotThrow(() => {
      ledger.triggerLedgerAppend(root, receipt, p, {
        isLedgerAppendSafe: () => ({ safe: true, commit_sha: 'e'.repeat(40) }),
        resolveVersion: () => null,
        readPlanSnapshot: () => ({ risks: [], openQuestions: [] }),
        writeEntry: () => { throw new Error('boom'); },
      });
    });
  } finally { cleanup(root); }
});
