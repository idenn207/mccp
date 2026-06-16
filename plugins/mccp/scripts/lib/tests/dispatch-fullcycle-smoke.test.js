'use strict';

// v1.2.0-m1 Task 11 (Codex F1 absorption) — full-cycle fixture smoke.
//
// caller↔controller↔worker contract regression WITHOUT real Agent tool
// calls. Each scenario:
//
//   1. controller.prepareDispatch writes placeholder envelopes (pending)
//   2. fake workers write terminal envelopes (or don't, for the timeout case)
//   3. dispatch-watcher polls the envelope directory
//   4. controller.mergeEnvelopes aggregates the collected envelopes
//
// 4 scenarios (mirror of plan Risks row "Caller↔controller 계약이 unit-test에
// 없음 — fixture-driven full-cycle smoke"):
//   A. both workers ok                 → receiptsAdded=2, failedWorkers=0
//   B. 1 failure                        → failedWorkers includes status="failure"
//   C. 1 timeout (envelope absent)      → watcher emits {type:"timeout"}
//   D. 1 malformed envelope             → mergeEnvelopes flags malformed slot
//
// Real Agent invocation belongs to M2 pilot — this test exists exactly to
// make sure the M1 contract is solid before that lands.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const controller = require('../dispatch-controller');
const envelope = require('../dispatch-envelope');
const watcher = require('../dispatch-watcher');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fullcycle-'));
}

function makeIdGen() {
  // Deterministic UUIDv4-shape IDs so test assertions can pin them. The 13th
  // char must be 4, the 17th char ∈ {8,9,a,b} per UUIDv4 — fake but valid by regex.
  let n = 0;
  return function () {
    n += 1;
    const seq = String(n).padStart(12, '0');
    return '11111111-2222-4333-8444-' + seq;
  };
}

function fakeWorkerWritesEnvelope(envelopePath, dispatchId, status, extras) {
  extras = extras || {};
  // The placeholder is already on disk from prepareDispatch. Workers normally
  // use envelope.markStatus; for the smoke we replicate that path directly so
  // the test stays self-contained.
  //
  // Receipt slug uses last 4 hex chars of dispatch_id so each worker contributes
  // a distinct entry — mergeEnvelopes' receiptsAdded de-dupes by slug, so
  // identical placeholders would collapse to one entry and mask coverage.
  const slugHint = String(dispatchId).slice(-4);
  return envelope.markStatus(envelopePath, status, Object.assign({
    endedAt: '2026-06-16T00:01:00Z',
    receiptsAdded: extras.receiptsAdded
      || ['mccp-implement-codex/smoke-' + status + '-' + slugHint],
    findings: extras.findings || [],
    nextAction: extras.nextAction === undefined ? null : extras.nextAction,
  }, extras.markOpts || {}));
}

function corruptEnvelopeOnDisk(envelopePath) {
  // Replace the envelope with one missing worker_exit_status — should be
  // rejected by envelope.read() AND fall through to mergeEnvelopes' guard.
  const raw = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
  delete raw.worker_exit_status;
  fs.writeFileSync(envelopePath, JSON.stringify(raw));
}

function waitForEnvelopes(envelopeDir, expectedCount, deadlineMs, pollMs) {
  return new Promise(function (resolve) {
    const collected = [];
    const events = [];
    const stopRef = {};
    function tryEmit(ev) {
      events.push(ev);
      if (ev && ev.type === 'envelope') {
        const readResult = envelope.read(ev.envelopePath);
        if (readResult.ok) {
          collected.push(readResult.envelope);
        } else {
          collected.push({ __read_error: readResult.error, __dispatch_id: ev.dispatchId });
        }
        if (collected.length >= expectedCount) {
          if (stopRef.stop) stopRef.stop();
          resolve({ collected: collected, events: events, timedOut: false });
        }
      } else if (ev && ev.type === 'timeout') {
        if (stopRef.stop) stopRef.stop();
        resolve({ collected: collected, events: events, timedOut: true });
      } else if (ev && ev.type === 'error') {
        if (stopRef.stop) stopRef.stop();
        resolve({ collected: collected, events: events, timedOut: false, error: ev.error });
      }
    }
    const handle = watcher.watch({
      envelopeDir: envelopeDir,
      deadlineMs: deadlineMs,
      onEvent: tryEmit,
    }, {
      pollMs: pollMs,
      // Force polling path for determinism. The Monitor accelerator is
      // tested in dispatch-watcher.test.js.
      watcherFactory: function () { throw new Error('force-polling-for-smoke'); },
    });
    stopRef.stop = handle.stop;
  });
}

function setupController(repo) {
  return controller.prepareDispatch({
    workers: [
      { subagentType: 'fake-a', prompt: 'task A body' },
      { subagentType: 'fake-b', prompt: 'task B body' },
    ],
    controllerSessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    parentCwd: repo,
  }, { idGen: makeIdGen() });
}

// ─── A. both workers OK ────────────────────────────────────────────────────────

test('full-cycle smoke A: both workers OK → mergeEnvelopes 2 receipts, 0 failed', async function () {
  const repo = mkRepo();
  const prep = setupController(repo);
  assert.strictEqual(prep.dispatches.length, 2);
  prep.dispatches.forEach(function (d) { assert.match(d.dispatchId, UUID_RE); });

  prep.dispatches.forEach(function (d) {
    const r = fakeWorkerWritesEnvelope(d.envelopePath, d.dispatchId, 'ok');
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  });

  const wait = await waitForEnvelopes(prep.envelopeDir, 2, 5000, 50);
  assert.strictEqual(wait.timedOut, false, 'expected envelopes within deadline');
  assert.strictEqual(wait.collected.length, 2);

  const merge = controller.mergeEnvelopes(wait.collected);
  assert.strictEqual(merge.failedWorkers.length, 0,
    'no failed workers expected, got: ' + JSON.stringify(merge.failedWorkers));
  assert.strictEqual(merge.receiptsAdded.length, 2);
  // Slug suffixes pin to dispatch_id tail — confirms each worker's slug surfaces.
  merge.receiptsAdded.forEach(function (slug) {
    assert.match(slug, /^mccp-implement-codex\/smoke-ok-/);
  });
});

// ─── B. 1 worker failure ───────────────────────────────────────────────────────

test('full-cycle smoke B: 1 ok + 1 failure → failedWorkers reflects status', async function () {
  const repo = mkRepo();
  const prep = setupController(repo);
  fakeWorkerWritesEnvelope(prep.dispatches[0].envelopePath, prep.dispatches[0].dispatchId, 'ok');
  fakeWorkerWritesEnvelope(prep.dispatches[1].envelopePath, prep.dispatches[1].dispatchId, 'failure');

  const wait = await waitForEnvelopes(prep.envelopeDir, 2, 5000, 50);
  assert.strictEqual(wait.timedOut, false);
  const merge = controller.mergeEnvelopes(wait.collected);
  const failed = merge.failedWorkers.find(f => f.status === 'failure');
  assert.ok(failed, 'expected one failed worker with status=failure, got: ' + JSON.stringify(merge.failedWorkers));
  assert.strictEqual(failed.reason, 'worker-non-ok-exit');
});

// ─── C. 1 worker timeout ───────────────────────────────────────────────────────

test('full-cycle smoke C: 1 envelope absent → watcher emits timeout, mergeEnvelopes flags pending', async function () {
  const repo = mkRepo();
  const prep = setupController(repo);
  fakeWorkerWritesEnvelope(prep.dispatches[0].envelopePath, prep.dispatches[0].dispatchId, 'ok');
  // Worker 1's envelope stays as placeholder (pending) — never marked terminal.

  // Short deadline so the test stays fast; expectedCount inflated so timeout fires.
  const wait = await waitForEnvelopes(prep.envelopeDir, 999, 1500, 50);
  assert.strictEqual(wait.timedOut, true,
    'expected timeout because expectedCount cannot be reached');

  const pending = envelope.read(prep.dispatches[1].envelopePath);
  assert.strictEqual(pending.ok, true);
  assert.strictEqual(pending.envelope.worker_exit_status, 'pending');

  const merge = controller.mergeEnvelopes([
    envelope.read(prep.dispatches[0].envelopePath).envelope,
    pending.envelope,
  ]);
  const pendingFlag = merge.failedWorkers.find(f => f.reason === 'envelope-still-pending');
  assert.ok(pendingFlag, 'expected envelope-still-pending flag, got: ' +
    JSON.stringify(merge.failedWorkers));
});

// ─── D. 1 malformed envelope ───────────────────────────────────────────────────

test('full-cycle smoke D: 1 malformed envelope → mergeEnvelopes guards via failedWorkers', function () {
  const repo = mkRepo();
  const prep = setupController(repo);
  fakeWorkerWritesEnvelope(prep.dispatches[0].envelopePath, prep.dispatches[0].dispatchId, 'ok');
  fakeWorkerWritesEnvelope(prep.dispatches[1].envelopePath, prep.dispatches[1].dispatchId, 'ok');
  corruptEnvelopeOnDisk(prep.dispatches[1].envelopePath);

  const goodRead = envelope.read(prep.dispatches[0].envelopePath);
  const badRead = envelope.read(prep.dispatches[1].envelopePath);
  assert.strictEqual(goodRead.ok, true);
  assert.strictEqual(badRead.ok, false, 'corrupt envelope read should fail validation');

  // mergeEnvelopes is the safety net: it must guard against undefined status
  // even if a caller passes a hand-constructed object.
  const corruptObj = JSON.parse(fs.readFileSync(prep.dispatches[1].envelopePath, 'utf8'));
  const merge = controller.mergeEnvelopes([goodRead.envelope, corruptObj]);
  const malformed = merge.failedWorkers.find(f => f.reason === 'worker-non-ok-exit'
    && f.status === undefined);
  assert.ok(malformed, 'expected malformed envelope to surface as worker-non-ok-exit ' +
    'with status=undefined, got: ' + JSON.stringify(merge.failedWorkers));
});
