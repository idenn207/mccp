'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.resolve(__dirname, '..', 'cli.js');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    timeout: 10000,
  });
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-quality-cli-'));
}

test('cli help: --help exits 0 with usage banner', () => {
  const r = runCli(['--help']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /mccp-quality v\d/);
  assert.match(r.stdout, /detect/);
  assert.match(r.stdout, /run/);
});

test('cli version: --version emits semver', () => {
  const r = runCli(['--version']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /^\d+\.\d+\.\d+/);
});

test('cli detect on empty dir emits {packageManager:null, stages:{}}', () => {
  const cwd = mkTmp();
  const r = runCli(['detect', '--cwd', cwd]);
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.packageManager, null);
  assert.deepStrictEqual(parsed.stages, {});
});

test('cli run all on empty dir exits 0 (all skipped, passed=true)', () => {
  const cwd = mkTmp();
  const r = runCli(['run', 'all', '--cwd', cwd]);
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.passed, true);
});

test('cli run with unknown stage exits 1 with error', () => {
  const r = runCli(['run', 'nonsense-stage']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /unknown stage/);
});

test('cli unknown subcommand exits 1', () => {
  const r = runCli(['banana']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /unknown subcommand/);
});

test('cli no args shows help and exits 0', () => {
  const r = runCli([]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});
