'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderPipeline, _latest, _gateOf } = require('../sections/pipeline');

function model(items) {
  return { sources: { receipts: { items } } };
}

test('pipeline — empty input fail-open', () => {
  const { md, html } = renderPipeline(model([]), formatUtils, {});
  assert.match(md, /게이트 활동 없음/);
  assert.match(html, /게이트 활동 없음/);
});

test('pipeline — canonical gate via gate or gate_id (F1)', () => {
  // one decision uses `gate`, another uses legacy `gate_id`; both canonical.
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate_id: 'mccp-implement-codex', converged: true, created_at: '2026-06-22T02:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  assert.match(html, /pipe-decision">d1/);
  // both plan + impl resolved as converged (✓), pr missing (○)
  const converged = (html.match(/s-terminal-ok/g) || []).length;
  assert.equal(converged, 2);
  assert.match(html, /pipe-node muted/); // pr missing
});

test('pipeline — latest per (decision,gate): retry false→true convergence (F1)', () => {
  // stale failed receipt must NOT keep node blocked after later converged one.
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: false, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T03:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  // plan node must read converged (latest wins), not pending.
  assert.match(html, /s-terminal-ok/);
  const pending = (html.match(/pipe-node s-stale/g) || []).length;
  assert.equal(pending, 0);
});

test('pipeline — latest tiebreak by round when created_at equal', () => {
  const picked = _latest([
    { converged: false, created_at: '2026-06-22T01:00:00Z', round: 1 },
    { converged: true, created_at: '2026-06-22T01:00:00Z', round: 2 },
  ]);
  assert.equal(picked.converged, true);
  assert.equal(picked.round, 2);
});

test('pipeline — status-aware collapse: blocked/unconverged row stays visible (F3)', () => {
  // 3 complete decisions + 1 with a pending node = 4 total.
  // The pending (attention) decision must NOT be collapsed even though it is
  // the 4th by recency.
  const items = [];
  for (let i = 0; i < 3; i++) {
    items.push({ ok: true, decision_id: 'c' + i, gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T0' + (5 - i) + ':00:00Z' });
    items.push({ ok: true, decision_id: 'c' + i, gate: 'mccp-implement-codex', converged: true, created_at: '2026-06-22T0' + (5 - i) + ':10:00Z' });
    items.push({ ok: true, decision_id: 'c' + i, gate: 'mccp-pr-codex', converged: true, created_at: '2026-06-22T0' + (5 - i) + ':20:00Z' });
  }
  // attention decision — oldest, so by recency it would be last.
  items.push({ ok: true, decision_id: 'BLOCKED', gate: 'mccp-plan-codex', converged: false, created_at: '2026-06-22T01:00:00Z' });

  const { html } = renderPipeline(model(items), formatUtils, {});
  // The collapsed bucket lives inside <details>; the attention row must appear
  // OUTSIDE/BEFORE any <details> (i.e., in the expanded top list).
  const detailsIdx = html.indexOf('<details>');
  const blockedIdx = html.indexOf('BLOCKED');
  assert.ok(blockedIdx !== -1, 'blocked decision rendered');
  if (detailsIdx !== -1) {
    assert.ok(blockedIdx < detailsIdx, 'blocked row must be expanded, not collapsed');
  }
  assert.match(html, /data-kind="attention"/);
});

test('pipeline — node carries color + icon + sr-only text (a11y, color not alone)', () => {
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  assert.match(html, /pipe-icon" aria-hidden="true">✓/);
  assert.match(html, /class="sr-only">수렴/);
  assert.match(html, /pipe-node s-terminal-ok/);
});

test('pipeline — connector is .pipe-edge span (no border-left side-stripe, F2/H4)', () => {
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate: 'mccp-pr-codex', converged: true, created_at: '2026-06-22T02:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  assert.match(html, /<span class="pipe-edge" aria-hidden="true">/);
});

test('pipeline — decision id is escaped (self-injection defense)', () => {
  const m = model([
    { ok: true, decision_id: '<img src=x onerror=1>', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('pipeline — non-canonical gates ignored', () => {
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'some-other-gate', converged: true, created_at: '2026-06-22T01:00:00Z' },
  ]);
  const { md } = renderPipeline(m, formatUtils, {});
  assert.match(md, /게이트 활동 없음/);
});

test('pipeline — _gateOf reads gate_id then gate', () => {
  assert.equal(_gateOf({ gate_id: 'mccp-plan-codex' }), 'mccp-plan-codex');
  assert.equal(_gateOf({ gate: 'mccp-pr-codex' }), 'mccp-pr-codex');
  assert.equal(_gateOf({}), '');
});
