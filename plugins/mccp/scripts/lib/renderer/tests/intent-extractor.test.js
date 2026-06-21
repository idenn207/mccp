'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractIntent, extractIntentFromPath, MAX_LEN } = require('../parsers/intent-extractor');

test('PRD ## Hypothesis 첫 줄 추출', () => {
  const body = [
    '# PRD',
    '',
    '## Hypothesis',
    '',
    'dashboard 6축 surface 시 5초 안에 무엇을 할지 안다.',
    '',
    '## Problem',
    'fallback content',
  ].join('\n');
  const out = extractIntent(body);
  assert.equal(out, 'dashboard 6축 surface 시 5초 안에 무엇을 할지 안다.');
});

test('PRD ## Problem fallback (Hypothesis 없을 때)', () => {
  const body = [
    '# PRD',
    '',
    '## Problem',
    '',
    'STATUS.md surface가 5초 안에 의사결정 가능하지 않다.',
  ].join('\n');
  const out = extractIntent(body);
  assert.equal(out, 'STATUS.md surface가 5초 안에 의사결정 가능하지 않다.');
});

test('plan ## Summary 첫 문장', () => {
  const body = [
    '# Plan',
    '',
    '## Summary',
    '',
    'M2 5축을 단일 commit chunk로 정리한다.',
    '',
    '## Patterns to Mirror',
  ].join('\n');
  const out = extractIntent(body);
  assert.equal(out, 'M2 5축을 단일 commit chunk로 정리한다.');
});

test('60자 cap with ellipsis', () => {
  const long = '가'.repeat(100);
  const body = '## Summary\n\n' + long + '\n';
  const out = extractIntent(body);
  assert.ok(out.length <= MAX_LEN);
  assert.ok(out.endsWith('…'));
});

test('exception → null fallback', () => {
  assert.equal(extractIntent(null), null);
  assert.equal(extractIntent(''), null);
  assert.equal(extractIntent('no headings here'), null);
  // path 비존재 → null
  const v = extractIntentFromPath('/no/such/path/xyz.md');
  assert.equal(v, null);
});
