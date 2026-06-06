'use strict';

// v0.2.8 Task 2.6.5 — happy-path validation with explicit decision_id +
// matching plan. This is the inverse of validate-cmd-generic-{reject,
// no-plan-reject}: when the caller uses a specific slug AND the receipt
// matches the current plan content, validate-cmd returns ok=true.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

test('explicit-pass: --decision <specific> --plan <matching> → ok=true', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  const planRel = path.relative(repo, plan);

  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const r = validateCommand('/mccp:prp-implement', {
      cwd: repo,
      decisionId: 'feature-x',
      planPath: planRel,
    });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.missing.length, 0);
    assert.strictEqual(r.stale.length, 0);
    assert.strictEqual(r.blocking.length, 0);
  } finally {
    process.chdir(cwd);
  }
});
