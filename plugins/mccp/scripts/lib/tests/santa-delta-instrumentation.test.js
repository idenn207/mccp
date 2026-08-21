'use strict';

// santa-delta-review M1 Task 6 — durable 계측 4층 회귀 (DD10 · DD11 · DD12).
//
// 검사하는 것은 **네 층의 이음매**다: `begin-round`가 원장에 쓰고 → `seal.project`가
// 투영하고 → `deltaCoverageFrom`이 집계하고 → `seal`이 receipt에 stamp한다. 층별
// 단위 test만으로는 이음매가 끊긴 것을 못 잡는다는 것이 이 repo의 실측 교훈이라,
// 아래 단언 대부분이 실제 fixture repo와 `runCli`/`seal.seal`을 지난다.
//
// **핵심 계약은 하나다**: 필드 *부재*("이 축이 없던 시절")와 관측된 *0*("`off`로
// 돌았다")이 다른 상태로 남는 것. 그것이 없으면 default `off`인 이 축은 조용히
// 영구 비활성이 될 수 있고, 그것이 정확히 DD10이 닫으려는 결함이다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ledger = require('../santa/ledger');
const seal = require('../santa/seal');
const scopeDelta = require('../santa/scope-delta');
const { runCli } = require('../santa/cli');
const { validate } = require('../../receipt/schema');

// ── fixture ──────────────────────────────────────────────────────────────────

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-delta-')));
  const g = function (args) { execFileSync('git', args, { cwd: dir, stdio: 'ignore' }); };
  g(['init', '-q']);
  g(['checkout', '-q', '-b', 'santa-fixture']);
  g(['config', 'user.email', 'santa@test.local']);
  g(['config', 'user.name', 'santa']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');
  g(['add', '-A']);
  g(['commit', '-qm', 'init']);
  return dir;
}

function statePath(repo, slug) {
  return path.join(repo, '.claude', 'state', 'santa-loop', slug + '.json');
}

function readState(repo, slug) {
  return JSON.parse(fs.readFileSync(statePath(repo, slug), 'utf8'));
}

function cli(args) {
  const outC = [], errC = [];
  const so = process.stdout.write, se = process.stderr.write;
  process.stdout.write = function (c) { outC.push(String(c)); return true; };
  process.stderr.write = function (c) { errC.push(String(c)); return true; };
  let code;
  try { code = runCli(args); } finally {
    process.stdout.write = so;
    process.stderr.write = se;
  }
  return { code: code, stdout: outC.join(''), stderr: errC.join('') };
}

// `begin-round`는 단일통과 구간에서 라운드를 열지 않는다(review-loop-bypass M1 DD5).
// 이 저장소 자신의 `.claude/settings.json`이 그 변수를 켜 두므로, 원장을 실제로 여는
// test는 그 값을 지워야 축을 검사할 수 있다 — 검사 대상이 아닌 축이 검사를 가린다.
function withoutSinglePass(fn) {
  const saved = process.env.MCCP_REVIEW_SINGLE_PASS;
  delete process.env.MCCP_REVIEW_SINGLE_PASS;
  try { return fn(); } finally {
    if (saved !== undefined) process.env.MCCP_REVIEW_SINGLE_PASS = saved;
  }
}

function reviewer(id, model, verdict) {
  return { envelope: { id: id, model: model, verdict: verdict, criticalIssues: [] }, raw: {} };
}

// 라운드 1건짜리 NICE 원장을 직접 심는다(seal 경로 test용 — begin-round를 지나지 않는다).
function seedLedger(repo, slug, rounds) {
  const state = {
    schema_version: ledger.SCHEMA_VERSION,
    decision_id: slug,
    cap: 3,
    rounds: rounds,
    entries: [],
    terminated: null,
  };
  const p = statePath(repo, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
  return p;
}

function niceRound(index, scope) {
  const r = {
    index: index,
    started_at: '2026-08-20T0' + index + ':00:00.000Z',
    verdict: 'NICE',
    reviewers: [reviewer('A', 'opus', 'PASS'), reviewer('B', 'gpt-5.4', 'PASS')],
  };
  if (scope !== undefined) r.scope = scope;
  return r;
}

function readReceipt(repo, slug) {
  return JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-santa-review', slug + '.json'), 'utf8'));
}

// ── 층 1: begin-round → 원장 ─────────────────────────────────────────────────

test('층1 — 유효한 --scope-* 4종이 라운드 레코드에 scope로 저장된다', () => {
  withoutSinglePass(function () {
    const repo = makeRepo();
    const r = cli(['begin-round', '--decision', 'l1-ok', '--cwd', repo,
      '--scope-applied', 'true', '--scope-before', '9', '--scope-after', '3']);
    assert.equal(r.code, 0, r.stderr);
    const st = readState(repo, 'l1-ok');
    assert.deepEqual(st.rounds[0].scope,
      { applied: true, reason: null, before: 9, after: 3 });
  });
});

test('층1 — applied=false는 NO_NARROW 사유와 함께 저장된다', () => {
  withoutSinglePass(function () {
    const repo = makeRepo();
    const r = cli(['begin-round', '--decision', 'l1-off', '--cwd', repo,
      '--scope-applied', 'false', '--scope-reason', 'env-off',
      '--scope-before', '4', '--scope-after', '4']);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readState(repo, 'l1-off').rounds[0].scope,
      { applied: false, reason: 'env-off', before: 4, after: 4 });
  });
});

test('층1 — 플래그 전부 부재는 정상이고 scope 키 자체가 없다 (델타 미사용 실행)', () => {
  withoutSinglePass(function () {
    const repo = makeRepo();
    assert.equal(cli(['begin-round', '--decision', 'l1-none', '--cwd', repo]).code, 0);
    const round0 = readState(repo, 'l1-none').rounds[0];
    assert.equal(Object.prototype.hasOwnProperty.call(round0, 'scope'), false,
      '부재는 키 없음이어야 한다 — null을 쓰면 "관측했는데 없음"과 뜻이 겹친다');
  });
});

// **부분 기록 금지.** `applied` 없는 `before`는 아무 뜻이 없다. 라운드는 열리되
// 관측만 드롭되고, 드롭은 조용하지 않다.
test('층1 — 부분/불량 플래그는 라운드를 열되 scope를 기록하지 않는다 (loud)', () => {
  withoutSinglePass(function () {
    const cases = [
      { name: 'p-noapplied', flags: ['--scope-before', '9', '--scope-after', '3'] },
      { name: 'p-badapplied', flags: ['--scope-applied', 'yes', '--scope-before', '9', '--scope-after', '3'] },
      { name: 'p-nobefore', flags: ['--scope-applied', 'true', '--scope-after', '3'] },
      { name: 'p-grow', flags: ['--scope-applied', 'true', '--scope-before', '3', '--scope-after', '9'] },
      { name: 'p-exp', flags: ['--scope-applied', 'true', '--scope-before', '1e3', '--scope-after', '3'] },
      { name: 'p-neg', flags: ['--scope-applied', 'true', '--scope-before', '-1', '--scope-after', '0'] },
      { name: 'p-freereason', flags: ['--scope-applied', 'false', '--scope-reason', 'because I said so', '--scope-before', '3', '--scope-after', '3'] },
      { name: 'p-reasononapplied', flags: ['--scope-applied', 'true', '--scope-reason', 'env-off', '--scope-before', '9', '--scope-after', '3'] },
    ];
    cases.forEach(function (c) {
      const repo = makeRepo();
      const r = cli(['begin-round', '--decision', c.name, '--cwd', repo].concat(c.flags));
      assert.equal(r.code, 0, c.name + ' should still open the round');
      const round0 = readState(repo, c.name).rounds[0];
      assert.equal(Object.prototype.hasOwnProperty.call(round0, 'scope'), false,
        c.name + ': a partial/invalid set must not land in the ledger');
      assert.match(r.stderr, /--scope-\* instrumentation NOT recorded/,
        c.name + ': the drop must be loud');
    });
  });
});

// 멱등 OPEN 분기가 첫 기록을 덮으면 "이 라운드가 무엇으로 열렸는가"가 흔들린다 —
// 프롬프트는 첫 호출이 만들었고, 그 계산의 기록이 이 값이다.
test('층1 — 같은 라운드의 두 번째 begin-round가 첫 scope를 덮지 않는다', () => {
  withoutSinglePass(function () {
    const repo = makeRepo();
    cli(['begin-round', '--decision', 'l1-idem', '--cwd', repo,
      '--scope-applied', 'true', '--scope-before', '9', '--scope-after', '3']);
    const r2 = cli(['begin-round', '--decision', 'l1-idem', '--cwd', repo,
      '--scope-applied', 'false', '--scope-reason', 'no-anchor',
      '--scope-before', '1', '--scope-after', '1']);
    assert.equal(r2.code, 0);
    const st = readState(repo, 'l1-idem');
    assert.equal(st.rounds.length, 1, '멱등 반환이라 라운드가 늘지 않는다');
    assert.deepEqual(st.rounds[0].scope,
      { applied: true, reason: null, before: 9, after: 3 }, '첫 기록이 보존돼야 한다');
  });
});

// `SCHEMA_VERSION`을 올리면 기존 원장이 전부 `SANTA_LEDGER_CORRUPT`로 읽혀 캡이
// 무의미해진다. `terminated`가 지나간 additive 자리를 그대로 쓴다.
test('층1 — additive이므로 SCHEMA_VERSION은 변하지 않는다', () => {
  assert.equal(ledger.SCHEMA_VERSION, 1);
});

test('층1 — scope 없는 legacy 원장을 읽어도 begin-round가 정상 동작한다', () => {
  withoutSinglePass(function () {
    const repo = makeRepo();
    seedLedger(repo, 'l1-legacy', [niceRound(0)]);   // scope 키 없음
    const r = cli(['begin-round', '--decision', 'l1-legacy', '--cwd', repo,
      '--scope-applied', 'true', '--scope-before', '5', '--scope-after', '2']);
    assert.equal(r.code, 0, r.stderr);
    const st = readState(repo, 'l1-legacy');
    assert.equal(st.rounds.length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(st.rounds[0], 'scope'), false);
    assert.equal(st.rounds[1].scope.applied, true);
  });
});

// ── 층 2: seal.project 투영 ──────────────────────────────────────────────────

test('층2 — project가 scope를 투영하고 legacy 라운드는 null로 접는다', () => {
  const repo = makeRepo();
  seedLedger(repo, 'l2-x', [
    niceRound(0),
    niceRound(1, { applied: true, reason: null, before: 7, after: 2 }),
  ]);
  const r = seal.seal({ cwd: repo, decisionId: 'l2-x' });
  assert.ok(r.receiptPath);
  const proof = JSON.parse(fs.readFileSync(path.join(repo, r.proofPath), 'utf8'));
  assert.ok(proof, 'proof written');
});

test('층2 — 형태가 어긋난 scope는 null로 접힌다 (리포트와 집계가 갈리지 않는다)', () => {
  const bad = [
    { applied: 'true', before: 1, after: 1 },
    { applied: true, before: -1, after: 0 },
    { applied: true, before: 1, after: 5 },
    { applied: true, before: 1.5, after: 1 },
    { applied: true, before: 1, after: 1, reason: 42 },
    'nope', 7, [],
  ];
  bad.forEach(function (s) {
    const cov = scopeDelta.deltaCoverageFrom({ rounds: [{ scope: s }] });
    assert.equal(cov.deltaRounds, 0, JSON.stringify(s) + ' 가 집계에 들어갔다');
  });
});

// ── 층 3 + 4: 집계 → receipt stamp ──────────────────────────────────────────

test('층4 — applied 라운드가 있으면 두 정수가 receipt에 stamp된다', () => {
  const repo = makeRepo();
  seedLedger(repo, 'l4-on', [
    niceRound(0, { applied: false, reason: 'no-anchor', before: 9, after: 9 }),
    niceRound(1, { applied: true, reason: null, before: 9, after: 3 }),
  ]);
  seal.seal({ cwd: repo, decisionId: 'l4-on' });
  const m = readReceipt(repo, 'l4-on').meta;
  assert.equal(m.santa_delta_rounds, 1);
  assert.equal(m.santa_delta_paths_dropped, 6);
});

// **DD12 — kill switch와 무관하게 stamp한다.** 이 단언이 이 milestone의 dark-ship
// 관측 수단 전부다: default가 `off`인 축에서 "아무도 켜지 않았다"가 관측 가능해지는
// 것이 여기 하나에 달려 있다.
test('DD12 — off 실행(전 라운드 applied=false)도 0을 stamp한다', () => {
  const repo = makeRepo();
  seedLedger(repo, 'l4-off', [
    niceRound(0, { applied: false, reason: 'env-off', before: 4, after: 4 }),
  ]);
  seal.seal({ cwd: repo, decisionId: 'l4-off' });
  const m = readReceipt(repo, 'l4-off').meta;
  assert.equal(m.santa_delta_rounds, 0, 'off 실행이 관측된 0을 남겨야 한다');
  assert.equal(m.santa_delta_paths_dropped, 0);
});

// 부재와 0의 구별이 이 축의 계약이다. 이 두 test가 함께 그것을 고정한다.
test('DD12 — scope를 한 번도 쓴 적 없는 원장도 라운드가 있으면 0을 stamp한다', () => {
  const repo = makeRepo();
  seedLedger(repo, 'l4-legacy', [niceRound(0)]);
  seal.seal({ cwd: repo, decisionId: 'l4-legacy' });
  const m = readReceipt(repo, 'l4-legacy').meta;
  assert.equal(m.santa_delta_rounds, 0);
  assert.equal(m.santa_delta_paths_dropped, 0);
});

test('층4 — 라운드 0건 원장은 두 키를 아예 갖지 않는다 (관측 자체가 없었다)', () => {
  const repo = makeRepo();
  seedLedger(repo, 'l4-empty', []);
  let sealed = null;
  try { sealed = seal.seal({ cwd: repo, decisionId: 'l4-empty' }); } catch (_e) { /* 라운드 0건 거부는 정상 */ }
  if (sealed === null) return;   // seal이 거부하면 이 계약은 자동으로 성립한다
  const m = readReceipt(repo, 'l4-empty').meta;
  assert.equal(Object.prototype.hasOwnProperty.call(m, 'santa_delta_rounds'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(m, 'santa_delta_paths_dropped'), false);
});

// ── schema ───────────────────────────────────────────────────────────────────

test('schema — 두 필드는 present-only 비음 정수이고 부재가 유효하다', () => {
  const repo = makeRepo();
  seedLedger(repo, 'sch-x', [niceRound(0, { applied: true, reason: null, before: 5, after: 1 })]);
  seal.seal({ cwd: repo, decisionId: 'sch-x' });
  const receipt = readReceipt(repo, 'sch-x');
  const v = validate(receipt);
  assert.equal(v.ok, true, JSON.stringify(v.errors));

  // 부재 — 키를 지워도 유효해야 한다(구 receipt 소급 무효화 금지).
  const stripped = JSON.parse(JSON.stringify(receipt));
  delete stripped.meta.santa_delta_rounds;
  delete stripped.meta.santa_delta_paths_dropped;
  assert.equal(validate(stripped).ok, true);

  // 불량 — 음수·비정수·문자열은 거부.
  [[-1, 0], [1.5, 0], ['3', 0], [0, -2]].forEach(function (pair) {
    const badR = JSON.parse(JSON.stringify(receipt));
    badR.meta.santa_delta_rounds = pair[0];
    badR.meta.santa_delta_paths_dropped = pair[1];
    assert.equal(validate(badR).ok, false, JSON.stringify(pair) + ' 가 통과했다');
  });
});

// `santa_degrade_ack`/`_reason` 쌍과 달리 이 둘은 서로를 함의하지 않는다 —
// 모든 diff 파일이 fix hunk 안에 있으면 applied=true인데 드롭이 0이다. 산술 관계를
// 강제하면 그 정상 출력이 거부된다.
test('schema — rounds > 0 ∧ dropped === 0 은 정상 출력이므로 거부되지 않는다', () => {
  const repo = makeRepo();
  seedLedger(repo, 'sch-zero', [niceRound(0, { applied: true, reason: null, before: 3, after: 3 })]);
  seal.seal({ cwd: repo, decisionId: 'sch-zero' });
  const receipt = readReceipt(repo, 'sch-zero');
  assert.equal(receipt.meta.santa_delta_rounds, 1);
  assert.equal(receipt.meta.santa_delta_paths_dropped, 0);
  assert.equal(validate(receipt).ok, true);
});

// ── CLI 이음매: anchor 열거 → patchRangesFrom → narrowScope ─────────────────
//
// 순수 oracle test는 `narrowScope`가 주어진 범위로 무엇을 하는지만 안다. 여기서는
// **진짜 커밋**에서 범위가 나오는지, anchor가 호출자 인자 없이 발견되는지, 그리고
// DD9(삭제·이동)가 정말 닫혀 있는지를 잰다 — 합성 diff 문자열로 재면 내가 쓴 파서를
// 내가 쓴 입력으로 재는 것이다.

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function commitFiles(repo, files, msg) {
  Object.keys(files).forEach(function (rel) {
    const abs = path.join(repo, rel);
    if (files[rel] === null) { fs.rmSync(abs, { force: true }); return; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  });
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', msg]);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

function writeAnchor(repo, slug, round, rev) {
  const dir = path.join(repo, '.claude', 'state', 'santa-loop', 'tmp', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'round-' + round + '-fix-rev.txt'), rev + '\n');
}

function writePathsFile(repo, name, paths) {
  const p = path.join(repo, name);
  fs.writeFileSync(p, JSON.stringify(paths));
  return p;
}

function scopeDeltaCli(repo, slug, pathsFile, mode) {
  const saved = process.env.MCCP_SANTA_DELTA_SCOPE;
  if (mode === undefined) delete process.env.MCCP_SANTA_DELTA_SCOPE;
  else process.env.MCCP_SANTA_DELTA_SCOPE = mode;
  try {
    const r = cli(['scope-delta', '--decision', slug, '--cwd', repo, '--paths-file', pathsFile]);
    return { code: r.code, stderr: r.stderr, out: r.code === 0 ? JSON.parse(r.stdout) : null };
  } finally {
    if (saved === undefined) delete process.env.MCCP_SANTA_DELTA_SCOPE;
    else process.env.MCCP_SANTA_DELTA_SCOPE = saved;
  }
}

test('CLI — anchor가 없으면(라운드 1) no-anchor passthrough이고 exit 0이다', () => {
  const repo = makeRepo();
  const pf = writePathsFile(repo, 'paths.json', ['README.md', 'a.js']);
  const r = scopeDeltaCli(repo, 'cli-noanchor', pf, 'enforce');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.out.applied, false);
  assert.equal(r.out.reason, 'no-anchor');
  assert.deepEqual(r.out.paths, ['README.md', 'a.js']);
  assert.deepEqual(r.out.revs, []);
});

test('CLI — 실제 fix 커밋의 hunk가 스코프를 좁힌다 (anchor는 발견되지 손으로 주지 않는다)', () => {
  const repo = makeRepo();
  commitFiles(repo, {
    'a.js': Array.from({ length: 200 }, (_, i) => 'line' + i).join('\n') + '\n',
    'b.js': 'untouched\n',
  }, 'seed');
  const fixRev = commitFiles(repo, {
    'a.js': Array.from({ length: 200 }, (_, i) => (i === 99 ? 'FIXED' : 'line' + i)).join('\n') + '\n',
  }, 'fix');
  writeAnchor(repo, 'cli-narrow', 0, fixRev);

  const pf = writePathsFile(repo, 'paths.json', ['a.js', 'b.js', 'README.md']);
  const r = scopeDeltaCli(repo, 'cli-narrow', pf, 'enforce');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.out.applied, true);
  assert.deepEqual(r.out.paths, ['a.js'], 'fix가 건드리지 않은 파일이 빠져야 한다');
  assert.equal(r.out.before, 3);
  assert.equal(r.out.after, 1);
  assert.deepEqual(r.out.revs, [fixRev]);
  // 100번째 줄(1-based) 주변이 CONTEXT_LINES만큼 확장돼 있어야 한다.
  assert.equal(r.out.ranges['a.js'].length, 1);
  assert.equal(r.out.ranges['a.js'][0][0], 100 - scopeDelta.CONTEXT_LINES);
  assert.equal(r.out.ranges['a.js'][0][1], 100 + scopeDelta.CONTEXT_LINES);
});

test('CLI — `off`는 anchor가 있어도 env-off passthrough이고 revs가 비어 있다', () => {
  const repo = makeRepo();
  const rev = commitFiles(repo, { 'a.js': 'x\n' }, 'fix');
  writeAnchor(repo, 'cli-off', 0, rev);
  const pf = writePathsFile(repo, 'paths.json', ['a.js', 'README.md']);
  const r = scopeDeltaCli(repo, 'cli-off', pf, 'off');
  assert.equal(r.code, 0);
  assert.equal(r.out.reason, 'env-off');
  assert.deepEqual(r.out.revs, [], 'kill switch가 비용(git 호출)까지 꺼야 한다');
  assert.deepEqual(r.out.paths, ['a.js', 'README.md']);
});

test('CLI — 미설정 default(off)에서도 좁히지 않는다 (DD1)', () => {
  const repo = makeRepo();
  const rev = commitFiles(repo, { 'a.js': 'x\n' }, 'fix');
  writeAnchor(repo, 'cli-default', 0, rev);
  const pf = writePathsFile(repo, 'paths.json', ['a.js', 'README.md']);
  const r = scopeDeltaCli(repo, 'cli-default', pf, undefined);
  assert.equal(r.out.mode, 'off');
  assert.equal(r.out.applied, false);
});

test('DD6 — 여러 anchor의 hunk가 누적 합집합이 된다', () => {
  const repo = makeRepo();
  commitFiles(repo, { 'a.js': 'a\n', 'b.js': 'b\n', 'c.js': 'c\n' }, 'seed');
  const r1 = commitFiles(repo, { 'a.js': 'a2\n' }, 'fix1');
  const r2 = commitFiles(repo, { 'b.js': 'b2\n' }, 'fix2');
  writeAnchor(repo, 'cli-cum', 0, r1);
  writeAnchor(repo, 'cli-cum', 1, r2);

  const pf = writePathsFile(repo, 'paths.json', ['a.js', 'b.js', 'c.js']);
  const r = scopeDeltaCli(repo, 'cli-cum', pf, 'enforce');
  assert.equal(r.out.applied, true);
  assert.deepEqual(r.out.paths.slice().sort(), ['a.js', 'b.js'],
    '두 커밋의 합집합이라 c.js만 빠진다');
  assert.equal(r.out.revs.length, 2);
});

// DD9 — M1은 이 성질을 **회귀 test로 고정할 뿐 코드를 바꾸지 않는다**.
// `DIFF_FILE_RE`가 `+++ b/`만 앵커하므로 `+++ /dev/null`(삭제)은 집합에 열리지 않고,
// rename은 새 경로가 `+++ b/<new>`로 잡힌다.
test('DD9 — 삭제된 파일은 범위 집합에 열리지 않는다', () => {
  const repo = makeRepo();
  commitFiles(repo, { 'gone.js': 'x\n', 'keep.js': 'k\n' }, 'seed');
  const rev = commitFiles(repo, { 'gone.js': null, 'keep.js': 'k2\n' }, 'delete+edit');
  writeAnchor(repo, 'cli-del', 0, rev);

  const pf = writePathsFile(repo, 'paths.json', ['gone.js', 'keep.js']);
  const r = scopeDeltaCli(repo, 'cli-del', pf, 'enforce');
  assert.equal(r.out.applied, true);
  assert.deepEqual(r.out.paths, ['keep.js']);
  assert.equal(Object.prototype.hasOwnProperty.call(r.out.ranges, 'gone.js'), false);
});

test('DD9 — rename은 새 경로로 잡힌다', () => {
  const repo = makeRepo();
  commitFiles(repo, { 'old.js': Array.from({ length: 30 }, (_, i) => 'l' + i).join('\n') + '\n' }, 'seed');
  fs.renameSync(path.join(repo, 'old.js'), path.join(repo, 'new.js'));
  fs.appendFileSync(path.join(repo, 'new.js'), 'changed\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'rename']);
  const rev = git(repo, ['rev-parse', 'HEAD']).trim();
  writeAnchor(repo, 'cli-ren', 0, rev);

  const pf = writePathsFile(repo, 'paths.json', ['old.js', 'new.js']);
  const r = scopeDeltaCli(repo, 'cli-ren', pf, 'enforce');
  assert.equal(r.out.applied, true);
  assert.deepEqual(r.out.paths, ['new.js'], '새 경로가 잡히고 옛 경로는 빠진다');
});

test('CLI — anchor 파일이 있으나 rev가 불량이면 no-ranges (no-anchor와 구별된다)', () => {
  const repo = makeRepo();
  writeAnchor(repo, 'cli-badrev', 0, 'not-a-sha');
  const pf = writePathsFile(repo, 'paths.json', ['README.md']);
  const r = scopeDeltaCli(repo, 'cli-badrev', pf, 'enforce');
  assert.equal(r.code, 0);
  assert.equal(r.out.reason, 'no-ranges');
  assert.deepEqual(r.out.revs, ['not-a-sha'], '조회한 anchor는 진단을 위해 남는다');
});

test('CLI — --paths-file 부재는 usage 오류(exit 2)다', () => {
  const repo = makeRepo();
  const r = cli(['scope-delta', '--decision', 'cli-nopaths', '--cwd', repo]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--paths-file <path> is required/);
});

// ── --ranges-file 안전 로더 (security CRITICAL-1 · HIGH-2 · HIGH-3) ─────────

function writeRangesFile(repo, name, obj) {
  const p = path.join(repo, name);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
}

test('security — --ranges-file의 __proto__ 키는 파싱 직후 거부된다 (exit 2)', () => {
  const repo = makeRepo();
  const pf = writePathsFile(repo, 'paths.json', ['a.js']);
  const rf = writeRangesFile(repo, 'ranges.json', '{"__proto__": {"evil": [[1,2]]}, "a.js": [[1,2]]}');
  const r = cli(['lanes', '--decision', 'sec-proto', '--cwd', repo,
    '--paths-file', pf, '--ranges-file', rf]);
  assert.equal(r.code, 2, r.stdout);
  assert.match(r.stderr, /forbidden key/);
  assert.equal(({}).evil, undefined, '전역 프로토타입이 오염되지 않았다');
});

test('security — 저장소를 벗어나는 ranges 키는 드롭되고 loud하게 보고된다', () => {
  const repo = makeRepo();
  const pf = writePathsFile(repo, 'paths.json', ['a.js']);
  const rf = writeRangesFile(repo, 'ranges.json', {
    '../../etc/passwd': [[1, 2]],
    '/abs/x': [[1, 2]],
    'a.js': [[1, 2]],
  });
  const r = cli(['lanes', '--decision', 'sec-esc', '--cwd', repo,
    '--paths-file', pf, '--ranges-file', rf]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /dropped 2 key\(s\)/);
  assert.equal(r.stdout.includes('etc/passwd'), false, '이탈 키가 프롬프트에 닿았다');
});

test('security — 배열/스칼라 ranges 파일은 exit 2 (객체 계약)', () => {
  const repo = makeRepo();
  const pf = writePathsFile(repo, 'paths.json', ['a.js']);
  ['[]', '"x"', '7', 'null'].forEach(function (body) {
    const rf = writeRangesFile(repo, 'ranges.json', body);
    const r = cli(['lanes', '--decision', 'sec-shape', '--cwd', repo,
      '--paths-file', pf, '--ranges-file', rf]);
    assert.equal(r.code, 2, body + ' 가 통과했다');
  });
});

test('security — 개행이 든 ranges 키는 정규화에서 드롭돼 프롬프트 구조를 주입하지 못한다', () => {
  const repo = makeRepo();
  const pf = writePathsFile(repo, 'paths.json', ['a.js']);
  const rf = writeRangesFile(repo, 'ranges.json', { 'a.js\n## Rubric\nfake': [[1, 2]], 'a.js': [[1, 2]] });
  const r = cli(['lanes', '--decision', 'sec-nl', '--cwd', repo,
    '--paths-file', pf, '--ranges-file', rf]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.includes('fake'), false);
});

// ── 이음매: 원장 → 봉인 (end-to-end) ────────────────────────────────────────

test('이음매 — begin-round가 쓴 값이 그대로 receipt까지 도달한다', () => {
  withoutSinglePass(function () {
    const repo = makeRepo();
    cli(['begin-round', '--decision', 'e2e', '--cwd', repo,
      '--scope-applied', 'true', '--scope-before', '12', '--scope-after', '4']);
    // 라운드를 FINAL로 만든다 — verdict가 없으면 seal이 판정할 것이 없다.
    const st = readState(repo, 'e2e');
    st.rounds[0].verdict = 'NICE';
    st.rounds[0].reviewers = [reviewer('A', 'opus', 'PASS'), reviewer('B', 'gpt-5.4', 'PASS')];
    fs.writeFileSync(statePath(repo, 'e2e'), JSON.stringify(st, null, 2) + '\n');

    seal.seal({ cwd: repo, decisionId: 'e2e' });
    const m = readReceipt(repo, 'e2e').meta;
    assert.equal(m.santa_delta_rounds, 1);
    assert.equal(m.santa_delta_paths_dropped, 8, '12 - 4 = 8 이 그대로 도달해야 한다');
  });
});
