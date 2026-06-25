'use strict';

// Dashboard Truthfulness M7 Task 3 — frontier-primary next-action resolver
// (Codex Plan-R1 F1 + F3 absorptions). Priority: genuine handoff → live
// in-progress plan's gate frontier → freshness-gated STATE.md command →
// stale-plan note → prose/idle. A stale-but-substantive STATE.md command can
// never mask the current frontier; resume is recommended only on a genuine
// handoff_spawn signal.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveNextAction, HOLLOW_COMMANDS } = require('../parsers/next-action');

function stateWith(nextStep, extra) {
  return Object.assign({ body: { nextStep } }, extra || {});
}
function dstate(state, activeStage, nodes) {
  return { state, activeStage, nodes: nodes || [] };
}

// ── F3: genuine handoff only ──────────────────────────────────────────────

test('next-action — hasHandoffSignal → /mccp:resume (F3 genuine handoff)', () => {
  const na = resolveNextAction(stateWith('아무 본문'), { hasHandoffSignal: true });
  assert.equal(na.command, '/mccp:resume');
  assert.equal(na.executable, true);
  assert.equal(na.source, 'resume-state');
});

test('next-action — resume_state in-flight alone is NOT an executable resume (F3 regression)', () => {
  // No handoff_spawn signal → resume_state on the item must NOT trigger resume.
  const na = resolveNextAction(stateWith('막연한 설명만', { resume_state: 'in-flight' }), {});
  assert.notEqual(na.command, '/mccp:resume');
  assert.equal(na.source, 'prose');
});

// ── F1: frontier-primary ──────────────────────────────────────────────────

test('next-action — gate-frontier impl → /mccp:prp-implement <planPath> (F1 primary)', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/m7.plan.md' }],
    planStatuses: new Map([['m7.plan.md', 'in-progress']]),
    decisionState: new Map([['m7', dstate('active', 'impl')]]),
  });
  assert.equal(na.command, '/mccp:prp-implement');
  assert.equal(na.args, '.claude/plans/m7.plan.md');
  assert.equal(na.executable, true);
  assert.equal(na.source, 'gate-frontier');
});

test('next-action — converged-frontier impl → next gate is PR, not re-implement (truthful)', () => {
  // impl gate converged (converged-frontier), pr not started → next action is PR.
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/m7.plan.md' }],
    planStatuses: new Map([['m7.plan.md', 'in-progress']]),
    decisionState: new Map([['m7', dstate('active', 'impl', [
      { short: 'plan', status: 'done' },
      { short: 'impl', status: 'converged-frontier' },
      { short: 'pr', status: 'missing' },
    ])]]),
  });
  assert.equal(na.command, '/mccp:pr');
  assert.equal(na.source, 'gate-frontier');
});

test('next-action — active (non-converged) impl frontier → /mccp:prp-implement (continue gate)', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/m7.plan.md' }],
    planStatuses: new Map([['m7.plan.md', 'in-progress']]),
    decisionState: new Map([['m7', dstate('active', 'impl', [
      { short: 'plan', status: 'done' },
      { short: 'impl', status: 'active' },
      { short: 'pr', status: 'missing' },
    ])]]),
  });
  assert.equal(na.command, '/mccp:prp-implement');
  assert.equal(na.args, '.claude/plans/m7.plan.md');
});

test('next-action — gate-frontier pr → /mccp:pr', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/m7.plan.md' }],
    planStatuses: new Map([['m7.plan.md', 'in-progress']]),
    decisionState: new Map([['m7', dstate('active', 'pr')]]),
  });
  assert.equal(na.command, '/mccp:pr');
  assert.equal(na.executable, true);
  assert.equal(na.source, 'gate-frontier');
});

test('next-action — stale cross-cycle STATE.md command does NOT mask the frontier (F1 regression)', () => {
  // STATE.md points at ANOTHER cycle's plan, but the live in-progress plan's
  // frontier must win. This is the exact failure this worktree exhibited.
  const na = resolveNextAction(
    stateWith('이어가기: /mccp:prp-implement .claude/plans/pipeline-chart-m3.plan.md'), {
      plans: [{ path: '.claude/plans/m7.plan.md' }],
      planStatuses: new Map([['m7.plan.md', 'in-progress']]),
      decisionState: new Map([['m7', dstate('active', 'impl')]]),
    });
  assert.equal(na.source, 'gate-frontier');
  assert.equal(na.args, '.claude/plans/m7.plan.md');
  assert.ok(!/pipeline-chart/.test(na.copyText));
});

test('next-action — hollow /mccp:resume in STATE.md blob is filtered, not echoed (F1)', () => {
  const na = resolveNextAction(stateWith('다음 세션 `/mccp:resume` 로 이어가기'), {});
  assert.notEqual(na.command, '/mccp:resume');
  assert.equal(na.executable, false);
  assert.equal(na.source, 'prose');
});

test('next-action — HOLLOW_COMMANDS catalog covers resume/trace/receipt-*', () => {
  ['mccp:resume', 'mccp:trace', 'mccp:receipt-status', 'mccp:receipt-validate', 'mccp:receipt-write']
    .forEach((c) => assert.ok(HOLLOW_COMMANDS.has(c)));
});

test('next-action — in-progress plan with no decision-state → /mccp:prp-implement fallback', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/x.plan.md' }],
    planStatuses: new Map([['x.plan.md', 'in-progress']]),
  });
  assert.equal(na.command, '/mccp:prp-implement');
  assert.equal(na.args, '.claude/plans/x.plan.md');
  assert.equal(na.source, 'in-progress-plan');
});

test('next-action — ledger-promoted done decision is skipped (not recommended as next)', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/done1.plan.md' }],
    planStatuses: new Map([['done1.plan.md', 'in-progress']]),
    decisionState: new Map([['done1', dstate('done', null)]]),
  });
  assert.equal(na.command, null);
  assert.equal(na.source, 'idle');
});

test('next-action — blocked frontier → non-executable intervention prose', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/b.plan.md' }],
    planStatuses: new Map([['b.plan.md', 'in-progress']]),
    decisionState: new Map([['b', dstate('blocked', 'impl')]]),
  });
  assert.equal(na.executable, false);
  assert.equal(na.source, 'gate-frontier');
  assert.match(na.description, /개입/);
});

// ── STATE.md freshness-gated fallback ──────────────────────────────────────

test('next-action — fresh create-command (no in-progress work) → state-fresh', () => {
  const na = resolveNextAction(stateWith('/mccp:plan-prd dashboard truthfulness'), {});
  assert.equal(na.command, '/mccp:plan-prd');
  assert.equal(na.args, 'dashboard truthfulness');
  assert.equal(na.executable, true);
  assert.equal(na.source, 'state-fresh');
});

test('next-action — plan-path command pointing at a non-current plan → rejected as stale (F1)', () => {
  const na = resolveNextAction(
    stateWith('실행: /mccp:prp-implement .claude/plans/ghost.plan.md'),
    { plans: [], planStatuses: new Map() });
  assert.notEqual(na.source, 'state-fresh');
  assert.equal(na.executable, false);
  assert.equal(na.source, 'prose');
});

// ── stale / idle / prose / robustness ──────────────────────────────────────

test('next-action — stale in-progress plan → in-progress-plan-stale (not advertised)', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/stale.plan.md' }],
    planStatuses: new Map([['stale.plan.md', 'in-progress']]),
    planStaleness: new Map([['stale.plan.md', 'stale']]),
  });
  assert.equal(na.executable, false);
  assert.equal(na.stale, true);
  assert.equal(na.source, 'in-progress-plan-stale');
  assert.match(na.prose, /미정 \(stale\)/);
});

test('next-action — empty everything → idle 대기', () => {
  const na = resolveNextAction(stateWith(''), { plans: [], planStatuses: new Map() });
  assert.equal(na.command, null);
  assert.equal(na.source, 'idle');
  assert.equal(na.prose, '대기');
});

test('next-action — prose-only when blob has prose but no command/plan', () => {
  const na = resolveNextAction(stateWith('사용자 시각 확인 후 PR 작성'), { plans: [], planStatuses: new Map() });
  assert.equal(na.command, null);
  assert.equal(na.source, 'prose');
  assert.match(na.prose, /사용자 시각 확인/);
});

test('next-action — null/garbage stateItem handled (no throw)', () => {
  assert.equal(resolveNextAction(null, {}).source, 'idle');
  assert.equal(resolveNextAction(undefined, undefined).source, 'idle');
  assert.equal(resolveNextAction({ body: { nextStep: 42 } }, {}).source, 'idle');
});
