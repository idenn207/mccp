'use strict';

// cost-model-subscription M1 (Task 3) — ecc-context-monitor context-current.json
// WIRING coverage. context-state.js's writeState round-trip/out-of-order/isStale
// is covered by lib/tests/context-state.test.js; THIS file covers the hook's
// best-effort forward: that run() stamps context-current.json from the bridge on
// every PostToolUse, unconditionally (NOT gated on MCCP_SUBSCRIPTION), and that a
// context-write failure is isolated — it never breaks the hot hook's cost write
// or downstream warning emission.
//
// Mocking strategy: mutate the cached module singletons. `readBridge` is
// destructured at ecc-context-monitor load time, so its mock MUST be installed
// BEFORE requiring the hook. `writeStateMerged` (cost) + `writeState` (context)
// are lazy-required inside run(), so their spies take effect at call time. Real
// writes are stubbed so tests never touch homedir/.claude — no FS pollution.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sessionBridge = require('../../lib/session-bridge');
const costState = require('../../lib/cost-state');
const contextState = require('../../lib/context-state');

const origReadBridge = sessionBridge.readBridge;
const origWriteMerged = costState.writeStateMerged;
const origWriteState = contextState.writeState;

// readBridge mock — installed before the hook require so the destructured local
// binding inside ecc-context-monitor picks it up. Returns a per-test fixture.
let currentBridge = null;
sessionBridge.readBridge = function () { return currentBridge; };

const monitor = require('../ecc-context-monitor');

let mergedCalls;
let ctxCalls;
let ctxThrow;

function installSpies() {
  mergedCalls = [];
  ctxCalls = [];
  ctxThrow = false;
  costState.writeStateMerged = function (s) { mergedCalls.push(s); };
  contextState.writeState = function (input) {
    ctxCalls.push(input);
    if (ctxThrow) throw new Error('injected context write failure');
    return { ok: true };
  };
}

test.after(() => {
  sessionBridge.readBridge = origReadBridge;
  costState.writeStateMerged = origWriteMerged;
  contextState.writeState = origWriteState;
});

// Healthy defaults → no warnings → run() returns rawInput (pass-through). Tests
// override individual fields. last_timestamp is fresh so the stale guard never
// nulls context.
function bridgeFixture(over) {
  return Object.assign({
    context_remaining_pct: 80,
    tool_count: 12,
    total_cost_usd: 5,
    files_modified_count: 0,
    recent_tools: [],
    last_timestamp: new Date().toISOString(),
  }, over || {});
}

const RAW = JSON.stringify({ session_id: 'testsession' });

test('Task 3 (a): PostToolUse forwards bridge context signal to context-state write', () => {
  installSpies();
  currentBridge = bridgeFixture({ context_remaining_pct: 60, tool_count: 12 });
  const out = monitor.run(RAW);
  assert.equal(ctxCalls.length, 1, 'context write attempted exactly once');
  assert.deepEqual(ctxCalls[0], { contextRemainingPct: 60, toolCount: 12 });
  assert.equal(out, RAW, 'no warnings → hook returns pass-through');
});

test('Task 3 (b): context-write failure is isolated — cost write + downstream warning survive', () => {
  installSpies();
  ctxThrow = true;
  // context_remaining_pct 20 (<=25) forces a CONTEXT CRITICAL warning DOWNSTREAM
  // of the context write. If the throw escaped the inner catch to the outer
  // catch, run() would return rawInput and the warning would be swallowed — so
  // seeing the emitted warning proves the isolated catch preserved hook progress.
  const sid = 'testsessionb' + process.pid;
  currentBridge = bridgeFixture({ context_remaining_pct: 20 });
  const raw = JSON.stringify({ session_id: sid });

  let out;
  let threw = false;
  try { out = monitor.run(raw); } catch (_e) { threw = true; }
  try { fs.unlinkSync(path.join(os.tmpdir(), 'ecc-ctx-warn-' + sid + '.json')); } catch (_e) { /* ignore */ }

  assert.equal(threw, false, 'run() must not throw when the context write fails');
  assert.equal(mergedCalls.length, 1, 'cost write happened despite the context-write failure');
  assert.equal(ctxCalls.length, 1, 'context write was attempted');
  const parsed = JSON.parse(out);
  assert.ok(parsed.hookSpecificOutput, 'downstream warning still emitted (not swallowed by the outer catch)');
  assert.match(parsed.hookSpecificOutput.additionalContext, /CONTEXT CRITICAL/);
});

test('Task 3 (c): unconditional per-PostToolUse forward — metered path (MCCP_SUBSCRIPTION unset) still stamps, fresh sample each call', () => {
  installSpies();
  const prev = process.env.MCCP_SUBSCRIPTION;
  delete process.env.MCCP_SUBSCRIPTION;
  try {
    currentBridge = bridgeFixture({ context_remaining_pct: 55, tool_count: 12 });
    monitor.run(RAW);
    currentBridge = bridgeFixture({ context_remaining_pct: 50, tool_count: 13 });
    monitor.run(RAW);
    assert.equal(ctxCalls.length, 2, 'stamped on both PostToolUse calls even with subscription unset');
    assert.deepEqual(ctxCalls[0], { contextRemainingPct: 55, toolCount: 12 });
    assert.deepEqual(ctxCalls[1], { contextRemainingPct: 50, toolCount: 13 }, 'forwards each fresh bridge sample verbatim, in order');
  } finally {
    if (prev === undefined) delete process.env.MCCP_SUBSCRIPTION;
    else process.env.MCCP_SUBSCRIPTION = prev;
  }
});

test('Task 3 (d): bridge missing context fields forwards undefined (writeState normalizes) without breaking the hook', () => {
  installSpies();
  currentBridge = bridgeFixture({ context_remaining_pct: undefined, tool_count: undefined });
  const out = monitor.run(RAW);
  assert.equal(ctxCalls.length, 1);
  assert.deepEqual(ctxCalls[0], { contextRemainingPct: undefined, toolCount: undefined });
  assert.equal(out, RAW, 'hook still returns pass-through');
});

test('Task 3 (e): no bridge → early return, no cost/context write attempted', () => {
  installSpies();
  currentBridge = null; // readBridge returns null → run() returns rawInput early
  const out = monitor.run(RAW);
  assert.equal(out, RAW);
  assert.equal(ctxCalls.length, 0, 'no context write on the no-bridge early-return path');
  assert.equal(mergedCalls.length, 0, 'no cost write on the no-bridge early-return path');
});
