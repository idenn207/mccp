'use strict';

// 축 D 절단 A가 심는 **신호**다. 탐지기가 아니다 — 연기 감지기를 시험할 때
// 연기를 피우는 것과 같다. 이 파일의 존재를 단언하는 test는 없고, 판정 경로의
// 어떤 단계도 이것을 이름으로 알지 못한다. 그래서 A는 순환이 아니다.
//
// 이 파일은 `wiring-cut.js --apply-red`가 만들고 `--revert-red`가 지운다.
// 저장소에 커밋된 채로 남으면 안 된다.

const test = require('node:test');
const assert = require('node:assert');

test('axis-D negative control: this file exists to make the suite red', () => {
  assert.strictEqual('cut', 'intact', 'wiring-cut axis D: planted failure (expected)');
});
