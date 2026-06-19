'use strict';

// v1.3.0-m6 — Generic interface smoke. 4 fixtures verify derive degrades
// gracefully on foreign (non-mccp) `.claude/` shapes:
//   A — empty repo (no .claude/), 2-branch (strict warning vs default silent)
//   B — minimal-state-only (STATE.md frontmatter only, no receipts/plans/envelopes)
//   C — non-mccp gate_ids (free-form `gate_id`, mccp-extension fields absent)
//   D — degraded foreign repo (malformed JSON, unsupported frontmatter,
//       additionalProperties envelope, symlink/unreadable receipt)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { tmpRepo, cleanup, gitInit, writeJson, writeText, ensureDir } = require('./helpers');

// --- Fixture A: empty repo (no `.claude/`) ---

test('generic-interface A: empty repo + strict=true emits one low warning', () => {
  const root = tmpRepo('mccp-m6-A-strict-');
  try {
    gitInit(root);
    assert.strictEqual(fs.existsSync(path.join(root, '.claude')), false,
      'precondition: .claude/ must not exist');

    const m = derive(root, { strict: true, raw: true });

    const matches = (m.warnings || []).filter(w =>
      w && w.source === 'derive' && w.severity === 'low'
      && typeof w.message === 'string' && w.message.startsWith('no .claude/ directory at '));
    assert.strictEqual(matches.length, 1,
      'exactly one low warning from derive about missing .claude/');

    assert.strictEqual(m.sources.plans.count, 0);
    assert.strictEqual(m.sources.receipts.count, 0);
    assert.strictEqual(m.sources.state.item, null);
    assert.strictEqual(m.sources.backlog.count, 0);
    assert.strictEqual(m.sources.fix_task.item, null);
    assert.strictEqual(m.sources.envelopes.count, 0);
  } finally {
    cleanup(root);
  }
});

test('generic-interface A: empty repo default mode emits NO low warning', () => {
  const root = tmpRepo('mccp-m6-A-default-');
  try {
    gitInit(root);
    const m = derive(root, { raw: true });
    const matches = (m.warnings || []).filter(w =>
      w && w.source === 'derive' && w.severity === 'low');
    assert.strictEqual(matches.length, 0,
      'default mode silent on missing .claude/');

    assert.strictEqual(m.sources.plans.count, 0);
    assert.strictEqual(m.sources.envelopes.count, 0);

    assert.ok(m.m0_capability, 'm0_capability always present');
    assert.ok(typeof m.m0_capability.contract_present === 'boolean'
      || m.m0_capability.contract_present === null,
      'm0_capability.contract_present is boolean or null');
  } finally {
    cleanup(root);
  }
});

// --- Fixture B: state-only (mccp-owned STATE.md, no other sources) ---
// Contract: STATE.md schema is mccp-owned (state-writer enforces
// state_version=1). External repos that write arbitrary STATE.md are reset to
// emptyState — see docs/v1.3.0-observability/generic-interface.md §3.

test('generic-interface B: mccp-owned STATE.md only (no receipts/plans/envelopes)', () => {
  const root = tmpRepo('mccp-m6-B-');
  try {
    gitInit(root);

    const stateWriter = require('../../state/state-writer');
    stateWriter.update(root, {
      taskFingerprint: 'foreign-state-only',
      lastEvent: 'precompact',
      goal: 'generic-interface state-only fixture',
    });

    const m = derive(root, { raw: true });

    assert.notStrictEqual(m.sources.state.item, null, 'state item present');
    assert.strictEqual(m.sources.state.item.frontmatter.state_version, 1,
      'state_version is mccp-owned, surfaces as integer 1');
    assert.strictEqual(m.sources.state.degraded, false);

    assert.strictEqual(m.sources.plans.count, 0);
    assert.strictEqual(m.sources.receipts.count, 0);
    assert.strictEqual(m.sources.backlog.count, 0);
    assert.strictEqual(m.sources.fix_task.item, null);
    assert.strictEqual(m.sources.envelopes.count, 0);
  } finally {
    cleanup(root);
  }
});

test('generic-interface B-foreign: arbitrary STATE.md frontmatter triggers mccp reset (graceful)', () => {
  const root = tmpRepo('mccp-m6-B-foreign-');
  try {
    gitInit(root);
    const statePath = path.join(root, '.claude', 'state', 'STATE.md');
    writeText(statePath, [
      '---',
      'schema_version: arbitrary-foreign-key',
      'session_id: 00000000-0000-0000-0000-000000000000',
      '---',
      '',
      'arbitrary body',
    ].join('\n'));

    let m;
    assert.doesNotThrow(() => { m = derive(root, { raw: true }); },
      'derive must not throw on foreign STATE.md frontmatter');

    assert.strictEqual(m.sources.state.degraded, false,
      'reset is graceful, not degraded');
    assert.notStrictEqual(m.sources.state.item, null,
      'state item is reset emptyState, not null');
  } finally {
    cleanup(root);
  }
});

// --- Fixture C: non-mccp gate names + mccp-extension fields absent ---

test('generic-interface C: non-mccp gate_id receipts project briefing_* null', () => {
  const root = tmpRepo('mccp-m6-C-');
  try {
    gitInit(root);

    function writeForeignReceipt(gate, decision, createdAt) {
      writeJson(path.join(root, '.claude', 'receipts', gate, decision + '.json'), {
        schema_version: 'v1',
        gate_id: gate,
        phase: 'plan',
        decision_id: decision,
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
          created_at: createdAt,
          command: '/foreign-tool',
        },
      });
    }

    writeForeignReceipt('foo-gate', 'decision-1', '2026-06-18T00:00:00.000Z');
    writeForeignReceipt('bar-gate', 'decision-2', '2026-06-18T00:30:00.000Z');

    const m = derive(root, { raw: true });

    assert.strictEqual(m.sources.receipts.ok, true);
    assert.strictEqual(m.sources.receipts.count, 2);
    assert.strictEqual(m.sources.receipts.degraded, false);
    assert.strictEqual(m.sources.receipts.invalid_count, 0);

    const items = m.sources.receipts.items;
    const gates = items.map(i => i.gate).sort();
    assert.deepStrictEqual(gates, ['bar-gate', 'foo-gate']);

    for (const item of items) {
      assert.strictEqual(item.briefing_summary, undefined,
        'briefing_summary absent → undefined (null projection on render)');
      assert.strictEqual(item.briefing_token_count, undefined);
      assert.strictEqual(item.briefing_invocation_count, undefined);
      assert.strictEqual(item.codex_skipped_at_pr, undefined);
      assert.strictEqual(item.codex_skip_reason, undefined);
      assert.strictEqual(item.codex_dedupe_at_pr, undefined);
      assert.strictEqual(item.ipc_envelope_path, undefined);
      assert.strictEqual(item.dispatched_by_controller_session_id, undefined);
      assert.strictEqual(item.worker_dispatch_id, undefined);
    }
  } finally {
    cleanup(root);
  }
});

// --- Fixture D: degraded foreign repo (4 degradations) ---

test('generic-interface D: degraded foreign repo — malformed JSON + bad frontmatter + bad envelope + (POSIX) symlink', () => {
  const root = tmpRepo('mccp-m6-D-');
  let externalSentinelPath = null;
  try {
    gitInit(root);

    // (i) Malformed JSON receipt — truncated
    const badReceiptPath = path.join(root, '.claude', 'receipts', 'baz-gate', 'broken.json');
    ensureDir(path.dirname(badReceiptPath));
    fs.writeFileSync(badReceiptPath, '{ "gate_id": "baz-', 'utf8');

    // (ii) Unsupported STATE frontmatter
    const statePath = path.join(root, '.claude', 'state', 'STATE.md');
    writeText(statePath, [
      '---',
      'format_version: 99',
      'unknown_field: arbitrary-value',
      '---',
      '',
      'free body text',
    ].join('\n'));

    // (iii) Envelope with additionalProperties (unknown top-level key)
    const badEnvelopePath = path.join(root, '.claude', 'state', 'dispatches', 'invalid.envelope.json');
    writeJson(badEnvelopePath, {
      schema_version: 'v1',
      dispatch_id: '11111111-1111-1111-1111-111111111111',
      worker_subagent_type: 'general-purpose',
      worker_started_at: '2026-06-18T00:00:00.000Z',
      worker_ended_at: '2026-06-18T00:00:30.000Z',
      worker_exit_status: 'ok',
      receipts_added: [],
      findings: [],
      next_action: null,
      controller_session_id: '22222222-2222-2222-2222-222222222222',
      parent_cwd: root,
      not_in_schema: 'this-key-rejected-by-additionalProperties-false',
    });

    // (iv) POSIX symlink: write external sentinel file and link a receipt to it.
    //      Windows: skip symlink branch (admin needed); other degradations cover.
    //
    // The sentinel JSON must include meta-derived fields (created_at, command)
    // so any accidental dereference would surface those strings in derive's
    // receipts.items projection (receipts.js:78-79 reads meta.created_at and
    // meta.command). The v1.3.0-m6 guard in receipt/store.js#readReceipt
    // (isPlainFile) makes the file-level symlink fail with UNSAFE_RECEIPT_FILE
    // before fs.readFileSync runs — extract() catches and emits ok:false,
    // causing receipts.invalid_count++ and degraded:true without any external
    // content reaching the model.
    if (process.platform !== 'win32') {
      externalSentinelPath = path.join(tmpRepo('mccp-m6-D-external-'),
        'external-secret-payload.json');
      fs.writeFileSync(externalSentinelPath, JSON.stringify({
        schema_version: 'v1',
        gate_id: 'EXTERNAL-SENTINEL-SHOULD-NEVER-LEAK',
        decision_id: 'EXFILTRATION-CANARY-DECISION',
        meta: {
          created_at: 'EXTERNAL-SENTINEL-CREATED-AT',
          command: 'EXFILTRATION-CANARY-CMD',
        },
        secret: 'EXFILTRATION-CANARY-SECRET',
      }), 'utf8');
      const linkPath = path.join(root, '.claude', 'receipts', 'sym-gate', 'decision.json');
      ensureDir(path.dirname(linkPath));
      try {
        fs.symlinkSync(externalSentinelPath, linkPath);
      } catch (e) {
        externalSentinelPath = null;
      }
    }

    let m;
    assert.doesNotThrow(() => { m = derive(root, { raw: true }); },
      'derive must not throw on degraded foreign repo');

    assert.strictEqual(m.sources.receipts.ok, true,
      'receipts source remains ok=true; degraded:true is the surfaced signal');
    assert.strictEqual(m.sources.receipts.degraded, true,
      'malformed JSON triggers receipts.degraded');
    assert.ok(m.sources.receipts.invalid_count >= 1,
      'at least one invalid receipt (the truncated one)');

    assert.strictEqual(m.sources.envelopes.degraded, true,
      'additionalProperties violation triggers envelopes.degraded');
    assert.ok(m.sources.envelopes.invalid_count >= 1,
      'at least one invalid envelope');

    const sources = ['receipts', 'envelopes'];
    for (const s of sources) {
      const w = (m.warnings || []).find(x => x && x.source === s);
      assert.ok(w, 'warning emitted for source ' + s);
    }

    if (externalSentinelPath !== null) {
      // Symlink branch ran. Derive must NOT dereference the link — none of the
      // sentinel strings (top-level gate_id/decision_id, meta.created_at,
      // meta.command, secret) may appear anywhere in the model. The guard in
      // receipt/store.js#readReceipt makes this hold by failing isPlainFile
      // before fs.readFileSync runs; the resulting throw turns into an
      // ok:false items entry whose error message is the receipt's own path,
      // not the symlink target.
      const serialized = JSON.stringify(m);
      const forbiddenSentinels = [
        'EXTERNAL-SENTINEL-SHOULD-NEVER-LEAK',
        'EXFILTRATION-CANARY-DECISION',
        'EXTERNAL-SENTINEL-CREATED-AT',
        'EXFILTRATION-CANARY-CMD',
        'EXFILTRATION-CANARY-SECRET',
      ];
      for (const s of forbiddenSentinels) {
        assert.strictEqual(serialized.indexOf(s), -1,
          'derive must not surface external sentinel string: ' + s);
      }
      // And the guard must surface as an invalid receipt item (degraded:true
      // already asserted above) so the user sees an amber verdict rather than
      // a silent skip.
      const symItem = m.sources.receipts.items.find(i =>
        i && i.ok === false && i.gate === 'sym-gate');
      assert.ok(symItem,
        'symlink receipt must surface as ok:false item (not silently skipped)');
      assert.match(symItem.error || '',
        /symlink|special|UNSAFE_RECEIPT_FILE|regular file/i,
        'item.error must reference the symlink/regular-file guard, not the link target');
    }
  } finally {
    cleanup(root);
    if (externalSentinelPath !== null) {
      try { cleanup(path.dirname(externalSentinelPath)); } catch (_) { /* ignore */ }
    }
  }
});
