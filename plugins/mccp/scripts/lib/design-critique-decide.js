'use strict';

// v1.3.0-m2 — design-critique retry loop oracle.
//
// Pure, dep-free decision function for the impeccable design-critique retry
// loop wired into plan.md Phase 5.0 and the prp-implement / plan-prd mirrors.
// Mirrors round-budget.test.js: explicit inputs, enum return value, no side
// effects. Codex R1 F2 absorption — UNKNOWN severity counts as failing so a
// missing/mis-labelled capture schema cannot silently CONVERGE.

const SEVERITY_ALIASES = Object.freeze({
  CRITICAL: 'CRITICAL', CRIT: 'CRITICAL', P0: 'CRITICAL',
  BLOCKING: 'CRITICAL', BLOCKER: 'CRITICAL',
  HIGH: 'HIGH', H: 'HIGH', P1: 'HIGH', MAJOR: 'HIGH',
  MEDIUM: 'MEDIUM', MED: 'MEDIUM', M: 'MEDIUM', P2: 'MEDIUM',
  LOW: 'LOW', L: 'LOW', P3: 'LOW', MINOR: 'LOW',
});

function normalizeSeverity(raw) {
  const key = String(raw == null ? '' : raw).trim().toUpperCase();
  if (key === '') return 'UNKNOWN';
  return SEVERITY_ALIASES[key] || 'UNKNOWN';
}

function parseRetryCap(env) {
  const raw = (env && env.MCCP_DESIGN_CRITIQUE_MAX_RETRY) || '2';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 3) return 2;
  return n;
}

// decideCritique({ findings, round, cap }) → enum
//   'CONVERGED'            — no HIGH/CRITICAL/UNKNOWN finding remains.
//   'ESCALATE_NEXT_ROUND'  — at least one failing finding AND round < cap.
//   'DIVERGENT_UNRESOLVED' — failing finding AND round >= cap (or findings invalid).
//
// `round` is 0-indexed within a single critique invocation: round=0 is the
// first critique call, round=1 means we have already re-edited once and are
// scoring the second critique. Caller increments round between iterations.
function decideCritique({ findings, round, cap }) {
  if (!Array.isArray(findings)) return 'DIVERGENT_UNRESOLVED';
  const failing = findings.filter(function (f) {
    const sev = normalizeSeverity(f && f.severity);
    return sev === 'CRITICAL' || sev === 'HIGH' || sev === 'UNKNOWN';
  });
  if (failing.length === 0) return 'CONVERGED';
  if (round < cap) return 'ESCALATE_NEXT_ROUND';
  return 'DIVERGENT_UNRESOLVED';
}

module.exports = {
  SEVERITY_ALIASES,
  normalizeSeverity,
  parseRetryCap,
  decideCritique,
};
