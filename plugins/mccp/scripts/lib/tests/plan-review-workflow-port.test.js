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

// ── 3. the budget gate, EXECUTED ──────────────────────────────────────────────
//
// M4 axis B. The budget branch was only ever `node --check`ed, and a syntax check
// cannot see that `minRemaining` had no producer: the sole caller (cli.js
// emit-workflow-args) never put the key in the payload, so `input.minRemaining`
// read `undefined`, the Number.isFinite guard substituted 0, and
// `budget.remaining() < 0` is unreachable for any non-negative remaining. The
// gate existed in source and could not fire.
//
// `extractFunction` cannot reach it — the branch is top-level script body, not a
// function — so run the whole script instead. The only edit is stripping the ESM
// `export` keyword, which `new AsyncFunction` cannot parse; everything the branch
// touches (`args`, `budget`, `log`, `phase`, `parallel`, `agent`) is supplied as a
// sandbox global exactly as the Workflow runtime supplies it.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function runWorkflow(opts) {
  const o = opts || {};
  const logs = [];
  const spawned = [];
  const body = SRC.replace(/^export const meta/m, 'const meta');
  const fn = new AsyncFunction('args', 'log', 'budget', 'phase', 'parallel', 'agent', body);
  return fn(
    o.input,
    function (m) { logs.push(String(m)); },
    o.budget || { total: null, spent: function () { return 0; }, remaining: function () { return Infinity; } },
    function () {},
    function (thunks) { return Promise.all(thunks.map(function (t) { return t(); })); },
    function (prompt, agentOpts) {
      spawned.push(agentOpts.label);
      return Promise.resolve({ perspective: agentOpts.label.replace('review:', ''),
        verdict: 'pass', findings: [], refutationAttempted: 'stub' });
    }
  ).then(function (result) { return { result: result, logs: logs, spawned: spawned }; });
}

const FULL_FLEET = ['architect', 'security', 'test', 'invariant'];

test('budget.total unset → the panel fires (pre-existing behaviour preserved)', async () => {
  const { result, spawned } = await runWorkflow({
    input: { planPath: 'p.md', fleetKeys: FULL_FLEET, minRemaining: 600000 },
    budget: { total: null, spent: function () { return 0; }, remaining: function () { return 0; } },
  });
  assert.equal(result.skipped, false,
    'an unmetered turn must not be gated — budget.total null means "no target set"');
  assert.equal(spawned.length, 4);
});

test('remaining below minRemaining skips the panel — the branch that could never fire', async () => {
  const { result, logs, spawned } = await runWorkflow({
    input: { planPath: 'p.md', fleetKeys: FULL_FLEET, minRemaining: 600000 },
    budget: { total: 500000, spent: function () { return 400000; }, remaining: function () { return 100000; } },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'budget');
  assert.equal(spawned.length, 0, 'no agent may be spawned once the budget gate trips');
  assert.match(logs.join('\n'), /budget-exhausted/);
  // The measured numbers must travel with the skip. Without them `decide`'s
  // reason says "L2 produced no readable result" and the operator cannot tell a
  // budget stop from a crashed panel.
  assert.equal(result.remaining, 100000, 'the skip must carry the observed remaining');
  assert.equal(result.minRemaining, 600000, 'the skip must carry the threshold it failed');
});

test('remaining at or above minRemaining still fires', async () => {
  const { result, spawned } = await runWorkflow({
    input: { planPath: 'p.md', fleetKeys: FULL_FLEET, minRemaining: 600000 },
    budget: { total: 2000000, spent: function () { return 0; }, remaining: function () { return 600000; } },
  });
  assert.equal(result.skipped, false, 'the comparison is strict — exactly enough is enough');
  assert.equal(spawned.length, 4);
});
