'use strict';

// leadtime-observability M3 — 리드타임 한 줄 섹션 회귀 test.
//
// 이 섹션이 고정하는 명제는 DD3 의 4갈래 사상이다. 특히 **hide 조건이 하나뿐**임을
// 고정한다: 축이 계산되지 않았을 때만 숨기고, 값 부재는 절대 숨기지 않는다.
//
// 그리고 배선을 고정한다 — 섹션이 `sections` 배열의 읽히지 않는 슬롯이 아니라
// `grid` 채널로 두 composer 에 실제로 도달하는지. 그 슬롯 오배선이 이 milestone 의
// L2 패널이 낸 HIGH 였고, 도달하지 않는 모듈에 대한 ladder test 는 무의미하다.

const test = require('node:test');
const assert = require('node:assert/strict');

const { renderLeadtimeLine } = require('../sections/leadtime-line');
const { renderStatusGrid } = require('../sections/status-grid');
const formatUtils = require('../format-utils');
const { emptySummary } = require('../../leadtime-surface');

function summary(over) {
  const s = emptySummary([]);
  s.state = 'ok';
  s.coverage = { panel_records: 62, measurable: 49, counts_are_lower_bound: true };
  s.panel_span = { n: 49, min: 60000, p50: 456000, p90: 720000, max: 2400000 };
  s.post_panel_span.by_anchor.ledger_basename = { n: 11, p50: 32832000, p90: 60000000, max: 90000000 };
  s.post_panel_span.by_anchor.ship_plan_hash = { n: 17, p50: 24192000, p90: 90000000, max: 150000000 };
  s.post_panel_span.coverage = {
    eligible: 49, matched_ledger: 11, matched_ship: 17,
    both: 6, only_ledger: 5, only_ship: 11, neither: 27,
  };
  return Object.assign(s, over || {});
}

// ── 1. hide 조건은 축 부재 하나뿐 (DD3) ─────────────────────────────────────

test('a model without the leadtime key renders nothing — no absence is invented', () => {
  assert.equal(renderLeadtimeLine({}, formatUtils), null);
});

test('a leadtime of null also renders nothing — that is "not computed", not "measured zero"', () => {
  // bare derive(run · validate · perf-budget)가 남기는 값이 정확히 이것이다.
  // 여기에 `미산출` 을 찍으면 측정하지 않은 축에 없는 기록을 소급 주장하게 된다(UI10).
  assert.equal(renderLeadtimeLine({ leadtime: null }, formatUtils), null);
});

test('a blind state is RENDERED, not hidden — absence is stated, never silently dropped', () => {
  const out = renderLeadtimeLine({ leadtime: emptySummary([]) }, formatUtils);
  assert.ok(out, 'a measured-but-blind axis must still produce a line');
  assert.ok(out.md.includes('미산출'), 'the blind line says 미산출: ' + out.md);
  assert.ok(!/\b0(\.\d+)?(min|d)\b/.test(out.md), 'and never says 0min/0d');
});

// ── 2. 값 + 커버리지 (UI2) ──────────────────────────────────────────────────

test('an ok state carries values with their coverage in both surfaces', () => {
  const out = renderLeadtimeLine({ leadtime: summary() }, formatUtils);
  // M4 DD3 — 분모는 토큰마다 반복하지 않고 **그룹 라벨이 한 번** 선언한다. 그래서
  // 값 토큰은 분자만 달고, 분모는 헤드와 ship 그룹 라벨에 각각 정확히 한 번 나온다.
  assert.ok(out.md.includes('ledger 0.38d (11)'), 'ledger numerator adjacent: ' + out.md);
  assert.ok(out.md.includes('hash 0.28d (17)'), 'ship numerator adjacent: ' + out.md);
  assert.ok(out.md.includes('(49/62 측정)'), 'corpus denominator declared once: ' + out.md);
  assert.ok(out.md.includes('패널→ship (조인 49):'), 'join denominator declared once: ' + out.md);
  assert.ok(out.html.includes('(11)') && out.html.includes('(17)')
    && out.html.includes('조인 49'), 'html carries the same numbers');
});

test('a degraded state keeps its values and adds the damage note as a separate paragraph', () => {
  const out = renderLeadtimeLine(
    { leadtime: summary({ state: 'degraded', degradations: ['parse-failures'] }) },
    formatUtils,
  );
  // M4 DD5 — 이전 단언(`out.md.split('\n').length === 2`)은 계약이 아니라 **결함을
  // 고정**하고 있었다. 빈 줄이 없으면 CommonMark 가 두 줄을 한 문단으로 접어 html 의
  // `<p>` 둘과 구조가 어긋난다.
  const lines = out.md.split('\n');
  assert.equal(lines.length, 3, 'text, blank, note: ' + JSON.stringify(out.md));
  assert.equal(lines[1], '', 'the blank line is what makes it a paragraph break');
  assert.ok(out.md.includes('parse-failures'), 'the damage is named, not hidden');
  assert.ok(out.text.indexOf('parse-failures') === -1, 'the shared one line stays one line');
});

test('md paragraph count equals html <p> count in every state carrying a note (M4 DD5)', () => {
  // 두 면의 **구조 동형**. 정보가 같아도 구조가 다르면 Design Principle 4 위반이다.
  const paragraphs = (md) => md.split(/\n{2,}/).filter((s) => s.trim() !== '').length;
  const pCount = (html) => (html.match(/<p\b/g) || []).length;
  const cases = {
    ok: summary(),
    degraded: summary({ state: 'degraded', degradations: ['parse-failures'] }),
    blind: emptySummary(['read-error']),
  };
  Object.keys(cases).forEach((name) => {
    const out = renderLeadtimeLine({ leadtime: cases[name] }, formatUtils);
    assert.equal(paragraphs(out.md), pCount(out.html),
      name + ': md paragraphs must equal html <p> elements — ' + JSON.stringify(out.md));
  });
});

// ── 3. §3.9 제약 — 신규 heading·CSS 0개 ─────────────────────────────────────

test('the section introduces no heading and no new CSS class', () => {
  const out = renderLeadtimeLine({ leadtime: summary() }, formatUtils);
  assert.ok(!/^#{1,6}\s/m.test(out.md), 'no markdown heading: ' + out.md);
  const classes = (out.html.match(/class="([^"]+)"/g) || []).join(' ');
  classes.split(/[\s"]+/).filter(Boolean).forEach((c) => {
    if (c === 'class=') return;
    assert.ok(['mono', 'muted'].includes(c), 'only pre-existing tokens, got: ' + c);
  });
});

// ── 4. 결정성 ───────────────────────────────────────────────────────────────

test('the same model always renders the same line', () => {
  const a = renderLeadtimeLine({ leadtime: summary() }, formatUtils);
  const b = renderLeadtimeLine({ leadtime: summary() }, formatUtils);
  assert.equal(a.md, b.md);
  assert.equal(a.html, b.html);
});

// ── 5. 배선 — 섹션이 실제로 두 composer 에 도달한다 ─────────────────────────
//
// `markdown.js` 와 `html.js` 는 `sections` 를 정확히 10개 위치로 구조분해하므로
// 11번째 원소는 어느 쪽도 읽지 않는다. 그래서 채널은 `grid` 다.

test('status-grid places the line immediately after the status band, not at the block end', () => {
  const line = renderLeadtimeLine({ leadtime: summary() }, formatUtils);
  const grid = renderStatusGrid({}, formatUtils, {}, { leadtimeLine: line });
  const lines = grid.md.split('\n');
  assert.ok(lines[0].includes('진행 중'), 'line 0 is the status band: ' + lines[0]);
  assert.equal(lines[1], '',
    'a blank line separates them — without it CommonMark folds both into one paragraph');
  assert.equal(lines[2], line.md.split('\n')[0],
    'the line is still at the TOP — the first content after the status band');
});

test('status-grid hands the html to the hero panel through grid.leadtimeHtml', () => {
  const line = renderLeadtimeLine({ leadtime: summary() }, formatUtils);
  const grid = renderStatusGrid({}, formatUtils, {}, { leadtimeLine: line });
  assert.equal(grid.leadtimeHtml, line.html,
    'renderHeroPanel(verdict, grid, …) is the only channel that reaches the html surface');
});

test('an absent axis inserts no element at all — graceful hide, not an empty line', () => {
  const withAxis = renderStatusGrid({}, formatUtils, {},
    { leadtimeLine: renderLeadtimeLine({ leadtime: summary() }, formatUtils) });
  const without = renderStatusGrid({}, formatUtils, {}, { leadtimeLine: null });
  assert.ok(withAxis.md.split('\n').length > without.md.split('\n').length,
    'the hidden case is strictly shorter');
  assert.equal(without.leadtimeHtml, null);
  assert.ok(!without.md.includes('리드타임'));
});

test('the composers destructure exactly ten sections — the array is NOT the channel', () => {
  const fs = require('node:fs');
  const md = fs.readFileSync(require.resolve('../markdown'), 'utf8');
  const html = fs.readFileSync(require.resolve('../html'), 'utf8');
  const shape = /const \[([^\]]+)\] = sections;/;
  [['markdown.js', md], ['html.js', html]].forEach(([name, src]) => {
    const m = src.match(shape);
    assert.ok(m, name + ' still destructures sections');
    const n = m[1].split(',').length;
    assert.equal(n, 10, name + ' reads ' + n + ' slots; an 11th appended section would be dead');
  });
});
