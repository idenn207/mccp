'use strict';

// session-process-reclaim — §D4 ownership predicate, row by row.
//
// The predicate is the whole of "오살 0". Every row below is a reason NOT to
// kill, so a row that silently stops firing is a mis-kill waiting to happen —
// which is why each one is asserted by its exact `reason` string rather than by
// a boolean.
//
// Row count is 12, not the plan's 11: `reuse_not_owner` is an implementation
// deviation, documented in the implementation report and in session-processes.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sp = require('../session-processes');

const REPO = path.resolve('/repo');
const HOST = 'host-A';
const SID = 'sess-A';
const START_MS = 1700000000000;
const EXEC = process.platform === 'win32'
  ? 'C:\\repo\\plugins\\mccp\\scripts\\lib\\dashboard-server.js'
  : '/repo/plugins/mccp/scripts/lib/dashboard-server.js';

function rec(over) {
  return Object.assign({
    schema: 1,
    pid: 4242,
    host: HOST,
    session_id: SID,
    session_pid: 999,
    started_at: new Date(START_MS).toISOString(),
    proc_started_at_ms: START_MS,
    exec_path: EXEC,
    repo_root: REPO,
    kind: 'dashboard-server',
    lifetime: 'session',
    role: 'owner',
  }, over || {});
}

// A context whose every axis defaults to "this record is ours and verifiable",
// so each test only has to break the ONE axis it is about.
function ctx(over) {
  return Object.assign({
    host: HOST,
    repoRoot: REPO,
    sessionId: SID,
    isAlive: () => true,
    probeProcess: () => ({ startedAtMs: START_MS, commandLine: 'node "' + EXEC + '" --flag' }),
    collectSiblingReuse: () => [],
    allowOutlives: false,
    platform: process.platform,
  }, over || {});
}

function reasonOf(record, context) {
  return sp.isReclaimableBy(record, ctx(context));
}

// ── the 12 rows ─────────────────────────────────────────────────────────────

const BLOCKING_ROWS = [
  ['record_invalid', rec({ schema: 7 }), {}],
  ['cross_host', rec({ host: 'host-B' }), {}],
  ['cross_repo', rec({ repo_root: path.resolve('/other-repo') }), {}],
  ['cross_session', rec({ session_id: 'sess-B' }), {}],
  ['already_dead', rec(), { isAlive: () => false }],
  ['in_use_by_live_session', rec(), {
    collectSiblingReuse: () => [rec({ session_id: 'sess-B', role: 'reuse' })],
  }],
  ['lifetime_outlives_session', rec({ lifetime: 'outlives-session' }), {}],
  ['handoff_never_reclaimed', rec({ kind: 'handoff-session', exec_path: 'powershell.exe' }), {}],
  ['reuse_not_owner', rec({ role: 'reuse' }), {}],
  ['identity_unverifiable', rec(), { probeProcess: () => null }],
  ['identity_mismatch', rec(), {
    probeProcess: () => ({ startedAtMs: START_MS + 60000, commandLine: 'node "' + EXEC + '"' }),
  }],
];

for (const [reason, record, over] of BLOCKING_ROWS) {
  test('§D4 blocks with reason=' + reason, () => {
    const v = reasonOf(record, over);
    assert.strictEqual(v.ok, false, reason + ' must not be reclaimable');
    assert.strictEqual(v.reason, reason);
  });
}

test('§D4 passes only when every axis holds → owned_session_scoped', () => {
  const v = reasonOf(rec(), {});
  assert.deepStrictEqual(v, { ok: true, reason: 'owned_session_scoped' });
});

// ── sibling-reuse liveness ──────────────────────────────────────────────────

test('a live sibling reuse record for the same (pid, host, repo) blocks reclaim', () => {
  const sibling = rec({ session_id: 'sess-B', role: 'reuse', session_pid: 1234 });
  const v = reasonOf(rec({ lifetime: 'outlives-session' }), {
    collectSiblingReuse: () => [sibling],
    isAlive: () => true,
    allowOutlives: true,   // prove the sibling gate fires BEFORE the lifetime gate
  });
  assert.strictEqual(v.reason, 'in_use_by_live_session');
});

test('a sibling with session_pid:null is treated as LIVE — undecidable must not read as dead', () => {
  const sibling = rec({ session_id: 'sess-B', role: 'reuse', session_pid: null });
  const v = reasonOf(rec(), { collectSiblingReuse: () => [sibling], isAlive: () => true });
  assert.strictEqual(v.reason, 'in_use_by_live_session',
    'reading "cannot tell" as dead is a mis-kill on the very next line');
});

test('a cross-host sibling reuse is treated as LIVE — another host\'s pid liveness is unknowable', () => {
  const sibling = rec({ session_id: 'sess-B', role: 'reuse', host: HOST, session_pid: 1234 });
  // The sibling record's host matches the RECORD it shadows, but the liveness
  // probe cannot speak for a foreign host, so isSiblingLive short-circuits true.
  const v = sp.isReclaimableBy(rec(), ctx({
    host: 'host-Z',                            // we are on a different host now
    collectSiblingReuse: () => [sibling],
  }));
  assert.strictEqual(v.reason, 'cross_host', 'our own host axis fires first');

  const v2 = sp.isReclaimableBy(rec({ host: 'host-Z' }), ctx({
    host: 'host-Z',
    collectSiblingReuse: () => [rec({ host: 'host-Z', session_id: 'sess-B', role: 'reuse', session_pid: 1234 })],
    isAlive: (pid) => pid !== 1234,            // sibling session pid reads dead...
  }));
  assert.strictEqual(v2.ok, true, '...and a genuinely dead same-host sibling does NOT block');
});

test('allowOutlives releases exactly one row and nothing else', () => {
  assert.strictEqual(reasonOf(rec({ lifetime: 'outlives-session' }), { allowOutlives: true }).ok, true);
  // Every other blocking row must survive the toggle.
  for (const [reason, record, over] of BLOCKING_ROWS) {
    if (reason === 'lifetime_outlives_session') continue;
    const v = reasonOf(record, Object.assign({ allowOutlives: true }, over));
    assert.strictEqual(v.reason, reason, reason + ' must still block under allowOutlives');
  }
});

test('handoff is excluded even with allowOutlives — the toggle does not reach it', () => {
  const v = reasonOf(rec({
    kind: 'handoff-session', lifetime: 'outlives-session', exec_path: 'powershell.exe',
  }), { allowOutlives: true });
  assert.strictEqual(v.reason, 'handoff_never_reclaimed');
});

test('a repo_root reached through a link is not mistaken for cross_repo', () => {
  // A directory symlink on win32 needs elevation; a JUNCTION does not and
  // resolves identically through realpath. This used to skip on win32, leaving
  // the claim unverified on the priority platform.
  const real = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-real-')));
  const link = path.join(fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-link-'))), 'repo');
  fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  const v = sp.isReclaimableBy(rec({ repo_root: link }), ctx({ repoRoot: real }));
  assert.strictEqual(v.ok, true,
    'a false cross_repo here would wipe out reclaim entirely and silently');
});

// ── §D15 process identity, 7 cases ──────────────────────────────────────────

test('identity 1 — a null probe is unverifiable, and unverifiable never kills', () => {
  assert.strictEqual(reasonOf(rec(), { probeProcess: () => null }).reason, 'identity_unverifiable');
});

test('identity 2 — a start time outside the tolerance is a mismatch', () => {
  const v = reasonOf(rec(), {
    probeProcess: () => ({ startedAtMs: START_MS + 3000, commandLine: 'node "' + EXEC + '"' }),
  });
  assert.strictEqual(v.reason, 'identity_mismatch');
});

test('identity 3 — basename present but the full exec_path absent is a MISMATCH', () => {
  // This is the regression lock for the whole-path rule: a basename-only compare
  // would pass here, because any directory may hold a `dashboard-server.js`.
  const v = reasonOf(rec(), {
    probeProcess: () => ({ startedAtMs: START_MS, commandLine: 'node /tmp/evil/dashboard-server.js' }),
  });
  assert.strictEqual(v.reason, 'identity_mismatch');
});

// ── identity 3b/3c — token-boundary anchoring (round-1 santa-loop finding) ───

test('identity 3b — the exec_path inside a LONGER token is a MISMATCH', () => {
  // Bare substring containment matched all of these, each of which names a
  // DIFFERENT file than the one we registered.
  for (const cmd of [
    'node "' + EXEC + '.bak"',
    'node ' + EXEC + '.lock',
    'node /evil' + EXEC,
  ]) {
    const v = reasonOf(rec(), {
      probeProcess: () => ({ startedAtMs: START_MS, commandLine: cmd }),
    });
    assert.strictEqual(v.reason, 'identity_mismatch',
      'must not match a longer token that merely contains our path: ' + cmd);
  }
});

test('identity 3c — the anchoring did NOT break the real launch shapes', () => {
  for (const cmd of [
    'node "' + EXEC + '"',
    'node ' + EXEC,
    'node "' + EXEC + '" --port 7333',
    '"C:/Program Files/nodejs/node.exe" "' + EXEC + '"',
  ]) {
    const v = reasonOf(rec(), {
      probeProcess: () => ({ startedAtMs: START_MS, commandLine: cmd }),
    });
    assert.strictEqual(v.ok, true, 'a real launch line must still match: ' + cmd);
  }
});

test('identity 3d — DECLARED RESIDUAL: a bare-argument mention still matches', () => {
  // Not a bug report — a lock on the honest boundary. Axis 1 asks "does this
  // command line NAME this script", not "is this script executing". Closing the
  // gap would mean rejecting a path preceded by a flag-shaped token, which also
  // rejects `node --enable-source-maps <path>` and silently disables reclaim.
  // If someone later narrows this, this test going red is the intended prompt to
  // re-check that false-negative class rather than a regression to undo.
  const v = reasonOf(rec(), {
    probeProcess: () => ({
      startedAtMs: START_MS, commandLine: 'node /repo/other.js ' + EXEC,
    }),
  });
  assert.strictEqual(v.ok, true,
    'documented §D15 residual: narrowed by boundary anchoring, not closed');
});

test('identity 4 — a command line differing only by separator and case still MATCHES', () => {
  // The real win32 shape: the record holds `__filename` (backslashes) while the
  // process was launched as `node "${CLAUDE_PLUGIN_ROOT}/scripts/..."` (forward
  // slashes). Without normalization the compare fails 100% of the time.
  const record = rec({ exec_path: 'C:\\Repo\\Scripts\\Lib\\dashboard-server.js' });
  const v = sp.isReclaimableBy(record, ctx({
    platform: 'win32',
    toleranceMs: sp.IDENTITY_TOLERANCE_WIN32_MS,
    probeProcess: () => ({
      startedAtMs: START_MS,
      commandLine: 'node "c:/repo/scripts/lib/dashboard-server.js" --port 7333',
    }),
  }));
  assert.strictEqual(v.ok, true, 'separator + case normalization must apply');
});

test('identity 5/6 — the tolerance boundary is platform-branched on BOTH sides', () => {
  const cases = [
    ['win32', sp.IDENTITY_TOLERANCE_WIN32_MS, 499, true],
    ['win32', sp.IDENTITY_TOLERANCE_WIN32_MS, 501, false],
    ['linux', sp.IDENTITY_TOLERANCE_POSIX_MS, 1499, true],
    ['linux', sp.IDENTITY_TOLERANCE_POSIX_MS, 1501, false],
  ];
  assert.strictEqual(sp.IDENTITY_TOLERANCE_WIN32_MS, 500);
  assert.strictEqual(sp.IDENTITY_TOLERANCE_POSIX_MS, 1500);
  for (const [platform, tol, delta, expectOk] of cases) {
    const execPath = platform === 'win32' ? 'C:\\r\\x.js' : '/r/x.js';
    const v = sp.isReclaimableBy(rec({ exec_path: execPath }), ctx({
      platform, toleranceMs: tol,
      probeProcess: () => ({
        startedAtMs: START_MS + delta,
        commandLine: 'node ' + execPath.replace(/\\/g, '/'),
      }),
    }));
    assert.strictEqual(v.ok, expectOk,
      platform + ' delta=' + delta + ' vs tolerance=' + tol
      + ' — a single flat constant makes one side of this pair wrong');
  }
});

test('identity 7 — MCCP_RECLAIM_IDENTITY_TOLERANCE_MS moves UP only', () => {
  for (const platform of ['win32', 'linux']) {
    const base = platform === 'win32'
      ? sp.IDENTITY_TOLERANCE_WIN32_MS : sp.IDENTITY_TOLERANCE_POSIX_MS;
    for (const bad of ['0', '100', '-5', 'abc']) {
      assert.strictEqual(
        sp.resolveIdentityToleranceMs({ MCCP_RECLAIM_IDENTITY_TOLERANCE_MS: bad }, platform),
        base,
        platform + ': "' + bad + '" must not lower the floor — below the POSIX '
        + 'second-quantization every healthy process reads as identity_mismatch '
        + 'and reclaim dies out from one env line');
    }
    assert.strictEqual(
      sp.resolveIdentityToleranceMs({ MCCP_RECLAIM_IDENTITY_TOLERANCE_MS: '5000' }, platform), 5000,
      'raising it is the supported operator escape');
    assert.strictEqual(sp.resolveIdentityToleranceMs({}, platform), base);
  }
});
