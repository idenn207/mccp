'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus, safeFallback } = require('../index');

test('renderStatus(null) returns safeFallback shape with red verdict', () => {
  const r = renderStatus(null);
  assert.equal(typeof r.md, 'string');
  assert.equal(typeof r.html, 'string');
  assert.ok(r.md.length > 0, 'md non-empty');
  assert.ok(r.html.length > 0, 'html non-empty');
});

test('renderStatus({}) renders idle verdict without throwing', () => {
  const r = renderStatus({});
  assert.equal(r.verdict.tone, 'muted');
  assert.match(r.md, /no in-flight signal/);
});

test('markdown composer thrown via opts inject → safeFallback md side, valid html', () => {
  const r = renderStatus({ sources: {} }, { _injectComposerThrow: 'markdown' });
  assert.match(r.md, /markdown composer failed/);
  assert.match(r.html, /<!doctype html>/);
});

test('html composer thrown via opts inject → md still valid', () => {
  const r = renderStatus({ sources: {} }, { _injectComposerThrow: 'html' });
  assert.match(r.md, /# mccp 상태/);
  assert.match(r.html, /html composer failed/);
});

test('safeFallback returns full shape with red verdict', () => {
  const r = safeFallback(new Error('boom'));
  assert.equal(r.verdict.tone, 'red');
  assert.match(r.verdict.text, /render failed/);
  assert.match(r.md, /🚫 render failed/);
  assert.match(r.html, /render failed/);
});
