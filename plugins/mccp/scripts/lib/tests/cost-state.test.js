'use strict';

// cost-model-subscription M3 (Axis 1) — time-based decay coverage.
//
//   - parseDecayMs env SoT (default 6h · positive hours · 0 kill switch ·
//     negative/non-finite fail-open)
//   - pure decayIfStale (within-window raw · past-window green · disabled ·
//     stat-fail fail-safe · null state)
//   - readStateRaw vs readState split (F1) on the SAME file
//   - explicit write-side floor reset on a stale file + monotonic-within-window
//     regression + kill-switch monotonic
//
// read decay is injected (mtimeMs/now/decayMs) so it is pure; write-side is
// tmp-home isolated (mirror auto-chain.test.js freshHome — cost-state-path uses
// os.homedir() at call time, honoring HOME/USERPROFILE).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cost = require('../cost-state');
const costPath = require('../cost-state-path');

const H6 = 6 * 3600000;
const CRIT = { cost_usd: 314.5, threshold_tier: 'critical', hard_ceiling_reached: true, last_write_ts: 111 };

function freshHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cost-state-'));
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

function writeCostFile(obj) {
  const p = costPath.getCostStatePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

// ── parseDecayMs (env SoT, cost-thresholds#parseEnvOverride mirror) ──

test('parseDecayMs: unset → default 6h', () => {
  assert.equal(cost.parseDecayMs({}), H6);
});

test('parseDecayMs: positive hours → ms', () => {
  assert.equal(cost.parseDecayMs({ MCCP_COST_STATE_DECAY_HOURS: '12' }), 12 * 3600000);
});

test('parseDecayMs: 0 → null (kill switch)', () => {
  assert.equal(cost.parseDecayMs({ MCCP_COST_STATE_DECAY_HOURS: '0' }), null);
});

test('parseDecayMs: negative / non-finite → default (fail-open)', () => {
  assert.equal(cost.parseDecayMs({ MCCP_COST_STATE_DECAY_HOURS: '-3' }), H6);
  assert.equal(cost.parseDecayMs({ MCCP_COST_STATE_DECAY_HOURS: 'abc' }), H6);
});

// ── decayIfStale (pure) ──

test('decayIfStale: within window → raw unchanged', () => {
  assert.deepEqual(cost.decayIfStale(CRIT, 1000, 1000 + H6 - 1, H6), CRIT);
});

test('decayIfStale: exactly at window boundary → raw (<=, not stale)', () => {
  assert.deepEqual(cost.decayIfStale(CRIT, 1000, 1000 + H6, H6), CRIT);
});

test('decayIfStale: past window → green view (last_write_ts preserved)', () => {
  const r = cost.decayIfStale(CRIT, 1000, 1000 + H6 + 1, H6);
  assert.deepEqual(r, { cost_usd: 0, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: 111 });
});

test('decayIfStale: decayMs=null (disabled) → raw', () => {
  assert.deepEqual(cost.decayIfStale(CRIT, 1000, 1000 + 10 * H6, null), CRIT);
});

test('decayIfStale: mtimeMs falsy (stat fail) → raw (no spurious green)', () => {
  assert.deepEqual(cost.decayIfStale(CRIT, 0, Date.now(), H6), CRIT);
});

test('decayIfStale: null state → null', () => {
  assert.equal(cost.decayIfStale(null, 1000, 1e12, H6), null);
});

// ── readStateRaw vs readState (F1 API split) on the SAME file ──

test('F1 split: same stale file → readStateRaw raw, readState green', () => {
  const h = freshHome();
  try {
    writeCostFile(CRIT);
    const now = Date.now();
    assert.equal(cost.readStateRaw().cost_usd, 314.5, 'raw keeps the floor');
    assert.equal(cost.readStateRaw().threshold_tier, 'critical', 'raw keeps the tier');
    const decayed = cost.readState({ mtimeMs: now - 7 * 3600000, now: now, decayMs: H6 });
    assert.equal(decayed.threshold_tier, 'green', 'decayed reader returns green');
    assert.equal(decayed.cost_usd, 0);
    assert.equal(decayed.hard_ceiling_reached, false);
  } finally { h.restore(); }
});

test('readState: fresh mtime → raw (no decay)', () => {
  const h = freshHome();
  try {
    writeCostFile(CRIT);
    const now = Date.now();
    const r = cost.readState({ mtimeMs: now - 1000, now: now, decayMs: H6 });
    assert.equal(r.threshold_tier, 'critical', 'fresh file not decayed');
  } finally { h.restore(); }
});

test('readState: mtimeMs=0 (stat fail) → raw', () => {
  const h = freshHome();
  try {
    writeCostFile(CRIT);
    const now = Date.now();
    const r = cost.readState({ mtimeMs: 0, now: now, decayMs: H6 });
    assert.equal(r.threshold_tier, 'critical');
  } finally { h.restore(); }
});

test('readState: decay disabled (=0 env) → raw', () => {
  const h = freshHome();
  try {
    writeCostFile(CRIT);
    const now = Date.now();
    const r = cost.readState({ mtimeMs: now - 10 * 3600000, now: now, env: { MCCP_COST_STATE_DECAY_HOURS: '0' } });
    assert.equal(r.threshold_tier, 'critical', 'kill switch disables decay');
  } finally { h.restore(); }
});

test('readState: env hours override moves the window', () => {
  const h = freshHome();
  try {
    writeCostFile(CRIT);
    const now = Date.now();
    // 3h old, decay window 2h → stale → green
    const r = cost.readState({ mtimeMs: now - 3 * 3600000, now: now, env: { MCCP_COST_STATE_DECAY_HOURS: '2' } });
    assert.equal(r.threshold_tier, 'green');
    // same file, window 4h → within → raw
    const r2 = cost.readState({ mtimeMs: now - 3 * 3600000, now: now, env: { MCCP_COST_STATE_DECAY_HOURS: '4' } });
    assert.equal(r2.threshold_tier, 'critical');
  } finally { h.restore(); }
});

// ── explicit write-side decay (mirror-of-reader safety broken → floor reset) ──

test('write-side: stale file → floor reset (sticky monotonic broken)', () => {
  const h = freshHome();
  try {
    const p = writeCostFile(CRIT);
    const past = Date.now() / 1000 - 7 * 3600; // 7h old → past 6h default window
    fs.utimesSync(p, past, past);
    const res = cost.writeStateMerged({ cost_usd: 3, hard_ceiling_reached: false, last_write_ts: Date.now() });
    assert.equal(res.ok, true);
    assert.equal(res.state.cost_usd, 3, 'stale $314 floor dropped; low write wins');
    assert.equal(res.state.hard_ceiling_reached, false, 'sticky hard_ceiling reset');
    assert.equal(res.state.threshold_tier, 'green');
  } finally { h.restore(); }
});

test('write-side: fresh file → monotonic MAX preserved (regression)', () => {
  const h = freshHome();
  try {
    cost.writeStateMerged({ cost_usd: 30, hard_ceiling_reached: false, last_write_ts: Date.now() });
    // immediate second write (fresh mtime) → within window → monotonic holds
    const res = cost.writeStateMerged({ cost_usd: 5, hard_ceiling_reached: true, last_write_ts: Date.now() });
    assert.equal(res.state.cost_usd, 30, 'monotonic MAX preserved within window');
    assert.equal(res.state.hard_ceiling_reached, true, 'sticky true within window');
  } finally { h.restore(); }
});

test('write-side: decay disabled (=0) → monotonic even on a stale file', () => {
  const h = freshHome();
  const prev = process.env.MCCP_COST_STATE_DECAY_HOURS;
  process.env.MCCP_COST_STATE_DECAY_HOURS = '0';
  try {
    const p = writeCostFile(CRIT);
    const past = Date.now() / 1000 - 10 * 3600;
    fs.utimesSync(p, past, past);
    const res = cost.writeStateMerged({ cost_usd: 3, hard_ceiling_reached: false, last_write_ts: Date.now() });
    assert.equal(res.state.cost_usd, 314.5, 'kill switch keeps the monotonic floor');
    assert.equal(res.state.hard_ceiling_reached, true);
  } finally {
    if (prev === undefined) delete process.env.MCCP_COST_STATE_DECAY_HOURS;
    else process.env.MCCP_COST_STATE_DECAY_HOURS = prev;
    h.restore();
  }
});
