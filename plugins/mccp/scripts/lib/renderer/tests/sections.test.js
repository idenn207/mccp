'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderStatusGrid } = require('../sections/status-grid');
const { renderWorkerFanout } = require('../sections/worker-fanout');
const { renderAuditTimeline } = require('../sections/audit-timeline');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');

test('status-grid — 4 cells + grid CSS literal', () => {
  const model = {
    sources: {
      plans: { items: [
        { path: 'a.plan.md' }, { path: 'b.plan.md' }, { path: 'c.plan.md' },
      ] },
      receipts: { items: [
        { decision_id: 'd1', converged: false },
        { decision_id: 'd2', converged: false },
      ] },
      backlog: { items: [{ severity: 'HIGH' }, { severity: 'LOW' }] },
    },
  };
  const planBody = {
    planStatuses: new Map([
      ['a.plan.md', 'in-progress'],
      ['b.plan.md', 'in-progress'],
      ['c.plan.md', 'in-progress'],
    ]),
  };
  const { md, html } = renderStatusGrid(model, formatUtils, planBody);
  assert.match(md, /3/);
  assert.match(md, /2/);
  assert.match(md, /1/);
  assert.match(md, /a/);
  assert.match(html, /grid-template-columns:repeat\(auto-fit,minmax\(180px,1fr\)\)/);
});

test('worker-fanout — null when envelopes.count===0 and no controller', () => {
  const model = { sources: { envelopes: { count: 0, items: [] } } };
  assert.equal(renderWorkerFanout(model, formatUtils), null);
});

test('worker-fanout — alive + stale rows', () => {
  const model = {
    sources: {
      envelopes: {
        count: 2,
        items: [
          { ok: true, dispatch_id: 'aaaaaaaa11111111', worker_subagent_type: 'planner', is_terminal: false, stale: false, heartbeat_at: new Date().toISOString(), receipts_added: 1 },
          { ok: true, dispatch_id: 'bbbbbbbb22222222', worker_subagent_type: 'reviewer', is_terminal: false, stale: true, heartbeat_at: new Date(Date.now() - 120_000).toISOString(), receipts_added: 0 },
        ],
      },
    },
  };
  const { md, html } = renderWorkerFanout(model, formatUtils);
  assert.match(md, /활성/);
  assert.match(md, /심박 끊김/);
  assert.match(html, /s-worker-alive/);
  assert.match(html, /s-worker-stale/);
});

test('worker-fanout — invalid envelope shown with corrupt marker', () => {
  const model = {
    sources: {
      envelopes: {
        count: 1,
        items: [{ ok: false, path: '/some/bad/path.json', error: 'parse error' }],
      },
    },
  };
  const { md } = renderWorkerFanout(model, formatUtils);
  assert.match(md, /envelope corrupt/);
  assert.match(md, /parse error/);
});

test('audit-timeline — 3 receipts in window, 1 with briefing', () => {
  const now = Date.UTC(2026, 5, 18);
  const model = {
    sources: {
      receipts: {
        items: [
          { gate_id: 'mccp-plan-codex', decision_id: 'aaaaaaaaaaaa', converged: true,
            created_at: new Date(now - 3600_000).toISOString(),
            briefing_summary: 'plan looks fine', briefing_token_count: 142 },
          { gate_id: 'mccp-implement-codex', decision_id: 'bbbbbbbbbbbb', converged: true,
            created_at: new Date(now - 7200_000).toISOString() },
          { gate_id: 'mccp-pr-codex', decision_id: 'cccccccccccc', converged: false,
            created_at: new Date(now - 10800_000).toISOString(), briefing_invocation_count: 0 },
        ],
      },
    },
  };
  const { md, html } = renderAuditTimeline(model, formatUtils, now);
  assert.match(md, /plan looks fine/);
  assert.match(md, /briefing 건너뜀/);
  assert.match(html, /blockquote/);
});

test('audit-timeline — empty window yields placeholder', () => {
  const now = Date.UTC(2026, 5, 18);
  const model = {
    sources: {
      receipts: {
        items: [{ gate_id: 'old', decision_id: 'x', converged: true,
          created_at: new Date(now - 30 * 86400_000).toISOString() }],
      },
    },
  };
  const { md } = renderAuditTimeline(model, formatUtils, now);
  assert.match(md, /최근 7일 활동 없음/);
});

test('audit-timeline — caps at 30 rows + older marker', () => {
  const now = Date.UTC(2026, 5, 18);
  const items = [];
  for (let i = 0; i < 35; i++) {
    items.push({
      gate_id: 'g', decision_id: 'd' + i, converged: true,
      created_at: new Date(now - i * 60_000).toISOString(),
    });
  }
  const { md } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  assert.match(md, /\+5 older/);
});

test('open-questions — merge state + plan, dedupe', () => {
  const model = {
    sources: {
      state: { item: { body: { open_questions: ['q1', 'q2'] } } },
    },
  };
  const planBody = { openQuestions: [{ source: 'p.plan.md', text: 'q2' }, { source: 'p.plan.md', text: 'q3' }] };
  const { md } = renderOpenQuestions(model, formatUtils, planBody);
  const lines = md.split('\n').filter(Boolean);
  assert.equal(lines.length, 3);
});

test('open-questions — null when empty', () => {
  assert.equal(renderOpenQuestions({ sources: {} }, formatUtils, {}), null);
});

test('open-questions — cap at 15 + +N more marker', () => {
  const stateOQ = [];
  for (let i = 0; i < 20; i++) stateOQ.push('q' + i);
  const model = { sources: { state: { item: { body: { open_questions: stateOQ } } } } };
  const { md } = renderOpenQuestions(model, formatUtils, {});
  assert.match(md, /\+5 more/);
});

test('risks — 4 rows sorted by impact desc', () => {
  const planBody = {
    risks: [
      { risk: 'low-impact', likelihood: 'Low', impact: 'Low', mitigation: 'm1', source: 'p' },
      { risk: 'high-impact', likelihood: 'Medium', impact: 'High', mitigation: 'm2', source: 'p' },
      { risk: 'medium', likelihood: 'High', impact: 'Medium', mitigation: 'm3', source: 'p' },
      { risk: 'high2', likelihood: 'Low', impact: 'High', mitigation: 'm4', source: 'p' },
    ],
  };
  const { md } = renderRisks({ sources: {} }, formatUtils, planBody);
  const idxHigh = md.indexOf('high-impact');
  const idxMed = md.indexOf('medium');
  const idxLow = md.indexOf('low-impact');
  assert.ok(idxHigh > 0 && idxMed > 0 && idxLow > 0);
  assert.ok(idxHigh < idxMed, 'high impact before medium');
  assert.ok(idxMed < idxLow, 'medium before low');
});

test('risks — placeholder when none', () => {
  const { md } = renderRisks({ sources: {} }, formatUtils, { risks: [] });
  assert.match(md, /no risks surface/);
});

test('risks — cap at 8 + +N less critical marker', () => {
  const risks = [];
  for (let i = 0; i < 12; i++) {
    risks.push({ risk: 'r' + i, likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'p' });
  }
  const { md } = renderRisks({ sources: {} }, formatUtils, { risks });
  assert.match(md, /\+4 less critical/);
});
