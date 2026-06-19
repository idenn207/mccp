'use strict';

// v1.3.0-m6 — Snapshot writer generic-interface smoke.
//
// Fixture B/C parity with derive/tests/generic-interface.test.js:
//   - Fixture B parity → derive model with receipts.count=0 + envelopes.count=0
//     → writeSnapshotIfNeeded must short-circuit (written:false, no file).
//   - Fixture C parity → derive model with non-mccp gate_id receipts +
//     mccp-extension fields missing → writeSnapshotIfNeeded must write
//     payload with `gate_id: 'foo-gate'` raw + briefing_* projected as null.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeSnapshotIfNeeded, SNAPSHOTS_SUBDIR } = require('../');

function tmpRepo(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'mccp-snapshot-gen-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
}

function emptyModel() {
  return {
    schema_version: 'v1',
    derived_at: '2026-06-19T00:00:00.000Z',
    repo_root: '<repo>',
    masked: true,
    m0_capability: { contract_present: true, evidence: '' },
    sources: {
      plans:     { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      receipts:  { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      state:     { ok: true, item: null, degraded: false, error: null },
      backlog:   { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      fix_task:  { ok: true, item: null, degraded: false, error: null },
      pr:        { ok: true, item: null, degraded: false, error: null },
      envelopes: { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
    },
    correlations: [],
    warnings: [],
  };
}

test('snapshot-generic B-parity: empty receipts + envelopes → written:false (idempotent short-circuit)', () => {
  const root = tmpRepo();
  try {
    const model = emptyModel();
    const r = writeSnapshotIfNeeded(model, { repoRoot: root, _todayYmd: '2026-06-19' });
    assert.equal(r.written, false, 'written must be false on empty');
    assert.equal(r.path, null);
    assert.deepEqual(r.evicted, []);
    assert.equal(r.error, null);

    const expectedPath = path.join(root, SNAPSHOTS_SUBDIR, '2026-06-19.json');
    assert.equal(fs.existsSync(expectedPath), false,
      'no snapshot file should be created on empty');
  } finally {
    cleanup(root);
  }
});

test('snapshot-generic C-parity: non-mccp gate_id + extension fields absent → snapshot writes with null fallback', () => {
  const root = tmpRepo();
  try {
    const model = emptyModel();
    // Mirror Fixture C — derive's `gate` field (extract() returns
    // `gate: entry.gate_id`). mccp-extension fields are absent (undefined).
    model.sources.receipts = {
      ok: true,
      count: 2,
      items: [
        {
          ok: true,
          gate: 'foo-gate',
          decision_id: 'decision-1',
          converged: true,
          receipt_hash: 'sha256:' + '1'.repeat(64),
          created_at: '2026-06-18T00:00:00.000Z',
        },
        {
          ok: true,
          gate: 'bar-gate',
          decision_id: 'decision-2',
          converged: true,
          receipt_hash: 'sha256:' + '2'.repeat(64),
          created_at: '2026-06-18T00:30:00.000Z',
        },
      ],
      invalid_count: 0,
      degraded: false,
      error: null,
    };

    const r = writeSnapshotIfNeeded(model, { repoRoot: root, _todayYmd: '2026-06-19' });
    assert.equal(r.written, true, 'written must be true with non-zero receipts');
    assert.equal(r.error, null);
    assert.ok(r.path, 'path returned');

    const payload = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    assert.equal(payload.counts.receipts, 2);
    assert.equal(payload.receipts.length, 2);

    const foo = payload.receipts.find(x => x.gate_id === 'foo-gate');
    const bar = payload.receipts.find(x => x.gate_id === 'bar-gate');
    assert.ok(foo, 'foo-gate projected');
    assert.ok(bar, 'bar-gate projected');

    // All mccp-extension fields must be null (not undefined — projection
    // normalizes absent → null).
    for (const r of [foo, bar]) {
      assert.equal(r.briefing_summary, null);
      assert.equal(r.briefing_token_count, null);
      assert.equal(r.briefing_invocation_count, null);
      assert.equal(r.codex_skipped_at_pr, false);
      assert.equal(r.codex_skip_reason, null);
      assert.equal(r.codex_dedupe_at_pr, false);
      assert.equal(r.ipc_envelope_path, null);
      assert.equal(r.dispatched_by_controller_session_id, null);
      assert.equal(r.worker_dispatch_id, null);
    }
  } finally {
    cleanup(root);
  }
});

test('snapshot-generic: second-call same UTC day is idempotent (no overwrite)', () => {
  const root = tmpRepo();
  try {
    const model = emptyModel();
    model.sources.receipts = {
      ok: true,
      count: 1,
      items: [{
        ok: true,
        gate: 'qux-gate',
        decision_id: 'd',
        converged: true,
        receipt_hash: 'sha256:' + '3'.repeat(64),
        created_at: '2026-06-19T00:00:00.000Z',
      }],
      invalid_count: 0, degraded: false, error: null,
    };

    const r1 = writeSnapshotIfNeeded(model, { repoRoot: root, _todayYmd: '2026-06-19' });
    assert.equal(r1.written, true);
    const firstStat = fs.statSync(r1.path);

    const r2 = writeSnapshotIfNeeded(model, { repoRoot: root, _todayYmd: '2026-06-19' });
    assert.equal(r2.written, false, 'second call must not overwrite');
    assert.equal(r2.path, r1.path, 'returns same path');
    const secondStat = fs.statSync(r2.path);
    assert.equal(secondStat.mtimeMs, firstStat.mtimeMs,
      'mtime unchanged (no overwrite)');
  } finally {
    cleanup(root);
  }
});

test('snapshot-generic: retention runs on degraded foreign repo without throwing', () => {
  const root = tmpRepo();
  try {
    // Pre-seed an old snapshot beyond the 30-day window
    const snapshotsDir = path.join(root, SNAPSHOTS_SUBDIR);
    fs.mkdirSync(snapshotsDir, { recursive: true });
    fs.writeFileSync(path.join(snapshotsDir, '2025-01-01.json'),
      JSON.stringify({ stale: true }), 'utf8');

    const model = emptyModel();
    // Foreign-style receipts with extension fields absent
    model.sources.receipts = {
      ok: true,
      count: 1,
      items: [{
        ok: true,
        gate: 'foreign-x',
        decision_id: 'd1',
        converged: true,
        receipt_hash: null,
        created_at: '2026-06-19T00:00:00.000Z',
      }],
      invalid_count: 0, degraded: false, error: null,
    };

    let r;
    assert.doesNotThrow(() => {
      r = writeSnapshotIfNeeded(model, { repoRoot: root, _todayYmd: '2026-06-19' });
    });
    assert.equal(r.written, true);
    // Evicted should include the old stale snapshot
    assert.ok(r.evicted.includes('2025-01-01.json'),
      'evicted: ' + JSON.stringify(r.evicted));
  } finally {
    cleanup(root);
  }
});
