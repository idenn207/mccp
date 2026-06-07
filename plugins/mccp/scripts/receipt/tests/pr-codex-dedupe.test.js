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
  }, /codex_dedupe_at_pr \+ meta\.codex_skipped_at_pr cannot both be true/);
});

test('dedupe defaults preserve backwards-compatibility (both false)', () => {
  const { repo, planRel } = setupRepo();
  const r = tryWrite(repo, planRel, {});
  assert.strictEqual(r.receipt.meta.codex_dedupe_at_pr, false);
  assert.strictEqual(r.receipt.meta.codex_skipped_at_pr, false);
  assert.strictEqual(r.receipt.meta.codex_skip_reason, null);
  assert.strictEqual(r.receipt.meta.codex_review_actionable_findings, false);
});
