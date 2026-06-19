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
  assert.strictEqual(read.ledger.schema_version, 'v1');
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
    schema_version: 'v1',
    session_id: SESSION_A,
    created_at: new Date().toISOString(),
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

test('listLedgers: hybrid dedupes by sessionId, global precedence', function () {
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
