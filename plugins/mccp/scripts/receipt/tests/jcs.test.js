'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { canonicalize } = require('../jcs');

test('jcs: null', function () {
  assert.strictEqual(canonicalize(null), 'null');
});

test('jcs: booleans', function () {
  assert.strictEqual(canonicalize(true), 'true');
  assert.strictEqual(canonicalize(false), 'false');
});

test('jcs: integers', function () {
  assert.strictEqual(canonicalize(0), '0');
  assert.strictEqual(canonicalize(-0), '0');
  assert.strictEqual(canonicalize(1), '1');
  assert.strictEqual(canonicalize(-1), '-1');
  assert.strictEqual(canonicalize(1e21), '1e+21');
});

test('jcs: floats use ECMA-262 ToString', function () {
  assert.strictEqual(canonicalize(0.1), '0.1');
  assert.strictEqual(canonicalize(1.5), '1.5');
  assert.strictEqual(canonicalize(1e-7), '1e-7');
});

test('jcs: rejects non-finite numbers', function () {
  assert.throws(function () { canonicalize(NaN); }, /non-finite/);
  assert.throws(function () { canonicalize(Infinity); }, /non-finite/);
  assert.throws(function () { canonicalize(-Infinity); }, /non-finite/);
});

test('jcs: strings', function () {
  assert.strictEqual(canonicalize(''), '""');
  assert.strictEqual(canonicalize('a'), '"a"');
  assert.strictEqual(canonicalize('a\nb'), '"a\\nb"');
  assert.strictEqual(canonicalize('a"b'), '"a\\"b"');
  assert.strictEqual(canonicalize('a\\b'), '"a\\\\b"');
});

test('jcs: korean strings preserve UTF-8 (no \\u escaping)', function () {
  assert.strictEqual(canonicalize('한글'), '"한글"');
  assert.strictEqual(canonicalize('테스트 메시지'), '"테스트 메시지"');
});

test('jcs: empty object', function () {
  assert.strictEqual(canonicalize({}), '{}');
});

test('jcs: object keys are sorted', function () {
  assert.strictEqual(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.strictEqual(canonicalize({ z: 1, m: 2, a: 3 }), '{"a":3,"m":2,"z":1}');
});

test('jcs: object same regardless of insertion order', function () {
  const a = { b: 1, a: 2, c: 3 };
  const b = { c: 3, a: 2, b: 1 };
  assert.strictEqual(canonicalize(a), canonicalize(b));
});

test('jcs: arrays preserve order', function () {
  assert.strictEqual(canonicalize([]), '[]');
  assert.strictEqual(canonicalize([3, 1, 2]), '[3,1,2]');
});

test('jcs: nested structures', function () {
  const v = { b: [{ y: 1, x: 2 }], a: { d: 4, c: 3 } };
  const out = canonicalize(v);
  assert.strictEqual(out, '{"a":{"c":3,"d":4},"b":[{"x":2,"y":1}]}');
});

test('jcs: undefined values in object are omitted', function () {
  const v = { a: 1, b: undefined, c: 2 };
  assert.strictEqual(canonicalize(v), '{"a":1,"c":2}');
});

test('jcs: undefined as direct value throws', function () {
  assert.throws(function () { canonicalize(undefined); }, /undefined/);
});

test('jcs: determinism — same logical content same bytes', function () {
  const v1 = { b: { y: 2, x: 1 }, a: [1, 2, { n: 3, m: 4 }] };
  const v2 = JSON.parse(JSON.stringify(v1));
  assert.strictEqual(canonicalize(v1), canonicalize(v2));
});

test('jcs: keys with special characters', function () {
  assert.strictEqual(canonicalize({ 'a"b': 1 }), '{"a\\"b":1}');
  assert.strictEqual(canonicalize({ '': 1, 'a': 2 }), '{"":1,"a":2}');
});

test('jcs: code point sort (UTF-16 units)', function () {
  // 'A' = 0x41, 'B' = 0x42, 'a' = 0x61
  const v = { B: 1, A: 2, a: 3 };
  assert.strictEqual(canonicalize(v), '{"A":2,"B":1,"a":3}');
});
