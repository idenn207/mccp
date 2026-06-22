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

test('html header contains brand + status-strip + meta', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /<header[^>]*>[\s\S]*?<span class="brand">/);
  assert.match(r.html, /<div class="status-strip" role="group"/);
  assert.match(r.html, /<span class="meta">/);
});

test('html status-strip contains exactly 4 cells', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  const stripMatch = r.html.match(/<div class="status-strip"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(stripMatch, 'status-strip block exists');
  const cellMatches = stripMatch[1].match(/<span class="cell[^"]*"/g) || [];
  assert.equal(cellMatches.length, 4, 'four cells in status strip');
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

test('html sticky CSS present (header position: sticky)', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /header\s*{[^}]*position:\s*sticky/);
  assert.match(r.html, /header\s*{[^}]*top:\s*0/);
});

test('html accent invariant — only first-of-type cell gets var(--accent) by default', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.match(r.html, /\.status-strip \.cell:first-of-type\s*{\s*color:\s*var\(--accent\)/);
});

test('html stale fixture — next cell gets data-stale="1"', () => {
  const model = makeModel(Date.now(), 'v0-3-5-codex-disabled-honor');
  const r = renderWithStubs(model);
  assert.match(r.html, /<span class="cell s-stale" data-stale="1">/);
});

test('html non-stale fixture — no data-stale attr on any cell', () => {
  const r = renderWithStubs(makeModel(Date.now(), 'v1-4-2-dashboard-overhaul'));
  assert.doesNotMatch(r.html, /<span class="cell[^"]*" data-stale="1">/);
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
