'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write, restampGroundingVerdict } = require('../write');
const { validate } = require('../schema');

function withRepo(fn) {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/grounding-x.plan.md', '# Plan: grounding-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn(repo, path.relative(repo, plan));
  } finally {
    process.chdir(cwd);
  }
}

test('grounding fields: --design-grounding-captured → true, round-trips and validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'grounding-x',
      plan: planRel,
      'design-grounding-captured': true,
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.design_grounding_captured, true);
    assert.strictEqual(r.receipt.meta.design_grounding_verdict, null);
  });
});

test('grounding fields: absent → false/null defaults, validates (present-only legacy)', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: 'grounding-x', plan: planRel });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.design_grounding_captured, false);
    assert.strictEqual(r.receipt.meta.design_grounding_verdict, null);
  });
});

test('grounding fields: legacy receipt without the keys still validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: 'grounding-x', plan: planRel });
    delete r.receipt.meta.design_grounding_captured;
    delete r.receipt.meta.design_grounding_verdict;
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  });
});

test('grounding fields: each verdict enum value validates', function () {
  withRepo(function (repo, planRel) {
    ['grounded', 'anchor_clean', 'inconclusive', 'violations', 'skipped'].forEach(function (verdict) {
      const r = write({
        gate: 'mccp-implement-codex',
        decision: 'grounding-x',
        plan: planRel,
        'design-grounding-verdict': verdict,
      });
      const v = validate(r.receipt);
      assert.strictEqual(v.ok, true, verdict + ': ' + JSON.stringify(v.errors));
      assert.strictEqual(r.receipt.meta.design_grounding_verdict, verdict);
    });
  });
});

test('grounding fields: invalid verdict rejected by schema', function () {
  withRepo(function (repo, planRel) {
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'grounding-x',
        plan: planRel,
        'design-grounding-verdict': 'bogus',
      });
    }, /SCHEMA_INVALID|design_grounding_verdict/);
  });
});

// ── restampGroundingVerdict (Codex Implement-R1 F3) ──────────────────────────

test('restamp: preserves design_critique_* + other meta, sets verdict, changes receipt_hash', function () {
  withRepo(function (repo, planRel) {
    // Initial write — design-gate fields set + captured, NO verdict yet (mirrors
    // the 2.5.6 gate-time write).
    const r0 = write({
      gate: 'mccp-implement-codex',
      decision: 'grounding-x',
      plan: planRel,
      'design-grounding-captured': true,
      'design-critique-rounds': 1,
      'design-critique-verdict': 'converged',
      'impeccable-routing-mode': 'auto',
      'security-skipped': true,
      'security-skip-reason': 'not a security-sensitive change at all here',
    });
    const hash0 = r0.receipt.receipt_hash;
    assert.strictEqual(r0.receipt.meta.design_grounding_verdict, null);

    // Post-EXECUTE restamp — only the grounding verdict is added.
    const r1 = restampGroundingVerdict({
      gate: 'mccp-implement-codex',
      decision: 'grounding-x',
      'design-grounding-verdict': 'grounded',
    });

    // Verdict landed.
    assert.strictEqual(r1.receipt.meta.design_grounding_verdict, 'grounded');
    // captured preserved.
    assert.strictEqual(r1.receipt.meta.design_grounding_captured, true);
    // ALL prior fields preserved (F3 — field-preserving, not fresh skeleton).
    assert.strictEqual(r1.receipt.meta.design_critique_rounds, 1);
    assert.strictEqual(r1.receipt.meta.design_critique_verdict, 'converged');
    assert.strictEqual(r1.receipt.meta.impeccable_routing_mode, 'auto');
    assert.strictEqual(r1.receipt.meta.security_skipped, true);
    assert.strictEqual(r1.receipt.meta.security_skip_reason,
      'not a security-sensitive change at all here');
    // Digest re-sealed (verdict is NOT carved out → hash changes).
    assert.notStrictEqual(r1.receipt.receipt_hash, hash0);
    // Still valid + receipt_hash is internally consistent.
    const v = validate(r1.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  });
});

test('restamp: preserves an UNKNOWN additive meta field (forward-compat)', function () {
  withRepo(function (repo, planRel) {
    const r0 = write({
      gate: 'mccp-implement-codex',
      decision: 'grounding-x',
      plan: planRel,
      'design-grounding-captured': true,
    });
    // Simulate a future additive meta field written by a newer writer, then
    // re-read by restamp. The restamp must NOT drop it.
    const store = require('../store');
    const { gitRepoRoot, subjectHash, receiptHash } = require('../hash');
    const root = gitRepoRoot(repo);
    const existing = store.readReceipt(root, 'mccp-implement-codex', 'grounding-x');
    existing.meta.future_additive_axis = 'keep-me';
    existing.subject_hash = subjectHash(existing);
    existing.receipt_hash = receiptHash(existing);
    store.writeReceipt(root, existing);

    const r1 = restampGroundingVerdict({
      gate: 'mccp-implement-codex',
      decision: 'grounding-x',
      'design-grounding-verdict': 'anchor_clean',
    });
    assert.strictEqual(r1.receipt.meta.future_additive_axis, 'keep-me',
      'unknown additive meta must survive restamp');
    assert.strictEqual(r1.receipt.meta.design_grounding_verdict, 'anchor_clean');
  });
});

test('restamp: invalid verdict rejected', function () {
  withRepo(function (repo, planRel) {
    write({ gate: 'mccp-implement-codex', decision: 'grounding-x', plan: planRel });
    assert.throws(function () {
      restampGroundingVerdict({
        gate: 'mccp-implement-codex',
        decision: 'grounding-x',
        'design-grounding-verdict': 'nope',
      });
    }, /design-grounding-verdict must be one of/);
  });
});

test('restamp: missing receipt → RECEIPT_NOT_FOUND', function () {
  withRepo(function (repo) {
    assert.throws(function () {
      restampGroundingVerdict({
        gate: 'mccp-implement-codex',
        decision: 'never-written',
        'design-grounding-verdict': 'grounded',
      });
    }, /no existing receipt/);
  });
});
