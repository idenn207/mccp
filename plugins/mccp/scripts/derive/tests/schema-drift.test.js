'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { tmpRepo, cleanup, gitInit } = require('./helpers');

test('schema-drift: envelope with unknown_top_level_key flagged as invalid + degraded=true (Codex F3 absorption)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    const dir = path.join(root, '.claude', 'state', 'dispatches');
    fs.mkdirSync(dir, { recursive: true });
    const filename = '33333333-3333-3333-3333-333333333333.envelope.json';
    // Hand-craft an envelope that is valid except for an unknown top-level key
    fs.writeFileSync(path.join(dir, filename), JSON.stringify({
      schema_version: 'v1',
      dispatch_id: '33333333-3333-3333-3333-333333333333',
      worker_subagent_type: 'general-purpose',
      worker_started_at: '2026-06-17T00:00:00.000Z',
      worker_ended_at: '2026-06-17T00:00:30.000Z',
      worker_exit_status: 'ok',
      receipts_added: [],
      findings: [],
      next_action: null,
      controller_session_id: '44444444-4444-4444-4444-444444444444',
      parent_cwd: root,
      my_extra_key: 1,
    }, null, 2), 'utf8');

    const m = derive(root, { raw: true });
    assert.strictEqual(m.sources.envelopes.ok, true, 'scan did not crash');
    assert.strictEqual(m.sources.envelopes.count, 1);
    assert.strictEqual(m.sources.envelopes.items[0].ok, false, 'item is invalid');
    assert.ok(m.sources.envelopes.items[0].error &&
      m.sources.envelopes.items[0].error.indexOf('unknown top-level key') !== -1,
      'error mentions unknown top-level key');
    assert.strictEqual(m.sources.envelopes.invalid_count, 1);
    assert.strictEqual(m.sources.envelopes.degraded, true);
    const w = m.warnings.find(w => w.source === 'envelopes' && w.severity === 'medium');
    assert.ok(w, 'expected medium-severity envelope degraded warning');
  } finally {
    cleanup(root);
  }
});
