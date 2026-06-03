'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { run, STAGE_ORDER } = require('../runner');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-quality-runner-'));
}

function makeDetection(stages) {
  return { packageManager: 'npm', stages: stages };
}

test('all stages skipped when no source detected', () => {
  const cwd = mkTmp();
  const result = run({ cwd: cwd, detection: { packageManager: null, stages: {} }, stage: 'all' });
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.stages.length, 4);
  for (const stage of result.stages) {
    assert.strictEqual(stage.status, 'skipped');
    assert.strictEqual(stage.reason, 'no source detected');
  }
});

test('STAGE_ORDER exposes the documented order', () => {
  assert.deepStrictEqual(STAGE_ORDER, ['lint', 'typecheck', 'test', 'e2e']);
});

test('single stage run honors requested stage only', () => {
  const cwd = mkTmp();
  const result = run({
    cwd: cwd,
    detection: makeDetection({}),
    stage: 'lint',
  });
  assert.strictEqual(result.stages.length, 1);
  assert.strictEqual(result.stages[0].name, 'lint');
  assert.strictEqual(result.stages[0].status, 'skipped');
});

test('e2e is skipped by default with opt-in reason', () => {
  const cwd = mkTmp();
  const result = run({
    cwd: cwd,
    detection: makeDetection({
      e2e: { command: 'npx playwright test', source: 'playwright.config.ts' },
    }),
    stage: 'e2e',
    env: { /* no MCCP_STOP_LOOP_E2E */ },
  });
  assert.strictEqual(result.stages[0].status, 'skipped');
  assert.match(result.stages[0].reason || '', /opt-in/);
});

function writeScript(repo, name, body) {
  const full = path.join(repo, name);
  fs.writeFileSync(full, body, 'utf8');
  return full;
}

function quotePath(p) {
  return '"' + p + '"';
}

test('pass: a stage that exits 0 lets the chain continue', () => {
  const cwd = mkTmp();
  const script = writeScript(cwd, 'pass.js', 'process.exit(0);');
  const cmd = quotePath(process.execPath) + ' ' + quotePath(script);
  const result = run({
    cwd: cwd,
    detection: makeDetection({
      lint: { command: cmd, source: 'test-fixture' },
    }),
    stage: 'lint',
  });
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.stages[0].status, 'pass');
  assert.strictEqual(result.stages[0].exitCode, 0);
});

test('fail-fast: lint failure stops typecheck/test/e2e from running', () => {
  const cwd = mkTmp();
  const failScript = writeScript(cwd, 'fail.js', 'process.exit(7);');
  const passScript = writeScript(cwd, 'pass.js', 'process.exit(0);');
  const failCmd = quotePath(process.execPath) + ' ' + quotePath(failScript);
  const passCmd = quotePath(process.execPath) + ' ' + quotePath(passScript);
  const result = run({
    cwd: cwd,
    detection: makeDetection({
      lint: { command: failCmd, source: 'test-fixture' },
      typecheck: { command: passCmd, source: 'test-fixture' },
      test: { command: passCmd, source: 'test-fixture' },
    }),
    stage: 'all',
    env: { /* no e2e opt-in */ },
  });
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.stages.length, 1, 'fail-fast must stop after lint');
  assert.strictEqual(result.stages[0].status, 'fail');
  assert.strictEqual(result.stages[0].exitCode, 7);
});

test('stage output is captured (stdout/stderr)', () => {
  const cwd = mkTmp();
  const script = writeScript(cwd, 'echo.js',
    'console.log("hello-out"); console.error("hello-err");');
  const cmd = quotePath(process.execPath) + ' ' + quotePath(script);
  const result = run({
    cwd: cwd,
    detection: makeDetection({
      lint: { command: cmd, source: 'test-fixture' },
    }),
    stage: 'lint',
  });
  assert.match(result.stages[0].stdout, /hello-out/);
  assert.match(result.stages[0].stderr, /hello-err/);
});

test('empty command string surfaces as error status', () => {
  const cwd = mkTmp();
  const result = run({
    cwd: cwd,
    detection: makeDetection({
      lint: { command: '   ', source: 'test-fixture' },
    }),
    stage: 'lint',
  });
  assert.strictEqual(result.stages[0].status, 'error');
  assert.match(result.stages[0].stderr, /empty command/);
});
