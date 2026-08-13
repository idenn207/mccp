'use strict';

// multi-session-work-loop M5 — PR-Codex R1 흡수 회귀 (C1 · C2 · C3).
//
// 세 결함 모두 **첫 cross-model 발화**가 잡았다. 공통 형태는 같다: 단위 test가
// *강등 분기*나 *작은 입력*만 시험해 통과했고, 프로덕션 경로·권위 경로는 한 번도
// 확인되지 않았다. 그래서 여기서는 전부 **프로덕션 형태**로 단언한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateWriter = require('../../state/state-writer');
const store = require('../../state/journal-store');
const journal = require('../state-journal');
const record = require('../state-journal/record');
const order = require('../state-journal/order');
const { project } = require('../state-journal/project');

function mkRepo(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm5i-' + name + '-'));
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  return root;
}

function latestUpdateRecord(root) {
  const recs = store.readRecords({ repoRoot: root }).records
    .filter(function (r) { return r.kind === 'update'; });
  return recs[recs.length - 1] || null;
}

// ── C1 ───────────────────────────────────────────────────────────────────────

test('M5 C1: the production update() path reads the session ledger for session_epoch', () => {
  // 결함: `state-writer`가 `ledgerRead` 없이 `journalApply`를 불러 `resolveIdentity`가
  // 항상 ts-fallback으로 떨어졌다 — 프로덕션 `session_epoch`이 세션 created_at이
  // 아니라 **그 write의 시각**이었다. 이 test는 주입 없이 실제 경로를 탄다.
  const root = mkRepo('c1');
  // session-ledger는 session_id가 UUID이길 요구한다(schema validator).
  const sessionId = require('node:crypto').randomUUID();
  const createdAt = '2026-01-01T00:00:00.000Z';

  const ledger = require('../../state/session-ledger');
  const created = ledger.createLedger({ sessionId: sessionId, cwd: root, createdAt: createdAt });
  if (!created || created.ok === false) {
    // ledger 생성 계약이 바뀌면 이 test는 침묵하는 대신 실패해야 한다.
    assert.fail('session-ledger.createLedger failed: ' + JSON.stringify(created));
  }

  const savedEnv = process.env.MCCP_SESSION_ID;
  process.env.MCCP_SESSION_ID = sessionId;
  try {
    stateWriter.update(root, { taskFingerprint: 'wu-c1', goal: 'first' });
    const first = latestUpdateRecord(root);
    assert.strictEqual(first.epoch_source, 'ledger',
      'production path must read the ledger, not fall back to the write timestamp');
    assert.strictEqual(first.session_epoch, created.ledger.created_at);

    stateWriter.update(root, { nextStep: 'second' });
    stateWriter.update(root, { inProgress: 'third' });
    const last = latestUpdateRecord(root);
    assert.strictEqual(last.session_epoch, first.session_epoch,
      'every update in one session must share ONE monotonic epoch — otherwise the ' +
      'same-seq rule degrades to "whoever appended later wins" and a resurrected ' +
      'session beats the live one');
    assert.strictEqual(last.epoch_source, 'ledger');
  } finally {
    if (savedEnv === undefined) delete process.env.MCCP_SESSION_ID;
    else process.env.MCCP_SESSION_ID = savedEnv;
  }
});

// ── C2 ───────────────────────────────────────────────────────────────────────

test('M5 C2: a hash-tampered record is quarantined before it can drive the projection', () => {
  // 결함: read 경로가 스키마 모양만 보고 전부 통과시켜, 손상 레코드가 **투영을
  // 구동한 뒤에야** verify에서 보고됐다. DD6.3은 "투영 제외 + 카운트"를 약속했다.
  const root = mkRepo('c2rec');
  stateWriter.update(root, { taskFingerprint: 'wu', goal: 'honest value' });

  const target = store.activePath({ repoRoot: root });
  const lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean);
  const tampered = JSON.parse(lines[lines.length - 1]);
  tampered.patch = { goal: 'TAMPERED — must never reach STATE.md' };
  lines[lines.length - 1] = JSON.stringify(tampered);   // content_hash 그대로 = 불일치
  fs.writeFileSync(target, lines.join('\n') + '\n', 'utf8');

  const read = store.readRecords({ repoRoot: root });
  assert.strictEqual(read.corrupt.length, 1, 'the tampered record is quarantined');
  assert.ok(!read.records.some(function (r) { return r.record_id === tampered.record_id; }),
    'and it is NOT in the records the projection consumes');

  const input = store.readProjectionInput({ repoRoot: root });
  const projected = project(input.records, input.base, { seededTombstones: input.seededTombstones });
  assert.notStrictEqual(projected.body.goal, 'TAMPERED — must never reach STATE.md',
    'a tampered record must never become the authoritative state');
});

test('M5 C2: a hash-tampered checkpoint degrades instead of silently resetting the state', () => {
  // checkpoint는 투영의 base 그 자체라 격리로 해소되지 않는다 — 버리면 STATE.md가
  // 통째로 리셋된다. 저널 전체를 신뢰 불가로 보고 degraded로 강등해야 한다.
  const root = mkRepo('c2cp');
  stateWriter.update(root, { taskFingerprint: 'wu', goal: 'preserved through degrade' });

  const cpPath = store.checkpointPath({ repoRoot: root });
  const cp = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
  cp.checkpoint_of = { through_seq: 0, record_count: 0, state: null };   // 해시 불일치
  fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2), 'utf8');

  const checked = store.readCheckpointChecked({ repoRoot: root });
  assert.strictEqual(checked.corrupt, true);
  assert.strictEqual(checked.checkpoint, null);

  const applied = journal.journalApply({
    repoRoot: root, patch: { nextStep: 'after corruption' },
    existingState: stateWriter.readState(root),
  });
  assert.strictEqual(applied.appendFailed, true,
    'a corrupt checkpoint must fail the journal path, not silently project from empty');
  assert.ok(/checkpoint integrity/.test(applied.reason), applied.reason);

  // state-writer 경유로도 같은 결론이어야 한다: 마커 진입 + STATE.md는 보존/갱신.
  stateWriter.update(root, { nextStep: 'after corruption' });
  assert.strictEqual(store.isDegraded({ repoRoot: root }), true,
    'the degrade is recorded, not silent');
  assert.strictEqual(stateWriter.readState(root).body.goal, 'preserved through degrade');
  assert.strictEqual(stateWriter.readState(root).body.nextStep, 'after corruption');
});

// ── C3 ───────────────────────────────────────────────────────────────────────

test('M5 C3: a large next_chunk survives the journal without truncation', () => {
  // 결함: patch 문자열을 8192자에서 잘랐다. enforce 모드에서 투영이 권위이므로
  // 그 절단이 곧 STATE.md의 값이 됐고 `update()`는 성공을 반환했다.
  const root = mkRepo('c3chunk');
  const big = 'chunk-line-' + 'x'.repeat(200);
  const payload = Array.from({ length: 120 }, function (_, i) { return big + '-' + i; }).join('\n');
  assert.ok(payload.length > 20000, 'fixture must exceed the old 8192-char cap');

  stateWriter.update(root, { taskFingerprint: 'wu', nextChunk: payload });

  assert.strictEqual(stateWriter.readState(root).frontmatter.next_chunk, payload,
    'the authoritative path must not truncate a semantic patch value');
  const rec = latestUpdateRecord(root);
  assert.strictEqual(rec.patch.nextChunk, payload, 'and the journal record carries it in full');
});

test('M5 C3: a growing chain_progress survives the journal without truncation', () => {
  const root = mkRepo('c3chain');
  for (let i = 0; i < 60; i++) {
    stateWriter.recordChainProgress(root, {
      step: 'step-' + i, status: 'ok', receipt_path: '.claude/receipts/x/' + 'y'.repeat(120) + '.json',
    });
  }
  const raw = stateWriter.readState(root).frontmatter.chain_progress;
  assert.ok(typeof raw === 'string' && raw.length > 8192,
    'fixture must exceed the old cap (got ' + (raw ? raw.length : 0) + ')');
  const log = JSON.parse(raw);
  assert.strictEqual(log.steps.length, 60, 'every step survived — JSON still parses');
  assert.strictEqual(log.steps[59].step, 'step-59');
});

test('M5 C3: an unrepresentable patch degrades loudly instead of being silently trimmed', () => {
  const root = mkRepo('c3over');
  stateWriter.update(root, { taskFingerprint: 'wu', goal: 'baseline' });

  // 라인 상한을 넘기는 patch. 조용한 절단이 아니라 append 실패여야 한다.
  const huge = 'z'.repeat(record.MAX_LINE_BYTES + 1024);
  const applied = journal.journalApply({
    repoRoot: root, patch: { nextChunk: huge },
    existingState: stateWriter.readState(root),
  });
  assert.strictEqual(applied.appendFailed, true, 'oversize must fail, not truncate');
  assert.ok(/record-too-large/.test(applied.reason), applied.reason);

  // state-writer 경유: degraded 진입 + STATE.md는 값을 **온전히** 보존한다.
  stateWriter.update(root, { nextChunk: huge });
  assert.strictEqual(store.isDegraded({ repoRoot: root }), true);
  assert.strictEqual(stateWriter.readState(root).frontmatter.next_chunk, huge,
    'the direct path preserves the full value — no silent loss anywhere');
});

test('M5 C3: preparePatch rejects nesting deeper than the journal can carry', () => {
  let deep = { leaf: 1 };
  for (let i = 0; i < record.PATCH_MAX_DEPTH + 3; i++) deep = { nested: deep };
  const r = record.preparePatch(deep);
  assert.strictEqual(r.ok, false);
  assert.ok(/nesting exceeds/.test(r.reason), r.reason);

  assert.strictEqual(record.preparePatch({ goal: 'g', plan: ['a', 'b'] }).ok, true,
    'ordinary state patches stay representable');
});

// ── PR-Codex R2: D1 (압축이 순서 메타를 잃음) · D2 (보존 정책 미발화) ────────

test('M5 D1: compaction carries the order index so a delayed record is still rejected', () => {
  // 결함: `compact()`가 상태와 전역 through_seq만 봉인하고 활성 세그먼트를
  // 회전시켰다. 투영 입력은 활성 세그먼트만 읽으므로 압축 직후 인덱스가 **빈
  // 상태로 시작**했고, 압축 이전 시점의 stale writer가 옛 (work_unit, seq)를
  // append하면 high-water도 tombstone도 없어 그대로 admit됐다 — G2가 압축 한
  // 번에 무력해진다. 회귀 test가 상태만 대조하고 순서 메타는 안 봐서 통과했다.
  const root = mkRepo('d1');
  const retention = require('../state-journal/retention');

  store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  for (let seq = 2; seq <= 5; seq++) {
    store.appendRecord(record.makeRecord({
      session_id: 'live', session_epoch: '2026-06-01T00:00:00.000Z',
      work_unit: 'wu-d1', seq: seq, kind: 'update', patch: { goal: 'live goal ' + seq },
    }), { repoRoot: root });
  }
  const before = (function () {
    const i = store.readProjectionInput({ repoRoot: root });
    return project(i.records, i.base, { seededTombstones: i.seededTombstones, baseIndex: i.baseIndex });
  })();

  const out = retention.compact({ repoRoot: root });
  assert.strictEqual(out.compacted, true);
  assert.strictEqual(fs.existsSync(store.activePath({ repoRoot: root })), false,
    'the active segment was rotated away — this is the window the defect lived in');

  const cp = store.readCheckpoint({ repoRoot: root });
  assert.ok(cp.checkpoint_of.order_index, 'the checkpoint carries the order index');
  assert.strictEqual(cp.checkpoint_of.order_index.high_water['wu-d1'].seq, 5);

  // 압축 이전 시점의 stale writer가 옛 seq로 돌아온다.
  const stale = record.makeRecord({
    session_id: 'stale', session_epoch: '2026-01-01T00:00:00.000Z',
    work_unit: 'wu-d1', seq: 3, kind: 'update',
    patch: { goal: 'RESURRECTED — must not reach STATE.md' },
  });
  store.appendRecord(stale, { repoRoot: root });

  const input = store.readProjectionInput({ repoRoot: root });
  const after = project(input.records, input.base, {
    seededTombstones: input.seededTombstones, baseIndex: input.baseIndex,
  });
  assert.strictEqual(after.body.goal, before.body.goal,
    'a pre-compaction record must not overwrite post-compaction state');
  assert.notStrictEqual(after.body.goal, 'RESURRECTED — must not reach STATE.md');

  // 새 seq는 봉인된 high-water 다음부터 발급된다(1부터 다시 시작하지 않는다).
  const idx = order.buildOrderIndex(input.records, {
    seededTombstones: input.seededTombstones, baseIndex: input.baseIndex,
  });
  assert.strictEqual(order.assignOrder({ workUnit: 'wu-d1', index: idx }), 6);
});

test('M5 D1: a tombstone rotated into a segment still blocks post-compaction records', () => {
  const root = mkRepo('d1tomb');
  const retention = require('../state-journal/retention');
  store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  store.appendRecord(record.makeRecord({
    session_id: 's', session_epoch: '2026-06-01T00:00:00.000Z',
    work_unit: 'wu-closed', seq: 2, kind: 'update', patch: { goal: 'work' },
  }), { repoRoot: root });
  store.appendRecord(record.makeRecord({
    session_id: 's', session_epoch: '2026-06-01T00:00:00.000Z',
    work_unit: 'wu-closed', seq: 3, kind: 'tombstone', patch: null,
  }), { repoRoot: root });

  retention.compact({ repoRoot: root });

  const input = store.readProjectionInput({ repoRoot: root });
  const idx = order.buildOrderIndex(input.records, {
    seededTombstones: input.seededTombstones, baseIndex: input.baseIndex,
  });
  const revived = record.makeRecord({
    session_id: 'zombie', session_epoch: '2030-01-01T00:00:00.000Z',
    work_unit: 'wu-closed', seq: 9, kind: 'update', patch: { goal: 'revive' },
  });
  const d = order.decideAdmission({
    record: revived, highWater: idx.highWater, tombstones: idx.tombstones,
    epochOf: function (wu, seq) { return idx.occupants[order.occupantKey(wu, seq)] || null; },
  });
  assert.strictEqual(d.verdict, order.ADMISSION.POST_TOMBSTONE,
    'a journal-only tombstone must survive rotation — otherwise compaction reopens closed units');
});

test('M5 D2: the production update() path actually enforces the retention limits', () => {
  // 결함: `enforceLimits`의 호출부가 0개였다 — 상한 3종이 정상 사용에서 한 번도
  // 발화하지 않았고, "투영 재생 비용의 상한"이라는 주장이 근거를 잃었다.
  const root = mkRepo('d2');
  const savedLimit = require('../state-journal/retention').LIMITS.ACTIVE_MAX_BYTES;
  require('../state-journal/retention').LIMITS.ACTIVE_MAX_BYTES = 2048;   // test 주입
  try {
    for (let i = 0; i < 30; i++) {
      stateWriter.update(root, { taskFingerprint: 'wu-d2', goal: 'g'.repeat(200) + i });
    }
    const segments = store.listSegments({ repoRoot: root });
    assert.ok(segments.length >= 1,
      'crossing the byte cap through the ordinary write path must rotate at least once ' +
      '(the CLI was never invoked here)');
    const cp = store.readCheckpoint({ repoRoot: root });
    assert.strictEqual(cp.kind, 'checkpoint', 'and a compaction checkpoint was sealed');
    assert.ok(cp.checkpoint_of.order_index, 'with its order index intact');
    // 압축이 상태를 바꾸지 않았음을 함께 확인한다(G4).
    assert.strictEqual(stateWriter.readState(root).body.goal, 'g'.repeat(200) + 29);
  } finally {
    require('../state-journal/retention').LIMITS.ACTIVE_MAX_BYTES = savedLimit;
  }
});

// ── PR-Codex R3: E1 (작업 단위가 바뀌면 옛 patch가 새 상태를 덮어씀) ──────────

test('M5 E1: a new work unit starting at seq 1 is not overwritten by an older unit', () => {
  // 결함(CRITICAL): `classifyAll`이 전역 seq로 정렬했는데 seq는 work_unit별로 1부터
  // 다시 시작한다 → 새 단위의 seq:1이 이전 단위의 seq:2 **앞으로** 밀려 접히고,
  // 더 오래된 patch가 더 새로운 상태를 덮어썼다. 작업 단위(task fingerprint)가
  // 바뀔 때마다 발생하므로 예외가 아니라 정상 경로다.
  //
  // plan의 두 조항이 모순됐다 — I6("seq는 work_unit별") vs Task 3("sort(by seq)").
  // 기존 회귀가 단일 work_unit만 써서 이 모순을 드러내지 못했다.
  const root = mkRepo('e1');

  stateWriter.update(root, { taskFingerprint: 'wu-A', goal: 'A first' });
  stateWriter.update(root, { goal: 'A second' });
  stateWriter.update(root, { taskFingerprint: 'wu-B', goal: 'B first — the newest write' });

  const recs = store.readRecords({ repoRoot: root }).records
    .filter(function (r) { return r.kind === 'update'; });
  assert.deepStrictEqual(
    recs.map(function (r) { return r.work_unit + '#' + r.seq; }),
    ['wu-A#1', 'wu-A#2', 'wu-B#1'],
    'fixture precondition: the new work unit really does restart at seq 1');

  assert.strictEqual(stateWriter.readState(root).body.goal, 'B first — the newest write',
    'the LAST write must win — replay order is append order, not global seq order');

  // 투영을 직접 돌려도 같은 결론이어야 한다(디스크 write skip에 기대지 않는다).
  const input = store.readProjectionInput({ repoRoot: root });
  const projected = project(input.records, input.base, {
    seededTombstones: input.seededTombstones, baseIndex: input.baseIndex,
  });
  assert.strictEqual(projected.body.goal, 'B first — the newest write');
});

test('M5 E1: interleaved work units keep last-write-wins across many switches', () => {
  const root = mkRepo('e1mix');
  const expected = [];
  for (let i = 0; i < 6; i++) {
    const wu = 'wu-' + (i % 3);
    const goal = 'write-' + i + ' (' + wu + ')';
    stateWriter.update(root, { taskFingerprint: wu, goal: goal });
    expected.push(goal);
  }
  assert.strictEqual(stateWriter.readState(root).body.goal, expected[expected.length - 1],
    'with three work units interleaved, the final append still wins');
});
