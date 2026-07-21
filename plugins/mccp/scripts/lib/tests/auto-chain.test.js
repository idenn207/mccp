'use strict';

// Plan v0.2.2 Task 5 — auto-chain abort triggers + preflight + cost monotonic merge.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const autoChain = require('../auto-chain');
const cost = require('../cost-state');
const costPath = require('../cost-state-path');

function freshHome() {
  // Override HOME before requiring cost-state-path resolution. cost-state-path uses
  // os.homedir() at call time, which honors HOME on POSIX and USERPROFILE on Win.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-auto-chain-'));
  const prev = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return {
    dir: dir,
    restore: function () {
      if (prev.HOME === undefined) delete process.env.HOME; else process.env.HOME = prev.HOME;
      if (prev.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prev.USERPROFILE;
    },
  };
}

test('shouldAbort: MCCP_AUTO_CHAIN_DISABLE=1 triggers kill-switch', () => {
  const h = freshHome();
  try {
    // also write a fresh cost file so cost trigger doesn't fire
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    fs.writeFileSync(costPath.getCostStatePath(), JSON.stringify({
      cost_usd: 1, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: Date.now(),
    }));
    const r = autoChain.shouldAbort({
      env: { MCCP_AUTO_CHAIN_DISABLE: '1' },
      cwd: h.dir,
    });
    assert.strictEqual(r.shouldAbort, true);
    assert.ok(r.reasons.some(x => x.trigger === 'kill-switch'));
  } finally { h.restore(); }
});

test('shouldAbort: cost-current.json missing triggers cost-telemetry', () => {
  const h = freshHome();
  try {
    const r = autoChain.shouldAbort({
      env: {},
      cwd: h.dir,
    });
    assert.strictEqual(r.shouldAbort, true);
    assert.ok(r.reasons.some(x => x.trigger === 'cost-telemetry' && /cost-state-missing/.test(x.detail)));
  } finally { h.restore(); }
});

// ── live-activation M3 (Codex F3) — USD abort aligned with the firing oracles ──
//
// Firing happens upstream of auto-chain, so retiring the operational-USD block in
// the oracles while leaving hard_ceiling aborting commit→pr here would only move
// the stall: firing goes green and the run still dies before completing. The
// operational block is therefore retired here too, with the catastrophic ceiling
// as the replacement and usdBomb as the restore.

function writeCost(usd, tier, hardCeiling) {
  fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
  fs.writeFileSync(costPath.getCostStatePath(), JSON.stringify({
    cost_usd: usd, threshold_tier: tier, hard_ceiling_reached: hardCeiling,
    last_write_ts: Date.now(),
  }));
}

test('M3: hard_ceiling at operational $186 does NOT abort by default', () => {
  const h = freshHome();
  try {
    writeCost(186.92, 'critical', true);
    const r = autoChain.shouldAbort({ env: {}, cwd: h.dir });
    assert.ok(!r.reasons.some(x => x.trigger === 'cost-telemetry'),
      'operational spend must not abort the chain — that is the M3 contract');
  } finally { h.restore(); }
});

test('M3: cost_usd >= catastrophic ceiling aborts with cost-catastrophic', () => {
  const h = freshHome();
  try {
    writeCost(600, 'critical', true);
    const r = autoChain.shouldAbort({ env: {}, cwd: h.dir });
    assert.strictEqual(r.shouldAbort, true);
    assert.ok(r.reasons.some(x => x.trigger === 'cost-telemetry' && /cost-catastrophic/.test(x.detail)));
  } finally { h.restore(); }
});

test('M3: MCCP_ORCHESTRATION_CATASTROPHIC_USD override moves the abort boundary', () => {
  const h = freshHome();
  try {
    writeCost(186.92, 'critical', true);
    const r = autoChain.shouldAbort({
      env: { MCCP_ORCHESTRATION_CATASTROPHIC_USD: '100' }, cwd: h.dir,
    });
    assert.ok(r.reasons.some(x => x.trigger === 'cost-telemetry' && /cost-catastrophic/.test(x.detail)),
      '$186 is above a $100 ceiling → aborts');
  } finally { h.restore(); }
});

test('M3: usdBomb=1 restores the hard_ceiling abort (back-compat)', () => {
  const h = freshHome();
  try {
    writeCost(100.5, 'critical', true);
    const r = autoChain.shouldAbort({
      env: { MCCP_ORCHESTRATION_USD_BOMB: '1' }, cwd: h.dir,
    });
    assert.strictEqual(r.shouldAbort, true);
    assert.ok(r.reasons.some(x => x.trigger === 'cost-telemetry' && /cost-hard-ceiling/.test(x.detail)));
  } finally { h.restore(); }
});

test('shouldAbort: stale cost-current.json triggers cost-telemetry', () => {
  const h = freshHome();
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    const target = costPath.getCostStatePath();
    fs.writeFileSync(target, JSON.stringify({
      cost_usd: 1, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: Date.now(),
    }));
    // Backdate mtime by 2 hours
    const past = Date.now() / 1000 - 7200;
    fs.utimesSync(target, past, past);
    const r = autoChain.shouldAbort({ env: {}, cwd: h.dir });
    assert.ok(r.reasons.some(x => x.trigger === 'cost-telemetry' && /cost-state-stale/.test(x.detail)));
  } finally { h.restore(); }
});

test('shouldAbort: STATE.md chain_aborted=true triggers state-md-aborted', () => {
  const h = freshHome();
  try {
    // setup good cost telemetry
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    fs.writeFileSync(costPath.getCostStatePath(), JSON.stringify({
      cost_usd: 1, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: Date.now(),
    }));
    // fake git repo + STATE.md
    const repoRoot = path.join(h.dir, 'repo');
    fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.claude', 'state'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.claude', 'state', 'STATE.md'),
      '---\nstate_version: 1\nchain_aborted: true\n---\n# STATE\n');
    const r = autoChain.shouldAbort({ env: {}, cwd: repoRoot, repoRoot: repoRoot });
    assert.ok(r.reasons.some(x => x.trigger === 'state-md-aborted'));
  } finally { h.restore(); }
});

test('shouldAbort: previousStepStatus failed triggers previous-step-failed', () => {
  const h = freshHome();
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    fs.writeFileSync(costPath.getCostStatePath(), JSON.stringify({
      cost_usd: 1, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: Date.now(),
    }));
    const r = autoChain.shouldAbort({
      env: {}, cwd: h.dir, previousStepStatus: 'failed',
    });
    assert.ok(r.reasons.some(x => x.trigger === 'previous-step-failed'));
  } finally { h.restore(); }
});

test('shouldAbort: happy path returns shouldAbort=false', () => {
  const h = freshHome();
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    fs.writeFileSync(costPath.getCostStatePath(), JSON.stringify({
      cost_usd: 5.0, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: Date.now(),
    }));
    const r = autoChain.shouldAbort({ env: {}, cwd: h.dir });
    assert.strictEqual(r.shouldAbort, false, JSON.stringify(r));
    assert.strictEqual(r.reasons.length, 0);
  } finally { h.restore(); }
});

// R2#2 preflight tests
test('preflightStep: pr step refuses MCCP_ALLOW_CODEX_UNAVAILABLE=1 (R2#2)', () => {
  const r = autoChain.preflightStep('pr', { env: { MCCP_ALLOW_CODEX_UNAVAILABLE: '1' } });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /advisory-env-rejected/);
});

test('preflightStep: pr step OK when advisory env not set', () => {
  const r = autoChain.preflightStep('pr', { env: {} });
  assert.strictEqual(r.ok, true);
});

test('preflightStep: commit step does NOT refuse advisory env (not terminal)', () => {
  const r = autoChain.preflightStep('commit', { env: { MCCP_ALLOW_CODEX_UNAVAILABLE: '1' } });
  assert.strictEqual(r.ok, true);
});

// R2#1 monotonic merge tests
test('cost monotonic merge: stale older true beats newer false', () => {
  const h = freshHome();
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    // First, a newer write with hard_ceiling=false
    cost.writeStateMerged({ cost_usd: 30, hard_ceiling_reached: false, last_write_ts: Date.now() });
    // Then an older-ts write with hard_ceiling=true (simulating stale event arrival)
    cost.writeStateMerged({ cost_usd: 5, hard_ceiling_reached: true, last_write_ts: Date.now() - 60_000 });
    const final = cost.readState();
    assert.strictEqual(final.hard_ceiling_reached, true, 'sticky true survives stale arrival');
    assert.strictEqual(final.cost_usd, 30, 'cost_usd took max');
  } finally { h.restore(); }
});

test('cost monotonic merge: cross-CWD writers converge on same canonical path', () => {
  const h = freshHome();
  try {
    const cwd1 = path.join(h.dir, 'project-a');
    const cwd2 = path.join(h.dir, 'project-b');
    fs.mkdirSync(cwd1, { recursive: true });
    fs.mkdirSync(cwd2, { recursive: true });
    // Simulate two different chdirs by computing path twice
    const prev = process.cwd();
    process.chdir(cwd1);
    cost.writeStateMerged({ cost_usd: 40, hard_ceiling_reached: false, last_write_ts: Date.now() });
    process.chdir(cwd2);
    cost.writeStateMerged({ cost_usd: 60, hard_ceiling_reached: true, last_write_ts: Date.now() });
    process.chdir(prev);
    const final = cost.readState();
    assert.strictEqual(final.hard_ceiling_reached, true);
    assert.strictEqual(final.cost_usd, 60);
  } finally { h.restore(); }
});

// --- cost-model-subscription M1 — subscription-path (Task 7) ---
function ctxReadChain(v) { return function () { return v; }; }

test('subscription: context critical -> context-overflow abort trigger', () => {
  const r = autoChain.shouldAbort({ env: { MCCP_SUBSCRIPTION: '1' }, repoRoot: os.tmpdir(), contextStateRead: ctxReadChain({ context_remaining_pct: 20, tool_count: 5 }) });
  assert.ok(r.shouldAbort);
  assert.ok(r.reasons.some(x => x.trigger === 'context-overflow'));
});

test('subscription: absent context -> no context-overflow trigger (fail-open)', () => {
  const r = autoChain.shouldAbort({ env: { MCCP_SUBSCRIPTION: '1' }, repoRoot: os.tmpdir(), contextStateRead: () => null });
  assert.ok(!r.reasons.some(x => x.trigger === 'context-overflow'));
});

test('subscription: cost-telemetry NOT consulted (sticky $314.50 ignored)', () => {
  const r = autoChain.shouldAbort({ env: { MCCP_SUBSCRIPTION: '1' }, repoRoot: os.tmpdir(), contextStateRead: ctxReadChain({ context_remaining_pct: 70, tool_count: 5 }) });
  assert.ok(!r.reasons.some(x => x.trigger === 'cost-telemetry'));
});

// ── cost-model-subscription M3 — F1 cross-consumer divergence + F2 integration ──

test('M3 F1: same stale-high file — auto-chain cost-state-stale abort, decayed reader green (documented divergence)', () => {
  const h = freshHome();
  const prevDecay = process.env.MCCP_COST_STATE_DECAY_HOURS;
  delete process.env.MCCP_COST_STATE_DECAY_HOURS; // default 6h
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    const target = costPath.getCostStatePath();
    fs.writeFileSync(target, JSON.stringify({
      cost_usd: 314.5, threshold_tier: 'critical', hard_ceiling_reached: true, last_write_ts: Date.now(),
    }));
    // Backdate 7h → stale for BOTH auto-chain (1h) and decay (6h).
    const past = Date.now() / 1000 - 7 * 3600;
    fs.utimesSync(target, past, past);

    // auto-chain reads RAW (readStateOrThrow) + isStale(1h) → fail-safe stale abort.
    const r = autoChain.shouldAbort({ env: {}, cwd: h.dir });
    assert.ok(r.reasons.some(x => x.trigger === 'cost-telemetry' && /cost-state-stale/.test(x.detail)),
      'auto-chain keeps its raw fail-safe stale-abort (intentional divergence)');

    // Gate reader (decayed readState, default 6h) on the SAME file → green.
    const decayed = cost.readState();
    assert.equal(decayed.threshold_tier, 'green', 'decayed reader returns green on the same stale file');
    assert.equal(decayed.cost_usd, 0);
  } finally {
    if (prevDecay === undefined) delete process.env.MCCP_COST_STATE_DECAY_HOURS;
    else process.env.MCCP_COST_STATE_DECAY_HOURS = prevDecay;
    h.restore();
  }
});

test('M3 F1 self-heal: first fresh write drops the stale floor → auto-chain passes', () => {
  const h = freshHome();
  const prevDecay = process.env.MCCP_COST_STATE_DECAY_HOURS;
  delete process.env.MCCP_COST_STATE_DECAY_HOURS;
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    const target = costPath.getCostStatePath();
    fs.writeFileSync(target, JSON.stringify({
      cost_usd: 314.5, threshold_tier: 'critical', hard_ceiling_reached: true, last_write_ts: Date.now(),
    }));
    const past = Date.now() / 1000 - 7 * 3600;
    fs.utimesSync(target, past, past);
    // First fresh tool write → write-side decay drops the floor (green, fresh mtime).
    cost.writeStateMerged({ cost_usd: 3, hard_ceiling_reached: false, last_write_ts: Date.now() });
    const r = autoChain.shouldAbort({ env: {}, cwd: h.dir });
    assert.ok(!r.reasons.some(x => x.trigger === 'cost-telemetry'),
      'after the self-healing fresh write, auto-chain no longer aborts on cost');
  } finally {
    if (prevDecay === undefined) delete process.env.MCCP_COST_STATE_DECAY_HOURS;
    else process.env.MCCP_COST_STATE_DECAY_HOURS = prevDecay;
    h.restore();
  }
});

// F2 integration — run the REAL producer (ecc-context-monitor) in subscription
// mode with high USD + green context, then feed the produced STATE.md to
// auto-chain: high USD alone must NOT flip chain_aborted (trigger 8 dormant).
const sessionBridge = require('../session-bridge');
const origReadBridge = sessionBridge.readBridge;
let producerBridge = null;
sessionBridge.readBridge = function () { return producerBridge; };
const ecMonitor = require('../../hooks/ecc-context-monitor');
test.after(() => { sessionBridge.readBridge = origReadBridge; });

test('M3 F2: subscription high-USD produces no STATE.md chain_aborted → auto-chain trigger 8 dormant', () => {
  const h = freshHome();
  const prev = { sub: process.env.MCCP_SUBSCRIPTION, th: process.env.MCCP_HANDOFF_THRESHOLDS_USD };
  process.env.MCCP_SUBSCRIPTION = '1';
  delete process.env.MCCP_HANDOFF_THRESHOLDS_USD;
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    const repoRoot = path.join(h.dir, 'repo');
    fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.claude', 'state'), { recursive: true });

    // High USD, but plenty of context remaining → overflow green → no abort.
    producerBridge = {
      context_remaining_pct: 80, tool_count: 5, total_cost_usd: 999,
      files_modified_count: 0, recent_tools: [], last_timestamp: new Date().toISOString(),
    };
    const sid = 'm3f2-' + process.pid;
    ecMonitor.run(JSON.stringify({ session_id: sid, cwd: repoRoot }));
    try { fs.unlinkSync(path.join(os.tmpdir(), 'ecc-ctx-warn-' + sid + '.json')); } catch { /* ignore */ }

    // The produced STATE.md must not carry a chain_aborted flag.
    const stateMdPath = path.join(repoRoot, '.claude', 'state', 'STATE.md');
    if (fs.existsSync(stateMdPath)) {
      const raw = fs.readFileSync(stateMdPath, 'utf8');
      assert.doesNotMatch(raw, /^chain_aborted: true$/m, 'high USD must not stamp chain_aborted in subscription mode');
    }

    // auto-chain sees a clean STATE.md → trigger 8 dormant; subscription ignores USD.
    const r = autoChain.shouldAbort({
      env: { MCCP_SUBSCRIPTION: '1' }, repoRoot: repoRoot,
      contextStateRead: ctxReadChain({ context_remaining_pct: 80, tool_count: 5 }),
    });
    assert.ok(!r.reasons.some(x => x.trigger === 'state-md-aborted'), 'trigger 8 dormant on high USD');
    assert.ok(!r.reasons.some(x => x.trigger === 'context-overflow'), 'green context → no overflow abort');
    assert.ok(!r.reasons.some(x => x.trigger === 'cost-telemetry'), 'subscription ignores USD cost-state');
  } finally {
    if (prev.sub === undefined) delete process.env.MCCP_SUBSCRIPTION; else process.env.MCCP_SUBSCRIPTION = prev.sub;
    if (prev.th === undefined) delete process.env.MCCP_HANDOFF_THRESHOLDS_USD; else process.env.MCCP_HANDOFF_THRESHOLDS_USD = prev.th;
    h.restore();
  }
});
