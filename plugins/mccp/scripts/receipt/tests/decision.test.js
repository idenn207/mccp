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
  slugFromPlanPath,
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

test('slugFromPlanPath takes a direct path (no firstNonFlag tokenizer)', function () {
  assert.strictEqual(slugFromPlanPath('.claude/plans/mccp-roadmap.plan.md'), 'mccp-roadmap');
  assert.strictEqual(slugFromPlanPath('.claude\\plans\\mccp-roadmap.plan.md'), 'mccp-roadmap');
  assert.strictEqual(slugFromPlanPath('C:/abs/path/auth-fix.prd.md'), 'auth-fix');
  assert.strictEqual(slugFromPlanPath('plain.md'), 'plain');
  // Divergence from slugFromPlanArg: the caller asserts the input IS a path,
  // so the whole string becomes the basename source — multi-token strings
  // that slugFromPlanArg would tokenize are treated as invalid here.
  assert.strictEqual(slugFromPlanPath('--decision foo.plan.md'), null);
});

test('slugFromPlanPath returns null for malformed input', function () {
  assert.strictEqual(slugFromPlanPath(''), null);
  assert.strictEqual(slugFromPlanPath(null), null);
  assert.strictEqual(slugFromPlanPath(undefined), null);
  assert.strictEqual(slugFromPlanPath(42), null);
  assert.strictEqual(slugFromPlanPath('.plan.md'), null);
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

test('deriveDecisionId: opts.planPath wins over commandArgs for plan-path commands', function () {
  const dir = makeTmpGitRepo('feat/branch-fallback');
  try {
    // commandArgs points at a different path; opts.planPath should win.
    assert.strictEqual(
      deriveDecisionId('mccp:prp-implement', '.claude/plans/old-name.plan.md', {
        cwd: dir,
        planPath: '.claude/plans/mccp-roadmap.plan.md',
      }),
      'mccp-roadmap'
    );
    // explicit --decision in commandArgs still wins over opts.planPath
    assert.strictEqual(
      deriveDecisionId('mccp:plan', '--decision auth-fix', {
        cwd: dir,
        planPath: '.claude/plans/mccp-roadmap.plan.md',
      }),
      'auth-fix'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveDecisionId: opts.planPath falls through to commandArgs/branch when invalid', function () {
  const dir = makeTmpGitRepo('feat/fallback-test');
  try {
    // planPath malformed → fall through to commandArgs slug
    assert.strictEqual(
      deriveDecisionId('mccp:plan', '.claude/plans/from-args.plan.md', {
        cwd: dir,
        planPath: '.plan.md',
      }),
      'from-args'
    );
    // planPath null + no commandArgs path → branch fallback
    assert.strictEqual(
      deriveDecisionId('mccp:plan', '', { cwd: dir, planPath: null }),
      'fallback-test'
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

// v0.3.6 Task 5 (축 3) — branch normalize + plan-path / receipt fallback.

const { lastImplementReceiptSlug } = require('../decision');

function captureStderr(fn) {
  const original = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = function (chunk) { captured.push(String(chunk)); return true; };
  try { fn(); }
  finally { process.stderr.write = original; }
  return captured.join('');
}

// (A1) slugFromBranch normalize — dot-bearing version tag
test('v0.3.6 Task 5: slugFromBranch normalizes dot-bearing branch v0.3.6-foo → v0-3-6-foo', function () {
  const repo = makeTmpGitRepo('v0.3.6-foo');
  assert.strictEqual(slugFromBranch(repo), 'v0-3-6-foo');
});

// (A2) slugFromBranch normalize — underscore-bearing branch
test('v0.3.6 Task 5: slugFromBranch normalizes underscore branch feat/bar_baz → bar-baz', function () {
  const repo = makeTmpGitRepo('feat/bar_baz');
  // feat/ prefix stripped, then underscores → hyphens
  assert.strictEqual(slugFromBranch(repo), 'bar-baz');
});

// (A3) slugFromBranch normalize — combo dots + underscores
test('v0.3.6 Task 5: slugFromBranch handles mixed dots and underscores', function () {
  const repo = makeTmpGitRepo('chore/v1.2_alpha');
  assert.strictEqual(slugFromBranch(repo), 'v1-2-alpha');
});

// (A4) slugFromBranch idempotent on already-valid slug
test('v0.3.6 Task 5: slugFromBranch is idempotent on already-valid slug (no double-hyphenate)', function () {
  const repo = makeTmpGitRepo('clean-slug-already');
  assert.strictEqual(slugFromBranch(repo), 'clean-slug-already');
});

// (B1) /mccp:pr mode + dot branch + planPath → planPath wins via fallback
test('v0.3.6 Task 5: /mccp:pr branch-derived works after dot normalize (no fallback needed)', function () {
  const repo = makeTmpGitRepo('v0.3.6-codex-scope');
  // With normalize the branch slug is valid → no fallback warn
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '', { cwd: repo });
    assert.strictEqual(slug, 'v0-3-6-codex-scope');
  });
  assert.strictEqual(captured.indexOf('fell back to'), -1, 'no fallback warn expected');
});

// (B2) /mccp:pr mode + invalid branch + planPath via opts → fallback chain triggers
test('v0.3.6 Task 5: /mccp:pr mode + invalid branch + opts.planPath → planPath fallback fires + warn', function () {
  // Create a branch that DOESN'T normalize to a valid slug: starts with non-alphanumeric.
  const repo = makeTmpGitRepo('release/v1.2.3');
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '', {
      cwd: repo,
      planPath: '.claude/plans/feature-x.plan.md',
    });
    assert.strictEqual(slug, 'feature-x');
  });
  assert.match(captured, /branch slug invalid; fell back to planPath/);
});

// (B3) /mccp:pr mode + invalid branch + commandArgs has plan path
test('v0.3.6 Task 5: /mccp:pr mode + invalid branch + commandArgs path → planArg fallback fires + warn', function () {
  const repo = makeTmpGitRepo('release/v1.2.3');
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '.claude/plans/foo-bar.plan.md', { cwd: repo });
    assert.strictEqual(slug, 'foo-bar');
  });
  assert.match(captured, /fell back to planArg/);
});

// (B4) /mccp:pr mode + invalid branch + no plan args + implement receipt available
test('v0.3.6 Task 5: /mccp:pr mode + invalid branch + implement-receipt → receipt fallback fires + warn', function () {
  const repo = makeTmpGitRepo('release/v1.2.3');
  // Drop a fake implement receipt
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'recovered-slug.json'),
    JSON.stringify({ decision_id: 'recovered-slug', schema_version: 'v1' }));
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '', { cwd: repo });
    assert.strictEqual(slug, 'recovered-slug');
  });
  assert.match(captured, /fell back to implement-receipt/);
});

// (B5) /mccp:pr mode + all fallbacks fail → default
test('v0.3.6 Task 5: /mccp:pr mode + all fallbacks fail → default (no warn for default-only path)', function () {
  const repo = makeTmpGitRepo('release/v1.2.3');
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '', { cwd: repo });
    assert.strictEqual(slug, 'default');
  });
  // No success warn — we silently fell through to 'default'.
  assert.strictEqual(captured.indexOf('fell back to'), -1);
});

// (B6) Fallback priority: opts.planPath beats commandArgs planArg
test('v0.3.6 Task 5: fallback priority — opts.planPath wins over commandArgs', function () {
  const repo = makeTmpGitRepo('release/v1.2.3');
  const slug = deriveDecisionId('mccp:pr', '.claude/plans/from-args.plan.md', {
    cwd: repo,
    planPath: '.claude/plans/from-opts.plan.md',
  });
  assert.strictEqual(slug, 'from-opts');
});

// (B7) Fallback priority: planArg beats implement-receipt
test('v0.3.6 Task 5: fallback priority — planArg wins over implement-receipt', function () {
  const repo = makeTmpGitRepo('release/v1.2.3');
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'from-receipt.json'),
    JSON.stringify({ decision_id: 'from-receipt', schema_version: 'v1' }));
  const slug = deriveDecisionId('mccp:pr', '.claude/plans/from-args.plan.md', { cwd: repo });
  assert.strictEqual(slug, 'from-args');
});

// (C1) lastImplementReceiptSlug — happy path
test('v0.3.6 Task 5: lastImplementReceiptSlug returns latest receipt slug', function () {
  const repo = makeTmpGitRepo('main');
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a-slug.json'),
    JSON.stringify({ decision_id: 'a-slug', schema_version: 'v1' }));
  const slug = lastImplementReceiptSlug(repo);
  assert.strictEqual(slug, 'a-slug');
});

// (C2) lastImplementReceiptSlug — picks most recent by mtime
test('v0.3.6 Task 5: lastImplementReceiptSlug picks most recent by mtime when multiple receipts exist', function () {
  const repo = makeTmpGitRepo('main');
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'older.json'),
    JSON.stringify({ decision_id: 'older', schema_version: 'v1' }));
  const olderPath = path.join(dir, 'older.json');
  // Force older to be 1h in the past
  const past = (Date.now() / 1000) - 3600;
  fs.utimesSync(olderPath, past, past);
  fs.writeFileSync(path.join(dir, 'newer.json'),
    JSON.stringify({ decision_id: 'newer', schema_version: 'v1' }));
  const slug = lastImplementReceiptSlug(repo);
  assert.strictEqual(slug, 'newer');
});

// (C3) lastImplementReceiptSlug — empty dir → null
test('v0.3.6 Task 5: lastImplementReceiptSlug returns null when receipt dir empty or absent', function () {
  const repo = makeTmpGitRepo('main');
  assert.strictEqual(lastImplementReceiptSlug(repo), null, 'dir absent → null');
  fs.mkdirSync(path.join(repo, '.claude', 'receipts', 'mccp-implement-codex'), { recursive: true });
  assert.strictEqual(lastImplementReceiptSlug(repo), null, 'dir empty → null');
});

// (C4) lastImplementReceiptSlug — malformed receipt JSON → null (graceful)
test('v0.3.6 Task 5: lastImplementReceiptSlug returns null on malformed receipt', function () {
  const repo = makeTmpGitRepo('main');
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bad.json'), '{not valid json');
  assert.strictEqual(lastImplementReceiptSlug(repo), null);
});

// (C5) lastImplementReceiptSlug — receipt missing decision_id → null
test('v0.3.6 Task 5: lastImplementReceiptSlug returns null when receipt has no decision_id', function () {
  const repo = makeTmpGitRepo('main');
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'no-id.json'), JSON.stringify({ schema_version: 'v1' }));
  assert.strictEqual(lastImplementReceiptSlug(repo), null);
});

// (C6) lastImplementReceiptSlug — invalid decision_id slug → null
test('v0.3.6 Task 5: lastImplementReceiptSlug returns null when decision_id fails SLUG_RE', function () {
  const repo = makeTmpGitRepo('main');
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bad-slug.json'),
    JSON.stringify({ decision_id: 'INVALID UPPER spaces', schema_version: 'v1' }));
  assert.strictEqual(lastImplementReceiptSlug(repo), null);
});

// (D) Regression — explicit --decision still beats all fallbacks
test('v0.3.6 Task 5: explicit --decision still beats branch normalize + fallback chain', function () {
  const repo = makeTmpGitRepo('v0.3.6-codex-scope');
  const slug = deriveDecisionId('mccp:pr', '--decision explicit-override', { cwd: repo });
  assert.strictEqual(slug, 'explicit-override');
});

// ─── v1.0.1 axis K2: receipt-aware branch-slug augmentation ─────────────
//
// When a BRANCH_BASED_COMMAND derives a valid branch slug, the v0.3.6
// fallback chain doesn't fire. But the branch slug may still be a
// contraction of the longer plan-basename slug that /mccp:plan wrote
// receipts under. axis K2 closes that hole by peeking at plan-codex
// receipts when branchSlug derive is valid.

const { findReceiptSlugByBranchPrefix } = require('../decision');

function writePlanReceipt(repo, slug) {
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, slug + '.json'),
    JSON.stringify({ decision_id: slug, schema_version: 'v1' }));
}

test('v1.0.1 axis K2: findReceiptSlugByBranchPrefix returns longer slug on single prefix match', function () {
  const repo = makeTmpGitRepo('main');
  writePlanReceipt(repo, 'v1-0-1-axis-k-pr-phase-guard-pid-alive');
  assert.strictEqual(
    findReceiptSlugByBranchPrefix('v1-0-1-axis-k', repo),
    'v1-0-1-axis-k-pr-phase-guard-pid-alive');
});

test('v1.0.1 axis K2: findReceiptSlugByBranchPrefix returns null on exact branch-slug receipt', function () {
  const repo = makeTmpGitRepo('main');
  writePlanReceipt(repo, 'v1-0-1-axis-k');
  // Also writing a longer prefix-match — exact match still wins → null
  writePlanReceipt(repo, 'v1-0-1-axis-k-extra-suffix');
  assert.strictEqual(findReceiptSlugByBranchPrefix('v1-0-1-axis-k', repo), null);
});

test('v1.0.1 axis K2: findReceiptSlugByBranchPrefix returns null when multiple prefix matches (ambiguous)', function () {
  const repo = makeTmpGitRepo('main');
  writePlanReceipt(repo, 'v1-0-1-axis-k-first-feature');
  writePlanReceipt(repo, 'v1-0-1-axis-k-second-feature');
  assert.strictEqual(findReceiptSlugByBranchPrefix('v1-0-1-axis-k', repo), null);
});

test('v1.0.1 axis K2: findReceiptSlugByBranchPrefix returns null when no plan-receipts match or dir absent', function () {
  const repo = makeTmpGitRepo('main');
  assert.strictEqual(findReceiptSlugByBranchPrefix('v1-0-1-axis-k', repo), null);
  writePlanReceipt(repo, 'completely-different-feature');
  assert.strictEqual(findReceiptSlugByBranchPrefix('v1-0-1-axis-k', repo), null);
});

test('v1.0.1 axis K2: findReceiptSlugByBranchPrefix ignores .legacy and .bak sidecars', function () {
  const repo = makeTmpGitRepo('main');
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'v1-0-1-axis-k-old.legacy.json'),
    JSON.stringify({ decision_id: 'v1-0-1-axis-k-old', schema_version: 'v1' }));
  fs.writeFileSync(path.join(dir, 'v1-0-1-axis-k-backup.bak.json'),
    JSON.stringify({ decision_id: 'v1-0-1-axis-k-backup', schema_version: 'v1' }));
  assert.strictEqual(findReceiptSlugByBranchPrefix('v1-0-1-axis-k', repo), null);
});

test('v1.0.1 axis K2: deriveDecisionId augments branch slug from plan-receipt prefix for /mccp:pr', function () {
  const repo = makeTmpGitRepo('v1.0.1-axis-k');
  writePlanReceipt(repo, 'v1-0-1-axis-k-pr-phase-guard-pid-alive');
  const slug = deriveDecisionId('mccp:pr', '', { cwd: repo });
  assert.strictEqual(slug, 'v1-0-1-axis-k-pr-phase-guard-pid-alive');
});

test('v1.0.1 axis K2: PLAN_PATH_COMMANDS are NOT receipt-augmented (only BRANCH_BASED)', function () {
  const repo = makeTmpGitRepo('v1.0.1-axis-k');
  writePlanReceipt(repo, 'v1-0-1-axis-k-pr-phase-guard-pid-alive');
  // /mccp:plan with no plan path → falls to branchSlug, NOT augmented
  const slug = deriveDecisionId('mccp:plan', '', { cwd: repo });
  assert.strictEqual(slug, 'v1-0-1-axis-k');
});

// ─── v1.2.0-m1 axis M: K2 boundary — no exact receipt + augment fail → fallback ─
//
// Reproduces the failure mode the user hit during v1.2.0-m1 PR creation:
// branch v1.2.0-orchestrator-m1 is valid (slugFromBranch passes), no
// plan-codex receipt exists at that exact slug, AND K2 augment misses
// because the actual receipt slug (v1-2-0-orchestrator-controller-m1)
// inserts an intermediate token rather than extending — branchSlug is
// NOT a strict prefix. Without axis M, deriveDecisionId returned the
// mismatched branchSlug and the receipt-gate hook blocked /mccp:pr
// with "no receipt written".

test('v1.2.0-m1 axis M: /mccp:pr branchSlug valid + no exact receipt + K2 miss → implement-receipt fallback', function () {
  const repo = makeTmpGitRepo('v1.2.0-orchestrator-m1');
  // Implement receipt under the actual plan slug — intermediate "controller"
  // token means branchSlug is NOT a strict prefix → K2 augment misses.
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'v1-2-0-orchestrator-controller-m1.json'),
    JSON.stringify({ decision_id: 'v1-2-0-orchestrator-controller-m1', schema_version: 'v1' }));
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '', { cwd: repo });
    assert.strictEqual(slug, 'v1-2-0-orchestrator-controller-m1');
  });
  assert.match(captured, /K2 augment missed/);
  assert.match(captured, /fell back to implement-receipt/);
});

test('v1.2.0-m1 axis M: /mccp:pr branchSlug valid + no implement-receipt → branchSlug preserved (regression-safe)', function () {
  const repo = makeTmpGitRepo('v1.2.0-orchestrator-m1');
  // No implement receipt at all — axis M fallback must not trigger.
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '', { cwd: repo });
    assert.strictEqual(slug, 'v1-2-0-orchestrator-m1');
  });
  assert.strictEqual(captured.indexOf('fell back to implement-receipt'), -1);
});

test('v1.2.0-m1 axis M: /mccp:pr branchSlug valid + exact plan receipt → branchSlug preserved (no fallback)', function () {
  const repo = makeTmpGitRepo('v1.2.0-orchestrator-m1');
  // Exact match: plan-codex receipt at branchSlug. axis M MUST NOT trigger.
  writePlanReceipt(repo, 'v1-2-0-orchestrator-m1');
  // Even if a different implement receipt exists, exact branchSlug match wins.
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'something-else.json'),
    JSON.stringify({ decision_id: 'something-else', schema_version: 'v1' }));
  const captured = captureStderr(function () {
    const slug = deriveDecisionId('mccp:pr', '', { cwd: repo });
    assert.strictEqual(slug, 'v1-2-0-orchestrator-m1');
  });
  assert.strictEqual(captured.indexOf('fell back to'), -1);
});
