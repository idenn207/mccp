'use strict';

// Task 8 — receipt CLI security_skipped blocking enforcement (R2 finding #1).
//
// When the Skill→Task tool security-reviewer invocation falls through
// (`agent not found`, schema mismatch, harness rejection), Phase 2.5.5 records
// the auto-fallback and the receipt-write step MUST set
// meta.security_skipped=true. The validator then treats this as non-approving
// for strict gates (mccp-implement-codex / mccp-pr-codex) and informational
// for read-only gates (code-reviewer, plan-codex).
//
// This test pins the policy:
//   1. write --security-skipped → receipt stores meta.security_skipped=true
//   2. /mccp:pr against implement-codex receipt with security_skipped=true
//      → blocking[] surfaces the gate
//   3. /mccp:code-review against pr-codex with security_skipped=true → warnings,
//      result.ok stays true (informational)
//   4. /mccp:pr WITHOUT any security_skipped flag → no blocking, no warnings
//   5. security_skipped without skip_reason still blocks (reason is optional)
//   6. dual-skipped (codex + security) surfaces both blocking items

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validateCommand } = require('../validate-cmd');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  return { repo, plan, planRel: path.relative(repo, plan) };
}

test('write --security-skipped persists meta.security_skipped=true', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-skipped': true,
      'security-skip-reason': 'agent not found',
    });
    assert.strictEqual(r.receipt.meta.security_skipped, true);
    assert.strictEqual(r.receipt.meta.security_skip_reason, 'agent not found');
  } finally {
    process.chdir(cwd);
  }
});

test('/mccp:pr blocks when implement-codex receipt has security_skipped=true', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-skipped': true,
      'security-skip-reason': 'harness rejection',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    const blockingForImplement = r.blocking.find((b) => b.gate_id === 'mccp-implement-codex' && /security_skipped/.test(b.reason));
    assert.ok(blockingForImplement, 'implement-codex security_skipped must surface as blocking');
    assert.strictEqual(blockingForImplement.skip_reason, 'harness rejection');
  } finally {
    process.chdir(cwd);
  }
});

test('plan-codex with security_skipped is informational (warning), implement-codex is strict (blocking)', () => {
  // mccp-plan-codex is NOT in STRICT_SECURITY_GATES (plan doesn't touch
  // security-sensitive code yet). So security_skipped on plan-codex receipt
  // surfaces as a warning, not a blocker. implement-codex IS strict.
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({
      gate: 'mccp-plan-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-skipped': true,
      'security-skip-reason': 'plan stage informational',
    });
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    // plan-codex security_skipped does NOT block (informational).
    assert.strictEqual(r.blocking.length, 0, JSON.stringify(r.blocking));
    // It DOES warn.
    const warn = r.warnings.find((w) => w.gate_id === 'mccp-plan-codex' && /security_skipped/.test(w.reason));
    assert.ok(warn, 'plan-codex security_skipped must surface as warning');
    // result.ok stays true because warnings do not affect ok.
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  } finally {
    process.chdir(cwd);
  }
});

test('/mccp:pr blocks when pr-codex receipt is non-existent (sanity, control for next test)', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    // Missing implement-codex → blocked
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.missing.some((m) => m.gate_id === 'mccp-implement-codex'));
  } finally {
    process.chdir(cwd);
  }
});

test('/mccp:pr without any security_skipped passes (control)', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({ gate: 'mccp-implement-codex', decision: 'feature-x', plan: planRel });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.blocking.length, 0);
    assert.strictEqual(r.warnings.length, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('security_skipped without skip_reason still blocks (reason is optional)', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-skipped': true,
      // omit skip-reason
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    const b = r.blocking.find((x) => x.gate_id === 'mccp-implement-codex' && /security_skipped/.test(x.reason));
    assert.ok(b, 'security_skipped still blocks without reason');
    assert.strictEqual(b.skip_reason, null);
  } finally {
    process.chdir(cwd);
  }
});

test('dual-skipped: codex_skipped + security_skipped on same receipt surfaces both blockers', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'codex-skipped': true,
      'security-skipped': true,
      'security-skip-reason': 'agent not found',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    const codexBlock = r.blocking.find((b) => /codex_skipped/.test(b.reason));
    const securityBlock = r.blocking.find((b) => /security_skipped/.test(b.reason));
    assert.ok(codexBlock, 'codex_skipped must still block');
    assert.ok(securityBlock, 'security_skipped must block alongside codex_skipped');
  } finally {
    process.chdir(cwd);
  }
});
