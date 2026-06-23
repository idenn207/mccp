'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

function makeModel(now, taskFingerprint) {
  return {
    derived_at: new Date(now).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: {
        count: 1,
        items: [{ path: 'v1-4-2-dashboard-overhaul-m1.plan.md', source_prd: 'prd.md' }],
      },
      receipts: { count: 0, items: [] },
      state: {
        item: {
          resume_state: 'idle',
          frontmatter: { task_fingerprint: taskFingerprint },
          body: {},
        },
      },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
}

function renderWithStubs(model) {
  return renderStatus(model, {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) {
        return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 1 | a | x | in-progress | [v1-4-2-dashboard-overhaul-m1.plan.md](v1-4-2-dashboard-overhaul-m1.plan.md) |\n';
      }
      return '# plan\n';
    },
  });
}

test('html header has meta only; brand + nav in left sidebar; status-strip retired (redesign-3)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /<header[^>]*>[\s\S]*?<span class="meta">/);
  assert.doesNotMatch(r.html, /<header[^>]*>[\s\S]*?<div class="brand">/);
  assert.match(r.html, /<aside class="sidebar"[\s\S]*?<div class="brand">mccp 상태<\/div>[\s\S]*?<nav class="nav-rail"/);
  assert.doesNotMatch(r.html, /class="status-strip"/);
});

test('overview hero surfaces inline 4축 meta (진행/차단/위험)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  const heroMatch = r.html.match(/<p class="hero-meta">([\s\S]*?)<\/p>/);
  assert.ok(heroMatch, 'hero-meta block exists');
  assert.match(heroMatch[1], /진행 중/);
  assert.match(heroMatch[1], /차단/);
  assert.match(heroMatch[1], /미해결 위험/);
});

test('html main has NO section#status (4축 hoisted to header)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.doesNotMatch(r.html, /<section id="status"/);
});

test('overview route holds h1.verdict inside the hero panel', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /<section class="route" id="route-overview"/);
  assert.match(r.html, /<div class="hero-panel[^"]*"><h1 class="verdict s-[a-z]+">/);
});

test('html app-shell — sidebar is sticky, header is NOT (status in left sidebar)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /\.sidebar\s*{[^}]*position:\s*sticky/);
  assert.doesNotMatch(r.html, /header\s*{[^}]*position:\s*sticky/);
});

test('sidebar nav-rail wires 3 page route links', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /data-route-link="overview"/);
  assert.match(r.html, /data-route-link="pipeline"/);
  assert.match(r.html, /data-route-link="activity"/);
});

test('stale fixture — next renders stale-label inside hero-next', () => {
  const model = makeModel(Date.now(), 'v0-3-5-codex-disabled-honor');
  const r = renderWithStubs(model);
  assert.match(r.html, /<div class="hero-next">[\s\S]*?<span class="stale-label">/);
});

test('html non-stale fixture — no data-stale attr on any chip', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.doesNotMatch(r.html, /<a class="cell[^"]*"[^>]*data-stale="1"/);
});

test('html stale fixture — next value wrapped in span.stale-label not code (F2 absorption)', () => {
  const model = makeModel(Date.now(), 'v0-3-5-codex-disabled-honor');
  const r = renderWithStubs(model);
  assert.match(r.html, /<span class="stale-label">미정 \(stale\)<\/span>/);
});

test('html fresh fixture — next value wrapped in code (default)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /<code>v1\.4\.2 · dashboard overhaul m1<\/code>/);
});

test('html — body lang="ko"', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /<html lang="ko">/);
});
