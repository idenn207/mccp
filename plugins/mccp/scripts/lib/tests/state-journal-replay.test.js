'use strict';

// multi-session-work-loop M5 Task 4 — 크래시·재개 재생 시나리오 (G2 · UI5).
//
// 시나리오: 세션 A 착수 → 크래시 → 세션 B 승계·완료·tombstone → **A가 되살아나
// 지연 레코드 append**. 닫힌 작업 단위는 되살아나지 않아야 한다.
//
// 지연 레코드는 **폐기하지 않고 투영에서만 배제**한다(DD3) — 폐기하면 "질의 가능한
// 이력"이 깨지고 무엇이 왜 무시됐는지 감사할 수 없다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateWriter = require('../../state/state-writer');
const store = require('../../state/journal-store');
const record = require('../state-journal/record');
const { project, projectionDiagnostics } = require('../state-journal/project');

const WORK_UNIT = 'wu-crash-resume';
const EPOCH_A = '2026-08-01T00:00:00.000Z';
const EPOCH_B = '2026-08-02T00:00:00.000Z';

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm5r-'));
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  return root;
}

function scenario() {
  const root = mkRepo();
  store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });

  // 세션 A 착수.
  const aStart = record.makeRecord({
    session_id: 'session-A', session_epoch: EPOCH_A, epoch_source: 'ledger',
    work_unit: WORK_UNIT, seq: 2, kind: 'update', patch: { goal: 'A started the unit' },
  });
  store.appendRecord(aStart, { repoRoot: root });

  // …크래시. 세션 B가 승계하고 완료한 뒤 tombstone으로 닫는다.
  const bFinish = record.makeRecord({
    session_id: 'session-B', session_epoch: EPOCH_B, epoch_source: 'ledger',
    prev_session_id: 'session-A',
    work_unit: WORK_UNIT, seq: 3, kind: 'update', patch: { goal: 'B finished the unit' },
  });
  store.appendRecord(bFinish, { repoRoot: root });

  const tombstone = record.makeRecord({
    session_id: 'session-B', session_epoch: EPOCH_B, epoch_source: 'ledger',
    work_unit: WORK_UNIT, seq: 4, kind: 'tombstone', patch: null,
  });
  store.appendRecord(tombstone, { repoRoot: root });

  return { root: root, tombstone: tombstone };
}

function projectRepo(root) {
  const input = store.readProjectionInput({ repoRoot: root });
  return project(input.records, input.base, { seededTombstones: input.seededTombstones });
}

function resurrect(root, tsOffsetMinutes) {
  const ts = new Date(Date.parse(EPOCH_A) + (tsOffsetMinutes || 1) * 60 * 1000).toISOString();
  const late = record.makeRecord({
    record_id: 'resurrected-' + (tsOffsetMinutes || 1),
    ts: ts,
    session_id: 'session-A', session_epoch: EPOCH_A, epoch_source: 'ledger',
    work_unit: WORK_UNIT, seq: 5, kind: 'update',
    patch: { goal: 'A woke up and thinks it still owns this' },
  });
  store.appendRecord(late, { repoRoot: root });
  return late;
}

test('M5 replay: a resurrected late record stays in the journal', () => {
  const { root } = scenario();
  const late = resurrect(root);
  const records = store.readRecords({ repoRoot: root }).records;
  assert.ok(records.some(function (r) { return r.record_id === late.record_id; }),
    'the late record is retained — demotion, not discard (DD3)');
});

test('M5 replay: the resurrected record is marked superseded by the tombstone', () => {
  const { root, tombstone } = scenario();
  const late = resurrect(root);
  const diag = projectionDiagnostics(
    store.readRecords({ repoRoot: root }).records, {});
  const excluded = diag.excluded.filter(function (e) { return e.record_id === late.record_id; })[0];
  assert.ok(excluded, 'the late record is excluded from the projection');
  assert.strictEqual(excluded.verdict, 'admit-post-tombstone');
  assert.strictEqual(excluded.superseded_by, tombstone.record_id);
});

test('M5 replay: the projection is unchanged by the resurrection', () => {
  const { root } = scenario();
  const before = projectRepo(root);
  resurrect(root);
  const after = projectRepo(root);
  // 비교 오라클은 `contentHash`다 — `updated_at`/`last_event_at`은 재생 시각으로
  // 다시 찍히는 것이 **정상**이고(M5 이전 경로도 매 write마다 now를 찍었다),
  // production의 write-skip 판정도 정확히 이 필드 집합을 제외한다. deep-equal로
  // 비교하면 밀리초 차이가 "부활했다"로 오독된다.
  assert.strictEqual(stateWriter.contentHash(after), stateWriter.contentHash(before),
    'a closed work unit must not come back through a late append');
  assert.deepStrictEqual(after.body, before.body, 'and the body is identical');
  assert.strictEqual(after.body.goal, 'B finished the unit');
});

test('M5 replay: STATE.md mtime is untouched when a resurrected record is excluded', () => {
  const { root } = scenario();
  stateWriter.update(root, {});                       // 투영 결과를 디스크에 반영
  const target = stateWriter.statePath(root);
  const before = fs.statSync(target).mtimeMs;

  resurrect(root);
  stateWriter.update(root, {});                       // 재투영 — 결과가 같아야 한다

  const after = fs.statSync(target).mtimeMs;
  assert.strictEqual(after, before,
    'the contentHash skip must fire — an excluded record does not even touch the file mtime');
});

test('M5 replay: the defense still holds after the M3 claim TTL has elapsed', () => {
  // epoch 비교는 시간 상한이 없다(M3 §8 "무기한 replay 방어"). 점유 TTL 15분이
  // 만료돼도 순서 축 방어는 그대로다.
  const { root, tombstone } = scenario();
  const before = projectRepo(root);
  const late = resurrect(root, 20);                   // TTL(15분) 훌쩍 넘긴 뒤
  const after = projectRepo(root);

  assert.strictEqual(stateWriter.contentHash(after), stateWriter.contentHash(before));
  assert.deepStrictEqual(after.body, before.body);
  const diag = projectionDiagnostics(store.readRecords({ repoRoot: root }).records, {});
  const excluded = diag.excluded.filter(function (e) { return e.record_id === late.record_id; })[0];
  assert.strictEqual(excluded.verdict, 'admit-post-tombstone');
  assert.strictEqual(excluded.superseded_by, tombstone.record_id);
});

test('M5 replay: a normal resume is still admitted (the defense does not block legitimate work)', () => {
  // 배제 대상은 tombstone 이후 또는 역행 seq **뿐**이다. 정상 재개는 새 epoch +
  // 새 seq라 항상 admit이다 — 이 양성 케이스가 없으면 방어가 사용성을 해쳐도
  // 알 수 없다.
  const root = mkRepo();
  store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  store.appendRecord(record.makeRecord({
    session_id: 'session-A', session_epoch: EPOCH_A, work_unit: 'open-unit',
    seq: 2, kind: 'update', patch: { goal: 'A started' },
  }), { repoRoot: root });

  store.appendRecord(record.makeRecord({
    session_id: 'session-B', session_epoch: EPOCH_B, prev_session_id: 'session-A',
    work_unit: 'open-unit', seq: 3, kind: 'update', patch: { goal: 'B resumed cleanly' },
  }), { repoRoot: root });

  assert.strictEqual(projectRepo(root).body.goal, 'B resumed cleanly');
});
