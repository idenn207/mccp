'use strict';

// v1.3.0-m3 renderer · Linear-style ops surface redesign.
//   - Dark navy + cool gray with one purple-blue accent.
//   - Severity badges (critical/high/medium/low/ok/idle) on every status cell,
//     risks row, open-questions item.
//   - Stale signal moved off the header background (was amber + muted text =
//     unreadable). Now surfaces as a chip in the header bar instead.
//   - Light-mode counterpart preserved for system preference.

const PALETTE_DARK = `
:root {
  color-scheme: dark light;
  --bg: oklch(0.18 0.012 250);
  --bg-elev: oklch(0.22 0.015 250);
  --surface: oklch(0.24 0.017 250);
  --surface-hi: oklch(0.28 0.018 250);
  --border: oklch(0.32 0.020 250);
  --border-strong: oklch(0.40 0.025 250);
  --ink: oklch(0.95 0.005 250);
  --ink-2: oklch(0.82 0.008 250);
  --muted: oklch(0.66 0.013 250);
  --muted-2: oklch(0.55 0.013 250);
  --accent: oklch(0.72 0.16 282);
  --accent-ink: oklch(0.20 0.012 250);
  --sev-critical: oklch(0.68 0.22 25);
  --sev-high: oklch(0.75 0.18 45);
  --sev-medium: oklch(0.82 0.15 80);
  --sev-low: oklch(0.72 0.12 230);
  --sev-ok: oklch(0.72 0.16 145);
  --sev-idle: oklch(0.60 0.010 250);
  --sev-stale: oklch(0.78 0.14 80);
  --sev-secret: oklch(0.65 0.24 25);
  --sev-critical-bg: color-mix(in oklch, var(--sev-critical) 18%, var(--bg-elev));
  --sev-high-bg: color-mix(in oklch, var(--sev-high) 14%, var(--bg-elev));
  --sev-medium-bg: color-mix(in oklch, var(--sev-medium) 14%, var(--bg-elev));
  --sev-low-bg: color-mix(in oklch, var(--sev-low) 12%, var(--bg-elev));
  --sev-ok-bg: color-mix(in oklch, var(--sev-ok) 12%, var(--bg-elev));
  --sev-idle-bg: var(--bg-elev);
  --sev-secret-bg: color-mix(in oklch, var(--sev-secret) 22%, var(--bg-elev));
  --shadow-1: 0 1px 0 0 oklch(0 0 0 / 30%);
  --radius-1: 4px;
  --radius-2: 6px;
  --radius-pill: 999px;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: oklch(0.985 0.003 250);
    --bg-elev: oklch(1.00 0 0);
    --surface: oklch(0.975 0.004 250);
    --surface-hi: oklch(0.96 0.005 250);
    --border: oklch(0.90 0.006 250);
    --border-strong: oklch(0.82 0.008 250);
    --ink: oklch(0.20 0.008 250);
    --ink-2: oklch(0.32 0.010 250);
    --muted: oklch(0.48 0.012 250);
    --muted-2: oklch(0.58 0.012 250);
    --accent: oklch(0.50 0.18 282);
    --accent-ink: oklch(1 0 0);
    --sev-critical: oklch(0.55 0.21 25);
    --sev-high: oklch(0.62 0.18 45);
    --sev-medium: oklch(0.70 0.15 80);
    --sev-low: oklch(0.55 0.14 230);
    --sev-ok: oklch(0.55 0.16 145);
    --sev-idle: oklch(0.55 0.010 250);
    --sev-stale: oklch(0.65 0.14 80);
    --sev-secret: oklch(0.50 0.22 25);
    --shadow-1: 0 1px 0 0 oklch(0 0 0 / 6%);
  }
}`;

const LAYOUT = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Inter', 'Pretendard Variable', 'Pretendard', ui-sans-serif, system-ui, -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  font-feature-settings: 'cv11', 'ss01', 'ss03', 'tnum';
  color: var(--ink);
  background: var(--bg);
  line-height: 1.55;
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
main, header, footer { max-width: 880px; margin: 0 auto; padding: 0 24px; }
code, .mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace; font-size: 0.92em; letter-spacing: 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

header {
  position: sticky;
  top: 0;
  background: color-mix(in oklch, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
  padding: 14px 24px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
header .brand { font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
header .brand .accent { color: var(--accent); }
header .v-icon { color: var(--muted); }
header .v-text { color: var(--ink-2); font-size: 0.95em; }
header .grow { flex: 1 1 auto; min-width: 1px; }
header .meta { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 0.85em; }
header .meta code { color: var(--muted-2); }
header .stale-chip {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--sev-stale);
  color: oklch(0.18 0.008 250);
  font-size: 0.78em;
  font-weight: 600;
  letter-spacing: 0.01em;
}
body[data-stale="1"] header .stale-chip { display: inline-flex; }
body[data-stale="1"] header { border-bottom-color: var(--sev-stale); }

main { padding-top: 8px; padding-bottom: 64px; }

section {
  padding: 28px 0 8px;
  border-top: 1px solid var(--border);
}
section:first-of-type { border-top: 0; padding-top: 24px; }
section > h2 {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0 0 14px;
}

aside[role="alert"].secret-banner {
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: var(--radius-2);
  background: var(--sev-secret-bg);
  border: 1px solid var(--sev-secret);
  color: var(--ink);
  font-weight: 500;
}

/* Verdict */
.verdict {
  margin: 0;
  padding: 18px 18px 18px 22px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-2);
  color: var(--ink);
  font-size: 1.05rem;
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 10px;
}
.verdict .v-icon { color: var(--accent); flex: 0 0 auto; }
.verdict.s-blocked { border-left-color: var(--sev-critical); }
.verdict.s-blocked .v-icon { color: var(--sev-critical); }
.verdict.s-stale { border-left-color: var(--sev-stale); }
.verdict.s-stale .v-icon { color: var(--sev-stale); }
.verdict.s-terminal-ok, .verdict.s-in-progress { border-left-color: var(--accent); }
.verdict.s-secret { border-left-color: var(--sev-secret); }
.verdict.s-secret .v-icon { color: var(--sev-secret); }

/* Status grid */
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.grid-cell {
  position: relative;
  padding: 14px 16px 14px 18px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-2);
  overflow: hidden;
}
.grid-cell::before {
  content: "";
  position: absolute;
  top: 0; bottom: 0; left: 0;
  width: 3px;
  background: var(--sev-idle);
}
.grid-cell[data-tone="critical"]::before { background: var(--sev-critical); }
.grid-cell[data-tone="high"]::before { background: var(--sev-high); }
.grid-cell[data-tone="medium"]::before { background: var(--sev-medium); }
.grid-cell[data-tone="low"]::before { background: var(--sev-low); }
.grid-cell[data-tone="ok"]::before { background: var(--sev-ok); }
.grid-cell[data-tone="accent"]::before { background: var(--accent); }
.grid-cell[data-tone="critical"] { background: var(--sev-critical-bg); }
.grid-cell[data-tone="high"] { background: var(--sev-high-bg); }
.grid-cell[data-tone="medium"] { background: var(--sev-medium-bg); }
.grid-cell[data-tone="ok"] { background: var(--sev-ok-bg); }
.grid-label {
  color: var(--muted);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 8px;
}
.grid-label .icon { color: var(--ink-2); }
.grid-cell[data-tone="critical"] .grid-label .icon { color: var(--sev-critical); }
.grid-cell[data-tone="high"] .grid-label .icon { color: var(--sev-high); }
.grid-cell[data-tone="medium"] .grid-label .icon { color: var(--sev-medium); }
.grid-cell[data-tone="ok"] .grid-label .icon { color: var(--sev-ok); }
.grid-value {
  font-size: 1.65rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.15;
}
.grid-cell[data-tone="critical"] .grid-value { color: var(--sev-critical); }
.grid-cell[data-tone="ok"] .grid-value { color: var(--sev-ok); }
.grid-value.text { font-size: 1.05rem; letter-spacing: -0.005em; font-weight: 500; }

/* Severity pill */
.sev-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid var(--border-strong);
  color: var(--ink-2);
  background: var(--bg-elev);
  white-space: nowrap;
}
.sev-pill.s-critical { color: var(--sev-critical); border-color: var(--sev-critical); background: var(--sev-critical-bg); }
.sev-pill.s-high { color: var(--sev-high); border-color: var(--sev-high); background: var(--sev-high-bg); }
.sev-pill.s-medium { color: var(--sev-medium); border-color: var(--sev-medium); background: var(--sev-medium-bg); }
.sev-pill.s-low { color: var(--sev-low); border-color: var(--sev-low); background: var(--sev-low-bg); }
.sev-pill.s-ok { color: var(--sev-ok); border-color: var(--sev-ok); background: var(--sev-ok-bg); }
.sev-pill.s-idle { color: var(--muted); border-color: var(--border-strong); background: var(--bg-elev); }
.sev-pill.s-stale { color: oklch(0.18 0.008 250); border-color: var(--sev-stale); background: var(--sev-stale); }

/* Timeline */
.audit-timeline {
  list-style: none;
  margin: 0;
  padding: 4px 0 4px 18px;
  position: relative;
  border-left: 1px solid var(--border);
}
.audit-timeline > li {
  position: relative;
  padding: 8px 0 8px 18px;
  color: var(--ink-2);
}
.audit-timeline > li::before {
  content: "";
  position: absolute;
  left: -23px;
  top: 14px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--bg);
}
.audit-timeline > li.from-snapshot::before { background: var(--muted-2); }
.audit-timeline > li.muted, .audit-timeline > li.snapshot-gap, .audit-timeline > li.from-snapshot-footnote {
  color: var(--muted);
  font-size: 0.86em;
}
.audit-timeline > li.muted::before, .audit-timeline > li.snapshot-gap::before, .audit-timeline > li.from-snapshot-footnote::before {
  background: transparent;
  border: 1px dashed var(--muted-2);
  width: 7px; height: 7px; left: -22px;
}
.audit-timeline > li .rel { color: var(--ink); font-weight: 500; }
.audit-timeline > li .verdict { color: var(--sev-ok); }
.audit-timeline > li code { color: var(--accent); background: color-mix(in oklch, var(--accent) 10%, transparent); padding: 1px 5px; border-radius: 3px; }
.audit-timeline > li blockquote.briefing {
  margin: 6px 0 0 0;
  padding: 6px 10px;
  border-left: 2px solid var(--border-strong);
  color: var(--muted);
  background: var(--surface);
  border-radius: 0 var(--radius-1) var(--radius-1) 0;
  font-size: 0.92em;
}

/* Open Questions */
.open-questions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.open-questions > li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  padding: 12px 14px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-2);
  color: var(--ink-2);
  line-height: 1.5;
}
.open-questions > li input[type="checkbox"] { margin-top: 6px; accent-color: var(--accent); }
.open-questions > li .oq-body { min-width: 0; }
.open-questions > li .oq-body strong { color: var(--ink); font-weight: 600; }
.open-questions > li.muted { background: transparent; border: 0; padding: 4px 0; color: var(--muted); }
.open-questions > li[data-sev="critical"] { border-left: 3px solid var(--sev-critical); }
.open-questions > li[data-sev="high"] { border-left: 3px solid var(--sev-high); }
.open-questions > li[data-sev="medium"] { border-left: 3px solid var(--sev-medium); }
.open-questions > li[data-sev="low"] { border-left: 3px solid var(--sev-low); }

/* Risks table */
table { border-collapse: collapse; width: 100%; font-size: 0.94rem; }
.risks {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-2);
  overflow: hidden;
}
.risks thead th {
  text-align: left;
  padding: 10px 14px;
  background: var(--surface-hi);
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
}
.risks tbody td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  color: var(--ink-2);
}
.risks tbody tr:last-child td { border-bottom: 0; }
.risks tbody tr[data-tone="critical"] td:first-child { box-shadow: inset 3px 0 0 var(--sev-critical); }
.risks tbody tr[data-tone="high"] td:first-child { box-shadow: inset 3px 0 0 var(--sev-high); }
.risks tbody tr[data-tone="medium"] td:first-child { box-shadow: inset 3px 0 0 var(--sev-medium); }
.risks tbody tr[data-tone="low"] td:first-child { box-shadow: inset 3px 0 0 var(--sev-low); }
.risks tbody td.risk-name { color: var(--ink); font-weight: 500; min-width: 220px; }
.risks tbody td.risk-mit { color: var(--muted); font-size: 0.92em; }

/* Worker fanout (already has s-* row classes, just reskin to match) */
.worker-fanout {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-2);
  overflow: hidden;
}
.worker-fanout thead th {
  text-align: left;
  padding: 10px 14px;
  background: var(--surface-hi);
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
}
.worker-fanout tbody td { padding: 10px 14px; border-bottom: 1px solid var(--border); color: var(--ink-2); }
.worker-fanout tbody tr:last-child td { border-bottom: 0; }
.worker-fanout tbody tr.s-blocked td:first-child { box-shadow: inset 3px 0 0 var(--sev-critical); }
.worker-fanout tbody tr.s-stale td:first-child, .worker-fanout tbody tr.s-worker-stale td:first-child { box-shadow: inset 3px 0 0 var(--sev-stale); }
.worker-fanout tbody tr.s-worker-alive td:first-child { box-shadow: inset 3px 0 0 var(--sev-ok); }
.worker-fanout tbody tr.s-terminal-ok td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
.worker-fanout tbody tr.s-in-progress td:first-child { box-shadow: inset 3px 0 0 var(--accent); }

/* Footer */
footer {
  margin-top: 32px;
  padding-top: 16px;
  padding-bottom: 24px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.82rem;
}

/* Legacy color class fallbacks (kept for any external markdown consumers) */
.muted { color: var(--muted); }
.s-blocked { color: var(--sev-critical); }
.s-stale { color: var(--sev-stale); }
.s-worker-alive { color: var(--sev-ok); }
.s-worker-stale { color: var(--sev-stale); }
.s-secret { color: var(--sev-secret); }
.s-in-progress, .s-terminal-ok { color: var(--accent); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
@media (max-width: 640px) {
  main, header, footer { padding-left: 16px; padding-right: 16px; }
  section { padding-top: 22px; }
  .grid-value { font-size: 1.35rem; }
}`;

const STALE_SCRIPT = `(function(){var d=Number(document.body.dataset.derivedMs)||0;function c(){if(document.hidden)return;var a=Date.now()-d;document.body.dataset.stale=a>60000?'1':'0';}c();document.addEventListener('visibilitychange',c);setInterval(c,5000);})();`;

function verdictTone(verdict) {
  const tone = (verdict && verdict.tone) || '';
  return tone || 'in-progress';
}

function renderHtml(model, sections, verdict, derivedAt, formatUtils) {
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const m = model || {};
  const [grid, fanout, timeline, questions, risks] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  const safeVerdictText = escapeHtml(verdict.text);
  const safeVerdictIcon = escapeHtml(verdict.icon);
  const tone = verdictTone(verdict);

  const parts = [];
  parts.push('<!doctype html>');
  parts.push('<html lang="ko">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>mccp Status · ' + safeVerdictText + '</title>');
  parts.push('<style>' + PALETTE_DARK + LAYOUT + '</style>');
  parts.push('</head>');
  parts.push('<body data-stale="0" data-derived-ms="' + (Number.isFinite(derivedMs) ? derivedMs : 0) + '">');
  parts.push('<header>');
  parts.push('<span class="brand"><span class="accent">mccp</span> Status</span>');
  parts.push('<span class="v-icon">' + safeVerdictIcon + '</span>');
  parts.push('<span class="v-text">' + safeVerdictText + '</span>');
  parts.push('<span class="grow"></span>');
  parts.push('<span class="stale-chip">⏱ 캐시 stale</span>');
  parts.push('<span class="meta">Refreshed <code>' + escapeHtml(relative) + '</code></span>');
  parts.push('</header>');
  parts.push('<main>');
  if (m.masked === false) {
    parts.push('<aside role="alert" class="secret-banner s-secret">⚠ raw — 절대 외부 공유 금지</aside>');
  }

  parts.push('<section id="verdict"><h2>Verdict</h2><blockquote class="verdict s-' + escapeHtml(tone) + '">'
    + '<span class="v-icon">' + safeVerdictIcon + '</span><span>' + safeVerdictText + '</span></blockquote></section>');

  parts.push('<section id="status"><h2>Status</h2>' + (grid ? grid.html : '') + '</section>');

  if (fanout) {
    parts.push('<section id="workers"><h2>Workers</h2>' + fanout.html + '</section>');
  }

  parts.push('<section id="timeline"><h2>Timeline</h2>' + (timeline ? timeline.html : '') + '</section>');

  if (questions) {
    parts.push('<section id="questions"><h2>Open Questions</h2>' + questions.html + '</section>');
  }

  parts.push('<section id="risks"><h2>Risks</h2>' + (risks ? risks.html : '') + '</section>');

  parts.push('</main>');
  parts.push('<footer>Derived from <code>.claude/</code> via <code>plugins/mccp/scripts/derive</code> · v1.3.0-m3 renderer</footer>');
  parts.push('<script>' + STALE_SCRIPT + '</script>');
  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}

module.exports = { renderHtml };
