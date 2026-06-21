'use strict';

const OKLCH_LIGHT = `
:root {
  --bg: oklch(0.99 0 0);
  --surface: oklch(0.97 0.003 250);
  --border: oklch(0.92 0.005 250);
  --ink: oklch(0.20 0.005 250);
  --muted: oklch(0.45 0.008 250);
  --accent: oklch(0.55 0.18 230);
  --status-blocked: oklch(0.55 0.18 25);
  --status-stale: oklch(0.75 0.15 80);
  --status-secret: oklch(0.50 0.22 25);
  --status-worker-alive: oklch(0.65 0.15 145);
  --status-worker-stale: oklch(0.75 0.15 80);
}`;

const OKLCH_DARK = `
@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(0.18 0 0);
    --surface: oklch(0.22 0.005 250);
    --border: oklch(0.30 0.008 250);
    --ink: oklch(0.92 0.005 250);
    --muted: oklch(0.65 0.008 250);
    --accent: oklch(0.70 0.15 230);
    --status-blocked: oklch(0.65 0.20 25);
    --status-stale: oklch(0.75 0.15 80);
    --status-secret: oklch(0.65 0.22 25);
    --status-worker-alive: oklch(0.70 0.18 145);
    --status-worker-stale: oklch(0.75 0.15 80);
  }
}`;

const LAYOUT = `
body {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  color: var(--ink);
  background: var(--bg);
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
  line-height: 1.5;
}
code, .mono { font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace; }
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
  z-index: 11; outline: 2px solid var(--bg); outline-offset: 2px;
  text-decoration: none; border-radius: 3px;
}
main:focus { outline: none; }
header {
  position: sticky;
  top: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0.5rem 0;
  transition: background 240ms ease-out;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
body[data-stale="1"] header {
  background: var(--status-stale);
  transition: background 240ms ease-out;
}
header .brand { font-weight: 600; font-size: 1rem; }
header .status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: center;
}
header .status-strip .cell {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  min-width: 120px;
}
header .status-strip .cell .icon { font-size: 0.95rem; }
header .status-strip .cell b { font-weight: 600; }
header .status-strip .cell:first-of-type { color: var(--accent); }
header .status-strip .cell.s-blocked { color: var(--status-blocked); }
header .status-strip .cell.s-stale { color: var(--status-stale); }
header .status-strip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
header .meta { color: var(--muted); font-size: 0.85rem; margin-left: auto; }
header .meta .stale-suffix { display: none; }
body[data-stale="1"] header .meta .stale-suffix { display: inline; margin-left: 0.25rem; }
section { padding: 1rem 0; border-bottom: 1px solid var(--border); }
section:last-child { border-bottom: none; }
h1 { font-size: 1.5rem; margin: 0.5rem 0; }
h1.verdict { font-size: 1.5rem; margin: 0.5rem 0; }
h2 { font-size: 1.125rem; margin: 0 0 0.5rem 0; color: var(--ink); }
.muted { color: var(--muted); }
.stale-label { color: var(--status-stale); font-weight: 500; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 0.25rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
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
  const [grid, fanout, activeSessions, timeline, questions, risks, milestoneHistory] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  const safeVerdictText = escapeHtml(verdict.text);
  const safeVerdictIcon = escapeHtml(verdict.icon);

  const gridCells = (grid && Array.isArray(grid.cells)) ? grid.cells : [];
  const stripHtml = gridCells.map(c => renderStripCell(c, escapeHtml)).join('');
  const stripAriaLabel = gridCells.length > 0
    ? '현황 4축: ' + gridCells.map(c => String(c.label || '') + ' ' + String(c.value || '')).join(' · ')
    : '현황 4축';

  const parts = [];
  parts.push('<!doctype html>');
  parts.push('<html lang="ko">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>mccp 상태 · ' + safeVerdictText + '</title>');
  parts.push('<style>' + OKLCH_LIGHT + OKLCH_DARK + LAYOUT + '</style>');
  parts.push('</head>');
  parts.push('<body data-stale="0" data-derived-ms="' + (Number.isFinite(derivedMs) ? derivedMs : 0) + '">');
  parts.push('<a class="skip-link sr-only" href="#main">본문 바로가기</a>');
  parts.push('<header>'
    + '<span class="brand">mccp 상태</span>'
    + '<div class="status-strip" role="group" tabindex="0" aria-label="' + escapeHtml(stripAriaLabel) + '">' + stripHtml + '</div>'
    + '<span class="meta">마지막 갱신 ' + escapeHtml(relative)
    + '<span class="stale-suffix">· stale</span></span>'
    + '</header>');
  parts.push('<main id="main" tabindex="-1">');
  if (m.masked === false) {
    parts.push('<aside role="alert" class="s-secret">⚠ raw — 절대 외부 공유 금지</aside>');
  }

  parts.push('<section id="verdict"><h1 class="verdict s-' + escapeHtml(verdict.tone) + '">'
    + safeVerdictIcon + ' ' + safeVerdictText + '</h1></section>');

  if (fanout) {
    parts.push('<section id="workers"><h2>워커</h2>' + fanout.html + '</section>');
  }

  if (activeSessions) {
    parts.push('<section id="sessions"><h2>최근 활동</h2>' + activeSessions.html + '</section>');
  }

  parts.push('<section id="timeline"><h2>타임라인</h2>' + (timeline ? timeline.html : '') + '</section>');

  if (milestoneHistory) {
    parts.push('<section id="milestone-history"><h2>이정표 기록</h2>' + milestoneHistory.html + '</section>');
  }

  if (questions) {
    parts.push('<section id="questions"><h2>미해결 질문</h2>' + questions.html + '</section>');
  }

  parts.push('<section id="risks"><h2>위험</h2>' + (risks ? risks.html : '') + '</section>');

  parts.push('</main>');
  parts.push('<footer role="contentinfo" class="muted mono">v1.4.2 · <code lang="en">.claude/</code> 통합 derive</footer>');
  parts.push('<script>' + STALE_SCRIPT + '</script>');
  parts.push('<script>' + COPY_SCRIPT + '</script>');
  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}

module.exports = { renderHtml };
