'use strict';

const path = require('path');
const { buildActionPrompt } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildOQDetail, renderDetailMd } = require('../parsers/drawer-detail');

const MAX_EXPANDED = 3;

function severityIcon(sev) {
  return severityMeta(sev).icon;
}

// 출처 단서 — 파일 basename + 섹션(headingPath 첫 항목) 분리. li-item 의 meta-cue 에
// mono 파일 + cue-sec 섹션으로 렌더. (line 번호는 섹션 뒤 보조.)
function metaCueParts(q) {
  if (!q || (!q.source && !q.lineNumber)) return null;
  const file = q.source ? path.basename(q.source) : null;
  const head = (q.headingPath && q.headingPath[0]) || '## Open Questions';
  const section = head.replace(/^#+\s+/, '');
  const line = q.lineNumber ? 'line ' + q.lineNumber : '';
  return { file, section, line };
}

function inferSeverity(text) {
  const m = /\b(critical|high|medium|low)\b/i.exec(String(text || ''));
  if (m) return m[1].toUpperCase();
  return 'MEDIUM';
}

function renderOpenQuestions(model, formatUtils, planBody) {
  const { escapeHtml, renderProseHtml, renderProseMd } = formatUtils;
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

  // v1.18.1 M3 — 드로어 detail 누적. 항목 li 에 data-detail-id 부여, drawer-detail
  // SSoT 로 상세 빌드. 안정 키(lineNumber/ordinal)·충돌 hard-fail은 drawer-detail.
  const detailMap = new Map();

  function renderItem(q, mergedIndex) {
    const sev = q.severity || 'MEDIUM';
    const ap = buildActionPrompt(q, 'openQuestion');
    const cue = metaCueParts(q);
    const sevTag = sevBadgeHtml(sev);
    const qHtml = '<div class="li-q">' + renderProseHtml(q.text, formatUtils) + '</div>';
    let cueHtml = '';
    if (cue) {
      const inner = [];
      if (cue.file) inner.push('출처 <span class="mono">' + escapeHtml(cue.file) + '</span>');
      if (cue.section) inner.push('<span class="cue-sec">' + escapeHtml(cue.section) + '</span>');
      if (cue.line) inner.push('<span class="cue-sec">' + escapeHtml(cue.line) + '</span>');
      cueHtml = '<div class="meta-cue">' + inner.join(' ') + '</div>';
    }
    // data-copy 는 escapeHtml 만 (escapeAttr URL-encode 회피).
    const promptHtml = '<div class="inline-prompt">'
      + '<code>' + escapeHtml(ap.fullText) + '</code>'
      + '<button class="copy-btn" type="button" data-copy="' + escapeHtml(ap.fullText)
      + '" aria-label="다음 액션 복사"><svg class="i i-sm" aria-hidden="true"><use href="#ic-copy"/></svg></button>'
      + '</div>';
    // 드로어 detail — 안정 키 + REQUIRED 필드(질문/출처/섹션/severity/action).
    const rawId = detailId('oq', {
      source: q.source,
      lineNumber: q.lineNumber,
      ordinal: typeof q.ordinal === 'number' ? q.ordinal : mergedIndex,
    });
    const detail = buildOQDetail(
      Object.assign({}, q, { severity: sev, actionPrompt: ap.fullText }),
      formatUtils,
    );
    const { id } = addDetail(detailMap, rawId, detail);
    const html = '<li class="li-item" data-detail-id="' + escapeHtml(id) + '">' + sevTag
      + '<div class="li-main">' + qHtml + cueHtml + promptHtml + '</div></li>';
    // v1.18.2 M4 — STATUS.md 동등본. 항목 헤더(텍스트) + drawer-detail SSoT 인라인.
    // 출처/섹션/line/관련 결정/다음 액션은 모두 renderDetailMd 단일 경로(섹션 자체
    // 재구성 0). 헤더 텍스트는 detail.titleText(raw 평문, H10 normalize). 구분자 ·(H10).
    const titleText = detail.titleText || renderProseMd(q.text);
    const detailMd = renderDetailMd(detail, formatUtils);
    const md = '- ' + severityIcon(sev) + ' **' + sev + '** · ' + titleText
      + (detailMd ? '\n' + detailMd : '');
    return { html, md };
  }

  const expandedR = expanded.map((q, i) => renderItem(q, i));
  const collapsedR = collapsed.map((q, i) => renderItem(q, MAX_EXPANDED + i));

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
  return { md, html, details: detailMap };
}

module.exports = { renderOpenQuestions };
