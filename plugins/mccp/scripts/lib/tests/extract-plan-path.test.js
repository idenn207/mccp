'use strict';

// v0.2.8 Task 2.6.5b R6-F3 — extract-plan-path regression tests.
//
// Threat model (PR-Codex R6 Finding 3): the receipt hooks called
// validateCommand with only { decisionId, cwd }, never passing planPath.
// Result: any /mccp:* command on branch `main` or `default` with an
// explicit `--plan <path>` was treated as bare-slug + no-plan and hit
// the v0.2.8 generic-slug reject. The shared extractor below is wired
// into both receipt-prompt.js and receipt-skill.js; these tests pin
// its contract.

const test = require('node:test');
const assert = require('node:assert');
const { extractPlanPath } = require('../extract-plan-path');

test('extractPlanPath: null/undefined/empty all yield null', function () {
  assert.strictEqual(extractPlanPath(null), null);
  assert.strictEqual(extractPlanPath(undefined), null);
  assert.strictEqual(extractPlanPath(''), null);
  assert.strictEqual(extractPlanPath('   '), null);
  assert.strictEqual(extractPlanPath([]), null);
});

test('extractPlanPath: --plan <path> form (string args)', function () {
  assert.strictEqual(
    extractPlanPath('--plan .claude/plans/foo.plan.md'),
    '.claude/plans/foo.plan.md'
  );
});

test('extractPlanPath: --plan=<path> form (string args)', function () {
  assert.strictEqual(
    extractPlanPath('--plan=.claude/plans/foo.plan.md'),
    '.claude/plans/foo.plan.md'
  );
});

test('extractPlanPath: --plan with other flags interleaved', function () {
  assert.strictEqual(
    extractPlanPath('--verbose --plan plans/bar.md --dry-run'),
    'plans/bar.md'
  );
});

test('extractPlanPath: array form (Skill arguments pre-tokenized)', function () {
  assert.strictEqual(
    extractPlanPath(['--plan', 'plans/baz.md']),
    'plans/baz.md'
  );
  assert.strictEqual(
    extractPlanPath(['--plan=plans/baz.md']),
    'plans/baz.md'
  );
});

test('extractPlanPath: --plan with no value returns null (defensive)', function () {
  // Trailing --plan with no following token — caller treats as no-plan
  // (validate-cmd then applies generic-slug policy as before).
  assert.strictEqual(extractPlanPath('--plan'), null);
  assert.strictEqual(extractPlanPath(['--plan']), null);
  assert.strictEqual(extractPlanPath('--plan='), null);
});

test('extractPlanPath: no --plan token yields null', function () {
  assert.strictEqual(extractPlanPath('--standalone --verbose'), null);
  assert.strictEqual(extractPlanPath('foo bar baz'), null);
});

test('extractPlanPath: --plan-foo (lookalike flag) is NOT mistaken for --plan', function () {
  // A different flag that starts with `--plan` but is not `--plan` or
  // `--plan=` MUST NOT be parsed as the plan path. The extractor's two
  // arms guard this: exact `--plan` match, and `--plan=` prefix on a
  // single token.
  assert.strictEqual(extractPlanPath('--plan-foo bar'), null);
  assert.strictEqual(extractPlanPath('--planet earth'), null);
});

test('extractPlanPath: path with spaces in array form preserved', function () {
  // Array form (Skill) preserves spaces because args are pre-tokenized.
  assert.strictEqual(
    extractPlanPath(['--plan', 'plans with space/foo.md']),
    'plans with space/foo.md'
  );
});
