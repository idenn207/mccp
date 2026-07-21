'use strict';

// workflow-orchestration M3 Task 2 validate — aggregate verify oracle.
// focus assembly / mode parse / verdict derivation / block matrix
// (converged→pass · divergent→HALT · critical→HALT · unavailable×mode · skipped).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseMergedVerifyMode, buildVerifyFocus, deriveVerdictFromCodex, decideMergedVerify,
  MERGED_VERIFY_MODES, VERDICTS,
} = require('../verify');

// ── parseMergedVerifyMode ─────────────────────────────────────────────────────

test('mode default (unset) → enforce (fail-closed)', function () {
  assert.equal(parseMergedVerifyMode({}), 'enforce');
  assert.equal(parseMergedVerifyMode({ MCCP_WORK_MERGED_VERIFY: '' }), 'enforce');
});

test('mode accepts off/warn/enforce case-insensitively', function () {
  assert.equal(parseMergedVerifyMode({ MCCP_WORK_MERGED_VERIFY: 'off' }), 'off');
  assert.equal(parseMergedVerifyMode({ MCCP_WORK_MERGED_VERIFY: ' WARN ' }), 'warn');
  assert.equal(parseMergedVerifyMode({ MCCP_WORK_MERGED_VERIFY: 'Enforce' }), 'enforce');
});

test('mode typo → enforce (loud fail-closed, no silent disable)', function () {
  assert.equal(parseMergedVerifyMode({ MCCP_WORK_MERGED_VERIFY: 'yolo' }), 'enforce');
});

// ── buildVerifyFocus ──────────────────────────────────────────────────────────

test('buildVerifyFocus assembles cross-cut focus with changed files', function () {
  const focus = buildVerifyFocus({
    changedFiles: ['a/x.js', 'b\\y.js'],
    partitions: [{ files: ['a/x.js'] }, { files: ['b/y.js'] }],
    base: 'origin/main',
  });
  assert.match(focus, /Aggregate merged-diff adversarial verify/);
  assert.match(focus, /base origin\/main/);
  assert.match(focus, /2 disjoint partitions/);
  assert.match(focus, /a\/x\.js/);
  assert.match(focus, /b\/y\.js/); // backslash normalized
  assert.match(focus, /import-graph breakage/);
});

test('buildVerifyFocus robust to empty input (single-worker, no findings)', function () {
  const focus = buildVerifyFocus({});
  assert.match(focus, /single worker/);
  assert.match(focus, /base HEAD/);
  assert.equal(typeof focus, 'string');
  assert.ok(focus.length > 0);
});

test('buildVerifyFocus caps long file lists', function () {
  const many = Array.from({ length: 80 }, function (_, i) { return 'f' + i + '.js'; });
  const focus = buildVerifyFocus({ changedFiles: many });
  assert.match(focus, /\+20 more/);
});

// ── deriveVerdictFromCodex ────────────────────────────────────────────────────

test('deriveVerdictFromCodex: classification disabled → skipped', function () {
  assert.equal(deriveVerdictFromCodex({ classification: 'disabled' }), 'skipped');
});

test('deriveVerdictFromCodex: non-ok classification → unavailable', function () {
  assert.equal(deriveVerdictFromCodex({ classification: 'timeout' }), 'unavailable');
  assert.equal(deriveVerdictFromCodex({ classification: 'ok', blocking: true }), 'unavailable');
});

test('deriveVerdictFromCodex: null/garbage → unavailable (fail-closed)', function () {
  assert.equal(deriveVerdictFromCodex(null), 'unavailable');
  assert.equal(deriveVerdictFromCodex(42), 'unavailable');
});

test('deriveVerdictFromCodex: CRITICAL category in stdout → critical', function () {
  const j = { classification: 'ok', stdout: 'This migration causes irreversible data loss via drop table.' };
  assert.equal(deriveVerdictFromCodex(j), 'critical');
});

// v1.22.3 M3 follow-up (F5, 4th gate) — these fixtures now mirror the REAL
// producer. codex-invoke's ok-path envelope carries the review as JSON TEXT inside
// `.stdout`, with the model payload under `.result` (codex-companion render.mjs).
// The previous fixtures were bare prose ('Verdict: converged. Ship-safe.'), a shape
// the producer never emits — so the suite proved the free-text scan worked on input
// that does not exist while production fed it a JSON blob and got 'converged' for a
// "No ship" review.
function verifyEnvelope(review) {
  return {
    classification: 'ok', blocking: false,
    stdout: JSON.stringify({ review: 'Adversarial Review', threadId: 't', result: review }),
  };
}

test('deriveVerdictFromCodex: structured approve → converged; needs-attention → divergent', function () {
  assert.equal(deriveVerdictFromCodex(verifyEnvelope({
    verdict: 'approve', summary: 'Ship-safe.', findings: [],
  })), 'converged');
  assert.equal(deriveVerdictFromCodex(verifyEnvelope({
    verdict: 'needs-attention', summary: 'No ship: API drift.', findings: [{ severity: 'high' }],
  })), 'divergent');
});

// THE MEASURED REGRESSION for this gate. Before the structured read, merged-verify
// (MCCP_WORK_MERGED_VERIFY defaults to enforce) returned 'converged' for this exact
// payload — passing a "No ship" review straight through to commit.
test('deriveVerdictFromCodex: "converged" in a finding body does NOT approve a No-ship review', function () {
  const env = verifyEnvelope({
    verdict: 'needs-attention',
    summary: 'No ship: the plan still has concrete accounting holes.',
    findings: [{
      severity: 'medium', title: 'sealed verdict overwritten',
      body: 'finalize-receipt.js explicitly calls stamping `converged` for a "No ship" review an integrity bug.',
    }],
  });
  assert.equal(deriveVerdictFromCodex(env), 'divergent',
    'the structured verdict must win over a keyword sitting in someone prose');
});

test('deriveVerdictFromCodex: unreadable stdout can never certify approval (fail-closed)', function () {
  // Free-text fallback may raise a divergence, never approve (R1 F3).
  assert.equal(deriveVerdictFromCodex({ classification: 'ok', stdout: 'Verdict: converged. Ship-safe.' }),
    'unavailable', 'a non-producer blob is not evidence of approval');
  assert.equal(deriveVerdictFromCodex({ classification: 'ok', stdout: 'Verdict: divergent — API drift.' }),
    'divergent', 'suspicion is still cheap to raise');
});

// ── decideMergedVerify — block matrix ─────────────────────────────────────────

test('converged → pass', function () {
  const d = decideMergedVerify({ verdict: 'converged', mode: 'enforce' });
  assert.equal(d.verdict, 'converged');
  assert.equal(d.block, false);
  assert.equal(d.rounds, 1);
});

test('divergent → HALT (block) in every non-off mode', function () {
  assert.equal(decideMergedVerify({ verdict: 'divergent', mode: 'enforce' }).block, true);
  assert.equal(decideMergedVerify({ verdict: 'divergent', mode: 'warn' }).block, true);
});

test('critical → HALT (block)', function () {
  const d = decideMergedVerify({ verdict: 'critical', mode: 'enforce' });
  assert.equal(d.verdict, 'critical');
  assert.equal(d.block, true);
});

test('unavailable × enforce → HALT; × warn → pass; × off → skipped', function () {
  assert.equal(decideMergedVerify({ verdict: 'unavailable', mode: 'enforce' }).block, true);
  const warn = decideMergedVerify({ verdict: 'unavailable', mode: 'warn' });
  assert.equal(warn.block, false);
  assert.equal(warn.verdict, 'unavailable');
  // mode=off short-circuits to skipped regardless of the incoming verdict
  const off = decideMergedVerify({ verdict: 'unavailable', mode: 'off' });
  assert.equal(off.verdict, 'skipped');
  assert.equal(off.block, false);
});

test('skipped → pass, rounds 0', function () {
  const d = decideMergedVerify({ verdict: 'skipped', mode: 'enforce' });
  assert.equal(d.block, false);
  assert.equal(d.rounds, 0);
});

test('mode=off short-circuits to skipped before any codex read', function () {
  const d = decideMergedVerify({ codexJson: { classification: 'ok', stdout: 'divergent' }, mode: 'off' });
  assert.equal(d.verdict, 'skipped');
  assert.equal(d.block, false);
});

test('decideMergedVerify derives verdict from codexJson when no explicit verdict', function () {
  // Producer-shaped envelope (F5): the review lives as JSON text under .stdout.
  // The old fixture was the bare word 'converged', which the producer never emits.
  const d = decideMergedVerify({
    codexJson: verifyEnvelope({ verdict: 'approve', summary: 'Ship-safe.', findings: [] }),
    mode: 'enforce',
  });
  assert.equal(d.verdict, 'converged');
  assert.equal(d.block, false);
});

test('decideMergedVerify honors explicit rounds', function () {
  const d = decideMergedVerify({ verdict: 'converged', mode: 'enforce', rounds: 2 });
  assert.equal(d.rounds, 2);
});

test('enum surfaces are frozen and complete', function () {
  assert.deepEqual(MERGED_VERIFY_MODES.slice().sort(), ['enforce', 'off', 'warn']);
  assert.deepEqual(VERDICTS.slice().sort(),
    ['converged', 'critical', 'divergent', 'skipped', 'unavailable']);
});
