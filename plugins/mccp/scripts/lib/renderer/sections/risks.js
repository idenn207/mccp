'use strict';

const { buildActionPrompt, maxRank } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');

const MAX_EXPANDED = 3;
const RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };

function sevOf(r) {
  return String(maxRank(r && r.impact, r && r.likelihood) || '').toUpperCase();
}

function renderRisks(model, formatUtils, planBody) {
  const { escapeHtml, renderProseHtml, renderProseMd } = formatUtils;
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

  function renderItem(r) {
    const sev = sevOf(r) || 'MEDIUM';
    const icon = severityMeta(sev).icon;
    const text = r.risk || '';
    const sevTag = sevBadgeHtml(sev);
    const qHtml = '<div class="li-q">' + renderProseHtml(text, formatUtils) + '</div>';
    const mitHtml = r.mitigation
      ? '<div class="meta-cue mit">완화: <b>' + renderProseHtml(r.mitigation, formatUtils) + '</b></div>'
      : '';
    const cueHtml = r.relatedOpenQuestion
      ? '<div class="meta-cue">동일 질문 참조: ' + escapeHtml(r.relatedOpenQuestion) + '…</div>'
      : '';
    const html = '<li class="li-item">' + sevTag
      + '<div class="li-main">' + qHtml + mitHtml + cueHtml + '</div></li>';
    // Markdown — 구분자는 ·(H10 em-dash 금지).
    const ap = buildActionPrompt(r, 'risk');
    const textMd = renderProseMd(text);
    const mitMd = r.mitigation ? '\n  - 완화: ' + renderProseMd(r.mitigation) : '';
    const cueMd = r.relatedOpenQuestion ? '\n  - 동일 질문 참조: ' + r.relatedOpenQuestion + '…' : '';
    const md = '- ' + icon + ' **' + sev + '** · ' + textMd
      + mitMd + cueMd
      + '\n  - 다음 액션: `' + ap.fullText + '`';
    return { html, md };
  }

  const expandedR = expanded.map(renderItem);
  const collapsedR = collapsed.map(renderItem);

  let html = '<ul class="stack-list" role="list">' + expandedR.map(r => r.html).join('') + '</ul>';
  if (collapsed.length > 0) {
    html += '<details class="more"><summary>'
      + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-arrow"/></svg>+'
      + collapsed.length + ' 더보기</summary>'
      + '<ul class="stack-list" role="list">' + collapsedR.map(r => r.html).join('') + '</ul></details>';
  }
  let md = expandedR.map(r => r.md).join('\n');
  if (collapsed.length > 0) {
    md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
      + collapsedR.map(r => r.md).join('\n')
      + '\n\n</details>';
  }

  // panel-foot foot-link — 활동 기록 전체 보기로 cross-link (html.js renderPanel opts).
  const foot = '<a class="foot-link" href="#route-activity">활동 기록에서 전체 보기'
    + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-arrow"/></svg></a>';

  return { md, html, foot };
}

module.exports = { renderRisks };
