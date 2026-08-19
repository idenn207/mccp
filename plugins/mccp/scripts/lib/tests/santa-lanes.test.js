'use strict';

// santa-evidence-diversity M1 — lanes oracle + CLI 배선 회귀 test.
//
// 이 파일이 지키는 것은 넷이다: DD2 배정 표 3행 전부 · 번들이 실릴 자리가 없다는
// 구조적 사실 · `--lane` 대조가 실제로 거부한다는 것 · `off` 실행의 stamp가 생략되지
// 않는다는 것. 마지막 셋은 전부 "고장이 M1 이전과 똑같아 보인다"는 이 축의 성질에서
// 나온다 — 조용한 실패를 잡는 단언이 없으면 이 기능은 있으나 마나다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const lanes = require('../santa/lanes');

const CLI = path.join(__dirname, '..', 'santa', 'cli.js');

// ── 파서 ─────────────────────────────────────────────────────────────────────

test('parseBlindLane: 3 값 + 미설정 default', () => {
  assert.strictEqual(lanes.parseBlindLane({}), 'a');
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: 'a' }), 'a');
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: 'b' }), 'b');
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: 'off' }), 'off');
});

test('parseBlindLane: 대소문자/공백 정규화', () => {
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: ' OFF ' }), 'off');
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: 'B' }), 'b');
});

test('parseBlindLane: 불량값은 발화 쪽(default a)으로 fail-open', () => {
  // default가 `off`였다면 오타 하나가 kill switch가 되고, 그 실행은 M1 이전과
  // 구별되지 않는다. 방향이 뒤집히면 이 단언이 먼저 붉어진다.
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: 'both' }), 'a');
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: 'yes' }), 'a');
  assert.strictEqual(lanes.parseBlindLane({ MCCP_SANTA_BLIND_LANE: '' }), 'a');
});

// ── 배정 (DD2 표 3행 전부) ───────────────────────────────────────────────────

test('assignLanes: DD2 표 3행 — a / b / off 전부', () => {
  assert.deepStrictEqual(lanes.assignLanes({ mode: 'a' }), { A: 'blind', B: 'bundled' });
  assert.deepStrictEqual(lanes.assignLanes({ mode: 'b' }), { A: 'bundled', B: 'blind' });
  assert.deepStrictEqual(lanes.assignLanes({ mode: 'off' }), { A: 'bundled', B: 'bundled' });
});

test('assignLanes: 불변식 — 어느 mode에서도 블라인드는 최대 1개', () => {
  // UI6("전원 블라인드 금지")을 값이 아니라 성질로 단언한다. 표에 행이 추가돼도
  // 이 단언이 그 행을 함께 검사한다.
  lanes.BLIND_LANE_VALUES.forEach((mode) => {
    const blind = lanes.blindIdsFrom(lanes.assignLanes({ mode }));
    assert.ok(blind.length <= 1, mode + ' assigned ' + blind.length + ' blind lanes');
    assert.strictEqual(blind.length, mode === 'off' ? 0 : 1);
  });
});

test('assignLanes: 모르는 id는 bundled로 떨어진다', () => {
  // 우연한 커버리지 충족 차단 — 모르는 id에 블라인드를 주면 stamp가 진짜 배정과
  // 구별되지 않는다.
  const out = lanes.assignLanes({ mode: 'a', ids: ['A', 'Z'] });
  assert.strictEqual(out.A, 'blind');
  assert.strictEqual(out.Z, 'bundled');
});

test('assignLanes: I5 회귀 — 출력 키 수 == 입력 리뷰어 수', () => {
  // 다양성은 증거 경로로만 확보한다(UI2). 이 함수가 리뷰어를 늘리면 즉시 붉어진다.
  assert.strictEqual(Object.keys(lanes.assignLanes({ mode: 'a', ids: ['A', 'B'] })).length, 2);
  assert.strictEqual(Object.keys(lanes.assignLanes({ mode: 'a', ids: ['A'] })).length, 1);
  assert.strictEqual(Object.keys(lanes.assignLanes({ mode: 'off' })).length, 2);
});

test('assignLanes: 어떤 입력에도 던지지 않는다 (전역 함수 규약)', () => {
  assert.doesNotThrow(() => lanes.assignLanes());
  assert.doesNotThrow(() => lanes.assignLanes(null));
  assert.doesNotThrow(() => lanes.assignLanes({ mode: 'nonsense', ids: 'not-an-array' }));
  // 열거 밖 mode는 default(a)와 같게 처리된다.
  assert.deepStrictEqual(lanes.assignLanes({ mode: 'nonsense' }), { A: 'blind', B: 'bundled' });
});

// ── 블라인드 프롬프트 (DD3 — 인자 부재로 누출 차단) ──────────────────────────

test('buildBlindPrompt: 파일 내용을 실을 인자가 없다 (인자 키 집합 단언)', () => {
  // 번들이 새는지 사후에 검사하는 대신 넣을 자리를 없앤다. 누군가 content/bundle
  // 인자를 추가하면 이 단언이 그 자리에서 붉어진다.
  const accepted = ['repoRoot', 'targetPaths', 'rubric'];
  const smuggled = lanes.buildBlindPrompt({
    repoRoot: '/repo',
    targetPaths: ['a.js'],
    rubric: 'r',
    // 아래 셋은 계약에 없는 키다 — 무시되어야 하고 본문에 나타나면 안 된다.
    fileContents: 'SECRET-BUNDLE-CONTENT',
    bundle: 'SECRET-BUNDLE-CONTENT',
    files: [{ path: 'a.js', content: 'SECRET-BUNDLE-CONTENT' }],
  });
  assert.ok(!smuggled.includes('SECRET-BUNDLE-CONTENT'),
    'buildBlindPrompt leaked a non-contract argument into the prompt');
  assert.deepStrictEqual(accepted, ['repoRoot', 'targetPaths', 'rubric']);
});

test('buildBlindPrompt: UI5 문구를 고정 포함한다', () => {
  const p = lanes.buildBlindPrompt({ repoRoot: '/repo', targetPaths: ['a.js'] });
  assert.ok(p.includes(lanes.DO_NOT_TRUST_NARRATIVE));
  assert.ok(p.includes('/repo'));
  assert.ok(p.includes('a.js'));
});

test('buildBlindPrompt: 절삭 시 그 사실을 본문에 명시한다', () => {
  // 조용한 절삭은 스코프를 거짓말하게 만든다 — 리뷰어가 목록을 전체로 읽는다.
  const many = Array.from({ length: lanes.MAX_TARGET_PATHS + 5 }, (_, i) => 'f' + i + '.js');
  const p = lanes.buildBlindPrompt({ repoRoot: '/repo', targetPaths: many });
  assert.ok(p.includes('TRUNCATED'), 'truncation happened without saying so');
  assert.ok(p.includes('5 further path'));
  assert.ok(p.includes('files under review: ' + many.length),
    'the full count must still be stated even when the list is cut');
});

test('buildBlindPrompt: 상한 이하에서는 절삭 고지가 없다', () => {
  const p = lanes.buildBlindPrompt({ repoRoot: '/repo', targetPaths: ['a.js', 'b.js'] });
  assert.ok(!p.includes('TRUNCATED'));
});

// ── 커버리지 집계 ────────────────────────────────────────────────────────────

test('laneCoverageFrom: blind 레코드/라운드를 센다', () => {
  const projection = {
    rounds: [
      { reviewers: [{ lane: 'blind' }, { lane: 'bundled' }] },
      { reviewers: [{ lane: 'blind' }, { lane: 'bundled' }] },
    ],
  };
  assert.deepStrictEqual(lanes.laneCoverageFrom(projection),
    { blindRecords: 2, blindRounds: 2, rounds: 2 });
});

test('laneCoverageFrom: 리뷰어는 있으나 blind 0건인 라운드는 blindRounds를 올리지 않는다', () => {
  // 이 규칙이 `santa_blind_rounds === santa_rounds`를 [primary] 지표의 기계적
  // 표현으로 만든다. 여기서 세면 off 실행도 만점으로 보인다.
  const projection = {
    rounds: [
      { reviewers: [{ lane: 'bundled' }, { lane: 'bundled' }] },
      { reviewers: [{ lane: 'blind' }, { lane: 'bundled' }] },
    ],
  };
  assert.deepStrictEqual(lanes.laneCoverageFrom(projection),
    { blindRecords: 1, blindRounds: 1, rounds: 2 });
});

test('laneCoverageFrom: legacy 투영(레인 부재)에서 0을 내고 던지지 않는다', () => {
  const legacy = { rounds: [{ reviewers: [{ id: 'A' }, { id: 'B', lane: null }] }] };
  assert.deepStrictEqual(lanes.laneCoverageFrom(legacy),
    { blindRecords: 0, blindRounds: 0, rounds: 1 });
});

test('laneCoverageFrom: 어떤 입력에도 던지지 않는다', () => {
  assert.doesNotThrow(() => lanes.laneCoverageFrom());
  assert.doesNotThrow(() => lanes.laneCoverageFrom(null));
  assert.doesNotThrow(() => lanes.laneCoverageFrom({ rounds: 'nope' }));
  assert.doesNotThrow(() => lanes.laneCoverageFrom({ rounds: [null, { reviewers: null }] }));
  assert.deepStrictEqual(lanes.laneCoverageFrom({}), { blindRecords: 0, blindRounds: 0, rounds: 0 });
});

// ── CLI 계약 ─────────────────────────────────────────────────────────────────

function repoFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'santa-lanes-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# fixture\n');
  return dir;
}

function runCli(dir, args, env) {
  const res = require('child_process').spawnSync(process.execPath, [CLI].concat(args), {
    cwd: dir, encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_SANTA_BLIND_LANE: undefined }, env || {}),
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

test('cmdLanes: 정상 입력에서 정확히 3키를 내고 배정이 DD2 표와 일치한다', () => {
  const dir = repoFixture();
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['CLAUDE.md', 'src/a.js']));
  const r = runCli(dir, ['lanes', '--decision', 'fixture', '--paths-file', pf]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepStrictEqual(Object.keys(j).sort(), ['assignment', 'blindId', 'prompt']);
  assert.deepStrictEqual(j.assignment, { A: 'blind', B: 'bundled' });
  assert.strictEqual(j.blindId, 'A');
  assert.ok(j.prompt.includes('CLAUDE.md') && j.prompt.includes('src/a.js'),
    'prompt must carry every target path handed in');
});

test('cmdLanes: off 모드는 blindId/prompt가 빈 문자열이다 (null 아님)', () => {
  // 셸이 문자열 비교를 하므로 타입이 갈리면 비교가 조용히 어긋난다.
  const dir = repoFixture();
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['CLAUDE.md']));
  const r = runCli(dir, ['lanes', '--decision', 'fixture', '--paths-file', pf],
    { MCCP_SANTA_BLIND_LANE: 'off' });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.blindId, '');
  assert.strictEqual(j.prompt, '');
  assert.deepStrictEqual(j.assignment, { A: 'bundled', B: 'bundled' });
});

test('cmdLanes: mode b는 B를 블라인드로 배정한다', () => {
  const dir = repoFixture();
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['CLAUDE.md']));
  const r = runCli(dir, ['lanes', '--decision', 'fixture', '--paths-file', pf],
    { MCCP_SANTA_BLIND_LANE: 'b' });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.blindId, 'B');
  assert.deepStrictEqual(j.assignment, { A: 'bundled', B: 'blind' });
});

test('cmdLanes: 실패 계약 — 각 경우 exit 2이고 stdout이 비어 있다', () => {
  // 부분 JSON을 내면 호출자가 절반짜리 배정으로 리뷰어를 띄운다.
  const dir = repoFixture();
  const empty = path.join(dir, 'empty.json');
  fs.writeFileSync(empty, JSON.stringify([]));
  const notJson = path.join(dir, 'bad.json');
  fs.writeFileSync(notJson, 'not json at all');
  const notArray = path.join(dir, 'obj.json');
  fs.writeFileSync(notArray, JSON.stringify({ a: 1 }));
  const notStrings = path.join(dir, 'nums.json');
  fs.writeFileSync(notStrings, JSON.stringify(['ok.js', 42]));

  const cases = [
    ['--paths-file 부재', ['lanes', '--decision', 'fixture']],
    ['빈 배열', ['lanes', '--decision', 'fixture', '--paths-file', empty]],
    ['파일 부재', ['lanes', '--decision', 'fixture', '--paths-file', path.join(dir, 'nope.json')]],
    ['비JSON', ['lanes', '--decision', 'fixture', '--paths-file', notJson]],
    ['비배열', ['lanes', '--decision', 'fixture', '--paths-file', notArray]],
    ['비문자열 원소', ['lanes', '--decision', 'fixture', '--paths-file', notStrings]],
  ];
  cases.forEach(([label, args]) => {
    const r = runCli(dir, args);
    assert.strictEqual(r.status, 2, label + ': expected exit 2, got ' + r.status);
    assert.strictEqual(r.stdout.trim(), '', label + ': stdout must be empty on failure');
  });
});

test('cmdLanes: --rubric-file은 프롬프트에 실린다', () => {
  const dir = repoFixture();
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['CLAUDE.md']));
  const rf = path.join(dir, 'rubric.md');
  fs.writeFileSync(rf, '- criterion: every export has a test');
  const r = runCli(dir, ['lanes', '--decision', 'fixture', '--paths-file', pf,
    '--rubric-file', rf]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.prompt.includes('every export has a test'));
});

// ── record --lane 대조 ───────────────────────────────────────────────────────

function reviewerFile(dir, name) {
  const f = path.join(dir, name);
  fs.writeFileSync(f, JSON.stringify({ verdict: 'PASS', checks: [], critical_issues: [] }));
  return f;
}

test('record: --lane 부재는 exit 2', () => {
  const dir = repoFixture();
  const rf = reviewerFile(dir, 'rev.json');
  const r = runCli(dir, ['record', '--decision', 'fixture', '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', rf]);
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /--lane/);
});

test('record: 배정과 불일치하는 --lane은 exit 2', () => {
  // mode a에서 A는 blind인데 bundled로 선언하면 거부된다. 이것이 막는 것은
  // 커맨드 본문이 oracle을 거치지 않고 레인을 즉흥적으로 정하는 경로다.
  const dir = repoFixture();
  const rf = reviewerFile(dir, 'rev.json');
  const r = runCli(dir, ['record', '--decision', 'fixture', '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', rf, '--lane', 'bundled']);
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /SANTA_LANE_MISMATCH|assigns blind/);
});

test('record: 열거 밖 --lane 값은 exit 2', () => {
  const dir = repoFixture();
  const rf = reviewerFile(dir, 'rev.json');
  const r = runCli(dir, ['record', '--decision', 'fixture', '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', rf, '--lane', 'sneaky']);
  assert.strictEqual(r.status, 2, r.stderr);
});
