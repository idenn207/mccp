'use strict';

// Dashboard Data Exploration M2 — explore-sort.js pure 로직 단위 테스트.
// compareItems(정렬 안정성·tie-break·잘못된 mode fail-open) + matchFilter(AND·sentinel·빈 필터).

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareItems, matchFilter } = require('../parsers/explore-sort');

function sortBy(items, mode) {
  return items.slice().sort((a, b) => compareItems(a, b, mode));
}

test('compareItems severity — data-sev desc, 동률은 data-ord asc(안정 tie-break)', () => {
  const items = [
    { sev: 2, ord: 5 },
    { sev: 4, ord: 9 },
    { sev: 4, ord: 1 },
    { sev: 2, ord: 0 },
  ];
  // sev4(ord asc: 1,9) → sev2(ord asc: 0,5)
  assert.deepEqual(sortBy(items, 'severity').map((x) => x.ord), [1, 9, 0, 5]);
});

test('compareItems time — data-ord asc(원본 parse chronology)', () => {
  const items = [{ sev: 4, ord: 5 }, { sev: 1, ord: 0 }, { sev: 2, ord: 9 }];
  assert.deepEqual(sortBy(items, 'time').map((x) => x.ord), [0, 5, 9]);
});

test('compareItems — 잘못된 mode 는 fail-open(0 → 원순서 유지)', () => {
  const items = [{ sev: 1, ord: 9 }, { sev: 4, ord: 0 }, { sev: 2, ord: 3 }];
  assert.deepEqual(sortBy(items, 'bogus').map((x) => x.ord), [9, 0, 3], '원순서 보존');
  assert.deepEqual(sortBy(items, undefined).map((x) => x.ord), [9, 0, 3]);
  assert.equal(compareItems({ sev: 4, ord: 0 }, { sev: 1, ord: 9 }, 'bogus'), 0);
});

test('compareItems — 문자열/누락 값 Number 강제(DOM getAttribute 문자열 대응)', () => {
  // data-sev/data-ord 는 getAttribute → 문자열. 누락은 0.
  assert.ok(compareItems({ sev: '4', ord: '1' }, { sev: '2', ord: '9' }, 'severity') < 0);
  assert.ok(compareItems({ ord: '5' }, { ord: '2' }, 'time') > 0);
  assert.equal(compareItems({}, {}, 'severity'), 0, '둘 다 누락 → 0');
});

test('matchFilter — 빈 필터 축은 전체 통과', () => {
  const d = { prd: 'a', plan: 'p1' };
  assert.equal(matchFilter(d, {}), true);
  assert.equal(matchFilter(d, { prd: '', plan: '' }), true);
  assert.equal(matchFilter(d, { prd: null, plan: null }), true);
});

test('matchFilter — PRD ∧ plan AND 술어', () => {
  const d = { prd: 'a', plan: 'p1' };
  assert.equal(matchFilter(d, { prd: 'a' }), true);
  assert.equal(matchFilter(d, { prd: 'b' }), false);
  assert.equal(matchFilter(d, { prd: 'a', plan: 'p1' }), true);
  assert.equal(matchFilter(d, { prd: 'a', plan: 'p2' }), false, '한 축이라도 불일치면 false');
});

test('matchFilter — sentinel(__global__/__unknown__)은 동등 비교로 자기 자신만 매칭', () => {
  const g = { prd: '__global__', plan: '__global__' };
  const u = { prd: '__unknown__', plan: '.claude/plans/x.plan.md' };
  assert.equal(matchFilter(g, { prd: '__global__' }), true);
  assert.equal(matchFilter(g, { prd: 'a' }), false);
  assert.equal(matchFilter(u, { prd: '__unknown__' }), true);
  assert.equal(matchFilter(u, { prd: '__global__' }), false);
});

test('matchFilter — desc 누락 필드 안전(빈 문자열 취급)', () => {
  assert.equal(matchFilter({}, { prd: 'a' }), false);
  assert.equal(matchFilter(undefined, {}), true);
  assert.equal(matchFilter(undefined, undefined), true);
});

test('UMD — node 에서 module.exports 로 두 함수 노출', () => {
  const api = require('../parsers/explore-sort');
  assert.equal(typeof api.compareItems, 'function');
  assert.equal(typeof api.matchFilter, 'function');
});
