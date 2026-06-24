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
  // 완료 기록 메인 + lifecycle 토글.
  assert.match(out.html, /Done one/);
  assert.match(out.html, /미진행 마일스톤 2건 · 표시/);
  // 비-색 이중표기 마커.
  assert.match(out.html, /◌/);
  assert.match(out.html, /⊘/);
  assert.match(out.html, /예정/);
  assert.match(out.html, /폐기/);
  // md 동등.
  assert.match(out.md, /미진행 마일스톤 2건 · 표시/);
  assert.match(out.md, /◌ 예정 · Future one/);
  assert.match(out.md, /⊘ 폐기 · Killed one/);
});

test('lifecycle 토글 — default-collapsed (open 속성 없음)', () => {
  const out = renderMilestoneHistory(makeModel(), formatUtils, {}, {
    cwd: CWD, fsRead: fsReadPrd(PRD_MIXED), gitCommitTime: noGit,
  });
  // 미진행 토글 summary 직전 details 가 open 아님.
  const idx = out.html.indexOf('미진행 마일스톤');
  const detailsOpen = out.html.lastIndexOf('<details', idx);
  const tag = out.html.slice(detailsOpen, idx);
  assert.equal(/\bopen\b/.test(tag), false, 'lifecycle details default 닫힘');
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
  assert.match(out.html, /미진행 마일스톤 2건 · 표시/);
  // 완료 기록 ul 없음(merged 0).
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
