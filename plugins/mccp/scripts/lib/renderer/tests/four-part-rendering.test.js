'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');
const { renderMilestoneHistory } = require('../sections/milestone-history');
const formatUtils = require('../format-utils');
const { renderHtml } = require('../html');

test('OQ 4-part HTML — severity tag + item text + meta-cue + action prompt + copy button', () => {
  const planBody = {
    openQuestions: [{
      source: 'v1-4-2-dashboard-overhaul-m2.plan.md',
      text: 'OQ-a 결정 (HIGH)',
      lineNumber: 102,
      headingPath: ['## Open Questions'],
    }],
  };
  const { html } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  assert.ok(html.includes('class="severity-tag'), 'severity tag present');
  assert.ok(html.includes('class="item-text"'), 'item text present');
  assert.ok(html.includes('class="meta-cue"'), 'meta-cue present');
  assert.ok(html.includes('class="action-prompt"'), 'action prompt present');
  assert.ok(html.includes('class="copy-btn"'), 'copy button present');
  assert.ok(html.includes('data-copy="'), 'data-copy attr present');
  assert.ok(html.includes('§Open Questions, line 102'), 'meta-cue anchor');
});

test('Risk 4-part HTML — sev tag + mitigation + dedupe cue + action prompt + copy button', () => {
  const planBody = {
    risks: [{
      risk: 'data corruption',
      impact: 'High',
      likelihood: 'Medium',
      mitigation: 'fsync',
      relatedOpenQuestion: 'OQ-a 결정',
    }],
  };
  const { html } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.ok(html.includes('class="severity-tag'));
  assert.ok(html.includes('class="risk-mitigation'));
  assert.ok(html.includes('class="related-oq"'));
  assert.ok(html.includes('동일 OQ 참조: OQ-a 결정'));
  assert.ok(html.includes('class="copy-btn"'));
});

test('3 expanded + details collapse — OQ', () => {
  const stateOQ = [];
  for (let i = 0; i < 7; i++) stateOQ.push('q' + i);
  const model = { sources: { state: { item: { body: { open_questions: stateOQ } } } } };
  const { html } = renderOpenQuestions(model, formatUtils, {});
  assert.ok(html.includes('<details class="oq-more">'));
  assert.ok(html.includes('+4 더보기'));
});

test('3 expanded + details collapse — Risks', () => {
  const risks = [];
  for (let i = 0; i < 7; i++) {
    risks.push({ risk: 'r' + i, impact: 'Low', likelihood: 'Low' });
  }
  const { html } = renderRisks({ sources: {} }, formatUtils, { risks });
  assert.ok(html.includes('<details class="risks-more">'));
  assert.ok(html.includes('+4 더보기'));
});

test('markdown 4-part sub-list — severity + meta-cue + action prompt', () => {
  const planBody = {
    openQuestions: [{
      source: 'plan.md',
      text: 'fix stale guard (MEDIUM)',
      lineNumber: 50,
      headingPath: ['## Open Questions'],
    }],
  };
  const { md } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  assert.ok(md.startsWith('- '));
  assert.ok(md.includes('**MEDIUM**'));
  assert.ok(md.includes('- 왜:'));
  assert.ok(md.includes('- 다음 액션: `/mccp:plan'));
});

test('milestone-history — PRD complete row + receipt cross-ref', () => {
  const fakePrd = [
    '# PRD',
    '',
    '## Delivery Milestones',
    '',
    '| # | Name | Scope | Status | Plan |',
    '|---|---|---|---|---|',
    '| 1 | M1 layout | - | complete | [link](./v1-4-2-m1.plan.md) |',
    '| 2 | M2 content | - | in-progress | [link](./v1-4-2-m2.plan.md) |',
  ].join('\n');
  const model = {
    sources: {
      plans: { items: [{ path: '/tmp/v1-4-2-m1.plan.md', source_prd: '/tmp/v1-4-2.prd.md' }] },
      receipts: {
        items: [{
          gate: 'mccp-pr-codex',
          decision_id: 'v1-4-2-dashboard-overhaul-m1',
          created_at: new Date().toISOString(),
        }],
      },
    },
    repo_root: '/tmp',
  };
  const fsRead = (p) => {
    if (p.endsWith('v1-4-2.prd.md')) return fakePrd;
    throw new Error('no such ' + p);
  };
  const out = renderMilestoneHistory(model, formatUtils, {}, { fsRead, cwd: '/tmp' });
  assert.ok(out, 'milestone-history returns rendered output');
  assert.ok(out.html.includes('M1 layout'));
  assert.ok(out.html.includes('class="milestone-item"'));
  assert.ok(!out.html.includes('M2 content'), 'only complete rows surface');
});

test('F1 absorption — data-copy attr preserves spaces/quotes/parens (no URL encoding)', () => {
  const planBody = {
    openQuestions: [{
      source: 'plan.md',
      text: 'OQ-a foo bar baz (HIGH)',
      lineNumber: 1,
      headingPath: ['## Open Questions'],
    }],
  };
  const { html } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  // data-copy payload should NOT contain percent-encoded spaces / parens
  const m = html.match(/data-copy="([^"]+)"/);
  assert.ok(m, 'data-copy attr present');
  const payload = m[1];
  assert.ok(!payload.includes('%20'), 'no percent-encoded spaces in copy payload');
  assert.ok(!payload.includes('%28'), 'no percent-encoded paren');
  assert.ok(!payload.includes('%29'), 'no percent-encoded paren');
  // single-tick quotes inside data-copy are escaped as HTML entity
  assert.ok(payload.includes('OQ-a foo bar baz') || payload.includes('OQ-a foo bar baz (HIGH)'),
    'raw text preserved');
});

test('html.js wires milestone-history section + copy button JS', () => {
  const model = { sources: {}, warnings: [] };
  // v1.13.0 — sections 배열에 pipeline 삽입(index 1). milestoneHistory 는 index 7.
  const sections = [
    null, null, null, null, null, null, null,
    { md: 'ms md', html: '<ul><li>M1</li></ul>' },
  ];
  const verdict = { tone: 'neutral', icon: '·', text: 'test' };
  const html = renderHtml(model, sections, verdict, new Date().toISOString(), formatUtils);
  assert.ok(html.includes('<section id="milestone-history">'));
  assert.ok(html.includes('이정표 기록'));
  // copy button JS event delegation script
  assert.ok(html.includes('data-copy'));
  assert.ok(html.includes('navigator.clipboard'));
});

test('F2 absorption — derive-normalized receipt shape (gate field, not gate_id)', () => {
  const fakePrd = [
    '# PRD',
    '',
    '## Delivery Milestones',
    '',
    '| # | Name | Scope | Status | Plan |',
    '|---|---|---|---|---|',
    '| 1 | M0 schema | - | complete | [link](./v1-3-0-m0.plan.md) |',
  ].join('\n');
  const model = {
    sources: {
      plans: { items: [{ path: '/tmp/v1-3-0-m0.plan.md', source_prd: '/tmp/v1-3-0.prd.md' }] },
      receipts: {
        items: [{
          // derive normalize 출력 — gate (not gate_id)
          gate: 'mccp-pr-codex',
          decision_id: 'v1-3-0-observability-m0-schema-baseline',
          created_at: '2026-06-17T10:00:00.000Z',
        }],
      },
    },
    repo_root: '/tmp',
  };
  const fsRead = (p) => {
    if (p.endsWith('v1-3-0.prd.md')) return fakePrd;
    throw new Error('no such ' + p);
  };
  const out = renderMilestoneHistory(model, formatUtils, {}, { fsRead, cwd: '/tmp' });
  assert.ok(out, 'F2 — milestone-history must accept derive-normalized gate field');
  // 날짜 미상 fallback이 트리거되면 안 됨 — receipt cross-ref가 작동했어야 함
  assert.ok(!out.html.includes('날짜 미상'),
    'F2 absorption: gate field match must succeed, no 날짜 미상 fallback');
});

test('null when no milestone-history data', () => {
  const out = renderMilestoneHistory({ sources: {} }, formatUtils, {});
  assert.equal(out, null);
});
