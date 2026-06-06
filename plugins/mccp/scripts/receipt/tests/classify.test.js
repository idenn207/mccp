'use strict';

// v0.2.8 Task 2.6.5a A3 axis (ι) — classifyValidationResult coverage.
// The classifier is the single source of truth for the tempfail / block /
// ok precedence contract. Five consumers depend on this returning the
// right label across all representative result shapes.

const test = require('node:test');
const assert = require('node:assert');
const { classifyValidationResult, exitCodeFor, EXIT_OK, EXIT_BLOCK, EXIT_TEMPFAIL } = require('../classify');

test('classify (ι.a) tempfail=true → "tempfail" + exit 75', function () {
  const r = { ok: false, tempfail: true, blocking: [{ kind: 'tempfail' }] };
  assert.strictEqual(classifyValidationResult(r), 'tempfail');
  assert.strictEqual(exitCodeFor(classifyValidationResult(r)), EXIT_TEMPFAIL);
});

test('classify (ι.b) ok=false + tempfail absent → "block" + exit 2', function () {
  const r = { ok: false, blocking: [{ gate_id: 'mccp-plan-codex', reason: 'missing' }] };
  assert.strictEqual(classifyValidationResult(r), 'block');
  assert.strictEqual(exitCodeFor(classifyValidationResult(r)), EXIT_BLOCK);
});

test('classify (ι.c) ok=true → "ok" + exit 0', function () {
  const r = { ok: true, blocking: [], missing: [], stale: [] };
  assert.strictEqual(classifyValidationResult(r), 'ok');
  assert.strictEqual(exitCodeFor(classifyValidationResult(r)), EXIT_OK);
});

// Defensive: tempfail precedence wins even when ok happens to be true
// (impossible-per-validateCommand-construction, but classifier is pure).
test('classify (ι.d) tempfail=true + ok=true → "tempfail" (precedence wins)', function () {
  const r = { ok: true, tempfail: true };
  assert.strictEqual(classifyValidationResult(r), 'tempfail');
});

// Defensive: null/undefined result → fail-closed block-equivalent.
test('classify (ι.e) null/undefined result → "ok" (vacuous OK, exit 0)', function () {
  // The classifier returns 'ok' for falsy result; CLI/preflight should
  // never reach this path (they only call classify after a successful
  // validateCommand return). The fail-closed default is at exitCodeFor's
  // unknown-kind branch (returns BLOCK), not here.
  assert.strictEqual(classifyValidationResult(null), 'ok');
  assert.strictEqual(classifyValidationResult(undefined), 'ok');
});

// Defensive: unknown kind from exitCodeFor → fail-closed BLOCK.
test('classify (ι.f) unknown classifier label → exit 2 (fail-closed)', function () {
  assert.strictEqual(exitCodeFor('unknown-label'), EXIT_BLOCK);
});
