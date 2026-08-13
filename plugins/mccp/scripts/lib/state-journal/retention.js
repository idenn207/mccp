'use strict';

// multi-session-work-loop M5 — 이력 보존 정책 (G4 · UI6 응답).
//
// 설계: docs/multi-session-work-loop/state-truth-source-design.md
//
// **`evictLRU` 방식의 무조건 unlink는 쓰지 않는다** (DD1). `msw-events.js:104-111`은
// global cap 초과 시 오래된 파일의 20%를 지우는데, 그것이 바로 PRD가 M5로 없애려는
// "되돌릴 수 없는 압축"이다. 여기서는 checkpoint를 **무손실 접점**으로 남기고
// 세그먼트를 **회전**(이동)만 한다 — 삭제 경로가 없다.
//
// 판정(순수)과 실행(I/O)은 분리한다: `decideCompaction`은 숫자만 보고 답하므로
// test가 상한 발화를 파일 없이 고정할 수 있고, `compact`는 그 판정을 실행한다.

const fs = require('fs');
const path = require('path');

const journalStore = require('../../state/journal-store');
const record = require('./record');
const order = require('./order');
const projectMod = require('./project');

// 상한은 **상수**이며 토글이 아니다 (DD7 — 신규 토글은 정확히 1개). test 주입만
// 허용한다(M3 TTL 선례).
const LIMITS = {
  // 활성 세그먼트가 이 크기를 넘으면 압축한다. 투영은 checkpoint 이후 레코드만
  // 재생하므로 이 값이 곧 hot path의 재생 비용 상한이다.
  ACTIVE_MAX_BYTES: 256 * 1024,
  // 회전분을 포함한 저널 전체 상한. 초과해도 **삭제하지 않고** loud warn한다 —
  // 조용한 증발이 이 milestone이 없애려는 것이다.
  TOTAL_MAX_BYTES: 64 * 1024 * 1024,
  // 이 나이를 넘은 활성 레코드가 있으면 압축한다(용량과 무관한 시간 축).
  RETENTION_DAYS: 90,
};

function dirBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_e) { return 0; }
  for (const n of names) {
    try {
      const st = fs.statSync(path.join(dir, n));
      if (st.isFile()) total += st.size;
    } catch (_e) { /* ignore */ }
  }
  return total;
}

// 순수 판정. 상한 3종 중 하나라도 걸리면 압축한다.
function decideCompaction(args) {
  args = args || {};
  const limits = Object.assign({}, LIMITS, args.limits || {});
  const reasons = [];

  const activeBytes = Number(args.activeBytes) || 0;
  const totalBytes = Number(args.totalBytes) || 0;
  if (activeBytes > limits.ACTIVE_MAX_BYTES) {
    reasons.push('active-segment-bytes ' + activeBytes + ' > ' + limits.ACTIVE_MAX_BYTES);
  }

  if (args.oldestTs) {
    const now = args.now ? Date.parse(args.now) : Date.now();
    const oldest = Date.parse(args.oldestTs);
    if (Number.isFinite(oldest) && Number.isFinite(now)) {
      const ageDays = (now - oldest) / (24 * 60 * 60 * 1000);
      if (ageDays > limits.RETENTION_DAYS) {
        reasons.push('oldest-active-record ' + Math.floor(ageDays) + 'd > ' +
          limits.RETENTION_DAYS + 'd');
      }
    }
  }

  // 전역 상한은 압축을 유발하되 **삭제를 유발하지 않는다**. 압축해도 총량이
  // 줄지 않을 수 있으므로 경고를 따로 낸다.
  const overTotal = totalBytes > limits.TOTAL_MAX_BYTES;
  if (overTotal) {
    reasons.push('total-journal-bytes ' + totalBytes + ' > ' + limits.TOTAL_MAX_BYTES);
  }

  return {
    compact: reasons.length > 0,
    overTotal: overTotal,
    reasons: reasons,
    limits: limits,
  };
}

function nextSegmentName(opts) {
  const dir = journalStore.segmentsDir(opts);
  let names = [];
  try { names = fs.readdirSync(dir).filter(function (n) { return n.endsWith('.jsonl'); }); }
  catch (_e) { names = []; }
  let max = 0;
  for (const n of names) {
    const m = /^(\d+)\.jsonl$/.exec(n);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1).padStart(6, '0') + '.jsonl';
}

// 압축 실행.
//
// **순서 불변식 (security-reviewer S5)**: ① checkpoint를 tmp→rename으로 착지
// ② rename이 성공한 **이후에만** 활성 세그먼트를 `segments/`로 이동(삭제 아님).
// ①과 ② 사이에서 크래시해도 활성 세그먼트가 그대로 남아 투영은
// `checkpoint + 같은 레코드 재적용`이 되는데, `mergeState`는 섹션을 통째로
// 교체하므로 같은 patch를 다시 접어도 결과가 같다 — 즉 tail 유실 없이 수렴한다.
function compact(opts) {
  opts = opts || {};
  const dir = journalStore.resolveJournalDir(opts);
  if (!fs.existsSync(dir)) return { ok: true, compacted: false, reason: 'no-journal' };

  if (journalStore.isDegraded(opts)) {
    return { ok: false, compacted: false, reason: 'degraded' };
  }

  const input = journalStore.readProjectionInput(opts);
  if (input.records.length === 0) {
    return { ok: true, compacted: false, reason: 'no-records' };
  }

  const state = projectMod.project(input.records, input.base, {
    seededTombstones: input.seededTombstones,
    baseIndex: input.baseIndex,
  });

  let throughSeq = 0;
  let lastRec = null;
  for (const r of input.records) {
    const s = Number(r.seq);
    if (Number.isInteger(s) && s > throughSeq) throughSeq = s;
    lastRec = r;
  }

  const checkpoint = record.makeRecord({
    session_id: (lastRec && lastRec.session_id) || 'unknown',
    session_epoch: (lastRec && lastRec.session_epoch) || new Date().toISOString(),
    epoch_source: (lastRec && lastRec.epoch_source) || 'ts-fallback',
    prev_session_id: null,
    work_unit: 'checkpoint',
    seq: throughSeq + 1,
    kind: 'checkpoint',
    checkpoint_of: {
      through_seq: throughSeq,
      record_count: input.records.length,
      state: state,
      // D1 — 상태만 봉인하면 순서 메타가 회전과 함께 사라진다. 압축 직후
      // 인덱스가 빈 상태로 시작해 stale writer의 옛 seq가 admit된다.
      order_index: order.snapshotOrderIndex(order.buildOrderIndex(input.records, {
        seededTombstones: input.seededTombstones,
        baseIndex: input.baseIndex,
      })),
    },
  });

  const wrote = journalStore.writeCheckpoint(checkpoint, opts);
  if (!wrote.ok) return { ok: false, compacted: false, reason: wrote.reason };

  // ② rename 성공 이후에만 회전한다.
  const active = journalStore.activePath(opts);
  const segDir = journalStore.segmentsDir(opts);
  let rotatedTo = null;
  if (fs.existsSync(active)) {
    try {
      fs.mkdirSync(segDir, { recursive: true });
      rotatedTo = path.join(segDir, nextSegmentName(opts));
      fs.renameSync(active, rotatedTo);
    } catch (err) {
      // 회전 실패는 손실이 아니다 — checkpoint는 이미 착지했고 활성 세그먼트도
      // 그대로다. 다음 압축이 다시 시도한다.
      process.stderr.write('[mccp:journal-retention] WARNING: checkpoint landed but ' +
        'segment rotation failed (' + (err && err.message) + '); history is intact, ' +
        'the active segment will be rotated on the next compaction\n');
      rotatedTo = null;
    }
  }

  return {
    ok: true,
    compacted: true,
    through_seq: throughSeq,
    record_count: input.records.length,
    rotated_to: rotatedTo,
    checkpoint_id: checkpoint.record_id,
  };
}

// 상한 검사 + 필요 시 압축. append 경로가 부르는 진입점.
function enforceLimits(opts) {
  opts = opts || {};
  const dir = journalStore.resolveJournalDir(opts);
  if (!fs.existsSync(dir)) return { compact: false, reasons: [] };

  const active = journalStore.activePath(opts);
  let activeBytes = 0;
  try { activeBytes = fs.statSync(active).size; } catch (_e) { activeBytes = 0; }

  const totalBytes = dirBytes(dir) + dirBytes(journalStore.segmentsDir(opts));

  // 호출자가 이미 읽은 레코드를 재사용한다 — 이 경로는 **모든 `update()`가
  // 지나는 hot path**라 저널을 두 번 읽으면 그 비용이 매 변형마다 붙는다.
  const records = Array.isArray(opts.records)
    ? opts.records
    : journalStore.readRecords(Object.assign({}, opts, { includeSegments: false })).records;
  const oldestTs = records.length > 0 ? records[0].ts : null;

  const decision = decideCompaction({
    activeBytes: activeBytes,
    totalBytes: totalBytes,
    oldestTs: oldestTs,
    now: opts.now,
    limits: opts.limits,
  });

  if (decision.overTotal) {
    process.stderr.write('[mccp:journal-retention] WARNING: journal total ' + totalBytes +
      ' bytes exceeds ' + decision.limits.TOTAL_MAX_BYTES + '. Segments are NOT deleted ' +
      '(silent history loss is what this milestone removes) — prune manually if needed.\n');
  }

  if (!decision.compact) return Object.assign({ executed: null }, decision);
  return Object.assign({ executed: compact(opts) }, decision);
}

// degraded 복구 — 현재 STATE.md를 새 genesis로 봉인하고 마커를 지운다.
//
// **파괴가 이력에 남는다** (security-reviewer S6). 이전에는 reseed가 이력을
// 지우면서 자기 자신은 기록하지 않았다. 새 genesis는 `reseed_of`에 직전
// checkpoint의 접점·폐기 레코드 수·사유를 실어 봉인하고, 폐기된 활성 세그먼트는
// unlink가 아니라 `segments/`로 회전한다 — 인가 게이트를 만들지는 않지만(저장소
// write 권한자는 파일을 직접 지울 수 있으므로 CLI 게이트가 막지 못한다) 무엇이
// 언제 왜 지워졌는지는 반드시 남는다.
function reseed(opts) {
  opts = opts || {};
  const dir = journalStore.resolveJournalDir(opts);
  fs.mkdirSync(dir, { recursive: true });

  const priorCheckpoint = journalStore.readCheckpoint(opts);
  const read = journalStore.readRecords(Object.assign({}, opts, { includeSegments: false }));
  const marker = journalStore.readDegradedMarker(opts);

  const identity = record.resolveIdentity({
    env: opts.env || process.env,
    journalTail: read.records.length ? read.records[read.records.length - 1] : null,
    ledgerRead: opts.ledgerRead,
  });

  const priorThrough = (priorCheckpoint && priorCheckpoint.checkpoint_of &&
    priorCheckpoint.checkpoint_of.through_seq) || 0;

  const genesis = record.makeRecord({
    session_id: identity.session_id,
    session_epoch: identity.session_epoch,
    epoch_source: identity.epoch_source,
    prev_session_id: null,
    work_unit: 'genesis',
    seq: 1,
    kind: 'reseed',
    checkpoint_of: {
      through_seq: 0,
      record_count: 0,
      state: opts.state || null,
      reseed_of: {
        prior_checkpoint_id: (priorCheckpoint && priorCheckpoint.record_id) || null,
        prior_through_seq: priorThrough,
        discarded_record_count: read.records.length,
        degraded_entered_at: (marker && marker.entered_at) || null,
        degraded_reason: (marker && marker.reason) || null,
        reason: opts.reason || 'operator-invoked journal checkpoint --reseed',
        at: new Date().toISOString(),
      },
    },
  });

  const active = journalStore.activePath(opts);
  let rotatedTo = null;
  if (fs.existsSync(active)) {
    try {
      const segDir = journalStore.segmentsDir(opts);
      fs.mkdirSync(segDir, { recursive: true });
      rotatedTo = path.join(segDir, nextSegmentName(opts));
      fs.renameSync(active, rotatedTo);
    } catch (err) {
      return { ok: false, reason: 'rotate-failed: ' + (err && err.message) };
    }
  }

  const wrote = journalStore.writeCheckpoint(genesis, opts);
  if (!wrote.ok) return { ok: false, reason: wrote.reason };
  journalStore.appendRecord(genesis, opts);

  const cleared = journalStore.clearDegradedMarker(opts);
  if (!cleared.ok) {
    return { ok: false, reason: 'marker-clear-failed: ' + cleared.reason };
  }

  process.stderr.write('[mccp:journal-retention] reseed sealed: discarded ' +
    read.records.length + ' active record(s) (rotated to ' + (rotatedTo || 'n/a') +
    '), prior through_seq=' + priorThrough + '. The discarded range is recorded in ' +
    'the new genesis (checkpoint_of.reseed_of).\n');

  return {
    ok: true,
    genesis_id: genesis.record_id,
    discarded_record_count: read.records.length,
    rotated_to: rotatedTo,
  };
}

module.exports = {
  LIMITS: LIMITS,
  decideCompaction: decideCompaction,
  compact: compact,
  enforceLimits: enforceLimits,
  reseed: reseed,
  nextSegmentName: nextSegmentName,
  dirBytes: dirBytes,
};
