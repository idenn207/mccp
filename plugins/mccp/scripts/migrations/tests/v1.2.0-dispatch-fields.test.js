'use strict';

// v1.2.0-m1 Task 7 — additive (no-op) migration tests.
//
// Coverage:
//   (a) noop: pre-v1.2.0 receipt without any attribution fields → inspect=noop, no mutation
//   (b) dry-run: marker not written
//   (c) idempotent: re-running yields same result, marker overwritten in place
//   (d) marker shape: noop=true, counts.affected=0, state=complete
//   (e) controller-context receipt: marker_present=true is detected but not mutated
//   (f) malformed JSON: status=error, marker reflects errored count

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mig = require('../v1.2.0-dispatch-fields');
const { inspectReceipt, writeMarker, readMarker, MARKER_REL } = mig;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-mig-v120-'));
}

function tmpRepo() {
  // writeMarker needs `.claude/receipts/.migrations/` to be writable.
  const d = tmpDir();
  fs.mkdirSync(path.join(d, '.claude', 'receipts', '.migrations'), { recursive: true });
  return d;
}

function legacyReceipt() {
  return {
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    phase: 'plan',
    decision_id: 'sample-slug',
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64),
    receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-08T00:00:00Z',
      command: '/mccp:plan',
      cwd: '/x',
      git_branch: 'main',
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
      advisory: false,
      security_skipped: false,
      security_skip_reason: null,
      security_force_override: false,
      security_force_override_reason: null,
      impeccable_skipped: false,
      impeccable_skip_reason: null,
      impeccable_force_override: false,
      impeccable_force_override_reason: null,
    },
  };
}

function writeReceiptFile(dir, body, name) {
  const p = path.join(dir, name || 'receipt.json');
  fs.writeFileSync(p, JSON.stringify(body, null, 2) + '\n');
  return p;
}

// (a) noop: pre-v1.2.0 receipt → no mutation
test('v1.2.0 migration (a): pre-v1.2.0 receipt is noop, file untouched', function () {
  const d = tmpRepo();
  const body = legacyReceipt();
  const f = writeReceiptFile(d, body);
  const beforeBytes = fs.readFileSync(f);
  const r = inspectReceipt(f);
  assert.strictEqual(r.status, 'noop');
  assert.strictEqual(r.marker_present, false);
  assert.strictEqual(r.attribution_present, false);
  const afterBytes = fs.readFileSync(f);
  assert.ok(beforeBytes.equals(afterBytes), 'receipt file must not be modified');
});

// (b) dry-run: marker not written
test('v1.2.0 migration (b): dry-run does NOT write marker', function () {
  const d = tmpRepo();
  const markerPath = writeMarker(d, [], /*dryRun=*/true);
  assert.strictEqual(markerPath, null);
  const markerAbs = path.join(d, MARKER_REL);
  assert.strictEqual(fs.existsSync(markerAbs), false);
});

// (c) idempotent: re-running yields same result, marker overwritten in place
test('v1.2.0 migration (c): idempotent — second run rewrites marker, affected stays 0', function () {
  const d = tmpRepo();
  const f = writeReceiptFile(d, legacyReceipt());
  const r1 = [inspectReceipt(f)];
  writeMarker(d, r1, false);
  const m1 = readMarker(d);
  assert.strictEqual(m1.state, 'complete');
  assert.strictEqual(m1.counts.affected, 0);
  // Second run — marker overwritten with fresh timestamp but same shape.
  const r2 = [inspectReceipt(f)];
  writeMarker(d, r2, false);
  const m2 = readMarker(d);
  assert.strictEqual(m2.counts.affected, 0);
  assert.strictEqual(m2.noop, true);
});

// (d) marker shape verification
test('v1.2.0 migration (d): marker shape — noop=true, state=complete, affected=0', function () {
  const d = tmpRepo();
  const f = writeReceiptFile(d, legacyReceipt());
  writeMarker(d, [inspectReceipt(f)], false);
  const m = readMarker(d);
  assert.strictEqual(m.schema_version, 'v1');
  assert.strictEqual(m.migration, 'v1.2.0-dispatch-fields');
  assert.strictEqual(m.state, 'complete');
  assert.strictEqual(m.noop, true);
  assert.match(m.reason, /additive/);
  assert.strictEqual(m.counts.affected, 0);
  assert.strictEqual(m.counts.noop_files, 1);
  assert.strictEqual(m.counts.errored, 0);
});

// (e) controller-context receipt: marker_present=true is detected
test('v1.2.0 migration (e): controller-context receipt detected, not mutated', function () {
  const d = tmpRepo();
  const body = legacyReceipt();
  // Stamp controller-context marker + 3 attribution fields. Receipt remains
  // schema-valid because all-or-nothing invariant is satisfied.
  body.meta.controller_context_marker_present = true;
  body.meta.dispatched_by_controller_session_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  body.meta.worker_dispatch_id = '11111111-2222-3333-4444-555555555555';
  body.meta.ipc_envelope_path = '.claude/state/dispatches/11111111-2222-3333-4444-555555555555.envelope.json';
  const f = writeReceiptFile(d, body);
  const beforeBytes = fs.readFileSync(f);
  const r = inspectReceipt(f);
  assert.strictEqual(r.status, 'noop');
  assert.strictEqual(r.marker_present, true);
  assert.strictEqual(r.attribution_present, true);
  const afterBytes = fs.readFileSync(f);
  assert.ok(beforeBytes.equals(afterBytes), 'controller-context receipt must not be mutated either');
});

// (f) malformed JSON
test('v1.2.0 migration (f): malformed JSON surfaces status=error', function () {
  const d = tmpRepo();
  const f = path.join(d, 'malformed.json');
  fs.writeFileSync(f, '{not valid json');
  const r = inspectReceipt(f);
  assert.strictEqual(r.status, 'error');
  assert.match(r.error, /parse/);
});
