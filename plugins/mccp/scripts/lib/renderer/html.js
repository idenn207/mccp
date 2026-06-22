'use strict';

const fs = require('fs');
const path = require('path');

// v1.13.0 — vendored-inline jQuery (slim, no ajax/effects). Read once at module
// load + embedded inline (NEVER an external <script src> — Codex F2 trust
// boundary: status.html can carry raw unmasked data, so no third-party origin).
// fail-open: if the vendor file is missing, the pipeline baseline still renders
// (progressive enhancement — JS layer is additive, never required).
const JQUERY_SLIM = (function () {
  try {
    return fs.readFileSync(path.join(__dirname, 'vendor', 'jquery-3.7.1.slim.min.js'), 'utf8');
  } catch (_) {
    return '';
  }
})();

// Pipeline enhancement (jQuery): node tooltips + focusable rows. Additive only —
// baseline is fully visible/legible without this. No visibility-gating animation
// (a hidden-tab transition must never leave a node blank).
const PIPELINE_SCRIPT = "jQuery(function($){"
  + "$('.pipe-node').each(function(){var n=$(this),s=n.find('.pipe-stage').text(),t=n.find('.sr-only').text();if(s&&t)n.attr('title',s+': '+t);});"
  + "$('.pipe-row').attr('tabindex','0').on('mouseenter focus',function(){$(this).addClass('pipe-row-hot');}).on('mouseleave blur',function(){$(this).removeClass('pipe-row-hot');});"
  // v1.14.0 — 활동 step-chart row enhancement (additive; baseline 은 JS 없이 동작).
  + "$('.tl-step').attr('tabindex','0').on('mouseenter focus',function(){$(this).addClass('tl-row-hot');}).on('mouseleave blur',function(){$(this).removeClass('tl-row-hot');});"
  + "});";

// v1.16.0 (dashboard-pipeline-chart M3) — full redesign: 다크 default 파이프라인
// 콘솔. 좌측 섹션 nav 레일 + 우측 목적 있는 비중첩 카드(Vercel 베이스). light 는
// prefers-color-scheme opt-in. 컴포넌트 클래스(.pipe-*/.tl-*/.oq-item/.risk-item/
// .severity-tag/.s-*/.milestone-* 등)는 섹션 모듈 contract 라 보존 — 변경은 토큰 +
// 컨테이너 레이아웃 + 카드 + 반응형으로 한정.
const OKLCH_DARK = `
:root {
  --bg: oklch(0.145 0.008 250);
  --surface: oklch(0.185 0.010 250);
  --card: oklch(0.195 0.010 250);
  --card-border: oklch(0.30 0.013 250);
  --border: oklch(0.27 0.012 250);
  --ink: oklch(0.95 0.005 250);
  --ink-2: oklch(0.82 0.008 250);
  --muted: oklch(0.66 0.012 250);
  --accent: oklch(0.72 0.16 230);
  --status-blocked: oklch(0.70 0.20 25);
  --status-stale: oklch(0.80 0.15 80);
  --status-secret: oklch(0.70 0.22 25);
  --status-worker-alive: oklch(0.72 0.16 145);
  --status-worker-stale: oklch(0.80 0.15 80);
  --sidebar-width: 13.5rem;
  --content-max: 820px;
  --card-radius: 12px;
  --card-shadow: 0 1px 2px oklch(0 0 0 / 0.28), 0 1px 1px oklch(0 0 0 / 0.18);
  --card-shadow-hover: 0 4px 12px oklch(0 0 0 / 0.32), 0 2px 4px oklch(0 0 0 / 0.20);
}`;

const OKLCH_LIGHT = `
@media (prefers-color-scheme: light) {
  :root {
    --bg: oklch(0.99 0 0);
    --surface: oklch(0.975 0.003 250);
    --card: oklch(1 0 0);
    --card-border: oklch(0.90 0.006 250);
    --border: oklch(0.92 0.005 250);
    --ink: oklch(0.20 0.005 250);
    --ink-2: oklch(0.32 0.006 250);
    --muted: oklch(0.45 0.008 250);
    --accent: oklch(0.55 0.18 230);
    --status-blocked: oklch(0.55 0.18 25);
    --status-stale: oklch(0.62 0.15 80);
    --status-secret: oklch(0.50 0.22 25);
    --status-worker-alive: oklch(0.55 0.15 145);
    --status-worker-stale: oklch(0.62 0.15 80);
    --card-shadow: 0 1px 2px oklch(0.55 0.01 250 / 0.10), 0 1px 1px oklch(0.55 0.01 250 / 0.06);
    --card-shadow-hover: 0 4px 12px oklch(0.55 0.01 250 / 0.14), 0 2px 4px oklch(0.55 0.01 250 / 0.10);
  }
}`;

const LAYOUT = `
* { box-sizing: border-box; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  color: var(--ink);
  background: var(--bg);
  margin: 0;
  padding: 0;
  line-height: 1.55;
  font-size: 15px;
  /* Vercel 앱 셸: 좌측 사이드바(좌단 full-bleed) + 메인 컬럼. body 가 그리드. */
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  align-items: start;
}
code, .mono { font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace; font-size: 0.92em; color: var(--ink-2); }
.sr-only {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%);
  white-space: nowrap; border: 0; padding: 0; margin: -1px;
}
.skip-link:focus-visible {
  position: fixed; top: 0.25rem; left: 0.25rem;
  clip: auto; clip-path: none; width: auto; height: auto;
  margin: 0; padding: 0.4rem 0.75rem;
  background: var(--accent); color: var(--bg);
  z-index: 60; outline: 2px solid var(--bg); outline-offset: 2px;
  text-decoration: none; border-radius: 3px;
}
/* ── 좌측 사이드바 — 뷰포트 좌단 full-bleed + full-height sticky. header 와
   독립(header scroll 과 무관) — 위: 목차, 아래(고정): 현황 4축. ──────────── */
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem 0.85rem 1.25rem;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--surface);
  font-size: 0.875rem;
}
/* ── 메인 컬럼 — header(상단) + 콘텐츠 + footer. 스크롤 영역. ──────────────── */
.main-col { min-width: 0; display: flex; flex-direction: column; min-height: 100vh; }
/* Header (메인 컬럼 내부, static — 스크롤되어 사라져도 사이드바/status 영향 없음). */
header {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0.85rem 1.75rem;
  transition: border-color 240ms ease-out;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
body[data-stale="1"] header { border-bottom-color: var(--status-stale); }
header .brand { font-weight: 600; font-size: 1rem; letter-spacing: -0.01em; }
header .meta { color: var(--muted); font-size: 0.8125rem; margin-left: auto; }
header .meta .stale-suffix { display: none; }
body[data-stale="1"] header .meta .stale-suffix { display: inline; margin-left: 0.25rem; color: var(--status-stale); }
.content {
  min-width: 0;
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem 1.75rem 4rem;
}
main:focus { outline: none; }
/* 앵커 점프 시 콘텐츠가 viewport 최상단에 딱 붙지 않도록 여백 확보. */
section[id], .verdict-banner { scroll-margin-top: 1.5rem; }
/* 목차(nav) — plain 텍스트, 현재 섹션 active. 장식 아이콘 없음. */
.nav-rail { display: flex; flex-direction: column; gap: 0.05rem; }
.nav-rail .rail-title {
  color: var(--muted);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 0 0.55rem 0.4rem;
}
.nav-rail a {
  display: block;
  padding: 0.32rem 0.55rem;
  color: var(--muted);
  text-decoration: none;
  border-radius: 6px;
  line-height: 1.4;
}
.nav-rail a:hover { color: var(--ink); background: var(--surface); }
.nav-rail a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.nav-rail a[aria-current="true"], .nav-rail a.active { color: var(--accent); font-weight: 600; background: var(--surface); }
.nav-rail a[data-attention="1"]::after { content: " •"; color: var(--status-blocked); }
/* 현황(status 4축) — 사이드바 하단 고정(margin-top:auto). 카드화 안 함:
   per-row 테두리/배경 없는 하나의 통합 묶음. SVG 아이콘(크기 일관). 행 클릭 시 jump. */
.status-strip {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.status-strip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
.status-strip .cell {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.32rem 0.55rem;
  border-radius: 6px;
  color: var(--ink-2);
  text-decoration: none;
}
.status-strip a.cell:hover { background: var(--surface); color: var(--ink); }
.status-strip a.cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.status-strip .cell .icon { display: inline-flex; flex-shrink: 0; color: var(--muted); }
.status-strip .cell .icon svg { width: 16px; height: 16px; display: block; }
.status-strip .cell .cell-label { color: var(--ink-2); }
.status-strip .cell .cell-val {
  margin-left: auto;
  font-weight: 600;
  color: var(--ink);
  min-width: 0;
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-strip .cell .cell-val code { color: inherit; font-size: 0.85em; }
.status-strip .cell:first-of-type .icon { color: var(--accent); }
.status-strip .cell.s-blocked .icon,
.status-strip .cell.s-blocked .cell-val { color: var(--status-blocked); }
.status-strip .cell.s-stale .icon,
.status-strip .cell.s-stale .cell-val { color: var(--status-stale); }
/* ── Verdict banner (primary) ──────────────────────────────────────── */
.verdict-banner { padding: 0.5rem 0 0.25rem; }
h1.verdict { font-size: 1.375rem; font-weight: 600; margin: 0; line-height: 1.4; text-wrap: balance; }
/* ── Cards (목적 있는 비중첩 카드 — card-in-card 금지 / H17) ──────────── */
.card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  padding: 1.25rem 1.4rem 1.4rem;
  box-shadow: var(--card-shadow);
  transition: border-color 160ms ease-out, box-shadow 160ms ease-out;
}
.card:hover { border-color: var(--border); box-shadow: var(--card-shadow-hover); }
.card > h2 {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  padding-bottom: 0.7rem;
  color: var(--ink);
  letter-spacing: -0.01em;
  border-bottom: 1px solid var(--border);
}
.card.attention { border-color: var(--status-blocked); }
.card.attention:hover { border-color: var(--status-blocked); }
h2 { font-size: 1rem; }
.muted { color: var(--muted); }
.stale-label { color: var(--status-stale); font-weight: 500; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 0.25rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--muted); font-size: 0.8125rem; }
.table-scroll { overflow-x: auto; }
blockquote { margin: 0.25rem 0 0.5rem 1rem; padding-left: 0.5rem; border-left: 2px solid var(--border); color: var(--muted); }
ul { padding-left: 1.25rem; }
.s-blocked { color: var(--status-blocked); }
.s-stale { color: var(--status-stale); }
.s-worker-alive { color: var(--status-worker-alive); }
.s-worker-stale { color: var(--status-worker-stale); }
.s-secret { color: var(--status-secret); }
.s-in-progress, .s-terminal-ok { color: var(--accent); }
aside[role="alert"].s-secret {
  background: var(--status-secret);
  color: var(--bg);
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}
.severity-tag { display: inline-block; padding: 0 0.35em; border-radius: 3px;
  font-size: 0.8rem; font-weight: 500; }
.severity-tag.s-critical, .severity-tag.s-high { color: var(--status-blocked); font-weight: 600; }
.severity-tag.s-medium { color: var(--status-stale); font-weight: 600; }
.severity-tag.s-low { color: var(--muted); font-weight: 600; }
.oq-item, .risk-item { margin: 0.5rem 0; padding: 0.5rem 0;
  border-bottom: 1px dashed var(--border); list-style: none; }
.oq-item:last-child, .risk-item:last-child { border-bottom: none; }
.item-text { color: var(--ink); }
.meta-cue { font-size: 0.85rem; margin: 0.25rem 0 0.25rem 1rem; color: var(--muted);
  border-left: 2px solid var(--border); padding-left: 0.5rem; }
/* F2 absorption — 200+ char prompt wrap 안전, button overflow 방지 */
.action-prompt { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
  margin-top: 0.3rem; }
.action-prompt code { background: var(--surface); padding: 0.25rem 0.4rem; border-radius: 3px;
  flex: 1; min-width: 0; max-width: 100%; overflow-x: auto; }
.copy-btn { font-size: 0.8rem; padding: 0.2rem 0.6rem; border: 1px solid var(--border);
  flex-shrink: 0; background: var(--surface); color: var(--ink); cursor: pointer;
  border-radius: 3px; }
.copy-btn:hover { background: var(--bg); }
.copy-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.copy-btn[data-copied="1"] { color: var(--status-worker-alive);
  border-color: var(--status-worker-alive); }
.copy-btn[data-copied="1"]::after { content: ' ✓복사됨'; }
.related-oq { font-size: 0.85rem; color: var(--muted); margin: 0.25rem 0 0.25rem 1rem; }
.risk-mitigation { font-size: 0.85rem; margin: 0.25rem 0 0.25rem 1rem; }
.milestone-history { list-style: none; padding-left: 0; }
.milestone-item { padding: 0.25rem 0; border-bottom: 1px dashed var(--border); }
.milestone-item:last-child { border-bottom: none; }
.ms-name { color: var(--ink); }
details { margin-top: 0.5rem; }
/* F1 absorption — details summary + abbr underline contrast WCAG AA */
details summary { cursor: pointer; color: var(--ink); font-size: 0.85rem; }
details summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
details[open] summary { margin-bottom: 0.5rem; }
abbr { text-decoration: underline dotted var(--ink); text-underline-offset: 2px; cursor: help; }
/* v1.13.0 게이트 파이프라인 스테퍼. pipe-node 는 pill(border-radius) — H3
   carve-out 대상(상태 노드 affordance). 연결선 .pipe-edge 는 수평 라인. */
.pipeline { list-style: none; padding-left: 0; margin: 0; }
.pipe-row { display: flex; flex-wrap: wrap; align-items: center;
  gap: 0.4rem 0.75rem; padding: 0.4rem 0; border-bottom: 1px dashed var(--border); }
.pipe-row:last-child { border-bottom: none; }
.pipe-decision { color: var(--muted); font-size: 0.85rem; min-width: 8rem; }
.pipe-track { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
.pipe-node { display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.1rem 0.55rem; border-radius: 999px; background: var(--surface);
  font-size: 0.85rem; }
.pipe-node .pipe-icon { font-size: 0.9rem; }
.pipe-node .pipe-stage { color: var(--ink); }
.pipe-edge { width: 1.25rem; height: 2px; background: var(--border);
  flex-shrink: 0; }
.pipe-row[data-kind="attention"] .pipe-decision { color: var(--status-blocked); font-weight: 600; }
.pipe-row.pipe-row-hot { background: var(--surface); }
.pipe-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pipe-more { list-style: none; }
.pipe-more summary { color: var(--muted); font-size: 0.85rem; }
/* v1.14.0 활동 step-chart rail. tl-node pill — H3 carve-out. converged 는
   quiet(tl-done = muted), pending 만 loud(s-stale) — accent 미사용. */
.tl-rail { list-style: none; padding-left: 0; margin: 0; position: relative; }
.tl-rail::before { content: ''; position: absolute; left: 0.7rem; top: 0.6rem; bottom: 0.6rem;
  width: 2px; background: var(--border); }
.tl-step { position: relative; display: flex; align-items: flex-start; gap: 0.6rem;
  padding: 0.3rem 0; }
.tl-node { position: relative; z-index: 1; display: inline-flex; align-items: center;
  justify-content: center; width: 1.4rem; height: 1.4rem; flex-shrink: 0;
  border-radius: 999px; background: var(--surface); }
.tl-node .tl-icon { font-size: 0.85rem; line-height: 1; }
.tl-done { color: var(--muted); }
.tl-step.from-snapshot { color: var(--muted); }
.tl-step.from-snapshot .tl-node { opacity: 0.7; }
.tl-body { flex: 1; min-width: 0; }
.tl-body .rel { color: var(--muted); }
.tl-body .conv { color: var(--muted); }
.tl-body .conv.pending { color: var(--status-stale); font-weight: 600; }
.tl-note { list-style: none; color: var(--muted); padding-left: 2rem; }
.tl-step.tl-row-hot { background: var(--surface); }
.tl-step:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
footer { width: 100%; max-width: var(--content-max); margin: 0 auto;
  padding: 0.5rem 1.75rem 1.5rem; }
/* ── 반응형 구조적 collapse (product.md: 구조 변경, fluid 타이포 아님).
   body 그리드가 단일 컬럼으로 collapse, 사이드바는 상단 가로 바로 reflow. ──── */
@media (max-width: 720px) {
  body { grid-template-columns: minmax(0, 1fr); }
  .sidebar {
    position: static;
    height: auto;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    overflow: visible;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .nav-rail {
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 0.25rem;
    padding-bottom: 0.25rem;
  }
  .nav-rail .rail-title { display: none; }
  .nav-rail a { white-space: nowrap; flex-shrink: 0; }
  .status-strip { margin-top: 0; border-top: none; padding-top: 0; }
  header { padding: 0.5rem 1rem; }
  .content { padding: 1.25rem 1rem 3rem; }
  .card { padding: 0.95rem 1rem 1.05rem; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}`;

const STALE_SCRIPT = `(function(){var d=Number(document.body.dataset.derivedMs)||0;function c(){if(document.hidden)return;var a=Date.now()-d;document.body.dataset.stale=a>60000?'1':'0';}c();document.addEventListener('visibilitychange',c);setInterval(c,5000);})();`;

const COPY_SCRIPT = `(function(){document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('[data-copy]');if(!t)return;var s=t.getAttribute('data-copy')||'';if(navigator&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){t.setAttribute('data-copied','1');setTimeout(function(){t.removeAttribute('data-copied')},1500)}).catch(function(){})}});})();`;

// status 아이콘 — 이모지 대신 inline SVG(Lucide 결). 16px 단일 사이즈로 정렬·크기
// 일관성 확보(이모지 폰트별 크기 편차 제거). currentColor 로 상태색 상속.
const SVG_PATHS = {
  progress: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  ban: '<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>',
  'arrow-right': '<line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  alert: '<path d="M10.3 4.3 2.6 18a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 4.3a1.6 1.6 0 0 0-2.8 0z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.5" x2="12.01" y2="17.5"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
};

function svgIcon(name) {
  const body = SVG_PATHS[name] || SVG_PATHS.dot;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}

function cellSvgName(cell) {
  switch (cell.key) {
    case 'in-progress': return 'progress';
    case 'blocked': return 'ban';
    case 'next': return cell.stale ? 'clock' : 'arrow-right';
    case 'risks': return 'alert';
    default: return 'dot';
  }
}

// status 행 — 사이드바 하단 통합 묶음. SVG 아이콘 + 라벨 + 값. 클릭 시 섹션 jump.
function renderStripCell(cell, escapeHtml, escapeAttr, jumpTarget) {
  const classes = ['cell'];
  if (cell.accent === 'blocked') classes.push('s-blocked');
  if (cell.stale) classes.push('s-stale');
  const cls = classes.join(' ');
  let valueHtml;
  if (cell.kind === 'next') {
    valueHtml = cell.stale
      ? '<span class="stale-label">' + escapeHtml(cell.value) + '</span>'
      : '<code>' + escapeHtml(cell.value) + '</code>';
  } else {
    valueHtml = escapeHtml(cell.value);
  }
  const fullLabel = String(cell.label || '') + ' ' + String(cell.value || '');
  const dataAttr = cell.stale ? ' data-stale="1"' : '';
  // href 는 URL fragment → escapeAttr. aria-label/title 은 사람이 읽는 텍스트 → escapeHtml.
  const href = jumpTarget ? ' href="' + escapeAttr(jumpTarget) + '"' : '';
  const labelAttr = escapeHtml(fullLabel);
  return '<a class="' + cls + '"' + href + dataAttr
    + ' title="' + labelAttr + '" aria-label="' + labelAttr + '">'
    + '<span class="icon" aria-hidden="true">' + svgIcon(cellSvgName(cell)) + '</span>'
    + '<span class="cell-label">' + escapeHtml(cell.label) + '</span>'
    + '<span class="cell-val">' + valueHtml + '</span>'
    + '</a>';
}

function renderHtml(model, sections, verdict, derivedAt, formatUtils) {
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const escapeAttr = formatUtils.escapeAttr || escapeHtml;
  const m = model || {};
  const [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  const safeVerdictText = escapeHtml(verdict.text);
  const safeVerdictIcon = escapeHtml(verdict.icon);
  const verdictAttention = verdict.tone === 'red' || verdict.tone === 'blocked';

  const gridCells = (grid && Array.isArray(grid.cells)) ? grid.cells : [];
  const stripAriaLabel = gridCells.length > 0
    ? '현황 4축: ' + gridCells.map(c => String(c.label || '') + ' ' + String(c.value || '')).join(' · ')
    : '현황 4축';

  // Section-purpose map (Codex R1 F2 absorption): card 래퍼는 이 명시적 map 에서만
  // 생성된다. 섹션 모듈은 inner 콘텐츠만 emit. 조건부 hide 는 present 가 결정.
  const cardSpecs = [
    { id: 'pipeline', title: '게이트 파이프라인', section: pipeline, present: !!pipeline },
    { id: 'workers', title: '워커', section: fanout, present: !!fanout },
    { id: 'sessions', title: '최근 활동', section: activeSessions, present: !!activeSessions },
    { id: 'timeline', title: '타임라인', section: timeline, present: true },
    { id: 'milestone-history', title: '마일스톤 기록', section: milestoneHistory, present: !!milestoneHistory },
    { id: 'questions', title: '미해결 질문', section: questions, present: !!questions },
    { id: 'risks', title: '위험', section: risks, present: true },
  ].filter(spec => spec.present);

  // status 칩 jump 타깃: 존재하는 섹션으로만 연결, 없으면 verdict 로 fallback.
  const availableIds = new Set(['verdict'].concat(cardSpecs.map(spec => spec.id)));
  const jumpMap = { 'in-progress': 'pipeline', 'blocked': 'pipeline', 'next': 'verdict', 'risks': 'risks' };
  const jumpFor = (key) => {
    const t = jumpMap[key];
    return '#' + (t && availableIds.has(t) ? t : 'verdict');
  };
  const stripHtml = gridCells
    .map(c => renderStripCell(c, escapeHtml, escapeAttr, jumpFor(c.key)))
    .join('');

  // on-this-page TOC: verdict + 각 present 카드. plain 텍스트(● 제거),
  // active-추적(scroll spy)은 M4. inert affordance 0 (Codex R1 F3 absorption).
  const navItems = [{ id: 'verdict', title: '판정', attention: verdictAttention }]
    .concat(cardSpecs.map(spec => ({ id: spec.id, title: spec.title, attention: false })));
  const navHtml = navItems.map(n =>
    '<a href="#' + n.id + '"' + (n.attention ? ' data-attention="1"' : '') + '>'
    + escapeHtml(n.title) + '</a>'
  ).join('');

  const parts = [];
  parts.push('<!doctype html>');
  parts.push('<html lang="ko">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>mccp 상태 · ' + safeVerdictText + '</title>');
  parts.push('<style>' + OKLCH_DARK + OKLCH_LIGHT + LAYOUT + '</style>');
  parts.push('</head>');
  parts.push('<body data-stale="0" data-derived-ms="' + (Number.isFinite(derivedMs) ? derivedMs : 0) + '">');
  parts.push('<a class="skip-link sr-only" href="#main">본문 바로가기</a>');
  // 좌측 사이드바 — body 그리드 첫 컬럼(좌단 full-bleed). 목차 위 + 현황 하단.
  // header 와 독립이라 header 스크롤이 사이드바/status 를 자르지 않음.
  parts.push('<aside class="sidebar" aria-label="목차 및 현황">'
    + '<nav class="nav-rail" aria-label="목차">'
    + '<span class="rail-title">목차</span>' + navHtml
    + '</nav>'
    + '<div class="status-strip" role="group" tabindex="0" aria-label="' + escapeHtml(stripAriaLabel) + '">' + stripHtml + '</div>'
    + '</aside>');

  // 메인 컬럼 — header(상단) + 콘텐츠 + footer. body 그리드 둘째 컬럼.
  parts.push('<div class="main-col">');
  parts.push('<header>'
    + '<span class="brand">mccp 상태</span>'
    + '<span class="meta">마지막 갱신 ' + escapeHtml(relative)
    + '<span class="stale-suffix">· stale</span></span>'
    + '</header>');

  parts.push('<main id="main" class="content" tabindex="-1">');
  if (m.masked === false) {
    parts.push('<aside role="alert" class="s-secret">⚠ raw — 절대 외부 공유 금지</aside>');
  }

  // verdict banner (primary — 카드 아님, full-width 강조)
  parts.push('<section id="verdict" class="verdict-banner">'
    + '<h1 class="verdict s-' + escapeHtml(verdict.tone) + '">'
    + safeVerdictIcon + ' ' + safeVerdictText + '</h1></section>');

  // detail cards (목적 있는 비중첩 카드)
  for (const spec of cardSpecs) {
    const attentionCls = (spec.id === 'pipeline' && verdictAttention) ? ' attention' : '';
    parts.push('<section id="' + spec.id + '" class="card' + attentionCls + '">'
      + '<h2>' + escapeHtml(spec.title) + '</h2>'
      + (spec.section ? spec.section.html : '')
      + '</section>');
  }

  parts.push('</main>');
  parts.push('<footer role="contentinfo" class="muted mono">v1.16.0 · <code lang="en">.claude/</code> 통합 derive</footer>');
  parts.push('</div>');
  parts.push('<script>' + STALE_SCRIPT + '</script>');
  parts.push('<script>' + COPY_SCRIPT + '</script>');
  // v1.13.0 — vendored-inline jQuery + pipeline enhancement. Only when the
  // pipeline section is present and the vendor bundle loaded. Inline only —
  // no external origin (Codex F2). Additive: baseline renders without it.
  if (pipeline && JQUERY_SLIM) {
    parts.push('<script>' + JQUERY_SLIM + '</script>');
    parts.push('<script>' + PIPELINE_SCRIPT + '</script>');
  }
  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}

const TOKENS = OKLCH_DARK + OKLCH_LIGHT;

module.exports = { renderHtml, TOKENS, LAYOUT };
