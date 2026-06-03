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

function slugFromPlanArg(args) {
  const first = firstNonFlag(args);
  if (!first) return null;
  const base = first.split(/[\\/]/).pop() || '';
  let slug = base.replace(/\.(plan|prd)\.md$/i, '').replace(/\.md$/i, '');
  slug = slug.toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
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
    const slug = branch.replace(BRANCH_PREFIX_RE, '').toLowerCase();
    return SLUG_RE.test(slug) ? slug : null;
  } catch (_err) {
    return null;
  }
}

function deriveDecisionId(commandName, commandArgs, opts) {
  const cwd = (opts && opts.cwd) || process.cwd();

  const explicit = explicitDecision(commandArgs);
  if (explicit) return explicit;

  const cmd = normalizeCommand(commandName);
  if (!cmd) return 'default';

  if (PLAN_PATH_COMMANDS.has(cmd)) {
    const slug = slugFromPlanArg(commandArgs);
    if (slug) return slug;
    const branchSlug = slugFromBranch(cwd);
    if (branchSlug) return branchSlug;
    return 'default';
  }

  if (BRANCH_BASED_COMMANDS.has(cmd)) {
    const branchSlug = slugFromBranch(cwd);
    if (branchSlug) return branchSlug;
    return 'default';
  }

  return 'default';
}

function isStandalone(args) {
  if (!args || typeof args !== 'string') return false;
  return /(?:^|\s)--standalone(?:\s|=|$)/.test(args);
}

module.exports = {
  deriveDecisionId: deriveDecisionId,
  explicitDecision: explicitDecision,
  slugFromPlanArg: slugFromPlanArg,
  slugFromBranch: slugFromBranch,
  firstNonFlag: firstNonFlag,
  normalizeCommand: normalizeCommand,
  isStandalone: isStandalone,
  PLAN_PATH_COMMANDS: PLAN_PATH_COMMANDS,
  BRANCH_BASED_COMMANDS: BRANCH_BASED_COMMANDS,
  SLUG_RE: SLUG_RE,
};
