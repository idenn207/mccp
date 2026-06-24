'use strict';

// v1.18.0 M2 — sample-fidelity 회귀 가드. (1) 각 섹션이 승인된 dashboard-sample.html
// 의 class anatomy 를 emit, (2) is-block/is-bad/active 가 deriveDecisionState 시간순
// 판정으로 파생, (3) prose 파이프라인이 OQ·risks·timeline·milestone 전부에서
// em-dash/raw-marker/MD0xx 를 0 으로, (4) deprecated 클래스가 renderStatus().html 에
// 부재(Codex F3), (5) 샘플 더미 문자열 부재.

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');
const { renderPipeline } = require('../sections/pipeline');
const { renderAuditTimeline } = require('../sections/audit-timeline');
const { renderStatusGrid } = require('../sections/status-grid');

// HTML body H16/H10 carve-out mirror — strip <code>/<pre>/attrs, then look for
// raw markdown markers + entity-backtick pairs + em-dash.
function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<code[\s\S]*?<\/code>/g, '')
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(/(?:title|alt|aria-label)="[^"]*"/g, '');
}
function assertProseClean(html, label) {
  const s = strip(html);
  assert.equal((s.match(/—/g) || []).length, 0, label + ' — em-dash leaked');
  assert.equal((s.match(/\*\*[^*\n]+\*\*/g) || []).length, 0, label + ' — raw bold-asterisk');
  assert.equal((s.match(/&#96;[^&\n]+&#96;/g) || []).length, 0, label + ' — entity-backtick pair');
  assert.equal((s.match(/\bMD0?\d{2,4}\b/g) || []).length, 0, label + ' — raw MD lint code');
}

const PROSE = 'em — dash, `code span`, **bold**, MD013 lint, ``a `b` c`` nested, [link](http://x)';

test('OQ — sample anatomy (stack-list/li-item/sev/li-q/meta-cue/li-action)', () => {
  const planBody = { openQuestions: [{ text: PROSE, source: 'p.plan.md', lineNumber: 9, headingPath: ['## Open Questions'], severity: 'HIGH' }] };
  const { html } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  // v1.18.7 M4 — verbose inline-prompt → li-action(복사 affordance 전용).
  for (const cls of ['stack-list', 'li-item', 'sev s-high', 'li-main', 'li-q', 'meta-cue', 'li-action']) {
    assert.ok(html.includes('class="' + cls.split(' ')[0]) || html.includes(cls), 'OQ missing ' + cls);
  }
  assertProseClean(html, 'OQ');
});

test('M3 — 각 섹션 항목이 kind-prefix 안정 키 data-detail-id 부여 + details Map 반환', () => {
  const oq = renderOpenQuestions({ sources: {} }, formatUtils,
    { openQuestions: [{ text: 'q', source: 'p.plan.md', lineNumber: 9, headingPath: ['## Open Questions'], severity: 'HIGH' }] });
  assert.match(oq.html, /data-detail-id="oq:p\.plan\.md#L9"/);
  assert.ok(oq.details instanceof Map && oq.details.size === 1);

  const rk = renderRisks({ sources: {} }, formatUtils,
    { risks: [{ risk: 'r', impact: 'High', likelihood: 'Low', mitigation: 'm', source: 'p.plan.md', ordinal: 0 }] });
  assert.match(rk.html, /data-detail-id="risk:p\.plan\.md#r0"/);
  assert.ok(rk.details instanceof Map && rk.details.size === 1);

  const tl = renderAuditTimeline(
    { sources: { receipts: { items: [{ gate_id: 'mccp-plan-codex', decision_id: 'd', converged: true, receipt_hash: 'sha256:abc123', created_at: new Date().toISOString() }] } } },
    formatUtils, Date.now(), { snapshotsDir: null });
  assert.match(tl.html, /data-detail-id="receipt:/);
  assert.ok(tl.details instanceof Map && tl.details.size === 1);
});

test('Risks — sample anatomy (li-item/sev/li-q/meta-cue mit) + prose clean', () => {
  const planBody = { risks: [{ risk: PROSE, impact: 'High', likelihood: 'Medium', mitigation: 'fix — with `code` and **bold**' }] };
  const { html } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.ok(html.includes('class="li-item"'));
  assert.ok(html.includes('class="sev s-'));
  assert.ok(html.includes('class="li-q"'));
  assert.ok(html.includes('class="meta-cue mit"'));
  assertProseClean(html, 'Risks');
});

test('Pipeline — sample anatomy (pipe-id/pipe-stages/node-mark/node-label/pipe-status)', () => {
  const m = { sources: { receipts: { items: [
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate: 'mccp-implement-codex', converged: false, round: 1, created_at: '2026-06-22T02:00:00Z' },
  ] } } };
  const { html } = renderPipeline(m, formatUtils, {});
  for (const cls of ['pipe-id', 'pipe-stages', 'node-mark', 'node-label', 'node-link', 'pipe-status']) {
    assert.ok(html.includes('class="' + cls), 'pipeline missing ' + cls);
  }
});

test('Pipeline — is-block (divergent round>=2) vs is-active (first round) derivation (F1)', () => {
  const blocked = renderPipeline({ sources: { receipts: { items: [
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate: 'mccp-implement-codex', converged: false, round: 2, created_at: '2026-06-22T02:00:00Z' },
  ] } } }, formatUtils, {}).html;
  assert.match(blocked, /pipe-node is-block/);
  assert.match(blocked, /pipe-status s-block/);

  const active = renderPipeline({ sources: { receipts: { items: [
    { ok: true, decision_id: 'd2', gate: 'mccp-plan-codex', converged: false, round: 1, created_at: '2026-06-22T01:00:00Z' },
  ] } } }, formatUtils, {}).html;
  assert.match(active, /pipe-node is-active/);
  assert.doesNotMatch(active, /is-block/);
});

test('Timeline — sample anatomy (audit-row/audit-rail/audit-node/audit-head/audit-meta) + is-bad derivation', () => {
  const now = Date.UTC(2026, 5, 18);
  const m = { sources: { receipts: { items: [
    { gate_id: 'mccp-pr-codex', decision_id: 'ok1', converged: true, round: 1, created_at: new Date(now - 600_000).toISOString(),
      briefing_summary: 'all good — `x` **b**', briefing_token_count: 2100 },
    { gate_id: 'mccp-implement-codex', decision_id: 'bad1', converged: false, round: 2, created_at: new Date(now - 1200_000).toISOString() },
  ] } } };
  const { html } = renderAuditTimeline(m, formatUtils, now, { snapshotsDir: null });
  for (const cls of ['audit-row', 'audit-rail', 'audit-node is-ok', 'audit-head', 'audit-gate', 'audit-meta']) {
    assert.ok(html.includes('class="' + cls.split(' ')[0]) || html.includes(cls), 'timeline missing ' + cls);
  }
  assert.match(html, /audit-node is-bad/); // divergent receipt
  assert.match(html, /conv is-bad/);
  assertProseClean(html, 'Timeline');
});

// H1 회귀 가드 — status-grid 의 blocked 카운트(hero axis-legend + pin-alert 구동)와
// pipeline 의 blocked 집계가 동일 SSoT(deriveDecisionState)에서 나와 항상 일치해야 한다.
// 폐기된 `converged===false` per-receipt 휴리스틱은 첫 라운드 in-progress 를 차단으로
// 오집계해 두 surface 가 모순됐다("차단 1" vs "차단 0").
function gridBlocked(m) {
  const cell = (renderStatusGrid(m, formatUtils, {}, {}).cells || [])
    .find(c => c.accent === 'blocked');
  return Number(cell && cell.value);
}
function pipeBlocked(m) {
  const foot = renderPipeline(m, formatUtils, {}).foot || '';
  return Number((foot.match(/차단 (\d+)/) || [])[1]);
}

test('H1 — status-grid blocked == pipeline blocked (shared SSoT)', () => {
  // (a) 첫 라운드 미수렴 = active, NOT blocked → 양쪽 0
  const active = { sources: { receipts: { items: [
    { ok: true, decision_id: 'fresh', gate: 'mccp-plan-codex', converged: false, round: 1, created_at: '2026-06-23T01:00:00Z' },
  ] } } };
  assert.equal(gridBlocked(active), 0, 'first-round in-progress must not count as blocked');
  assert.equal(gridBlocked(active), pipeBlocked(active));

  // (b) 에스컬레이트(round>=2) 미수렴 = divergent → 양쪽 1
  const blocked = { sources: { receipts: { items: [
    { ok: true, decision_id: 'stuck', gate: 'mccp-implement-codex', converged: false, round: 2, created_at: '2026-06-23T02:00:00Z' },
  ] } } };
  assert.equal(gridBlocked(blocked), 1, 'escalated divergent must count as blocked');
  assert.equal(gridBlocked(blocked), pipeBlocked(blocked));

  // (c) 나중 수렴이 stale 차단을 supersede → 양쪽 0
  const superseded = { sources: { receipts: { items: [
    { ok: true, decision_id: 'd', gate: 'mccp-implement-codex', converged: false, round: 2, created_at: '2026-06-23T01:00:00Z' },
    { ok: true, decision_id: 'd', gate: 'mccp-pr-codex', converged: true, round: 1, created_at: '2026-06-23T03:00:00Z' },
  ] } } };
  assert.equal(gridBlocked(superseded), pipeBlocked(superseded));
});

test('F3 — no deprecated structural class ATTRIBUTE across section outputs', () => {
  const DEPRECATED = /class="[^"]*\b(oq-item|risk-item|item-text|tl-step|tl-node|pipe-icon|pipe-edge|pipe-track|ms-name|risk-mitigation|hero-meta|hero-next|severity-tag)\b[^"]*"/;
  const outs = [
    renderOpenQuestions({ sources: {} }, formatUtils, { openQuestions: [{ text: PROSE, source: 'p.plan.md', lineNumber: 1, headingPath: ['## Open Questions'], severity: 'LOW' }] }).html,
    renderRisks({ sources: {} }, formatUtils, { risks: [{ risk: PROSE, impact: 'High', likelihood: 'Low', mitigation: 'm' }] }).html,
    renderPipeline({ sources: { receipts: { items: [{ ok: true, decision_id: 'd', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' }] } } }, formatUtils, {}).html,
    renderAuditTimeline({ sources: { receipts: { items: [{ gate_id: 'mccp-plan-codex', decision_id: 'd', converged: true, created_at: new Date().toISOString() }] } } }, formatUtils, Date.now(), { snapshotsDir: null }).html,
  ];
  for (const html of outs) {
    assert.doesNotMatch(html, DEPRECATED, 'deprecated structural class attribute leaked: ' + (html.match(DEPRECATED) || [''])[0]);
  }
});
