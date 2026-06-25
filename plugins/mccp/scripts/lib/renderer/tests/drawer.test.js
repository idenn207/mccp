'use strict';

// v1.18.1 M3 — 우측 상세 드로어 acceptance gate.
// (1) drawer-detail 빌더 REQUIRED 필드 always-present + OPTIONAL degrade (Codex F1)
// (2) 안정 키 + 충돌 hard-fail (Codex F2)
// (3) serializer 유니코드 escape + 주입 경계 (Codex F3)
// (4) html 통합: dialog markup/aria-label/data-detail-id/ic-x + H18 등식 + script

const test = require('node:test');
const assert = require('node:assert');

const formatUtils = require('../format-utils');
const dd = require('../parsers/drawer-detail');
const { renderHtml } = require('../html');
const { runOutputConstraints } = require('../output-constraints');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');

// ── (1) 빌더 REQUIRED/OPTIONAL ────────────────────────────────────────────────

test('drawer — buildOQDetail REQUIRED 필드(질문/출처/섹션) present', () => {
  const d = dd.buildOQDetail({
    text: 'grace window vs single-use',
    source: '.claude/plans/auth.plan.md',
    headingPath: ['## Open Questions'],
    severity: 'MEDIUM',
    actionPrompt: '/mccp:plan "x"',
  }, formatUtils);
  assert.ok(d.title.includes('grace window'));
  assert.deepEqual(d.tags, [{ label: 'MEDIUM', tone: 'med' }]);
  const dts = d.rows.map((r) => r[0]);
  assert.ok(dts.includes('출처'));
  assert.ok(dts.includes('섹션'));
  assert.ok(dts.includes('관련 결정'));
  assert.equal(d.action, '/mccp:plan "x"');
});

test('drawer — buildRiskDetail REQUIRED(impact/likelihood/완화/결정) present, 완화 = section', () => {
  const d = dd.buildRiskDetail({
    risk: '토큰 회전 폭주',
    impact: '고',
    likelihood: '중',
    mitigation: 'canary 점진 회전',
    source: '.claude/plans/auth.plan.md',
    severity: 'HIGH',
  }, formatUtils);
  assert.ok(d.title.includes('토큰 회전'));
  assert.deepEqual(d.tags, [{ label: 'HIGH', tone: 'high' }]);
  const dts = d.rows.map((r) => r[0]);
  assert.ok(dts.includes('영향') && dts.includes('가능성') && dts.includes('관련 결정'));
  assert.ok(d.sections && d.sections[0][0] === '완화책');
  assert.ok(d.sections[0][1].includes('canary'));
});

test('drawer — 위험 시나리오/잔여 부재 = OPTIONAL degrade (placeholder 금지)', () => {
  // mitigation 없으면 sections 자체 생략 — 빈 section 만들지 않음.
  const d = dd.buildRiskDetail({ risk: 'x', impact: '고', likelihood: '저', source: 'p.plan.md' }, formatUtils);
  assert.equal(d.sections, undefined);
  // placeholder 문자열 부재
  assert.ok(!JSON.stringify(d).includes('TODO'));
  assert.ok(!JSON.stringify(d).includes('placeholder'));
});

test('drawer — buildReceiptDetail REQUIRED(결정/판정/round/시각/hash), briefing OPTIONAL', () => {
  const d = dd.buildReceiptDetail({
    gate: 'mccp-pr-codex', decision: 'realtime', convLabel: '수렴 R1', verdictText: '수렴 (round 1)',
    isBad: false, tone: 'low', round: 1, briefingText: '2.1k tok', relative: '12분 전', hashShort: '4e9c1a',
    briefingSummary: 'PR 게이트 수렴',
  }, formatUtils);
  const dts = d.rows.map((r) => r[0]);
  ['결정', '판정', 'round', 'briefing', '시각', 'receipt'].forEach((k) => assert.ok(dts.includes(k), 'missing ' + k));
  assert.ok(d.sections && d.sections[0][0] === '요약');
  // title 은 escape 된 안전 HTML(메타문자 무누출)
  assert.ok(!d.title.includes('<script'));
});

test('drawer — buildMilestoneDetail REQUIRED(plan/ship), 요약 OPTIONAL', () => {
  const withSummary = dd.buildMilestoneDetail(
    { name: '청구 집계', planBasename: 'billing.plan.md', relative: '4시간 전' },
    '사용량 이벤트 수집 파이프라인',
    formatUtils,
  );
  assert.ok(withSummary.rows.map((r) => r[0]).includes('plan'));
  assert.ok(withSummary.rows.map((r) => r[0]).includes('ship'));
  assert.ok(withSummary.sections[0][1].includes('사용량'));
  const noSummary = dd.buildMilestoneDetail({ name: 'x', planBasename: 'y.plan.md', relative: '어제' }, null, formatUtils);
  assert.equal(noSummary.sections, undefined);
});

// ── (2) 안정 키 + 충돌 hard-fail ──────────────────────────────────────────────

test('drawer — detailId 안정 키(인덱스 아님, planPath/lineNumber/ordinal/rowKey)', () => {
  assert.equal(dd.detailId('oq', { source: 'p.plan.md', lineNumber: 70 }), 'oq:p.plan.md#L70');
  assert.equal(dd.detailId('oq', { source: 'STATE.md', ordinal: 2 }), 'oq:STATE.md#o2');
  assert.equal(dd.detailId('risk', { source: 'p.plan.md', ordinal: 3 }), 'risk:p.plan.md#r3');
  assert.equal(dd.detailId('receipt', { rowKey: 'g|d|h' }), 'receipt:g|d|h');
  assert.equal(dd.detailId('ms', { planPath: '.claude/plans/x.plan.md' }), 'ms:.claude/plans/x.plan.md');
});

test('drawer — addDetail 충돌은 silent first-wins 아니라 ordinal suffix + collision=true', () => {
  const m = new Map();
  const a = dd.addDetail(m, 'risk:p#r0', { title: 'A' });
  const b = dd.addDetail(m, 'risk:p#r0', { title: 'B' });
  assert.equal(a.collision, false);
  assert.equal(b.collision, true);
  assert.notEqual(b.id, a.id); // 두 항목 모두 보존(B 가 first 를 덮어쓰지 않음)
  assert.equal(m.size, 2);
  assert.equal(m.get(a.id).title, 'A');
  assert.equal(m.get(b.id).title, 'B');
});

// ── (3) serializer 유니코드 escape + 주입 경계 ────────────────────────────────

test('drawer — serializeDetails 는 </script> break-out 차단(유니코드 escape)', () => {
  const m = new Map();
  m.set('oq:x#L1', { title: 'a </script><img onerror=alert(1)> b & "q"', rows: [['k', 'v with spaces']] });
  const s = dd.serializeDetails(m);
  assert.ok(!s.includes('</script'), 'no literal </script');
  assert.ok(!s.includes('<'), 'no raw <');
  assert.ok(!s.includes('>'), 'no raw >');
  assert.ok(!s.includes('&'), 'no raw &');
  // 일반 공백은 보존(LS/PS 만 escape — 정규식 오치환 가드)
  assert.ok(s.includes('v with spaces'));
  // JSON.parse 가 원문 복원
  const j = JSON.parse(s);
  assert.equal(j['oq:x#L1'].title, 'a </script><img onerror=alert(1)> b & "q"');
});

// ── (4) html 통합: dialog/aria-label/data-detail-id/ic-x + H18 ────────────────

function fakeFormat() { return formatUtils; }

function sectionWithDetails(kind, n) {
  const map = new Map();
  for (let i = 0; i < n; i += 1) {
    map.set(kind + ':k' + i, { title: kind + ' ' + i, rows: [['k', 'v']] });
  }
  return { html: '<ul>x</ul>', md: 'x', details: map };
}

function renderWith(details) {
  // sections 순서: [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory]
  const empty = { html: '', md: '' };
  const grid = { cells: [] };
  const sections = [
    grid, empty, null, null,
    details.timeline || empty,
    details.questions || empty,
    details.risks || empty,
    details.milestoneHistory || empty,
  ];
  const verdict = { tone: 'neutral', icon: '·', text: '대기' };
  return renderHtml({ masked: true }, sections, verdict, new Date('2026-06-24T00:00:00Z').toISOString(), fakeFormat());
}

test('drawer — html 에 <dialog aria-label> + ic-x symbol + drawer-data + DRAWER_SCRIPT', () => {
  const html = renderWith({ questions: sectionWithDetails('oq', 2) });
  assert.match(html, /<dialog class="drawer" id="drawer" aria-label="[^"]+">/);
  assert.ok(html.includes('id="ic-x"'), 'ic-x symbol present');
  assert.match(html, /<script type="application\/json" id="drawer-data">/);
  assert.ok(html.includes("aria-haspopup"), 'trigger gets aria-haspopup (DRAWER_SCRIPT)');
  assert.ok(html.includes('showModal'), 'native dialog showModal in script');
  // 주입 경계: rows/title 은 textContent. innerHTML 은 title/sections 만.
  assert.ok(html.includes('.textContent'), 'DOM-builder textContent path present');
});

test('drawer — H18 등식 통과(trigger==유일id==JSON키) on real-ish render', () => {
  // 섹션 html 에 data-detail-id 를 실제로 박아야 H18 trigger 카운트가 맞음.
  const map = new Map();
  map.set('oq:p#L1', { title: 'q1', rows: [] });
  map.set('oq:p#L2', { title: 'q2', rows: [] });
  const sec = {
    html: '<li class="li-item" data-detail-id="oq:p#L1">a</li>'
      + '<li class="li-item" data-detail-id="oq:p#L2">b</li>',
    md: '', details: map,
  };
  const html = renderWith({ questions: sec });
  const css = require('../html').TOKENS + require('../html').LAYOUT;
  const r = runOutputConstraints({ css, html, md: '' });
  assert.ok(!r.violations.includes('H18'), 'H18 passes: ' + JSON.stringify(r.details));
});

test('drawer — H18 fires on duplicate data-detail-id (Codex F2 — 단순 키존재 아님)', () => {
  // 같은 id 두 trigger + JSON 키 1개 → 등식 깨짐 → H18 fire.
  const map = new Map();
  map.set('oq:dup', { title: 'q', rows: [] });
  const sec = {
    html: '<li data-detail-id="oq:dup">a</li><li data-detail-id="oq:dup">b</li>',
    md: '', details: map,
  };
  const html = renderWith({ questions: sec });
  const css = require('../html').TOKENS + require('../html').LAYOUT;
  const r = runOutputConstraints({ css, html, md: '' });
  assert.ok(r.violations.includes('H18'), 'duplicate id must fire H18');
});

test('drawer — 반응형/reduced-motion CSS 존재(드로어 slide-in 대안)', () => {
  const css = require('../html').LAYOUT;
  assert.match(css, /\.drawer\b/);
  assert.match(css, /@starting-style/);
  assert.match(css, /prefers-reduced-motion/);
});

test('drawer — details 0건이면 dialog/drawer-data 미emit(빈 repo graceful)', () => {
  const html = renderWith({});
  assert.ok(!html.includes('<dialog'), 'no dialog when no details');
  assert.ok(!html.includes('drawer-data'), 'no drawer-data when no details');
});

// ── v1.18.7 M4 Task 4 — 메인 복사 버튼 클릭 ≠ 드로어 open (회귀 가드) ──
// jsdom-free 환경 → markup-level 가드 단언: (1) 위험/질문 li 가 data-detail-id(드로어
// trigger)이면서 내부 .copy-btn 을 가진다, (2) DRAWER_SCRIPT 의 click/keydown 핸들러가
// .copy-btn closest 시 open 을 skip 한다(신규 코드 0, 기존 가드 고정).
test('drawer — OQ/risk li 가 data-detail-id + 내부 copy-btn 동시 보유(가드 대상 nesting)', () => {
  const oq = renderOpenQuestions({ sources: {} }, formatUtils, {
    openQuestions: [{ source: 'p.plan.md', text: 'OQ-a 결정 (HIGH)', lineNumber: 5, headingPath: ['## Open Questions'] }],
  });
  const risk = renderRisks({ sources: {} }, formatUtils, {
    risks: [{ risk: 'data corruption', impact: 'High', likelihood: 'Medium', mitigation: 'fsync' }],
  });
  // li-item(data-detail-id) 안에 li-action > copy-btn 이 들어있어야 함(드로어 trigger 내부 복사).
  assert.match(oq.html, /<li class="li-item" data-detail-id="[^"]+">[\s\S]*?class="copy-btn"[\s\S]*?<\/li>/, 'OQ li nests copy-btn');
  assert.match(risk.html, /<li class="li-item" data-detail-id="[^"]+">[\s\S]*?class="copy-btn"[\s\S]*?<\/li>/, 'risk li nests copy-btn');
});

test('drawer — DRAWER_SCRIPT 가 .copy-btn closest 시 open skip(클릭·키보드 양쪽)', () => {
  const html = renderWith({ questions: sectionWithDetails('oq', 2) });
  // click 가드 + keydown 가드 모두 .copy-btn closest 검사 후 open skip.
  assert.ok(html.includes(".closest('.copy-btn')"), '.copy-btn closest 가드 present');
  // click 핸들러: copy-btn closest 면 return(open 미호출).
  assert.match(html, /addEventListener\('click',function\(e\)\{if\(e\.target\.closest&&e\.target\.closest\('\.copy-btn'\)\)return;open\(/, 'click 가드 → open skip');
  // keydown 핸들러: Enter/Space 라도 copy-btn closest 면 open 미호출.
  assert.match(html, /keydown[\s\S]*?\.copy-btn[\s\S]*?open\(/, 'keydown 가드 → open skip');
});
