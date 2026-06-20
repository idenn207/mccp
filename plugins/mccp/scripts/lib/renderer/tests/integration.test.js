'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

test('integration — synthesized model with all section types', () => {
  const now = Date.now();
  const model = {
    derived_at: new Date(now).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: {
        count: 2,
        items: [
          { path: 'a.plan.md', source_prd: 'prd.md' },
          { path: 'b.plan.md', source_prd: 'prd.md' },
        ],
      },
      receipts: {
        count: 3,
        items: [
          {
            gate_id: 'mccp-plan-codex', decision_id: 'aaaa', converged: true,
            created_at: new Date(now - 60_000).toISOString(),
            briefing_summary: 'plan looks fine', briefing_token_count: 100,
          },
          {
            gate_id: 'mccp-implement-codex', decision_id: 'bbbb', converged: true,
            created_at: new Date(now - 120_000).toISOString(),
          },
          {
            gate_id: 'mccp-pr-codex', decision_id: 'cccc', converged: false,
            created_at: new Date(now - 180_000).toISOString(), briefing_invocation_count: 0,
          },
        ],
      },
      state: {
        item: {
          resume_state: 'idle',
          body: { open_questions: ['will dashboard work?'] },
          frontmatter: {
            controller_session_id: null,
            active_dispatch_count: 0,
            task_fingerprint: 'v1-4-2-dashboard-overhaul',
          },
        },
      },
      backlog: { count: 1, items: [{ severity: 'HIGH', text: 'finding A' }] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: {
        count: 2,
        items: [
          {
            ok: true, dispatch_id: 'eee1111111111111', worker_subagent_type: 'planner',
            is_terminal: false, stale: false,
            heartbeat_at: new Date(now - 10_000).toISOString(), receipts_added: 0,
          },
          {
            ok: true, dispatch_id: 'fff2222222222222', worker_subagent_type: 'reviewer',
            is_terminal: true, terminal_state: 'ok',
            heartbeat_at: new Date(now - 60_000).toISOString(), receipts_added: 1,
          },
        ],
      },
    },
    correlations: [],
  };
  const planBody = {
    planStatuses: new Map([['a.plan.md', 'in-progress'], ['b.plan.md', 'pending']]),
  };
  const r = renderStatus(model, {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) {
        return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 0 | a | x | in-progress | [a.plan.md](a.plan.md) |\n| 1 | b | y | pending | [b.plan.md](b.plan.md) |\n';
      }
      if (p.endsWith('a.plan.md') || p.endsWith('b.plan.md')) {
        return '# plan\n\n## Open Questions\n\n- [ ] q1\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| rr | High | High | mm |\n';
      }
      throw new Error('ENOENT ' + p);
    },
  });

  assert.match(r.md, /# mccp 상태/);
  assert.match(r.md, /## Verdict/);
  assert.match(r.md, /## 현황/);
  assert.match(r.md, /## 워커/);
  assert.match(r.md, /## 타임라인/);
  assert.match(r.md, /## 위험/);
  assert.match(r.md, /1 worker\(s\) alive/);
  assert.match(r.md, /plan looks fine/);

  assert.match(r.html, /<!doctype html>/);
  assert.match(r.html, /<\/html>$/);
  assert.match(r.html, /oklch\(/);
  const sectionOpens = (r.html.match(/<section/g) || []).length;
  const sectionCloses = (r.html.match(/<\/section>/g) || []).length;
  assert.equal(sectionOpens, sectionCloses, 'balanced section tags');
});

test('integration — degraded source goes amber', () => {
  const r = renderStatus({
    m0_capability: { contract_present: true },
    sources: {
      plans: { degraded: true, count: 0, items: [] },
      receipts: { count: 0, items: [] },
      state: { item: null },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
  });
  assert.equal(r.verdict.tone, 'amber');
});

test('integration — capability missing → red verdict', () => {
  const r = renderStatus({
    m0_capability: { contract_present: false },
    sources: {
      plans: { count: 0, items: [] },
      receipts: { count: 0, items: [] },
      state: { item: null },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
  });
  assert.equal(r.verdict.tone, 'red');
});
