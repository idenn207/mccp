'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const CLI = path.resolve(__dirname, '..', 'cli.js');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    timeout: 10000,
  });
}

function mkGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-state-cli-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# x\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return fs.realpathSync(dir);
}

test('cli help exits 0 and lists subcommands', () => {
  const r = runCli(['--help']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /mccp-state v\d/);
  assert.match(r.stdout, /counter/);
  assert.match(r.stdout, /fingerprint/);
  assert.match(r.stdout, /fix-task/);
  assert.match(r.stdout, /dedupe-key/);
});

test('cli version emits semver', () => {
  const r = runCli(['--version']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /^\d+\.\d+\.\d+/);
});

test('fingerprint subcommand emits 12-hex hash deterministically', () => {
  const a = runCli(['fingerprint', '--prompt', 'task A']);
  const b = runCli(['fingerprint', '--prompt', 'task A']);
  assert.strictEqual(a.status, 0);
  assert.strictEqual(a.stdout.trim(), b.stdout.trim());
  assert.match(a.stdout.trim(), /^[0-9a-f]{12}$/);
});

test('fingerprint requires --prompt', () => {
  const r = runCli(['fingerprint']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--prompt/);
});

test('counter --bump increments persistently; --reset clears', () => {
  const repo = mkGitRepo();
  const fp = '0123456789ab';
  const r1 = runCli(['counter', '--task', fp, '--bump', '--cwd', repo]);
  assert.strictEqual(r1.status, 0);
  assert.match(r1.stdout, /"count": 1/);
  const r2 = runCli(['counter', '--task', fp, '--bump', '--cwd', repo]);
  assert.match(r2.stdout, /"count": 2/);
  const r3 = runCli(['counter', '--task', fp, '--reset', '--cwd', repo]);
  assert.match(r3.stdout, /"reset": true/);
  const r4 = runCli(['counter', '--task', fp, '--cwd', repo]);
  assert.match(r4.stdout, /"count": 0/);
});

test('counter requires --task', () => {
  const r = runCli(['counter', '--bump']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--task/);
});

test('dedupe-key emits 24-hex key, deterministic per (plan, decision)', () => {
  const repo = mkGitRepo();
  const a = runCli(['dedupe-key', '--plan', 'plan.md', '--decision', 'foo', '--cwd', repo]);
  const b = runCli(['dedupe-key', '--plan', 'plan.md', '--decision', 'foo', '--cwd', repo]);
  assert.strictEqual(a.status, 0);
  assert.match(a.stdout.trim(), /^[0-9a-f]{24}$/);
  assert.strictEqual(a.stdout.trim(), b.stdout.trim());
});

test('dedupe-key requires --decision', () => {
  const r = runCli(['dedupe-key', '--plan', 'p.md']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--decision/);
});

test('fix-task --read returns exit 2 when no fix-task.md', () => {
  const repo = mkGitRepo();
  const r = runCli(['fix-task', '--read', '--cwd', repo]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /no fix-task\.md/);
});

test('fix-task without action flag exits 1', () => {
  const repo = mkGitRepo();
  const r = runCli(['fix-task', '--cwd', repo]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /pick one of/);
});

test('unknown subcommand exits 1', () => {
  const r = runCli(['banana']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /unknown subcommand/);
});
