'use strict';

// santa-delta-review M2 Task 2 — Layer 1: 결정적 containment 회귀 (DD2).
//
// **이 파일이 인증하는 명제는 "리뷰어가 찾는다"가 아니라 "리뷰어에게 보일 기회가
// 있다"이다**(DD2). 결정적이고 LLM이 없으며 CI에 상주한다. 탐지(detection) 자체는
// Layer 2가 소유하고, 어느 쪽도 다른 쪽을 대신하지 않는다.
//
// 단언 대부분이 **실제 fixture repo와 실제 `runCli`를 지난다**. `narrowScope`를 직접
// 부르면 `cmdScopeDelta`의 anchor 열거 · `git show` · `patchRangesFrom` 이음매를 통째로
// 우회하는데, M1이 실측한 결함은 전부 그 이음매에 있었다.
//
// mirror: santa-delta-instrumentation.test.js:29-73(mkdtemp + git init + runCli 캡처 +
// `withoutSinglePass` 격리).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const corpusLib = require('../santa/detection-corpus');
const scopeDelta = require('../santa/scope-delta');
const { runCli } = require('../santa/cli');

// ── fixture ──────────────────────────────────────────────────────────────────

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
// 이 저장소 자신의 `.claude/settings.json`이 그 변수를 켜 두므로, 축을 검사하려면
// 지워야 한다 — 검사 대상이 아닌 축이 검사를 가린다.
function withoutSinglePass(fn) {
  const saved = process.env.MCCP_REVIEW_SINGLE_PASS;
  delete process.env.MCCP_REVIEW_SINGLE_PASS;
  try { return fn(); } finally {
    if (saved !== undefined) process.env.MCCP_REVIEW_SINGLE_PASS = saved;
  }
}

// 델타 모드도 같은 이유로 격리한다 — 호스트 env가 `enforce`로 켜져 있으면 `off` 단언이
// 조용히 `enforce`를 재는다.
function withDeltaMode(mode, fn) {
  const saved = process.env.MCCP_SANTA_DELTA_SCOPE;
  if (mode === null) delete process.env.MCCP_SANTA_DELTA_SCOPE;
  else process.env.MCCP_SANTA_DELTA_SCOPE = mode;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.MCCP_SANTA_DELTA_SCOPE;
    else process.env.MCCP_SANTA_DELTA_SCOPE = saved;
  }
}

function writeFile(repo, rel, content) {
  const abs = path.join(repo, rel.split('/').join(path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// corpus를 심은 실제 git 저장소를 만든다: rev0 커밋 → fix 커밋 → fix anchor 파일.
// anchor 경로/이름은 `cli.js`의 `FIX_ANCHOR_RE`(`round-<n>-fix-rev.txt`)와 그 상위
// 디렉토리 규약을 그대로 따른다 — 호출자가 anchor 경로를 넘길 표면이 없기 때문이다.
function makeCorpusRepo() {
  const corpus = corpusLib.buildCorpus();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-corpus-')));
  const g = function (args) { execFileSync('git', args, { cwd: dir, stdio: 'ignore' }); };
  g(['init', '-q']);
  g(['checkout', '-q', '-b', 'corpus-fixture']);
  g(['config', 'user.email', 'santa@test.local']);
  g(['config', 'user.name', 'santa']);

  corpus.files.forEach(function (f) { writeFile(dir, f.path, f.content); });
  g(['add', '-A']);
  g(['commit', '-qm', 'rev0: corpus']);

  corpus.fix.files.forEach(function (f) { writeFile(dir, f.path, f.content); });
  g(['add', '-A']);
  g(['commit', '-qm', corpus.fix.message]);
  const fixRev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

  // 라운드 1이 닫히며 Step 5가 쓰는 anchor. 셸이 쓰는 파일이라 trailing newline이 붙는
  // 형태를 그대로 재현한다(`patchRangesFrom`이 trim으로 흡수하는 것을 실제로 태운다).
  writeFile(dir, '.claude/state/santa-loop/tmp/' + corpus.decisionSlug +
    '/round-1-fix-rev.txt', fixRev + '\n');

  const pathsFile = path.join(dir, 'diff-paths.json');
  fs.writeFileSync(pathsFile, JSON.stringify(corpus.diffPaths) + '\n');

  return { dir: dir, corpus: corpus, fixRev: fixRev, pathsFile: pathsFile };
}

// 실제 `scope-delta` CLI 1회 + 실제 `scope-always` CLI 1회를 **그 순서로** 부른다.
// 순서가 곧 UI7 면제이고 조건 분기가 아니다(DD2) — 그래서 test도 순서로 재현한다.
function resolveScope(fx, mode) {
  return withDeltaMode(mode, function () {
    const d = cli(['scope-delta', '--decision', fx.corpus.decisionSlug, '--cwd', fx.dir,
      '--paths-file', fx.pathsFile]);
    assert.equal(d.code, 0, d.stderr);
    const delta = JSON.parse(d.stdout);

    // 델타가 낸 경로를 상시 스코프의 입력으로 넘긴다 — santa-loop.md Step 1과 동형.
    const narrowed = path.join(fx.dir, 'narrowed-paths.json');
    fs.writeFileSync(narrowed, JSON.stringify(delta.paths) + '\n');

    const a = cli(['scope-always', '--decision', fx.corpus.decisionSlug, '--cwd', fx.dir,
      '--paths-file', narrowed]);
    assert.equal(a.code, 0, a.stderr);
    const always = JSON.parse(a.stdout);

    return {
      delta: delta,
      always: always,
      // 최종 리뷰 스코프 = 상시 병합 뒤의 경로 + 델타가 낸 범위.
      scope: { paths: always.paths, ranges: delta.ranges },
    };
  });
}

function coverage(fx, resolved) {
  return corpusLib.coverageOf({ manifest: fx.corpus.defects, scope: resolved.scope });
}

function reasonOf(cov, id) {
  const r = cov.byId[id];
  return r ? r.reason : null;
}

// ── 순수 oracle ──────────────────────────────────────────────────────────────

test('oracle — 계층 enum은 닫혀 있고 4종이다', () => {
  assert.equal(corpusLib.DEFECT_CLASS_VALUES.length, 4);
  assert.deepEqual(corpusLib.DEFECT_CLASS_VALUES.slice().sort(), [
    'A_IN_FIX', 'B_SAME_FILE_OUT_OF_RANGE', 'C_DROPPED_PATH', 'D_ALWAYS_SCOPE',
  ]);
});

test('oracle — corpus는 4계층을 각각 최소 1건 갖는다 (C를 조용히 뺄 수 없다)', () => {
  const corpus = corpusLib.buildCorpus();
  corpusLib.DEFECT_CLASS_VALUES.forEach(function (c) {
    const hits = corpus.defects.filter(function (d) { return d.class === c; });
    assert.ok(hits.length >= 1, 'class ' + c + ' has no defect in the corpus');
  });
});

test('oracle — 결함 좌표는 anchor로 역산되며 실제 그 줄에 있다', () => {
  const corpus = corpusLib.buildCorpus();
  const byPath = Object.create(null);
  corpus.files.forEach(function (f) { byPath[f.path] = f.content; });
  corpus.fix.files.forEach(function (f) { byPath[f.path] = f.content; });

  corpus.defects.forEach(function (d) {
    assert.ok(Number.isSafeInteger(d.line) && d.line >= 1,
      d.id + ' line did not resolve from its anchor');
    const lines = String(byPath[d.path]).split('\n');
    assert.ok(lines[d.line - 1].indexOf(d.anchor) !== -1,
      d.id + ' anchor is not on line ' + d.line + ': ' + JSON.stringify(lines[d.line - 1]));
  });
});

test('oracle — 결함 id는 닫힌 D<n> 형태다', () => {
  corpusLib.buildCorpus().defects.forEach(function (d) {
    assert.match(d.id, corpusLib.DEFECT_ID_RE);
  });
});

test('oracle — coverageOf는 어떤 입력에도 던지지 않는다', () => {
  const junk = [undefined, null, 0, '', [], {}, { manifest: 'x' }, { scope: 7 },
    { manifest: [null, 1, 'a', {}], scope: { paths: [1, null], ranges: 3 } }];
  junk.forEach(function (input) {
    assert.doesNotThrow(function () { corpusLib.coverageOf(input); });
  });
  const bad = corpusLib.coverageOf({ manifest: [{ id: 'nope' }], scope: {} });
  assert.equal(bad.records[0].reason, corpusLib.COVERAGE_REASONS.UNKNOWN);
});

test('oracle — compareCoverage는 어떤 입력에도 던지지 않고 한쪽뿐인 id를 unmatched로 낸다', () => {
  [undefined, null, 0, '', [], {}, { fullCoverage: 1, deltaCoverage: 'x' }].forEach(function (i) {
    assert.doesNotThrow(function () { corpusLib.compareCoverage(i); });
  });
  const cmp = corpusLib.compareCoverage({
    fullCoverage: [{ id: 'D1', class: 'A_IN_FIX', inScope: true, reason: 'path-unrestricted' }],
    deltaCoverage: [{ id: 'D9', class: 'A_IN_FIX', inScope: true, reason: 'in-range' }],
  });
  assert.deepEqual(cmp.unmatched.slice().sort(function (a, b) {
    return a.id.localeCompare(b.id);
  }), [{ id: 'D1', side: 'delta-missing' }, { id: 'D9', side: 'full-missing' }]);
});

test('oracle — 계층이 열거 밖이면 합산에 들어가지 않고 unmatched로 남는다', () => {
  const cmp = corpusLib.compareCoverage({
    fullCoverage: [{ id: 'D1', class: 'E_TYPO', inScope: true, reason: 'path-unrestricted' }],
    deltaCoverage: [{ id: 'D1', class: 'E_TYPO', inScope: true, reason: 'path-unrestricted' }],
  });
  assert.equal(cmp.totals.full, 0);
  assert.equal(cmp.totals.delta, 0);
  assert.deepEqual(cmp.unmatched, [{ id: 'D1', side: 'class-unknown' }]);
});

// ── 사전 등록 규칙 (DD3) ─────────────────────────────────────────────────────

test('DD3 — 규칙 문장은 plan 본문과 축자 일치하고 상수로 동결된다', () => {
  assert.equal(corpusLib.DECISION_RULE,
    'corpus 전체(4계층 합산)에서 델타의 Layer 2 발견 수가 full 대비 단 1건이라도 적으면 ' +
    'default를 뒤집지 않는다. 같거나 크면 뒤집는다.');
});

test('DD3 — Layer 2 측정이 없으면 flip은 성립하지 않는다 (전건 미성립)', () => {
  const d = corpusLib.decideDefaultFlip({});
  assert.equal(d.flip, false);
  assert.equal(d.reason, corpusLib.FLIP_DECISIONS.ABSENT);
  assert.equal(corpusLib.decideDefaultFlip({ layer2: null }).reason,
    corpusLib.FLIP_DECISIONS.ABSENT);
});

test('DD3 — 미상(ABSENT)과 하락(DEGRADED)은 다른 토큰이다', () => {
  const absent = corpusLib.decideDefaultFlip({ layer2: null });
  const degraded = corpusLib.decideDefaultFlip({ layer2: { fullFindings: 4, deltaFindings: 3 } });
  assert.equal(absent.flip, false);
  assert.equal(degraded.flip, false);
  assert.notEqual(absent.reason, degraded.reason);
});

test('DD3 — 1건 부족도 flip을 막는다; 같거나 크면 허용한다', () => {
  assert.equal(corpusLib.decideDefaultFlip({ layer2: { fullFindings: 4, deltaFindings: 3 } }).flip, false);
  assert.equal(corpusLib.decideDefaultFlip({ layer2: { fullFindings: 4, deltaFindings: 4 } }).flip, true);
  assert.equal(corpusLib.decideDefaultFlip({ layer2: { fullFindings: 4, deltaFindings: 5 } }).flip, true);
});

test('DD3 — 형태 이탈은 flip을 사지 못한다', () => {
  [{ fullFindings: -1, deltaFindings: 0 }, { fullFindings: 1.5, deltaFindings: 2 },
    { fullFindings: '4', deltaFindings: '4' }, {}, [], 'x'].forEach(function (l2) {
    const d = corpusLib.decideDefaultFlip({ layer2: l2 });
    assert.equal(d.flip, false, JSON.stringify(l2));
    assert.equal(d.reason, corpusLib.FLIP_DECISIONS.MALFORMED, JSON.stringify(l2));
  });
});

// M2가 이 사이클에 기록한 Layer 2 증거. **`null`은 "하락 없음"이 아니라 "재지 않았다"다**
// — `.claude/notes/santa-delta-review-m2.md`가 그 사실과 사유를 갖는다. Layer 2를 실제로
// 완주하면 이 상수를 `{fullFindings, deltaFindings}`로 교체하고, 아래 test가 그때의
// default를 다시 판정한다.
const LAYER2_EVIDENCE = null;

// **이 단언이 M2의 배송 결정을 코드에 묶는다.** Layer 2를 돌리지 않은 채 누군가
// `DELTA_SCOPE_DEFAULT`를 `enforce`로 바꾸면 여기서 붉어진다 — 규칙이 산문으로만
// 존재할 때 생기는 "측정 없는 flip"(L2 id=6116eeb8 · 5fb50bd9)을 막는 자리다.
test('DD3 — 배송된 default는 이 저장소가 기록한 Layer 2 증거와 정합한다', () => {
  const decision = corpusLib.decideDefaultFlip({ layer2: LAYER2_EVIDENCE });
  const expected = decision.flip ? 'enforce' : 'off';
  assert.equal(scopeDelta.DELTA_SCOPE_DEFAULT, expected,
    'DELTA_SCOPE_DEFAULT is ' + scopeDelta.DELTA_SCOPE_DEFAULT + ' but the pre-registered ' +
    'rule says ' + expected + ' (reason=' + decision.reason + '). Either the measurement ' +
    'or the default is wrong — the rule itself must not be edited to fit the result.');
});

// ── Layer 1: 실제 CLI를 지나는 containment ───────────────────────────────────

test('층1 — full 스코프(off)는 A·B·C 전부 경로 안이고 범위 제한이 없다', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    const resolved = resolveScope(fx, 'off');

    assert.equal(resolved.delta.applied, false);
    assert.equal(resolved.delta.reason, scopeDelta.NO_NARROW.ENV_OFF);
    assert.deepEqual(resolved.delta.ranges, {});

    const cov = coverage(fx, resolved);
    ['D1', 'D2', 'D3'].forEach(function (id) {
      assert.equal(cov.byId[id].inScope, true, id + ' should be in the full scope');
      assert.equal(reasonOf(cov, id), corpusLib.COVERAGE_REASONS.PATH_UNRESTRICTED, id);
    });
  });
});

test('층1 — delta(enforce)는 A 범위 지목 · B 경로 유지 범위 밖 · C 경로째 드롭', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    const resolved = resolveScope(fx, 'enforce');

    assert.equal(resolved.delta.applied, true, resolved.delta.reason);
    assert.deepEqual(resolved.delta.paths, ['src/parser.js']);
    assert.equal(resolved.delta.before, 3);
    assert.equal(resolved.delta.after, 1);

    const cov = coverage(fx, resolved);
    assert.equal(reasonOf(cov, 'D1'), corpusLib.COVERAGE_REASONS.IN_RANGE);
    assert.equal(cov.byId.D1.inRange, true);
    assert.equal(reasonOf(cov, 'D2'), corpusLib.COVERAGE_REASONS.PATH_KEPT_OUT_OF_RANGE);
    assert.equal(cov.byId.D2.inRange, false);
    assert.equal(reasonOf(cov, 'D3'), corpusLib.COVERAGE_REASONS.PATH_DROPPED);
    assert.equal(cov.byId.D3.inScope, false);
  });
});

test('층1 — Class B는 범위 밖이지만 containment는 유지된다 (포인터이지 절단이 아니다)', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    const cov = coverage(fx, resolveScope(fx, 'enforce'));
    // `inScope`는 경로 포함이고 `inRange`는 그 안의 더 미세한 상태다. 둘을 접으면
    // Layer 1이 자기가 인증할 수 없는 명제를 단언하게 된다(DD2).
    assert.equal(cov.byId.D2.inScope, true);
    assert.equal(cov.byId.D2.inRange, false);
  });
});

test('층1 — Class D는 두 모드 모두 스코프 안이다 (UI7 상시 스코프 면제)', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    ['off', 'enforce'].forEach(function (mode) {
      const resolved = resolveScope(fx, mode);
      // 델타는 plan을 diff 스코프에서 못 봤다 — 되돌리는 것은 순서상 뒤에 오는 상시
      // 스코프다. 그것이 조건 분기가 아니라 호출 순서라는 것이 DD2의 요지.
      assert.equal(resolved.delta.paths.indexOf('.claude/plans/corpus-fixture.plan.md'), -1,
        mode + ': plan should not come from the delta');
      assert.ok(resolved.always.paths.indexOf('.claude/plans/corpus-fixture.plan.md') !== -1,
        mode + ': always-scope did not restore the plan');
      const cov = coverage(fx, resolved);
      assert.equal(cov.byId.D4.inScope, true, mode + ': D4 must stay in scope');
    });
  });
});

test('층1 — 사전 등록 대조: 델타가 잃는 것은 Class C 하나다', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    const full = coverage(fx, resolveScope(fx, 'off'));
    const delta = coverage(fx, resolveScope(fx, 'enforce'));
    const cmp = corpusLib.compareCoverage({ fullCoverage: full, deltaCoverage: delta });

    assert.deepEqual(cmp.unmatched, []);
    assert.equal(cmp.totals.unknown, 0);

    assert.deepEqual(cmp.byClass.A_IN_FIX, { full: 1, delta: 1, lost: 0, lostIds: [] });
    assert.deepEqual(cmp.byClass.B_SAME_FILE_OUT_OF_RANGE,
      { full: 1, delta: 1, lost: 0, lostIds: [] });
    assert.deepEqual(cmp.byClass.C_DROPPED_PATH,
      { full: 1, delta: 0, lost: 1, lostIds: ['D3'] });
    assert.deepEqual(cmp.byClass.D_ALWAYS_SCOPE, { full: 1, delta: 1, lost: 0, lostIds: [] });

    assert.equal(cmp.totals.full, 4);
    assert.equal(cmp.totals.delta, 3);
    assert.equal(cmp.totals.lost, 1);
    // containment 축의 하락이다 — 탐지 축의 하락이 아니다(DD2).
    assert.equal(cmp.degraded, true);
  });
});

test('층1 — 같은 fixture를 반복 해석해도 결과가 동일하다 (결정적)', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    const a = coverage(fx, resolveScope(fx, 'enforce'));
    const b = coverage(fx, resolveScope(fx, 'enforce'));
    assert.deepEqual(a.records, b.records);
  });
});

// ── 금지 축 재확인 (UI1) ─────────────────────────────────────────────────────
//
// M1 test와 중복이 아니다 — 저기는 M1의 fixture 경로로 쟀고 여기는 **corpus 경로
// 이름**으로 잰다. 경로가 데이터인 이상 어떤 경로 집합이 오느냐가 검사의 입력이다.

test('UI1 — corpus 경로로 렌더한 스코프 줄에 상태 단언이 0건이다', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    const resolved = resolveScope(fx, 'enforce');
    const lines = scopeDelta.renderScopeLines({
      paths: resolved.scope.paths, ranges: resolved.scope.ranges,
    });
    assert.ok(lines.length > 0);
    lines.forEach(function (line) {
      assert.doesNotThrow(function () {
        scopeDelta.assertNoStatusAssertion(line, scopeDelta.PRIOR_ROUND_PATTERNS);
      }, 'PRIOR_ROUND_PATTERNS matched: ' + line);
    });
    // 범위 표기는 고정 형태다 — 자유 텍스트가 섞이면 renderScopeLines가 이미 던진다.
    assert.ok(lines.some(function (l) { return /^- src\/parser\.js:\d+-\d+$/.test(l); }),
      'expected a range-annotated line for the kept path, got: ' + JSON.stringify(lines));
  });
});

test('UI1 — 상시 스코프가 되돌린 plan 경로도 상태 단언을 만들지 않는다', () => {
  withoutSinglePass(function () {
    const fx = makeCorpusRepo();
    const resolved = resolveScope(fx, 'enforce');
    const joined = scopeDelta.renderScopeLines({
      paths: resolved.scope.paths, ranges: resolved.scope.ranges,
    }).join('\n');
    assert.ok(joined.indexOf('.claude/plans/corpus-fixture.plan.md') !== -1);
    assert.doesNotThrow(function () {
      scopeDelta.assertNoStatusAssertion(joined, scopeDelta.PRIOR_ROUND_PATTERNS);
    });
  });
});
