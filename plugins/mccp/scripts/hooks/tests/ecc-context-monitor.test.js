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
// M2 Task 7 — harness-cost (Axis A / F1) + state-writer (Axis B / F2) are
// lazy-required inside run(), so their spies install after the hook require.
const harnessCost = require('../../lib/harness-cost');
const stateWriter = require('../../state/state-writer');

const origReadBridge = sessionBridge.readBridge;
const origWriteMerged = costState.writeStateMerged;
const origWriteState = contextState.writeState;
const origReadHarnessMeta = harnessCost.readHarnessCostMeta;
const origStateUpdate = stateWriter.update;
// M3 Axis 2 — the decay-clear/legacy-sweep else branch READS STATE.md +
// cost-state; stub both so tests stay hermetic (no dependence on the real repo
// STATE.md / homedir cost file). Per-test fixtures override the defaults.
const origStateRead = stateWriter.readState;
const origCostRead = costState.readState;

// readBridge mock — installed before the hook require so the destructured local
// binding inside ecc-context-monitor picks it up. Returns a per-test fixture.
let currentBridge = null;
sessionBridge.readBridge = function () { return currentBridge; };

const monitor = require('../ecc-context-monitor');

let mergedCalls;
let ctxCalls;
let ctxThrow;
let harnessMeta;   // M2 — readHarnessCostMeta return value (null = cache miss)
let stateUpdates;  // M2 — captured STATE.md patches
let stateReadFixture; // M3 — stateWriter.readState() return (frontmatter fixture)
let costReadFixture;  // M3 — costState.readState() return (decayed tier fixture)

// harness-cost readHarnessCostMeta is lazy-required in run(); the closure reads
// the current harnessMeta (reset to null by installSpies each test).
harnessCost.readHarnessCostMeta = function () { return harnessMeta; };

function installSpies() {
  mergedCalls = [];
  ctxCalls = [];
  ctxThrow = false;
  harnessMeta = null;
  stateUpdates = [];
  // Hermetic defaults: no residual abort flag, decayed cost green. Clear-branch
  // tests override stateReadFixture / costReadFixture per case.
  stateReadFixture = { frontmatter: { chain_aborted: false } };
  costReadFixture = { cost_usd: 0, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: 0 };
  costState.writeStateMerged = function (s) { mergedCalls.push(s); };
  costState.readState = function () { return costReadFixture; };
  contextState.writeState = function (input) {
    ctxCalls.push(input);
    if (ctxThrow) throw new Error('injected context write failure');
    return { ok: true };
  };
  stateWriter.update = function (_root, patch) { stateUpdates.push(patch); };
  stateWriter.readState = function () { return stateReadFixture; };
}

test.after(() => {
  sessionBridge.readBridge = origReadBridge;
  costState.writeStateMerged = origWriteMerged;
  costState.readState = origCostRead;
  contextState.writeState = origWriteState;
  harnessCost.readHarnessCostMeta = origReadHarnessMeta;
  stateWriter.update = origStateUpdate;
  stateWriter.readState = origStateRead;
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

// ── M2 Task 7 — Axis A (harness-preferred cost + F1 freshness guard) + Axis B
//    (threshold SoT + F2 comparator + STATE.md abort channel) ────────────────

let ctxmSeq = 0;
// Isolated run: unique session id + warn-state cleanup so the debounce file
// (the only real FS write left after the spies) never leaks across tests.
function runIsolated(over) {
  const sid = 'ctxm-' + process.pid + '-' + (ctxmSeq++);
  currentBridge = bridgeFixture(over);
  const out = monitor.run(JSON.stringify({ session_id: sid }));
  try { fs.unlinkSync(path.join(os.tmpdir(), 'ecc-ctx-warn-' + sid + '.json')); } catch { /* ignore */ }
  return out;
}
function withThresholds(value, fn) {
  const prev = process.env.MCCP_HANDOFF_THRESHOLDS_USD;
  if (value === null) delete process.env.MCCP_HANDOFF_THRESHOLDS_USD;
  else process.env.MCCP_HANDOFF_THRESHOLDS_USD = value;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.MCCP_HANDOFF_THRESHOLDS_USD;
    else process.env.MCCP_HANDOFF_THRESHOLDS_USD = prev;
  }
}

test('Axis A (a): fresh harness cache (ts >= cost_sample_ts) drives cost-state + suppresses inflated bridge warning', () => {
  withThresholds(null, () => {
    installSpies();
    harnessMeta = { cost_usd: 45, ts: 2000 };
    const out = runIsolated({ total_cost_usd: 314, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.equal(mergedCalls[0].cost_usd, 45, 'cost-state uses harness $45, not bridge $314');
    assert.equal(mergedCalls[0].hard_ceiling_reached, false, 'harness $45 < critical 100');
    assert.doesNotMatch(out, /COST/, 'no cost warning — bridge $314 alone would be CRITICAL');
  });
});

test('Axis A (b): harness cache miss → bridge cost used (regression)', () => {
  withThresholds(null, () => {
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 7, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.equal(mergedCalls[0].cost_usd, 7);
  });
});

test('F1: harness older than the last cost change (ts < cost_sample_ts) → bridge fallback (no under-protection)', () => {
  withThresholds(null, () => {
    installSpies();
    harnessMeta = { cost_usd: 10, ts: 1000 };
    runIsolated({ total_cost_usd: 90, cost_sample_ts: 2000, context_remaining_pct: 80 });
    assert.equal(mergedCalls[0].cost_usd, 90, 'stale-vs-cost-change harness does not suppress the newer bridge cost');
  });
});

test('Axis B (d): env override 500/800/1000 → $150 hard_ceiling false + tierFor green (fixes 100-hardcode bug)', () => {
  withThresholds('500,800,1000', () => {
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 150, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.equal(mergedCalls[0].cost_usd, 150);
    assert.equal(mergedCalls[0].hard_ceiling_reached, false, '$150 < critical 1000 → no hard ceiling');
    assert.equal(costState.tierFor(150), 'green', 'tier honors override → green');
  });
});

test('F2: STATE.md abort channel honors override — no flip at $150 under 500/800/1000', () => {
  withThresholds('500,800,1000', () => {
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 150, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.equal(stateUpdates.length, 0, '$150 < warning 800 → STATE.md not flipped');
  });
});

test('F2: STATE.md abort channel flips under default thresholds at $150 (regression)', () => {
  withThresholds(null, () => {
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 150, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(stateUpdates.length >= 1, 'STATE.md updated under default thresholds');
    const patch = stateUpdates[stateUpdates.length - 1];
    assert.equal(patch.session_end_imminent, true, '$150 >= warning 80');
    assert.equal(patch.chain_aborted, true, '$150 >= critical 100');
  });
});

test('Axis B (f): default thresholds → $85 emits COST WARNING (severity unchanged)', () => {
  withThresholds(null, () => {
    installSpies();
    harnessMeta = null;
    const out = runIsolated({ total_cost_usd: 85, cost_sample_ts: 1000, context_remaining_pct: 80 });
    const parsed = JSON.parse(out);
    assert.match(parsed.hookSpecificOutput.additionalContext, /COST WARNING/);
  });
});

test('F2: exact critical boundary — tier, hard_ceiling, and STATE.md all agree at cost == critical', () => {
  withThresholds('500,800,1000', () => {
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 1000, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.equal(mergedCalls[0].hard_ceiling_reached, true, 'cost == critical (1000) → hard_ceiling true via >=');
    assert.equal(costState.tierFor(1000), 'critical', 'tier critical at boundary');
    const patch = stateUpdates[stateUpdates.length - 1];
    assert.equal(patch.session_end_imminent, true);
    assert.equal(patch.chain_aborted, true, 'chain_aborted agrees at the exact critical boundary');
  });
});

// ── M3 Axis 2 — subscription-aware SET + provenance stamp + decay-clear +
//    legacy sweep (F2 + F3 + Codex Impl-R1 IF1 + IF2) ────────────────────────

function withEnv(overrides, fn) {
  const prev = {};
  for (const k of Object.keys(overrides)) {
    prev[k] = process.env[k];
    if (overrides[k] === null || overrides[k] === undefined) delete process.env[k];
    else process.env[k] = String(overrides[k]);
  }
  try { fn(); } finally {
    for (const k of Object.keys(overrides)) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
  }
}

function hoursAgoIso(h) { return new Date(Date.now() - h * 3600000).toISOString(); }
function lastAbortPatch() { return stateUpdates.length ? stateUpdates[stateUpdates.length - 1] : null; }
function anyPatch(pred) { return stateUpdates.some(pred); }

test('M3 (a): metered cost>=critical SET stamps chain_aborted + abort_owner=cost + cost_abort_at', () => {
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null }, () => {
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 150, cost_sample_ts: 1000, context_remaining_pct: 80 });
    const patch = lastAbortPatch();
    assert.equal(patch.chain_aborted, true);
    assert.equal(patch.abort_owner, 'cost', 'provenance owner stamped');
    assert.equal(typeof patch.cost_abort_at, 'string', 'cost_abort_at ISO marker stamped');
    assert.ok(!Number.isNaN(Date.parse(patch.cost_abort_at)), 'cost_abort_at is a parseable timestamp');
  });
});

test('M3 (b/F2): subscription high-USD + overflow-green → chain_aborted NOT set; overflow-critical → set', () => {
  withEnv({ MCCP_SUBSCRIPTION: '1', MCCP_HANDOFF_THRESHOLDS_USD: null }, () => {
    // high USD but plenty of context remaining → overflow green → no abort (USD ignored)
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 999, cost_sample_ts: 1000, context_remaining_pct: 80, tool_count: 5 });
    assert.ok(!anyPatch(p => p.chain_aborted === true), 'high USD alone must not flip chain_aborted in subscription mode');

    // context critically low → overflow critical → chain_aborted set + owner=cost
    installSpies();
    harnessMeta = null;
    runIsolated({ total_cost_usd: 999, cost_sample_ts: 1000, context_remaining_pct: 10, tool_count: 5 });
    const patch = lastAbortPatch();
    assert.equal(patch.chain_aborted, true, 'overflow-critical flips chain_aborted');
    assert.equal(patch.abort_owner, 'cost');
  });
});

test('M3 (c/F3): decay-clear fires when 4-way stable AND holds', () => {
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: null }, () => {
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: 'cost', cost_abort_at: hoursAgoIso(7),
      active_dispatch_count: 0, dispatch_id: null, last_event: 'stop_loop_pass',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    const patch = lastAbortPatch();
    assert.ok(patch, 'a clear patch was written');
    assert.equal(patch.chain_aborted, false);
    assert.equal(patch.abort_owner, null);
    assert.equal(patch.cost_abort_at, null);
  });
});

test('M3 (d/F3 provenance): abort_owner=dispatch is NEVER decay-cleared', () => {
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: null }, () => {
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: 'dispatch', cost_abort_at: null,
      active_dispatch_count: 0, dispatch_id: null, last_event: 'dispatch_chain_aborted',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(!anyPatch(p => p.chain_aborted === false), 'dispatch abort must be preserved');
  });
});

test('M3 (e/F3): active dispatch blocks decay-clear even with a cost marker', () => {
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: null }, () => {
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: 'cost', cost_abort_at: hoursAgoIso(7),
      active_dispatch_count: 1, dispatch_id: null, last_event: 'dispatch_started',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(!anyPatch(p => p.chain_aborted === false), 'active dispatch preserves the flag');
  });
});

test('M3 (f/F3 legacy): markerless cost-origin flag is swept; dispatch last_event is not', () => {
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: null }, () => {
    // markerless + stop_loop_pass + green → swept
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: null, cost_abort_at: null,
      active_dispatch_count: 0, dispatch_id: null, last_event: 'stop_loop_pass',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    const patch = lastAbortPatch();
    assert.ok(patch && patch.chain_aborted === false, 'legacy cost-origin flag swept');

    // markerless but last_event=dispatch_chain_aborted → NOT swept (denylist)
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: null, cost_abort_at: null,
      active_dispatch_count: 0, dispatch_id: null, last_event: 'dispatch_chain_aborted',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(!anyPatch(p => p.chain_aborted === false), 'dispatch last_event excluded from legacy sweep');
  });
});

test('M3 (g): fresh marker (age <= decay) and kill-switch (=0) both preserve the flag', () => {
  // fresh cost marker → not old enough → preserved
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: null }, () => {
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: 'cost', cost_abort_at: hoursAgoIso(0.02), // ~1min
      active_dispatch_count: 0, dispatch_id: null, last_event: 'stop_loop_pass',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(!anyPatch(p => p.chain_aborted === false), 'fresh cost abort is preserved');
  });
  // kill switch =0 → no decay-clear, no sweep
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: '0' }, () => {
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: null, cost_abort_at: null,
      active_dispatch_count: 0, dispatch_id: null, last_event: 'stop_loop_pass',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(!anyPatch(p => p.chain_aborted === false), 'decay disabled → legacy sweep skipped');
  });
});

test('M3 (h): decay never writes session_end_imminent=false (precompact lifecycle untouched)', () => {
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: null }, () => {
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: 'cost', cost_abort_at: hoursAgoIso(7),
      session_end_imminent: true, active_dispatch_count: 0, dispatch_id: null, last_event: 'precompact',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(!anyPatch(p => p.session_end_imminent === false), 'decay-clear never touches session_end_imminent');
    // the chain_aborted clear itself still happened (cost-owned, aged)
    assert.ok(anyPatch(p => p.chain_aborted === false), 'chain_aborted still decay-cleared');
  });
});

test('M3 (i/IF1): legacy sweep NEVER clears plan_conflict_escalated hard stop', () => {
  withEnv({ MCCP_SUBSCRIPTION: null, MCCP_HANDOFF_THRESHOLDS_USD: null, MCCP_COST_STATE_DECAY_HOURS: null }, () => {
    installSpies();
    harnessMeta = null;
    stateReadFixture = { frontmatter: {
      chain_aborted: true, abort_owner: null, cost_abort_at: null,
      active_dispatch_count: 0, dispatch_id: null, last_event: 'plan_conflict_escalated',
    } };
    runIsolated({ total_cost_usd: 5, cost_sample_ts: 1000, context_remaining_pct: 80 });
    assert.ok(!anyPatch(p => p.chain_aborted === false),
      'plan_conflict_escalated is in NON_COST_ABORT_EVENTS — must survive the sweep');
  });
});

test('M3 (j/IF2): subscription + stale bridge + critical-looking context → chain_aborted NOT set', () => {
  withEnv({ MCCP_SUBSCRIPTION: '1', MCCP_HANDOFF_THRESHOLDS_USD: null }, () => {
    installSpies();
    harnessMeta = null;
    // last_timestamp 5min old (> STALE_SECONDS 60) → bridge context treated as
    // signal-unknown → evaluateOverflow green → no persistent abort from stale data.
    runIsolated({
      total_cost_usd: 5, cost_sample_ts: 1000,
      context_remaining_pct: 5, tool_count: 5,
      last_timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });
    assert.ok(!anyPatch(p => p.chain_aborted === true), 'stale critical-looking context must not stamp an abort');
  });
});
