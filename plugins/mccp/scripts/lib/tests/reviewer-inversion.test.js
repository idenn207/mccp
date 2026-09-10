'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const reviewer = require('../reviewer-invoke');
const claude = require('../claude-review-invoke');

function response(patch) {
  const events = [
    { type: 'assistant', message: { model: 'claude-opus-5', content: [] } },
    { type: 'result', subtype: 'success', is_error: false,
      structured_output: { verdict: 'approve', summary: 'ok', findings: [] } },
  ];
  return Object.assign({ status: 0, stdout: events.map(e => JSON.stringify(e)).join('\n'), stderr: '' }, patch);
}

test('host routing requires a positive designation', () => {
  assert.equal(reviewer.route({ MCCP_HARNESS: 'codex' }).reviewer, 'claude');
  assert.equal(reviewer.route({ CLAUDE_PLUGIN_ROOT: '/plugin' }).reviewer, 'codex');
  assert.equal(reviewer.route({ MCCP_HARNESS: 'codex', CLAUDE_PLUGIN_ROOT: '/plugin' }).reviewer, 'claude');
  assert.equal(reviewer.route({ CODEX_HOME: '/home' }).blocking, true);
  assert.equal(reviewer.route({ MCCP_HARNESS: 'bad' }).blocking, true);
});

test('structured Claude output requires an actual Claude assistant model', () => {
  assert.equal(claude.normalize(response()).ok, true);
  for (const r of [response({ status: 1 }), response({ stdout: '' }), response({ stdout: 'approve' }),
    response({ error: { code: 'ETIMEDOUT' } }), response({ stdout: response().stdout.replace('claude-opus-5', 'gpt-5') }),
    response({ stdout: response().stdout.replace('"approve"', '"unknown"') }),
    response({ stdout: response().stdout.replace('"is_error":false', '"is_error":true') })]) {
    assert.equal(claude.normalize(r).blocking, true);
  }
});

test('partial or unknown finding vocabulary and intent IDs fail closed', () => {
  const events = response().stdout.split('\n').map(JSON.parse);
  events[1].structured_output.findings = [{ id: 'F1', severity: 'urgent', title: 'x', body: 'x', intent_ids: [] }];
  assert.equal(claude.normalize(response({ stdout: events.map(JSON.stringify).join('\n') })).blocking, true);
  events[1].structured_output.findings[0].severity = 'high';
  events[1].structured_output.findings[0].intent_ids = ['UI99'];
  assert.equal(claude.normalize(response({ stdout: events.map(JSON.stringify).join('\n') }), { intentIds: ['UI1'] }).blocking, true);
});

test('Claude failures never honor Codex advisory or disabled policies', () => {
  const out = reviewer.invokeAdversarialReview('x', {
    env: { MCCP_HARNESS: 'codex', MCCP_CODEX_DISABLED: '1', MCCP_ALLOW_CODEX_UNAVAILABLE: '1' },
    spawn: () => response({ status: 1 }), budget: { allowed: true, canRecord: false },
  });
  assert.equal(out.blocking, true);
  assert.equal(out.advisory, false);
});

test('exhausted budget never spawns or reports an approving result', () => {
  const out = claude.invokeAdversarialReview('x', { budget: { allowed: false }, spawn: () => { throw new Error('must not spawn'); } });
  assert.equal(out.classification, 'round-cap-reached');
  assert.equal(out.blocking, true);
});
