'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { scanLedger } = require('../sources/ledger');
const store = require('../../lib/completion-ledger/store');
const { tmpRepo, cleanup, gitInit } = require('./helpers');

function makeEntry(over) {
  return Object.assign({
    decision_id: 'cycle-m1',
    gate: 'mccp-pr-codex',
    verdict: 'converged',
    version: '1.18.3',
    completed_at: '2026-06-24T03:00:00.000Z',
    commit_sha: 'abc1234',
    plan_basename: 'cycle-m1.plan.md',
    plan_file_hash: 'sha256:' + 'a'.repeat(64),
    risks_closed: [],
    oq_closed: [],
    receipt_hash: 'sha256:' + 'd'.repeat(64),
  }, over || {});
}

test('scanLedger: absent ledger dir → ok with count 0', () => {
  const root = tmpRepo();
  try {
    const r = scanLedger(root);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.count, 0);
    assert.deepStrictEqual(r.items, []);
    assert.strictEqual(r.degraded, false);
  } finally { cleanup(root); }
});

test('scanLedger: two distinct decisions → count 2', () => {
  const root = tmpRepo();
  try {
    store.writeEntry(root, makeEntry({ decision_id: 'a', receipt_hash: 'sha256:' + '1'.repeat(64) }));
    store.writeEntry(root, makeEntry({ decision_id: 'b', receipt_hash: 'sha256:' + '2'.repeat(64) }));
    const r = scanLedger(root);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.count, 2);
    const ids = r.items.map(i => i.decision_id).sort();
    assert.deepStrictEqual(ids, ['a', 'b']);
  } finally { cleanup(root); }
});

test('scanLedger: same decision diff receipt_hash → deduped to count 1 (latest)', () => {
  const root = tmpRepo();
  try {
    store.writeEntry(root, makeEntry({ receipt_hash: 'sha256:' + '1'.repeat(64), completed_at: '2026-06-20T00:00:00.000Z' }));
    store.writeEntry(root, makeEntry({ receipt_hash: 'sha256:' + '2'.repeat(64), completed_at: '2026-06-24T00:00:00.000Z' }));
    const r = scanLedger(root);
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.items[0].completed_at, '2026-06-24T00:00:00.000Z');
  } finally { cleanup(root); }
});

test('scanLedger: malformed file → degraded=true + invalid_count>=1', () => {
  const root = tmpRepo();
  try {
    store.writeEntry(root, makeEntry());
    fs.writeFileSync(path.join(store.ledgerDir(root), 'broken.json'), 'not json', 'utf8');
    const r = scanLedger(root);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.count, 1);
    assert.ok(r.invalid_count >= 1);
    assert.strictEqual(r.degraded, true);
  } finally { cleanup(root); }
});

test('derive: ledger source wired into the model + countSources shape', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    store.writeEntry(root, makeEntry());
    const m = derive(root, { raw: true });
    assert.ok(m.sources.ledger, 'sources.ledger present');
    assert.strictEqual(m.sources.ledger.ok, true);
    assert.strictEqual(m.sources.ledger.count, 1);
    assert.ok(Array.isArray(m.sources.ledger.items));
    assert.strictEqual(typeof m.sources.ledger.invalid_count, 'number');
    assert.strictEqual(typeof m.sources.ledger.degraded, 'boolean');
  } finally { cleanup(root); }
});
