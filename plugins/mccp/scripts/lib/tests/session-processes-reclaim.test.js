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

// Models a process that HONOURS SIGTERM: once signalled, it is gone. `isAlive`
// belongs to the recorder because the two answers have to agree — a stub that
// reports "signalled" and "still alive" forever is a process that IGNORES
// SIGTERM. That is a real case with its own outcome (`termination_timeout`,
// asserted below), not something a happy-path case should get by accident.
function recorder() {
  const killed = [];
  return {
    killed,
    kill: (pid) => { killed.push(pid); },
    isAlive: (pid) => !killed.includes(pid),
  };
}

// The image a healthy mccp-spawned process reports. It is a REQUIRED axis: a
// probe result without one adjudicates as `identity_unverifiable`, so every
// stub that means "this really is our process" has to carry it.
const NODE_IMG = process.platform === 'win32'
  ? 'C:\\Program Files\\nodejs\\node.exe'
  : '/usr/bin/node';

function okProbe(repo) {
  return () => ({
    startedAtMs: START_MS,
    commandLine: 'node "' + execPathFor(repo) + '"',
    execImage: NODE_IMG,
  });
}

function run(repo, over) {
  const k = (over && over.recorder) || recorder();
  const res = sp.reclaimSession(Object.assign({
    repoRoot: repo,
    sessionId: SID,
    env: {},
    kill: k.kill,
    isAlive: k.isAlive,
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
    // Image and path both correct — the START TIME is the axis under test.
    probeProcess: () => ({
      startedAtMs: START_MS + 3000,
      commandLine: 'node "' + execPathFor(repo) + '"',
      execImage: NODE_IMG,
    }),
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
    // Image and start time both fine — the PATH is the axis under test.
    probeProcess: () => ({
      startedAtMs: START_MS + delta,
      commandLine: 'node /somewhere/else/dashboard-server.js',
      execImage: NODE_IMG,
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
  const {
    probeProcess, normPath, isNodeInterpreterImage,
    IDENTITY_TOLERANCE_MS, PROBE_TIMEOUT_MS,
  } = require('../session-processes');

  if (process.platform !== 'win32') {
    let psOk = true;
    try {
      // The SAME field list the probe uses. Preflighting a shorter one would
      // green-light a platform where `comm` is unsupported and then fail in the
      // probe itself.
      execFileSync('ps', ['-o', 'etimes=,comm=,args=', '-p', String(process.pid)],
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

  // The image axis, against the real OS. Every other test that exercises it
  // hands the predicate a string; this one gets the value the kernel reports for
  // a process we KNOW is node — us. If the platform stops supplying it, every
  // record folds to `identity_unverifiable` and reclaim quietly stops working,
  // so a null here is a defect rather than an environment quirk.
  assert.notStrictEqual(p.execImage, null,
    'the real OS probe must report an executable image on this platform');
  assert.ok(isNodeInterpreterImage(p.execImage),
    'the image of THIS process must read as a node interpreter — execImage='
    + JSON.stringify(p.execImage) + ' execPath=' + JSON.stringify(process.execPath));
});

// ── 9f/9g — the probe branches this machine never executes (santa-loop R8) ───
//
// 9d only ever exercises the branch for the platform it runs on, so on win32 the
// POSIX parse is dead code at test time and vice versa. Both branches gained a
// field in R8, and a parse that silently mis-slices produces an `execImage` that
// is really a command-line fragment — which fails closed but kills reclaim
// coverage without saying so. `platform`, `execFileSync` and `readlinkSync` are
// all injectable, so both branches are reachable from either host.

test('9f — the POSIX probe parses THREE fields and lets /proc/<pid>/exe win', () => {
  const { probeProcess } = require('../session-processes');
  const args = 'node /repo/plugins/mccp/scripts/lib/dashboard-server.js --port 7333';

  // `comm` alone: what macOS and BSD give us.
  const viaComm = probeProcess(4242, {
    platform: 'linux',
    execFileSync: (bin, argv) => {
      assert.strictEqual(bin, 'ps');
      assert.ok(argv.includes('etimes=,comm=,args='),
        'the field list must match what the parser slices: ' + JSON.stringify(argv));
      return '  120 node ' + args + '\n';
    },
    readlinkSync: () => { throw new Error('ENOENT'); },
  });
  assert.strictEqual(viaComm.execImage, 'node', 'comm is the image when there is no procfs');
  assert.strictEqual(viaComm.commandLine, args,
    'args must survive intact — a greedy comm capture would eat the first token');
  assert.ok(Math.abs((Date.now() - 120 * 1000) - viaComm.startedAtMs) < 5000);

  // procfs present: the kernel's answer outranks a `comm` that lies.
  const viaProc = probeProcess(4242, {
    platform: 'linux',
    execFileSync: () => '  120 evil-renamed ' + args + '\n',
    readlinkSync: (p) => {
      assert.strictEqual(p, '/proc/4242/exe');
      return '/usr/bin/node';
    },
  });
  assert.strictEqual(viaProc.execImage, '/usr/bin/node',
    '/proc/<pid>/exe must override comm — comm is settable via prctl and truncated at 15 chars');
});

test('9g — an empty win32 ExecutablePath yields a null image, never a shifted field', () => {
  const { probeProcess } = require('../session-processes');
  const cmd = 'node "C:\\repo\\x.js" --port 7333';

  // The reason the win32 probe emits one tab-delimited line instead of one field
  // per line: with line-per-field, an empty ExecutablePath prints nothing and the
  // command line slides up into the image slot — which would then be tested for
  // "is this node" and, since the command line starts with `node`, PASS.
  const empty = probeProcess(4242, {
    platform: 'win32',
    execFileSync: () => '1700000000000||' + cmd + '\n',
  });
  assert.strictEqual(empty.execImage, null,
    'an absent image must be null (-> identity_unverifiable), never the command line');
  assert.strictEqual(empty.commandLine, cmd, 'the command line must still land in its own field');

  const full = probeProcess(4242, {
    platform: 'win32',
    execFileSync: () => '1700000000000|C:\\Program Files\\nodejs\\node.exe|' + cmd + '\n',
  });
  assert.strictEqual(full.execImage, 'C:\\Program Files\\nodejs\\node.exe',
    'an image containing spaces must not be split');
  assert.strictEqual(full.commandLine, cmd);

  // The delimiter is `|` and not a tab precisely because NTFS PERMITS 0x09 in a
  // file name. A binary under a tabbed directory must parse, not split wrong.
  const tabbed = probeProcess(4242, {
    platform: 'win32',
    execFileSync: () => '1700000000000|C:\\odd\tdir\\node.exe|' + cmd + '\n',
  });
  assert.strictEqual(tabbed.execImage, 'C:\\odd\tdir\\node.exe',
    'a tab inside the image path must not act as a delimiter');
  assert.strictEqual(tabbed.commandLine, cmd);

  // `|` is forbidden in a Windows file name but perfectly legal in a command
  // line. Only the FIRST two delimiters are read, so the rest must survive.
  const piped = probeProcess(4242, {
    platform: 'win32',
    execFileSync: () => '1700000000000|C:\\nodejs\\node.exe|node x.js --re "a|b|c"\n',
  });
  assert.strictEqual(piped.execImage, 'C:\\nodejs\\node.exe');
  assert.strictEqual(piped.commandLine, 'node x.js --re "a|b|c"',
    'pipes past the second delimiter belong to the command line, not to the split');

  // A malformed line (missing the second delimiter) is null, not a partial read.
  assert.strictEqual(probeProcess(4242, {
    platform: 'win32', execFileSync: () => '1700000000000|only-one-delimiter\n',
  }), null, 'a short line must fail closed rather than yield a half-parsed record');
});

// ── 9e — unreadable sibling evidence blocks the kill (santa-loop R3) ────────
//
// End-to-end companion to the predicate-level cases. The borrowed dashboard is
// the scenario: session B is still using A's server, B's reuse record is
// unreadable, and A ends with MCCP_RECLAIM_OUTLIVES=1. Before the fix A killed
// the shared server and reported complete:true.

test('9e — a corrupt sibling reuse record stops the kill instead of vanishing', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242, kind: 'dashboard-server', lifetime: 'outlives-session' });
  const bDir = sp.sessionDir(repo, 'sess-B');
  fs.mkdirSync(bDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(bDir, '4242.json'), '{ CORRUPT');

  const { res, killed } = run(repo, {
    env: { MCCP_RECLAIM_OUTLIVES: '1' },
    collectSiblingReuse: undefined,      // the REAL collector must run
    probeProcess: okProbe(repo),
    budgetMs: 60000,
  });

  assert.deepStrictEqual(killed, [],
    'the borrowed dashboard must survive: unreadable evidence is not evidence of absence');
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'sibling_evidence_unreadable' }],
    'and the reason must name what went wrong, not fold into a generic skip');
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
  const k = recorder();
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    // Burns 200ms, then the process is gone. The burn is the KILL cost this
    // case measures; exit confirmation must not add to it, which is why the
    // signalled pid stops answering as alive.
    kill: (pid) => { const end = Date.now() + 200; while (Date.now() < end) { /* burn */ } k.kill(pid); },
    isAlive: k.isAlive,
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
    probeProcess: () => {
      probes += 1;
      return {
        startedAtMs: START_MS,
        commandLine: 'node "' + execPathFor(repo) + '"',
        execImage: NODE_IMG,
      };
    },
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
      return {
        startedAtMs: START_MS,
        commandLine: 'node "' + execPathFor(repo) + '"',
        execImage: NODE_IMG,
      };
    },
  });
  assert.strictEqual(probes, 2, 'two distinct pids → two probes, never more');
});

test('11c — the sibling collector is re-invoked per record, and again before each signal', () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 4; i++) seed(repo, SID, { pid: 300 + i });
  let calls = 0;
  run(repo, { collectSiblingReuse: () => { calls += 1; return []; } });
  // TWO per candidate, not one: the reclaimability table sweeps, and then 14a's
  // re-check sweeps again immediately before the signal — the table's sweep
  // predates the identity probe, which can burn 5s on win32. A single snapshot
  // reused across every record would still show 1.
  assert.strictEqual(calls, 8, 'one snapshot reused across records would show 1');
});

test('12 — reclaimed records are removed and unreclaimed ones leave an evidence file', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 100 });
  seed(repo, SID, { pid: 200 });
  const dir = sp.sessionDir(repo, SID);
  const k = recorder();
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: (pid) => {
      if (pid === 200) { const e = new Error('x'); e.code = 'EPERM'; throw e; }
      k.kill(pid);
    },
    isAlive: k.isAlive,
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

// ── 13: signal delivery is NOT termination (PR-Codex HIGH, 2026-08-14) ───────
//
// `process.kill` returns when the signal was DELIVERED. On POSIX a SIGTERM can
// be caught, ignored, or handled slowly, so the return value says nothing about
// whether the process is gone. The original implementation pushed the pid onto
// reclaimed[] and unlinked the record right there — reporting a kill that had
// not happened and destroying the only evidence a later session could retry
// from. These cases pin the four outcomes that replaced it.

test('13a — a process that IGNORES SIGTERM is not reported reclaimed and keeps its record', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const dir = sp.sessionDir(repo, SID);
  const killed = [];
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: (pid) => { killed.push(pid); },   // signalled, and still alive after
    isAlive: () => true,
    probeProcess: okProbe(repo),
    collectSiblingReuse: () => [],
    budgetMs: 60000, probeTimeoutMs: 20, termConfirmMaxMs: 60,
  });

  assert.deepStrictEqual(killed, [4242], 'the signal IS sent — this is not a skip');
  assert.deepStrictEqual(res.reclaimed, [],
    'delivery is not termination: nothing may be reported reclaimed');
  assert.deepStrictEqual(res.unreclaimed, [{ pid: 4242, reason: 'termination_timeout' }]);
  assert.ok(fs.existsSync(path.join(dir, '4242.json')),
    'the record MUST survive — a later session has to be able to retry and diagnose it');
  const evidence = JSON.parse(fs.readFileSync(path.join(dir, '4242.unreclaimed.json'), 'utf8'));
  assert.strictEqual(evidence.reason, 'termination_timeout');
});

test('13b — a process that exits shortly after the signal IS reclaimed (the poll waits)', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const dir = sp.sessionDir(repo, SID);
  let aliveChecks = 0;
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: () => {},
    // Alive for the reclaimability check and the first few polls, then gone —
    // a process that handles SIGTERM instead of dying instantly.
    isAlive: () => { aliveChecks += 1; return aliveChecks < 4; },
    probeProcess: okProbe(repo),
    collectSiblingReuse: () => [],
    budgetMs: 60000, probeTimeoutMs: 20, termConfirmMaxMs: 2000,
  });

  assert.deepStrictEqual(res.reclaimed, [4242], 'a confirmed exit is a reclaim');
  assert.deepStrictEqual(res.unreclaimed, []);
  assert.ok(!fs.existsSync(path.join(dir, '4242.json')), 'confirmed → record dropped');
});

test('13c — a pid recycled onto another process counts as a confirmed exit, not a timeout', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const dir = sp.sessionDir(repo, SID);
  let probes = 0;
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: () => {},
    isAlive: () => true,               // the PID answers — but it is not ours any more
    probeProcess: () => {
      probes += 1;
      // First probe is the kill decision (must match, or nothing is signalled).
      // The confirmation probe sees a different process wearing the same pid.
      return probes === 1
        ? { startedAtMs: START_MS, commandLine: 'node "' + execPathFor(repo) + '"', execImage: NODE_IMG }
        : { startedAtMs: START_MS + 900000, commandLine: 'node "' + execPathFor(repo) + '"', execImage: NODE_IMG };
    },
    collectSiblingReuse: () => [],
    budgetMs: 60000, probeTimeoutMs: 20, termConfirmMaxMs: 60,
  });

  assert.ok(probes >= 2, 'the confirmation must take a FRESH probe, not the memoised one');
  assert.deepStrictEqual(res.reclaimed, [4242],
    'our process is provably gone — the pid answering belongs to someone else');
  assert.ok(!fs.existsSync(path.join(dir, '4242.json')));
});

test('13d — an unverifiable identity at the deadline is its own reason, not a timeout', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const dir = sp.sessionDir(repo, SID);
  let probes = 0;
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: () => {},
    isAlive: () => true,
    probeProcess: () => {
      probes += 1;
      // The platform stops answering WHAT is under the pid. "I failed to check"
      // is neither "still running" nor "gone", and must not be folded into either.
      return probes === 1
        ? { startedAtMs: START_MS, commandLine: 'node "' + execPathFor(repo) + '"', execImage: NODE_IMG }
        : null;
    },
    collectSiblingReuse: () => [],
    budgetMs: 60000, probeTimeoutMs: 20, termConfirmMaxMs: 60,
  });

  assert.deepStrictEqual(res.reclaimed, [], 'unverifiable must never read as reclaimed');
  assert.deepStrictEqual(res.unreclaimed, [{ pid: 4242, reason: 'termination_unverified' }]);
  assert.ok(fs.existsSync(path.join(dir, '4242.json')), 'record survives');
});

test('13e — one process that refuses to die cannot starve the rest of the sweep', () => {
  const repo = tmpRepo();
  for (let i = 1; i <= 4; i++) seed(repo, SID, { pid: 100 + i });
  const t0 = Date.now();
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: () => {},
    isAlive: () => true,              // every one of them ignores the signal
    probeProcess: okProbe(repo),
    collectSiblingReuse: () => [],
    budgetMs: 60000, probeTimeoutMs: 20, termConfirmMaxMs: 60,
  });
  const elapsed = Date.now() - t0;

  assert.strictEqual(res.attempted, 4);
  assert.strictEqual(res.unreclaimed.length, 4, 'each one is recorded, none silently dropped');
  assert.ok(elapsed < 2000,
    'the per-record cap bounds the wait — 4 records took ' + elapsed + 'ms');
});

// ── 14: the two PR-Codex round-2 findings ────────────────────────────────────

test('14a — a sibling that appears DURING the identity probe still blocks the kill', () => {
  // The sweep inside isReclaimableBy runs before the probe, and the probe can
  // burn 5s on win32. A borrower registering inside that window was invisible to
  // a check made five seconds earlier — and under MCCP_RECLAIM_OUTLIVES=1 that
  // is a live server killed under a session using it.
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const borrower = {
    schema: 1, pid: 4242, host: os.hostname(), session_id: 'sess-B', session_pid: 1234,
    started_at: new Date(START_MS).toISOString(), proc_started_at_ms: START_MS,
    exec_path: execPathFor(repo), repo_root: repo,
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
  };
  let probed = false;
  let borrowedYet = false;
  const killed = [];
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: (pid) => { killed.push(pid); },
    isAlive: () => true,
    // The borrow lands while the probe is in flight — after the table's sweep.
    probeProcess: () => {
      probed = true;
      borrowedYet = true;
      return { startedAtMs: START_MS, commandLine: 'node "' + execPathFor(repo) + '"', execImage: NODE_IMG };
    },
    collectSiblingReuse: () => (borrowedYet ? [borrower] : []),
    budgetMs: 60000, probeTimeoutMs: 20, termConfirmMaxMs: 60,
  });

  assert.ok(probed, 'the probe must actually have run — otherwise the window is not exercised');
  assert.deepStrictEqual(killed, [],
    'the re-check immediately before the signal must see the borrow the table missed');
  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'in_use_by_live_session' }]);
});

test('14b — a record left because we COULD NOT check is not reported as a clean sweep', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const res = sp.reclaimSession({
    repoRoot: repo, sessionId: SID, env: {},
    kill: () => { throw new Error('must not be reached'); },
    isAlive: () => true,
    probeProcess: () => null,          // the platform will not say what this pid is
    collectSiblingReuse: () => [],
    budgetMs: 60000, probeTimeoutMs: 20,
  });

  assert.deepStrictEqual(res.skipped, [{ pid: 4242, reason: 'identity_unverifiable' }]);
  assert.deepStrictEqual(res.unverified, [{ pid: 4242, reason: 'identity_unverifiable' }],
    'a live owned process we failed to verify must reach a human, not just skipped[]');
});

test('14c — expected policy exclusions do NOT raise the unverified alarm', () => {
  // If routine exclusions tripped the same alarm, the alarm would fire on every
  // normal session and stop meaning anything.
  for (const over of [
    { host: 'some-other-host' },
    { lifetime: 'outlives-session' },
    { kind: 'handoff-session', exec_path: 'powershell.exe' },
  ]) {
    const repo = tmpRepo();
    seed(repo, SID, Object.assign({ pid: 4242 }, over));
    const { res } = run(repo, { probeProcess: okProbe(repo) });
    assert.strictEqual(res.skipped.length, 1, 'still skipped: ' + JSON.stringify(over));
    assert.deepStrictEqual(res.unverified, [],
      'routine policy exclusion must stay quiet: ' + JSON.stringify(over));
  }
});

test('14d — unreadable sibling evidence counts as unverified, not as a clean skip', () => {
  const repo = tmpRepo();
  seed(repo, SID, { pid: 4242 });
  const corrupt = [];
  corrupt.incomplete = true;
  const { res, killed } = run(repo, { collectSiblingReuse: () => corrupt });
  assert.deepStrictEqual(killed, []);
  assert.deepStrictEqual(res.unverified, [{ pid: 4242, reason: 'sibling_evidence_unreadable' }]);
});
