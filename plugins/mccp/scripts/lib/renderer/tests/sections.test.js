'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderStatusGrid } = require('../sections/status-grid');
const { renderWorkerFanout } = require('../sections/worker-fanout');
const { renderAuditTimeline } = require('../sections/audit-timeline');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');

test('status-grid — 4 cells + structured data + Korean labels', () => {
  const model = {
    sources: {
      plans: { items: [
        { path: 'a.plan.md' }, { path: 'b.plan.md' }, { path: 'c.plan.md' },
      ] },
      // blocked = deriveDecisionState SSoT (H1) — escalated(round>=2) 미수렴만
      // 차단. canonical gate + round 필수(gate 없는 receipt 는 stage 매핑 불가로 제외).
      receipts: { items: [
        { ok: true, decision_id: 'd1', gate: 'mccp-plan-codex', converged: false, round: 2, created_at: '2026-06-23T01:00:00Z' },
        { ok: true, decision_id: 'd2', gate: 'mccp-implement-codex', converged: false, round: 2, created_at: '2026-06-23T01:00:00Z' },
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
  const { md, html, cells } = renderStatusGrid(model, formatUtils, planBody);
  assert.equal(cells.length, 4);
  assert.equal(cells[0].key, 'in-progress');
  assert.equal(cells[0].label, '진행 중');
  assert.equal(cells[1].label, '차단');
  assert.equal(cells[2].label, '다음');
  assert.equal(cells[3].label, '미해결 위험');
  assert.match(md, /진행 중 3/);
  assert.match(md, /차단 2/);
  assert.match(md, /미해결 위험 1/);
  assert.match(html, /<div class="status-grid">/);
});

test('status-grid — nextStep formatted via formatPlanLabel + code wrap (fresh)', () => {
  const model = {
    sources: {
      plans: { items: [{ path: 'v1-4-2-dashboard-overhaul-m1.plan.md' }] },
      receipts: { items: [] },
      backlog: { items: [] },
    },
  };
  const planBody = {
    planStatuses: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'in-progress']]),
    planStaleness: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'fresh']]),
  };
  const { cells, html } = renderStatusGrid(model, formatUtils, planBody);
  assert.equal(cells[2].value, 'v1.4.2 · dashboard overhaul m1');
  assert.equal(cells[2].stale, false);
  assert.match(html, /<code>v1\.4\.2 · dashboard overhaul m1<\/code>/);
});

test('status-grid — nextStep stale → 미정 (stale) + span.stale-label (F2 absorption)', () => {
  const model = {
    sources: {
      plans: { items: [{ path: 'v1-4-2-dashboard-overhaul-m1.plan.md' }] },
      receipts: { items: [] },
      backlog: { items: [] },
    },
  };
  const planBody = {
    planStatuses: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'in-progress']]),
    planStaleness: new Map([['v1-4-2-dashboard-overhaul-m1.plan.md', 'stale']]),
  };
  const { cells, html } = renderStatusGrid(model, formatUtils, planBody);
  assert.equal(cells[2].value, '미정 (stale)');
  assert.equal(cells[2].stale, true);
  assert.match(html, /<span class="stale-label">미정 \(stale\)<\/span>/);
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
  assert.match(html, /class="audit-row"/);
  assert.match(html, /class="brief"/);
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

test('audit-timeline — live cap MAX_ROWS_LIVE=20 (v1.3.0-m5) + older marker', () => {
  // v1.3.0-m5 impeccable P2 absorption — live cap reduced to 20 so archived
  // snapshot rows cannot push live evidence off the section. With 35 live
  // items and no snapshots dir, 35 - 20 = 15 older.
  const now = Date.UTC(2026, 5, 18);
  const items = [];
  for (let i = 0; i < 35; i++) {
    items.push({
      gate_id: 'g', decision_id: 'd' + i, converged: true,
      created_at: new Date(now - i * 60_000).toISOString(),
    });
  }
  const { md } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  assert.match(md, /\+15 older/);
});

test('open-questions — merge state + plan, dedupe (4-part component)', () => {
  const model = {
    sources: {
      state: { item: { body: { open_questions: ['q1', 'q2'] } } },
    },
  };
  const planBody = { openQuestions: [{ source: 'p.plan.md', text: 'q2' }, { source: 'p.plan.md', text: 'q3' }] };
  const { md } = renderOpenQuestions(model, formatUtils, planBody);
  // 3 distinct items (q1 state, q2 dedup state-first, q3 plan). 구분자는 ·(H10).
  assert.ok(md.includes('· q1'));
  assert.ok(md.includes('· q2'));
  assert.ok(md.includes('· q3'));
  // each item → "다음 액션:" line
  const actionCount = (md.match(/다음 액션:/g) || []).length;
  assert.equal(actionCount, 3);
});

test('open-questions — null when empty', () => {
  assert.equal(renderOpenQuestions({ sources: {} }, formatUtils, {}), null);
});

test('open-questions — 3 expanded + 더보기 collapse (MAX_EXPANDED=3)', () => {
  const stateOQ = [];
  for (let i = 0; i < 8; i++) stateOQ.push('q' + i);
  const model = { sources: { state: { item: { body: { open_questions: stateOQ } } } } };
  const { md } = renderOpenQuestions(model, formatUtils, {});
  // 8 items, 3 expanded → 5 collapsed
  assert.match(md, /\+5 더보기/);
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

test('risks — placeholder when none (한글)', () => {
  const { md } = renderRisks({ sources: {} }, formatUtils, { risks: [] });
  assert.match(md, /미해결 위험 없음/);
});

test('risks — 3 expanded + 더보기 collapse (MAX_EXPANDED=3)', () => {
  const risks = [];
  for (let i = 0; i < 12; i++) {
    risks.push({ risk: 'r' + i, likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'p' });
  }
  const { md } = renderRisks({ sources: {} }, formatUtils, { risks });
  // 12 items, 3 expanded → 9 collapsed
  assert.match(md, /\+9 더보기/);
});
