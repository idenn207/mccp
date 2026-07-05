'use strict';

// plan-fanout Task 3 validate — deterministic markdown assembly, partial
// (agent-null) tolerance, and the all-null honest fallback sentinel.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  synthesizeFanout,
  SECTION_HEADING,
  NO_PERSPECTIVES_SENTINEL,
} = require('../synthesize');

function perspective(key, sev) {
  return {
    perspective: key,
    findings: [{ claim: key + ' claim', evidence: 'file.js:1', severity: sev }],
    metaGaps: [key + ' gap'],
    patternsToMirror: [key + ' pattern:2'],
  };
}

test('4 perspectives assemble into the section with 4/4 coverage', function () {
  const md = synthesizeFanout({
    perspectives: [
      perspective('architect', 'MEDIUM'),
      perspective('security', 'CRITICAL'),
      perspective('test', 'LOW'),
      perspective('explorer', 'HIGH'),
    ],
    spent: 320000,
    budgetTotal: 1200000,
  });
  assert.match(md, new RegExp('^' + SECTION_HEADING.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));
  assert.match(md, /\*\*Coverage\*\*: 4\/4 perspectives/);
  assert.match(md, /architect, security, test, explorer/);
  assert.match(md, /spent ~320k \/ budget ~1200k/);
  assert.match(md, /### Findings \(severity-ranked\)/);
  assert.match(md, /### Meta-gaps/);
  assert.match(md, /### Patterns to mirror/);
});

test('findings are severity-ranked (CRITICAL before HIGH before LOW)', function () {
  const md = synthesizeFanout({
    perspectives: [
      perspective('test', 'LOW'),
      perspective('security', 'CRITICAL'),
      perspective('explorer', 'HIGH'),
    ],
  });
  const iCrit = md.indexOf('[CRITICAL]');
  const iHigh = md.indexOf('[HIGH]');
  const iLow = md.indexOf('[LOW]');
  assert.ok(iCrit !== -1 && iHigh !== -1 && iLow !== -1);
  assert.ok(iCrit < iHigh, 'CRITICAL before HIGH');
  assert.ok(iHigh < iLow, 'HIGH before LOW');
});

test('partial result (2/4 null) assembles with 2/4 coverage', function () {
  const md = synthesizeFanout({
    perspectives: [perspective('architect', 'HIGH'), null, perspective('test', 'MEDIUM'), null],
    spent: 90000,
  });
  assert.match(md, /\*\*Coverage\*\*: 2\/4 perspectives \(architect, test\)/);
  assert.match(md, /spent ~90k\./);
  assert.doesNotMatch(md, /budget/);
});

test('all-null → honest fallback sentinel (caller inline fallback signal)', function () {
  const md = synthesizeFanout({ perspectives: [null, null, null, null] });
  assert.ok(md.indexOf(NO_PERSPECTIVES_SENTINEL) !== -1);
  assert.match(md, new RegExp(SECTION_HEADING.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));
});

test('empty / missing perspectives array → fallback sentinel', function () {
  assert.ok(synthesizeFanout({}).indexOf(NO_PERSPECTIVES_SENTINEL) !== -1);
  assert.ok(synthesizeFanout({ perspectives: [] }).indexOf(NO_PERSPECTIVES_SENTINEL) !== -1);
});

test('meta-gaps + patterns are unioned and perspective-tagged', function () {
  const md = synthesizeFanout({
    perspectives: [
      { perspective: 'architect', findings: [], metaGaps: ['shared gap'], patternsToMirror: [] },
      { perspective: 'security', findings: [], metaGaps: ['shared gap', 'sec gap'], patternsToMirror: [] },
    ],
  });
  // 'shared gap' appears from two perspectives but tagged distinctly; 'sec gap' once.
  assert.match(md, /shared gap {2}_\(architect\)_/);
  assert.match(md, /shared gap {2}_\(security\)_/);
  assert.match(md, /sec gap {2}_\(security\)_/);
});

test('spent omitted → n/a token summary, never throws', function () {
  const md = synthesizeFanout({ perspectives: [perspective('architect', 'LOW')] });
  assert.match(md, /spent n\/a\./);
});
