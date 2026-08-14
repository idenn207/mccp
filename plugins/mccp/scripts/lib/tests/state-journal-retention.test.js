'use strict';

// multi-session-work-loop M5 Task 5 — 이력 보존 정책 회귀 (G4).
//
// 압축이 STATE.md를 바꾸면 실패한다. 그것이 "되돌릴 수 없는 압축을 재도입하지
// 않았다"의 유일한 반증 장치다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateWriter = require('../../state/state-writer');
const store = require('../../state/journal-store');
const retention = require('../state-journal/retention');
const { project } = require('../state-journal/project');

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm5ret-'));
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  return root;
}

function projectRepo(root) {
  const input = store.readProjectionInput({ repoRoot: root });
  return project(input.records, input.base, { seededTombstones: input.seededTombstones });
}

function seed(root, n) {
  for (let i = 0; i < n; i++) {
    stateWriter.update(root, { taskFingerprint: 'wu', goal: 'goal ' + i, plan: ['p' + i] });
  }
}

test('M5 retention: the projection is deep-equal before and after compaction', () => {
  const root = mkRepo();
  seed(root, 5);
  const before = projectRepo(root);

  const out = retention.compact({ repoRoot: root });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.compacted, true);

  const after = projectRepo(root);
  assert.strictEqual(stateWriter.contentHash(after), stateWriter.contentHash(before),
    'compaction must not change what the state means');
  assert.deepStrictEqual(after.body, before.body);
});

test('M5 retention: compaction rotates the active segment instead of deleting it', () => {
  // DD1 — `evictLRU` 방식의 unlink는 쓰지 않는다. 이력은 이동만 한다.
  const root = mkRepo();
  seed(root, 3);
  const activeBefore = fs.readFileSync(store.activePath({ repoRoot: root }), 'utf8');

  const out = retention.compact({ repoRoot: root });
  assert.ok(out.rotated_to, 'the active segment was rotated, not removed');
  assert.strictEqual(fs.readFileSync(out.rotated_to, 'utf8'), activeBefore,
    'the rotated segment is byte-identical to what was active — zero history loss');

  const segments = store.listSegments({ repoRoot: root });
  assert.strictEqual(segments.length, 1);
});

test('M5 retention: the checkpoint records the exact range it seals', () => {
  const root = mkRepo();
  seed(root, 4);
  const recordsBefore = store.readRecords({ repoRoot: root }).records;
  retention.compact({ repoRoot: root });

  const cp = store.readCheckpoint({ repoRoot: root });
  assert.strictEqual(cp.kind, 'checkpoint');
  assert.strictEqual(cp.checkpoint_of.record_count, recordsBefore.length);
  const maxSeq = recordsBefore.reduce(function (m, r) { return Math.max(m, r.seq); }, 0);
  assert.strictEqual(cp.checkpoint_of.through_seq, maxSeq);
});

test('M5 retention: a crash between checkpoint and rotation loses no tail', () => {
  // security-reviewer S5 — checkpoint는 tmp+rename으로 착지하고, **rename 성공
  // 이후에만** 세그먼트를 회전한다. 그 사이 크래시하면 활성 세그먼트가 그대로
  // 남아 같은 patch가 다시 접히는데, mergeState는 섹션을 통째로 교체하므로
  // 결과가 같다 — tail 유실 없이 수렴한다.
  const root = mkRepo();
  seed(root, 4);
  const before = projectRepo(root);

  // 압축의 ①만 수행하고 ②(회전)를 생략해 크래시 지점을 재현한다.
  const input = store.readProjectionInput({ repoRoot: root });
  const state = project(input.records, input.base, { seededTombstones: input.seededTombstones });
  const rec = require('../state-journal/record');
  const maxSeq = input.records.reduce(function (m, r) { return Math.max(m, r.seq); }, 0);
  store.writeCheckpoint(rec.makeRecord({
    session_id: 'crash', session_epoch: '2026-01-01T00:00:00.000Z',
    work_unit: 'checkpoint', seq: maxSeq + 1, kind: 'checkpoint',
    checkpoint_of: { through_seq: maxSeq, record_count: input.records.length, state: state },
  }), { repoRoot: root });

  assert.ok(fs.existsSync(store.activePath({ repoRoot: root })),
    'the active segment is still there — the crash happened before rotation');
  const after = projectRepo(root);
  assert.strictEqual(stateWriter.contentHash(after), stateWriter.contentHash(before),
    're-folding the same patches onto the checkpoint converges to the same state');
});

test('M5 retention: each of the three caps can fire on its own', () => {
  const limits = retention.LIMITS;

  const byBytes = retention.decideCompaction({
    activeBytes: limits.ACTIVE_MAX_BYTES + 1, totalBytes: 0,
  });
  assert.strictEqual(byBytes.compact, true);
  assert.ok(byBytes.reasons.some(function (r) { return r.indexOf('active-segment-bytes') === 0; }));

  const byAge = retention.decideCompaction({
    activeBytes: 0, totalBytes: 0,
    oldestTs: '2020-01-01T00:00:00.000Z', now: '2026-01-01T00:00:00.000Z',
  });
  assert.strictEqual(byAge.compact, true);
  assert.ok(byAge.reasons.some(function (r) { return r.indexOf('oldest-active-record') === 0; }));

  const byTotal = retention.decideCompaction({
    activeBytes: 0, totalBytes: limits.TOTAL_MAX_BYTES + 1,
  });
  assert.strictEqual(byTotal.compact, true);
  assert.strictEqual(byTotal.overTotal, true);

  const quiet = retention.decideCompaction({ activeBytes: 1, totalBytes: 1 });
  assert.strictEqual(quiet.compact, false);
  assert.deepStrictEqual(quiet.reasons, []);
});

test('M5 retention: compaction refuses to run in degraded mode', () => {
  const root = mkRepo();
  seed(root, 2);
  store.writeDegradedMarker(root, { reason: 'test' });
  const out = retention.compact({ repoRoot: root });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'degraded');
});
