'use strict';

// 대조기 자신의 test.
//
// 이 축의 급소는 `echo ok && exit 0` 짜리 대조기도 Validation 을 통과시킨다는 것이다.
// 대조기가 무력하면 그것이 게이트화한 **나머지 Acceptance 항목 전부**가 함께 무력해진다.
//
// 이 test 는 m6-assertion-manifest.json 에 넣지 **않는다** — 자기 자신을 검사 대상으로
// 삼으면 순환이 되고, 대조기가 죽으면 그 사실도 못 잡는다. Validation §1 에 포함되는
// 일반 test 로 둔다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { check, REQUIRED_IDS, UsageError } = require('../msw-metrics/assertion-manifest-check');

const CLI = path.resolve(__dirname, '..', 'msw-metrics', 'assertion-manifest-check.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const REAL_MANIFEST = 'docs/multi-session-work-loop/m6-assertion-manifest.json';

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-manifest-check-'));
}

function writeManifest(dir, obj) {
  const p = path.join(dir, 'manifest.json');
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  return p;
}

function realManifest() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, REAL_MANIFEST), 'utf8'));
}

function runCli(manifestPath) {
  return spawnSync(process.execPath, [CLI, '--manifest', manifestPath, '--repo-root', REPO_ROOT], { encoding: 'utf8' });
}

// --- (iii) 정상 manifest → exit 0 -------------------------------------------

test('대조기 — 정상 manifest 는 exit 0 이고 검사한 수를 낸다 (침묵 통과 금지)', () => {
  const r = check({ manifest: path.join(REPO_ROOT, REAL_MANIFEST), repoRoot: REPO_ROOT });
  assert.equal(r.ok, true, JSON.stringify(r, null, 1));
  assert.equal(r.checked, REQUIRED_IDS.length);

  const cli = runCli(path.join(REPO_ROOT, REAL_MANIFEST));
  assert.equal(cli.status, 0);
  // 수치는 REQUIRED_IDS 에서 파생한다 — 리터럴로 박으면 하한이 늘 때마다 test 가
  // 무관한 이유로 red 가 되고, 저자는 하한을 늘리지 않는 쪽으로 학습한다.
  const n = REQUIRED_IDS.length;
  assert.match(cli.stdout, new RegExp('checked ' + n + ' assertion\\(s\\); required floor ' + n));
});

test('대조기 — REQUIRED_IDS 에 중복이 없고 manifest 와 동치다', () => {
  assert.equal(new Set(REQUIRED_IDS).size, REQUIRED_IDS.length);
  // manifest 의 id 집합과 REQUIRED_IDS 가 일치해야 한다(하한이자 현재는 동치).
  const ids = realManifest().assertions.map((a) => a.id).sort();
  assert.deepEqual(ids, REQUIRED_IDS.slice().sort());
});

// --- (i) 필수 id 하나를 뺀 manifest → exit 1 ---------------------------------

test('대조기 — 필수 id 를 manifest 에서 빼면 exit 1 (manifest 편집으로 우회 불가)', () => {
  const dir = mkTmp();
  const m = realManifest();
  m.assertions = m.assertions.filter((a) => a.id !== 'B1-RECEIPT-COMMITTED');
  const p = writeManifest(dir, m);

  const r = check({ manifest: p, repoRoot: REPO_ROOT });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing_from_manifest, ['B1-RECEIPT-COMMITTED']);
  assert.deepEqual(r.absent_in_tests, [], 'this is a DIFFERENT failure from absent-in-tests');

  const cli = runCli(p);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /missing-from-manifest: B1-RECEIPT-COMMITTED/);
});

// --- (ii) test_title 이 파일에 없는 manifest → exit 1 ------------------------

test('대조기 — test_title 이 test 파일에 없으면 exit 1', () => {
  const dir = mkTmp();
  const m = realManifest();
  const target = m.assertions.find((a) => a.id === 'B1-LADDER-EMPTY');
  target.test_title = 'B1-LADDER-EMPTY: this title does not exist anywhere';
  const p = writeManifest(dir, m);

  const r = check({ manifest: p, repoRoot: REPO_ROOT });
  assert.equal(r.ok, false);
  assert.equal(r.absent_in_tests.length, 1);
  assert.equal(r.absent_in_tests[0].id, 'B1-LADDER-EMPTY');
  assert.deepEqual(r.missing_from_manifest, [], 'this is a DIFFERENT failure from missing-from-manifest');

  const cli = runCli(p);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /absent-in-tests: B1-LADDER-EMPTY/);
});

test('대조기 — test_file 이 존재하지 않으면 exit 1 (absent-in-tests 와 구분)', () => {
  const dir = mkTmp();
  const m = realManifest();
  m.assertions.find((a) => a.id === 'B1-DUP-DECISION').test_file = 'plugins/mccp/scripts/derive/tests/nope.test.js';
  const p = writeManifest(dir, m);

  const r = check({ manifest: p, repoRoot: REPO_ROOT });
  assert.equal(r.ok, false);
  assert.equal(r.missing_test_file.length, 1);
  assert.equal(r.missing_test_file[0].id, 'B1-DUP-DECISION');
  assert.equal(runCli(p).status, 1);
});

// --- 사용 오류(exit 2)는 위반(exit 1)과 다른 실패다 --------------------------

test('대조기 — manifest 판독 불가 / 스키마 위반은 exit 2 (사용 오류)', () => {
  const dir = mkTmp();

  const missing = path.join(dir, 'nope.json');
  assert.equal(runCli(missing).status, 2);
  assert.throws(() => check({ manifest: missing, repoRoot: REPO_ROOT }), UsageError);

  const badJson = path.join(dir, 'bad.json');
  fs.writeFileSync(badJson, '{not json', 'utf8');
  assert.equal(runCli(badJson).status, 2);

  // test_title 이 자기 id 접두를 갖지 않으면 스키마 위반이다 — 표현 차이로 매칭이
  // 깨지는 것을 없애기 위한 계약이므로 조용히 넘어가지 않는다.
  const m = realManifest();
  m.assertions[0].test_title = 'decisionFromBasename equivalence';
  const badTitle = writeManifest(dir, m);
  assert.equal(runCli(badTitle).status, 2);
  assert.throws(() => check({ manifest: badTitle, repoRoot: REPO_ROOT }), UsageError);

  // 필수 필드 누락
  const m2 = realManifest();
  delete m2.assertions[1].assertion;
  assert.equal(runCli(writeManifest(dir, m2)).status, 2);

  // --manifest 미지정
  const noArg = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.equal(noArg.status, 2);
});

// --- local review M3 — 제목의 *등장* 과 test 의 *실재* 를 구분한다 --------------

test('대조기 — 제목이 주석에만 있으면 exit 1 (test 호출 앵커 필수)', () => {
  // 이전 구현은 파일 전체 substring 이라 **주석 한 줄로 21개 필수 단언을 전부 "존재"**
  // 하게 만들 수 있었다. 그 우회가 열려 있으면 이 대조기가 게이트화한 나머지 Acceptance
  // 항목도 함께 무력해진다.
  const dir = mkTmp();
  const decoy = path.join(dir, 'decoy.test.js');
  const title = 'B1-LADDER-EMPTY: a zero denominator yields insufficient, not invalid';
  fs.writeFileSync(decoy, [
    "'use strict';",
    '// ' + title,                        // 주석 등장 — 존재 증명이 아니다
    "const note = '" + title + "';",      // 문자열 등장 — 역시 아니다
    'module.exports = { note };',
  ].join('\n'), 'utf8');

  const m = realManifest();
  const target = m.assertions.find((a) => a.id === 'B1-LADDER-EMPTY');
  target.test_file = decoy;
  target.test_title = title;
  const p = writeManifest(dir, m);

  const r = check({ manifest: p, repoRoot: REPO_ROOT });
  assert.equal(r.ok, false, 'a title that only appears in prose must not count as present');
  assert.equal(r.absent_in_tests.length, 1);
  assert.equal(r.absent_in_tests[0].id, 'B1-LADDER-EMPTY');
  assert.equal(runCli(p).status, 1);

  // 같은 제목을 실제 test 호출로 바꾸면 통과한다 — 앵커가 과하게 빡빡하지 않음을 고정.
  fs.writeFileSync(decoy, "test('" + title + "', () => {});\n", 'utf8');
  assert.equal(check({ manifest: p, repoRoot: REPO_ROOT }).ok, true);
});

test('대조기 — 중복 id 는 위반이다', () => {
  const dir = mkTmp();
  const m = realManifest();
  m.assertions.push(Object.assign({}, m.assertions[0]));
  const p = writeManifest(dir, m);
  const r = check({ manifest: p, repoRoot: REPO_ROOT });
  assert.equal(r.ok, false);
  assert.deepEqual(r.duplicate_ids, [m.assertions[0].id]);
  assert.equal(runCli(p).status, 1);
});
