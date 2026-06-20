'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sl = require('../session-ledger');

const SESSION_A = '11111111-2222-3333-4444-555555555555';
const SESSION_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SESSION_C = '99999999-8888-7777-6666-555555555555';

function mkSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ledger-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const projectRoot = path.join(root, 'repo');
  fs.mkdirSync(path.join(projectRoot, '.claude', 'state'), { recursive: true });
  return { root: root, home: home, projectRoot: projectRoot };
}

function fakeProjectContext(sandbox, opts) {
  opts = opts || {};
  const projectId = opts.projectId || 'abc123abc123';
  const projectsDir = path.join(sandbox.home, '.local', 'share', 'ecc-homunculus', 'projects');
  const projectDir = path.join(projectsDir, projectId);
  fs.mkdirSync(projectDir, { recursive: true });
  return {
    projectId: projectId,
    projectRoot: sandbox.projectRoot,
    projectDir: projectDir,
    isGlobal: false,
  };
}

function cleanEnv() {
  delete process.env.MCCP_SESSION_LEDGER_SCOPE;
}

test('resolveLedgerScope: default = global, single path', function () {
  cleanEnv();
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const scope = sl.resolveLedgerScope({ projectContext: ctx, env: {} });
  assert.strictEqual(scope.scope, 'global');
  assert.strictEqual(scope.paths.length, 1);
  assert.ok(scope.paths[0].includes('.session-ledgers'), 'path should contain .session-ledgers');
  assert.ok(scope.paths[0].includes(ctx.projectId), 'global path should include projectId');
  assert.strictEqual(scope.primary, scope.paths[0]);
});

test('resolveLedgerScope: repo opt-in returns repo path', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const scope = sl.resolveLedgerScope({
    projectContext: ctx,
    env: { MCCP_SESSION_LEDGER_SCOPE: 'repo' },
  });
  assert.strictEqual(scope.scope, 'repo');
  assert.strictEqual(scope.paths.length, 1);
  assert.ok(scope.paths[0].includes(path.join('.claude', 'state', 'session-ledgers')));
  assert.strictEqual(scope.primary, scope.paths[0]);
});

test('resolveLedgerScope: hybrid returns both, primary=global', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const scope = sl.resolveLedgerScope({
    projectContext: ctx,
    env: { MCCP_SESSION_LEDGER_SCOPE: 'hybrid' },
  });
  assert.strictEqual(scope.scope, 'hybrid');
  assert.strictEqual(scope.paths.length, 2);
  assert.ok(scope.paths[0].includes(ctx.projectId));
  assert.ok(scope.paths[1].includes(path.join('.claude', 'state', 'session-ledgers')));
  assert.strictEqual(scope.primary, scope.paths[0]);
});

test('createLedger + readLedger round-trip: canonical field names (F3 contract)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const created = sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    gitBranch: 'feat/test',
    projectContext: ctx,
  });
  assert.strictEqual(created.ok, true, JSON.stringify(created));
  assert.strictEqual(created.paths.length, 1);

  const read = sl.readLedger({ sessionId: SESSION_A, projectContext: ctx });
  assert.strictEqual(read.ok, true, JSON.stringify(read));
  assert.strictEqual(read.ledger.session_id, SESSION_A);
  assert.ok(read.ledger.created_at, 'created_at must be present');
  assert.strictEqual(read.ledger.started_at, undefined, 'started_at must NOT exist (canonical=created_at)');
  assert.strictEqual(read.ledger.ended_at, null);
  assert.strictEqual(read.ledger.git_branch, 'feat/test');
  assert.strictEqual(read.ledger.schema_version, 'v2');
  assert.ok(read.ledger.last_seen_at, 'last_seen_at must be present (v2)');
  assert.strictEqual(read.ledger.last_seen_at, read.ledger.created_at,
    'fresh ledger: last_seen_at anchors at created_at');
});

test('createLedger: schema reject on missing session_id', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const r = sl.createLedger({ sessionId: '', cwd: sandbox.projectRoot, projectContext: ctx });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /sessionId/);
});

test('createLedger: schema reject on invalid uuid', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const r = sl.createLedger({ sessionId: 'not-a-uuid', cwd: sandbox.projectRoot, projectContext: ctx });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /session_id/);
});

test('validate: rejects unknown top-level key', function () {
  const v = sl.validate({
    schema_version: 'v2',
    session_id: SESSION_A,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ended_at: null,
    cwd: '/tmp',
    git_branch: null,
    pid: 1234,
    host: 'h',
    project_id: 'abc',
    claude_version: null,
    extra_key: 'oops',
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(function (e) { return /unknown top-level key.*extra_key/.test(e); }));
});

test('finalizeLedger: sets ended_at on existing ledger', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_B, cwd: sandbox.projectRoot, projectContext: ctx });
  const fin = sl.finalizeLedger({ sessionId: SESSION_B, projectContext: ctx });
  assert.strictEqual(fin.ok, true, JSON.stringify(fin));
  const read = sl.readLedger({ sessionId: SESSION_B, projectContext: ctx });
  assert.strictEqual(read.ok, true);
  assert.ok(read.ledger.ended_at, 'ended_at must be set');
  assert.match(read.ledger.ended_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('finalizeLedger: ok when ledger does not exist (no-op)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const fin = sl.finalizeLedger({ sessionId: SESSION_C, projectContext: ctx });
  assert.strictEqual(fin.ok, true);
  assert.strictEqual(fin.paths.length, 0);
});

test('listLedgers: returns all ledgers across paths', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  sl.createLedger({ sessionId: SESSION_B, cwd: sandbox.projectRoot, projectContext: ctx });
  const list = sl.listLedgers({ projectContext: ctx });
  assert.strictEqual(list.ok, true);
  assert.strictEqual(list.ledgers.length, 2);
  assert.strictEqual(list.degraded, false);
});

test('listLedgers: activeOnly filters finalized + TTL-aged (F4 partial absorption)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  sl.createLedger({ sessionId: SESSION_B, cwd: sandbox.projectRoot, projectContext: ctx });
  sl.finalizeLedger({ sessionId: SESSION_B, projectContext: ctx });

  const oldIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  sl.createLedger({
    sessionId: SESSION_C,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    createdAt: oldIso,
  });

  const active = sl.listLedgers({ activeOnly: true, projectContext: ctx });
  assert.strictEqual(active.ok, true);
  assert.strictEqual(active.ledgers.length, 1, 'only SESSION_A active (B finalized, C stale)');
  assert.strictEqual(active.ledgers[0].session_id, SESSION_A);
});

test('listLedgers: corrupt ledger sets degraded=true and skips it', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  const scope = sl.resolveLedgerScope({ projectContext: ctx, env: {} });
  fs.writeFileSync(path.join(scope.paths[0], 'corrupt.json'), '{"oops": "not a ledger"}');

  const list = sl.listLedgers({ projectContext: ctx });
  assert.strictEqual(list.ok, true);
  assert.strictEqual(list.degraded, true);
  assert.strictEqual(list.ledgers.length, 1);
  assert.ok(list.errors.length >= 1);
});

test('listLedgers: hybrid dedupes by sessionId, newest last_seen_at wins (M2 F1)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    scopeOverride: 'hybrid',
  });
  const list = sl.listLedgers({ projectContext: ctx, scopeOverride: 'hybrid' });
  assert.strictEqual(list.ledgers.length, 1, 'dedupe by sessionId');
});

test('createLedger: hybrid writes to both paths', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const r = sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    scopeOverride: 'hybrid',
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.paths.length, 2);
  assert.ok(fs.existsSync(r.paths[0]), 'global path exists');
  assert.ok(fs.existsSync(r.paths[1]), 'repo path exists');
});

test('listLedgers: empty when no ledger directory', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const list = sl.listLedgers({ projectContext: ctx });
  assert.strictEqual(list.ok, true);
  assert.strictEqual(list.ledgers.length, 0);
  assert.strictEqual(list.degraded, false);
});

test('namespace: ledger dir is .session-ledgers NOT .observer-sessions (F1 absorption)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const r = sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  assert.strictEqual(r.ok, true);
  for (const p of r.paths) {
    assert.ok(p.includes('.session-ledgers'), 'path must include .session-ledgers');
    assert.ok(!p.includes('.observer-sessions'), 'path must NOT include .observer-sessions');
  }
});

// ---- v1.4.0-m2 Task 1: schema v2 + backward-compat lift -------------------

test('schema v2: createLedger emits last_seen_at = created_at on write', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const r = sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  assert.strictEqual(r.ok, true);
  const scope = sl.resolveLedgerScope({ projectContext: ctx, env: {} });
  const raw = JSON.parse(fs.readFileSync(path.join(scope.paths[0], SESSION_A + '.json'), 'utf8'));
  assert.strictEqual(raw.schema_version, 'v2');
  assert.strictEqual(raw.last_seen_at, raw.created_at);
});

test('schema v1 read: in-memory lift to v2 (write file stays v1, read returns v2)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const scope = sl.resolveLedgerScope({ projectContext: ctx, env: {} });
  fs.mkdirSync(scope.paths[0], { recursive: true });
  const legacyCreatedAt = new Date(Date.now() - 60_000).toISOString();
  const legacy = {
    schema_version: 'v1',
    session_id: SESSION_A,
    created_at: legacyCreatedAt,
    ended_at: null,
    cwd: sandbox.projectRoot,
    git_branch: 'legacy',
    pid: process.pid,
    host: os.hostname(),
    project_id: ctx.projectId,
    claude_version: null,
  };
  const target = path.join(scope.paths[0], SESSION_A + '.json');
  fs.writeFileSync(target, JSON.stringify(legacy, null, 2) + '\n', 'utf8');

  const read = sl.readLedger({ sessionId: SESSION_A, projectContext: ctx });
  assert.strictEqual(read.ok, true, JSON.stringify(read));
  assert.strictEqual(read.ledger.schema_version, 'v2', 'read lifts to v2');
  assert.strictEqual(read.ledger.last_seen_at, legacyCreatedAt, 'lift anchors last_seen_at at created_at');

  // disk file remains v1 (read-only lift; write happens only on next heartbeat/finalize)
  const onDisk = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.strictEqual(onDisk.schema_version, 'v1', 'disk file unchanged by read');
  assert.strictEqual(onDisk.last_seen_at, undefined, 'disk file has no last_seen_at (v1)');
});

test('schema validate: rejects v1 with last_seen_at (invalid mix)', function () {
  const v = sl.validate({
    schema_version: 'v1',
    session_id: SESSION_A,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ended_at: null,
    cwd: '/tmp',
    git_branch: null,
    pid: 1,
    host: 'h',
    project_id: 'abc',
    claude_version: null,
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(function (e) { return /last_seen_at is v2-only/.test(e); }),
    'v1 + last_seen_at rejected');
});

test('schema validate: rejects v2 without last_seen_at (invalid mix)', function () {
  const v = sl.validate({
    schema_version: 'v2',
    session_id: SESSION_A,
    created_at: new Date().toISOString(),
    ended_at: null,
    cwd: '/tmp',
    git_branch: null,
    pid: 1,
    host: 'h',
    project_id: 'abc',
    claude_version: null,
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(function (e) { return /last_seen_at must be ISO8601/.test(e); }),
    'v2 without last_seen_at rejected');
});

// ---- v1.4.0-m2 Task 2: updateLedgerHeartbeat ------------------------------

test('heartbeat: idempotent — only last_seen_at advances', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  const firstRead = sl.readLedger({ sessionId: SESSION_A, projectContext: ctx });
  const firstLastSeen = firstRead.ledger.last_seen_at;

  // Force timestamp advance (atomic isn't enough — Date.now() resolution can collide).
  const advanced = new Date(Date.parse(firstLastSeen) + 100).toISOString();
  const result = sl.updateLedgerHeartbeat({
    sessionId: SESSION_A,
    projectContext: ctx,
    timestamp: advanced,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.paths.length, 1);

  const secondRead = sl.readLedger({ sessionId: SESSION_A, projectContext: ctx });
  assert.strictEqual(secondRead.ledger.last_seen_at, advanced);
  assert.strictEqual(secondRead.ledger.created_at, firstRead.ledger.created_at);
  assert.strictEqual(secondRead.ledger.session_id, firstRead.ledger.session_id);
});

test('heartbeat: hybrid scope writes both paths', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    scopeOverride: 'hybrid',
  });
  const advanced = new Date(Date.now() + 100).toISOString();
  const result = sl.updateLedgerHeartbeat({
    sessionId: SESSION_A,
    projectContext: ctx,
    scopeOverride: 'hybrid',
    timestamp: advanced,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.paths.length, 2, 'both global + repo updated');
  assert.strictEqual(result.errors.length, 0);
});

test('heartbeat: v1 ledger on disk → in-place schema bump to v2 on write', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const scope = sl.resolveLedgerScope({ projectContext: ctx, env: {} });
  fs.mkdirSync(scope.paths[0], { recursive: true });
  const legacyAt = new Date(Date.now() - 1000).toISOString();
  const legacy = {
    schema_version: 'v1',
    session_id: SESSION_A,
    created_at: legacyAt,
    ended_at: null,
    cwd: sandbox.projectRoot,
    git_branch: null,
    pid: process.pid,
    host: os.hostname(),
    project_id: ctx.projectId,
    claude_version: null,
  };
  const target = path.join(scope.paths[0], SESSION_A + '.json');
  fs.writeFileSync(target, JSON.stringify(legacy, null, 2) + '\n', 'utf8');

  const result = sl.updateLedgerHeartbeat({ sessionId: SESSION_A, projectContext: ctx });
  assert.strictEqual(result.ok, true);

  const onDisk = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.strictEqual(onDisk.schema_version, 'v2', 'disk file bumped to v2');
  assert.ok(onDisk.last_seen_at, 'last_seen_at written');
  assert.notStrictEqual(onDisk.last_seen_at, legacyAt, 'last_seen_at advanced past created_at');
});

test('heartbeat: missing sessionId returns ok=false', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const result = sl.updateLedgerHeartbeat({ sessionId: '', projectContext: ctx });
  assert.strictEqual(result.ok, false);
});

test('heartbeat: ledger does not exist → ok=true noop', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const result = sl.updateLedgerHeartbeat({ sessionId: SESSION_C, projectContext: ctx });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.noop, true);
  assert.strictEqual(result.paths.length, 0);
});

test('heartbeat: hybrid partial fail → ok=false + errors (F1 absorption)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    scopeOverride: 'hybrid',
  });
  const scope = sl.resolveLedgerScope({
    projectContext: ctx,
    env: { MCCP_SESSION_LEDGER_SCOPE: 'hybrid' },
  });
  // Corrupt repo-path ledger so heartbeat read+parse fails on that path only.
  fs.writeFileSync(path.join(scope.paths[1], SESSION_A + '.json'), '{"broken json');

  const result = sl.updateLedgerHeartbeat({
    sessionId: SESSION_A,
    projectContext: ctx,
    scopeOverride: 'hybrid',
  });
  assert.strictEqual(result.ok, false, 'all-or-nothing invariant: partial fail = ok=false');
  assert.strictEqual(result.paths.length, 1, 'global path succeeded');
  assert.ok(result.errors.length >= 1, 'repo path error captured');
});

// ---- v1.4.0-m2 Task 3: listLedgers host-aware tri-state -------------------

test('listLedgers active: same-host alive PID + fresh heartbeat → active (F2)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  const list = sl.listLedgers({ activeOnly: true, projectContext: ctx });
  assert.strictEqual(list.ok, true);
  assert.strictEqual(list.ledgers.length, 1);
  assert.strictEqual(list.ledgers[0].session_id, SESSION_A);
});

test('listLedgers active: same-host dead PID + stale heartbeat → inactive (F2)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    pid: 999999, // unlikely to be alive
  });
  const list = sl.listLedgers({
    activeOnly: true,
    projectContext: ctx,
    pidIsLive: function () { return false; },
  });
  assert.strictEqual(list.ledgers.length, 0, 'dead PID + stale = inactive');
});

test('listLedgers active: different-host + fresh heartbeat → active (no PID probe)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    host: 'other-host',
    pid: 999999,
  });
  const list = sl.listLedgers({
    activeOnly: true,
    projectContext: ctx,
    pidIsLive: function () { return false; }, // would mark inactive on same-host
  });
  assert.strictEqual(list.ledgers.length, 1, 'cross-host trusts heartbeat alone');
});

test('listLedgers active: same-host alive PID + STALE heartbeat → inactive (PID-reuse guard, F2)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  });
  // PID alive but heartbeat 10 min old → 5-min TTL exceeded.
  const list = sl.listLedgers({
    activeOnly: true,
    projectContext: ctx,
    pidIsLive: function () { return true; },
  });
  assert.strictEqual(list.ledgers.length, 0, 'stale heartbeat ⇒ inactive even when PID alive');
});

test('listLedgers active: EPERM from pidIsLive treated as alive (Windows perm fallback)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  // Inject a probe that mimics process.kill returning EPERM (interpreted as alive by pidIsLive).
  const list = sl.listLedgers({
    activeOnly: true,
    projectContext: ctx,
    pidIsLive: function () { return true; }, // EPERM ⇒ true per real pidIsLive
  });
  assert.strictEqual(list.ledgers.length, 1, 'EPERM-as-alive ⇒ active');
});

test('listLedgers hybrid: stale v1 global + fresh v2 repo → fresh wins, degraded=true (F1)', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const scope = sl.resolveLedgerScope({
    projectContext: ctx,
    env: { MCCP_SESSION_LEDGER_SCOPE: 'hybrid' },
  });
  fs.mkdirSync(scope.paths[0], { recursive: true });
  fs.mkdirSync(scope.paths[1], { recursive: true });

  const staleAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min old
  const freshAt = new Date(Date.now() - 1000).toISOString();           // 1s old

  // Global path: v1 ledger (legacy, stale)
  fs.writeFileSync(
    path.join(scope.paths[0], SESSION_A + '.json'),
    JSON.stringify({
      schema_version: 'v1',
      session_id: SESSION_A,
      created_at: staleAt,
      ended_at: null,
      cwd: sandbox.projectRoot,
      git_branch: 'global-stale',
      pid: process.pid,
      host: os.hostname(),
      project_id: ctx.projectId,
      claude_version: null,
    }, null, 2) + '\n',
    'utf8'
  );
  // Repo path: v2 ledger, fresh
  fs.writeFileSync(
    path.join(scope.paths[1], SESSION_A + '.json'),
    JSON.stringify({
      schema_version: 'v2',
      session_id: SESSION_A,
      created_at: staleAt,
      last_seen_at: freshAt,
      ended_at: null,
      cwd: sandbox.projectRoot,
      git_branch: 'repo-fresh',
      pid: process.pid,
      host: os.hostname(),
      project_id: ctx.projectId,
      claude_version: null,
    }, null, 2) + '\n',
    'utf8'
  );

  const list = sl.listLedgers({ projectContext: ctx, scopeOverride: 'hybrid' });
  assert.strictEqual(list.ledgers.length, 1, 'dedupe by sessionId');
  assert.strictEqual(list.ledgers[0].git_branch, 'repo-fresh', 'newer last_seen_at wins');
  assert.strictEqual(list.degraded, true, 'hybrid dedupe noted in degraded flag');
  assert.ok(list.errors.length >= 1, 'older entry tracked in errors');
});

// ---- v1.4.0-m2 Task 5: SessionEnd anchor invariant ------------------------

test('finalize after heartbeat: ended_at > last_seen_at > created_at', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  const createRes = sl.createLedger({
    sessionId: SESSION_A,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
  });
  const createdAt = createRes.ledger.created_at;

  // Advance heartbeat 100ms past creation.
  const hbAt = new Date(Date.parse(createdAt) + 100).toISOString();
  sl.updateLedgerHeartbeat({ sessionId: SESSION_A, projectContext: ctx, timestamp: hbAt });

  // Finalize 200ms past creation.
  const endAt = new Date(Date.parse(createdAt) + 200).toISOString();
  sl.finalizeLedger({ sessionId: SESSION_A, projectContext: ctx, endedAt: endAt });

  const read = sl.readLedger({ sessionId: SESSION_A, projectContext: ctx });
  assert.ok(read.ledger.created_at < read.ledger.last_seen_at, 'last_seen > created');
  assert.ok(read.ledger.last_seen_at < read.ledger.ended_at, 'ended > last_seen');
});

test('finalize when ended_at would equal last_seen_at: ended_at bumped +1ms', function () {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sl.createLedger({ sessionId: SESSION_A, cwd: sandbox.projectRoot, projectContext: ctx });
  const hbAt = new Date(Date.now() + 1000).toISOString(); // future heartbeat
  sl.updateLedgerHeartbeat({ sessionId: SESSION_A, projectContext: ctx, timestamp: hbAt });

  // endedAt earlier than heartbeat → finalize bumps to hbAt + 1ms
  sl.finalizeLedger({ sessionId: SESSION_A, projectContext: ctx, endedAt: hbAt });
  const read = sl.readLedger({ sessionId: SESSION_A, projectContext: ctx });
  assert.ok(read.ledger.ended_at > hbAt, 'ended_at bumped past last_seen_at');
});
