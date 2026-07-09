'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cs = require('../context-state');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ctxstate-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

test('writeState → readState round-trip + context_ts stamp', () => {
  const dir = tmpDir();
  const r = cs.writeState({ contextRemainingPct: 42, toolCount: 7 }, { dir, now: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, undefined);
  const st = cs.readState({ dir });
  assert.equal(st.context_remaining_pct, 42);
  assert.equal(st.tool_count, 7);
  assert.equal(st.context_ts, 1000);
  cleanup(dir);
});

test('readState → null on missing', () => {
  const dir = tmpDir();
  assert.equal(cs.readState({ dir }), null);
  cleanup(dir);
});

test('readState → null on corrupt file', () => {
  const dir = tmpDir();
  fs.writeFileSync(cs.statePath(dir), '{ not json', 'utf8');
  assert.equal(cs.readState({ dir }), null);
  cleanup(dir);
});

test('out-of-order older sample (lower tool_count) is skipped, critical preserved', () => {
  const dir = tmpDir();
  cs.writeState({ contextRemainingPct: 20, toolCount: 10 }, { dir, now: 2000 }); // newer critical
  const r = cs.writeState({ contextRemainingPct: 80, toolCount: 6 }, { dir, now: 3000 }); // older data, later wall-clock
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
  const st = cs.readState({ dir });
  assert.equal(st.context_remaining_pct, 20); // critical NOT clobbered
  assert.equal(st.tool_count, 10);
  cleanup(dir);
});

test('newer sample (higher tool_count) overwrites', () => {
  const dir = tmpDir();
  cs.writeState({ contextRemainingPct: 80, toolCount: 6 }, { dir, now: 1000 });
  const r = cs.writeState({ contextRemainingPct: 20, toolCount: 10 }, { dir, now: 2000 });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, undefined);
  const st = cs.readState({ dir });
  assert.equal(st.context_remaining_pct, 20);
  assert.equal(st.tool_count, 10);
  cleanup(dir);
});

test('out-of-order falls back to context_ts when tool_count absent', () => {
  const dir = tmpDir();
  cs.writeState({ contextRemainingPct: 20 }, { dir, now: 2000 }); // no toolCount
  const r = cs.writeState({ contextRemainingPct: 80 }, { dir, now: 1000 }); // older ts
  assert.equal(r.skipped, true);
  assert.equal(cs.readState({ dir }).context_remaining_pct, 20);
  cleanup(dir);
});

test('isStale — missing true, fresh false, old true', () => {
  const dir = tmpDir();
  assert.equal(cs.isStale(1000, { dir }), true); // missing
  cs.writeState({ contextRemainingPct: 50, toolCount: 1 }, { dir, now: 10000 });
  assert.equal(cs.isStale(1000, { dir, now: 10500 }), false); // 500ms < 1000
  assert.equal(cs.isStale(1000, { dir, now: 12000 }), true);  // 2000ms > 1000
  cleanup(dir);
});
