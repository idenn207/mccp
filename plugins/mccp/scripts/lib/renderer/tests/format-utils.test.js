'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatRelativeTime,
  formatStatusBadge,
  mask,
  escapeHtml,
  escapeAttr,
  STATUS_BADGES,
} = require('../format-utils');

test('formatRelativeTime — bins', () => {
  const now = 1_000_000_000_000;
  assert.equal(formatRelativeTime(new Date(now), now), '방금');
  assert.equal(formatRelativeTime(new Date(now - 30_000), now), '30초 전');
  assert.equal(formatRelativeTime(new Date(now - 5 * 60_000), now), '5분 전');
  assert.equal(formatRelativeTime(new Date(now - 3 * 3600_000), now), '3시간 전');
  assert.equal(formatRelativeTime(new Date(now - 2 * 86400_000), now), '2일 전');
});

test('formatRelativeTime — invalid + future', () => {
  assert.equal(formatRelativeTime(null), '시각 불명');
  assert.equal(formatRelativeTime('not-a-date'), '시각 불명');
  const now = 1_000_000_000_000;
  assert.equal(formatRelativeTime(new Date(now + 60_000), now), '미래');
});

test('formatStatusBadge — all 9 kinds resolve', () => {
  const kinds = [
    'blocked', 'stale', 'secret-warn',
    'worker-alive', 'worker-stale',
    'terminal-ok', 'terminal-failure',
    'in-progress', 'neutral',
  ];
  for (const k of kinds) {
    const b = formatStatusBadge(k);
    assert.equal(typeof b.text, 'string');
    assert.equal(typeof b.icon, 'string');
    assert.equal(typeof b.korean, 'string');
    assert.ok(b.colorToken.startsWith('--'), 'colorToken is CSS var name');
    assert.ok(['icon', 'text', 'both'].includes(b.appliesTo));
  }
  assert.equal(formatStatusBadge('stale').appliesTo, 'icon', 'amber tokens icon-only (impeccable P1)');
  assert.equal(formatStatusBadge('worker-stale').appliesTo, 'icon');
});

test('formatStatusBadge — throw on unknown', () => {
  assert.throws(() => formatStatusBadge('not-a-kind'), /unknown kind/);
});

test('mask — passthrough when masked=true, prepend warning when masked=false', () => {
  assert.equal(mask('hello', { masked: true }), 'hello');
  assert.equal(mask('hello', { masked: false }), '⚠ raw hello');
  assert.equal(mask('hello', null), 'hello');
  assert.equal(mask(null, { masked: false }), '');
});

test('escapeHtml — 6 chars', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a&b"c\'d`e'), 'a&amp;b&quot;c&#39;d&#96;e');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml('plain text'), 'plain text');
});

test('escapeAttr — escapeHtml + url escape', () => {
  assert.equal(escapeAttr('a b'), 'a%20b');
  assert.equal(escapeAttr('x(y)z'), 'x%28y%29z');
  assert.equal(escapeAttr('<a>'), '&lt;a&gt;');
});

test('STATUS_BADGES — Object.freeze invariant', () => {
  assert.ok(Object.isFrozen(STATUS_BADGES));
  assert.ok(Object.isFrozen(STATUS_BADGES.blocked));
});
