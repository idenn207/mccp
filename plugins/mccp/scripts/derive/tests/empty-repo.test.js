'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { derive } = require('../index');
const { emptyModel, validateShape, MODEL_VERSION } = require('../model');
const { tmpRepo, cleanup } = require('./helpers');

test('emptyModel returns shape-valid skeleton with masked=true and capability unprobed', () => {
  const m = emptyModel('/x');
  const v = validateShape(m);
  assert.strictEqual(v.ok, true, 'errors: ' + v.errors.join('; '));
  assert.strictEqual(m.masked, true);
  assert.strictEqual(m.m0_capability.contract_present, null);
  assert.strictEqual(m.schema_version, MODEL_VERSION);
});

test('derive on non-mccp directory (no .claude/) returns empty masked model', () => {
  const root = tmpRepo();
  try {
    const m = derive(root);
    assert.strictEqual(m.masked, true);
    assert.strictEqual(m.schema_version, MODEL_VERSION);
    assert.strictEqual(m.sources.plans.count, 0);
    assert.strictEqual(m.sources.receipts.count, 0);
    assert.strictEqual(m.sources.state.item, null);
    assert.strictEqual(m.sources.envelopes.count, 0);
    assert.notStrictEqual(m.m0_capability.contract_present, null,
      'capability probe should have run even without .claude/');
  } finally {
    cleanup(root);
  }
});

test('derive throws TypeError when repoRoot is not a string', () => {
  assert.throws(() => derive(null), TypeError);
  assert.throws(() => derive(''), TypeError);
  assert.throws(() => derive(42), TypeError);
});
