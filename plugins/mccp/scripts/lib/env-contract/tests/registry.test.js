'use strict';

// registry.test.js — 레지스트리의 구조 불변식.
//
// 가장 중요한 단언은 **bypass-flag 집합의 동일성**이다. 개수만 보면 네 번째 항목이
// 몰래 들어와도 통과하면서 «게이트를 약화하는 토글은 정확히 3개»라는 주장을 위반한다.
// 그래서 이름까지 비교하고, 이 목록을 바꾸려면 이 test를 함께 고쳐야만 하게 만든다 —
// 그 편집 자체가 리뷰 대상이 되는 것이 설계의 요점이다.

const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../registry');

// DD1이 이름까지 못 박은 집합. 여기를 늘리는 것은 «리뷰 게이트를 약화하는 토글을
// 하나 더 만든다»는 뜻이고, 그 판단은 사람이 한다.
//
// M5(v1.32.0)가 네 번째를 더했다: `MCCP_PLAN_REVIEW_TEST_INVOKE`. 이것은 **게이트를
// 약화하지 않는다** — 반대로 `plan-review/cli.js:542`가 `--invoke-module`(임의 모듈을
// Codex wrapper 자리에 끼워 넣어 «Codex 없이 converged»를 만들 수 있는 플래그)을
// 게이트 실행 경로에서 **거부**하기 위해 요구하는 test 전용 스위치다. 이 이름이
// registry에 없어서 L1이 붉었고(origin/main `b111dca`에서 상속), 등재하지 않으면
// M5는 자기가 확장하는 lint를 green으로 검증할 수 없었다. 셋과 넷의 차이는 개수가
// 아니라 방향이다 — 앞의 셋은 게이트를 열고, 이것은 게이트가 닫혀 있음을 강제한다.
const WANT_BYPASS = [
  'MCCP_ALLOW_CODEX_UNAVAILABLE',
  'MCCP_CODEX_DISABLED',
  'MCCP_SKIP_RECEIPT',
  'MCCP_PLAN_REVIEW_TEST_INVOKE',
].sort();

test('export 표면이 계획서 산문과 일치한다', () => {
  ['ENTRIES', 'names', 'get', 'byKind', 'byDomain'].forEach((k) => {
    assert.ok(k in registry, 'missing export: ' + k);
  });
  assert.ok(Array.isArray(registry.ENTRIES));
  assert.ok(registry.ENTRIES.length > 0);
});

test('bypass-flag 집합이 이름까지 DD1의 3개와 일치한다', () => {
  const got = registry.byKind('bypass-flag').map((e) => e.name).sort();
  assert.deepEqual(got, WANT_BYPASS,
    '이 집합을 바꾸려면 DD1 · 색인 · 이 test를 함께 고쳐야 한다 — 그것이 의도다');
});

test('bool과 bypass-flag는 전부 구체 default를 갖는다 (DD2)', () => {
  const boolish = registry.byKind('bool').concat(registry.byKind('bypass-flag'));
  assert.ok(boolish.length > 0, 'boolean 항목이 0개면 이 검사는 공허하다');
  const nulls = boolish.filter((e) => e.default === null || e.default === undefined);
  assert.deepEqual(nulls.map((e) => e.name), [],
    'default가 null이면 «안전 쪽으로 되돌린다»가 가리킬 대상이 없다');
  boolish.forEach((e) => {
    assert.ok(e.default === 'on' || e.default === 'off', e.name + ': ' + e.default);
    assert.ok(e.polarity === 'enable-by-default' || e.polarity === 'disable-by-default', e.name);
    // 극성과 default는 같은 사실의 두 표기다 — 갈라지면 파서와 문서가 다른 말을 한다.
    assert.equal(e.polarity === 'enable-by-default', e.default === 'on', e.name);
  });
});

test('모든 항목이 비어있지 않은 evidence를 갖는다', () => {
  const missing = registry.ENTRIES.filter((e) => typeof e.evidence !== 'string' || e.evidence.trim() === '');
  assert.deepEqual(missing.map((e) => e.name), []);
});

test('이름은 ASCII 대문자·숫자·밑줄만 — homoglyph와 zero-width가 표현 불가능하다', () => {
  registry.ENTRIES.forEach((e) => {
    assert.match(e.name, registry.NAME_RE, e.name);
    assert.equal(e.name.normalize('NFC'), e.name, e.name);
    assert.equal(Buffer.byteLength(e.name, 'utf8'), e.name.length, e.name + ' must be pure ASCII');
  });
  const names = registry.names();
  assert.equal(new Set(names).size, names.length, '중복 이름 0');
});

test('kind · status · domain · polarity는 선언된 열거 안에 있다', () => {
  registry.ENTRIES.forEach((e) => {
    assert.ok(registry.KINDS.indexOf(e.kind) !== -1, e.name + ' kind=' + e.kind);
    assert.ok(registry.STATUSES.indexOf(e.status) !== -1, e.name + ' status=' + e.status);
    assert.ok(registry.DOMAINS.indexOf(e.domain) !== -1, e.name + ' domain=' + e.domain);
    if (e.polarity !== null) {
      assert.ok(registry.POLARITIES.indexOf(e.polarity) !== -1, e.name + ' polarity=' + e.polarity);
    }
  });
});

test('doc 앵커는 domain과 name에서 파생된다 — 수기 중복이 없다', () => {
  registry.ENTRIES.forEach((e) => {
    assert.equal(e.doc, 'environment/' + e.domain + '.md#' + e.name.toLowerCase(), e.name);
  });
});

test('ENTRIES와 각 항목이 freeze돼 있다 — 런타임 kind 강등 경로가 없다', () => {
  const e = registry.byKind('bypass-flag')[0];
  assert.ok(Object.isFrozen(registry.ENTRIES));
  assert.ok(Object.isFrozen(e));
  assert.throws(() => { e.kind = 'bool'; }, TypeError,
    'bypass-flag를 런타임에 bool로 바꾸는 것은 수용 집합을 조용히 넓히는 것과 같다');
  assert.equal(registry.get(e.name).kind, 'bypass-flag');
});

test('get은 prototype 멤버를 돌려주지 않는다', () => {
  ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach((k) => {
    assert.equal(registry.get(k), null, k);
  });
  assert.equal(registry.get('MCCP_NOT_REGISTERED_AT_ALL'), null);
});

test('byKind · byDomain의 합이 전체와 같다 — 분류 누락 0', () => {
  const byKind = registry.KINDS.reduce((n, k) => n + registry.byKind(k).length, 0);
  const byDomain = registry.DOMAINS.reduce((n, d) => n + registry.byDomain(d).length, 0);
  assert.equal(byKind, registry.ENTRIES.length);
  assert.equal(byDomain, registry.ENTRIES.length);
});

test('bool의 values는 canonical 어휘 on/off 하나뿐이다', () => {
  registry.byKind('bool').forEach((e) => {
    assert.deepEqual(e.values.slice(), ['on', 'off'], e.name);
  });
  registry.byKind('bypass-flag').forEach((e) => {
    assert.deepEqual(e.values.slice(), ['1'], e.name);
  });
});

test('enum은 values가 비어있지 않고, default가 있으면 그 안에 있다', () => {
  const enums = registry.byKind('enum');
  assert.ok(enums.length > 0);
  enums.forEach((e) => {
    assert.ok(Array.isArray(e.values) && e.values.length > 0, e.name);
    if (e.default !== null) assert.ok(e.values.indexOf(e.default) !== -1, e.name + ' default=' + e.default);
  });
});

test('summary는 한 줄이고 비어있지 않다', () => {
  registry.ENTRIES.forEach((e) => {
    assert.ok(typeof e.summary === 'string' && e.summary.trim() !== '', e.name);
    assert.equal(e.summary.indexOf('\n'), -1, e.name);
  });
});

test('마커 — 7c가 대조할 수치를 stdout에 찍는다', () => {
  const entries = registry.ENTRIES.length;
  const bypass = registry.byKind('bypass-flag').length;
  const boolish = registry.byKind('bool').concat(registry.byKind('bypass-flag'));
  const boolnull = boolish.filter((e) => e.default === null || e.default === undefined).length;
  process.stdout.write('REGISTRY entries=' + entries + ' bypass=' + bypass + ' boolnull=' + boolnull + '\n');
  assert.ok(entries >= 100, 'registry가 전 표면을 덮어야 한다');
  assert.equal(boolnull, 0);
});
