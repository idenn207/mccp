'use strict';

// evidence-debt.test.js — 래칫이 장식이 아님을 고정한다 (M5 Task 5).
//
// **이 test는 어떤 CI도 돌리지 않는다.** `.github/workflows/`에 등재된 test는 셋뿐이고
// 이것은 그 셋이 아니다(CLAUDE.md §3.17이 M3에서 확인한 사실). 강제 지점은 사이클의
// `## Validation`이 돌리는 로컬 실행이다. 그래서 «축을 목록에 밀어 넣을 수 없다»는
// 불변식은 여기에만 두지 않고 `evidence-debt.js`의 로드 시점 throw로도 강제한다 —
// 아래 (1)은 그 방어가 실제로 작동하는지를 확인하는 쪽이다.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

const debtMod = require('../evidence-debt');
const registry = require('../registry');
const lint = require('../lint');
const { evidenceNameProblems } = require('../evidence-name');

// 실제 파일을 읽지 않는 fixture reader — 판정이 fs에 의존하지 않는다는 것이 요점이다.
function readerOf(map) {
  return function (rel) {
    return Object.prototype.hasOwnProperty.call(map, rel) ? map[rel].split('\n') : null;
  };
}

// 이름은 6행에 있다. 1행을 가리키는 evidence의 창(1..3)은 그 이름에 **닿지 않는다** —
// fixture가 이 여유를 갖지 않으면 «틀린 evidence»가 창 안에 우연히 들어와 실패를 검증하는
// test가 조용히 통과한다.
const OK_FILE = {
  'a.js': ['one', 'two', 'three', 'four', 'five', 'process.env.MCCP_ALPHA;', 'seven'].join('\n'),
};
const EMPTY_SURFACE = [{ rel: 's.js', text: '' }];

function entry(over) {
  return Object.assign({ name: 'MCCP_ALPHA', status: 'active', evidence: 'a.js:6' }, over || {});
}

// ── (1) 목록에 impeccable 축이 0건이고, 넣으려 하면 로드가 거부한다 ─────────────
test('EVIDENCE_DEBT carries no impeccable-axis name, and the module refuses to accept one', () => {
  const offenders = debtMod.EVIDENCE_DEBT.filter((r) => /^(MCCP_)?IMPECCABLE_/.test(r.name));
  assert.deepStrictEqual(offenders, [],
    'M5 fixed the impeccable axis; exempting it here would reopen the path this list closes');

  // 방어가 test 밖에서도 산다: 밀어 넣으면 assertShape가 throw한다.
  assert.throws(
    () => debtMod.assertShape([{ name: 'IMPECCABLE_UPDATE_HOST', axis: 'external', klass: 'B' }]),
    /impeccable axis/);
  assert.throws(
    () => debtMod.assertShape([{ name: 'MCCP_IMPECCABLE_SKILL', axis: 'review', klass: 'B' }]),
    /impeccable axis/);
});

// ── (2) 신규 드리프트는 붉다 ────────────────────────────────────────────────────
test('a new entry whose evidence does not name it fails the forward check', () => {
  const problems = evidenceNameProblems({
    entries: [entry({ evidence: 'a.js:1' })],   // 창(1..3)에 MCCP_ALPHA 없음
    debt: [],
    debtError: null,
    readLines: readerOf(OK_FILE),
    surfaces: EMPTY_SURFACE,
  });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /MCCP_ALPHA: evidence a\.js:1 does not name it/);

  // 같은 항목이 올바른 행을 가리키면 통과한다 — 창이 무조건 붉히는 것이 아니다.
  const clean = evidenceNameProblems({
    entries: [entry()],
    debt: [],
    debtError: null,
    readLines: readerOf(OK_FILE),
    surfaces: EMPTY_SURFACE,
  });
  assert.deepStrictEqual(clean, []);
});

// ── (3) 고쳐진 항목이 목록에 남아 있으면 붉다 (래칫은 줄어들기만 한다) ──────────
test('a debt row whose entry now passes fails with "delete the row"', () => {
  const problems = evidenceNameProblems({
    entries: [entry()],                                        // 이제 통과하는 항목
    debt: [{ name: 'MCCP_ALPHA', axis: 'gates', klass: 'B' }], // 그런데 목록에 남아 있다
    debtError: null,
    readLines: readerOf(OK_FILE),
    surfaces: EMPTY_SURFACE,
  });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /listed in EVIDENCE_DEBT but its evidence now names it/);
});

test('a debt row no entry reaches is reported as a fossil', () => {
  const problems = evidenceNameProblems({
    entries: [entry()],
    debt: [{ name: 'MCCP_ALPHA', axis: 'gates', klass: 'B' },
      { name: 'MCCP_GONE', axis: 'gates', klass: 'B' }],
    debtError: null,
    readLines: readerOf(OK_FILE),
    surfaces: EMPTY_SURFACE,
  });
  assert.ok(problems.some((p) => /EVIDENCE_DEBT lists MCCP_GONE/.test(p)));
});

test('a listed name is exempted while it genuinely fails', () => {
  const problems = evidenceNameProblems({
    entries: [entry({ evidence: 'a.js:1' })],
    debt: [{ name: 'MCCP_ALPHA', axis: 'gates', klass: 'B' }],
    debtError: null,
    readLines: readerOf(OK_FILE),
    surfaces: EMPTY_SURFACE,
  });
  assert.deepStrictEqual(problems, []);
});

// ── (4) not-consumed 역방향이 붉다 ─────────────────────────────────────────────
const DOC_FIXTURE = { 'docs/environment/external.md': ['x', '### MCCP_ALPHA', 'y'].join('\n') };

test('not-consumed is refuted by a read on the runtime surface', () => {
  const clean = evidenceNameProblems({
    entries: [entry({ status: 'not-consumed', evidence: 'docs/environment/external.md:2' })],
    debt: [],
    debtError: null,
    readLines: readerOf(DOC_FIXTURE),
    surfaces: [{ rel: 'plugins/mccp/scripts/lib/x.js', text: 'nothing here' }],
  });
  assert.deepStrictEqual(clean, [], 'absent from the surface -> the claim stands');

  const refuted = evidenceNameProblems({
    entries: [entry({ status: 'not-consumed', evidence: 'docs/environment/external.md:2' })],
    debt: [],
    debtError: null,
    readLines: readerOf(DOC_FIXTURE),
    surfaces: [{ rel: 'plugins/mccp/scripts/lib/x.js', text: 'const v = process.env.MCCP_ALPHA;' }],
  });
  assert.ok(refuted.some((p) => /appears on the runtime surface/.test(p)),
    'reading it must refute the "mccp does not read this" claim');
});

test('not-consumed must anchor at a docs/environment section, not a read site', () => {
  const problems = evidenceNameProblems({
    entries: [entry({ status: 'not-consumed', evidence: 'a.js:6' })],
    debt: [],
    debtError: null,
    readLines: readerOf(OK_FILE),
    surfaces: EMPTY_SURFACE,
  });
  assert.ok(problems.some((p) => /requires a docs\/environment\/\*\.md anchor/.test(p)));
});

test('a not-consumed anchor pointing at another variable section is refused', () => {
  const problems = evidenceNameProblems({
    entries: [entry({ status: 'not-consumed', evidence: 'docs/environment/external.md:1' })],
    debt: [],
    debtError: null,
    readLines: readerOf({ 'docs/environment/external.md': ['a', 'b', 'c', 'd', '### MCCP_ALPHA'].join('\n') }),
    surfaces: EMPTY_SURFACE,
  });
  assert.ok(problems.some((p) => /does not name it/.test(p)));
});

// ── (5) 로더 실패는 fail-closed다 (Implement-Codex R1 F1) ──────────────────────
test('an unusable debt module exempts nothing and says so', () => {
  const problems = evidenceNameProblems({
    entries: [entry({ evidence: 'a.js:1' })],
    debt: null,
    debtError: 'Cannot find module evidence-debt.js',
    readLines: readerOf(OK_FILE),
    surfaces: EMPTY_SURFACE,
  });
  assert.ok(problems.some((p) => /evidence-debt is unusable/.test(p)));
  assert.ok(problems.some((p) => /does not name it/.test(p)),
    'a broken loader must not silently exempt the entries it was supposed to list');
});

test('assertShape rejects the malformed shapes a hand edit produces', () => {
  assert.throws(() => debtMod.assertShape('nope'), /must be an array/);
  assert.throws(() => debtMod.assertShape([{ name: 'MCCP_ALPHA' }]), /keys must be/);
  assert.throws(() => debtMod.assertShape([{ name: 'lower', axis: 'gates', klass: 'B' }]), /bad name/);
  assert.throws(() => debtMod.assertShape([{ name: 'MCCP_SKIP_OBSERVE', axis: 'retired', klass: 'X' }]), /klass must be/);
  assert.throws(() => debtMod.assertShape([{ name: 'MCCP_SKIP_OBSERVE', axis: 'nope', klass: 'B' }]), /unknown axis/);
  assert.throws(() => debtMod.assertShape([
    { name: 'MCCP_SKIP_OBSERVE', axis: 'retired', klass: 'B' },
    { name: 'MCCP_SKIP_OBSERVE', axis: 'retired', klass: 'B' },
  ]), /duplicate/);
  assert.throws(() => debtMod.assertShape([{ name: 'MCCP_NOT_REGISTERED_AT_ALL', axis: 'gates', klass: 'B' }]),
    /not in the registry/);
});

// ── (6) vacuous pass 가드 ──────────────────────────────────────────────────────
test('empty inputs are reported instead of passing vacuously', () => {
  assert.ok(evidenceNameProblems({ entries: [] }).some((p) => /registry is empty/.test(p)));

  const unreadable = evidenceNameProblems({
    entries: [entry()],
    debt: [],
    debtError: null,
    readLines: () => null,
    surfaces: [],
  });
  assert.ok(unreadable.some((p) => /pass vacuously/.test(p)));

  const noSurface = evidenceNameProblems({
    entries: [entry({ status: 'not-consumed', evidence: 'docs/environment/external.md:2' }), entry()],
    debt: [],
    debtError: null,
    readLines: readerOf(Object.assign({}, DOC_FIXTURE, OK_FILE)),
    surfaces: [],
  });
  assert.ok(noSurface.some((p) => /absence cannot be certified/.test(p)));
});

// ── (7) 접두사 충돌 — 긴 이름의 행이 짧은 접두사를 인증하면 안 된다 ────────────
test('a longer name on the line does not certify a shorter prefix name', () => {
  const files = { 'a.js': ['', '', 'process.env.MCCP_PLAN_REVIEW_L3;'].join('\n') };
  const problems = evidenceNameProblems({
    entries: [{ name: 'MCCP_PLAN_REVIEW', status: 'active', evidence: 'a.js:3' }],
    debt: [],
    debtError: null,
    readLines: readerOf(files),
    surfaces: EMPTY_SURFACE,
  });
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /MCCP_PLAN_REVIEW: evidence/);
});

// ── (8) 이 저장소의 실제 상태 — L10이 green이고 목록이 실제로 소비된다 ─────────
test('this repository passes L10 with every debt row still load-bearing', () => {
  const result = lint.run(REPO_ROOT);
  assert.ok(result.checks.L10, 'L10 must exist');
  assert.deepStrictEqual(result.checks.L10.problems, []);
  assert.strictEqual(result.checks.L10.debtSize, debtMod.EVIDENCE_DEBT.length);

  // 목록의 모든 이름이 registry에 실재한다 — 화석 0건.
  debtMod.EVIDENCE_DEBT.forEach((r) => {
    assert.ok(registry.get(r.name), r.name + ' must still be a registry entry');
  });
});

// ── v1.32.1 M6 — 증가 방향의 가시화 ──────────────────────────────────────────
//
// 목록은 원래 **줄어드는 쪽만** 기계였다(evidence-name.js의 래칫). 늘어나는 쪽은 한 줄
// append로 끝났고 아무것도 붉지 않았다. ceiling은 그것을 금지하지 않는다 — **두 곳을 함께
// 고치게** 만들 뿐이고, 그래서 래칫이 느슨해진 사건이 diff에 숫자로 남는다.

test('M6 ceiling: 상수와 목록 길이는 짝이다 — 둘 중 하나만 고치면 붉다', function () {
  assert.strictEqual(debtMod.EVIDENCE_DEBT_CEILING, debtMod.EVIDENCE_DEBT.length,
    'EVIDENCE_DEBT_CEILING(' + debtMod.EVIDENCE_DEBT_CEILING + ')과 목록 길이('
    + debtMod.EVIDENCE_DEBT.length + ')가 다르다. 이름을 추가했다면 상수도 함께 올려라 — '
    + '그 편집이 래칫이 느슨해졌다는 기록이다. 이름을 갚았다면 상수를 내려라.');
});

test('M6 ceiling: 상한을 넘는 목록은 로드 시점 검사에서 throw한다', function () {
  const over = debtMod.EVIDENCE_DEBT.concat([
    { name: 'MCCP_SKIP_RECEIPT', axis: 'gates', klass: 'B' },
  ]);
  assert.throws(function () { debtMod.assertShape(over); }, /EVIDENCE_DEBT_CEILING/,
    '상한을 넘겼는데 통과했다 — 목록은 다시 한 줄 append로 늘어난다');
});

test('M6 ceiling: 상한 이하는 통과한다 (대조군 — 검사가 공허하지 않다)', function () {
  assert.doesNotThrow(function () { debtMod.assertShape(debtMod.EVIDENCE_DEBT.slice(0, 3)); });
});
