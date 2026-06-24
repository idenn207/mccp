'use strict';

const path = require('path');
const { buildActionPrompt } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildOQDetail, renderDetailMd } = require('../parsers/drawer-detail');
const { stripMarker } = require('../parsers/resolution-marker');
const { buildTabs } = require('../parsers/tabs');

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
  // M3 — 해결 마커 단 plan-OQ 는 active 에서 분리. STATE.md OQ 는 resolved flag 가
  // 없어 항상 active. _mergedIndex 를 split 이전 박아 ordinal fallback(STATE.md OQ
  // 안정 키)이 active/resolved 양쪽에서 전역 유일하게 한다.
  merged.forEach((q, i) => { q._mergedIndex = i; });
  const active = merged.filter((q) => !q.resolved);
  const resolved = merged.filter((q) => q.resolved);
  const expanded = active.slice(0, MAX_EXPANDED);
  const collapsed = active.slice(MAX_EXPANDED);

  // v1.18.1 M3 — 드로어 detail 누적. 항목 li 에 data-detail-id 부여, drawer-detail
  // SSoT 로 상세 빌드. 안정 키(lineNumber/ordinal)·충돌 hard-fail은 drawer-detail.
  const detailMap = new Map();

  function renderItem(q, mergedIndex) {
    const sev = q.severity || 'MEDIUM';
    // M3 (Constraint 3) — 마커 누출 방어(parser 가 이미 제거하나 STATE.md OQ 포함 일괄).
    const text = stripMarker(q.text);
    const qForDetail = Object.assign({}, q, { text });
    const ap = buildActionPrompt(qForDetail, 'openQuestion');
    const cue = metaCueParts(q);
    const sevTag = sevBadgeHtml(sev);
    const qHtml = '<div class="li-q">' + renderProseHtml(text, formatUtils) + '</div>';
    let cueHtml = '';
    if (cue) {
      const inner = [];
      if (cue.file) inner.push('출처 <span class="mono">' + escapeHtml(cue.file) + '</span>');
      if (cue.section) inner.push('<span class="cue-sec">' + escapeHtml(cue.section) + '</span>');
      if (cue.line) inner.push('<span class="cue-sec">' + escapeHtml(cue.line) + '</span>');
      cueHtml = '<div class="meta-cue">' + inner.join(' ') + '</div>';
    }
    // v1.18.7 M4 — 메인은 복사 버튼만(verbose <code>{전체 명령} 제거). 전체 명령
    // 텍스트는 드로어 detail.action + md renderDetailMd 의 '다음 액션' 행에 보존.
    // li-action = 복사 affordance 전용 경량 wrapper(verbose inline-prompt 대체).
    // data-copy 는 escapeHtml 만 (escapeAttr URL-encode 회피).
    const promptHtml = '<div class="li-action">'
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
      Object.assign({}, qForDetail, { severity: sev, actionPrompt: ap.fullText }),
      formatUtils,
    );
    const { id } = addDetail(detailMap, rawId, detail);
    const html = '<li class="li-item" data-detail-id="' + escapeHtml(id) + '">' + sevTag
      + '<div class="li-main">' + qHtml + cueHtml + promptHtml + '</div></li>';
    // v1.18.2 M4 — STATUS.md 동등본. 항목 헤더(텍스트) + drawer-detail SSoT 인라인.
    // 출처/섹션/line/관련 결정/다음 액션은 모두 renderDetailMd 단일 경로(섹션 자체
    // 재구성 0). 헤더 텍스트는 detail.titleText(raw 평문, H10 normalize). 구분자 ·(H10).
    const titleText = detail.titleText || renderProseMd(text);
    const detailMd = renderDetailMd(detail, formatUtils);
    const md = '- ' + severityIcon(sev) + ' **' + sev + '** · ' + titleText
      + (detailMd ? '\n' + detailMd : '');
    return { html, md };
  }

  const expandedR = expanded.map((q) => renderItem(q, q._mergedIndex));
  const collapsedR = collapsed.map((q) => renderItem(q, q._mergedIndex));
  const resolvedR = resolved.map((q) => renderItem(q, q._mergedIndex));

  // 미해결(active) 패널 inner — top-3 + 더보기(Constraint 4 불변). active 0 이면
  // 정중한 empty-state(Task 11).
  let activeInner;
  if (active.length === 0) {
    activeInner = '<p class="muted"><em>미해결 질문이 없습니다.</em></p>';
  } else {
    activeInner = '<ul class="stack-list" role="list">' + expandedR.map(r => r.html).join('') + '</ul>';
    if (collapsed.length > 0) {
      activeInner += '<details class="more"><summary>'
        + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-arrow"/></svg>+'
        + collapsed.length + ' 더보기</summary>'
        + '<ul class="stack-list" role="list">' + collapsedR.map(r => r.html).join('') + '</ul></details>';
    }
  }

  // M3-b — 해결 이력을 탭 뒤로(메인 흐름에서 큰 숫자 제거 → "40개 미해결" 착시 해소).
  // 해결됨이 있을 때만 탭(미해결 default-checked · 해결됨 N); 없으면 미해결 직접 노출.
  let html;
  if (resolved.length > 0) {
    const resolvedInner = '<ul class="stack-list" role="list">' + resolvedR.map(r => r.html).join('') + '</ul>';
    html = buildTabs({
      name: 'tab-questions',
      tabs: [
        { id: 'active', label: '미해결', count: active.length, panelHtml: activeInner, checked: true },
        { id: 'resolved', label: '해결됨', count: resolved.length, panelHtml: resolvedInner },
      ],
    }, formatUtils);
  } else {
    html = activeInner;
  }

  // MD — STATUS.md plain-text 동등. 미해결 본문 + 해결됨 N건 접힘(drawer-detail SSoT 불변).
  let md;
  if (active.length === 0) {
    md = '_미해결 질문이 없습니다._';
  } else {
    md = expandedR.map(r => r.md).join('\n');
    if (collapsed.length > 0) {
      md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
        + collapsedR.map(r => r.md).join('\n')
        + '\n\n</details>';
    }
  }
  if (resolved.length > 0) {
    md += '\n\n<details>\n<summary>해결됨 ' + resolved.length + '건</summary>\n\n'
      + resolvedR.map(r => r.md).join('\n')
      + '\n\n</details>';
  }
  return { md, html, details: detailMap, activeCount: active.length };
}

module.exports = { renderOpenQuestions };
