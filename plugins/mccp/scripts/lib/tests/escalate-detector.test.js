'use strict';

const test = require('node:test');
const assert = require('node:assert');

const detector = require('../escalate-detector');

function baseReceipt(overrides) {
  return Object.assign({
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
  }, overrides || {});
}

test('finding CRITICAL → trigger=finding_critical, verdict=codex_critical', () => {
  const r = baseReceipt({
    findings: [
      { severity: 'CRITICAL', area: 'auth', description: 'token exposed' },
    ],
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.trigger, 'finding_critical');
  assert.strictEqual(d.verdict, 'codex_critical');
  assert.strictEqual(d.escalate, true);
  assert.strictEqual(d.criticalCategory, null);
  assert.strictEqual(d.evidence.findingsCritical.length, 1);
});

test('open_question CRITICAL + secret_exposure catalog match', () => {
  const r = baseReceipt({
    resolution: {
      converged: true, rounds: 2, accepted: [], rejected: [],
      open_questions: [{ severity: 'CRITICAL', item: 'API key was exposed in commit history' }],
    },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.trigger, 'auto_critical_catalog');
  assert.strictEqual(d.verdict, 'codex_critical');
  assert.strictEqual(d.escalate, true);
  assert.strictEqual(d.criticalCategory, 'secret_exposure');
});

test('open_question CRITICAL + data_loss catalog match', () => {
  const r = baseReceipt({
    resolution: {
      converged: true, rounds: 1, accepted: [], rejected: [],
      open_questions: [{ severity: 'CRITICAL', item: 'migration may cause irreversible data loss' }],
    },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.criticalCategory, 'data_loss');
  assert.strictEqual(d.escalate, true);
});

test('open_question CRITICAL + authz_bypass catalog match', () => {
  const r = baseReceipt({
    resolution: {
      converged: true, rounds: 1, accepted: [], rejected: [],
      open_questions: [{ severity: 'CRITICAL', item: 'allows privilege escalation across tenants' }],
    },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.criticalCategory, 'authz_bypass');
  assert.strictEqual(d.escalate, true);
});

test('open_question CRITICAL + external_destination catalog match', () => {
  const r = baseReceipt({
    resolution: {
      converged: true, rounds: 1, accepted: [], rejected: [],
      open_questions: [{ severity: 'CRITICAL', item: 'sends raw payload to external destination' }],
    },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.criticalCategory, 'external_destination');
  assert.strictEqual(d.escalate, true);
});

test('open_question CRITICAL + crypto_key catalog match', () => {
  const r = baseReceipt({
    resolution: {
      converged: true, rounds: 1, accepted: [], rejected: [],
      open_questions: [{ severity: 'CRITICAL', item: 'signing key rotation missing' }],
    },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.criticalCategory, 'crypto_key');
  assert.strictEqual(d.escalate, true);
});

test('open_question CRITICAL + no catalog match → escalate=false', () => {
  const r = baseReceipt({
    resolution: {
      converged: true, rounds: 1, accepted: [], rejected: [],
      open_questions: [{ severity: 'CRITICAL', item: 'something vague that does not match any catalog' }],
    },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.escalate, false);
  assert.strictEqual(d.trigger, null);
  assert.strictEqual(d.criticalCategory, null);
  // open_critical still recorded in evidence even though no escalation
  assert.strictEqual(d.evidence.openCritical.length, 1);
});

test('converged=false + rounds=3 → divergent_unresolved', () => {
  const r = baseReceipt({
    resolution: { converged: false, rounds: 3, accepted: [], rejected: [], open_questions: [] },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.trigger, 'divergent_unresolved');
  assert.strictEqual(d.verdict, 'codex_divergent');
  assert.strictEqual(d.escalate, true);
  assert.strictEqual(d.evidence.divergentUnresolved, true);
});

test('converged=false + rounds=2 → escalate=false (rounds < 3)', () => {
  const r = baseReceipt({
    resolution: { converged: false, rounds: 2, accepted: [], rejected: [], open_questions: [] },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.escalate, false);
  assert.strictEqual(d.evidence.divergentUnresolved, false);
});

test('converged=true + rounds=5 → escalate=false', () => {
  const r = baseReceipt({
    resolution: { converged: true, rounds: 5, accepted: [], rejected: [], open_questions: [] },
  });
  const d = detector.detectFromReceipt(r);
  assert.strictEqual(d.escalate, false);
  assert.strictEqual(d.evidence.divergentUnresolved, false);
});

test('empty findings + empty open_questions + converged=true → escalate=false', () => {
  const d = detector.detectFromReceipt(baseReceipt());
  assert.strictEqual(d.escalate, false);
  assert.strictEqual(d.trigger, null);
  assert.strictEqual(d.verdict, null);
  assert.strictEqual(d.criticalCategory, null);
  assert.strictEqual(d.evidence.findingsCritical.length, 0);
  assert.strictEqual(d.evidence.openCritical.length, 0);
  assert.strictEqual(d.evidence.divergentUnresolved, false);
});
