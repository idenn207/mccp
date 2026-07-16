'use strict';

// orchestration-runaway validate (Codex F2) — the cost-state-INDEPENDENT
// cumulative worker-launch backstop. Proves that a telemetry-absent fail-open
// path (no cost-state → the USD bomb-detector can never fire) CANNOT bypass the
// absolute cap: the decision comes purely from the persisted launch counter +
// MCCP_ORCHESTRATION_MAX_AGENTS.
//
// THE INVARIANT UNDER TEST IS THE CUMULATIVE TOTAL, not the per-dispatch grant.
// Until PR-Codex R1 F1 (5th round) this file asserted a floor of 1 per dispatch and
// called that "cannot bypass the cap" — while the total climbed past it forever, one
// worker at a time. Assertions about `granted` alone cannot see that; assert the
// persisted total.

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

// ── session key resolution (PR-Codex R1, 7th round) ───────────────────────────
//
// The cap is session-keyed so a dead-controller pin resets next session. It read
// CLAUDE_SESSION_ID, which the Claude Code CLI does NOT set (it exports
// CLAUDE_CODE_SESSION_ID), so every run collapsed into one permanent shared 'unknown'
// bucket that never reset — a single pin exhausted the cap for all future runs.

test('resolveSessionKey: prefers the real runtime var, then legacy, then unknown', function () {
  assert.equal(runaway.resolveSessionKey({ CLAUDE_CODE_SESSION_ID: 'real', CLAUDE_SESSION_ID: 'legacy' }), 'real');
  assert.equal(runaway.resolveSessionKey({ MCCP_SESSION_ID: 'm', CLAUDE_CODE_SESSION_ID: 'real' }), 'm');
  assert.equal(runaway.resolveSessionKey({ CLAUDE_SESSION_ID: 'legacy' }), 'legacy');
  assert.equal(runaway.resolveSessionKey({}), 'unknown');
});

test('resolveCliSession: the shell "unknown"/empty sentinel resolves from env; a real id wins', function () {
  assert.equal(runaway.resolveCliSession({ session: 'unknown' }, { CLAUDE_CODE_SESSION_ID: 'real' }), 'real');
  assert.equal(runaway.resolveCliSession({ session: '' }, { CLAUDE_CODE_SESSION_ID: 'real' }), 'real');
  assert.equal(runaway.resolveCliSession({}, { CLAUDE_CODE_SESSION_ID: 'real' }), 'real');
  assert.equal(runaway.resolveCliSession({ session: 'sess-123' }, { CLAUDE_CODE_SESSION_ID: 'real' }), 'sess-123');
});

test('CLI reserve+reconcile with the shell "unknown" sentinel land in the SAME real-session bucket', function () {
  // Regression guard: reserve (cliReserve) and reconcile (runCli) both pass --session
  // "unknown" from the shell's ${CLAUDE_SESSION_ID:-unknown}. Before the fix they keyed
  // 'unknown'; a library that resolved only ONE side would split them into two buckets
  // and the reconcile would never find its reservation. Both must resolve identically.
  const p = tmpState();
  const saved = process.env.CLAUDE_CODE_SESSION_ID;
  process.env.CLAUDE_CODE_SESSION_ID = 'ci-session-xyz';
  try {
    runaway.runCli(['reserve', '--n', '3', '--session', 'unknown', '--state-path', p]);
    const raw = runaway.readCounterRaw({ sessionId: 'ci-session-xyz', statePath: p });
    assert.equal(raw.launched, 3, 'reserve keyed the REAL session, not the unknown bucket');
    assert.equal(raw.open.length, 1);
    const resId = raw.open[0].id;
    runaway.runCli(['reconcile', '--reservation', resId, '--actual', '3', '--session', 'unknown', '--state-path', p]);
    const after = runaway.readCounterRaw({ sessionId: 'ci-session-xyz', statePath: p });
    assert.equal(after.open.length, 0, 'reconcile found the reservation in the same real-session bucket');
    assert.equal(after.launched, 3);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
    else process.env.CLAUDE_CODE_SESSION_ID = saved;
  }
});

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

test('partial headroom → granted exactly what remains (PR-Codex R1 F1, 5th round)', function () {
  // Was: "over cap → degraded fail-open to n=1". The floor threw away real headroom
  // (3 slots remained, yet only 1 was granted) AND, worse, granted 1 even when 0
  // remained — see the cap-exhausted test below.
  const c = clampForRunaway({ requestedN: 4, launchedSoFar: 21, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '24' } });
  assert.equal(c.n, 3, 'exactly the remaining headroom, not an arbitrary floor');
  assert.equal(c.degraded, true);
  assert.equal(c.reason, REASONS.RUNAWAY_CLAMP);
});

test('at the cap → n=0 / CAP_EXHAUSTED (PR-Codex R1 F1, 5th round)', function () {
  // Was: "already at/over cap → still degrades to 1, never 0 (fail-open floor)".
  // That floor is what made this a throttle rather than a cap: reserveWorkers
  // RECORDS what it grants, so every post-cap call persisted one more launch.
  const c = clampForRunaway({ requestedN: 4, launchedSoFar: 24, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '24' } });
  assert.equal(c.n, 0);
  assert.equal(c.degraded, true);
  assert.equal(c.reason, REASONS.CAP_EXHAUSTED);
});

test('past the cap → still 0, never negative', function () {
  const c = clampForRunaway({ requestedN: 4, launchedSoFar: 99, env: { MCCP_ORCHESTRATION_MAX_AGENTS: '24' } });
  assert.equal(c.n, 0);
  assert.equal(c.reason, REASONS.CAP_EXHAUSTED);
});

test('F2: cost-state absence CANNOT bypass the cap — clamp is purely counter-driven', function () {
  // The clamp takes NO cost input. Simulate a runaway loop under fail-open (no
  // telemetry): each dispatch requests the full fleet.
  //
  // PR-Codex R1 F1 (5th round) — this test used to assert [4,4,1,1,1,1] and call it
  // "no dispatch escapes the clamp". It escaped: cap=8 but the cumulative total ran
  // to 12 and kept climbing, one worker per dispatch, forever. The assertion
  // measured the per-dispatch number and never the thing the cap is about.
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '8' };
  let launched = 0;
  const results = [];
  for (let i = 0; i < 6; i++) {
    const c = clampForRunaway({ requestedN: 4, launchedSoFar: launched, env });
    results.push(c.n);
    launched += c.n; // caller bumps the counter by the clamped N
  }
  assert.deepEqual(results, [4, 4, 0, 0, 0, 0]);
  assert.equal(launched, 8, 'the cumulative total never exceeds the cap — the actual invariant');
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

test('end-to-end: read → clamp → bump loop cannot exceed the cap', function () {
  // PR-Codex R1 F1 (5th round) — the old expectation was [4,4,1,1,1], i.e. a total
  // of 11 against a cap of 8, under a test named "cannot exceed cap". Two tests in
  // this file asserted the overrun as correct because both watched the per-dispatch
  // number instead of the total. Assert the total.
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
  assert.deepEqual(launchedEach, [4, 4, 0, 0, 0]);
  assert.equal(readCounter({ sessionId: sid, statePath: p }).launched, 8);
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
  // PR-Codex R1 F1 (5th round) — this asserted [4,4,1,1,1] against a cap of 8: a
  // total of 11, under a test whose name says it cannot pass the cap. The trailing
  // 1s were the leak, not the protection.
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '8' };
  const granted = [];
  for (let i = 0; i < 5; i++) {
    granted.push(reserveWorkers({ sessionId: 'loop', requestedN: 4, env: env, statePath: p }).granted);
  }
  assert.deepEqual(granted, [4, 4, 0, 0, 0],
    'once the cap is reached, nothing more is granted');
  assert.equal(runaway.readCounterRaw({ sessionId: 'loop', statePath: p }).launched, 8,
    'the cumulative total is exactly the cap — the invariant the name promises');
});

test('reserveWorkers: a re-entrant reserve sees the prior grant (no stale read)', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '6' };
  const first = reserveWorkers({ sessionId: 're', requestedN: 4, env: env, statePath: p });
  const second = reserveWorkers({ sessionId: 're', requestedN: 4, env: env, statePath: p });
  assert.equal(first.granted, 4);
  // 4 already spent of 6 → 2 remain. The point of the test is that the second
  // reserve sees the first one's grant; R1 F1 (5th round) only changes the degraded
  // number from an arbitrary floor of 1 to the headroom that actually remains.
  assert.equal(second.granted, 2, '4 + 4 > 6 → trimmed to the 2 remaining slots');
  assert.equal(second.degraded, true);
  assert.equal(second.reason, REASONS.RUNAWAY_CLAMP);
  assert.equal(second.launched, 6, 'and the total lands exactly on the cap');
});

test('reserveWorkers: a fleet request with only one slot left grants that one slot', function () {
  // Was named "never grants 0 (degraded, never blocked)". It passed then and passes
  // now, but the name asserted a property the module no longer has and should never
  // have had: at the cap, 0 is exactly the right answer (see the tests above). What
  // this case really pins is that leftover headroom is still usable.
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '1' };
  const r = reserveWorkers({ sessionId: 'floor', requestedN: 4, env: env, statePath: p });
  assert.equal(r.granted, 1, 'one slot remained, so one worker runs');
  assert.equal(r.degraded, true);
  assert.equal(reserveWorkers({ sessionId: 'floor', requestedN: 1, env: env, statePath: p }).granted, 0,
    'and the next one gets nothing — the pipeline continues inline');
});

// PR-Codex R1 F1 — lock exhaustion grants ZERO, not 1. Granting 1 was fail-OPEN in
// the only sense the cap cares about: no lock means no write, so that worker was
// never recorded and no reservationId existed to reconcile it. Repeated exhaustion
// leaked one untracked launch per call and MCCP_ORCHESTRATION_MAX_AGENTS was
// bypassable without bound — at the exact point M3 promotes this counter to the
// PRIMARY structural backstop.
test('R1 F1: lock exhaustion grants 0 (fail-CLOSED — an unrecordable launch is not permitted)', function () {
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
  assert.equal(r.granted, 0, 'a launch that cannot be recorded must not be granted');
  assert.equal(r.degraded, true);
  assert.equal(r.reason, REASONS.LOCK_EXHAUSTED);
  assert.equal(r.launched, null, 'no count was committed');
  assert.equal(r.reservationId, null, 'nothing was recorded, so there is nothing to reconcile');
});

// The leak this closes: N exhausted reserves used to hand out N untracked workers
// while the persisted counter stayed at 0.
test('R1 F1: repeated lock exhaustion cannot leak untracked launches', function () {
  const p = tmpState();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.lock', String(process.pid));
  const orig = process.stderr.write;
  process.stderr.write = function () { return true; };
  let total = 0;
  try {
    for (let i = 0; i < 5; i++) {
      total += reserveWorkers({ sessionId: 'held', requestedN: 4, env: {}, statePath: p }).granted;
    }
  } finally {
    process.stderr.write = orig;
    fs.unlinkSync(p + '.lock');
  }
  assert.equal(total, 0, 'no worker is granted while the counter cannot be written');
  assert.equal(readCounter({ sessionId: 'held', statePath: p, env: {} }).launched, 0);
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

// ── M3 follow-up (PR-Codex R1 F3) — --actual is validated BEFORE reconcile ────
//
// `Number(args.actual)` used to run straight into reconcileReservation, which
// coerces a non-finite actualN to 0 — subtracting the WHOLE reservation, removing
// it from open[] (committing it), and exiting 0. Real launches then went
// un-counted, the over-permissive direction this cap must never err in, and the
// exit-11 guard could not catch it because it requires Number.isFinite(actualN).

const { parseActualN } = runaway;

test('R1 F3: parseActualN accepts non-negative integers only', function () {
  assert.equal(parseActualN('0'), 0);
  assert.equal(parseActualN('4'), 4);
  assert.equal(parseActualN(undefined), null, '--actual omitted');
  assert.equal(parseActualN(true), null, '--actual followed by another flag');
  assert.equal(parseActualN('abc'), null);
  assert.equal(parseActualN('-1'), null);
  assert.equal(parseActualN('1.5'), null);
  assert.equal(parseActualN(''), null);
});

// The reservation must be left EXACTLY as it was: untouched means still pending,
// which is conservative (counted) and self-healing via the lease.
[
  { name: '--actual omitted', extra: [] },
  { name: '--actual followed by a flag', extra: ['--actual', '--session', 'x'] },
  { name: '--actual abc', extra: ['--actual', 'abc'] },
  { name: '--actual -1', extra: ['--actual', '-1'] },
].forEach(function (c) {
  test('R1 F3: ' + c.name + ' → nonzero exit, reservation untouched', function () {
    const p = tmpState();
    const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: {} });
    const before = fs.readFileSync(p, 'utf8');
    const r = spawnSync(process.execPath, [RUNAWAY_CLI, 'reconcile',
      '--reservation', res.reservationId, '--session', 's', '--state-path', p]
      .concat(c.extra), { encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'a malformed count must never report success');
    assert.equal(fs.readFileSync(p, 'utf8'), before,
      'the reservation stays pending — the lease resolves it, never a guess');
    const raw = runaway.readCounterRaw({ sessionId: 's', statePath: p });
    assert.equal(raw.open.length, 1, 'still pending (not committed)');
    assert.equal(raw.launched, 4, 'the conservative count is intact');
  });
});

// ── PR-Codex R1 F1 (5th round): the cap actually caps ─────────────────────────
//
// The regression these lock down is not "granted is small" but "the cumulative
// total stops". The old floor of 1 kept every assertion about `granted` true while
// the session total climbed without bound.

test('F1: repeated reservations never push the session past the cap', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '4' };
  const granted = [];
  let last = null;
  for (let i = 0; i < 8; i++) {
    last = reserveWorkers({ sessionId: 's', requestedN: 1, statePath: p, env: env });
    granted.push(last.granted);
  }
  assert.deepEqual(granted, [1, 1, 1, 1, 0, 0, 0, 0],
    'once the cap is reached every later reservation grants nothing');
  assert.equal(last.launched, 4, 'the persisted total is pinned at the cap');
  assert.equal(runaway.readCounterRaw({ sessionId: 's', statePath: p }).launched, 4);
});

test('F1: a refused reservation writes nothing and hands back no id', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '2' };
  reserveWorkers({ sessionId: 's', requestedN: 2, statePath: p, env: env });
  const before = fs.readFileSync(p, 'utf8');

  const denied = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  assert.equal(denied.granted, 0);
  assert.equal(denied.reason, runaway.REASONS.CAP_EXHAUSTED);
  assert.equal(denied.reservationId, null, 'nothing to reconcile → no id to invent');
  assert.equal(fs.readFileSync(p, 'utf8'), before, 'a refusal must not touch the counter');
});

test('F1: a fleet larger than the remaining headroom is trimmed to fit, not floored', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '4' };
  reserveWorkers({ sessionId: 's', requestedN: 3, statePath: p, env: env });
  const r = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  assert.equal(r.granted, 1, 'exactly the 1 remaining slot');
  assert.equal(r.launched, 4);
  assert.equal(reserveWorkers({ sessionId: 's', requestedN: 1, statePath: p, env: env }).granted, 0);
});

// ── PR-Codex R1 F2 (5th round): known launches are never lease-expired ────────

test('F2: without a debt marker an expired pending is dropped (the bug being fixed)', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  const view = runaway.readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(view.launched, 0, 'baseline: the lease subtracts an un-pinned pending');
});

test('F2: a debt-marked reservation survives the lease', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  assert.equal(runaway.markDebt({ reservationId: res.reservationId, n: 4, statePath: p }), true);

  const view = runaway.readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(view.launched, 4, 'these workers really ran; the lease must not guess otherwise');
  assert.equal(view.open.length, 1, 'still pending, awaiting a reconcile that can commit');
});

test('F2: a later reconcile commits a debt-marked entry and clears the marker', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  runaway.markDebt({ reservationId: res.reservationId, n: 4, statePath: p });

  const rec = runaway.reconcileReservation({
    sessionId: 's', reservationId: res.reservationId, actualN: 4, statePath: p, env: env,
  });
  assert.equal(rec.reconciled, true);
  assert.equal(rec.launched, 4);
  assert.equal(runaway.readDebtIds({ statePath: p }).size, 0, 'committed → the marker is spent');
  assert.equal(runaway.readCounterRaw({ sessionId: 's', statePath: p }).open.length, 0);
});

test('F2: reconciling one reservation does not evict another debt-marked one', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const pinned = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  runaway.markDebt({ reservationId: pinned.reservationId, n: 4, statePath: p });
  const other = reserveWorkers({ sessionId: 's', requestedN: 2, statePath: p, env: env });

  // This write persists the pruning of everything it does not commit.
  runaway.reconcileReservation({
    sessionId: 's', reservationId: other.reservationId, actualN: 2, statePath: p, env: env,
  });

  const view = runaway.readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(view.launched, 6, "the pinned fan-out's 4 plus the committed 2");
});

test('F2: CLI pins the launches itself when it cannot commit them', function () {
  const p = tmpState();
  // A live lock the CLI cannot take, so reconcile fails for real rather than by mock.
  fs.writeFileSync(p + '.lock', String(process.pid));
  try {
    const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
    // Reserve before the lock exists, so there is a real pending entry to pin.
    fs.unlinkSync(p + '.lock');
    const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
    fs.writeFileSync(p + '.lock', String(process.pid));

    const r = spawnSync(process.execPath, [RUNAWAY_CLI, 'reconcile',
      '--reservation', res.reservationId, '--actual', '4', '--session', 's', '--state-path', p],
      { encoding: 'utf8' });
    assert.equal(r.status, 11, 'an uncommitted real launch must not report success');
    assert.ok(runaway.readDebtIds({ statePath: p }).has(res.reservationId),
      'the CLI pins it without needing the lock it just failed to get');

    const view = runaway.readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
    assert.equal(view.launched, 4, 'the launches stay counted despite the lease elapsing');
  } finally {
    try { fs.unlinkSync(p + '.lock'); } catch (_e) { /* already gone */ }
  }
});

// ── actualN==0 + lock-fail must NOT leave a false pin (PR-Codex R1, 6th round) ─
//
// plan.md pre-pins every fan-out reservation immediately before the Workflow call.
// When the Workflow launches 0 agents (in-sandbox budget skip / tool absent) the
// reconcile runs with actualN=0; if it then cannot take the lock, the pre-pin is a
// FALSE pin over zero launches. The CLI exits 0 for actualN=0 ("the lease will clean
// it up") and the caller deletes the token — but the pin blocks the lease, so the
// phantom over-counts PERMANENTLY and the live-activation paths self-disable under
// contention. The fix: a lock-failed reconcile that learns actualN===0 clears the pin.

test('R1 (6th round): actualN=0 + lock-fail clears the false pin so the lease reclaims the phantom', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  runaway.markDebt({ reservationId: res.reservationId, n: 4, statePath: p }); // pre-pinned before Workflow
  assert.equal(runaway.readDebtIds({ statePath: p }).size, 1);

  // A live lock the reconcile cannot take → the commit fails for real (not by mock).
  fs.writeFileSync(p + '.lock', String(process.pid));
  try {
    const rec = runaway.reconcileReservation({
      sessionId: 's', reservationId: res.reservationId, actualN: 0, statePath: p, env: env,
    });
    assert.equal(rec.reconciled, false, 'lock held → cannot commit the release');
    assert.equal(runaway.readDebtIds({ statePath: p }).size, 0,
      '0 launches → the false pin is cleared lock-free so the lease can reclaim the phantom');
  } finally {
    try { fs.unlinkSync(p + '.lock'); } catch (_e) { /* already gone */ }
  }

  const view = runaway.readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(view.launched, 0, 'the phantom is reclaimed after the lease — not pinned forever');
});

test('R1 (6th round): a real launch (actualN>0) is NEVER unpinned by a lock-fail', function () {
  // The guard is EXACTLY actualN===0. A lock-failed reconcile that knows workers ran must
  // keep the pin — under-counting real launches is the over-permissive direction the cap
  // must never err in.
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  runaway.markDebt({ reservationId: res.reservationId, n: 4, statePath: p });
  fs.writeFileSync(p + '.lock', String(process.pid));
  try {
    runaway.reconcileReservation({
      sessionId: 's', reservationId: res.reservationId, actualN: 4, statePath: p, env: env,
    });
    assert.equal(runaway.readDebtIds({ statePath: p }).size, 1,
      'workers really launched → the pin stays even though the commit could not land');
  } finally {
    try { fs.unlinkSync(p + '.lock'); } catch (_e) { /* already gone */ }
  }
  const view = runaway.readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(view.launched, 4, 'the real launches stay counted despite the lease elapsing');
});

// ── debt markers pin FOREVER (PR-Codex R1, 5th-round PR gate) ─────────────────
//
// The 7th round briefly added time-based decay to these markers, reasoning that a
// permanent pin re-introduced the self-poisoning the lease prevents. PR-Codex rejected
// it: every debt marker is written by plan.md's fan-out IMMEDIATELY before the Workflow
// call that launches the agents, so a marker surviving a controller death is evidence
// that real workers launched. Decaying it lets readCounter lease-expire the still-open
// reservation and subtract those real launches — an UNDER-count, the one over-permissive
// direction a safety cap must never err in. The pin is permanent; the self-poisoning it
// leaves is bounded (session-keyed counter resets next session; ≤fleetSize per incident).

function ageFile(p, ms) {
  const t = new Date(Date.now() - ms);
  fs.utimesSync(p, t, t);
}

test('F2 pin: a debt marker NEVER decays — aged markers still count real launches', function () {
  // PR-Codex R1 (5th round) regression: fan-out launched, the controller died before
  // reconcile, and a lot of time passed. The pin is the only record those agents ran,
  // so the cap must STILL count them however old the marker is.
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  runaway.markDebt({ reservationId: res.reservationId, n: 4, statePath: p });
  // Age the marker far past any window a decay scheme might once have used.
  ageFile(path.join(runaway.getDebtDir({ statePath: p }), res.reservationId + '.json'), 999 * 3600000);

  const view = runaway.readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(view.launched, 4, 'the real launches stay counted no matter how old the pin is');
  assert.equal(view.open.length, 1, 'the pinned reservation is not lease-expired');
});

test('F2 pin: the read side is VIEW-ONLY — reading never unlinks a marker', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24' };
  const res = reserveWorkers({ sessionId: 's', requestedN: 2, statePath: p, env: env });
  const marker = path.join(runaway.getDebtDir({ statePath: p }), res.reservationId + '.json');
  runaway.markDebt({ reservationId: res.reservationId, n: 2, statePath: p });

  assert.equal(runaway.readDebtIds({ statePath: p }).size, 1, 'the pin is honored');
  assert.equal(fs.existsSync(marker), true,
    'and reading never mutates disk — the firing-preview stays read-only');
});

test('F2 pin: self-poisoning is bounded — a different session reads fresh (launched 0)', function () {
  // Why pinning forever is acceptable: the counter is session-keyed, so a dead-controller
  // pin cannot cross into the next session. The bounded, self-resetting liveness cost is
  // the right price for never bypassing the cap.
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const res = reserveWorkers({ sessionId: 's-old', requestedN: 4, statePath: p, env: env });
  runaway.markDebt({ reservationId: res.reservationId, n: 4, statePath: p });
  ageFile(path.join(runaway.getDebtDir({ statePath: p }), res.reservationId + '.json'), 999 * 3600000);

  const fresh = runaway.readCounter({ sessionId: 's-new', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(fresh.launched, 0, 'a new session resets — the old pin does not leak headroom forward');
});

// ── CLI: reserve (Implement-Codex R1 F1, 7th round) ──────────────────────────
//
// reserveWorkers used to be reachable ONLY through resolveFleet's injected clamp, and
// resolveFleet only runs behind work.md's 4-way parallel guard. Every single-worker
// route launched an agent the cap never saw. This CLI is the common pre-launch
// boundary Step 3.route now calls.

function captureStdout(fn) {
  const out = [];
  const w = process.stdout.write;
  process.stdout.write = function (s) { out.push(s); return true; };
  let code;
  try { code = fn(); } finally { process.stdout.write = w; }
  return { code: code, text: out.join('') };
}

test('CLI reserve: grants and records at the common pre-launch boundary', function () {
  const p = tmpState();
  const r = captureStdout(function () {
    return runaway.runCli(['reserve', '--n', '1', '--session', 's', '--state-path', p]);
  });
  assert.equal(r.code, 0, 'granted is the ANSWER, not an error condition — always exit 0');
  const j = JSON.parse(r.text);
  assert.equal(j.granted, 1);
  assert.ok(j.reservationId, 'a recorded launch must hand back a handle to reconcile');
  assert.equal(readCounter({ sessionId: 's', statePath: p, env: {} }).launched, 1);
});

test('CLI reserve: at cap it grants 0 with no id — the caller must go inline', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '2' };
  bumpCounter({ sessionId: 's', delta: 2, statePath: p, env: env });
  const prev = process.env.MCCP_ORCHESTRATION_MAX_AGENTS;
  process.env.MCCP_ORCHESTRATION_MAX_AGENTS = '2';
  let r;
  try {
    r = captureStdout(function () {
      return runaway.runCli(['reserve', '--n', '1', '--session', 's', '--state-path', p]);
    });
  } finally {
    if (prev === undefined) delete process.env.MCCP_ORCHESTRATION_MAX_AGENTS;
    else process.env.MCCP_ORCHESTRATION_MAX_AGENTS = prev;
  }
  const j = JSON.parse(r.text);
  assert.equal(j.granted, 0, 'the cap is spent');
  assert.equal(j.reservationId, null, 'nothing recorded → nothing to reconcile → no id to invent');
  assert.equal(j.reason, REASONS.CAP_EXHAUSTED);
  assert.equal(readCounter({ sessionId: 's', statePath: p, env: env }).launched, 2,
    'a refused reserve must not move the total');
});

test('CLI reserve: --n garbage reserves nothing (never guess a launch count)', function () {
  const p = tmpState();
  assert.notEqual(runaway.runCli(['reserve', '--n', 'abc', '--state-path', p]), 0);
  assert.notEqual(runaway.runCli(['reserve', '--n', '0', '--state-path', p]), 0);
  assert.notEqual(runaway.runCli(['reserve', '--state-path', p]), 0);
  assert.equal(readCounter({ sessionId: 's', statePath: p, env: {} }).launched, 0);
});

// ── CLI: mark-debt (Implement-Codex R1 F2, 7th round) ────────────────────────

test('CLI mark-debt: pins a reservation BEFORE its launch', function () {
  const p = tmpState();
  const env = { MCCP_ORCHESTRATION_MAX_AGENTS: '24', MCCP_ORCHESTRATION_RESERVATION_LEASE_MS: '1' };
  const res = reserveWorkers({ sessionId: 's', requestedN: 4, statePath: p, env: env });
  const r = captureStdout(function () {
    return runaway.runCli(['mark-debt', '--reservation', res.reservationId, '--n', '4',
      '--state-path', p]);
  });
  assert.equal(r.code, 0);
  // The pin is what makes a post-launch crash survivable: fan-out has no pre-launch
  // boundary, so the marker must already exist when Workflow is called.
  const view = readCounter({ sessionId: 's', statePath: p, env: env, now: Date.now() + 5000 });
  assert.equal(view.launched, 4, 'lease elapsed, but the pin holds the real launches');
});

test('CLI mark-debt: missing --reservation is a usage error, not a silent no-op', function () {
  assert.notEqual(runaway.runCli(['mark-debt', '--n', '4']), 0);
});
