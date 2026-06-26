'use strict';

const path = require('path');
const { buildActionPrompt } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildOQDetail, renderDetailMd } = require('../parsers/drawer-detail');
const { stripMarker } = require('../parsers/resolution-marker');
const { buildTabs } = require('../parsers/tabs');
const { groupByPrd, GLOBAL_KEY, UNKNOWN_KEY } = require('../parsers/prd-group');

// 그룹 chrome 표출 규칙 — 2+ 그룹은 항상 그룹. 단일 그룹은 **실제 PRD 소속**이면
// 헤더 표시(어느 PRD인지 정보 가치), 단일 fallback(프로젝트 전역/출처 미상)이면 flat
// (라벨이 disambiguation 정보 없음 → chrome 노이즈 회피). 위험·질문 동일 규칙.
function shouldShowGroups(rendered) {
  if (rendered.length >= 2) return true;
  if (rendered.length === 1) {
    const k = rendered[0].prdKey;
    return k !== GLOBAL_KEY && k !== UNKNOWN_KEY;
  }
  return false;
}

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

  // v1.18.1 M3 — 드로어 detail 누적. 항목 li 에 data-detail-id 부여, drawer-detail
  // SSoT 로 상세 빌드. 안정 키(lineNumber/ordinal)·충돌 hard-fail은 drawer-detail.
  const detailMap = new Map();

  // prdKey 가 주어지면 li-item 에 data-prd 부여(M2/M3 토대). Data Exploration M1
  // 후속 — 미해결뿐 아니라 해결됨 탭도 그룹 렌더 → 각 항목이 prdKey 동반. STATE.md
  // OQ(source='STATE.md')는 "프로젝트 전역" 버킷.
  function renderItem(q, mergedIndex, prdKey) {
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
    // li-item 직속 우측 child(li-main 밖) → 제목 줄 우상단 정렬(소속 명확).
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
    const prdAttr = prdKey ? ' data-prd="' + escapeHtml(prdKey) + '"' : '';
    const html = '<li class="li-item"' + prdAttr + ' data-detail-id="' + escapeHtml(id) + '">' + sevTag
      + '<div class="li-main">' + qHtml + cueHtml + '</div>' + promptHtml + '</li>';
    // v1.18.2 M4 — STATUS.md 동등본. 항목 헤더(텍스트) + drawer-detail SSoT 인라인.
    // 출처/섹션/line/관련 결정/다음 액션은 모두 renderDetailMd 단일 경로(섹션 자체
    // 재구성 0). 헤더 텍스트는 detail.titleText(raw 평문, H10 normalize). 구분자 ·(H10).
    const titleText = detail.titleText || renderProseMd(text);
    const detailMd = renderDetailMd(detail, formatUtils);
    const md = '- ' + severityIcon(sev) + ' **' + sev + '** · ' + titleText
      + (detailMd ? '\n' + detailMd : '');
    return { html, md };
  }

  // active·resolved 두 버킷을 각각 소속 PRD별로 분배(각 항목 정확히 1회 → detailMap
  // H18 trigger==detail 불변). Data Exploration M1 후속 — 그룹핑을 미해결 단일 탭에서
  // 해결됨 탭까지 동형 확장. 그룹 메타와 함께 보관해 html(그룹 chrome)·md(그룹 헤더)가
  // 동일 render 를 재사용. planPrd 부재/단일그룹은 groupByPrd 가 fail-open 단일 버킷을
  // 돌려줘 기존 flat 동작을 보존.
  function renderGroups(items) {
    return groupByPrd(items, pb.planPrd).map((g) => ({
      prdKey: g.prdKey,
      prdLabel: g.prdLabel,
      items: g.items.map((q) => renderItem(q, q._mergedIndex, g.prdKey)),
    }));
  }
  const renderedActive = renderGroups(active);
  const renderedResolved = renderGroups(resolved);

  // 패널 inner 빌더 — M5 Task 6: 미해결 질문은 전용 route(#route-questions)에서만
  // 렌더되며 이 route 가 곧 '전체 보기' 페이지이므로 캡 없이 모든 항목을 노출(full
  // mode). Data Exploration M1 — 2+ PRD 그룹이면 각 그룹을 native <details class=
  // "prd-group">로 묶고(JS 0 동작), 단일 그룹이면 기존 flat <ul>. data-prd 는 양쪽
  // 모두 li-item 에 부여(M2/M3 토대). 미해결·해결됨 두 탭이 공유(M1 후속 — 이전엔
  // active 한정). active 0 이면 empty-state.
  function groupDetailsHtml(g) {
    // prdLabel 은 PRD H1 raw — em-dash 포함 가능(H10). normalizeProse 로 통과.
    return '<details class="prd-group" open data-prd="' + escapeHtml(g.prdKey) + '">'
      + '<summary class="prd-sum"><span class="prd-label">'
      + escapeHtml(formatUtils.normalizeProse(g.prdLabel)) + '</span>'
      + '<span class="prd-count">' + g.items.length + '</span></summary>'
      + '<ul class="stack-list" role="list">' + g.items.map((x) => x.html).join('') + '</ul>'
      + '</details>';
  }
  function panelInnerHtml(rendered, emptyHtml) {
    if (rendered.length === 0) return emptyHtml;
    if (shouldShowGroups(rendered)) return rendered.map(groupDetailsHtml).join('');
    return '<ul class="stack-list" role="list">'
      + rendered[0].items.map((x) => x.html).join('') + '</ul>';
  }
  const activeInner = panelInnerHtml(renderedActive, '<p class="muted"><em>질문이 없습니다.</em></p>');

  // M3-b — 해결 이력을 탭 뒤로(메인 흐름에서 큰 숫자 제거 → "40개 미해결" 착시 해소).
  // 해결됨이 있을 때만 탭(미해결 default-checked · 해결됨 N); 없으면 미해결 직접 노출.
  // Data Exploration M1 후속 — 해결됨 패널도 panelInnerHtml 경유 → 동일 PRD 그룹핑.
  let html;
  if (resolved.length > 0) {
    html = buildTabs({
      name: 'tab-questions',
      tabs: [
        { id: 'active', label: '미해결', count: active.length, panelHtml: activeInner, checked: true },
        { id: 'resolved', label: '해결됨', count: resolved.length, panelHtml: panelInnerHtml(renderedResolved, '') },
      ],
    }, formatUtils);
  } else {
    html = activeInner;
  }

  // MD — STATUS.md plain-text 동등. Data Exploration M1 — 2+ PRD 그룹이면 그룹마다
  // `**라벨 · N**` 평문 줄. 미해결은 primary 라 그룹별 top-3 + <details>+M 더보기로
  // 압축(cap=true), 해결됨은 외곽 <details> 뒤 secondary 라 추가 캡 없이 전 항목 평문
  // (cap=false — 삼중 중첩 회피, no-JS 도달성 보존). 단일 그룹이면 헤더 없는 flat.
  function mdGroupBlock(g, cap) {
    const head = '**' + formatUtils.normalizeProse(g.prdLabel) + ' · ' + g.items.length + '**\n';
    if (!cap) return head + g.items.map((x) => x.md).join('\n');
    const exp = g.items.slice(0, MAX_EXPANDED);
    const col = g.items.slice(MAX_EXPANDED);
    let s = head + exp.map((x) => x.md).join('\n');
    if (col.length > 0) {
      s += '\n\n<details>\n<summary>+' + col.length + ' 더보기</summary>\n\n'
        + col.map((x) => x.md).join('\n') + '\n\n</details>';
    }
    return s;
  }
  function mdFromRendered(rendered, cap) {
    if (rendered.length === 0) return '';
    if (shouldShowGroups(rendered)) return rendered.map((g) => mdGroupBlock(g, cap)).join('\n\n');
    const all = rendered[0].items;
    if (!cap) return all.map((x) => x.md).join('\n');
    let s = all.slice(0, MAX_EXPANDED).map((x) => x.md).join('\n');
    const col = all.slice(MAX_EXPANDED);
    if (col.length > 0) {
      s += '\n\n<details>\n<summary>+' + col.length + ' 더보기</summary>\n\n'
        + col.map((x) => x.md).join('\n') + '\n\n</details>';
    }
    return s;
  }
  let md = active.length === 0 ? '_질문이 없습니다._' : mdFromRendered(renderedActive, true);
  if (resolved.length > 0) {
    md += '\n\n<details>\n<summary>해결됨 ' + resolved.length + '건</summary>\n\n'
      + mdFromRendered(renderedResolved, false)
      + '\n\n</details>';
  }
  return { md, html, details: detailMap, activeCount: active.length };
}

module.exports = { renderOpenQuestions };
