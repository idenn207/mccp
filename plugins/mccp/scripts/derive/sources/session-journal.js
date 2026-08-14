'use strict';

// derive source: session-journal (multi-session-work-loop M5)
//
// 관측: `.claude/state/journal/` — 상태 진실원 저널. 통합 모델에 요약을 노출하고,
//       A4의 경계 스코프 분자를 함께 실어 `computeA4`가 소비하게 한다.
// read-only · degraded fail-open per-source (다른 source와 동일 계약).
//
// 이 source가 없으면 `computeA4`는 저널을 볼 수 없어 계속 `forward-only`에 머문다 —
// M5가 배송하는 것은 분자 그 자체이고, 그것을 대시보드까지 도달시키는 것이 여기다.

const fs = require('fs');
const path = require('path');

function scanSessionJournal(repoRoot) {
  const result = {
    ok: true,
    journal_present: false,
    degraded: false,
    record_count: 0,
    malformed_count: 0,
    checkpoint_present: false,
    ledger_seeded_tombstones: 0,
    ledger_corrupt_entries: 0,
    a4: null,
    producer_coverage: 'state-journal',
    error: null,
  };

  try {
    const journalDir = path.join(repoRoot, '.claude', 'state', 'journal');
    if (!fs.existsSync(journalDir)) return result;
    result.journal_present = true;

    const store = require('../../state/journal-store');
    result.degraded = store.isDegraded({ repoRoot: repoRoot });

    const read = store.readRecords({ repoRoot: repoRoot });
    result.record_count = read.records.length;
    result.malformed_count = read.malformed_count;
    result.checkpoint_present = !!store.readCheckpoint({ repoRoot: repoRoot });

    const seed = store.seedTombstonesFromLedger({ repoRoot: repoRoot });
    result.ledger_seeded_tombstones = seed.seeded;
    result.ledger_corrupt_entries = seed.corrupt;

    const { deriveA4Boundary, readSidecars } =
      require('../../lib/msw-metrics/a4-boundary-restore');
    result.a4 = deriveA4Boundary({
      records: read.records,
      sidecars: readSidecars(path.join(repoRoot, '.claude', 'state')),
    });
  } catch (err) {
    result.ok = false;
    result.error = err && err.message;
    result.degraded = true;
  }

  return result;
}

module.exports = {
  scanSessionJournal,
};
