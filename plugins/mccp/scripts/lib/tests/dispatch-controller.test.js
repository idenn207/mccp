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

// ci-full-suite M2 갈래 P — 이 test는 "no real fs"를 제목으로 주장하면서 실제로는
// 발톱을 건드렸다. `envelopeWrite` DI는 envelope 쓰기만 가로채고, 그 뒤에
// 이어지는 `writeHeartbeat`가 `fs.mkdirSync(dir, {recursive:true})`를 그대로 돌린다
// (dispatch-controller.js의 heartbeat 블록). Windows에서는 `/synthetic/repo`가 현재
// 드라이브의 루트로 해석돼 생성되므로 조용히 통과했고, Linux에서는
// `/` 아래라 EACCES로 터졌다. 즉 플랫폼 차이가 아니라 **주장과 구현의
// 불일치**가 한 쪽 플랫폼에서만 드러난 것이다.
//
// `skipHeartbeat`는 이미 존재하는 별도 축의 opt-out이다. 그것을 켜면 제목이
// 참이 되고, 아래 마지막 단언이 그 사실을 산문이 아니라 기계로 고정한다.
test('prepareDispatch: DI envelopeWrite captures all writes (no real fs)', () => {
  const writes = [];
  const result = controller.prepareDispatch({
    workers: [makeWorker(), makeWorker()],
    controllerSessionId: CONTROLLER_SESSION_ID,
    parentCwd: '/synthetic/repo',
    skipHeartbeat: true,   // heartbeat만이 DI를 안 거치는 유일한 쓰기다
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
  // 제목의 주장을 직접 단언한다. 이것 없이는 다음 사람이 DI 밖으로
  // 새는 쓰기를 다시 들여도 (그것을 만들 수 있는 플랫폼에서는) 조용히 통과한다.
  //
  // 단언 전에 지운다. 회귀가 한 번 이 디렉토리를 만들면 그것은 수리 뒤에도
  // 디스크에 남아, 고쳐진 코드가 같은 머신에서 영구히 red가 된다 — 실패가
  // 자기 원인보다 오래 사는 형태다. 지우고 나서 묻는 것이 그 꼬리를 끊는다.
  const syntheticRoot = path.join('/synthetic', 'repo');
  const leaked = fs.existsSync(syntheticRoot);
  if (leaked) rimraf(path.join('/synthetic'));
  assert.strictEqual(leaked, false,
    'a "no real fs" test must not create the synthetic parent it names');
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

// ── v1.2.0-m1 Task 12 — heartbeat + reclaimStale (Codex F4 absorption) ────

function setupHeartbeatScenario(over) {
  over = over || {};
  const sb = makeSandbox();
  const envelopeDir = path.join(sb, '.claude', 'state', 'dispatches');
  fs.mkdirSync(envelopeDir, { recursive: true });
  const dispatchId = over.dispatchId || STATIC_DISPATCH_ID_A;
  const envelopePath = path.join(envelopeDir, dispatchId + '.envelope.json');
  const placeholder = {
    schema_version: 'v1',
    dispatch_id: dispatchId,
    worker_subagent_type: 'mccp:fake',
    worker_started_at: STATIC_STARTED_AT,
    worker_ended_at: null,
    worker_exit_status: 'pending',
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: CONTROLLER_SESSION_ID,
    parent_cwd: sb,
  };
  envelope.write(envelopePath, placeholder);
  const heartbeat = controller.writeHeartbeat(envelopePath, {
    ownershipToken: 'fixed-token-' + dispatchId,
    pid: over.pid !== undefined ? over.pid : process.pid,
    host: over.host || os.hostname(),
    nowIso: function () { return over.startedAt || STATIC_STARTED_AT; },
  });
  if (over.backdateMs !== undefined) {
    const newMtime = new Date(Date.now() - over.backdateMs);
    fs.utimesSync(heartbeat.heartbeatPath, newMtime, newMtime);
  }
  return { sandbox: sb, envelopeDir: envelopeDir, envelopePath: envelopePath,
    heartbeatPath: heartbeat.heartbeatPath, dispatchId: dispatchId };
}

test('heartbeat reclaim 1/4: live controller (same host, pid alive) → NEVER reclaim', () => {
  const sc = setupHeartbeatScenario();
  try {
    const result = controller.reclaimStale({
      envelopeDir: sc.envelopeDir,
      ttlMs: 1000,
    }, {
      pidIsAlive: function () { return true; },
    });
    assert.strictEqual(result.reclaimed.length, 0);
    assert.strictEqual(result.skipped.length, 1);
    assert.strictEqual(result.skipped[0].reason, 'pid-alive');
    const env = envelope.read(sc.envelopePath);
    assert.strictEqual(env.envelope.worker_exit_status, 'pending');
    assert.ok(fs.existsSync(sc.heartbeatPath));
  } finally { rimraf(sc.sandbox); }
});

test('heartbeat reclaim 2/4: dead pid (same host) → reclaim, envelope=crashed', () => {
  const sc = setupHeartbeatScenario();
  try {
    const result = controller.reclaimStale({
      envelopeDir: sc.envelopeDir,
      ttlMs: 1000,
    }, {
      pidIsAlive: function () { return false; },
    });
    assert.strictEqual(result.reclaimed.length, 1);
    assert.strictEqual(result.reclaimed[0].reason, 'pid-dead');
    assert.strictEqual(result.reclaimed[0].envelopeRewritten, true);
    const env = envelope.read(sc.envelopePath);
    assert.strictEqual(env.envelope.worker_exit_status, 'crashed');
    assert.match(env.envelope.worker_ended_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(!fs.existsSync(sc.heartbeatPath));
  } finally { rimraf(sc.sandbox); }
});

test('heartbeat reclaim 3/4: cross-host + mtime > ttl → reclaim (mtime-only)', () => {
  const sc = setupHeartbeatScenario({ host: 'foreign-host-xyz', backdateMs: 10000 });
  try {
    const result = controller.reclaimStale({
      envelopeDir: sc.envelopeDir,
      ttlMs: 1000,
    }, {
      pidIsAlive: function () { throw new Error('pidIsAlive must not be called for cross-host'); },
    });
    assert.strictEqual(result.reclaimed.length, 1);
    assert.strictEqual(result.reclaimed[0].reason, 'cross-host-mtime-expired');
    const env = envelope.read(sc.envelopePath);
    assert.strictEqual(env.envelope.worker_exit_status, 'crashed');
  } finally { rimraf(sc.sandbox); }
});

test('heartbeat reclaim 4/4: cross-host + fresh mtime → conservative skip (no reclaim)', () => {
  const sc = setupHeartbeatScenario({ host: 'foreign-host-xyz' });
  try {
    const result = controller.reclaimStale({
      envelopeDir: sc.envelopeDir,
      ttlMs: 60000,
    }, {
      pidIsAlive: function () { throw new Error('pidIsAlive must not be called for cross-host'); },
    });
    assert.strictEqual(result.reclaimed.length, 0);
    assert.strictEqual(result.skipped.length, 1);
    assert.strictEqual(result.skipped[0].reason, 'cross-host-fresh');
    const env = envelope.read(sc.envelopePath);
    assert.strictEqual(env.envelope.worker_exit_status, 'pending');
  } finally { rimraf(sc.sandbox); }
});

test('heartbeat reclaim extra: unparseable body falls back to mtime-only', () => {
  const sc = setupHeartbeatScenario();
  fs.writeFileSync(sc.heartbeatPath, '{not parseable', 'utf8');
  const newMtime = new Date(Date.now() - 10000);
  fs.utimesSync(sc.heartbeatPath, newMtime, newMtime);
  try {
    const result = controller.reclaimStale({
      envelopeDir: sc.envelopeDir,
      ttlMs: 1000,
    });
    assert.strictEqual(result.reclaimed.length, 1);
    assert.strictEqual(result.reclaimed[0].reason, 'unparseable-mtime-expired');
  } finally { rimraf(sc.sandbox); }
});

test('heartbeat reclaim extra: same-host + mtime > 3×ttl → far-expired safety net', () => {
  const sc = setupHeartbeatScenario({ backdateMs: 5000 });
  try {
    const result = controller.reclaimStale({
      envelopeDir: sc.envelopeDir,
      ttlMs: 1000,
    }, {
      pidIsAlive: function () { return true; },
    });
    assert.strictEqual(result.reclaimed.length, 1);
    assert.strictEqual(result.reclaimed[0].reason, 'same-host-mtime-far-expired');
  } finally { rimraf(sc.sandbox); }
});

test('heartbeat: prepareDispatch writes heartbeats per dispatch + returns ownership token', () => {
  const sb = makeSandbox();
  try {
    const prep = controller.prepareDispatch({
      workers: [makeWorker(), makeWorker({ subagentType: 'mccp:planner' })],
      controllerSessionId: CONTROLLER_SESSION_ID,
      parentCwd: sb,
    });
    assert.ok(typeof prep.ownershipToken === 'string' && prep.ownershipToken.length > 0);
    assert.strictEqual(prep.dispatches.length, 2);
    prep.dispatches.forEach(function (d) {
      assert.ok(d.heartbeatPath);
      assert.ok(fs.existsSync(d.heartbeatPath));
      const body = JSON.parse(fs.readFileSync(d.heartbeatPath, 'utf8'));
      assert.match(body.ownership_token_hash, /^sha256:[0-9a-f]{64}$/);
      assert.strictEqual(body.controller_pid, process.pid);
    });
  } finally { rimraf(sb); }
});

test('refreshHeartbeat: bumps mtime; missing file → ok=false', () => {
  const sc = setupHeartbeatScenario();
  try {
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(sc.heartbeatPath, past, past);
    const refresh = controller.refreshHeartbeat(sc.envelopePath);
    assert.strictEqual(refresh.ok, true);
    const afterStat = fs.statSync(sc.heartbeatPath);
    assert.ok(afterStat.mtimeMs > past.getTime());
    fs.unlinkSync(sc.heartbeatPath);
    const refresh2 = controller.refreshHeartbeat(sc.envelopePath);
    assert.strictEqual(refresh2.ok, false);
    assert.strictEqual(refresh2.reason, 'heartbeat-missing');
  } finally { rimraf(sc.sandbox); }
});
