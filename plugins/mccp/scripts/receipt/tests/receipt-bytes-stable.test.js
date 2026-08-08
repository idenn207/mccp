'use strict';

// multi-session-work-loop M3 — §3.12 no-rehash 회귀.
//
// M3은 write 경로를 lock + 원자 rename으로 바꾼다. 그 변경이 **출력 바이트를
// 흔들면** git-tracked ship receipt corpus의 `receipt_hash`가 어긋나고,
// `store.js`의 tracked-overwrite 가드가 정상 재작성을 차단하며, ledger 결속이
// dangling이 된다. 그래서 "같은 입력 → 같은 바이트"가 계약이다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../store');
const { receiptHash, subjectHash } = require('../hash');

function mkRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-bytes-'));
  fs.mkdirSync(path.join(repo, '.claude', 'receipts', 'mccp-plan-codex'), { recursive: true });
  return repo;
}

function sampleReceipt(overrides) {
  return Object.assign({
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    decision_id: 'bytes',
    phase: 'plan',
    plan_hash: 'sha256:plan',
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    meta: { created_at: '2026-01-01T00:00:00.000Z', skipped: false },
  }, overrides || {});
}

test('the on-disk encoding is exactly JSON.stringify(receipt, null, 2) + newline', () => {
  // This is the pre-M3 formula verbatim. If the guarded path ever reformats
  // (different indent, no trailing newline, key reordering) every tracked ship
  // receipt hash comparison breaks.
  const repo = mkRepo();
  const receipt = sampleReceipt();
  const p = store.writeReceipt(repo, receipt);
  const onDisk = fs.readFileSync(p, 'utf8');
  assert.equal(onDisk, JSON.stringify(receipt, null, 2) + '\n');
});

test('same input twice → byte-identical output (idempotent rewrite)', () => {
  const repo = mkRepo();
  const receipt = sampleReceipt();
  const p1 = store.writeReceipt(repo, receipt);
  const first = fs.readFileSync(p1, 'utf8');
  const p2 = store.writeReceipt(repo, receipt);
  const second = fs.readFileSync(p2, 'utf8');
  assert.equal(first, second, 'a second identical write must not perturb the bytes');
});

test('the write path does not touch receipt_hash or subject_hash', () => {
  const repo = mkRepo();
  const receipt = sampleReceipt();
  receipt.subject_hash = subjectHash(receipt);
  receipt.receipt_hash = receiptHash(receipt);
  const before = { s: receipt.subject_hash, r: receipt.receipt_hash };

  const p = store.writeReceipt(repo, receipt);
  const back = JSON.parse(fs.readFileSync(p, 'utf8'));

  assert.equal(back.subject_hash, before.s, 'subject_hash must survive the write untouched');
  assert.equal(back.receipt_hash, before.r, 'receipt_hash must survive the write untouched');
  assert.equal(receiptHash(back), before.r, 'and must still verify after a round trip');
});

test('the guard never leaves a partially written receipt', () => {
  const repo = mkRepo();
  const receipt = sampleReceipt();
  const p = store.writeReceipt(repo, receipt);
  const raw = fs.readFileSync(p, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
  assert.ok(raw.endsWith('\n'), 'trailing newline is part of the contract');
});

test('lock and tmp siblings do not linger next to the receipt', () => {
  const repo = mkRepo();
  store.writeReceipt(repo, sampleReceipt());
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  const siblings = fs.readdirSync(dir).filter((f) => !f.endsWith('.json'));
  assert.deepEqual(siblings, [], 'stray files here would pollute the tracked ship dir');
});

test('tracked-overwrite guard still fires, and it now runs INSIDE the lock', () => {
  // The guard was not weakened by moving it — it was strengthened. Previously the
  // hash was read (L127) and the caller wrote (L154) with the window open between
  // them, so two sessions could both pass. It now runs in the critical section.
  const repo = mkRepo();
  const store2 = require('../store');
  const p = store2.receiptPath(repo, 'mccp-plan-codex', 'bytes');
  fs.writeFileSync(p, JSON.stringify({ receipt_hash: 'sha256:old' }, null, 2) + '\n', 'utf8');

  // Untracked (no git repo here) → guard intentionally allows the write.
  const r = sampleReceipt({ receipt_hash: 'sha256:new' });
  assert.doesNotThrow(() => store2.writeReceipt(repo, r));
  assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).receipt_hash, 'sha256:new');
});

test('carve-out fields do not change receipt_hash (briefing / ledger stampers)', () => {
  // This is why those two stampers are allowed to be fail-open: they can only
  // touch fields that are canonicalized out of the seal.
  const base = sampleReceipt();
  const h = receiptHash(base);
  const stamped = JSON.parse(JSON.stringify(base));
  stamped.meta.briefing_summary = 'a summary';
  stamped.meta.briefing_token_count = 42;
  stamped.meta.briefing_token_estimated = true;
  stamped.meta.briefing_invocation_count = 1;
  stamped.meta.ledger_write_skipped = true;
  assert.equal(receiptHash(stamped), h, 'carved fields must not perturb the seal');
});
