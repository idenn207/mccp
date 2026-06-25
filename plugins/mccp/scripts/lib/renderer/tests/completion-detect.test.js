'use strict';

// Dashboard Truthfulness M5 Task 1 — 진행중 진실성. 완료 자동감지(plan_hash-fresh
// terminal receipt OR ledger) + parseDeliveryMilestones backtick bare-path 버그
// 수정 + 신선도 가드. Codex Plan-F1/Implement-F1 negative 케이스를 잠근다.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { isMilestoneClosed } = require('../parsers/decision-state');
const { parseDeliveryMilestones, parsePlanBody } = require('../parsers/plan-body');
const { planAwareMarkdownHash } = require('../../../receipt/hash');

const PLAN_BASENAME = 'sample-feature-m1.plan.md';
const DECISION = 'sample-feature-m1';

// ── parseDeliveryMilestones — backtick bare-path 추출 (root-cause 버그) ────────
test('parseDeliveryMilestones — backtick bare-path Plan cell parses (no markdown link)', () => {
  const prd = '## Delivery Milestones\n\n'
    + '| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
    + '| 1 | a | x | in-progress | `' + '.claude/plans/' + PLAN_BASENAME + '` |\n'
    + '| 2 | b | y | complete | `.claude/plans/done-m0.plan.md` |\n';
  const m = parseDeliveryMilestones(prd);
  assert.equal(m.get(PLAN_BASENAME), 'in-progress');
  assert.equal(m.get('done-m0.plan.md'), 'complete');
});

test('parseDeliveryMilestones — markdown-link Plan cell still parses (regression)', () => {
  const prd = '## Delivery Milestones\n\n'
    + '| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
    + '| 1 | a | x | in-progress | [' + PLAN_BASENAME + '](../plans/' + PLAN_BASENAME + ') |\n';
  const m = parseDeliveryMilestones(prd);
  assert.equal(m.get(PLAN_BASENAME), 'in-progress');
});

// ── isMilestoneClosed — Codex F1 fail-closed 케이스 ───────────────────────────
const FRESH_HASH = 'sha256:aaa';
const baseTerminal = (over) => Object.assign({
  ok: true, gate: 'mccp-pr-codex', converged: true,
  decision_id: DECISION, plan_hash: FRESH_HASH, path: 'mccp-pr-codex/' + DECISION + '.json',
}, over || {});

test('isMilestoneClosed (i) terminal receipt: exact decision + fresh plan_hash → closed', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: FRESH_HASH, receipts: [baseTerminal()], ledgerItems: [] });
  assert.equal(r.closed, true);
  assert.equal(r.via, 'terminal-receipt');
});

test('isMilestoneClosed (e) decision_id mismatch → NOT closed', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: FRESH_HASH, receipts: [baseTerminal({ decision_id: 'other-decision' })], ledgerItems: [] });
  assert.equal(r.closed, false);
});

test('isMilestoneClosed (f) legacy receipt name → NOT closed', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: FRESH_HASH,
    receipts: [baseTerminal({ path: 'mccp-pr-codex/' + DECISION + '.legacy.json' })], ledgerItems: [] });
  assert.equal(r.closed, false);
});

test('isMilestoneClosed (g) plan_hash mismatch (plan edited since gate) → NOT closed', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: 'sha256:bbb', receipts: [baseTerminal({ plan_hash: FRESH_HASH })], ledgerItems: [] });
  assert.equal(r.closed, false);
});

test('isMilestoneClosed — non-terminal gate (plan-codex) does NOT close', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: FRESH_HASH,
    receipts: [baseTerminal({ gate: 'mccp-plan-codex' })], ledgerItems: [] });
  assert.equal(r.closed, false);
});

test('isMilestoneClosed — non-converged terminal receipt does NOT close', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: FRESH_HASH, receipts: [baseTerminal({ converged: false })], ledgerItems: [] });
  assert.equal(r.closed, false);
});

test('isMilestoneClosed (h) generic decision id (default/main) → NOT closed', () => {
  const r = isMilestoneClosed({ decisionId: 'default', planBasename: PLAN_BASENAME,
    currentPlanHash: FRESH_HASH,
    receipts: [baseTerminal({ decision_id: 'default' })], ledgerItems: [] });
  assert.equal(r.closed, false);
});

test('isMilestoneClosed (h) null currentPlanHash disables terminal path (a) — fail-closed', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: null, receipts: [baseTerminal()], ledgerItems: [] });
  assert.equal(r.closed, false);
});

test('isMilestoneClosed (j) ledger-only close (worktree-removed, no live receipt)', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: null, receipts: [],
    ledgerItems: [{ decision_id: DECISION, plan_basename: PLAN_BASENAME, verdict: 'converged', completed_at: '2026-06-20T00:00:00Z' }] });
  assert.equal(r.closed, true);
  assert.equal(r.via, 'ledger');
});

test('isMilestoneClosed — ledger advisory/skipped verdict does NOT close', () => {
  const r = isMilestoneClosed({ decisionId: DECISION, planBasename: PLAN_BASENAME,
    currentPlanHash: null, receipts: [],
    ledgerItems: [{ decision_id: DECISION, plan_basename: PLAN_BASENAME, verdict: 'skipped', completed_at: '2026-06-20T00:00:00Z' }] });
  assert.equal(r.closed, false);
});

// ── parsePlanBody — 완료 override + 신선도 가드 (통합) ─────────────────────────
function withTmpPlan(planBasename, planBody, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cd-'));
  const plansDir = path.join(dir, '.claude', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  const planAbs = path.join(plansDir, planBasename);
  fs.writeFileSync(planAbs, planBody, 'utf8');
  try { return fn(dir, planAbs); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('parsePlanBody — in-progress milestone with fresh terminal receipt → overridden to complete', () => {
  const planBody = '# Plan\n\n## Summary\n\nx\n';
  withTmpPlan(PLAN_BASENAME, planBody, (cwd, planAbs) => {
    const planHash = planAwareMarkdownHash(planAbs);
    const prd = '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
      + '| 1 | a | x | in-progress | `.claude/plans/' + PLAN_BASENAME + '` |\n';
    const model = {
      repo_root: cwd,
      sources: {
        plans: { items: [{ path: '.claude/plans/' + PLAN_BASENAME, source_prd: '.claude/prds/p.prd.md' }] },
        receipts: { items: [{ ok: true, gate: 'mccp-pr-codex', converged: true, decision_id: DECISION,
          plan_hash: planHash, path: 'mccp-pr-codex/' + DECISION + '.json', created_at: '2026-06-24T00:00:00Z' }] },
        ledger: { items: [] },
        state: { item: { frontmatter: {} } },
      },
    };
    const pb = parsePlanBody(model, {
      cwd,
      fsRead: (p) => (p.endsWith('p.prd.md') ? prd : fs.readFileSync(p, 'utf8')),
    });
    assert.equal(pb.planStatuses.get(PLAN_BASENAME), 'complete',
      'fresh terminal receipt closes the milestone');
  });
});

test('parsePlanBody — in-progress with old receipt activity (> threshold) → stale', () => {
  const planBody = '# Plan\n\n## Summary\n\nx\n';
  withTmpPlan(PLAN_BASENAME, planBody, (cwd) => {
    const prd = '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
      + '| 1 | a | x | in-progress | `.claude/plans/' + PLAN_BASENAME + '` |\n';
    const model = {
      repo_root: cwd,
      sources: {
        plans: { items: [{ path: '.claude/plans/' + PLAN_BASENAME, source_prd: '.claude/prds/p.prd.md' }] },
        // plan-codex receipt (non-terminal → no close) but old activity → stale
        receipts: { items: [{ ok: true, gate: 'mccp-plan-codex', converged: true, decision_id: DECISION,
          plan_hash: 'sha256:zzz', path: 'mccp-plan-codex/' + DECISION + '.json', created_at: '2026-01-01T00:00:00Z' }] },
        ledger: { items: [] },
        state: { item: { frontmatter: {} } },
      },
    };
    const pb = parsePlanBody(model, {
      cwd,
      now: Date.parse('2026-06-25T00:00:00Z'),
      fsRead: (p) => (p.endsWith('p.prd.md') ? prd : fs.readFileSync(p, 'utf8')),
    });
    assert.equal(pb.planStatuses.get(PLAN_BASENAME), 'in-progress', 'non-terminal receipt does not close');
    assert.equal(pb.planStaleness.get(PLAN_BASENAME), 'stale', 'old activity (>14d) → stale');
  });
});

test('parsePlanBody — in-progress with recent receipt activity → not stale', () => {
  const planBody = '# Plan\n\n## Summary\n\nx\n';
  withTmpPlan(PLAN_BASENAME, planBody, (cwd) => {
    const prd = '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
      + '| 1 | a | x | in-progress | `.claude/plans/' + PLAN_BASENAME + '` |\n';
    const model = {
      repo_root: cwd,
      sources: {
        plans: { items: [{ path: '.claude/plans/' + PLAN_BASENAME, source_prd: '.claude/prds/p.prd.md' }] },
        receipts: { items: [{ ok: true, gate: 'mccp-plan-codex', converged: true, decision_id: DECISION,
          plan_hash: 'sha256:zzz', path: 'mccp-plan-codex/' + DECISION + '.json', created_at: '2026-06-24T00:00:00Z' }] },
        ledger: { items: [] },
        state: { item: { frontmatter: {} } },
      },
    };
    const pb = parsePlanBody(model, {
      cwd,
      now: Date.parse('2026-06-25T00:00:00Z'),
      fsRead: (p) => (p.endsWith('p.prd.md') ? prd : fs.readFileSync(p, 'utf8')),
    });
    assert.notEqual(pb.planStaleness.get(PLAN_BASENAME), 'stale', 'recent activity (<14d) → not stale');
  });
});
