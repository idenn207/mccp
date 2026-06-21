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

// v1.4.0-m3 — self/other 시각 구분 (Task 2)

test('active-sessions — self_session_id null + 2 ledgers → both rows plain (M2 regression)', () => {
  const model = {
    sources: {
      state: {
        item: {
          self_session_id: null,
          self_resolution: 'env-missing',
          active_session_ledgers: [
            {
              session_id: 'session1-aaaa-bbbb-cccc-iddddselfA1',
              git_branch: 'main',
              cwd: '<repo>',
              host: '<host>',
              created_at: new Date(Date.now() - 1000).toISOString(),
            },
            {
              session_id: 'session1-aaaa-bbbb-cccc-iddddselfA2',
              git_branch: 'feat/x',
              cwd: '<repo>/x',
              host: '<host>',
              created_at: new Date(Date.now() - 1000).toISOString(),
            },
          ],
        },
      },
    },
  };
  const out = renderActiveSessions(model, formatUtils);
  assert.ok(out);
  assert.equal(out.md.includes('**this worktree**'), false, 'no self marker in md');
  assert.equal(out.html.includes('<strong>this worktree</strong>'), false, 'no self marker in html');
  assert.equal(out.html.includes('tr class="self"'), false, 'no self tr class');
});

test('active-sessions — self_session_id matches one ledger → only that row marked', () => {
  const selfId = 'session2-aaaa-bbbb-cccc-id-self-row-id';
  const model = {
    sources: {
      state: {
        item: {
          self_session_id: selfId,
          self_resolution: 'resolved',
          active_session_ledgers: [
            {
              session_id: 'session2-aaaa-bbbb-cccc-id-other-row',
              git_branch: 'main',
              cwd: '<repo>',
              host: '<host>',
              created_at: new Date(Date.now() - 1000).toISOString(),
            },
            {
              session_id: selfId,
              git_branch: 'feat/m3',
              cwd: '<repo>/m3',
              host: '<host>',
              created_at: new Date(Date.now() - 1000).toISOString(),
            },
          ],
        },
      },
    },
  };
  const out = renderActiveSessions(model, formatUtils);
  assert.ok(out);
  const selfMarkerCount = (out.md.match(/\*\*this worktree\*\*/g) || []).length;
  assert.equal(selfMarkerCount, 1, 'exactly one self marker in md');
  const htmlSelfCount = (out.html.match(/<strong>this worktree<\/strong>/g) || []).length;
  assert.equal(htmlSelfCount, 1, 'exactly one self marker in html');
  assert.match(out.html, /<tr class="self">/);
});

test('active-sessions — self_session_id set but no matching ledger (stale env) → all rows plain', () => {
  const model = {
    sources: {
      state: {
        item: {
          self_session_id: 'session3-stale-no-match-id-foooooooo',
          self_resolution: 'resolved',
          active_session_ledgers: [
            {
              session_id: 'session3-aaaa-bbbb-cccc-id-elsewhere',
              git_branch: 'main',
              cwd: '<repo>',
              host: '<host>',
              created_at: new Date(Date.now() - 1000).toISOString(),
            },
          ],
        },
      },
    },
  };
  const out = renderActiveSessions(model, formatUtils);
  assert.ok(out);
  assert.equal(out.md.includes('**this worktree**'), false, 'silent degrade — no self marker');
  assert.equal(out.html.includes('<strong>this worktree</strong>'), false);
});

test('formatAge — boundary buckets', () => {
  const now = Date.parse('2026-06-19T12:00:00.000Z');
  assert.equal(formatAge(new Date(now - 30 * 1000).toISOString(), now), '~now');
  assert.equal(formatAge(new Date(now - 5 * 60 * 1000).toISOString(), now), '5m');
  assert.equal(formatAge(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now), '2h');
  assert.equal(formatAge(new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), now), '3d');
  assert.equal(formatAge('not-a-date', now), '?');
});
