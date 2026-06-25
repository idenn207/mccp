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

test('lifecycle 토글 — 완료 기록 + pending/dropped 공존', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_MIXED), gitCommitTime: noGit,
  });
  assert.ok(out, 'section 렌더됨');
  // M6 Task 3 — 완료 패널 + 미진행 탭(buildTabs). 완료 1 / 미진행 2.
  assert.match(out.html, /Done one/);
  assert.match(out.html, /완료 <span class="tab-count">1<\/span>/);
  assert.match(out.html, /미진행 <span class="tab-count">2<\/span>/);
  // 비-색 이중표기 마커.
  assert.match(out.html, /◌/);
  assert.match(out.html, /⊘/);
  assert.match(out.html, /예정/);
  assert.match(out.html, /폐기/);
  // md 는 기존 <details> 토글 plain-text 유지(탭은 HTML CSS 전용).
  assert.match(out.md, /미진행 마일스톤 2건 · 표시/);
  assert.match(out.md, /◌ 예정 · Future one/);
  assert.match(out.md, /⊘ 폐기 · Killed one/);
});

test('lifecycle 탭 — 미진행 default-미선택 (완료 탭 default, M6 Task 3)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_MIXED), gitCommitTime: noGit,
  });
  // 완료(merged>0) 가 default-checked, 미진행 탭 radio 는 미선택(기본 접힘 등가).
  assert.match(out.html, /id="tab-milestones-done"[^>]*checked/);
  assert.doesNotMatch(out.html, /id="tab-milestones-lifecycle"[^>]*checked/);
});

test('lifecycle — pending/dropped 는 data-detail-id 없음 (H18 무영향)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_MIXED), gitCommitTime: noGit,
  });
  // lifecycle li 는 ms-lifecycle 클래스 + data-detail-id 미부여.
  const lifeMatch = out.html.match(/<li class="milestone-item ms-lifecycle"[^>]*>/g) || [];
  assert.equal(lifeMatch.length, 2);
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
  // M6 Task 3 — merged 0 + lifecycle 2 → 완료(0, 미선택)·미진행(2, default-checked) 탭.
  assert.match(out.html, /미진행 <span class="tab-count">2<\/span>/);
  assert.match(out.html, /id="tab-milestones-lifecycle"[^>]*checked/);
  // 완료 기록 ul 없음(merged 0) — 완료 탭은 empty-state.
  assert.equal(/ic-check/.test(out.html), false, '완료 체크 항목 없음');
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
