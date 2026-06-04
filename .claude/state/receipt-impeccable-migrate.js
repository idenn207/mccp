#!/usr/bin/env node
// One-shot forward-migration: backfill v0.2.6 impeccable_* meta fields on
// receipts written under v0.2.4 schema. Re-computes receipt_hash only;
// subject_hash is untouched because the subject canon excludes meta.
//
// Usage: node .claude/state/receipt-impeccable-migrate.js <receipt.json> [...]
// Dry-run: append --dry-run to print diff instead of writing.

'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', 'plugins', 'mccp');
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
  const before = JSON.stringify(receipt.meta);
  let added = [];
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
  const v = validate(receipt);
  if (!v.ok) {
    throw new Error('schema still invalid after migration: ' + v.errors.join('; '));
  }
  if (dryRun) {
    return { filePath, status: 'dry-run', added, before, after: JSON.stringify(receipt.meta) };
  }
  const out = JSON.stringify(receipt, null, 2) + '\n';
  fs.writeFileSync(filePath, out);
  return { filePath, status: 'migrated', added, new_receipt_hash: receipt.receipt_hash };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const files = args.filter((a) => a !== '--dry-run');
if (files.length === 0) {
  process.stderr.write('Usage: node receipt-impeccable-migrate.js <receipt.json> [...] [--dry-run]\n');
  process.exit(2);
}
const results = files.map((f) => {
  try { return migrate(f, dryRun); }
  catch (e) { return { filePath: f, status: 'error', error: e.message }; }
});
console.log(JSON.stringify(results, null, 2));
const failed = results.some((r) => r.status === 'error');
process.exit(failed ? 1 : 0);
