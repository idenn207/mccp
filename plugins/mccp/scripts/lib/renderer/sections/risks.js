'use strict';

const { buildActionPrompt, maxRank } = require('../parsers/action-prompt');
const { renderJargonHtml, renderJargonMarkdown } = require('../parsers/jargon-dictionary');

const MAX_EXPANDED = 3;
const SEVERITY_ICON = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪', '': '⚪' };
const RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };

function sevOf(r) {
  return String(maxRank(r && r.impact, r && r.likelihood) || '').toUpperCase();
}

function renderRisks(model, formatUtils, planBody) {
  const { escapeHtml, escapeAttr } = formatUtils;
  const pb = planBody || {};
  const allRisks = Array.isArray(pb.risks) ? pb.risks.slice() : [];

  if (allRisks.length === 0) {
    return {
      md: '_미해결 위험 없음_',
      html: '<p class="muted"><em>미해결 위험 없음</em></p>',
    };
  }

  allRisks.sort((a, b) => (RANK_MAP[sevOf(b)] || 0) - (RANK_MAP[sevOf(a)] || 0));
  const expanded = allRisks.slice(0, MAX_EXPANDED);
  const collapsed = allRisks.slice(MAX_EXPANDED);
  const jargonSeenHtml = new Set();

  function renderItem(r) {
    const sev = sevOf(r) || 'MEDIUM';
    const icon = SEVERITY_ICON[sev] || '⚪';
    const ap = buildActionPrompt(r, 'risk');
    const text = r.risk || '';
    const textHtml = '<span class="item-text">'
      + renderJargonHtml(text, { seen: jargonSeenHtml }, escapeHtml, escapeAttr)
      + '</span>';
    const mitHtml = r.mitigation
      ? '<div class="risk-mitigation muted">mitigation: '
        + renderJargonHtml(r.mitigation, { seen: jargonSeenHtml }, escapeHtml, escapeAttr)
        + '</div>'
      : '';
    const cueHtml = r.relatedOpenQuestion
      ? '<aside class="related-oq">동일 OQ 참조: ' + escapeHtml(r.relatedOpenQuestion) + '…</aside>'
      : '';
    const sevTag = '<span class="severity-tag s-' + escapeHtml(sev.toLowerCase()) + '">'
      + icon + ' ' + escapeHtml(sev) + '</span>';
    // F1 absorption — data-copy는 escapeHtml만
    const apHtml = '<div class="action-prompt">'
      + '<code>' + escapeHtml(ap.fullText) + '</code>'
      + '<button class="copy-btn" data-copy="' + escapeHtml(ap.fullText)
      + '" type="button">복사</button>'
      + '</div>';
    const html = '<li class="risk-item">' + sevTag + ' ' + textHtml + mitHtml + cueHtml + apHtml + '</li>';
    // Markdown
    const mdSeen = new Set();
    const textMd = renderJargonMarkdown(text, { seen: mdSeen });
    const mitMd = r.mitigation
      ? '\n  - mitigation: ' + renderJargonMarkdown(r.mitigation, { seen: mdSeen })
      : '';
    const cueMd = r.relatedOpenQuestion ? '\n  - 동일 OQ 참조: ' + r.relatedOpenQuestion + '…' : '';
    const md = '- ' + icon + ' **' + sev + '** — ' + textMd
      + mitMd + cueMd
      + '\n  - 다음 액션: `' + ap.fullText + '`';
    return { html, md };
  }

  const expandedR = expanded.map(renderItem);
  const collapsedR = collapsed.map(renderItem);

  let html = '<ul class="risks-list" role="list">' + expandedR.map(r => r.html).join('') + '</ul>';
  if (collapsed.length > 0) {
    html += '<details class="risks-more"><summary>+' + collapsed.length + ' 더보기</summary>'
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

module.exports = { renderRisks };
