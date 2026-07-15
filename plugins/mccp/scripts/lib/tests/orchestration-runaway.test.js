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

// ── M3 follow-up (PR-Codex R1 F2) — two-phase reservation lifecycle ───────────
//
// reserveWorkers used to spend cap headroom permanently at DECISION time, but
// several downstream paths launch nothing (prepare-fleet failure, route fallback
// to Task, fan-out budget pre-guard skip, Workflow unavailable → inline). Those
// phantom reservations ate the headroom that M3 made the PRIMARY backstop.

const { reconcileReservation, parseReservationLease, DEFAULT_RESERVATION_LEASE_MS } = runaway;

test('F2: reserveWorkers returns a reservationId (atomic decision unchanged)', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: {} });
  assert.equal(r.granted, 4);
  assert.equal(typeof r.reservationId, 'string');
  assert.ok(r.reservationId.length > 0);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 4,
    'pending reservations still count against the cap (conservative)');
});

test('F2: reconcile(actualN=0) releases the whole reservation (nothing launched)', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: {} });
  const rec = reconcileReservation({ sessionId: 's1', reservationId: r.reservationId, actualN: 0, statePath: p });
  assert.equal(rec.reconciled, true);
  assert.equal(rec.delta, -4);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 0);
});

test('F2 GUARD (R1 F2): reconcile(actualN=1) keeps the REAL single worker counted', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: {} });
  const rec = reconcileReservation({ sessionId: 's1', reservationId: r.reservationId, actualN: 1, statePath: p });
  assert.equal(rec.reconciled, true);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 1,
    'a degraded route still launches one worker - releasing all of it would be over-permissive');
});

test('F2: reconcile(actualN=granted) commits the full fleet unchanged', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: {} });
  reconcileReservation({ sessionId: 's1', reservationId: r.reservationId, actualN: 4, statePath: p });
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 4);
});

test('F2: double reconcile is idempotent (second is a no-op)', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: {} });
  reconcileReservation({ sessionId: 's1', reservationId: r.reservationId, actualN: 0, statePath: p });
  const second = reconcileReservation({ sessionId: 's1', reservationId: r.reservationId, actualN: 0, statePath: p });
  assert.equal(second.reconciled, false);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 0, 'no double-correction');
});

test('F2: unknown / null reservation id -> no-op', function () {
  const p = tmpState();
  reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: {} });
  assert.equal(reconcileReservation({ sessionId: 's1', reservationId: 'nope', actualN: 0, statePath: p }).reconciled, false);
  assert.equal(reconcileReservation({ sessionId: 's1', reservationId: null, actualN: 0, statePath: p }).reconciled, false);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 4, 'counter untouched');
});

test('F2: headroom is actually reclaimed - reserve -> reconcile(0) -> reserve succeeds', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '4' };
  const a = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: env });
  assert.equal(a.granted, 4);
  reconcileReservation({ sessionId: 's1', reservationId: a.reservationId, actualN: 0, statePath: p });
  const b = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: env });
  assert.equal(b.granted, 4, 'a phantom reservation must not permanently demote the session');
  assert.equal(b.degraded, false);
});

// ── R1 F3 — pending lease self-heals a lost reservation ──────────────────────

function seedPending(p, sessionId, launched, openEntries) {
  fs.writeFileSync(p, JSON.stringify({
    session_id: sessionId, launched: launched, open: openEntries,
    updated_at: new Date().toISOString(),
  }));
}

test('F2/R1-F3: an EXPIRED pending reservation stops holding headroom', function () {
  const p = tmpState();
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min > 10 min lease
  seedPending(p, 's1', 4, [{ id: 'lost', n: 4, at: old }]);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 0,
    'a caller that died before route must not poison the session forever');
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '4' } });
  assert.equal(r.granted, 4, 'headroom recovered');
});

test('F2 GUARD: a COMMITTED launch never expires (over-permissive prevention)', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 4, statePath: p, env: {} });
  reconcileReservation({ sessionId: 's1', reservationId: r.reservationId, actualN: 1, statePath: p });
  const body = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepEqual(body.open, [], 'commit removes the entry from the expirable set');
  fs.writeFileSync(p, JSON.stringify(body));
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 1,
    'a real launch must stay counted no matter how much time passes');
});

test('F2: a pending reservation INSIDE the lease still holds headroom', function () {
  const p = tmpState();
  seedPending(p, 's1', 4, [{ id: 'fresh', n: 4, at: new Date().toISOString() }]);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 4);
});

test('F2: unparseable reservation timestamp is treated as live (never releases on a bad clock)', function () {
  const p = tmpState();
  seedPending(p, 's1', 4, [{ id: 'weird', n: 4, at: 'not-a-date' }]);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 4);
});

test('F2: parseReservationLease - default; override; loud fail-open on 0/garbage', function () {
  assert.equal(parseReservationLease({}), DEFAULT_RESERVATION_LEASE_MS);
  assert.equal(parseReservationLease({ MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1000' }), 1000);
  assert.equal(parseReservationLease({ MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '0' }), DEFAULT_RESERVATION_LEASE_MS);
  assert.equal(parseReservationLease({ MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: 'abc' }), DEFAULT_RESERVATION_LEASE_MS);
  assert.equal(parseReservationLease({ MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '-5' }), DEFAULT_RESERVATION_LEASE_MS);
});

// ── back-compat: legacy counter bodies have no `open` ─────────────────────────

test('F2: legacy counter (no open field) reads normally; reconcile is a no-op', function () {
  const p = tmpState();
  fs.writeFileSync(p, JSON.stringify({ session_id: 's1', launched: 3, updated_at: new Date().toISOString() }));
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 3);
  assert.deepEqual(readCounter({ sessionId: 's1', statePath: p }).open, []);
  assert.equal(reconcileReservation({ sessionId: 's1', reservationId: 'x', actualN: 0, statePath: p }).reconciled, false);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).launched, 3, 'legacy counter untouched');
});

test('F2: malformed open entries are ignored, not counted', function () {
  const p = tmpState();
  seedPending(p, 's1', 4, [null, { n: 2 }, { id: 'ok', n: 4, at: new Date().toISOString() }]);
  assert.equal(readCounter({ sessionId: 's1', statePath: p }).open.length, 1);
});

test('F2: bumpCounter preserves pending reservations (no silent headroom giveback)', function () {
  const p = tmpState();
  const r = reserveWorkers({ sessionId: 's1', requestedN: 2, statePath: p, env: {} });
  bumpCounter({ sessionId: 's1', delta: 1, statePath: p });
  const c = readCounter({ sessionId: 's1', statePath: p });
  assert.equal(c.open.length, 1, 'the reservation survives an unrelated bump');
  assert.equal(c.open[0].id, r.reservationId);
  assert.equal(c.launched, 3);
});

// ── Implement-Codex R1 F1/F2 — reconcile must not silently under-count ────────

const { readCounterRaw } = runaway;
const { execFileSync, spawnSync } = require('child_process');
const RUNAWAY_CLI = path.resolve(__dirname, '..', 'orchestration-runaway.js');

test('R1 F2: an explicit reconcile finds its OWN id even after the lease elapsed', function () {
  const p = tmpState();
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // > 10 min lease
  fs.writeFileSync(p, JSON.stringify({ session_id: 's', launched: 4, open: [{ id: 'mine', n: 4, at: old }] }));
  // A fan-out slower than the lease really DID spawn 4 agents. Reporting that must
  // win over the lease's guess that nothing launched.
  const rec = reconcileReservation({ sessionId: 's', reservationId: 'mine', actualN: 4, statePath: p });
  assert.equal(rec.reconciled, true, 'explicit evidence must beat lease expiry');
  assert.equal(readCounter({ sessionId: 's', statePath: p }).launched, 4,
    '4 real agents stay counted (a no-op here would be over-permissive)');
});

test('R1 F2: expiry still applies to OTHER reservations during a reconcile', function () {
  const p = tmpState();
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const fresh = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify({
    session_id: 's', launched: 8,
    open: [{ id: 'mine', n: 4, at: fresh }, { id: 'abandoned', n: 4, at: old }],
  }));
  reconcileReservation({ sessionId: 's', reservationId: 'mine', actualN: 1, statePath: p });
  const c = readCounter({ sessionId: 's', statePath: p });
  assert.equal(c.launched, 1, 'mine commits to 1; the abandoned pending is pruned');
  assert.deepEqual(c.open, []);
});

test('R1 F2: readCounterRaw does not apply the lease (reconcile depends on this)', function () {
  const p = tmpState();
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  fs.writeFileSync(p, JSON.stringify({ session_id: 's', launched: 4, open: [{ id: 'x', n: 4, at: old }] }));
  assert.equal(readCounterRaw({ sessionId: 's', statePath: p }).open.length, 1, 'raw keeps the expired entry');
  assert.equal(readCounter({ sessionId: 's', statePath: p }).open.length, 0, 'the lease view prunes it');
});

test('R1 F1: CLI exits nonzero when a worker-spawning reconcile does NOT commit', function () {
  const p = tmpState();
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: {} });
  fs.writeFileSync(p + '.lock', String(process.pid)); // hold the lock → exhaustion
  const r = spawnSync(process.execPath, [RUNAWAY_CLI, 'reconcile',
    '--reservation', res.reservationId, '--actual', '4',
    '--session', 's', '--state-path', p], { encoding: 'utf8' });
  try { fs.unlinkSync(p + '.lock'); } catch (_) {}
  assert.notEqual(r.status, 0,
    'exit 0 here told work.md the commit landed; it then deleted the token and launched 4 uncounted workers');
  assert.match(r.stderr, /could NOT be committed/);
});

test('R1 F1: CLI still exits 0 when nothing launches (actual=0 failure is ignorable)', function () {
  const p = tmpState();
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: {} });
  fs.writeFileSync(p + '.lock', String(process.pid));
  const r = spawnSync(process.execPath, [RUNAWAY_CLI, 'reconcile',
    '--reservation', res.reservationId, '--actual', '0',
    '--session', 's', '--state-path', p], { encoding: 'utf8' });
  try { fs.unlinkSync(p + '.lock'); } catch (_) {}
  assert.equal(r.status, 0, 'nothing spawned → the lease lands on the right answer anyway');
});

test('R1 F1: CLI exits 0 on a successful worker-spawning reconcile', function () {
  const p = tmpState();
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: {} });
  const r = spawnSync(process.execPath, [RUNAWAY_CLI, 'reconcile',
    '--reservation', res.reservationId, '--actual', '4',
    '--session', 's', '--state-path', p], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(readCounter({ sessionId: 's', statePath: p }).launched, 4);
});
