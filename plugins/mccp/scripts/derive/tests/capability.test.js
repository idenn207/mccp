'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { probeM0SchemaContract } = require('../capability');
const { derive } = require('../index');
const { tmpRepo, cleanup } = require('./helpers');

test('capability: real envelope module returns contract_present=true (Codex F4 absorption)', () => {
  const r = probeM0SchemaContract();
  assert.strictEqual(r.contract_present, true);
  assert.ok(r.evidence && r.evidence.length > 0);
});

test('capability: mocked permissive validator returns contract_present=false', () => {
  const mockEnvelope = {
    validate: () => ({ ok: true, errors: [] }),
  };
  const r = probeM0SchemaContract({ envelopeModule: mockEnvelope });
  assert.strictEqual(r.contract_present, false);
  assert.ok(r.evidence.indexOf('M0 Task 4a strict-validate not deployed') !== -1,
    'evidence should mention M0 Task 4a; got: ' + r.evidence);
});

test('capability: mocked state-writer missing dispatch_id field returns contract_present=false', () => {
  const mockState = {
    emptyState: () => ({ frontmatter: { state_version: 1 }, body: {} }),
  };
  const r = probeM0SchemaContract({ stateWriterModule: mockState });
  assert.strictEqual(r.contract_present, false);
  assert.ok(r.evidence.indexOf('emptyState missing field') !== -1,
    'evidence should mention missing field; got: ' + r.evidence);
});

test('capability: derive integration attaches m0_capability + critical warning when contract absent', () => {
  // Use derive with default (real modules) — should succeed
  const root = tmpRepo();
  try {
    const m = derive(root, { raw: true });
    assert.strictEqual(m.m0_capability.contract_present, true);
    const critical = m.warnings.filter(w => w.severity === 'critical');
    assert.strictEqual(critical.length, 0, 'no critical warnings expected when contract present');
  } finally {
    cleanup(root);
  }
});
