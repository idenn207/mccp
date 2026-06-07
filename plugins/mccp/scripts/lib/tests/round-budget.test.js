'use strict';

// v0.2.9 Task 8 — Round budget policy oracle test.
//
// The severity-gated re-rerun policy currently lives in command-body markdown
// (plan.md Phase 5.4, prp-implement.md Phase 2.5.4, pr.md Phase 2.5.4). There
// is no production helper for it (v0.2.9 is a spec-level patch — no new helper
// per the plan's Out of scope). This test encodes the policy as a pure
// function so the decision tree has mechanical coverage and a future helper
// extraction has a behavioural specification to match.

const test = require('node:test');
const assert = require('node:assert');

const SEVERITY = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function parseCap(env) {
  const raw = (env && env.MCCP_GATE_ROUND_CAP) || '1';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 3) return 1;
  return n;
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
  const cap = parseCap({}); // env unset → default 1
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
  const cap = parseCap({}); // default 1
  const findings = [
    { id: 'F1', severity: 'HIGH', verdict: 'ACCEPT_NOW' },
    { id: 'F2', severity: 'LOW', verdict: 'REJECT_YAGNI' },
  ];
  const verdict = decide({ findings, round: 1, cap, anyAbsorptionFailure: true });
  assert.strictEqual(cap, 1);
  assert.strictEqual(verdict, 'DIVERGENT_UNRESOLVED');
});

test('cap=3 + persistent divergence across R1/R2/R3 → DIVERGENT_UNRESOLVED at R3', () => {
  const cap = parseCap({ MCCP_GATE_ROUND_CAP: '3' });
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

// Forward-compat guard: env var with invalid value silently clamps to 1.
test('invalid MCCP_GATE_ROUND_CAP value clamps to 1', () => {
  assert.strictEqual(parseCap({ MCCP_GATE_ROUND_CAP: '0' }), 1);
  assert.strictEqual(parseCap({ MCCP_GATE_ROUND_CAP: '7' }), 1);
  assert.strictEqual(parseCap({ MCCP_GATE_ROUND_CAP: 'NaN' }), 1);
});

// Spec coverage: SEVERITY ordering map matches the markdown convention used
// in command bodies (CRITICAL > HIGH > MEDIUM > LOW). Smoke check so a
// reorder/rename here surfaces as a test failure.
test('severity ordering matches command-body convention', () => {
  assert.ok(SEVERITY.CRITICAL > SEVERITY.HIGH);
  assert.ok(SEVERITY.HIGH > SEVERITY.MEDIUM);
  assert.ok(SEVERITY.MEDIUM > SEVERITY.LOW);
});
