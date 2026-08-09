'use strict';

// integrity-unification M3 Task 1 — pr-ship-gate pure oracle. Covers the DD1
// verdict partition (converged/skipped→ship, divergent/critical/unavailable/
// absent→no-ship), the DD3 audited override (ship flips but blockingVerdict is
// PRESERVED — verdict never rewritten to converged), null-safety, and a
// real-producer receipt shape (the resolution.codex_verdict that write.js/
// finalize-receipt actually seal).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveShipDecision,
  classifyVerdict,
  EX_SHIP_BLOCKED,
  SHIP_VERDICTS,
} = require('../pr-ship-gate');
const { makeSkeleton } = require('../../receipt/schema');

function receiptWithVerdict(cv, metaOverrides) {
  // Mirror the real producer: write.js sets resolution.codex_verdict onto the
  // default resolution ({converged:true,...}); a divergent SHIP receipt keeps
  // converged=true while codex_verdict='divergent' (the B#11 split).
  // metaOverrides lets a test attach the skip-proof markers a `skipped` verdict
  // needs to be a constructive ship (F2).
  const r = makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = 'feature-x';
  r.resolution.converged = true;
  if (cv !== undefined) r.resolution.codex_verdict = cv;
  if (metaOverrides) Object.assign(r.meta, metaOverrides);
  return r;
}

// ── DD1 partition — no override ───────────────────────────────────────────────

test('converged → ship', () => {
  const d = deriveShipDecision(receiptWithVerdict('converged'), {});
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, null);
  assert.equal(d.absent, false);
  assert.equal(d.overrideActive, false);
});

test('skipped WITH audited-skip proof (codex_skipped_at_pr) → ship', () => {
  const d = deriveShipDecision(receiptWithVerdict('skipped', { codex_skipped_at_pr: true }), {});
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, null);
});

test('skipped WITH dedupe proof (codex_dedupe_at_pr) → ship', () => {
  const d = deriveShipDecision(receiptWithVerdict('skipped', { codex_dedupe_at_pr: true }), {});
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, null);
});

test('skipped WITH explicit disabled marker (codex_disabled_at_pr) → ship', () => {
  const d = deriveShipDecision(receiptWithVerdict('skipped', { codex_disabled_at_pr: true }), {});
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, null);
});

// v1.23.5 (gate-guard-integrity M1, fix A) — this assertion is INVERTED from
// what it was. It used to assert that ambient `codex_disabled` alone ships, which
// pinned the defect as correct: on a standard install (MCCP_CODEX_DISABLED=1 in
// settings.json) write.js stamps that field on EVERY receipt, so an unproven skip
// always found proof and the F2 forgery branch became unreachable. The ambient
// annotation is not a caller's claim; only `codex_disabled_at_pr` is.
test('skipped WITH ambient annotation ONLY (codex_disabled) → no-ship [v1.23.5 fix A]', () => {
  const d = deriveShipDecision(receiptWithVerdict('skipped', { codex_disabled: true }), {});
  assert.equal(d.ship, false);
  assert.equal(d.blockingVerdict, 'skipped-unproven');
  assert.match(d.reason, /codex_disabled_at_pr/);
  assert.doesNotMatch(d.reason, /codex_disabled\[/);
});

// The ambient annotation must not weaken a proof that IS present, either.
test('skipped WITH both ambient + explicit marker → ship (explicit is what counts)', () => {
  const d = deriveShipDecision(
    receiptWithVerdict('skipped', { codex_disabled: true, codex_disabled_at_pr: true }), {});
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, null);
});

// F2 — a `skipped` verdict with NO proof marker is unproven and fails closed.
test('skipped WITHOUT any proof marker → no-ship (skipped-unproven, fail-closed) [F2]', () => {
  const d = deriveShipDecision(receiptWithVerdict('skipped'), {});
  assert.equal(d.ship, false);
  assert.equal(d.blockingVerdict, 'skipped-unproven');
  assert.equal(d.absent, false);
});

test('override on skipped-unproven → ship=true, blockingVerdict STILL skipped-unproven (sealed)', () => {
  const d = deriveShipDecision(receiptWithVerdict('skipped'), { forceOverrideActive: true });
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, 'skipped-unproven');
  assert.equal(d.overrideActive, true);
});

test('divergent → no-ship (blockingVerdict preserved)', () => {
  const d = deriveShipDecision(receiptWithVerdict('divergent'), {});
  assert.equal(d.ship, false);
  assert.equal(d.blockingVerdict, 'divergent');
  assert.equal(d.absent, false);
});

test('critical → no-ship', () => {
  const d = deriveShipDecision(receiptWithVerdict('critical'), {});
  assert.equal(d.ship, false);
  assert.equal(d.blockingVerdict, 'critical');
});

test('unavailable → no-ship (fail-closed: invoked but unreadable)', () => {
  const d = deriveShipDecision(receiptWithVerdict('unavailable'), {});
  assert.equal(d.ship, false);
  assert.equal(d.blockingVerdict, 'unavailable');
});

test('absent codex_verdict → no-ship (fail-closed) + blockingVerdict="absent"', () => {
  const d = deriveShipDecision(receiptWithVerdict(undefined), {});
  assert.equal(d.ship, false);
  assert.equal(d.absent, true);
  assert.equal(d.blockingVerdict, 'absent');
});

test('unknown verdict value → no-ship (fail-closed default)', () => {
  const d = deriveShipDecision({ resolution: { codex_verdict: 'mystery' } }, {});
  assert.equal(d.ship, false);
  assert.equal(d.blockingVerdict, 'mystery');
});

// ── DD3 override — unblock, but NEVER rewrite the verdict ──────────────────────

test('override on a divergent receipt → ship=true but blockingVerdict STILL divergent', () => {
  const d = deriveShipDecision(receiptWithVerdict('divergent'),
    { forceOverrideActive: true });
  assert.equal(d.ship, true, 'override unblocks the mechanical HALT');
  assert.equal(d.blockingVerdict, 'divergent',
    'the real verdict is preserved for audit — NOT rewritten to converged');
  assert.equal(d.overrideActive, true);
});

test('override on critical → ship=true, blockingVerdict=critical (verdict sealed)', () => {
  const d = deriveShipDecision(receiptWithVerdict('critical'),
    { forceOverrideActive: true });
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, 'critical');
});

test('override on absent → ship=true, blockingVerdict="absent"', () => {
  const d = deriveShipDecision(receiptWithVerdict(undefined),
    { forceOverrideActive: true });
  assert.equal(d.ship, true);
  assert.equal(d.absent, true);
  assert.equal(d.blockingVerdict, 'absent');
});

test('override on an ALREADY-ship verdict is a no-op on blockingVerdict', () => {
  const d = deriveShipDecision(receiptWithVerdict('converged'),
    { forceOverrideActive: true });
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, null,
    'a converged receipt ships on its own; override does not fabricate a block');
  assert.equal(d.overrideActive, true);
});

// ── null-safety ───────────────────────────────────────────────────────────────

test('missing resolution → no-ship (absent, fail-closed)', () => {
  assert.equal(deriveShipDecision({}, {}).ship, false);
  assert.equal(deriveShipDecision({}, {}).absent, true);
});

test('null receipt → no-ship (absent, fail-closed)', () => {
  const d = deriveShipDecision(null, {});
  assert.equal(d.ship, false);
  assert.equal(d.absent, true);
});

test('null receipt + override → ship=true (override still forces through)', () => {
  const d = deriveShipDecision(null, { forceOverrideActive: true });
  assert.equal(d.ship, true);
  assert.equal(d.blockingVerdict, 'absent');
});

test('classifyVerdict is null-safe on non-object resolution', () => {
  assert.deepEqual(classifyVerdict(undefined), { ship: false, absent: true, verdict: null });
  assert.deepEqual(classifyVerdict('nope'), { ship: false, absent: true, verdict: null });
});

// ── constants ─────────────────────────────────────────────────────────────────

test('EX_SHIP_BLOCKED is 12 (aligned with codex-invoke blocking exit)', () => {
  assert.equal(EX_SHIP_BLOCKED, 12);
});

test('SHIP_VERDICTS is exactly {converged, skipped}', () => {
  assert.deepEqual(SHIP_VERDICTS.slice().sort(), ['converged', 'skipped']);
});
