'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { emptyModel, validateShape } = require('../model');
const { tmpRepo, cleanup, gitInit } = require('./helpers');

// Dashboard Truthfulness M1 — guard the additive `ledger` count-source against
// silent drift. emptyModel must declare it and validateShape must enforce the
// count-source shape (count/items/invalid_count/degraded), or a future refactor
// could drop it without any test going red.
test('schema-drift: ledger is a declared count-source (emptyModel + validateShape)', () => {
  const m = emptyModel('/x');
  assert.ok(m.sources.ledger, 'emptyModel declares sources.ledger');
  assert.strictEqual(m.sources.ledger.count, 0);
  assert.ok(Array.isArray(m.sources.ledger.items));
  assert.strictEqual(validateShape(m).ok, true, 'empty model with ledger is shape-valid');

  // Dropping the count contract must be caught by validateShape.
  delete m.sources.ledger.count;
  const v = validateShape(m);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.indexOf('sources.ledger.count') !== -1),
    'validateShape flags missing ledger.count');
});

// Dashboard Truthfulness M2 — guard the additive `host_version` top-level field.
// emptyModel must declare it (additive optional, MODEL_VERSION 'v1' unchanged)
// and validateShape must present-only enforce its object shape so a future
// refactor cannot silently drop or malform it.
// dashboard-multi-session M1 — guard the additive `worktrees` count-source
// against silent drift (ledger mirror). emptyModel must declare it and
// validateShape must enforce the count-source shape, or a future refactor could
// drop it without any test going red.
test('schema-drift: worktrees is a declared count-source (emptyModel + validateShape)', () => {
  const m = emptyModel('/x');
  assert.ok(m.sources.worktrees, 'emptyModel declares sources.worktrees');
  assert.strictEqual(m.sources.worktrees.count, 0);
  assert.ok(Array.isArray(m.sources.worktrees.items));
  assert.strictEqual(validateShape(m).ok, true, 'empty model with worktrees is shape-valid');

  delete m.sources.worktrees.count;
  const v = validateShape(m);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.indexOf('sources.worktrees.count') !== -1),
    'validateShape flags missing worktrees.count');
});

test('schema-drift: host_version is a declared additive top-level field (emptyModel + validateShape)', () => {
  const m = emptyModel('/x');
  assert.ok(m.host_version && typeof m.host_version === 'object', 'emptyModel declares host_version object');
  assert.strictEqual(m.host_version.version, null);
  assert.strictEqual(m.host_version.source, 'unknown');
  assert.strictEqual(validateShape(m).ok, true, 'empty model with host_version is shape-valid');

  // MODEL_VERSION stays 'v1' (additive surface, no consumer migration).
  assert.strictEqual(m.schema_version, 'v1');

  // Malformed host_version (non-object) must be caught present-only.
  m.host_version = 'not-an-object';
  const v = validateShape(m);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.indexOf('host_version') !== -1),
    'validateShape flags malformed host_version');
});

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
