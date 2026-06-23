'use strict';

// v1.18.0 M2 활동 타임라인 (audit-timeline) — 샘플 audit-row 마크업 변환 테스트.
// 데이터 로직(snapshot/cap/footnote/briefing/md)은 sections.test.js +
// audit-timeline-snapshot.test.js 가 회귀 가드. 본 파일은 audit-row 마크업
// (rail 노드 + audit-line connector + audit-head/audit-meta) + is-ok/is-bad +
// a11y + self-injection containment.

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

test('timeline — empty window yields placeholder (no timeline list)', () => {
  const { md, html } = renderAuditTimeline(
    model([recent({ created_at: new Date(NOW - 30 * 86400_000).toISOString() })]),
    formatUtils, NOW, { snapshotsDir: null });
  assert.match(md, /최근 7일 활동 없음/);
  assert.doesNotMatch(html, /class="timeline"/);
});

test('timeline — wrapper is <ol class="timeline"> with audit-row rows', () => {
  const { html } = renderAuditTimeline(model([recent()]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /<ol class="timeline">/);
  assert.match(html, /<\/ol>/);
  // v1.19.0 M3 — audit-row 에 data-detail-id 속성 추가(드로어 trigger).
  assert.match(html, /<li class="audit-row"[^>]*>/);
});

test('timeline — converged row: audit-node is-ok + conv 수렴, never is-bad', () => {
  const { html } = renderAuditTimeline(model([recent({ converged: true, round: 1 })]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /audit-node is-ok/);
  assert.match(html, /class="conv"><svg class="i i-sm" aria-hidden="true"><use href="#ic-check"\/><\/svg>수렴 R1/);
  assert.doesNotMatch(html, /is-bad/);
});

test('timeline — first-round pending row: conv pending + 진행 (active, is-ok node)', () => {
  const { html } = renderAuditTimeline(model([recent({ converged: false, round: 1 })]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /audit-node is-ok/);
  assert.match(html, /class="conv pending">/);
  assert.match(html, /진행 R1/);
});

test('timeline — divergent row (round>=2 false): audit-node is-bad + conv is-bad divergent', () => {
  const { html } = renderAuditTimeline(model([recent({ converged: false, round: 2 })]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /audit-node is-bad/);
  assert.match(html, /class="conv is-bad">/);
  assert.match(html, /divergent/);
});

test('timeline — briefing surfaces as .brief span in audit-meta, no blockquote (M2)', () => {
  const { html } = renderAuditTimeline(
    model([recent({ briefing_summary: 'plan looks fine', briefing_token_count: 142 })]),
    formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /class="audit-meta">[\s\S]*?<span class="brief"/);
  assert.match(html, /briefing 142 tok/);
  assert.doesNotMatch(html, /blockquote/);
});

test('timeline — md output stable (info equivalence)', () => {
  const { md } = renderAuditTimeline(model([recent({ converged: true })]), formatUtils, NOW, { snapshotsDir: null });
  assert.match(md, /· `mccp-plan-codex`\/`aaaaaaaaaaaa` · ✓ 수렴/);
  assert.doesNotMatch(md, /audit-row|audit-node|audit-meta/);
});

test('timeline — gate value is escaped (self-injection defense)', () => {
  const { html } = renderAuditTimeline(
    model([recent({ gate_id: '<img src=x onerror=1>' })]),
    formatUtils, NOW, { snapshotsDir: null });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('timeline — footnote (+N older) is audit-note, not an audit-row node row', () => {
  // 25 live rows → MAX_ROWS_LIVE=20 shown + 5 older footnote.
  const items = [];
  for (let i = 0; i < 25; i++) {
    items.push(recent({ decision_id: 'd' + i, created_at: new Date(NOW - i * 60_000).toISOString() }));
  }
  const { html } = renderAuditTimeline(model(items), formatUtils, NOW, { snapshotsDir: null });
  assert.match(html, /<li class="audit-note muted"><em>\+5 older<\/em><\/li>/);
  const noteSlice = html.slice(html.indexOf('+5 older') - 60, html.indexOf('+5 older'));
  assert.doesNotMatch(noteSlice, /audit-node/);
});
