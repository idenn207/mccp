'use strict';

// Cross-gate dedupe key (Reviewer A A5 contract).
//
// Single source of truth shared by plan-codex, implement-codex, and the
// Stop-loop's optional Codex review (lib/codex-bridge.js). Two gate
// invocations are "the same decision" iff their `dedupeKey()` outputs
// are equal — see docs/v0.2-state-schema.md §5 for the full contract.
//
// dedupeKey(planPath, decisionId) :=
//     sha256( planSha12 + ':' + normalizedSlug ).slice(0, 24)
//
//   planSha12       := sha256( normalize(planPath) ).slice(0, 12)
//                       (or '000000000000' when planPath is empty)
//   normalizedSlug  := lowercase, [a-z0-9-] only, strip leading/trailing '-',
//                      truncate to 80 chars, conventional branch prefixes
//                      ('feat/', 'fix/', ...) trimmed before normalization.

const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

const EMPTY_PLAN_SHA12 = '000000000000';
const BRANCH_PREFIX_RE = /^(feat|feature|fix|hotfix|chore|refactor|docs|test|perf|ci|build|style)\//i;
// Slug shape mirrors receipt/decision.js SLUG_RE exactly so a dedupe key
// derived here matches one derived through the receipt CLI for the same
// decision (Reviewer B Round 1 #4).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

function normalizePlanPath(planPath, opts) {
  if (planPath === null || planPath === undefined) return '';
  const raw = String(planPath).trim();
  if (!raw) return '';

  // 1. Resolve to absolute. For tests we accept an `opts.cwd` so callers
  // can normalize relative-to-a-specific-repo without relying on process.cwd().
  const cwd = (opts && opts.cwd) || process.cwd();
  const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);

  // 2. Convert to repo-relative when inside a git repo, so a plan
  // referenced from a worktree subdir and the same plan referenced from
  // the repo root collapse to the same normalized form.
  let repoRoot;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
  } catch (_e) {
    repoRoot = null;
  }

  let rel;
  if (repoRoot) {
    rel = path.relative(repoRoot, abs);
    // If the plan path is outside the repo, fall back to absolute so we
    // still produce a stable key for orphan paths.
    if (rel.startsWith('..')) rel = abs;
  } else {
    rel = abs;
  }

  return rel.split(path.sep).join('/');
}

function normalizeSlug(decisionId) {
  if (decisionId === null || decisionId === undefined) return 'default';
  let s = String(decisionId).trim();
  if (!s) return 'default';

  // Strip conventional branch prefix only when it appears at the front
  // (matches receipt/decision.js slugFromBranch behavior).
  s = s.replace(BRANCH_PREFIX_RE, '');
  s = s.toLowerCase();

  // Strict validate: receipt CLI either returns a valid slug or falls back
  // to 'default' (slugFromBranch/slugFromPlanArg). Mirror that here so
  // dedupe keys cannot diverge from the receipt CLI's decision_id derivation.
  if (SLUG_RE.test(s)) return s;
  return 'default';
}

function planSha12(normalizedPlanPath) {
  if (!normalizedPlanPath) return EMPTY_PLAN_SHA12;
  return crypto.createHash('sha256').update(normalizedPlanPath).digest('hex').slice(0, 12);
}

function dedupeKey(planPath, decisionId, opts) {
  const normPath = normalizePlanPath(planPath, opts);
  const slug = normalizeSlug(decisionId);
  const planHash = planSha12(normPath);
  return crypto.createHash('sha256').update(planHash + ':' + slug).digest('hex').slice(0, 24);
}

// Convenience: given an existing receipt JSON, derive its dedupe key
// without the caller needing to know the plan_path / decision_id layout.
function dedupeKeyFromReceipt(receipt, opts) {
  if (!receipt || typeof receipt !== 'object') {
    throw new Error('dedupeKeyFromReceipt: receipt object required');
  }
  const planPath = (receipt.subject && receipt.subject.plan_path) || '';
  const decisionId = receipt.decision_id || 'default';
  return dedupeKey(planPath, decisionId, opts);
}

function dedupeKeyFromReceiptFile(receiptPath, opts) {
  const raw = fs.readFileSync(receiptPath, 'utf8');
  return dedupeKeyFromReceipt(JSON.parse(raw), opts);
}

module.exports = {
  dedupeKey: dedupeKey,
  dedupeKeyFromReceipt: dedupeKeyFromReceipt,
  dedupeKeyFromReceiptFile: dedupeKeyFromReceiptFile,
  normalizePlanPath: normalizePlanPath,
  normalizeSlug: normalizeSlug,
  planSha12: planSha12,
  EMPTY_PLAN_SHA12: EMPTY_PLAN_SHA12,
  SLUG_RE: SLUG_RE,
};
