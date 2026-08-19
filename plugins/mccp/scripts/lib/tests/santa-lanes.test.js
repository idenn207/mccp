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
    // M2: 상시 스코프 토글도 주변 env에서 끊는다. 두 축 모두 default가 발화 쪽이라
    // 주변 셸이 켜 두면 test가 그 값을 물려받아 비결정적이 된다.
    env: Object.assign({}, process.env,
      { MCCP_SANTA_BLIND_LANE: undefined, MCCP_SANTA_ALWAYS_SCOPE: undefined }, env || {}),
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

// ═══════════════════════════════════════════════════════════════════════════════
// santa-evidence-diversity M2 — 상시 스코프 oracle + `scope-always` CLI.
//
// 이 블록이 지키는 것: env 방향(발화가 default) · Source PRD 추출의 **보안 경계**
// (문자열 단계 이탈 거부) · 병합의 순서/중복/절삭 · 고정 rubric 문구 · CLI 7키 계약 ·
// 그리고 #125 회귀(관계의 한쪽만 스코프에 드는 일이 없다).
// ═══════════════════════════════════════════════════════════════════════════════

const scopeAlways = require('../santa/scope-always');

// ── env 파서 ─────────────────────────────────────────────────────────────────

test('parseAlwaysScope: 2 값 + 미설정 default', () => {
  assert.strictEqual(scopeAlways.parseAlwaysScope({}), 'enforce');
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: 'enforce' }), 'enforce');
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: 'off' }), 'off');
});

test('parseAlwaysScope: 대소문자/공백 정규화', () => {
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: ' OFF ' }), 'off');
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: 'Enforce' }), 'enforce');
});

test('parseAlwaysScope: 불량값은 발화 쪽(default enforce)으로 fail-open', () => {
  // DD8. default가 `off`였다면 오타 하나가 kill switch를 켜고 그 실행은 M2 이전과
  // 구별되지 않는다 — 방향이 뒤집히면 이 단언이 먼저 붉어진다.
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: 'on' }), 'enforce');
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: 'yes' }), 'enforce');
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: '' }), 'enforce');
  assert.strictEqual(scopeAlways.parseAlwaysScope({ MCCP_SANTA_ALWAYS_SCOPE: null }), 'enforce');
});

// ── Source PRD 추출 ──────────────────────────────────────────────────────────

test('sourcePrdFrom: 백틱 평문 형태', () => {
  const t = '# Plan\n\n**Source PRD**: `.claude/prds/x.prd.md`\n';
  assert.strictEqual(scopeAlways.sourcePrdFrom(t, { planPath: '.claude/plans/a.plan.md' }),
    '.claude/prds/x.prd.md');
});

test('sourcePrdFrom: 마크다운 링크 형태 — plan 상대경로를 repo 상대로 환원한다', () => {
  const t = '**Source PRD**: [x](../prds/x.prd.md)\n';
  assert.strictEqual(scopeAlways.sourcePrdFrom(t, { planPath: '.claude/plans/a.plan.md' }),
    '.claude/prds/x.prd.md');
});

test('sourcePrdFrom: 링크 형태가 평문보다 우선한다', () => {
  const t = '**Source PRD**: [label](.claude/prds/link.prd.md)\n';
  assert.strictEqual(scopeAlways.sourcePrdFrom(t, { planPath: '.claude/plans/a.plan.md' }),
    '.claude/prds/link.prd.md');
});

test('sourcePrdFrom: 미선언 · free-form 표기 · 비문자열은 null (던지지 않는다)', () => {
  // free-form plan은 정상 입력이다(DD4). 여기서 던지면 드롭이 라운드를 막는다.
  assert.strictEqual(scopeAlways.sourcePrdFrom('# Plan\n\nno declaration\n', {}), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: (없음 — free-form 입력)\n', {}), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom(null, {}), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom(123, {}), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom('', {}), null);
});

test('sourcePrdFrom: 보안 경계 — 정규화 후 저장소를 벗어나는 형태는 전부 null', () => {
  // implement-gate security review CRITICAL 1. `sourcePrdFrom`은 fs를 모르는 순수
  // 함수라 realpath로 방어할 수 없고, `path.posix.normalize('../../etc/x')`는 그대로
  // `../../etc/x`이므로 정규화만으로는 아무것도 막히지 않는다. 도달했을 때의 폭발
  // 반경은 "임의 파일 내용이 블라인드 리뷰어 프롬프트에 실린다"이다.
  const P = { planPath: '.claude/plans/a.plan.md' };
  // 1) 상위 이탈 — 직접 표기와 접힌 뒤에야 드러나는 형태 둘 다
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: `../../../../etc/passwd.prd.md`\n', P), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: [x](../../../../../../etc/passwd.prd.md)\n', P), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: `a/../../../etc/passwd.prd.md`\n', P), null);
  // 2) 절대경로 3형태 — posix 루트 · UNC · 드라이브 문자
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: `/etc/passwd.prd.md`\n', P), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: `\\\\host\\share\\x.prd.md`\n', P), null);
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: `C:/Windows/x.prd.md`\n', P), null);
  // 3) NUL — 파일시스템 계층에서 절단을 일으킬 수 있고 경로 성분으로 정당한 쓰임이 없다
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: `.claude/prds/x.prd.md\u0000.txt`\n', P), null);
});

test('sourcePrdFrom: plan 상대 표기인데 planPath가 없으면 null (추측하지 않는다)', () => {
  // 기준점 없이 저장소 루트로 추측하면 존재하지 않는 포인터를 만들어 낸다.
  assert.strictEqual(scopeAlways.sourcePrdFrom('**Source PRD**: [x](../prds/x.prd.md)\n', {}), null);
});

// ── 병합 ─────────────────────────────────────────────────────────────────────

test('mergeScope: diff 순서 보존 + 상시 항목은 뒤에 append', () => {
  const r = scopeAlways.mergeScope({
    diffPaths: ['src/b.js', 'src/a.js'],
    alwaysPaths: ['.claude/plans/x.plan.md'],
  });
  assert.deepStrictEqual(r.paths, ['src/b.js', 'src/a.js', '.claude/plans/x.plan.md']);
  assert.deepStrictEqual(r.added, ['.claude/plans/x.plan.md']);
  assert.strictEqual(r.truncated, 0);
});

test('mergeScope: 이미 diff에 있는 상시 항목은 added에 들어가지 않는다', () => {
  const r = scopeAlways.mergeScope({
    diffPaths: ['.claude/plans/x.plan.md', 'src/a.js'],
    alwaysPaths: ['./.claude/plans/x.plan.md', '.claude\\plans\\x.plan.md'],
  });
  assert.deepStrictEqual(r.paths, ['.claude/plans/x.plan.md', 'src/a.js']);
  assert.deepStrictEqual(r.added, []);
});

test('mergeScope: 상한 초과를 조용히 자르지 않는다 (truncated 수를 낸다)', () => {
  const many = [];
  for (let i = 0; i < scopeAlways.MAX_ALWAYS_PATHS + 5; i += 1) many.push('.claude/plans/p' + i + '.plan.md');
  const r = scopeAlways.mergeScope({ diffPaths: ['src/a.js'], alwaysPaths: many });
  assert.strictEqual(r.added.length, scopeAlways.MAX_ALWAYS_PATHS);
  assert.strictEqual(r.truncated, 5);
  assert.strictEqual(r.paths.length, 1 + scopeAlways.MAX_ALWAYS_PATHS);
});

test('mergeScope: 이탈 형태는 어느 쪽 입력에서도 스코프에 들어가지 않는다', () => {
  const r = scopeAlways.mergeScope({
    diffPaths: ['../outside.js', '/etc/passwd', 'src/a.js'],
    alwaysPaths: ['../../x.prd.md'],
  });
  assert.deepStrictEqual(r.paths, ['src/a.js']);
  assert.deepStrictEqual(r.added, []);
});

test('mergeScope: 드롭도 조용히 하지 않는다 — 원본 문자열을 dropped로 낸다', () => {
  // code-review M4. 변경된 파일이 검토 대상에서 빠지는 것은 절삭보다 나쁘고, 예전에는
  // 그 일이 아무 신호 없이 일어났다. 중복으로 사라진 것은 담지 않는다 — 손실이 아니다.
  const r = scopeAlways.mergeScope({
    diffPaths: ['../outside.js', '/etc/passwd', 'src/a.js', 'src/a.js'],
    alwaysPaths: ['../../x.prd.md'],
  });
  assert.deepStrictEqual(r.dropped, ['../outside.js', '/etc/passwd', '../../x.prd.md']);
  assert.deepStrictEqual(r.paths, ['src/a.js']);
});

test('mergeScope: 정상 입력의 dropped는 빈 배열이다 (키는 항상 존재한다)', () => {
  const r = scopeAlways.mergeScope({ diffPaths: ['src/a.js'], alwaysPaths: ['p.plan.md'] });
  assert.deepStrictEqual(r.dropped, []);
});

test('toRepoRelative: export돼 있고 CLI가 쓰는 정규화 규칙 그 자체다', () => {
  // code-review L2 — 발견 단계가 같은 함수를 쓰지 않으면 `pairs`와 `paths`의 표기가 갈린다.
  assert.strictEqual(typeof scopeAlways.toRepoRelative, 'function');
  assert.strictEqual(scopeAlways.toRepoRelative('./a/b.md'), 'a/b.md');
  assert.strictEqual(scopeAlways.toRepoRelative('a\\b.md'), 'a/b.md');
  assert.strictEqual(scopeAlways.toRepoRelative('../a.md'), null);
  assert.strictEqual(scopeAlways.toRepoRelative('/a.md'), null);
  assert.strictEqual(scopeAlways.toRepoRelative('C:/a.md'), null);
});

test('mergeScope: 어떤 입력에도 던지지 않는다 (전역 함수 규약)', () => {
  [undefined, null, {}, { diffPaths: 'x' }, { alwaysPaths: 5 }, { diffPaths: [1, null] }]
    .forEach((bad) => { assert.doesNotThrow(() => scopeAlways.mergeScope(bad)); });
});

// ── 고정 rubric ──────────────────────────────────────────────────────────────

test('CONSISTENCY_RUBRIC: 고정 문자열이고 UI4/UI5 핵심 어구를 포함한다', () => {
  // 문구가 호출마다 흔들리면 "무엇을 지시했는가"가 사후 재현 불가가 된다
  // (`DO_NOT_TRUST_NARRATIVE`와 같은 취급). 여기서 pin하는 것은 어구이지 전문이
  // 아니다 — 전문을 통째로 복사하면 이 단언이 오탈자 검사가 된다.
  const r = scopeAlways.CONSISTENCY_RUBRIC;
  assert.strictEqual(typeof r, 'string');
  assert.ok(r.length > 100);
  assert.match(r, /working tree/);                // UI4 — 지금 워킹트리의 PRD와 대조
  assert.match(r, /milestone/);                   // UI5 — 마일스톤 식별자/수
  assert.match(r, /CRITICAL/);                    // UI5 — 불일치는 즉시 NAUGHTY
  assert.match(r, /locations/);                   // UI5 — 두 파일을 모두 적는다
  assert.match(r, /Do NOT rely on any summary/);  // plan의 PRD 요약을 근거로 삼지 말 것
});

// ── CLI 계약 ─────────────────────────────────────────────────────────────────

// plan/PRD 쌍을 갖춘 fixture. 두 파일이 서로 다른 마일스톤 수를 단언하게 둘 수 있어야
// #125 시나리오가 만들어진다.
function planPrdFixture(dir, slug, planMilestones, prdMilestones) {
  fs.mkdirSync(path.join(dir, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'prds'), { recursive: true });
  const prdRel = '.claude/prds/' + slug + '.prd.md';
  fs.writeFileSync(path.join(dir, '.claude', 'plans', slug + '.plan.md'),
    '# Plan: ' + slug + '\n\n**Source PRD**: `' + prdRel + '`\n\n'
    + 'This plan asserts the PRD has ' + planMilestones + ' milestones.\n');
  const rows = [];
  for (let i = 1; i <= prdMilestones; i += 1) rows.push('| ' + i + ' | m' + i + ' | pending |');
  fs.writeFileSync(path.join(dir, '.claude', 'prds', slug + '.prd.md'),
    '# PRD: ' + slug + '\n\n' + rows.join('\n') + '\n');
  return { planRel: '.claude/plans/' + slug + '.plan.md', prdRel: prdRel };
}

test('cmdScopeAlways: --paths-file 부재는 exit 2이고 stdout이 비어 있다', () => {
  const dir = repoFixture();
  const r = runCli(dir, ['scope-always', '--decision', 'fixture']);
  assert.strictEqual(r.status, 2);
  assert.strictEqual(r.stdout, '');
  assert.match(r.stderr, /--paths-file/);
});

test('cmdScopeAlways: repo 밖 --paths-file은 거부된다', () => {
  const dir = repoFixture();
  const outside = path.join(os.tmpdir(), 'santa-outside-' + process.pid + '.json');
  fs.writeFileSync(outside, JSON.stringify(['a.js']));
  const r = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', outside]);
  assert.strictEqual(r.status, 2);
  assert.strictEqual(r.stdout, '');
});

test('cmdScopeAlways: 정상 입력에서 정확히 7키를 낸다', () => {
  const dir = repoFixture();
  const fx = planPrdFixture(dir, 'fixture', 4, 4);
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['src/a.js']));
  const r = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', pf]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepStrictEqual(Object.keys(j).sort(),
    ['added', 'mode', 'pairs', 'paths', 'rubricRow', 'truncated', 'unresolved']);
  assert.strictEqual(j.mode, 'enforce');
  assert.deepStrictEqual(j.pairs, [{ plan: fx.planRel, prd: fx.prdRel }]);
  assert.strictEqual(j.rubricRow, scopeAlways.CONSISTENCY_RUBRIC);
});

test('cmdScopeAlways: off는 diff 스코프를 그대로 통과시키고 plan을 열지 않는다', () => {
  // "디스크 미접촉"을 관측 가능한 결과로 단언한다: enforce였다면 반드시 잡혔을
  // plan/PRD 쌍이 하나도 나타나지 않는다. rubricRow까지 함께 비는 것이 DD5의
  // "한 축이므로 스위치도 하나"다.
  const dir = repoFixture();
  planPrdFixture(dir, 'fixture', 4, 7);
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['src/a.js', 'src/b.js']));
  const r = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', pf],
    { MCCP_SANTA_ALWAYS_SCOPE: 'off' });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.mode, 'off');
  assert.deepStrictEqual(j.paths, ['src/a.js', 'src/b.js']);
  assert.deepStrictEqual(j.added, []);
  assert.deepStrictEqual(j.pairs, []);
  assert.deepStrictEqual(j.unresolved, []);
  assert.strictEqual(j.rubricRow, '');
  assert.strictEqual(j.truncated, 0);
});

test('cmdScopeAlways: off도 diff 스코프를 enforce와 같은 규칙으로 정규화한다', () => {
  // code-review M4. 예전에는 `off`가 diffPaths를 날것으로 통과시켜, 이탈 형태를 접는
  // enforce와 서로 다른 스코프를 냈다 — kill switch가 *무엇이 검토되는가*를 아무도
  // 선언하지 않은 방향으로 바꾸는 셈이다. 두 모드의 차이는 상시 항목 하나여야 한다.
  const dir = repoFixture();
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['./src/a.js', '../outside.js', 'src\\b.js']));
  const off = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', pf],
    { MCCP_SANTA_ALWAYS_SCOPE: 'off' });
  const on = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', pf]);
  assert.strictEqual(off.status, 0, off.stderr);
  assert.strictEqual(on.status, 0, on.stderr);
  const jOff = JSON.parse(off.stdout);
  const jOn = JSON.parse(on.stdout);
  assert.deepStrictEqual(jOff.paths, ['src/a.js', 'src/b.js']);
  assert.deepStrictEqual(jOn.paths, jOff.paths, 'no plan exists, so the two modes must agree');
  // 드롭은 stdout 계약(7키)이 아니라 stderr로 표면화된다.
  assert.deepStrictEqual(Object.keys(jOff).sort(),
    ['added', 'mode', 'pairs', 'paths', 'rubricRow', 'truncated', 'unresolved']);
  [off, on].forEach((r) => { assert.match(r.stderr, /dropped 1 path\(s\)/); });
});

test('cmdScopeAlways: 후보 상한이 경로 상한의 절반이라 pairs가 스코프 밖을 가리키지 않는다', () => {
  // code-review M2. 후보 1개가 경로 2개를 내므로 두 상한이 같으면 절삭이 일어나고,
  // `pairs`에는 있는데 `paths`에는 없는 쌍이 생긴다 — rubric은 "target paths에 열거된
  // 쌍"을 대조하라 지시하므로 그 쌍은 검토되지 않은 채 개수만 보고된다.
  const dir = repoFixture();
  const N = scopeAlways.MAX_ALWAYS_PATHS + 5;
  for (let i = 0; i < N; i += 1) planPrdFixture(dir, 'fixture-' + String(i).padStart(3, '0'), 1, 1);
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['src/a.js']));
  const r = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', pf]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.truncated, 0, 'the candidate cap must make merge truncation unreachable');
  const inScope = new Set(j.paths);
  j.pairs.forEach((p) => {
    assert.ok(inScope.has(p.plan), 'pair plan must be in scope: ' + p.plan);
    assert.ok(inScope.has(p.prd), 'pair PRD must be in scope: ' + p.prd);
  });
  // 상한에 걸린 후보는 조용히 사라지지 않는다.
  assert.ok(j.unresolved.some((u) => /candidate cap reached/.test(u.reason)),
    'candidates beyond the cap must be named in unresolved');
});

test('cmdScopeAlways: 해소 불가 Source PRD는 unresolved로 가고 paths에는 없다', () => {
  // DD4 — 드롭하되 조용히 하지 않는다. 존재하지 않는 경로를 스코프에 넣으면
  // 블라인드 리뷰어에게 깨진 포인터를 주게 된다(PRD Risk 1).
  const dir = repoFixture();
  fs.mkdirSync(path.join(dir, '.claude', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'plans', 'fixture.plan.md'),
    '# Plan\n\n**Source PRD**: `.claude/prds/gone.prd.md`\n');
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['src/a.js']));
  const r = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', pf]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepStrictEqual(j.pairs, []);
  assert.strictEqual(j.unresolved.length, 1);
  assert.strictEqual(j.unresolved[0].prd, '.claude/prds/gone.prd.md');
  assert.ok(!j.paths.includes('.claude/prds/gone.prd.md'),
    'an unresolvable pointer must never reach the scope handed to a reviewer');
  // plan 자체는 해소됐으므로 스코프에 남는다 — free-form plan도 검토 대상이다.
  assert.ok(j.paths.includes('.claude/plans/fixture.plan.md'));
});

test('cmdScopeAlways: 선언이 저장소를 벗어나면 스코프에도 pairs에도 들어가지 않는다', () => {
  const dir = repoFixture();
  fs.mkdirSync(path.join(dir, '.claude', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'plans', 'fixture.plan.md'),
    '# Plan\n\n**Source PRD**: `../../../../etc/passwd.prd.md`\n');
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['src/a.js']));
  const r = runCli(dir, ['scope-always', '--decision', 'fixture', '--paths-file', pf]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepStrictEqual(j.pairs, []);
  assert.ok(j.paths.every((p) => p.indexOf('passwd') === -1));
  assert.ok(j.paths.every((p) => p.indexOf('..') === -1));
});

test('#125 회귀: diff에 없는 plan·PRD가 상시 스코프로 들어온다 (스코프이지 포착이 아니다)', () => {
  // **이 test가 증명하는 것은 스코프이지 포착이 아니다.** 리뷰어가 "plan은 4개라
  // 하는데 PRD는 7개"라는 불일치를 실제로 잡는지는 LLM 행위라 셸로 단언할 대상이
  // 없다. 여기서 닫는 것은 그 앞 단계 — 관계의 한쪽만 스코프에 드는 구조적 불가능
  // 상태다. #125는 정확히 그 상태에서 12라운드를 돌고도 결함을 못 찾았다.
  const dir = repoFixture();
  const fx = planPrdFixture(dir, 'fx-m2', 4, 7);
  const pf = path.join(dir, 'paths.json');
  // diff 스코프에는 코드 파일만 있다 — plan도 PRD도 없다.
  fs.writeFileSync(pf, JSON.stringify(['src/unrelated.js']));
  const r = runCli(dir, ['scope-always', '--decision', 'fx-m2', '--paths-file', pf]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.added.includes(fx.planRel), 'plan must enter scope regardless of the diff');
  assert.ok(j.added.includes(fx.prdRel), 'its declared Source PRD must enter with it');
  assert.deepStrictEqual(j.pairs, [{ plan: fx.planRel, prd: fx.prdRel }]);
  assert.strictEqual(j.paths[0], 'src/unrelated.js', 'diff order is preserved ahead of additions');
});

test('#125 회귀: 상시 경로가 실제로 블라인드 프롬프트 본문에 실린다', () => {
  // 스코프에 넣는 것과 리뷰어에게 전달되는 것은 다른 사실이다. 이 단언이 그 이음매다
  // (Acceptance의 최소 조건 — `lanes`가 낸 프롬프트 본문에 두 경로가 있을 것).
  const dir = repoFixture();
  const fx = planPrdFixture(dir, 'fx-m2', 4, 7);
  const pf = path.join(dir, 'paths.json');
  fs.writeFileSync(pf, JSON.stringify(['src/unrelated.js']));
  const s = runCli(dir, ['scope-always', '--decision', 'fx-m2', '--paths-file', pf]);
  assert.strictEqual(s.status, 0, s.stderr);
  const merged = JSON.parse(s.stdout);

  const lanePf = path.join(dir, 'lane-paths.json');
  fs.writeFileSync(lanePf, JSON.stringify(merged.paths));
  const rubricFile = path.join(dir, 'rubric.md');
  fs.writeFileSync(rubricFile, '| Plan/PRD consistency | ' + merged.rubricRow + ' |');
  const l = runCli(dir, ['lanes', '--decision', 'fx-m2', '--paths-file', lanePf,
    '--rubric-file', rubricFile]);
  assert.strictEqual(l.status, 0, l.stderr);
  const prompt = JSON.parse(l.stdout).prompt;
  assert.ok(prompt.includes(fx.planRel), 'blind prompt must name the plan');
  assert.ok(prompt.includes(fx.prdRel), 'blind prompt must name the Source PRD');
  assert.ok(prompt.includes('## Rubric'), 'the rubric section must reach the blind lane');
  assert.ok(prompt.includes('working tree'), 'the consistency row must reach the blind lane');
});

// ═══════════════════════════════════════════════════════════════════════════════
// santa-evidence-diversity M3 — 모델 계열 degrade.
//
// 소유권 표가 degrade 강등 회귀를 이 파일에 배정했다. 지키는 것은 넷이다:
// DD3의 판정 2줄과 그 **순서** · 다중매치가 계열을 사지 못한다는 것 ·
// `deriveVerdict`의 우선순위(divergent > degraded > converged) ·
// 미설치 CLI 계열 선언이 라운드를 열지 못한다는 것.
// ═══════════════════════════════════════════════════════════════════════════════

const md = require('../santa/model-diversity');
const seal = require('../santa/seal');

// ── familyOf ─────────────────────────────────────────────────────────────────

test('M3 familyOf: 4계열 대표값', () => {
  assert.strictEqual(md.familyOf('opus'), 'anthropic');
  assert.strictEqual(md.familyOf('claude-opus-5'), 'anthropic');
  assert.strictEqual(md.familyOf('gpt-5.4'), 'openai');
  assert.strictEqual(md.familyOf('gemini-2.5-pro'), 'google');
  assert.strictEqual(md.familyOf('llama-3-70b'), 'unknown');
});

test('M3 familyOf: 대소문자/공백 정규화', () => {
  assert.strictEqual(md.familyOf('  OPUS  '), 'anthropic');
  assert.strictEqual(md.familyOf('GPT-5.4'), 'openai');
});

test('M3 familyOf: 비문자열·빈 문자열은 unknown이고 코어션을 하지 않는다', () => {
  // `String(model)`을 먼저 부르면 아래 toString이 계열을 산다. 그 입력은 `--model`
  // 검사를 거치지 않는 경로 — `seal.project()`가 원장에서 읽어 넘기는 `e.model` — 로
  // 도달 가능하다(security-reviewer F4).
  [null, undefined, 42, '', '   ', [], {}].forEach((v) => {
    assert.strictEqual(md.familyOf(v), 'unknown', JSON.stringify(v) + ' must fold to unknown');
  });
  assert.strictEqual(md.familyOf({ toString() { return 'gpt-5.4'; } }), 'unknown',
    'toString()이 호출되면 임의 객체가 계열을 산다');
});

test('M3 familyOf: 두 카탈로그에 동시에 걸리면 unknown이다 (precedence 아님)', () => {
  // precedence 표를 두면 `claude-gpt-bridge`가 *어떤 계열이든 하나*를 얻고, 그 하나가
  // 상대 리뷰어와 다르면 곧바로 이종 판정을 산다. DD3의 원칙은 "모르겠다가 승인을 사지
  // 못하게 한다"이고 동시에 걸리는 문자열은 모르는 것이다(security-reviewer F1).
  assert.strictEqual(md.familyOf('claude-gpt-bridge'), 'unknown');
  assert.strictEqual(md.familyOf('gemini-codex-hybrid'), 'unknown');
  assert.strictEqual(md.familyOf('opus-google-tuned'), 'unknown');
});

// ── env 파서 ─────────────────────────────────────────────────────────────────

test('M3 parseDegradeGate: 미설정·불량값은 발화 쪽(enforce)으로 fail-open', () => {
  assert.strictEqual(md.parseDegradeGate({}), 'enforce');
  assert.strictEqual(md.parseDegradeGate({ MCCP_SANTA_DEGRADE_GATE: '' }), 'enforce');
  assert.strictEqual(md.parseDegradeGate({ MCCP_SANTA_DEGRADE_GATE: 'yes' }), 'enforce');
  assert.strictEqual(md.parseDegradeGate({ MCCP_SANTA_DEGRADE_GATE: ' OFF ' }), 'off');
  assert.strictEqual(md.parseDegradeGate({ MCCP_SANTA_DEGRADE_GATE: 'enforce' }), 'enforce');
});

test('M3 parseDegradeAck: strict validateReason에 위임하고 부재와 거부를 구분한다', () => {
  const absent = md.parseDegradeAck({});
  assert.strictEqual(absent.ok, false);
  assert.strictEqual(absent.rejectedBecause, 'absent');

  const short = md.parseDegradeAck({ MCCP_SANTA_DEGRADE_ACK: 'no' });
  assert.strictEqual(short.ok, false);
  assert.notStrictEqual(short.rejectedBecause, 'absent',
    '거부와 부재가 같은 사유를 내면 호출자가 다른 안내를 할 수 없다');

  const good = md.parseDegradeAck({
    MCCP_SANTA_DEGRADE_ACK: 'codex is not installed on this build machine so reviewer B fell back',
  });
  assert.strictEqual(good.ok, true);
  assert.match(good.reason, /codex is not installed/);
});

// ── diversityFrom ────────────────────────────────────────────────────────────

const projOf = (models) => ({
  rounds: [{
    index: 0,
    verdict: 'NICE',
    reviewers: models.map((m, i) => ({ id: 'AB'[i], model: m })),
  }],
});

test('M3 diversityFrom: 이종 2계열은 degraded가 아니다', () => {
  const d = md.diversityFrom(projOf(['opus', 'gpt-5.4']));
  assert.strictEqual(d.degraded, false);
  assert.strictEqual(d.reason, null);
  assert.strictEqual(d.distinctFamilies, 2);
});

test('M3 diversityFrom: 동일 계열 2인은 same_family', () => {
  const d = md.diversityFrom(projOf(['opus', 'claude-opus-5']));
  assert.strictEqual(d.degraded, true);
  assert.strictEqual(d.reason, 'same_family');
  assert.strictEqual(d.distinctFamilies, 1);
});

test('M3 diversityFrom: unknown은 same_family보다 우선한다 (DD3의 순서)', () => {
  // 반대로 두면 오탈자 하나나 신규 모델명 하나가 곧바로 이종 판정을 얻는다 — 닫으려는
  // 결함을 이름만 바꿔 되살리는 것이다.
  const d = md.diversityFrom(projOf(['opus', 'llama-3']));
  assert.strictEqual(d.reason, 'unknown_model',
    'unknown이 섞이면 distinct=1이어도 same_family가 아니라 unknown_model이다');
  assert.strictEqual(d.unknownCount, 1);
});

test('M3 diversityFrom: 라운드 0건·legacy 투영은 던지지 않고 unknown_model로 접힌다', () => {
  const empty = md.diversityFrom({ rounds: [] });
  assert.strictEqual(empty.degraded, true);
  assert.strictEqual(empty.reason, 'unknown_model');
  assert.strictEqual(empty.finalIndex, null);

  const legacy = md.diversityFrom({ rounds: [{ index: 0, reviewers: [{ id: 'A' }, { id: 'B' }] }] });
  assert.strictEqual(legacy.degraded, true);
  assert.strictEqual(legacy.reason, 'unknown_model');

  // 전역 함수 규약 — 어떤 입력에도 던지지 않는다.
  [null, undefined, 42, 'x', [], {}].forEach((v) => {
    assert.doesNotThrow(() => md.diversityFrom(v), JSON.stringify(v));
  });
});

test('M3 diversityFrom: FINAL 라운드 하나만 본다', () => {
  // `deriveVerdict`가 같은 라운드에서 판정하므로 두 함수가 다른 라운드를 보면 봉인이
  // 자기모순이 된다.
  const d = md.diversityFrom({
    rounds: [
      { index: 0, reviewers: [{ id: 'A', model: 'opus' }, { id: 'B', model: 'opus' }] },
      { index: 1, reviewers: [{ id: 'A', model: 'opus' }, { id: 'B', model: 'gpt-5.4' }] },
    ],
  });
  assert.strictEqual(d.finalIndex, 1);
  assert.strictEqual(d.degraded, false, '중간 라운드의 동일 계열이 최종 판정을 오염시킨다');
});

// ── deriveVerdict 우선순위 ───────────────────────────────────────────────────

const m3Round = (verdict, models) => ({
  rounds: [{
    index: 0,
    verdict: verdict,
    reviewers: models.map((m, i) => ({ id: 'AB'[i], model: m })),
  }],
});

test('M3 deriveVerdict: NICE + 이종 → converged', () => {
  assert.strictEqual(seal.deriveVerdict(m3Round('NICE', ['opus', 'gpt-5.4']), { env: {} }),
    'converged');
});

test('M3 deriveVerdict: NICE + 동일 계열 → degraded', () => {
  assert.strictEqual(seal.deriveVerdict(m3Round('NICE', ['opus', 'opus']), { env: {} }),
    'degraded');
});

test('M3 deriveVerdict: NAUGHTY + 동일 계열 → divergent (degraded가 아니다)', () => {
  // 우선순위 divergent > degraded > converged. 뒤집으면 비수렴 라운드가 degraded가 되고,
  // degraded에는 ack라는 사람 승인 경로가 있으므로 그 뒤집기는 **비수렴 라운드에 push
  // 경로를 여는 것**이 된다.
  assert.strictEqual(seal.deriveVerdict(m3Round('NAUGHTY', ['opus', 'opus']), { env: {} }),
    'divergent');
});

test('M3 deriveVerdict: distinct id 1 + 이종 → divergent', () => {
  const p = {
    rounds: [{
      index: 0,
      verdict: 'NICE',
      reviewers: [{ id: 'A', model: 'opus' }, { id: 'A', model: 'gpt-5.4' }],
    }],
  };
  assert.strictEqual(seal.deriveVerdict(p, { env: {} }), 'divergent');
});

test('M3 deriveVerdict: GATE=off는 강등만 끈다', () => {
  assert.strictEqual(
    seal.deriveVerdict(m3Round('NICE', ['opus', 'opus']),
      { env: { MCCP_SANTA_DEGRADE_GATE: 'off' } }),
    'converged');
  // 그러나 관측은 그대로다 — `off` 실행이 M3 이전 실행과 구분되지 않으면 그것이
  // 정확히 이 milestone이 닫으려는 결함의 모양이다(DD4). 봉인 쪽 회귀는
  // santa-seal/santa-review-gate가 맡고 여기서는 파생이 gate와 무관함만 본다.
  assert.strictEqual(md.diversityFrom(m3Round('NICE', ['opus', 'opus'])).degraded, true);
});

// ── CLI record — 미설치 CLI 계열 선언 거부 ───────────────────────────────────

test('M3 record: 미설치 CLI 계열 선언은 exit 2이고 라운드가 열린 채 남는다', () => {
  // `gemini`는 이 저장소의 개발 머신에 설치돼 있지 않다. 설치된 머신에서도 결정적이게
  // 하려고 PATH를 좁히지는 않는다 — `gitRepoRoot`가 `git`을 spawn하므로 PATH를 비우면
  // 이 test가 다른 이유로 실패한다.
  const dir = repoFixture();
  const rf = reviewerFile(dir, 'rev.json');
  const r = runCli(dir, ['record', '--decision', 'fixture', '--round', '0',
    '--id', 'B', '--model', 'gemini-2.5-pro', '--reviewer-file', rf, '--lane', 'bundled']);
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /SANTA_MODEL_UNAVAILABLE|not on PATH/);

  // 라운드는 열린 채라 재기록 가능하다 — 원장에 아무것도 append되지 않았다.
  const ledgerPath = path.join(dir, '.claude', 'state', 'santa-loop', 'fixture.json');
  if (fs.existsSync(ledgerPath)) {
    const state = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const r0 = (state.rounds || [])[0];
    assert.ok(!r0 || (r0.reviewers || []).length === 0,
      '거부된 record가 원장에 리뷰어를 남겼다');
  }
});

test('M3 record: anthropic과 unknown은 PATH 대조 대상이 아니다', () => {
  // Claude fallback은 정상 입력이고, unknown은 oracle이 이미 degraded로 처리한다.
  // 여기서 또 막으면 미등재 모델이 라운드를 아예 못 열게 되어 처방이 "카탈로그 1줄 PR"
  // 에서 "루프 중단"으로 바뀐다.
  const dir = repoFixture();
  ['opus', 'llama-3-70b'].forEach((model, i) => {
    const rf = reviewerFile(dir, 'rev-' + i + '.json');
    // 라운드를 실제로 연다. 위 거부 test는 `loadReviewer`가 `assertRecordable`보다
    // **먼저** 돌기 때문에 begin-round 없이도 성립하지만(그 순서 자체가 "라운드가 열린
    // 채 남는다"의 근거다), 통과 경로는 열린 라운드가 있어야 append까지 간다.
    const b = runCli(dir, ['begin-round', '--decision', 'fx' + i]);
    assert.strictEqual(b.status, 0, 'begin-round failed: ' + b.stderr);
    const r = runCli(dir, ['record', '--decision', 'fx' + i, '--round', '0',
      '--id', 'A', '--model', model, '--reviewer-file', rf, '--lane', 'blind']);
    assert.strictEqual(r.status, 0, model + ' must be recordable: ' + r.stderr);
  });
});
