'use strict';

// G1 invariant regression guard — every hook that wraps gate decisions MUST
// route internal errors through the G1 surface (systemMessage emit + L1
// opportunistic write + return allow), not a silent fail-open.
//
// Mirror of security-reviewer-guard.test.js: assert positive presence of
// the G1 helper + at least one invocation in each guarded hook, plus check
// that we did not regress to a silent `return allow()` / `return 0` directly
// from a module-load or validate catch block.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOKS = [
  path.join(PLUGIN_ROOT, 'scripts', 'hooks', 'receipt-prompt.js'),
  path.join(PLUGIN_ROOT, 'scripts', 'hooks', 'receipt-skill.js'),
];

const G1_DEFINE_RE = /function\s+g1Allow\s*\(/;
const G1_CALL_RE = /\bg1Allow\s*\(/g;
const HOOK_TRACE_LOAD_RE = /try\s*\{\s*return require\([^)]*hook-trace[^)]*\)/;

// Anti-pattern: a catch block whose handler just returns silently without
// going through g1Allow. We allow the stdin-parse catch (event undefined) to
// stay silent, but the load/validate catches must use g1Allow.
const SILENT_VALIDATE_FAIL_RE = /debug\('validate error[^)]*\);\s*return\s+(allow\(\)|0)\s*;/;
const SILENT_LOAD_FAIL_RE = /debug\('cannot load validate-cmd[^)]*\);\s*return\s+(allow\(\)|0)\s*;/;

test('each guarded hook defines a g1Allow helper', () => {
  for (const file of HOOKS) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(G1_DEFINE_RE.test(src),
      path.basename(file) + ': g1Allow definition missing');
  }
});

test('each guarded hook invokes g1Allow at least twice (module-load + validate)', () => {
  for (const file of HOOKS) {
    const src = fs.readFileSync(file, 'utf8');
    const matches = src.match(G1_CALL_RE) || [];
    // We expect: 1 definition + 2 catch-block calls. Definition syntax is
    // `function g1Allow(` which the call regex `\bg1Allow\s*\(` also matches,
    // so the floor for "at least two real invocations" is 3 hits total.
    assert.ok(matches.length >= 3,
      path.basename(file) + ': expected ≥3 g1Allow hits (1 def + ≥2 calls), got ' + matches.length);
  }
});

test('each guarded hook loads hook-trace via a try-catch wrapped require', () => {
  for (const file of HOOKS) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(HOOK_TRACE_LOAD_RE.test(src),
      path.basename(file) + ': hook-trace require not wrapped in try/catch');
  }
});

test('no silent fail-open regression in validate catch blocks', () => {
  for (const file of HOOKS) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!SILENT_VALIDATE_FAIL_RE.test(src),
      path.basename(file) + ': silent return after "validate error" debug — must go through g1Allow');
  }
});

test('no silent fail-open regression in module-load catch blocks', () => {
  for (const file of HOOKS) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!SILENT_LOAD_FAIL_RE.test(src),
      path.basename(file) + ': silent return after "cannot load validate-cmd" debug — must go through g1Allow');
  }
});

test('synthetic offender (positive) trips the silent-fail regex', () => {
  // Sanity check: if a future regression introduces this exact shape, our
  // regex catches it.
  const offender = "debug('validate error: ' + err.message);\n    return allow();";
  assert.ok(SILENT_VALIDATE_FAIL_RE.test(offender),
    'silent fail regex must catch the textbook anti-pattern');
});

test('synthetic safe-form (negative) passes the silent-fail regex', () => {
  const safe = "debug('validate error: ' + err.message);\n    return g1Allow(event, { exceptionClass: 'ValidationError', reason: err.message });";
  assert.ok(!SILENT_VALIDATE_FAIL_RE.test(safe),
    'silent fail regex must NOT match the canonical g1Allow form');
});
