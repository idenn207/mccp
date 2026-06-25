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
  TIMELINE_EXPANDED,
} = require('../sections/audit-timeline');

// v1.18.7 M4 — count helper(겹치지 않는 substring 발생 횟수).
function count(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}
function makeLiveRows(n, now) {
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push(makeReceipt({
      decision_id: 'live-' + i,
      receipt_hash: 'sha256:live-' + i,
      created_at: new Date(now - (i + 1) * 60_000).toISOString(),
    }));
  }
  return items;
}

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

// v1.18.7 M4 (진실성) — decision_id 전체 보존. 이전 tail(…,24)는 공유 prefix 를
// 잘라 단어 중간이 깨졌다("dashboard-truthfulness-…" → "lness-…"). html 은 full id
// + title 툴팁(CSS ellipsis 가 prefix 유지 truncate), md 도 full id.
test('M4 decision 전체 표시: tail 중간잘림 제거, full id + title (진실성)', () => {
  const now = Date.UTC(2026, 5, 18);
  const longDec = 'dashboard-truthfulness-m4-surface-cleanup'; // 41자 (> 24)
  const items = [makeReceipt({
    decision_id: longDec, gate_id: 'mccp-implement-codex', converged: true, round: 1,
    receipt_hash: 'sha256:deadbeef', created_at: new Date(now - 60_000).toISOString(),
  })];
  const { html, md } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  // M6 followup — decision 이 main 으로 승격(gate sub). "/" prefix 제거 + tail 중간잘림 아님.
  assert.ok(!html.includes('>lness'), 'audit-dec span 이 중간 잘린 tail 로 시작 안 함');
  assert.ok(html.includes('>' + longDec + '<'), 'audit-dec 에 full decision_id');
  assert.ok(html.includes('title="' + longDec + '"'), 'title 툴팁에 full id');
  assert.ok(md.includes(longDec), 'md 에 full id');
});

// ── v1.18.7 M4 — 더보기(top-N + <details>) headline 회귀 ──

test('full mode timeline: 단일 <ol> 전체 행(더보기 제거) + md <details> 유지 (M5 Task 6)', () => {
  assert.equal(TIMELINE_EXPANDED, 8);
  const now = Date.UTC(2026, 5, 18);
  const items = makeLiveRows(12, now); // 12 ≤ MAX_ROWS_LIVE
  const { html, md } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  // 모든 12행 렌더(단일 <ol>).
  assert.equal(count(html, 'class="audit-row"'), 12, '12 audit-row 전부 렌더');
  // M5 Task 6 — full mode: 단일 timeline <ol>(더보기 <details><ol> 제거).
  assert.equal(count(html, '<ol class="timeline">'), 1, '단일 <ol>(full mode)');
  assert.ok(!html.includes('<details class="more">'), 'html 더보기 <details> 제거');
  // md 는 top-N + <details> 접힘 유지(plain-text 도달성).
  assert.match(md, /<details>\n<summary>\+4 더보기<\/summary>/, 'md +4 더보기 접힘');
});

test('M4 더보기 detailMap: expanded/collapsed 무관 모든 렌더 행에 detail 적재(H18)', () => {
  const now = Date.UTC(2026, 5, 18);
  const items = makeLiveRows(12, now);
  const { details } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  assert.equal(details.size, 12, '12 행 모두 drawer detail(접힘 행 포함)');
});

test('full mode connector: 글로벌 마지막 행만 connector 생략 (M5 Task 6)', () => {
  const now = Date.UTC(2026, 5, 18);
  const items = makeLiveRows(12, now);
  const { html } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  // connector(audit-line) 는 12행 중 글로벌 마지막 1개만 생략 → 11개. 단일 <ol> 합치기
  // 후에도 isLast/connector 가 글로벌 시퀀스 기준이라 rail 연속성 유지.
  assert.equal(count(html, 'class="audit-line"'), 11, '글로벌 마지막만 connector 생략');
  assert.equal(count(html, 'class="audit-row"'), 12, '단일 <ol> 12행');
});

test('full mode 각주 순서: +N older 가 단일 <ol> 뒤 <ul class="audit-notes"> (M5 Task 6)', () => {
  const now = Date.UTC(2026, 5, 18);
  const items = makeLiveRows(25, now); // 20 shown(8+12) + 5 older
  const { html, md } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  // M5 Task 6 — html full mode: 더보기 제거. md 가 +12 더보기 접힘 유지.
  assert.ok(!html.includes('<details class="more">'), 'html 더보기 <details> 제거');
  assert.match(md, /\+12 더보기/, 'md 12 collapsed → +12 더보기');
  assert.match(html, /<ul class="audit-notes">/, '각주 별도 <ul> 컨테이너');
  assert.match(html, /<li class="audit-note muted"><em>\+5 older<\/em><\/li>/, '+5 older 각주');
  // 순서: </ol> → <ul class="audit-notes"> → +5 older.
  const idxOlEnd = html.lastIndexOf('</ol>');
  const idxNotes = html.indexOf('<ul class="audit-notes">');
  const idxOlder = html.indexOf('+5 older');
  assert.ok(idxOlEnd !== -1 && idxNotes > idxOlEnd, '각주 <ul> 은 </ol> 뒤');
  assert.ok(idxOlder > idxNotes, '+5 older 는 audit-notes 안');
  // md 도 각주가 접힘 <details> 뒤.
  assert.ok(md.indexOf('+5 older') > md.indexOf('</details>'), 'md 각주 접힘 뒤');
});
