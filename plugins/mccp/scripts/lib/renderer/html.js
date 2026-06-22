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
  --nav-width: 12rem;
  --content-max: 760px;
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
/* ── Header (sticky, solid background, no blur) ────────────────────── */
header {
  position: sticky;
  top: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0.6rem 1.25rem;
  transition: border-color 240ms ease-out;
  z-index: 40;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
body[data-stale="1"] header { border-bottom-color: var(--status-stale); }
header .brand { font-weight: 600; font-size: 1rem; letter-spacing: -0.01em; }
header .status-strip { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; align-items: center; }
header .status-strip .cell { display: inline-flex; align-items: baseline; gap: 0.3rem; }
header .status-strip .cell .icon { font-size: 0.95rem; }
header .status-strip .cell b { font-weight: 600; }
header .status-strip .cell:first-of-type { color: var(--accent); }
header .status-strip .cell.s-blocked { color: var(--status-blocked); }
header .status-strip .cell.s-stale { color: var(--status-stale); }
header .status-strip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
header .meta { color: var(--muted); font-size: 0.8125rem; margin-left: auto; }
header .meta .stale-suffix { display: none; }
body[data-stale="1"] header .meta .stale-suffix { display: inline; margin-left: 0.25rem; color: var(--status-stale); }
/* ── 2D shell: nav rail + content ──────────────────────────────────── */
.shell {
  display: grid;
  grid-template-columns: var(--nav-width) minmax(0, 1fr);
  gap: 1.25rem;
  max-width: calc(var(--nav-width) + var(--content-max) + 3.75rem);
  margin: 0 auto;
  padding: 1.25rem;
  align-items: start;
}
/* nav rail — working anchor links (M3 정적, active-추적 동작은 M4). inert 아님. */
.nav-rail {
  position: sticky;
  top: 4rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.nav-rail a {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  color: var(--muted);
  text-decoration: none;
  border-radius: 5px;
  font-size: 0.875rem;
}
.nav-rail a:hover { color: var(--ink); background: var(--surface); }
.nav-rail a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.nav-rail a .nav-dot { font-size: 0.7rem; color: var(--muted); }
.nav-rail a[data-attention="1"] .nav-dot { color: var(--status-blocked); }
.content { min-width: 0; display: flex; flex-direction: column; gap: 1rem; }
main:focus { outline: none; }
/* ── Verdict banner (primary) ──────────────────────────────────────── */
.verdict-banner { padding: 0.5rem 0 0.25rem; }
h1.verdict { font-size: 1.375rem; font-weight: 600; margin: 0; line-height: 1.4; text-wrap: balance; }
/* ── Cards (목적 있는 비중첩 카드 — card-in-card 금지 / H17) ──────────── */
.card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  padding: 1rem 1.1rem;
}
.card > h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.6rem 0;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.card.attention { border-color: var(--status-blocked); }
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
footer { max-width: calc(var(--nav-width) + var(--content-max) + 3.75rem);
  margin: 0 auto; padding: 0.5rem 1.25rem 1.5rem; }
/* ── 반응형 구조적 collapse (product.md: 구조 변경, fluid 타이포 아님) ──── */
@media (max-width: 720px) {
  .shell { grid-template-columns: minmax(0, 1fr); gap: 1rem; padding: 1rem; }
  .nav-rail {
    position: static;
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 0.25rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border);
  }
  .nav-rail a { white-space: nowrap; flex-shrink: 0; }
  header { padding: 0.5rem 1rem; }
  .card { padding: 0.85rem 0.9rem; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}`;

const STALE_SCRIPT = `(function(){var d=Number(document.body.dataset.derivedMs)||0;function c(){if(document.hidden)return;var a=Date.now()-d;document.body.dataset.stale=a>60000?'1':'0';}c();document.addEventListener('visibilitychange',c);setInterval(c,5000);})();`;

const COPY_SCRIPT = `(function(){document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('[data-copy]');if(!t)return;var s=t.getAttribute('data-copy')||'';if(navigator&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){t.setAttribute('data-copied','1');setTimeout(function(){t.removeAttribute('data-copied')},1500)}).catch(function(){})}});})();`;

function renderStripCell(cell, escapeHtml) {
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
    valueHtml = '<b>' + escapeHtml(cell.value) + '</b>';
  }
  const dataAttr = cell.stale ? ' data-stale="1"' : '';
  return '<span class="' + cls + '"' + dataAttr + '>'
    + '<span class="icon" aria-hidden="true">' + escapeHtml(cell.icon) + '</span> '
    + escapeHtml(cell.label) + ' ' + valueHtml
    + '</span>';
}

function renderHtml(model, sections, verdict, derivedAt, formatUtils) {
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const m = model || {};
  const [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  const safeVerdictText = escapeHtml(verdict.text);
  const safeVerdictIcon = escapeHtml(verdict.icon);
  const verdictAttention = verdict.tone === 'red' || verdict.tone === 'blocked';

  const gridCells = (grid && Array.isArray(grid.cells)) ? grid.cells : [];
  const stripHtml = gridCells.map(c => renderStripCell(c, escapeHtml)).join('');
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

  // nav rail entries: verdict + 각 present 카드. working plain anchor (M3) —
  // active-추적 동작은 M4. inert affordance 0 (Codex R1 F3 absorption).
  const navItems = [{ id: 'verdict', title: '판정', attention: verdictAttention }]
    .concat(cardSpecs.map(spec => ({ id: spec.id, title: spec.title, attention: spec.id === 'questions' || spec.id === 'risks' ? false : false })));
  const navHtml = navItems.map(n =>
    '<a href="#' + n.id + '"' + (n.attention ? ' data-attention="1"' : '') + '>'
    + '<span class="nav-dot" aria-hidden="true">●</span>' + escapeHtml(n.title) + '</a>'
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
  parts.push('<header>'
    + '<span class="brand">mccp 상태</span>'
    + '<div class="status-strip" role="group" tabindex="0" aria-label="' + escapeHtml(stripAriaLabel) + '">' + stripHtml + '</div>'
    + '<span class="meta">마지막 갱신 ' + escapeHtml(relative)
    + '<span class="stale-suffix">· stale</span></span>'
    + '</header>');

  parts.push('<div class="shell">');

  // nav rail (작동 anchor — 길찾기 토대)
  parts.push('<nav class="nav-rail" aria-label="섹션 이동">' + navHtml + '</nav>');

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
  parts.push('</div>');
  parts.push('<footer role="contentinfo" class="muted mono">v1.16.0 · <code lang="en">.claude/</code> 통합 derive</footer>');
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
