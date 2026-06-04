#!/usr/bin/env node
// Forward-migration: backfill v0.2.6 impeccable_* meta fields on receipts
// written under v0.2.4 (or earlier) schema. Re-computes receipt_hash only;
// subject_hash is untouched because SUBJECT_FIELDS canon excludes meta
// (see plugins/mccp/scripts/receipt/hash.js).
//
// Promoted from .claude/state/receipt-impeccable-migrate.js per INC-001 R4
// (mccp-roadmap.plan.md). Final location, idempotent verification.
//
// Behaviour:
//   - Missing impeccable_* fields  → backfill defaults, recompute hash, write
//   - All target fields already present → already-migrated (no-op)
//
// The script's contract is "this migration's target fields are present and
// well-typed", NOT "the receipt is fully valid against the latest schema".
// Full validation is the caller's job (via mccp-receipt validate or
// validate-cmd) — keeping migrations minimal lets multiple forward
// migrations compose in a chain without each one re-validating the world.
//
// Usage:
//   node plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js \
//        <receipt.json> [...] [--dry-run]
//
// Dry-run: append --dry-run to print diff instead of writing.

'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const { receiptHash } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'hash'));
const { validate } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'schema'));

const IMPECCABLE_DEFAULTS = {
  impeccable_skipped: false,
  impeccable_skip_reason: null,
  impeccable_force_override: false,
  impeccable_force_override_reason: null,
};

function migrate(filePath, dryRun) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const receipt = JSON.parse(raw);
  if (!receipt.meta || typeof receipt.meta !== 'object') {
    throw new Error('receipt has no meta object');
  }
  const before = JSON.stringify(receipt.meta);
  const added = [];
  for (const k of Object.keys(IMPECCABLE_DEFAULTS)) {
    if (!(k in receipt.meta)) {
      receipt.meta[k] = IMPECCABLE_DEFAULTS[k];
      added.push(k);
    }
  }
  if (added.length === 0) {
    return { filePath, status: 'already-migrated', added };
  }
  receipt.receipt_hash = receiptHash(receipt);
  // Sanity check on THIS migration's fields. Errors from other axes (e.g.
  // missing v0.2.4 security_* if this file pre-dates v0.2.4) are not our
  // problem — they'd be caught by an earlier migration in the chain.
  const v = validate(receipt);
  if (!v.ok) {
    const onlyForeign = v.errors.every((e) => !/impeccable_/.test(e));
    if (!onlyForeign) {
      throw new Error('schema invalid after v0.2.6 migration (impeccable_* errors): ' + v.errors.join('; '));
    }
  }
  if (dryRun) {
    return { filePath, status: 'dry-run', added, before, after: JSON.stringify(receipt.meta) };
  }
  const out = JSON.stringify(receipt, null, 2) + '\n';
  fs.writeFileSync(filePath, out);
  return { filePath, status: 'migrated', added, new_receipt_hash: receipt.receipt_hash };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const files = args.filter((a) => a !== '--dry-run');
  if (files.length === 0) {
    process.stderr.write(
      'Usage: node plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js <receipt.json> [...] [--dry-run]\n'
    );
    process.exit(2);
  }
  const results = files.map((f) => {
    try { return migrate(f, dryRun); }
    catch (e) { return { filePath: f, status: 'error', error: e.message }; }
  });
  console.log(JSON.stringify(results, null, 2));
  const failed = results.some((r) => r.status === 'error');
  process.exit(failed ? 1 : 0);
}

module.exports = { migrate, IMPECCABLE_DEFAULTS };
