'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computePlanStaleness,
  extractCyclePrefix,
  parsePlanBody,
} = require('../parsers/plan-body');
const { computeVerdict } = require('../verdict');

function makeModel(taskFingerprint, planPaths) {
  return {
    sources: {
      state: {
        item: {
          frontmatter: { task_fingerprint: taskFingerprint },
        },
      },
      plans: {
        count: planPaths.length,
        items: planPaths.map(p => ({ path: p, source_prd: 'prd.md' })),
      },
      receipts: { count: 0, items: [] },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
  };
}

test('extractCyclePrefix — v\\d+-\\d+-\\d+ regex', () => {
  assert.equal(extractCyclePrefix('v0-3-5-codex-disabled-honor'), 'v0-3-5');
  assert.equal(extractCyclePrefix('v1-4-2-dashboard-overhaul-m1'), 'v1-4-2');
  assert.equal(extractCyclePrefix('v1-4-2-dashboard-overhaul'), 'v1-4-2');
  assert.equal(extractCyclePrefix('mccp-bootstrap'), null);
  assert.equal(extractCyclePrefix(''), null);
  assert.equal(extractCyclePrefix(null), null);
});

test('computePlanStaleness (a) fingerprint match + plan in same cycle → fresh', () => {
  const model = makeModel('v1-4-2-dashboard-overhaul', ['v1-4-2-dashboard-overhaul-m1.plan.md']);
  const plan = { path: 'v1-4-2-dashboard-overhaul-m1.plan.md' };
  assert.equal(computePlanStaleness(plan, model), 'fresh');
});

test('computePlanStaleness (b) fingerprint cycle mismatch → stale', () => {
  const model = makeModel('v0-3-5-codex-disabled-honor', ['v1-4-2-dashboard-overhaul-m1.plan.md']);
  const plan = { path: 'v1-4-2-dashboard-overhaul-m1.plan.md' };
  assert.equal(computePlanStaleness(plan, model), 'stale');
});

test('computePlanStaleness (c) no fingerprint → unknown', () => {
  const model = {
    sources: {
      state: { item: { frontmatter: {} } },
      plans: { items: [] },
    },
  };
  const plan = { path: 'v1-4-2-dashboard-overhaul-m1.plan.md' };
  assert.equal(computePlanStaleness(plan, model), 'unknown');
});

test('computePlanStaleness (d) plan slug has no cycle prefix → unknown', () => {
  const model = makeModel('v1-4-2-dashboard-overhaul', ['custom-feature.plan.md']);
  const plan = { path: 'custom-feature.plan.md' };
  assert.equal(computePlanStaleness(plan, model), 'unknown');
});

test('parsePlanBody — planStaleness entry only for in-progress plan', () => {
  const model = makeModel('v1-4-2-dashboard-overhaul', [
    'v1-4-2-dashboard-overhaul-m1.plan.md',
    'v0-3-5-codex-disabled-honor.plan.md',
  ]);
  const pb = parsePlanBody(model, {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) {
        return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 1 | a | x | in-progress | [v1-4-2-dashboard-overhaul-m1.plan.md](v1-4-2-dashboard-overhaul-m1.plan.md) |\n| 2 | b | y | pending | [v0-3-5-codex-disabled-honor.plan.md](v0-3-5-codex-disabled-honor.plan.md) |\n';
      }
      return '# plan\n';
    },
  });
  assert.ok(pb.planStaleness instanceof Map, 'planStaleness is a Map');
  assert.equal(pb.planStaleness.get('v1-4-2-dashboard-overhaul-m1.plan.md'), 'fresh');
  assert.equal(pb.planStaleness.has('v0-3-5-codex-disabled-honor.plan.md'), false,
    'pending plan should NOT have staleness entry');
});

test('computeVerdict — all in-progress stale + backlog → amber 다음 미정', () => {
  const model = makeModel('v0-3-5-codex-disabled-honor', ['v1-4-2-dashboard-overhaul-m1.plan.md']);
  model.sources.backlog = { count: 2, items: [] };
  const pb = {
    planStatuses: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'in-progress']]),
    planStaleness: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'stale']]),
  };
  const v = computeVerdict(model, pb);
  assert.equal(v.tone, 'amber');
  assert.match(v.text, /다음 미정/);
  assert.match(v.text, /in-progress plan stale/);
});

test('computeVerdict — all in-progress stale + no backlog → amber 다음 미정 (stale)', () => {
  const model = makeModel('v0-3-5-codex-disabled-honor', ['v1-4-2-dashboard-overhaul-m1.plan.md']);
  const pb = {
    planStatuses: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'in-progress']]),
    planStaleness: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'stale']]),
  };
  const v = computeVerdict(model, pb);
  assert.equal(v.tone, 'amber');
  assert.match(v.text, /다음 미정 \(stale\)/);
});

test('computeVerdict — fresh in-progress → neutral with next slug', () => {
  const model = makeModel('v1-4-2-dashboard-overhaul', ['v1-4-2-dashboard-overhaul-m1.plan.md']);
  const pb = {
    planStatuses: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'in-progress']]),
    planStaleness: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'fresh']]),
  };
  const v = computeVerdict(model, pb);
  assert.equal(v.tone, 'neutral');
  assert.match(v.text, /next: v1-4-2-dashboard-overhaul-m1/);
});

test('computeVerdict — unknown staleness treated as fresh (conservative)', () => {
  const model = makeModel(null, ['v1-4-2-dashboard-overhaul-m1.plan.md']);
  const pb = {
    planStatuses: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'in-progress']]),
    planStaleness: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'unknown']]),
  };
  const v = computeVerdict(model, pb);
  assert.equal(v.tone, 'neutral');
  assert.match(v.text, /1 plans active/);
});
