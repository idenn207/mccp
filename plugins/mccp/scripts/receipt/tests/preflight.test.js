'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync, captureIO } = require('./helpers');
const { write } = require('../write');
const { preflight } = require('../preflight');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

test('preflight: missing --command → exit 1', function () {
  const io = captureIO();
  const code = preflight({}, io);
  assert.strictEqual(code, 1);
  assert.match(io.errput(), /--command is required/);
});

test('preflight: unknown command → exit 0 (out-of-scope)', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    const code = preflight({ command: '/mccp:nonsense' }, io);
    assert.strictEqual(code, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: missing preceding receipt → exit 2 + block stderr', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 2);
    assert.match(io.errput(), /BLOCKED/);
    assert.match(io.errput(), /MISSING.*plan-codex/);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: satisfied chain → exit 0', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    write({ gate: 'mccp-plan-codex', decision: 'x', plan: planRel });
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 0, io.errput());
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: MCCP_SKIP_RECEIPT=1 bypasses + logs', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  io.env.MCCP_SKIP_RECEIPT = '1';
  try {
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 0);
    assert.match(io.errput(), /BYPASS/);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: bypass output JSON has bypassed=true', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  io.env.MCCP_SKIP_RECEIPT = '1';
  try {
    preflight({ command: '/mccp:prp-implement' }, io);
    const out = JSON.parse(io.output());
    assert.strictEqual(out.bypassed, true);
  } finally {
    process.chdir(cwd);
  }
});
