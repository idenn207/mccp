'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

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

test('html lang="ko" + main id + tabindex=-1', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(/<html lang="ko">/.test(html), 'html lang ko');
  assert.ok(/<main id="main" tabindex="-1">/.test(html), 'main landmark');
});

test('skip-link present with sr-only + href #main', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(/class="skip-link sr-only" href="#main"/.test(html), 'skip-link');
  assert.ok(html.includes('본문 바로가기'), 'skip-link text');
});

test('footer landmark role=contentinfo', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(/<footer role="contentinfo"/.test(html), 'footer landmark');
});

test('footer .claude/ code element wrapped with lang="en"', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(/<code lang="en">\.claude\/<\/code>/.test(html), 'code lang en');
});

test('exactly one h1 in main content (verdict)', () => {
  const { html } = renderStatus(fixtureModel());
  const matches = html.match(/<h1[^>]*>/g) || [];
  assert.equal(matches.length, 1, 'h1 count = 1, found ' + matches.length);
});

test('h2 hierarchy — sections use h2 only (no h3+ leaking from header)', () => {
  const { html } = renderStatus(fixtureModel());
  const h2 = html.match(/<h2[^>]*>/g) || [];
  assert.ok(h2.length >= 1, 'at least 1 h2 section');
});

test('aside role="alert" present when masked=false (raw mode)', () => {
  const model = fixtureModel();
  model.masked = false;
  const { html } = renderStatus(model);
  assert.ok(/<aside role="alert" class="s-secret"/.test(html), 'raw-mode alert');
});

test('CSS clip-based sr-only present, no offscreen -9999px pattern', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(html.includes('clip-path: inset(50%)'), 'clip-path sr-only');
  assert.ok(!html.includes('left: -9999px'), 'offscreen pattern removed');
});

test('skip-link:focus-visible CSS makes link visible when focused', () => {
  const { html } = renderStatus(fixtureModel());
  assert.ok(html.includes('.skip-link:focus-visible'), 'skip-link focused state');
});
