'use strict';

const { buildActionPrompt, maxRank } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildRiskDetail, renderDetailMd } = require('../parsers/drawer-detail');
const { stripMarker } = require('../parsers/resolution-marker');
const { buildTabs } = require('../parsers/tabs');

const MAX_EXPANDED = 3;
const RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };

function sevOf(r) {
  return String(maxRank(r && r.impact, r && r.likelihood) || '').toUpperCase();
}

function renderRisks(model, formatUtils, planBody) {
  const { escapeHtml, renderProseHtml, renderProseMd } = formatUtils;
  const pb = planBody || {};
  const allRisks = Array.isArray(pb.risks) ? pb.risks.slice() : [];

  // M3 — 해결 마커 단 위험은 active 에서 분리. resolved 신호는 마커뿐(Codex F1).
  const bySev = (a, b) => (RANK_MAP[sevOf(b)] || 0) - (RANK_MAP[sevOf(a)] || 0);
  const active = allRisks.filter((r) => !r.resolved).sort(bySev);
  const resolved = allRisks.filter((r) => r.resolved).sort(bySev);

  if (active.length === 0 && resolved.length === 0) {
    return {
      md: '_발견된 위험이 없습니다._',
      html: '<p class="muted"><em>발견된 위험이 없습니다.</em></p>',
    };
  }

  const expanded = active.slice(0, MAX_EXPANDED);
  const collapsed = active.slice(MAX_EXPANDED);

  // v1.18.1 M3 — 드로어 detail 누적(안정 키 = plan ordinal, 정렬과 무관한 parse-time
  // 순서). 충돌 hard-fail은 drawer-detail. 빌드 실패는 항목만 skip(fail-open).
  // active + resolved 항목 모두 renderItem 경유 → detail 키 == trigger 수(H18).
  const detailMap = new Map();

  function renderItem(r) {
    const sev = sevOf(r) || 'MEDIUM';
    const icon = severityMeta(sev).icon;
    // M3 (Constraint 3) — 마커는 parser 가 이미 제거했으나 누출 방어로 stripMarker.
    const text = stripMarker(r.risk || '');
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
    // Markdown — 구분자는 ·(H10 em-dash 금지). action prompt 도 marker-free risk 로
    // 빌드(raw r 사용 시 action 텍스트에 마커 누출 → detailMd 경유 md 오염).
    const rClean = Object.assign({}, r, { risk: text });
    const ap = buildActionPrompt(rClean, 'risk');
    // 드로어 detail — REQUIRED(위험 전문/severity/impact/likelihood/완화/결정).
    const rawId = detailId('risk', { source: r.source, ordinal: r.ordinal });
    const detail = buildRiskDetail(
      Object.assign({}, rClean, { severity: sev, actionPrompt: ap.fullText }),
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
  const resolvedR = resolved.map(renderItem);

  // 미해결(active) 패널 inner — top-3 + 더보기(Constraint 4 불변). active 0 이면
  // 정중한 empty-state(Task 11).
  let activeInner;
  if (active.length === 0) {
    activeInner = '<p class="muted"><em>발견된 위험이 없습니다.</em></p>';
  } else {
    activeInner = '<ul class="stack-list" role="list">' + expandedR.map(r => r.html).join('') + '</ul>';
    if (collapsed.length > 0) {
      activeInner += '<details class="more"><summary>'
        + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-arrow"/></svg>+'
        + collapsed.length + ' 더보기</summary>'
        + '<ul class="stack-list" role="list">' + collapsedR.map(r => r.html).join('') + '</ul></details>';
    }
  }

  // M3-b — 완화/해결 이력을 탭 뒤로(메인 흐름에서 큰 숫자 제거 → "250개 위험" 착시
  // 해소). 완화됨이 있을 때만 탭(미해결 default-checked · 완화됨 N); 없으면 미해결
  // 패널 직접 노출. resolved 큰 숫자는 탭 label 에만(Constraint 2 neutral 뱃지).
  // 드로어 detail 은 active/resolved 모두 detailMap 적재(H18 trigger==detail).
  let html;
  if (resolved.length > 0) {
    const resolvedInner = '<ul class="stack-list" role="list">' + resolvedR.map(r => r.html).join('') + '</ul>';
    html = buildTabs({
      name: 'tab-risks',
      tabs: [
        { id: 'active', label: '미해결', count: active.length, panelHtml: activeInner, checked: true },
        { id: 'resolved', label: '완화됨', count: resolved.length, panelHtml: resolvedInner },
      ],
    }, formatUtils);
  } else {
    html = activeInner;
  }

  // MD — STATUS.md plain-text 동등. 미해결 본문 + 완화됨 N건 접힘(탭은 plain-text
  // 부적합 → details 매핑, drawer-detail SSoT 불변).
  let md;
  if (active.length === 0) {
    md = '_발견된 위험이 없습니다._';
  } else {
    md = expandedR.map(r => r.md).join('\n');
    if (collapsed.length > 0) {
      md += '\n\n<details>\n<summary>+' + collapsed.length + ' 더보기</summary>\n\n'
        + collapsedR.map(r => r.md).join('\n')
        + '\n\n</details>';
    }
  }
  if (resolved.length > 0) {
    md += '\n\n<details>\n<summary>완화됨 ' + resolved.length + '건</summary>\n\n'
      + resolvedR.map(r => r.md).join('\n')
      + '\n\n</details>';
  }

  // panel-foot foot-link — 활동 기록 전체 보기로 cross-link (html.js renderPanel opts).
  const foot = '<a class="foot-link" href="#route-activity">활동 기록에서 전체 보기'
    + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-arrow"/></svg></a>';

  return { md, html, foot, details: detailMap, activeCount: active.length };
}

module.exports = { renderRisks };
