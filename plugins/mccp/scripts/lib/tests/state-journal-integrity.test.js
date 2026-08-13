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
