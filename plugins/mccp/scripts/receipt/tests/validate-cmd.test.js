'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

test('validate-cmd: unknown command → ok with reason', function () {
  const { repo } = setupRepo();
  const r = validateCommand('/mccp:nonsense', { cwd: repo });
  assert.strictEqual(r.ok, true);
  assert.match(r.reason, /out-of-scope/);
});

test('validate-cmd: prp-implement without plan-codex receipt → blocked (missing)', function () {
  const { repo } = setupRepo();
  const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.missing.length, 1);
  assert.strictEqual(r.missing[0].gate_id, 'mccp-plan-codex');
});

test('validate-cmd: prp-implement with plan-codex receipt → ok', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: stale plan_hash → blocked (stale)', function () {
  const { repo, planRel, plan } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    fs.appendFileSync(plan, '\n\nNew content added after receipt was written\n');
    const r = validateCommand('/mccp:prp-implement', {
      cwd: repo,
      decisionId: 'feature-x',
      planPath: planRel,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.stale.length, 1);
    assert.match(r.stale[0].reason, /plan file hash differs/);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: tampered subject_hash → blocked (stale)', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    raw.task_id = 'tampered-after-signing';
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stale.length, 1, JSON.stringify(result));
    assert.match(result.stale[0].reason, /subject_hash mismatch/);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: open CRITICAL question → blocked', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const resolutionFile = writeFileSync(repo, '.tmp-res.json', JSON.stringify({
      converged: false, rounds: 1, accepted: [], rejected: [],
      open_questions: [{ item: 'unresolved critical', severity: 'CRITICAL' }],
    }));
    const r = write({
      gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel,
      'resolution-file': path.relative(repo, resolutionFile),
    });
    // Re-sign after tampering with json since we wrote it through full pipeline already
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.open_critical.length, 1);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: pr requires both plan-codex AND implement-codex', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    let r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.missing.length, 1);
    assert.strictEqual(r.missing[0].gate_id, 'mccp-implement-codex');

    write({ gate: 'mccp-implement-codex', decision: 'feature-x', plan: planRel });
    r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: skipped preceding gate is treated as blocking', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  const prev = process.env.MCCP_SKIP_RECEIPT;
  process.chdir(repo);
  try {
    process.env.MCCP_SKIP_RECEIPT = '1';
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    delete process.env.MCCP_SKIP_RECEIPT;
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.blocking.length >= 1);
    assert.match(r.blocking[0].reason, /skipped/);
  } finally {
    process.chdir(cwd);
    if (prev === undefined) delete process.env.MCCP_SKIP_RECEIPT;
    else process.env.MCCP_SKIP_RECEIPT = prev;
  }
});
