'use strict';

const MAX_ITEMS = 15;

function renderOpenQuestions(model, formatUtils, planBody) {
  const { escapeHtml } = formatUtils;
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
  const htmlItems = shown.map(q => '<li><input type="checkbox" disabled> ' + escapeHtml(q.text) + '</li>').join('');
  let md = mdLines.join('\n');
  let html = '<ul class="open-questions" role="list">' + htmlItems + '</ul>';
  if (moreCount > 0) {
    md += '\n- _+' + moreCount + ' more_';
    html = html.replace('</ul>', '<li class="muted"><em>+' + moreCount + ' more</em></li></ul>');
  }
  return { md, html };
}

module.exports = { renderOpenQuestions };
