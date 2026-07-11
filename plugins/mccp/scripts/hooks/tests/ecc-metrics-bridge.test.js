'use strict';

// cost-model-subscription M2 (Task 7) — ecc-metrics-bridge cost_sample_ts (F1).
// The bridge must stamp a numeric cost-sample timestamp (epoch seconds) ONLY
// when total_cost_usd changes, so ecc-context-monitor's freshness guard can
// tell "the harness snapshot is newer than the last cost change" apart from
// "newer than the last tool activity" (last_timestamp, which bumps every call).
//
// Mocking: readBridge / writeBridgeAtomic are destructured at load → mocked
// before require. A UNIQUE session id means readSessionCost finds no matching
// row in the real costs.jsonl (or ENOENT) → newCost resolves to 0, letting us
// exercise all three branches of the stamp decision without FS fixtures.

const test = require('node:test');
const assert = require('node:assert/strict');

const sessionBridge = require('../../lib/session-bridge');
const origReadBridge = sessionBridge.readBridge;
const origWriteBridge = sessionBridge.writeBridgeAtomic;

let currentBridge = null;
let written = null;
sessionBridge.readBridge = function () { return currentBridge; };
sessionBridge.writeBridgeAtomic = function (_sid, data) { written = data; };

const bridge = require('../ecc-metrics-bridge');

test.after(() => {
  sessionBridge.readBridge = origReadBridge;
  sessionBridge.writeBridgeAtomic = origWriteBridge;
});

function uniqueSid() {
  return `mb-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}
function runOnce(prev) {
  written = null;
  currentBridge = prev;
  const sid = uniqueSid();
  bridge.run(JSON.stringify({ session_id: sid, tool_name: 'Read', tool_input: { file_path: 'x.js' } }));
  return written;
}

test('cost_sample_ts is NOT re-stamped when the cost value is unchanged', () => {
  const out = runOnce({
    session_id: 's', total_cost_usd: 0, cost_sample_ts: 1234,
    tool_count: 3, files_modified_count: 0, recent_tools: [],
    first_timestamp: new Date().toISOString(), last_timestamp: new Date().toISOString(),
  });
  assert.equal(out.cost_sample_ts, 1234, 'unchanged cost (0 → 0) keeps the prior sample ts');
});

test('cost_sample_ts IS re-stamped when the cost value changes', () => {
  const out = runOnce({
    session_id: 's', total_cost_usd: 5, cost_sample_ts: 1234,
    tool_count: 1, files_modified_count: 0, recent_tools: [],
    first_timestamp: new Date().toISOString(), last_timestamp: new Date().toISOString(),
  });
  assert.notEqual(out.cost_sample_ts, 1234, 'changed cost (5 → 0) bumps the sample ts');
  const now = Math.floor(Date.now() / 1000);
  assert.ok(out.cost_sample_ts >= now - 5 && out.cost_sample_ts <= now + 1, 'bumped to a fresh epoch-seconds value');
});

test('cost_sample_ts is seeded when absent on a legacy/first bridge', () => {
  const out = runOnce({
    session_id: 's', total_cost_usd: 0, /* no cost_sample_ts */
    tool_count: 0, files_modified_count: 0, recent_tools: [],
    first_timestamp: new Date().toISOString(), last_timestamp: new Date().toISOString(),
  });
  assert.ok(Number.isFinite(out.cost_sample_ts), 'field seeded to a concrete number');
});

test('regression: existing bridge fields survive the cost_sample_ts addition', () => {
  const prevTs = new Date(Date.now() - 60000).toISOString();
  const out = runOnce({
    session_id: 's', total_cost_usd: 0, cost_sample_ts: 999,
    tool_count: 7, files_modified_count: 2, files_modified: ['a', 'b'],
    recent_tools: [{ tool: 'Read', hash: 'aa' }],
    first_timestamp: prevTs, last_timestamp: prevTs,
  });
  assert.equal(out.tool_count, 8, 'tool_count incremented');
  assert.equal(out.first_timestamp, prevTs, 'first_timestamp preserved');
  assert.notEqual(out.last_timestamp, prevTs, 'last_timestamp advanced (ISO activity marker)');
  assert.ok(Array.isArray(out.recent_tools) && out.recent_tools.length >= 1, 'ring buffer intact');
});
