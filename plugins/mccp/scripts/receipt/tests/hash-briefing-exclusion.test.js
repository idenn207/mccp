'use strict';

// v1.3.0-m2 Task 1b validate — Codex R1 F1 absorption.
//
// Asserts that briefing_* fields are EXCLUDED from receiptHash canonicalization
// so that:
//   1. Stamping briefing fields onto a receipt leaves receipt_hash unchanged.
//   2. Different briefing values on otherwise-identical receipts hash identically.
//   3. v0.2.x-era receipts (no briefing keys) hash the same as v1.3.0-m2 code path.

const test = require('node:test');
const assert = require('node:assert/strict');

const { receiptHash } = require('../hash');
const { makeSkeleton } = require('../schema');

function baseReceipt() {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-plan-codex';
  r.phase = 'plan';
  r.decision_id = 'hash-exclusion-test';
  r.task_id = 'T1';
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'a'.repeat(40);
  r.subject_hash = 'sha256:' + 'b'.repeat(64);
  return r;
}

test('Stamping briefing_* into a receipt leaves receiptHash unchanged', function () {
  const r1 = baseReceipt();
  const h1 = receiptHash(r1);

  // Stamp the 4 briefing fields with arbitrary present values.
  r1.meta.briefing_summary = 'next: ship M2 schema bump';
  r1.meta.briefing_token_count = 240;
  r1.meta.briefing_token_estimated = true;
  r1.meta.briefing_invocation_count = 1;

  const h2 = receiptHash(r1);
  assert.equal(h1, h2,
    'receiptHash should be invariant under briefing stamp (Codex R1 F1 absorption)');
});

test('Different briefing values on otherwise-identical receipts hash identically', function () {
  const a = baseReceipt();
  const b = baseReceipt();

  a.meta.briefing_summary = 'M2 ready';
  a.meta.briefing_token_count = 100;
  a.meta.briefing_token_estimated = true;
  a.meta.briefing_invocation_count = 1;

  b.meta.briefing_summary = 'M2 blocked on tempfail';
  b.meta.briefing_token_count = 555;
  b.meta.briefing_token_estimated = false;
  b.meta.briefing_invocation_count = 1;

  assert.equal(receiptHash(a), receiptHash(b),
    'briefing field divergence must not affect hash');
});

test('v0.2.x-era receipt without briefing keys hashes the same as one with null briefing keys', function () {
  // The skeleton populates briefing_* defaults (null/null/false/null). This
  // simulates v0.2.x by deleting them entirely. Both shapes must hash equal.
  const withDefaults = baseReceipt();
  const withoutKeys = baseReceipt();
  delete withoutKeys.meta.briefing_summary;
  delete withoutKeys.meta.briefing_token_count;
  delete withoutKeys.meta.briefing_token_estimated;
  delete withoutKeys.meta.briefing_invocation_count;

  assert.equal(receiptHash(withDefaults), receiptHash(withoutKeys),
    'backward-compat: present-with-null and absent must hash identically');
});

test('Non-briefing meta mutation DOES change hash (control — strip is targeted)', function () {
  // Sanity: prove the strip is targeted to briefing_* and does not silently
  // ignore other meta mutations. Changing meta.command must surface.
  const a = baseReceipt();
  const b = baseReceipt();
  a.meta.command = 'mccp:prp-implement';
  b.meta.command = 'mccp:plan';
  assert.notEqual(receiptHash(a), receiptHash(b),
    'control: non-briefing meta changes must still affect hash');
});

test('receiptHash does not mutate the caller-owned receipt object', function () {
  const r = baseReceipt();
  r.meta.briefing_summary = 'pre-existing';
  r.meta.briefing_token_count = 42;
  receiptHash(r);
  assert.equal(r.meta.briefing_summary, 'pre-existing',
    'caller-owned receipt.meta.briefing_summary must not be deleted by hash() shallow-vs-deep clone path');
  assert.equal(r.meta.briefing_token_count, 42,
    'caller-owned receipt.meta.briefing_token_count must remain');
});
