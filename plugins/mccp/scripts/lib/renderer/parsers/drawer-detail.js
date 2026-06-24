'use strict';

// v1.18.1 M3 — 우측 상세 드로어 detail SSoT.
// 항목(OQ/위험/receipt/마일스톤) → 드로어 상세 객체 빌더 + 충돌 안전 안정 키 +
// `<script type="application/json">` break-out 안전 serialize.
//
// 주입 경계(Codex R1 F3): detail 객체의 prose 필드(title, sections[].1)는 서버에서
// `renderProseHtml`로 렌더한 **안전 HTML**(escape + inline-markdown) — 드로어 JS가
// innerHTML 으로 주입하는 유일 sink. 그 외 값(tags.label, rows[].dt/dd, action)은
// RAW 텍스트(normalizeProse만) — 드로어 JS가 textContent 로 주입. raw derive 값이
// innerHTML 로 가는 경로 0.
//
// 안정 키(Codex R1 F2): 인덱스 매핑 금지. planRelPath + 항상-present 식별자
// (OQ lineNumber / 위험 ordinal / receipt rowKey / 마일스톤 planPath). 키 충돌은
// silent first-wins 아니라 `addDetail` 이 ordinal suffix + collision 카운트로 hard
// surface → H18/test 가 collisions>0 을 FAIL.

// severity → 드로어 sev 태그 tone (CSS .sev.s-high/.s-med/.s-low).
function sevTone(sev) {
  const s = String(sev || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'high';
  if (s === 'MEDIUM' || s === 'MED') return 'med';
  return 'low';
}

// plan 경로 → decision slug(plan basename 에서 확장자 제거). OQ/위험의 '관련 결정'.
function decisionFromSource(source) {
  if (!source || typeof source !== 'string') return null;
  const base = source.split(/[\\/]/).pop();
  if (!base) return null;
  return base.replace(/\.plan\.md$/i, '').replace(/\.md$/i, '');
}

function basename(p) {
  if (!p || typeof p !== 'string') return null;
  return p.split(/[\\/]/).pop() || null;
}

// ── 안정 키 ──────────────────────────────────────────────────────────────────
// kind prefix 가 cross-section 충돌을 구조적으로 차단(oq:/risk:/receipt:/ms:).
function detailId(kind, parts) {
  const p = parts || {};
  switch (kind) {
    case 'oq': {
      const src = p.source || 'inline';
      // plan 출처 + lineNumber 가 plan 내 유일. 없으면(STATE.md OQ 등) ordinal.
      const tail = (p.lineNumber != null) ? ('L' + p.lineNumber) : ('o' + (p.ordinal || 0));
      return 'oq:' + src + '#' + tail;
    }
    case 'risk':
      // plan Risks 표 ordinal 이 중복 위험 텍스트에도 유일·안정(text-hash 폐기).
      return 'risk:' + (p.source || 'inline') + '#r' + (p.ordinal || 0);
    case 'receipt':
      // audit-timeline rowKey reuse(gate|decision|hash, hash 부재 시 @created_at).
      return 'receipt:' + (p.rowKey || ('?' + (p.ordinal || 0)));
    case 'ms':
      // planRelPath 가 milestone 당 유일(동일 basename 다른 PRD 도 path 로 분리).
      return 'ms:' + (p.planPath || p.name || ('?' + (p.ordinal || 0)));
    default:
      return String(kind) + ':' + (p.ordinal || 0);
  }
}

// Map 삽입 — 키 충돌은 hard surface(Codex R1 F2). silent first-wins 금지.
// 반환: { id, collision } — id 는 실제 사용 키(충돌 시 ordinal suffix). caller 가
// 이 id 를 item 의 data-detail-id 로 써서 trigger==키 등식을 보존.
function addDetail(map, rawId, detail) {
  if (!map.has(rawId)) {
    map.set(rawId, detail);
    return { id: rawId, collision: false };
  }
  let n = 2;
  let alt = rawId + '~' + n;
  while (map.has(alt)) { n += 1; alt = rawId + '~' + n; }
  process.stderr.write('[mccp:drawer] detail-id collision: ' + rawId + ' -> ' + alt
    + ' (안정 키 약함 — 조사 필요)\n');
  map.set(alt, detail);
  return { id: alt, collision: true };
}

// ── 4종 detail 빌더 ─────────────────────────────────────────────────────────
// 반환 shape: { title(HTML), titleText(raw 평문), tags:[{label,tone}],
//              rows:[[dt,dd,mono?]], sections:[[h3, proseHtml, proseText]],
//              action? } — 부재 필드는 생략(degrade).
//
// v1.18.2 M4 (Codex F1 흡수) — 모든 markdown-렌더 prose 필드는 raw 평문도 함께
// stamp. `title`(renderProseHtml, HTML 드로어 innerHTML sink)와 짝으로 `titleText`
// (normalizeProse 원본 평문, STATUS.md md 경로), sections 는 `[h3, proseHtml,
// proseText]` triple. md 경로(renderDetailMd)는 proseHtml 을 절대 strip 하지 않고
// proseText 를 직접 소비 → mitigation/briefing/요약 손상·유실 0, strip 정규식 0.

function buildOQDetail(q, formatUtils) {
  const { renderProseHtml, normalizeProse } = formatUtils;
  const sev = String(q.severity || 'MEDIUM').toUpperCase();
  const rows = [];
  const file = q.source ? basename(q.source) : null;
  if (file) rows.push(['출처', normalizeProse(file), true]);
  const head = (q.headingPath && q.headingPath[0]) || '## Open Questions';
  rows.push(['섹션', normalizeProse(head.replace(/^#+\s+/, ''))]);
  // v1.18.2 M4 (Codex F2 흡수) — lineNumber 는 기존 섹션 md(meta-cue)의 section-only
  // 행이었다. detail SSoT 에 line 행으로 흡수해, md 일원화 시 plain-text 소비자에서
  // 사라지지 않게 한다. drawer 에도 함께 노출(정보 동등).
  if (q.lineNumber != null) rows.push(['line', 'line ' + q.lineNumber]);
  const dec = decisionFromSource(q.source);
  if (dec) rows.push(['관련 결정', dec, true]);
  const detail = {
    title: renderProseHtml(q.text, formatUtils),
    titleText: normalizeProse(q.text),
    tags: [{ label: sev, tone: sevTone(sev) }],
    rows,
  };
  if (q.actionPrompt) detail.action = normalizeProse(q.actionPrompt);
  return detail;
}

function buildRiskDetail(r, formatUtils) {
  const { renderProseHtml, normalizeProse } = formatUtils;
  const sev = String(r.severity || 'MEDIUM').toUpperCase();
  const rows = [];
  const dec = decisionFromSource(r.source);
  if (dec) rows.push(['관련 결정', dec, true]);
  if (r.impact) rows.push(['영향', normalizeProse(r.impact)]);
  if (r.likelihood) rows.push(['가능성', normalizeProse(r.likelihood)]);
  // v1.18.2 M4 (Codex F2 흡수) — relatedOpenQuestion 은 risks.js 섹션 md 의 section-
  // only 행(`buildRiskDetail` detail 에 부재했다). detail SSoT 에 raw 보존 행으로
  // 추가 → md 일원화 시 동일-질문 참조가 유실되지 않고 drawer 에도 동일 노출.
  if (r.relatedOpenQuestion) {
    rows.push(['동일 질문 참조', normalizeProse(r.relatedOpenQuestion)]);
  }
  const detail = {
    title: renderProseHtml(r.risk, formatUtils),
    titleText: normalizeProse(r.risk),
    tags: [{ label: sev, tone: sevTone(sev) }],
    rows,
  };
  // 완화책 = REQUIRED(plan Risks 표 Mitigation 컬럼 schema 보장). 부재 시 생략.
  if (r.mitigation) {
    detail.sections = [['완화책', renderProseHtml(r.mitigation, formatUtils), normalizeProse(r.mitigation)]];
  }
  if (r.actionPrompt) detail.action = normalizeProse(r.actionPrompt);
  return detail;
}

function buildReceiptDetail(rc, formatUtils) {
  const { renderProseHtml, normalizeProse, escapeHtml } = formatUtils;
  const esc = escapeHtml || ((s) => String(s == null ? '' : s));
  const gate = rc.gate || '게이트';
  const conv = rc.convLabel || (rc.isBad ? 'divergent' : '수렴');
  const rows = [];
  if (rc.decision) rows.push(['결정', normalizeProse(rc.decision), true]);
  rows.push(['판정', rc.verdictText || conv]);
  if (rc.round != null) rows.push(['round', String(rc.round)]);
  if (rc.briefingText) rows.push(['briefing', rc.briefingText]);
  if (rc.relative) rows.push(['시각', rc.relative]);
  if (rc.hashShort) rows.push(['receipt', rc.hashShort, true]);
  const detail = {
    // title 은 식별자 조합(markdown 없음). drawer JS 가 innerHTML 로 주입하므로
    // escapeHtml 로 안전 HTML 화(gate 명에 메타문자 부재해도 defense-in-depth).
    title: esc(normalizeProse(gate)) + ' 게이트 ' + esc(normalizeProse(conv)),
    titleText: normalizeProse(gate) + ' 게이트 ' + normalizeProse(conv),
    tags: [{ label: conv, tone: rc.tone || (rc.isBad ? 'high' : 'low') }],
    rows,
  };
  if (rc.briefingSummary) {
    detail.sections = [['요약', renderProseHtml(rc.briefingSummary, formatUtils), normalizeProse(rc.briefingSummary)]];
  }
  return detail;
}

function buildMilestoneDetail(e, planSummary, formatUtils) {
  const { renderProseHtml, normalizeProse } = formatUtils;
  const rows = [];
  if (e.planBasename) rows.push(['plan', normalizeProse(e.planBasename), true]);
  if (e.relative) rows.push(['ship', e.relative]);
  if (e.prNumber) rows.push(['PR', normalizeProse(String(e.prNumber))]);
  const detail = {
    title: renderProseHtml(e.name, formatUtils),
    titleText: normalizeProse(e.name),
    tags: [{ label: '완료', tone: 'low' }],
    rows,
  };
  // 요약 = plan `## Summary` read-side(OPTIONAL — plan unreadable 시 생략).
  if (planSummary) {
    detail.sections = [['요약', renderProseHtml(planSummary, formatUtils), normalizeProse(planSummary)]];
  }
  return detail;
}

// ── detail → plain-text markdown (SSoT 단일 경로, v1.18.2 M4) ──────────────────
// detail 객체(드로어 SSoT)를 2-space 중첩 markdown bullet 블록으로 렌더. 섹션 md 가
// 항목 헤더 바로 아래에 이 결과를 붙여 HTML 드로어와 정보 동등한 STATUS.md 를 만든다.
//   - rows[[dt,dd,mono?]] → `  - {dt}: {dd}` (mono 면 backtick code span)
//   - sections[[h3, proseHtml, proseText]] → `  - {h3}: {proseMd}` — proseText(raw)
//     만 사용, proseHtml strip 정규식 0 (Codex F1). proseText 부재 섹션은 prose 생략.
//   - action → `  - 다음 액션: \`{action}\``
// opts.omit: Set<string> — 항목 헤더가 이미 동일 값으로 표기한 dt/h3 라벨(시각/결정
//   /판정 등)을 생략(field-key + value 동등 — 헤더 변수와 같은 소스라 by construction
//   값 일치, Codex F2). opts.omitSections: true 면 sections 전체 생략(예: timeline 의
//   요약은 `> blockquote` 로 이미 노출). opts.indent: 기본 2-space.
function renderDetailMd(detail, formatUtils, opts) {
  if (!detail || typeof detail !== 'object') return '';
  const o = opts || {};
  const indent = typeof o.indent === 'string' ? o.indent : '  ';
  const omit = o.omit instanceof Set ? o.omit : new Set(Array.isArray(o.omit) ? o.omit : []);
  const renderProseMd = (formatUtils && formatUtils.renderProseMd) || ((s) => String(s == null ? '' : s));
  const lines = [];

  const rows = Array.isArray(detail.rows) ? detail.rows : [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const dt = String(row[0]);
    if (omit.has(dt)) continue;
    const mono = row[2] === true;
    const ddRaw = String(row[1] == null ? '' : row[1]);
    const dd = mono ? '`' + ddRaw + '`' : renderProseMd(ddRaw);
    lines.push(indent + '- ' + dt + ': ' + dd);
  }

  if (o.omitSections !== true) {
    const sections = Array.isArray(detail.sections) ? detail.sections : [];
    for (const sec of sections) {
      if (!Array.isArray(sec) || sec.length < 2) continue;
      const h3 = String(sec[0]);
      if (omit.has(h3)) continue;
      // proseText(index 2)만 — proseHtml(index 1) 은 md 에서 절대 안 씀(strip 0).
      if (sec.length >= 3 && sec[2] != null) {
        lines.push(indent + '- ' + h3 + ': ' + renderProseMd(String(sec[2])));
      }
    }
  }

  if (detail.action && !omit.has('다음 액션')) {
    lines.push(indent + '- 다음 액션: `' + detail.action + '`');
  }

  return lines.join('\n');
}

// ── serialize ───────────────────────────────────────────────────────────────
// `<script type="application/json">` 본문. JSON.stringify 출력은 이미 valid JSON
// (백슬래시 escape 완료) — 기존 백슬래시는 건드리지 않는다(이중 escape = JSON 파손).
// script-tag 안전을 위해 JSON 이 escape 하지 않는 <>& 와 LS/PS 만 valid \uXXXX 로
// 치환(JSON.parse 가 < 를 복원하므로 proseHtml 의 <code>/<strong> 태그도 정상 복원).
// content 무관 `</script>` break-out 0 (Codex R1 F3).
// v1.18.2 M4 — drawer-data(HTML <script>) 는 title/proseHtml 만 소비한다(드로어 JS 가
// sections[i][1] 을 innerHTML, rows 를 textContent 로 주입). md-only raw 필드
// (`titleText`, sections triple 의 `proseText` index 2)는 STATUS.md md 경로 전용이라
// 직렬화에서 제외 — JSON 군살 제거 + raw markdown 마커(backtick 등)가 HTML 표면(JSON
// 블록)으로 새지 않게 한다. md 경로는 in-memory detail(proseText 보유)을 직접 쓴다.
function stripMdOnly(detail) {
  if (!detail || typeof detail !== 'object') return detail;
  const out = {};
  for (const key of Object.keys(detail)) {
    if (key === 'titleText') continue;
    if (key === 'sections' && Array.isArray(detail.sections)) {
      out.sections = detail.sections.map((s) => (Array.isArray(s) ? s.slice(0, 2) : s));
      continue;
    }
    out[key] = detail[key];
  }
  return out;
}

function serializeDetails(map) {
  const obj = {};
  for (const [k, v] of map) obj[k] = stripMdOnly(v);
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = {
  sevTone,
  decisionFromSource,
  detailId,
  addDetail,
  buildOQDetail,
  buildRiskDetail,
  buildReceiptDetail,
  buildMilestoneDetail,
  renderDetailMd,
  serializeDetails,
};
