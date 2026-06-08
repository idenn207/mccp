'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hook = require('../auto-handoff');

function mkRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-autohandoff-'));
  fs.mkdirSync(path.join(dir, '.claude', 'state'), { recursive: true });
  return fs.realpathSync(dir);
}

function fakeDetect(decision) {
  return function () { return decision; };
}

function fakeSpawn(calls, result) {
  return function (opts) {
    calls.push(opts);
    return result;
  };
}

function readLedger(root) {
  const p = path.join(root, hook.LEDGER_RELPATH);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

test('green tier → noop, ledger records noop, no spawn called', () => {
  const root = mkRoot();
  const spawnCalls = [];
  const r = hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'green', reason: 'below-notice', shouldHandoff: false, costUsd: 10 }),
    spawn: fakeSpawn(spawnCalls, { ok: true, mode: 'noop' }),
  });
  assert.strictEqual(r.telemetry.ok, true);
  assert.strictEqual(r.telemetry.mode, 'noop');
  assert.strictEqual(r.telemetry.tier, 'green');
  assert.strictEqual(spawnCalls.length, 0);
  const ledger = readLedger(root);
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(ledger[0].mode, 'noop');
});

test('notice tier → noop, no spawn', () => {
  const root = mkRoot();
  const spawnCalls = [];
  const r = hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'notice', reason: 'notice-stderr-only', shouldHandoff: false, costUsd: 65 }),
    spawn: fakeSpawn(spawnCalls, { ok: true, mode: 'noop' }),
  });
  assert.strictEqual(r.telemetry.tier, 'notice');
  assert.strictEqual(spawnCalls.length, 0);
});

test('soft safe + no fix-task → spawn invoked (notify mode)', () => {
  const root = mkRoot();
  const spawnCalls = [];
  const r = hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'warning', reason: 'soft-safe-no-fix-task', shouldHandoff: true, costUsd: 85 }),
    spawn: fakeSpawn(spawnCalls, { ok: true, mode: 'notify', lockPath: '/tmp/lock', unsafeCheckpoint: false }),
    mode: 'notify',
  });
  assert.strictEqual(r.telemetry.mode, 'notify');
  assert.strictEqual(spawnCalls.length, 1);
  assert.strictEqual(spawnCalls[0].tier, 'warning');
});

test('soft unsafe → no spawn (defer)', () => {
  const root = mkRoot();
  const spawnCalls = [];
  const r = hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'warning', reason: 'soft-defer-unsafe-event', shouldHandoff: false, costUsd: 90 }),
    spawn: fakeSpawn(spawnCalls, { ok: true, mode: 'noop' }),
  });
  assert.strictEqual(r.telemetry.mode, 'noop');
  assert.strictEqual(spawnCalls.length, 0);
});

test('hard ceiling → spawn invoked + unsafe_checkpoint in ledger', () => {
  const root = mkRoot();
  const spawnCalls = [];
  const r = hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'critical', reason: 'hard-ceiling-force', shouldHandoff: true, costUsd: 120, unsafeCheckpoint: true }),
    spawn: fakeSpawn(spawnCalls, { ok: true, mode: 'spawn', lockPath: '/tmp/lock', unsafeCheckpoint: true }),
    mode: 'spawn',
  });
  assert.strictEqual(r.telemetry.unsafe_checkpoint, true);
  const ledger = readLedger(root);
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(ledger[0].unsafe_checkpoint, true);
  assert.strictEqual(ledger[0].tier, 'critical');
});

test('claude missing → fallback recorded in telemetry + ledger', () => {
  const root = mkRoot();
  const spawnCalls = [];
  const r = hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'critical', reason: 'hard-ceiling-force', shouldHandoff: true, costUsd: 120 }),
    spawn: fakeSpawn(spawnCalls, {
      ok: true, mode: 'notify',
      fallbackReason: 'claude-binary-not-found',
      lockPath: '/tmp/lock',
    }),
    mode: 'spawn',
  });
  assert.strictEqual(r.telemetry.fallback_reason, 'claude-binary-not-found');
  const ledger = readLedger(root);
  assert.strictEqual(ledger[0].fallback_reason, 'claude-binary-not-found');
});

test('double-fire idempotent → second call records lock-held, ledger has 2 entries', () => {
  const root = mkRoot();
  // Simulate spawn-fn returning ok=false on second call (lock contention)
  let callCount = 0;
  const fakeSpawnContention = function (opts) {
    callCount++;
    if (callCount === 1) {
      return { ok: true, mode: 'notify', lockPath: '/tmp/lock-a' };
    }
    return { ok: false, mode: 'noop', fallbackReason: 'lock-held: live-holder', lockPath: '/tmp/lock-a' };
  };

  hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'critical', reason: 'hard-ceiling-force', shouldHandoff: true, costUsd: 120 }),
    spawn: fakeSpawnContention,
    mode: 'notify',
  });
  hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'critical', reason: 'hard-ceiling-force', shouldHandoff: true, costUsd: 120 }),
    spawn: fakeSpawnContention,
    mode: 'notify',
  });

  const ledger = readLedger(root);
  assert.strictEqual(ledger.length, 2);
  assert.strictEqual(ledger[0].fallback_reason, null);
  assert.match(ledger[1].fallback_reason, /lock-held/);
});

test('ledger schema: required fields present', () => {
  const root = mkRoot();
  hook.run(JSON.stringify({ cwd: root }), {
    root: root,
    detect: fakeDetect({ tier: 'critical', reason: 'hard-ceiling-force', shouldHandoff: true, costUsd: 120 }),
    spawn: fakeSpawn([], { ok: true, mode: 'spawn', lockPath: '/tmp/x', unsafeCheckpoint: true }),
  });
  const ledger = readLedger(root);
  const e = ledger[0];
  for (const k of ['ts', 'tier', 'mode', 'reason', 'should_handoff', 'fallback_reason', 'lock_path', 'unsafe_checkpoint', 'cost_usd']) {
    assert.ok(Object.prototype.hasOwnProperty.call(e, k), 'missing ledger key: ' + k);
  }
  assert.match(e.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test('stdin parse error → fail-open, return ok:false', () => {
  const r = hook.run('not json', { root: '/tmp/whatever' });
  assert.strictEqual(r.telemetry.ok, false);
  assert.strictEqual(r.telemetry.reason, 'stdin-parse-error');
});

test('not-a-repo cwd → skip silently', () => {
  // Pretend repoRootFor returns null by passing options.root=null and a
  // synthetic cwd. We must NOT pass root explicitly so repoRootFor runs.
  // Use a temp dir without .git and rely on git rev-parse failure.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-notrepo-'));
  const r = hook.run(JSON.stringify({ cwd: tmp }), {
    detect: fakeDetect({ tier: 'green', shouldHandoff: false }),
  });
  // git rev-parse outside repo returns non-zero; root resolves to null,
  // hook returns not-a-repo.
  assert.strictEqual(r.telemetry.ok, false);
  assert.strictEqual(r.telemetry.reason, 'not-a-repo');
});
