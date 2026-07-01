'use strict';

const path = require('path');
const { buildActionPrompt, maxRank } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildRiskDetail, renderDetailMd } = require('../parsers/drawer-detail');
const { stripMarker } = require('../parsers/resolution-marker');
const { buildTabs } = require('../parsers/tabs');
const { groupByPrd, prdKeyFor, canonicalPlanPath, GLOBAL_KEY, GLOBAL_LABEL } = require('../parsers/prd-group');

// Data Exploration M2 — plan 필터축 안정 키. risk 는 항상 plan 출처(source=p.path)나
// 누출 방어로 STATE.md/부재는 PRD축과 같은 __global__ sentinel 로 정렬(plan 필터에서
// "프로젝트 전역" 한 옵션으로 묶임). planLabel 은 plan basename stem(표시명).
function planKeyOf(src) {
  return (!src || src === 'STATE.md') ? GLOBAL_KEY : canonicalPlanPath(src);
}
function planLabelOf(src) {
  if (!src || src === 'STATE.md') return GLOBAL_LABEL;
  return path.basename(String(src)).replace(/\.plan\.md$/i, '').replace(/\.md$/i, '') || src;
}

const MAX_EXPANDED = 3;
const RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };

function sevOf(r) {
  return String(maxRank(r && r.impact, r && r.likelihood) || '').toUpperCase();
}

function renderRisks(model, formatUtils, planBody, opts) {
  const { escapeHtml, renderProseHtml, renderProseMd } = formatUtils;
  const pb = planBody || {};
  // Dashboard Readability M2 — 출처 시각 cue 결정성. parsePlanBody 와 동일 now 를
  // thread(opts.now)해 절대일자 양변 Date 가 흔들리지 않게 한다(format-utils 참조).
  const now = opts && opts.now != null ? opts.now : Date.now();
  const planActivity = pb.planActivity instanceof Map ? pb.planActivity : new Map();
  const allRisks = Array.isArray(pb.risks) ? pb.risks.slice() : [];

  // Data Exploration M2 (Codex F1 — HIGH) — data-ord chronology 는 severity 정렬
  // *이전* 원본 parse 순서여야 한다. allRisks 는 plan-body 가 plan 순회 + plan 내
  // ordinal 순서로 쌓은 배열이므로(=parse chronology), severity 정렬 전에 배열 인덱스를
  // _chronoIndex 로 박는다. 이걸 안 하고 render 방출 순으로 data-ord 를 주면 active 가
  // 이미 bySev 로 정렬돼 있어 "시간순" 이 severity 순서를 인코딩 → 정렬이 무효가 된다.
  allRisks.forEach((r, i) => { r._chronoIndex = i; });

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

  // Dashboard Readability M2 — 출처 plan 문서명(+ 활동 시각) meta-cue(OQ metaCueParts
  // 동형 markup). 위계는 타입 스케일로 enforce — .meta-cue 가 .li-q 보다 작고 --faint
  // 라 detail-tier 후퇴(F-DC1, 신규 강조 스타일 0, 기존 토큰 재사용). risk 는 항상 plan
  // 출처지만 STATE.md/부재는 누출 방어로 cue 생략. 시각은 planActivity 에 ms 있을 때만
  // (없으면 출처만 — fail-open, 정직 표기). >60일은 절대일자(format-utils opt-in).
  function sourceMetaHtml(source) {
    if (!source || source === 'STATE.md') return '';
    const file = path.basename(String(source));
    const inner = ['출처 <span class="mono">' + escapeHtml(file) + '</span>'];
    const ms = planActivity.get(canonicalPlanPath(source));
    if (ms != null) {
      inner.push('<span class="cue-sec">'
        + escapeHtml(formatUtils.formatRelativeTime(ms, now, { absoluteAfterDays: 60 }))
        + '</span>');
    }
    return '<div class="meta-cue">' + inner.join(' ') + '</div>';
  }

  // prdKey 가 주어지면 li-item 에 data-prd 부여(필터/정렬 축). Dashboard Readability M2 —
  // flat 렌더라 그룹 chrome 없이 각 항목이 prdKeyFor 로 data-prd 직접 부여.
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
    // dashboard-interactivity M1 — resolved 위험은 해결 사유/시각을 forward(드로어
    // '해결 사유'/'해결 시각' row). resolvedMeta 는 해결됨/보관됨 버킷 항목에서만
    // 비어있지 않다(parseRisks 가 trailing 마커에서 추출).
    const detail = buildRiskDetail(
      Object.assign({}, rClean, {
        severity: sev,
        actionPrompt: ap.fullText,
        resolvedReason: r.resolvedMeta && r.resolvedMeta.reason,
        resolvedAt: r.resolvedMeta && r.resolvedMeta.at,
      }),
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
    // Data Exploration M2 — 필터/정렬 축. data-plan(plan 필터, 안정 키) ·
    // data-sev(RANK_MAP 0~4, 정렬 키) · data-ord(원본 parse chronology, Codex F1).
    const exploreAttr = ' data-plan="' + escapeHtml(planKeyOf(r.source)) + '"'
      + ' data-sev="' + (RANK_MAP[sev] || 0) + '"'
      + ' data-ord="' + (Number.isFinite(r._chronoIndex) ? r._chronoIndex : 0) + '"';
    // 출처/시각 cue 는 li-main **상단**(제목 qHtml 앞 — PRD "항목 상단").
    const srcCueHtml = sourceMetaHtml(r.source);
    const html = '<li class="li-item"' + prdAttr + exploreAttr + ' data-detail-id="' + escapeHtml(id) + '">' + sevTag
      + '<div class="li-main">' + srcCueHtml + qHtml + mitHtml + cueHtml + '</div>' + promptHtml + '</li>';
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

  // Dashboard Readability M2 — flat 렌더. 그룹 chrome(.prd-group) 제거하고 **이미
  // bySev 정렬된** active/resolved/historical 배열에서 직접 방출(Codex F1 — HIGH).
  // groupByPrd 버킷 순서로 flatten 하면 earlier-PRD low-sev 가 later-PRD CRITICAL 앞에
  // 와 전역 severity 순서가 깨진다(md·no-JS HTML 핵심 위반). 각 항목 data-prd 는
  // prdKeyFor per-item lookup 으로 부여(버킷팅 일치, 필터/정렬 축 보존). detailMap 은
  // 각 항목 정확히 1회 renderItem 경유라 H18 trigger==detail 불변.
  const renderedActive = active.map((r) => renderItem(r, prdKeyFor(r, pb.planPrd)));
  const renderedResolved = resolved.map((r) => renderItem(r, prdKeyFor(r, pb.planPrd)));
  const renderedHistorical = historical.map((r) => renderItem(r, prdKeyFor(r, pb.planPrd)));

  // filterOptions 수집 전용으로만 groupByPrd 유지(Codex F1 — "keep for filter option
  // collection"). 세 버킷(active/resolved/historical)을 순회해 어느 탭이든 PRD/plan
  // 옵션이 완전. 중복 제거 + 결정적 순서(groupByPrd 가 정렬, active 먼저). 렌더 순서와
  // 무관 — flat 리스트의 severity/merge 순서는 위 renderedX 가 별도로 소유.
  const filterOptions = { prds: [], plans: [] };
  const seenPrd = new Set();
  const seenPlan = new Set();
  function collectOptions(items) {
    for (const g of groupByPrd(items, pb.planPrd)) {
      if (!seenPrd.has(g.prdKey)) {
        seenPrd.add(g.prdKey);
        filterOptions.prds.push({ key: g.prdKey, label: g.prdLabel });
      }
      for (const r of g.items) {
        const pk = planKeyOf(r.source);
        if (!seenPlan.has(pk)) {
          seenPlan.add(pk);
          filterOptions.plans.push({ key: pk, label: planLabelOf(r.source), prdKey: g.prdKey });
        }
      }
    }
  }
  collectOptions(active);
  collectOptions(resolved);
  collectOptions(historical);

  // 패널 inner — 단일 <ul class="stack-list">(그룹 경계 제거 = PRD 핵심: 정렬이 그룹에
  // 가리지 않음). 위험은 전용 route(#route-risks, 전체 보기)라 캡 없이 전 항목 노출.
  function panelInnerHtml(rendered, emptyHtml) {
    if (rendered.length === 0) return emptyHtml;
    return '<ul class="stack-list" role="list">' + rendered.map((x) => x.html).join('') + '</ul>';
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

  // MD — STATUS.md plain-text 동등. Dashboard Readability M2 — flat(그룹 헤더 제거).
  // 정렬된 배열(severity/merge 전역 순서) 직접 방출(Codex F1 — prdKey 버킷 순서 아님).
  // 미해결은 primary 라 top-3 + <details>+M 더보기 압축(cap=true), 해결됨·보관됨은 이미
  // 외곽 <details> 뒤 secondary 라 추가 캡 없이 전 항목 평문(cap=false — 삼중 중첩 회피,
  // no-JS 도달성 보존).
  function mdFlat(rendered, cap) {
    if (rendered.length === 0) return '';
    if (!cap) return rendered.map((x) => x.md).join('\n');
    let s = rendered.slice(0, MAX_EXPANDED).map((x) => x.md).join('\n');
    const col = rendered.slice(MAX_EXPANDED);
    if (col.length > 0) {
      s += '\n\n<details>\n<summary>+' + col.length + ' 더보기</summary>\n\n'
        + col.map((x) => x.md).join('\n') + '\n\n</details>';
    }
    return s;
  }
  let md = active.length === 0 ? '_발견된 위험이 없습니다._' : mdFlat(renderedActive, true);
  if (resolved.length > 0) {
    md += '\n\n<details>\n<summary>해결됨 ' + resolved.length + '건</summary>\n\n'
      + mdFlat(renderedResolved, false)
      + '\n\n</details>';
  }
  // M8 — 보관됨(해결 마커 없으나 출처 plan 종료) plain-text 동등본. 접힘(secondary).
  if (historical.length > 0) {
    md += '\n\n<details>\n<summary>보관됨 ' + historical.length + '건</summary>\n\n'
      + mdFlat(renderedHistorical, false)
      + '\n\n</details>';
  }

  // panel-foot foot-link — 활동 기록 전체 보기로 cross-link (html.js renderPanel opts).
  const foot = '<a class="foot-link" href="#route-activity">활동 기록에서 전체 보기'
    + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-arrow"/></svg></a>';

  return { md, html, foot, details: detailMap, activeCount: active.length, filterOptions };
}

module.exports = { renderRisks };
