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
  // M1 — new appends are codex_verdict-first; a real ship always carries one.
  r.resolution.codex_verdict = 'converged';
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

test('M1 verdict-gating: pr-codex with no codex_verdict (converged is retired) → no-op', () => {
  const root = tmpRepo();
  try {
    const r = makeSkeleton({});
    r.gate_id = 'mccp-pr-codex';
    r.decision_id = 'cycle-m1';
    r.resolution.converged = false; // resolution.converged is NO LONGER the gate
    r.receipt_hash = receiptHash(r);
    const p = writeReceipt(root, r);
    let writeCalled = 0;
    ledger.triggerLedgerAppend(root, r, p, {
      isLedgerAppendSafe: () => ({ safe: true, commit_sha: 'a'.repeat(40) }),
      writeEntry: () => { writeCalled++; return { ok: true }; },
    });
    assert.equal(writeCalled, 0); // absent codex_verdict fail-closes the append
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
    assert.equal(e.verdict_provenance, 'codex-verdict'); // M1 — corroborated append
    // F3 — entry existence is authoritative; receipt is NOT mutated on success.
    const onDisk = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal('ledger_write_skipped' in onDisk.meta, false,
      'success path must not stamp the diagnostic flag');
    assert.equal(onDisk.receipt_hash, receipt.receipt_hash, 'receipt_hash unchanged on success');
  } finally { cleanup(root); }
});

test('M1: meta.advisory/skipped WITHOUT codex_verdict → SKIP (legacy meta fallback retired)', () => {
  const root = tmpRepo();
  try {
    for (const flag of ['advisory', 'skipped']) {
      const r = makeSkeleton({});
      r.gate_id = 'mccp-pr-codex';
      r.decision_id = 'meta-' + flag;
      r.resolution.converged = true;
      r.meta[flag] = true; // legacy meta flag, but NO resolution.codex_verdict
      r.receipt_hash = receiptHash(r);
      const p = writeReceipt(root, r);
      let writeCalled = 0;
      ledger.triggerLedgerAppend(root, r, p, {
        isLedgerAppendSafe: () => ({ safe: true, commit_sha: 'd'.repeat(40) }),
        resolveVersion: () => null,
        readPlanSnapshot: () => ({ risks: [], openQuestions: [] }),
        writeEntry: () => { writeCalled++; return { ok: true }; },
      });
      assert.equal(writeCalled, 0, 'absent codex_verdict fail-closes even with a legacy meta flag');
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

// ── PR-Codex R2 F1: verdict is codex_verdict-first; divergent/critical excluded ──

function driveWithCapture(root, receipt, p) {
  let captured = null;
  let writeCalled = 0;
  ledger.triggerLedgerAppend(root, receipt, p, {
    isLedgerAppendSafe: () => ({ safe: true, commit_sha: 'a'.repeat(40) }),
    resolveVersion: () => null,
    readPlanSnapshot: () => ({ risks: [], openQuestions: [] }),
    writeEntry: (_r, entry) => { writeCalled++; captured = entry; return { ok: true }; },
  });
  return { captured, writeCalled };
}

test('R2 F1: divergent codex_verdict → NO ledger entry (resolution.converged is unreliable)', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, {});
    receipt.resolution.codex_verdict = 'divergent'; // converged stays true — the unreliable field
    const { writeCalled } = driveWithCapture(root, receipt, p);
    assert.equal(writeCalled, 0, 'a divergent ship must never be recorded as a completion');
  } finally { cleanup(root); }
});

test('R2 F1: critical codex_verdict → NO ledger entry', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, {});
    receipt.resolution.codex_verdict = 'critical';
    const { writeCalled } = driveWithCapture(root, receipt, p);
    assert.equal(writeCalled, 0);
  } finally { cleanup(root); }
});

test('R2 F1: skipped codex_verdict → ledger verdict "skipped"', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, {});
    receipt.resolution.codex_verdict = 'skipped';
    const { captured, writeCalled } = driveWithCapture(root, receipt, p);
    assert.equal(writeCalled, 1); // dedupe/disabled happy-path IS a completion
    assert.equal(captured.verdict, 'skipped');
    assert.equal(captured.verdict_provenance, 'codex-verdict');
  } finally { cleanup(root); }
});

test('R2 F1: unavailable codex_verdict → ledger verdict "advisory" (matches verdictsAgree)', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, {});
    receipt.resolution.codex_verdict = 'unavailable';
    const { captured } = driveWithCapture(root, receipt, p);
    assert.equal(captured.verdict, 'advisory');
  } finally { cleanup(root); }
});

test('R2 F1: converged codex_verdict → ledger verdict "converged"', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, {});
    receipt.resolution.codex_verdict = 'converged';
    const { captured } = driveWithCapture(root, receipt, p);
    assert.equal(captured.verdict, 'converged');
  } finally { cleanup(root); }
});

test('M1: legacy receipt (no codex_verdict) → NO fresh append (fail-closed; migration preserves existing)', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, {});
    delete receipt.resolution.codex_verdict; // legacy — only resolution.converged===true
    const { writeCalled } = driveWithCapture(root, receipt, p);
    // Absent codex_verdict is a schema-version signal, NOT a completion signal.
    // A FRESH append must fail-closed; existing legacy entries are preserved by
    // the migration (marked verdict_provenance='legacy-unknown'), never dropped.
    assert.equal(writeCalled, 0);
  } finally { cleanup(root); }
});

test('M1: converged codex_verdict WITH actionable findings → NO append (not a clean completion)', () => {
  const root = tmpRepo();
  try {
    const { receipt, path: p } = makeReceipt(root, {});
    receipt.resolution.codex_verdict = 'converged';
    receipt.meta.codex_review_actionable_findings = true;
    const { writeCalled } = driveWithCapture(root, receipt, p);
    assert.equal(writeCalled, 0);
  } finally { cleanup(root); }
});
