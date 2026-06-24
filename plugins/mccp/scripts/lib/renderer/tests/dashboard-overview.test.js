'use strict';

// Dashboard Truthfulness M2 — 개요 → '대시보드' 재구성 headline 회귀.
// (a) named widgets surface item NAMES (not just counts), top-N + collapse.
// (b) version line consumes derive model.host_version snapshot (no render-time read).
// (c) next-action extracted from STATE.md nextStep blob (full command line).
// (d) STATUS.md plain-text equivalence (version · widgets · next-action).

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderStatusGrid } = require('../sections/status-grid');
const { renderStatus } = require('../index');

function baseModel(overrides) {
  return Object.assign({
    repo_root: '/x/myproj',
    host_version: { version: '1.18.4', source: 'changelog', latest_plan: 'v1-18-4-foo-m2.plan.md', degraded: false, error: null },
    sources: {
      plans: { items: [
        { path: 'v1-18-4-foo-m2.plan.md' },
        { path: 'v1-18-4-bar.plan.md' },
      ] },
      receipts: { items: [
        { ok: true, decision_id: 'blocked-decision-x', gate: 'mccp-plan-codex', converged: false, round: 2, created_at: '2026-06-23T01:00:00Z' },
      ] },
      backlog: { items: [
        { severity: 'HIGH', finding: 'lock race in pr-phase' },
        { severity: 'CRITICAL', finding: 'secret leak in envelope' },
      ] },
      state: { item: { resume_state: 'idle', body: { nextStep: '다음 `/mccp:resume` 로 이어가기' } } },
    },
  }, overrides || {});
}

function planBodyWith(statuses, staleness) {
  return {
    planStatuses: new Map(statuses),
    planStaleness: new Map(staleness || []),
  };
}

// ── (a) named widgets surface item NAMES ──────────────────────────────────────
test('dashboard — in-progress widget surfaces plan NAMES, not just a count (headline)', () => {
  const model = baseModel();
  const pb = planBodyWith([
    ['v1-18-4-foo-m2.plan.md', 'in-progress'],
    ['v1-18-4-bar.plan.md', 'in-progress'],
  ], [['v1-18-4-foo-m2.plan.md', 'fresh'], ['v1-18-4-bar.plan.md', 'fresh']]);
  const { cells } = renderStatusGrid(model, formatUtils, pb);
  const inProg = cells.find(c => c.key === 'in-progress');
  assert.equal(inProg.value, '2');
  assert.deepEqual(inProg.items, ['v1.18.4 · foo m2', 'v1.18.4 · bar']);
});

test('dashboard — blocked widget surfaces blocked decision_id (headline)', () => {
  const { cells } = renderStatusGrid(baseModel(), formatUtils, planBodyWith([]));
  const blocked = cells.find(c => c.key === 'blocked');
  assert.equal(blocked.value, '1');
  assert.deepEqual(blocked.items, ['blocked-decision-x']);
});

test('dashboard — risks widget surfaces backlog HIGH/CRITICAL finding text', () => {
  const { cells } = renderStatusGrid(baseModel(), formatUtils, planBodyWith([]));
  const risks = cells.find(c => c.key === 'risks');
  assert.equal(risks.value, '2');
  assert.deepEqual(risks.items, ['lock race in pr-phase', 'secret leak in envelope']);
});

test('dashboard — widget top-N expanded + overflow collapse (cells + md)', () => {
  const plans = [];
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    plans.push({ path: 'v1-18-4-p' + i + '.plan.md' });
    statuses.push(['v1-18-4-p' + i + '.plan.md', 'in-progress']);
  }
  const model = baseModel();
  model.sources.plans = { items: plans };
  const { cells, md } = renderStatusGrid(model, formatUtils, planBodyWith(statuses));
  const inProg = cells.find(c => c.key === 'in-progress');
  assert.equal(inProg.items.length, 5, 'all 5 names retained on the cell');
  assert.match(md, /\+2 더보기/, '5 items → 3 expanded + 2 collapsed (md)');
});

// ── (b) version line consumes host_version snapshot ───────────────────────────
test('dashboard — version line consumes model.host_version snapshot (F2, reproducible)', () => {
  const { version, md } = renderStatusGrid(baseModel(), formatUtils, planBodyWith([]));
  assert.equal(version.version, '1.18.4');
  assert.equal(version.source, 'changelog');
  assert.match(md, /버전: myproj · v1\.18\.4 · CHANGELOG/);
});

test('dashboard — missing host_version degrades to honest 미상 (no false version)', () => {
  const model = baseModel({ host_version: undefined });
  const { version, md } = renderStatusGrid(model, formatUtils, planBodyWith([]));
  assert.equal(version.version, null);
  assert.match(md, /버전: myproj · 미상/);
});

// ── (c) next-action from STATE.md nextStep blob ───────────────────────────────
test('dashboard — next-action extracted from STATE.md nextStep blob (headline /mccp:resume)', () => {
  const { nextAction, md } = renderStatusGrid(baseModel(), formatUtils, planBodyWith([]));
  assert.equal(nextAction.command, '/mccp:resume');
  assert.equal(nextAction.executable, true);
  assert.match(md, /다음: `\/mccp:resume`/);
});

// ── (d) full render: hero html + STATUS.md plain-text equivalence ─────────────
function renderFull(extraState) {
  const now = Date.now();
  const model = {
    derived_at: new Date(now).toISOString(),
    masked: true,
    repo_root: '/x/myproj',
    m0_capability: { contract_present: true },
    warnings: [],
    host_version: { version: '1.18.4', source: 'changelog', latest_plan: 'a.plan.md', degraded: false, error: null },
    sources: {
      plans: { items: [{ path: 'a.plan.md', source_prd: 'prd.md' }] },
      receipts: { items: [] },
      state: { item: Object.assign({ resume_state: 'idle', body: { nextStep: '다음 `/mccp:resume` 로 이어가기' } }, extraState || {}) },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
  return renderStatus(model, {
    cwd: '/test',
    snapshotsDir: null,
    fsRead: (p) => {
      if (p.endsWith('prd.md')) return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 0 | a | x | in-progress | [a.plan.md](a.plan.md) |\n';
      if (p.endsWith('a.plan.md')) return '# plan\n';
      throw new Error('ENOENT ' + p);
    },
  });
}

test('dashboard — hero html surfaces host-version line + named widgets + next-action command', () => {
  const r = renderFull();
  // route renamed in nav/tb-title but route id stays #route-overview.
  assert.match(r.html, /<section class="route" id="route-overview" aria-label="대시보드">/);
  assert.match(r.html, /<p class="hero-version">myproj · v1\.18\.4 · <span class="hv-source">CHANGELOG<\/span><\/p>/);
  assert.match(r.html, /<div class="hero-widgets">/);
  assert.match(r.html, /<code>\/mccp:resume<\/code>/);
  assert.match(r.html, /data-copy="\/mccp:resume"/);
});

test('dashboard — STATUS.md plain-text equivalent carries version · widgets · next-action', () => {
  const r = renderFull();
  assert.match(r.md, /^## 대시보드$/m);
  assert.match(r.md, /버전: myproj · v1\.18\.4 · CHANGELOG/);
  assert.match(r.md, /진행 중 \(1\): a/);
  assert.match(r.md, /다음: `\/mccp:resume`/);
});

test('dashboard — render is design-lint clean (H10/H16 — new widget prose safe)', () => {
  const r = renderFull();
  assert.deepEqual(r.design_constraint_violations, [],
    'design-lint clean: ' + JSON.stringify(r.design_constraint_violations));
});
