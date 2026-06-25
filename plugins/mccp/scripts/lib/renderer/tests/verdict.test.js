'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeVerdict, planSlug } = require('../verdict');

const empty = () => ({ sources: {} });

test('step 1 — capability contract_present=false → red', () => {
  const v = computeVerdict({ m0_capability: { contract_present: false }, sources: {} });
  assert.equal(v.tone, 'red');
  assert.match(v.text, /schema contract missing/);
});

test('step 2 — critical warning → red', () => {
  const v = computeVerdict({
    sources: {},
    warnings: [{ source: 'X', message: 'boom', severity: 'critical' }],
  });
  assert.equal(v.tone, 'red');
  assert.match(v.text, /X: boom/);
});

test('step 3 — degraded source named (impeccable P3 absorption)', () => {
  const v = computeVerdict({
    sources: { plans: { degraded: true }, receipts: { degraded: true } },
  });
  assert.equal(v.tone, 'amber');
  assert.match(v.text, /plans \+ 1 more/);
});

test('step 4 — resume giveup → red', () => {
  const v = computeVerdict({
    sources: {
      state: { item: { resume_state: 'giveup', frontmatter: { dispatch_attempt_count: 3 } } },
    },
  });
  assert.match(v.text, /gave up after 3/);
});

test('step 5 — resume in-flight → amber', () => {
  const v = computeVerdict({
    sources: {
      state: { item: { resume_state: 'in-flight', frontmatter: { dispatch_attempt_count: 1 } } },
    },
  });
  assert.equal(v.tone, 'amber');
  assert.match(v.text, /in-flight/);
});

test('step 6 — fix-task pending escalate', () => {
  const v = computeVerdict({
    sources: {
      state: { item: { escalate_pending: true } },
      fix_task: { item: { verdict: 'pending' } },
    },
  });
  assert.equal(v.tone, 'amber');
  assert.match(v.text, /fix-task pending/);
});

test('step 7 — stale workers', () => {
  const v = computeVerdict({
    sources: { envelopes: { items: [{ ok: true, stale: true }, { ok: true, stale: true }] } },
  });
  assert.match(v.text, /2 worker\(s\) heartbeat stale/);
});

test('step 7.5 — controller active but envelopes empty (R1 F3 absorption)', () => {
  const v = computeVerdict({
    sources: {
      state: { item: { controller_active: true, frontmatter: { active_dispatch_count: 2 } } },
      envelopes: { items: [] },
    },
  });
  assert.equal(v.tone, 'amber');
  assert.match(v.text, /controller active.*2 dispatches/);
});

test('step 8 — alive workers', () => {
  const v = computeVerdict({
    sources: {
      envelopes: {
        items: [
          { ok: true, is_terminal: false, stale: false },
          { ok: true, is_terminal: true },
        ],
      },
    },
  });
  assert.equal(v.tone, 'green');
  assert.match(v.text, /1 worker\(s\) alive · 1 terminal/);
});

test('step 9 — fresh in-progress wins over backlog-deferred (M5 Task 3 reorder)', () => {
  const v = computeVerdict(
    {
      sources: {
        backlog: { count: 5 },
        plans: { items: [{ path: 'foo.plan.md' }] },
      },
    },
    { planStatuses: new Map([['foo.plan.md', 'in-progress']]) },
  );
  // M5 Task 3 — backlog 가 있어도 fresh in-progress plan 이 Hero h1 을 차지(현재 작업
  // 우선). backlog 는 '이월 finding' 셀로만 노출(숨김 아닌 이동).
  assert.equal(v.tone, 'neutral');
  assert.match(v.text, /현재 작업: foo/);
});

test('step 10 — fresh in-progress → 현재 작업 (M5 Task 3 reorder)', () => {
  const v = computeVerdict(
    {
      sources: {
        backlog: { count: 0 },
        plans: { items: [{ path: 'a.plan.md' }, { path: 'b.plan.md' }] },
      },
    },
    { planStatuses: new Map([['a.plan.md', 'in-progress'], ['b.plan.md', 'in-progress']]) },
  );
  assert.equal(v.tone, 'neutral');
  assert.match(v.text, /현재 작업: a/);
});

test('step 11 — idle fallback (impeccable P2: not bare "idle")', () => {
  const v = computeVerdict(empty());
  assert.equal(v.tone, 'muted');
  assert.match(v.text, /no in-flight signal · select next milestone/);
});

test('invariant — capability degraded wins over alive workers', () => {
  const v = computeVerdict({
    m0_capability: { contract_present: false },
    sources: { envelopes: { items: [{ ok: true, is_terminal: false, stale: false }] } },
  });
  assert.equal(v.tone, 'red');
});

test('invariant — resume in-flight wins over fix-task pending', () => {
  const v = computeVerdict({
    sources: {
      state: {
        item: {
          resume_state: 'in-flight', escalate_pending: true,
          frontmatter: { dispatch_attempt_count: 2 },
        },
      },
      fix_task: { item: { verdict: 'pending' } },
    },
  });
  assert.match(v.text, /in-flight/);
});

test('planSlug helper', () => {
  assert.equal(planSlug({ slug: 'foo' }), 'foo');
  assert.equal(planSlug({ path: '.claude/plans/v1-3-0-m3.plan.md' }), 'v1-3-0-m3');
  assert.equal(planSlug(null), '(unknown)');
});
