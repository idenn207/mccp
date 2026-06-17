'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { tmpRepo, cleanup, gitInit, writeJson } = require('./helpers');

test('envelope-absent: receipts present but no dispatches/ dir — envelopes.ok && count=0 && !degraded', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    const p = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'r1.json');
    writeJson(p, {
      schema_version: 'v1',
      gate_id: 'mccp-plan-codex',
      phase: 'plan',
      decision_id: 'r1',
      task_id: null,
      plan_hash: 'sha256:' + '0'.repeat(64),
      design_doc_hash: [],
      base_sha: '0000000',
      head_sha: '0000000',
      round: 1,
      findings: [],
      resolution: { converged: true, rounds: 1, open_questions: [] },
      subject_hash: 'sha256:' + '0'.repeat(64),
      receipt_hash: 'sha256:' + '0'.repeat(64),
      meta: { created_at: '2026-06-17T00:00:00.000Z',
        skipped: false, advisory: false, codex_skipped: false,
        security_skipped: false, impeccable_skipped: false },
    });

    assert.strictEqual(fs.existsSync(path.join(root, '.claude', 'state', 'dispatches')), false,
      'precondition: dispatches/ dir must not exist');

    const m = derive(root, { raw: true });
    assert.strictEqual(m.sources.envelopes.ok, true);
    assert.strictEqual(m.sources.envelopes.count, 0);
    assert.strictEqual(m.sources.envelopes.degraded, false);
    assert.strictEqual(m.sources.envelopes.invalid_count, 0);
    assert.strictEqual(m.sources.receipts.count >= 1, true);
  } finally {
    cleanup(root);
  }
});
