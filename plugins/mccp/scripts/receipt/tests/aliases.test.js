'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ALIAS_MATRIX, getCommandSpec, normalizeCommand, phaseFromGate } = require('../aliases');
const { GATE_IDS } = require('../schema');

test('aliases: every entry uses valid gate_ids', function () {
  for (const cmd of Object.keys(ALIAS_MATRIX)) {
    const spec = ALIAS_MATRIX[cmd];
    const all = [].concat(spec.produces || [], spec.requires_preceding || [], spec.design_optional || []);
    for (const g of all) {
      assert.ok(GATE_IDS.indexOf(g) !== -1, 'unknown gate "' + g + '" in alias for ' + cmd);
    }
  }
});

test('aliases: getCommandSpec strips leading slash', function () {
  assert.deepStrictEqual(getCommandSpec('/mccp:plan'), ALIAS_MATRIX['mccp:plan']);
  assert.deepStrictEqual(getCommandSpec('mccp:plan'), ALIAS_MATRIX['mccp:plan']);
  assert.deepStrictEqual(getCommandSpec('MCCP:PLAN'), ALIAS_MATRIX['mccp:plan']);
});

test('aliases: getCommandSpec returns null for unknown', function () {
  assert.strictEqual(getCommandSpec('/mccp:made-up'), null);
  assert.strictEqual(getCommandSpec(null), null);
  assert.strictEqual(getCommandSpec(undefined), null);
});

test('aliases: normalizeCommand', function () {
  assert.strictEqual(normalizeCommand('/mccp:plan'), 'mccp:plan');
  assert.strictEqual(normalizeCommand('mccp:PLAN'), 'mccp:plan');
});

test('aliases: phaseFromGate covers every GATE_ID', function () {
  for (const g of GATE_IDS) {
    assert.ok(phaseFromGate(g), 'no phase for ' + g);
  }
});

test('aliases: prp-implement requires mccp-plan-codex', function () {
  const spec = getCommandSpec('/mccp:prp-implement');
  assert.ok(spec.requires_preceding.indexOf('mccp-plan-codex') !== -1);
});

test('aliases: pr requires mccp-plan-codex and mccp-implement-codex', function () {
  const spec = getCommandSpec('/mccp:pr');
  assert.ok(spec.requires_preceding.indexOf('mccp-plan-codex') !== -1);
  assert.ok(spec.requires_preceding.indexOf('mccp-implement-codex') !== -1);
});

test('aliases: code-review requires mccp-pr-codex', function () {
  const spec = getCommandSpec('/mccp:code-review');
  assert.ok(spec.requires_preceding.indexOf('mccp-pr-codex') !== -1);
});
