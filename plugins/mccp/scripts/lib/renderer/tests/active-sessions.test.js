'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderActiveSessions, formatAge } = require('../sections/active-sessions');

test('active-sessions — 0 ledgers → null (graceful hide)', () => {
  const model = {
    sources: {
      state: { item: { active_session_ledgers: [] } },
    },
  };
  assert.equal(renderActiveSessions(model, formatUtils), null);
});

test('active-sessions — state.item absent → null', () => {
  const model = { sources: { state: {} } };
  assert.equal(renderActiveSessions(model, formatUtils), null);
});

test('active-sessions — 1 ledger renders md + html with masked fields', () => {
  const model = {
    sources: {
      state: {
        item: {
          active_session_ledgers: [
            {
              session_id: 'aaaabbbb-cccc-dddd-eeee-fffmytail',
              git_branch: 'feat/m2-discovery',
              cwd: '<repo>/some/sub',
              host: '<host>',
              created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              pid: 1,
              project_id: 'abc',
            },
          ],
        },
      },
    },
  };
  const out = renderActiveSessions(model, formatUtils);
  assert.ok(out, 'output must be non-null');
  assert.match(out.md, /ffmytail/);
  assert.match(out.md, /feat\/m2-discovery/);
  assert.match(out.md, /<repo>\/some\/sub/);
  assert.match(out.md, /<host>/);
  assert.match(out.md, /5m/);
  assert.match(out.html, /<table class="active-sessions">/);
  assert.match(out.html, /&lt;host&gt;/, 'host placeholder escaped in html');
});

test('active-sessions — multiple ledgers preserve order and escape angle brackets in cwd', () => {
  const model = {
    sources: {
      state: {
        item: {
          active_session_ledgers: [
            {
              session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeesess111',
              git_branch: 'main',
              cwd: '<repo>',
              host: '<host>',
              created_at: new Date(Date.now() - 1000).toISOString(),
              pid: 1,
              project_id: 'abc',
            },
            {
              session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeesess222',
              git_branch: 'feat/x',
              cwd: '<repo>/x',
              host: '<host>',
              created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              pid: 2,
              project_id: 'abc',
            },
          ],
        },
      },
    },
  };
  const out = renderActiveSessions(model, formatUtils);
  assert.ok(out);
  assert.match(out.html, /&lt;repo&gt;\/x/, 'escaped angle brackets in cwd');
  assert.match(out.md, /sess111/);
  assert.match(out.md, /sess222/);
  assert.match(out.md, /1h/);
});

test('formatAge — boundary buckets', () => {
  const now = Date.parse('2026-06-19T12:00:00.000Z');
  assert.equal(formatAge(new Date(now - 30 * 1000).toISOString(), now), '~now');
  assert.equal(formatAge(new Date(now - 5 * 60 * 1000).toISOString(), now), '5m');
  assert.equal(formatAge(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now), '2h');
  assert.equal(formatAge(new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), now), '3d');
  assert.equal(formatAge('not-a-date', now), '?');
});
