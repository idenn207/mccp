'use strict';

// orchestration-runaway validate (Codex F2) — the cost-state-INDEPENDENT
// cumulative worker-launch backstop. Proves that a telemetry-absent fail-open
// path (no cost-state → the USD bomb-detector can never fire) CANNOT bypass the
// absolute cap: the clamp degrades to a single worker purely from the persisted
// launch counter + MCCP_ORCHESTRATION_MAX_AGENTS.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runaway = require('../orchestration-runaway');
const {
  clampForRunaway, parseMaxAgents, readCounter, bumpCounter, DEFAULT_MAX_AGENTS, REASONS,
  reserveWorkers, parseUsdBomb, parseCatastrophicUsd, DEFAULT_CATASTROPHIC_USD,
} = runaway;

function tmpState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runaway-'));
  return path.join(dir, 'orchestration-runaway.json');
}

// ── parseMaxAgents (loud fail-open) ───────────────────────────────────────────

test('parseMaxAgents: default 24; positive override; fail-open on garbage/<=0', function () {
  assert.equal(parseMaxAgents({}), DEFAULT_MAX_AGENTS);
  assert.equal(parseMaxAgents({ MCCP_ORCHESTRATION_MAX_AGENTS: '10' }), 10);
  assert.equal(parseMaxAgents({ MCCP_ORCHESTRATION_MAX_AGENTS: 'garbage' }), DEFAULT_MAX_AGENTS);
  assert.equal(parseMaxAgents({ MCCP_ORCHESTRATION_MAX_AGENTS: '0' }), DEFAULT_MAX_AGENTS);
  assert.equal(parseMaxAgents({ MCCP_ORCHESTRATION_MAX_AGENTS: '-5' }), DEFAULT_MAX_AGENTS);
});

// ── clampForRunaway (pure) ────────────────────────────────────────────────────

test('under cap → requestedN unchanged, not degraded', function () {
  const c = clampForRunaway({ requestedN: 4, launchedSoFar: 0, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '24' } });
  assert.equal(c.n, 4);
  assert.equal(c.degraded, false);
  assert.equal(c.reason, REASONS.OK);
});

test('at the boundary (launched + requestedN == cap) → still allowed', function () {
  const c = clampForRunaway({ requestedN: 4, launchedSoFar: 20, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '24' } });
  assert.equal(c.n, 4);
  assert.equal(c.degraded, false);
});

test('over cap → degraded fail-open to n=1', function () {
  const c = clampForRunaway({ requestedN: 4, launchedSoFar: 21, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '24' } });
  assert.equal(c.n, 1);
  assert.equal(c.degraded, true);
  assert.equal(c.reason, REASONS.RUNAWAY_CLAMP);
});

test('already at/over cap → still degrades to 1, never 0 (fail-open floor)', function () {
  const c = clampForRunaway({ requestedN: 4, launchedSoFar: 24, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '24' } });
  assert.equal(c.n, 1);
  assert.equal(c.degraded, true);
});

test('F2: cost-state absence CANNOT bypass the cap — clamp is purely counter-driven', function () {
  // The clamp takes NO cost input. Simulate a runaway loop under fail-open (no
  // telemetry): each dispatch requests the full fleet; once cumulative launches
  // pass the cap, the clamp degrades every subsequent dispatch to 1.
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '8' };
  let launched = 0;
  const results = [];
  for (let i = 0; i < 6; i++) {
    const c = clampForRunaway({ requestedN: 4, launchedSoFar: launched, env });
    results.push(c.n);
    launched += c.n; // caller bumps the counter by the clamped N
  }
  // 4 (0→4), 4 (4→8), then cap hit → 1,1,1,1. No dispatch escapes the clamp.
  assert.deepEqual(results, [4, 4, 1, 1, 1, 1]);
  results.forEach(function (n) { assert.ok(n <= 4, 'never above the per-dispatch fleet'); });
});

test('invalid requestedN falls back to 1', function () {
  const c = clampForRunaway({ requestedN: 0, launchedSoFar: 0, env: {} });
  assert.equal(c.n, 1);
  assert.equal(c.degraded, false);
});

// ── disk-backed counter: read / bump / session reset ──────────────────────────

test('readCounter: missing file → fresh {launched:0}', function () {
  const p = tmpState();
  const c = readCounter({ sessionId: 's1', statePath: p });
  assert.equal(c.launched, 0);
  assert.equal(c.fresh, true);
});

test('bumpCounter increments; readCounter reads back for the same session', function () {
  const p = tmpState();
  assert.deepEqual(bumpCounter({ sessionId: 's1', delta: 3, statePath: p }), { launched: 3 });
  assert.deepEqual(bumpCounter({ sessionId: 's1', delta: 2, statePath: p }), { launched: 5 });
  const c = readCounter({ sessionId: 's1', statePath: p });
  assert.equal(c.launched, 5);
  assert.equal(c.fresh, false);
});

test('different session key → counter RESET (fresh 0), then counts anew', function () {
  const p = tmpState();
  bumpCounter({ sessionId: 's1', delta: 5, statePath: p });
  // reading with a different session key sees a fresh counter.
  const c = readCounter({ sessionId: 's2', statePath: p });
  assert.equal(c.launched, 0);
  assert.equal(c.fresh, true);
  // bumping under the new session resets the persisted value to the new key.
  assert.deepEqual(bumpCounter({ sessionId: 's2', delta: 2, statePath: p }), { launched: 2 });
  assert.equal(readCounter({ sessionId: 's2', statePath: p }).launched, 2);
});

test('corrupt file → readCounter returns fresh (safe)', function () {
  const p = tmpState();
  fs.writeFileSync(p, '{ not json');
  const c = readCounter({ sessionId: 's1', statePath: p });
  assert.equal(c.launched, 0);
  assert.equal(c.fresh, true);
});

test('end-to-end: read → clamp → bump loop cannot exceed cap amplification', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '8' };
  const sid = 'loop';
  const launchedEach = [];
  for (let i = 0; i < 5; i++) {
    const cur = readCounter({ sessionId: sid, statePath: p });
    const c = clampForRunaway({ requestedN: 4, launchedSoFar: cur.launched, env });
    bumpCounter({ sessionId: sid, delta: c.n, statePath: p });
    launchedEach.push(c.n);
  }
  assert.deepEqual(launchedEach, [4, 4, 1, 1, 1]);
});

// ── M3 Codex F4 — parseUsdBomb (the rollback kill switch) ─────────────────────

test('parseUsdBomb: the standard truthy vocabulary enables it', function () {
  ['1', 'true', 'yes', 'on', 'TRUE', 'On', ' yes '].forEach(function (v) {
    assert.equal(parseUsdBomb({ MCCP_ORCHESTRATION_USD_BOMB: v }), true, 'value: ' + JSON.stringify(v));
  });
});

test('parseUsdBomb: falsy vocabulary and unset → false', function () {
  ['0', 'false', 'no', 'off', 'OFF', ''].forEach(function (v) {
    assert.equal(parseUsdBomb({ MCCP_ORCHESTRATION_USD_BOMB: v }), false, 'value: ' + JSON.stringify(v));
  });
  assert.equal(parseUsdBomb({}), false);
  assert.equal(parseUsdBomb(undefined), false);
});

test('parseUsdBomb: unknown non-empty → false + LOUD warn (never silent)', function () {
  const orig = process.stderr.write;
  const seen = [];
  process.stderr.write = function (s) { seen.push(String(s)); return true; };
  try {
    assert.equal(parseUsdBomb({ MCCP_ORCHESTRATION_USD_BOMB: 'ture' }), false);
    assert.equal(parseUsdBomb({ MCCP_ORCHESTRATION_USD_BOMB: 'enabled' }), false);
  } finally {
    process.stderr.write = orig;
  }
  assert.equal(seen.length, 2, 'a typo on the rollback switch must be surfaced, not swallowed');
  assert.ok(/MCCP_ORCHESTRATION_USD_BOMB/.test(seen[0]));
});

// ── M3 Codex F1 — parseCatastrophicUsd (the replacement bomb ceiling) ─────────

test('parseCatastrophicUsd: default 500 when unset', function () {
  assert.equal(parseCatastrophicUsd({}), DEFAULT_CATASTROPHIC_USD);
  assert.equal(parseCatastrophicUsd({ MCCP_ORCHESTRATION_CATASTROPHIC_USD: '' }), 500);
});

test('parseCatastrophicUsd: honors a valid override, fractional included', function () {
  assert.equal(parseCatastrophicUsd({ MCCP_ORCHESTRATION_CATASTROPHIC_USD: '1200' }), 1200);
  assert.equal(parseCatastrophicUsd({ MCCP_ORCHESTRATION_CATASTROPHIC_USD: '250.5' }), 250.5);
});

test('parseCatastrophicUsd: invalid → default + loud warn (fail-open)', function () {
  const orig = process.stderr.write;
  const seen = [];
  process.stderr.write = function (s) { seen.push(String(s)); return true; };
  try {
    ['garbage', '-5', '0', 'NaN'].forEach(function (v) {
      assert.equal(parseCatastrophicUsd({ MCCP_ORCHESTRATION_CATASTROPHIC_USD: v }),
        DEFAULT_CATASTROPHIC_USD, 'value: ' + v);
    });
  } finally {
    process.stderr.write = orig;
  }
  assert.equal(seen.length, 4);
});

// ── M3 Codex F2 — atomic reserveWorkers (check-and-bump in one lock) ──────────

test('reserveWorkers: grants the request and counts it in one call', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, env: {}, statePath: p });
  assert.equal(r.granted, 4);
  assert.equal(r.degraded, false);
  assert.equal(r.reason, REASONS.OK);
  assert.equal(r.launched, 4, 'the grant is already counted — callers must NOT bump again');
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 4);
});

// THE F2 REGRESSION. Under the old read-then-bump, two dispatches that both read
// launched=4 (cap 8) would each grant 4 → 8 granted from a pre-bump view, and a
// third would push past the cap. reserveWorkers makes the check and the bump one
// critical section, so each successive reserve sees the previous grant.
test('reserveWorkers: sequential reserves cannot amplify past the cap', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '8' };
  const granted = [];
  for (let i = 0; i < 5; i++) {
    granted.push(reserveWorkers({ sessionId: 'loop', requestedN: 4, env: env, statePath: p }).granted);
  }
  assert.deepEqual(granted, [4, 4, 1, 1, 1],
    'once the cap is reached the parallel amplification collapses to a single worker');
});

test('reserveWorkers: a re-entrant reserve sees the prior grant (no stale read)', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '6' };
  const first = reserveWorkers({ sessionId: 're', requestedN: 4, env: env, statePath: p });
  const second = reserveWorkers({ sessionId: 're', requestedN: 4, env: env, statePath: p });
  assert.equal(first.granted, 4);
  assert.equal(second.granted, 1, '4 + 4 > 6 → the second reserve degrades');
  assert.equal(second.degraded, true);
  assert.equal(second.reason, REASONS.RUNAWAY_CLAMP);
});

test('reserveWorkers: never grants 0 (degraded, never blocked)', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '1' };
  const r = reserveWorkers({ sessionId: 'floor', requestedN: 4, env: env, statePath: p });
  assert.equal(r.granted, 1, 'a lone worker is the minimum useful progress');
  assert.equal(r.degraded, true);
});

test('reserveWorkers: lock exhaustion is fail-SAFE (grants 1, not the fleet)', function () {
  const p = tmpState();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Hold the lock with a FRESH mtime so the stale-reclaim path cannot break it.
  fs.writeFileSync(p + '.lock', String(process.pid));
  const orig = process.stderr.write;
  process.stderr.write = function () { return true; };
  let r;
  try {
    r = reserveWorkers({ sessionId: 'held', requestedN: 4, env: {}, statePath: p });
  } finally {
    process.stderr.write = orig;
    fs.unlinkSync(p + '.lock');
  }
  assert.equal(r.granted, 1, 'an unverifiable counter must not grant a full fleet');
  assert.equal(r.degraded, true);
  assert.equal(r.reason, REASONS.LOCK_EXHAUSTED);
  assert.equal(r.launched, null, 'no count was committed');
});

test('reserveWorkers: a different session key resets the cumulative count', function () {
  const p = tmpState();
  reserveWorkers({ sessionId: 'a', requestedN: 4, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '4' }, statePath: p });
  const other = reserveWorkers({ sessionId: 'b', requestedN: 4, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '4' }, statePath: p });
  assert.equal(other.granted, 4, 'a new session starts from a fresh counter');
  assert.equal(other.degraded, false);
});
