'use strict';

// v0.4.0 axis H — plan-conflict-detector unit tests.
//
// Five scenarios required by plan §"plan-conflict-detector.test.js":
//   1. true positive  — signature drift (TypeError in unplanned file)
//   2. true negative  — style-only failure (lint in planned file)
//   3. edge           — empty plan returns no-conflict (conservative)
//   4. true positive  — file expansion (≥2 unplanned files in diff)
//   5. true positive  — fake validation pass (exit 0 but "0 tests run")

const test = require('node:test');
const assert = require('node:assert/strict');

const det = require('../plan-conflict-detector');

const SAMPLE_PLAN = [
  '# Plan: sample',
  '',
  '## Files to Change',
  '',
  '| File | Action | Why |',
  '|---|---|---|',
  '| [utils.js](../../utils.js) | UPDATE | refactor |',
  '| [tests/utils.test.js](../../tests/utils.test.js) | CREATE | coverage |',
  '',
  '## Tasks',
  '',
  '- Task 1',
  ''
].join('\n');

test('Scenario 1 — true positive: signature drift in file outside plan', () => {
  const failureOutput = [
    'TypeError: helpers.parse is not a function',
    '    at run (helpers.js:12:5)',
    '    at Object.<anonymous> (tests/runner.js:42:10)',
  ].join('\n');
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: failureOutput,
    filesChanged: [],
  });
  assert.equal(result.conflict, true, JSON.stringify(result));
  assert.equal(result.signal, 'signature-drift');
  assert.match(result.reason, /helpers\.js/);
});

test('Scenario 2 — true negative: lint failure on planned file', () => {
  const failureOutput = [
    'utils.js:10:1 — Missing semicolon (semi)',
    'utils.js:15:5 — Unexpected console statement (no-console)',
    '2 errors',
  ].join('\n');
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: failureOutput,
    filesChanged: ['utils.js'],
  });
  assert.equal(result.conflict, false, JSON.stringify(result));
  assert.equal(result.signal, null);
});

test('Scenario 3 — edge: empty plan returns no-conflict (conservative)', () => {
  const result = det.detectFromValidationFailure({
    planText: '',
    failureOutput: 'TypeError: x is not a function\n  at foo (bar.js:1:1)',
    filesChanged: ['bar.js'],
  });
  assert.equal(result.conflict, false, JSON.stringify(result));
  assert.equal(result.signal, null);
});

test('Scenario 4 — true positive: file expansion ≥2 unplanned files', () => {
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: '',
    filesChanged: [
      'utils.js',
      'tests/utils.test.js',
      'src/newComponent.js',
      'src/anotherNew.js',
      'src/yetAnother.js',
    ],
  });
  assert.equal(result.conflict, true, JSON.stringify(result));
  assert.equal(result.signal, 'file-expansion');
  assert.match(result.reason, /unplanned/);
});

test('Scenario 5 — true positive: fake validation pass ("0 tests run")', () => {
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: 'PASS plugins/mccp/tests/lib/foo.test.js\n  ✓ ok\n0 tests run\n',
    filesChanged: [],
  });
  assert.equal(result.conflict, true, JSON.stringify(result));
  assert.equal(result.signal, 'fake-pass');
  assert.match(result.reason, /fake-pass/);
});

// — extra coverage on parsing helpers (cheap; guards future regressions) —

test('parseFilesToChange extracts paths from markdown link cells', () => {
  const files = det.parseFilesToChange(SAMPLE_PLAN);
  assert.deepEqual(files, ['utils.js', 'tests/utils.test.js']);
});

test('parseFilesToChange handles literal (non-link) paths', () => {
  const planLiteral = [
    '## Files to Change',
    '',
    '| File | Action |',
    '|---|---|',
    '| src/raw.js | CREATE |',
    '',
  ].join('\n');
  const files = det.parseFilesToChange(planLiteral);
  assert.deepEqual(files, ['src/raw.js']);
});

test('detectFromFileExpansion returns no-conflict with empty plan files', () => {
  const r = det.detectFromFileExpansion({
    planFilesToChange: [],
    actualFilesChanged: ['a.js', 'b.js'],
  });
  assert.equal(r.conflict, false);
});

test('isInPlan does tail-match for relative path variants', () => {
  assert.equal(det.isInPlan('plugins/foo/utils.js', ['utils.js']), true);
  assert.equal(det.isInPlan('utils.js', ['plugins/foo/utils.js']), true);
  assert.equal(det.isInPlan('utils.js', ['otherUtils.js']), false);
});

test('fake-pass pattern does not match a clean passing output', () => {
  const clean = 'PASS plugins/mccp/tests\n  ✓ test 1\n  ✓ test 2\n2 tests passing\n';
  assert.equal(det.matchesFakePass(clean), null);
});
