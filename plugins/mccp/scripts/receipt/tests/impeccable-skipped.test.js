'use strict';

// Milestone 1 Task 1.3 — impeccable_skipped enforcement (mirrors security_skipped).
//
// When the impeccable design gate falls through (skill unavailable, no design
// signal, mode-mismatch), Phase 2.5.X records auto-fallback and write step
// MUST set meta.impeccable_skipped=true on the PRIMARY codex receipt. validate
// then treats this as non-approving for strict gates (implement / pr) and
// informational for read-only gates (plan / code-review). Codex R1 F1
// absorption: no separate design_* receipt namespace.

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

test('write --impeccable-skipped persists meta.impeccable_skipped=true', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'impeccable-skipped': true,
      'impeccable-skip-reason': 'skill-missing',
    });
    assert.strictEqual(r.receipt.meta.impeccable_skipped, true);
    assert.strictEqual(r.receipt.meta.impeccable_skip_reason, 'skill-missing');
  } finally {
    process.chdir(cwd);
  }
});

test('/mccp:pr blocks when implement-codex receipt has impeccable_skipped=true', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'impeccable-skipped': true,
      'impeccable-skip-reason': 'no-signal',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false, JSON.stringify(r));
    const blocking = r.blocking.find((b) => b.gate_id === 'mccp-implement-codex' && /impeccable_skipped/.test(b.reason));
    assert.ok(blocking, 'implement-codex impeccable_skipped must surface as blocking');
    assert.strictEqual(blocking.impeccable_skip_reason, 'no-signal');
  } finally {
    process.chdir(cwd);
  }
});

test('plan-codex with impeccable_skipped is informational (warning), implement-codex is strict (blocking)', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({
      gate: 'mccp-plan-codex',
      decision: 'feature-x',
      plan: planRel,
      'impeccable-skipped': true,
      'impeccable-skip-reason': 'skill-missing',
    });
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    // plan-codex is not in STRICT_IMPECCABLE_GATES → warning, ok stays true.
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(r.warnings.some((w) => w.gate_id === 'mccp-plan-codex' && /impeccable_skipped/.test(w.reason)),
      'plan-codex impeccable_skipped must surface as warning');
  } finally {
    process.chdir(cwd);
  }
});

test('impeccable_skipped without reason still blocks on strict gate', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'impeccable-skipped': true,
      // No --impeccable-skip-reason
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    const blocking = r.blocking.find((b) => /impeccable_skipped/.test(b.reason));
    assert.ok(blocking, 'impeccable_skipped without reason still blocks');
    assert.strictEqual(blocking.impeccable_skip_reason, null);
  } finally {
    process.chdir(cwd);
  }
});

test('dual-skipped (codex + impeccable) surfaces both blocking items', () => {
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
      'impeccable-skipped': true,
      'impeccable-skip-reason': 'skill-missing',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.blocking.some((b) => /codex_skipped/.test(b.reason)), 'codex_skipped blocking present');
    assert.ok(r.blocking.some((b) => /impeccable_skipped/.test(b.reason)), 'impeccable_skipped blocking present');
  } finally {
    process.chdir(cwd);
  }
});

test('triple-skipped (codex + security + impeccable) surfaces all three blocking items', () => {
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
      'impeccable-skipped': true,
      'impeccable-skip-reason': 'skill-missing',
    });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.blocking.some((b) => /codex_skipped/.test(b.reason)));
    assert.ok(r.blocking.some((b) => /security_skipped/.test(b.reason)));
    assert.ok(r.blocking.some((b) => /impeccable_skipped/.test(b.reason)));
  } finally {
    process.chdir(cwd);
  }
});

test('clean implement receipt (no impeccable_skipped) → no warnings or blocking', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({ gate: 'mccp-implement-codex', decision: 'feature-x', plan: planRel });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.warnings.length, 0);
    assert.strictEqual(r.blocking.length, 0);
  } finally {
    process.chdir(cwd);
  }
});
