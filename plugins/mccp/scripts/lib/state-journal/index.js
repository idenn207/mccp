'use strict';

// multi-session-work-loop M5 — state-journal facade.
//
// 설계: docs/multi-session-work-loop/state-truth-source-design.md
//
// `state-writer.update()`가 부르는 유일한 진입점. 여기서 하는 일은 **사실을
// 모아 돌려주는 것**까지이고, degraded 진입 판정과 throw는 호출자가 소유한다
// (DD6.1 책임 2층 표 — 유일 throw 지점은 `state-writer.update()`).

const journalStore = require('../../state/journal-store');
const record = require('./record');
const order = require('./order');
const projectMod = require('./project');

// ── 토글 (DD7 · I5) ──────────────────────────────────────────────────────────
//
//   enforce (default) — 투영이 권위. STATE.md는 저널의 렌더다.
//   shadow            — 저널은 계속 쓰되 STATE.md는 M5 이전 직접 경로. 회귀 복구용.
//   off               — 저널 비활성 + loud warn.
//
// 운영 계약: **수동 전용**(자동 강등 경로 없음 — 그쪽은 `.degraded` 마커의 일이다) ·
// **프로세스 수명**(env를 지우면 다음 프로세스는 enforce) · **마커 > 토글**
// (`.degraded`가 있으면 enforce여도 직접 경로).
const JOURNAL_MODES = new Set(['enforce', 'shadow', 'off']);

function parseJournalMode(env) {
  env = env || process.env;
  const raw = String(env.MCCP_STATE_JOURNAL || '').trim().toLowerCase();
  if (!raw) return 'enforce';
  if (JOURNAL_MODES.has(raw)) return raw;
  process.stderr.write('[mccp:state-journal] WARNING: unrecognized MCCP_STATE_JOURNAL="' +
    raw + '" — falling back to enforce (allowed: enforce|shadow|off)\n');
  return 'enforce';
}

// work_unit 해석 (I3).
//
// tombstone은 completion-ledger의 `decision_id`로 seed되므로(DD11) 두 네임스페이스가
// 만나는 유일한 지점이 decision slug다. 그래서 그것을 최우선으로 둔다. slug가
// 없는 hook 호출은 `task_fingerprint`로 떨어지며, 그 축의 레코드는 ledger
// tombstone과 만나지 않는다 — 클론 경계를 넘는 방어가 decision-slug 축에만
// 성립한다는 뜻이고, 잔여 1의 범위 정밀화로 문서에 기록돼 있다.
function resolveWorkUnit(patch, existingState) {
  patch = patch || {};
  const fm = (existingState && existingState.frontmatter) || {};
  // **patch가 먼저다.** 초기 구현은 기존 frontmatter만 읽어서, 작업 단위를 바꾸는
  // 바로 그 변형이 *이전* 단위로 기록됐다(work_unit이 한 칸씩 밀림 — 회귀 test
  // `journal query filters by work-unit`이 이것을 잡았다). 이 변형이 속한 작업
  // 단위는 patch가 선언한 것이지 직전 상태가 아니다.
  //
  // decision slug가 fingerprint보다 우선한다 — tombstone이 `decision_id`로
  // seed되므로(DD11) 두 네임스페이스가 만나는 유일한 지점이기 때문이다.
  const candidates = [
    patch.workUnit,
    patch.work_unit,
    patch.escalate_pending_decision_id,
    fm.escalate_pending_decision_id,
    patch.taskFingerprint,
    fm.task_fingerprint,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return 'unknown';
}

function lastRecord(records) {
  if (!Array.isArray(records) || records.length === 0) return null;
  return records[records.length - 1];
}

// journalApply — 한 번의 상태 변형을 저널에 반영하고 투영을 돌려준다.
//
// 반환 계약 (호출자가 분기한다):
//   { mode:'off' }                              토글 off — 호출자는 직접 경로
//   { mode, degraded:true }                     마커 존재 — 호출자는 직접 경로
//   { mode, appendFailed:true, reason }          append 실패 — 호출자가 마커+throw 판정
//   { mode, authoritative, projected, record }   정상
function journalApply(args) {
  args = args || {};
  const env = args.env || process.env;
  const mode = parseJournalMode(env);
  const opts = { repoRoot: args.repoRoot, env: env, ledgerRead: args.ledgerRead };

  if (mode === 'off') {
    process.stderr.write('[mccp:state-journal] WARNING: MCCP_STATE_JOURNAL=off — ' +
      'state mutations are NOT journaled; STATE.md is the only record for this process\n');
    return { mode: mode, degraded: false, authoritative: false, projected: null };
  }

  if (journalStore.isDegraded(opts)) {
    const marker = journalStore.readDegradedMarker(opts);
    process.stderr.write('[mccp:state-journal] WARNING: degraded marker present (' +
      ((marker && marker.reason) || 'unknown') + ') — projection is suspended and ' +
      'STATE.md is written directly. Recover with `journal checkpoint --reseed`.\n');
    return { mode: mode, degraded: true, authoritative: false, projected: null };
  }

  // genesis 부트스트랩 — checkpoint가 없으면 현재 상태를 봉인한다. 멱등.
  const boot = journalStore.bootstrapGenesis(Object.assign({}, opts, {
    state: args.existingState || null,
  }));
  if (!boot.ok && boot.reason === 'degraded') {
    return { mode: mode, degraded: true, authoritative: false, projected: null };
  }

  const input = journalStore.readProjectionInput(opts);
  const identity = record.resolveIdentity({
    env: env,
    journalTail: lastRecord(input.records),
    ledgerRead: args.ledgerRead,
  });
  const workUnit = resolveWorkUnit(args.patch, args.existingState);
  const index = order.buildOrderIndex(input.records, {
    seededTombstones: input.seededTombstones,
  });
  const seq = order.assignOrder({ workUnit: workUnit, index: index });

  const rec = record.makeRecord({
    session_id: identity.session_id,
    session_epoch: identity.session_epoch,
    epoch_source: identity.epoch_source,
    prev_session_id: identity.prev_session_id,
    work_unit: workUnit,
    seq: seq,
    kind: 'update',
    patch: args.patch || {},
  });

  const appended = journalStore.appendRecord(rec, opts);
  if (!appended.ok) {
    return { mode: mode, degraded: false, appendFailed: true, reason: appended.reason };
  }

  const after = journalStore.readProjectionInput(opts);
  const projected = projectMod.project(after.records, after.base, {
    seededTombstones: after.seededTombstones,
  });

  return {
    mode: mode,
    degraded: false,
    // shadow는 STATE.md **쓰기 경로만** 되돌린다 — 저널은 계속 자란다(회귀
    // 진단용 데이터를 남기는 것이 이 값의 목적이다).
    authoritative: mode === 'enforce',
    projected: projected,
    record: rec,
    malformed_count: after.malformed_count,
  };
}

module.exports = {
  JOURNAL_MODES: JOURNAL_MODES,
  parseJournalMode: parseJournalMode,
  resolveWorkUnit: resolveWorkUnit,
  journalApply: journalApply,
  // 재수출 — 소비처가 하위 모듈 경로를 알 필요가 없게 한다.
  record: record,
  order: order,
  project: projectMod.project,
  projectionDiagnostics: projectMod.projectionDiagnostics,
  store: journalStore,
};
