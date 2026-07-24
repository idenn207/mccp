'use strict';

// codex-review-payload tests (v1.22.3 M3 follow-up, F5).
//
// Fixture strategy: envelopes are built the way codex-invoke.js really emits them
// (review JSON as TEXT inside `.stdout`, model payload under `.result`) — mirror
// of codex-runner.test.js#stubCodexEnvelope. Encoding our own assumptions here
// instead of the producer's contract is the exact bug this module closes.

const test = require('node:test');
const assert = require('node:assert');

const {
  parseReviewPayload,
  verdictToGate,
  deriveGateVerdict,
} = require('../codex-review-payload');
const { parseVerdict } = require('../codex-bridge');

function envelope(review) {
  return {
    ok: true, classification: 'ok', blocking: false, advisory: false,
    durationMs: 1, stderr: '',
    stdout: JSON.stringify({ review: 'Adversarial Review', threadId: 't', result: review }),
  };
}

// ---- parseReviewPayload ----------------------------------------------------

test('parseReviewPayload: reads .result.verdict out of the envelope stdout TEXT', () => {
  const r = parseReviewPayload(envelope({
    verdict: 'needs-attention', summary: 'No ship: x', findings: [{ severity: 'high' }],
  }));
  assert.strictEqual(r.verdict, 'needs-attention');
  assert.strictEqual(r.summary, 'No ship: x');
  assert.strictEqual(r.findings.length, 1);
});

test('parseReviewPayload: tolerates a bare payload (no .result wrapper)', () => {
  const r = parseReviewPayload({ stdout: JSON.stringify({ verdict: 'approve', summary: 's', findings: [] }) });
  assert.strictEqual(r.verdict, 'approve');
});

test('parseReviewPayload: envelope-level fields are NOT a review (the M3 bug)', () => {
  // An envelope carrying summary/findings on ITSELF, with no readable stdout,
  // must NOT parse — reading the envelope was precisely the blindness.
  assert.strictEqual(parseReviewPayload({ summary: 'x', findings: [{}], stdout: '' }), null);
});

test('parseReviewPayload: unreadable stdout → null (fail-closed signal)', () => {
  assert.strictEqual(parseReviewPayload({ stdout: 'not-json-at-all' }), null);
  assert.strictEqual(parseReviewPayload({}), null);
  assert.strictEqual(parseReviewPayload(null), null);
});

test('parseReviewPayload: missing/blank verdict → null', () => {
  assert.strictEqual(parseReviewPayload(envelope({ summary: 's', findings: [] })), null);
  assert.strictEqual(parseReviewPayload(envelope({ verdict: '   ', summary: 's', findings: [] })), null);
});

// ---- verdictToGate ---------------------------------------------------------

test('verdictToGate: approve → converged; needs-attention → divergent', () => {
  assert.strictEqual(verdictToGate('approve'), 'converged');
  assert.strictEqual(verdictToGate('APPROVE'), 'converged');
  assert.strictEqual(verdictToGate('needs-attention'), 'divergent');
});

test('verdictToGate: unknown verdict → divergent (fail-closed, never converged)', () => {
  assert.strictEqual(verdictToGate('some-new-verdict'), 'divergent');
});

test('verdictToGate: null/blank → unavailable', () => {
  assert.strictEqual(verdictToGate(null), 'unavailable');
  assert.strictEqual(verdictToGate(undefined), 'unavailable');
  assert.strictEqual(verdictToGate('  '), 'unavailable');
});

// ---- deriveGateVerdict: precedence ----------------------------------------

// THE MEASURED REGRESSION. This is this cycle's real Plan-Codex R1: verdict
// 'needs-attention', "No ship" summary, and a finding whose body warns that
// stamping `converged` would be an integrity bug. codex-bridge.parseVerdict
// matched the word `converged` inside that WARNING and returned 'converged'.
// Two such false stamps (plan + implement) make cross-gate dedupe skip PR-Codex
// entirely — dual review bypassed. Structured must win.
const MEASURED_R1 = {
  verdict: 'needs-attention',
  summary: 'No ship: the plan still has concrete F2 accounting holes.',
  findings: [{
    severity: 'medium',
    title: 'scope-excluded mapping corrupts the sealed raw verdict',
    body: 'finalize-receipt.js explicitly calls stamping `converged` for a "No ship" review an integrity bug.',
    file: 'plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js',
    line_start: 129, line_end: 129, recommendation: 'persist meta.codex_raw_verdict',
  }],
};

test('F5 REGRESSION: prose containing "converged" in a needs-attention review → divergent', () => {
  const prose = JSON.stringify(MEASURED_R1);
  // Document the bug this test guards: the free-text scan really does say converged.
  assert.strictEqual(parseVerdict(prose), 'converged',
    'precondition: the free-text scan mis-reads this payload (that is the bug)');

  const g = deriveGateVerdict({ envelope: envelope(MEASURED_R1), freeText: prose });
  assert.strictEqual(g.verdict, 'divergent', 'structured verdict must win over the prose keyword');
  assert.strictEqual(g.source, 'structured');
  assert.strictEqual(g.rawVerdict, 'needs-attention');
});

test('F5: approve whose prose mentions "divergent" → converged (structured wins both ways)', () => {
  const review = {
    verdict: 'approve',
    summary: 'Ship it. No divergent opinions remain.',
    findings: [],
  };
  const g = deriveGateVerdict({ envelope: envelope(review), freeText: JSON.stringify(review) });
  assert.strictEqual(g.verdict, 'converged');
  assert.strictEqual(g.source, 'structured');
});

// Implement-Codex R1 F3 — the fallback may RAISE suspicion, never CERTIFY.
//
// This test previously asserted that free-text 'converged' produced a converged
// gate verdict (source-tagged as 'free-text'). That kept the very bug this module
// exists to kill alive under schema drift: the scan cannot tell an approval from
// the word `approve` sitting in someone's prose, and cross-gate dedupe keys on
// that value to skip PR-Codex. Approval now requires a STRUCTURED read.
test('F5/R1-F3: free-text "converged" can NEVER certify approval → unavailable', () => {
  const g = deriveGateVerdict({ envelope: { stdout: 'not-json' }, freeText: 'Round 1: converged, all good' });
  assert.strictEqual(g.verdict, 'unavailable',
    'a keyword scan is not entitled to certify approval');
  assert.notStrictEqual(g.verdict, 'converged');
});

test('F5/R1-F3: free-text CAN still raise a divergence (suspicion is cheap, approval is not)', () => {
  const g = deriveGateVerdict({ envelope: { stdout: 'not-json' }, freeText: 'DIVERGENT_UNRESOLVED: still broken' });
  assert.strictEqual(g.verdict, 'divergent');
  assert.strictEqual(g.source, 'free-text', 'a fallback must never claim to be an authoritative read');
  assert.strictEqual(g.rawVerdict, null);
});

test('F5: neither structured nor free-text → unavailable (fail-closed)', () => {
  const g = deriveGateVerdict({ envelope: { stdout: 'not-json' }, freeText: '' });
  assert.strictEqual(g.verdict, 'unavailable');
  assert.strictEqual(g.source, 'unavailable');
});

test('F5: free-text that parseVerdict cannot classify stays unavailable, not converged', () => {
  const g = deriveGateVerdict({ envelope: null, freeText: 'some text with no verdict keyword' });
  assert.strictEqual(g.verdict, 'unavailable');
});

test('F5: injected parseVerdict is used for the fallback (precedence is testable in isolation)', () => {
  let called = 0;
  const g = deriveGateVerdict({
    envelope: { stdout: 'not-json' },
    freeText: 'anything',
    parseVerdict: function () { called++; return 'divergent'; },
  });
  assert.strictEqual(called, 1);
  assert.strictEqual(g.verdict, 'divergent');
  assert.strictEqual(g.source, 'free-text');
});

test('F5: a structured read never calls the free-text scan at all', () => {
  let called = 0;
  const g = deriveGateVerdict({
    envelope: envelope({ verdict: 'approve', summary: 's', findings: [] }),
    freeText: 'divergent divergent divergent',
    parseVerdict: function () { called++; return 'divergent'; },
  });
  assert.strictEqual(called, 0, 'structured short-circuits — the scan must not even run');
  assert.strictEqual(g.verdict, 'converged');
});

// ---- Task 3 (M2, verify-and-close): full real-producer envelope regression ---
//
// The backlog (2026-07-22) flagged parseReviewPayload as failing to read a NORMAL
// response. Re-measured this cycle: the current reader (.stdout -> .result.verdict)
// parses it correctly and M1 proved source:structured live — so this is a
// fixture-only close (NO code change). These fixtures pin the FULL codex-companion
// adversarial-review envelope shape (result under .result, with sibling
// rawOutput/parseError/context/codex the reader must ignore) so a future schema
// drift that silently breaks structured parsing is caught as a regression —
// "passed != checked".

function realProducerEnvelope(result) {
  const inner = {
    review: 'Adversarial Review',
    target: 'implement-time decisions',
    threadId: 'thread_abc123',
    context: { round: 1, focus: 'challenge decisions' },
    codex: { model: 'gpt-5.4', durationMs: 42000 },
    result: result,
    rawOutput: 'Verdict: ' + (result.verdict || '?') + '\n' + (result.summary || ''),
    parseError: null,
  };
  return {
    ok: true, classification: 'ok', blocking: false, advisory: false,
    durationMs: 42000, stderr: '',
    stdout: JSON.stringify(inner),
  };
}

test('Task 3: real-producer envelope (approve) → source:structured + converged', () => {
  const env = realProducerEnvelope({
    verdict: 'approve', summary: 'Ship it — no blocking findings.',
    findings: [], next_steps: ['merge'],
  });
  const review = parseReviewPayload(env);
  assert.ok(review, 'parseReviewPayload reads the nested .result.verdict');
  assert.strictEqual(review.verdict, 'approve');

  const g = deriveGateVerdict({ envelope: env, freeText: env.stdout });
  assert.strictEqual(g.source, 'structured', 'the structured .result.verdict is authoritative');
  assert.strictEqual(g.verdict, 'converged');
  assert.strictEqual(g.rawVerdict, 'approve');
});

test('Task 3: real-producer envelope (needs-attention) → source:structured + divergent', () => {
  const env = realProducerEnvelope({
    verdict: 'needs-attention', summary: 'No ship: unresolved F2.',
    findings: [{ severity: 'high', title: 'x' }], next_steps: ['fix F2'],
  });
  const g = deriveGateVerdict({ envelope: env, freeText: env.stdout });
  assert.strictEqual(g.source, 'structured');
  assert.strictEqual(g.verdict, 'divergent');
  assert.strictEqual(g.rawVerdict, 'needs-attention');
});

test('Task 3: producer envelope with malformed/truncated stdout → unavailable (fail-closed)', () => {
  // Schema drift / truncated stdout must NEVER certify approval.
  const env = { ok: true, classification: 'ok', blocking: false, stdout: '{"review":"x","result":{trunc' };
  assert.strictEqual(parseReviewPayload(env), null);
  const g = deriveGateVerdict({ envelope: env, freeText: '' });
  assert.strictEqual(g.verdict, 'unavailable');
  assert.strictEqual(g.source, 'unavailable');
});

test('Task 3: producer envelope whose .result has NO verdict → unavailable (fail-closed)', () => {
  const env = realProducerEnvelope({ summary: 'no verdict here', findings: [] });
  assert.strictEqual(parseReviewPayload(env), null, 'missing verdict → null (fail-closed)');
  const g = deriveGateVerdict({ envelope: env, freeText: '' });
  assert.strictEqual(g.verdict, 'unavailable');
});
