'use strict';

// santa-delta-review M1 Task 6(a) — `scope-delta.js` 순수 oracle 회귀.
//
// 이 파일은 **판정만** 검사한다. anchor 열거·`git show`·파일 읽기는 CLI 계층이므로
// `santa-delta-command-body.test.js`(배선)와 `santa-loop-cap.test.js`(CLI 레벨)가
// 나눠 덮는다 — 순수 oracle만 test하면 배선 결함을 놓친다는 이 repo의 실측 교훈은
// 그 두 파일이 진다.

const test = require('node:test');
const assert = require('node:assert/strict');

const sd = require('../santa/scope-delta');

// `assert.throws(fn, /re/)` 는 **message**를 본다. 이 모듈의 식별자는 `err.code`이므로
// 메시지 문구에 결속하면 문구를 다듬는 편집이 test를 붉게 만든다 — 계약은 code다.
function throwsCode(fn, code, msg) {
  assert.throws(fn, function (e) {
    assert.equal(e && e.code, code, msg || ('expected code ' + code + ', got ' + (e && e.code)));
    return true;
  });
}

// ── env 파서 ─────────────────────────────────────────────────────────────────

test('parseDeltaScope: 미설정은 default `off`', () => {
  assert.equal(sd.parseDeltaScope({}), 'off');
  assert.equal(sd.parseDeltaScope({ MCCP_SANTA_DELTA_SCOPE: '' }), 'off');
  assert.equal(sd.parseDeltaScope({ MCCP_SANTA_DELTA_SCOPE: '   ' }), 'off');
  assert.equal(sd.parseDeltaScope(undefined), 'off');
});

test('parseDeltaScope: trim + 소문자 정규화는 오타가 아니다', () => {
  assert.equal(sd.parseDeltaScope({ MCCP_SANTA_DELTA_SCOPE: ' Enforce ' }), 'enforce');
  assert.equal(sd.parseDeltaScope({ MCCP_SANTA_DELTA_SCOPE: 'OFF' }), 'off');
});

test('parseDeltaScope: 열거 밖은 loud warn 후 default (던지지 않는다)', () => {
  const saved = process.stderr.write;
  const seen = [];
  process.stderr.write = function (c) { seen.push(String(c)); return true; };
  let got;
  try { got = sd.parseDeltaScope({ MCCP_SANTA_DELTA_SCOPE: 'yes' }); }
  finally { process.stderr.write = saved; }
  assert.equal(got, 'off');
  assert.match(seen.join(''), /MCCP_SANTA_DELTA_SCOPE must be one of/);
});

// **default가 형제 토글과 반대라는 사실 자체를 고정한다**(DD1). 이 값을 `enforce`로
// 바꾸는 편집은 M2가 탐지율 하락 부재를 보인 뒤에만 정당하고, 그 전에 바뀌면
// PRD Risk 1을 그대로 실행하는 것이다. 이 단언이 그 경계다.
test('DD1 — default는 `off`이고 그것이 형제 santa 토글과 반대 방향이다', () => {
  assert.equal(sd.DELTA_SCOPE_DEFAULT, 'off');
  assert.deepEqual(sd.DELTA_SCOPE_VALUES.slice().sort(), ['enforce', 'off']);
  const lanes = require('../santa/lanes');
  const always = require('../santa/scope-always');
  const terminator = require('../santa/terminator');
  // 형제 셋은 전부 발화가 default다 — 이 대조가 비대칭을 서술이 아니라 값으로 만든다.
  assert.notEqual(lanes.BLIND_LANE_DEFAULT, 'off');
  assert.notEqual(always.ALWAYS_SCOPE_DEFAULT, 'off');
  assert.notEqual(terminator.TERMINATOR_DEFAULT || 'enforce', 'off');
});

// ── 미축소 사유 토큰 ─────────────────────────────────────────────────────────

test('NO_NARROW은 닫힌 4원소 enum이다 (자유 문자열이 원장에 들어갈 자리가 없다)', () => {
  assert.deepEqual(sd.NO_NARROW_VALUES.slice().sort(),
    ['empty-result', 'env-off', 'no-anchor', 'no-ranges']);
  // 값의 형태도 고정한다 — 개행/공백이 든 토큰은 원장을 렌더하는 하류에서 구조가 된다.
  sd.NO_NARROW_VALUES.forEach(function (v) { assert.match(v, /^[a-z-]+$/); });
});

// ── narrowScope — passthrough 4갈래 (DD8) ────────────────────────────────────

test('UI3 — anchor 0개(라운드 1)는 별도 검사가 아니라 no-anchor passthrough다', () => {
  const r = sd.narrowScope({
    mode: 'enforce', diffPaths: ['a.js', 'b.js'], patchRanges: {}, anchorCount: 0,
  });
  assert.equal(r.applied, false);
  assert.equal(r.reason, sd.NO_NARROW.NO_ANCHOR);
  assert.deepEqual(r.paths, ['a.js', 'b.js']);
  assert.deepEqual(Object.keys(r.ranges), []);
  assert.equal(r.before, 2);
  assert.equal(r.after, 2);
});

test('`off`는 anchor·범위가 있어도 env-off passthrough다 (kill switch가 이긴다)', () => {
  const r = sd.narrowScope({
    mode: 'off', diffPaths: ['a.js', 'b.js'], patchRanges: { 'a.js': [[1, 5]] }, anchorCount: 3,
  });
  assert.equal(r.applied, false);
  assert.equal(r.reason, sd.NO_NARROW.ENV_OFF);
  assert.deepEqual(r.paths, ['a.js', 'b.js']);
});

test('anchor는 있는데 hunk가 0이면 no-ranges — no-anchor와 구별된다', () => {
  const r = sd.narrowScope({
    mode: 'enforce', diffPaths: ['a.js'], patchRanges: {}, anchorCount: 2,
  });
  assert.equal(r.reason, sd.NO_NARROW.NO_RANGES);
  // 두 사유가 같은 값으로 접히면 "라운드 1"과 "git show가 죽었다"가 진단에서 합쳐진다.
  assert.notEqual(sd.NO_NARROW.NO_RANGES, sd.NO_NARROW.NO_ANCHOR);
});

test('축소 결과가 빈 집합이면 empty-result passthrough (스코프를 비우지 않는다)', () => {
  const r = sd.narrowScope({
    mode: 'enforce', diffPaths: ['a.js'], patchRanges: { 'z.js': [[1, 2]] }, anchorCount: 1,
  });
  assert.equal(r.applied, false);
  assert.equal(r.reason, sd.NO_NARROW.EMPTY_RESULT);
  assert.deepEqual(r.paths, ['a.js'], '빈 스코프는 축소가 아니라 고장이다');
});

test('narrowScope는 어떤 입력에도 던지지 않는다', () => {
  const junk = [undefined, null, 0, '', [], 'x', { mode: 'enforce' },
    { mode: 'enforce', diffPaths: 'nope', patchRanges: 7 },
    { mode: 'enforce', diffPaths: [null, 3, {}], patchRanges: { a: 'no' } }];
  junk.forEach(function (v) {
    assert.doesNotThrow(function () { sd.narrowScope(v); }, 'threw on ' + JSON.stringify(v));
  });
});

// ── narrowScope — 실제 축소 ──────────────────────────────────────────────────

test('applied=true의 paths는 diff ∩ ranges이고 diff 순서를 보존한다', () => {
  const r = sd.narrowScope({
    mode: 'enforce',
    diffPaths: ['c.js', 'a.js', 'b.js', 'd.js'],
    patchRanges: { 'b.js': [[10, 12]], 'a.js': [[1, 1]] },
    anchorCount: 1,
  });
  assert.equal(r.applied, true);
  assert.equal(r.reason, null);
  assert.deepEqual(r.paths, ['a.js', 'b.js'], 'diff 순서(c,a,b,d)에서 a가 b보다 앞');
  assert.equal(r.before, 4);
  assert.equal(r.after, 2);
});

test('before - after가 santa_delta_paths_dropped의 정의다', () => {
  const r = sd.narrowScope({
    mode: 'enforce', diffPaths: ['a', 'b', 'c', 'd', 'e'],
    patchRanges: { a: [[1, 2]] }, anchorCount: 1,
  });
  assert.equal(r.before - r.after, 4);
});

test('살아남지 못한 경로의 범위는 출력에 실리지 않는다', () => {
  const r = sd.narrowScope({
    mode: 'enforce', diffPaths: ['a.js'],
    patchRanges: { 'a.js': [[1, 2]], 'gone.js': [[5, 6]] }, anchorCount: 1,
  });
  assert.deepEqual(Object.keys(r.ranges), ['a.js'],
    '스코프에 없는 파일의 범위를 실으면 프롬프트가 스코프 밖을 가리킨다');
});

test('DD6 누적 — 여러 anchor의 합집합이 그대로 축소 입력이다', () => {
  // CLI가 만드는 합집합의 형태를 그대로 흉내낸다(같은 파일에 두 커밋의 hunk).
  const union = { 'a.js': [[10, 12], [100, 101]] };
  const r = sd.narrowScope({
    mode: 'enforce', diffPaths: ['a.js', 'b.js'], patchRanges: union, anchorCount: 2,
  });
  assert.equal(r.applied, true);
  assert.equal(r.ranges['a.js'].length, 2, '두 hunk가 각각 살아남는다(겹치지 않으므로)');
});

// ── expandRanges ─────────────────────────────────────────────────────────────

test('expandRanges: 앞뒤 CONTEXT_LINES 확장 + 1 미만 clamp', () => {
  const out = sd.expandRanges({ 'a.js': [[5, 6]] });
  assert.deepEqual(out['a.js'], [[1, 6 + sd.CONTEXT_LINES]],
    'start 5 - 20 = -15 는 1로 clamp된다');
});

test('expandRanges: 겹치는 범위와 인접 범위를 병합한다', () => {
  // 확장 후 [1,45] 와 [10,70] → 겹침 → [1,70]
  const out = sd.expandRanges({ 'a.js': [[21, 25], [30, 50]] });
  assert.equal(out['a.js'].length, 1, '겹친 두 범위가 하나로 병합돼야 한다');
  assert.deepEqual(out['a.js'], [[1, 70]]);
});

test('expandRanges: 멀리 떨어진 범위는 병합되지 않는다', () => {
  const out = sd.expandRanges({ 'a.js': [[100, 101], [1000, 1001]] });
  assert.equal(out['a.js'].length, 2);
});

test('expandRanges: 형태가 어긋난 원소만 버리고 나머지는 살린다', () => {
  const out = sd.expandRanges({
    'a.js': [[10, 12], 'nope', [5], [3, 1], ['1', '2'], [1.5, 2], [NaN, 3]],
  });
  assert.equal(out['a.js'].length, 1, '유효한 [10,12] 하나만 남는다');
  // 문자열 "1e10"이 정수로 통과하면 안 된다.
  const evil = sd.expandRanges({ 'b.js': [['1e10', '1e10']] });
  assert.equal(Object.prototype.hasOwnProperty.call(evil, 'b.js'), false);
});

test('expandRanges: 전 원소가 불량이면 그 키 자체가 사라진다 (빈 배열을 남기지 않는다)', () => {
  const out = sd.expandRanges({ 'a.js': ['x'], 'b.js': [[1, 2]] });
  assert.deepEqual(Object.keys(out), ['b.js']);
});

test('expandRanges: 프로토타입 체인을 읽지 않는다 (__proto__ 오염 무해)', () => {
  const poisoned = JSON.parse('{"__proto__": {"evil": [[1,2]]}, "a.js": [[1,2]]}');
  const out = sd.expandRanges(poisoned);
  assert.deepEqual(Object.keys(out), ['a.js'].concat(
    Object.prototype.hasOwnProperty.call(poisoned, '__proto__') ? ['__proto__'] : []).sort().reverse().slice(0, Object.keys(out).length));
  assert.equal(({}).evil, undefined, '전역 Object.prototype이 오염되지 않았다');
  assert.equal(Object.getPrototypeOf(out), null, '반환은 null-prototype이다');
});

// ── renderScopeLines ─────────────────────────────────────────────────────────

test('renderScopeLines: 범위 없으면 `- path`, 있으면 `- path:s-e, s-e`', () => {
  const lines = sd.renderScopeLines({
    paths: ['a.js', 'b.js'], ranges: { 'b.js': [[12, 40], [88, 95]] },
  });
  assert.deepEqual(lines, ['- a.js', '- b.js:12-40, 88-95']);
});

test('I2 — renderScopeLines 출력에 SCOPE_ASSERTION_PATTERNS 매치가 0건이다', () => {
  const lines = sd.renderScopeLines({
    paths: ['src/x.js', 'src/y.js'], ranges: { 'src/x.js': [[1, 9]] },
  });
  const text = lines.join('\n');
  sd.SCOPE_ASSERTION_PATTERNS.forEach(function (re) {
    assert.equal(re.test(text), false, '출력이 ' + String(re) + ' 에 걸렸다');
  });
});

// **plan 문언에서의 이탈을 고정한다.** 원시 출력 전체에 denylist를 걸면 평범한 저장소
// 경로가 라운드를 죽인다 — 이 둘은 실재 파일이다. 검사가 스캐폴딩에만 걸리므로 통과해야
// 하고, 만약 누군가 검사를 원시 출력으로 되돌리면 이 test가 그 자리에서 붉어진다.
test('실재 저장소 경로가 금지 패턴에 걸려도 렌더는 성공한다 (데이터에 denylist를 걸지 않는다)', () => {
  const realPaths = [
    '.claude/plans/review-loop-bypass-m1.plan.md',   // /pass(ed)?/i — "by**pass**"
    '.claude/agents/refactor-cleaner.md',            // /clean/i     — "**clean**er"
  ];
  // 전제 확인 — 이 경로들이 정말 패턴에 걸린다(걸리지 않으면 이 test가 무의미해진다).
  assert.ok(sd.SCOPE_ASSERTION_PATTERNS.some(function (re) { return re.test(realPaths[0]); }));
  assert.ok(sd.SCOPE_ASSERTION_PATTERNS.some(function (re) { return re.test(realPaths[1]); }));

  assert.doesNotThrow(function () {
    sd.renderScopeLines({ paths: realPaths, ranges: { [realPaths[0]]: [[1, 5]] } });
  }, '정상 저장소 경로가 라운드를 죽였다');
});

test('renderScopeLines: 개행/CR/NUL이 든 경로는 프롬프트 구조 주입이라 거부한다', () => {
  ['a.js\n## Rubric', 'a.js\rX', 'a.js '].forEach(function (p) {
    assert.throws(function () { sd.renderScopeLines({ paths: [p], ranges: {} }); },
      /SANTA_SCOPE_PATH_INVALID|newline/, JSON.stringify(p) + ' 가 통과했다');
  });
});

test('renderScopeLines: 범위 표기가 고정 형태를 벗어나면 거부한다', () => {
  // 음수는 normalize를 지나지 않고 직접 넣는다(직접 호출자 방어).
  throwsCode(function () {
    sd.renderScopeLines({ paths: ['a.js'], ranges: { 'a.js': [[-3, 4]] } });
  }, 'SANTA_SCOPE_RANGE_INVALID');
});

// ── assertNoStatusAssertion ──────────────────────────────────────────────────

test('DD4 — PRIOR_ROUND_PATTERNS가 상태 단언을 잡는다 (양쪽 언어)', () => {
  const bad = [
    '이전 라운드에서 확인된 내용입니다',
    '직전  라운드는 문제 없었다',
    '이미 검토된 파일입니다',
    'The previous round approved this',
    'previously approved by reviewer A',
    'already reviewed in an earlier round',
  ];
  bad.forEach(function (t) {
    throwsCode(function () { sd.assertNoStatusAssertion(t, sd.PRIOR_ROUND_PATTERNS); },
      'SANTA_SCOPE_ASSERTION', JSON.stringify(t) + ' 가 통과했다');
  });
});

// **DD4의 오탐 경계를 고정한다.** rubric은 규약상 "PASS/FAIL condition"을 담으므로,
// 단일 목록을 프롬프트 전체에 걸면 정상 rubric이 매 라운드 터진다. 좁은 목록만
// 전체에 거는 설계가 그것을 막는다 — 이 단언이 그 설계의 계약이다.
test('DD4 — "PASS/FAIL condition"을 담은 정상 rubric은 통과한다', () => {
  const rubric = [
    '| Criterion | Pass Condition |',
    '| Correctness | Logic is sound, no bugs |',
    '| Security | No injection; the check must PASS before merge |',
    'Every criterion must have an objective PASS/FAIL condition.',
    'Mark it clean only when nothing is left.',
  ].join('\n');
  // 좁은 목록(전체 적용 대상)에는 걸리지 않는다.
  assert.doesNotThrow(function () {
    sd.assertNoStatusAssertion(rubric, sd.PRIOR_ROUND_PATTERNS);
  }, '정상 rubric이 델타 라운드를 막았다');
  // 반대로 엄격한 목록에는 걸린다 — 그래서 그것을 전체에 걸지 않는 것이다.
  throwsCode(function () {
    sd.assertNoStatusAssertion(rubric, sd.SCOPE_ASSERTION_PATTERNS);
  }, 'SANTA_SCOPE_ASSERTION');
});

test('assertNoStatusAssertion: 비문자열·빈 문자열은 무해 통과', () => {
  [undefined, null, 0, '', [], {}].forEach(function (v) {
    assert.doesNotThrow(function () { sd.assertNoStatusAssertion(v, sd.PRIOR_ROUND_PATTERNS); });
  });
});

// `g` 플래그가 붙으면 `lastIndex`가 호출 간에 살아남아 같은 입력이 두 번째 호출에서
// 통과한다 — 검사기가 조용히 꺼지는 경로라 플래그 자체를 고정한다.
test('두 패턴 목록에 `g` 플래그가 없다 (lastIndex 상태가 검사기를 끄지 못한다)', () => {
  sd.SCOPE_ASSERTION_PATTERNS.concat(sd.PRIOR_ROUND_PATTERNS).forEach(function (re) {
    assert.equal(re.global, false, String(re) + ' has the g flag');
  });
  const t = '이전 라운드 결과';
  throwsCode(function () { sd.assertNoStatusAssertion(t, sd.PRIOR_ROUND_PATTERNS); },
    'SANTA_SCOPE_ASSERTION');
  throwsCode(function () { sd.assertNoStatusAssertion(t, sd.PRIOR_ROUND_PATTERNS); },
    'SANTA_SCOPE_ASSERTION', '두 번째 호출이 통과했다 — lastIndex 누수');
});

// 목록의 **원소 집합 자체**를 pin한다(L2 invariant MEDIUM 흡수). 원소를 지우면 여기가
// 붉어지므로 목록이 조용히 줄어드는 경로가 없다. 완결성을 주장하는 것이 아니라
// 축소를 막는 것이 목적이다.
test('두 목록의 원소 집합이 고정돼 있다 (조용히 줄어들 수 없다)', () => {
  assert.deepEqual(sd.SCOPE_ASSERTION_PATTERNS.map(String), [
    '/pass(ed)?/i', '/승인/', '/문제\\s*없/', '/approved/i', '/clean/i',
    '/no issues/i', '/looks good/i',
  ]);
  assert.deepEqual(sd.PRIOR_ROUND_PATTERNS.map(String), [
    '/이전\\s*라운드/', '/직전\\s*라운드/', '/이미\\s*(검토|리뷰|확인)/',
    '/previous(ly)?\\s+round/i', '/earlier\\s+round/i',
    '/already\\s+(reviewed|approved|checked)/i', '/previously\\s+approved/i',
  ]);
});

// ── deltaCoverageFrom ────────────────────────────────────────────────────────

test('deltaCoverageFrom: applied 라운드만 세고 드롭을 합산한다', () => {
  const cov = sd.deltaCoverageFrom({
    rounds: [
      { scope: { applied: false, reason: 'no-anchor', before: 9, after: 9 } },
      { scope: { applied: true, reason: null, before: 9, after: 3 } },
      { scope: { applied: true, reason: null, before: 8, after: 6 } },
    ],
  });
  assert.deepEqual(cov, { deltaRounds: 2, pathsDropped: 8, rounds: 3 });
});

test('deltaCoverageFrom: scope 부재(legacy 라운드)는 0으로 센다', () => {
  const cov = sd.deltaCoverageFrom({ rounds: [{}, { scope: null }, { verdict: 'NICE' }] });
  assert.deepEqual(cov, { deltaRounds: 0, pathsDropped: 0, rounds: 3 });
});

test('deltaCoverageFrom: 어떤 입력에도 던지지 않는다', () => {
  [undefined, null, 0, '', [], { rounds: 'x' }, { rounds: [null, 3, 'a'] }].forEach(function (v) {
    assert.doesNotThrow(function () { sd.deltaCoverageFrom(v); });
  });
});
