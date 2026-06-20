'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const helpers = require('./helpers');
const stateSource = require('../sources/state');
const sessionLedger = require('../../state/session-ledger');

const SESSION_A = '11111111-2222-3333-4444-555555555555';
const SESSION_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SESSION_C = '99999999-8888-7777-6666-555555555555';

function mkRepoSandbox() {
  const root = helpers.tmpRepo('mccp-state-source-');
  helpers.gitInit(root);
  return root;
}

// Build a fake projectContext that bypasses git/remote probing. Used to make
// session-ledger read/write deterministic across the test (HOME varies).
function fakeCtxFor(repoRoot) {
  const projectId = 'state-source-test';
  const projectDir = path.join(repoRoot, '.fake-homunculus', projectId);
  fs.mkdirSync(projectDir, { recursive: true });
  return { projectId, projectRoot: repoRoot, projectDir, isGlobal: false };
}

// Direct-write a ledger into the projectContext-derived global path so the
// test does not depend on resolveProjectContext (which would touch the real
// home dir). We mirror what createLedger does, just with explicit paths.
function writeLedgerDirect(ctx, ledger) {
  const dir = path.join(ctx.projectDir, sessionLedger.LEDGER_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ledger.session_id + '.json'),
    JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  return path.join(dir, ledger.session_id + '.json');
}

function nowIso() { return new Date().toISOString(); }
function isoAgo(ms) { return new Date(Date.now() - ms).toISOString(); }

function baseLedger(extra) {
  return Object.assign({
    schema_version: 'v1',
    session_id: SESSION_A,
    created_at: nowIso(),
    ended_at: null,
    cwd: '/tmp/repo',
    git_branch: 'main',
    pid: 1234,
    host: 'test-host',
    project_id: 'state-source-test',
    claude_version: null,
  }, extra || {});
}

test('scanState: 0 ledgers → active_session_ledgers empty array', function () {
  const repo = mkRepoSandbox();
  try {
    const result = stateSource.scanState(repo);
    assert.strictEqual(result.ok, true);
    assert.ok(result.item, 'item should exist (STATE.md absent path)');
    assert.deepStrictEqual(result.item.active_session_ledgers, []);
    assert.strictEqual(result.degraded, false);
  } finally {
    helpers.cleanup(repo);
  }
});

test('collectActiveSessionLedgers: returns empty + ok when no ledger directory', function () {
  const repo = mkRepoSandbox();
  try {
    const r = stateSource.collectActiveSessionLedgers(repo);
    assert.deepStrictEqual(r.ledgers, []);
    assert.strictEqual(r.degraded, false);
  } finally {
    helpers.cleanup(repo);
  }
});

test('listLedgers schema-name contract: surfaces created_at (NOT started_at) - F3', function () {
  // This test asserts the producer→consumer contract directly through the
  // listLedgers consumer pathway, which is what derive will call.
  const repo = mkRepoSandbox();
  try {
    const ctx = fakeCtxFor(repo);
    writeLedgerDirect(ctx, baseLedger({ session_id: SESSION_A }));
    const list = sessionLedger.listLedgers({ projectContext: ctx });
    assert.strictEqual(list.ok, true);
    assert.strictEqual(list.ledgers.length, 1);
    const l = list.ledgers[0];
    assert.ok(l.created_at, 'created_at must be surfaced');
    assert.strictEqual(l.started_at, undefined, 'started_at must NOT exist (F3 canonical name)');
    assert.strictEqual(l.git_branch, 'main', 'git_branch canonical (NOT branch)');
  } finally {
    helpers.cleanup(repo);
  }
});

test('listLedgers + activeOnly: filters finalized + TTL-aged', function () {
  const repo = mkRepoSandbox();
  try {
    const ctx = fakeCtxFor(repo);
    writeLedgerDirect(ctx, baseLedger({ session_id: SESSION_A }));
    writeLedgerDirect(ctx, baseLedger({ session_id: SESSION_B, ended_at: nowIso() }));
    writeLedgerDirect(ctx, baseLedger({ session_id: SESSION_C, created_at: isoAgo(25 * 60 * 60 * 1000) }));
    const active = sessionLedger.listLedgers({ activeOnly: true, projectContext: ctx });
    assert.strictEqual(active.ok, true);
    assert.strictEqual(active.ledgers.length, 1);
    assert.strictEqual(active.ledgers[0].session_id, SESSION_A);
  } finally {
    helpers.cleanup(repo);
  }
});

test('listLedgers: corrupt ledger marks degraded=true and is skipped', function () {
  const repo = mkRepoSandbox();
  try {
    const ctx = fakeCtxFor(repo);
    writeLedgerDirect(ctx, baseLedger({ session_id: SESSION_A }));
    const dir = path.join(ctx.projectDir, sessionLedger.LEDGER_SUBDIR);
    fs.writeFileSync(path.join(dir, 'corrupt.json'), '{"oops":"not a ledger"}');
    const list = sessionLedger.listLedgers({ projectContext: ctx });
    assert.strictEqual(list.ok, true);
    assert.strictEqual(list.degraded, true);
    assert.strictEqual(list.ledgers.length, 1);
  } finally {
    helpers.cleanup(repo);
  }
});

test('resolveLedgerScope: env mocking — repo scope returns repo-local path', function () {
  const repo = mkRepoSandbox();
  try {
    const ctx = fakeCtxFor(repo);
    const scope = sessionLedger.resolveLedgerScope({
      projectContext: ctx,
      env: { MCCP_SESSION_LEDGER_SCOPE: 'repo' },
    });
    assert.strictEqual(scope.scope, 'repo');
    assert.strictEqual(scope.paths.length, 1);
    assert.ok(scope.paths[0].includes(path.join('.claude', 'state', 'session-ledgers')));
  } finally {
    helpers.cleanup(repo);
  }
});

test('resolveLedgerScope: env mocking — hybrid returns both', function () {
  const repo = mkRepoSandbox();
  try {
    const ctx = fakeCtxFor(repo);
    const scope = sessionLedger.resolveLedgerScope({
      projectContext: ctx,
      env: { MCCP_SESSION_LEDGER_SCOPE: 'hybrid' },
    });
    assert.strictEqual(scope.scope, 'hybrid');
    assert.strictEqual(scope.paths.length, 2);
    assert.strictEqual(scope.primary, scope.paths[0]);
  } finally {
    helpers.cleanup(repo);
  }
});

test('scanState: STATE.md absent + no ledger dir → item exists, no session_anchor (F2)', function () {
  const repo = mkRepoSandbox();
  try {
    const result = stateSource.scanState(repo);
    assert.strictEqual(result.ok, true);
    assert.ok(result.item);
    // F2 absorption: no session_anchor surface
    assert.strictEqual(result.item.session_anchor, undefined);
    assert.deepStrictEqual(result.item.active_session_ledgers, []);
  } finally {
    helpers.cleanup(repo);
  }
});

test('scanState: STATE.md frontmatter is NOT modified to include anchor fields (F2)', function () {
  const repo = mkRepoSandbox();
  try {
    // Write a STATE.md with only the baseline keys (no session_id/session_ledger_path).
    const stateDir = path.join(repo, '.claude', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'STATE.md'),
      '---\nstate_version: 1\ncreated_at: "2026-06-19T00:00:00Z"\nupdated_at: "2026-06-19T00:00:00Z"\n---\n', 'utf8');
    const result = stateSource.scanState(repo);
    assert.strictEqual(result.ok, true);
    // No session_id or session_ledger_path in frontmatter (anchor wasn't introduced — F2)
    assert.strictEqual(result.item.frontmatter.session_id, undefined);
    assert.strictEqual(result.item.frontmatter.session_ledger_path, undefined);
  } finally {
    helpers.cleanup(repo);
  }
});

// v1.4.0-m3 — self resolution chain (Codex Implement R1 F3 absorption)
// Contract: self_session_id + self_resolution always emit (no null fallback).

test('resolveSelfSessionId: env set + valid → resolved', function () {
  const r = stateSource.resolveSelfSessionId([], { envSessionId: SESSION_A, cwd: '/x' });
  assert.strictEqual(r.id, SESSION_A);
  assert.strictEqual(r.resolution, 'resolved');
});

test('resolveSelfSessionId: env unset + cwd-matching ledger → resolved-by-cwd', function () {
  const ledger = { session_id: SESSION_B, cwd: '/tmp/repo' };
  const r = stateSource.resolveSelfSessionId([ledger], { envSessionId: undefined, cwd: '/tmp/repo' });
  assert.strictEqual(r.id, SESSION_B);
  assert.strictEqual(r.resolution, 'resolved-by-cwd');
});

test('resolveSelfSessionId: env unset + no cwd match → env-missing + null', function () {
  const ledger = { session_id: SESSION_B, cwd: '/other/path' };
  const r = stateSource.resolveSelfSessionId([ledger], { envSessionId: undefined, cwd: '/tmp/repo' });
  assert.strictEqual(r.id, null);
  assert.strictEqual(r.resolution, 'env-missing');
});

test('resolveSelfSessionId: env set + sanitize fails + no cwd match → unresolved + null', function () {
  // sanitizeSessionId returns null only when meaningful chars (after strip
  // whitespace+punctuation) are empty. Pure punctuation triggers the
  // unresolved branch — see lib/utils.js sanitizeSessionId.
  const r = stateSource.resolveSelfSessionId([], { envSessionId: '!@.,', cwd: '/x' });
  assert.strictEqual(r.id, null);
  assert.strictEqual(r.resolution, 'unresolved');
});

test('resolveSelfSessionId: ledger 0건 + env resolved → self_session_id sanitized + resolved', function () {
  const r = stateSource.resolveSelfSessionId([], { envSessionId: SESSION_C, cwd: '/x' });
  assert.strictEqual(r.id, SESSION_C);
  assert.strictEqual(r.resolution, 'resolved');
});

test('collectActiveSessionLedgers: surfaces self_session_id + self_resolution (env path)', function () {
  const repo = mkRepoSandbox();
  try {
    const r = stateSource.collectActiveSessionLedgers(repo, { envSessionId: SESSION_A, cwd: repo });
    assert.deepStrictEqual(r.ledgers, []);
    assert.strictEqual(r.self_session_id, SESSION_A);
    assert.strictEqual(r.self_resolution, 'resolved');
  } finally {
    helpers.cleanup(repo);
  }
});

test('scanState: STATE.md absent + env set → item.self_session_id + self_resolution emitted', function () {
  const repo = mkRepoSandbox();
  try {
    const result = stateSource.scanState(repo, { envSessionId: SESSION_A, cwd: repo });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.item.self_session_id, SESSION_A);
    assert.strictEqual(result.item.self_resolution, 'resolved');
  } finally {
    helpers.cleanup(repo);
  }
});
