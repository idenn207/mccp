'use strict';

// v0.2.8 Task 2.6.1 — MCCP_PR_SKIP_CODEX_REVIEW reason validator.
//
// When --codex-skipped-at-pr is set, --codex-skip-reason must satisfy the
// strict force-override-reason validator (≥30 chars, ≥3 words, no
// placeholder/URL-only/1-token banlist). Mirrors the impeccable_force_override
// reason rules from v0.2.6 — same helper, same edge cases.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-z.plan.md', '# feature z\n\nbody\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

function tryWriteSkipped(repo, planRel, reason) {
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return write({
      gate: 'mccp-pr-codex',
      decision: 'feature-z',
      plan: planRel,
      'codex-skipped-at-pr': true,
      'codex-skip-reason': reason,
    });
  } finally {
    process.chdir(cwd);
  }
}

// === POSITIVE (substantive reasons accepted) ===

test('skip-env accepts substantive reason with cause + remediation + timing', () => {
  const { repo, planRel } = setupRepo();
  const reason = 'Codex runtime pipe wedged on this branch after IDE crash; manual cross-model review confirmed out-of-band before PR window closes today';
  const r = tryWriteSkipped(repo, planRel, reason);
  assert.strictEqual(r.receipt.meta.codex_skipped_at_pr, true);
  assert.strictEqual(r.receipt.meta.codex_skip_reason, reason);
});

test('skip-env accepts reason referencing incident', () => {
  const { repo, planRel } = setupRepo();
  const reason = 'Bypass for incident INC-2026-06-07 because Codex CLI returned schema-mismatch repeatedly; security team approved out-of-band';
  const r = tryWriteSkipped(repo, planRel, reason);
  assert.strictEqual(r.receipt.meta.codex_skipped_at_pr, true);
});

// === REJECT (validator filters bad reasons) ===

test('skip-env REJECTS empty reason', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () { tryWriteSkipped(repo, planRel, ''); },
    /codex_skip_reason rejected/);
});

test('skip-env REJECTS whitespace-only reason', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () { tryWriteSkipped(repo, planRel, '   '); },
    /codex_skip_reason rejected/);
});

test('skip-env REJECTS one-token banlist token', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () { tryWriteSkipped(repo, planRel, 'yes'); },
    /codex_skip_reason rejected/);
});

test('skip-env REJECTS URL-only reason', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () { tryWriteSkipped(repo, planRel, 'https://example.com/incident/123'); },
    /codex_skip_reason rejected/);
});

test('skip-env REJECTS under-30-character reason', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () { tryWriteSkipped(repo, planRel, 'too short reason here'); },
    /codex_skip_reason rejected/);
});

test('skip-env REJECTS placeholder reason', () => {
  const { repo, planRel } = setupRepo();
  assert.throws(function () { tryWriteSkipped(repo, planRel, 'placeholder reason for testing not real today'); },
    /codex_skip_reason rejected/);
});

test('skip-env REJECTS fewer than 3 words', () => {
  const { repo, planRel } = setupRepo();
  const long = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 1 token long
  assert.throws(function () { tryWriteSkipped(repo, planRel, long); },
    /codex_skip_reason rejected/);
});

// codex_skipped_at_pr=true without --codex-skip-reason → REJECT
test('skip-env REJECTS when codex_skipped_at_pr=true but no reason supplied', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    assert.throws(function () {
      write({
        gate: 'mccp-pr-codex',
        decision: 'feature-z',
        plan: planRel,
        'codex-skipped-at-pr': true,
        // no reason at all
      });
    }, /codex_skip_reason/);
  } finally {
    process.chdir(cwd);
  }
});
