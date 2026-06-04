'use strict';

// Task 10 — MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER audited escape hatch
// (R2 finding #3 + R3 finding #1 audit-hole closure).
//
// When the security-reviewer Task tool dispatch fails AND the operator sets
// MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<specific reason>", the terminal
// /mccp:pr command may proceed under "audited escape" semantics:
//   - receipt records meta.security_force_override=true + reason text
//   - validator surfaces as warning (non-approving), not blocking — PR creates
//   - PR body MUST inject `## Security Reviewer Override` section as the
//     CANONICAL audit source (.claude/receipts/ is git-ignored)
//
// This test pins:
//   1. write --security-force-override → meta fields persisted
//   2. validator returns force_override as warning (ok stays true)
//   3. omitting reason still records meta (reason validation is at the
//      env-var parse layer, not the receipt schema layer)
//   4. command body grep for MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER (Task 10
//      acceptance criterion)
//   5. command body grep for `## Security Reviewer Override` section
//      (R3 finding #1 audit-hole closure)
//   6. multiple force_override receipts surface as multiple warnings

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  return { repo, plan, planRel: path.relative(repo, plan) };
}

test('write --security-force-override + reason persists both meta fields', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-pr-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-force-override': true,
      'security-force-override-reason': 'codex registry stale, manual review on Slack thread #1234',
    });
    assert.strictEqual(r.receipt.meta.security_force_override, true);
    assert.strictEqual(
      r.receipt.meta.security_force_override_reason,
      'codex registry stale, manual review on Slack thread #1234',
    );
  } finally {
    process.chdir(cwd);
  }
});

test('validator surfaces force_override as WARNING, not blocking; result.ok stays true', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({ gate: 'mccp-implement-codex', decision: 'feature-x', plan: planRel });
    write({
      gate: 'mccp-pr-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-force-override': true,
      'security-force-override-reason': 'agent registry stale',
    });
    // Validate /mccp:code-review (its preceding gate is mccp-pr-codex).
    const r = validateCommand('/mccp:code-review', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.blocking.length, 0, 'force_override must NOT block: ' + JSON.stringify(r.blocking));
    const warn = r.warnings.find(
      (w) => w.gate_id === 'mccp-pr-codex' && /MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER/.test(w.reason),
    );
    assert.ok(warn, 'force_override must surface as warning: ' + JSON.stringify(r.warnings));
    assert.strictEqual(warn.force_override_reason, 'agent registry stale');
    assert.strictEqual(r.ok, true, 'warnings do not affect result.ok');
  } finally {
    process.chdir(cwd);
  }
});

test('omitting reason still records meta (schema does not require reason text)', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-pr-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-force-override': true,
      // reason omitted — env-var-parse-layer is responsible for the 1-token rejection,
      // not the schema layer.
    });
    assert.strictEqual(r.receipt.meta.security_force_override, true);
    assert.strictEqual(r.receipt.meta.security_force_override_reason, null);
  } finally {
    process.chdir(cwd);
  }
});

test('pr.md command body documents MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER (Task 10 acceptance)', () => {
  const prMd = path.join(PLUGIN_ROOT, 'commands', 'pr.md');
  const source = fs.readFileSync(prMd, 'utf8');
  assert.match(
    source,
    /MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER/,
    'pr.md must document the audited env var',
  );
  // The escape branch must appear in the security-sensitive context (Phase 2.5.5),
  // not just casually. Quick proximity check: env var name appears within 2000
  // chars of "Security-sensitive" heading.
  const sensitiveIdx = source.indexOf('Security-sensitive');
  const envIdx = source.indexOf('MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER');
  assert.ok(sensitiveIdx !== -1 && envIdx !== -1, 'both anchors must be present');
  assert.ok(
    Math.abs(envIdx - sensitiveIdx) < 4000,
    `env var must be documented near the Security-sensitive section, got ${Math.abs(envIdx - sensitiveIdx)} chars apart`,
  );
});

test('pr.md command body declares `## Security Reviewer Override` PR body section (R3 finding #1 audit-hole closure)', () => {
  const prMd = path.join(PLUGIN_ROOT, 'commands', 'pr.md');
  const source = fs.readFileSync(prMd, 'utf8');
  assert.match(
    source,
    /## Security Reviewer Override/,
    'pr.md must document the canonical PR body audit section. This is the R3 finding #1 audit-hole closure — receipt is .gitignored, so PR body is the canonical permanent audit source.',
  );
  assert.match(
    source,
    /canonical audit source|Audit canonical/i,
    'pr.md must state that the PR body section is the canonical audit source',
  );
});

test('multiple force_override gates surface as multiple warnings', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({
      gate: 'mccp-plan-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-force-override': true,
      'security-force-override-reason': 'plan-stage override',
    });
    write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-force-override': true,
      'security-force-override-reason': 'implement-stage override',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.blocking.length, 0);
    assert.ok(
      r.warnings.length >= 2,
      `expected >=2 warnings, got ${r.warnings.length}: ${JSON.stringify(r.warnings)}`,
    );
    assert.strictEqual(r.ok, true);
  } finally {
    process.chdir(cwd);
  }
});
