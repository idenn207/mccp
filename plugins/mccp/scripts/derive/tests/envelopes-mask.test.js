'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpRepo, cleanup, gitInit, writeJson } = require('./helpers');
const { derive } = require('../index');

// Codex Plan-Codex R1 F3 absorption — real envelope on disk with
// next_action containing a sk-key + findings[0].text containing an AKIA
// AWS key. derive() must pick both up via masked_payload_signal AND
// aggregate them onto model.mask_hits.
test('envelopes-mask F3: real envelope payload secret scan via masked_payload_signal', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    const envDir = path.join(root, '.claude', 'state', 'dispatches');
    fs.mkdirSync(envDir, { recursive: true });
    const dispatchId = '11111111-2222-3333-4444-555555555555';
    const envelope = {
      schema_version: 'v1',
      dispatch_id: dispatchId,
      worker_subagent_type: 'general-purpose',
      worker_started_at: '2026-06-19T00:00:00.000Z',
      worker_ended_at: '2026-06-19T00:01:00.000Z',
      worker_exit_status: 'ok',
      receipts_added: ['mccp-plan-codex/dem.json'],
      findings: [
        { area: 'auth', text: 'discovered AKIAIOSFODNN7EXAMPLE in test fixture' },
      ],
      next_action: 'call api sk-ABCDEFGHIJKLMNOPQRSTUVWX then commit',
      controller_session_id: '99999999-8888-7777-6666-555555555555',
      parent_cwd: root,
    };
    writeJson(path.join(envDir, dispatchId + '.envelope.json'), envelope);

    const m = derive(root);
    const env = m.sources.envelopes.items[0];
    assert.ok(env.ok, 'envelope item ok');
    assert.ok(env.masked_payload_signal, 'masked_payload_signal field present (additive)');
    assert.ok(env.masked_payload_signal.mask_hit_count >= 2, 'detected ≥2 hits');
    assert.ok(env.masked_payload_signal.mask_kinds.includes('sk-key'), 'sk-key kind');
    assert.ok(env.masked_payload_signal.mask_kinds.includes('aws-key'), 'aws-key kind');

    // Aggregated onto model.mask_hits with envelope source attribution.
    assert.ok(Array.isArray(m.mask_hits) && m.mask_hits.length >= 2);
    const envelopeHits = m.mask_hits.filter(h => h.source_kind === 'envelope');
    assert.ok(envelopeHits.length >= 2);
    assert.ok(envelopeHits.some(h => h.kind === 'sk-key' && h.severe === true));
    assert.ok(envelopeHits.some(h => h.kind === 'aws-key' && h.severe === true));

    // Raw envelope strings (next_action, findings text) must NOT appear in
    // the model JSON — F3 privacy invariant.
    const json = JSON.stringify(m);
    assert.doesNotMatch(json, /sk-ABCDEFGHIJKLMNOPQRSTUVWX/);
    assert.doesNotMatch(json, /AKIAIOSFODNN7EXAMPLE/);
  } finally { cleanup(root); }
});
