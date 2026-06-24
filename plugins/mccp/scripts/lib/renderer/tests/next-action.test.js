'use strict';

// Dashboard Truthfulness M2 (Codex R1 F1) — next-action resolver.
// FULL command line (not a bare token), required-arg validation, inference
// fallback that supplies a runnable command, honest prose/idle.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveNextAction } = require('../parsers/next-action');

function stateWith(nextStep, extra) {
  return Object.assign({ body: { nextStep } }, extra || {});
}

test('next-action — extracts bare-token command with no args (resume needs none)', () => {
  const na = resolveNextAction(stateWith('다음 세션 `/mccp:resume` 로 이어가기'), {});
  assert.equal(na.command, '/mccp:resume');
  assert.equal(na.args, '');
  assert.equal(na.executable, true);
  assert.equal(na.copyText, '/mccp:resume');
  assert.equal(na.source, 'state-command');
});

test('next-action — extracts FULL command line with args (F1)', () => {
  const na = resolveNextAction(stateWith('/mccp:plan-prd dashboard truthfulness'), {});
  assert.equal(na.command, '/mccp:plan-prd');
  assert.equal(na.args, 'dashboard truthfulness');
  assert.equal(na.executable, true);
  assert.equal(na.copyText, '/mccp:plan-prd dashboard truthfulness');
  assert.equal(na.source, 'state-command');
});

test('next-action — extracts command with a path arg (markers downgraded)', () => {
  const na = resolveNextAction(stateWith('이제 `/mccp:prp-implement .claude/plans/foo.plan.md` 실행'), {});
  assert.equal(na.command, '/mccp:prp-implement');
  assert.equal(na.args, '.claude/plans/foo.plan.md');
  assert.equal(na.executable, true);
  assert.equal(na.copyText, '/mccp:prp-implement .claude/plans/foo.plan.md');
});

test('next-action — required-arg command WITHOUT args is NOT advertised; inference supplies plan path (F1)', () => {
  const na = resolveNextAction(stateWith('다음: /mccp:prp-implement\n나머지 본문'), {
    plans: [{ path: '.claude/plans/active.plan.md' }],
    planStatuses: new Map([['active.plan.md', 'in-progress']]),
  });
  // bare /mccp:prp-implement → non-executable → inference picks the in-progress plan path.
  assert.equal(na.command, '/mccp:prp-implement');
  assert.equal(na.args, '.claude/plans/active.plan.md');
  assert.equal(na.executable, true);
  assert.equal(na.copyText, '/mccp:prp-implement .claude/plans/active.plan.md');
  assert.equal(na.source, 'in-progress-plan');
});

test('next-action — required-arg command WITHOUT args and NO in-progress plan → prose-only (executable=false)', () => {
  const na = resolveNextAction(stateWith('다음: /mccp:plan 무언가를 계획'), { plans: [], planStatuses: new Map() });
  // /mccp:plan requires an arg; "무언가를 계획" is Hangul (not captured as args) → bare → prose-only.
  assert.equal(na.executable, false);
  assert.equal(na.copyText, null);
  assert.equal(na.source, 'prose');
  assert.ok(na.prose && na.prose.length > 0);
});

test('next-action — resume-state in-flight inference (no command in blob)', () => {
  const na = resolveNextAction(stateWith('막연한 설명만', { resume_state: 'in-flight' }), {});
  assert.equal(na.command, '/mccp:resume');
  assert.equal(na.executable, true);
  assert.equal(na.source, 'resume-state');
});

test('next-action — in-progress plan inference includes resolved path (no bare command, F1)', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/v1-18-4-x-m2.plan.md' }],
    planStatuses: new Map([['v1-18-4-x-m2.plan.md', 'in-progress']]),
  });
  assert.equal(na.command, '/mccp:prp-implement');
  assert.equal(na.args, '.claude/plans/v1-18-4-x-m2.plan.md');
  assert.equal(na.executable, true);
  assert.equal(na.source, 'in-progress-plan');
});

test('next-action — stale in-progress plan → prose-only 미정 (stale), not advertised', () => {
  const na = resolveNextAction(stateWith(''), {
    plans: [{ path: '.claude/plans/stale.plan.md' }],
    planStatuses: new Map([['stale.plan.md', 'in-progress']]),
    planStaleness: new Map([['stale.plan.md', 'stale']]),
  });
  assert.equal(na.executable, false);
  assert.equal(na.stale, true);
  assert.equal(na.copyText, null);
  assert.equal(na.source, 'in-progress-plan-stale');
  assert.match(na.prose, /미정 \(stale\)/);
});

test('next-action — empty nextStep + nothing in-flight → idle 대기', () => {
  const na = resolveNextAction(stateWith(''), { plans: [], planStatuses: new Map() });
  assert.equal(na.command, null);
  assert.equal(na.executable, false);
  assert.equal(na.source, 'idle');
  assert.equal(na.prose, '대기');
});

test('next-action — prose-only when blob has prose but no command and no plan', () => {
  const na = resolveNextAction(stateWith('사용자 시각 확인 후 PR 작성'), { plans: [], planStatuses: new Map() });
  assert.equal(na.command, null);
  assert.equal(na.executable, false);
  assert.equal(na.source, 'prose');
  assert.match(na.prose, /사용자 시각 확인/);
});

test('next-action — null/garbage stateItem is handled (no throw)', () => {
  assert.equal(resolveNextAction(null, {}).source, 'idle');
  assert.equal(resolveNextAction(undefined, undefined).source, 'idle');
  assert.equal(resolveNextAction({ body: { nextStep: 42 } }, {}).source, 'idle');
});
