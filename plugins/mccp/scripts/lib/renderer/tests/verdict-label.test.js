'use strict';

// Dashboard Readability M3 — 판정 어휘 SSoT + metric gate.
// (a) 단위: VERDICT.PASS/IN_PROGRESS/HOLD 값.
// (b) 빌더 verdict 필드: buildReceiptDetail/buildWorktreeDetail 가 새 어휘를
//     드로어 detail(title/tags/판정 행·게이트 행)에 싣는지 직접 단언(false-negative
//     차단 — 렌더 경로가 우회해도 빌더가 참).
// (c) metric: 통제 model 로 renderStatus 호출 — 세 판정 상태(converged 통과·
//     first-round 진행 중·round≥2 divergent 보류) receipt + worktree(gate_converged
//     true/false) fixture 는 `수렴`/`미수렴`/`divergent` 를 데이터에 심지 않는다.
//     r.md 에 구 어휘 0 + 신 어휘 present.
// (d) F1 — r.html grep-0 시 `<style>`/실행 `<script>`만 strip 하고 사용자-클릭
//     드로어 데이터(`<script type="application/json" id="drawer-data">`)는 보존.
//     추가로 #drawer-data JSON 을 파싱해 receipt/worktree verdict 필드가 새 어휘로
//     나오는지 직접 단언(blanket-strip false-negative 차단).

const test = require('node:test');
const assert = require('node:assert/strict');
const { VERDICT } = require('../parsers/verdict-label');
const { buildReceiptDetail, buildWorktreeDetail } = require('../parsers/drawer-detail');
const formatUtils = require('../format-utils');
const { renderStatus } = require('../index');

const OLD = /수렴|미수렴|divergent/;
const OLD_G = /수렴|미수렴|divergent/g;

// ── (a) 단위 ──────────────────────────────────────────────────────────────────

test('verdict-label — VERDICT 값(통과/진행 중/보류)', () => {
  assert.equal(VERDICT.PASS, '통과');
  assert.equal(VERDICT.IN_PROGRESS, '진행 중');
  assert.equal(VERDICT.HOLD, '보류');
  // frozen — 재할당 무시(SSoT 불변).
  assert.ok(Object.isFrozen(VERDICT));
});

// ── (b) 빌더 verdict 필드(직접 단언) ──────────────────────────────────────────

test('verdict-label — buildReceiptDetail conv 기본값이 새 어휘(통과/보류)', () => {
  // convLabel 미지정 → isBad 로 기본 conv 파생. 구 어휘(수렴/divergent) 금지.
  const ok = buildReceiptDetail({ gate: 'mccp-plan-codex', decision: 'realtime', isBad: false, round: 1 }, formatUtils);
  const bad = buildReceiptDetail({ gate: 'mccp-pr-codex', decision: 'auth', isBad: true, round: 2 }, formatUtils);
  assert.equal(ok.rows.find((r) => r[0] === '판정')[1], VERDICT.PASS);
  assert.equal(ok.tags[0].label, VERDICT.PASS);
  assert.doesNotMatch(ok.title, OLD);
  assert.equal(bad.rows.find((r) => r[0] === '판정')[1], VERDICT.HOLD);
  assert.equal(bad.tags[0].label, VERDICT.HOLD);
  assert.doesNotMatch(bad.title, OLD);
});

test('verdict-label — buildWorktreeDetail 게이트 행 gate_converged→(통과)/(보류)', () => {
  const converged = buildWorktreeDetail(
    { path: '/repo/a', branch: 'main', current_gate: 'mccp-implement-codex', gate_converged: true },
    formatUtils, { statusLabel: '진행', statusTone: 'med', activity: '5분 전' });
  const held = buildWorktreeDetail(
    { path: '/repo/b', branch: 'feat', current_gate: 'mccp-plan-codex', gate_converged: false },
    formatUtils, { statusLabel: '진행', statusTone: 'med', activity: '5분 전' });
  assert.ok(converged.rows.find((r) => r[0] === '게이트')[1].includes('(' + VERDICT.PASS + ')'));
  assert.ok(held.rows.find((r) => r[0] === '게이트')[1].includes('(' + VERDICT.HOLD + ')'));
  assert.doesNotMatch(converged.rows.find((r) => r[0] === '게이트')[1], OLD);
  assert.doesNotMatch(held.rows.find((r) => r[0] === '게이트')[1], OLD);
});

// ── (c)/(d) metric via renderStatus ──────────────────────────────────────────

const NOW = Date.UTC(2026, 6, 1);
function iso(ms) { return new Date(ms).toISOString(); }

// 통제 model — 세 판정 상태 receipt + 두 gate 상태 worktree. fixture 데이터
// (decision_id/branch/milestone_hint/plan body)에 구 어휘를 심지 않는다.
function metricModel() {
  return {
    derived_at: iso(NOW), masked: true, m0_capability: { contract_present: true }, warnings: [],
    sources: {
      plans: { count: 1, items: [{ path: 'realtime-m1.plan.md', source_prd: 'prd.md' }] },
      receipts: {
        count: 3,
        items: [
          { gate_id: 'mccp-plan-codex', decision_id: 'realtime', converged: true, round: 1, created_at: iso(NOW - 3600_000) },
          { gate_id: 'mccp-implement-codex', decision_id: 'billing', converged: false, round: 1, created_at: iso(NOW - 7200_000) },
          { gate_id: 'mccp-pr-codex', decision_id: 'auth', converged: false, round: 2, created_at: iso(NOW - 10800_000) },
        ],
      },
      state: { item: { resume_state: 'idle', frontmatter: { task_fingerprint: 'realtime' }, body: { open_questions: ['next?'] } } },
      backlog: { count: 1, items: [{ severity: 'HIGH', text: 'finding' }] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
      worktrees: {
        scanned: true, count: 2,
        items: [
          { path: '/repo/main', is_self: true, branch: 'main', head: 'abcdef1234567', current_gate: 'mccp-plan-codex', gate_converged: false, receipts: 2, last_activity: iso(NOW - 600_000), active: true, milestone_hint: 'M1 build' },
          { path: '/repo/wt-b', is_self: false, branch: 'feat-b', head: '1234567abcdef', current_gate: 'mccp-implement-codex', gate_converged: true, receipts: 4, last_activity: iso(NOW - 1200_000), active: true, milestone_hint: 'M2 ship' },
        ],
      },
    },
    correlations: [],
  };
}

function renderMetric() {
  return renderStatus(metricModel(), {
    cwd: '/test', now: NOW,
    fsRead: (p) => {
      if (p.endsWith('prd.md')) {
        return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 1 | a | x | in-progress | [realtime-m1.plan.md](realtime-m1.plan.md) |\n';
      }
      return '# plan\n\n## Summary\n\nclean summary\n\n## Open Questions\n\n- q1\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| rr | High | High | mm |\n';
    },
  });
}

test('verdict-label metric — r.md 구 어휘 0 (수렴/미수렴/divergent)', () => {
  const r = renderMetric();
  // md 에는 CSS/JS 없음 — 순수 사용자 라벨 경로.
  assert.equal((r.md.match(OLD_G) || []).length, 0, 'r.md 잔여 구 어휘: ' + (r.md.match(OLD_G) || []).join(','));
});

test('verdict-label metric — r.md 신 어휘 present (통과/진행 중/보류)', () => {
  const r = renderMetric();
  assert.ok(r.md.includes(VERDICT.PASS), '통과 present');
  assert.ok(r.md.includes(VERDICT.IN_PROGRESS), '진행 중 present');
  assert.ok(r.md.includes(VERDICT.HOLD), '보류 present');
});

test('verdict-label metric (F1) — r.html style/실행script strip 후 구 어휘 0, #drawer-data 보존', () => {
  const r = renderMetric();
  // <style>/실행 <script> 만 strip — 드로어 데이터(type="application/json")는 보존.
  const stripped = r.html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script(?![^>]*application\/json)[^>]*>[\s\S]*?<\/script>/g, '');
  assert.match(stripped, /id="drawer-data"/, 'drawer-data JSON 은 strip 되지 않고 grep-0 대상에 포함');
  assert.equal((stripped.match(OLD_G) || []).length, 0,
    'strip 후 잔여 구 어휘(드로어 JSON 포함): ' + (stripped.match(OLD_G) || []).join(','));
});

test('verdict-label metric (F1) — #drawer-data 파싱: receipt/worktree verdict 필드 새 어휘', () => {
  const r = renderMetric();
  const m = r.html.match(/id="drawer-data">([\s\S]*?)<\/script>/);
  assert.ok(m, '#drawer-data 존재');
  const j = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'));
  const keys = Object.keys(j);
  const receiptKeys = keys.filter((k) => k.startsWith('receipt:'));
  const wtKeys = keys.filter((k) => k.startsWith('wt:'));
  assert.equal(receiptKeys.length, 3, 'receipt detail 3건');
  assert.equal(wtKeys.length, 2, 'worktree detail 2건');

  // receipt verdict 필드(판정 행 + tags) 는 새 어휘만.
  const verdicts = receiptKeys.map((k) => (j[k].rows || []).find((r2) => r2[0] === '판정')[1]);
  assert.ok(verdicts.includes(VERDICT.PASS + ' R1'), '통과 R1 판정 present: ' + verdicts.join('|'));
  assert.ok(verdicts.includes(VERDICT.IN_PROGRESS + ' R1'), '진행 중 R1 판정 present');
  assert.ok(verdicts.includes(VERDICT.HOLD), '보류 판정 present');

  // worktree 게이트 행 은 (통과)/(보류).
  const gates = wtKeys.map((k) => (j[k].rows || []).find((r2) => r2[0] === '게이트')[1]);
  assert.ok(gates.some((g) => g.includes('(' + VERDICT.PASS + ')')), '(통과) worktree 게이트 present');
  assert.ok(gates.some((g) => g.includes('(' + VERDICT.HOLD + ')')), '(보류) worktree 게이트 present');

  // 전체 드로어 JSON 에 구 어휘 0 (blanket-strip false-negative 차단).
  assert.equal((JSON.stringify(j).match(OLD_G) || []).length, 0, '드로어 JSON 잔여 구 어휘 0');
});
