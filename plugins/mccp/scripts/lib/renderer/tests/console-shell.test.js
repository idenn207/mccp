'use strict';

// v1.17.0 (dashboard-console-redesign M1) — 승인된 dashboard-sample.html 콘솔 셸
// 이식 fidelity 회귀 가드. 셸 chrome(스위처/검색/pin-alert/topbar 브레드크럼/중앙
// page-title/Lucide 스프라이트/panel head·body·foot)과 H-invariant 개정(H2/H3/H13)
// drift 가드를 mechanical 로 고정. 섹션 내부 마크업·실데이터 추출은 M2, 드로어는 M3.

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderHtml } = require('../html');
const { runOutputConstraints } = require('../output-constraints');
const { TOKENS, LAYOUT } = require('../html');
const formatUtils = require('../format-utils');

const BASELINE_CSS = TOKENS + LAYOUT;
const ISO = new Date().toISOString();
const NEUTRAL_VERDICT = { tone: 'neutral', icon: '·', text: '진행 중' };

// grid 섹션은 .cells 배열을 노출(hero meta + pin-alert wiring 의 입력원).
function gridSection(cells) {
  return { md: '', html: '', cells: cells || [] };
}

function render(model, sections, verdict) {
  return renderHtml(model || {}, sections || [null, null, null, null, null, null, null, null],
    verdict || NEUTRAL_VERDICT, ISO, formatUtils);
}

// ── 사이드바 셸 ──────────────────────────────────────────────────────────
test('console-shell — sidebar has switcher (project name + mccp badge + chevron)', () => {
  const html = render({ repo_root: '/x/project-idenn' }, [gridSection([])]);
  assert.match(html, /<aside class="sidebar"[^>]*>/);
  assert.match(html, /<div class="switcher">[\s\S]*?<span class="sw-mark">/);
  assert.match(html, /<span class="sw-name">project-idenn<\/span>/);
  assert.match(html, /<span class="sw-badge">mccp<\/span>/);
});

test('console-shell — sidebar search affordance present (static — 실검색 범위 밖)', () => {
  const html = render({}, [gridSection([])]);
  assert.match(html, /<div class="search"[^>]*>[\s\S]*?<span class="kbd">F<\/span>/);
});

test('console-shell — nav-rail wires routes with Lucide icons (risks/questions split)', () => {
  // M3-b — 위험·질문 단일 entry → 위험 + 미해결 질문 2 entry. questions(idx 5) present
  // 시 미해결 질문 nav entry 렌더. sections: [grid,pipeline,fanout,active,timeline,questions,risks,ms]
  const panel = (html) => ({ md: '', html, cells: [] });
  const html = render({}, [gridSection([]), null, null, null, panel('<p>tl</p>'), panel('<p>oq</p>'), panel('<p>rk</p>'), null]);
  assert.match(html, /<nav class="nav-rail" aria-label="페이지">/);
  for (const route of ['overview', 'pipeline', 'risks', 'questions', 'activity']) {
    assert.match(html, new RegExp('<a class="nav-link" data-route="' + route + '"'));
  }
  assert.match(html, /<use href="#ic-dashboard"\/>/);
  assert.match(html, /<use href="#ic-branch"\/>/);
});

// ── 위험 / 미해결 질문 전용 route (M3-b — 사용자 결정 2026-06-25 "전용 사이드바".
//    단일 attention route 를 위험·미해결-질문 2 route 로 분리. 패널 내 active/완화됨 탭) ──
test('console-shell — 위험 / 미해결 질문 are separate routes (M3-b split)', () => {
  // sections 인덱스: [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory]
  const panel = (html) => ({ md: '', html: html, cells: [] });
  const html = render(
    {},
    [gridSection([]), null, null, null, panel('<p>tl</p>'), panel('<p>oq</p>'), panel('<p>rk</p>'), null]
  );
  // 위험 route 가 존재하고 nav/tb-title wired.
  assert.match(html, /<section class="route" id="route-risks"[^>]*>/);
  assert.match(html, /<a class="nav-link" data-route="risks" href="#route-risks">/);
  assert.match(html, /<span class="tb-title" data-t="risks">위험<\/span>/);
  // 미해결 질문 route 가 별도 route 로 존재.
  assert.match(html, /<section class="route" id="route-questions"[^>]*>/);
  assert.match(html, /<a class="nav-link" data-route="questions" href="#route-questions">/);
  assert.match(html, /<span class="tb-title" data-t="questions">질문<\/span>/);
  // 위험 panel-title 은 route-risks 안, 질문 panel-title 은 route-questions 안.
  const riskBlock = html.slice(html.indexOf('id="route-risks"'), html.indexOf('id="route-questions"'));
  assert.match(riskBlock, /<h3 class="panel-title">위험<\/h3>/);
  const qBlock = html.slice(html.indexOf('id="route-questions"'), html.indexOf('id="route-activity"'));
  assert.match(qBlock, /<h3 class="panel-title">질문<\/h3>/);
});

// ── 차단 pin-alert (기존 grid blocked 신호로 조건부) ─────────────────────
test('console-shell — pin-alert renders when blocked count > 0', () => {
  const html = render({}, [gridSection([{ key: 'blocked', label: '차단', value: '2', accent: 'blocked' }])]);
  assert.match(html, /<div class="pin-alert">/);
  assert.match(html, /차단 2건/);
  assert.match(html, /<a class="pa-btn" href="#route-pipeline">/);
});

test('console-shell — pin-alert hidden when blocked count is 0', () => {
  const html = render({}, [gridSection([{ key: 'blocked', label: '차단', value: '0', accent: 'blocked' }])]);
  assert.doesNotMatch(html, /class="pin-alert"/);
});

// ── 상단바 (브레드크럼 + 중앙 page-title + freshness) ────────────────────
test('console-shell — topbar has breadcrumb + center page titles + freshness', () => {
  const html = render({ repo_root: '/x/project-idenn' }, [gridSection([])]);
  assert.match(html, /<header class="topbar">/);
  assert.match(html, /<div class="crumb">[\s\S]*?<b>project-idenn<\/b><span class="sep">\/<\/span><span>상태<\/span>/);
  assert.match(html, /<span class="tb-title" data-t="overview">대시보드<\/span>/);
  assert.match(html, /<span class="tb-title" data-t="pipeline">/);
  assert.match(html, /<span class="tb-title" data-t="activity">/);
  assert.match(html, /<span class="freshness">[\s\S]*?갱신/);
});

test('console-shell — backdrop-filter only on dialog ::backdrop scrim (H7 carve-out, chrome clean)', () => {
  // v1.18.1 M3 — 드로어 ::backdrop scrim 의 blur 는 H7 carve-out(의도된 overlay).
  // ::backdrop rule block 을 strip 하면 일반 chrome(topbar 등)엔 backdrop-filter 0.
  const scrubbed = BASELINE_CSS.replace(/[^{}]*::backdrop[^{}]*\{[^}]*\}/g, '');
  assert.doesNotMatch(scrubbed, /backdrop-filter|backdrop-blur/);
});

// ── Lucide 스프라이트 (inline, 외부 fetch 0) ────────────────────────────
test('console-shell — Lucide symbol sprite inlined once', () => {
  const html = render({}, [gridSection([])]);
  assert.match(html, /<svg width="0" height="0"[^>]*aria-hidden="true"><defs>/);
  assert.match(html, /<symbol id="ic-terminal" viewBox="0 0 24 24">/);
  // sprite 는 1회만 emit
  assert.equal((html.match(/id="ic-terminal"/g) || []).length, 1);
});

// ── panel head/body/foot anatomy + canonical title 단일 ─────────────────
test('console-shell — panels use head/body anatomy with single canonical title', () => {
  const sections = [
    gridSection([]), null, null, null,
    { md: '', html: '<ol class="tl-rail"><li>x</li></ol>' }, // timeline (always present)
    null,
    { md: '', html: '<ul><li>r</li></ul>' }, // risks (always present)
    null,
  ];
  const html = render({}, sections, { tone: 'red', icon: '🚫', text: '차단' });
  // panel-head > panel-title anatomy
  assert.match(html, /<div class="panel-head"><svg class="i"[^>]*><use href="#[a-z-]+"\/><\/svg><h3 class="panel-title">/);
  assert.match(html, /<div class="panel-body">/);
  // 패널당 canonical title 단일 — 각 panel 섹션에 h3 는 정확히 1개(panel-title).
  // 활동 route 의 panel 들에 leftover bare <h3> 가 없어야 함.
  const panelBlocks = html.match(/<section class="panel[^"]*"[^>]*>[\s\S]*?<\/section>/g) || [];
  assert.ok(panelBlocks.length > 0, 'at least one panel rendered');
  for (const block of panelBlocks) {
    const titleCount = (block.match(/<h3 class="panel-title">/g) || []).length;
    assert.equal(titleCount, 1, 'exactly one panel-title per panel');
    // bare <h3> (panel-title 외) 없음
    const bareH3 = (block.match(/<h3(?! class="panel-title")/g) || []).length;
    assert.equal(bareH3, 0, 'no bare <h3> outside panel-title');
  }
});

test('console-shell — overview hero panel holds verdict (M2 hero-status + verdict)', () => {
  const html = render({}, [gridSection([])], { tone: 'red', icon: '🚫', text: '차단' });
  assert.match(html, /<section class="route" id="route-overview"[^>]*><section class="hero-panel[^"]*" aria-label="판정"><span class="hero-status">/);
  assert.match(html, /<h1 class="verdict s-red">/);
});

// ── H-invariant 개정 drift 가드 (Codex Plan-Codex R1 F1+F3) ─────────────
test('drift — H3 still FIRES on generic layout chrome radius (anti-slop guard kept)', () => {
  for (const sel of ['section', 'div', '.topbar', '.sidebar', '.content']) {
    const out = runOutputConstraints({ css: BASELINE_CSS + '\n' + sel + ' { border-radius: 6px; }', html: '', md: '' });
    assert.ok(out.violations.includes('H3'), 'H3 must fire on ' + sel + ' radius');
  }
});

test('drift — H3 does NOT fire on sample affordance classes (carve-out)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H3'), 'baseline shell radius is carved');
});

test('drift — H13 FIRES on external fetch surface, PASSES self-contained', () => {
  const ext = runOutputConstraints({ css: BASELINE_CSS, html: '<body><link rel="stylesheet" href="https://cdn.x/y.css"></body>', md: '' });
  assert.ok(ext.violations.includes('H13'), 'external link fires H13');
  const clean = runOutputConstraints({ css: BASELINE_CSS, html: '<body><svg><use href="#ic-x"/></svg></body>', md: '' });
  assert.ok(!clean.violations.includes('H13'), 'inline + local fragment passes');
});

test('drift — H2 FIRES above 1080 ceiling, PASSES at/below', () => {
  const over = runOutputConstraints({ css: ':root{--content-max:1200px;}', html: '', md: '' });
  assert.ok(over.violations.includes('H2'));
  const at = runOutputConstraints({ css: ':root{--bg:oklch(0.15 0 0);--content-max:1080px;}@media (prefers-color-scheme: light){:root{--bg:oklch(0.99 0 0);}}', html: '', md: '' });
  assert.ok(!at.violations.includes('H2'));
});
