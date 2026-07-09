'use strict';

// cost-model-subscription M2 (Task 2) — harness-cost lib contract.
// Covers the single-validator (F4) read path + best-effort atomic write:
// round-trip, fresh/stale/future age boundaries, corrupt/negative/non-finite
// rejection, falsy sessionId no-op, tmp-file leak, and readHarnessCost ↔
// readHarnessCostMeta parity (both public adapters must agree with the private
// readHarnessCostRecord validator on every reject/accept decision).
//
// FS isolation: unique sessionId per test (pid + random) under os.tmpdir();
// each test unlinks its cache file in a finally.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hc = require('../harness-cost');

const MAX_AGE = 300;
let seq = 0;
function uniqueSid() {
  seq += 1;
  return `hc-test-${process.pid}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}
function nowSec() {
  return Math.floor(Date.now() / 1000);
}
function writeRaw(sid, text) {
  fs.writeFileSync(hc.getHarnessCostPath(sid), text, 'utf8');
}
function cleanup(sid) {
  try { fs.unlinkSync(hc.getHarnessCostPath(sid)); } catch { /* ignore */ }
}

test('round-trip: write then read returns the same cost via all three read fns', () => {
  const sid = uniqueSid();
  try {
    const res = hc.writeHarnessCost(sid, 42.5);
    assert.equal(res.ok, true, 'write reports ok');
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), 42.5);
    const meta = hc.readHarnessCostMeta(sid, MAX_AGE);
    assert.equal(meta.cost_usd, 42.5);
    assert.ok(Number.isFinite(meta.ts), 'meta exposes a finite ts');
    const rec = hc.readHarnessCostRecord(sid, MAX_AGE);
    assert.deepEqual(rec, meta, 'record == meta shape { cost_usd, ts }');
  } finally { cleanup(sid); }
});

test('fresh (age <= maxAge) passes; stale (age > maxAge) rejects', () => {
  const sid = uniqueSid();
  try {
    writeRaw(sid, JSON.stringify({ ts: nowSec() - 5, cost_usd: 10 }));
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), 10, 'fresh accepted');
    writeRaw(sid, JSON.stringify({ ts: nowSec() - (MAX_AGE + 100), cost_usd: 10 }));
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), null, 'stale rejected');
    assert.equal(hc.readHarnessCostMeta(sid, MAX_AGE), null, 'stale meta rejected');
  } finally { cleanup(sid); }
});

test('future ts (negative age) rejects', () => {
  const sid = uniqueSid();
  try {
    writeRaw(sid, JSON.stringify({ ts: nowSec() + 100, cost_usd: 10 }));
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), null);
    assert.equal(hc.readHarnessCostMeta(sid, MAX_AGE), null);
  } finally { cleanup(sid); }
});

test('corrupt JSON rejects (both adapters)', () => {
  const sid = uniqueSid();
  try {
    writeRaw(sid, '{ not valid json');
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), null);
    assert.equal(hc.readHarnessCostMeta(sid, MAX_AGE), null);
  } finally { cleanup(sid); }
});

test('negative cost in file rejects on read; negative cost write is a no-op', () => {
  const sid = uniqueSid();
  try {
    writeRaw(sid, JSON.stringify({ ts: nowSec(), cost_usd: -1 }));
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), null, 'negative in-file rejected');
    cleanup(sid);
    const res = hc.writeHarnessCost(sid, -5);
    assert.equal(res.ok, false, 'negative write no-op');
    assert.equal(fs.existsSync(hc.getHarnessCostPath(sid)), false, 'no file written for negative cost');
  } finally { cleanup(sid); }
});

test('non-finite ts or cost rejects', () => {
  const sid = uniqueSid();
  try {
    writeRaw(sid, JSON.stringify({ ts: 'nope', cost_usd: 10 }));
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), null, 'non-finite ts rejected');
    writeRaw(sid, JSON.stringify({ ts: nowSec(), cost_usd: 'NaN' }));
    assert.equal(hc.readHarnessCost(sid, MAX_AGE), null, 'non-finite cost rejected');
  } finally { cleanup(sid); }
});

test('falsy sessionId: write no-op, read null', () => {
  assert.equal(hc.writeHarnessCost('', 10).ok, false);
  assert.equal(hc.writeHarnessCost(null, 10).ok, false);
  assert.equal(hc.readHarnessCost('', MAX_AGE), null);
  assert.equal(hc.readHarnessCostMeta(undefined, MAX_AGE), null);
  assert.equal(hc.readHarnessCostRecord(null, MAX_AGE), null);
});

test('missing cache file → null (no throw)', () => {
  const sid = uniqueSid(); // never written
  assert.equal(hc.readHarnessCost(sid, MAX_AGE), null);
  assert.equal(hc.readHarnessCostMeta(sid, MAX_AGE), null);
});

test('successful write leaves no leftover .tmp file', () => {
  const sid = uniqueSid();
  try {
    assert.equal(hc.writeHarnessCost(sid, 1.23).ok, true);
    const base = path.basename(hc.getHarnessCostPath(sid));
    const leftovers = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(base + '.') && f.endsWith('.tmp'));
    assert.equal(leftovers.length, 0, 'no orphan tmp file after rename');
  } finally { cleanup(sid); }
});

test('F4 parity: readHarnessCost and readHarnessCostMeta agree across all reject/accept cases', () => {
  const cases = [
    { label: 'valid', text: JSON.stringify({ ts: nowSec() - 1, cost_usd: 7 }), expectCost: 7 },
    { label: 'stale', text: JSON.stringify({ ts: nowSec() - (MAX_AGE + 50), cost_usd: 7 }), expectCost: null },
    { label: 'future', text: JSON.stringify({ ts: nowSec() + 50, cost_usd: 7 }), expectCost: null },
    { label: 'corrupt', text: '<<bad>>', expectCost: null },
    { label: 'negative', text: JSON.stringify({ ts: nowSec(), cost_usd: -3 }), expectCost: null },
  ];
  for (const c of cases) {
    const sid = uniqueSid();
    try {
      writeRaw(sid, c.text);
      const num = hc.readHarnessCost(sid, MAX_AGE);
      const meta = hc.readHarnessCostMeta(sid, MAX_AGE);
      if (c.expectCost === null) {
        assert.equal(num, null, `${c.label}: readHarnessCost null`);
        assert.equal(meta, null, `${c.label}: readHarnessCostMeta null`);
      } else {
        assert.equal(num, c.expectCost, `${c.label}: readHarnessCost value`);
        assert.equal(meta.cost_usd, c.expectCost, `${c.label}: readHarnessCostMeta cost matches`);
      }
    } finally { cleanup(sid); }
  }
});
