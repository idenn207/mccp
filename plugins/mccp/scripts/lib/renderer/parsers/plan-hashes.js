'use strict';

// Dashboard Truthfulness M7 — shared helper that computes
// Map<decisionId, currentPlanHash> for the ledger-aware promotion in
// deriveDecisionState (Task 1). decisionId is the plan basename minus
// `.plan.md` (the derive-decision slug convention). A plan that can't be read
// (archived / worktree-removed / unreadable) is OMITTED → its decision gets a
// null hash in buildDecisionState → ledger promotion is withheld (under-claim
// safe default, Codex Plan-R1 F2). Mirrors plan-body.js:377-392. Fail-open:
// never throws; a bad plan just drops out of the map.

const path = require('path');
const { planAwareMarkdownHash } = require('../../../receipt/hash');

function planHashesFromModel(model, opts) {
  opts = opts || {};
  const m = model || {};
  const cwd = opts.cwd
    || (m.repo_root && typeof m.repo_root === 'string' && m.repo_root !== '<repo>'
      ? m.repo_root : process.cwd());
  const plans = (m.sources && m.sources.plans && m.sources.plans.items) || [];
  const out = new Map();
  for (const p of plans) {
    if (!p || !p.path) continue;
    const decisionId = path.basename(p.path).replace(/\.plan\.md$/, '').replace(/\.md$/, '');
    const planAbs = path.isAbsolute(p.path) ? p.path : path.resolve(cwd, p.path);
    try {
      out.set(decisionId, planAwareMarkdownHash(planAbs));
    } catch (_e) { /* unreadable → omit → null hash → under-claim */ }
  }
  return out;
}

module.exports = { planHashesFromModel };
