'use strict';

// review-rounds/ledger — 원장 단위 test (env-contract-integrity M3 / Task 1).
//
// 이 파일이 무엇을 증명하는지 좁게 적는다. 원장은 "몇 라운드가 돌았는가"의 단일
// 출처이고, 그 수가 **적게** 세어지는 모든 경로가 캡을 fail-open시킨다. 그래서
// 단언의 무게중심은 "정상 경로에서 센다"가 아니라 **"과소 계상으로 접히는 경로가
// 없다"** 에 있다 — 파손 원장을 0으로 읽지 않는지, 동시 기록이 서로를 덮지 않는지,
// 상속된 kill switch가 직렬화를 끄지 못하는지.
//
// fixture는 tmpdir의 **진짜 git repo**다. `--state-dir` 같은 경로 주입 CLI 플래그를
// 만들지 않기로 했으므로(ledger.js 헤더) test도 정상 경로와 똑같이 repo-root 앵커링과
// `assertContained`를 지난다 — 방어 장치를 우회하지 않고 그 위에서 돈다
// (santa-loop-cap.test.js의 같은 규약).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ledger = require('../ledger');

const IS_WINDOWS = process.platform === 'win32';
const GATE = 'mccp-plan-codex';
const SLUG = 'round-ledger-fixture';

// ── fixture ──────────────────────────────────────────────────────────────────

function makeRepo() {
  // realpath: macOS의 /var → /private/var, Windows의 8.3 단축 경로가 assertContained의
  // realpath 비교와 어긋나지 않게 미리 정규화한다.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'round-ledger-')));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function statePath(repo, gate, slug) {
  return path.join(repo, '.claude', 'state', 'review-rounds', gate + '__' + slug + '.json');
}

function key(repo, extra) {
  return Object.assign({ gateId: GATE, decisionId: SLUG, cwd: repo }, extra || {});
}

// ── count / record ───────────────────────────────────────────────────────────

test('a slug with no ledger counts zero and writes nothing', () => {
  const repo = makeRepo();
  assert.equal(ledger.count(key(repo)), 0);
  // 읽기가 파일을 만들면 "원장이 있다"와 "라운드가 0이다"가 구별되지 않는다.
  assert.equal(fs.existsSync(statePath(repo, GATE, SLUG)), false);
});

test('three recorded rounds count three, with 0-based contiguous indices', () => {
  const repo = makeRepo();
  ['ok', 'ok', 'ok'].forEach(function (c) {
    ledger.recordRound(key(repo, { channel: 'codex', classification: c }));
  });
  assert.equal(ledger.count(key(repo)), 3);

  const state = ledger.read(key(repo));
  assert.deepEqual(state.rounds.map(function (r) { return r.index; }), [0, 1, 2]);
  assert.equal(state.gate_id, GATE);
  assert.equal(state.decision_id, SLUG);
  assert.equal(state.schema_version, ledger.SCHEMA_VERSION);
});

test('recordRound returns the index it took and the resulting count', () => {
  const repo = makeRepo();
  const first = ledger.recordRound(key(repo, { channel: 'codex' }));
  assert.deepEqual(first, { index: 0, count: 1 });
  const second = ledger.recordRound(key(repo, { channel: 'panel' }));
  assert.deepEqual(second, { index: 1, count: 2 });
});

test('each gate keeps its own ledger for the same decision', () => {
  // 하나로 합치면 plan에서 캡을 다 쓴 decision이 implement 게이트에서 리뷰를 한 번도
  // 못 받는다. 게이트별 파일 분리는 편의가 아니라 그 결과를 막는 계약이다.
  const repo = makeRepo();
  ledger.recordRound(key(repo, { channel: 'codex' }));
  assert.equal(ledger.count(key(repo)), 1);
  assert.equal(ledger.count(key(repo, { gateId: 'mccp-implement-codex' })), 0);
});

test('the ledger is anchored at the repo root, not at the cwd it was called from', () => {
  // cwd 기준이면 같은 게이트 스코프가 두 파일로 갈려 캡이 쪼개진다 — 하위
  // 디렉토리에서 한 번 더 호출하는 것만으로 예산이 두 배가 된다.
  const repo = makeRepo();
  const sub = path.join(repo, 'a', 'b');
  fs.mkdirSync(sub, { recursive: true });

  ledger.recordRound(key(repo, { channel: 'codex' }));
  assert.equal(ledger.count(key(repo, { cwd: sub })), 1);

  // 두 경로를 **서로** 비교한다. 여기서 test가 조립한 리터럴과 대조하면 Windows의
  // 8.3 단축 경로(`ADMINI~1`)가 걸린다 — `git rev-parse`는 긴 형식을, `realpathSync`는
  // 단축 형식을 돌려주므로 같은 파일이 다른 문자열이 된다. 그리고 이 test가 주장하는
  // 것은 애초에 "경로가 이 리터럴이다"가 아니라 **"두 cwd가 같은 원장을 본다"** 이다.
  assert.equal(ledger.resolveStatePath(key(repo, { cwd: sub })),
    ledger.resolveStatePath(key(repo)));
  assert.equal(path.basename(ledger.resolveStatePath(key(repo, { cwd: sub }))),
    GATE + '__' + SLUG + '.json');
});

// ── key validation (경로 주입 방어) ──────────────────────────────────────────

test('traversal and separator-bearing keys are refused, not sanitized', () => {
  const repo = makeRepo();
  const hostile = ['../escape', 'a/b', 'a\\b', '.', '..', 'UPPER', '', 'x'.repeat(200)];

  hostile.forEach(function (bad) {
    assert.throws(function () { ledger.count(key(repo, { decisionId: bad })); },
      function (e) { return e.code === 'REVIEW_ROUNDS_BAD_KEY'; },
      'decisionId ' + JSON.stringify(bad) + ' must be refused');
    assert.throws(function () { ledger.count(key(repo, { gateId: bad })); },
      function (e) { return e.code === 'REVIEW_ROUNDS_BAD_KEY'; },
      'gateId ' + JSON.stringify(bad) + ' must be refused');
  });
});

test('a refused key writes nothing anywhere under the repo', () => {
  // 거부가 throw만 하고 파일을 남기면 다음 호출이 그 잔여물을 정상 원장으로 읽는다.
  const repo = makeRepo();
  assert.throws(function () {
    ledger.recordRound(key(repo, { decisionId: '../escape', channel: 'codex' }));
  }, function (e) { return e.code === 'REVIEW_ROUNDS_BAD_KEY'; });
  assert.equal(fs.existsSync(path.join(repo, '.claude', 'state', 'review-rounds')), false);
});

test('an unknown channel is refused — channels are 1:1 with the chokepoints', () => {
  const repo = makeRepo();
  assert.throws(function () {
    ledger.recordRound(key(repo, { channel: 'freeform' }));
  }, function (e) { return e.code === 'REVIEW_ROUNDS_BAD_CHANNEL'; });
  assert.throws(function () {
    ledger.recordRound(key(repo, { channel: undefined }));
  }, function (e) { return e.code === 'REVIEW_ROUNDS_BAD_CHANNEL'; });
  assert.deepEqual(ledger.CHANNELS.slice(), ['codex', 'panel']);
});

// ── 손상은 0이 아니다 ────────────────────────────────────────────────────────

test('a corrupt ledger throws instead of reading as zero rounds', () => {
  // 이것이 이 파일에서 가장 중요한 단언이다. 파손을 빈 상태로 접으면 파일 하나를
  // 망가뜨리는 것이 곧 캡 리셋이 된다 — 캡 원장에서 가장 나쁜 실패 방향이다.
  const repo = makeRepo();
  ledger.recordRound(key(repo, { channel: 'codex' }));
  fs.writeFileSync(statePath(repo, GATE, SLUG), '{ not json');

  assert.throws(function () { ledger.count(key(repo)); },
    function (e) { return e.code === 'REVIEW_ROUNDS_CORRUPT'; });
});

test('a ledger without a rounds[] array is corrupt, not empty', () => {
  const repo = makeRepo();
  ledger.recordRound(key(repo, { channel: 'codex' }));
  fs.writeFileSync(statePath(repo, GATE, SLUG),
    JSON.stringify({ schema_version: ledger.SCHEMA_VERSION, rounds: 'three' }));

  assert.throws(function () { ledger.count(key(repo)); },
    function (e) { return e.code === 'REVIEW_ROUNDS_CORRUPT'; });
});

test('a future schema_version throws rather than being read on old rules', () => {
  const repo = makeRepo();
  ledger.recordRound(key(repo, { channel: 'codex' }));
  const p = statePath(repo, GATE, SLUG);
  const body = JSON.parse(fs.readFileSync(p, 'utf8'));
  body.schema_version = ledger.SCHEMA_VERSION + 1;
  fs.writeFileSync(p, JSON.stringify(body));

  assert.throws(function () { ledger.count(key(repo)); },
    function (e) { return e.code === 'REVIEW_ROUNDS_SCHEMA'; });
});

test('the corruption message names the file and the recovery', () => {
  // throw가 복구 경로를 말하지 않으면 운영자의 첫 반응은 원장을 지우는 것이고,
  // 그 습관이 곧 "막히면 지운다"가 되어 캡이 장식이 된다.
  const repo = makeRepo();
  ledger.recordRound(key(repo, { channel: 'codex' }));
  fs.writeFileSync(statePath(repo, GATE, SLUG), 'nope');
  try {
    ledger.count(key(repo));
    assert.fail('should have thrown');
  } catch (e) {
    assert.match(e.message, /review-rounds/);
    assert.match(e.message, /silently\s+reset the cap/);
  }
});

// ── 직렬화 (Implement-Codex R1 F2) ───────────────────────────────────────────

test('concurrent writers do not lose rounds, even with the guard kill switch off', () => {
  // F2 흡수의 회귀 test. `runGuarded`는 모드를 `opts.mode || parseGuardMode(opts.env)`로
  // 정하므로, ledger가 `{mode:'enforce'}`를 무조건 넘기지 않으면 상속된
  // MCCP_EVIDENCE_CONFLICT_GUARD=off 하나로 원장이 lock 없이 read-modify-write된다.
  // 그러면 성공한 두 리뷰가 서로를 덮어 캡을 넘긴 호출이 통과한다 — 과소 계상은
  // 여기서 하드닝이 아니라 정확성 문제다.
  const repo = makeRepo();
  const N = 6;
  const runner = path.join(repo, 'record-one.js');
  fs.writeFileSync(runner,
    'require(' + JSON.stringify(path.join(__dirname, '..', 'ledger.js')) + ')' +
    '.recordRound({gateId:' + JSON.stringify(GATE) + ',decisionId:' + JSON.stringify(SLUG) +
    ',channel:"codex",cwd:' + JSON.stringify(repo) + '});\n');

  const env = Object.assign({}, process.env, { MCCP_EVIDENCE_CONFLICT_GUARD: 'off' });
  const kids = [];
  for (let i = 0; i < N; i += 1) {
    kids.push(spawnSync(process.execPath, [runner], { cwd: repo, env: env, encoding: 'utf8' }));
  }
  kids.forEach(function (k, i) {
    assert.equal(k.status, 0, 'writer ' + i + ' failed: ' + (k.stderr || ''));
  });

  assert.equal(ledger.count(key(repo)), N);
  const idx = ledger.read(key(repo)).rounds.map(function (r) { return r.index; });
  assert.deepEqual(idx, idx.map(function (_v, i) { return i; }),
    'indices are assigned inside the critical section, so they cannot collide');
});

// ── 파일 모드 ────────────────────────────────────────────────────────────────

test('the state file is owner-only on POSIX',
  { skip: IS_WINDOWS ? 'POSIX mode is inert on Windows' : false }, () => {
    const repo = makeRepo();
    ledger.recordRound(key(repo, { channel: 'codex' }));
    const mode = fs.statSync(statePath(repo, GATE, SLUG)).mode & 0o777;
    assert.equal(mode, ledger.STATE_MODE);
  });

test('a loosened state file is re-tightened on the next access',
  { skip: IS_WINDOWS ? 'POSIX mode is inert on Windows' : false }, () => {
    const repo = makeRepo();
    ledger.recordRound(key(repo, { channel: 'codex' }));
    const p = statePath(repo, GATE, SLUG);
    fs.chmodSync(p, 0o644);
    ledger.count(key(repo));
    assert.equal(fs.statSync(p).mode & 0o777, ledger.STATE_MODE);
  });
