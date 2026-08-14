'use strict';

// multi-session-work-loop M5 Task 7 — 단일 writer 불변식 lint 부정 fixture (G1).
//
// "고치지 않으면 실패한다"를 단언한다(lib/tests/msw-metrics-b2.test.js 선례).
// **양성만 확인하면 lint가 아무것도 안 잡아도 통과한다** — 그것이 CL-5가 4회
// 재발한 구조다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lint = require('../state-journal/single-writer-lint');

function tmpFile(name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm5lint-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

test('M5 lint: the real repository passes all five axes', () => {
  const out = lint.runLint();
  assert.strictEqual(out.ok, true,
    'baseline must be green, otherwise the negative fixtures below prove nothing:\n' +
    JSON.stringify(out.violations, null, 2));
  assert.ok(out.scanned_files > 100, 'the walker actually scanned the tree');
});

test('M5 lint axis 1: a writeStateAtomic call outside state-writer.js fails', () => {
  const f = tmpFile('rogue-writer.js',
    "'use strict';\nfunction rogue(root, state) {\n  writeStateAtomic(root, state);\n}\n");
  const v = lint.axisSingleWriter([f]);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].axis, 1);
});

test('M5 lint axis 2: an edited STATE.md consumer call site fails', () => {
  const f = tmpFile('consumer.js', "'use strict';\nconst s = stateWriter.readState(SOMETHING_ELSE);\n");
  const v = lint.axisConsumerCallsites([{ file: f, text: 'const s = stateWriter.readState(root);' }]);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].axis, 2);
});

test('M5 lint axis 3b: a process.cwd() literal argument fails', () => {
  const f = tmpFile('cl5-literal.js',
    "'use strict';\nfunction endHook(handoffItems) {\n" +
    "  const r = handoffItems.resolveHandoffRoot({});\n" +
    '  const items = handoffItems.enumerateUnfinishedItems(process.cwd());\n  return items;\n}\n');
  const v = lint.axisHandoffPaths([f]);
  assert.ok(v.some(function (x) { return x.axis === 3 && x.rule === 'b'; }),
    'the exact CL-5 form must be rejected');
});

test('M5 lint axis 3b: a one-hop process.cwd() alias fails', () => {
  const f = tmpFile('cl5-alias.js',
    "'use strict';\nfunction endHook(handoffItems) {\n" +
    "  const r = handoffItems.resolveHandoffRoot({});\n" +
    '  const f = process.cwd();\n' +
    '  const items = handoffItems.enumerateUnfinishedItems(f);\n  return items;\n}\n');
  const v = lint.axisHandoffPaths([f]);
  assert.ok(v.some(function (x) { return x.axis === 3 && x.rule === 'b'; }),
    'a literal-only check would let this through');
});

test('M5 lint axis 3c: a value that never passed through resolveHandoffRoot fails', () => {
  // no-op 래퍼 탐지: 새 export를 만들고도 호출부가 쓰지 않으면 (a)·(b) 어느 쪽도
  // 잡지 못한다 — `projectRoot=''` 구멍이 그대로 남는다.
  const f = tmpFile('cl5-noop.js',
    "'use strict';\nfunction endHook(handoffItems, ctx) {\n" +
    '  const r = ctx.projectRoot;\n' +
    '  const items = handoffItems.enumerateUnfinishedItems(r);\n  return items;\n}\n');
  const v = lint.axisHandoffPaths([f]);
  assert.ok(v.some(function (x) { return x.axis === 3 && x.rule === 'c'; }));
});

test('M5 lint axis 4: handoff-items importing the journal fails', () => {
  const f = tmpFile('handoff-coupled.js',
    "'use strict';\nconst j = require('../lib/state-journal/record');\nmodule.exports = { j };\n");
  const v = lint.axisHandoffIndependence(f);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].axis, 4);
});

test('M5 lint axis 5: project.js importing fs fails', () => {
  const f = tmpFile('impure-project.js',
    "'use strict';\nconst fs = require('fs');\nmodule.exports = { fs };\n");
  const v = lint.axisProjectionPurity(f);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].axis, 5);
  assert.strictEqual(v[0].module, 'fs');
});

test('M5 lint axis 2 positive: the CL-5 edits in session-start/session-end do not trip it', () => {
  // G3 주의 — Task 8의 CL-5 편집은 STATE.md 소비 호출부 축의 대상이 **아니다**.
  // 두 축이 한 파일에서 만나므로 이 양성 케이스가 그 분리를 고정한다.
  const v = lint.axisConsumerCallsites();
  const inHooks = v.filter(function (x) {
    return x.file.indexOf('session-start.js') !== -1 || x.file.indexOf('session-end.js') !== -1;
  });
  assert.strictEqual(inHooks.length, 0,
    'the CL-5 argument-passing edits must not register as consumer call-site changes');
});

test('M5 lint: the assertion manifest is fully covered by real test titles', () => {
  const out = lint.runAssertions();
  assert.strictEqual(out.error, undefined, out.error || '');
  assert.ok(Array.isArray(out.assertions) && out.assertions.length > 0,
    'a silent empty manifest is forbidden');
  const absent = out.assertions.filter(function (a) { return !a.present; });
  assert.strictEqual(absent.length, 0,
    'manifest assertions with no matching test() title:\n' +
    absent.map(function (a) { return '  [' + a.task + '] ' + a.title; }).join('\n'));
});
