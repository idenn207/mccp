'use strict';

// DD10 관문 커버리지 (codex-harness-portability M3 — security S7).
//
// `redact-gate.js`의 헤더는 "관문이 하나면 그 구멍은 구조적으로 존재하지 않는다"라고
// 적었는데, 실제로 달성된 것은 **"부르면 하나"**다. 신규 producer가 `fs.writeFileSync`로
// 곧장 tracked 산출물을 쓰면 그것을 잡는 것이 없었다 — 그리고 이 milestone이 추가한
// `reach-probe.js`는 plugin root 절대경로를 재는, 지금까지 중 가장 위험한 producer다.
//
// 런타임으로 불가능하게 만드는 대안(producer에서 `require('fs')` 금지 등)은 이 모듈 수에
// 비해 값이 비싸다. 그래서 §3.17 M6의 래칫과 같은 형태를 쓴다 — 우회를 **금지하지 않고
// 가시화**한다. 목록을 늘리려면 상수를 올리는 별도 편집이 필요하고 그 사실이 diff에
// 숫자로 남는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'codex-probe');

// 관문을 지나지 않고 파일을 쓰는 것이 **정당한** 파일. 이유가 각각 다르다.
const ALLOWED = [
  'redact-gate.js',   // 관문 자신. 여기가 쓰지 않으면 아무도 못 쓴다
  'cli.js',           // 스크래치 홈·lock·auth 사본 — tracked 산출물이 아니다
  'block-probe.js',   // 동上
  'reach-probe.js',   // 동上 (스크래치 설치·hook 스크립트)
  'probe-hook.js',    // 프로브 로그(gitignored)
];
const ALLOWED_CEILING = 5;

// 숫자는 상한이지 정원이 아니다. 늘리려면 이 상수를 함께 올려야 한다.
test('(a) 면제 목록은 상한을 넘지 않는다 — 늘리려면 상수를 고쳐야 한다', () => {
  assert.ok(ALLOWED.length <= ALLOWED_CEILING,
    '면제가 ' + ALLOWED.length + '개로 늘었다. 상수를 올리는 편집이 diff에 남아야 한다');
  assert.strictEqual(ALLOWED.length, ALLOWED_CEILING, '고쳐졌는데 목록에 남아 있다면 줄여라');
});

test('(b) 면제되지 않은 producer는 직접 파일을 쓰지 않는다', () => {
  const offenders = [];
  fs.readdirSync(DIR).filter(function (f) { return f.endsWith('.js'); }).forEach(function (f) {
    if (ALLOWED.indexOf(f) !== -1) return;
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    const code = src.split(/\r?\n/).filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
    if (/fs\.(writeFileSync|writeFile|appendFileSync|createWriteStream)\s*\(/.test(code)) offenders.push(f);
  });
  assert.deepStrictEqual(offenders, [],
    '관문을 지나지 않는 쓰기가 있다: ' + offenders.join(', ') + ' — writeGuarded/emitGuarded를 쓰거나 면제에 사유와 함께 등재하라');
});

test('(c) 면제 목록의 모든 파일이 실재한다 — 화석 금지', () => {
  ALLOWED.forEach(function (f) {
    assert.ok(fs.existsSync(path.join(DIR, f)), '면제 목록에 없는 파일이 있다: ' + f);
  });
});

test('(d) reach 서브커맨드는 관문을 지난다', () => {
  const src = fs.readFileSync(path.join(DIR, 'cli.js'), 'utf8');
  const block = src.slice(src.indexOf("if (sub === 'reach')"));
  assert.ok(/makeGate\(/.test(block.slice(0, 1200)), 'reach가 관문을 만들지 않는다');
  assert.ok(/emitGuarded\(/.test(block.slice(0, 1200)), 'reach의 stdout이 관문을 지나지 않는다');
  assert.ok(/writeGuarded\(/.test(block.slice(0, 1200)), 'reach의 --out이 관문을 지나지 않는다');
});
