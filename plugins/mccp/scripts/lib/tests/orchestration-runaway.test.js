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
const { clampForRunaway, parseMaxAgents, readCounter, bumpCounter, DEFAULT_MAX_AGENTS, REASONS } = runaway;

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
