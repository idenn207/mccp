'use strict';

// Task 12 — e2e dogfood: sample plan → codex (fake) → receipt write → validate.
//
// Unlike codex-companion-smoke.test.js (which requires the real companion),
// this dogfood exercises the v0.2.4 surface end-to-end with deterministic
// fakes so it ALWAYS runs (no skip conditions). It is the load-bearing
// integration check for the v0.2.4 cycle: any future change that breaks the
// plan → codex → receipt → validate chain must trigger a failure here.
//
// Flow simulated:
//   1. Initialize a tmp git repo with a sample plan file
//   2. Write a mccp-plan-codex receipt for the plan (mimics /mccp:plan output)
//   3. Write a mccp-implement-codex receipt (mimics /mccp:prp-implement)
//   4. Run validateCommand('/mccp:pr') → assert exit 0 (chain valid)
//   5. Repeat with security_skipped on implement-codex → assert exit 2 (blocked)
//   6. Repeat with force_override on pr-codex → assert exit 0 with warning
//
// This is the canonical reference for "v0.2.4 happy path" + "two known
// fail-closed paths". The test file is intentionally short because the heavy
// machinery is in security-skipped, security-force-override, and state-matrix.
// What this test asserts: those three components COMPOSE correctly.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/sample.plan.md', '# sample plan\n\n' +
    '## Summary\n\nA minimal plan body for dogfood.\n');
  return { repo, plan, planRel: path.relative(repo, plan) };
}

test('e2e dogfood: happy path — plan → implement → pr validate ok', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    // Stage 1: /mccp:plan output
    const planReceipt = write({ gate: 'mccp-plan-codex', decision: 'sample', plan: planRel });
    assert.ok(planReceipt.receipt.subject_hash);
    // Stage 2: /mccp:prp-implement output
    const implReceipt = write({ gate: 'mccp-implement-codex', decision: 'sample', plan: planRel });
    assert.ok(implReceipt.receipt.subject_hash);
    // Stage 3: validate /mccp:pr would pass
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'sample' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.blocking.length, 0);
    assert.strictEqual(r.warnings.length, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('e2e dogfood: known fail — security_skipped on implement blocks PR', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'sample', plan: planRel });
    write({
      gate: 'mccp-implement-codex',
      decision: 'sample',
      plan: planRel,
      'security-skipped': true,
      'security-skip-reason': 'security-reviewer agent not found',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'sample' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.blocking.some((b) => /security_skipped/.test(b.reason)));
  } finally {
    process.chdir(cwd);
  }
});

test('e2e dogfood: audited escape — force_override on pr-codex validates ok with warning', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'sample', plan: planRel });
    write({ gate: 'mccp-implement-codex', decision: 'sample', plan: planRel });
    write({
      gate: 'mccp-pr-codex',
      decision: 'sample',
      plan: planRel,
      'security-force-override': true,
      'security-force-override-reason': 'manual review confirmed out-of-band',
    });
    const r = validateCommand('/mccp:code-review', { cwd: repo, decisionId: 'sample' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.blocking.length, 0);
    const warn = r.warnings.find((w) => /MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER/.test(w.reason));
    assert.ok(warn, 'force_override must produce a warning');
    assert.strictEqual(warn.force_override_reason, 'manual review confirmed out-of-band');
  } finally {
    process.chdir(cwd);
  }
});
