'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const formatUtils = require('../format-utils');
const { renderMilestoneHistory } = require('../sections/milestone-history');

const CWD = path.resolve('/repo');
const PRD_ABS = path.resolve(CWD, '.claude/prds/lifecycle.prd.md');

const PRD_MIXED = [
  '## Delivery Milestones',
  '',
  '| # | Milestone | Outcome | Status | Plan |',
  '| --- | --- | --- | --- | --- |',
  '| 1 | Done one | o | complete | [.claude/plans/done.plan.md](../plans/done.plan.md) |',
  '| 2 | Future one | o | pending | — |',
  '| 3 | Killed one | o | dropped | — |',
  '',
].join('\n');

const PRD_LIFECYCLE_ONLY = [
  '## Delivery Milestones',
  '',
  '| # | Milestone | Outcome | Status | Plan |',
  '| --- | --- | --- | --- | --- |',
  '| 1 | Future one | o | pending | — |',
  '| 2 | Killed one | o | dropped | — |',
  '',
].join('\n');

function makeModel() {
  return {
    repo_root: CWD,
    sources: {
      plans: { items: [{ path: '.claude/plans/done.plan.md', source_prd: '.claude/prds/lifecycle.prd.md' }] },
      receipts: {
        items: [{ gate_id: 'mccp-pr-codex', decision_id: 'done', created_at: '2026-06-21T12:00:00.000Z' }],
      },
    },
  };
}

function fsReadPrd(body) {
  return (p) => {
    if (p === PRD_ABS) return body;
    throw new Error('ENOENT ' + p);
  };
}

const noGit = () => null;

test('lifecycle 토글 — 완료 기록 + dropped 만 노출(M8: 예정 제외)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_MIXED), gitCommitTime: noGit,
  });
  assert.ok(out, 'section 렌더됨');
  // M8 (② lifecycle 스코핑) — pending(예정)은 speculative 라 제외, dropped(폐기)만.
  // 완료 1 / 미진행 1(Killed one).
  assert.match(out.html, /Done one/);
  assert.match(out.html, /완료 <span class="tab-count">1<\/span>/);
  assert.match(out.html, /미진행 <span class="tab-count">1<\/span>/);
  // 폐기 마커만(예정 ◌·Future one 미노출).
  assert.match(out.html, /⊘/);
  assert.match(out.html, /폐기/);
  assert.doesNotMatch(out.html, /◌/);
  assert.doesNotMatch(out.html, /예정/);
  assert.doesNotMatch(out.html, /Future one/);
  // md 동등.
  assert.match(out.md, /미진행 마일스톤 1건 · 표시/);
  assert.match(out.md, /⊘ 폐기 · Killed one/);
  assert.doesNotMatch(out.md, /◌ 예정/);
});

test('lifecycle 탭 — 미진행 default-미선택 (완료 탭 default, M6 Task 3)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_MIXED), gitCommitTime: noGit,
  });
  // 완료(merged>0) 가 default-checked, 미진행 탭 radio 는 미선택(기본 접힘 등가).
  assert.match(out.html, /id="tab-milestones-done"[^>]*checked/);
  assert.doesNotMatch(out.html, /id="tab-milestones-lifecycle"[^>]*checked/);
});

test('lifecycle — dropped 는 data-detail-id 없음 (H18 무영향)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_MIXED), gitCommitTime: noGit,
  });
  // M8 — 예정 제외 후 dropped 1건만. lifecycle li 는 ms-lifecycle + data-detail-id 미부여.
  const lifeMatch = out.html.match(/<li class="milestone-item ms-lifecycle"[^>]*>/g) || [];
  assert.equal(lifeMatch.length, 1);
  for (const li of lifeMatch) {
    assert.equal(/data-detail-id/.test(li), false);
  }
});

test('lifecycle — 완료 0 + lifecycle-only 도 렌더 (Codex F3, early-return 앞 파싱)', () => {
  const model = makeModel();
  // receipt 제거 + complete row 없는 PRD → merged.length===0 이지만 lifecycle 있음.
  model.sources.receipts.items = [];
  const out = renderMilestoneHistory(model, formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_LIFECYCLE_ONLY), gitCommitTime: noGit,
  });
  assert.ok(out, 'lifecycle-only PRD 도 null 아님');
  // M8 — merged 0 + dropped 1(예정 제외) → 완료(0, 미선택)·미진행(1, default-checked) 탭.
  assert.match(out.html, /미진행 <span class="tab-count">1<\/span>/);
  assert.match(out.html, /id="tab-milestones-lifecycle"[^>]*checked/);
  // 완료 기록 ul 없음(merged 0) — 완료 탭은 empty-state.
  assert.equal(/ic-check/.test(out.html), false, '완료 체크 항목 없음');
});

test('M8 — pending(예정) 전용 PRD 는 lifecycle 비어 null (예정 스코핑)', () => {
  const model = makeModel();
  model.sources.receipts.items = [];
  const PRD_PENDING_ONLY = [
    '## Delivery Milestones',
    '',
    '| # | Milestone | Outcome | Status | Plan |',
    '| --- | --- | --- | --- | --- |',
    '| 1 | Future a | o | pending | — |',
    '| 2 | Future b | o | pending | — |',
    '',
  ].join('\n');
  const out = renderMilestoneHistory(model, formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_PENDING_ONLY), gitCommitTime: noGit,
  });
  // 완료 0 + pending-only(스코핑 제외) → lifecycle 0 → null.
  assert.equal(out, null);
});

test('M8 — axis 글자-ID prefix("H — ", "A — ", "**I — ")는 마일스톤명에서 제거', () => {
  const model = makeModel();
  const PRD_AXIS = [
    '## Delivery Milestones',
    '',
    '| # | Milestone | Outcome | Status | Plan |',
    '| --- | --- | --- | --- | --- |',
    '| 1 | **H — plan-implement verify** | o | complete | [.claude/plans/done.plan.md](../plans/done.plan.md) |',
    '| 2 | A — metric pivot | o | dropped | — |',
    '',
  ].join('\n');
  const out = renderMilestoneHistory(model, formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_AXIS), gitCommitTime: noGit,
  });
  assert.ok(out, 'section 렌더됨');
  // 글자-ID prefix 제거된 이름만 노출.
  assert.match(out.html, /plan-implement verify/);
  assert.match(out.html, /metric pivot/);
  assert.doesNotMatch(out.html, /H , plan-implement|H — plan-implement/);
  assert.doesNotMatch(out.html, /A , metric|A — metric/);
  // md 동등.
  assert.match(out.md, /plan-implement verify/);
  assert.match(out.md, /metric pivot/);
});

test('lifecycle 없음 + 완료 없음 → null (기존 동작 보존)', () => {
  const model = makeModel();
  model.sources.receipts.items = [];
  const PRD_NONE = [
    '## Delivery Milestones',
    '',
    '| # | Milestone | Outcome | Status | Plan |',
    '| --- | --- | --- | --- | --- |',
    '| 1 | Active | o | in-progress | [.claude/plans/x.plan.md](../plans/x.plan.md) |',
    '',
  ].join('\n');
  const out = renderMilestoneHistory(model, formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_NONE), gitCommitTime: noGit,
  });
  assert.equal(out, null);
});
