'use strict';

// Dashboard Truthfulness M7 Task 1 — ledger-aware converged-frontier promotion
// with freshness guard (Codex Plan-R1 F2 absorption). A decision whose gates are
// converged-but-not-closed (plan✓ + impl✓ + pr missing → impl=converged-frontier)
// is promoted to done ONLY when a durable ledger entry PROVABLY matches the
// current plan (decision_id AND plan_basename AND plan_file_hash). Over-claim
// (same-slug edited plan, partial bundled ledger, archived plan) keeps the
// frontier — under-claim is the safe default for the pipeline surface.

const test = require('node:test');
const assert = require('node:assert');
const {
  buildDecisionState, deriveDecisionState, ledgerCloseFresh,
} = require('../parsers/decision-state');

const ID = 'feat-x';
const BASENAME = 'feat-x.plan.md';
const HASH = 'sha256:abc123';

// plan✓ + impl✓ + pr missing → impl is converged-frontier, state active.
function convergedFrontierReceipts() {
  return [
    { gate_id: 'mccp-plan-codex', decision_id: ID, converged: true, round: 1, created_at: '2026-01-01T00:00:00Z', ok: true },
    { gate_id: 'mccp-implement-codex', decision_id: ID, converged: true, round: 1, created_at: '2026-01-01T01:00:00Z', ok: true },
  ];
}

function ledgerEntry(over) {
  return Object.assign({
    decision_id: ID, plan_basename: BASENAME, plan_file_hash: HASH, verdict: 'converged',
  }, over || {});
}

test('decision-state — baseline: converged-frontier with no ledger stays active (under-claim)', () => {
  const d = buildDecisionState(ID, convergedFrontierReceipts());
  assert.strictEqual(d.state, 'active');
  assert.strictEqual(d.activeStage, 'impl');
  const impl = d.nodes.find((n) => n.short === 'impl');
  assert.strictEqual(impl.status, 'converged-frontier');
});

test('decision-state — (a) full-match + hash-match ledger → promote to done', () => {
  const d = buildDecisionState(ID, convergedFrontierReceipts(), {
    ledgerItems: [ledgerEntry()],
    currentPlanHash: HASH,
  });
  assert.strictEqual(d.state, 'done');
  assert.strictEqual(d.activeStage, null);
  assert.strictEqual(d.nodes.find((n) => n.short === 'impl').status, 'done');
  assert.strictEqual(d.nodes.find((n) => n.short === 'pr').status, 'done');
});

test('decision-state — (b) same-slug edited plan (hash mismatch) → NOT promoted (F2 regression)', () => {
  const d = buildDecisionState(ID, convergedFrontierReceipts(), {
    ledgerItems: [ledgerEntry()], // ledger recorded HASH
    currentPlanHash: 'sha256:EDITED', // live plan differs → reopened work
  });
  assert.strictEqual(d.state, 'active');
  assert.strictEqual(d.activeStage, 'impl');
  assert.strictEqual(d.nodes.find((n) => n.short === 'impl').status, 'converged-frontier');
});

test('decision-state — (c) partial ledger (basename mismatch) → NOT promoted', () => {
  const d = buildDecisionState(ID, convergedFrontierReceipts(), {
    ledgerItems: [ledgerEntry({ plan_basename: 'OTHER-slug.plan.md' })],
    currentPlanHash: HASH,
  });
  assert.strictEqual(d.state, 'active');
});

test('decision-state — (d) ledger absent → frontier preserved', () => {
  const d = buildDecisionState(ID, convergedFrontierReceipts(), {
    ledgerItems: [],
    currentPlanHash: HASH,
  });
  assert.strictEqual(d.state, 'active');
});

test('decision-state — null currentPlanHash (archived/unreadable plan) → NOT promoted (under-claim)', () => {
  const d = buildDecisionState(ID, convergedFrontierReceipts(), {
    ledgerItems: [ledgerEntry()],
    currentPlanHash: null,
  });
  assert.strictEqual(d.state, 'active');
});

test('decision-state — non-converged ledger verdict → NOT promoted', () => {
  const d = buildDecisionState(ID, convergedFrontierReceipts(), {
    ledgerItems: [ledgerEntry({ verdict: 'advisory' })],
    currentPlanHash: HASH,
  });
  assert.strictEqual(d.state, 'active');
});

test('decision-state — deriveDecisionState forwards planHashes per decision', () => {
  const map = deriveDecisionState(convergedFrontierReceipts(), {
    ledgerItems: [ledgerEntry()],
    planHashes: new Map([[ID, HASH]]),
  });
  assert.strictEqual(map.get(ID).state, 'done');
});

test('decision-state — deriveDecisionState legacy call (no opts) unchanged', () => {
  const map = deriveDecisionState(convergedFrontierReceipts());
  assert.strictEqual(map.get(ID).state, 'active');
});

test('decision-state — blocked decision is never silently closed by a fresh ledger', () => {
  // impl round>=2 non-converged → blocked. Even a fresh ledger must not close it.
  const receipts = [
    { gate_id: 'mccp-plan-codex', decision_id: ID, converged: true, round: 1, created_at: '2026-01-01T00:00:00Z', ok: true },
    { gate_id: 'mccp-implement-codex', decision_id: ID, converged: false, round: 2, created_at: '2026-01-01T02:00:00Z', ok: true },
  ];
  const d = buildDecisionState(ID, receipts, {
    ledgerItems: [ledgerEntry()],
    currentPlanHash: HASH,
  });
  assert.strictEqual(d.state, 'blocked');
});

test('decision-state — ledgerCloseFresh: strict BOTH-match + hash contract', () => {
  const receipts = convergedFrontierReceipts();
  const base = { decisionId: ID, planBasename: BASENAME, receipts };
  // fresh
  assert.strictEqual(ledgerCloseFresh(Object.assign({}, base, {
    currentPlanHash: HASH, ledgerItems: [ledgerEntry()],
  })), true);
  // hash mismatch
  assert.strictEqual(ledgerCloseFresh(Object.assign({}, base, {
    currentPlanHash: 'sha256:x', ledgerItems: [ledgerEntry()],
  })), false);
  // null hash
  assert.strictEqual(ledgerCloseFresh(Object.assign({}, base, {
    currentPlanHash: null, ledgerItems: [ledgerEntry()],
  })), false);
  // decision-only match (basename differs) — isMilestoneClosed says ledger, strict says no
  assert.strictEqual(ledgerCloseFresh(Object.assign({}, base, {
    currentPlanHash: HASH, ledgerItems: [ledgerEntry({ plan_basename: 'z.plan.md' })],
  })), false);
});
