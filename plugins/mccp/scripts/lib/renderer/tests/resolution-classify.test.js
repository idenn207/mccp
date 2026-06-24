'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { annotateResolution } = require('../parsers/resolution-classify');

test('annotateResolution — 마커 항목 resolved=true, 미마커 active', () => {
  const planBody = {
    risks: [
      { risk: 'live', resolved: false },
      { risk: 'done', resolved: true },
    ],
    openQuestions: [
      { text: 'live-q', resolved: false },
      { text: 'done-q', resolved: true },
    ],
  };
  annotateResolution(planBody);
  assert.equal(planBody.risks[0].resolved, false);
  assert.equal(planBody.risks[1].resolved, true);
  assert.equal(planBody.openQuestions[0].resolved, false);
  assert.equal(planBody.openQuestions[1].resolved, true);
});

test('annotateResolution — resolved 미설정 시 false 로 정규화 (truthy coerce)', () => {
  const planBody = {
    risks: [{ risk: 'r' }, { risk: 'r2', resolved: undefined }, { risk: 'r3', resolved: 1 }],
    openQuestions: [{ text: 'q' }],
  };
  annotateResolution(planBody);
  assert.equal(planBody.risks[0].resolved, false);
  assert.equal(planBody.risks[1].resolved, false);
  assert.equal(planBody.risks[2].resolved, true);
  assert.equal(planBody.openQuestions[0].resolved, false);
});

test('annotateResolution — 추정 0: status/ledger 무관, 마커 flag 만 신뢰', () => {
  // resolved flag 가 없는 항목은 milestone status 가 무엇이든 active 유지.
  const planBody = {
    risks: [{ risk: 'r', planStatus: 'complete' }],
    openQuestions: [{ text: 'q', milestoneComplete: true }],
  };
  annotateResolution(planBody);
  assert.equal(planBody.risks[0].resolved, false);
  assert.equal(planBody.openQuestions[0].resolved, false);
});

test('annotateResolution — fail-open on null/non-object/빈 배열', () => {
  assert.equal(annotateResolution(null), null);
  assert.equal(annotateResolution(42), 42);
  const empty = { risks: [], openQuestions: [] };
  assert.deepEqual(annotateResolution(empty), { risks: [], openQuestions: [] });
});

test('annotateResolution — 손상 배열 요소 건너뜀(throw 안 함)', () => {
  const planBody = {
    risks: [null, { risk: 'ok', resolved: true }, 'string-item'],
    openQuestions: [undefined, { text: 'ok-q', resolved: true }],
  };
  // throw 안 하고 정상 항목만 정규화.
  annotateResolution(planBody);
  assert.equal(planBody.risks[1].resolved, true);
  assert.equal(planBody.openQuestions[1].resolved, true);
});
