'use strict';

// v1.3.0-m2 Task 3 — design-critique-decide oracle regression.
//
// Mirrors round-budget.test.js. Pure-function 9-case matrix, with cases 7-9
// covering the Codex R1 F2 absorption (severity normalization + UNKNOWN
// fail-closed + parse-fail fail-closed).

const test = require('node:test');
const assert = require('node:assert');
const {
  decideCritique,
  normalizeSeverity,
  parseRetryCap,
} = require('../design-critique-decide');

test('case 1 — empty findings → CONVERGED', () => {
  assert.strictEqual(
    decideCritique({ findings: [], round: 0, cap: 2 }),
    'CONVERGED'
  );
});

test('case 2 — HIGH finding, round=1, cap=2 → ESCALATE_NEXT_ROUND', () => {
  assert.strictEqual(
    decideCritique({ findings: [{ severity: 'HIGH' }], round: 1, cap: 2 }),
    'ESCALATE_NEXT_ROUND'
  );
});

test('case 3 — HIGH finding, round=2, cap=2 → DIVERGENT_UNRESOLVED', () => {
  assert.strictEqual(
    decideCritique({ findings: [{ severity: 'HIGH' }], round: 2, cap: 2 }),
    'DIVERGENT_UNRESOLVED'
  );
});

test('case 4 — CRITICAL finding, round=0, cap=2 → ESCALATE_NEXT_ROUND', () => {
  assert.strictEqual(
    decideCritique({ findings: [{ severity: 'CRITICAL' }], round: 0, cap: 2 }),
    'ESCALATE_NEXT_ROUND'
  );
});

test('case 5 — LOW + MEDIUM findings → CONVERGED (HIGH/CRITICAL only fail)', () => {
  assert.strictEqual(
    decideCritique({
      findings: [{ severity: 'LOW' }, { severity: 'MEDIUM' }],
      round: 0,
      cap: 2,
    }),
    'CONVERGED'
  );
});

test('case 6 — parseRetryCap("invalid") → 2 (default fallback)', () => {
  assert.strictEqual(
    parseRetryCap({ MCCP_DESIGN_CRITIQUE_MAX_RETRY: 'invalid' }),
    2
  );
  assert.strictEqual(parseRetryCap({}), 2);
  assert.strictEqual(parseRetryCap(undefined), 2);
  // explicit 0 is honored (kill-switch path — critique runs once then DIVERGENT)
  assert.strictEqual(parseRetryCap({ MCCP_DESIGN_CRITIQUE_MAX_RETRY: '0' }), 0);
  // out-of-range clamps to default
  assert.strictEqual(parseRetryCap({ MCCP_DESIGN_CRITIQUE_MAX_RETRY: '7' }), 2);
  assert.strictEqual(parseRetryCap({ MCCP_DESIGN_CRITIQUE_MAX_RETRY: '-1' }), 2);
});

// F2 absorption — case 7: lowercase severity normalizes to canonical uppercase
test('case 7 (F2) — lowercase "critical" normalizes to CRITICAL → ESCALATE_NEXT_ROUND', () => {
  assert.strictEqual(normalizeSeverity('critical'), 'CRITICAL');
  assert.strictEqual(normalizeSeverity('  HIGH  '), 'HIGH');
  assert.strictEqual(
    decideCritique({ findings: [{ severity: 'critical' }], round: 0, cap: 2 }),
    'ESCALATE_NEXT_ROUND'
  );
});

// F2 absorption — case 8: missing/null/P1-alias all behave as expected
test('case 8 (F2) — missing/null severity + P1 alias → ESCALATE_NEXT_ROUND', () => {
  // missing severity field → UNKNOWN → fail-closed
  assert.strictEqual(normalizeSeverity(undefined), 'UNKNOWN');
  assert.strictEqual(normalizeSeverity(null), 'UNKNOWN');
  assert.strictEqual(normalizeSeverity(''), 'UNKNOWN');
  // P1 alias normalizes to HIGH
  assert.strictEqual(normalizeSeverity('P1'), 'HIGH');
  assert.strictEqual(normalizeSeverity('P0'), 'CRITICAL');
  assert.strictEqual(normalizeSeverity('blocker'), 'CRITICAL');
  // mixed batch: one missing + one P1 + one null → all fail
  assert.strictEqual(
    decideCritique({
      findings: [{}, { severity: 'P1' }, { severity: null }],
      round: 0,
      cap: 2,
    }),
    'ESCALATE_NEXT_ROUND'
  );
});

// F2 absorption — case 9: parse failure (non-array findings) → DIVERGENT
test('case 9 (F2) — findings=null (parse failure) → DIVERGENT_UNRESOLVED', () => {
  assert.strictEqual(
    decideCritique({ findings: null, round: 0, cap: 2 }),
    'DIVERGENT_UNRESOLVED'
  );
  assert.strictEqual(
    decideCritique({ findings: undefined, round: 0, cap: 2 }),
    'DIVERGENT_UNRESOLVED'
  );
  assert.strictEqual(
    decideCritique({ findings: 'not-an-array', round: 0, cap: 2 }),
    'DIVERGENT_UNRESOLVED'
  );
  assert.strictEqual(
    decideCritique({ findings: { not: 'array' }, round: 0, cap: 2 }),
    'DIVERGENT_UNRESOLVED'
  );
});
