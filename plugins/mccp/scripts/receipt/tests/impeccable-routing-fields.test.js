'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate } = require('../schema');

function withRepo(fn) {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/routing-x.plan.md', '# Plan: routing-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn(repo, path.relative(repo, plan));
  } finally {
    process.chdir(cwd);
  }
}

test('routing fields: mode + structured commands round-trip and validate', function () {
  withRepo(function (repo, planRel) {
    const routed = [
      { command: 'shape', call_form: 'background', status: 'invoked' },
      { command: 'layout', call_form: 'invoke', status: 'invoked' },
      { command: 'audit', call_form: 'invoke', status: 'failed' },
    ];
    const routedFile = writeFileSync(repo, '.claude/state/routed.json', JSON.stringify(routed));
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'routing-x',
      plan: planRel,
      'impeccable-routing-mode': 'auto',
      'impeccable-commands-routed-file': path.relative(repo, routedFile),
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.impeccable_routing_mode, 'auto');
    assert.strictEqual(r.receipt.meta.impeccable_commands_routed.length, 3);
    assert.strictEqual(r.receipt.meta.impeccable_commands_routed[2].status, 'failed');
  });
});

test('routing fields: absent → null defaults, validates (present-only legacy)', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: 'routing-x', plan: planRel });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.impeccable_routing_mode, null);
    assert.strictEqual(r.receipt.meta.impeccable_commands_routed, null);
  });
});

test('M3 a11y_auto_invoked: --a11y-auto-invoked → true, round-trips and validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({
      gate: 'mccp-pr-codex',
      decision: 'routing-x',
      plan: planRel,
      'a11y-auto-invoked': true,
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.a11y_auto_invoked, true);
  });
});

test('M3 a11y_auto_invoked: absent → default false, validates (present-only)', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-pr-codex', decision: 'routing-x', plan: planRel });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.a11y_auto_invoked, false);
  });
});

test('M3 a11y_auto_invoked: legacy receipt without the field still validates', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-pr-codex', decision: 'routing-x', plan: planRel });
    delete r.receipt.meta.a11y_auto_invoked;
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  });
});

test('M3 a11y_auto_invoked: non-boolean rejected by schema', function () {
  withRepo(function (repo, planRel) {
    const r = write({ gate: 'mccp-pr-codex', decision: 'routing-x', plan: planRel });
    r.receipt.meta.a11y_auto_invoked = 'yes';
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.some((e) => /a11y_auto_invoked/.test(e)), JSON.stringify(v.errors));
  });
});

test('routing fields: invalid mode value rejected by schema', function () {
  withRepo(function (repo, planRel) {
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'routing-x',
        plan: planRel,
        'impeccable-routing-mode': 'turbo',
      });
    }, /SCHEMA_INVALID|impeccable_routing_mode/);
  });
});

test('routing fields: invalid call_form/status enum rejected', function () {
  withRepo(function (repo, planRel) {
    const bad = [{ command: 'shape', call_form: 'teleport', status: 'invoked' }];
    const badFile = writeFileSync(repo, '.claude/state/bad.json', JSON.stringify(bad));
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'routing-x',
        plan: planRel,
        'impeccable-commands-routed-file': path.relative(repo, badFile),
      });
    }, /SCHEMA_INVALID|call_form/);
  });
});

test('routing fields: malformed entry (missing command) rejected', function () {
  withRepo(function (repo, planRel) {
    const bad = [{ call_form: 'invoke', status: 'invoked' }];
    const badFile = writeFileSync(repo, '.claude/state/bad2.json', JSON.stringify(bad));
    assert.throws(function () {
      write({
        gate: 'mccp-implement-codex',
        decision: 'routing-x',
        plan: planRel,
        'impeccable-commands-routed-file': path.relative(repo, badFile),
      });
    }, /SCHEMA_INVALID|command/);
  });
});
