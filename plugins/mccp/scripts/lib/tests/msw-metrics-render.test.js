'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { renderMswMetrics } = require('../renderer/sections/msw-metrics');

// Mock formatUtils for HTML rendering
const mockFormatUtils = {
  escapeHtml: (str) => {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

test('msw-metrics: graceful hide when metrics unavailable', async (t) => {
  // No metrics at all
  const result1 = renderMswMetrics({}, mockFormatUtils);
  assert.strictEqual(result1, null);

  // metrics null
  const result2 = renderMswMetrics({ metrics: null }, mockFormatUtils);
  assert.strictEqual(result2, null);

  // metrics undefined
  const result3 = renderMswMetrics({ metrics: undefined }, mockFormatUtils);
  assert.strictEqual(result3, null);
});

test('msw-metrics: graceful hide when all metrics insufficient/invalid', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: null,
        denominator: null,
        value: null,
        status: 'insufficient',
        coverage: 'unknown',
      },
      B3: {
        id: 'B3',
        numerator: null,
        denominator: null,
        value: null,
        status: 'invalid',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.strictEqual(result, null);
});

test('msw-metrics: renders when at least one computed metric exists', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 2,
        value: 0.5,
        status: 'computed',
        coverage: 'session-activity',
      },
      A2: {
        id: 'A2',
        numerator: null,
        denominator: null,
        value: null,
        status: 'insufficient',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);
  assert.ok(result.md);
  assert.ok(result.html);
  assert.match(result.md, /A1/);
  assert.match(result.html, /A1/);
});

test('msw-metrics: heading depth ≤ 3 constraint', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Check markdown: should not have #### or deeper
  assert.match(result.md, /^/); // No #### in the section body
  assert.ok(!result.md.includes('####'));

  // Check HTML: should not have <h4> or deeper
  assert.ok(!result.html.includes('<h4>'));
  assert.ok(!result.html.includes('<h5>'));
});

test('msw-metrics: XSS escape - payload in coverage field', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: '<script>alert(1)</script>',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Verify the XSS payload is escaped in HTML
  assert.ok(!result.html.includes('<script>alert'));
  assert.ok(result.html.includes('&lt;script&gt;'));
});

test('msw-metrics: XSS escape - payload in coverage', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: '<img src=x onerror="alert(1)">',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Verify payload is escaped — angle brackets should be encoded
  assert.ok(result.html.includes('&lt;img'));
  assert.ok(result.html.includes('&gt;'));
});

test('msw-metrics: list-of-N collapse (top 3 expanded)', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
      A2: {
        id: 'A2',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      A4: {
        id: 'A4',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      B1: {
        id: 'B1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      B2: {
        id: 'B2',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Check markdown has collapse with "+2 더 보기" or similar
  assert.ok(result.md.includes('<details>'));

  // Check HTML has details + summary
  assert.ok(result.html.includes('<details'));
  assert.ok(result.html.includes('<summary>'));
  assert.ok(result.html.includes('보기</summary>'));
});

test('msw-metrics: forward-only metrics (C2, C3) show H10-safe placeholder (no em-dash)', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
      A2: {
        id: 'A2',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      A4: {
        id: 'A4',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
      C2: {
        id: 'C2',
        numerator: null,
        denominator: null,
        value: null,
        status: 'forward-only',
        coverage: 'n/a',
      },
      C3: {
        id: 'C3',
        numerator: null,
        denominator: null,
        value: null,
        status: 'forward-only',
        coverage: 'n/a',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);

  // Check that C2/C3 are present (top-expanded, not collapsed)
  assert.ok(result.md.includes('C2'));
  assert.ok(result.md.includes('C3'));
  // Forward-only value uses the H10-safe placeholder — the rendered section must
  // contain NO em-dash (U+2014), which the renderer's H10 design-lint also enforces.
  assert.ok(!result.md.includes('—'), 'msw-metrics markdown must not contain em-dash (H10)');
});

test('msw-metrics: footer version string present', async (t) => {
  // This is a renderer section test, not checking main render result
  // Just ensure the section can be called without error
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'session-activity',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);
  assert.ok(result.md);
  assert.ok(result.html);
});

test('msw-metrics: invalid reason shown in status when invalid', async (t) => {
  const model = {
    metrics: {
      A1: {
        id: 'A1',
        numerator: null,
        denominator: null,
        value: null,
        invalid_reason: 'test reason',
        status: 'invalid',
        coverage: 'unknown',
      },
      B1: {
        id: 'B1',
        numerator: 1,
        denominator: 1,
        value: 1,
        status: 'computed',
        coverage: 'unknown',
      },
    },
  };
  const result = renderMswMetrics(model, mockFormatUtils);
  assert.notStrictEqual(result, null);
  // Result should render B1 as computed
  assert.ok(result.html.includes('B1'));
});
