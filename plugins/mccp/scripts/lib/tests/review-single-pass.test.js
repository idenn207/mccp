'use strict';

// review-loop-bypass M1 — the single-pass toggle's oracle surface.
//
// The load-bearing assertion in this file is `block === false` on the quorum
// branch. mk() hardcodes `block: verdict !== 'converged'`, so an implementation
// that reuses it cannot produce that value and this test goes red immediately —
// which is the point. Everything else here fences that one relaxation in: six
// other blocking paths must stay blocked with the toggle on, and in hybrid mode
// the relaxation additionally requires L3 to have actually converged.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseSinglePass, parseRoundCap, effectiveRoundCap, assertSingleRound,
  ENV_SINGLE_PASS, ENV_ROUND_CAP, REASONS,
} = require('../review-single-pass');
const { decideReview } = require('../plan-review/decide');

function withCapturedStderr(fn) {
  const original = process.stderr.write;
  let captured = '';
  process.stderr.write = function (chunk) { captured += String(chunk); return true; };
  try { return { value: fn(), stderr: captured }; }
  finally { process.stderr.write = original; }
}

function captureExit(fn) {
  const original = { err: process.stderr.write, out: process.stdout.write };
  let stderr = '', stdout = '';
  process.stderr.write = function (c) { stderr += String(c); return true; };
  process.stdout.write = function (c) { stdout += String(c); return true; };
  try { return { code: fn(), stderr: stderr, stdout: stdout }; }
  finally { process.stderr.write = original.err; process.stdout.write = original.out; }
}

// ── parseSinglePass ───────────────────────────────────────────────────────────

test('parseSinglePass: unset and empty are silently inactive', () => {
  [{}, { [ENV_SINGLE_PASS]: '' }, { [ENV_SINGLE_PASS]: '   ' }].forEach(function (env) {
    const r = withCapturedStderr(function () { return parseSinglePass(env); });
    assert.deepEqual(r.value, { active: false, reason: null, rejected: null });
    assert.equal(r.stderr, '', 'an unset toggle is the normal state, not an event to warn about');
  });
});

test('parseSinglePass: each of the three reasons activates and is preserved verbatim', () => {
  assert.equal(REASONS.length, 3);
  REASONS.forEach(function (reason) {
    const r = withCapturedStderr(function () {
      return parseSinglePass({ [ENV_SINGLE_PASS]: reason });
    });
    assert.deepEqual(r.value, { active: true, reason: reason, rejected: null });
    assert.equal(r.stderr, '');
  });
});

test('parseSinglePass: surrounding whitespace is trimmed, not rejected', () => {
  const r = parseSinglePass({ [ENV_SINGLE_PASS]: '  scope_too_small\n' });
  assert.equal(r.active, true);
  assert.equal(r.reason, 'scope_too_small');
});

test('parseSinglePass: case mismatch is a typo, not a synonym — inactive + loud', () => {
  // Case-sensitive on purpose: the value is sealed into the receipt, so
  // normalising would let two different inputs fill the same audit field.
  const r = withCapturedStderr(function () {
    return parseSinglePass({ [ENV_SINGLE_PASS]: 'SCOPE_TOO_SMALL' });
  });
  assert.equal(r.value.active, false);
  assert.equal(r.value.reason, null);
  assert.equal(r.value.rejected, 'SCOPE_TOO_SMALL');
  assert.match(r.stderr, /must be one of/);
});

test('parseSinglePass: out-of-enum fails CLOSED and keeps the raw value for audit', () => {
  const r = withCapturedStderr(function () {
    return parseSinglePass({ [ENV_SINGLE_PASS]: 'because_i_said_so' });
  });
  assert.equal(r.value.active, false, 'a typo must never open the gate (UI3)');
  assert.equal(r.value.rejected, 'because_i_said_so');
  assert.match(r.stderr, /Treating the toggle as OFF/);
});

// ── parseRoundCap / effectiveRoundCap ─────────────────────────────────────────

test('parseRoundCap: unset is quiet, bad input is loud — both land on 1', () => {
  const quiet = withCapturedStderr(function () { return parseRoundCap({}); });
  assert.equal(quiet.value, 1);
  assert.equal(quiet.stderr, '');

  [['0', 'below range'], ['4', 'above range'], ['two', 'not a number']].forEach(function (c) {
    const r = withCapturedStderr(function () {
      return parseRoundCap({ [ENV_ROUND_CAP]: c[0] });
    });
    assert.equal(r.value, 1, c[1]);
    assert.match(r.stderr, /must be an integer/, c[1] + ' must warn');
  });
});

test('effectiveRoundCap: toggle off passes the configured cap straight through', () => {
  ['1', '2', '3'].forEach(function (n) {
    const r = effectiveRoundCap({ [ENV_ROUND_CAP]: n });
    assert.deepEqual(r, { cap: Number(n), pinned: false, reason: null, pinnedBy: null, note: null });
  });
});

test('effectiveRoundCap: an active toggle pins the cap to 1 over any MCCP_GATE_ROUND_CAP', () => {
  // PRD Open Question 2 — the toggle is the policy declaration and the cap is a
  // knob underneath it, so the knob does not overturn it.
  const r = effectiveRoundCap({
    [ENV_SINGLE_PASS]: 'deadline_pressure',
    [ENV_ROUND_CAP]: '3',
  });
  assert.deepEqual(r, {
    cap: 1, pinned: true, reason: 'deadline_pressure',
    pinnedBy: 'single-pass',
    note: 'round cap pinned to 1 by MCCP_REVIEW_SINGLE_PASS=deadline_pressure',
  });
});

test('effectiveRoundCap: a REJECTED toggle value does not pin — it is simply off', () => {
  const r = withCapturedStderr(function () {
    return effectiveRoundCap({ [ENV_SINGLE_PASS]: 'nope', [ENV_ROUND_CAP]: '2' });
  });
  assert.deepEqual(r.value, { cap: 2, pinned: false, reason: null, pinnedBy: null, note: null });
});

// ── decideReview relaxation boundary ──────────────────────────────────────────

const ON = { active: true, reason: 'scope_too_small' };

function quorumFailBase(extra) {
  return Object.assign({
    mode: 'multi-agent',
    l1: { verdict: 'converged', violations: [] },
    l2: {
      quorum: { passed: false, responded: 4, required: 3, of: 4, roles: 4,
        reason: '2 of 4 refuted' },
      results: [
        { perspective: 'architect', verdict: 'approve' },
        { perspective: 'security', verdict: 'refute' },
      ],
    },
    dispatchEvidence: ['.claude/state/plan-review/l2.json'],
    reviewedPlanHash: 'sha256:' + 'a'.repeat(64),
    currentPlanHash: 'sha256:' + 'a'.repeat(64),
  }, extra || {});
}

test('THE relaxation: quorum not satisfied + toggle on → block:false, verdict still divergent', () => {
  const d = decideReview(quorumFailBase({ singlePass: ON }));
  assert.equal(d.block, false, 'this is the one line the milestone exists for');
  assert.equal(d.review_verdict, 'divergent', 'the verdict is never laundered into converged');
  assert.equal(d.review_source, 'multi-agent');
  assert.equal(d.single_pass_reason, 'scope_too_small');
  assert.equal(d.forwardCodexVerdict, false, 'multi-agent + codex_verdict would be a contradictory receipt');
  assert.ok(d.review_proof, 'the proof is the precondition of the receipt being written at all');
  assert.equal(d.review_proof.quorum.passed, false, 'the proof reports what happened');
  assert.equal(d.review_proof.verification_verdict, 'divergent');
  assert.equal(d.review_proof.layers.l2, 'divergent');
  assert.equal(d.review_proof.layers.l3, null);
  assert.equal(d.review_proof.reviewed_plan_hash, 'sha256:' + 'a'.repeat(64));
  assert.deepEqual(d.review_proof.dispatch_evidence, ['.claude/state/plan-review/l2.json']);
  assert.match(d.reason, /MCCP_REVIEW_SINGLE_PASS=scope_too_small/);
});

test('toggle off leaves the quorum branch byte-identical to pre-M1', () => {
  const off = decideReview(quorumFailBase());
  assert.equal(off.block, true);
  assert.equal(off.review_verdict, 'divergent');
  assert.equal(off.review_proof, null);
  assert.equal(off.single_pass_reason, undefined,
    'mk() must not gain a null twin — a key present on every decision signals nothing');

  // An inactive-but-supplied object must behave exactly like an absent one.
  const inactive = decideReview(quorumFailBase({ singlePass: { active: false, reason: null } }));
  assert.deepEqual(inactive, off);
});

test('UI7: L1 divergent still HALTs with the toggle on', () => {
  const d = decideReview(quorumFailBase({
    singlePass: ON,
    l1: { verdict: 'divergent', violations: [{ code: 'L1_STALE_HASH', detail: 'x' }] },
  }));
  assert.equal(d.block, true, 'L1 is inviolable — the relaxation sits below its branch');
  assert.equal(d.single_pass_reason, undefined);
});

test('L1 inconclusive still HALTs with the toggle on', () => {
  const d = decideReview(quorumFailBase({ singlePass: ON, l1: { verdict: 'inconclusive' } }));
  assert.equal(d.block, true);
  assert.equal(d.review_verdict, 'unavailable');
});

test('an unreadable L2 still HALTs with the toggle on', () => {
  const d = decideReview(quorumFailBase({ singlePass: ON, l2: null }));
  assert.equal(d.block, true, 'no review happened — that is no-pass, not single-pass');
  assert.equal(d.review_verdict, 'unavailable');
});

test('responded:0 still HALTs with the toggle on', () => {
  const base = quorumFailBase({ singlePass: ON });
  base.l2.quorum.responded = 0;
  const d = decideReview(base);
  assert.equal(d.block, true);
  assert.equal(d.review_verdict, 'unavailable');
});

test('DD13 hash mismatch still HALTs with the toggle on', () => {
  const d = decideReview(quorumFailBase({
    singlePass: ON,
    currentPlanHash: 'sha256:' + 'b'.repeat(64),
  }));
  assert.equal(d.block, true, 'an integrity fact is not a review opinion');
  assert.equal(d.review_verdict, 'unavailable');
});

test('a missing reviewed_plan_hash still HALTs with the toggle on', () => {
  const d = decideReview(quorumFailBase({ singlePass: ON, reviewedPlanHash: null }));
  assert.equal(d.block, true);
  assert.equal(d.review_verdict, 'unavailable');
});

test('hybrid: quorum failure does NOT relax unless L3 actually ran and converged', () => {
  // decide.js's hybrid block only runs on the quorum-PASSED path, so a
  // relaxation placed in the failure branch would never reach its guard. The
  // eligibility test therefore carries the precondition itself. Five L3 states,
  // each asserted separately: DD2's hybrid row must not become unenforceable.
  const l3States = [
    ['absent', null],
    ['invoked:false', { invoked: false, verdict: 'converged' }],
    ['unavailable', { invoked: true, verdict: 'unavailable' }],
    ['skipped', { invoked: true, verdict: 'skipped' }],
    ['divergent', { invoked: true, verdict: 'divergent' }],
  ];
  l3States.forEach(function (c) {
    const d = decideReview(quorumFailBase({ mode: 'hybrid', singlePass: ON, l3: c[1] }));
    assert.equal(d.block, true, 'hybrid + L3 ' + c[0] + ' must stay blocked');
    assert.equal(d.single_pass_reason, undefined,
      'hybrid + L3 ' + c[0] + ' must not be stamped as a bypass');
  });
});

test('hybrid: with a converged L3 the relaxation applies and SEALS the L3 layer', () => {
  const d = decideReview(quorumFailBase({
    mode: 'hybrid', singlePass: ON,
    l3: { invoked: true, verdict: 'converged' },
  }));
  assert.equal(d.block, false);
  assert.equal(d.review_verdict, 'divergent');
  assert.equal(d.review_source, 'hybrid', 'flattening to multi-agent would hide that L3 corroborated');
  assert.equal(d.review_proof.layers.l3, 'converged',
    'schema binds the hybrid reverse-invariant to exactly this field');
  assert.equal(d.forwardCodexVerdict, false);
});

test('codex mode is untouched by the toggle', () => {
  const d = decideReview({ mode: 'codex', singlePass: ON });
  assert.equal(d.review_verdict, null);
  assert.equal(d.single_pass_reason, undefined);
});

// ── assert-single-round ───────────────────────────────────────────────────────

const HASH_A = 'sha256:' + 'a'.repeat(64);
const HASH_B = 'sha256:' + 'b'.repeat(64);

function makeFixture(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-single-pass-'));
  const slug = 'demo';
  fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'state', 'plan-review'), { recursive: true });

  const recordPath = path.join(root, '.claude', 'reviews', 'plan-review-' + slug + '.md');
  const body = ['# Plan Review Panel — ' + slug, ''];
  if (opts.measurement !== undefined) {
    body.push('## Measurement', '', '```json',
      opts.measurementRaw !== undefined
        ? opts.measurementRaw
        : JSON.stringify(opts.measurement, null, 2),
      '```', '');
  } else {
    body.push('(no measurement block)', '');
  }
  fs.writeFileSync(recordPath, body.join('\n'), 'utf8');

  if (opts.log !== undefined) {
    fs.writeFileSync(
      path.join(root, '.claude', 'state', 'plan-review', 'dispatch-log-' + slug + '.jsonl'),
      opts.log.map(function (e) { return JSON.stringify(e); }).join('\n') + (opts.log.length ? '\n' : ''),
      'utf8');
  }
  return { root: root, recordPath: recordPath };
}

const OK_MEASUREMENT = { verdict: 'divergent', halt_stage: null, reviewed_plan_hash: HASH_A };
const entry = function (hash, idx) {
  return { decision: 'demo', round_index: idx, at: '2026-08-18T00:00:00.000Z',
    reviewed_plan_hash: hash };
};

test('assert-single-round: halt_stage null + exactly one entry at round_index 0 → exit 0', () => {
  const f = makeFixture({ measurement: OK_MEASUREMENT, log: [entry(HASH_A, 0)] });
  const r = captureExit(function () { return assertSingleRound(f.recordPath); });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /OK: single L2 dispatch/);
});

test('assert-single-round: a prior entry for a DIFFERENT plan body does not fail the new one', () => {
  // round_index counts entries with the SAME hash. Counting the whole log would
  // hand a fresh body's first dispatch round_index:1 and fail a normal attempt.
  const f = makeFixture({
    measurement: OK_MEASUREMENT,
    log: [entry(HASH_B, 0), entry(HASH_B, 1), entry(HASH_A, 0)],
  });
  const r = captureExit(function () { return assertSingleRound(f.recordPath); });
  assert.equal(r.code, 0, r.stderr);
});

test('assert-single-round: two entries for the same plan body → exit 1 (re-fire detected)', () => {
  const f = makeFixture({
    measurement: OK_MEASUREMENT,
    log: [entry(HASH_A, 0), entry(HASH_A, 1)],
  });
  const r = captureExit(function () { return assertSingleRound(f.recordPath); });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /두 번 이상 심사/);
});

test('assert-single-round: round_index other than 0 → exit 1', () => {
  const f = makeFixture({ measurement: OK_MEASUREMENT, log: [entry(HASH_A, 1)] });
  const r = captureExit(function () { return assertSingleRound(f.recordPath); });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /round_index/);
});

test('assert-single-round: no entry for the current plan body → exit 1', () => {
  const f = makeFixture({ measurement: OK_MEASUREMENT, log: [entry(HASH_B, 0)] });
  const r = captureExit(function () { return assertSingleRound(f.recordPath); });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /0 entries/);
});

test('assert-single-round: a non-null halt_stage → exit 1', () => {
  const f = makeFixture({
    measurement: { halt_stage: '5.2e', reviewed_plan_hash: HASH_A },
    log: [entry(HASH_A, 0)],
  });
  const r = captureExit(function () { return assertSingleRound(f.recordPath); });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /halt_stage/);
});

test('assert-single-round fails CLOSED on every unreadable input', () => {
  // A measurement tool that fails open cannot distinguish "the measurement
  // passed" from "the measurement never happened", which makes the Acceptance
  // criterion it backs vacuous.
  const cases = [
    ['missing record', function () {
      const f = makeFixture({ measurement: OK_MEASUREMENT, log: [entry(HASH_A, 0)] });
      fs.unlinkSync(f.recordPath);
      return f;
    }, /cannot read the review record/],
    ['no Measurement section', function () {
      return makeFixture({ log: [entry(HASH_A, 0)] });
    }, /no "## Measurement" section/],
    ['unparsable Measurement JSON', function () {
      return makeFixture({ measurement: {}, measurementRaw: '{ not json', log: [entry(HASH_A, 0)] });
    }, /parse failed/],
    ['halt_stage key absent', function () {
      return makeFixture({ measurement: { reviewed_plan_hash: HASH_A }, log: [entry(HASH_A, 0)] });
    }, /no `halt_stage` key/],
    ['no reviewed_plan_hash', function () {
      return makeFixture({ measurement: { halt_stage: null }, log: [entry(HASH_A, 0)] });
    }, /reviewed_plan_hash/],
    ['dispatch log absent', function () {
      return makeFixture({ measurement: OK_MEASUREMENT });
    }, /cannot read the dispatch log/],
    ['dispatch log has a corrupt line', function () {
      const f = makeFixture({ measurement: OK_MEASUREMENT, log: [entry(HASH_A, 0)] });
      fs.appendFileSync(path.join(f.root, '.claude', 'state', 'plan-review',
        'dispatch-log-demo.jsonl'), '{oops\n');
      return f;
    }, /unparsable line/],
  ];

  cases.forEach(function (c) {
    const f = c[1]();
    const r = captureExit(function () { return assertSingleRound(f.recordPath); });
    assert.equal(r.code, 1, c[0] + ' must exit 1');
    assert.match(r.stderr, c[2], c[0] + ' must say WHICH input was bad');
  });
});

test('assert-single-round: no path argument → exit 1 with usage', () => {
  const r = captureExit(function () { return assertSingleRound(undefined); });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /usage/);
});

// ── producer ↔ consumer hash agreement ────────────────────────────────────────
//
// Every fixture above supplies both sides of the comparison itself, with the
// same synthetic literal. That proves the COMPARISON is right and says nothing
// about whether the two production sides compute the same value — which is the
// axis that actually broke: the dispatch log was keyed with `markdownHash` while
// the Measurement block carries `planAwareMarkdownHash`.
//
// The two differ only for `.claude/plans/*.plan.md`, and only once a structural
// normalization does something. That is why the mismatch survived review: the
// plan of the day happened to normalize to itself. The scenario below is the
// cheapest thing that separates them — and it is not exotic, it is what happens
// the moment an Acceptance checkbox is ticked between two dispatches.

const { markdownHash, planAwareMarkdownHash } = require('../../receipt/hash');

function planFixture(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-single-pass-hash-'));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  const p = path.join(root, '.claude', 'plans', 'demo.plan.md');
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

const PLAN_BEFORE = '# Plan: demo\n\n## Acceptance\n\n- [ ] the one item\n';
const PLAN_AFTER = '# Plan: demo\n\n## Acceptance\n\n- [x] the one item\n';

test('the raw and plan-aware hashes DIVERGE on a ticked checkbox (the trap is real)', () => {
  const p = planFixture(PLAN_BEFORE);
  const rawBefore = markdownHash(p);
  const structBefore = planAwareMarkdownHash(p);
  fs.writeFileSync(p, PLAN_AFTER, 'utf8');
  const rawAfter = markdownHash(p);
  const structAfter = planAwareMarkdownHash(p);

  assert.notEqual(rawBefore, rawAfter,
    'the raw hash tracks the tick — this is what a log keyed with it would record');
  assert.equal(structBefore, structAfter,
    'the plan axis normalizes the tick away — this is what the Measurement block carries');
});

test('a log keyed with the RAW hash lets a re-fire pass as a single round', () => {
  // The regression itself, spelled out. Two dispatches of a structurally
  // identical body; the R1 entry does not match the Measurement hash, so only
  // R0 is counted and the assertion reports a clean single round.
  const p = planFixture(PLAN_BEFORE);
  const rawR0 = markdownHash(p);
  fs.writeFileSync(p, PLAN_AFTER, 'utf8');
  const rawR1 = markdownHash(p);
  const measured = planAwareMarkdownHash(p);

  const f = makeFixture({
    measurement: { verdict: 'divergent', halt_stage: null, reviewed_plan_hash: measured },
    log: [entry(rawR0, 0), entry(rawR1, 0)],
  });
  const bad = captureExit(function () { return assertSingleRound(f.recordPath); });
  assert.equal(bad.code, 0,
    'this is the FAIL-OPEN being pinned: with raw-hash keying the tool passes ' +
    'two dispatches. If this ever goes non-zero the trap closed some other way ' +
    'and the test below is what still matters.');

  // Keyed the way the fixed command body keys it, the same two dispatches are
  // caught — both entries land in the group the Measurement block names.
  const g = makeFixture({
    measurement: { verdict: 'divergent', halt_stage: null, reviewed_plan_hash: measured },
    log: [entry(measured, 0), entry(measured, 1)],
  });
  const good = captureExit(function () { return assertSingleRound(g.recordPath); });
  assert.equal(good.code, 1, 'plan-aware keying must detect the re-fire');
  assert.match(good.stderr, /two|2 entries|UI5/i);
});

test('receipt cli `hash-plan` is exactly the function the plan axis binds to', () => {
  // The command body reaches the hash through the CLI, so the equivalence has to
  // hold at that surface — not merely in the module the CLI happens to call.
  const { execFileSync } = require('node:child_process');
  const cli = path.join(__dirname, '..', '..', 'receipt', 'cli.js');
  [PLAN_BEFORE, PLAN_AFTER].forEach(function (body) {
    const p = planFixture(body);
    const viaCli = execFileSync(process.execPath, [cli, 'hash-plan', p], { encoding: 'utf8' }).trim();
    assert.equal(viaCli, planAwareMarkdownHash(p),
      'hash-plan must equal planAwareMarkdownHash — plan-review/cli.js seals that ' +
      'value into l2.json and record.js copies it into the Measurement block');
  });
});
