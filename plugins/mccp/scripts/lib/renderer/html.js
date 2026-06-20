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
header {
  position: sticky;
  top: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0.5rem 0;
  transition: background 240ms ease-out;
  z-index: 10;
}
body[data-stale="1"] header {
  background: var(--status-stale);
  transition: background 240ms ease-out;
}
section { padding: 1rem 0; border-bottom: 1px solid var(--border); }
section:last-child { border-bottom: none; }
h1 { font-size: 1.5rem; margin: 0.5rem 0; }
h2 { font-size: 1.125rem; margin: 0 0 0.5rem 0; color: var(--ink); }
.muted { color: var(--muted); }
.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem; }
.grid-cell { padding: 0.5rem; border: 1px solid var(--border); border-radius: 4px; }
.grid-label { color: var(--muted); font-size: 0.875rem; }
.grid-value { font-size: 1.25rem; font-weight: 600; }
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
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}`;

const STALE_SCRIPT = `(function(){var d=Number(document.body.dataset.derivedMs)||0;function c(){if(document.hidden)return;var a=Date.now()-d;document.body.dataset.stale=a>60000?'1':'0';}c();document.addEventListener('visibilitychange',c);setInterval(c,5000);})();`;

function renderHtml(model, sections, verdict, derivedAt, formatUtils) {
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const m = model || {};
  const [grid, fanout, activeSessions, timeline, questions, risks] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  const safeVerdictText = escapeHtml(verdict.text);
  const safeVerdictIcon = escapeHtml(verdict.icon);

  const parts = [];
  parts.push('<!doctype html>');
  parts.push('<html lang="ko">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>mccp Status · ' + safeVerdictText + '</title>');
  parts.push('<style>' + OKLCH_LIGHT + OKLCH_DARK + LAYOUT + '</style>');
  parts.push('</head>');
  parts.push('<body data-stale="0" data-derived-ms="' + (Number.isFinite(derivedMs) ? derivedMs : 0) + '">');
  parts.push('<header><strong>mccp Status</strong> · ' + safeVerdictIcon + ' ' + safeVerdictText
    + ' <span class="muted mono">· Last refreshed ' + escapeHtml(derivedAt) + ' · ' + escapeHtml(relative) + '</span></header>');
  parts.push('<main>');
  if (m.masked === false) {
    parts.push('<aside role="alert" class="s-secret">⚠ raw — 절대 외부 공유 금지</aside>');
  }

  parts.push('<section id="verdict"><h2>Verdict</h2><blockquote class="s-' + escapeHtml(verdict.tone) + '">'
    + safeVerdictIcon + ' ' + safeVerdictText + '</blockquote></section>');

  parts.push('<section id="status"><h2>Status</h2>' + (grid ? grid.html : '') + '</section>');

  if (fanout) {
    parts.push('<section id="workers"><h2>Workers</h2>' + fanout.html + '</section>');
  }

  if (activeSessions) {
    parts.push('<section id="sessions"><h2>Active Sessions</h2>' + activeSessions.html + '</section>');
  }

  parts.push('<section id="timeline"><h2>Timeline</h2>' + (timeline ? timeline.html : '') + '</section>');

  if (questions) {
    parts.push('<section id="questions"><h2>Open Questions</h2>' + questions.html + '</section>');
  }

  parts.push('<section id="risks"><h2>Risks</h2>' + (risks ? risks.html : '') + '</section>');

  parts.push('</main>');
  parts.push('<footer class="muted mono">Derived from .claude/ via plugins/mccp/scripts/derive · v1.3.0-m3 renderer</footer>');
  parts.push('<script>' + STALE_SCRIPT + '</script>');
  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}

module.exports = { renderHtml };
