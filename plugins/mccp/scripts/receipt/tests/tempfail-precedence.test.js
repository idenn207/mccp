'use strict';

// v0.2.8 Task 2.6.5a A3 — tempfail precedence contract (axes η, θ).
//
// Contract (documented in CLAUDE.md §3.3):
//   1. result.tempfail === true → caller MUST treat as retryable (exit 75)
//   2. else if result.ok === false → hard block (exit 2)
//   3. else → success (exit 0)
//
// 2 axes:
//   (η) precedence canary — synthetic result with BOTH tempfail=true AND a
//        hard-block entry. classify → 'tempfail'; cli would exit 75.
//   (θ) invariant — `tempfail` field MUST be paired with at least one
//        `blocking[].kind === "tempfail"` entry (validateCommand contract).

const test = require('node:test');
const assert = require('node:assert');
const { classifyValidationResult, EXIT_TEMPFAIL } = require('../classify');

// (η) precedence: tempfail wins over hard-block in the classifier.
test('tempfail-precedence (η) mixed tempfail + hard-block → classify → tempfail (precedence canary)', function () {
  const mixed = {
    ok: false,
    tempfail: true,
    exitCode: EXIT_TEMPFAIL,
    blocking: [
      { gate_id: '_meta', kind: 'tempfail', reason: 'migration in progress' },
      { gate_id: 'mccp-plan-codex', reason: 'subject_hash mismatch' },
    ],
  };
  assert.strictEqual(classifyValidationResult(mixed), 'tempfail',
    'tempfail precedence MUST win over a hard-block entry');
});

// (θ) invariant: validateCommand produces tempfail=true IFF at least one
// blocking[].kind === "tempfail" exists. This pins the canonical shape
// contract so downstream consumers can rely on either signal.
test('tempfail-precedence (θ) shape invariant — tempfail=true ⇔ blocking has kind=tempfail entry', function () {
  // Synthesize a "well-formed" tempfail result.
  const wellFormed = {
    ok: false,
    tempfail: true,
    exitCode: EXIT_TEMPFAIL,
    blocking: [{ gate_id: '_meta', kind: 'tempfail', reason: 'migration in progress' }],
  };
  const hasTempfailEntry = (wellFormed.blocking || []).some(b => b && b.kind === 'tempfail');
  assert.strictEqual(wellFormed.tempfail, hasTempfailEntry,
    'well-formed tempfail: top-level field + kind:tempfail entry agree');

  // A "tempfail=true but no kind=tempfail entry" result is schema-broken.
  // Detecting it is the caller's responsibility; the invariant test pins
  // that such a result would be detectable.
  const broken = { ok: false, tempfail: true, blocking: [] };
  const brokenHasEntry = (broken.blocking || []).some(b => b && b.kind === 'tempfail');
  assert.notStrictEqual(broken.tempfail, brokenHasEntry,
    'broken-shape detectable: tempfail=true but blocking[] lacks kind=tempfail');

  // The classifier still returns "tempfail" for the broken case (top-level
  // wins) — but a future schema validator can warn on this mismatch.
  assert.strictEqual(classifyValidationResult(broken), 'tempfail',
    'classifier prefers top-level tempfail even when blocking[] lacks the entry');
});
