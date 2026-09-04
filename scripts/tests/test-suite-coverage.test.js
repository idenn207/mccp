'use strict';

// `coverage.js` · `exclusions.js` · `gate.js`의 합성 입력 단언 (M3 Task 2 · 2b · 3).
//
// 분기마다 **특정 침묵실패 모드를 겨냥한다** — mirror는 `scripts/tests/test-suite.test.js`다.
// 번호는 계획의 Validate 목록과 1:1로 대응하며, 번호를 옮기면 그 대응이 끊긴다.
//
// ── seam이 둘인 이유 ────────────────────────────────────────────────────────
// 순수층 분기는 함수를 직접 부른다. 그러나 (i)·(j)·(k)와 CLI 종료코드 분기가 재는
// 것은 **git 해소 자체와 인자 검증**이라 순수층 밖이므로 `spawnSync`로 CLI를 실제로
// 띄운다 — 순수층만 단언하면 이 계획이 네 번 재현했다고 적은 실패 모드
// ("기계는 만들어지고 부르는 한 줄이 빠진다")가 test 밖에 남는다(L2 R7 test).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const COVERAGE_CLI = path.join(REPO, 'scripts', 'test-suite', 'coverage.js');
const GATE_CLI = path.join(REPO, 'scripts', 'test-suite', 'gate.js');
const EXCLUSIONS_CLI = path.join(REPO, 'scripts', 'test-suite', 'exclusions.js');
const EXCLUSIONS_FILE = path.join(REPO, '.github', 'test-suite-exclusions.json');
const FLOOR_FILE = path.join(REPO, '.github', 'test-suite-floor.json');

const { computeCoverage } = require('../test-suite/coverage.js');
const { judge, undeclaredReasons, JUDGE_REASONS, INPUT_REASONS } = require('../test-suite/gate.js');
const { validateExclusions, MAX_EXCLUSION_ENTRIES } = require('../test-suite/exclusions.js');
const { enumerateTests, exclusionsDigest } = require('../test-suite/enumerate.js');

// ─────────────────────────────────────────────────────────────────────────────
// 합성 입력 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function mkMeasurement(files, over) {
  const base = {
    ok: true,
    exit_code: 0,
    redaction_ok: true,
    files_total: files.length,
    per_file: files.map(function (f) { return { file: f, ok: true }; }),
  };
  return Object.assign(base, over || {});
}

function tmpdir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m3-' + tag + '-'));
}

/** 합성 git 저장소. `inputs.js`가 `git ls-files`/`git ls-tree`로 해소하므로 CLI
 *  분기는 실제 저장소가 있어야 성립한다. */
function mkRepo(testFiles) {
  const dir = tmpdir('repo');
  const git = function (args) {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + (r.stderr || r.stdout));
    return r.stdout;
  };
  git(['init', '--quiet']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'user.name', 'mccp test']);
  testFiles.forEach(function (rel) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '// synthetic\n');
  });
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'seed']);
  return { dir: dir, git: git };
}

function writeJson(dir, name, value) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
  return p;
}

function runCli(cli, args, cwd) {
  return spawnSync(process.execPath, [cli].concat(args), {
    cwd: cwd || REPO, encoding: 'utf8',
  });
}

const OK_EXCLUSION = {
  pattern: 'a/one.test.js',
  reason: 'synthetic fixture exclusion for the coverage oracle branches',
  ticket: 'backlog:synthetic',
};

// ─────────────────────────────────────────────────────────────────────────────
// coverage.js — 순수층 (계획 Task 2의 분기 1~13)
// ─────────────────────────────────────────────────────────────────────────────

test('(1) full match is 100% with unexplained empty', () => {
  const tracked = ['a/one.test.js', 'a/two.test.js'];
  const cov = computeCoverage({ tracked: tracked, measurement: mkMeasurement(tracked), exclusions: [] });
  assert.strictEqual(cov.coverage_pct, 100);
  assert.deepStrictEqual(cov.unexplained, []);
  assert.strictEqual(cov.ok, true);
});

test('(2) one exclusion drops coverage_pct below 100 but keeps unexplained empty', () => {
  // DD2의 "저장소를 인질로 잡지 않는다"를 고정하는 분기다. 격리는 커버리지를
  // 떨어뜨리되 `--assert-accounted`를 막지 않는다.
  const tracked = ['a/one.test.js', 'a/two.test.js'];
  const cov = computeCoverage({
    tracked: tracked,
    measurement: mkMeasurement(['a/two.test.js']),
    exclusions: [OK_EXCLUSION],
    maxExcludedFiles: 1,
  });
  assert.ok(cov.coverage_pct < 100, 'exclusion must lower the reported percentage');
  assert.deepStrictEqual(cov.unexplained, []);
  assert.strictEqual(cov.ok, true, 'accounted-ness must still hold');
});

test('(3) per_file shorter than tracked surfaces the difference as unexplained', () => {
  const tracked = ['a/one.test.js', 'a/two.test.js', 'a/three.test.js'];
  const cov = computeCoverage({
    tracked: tracked, measurement: mkMeasurement(['a/one.test.js']), exclusions: [],
  });
  assert.deepStrictEqual(cov.unexplained, ['a/three.test.js', 'a/two.test.js']);
  assert.strictEqual(cov.ok, false);
});

test('(4) a single **/*.test.js entry is refused by the excluded-files cap', () => {
  // 항목 수 1건 · ticket 충족 · unexplained 0을 **전부 만족하는데도** 막혀야 한다.
  // 이것이 DD2가 열거한 "게이트가 한 줄로 완전히 열리는" 경로의 음성 통제다.
  const tracked = ['a/one.test.js', 'b/c/two.test.js', 'd/three.test.js'];
  const cov = computeCoverage({
    tracked: tracked,
    measurement: mkMeasurement([]),
    exclusions: [{ pattern: '**/*.test.js', reason: 'blanket', ticket: 'T-1' }],
    maxExcludedFiles: 2,
  });
  assert.deepStrictEqual(cov.unexplained, [], 'the blanket glob does explain every file');
  assert.ok(cov.reasons.includes('excluded_over_cap'));
  assert.strictEqual(cov.ok, false);
});

test('(5) a tracked file in neither bucket lands in unexplained', () => {
  const cov = computeCoverage({
    tracked: ['a/one.test.js', 'a/hidden.test.js'],
    measurement: mkMeasurement(['a/one.test.js']),
    exclusions: [],
  });
  assert.deepStrictEqual(cov.unexplained, ['a/hidden.test.js']);
  assert.strictEqual(cov.ok, false);
});

test('(6) tracked below floor blocks (DD9 backstop)', () => {
  const tracked = ['a/one.test.js'];
  const cov = computeCoverage({
    tracked: tracked, measurement: mkMeasurement(tracked), exclusions: [], floor: 5,
  });
  assert.ok(cov.reasons.includes('below_floor'));
  assert.strictEqual(cov.ok, false);
});

test('(7) a deletion inside the allowance does NOT trip the floor', () => {
  // 정당한 삭제의 출구가 형제 조건에 막히지 않음을 잰다. 출구는 floor 하향이 아니라
  // `allow_deletions`이고, 그 출구가 실재하려면 floor에 여백이 있어야 한다.
  const floor = 3;
  const maxAllowedDeletions = 1;
  const tracked = ['a/1.test.js', 'a/2.test.js', 'a/3.test.js', 'a/4.test.js']
    .slice(0, floor + maxAllowedDeletions);
  const cov = computeCoverage({
    tracked: tracked, measurement: mkMeasurement(tracked), exclusions: [], floor: floor,
  });
  assert.ok(!cov.reasons.includes('below_floor'), 'the allowance must leave headroom above the floor');
  assert.strictEqual(cov.ok, true);
});

test('(9) a digest that disagrees with the loaded list blocks (DD2 anchoring)', () => {
  const tracked = ['a/one.test.js', 'a/two.test.js'];
  const cov = computeCoverage({
    tracked: tracked,
    measurement: mkMeasurement(['a/two.test.js'], { exclusions_digest: 'sha256:deadbeef' }),
    exclusions: [OK_EXCLUSION],
    maxExcludedFiles: 1,
  });
  assert.ok(cov.reasons.includes('digest_mismatch'));
  assert.strictEqual(cov.ok, false);
});

test('(9b) a digest computed from the same list agrees', () => {
  const tracked = ['a/one.test.js', 'a/two.test.js'];
  const cov = computeCoverage({
    tracked: tracked,
    measurement: mkMeasurement(['a/two.test.js'], { exclusions_digest: exclusionsDigest([OK_EXCLUSION]) }),
    exclusions: [OK_EXCLUSION],
    maxExcludedFiles: 1,
  });
  assert.ok(!cov.reasons.includes('digest_mismatch'));
});

test('(11) the coverage record carries no fully_skipped key', () => {
  // DD2의 철회가 **모듈 계약에 실제로 도달했는지**를 재는 짝 단언이다. 철회를
  // 산문에만 적으면 Task를 읽는 구현자가 그 필드를 만들고 아무 test도 붉어지지 않는다.
  const tracked = ['a/one.test.js'];
  const cov = computeCoverage({ tracked: tracked, measurement: mkMeasurement(tracked), exclusions: [] });
  assert.ok(!Object.prototype.hasOwnProperty.call(cov, 'fully_skipped'),
    'fully_skipped has no producer in the measurement path; a field only synthetic fixtures can fill is always green');
});

test('(12) the denominator comes from tracked, never from measurement.files_total', () => {
  // DD2가 금지한 "measurement에서 분모 파생"을 반증 가능하게 만드는 짝 단언이다.
  // `files_total`은 격리 적용 **후** 값이므로 그것을 분모로 삼으면 unexplained가
  // 정의상 항상 0이고 floor가 격리와 함께 내려가 래칫이 반대로 작동한다.
  const tracked = ['a/one.test.js', 'a/two.test.js', 'a/three.test.js'];
  const m = mkMeasurement(['a/two.test.js', 'a/three.test.js']);
  m.files_total = 2;
  const cov = computeCoverage({
    tracked: tracked, measurement: m, exclusions: [OK_EXCLUSION], maxExcludedFiles: 1,
  });
  assert.strictEqual(cov.denominator, tracked.length);
  assert.notStrictEqual(cov.denominator, m.files_total);
});

test('(12b) an empty tracked list is a measurement failure, not 100%', () => {
  const cov = computeCoverage({ tracked: [], measurement: mkMeasurement([]), exclusions: [] });
  assert.ok(cov.reasons.includes('tracked_empty'));
  assert.strictEqual(cov.ok, false);
});

test('(13) per_file null (the real producer shape) blocks; [] blocks too', () => {
  // `run.js:213-214`가 명시한다: "ok:false일 때 per_file은 null이지 []가 아니다 —
  // 모름을 0으로 쓰지 않는다". 정본은 null이고 []는 방어적 분기다. 부재는 "적음"이
  // 아니므로 둘 다 차단이다.
  const tracked = ['a/one.test.js'];
  const nullCase = computeCoverage({
    tracked: tracked, measurement: mkMeasurement(tracked, { per_file: null }), exclusions: [],
  });
  assert.ok(nullCase.reasons.includes('per_file_absent'), 'null is the canonical absent shape');
  assert.strictEqual(nullCase.ok, false);

  const emptyCase = computeCoverage({
    tracked: tracked, measurement: mkMeasurement(tracked, { per_file: [] }), exclusions: [],
  });
  assert.ok(emptyCase.reasons.includes('per_file_absent'));
  assert.strictEqual(emptyCase.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// coverage.js — CLI 종료코드 (분기 8 · 10)
// ─────────────────────────────────────────────────────────────────────────────

test('(8) --assert-accounted without --floor-from is non-zero; --assert-full is not', () => {
  // DD9 1번. 래칫 인자 누락이 조용한 통과가 되지 않는다 — permissive default가
  // 정확히 "인자가 빠져도 green"이다.
  const repo = mkRepo(['a/one.test.js']);
  const m = writeJson(repo.dir, 'm.json', mkMeasurement(['a/one.test.js']));
  const ex = writeJson(repo.dir, 'ex.json', []);

  const accounted = runCli(COVERAGE_CLI, ['--measurement', m, '--exclude-from', ex, '--assert-accounted'], repo.dir);
  assert.notStrictEqual(accounted.status, 0, 'a blocking verdict without its ratchet input must refuse');
  assert.match(accounted.stderr, /floor_unreadable/);

  const full = runCli(COVERAGE_CLI, ['--measurement', m, '--exclude-from', ex, '--assert-full'], repo.dir);
  assert.strictEqual(full.status, 0, '--assert-full is local diagnosis and does not carry the ratchet requirement');
});

test('(10) every ok=false branch reaches the CLI exit code', () => {
  // 순수층의 판정이 종료코드에 도달함을 단언한다. `ok=false`인데 exit 0이면
  // 소비처가 그것을 못 본다.
  const repo = mkRepo(['a/one.test.js', 'a/two.test.js']);
  const floor = writeJson(repo.dir, 'floor.json', {
    tracked_basis: 2, tracked: 1, max_excluded_files: 0,
    max_allowed_deletions: 0, allow_deletions: [],
  });
  const ex = writeJson(repo.dir, 'ex.json', []);
  // unexplained: 측정이 한 파일만 담는다
  const m = writeJson(repo.dir, 'm.json', mkMeasurement(['a/one.test.js']));
  const r = runCli(COVERAGE_CLI, [
    '--measurement', m, '--exclude-from', ex, '--floor-from', floor, '--assert-accounted', '--json',
  ], repo.dir);
  assert.notStrictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.reasons.includes('unexplained'));
});

// ─────────────────────────────────────────────────────────────────────────────
// gate.js — 순수층 판정 순서 (계획 Task 2b의 분기 a~h, l, n)
// ─────────────────────────────────────────────────────────────────────────────

const NO_DEL = { base_resolved: false, base_ref: null, missing: [], allowed: [] };

function cov1(tracked, exclusions, floor) {
  return { tracked: tracked, exclusions: exclusions || [], floor: floor || null };
}

test('(a) a red suite blocks at stage 1 and names the failing files plus the downstream caveat', () => {
  const v = judge({
    measurement: mkMeasurement(['a/one.test.js'], { exit_code: 1, failing: ['a/one.test.js'] }),
    coverage: cov1(['a/one.test.js']),
    deletions: NO_DEL,
  });
  assert.strictEqual(v.stage, 1);
  assert.deepStrictEqual(v.reasons, ['suite_red']);
  assert.match(v.message, /a\/one\.test\.js/);
  assert.match(v.message, /may be DOWNSTREAM of this red/,
    'stage 1 must carry the caveat: the leak verdict below it may be an artefact of the red');
});

test('(b) red AND leaking still stops at stage 1 — order is the argument', () => {
  // 순서가 뒤집히면 이 분기가 red가 된다. DD3을 산문에서 반증 가능한 명제로 바꾸는 단언이다.
  const v = judge({
    measurement: mkMeasurement(['a/one.test.js'], { exit_code: 1, redaction_ok: false, failing: ['a/one.test.js'] }),
    coverage: cov1(['a/one.test.js']),
    deletions: NO_DEL,
  });
  assert.strictEqual(v.stage, 1);
});

test('(c) green with a failing coverage oracle blocks at stage 2', () => {
  const v = judge({
    measurement: mkMeasurement(['a/one.test.js']),
    coverage: cov1(['a/one.test.js', 'a/missing.test.js']),
    deletions: NO_DEL,
  });
  assert.strictEqual(v.stage, 2);
  assert.ok(v.reasons.includes('unexplained'));
});

test('(d) green + accounted + leaking blocks at stage 3 WITHOUT the downstream caveat', () => {
  // 여기 도달했다는 것은 1이 통과했다는 뜻이므로 하류 가능성이 구조적으로 배제된다.
  const tracked = ['a/one.test.js'];
  const v = judge({
    measurement: mkMeasurement(tracked, { redaction_ok: false }),
    coverage: cov1(tracked),
    deletions: NO_DEL,
  });
  assert.strictEqual(v.stage, 3);
  assert.deepStrictEqual(v.reasons, ['redaction']);
  assert.ok(!/may be DOWNSTREAM of this red/.test(v.message),
    'stage 3 is reached only after stage 1 passed, so the caveat CANNOT apply here');
  assert.match(v.message, /GREEN/);
});

test('(e) all three axes passing yields blocked=false', () => {
  const tracked = ['a/one.test.js'];
  const v = judge({ measurement: mkMeasurement(tracked), coverage: cov1(tracked), deletions: NO_DEL });
  assert.strictEqual(v.blocked, false);
  assert.deepStrictEqual(v.reasons, []);
});

test('(f) a measurement missing any of the three keys blocks — absence is not a pass', () => {
  ['ok', 'exit_code', 'redaction_ok'].forEach(function (key) {
    const m = mkMeasurement(['a/one.test.js']);
    delete m[key];
    const v = judge({ measurement: m, coverage: cov1(['a/one.test.js']), deletions: NO_DEL });
    assert.strictEqual(v.blocked, true, 'missing ' + key + ' must block');
    assert.strictEqual(v.stage, 0);
    assert.ok(v.reasons.includes('measurement_invalid'));
  });
});

test('(g) ok:false + exit_code:0 + redaction_ok:true blocks at stage 0', () => {
  // 러너가 chunk spawn에 실패했을 때 접혀 나오는 조합이다(`run.js:489-505` +
  // `:179-183`의 `Number(null) || 0`). 0단계가 없으면 **한 번도 돌지 않은 스위트**가
  // 1·3단계를 통과한다.
  const v = judge({
    measurement: { ok: false, exit_code: 0, redaction_ok: true, per_file: null },
    coverage: cov1(['a/one.test.js']),
    deletions: NO_DEL,
  });
  assert.strictEqual(v.stage, 0);
  assert.ok(v.reasons.includes('measurement_invalid'));
});

test('(g2) a measurement carrying files absent from the tree blocks with measurement_tree_mismatch', () => {
  const v = judge({
    measurement: mkMeasurement(['a/one.test.js', 'a/ghost.test.js']),
    coverage: cov1(['a/one.test.js']),
    deletions: NO_DEL,
  });
  assert.strictEqual(v.stage, 0);
  assert.deepStrictEqual(v.reasons, ['measurement_tree_mismatch']);
});

test('(h) the stage-0 message says the measurement failed and does NOT claim the suite is red', () => {
  const v = judge({
    measurement: { ok: false, exit_code: 0, redaction_ok: true, per_file: null },
    coverage: cov1(['a/one.test.js']),
    deletions: NO_DEL,
  });
  assert.match(v.message, /MEASUREMENT failed|did not complete/i);
  assert.ok(!/suite is RED/.test(v.message),
    'the two facts are different; claiming a red suite here would misname the cause');
});

test('(l) --json carries the coverage numbers the acceptance evidence needs', () => {
  const tracked = ['a/one.test.js', 'a/two.test.js'];
  const v = judge({ measurement: mkMeasurement(tracked), coverage: cov1(tracked), deletions: NO_DEL });
  ['coverage_pct', 'denominator', 'numerator', 'excluded', 'unexplained', 'tracked'].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(v.coverage, k), 'coverage.' + k + ' must be present');
  });
  assert.strictEqual(v.coverage.denominator, tracked.length);
});

test('(k) deletion ratchet: set difference, not a count comparison', () => {
  const base = ['a/one.test.js', 'a/two.test.js'];
  // 삭제만 → 차단
  let v = judge({
    measurement: mkMeasurement(['a/one.test.js']),
    coverage: cov1(['a/one.test.js']),
    deletions: { base_resolved: true, base_ref: 'origin/main', missing: ['a/two.test.js'], allowed: [] },
  });
  assert.ok(v.reasons.includes('deleted_without_allowance'));

  // 삭제 1건 + 추가 1건 → **여전히 차단**. 개수 비교였다면 통과했을 구성이다.
  const head = ['a/one.test.js', 'a/new.test.js'];
  v = judge({
    measurement: mkMeasurement(head),
    coverage: cov1(head),
    deletions: { base_resolved: true, base_ref: 'origin/main', missing: ['a/two.test.js'], allowed: [] },
  });
  assert.ok(v.reasons.includes('deleted_without_allowance'),
    'a count comparison would cancel out here; the set difference must not');

  // missing이 전부 면제되면 통과
  v = judge({
    measurement: mkMeasurement(['a/one.test.js']),
    coverage: cov1(['a/one.test.js']),
    deletions: { base_resolved: true, base_ref: 'origin/main', missing: ['a/two.test.js'], allowed: ['a/two.test.js'] },
  });
  assert.strictEqual(v.blocked, false);

  // missing 밖 경로가 아무리 많아도 missing의 한 원소가 빠지면 차단
  v = judge({
    measurement: mkMeasurement(['a/one.test.js']),
    coverage: cov1(['a/one.test.js']),
    deletions: {
      base_resolved: true, base_ref: 'origin/main',
      missing: ['a/two.test.js', 'a/three.test.js'],
      allowed: ['a/three.test.js', 'z/1.test.js', 'z/2.test.js', 'z/3.test.js'],
    },
  });
  assert.ok(v.reasons.includes('deleted_without_allowance'));
  assert.ok(/a\/two\.test\.js/.test(v.message));

  // base 부재면 정적 floor로만 판정하고 출력에 base=absent가 실린다
  v = judge({ measurement: mkMeasurement(base), coverage: cov1(base), deletions: NO_DEL });
  assert.strictEqual(v.coverage.base, 'absent');
});

test('(k6) a blanket glob in allow_deletions does NOT exempt anything — literal match only', () => {
  // 같은 CRITICAL이 격리 축에서는 분기 (4)라는 기계를 갖는데 삭제 축에서는 산문뿐이었다.
  // glob으로 구현하면 이 분기가 red다.
  const v = judge({
    measurement: mkMeasurement(['a/one.test.js']),
    coverage: cov1(['a/one.test.js']),
    deletions: {
      base_resolved: true, base_ref: 'origin/main',
      missing: ['a/two.test.js'], allowed: ['**/*.test.js'],
    },
  });
  assert.ok(v.reasons.includes('deleted_without_allowance'),
    'allow_deletions[].path is a literal path; treating it as a glob kills the ratchet outright');
});

test('(n) stage 2 accumulates — a coverage failure and a deletion both land in reasons', () => {
  // 단락 구현이면 이 분기가 red다. 겹침에 무감한 `includes` 단언이 (e4)와 4b를
  // 성립시키는 전제이기도 하다.
  const v = judge({
    measurement: mkMeasurement(['a/one.test.js']),
    coverage: cov1(['a/one.test.js', 'a/unexplained.test.js']),
    deletions: { base_resolved: true, base_ref: 'origin/main', missing: ['a/gone.test.js'], allowed: [] },
  });
  assert.strictEqual(v.stage, 2);
  assert.ok(v.reasons.includes('unexplained'), 'the coverage axis must still be reported');
  assert.ok(v.reasons.includes('deleted_without_allowance'), 'the ratchet axis must still be reported');
});

// ─────────────────────────────────────────────────────────────────────────────
// gate.js — CLI seam (분기 i · j · m · o)
// ─────────────────────────────────────────────────────────────────────────────

function gateFixture() {
  const repo = mkRepo(['a/one.test.js', 'a/two.test.js']);
  const files = {
    measurement: writeJson(repo.dir, 'm.json', mkMeasurement(['a/one.test.js', 'a/two.test.js'])),
    exclusions: writeJson(repo.dir, 'ex.json', []),
    floor: writeJson(repo.dir, 'floor.json', {
      tracked_basis: 2, tracked: 1, max_excluded_files: 0,
      max_allowed_deletions: 0, allow_deletions: [],
    }),
  };
  return { repo: repo, files: files };
}

test('(i) the gate resolves tracked itself and judges on it, not on measurement.files_total', () => {
  // 이 단언이 `coverage.js` 순수층이 아니라 **gate 경로**에 걸려야 하는 이유는
  // CI가 부르는 것이 gate이기 때문이다(L2 R5 — 같은 실패 모드의 네 번째 재현).
  const f = gateFixture();
  const m = mkMeasurement(['a/one.test.js']);
  m.files_total = 1;   // 측정은 1이라 주장하지만 트리에는 2개가 있다
  writeJson(f.repo.dir, 'm.json', m);
  const r = runCli(GATE_CLI, [
    '--measurement', f.files.measurement, '--exclude-from', f.files.exclusions,
    '--floor-from', f.files.floor, '--json',
  ], f.repo.dir);
  assert.notStrictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.reasons.includes('unexplained'),
    'the gate must judge against the tree it resolved, not the number the measurement asserts');
});

test('(j) fail-closed inputs each block with their own reason code on stdout', () => {
  const f = gateFixture();
  const base = [
    '--measurement', f.files.measurement,
    '--exclude-from', f.files.exclusions,
    '--floor-from', f.files.floor,
  ];

  const cases = [
    { name: 'measurement absent', args: ['--exclude-from', f.files.exclusions, '--floor-from', f.files.floor], code: 'measurement_unreadable' },
    { name: 'measurement unreadable', args: ['--measurement', path.join(f.repo.dir, 'nope.json'), '--exclude-from', f.files.exclusions, '--floor-from', f.files.floor], code: 'measurement_unreadable' },
    { name: 'exclusions absent', args: ['--measurement', f.files.measurement, '--floor-from', f.files.floor], code: 'exclusions_unreadable' },
    { name: 'exclusions unreadable', args: ['--measurement', f.files.measurement, '--exclude-from', path.join(f.repo.dir, 'nope.json'), '--floor-from', f.files.floor], code: 'exclusions_unreadable' },
    { name: 'floor absent', args: ['--measurement', f.files.measurement, '--exclude-from', f.files.exclusions], code: 'floor_unreadable' },
    { name: 'floor unreadable', args: ['--measurement', f.files.measurement, '--exclude-from', f.files.exclusions, '--floor-from', path.join(f.repo.dir, 'nope.json')], code: 'floor_unreadable' },
    { name: 'base unresolved', args: base.concat(['--base-ref', 'origin/does-not-exist']), code: 'base_unresolved' },
    { name: 'duplicate --floor-from', args: base.concat(['--floor-from', f.files.floor]), code: 'duplicate_flag' },
    { name: 'duplicate --base-ref', args: base.concat(['--base-ref', 'HEAD', '--base-ref', 'HEAD']), code: 'duplicate_flag' },
  ];

  cases.forEach(function (c) {
    const r = runCli(GATE_CLI, c.args.concat(['--json']), f.repo.dir);
    assert.notStrictEqual(r.status, 0, c.name + ' must be non-zero');
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.reasons.includes(c.code),
      c.name + ': expected reason ' + c.code + ', got ' + JSON.stringify(parsed.reasons));
    assert.strictEqual(parsed.stage, 0);
    assert.strictEqual(parsed.coverage, null);
  });

  // 격리 목록 **검증 실패**는 판독 실패와 다른 사실이다.
  const badEx = writeJson(f.repo.dir, 'bad-ex.json', [{ pattern: 'a/one.test.js', reason: 'no ticket here at all' }]);
  const rInvalid = runCli(GATE_CLI, [
    '--measurement', f.files.measurement, '--exclude-from', badEx, '--floor-from', f.files.floor, '--json',
  ], f.repo.dir);
  assert.notStrictEqual(rInvalid.status, 0);
  assert.ok(JSON.parse(rInvalid.stdout).reasons.includes('exclusions_invalid'));

  // floor의 다섯 키는 **키별** 분기다. 한 덩어리로 두면 넷만 검사하고 하나에
  // 기본값을 남긴 구현이 통과한다.
  ['tracked_basis', 'tracked', 'max_excluded_files', 'max_allowed_deletions', 'allow_deletions'].forEach(function (key) {
    const partial = {
      tracked_basis: 2, tracked: 1, max_excluded_files: 0,
      max_allowed_deletions: 0, allow_deletions: [],
    };
    delete partial[key];
    const p = writeJson(f.repo.dir, 'floor-' + key + '.json', partial);
    const r = runCli(GATE_CLI, [
      '--measurement', f.files.measurement, '--exclude-from', f.files.exclusions, '--floor-from', p, '--json',
    ], f.repo.dir);
    assert.notStrictEqual(r.status, 0, 'missing floor key ' + key + ' must block');
    assert.ok(JSON.parse(r.stdout).reasons.includes('floor_key_missing'),
      'missing floor key ' + key + ' must report floor_key_missing');
  });

  // allow_deletions 원소 shape — `{path}`만 있는 항목과 빈 ticket 각각이 차단이다.
  [[{ path: 'a/two.test.js' }], [{ path: 'a/two.test.js', reason: 'r', ticket: '' }]].forEach(function (bad, i) {
    const p = writeJson(f.repo.dir, 'floor-shape-' + i + '.json', {
      tracked_basis: 2, tracked: 1, max_excluded_files: 0,
      max_allowed_deletions: 1, allow_deletions: bad,
    });
    const r = runCli(GATE_CLI, [
      '--measurement', f.files.measurement, '--exclude-from', f.files.exclusions, '--floor-from', p, '--json',
    ], f.repo.dir);
    assert.notStrictEqual(r.status, 0);
    assert.ok(JSON.parse(r.stdout).reasons.includes('floor_entry_shape'));
  });
});

test('(j2) base_set_empty — a resolved ref whose tree carries no tests still blocks', () => {
  // head 쪽 `tracked_empty`의 대칭이다. 없으면 얕은 클론이나 트리 없는 ref에서
  // 래칫이 **무조건 통과**한다.
  // **merge base**의 트리가 비어야 한다. base 브랜치를 HEAD에서 따면 merge base가
  // 이미 test를 든 커밋이 되어 이 분기를 재지 못한다 — 그래서 test 없는 커밋을
  // 먼저 만들고 거기서 갈라진다.
  const repo = mkRepo(['README.md']);
  repo.git(['branch', 'empty-base']);
  fs.mkdirSync(path.join(repo.dir, 'a'), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, 'a', 'one.test.js'), '// synthetic\n');
  repo.git(['add', '-A']);
  repo.git(['commit', '--quiet', '-m', 'add tests after the base point']);

  const m = writeJson(repo.dir, 'm.json', mkMeasurement(['a/one.test.js']));
  const ex = writeJson(repo.dir, 'ex.json', []);
  const floor = writeJson(repo.dir, 'floor.json', {
    tracked_basis: 1, tracked: 0, max_excluded_files: 0, max_allowed_deletions: 0, allow_deletions: [],
  });
  const r = runCli(GATE_CLI, [
    '--measurement', m, '--exclude-from', ex, '--floor-from', floor, '--base-ref', 'empty-base', '--json',
  ], repo.dir);
  assert.notStrictEqual(r.status, 0);
  assert.ok(JSON.parse(r.stdout).reasons.includes('base_set_empty'));
});

test('(m) blocked reaches the exit code in every stage, and (o) --json still lands on stdout', () => {
  const f = gateFixture();
  const stages = [
    { name: 'stage 0', m: { ok: false, exit_code: 0, redaction_ok: true, per_file: null }, stage: 0 },
    { name: 'stage 1', m: mkMeasurement(['a/one.test.js', 'a/two.test.js'], { exit_code: 1, failing: ['a/one.test.js'] }), stage: 1 },
    { name: 'stage 2', m: mkMeasurement(['a/one.test.js']), stage: 2 },
    { name: 'stage 3', m: mkMeasurement(['a/one.test.js', 'a/two.test.js'], { redaction_ok: false }), stage: 3 },
  ];
  stages.forEach(function (s) {
    const p = writeJson(f.repo.dir, 'm-' + s.stage + '.json', s.m);
    const r = runCli(GATE_CLI, [
      '--measurement', p, '--exclude-from', f.files.exclusions, '--floor-from', f.files.floor, '--json',
    ], f.repo.dir);
    assert.notStrictEqual(r.status, 0, s.name + ': judge blocked, so the CLI must be non-zero');
    // (o) — blocked에서도 파싱 가능한 JSON이 stdout에 실린다. 진단을 stderr로만 내고
    // 죽는 구현은 종료코드 단언을 만족하면서 CI red run의 gate.json을 **빈 파일**로
    // 만들고, 축 D 증거 전체가 그 미명시 동작에 매달린다.
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.stage, s.stage, s.name);
    assert.ok(Array.isArray(parsed.reasons) && parsed.reasons.length > 0, s.name + ': reasons must be carried');
  });
});

test('(o2) the emitted gate record passes through redact.js', () => {
  // DD4는 업로드되는 artifact 내용이 redact를 통과한 산출이라고 적는데 `gate.json`은
  // 이 모듈이 조립하는 것이라 그 계약 밖에 있었다. fail-closed 진단은 파일 경로를
  // 담고 `if: always()`라 조건 없이 발행된다.
  const f = gateFixture();
  const r = runCli(GATE_CLI, [
    '--measurement', path.join(f.repo.dir, 'nope.json'),
    '--exclude-from', f.files.exclusions, '--floor-from', f.files.floor, '--json',
  ], f.repo.dir);
  const parsed = JSON.parse(r.stdout);
  assert.ok(!/[A-Za-z]:[\\/]/.test(parsed.message),
    'a drive-shaped absolute path survived into the published gate record: ' + parsed.message);
});

test('gate passes end to end on a clean synthetic tree', () => {
  const f = gateFixture();
  const r = runCli(GATE_CLI, [
    '--measurement', f.files.measurement, '--exclude-from', f.files.exclusions,
    '--floor-from', f.files.floor, '--json',
  ], f.repo.dir);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.blocked, false);
  assert.strictEqual(parsed.coverage.coverage_pct, 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// exclusions.js — 검증기와 래칫 상수 (계획 Task 3)
// ─────────────────────────────────────────────────────────────────────────────

test('exclusions: a missing ticket throws', () => {
  assert.throws(function () {
    validateExclusions([{ pattern: 'a/one.test.js', reason: 'a reason that is long enough' }]);
  }, /ticket is required/);
});

test('exclusions: an empty ticket throws — the control must not be a formality', () => {
  assert.throws(function () {
    validateExclusions([{ pattern: 'a/one.test.js', reason: 'a reason that is long enough', ticket: '   ' }]);
  }, /ticket is required/);
});

test('exclusions: exceeding MAX_EXCLUSION_ENTRIES throws', () => {
  const many = [];
  for (let i = 0; i <= MAX_EXCLUSION_ENTRIES; i++) {
    many.push({ pattern: 'a/' + i + '.test.js', reason: 'synthetic over-cap entry', ticket: 'T-' + i });
  }
  assert.throws(function () { validateExclusions(many); }, /MAX_EXCLUSION_ENTRIES/);
});

test('exclusions: an object wrapper is refused — the consumer takes a bare array', () => {
  assert.throws(function () {
    validateExclusions({ exclusions: [] });
  }, /top-level ARRAY/);
});

test('exclusions: MAX_EXCLUSION_ENTRIES is EQUAL to the live entry count', () => {
  // 한 방향(`<=`)이면 상수 초기값 자체가 어디에도 pin되지 않아 헤드룸을 크게 잡는
  // 것만으로 게이트가 열린다. 늘리려면 상수를 올리는 별도 편집이 필요하고 그 사실이
  // diff에 숫자로 남는다.
  const live = JSON.parse(fs.readFileSync(EXCLUSIONS_FILE, 'utf8'));
  assert.strictEqual(MAX_EXCLUSION_ENTRIES, live.length,
    'the cap is pinned to the current entry count; raising it must be a visible, separate edit');
});

test('exclusions CLI: every throwing input is non-zero', () => {
  // 오라클은 그 단계의 *존재*만 본다 — throw를 삼키고 exit 0으로 끝나는 CLI가
  // 전 검사를 통과하면 workflow의 격리 검증 단계가 장식이 된다.
  const dir = tmpdir('excl');
  const bad = [
    [{ pattern: 'a/one.test.js', reason: 'long enough reason' }],                       // no ticket
    [{ pattern: 'a/one.test.js', reason: '   ', ticket: 'T-1' }],                        // blank reason
    { exclusions: [] },                                                                  // wrapper
  ];
  bad.forEach(function (value, i) {
    const p = writeJson(dir, 'bad-' + i + '.json', value);
    const r = runCli(EXCLUSIONS_CLI, ['--check', p], REPO);
    assert.notStrictEqual(r.status, 0, 'input #' + i + ' must be refused with a non-zero exit');
  });
  const r = runCli(EXCLUSIONS_CLI, ['--check', EXCLUSIONS_FILE], REPO);
  assert.strictEqual(r.status, 0, r.stderr);
});

// ─────────────────────────────────────────────────────────────────────────────
// 래칫 상수 — floor 파일 (계획 Task 3의 Validate)
// ─────────────────────────────────────────────────────────────────────────────

test('floor: the derivation identity holds — PURE JSON arithmetic, the tree is never read', () => {
  // 트리를 재는 어떤 여백 단언도 삭제(절단 B)에서 붉어져 살리려던 경로를 도로
  // 죽인다(L2 R15). 네 값이 전부 같은 파일 안에 있으므로 이 등식은 `git ls-files`를
  // 부르지 않는다 — 그래서 어떤 트리 변형에도 불변이고, 판정보다 앞선 자기 test
  // 단계에 있어도 축 D의 producer를 죽이지 않는다.
  const f = JSON.parse(fs.readFileSync(FLOOR_FILE, 'utf8'));
  assert.strictEqual(f.tracked, f.tracked_basis - (f.max_allowed_deletions + 1),
    'floor = tracked_basis - (max_allowed_deletions + 1): every deletion the allowance can admit must stay above the floor');
});

test('floor: max_allowed_deletions is EQUAL to the allow_deletions length', () => {
  // 좌변이 독립 키인 것이 이 단언의 전부다 — 상한이 배열 자신 말고 담길 자리가
  // 없으면 이 줄은 `length === length`이고, 그때 append는 아무것도 붉게 만들지 않는다.
  const f = JSON.parse(fs.readFileSync(FLOOR_FILE, 'utf8'));
  assert.strictEqual(f.max_allowed_deletions, f.allow_deletions.length);
});

test('floor: allow_deletions entries are literal paths carrying reason and ticket', () => {
  const f = JSON.parse(fs.readFileSync(FLOOR_FILE, 'utf8'));
  f.allow_deletions.forEach(function (e, i) {
    ['path', 'reason', 'ticket'].forEach(function (k) {
      assert.strictEqual(typeof e[k], 'string', 'allow_deletions[' + i + '].' + k);
      assert.notStrictEqual(e[k].trim(), '');
    });
    assert.ok(e.path.indexOf('*') < 0, 'allow_deletions[' + i + '].path must be a literal path, never a glob');
  });
});

test('floor: max_excluded_files EQUALS the real glob expansion over the live tree', () => {
  // 이 단계에서 **유일하게 트리를 읽는** 단언이다. 절단 A·B 양쪽의 파일 선택 규칙이
  // 그것을 덮는다(심거나 지우는 파일이 격리 패턴에 걸리지 않는다) — producer 생존은
  // 여백의 여유가 아니라 **의존 자체의 부재**로 성립한다.
  const f = JSON.parse(fs.readFileSync(FLOOR_FILE, 'utf8'));
  const exclusions = JSON.parse(fs.readFileSync(EXCLUSIONS_FILE, 'utf8'));
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .stdout.split('\0').map(function (s) { return s.trim(); }).filter(Boolean);
  const r = enumerateTests({ trackedFiles: tracked, exclusions: exclusions });
  assert.strictEqual(f.max_excluded_files, r.excluded.length,
    'the cap counts EXPANDED FILES, not list lines: one **/*.test.js line would otherwise cover the whole repo at cap 1');
});

test('run.js goes through exclusions.js — a ticketless list must kill the runner', () => {
  // DD7 재배선의 짝 단언. 통과하면 재배선이 안 된 것이고, 그때 상한과 ticket은
  // 사람이 로컬에서 부르는 한 줄에만 존재한다.
  const fixture = path.join(REPO, 'scripts', 'tests', 'fixtures', 'exclusions-no-ticket.json');
  const r = spawnSync(process.execPath, [
    path.join(REPO, 'scripts', 'test-suite', 'run.js'), '--list', '--exclude-from', fixture,
  ], { cwd: REPO, encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0,
    'the runner accepted an unvalidated exclusions list — the DD7 rewire is missing');
});

// ─────────────────────────────────────────────────────────────────────────────
// exclusions.js — pattern 복잡도 상한 (security-reviewer HIGH, 실측 재현)
// ─────────────────────────────────────────────────────────────────────────────

test('exclusions: a run of 3+ consecutive "*" is refused (ReDoS shape)', () => {
  // `globToRegExp`가 `*`마다 무한 수량자를 하나씩 이어붙이므로 연속된 `*`는
  // 파국적 backtracking의 형태가 된다. 이 목록은 fork PR이 통제하는 tracked 파일이고
  // 강제 workflow가 리뷰 이전에 그것을 먹인다 — 25자 한 줄이 유일한 머지 차단 체크를
  // 한 시간 점유한다. 표현력 손실은 0이다: `***`는 glob에서 `**`와 같은 것을 뜻한다.
  // 3개짜리를 쓰는 것이 의도다 — 15개는 wildcard 총량 상한이 **먼저** 잡으므로
  // 그것으로는 이 규칙이 살아 있는지 알 수 없다. 각 규칙은 자기만 걸리는 입력으로 잰다.
  assert.throws(function () {
    validateExclusions([{
      pattern: '***a.test.js',
      reason: 'catastrophic backtracking probe',
      ticket: 'T-1',
    }]);
  }, /consecutive/);

  // 그리고 실측된 그 입력도 거부된다 — 어느 규칙이 잡든 결과는 거부다.
  assert.throws(function () {
    validateExclusions([{
      pattern: '***************ZZZNOMATCH',
      reason: 'the exact pattern the security review measured at >8s per path',
      ticket: 'T-2',
    }]);
  }, RangeError);
});

test('exclusions: too many wildcards is refused even when not consecutive', () => {
  assert.throws(function () {
    validateExclusions([{
      pattern: 'a*b*c*d*e*f*g*h*i*j*k.test.js',
      reason: 'wildcard density probe',
      ticket: 'T-1',
    }]);
  }, /MAX_PATTERN_WILDCARDS/);
});

test('exclusions: an over-long pattern is refused', () => {
  assert.throws(function () {
    validateExclusions([{
      pattern: 'a/'.repeat(120) + 'x.test.js',
      reason: 'length probe',
      ticket: 'T-1',
    }]);
  }, /MAX_PATTERN_LENGTH/);
});

test('exclusions: legitimate patterns still pass — the bound must not cost expressiveness', () => {
  const ok = validateExclusions([
    { pattern: '**/*.test.js', reason: 'the blanket glob is still well-formed', ticket: 'T-1' },
    { pattern: 'plugins/mccp/scripts/**/tests/*.test.js', reason: 'a realistic scoped glob', ticket: 'T-2' },
    { pattern: 'a/one.test.js', reason: 'a literal path', ticket: 'T-3' },
  ]);
  assert.strictEqual(ok.length, 3);
});

test('exclusions: the ReDoS bound is enforced on the CONSUME path, not just the validator', () => {
  // DD7이 이 모듈을 소비 경로 위에 올린 것이 이 단언의 전제다. 러너와 게이트가
  // 둘 다 `loadExclusions`를 지나므로 상한이 두 경로 모두에서 실효를 갖는다.
  // 상한이 검증기에만 있고 소비 경로가 그것을 지나지 않으면 이 분기가 매달린다.
  const dir = tmpdir('redos');
  const p = writeJson(dir, 'redos.json', [{
    pattern: '***************ZZZNOMATCH',
    reason: 'catastrophic backtracking probe on the consume path',
    ticket: 'T-1',
  }]);
  const started = Date.now();
  const r = spawnSync(process.execPath, [
    path.join(REPO, 'scripts', 'test-suite', 'run.js'), '--list', '--exclude-from', p,
  ], { cwd: REPO, encoding: 'utf8', timeout: 20000 });
  const elapsed = Date.now() - started;
  assert.notStrictEqual(r.status, 0, 'the runner must refuse the pattern outright');
  assert.ok(elapsed < 15000, 'the runner must REFUSE rather than evaluate: took ' + elapsed + 'ms');
});

// ─────────────────────────────────────────────────────────────────────────────
// floor 값 타입 (2026-09-04 code-review — `null`이 래칫 축을 조용히 껐다)
// ─────────────────────────────────────────────────────────────────────────────

test('floor: null scalars are REFUSED — presence is not a value', () => {
  // 재현된 결함: `hasOwnProperty`가 `null`을 "존재"로 읽어 `floor_key_missing`을
  // 통과했고, 그러면 `coverage.js`의 두 조건(`if (o.floor != null)` ·
  // `if (maxExcluded != null)`)이 건너뛰어져 `below_floor`와 `excluded_over_cap`이
  // **사유 코드 없이** 사라진 채 게이트가 `blocked:false`를 냈다.
  const f = gateFixture();
  ['tracked', 'max_excluded_files', 'tracked_basis', 'max_allowed_deletions'].forEach(function (key) {
    const bad = {
      tracked_basis: 2, tracked: 1, max_excluded_files: 0,
      max_allowed_deletions: 0, allow_deletions: [],
    };
    bad[key] = null;
    const p = writeJson(f.repo.dir, 'floor-null-' + key + '.json', bad);
    const r = runCli(GATE_CLI, [
      '--measurement', f.files.measurement, '--exclude-from', f.files.exclusions,
      '--floor-from', p, '--json',
    ], f.repo.dir);
    assert.notStrictEqual(r.status, 0, 'null ' + key + ' must block');
    assert.ok(JSON.parse(r.stdout).reasons.includes('floor_value_type'),
      'null ' + key + ' must report floor_value_type, not slip through as present');
  });
});

test('floor: string scalars are REFUSED — coercion must not decide the verdict', () => {
  // `"0"`은 우연히 fail-closed로, `"999999"`는 반대 방향으로 접힌다. 판정이 타입에
  // 따라 갈리는 것 자체가 래칫의 근거를 무너뜨리므로 둘 다 거부한다.
  const f = gateFixture();
  [['tracked', '1'], ['max_excluded_files', '0'], ['tracked', '999999']].forEach(function (pair, i) {
    const bad = {
      tracked_basis: 2, tracked: 1, max_excluded_files: 0,
      max_allowed_deletions: 0, allow_deletions: [],
    };
    bad[pair[0]] = pair[1];
    const p = writeJson(f.repo.dir, 'floor-str-' + i + '.json', bad);
    const r = runCli(GATE_CLI, [
      '--measurement', f.files.measurement, '--exclude-from', f.files.exclusions,
      '--floor-from', p, '--json',
    ], f.repo.dir);
    assert.notStrictEqual(r.status, 0);
    assert.ok(JSON.parse(r.stdout).reasons.includes('floor_value_type'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 사유 코드 열거의 **양방향** 대조 (2026-09-04 code-review — 선언만 있고 소비 0건)
// ─────────────────────────────────────────────────────────────────────────────

test('reason codes: nothing is emitted outside the declared enumeration', () => {
  // 앞선 판본은 두 상수를 "닫힌 코드 열거"라 부르면서 아무 데서도 읽지 않았고,
  // 그래서 이미 불완전했다 — `judge()`가 `per_file_absent`를 냈다. 열거가 계약이려면
  // 방출을 실제로 재야 한다.
  const declared = new Set(JUDGE_REASONS.concat(INPUT_REASONS));

  // (1) 순수층 — stage 2가 커버리지 사유를 그대로 싣는 경로를 직접 친다.
  const probe = judge({
    measurement: { ok: true, exit_code: 0, redaction_ok: true, per_file: null },
    coverage: { tracked: ['a/x.test.js'], exclusions: [], floor: null },
    deletions: { base_resolved: false, missing: [], allowed: [] },
  });
  assert.deepStrictEqual(undeclaredReasons(probe.reasons), [],
    'judge() emitted a code outside the enumeration: ' + JSON.stringify(probe.reasons));

  // (2) CLI 층 — 입력 검증 사유가 나오는 대표 구성 넷.
  const f = gateFixture();
  const cases = [
    ['--measurement', 'nope.json', '--exclude-from', f.files.exclusions, '--floor-from', f.files.floor, '--json'],
    ['--measurement', f.files.measurement, '--exclude-from', 'nope.json', '--floor-from', f.files.floor, '--json'],
    ['--measurement', f.files.measurement, '--exclude-from', f.files.exclusions, '--json'],
    ['--measurement', f.files.measurement, '--measurement', f.files.measurement,
      '--exclude-from', f.files.exclusions, '--floor-from', f.files.floor, '--json'],
  ];
  cases.forEach(function (argv, i) {
    const r = runCli(GATE_CLI, argv, f.repo.dir);
    const parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed.reasons) && parsed.reasons.length > 0, 'case ' + i + ' must carry reasons');
    parsed.reasons.forEach(function (code) {
      assert.ok(declared.has(code), 'case ' + i + ' emitted undeclared code ' + code);
    });
    assert.strictEqual(parsed.reasons_undeclared, undefined,
      'case ' + i + ': the runtime consumer must find nothing undeclared');
  });
});

test('reason codes: no declared code is dead — every one appears in a producer', () => {
  // 반대 방향. 없으면 코드를 rename한 편집이 옛 이름을 목록에 남긴 채 통과하고,
  // 그때 열거는 "무엇이 나올 수 있는가"가 아니라 "한때 나왔던 것"의 기록이 된다.
  const sources = ['gate.js', 'coverage.js', 'inputs.js'].map(function (n) {
    return fs.readFileSync(path.join(REPO, 'scripts', 'test-suite', n), 'utf8');
  });
  JUDGE_REASONS.concat(INPUT_REASONS).forEach(function (code) {
    const hits = sources.reduce(function (n, src) {
      return n + (src.split("'" + code + "'").length - 1);
    }, 0);
    // 선언 1회는 자기 자신이므로 producer가 있으려면 2회 이상이어야 한다.
    assert.ok(hits >= 2, 'declared reason "' + code + '" has no producer — it is a dead entry');
  });
});
