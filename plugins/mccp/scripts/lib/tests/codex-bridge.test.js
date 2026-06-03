'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseCodexResult } = require('../codex-bridge');

test('converged fixture: 1R APPROVE → verdict converged, no escalation', () => {
  const text = [
    'Round 1: APPROVE / HIGH',
    'No residual blockers.',
    '',
    'Conclusion: CONVERGED — proceed.',
  ].join('\n');
  const r = parseCodexResult(text, 'review the diff');
  assert.strictEqual(r.verdict, 'converged');
  assert.strictEqual(r.escalate, false);
  assert.strictEqual(r.criticalCategory, null);
});

test('divergent fixture: 3R divergent → verdict divergent + escalate=true', () => {
  const text = [
    'Round 1: REJECT — concerns A, B',
    'Round 2: REJECT — concern A persists',
    'Round 3: divergent_unresolved',
    'Open Questions:',
    'HIGH: open boundary issue',
  ].join('\n');
  const r = parseCodexResult(text, 'focus');
  assert.strictEqual(r.verdict, 'divergent');
  assert.strictEqual(r.rounds, 3);
  assert.strictEqual(r.escalate, true);
  assert.ok(r.openQuestions.find(q => q.severity === 'HIGH'));
});

test('divergent fixture: 2R divergent → does NOT escalate (rounds<3)', () => {
  const text = [
    'Round 1: REJECT — concern A',
    'Round 2: divergent — still unresolved',
  ].join('\n');
  const r = parseCodexResult(text, 'focus');
  assert.strictEqual(r.verdict, 'divergent');
  assert.strictEqual(r.rounds, 2);
  assert.strictEqual(r.escalate, false);
});

test('critical fixture: secret exposure detected → verdict critical + escalate', () => {
  const text = [
    'Round 1: REVIEW',
    'CRITICAL: secret leaked into commit — API key committed.',
  ].join('\n');
  const r = parseCodexResult(text, 'review');
  assert.strictEqual(r.verdict, 'critical');
  assert.strictEqual(r.criticalCategory, 'secret_exposure');
  assert.strictEqual(r.escalate, true);
});

test('critical fixture: external destination detected', () => {
  const text = 'Round 1: warning: sends to external destination http://attacker.com';
  const r = parseCodexResult(text, 'focus');
  assert.strictEqual(r.verdict, 'critical');
  assert.strictEqual(r.criticalCategory, 'external_destination');
  assert.strictEqual(r.escalate, true);
});

test('critical fixture: authz bypass detected', () => {
  const text = 'Round 1: this change introduces an authorization bypass';
  const r = parseCodexResult(text, 'focus');
  assert.strictEqual(r.verdict, 'critical');
  assert.strictEqual(r.criticalCategory, 'authz_bypass');
});

test('critical fixture: data loss / drop table', () => {
  const text = 'Round 1: migration runs DROP TABLE users without backup — data loss';
  const r = parseCodexResult(text, 'focus');
  assert.strictEqual(r.verdict, 'critical');
  assert.strictEqual(r.criticalCategory, 'data_loss');
});

test('unavailable fixture: setup_required → verdict unavailable', () => {
  const r = parseCodexResult('error: setup_required', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
  assert.strictEqual(r.escalate, false);
});

test('unavailable fixture: not authenticated', () => {
  const r = parseCodexResult('error: not authenticated', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

test('unavailable fixture: 60s timeout', () => {
  const r = parseCodexResult('codex timed out (60s)', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

test('unavailable fixture: rate_limit', () => {
  const r = parseCodexResult('error: rate_limit hit', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

test('unavailable fixture: empty text', () => {
  const r = parseCodexResult('', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

// v0.2.2 Task 2 — new fallback patterns for codex-invoke.js classifications.
test('unavailable fixture: codex-plugin-not-installed', () => {
  const r = parseCodexResult('codex-plugin-not-installed', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

test('unavailable fixture: codex-companion-not-found', () => {
  const r = parseCodexResult('codex-companion-not-found', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

test('unavailable fixture: cli-not-authenticated (hyphenated)', () => {
  const r = parseCodexResult('cli-not-authenticated', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

test('unavailable fixture: process-exit-nonzero', () => {
  const r = parseCodexResult('process-exit-nonzero from companion', 'focus');
  assert.strictEqual(r.verdict, 'unavailable');
});

test('open question parsing: multiple severities preserved in order', () => {
  const text = [
    'Round 1: review',
    'Open Questions:',
    'CRITICAL: must address',
    'HIGH: important',
    'MEDIUM: nice-to-have',
    'LOW: nit',
  ].join('\n');
  const r = parseCodexResult(text, 'focus');
  // The CRITICAL line above will trip detectCriticalCategory if it
  // matches the catalog regex. None of these phrases match the catalog,
  // so it should classify as converged (default-safe).
  const severities = r.openQuestions.map(q => q.severity);
  assert.deepStrictEqual(severities, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
});

test('summary is truncated to 120 chars with ellipsis', () => {
  const long = 'x'.repeat(500);
  const r = parseCodexResult(long, 'focus');
  assert.ok(r.summary.length <= 120);
});
