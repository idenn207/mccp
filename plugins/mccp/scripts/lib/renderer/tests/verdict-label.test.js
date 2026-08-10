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

test('verdict-label metric (F2 — audit-timeline 7-day boundary) — 주입 clock 이 timeline 필터를 지배한다', () => {
  // F1 회귀 방지: renderer/index.js:131 이 undefined → opts.now 로 수정되면,
  // renderAuditTimeline 이 injected clock 을 받아 7일 필터를 실제로 지배한다.
  // 테스트는 같은 model 을 두 개의 서로 다른 clock 값으로 render 해서,
  // 두 output 이 다른지(시간 기준의 receipt 필터링이 차이나는지) 확인한다.
  // 깨진 구현은 opts.now 를 무시하고 Date.now() 를 쓰므로,
  // 이 테스트 두 경우가 같은 (또는 거의 같은) 출력을 낼 것이다.

  const model = metricModel();

  // Case 1: Render at NOW (=Date.UTC(2026, 6, 1)) — 3개 receipt 모두 7일 창 내
  const r1 = renderStatus(model, { cwd: '/test', now: NOW });
  const html1 = r1.html;

  // Case 2: Render at NOW + 8 days — 3개 receipt 모두 7일 창 밖
  // 이때 renderAuditTimeline 이 올바른 now 를 받으면 drawer-data 에서
  // receipt 행이 사라질 것이고, 깨진 구현은 여전히 receipt 를 포함할 것이다.
  const tEightDaysLater = NOW + (8 * 24 * 60 * 60 * 1000);
  const r2 = renderStatus(model, { cwd: '/test', now: tEightDaysLater });
  const html2 = r2.html;

  // 두 렌더링 HTML 이 다른지 확인. clock 주입이 작동하면 drawer-data 구조가 달라진다.
  // (r1 은 receipt: 키 3개, r2 는 receipt: 키 0개 또는 다른 개수)
  assert.notEqual(html1, html2,
    '주입 clock 이 audit-timeline 을 지배한다: 시간이 8일 뒤로 이동하면 렌더링이 달라진다');

  // 핵심 단언 — Implement-Codex R1 IF1 흡수. 이전 판은 아래 개수 비교를
  // `if (m1 && m2)` 안에 두어, drawer-data 가 사라지거나 이름이 바뀌면 강한 단언이
  // 조용히 건너뛰어지고 위의 notEqual 만으로 통과했다. notEqual 은 audit-timeline 과
  // 무관한 clock-민감 출력(다른 섹션의 상대시각 문자열 등) 때문에도 참이 될 수 있으므로,
  // 그 조합은 "7일 receipt 필터링" 계약을 증명하지 못한 채 green 을 낼 수 있었다.
  // 이제 존재 자체를 단언하고 개수는 무조건 검사한다.
  const m1 = html1.match(/id="drawer-data">([\s\S]*?)<\/script>/);
  const m2 = html2.match(/id="drawer-data">([\s\S]*?)<\/script>/);
  assert.ok(m1, 'NOW 렌더에 #drawer-data 존재');
  assert.ok(m2, 'NOW+8d 렌더에 #drawer-data 존재');
  const unesc = (s) => s.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&');
  const j1 = JSON.parse(unesc(m1[1]));
  const j2 = JSON.parse(unesc(m2[1]));
  const countReceipts = (j) => Object.keys(j).filter((k) => k.startsWith('receipt:')).length;
  const k1 = countReceipts(j1);
  const k2 = countReceipts(j2);
  // 정확한 기대값 — metricModel() 의 receipt 3건은 모두 NOW-1h/2h/3h 이므로
  // NOW 기준으로는 전부 7일 창 안, NOW+8d 기준으로는 전부 밖이다.
  assert.equal(k1, 3, '7d 창 내(NOW): receipt 3건이어야 함, 실제 ' + k1);
  assert.equal(k2, 0, '7d 창 밖(NOW+8d): receipt 0건이어야 함, 실제 ' + k2);
});

// ------------------------------- santa-loop round 5: invalid metrics reach the banner
//
// Five layers of this loop were the same defect: a signal is raised, and the
// next consumer flattens it. The chain ended at the headline verdict, which read
// `sources` and `warnings` but never `metrics` — so a compute-time integrity
// violation (A1's unit-spike / timestamp-inversion checks are the standing
// example) rendered "✕ 무효" in the section while the banner above it said
// nothing was wrong.

const { computeVerdict } = require('../verdict');

test('verdict: an invalid metric reaches the banner even when its source is healthy', () => {
  const v = computeVerdict({
    sources: { toggle_usage: { ok: true, degraded: false } },
    metrics: { B3: { id: 'B3', status: 'invalid', invalid_reason: 'exclusion table drift' } },
    warnings: [],
  }, {}, {});

  assert.strictEqual(v.tone, 'amber', 'an integrity violation must not read as "nothing in flight"');
  assert.match(v.text, /B3/);
  assert.match(v.text, /drift/);
});

test('verdict: forward-only and computed metrics do not trip the banner', () => {
  const forwardOnly = computeVerdict({
    sources: {}, metrics: { B3: { id: 'B3', status: 'forward-only' } }, warnings: [],
  }, {}, {});
  assert.notStrictEqual(forwardOnly.tone, 'amber',
    'not-yet-measured is not a failure and must stay quiet');

  const healthy = computeVerdict({
    sources: { toggle_usage: { ok: true, degraded: false } },
    metrics: { B3: { id: 'B3', status: 'computed' } }, warnings: [],
  }, {}, {});
  assert.notStrictEqual(healthy.tone, 'amber');
});

test('verdict: a degraded source still wins over the generic metric message', () => {
  const v = computeVerdict({
    sources: { toggle_usage: { ok: true, degraded: true } },
    metrics: { B3: { id: 'B3', status: 'invalid' } },
    warnings: [],
  }, {}, {});
  assert.match(v.text, /toggle_usage/, 'the more specific source-level diagnosis is preferred');
});

test('verdict: a stale metric reaches the banner with its remedy', () => {
  const v = computeVerdict({
    sources: {},
    metrics: {
      A3: { id: 'A3', status: 'insufficient', stale: true, stale_reason: 're-run --emit-after' },
    },
    warnings: [],
  }, {}, {});
  assert.strictEqual(v.tone, 'amber');
  assert.match(v.text, /A3/);
  assert.match(v.text, /emit-after/, 'the banner must carry the action, not just the fact');
});
