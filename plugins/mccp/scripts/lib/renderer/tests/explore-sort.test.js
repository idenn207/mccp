'use strict';

// Dashboard Data Exploration M2 — explore-sort.js pure 로직 단위 테스트.
// compareItems(정렬 안정성·tie-break·잘못된 mode fail-open) + matchFilter(AND·sentinel·빈 필터).

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareItems, matchFilter, textMatch } = require('../parsers/explore-sort');

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

// ── M3: progress mode 정렬 ─────────────────────────────────────────────────

test('compareItems progress — data-progress-rank desc, 동률은 data-activity-ord asc', () => {
  const items = [
    { rank: 1, activityOrd: 0 }, // active, 최신
    { rank: 3, activityOrd: 2 }, // blocked
    { rank: 1, activityOrd: 1 }, // active, 덜 최신
    { rank: 0, activityOrd: 3 }, // idle
  ];
  // rank desc: 3 → (1,1) → 0. rank 동률(1) 은 activityOrd asc(0,1).
  assert.deepEqual(sortBy(items, 'progress').map((x) => x.activityOrd), [2, 0, 1, 3]);
});

test('compareItems progress — 문자열 rank/activityOrd Number 강제(getAttribute 대응)', () => {
  assert.ok(compareItems({ rank: '3', activityOrd: '5' }, { rank: '1', activityOrd: '0' }, 'progress') < 0);
  assert.ok(compareItems({ rank: '2', activityOrd: '4' }, { rank: '2', activityOrd: '1' }, 'progress') > 0);
  assert.equal(compareItems({}, {}, 'progress'), 0, '둘 다 누락 → 0');
});

test('compareItems progress — 안정 정렬(동 rank·동 activityOrd 는 원순서)', () => {
  const items = [{ rank: 2, activityOrd: 1, id: 'a' }, { rank: 2, activityOrd: 1, id: 'b' }];
  assert.deepEqual(sortBy(items, 'progress').map((x) => x.id), ['a', 'b']);
});

// ── M3: status/worktree 필터 축(M2 prd/plan 위에 AND 누적) ──────────────────

test('matchFilter status/worktree — 빈 축 전체 + AND 누적', () => {
  const d = { status: 'blocked', worktree: 'feat-x' };
  assert.equal(matchFilter(d, {}), true, '빈 필터 전체');
  assert.equal(matchFilter(d, { status: 'blocked' }), true);
  assert.equal(matchFilter(d, { status: 'active' }), false);
  assert.equal(matchFilter(d, { worktree: 'feat-x' }), true);
  assert.equal(matchFilter(d, { worktree: 'feat-y' }), false);
  assert.equal(matchFilter(d, { status: 'blocked', worktree: 'feat-x' }), true);
  assert.equal(matchFilter(d, { status: 'blocked', worktree: 'feat-y' }), false, '한 축 불일치 false');
});

test('matchFilter — M2 descriptor(status/worktree 부재)는 빈 status/worktree 필터에 무영향', () => {
  const m2 = { prd: 'a', plan: 'p1' }; // status/worktree 없음
  assert.equal(matchFilter(m2, { prd: 'a' }), true, 'status/worktree 빈 → M2 무영향');
  assert.equal(matchFilter(m2, { prd: 'a', status: '', worktree: '' }), true);
});

// ── M3: textMatch(검색 substring) ──────────────────────────────────────────

test('textMatch — 빈/null needle 은 전체 true', () => {
  assert.equal(textMatch('아무 텍스트', ''), true);
  assert.equal(textMatch('hello', null), true);
  assert.equal(textMatch('hello', undefined), true);
});

test('textMatch — 대소문자 무관 substring', () => {
  assert.equal(textMatch('Hello World', 'hello'), true);
  assert.equal(textMatch('Hello World', 'WORLD'), true);
  assert.equal(textMatch('Hello World', 'xyz'), false);
});

test('textMatch — 한글 부분일치(NFC normalize)', () => {
  assert.equal(textMatch('위험도 정렬 컨트롤', '정렬'), true);
  assert.equal(textMatch('멀티세션 진행', '세션'), true);
  assert.equal(textMatch('검색 wiring', '필터'), false);
  // 분해형(NFD) needle 도 조합형(NFC) haystack 와 매칭(normalize SSoT).
  const nfd = '위험'.normalize('NFD'); // 조합 jamo 분해 (NFC 와 코드포인트 상이)
  assert.notEqual(nfd, '위험', 'NFD 가 NFC 와 다른 표현');
  assert.equal(textMatch('위험 항목', nfd), true, 'NFD needle ↔ NFC haystack');
});

test('textMatch — haystack null/undefined 안전(빈 문자열 취급)', () => {
  assert.equal(textMatch(null, 'x'), false);
  assert.equal(textMatch(undefined, 'x'), false);
  assert.equal(textMatch(null, ''), true);
});

test('UMD — node 에서 module.exports 로 세 함수 노출', () => {
  const api = require('../parsers/explore-sort');
  assert.equal(typeof api.compareItems, 'function');
  assert.equal(typeof api.matchFilter, 'function');
  assert.equal(typeof api.textMatch, 'function');
});
