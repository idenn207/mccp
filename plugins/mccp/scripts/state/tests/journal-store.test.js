'use strict';

// multi-session-work-loop M5 Task 2 — 저널 store 회귀 (부트스트랩 · 격리 · 경로 · ledger seed).
// Task 6의 `journal verify|query|checkpoint` 표면도 여기서 함께 고정한다 —
// verify는 store 계층의 I/O 판정이고, CLI는 그 위의 얇은 wrapper이므로 같은 축이다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const store = require('../journal-store');
const record = require('../../lib/state-journal/record');
const order = require('../../lib/state-journal/order');
const stateWriter = require('../state-writer');

const CLI = path.resolve(__dirname, '..', 'cli.js');

function mkRepo(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm5-' + name + '-'));
  fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
  return root;
}

function writeLedgerEntry(root, decisionId, wrapped) {
  const dir = path.join(root, '.claude', 'state', 'completion-ledger');
  fs.mkdirSync(dir, { recursive: true });
  const body = wrapped === false
    ? { decision_id: decisionId }
    : { schema_version: 'v1', entry: { decision_id: decisionId, verdict: 'converged' } };
  fs.writeFileSync(path.join(dir, decisionId + '__deadbeefcafe.json'),
    JSON.stringify(body, null, 2), 'utf8');
}

test('M5 store: genesis bootstrap is idempotent', () => {
  const root = mkRepo('boot');
  const a = store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  const b = store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.bootstrapped, true);
  assert.strictEqual(b.bootstrapped, false, 'second call must be a no-op');

  const read = store.readRecords({ repoRoot: root });
  const genesisCount = read.records.filter(function (r) { return r.kind === 'genesis'; }).length;
  assert.strictEqual(genesisCount, 1, 'exactly one genesis record');
});

test('M5 store: a malformed line does not contaminate the rest', () => {
  const root = mkRepo('malformed');
  store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  const good = record.makeRecord({
    session_id: 's', session_epoch: '2026-01-01T00:00:00.000Z', work_unit: 'wu',
    seq: 2, kind: 'update', patch: { goal: 'ok' },
  });
  store.appendRecord(good, { repoRoot: root });
  fs.appendFileSync(store.activePath({ repoRoot: root }), '{ this is not json\n', 'utf8');
  const another = record.makeRecord({
    session_id: 's', session_epoch: '2026-01-01T00:00:00.000Z', work_unit: 'wu',
    seq: 3, kind: 'update', patch: { goal: 'still ok' },
  });
  store.appendRecord(another, { repoRoot: root });

  const read = store.readRecords({ repoRoot: root });
  assert.strictEqual(read.malformed_count, 1);
  assert.strictEqual(read.records.length, 3, 'genesis + 2 good records survive');
  assert.ok(read.malformed_samples.length === 1);
});

test('M5 store: three worktrees never cross journal paths', () => {
  const roots = ['wt1', 'wt2', 'wt3'].map(mkRepo);
  roots.forEach(function (root, i) {
    store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
    store.appendRecord(record.makeRecord({
      session_id: 'sess-' + i, session_epoch: '2026-01-0' + (i + 1) + 'T00:00:00.000Z',
      work_unit: 'wu-' + i, seq: 2, kind: 'update', patch: { goal: 'root ' + i },
    }), { repoRoot: root });
  });
  roots.forEach(function (root, i) {
    const read = store.readRecords({ repoRoot: root });
    const units = new Set(read.records.map(function (r) { return r.work_unit; }));
    assert.ok(units.has('wu-' + i), 'own record present');
    for (let j = 0; j < roots.length; j++) {
      if (j === i) continue;
      assert.ok(!units.has('wu-' + j), 'no cross-worktree contamination');
    }
  });
});

test('M5 store: completion-ledger entries seed tombstones that close the work unit', () => {
  const root = mkRepo('ledger');
  writeLedgerEntry(root, 'closed-unit-a');
  writeLedgerEntry(root, 'closed-unit-b');
  const seed = store.seedTombstonesFromLedger({ repoRoot: root });
  assert.strictEqual(seed.seeded, 2);
  assert.strictEqual(seed.corrupt, 0);

  const index = order.buildOrderIndex([], { seededTombstones: seed.tombstones });
  const late = record.makeRecord({
    session_id: 'resurrected', session_epoch: '2030-01-01T00:00:00.000Z',
    work_unit: 'closed-unit-a', seq: 1, kind: 'update', patch: { goal: 'revive' },
  });
  const d = order.decideAdmission({
    record: late, highWater: index.highWater, tombstones: index.tombstones,
    epochOf: function () { return null; },
  });
  assert.strictEqual(d.verdict, order.ADMISSION.POST_TOMBSTONE,
    'a clone-fresh journal still refuses to revive a ledger-closed unit');
});

test('M5 store: an absent or unreadable ledger warns and seeds zero without blocking bootstrap', () => {
  const root = mkRepo('noledger');
  const seed = store.seedTombstonesFromLedger({ repoRoot: root });
  assert.strictEqual(seed.available, false);
  assert.strictEqual(seed.seeded, 0);

  const boot = store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  assert.strictEqual(boot.ok, true, 'a missing ledger must not turn a clone into a stopped pipeline');

  // 손상 엔트리는 조용히 사라지지 않고 corrupt로 계상된다.
  const root2 = mkRepo('badledger');
  const dir = path.join(root2, '.claude', 'state', 'completion-ledger');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'broken__x.json'), '{ not json', 'utf8');
  const seed2 = store.seedTombstonesFromLedger({ repoRoot: root2 });
  assert.strictEqual(seed2.corrupt, 1);
  assert.strictEqual(seed2.seeded, 0);
});

test('M5 store: a __proto__ key in a journal line cannot pollute Object.prototype', () => {
  // security-reviewer S2. JSON.parse는 `__proto__`를 own 속성으로 만들고, 그 객체를
  // Object.assign의 source로 쓰면 [[Set]]이 Object.prototype setter를 발동시킨다.
  // allowlist 복사가 그 경로를 구조적으로 막는지 확인한다.
  const root = mkRepo('proto');
  store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  const hostile = '{"record_id":"x","ts":"2026-01-01T00:00:00.000Z","session_id":"s",' +
    '"work_unit":"wu","seq":2,"kind":"update","__proto__":{"polluted":"yes"},' +
    '"patch":{"__proto__":{"pollutedPatch":"yes"},"constructor":{"bad":1},"goal":"g"}}';
  fs.appendFileSync(store.activePath({ repoRoot: root }), hostile + '\n', 'utf8');

  const read = store.readRecords({ repoRoot: root });
  assert.strictEqual({}.polluted, undefined, 'Object.prototype must be untouched');
  assert.strictEqual({}.pollutedPatch, undefined, 'nested patch must not pollute either');
  const parsed = read.records.filter(function (r) { return r.record_id === 'x'; })[0];
  assert.ok(parsed, 'the record itself is still read');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed.patch, 'constructor'), false,
    'pollution keys are stripped from the patch');
  assert.strictEqual(parsed.patch.goal, 'g', 'legitimate patch fields survive');
});

test('M5 store: a __proto__ key in a completion-ledger entry cannot pollute Object.prototype', () => {
  const root = mkRepo('protoledger');
  const dir = path.join(root, '.claude', 'state', 'completion-ledger');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'evil__x.json'),
    '{"schema_version":"v1","__proto__":{"ledgerPolluted":"yes"},' +
    '"entry":{"decision_id":"unit-x","__proto__":{"entryPolluted":"yes"}}}', 'utf8');
  const seed = store.seedTombstonesFromLedger({ repoRoot: root });
  assert.strictEqual({}.ledgerPolluted, undefined);
  assert.strictEqual({}.entryPolluted, undefined);
  assert.strictEqual(seed.seeded, 1, 'the legitimate decision_id is still seeded');
});

test('M5 store: writeDegradedMarker returns a result and never throws', () => {
  // DD6.1 책임 2층 표 — I/O 층은 {ok:false}를 돌려주고 throw 판정은 state-writer가 한다.
  const root = mkRepo('marker');
  const ok = store.writeDegradedMarker(root, { reason: 'test' });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(store.isDegraded({ repoRoot: root }), true);

  // 존재하지 않는 드라이브로 강제 실패시켜도 throw하지 않는다.
  const failed = store.writeDegradedMarker({ dir: path.join(' invalid', 'nope') });
  assert.strictEqual(failed.ok, false);
  assert.ok(typeof failed.reason === 'string');

  assert.strictEqual(store.clearDegradedMarker({ repoRoot: root }).ok, true);
  assert.strictEqual(store.isDegraded({ repoRoot: root }), false);
});

test('M5 store: bootstrap refuses to run while the degraded marker is present', () => {
  const root = mkRepo('degradedboot');
  store.writeDegradedMarker(root, { reason: 'append failed' });
  const boot = store.bootstrapGenesis({ repoRoot: root, state: stateWriter.emptyState() });
  assert.strictEqual(boot.ok, false);
  assert.strictEqual(boot.reason, 'degraded');
  assert.strictEqual(boot.exitCode, 75, 'EX_TEMPFAIL — recovery is on the path, not optional');
});

test('M5 cli: journal verify exits non-zero on a content_hash mismatch and isolates the record', () => {
  const root = mkRepo('verifyhash');
  stateWriter.update(root, { goal: 'seed' });
  const target = store.activePath({ repoRoot: root });
  const lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean);
  const tampered = JSON.parse(lines[lines.length - 1]);
  tampered.patch = { goal: 'tampered without rehashing' };
  lines[lines.length - 1] = JSON.stringify(tampered);
  fs.writeFileSync(target, lines.join('\n') + '\n', 'utf8');

  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [CLI, 'journal', 'verify', '--json', '--cwd', root],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    code = err.status;
    out = String(err.stdout || '');
  }
  assert.notStrictEqual(code, 0, 'a tampered record must fail verify');
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  assert.strictEqual(parsed.checks.content_hash, false);
  assert.ok(parsed.corrupt_records.length >= 1);
});

test('M5 cli: journal verify exits non-zero when malformed lines are present', () => {
  // security-reviewer S7 — 조용한 per-line skip은 디스크 full로 인한 truncation을
  // 은폐한다. 카운트를 세는 것만으로는 부족하고 소비 축이 비영점 exit해야 한다.
  const root = mkRepo('verifymalformed');
  stateWriter.update(root, { goal: 'seed' });
  fs.appendFileSync(store.activePath({ repoRoot: root }), '{"truncated":\n', 'utf8');

  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [CLI, 'journal', 'verify', '--json', '--cwd', root],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    code = err.status;
    out = String(err.stdout || '');
  }
  assert.notStrictEqual(code, 0);
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  assert.strictEqual(parsed.checks.no_malformed_lines, false);
  assert.ok(parsed.malformed_count >= 1);
});

test('M5 cli: journal query filters by work-unit and surfaces superseded records on demand', () => {
  const root = mkRepo('query');
  stateWriter.update(root, { taskFingerprint: 'unit-alpha', goal: 'a' });
  stateWriter.update(root, { taskFingerprint: 'unit-beta', goal: 'b' });

  const all = JSON.parse(execFileSync(process.execPath,
    [CLI, 'journal', 'query', '--json', '--cwd', root], { encoding: 'utf8' }));
  assert.ok(all.count >= 2);

  const filtered = JSON.parse(execFileSync(process.execPath,
    [CLI, 'journal', 'query', '--json', '--work-unit', 'unit-beta', '--cwd', root],
    { encoding: 'utf8' }));
  assert.ok(filtered.count >= 1);
  assert.ok(filtered.records.every(function (r) { return r.work_unit === 'unit-beta'; }));

  const byKind = JSON.parse(execFileSync(process.execPath,
    [CLI, 'journal', 'query', '--json', '--kind', 'genesis', '--cwd', root],
    { encoding: 'utf8' }));
  assert.ok(byKind.records.every(function (r) { return r.kind === 'genesis'; }));

  const withSuperseded = JSON.parse(execFileSync(process.execPath,
    [CLI, 'journal', 'query', '--json', '--include-superseded', '--cwd', root],
    { encoding: 'utf8' }));
  assert.ok(withSuperseded.count >= all.count);
});

test('M5 cli: journal checkpoint --reseed seals the discarded range into the new genesis', () => {
  // security-reviewer S6 — reseed는 이력을 지우면서 자기 자신은 기록하지 않았다.
  // 파괴를 막지는 않되(저장소 write 권한자는 파일을 직접 지울 수 있다) 무엇이 언제
  // 왜 지워졌는지는 반드시 남아야 한다.
  const root = mkRepo('reseed');
  stateWriter.update(root, { goal: 'before reseed' });
  stateWriter.update(root, { nextStep: 'more history' });
  const before = store.readRecords({ repoRoot: root }).records.length;
  store.writeDegradedMarker(root, { reason: 'simulated append failure' });

  execFileSync(process.execPath,
    [CLI, 'journal', 'checkpoint', '--reseed', '--json', '--cwd', root],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  assert.strictEqual(store.isDegraded({ repoRoot: root }), false, 'reseed clears the marker');
  const cp = store.readCheckpoint({ repoRoot: root });
  assert.strictEqual(cp.kind, 'reseed');
  const prov = cp.checkpoint_of.reseed_of;
  assert.ok(prov, 'the new genesis carries reseed provenance');
  assert.strictEqual(prov.discarded_record_count, before);
  assert.ok(prov.degraded_reason.indexOf('simulated append failure') !== -1);
  assert.ok(prov.at, 'the reseed timestamp is sealed');
});
