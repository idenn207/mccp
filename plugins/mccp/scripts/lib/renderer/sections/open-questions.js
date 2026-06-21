'use strict';

const path = require('path');
const { buildActionPrompt } = require('../parsers/action-prompt');
const { renderJargonHtml, renderJargonMarkdown } = require('../parsers/jargon-dictionary');
const { severityMeta, severityTagHtml } = require('../parsers/severity-meta');

const MAX_EXPANDED = 3;

function severityIcon(sev) {
  return severityMeta(sev).icon;
}

function metaCue(q) {
  if (!q || (!q.source && !q.lineNumber)) return null;
  const base = q.source ? path.basename(q.source) : null;
  const head = (q.headingPath && q.headingPath[0]) || '## Open Questions';
  const heading = head.replace(/^##\s+/, '');
  const lineN = q.lineNumber ? ', line ' + q.lineNumber : '';
  if (base) return base + ' §' + heading + lineN;
  return '§' + heading + lineN;
}

function inferSeverity(text) {
  const m = /\b(critical|high|medium|low)\b/i.exec(String(text || ''));
  if (m) return m[1].toUpperCase();
  return 'MEDIUM';
}

function renderOpenQuestions(model, formatUtils, planBody) {
  const { escapeHtml, escapeAttr } = formatUtils;
  const m = model || {};
  const sources = m.sources || {};
  const stateItem = sources.state && sources.state.item;
  const stateBody = (stateItem && stateItem.body) || {};
  const stateOQRaw = Array.isArray(stateBody.open_questions) ? stateBody.open_questions : [];
  const pb = planBody || {};
  const planOQ = Array.isArray(pb.openQuestions) ? pb.openQuestions : [];

  const seen = new Set();
  const merged = [];
  for (const text of stateOQRaw) {
    const s = String(text || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    merged.push({ text: s, source: 'STATE.md', severity: 'MEDIUM' });
  }
  for (const q of planOQ) {
    const s = String((q && q.text) || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    merged.push(Object.assign({}, q, {
      text: s,
      severity: q && q.severity ? String(q.severity).toUpperCase() : inferSeverity(s),
    }));
  }

  if (merged.length === 0) return null;
  const expanded = merged.slice(0, MAX_EXPANDED);
  const collapsed = merged.slice(MAX_EXPANDED);
  const jargonSeenHtml = new Set();

  function renderItem(q) {
    const sev = q.severity || 'MEDIUM';
    const ap = buildActionPrompt(q, 'openQuestion');
    const cue = metaCue(q);
    const sevTag = severityTagHtml(sev, escapeHtml);
    const textHtml = '<span class="item-text">'
      + renderJargonHtml(q.text, { seen: jargonSeenHtml }, escapeHtml, escapeAttr)
      + '</span>';
    const cueHtml = cue
      ? '<blockquote class="meta-cue">왜: ' + escapeHtml(cue) + '</blockquote>'
      : '';
    // F1 absorption — data-copy는 escapeHtml만 (escapeAttr URL-encode 회피)
    const apHtml = '<div class="action-prompt">'
      + '<code>' + escapeHtml(ap.fullText) + '</code>'
      + '<button class="copy-btn" data-copy="' + escapeHtml(ap.fullText)
      + '" type="button" aria-label="다음 액션 복사">복사</button>'
      + '</div>';
    const html = '<li class="oq-item">' + sevTag + ' ' + textHtml + cueHtml + apHtml + '</li>';
    // Markdown — jargon seen 별도 (HTML/MD 분리)
    const mdSeen = new Set();
    const textMd = renderJargonMarkdown(q.text, { seen: mdSeen });
    const md = '- ' + severityIcon(sev) + ' **' + sev + '** — ' + textMd
      + (cue ? '\n  - 왜: ' + cue : '')
      + '\n  - 다음 액션: `' + ap.fullText + '`';
    return { html, md };
  }

  const expandedR = expanded.map(renderItem);
  const collapsedR = collapsed.map(renderItem);

  let html = '<ul class="open-questions" role="list">' + expandedR.map(r => r.html).join('') + '</ul>';
  if (collapsed.length > 0) {
    html += '<details class="oq-more"><summary>+' + collapsed.length + ' 더보기</summary>'
      + '<ul role="list">' + collapsedR.map(r => r.html).join('') + '</ul></details>';
  }
  let md = expandedR.map(r => r.md).join('\n');
  if (collapsed.length > 0) {
    md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
      + collapsedR.map(r => r.md).join('\n')
      + '\n\n</details>';
  }
  return { md, html };
}

module.exports = { renderOpenQuestions };
