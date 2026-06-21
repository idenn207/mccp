'use strict';

// v1.3.0-m3-redux — plain <ul>, no card wrapper, no UPPERCASE pills.
// Severity surfaces as a tiny lowercase tag (`<span class="tag t-medium">medium</span>`).
// Only `critical` ever takes signal-red color.

const MAX_ITEMS = 15;

const SEV_RE = /^\s*\*\*\s*(CRITICAL|HIGH|MEDIUM|LOW)\b[^*]*\*\*\s*:?\s*/i;

function extractSeverity(text) {
  const m = String(text || '').match(SEV_RE);
  if (!m) return { sev: null, rest: String(text || '') };
  return { sev: m[1].toUpperCase(), rest: String(text).slice(m[0].length) };
}

function renderInlineBold(s, escapeHtml) {
  // Convert `**x**` to <strong>x</strong>; escape the rest. Bold runs first
  // so escapeHtml never sees raw HTML.
  const out = [];
  let i = 0;
  const re = /\*\*([^*]+)\*\*/g;
  let match;
  while ((match = re.exec(s)) !== null) {
    if (match.index > i) out.push(escapeHtml(s.slice(i, match.index)));
    out.push('<strong>' + escapeHtml(match[1]) + '</strong>');
    i = match.index + match[0].length;
  }
  if (i < s.length) out.push(escapeHtml(s.slice(i)));
  return out.join('');
}

function renderOpenQuestions(model, formatUtils, planBody) {
  const { escapeHtml, normalizeProse } = formatUtils;
  const m = model || {};
  const sources = m.sources || {};
  const stateItem = sources.state && sources.state.item;
  const stateBody = (stateItem && stateItem.body) || {};
  const stateOQ = Array.isArray(stateBody.open_questions) ? stateBody.open_questions : [];

  const pb = planBody || {};
  const planOQ = Array.isArray(pb.openQuestions) ? pb.openQuestions : [];

  const seen = new Set();
  const merged = [];
  for (const text of stateOQ) {
    const s = String(text || '').trim();
    if (s && !seen.has(s)) { seen.add(s); merged.push({ source: 'state', text: s }); }
  }
  for (const entry of planOQ) {
    const s = String((entry && entry.text) || '').trim();
    if (s && !seen.has(s)) { seen.add(s); merged.push({ source: entry.source || 'plan', text: s }); }
  }

  if (merged.length === 0) return null;

  const shown = merged.slice(0, MAX_ITEMS);
  const moreCount = Math.max(0, merged.length - MAX_ITEMS);

  const mdLines = shown.map(q => '- [ ] ' + q.text);
  const htmlItems = shown.map(q => {
    const { sev, rest } = extractSeverity(q.text);
    const sevTag = sev
      ? '<span class="tag t-' + sev.toLowerCase() + '">' + sev.toLowerCase() + '</span>'
      : '';
    const bodyHtml = renderInlineBold(normalizeProse(rest), escapeHtml);
    return '<li>' + sevTag + bodyHtml + '</li>';
  }).join('');
  let md = mdLines.join('\n');
  let html = '<ul class="open-questions" role="list">' + htmlItems + '</ul>';
  if (moreCount > 0) {
    md += '\n- _+' + moreCount + ' more_';
    html = html.replace('</ul>', '<li class="muted"><em>+' + moreCount + ' more</em></li></ul>');
  }
  return { md, html };
}

module.exports = { renderOpenQuestions };
