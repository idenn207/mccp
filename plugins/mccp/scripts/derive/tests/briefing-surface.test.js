'use strict';

// v1.3.0-m2 Task 6 validate — derive surface widening.
//
// Assert derive's receipt extract block surfaces meta.briefing_* read-only,
// preserves absence semantics (v0.2.x-era receipts emit undefined, not null),
// and propagates raw values without `!!` / `|| 0` collapse.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanReceipts } = require('../sources/receipts');
const { makeSkeleton } = require('../../receipt/schema');
const { writeReceipt } = require('../../receipt/store');

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-derive-briefing-'));
  fs.mkdirSync(path.join(root, '.claude', 'receipts'), { recursive: true });
  return root;
}

function seedReceipt(repoRoot, decisionId, metaOverrides) {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-plan-codex';
  r.phase = 'plan';
  r.decision_id = decisionId;
  r.task_id = 'T1';
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'a'.repeat(40);
  r.subject_hash = 'sha256:' + 'b'.repeat(64);
  r.receipt_hash = 'sha256:' + 'c'.repeat(64);
  r.meta.command = 'mccp:test';
  if (metaOverrides) Object.assign(r.meta, metaOverrides);
  writeReceipt(repoRoot, r);
  return r;
}

test('stamped receipt: briefing fields surface as raw values', function () {
  const root = makeRepo();
  seedReceipt(root, 'stamped', {
    briefing_summary: 'next: review M3',
    briefing_token_count: 180,
    briefing_invocation_count: 1,
  });

  const scan = scanReceipts(root);
  assert.equal(scan.ok, true);
  assert.equal(scan.count, 1);

  const item = scan.items[0];
  assert.equal(item.briefing_summary, 'next: review M3',
    'string passes through verbatim — no coercion');
  assert.equal(item.briefing_token_count, 180,
    'numeric value passes through — no `|| 0` collapse');
  assert.equal(item.briefing_invocation_count, 1);
});

test('v0.2.x-era receipt (briefing keys deleted) emits undefined (not null, not false)', function () {
  const root = makeRepo();
  const r = makeSkeleton({});
  r.gate_id = 'mccp-implement-codex';
  r.phase = 'implement';
  r.decision_id = 'v02x-shape';
  r.task_id = 'T1';
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'a'.repeat(40);
  r.subject_hash = 'sha256:' + 'b'.repeat(64);
  r.receipt_hash = 'sha256:' + 'c'.repeat(64);
  r.meta.command = 'mccp:test';
  // Mimic v0.2.x by deleting all 4 briefing keys before write.
  delete r.meta.briefing_summary;
  delete r.meta.briefing_token_count;
  delete r.meta.briefing_token_estimated;
  delete r.meta.briefing_invocation_count;
  writeReceipt(root, r);

  const scan = scanReceipts(root);
  const item = scan.items[0];
  assert.equal(item.briefing_summary, undefined,
    'absence preserved as undefined (not null) — M1 pick() contract');
  assert.equal(item.briefing_token_count, undefined);
  assert.equal(item.briefing_invocation_count, undefined);
});

test('null-valued briefing field emits null (not undefined) — distinguishes "stamped null" from "absent"', function () {
  const root = makeRepo();
  seedReceipt(root, 'stamped-null', {
    briefing_summary: null,
    briefing_token_count: null,
    briefing_invocation_count: 0,
  });

  const scan = scanReceipts(root);
  const item = scan.items[0];
  assert.equal(item.briefing_summary, null);
  assert.equal(item.briefing_token_count, null);
  assert.equal(item.briefing_invocation_count, 0);
});
