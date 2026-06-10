'use strict';

// v0.3.6 Task 6 — codex-scope-fields migration tests.
//
// Coverage (mirrors v0.2.6-impeccable-fields plan body validation):
//   (a) fresh: legacy receipt missing 3 scope-audit fields → all backfilled
//   (b) already-migrated: receipt has all 3 fields → noop
//   (c) partial: receipt has 1 of 3 fields → only missing 2 added
//   (d) dry-run: no write, returns before/after
//   (e) missing meta: throws
//   (f) malformed JSON: surfaces via outer try/catch in CLI
//   (g) idempotent: re-running yields already-migrated
//   (h) receipt_hash recomputed
//   (i) writeMarker creates marker with correct counts + state
//   (j) writeMarker not written in dry-run
//   (k) dropped_findings_digest NOT backfilled (stays absent — legal per schema)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mig = require('../v0.3.6-codex-scope-fields');
const { migrate, writeMarker, SCOPE_DEFAULTS, MARKER_REL } = mig;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-mig-v036-'));
}

// Minimal legacy receipt — passes v0.3.5 schema but missing v0.3.6 fields.
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

function writeReceipt(dir, body) {
  const p = path.join(dir, 'receipt.json');
  fs.writeFileSync(p, JSON.stringify(body, null, 2) + '\n');
  return p;
}

// (a) fresh: legacy receipt → all 3 backfilled
test('v0.3.6 migration (a): legacy receipt → all 3 scope fields backfilled', function () {
  const d = tmpDir();
  const f = writeReceipt(d, legacyReceipt());
  const r = migrate(f, false);
  assert.strictEqual(r.status, 'migrated');
  assert.deepStrictEqual(r.added.sort(),
    ['a11y_routed_to_impeccable', 'codex_design_scope_excluded', 'design_findings_dropped']);
  const after = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(after.meta.codex_design_scope_excluded, false);
  assert.strictEqual(after.meta.design_findings_dropped, 0);
  assert.strictEqual(after.meta.a11y_routed_to_impeccable, false);
});

// (b) already-migrated: noop
test('v0.3.6 migration (b): already-migrated receipt → noop, no rewrite', function () {
  const d = tmpDir();
  const body = legacyReceipt();
  body.meta.codex_design_scope_excluded = false;
  body.meta.design_findings_dropped = 0;
  body.meta.a11y_routed_to_impeccable = false;
  const f = writeReceipt(d, body);
  const beforeMtime = fs.statSync(f).mtimeMs;
  const r = migrate(f, false);
  assert.strictEqual(r.status, 'already-migrated');
  assert.deepStrictEqual(r.added, []);
  // No write means file remains untouched. mtime usually steady on noop branch.
  const afterMtime = fs.statSync(f).mtimeMs;
  assert.strictEqual(beforeMtime, afterMtime, 'noop must not touch file mtime');
});

// (c) partial: only missing fields are added
test('v0.3.6 migration (c): partial — 1 of 3 fields present → only 2 added', function () {
  const d = tmpDir();
  const body = legacyReceipt();
  body.meta.codex_design_scope_excluded = true; // pretend prior partial migration
  const f = writeReceipt(d, body);
  const r = migrate(f, false);
  assert.strictEqual(r.status, 'migrated');
  assert.deepStrictEqual(r.added.sort(),
    ['a11y_routed_to_impeccable', 'design_findings_dropped']);
  const after = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(after.meta.codex_design_scope_excluded, true, 'pre-existing value preserved');
});

// (d) dry-run: no write
test('v0.3.6 migration (d): --dry-run → no file write, returns before/after', function () {
  const d = tmpDir();
  const f = writeReceipt(d, legacyReceipt());
  const rawBefore = fs.readFileSync(f, 'utf8');
  const r = migrate(f, true);
  assert.strictEqual(r.status, 'dry-run');
  assert.ok(typeof r.before === 'string');
  assert.ok(typeof r.after === 'string');
  assert.notStrictEqual(r.before, r.after, 'dry-run should show diff');
  const rawAfter = fs.readFileSync(f, 'utf8');
  assert.strictEqual(rawBefore, rawAfter, 'dry-run must not write to disk');
});

// (e) missing meta: throws
test('v0.3.6 migration (e): missing meta → throws', function () {
  const d = tmpDir();
  const body = legacyReceipt();
  delete body.meta;
  const f = writeReceipt(d, body);
  assert.throws(function () { migrate(f, false); }, /no meta object/);
});

// (g) idempotent: re-running = already-migrated
test('v0.3.6 migration (g): idempotent — second run yields already-migrated', function () {
  const d = tmpDir();
  const f = writeReceipt(d, legacyReceipt());
  const r1 = migrate(f, false);
  assert.strictEqual(r1.status, 'migrated');
  const r2 = migrate(f, false);
  assert.strictEqual(r2.status, 'already-migrated');
});

// (h) receipt_hash recomputed
test('v0.3.6 migration (h): receipt_hash is recomputed after backfill', function () {
  const d = tmpDir();
  const body = legacyReceipt();
  const oldHash = body.receipt_hash;
  const f = writeReceipt(d, body);
  const r = migrate(f, false);
  assert.ok(typeof r.new_receipt_hash === 'string');
  assert.ok(r.new_receipt_hash.startsWith('sha256:'));
  assert.notStrictEqual(r.new_receipt_hash, oldHash, 'receipt_hash should differ post-migration');
});

// (i) writeMarker creates marker with correct counts
test('v0.3.6 migration (i): writeMarker writes marker with correct counts + complete state', function () {
  const d = tmpDir();
  const results = [
    { filePath: '/a.json', status: 'migrated', added: ['x'] },
    { filePath: '/b.json', status: 'migrated', added: ['x'] },
    { filePath: '/c.json', status: 'already-migrated', added: [] },
  ];
  const markerPath = writeMarker(d, results, false);
  assert.strictEqual(markerPath, path.join(d, MARKER_REL));
  assert.ok(fs.existsSync(markerPath));
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  assert.strictEqual(marker.migration, 'v0.3.6-codex-scope-fields');
  assert.strictEqual(marker.state, 'complete');
  assert.strictEqual(marker.counts.migrated, 2);
  assert.strictEqual(marker.counts.already_migrated, 1);
  assert.strictEqual(marker.counts.errored, 0);
  assert.deepStrictEqual(marker.errors, []);
});

test('v0.3.6 migration (i2): writeMarker records errored state when some failed', function () {
  const d = tmpDir();
  const results = [
    { filePath: '/a.json', status: 'migrated', added: ['x'] },
    { filePath: '/bad.json', status: 'error', error: 'no meta object' },
  ];
  const markerPath = writeMarker(d, results, false);
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  assert.strictEqual(marker.state, 'partial');
  assert.strictEqual(marker.counts.errored, 1);
  assert.strictEqual(marker.errors.length, 1);
  assert.strictEqual(marker.errors[0].file, '/bad.json');
  assert.strictEqual(marker.errors[0].error, 'no meta object');
});

// (j) dry-run skips marker
test('v0.3.6 migration (j): writeMarker is no-op in dry-run mode', function () {
  const d = tmpDir();
  const r = writeMarker(d, [{ filePath: '/x', status: 'migrated', added: [] }], true);
  assert.strictEqual(r, null);
  const markerPath = path.join(d, MARKER_REL);
  assert.strictEqual(fs.existsSync(markerPath), false);
});

// (k) dropped_findings_digest NOT backfilled — null/absent both legal
test('v0.3.6 migration (k): dropped_findings_digest NOT backfilled (stays absent)', function () {
  const d = tmpDir();
  const f = writeReceipt(d, legacyReceipt());
  migrate(f, false);
  const after = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual('dropped_findings_digest' in after.meta, false,
    'digest field should be absent in legacy receipts post-migration');
});

// SCOPE_DEFAULTS exposed for downstream consumers (consistency)
test('v0.3.6 migration: SCOPE_DEFAULTS exports expected 3 keys with safe defaults', function () {
  assert.deepStrictEqual(Object.keys(SCOPE_DEFAULTS).sort(),
    ['a11y_routed_to_impeccable', 'codex_design_scope_excluded', 'design_findings_dropped']);
  assert.strictEqual(SCOPE_DEFAULTS.codex_design_scope_excluded, false);
  assert.strictEqual(SCOPE_DEFAULTS.design_findings_dropped, 0);
  assert.strictEqual(SCOPE_DEFAULTS.a11y_routed_to_impeccable, false);
});
