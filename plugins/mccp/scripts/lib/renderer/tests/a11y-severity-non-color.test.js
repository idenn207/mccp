'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');
const formatUtils = require('../format-utils');

const SEVERITY_ICONS = ['🔴', '🟠', '🟡', '⚪'];
const SEVERITY_LABELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// Extract all <span class="severity-tag …">…</span> blocks honoring nested
// <span class="icon">. Color-only surfaces are color-blindness-hostile, so
// the lint blocks ship if any tag is missing icon or text.
function extractSeverityTags(html) {
  const tags = [];
  const openRe = /<span class="severity-tag[^"]*"[^>]*>/g;
  let m;
  while ((m = openRe.exec(html)) !== null) {
    const start = m.index;
    let depth = 1;
    let i = start + m[0].length;
    while (i < html.length && depth > 0) {
      const next = html.indexOf('<', i);
      if (next === -1) break;
      if (html.startsWith('<span', next)) {
        depth++;
        i = next + 5;
      } else if (html.startsWith('</span>', next)) {
        depth--;
        i = next + 7;
        if (depth === 0) {
          tags.push(html.slice(start, i));
          break;
        }
      } else {
        i = next + 1;
      }
    }
  }
  return tags;
}

function assertNonColor(tag, label) {
  const hasIcon = SEVERITY_ICONS.some(i => tag.includes(i));
  const hasText = SEVERITY_LABELS.some(t => tag.includes(t));
  assert.ok(
    hasIcon || hasText,
    label + ' — severity tag color-only: ' + tag.slice(0, 120),
  );
  // We actually require both for redundancy
  assert.ok(hasIcon, label + ' — missing icon: ' + tag.slice(0, 120));
  assert.ok(hasText, label + ' — missing text label: ' + tag.slice(0, 120));
}

for (const sev of SEVERITY_LABELS) {
  test('OQ ' + sev + ' — severity tag has both icon and text', () => {
    const planBody = {
      openQuestions: [{
        text: 'item',
        source: 'p.plan.md',
        lineNumber: 1,
        headingPath: ['## Open Questions'],
        severity: sev,
      }],
    };
    const { html } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
    const tags = extractSeverityTags(html);
    assert.ok(tags.length >= 1, 'OQ ' + sev + ' — at least one severity tag');
    for (const tag of tags) assertNonColor(tag, 'OQ ' + sev);
  });
}

test('Risk CRITICAL/HIGH/MEDIUM/LOW — all severity tags non-color-only', () => {
  const planBody = {
    risks: [
      { risk: 'r1', impact: 'Critical', likelihood: 'Critical' },
      { risk: 'r2', impact: 'High', likelihood: 'High' },
      { risk: 'r3', impact: 'Medium', likelihood: 'Medium' },
      { risk: 'r4', impact: 'Low', likelihood: 'Low' },
    ],
  };
  const { html } = renderRisks({ sources: {} }, formatUtils, planBody);
  const tags = extractSeverityTags(html);
  assert.ok(tags.length >= 4, 'at least 4 risk severity tags');
  for (const tag of tags) assertNonColor(tag, 'Risk');
});
