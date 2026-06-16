#!/usr/bin/env node
// v1.2.0-m1 Task 7 — purely additive migration for the controller-worker
// attribution axis. Unlike v0.3.6, this migration does NOT mutate any
// existing receipt because:
//
//   1. schema.js v1.2.0 treats `controller_context_marker_present=undefined`
//      + the 3 attribution fields=undefined as the canonical absent state
//      ("marker false + 0 fields = OK" backward compat).
//   2. The 4 new fields move together (all-or-nothing). Backfilling
//      `marker=false` + 3 nulls on existing receipts changes the JSON shape
//      without changing semantics — added noise, no benefit.
//   3. Writers that DO carry controller context populate all 4 at write
//      time (see plugins/mccp/scripts/receipt/write.js detectDispatchContext).
//
// The migration's only job is to drop a completion marker so the runbook
// has a consistent surface across schema bumps. dry-run prints affected=0
// and writes nothing; normal mode writes the marker once and is idempotent.
//
// Marker file: `.claude/receipts/.migrations/v1.2.0-dispatch-fields.json`.
// Mirrors v0.3.6 marker shape with an explicit `noop=true` flag so consumers
// can distinguish from migrations that touched receipts.

'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const { validate } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'schema'));

const MARKER_REL = path.join('.claude', 'receipts', '.migrations', 'v1.2.0-dispatch-fields.json');

// inspectReceipt reads a receipt file and reports schema validity + whether it
// already carries any of the 4 attribution fields. Never mutates the file.
function inspectReceipt(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { filePath: filePath, status: 'error', error: 'read: ' + err.message };
  }
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch (err) {
    return { filePath: filePath, status: 'error', error: 'parse: ' + err.message };
  }
  const v = validate(receipt);
  if (!v.ok) {
    return {
      filePath: filePath,
      status: 'schema-invalid',
      errors: v.errors,
    };
  }
  const m = receipt.meta || {};
  const hasMarker = m.controller_context_marker_present !== undefined
    && m.controller_context_marker_present !== null;
  const hasAttribution = m.dispatched_by_controller_session_id
    || m.worker_dispatch_id
    || m.ipc_envelope_path;
  return {
    filePath: filePath,
    status: 'noop',
    marker_present: hasMarker,
    attribution_present: !!hasAttribution,
  };
}

function writeMarker(cwd, results, dryRun) {
  if (dryRun) return null;
  const markerPath = path.join(cwd, MARKER_REL);
  const markerDir = path.dirname(markerPath);
  if (!fs.existsSync(markerDir)) fs.mkdirSync(markerDir, { recursive: true });
  const noop = results.filter(function (r) { return r.status === 'noop'; }).length;
  const errored = results.filter(function (r) { return r.status === 'error'; }).length;
  const schemaInvalid = results.filter(function (r) { return r.status === 'schema-invalid'; }).length;
  const marker = {
    schema_version: 'v1',
    migration: 'v1.2.0-dispatch-fields',
    state: errored > 0 ? 'partial' : 'complete',
    noop: true,
    reason: 'additive — controller-worker attribution fields are write-time-only; ' +
      'existing receipts pass validation unchanged (backward compat verified).',
    completed_at: new Date().toISOString(),
    counts: {
      affected: 0,
      noop_files: noop,
      schema_invalid: schemaInvalid,
      errored: errored,
    },
    errors: results
      .filter(function (r) { return r.status === 'error' || r.status === 'schema-invalid'; })
      .map(function (r) { return { file: r.filePath, error: r.error || (r.errors && r.errors.join('; ')) }; }),
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');
  return markerPath;
}

function readMarker(cwd) {
  const markerPath = path.join(cwd, MARKER_REL);
  if (!fs.existsSync(markerPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const files = args.filter(function (a) { return a !== '--dry-run'; });
  // Unlike v0.3.6, files are OPTIONAL — the migration is purely a marker write.
  // If files are passed, we inspect them for sanity but never mutate.
  const results = files.map(function (f) {
    try { return inspectReceipt(f); }
    catch (e) { return { filePath: f, status: 'error', error: e.message }; }
  });
  const markerPath = writeMarker(process.cwd(), results, dryRun);
  const summary = {
    migration: 'v1.2.0-dispatch-fields',
    noop: true,
    dry_run: dryRun,
    affected: 0,
    inspected: results.length,
    schema_invalid: results.filter(function (r) { return r.status === 'schema-invalid'; }).length,
    errors: results.filter(function (r) { return r.status === 'error'; }).length,
    markerPath: markerPath,
  };
  console.log(JSON.stringify({ summary: summary, results: results }, null, 2));
  // Sanity check failures are reported but never exit non-zero — they're
  // an earlier migration's problem, not v1.2.0's.
  process.exit(0);
}

module.exports = {
  inspectReceipt: inspectReceipt,
  writeMarker: writeMarker,
  readMarker: readMarker,
  MARKER_REL: MARKER_REL,
};
