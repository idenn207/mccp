'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const watcher = require('../dispatch-watcher');

const DISPATCH_ID = '019eced3-cce9-7be3-81a1-c8a5c30a27fe';
const DISPATCH_ID_2 = '019ecedf-1234-5678-9abc-def012345678';

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-watcher-test-'));
}

function rimraf(target) {
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
}

function plantEnvelope(envelopeDir, dispatchId) {
  fs.mkdirSync(envelopeDir, { recursive: true });
  const target = path.join(envelopeDir, dispatchId + '.envelope.json');
  fs.writeFileSync(target, '{}', 'utf8');
  return target;
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

test('envelopeIdFromBasename extracts UUID from valid name', () => {
  assert.strictEqual(
    watcher.envelopeIdFromBasename(DISPATCH_ID + '.envelope.json'),
    DISPATCH_ID,
  );
  assert.strictEqual(
    watcher.envelopeIdFromBasename(DISPATCH_ID.toUpperCase() + '.envelope.json'),
    DISPATCH_ID.toUpperCase(),
  );
});

test('envelopeIdFromBasename returns null for non-envelope names', () => {
  assert.strictEqual(watcher.envelopeIdFromBasename('something.txt'), null);
  assert.strictEqual(watcher.envelopeIdFromBasename(DISPATCH_ID + '.envelope.json.tmp'), null);
  assert.strictEqual(watcher.envelopeIdFromBasename('not-a-uuid.envelope.json'), null);
  assert.strictEqual(watcher.envelopeIdFromBasename(''), null);
  assert.strictEqual(watcher.envelopeIdFromBasename(null), null);
});

test('Monitor (fs-watch) path: emits envelope on listener fire', () => {
  const sb = makeSandbox();
  try {
    const events = [];
    let listener = null;
    const fake = { close: function () {} };
    const factory = function (dir, l) { listener = l; return fake; };
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 10000, onEvent: (e) => events.push(e) },
      { watcherFactory: factory, pollMs: 999999 },
    );
    try {
      assert.strictEqual(w.mode(), 'fs-watch');
      plantEnvelope(sb, DISPATCH_ID);
      listener('rename', DISPATCH_ID + '.envelope.json');
      const envEvents = events.filter((e) => e.type === 'envelope');
      assert.strictEqual(envEvents.length, 1);
      assert.strictEqual(envEvents[0].dispatchId, DISPATCH_ID);
      assert.strictEqual(envEvents[0].mode, 'fs-watch');
      assert.strictEqual(envEvents[0].envelopePath, path.join(sb, DISPATCH_ID + '.envelope.json'));
    } finally { w.stop(); }
  } finally { rimraf(sb); }
});

test('polling path: watcherFactory throws → mode polling + interval picks up envelope', async () => {
  const sb = makeSandbox();
  try {
    const events = [];
    const factory = function () { const e = new Error('no-watcher'); e.code = 'ENOTSUP'; throw e; };
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 5000, onEvent: (e) => events.push(e) },
      { watcherFactory: factory, pollMs: 25 },
    );
    try {
      assert.strictEqual(w.mode(), 'polling');
      plantEnvelope(sb, DISPATCH_ID);
      await sleep(120);
      const envEvents = events.filter((e) => e.type === 'envelope');
      assert.strictEqual(envEvents.length, 1, 'polling should emit exactly once');
      assert.strictEqual(envEvents[0].dispatchId, DISPATCH_ID);
      assert.strictEqual(envEvents[0].mode, 'polling');
    } finally { w.stop(); }
  } finally { rimraf(sb); }
});

test('timeout emit: deadline fires when no envelope arrives + stops watcher', async () => {
  const sb = makeSandbox();
  try {
    const events = [];
    const factory = function () { throw new Error('skip'); };
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 40, onEvent: (e) => events.push(e) },
      { watcherFactory: factory, pollMs: 999999 },
    );
    await sleep(100);
    const timeouts = events.filter((e) => e.type === 'timeout');
    assert.strictEqual(timeouts.length, 1, 'exactly one timeout emit');
    plantEnvelope(sb, DISPATCH_ID);
    w.scanNow();
    const envAfter = events.filter((e) => e.type === 'envelope');
    assert.strictEqual(envAfter.length, 0, 'no envelope emit after timeout');
  } finally { rimraf(sb); }
});

test('stop() is idempotent — calling twice does not throw', () => {
  const sb = makeSandbox();
  try {
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 5000, onEvent: () => {} },
      { watcherFactory: () => { throw new Error('skip'); }, pollMs: 999999 },
    );
    w.stop();
    w.stop();
    w.stop();
  } finally { rimraf(sb); }
});

test('dedupes by dispatch_id — repeated scans emit at most once', () => {
  const sb = makeSandbox();
  try {
    const events = [];
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 5000, onEvent: (e) => events.push(e) },
      { watcherFactory: () => { throw new Error('skip'); }, pollMs: 999999 },
    );
    try {
      plantEnvelope(sb, DISPATCH_ID);
      w.scanNow();
      w.scanNow();
      w.scanNow();
      const envEvents = events.filter((e) => e.type === 'envelope');
      assert.strictEqual(envEvents.length, 1, 'dedupe must hold across scans');
    } finally { w.stop(); }
  } finally { rimraf(sb); }
});

test('multiple distinct envelopes emit separately', () => {
  const sb = makeSandbox();
  try {
    const events = [];
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 5000, onEvent: (e) => events.push(e) },
      { watcherFactory: () => { throw new Error('skip'); }, pollMs: 999999 },
    );
    try {
      plantEnvelope(sb, DISPATCH_ID);
      plantEnvelope(sb, DISPATCH_ID_2);
      w.scanNow();
      const envEvents = events.filter((e) => e.type === 'envelope');
      assert.strictEqual(envEvents.length, 2);
      const ids = envEvents.map((e) => e.dispatchId).sort();
      assert.deepStrictEqual(ids, [DISPATCH_ID, DISPATCH_ID_2].sort());
    } finally { w.stop(); }
  } finally { rimraf(sb); }
});

test('ENOENT directory does not emit error (controller-friendly)', () => {
  const sb = makeSandbox();
  try {
    const missingDir = path.join(sb, 'does-not-exist');
    const events = [];
    const w = watcher.watch(
      { envelopeDir: missingDir, deadlineMs: 5000, onEvent: (e) => events.push(e) },
      { watcherFactory: () => { throw new Error('skip'); }, pollMs: 999999 },
    );
    try {
      w.scanNow();
      const errors = events.filter((e) => e.type === 'error');
      assert.strictEqual(errors.length, 0, 'ENOENT must not propagate as error');
    } finally { w.stop(); }
  } finally { rimraf(sb); }
});

test('non-ENOENT readdir failure surfaces as error event', () => {
  const sb = makeSandbox();
  try {
    const events = [];
    const fsImpl = {
      readdirSync: function () {
        const e = new Error('permission denied'); e.code = 'EACCES'; throw e;
      },
    };
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 5000, onEvent: (e) => events.push(e) },
      { fsImpl: fsImpl, watcherFactory: () => { throw new Error('skip'); }, pollMs: 999999 },
    );
    try {
      w.scanNow();
      const errors = events.filter((e) => e.type === 'error');
      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].error.indexOf('permission denied') !== -1);
    } finally { w.stop(); }
  } finally { rimraf(sb); }
});

test('MCCP_ORCHESTRATOR_POLL_MS env override is honored when opts.pollMs omitted', () => {
  const prev = process.env.MCCP_ORCHESTRATOR_POLL_MS;
  process.env.MCCP_ORCHESTRATOR_POLL_MS = '37';
  const sb = makeSandbox();
  try {
    const w = watcher.watch(
      { envelopeDir: sb, deadlineMs: 5000, onEvent: () => {} },
      { watcherFactory: () => { throw new Error('skip'); } },
    );
    w.stop();
  } finally {
    rimraf(sb);
    if (prev === undefined) delete process.env.MCCP_ORCHESTRATOR_POLL_MS;
    else process.env.MCCP_ORCHESTRATOR_POLL_MS = prev;
  }
});

test('invalid args throw TypeError', () => {
  assert.throws(() => watcher.watch({ envelopeDir: '', deadlineMs: 1000, onEvent: () => {} }), TypeError);
  assert.throws(() => watcher.watch({ envelopeDir: 'd', deadlineMs: 0, onEvent: () => {} }), TypeError);
  assert.throws(() => watcher.watch({ envelopeDir: 'd', deadlineMs: -1, onEvent: () => {} }), TypeError);
  assert.throws(() => watcher.watch({ envelopeDir: 'd', deadlineMs: NaN, onEvent: () => {} }), TypeError);
});
