'use strict';

// diverse-agent-review M1 Task 5 — L2 quorum oracle.
//
// Covers the M (responses) and K (distinct roles) axes independently, the
// fail-closed treatment of blocking findings / explicit fail verdicts /
// malformed responses / unknown severities, and the env parsers including the
// loud-warn fallbacks (a quorum must never be loosened silently by a typo).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideQuorum,
  parseQuorum,
  parseRolesMin,
  DEFAULT_REQUIRED,
  DEFAULT_OF,
  DEFAULT_ROLES_MIN,
} = require('../plan-review/quorum');

function pass(perspective, findings) {
  return {
    perspective: perspective,
    verdict: 'pass',
    findings: findings || [],
    refutationAttempted: 'attacked X, Y',
  };
}

function fail(perspective, findings) {
  return {
    perspective: perspective,
    verdict: 'fail',
    findings: findings || [],
    refutationAttempted: 'attacked X and it broke',
  };
}

const FULL_PANEL = ['architect', 'security', 'test', 'invariant'];

// Capture stderr so warn-path assertions are possible without noise.
function captureWarns(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = function (chunk) { lines.push(String(chunk)); return true; };
  try { return { value: fn(), warns: lines.join('') }; } finally { process.stderr.write = orig; }
}

// ── happy path ────────────────────────────────────────────────────────────────

test('full panel of clean passes satisfies the quorum', () => {
  const panel = FULL_PANEL.map(function (p) { return pass(p); });
  const d = decideQuorum({ results: panel, required: 3, of: 4, rolesMin: 3 });
  assert.equal(d.passed, true, d.reason);
  assert.equal(d.responded, 4);
  assert.equal(d.roles, 4);
  assert.deepEqual(d.blockingFindings, []);
});

test('exactly meeting M and K passes', () => {
  const d = decideQuorum({
    results: [pass('architect'), pass('security'), pass('test')],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, true, d.reason);
});

test('LOW and MEDIUM findings do not block', () => {
  const d = decideQuorum({
    results: [
      pass('architect', [{ claim: 'nit', evidence: 'a.js:1', severity: 'LOW' }]),
      pass('security', [{ claim: 'meh', evidence: 'b.js:2', severity: 'MEDIUM' }]),
      pass('test'), pass('invariant'),
    ],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, true, d.reason);
});

// ── M axis: response count ────────────────────────────────────────────────────

test('too few responses fails the quorum', () => {
  const d = decideQuorum({
    results: [pass('architect'), pass('security')], required: 3, of: 4, rolesMin: 2,
  });
  assert.equal(d.passed, false);
  assert.match(d.reason, /only 2 of 3 required responses/);
});

test('no responses at all fails (never a vacuous pass)', () => {
  const d = decideQuorum({ results: [], required: 3, of: 4, rolesMin: 3 });
  assert.equal(d.passed, false);
  assert.equal(d.responded, 0);
});

test('missing results argument fails closed', () => {
  assert.equal(decideQuorum({}).passed, false);
  assert.equal(decideQuorum().passed, false);
});

// ── K axis: role diversity ────────────────────────────────────────────────────

test('K: one role answering three times satisfies M but not K', () => {
  const d = decideQuorum({
    results: [pass('architect'), pass('architect'), pass('architect')],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.responded, 3, 'duplicates still count as responses');
  assert.equal(d.roles, 1, 'but contribute no diversity');
  assert.equal(d.passed, false);
  assert.match(d.reason, /only 1 distinct role/);
});

test('K: two distinct roles cannot satisfy rolesMin=3', () => {
  const d = decideQuorum({
    results: [pass('architect'), pass('security'), pass('security')],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, false);
  assert.match(d.reason, /distinct role/);
});

// ── blocking findings ─────────────────────────────────────────────────────────

test('a single HIGH finding sinks an otherwise unanimous panel', () => {
  const d = decideQuorum({
    results: [
      pass('architect', [{ claim: 'gate opens', evidence: 'x.js:9', severity: 'HIGH' }]),
      pass('security'), pass('test'), pass('invariant'),
    ],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, false);
  assert.equal(d.blockingFindings.length, 1);
  assert.equal(d.blockingFindings[0].severity, 'HIGH');
});

test('a CRITICAL finding blocks', () => {
  const d = decideQuorum({
    results: [pass('architect', [{ claim: 'c', evidence: 'e', severity: 'CRITICAL' }]),
      pass('security'), pass('test'), pass('invariant')],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, false);
});

test('an explicit fail verdict blocks even with no findings listed', () => {
  const d = decideQuorum({
    results: [fail('invariant'), pass('architect'), pass('security'), pass('test')],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, false);
  assert.ok(d.blockingFindings.some(function (b) { return b.severity === 'FAIL'; }));
});

test('unknown severity is treated as blocking (unreadable weight is not discardable)', () => {
  const d = decideQuorum({
    results: [pass('architect', [{ claim: 'x', evidence: 'y', severity: 'SPICY' }]),
      pass('security'), pass('test'), pass('invariant')],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, false);
  assert.equal(d.blockingFindings[0].severity, 'UNKNOWN');
});

test('lowercase severities normalize', () => {
  const d = decideQuorum({
    results: [pass('architect', [{ claim: 'x', evidence: 'y', severity: 'high' }]),
      pass('security'), pass('test'), pass('invariant')],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.passed, false);
  assert.equal(d.blockingFindings[0].severity, 'HIGH');
});

test('custom blockSeverity can widen what blocks', () => {
  const d = decideQuorum({
    results: [pass('architect', [{ claim: 'x', evidence: 'y', severity: 'MEDIUM' }]),
      pass('security'), pass('test'), pass('invariant')],
    required: 3, of: 4, rolesMin: 3, blockSeverity: ['MEDIUM', 'HIGH', 'CRITICAL'],
  });
  assert.equal(d.passed, false);
});

// ── malformed responses are non-responses, never passes ───────────────────────

test('null/undefined entries are absent, not passes', () => {
  const d = decideQuorum({
    results: [pass('architect'), null, undefined, pass('security')],
    required: 3, of: 4, rolesMin: 2,
  });
  assert.equal(d.responded, 2);
  assert.equal(d.malformed, 0, 'null is absence, not malformation');
  assert.equal(d.passed, false);
});

test('malformed shapes are counted and excluded from responses', () => {
  const d = decideQuorum({
    results: [
      pass('architect'),
      'I think it looks fine',                    // prose
      { perspective: 'security' },                // no verdict
      { perspective: 'test', verdict: 'maybe' },  // bad verdict
      { verdict: 'pass' },                        // no perspective
      { perspective: 'invariant', verdict: 'pass', findings: 'nope' }, // bad findings
    ],
    required: 3, of: 4, rolesMin: 3,
  });
  assert.equal(d.responded, 1);
  assert.equal(d.malformed, 5);
  assert.equal(d.passed, false);
  assert.match(d.reason, /malformed\/unusable/);
});

// ── parseQuorum ───────────────────────────────────────────────────────────────

test('parseQuorum: unset → default', () => {
  assert.deepEqual(parseQuorum({}), { required: DEFAULT_REQUIRED, of: DEFAULT_OF });
  assert.deepEqual(parseQuorum(), { required: DEFAULT_REQUIRED, of: DEFAULT_OF });
  assert.deepEqual(parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: '' }),
    { required: DEFAULT_REQUIRED, of: DEFAULT_OF });
});

test('parseQuorum: valid MofN parses, whitespace and case tolerated', () => {
  assert.deepEqual(parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: '2of3' }), { required: 2, of: 3 });
  assert.deepEqual(parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: ' 4OF4 ' }), { required: 4, of: 4 });
  assert.deepEqual(parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: '3 of 4' }), { required: 3, of: 4 });
});

test('parseQuorum: garbage falls back to default WITH a loud warn', () => {
  const r = captureWarns(function () {
    return parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: 'three-of-four' });
  });
  assert.deepEqual(r.value, { required: DEFAULT_REQUIRED, of: DEFAULT_OF });
  assert.match(r.warns, /unknown MCCP_PLAN_REVIEW_QUORUM/);
});

test('parseQuorum: a quorum of 1 is rejected (single judge, panel vocabulary)', () => {
  const r = captureWarns(function () {
    return parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: '1of4' });
  });
  assert.deepEqual(r.value, { required: DEFAULT_REQUIRED, of: DEFAULT_OF });
  assert.match(r.warns, /single judge/);
});

test('parseQuorum: of beyond the fleet ceiling is rejected', () => {
  const r = captureWarns(function () {
    return parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: '3of9' });
  });
  assert.deepEqual(r.value, { required: DEFAULT_REQUIRED, of: DEFAULT_OF });
  assert.match(r.warns, /at most/);
});

test('parseQuorum: unsatisfiable (of < required) is rejected', () => {
  const r = captureWarns(function () {
    return parseQuorum({ MCCP_PLAN_REVIEW_QUORUM: '4of2' });
  });
  assert.deepEqual(r.value, { required: DEFAULT_REQUIRED, of: DEFAULT_OF });
  assert.match(r.warns, /unsatisfiable/);
});

// ── parseRolesMin ─────────────────────────────────────────────────────────────

test('parseRolesMin: unset → default', () => {
  assert.equal(parseRolesMin({}), DEFAULT_ROLES_MIN);
  assert.equal(parseRolesMin(), DEFAULT_ROLES_MIN);
});

test('parseRolesMin: valid integer parses', () => {
  assert.equal(parseRolesMin({ MCCP_PLAN_REVIEW_ROLES_MIN: '2' }), 2);
  assert.equal(parseRolesMin({ MCCP_PLAN_REVIEW_ROLES_MIN: '4' }), 4);
});

test('parseRolesMin: out-of-range or garbage falls back with a warn', () => {
  ['0', '-1', '9', 'three', '2.5'].forEach(function (raw) {
    const r = captureWarns(function () {
      return parseRolesMin({ MCCP_PLAN_REVIEW_ROLES_MIN: raw });
    });
    assert.equal(r.value, DEFAULT_ROLES_MIN, raw);
    assert.match(r.warns, /unknown MCCP_PLAN_REVIEW_ROLES_MIN/, raw);
  });
});

// K > N is not a strict quorum, it is an unsatisfiable one: no run can field more
// distinct lenses than reviewers. parseQuorum already refuses `of < required`;
// this is the missing symmetric check on the K axis, and without it the gate
// blocks every plan while naming roles instead of the misconfiguration.
test('parseRolesMin: clamped to the panel size, with a warn', () => {
  const r = captureWarns(function () {
    return parseRolesMin({ MCCP_PLAN_REVIEW_ROLES_MIN: '4' }, 2);
  });
  assert.equal(r.value, 2);
  assert.match(r.warns, /unsatisfiable/);

  // The DEFAULT is clamped too — a two-reviewer panel cannot field three lenses.
  const d = captureWarns(function () { return parseRolesMin({}, 2); });
  assert.equal(d.value, 2);
});

test('parseRolesMin: a satisfiable value passes through untouched', () => {
  const r = captureWarns(function () {
    return parseRolesMin({ MCCP_PLAN_REVIEW_ROLES_MIN: '2' }, 4);
  });
  assert.equal(r.value, 2);
  assert.equal(r.warns, '', 'no warn when the demand is reachable');
  assert.equal(parseRolesMin({}, 4), DEFAULT_ROLES_MIN);
  assert.equal(parseRolesMin({}), DEFAULT_ROLES_MIN, 'omitted `of` keeps the old contract');
});
