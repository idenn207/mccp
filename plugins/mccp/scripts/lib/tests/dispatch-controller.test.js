'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const controller = require('../dispatch-controller');
const envelope = require('../dispatch-envelope');

const CONTROLLER_SESSION_ID = '019eced3-cce9-7be3-81a1-c8a5c30a27fe';
const STATIC_DISPATCH_ID_A = '019ecedf-1234-5678-9abc-def012345678';
const STATIC_DISPATCH_ID_B = '019ecee0-aaaa-bbbb-cccc-dddddddddddd';
const STATIC_STARTED_AT = '2026-06-16T05:00:00.000Z';

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-controller-test-'));
}

function rimraf(target) {
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
}

function makeWorker(over) {
  return Object.assign({
    subagentType: 'mccp:code-reviewer',
    prompt: 'review the local diff',
  }, over || {});
}

// ── envSnapshotFor ────────────────────────────────────────────────────────

test('envSnapshotFor extracts only declared keys', () => {
  const snap = controller.envSnapshotFor({
    MCCP_RECEIPT_GATE_MODE: 'hard',
    MCCP_ALLOW_CODEX_UNAVAILABLE: '1',
    UNRELATED_VAR: 'noise',
  });
  assert.deepStrictEqual(snap, {
    MCCP_RECEIPT_GATE_MODE: 'hard',
    MCCP_ALLOW_CODEX_UNAVAILABLE: '1',
  });
});

test('envSnapshotFor drops empty / null values', () => {
  const snap = controller.envSnapshotFor({
    MCCP_RECEIPT_GATE_MODE: '',
    MCCP_ALLOW_CODEX_UNAVAILABLE: null,
    MCCP_CODEX_DISABLED: undefined,
    CLAUDE_PLUGIN_ROOT: 'C:/Users/x/.claude/plugins/cache/mccp/mccp/1.2.0',
  });
  assert.deepStrictEqual(snap, {
    CLAUDE_PLUGIN_ROOT: 'C:/Users/x/.claude/plugins/cache/mccp/mccp/1.2.0',
  });
});

test('envSnapshotFor handles non-object input', () => {
  assert.deepStrictEqual(controller.envSnapshotFor(null), {});
  assert.deepStrictEqual(controller.envSnapshotFor(undefined), {});
  assert.deepStrictEqual(controller.envSnapshotFor('string'), {});
});

// ── buildWorkerPrompt ─────────────────────────────────────────────────────

test('buildWorkerPrompt includes dispatch_id, subagent, env block, base', () => {
  const text = controller.buildWorkerPrompt({
    workerSubagentType: 'mccp:code-reviewer',
    dispatchId: STATIC_DISPATCH_ID_A,
    envSnapshot: { MCCP_RECEIPT_GATE_MODE: 'hard' },
    basePrompt: 'do the thing',
  });
  assert.ok(text.indexOf(STATIC_DISPATCH_ID_A) !== -1, 'dispatch_id present');
  assert.ok(text.indexOf('mccp:code-reviewer') !== -1, 'subagent present');
  assert.ok(text.indexOf('MCCP_RECEIPT_GATE_MODE=hard') !== -1, 'env line present');
  assert.ok(text.indexOf('do the thing') !== -1, 'base prompt present');
});

test('buildWorkerPrompt empty env emits "(none ...)" sentinel', () => {
  const text = controller.buildWorkerPrompt({
    workerSubagentType: 'mccp:code-reviewer',
    dispatchId: STATIC_DISPATCH_ID_A,
    envSnapshot: {},
    basePrompt: 'noop',
  });
  assert.ok(text.indexOf('(none — worker uses default env)') !== -1);
});

// ── placeholderEnvelope ───────────────────────────────────────────────────

test('placeholderEnvelope passes dispatch-envelope.validate', () => {
  const ph = controller.placeholderEnvelope({
    dispatchId: STATIC_DISPATCH_ID_A,
    workerSubagentType: 'mccp:code-reviewer',
    controllerSessionId: CONTROLLER_SESSION_ID,
    parentCwd: 'C:/repo',
    startedAt: STATIC_STARTED_AT,
  });
  const result = envelope.validate(ph);
  assert.strictEqual(result.ok, true, result.errors.join('; '));
  assert.strictEqual(ph.worker_exit_status, 'pending');
  assert.strictEqual(ph.worker_ended_at, null);
});

// ── prepareDispatch ───────────────────────────────────────────────────────

test('prepareDispatch: empty workers throws', () => {
  assert.throws(() => controller.prepareDispatch({
    workers: [],
    controllerSessionId: CONTROLLER_SESSION_ID,
  }), TypeError);
});

test('prepareDispatch: missing/invalid controllerSessionId throws', () => {
  assert.throws(() => controller.prepareDispatch({
    workers: [makeWorker()],
    controllerSessionId: 'not-a-uuid',
  }), TypeError);
});

test('prepareDispatch: worker missing subagentType throws', () => {
  assert.throws(() => controller.prepareDispatch({
    workers: [{ prompt: 'p' }],
    controllerSessionId: CONTROLLER_SESSION_ID,
  }), TypeError);
});

test('prepareDispatch: writes pending placeholder + returns dispatches[] with DI', () => {
  const sb = makeSandbox();
  try {
    const ids = [STATIC_DISPATCH_ID_A, STATIC_DISPATCH_ID_B];
    let idx = 0;
    const result = controller.prepareDispatch({
      workers: [makeWorker(), makeWorker({ subagentType: 'mccp:security-reviewer' })],
      controllerSessionId: CONTROLLER_SESSION_ID,
      parentCwd: sb,
      env: {
        MCCP_RECEIPT_GATE_MODE: 'hard',
        UNRELATED: 'noise',
      },
    }, {
      idGen: () => ids[idx++],
      nowIso: () => STATIC_STARTED_AT,
    });

    assert.strictEqual(result.dispatches.length, 2);
    assert.strictEqual(result.dispatches[0].dispatchId, STATIC_DISPATCH_ID_A);
    assert.strictEqual(result.dispatches[1].dispatchId, STATIC_DISPATCH_ID_B);
    assert.deepStrictEqual(result.envSnapshot, { MCCP_RECEIPT_GATE_MODE: 'hard' });
    assert.strictEqual(result.startedAt, STATIC_STARTED_AT);
    assert.strictEqual(result.envelopeDir, path.join(sb, '.claude', 'state', 'dispatches'));

    result.dispatches.forEach((d) => {
      const r = envelope.read(d.envelopePath);
      assert.strictEqual(r.ok, true, r.error);
      assert.strictEqual(r.envelope.worker_exit_status, 'pending');
      assert.strictEqual(r.envelope.worker_ended_at, null);
      assert.strictEqual(r.envelope.controller_session_id, CONTROLLER_SESSION_ID);
      assert.strictEqual(r.envelope.parent_cwd, sb);
    });

    assert.ok(result.dispatches[0].prompt.indexOf('MCCP_RECEIPT_GATE_MODE=hard') !== -1);
    assert.strictEqual(result.dispatches[0].prompt.indexOf('UNRELATED='), -1);
  } finally { rimraf(sb); }
});

test('prepareDispatch: DI envelopeWrite captures all writes (no real fs)', () => {
  const writes = [];
  const result = controller.prepareDispatch({
    workers: [makeWorker(), makeWorker()],
    controllerSessionId: CONTROLLER_SESSION_ID,
    parentCwd: '/synthetic/repo',
  }, {
    idGen: () => crypto.randomUUID(),
    nowIso: () => STATIC_STARTED_AT,
    envelopeWrite: (envelopePath, body) => {
      writes.push({ envelopePath, body });
      return { ok: true };
    },
  });
  assert.strictEqual(writes.length, 2);
  assert.strictEqual(writes[0].body.worker_exit_status, 'pending');
  assert.strictEqual(writes[1].body.worker_exit_status, 'pending');
  assert.strictEqual(result.dispatches.length, 2);
});

test('prepareDispatch: idGen returning non-UUID throws loudly', () => {
  assert.throws(() => controller.prepareDispatch({
    workers: [makeWorker()],
    controllerSessionId: CONTROLLER_SESSION_ID,
  }, {
    idGen: () => 'not-a-uuid',
    envelopeWrite: () => { throw new Error('should not reach write'); },
  }), Error);
});

test('prepareDispatch: envelopeWrite failure surfaces loud error', () => {
  assert.throws(() => controller.prepareDispatch({
    workers: [makeWorker()],
    controllerSessionId: CONTROLLER_SESSION_ID,
  }, {
    idGen: () => STATIC_DISPATCH_ID_A,
    nowIso: () => STATIC_STARTED_AT,
    envelopeWrite: () => ({ ok: false, error: 'disk full' }),
  }), /placeholder write failed/);
});

// ── mergeEnvelopes ────────────────────────────────────────────────────────

function syntheticTerminal(over) {
  return Object.assign({
    schema_version: 'v1',
    dispatch_id: STATIC_DISPATCH_ID_A,
    worker_subagent_type: 'mccp:code-reviewer',
    worker_started_at: STATIC_STARTED_AT,
    worker_ended_at: '2026-06-16T05:01:00.000Z',
    worker_exit_status: 'ok',
    receipts_added: ['mccp-code-reviewer/abc.json'],
    findings: [],
    next_action: null,
    controller_session_id: CONTROLLER_SESSION_ID,
    parent_cwd: '/synthetic/repo',
  }, over || {});
}

test('mergeEnvelopes: invalid input throws', () => {
  assert.throws(() => controller.mergeEnvelopes(null), TypeError);
  assert.throws(() => controller.mergeEnvelopes('string'), TypeError);
});

test('mergeEnvelopes: all ok → no failedWorkers, dedup receipts', () => {
  const result = controller.mergeEnvelopes([
    syntheticTerminal({ dispatch_id: STATIC_DISPATCH_ID_A, receipts_added: ['r1', 'r2'] }),
    syntheticTerminal({ dispatch_id: STATIC_DISPATCH_ID_B, receipts_added: ['r2', 'r3'] }),
  ]);
  assert.deepStrictEqual(result.failedWorkers, []);
  assert.deepStrictEqual(result.receiptsAdded.sort(), ['r1', 'r2', 'r3']);
  assert.deepStrictEqual(result.findings, []);
});

test('mergeEnvelopes: failure status produces failedWorkers entry but findings still flow', () => {
  const result = controller.mergeEnvelopes([
    syntheticTerminal({
      dispatch_id: STATIC_DISPATCH_ID_A,
      worker_exit_status: 'failure',
      findings: [{ severity: 'HIGH', message: 'race observed' }],
      receipts_added: ['r-fail'],
    }),
    syntheticTerminal({
      dispatch_id: STATIC_DISPATCH_ID_B,
      receipts_added: ['r-ok'],
    }),
  ]);
  assert.strictEqual(result.failedWorkers.length, 1);
  assert.strictEqual(result.failedWorkers[0].dispatchId, STATIC_DISPATCH_ID_A);
  assert.strictEqual(result.failedWorkers[0].status, 'failure');
  assert.strictEqual(result.failedWorkers[0].reason, 'worker-non-ok-exit');
  assert.deepStrictEqual(result.receiptsAdded.sort(), ['r-fail', 'r-ok']);
  assert.strictEqual(result.findings.length, 1);
  assert.strictEqual(result.findings[0].source_dispatch_id, STATIC_DISPATCH_ID_A);
  assert.strictEqual(result.findings[0].severity, 'HIGH');
});

test('mergeEnvelopes: pending status → failedWorker with reason', () => {
  const result = controller.mergeEnvelopes([
    syntheticTerminal({
      dispatch_id: STATIC_DISPATCH_ID_A,
      worker_exit_status: 'pending',
      worker_ended_at: null,
    }),
  ]);
  assert.strictEqual(result.failedWorkers.length, 1);
  assert.strictEqual(result.failedWorkers[0].reason, 'envelope-still-pending');
});

test('mergeEnvelopes: non-object envelope entry → failedWorker', () => {
  const result = controller.mergeEnvelopes([null, 'string', [], syntheticTerminal()]);
  assert.strictEqual(result.failedWorkers.length, 3);
  result.failedWorkers.forEach((f) => assert.strictEqual(f.reason, 'envelope-not-object'));
  assert.strictEqual(result.receiptsAdded.length, 1);
});

test('mergeEnvelopes: dispatch_id attribution stamped on every finding', () => {
  const result = controller.mergeEnvelopes([
    syntheticTerminal({
      dispatch_id: STATIC_DISPATCH_ID_A,
      findings: [{ severity: 'LOW' }, { severity: 'MEDIUM' }],
    }),
    syntheticTerminal({
      dispatch_id: STATIC_DISPATCH_ID_B,
      findings: [{ severity: 'HIGH' }],
    }),
  ]);
  assert.strictEqual(result.findings.length, 3);
  const fromA = result.findings.filter((f) => f.source_dispatch_id === STATIC_DISPATCH_ID_A);
  const fromB = result.findings.filter((f) => f.source_dispatch_id === STATIC_DISPATCH_ID_B);
  assert.strictEqual(fromA.length, 2);
  assert.strictEqual(fromB.length, 1);
});
