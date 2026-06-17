'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { derive } = require('../index');
const { tmpRepo, cleanup, gitInit, writeJson } = require('./helpers');
const stateWriter = require('../../state/state-writer');
const envelope = require('../../lib/dispatch-envelope');

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const DISPATCH_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_SESSION = '99999999-9999-9999-9999-999999999999';
const OTHER_DISPATCH = '88888888-8888-8888-8888-888888888888';

function ipcPath(dispatchId) {
  return '.claude/state/dispatches/' + dispatchId + '.envelope.json';
}

function writeReceipt(root, opts) {
  const p = path.join(root, '.claude', 'receipts', 'mccp-implement-codex', opts.decision + '.json');
  writeJson(p, {
    schema_version: 'v1',
    gate_id: 'mccp-implement-codex',
    phase: 'implement',
    decision_id: opts.decision,
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: '0000000',
    head_sha: '0000000',
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, open_questions: [] },
    subject_hash: 'sha256:' + '0'.repeat(64),
    receipt_hash: 'sha256:' + '0'.repeat(64),
    meta: {
      created_at: '2026-06-17T00:00:00.000Z',
      skipped: false, advisory: false, codex_skipped: false,
      security_skipped: false, impeccable_skipped: false,
      controller_context_marker_present: opts.markerPresent,
      dispatched_by_controller_session_id: opts.controllerSessionId,
      worker_dispatch_id: opts.workerDispatchId,
      ipc_envelope_path: opts.ipcEnvelopePath,
    },
  });
}

function writeEnv(root, dispatchId, sessionId) {
  const p = path.join(root, '.claude', 'state', 'dispatches', dispatchId + '.envelope.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const w = envelope.write(p, {
    schema_version: 'v1',
    dispatch_id: dispatchId,
    worker_subagent_type: 'general-purpose',
    worker_started_at: '2026-06-17T00:00:00.000Z',
    worker_ended_at: '2026-06-17T00:00:30.000Z',
    worker_exit_status: 'ok',
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: sessionId,
    parent_cwd: root,
  });
  assert.strictEqual(w.ok, true, 'envelope write failed: ' + JSON.stringify(w));
}

test('correlation: receipt ↔ envelope 4-axis happy path (Kind 1)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeEnv(root, DISPATCH_ID, SESSION_ID);
    writeReceipt(root, {
      decision: 'happy',
      markerPresent: true,
      controllerSessionId: SESSION_ID,
      workerDispatchId: DISPATCH_ID,
      ipcEnvelopePath: ipcPath(DISPATCH_ID),
    });
    const m = derive(root, { raw: true });
    const kind1 = m.correlations.filter(c => c.kind === 'receipt-attributed-to-envelope');
    assert.strictEqual(kind1.length, 1, 'expected exactly 1 Kind 1 correlation; got ' + kind1.length);
    assert.ok(kind1[0].evidence.length >= 4, 'kind1 evidence should have ≥4 axes');
  } finally {
    cleanup(root);
  }
});

test('correlation: path-content mismatch — receipt path points at uuid-A but envelope file has uuid-B (axis c fail)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    // Write envelope at path that DECLARES uuid OTHER_DISPATCH but the receipt
    // points at DISPATCH_ID file location which contains envelope of OTHER_DISPATCH.
    // We need the file at <DISPATCH_ID>.envelope.json but its parsed dispatch_id != DISPATCH_ID.
    const p = path.join(root, '.claude', 'state', 'dispatches', DISPATCH_ID + '.envelope.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    envelope.write(p, {
      schema_version: 'v1',
      dispatch_id: OTHER_DISPATCH, // mismatch with filename UUID
      worker_subagent_type: 'general-purpose',
      worker_started_at: '2026-06-17T00:00:00.000Z',
      worker_ended_at: '2026-06-17T00:00:30.000Z',
      worker_exit_status: 'ok',
      receipts_added: [],
      findings: [],
      next_action: null,
      controller_session_id: SESSION_ID,
      parent_cwd: root,
    });
    writeReceipt(root, {
      decision: 'pathmis',
      markerPresent: true,
      controllerSessionId: SESSION_ID,
      workerDispatchId: DISPATCH_ID,
      ipcEnvelopePath: ipcPath(DISPATCH_ID),
    });
    const m = derive(root, { raw: true });
    const kind1 = m.correlations.filter(c => c.kind === 'receipt-attributed-to-envelope');
    assert.strictEqual(kind1.length, 0, 'expected no Kind 1 when envelope dispatch_id mismatches path UUID');
    const axisCWarn = m.warnings.find(w => w.message && w.message.indexOf('axis (c)') !== -1);
    assert.ok(axisCWarn, 'expected axis (c) warning in model.warnings');
  } finally {
    cleanup(root);
  }
});

test('correlation: controller-session mismatch — envelope copied across worktrees (axis d fail)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeEnv(root, DISPATCH_ID, OTHER_SESSION); // envelope's session_id differs from receipt's
    writeReceipt(root, {
      decision: 'sessmis',
      markerPresent: true,
      controllerSessionId: SESSION_ID,
      workerDispatchId: DISPATCH_ID,
      ipcEnvelopePath: ipcPath(DISPATCH_ID),
    });
    const m = derive(root, { raw: true });
    const kind1 = m.correlations.filter(c => c.kind === 'receipt-attributed-to-envelope');
    assert.strictEqual(kind1.length, 0, 'expected no Kind 1 when controller_session_id mismatches');
    const axisDWarn = m.warnings.find(w => w.message && w.message.indexOf('axis (d)') !== -1);
    assert.ok(axisDWarn, 'expected axis (d) warning in model.warnings');
  } finally {
    cleanup(root);
  }
});

test('correlation: state-controller-tracks-envelope (Kind 2) emitted when state.controller_session_id matches', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeEnv(root, DISPATCH_ID, SESSION_ID);
    stateWriter.update(root, {
      taskFingerprint: 'controller-active',
      controllerSessionId: SESSION_ID,
      activeDispatchCount: 1,
      lastEvent: 'precompact',
    });
    const m = derive(root, { raw: true });
    const kind2 = m.correlations.filter(c => c.kind === 'state-controller-tracks-envelope');
    assert.strictEqual(kind2.length >= 1, true,
      'expected ≥1 Kind 2 correlation; got ' + kind2.length);
  } finally {
    cleanup(root);
  }
});
