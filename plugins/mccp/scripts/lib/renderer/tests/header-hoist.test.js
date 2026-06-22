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

test('html header has brand + meta; status-strip lives in the left sidebar (Vercel app-shell)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /<header[^>]*>[\s\S]*?<span class="brand">/);
  assert.match(r.html, /<span class="meta">/);
  assert.match(r.html, /<aside class="sidebar"[\s\S]*?<div class="status-strip" role="group"/);
  assert.doesNotMatch(r.html, /<header[^>]*>[\s\S]*?<div class="status-strip"[\s\S]*?<\/header>/);
});

test('html status-strip contains exactly 4 status rows', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  const stripMatch = r.html.match(/<div class="status-strip"[^>]*>([\s\S]*?)<\/aside>/);
  assert.ok(stripMatch, 'status-strip block exists');
  const cellMatches = stripMatch[1].match(/<a class="cell[^"]*"/g) || [];
  assert.equal(cellMatches.length, 4, 'four status rows in strip');
});

test('html main has NO section#status (4축 hoisted to header)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.doesNotMatch(r.html, /<section id="status"/);
});

test('html main retains section#verdict with h1.verdict', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /<section id="verdict"[^>]*>/);
  assert.match(r.html, /<h1 class="verdict s-[a-z]+">/);
});

test('html app-shell — sidebar is sticky, header is NOT (status in left sidebar)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /\.sidebar\s*{[^}]*position:\s*sticky/);
  assert.doesNotMatch(r.html, /header\s*{[^}]*position:\s*sticky/);
});

test('html accent invariant — first-of-type status chip icon gets var(--accent)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /\.status-strip \.cell:first-of-type \.icon\s*{\s*color:\s*var\(--accent\)/);
});

test('html stale fixture — next chip gets data-stale="1"', () => {
  const model = makeModel(Date.now(), 'v0-3-5-codex-disabled-honor');
  const r = renderWithStubs(model);
  assert.match(r.html, /<a class="cell s-stale"[^>]*data-stale="1"/);
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
