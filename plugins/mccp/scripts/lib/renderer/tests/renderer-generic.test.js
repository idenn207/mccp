'use strict';

// v1.3.0-m6 — Renderer generic-interface smoke. Verifies renderStatus()
// degrades gracefully on Fixture A/B/C/D shapes:
//   A — empty (no .claude/) → verdict graceful default, all sections render
//   B — state-only → STATE surfaces, all sections render
//   C — non-mccp gate_id → audit-timeline shows raw gate label
//   D — degraded → degraded sources amber verdict, no throw

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

function baseModel(overrides) {
  const m = {
    derived_at: '2026-06-19T00:00:00.000Z',
    repo_root: '<repo>',
    masked: true,
    m0_capability: { contract_present: true, evidence: '' },
    sources: {
      plans:     { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      receipts:  { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      state:     { ok: true, item: null, degraded: false, error: null },
      backlog:   { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      fix_task:  { ok: true, item: null, degraded: false, error: null },
      pr:        { ok: true, item: null, degraded: false, error: null },
      envelopes: { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
    },
    correlations: [],
    warnings: [],
  };
  return Object.assign(m, overrides || {});
}

function assertSixSectionInvariant(r) {
  // Renderer markdown invariant: Verdict + 현황 + 타임라인 + 위험 always
  // appear; 워커/미해결 질문 appear only when applicable. We assert
  // the always-present four plus the single # title.
  // v1.4.2-m1: title + section headings i18n to Korean.
  assert.match(r.md, /^# mccp 상태/m, 'title line present');
  assert.match(r.md, /## Verdict/, 'Verdict section');
  assert.match(r.md, /## 현황/, '현황 section');
  assert.match(r.md, /## 타임라인/, '타임라인 section');
  assert.match(r.md, /## 위험/, '위험 section');
  assert.equal(typeof r.verdict, 'object', 'verdict object returned');
  assert.equal(typeof r.verdict.text, 'string', 'verdict text string');
}

test('renderer-generic A: empty model renders graceful verdict + all 4 always-on sections', () => {
  const m = baseModel();
  const r = renderStatus(m, { snapshotsDir: null });

  assertSixSectionInvariant(r);
  assert.equal(r.verdict.tone, 'muted', 'no in-flight signal → muted');
  assert.match(r.verdict.text, /no in-flight signal/);
  // 워커 section hides when envelope count=0 and no controller
  assert.doesNotMatch(r.md, /## 워커/);
});

test('renderer-generic B: state-only model surfaces idle verdict + state-driven status grid', () => {
  const m = baseModel({
    sources: Object.assign(baseModel().sources, {
      state: {
        ok: true,
        item: {
          frontmatter: { state_version: 1, controller_session_id: null, active_dispatch_count: 0 },
          body: {},
          resume_state: 'idle',
          controller_active: false,
          escalate_pending: false,
        },
        degraded: false,
        error: null,
      },
    }),
  });
  const r = renderStatus(m, { snapshotsDir: null });

  assertSixSectionInvariant(r);
  assert.doesNotMatch(r.md, /## 워커/, 'no 워커 section without controller');
  // No receipts → timeline shows "최근 7일 활동 없음"
  assert.match(r.md, /최근 7일 활동 없음/);
});

test('renderer-generic C: non-mccp gate_id surfaces raw label in audit-timeline', () => {
  const now = Date.now();
  const m = baseModel();
  m.sources.receipts = {
    ok: true,
    count: 2,
    items: [
      {
        gate_id: 'foo-gate',
        decision_id: 'decision-1',
        converged: true,
        created_at: new Date(now - 60_000).toISOString(),
      },
      {
        gate_id: 'bar-gate',
        decision_id: 'decision-2',
        converged: true,
        created_at: new Date(now - 120_000).toISOString(),
      },
    ],
    invalid_count: 0, degraded: false, error: null,
  };

  const r = renderStatus(m, { snapshotsDir: null });
  assertSixSectionInvariant(r);
  // Audit-timeline must surface raw gate_id, not 'unknown-gate' fallback
  assert.match(r.md, /foo-gate/, 'raw gate_id label foo-gate');
  assert.match(r.md, /bar-gate/, 'raw gate_id label bar-gate');
});

test('renderer-generic D: degraded sources → amber verdict + no throw', () => {
  const m = baseModel();
  m.sources.receipts.degraded = true;
  m.sources.receipts.invalid_count = 1;
  m.sources.envelopes.degraded = true;
  m.sources.envelopes.invalid_count = 1;
  m.warnings = [
    { source: 'receipts', severity: 'medium', message: 'source receipts degraded: invalid_count=1' },
    { source: 'envelopes', severity: 'medium', message: 'source envelopes degraded: invalid_count=1' },
  ];

  let r;
  assert.doesNotThrow(() => { r = renderStatus(m, { snapshotsDir: null }); });
  assertSixSectionInvariant(r);
  assert.equal(r.verdict.tone, 'amber',
    'degraded sources → amber tone');
  assert.match(r.verdict.text, /소스 손상/);
});
