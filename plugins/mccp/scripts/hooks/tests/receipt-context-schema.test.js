'use strict';

// v1.3.1 — unit tests for receipt-context-schema lib.
//
// The lib is pure data so tests are equally pure: feed inputs, assert on
// the returned object shape. No I/O, no spawn, no temp repos.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const schema = require(path.resolve(__dirname, '..', 'lib', 'receipt-context-schema'));

test('isRecoverable: allow-list contains plan, prp-implement, resume', function () {
  assert.strictEqual(schema.isRecoverable('mccp:plan'), true);
  assert.strictEqual(schema.isRecoverable('mccp:prp-implement'), true);
  assert.strictEqual(schema.isRecoverable('mccp:resume'), true);
});

test('isRecoverable: terminal/mutating commands NOT recoverable', function () {
  assert.strictEqual(schema.isRecoverable('mccp:pr'), false);
  assert.strictEqual(schema.isRecoverable('mccp:code-review'), false);
  assert.strictEqual(schema.isRecoverable('mccp:review-pr'), false);
});

test('isRecoverable: leading slash and case tolerated', function () {
  assert.strictEqual(schema.isRecoverable('/mccp:plan'), true);
  assert.strictEqual(schema.isRecoverable('MCCP:PRP-IMPLEMENT'), true);
});

test('computeMustNotProceed: recoverable + missing-only → false', function () {
  const result = {
    missing: [{ gate_id: 'mccp-plan-codex', reason: 'no receipt' }],
    stale: [], blocking: [], open_critical: [],
  };
  assert.strictEqual(schema.computeMustNotProceed('mccp:prp-implement', result), false);
});

test('computeMustNotProceed: recoverable + any stale → true (hard-block invariant)', function () {
  const result = {
    missing: [],
    stale: [{ gate_id: 'mccp-plan-codex', reason: 'plan hash differs' }],
    blocking: [], open_critical: [],
  };
  assert.strictEqual(schema.computeMustNotProceed('mccp:prp-implement', result), true);
});

test('computeMustNotProceed: terminal command → true regardless of result', function () {
  const result = {
    missing: [{ gate_id: 'mccp-pr-codex', reason: 'no receipt' }],
    stale: [], blocking: [], open_critical: [],
  };
  assert.strictEqual(schema.computeMustNotProceed('mccp:pr', result), true);
  assert.strictEqual(schema.computeMustNotProceed('mccp:code-review', result), true);
});

test('buildAdditionalContext: full shape with all fields populated', function () {
  const result = {
    ok: false,
    missing: [{ gate_id: 'mccp-plan-codex', decision_id: 'feat-x', reason: 'no receipt' }],
    stale: [], blocking: [], open_critical: [], warnings: [],
  };
  const ctx = schema.buildAdditionalContext(
    'mccp:prp-implement',
    'feat-x',
    '.claude/plans/feat-x.plan.md',
    '/repo',
    result,
    'block'
  );
  assert.deepStrictEqual(ctx, {
    mccp_receipt_gate: {
      commandName: 'mccp:prp-implement',
      decisionId: 'feat-x',
      planPath: '.claude/plans/feat-x.plan.md',
      cwd: '/repo',
      classifierKind: 'block',
      must_not_proceed: false,
      validateResult: {
        ok: false,
        missing: [{ gate_id: 'mccp-plan-codex', decision_id: 'feat-x', reason: 'no receipt' }],
        stale: [], blocking: [], open_critical: [], warnings: [],
      },
    },
  });
});

test('buildAdditionalContext: null planPath when not derivable', function () {
  const ctx = schema.buildAdditionalContext('mccp:plan', 'feat-x', '', '/repo', { missing: [] }, 'block');
  assert.strictEqual(ctx.mccp_receipt_gate.planPath, null);
});

test('buildAdditionalContext: terminal command sets must_not_proceed=true', function () {
  const result = { missing: [{ gate_id: 'g' }], stale: [], blocking: [], open_critical: [] };
  const ctx = schema.buildAdditionalContext('mccp:pr', 'feat-x', 'plan.md', '/repo', result, 'block');
  assert.strictEqual(ctx.mccp_receipt_gate.must_not_proceed, true);
});

test('buildAdditionalContext: normalizes missing arrays to empty (defensive)', function () {
  const ctx = schema.buildAdditionalContext('mccp:plan', 'feat-x', 'plan.md', '/repo', {}, 'block');
  assert.deepStrictEqual(ctx.mccp_receipt_gate.validateResult, {
    ok: false, missing: [], stale: [], blocking: [], open_critical: [], warnings: [],
  });
});

test('buildAdditionalContext: classifierKind defaults to "block" when omitted', function () {
  const ctx = schema.buildAdditionalContext('mccp:plan', 'feat-x', 'plan.md', '/repo', {});
  assert.strictEqual(ctx.mccp_receipt_gate.classifierKind, 'block');
});
