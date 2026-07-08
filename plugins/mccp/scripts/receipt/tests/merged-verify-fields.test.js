'use strict';

// workflow-orchestration M3 Task 6 validate — new produces-only gate
// mccp-implement-verify + present-only meta.merged_verify_verdict /
// meta.merged_verify_rounds. Round-trip + enum + reject + NON-INVASIVE (the new
// gate does not enter any command's preflight chain / dedupe / PR-chain).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate, GATE_IDS } = require('../schema');
const { ALIAS_MATRIX, phaseFromGate, getCommandSpec } = require('../aliases');

function withRepo(fn) {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/mv-x.plan.md', '# Plan: mv-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn(repo, path.relative(repo, plan));
  } finally {
    process.chdir(cwd);
  }
}

// ── gate registration ─────────────────────────────────────────────────────────

test('mccp-implement-verify is a registered gate id, phase=implement', function () {
  assert.ok(GATE_IDS.indexOf('mccp-implement-verify') !== -1, 'gate id registered');
  assert.strictEqual(phaseFromGate('mccp-implement-verify'), 'implement');
});

test('write accepts the new gate id + merged_verify fields, round-trips + validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({
      gate: 'mccp-implement-verify',
      decision: 'mv-x',
      plan: planRel,
      'merged-verify-verdict': 'converged',
      'merged-verify-rounds': 1,
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.gate_id, 'mccp-implement-verify');
    assert.strictEqual(r.receipt.phase, 'implement');
    assert.strictEqual(r.receipt.meta.merged_verify_verdict, 'converged');
    assert.strictEqual(r.receipt.meta.merged_verify_rounds, 1);
  });
});

test('merged_verify absent → null defaults, validates (present-only)', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-verify', decision: 'mv-x', plan: planRel });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.merged_verify_verdict, null);
    assert.strictEqual(r.receipt.meta.merged_verify_rounds, null);
  });
});

test('legacy receipt without merged_verify keys still validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: 'mv-x', plan: planRel });
    delete r.receipt.meta.merged_verify_verdict;
    delete r.receipt.meta.merged_verify_rounds;
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  });
});

test('each merged_verify verdict enum value validates', function () {
  withRepo(function (repo, planRel) {
    ['converged', 'divergent', 'critical', 'unavailable', 'skipped'].forEach(function (verdict) {
      const r = write({
        gate: 'mccp-implement-verify',
        decision: 'mv-x',
        plan: planRel,
        'merged-verify-verdict': verdict,
        'merged-verify-rounds': verdict === 'skipped' ? 0 : 1,
      });
      const v = validate(r.receipt);
      assert.strictEqual(v.ok, true, verdict + ': ' + JSON.stringify(v.errors));
      assert.strictEqual(r.receipt.meta.merged_verify_verdict, verdict);
    });
  });
});

test('invalid merged_verify_verdict rejected by schema', function () {
  withRepo(function (repo, planRel) {
    assert.throws(function () {
      write({
        gate: 'mccp-implement-verify',
        decision: 'mv-x',
        plan: planRel,
        'merged-verify-verdict': 'bogus',
      });
    }, /SCHEMA_INVALID|merged_verify_verdict/);
  });
});

test('negative merged_verify_rounds coerced to null (fail-safe), stays valid', function () {
  withRepo(function (repo, planRel) {
    // write.js parseInt guard: negative / NaN → null (not an error).
    const r = write({
      gate: 'mccp-implement-verify',
      decision: 'mv-x',
      plan: planRel,
      'merged-verify-rounds': -3,
    });
    assert.strictEqual(r.receipt.meta.merged_verify_rounds, null);
    assert.strictEqual(validate(r.receipt).ok, true);
  });
});

test('receipt_hash includes merged_verify (tamper-protected, NOT carved out)', function () {
  withRepo(function (repo, planRel) {
    const { receiptHash } = require('../hash');
    const r = write({
      gate: 'mccp-implement-verify',
      decision: 'mv-x',
      plan: planRel,
      'merged-verify-verdict': 'converged',
    });
    const stored = r.receipt.receipt_hash;
    // internal consistency — recompute over the stored receipt matches.
    assert.strictEqual(receiptHash(r.receipt), stored);
    // flip the verdict → recomputed hash DIFFERS (the field is a hash input,
    // unlike carved-out briefing_*/ledger fields).
    const tampered = JSON.parse(JSON.stringify(r.receipt));
    tampered.meta.merged_verify_verdict = 'divergent';
    assert.notStrictEqual(receiptHash(tampered), stored,
      'merged_verify_verdict must be inside receipt_hash (tamper-protected)');
  });
});

// ── NON-INVASIVE: new gate does not enter any command chain (DD5 / Codex F3) ───

test('no command produces / requires mccp-implement-verify (non-invasive preflight)', function () {
  Object.keys(ALIAS_MATRIX).forEach(function (cmd) {
    const spec = ALIAS_MATRIX[cmd];
    const all = [].concat(spec.produces || [], spec.requires_preceding || [], spec.design_optional || []);
    assert.ok(all.indexOf('mccp-implement-verify') === -1,
      cmd + ' must not reference mccp-implement-verify in its chain');
  });
});

test('prp-implement still requires only mccp-plan-codex (verify gate does not tighten it)', function () {
  const spec = getCommandSpec('mccp:prp-implement');
  assert.deepStrictEqual(spec.requires_preceding, ['mccp-plan-codex']);
});

test('pr still requires only plan+implement codex (verify gate not injected into PR chain)', function () {
  const spec = getCommandSpec('mccp:pr');
  assert.deepStrictEqual(spec.requires_preceding, ['mccp-plan-codex', 'mccp-implement-codex']);
});
