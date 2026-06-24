'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePlanBody,
  parseDeliveryMilestones,
  parseDeliveryMilestonesLifecycle,
  parseOpenQuestions,
  parseRisks,
  extractRisksAndOpenQuestions,
} = require('../parsers/plan-body');

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
