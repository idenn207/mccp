'use strict';

const fs = require('fs');
const path = require('path');
const { nodeStatus } = require('../parsers/decision-state');
const { detailId, addDetail, buildReceiptDetail, renderDetailMd } = require('../parsers/drawer-detail');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 30;

// v1.18.0 M2 — 타임라인 노드(audit-node)는 receipt 의 시간순 상태로 is-ok/is-bad.
// is-bad = nodeStatus 가 blocked(escalated 미수렴/divergent) — 단순 converged=false
// 아님(공유 SSoT, Codex F1). conv 라벨: 수렴 R{n} / divergent / 진행 R{n}.
function tokK(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v);
}
// v1.3.0-m5 impeccable P2 absorption — live row priority cap so archived
// snapshot rows can never push live evidence off the section. Sum stays at
// MAX_ROWS=30 absolute cap.
const MAX_ROWS_LIVE = 20;
const MAX_ROWS_ARCHIVED = MAX_ROWS - MAX_ROWS_LIVE;
// v1.18.7 M4 — 타임라인 더보기: 상위 N행은 메인 <ol>, 나머지(cap 내)는 <details>
// 접힘으로 접근 가능. risks/OQ 의 3보다 큼(활동 피드 특성, impeccable layout 결정).
const TIMELINE_EXPANDED = 8;
const SNAPSHOT_FILENAME_RE = /^(\d{4})-(\d{2})-(\d{2})\.json$/;

function tail(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(-n) : s;
}

function rowKey(r) {
  // v1.3.0-m5 Codex F2 absorption — de-dup identity = gate+decision+hash,
  // with created_at fallback when receipt_hash is absent (v0.2.x-era).
  const gate = r && (r.gate_id || r.gate) ? (r.gate_id || r.gate) : '?';
  const dec = r && r.decision_id ? r.decision_id : '?';
  const h = r && r.receipt_hash ? r.receipt_hash : null;
  if (h) return gate + '|' + dec + '|' + h;
  return gate + '|' + dec + '|@' + (r && r.created_at ? r.created_at : '?');
}

function readSnapshotRows(snapshotsDir, now) {
  // Returns Array<receiptRow with from_snapshot:true>. Silent on any single-
  // file corruption — return what could be parsed. Caller filters by window.
  const out = [];
  let names;
  try { names = fs.readdirSync(snapshotsDir); }
  catch (_) { return out; }
  for (const name of names) {
    if (!SNAPSHOT_FILENAME_RE.test(name)) continue;
    const full = path.join(snapshotsDir, name);
    let payload;
    try {
      const raw = fs.readFileSync(full, 'utf8');
      payload = JSON.parse(raw);
    } catch (_) {
      // Single-file corruption is never fatal; skip and continue.
      continue;
    }
    if (!payload || !Array.isArray(payload.receipts)) continue;
    for (const r of payload.receipts) {
      if (!r || !r.created_at) continue;
      const t = new Date(r.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      const ageMs = now - t;
      if (ageMs <= 0 || ageMs > THIRTY_DAYS_MS) continue;
      out.push(Object.assign({}, r, { from_snapshot: true }));
    }
  }
  return out;
}

function renderAuditTimeline(model, formatUtils, now, opts) {
  if (typeof now !== 'number') now = Date.now();
  opts = opts || {};
  const { escapeHtml, escapeAttr, formatRelativeTime, normalizeProse } = formatUtils;
  const m = model || {};
  const items = ((m.sources && m.sources.receipts && m.sources.receipts.items) || []).slice();

  const liveInWindow = items.filter(r => {
    if (!r || !r.created_at) return false;
    const t = new Date(r.created_at).getTime();
    if (!Number.isFinite(t)) return false;
    return (now - t) <= SEVEN_DAYS_MS;
  });

  // v1.3.0-m5 Codex F1 → 30-day snapshot read path. Only triggered when
  // opts.snapshotsDir is provided AND live-receipt presence in the 7→30 day
  // band is sparse (< 5 rows). De-dup by rowKey(): live wins on collision.
  let archivedInWindow = [];
  let archivedDates = new Set();
  if (opts.snapshotsDir) {
    const liveInArchiveBand = items.filter(r => {
      if (!r || !r.created_at) return false;
      const t = new Date(r.created_at).getTime();
      if (!Number.isFinite(t)) return false;
      const age = now - t;
      return age > SEVEN_DAYS_MS && age <= THIRTY_DAYS_MS;
    });
    if (liveInArchiveBand.length < 5) {
      const liveKeys = new Set(items.map(rowKey));
      const snapshotRows = readSnapshotRows(opts.snapshotsDir, now);
      for (const r of snapshotRows) {
        if (liveKeys.has(rowKey(r))) continue; // live wins on collision
        archivedInWindow.push(r);
        const dateKey = String(r.created_at).slice(0, 10);
        archivedDates.add(dateKey);
      }
    }
  }

  liveInWindow.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  archivedInWindow.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (liveInWindow.length === 0 && archivedInWindow.length === 0) {
    return {
      md: '_(최근 7일 활동 없음)_',
      html: '<p class="muted"><em>최근 7일 활동 없음</em></p>',
    };
  }

  // v1.3.0-m5 impeccable P2 absorption — live capped first at MAX_ROWS_LIVE,
  // archived fills the remaining slots up to MAX_ROWS_ARCHIVED.
  const liveShown = liveInWindow.slice(0, MAX_ROWS_LIVE);
  const liveOlder = Math.max(0, liveInWindow.length - liveShown.length);
  const archivedShown = archivedInWindow.slice(0, MAX_ROWS_ARCHIVED);
  const archivedOlder = Math.max(0, archivedInWindow.length - archivedShown.length);

  // v1.18.7 M4 — 더보기 분할: 상위 TIMELINE_EXPANDED 는 expanded, 나머지는 collapsed,
  // 각주(노드 없음)는 별도 note 배열(두 <ol> 뒤 <ul class="audit-notes">, Codex R1 F1).
  const expandedHtml = [];
  const expandedMd = [];
  const collapsedHtml = [];
  const collapsedMd = [];
  const noteHtml = [];
  const noteMd = [];
  // v1.18.1 M3 — 드로어 detail 누적(receipt 안정 키 = rowKey gate|decision|hash).
  const detailMap = new Map();

  // htmlT/mdT 는 expanded|collapsed 타깃 배열 — 더보기 분할이 행을 두 컨테이너로 나눠도
  // detailMap·isLast·ordinal 은 글로벌 시퀀스 기준(렌더 위치 무관).
  function renderRow(r, isArchived, isLast, ordinal, htmlT, mdT) {
    const rel = formatRelativeTime(r.created_at, now);
    const gate = r.gate_id || r.gate || '(unknown-gate)';
    const decision = String(r.decision_id || '');
    // v1.18.7 M4 (진실성) — 전체 decision_id 보존. 이전 tail(…,24)는 공유 prefix
    // (dashboard-truthfulness-)를 잘라 "lness-m4-…"처럼 단어 중간이 깨져 보였다.
    // html 은 CSS ellipsis(prefix 유지, pipeline .pipe-id 동형) + title 로 전체 노출,
    // md/드로어는 full id. (hashShort 는 여전히 tail 사용.)
    const decShort = decision;
    const status = nodeStatus(r); // done | active | blocked | missing
    const round = Number.isFinite(r.round) ? r.round : null;

    // conv 라벨 + 노드 상태.
    let convText;
    let convExtra = '';
    let isBad = false;
    let convSvg = 'ic-check';
    if (status === 'blocked') {
      convText = 'divergent'; isBad = true; convExtra = ' is-bad'; convSvg = 'ic-alert';
    } else if (r.converged === true) {
      convText = '수렴' + (round != null ? ' R' + round : '');
    } else {
      convText = '진행' + (round != null ? ' R' + round : ''); convExtra = ' pending'; convSvg = 'ic-clock';
    }
    const mdMark = isBad ? '⚠ divergent' : (r.converged === true ? '✓ ' + convText : '◐ ' + convText);
    mdT.push('- ' + rel + ' · `' + gate + '`/`' + decShort + '` · ' + mdMark);

    // briefing meta — 토큰/건너뜀. summary 는 md 에 prose(em-dash 정규화)로 보존.
    let briefMeta = '';
    if (typeof r.briefing_summary === 'string' && r.briefing_summary.length > 0) {
      const summary = normalizeProse(r.briefing_summary);
      const tok = tokK(r.briefing_token_count);
      mdT.push('  > ' + summary + (tok ? ' · `' + tok + ' tok`' : ''));
      briefMeta = '<span class="brief"' + (summary ? ' title="' + escapeHtml(summary).replace(/"/g, '&quot;') + '"' : '') + '>'
        + 'briefing ' + (tok ? escapeHtml(tok) + ' tok' : '기록') + '</span>';
    } else if (r.briefing_invocation_count === 0) {
      mdT.push('  · _(briefing 건너뜀)_');
      briefMeta = '<span class="brief">briefing 건너뜀</span>';
    }

    // 드로어 detail — REQUIRED(gate/decision/판정/round/시각/hash). briefing은 OPTIONAL.
    const hashShort = (typeof r.receipt_hash === 'string')
      ? tail(r.receipt_hash.replace(/^sha256:/, ''), 8) : null;
    const briefingText = (typeof r.briefing_summary === 'string' && r.briefing_summary.length > 0)
      ? (tokK(r.briefing_token_count) ? tokK(r.briefing_token_count) + ' tok' : '기록')
      : (r.briefing_invocation_count === 0 ? '건너뜀' : null);
    const detail = buildReceiptDetail({
      gate,
      decision: decShort,
      convLabel: convText,
      verdictText: convText,
      isBad,
      tone: isBad ? 'high' : (r.converged === true ? 'low' : 'med'),
      round,
      briefingText,
      relative: rel,
      hashShort,
      briefingSummary: (typeof r.briefing_summary === 'string' && r.briefing_summary.length > 0)
        ? r.briefing_summary : null,
    }, formatUtils);
    const rawId = detailId('receipt', { rowKey: rowKey(r), ordinal });
    const { id } = addDetail(detailMap, rawId, detail);

    // v1.18.2 M4 — STATUS.md 동등본. 헤더 줄(시각·gate/결정·판정+round)과 briefing
    // blockquote 가 이미 표기한 행은 omit(field-key + value 동등, Codex F2) + 요약은
    // blockquote 로 노출되므로 omitSections. md-누락 행(receipt hash)만 인라인 append.
    const detailMd = renderDetailMd(detail, formatUtils, {
      omit: new Set(['시각', '결정', '판정', 'round', 'briefing']),
      omitSections: true,
    });
    if (detailMd) mdT.push(detailMd);

    const railLine = isLast ? '' : '<span class="audit-line" aria-hidden="true"></span>';
    const rowClass = isArchived ? 'audit-row from-snapshot' : 'audit-row';
    const htmlEntry = '<li class="' + rowClass + '" data-detail-id="' + escapeHtml(id) + '">'
      + '<div class="audit-rail"><span class="audit-node ' + (isBad ? 'is-bad' : 'is-ok') + '" aria-hidden="true"></span>'
      + railLine + '</div>'
      + '<div class="audit-body">'
      + '<div class="audit-head"><span class="audit-dec" title="' + escapeAttr(decision) + '">' + escapeHtml(decShort) + '</span>'
      + '<span class="audit-gate">' + escapeHtml(gate) + '</span>'
      + '<span class="audit-when">' + escapeHtml(rel) + '</span></div>'
      + '<div class="audit-meta"><span class="conv' + convExtra + '">'
      + '<svg class="i i-sm" aria-hidden="true"><use href="#' + convSvg + '"/></svg>' + escapeHtml(convText)
      + '<span class="sr-only">' + (isBad ? ' 미수렴' : '') + '</span></span>'
      + briefMeta + '</div></div></li>';
    htmlT.push(htmlEntry);
  }

  const auditRows = liveShown.map(r => ({ r, archived: false }))
    .concat(archivedShown.map(r => ({ r, archived: true })));
  // v1.18.7 M4 (Codex R1 F1) — isLast/ordinal 은 *전체 capped 시퀀스* 기준 글로벌
  // 인덱스. 두 컨테이너로 쪼개도 connector 는 진짜 글로벌 마지막 행 1개만 생략하고,
  // 마지막 expanded 행은 collapsed 가 남아 있으면 connector 유지(rail 시각 연속성).
  // detailMap 은 expanded/collapsed 무관 모든 렌더 행에 적재(H18 trigger==detail).
  const expandedRows = auditRows.slice(0, TIMELINE_EXPANDED);
  const collapsedRows = auditRows.slice(TIMELINE_EXPANDED);
  expandedRows.forEach((e, i) => {
    renderRow(e.r, e.archived, i === auditRows.length - 1, i, expandedHtml, expandedMd);
  });
  collapsedRows.forEach((e, i) => {
    const g = TIMELINE_EXPANDED + i;
    renderRow(e.r, e.archived, g === auditRows.length - 1, g, collapsedHtml, collapsedMd);
  });

  // ── 각주(노드 없음) — 두 <ol> 모두 끝난 뒤 별도 <ul class="audit-notes"> 컨테이너로
  // 모은다(단일 <ol> 안 <li> 면 collapsed 행보다 앞에 와 순서 깨짐 + invalid list, F1). ──
  // v1.3.0-m5 impeccable P3 absorption — single section-level footnote for
  // archived rows (NOT per-row). Surfaces only when at least one archived
  // row was actually rendered.
  if (archivedShown.length > 0) {
    const footnote = '⌛ 보관 스냅샷에서 복원 · ' + archivedShown.length + '건';
    noteMd.push('- _' + footnote + '_');
    noteHtml.push('<li class="audit-note muted from-snapshot-footnote"><em>'
      + escapeHtml(footnote) + '</em></li>');
  }

  const totalOlder = liveOlder + archivedOlder;
  if (totalOlder > 0) {
    noteMd.push('- _+' + totalOlder + ' older_');
    noteHtml.push('<li class="audit-note muted"><em>+' + totalOlder + ' older</em></li>');
  }

  // v1.3.0-m5 Codex F1 absorption — missing-day marker. When snapshot mode
  // is active and there are 30-day window dates with neither live nor
  // archived coverage, surface a single muted footnote so PM can
  // distinguish "true inactive" from "trigger never fired".
  if (opts.snapshotsDir && (liveInWindow.length > 0 || archivedInWindow.length > 0)) {
    const liveDates = new Set(liveInWindow.map(r => String(r.created_at).slice(0, 10)));
    const coveredDates = new Set([...liveDates, ...archivedDates]);
    const totalWindowDays = 30;
    const missingDays = totalWindowDays - coveredDates.size;
    if (missingDays >= 5) {
      const gapNote = '보관 누락 ' + missingDays + '일';
      noteMd.push('- _' + gapNote + '_');
      noteHtml.push('<li class="audit-note muted snapshot-gap"><em>'
        + escapeHtml(gapNote) + '</em></li>');
    }
  }

  // v1.3.0-m4 Task 7 — mask hit statistics footnote (impeccable F4 absorption).
  // Aggregate mask_hits per kind in the model so Bearer/password= are visible
  // even though they do not trip the verdict step 1.5 red banner. Severe
  // kinds still surface here (in addition to the verdict line) for cross-
  // reference.
  const hits = Array.isArray(m.mask_hits) ? m.mask_hits : [];
  if (hits.length > 0) {
    const perKind = new Map();
    for (const h of hits) {
      if (!h || !h.kind) continue;
      perKind.set(h.kind, (perKind.get(h.kind) || 0) + (h.count || 1));
    }
    if (perKind.size > 0) {
      const parts = Array.from(perKind.entries())
        .map(function (e) { return e[0] + ' ' + e[1] + '건'; });
      const summary = '이번 주 mask: ' + parts.join(' · ');
      noteMd.push('- _' + summary + '_');
      noteHtml.push('<li class="audit-note muted"><em>' + escapeHtml(summary) + '</em></li>');
    }
  }

  // v1.3.0-m4 Task 7 — was_stale footnote (impeccable F2 absorption).
  // Telegraphic Korean copy mirroring PRD §Design Direction.
  const lrm = m.last_render_meta;
  if (lrm && typeof lrm === 'object' && lrm.was_stale === true) {
    const prev = Number.isFinite(lrm.prev_age_seconds) ? lrm.prev_age_seconds : null;
    const ageText = prev !== null ? prev + '초' : '60초+';
    const footnote = '이전 캐시 ' + ageText + ' stale · 자동 갱신 안 됨';
    noteMd.push('- _' + footnote + '_');
    noteHtml.push('<li class="audit-note muted"><em>' + escapeHtml(footnote) + '</em></li>');
  }

  // ── 조립: 단일 <ol>(전체 capped 행) → 각주 <ul class="audit-notes"> ──
  // v1.18.0 M2 — 시간순 audit timeline. <ol>(시간 순서 의미). 각 행은 audit-row(rail
  // 노드 + audit-line connector), footnote 는 audit-note(노드 없음).
  // M5 Task 6 — 타임라인은 활동·기록 route(#route-activity)에서만 렌더되며 이 route 가
  // 곧 '전체 보기' 페이지이므로 캡(MAX_ROWS) 내 모든 행을 단일 <ol>에 노출(full mode,
  // 더보기 <details> 제거). isLast/connector 는 글로벌 시퀀스 기준이라 단일 <ol> 합치기
  // 후에도 rail 연속성 유지(마지막 글로벌 행만 connector 생략). md 는 top-N+<details>
  // 유지(plain-text 도달성). 각주는 <ol> 밖 <ul class="audit-notes">(valid list, F1).
  let html = '<ol class="timeline">' + expandedHtml.concat(collapsedHtml).join('') + '</ol>';
  if (noteHtml.length > 0) {
    html += '<ul class="audit-notes">' + noteHtml.join('') + '</ul>';
  }

  // md — risks.js 더보기 패턴 미러(top-N 본문 + <details> 접힘). 각주는 접힘 뒤.
  let md = expandedMd.join('\n');
  if (collapsedRows.length > 0) {
    md += '\n\n<details>\n<summary>+' + collapsedRows.length + ' 더보기</summary>\n\n'
      + collapsedMd.join('\n')
      + '\n\n</details>';
  }
  if (noteMd.length > 0) {
    md += '\n' + noteMd.join('\n');
  }

  return {
    md: md,
    html: html,
    details: detailMap,
  };
}

module.exports = {
  renderAuditTimeline,
  // Test-exposed internals.
  _rowKey: rowKey,
  _readSnapshotRows: readSnapshotRows,
  MAX_ROWS_LIVE,
  MAX_ROWS_ARCHIVED,
  MAX_ROWS,
  TIMELINE_EXPANDED,
};
