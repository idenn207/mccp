'use strict';

// value.test.js — 값 규약 파서의 계약.
//
// 이 파일의 중심은 **T-BYPASS**다. DD3은 «bypass-flag의 수용 집합은 오늘과 바이트 단위로
// 동일하다»를 설계의 안전 근거로 삼는데, 그 주장은 실행되는 단언이 없으면 주석일 뿐이다.
// 초안이 정확히 그 상태였고(«notice가 보여야 한다»는 주석), 그래서 여기서는 고정 적대
// 코퍼스 전량을 돌려 **하나도 활성화하지 못함**을 확인한다. 코퍼스가 비었거나 bypass-flag
// 항목이 0개면 공허 통과가 아니라 실패다.

const test = require('node:test');
const assert = require('node:assert/strict');

const value = require('../value');
const registry = require('../registry');

// 고정 적대 코퍼스 — 정확히 10개. 넓히려는 모든 시도(별칭 · 대소문자 · 공백 · 접두 0 ·
// 사람 말투)를 한 줄씩 대표한다.
const ADVERSARIAL = Object.freeze([
  'on', 'true', 'yes', 'enabled', 'TRUE', 'On', '1 ', ' 1', '01', 'yes please',
]);

function silent(fn) {
  const orig = process.stderr.write;
  const seen = [];
  process.stderr.write = function (s) { seen.push(String(s)); return true; };
  try {
    return { value: fn(), stderr: seen };
  } finally {
    process.stderr.write = orig;
  }
}

test('export 표면이 계획서 산문과 일치한다', () => {
  const want = ['TRUE_ALIASES', 'FALSE_ALIASES', 'BYPASS_ACTIVATING_LITERAL',
    'parseBool', 'parseEnum', 'parseIntInRange', 'parseList'];
  want.forEach((k) => assert.ok(k in value, 'missing export: ' + k));
  assert.equal(value.BYPASS_ACTIVATING_LITERAL, '1');
});

test('T-BYPASS — 적대 코퍼스 전량이 bypass-flag를 활성화하지 못한다', () => {
  const flags = registry.byKind('bypass-flag');
  assert.ok(flags.length > 0, 'bypass-flag 항목이 0개면 이 검사는 공허하다');
  assert.equal(ADVERSARIAL.length, 10, '코퍼스가 비거나 줄면 공허 통과가 된다');

  let checked = 0;
  flags.forEach((e) => {
    ADVERSARIAL.forEach((raw) => {
      const got = value.parseBool({ [e.name]: raw }, e.name);
      assert.equal(got, false,
        e.name + '=' + JSON.stringify(raw) + ' must stay inert — the acceptance set is byte-identical to pre-1.29.1');
      checked++;
    });
    // 그리고 유일한 활성화 리터럴은 실제로 활성화해야 한다 — 좁아지는 방향의 회귀도 결함이다.
    assert.equal(value.parseBool({ [e.name]: '1' }, e.name), true, e.name + '=1 must activate');
    assert.equal(value.parseBool({}, e.name), false, e.name + ' unset must be inert');
  });
  assert.equal(checked, flags.length * ADVERSARIAL.length);
  process.stdout.write('T-BYPASS checked=' + checked + '\n');
});

test('bypass-flag는 warn을 내지 않는다 — 동작이 바뀌지 않았으므로 알릴 사건이 없다', () => {
  const e = registry.byKind('bypass-flag')[0];
  const r = silent(() => value.parseBool({ [e.name]: 'true' }, e.name));
  assert.equal(r.value, false);
  assert.equal(r.stderr.length, 0, 'DD3: 관측은 차단이 아니고, 이 kind는 동작 변경이 0이다');
});

test('bool은 DD1 별칭 집합을 대소문자·공백 무시로 받는다', () => {
  const e = registry.byKind('bool').find((x) => x.default === 'off');
  assert.ok(e, 'default off인 bool 항목이 있어야 이 검사가 성립한다');
  ['on', '1', 'true', 'yes', 'enabled', 'ON', ' On ', 'YES'].forEach((v) => {
    assert.equal(value.parseBool({ [e.name]: v }, e.name), true, 'ON: ' + v);
  });
  ['off', '0', 'false', 'no', 'disabled', 'OFF', ' off '].forEach((v) => {
    assert.equal(value.parseBool({ [e.name]: v }, e.name), false, 'OFF: ' + v);
  });
});

test('bool의 열거 밖 값은 레지스트리 기본값으로 되돌아가고 loud warn을 낸다', () => {
  const on = registry.byKind('bool').find((x) => x.default === 'on');
  const off = registry.byKind('bool').find((x) => x.default === 'off');
  assert.ok(on && off, '양 극성의 bool 항목이 모두 있어야 방향을 검사할 수 있다');

  const a = silent(() => value.parseBool({ [on.name]: 'ture' }, on.name));
  assert.equal(a.value, true, 'default-on 토글은 기본값으로 복귀한다');
  assert.equal(a.stderr.length, 1, '오타는 표면화된다');
  assert.match(a.stderr[0], new RegExp(on.name));

  const b = silent(() => value.parseBool({ [off.name]: 'ture' }, off.name));
  assert.equal(b.value, false);
  assert.equal(b.stderr.length, 1);
});

test('미설정과 빈 문자열은 기본값이며 조용하다 — 꺼진 토글은 사건이 아니다', () => {
  const e = registry.byKind('bool').find((x) => x.default === 'off');
  const r1 = silent(() => value.parseBool({}, e.name));
  const r2 = silent(() => value.parseBool({ [e.name]: '' }, e.name));
  assert.equal(r1.value, false);
  assert.equal(r2.value, false);
  assert.equal(r1.stderr.length, 0);
  assert.equal(r2.stderr.length, 0);
});

test('미등록 이름은 throw한다 — 조용히 동작하는 토글을 코드 수준에서 닫는다', () => {
  assert.throws(() => value.parseBool({}, 'MCCP_NOT_REGISTERED_AT_ALL'), /unregistered toggle/);
  assert.throws(() => value.parseEnum({}, 'MCCP_NOT_REGISTERED_AT_ALL'), /unregistered toggle/);
  assert.throws(() => value.parseIntInRange({}, 'MCCP_NOT_REGISTERED_AT_ALL'), /unregistered toggle/);
  assert.throws(() => value.parseList({}, 'MCCP_NOT_REGISTERED_AT_ALL'), /unregistered toggle/);
});

test('상속 멤버는 값으로 오인되지 않는다', () => {
  const e = registry.byKind('bool').find((x) => x.default === 'off');
  // `toString`은 모든 객체에 있지만 own property가 아니다.
  assert.equal(value.parseBool(Object.create({ [e.name]: 'on' }), e.name), false);
});

test('kind가 다르면 throw한다 — 파서를 잘못 고르는 것은 조용한 오독이다', () => {
  const en = registry.byKind('enum')[0];
  const bo = registry.byKind('bool')[0];
  assert.throws(() => value.parseBool({}, en.name), /parseBool called on kind/);
  assert.throws(() => value.parseEnum({}, bo.name), /parseEnum called on kind/);
});

test('parseEnum — 열거 안은 그대로, 밖은 기본값 + warn', () => {
  const e = registry.byKind('enum').find((x) => x.default !== null && x.values.length > 1);
  assert.ok(e);
  const other = e.values.find((v) => v !== e.default);
  assert.equal(value.parseEnum({ [e.name]: other }, e.name), other);
  assert.equal(value.parseEnum({ [e.name]: ' ' + other + ' ' }, e.name), other);
  const r = silent(() => value.parseEnum({ [e.name]: 'definitely-not-a-member' }, e.name));
  assert.equal(r.value, e.default);
  assert.equal(r.stderr.length, 1);
});

test('parseIntInRange — 정수·범위·불량값', () => {
  const e = registry.byKind('int').find((x) => x.default !== null);
  assert.ok(e);
  const def = Number.parseInt(e.default, 10);
  assert.equal(value.parseIntInRange({}, e.name), def);
  assert.equal(value.parseIntInRange({ [e.name]: '7' }, e.name), 7);
  const bad = silent(() => value.parseIntInRange({ [e.name]: 'seven' }, e.name));
  assert.equal(bad.value, def);
  assert.equal(bad.stderr.length, 1);
  const low = silent(() => value.parseIntInRange({ [e.name]: '0' }, e.name, { min: 1, max: 3 }));
  assert.equal(low.value, def);
  const high = silent(() => value.parseIntInRange({ [e.name]: '99' }, e.name, { min: 1, max: 3 }));
  assert.equal(high.value, def);
});

test('parseList — 쉼표 분할 · trim · 빈 항목 제거 · 기본값도 같은 규칙', () => {
  const e = registry.byKind('list').find((x) => x.default);
  assert.ok(e);
  assert.deepEqual(value.parseList({ [e.name]: ' a , b ,, c ' }, e.name), ['a', 'b', 'c']);
  assert.deepEqual(value.parseList({ [e.name]: '' }, e.name), e.default.split(',').map((s) => s.trim()).filter(Boolean));
  const empty = registry.byKind('list').find((x) => x.default === null);
  if (empty) assert.deepEqual(value.parseList({}, empty.name), []);
});

test('별칭 두 집합은 겹치지 않는다', () => {
  const t = new Set(value.TRUE_ALIASES);
  value.FALSE_ALIASES.forEach((v) => assert.ok(!t.has(v), 'overlap: ' + v));
  assert.ok(value.TRUE_ALIASES.indexOf('1') !== -1);
  assert.ok(value.FALSE_ALIASES.indexOf('0') !== -1);
});
