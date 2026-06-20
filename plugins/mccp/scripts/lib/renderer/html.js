'use strict';

// v1.3.0-m3-redux renderer · PRD §Design Direction (line 148-231) compliant.
//
// Replaces b204510 "Linear-style" surface that violated 8 absolute bans:
//   - dark navy default bg → PRD mandates light off-white
//   - 9 severity colors → PRD mandates restrained (3 signals + 1 accent)
//   - side-stripe borders + cards + identical card grid → PRD absolute bans
//   - glassmorphism (backdrop-filter) + uppercase body → impeccable slop catalog
//   - hero-metric font sizes → anti-ref 1 (SaaS dashboards)
//   - em dashes in body → PRD copy rule
//
// Design constraints baked into the CSS literal so future drift is mechanical:
//   - max-width 720px on main column
//   - section separation = padding + 1px border-top only, no card chrome
//   - one accent (blue 230), three signals (red 25, amber 80, green 145)
//   - system font stack + system mono, no custom font names
//   - sentence case throughout, no text-transform: uppercase
//
// See docs/v1.3.0-observability/DESIGN.md for the H1-H14 lint contract.

const TOKENS = `
:root {
  color-scheme: light dark;
  --bg:        oklch(0.99 0 0);
  --surface:   oklch(0.97 0.003 250);
  --border:    oklch(0.92 0.005 250);
  --border-2:  oklch(0.85 0.006 250);
  --ink:       oklch(0.20 0.005 250);
  --ink-2:     oklch(0.32 0.006 250);
  --muted:     oklch(0.48 0.008 250);
  --accent:    oklch(0.55 0.18 230);
  --signal:    oklch(0.55 0.18 25);
  --warn:      oklch(0.60 0.15 80);
  --ok:        oklch(0.50 0.14 145);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:       oklch(0.16 0.008 250);
    --surface:  oklch(0.20 0.010 250);
    --border:   oklch(0.28 0.012 250);
    --border-2: oklch(0.34 0.014 250);
    --ink:      oklch(0.95 0.005 250);
    --ink-2:    oklch(0.82 0.008 250);
    --muted:    oklch(0.66 0.012 250);
    --accent:   oklch(0.72 0.16 230);
    --signal:   oklch(0.70 0.20 25);
    --warn:     oklch(0.78 0.16 80);
    --ok:       oklch(0.68 0.16 145);
  }
}`;

const LAYOUT = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  font-size: 1rem;
  line-height: 1.55;
  color: var(--ink);
  background: var(--bg);
}
code, .mono {
  font-family: ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace;
  color: var(--ink-2);
}
main, header, footer { max-width: 720px; margin: 0 auto; padding: 0 24px; }
main { padding-top: 8px; padding-bottom: 64px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
p { margin: 0; }
p + p { margin-top: 8px; }

header {
  position: sticky;
  top: 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 14px 24px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  transition: border-color 240ms ease-out;
}
header .brand { font-weight: 600; color: var(--ink); }
header .grow { flex: 1 1 auto; min-width: 1px; }
header .meta { color: var(--muted); font-size: 0.75rem; }
header .meta code { color: var(--muted); background: none; padding: 0; }
header .stale-suffix { display: none; color: var(--warn); font-size: 0.75rem; }
body[data-stale="1"] header { border-bottom-color: var(--warn); }
body[data-stale="1"] header .stale-suffix { display: inline; }

section {
  padding: 24px 0;
  border-top: 1px solid var(--border);
}
section:first-of-type { border-top: 0; padding-top: 20px; }
section > h2 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  margin: 0 0 12px;
  text-wrap: balance;
}

aside.secret-banner {
  margin: 16px 0;
  padding: 10px 12px;
  border: 1px solid var(--signal);
  color: var(--signal);
  font-weight: 500;
}

h1.verdict {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--ink);
  margin: 4px 0 4px;
  text-wrap: balance;
}
h1.verdict .v-icon { color: var(--muted); font-weight: 400; margin-right: 8px; }
h1.verdict.s-red   .v-icon { color: var(--signal); }
h1.verdict.s-amber .v-icon { color: var(--warn); }
h1.verdict.s-green .v-icon { color: var(--ok); }
h1.verdict.s-blue  .v-icon { color: var(--accent); }

.status-line { color: var(--ink); line-height: 1.6; }
.status-line b { font-weight: 600; }
.status-line code { color: var(--accent); }
.status-line .x-red   { color: var(--signal); font-weight: 600; }
.status-line .x-amber { color: var(--warn); font-weight: 600; }
.status-line .x-ok    { color: var(--ok); font-weight: 600; }

table { border-collapse: collapse; width: 100%; font-size: 1rem; line-height: 1.5; }
table thead th {
  text-align: left;
  padding: 8px 10px 8px 0;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.75rem;
  border-bottom: 1px solid var(--border-2);
}
table tbody td {
  padding: 10px 10px 10px 0;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
  color: var(--ink-2);
}
table tbody tr:last-child td { border-bottom: 0; }

.risks td.risk-name { color: var(--ink); }
.risks td.risk-mit  { color: var(--muted); }
.risks .tag { font-size: 0.75rem; color: var(--muted); }
.risks .tag.t-critical { color: var(--signal); }
.risks .tag.t-high     { color: var(--ink); }

.timeline { list-style: none; margin: 0; padding: 0; }
.timeline > li {
  padding: 6px 0;
  color: var(--ink-2);
  font-size: 1rem;
  line-height: 1.55;
}
.timeline > li .rel { color: var(--ink); font-weight: 500; }
.timeline > li .conv { color: var(--ok); }
.timeline > li .conv.pending { color: var(--muted); }
.timeline > li code { color: var(--ink-2); }
.timeline > li.from-snapshot { color: var(--muted); }
.timeline > li.snapshot-gap, .timeline > li.from-snapshot-footnote, .timeline > li.muted {
  color: var(--muted);
  font-size: 0.75rem;
}
.timeline blockquote.briefing {
  margin: 6px 0 0 0;
  padding: 4px 0 4px 12px;
  border-left: 1px solid var(--border-2);
  color: var(--muted);
  font-size: 0.75rem;
}

.open-questions { list-style: none; margin: 0; padding: 0; }
.open-questions > li {
  padding: 8px 0;
  color: var(--ink-2);
  border-top: 1px solid var(--border);
  line-height: 1.5;
}
.open-questions > li:first-child { border-top: 0; padding-top: 0; }
.open-questions > li.muted { color: var(--muted); border-top: 0; padding-top: 4px; }
.open-questions strong { color: var(--ink); font-weight: 600; }
.open-questions .tag {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted);
  margin-right: 6px;
}
.open-questions .tag.t-critical { color: var(--signal); }
.open-questions .tag.t-high     { color: var(--ink); }

.workers .w-kind { color: var(--ink-2); }
.workers .w-kind.k-blocked        { color: var(--signal); }
.workers .w-kind.k-stale          { color: var(--warn); }
.workers .w-kind.k-worker-alive   { color: var(--ok); }
.workers .w-kind.k-worker-stale   { color: var(--warn); }
.workers .w-kind.k-terminal-ok    { color: var(--ok); }
.workers .w-kind.k-in-progress    { color: var(--accent); }

footer {
  margin-top: 32px;
  padding: 16px 24px 24px;
  color: var(--muted);
  font-size: 0.75rem;
  border-top: 1px solid var(--border);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}`;

const STALE_SCRIPT = "(function(){var d=Number(document.body.dataset.derivedMs)||0;function c(){if(document.hidden)return;var a=Date.now()-d;document.body.dataset.stale=a>60000?'1':'0';}c();document.addEventListener('visibilitychange',c);setInterval(c,5000);})();";

// Tone enum from verdict.js → CSS class suffix.
//   'red'     → signal red  → blocked / critical / secret
//   'amber'   → warn yellow → stale / degraded
//   'green'   → ok green    → workers alive / terminal_ok
//   'neutral' → blue accent → in-progress (backlog or active plan)
//   'muted'   → gray        → fully idle, no signal
function verdictToneClass(verdict) {
  const t = (verdict && verdict.tone) || '';
  if (t === 'red')     return 's-red';
  if (t === 'amber')   return 's-amber';
  if (t === 'green')   return 's-green';
  if (t === 'neutral') return 's-blue';
  return 's-neutral';
}

function renderHtml(model, sections, verdict, derivedAt, formatUtils) {
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const m = model || {};
  const [grid, fanout, timeline, questions, risks] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  // Verdict prose. New contract: verdict.prose is the PM-voice sentence,
  // verdict.text is the legacy raw string. We prefer prose when present.
  const verdictText = (verdict && (verdict.prose || verdict.text)) || '';
  const safeVerdictText = escapeHtml(verdictText);
  const safeVerdictIcon = escapeHtml((verdict && verdict.icon) || '·');
  const toneClass = verdictToneClass(verdict);

  const parts = [];
  parts.push('<!doctype html>');
  parts.push('<html lang="ko">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>mccp Status, ' + safeVerdictText + '</title>');
  parts.push('<style>' + TOKENS + LAYOUT + '</style>');
  parts.push('</head>');
  parts.push('<body data-stale="0" data-derived-ms="' + (Number.isFinite(derivedMs) ? derivedMs : 0) + '">');
  parts.push('<header>');
  parts.push('<span class="brand">mccp Status</span>');
  parts.push('<span class="grow"></span>');
  parts.push('<span class="meta">Refreshed <code>' + escapeHtml(relative) + '</code></span>');
  parts.push('<span class="stale-suffix">· stale</span>');
  parts.push('</header>');
  parts.push('<main>');

  if (m.masked === false) {
    parts.push('<aside class="secret-banner s-secret" role="alert">⚠ raw · 절대 외부 공유 금지</aside>');
  }

  parts.push('<section id="verdict">');
  parts.push('<h1 class="verdict ' + toneClass + '"><span class="v-icon">'
    + safeVerdictIcon + '</span>' + safeVerdictText + '</h1>');
  parts.push('</section>');

  parts.push('<section id="status"><h2>Status</h2>' + (grid ? grid.html : '') + '</section>');

  if (fanout) {
    parts.push('<section id="workers"><h2>Workers</h2>' + fanout.html + '</section>');
  }

  parts.push('<section id="timeline"><h2>Timeline</h2>' + (timeline ? timeline.html : '') + '</section>');

  if (questions) {
    parts.push('<section id="questions"><h2>Open questions</h2>' + questions.html + '</section>');
  }

  parts.push('<section id="risks"><h2>Risks</h2>' + (risks ? risks.html : '') + '</section>');

  parts.push('</main>');
  parts.push('<footer>v1.3.0 mccp status, derived from <code>.claude/</code></footer>');
  parts.push('<script>' + STALE_SCRIPT + '</script>');
  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}

module.exports = { renderHtml, TOKENS, LAYOUT };
