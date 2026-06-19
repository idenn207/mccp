'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  writeSnapshotIfNeeded,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOTS_SUBDIR,
  RETENTION_DAYS,
  _parseFilenameDate,
  _ymdToUtcMs,
  _projectReceipt,
} = require('../');

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-snapshot-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
}

function stubModel(opts) {
  opts = opts || {};
  return {
    schema_version: 'v1',
    derived_at: '2026-06-19T00:00:00.000Z',
    repo_root: opts.repo_root || '<repo>',
    masked: opts.masked !== undefined ? opts.masked : true,
    m0_capability: { contract_present: true, evidence: '' },
    sources: {
      plans:     { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      receipts:  {
        ok: true,
        count: (opts.receipts && opts.receipts.length) || 0,
        items: opts.receipts || [],
        invalid_count: 0, degraded: false, error: null,
      },
      state:     { ok: true, item: null, degraded: false, error: null },
      backlog:   { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      fix_task:  { ok: true, item: null, degraded: false, error: null },
      pr:        { ok: true, item: null, degraded: false, error: null },
      envelopes: {
        ok: true,
        count: (opts.envelopes && opts.envelopes.length) || 0,
        items: opts.envelopes || [],
        invalid_count: 0, degraded: false, error: null,
      },
    },
    correlations: [],
    warnings: [],
  };
}

function stubReceipt(over) {
  return Object.assign({
    ok: true,
    gate: 'mccp-implement-codex',
    decision_id: 'v1-3-0-test-decision',
    created_at: '2026-06-19T00:00:00.000Z',
    converged: true,
    receipt_hash: 'sha256:abc123',
    briefing_summary: null,
    briefing_token_count: null,
    briefing_invocation_count: 0,
    codex_skipped_at_pr: false,
    codex_skip_reason: null,
    codex_dedupe_at_pr: false,
    ipc_envelope_path: null,
    dispatched_by_controller_session_id: null,
    worker_dispatch_id: null,
  }, over || {});
}

function todayUtcYmd() { return new Date().toISOString().slice(0, 10); }

// Path (a) — first call on empty cache writes today's snapshot with expected schema.
test('snapshot.test path a: writes today snapshot with snapshot-v1 schema and projected receipts', () => {
  const root = tmpRepo();
  try {
    const model = stubModel({
      receipts: [stubReceipt({
        briefing_summary: 'test summary',
        briefing_token_count: 42,
        briefing_invocation_count: 1,
      })],
    });
    const result = writeSnapshotIfNeeded(model, { repoRoot: root });
    assert.equal(result.written, true, 'first call writes');
    assert.ok(result.path, 'returns path');
    assert.ok(fs.existsSync(result.path), 'file exists on disk');
    const payload = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    assert.equal(payload.schema_version, SNAPSHOT_SCHEMA_VERSION);
    assert.equal(payload.snapshot_date, todayUtcYmd());
    assert.equal(payload.counts.receipts, 1);
    assert.equal(payload.receipts.length, 1);
    assert.equal(payload.receipts[0].briefing_summary, 'test summary');
    assert.equal(payload.receipts[0].briefing_token_count, 42);
    assert.equal(payload.receipts[0].receipt_hash, 'sha256:abc123');
    assert.equal(payload.receipts[0].gate_id, 'mccp-implement-codex');
  } finally { cleanup(root); }
});

// Path (b) — second call same UTC day is no-op.
test('snapshot.test path b: idempotent on same UTC day', () => {
  const root = tmpRepo();
  try {
    const model = stubModel({ receipts: [stubReceipt()] });
    const r1 = writeSnapshotIfNeeded(model, { repoRoot: root });
    assert.equal(r1.written, true);
    const mtimeBefore = fs.statSync(r1.path).mtimeMs;

    const r2 = writeSnapshotIfNeeded(model, { repoRoot: root });
    assert.equal(r2.written, false, 'second call is no-op');
    assert.equal(r2.path, r1.path, 'path surfaces for introspection');
    const mtimeAfter = fs.statSync(r1.path).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter, 'file untouched');
  } finally { cleanup(root); }
});

// Path (c) — empty-state short-circuit writes nothing, but retention still runs.
test('snapshot.test path c: empty-state short-circuits write but runs retention (F4 absorption)', () => {
  const root = tmpRepo();
  try {
    // Pre-seed an out-of-window snapshot.
    const snapshotsDir = path.join(root, SNAPSHOTS_SUBDIR);
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const oldYmd = '2025-01-01';
    const oldPath = path.join(snapshotsDir, oldYmd + '.json');
    fs.writeFileSync(oldPath, '{}');

    const model = stubModel({ receipts: [], envelopes: [] });
    const result = writeSnapshotIfNeeded(model, { repoRoot: root });
    assert.equal(result.written, false, 'empty state short-circuits write');
    assert.equal(result.path, null);
    assert.deepEqual(result.evicted, [oldYmd + '.json'], 'retention still evicted old file');
    assert.equal(fs.existsSync(oldPath), false, 'old snapshot unlinked');
  } finally { cleanup(root); }
});

// Path (d) — pre-existing 31-day-old snapshot is evicted on a normal write.
test('snapshot.test path d: evicts 31-day-old snapshot on write', () => {
  const root = tmpRepo();
  try {
    const snapshotsDir = path.join(root, SNAPSHOTS_SUBDIR);
    fs.mkdirSync(snapshotsDir, { recursive: true });
    // 35-day-old synthetic snapshot.
    const oldMs = Date.now() - (35 * 24 * 60 * 60 * 1000);
    const oldYmd = new Date(oldMs).toISOString().slice(0, 10);
    const oldPath = path.join(snapshotsDir, oldYmd + '.json');
    fs.writeFileSync(oldPath, '{}');

    const model = stubModel({ receipts: [stubReceipt()] });
    const result = writeSnapshotIfNeeded(model, { repoRoot: root });
    assert.equal(result.written, true);
    assert.ok(result.evicted.indexOf(oldYmd + '.json') !== -1,
      'old snapshot evicted: ' + JSON.stringify(result.evicted));
    assert.equal(fs.existsSync(oldPath), false);
  } finally { cleanup(root); }
});

// Path (e) — _injectFsThrow returns error + does not throw to caller.
test('snapshot.test path e: _injectFsThrow returns {written:false,error} and does NOT throw', () => {
  const root = tmpRepo();
  try {
    const model = stubModel({ receipts: [stubReceipt()] });
    let result;
    assert.doesNotThrow(() => {
      result = writeSnapshotIfNeeded(model, {
        repoRoot: root,
        _injectFsThrow: true,
      });
    }, 'must NOT throw — loud fail-open invariant');
    assert.equal(result.written, false);
    assert.ok(result.error, 'error surfaced');
    assert.ok(result.error.indexOf('injected fs throw') !== -1);
  } finally { cleanup(root); }
});

// Path (f) — snapshot content is always masked even when input model.masked=false.
test('snapshot.test path f: always-mask invariant (model.masked=false → snapshot still masked)', () => {
  const root = tmpRepo();
  try {
    // Raw mode model: real repo_root + masked:false. The receipt has a
    // briefing_summary containing a secret pattern (sk-key).
    const secret = 'sk-' + 'A'.repeat(30);
    const model = stubModel({
      repo_root: root,
      masked: false,
      receipts: [stubReceipt({
        briefing_summary: 'leaked ' + secret + ' here',
        briefing_token_count: 10,
        briefing_invocation_count: 1,
      })],
    });
    const result = writeSnapshotIfNeeded(model, { repoRoot: root });
    assert.equal(result.written, true);
    const payload = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    assert.equal(payload.receipts[0].briefing_summary.indexOf(secret), -1,
      'raw secret must NOT appear in snapshot');
    assert.ok(payload.receipts[0].briefing_summary.indexOf('[REDACTED:sk-key]') !== -1,
      'secret replaced with REDACTED marker');
  } finally { cleanup(root); }
});

// Path (g) — future-dated file is skipped on eviction (F3 skew guard a).
test('snapshot.test path g: future-dated file is NOT unlinked (F3 skew guard a)', () => {
  const root = tmpRepo();
  try {
    const snapshotsDir = path.join(root, SNAPSHOTS_SUBDIR);
    fs.mkdirSync(snapshotsDir, { recursive: true });
    // 10 days in the future.
    const futureMs = Date.now() + (10 * 24 * 60 * 60 * 1000);
    const futureYmd = new Date(futureMs).toISOString().slice(0, 10);
    const futurePath = path.join(snapshotsDir, futureYmd + '.json');
    fs.writeFileSync(futurePath, '{}');

    const model = stubModel({ receipts: [stubReceipt()] });
    const result = writeSnapshotIfNeeded(model, { repoRoot: root });
    assert.equal(result.written, true);
    assert.equal(fs.existsSync(futurePath), true, 'future-dated file preserved');
    assert.equal(result.evicted.indexOf(futureYmd + '.json'), -1,
      'future-dated not reported as evicted');
  } finally { cleanup(root); }
});

// Path (h) — stale .last-render.json (cutoff > render_at) aborts eviction (F3 skew guard b).
test('snapshot.test path h: cutoff > last-render.render_at aborts eviction (F3 skew guard b)', () => {
  const root = tmpRepo();
  try {
    const snapshotsDir = path.join(root, SNAPSHOTS_SUBDIR);
    fs.mkdirSync(snapshotsDir, { recursive: true });
    // Pre-seed 35-day-old snapshot that would normally be evicted.
    const oldMs = Date.now() - (35 * 24 * 60 * 60 * 1000);
    const oldYmd = new Date(oldMs).toISOString().slice(0, 10);
    const oldPath = path.join(snapshotsDir, oldYmd + '.json');
    fs.writeFileSync(oldPath, '{}');

    const model = stubModel({ receipts: [stubReceipt()] });
    // _injectStaleLastRender: simulate a last-render anchor that's so old
    // the cutoff (today-30d) exceeds it → clock skew suspect.
    const result = writeSnapshotIfNeeded(model, {
      repoRoot: root,
      _injectStaleLastRender: true,
    });
    assert.equal(result.written, true, 'new write still proceeds');
    assert.equal(fs.existsSync(oldPath), true,
      'old snapshot preserved — eviction aborted on skew');
    assert.equal(result.evicted.length, 0, 'no eviction reported');
  } finally { cleanup(root); }
});

// Internals: parseFilenameDate + projection coverage.
test('snapshot.test: _parseFilenameDate parses YYYY-MM-DD.json + rejects malformed', () => {
  assert.equal(_parseFilenameDate('2026-06-19.json'), Date.UTC(2026, 5, 19));
  assert.equal(_parseFilenameDate('foo.json'), null);
  assert.equal(_parseFilenameDate('2026-06-19.txt'), null);
  assert.equal(_parseFilenameDate('2026-13-19.json'), Date.UTC(2026, 12, 19),
    'JS Date.UTC overflows month silently — by design, downstream filter still works');
});

test('snapshot.test: _projectReceipt drops ok=false entries and surfaces all timeline fields', () => {
  assert.equal(_projectReceipt({ ok: false, error: 'missing' }), null);
  assert.equal(_projectReceipt(null), null);
  const projected = _projectReceipt(stubReceipt({ briefing_summary: 'x', briefing_token_count: 5 }));
  assert.equal(projected.gate_id, 'mccp-implement-codex');
  assert.equal(projected.briefing_summary, 'x');
  assert.equal(projected.briefing_token_count, 5);
  assert.equal(projected.receipt_hash, 'sha256:abc123');
  assert.equal('codex_dedupe_at_pr' in projected, true);
  assert.equal('worker_dispatch_id' in projected, true);
  assert.equal('dispatched_by_controller_session_id' in projected, true);
});

test('snapshot.test: RETENTION_DAYS export is 30', () => {
  assert.equal(RETENTION_DAYS, 30);
});

test('snapshot.test: _ymdToUtcMs round-trips a known date', () => {
  assert.equal(_ymdToUtcMs('2026-06-19'), Date.UTC(2026, 5, 19));
});
