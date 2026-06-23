'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');
const formatUtils = require('../format-utils');

const SEVERITY_LABELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEV_TEXTS = ['CRIT', 'HIGH', 'MED', 'LOW'];

// v1.18.0 M2 — sample `.sev` badge. Severity is conveyed by a visible TEXT
// label (CRIT/HIGH/MED/LOW) plus an aria-label, never by color alone. Extract
// each `<span class="sev …">TEXT</span>` and assert text + aria-label present.
function extractSevBadges(html) {
  const tags = [];
  const re = /<span class="sev [^"]*"[^>]*>[\s\S]*?<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null) tags.push(m[0]);
  return tags;
}

function assertNonColor(tag, label) {
  const hasText = SEV_TEXTS.some(t => tag.includes('>' + t + '<') || tag.includes(t));
  assert.ok(hasText, label + ' — sev badge missing text label: ' + tag.slice(0, 120));
  assert.ok(/aria-label="위험도:/.test(tag), label + ' — sev badge missing aria-label: ' + tag.slice(0, 120));
}

for (const sev of SEVERITY_LABELS) {
  test('OQ ' + sev + ' — sev badge conveys severity by text + aria-label (non-color)', () => {
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
    const tags = extractSevBadges(html);
    assert.ok(tags.length >= 1, 'OQ ' + sev + ' — at least one sev badge');
    for (const tag of tags) assertNonColor(tag, 'OQ ' + sev);
  });
}

test('Risk CRITICAL/HIGH/MEDIUM/LOW — all sev badges non-color-only', () => {
  const planBody = {
    risks: [
      { risk: 'r1', impact: 'Critical', likelihood: 'Critical' },
      { risk: 'r2', impact: 'High', likelihood: 'High' },
      { risk: 'r3', impact: 'Medium', likelihood: 'Medium' },
      { risk: 'r4', impact: 'Low', likelihood: 'Low' },
    ],
  };
  const { html } = renderRisks({ sources: {} }, formatUtils, planBody);
  const tags = extractSevBadges(html);
  assert.ok(tags.length >= 4, 'at least 4 risk sev badges');
  for (const tag of tags) assertNonColor(tag, 'Risk');
});
