'use strict';

// 러너 test (Task 4). **열한 갈래**를 단언한다.
//
// mirror는 `plugins/mccp/scripts/lib/tests/suite-determinism.test.js` — 판정 축은
// 합성 입력으로 단언하고, 실제로 흔들리는 fixture를 스위트에 심지 않는다. (8)(9)만
// 예외이며 그것은 **결정적 spawn**이지 flaky fixture가 아니다.
//
// DD8이 정한 바에 따라 이 러너가 조용히 틀릴 수 있는 유일한 방향은
// *실행되지 않았는데 통과로 읽힘*이다. (6)(7)(11)이 그 방향을 직접 겨냥하고,
// 나머지는 그 판정이 서 있는 바닥(열거·산술·집계·redaction·spawn 형태)을 고정한다.
//
// **전제**: (8)(9)는 `git ls-files`를 거치므로 신규 파일이 먼저 `git add`되어야
// 한다. 미stage 상태의 red는 결함이 아니라 전제 미충족이다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUN_JS = path.join(REPO_ROOT, 'scripts', 'test-suite', 'run.js');
const REPORTER = path.join(REPO_ROOT, 'scripts', 'test-suite', 'reporter.mjs');

const { enumerateTests, exclusionsDigest } = require('../test-suite/enumerate');
const {
  childEnv,
  FORCED_POLICY_ENV,
  planChunks,
  buildSpawnArgs,
  reporterUrl,
  deriveAttribution,
  foldChunks,
  validateElement,
  mergeIntoContainer,
  runChunk,
  runOnce,
  LABEL_RE,
} = require('../test-suite/run');
const { createRedactor } = require('../test-suite/redact');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-suite-test-'));
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) 열거
// ─────────────────────────────────────────────────────────────────────────────

test('(1) enumerate — reasonless exclusion throws, never silently filters', () => {
  assert.throws(
    () => enumerateTests({ trackedFiles: ['a.test.js'], exclusions: [{ pattern: '*.test.js' }] }),
    /reason is required/
  );
  // 공백만 있는 사유도 부재로 취급한다 — 아니면 계약이 형식만 남는다.
  assert.throws(
    () => enumerateTests({ trackedFiles: ['a.test.js'], exclusions: [{ pattern: 'a*', reason: '   ' }] }),
    /reason is required/
  );
  assert.throws(
    () => enumerateTests({ trackedFiles: ['a.test.js'], exclusions: [{ reason: 'x' }] }),
    /pattern must be/
  );
});

test('(1) enumerate — included/excluded partition the *.test.js input exactly', () => {
  const tracked = [
    'b/z.test.js', 'a/y.test.js', 'not-a-test.js', 'c/skip.test.js', 'README.md',
  ];
  const r = enumerateTests({
    trackedFiles: tracked,
    exclusions: [{ pattern: 'c/**', reason: 'dead vendored copy' }],
  });
  const candidates = tracked.filter((f) => f.endsWith('.test.js'));
  assert.strictEqual(r.included.length + r.excluded.length, candidates.length);
  const union = r.included.concat(r.excluded.map((e) => e.path)).sort();
  assert.deepStrictEqual(union, candidates.slice().sort());
  assert.deepStrictEqual(r.excluded.map((e) => e.path), ['c/skip.test.js']);
  assert.strictEqual(r.excluded[0].reason, 'dead vendored copy');
});

test('(1) enumerate — separators normalise and order is deterministic', () => {
  const win = enumerateTests({ trackedFiles: ['b\\z.test.js', 'a\\y.test.js'] });
  const posix = enumerateTests({ trackedFiles: ['a/y.test.js', 'b/z.test.js'] });
  assert.deepStrictEqual(win.included, ['a/y.test.js', 'b/z.test.js']);
  assert.deepStrictEqual(win.included, posix.included);
});

test('(1) enumerate — exclusions digest is order-independent and reason-sensitive', () => {
  const a = [{ pattern: 'x/**', reason: 'one' }, { pattern: 'y/**', reason: 'two' }];
  const b = [{ pattern: 'y/**', reason: 'two' }, { pattern: 'x/**', reason: 'one' }];
  assert.strictEqual(exclusionsDigest(a), exclusionsDigest(b));
  assert.notStrictEqual(exclusionsDigest(a),
    exclusionsDigest([{ pattern: 'x/**', reason: 'CHANGED' }, { pattern: 'y/**', reason: 'two' }]));
  assert.match(exclusionsDigest([]), /^sha256:[0-9a-f]{64}$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// (2) argv 산술
// ─────────────────────────────────────────────────────────────────────────────

test('(2) planChunks — below / at / above the threshold', () => {
  const f = (n) => Array.from({ length: n }, (_, i) => 'p/' + String(i).padStart(4, '0') + '.test.js');

  assert.deepStrictEqual(planChunks({ files: [], limitBytes: 100 }), []);
  assert.strictEqual(planChunks({ files: f(3), limitBytes: 10000 }).length, 1);

  const files = f(50);
  const limit = 200;
  const chunks = planChunks({ files: files, limitBytes: limit });
  assert.ok(chunks.length > 1, 'expected splitting above the threshold');

  // 각 chunk의 바이트가 임계 이하다 — 단일 파일이 혼자 임계를 넘는 경우만 예외이며
  // 그때도 **버리지 않는다**(조용한 제외 금지).
  chunks.forEach((c) => {
    const bytes = c.reduce((a, x) => a + Buffer.byteLength(x, 'utf8') + 1, 0);
    assert.ok(bytes <= limit || c.length === 1, 'chunk exceeded limit with >1 file');
  });
  // 분할은 입력의 분할이다 — 손실도 중복도 없다.
  assert.deepStrictEqual([].concat.apply([], chunks), files);
});

test('(2) planChunks — an oversized single file becomes its own chunk, never dropped', () => {
  const big = 'x'.repeat(500) + '.test.js';
  const chunks = planChunks({ files: ['a.test.js', big, 'b.test.js'], limitBytes: 50 });
  assert.deepStrictEqual([].concat.apply([], chunks), ['a.test.js', big, 'b.test.js']);
  assert.ok(chunks.some((c) => c.length === 1 && c[0] === big));
});

// ─────────────────────────────────────────────────────────────────────────────
// (3) reporter 집계 — 합성 이벤트
// ─────────────────────────────────────────────────────────────────────────────

function ev(file, name, dur, extra) {
  return {
    type: 'test:complete',
    at: (extra && extra.at) || 1000,
    data: {
      nesting: 0,
      name: name,
      file: file,
      details: { duration_ms: dur, error: extra && extra.error },
    },
  };
}

test('(3) reporter — roll-up is separated from real tests (no double count)', async () => {
  const { aggregateEvents } = await import(pathToFileURL(REPORTER).href);
  const file = path.join(REPO_ROOT, 'p', 'a.test.js');
  const report = aggregateEvents([
    ev(file, 'alpha one', 2),
    ev(file, 'alpha two', 3),
    ev(file, file, 270),          // roll-up: name === file
  ], { repoRoot: REPO_ROOT });

  assert.strictEqual(report.per_file.length, 1);
  const s = report.per_file[0];
  assert.strictEqual(s.tests, 2, 'roll-up must not be counted as a test');
  assert.strictEqual(s.pass, 2);
  assert.strictEqual(s.fail, 0);
  assert.strictEqual(s.sum_ms, 5, 'sum_ms must exclude the roll-up duration');
  assert.strictEqual(s.file_ms, 270, 'file_ms carries the roll-up wall clock');
  assert.strictEqual(report.attributed_events, 3);
  assert.strictEqual(report.nesting0_events, 3);
});

test('(3) reporter — roll-up is detected under the REAL relative-path invocation', async () => {
  // 회귀 가드. 첫 판본은 `name === file` 동등성을 썼고, probe가 절대 경로로
  // 호출한 탓에 probe에서만 맞았다. 러너는 argv 예산 때문에 relative를 넘기므로
  // `data.name`은 relative이고 `data.file`은 절대다 — 동등성은 **항상** 거짓이
  // 되어 roll-up이 진짜 test로 계상됐다(이중계상).
  const { aggregateEvents, isFileRollUp } = await import(pathToFileURL(REPORTER).href);
  const rel = 'plugins/mccp/scripts/lib/tests/task-tool-smoke.test.js';
  const abs = path.join(REPO_ROOT, rel.split('/').join(path.sep));

  assert.strictEqual(isFileRollUp(rel, abs), true, 'relative name must match its absolute file');
  assert.strictEqual(isFileRollUp(abs, abs), true, 'absolute name must still match');
  assert.strictEqual(isFileRollUp('some real test name', abs), false);
  // 세그먼트 경계 — 접미가 파일명 중간에서 시작하면 안 된다.
  assert.strictEqual(isFileRollUp('smoke.test.js', path.join(REPO_ROOT, 'a', 'my-smoke.test.js')), false);

  const report = aggregateEvents([
    ev(abs, 'a real top-level test', 10),
    ev(abs, rel, 118),              // roll-up, named the way the CLI was invoked
  ], { repoRoot: REPO_ROOT });

  assert.strictEqual(report.per_file.length, 1);
  assert.strictEqual(report.per_file[0].tests, 1, 'the roll-up must not inflate the test count');
  assert.strictEqual(report.per_file[0].sum_ms, 10);
  assert.strictEqual(report.per_file[0].file_ms, 118);
});

test('(3) reporter — a crash file with only a roll-up is still attributed', async () => {
  const { aggregateEvents } = await import(pathToFileURL(REPORTER).href);
  const file = path.join(REPO_ROOT, 'p', 'crash.test.js');
  const report = aggregateEvents([
    ev(file, file, 270, { error: new Error('boom import crash') }),
  ], { repoRoot: REPO_ROOT });

  assert.strictEqual(report.per_file.length, 1, 'crash file must not vanish');
  assert.strictEqual(report.per_file[0].tests, 0);
  assert.strictEqual(report.failing.length, 1);
  assert.strictEqual(report.failing[0].kind, 'file');
});

test('(3) reporter — absent data.file reports unavailable, NEVER zero', async () => {
  const { aggregateEvents } = await import(pathToFileURL(REPORTER).href);
  const report = aggregateEvents([
    { type: 'test:complete', at: 1, data: { nesting: 0, name: 'x', file: null, details: { duration_ms: 1 } } },
    { type: 'test:complete', at: 2, data: { nesting: 0, name: 'y', file: '', details: { duration_ms: 1 } } },
  ], { repoRoot: REPO_ROOT });

  assert.strictEqual(report.attributed_events, 0);
  assert.strictEqual(report.nesting0_events, 2, 'events arrived — that is what separates unavailable from none');
  assert.deepStrictEqual(report.per_file, []);

  const d = deriveAttribution({
    filesTotal: 2, perFileCount: 0,
    nesting0Events: report.nesting0_events, attributedEvents: report.attributed_events,
  });
  assert.strictEqual(d.attribution, 'unavailable');
  assert.strictEqual(d.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// (4) 경로 redaction — security F1 회귀 가드
// ─────────────────────────────────────────────────────────────────────────────

test('(4) redaction — absolute keys fold repo-relative and the original is absent', async () => {
  const { aggregateEvents } = await import(pathToFileURL(REPORTER).href);
  const abs = path.join(REPO_ROOT, 'plugins', 'mccp', 'x.test.js');
  const tmpLeak = path.join(os.tmpdir(), 'mccp-repo-abc', 'helpers.js');
  const report = aggregateEvents([
    ev(abs, 'one', 1, { error: new Error('failed at ' + tmpLeak + ':12') }),
    ev(abs, abs, 5),
  ], { repoRoot: REPO_ROOT });

  assert.strictEqual(report.per_file[0].file, 'plugins/mccp/x.test.js');

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(JSON.stringify(abs).slice(1, -1)),
    'the original absolute test path must not survive anywhere in the report');
  assert.ok(!serialized.includes(JSON.stringify(os.tmpdir()).slice(1, -1)),
    'the tmpdir prefix must not survive in failure text');
  assert.ok(report.failing[0].error.includes('<tmp>'), 'tmpdir prefix folds to <tmp>');
  assert.strictEqual(report.redaction_ok, true);
});

test('(4) redaction — the residual scan reports truncation separately from cleanliness', () => {
  const r = createRedactor({ repoRoot: REPO_ROOT });
  const clean = r.scanResidual({ a: 'plugins/mccp/x.test.js' });
  assert.deepStrictEqual(clean.hits, []);
  assert.strictEqual(clean.truncated, false);

  // 상한을 넘기는 깊이는 `truncated`로 보고된다 — 빈 hits 하나로 "깨끗함"과
  // "못 봤음"을 겸하면 후자가 전자로 읽힌다.
  let deep = 'leaf';
  for (let i = 0; i < 40; i++) deep = { n: deep };
  const scanned = r.scanResidual(deep);
  assert.strictEqual(scanned.truncated, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// (5) spawn 인자 형태 — Windows 전용 회귀이므로 단언이 유일한 기계 장치
// ─────────────────────────────────────────────────────────────────────────────

// 계약 술어. 별도 함수로 두는 이유는 이것 자체가 이빨을 갖는지 단언하기 위해서다.
function reporterArgIsContracted(value) {
  return value.startsWith('file://') || value.startsWith('./') || value.startsWith('../');
}

test('(5) buildSpawnArgs — reporter arg is a file:// URL, never a bare absolute path', () => {
  const args = buildSpawnArgs({ reporterPath: reporterUrl(REPORTER), files: ['a.test.js'] });
  assert.strictEqual(args[0], '--test');
  assert.ok(args[1].startsWith('--test-reporter='));
  const value = args[1].slice('--test-reporter='.length);
  assert.ok(reporterArgIsContracted(value),
    'absolute reporter path dies with ERR_UNSUPPORTED_ESM_URL_SCHEME on Windows: ' + value);
  assert.strictEqual(args[2], '--', 'the terminator is required — a *.test.js item can look like a node flag');
  assert.deepStrictEqual(args.slice(3), ['a.test.js']);
});

test('(5) the contract predicate actually rejects a raw absolute path', () => {
  // 술어가 무엇이든 통과시키면 위 단언은 장식이 된다.
  assert.strictEqual(reporterArgIsContracted('C:\\repo\\reporter.mjs'), false);
  assert.strictEqual(reporterArgIsContracted('/repo/reporter.mjs'), false);
  assert.strictEqual(reporterArgIsContracted(reporterUrl(REPORTER)), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// (6) 위험 방향 실패 — "실행되지 않았는데 통과로 읽힘"
// ─────────────────────────────────────────────────────────────────────────────

const RED = createRedactor({ repoRoot: REPO_ROOT });

test('(6) runChunk — spawn ENOENT is ok:false with per_file null', () => {
  const r = runChunk({
    files: ['a.test.js'], reporterPath: 'file:///r.mjs', cwd: REPO_ROOT, redactor: RED,
    spawn: () => { const e = new Error('spawn node ENOENT'); e.code = 'ENOENT'; throw e; },
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /spawn-threw/);
  assert.strictEqual(r.per_file, null);
});

test('(6) runChunk — spawnSync error result is ok:false with per_file null', () => {
  const r = runChunk({
    files: ['a.test.js'], reporterPath: 'file:///r.mjs', cwd: REPO_ROOT, redactor: RED,
    spawn: () => ({ error: new Error('EACCES'), status: null, stdout: '' }),
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /spawn-failed/);
  assert.strictEqual(r.per_file, null);
});

test('(6) runChunk — a missing reporter line is NOT read as zero failures', () => {
  const r = runChunk({
    files: ['a.test.js'], reporterPath: 'file:///r.mjs', cwd: REPO_ROOT, redactor: RED,
    spawn: () => ({ status: 0, stdout: 'some output but no marker line\n' }),
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /incomplete-report/);
  assert.strictEqual(r.per_file, null);
});

test('(6) runChunk — a truncated reporter line is ok:false, not silently empty', () => {
  const r = runChunk({
    files: ['a.test.js'], reporterPath: 'file:///r.mjs', cwd: REPO_ROOT, redactor: RED,
    spawn: () => ({ status: 0, stdout: '##MCCP-SUITE-REPORT## {"per_file":[{"file":"a.te\n' }),
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /truncated-report/);
  assert.strictEqual(r.per_file, null);
});

test('(6) runOnce — an injected failing spawn yields ok:false and per_file null', () => {
  const r = runOnce({
    cwd: REPO_ROOT, files: ['a.test.js', 'b.test.js'], reporterPath: 'file:///r.mjs',
    redactor: RED, gitSha: 'deadbeef',
    spawn: () => { throw new Error('spawn node ENOENT'); },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.per_file, null);
  assert.strictEqual(r.attribution, 'none');
  assert.ok(r.wall_clock_ms >= 0);
});

test('(6) run.js redacts its OWN failure strings, not just the reporter output', () => {
  const leak = path.join(os.tmpdir(), 'mccp-secret-dir', 'x');
  const r = runChunk({
    files: ['a.test.js'], reporterPath: 'file:///r.mjs', cwd: REPO_ROOT, redactor: RED,
    spawn: () => { throw new Error('cannot exec at ' + leak); },
  });
  assert.strictEqual(r.ok, false);
  assert.ok(!r.reason.includes(os.tmpdir()),
    'spawn failure text bypasses the reporter — run.js must redact it itself');
  assert.ok(r.reason.includes('<tmp>'));
});

// ─────────────────────────────────────────────────────────────────────────────
// (7) chunk 접기 — fail-open 회귀 가드
// ─────────────────────────────────────────────────────────────────────────────

function chunkResult(over) {
  return Object.assign({
    ok: true, reason: null, exit_code: 0, per_file: [], failing: [],
    redaction_ok: true, nesting0_events: 0, attributed_events: 0,
  }, over);
}

test('(7) foldChunks — first chunk red + last chunk green folds to NON-zero', () => {
  const folded = foldChunks([
    chunkResult({ exit_code: 1, per_file: [{ file: 'a.test.js' }], nesting0_events: 1, attributed_events: 1 }),
    chunkResult({ exit_code: 0, per_file: [{ file: 'b.test.js' }], nesting0_events: 1, attributed_events: 1 }),
  ], { filesTotal: 2 });

  assert.strictEqual(folded.exit_code, 1, 'last-value folding would hide the first chunk red');
  assert.deepStrictEqual(folded.chunks_failed, [0]);
});

test('(7) foldChunks — per_file is a union, failing preserves order, ok is a conjunction', () => {
  const folded = foldChunks([
    chunkResult({
      per_file: [{ file: 'b.test.js' }], failing: [{ file: 'b.test.js', name: 'first' }],
      nesting0_events: 1, attributed_events: 1,
    }),
    chunkResult({
      per_file: [{ file: 'a.test.js' }], failing: [{ file: 'a.test.js', name: 'second' }],
      nesting0_events: 1, attributed_events: 1,
    }),
  ], { filesTotal: 2 });

  assert.deepStrictEqual(folded.per_file.map((p) => p.file), ['a.test.js', 'b.test.js']);
  assert.deepStrictEqual(folded.failing.map((f) => f.name), ['first', 'second']);
  assert.strictEqual(folded.ok, true);
});

test('(7) foldChunks — one unmeasured chunk poisons ok even if the others measured', () => {
  const folded = foldChunks([
    chunkResult({ per_file: [{ file: 'a.test.js' }], nesting0_events: 1, attributed_events: 1 }),
    chunkResult({ ok: false, reason: 'incomplete-report', per_file: null }),
  ], { filesTotal: 2 });
  assert.strictEqual(folded.ok, false);
  assert.strictEqual(folded.per_file, null);
  assert.match(folded.reason, /chunk\[1\]/);
});

test('(7) foldChunks — ok:true survives a red suite (ok is measurement validity, not green)', () => {
  const folded = foldChunks([
    chunkResult({
      exit_code: 1, per_file: [{ file: 'a.test.js' }],
      failing: [{ file: 'a.test.js', name: 'boom' }],
      nesting0_events: 1, attributed_events: 1,
    }),
  ], { filesTotal: 1 });
  assert.strictEqual(folded.ok, true, 'M1 measures; red is recorded, not a measurement failure');
  assert.strictEqual(folded.exit_code, 1);
  assert.strictEqual(folded.attribution, 'complete');
});

test('(7) foldChunks — attribution is re-derived globally, never folded per chunk', () => {
  // 각 chunk는 자기 안에서 "전부 귀속"이지만 전역 분모로는 부족하다.
  const folded = foldChunks([
    chunkResult({ per_file: [{ file: 'a.test.js' }], nesting0_events: 1, attributed_events: 1 }),
  ], { filesTotal: 3 });
  assert.strictEqual(folded.attribution, 'partial');
  assert.strictEqual(folded.ok, false);
  assert.match(folded.reason, /2 of 3/);
});

// ─────────────────────────────────────────────────────────────────────────────
// (8) 자기 포함 — 합성이 아니라 실제 producer로
// ─────────────────────────────────────────────────────────────────────────────

test('(8) run.js --list actually enumerates this very test file', () => {
  const r = spawnSync(process.execPath, [RUN_JS, '--list'], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  assert.strictEqual(r.status, 0, 'run.js --list failed: ' + String(r.stderr).slice(0, 400));
  const listed = String(r.stdout).split(/\r?\n/).filter(Boolean);

  assert.ok(listed.includes('scripts/tests/test-suite.test.js'),
    'the entry point must enumerate its own test, or its regressions are never observed. ' +
    'If this is red, check that scripts/ has been `git add`ed (see the header note).');

  // 열거 계약은 `*.test.js`만이다 — 러너 소스가 나타나면 Acceptance 2가 깨진다.
  ['scripts/test-suite/run.js', 'scripts/test-suite/enumerate.js',
    'scripts/test-suite/reporter.mjs', 'scripts/test-suite/redact.js'].forEach((f) => {
    assert.ok(!listed.includes(f), f + ' must not appear — enumeration accepts only *.test.js');
  });
});

test('(8) run.js --list matches git ls-files exactly (exclusions are empty)', () => {
  const listed = spawnSync(process.execPath, [RUN_JS, '--list'], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const tracked = spawnSync('git', ['ls-files', '*.test.js'], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const a = String(listed.stdout).split(/\r?\n/).filter(Boolean).sort();
  const b = String(tracked.stdout).split(/\r?\n/).filter(Boolean).sort();
  assert.deepStrictEqual(a, b);
});

// ─────────────────────────────────────────────────────────────────────────────
// (9) reporter를 실제 `node --test`에 붙여 본다
// ─────────────────────────────────────────────────────────────────────────────

// 스위트에서 가장 싼 두 파일(2026-08-31 baseline: 159ms · 163ms). 합성 이벤트는
// **기대한 형태를 손으로 만든 것**이라 node가 실제로 그 형태를 낸다는 것을
// 증명하지 않는다. (8)에 적용한 논리를 더 취약한 축(node 내부 이벤트 스키마 ·
// nesting 의미 · 다중 파일에서의 data.file 존재)에 적용하지 않을 이유가 없다.
const FIXTURE_TWO = [
  'plugins/mccp/scripts/lib/tests/task-tool-smoke.test.js',
  'plugins/mccp/scripts/lib/tests/state-journal-order.test.js',
];

test('(9) end-to-end — two real files produce attribution=complete with 2 per_file rows', () => {
  const dir = mkTmp();
  const listFile = path.join(dir, 'files.txt');
  fs.writeFileSync(listFile, FIXTURE_TWO.join('\n') + '\n');

  const r = spawnSync(process.execPath, [RUN_JS, '--json', '--files-from', listFile], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  const out = JSON.parse(String(r.stdout));

  // Node 20에서 이 단언이 red가 되면 그것이 DD6 fallback의 실증이지 test 결함이 아니다.
  assert.strictEqual(out.attribution, 'complete',
    'reason=' + String(out.reason) + ' stderr=' + String(r.stderr).slice(0, 400));
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.files_total, 2);
  assert.strictEqual(out.per_file.length, 2);
  assert.deepStrictEqual(out.per_file.map((p) => p.file).sort(), FIXTURE_TWO.slice().sort());
  assert.ok(out.wall_clock_ms > 0);
  assert.ok(out.git_sha && out.git_sha.length > 0);
  assert.strictEqual(out.redaction_ok, true);
  out.per_file.forEach((p) => {
    assert.ok(p.tests > 0, p.file + ' reported zero tests — roll-up separation may be wrong');
    // `file_ms`가 null이면 roll-up을 못 알아본 것이다. 이 단언이 없었다면 이중계상
    // 회귀가 (9)를 통과했을 것이다 — 첫 실행에서 실제로 그럴 뻔했다.
    assert.strictEqual(typeof p.file_ms, 'number',
      p.file + ' has no roll-up duration — the roll-up discriminator failed');
  });

  // 이 test 자체가 `node --test` 안에서 돈다. 자식이 NODE_TEST_CONTEXT를 상속하면
  // 자식 러너가 --test-reporter를 무시해 stdout이 0바이트가 되고 위 전부가 무너진다.
  assert.strictEqual(out.chunks, 1);
  assert.deepStrictEqual(out.chunks_failed, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// (10) 병합 의미론 — 신뢰 경계를 넘는 지점
// ─────────────────────────────────────────────────────────────────────────────

function goodElement(over) {
  return Object.assign({
    ok: true, redaction_ok: true, attribution: 'complete',
    wall_clock_ms: 1234, git_sha: 'abc123', files_total: 2,
    per_file: [{ file: 'a.test.js' }, { file: 'b.test.js' }],
    failing: [],
  }, over);
}

test('(10) merge — the same label REPLACES, different labels coexist', () => {
  let c = mergeIntoContainer({ container: null, label: 'local', element: goodElement() });
  assert.strictEqual(c.runs.length, 1);
  c = mergeIntoContainer({ container: c, label: 'local', element: goodElement({ wall_clock_ms: 9999 }) });
  assert.strictEqual(c.runs.length, 1, 'same label must replace, not append a duplicate');
  assert.strictEqual(c.runs[0].wall_clock_ms, 9999);
  c = mergeIntoContainer({ container: c, label: 'ci-node20', element: goodElement() });
  assert.strictEqual(c.runs.length, 2);
  assert.deepStrictEqual(c.runs.map((r) => r.label), ['ci-node20', 'local']);
});

test('(10) merge — label enum is enforced', () => {
  assert.ok(LABEL_RE.test('ci-node20'));
  assert.ok(!LABEL_RE.test('../escape'));
  assert.throws(() => mergeIntoContainer({ container: null, label: '../x', element: goodElement() }), /--label/);
  assert.throws(() => mergeIntoContainer({ container: null, label: 'UPPER', element: goodElement() }), /--label/);
});

test('(10) merge — schema violations are refused', () => {
  assert.strictEqual(validateElement(goodElement()).ok, true);

  assert.strictEqual(validateElement(goodElement({ ok: 'yes' })).ok, false);
  assert.strictEqual(validateElement(goodElement({ git_sha: '' })).ok, false);
  assert.strictEqual(validateElement(goodElement({ wall_clock_ms: 0 })).ok, false);

  const noKey = goodElement();
  delete noKey.files_total;
  assert.strictEqual(validateElement(noKey).ok, false);

  // ok:true인데 per_file 길이가 분모와 다르면 거부한다.
  assert.strictEqual(validateElement(goodElement({ files_total: 3 })).ok, false);
  // ok:true인데 attribution이 complete가 아니면 거부한다.
  assert.strictEqual(validateElement(goodElement({ attribution: 'partial' })).ok, false);
});

test('(10) merge — redaction_ok:false is a BLOCK, not a flag', () => {
  // 이것이 원장 b52ca84d / 64a79560의 닫힘이다. 이전 명세의 거부 조건은
  // "필수 키 + ok 불리언"뿐이었고 `ok:false`도 유효 불리언이라 통과했다.
  const leaking = goodElement({ ok: false, per_file: null, redaction_ok: false });
  const v = validateElement(leaking);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => /redaction_ok is not true/.test(e)));

  // Acceptance 1이 명시 수용하는 ci-node20 행은 살아 있어야 한다:
  // ok:false ∧ attribution:'unavailable' 이지만 redaction은 깨끗한 경우.
  const accepted = goodElement({
    ok: false, per_file: null, attribution: 'unavailable', redaction_ok: true,
  });
  assert.strictEqual(validateElement(accepted).ok, true,
    'folding redaction into ok would kill the accepted ci-node20 row');
});

test('(10) merge — the residual scan is re-applied at merge time', () => {
  const redactor = createRedactor({ repoRoot: REPO_ROOT });
  const ciLeak = goodElement({
    failing: [{ file: 'a.test.js', name: 'x', error: 'at /home/runner/work/repo/x.js:1' }],
  });
  const v = validateElement(ciLeak, { redactor: redactor });
  assert.strictEqual(v.ok, false, 'a CI-origin absolute path must be caught by the secondary scan');
  assert.ok(v.errors.some((e) => /secondary residual scan/.test(e)));
});

test('(10) merge — prototype pollution keys are refused end-to-end via the CLI', () => {
  const dir = mkTmp();
  const container = path.join(dir, 'container.json');

  const okFile = path.join(dir, 'ok.json');
  fs.writeFileSync(okFile, JSON.stringify(goodElement()));
  const r1 = spawnSync(process.execPath,
    [RUN_JS, '--merge-into', container, '--label', 'local', '--from', okFile],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.strictEqual(r1.status, 0, String(r1.stderr).slice(0, 400));
  assert.strictEqual(JSON.parse(fs.readFileSync(container, 'utf8')).runs.length, 1);

  const badFile = path.join(dir, 'bad.json');
  fs.writeFileSync(badFile, JSON.stringify(goodElement({ redaction_ok: false })));
  const r2 = spawnSync(process.execPath,
    [RUN_JS, '--merge-into', container, '--label', 'ci-node20', '--from', badFile],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.strictEqual(r2.status, 12, 'a leaking element must be refused with a distinct exit code');
  assert.match(String(r2.stderr), /REFUSED to merge/);
  assert.strictEqual(JSON.parse(fs.readFileSync(container, 'utf8')).runs.length, 1,
    'the refused element must not have been appended');

  const pollutedFile = path.join(dir, 'polluted.json');
  fs.writeFileSync(pollutedFile, '{"ok":true,"__proto__":{"x":1}}');
  const r3 = spawnSync(process.execPath,
    [RUN_JS, '--merge-into', container, '--label', 'evil', '--from', pollutedFile],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.notStrictEqual(r3.status, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// (11) 귀속 불완전의 negative 방향 — 과다허용 회귀 가드
// ─────────────────────────────────────────────────────────────────────────────

test('(11) attribution probe — partial: 3 expected, 2 attributed', () => {
  const d = deriveAttribution({
    filesTotal: 3, perFileCount: 2, nesting0Events: 5, attributedEvents: 5,
  });
  assert.strictEqual(d.attribution, 'partial');
  assert.strictEqual(d.ok, false);
  assert.match(d.reason, /1 of 3/, 'the reason must carry the missing count');
});

test('(11) attribution probe — unavailable: events arrived but none carried data.file', () => {
  const d = deriveAttribution({
    filesTotal: 3, perFileCount: 0, nesting0Events: 7, attributedEvents: 0,
  });
  assert.strictEqual(d.attribution, 'unavailable');
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.reason, 'attribution-unavailable');
});

test('(11) attribution probe — none: no nesting-0 test:complete arrived at all', () => {
  const d = deriveAttribution({
    filesTotal: 3, perFileCount: 0, nesting0Events: 0, attributedEvents: 0,
  });
  assert.strictEqual(d.attribution, 'none');
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.reason, 'no-test-completed');
});

test('(11) attribution probe — ZERO attribution is NOT ok:true (the reversal guard)', () => {
  // 1건 귀속은 차단되는데 0건 귀속은 통과하던 역전이 앞선 판본의 실제 결함이었고,
  // 그 방향(실행되지 않았는데 통과로 읽힘)이 DD8이 유일한 치명이라 부른 것이다.
  [
    { nesting0Events: 0, attributedEvents: 0 },
    { nesting0Events: 9, attributedEvents: 0 },
  ].forEach((probe) => {
    const d = deriveAttribution(Object.assign({ filesTotal: 5, perFileCount: 0 }, probe));
    assert.strictEqual(d.ok, false,
      'zero attribution must never be ok:true — worst input must not fall permissive');
    assert.notStrictEqual(d.attribution, 'complete');
  });

  // 그리고 `complete`만이 ok:true인 유일한 값이다.
  ['partial', 'unavailable', 'none'].forEach((v) => {
    assert.notStrictEqual(v, 'complete');
  });
  assert.strictEqual(
    deriveAttribution({ filesTotal: 2, perFileCount: 2, nesting0Events: 2, attributedEvents: 2 }).ok,
    true
  );
});

test('(11) attribution probe — an empty file set is never complete', () => {
  const d = deriveAttribution({
    filesTotal: 0, perFileCount: 0, nesting0Events: 0, attributedEvents: 0,
  });
  assert.notStrictEqual(d.attribution, 'complete');
  assert.strictEqual(d.ok, false);
});

// ── (12) ci-full-suite M2 갈래 H — 자식 env 정책 (UI2) ────────────────────────
//
// 이 갈래를 "갈래 H 4파일이 green이다"로만 검증하면 안 된다. 그 오라클은
// `MCCP_CODEX_DISABLED` 강제와 ambient 봉인 격리를 **구분하지 못하고**, 계획 자신이
// Risks 1행에서 정확히 그 혼동을 위험으로 적었다. 그래서 `childEnv`를 export하고
// 자식에게 실제로 무엇이 실리는지를 직접 단언한다.

test('(12) childEnv forces the codex-disabled policy by default (UI2)', () => {
  const env = childEnv('/some/repo');
  assert.strictEqual(env.MCCP_CODEX_DISABLED, '1',
    '전수 실행은 codex 경로를 수백 회 돌리므로 기본값이 반드시 비활성이어야 한다');
  assert.strictEqual(FORCED_POLICY_ENV.MCCP_CODEX_DISABLED, '1');
});

test('(12b) --allow-codex leaves the ambient policy alone (opt-out, UI2)', () => {
  const saved = process.env.MCCP_CODEX_DISABLED;
  try {
    delete process.env.MCCP_CODEX_DISABLED;
    const forced = childEnv('/some/repo');
    const allowed = childEnv('/some/repo', { allowCodex: true });
    assert.strictEqual(forced.MCCP_CODEX_DISABLED, '1', '기본값은 강제다');
    assert.strictEqual(allowed.MCCP_CODEX_DISABLED, undefined,
      '해제 플래그는 강제를 없앨 뿐 반대 값을 심지 않는다 — 없던 정책을 만들지 않는다');
  } finally {
    if (saved === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = saved;
  }
});

test('(12c) childEnv never assigns MCCP_ROUND_LEDGER — it is operator policy', () => {
  // `round-cap-command-body.test.js:209-212`가 게이트 command body에 대해 단언하는
  // 불변식과 같은 것을, 그 test가 스캔하지 않는 이 러너에 대해 단언한다. 그것을
  // 대입하면 `seal.js:207-213`이 의도적으로 만든 봉인-우선 규칙을 우회하는 조용한
  // kill switch가 되고, 캡 강제를 지운 회귀가 스위트 전역에서 green으로 지나간다.
  const saved = process.env.MCCP_ROUND_LEDGER;
  try {
    delete process.env.MCCP_ROUND_LEDGER;
    assert.strictEqual(childEnv('/some/repo').MCCP_ROUND_LEDGER, undefined);
    assert.strictEqual(childEnv('/some/repo', { allowCodex: true }).MCCP_ROUND_LEDGER, undefined);
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(FORCED_POLICY_ENV, 'MCCP_ROUND_LEDGER'), false,
      '강제 목록에 이 이름이 들어오면 그 순간 불변식이 깨진다');
  } finally {
    if (saved === undefined) delete process.env.MCCP_ROUND_LEDGER;
    else process.env.MCCP_ROUND_LEDGER = saved;
  }
});

test('(12d) childEnv keeps MCCP_SUITE_REPO_ROOT — reporter.mjs consumes it', () => {
  // M2 계획은 이 변수의 소비처가 0건이라 적었으나 실측은 반대다
  // (`scripts/test-suite/reporter.mjs`가 repo-relative 산출의 기준점으로 읽는다).
  // 제거했다면 redaction/attribution 경로가 조용히 깨졌을 것이므로, 그 소비를
  // 이 단언이 고정한다 — 다음 사람이 같은 grep 실수를 반복해도 red가 먼저 난다.
  assert.strictEqual(childEnv('/some/repo').MCCP_SUITE_REPO_ROOT, '/some/repo');
  const reporterSrc = fs.readFileSync(REPORTER, 'utf8');
  assert.ok(reporterSrc.indexOf('MCCP_SUITE_REPO_ROOT') !== -1,
    'reporter가 이 변수를 더 이상 읽지 않는다면 run.js가 그것을 싣는 이유도 사라진다');
});

test('(12e) the inherited node:test channel is still severed', () => {
  // 강제 목록을 추가하면서 기존 상속 차단이 사라지지 않았는지. 두 목록은 방향이
  // 반대라 한 함수 안에 같이 살고, 그래서 서로를 지울 수 있다.
  const saved = {
    NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT,
    NODE_TEST_WORKER_ID: process.env.NODE_TEST_WORKER_ID,
  };
  try {
    process.env.NODE_TEST_CONTEXT = 'child-v8';
    process.env.NODE_TEST_WORKER_ID = '1';
    const env = childEnv('/some/repo');
    assert.strictEqual(env.NODE_TEST_CONTEXT, undefined);
    assert.strictEqual(env.NODE_TEST_WORKER_ID, undefined);
  } finally {
    Object.keys(saved).forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  }
});
