'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { derive } = require('../index');
const { maskModel, applyPathMask } = require('../mask');
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

test('mask: applyPathMask redacts ledger cwd to <repo>-relative posix path (v1.5.0-m1 H1)', () => {
  const root = tmpRepo();
  try {
    const ledgerCwd = path.join(root, 'apps', 'web');
    const model = {
      sources: {
        state: {
          item: {
            path: '.claude/state/STATE.md',
            active_session_ledgers: [
              { session_id: 'a', cwd: ledgerCwd, host: 'DESKTOP-LEAK', git_branch: 'main' },
            ],
          },
        },
      },
    };
    applyPathMask(model, root);
    const led = model.sources.state.item.active_session_ledgers[0];
    assert.strictEqual(led.cwd, 'apps/web', 'cwd must be repo-relative posix path');
    assert.strictEqual(led.host, '<host>', 'host must be redacted to placeholder');
    assert.strictEqual(led.git_branch, 'main', 'git_branch stays raw (intentional)');
    assert.strictEqual(led.session_id, 'a', 'session_id stays raw');
    const json = JSON.stringify(model);
    assert.ok(json.indexOf(ledgerCwd) === -1, 'absolute ledger cwd must not leak through mask');
    assert.ok(json.indexOf('DESKTOP-LEAK') === -1, 'hostname must not leak through mask');
  } finally {
    cleanup(root);
  }
});

test('mask: applyPathMask tolerates missing active_session_ledgers array', () => {
  const root = tmpRepo();
  try {
    const model = { sources: { state: { item: { path: '.claude/state/STATE.md' } } } };
    applyPathMask(model, root);
    assert.strictEqual(model.sources.state.item.path, '.claude/state/STATE.md');
  } finally {
    cleanup(root);
  }
});

test('mask: applyPathMask tolerates empty/non-string ledger fields', () => {
  const root = tmpRepo();
  try {
    const model = {
      sources: {
        state: {
          item: {
            path: '.claude/state/STATE.md',
            active_session_ledgers: [
              { session_id: 'a', cwd: '', host: null, git_branch: 'main' },
              { session_id: 'b' },
              null,
            ],
          },
        },
      },
    };
    applyPathMask(model, root);
    const arr = model.sources.state.item.active_session_ledgers;
    assert.strictEqual(arr[0].cwd, '', 'empty string cwd left as-is');
    assert.strictEqual(arr[0].host, null, 'null host left as-is');
    assert.strictEqual(arr[1].session_id, 'b', 'minimal ledger untouched');
    assert.strictEqual(arr[2], null, 'null entry untouched');
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
