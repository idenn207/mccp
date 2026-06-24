'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const formatUtils = require('../format-utils');
const { renderMilestoneHistory } = require('../sections/milestone-history');
const {
  parseDeliveryMilestonesComplete,
  resolvePrdRef,
} = require('../parsers/plan-body');

const CWD = path.resolve('/repo');
const PRD_ABS = path.resolve(CWD, '.claude/prds/test.prd.md');

const PRD_BODY = [
  '## Delivery Milestones',
  '',
  '| # | Milestone | Outcome | Status | Plan |',
  '| --- | --- | --- | --- | --- |',
  '| 1 | Alpha | out | complete | .claude/plans/alpha.plan.md (report: .claude/PRPs/reports/alpha-report.md) |',
  '| 2 | Beta | out | complete | [.claude/plans/beta.plan.md](../plans/beta.plan.md) |',
  '| 3 | Gamma | out | complete | .claude/PRPs/plans/completed/gamma.plan.md |',
  '| 4 | Pending | out | pending | — |',
  '',
].join('\n');

// 평문 repo-root source_prd를 가진 plan 1개 + cwd-relative PRD만 읽히는 fsRead.
function makeModel() {
  return {
    repo_root: CWD,
    sources: {
      plans: { items: [{ path: '.claude/plans/alpha.plan.md', source_prd: '.claude/prds/test.prd.md' }] },
      receipts: {
        items: [
          { gate_id: 'mccp-pr-codex', decision_id: 'alpha', created_at: '2026-06-21T12:00:00.000Z' },
        ],
      },
    },
  };
}

// 정확한 PRD 절대경로일 때만 body 반환, doubled-path 등은 throw (fail-open 경로 검증).
function fsReadOnlyPrd(p) {
  if (p === PRD_ABS) return PRD_BODY;
  throw new Error('ENOENT ' + p);
}

function gitTimes(map) {
  return (rel) => map[String(rel).split(path.sep).join('/')] || null;
}

test('parseDeliveryMilestonesComplete: planBasename은 .plan.md (report 괄호 무시)', () => {
  const rows = parseDeliveryMilestonesComplete(PRD_BODY);
  const alpha = rows.find(r => r.name === 'Alpha');
  assert.equal(alpha.planBasename, 'alpha.plan.md');
  assert.equal(alpha.planPath, '.claude/plans/alpha.plan.md');
  const beta = rows.find(r => r.name === 'Beta');
  assert.equal(beta.planBasename, 'beta.plan.md');
  assert.equal(beta.planPath, '../plans/beta.plan.md'); // 링크 target 보존
  const pending = rows.find(r => r.name === 'Pending');
  assert.equal(pending, undefined); // pending 제외
});

test('resolvePrdRef: 평문 repo-root 경로를 dual-path로 해석 (F1)', () => {
  const planAbs = path.resolve(CWD, '.claude/plans/alpha.plan.md');
  const resolved = resolvePrdRef('.claude/prds/test.prd.md', planAbs, CWD, fsReadOnlyPrd);
  assert.ok(resolved);
  assert.equal(resolved.path, PRD_ABS);
});

test('receipt 존재 시 created_at 사용', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, null, {
    cwd: CWD,
    fsRead: fsReadOnlyPrd,
    gitCommitTime: () => null,
  });
  assert.ok(out && out.html.includes('Alpha'));
  // Alpha 행에 datetime 속성(receipt 시점)이 박힘 → 날짜 미상 아님
  assert.ok(out.html.includes('datetime="2026-06-21T12:00:00.000Z"'));
});

test('receipt 부재 + git resolver 반환 → git commit 시점 사용 (completed/ 포함, F2)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, null, {
    cwd: CWD,
    fsRead: fsReadOnlyPrd,
    gitCommitTime: gitTimes({
      '.claude/plans/beta.plan.md': '2026-06-20T10:00:00.000Z',
      '.claude/PRPs/plans/completed/gamma.plan.md': '2026-06-19T09:00:00.000Z',
    }),
  });
  assert.ok(out.html.includes('datetime="2026-06-20T10:00:00.000Z"')); // Beta(링크) prd-dir 해석
  assert.ok(out.html.includes('datetime="2026-06-19T09:00:00.000Z"')); // Gamma(completed/) cwd 해석
  assert.ok(!out.html.includes('날짜 미상'));
});

test('receipt·git 모두 null → 날짜 미상 (graceful floor)', () => {
  const model = makeModel();
  model.sources.receipts.items = []; // receipt 제거
  const out = renderMilestoneHistory(model, formatUtils, null, {
    cwd: CWD,
    fsRead: fsReadOnlyPrd,
    gitCommitTime: () => null, // git도 없음
  });
  // Alpha/Beta/Gamma 모두 시점 미해결 → 날짜 미상
  assert.ok(out.html.includes('날짜 미상'));
});

test('stale 셀 경로(.claude/plans/) → completed/ archive basename fallback (F2)', () => {
  const STALE_PRD = path.resolve(CWD, '.claude/prds/stale.prd.md');
  const body = [
    '## Delivery Milestones',
    '| # | Milestone | Outcome | Status | Plan |',
    '| --- | --- | --- | --- | --- |',
    // 셀은 archive 전 경로를 가리키지만 실제 plan은 completed/ 로 이동됨
    '| 1 | Archived | out | complete | `.claude/plans/moved.plan.md` (PR #9) |',
    '',
  ].join('\n');
  const model = {
    repo_root: CWD,
    sources: {
      plans: { items: [{ path: '.claude/plans/moved.plan.md', source_prd: '.claude/prds/stale.prd.md' }] },
      receipts: { items: [] },
    },
  };
  const out = renderMilestoneHistory(model, formatUtils, null, {
    cwd: CWD,
    fsRead: (p) => { if (p === STALE_PRD) return body; throw new Error('ENOENT'); },
    // 셀 경로 .claude/plans/moved.plan.md 는 미존재, completed/ 만 git 시점 있음
    gitCommitTime: gitTimes({ '.claude/PRPs/plans/completed/moved.plan.md': '2026-06-18T08:00:00.000Z' }),
  });
  assert.ok(out.html.includes('datetime="2026-06-18T08:00:00.000Z"'));
  assert.ok(!out.html.includes('날짜 미상'));
});

// Dashboard Truthfulness M1 headline regression — durable completedAt.
// Simulates post-merge amnesia: the pr-codex receipt is GONE (worktree removed
// after merge) and git commit time is unavailable, yet the git-tracked ledger
// entry still supplies the completion timestamp → no "날짜 미상".
const SINGLE_PRD_BODY = [
  '## Delivery Milestones',
  '',
  '| # | Milestone | Outcome | Status | Plan |',
  '| --- | --- | --- | --- | --- |',
  '| 1 | Alpha | out | complete | .claude/plans/alpha.plan.md |',
  '',
].join('\n');

function fsReadSinglePrd(p) {
  if (p === PRD_ABS) return SINGLE_PRD_BODY;
  throw new Error('ENOENT ' + p);
}

function ledgerModel(ledgerItems) {
  return {
    repo_root: CWD,
    sources: {
      plans: { items: [{ path: '.claude/plans/alpha.plan.md', source_prd: '.claude/prds/test.prd.md' }] },
      receipts: { items: [] }, // receipt 소멸 (merge + worktree remove)
      ledger: { items: ledgerItems },
    },
  };
}

test('headline: receipt+git 부재 시 ledger가 completedAt 제공 (merge+worktree 제거 회귀)', () => {
  const out = renderMilestoneHistory(
    ledgerModel([
      { plan_basename: 'alpha.plan.md', decision_id: 'alpha', completed_at: '2026-06-22T07:00:00.000Z' },
    ]),
    formatUtils, null,
    { cwd: CWD, fsRead: fsReadSinglePrd, gitCommitTime: () => null },
  );
  assert.ok(out && out.html.includes('datetime="2026-06-22T07:00:00.000Z"'),
    'ledger entry supplies the completion time');
  assert.ok(!out.html.includes('날짜 미상'));
});

test('F3 consumer: ledger 항목 부재면 receipt meta flag와 무관하게 날짜 미상 (항목이 authoritative)', () => {
  // 빈 ledger items → 소비자는 어떤 receipt meta(ledger_write_skipped)도 읽지 않으므로
  // 완료 시점을 만들어내지 못하고 정직하게 '날짜 미상'으로 degrade.
  const out = renderMilestoneHistory(
    ledgerModel([]),
    formatUtils, null,
    { cwd: CWD, fsRead: fsReadSinglePrd, gitCommitTime: () => null },
  );
  assert.ok(out.html.includes('날짜 미상'));
});

test('ledger fallback: live pr-codex receipt가 있으면 ledger보다 우선 (사다리 순서)', () => {
  const model = ledgerModel([
    { plan_basename: 'alpha.plan.md', decision_id: 'alpha', completed_at: '2026-06-22T07:00:00.000Z' },
  ]);
  model.sources.receipts.items = [
    { gate_id: 'mccp-pr-codex', decision_id: 'alpha', created_at: '2026-06-23T09:00:00.000Z' },
  ];
  const out = renderMilestoneHistory(model, formatUtils, null,
    { cwd: CWD, fsRead: fsReadSinglePrd, gitCommitTime: () => null });
  assert.ok(out.html.includes('datetime="2026-06-23T09:00:00.000Z"'), 'live receipt wins over ledger');
  assert.ok(!out.html.includes('2026-06-22T07:00:00.000Z'));
});

test('platform-independent: status grid 용어는 마일스톤 (이정표 부재)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, null, {
    cwd: CWD,
    fsRead: fsReadOnlyPrd,
    gitCommitTime: () => null,
  });
  // 섹션 제목은 markdown.js/html.js 책임이지만, item 렌더에 '이정표' 누출 없음 확인
  assert.ok(!out.html.includes('이정표'));
  assert.ok(!out.md.includes('이정표'));
});

// M3 — lifecycle 토글이 완료 기록과 공존(완료 + pending). PRD_BODY 는 pending 행 1개.
test('M3 lifecycle — 완료 기록 + pending 토글 공존 렌더', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadOnlyPrd, gitCommitTime: () => null,
  });
  // 완료(Alpha) 메인 + 미진행 토글 동시 존재.
  assert.match(out.html, /Alpha/);
  assert.match(out.html, /미진행 마일스톤 1건 · 표시/);
  assert.match(out.md, /미진행 마일스톤 1건 · 표시/);
  assert.match(out.html, /◌/); // Pending 행 비-색 마커
});
