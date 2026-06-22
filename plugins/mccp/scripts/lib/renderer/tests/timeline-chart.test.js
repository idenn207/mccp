'use strict';

// v1.14.0 활동 step-chart (audit-timeline) — 시각 레이어 변환 테스트.
// 데이터 로직(snapshot/cap/footnote/briefing/md)은 sections.test.js +
// audit-timeline-snapshot.test.js 가 회귀 가드. 본 파일은 step-chart 마크업
// (rail/노드 마커/tl-body/tl-note) + emphasis 반전 + a11y + Codex F2 containment.

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderAuditTimeline } = require('../sections/audit-timeline');

const NOW = Date.UTC(2026, 5, 18);
function model(items) {
  return { sources: { receipts: { items } } };
}
function recent(extra) {
  return Object.assign({
    gate_id: 'mccp-plan-codex', decision_id: 'aaaaaaaaaaaa', converged: true,
    created_at: new Date(NOW - 3600_000).toISOString(),
  }, extra || {});
}

test('timeline — empty window yields placeholder (no rail)', () => {
  const { md, html } = renderAuditTimeline(
    model([recent({ created_at: new Date(NOW - 30 * 86400_000).toISOString() })]),
    formatUtils, NOW, { snapshotsDir: null });
  assert.match(md, /최근 7일 활동 없음/);
  assert.doesNotMatch(html, /tl-rail/);
});

test('timeline — wrapper is <ol class="timeline tl-rail"> with tl-step rows', () => {
  const { html } = renderAuditTimeline(model([recent()]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /<ol class="timeline tl-rail">/);
  assert.match(html, /<\/ol>/);
  assert.match(html, /<li class="tl-step audit-row">/);
});

test('timeline — converged node is quiet (tl-done + ✓ + sr-only 수렴), no accent', () => {
  const { html } = renderAuditTimeline(model([recent({ converged: true })]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /tl-node tl-done/);
  assert.match(html, /tl-icon" aria-hidden="true">✓/);
  assert.match(html, /class="sr-only">수렴/);
  // emphasis 반전 — converged 노드는 accent(s-terminal-ok) 미사용.
  assert.doesNotMatch(html, /tl-node s-terminal-ok/);
});

test('timeline — pending node is loud (s-stale + ◐ + sr-only 진행)', () => {
  const { html } = renderAuditTimeline(model([recent({ converged: false })]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /tl-node s-stale/);
  assert.match(html, /tl-icon" aria-hidden="true">◐/);
  assert.match(html, /class="sr-only">진행/);
});

test('timeline — briefing blockquote sits inside tl-body div, not a phrasing span (Codex F2)', () => {
  const { html } = renderAuditTimeline(
    model([recent({ briefing_summary: 'plan looks fine', briefing_token_count: 142 })]),
    formatUtils, NOW, { snapshotsDir: null });
  // blockquote present and contained in the tl-step row's tl-body.
  assert.match(html, /<div class="tl-body">[\s\S]*?<blockquote class="briefing">/);
  // never wrap body in a phrasing <span class="tl-body"> (non-conforming).
  assert.doesNotMatch(html, /<span class="tl-body"/);
});

test('timeline — md output unchanged (info equivalence, D5)', () => {
  const { md } = renderAuditTimeline(model([recent({ converged: true })]), formatUtils, NOW, { snapshotsDir: null });
  // same shape as pre-M2: `- {rel} · `gate`/`decision` · ✓ 수렴`
  assert.match(md, /· `mccp-plan-codex`\/`aaaaaaaaaaaa` · ✓ 수렴/);
  // md carries no HTML rail markup.
  assert.doesNotMatch(md, /tl-rail|tl-node|tl-step/);
});

test('timeline — gate value is escaped (self-injection defense)', () => {
  const { html } = renderAuditTimeline(
    model([recent({ gate_id: '<img src=x onerror=1>' })]),
    formatUtils, NOW, { snapshotsDir: null });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('timeline — footnote (+N older) is tl-note, not a tl-step node row', () => {
  // 25 live rows → MAX_ROWS_LIVE=20 shown + 5 older footnote.
  const items = [];
  for (let i = 0; i < 25; i++) {
    items.push(recent({ decision_id: 'd' + i, created_at: new Date(NOW - i * 60_000).toISOString() }));
  }
  const { html } = renderAuditTimeline(model(items), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /<li class="tl-note muted"><em>\+5 older<\/em><\/li>/);
  // footnote must NOT carry a node marker (no fake rail step).
  const noteSlice = html.slice(html.indexOf('+5 older') - 60, html.indexOf('+5 older'));
  assert.doesNotMatch(noteSlice, /tl-node/);
});
