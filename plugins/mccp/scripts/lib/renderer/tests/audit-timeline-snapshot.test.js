'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const formatUtils = require('../format-utils');
const {
  renderAuditTimeline,
  _rowKey,
  _readSnapshotRows,
  MAX_ROWS_LIVE,
} = require('../sections/audit-timeline');

function tmpSnapshotsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-audit-snap-'));
}
function cleanup(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
}

function makeReceipt(over) {
  return Object.assign({
    gate_id: 'mccp-implement-codex',
    decision_id: 'live-decision',
    converged: true,
    receipt_hash: 'sha256:live',
    created_at: null,
    briefing_summary: null,
    briefing_token_count: null,
    briefing_invocation_count: 0,
  }, over || {});
}

function writeSnapshotFile(dir, ymd, payload) {
  fs.writeFileSync(path.join(dir, ymd + '.json'), JSON.stringify(payload));
}

// Path (a) — no snapshots dir → output identical to plain 7-day behavior.
test('audit-timeline-snapshot path a: no snapshotsDir → identical to base 7-day behavior', () => {
  const now = Date.UTC(2026, 5, 18);
  const items = [
    makeReceipt({ created_at: new Date(now - 60_000).toISOString(), decision_id: 'l1' }),
    makeReceipt({ created_at: new Date(now - 120_000).toISOString(), decision_id: 'l2' }),
  ];
  const baseline = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  const withOpts = renderAuditTimeline(
    { sources: { receipts: { items } } }, formatUtils, now, {}
  );
  assert.equal(baseline.md, withOpts.md);
  assert.equal(baseline.html, withOpts.html);
  assert.match(baseline.md, /l1/);
});

// Path (b) — snapshotsDir + sparse live archive band → snapshot rows merge.
test('audit-timeline-snapshot path b: live in 7-30d < 5 → snapshot rows merge with archive flag', () => {
  const now = Date.UTC(2026, 5, 18);
  const snapsDir = tmpSnapshotsDir();
  try {
    // Live: one recent (within 7d) and zero in 7-30d band.
    const liveItems = [
      makeReceipt({ decision_id: 'today', created_at: new Date(now - 3600_000).toISOString() }),
    ];
    // Snapshot: 14-day-old receipt.
    const snap14 = {
      schema_version: 'snapshot-v1',
      receipts: [{
        gate_id: 'mccp-plan-codex',
        decision_id: 'archived-14d',
        receipt_hash: 'sha256:archive14',
        converged: true,
        created_at: new Date(now - 14 * 86400_000).toISOString(),
      }],
    };
    writeSnapshotFile(snapsDir, '2026-06-04', snap14);

    const { md, html } = renderAuditTimeline(
      { sources: { receipts: { items: liveItems } } },
      formatUtils, now,
      { snapshotsDir: snapsDir }
    );
    assert.match(md, /archived-14d/, 'archive entry merged into md');
    assert.match(md, /보관 스냅샷에서 복원/, 'archive footnote present');
    assert.match(html, /from-snapshot/, 'HTML class applied');
    assert.match(html, /class="audit-note muted from-snapshot-footnote"/);
  } finally { cleanup(snapsDir); }
});

// Path (c) — de-dup: live wins on collision (same gate+decision+receipt_hash).
test('audit-timeline-snapshot path c: de-dup gate+decision+receipt_hash → live wins', () => {
  const now = Date.UTC(2026, 5, 18);
  const snapsDir = tmpSnapshotsDir();
  try {
    const liveItems = [
      makeReceipt({
        decision_id: 'overlap',
        receipt_hash: 'sha256:overlap',
        created_at: new Date(now - 3600_000).toISOString(),
      }),
    ];
    const snapPayload = {
      schema_version: 'snapshot-v1',
      receipts: [
        // Same identity as live — should be dropped.
        {
          gate_id: 'mccp-implement-codex',
          decision_id: 'overlap',
          receipt_hash: 'sha256:overlap',
          converged: true,
          created_at: new Date(now - 14 * 86400_000).toISOString(),
          briefing_summary: 'STALE archive should be dropped',
        },
        // Different identity — should be kept.
        {
          gate_id: 'mccp-implement-codex',
          decision_id: 'unique-archive',
          receipt_hash: 'sha256:unique',
          converged: true,
          created_at: new Date(now - 14 * 86400_000).toISOString(),
        },
      ],
    };
    writeSnapshotFile(snapsDir, '2026-06-04', snapPayload);

    const { md } = renderAuditTimeline(
      { sources: { receipts: { items: liveItems } } },
      formatUtils, now,
      { snapshotsDir: snapsDir }
    );
    assert.equal(md.indexOf('STALE archive should be dropped'), -1,
      'archived row with collision identity is dropped');
    // tail(s, 12): "unique-archive" → "ique-archive"
    assert.match(md, /ique-archive/, 'non-colliding archived row is kept');
  } finally { cleanup(snapsDir); }
});

// Path (d) — corrupt snapshot file is silently skipped; other snapshots still merge.
test('audit-timeline-snapshot path d: corrupt snapshot JSON silently skipped, others merge', () => {
  const now = Date.UTC(2026, 5, 18);
  const snapsDir = tmpSnapshotsDir();
  try {
    // One corrupt + one valid snapshot.
    fs.writeFileSync(path.join(snapsDir, '2026-06-05.json'), '{not-valid-json');
    const valid = {
      schema_version: 'snapshot-v1',
      receipts: [{
        gate_id: 'mccp-plan-codex',
        decision_id: 'kept-after-corruption',
        receipt_hash: 'sha256:kept',
        converged: true,
        created_at: new Date(now - 15 * 86400_000).toISOString(),
      }],
    };
    writeSnapshotFile(snapsDir, '2026-06-03', valid);

    let result;
    assert.doesNotThrow(() => {
      result = renderAuditTimeline(
        { sources: { receipts: { items: [
          makeReceipt({ decision_id: 'today-live', created_at: new Date(now - 3600_000).toISOString() }),
        ] } } },
        formatUtils, now,
        { snapshotsDir: snapsDir }
      );
    }, 'corrupt file must not throw');
    // decision_id is rendered through tail(s, 12) → "kept-after-corruption" → "r-corruption"
    assert.match(result.md, /r-corruption/, 'valid snapshot still surfaces');
  } finally { cleanup(snapsDir); }
});

// Internals
test('audit-timeline-snapshot: rowKey uses receipt_hash when present, falls back to created_at', () => {
  const withHash = { gate_id: 'g', decision_id: 'd', receipt_hash: 'sha256:h' };
  const withoutHash = { gate_id: 'g', decision_id: 'd', created_at: '2026-06-19T00:00:00Z' };
  assert.equal(_rowKey(withHash), 'g|d|sha256:h');
  assert.equal(_rowKey(withoutHash), 'g|d|@2026-06-19T00:00:00Z');
});

test('audit-timeline-snapshot: readSnapshotRows ignores non-matching filenames + clamps to 30d window', () => {
  const now = Date.UTC(2026, 5, 18);
  const snapsDir = tmpSnapshotsDir();
  try {
    // Not a date filename — ignored.
    fs.writeFileSync(path.join(snapsDir, 'README.md'), '## not a snapshot');
    // 31-day-old: outside window.
    writeSnapshotFile(snapsDir, '2026-05-18', {
      receipts: [{
        gate_id: 'g', decision_id: 'too-old', receipt_hash: 'sha256:too',
        created_at: new Date(now - 31 * 86400_000).toISOString(),
      }],
    });
    // 14-day-old: inside window.
    writeSnapshotFile(snapsDir, '2026-06-04', {
      receipts: [{
        gate_id: 'g', decision_id: 'kept', receipt_hash: 'sha256:k',
        created_at: new Date(now - 14 * 86400_000).toISOString(),
      }],
    });
    const rows = _readSnapshotRows(snapsDir, now);
    const ids = rows.map(r => r.decision_id);
    assert.deepEqual(ids, ['kept']);
    assert.equal(rows[0].from_snapshot, true);
  } finally { cleanup(snapsDir); }
});

test('audit-timeline-snapshot: MAX_ROWS_LIVE export is 20', () => {
  assert.equal(MAX_ROWS_LIVE, 20);
});
