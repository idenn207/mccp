'use strict';

const { buildActionPrompt, maxRank } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildRiskDetail, renderDetailMd } = require('../parsers/drawer-detail');
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
const RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };

function sevOf(r) {
  return String(maxRank(r && r.impact, r && r.likelihood) || '').toUpperCase();
}

function renderRisks(model, formatUtils, planBody) {
  const { escapeHtml, renderProseHtml, renderProseMd } = formatUtils;
  const pb = planBody || {};
  const allRisks = Array.isArray(pb.risks) ? pb.risks.slice() : [];

  // M3 — 해결 마커 단 위험은 active 에서 분리. resolved 신호는 마커뿐(Codex F1).
  // M8 — 직교 두 축(명시 해결 r.resolved · 출처 plan lifecycle r.sourceClosed)으로
  // 상호배타 3-버킷, **우선순위 resolved → sourceClosed**:
  //   미해결(active)     = !resolved && !sourceClosed  (진짜 live)
  //   해결됨(resolved)   = resolved                    (명시 해결 마커, 불변)
  //   보관됨(historical) = !resolved && sourceClosed   (해결 마커 없으나 출처 plan 종료)
  // resolved-first 가 명시 마커의 강한 신호를 보존하고 '보관됨'을 정확히 unmarked+shipped
  // 로 한정한다(sourceClosed-first 면 해결됨이 줄고 보관됨이 부풀어 의미가 흐려짐).
  // 라벨 의미: 해결됨=누가 처리했다고 기록(적극 신호) · 보관됨=출처 종료로 관심권 밖
  // (해결 아님). 둘을 합치면 명시 해결 over-claim → truthfulness 위해 분리.
  const bySev = (a, b) => (RANK_MAP[sevOf(b)] || 0) - (RANK_MAP[sevOf(a)] || 0);
  const active = allRisks.filter((r) => !r.resolved && !r.sourceClosed).sort(bySev);
  const resolved = allRisks.filter((r) => r.resolved).sort(bySev);
  const historical = allRisks.filter((r) => !r.resolved && r.sourceClosed).sort(bySev);

  if (active.length === 0 && resolved.length === 0 && historical.length === 0) {
    return {
      md: '_발견된 위험이 없습니다._',
      html: '<p class="muted"><em>발견된 위험이 없습니다.</em></p>',
    };
  }

  // v1.18.1 M3 — 드로어 detail 누적(안정 키 = plan ordinal, 정렬과 무관한 parse-time
  // 순서). 충돌 hard-fail은 drawer-detail. 빌드 실패는 항목만 skip(fail-open).
  // active + resolved 항목 모두 renderItem 경유 → detail 키 == trigger 수(H18).
  const detailMap = new Map();

  // prdKey 가 주어지면 li-item 에 data-prd 부여(M2/M3 토대). Data Exploration M1
  // 후속 — 미해결뿐 아니라 해결됨·보관됨 세 버킷 모두 그룹 렌더 → 각 항목이 prdKey 동반.
  function renderItem(r, prdKey) {
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
    // relatedOpenQuestion 은 cross-section-dedupe 의 40자 truncated preview —
    // `**bold**` 를 중간에 잘라 dangling marker 가 남으면 H16(unrendered marker)이
    // cross-document 로 pair 매칭한다. snippet 이라 서식 무의미 → emphasis/code 마커
    // 제거 후 렌더(평문 cue). 완전 prose 는 드로어 detail SSoT 에 보존.
    const relPreview = String(r.relatedOpenQuestion || '').replace(/[*`]/g, '');
    const cueHtml = relPreview
      ? '<div class="meta-cue">동일 질문 참조: ' + renderProseHtml(relPreview, formatUtils) + '…</div>'
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
    // v1.18.7 M4 — 메인 복사 버튼(OQ 와 대칭). ap 는 이미 drawer action 용으로 빌드됨.
    // li-action = 복사 affordance 전용(OQ 와 동일 markup·aria-label). li-item 직속 우측
    // child(li-main 밖) → 제목 줄 우상단 정렬(소속 명확). md 무변경(drawer SSoT '다음
    // 액션' 행이 이미 md 노출). data-copy 는 escapeHtml 만(escapeAttr 회피).
    const promptHtml = '<div class="li-action">'
      + '<button class="copy-btn" type="button" data-copy="' + escapeHtml(ap.fullText)
      + '" aria-label="다음 액션 복사"><svg class="i i-sm" aria-hidden="true"><use href="#ic-copy"/></svg></button>'
      + '</div>';
    const prdAttr = prdKey ? ' data-prd="' + escapeHtml(prdKey) + '"' : '';
    const html = '<li class="li-item"' + prdAttr + ' data-detail-id="' + escapeHtml(id) + '">' + sevTag
      + '<div class="li-main">' + qHtml + mitHtml + cueHtml + '</div>' + promptHtml + '</li>';
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

  // active·resolved·historical 세 버킷을 각각 소속 PRD별로 분배(각 항목 정확히 1회
  // → detailMap H18 trigger==detail 불변). Data Exploration M1 후속 — 그룹핑을 미해결
  // 단일 탭에서 해결됨·보관됨 탭까지 동형 확장. 그룹 메타와 함께 보관해 html(그룹
  // chrome)·md(그룹 헤더)가 동일 render 를 재사용한다. planPrd 부재/단일그룹은
  // groupByPrd 가 fail-open 단일 버킷을 돌려줘 기존 flat 동작을 보존.
  function renderGroups(items) {
    return groupByPrd(items, pb.planPrd).map((g) => ({
      prdKey: g.prdKey,
      prdLabel: g.prdLabel,
      items: g.items.map((r) => renderItem(r, g.prdKey)),
    }));
  }
  const renderedActive = renderGroups(active);
  const renderedResolved = renderGroups(resolved);
  const renderedHistorical = renderGroups(historical);

  // 패널 inner 빌더 — M5 Task 6: 위험은 전용 route(#route-risks)에서만 렌더되며 이
  // route 가 곧 '전체 보기' 페이지이므로 캡 없이 모든 항목을 노출(full mode).
  // Data Exploration M1 — 2+ PRD 그룹이면 각 그룹을 native <details class="prd-group">
  // (JS 0 동작, graceful degrade 구조적 보장)로 묶고, 단일 그룹이면 기존 flat <ul>
  // (구분할 PRD 없음 → 그룹 chrome 생략). data-prd 는 양쪽 모두 li-item 에 부여
  // (M2/M3 토대). 미해결·해결됨·보관됨 세 탭이 공유한다(M1 후속 — 이전엔 active 한정).
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
  const activeInner = panelInnerHtml(renderedActive, '<p class="muted"><em>발견된 위험이 없습니다.</em></p>');

  // M3-b — 해결/보관 이력을 탭 뒤로(메인 흐름에서 큰 숫자 제거 → "250개 위험" 착시
  // 해소). 해결됨/보관됨이 있을 때만 탭(미해결 default-checked); 둘 다 없으면 미해결
  // 패널 직접 노출. resolved/historical 큰 숫자는 탭 label 에만(Constraint 2 neutral 뱃지).
  // M8 — 보관됨 탭은 additive(historical.length>0 gate). Data Exploration M1 후속 —
  // 해결됨·보관됨 패널도 panelInnerHtml 경유 → 동일 PRD 그룹핑 + data-prd. 드로어
  // detail 은 active/resolved/historical 모두 detailMap 적재(H18 trigger==detail).
  let html;
  if (resolved.length > 0 || historical.length > 0) {
    const tabs = [
      { id: 'active', label: '미해결', count: active.length, panelHtml: activeInner, checked: true },
    ];
    if (resolved.length > 0) {
      tabs.push({ id: 'resolved', label: '해결됨', count: resolved.length, panelHtml: panelInnerHtml(renderedResolved, '') });
    }
    if (historical.length > 0) {
      tabs.push({ id: 'historical', label: '보관됨', count: historical.length, panelHtml: panelInnerHtml(renderedHistorical, '') });
    }
    html = buildTabs({ name: 'tab-risks', tabs }, formatUtils);
  } else {
    html = activeInner;
  }

  // MD — STATUS.md plain-text 동등. Data Exploration M1 — 2+ PRD 그룹이면 그룹마다
  // `**라벨 · N**` 평문 줄(H10 구분자 ·, heading depth 증가 0 → H15 안전). 미해결은
  // primary 패널이라 그룹별 top-3 + <details>+M 더보기로 압축(cap=true), 해결됨·보관됨은
  // 이미 외곽 <details> 뒤 secondary 라 추가 캡 없이 전 항목 평문(cap=false — 삼중
  // 중첩 회피, no-JS 도달성 보존). 단일 그룹이면 헤더 없는 flat(구분할 PRD 없음).
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
  let md = active.length === 0 ? '_발견된 위험이 없습니다._' : mdFromRendered(renderedActive, true);
  if (resolved.length > 0) {
    md += '\n\n<details>\n<summary>해결됨 ' + resolved.length + '건</summary>\n\n'
      + mdFromRendered(renderedResolved, false)
      + '\n\n</details>';
  }
  // M8 — 보관됨(해결 마커 없으나 출처 plan 종료) plain-text 동등본. 접힘(secondary).
  if (historical.length > 0) {
    md += '\n\n<details>\n<summary>보관됨 ' + historical.length + '건</summary>\n\n'
      + mdFromRendered(renderedHistorical, false)
      + '\n\n</details>';
  }

  // panel-foot foot-link — 활동 기록 전체 보기로 cross-link (html.js renderPanel opts).
  const foot = '<a class="foot-link" href="#route-activity">활동 기록에서 전체 보기'
    + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-arrow"/></svg></a>';

  return { md, html, foot, details: detailMap, activeCount: active.length };
}

module.exports = { renderRisks };
