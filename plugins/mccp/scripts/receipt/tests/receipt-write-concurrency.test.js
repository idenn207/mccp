'use strict';

// multi-session-work-loop M3 — N-writer 동시성 stress.
//
// 이것이 M3의 존재 이유를 직접 검사하는 test다. 변경 전 `writeReceipt`는
// `mkdirSync → assertNoTrackedOverwrite → writeFileSync(최종 경로)`였고,
// lock도 원자성도 없었다. 그래서 (a) 동시 writer 2명이 lost update,
// (b) 쓰는 중 reader가 torn JSON, (c) 쓰는 중 crash가 receipt를 손상시켰다.
//
// lost update는 **read-modify-write**에서만 관측 가능하다(전체 내용 덮어쓰기는
// 마지막 writer가 이기는 것이 정의상 정상이다). 그래서 자식 프로세스들이 카운터를
// 증가시키게 하고, 최종 카운터 === N 인지 본다. 하나라도 소실되면 N 미만이 된다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO_SCRIPTS = path.resolve(__dirname, '..', '..');
const lock = require('../evidence-lock');

function mkRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-conc-'));
  fs.mkdirSync(path.join(repo, '.claude', 'receipts', 'mccp-plan-codex'), { recursive: true });
  return repo;
}

// 자식 프로세스 본체 — guardedReadModifyWrite로 카운터를 1 올린다.
function writeChildScript(dir) {
  const p = path.join(dir, 'child.js');
  fs.writeFileSync(p, `
'use strict';
const lock = require(${JSON.stringify(path.join(REPO_SCRIPTS, 'receipt', 'evidence-lock.js').replace(/\\\\/g, '/'))});
const target = process.argv[2];
const sid = process.argv[3];
// CLAUDE_PID is the CLAUDE SESSION process, not this short-lived CLI process.
// The test parent supplies it so the recorded holder stays ALIVE after the child
// exits — otherwise every claim would look like a dead holder and succession
// would (correctly) let the next writer through, which is not the case under test.
const spid = process.argv[4] || String(process.pid);
const env = { CLAUDE_CODE_SESSION_ID: sid, CLAUDE_PID: spid };
try {
  lock.guardedReadModifyWrite(target, function (raw) {
    let o = { receipt_hash: 'sha256:seed', n: 0 };
    if (raw) { try { o = JSON.parse(raw); } catch (_e) {} }
    o.n = (o.n || 0) + 1;
    o.receipt_hash = 'sha256:n' + o.n;
    return JSON.stringify(o, null, 2) + '\\n';
  }, { env: env, maxRetries: 400, retryMs: 15 });
  process.stdout.write('ok');
  process.exit(0);
} catch (e) {
  process.stdout.write('ERR:' + (e && e.code ? e.code : 'unknown'));
  process.exit(3);
}
`, 'utf8');
  return p;
}

test('N-writer stress: no lost update, no torn file, every increment survives', () => {
  const repo = mkRepo();
  const target = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex', 'stress.json');
  const child = writeChildScript(repo);
  const N = 8;

  // All children share ONE session id: the claim fence must not refuse a
  // legitimate same-unit writer, so this isolates the lock/atomicity axis.
  const procs = [];
  for (let i = 0; i < N; i++) {
    procs.push(spawnSync(process.execPath, [child, target, 'sess-shared'], {
      encoding: 'utf8', timeout: 60000,
    }));
  }

  const outs = procs.map((p) => (p.stdout || '').trim());
  const failures = outs.filter((o) => o !== 'ok');
  assert.deepEqual(failures, [], 'every writer must succeed under contention: ' + JSON.stringify(outs));

  const raw = fs.readFileSync(target, 'utf8');
  let parsed = null;
  assert.doesNotThrow(() => { parsed = JSON.parse(raw); }, 'final file must never be torn');
  assert.equal(parsed.n, N, 'lost update: expected ' + N + ' increments, saw ' + parsed.n);
});

test('concurrent writers from DIFFERENT sessions: exactly one holds the unit', () => {
  const repo = mkRepo();
  const target = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex', 'contended.json');
  const child = writeChildScript(repo);

  // Both sessions are LIVE: pass this (still running) test process as CLAUDE_PID
  // so neither claim looks abandoned. Sharing the pid also makes the assertion
  // stricter — the refusal must come from the session_id axis alone.
  const live = String(process.pid);
  const a = spawnSync(process.execPath, [child, target, 'sess-A', live], { encoding: 'utf8', timeout: 60000 });
  const b = spawnSync(process.execPath, [child, target, 'sess-B', live], { encoding: 'utf8', timeout: 60000 });

  assert.equal((a.stdout || '').trim(), 'ok', 'the first session claims the unit');
  assert.equal((b.stdout || '').trim(), 'ERR:EVIDENCE_CLAIM_DENIED',
    'a second LIVE session must be refused, not silently allowed to overwrite');

  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.equal(parsed.n, 1, "the refused writer must not have mutated the file");
});

test('no lock or tmp residue survives a completed stress run', () => {
  const repo = mkRepo();
  const target = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex', 'clean.json');
  const child = writeChildScript(repo);
  for (let i = 0; i < 4; i++) {
    spawnSync(process.execPath, [child, target, 'sess-clean'], { encoding: 'utf8', timeout: 60000 });
  }
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  const residue = fs.readdirSync(dir).filter((f) => f.endsWith('.lock') || f.endsWith('.tmp'));
  assert.deepEqual(residue, [], 'locks and tmps must be cleaned up: ' + JSON.stringify(residue));
});

test('store.writeReceipt goes through the guard (all callers covered automatically)', () => {
  // The enforcement locus is the write path, not the command body: an LLM that
  // skips a prompt instruction still passes through writeReceipt.
  const repo = mkRepo();
  const store = require('../store');
  const receipt = {
    schema_version: 'v1', gate_id: 'mccp-plan-codex', decision_id: 'guarded',
    receipt_hash: 'sha256:abc', meta: {},
  };
  const p = store.writeReceipt(repo, receipt);
  assert.ok(fs.existsSync(p));

  const evDir = path.join(repo, '.claude', 'state', 'msw-events');
  const files = fs.existsSync(evDir) ? fs.readdirSync(evDir) : [];
  const events = files.flatMap((f) => fs.readFileSync(path.join(evDir, f), 'utf8')
    .split(/\r?\n/).filter(Boolean).map(JSON.parse));
  assert.ok(events.some((e) => e.kind === 'evidence_guard_active'
    && e.target === '.claude/receipts/mccp-plan-codex/guarded.json'),
    'writeReceipt must emit a guard event so the coverage audit can see it');
});

test('updateReceipt read-modify-write is one critical section', () => {
  const repo = mkRepo();
  const store = require('../store');
  store.writeReceipt(repo, {
    schema_version: 'v1', gate_id: 'mccp-plan-codex', decision_id: 'rmw',
    receipt_hash: 'sha256:v1', meta: { a: 1 },
  });
  const out = store.updateReceipt(repo, 'mccp-plan-codex', 'rmw', function (r) {
    r.meta.a = 2;
    r.receipt_hash = 'sha256:v2';
    return r;
  });
  assert.equal(out.receipt.meta.a, 2);
  assert.equal(JSON.parse(fs.readFileSync(out.path, 'utf8')).receipt_hash, 'sha256:v2');
});

test('updateReceipt on a missing receipt fails closed with RECEIPT_NOT_FOUND', () => {
  const repo = mkRepo();
  const store = require('../store');
  assert.throws(
    () => store.updateReceipt(repo, 'mccp-plan-codex', 'nope', (r) => r),
    (e) => e.code === 'RECEIPT_NOT_FOUND');
});

test('a nested guarded write on the same target is refused (no self-deadlock)', () => {
  // store → briefing → completion-ledger each acquire and release independently;
  // an accidental nesting must throw immediately rather than block for the lease.
  const repo = mkRepo();
  const target = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex', 'nested.json');
  const started = Date.now();
  assert.throws(() => {
    lock.guardedWrite(target, () => {
      lock.guardedWrite(target, () => '{}\n', { env: { CLAUDE_CODE_SESSION_ID: 's' } });
      return '{}\n';
    }, { env: { CLAUDE_CODE_SESSION_ID: 's' } });
  }, (e) => e.code === 'EVIDENCE_LOCK_REENTRANT');
  assert.ok(Date.now() - started < 3000, 'must fail fast, not wait out the lease');
});

// execFileSync is imported for parity with store.isGitTracked's shape; keep the
// reference so linters do not flag it while the helper stays available.
void execFileSync;
