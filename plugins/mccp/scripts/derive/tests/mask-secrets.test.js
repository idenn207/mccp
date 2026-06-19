'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpRepo, cleanup, gitInit, writeJson, writeText } = require('./helpers');
const { maskSecrets, applySecretMask, isSevereKind, SECRET_PATTERNS } = require('../mask');
const { derive } = require('../index');

// Path (a) — sk-key pattern → redacted + hit recorded.
test('mask-secrets path a: sk-key redacted', () => {
  const input = 'call api with key sk-ABCDEFGHIJKLMNOPQRSTUVWX more text';
  const r = maskSecrets(input, { fieldName: 'next_action', sourceId: 'env-1' });
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].kind, 'sk-key');
  assert.equal(r.hits[0].count, 1);
  assert.equal(r.hits[0].severe, true);
  assert.match(r.masked, /\[REDACTED:sk-key\]/);
  assert.doesNotMatch(r.masked, /sk-ABCDEFGHIJKLMNOPQRSTUVWX/);
});

// Path (b) — AWS access key pattern → redacted + hit.
test('mask-secrets path b: AKIA AWS key redacted', () => {
  const r = maskSecrets('use AKIAIOSFODNN7EXAMPLE in config');
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].kind, 'aws-key');
  assert.equal(r.hits[0].severe, true);
  assert.doesNotMatch(r.masked, /AKIAIOSFODNN7EXAMPLE/);
});

// Path (c) — Bearer token → redacted (not severe).
test('mask-secrets path c: Bearer token redacted but not severe', () => {
  const r = maskSecrets('Authorization: Bearer abcdef1234567890ABCDEFXY rest', {});
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].kind, 'bearer');
  assert.equal(r.hits[0].severe, false);
  assert.match(r.masked, /\[REDACTED:bearer\]/);
});

// Path (d) — password=... → redacted (not severe).
test('mask-secrets path d: password= redacted', () => {
  const r = maskSecrets("config.password='mySecret123!' OK");
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].kind, 'password-eq');
  assert.doesNotMatch(r.masked, /mySecret123!/);
});

// Path (e) — PRIVATE KEY block → redacted.
test('mask-secrets path e: PRIVATE KEY block redacted', () => {
  const block = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKC...\n-----END RSA PRIVATE KEY-----';
  const r = maskSecrets('prefix ' + block + ' suffix');
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].kind, 'private-key-block');
  assert.equal(r.hits[0].severe, true);
  assert.match(r.masked, /\[REDACTED:private-key-block\]/);
  assert.doesNotMatch(r.masked, /MIIEpAIBAAKC/);
});

// Path (f) — clean text → no change, hits empty.
test('mask-secrets path f: clean text unchanged', () => {
  const r = maskSecrets('this is a perfectly safe message');
  assert.equal(r.hits.length, 0);
  assert.equal(r.masked, 'this is a perfectly safe message');
});

// Path (g) — applySecretMask: model with receipts.briefing_summary containing
// a sk-key is masked, mask_hits aggregated.
test('mask-secrets path g: applySecretMask on receipts briefing_summary', () => {
  const model = {
    sources: {
      receipts: {
        items: [
          { decision_id: 'r1', briefing_summary: 'see sk-1234567890abcdefghijKLMNO for context' },
          { decision_id: 'r2', briefing_summary: 'all clean here' },
        ],
      },
    },
  };
  applySecretMask(model);
  assert.equal(Array.isArray(model.mask_hits), true);
  assert.ok(model.mask_hits.length >= 1);
  assert.equal(model.mask_hits[0].kind, 'sk-key');
  assert.equal(model.mask_hits[0].source_kind, 'receipt');
  assert.equal(model.mask_hits[0].source_id, 'r1');
  assert.match(model.sources.receipts.items[0].briefing_summary, /\[REDACTED:sk-key\]/);
  assert.equal(model.sources.receipts.items[1].briefing_summary, 'all clean here');
});

// Path (h) — derive(repoRoot, {raw: true}) still applies secret mask
// (F2 absorption). Verify the secret is redacted in raw output.
test('mask-secrets path h: derive --raw still applies secret mask (F2)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    const receiptPath = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'r1.json');
    writeJson(receiptPath, {
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
      meta: {
        created_at: '2026-06-19T00:00:00.000Z',
        cwd: root, skipped: false, advisory: false, codex_skipped: false,
        security_skipped: false, impeccable_skipped: false,
        briefing_summary: 'embedded sk-ABCDEFGHIJKLMNOPQRSTUVWX should be redacted even in raw',
      },
    });
    const m = derive(root, { raw: true });
    assert.equal(m.masked, false, 'raw → masked=false');
    const json = JSON.stringify(m);
    assert.doesNotMatch(json, /sk-ABCDEFGHIJKLMNOPQRSTUVWX/, 'raw output MUST NOT contain secret');
    assert.match(json, /\[REDACTED:sk-key\]/);
    assert.ok(Array.isArray(m.mask_hits) && m.mask_hits.length > 0, 'mask_hits non-empty in raw');
  } finally { cleanup(root); }
});

// Path (i) — derive(repoRoot) (default, masked) also redacts secrets.
test('mask-secrets path i: derive default applies secret mask', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    const receiptPath = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'r2.json');
    writeJson(receiptPath, {
      schema_version: 'v1',
      gate_id: 'mccp-plan-codex',
      phase: 'plan',
      decision_id: 'r2',
      task_id: null,
      plan_hash: 'sha256:' + '0'.repeat(64),
      design_doc_hash: [],
      base_sha: '0000000', head_sha: '0000000',
      round: 1, findings: [],
      resolution: { converged: true, rounds: 1, open_questions: [] },
      subject_hash: 'sha256:' + '0'.repeat(64),
      receipt_hash: 'sha256:' + '0'.repeat(64),
      meta: {
        created_at: '2026-06-19T00:00:00.000Z',
        cwd: root, skipped: false, advisory: false, codex_skipped: false,
        security_skipped: false, impeccable_skipped: false,
        briefing_summary: 'try AKIAIOSFODNN7EXAMPLE here',
      },
    });
    const m = derive(root);
    assert.equal(m.masked, true);
    const json = JSON.stringify(m);
    assert.doesNotMatch(json, /AKIAIOSFODNN7EXAMPLE/);
    assert.match(json, /\[REDACTED:aws-key\]/);
  } finally { cleanup(root); }
});

test('mask-secrets isSevereKind catalogue + count', () => {
  assert.equal(SECRET_PATTERNS.length, 5);
  assert.equal(isSevereKind('sk-key'), true);
  assert.equal(isSevereKind('aws-key'), true);
  assert.equal(isSevereKind('private-key-block'), true);
  assert.equal(isSevereKind('bearer'), false);
  assert.equal(isSevereKind('password-eq'), false);
});
