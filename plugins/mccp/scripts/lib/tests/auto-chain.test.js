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

test('shouldAbort: hard_ceiling_reached=true triggers cost-telemetry', () => {
  const h = freshHome();
  try {
    fs.mkdirSync(costPath.getCostStateDir(), { recursive: true });
    fs.writeFileSync(costPath.getCostStatePath(), JSON.stringify({
      cost_usd: 100.5, threshold_tier: 'critical', hard_ceiling_reached: true, last_write_ts: Date.now(),
    }));
    const r = autoChain.shouldAbort({ env: {}, cwd: h.dir });
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
