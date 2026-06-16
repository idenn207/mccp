'use strict';

// v1.2.0-m1 Task 6 (Codex F3 absorption) — envelope integrity check at validate time.
//
// When a receipt carries meta.ipc_envelope_path (controller-spawned worker
// context), validateCommand re-reads the envelope from disk and asserts:
//   1. envelope.dispatch_id === receipt.meta.worker_dispatch_id
//   2. envelope.receipts_added contains "<gate_id>/<decision_id>"
// Each mismatch becomes blocking[].kind="envelope-mismatch".
//
// 4-row scenarios:
//   - happy path           — envelope present + dispatch_id match + own slug in receipts_added
//   - envelope missing     — file does not exist
//   - dispatch_id mismatch — envelope says one UUID, receipt meta says another
//   - receipts_added gap   — envelope present but own slug missing

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

const UUID_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID_DISPATCH = '11111111-2222-3333-4444-555555555555';
const UUID_DISPATCH_OTHER = '99999999-8888-7777-6666-555555555555';
const ENV_REL_PATH = '.claude/state/dispatches/' + UUID_DISPATCH + '.envelope.json';

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

function withCwd(repo, fn) {
  const prev = process.cwd();
  process.chdir(repo);
  try { return fn(); } finally { process.chdir(prev); }
}

function writeEnvelope(repo, overrides) {
  const base = {
    schema_version: 'v1',
    dispatch_id: UUID_DISPATCH,
    worker_subagent_type: 'fake',
    worker_started_at: '2026-06-16T00:00:00Z',
    worker_ended_at: '2026-06-16T00:01:00Z',
    worker_exit_status: 'ok',
    receipts_added: ['mccp-implement-codex/feature-x'],
    findings: [],
    next_action: null,
    controller_session_id: UUID_SESSION,
    parent_cwd: repo,
  };
  const merged = Object.assign({}, base, overrides || {});
  writeFileSync(repo, ENV_REL_PATH, JSON.stringify(merged));
  return merged;
}

function writeReceiptsForChain(repo, planRel) {
  // /mccp:prp-implement requires mccp-plan-codex. Write that first (no marker),
  // then the implement receipt with controller-context marker.
  withCwd(repo, function () {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const prev = process.env.MCCP_DISPATCH_CONTEXT;
    process.env.MCCP_DISPATCH_CONTEXT = '1';
    try {
      write({
        gate: 'mccp-implement-codex',
        decision: 'feature-x',
        plan: planRel,
        'dispatched-by-controller-session': UUID_SESSION,
        'worker-dispatch-id': UUID_DISPATCH,
        'ipc-envelope-path': ENV_REL_PATH,
      });
    } finally {
      if (prev === undefined) delete process.env.MCCP_DISPATCH_CONTEXT;
      else process.env.MCCP_DISPATCH_CONTEXT = prev;
    }
  });
}

test('validate-cmd-envelope: happy path — envelope present, dispatch_id matches, own slug in receipts_added', function () {
  const { repo, planRel } = setupRepo();
  writeReceiptsForChain(repo, planRel);
  writeEnvelope(repo, {});
  const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
  // /mccp:pr requires both plan-codex + implement-codex. Plan is not stale here
  // because we didn't append to it, and the implement-codex receipt carries the
  // controller-context fields — so the envelope check fires.
  assert.deepStrictEqual(r.blocking.filter(b => b.kind === 'envelope-mismatch'), []);
});

test('validate-cmd-envelope: envelope missing on disk → blocking envelope-mismatch', function () {
  const { repo, planRel } = setupRepo();
  writeReceiptsForChain(repo, planRel);
  // Don't write envelope.
  const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
  assert.strictEqual(r.ok, false);
  const env = r.blocking.find(b => b.kind === 'envelope-mismatch');
  assert.ok(env, 'expected envelope-mismatch blocking entry, got ' + JSON.stringify(r.blocking));
  assert.match(env.reason, /envelope load failed/);
});

test('validate-cmd-envelope: dispatch_id mismatch → blocking envelope-mismatch', function () {
  const { repo, planRel } = setupRepo();
  writeReceiptsForChain(repo, planRel);
  writeEnvelope(repo, { dispatch_id: UUID_DISPATCH_OTHER });
  const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
  assert.strictEqual(r.ok, false);
  const env = r.blocking.find(b => b.kind === 'envelope-mismatch');
  assert.ok(env, 'expected envelope-mismatch entry, got ' + JSON.stringify(r.blocking));
  assert.match(env.reason, /dispatch_id .* does not match/);
});

test('validate-cmd-envelope: receipts_added missing self slug → blocking envelope-mismatch', function () {
  const { repo, planRel } = setupRepo();
  writeReceiptsForChain(repo, planRel);
  writeEnvelope(repo, { receipts_added: ['mccp-plan-codex/feature-x'] });
  const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
  assert.strictEqual(r.ok, false);
  const env = r.blocking.find(b => b.kind === 'envelope-mismatch');
  assert.ok(env, 'expected envelope-mismatch entry, got ' + JSON.stringify(r.blocking));
  assert.match(env.reason, /receipts_added missing self slug/);
});

test('validate-cmd-envelope: receipt without ipc_envelope_path skips envelope check (backward compat)', function () {
  // v0.2.x receipts have no marker and no ipc_envelope_path. The validator
  // must not attempt to load an envelope for them.
  const { repo, planRel } = setupRepo();
  withCwd(repo, function () {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({ gate: 'mccp-implement-codex', decision: 'feature-x', plan: planRel });
  });
  const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
  // No envelope-mismatch blocking entries should appear at all.
  const env = (r.blocking || []).find(b => b.kind === 'envelope-mismatch');
  assert.strictEqual(env, undefined);
});
