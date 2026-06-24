'use strict';

const { buildActionPrompt, maxRank } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildRiskDetail, renderDetailMd } = require('../parsers/drawer-detail');

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

  // v1.18.1 M3 — 드로어 detail 누적(안정 키 = plan ordinal, 정렬과 무관한 parse-time
  // 순서). 충돌 hard-fail은 drawer-detail. 빌드 실패는 항목만 skip(fail-open).
  const detailMap = new Map();

  function renderItem(r) {
    const sev = sevOf(r) || 'MEDIUM';
    const icon = severityMeta(sev).icon;
    const text = r.risk || '';
    const sevTag = sevBadgeHtml(sev);
    const qHtml = '<div class="li-q">' + renderProseHtml(text, formatUtils) + '</div>';
    const mitHtml = r.mitigation
      ? '<div class="meta-cue mit">완화: <b>' + renderProseHtml(r.mitigation, formatUtils) + '</b></div>'
      : '';
    // v1.18.1 M3 — relatedOpenQuestion 도 renderProseHtml(inline-markdown) 로 —
    // escapeHtml 만이면 OQ 스니펫의 **bold**/`code` 가 literal 누출(H16, Constraint 3).
    const cueHtml = r.relatedOpenQuestion
      ? '<div class="meta-cue">동일 질문 참조: ' + renderProseHtml(r.relatedOpenQuestion, formatUtils) + '…</div>'
      : '';
    // Markdown — 구분자는 ·(H10 em-dash 금지).
    const ap = buildActionPrompt(r, 'risk');
    // 드로어 detail — REQUIRED(위험 전문/severity/impact/likelihood/완화/결정).
    const rawId = detailId('risk', { source: r.source, ordinal: r.ordinal });
    const detail = buildRiskDetail(
      Object.assign({}, r, { severity: sev, actionPrompt: ap.fullText }),
      formatUtils,
    );
    const { id } = addDetail(detailMap, rawId, detail);
    const html = '<li class="li-item" data-detail-id="' + escapeHtml(id) + '">' + sevTag
      + '<div class="li-main">' + qHtml + mitHtml + cueHtml + '</div></li>';
    // v1.18.2 M4 — STATUS.md 동등본. 항목 헤더(위험 전문) + drawer-detail SSoT 인라인.
    // 영향/가능성/관련 결정/완화책/동일 질문 참조/다음 액션은 모두 renderDetailMd 단일
    // 경로(섹션 자체 재구성 0). 이전 md 가 누락하던 영향·가능성·관련 결정이 plain-text
    // 로 새로 노출. relatedOpenQuestion 은 buildRiskDetail SSoT 행으로 보존(Codex F2).
    const titleText = detail.titleText || renderProseMd(text);
    const detailMd = renderDetailMd(detail, formatUtils);
    const md = '- ' + icon + ' **' + sev + '** · ' + titleText
      + (detailMd ? '\n' + detailMd : '');
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

  return { md, html, foot, details: detailMap };
}

module.exports = { renderRisks };
