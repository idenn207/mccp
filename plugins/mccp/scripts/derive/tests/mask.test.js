'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { derive } = require('../index');
const { maskModel } = require('../mask');
const { tmpRepo, cleanup, gitInit, writeJson } = require('./helpers');

function writeAReceipt(root) {
  const p = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'r.json');
  writeJson(p, {
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    phase: 'plan',
    decision_id: 'r',
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
    meta: { created_at: '2026-06-17T00:00:00.000Z', cwd: root,
      skipped: false, advisory: false, codex_skipped: false,
      security_skipped: false, impeccable_skipped: false },
  });
}

test('mask: default derive emits masked model (Codex F2 absorption)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeAReceipt(root);
    const m = derive(root); // default — masked
    assert.strictEqual(m.masked, true);
    assert.strictEqual(m.repo_root, '<repo>');
    const json = JSON.stringify(m);
    // Should not contain the absolute tmp path
    assert.ok(json.indexOf(root) === -1,
      'masked output should not contain absolute repo path; found: ' + root);
  } finally {
    cleanup(root);
  }
});

test('mask: derive(root, {raw:true}) preserves absolute paths', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeAReceipt(root);
    const m = derive(root, { raw: true });
    assert.strictEqual(m.masked, false);
    assert.strictEqual(m.repo_root, path.resolve(root));
  } finally {
    cleanup(root);
  }
});

test('mask: maskModel is idempotent', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writeAReceipt(root);
    const raw = derive(root, { raw: true });
    const a = maskModel(raw, root);
    const b = maskModel(a, root);
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b),
      'applying maskModel twice should equal applying once');
  } finally {
    cleanup(root);
  }
});
