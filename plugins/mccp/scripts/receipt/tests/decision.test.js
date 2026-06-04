'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const {
  deriveDecisionId,
  explicitDecision,
  slugFromPlanArg,
  slugFromBranch,
  firstNonFlag,
  normalizeCommand,
  isStandalone,
  isLocalReviewMode,
} = require('../decision');

function makeTmpGitRepo(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-decision-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  if (branch && branch !== 'master' && branch !== 'main') {
    execFileSync('git', ['checkout', '-q', '-b', branch], { cwd: dir });
  }
  return dir;
}

test('normalizeCommand strips leading slash and lowercases', function () {
  assert.strictEqual(normalizeCommand('/mccp:Plan'), 'mccp:plan');
  assert.strictEqual(normalizeCommand('mccp:plan'), 'mccp:plan');
  assert.strictEqual(normalizeCommand(null), null);
  assert.strictEqual(normalizeCommand(42), null);
});

test('explicitDecision matches --decision flag', function () {
  assert.strictEqual(explicitDecision('--decision feature-x'), 'feature-x');
  assert.strictEqual(explicitDecision('--decision=feature-x'), 'feature-x');
  assert.strictEqual(explicitDecision('foo --decision feature-x bar'), 'feature-x');
  assert.strictEqual(explicitDecision('no flag here'), null);
  assert.strictEqual(explicitDecision(''), null);
  assert.strictEqual(explicitDecision(null), null);
});

test('explicitDecision lowercases the slug', function () {
  assert.strictEqual(explicitDecision('--decision Feature-X'), 'feature-x');
});

test('explicitDecision rejects invalid slug shapes', function () {
  // Regex stops at first non-[a-z0-9-] char, so "Feature_X" would yield "feature"
  // which IS valid per SLUG_RE; assert that regex stops at underscore.
  assert.strictEqual(explicitDecision('--decision feature_x'), 'feature');
});

test('firstNonFlag skips --flag value pairs and --flag=value', function () {
  assert.strictEqual(firstNonFlag('--decision foo bar.plan.md'), 'bar.plan.md');
  assert.strictEqual(firstNonFlag('--decision=foo bar.plan.md'), 'bar.plan.md');
  assert.strictEqual(firstNonFlag('bar.plan.md --decision foo'), 'bar.plan.md');
  assert.strictEqual(firstNonFlag('  bar.plan.md  '), 'bar.plan.md');
  assert.strictEqual(firstNonFlag(''), null);
  assert.strictEqual(firstNonFlag('--only --flags'), null);
});

test('slugFromPlanArg strips path and .plan.md/.prd.md suffix', function () {
  assert.strictEqual(slugFromPlanArg('.claude/plans/dashboard-ui.plan.md'), 'dashboard-ui');
  assert.strictEqual(slugFromPlanArg('.claude\\plans\\dashboard-ui.plan.md'), 'dashboard-ui');
  assert.strictEqual(slugFromPlanArg('foo.prd.md'), 'foo');
  assert.strictEqual(slugFromPlanArg('feature-x.md'), 'feature-x');
  assert.strictEqual(slugFromPlanArg('plain-slug'), 'plain-slug');
});

test('slugFromPlanArg returns null for malformed args', function () {
  assert.strictEqual(slugFromPlanArg(''), null);
  assert.strictEqual(slugFromPlanArg(null), null);
  assert.strictEqual(slugFromPlanArg('--only --flags'), null);
  assert.strictEqual(slugFromPlanArg('.plan.md'), null);
});

test('slugFromBranch reads current git branch (master/main)', function () {
  const dir = makeTmpGitRepo();
  try {
    const slug = slugFromBranch(dir);
    assert.ok(slug === 'master' || slug === 'main', 'expected master or main, got: ' + slug);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('slugFromBranch strips conventional prefix (feat/, fix/, chore/, ...)', function () {
  const dir = makeTmpGitRepo('feat/auth-fix');
  try {
    assert.strictEqual(slugFromBranch(dir), 'auth-fix');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('slugFromBranch returns null when not a git repo', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-nogit-'));
  try {
    assert.strictEqual(slugFromBranch(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveDecisionId: explicit --decision wins over everything', function () {
  const dir = makeTmpGitRepo('feat/somefeature');
  try {
    assert.strictEqual(
      deriveDecisionId('mccp:prp-implement', '--decision auth-fix .claude/plans/other.plan.md', { cwd: dir }),
      'auth-fix'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveDecisionId: plan-path commands prefer plan basename', function () {
  const dir = makeTmpGitRepo('feat/branch-name');
  try {
    assert.strictEqual(
      deriveDecisionId('mccp:plan', '.claude/plans/dashboard-ui.plan.md', { cwd: dir }),
      'dashboard-ui'
    );
    assert.strictEqual(
      deriveDecisionId('mccp:prp-implement', '.claude/plans/dashboard-ui.plan.md', { cwd: dir }),
      'dashboard-ui'
    );
    assert.strictEqual(
      deriveDecisionId('mccp:plan-prd', '.claude/prds/auth.prd.md', { cwd: dir }),
      'auth'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveDecisionId: plan-path commands fall back to git branch when no path arg', function () {
  const dir = makeTmpGitRepo('feat/fallback-slug');
  try {
    assert.strictEqual(
      deriveDecisionId('mccp:plan', '', { cwd: dir }),
      'fallback-slug'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveDecisionId: branch-based commands always use git branch', function () {
  const dir = makeTmpGitRepo('feat/pr-feature');
  try {
    assert.strictEqual(deriveDecisionId('mccp:pr', 'main', { cwd: dir }), 'pr-feature');
    assert.strictEqual(deriveDecisionId('mccp:code-review', '42', { cwd: dir }), 'pr-feature');
    assert.strictEqual(deriveDecisionId('mccp:code-review', 'https://github.com/owner/repo/pull/42', { cwd: dir }), 'pr-feature');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveDecisionId: PRP/ECC aliases share branch-derivation with their canonical commands', function () {
  const dir = makeTmpGitRepo('feat/alias-feature');
  try {
    assert.strictEqual(deriveDecisionId('mccp:prp-pr', 'main', { cwd: dir }), 'alias-feature');
    assert.strictEqual(deriveDecisionId('mccp:review-pr', '42', { cwd: dir }), 'alias-feature');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveDecisionId: unknown command returns "default"', function () {
  assert.strictEqual(deriveDecisionId('foo:bar', 'anything', { cwd: process.cwd() }), 'default');
  assert.strictEqual(deriveDecisionId(null, '', { cwd: process.cwd() }), 'default');
});

test('deriveDecisionId: falls back to "default" when nothing works', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-nogit-fallback-'));
  try {
    assert.strictEqual(deriveDecisionId('mccp:pr', '', { cwd: dir }), 'default');
    assert.strictEqual(deriveDecisionId('mccp:plan', '', { cwd: dir }), 'default');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isStandalone detects the flag', function () {
  assert.strictEqual(isStandalone('--standalone'), true);
  assert.strictEqual(isStandalone('42 --standalone'), true);
  assert.strictEqual(isStandalone('--standalone 42'), true);
  assert.strictEqual(isStandalone('--standalone=true'), true);
  assert.strictEqual(isStandalone('42'), false);
  assert.strictEqual(isStandalone(''), false);
  assert.strictEqual(isStandalone(null), false);
  // Substring should not match
  assert.strictEqual(isStandalone('--standalone-mode'), false);
});

test('isLocalReviewMode treats blank/flag-only args as Local Review Mode', function () {
  // Local Mode: blank, null, whitespace, or only flags without positional
  assert.strictEqual(isLocalReviewMode(''), true);
  assert.strictEqual(isLocalReviewMode(null), true);
  assert.strictEqual(isLocalReviewMode(undefined), true);
  assert.strictEqual(isLocalReviewMode('   '), true);
  assert.strictEqual(isLocalReviewMode('--debug'), true);

  // PR Mode: PR number
  assert.strictEqual(isLocalReviewMode('42'), false);
  assert.strictEqual(isLocalReviewMode('  42  '), false);

  // PR Mode: PR URL
  assert.strictEqual(isLocalReviewMode('https://github.com/owner/repo/pull/42'), false);
  assert.strictEqual(isLocalReviewMode('github.com/owner/repo/pull/42'), false);

  // PR Mode: explicit --pr flag
  assert.strictEqual(isLocalReviewMode('--pr 42'), false);
  assert.strictEqual(isLocalReviewMode('--pr=42'), false);

  // --standalone alone (no positional) is still Local — the spec says
  // --standalone modifies PR Mode; without any positional it has nothing
  // to modify. The hook's --standalone branch handles this case before
  // isLocalReviewMode is consulted, but the helper itself shouldn't lie.
  assert.strictEqual(isLocalReviewMode('--standalone'), true);
});

test('isLocalReviewMode treats branch names as PR Review Mode (F4 fix — Codex finding)', function () {
  // Per commands/code-review.md §Phase 1 FETCH: branch names are valid PR
  // refs via `gh pr list --head <branch>`. Previously the helper narrowed
  // PR Mode to strictly PR-number / PR-URL, which mis-classified branch
  // arguments as Local Mode and bypassed the receipt chain. Codex F4 caught
  // this regression in dual-reviewer Round 1.
  assert.strictEqual(isLocalReviewMode('feat/security-fix'), false);
  assert.strictEqual(isLocalReviewMode('fix/bug-123'), false);
  assert.strictEqual(isLocalReviewMode('main'), false);
  assert.strictEqual(isLocalReviewMode('release/v1.2.3'), false);
  // Branch names with leading/trailing whitespace
  assert.strictEqual(isLocalReviewMode('  feat/security-fix  '), false);
  // Note: `firstNonFlag` conservatively treats any `--flag value` pair as
  // flag-with-value (it can't know if `--flag` is boolean or value-bearing
  // without a flag schema). So `--anything <branch>` swallows the branch.
  // mccp commands today only use `--standalone` (boolean, but hooked before
  // isLocalReviewMode) and `--pr <value>` (handled by the --pr regex above),
  // so this isn't a real-world concern. Documented here so a future
  // maintainer doesn't get surprised.

  // Edge: a typo / arbitrary string still goes to PR Mode and is rejected
  // later by `gh pr list --head`. This is intentional — local-vs-PR is a
  // shape decision (any positional → PR), not content classification.
  assert.strictEqual(isLocalReviewMode('xyz-not-a-real-branch'), false);
});
