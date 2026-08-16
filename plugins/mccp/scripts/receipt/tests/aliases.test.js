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

test('aliases: plan-prd is registered but writes/requires nothing', function () {
  const spec = getCommandSpec('/mccp:plan-prd');
  assert.ok(spec, 'mccp:plan-prd must be registered so hooks recognize it explicitly');
  assert.deepStrictEqual(spec.produces, [], 'PRD stage writes no receipt');
  assert.deepStrictEqual(spec.requires_preceding, [], 'PRD has no preceding gate');
});

test('aliases: meta-research is registered with an empty spec (research is not a gate)', function () {
  const spec = getCommandSpec('/mccp:meta-research');
  assert.ok(spec, 'mccp:meta-research must be registered so hooks recognize it explicitly');
  // Asserting mere registration would stay green if someone later hung a gate on
  // this command. The EMPTY ARRAYS are what pin "research issues no receipt".
  assert.deepStrictEqual(spec.produces, [], 'research writes no receipt');
  assert.deepStrictEqual(spec.requires_preceding, [], 'research has no preceding gate');
});

test('aliases: prp-pr mirrors pr verbatim (PRP-flow alias)', function () {
  const pr = getCommandSpec('/mccp:pr');
  const prpPr = getCommandSpec('/mccp:prp-pr');
  assert.deepStrictEqual(prpPr, pr, 'prp-pr must be a verbatim alias of pr');
});

test('aliases: review-pr mirrors code-review verbatim (ECC alias)', function () {
  const cr = getCommandSpec('/mccp:code-review');
  const reviewPr = getCommandSpec('/mccp:review-pr');
  assert.deepStrictEqual(reviewPr, cr, 'review-pr must be a verbatim alias of code-review');
});
