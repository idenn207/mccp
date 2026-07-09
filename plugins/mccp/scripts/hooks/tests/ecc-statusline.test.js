'use strict';

// cost-model-subscription M2 (Task 5) — ecc-statusline harness-cost writer +
// F3 render source. renderStatusline is the extracted, return-a-string render
// path so we can drive it synchronously without stdin plumbing.
//
// Mocking: readBridge / writeBridgeAtomic are destructured at ecc-statusline
// load time, so their mocks MUST be installed BEFORE requiring the hook.
// writeHarnessCost is lazy-required inside renderStatusline, so its spy takes
// effect at call time. No real bridge/cache writes → no FS pollution.

const test = require('node:test');
const assert = require('node:assert/strict');

const sessionBridge = require('../../lib/session-bridge');
const harnessCost = require('../../lib/harness-cost');
const { sanitizeSessionId } = sessionBridge;

const origReadBridge = sessionBridge.readBridge;
const origWriteBridge = sessionBridge.writeBridgeAtomic;
const origWriteHarness = harnessCost.writeHarnessCost;

let currentBridge = null;
sessionBridge.readBridge = function () { return currentBridge; };
sessionBridge.writeBridgeAtomic = function () { /* no-op — avoid FS */ };

const statusline = require('../ecc-statusline');

let writeCalls;
let harnessThrow;
function installSpy() {
  writeCalls = [];
  harnessThrow = false;
  harnessCost.writeHarnessCost = function (sid, cost) {
    writeCalls.push([sid, cost]);
    if (harnessThrow) throw new Error('injected harness-cost write failure');
    return { ok: true };
  };
}

test.after(() => {
  sessionBridge.readBridge = origReadBridge;
  sessionBridge.writeBridgeAtomic = origWriteBridge;
  harnessCost.writeHarnessCost = origWriteHarness;
});

function baseData(over) {
  return Object.assign({
    session_id: 'sidX',
    model: { display_name: 'Opus' },
    context_window: { remaining_percentage: 80 },
  }, over || {});
}

test('Task 5 (a): cost.total_cost_usd present → writeHarnessCost(sessionId, cost) once + F3 shows harness cost', () => {
  installSpy();
  currentBridge = { total_cost_usd: 0, tool_count: 3, files_modified_count: 0, first_timestamp: new Date().toISOString() };
  const out = statusline.renderStatusline(baseData({ session_id: 'sidA', cost: { total_cost_usd: 12.34 } }));
  assert.equal(writeCalls.length, 1, 'writeHarnessCost called exactly once');
  assert.equal(writeCalls[0][0], sanitizeSessionId('sidA'));
  assert.equal(writeCalls[0][1], 12.34);
  assert.match(out, /\$12\.34/, 'F3: display uses live harness cost');
});

test('Task 5 (b): data.cost absent → no writeHarnessCost, display falls back to bridge cost', () => {
  installSpy();
  currentBridge = { total_cost_usd: 5.5, tool_count: 2, files_modified_count: 0, first_timestamp: new Date().toISOString() };
  const out = statusline.renderStatusline(baseData({ session_id: 'sidB' }));
  assert.equal(writeCalls.length, 0, 'no cost field → no write');
  assert.match(out, /\$5\.50/, 'display falls back to bridge total_cost_usd');
});

test('Task 5 (c): writeHarnessCost throws → render still returns (isolation), cost still displayed', () => {
  installSpy();
  harnessThrow = true;
  currentBridge = { total_cost_usd: 0, tool_count: 1, files_modified_count: 0, first_timestamp: new Date().toISOString() };
  let out;
  let threw = false;
  try {
    out = statusline.renderStatusline(baseData({ session_id: 'sidC', cost: { total_cost_usd: 9 } }));
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'render must not throw when writeHarnessCost throws');
  assert.equal(writeCalls.length, 1, 'write was attempted');
  assert.match(out, /\$9\.00/, 'render completed and shows harness cost despite write failure');
});

test('Task 5 (d): no session id → no writeHarnessCost', () => {
  installSpy();
  currentBridge = null;
  statusline.renderStatusline({ model: { display_name: 'Opus' }, cost: { total_cost_usd: 3 } });
  assert.equal(writeCalls.length, 0, 'sanitized session id null → no write');
});

test('Task 5: extractHarnessCost validates the cost field', () => {
  assert.equal(statusline.extractHarnessCost({ cost: { total_cost_usd: 5 } }), 5);
  assert.equal(statusline.extractHarnessCost({ cost: { total_cost_usd: 0 } }), 0, 'zero is valid');
  assert.equal(statusline.extractHarnessCost({}), null, 'no cost object');
  assert.equal(statusline.extractHarnessCost({ cost: {} }), null, 'no total_cost_usd');
  assert.equal(statusline.extractHarnessCost({ cost: { total_cost_usd: -1 } }), null, 'negative rejected');
  assert.equal(statusline.extractHarnessCost({ cost: { total_cost_usd: '5' } }), null, 'non-number rejected');
  assert.equal(statusline.extractHarnessCost(null), null, 'null data');
});
