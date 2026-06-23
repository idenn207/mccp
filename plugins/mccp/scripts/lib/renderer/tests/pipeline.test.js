'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderPipeline } = require('../sections/pipeline');
const { latest, gateOf, deriveDecisionState } = require('../parsers/decision-state');

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
  assert.match(html, /class="pipe-id">d1/);
  // both plan + impl resolved as done; pr missing (node-dot, no is-* class)
  const done = (html.match(/pipe-node is-done/g) || []).length;
  assert.equal(done, 2);
  assert.match(html, /class="node-dot"/); // pr missing marker
});

test('pipeline — latest per (decision,gate): retry false→true convergence (F1)', () => {
  // stale failed receipt must NOT keep node blocked after later converged one.
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: false, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T03:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  // plan node must read done (latest wins), never blocked.
  assert.match(html, /pipe-node is-done/);
  assert.equal((html.match(/is-block/g) || []).length, 0);
});

test('pipeline — latest tiebreak by round when created_at equal', () => {
  const picked = latest([
    { converged: false, created_at: '2026-06-22T01:00:00Z', round: 1 },
    { converged: true, created_at: '2026-06-22T01:00:00Z', round: 2 },
  ]);
  assert.equal(picked.converged, true);
  assert.equal(picked.round, 2);
});

test('pipeline — active first-round node stays visible, never collapsed (F3)', () => {
  // 3 done decisions + 1 with a first-round pending (active) node = 4 total.
  // The active decision must NOT be collapsed even though it is oldest.
  const items = [];
  for (let i = 0; i < 3; i++) {
    items.push({ ok: true, decision_id: 'c' + i, gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T0' + (5 - i) + ':00:00Z' });
    items.push({ ok: true, decision_id: 'c' + i, gate: 'mccp-implement-codex', converged: true, created_at: '2026-06-22T0' + (5 - i) + ':10:00Z' });
    items.push({ ok: true, decision_id: 'c' + i, gate: 'mccp-pr-codex', converged: true, created_at: '2026-06-22T0' + (5 - i) + ':20:00Z' });
  }
  // active decision — oldest first-round pending (round 0 → active, not blocked).
  items.push({ ok: true, decision_id: 'ACTIVEROW', gate: 'mccp-plan-codex', converged: false, created_at: '2026-06-22T01:00:00Z' });

  const { html } = renderPipeline(model(items), formatUtils, {});
  const detailsIdx = html.indexOf('<details');
  const rowIdx = html.indexOf('ACTIVEROW');
  assert.ok(rowIdx !== -1, 'active decision rendered');
  if (detailsIdx !== -1) {
    assert.ok(rowIdx < detailsIdx, 'active row must be expanded, not collapsed');
  }
  assert.match(html, /data-state="active"/);
});

test('pipeline — divergent (round>=2 false) decision reads blocked + s-block status', () => {
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate: 'mccp-implement-codex', converged: false, round: 2, created_at: '2026-06-22T02:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  assert.match(html, /pipe-node is-block/);
  assert.match(html, /pipe-status s-block/);
  assert.match(html, /data-state="blocked"/);
});

test('pipeline — node carries color + icon + sr-only text (a11y, color not alone)', () => {
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  assert.match(html, /pipe-node is-done/);
  assert.match(html, /class="node-mark"><svg class="i" aria-hidden="true"><use href="#ic-check"/);
  assert.match(html, /class="sr-only">plan 수렴/);
});

test('pipeline — connector is .node-link span (no border-left side-stripe, F2/H4)', () => {
  const m = model([
    { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: true, created_at: '2026-06-22T01:00:00Z' },
    { ok: true, decision_id: 'd1', gate: 'mccp-pr-codex', converged: true, created_at: '2026-06-22T02:00:00Z' },
  ]);
  const { html } = renderPipeline(m, formatUtils, {});
  assert.match(html, /<span class="node-link" aria-hidden="true">/);
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

test('decision-state — gateOf reads gate_id then gate', () => {
  assert.equal(gateOf({ gate_id: 'mccp-plan-codex' }), 'mccp-plan-codex');
  assert.equal(gateOf({ gate: 'mccp-pr-codex' }), 'mccp-pr-codex');
  assert.equal(gateOf({}), '');
});

test('decision-state — 4 fixtures: active retry / superseded / multi-gate / divergent', () => {
  const R = (gate, dec, conv, round, t) => ({ gate_id: gate, decision_id: dec, converged: conv, round, created_at: new Date(t).toISOString(), ok: true });
  const m = deriveDecisionState([
    R('mccp-plan-codex', 'A', true, 1, 1000), R('mccp-implement-codex', 'A', false, 1, 2000),
    R('mccp-plan-codex', 'B', true, 1, 1000), R('mccp-implement-codex', 'B', false, 1, 2000), R('mccp-implement-codex', 'B', true, 2, 3000),
    R('mccp-plan-codex', 'C', true, 1, 1000), R('mccp-implement-codex', 'C', true, 1, 2000), R('mccp-pr-codex', 'C', false, 1, 3000),
    R('mccp-plan-codex', 'D', true, 1, 1000), R('mccp-implement-codex', 'D', false, 2, 2000),
  ]);
  assert.equal(m.get('A').state, 'active'); // first-round impl pending, NOT blocked
  assert.equal(m.get('A').nodes[1].status, 'active');
  assert.equal(m.get('B').state, 'active'); // retry round2 converged → impl done
  assert.equal(m.get('B').nodes[1].status, 'done');
  assert.equal(m.get('C').state, 'active'); // pr first-round pending
  assert.equal(m.get('D').state, 'blocked'); // impl round2 divergent
  assert.equal(m.get('D').nodes[1].status, 'blocked');
});
