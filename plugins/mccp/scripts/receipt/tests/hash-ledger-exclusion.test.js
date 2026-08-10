'use strict';

// Dashboard Truthfulness M1 Task 5 — F3 carve-out validate.
//
// meta.ledger_write_skipped is a diagnostic flag the completion-ledger epilogue
// stamps onto the receipt AFTER the canonical hash is finalized (git-unsafe
// skip path). Like briefing_*, it must be excluded from receiptHash so the
// tamper-detect digest stays valid, and the schema must accept/reject it
// present-only.

const test = require('node:test');
const assert = require('node:assert/strict');

const { receiptHash } = require('../hash');
const { makeSkeleton, validate } = require('../schema');

// `makeSkeleton` stamps meta.created_at at millisecond resolution and that field
// IS part of the canonical hash. Tests below build two or three receipts and
// assert their hashes are equal, so any pair straddling a millisecond boundary
// fails for a reason that has nothing to do with the carve-out under test —
// measured at roughly 1 in 2000 pairs on an idle machine, and more often under
// parallel test load. Pinning created_at isolates the variable being tested.
const FIXED_CREATED_AT = '2026-08-09T00:00:00.000Z';

function baseReceipt() {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = 'ledger-carveout-test';
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'a'.repeat(40);
  r.subject_hash = 'sha256:' + 'b'.repeat(64);
  r.meta.command = '/mccp-pr-codex';
  r.meta.created_at = FIXED_CREATED_AT;
  return r;
}

test('Stamping meta.ledger_write_skipped leaves receiptHash unchanged (F3 carve-out)', () => {
  const r = baseReceipt();
  const before = receiptHash(r);
  r.meta.ledger_write_skipped = true;
  assert.equal(receiptHash(r), before,
    'ledger_write_skipped must be carved out of the canonical hash');
});

test('true vs false vs absent ledger_write_skipped all hash identically', () => {
  const a = baseReceipt(); a.meta.ledger_write_skipped = true;
  const b = baseReceipt(); b.meta.ledger_write_skipped = false;
  const c = baseReceipt(); delete c.meta.ledger_write_skipped;
  assert.equal(receiptHash(a), receiptHash(b));
  assert.equal(receiptHash(b), receiptHash(c));
});

test('receiptHash does not mutate the caller-owned receipt (deep-clone path)', () => {
  const r = baseReceipt();
  r.meta.ledger_write_skipped = true;
  receiptHash(r);
  assert.equal(r.meta.ledger_write_skipped, true,
    'caller-owned meta.ledger_write_skipped must survive hash()');
});

test('schema accepts boolean ledger_write_skipped, rejects non-boolean', () => {
  const ok = baseReceipt();
  ok.meta.ledger_write_skipped = true;
  ok.receipt_hash = receiptHash(ok);
  assert.equal(validate(ok).ok, true, validate(ok).errors.join('; '));

  const bad = baseReceipt();
  bad.meta.ledger_write_skipped = 'yes';
  bad.receipt_hash = receiptHash(bad);
  const v = validate(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.indexOf('ledger_write_skipped') !== -1));
});

test('schema accepts a receipt that omits ledger_write_skipped (present-only / backward-compat)', () => {
  const r = baseReceipt();
  delete r.meta.ledger_write_skipped;
  r.receipt_hash = receiptHash(r);
  assert.equal(validate(r).ok, true);
});
