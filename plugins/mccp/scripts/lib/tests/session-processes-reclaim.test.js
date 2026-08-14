'use strict';

// session-process-reclaim M2 — "오살 0" is a TEST, not a claim.
//
// Every case injects a killer and asserts the EXACT set of pids it received.
// An implementation that kills something extra fails here; an implementation
// that quietly kills nothing also fails, because case 1 requires a hit.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const sp = require('../session-processes');

const SID = 'sess-A';
const START_MS = 1700000000000;

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-reclaim-'));
  return fs.realpathSync.native(dir);
}

function execPathFor(repo) {
  return path.join(repo, 'plugins', 'mccp', 'scripts', 'lib', 'dashboard-server.js');
}

// Written straight to disk rather than through register(), so a case can pin a
// host / repo_root / proc_started_at_ms that register() would never produce.
function seed(repo, sid, over) {
  const dir = sp.sessionDir(repo, sid);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const record = Object.assign({
    schema: 1,
    pid: 4242,
    host: os.hostname(),
    session_id: sid,
    session_pid: 999,
    started_at: new Date(START_MS).toISOString(),
    proc_started_at_ms: START_MS,
    exec_path: execPathFor(repo),
    repo_root: repo,
    kind: 'dashboard-server',
    lifetime: 'session',
    role: 'owner',
  }, over || {});
  fs.writeFileSync(path.join(dir, record.pid + '.json'), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

function recorder() {
  const killed = [];
  return {
    killed,
    kill: (pid) => { killed.push(pid); },
  };
}

function okProbe(repo) {
  return () => ({ startedAtMs: START_MS, commandLine: 'node "' + execPathFor(repo) + '"' });
}

function run(repo, over) {
  const k = (over && over.recorder) || recorder();
  const res = sp.reclaimSession(Object.assign({
    repoRoot: repo,
    sessionId: SID,
    env: {},
    kill: k.kill,
    isAlive: () => true,
    probeProcess: okProbe(repo),
    collectSiblingReuse: () => [],
    budgetMs: 60000,
  }, over || {}));
  return { res, killed: k.killed };
}

// ── 1: the happy path must actually kill ─────────────────────────────────────

test('1 — our own session-lifetime process is reclaimed', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const { res, killed } = run(repo);
  assert.deepStrictEqual(killed, [4242]);
  assert.deepStrictEqual(res.reclaimed, [4242]);
  assert.strictEqual(res.attempted, 1);
  assert.strictEqual(res.complete, true);
});

// ── 2–7: everything that must NOT be killed ─────────────────────────────────

test('2 — another session\'s record in the same tree is never touched (UI1/UI2)', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  seed(repo, 'sess-OTHER', { pid: 5555, session_id: 'sess-OTHER' });
  const { killed } = run(repo);
  assert.deepStrictEqual(killed, [4242], 'the sibling session directory is not even read for kills');
  assert.ok(fs.existsSync(path.join(sp.sessionDir(repo, 'sess-OTHER'), '5555.json')));
});

test('3 — a cross-host record is skipped', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242, host: 'some-other-host' });
  const { res, killed } = run(repo);
  assert.deepStrictEqual(killed, []);
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'cross_host' }]);
});

test('4 — a cross-repo record is skipped', () => {
  const repo = tmpRepo();
  const other = tmpRepo();
  seed(repo, SID, { pid: 4242, repo_root: other });
  const { res, killed } = run(repo);
  assert.deepStrictEqual(killed, []);
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'cross_repo' }]);
});

test('5 — outlives-session is skipped by default and reclaimed only under the toggle', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242, lifetime: 'outlives-session' });
  const off = run(repo);
  assert.deepStrictEqual(off.killed, []);
  assert.deepStrictEqual(off.res.skipped, [{ pid: 4242, reason: 'lifetime_outlives_session' }]);

  const repo2 = tmpRepo();
  seed(repo2, SID, { pid: 4242, lifetime: 'outlives-session' });
  const on = run(repo2, { env: { MCCP_RECLAIM_OUTLIVES: '1' }, probeProcess: okProbe(repo2) });
  assert.deepStrictEqual(on.killed, [4242], 'MCCP_RECLAIM_OUTLIVES=1 is the operator opt-in for UI7');
});

test('6 — a handoff session survives even with MCCP_RECLAIM_OUTLIVES=1', () => {
  const repo = tmpRepo();
  seed(repo, SID, {
    pid: 4242, kind: 'handoff-session', lifetime: 'outlives-session', exec_path: 'powershell.exe',
  });
  const { res, killed } = run(repo, { env: { MCCP_RECLAIM_OUTLIVES: '1' } });
  assert.deepStrictEqual(killed, [], 'outliving this session is the entire reason a handoff exists');
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'handoff_never_reclaimed' }]);
});

test('7 — a live sibling reuse record blocks the kill', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const sibling = {
    schema: 1, pid: 4242, host: os.hostname(), session_id: 'sess-B', session_pid: 1234,
    started_at: new Date(START_MS).toISOString(), proc_started_at_ms: START_MS,
    exec_path: execPathFor(repo), repo_root: repo,
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
  };
  const { res, killed } = run(repo, { collectSiblingReuse: () => [sibling] });
  assert.deepStrictEqual(killed, []);
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'in_use_by_live_session' }]);
});

// ── 8: the sibling sweep is re-run, not snapshotted ─────────────────────────

test('8 — a reuse record that appears only at kill time still blocks (no snapshot caching)', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  seed(repo, SID, { pid: 200 });

  let calls = 0;
  const lateSibling = {
    schema: 1, pid: 200, host: os.hostname(), session_id: 'sess-B', session_pid: 1234,
    started_at: new Date(START_MS).toISOString(), proc_started_at_ms: START_MS,
    exec_path: execPathFor(repo), repo_root: repo,
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
  };
  const { res, killed } = run(repo, {
    collectSiblingReuse: () => { calls += 1; return calls === 1 ? [] : [lateSibling]; },
  });

  assert.ok(calls >= 2, 'the collector must be re-invoked per record, not cached');
  assert.deepStrictEqual(killed, [100],
    'a one-shot snapshot would have judged 200 against the empty first result and killed it');
  assert.deepStrictEqual(res.skipped, [{ pid: 200, reason: 'in_use_by_live_session' }]);
});

// ── 9*: PID reuse — the PRD's Critical scenario ─────────────────────────────

test('9 — a recycled PID whose start time is far off is NOT killed', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const { res, killed } = run(repo, {
    probeProcess: () => ({ startedAtMs: START_MS + 3000, commandLine: 'node "' + execPathFor(repo) + '"' }),
  });
  assert.deepStrictEqual(killed, []);
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'identity_mismatch' }]);
});

test('9a — a recycled PID INSIDE the tolerance but matching only the basename is NOT killed', () => {
  // The exact counter-example the whole-path rule exists for. A basename compare
  // passes this case, so a regression to basename turns this test red.
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const delta = process.platform === 'win32' ? 300 : 1200;
  const { res, killed } = run(repo, {
    probeProcess: () => ({
      startedAtMs: START_MS + delta,
      commandLine: 'node /somewhere/else/dashboard-server.js',
    }),
  });
  assert.deepStrictEqual(killed, [], 'time axis alone does not establish identity');
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'identity_mismatch' }]);
});

test('9b — an unverifiable probe is NOT killed', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const { res, killed } = run(repo, { probeProcess: () => null });
  assert.deepStrictEqual(killed, []);
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'identity_unverifiable' }]);
});

test('9c — a corrupt record is skipped and marks the sweep incomplete', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  fs.writeFileSync(path.join(sp.sessionDir(repo, SID), '7777.json'), '{ broken', 'utf8');
  const { res, killed } = run(repo);
  assert.deepStrictEqual(killed, [4242]);
  assert.strictEqual(res.complete, false,
    'complete=false is the signal that "no record" cannot be read as "reclaimed"');
});

test('9d — probeProcess against a REAL process, called directly (no injection point)', (t) => {
  // Reached through the module export rather than reclaimSession, because
  // reclaimSession has a probe injection point and a mock there would let §D15
  // pass without ever touching the OS.
  const { probeProcess, normPath, IDENTITY_TOLERANCE_MS, PROBE_TIMEOUT_MS } = require('../session-processes');

  if (process.platform !== 'win32') {
    let psOk = true;
    try {
      execFileSync('ps', ['-o', 'etimes=,args=', '-p', String(process.pid)],
        { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (_) { psOk = false; }
    if (!psOk) {
      t.skip('`ps -o etimes=` is not supported here (macOS ps lacks etimes) — '
        + 'skipping with a stated reason rather than passing quietly');
      return;
    }
  }

  const t0 = Date.now();
  const p = probeProcess(process.pid);
  const elapsed = Date.now() - t0;

  if (p === null && elapsed >= PROBE_TIMEOUT_MS) {
    assert.fail('probeProcess timed out after ' + elapsed + 'ms (cap ' + PROBE_TIMEOUT_MS
      + 'ms). A probe that cannot finish inside its cap is unusable inside the '
      + 'SessionEnd budget — this is a defect, not an environment skip.');
  }
  // win32 is never skipped: UI5 makes it the priority platform, and a null here
  // means the CIM probe is broken, not that the environment is unusual.
  assert.notStrictEqual(p, null, 'the real OS probe must succeed on this platform');

  const selfStart = Math.round(Date.now() - process.uptime() * 1000);
  assert.ok(Math.abs(p.startedAtMs - selfStart) <= IDENTITY_TOLERANCE_MS,
    'axis 2 must hold against real OS output: delta=' + Math.abs(p.startedAtMs - selfStart)
    + 'ms vs tolerance=' + IDENTITY_TOLERANCE_MS + 'ms');
  assert.ok(normPath(p.commandLine).includes(normPath(process.execPath)),
    'axis 1 must hold against real OS output — if normalization breaks, reclaim '
    + 'dies out silently and this is the assertion that says so. commandLine='
    + JSON.stringify(p.commandLine));
});

// ── 10–12: kill outcomes, budget, bookkeeping ───────────────────────────────

test('10 — ESRCH counts as reclaimed, EPERM does NOT (they are not the same outcome)', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  seed(repo, SID, { pid: 200 });
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: (pid) => {
      const err = new Error('x');
      err.code = pid === 100 ? 'ESRCH' : 'EPERM';
      throw err;
    },
    isAlive: () => true,
    probeProcess: okProbe(repo),
    collectSiblingReuse: () => [],
    budgetMs: 60000,
  });
  assert.deepStrictEqual(res.reclaimed, [100], 'ESRCH — already gone is the outcome we wanted');
  assert.deepStrictEqual(res.unreclaimed, [{ pid: 200, reason: 'eperm' }],
    'EPERM — the process is still there and we could not touch it');
  assert.strictEqual(res.attempted, 2);
});

test('11 — a zero budget kills nobody and records every record as budget_exceeded', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  seed(repo, SID, { pid: 200 });
  const { res, killed } = run(repo, { budgetMs: 0 });
  assert.deepStrictEqual(killed, []);
  assert.strictEqual(res.budgetExceeded, true);
  assert.deepStrictEqual(res.unreclaimed.map((u) => u.reason), ['budget_exceeded', 'budget_exceeded']);
});

// ── 11c — the env budget cannot walk out of the SessionEnd hook timeout ─────
//
// Round-1 santa-loop finding. hooks.json registers session:end:marker with
// timeout:10s. MCCP_RECLAIM_BUDGET_MS was accepted unbounded and handed straight
// to the sweep, so a large value let the sweep be killed mid-flight AT the hook
// timeout — which destroys the `.unreclaimed.json` records that are the only
// evidence a partial sweep leaves behind.

test('11c — MCCP_RECLAIM_BUDGET_MS is clamped below the hook timeout, and only upward', () => {
  assert.ok(sp.MAX_BUDGET_MS < sp.HOOK_TIMEOUT_MS,
    'the ceiling must leave headroom for the rest of the hook');
  assert.ok(sp.DEFAULT_BUDGET_MS <= sp.MAX_BUDGET_MS,
    'the default must already satisfy the ceiling it is clamped to');

  assert.strictEqual(sp.parseBudgetMs({ MCCP_RECLAIM_BUDGET_MS: String(sp.MAX_BUDGET_MS + 1) }),
    sp.MAX_BUDGET_MS, 'one over the ceiling clamps');
  assert.strictEqual(sp.parseBudgetMs({ MCCP_RECLAIM_BUDGET_MS: '600000' }),
    sp.MAX_BUDGET_MS, 'a wildly large value clamps rather than being honoured');
  assert.strictEqual(sp.parseBudgetMs({ MCCP_RECLAIM_BUDGET_MS: String(sp.MAX_BUDGET_MS) }),
    sp.MAX_BUDGET_MS, 'exactly the ceiling is allowed');

  // LOWERING stays free: a shorter budget can only reclaim less, never mis-kill.
  assert.strictEqual(sp.parseBudgetMs({ MCCP_RECLAIM_BUDGET_MS: '0' }), 0);
  assert.strictEqual(sp.parseBudgetMs({ MCCP_RECLAIM_BUDGET_MS: '250' }), 250);

  // Junk falls back to the default rather than to "unbounded".
  for (const junk of ['', 'abc', '-5', undefined]) {
    assert.strictEqual(sp.parseBudgetMs({ MCCP_RECLAIM_BUDGET_MS: junk }), sp.DEFAULT_BUDGET_MS,
      'junk must not open the budget: ' + String(junk));
  }
});

test('11b — the budget is honoured against the real wall clock, not a mocked timer', () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 12; i++) seed(repo, SID, { pid: 100 + i });
  const t0 = Date.now();
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: () => { const end = Date.now() + 200; while (Date.now() < end) { /* burn */ } },
    isAlive: () => true,
    probeProcess: okProbe(repo),
    collectSiblingReuse: () => [],
    budgetMs: 600,
    // This case measures the KILL budget. The probe reservation is a separate
    // axis (asserted just below), and with the real win32 reservation of 5000ms
    // a 600ms budget could never start a probe at all.
    probeTimeoutMs: 20,
  });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, 'returned in ' + elapsed + 'ms — the budget must bound real time');
  assert.strictEqual(res.budgetExceeded, true);
  assert.ok(res.reclaimed.length >= 1 && res.reclaimed.length <= 5,
    'a few kills fit in 600ms at 200ms each, got ' + res.reclaimed.length);
  assert.strictEqual(res.reclaimed.length + res.unreclaimed.length, 12,
    'every record is accounted for in exactly one bucket');
});

test('11d — a probe is refused, not truncated, when its worst case will not fit the budget', () => {
  // The reservation is the WORST case (a probe can burn its full timeout), so a
  // budget smaller than one probe means zero kills — recorded as budget_exceeded
  // rather than silently skipped. This is what keeps the sweep inside the
  // SessionEnd budget instead of overrunning mid-probe.
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  let probes = 0;
  const { res, killed } = run(repo, {
    budgetMs: 500,
    probeTimeoutMs: 5000,
    probeProcess: () => { probes += 1; return { startedAtMs: START_MS, commandLine: 'node "' + execPathFor(repo) + '"' }; },
  });
  assert.strictEqual(probes, 0, 'a probe we cannot afford is never started');
  assert.deepStrictEqual(killed, []);
  assert.strictEqual(res.budgetExceeded, true);
  assert.deepStrictEqual(res.unreclaimed, [{ pid: 100, reason: 'budget_exceeded' }]);

  // …and the same record IS reclaimed once the budget can cover the probe.
  const repo2 = tmpRepo();
  seed(repo2, SID, { pid: 100 });
  const ok = run(repo2, { budgetMs: 60000, probeTimeoutMs: 5000, probeProcess: okProbe(repo2) });
  assert.deepStrictEqual(ok.killed, [100]);
});

test('11e — a repeated pid is probed once (win32 probes cost ~1s of the budget)', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  seed(repo, SID, { pid: 200 });
  let probes = 0;
  run(repo, {
    probeProcess: () => {
      probes += 1;
      return { startedAtMs: START_MS, commandLine: 'node "' + execPathFor(repo) + '"' };
    },
  });
  assert.strictEqual(probes, 2, 'two distinct pids → two probes, never more');
});

test('11c — the sibling collector is invoked once per candidate record', () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 4; i++) seed(repo, SID, { pid: 300 + i });
  let calls = 0;
  run(repo, { collectSiblingReuse: () => { calls += 1; return []; } });
  assert.strictEqual(calls, 4, 'one snapshot reused across records would show 1');
});

test('12 — reclaimed records are removed and unreclaimed ones leave an evidence file', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  seed(repo, SID, { pid: 200 });
  const dir = sp.sessionDir(repo, SID);
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: (pid) => { if (pid === 200) { const e = new Error('x'); e.code = 'EPERM'; throw e; } },
    isAlive: () => true,
    probeProcess: okProbe(repo),
    collectSiblingReuse: () => [],
    budgetMs: 60000,
  });
  assert.ok(!fs.existsSync(path.join(dir, '100.json')), 'reclaimed → record dropped');
  assert.ok(fs.existsSync(path.join(dir, '200.json')), 'unreclaimed → record survives for the next session');
  const evidence = path.join(dir, '200.unreclaimed.json');
  assert.ok(fs.existsSync(evidence), 'the failure is visible on disk, not just in stderr (UI6)');
  const body = JSON.parse(fs.readFileSync(evidence, 'utf8'));
  assert.strictEqual(body.reason, 'eperm');
  assert.ok(body.attempted_at);
  assert.deepStrictEqual(res.writeFailures, []);
});

test('an empty session directory is removed, a non-empty one is left for the next session', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  run(repo);
  assert.ok(!fs.existsSync(sp.sessionDir(repo, SID)), 'nothing left → directory goes');

  const repo2 = tmpRepo();
  seed(repo2, SID, { pid: 100, host: 'elsewhere' });
  run(repo2, { probeProcess: okProbe(repo2) });
  assert.ok(fs.existsSync(sp.sessionDir(repo2, SID)),
    'a skipped record must survive so the next SessionStart can see it');
});
