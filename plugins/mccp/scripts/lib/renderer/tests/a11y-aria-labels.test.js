'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');
const { severityMeta, severityTagHtml } = require('../parsers/severity-meta');
const formatUtils = require('../format-utils');

function fixtureModel() {
  return {
    derived_at: new Date().toISOString(),
    masked: true,
    sources: {
      plans: { items: [] },
      receipts: { items: [] },
      state: { item: null },
      backlog: { items: [] },
      fixTask: { item: null },
      envelopes: { items: [] },
    },
  };
}

test('severity-meta 5 enum — visible + srLabel + className + icon all present', () => {
  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']) {
    const meta = severityMeta(sev);
    assert.equal(typeof meta.visible, 'string', sev + ' visible');
    assert.equal(typeof meta.srLabel, 'string', sev + ' srLabel');
    assert.equal(typeof meta.className, 'string', sev + ' className');
    assert.equal(typeof meta.icon, 'string', sev + ' icon');
    assert.ok(meta.srLabel.length > 0, sev + ' srLabel non-empty');
    assert.ok(meta.visible.length > 0, sev + ' visible non-empty');
  }
});

test('severity-meta fallback — invalid input → UNKNOWN', () => {
  const meta = severityMeta('not-a-severity');
  assert.equal(meta.className, 's-unknown');
  assert.equal(meta.srLabel, '미상');
});

test('severityTagHtml — aria-label Korean prefix + visible English + icon aria-hidden', () => {
  const html = severityTagHtml('CRITICAL', formatUtils.escapeHtml);
  assert.ok(html.includes('aria-label="위험도: 최고"'), 'aria-label Korean');
  assert.ok(html.includes('CRITICAL'), 'visible English');
  assert.ok(html.includes('aria-hidden="true"'), 'icon hidden');
  assert.ok(html.includes('s-critical'), 'className');
});

test('OQ severity-tag uses Korean aria-label + visible English', () => {
  const planBody = {
    openQuestions: [{
      text: 'test (HIGH)',
      source: 'p.plan.md',
      lineNumber: 1,
      headingPath: ['## Open Questions'],
      severity: 'HIGH',
    }],
  };
  const { html } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  assert.ok(html.includes('aria-label="위험도: 높음"'), 'OQ HIGH aria-label Korean');
  assert.ok(html.includes('HIGH'), 'OQ visible English');
});

test('Risk severity-tag uses Korean aria-label + visible English', () => {
  const planBody = {
    risks: [{ risk: 'r', impact: 'Critical', likelihood: 'High' }],
  };
  const { html } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.ok(html.includes('aria-label="위험도: 최고"'), 'Risk CRITICAL aria-label Korean');
  assert.ok(html.includes('CRITICAL'), 'Risk visible English');
});

test('copy-btn aria-label is Korean fixed string ("다음 액션 복사")', () => {
  const planBody = {
    openQuestions: [{
      text: 'item with very long text spelled out for emulation',
      source: 'p.plan.md',
      lineNumber: 1,
      headingPath: ['## Open Questions'],
    }],
  };
  const { html } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  assert.ok(html.includes('aria-label="다음 액션 복사"'), 'OQ copy-btn aria-label');
  const riskHtml = renderRisks(
    { sources: {} },
    formatUtils,
    { risks: [{ risk: 'r', impact: 'Low', likelihood: 'Low' }] },
  ).html;
  assert.ok(riskHtml.includes('aria-label="다음 액션 복사"'), 'Risk copy-btn aria-label');
});

test('status-strip group has tabindex=0 + dynamic aria-label with 현황 4축 prefix', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(/class="status-strip" role="group" tabindex="0"/.test(html), 'group + tabindex');
  assert.ok(/aria-label="현황 4축/.test(html), 'aria-label prefix');
});

test('status-strip cell icon has aria-hidden="true"', () => {
  const { html } = renderStatus(fixtureModel());
  const count = (html.match(/<span class="icon" aria-hidden="true">/g) || []).length;
  assert.ok(count >= 4, 'at least 4 cell icons hidden, found ' + count);
});

test('no legacy "심각도:" prefix anywhere (M3 retired mixed-language)', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(!html.includes('aria-label="심각도:'), 'no legacy 심각도 mixed-language label');
});
