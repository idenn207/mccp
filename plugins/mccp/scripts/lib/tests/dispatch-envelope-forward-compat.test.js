'use strict';

// v1.3.0-m0 Task 4b — Codex Plan-Codex R1 F3 absorption regression test.
//
// Pins the post-F3 contract: hand validate() and exported JSON_SCHEMA agree
// on additionalProperties:false. Any future contributor adding a new envelope
// field MUST update BOTH KNOWN_KEYS AND JSON_SCHEMA.properties AND land a new
// docs/v1.x.y-orchestrator/envelope-schema-v2.md file (schema bump path).

const test = require('node:test');
const assert = require('node:assert');

const envelope = require('../dispatch-envelope');

function validPlaceholder(overrides) {
  return Object.assign({
    schema_version: 'v1',
    dispatch_id: '019eced3-cce9-7be3-81a1-c8a5c30a27fe',
    worker_subagent_type: 'mccp:code-reviewer',
    worker_started_at: '2026-06-16T05:00:00Z',
    worker_ended_at: null,
    worker_exit_status: 'pending',
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: '019ecedf-1234-5678-9abc-def012345678',
    parent_cwd: 'C:/_project/my/my-claude-code-plugin',
  }, overrides || {});
}

test('unknown top-level keys are rejected (forward-compat lock)', () => {
  const result = envelope.validate(
    Object.assign(validPlaceholder(), { my_unknown: 1 })
  );
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(e => e.indexOf('unknown top-level key') !== -1
      && e.indexOf('my_unknown') !== -1),
    'expected "unknown top-level key" error mentioning "my_unknown", got: ' +
      JSON.stringify(result.errors)
  );
});

test('multiple unknown keys all surface in errors', () => {
  const result = envelope.validate(
    Object.assign(validPlaceholder(), { fake_status: 'x', extra_field: true })
  );
  assert.strictEqual(result.ok, false);
  const text = result.errors.join('\n');
  assert.ok(text.indexOf('fake_status') !== -1, 'fake_status not flagged');
  assert.ok(text.indexOf('extra_field') !== -1, 'extra_field not flagged');
});

test('unknown-key rejection mentions the schema bump path', () => {
  const result = envelope.validate(
    Object.assign(validPlaceholder(), { briefing_summary: 'oops' })
  );
  assert.strictEqual(result.ok, false);
  const text = result.errors.join('\n');
  assert.ok(
    text.indexOf('envelope-schema-v2.md') !== -1,
    'expected error to direct contributor to v2 schema doc, got: ' + text
  );
});

test('schema_version constant invariant', () => {
  const result = envelope.validate(
    Object.assign(validPlaceholder(), { schema_version: 'v2' })
  );
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(e => e.indexOf('schema_version must be "v1"') !== -1),
    'expected explicit schema_version error, got: ' + JSON.stringify(result.errors)
  );
});

test('JSON_SCHEMA + hand-validate agree on additionalProperties:false', () => {
  // The hand validator and the exported JSON Schema MUST move together. If
  // a future contributor adds a field to JSON_SCHEMA.properties but forgets
  // KNOWN_KEYS (or vice versa), this test catches it.
  assert.strictEqual(envelope.JSON_SCHEMA.additionalProperties, false);
  assert.ok(
    envelope.KNOWN_KEYS instanceof Set,
    'KNOWN_KEYS must be exported as a Set for contributor reference'
  );

  // Every JSON_SCHEMA.properties key must be in KNOWN_KEYS, and vice versa.
  const schemaKeys = new Set(Object.keys(envelope.JSON_SCHEMA.properties));
  const handKeys = envelope.KNOWN_KEYS;

  for (const k of schemaKeys) {
    assert.ok(
      handKeys.has(k),
      'JSON_SCHEMA.properties has "' + k + '" but KNOWN_KEYS does not — ' +
        'hand validator would reject what JSON Schema accepts'
    );
  }
  for (const k of handKeys) {
    assert.ok(
      schemaKeys.has(k),
      'KNOWN_KEYS has "' + k + '" but JSON_SCHEMA.properties does not — ' +
        'hand validator would accept what JSON Schema rejects'
    );
  }
});

