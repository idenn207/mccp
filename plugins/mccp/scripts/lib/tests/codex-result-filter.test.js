'use strict';

// v0.3.6 Task 2 (축 1b) tests — codex-result-filter.
//
// Fixture strategy: hand-crafted findings arrays exercising every branch of
// filterDesignFindings (impeccable on/off, design/a11y match per field, word
// boundary safety, malformed input). computeDroppedDigest gets stability +
// content-sensitivity tests.

const test = require('node:test');
const assert = require('node:assert');

const filter = require('../codex-result-filter');
const {
  filterDesignFindings,
  computeDroppedDigest,
  isDesignFinding,
  isA11yFinding,
  DESIGN_KEYWORDS,
  A11Y_KEYWORDS,
} = filter;

function f(category, text, severity) {
  return { category: category, text: text, severity: severity || 'HIGH' };
}

// ---- filterDesignFindings: impeccable=false (identity pass-through) -------

test('filterDesignFindings: impeccable=false → identity (all findings preserved, counter 0)', () => {
  const input = { findings: [f('visual design', 'color contrast'), f('security', 'sql injection')] };
  const r = filterDesignFindings(input, { impeccableAvailable: false });
  assert.strictEqual(r.filteredFindings.length, 2);
  assert.strictEqual(r.droppedFindings.length, 0);
  assert.strictEqual(r.a11yRoutedCount, 0);
});

test('filterDesignFindings: no opts → identity', () => {
  const input = { findings: [f('visual design', 'color')] };
  const r = filterDesignFindings(input);
  assert.strictEqual(r.filteredFindings.length, 1);
  assert.strictEqual(r.droppedFindings.length, 0);
});

test('filterDesignFindings: strict === true gate (truthy strings do not trigger)', () => {
  const input = { findings: [f('color', 'palette')] };
  for (const v of ['1', 'true', 1, {}, [], 'yes']) {
    const r = filterDesignFindings(input, { impeccableAvailable: v });
    assert.strictEqual(r.filteredFindings.length, 1,
      'expected pass-through for impeccableAvailable=' + JSON.stringify(v));
    assert.strictEqual(r.droppedFindings.length, 0);
  }
});

// ---- filterDesignFindings: impeccable=true core matrix ------------------

test('filterDesignFindings: impeccable=true drops design finding via category match', () => {
  const input = { findings: [f('visual design', 'something'), f('security', 'sql injection')] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 1);
  assert.strictEqual(r.filteredFindings[0].category, 'security');
  assert.strictEqual(r.droppedFindings.length, 1);
  assert.strictEqual(r.droppedFindings[0].category, 'visual design');
  assert.strictEqual(r.a11yRoutedCount, 0);
});

test('filterDesignFindings: impeccable=true drops design finding via text match', () => {
  const input = { findings: [f('quality', 'typography is inconsistent'), f('security', 'XSS')] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 1);
  assert.strictEqual(r.filteredFindings[0].category, 'security');
  assert.strictEqual(r.droppedFindings.length, 1);
});

test('filterDesignFindings: impeccable=true drops a11y finding + a11yRoutedCount++', () => {
  const input = { findings: [f('a11y', 'missing aria-label'), f('security', 'sql injection')] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 1);
  assert.strictEqual(r.droppedFindings.length, 1);
  assert.strictEqual(r.a11yRoutedCount, 1);
});

test('filterDesignFindings: impeccable=true counts a11y separately from design (priority a11y)', () => {
  // A finding mentioning both a11y AND color — a11y takes priority for counter
  const input = { findings: [f('a11y', 'color contrast WCAG fail')] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.droppedFindings.length, 1);
  assert.strictEqual(r.a11yRoutedCount, 1, 'a11y match takes priority over design');
});

test('filterDesignFindings: impeccable=true preserves non-design non-a11y findings', () => {
  const input = {
    findings: [
      f('security', 'sql injection'),
      f('performance', 'N+1 query'),
      f('correctness', 'race condition in lock helper'),
    ],
  };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 3);
  assert.strictEqual(r.droppedFindings.length, 0);
  assert.strictEqual(r.a11yRoutedCount, 0);
});

test('filterDesignFindings: mixed array — design + a11y + security all routed correctly', () => {
  const input = {
    findings: [
      f('visual design', 'spacing rhythm'),
      f('a11y', 'keyboard navigation broken'),
      f('security', 'CSRF token missing'),
      f('quality', 'typography ladder inconsistent'),
      f('a11y', 'WCAG 2.2 violation in tab order'),
      f('correctness', 'off-by-one'),
    ],
  };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 2);
  assert.deepStrictEqual(r.filteredFindings.map(x => x.category), ['security', 'correctness']);
  assert.strictEqual(r.droppedFindings.length, 4);
  assert.strictEqual(r.a11yRoutedCount, 2);
});

test('filterDesignFindings: case insensitive — uppercase keywords match', () => {
  const input = {
    findings: [
      f('Visual Design', 'X'),
      f('quality', 'TYPOGRAPHY ladder'),
      f('A11Y', 'aria-label gone'),
    ],
  };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 0);
  assert.strictEqual(r.droppedFindings.length, 3);
  assert.strictEqual(r.a11yRoutedCount, 1);
});

// ---- filterDesignFindings: word-boundary safety -------------------------

test('filterDesignFindings: word-boundary — "scolor" does NOT match color', () => {
  const input = { findings: [f('quality', 'localcolor variable naming')] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 1, 'localcolor must not match \\bcolor\\b');
  assert.strictEqual(r.droppedFindings.length, 0);
});

test('filterDesignFindings: word-boundary — "branding-team" does NOT match brand', () => {
  // 'branding' has 'brand' as prefix. With \b boundary on both sides, brand
  // followed by 'ing' should NOT match. Verify our regex is strict.
  const input = { findings: [f('process', 'branding-team approved the PR')] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  // 'brand' word-boundary should NOT match 'branding' because 'd' followed by 'i' has no boundary
  assert.strictEqual(r.filteredFindings.length, 1, 'branding must not match \\bbrand\\b');
});

test('filterDesignFindings: word-boundary — "scaria" does NOT match aria', () => {
  const input = { findings: [f('quality', 'macaria-style helper')] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 1);
  assert.strictEqual(r.a11yRoutedCount, 0);
});

test('filterDesignFindings: micro-interaction matches both hyphen and space variants', () => {
  const input = {
    findings: [
      f('ux', 'micro-interaction feedback'),
      f('ux', 'micro interaction loop'),
    ],
  };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.droppedFindings.length, 2);
});

// ---- filterDesignFindings: malformed input graceful ---------------------

test('filterDesignFindings: malformed input — null → safe empty', () => {
  const r = filterDesignFindings(null, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 0);
  assert.strictEqual(r.droppedFindings.length, 0);
  assert.strictEqual(r.a11yRoutedCount, 0);
});

test('filterDesignFindings: malformed input — non-object → safe empty', () => {
  const r1 = filterDesignFindings('not an object', { impeccableAvailable: true });
  assert.strictEqual(r1.filteredFindings.length, 0);
  const r2 = filterDesignFindings(42, { impeccableAvailable: true });
  assert.strictEqual(r2.filteredFindings.length, 0);
});

test('filterDesignFindings: malformed input — missing findings key → safe empty', () => {
  const r = filterDesignFindings({ other: 'fields' }, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 0);
});

test('filterDesignFindings: malformed input — findings is not array → safe empty', () => {
  const r = filterDesignFindings({ findings: 'not an array' }, { impeccableAvailable: true });
  assert.strictEqual(r.filteredFindings.length, 0);
});

test('filterDesignFindings: malformed finding entries — null/string items skipped', () => {
  const input = { findings: [null, 'string', { category: 'security', text: 'real one' }, 42] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  // null/string/42 are not isDesignFinding nor isA11yFinding (both return false on bad input)
  // → they fall through to filteredFindings (pass-through). Caller decides what to do.
  assert.strictEqual(r.filteredFindings.length, 4);
  assert.strictEqual(r.droppedFindings.length, 0);
});

// ---- isDesignFinding / isA11yFinding direct unit -----------------------

test('isDesignFinding: matches category or text', () => {
  assert.strictEqual(isDesignFinding(f('color', 'x')), true);
  assert.strictEqual(isDesignFinding(f('security', 'animation timing')), true);
  assert.strictEqual(isDesignFinding(f('security', 'sql injection')), false);
});

test('isDesignFinding: bad input → false', () => {
  assert.strictEqual(isDesignFinding(null), false);
  assert.strictEqual(isDesignFinding('not an object'), false);
  assert.strictEqual(isDesignFinding({}), false);
});

test('isA11yFinding: matches category or text', () => {
  assert.strictEqual(isA11yFinding(f('a11y', 'x')), true);
  assert.strictEqual(isA11yFinding(f('quality', 'aria-hidden=true')), true);
  assert.strictEqual(isA11yFinding(f('quality', 'no a11y signal here, sorry')), true);
  assert.strictEqual(isA11yFinding(f('security', 'sql injection')), false);
});

// ---- computeDroppedDigest -----------------------------------------------

test('computeDroppedDigest: empty array → null', () => {
  assert.strictEqual(computeDroppedDigest([]), null);
});

test('computeDroppedDigest: non-array → null', () => {
  assert.strictEqual(computeDroppedDigest(null), null);
  assert.strictEqual(computeDroppedDigest('not array'), null);
});

test('computeDroppedDigest: all entries malformed → null', () => {
  assert.strictEqual(computeDroppedDigest([null, 'string', 42]), null);
});

test('computeDroppedDigest: stable hash with sha256: prefix for same input', () => {
  const findings = [f('color', 'A'), f('typography', 'B')];
  const h1 = computeDroppedDigest(findings);
  const h2 = computeDroppedDigest(findings);
  assert.strictEqual(typeof h1, 'string');
  assert.ok(h1.startsWith('sha256:'), 'digest must carry sha256: prefix (codebase convention)');
  assert.strictEqual(h1.length, 71, 'sha256: + 64 hex = 71 chars');
  assert.strictEqual(h1, h2);
});

test('computeDroppedDigest: different input → different hash', () => {
  const h1 = computeDroppedDigest([f('color', 'A')]);
  const h2 = computeDroppedDigest([f('color', 'B')]);
  assert.notStrictEqual(h1, h2);
});

test('computeDroppedDigest: prefers text over category when both present', () => {
  // text='A' should hash to same value whether category is 'foo' or 'bar'
  const h1 = computeDroppedDigest([{ category: 'foo', text: 'A' }]);
  const h2 = computeDroppedDigest([{ category: 'bar', text: 'A' }]);
  assert.strictEqual(h1, h2);
});

test('computeDroppedDigest: falls back to category when text empty/missing', () => {
  const h1 = computeDroppedDigest([{ category: 'visual design' }]);
  const h2 = computeDroppedDigest([{ category: 'visual design', text: '' }]);
  assert.strictEqual(typeof h1, 'string');
  assert.strictEqual(h1, h2, 'empty text and missing text should yield same digest');
});

// ---- Exported keyword lists are frozen (codebase Object.freeze pattern) --

test('DESIGN_KEYWORDS and A11Y_KEYWORDS are frozen arrays', () => {
  assert.strictEqual(Object.isFrozen(DESIGN_KEYWORDS), true);
  assert.strictEqual(Object.isFrozen(A11Y_KEYWORDS), true);
});

// ---- v1.13.0 M3: a11yFindings array (supplementary input for a11y-architect) --

test('M3 a11yFindings: array equals a11yRoutedCount, excludes design + passthrough', () => {
  const input = { findings: [
    f('a11y', 'aria-label missing on icon button'),
    f('accessibility', 'keyboard navigation broken'),
    f('color', 'low contrast on muted text'),
    f('logic', 'off-by-one in loop'),
  ] };
  const r = filterDesignFindings(input, { impeccableAvailable: true });
  assert.strictEqual(r.a11yFindings.length, 2, 'two a11y findings captured');
  assert.strictEqual(r.a11yFindings.length, r.a11yRoutedCount, 'array length == count (never drift)');
  // design finding dropped but NOT in a11yFindings
  assert.ok(r.a11yFindings.every((x) => x.category !== 'color'), 'design finding not in a11yFindings');
  // non-design/non-a11y passes through
  assert.strictEqual(r.filteredFindings.length, 1);
  assert.strictEqual(r.filteredFindings[0].category, 'logic');
});

test('M3 a11yFindings: impeccable unavailable → empty array (identity path)', () => {
  const r = filterDesignFindings({ findings: [f('a11y', 'x')] }, { impeccableAvailable: false });
  assert.deepStrictEqual(r.a11yFindings, []);
  assert.strictEqual(r.a11yRoutedCount, 0);
});

test('M3 a11yFindings: empty findings → empty array', () => {
  const r = filterDesignFindings({ findings: [] }, { impeccableAvailable: true });
  assert.deepStrictEqual(r.a11yFindings, []);
});

test('M3 a11yFindings: EMPTY_RESULT carries a11yFindings key', () => {
  assert.deepStrictEqual(filter.EMPTY_RESULT.a11yFindings, []);
});
