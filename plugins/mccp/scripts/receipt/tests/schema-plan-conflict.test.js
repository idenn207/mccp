'use strict';

// v0.4.0 axis H — receipt schema validates plan_conflict_escalated.
//
// Advisory-only audit field. Three cases per plan §"schema-plan-conflict":
//   (1) explicit true   → validate ok
//   (2) absent          → validate ok (backward-compat: pre-v0.4.0 receipts)
//   (3) wrong type      → validate rejects
// Plus a write-path round-trip via CLI flag --plan-conflict-escalated.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { validate, makeSkeleton } = require('../schema');
const { write } = require('../write');
const { mkTmpRepo, writeFileSync } = require('./helpers');

function baseValidReceipt(overrides) {
  const skel = makeSkeleton({
    gate_id: 'mccp-implement-codex',
    phase: 'implement',
    decision_id: 'feature-x',
    plan_hash: 'sha256:' + 'a'.repeat(64),
    design_doc_hash: [],
    base_sha: 'abcdef1',
    head_sha: 'abcdef2',
    subject_hash: 'sha256:' + 'b'.repeat(64),
    receipt_hash: 'sha256:' + 'c'.repeat(64),
  });
  skel.meta.command = '/mccp:prp-implement';
  if (overrides) {
    if (overrides.meta) Object.assign(skel.meta, overrides.meta);
  }
  return skel;
}

test('schema accepts plan_conflict_escalated=true', () => {
  const r = baseValidReceipt({ meta: { plan_conflict_escalated: true } });
  const result = validate(r);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('schema accepts plan_conflict_escalated=false (default)', () => {
  const r = baseValidReceipt({ meta: { plan_conflict_escalated: false } });
  const result = validate(r);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('schema accepts receipt with plan_conflict_escalated absent (backward-compat)', () => {
  const r = baseValidReceipt();
  delete r.meta.plan_conflict_escalated;
  const result = validate(r);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('schema rejects plan_conflict_escalated as string', () => {
  const r = baseValidReceipt();
  r.meta.plan_conflict_escalated = 'yes';
  const result = validate(r);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /plan_conflict_escalated.*boolean/i.test(e)),
    'expected error about plan_conflict_escalated type, got: ' + result.errors.join('; ')
  );
});

test('makeSkeleton defaults plan_conflict_escalated=false', () => {
  const skel = makeSkeleton({});
  assert.equal(skel.meta.plan_conflict_escalated, false);
});

test('write --plan-conflict-escalated stamps meta.plan_conflict_escalated=true', () => {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  const planRel = path.relative(repo, plan);
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'plan-conflict-escalated': true,
    });
    assert.equal(r.receipt.meta.plan_conflict_escalated, true);
  } finally {
    process.chdir(cwd);
  }
});

test('write without --plan-conflict-escalated leaves meta.plan_conflict_escalated=false', () => {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-y.plan.md', '# feature y\n');
  const planRel = path.relative(repo, plan);
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'feature-y',
      plan: planRel,
    });
    assert.equal(r.receipt.meta.plan_conflict_escalated, false);
  } finally {
    process.chdir(cwd);
  }
});
