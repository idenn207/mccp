#!/usr/bin/env node
// Forward-migration: backfill v0.2.4 advisory + security_* meta fields on
// receipts written under v0.2.2/v0.2.3 schema. Re-computes receipt_hash
// only; subject_hash is untouched because SUBJECT_FIELDS canon excludes
// meta (see plugins/mccp/scripts/receipt/hash.js).
//
// Created as a sibling to v0.2.6-impeccable-fields.js per INC-001 R2
// (mccp-roadmap.plan.md) — a real migration runbook needs cumulative
// forward migrations, one per schema bump. Run in version order:
//   1. v0.2.4-security-fields.js
//   2. v0.2.6-impeccable-fields.js
//
// Defaults match the safe "nothing skipped, nothing overridden" baseline.
// Schema invariant `security_skipped + security_force_override cannot
// both be true` is satisfied trivially by the false/false default.
//
// Usage:
//   node plugins/mccp/scripts/migrations/v0.2.4-security-fields.js \
//        <receipt.json> [...] [--dry-run]

'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const { receiptHash } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'hash'));
const { validate } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'schema'));

const SECURITY_DEFAULTS = {
  advisory: false,
  security_skipped: false,
  security_skip_reason: null,
  security_force_override: false,
  security_force_override_reason: null,
};

function migrate(filePath, dryRun) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const receipt = JSON.parse(raw);
  if (!receipt.meta || typeof receipt.meta !== 'object') {
    throw new Error('receipt has no meta object');
  }
  const before = JSON.stringify(receipt.meta);
  const added = [];
  for (const k of Object.keys(SECURITY_DEFAULTS)) {
    if (!(k in receipt.meta)) {
      receipt.meta[k] = SECURITY_DEFAULTS[k];
      added.push(k);
    }
  }
  if (added.length === 0) {
    return { filePath, status: 'already-migrated', added };
  }
  receipt.receipt_hash = receiptHash(receipt);
  // Sanity check on THIS migration's fields. Errors from other axes (e.g.
  // missing v0.2.6 impeccable_* fields) are not our problem — they'd be
  // fixed by a later migration in the chain.
  const v = validate(receipt);
  if (!v.ok) {
    const onlyForeign = v.errors.every((e) => !/(advisory|security_)/.test(e));
    if (!onlyForeign) {
      throw new Error('schema invalid after v0.2.4 migration (advisory/security_* errors): ' + v.errors.join('; '));
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
      'Usage: node plugins/mccp/scripts/migrations/v0.2.4-security-fields.js <receipt.json> [...] [--dry-run]\n'
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

module.exports = { migrate, SECURITY_DEFAULTS };
