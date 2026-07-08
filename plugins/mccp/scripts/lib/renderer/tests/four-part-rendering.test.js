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
  const { html, md } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  assert.ok(html.includes('class="sev s-'), 'sev badge present');
  assert.ok(html.includes('class="li-q"'), 'question text present');
  assert.ok(html.includes('class="meta-cue"'), 'meta-cue present');
  // v1.18.7 M4 — 메인 = 복사 버튼만(li-action). verbose inline-prompt(<code>{전체 명령}) 제거.
  assert.ok(html.includes('class="li-action"'), 'li-action copy affordance present');
  assert.ok(html.includes('class="copy-btn"'), 'copy button present');
  assert.ok(html.includes('data-copy="'), 'data-copy attr present');
  assert.ok(!html.includes('class="inline-prompt"'), 'verbose inline-prompt removed');
  assert.ok(html.includes('Open Questions') && html.includes('line 102'), 'meta-cue anchor');
  // headline(Task 6b) — 전체 명령은 메인 <code> 미노출, STATUS.md md(드로어 SSoT)에 보존.
  const cm = html.match(/data-copy="([^"]+)"/);
  assert.ok(cm, 'data-copy present');
  assert.ok(!html.includes('<code>' + cm[1] + '</code>'), '전체 명령 <code> 메인 미노출');
  assert.ok(md.includes('다음 액션') || md.includes(cm[1]), '전체 명령 md 보존');
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
  assert.ok(html.includes('class="sev s-'));
  assert.ok(html.includes('class="meta-cue mit"'), 'mitigation cue present');
  assert.ok(html.includes('완화:'), 'mitigation label');
  assert.ok(html.includes('동일 질문 참조: OQ-a 결정'));
  // v1.18.7 M4 (Task 6c) — 위험 메인 복사 버튼(OQ 와 대칭). li-action + copy-btn + data-copy.
  assert.ok(html.includes('class="li-action"'), 'risk li-action copy affordance present');
  assert.ok(html.includes('class="copy-btn"'), 'risk copy button present');
  assert.ok(html.includes('data-copy="'), 'risk data-copy attr present');
});

test('full mode (route) — OQ html shows all active, md keeps details (M5 Task 6)', () => {
  const stateOQ = [];
  for (let i = 0; i < 7; i++) stateOQ.push('q' + i);
  const model = { sources: { state: { item: { body: { open_questions: stateOQ } } } } };
  const { html, md } = renderOpenQuestions(model, formatUtils, {});
  // M5 Task 6 — route(#route-questions) full mode: html 은 캡 없이 모든 active 노출(더보기 제거).
  assert.ok(!html.includes('<details class="more">'), 'html 더보기 <details> 제거');
  assert.ok(html.includes('q6'), '7번째 항목도 html 에 실존(도달성, Codex F2)');
  // md 는 top-3 + <details> 유지(plain-text 도달성).
  assert.ok(md.includes('<details>') && md.includes('+4 더보기'), 'md 더보기 유지');
});

test('full mode (route) — Risks html shows all active, md keeps details (M5 Task 6)', () => {
  const risks = [];
  for (let i = 0; i < 7; i++) {
    risks.push({ risk: 'r' + i, impact: 'Low', likelihood: 'Low' });
  }
  const { html, md } = renderRisks({ sources: {} }, formatUtils, { risks });
  assert.ok(!html.includes('<details class="more">'), 'html 더보기 <details> 제거');
  assert.ok(html.includes('r6'), '7번째 항목도 html 에 실존(도달성, Codex F2)');
  assert.ok(md.includes('<details>') && md.includes('+4 더보기'), 'md 더보기 유지');
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
  assert.ok(md.includes('- 출처:'));
  assert.ok(md.includes('- 다음 액션: `/mccp:plan'));
});

test('markdown — risk detail 인라인(영향/가능성/완화책/관련 질문) — M4 동등본', () => {
  const planBody = {
    risks: [{
      risk: 'data corruption', impact: 'High', likelihood: 'Medium', mitigation: 'fsync',
      relatedOpenQuestion: 'OQ-a 결정', source: 'p.plan.md',
    }],
  };
  const { md } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.ok(md.includes('· data corruption'), '위험 전문 헤더');
  assert.ok(md.includes('\n  - 영향: High'), 'M4: 영향 행 plain-text 노출');
  assert.ok(md.includes('\n  - 가능성: Medium'), 'M4: 가능성 행 plain-text 노출');
  assert.ok(md.includes('\n  - 완화책: fsync'), '완화책 detail 행');
  assert.ok(md.includes('\n  - 동일 질문 참조: OQ-a 결정'), 'section-only relatedOpenQuestion 생존');
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
  // v1.17.0 M1: milestone-history renders as a panel (head/body anatomy) inside
  // the activity route — title lives in .panel-head > .panel-title (Codex F2).
  assert.ok(/<section class="panel[^"]*"[^>]*><div class="panel-head">[\s\S]*?<h3 class="panel-title">마일스톤 기록<\/h3>/.test(html));
  assert.ok(html.includes('마일스톤 기록'));
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
  // cwd 를 아카이브 PRD 가 없는 디렉토리(__dirname)로 고정(hermetic) —
  // milestone-history 는 이제 .claude/prds/archived/ 를 직접 스캔하므로
  // process.cwd() 폴백이 실제 repo 아카이브를 읽지 않도록 차단한다.
  const out = renderMilestoneHistory({ sources: {} }, formatUtils, {}, { cwd: __dirname });
  assert.equal(out, null);
});
