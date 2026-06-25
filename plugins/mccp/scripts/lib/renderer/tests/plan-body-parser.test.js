'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parsePlanBody,
  parseDeliveryMilestones,
  parseDeliveryMilestonesLifecycle,
  parseOpenQuestions,
  parseRisks,
  extractRisksAndOpenQuestions,
} = require('../parsers/plan-body');
const { planAwareMarkdownHash } = require('../../../receipt/hash');

const PRD_OK = `# Test PRD

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 0 | A | x | complete | [a.plan.md](../PRPs/plans/completed/a.plan.md) |
| 1 | B | y | in-progress | [b.plan.md](../plans/b.plan.md) |
| 2 | C | z | pending | — |

## Other
`;

const PLAN_BODY_FULL = `# Plan B

## Open Questions

- [ ] q1: foo?
- [x] q2: bar resolved
- q3: bare bullet without checkbox

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| r1 | High | Medium | m1 |
| r2 | Low | Low | m2 |

## Other
`;

const PLAN_BODY_3COL_RISKS = `# Plan
## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| r1 | High | m1 |
`;

const PLAN_BODY_MALFORMED = `# Plan
## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| r1 | High | Medium | m1 |
| only-two-cells | bad |
`;

test('parseDeliveryMilestones — PRD frontmatter table mapped to plan basenames', () => {
  const m = parseDeliveryMilestones(PRD_OK);
  assert.equal(m.get('a.plan.md'), 'complete');
  assert.equal(m.get('b.plan.md'), 'in-progress');
  assert.equal(m.size, 2);
});

test('parseDeliveryMilestones — empty Map when table missing', () => {
  const m = parseDeliveryMilestones('# PRD\n\nNo milestones table.\n');
  assert.equal(m.size, 0);
});

test('parseDeliveryMilestones — escaped pipe in cell does not shift columns (M8 follow-up)', () => {
  // Outcome 셀의 `\|` 가 Status/Plan 컬럼을 밀면 행이 조용히 드롭돼 완료 plan
  // lifecycle 이 미검출된다(위험 오집계 근본 원인). escaped pipe 정상 처리 회귀.
  const prd = '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
    + '| 3 | x | Status 열 확장(pending\\|in-progress\\|complete\\|dropped) 설명 | complete | [m3.plan.md](../plans/m3.plan.md) |\n'
    + '| 4 | y | plain outcome | in-progress | [m4.plan.md](../plans/m4.plan.md) |\n';
  const m = parseDeliveryMilestones(prd);
  assert.equal(m.get('m3.plan.md'), 'complete', 'escaped-pipe 행도 정상 파싱');
  assert.equal(m.get('m4.plan.md'), 'in-progress');
});

test('extractRisksAndOpenQuestions — Risk 열 + OQ 텍스트 배열 스냅샷 (M1 Task 3)', () => {
  const snap = extractRisksAndOpenQuestions(PLAN_BODY_FULL);
  assert.deepEqual(snap.risks, ['r1', 'r2']);
  assert.deepEqual(snap.openQuestions, [
    'q1: foo?',
    'q2: bar resolved',
    'q3: bare bullet without checkbox',
  ]);
});

test('extractRisksAndOpenQuestions — fail-open on null/non-string → 빈 배열', () => {
  assert.deepEqual(extractRisksAndOpenQuestions(null), { risks: [], openQuestions: [] });
  assert.deepEqual(extractRisksAndOpenQuestions(42), { risks: [], openQuestions: [] });
  assert.deepEqual(extractRisksAndOpenQuestions(''), { risks: [], openQuestions: [] });
});

test('extractRisksAndOpenQuestions — 섹션 부재 시 해당 배열만 비고 다른 쪽은 보존', () => {
  const onlyRisks = '# P\n## Risks\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| solo | Low | Low | mit |\n';
  const snap = extractRisksAndOpenQuestions(onlyRisks);
  assert.deepEqual(snap.risks, ['solo']);
  assert.deepEqual(snap.openQuestions, []);
});

test('parseOpenQuestions — checkbox + bare bullets, metadata 객체', () => {
  const qs = parseOpenQuestions(PLAN_BODY_FULL);
  assert.equal(qs.length, 3);
  assert.equal(qs[0].text, 'q1: foo?');
  assert.equal(qs[1].text, 'q2: bar resolved');
  assert.equal(qs[2].text, 'q3: bare bullet without checkbox');
  // M2 metadata sibling fields
  for (const q of qs) {
    assert.ok(q.lineNumber > 0);
    assert.ok(Array.isArray(q.headingPath));
    assert.ok(q.headingPath[0].includes('Open Questions'));
  }
});

test('parseRisks — 4-col table (+resolved=false default)', () => {
  const { rows } = parseRisks(PLAN_BODY_FULL);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].risk, 'r1');
  assert.equal(rows[0].likelihood, 'High');
  assert.equal(rows[0].impact, 'Medium');
  assert.equal(rows[0].mitigation, 'm1');
  assert.equal(rows[0].resolved, false);
});

test('parseRisks — 3-col fallback', () => {
  const { rows } = parseRisks(PLAN_BODY_3COL_RISKS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].impact, '');
  assert.equal(rows[0].mitigation, 'm1');
});

test('parseRisks — malformed row skipped + counted', () => {
  const { rows, malformedCount } = parseRisks(PLAN_BODY_MALFORMED);
  assert.equal(rows.length, 1);
  assert.equal(malformedCount, 1);
});

test('parsePlanBody — facade integration with fsRead + object source_prd', () => {
  const path = require('path');
  const cwd = '/test/cwd';
  const fsRead = (p) => {
    if (p === path.resolve(cwd, 'prd.md')) return PRD_OK;
    if (p === path.resolve(cwd, 'b.plan.md')) return PLAN_BODY_FULL;
    throw new Error('ENOENT ' + p);
  };
  const model = {
    sources: {
      plans: {
        items: [
          { path: 'b.plan.md', source_prd: { label: 'prd.md', path: 'prd.md' } },
        ],
      },
    },
  };
  const result = parsePlanBody(model, { fsRead, cwd });
  assert.equal(result.planStatuses.get('a.plan.md'), 'complete');
  assert.equal(result.planStatuses.get('b.plan.md'), 'in-progress');
  assert.equal(result.openQuestions.length, 3);
  assert.equal(result.risks.length, 2);
  assert.equal(result.degraded, false);
  assert.equal(result.warnings.length, 0);
});

test('parsePlanBody — degraded flag when PRD read fails', () => {
  const path = require('path');
  const cwd = '/test/cwd';
  const fsRead = (p) => {
    if (p === path.resolve(cwd, 'plan.md')) return '# plan';
    throw new Error('ENOENT ' + p);
  };
  const model = {
    sources: {
      plans: {
        items: [{ path: 'plan.md', source_prd: 'missing-prd.md' }],
      },
    },
  };
  const result = parsePlanBody(model, { fsRead, cwd });
  assert.equal(result.degraded, true);
  assert.ok(result.warnings.some(w => /PRD read failed/.test(w.message)));
});

// ── M3: 해결 마커 + dropped + lifecycle ──────────────────────────────────────

const PLAN_BODY_MARKERS = `# Plan M3

## Open Questions

- [ ] live-q: 아직 미해결
- [x] bare-checked-q: 체크만 됨 (마커 없음)
- resolved-q: 명시 해결됨 <!--mccp:resolved reason="구조 소멸" at="2026-06-25T00:00:00Z"-->

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| live-risk | High | Medium | m-live |
| resolved-risk | Low | Low | m-done |<!--mccp:resolved reason="완화 구현 | with pipe" at="2026-06-25T01:00:00Z"-->

## Other
`;

const PRD_LIFECYCLE = `# PRD

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Done one | o1 | complete | [a.plan.md](../plans/a.plan.md) |
| 2 | Active one | o2 | in-progress | [b.plan.md](../plans/b.plan.md) |
| 3 | Future one | o3 | pending | — |
| 4 | Killed one | o4 | dropped | — |

## Other
`;

test('parseOpenQuestions — resolved 신호는 마커만 (Codex F1)', () => {
  const qs = parseOpenQuestions(PLAN_BODY_MARKERS);
  assert.equal(qs.length, 3);
  const live = qs.find(q => /live-q/.test(q.text));
  const bare = qs.find(q => /bare-checked-q/.test(q.text));
  const resolved = qs.find(q => /resolved-q/.test(q.text));
  assert.equal(live.resolved, false);
  // bare [x] 는 resolved 아님 — 마커 없으면 active 유지 (F1).
  assert.equal(bare.resolved, false);
  assert.equal(resolved.resolved, true);
  // 마커가 텍스트에 누출되지 않음 (Constraint 3).
  assert.equal(/mccp:resolved/.test(resolved.text), false);
  assert.equal(resolved.text, 'resolved-q: 명시 해결됨');
});

test('parseRisks — 행끝 마커가 셀 깨지 않음 + resolved flag (Codex F2)', () => {
  const { rows } = parseRisks(PLAN_BODY_MARKERS);
  assert.equal(rows.length, 2);
  const live = rows.find(r => r.risk === 'live-risk');
  const done = rows.find(r => r.risk === 'resolved-risk');
  assert.equal(live.resolved, false);
  assert.equal(done.resolved, true);
  // 행끝 마커 strip 으로 mitigation 셀이 정상(4 셀 유지, phantom 셀 0).
  assert.equal(done.mitigation, 'm-done');
  assert.equal(done.impact, 'Low');
  // 마커 텍스트 누출 0.
  assert.equal(/mccp:resolved/.test(done.mitigation), false);
  // read 측은 verbatim 추출 — 마커 내부 unescaped `|` 도 마커 strip 시 함께 제거되어
  // 셀을 깨지 않는다(write 측 escapeMarkerReason 이 `|`→`/` 변환은 별도 단위 테스트).
  assert.equal(done.resolvedMeta.reason, '완화 구현 | with pipe');
});

test('parseDeliveryMilestones — dropped status now valid (VALID_STATUSES additive)', () => {
  const m = parseDeliveryMilestones(PRD_LIFECYCLE.replace('| — |', '| [d.plan.md](../plans/d.plan.md) |'));
  // dropped row 에 link 가 있으면 status map 에 포함(VALID_STATUSES 에 dropped 추가).
  assert.equal(m.get('a.plan.md'), 'complete');
  assert.equal(m.get('b.plan.md'), 'in-progress');
});

test('parseDeliveryMilestonesLifecycle — pending/dropped only, link 무요구', () => {
  const rows = parseDeliveryMilestonesLifecycle(PRD_LIFECYCLE);
  assert.equal(rows.length, 2);
  const pending = rows.find(r => r.status === 'pending');
  const dropped = rows.find(r => r.status === 'dropped');
  assert.equal(pending.name, 'Future one');
  assert.equal(pending.outcome, 'o3');
  assert.equal(pending.planPath, null);
  assert.equal(dropped.name, 'Killed one');
  assert.equal(dropped.status, 'dropped');
});

test('parseDeliveryMilestonesLifecycle — 표 부재 시 빈 배열', () => {
  assert.deepEqual(parseDeliveryMilestonesLifecycle('# PRD\nno table\n'), []);
});

test('parsePlanBody — openQuestions/risks resolved flag 전파', () => {
  const path = require('path');
  const cwd = '/test/cwd';
  const fsRead = (p) => {
    if (p === path.resolve(cwd, 'prd.md')) return PRD_LIFECYCLE;
    if (p === path.resolve(cwd, 'b.plan.md')) return PLAN_BODY_MARKERS;
    throw new Error('ENOENT ' + p);
  };
  const model = {
    sources: { plans: { items: [{ path: 'b.plan.md', source_prd: 'prd.md' }] } },
  };
  const result = parsePlanBody(model, { fsRead, cwd });
  const resolvedOQ = result.openQuestions.find(q => /resolved-q/.test(q.text));
  assert.equal(resolvedOQ.resolved, true);
  const resolvedRisk = result.risks.find(r => r.risk === 'resolved-risk');
  assert.equal(resolvedRisk.resolved, true);
  const liveRisk = result.risks.find(r => r.risk === 'live-risk');
  assert.equal(liveRisk.resolved, false);
});

// ── M8: parse-time sourceClosed (출처 plan lifecycle) ─────────────────────────

function withTmpPlan(planBasename, planBody, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m8-'));
  const plansDir = path.join(dir, '.claude', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  const planAbs = path.join(plansDir, planBasename);
  fs.writeFileSync(planAbs, planBody, 'utf8');
  try { return fn(dir, planAbs); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const M8_PRD = `# PRD M8

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Shipped | o | complete | [done.plan.md](../plans/done.plan.md) |
| 2 | Killed | o | dropped | [killed.plan.md](../plans/killed.plan.md) |
| 3 | Live | o | in-progress | [live.plan.md](../plans/live.plan.md) |

## Other
`;

const riskBody = (name) => '# Plan ' + name + '\n\n## Risks\n'
  + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n'
  + '| risk-of-' + name + ' | High | Medium | m |\n\n## Other\n';

test('parsePlanBody — sourceClosed 스탬프: complete/dropped=true · in-progress/unknown=false (M8)', () => {
  const cwd = '/test/cwd';
  const fsRead = (p) => {
    if (p.endsWith('prd.md')) return M8_PRD;
    if (p.endsWith('done.plan.md')) return riskBody('done');
    if (p.endsWith('killed.plan.md')) return riskBody('killed');
    if (p.endsWith('live.plan.md')) return riskBody('live');
    if (p.endsWith('unknown.plan.md')) return riskBody('unknown');
    throw new Error('ENOENT ' + p);
  };
  const model = {
    sources: {
      plans: { items: [
        { path: '.claude/plans/done.plan.md', source_prd: 'prd.md' },
        { path: '.claude/plans/killed.plan.md', source_prd: 'prd.md' },
        { path: '.claude/plans/live.plan.md', source_prd: 'prd.md' },
        // unknown.plan.md 는 PRD 미등재 → planStatuses 부재 → fail-open active.
        { path: '.claude/plans/unknown.plan.md', source_prd: 'prd.md' },
      ] },
      receipts: { items: [] },
      ledger: { items: [] },
    },
  };
  const result = parsePlanBody(model, { fsRead, cwd });
  const byRisk = (name) => result.risks.find(r => r.risk === 'risk-of-' + name);
  assert.equal(byRisk('done').sourceClosed, true, 'complete plan → sourceClosed (path 1)');
  assert.equal(byRisk('killed').sourceClosed, true, 'dropped plan → sourceClosed (path 1)');
  assert.equal(byRisk('live').sourceClosed, false, 'in-progress + no close evidence → active');
  assert.equal(byRisk('unknown').sourceClosed, false, 'unknown lifecycle → active (fail-open)');
});

test('parsePlanBody — sourceClosed: stale ledger hash → active, fresh → historical (Codex F1)', () => {
  const planBody = '# Plan reopened\n\n## Risks\n'
    + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n'
    + '| live-after-reopen | High | High | m |\n\n## Other\n';
  withTmpPlan('reopened.plan.md', planBody, (cwd, planAbs) => {
    const freshHash = planAwareMarkdownHash(planAbs);
    // reopened.plan.md 는 PRD 미등재 → M5 override(bare isMilestoneClosed) 미적용 →
    // ledgerCloseFresh(path 3) 의 strict id+basename+hash 가드만 단독 결정한다.
    const prd = '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
      + '| 1 | other | x | pending | — |\n';
    const fsRead = (p) => (p.endsWith('p.prd.md') ? prd : fs.readFileSync(p, 'utf8'));
    const mk = (ledgerHash) => ({
      repo_root: cwd,
      sources: {
        plans: { items: [{ path: '.claude/plans/reopened.plan.md', source_prd: '.claude/prds/p.prd.md' }] },
        receipts: { items: [] },
        ledger: { items: [{ decision_id: 'reopened', plan_basename: 'reopened.plan.md',
          verdict: 'converged', plan_file_hash: ledgerHash }] },
        state: { item: { frontmatter: {} } },
      },
    });
    // 구버전 hash → ledgerCloseFresh hash-mismatch 거부 → 위험 active 유지.
    const stale = parsePlanBody(mk('sha256:STALEOLDHASH'), { cwd, fsRead });
    assert.equal(stale.risks.find(r => r.risk === 'live-after-reopen').sourceClosed, false,
      'stale ledger hash must NOT hide a live risk (F1 regression)');
    // hash 일치 → strict ledger close 발화 → 위험 historical.
    const fresh = parsePlanBody(mk(freshHash), { cwd, fsRead });
    assert.equal(fresh.risks.find(r => r.risk === 'live-after-reopen').sourceClosed, true,
      'fresh ledger hash closes the source plan');
  });
});

test('parsePlanBody — sourceClosed: stale terminal-receipt hash keeps in-progress risk active (Codex F1)', () => {
  const planBody = '# Plan recur\n\n## Risks\n'
    + '| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n'
    + '| live-after-edit | High | High | m |\n\n## Other\n';
  withTmpPlan('recur.plan.md', planBody, (cwd, planAbs) => {
    const freshHash = planAwareMarkdownHash(planAbs);
    const prd = '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
      + '| 1 | a | x | in-progress | `.claude/plans/recur.plan.md` |\n';
    const fsRead = (p) => (p.endsWith('p.prd.md') ? prd : fs.readFileSync(p, 'utf8'));
    const mk = (rcptHash) => ({
      repo_root: cwd,
      sources: {
        plans: { items: [{ path: '.claude/plans/recur.plan.md', source_prd: '.claude/prds/p.prd.md' }] },
        receipts: { items: [{ ok: true, gate: 'mccp-pr-codex', converged: true, decision_id: 'recur',
          plan_hash: rcptHash, path: 'mccp-pr-codex/recur.json', created_at: '2026-06-24T00:00:00Z' }] },
        ledger: { items: [] },
        state: { item: { frontmatter: {} } },
      },
    });
    // 구버전 hash → M5 override(plan_hash-fresh guard)도 미승격 + sourceClosed false → active.
    const stale = parsePlanBody(mk('sha256:STALEHASH'), { cwd, fsRead });
    assert.equal(stale.planStatuses.get('recur.plan.md'), 'in-progress',
      'stale terminal receipt does not auto-complete');
    assert.equal(stale.risks.find(r => r.risk === 'live-after-edit').sourceClosed, false,
      'stale terminal hash keeps the live risk active');
    // hash 일치 → M5 complete 승격 + sourceClosed true → historical.
    const fresh = parsePlanBody(mk(freshHash), { cwd, fsRead });
    assert.equal(fresh.planStatuses.get('recur.plan.md'), 'complete');
    assert.equal(fresh.risks.find(r => r.risk === 'live-after-edit').sourceClosed, true);
  });
});
