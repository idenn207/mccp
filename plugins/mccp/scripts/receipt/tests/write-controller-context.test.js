'use strict';

// v1.2.0-m1 Task 6 — controller-worker attribution write path.
//
// Verifies the marker-gated all-or-nothing invariant at the CLI surface:
//   1. No marker + no flags          → marker=false, 3 fields null (backward compat)
//   2. Env marker + all 3 flags      → marker=true, 3 fields stamped
//   3. Env marker + 2 of 3 flags     → DISPATCH_MARKER_MISSING_FIELDS (exit 12)
//   4. Envelope-path marker + all 3  → marker=true (file existence triggers marker)
//   5. Any flag without marker       → still requires all 3 (fail-closed)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');

const UUID_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID_DISPATCH = '11111111-2222-3333-4444-555555555555';
const ENV_REL_PATH = '.claude/state/dispatches/' + UUID_DISPATCH + '.envelope.json';

function withCwd(repo, fn) {
  const prev = process.cwd();
  process.chdir(repo);
  try { return fn(); } finally { process.chdir(prev); }
}

function clearDispatchEnv() {
  const prev = process.env.MCCP_DISPATCH_CONTEXT;
  delete process.env.MCCP_DISPATCH_CONTEXT;
  return prev;
}

function restoreDispatchEnv(prev) {
  if (prev === undefined) delete process.env.MCCP_DISPATCH_CONTEXT;
  else process.env.MCCP_DISPATCH_CONTEXT = prev;
}

test('write-controller-context: no marker + no flags writes marker=false (backward compat)', function () {
  const prev = clearDispatchEnv();
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  try {
    withCwd(repo, function () {
      const r = write({
        gate: 'mccp-implement-codex',
        decision: 'x',
        plan: path.relative(repo, plan),
      });
      assert.strictEqual(r.receipt.meta.controller_context_marker_present, false);
      assert.strictEqual(r.receipt.meta.dispatched_by_controller_session_id, null);
      assert.strictEqual(r.receipt.meta.worker_dispatch_id, null);
      assert.strictEqual(r.receipt.meta.ipc_envelope_path, null);
    });
  } finally { restoreDispatchEnv(prev); }
});

test('write-controller-context: MCCP_DISPATCH_CONTEXT=1 + all 3 flags writes marker=true', function () {
  const prev = clearDispatchEnv();
  process.env.MCCP_DISPATCH_CONTEXT = '1';
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  try {
    withCwd(repo, function () {
      const r = write({
        gate: 'mccp-implement-codex',
        decision: 'x',
        plan: path.relative(repo, plan),
        'dispatched-by-controller-session': UUID_SESSION,
        'worker-dispatch-id': UUID_DISPATCH,
        'ipc-envelope-path': ENV_REL_PATH,
      });
      assert.strictEqual(r.receipt.meta.controller_context_marker_present, true);
      assert.strictEqual(r.receipt.meta.dispatched_by_controller_session_id, UUID_SESSION);
      assert.strictEqual(r.receipt.meta.worker_dispatch_id, UUID_DISPATCH);
      assert.strictEqual(r.receipt.meta.ipc_envelope_path, ENV_REL_PATH);
    });
  } finally { restoreDispatchEnv(prev); }
});

test('write-controller-context: MCCP_DISPATCH_CONTEXT=1 + 2 of 3 flags fail-closed', function () {
  const prev = clearDispatchEnv();
  process.env.MCCP_DISPATCH_CONTEXT = '1';
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  try {
    withCwd(repo, function () {
      assert.throws(function () {
        write({
          gate: 'mccp-implement-codex',
          decision: 'x',
          plan: path.relative(repo, plan),
          'dispatched-by-controller-session': UUID_SESSION,
          'worker-dispatch-id': UUID_DISPATCH,
          // ipc-envelope-path missing
        });
      }, function (err) {
        assert.strictEqual(err.code, 'DISPATCH_MARKER_MISSING_FIELDS');
        assert.match(err.message, /ipc-envelope-path/);
        return true;
      });
    });
  } finally { restoreDispatchEnv(prev); }
});

test('write-controller-context: envelope file existence triggers marker without env var', function () {
  const prev = clearDispatchEnv();
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  // Create a fake envelope file so file-existence marker fires.
  writeFileSync(repo, ENV_REL_PATH, JSON.stringify({
    schema_version: 'v1',
    dispatch_id: UUID_DISPATCH,
    worker_subagent_type: 'fake',
    worker_started_at: '2026-06-16T00:00:00Z',
    worker_exit_status: 'pending',
    worker_ended_at: null,
    receipts_added: [],
    findings: [],
    controller_session_id: UUID_SESSION,
    parent_cwd: repo,
  }));
  try {
    withCwd(repo, function () {
      const r = write({
        gate: 'mccp-implement-codex',
        decision: 'x',
        plan: path.relative(repo, plan),
        'dispatched-by-controller-session': UUID_SESSION,
        'worker-dispatch-id': UUID_DISPATCH,
        'ipc-envelope-path': ENV_REL_PATH,
      });
      assert.strictEqual(r.receipt.meta.controller_context_marker_present, true);
    });
  } finally { restoreDispatchEnv(prev); }
});

test('write-controller-context: passing a single flag without marker still fail-closes', function () {
  const prev = clearDispatchEnv();
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  try {
    withCwd(repo, function () {
      assert.throws(function () {
        write({
          gate: 'mccp-implement-codex',
          decision: 'x',
          plan: path.relative(repo, plan),
          'worker-dispatch-id': UUID_DISPATCH,
        });
      }, function (err) {
        assert.strictEqual(err.code, 'DISPATCH_MARKER_MISSING_FIELDS');
        return true;
      });
    });
  } finally { restoreDispatchEnv(prev); }
});

test('write-controller-context: receipt with marker=true persists across read', function () {
  const prev = clearDispatchEnv();
  process.env.MCCP_DISPATCH_CONTEXT = '1';
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  try {
    withCwd(repo, function () {
      const r = write({
        gate: 'mccp-implement-codex',
        decision: 'x',
        plan: path.relative(repo, plan),
        'dispatched-by-controller-session': UUID_SESSION,
        'worker-dispatch-id': UUID_DISPATCH,
        'ipc-envelope-path': ENV_REL_PATH,
      });
      const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
      assert.strictEqual(raw.meta.controller_context_marker_present, true);
      assert.strictEqual(raw.meta.worker_dispatch_id, UUID_DISPATCH);
    });
  } finally { restoreDispatchEnv(prev); }
});
