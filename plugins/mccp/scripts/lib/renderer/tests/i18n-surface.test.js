'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

function makeFullModel(now) {
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
      receipts: {
        count: 1,
        items: [{
          gate_id: 'mccp-plan-codex', decision_id: 'aaaa', converged: true,
          created_at: new Date(now - 60_000).toISOString(),
        }],
      },
      state: {
        item: {
          resume_state: 'idle',
          frontmatter: { task_fingerprint: 'v1-4-2-dashboard-overhaul' },
          body: { open_questions: ['next milestone?'] },
        },
      },
      backlog: { count: 1, items: [{ severity: 'HIGH', text: 'finding' }] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: {
        count: 1,
        items: [{
          ok: true, dispatch_id: 'eee1', worker_subagent_type: 'planner',
          is_terminal: false, stale: false,
          heartbeat_at: new Date(now - 10_000).toISOString(), receipts_added: 0,
        }],
      },
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
      return '# plan\n\n## Open Questions\n\n- q1\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| rr | High | High | mm |\n';
    },
  });
}

test('html — Korean section h3 panel labels present (redesign-3 panels)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.html, />타임라인<\/h3>/);
  assert.match(r.html, />위험<\/h3>/);
  assert.match(r.html, />워커<\/h3>/);
  assert.match(r.html, />질문<\/h3>/);
});

test('html — English section h2 labels absent (anti-pattern check)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.doesNotMatch(r.html, />Open Questions<\/h2>/);
  assert.doesNotMatch(r.html, />Risks<\/h2>/);
  assert.doesNotMatch(r.html, />Timeline<\/h2>/);
  assert.doesNotMatch(r.html, />Workers<\/h2>/);
  assert.doesNotMatch(r.html, />Status<\/h2>/);
});

test('html — sidebar switcher + "mccp" badge present (M1 console app-shell)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.html, /<div class="switcher">[\s\S]*?<span class="sw-name">/);
  assert.match(r.html, /<span class="sw-badge">mccp<\/span>/);
});

test('html — topbar freshness "갱신" present', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.html, /<span class="freshness">[\s\S]*?갱신/);
});

test('html — footer "v1.4.2 · …통합 derive" present', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.html, /<footer/);
  assert.match(r.html, /v1\.4\.2/);
  assert.match(r.html, /통합 derive/);
});

test('markdown — ## 대시보드 anchor preserved (M2 rename, F3 absorption)', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.md, /^## 대시보드$/m);
  assert.doesNotMatch(r.md, /^## 현황$/m, '구 명칭 잔존 0');
});

test('markdown — Korean h2 labels present', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.md, /^## 타임라인$/m);
  assert.match(r.md, /^## 위험$/m);
  assert.match(r.md, /^## 워커$/m);
  assert.match(r.md, /^## 질문$/m);
});

test('markdown — English h2 labels absent', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.doesNotMatch(r.md, /^## Open Questions$/m);
  assert.doesNotMatch(r.md, /^## Risks$/m);
  assert.doesNotMatch(r.md, /^## Timeline$/m);
  assert.doesNotMatch(r.md, /^## Workers$/m);
  assert.doesNotMatch(r.md, /^## Status$/m);
});

test('markdown — title "mccp 상태"', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.md, /^# mccp 상태/m);
});

test('markdown — footer with v1.18.18 version', () => {
  const r = renderWithStubs(makeFullModel(Date.now()));
  assert.match(r.md, /v1\.18\.18/);
});
