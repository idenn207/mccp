'use strict';

// v0.2.8 Task 2.6.5 — generic decision_id reject when NO --plan provided.
//
// Codex R3 absorption: the bare branch-fallback path was the original
// false-green vector. /mccp:pr on `main` derives decision_id="main"
// without passing --plan; pre-v0.2.8 the validator would happily
// re-validate any unrelated receipt. v0.2.8 closes this by explicitly
// blocking generic decision_id + no --plan, with a runbook pointer.

const test = require('node:test');
const assert = require('node:assert');
const { mkTmpRepo } = require('./helpers');
const { validateCommand } = require('../validate-cmd');

test('generic-no-plan-reject: --decision default (no --plan) → blocked w/ runbook pointer', function () {
  const repo = mkTmpRepo();
  const r = validateCommand('/mccp:prp-implement', {
    cwd: repo,
    decisionId: 'default',
    // intentionally no planPath
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.blocking.length, 1);
  assert.strictEqual(r.blocking[0].gate_id, '_meta');
  assert.match(r.blocking[0].reason, /generic decision_id "default"/);
  assert.match(r.blocking[0].reason, /explicit --plan/);
  assert.match(r.blocking[0].reason, /quarantine runbook/);
});

test('generic-no-plan-reject: --decision main (no --plan) → blocked', function () {
  const repo = mkTmpRepo();
  const r = validateCommand('/mccp:pr', {
    cwd: repo,
    decisionId: 'main',
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.blocking[0].reason, /generic decision_id "main"/);
});

// Negative control: commands without preceding gate requirements (e.g.
// /mccp:plan, /mccp:plan-prd) must NOT be blocked by this rule — they
// can't possibly false-green because they don't validate any chain.
test('generic-no-plan-reject: /mccp:plan (no requires_preceding) is NOT blocked by generic-slug rule', function () {
  const repo = mkTmpRepo();
  const r = validateCommand('/mccp:plan', {
    cwd: repo,
    decisionId: 'main',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});
