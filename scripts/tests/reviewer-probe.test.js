'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const probe = require('../codex-probe/reviewer-probe');

function record(overrides) {
  return Object.assign({ exit: 0, signal: null, error: null, before: 'abc', after: 'abc',
    events: [
      { type: 'assistant', message: { model: 'claude-opus-5', content: [] } },
      { type: 'result', subtype: 'success', is_error: false,
        structured_output: { verdict: 'approve', summary: 'ok', findings: [] },
        permission_denials: [] },
    ] }, overrides);
}

test('requires actual assistant model and structured final result', () => {
  assert.equal(probe.inspect(record()).ok, true);
  assert.equal(probe.inspect(record({ events: [{ type: 'system', model: 'claude-opus-5' }] })).ok, false);
  const r = record(); r.events[0].message.model = 'gpt-5';
  assert.equal(probe.inspect(r).ok, false);
  const text = record(); delete text.events[1].structured_output;
  text.events[1].result = 'approve';
  assert.equal(probe.inspect(text).ok, false);
});

test('errors cannot approve even when result contains approval', () => {
  for (const patch of [{ exit: 1 }, { signal: 'SIGKILL' }, { error: 'ETIMEDOUT' }, { after: 'changed' }]) {
    assert.equal(probe.inspect(record(patch)).ok, false);
  }
  const r = record(); r.events[1].is_error = true;
  assert.equal(probe.inspect(r).ok, false);
});

test('write refusal requires correlated attempt and permission denial', () => {
  const r = record();
  assert.equal(probe.inspect(r, { writeDenial: true }).ok, false);
  r.events[0].message.content = [{ type: 'tool_use', id: 'write-1', name: 'Write', input: { file_path: 'protected.txt' } }];
  r.events[1].permission_denials = [{ tool_name: 'Write', tool_use_id: 'write-2' }];
  assert.equal(probe.inspect(r, { writeDenial: true }).ok, false);
  r.events[1].permission_denials[0].tool_use_id = 'write-1';
  assert.equal(probe.inspect(r, { writeDenial: true }).ok, true);
});

test('no gate completion can be inferred from CLI probe success', () => {
  const summary = probe.summarize({ read: record(), write: record(), failure: { exit: 1 }, timeout: { error: 'ETIMEDOUT' } });
  assert.equal(summary.m4_complete, false);
  assert.equal(summary.task1_complete, false);
  for (const gate of Object.values(summary.gates)) assert.equal(gate.status, 'unmeasured');
});

test('sanitization removes credentials and machine paths in nested stdout/stderr', () => {
  const secret = 'test-fixture-secret-123456789';
  const clean = probe.sanitize({ stderr: `token=${secret}`, stdout: '/tmp/m4-test/protected.txt', api_key: secret }, [secret]);
  const serialized = JSON.stringify(clean);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('/tmp/'), false);
});
