'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderStatusGrid } = require('../sections/status-grid');
const { renderWorkerFanout } = require('../sections/worker-fanout');
const { renderAuditTimeline } = require('../sections/audit-timeline');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');

test('status-grid — 5 cells + structured data + Korean labels (M5 Task 2)', () => {
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
    // M5 Task 2 — 미해결 위험 = plan body risks active(미마커). 2건 active.
    risks: [
      { risk: 'r-active-1', impact: 'High', likelihood: 'High', resolved: false, ordinal: 0 },
      { risk: 'r-active-2', impact: 'Low', likelihood: 'Low', resolved: false, ordinal: 1 },
      { risk: 'r-done', impact: 'High', likelihood: 'High', resolved: true, ordinal: 2 },
    ],
  };
  const { md, html, cells } = renderStatusGrid(model, formatUtils, planBody);
  // M5 Task 2 — 5 cells: 진행중/차단/이월 finding/미해결 위험/다음.
  assert.equal(cells.length, 5);
  assert.equal(cells[0].key, 'in-progress');
  assert.equal(cells[0].label, '진행 중');
  assert.equal(cells[1].key, 'blocked');
  assert.equal(cells[1].label, '차단');
  assert.equal(cells[2].key, 'deferred');
  assert.equal(cells[2].label, '이월 finding');
  assert.equal(cells[3].key, 'risks');
  assert.equal(cells[3].label, '위험');
  assert.equal(cells[4].key, 'next');
  assert.equal(cells[4].label, '다음');
  assert.match(md, /진행 중 3/);
  assert.match(md, /차단 2/);
  // M5 Task 2 — 이월 finding = backlog HIGH/CRIT(1) / 위험 = plan risks active(2).
  assert.match(md, /이월 finding 1/);
  assert.match(md, /위험 2/);
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
  // M5 Task 2 — '다음' 셀은 cells[4](in-progress/blocked/deferred/risks/next 순).
  assert.equal(cells[4].value, 'v1.4.2 · dashboard overhaul m1');
  assert.equal(cells[4].stale, false);
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
  // M5 Task 2 — '다음' 셀은 cells[4].
  assert.equal(cells[4].value, '미정 (stale)');
  assert.equal(cells[4].stale, true);
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
  assert.match(md, /발견된 위험이 없습니다\./);
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

test('risks — resolved 항목 메인 미노출 + 해결됨 탭 (M3-b headline)', () => {
  const planBody = {
    risks: [
      { risk: 'active-risk', likelihood: 'High', impact: 'High', mitigation: 'm', source: 'p', ordinal: 0, resolved: false },
      { risk: 'done-risk', likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'p', ordinal: 1, resolved: true },
    ],
  };
  const { md, html } = renderRisks({ sources: {} }, formatUtils, planBody);
  // M3-b — 탭(미해결 default · 해결됨 N). 큰 숫자는 탭 label 뱃지에만(메인 흐름 비노출).
  assert.match(html, /class="tabs"/);
  assert.match(html, /미해결 <span class="tab-count">1<\/span>/);
  assert.match(html, /해결됨 <span class="tab-count">1<\/span>/);
  // active 는 미해결 패널(앞), resolved 는 해결됨 패널(뒤).
  const resolvedPanelIdx = html.indexOf('tab-risks-resolved-panel');
  assert.ok(resolvedPanelIdx > 0, '해결됨 패널 존재');
  assert.ok(html.indexOf('active-risk') < resolvedPanelIdx, 'active 위험은 미해결 패널');
  assert.ok(html.indexOf('done-risk') > resolvedPanelIdx, 'resolved 위험은 해결됨 패널');
  // md plain-text 동등 — 미해결 본문 + 해결됨 N건 접힘.
  assert.match(md, /해결됨 1건/);
  const mainMd = md.slice(0, md.indexOf('해결됨'));
  assert.ok(mainMd.includes('active-risk'), 'active 위험은 md 본문');
  assert.ok(!mainMd.includes('done-risk'), 'resolved 위험은 md 본문 미노출');
});

test('risks — 전부 resolved 면 empty-state + 해결됨 탭', () => {
  const planBody = {
    risks: [{ risk: 'done', likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'p', ordinal: 0, resolved: true }],
  };
  const { md, html } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.match(md, /발견된 위험이 없습니다\./);
  assert.match(md, /해결됨 1건/);
  // active 0 + resolved>0 → 탭 + 미해결 패널 empty-state.
  assert.match(html, /class="tabs"/);
  assert.match(html, /발견된 위험이 없습니다\./);
});

test('risks — 마커 rendered surface 누출 0 (Constraint 3)', () => {
  const planBody = {
    risks: [{ risk: 'leak-risk <!--mccp:resolved reason="x"-->', likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'p', ordinal: 0, resolved: true }],
  };
  const { md, html } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.equal(/mccp:resolved/.test(html), false, 'html 마커 누출 0');
  assert.equal(/mccp:resolved/.test(md), false, 'md 마커 누출 0');
});

test('risks — sourceClosed 미마커 위험 active 제외 + 보관됨 탭 (M8 negative, 3-버킷)', () => {
  const planBody = {
    risks: [
      { risk: 'live-risk', likelihood: 'High', impact: 'High', mitigation: 'm', source: 'p', ordinal: 0, resolved: false, sourceClosed: false },
      { risk: 'mitigated-risk', likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'p', ordinal: 1, resolved: true, sourceClosed: false },
      { risk: 'historical-risk', likelihood: 'High', impact: 'Medium', mitigation: 'm', source: 'shipped.plan.md', ordinal: 0, resolved: false, sourceClosed: true },
    ],
  };
  const { md, html, activeCount } = renderRisks({ sources: {} }, formatUtils, planBody);
  // negative invariant — 완료 plan 출처 미마커 위험이 active 에서 제외(보관됨으로).
  assert.equal(activeCount, 1, 'active = 미해결만(live-risk)');
  // 3-탭(미해결 1 · 해결됨 1 · 보관됨 1) — 큰 숫자는 label 뱃지에만(Constraint 2).
  assert.match(html, /미해결 <span class="tab-count">1<\/span>/);
  assert.match(html, /해결됨 <span class="tab-count">1<\/span>/);
  assert.match(html, /보관됨 <span class="tab-count">1<\/span>/);
  // 보관됨 패널에 historical-risk 적재, 미해결 패널보다 뒤.
  const histPanelIdx = html.indexOf('tab-risks-historical-panel');
  assert.ok(histPanelIdx > 0, '보관됨 패널 존재');
  assert.ok(html.indexOf('historical-risk') > histPanelIdx, 'historical 위험은 보관됨 패널');
  // md 본문(미해결)에 historical 미노출 — 접힘 secondary 로만.
  const mainMd = md.slice(0, md.indexOf('해결됨'));
  assert.ok(mainMd.includes('live-risk'), 'live 위험은 md 본문');
  assert.ok(!mainMd.includes('historical-risk'), 'historical 위험은 md 본문 미노출');
  assert.match(md, /보관됨 1건/);
});

test('risks — 보관됨 탭은 해결됨 부재에도 additive (M8 historical-only)', () => {
  const planBody = {
    risks: [
      { risk: 'live-only', likelihood: 'High', impact: 'High', mitigation: 'm', source: 'p', ordinal: 0, resolved: false, sourceClosed: false },
      { risk: 'hist-only', likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'shipped.plan.md', ordinal: 0, resolved: false, sourceClosed: true },
    ],
  };
  const { html } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.match(html, /class="tabs"/);
  assert.match(html, /보관됨 <span class="tab-count">1<\/span>/);
  assert.equal(/해결됨 <span class="tab-count">/.test(html), false, '해결됨 탭 부재(resolved 0)');
});

test('open-questions — resolved plan-OQ 분할, STATE.md OQ 항상 active (M3)', () => {
  const model = { sources: { state: { item: { body: { open_questions: ['state-q'] } } } } };
  const planBody = {
    openQuestions: [
      { source: 'p.plan.md', text: 'plan-active-q', lineNumber: 10, resolved: false },
      { source: 'p.plan.md', text: 'plan-done-q', lineNumber: 11, resolved: true },
    ],
  };
  const { md, html } = renderOpenQuestions(model, formatUtils, planBody);
  // M3-b — 탭(미해결 default · 해결됨 N). active = state-q + plan-active-q(2), resolved = 1.
  assert.match(html, /class="tabs"/);
  assert.match(html, /해결됨 <span class="tab-count">1<\/span>/);
  const resolvedPanelIdx = html.indexOf('tab-questions-resolved-panel');
  assert.ok(resolvedPanelIdx > 0, '해결됨 패널 존재');
  const activePanel = html.slice(0, resolvedPanelIdx);
  assert.ok(activePanel.includes('state-q'), 'STATE.md OQ 는 항상 active');
  assert.ok(activePanel.includes('plan-active-q'), 'active plan-OQ 는 미해결 패널');
  assert.ok(!activePanel.includes('plan-done-q'), 'resolved plan-OQ 는 미해결 패널 미노출');
  // md plain-text 동등.
  assert.match(md, /해결됨 1건/);
  assert.ok(html.indexOf('plan-done-q') > resolvedPanelIdx, 'resolved OQ 는 해결됨 패널');
});
