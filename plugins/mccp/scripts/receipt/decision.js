'use strict';

// Derive decision_id from command name + arguments + repo state.
// Single source of truth used by both hooks and command bodies via the CLI.
//
// Precedence:
//   1. Explicit `--decision <slug>` in commandArgs
//   2. Per-command shape:
//      - PLAN_PATH_COMMANDS: first non-flag arg = plan/prd path → basename slug
//      - BRANCH_BASED_COMMANDS: current git branch (stripped of conventional prefix)
//   3. 'default'
//
// Slug rule: kebab-case starting with [a-z0-9], total length <= 80, only [a-z0-9-].

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PLAN_PATH_COMMANDS = new Set([
  'mccp:plan',
  'mccp:plan-prd',
  'mccp:prp-implement',
]);

const BRANCH_BASED_COMMANDS = new Set([
  'mccp:pr',
  'mccp:prp-pr',
  'mccp:code-review',
  'mccp:review-pr',
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const BRANCH_PREFIX_RE = /^(feat|feature|fix|hotfix|chore|refactor|docs|test|perf|ci|build|style)\//i;

function normalizeCommand(name) {
  if (typeof name !== 'string') return null;
  return name.replace(/^\//, '').toLowerCase();
}

function explicitDecision(args) {
  if (!args || typeof args !== 'string') return null;
  const m = args.match(/--decision[=\s]+([a-z0-9][a-z0-9-]*)/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

function firstNonFlag(args) {
  if (!args || typeof args !== 'string') return null;
  const tokens = args.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.startsWith('--')) {
      // Skip `--flag=value` entirely; for `--flag value`, also skip next token.
      if (t.indexOf('=') === -1 && i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        i += 1;
      }
      continue;
    }
    return t;
  }
  return null;
}

// Direct path→slug — avoids the firstNonFlag tokenizer when the caller has
// the plan path in hand. CLI uses this via `--plan <path>` to skip the
// fragile --args "<raw shell-quoted string>" round-trip.
function slugFromPlanPath(planPath) {
  if (!planPath || typeof planPath !== 'string') return null;
  const base = planPath.split(/[\\/]/).pop() || '';
  let slug = base.replace(/\.(plan|prd)\.md$/i, '').replace(/\.md$/i, '');
  slug = slug.toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

function slugFromPlanArg(args) {
  const first = firstNonFlag(args);
  if (!first) return null;
  return slugFromPlanPath(first);
}

function slugFromBranch(cwd) {
  try {
    const out = execFileSync('git', ['branch', '--show-current'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    const branch = (out || '').trim();
    if (!branch) return null;
    // v0.3.6 Task 5 (축 3) — normalize dots and underscores to hyphens BEFORE
    // SLUG_RE. Version-tagged branches like 'v0.3.6-foo' and snake-style names
    // like 'feat/bar_baz' would otherwise hit SLUG_RE rejection because dots
    // and underscores aren't in [a-z0-9-]. Normalization is idempotent on
    // already-valid slugs (alphanumeric + hyphens stay unchanged).
    const slug = branch
      .replace(BRANCH_PREFIX_RE, '')
      .toLowerCase()
      .replace(/[._]+/g, '-');
    return SLUG_RE.test(slug) ? slug : null;
  } catch (_err) {
    return null;
  }
}

// v1.0.1 axis K2 — receipt-aware branch-slug augmentation. When a
// BRANCH_BASED_COMMAND derives a *valid* branch slug, the v0.3.6 fallback
// chain doesn't fire — but the branch slug may still be a contracted
// version of the plan-basename slug that PLAN_PATH_COMMANDS wrote receipts
// under. Example: branch `v1.0.1-axis-k` (slug `v1-0-1-axis-k`) vs receipt
// at `mccp-plan-codex/v1-0-1-axis-k-pr-phase-guard-pid-alive.json`. Both
// are "valid" — but the PR-step receipt-gate looks at the shorter branch
// slug and sees MISSING. This helper peeks at plan-codex receipts and
// returns the unique longer slug when branchSlug is its exact prefix,
// matching what `/mccp:plan` would have written. Multi-match or no-match
// returns null (regression-safe: caller uses branchSlug unchanged).
function findReceiptSlugByBranchPrefix(branchSlug, cwd) {
  if (!branchSlug || typeof branchSlug !== 'string') return null;
  try {
    const dir = path.join(cwd || process.cwd(), '.claude', 'receipts', 'mccp-plan-codex');
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); });
    const exactName = branchSlug + '.json';
    const matches = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // Skip legacy / backup receipts (e.g. `default.legacy.json`,
      // `main.v0.2.3-schema.bak.json`) so historical sidecars don't poison
      // the prefix search.
      if (f.includes('.legacy') || f.includes('.bak')) continue;
      // Exact branch-slug match → /mccp:plan wrote a receipt under the
      // branch slug itself; no augmentation needed.
      if (f === exactName) return null;
      const slug = f.replace(/\.json$/, '');
      if (slug.length > branchSlug.length + 1 &&
        slug.charCodeAt(branchSlug.length) === 0x2d /* '-' */ &&
        slug.startsWith(branchSlug) && SLUG_RE.test(slug)) {
        matches.push(slug);
      }
    }
    if (matches.length === 1) return matches[0];
    return null;
  } catch (_err) {
    return null;
  }
}

// v0.3.6 Task 5 fallback (축 3) — when BRANCH_BASED_COMMANDS (mccp:pr,
// mccp:prp-pr, mccp:code-review, mccp:review-pr) can't derive a slug from
// branch / planPath / commandArgs, peek at the most recent implement-codex
// receipt. This is how cross-gate dedupe (v0.2.8) finds the matching slug
// when the user invokes /mccp:pr from a branch that pre-dates the v0.3.6
// normalize fix or from a worktree without git context.
function lastImplementReceiptSlug(cwd) {
  try {
    const dir = path.join(cwd || process.cwd(), '.claude', 'receipts', 'mccp-implement-codex');
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); });
    if (files.length === 0) return null;
    let latestPath = null;
    let latestMtime = 0;
    for (let i = 0; i < files.length; i++) {
      const fp = path.join(dir, files[i]);
      try {
        const stat = fs.statSync(fp);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestPath = fp;
        }
      } catch (_e) { /* ignore unreadable entries */ }
    }
    if (!latestPath) return null;
    const receipt = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    const slug = receipt && receipt.decision_id;
    if (typeof slug === 'string' && SLUG_RE.test(slug)) return slug;
    return null;
  } catch (_err) {
    return null;
  }
}

function deriveDecisionId(commandName, commandArgs, opts) {
  const cwd = (opts && opts.cwd) || process.cwd();
  const planPath = opts && opts.planPath;

  const explicit = explicitDecision(commandArgs);
  if (explicit) return explicit;

  const cmd = normalizeCommand(commandName);
  if (!cmd) return 'default';

  if (PLAN_PATH_COMMANDS.has(cmd)) {
    if (planPath) {
      const slug = slugFromPlanPath(planPath);
      if (slug) return slug;
    }
    const argSlug = slugFromPlanArg(commandArgs);
    if (argSlug) return argSlug;
    const branchSlug = slugFromBranch(cwd);
    if (branchSlug) return branchSlug;
    return 'default';
  }

  if (BRANCH_BASED_COMMANDS.has(cmd)) {
    const branchSlug = slugFromBranch(cwd);
    if (branchSlug) {
      // v1.0.1 axis K2 — receipt-aware augmentation. If the branch slug is a
      // strict prefix of exactly one existing plan-codex receipt slug, prefer
      // the longer slug. Matches /mccp:plan's plan-basename derivation, so
      // /mccp:pr finds the receipt that /mccp:plan + /mccp:prp-implement
      // already wrote. Ambiguous (2+) or zero matches → branchSlug unchanged
      // (regression-safe).
      const augmented = findReceiptSlugByBranchPrefix(branchSlug, cwd);
      if (augmented) {
        process.stderr.write(
          '[mccp:decision] branch slug augmented from plan-receipt prefix: ' +
          branchSlug + ' → ' + augmented + '\n');
        return augmented;
      }
      return branchSlug;
    }
    // v0.3.6 Task 5 (축 3) — branch slug invalid (or empty), try fallback chain
    // before giving up to 'default'. Fixes the HIGH-severity bug where
    // /mccp:work + multi-task sprint flows on version-tagged or dot-bearing
    // branches landed on the generic 'default' slug and broke cross-gate dedupe.
    if (planPath) {
      const slug = slugFromPlanPath(planPath);
      if (slug) {
        process.stderr.write('[mccp:decision] branch slug invalid; fell back to planPath → ' + slug + '\n');
        return slug;
      }
    }
    const argSlug = slugFromPlanArg(commandArgs);
    if (argSlug) {
      process.stderr.write('[mccp:decision] branch slug invalid; fell back to planArg → ' + argSlug + '\n');
      return argSlug;
    }
    const receiptSlug = lastImplementReceiptSlug(cwd);
    if (receiptSlug) {
      process.stderr.write('[mccp:decision] branch slug invalid; fell back to implement-receipt → ' + receiptSlug + '\n');
      return receiptSlug;
    }
    return 'default';
  }

  return 'default';
}

function isStandalone(args) {
  if (!args || typeof args !== 'string') return false;
  return /(?:^|\s)--standalone(?:\s|=|$)/.test(args);
}

// Local Review Mode detector for /mccp:code-review.
// Spec (commands/code-review.md §Mode Selection + Phase 1 FETCH table):
// blank args (only flags or no args) means Local Review Mode and the receipt
// chain is skipped. ANY positional argument (PR number, PR URL, OR branch
// name resolved via `gh pr list --head <branch>`) means PR Review Mode.
// A typo'd branch name still goes to PR Mode and is rejected later by `gh`
// — that's intentional, the local-vs-PR decision is positional/flag shape,
// not string-content classification.
function isLocalReviewMode(args) {
  if (!args || typeof args !== 'string') return true;
  if (/(?:^|\s)--pr(?:\s|=|$)/i.test(args)) return false;
  const first = firstNonFlag(args);
  if (!first) return true;
  return false;
}

module.exports = {
  deriveDecisionId: deriveDecisionId,
  explicitDecision: explicitDecision,
  slugFromPlanArg: slugFromPlanArg,
  slugFromPlanPath: slugFromPlanPath,
  slugFromBranch: slugFromBranch,
  findReceiptSlugByBranchPrefix: findReceiptSlugByBranchPrefix,
  lastImplementReceiptSlug: lastImplementReceiptSlug,
  firstNonFlag: firstNonFlag,
  normalizeCommand: normalizeCommand,
  isStandalone: isStandalone,
  isLocalReviewMode: isLocalReviewMode,
  PLAN_PATH_COMMANDS: PLAN_PATH_COMMANDS,
  BRANCH_BASED_COMMANDS: BRANCH_BASED_COMMANDS,
  SLUG_RE: SLUG_RE,
};
