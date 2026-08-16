'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const mswEvents = require('../../state/msw-events');
const sessionLedger = require('../../state/session-ledger');
const { spawn } = require('child_process');

// gate-guard-integrity M3 (C1) — fixture는 저장소 트리 밖 `os.tmpdir()` 하위에
// 실행별 고유 경로로 잡는다. 이전에는 `<scripts>/.test-msw-events/<testName>`이라는
// 저장소 안 고정 경로였고 `.gitignore` 밖이라, 전수를 동시에 여러 개 돌리면 같은
// 파일에 써서 서로 간섭했다(M2 리포트가 concurrent-stress의 반복 실패를 스위트의
// 성질이 아니라 이 진단 결함으로 귀속시킨 바로 그 지점). mkdtemp가 디렉토리를
// 함께 만들므로 호출부의 선행 cleanup+mkdir은 불필요해졌다.
// 각 test 본문 끝의 `cleanup(tempDir)`는 성공 경로에서만 도달하므로, 단언이
// 실패하면 그 실행의 디렉토리가 tmp에 남는다(고정 경로 시절에는 다음 실행이
// 같은 자리를 재사용해 누수가 1개로 묶였지만 mkdtemp는 매번 새로 만든다).
// 생성 지점에서 등록하고 파일 단위 after에서 일괄 회수해, 회수가 개별 test의
// 성공 여부와 무관해지게 한다. 기존 per-test cleanup은 그대로 둔다 —
// `cleanup`은 존재 확인 후 삭제라 두 번 불려도 무해하고, 성공 경로에서는
// 여전히 즉시 회수되는 편이 낫다.
const TEMP_DIRS = [];
function getTempDir(testName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mccp-msw-events-${testName}-`));
  TEMP_DIRS.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of TEMP_DIRS) cleanup(dir);
});

// 경로만 옮기고 sessionId를 고정으로 두면 tmp 루트 밖에서 이름이 다시 겹칠 수
// 있으므로(그리고 sessionId가 곧 파일명이므로) 실행별 접미사를 붙인다.
const RUN_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
function sid(base) {
  return `${base}-${RUN_ID}`;
}

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('msw-events: basic append', () => {
  const tempDir = getTempDir('basic');

  const sessionId = sid('test-session-1');

  const result = mswEvents.appendEvent(sessionId, {
    kind: 'session_start',
    ts: '2026-07-24T10:00:00.000Z',
    created_at: '2026-07-24T10:00:00.000Z',
    producer: 'session-start.js',
  }, { dir: tempDir });

  assert.strictEqual(result.ok, true, 'append should succeed');

  const filePath = path.join(tempDir, `${sessionId}.jsonl`);
  assert.ok(fs.existsSync(filePath), 'event file should exist');

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(l => l);
  assert.strictEqual(lines.length, 1, 'should have 1 event line');

  const event = JSON.parse(lines[0]);
  assert.strictEqual(event.kind, 'session_start');
  assert.strictEqual(event.producer, 'session-start.js');

  cleanup(tempDir);
});

test('msw-events: field truncation', () => {
  const tempDir = getTempDir('truncation');

  const sessionId = sid('test-session-2');
  const longValue = 'x'.repeat(300);

  const result = mswEvents.appendEvent(sessionId, {
    kind: 'test',
    ts: new Date().toISOString(),
    producer: longValue,
  }, { dir: tempDir });

  assert.strictEqual(result.ok, true);

  const filePath = path.join(tempDir, `${sessionId}.jsonl`);
  const content = fs.readFileSync(filePath, 'utf8');
  const event = JSON.parse(content.trim());

  assert.ok(event.producer.endsWith('_...'), 'long field should be truncated');
  assert.ok(event.producer.length <= mswEvents.FIELD_MAX_CHARS);

  cleanup(tempDir);
});

test('msw-events: allowlist validation', () => {
  const tempDir = getTempDir('allowlist');

  const sessionId = sid('test-session-3');

  const result = mswEvents.appendEvent(sessionId, {
    kind: 'test',
    ts: new Date().toISOString(),
    forbidden_field: 'should-not-appear',
    producer: 'test',
  }, { dir: tempDir });

  assert.strictEqual(result.ok, true);

  const filePath = path.join(tempDir, `${sessionId}.jsonl`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(l => l);
  const event = JSON.parse(lines[0]);

  assert.strictEqual('forbidden_field' in event, false, 'unknown field should be filtered');
  assert.ok('kind' in event, 'allowed field should exist');

  cleanup(tempDir);
});

test('msw-events: number/boolean fields preserve their type (no String coercion)', () => {
  const tempDir = getTempDir('type-preserve');

  const sessionId = sid('test-session-types');
  const result = mswEvents.appendEvent(sessionId, {
    kind: 'session_end',
    ended_at: '2026-07-24T10:00:00.000Z',
    task_completed: false,
    context_remaining_pct: 85,
    producer: 'session-end.js',
  }, { dir: tempDir });
  assert.strictEqual(result.ok, true);

  const line = fs.readFileSync(path.join(tempDir, `${sessionId}.jsonl`), 'utf8').trim();
  const event = JSON.parse(line);
  // 회귀: String() 강제 시 false→"false"(truthy string), 85→"85"가 되어 reader가 오판.
  assert.strictEqual(typeof event.task_completed, 'boolean', 'boolean preserved, not "false" string');
  assert.strictEqual(event.task_completed, false);
  assert.strictEqual(typeof event.context_remaining_pct, 'number', 'number preserved, not "85" string');
  assert.strictEqual(event.context_remaining_pct, 85);

  cleanup(tempDir);
});

test('msw-events: session_end null context_remaining_pct round-trips as explicit null (A2 producer-boundary, PF3)', () => {
  // msw-m2-measurement-honesty-downgrade (Codex R3 F3 / re-R3): session-end.js now emits
  // context_remaining_pct=null (the unverified latest-wins read was removed). This locks
  // the null at the SERIALIZATION layer — an explicit null must round-trip as null (key
  // present, value null), NOT be dropped and NOT be coerced to a number — so a contaminated
  // numeric sample can never silently reappear in the append-only log. Complements the
  // source-level producer-boundary guard in hooks/tests/session-hooks-no-llm.test.js.
  const tempDir = getTempDir('null-context');

  const sessionId = sid('test-session-null-context');
  const result = mswEvents.appendEvent(sessionId, {
    kind: 'session_end',
    ended_at: '2026-07-26T10:00:00.000Z',
    task_completed: false,
    context_remaining_pct: null,
    producer: 'session-end.js',
  }, { dir: tempDir });
  assert.strictEqual(result.ok, true);

  const line = fs.readFileSync(path.join(tempDir, `${sessionId}.jsonl`), 'utf8').trim();
  const event = JSON.parse(line);
  assert.ok('context_remaining_pct' in event, 'context_remaining_pct key must be present, not dropped');
  assert.strictEqual(event.context_remaining_pct, null, 'null must round-trip as null, not coerced');

  cleanup(tempDir);
});

test('msw-events: missing kind error', () => {
  const tempDir = getTempDir('missing-kind');

  const sessionId = sid('test-session-4');

  assert.throws(() => {
    mswEvents.appendEvent(sessionId, {
      ts: new Date().toISOString(),
    }, { dir: tempDir });
  }, /event\.kind required/);

  cleanup(tempDir);
});

test('msw-events: session-ledger schema diff = 0', () => {
  const testLedger = {
    schema_version: 'v2',
    session_id: '01234567-89ab-cdef-0123-456789abcdef',
    created_at: '2026-07-24T10:00:00.000Z',
    ended_at: null,
    last_seen_at: '2026-07-24T10:00:00.000Z',
    cwd: '/test/cwd',
    git_branch: null,
    pid: 12345,
    host: 'test-host',
    project_id: 'test-proj',
    claude_version: null,
  };

  const validation = sessionLedger.validate(testLedger);
  assert.strictEqual(validation.ok, true, 'standard ledger should pass');

  const ledgerWithExtra = {
    ...testLedger,
    task_completed: true,
  };

  const validation2 = sessionLedger.validate(ledgerWithExtra);
  assert.strictEqual(validation2.ok, false, 'ledger with extra field should fail strict validation');
  assert.ok(JSON.stringify(validation2.errors).includes('task_completed'), 'error should mention the extra field');
});

test('msw-events: malformed line isolation', () => {
  const tempDir = getTempDir('malformed');

  const sessionId = sid('malformed-test');
  const filePath = path.join(tempDir, `${sessionId}.jsonl`);

  mswEvents.appendEvent(sessionId, {
    kind: 'good_1',
    ts: '2026-07-24T10:00:00Z',
    producer: 'test',
  }, { dir: tempDir });

  fs.appendFileSync(filePath, '{ BROKEN JSON\n', 'utf8');

  mswEvents.appendEvent(sessionId, {
    kind: 'good_2',
    ts: '2026-07-24T10:01:00Z',
    producer: 'test',
  }, { dir: tempDir });

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(l => l);

  assert.strictEqual(lines.length, 3, 'should have 3 lines (2 good + 1 malformed)');

  const validEvents = [];
  for (const line of lines) {
    try {
      validEvents.push(JSON.parse(line));
    } catch (_e) {
      // skip malformed
    }
  }

  assert.strictEqual(validEvents.length, 2, 'should parse 2 valid events');
  assert.strictEqual(validEvents[0].kind, 'good_1');
  assert.strictEqual(validEvents[1].kind, 'good_2');

  cleanup(tempDir);
});

// santa R1 / Codex R2-F1 / plan Task 2 validate — the load-bearing proof: the
// O_APPEND atomicity claim is not ASSUMED, it is demonstrated. N OS processes
// append to the SAME session file concurrently (the worst case the per-session
// sharding normally avoids). A torn/interleaved append yields an unparseable
// line and a lost/duplicated event, so parse-all + distinct-count is a direct
// interleaving detector on the real platform (Windows dogfood).
test('msw-events: concurrent N-writer O_APPEND atomicity stress', async () => {
  const tempDir = getTempDir('concurrent-stress');

  const sessionId = sid('stress-session');
  const modulePath = path.resolve(__dirname, '..', '..', 'state', 'msw-events.js');
  const N = 4;   // concurrent writer processes
  const M = 25;  // events per writer → 100 same-file appends
  const filePath = path.join(tempDir, `${sessionId}.jsonl`);

  // Child appends M events to the shared file. Writer #3 emits an oversized
  // producer field to exercise per-line truncate UNDER concurrency (bounded,
  // not torn). modulePath is passed as an argv (never embedded in the code
  // string) so Windows backslashes never hit a JS string literal.
  const childCode =
    "const m=require(process.argv[5]);" +
    "const dir=process.argv[1],sid=process.argv[2],pid=process.argv[3],n=parseInt(process.argv[4],10);" +
    "const big=pid==='3'?'x'.repeat(400):'';" +
    "for(let i=0;i<n;i++){m.appendEvent(sid,{kind:'stress',ts:new Date().toISOString(),task_slug:'t'+pid,producer:pid+':'+i+big},{dir});}";

  await Promise.all(Array.from({ length: N }, (_v, k) => new Promise((resolve, reject) => {
    const cp = spawn(process.execPath, ['-e', childCode, tempDir, sessionId, String(k), String(M), modulePath], { stdio: 'ignore' });
    cp.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('writer ' + k + ' exit ' + code))));
    cp.on('error', reject);
  })));

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((l) => l.length);
  assert.strictEqual(lines.length, N * M, `expected ${N * M} lines, got ${lines.length} (torn/lost write?)`);

  // Every line must parse — a torn/interleaved O_APPEND write yields invalid JSON.
  const producers = new Set();
  for (const line of lines) {
    let ev;
    assert.doesNotThrow(() => { ev = JSON.parse(line); }, `unparseable line (interleaved write): ${line.slice(0, 80)}`);
    assert.strictEqual(ev.kind, 'stress');
    assert.ok(ev.producer, 'producer coverage marker present on every event');
    producers.add(ev.producer);
  }
  // Each (writer,i) pair is unique → nothing lost, nothing duplicated, nothing merged.
  assert.strictEqual(producers.size, N * M, 'all events distinct — none lost or interleaved');

  // Writer #3's oversized fields were bounded (truncated), not torn.
  const truncated = lines.map((l) => JSON.parse(l)).filter((e) => String(e.producer).endsWith('_...'));
  assert.strictEqual(truncated.length, M, `oversized events truncated (not torn) under concurrency (got ${truncated.length})`);

  cleanup(tempDir);
});
