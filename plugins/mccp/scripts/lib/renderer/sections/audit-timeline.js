'use strict';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 30;

function tail(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(-n) : s;
}

function renderAuditTimeline(model, formatUtils, now) {
  if (typeof now !== 'number') now = Date.now();
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const m = model || {};
  const items = ((m.sources && m.sources.receipts && m.sources.receipts.items) || []).slice();

  const inWindow = items.filter(r => {
    if (!r || !r.created_at) return false;
    const t = new Date(r.created_at).getTime();
    if (!Number.isFinite(t)) return false;
    return (now - t) <= SEVEN_DAYS_MS;
  });

  inWindow.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (inWindow.length === 0) {
    return {
      md: '_(최근 7일 활동 없음)_',
      html: '<p class="muted"><em>최근 7일 활동 없음</em></p>',
    };
  }

  const shown = inWindow.slice(0, MAX_ROWS);
  const olderCount = Math.max(0, inWindow.length - MAX_ROWS);

  const mdLines = [];
  const htmlLines = [];
  for (const r of shown) {
    const rel = formatRelativeTime(r.created_at, now);
    const gate = r.gate_id || '(unknown-gate)';
    const decision = tail(String(r.decision_id || ''), 12);
    const verdictMark = r.converged === true ? '✓ 수렴' : '◐ 진행';
    mdLines.push('- ' + rel + ' · `' + gate + '`/`' + decision + '` · ' + verdictMark);
    let htmlEntry = '<li><span class="rel">' + escapeHtml(rel) + '</span>'
      + ' · <code>' + escapeHtml(gate) + '</code>/<code>' + escapeHtml(decision) + '</code>'
      + ' · <span class="verdict">' + escapeHtml(verdictMark) + '</span>';

    if (typeof r.briefing_summary === 'string' && r.briefing_summary.length > 0) {
      const summary = r.briefing_summary;
      const tokens = r.briefing_token_count != null ? String(r.briefing_token_count) : null;
      mdLines.push('  > ' + summary + (tokens ? ' · `' + tokens + ' tok`' : ''));
      htmlEntry += '<blockquote class="briefing">' + escapeHtml(summary)
        + (tokens ? ' <code class="muted">· ' + escapeHtml(tokens) + ' tok</code>' : '')
        + '</blockquote>';
    } else if (r.briefing_invocation_count === 0) {
      mdLines.push('  · _(briefing 건너뜀)_');
      htmlEntry += '<span class="muted">· (briefing 건너뜀)</span>';
    }
    htmlEntry += '</li>';
    htmlLines.push(htmlEntry);
  }

  if (olderCount > 0) {
    mdLines.push('- _+' + olderCount + ' older_');
    htmlLines.push('<li class="muted"><em>+' + olderCount + ' older</em></li>');
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
      htmlLines.push('<li class="muted"><em>' + escapeHtml(summary) + '</em></li>');
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
    htmlLines.push('<li class="muted"><em>' + escapeHtml(footnote) + '</em></li>');
  }

  return {
    md: mdLines.join('\n'),
    html: '<ul class="audit-timeline">' + htmlLines.join('') + '</ul>',
  };
}

module.exports = { renderAuditTimeline };
