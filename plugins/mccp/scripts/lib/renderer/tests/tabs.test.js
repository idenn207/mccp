'use strict';

// Dashboard Truthfulness M3-b — CSS-only 탭 빌더(parsers/tabs.js) 단위 테스트.
// radio+label+panel triple 구조, default-checked, count 뱃지, escape, fail-open.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTabs } = require('../parsers/tabs');
const formatUtils = require('../format-utils');

test('tabs — 2 탭 = radio+label+panel triple 3쌍', () => {
  const html = buildTabs({
    name: 'tab-x',
    tabs: [
      { id: 'active', label: '미해결', count: 2, panelHtml: '<ul>A</ul>' },
      { id: 'resolved', label: '완화됨', count: 5, panelHtml: '<ul>R</ul>' },
    ],
  }, formatUtils);
  assert.equal((html.match(/<input class="tab-radio"/g) || []).length, 2);
  assert.equal((html.match(/<label class="tab"/g) || []).length, 2);
  assert.equal((html.match(/<section class="tab-panel"/g) || []).length, 2);
  // input/label/panel id wiring (for/id + aria-controls)
  assert.match(html, /id="tab-x-active" aria-controls="tab-x-active-panel"/);
  assert.match(html, /<label class="tab" for="tab-x-active">/);
  assert.match(html, /<section class="tab-panel" id="tab-x-active-panel"/);
  // 패널 inner 통과
  assert.ok(html.includes('<ul>A</ul>') && html.includes('<ul>R</ul>'));
});

test('tabs — default 는 첫 탭 checked, 명시 checked 우선', () => {
  const auto = buildTabs({ name: 't', tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, formatUtils);
  // 첫 탭에만 checked
  assert.match(auto, /id="t-a" aria-controls="t-a-panel" checked>/);
  assert.doesNotMatch(auto, /id="t-b"[^>]*checked/);
  const explicit = buildTabs({ name: 't', tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', checked: true }] }, formatUtils);
  assert.match(explicit, /id="t-b"[^>]*checked>/);
  assert.doesNotMatch(explicit, /id="t-a"[^>]*checked/);
});

test('tabs — count 뱃지: 있으면 tab-count, 없으면 생략 (0 도 표기)', () => {
  const html = buildTabs({
    name: 't',
    tabs: [{ id: 'a', label: '미해결', count: 0 }, { id: 'b', label: '완화됨' }],
  }, formatUtils);
  assert.match(html, /미해결 <span class="tab-count">0<\/span>/);
  // count 미지정 탭은 뱃지 없음
  assert.match(html, /<label class="tab" for="t-b">완화됨<\/label>/);
});

test('tabs — label escapeHtml (raw marker 비누출, Constraint 3)', () => {
  const html = buildTabs({
    name: 't',
    tabs: [{ id: 'a', label: '<b>x</b> & "q"', panelHtml: 'P' }],
  }, formatUtils);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('tabs — 빈 탭 배열 → 빈 문자열 (fail-open)', () => {
  assert.equal(buildTabs({ name: 't', tabs: [] }, formatUtils), '');
  assert.equal(buildTabs({}, formatUtils), '');
  assert.equal(buildTabs(null, formatUtils), '');
});

test('tabs — formatUtils 없어도 throw 안 함 (fallback escape)', () => {
  const html = buildTabs({ name: 't', tabs: [{ id: 'a', label: 'A', panelHtml: 'P' }] });
  assert.ok(html.includes('<div class="tabs"'));
  assert.ok(html.includes('P'));
});
