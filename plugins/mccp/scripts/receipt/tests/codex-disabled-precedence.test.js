'use strict';

// v1.23.4 gate-guard-integrity M1, fix B — codex_skip_reason precedence.
//
// write.js used to let ambient MCCP_CODEX_DISABLED=1 overwrite an explicitly
// supplied --codex-skip-reason with the 14-char canonical 'codex_disabled'. On a
// standard install (the env var lives in the user's settings.json) that made the
// writer emit a receipt its OWN schema rejects: codex_skipped_at_pr=true runs the
// strict reason validator (≥30 chars, ≥3 words), which the canonical literal
// cannot satisfy. The audited-escape path was unusable whenever the env was set.
//
// The layer distinction is the point. codex-runner.js:234-238 deliberately keeps
// the OPPOSITE precedence — it OBSERVES what happened, so canonical operator
// policy wins there. write.js RECORDS what its caller claimed, and a recorder
// must not overwrite the claim.
//
// Every test here sets the env explicitly rather than neutralizing it: the whole
// defect only appears while MCCP_CODEX_DISABLED=1, so a suite that unsets it
// would be green against the bug.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');

const AUDITED_REASON =
  'Codex CLI quota exhausted for this billing window; cross-model review ' +
  'was obtained out-of-band before opening this PR';

function withEnv(value, fn) {
  const prev = process.env.MCCP_CODEX_DISABLED;
  if (value === undefined) delete process.env.MCCP_CODEX_DISABLED;
  else process.env.MCCP_CODEX_DISABLED = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prev;
  }
}

function writeIn(repo, planRel, args) {
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return write(Object.assign({
      gate: 'mccp-pr-codex',
      decision: 'precedence-x',
      plan: planRel,
    }, args));
  } finally { process.chdir(cwd); }
}

function setup() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/precedence-x.plan.md', '# precedence x\n\nbody\n');
  return { repo: repo, planRel: path.relative(repo, plan) };
}

test('fix B: explicit --codex-skip-reason survives ambient MCCP_CODEX_DISABLED=1', () => {
  const { repo, planRel } = setup();
  const r = withEnv('1', () => writeIn(repo, planRel, {
    'codex-skipped-at-pr': true,
    'codex-skip-reason': AUDITED_REASON,
  }));
  assert.strictEqual(r.receipt.meta.codex_skip_reason, AUDITED_REASON,
    'env canonical must NOT overwrite an explicitly supplied reason');
  // The honest ambient annotation is untouched by fix B — only precedence moved.
  assert.strictEqual(r.receipt.meta.codex_disabled, true);
  assert.strictEqual(r.receipt.meta.codex_skipped_at_pr, true);
});

test('fix B: the resulting receipt is schema-valid (it was NOT before)', () => {
  const { repo, planRel } = setup();
  // write() validates against the schema and throws on rejection, so reaching
  // this assertion IS the regression guard: pre-fix, the canonical literal
  // overwrote the audited reason and the strict validator rejected the write.
  const r = withEnv('1', () => writeIn(repo, planRel, {
    'codex-skipped-at-pr': true,
    'codex-skip-reason': AUDITED_REASON,
  }));
  assert.ok(r.receipt.receipt_hash, 'receipt sealed');
  assert.ok(r.receipt.meta.codex_skip_reason.length >= 30);
});

test('fix B: env canonical still applies as FALLBACK when no reason is supplied', () => {
  const { repo, planRel } = setup();
  const r = withEnv('1', () => writeIn(repo, planRel, { gate: 'mccp-plan-codex' }));
  assert.strictEqual(r.receipt.meta.codex_skip_reason, 'codex_disabled');
  assert.strictEqual(r.receipt.meta.codex_disabled, true);
  // Ambient env must never auto-claim the explicit PR-step audit axis.
  assert.strictEqual(r.receipt.meta.codex_disabled_at_pr, false);
});

test('fix B: --codex-disabled flag alone still yields the canonical reason', () => {
  const { repo, planRel } = setup();
  const r = withEnv(undefined, () => writeIn(repo, planRel, {
    gate: 'mccp-plan-codex',
    'codex-disabled': true,
  }));
  assert.strictEqual(r.receipt.meta.codex_skip_reason, 'codex_disabled');
});

test('fix B: valueless --codex-skip-reason (boolean true) does not leak a non-string', () => {
  const { repo, planRel } = setup();
  // A bare `--codex-skip-reason` parses to boolean true. A `|| null` idiom would
  // pass it straight through and trip schema's string|null check; the guard
  // narrows to a non-empty string, so this falls back to the env canonical.
  const r = withEnv('1', () => writeIn(repo, planRel, {
    gate: 'mccp-plan-codex',
    'codex-skip-reason': true,
  }));
  assert.strictEqual(r.receipt.meta.codex_skip_reason, 'codex_disabled');
});

test('fix B: no reason and no env → null (unchanged)', () => {
  const { repo, planRel } = setup();
  const r = withEnv(undefined, () => writeIn(repo, planRel, { gate: 'mccp-plan-codex' }));
  assert.strictEqual(r.receipt.meta.codex_skip_reason, null);
  assert.strictEqual(r.receipt.meta.codex_disabled, false);
});
