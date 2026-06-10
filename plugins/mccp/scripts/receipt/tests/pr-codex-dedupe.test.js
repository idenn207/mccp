'use strict';

// v0.2.8 Task 2.6.1 — codex_dedupe_at_pr / codex_skipped_at_pr matrix invariant.
//
// Schema invariant: codex_dedupe_at_pr + codex_skipped_at_pr cannot both be
// true (mutually exclusive skip paths — combining them masks the audit trail
// of why the Codex step was skipped). Same shape as the impeccable_skipped +
// impeccable_force_override invariant from v0.2.6.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-y.plan.md', '# feature y\n\nbody\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

function tryWrite(repo, planRel, flags) {
  // v0.3.5 — env snapshot/restore so MCCP_CODEX_DISABLED=1 ambient does not
  // auto-stamp codex_skip_reason. Mirrors codex-bridge.test.js:143-152.
  const prevEnv = process.env.MCCP_CODEX_DISABLED;
  delete process.env.MCCP_CODEX_DISABLED;
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return write(Object.assign({
      gate: 'mccp-pr-codex',
      decision: 'feature-y',
      plan: planRel,
    }, flags));
  } finally {
    process.chdir(cwd);
    if (prevEnv === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prevEnv;
  }
}

test('dedupe accepts codex_dedupe_at_pr=true alone', () => {
  const { repo, planRel } = setupRepo();
  const r = tryWrite(repo, planRel, { 'codex-dedupe-at-pr': true });
  assert.strictEqual(r.receipt.meta.codex_dedupe_at_pr, true);
  assert.strictEqual(r.receipt.meta.codex_skipped_at_pr, false);
  assert.strictEqual(r.receipt.meta.codex_skip_reason, null);
});

test('dedupe accepts codex_review_actionable_findings=true with dedupe=true', () => {
  const { repo, planRel } = setupRepo();
  // Both dedupe AND findings flagged (rare but legal — dedupe path could
  // still have residual findings from partial overlap).
  const r = tryWrite(repo, planRel, {
    'codex-dedupe-at-pr': true,
    'codex-actionable-findings': true,
  });
  assert.strictEqual(r.receipt.meta.codex_dedupe_at_pr, true);
  assert.strictEqual(r.receipt.meta.codex_review_actionable_findings, true);
});

test('dedupe REJECTS dedupe + skipped simultaneously (matrix invariant)', () => {
  const { repo, planRel } = setupRepo();
  const reason = 'cross-gate dedupe path applied via plan/implement convergence at PR step today';
  assert.throws(function () {
    tryWrite(repo, planRel, {
      'codex-dedupe-at-pr': true,
      'codex-skipped-at-pr': true,
      'codex-skip-reason': reason,
    });
  }, /codex_dedupe_at_pr \+ codex_skipped_at_pr \+ codex_disabled_at_pr.*mutually exclusive/);
});

test('dedupe defaults preserve backwards-compatibility (both false)', () => {
  const { repo, planRel } = setupRepo();
  const r = tryWrite(repo, planRel, {});
  assert.strictEqual(r.receipt.meta.codex_dedupe_at_pr, false);
  assert.strictEqual(r.receipt.meta.codex_skipped_at_pr, false);
  assert.strictEqual(r.receipt.meta.codex_skip_reason, null);
  assert.strictEqual(r.receipt.meta.codex_review_actionable_findings, false);
});

// v0.3.5 — env-level disabled honor (Plan §Task 5).

test('disabled honor: --codex-disabled-at-pr stamps canonical reason="codex_disabled"', () => {
  const { repo, planRel } = setupRepo();
  const r = tryWrite(repo, planRel, {
    'codex-disabled': true,
    'codex-disabled-at-pr': true,
  });
  assert.strictEqual(r.receipt.meta.codex_disabled, true);
  assert.strictEqual(r.receipt.meta.codex_disabled_at_pr, true);
  assert.strictEqual(r.receipt.meta.codex_skip_reason, 'codex_disabled');
});

test('disabled honor: ambient MCCP_CODEX_DISABLED=1 auto-stamps codex_disabled=true + canonical reason', () => {
  // Set the env explicitly for this test (env snapshot restores around tryWrite,
  // so we wrap with our own snapshot pair here).
  const prevEnv = process.env.MCCP_CODEX_DISABLED;
  process.env.MCCP_CODEX_DISABLED = '1';
  try {
    const { repo, planRel } = setupRepo();
    const cwd = process.cwd();
    process.chdir(repo);
    let r;
    try {
      r = write({
        gate: 'mccp-plan-codex',
        decision: 'feature-y',
        plan: planRel,
      });
    } finally {
      process.chdir(cwd);
    }
    assert.strictEqual(r.receipt.meta.codex_disabled, true);
    assert.strictEqual(r.receipt.meta.codex_skip_reason, 'codex_disabled');
    // codex_disabled_at_pr is NOT auto-set — only the explicit flag controls
    // the PR-step audit axis (caller decides).
    assert.strictEqual(r.receipt.meta.codex_disabled_at_pr, false);
  } finally {
    if (prevEnv === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prevEnv;
  }
});

test('disabled honor: 3-way mutex REJECTS dedupe + disabled simultaneously', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () {
    tryWrite(repo, planRel, {
      'codex-dedupe-at-pr': true,
      'codex-disabled': true,
      'codex-disabled-at-pr': true,
    });
  }, /mutually exclusive/);
});

test('disabled honor: 3-way mutex REJECTS skipped + disabled simultaneously', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () {
    tryWrite(repo, planRel, {
      'codex-skipped-at-pr': true,
      'codex-skip-reason': 'manual escape — should never coexist with env policy at PR step',
      'codex-disabled': true,
      'codex-disabled-at-pr': true,
    });
  }, /mutually exclusive/);
});
