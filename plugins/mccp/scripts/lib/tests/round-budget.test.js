'use strict';

// v0.2.9 Task 8 — Round budget policy oracle test.
//
// The severity-gated re-rerun policy still lives in command-body markdown
// (plan.md Phase 5.4, prp-implement.md Phase 2.5.4, pr.md Phase 2.5.4), and
// `decide` below remains the test-local encoding of that decision tree.
//
// **The cap parser is no longer test-local.** This file's header used to
// announce that "a future helper extraction has a behavioural specification to
// match"; review-loop-bypass M1 performed that extraction, so the local
// `parseCap` has been replaced by the production oracle. Keeping a private copy
// after the real one exists is how two implementations drift apart with nothing
// to notice — the very failure this file was written to pre-empt.

const test = require('node:test');
const assert = require('node:assert');

const { parseRoundCap } = require('../review-single-pass');

const SEVERITY = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

// Run `fn` with stderr captured, so a test can assert on the loud-warn contract
// without printing it into the runner's output.
function withCapturedStderr(fn) {
  const original = process.stderr.write;
  let captured = '';
  process.stderr.write = function (chunk) { captured += String(chunk); return true; };
  try { return { value: fn(), stderr: captured }; }
  finally { process.stderr.write = original; }
}

// Pure policy oracle. Given the YAGNI-triaged findings at the end of round
// `round`, the env-derived cap, and whether the next escalate target severity
// is unresolved by the round's absorption, decide:
//   - 'STOP_CONVERGED'         — no escalate target found, stop at R1.
//   - 'ESCALATE_NEXT_ROUND'    — at least one ACCEPT_NOW HIGH/CRITICAL is
//                                unresolved AND round < cap.
//   - 'DIVERGENT_UNRESOLVED'   — escalate would be required but cap reached.
function decide({ findings, round, cap, anyAbsorptionFailure }) {
  const targets = findings.filter(function (f) {
    return f.verdict === 'ACCEPT_NOW' &&
      (f.severity === 'CRITICAL' || f.severity === 'HIGH');
  });
  if (targets.length === 0) return 'STOP_CONVERGED';
  if (!anyAbsorptionFailure) return 'STOP_CONVERGED';
  if (round < cap) return 'ESCALATE_NEXT_ROUND';
  return 'DIVERGENT_UNRESOLVED';
}

test('cap=1 + no ACCEPT_NOW HIGH/CRITICAL → stop at R1 (no escalate)', () => {
  const cap = parseRoundCap({}); // env unset → default 1
  const findings = [
    { id: 'F1', severity: 'MEDIUM', verdict: 'ACCEPT_NOW' },
    { id: 'F2', severity: 'LOW', verdict: 'DEFER_TO_BACKLOG' },
    { id: 'F3', severity: 'HIGH', verdict: 'REJECT_YAGNI' },
  ];
  const verdict = decide({ findings, round: 1, cap, anyAbsorptionFailure: false });
  assert.strictEqual(cap, 1);
  assert.strictEqual(verdict, 'STOP_CONVERGED');
});

test('cap=1 + unresolved ACCEPT_NOW HIGH → escalate would trigger but cap reached → DIVERGENT', () => {
  const cap = parseRoundCap({}); // default 1
  const findings = [
    { id: 'F1', severity: 'HIGH', verdict: 'ACCEPT_NOW' },
    { id: 'F2', severity: 'LOW', verdict: 'REJECT_YAGNI' },
  ];
  const verdict = decide({ findings, round: 1, cap, anyAbsorptionFailure: true });
  assert.strictEqual(cap, 1);
  assert.strictEqual(verdict, 'DIVERGENT_UNRESOLVED');
});

test('cap=3 + persistent divergence across R1/R2/R3 → DIVERGENT_UNRESOLVED at R3', () => {
  const cap = parseRoundCap({ MCCP_GATE_ROUND_CAP: '3' });
  const findings = [
    { id: 'F1', severity: 'CRITICAL', verdict: 'ACCEPT_NOW' },
  ];
  assert.strictEqual(cap, 3);
  assert.strictEqual(decide({ findings, round: 1, cap, anyAbsorptionFailure: true }),
    'ESCALATE_NEXT_ROUND');
  assert.strictEqual(decide({ findings, round: 2, cap, anyAbsorptionFailure: true }),
    'ESCALATE_NEXT_ROUND');
  assert.strictEqual(decide({ findings, round: 3, cap, anyAbsorptionFailure: true }),
    'DIVERGENT_UNRESOLVED');
});

// Invalid values fall back to 1 — and say so. The fallback direction is
// fail-OPEN on purpose (a typo must not open unbounded rounds), which is only
// safe because it is loud: a silent clamp would let a mistyped cap look like a
// deliberate one. This is the mirror of santa/counter.js#parseCap.
test('invalid MCCP_GATE_ROUND_CAP value falls back to 1 with a loud warn', () => {
  ['0', '7', 'NaN', '2.5'].forEach(function (bad) {
    const r = withCapturedStderr(function () {
      return parseRoundCap({ MCCP_GATE_ROUND_CAP: bad });
    });
    assert.strictEqual(r.value, 1, 'cap for ' + JSON.stringify(bad));
    assert.match(r.stderr, /MCCP_GATE_ROUND_CAP must be an integer/,
      'a bad cap must warn, not clamp silently (' + JSON.stringify(bad) + ')');
  });
});

// Unset is NOT an error — it is the normal state, so it must stay quiet.
test('unset MCCP_GATE_ROUND_CAP defaults to 1 without warning', () => {
  const r = withCapturedStderr(function () { return parseRoundCap({}); });
  assert.strictEqual(r.value, 1);
  assert.strictEqual(r.stderr, '');
});

// Spec coverage: SEVERITY ordering map matches the markdown convention used
// in command bodies (CRITICAL > HIGH > MEDIUM > LOW). Smoke check so a
// reorder/rename here surfaces as a test failure.
test('severity ordering matches command-body convention', () => {
  assert.ok(SEVERITY.CRITICAL > SEVERITY.HIGH);
  assert.ok(SEVERITY.HIGH > SEVERITY.MEDIUM);
  assert.ok(SEVERITY.MEDIUM > SEVERITY.LOW);
});
