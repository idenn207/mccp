'use strict';

// workflows/plan-review.js — the one file in this milestone with no behavioural
// coverage, and the file where the dry-run found a total functional failure.
//
// It cannot be `require`d: the Workflow sandbox supplies `args`/`agent`/`log`/
// `parallel` as globals and the script has no exports. So it was only ever
// checked with `node --check`, and a defect that made multi-agent mode approve
// NOTHING — args arriving as a JSON string collapsed the panel to one reviewer,
// which can never satisfy the quorum — sat behind a passing syntax check.
//
// This file reads the source and exercises the inlined logic directly. Two jobs:
//   1. coerceInput's behaviour (the dry-run defect)
//   2. drift between the inlined FAITHFUL PORTS and lib/plan-review/perspectives.js,
//      which the header promises to keep in sync but nothing verified.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.join(__dirname, '..', '..', 'workflows', 'plan-review.js');
const SRC = fs.readFileSync(WORKFLOW_PATH, 'utf8');

const {
  REVIEW_PERSPECTIVES,
  REVIEW_SCHEMA,
  buildRefutePrompt,
} = require('../plan-review/perspectives');

// Lift a top-level `function name(...) {...}` out of the source by brace
// matching. Regex alone cannot do this correctly and a wrong extraction would
// make the test assert something other than the shipped code.
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'function ' + name + ' not found in the workflow source');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces extracting ' + name);
}

// `coerceInput` calls log(); supply a collector so the real branch executes.
function loadCoerceInput() {
  const body = extractFunction(SRC, 'coerceInput');
  const logs = [];
  // eslint-disable-next-line no-new-func
  const factory = new Function('log', body + '; return coerceInput;');
  return { coerceInput: factory(function (m) { logs.push(String(m)); }), logs: logs };
}

// ── 1. coerceInput ────────────────────────────────────────────────────────────

test('an object passes through unchanged', () => {
  const { coerceInput } = loadCoerceInput();
  const o = { planPath: 'a.md', fleetKeys: ['architect'] };
  assert.equal(coerceInput(o), o);
});

test('a JSON string is parsed — the dry-run defect', () => {
  const { coerceInput, logs } = loadCoerceInput();
  const payload = {
    planPath: '.claude/plans/x.plan.md',
    reviewedPlanHash: 'sha256:' + 'a'.repeat(64),
    fleetKeys: ['architect', 'security', 'test', 'invariant'],
  };
  const got = coerceInput(JSON.stringify(payload));
  assert.deepEqual(got, payload,
    'a stringified payload must not collapse the panel to one reviewer');
  assert.equal(got.fleetKeys.length, 4);
  assert.match(logs.join('\n'), /JSON string/, 'the coercion must be announced, not silent');
});

test('a non-JSON string degrades to empty input, loudly', () => {
  const { coerceInput, logs } = loadCoerceInput();
  assert.deepEqual(coerceInput('not json at all'), {});
  assert.match(logs.join('\n'), /non-JSON string/);
});

test('null, undefined, arrays and scalars all degrade to empty input', () => {
  const { coerceInput } = loadCoerceInput();
  [null, undefined, 42, true, ['architect'], '[1,2]'].forEach(function (v) {
    assert.deepEqual(coerceInput(v), {}, JSON.stringify(v) || String(v));
  });
});

// ── 2. port drift vs the tested reference implementation ──────────────────────

test('the inlined CATALOG matches REVIEW_PERSPECTIVES exactly', () => {
  const body = extractFunction(SRC, 'buildPrompt');   // proves the file parsed
  assert.ok(body.length > 0);

  const catalogSrc = SRC.slice(SRC.indexOf('const CATALOG = ['));
  REVIEW_PERSPECTIVES.forEach(function (p) {
    assert.ok(catalogSrc.indexOf("key: '" + p.key + "'") !== -1,
      'CATALOG is missing perspective key ' + p.key);
    assert.ok(catalogSrc.indexOf("agentType: '" + p.agentType + "'") !== -1,
      'CATALOG agentType drifted for ' + p.key + ' (expected ' + p.agentType + ')');
    assert.ok(catalogSrc.indexOf(p.lens) !== -1,
      'CATALOG lens drifted for ' + p.key);
  });
});

test('the inlined prompt is byte-identical to buildRefutePrompt', () => {
  const body = extractFunction(SRC, 'buildPrompt');
  // eslint-disable-next-line no-new-func
  const inlined = new Function(body + '; return buildPrompt;')();

  REVIEW_PERSPECTIVES.forEach(function (p) {
    const got = inlined(p, 'plan.md', 'prd.md', 'sha256:abc');
    const want = buildRefutePrompt({
      perspective: p, planPath: 'plan.md', prdPath: 'prd.md', reviewedPlanHash: 'sha256:abc',
    });
    assert.equal(got, want, 'prompt drifted for ' + p.key);
  });
});

test('the inlined SCHEMA matches REVIEW_SCHEMA', () => {
  const start = SRC.indexOf('const SCHEMA = {');
  assert.notEqual(start, -1);
  const body = extractFunction(SRC.slice(0, start) + 'function __s() ' + SRC.slice(start + 'const SCHEMA = '.length), '__s');
  // eslint-disable-next-line no-new-func
  const inlined = new Function('return ' + body.slice(body.indexOf('{')))();
  assert.deepEqual(inlined, JSON.parse(JSON.stringify(REVIEW_SCHEMA)));
});

test('the degrade branch still exists and still degrades to ONE reviewer', () => {
  // A future edit that "helpfully" defaults a missing fleet to all four would be
  // a straight runaway-cap bypass. Pin the intent.
  assert.match(SRC, /PERSPECTIVE_ORDER\.slice\(0,\s*1\)/,
    'missing fleetKeys must degrade to a single reviewer, never to the full panel');
});
