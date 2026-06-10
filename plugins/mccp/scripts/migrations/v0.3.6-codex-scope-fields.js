#!/usr/bin/env node
// Forward-migration: backfill v0.3.6 Codex/impeccable scope audit meta fields
// on receipts written under v0.3.5 or earlier schema. Recomputes receipt_hash
// only; subject_hash is untouched because SUBJECT_FIELDS canon excludes meta
// (see plugins/mccp/scripts/receipt/hash.js).
//
// Behaviour:
//   - Missing scope-audit fields → backfill defaults, recompute hash, write
//   - All target fields already present → already-migrated (no-op)
//   - dropped_findings_digest is NOT backfilled — legacy receipts had nothing
//     to digest; null/undefined are both legal per schema.js v0.3.6 validator.
//
// Marker file: `.claude/receipts/.migrations/v0.3.6-codex-scope.json` records
// completion state per v0.2.8 quarantine marker pattern. Mirrors:
//   plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js (per-file migrate)
//   plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js (marker)
//
// Usage:
//   node plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js \
//        <receipt.json> [...] [--dry-run]
//
// Dry-run: append --dry-run to print diff instead of writing. Marker is NOT
// written in dry-run mode so re-running without --dry-run still triggers
// completion record.

'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const { receiptHash } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'hash'));
const { validate } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'schema'));

const SCOPE_DEFAULTS = Object.freeze({
  codex_design_scope_excluded: false,
  design_findings_dropped: 0,
  a11y_routed_to_impeccable: false,
});

const MARKER_REL = path.join('.claude', 'receipts', '.migrations', 'v0.3.6-codex-scope.json');

const SCOPE_FIELD_RE = /codex_design_scope_excluded|design_findings_dropped|a11y_routed_to_impeccable|dropped_findings_digest/;

function migrate(filePath, dryRun) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const receipt = JSON.parse(raw);
  if (!receipt.meta || typeof receipt.meta !== 'object') {
    throw new Error('receipt has no meta object');
  }
  const before = JSON.stringify(receipt.meta);
  const added = [];
  for (const k of Object.keys(SCOPE_DEFAULTS)) {
    if (!(k in receipt.meta)) {
      receipt.meta[k] = SCOPE_DEFAULTS[k];
      added.push(k);
    }
  }
  if (added.length === 0) {
    return { filePath: filePath, status: 'already-migrated', added: added };
  }
  receipt.receipt_hash = receiptHash(receipt);
  // Sanity check ONLY this migration's fields — foreign errors (e.g. missing
  // v0.2.4 security_* if file pre-dates that axis) are an earlier migration's
  // problem. Same pattern as v0.2.6-impeccable-fields.js.
  const v = validate(receipt);
  if (!v.ok) {
    const onlyForeign = v.errors.every((e) => !SCOPE_FIELD_RE.test(e));
    if (!onlyForeign) {
      throw new Error('schema invalid after v0.3.6 migration: ' + v.errors.join('; '));
    }
  }
  if (dryRun) {
    return {
      filePath: filePath, status: 'dry-run', added: added,
      before: before, after: JSON.stringify(receipt.meta),
    };
  }
  const out = JSON.stringify(receipt, null, 2) + '\n';
  fs.writeFileSync(filePath, out);
  return {
    filePath: filePath, status: 'migrated', added: added,
    new_receipt_hash: receipt.receipt_hash,
  };
}

function writeMarker(cwd, results, dryRun) {
  if (dryRun) return null;
  const markerPath = path.join(cwd, MARKER_REL);
  const markerDir = path.dirname(markerPath);
  if (!fs.existsSync(markerDir)) fs.mkdirSync(markerDir, { recursive: true });
  const migrated = results.filter(function (r) { return r.status === 'migrated'; }).length;
  const alreadyMigrated = results.filter(function (r) { return r.status === 'already-migrated'; }).length;
  const errored = results.filter(function (r) { return r.status === 'error'; }).length;
  const marker = {
    schema_version: 'v1',
    migration: 'v0.3.6-codex-scope-fields',
    state: errored > 0 ? 'partial' : 'complete',
    completed_at: new Date().toISOString(),
    counts: { migrated: migrated, already_migrated: alreadyMigrated, errored: errored },
    errors: results.filter(function (r) { return r.status === 'error'; })
      .map(function (r) { return { file: r.filePath, error: r.error }; }),
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');
  return markerPath;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const files = args.filter(function (a) { return a !== '--dry-run'; });
  if (files.length === 0) {
    process.stderr.write(
      'Usage: node plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js ' +
      '<receipt.json> [...] [--dry-run]\n'
    );
    process.exit(2);
  }
  const results = files.map(function (f) {
    try { return migrate(f, dryRun); }
    catch (e) { return { filePath: f, status: 'error', error: e.message }; }
  });
  const markerPath = writeMarker(process.cwd(), results, dryRun);
  console.log(JSON.stringify({ results: results, markerPath: markerPath }, null, 2));
  const failed = results.some(function (r) { return r.status === 'error'; });
  process.exit(failed ? 1 : 0);
}

module.exports = {
  migrate: migrate,
  writeMarker: writeMarker,
  SCOPE_DEFAULTS: SCOPE_DEFAULTS,
  MARKER_REL: MARKER_REL,
};
