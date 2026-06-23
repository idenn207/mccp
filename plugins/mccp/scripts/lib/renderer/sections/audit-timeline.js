'use strict';

const fs = require('fs');
const path = require('path');
const { nodeStatus } = require('../parsers/decision-state');
const { detailId, addDetail, buildReceiptDetail } = require('../parsers/drawer-detail');

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
  const { escapeHtml, formatRelativeTime, normalizeProse } = formatUtils;
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

  const mdLines = [];
  const htmlLines = [];
  // v1.19.0 M3 — 드로어 detail 누적(receipt 안정 키 = rowKey gate|decision|hash).
  const detailMap = new Map();

  function renderRow(r, isArchived, isLast, ordinal) {
    const rel = formatRelativeTime(r.created_at, now);
    const gate = r.gate_id || r.gate || '(unknown-gate)';
    const decision = String(r.decision_id || '');
    const decShort = tail(decision, 24);
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
    mdLines.push('- ' + rel + ' · `' + gate + '`/`' + decShort + '` · ' + mdMark);

    // briefing meta — 토큰/건너뜀. summary 는 md 에 prose(em-dash 정규화)로 보존.
    let briefMeta = '';
    if (typeof r.briefing_summary === 'string' && r.briefing_summary.length > 0) {
      const summary = normalizeProse(r.briefing_summary);
      const tok = tokK(r.briefing_token_count);
      mdLines.push('  > ' + summary + (tok ? ' · `' + tok + ' tok`' : ''));
      briefMeta = '<span class="brief"' + (summary ? ' title="' + escapeHtml(summary).replace(/"/g, '&quot;') + '"' : '') + '>'
        + 'briefing ' + (tok ? escapeHtml(tok) + ' tok' : '기록') + '</span>';
    } else if (r.briefing_invocation_count === 0) {
      mdLines.push('  · _(briefing 건너뜀)_');
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

    const railLine = isLast ? '' : '<span class="audit-line" aria-hidden="true"></span>';
    const rowClass = isArchived ? 'audit-row from-snapshot' : 'audit-row';
    const htmlEntry = '<li class="' + rowClass + '" data-detail-id="' + escapeHtml(id) + '">'
      + '<div class="audit-rail"><span class="audit-node ' + (isBad ? 'is-bad' : 'is-ok') + '" aria-hidden="true"></span>'
      + railLine + '</div>'
      + '<div class="audit-body">'
      + '<div class="audit-head"><span class="audit-gate">' + escapeHtml(gate) + '</span>'
      + '<span class="audit-dec">/' + escapeHtml(decShort) + '</span>'
      + '<span class="audit-when">' + escapeHtml(rel) + '</span></div>'
      + '<div class="audit-meta"><span class="conv' + convExtra + '">'
      + '<svg class="i i-sm" aria-hidden="true"><use href="#' + convSvg + '"/></svg>' + escapeHtml(convText)
      + '<span class="sr-only">' + (isBad ? ' 미수렴' : '') + '</span></span>'
      + briefMeta + '</div></div></li>';
    htmlLines.push(htmlEntry);
  }

  const auditRows = liveShown.map(r => ({ r, archived: false }))
    .concat(archivedShown.map(r => ({ r, archived: true })));
  auditRows.forEach((e, i) => renderRow(e.r, e.archived, i === auditRows.length - 1, i));

  // v1.3.0-m5 impeccable P3 absorption — single section-level footnote for
  // archived rows (NOT per-row). Surfaces only when at least one archived
  // row was actually rendered.
  if (archivedShown.length > 0) {
    const footnote = '⌛ 보관 스냅샷에서 복원 · ' + archivedShown.length + '건';
    mdLines.push('- _' + footnote + '_');
    htmlLines.push('<li class="audit-note muted from-snapshot-footnote"><em>'
      + escapeHtml(footnote) + '</em></li>');
  }

  const totalOlder = liveOlder + archivedOlder;
  if (totalOlder > 0) {
    mdLines.push('- _+' + totalOlder + ' older_');
    htmlLines.push('<li class="audit-note muted"><em>+' + totalOlder + ' older</em></li>');
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
      mdLines.push('- _' + gapNote + '_');
      htmlLines.push('<li class="audit-note muted snapshot-gap"><em>'
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
      mdLines.push('- _' + summary + '_');
      htmlLines.push('<li class="audit-note muted"><em>' + escapeHtml(summary) + '</em></li>');
    }
  }

  // v1.3.0-m4 Task 7 — was_stale footnote (impeccable F2 absorption).
  // Telegraphic Korean copy mirroring PRD §Design Direction.
  const lrm = m.last_render_meta;
  if (lrm && typeof lrm === 'object' && lrm.was_stale === true) {
    const prev = Number.isFinite(lrm.prev_age_seconds) ? lrm.prev_age_seconds : null;
    const ageText = prev !== null ? prev + '초' : '60초+';
    const footnote = '이전 캐시 ' + ageText + ' stale · 자동 갱신 안 됨';
    mdLines.push('- _' + footnote + '_');
    htmlLines.push('<li class="audit-note muted"><em>' + escapeHtml(footnote) + '</em></li>');
  }

  return {
    md: mdLines.join('\n'),
    // v1.18.0 M2 — 시간순 audit timeline. <ol>(시간 순서 의미). 각 행은
    // audit-row(rail 노드 + audit-line connector), footnote 는 audit-note(노드 없음).
    html: '<ol class="timeline">' + htmlLines.join('') + '</ol>',
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
};
