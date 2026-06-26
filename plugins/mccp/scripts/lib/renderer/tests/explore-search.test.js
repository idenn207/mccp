'use strict';

// Dashboard Data Exploration M3 — 검색 wiring + 멀티세션 잔여축 렌더 회귀.
// (a) 검색 <form>/<input type=search> 마크업 + .js-only + role=search + aria + kbd 제거 + live-region
// (b) nav-link .nav-search-count 슬롯
// (c) 멀티세션 바 마크업(data-explore-scope=session) + status/worktree/진행순 select
// (d) <tr> data-status/data-worktree/data-progress-rank/data-activity-ord
// (e) emit gate 확장 — 검색 타겟만 있고(prd-group/explore-bar 부재) explore <script> emit
// (f) no-JS degrade(script 제거 후 전체 항목 가시)
// (g) design-lint clean(H16 data-worktree carve-out + H19 network primitive 0)
// (h) Codex F1 회귀 — 폼 action 부재 + inline explore.js submit→preventDefault 보유
// (i) Codex F2 회귀 — 검색 wiring guard 가 bars.length 비종속(if (!EX) return) + 타겟만 fixture
// (j) Codex Impl R1 IF1 — data-js="on" 은 EX 확인 *후* set(degraded-dep dead-UI 차단)
// (k) Codex Impl R1 IF2 — M2 바 컨트롤러는 세션 scope 제외, 세션 컨트롤러만 세션 scope 소유

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');
const { runOutputConstraints } = require('../output-constraints');

const NOW = 1700000000000;

// 2 PRD × (위험·질문) + 멀티세션 worktrees 2행(blocked + active). 검색·잔여축 동시 검증.
function fullModel() {
  return {
    derived_at: new Date(0).toISOString(),
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
      worktrees: {
        scanned: true,
        count: 2,
        items: [
          { path: '/repo', branch: 'main', is_self: true, active: true,
            milestone_hint: 'M3', last_activity: new Date(NOW - 60000).toISOString() },
          { path: '/wt/feat-x', branch: 'feat-x', blocked: true, blocked_reason: 'fix-task',
            last_activity: new Date(NOW - 1000).toISOString() },
        ],
      },
    },
    correlations: [],
  };
}
const PRD1 = '# 데이터 탐색 PRD\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n'
  + '|---|---|---|---|---|\n| 1 | M1 | x | in-progress | [p1](.claude/plans/p1.plan.md) |\n';
const PRD2 = '# 멀티세션 PRD\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n'
  + '|---|---|---|---|---|\n| 1 | M1 | x | in-progress | [p2](.claude/plans/p2.plan.md) |\n';
const PLAN1 = '# p1\n\n## Open Questions\n\n- 질문 A1 (HIGH)\n\n## Risks\n\n'
  + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n'
  + '| 낮은위험 P1 | Low | Low | m |\n| 높은위험 P1 | High | High | m |\n';
const PLAN2 = '# p2\n\n## Open Questions\n\n- 질문 B1 (HIGH)\n\n## Risks\n\n'
  + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| 위험 B1 | High | High | m |\n';
function fullRead(p) {
  const s = String(p).replace(/\\/g, '/');
  if (s.endsWith('prd1.prd.md')) return PRD1;
  if (s.endsWith('prd2.prd.md')) return PRD2;
  if (s.endsWith('p1.plan.md')) return PLAN1;
  if (s.endsWith('p2.plan.md')) return PLAN2;
  throw new Error('ENOENT ' + p);
}
function renderFull() {
  return renderStatus(fullModel(), { cwd: '/repo', fsRead: fullRead, snapshotsDir: null, now: NOW });
}

// 검색 타겟만(질문 1건, prd-group/explore-bar 부재) — emit gate F2 + 검색 wiring 도달.
function targetOnlyModel() {
  return {
    derived_at: new Date(0).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: { items: [{ path: '.claude/plans/solo.plan.md' }] },
      receipts: { items: [] },
      state: { item: { body: { open_questions: ['단독 질문 S1'] } } },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
}
function targetOnlyRead(p) {
  // solo plan 은 risk/oq 없음 → 질문은 state open_questions(전역) 단독.
  if (String(p).replace(/\\/g, '/').endsWith('solo.plan.md')) return '# solo\n';
  throw new Error('ENOENT ' + p);
}
function renderTargetOnly() {
  return renderStatus(targetOnlyModel(), { cwd: '/repo', fsRead: targetOnlyRead, snapshotsDir: null, now: NOW });
}

// ── (a) 검색 폼 마크업 ──────────────────────────────────────────────────────

test('(a) 사이드바 검색 — <form role=search js-only> + <input type=search> + aria + kbd 제거', () => {
  const r = renderFull();
  assert.match(r.html, /<form class="search js-only" role="search" aria-label="항목 검색">/);
  assert.match(r.html, /<input type="search" class="search-input" aria-label="항목 검색"[^>]*placeholder="찾기…"[^>]*>/);
  assert.ok(!/<span class="kbd">F<\/span>/.test(r.html), 'kbd "F" 단축키 힌트 제거');
  // 전역 sr-only live-region.
  assert.match(r.html, /<p class="search-status sr-only" role="status" aria-live="polite">/);
});

// ── (b) nav-search-count 슬롯 ───────────────────────────────────────────────

test('(b) nav-link 에 .nav-search-count 슬롯(빈, JS 가 채움)', () => {
  const r = renderFull();
  const slots = (r.html.match(/<span class="nav-search-count"><\/span>/g) || []).length;
  assert.ok(slots >= 4, 'nav-link 각각에 검색 슬롯: ' + slots);
});

// ── (c) 멀티세션 바 마크업 ──────────────────────────────────────────────────

test('(c) 멀티세션 진행 바 — data-explore-scope=session + worktree/진행순 select', () => {
  const r = renderFull();
  assert.match(r.html, /<div class="explore-bar js-only" role="group" aria-label="멀티세션 필터 및 정렬" data-explore-scope="session">/);
  assert.match(r.html, /data-axis="worktree" aria-label="worktree 필터"/);
  // status 는 2 worktree 가 blocked+active(distinct) → status select 도 렌더.
  assert.match(r.html, /data-axis="status" aria-label="진행상태 필터"/);
  assert.match(r.html, /<select class="ex-select ex-sort" data-axis="sort" aria-label="정렬"><option value="progress">진행순<\/option><\/select>/);
  // 세션 바도 panel-head-tools 통합 + sr-only count.
  assert.match(r.html, /class="panel-head panel-head-tools"[\s\S]{0,400}?data-explore-scope="session"/);
});

// ── (d) 멀티세션 행 data 속성 ──────────────────────────────────────────────

test('(d) <tr> data-status/data-worktree/data-progress-rank/data-activity-ord', () => {
  const r = renderFull();
  const trs = (r.html.match(/<tr[^>]*data-status="[^"]*"[^>]*>/g) || []);
  assert.equal(trs.length, 2, '2 worktree 행 모두 data 속성');
  const blocked = trs.find((t) => /data-status="blocked"/.test(t));
  assert.ok(blocked, 'blocked 행 존재');
  assert.match(blocked, /data-progress-rank="3"/, 'blocked rank=3');
  assert.match(blocked, /data-worktree="feat-x"/);
  assert.match(blocked, /data-activity-ord="\d+"/);
  const self = trs.find((t) => /class="self"/.test(t));
  assert.match(self, /data-status="active"/, 'self active');
  assert.match(self, /data-progress-rank="1"/, 'active rank=1');
});

// ── (e) emit gate 확장 (F2) ─────────────────────────────────────────────────

test('(e) F2 emit gate — 검색 타겟만(prd-group/explore-bar 부재) 이어도 explore <script> emit', () => {
  const r = renderTargetOnly();
  assert.ok(!r.html.includes('class="prd-group"'), 'prd-group 부재');
  assert.ok(!r.html.includes('class="explore-bar js-only"'), 'explore-bar 부재(질문 1건·필터 옵션<2)');
  assert.ok(r.html.includes('class="li-item"'), '검색 타겟 .li-item 존재');
  // emit gate(hasSearchTargets) — explore 엔진 스크립트 emit.
  assert.ok(r.html.includes('window.__mccpExplore'), 'explore-sort.js emit');
  assert.ok(r.html.includes('.search-input'), '검색 input 마크업 + 엔진 셀렉터 동시 존재');
});

// ── (f) no-JS degrade ──────────────────────────────────────────────────────

test('(f) no-JS degrade — script 제거 후 전체 항목 + 멀티세션 행 가시', () => {
  const r = renderFull();
  const noScript = r.html.replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const t of ['낮은위험 P1', '높은위험 P1', '위험 B1', '질문 A1', '질문 B1']) {
    assert.ok(noScript.includes(t), 'JS 제거 후 항목 손실: ' + t);
  }
  // 멀티세션 행도 평문 가시(테이블 자체는 항상 렌더, 바만 .js-only).
  assert.ok(noScript.includes('feat-x'), 'worktree 행 가시');
});

// ── (g) design-lint clean ───────────────────────────────────────────────────

test('(g) H16/H19 clean — data-worktree carve-out + inline 엔진 network primitive 0', () => {
  const r = renderFull();
  assert.deepEqual(r.design_constraint_violations, [],
    'violations: ' + JSON.stringify(r.design_constraint_violations));
  // data-worktree 브랜치명에 _ 가 있어도 H16 bold-underscore 미발화(carve-out).
  const r2 = renderStatus(Object.assign(fullModel(), {}), { cwd: '/repo', fsRead: fullRead, snapshotsDir: null, now: NOW });
  const oc = runOutputConstraints({ css: r2.css || '', html: r2.html, md: r2.md });
  assert.ok(!oc.violations.includes('H19'), 'inline 엔진 H19 clean');
});

test('(g) H16 data-worktree carve-out — branch 명 paired-underscore false-positive 0', () => {
  // data-worktree="v1_18_x" 류 값이 H16 bold-underscore 로 오탐되지 않음.
  const m = fullModel();
  m.sources.worktrees.items[1].branch = 'v1_18_x_feature';
  const r = renderStatus(m, { cwd: '/repo', fsRead: fullRead, snapshotsDir: null, now: NOW });
  assert.match(r.html, /data-worktree="v1_18_x_feature"/);
  assert.deepEqual(r.design_constraint_violations, [],
    'underscore branch carve-out clean: ' + JSON.stringify(r.design_constraint_violations));
});

// ── (h) Codex F1 — 폼 submit no-navigate ───────────────────────────────────

test('(h) F1 — 검색 <form> action/method 부재 + inline explore.js submit→preventDefault', () => {
  const r = renderFull();
  const form = r.html.match(/<form class="search js-only"[^>]*>/)[0];
  assert.ok(!/\saction=/.test(form), '폼 action 미지정');
  assert.ok(!/\smethod=/.test(form), '폼 method 미지정');
  // inline explore.js 소스 스캔 — submit 리스너 + preventDefault(Enter no-navigate).
  assert.ok(r.html.includes("addEventListener('submit'"), 'submit 리스너 바인딩');
  assert.ok(r.html.includes('e.preventDefault()'), 'preventDefault 보유');
});

// ── (i) Codex F2 — 검색 wiring guard 비-bars.length 종속 ─────────────────────

test('(i) F2 — init guard 가 bars.length 비종속(if (!EX) return) + 검색 wiring 독립', () => {
  const r = renderFull();
  // guard 가 EX 만 검사(M2 의 !bars.length early-return 제거).
  assert.ok(r.html.includes('if (!EX) return;'), 'guard 는 EX 만 검사');
  assert.ok(!r.html.includes('!EX || !bars.length'), 'M2 의 bars.length early-return 제거');
  // M2 리스트 바는 세션 scope 제외 셀렉터로 분리(IF2).
  assert.ok(r.html.includes(':not([data-explore-scope="session"])'), 'M2 바 셀렉터가 세션 제외');
});

// ── (j) Codex Impl R1 IF1 — data-js 는 EX 확인 후 set ───────────────────────

test('(j) IF1 — data-js="on" 은 EX guard *뒤* set(degraded-dep dead-UI 차단)', () => {
  const r = renderFull();
  // inline 스크립트 본문 추출(explore.js — window.__mccpExplore 정의 *뒤* 의 엔진).
  const guardIdx = r.html.indexOf('if (!EX) return;');
  const setJsIdx = r.html.indexOf("setAttribute('data-js', 'on')");
  assert.ok(guardIdx > -1 && setJsIdx > -1, 'guard + data-js set 둘 다 존재');
  assert.ok(guardIdx < setJsIdx, 'if (!EX) return 이 data-js set *앞* — EX 부재 시 .js-only 숨김 유지');
});

// ── (k) Codex Impl R1 IF2 — 세션 바 소유권 분리 ─────────────────────────────

test('(k) IF2 — M2 컨트롤러는 세션 scope 제외, 세션 컨트롤러만 [data-explore-scope=session] 소유', () => {
  const r = renderFull();
  // M2 바 루프 셀렉터(:not session) + 세션 바 루프 셀렉터([session]) 둘 다 소스에 존재.
  assert.ok(r.html.includes('.explore-bar:not([data-explore-scope="session"])'), 'M2 바 셀렉터');
  assert.ok(r.html.includes('.explore-bar[data-explore-scope="session"]'), '세션 바 셀렉터');
  // 세션 sort 기본값은 progress(severity 아님 — IF2 무효 mode 회귀).
  assert.ok(r.html.includes("sortSel.value === 'progress'"), '세션 pristine 판정이 progress');
});
