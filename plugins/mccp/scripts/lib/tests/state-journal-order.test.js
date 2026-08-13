'use strict';

// multi-session-work-loop M5 Task 1 — 순번·epoch·tombstone 우선순위 회귀 (G2).
//
// 판정 우선순위가 계약이므로 5분기를 각각 고정하고, **②가 ④보다 먼저 발화함**을
// 별도 케이스로 단언한다(tombstone은 epoch보다 강하다 — 닫힌 작업은 더 새 세션이
// 라도 되살리지 못한다).

const test = require('node:test');
const assert = require('node:assert');

const record = require('../state-journal/record');
const order = require('../state-journal/order');
const { resolveSessionKey } = require('../orchestration-runaway');

const { ADMISSION } = order;

function rec(over) {
  return record.makeRecord(Object.assign({
    session_id: 's1',
    session_epoch: '2026-01-01T00:00:00.000Z',
    epoch_source: 'ledger',
    work_unit: 'wu',
    seq: 1,
    kind: 'update',
    patch: { goal: 'g' },
  }, over || {}));
}

function decide(r, index) {
  return order.decideAdmission({
    record: r,
    highWater: index.highWater,
    tombstones: index.tombstones,
    epochOf: function (wu, seq) { return index.occupants[order.occupantKey(wu, seq)] || null; },
  });
}

test('M5 order: schema violation is reject-malformed', () => {
  const bad = Object.assign(rec(), { kind: 'not-a-kind' });
  const index = order.buildOrderIndex([]);
  assert.strictEqual(decide(bad, index).verdict, ADMISSION.REJECT);

  const noSeq = Object.assign(rec(), { seq: 0 });
  assert.strictEqual(decide(noSeq, index).verdict, ADMISSION.REJECT);
});

test('M5 order: a record after a tombstone is admit-post-tombstone', () => {
  const tomb = rec({ seq: 2, kind: 'tombstone', patch: null });
  const index = order.buildOrderIndex([rec({ seq: 1 }), tomb]);
  const late = rec({ seq: 5, session_id: 's2' });
  const d = decide(late, index);
  assert.strictEqual(d.verdict, ADMISSION.POST_TOMBSTONE);
  assert.strictEqual(d.supersededBy, tomb.record_id);
});

test('M5 order: a seq behind the high-water is admit-superseded', () => {
  const index = order.buildOrderIndex([rec({ seq: 1 }), rec({ seq: 2 }), rec({ seq: 3 })]);
  const late = rec({ seq: 2, record_id: 'other', session_id: 's9' });
  // seq 2 is occupied, so rule ③ (collision) answers first; drop the occupant to
  // exercise the pure high-water branch.
  const sparse = order.buildOrderIndex([rec({ seq: 1 }), rec({ seq: 3 })]);
  assert.strictEqual(decide(late, sparse).verdict, ADMISSION.SUPERSEDED);
  assert.ok(index.highWater.wu === 3);
});

test('M5 order: a same-seq collision admits the higher session_epoch', () => {
  const first = rec({ seq: 4, session_id: 'a', session_epoch: '2026-01-01T00:00:00.000Z' });
  const index = order.buildOrderIndex([first]);

  const newer = rec({ seq: 4, session_id: 'b', session_epoch: '2026-06-01T00:00:00.000Z' });
  assert.strictEqual(decide(newer, index).verdict, ADMISSION.ADMIT);

  const older = rec({ seq: 4, session_id: 'c', session_epoch: '2025-01-01T00:00:00.000Z' });
  const d = decide(older, index);
  assert.strictEqual(d.verdict, ADMISSION.SUPERSEDED);
  assert.strictEqual(d.supersededBy, first.record_id);
});

test('M5 order: an in-order record is admit', () => {
  const index = order.buildOrderIndex([rec({ seq: 1 })]);
  assert.strictEqual(decide(rec({ seq: 2 }), index).verdict, ADMISSION.ADMIT);
});

test('M5 order: a tombstone beats a newer session_epoch (rule 2 fires before rule 4)', () => {
  // 같은 seq를 점유한 레코드가 있고 **동시에** tombstone도 있다. epoch만 보면
  // 새 세션이 이기지만, tombstone이 먼저이므로 admit이 아니라 post-tombstone이다.
  const occupant = rec({ seq: 3, session_id: 'a', session_epoch: '2026-01-01T00:00:00.000Z' });
  const tomb = rec({ seq: 2, kind: 'tombstone', patch: null });
  const index = order.buildOrderIndex([rec({ seq: 1 }), tomb, occupant]);

  const resurrected = rec({ seq: 3, session_id: 'z', session_epoch: '2030-01-01T00:00:00.000Z' });
  assert.strictEqual(decide(resurrected, index).verdict, ADMISSION.POST_TOMBSTONE);
});

test('M5 order: an epoch tie breaks deterministically on session_id', () => {
  const epoch = '2026-03-03T00:00:00.000Z';
  const occupant = rec({ seq: 7, session_id: 'mmm', session_epoch: epoch });
  const index = order.buildOrderIndex([occupant]);

  const higher = rec({ seq: 7, session_id: 'zzz', session_epoch: epoch });
  const lower = rec({ seq: 7, session_id: 'aaa', session_epoch: epoch });
  assert.strictEqual(decide(higher, index).verdict, ADMISSION.ADMIT);
  assert.strictEqual(decide(lower, index).verdict, ADMISSION.SUPERSEDED);
});

test('M5 order: a concurrent same-seq append keeps the loser in the journal', () => {
  // security-reviewer S3 흡수 — 락 fail-open 구간의 seq 충돌은 결정론적으로
  // 해소되고, 진 쪽은 **저널에 잔존**하되 투영에서만 배제된다(잔여 4 정밀화).
  const a = rec({ seq: 5, session_id: 'a', session_epoch: '2026-01-01T00:00:00.000Z' });
  const b = rec({ seq: 5, session_id: 'b', session_epoch: '2026-02-01T00:00:00.000Z' });
  const classified = order.classifyAll([a, b]);
  assert.strictEqual(classified.length, 2, 'both records stay in the journal');
  const verdicts = classified.map(function (c) { return c.decision.verdict; }).sort();
  assert.deepStrictEqual(verdicts, [ADMISSION.ADMIT, ADMISSION.SUPERSEDED].sort());
});

test('M5 identity: env precedence matches resolveSessionKey', () => {
  const cases = [
    { MCCP_SESSION_ID: 'm', CLAUDE_CODE_SESSION_ID: 'c', CLAUDE_SESSION_ID: 'l' },
    { CLAUDE_CODE_SESSION_ID: 'c', CLAUDE_SESSION_ID: 'l' },
    { CLAUDE_SESSION_ID: 'l' },
    {},
  ];
  for (const env of cases) {
    const id = record.resolveIdentity({ env: env, ts: '2026-01-01T00:00:00.000Z' }).session_id;
    assert.strictEqual(id, resolveSessionKey(env),
      'identity resolver must not fork from the canonical session key');
  }
});

test('M5 identity: an absent ledger falls back to the record ts', () => {
  const ts = '2026-05-05T05:05:05.000Z';
  const id = record.resolveIdentity({ env: { MCCP_SESSION_ID: 's' }, ts: ts });
  assert.strictEqual(id.session_epoch, ts);
  assert.strictEqual(id.epoch_source, 'ts-fallback');

  const withLedger = record.resolveIdentity({
    env: { MCCP_SESSION_ID: 's' },
    ts: ts,
    ledgerRead: function () { return { ok: true, created_at: '2026-04-04T00:00:00.000Z' }; },
  });
  assert.strictEqual(withLedger.session_epoch, '2026-04-04T00:00:00.000Z');
  assert.strictEqual(withLedger.epoch_source, 'ledger');
});

test('M5 identity: prev_session_id derives from the journal tail', () => {
  const env = { MCCP_SESSION_ID: 'current' };
  assert.strictEqual(record.resolveIdentity({ env: env }).prev_session_id, null,
    'an empty journal has no previous session');
  assert.strictEqual(
    record.resolveIdentity({ env: env, journalTail: { session_id: 'current' } }).prev_session_id,
    null, 'the same session is not its own predecessor');
  assert.strictEqual(
    record.resolveIdentity({ env: env, journalTail: { session_id: 'earlier' } }).prev_session_id,
    'earlier');
});

test('M5 identity: a nearer ledger session from another worktree does not change prev_session_id', () => {
  // DD12의 "ledger가 아니라 저널" 근거를 반증 가능하게 고정한다. ledger가 시간상
  // 더 가까운 세션을 알고 있어도 prev는 저널 tail이 답한다.
  const id = record.resolveIdentity({
    env: { MCCP_SESSION_ID: 'current' },
    journalTail: { session_id: 'journal-tail-session' },
    ledgerRead: function () {
      return { ok: true, created_at: '2026-09-09T00:00:00.000Z', session_id: 'other-worktree-session' };
    },
  });
  assert.strictEqual(id.prev_session_id, 'journal-tail-session');
});
