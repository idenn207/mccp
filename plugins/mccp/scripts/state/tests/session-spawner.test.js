'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const spawner = require('../session-spawner');
const stateWriter = require('../state-writer');
const fixTask = require('../fix-task');

function mkRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-spawner-'));
  fs.mkdirSync(path.join(dir, '.claude', 'state'), { recursive: true });
  return fs.realpathSync(dir);
}

function mkSpawnRecorder() {
  const calls = [];
  return {
    impl: function (cmd, args, opts) {
      calls.push({ cmd: cmd, args: args, opts: opts });
      return { unref: function () {} };
    },
    calls: calls,
  };
}

test('mode=off → noop, no lock, no STATE.md write', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'critical', currentTask: 'taskA', mode: 'off',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'noop');
  assert.strictEqual(rec.calls.length, 0);
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'state', 'STATE.md')));
});

test('mode=notify → no spawn, STATE.md written with handoff_spawn', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'warning', currentTask: 'taskB', mode: 'notify',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'notify');
  assert.strictEqual(rec.calls.length, 0);
  const state = stateWriter.readState(root);
  assert.strictEqual(state.frontmatter.last_event, 'handoff_spawn');
  assert.strictEqual(state.frontmatter.session_end_imminent, true);
  assert.strictEqual(state.frontmatter.unsafe_checkpoint, false);
});

test('mode=spawn + claude missing → degrade to notify, fallbackReason recorded', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'critical', currentTask: 'taskC', mode: 'spawn',
    spawnImpl: rec.impl,
    claudeAvailable: () => false,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'notify');
  assert.strictEqual(r.fallbackReason, spawner.FALLBACK.CLAUDE_BINARY_MISSING);
  assert.strictEqual(rec.calls.length, 0);
});

test('mode=spawn + win32 platform → powershell.exe spawn', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'critical', currentTask: 'taskD', mode: 'spawn',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
    platform: 'win32',
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'spawn');
  assert.strictEqual(rec.calls.length, 1);
  assert.strictEqual(rec.calls[0].cmd, 'powershell.exe');
  assert.deepStrictEqual(rec.calls[0].args, ['-NoExit', '-Command', 'claude']);
});

test('mode=spawn + linux + tmux available → tmux new-window', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'critical', currentTask: 'taskE', mode: 'spawn',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
    platform: 'linux',
    hasTmux: () => true,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'spawn');
  assert.strictEqual(rec.calls.length, 1);
  assert.strictEqual(rec.calls[0].cmd, 'tmux');
  assert.strictEqual(rec.calls[0].args[0], 'new-window');
  assert.strictEqual(rec.calls[0].args[1], '-c');
  assert.strictEqual(rec.calls[0].args[2], root);
});

test('mode=spawn + linux + no tmux → degrade to notify', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'warning', currentTask: 'taskF', mode: 'spawn',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
    platform: 'linux',
    hasTmux: () => false,
  });
  assert.strictEqual(r.mode, 'notify');
  assert.strictEqual(r.fallbackReason, spawner.FALLBACK.TMUX_MISSING);
  assert.strictEqual(rec.calls.length, 0);
});

test('hard ceiling tier → unsafeCheckpoint=true + next_chunk mentions unsafe', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'critical', currentTask: 'taskG', mode: 'notify',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
  });
  assert.strictEqual(r.unsafeCheckpoint, true);
  assert.match(r.nextChunk, /hard-ceiling handoff/);
  assert.match(r.nextChunk, /unsafe checkpoint/);
  const state = stateWriter.readState(root);
  assert.strictEqual(state.frontmatter.unsafe_checkpoint, true);
  assert.match(state.frontmatter.next_chunk, /unsafe checkpoint/);
});

test('hard ceiling + fix-task pending → next_chunk mentions fix-task carry', () => {
  const root = mkRoot();
  fs.writeFileSync(fixTask.fixTaskPath(root), '---\nfix_task_version: 1\n---\n# x\n', 'utf8');
  const rec = mkSpawnRecorder();
  const r = spawner.spawn({
    root: root, tier: 'critical', currentTask: 'taskH', mode: 'notify',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
  });
  assert.match(r.nextChunk, /Apply fix-task\.md first/);
});

test('race-lock: concurrent same-task → second call rejected', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  // Manually plant a non-stale lock at the path for the same (tier, currentTask) hash.
  const lockPath = spawner.lockPathFor(root, 'critical', 'taskI');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    ownership_token_hash: 'deadbeef'.repeat(8),
    pid: process.pid, // alive
    host: os.hostname(), // same-host
    started_at: new Date().toISOString(),
    tier: 'critical',
    current_task_hash: spawner.taskHash('critical', 'taskI'),
    purpose: 'auto-handoff',
  }, null, 2));
  const r = spawner.spawn({
    root: root, tier: 'critical', currentTask: 'taskI', mode: 'notify',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.mode, 'noop');
  assert.match(r.fallbackReason, /lock-held/);
});

test('race-lock: stale (cross-host, old mtime) reclaimable on retry', () => {
  const root = mkRoot();
  const rec = mkSpawnRecorder();
  const lockPath = spawner.lockPathFor(root, 'warning', 'taskJ');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    ownership_token_hash: 'cafebabe'.repeat(8),
    pid: 99999, // not us
    host: 'remote-machine-xyz', // different host
    started_at: new Date(Date.now() - 120_000).toISOString(),
    tier: 'warning',
    current_task_hash: spawner.taskHash('warning', 'taskJ'),
    purpose: 'auto-handoff',
  }, null, 2));
  // backdate mtime past lease TTL (60s)
  const past = new Date(Date.now() - 90_000);
  fs.utimesSync(lockPath, past, past);
  const r = spawner.spawn({
    root: root, tier: 'warning', currentTask: 'taskJ', mode: 'notify',
    spawnImpl: rec.impl,
    claudeAvailable: () => true,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'notify');
});

test('modeFromEnv: default + valid + invalid', () => {
  assert.strictEqual(spawner.modeFromEnv({}), 'notify');
  assert.strictEqual(spawner.modeFromEnv({ MCCP_AUTO_HANDOFF: 'off' }), 'off');
  assert.strictEqual(spawner.modeFromEnv({ MCCP_AUTO_HANDOFF: 'SPAWN' }), 'spawn');
  assert.strictEqual(spawner.modeFromEnv({ MCCP_AUTO_HANDOFF: 'notify' }), 'notify');
  assert.strictEqual(spawner.modeFromEnv({ MCCP_AUTO_HANDOFF: 'invalid' }), 'notify');
  assert.strictEqual(spawner.modeFromEnv({ MCCP_AUTO_HANDOFF: '' }), 'notify');
});

test('taskHash: deterministic + different tier produces different hash', () => {
  const a = spawner.taskHash('critical', 'taskX');
  const b = spawner.taskHash('critical', 'taskX');
  const c = spawner.taskHash('warning', 'taskX');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.strictEqual(a.length, 8);
});
