'use strict';

// session-process-reclaim M1 — registry core (Task 1) + SessionStart orphan
// sweep (Task 10).
//
// Assertion (0) is deliberately the FIRST thing that runs and is a hard failure
// rather than a skip: it pins the ordering requirement that `.gitignore` lands
// before the registry can ever exist. A skip would be a silent pass, which is
// exactly the window it exists to close.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const sp = require('../session-processes');

// plugins/mccp/scripts/lib/tests → repo root is five levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-sproc-'));
  return fs.realpathSync.native(dir);
}

function envWith(extra) {
  return Object.assign({ CLAUDE_CODE_SESSION_ID: 'sess-A', CLAUDE_PID: String(process.pid) }, extra || {});
}

function gitAvailable() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_) { return false; }
}

// A directory symlink on win32 needs elevation or developer mode — a JUNCTION
// does not, and resolves identically through realpath. These tests used to skip
// on win32 for that reason, which left the path-escape claim unverified on the
// one platform the PRD prioritizes. Junctions remove the excuse.
function linkDir(target, linkPath) {
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

// ── (0) gitignore precondition — runs before any registry write ──────────────

test('(0) .claude/state/session-processes/ is gitignored BEFORE any record can be written', (t) => {
  if (!gitAvailable()) {
    t.skip('git is not available on PATH — tracked/untracked has no meaning here');
    return;
  }
  let exitCode = null;
  try {
    execFileSync('git', ['check-ignore', '-q', '.claude/state/session-processes/x.json'],
      { cwd: REPO_ROOT, stdio: 'ignore', timeout: 10000 });
    exitCode = 0;
  } catch (err) {
    exitCode = typeof err.status === 'number' ? err.status : 1;
  }
  assert.strictEqual(exitCode, 0,
    'the registry path must be gitignored before Task 1 lands. `exec_path` holds an '
    + 'ABSOLUTE path (§D15 needs the whole string), so without this entry a record '
    + 'can be created untracked and swept into a commit.');
});

// ── Task 1: registration ────────────────────────────────────────────────────

test('(1) a normal registration keeps all 12 schema fields and stamps the real process start', () => {
  const repo = tmpRepo();
  const before = Math.round(Date.now() - process.uptime() * 1000);
  const r = sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename, env: envWith(),
  });
  assert.strictEqual(r.ok, true, 'register should succeed');

  const rec = JSON.parse(fs.readFileSync(r.path, 'utf8'));
  assert.deepStrictEqual(Object.keys(rec).sort(), [
    'exec_path', 'host', 'kind', 'lifetime', 'pid', 'proc_started_at_ms',
    'repo_root', 'role', 'schema', 'session_id', 'session_pid', 'started_at',
  ], 'exactly the 12 allowlisted fields');
  assert.strictEqual(sp.validateRecord(rec).ok, true);
  assert.strictEqual(rec.session_id, 'sess-A');
  assert.strictEqual(rec.session_pid, process.pid);
  // proc_started_at_ms is the PROCESS start, not the registration time.
  assert.ok(Math.abs(rec.proc_started_at_ms - before) <= 50,
    'proc_started_at_ms ≈ Date.now() - uptime*1000, got delta '
    + Math.abs(rec.proc_started_at_ms - before));
  assert.ok(rec.started_at !== rec.proc_started_at_ms, 'the two time axes are distinct');
});

test('(2) registration succeeds when the session directory does not exist yet (D8 regression)', () => {
  const repo = tmpRepo();
  assert.ok(!fs.existsSync(sp.registryDir(repo)), 'precondition: nothing exists yet');
  const r = sp.register(repo, {
    kind: 'plan-codex-runner', lifetime: 'session', role: 'owner',
    pid: process.pid, execPath: __filename, env: envWith(),
  });
  assert.strictEqual(r.ok, true,
    'writePrivate does tmp+rename only — without an explicit mkdir both <pid>.json '
    + 'and <pid>.failed.json ENOENT and neither success nor failure survives');
  assert.ok(fs.existsSync(r.path));
});

test('(3) file mode is 0600 and both registry directories are 0700', (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX mode bits are not meaningful on win32 (ACLs govern instead)');
    return;
  }
  const repo = tmpRepo();
  const r = sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename, env: envWith(),
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(fs.statSync(r.path).mode & 0o777, 0o600);
  // The directory mode is the real control: .gitignore governs git, not the
  // filesystem, and the file NAME alone leaks a pid.
  assert.strictEqual(fs.statSync(sp.registryDir(repo)).mode & 0o777, 0o700);
  assert.strictEqual(fs.statSync(sp.sessionDir(repo, 'sess-A')).mode & 0o777, 0o700);
});

test('(4) exec_path is stored verbatim as an absolute path, never normalized away', () => {
  const repo = tmpRepo();
  const r = sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename, env: envWith(),
  });
  assert.strictEqual(r.record.exec_path, __filename);
  assert.ok(!/outside-repo/.test(r.record.exec_path),
    'normalizing to <outside-repo> would make the §D15 whole-path compare fail structurally');
  assert.strictEqual(path.isAbsolute(r.record.exec_path), true);
});

test('(5) a self-registered exec_path is absolute AND points at a file that exists', () => {
  const repo = tmpRepo();
  const r = sp.register(repo, {
    kind: 'plan-codex-runner', lifetime: 'session', role: 'owner',
    pid: process.pid, execPath: __filename, env: envWith(),
  });
  assert.strictEqual(path.isAbsolute(r.record.exec_path), true);
  assert.strictEqual(fs.existsSync(r.record.exec_path), true);
  // Handoff records are exempt: exec_path is 'powershell.exe', which is not a
  // path — and handoff is excluded from reclaim before identity is consulted.
});

test('(6) no session identity → refused, and nothing is written', () => {
  const repo = tmpRepo();
  const r = sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename, env: {},
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no_session_identity');
  assert.ok(!fs.existsSync(sp.registryDir(repo)), 'no directory, no record, no failure file');
});

test('(7) CLAUDE_PID absent → session_pid degrades to null and registration still succeeds', () => {
  const repo = tmpRepo();
  const r = sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename,
    env: { CLAUDE_CODE_SESSION_ID: 'sess-A' },
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.record.session_pid, null);
});

test('(8) an out-of-enum kind/lifetime/role is refused and leaves a .failed.json', () => {
  for (const bad of [{ kind: 'nope' }, { lifetime: 'forever' }, { role: 'admin' }]) {
    const repo = tmpRepo();
    const r = sp.register(repo, Object.assign({
      kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
      pid: process.pid, execPath: __filename, env: envWith(),
    }, bad));
    assert.strictEqual(r.ok, false, JSON.stringify(bad) + ' must be refused');
    assert.strictEqual(r.reason, 'schema_invalid');
    const failed = path.join(sp.sessionDir(repo, 'sess-A'), process.pid + '.failed.json');
    assert.ok(fs.existsSync(failed), 'the refusal itself is recorded (UI6)');
    assert.ok(!fs.existsSync(path.join(sp.sessionDir(repo, 'sess-A'), process.pid + '.json')));
  }
});

test('(9) a malformed started_at fails validation', () => {
  const base = {
    schema: 1, pid: 123, host: 'h', session_id: 's', session_pid: null,
    started_at: 'not-a-date', proc_started_at_ms: 1, exec_path: '/x',
    repo_root: path.resolve('/r'), kind: 'dashboard-server',
    lifetime: 'session', role: 'owner',
  };
  assert.strictEqual(sp.validateRecord(base).reason, 'started_at');
  base.started_at = new Date().toISOString();
  assert.strictEqual(sp.validateRecord(base).ok, true);
});

test('(10) a corrupt record file lands in failures with incomplete=true and never throws', () => {
  const repo = tmpRepo();
  sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: 4242, execPath: __filename, env: envWith(),
  });
  fs.writeFileSync(path.join(sp.sessionDir(repo, 'sess-A'), '9999.json'), '{ not json', 'utf8');

  const l = sp.list(repo, 'sess-A', { isAlive: () => true });
  assert.strictEqual(l.failures.length, 1);
  assert.strictEqual(l.incomplete, true,
    'incomplete is what stops "no record" from being read as "reclaimed"');
  assert.strictEqual(l.records.length, 1);

  // Regression: the `alive` annotation must not enter the record's own key set.
  // When it did, every listed record failed the strict allowlist as
  // `unknown_field:alive` → `record_invalid` → reclaim skipped everything while
  // still reporting complete=true.
  assert.strictEqual(l.records[0].alive, true, 'alive is readable');
  assert.strictEqual(Object.keys(l.records[0]).includes('alive'), false,
    'but it is not one of the 12 schema fields');
  assert.strictEqual(sp.validateRecord(l.records[0]).ok, true,
    'a record that came back from list() must still validate');
});

test('(11) unregister is idempotent', () => {
  const repo = tmpRepo();
  sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: 4242, execPath: __filename, env: envWith(),
  });
  assert.deepStrictEqual(sp.unregister(repo, 'sess-A', 4242), { ok: true, removed: true });
  assert.deepStrictEqual(sp.unregister(repo, 'sess-A', 4242), { ok: true, removed: false });
  assert.deepStrictEqual(sp.unregister(repo, 'sess-A', 777), { ok: true, removed: false });
});

test('(12) three distinct pids register without loss (one file each, no lock needed)', () => {
  const repo = tmpRepo();
  for (const pid of [101, 202, 303]) {
    const r = sp.register(repo, {
      kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
      pid, execPath: __filename, env: envWith(),
    });
    assert.strictEqual(r.ok, true);
  }
  const l = sp.list(repo, 'sess-A', { isAlive: () => false });
  assert.deepStrictEqual(l.records.map((r) => r.pid).sort((a, b) => a - b), [101, 202, 303]);
});

test('(13) a traversal session id throws and writes nothing outside the registry', () => {
  const repo = tmpRepo();
  assert.throws(() => sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename,
    env: { CLAUDE_CODE_SESSION_ID: '../evil' },
  }), /single safe path segment/);
  assert.ok(!fs.existsSync(path.join(repo, '.claude', 'state', 'evil')));
  assert.ok(!fs.existsSync(path.join(repo, '.claude', 'state', 'session-processes', '..', 'evil')));
});

// ── (14b) unreadable sibling evidence is INCOMPLETE, never "absent" ─────────
//
// santa-loop R3. A borrower's reuse record is the only thing proving the process
// is still in use. Dropping an unreadable one silently was fail-OPEN: the guard
// vanished and the owner killed a live borrower's dashboard, reporting success.

test('(14b) an unreadable sibling record marks the sweep incomplete rather than absent', () => {
  const repo = tmpRepo();
  const dir = sp.sessionDir(repo, 'sess-B');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, '4242.json'), '{ CORRUPT');

  const got = sp.collectSiblingReuse(repo, 'sess-A');
  assert.deepStrictEqual(Array.from(got), [], 'nothing usable was collected');
  assert.strictEqual(got.incomplete, true,
    'but "we could not read it" must not be reported as "it is not there"');
});

test('(14c) a parseable NON-reuse record that fails schema does NOT block reclaim', () => {
  // The partition that keeps a future schema bump from freezing reclaim on every
  // legacy owner record: `role` is still readable, and a record that is
  // definitively not a reuse record was never a guard.
  const repo = tmpRepo();
  const dir = sp.sessionDir(repo, 'sess-B');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, '4242.json'),
    JSON.stringify({ role: 'owner', bogus: true }));

  const got = sp.collectSiblingReuse(repo, 'sess-A');
  assert.strictEqual(got.incomplete, false, 'a non-reuse record is not missing evidence');

  // …but the same file claiming role:'reuse' IS missing evidence.
  fs.writeFileSync(path.join(dir, '4242.json'),
    JSON.stringify({ role: 'reuse', bogus: true }));
  assert.strictEqual(sp.collectSiblingReuse(repo, 'sess-A').incomplete, true);
});

test('(14f) a SIBLING dir linking out of a clean registry is refused, not read', () => {
  // santa-loop R6, sixth instance of the same pattern: scanForeignOrphans has
  // carried a per-directory containment check since R1, and this sweep — which
  // reads records used as KILL EVIDENCE — did not. A clean root does not make
  // every directory under it clean.
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-sib-')));
  const repo = path.join(base, 'repo');
  const outside = path.join(base, 'OUTSIDE');
  fs.mkdirSync(sp.registryDir(repo), { recursive: true, mode: 0o700 });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, '4242.json'), JSON.stringify({
    schema: sp.SCHEMA_VERSION, pid: 4242, host: os.hostname(), session_id: 'sess-EVIL',
    session_pid: process.pid, started_at: new Date().toISOString(),
    proc_started_at_ms: Date.now(), exec_path: __filename, repo_root: repo,
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
  }));
  linkDir(outside, path.join(sp.registryDir(repo), 'sess-EVIL'));

  const got = sp.collectSiblingReuse(repo, 'sess-A');
  assert.deepStrictEqual(Array.from(got), [],
    'a record from outside the repo must never become reclaim evidence');
  assert.strictEqual(got.incomplete, true,
    'and refusing to read a sibling is "not checked", not "checked and clean"');
});

test('(14e) EVERY exit carries the incomplete flag — including path_escape', () => {
  // santa-loop R6. The path_escape exit returned a bare `[]`, so `.incomplete`
  // read back `undefined` — falsy, i.e. "checked, nobody is using it" — on the
  // single most safety-relevant exit of this function. Harmless only because
  // present callers happen to check containment first, which is a property of
  // the callers rather than of this function.
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cs-')));
  const repo = path.join(base, 'repo');
  const outside = path.join(base, 'OUTSIDE');
  fs.mkdirSync(path.join(repo, '.claude', 'state'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  linkDir(outside, sp.registryDir(repo));

  const got = sp.collectSiblingReuse(repo, 'sess-A');
  assert.strictEqual(got.incomplete, true,
    'an escaped registry is "we could not check", never "nothing is there"');
  assert.notStrictEqual(got.incomplete, undefined,
    'undefined is falsy and would read as complete — the flag must be SET, not absent');
});

test('(14d) an empty registry is absence, not incompleteness', () => {
  const got = sp.collectSiblingReuse(tmpRepo(), 'sess-A');
  assert.deepStrictEqual(Array.from(got), []);
  assert.strictEqual(got.incomplete, false,
    'ENOENT genuinely means no siblings exist — treating it as unreadable would '
    + 'block every reclaim on a fresh repo');
});

test('(14) collectSiblingReuse returns sibling reuse records only — not our own, not owners', () => {
  const repo = tmpRepo();
  sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
    pid: 500, execPath: __filename, env: { CLAUDE_CODE_SESSION_ID: 'sess-A' },
  });
  sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
    pid: 501, execPath: __filename, env: { CLAUDE_CODE_SESSION_ID: 'sess-B' },
  });
  sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: 502, execPath: __filename, env: { CLAUDE_CODE_SESSION_ID: 'sess-B' },
  });
  const got = sp.collectSiblingReuse(repo, 'sess-A');
  assert.deepStrictEqual(got.map((r) => r.pid), [501],
    'self excluded, owner records excluded');
});

test('(15) a session dir linked outside the registry is refused (path_escape)', () => {
  const repo = tmpRepo();
  const outside = tmpRepo();
  fs.mkdirSync(sp.registryDir(repo), { recursive: true, mode: 0o700 });
  linkDir(outside, sp.sessionDir(repo, 'sess-A'));

  const r = sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename, env: envWith(),
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'path_escape');
  assert.deepStrictEqual(fs.readdirSync(outside), [],
    'the link target must stay empty — the check runs AFTER mkdir precisely '
    + 'because recursive mkdir follows an existing link');
});

// ── (16)-(18) the registry ROOT is sealed against the REPO ──────────────────
//
// Round-1 santa-loop finding. Sealing only the session dir against the registry
// root passes VACUOUSLY when the root itself is the escape, and it was
// reproducible: with the root pre-created as a junction, records landed outside
// the repo. Each of these three asserts on the OBSERVABLE effect (nothing
// written / nothing killed / nothing unlinked), not on the return value alone,
// because a guard that reports refusal while still touching the far side would
// satisfy a return-value-only assertion.

function repoWithEscapedRegistry() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-esc-')));
  const repo = path.join(base, 'repo');
  const outside = path.join(base, 'OUTSIDE');
  fs.mkdirSync(path.join(repo, '.claude', 'state'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  linkDir(outside, sp.registryDir(repo));
  return { repo, outside };
}

test('(16) a registry ROOT linked outside the repo is refused, and writes nothing there', () => {
  const { repo, outside } = repoWithEscapedRegistry();
  const r = sp.register(repo, {
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
    pid: process.pid, execPath: __filename, env: envWith(),
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'path_escape');
  assert.deepStrictEqual(fs.readdirSync(outside), [],
    'a record outside the repo is the whole defect this closes');
  assert.strictEqual(sp.containedRegistryDir(repo), null);
});

test('(17) an escaped registry root makes reclaim refuse ENTIRELY — no kill, complete=false', () => {
  const { repo, outside } = repoWithEscapedRegistry();
  // Seed a record on the far side that would otherwise look perfectly owned.
  fs.mkdirSync(path.join(outside, 'sess-A'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'sess-A', '4242.json'), JSON.stringify({
    schema: sp.SCHEMA_VERSION, pid: 4242, host: os.hostname(), session_id: 'sess-A',
    session_pid: process.pid, started_at: new Date().toISOString(),
    proc_started_at_ms: Date.now(), exec_path: __filename, repo_root: repo,
    kind: 'plan-codex-runner', lifetime: 'session', role: 'owner',
  }));

  const killed = [];
  const out = sp.reclaimSession({
    repoRoot: repo, sessionId: 'sess-A', env: {},
    isAlive: () => true,
    probeProcess: () => ({ startedAtMs: Date.now(), commandLine: 'node "' + __filename + '"' }),
    kill: (pid) => { killed.push(pid); },
  });
  assert.deepStrictEqual(killed, [],
    'nothing may be killed on the strength of records we reached through a link out of the repo');
  assert.strictEqual(out.complete, false, 'refusal must be reported as unfinished, not as success');
  assert.strictEqual(out.reclaimed.length, 0);
});

test('(18) an escaped registry root makes the orphan sweep unlink nothing outside the repo', () => {
  const { repo, outside } = repoWithEscapedRegistry();
  fs.mkdirSync(path.join(outside, 'sess-OTHER'), { recursive: true });
  const victim = path.join(outside, 'sess-OTHER', '999999.json');
  fs.writeFileSync(victim, JSON.stringify({
    schema: sp.SCHEMA_VERSION, pid: 999999, host: os.hostname(), session_id: 'sess-OTHER',
    session_pid: 999998, started_at: new Date().toISOString(),
    proc_started_at_ms: Date.now(), exec_path: __filename, repo_root: repo,
    kind: 'dashboard-server', lifetime: 'session', role: 'owner',
  }));

  const out = sp.scanForeignOrphans(repo, 'sess-A', { isAlive: () => false });
  assert.strictEqual(fs.existsSync(victim), true,
    'the sweep unlinks; reaching through an escaped root would delete outside the repo');
  assert.deepStrictEqual(out,
    { liveCount: 0, purgedCount: 0, unreadable: 0, purgeFailures: 0 });
});

// ── (23) the READ/UNLINK path seals the session dir, not just the root ──────
//
// santa-loop R3. Sealing only the registry root left the reclaim path following
// a session dir that links out: reproduced killing the pid named by an
// out-of-repo record AND unlinking that record. `scanForeignOrphans` already had
// the per-directory check; the reclaim path was the inconsistency.

test('(23) a session dir linking out of the repo makes reclaim kill nothing and touch nothing', () => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-sdir-')));
  const repo = path.join(base, 'repo');
  const outside = path.join(base, 'OUTSIDE');
  fs.mkdirSync(sp.registryDir(repo), { recursive: true, mode: 0o700 });
  fs.mkdirSync(outside, { recursive: true });
  const victim = path.join(outside, '4242.json');
  fs.writeFileSync(victim, JSON.stringify({
    schema: sp.SCHEMA_VERSION, pid: 4242, host: os.hostname(), session_id: 'sess-X',
    session_pid: process.pid, started_at: new Date().toISOString(),
    proc_started_at_ms: Date.now(), exec_path: __filename, repo_root: repo,
    kind: 'plan-codex-runner', lifetime: 'session', role: 'owner',
  }));
  linkDir(outside, sp.sessionDir(repo, 'sess-X'));

  const killed = [];
  const out = sp.reclaimSession({
    repoRoot: repo, sessionId: 'sess-X', env: {},
    isAlive: () => true,
    probeProcess: () => ({ startedAtMs: Date.now(), commandLine: 'node "' + __filename + '"' }),
    collectSiblingReuse: () => [],
    kill: (pid) => { killed.push(pid); },
  });

  assert.deepStrictEqual(killed, [], 'a record reached through a link out of the repo may not authorize a kill');
  assert.strictEqual(fs.existsSync(victim), true, 'and may not be unlinked either');
  assert.strictEqual(out.complete, false, 'the refusal must report itself as unfinished');
  assert.strictEqual(sp.containedSessionDir(repo, 'sess-X'), null);
});

// ── (24) unregister — the LAST mutating path to get containment ─────────────
//
// santa-loop R5, and the fourth instance of one failure mode: a guard applied at
// some call sites and not at all of them. register sealed, list sealed,
// reclaimSession sealed, scanForeignOrphans sealed — and clean shutdown went
// through unregister unguarded, on two production paths (dashboard close, runner
// finally).

test('(24) unregister refuses to unlink through a session dir that links out of the repo', () => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-unreg-')));
  const repo = path.join(base, 'repo');
  const outside = path.join(base, 'OUTSIDE');
  fs.mkdirSync(sp.registryDir(repo), { recursive: true, mode: 0o700 });
  fs.mkdirSync(outside, { recursive: true });
  const victim = path.join(outside, '4242.json');
  fs.writeFileSync(victim, '{}');
  linkDir(outside, sp.sessionDir(repo, 'sess-X'));

  const r = sp.unregister(repo, 'sess-X', 4242);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'path_escape');
  assert.strictEqual(fs.existsSync(victim), true,
    'a normal dashboard close must not be able to delete a file outside the repo');
});

// ── (25) the sibling sweep is time-bounded, and running out means INCOMPLETE ─
//
// §D11 forbids memoizing this sweep, so it re-reads every sibling directory for
// every record — the one genuinely unbounded piece of the SessionEnd budget.

test('(25) a sibling sweep that runs out of time reports incomplete, not empty', () => {
  const repo = tmpRepo();
  const dir = sp.sessionDir(repo, 'sess-B');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, '4242.json'), JSON.stringify({
    schema: sp.SCHEMA_VERSION, pid: 4242, host: os.hostname(), session_id: 'sess-B',
    session_pid: process.pid, started_at: new Date().toISOString(),
    proc_started_at_ms: Date.now(), exec_path: __filename, repo_root: repo,
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
  }));

  const inTime = sp.collectSiblingReuse(repo, 'sess-A');
  assert.strictEqual(inTime.length, 1, 'sanity: the record IS collectable with time to spare');
  assert.strictEqual(inTime.incomplete, false);

  const expired = sp.collectSiblingReuse(repo, 'sess-A', { deadline: 0, now: () => 1 });
  assert.strictEqual(expired.incomplete, true,
    'out of time to check who is using a process is not permission to kill it');
});

// ── (26) an unreadable session directory is counted, not skipped ────────────

test('(26) a session dir that cannot be listed is counted as unreadable', () => {
  const repo = tmpRepo();
  fs.mkdirSync(sp.registryDir(repo), { recursive: true, mode: 0o700 });
  // A plain FILE where a session directory is expected: readdirSync gives
  // ENOTDIR, which the sweep used to swallow with a bare `continue`.
  fs.writeFileSync(path.join(sp.registryDir(repo), 'sess-BROKEN'), 'not a directory');

  const warnings = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (c, ...r) => { warnings.push(String(c)); return realWrite(c, ...r); };
  let out;
  try { out = sp.scanForeignOrphans(repo, 'sess-A', { isAlive: () => false }); }
  finally { process.stderr.write = realWrite; }

  assert.strictEqual(out.unreadable, 1);
  assert.ok(/cannot list sess-BROKEN/.test(warnings.join('')),
    'and it must be named — a bare continue makes it indistinguishable from an empty dir');
});

// ── PRD :78 — the borrowed-dashboard growth path ────────────────────────────
//
// Flagged in both santa-loop rounds. One dir accumulates per short session that
// borrowed a long-lived dashboard, and it survives for as long as the dashboard
// runs. The fix is deliberately PARTIAL, and the partition is the point: purge
// only what isSiblingLive ALREADY reports as not-in-use, so no reclaim decision
// can change. Degraded records stay, because purging them would convert "cannot
// tell" into "nobody is using it" — which authorizes a kill.

test('(21) an inert reuse record is purged even though its target pid is alive', () => {
  const repo = tmpRepo();
  const dir = sp.sessionDir(repo, 'sess-BORROWER');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const base = {
    schema: sp.SCHEMA_VERSION, host: os.hostname(), session_id: 'sess-BORROWER',
    started_at: new Date().toISOString(), proc_started_at_ms: Date.now(),
    exec_path: __filename, repo_root: repo, kind: 'dashboard-server',
    lifetime: 'outlives-session',
  };
  // The borrower's session (pid 999998) is gone; the dashboard (pid 4242) lives.
  fs.writeFileSync(path.join(dir, '4242.json'),
    JSON.stringify(Object.assign({}, base, { pid: 4242, session_pid: 999998, role: 'reuse' })));

  const out = sp.scanForeignOrphans(repo, 'sess-A', {
    isAlive: (pid) => pid === 4242,          // the dashboard lives, the session does not
    host: os.hostname(),
  });
  assert.strictEqual(out.purgedCount, 1, 'bookkeeping about a DEAD session is collectable');
  assert.strictEqual(out.liveCount, 0);
  assert.strictEqual(fs.existsSync(path.join(dir, '4242.json')), false);
});

test('(22) a DEGRADED or cross-host reuse record is never purged — it still blocks kills', () => {
  const mk = (over) => Object.assign({
    schema: sp.SCHEMA_VERSION, pid: 4242, host: os.hostname(), session_id: 'sess-B',
    session_pid: 999998, started_at: new Date().toISOString(),
    proc_started_at_ms: Date.now(), exec_path: __filename,
    kind: 'dashboard-server', lifetime: 'outlives-session', role: 'reuse',
  }, over);

  for (const [label, over] of [
    ['session_pid null (degraded identity)', { session_pid: null }],
    ['another host (liveness unknowable)', { host: 'some-other-host' }],
    ['owner, not reuse', { role: 'owner' }],
  ]) {
    const repo = tmpRepo();
    const dir = sp.sessionDir(repo, 'sess-B');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const rec = mk(Object.assign({ repo_root: repo }, over));
    fs.writeFileSync(path.join(dir, '4242.json'), JSON.stringify(rec));

    const out = sp.scanForeignOrphans(repo, 'sess-A', {
      isAlive: (pid) => pid === 4242,
      host: os.hostname(),
      now: () => Date.now() + sp.ORPHAN_STALE_MS + 1,   // force the dir to look dead
    });
    assert.strictEqual(fs.existsSync(path.join(dir, '4242.json')), true,
      'must survive — isSiblingLive still honours it fail-closed: ' + label);
    assert.strictEqual(out.purgedCount, 0, label);
  }
});

// A sweep that could not do its job must not look like one that had nothing to
// do — otherwise a registry quietly growing past PRD :78 reports a clean zero.
test('(20) an unreadable record is counted and named, not dropped into a clean zero', () => {
  const repo = tmpRepo();
  const dir = sp.sessionDir(repo, 'sess-DEAD');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // A dead-looking session (no parseable record carries a live session_pid) that
  // also holds one corrupt record.
  fs.writeFileSync(path.join(dir, '424242.json'), '{ this is not json');

  const warnings = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (c, ...r) => { warnings.push(String(c)); return realWrite(c, ...r); };
  let out;
  try {
    out = sp.scanForeignOrphans(repo, 'sess-A', { isAlive: () => false, now: () => Date.now() + sp.ORPHAN_STALE_MS + 1 });
  } finally {
    process.stderr.write = realWrite;
  }

  assert.strictEqual(out.unreadable, 1, 'the unreadable record must be COUNTED');
  assert.strictEqual(out.purgedCount, 0, 'and must not be reported as purged');
  assert.ok(/cannot read/.test(warnings.join('')),
    'and must be NAMED on stderr — a silent drop is indistinguishable from "no orphans"');
});

// A session dir that is itself a link out, under a CLEAN root — the sweep must
// not follow it either, because the unlink would land on the far side.
test('(19) the orphan sweep skips a session dir that links out of a clean registry', () => {
  const repo = tmpRepo();
  const outside = tmpRepo();
  fs.mkdirSync(sp.registryDir(repo), { recursive: true, mode: 0o700 });
  const victim = path.join(outside, '999999.json');
  fs.writeFileSync(victim, JSON.stringify({
    schema: sp.SCHEMA_VERSION, pid: 999999, host: os.hostname(), session_id: 'sess-OTHER',
    session_pid: 999998, started_at: new Date().toISOString(),
    proc_started_at_ms: Date.now(), exec_path: __filename, repo_root: repo,
    kind: 'dashboard-server', lifetime: 'session', role: 'owner',
  }));
  linkDir(outside, path.join(sp.registryDir(repo), 'sess-OTHER'));

  const out = sp.scanForeignOrphans(repo, 'sess-A', { isAlive: () => false });
  assert.strictEqual(fs.existsSync(victim), true);
  assert.strictEqual(out.purgedCount, 0);
});

// ── Task 10: SessionStart orphan sweep (§D14) ───────────────────────────────

// Records are always seeded with a LIVE session pid, because that is the only
// way one can exist: register() degrades a non-live CLAUDE_PID to null on the
// spot. The "dead session" state is produced the way it happens in reality —
// the record outlives the session, and the pid it names stops being alive.
function seedSession(repo, sid, pids) {
  for (const pid of pids) {
    sp.register(repo, {
      kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
      pid, execPath: __filename,
      env: { CLAUDE_CODE_SESSION_ID: sid, CLAUDE_PID: String(process.pid) },
    });
  }
}

test('Task 10 (1) our own session directory is never scanned', () => {
  const repo = tmpRepo();
  seedSession(repo, 'sess-SELF', [111]);
  const out = sp.scanForeignOrphans(repo, 'sess-SELF', { isAlive: () => false });
  assert.deepStrictEqual(out,
    { liveCount: 0, purgedCount: 0, unreadable: 0, purgeFailures: 0 });
  assert.ok(fs.existsSync(path.join(sp.sessionDir(repo, 'sess-SELF'), '111.json')));
});

test('Task 10 (2)(3) dead session: live pids are counted and untouched, dead pid records are purged', () => {
  const repo = tmpRepo();
  seedSession(repo, 'sess-OLD', [111, 222]);

  // The session pid is now dead (axis a); of its processes 111 lives on, 222 is gone.
  const alive = (pid) => pid === 111;
  const out = sp.scanForeignOrphans(repo, 'sess-SELF', { isAlive: alive });

  assert.strictEqual(out.liveCount, 1, 'the live pid is COUNTED, never killed (UI1)');
  assert.strictEqual(out.purgedCount, 1, 'only the dead pid record is unlinked (PRD :78)');
  assert.ok(fs.existsSync(path.join(sp.sessionDir(repo, 'sess-OLD'), '111.json')),
    'a live pid record is left completely alone');
  assert.ok(!fs.existsSync(path.join(sp.sessionDir(repo, 'sess-OLD'), '222.json')));
});

test('Task 10 (4) .unreclaimed.json and .failed.json survive the sweep (UI6 audit surface)', () => {
  const repo = tmpRepo();
  seedSession(repo, 'sess-OLD', [222]);
  const dir = sp.sessionDir(repo, 'sess-OLD');
  fs.writeFileSync(path.join(dir, '333.unreclaimed.json'), JSON.stringify({ pid: 333, reason: 'eperm' }), 'utf8');
  fs.writeFileSync(path.join(dir, '444.failed.json'), JSON.stringify({ pid: 444, reason: 'schema' }), 'utf8');

  sp.scanForeignOrphans(repo, 'sess-SELF', { isAlive: () => false });

  assert.ok(fs.existsSync(path.join(dir, '333.unreclaimed.json')),
    'purging the evidence would turn PRD :76 "handle it" into evidence destruction');
  assert.ok(fs.existsSync(path.join(dir, '444.failed.json')));
  assert.ok(!fs.existsSync(path.join(dir, '222.json')));
});

test('Task 10 (5) ORPHAN_STALE_MS decides degraded sessions on both sides of the boundary', () => {
  const HOUR = 60 * 60 * 1000;
  for (const [ageHours, expectDead] of [[23, false], [25, true]]) {
    const repo = tmpRepo();
    // session_pid null (degraded identity) → the mtime axis decides.
    sp.register(repo, {
      kind: 'dashboard-server', lifetime: 'outlives-session', role: 'owner',
      pid: 222, execPath: __filename, env: { CLAUDE_CODE_SESSION_ID: 'sess-OLD' },
    });
    const dir = sp.sessionDir(repo, 'sess-OLD');
    const when = new Date(Date.now() - ageHours * HOUR);
    fs.utimesSync(dir, when, when);

    const out = sp.scanForeignOrphans(repo, 'sess-SELF', { isAlive: () => false });
    assert.strictEqual(out.purgedCount, expectDead ? 1 : 0,
      ageHours + 'h old vs ORPHAN_STALE_MS=' + sp.ORPHAN_STALE_MS);
  }
});
