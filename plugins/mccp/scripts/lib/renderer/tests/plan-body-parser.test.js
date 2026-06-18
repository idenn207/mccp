'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePlanBody,
  parseDeliveryMilestones,
  parseOpenQuestions,
  parseRisks,
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

test('parseOpenQuestions — checkbox + bare bullets', () => {
  const qs = parseOpenQuestions(PLAN_BODY_FULL);
  assert.equal(qs.length, 3);
  assert.equal(qs[0], 'q1: foo?');
  assert.equal(qs[1], 'q2: bar resolved');
  assert.equal(qs[2], 'q3: bare bullet without checkbox');
});

test('parseRisks — 4-col table', () => {
  const { rows } = parseRisks(PLAN_BODY_FULL);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    risk: 'r1', likelihood: 'High', impact: 'Medium', mitigation: 'm1',
  });
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
