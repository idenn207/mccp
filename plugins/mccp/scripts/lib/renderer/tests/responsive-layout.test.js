'use strict';

// v1.16.0 (dashboard-pipeline-chart M3) — 반응형 구조적 collapse 회귀 가드.
// 다크 콘솔(좌측 nav 레일 + 카드 콘텐츠 2D)이 좁은 viewport 에서 깨지지 않고
// 단일 컬럼으로 collapse 하는지 + 가로 overflow 방지 장치가 있는지 검증.
// product.md: 반응형은 구조 변경(grid collapse, overflow-x)이지 fluid 타이포 아님.

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOKENS, LAYOUT } = require('../html');
const { renderStatus } = require('../index');

const CSS = TOKENS + LAYOUT;

function minimalModel() {
  return {
    derived_at: new Date().toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: { count: 0, items: [] },
      receipts: { count: 0, items: [] },
      state: { item: { resume_state: 'idle', body: {}, frontmatter: {} } },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
}

test('responsive — narrow-viewport breakpoint exists', () => {
  assert.match(CSS, /@media\s*\(max-width:\s*720px\)/, 'max-width breakpoint declared');
});

test('responsive — shell collapses to single column at breakpoint', () => {
  const block = CSS.match(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\n\}/);
  assert.ok(block, 'breakpoint block found');
  assert.match(block[0], /\.shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'shell becomes single column');
});

test('responsive — nav rail reflows horizontal + scrollable at breakpoint', () => {
  const block = CSS.match(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\n\}/);
  assert.match(block[0], /\.nav-rail\s*\{[^}]*flex-direction:\s*row/, 'nav rail horizontal');
  assert.match(block[0], /\.nav-rail\s*\{[^}]*overflow-x:\s*auto/, 'nav rail scrollable');
});

test('responsive — content min-width:0 prevents grid blowout', () => {
  assert.match(CSS, /\.content\s*\{[^}]*min-width:\s*0/, 'content min-width 0');
  assert.match(CSS, /grid-template-columns:\s*var\(--nav-width\)\s*minmax\(0,\s*1fr\)/,
    'desktop shell uses minmax(0,1fr) so content cannot overflow');
});

test('responsive — wide tables get an overflow-x scroll affordance', () => {
  assert.match(CSS, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/, 'table-scroll affordance');
});

test('responsive — viewport meta present in rendered HTML', () => {
  const { html } = renderStatus(minimalModel(), { snapshotsDir: null });
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});
