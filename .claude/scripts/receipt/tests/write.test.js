'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write, buildReceipt } = require('../write');
const { validate } = require('../schema');
const { subjectHash } = require('../hash');

test('write: minimal valid receipt is written and passes schema', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md',
    '# Plan: feature-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const result = write({
      gate: 'mccp-plan-codex',
      decision: 'feature-x',
      plan: path.relative(repo, plan),
    });
    assert.match(result.path, /\.claude[\\\/]receipts[\\\/]mccp-plan-codex[\\\/]feature-x\.json$/);
    const v = validate(result.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(result.receipt.gate_id, 'mccp-plan-codex');
    assert.strictEqual(result.receipt.phase, 'plan');
    assert.strictEqual(result.receipt.decision_id, 'feature-x');
  } finally {
    process.chdir(cwd);
  }
});

test('write: subject_hash and receipt_hash both filled', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan) });
    assert.match(r.receipt.subject_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(r.receipt.receipt_hash, /^sha256:[0-9a-f]{64}$/);
  } finally {
    process.chdir(cwd);
  }
});

test('write: design-doc array properly captured', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const d1 = writeFileSync(repo, '.claude/design/a.design.plan.md', '# A\n');
  const d2 = writeFileSync(repo, '.claude/design/b.design.plan.md', '# B\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'plan-impeccable',
      decision: 'x',
      plan: path.relative(repo, plan),
      'design-doc': [path.relative(repo, d1), path.relative(repo, d2)],
    });
    assert.strictEqual(r.receipt.design_doc_hash.length, 2);
    assert.match(r.receipt.design_doc_hash[0].sha256, /^sha256:[0-9a-f]{64}$/);
  } finally {
    process.chdir(cwd);
  }
});

test('write: MCCP_SKIP_RECEIPT sets meta.skipped=true with reason', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  const prev = process.env.MCCP_SKIP_RECEIPT;
  process.env.MCCP_SKIP_RECEIPT = '1';
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan) });
    assert.strictEqual(r.receipt.meta.skipped, true);
    assert.strictEqual(r.receipt.meta.skip_reason, 'MCCP_SKIP_RECEIPT=1');
  } finally {
    process.chdir(cwd);
    if (prev === undefined) delete process.env.MCCP_SKIP_RECEIPT;
    else process.env.MCCP_SKIP_RECEIPT = prev;
  }
});

test('write: auto-round increments existing round', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r1 = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan), round: 1 });
    assert.strictEqual(r1.receipt.round, 1);
    const r2 = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan), 'auto-round': true });
    assert.strictEqual(r2.receipt.round, 2);
    const r3 = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan), 'auto-round': true });
    assert.strictEqual(r3.receipt.round, 3);
  } finally {
    process.chdir(cwd);
  }
});

test('write: rejects unknown gate_id', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    assert.throws(function () {
      write({ gate: 'made-up', decision: 'x', plan: path.relative(repo, plan) });
    }, /invalid --gate/);
  } finally {
    process.chdir(cwd);
  }
});

test('write: rejects missing required flags', function () {
  assert.throws(function () { write({}); }, /--gate is required/);
  assert.throws(function () { write({ gate: 'mccp-plan-codex' }); }, /--decision is required/);
  assert.throws(function () { write({ gate: 'mccp-plan-codex', decision: 'x' }); }, /--plan is required/);
});

test('write: findings-file is read into receipt', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const findings = writeFileSync(repo, '.tmp-findings.json', JSON.stringify([
    { severity: 'HIGH', area: 'arch', description: 'something' },
  ]));
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'x',
      plan: path.relative(repo, plan),
      'findings-file': path.relative(repo, findings),
    });
    assert.strictEqual(r.receipt.findings.length, 1);
    assert.strictEqual(r.receipt.findings[0].severity, 'HIGH');
  } finally {
    process.chdir(cwd);
  }
});

test('buildReceipt: subject_hash matches recomputation', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const built = buildReceipt({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan) });
    assert.strictEqual(built.receipt.subject_hash, subjectHash(built.receipt));
  } finally {
    process.chdir(cwd);
  }
});
