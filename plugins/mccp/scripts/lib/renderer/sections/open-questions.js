'use strict';

const path = require('path');
const { buildActionPrompt } = require('../parsers/action-prompt');
const { severityMeta, sevBadgeHtml } = require('../parsers/severity-meta');
const { detailId, addDetail, buildOQDetail, renderDetailMd } = require('../parsers/drawer-detail');
const { stripMarker } = require('../parsers/resolution-marker');
const { buildTabs } = require('../parsers/tabs');
const { groupByPrd, prdKeyFor, canonicalPlanPath, GLOBAL_KEY, GLOBAL_LABEL } = require('../parsers/prd-group');

// Data Exploration M2 — 정렬 키 RANK(risks.js RANK_MAP 와 동형, severity → 0~4 수치).
const RANK_MAP = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, '': 0 };

// Data Exploration M2 — plan 필터축 안정 키. STATE.md OQ(source='STATE.md')는 PRD축과
// 같은 __global__ sentinel("프로젝트 전역" 한 옵션). plan OQ 는 canonical plan path.
function planKeyOf(src) {
  return (!src || src === 'STATE.md') ? GLOBAL_KEY : canonicalPlanPath(src);
}
function planLabelOf(src) {
  if (!src || src === 'STATE.md') return GLOBAL_LABEL;
  return path.basename(String(src)).replace(/\.plan\.md$/i, '').replace(/\.md$/i, '') || src;
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

function renderOpenQuestions(model, formatUtils, planBody, opts) {
  const { escapeHtml, renderProseHtml, renderProseMd } = formatUtils;
  // Dashboard Readability M2 — 출처 시각 cue 결정성(risks 와 대칭). opts.now thread.
  const now = opts && opts.now != null ? opts.now : Date.now();
  const m = model || {};
  const sources = m.sources || {};
  const stateItem = sources.state && sources.state.item;
  const stateBody = (stateItem && stateItem.body) || {};
  const stateOQRaw = Array.isArray(stateBody.open_questions) ? stateBody.open_questions : [];
  const pb = planBody || {};
  const planActivity = pb.planActivity instanceof Map ? pb.planActivity : new Map();
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
      // Dashboard Readability M2 — plan 출처면 활동 시각 추가(STATE.md OQ 는 planActivity
      // 키 부재 → ms 없어 시각 생략, 출처/섹션/line 만 — 정직 표기). >60일 절대일자
      // (format-utils opt-in). planActivity 키 = canonicalPlanPath(q.source).
      if (q.source && q.source !== 'STATE.md') {
        const ms = planActivity.get(canonicalPlanPath(q.source));
        if (ms != null) {
          inner.push('<span class="cue-sec">'
            + escapeHtml(formatUtils.formatRelativeTime(ms, now, { absoluteAfterDays: 60 }))
            + '</span>');
        }
      }
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
    // Data Exploration M2 — 필터/정렬 축. data-ord 는 split 이전 박은 _mergedIndex
    // (= parse chronology, severity 와 무관 — Codex F1). data-sev 는 RANK 수치.
    const exploreAttr = ' data-plan="' + escapeHtml(planKeyOf(q.source)) + '"'
      + ' data-sev="' + (RANK_MAP[sev] || 0) + '"'
      + ' data-ord="' + (Number.isFinite(mergedIndex) ? mergedIndex : 0) + '"';
    // Dashboard Readability M2 — 출처/시각 cue 를 li-main **상단**(제목 qHtml 앞 — PRD
    // "항목 상단"). 위계는 .meta-cue 타입 스케일(< .li-q + --faint)로 후퇴(F-DC1).
    const html = '<li class="li-item"' + prdAttr + exploreAttr + ' data-detail-id="' + escapeHtml(id) + '">' + sevTag
      + '<div class="li-main">' + cueHtml + qHtml + '</div>' + promptHtml + '</li>';
    // v1.18.2 M4 — STATUS.md 동등본. 항목 헤더(텍스트) + drawer-detail SSoT 인라인.
    // 출처/섹션/line/관련 결정/다음 액션은 모두 renderDetailMd 단일 경로(섹션 자체
    // 재구성 0). 헤더 텍스트는 detail.titleText(raw 평문, H10 normalize). 구분자 ·(H10).
    const titleText = detail.titleText || renderProseMd(text);
    const detailMd = renderDetailMd(detail, formatUtils);
    const md = '- ' + severityIcon(sev) + ' **' + sev + '** · ' + titleText
      + (detailMd ? '\n' + detailMd : '');
    return { html, md };
  }

  // Dashboard Readability M2 — flat 렌더(risks 와 대칭). 그룹 chrome 제거하고 **이미
  // merge 순서(=chronology)로 정렬된** active/resolved 배열에서 직접 방출(Codex F1 —
  // groupByPrd 버킷 순서로 flatten 금지: OQ 도 동일 위반 경로). 각 항목 data-prd 는
  // prdKeyFor per-item lookup. detailMap 은 각 항목 1회 renderItem 경유라 H18 불변.
  const renderedActive = active.map((q) => renderItem(q, q._mergedIndex, prdKeyFor(q, pb.planPrd)));
  const renderedResolved = resolved.map((q) => renderItem(q, q._mergedIndex, prdKeyFor(q, pb.planPrd)));

  // filterOptions 수집 전용으로만 groupByPrd 유지(Codex F1). active/resolved 순회로
  // PRD/plan 옵션 완전. 중복 제거 + 결정적 순서. 렌더 순서와 무관(flat 은 위 renderedX).
  const filterOptions = { prds: [], plans: [] };
  const seenPrd = new Set();
  const seenPlan = new Set();
  function collectOptions(items) {
    for (const g of groupByPrd(items, pb.planPrd)) {
      if (!seenPrd.has(g.prdKey)) {
        seenPrd.add(g.prdKey);
        filterOptions.prds.push({ key: g.prdKey, label: g.prdLabel });
      }
      for (const q of g.items) {
        const pk = planKeyOf(q.source);
        if (!seenPlan.has(pk)) {
          seenPlan.add(pk);
          filterOptions.plans.push({ key: pk, label: planLabelOf(q.source), prdKey: g.prdKey });
        }
      }
    }
  }
  collectOptions(active);
  collectOptions(resolved);

  // 패널 inner — 단일 <ul class="stack-list">(그룹 경계 제거 = PRD 핵심). 미해결은 전용
  // route(#route-questions, 전체 보기)라 캡 없이 전 항목.
  function panelInnerHtml(rendered, emptyHtml) {
    if (rendered.length === 0) return emptyHtml;
    return '<ul class="stack-list" role="list">' + rendered.map((x) => x.html).join('') + '</ul>';
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

  // MD — STATUS.md plain-text 동등. Dashboard Readability M2 — flat(그룹 헤더 제거).
  // merge 순서(chronology) 직접 방출(Codex F1). 미해결은 primary 라 top-3 + <details>+M
  // 더보기 압축(cap=true), 해결됨은 외곽 <details> 뒤 secondary 라 추가 캡 없이 전 항목.
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
  let md = active.length === 0 ? '_질문이 없습니다._' : mdFlat(renderedActive, true);
  if (resolved.length > 0) {
    md += '\n\n<details>\n<summary>해결됨 ' + resolved.length + '건</summary>\n\n'
      + mdFlat(renderedResolved, false)
      + '\n\n</details>';
  }
  return { md, html, details: detailMap, activeCount: active.length, filterOptions };
}

module.exports = { renderOpenQuestions };
