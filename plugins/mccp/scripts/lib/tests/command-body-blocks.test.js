'use strict';

// diverse-agent-review M5 Task 1 — 정본 셸 블록 추출기 계약.
//
// 이 저장소에는 이 추출기가 최소 네 벌 있었고 셋은 fence 를 0칼럼에 고정해 들여쓴 fence
// 13건을 보지 못했다. 여기서 고정하는 것은 그 차이와, 승격 과정에서 **새로 생길 수 있었던**
// 실패(dedented closer 가 후속 블록을 삼킴 — Implement-Codex R1 F3)다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { extractBlocks, bashBlocks, lineNumberOf } = require('../command-body/blocks');

const COMMANDS_DIR = path.join(__dirname, '..', '..', '..', 'commands');

test('indented opening fences are visible (the 0-column copies could not see them)', function () {
  const src = [
    'prose',
    '  ```bash',
    '  echo hi',
    '  ```',
    'more prose',
  ].join('\n');
  const bb = bashBlocks(src);
  assert.equal(bb.length, 1);
  assert.equal(bb[0].indent, 2);
  assert.deepEqual(bb[0].lines, ['  echo hi']);
});

test('sh and shell tags count as bash; other languages do not', function () {
  const langs = ['bash', 'sh', 'shell'];
  langs.forEach(function (lang) {
    assert.equal(bashBlocks('```' + lang + '\nx\n```').length, 1, lang + ' should count');
  });
  ['json', 'markdown', 'jsonc', 'regex', 'js'].forEach(function (lang) {
    assert.equal(bashBlocks('```' + lang + '\nx\n```').length, 0, lang + ' must not count');
  });
});

test('an untagged fence does not open a bash block', function () {
  assert.equal(bashBlocks('```\necho hi\n```').length, 0);
});

// ── Implement-Codex R1 F3 ────────────────────────────────────────────────────
// plan Task 1 의 문면은 "닫는 fence 는 여는 fence 이상의 들여쓰기"였다. 그 술어를 그대로
// 구현하면 dedented closer 가 닫힘으로 인정되지 않아 블록이 뒤따르는 산문과 다음 fence 를
// 통째로 삼킨다. 경계가 무너지면 세 규칙의 판정이 전부 무의미해지므로 정확성 문제다.
test('F3 — a dedented closing fence still closes the block and does not swallow the next one', function () {
  const src = [
    '  ```bash',
    '  first',
    '```',              // 여는 fence 보다 얕다
    'prose between',
    '```bash',
    'second',
    '```',
  ].join('\n');
  const bb = bashBlocks(src);
  assert.equal(bb.length, 2, 'the dedented closer must not merge the two blocks');
  assert.deepEqual(bb[0].lines, ['  first']);
  assert.deepEqual(bb[1].lines, ['second']);
  assert.equal(bb[0].start, 1);
  assert.equal(bb[0].end, 3);
});

test('a tagged fence closes an open block (fences do not nest)', function () {
  const src = [
    '```bash',
    'first',
    '```json',          // 열려 있으므로 이 fence 는 닫는다
    '{"a":1}',
    '```',
  ].join('\n');
  const all = extractBlocks(src);
  assert.equal(all.length, 2);
  assert.equal(all[0].lang, 'bash');
  assert.deepEqual(all[0].lines, ['first']);
});

test('an unterminated block is reported, not silently dropped', function () {
  const src = ['```bash', 'orphan', 'still orphan'].join('\n');
  const bb = bashBlocks(src);
  assert.equal(bb.length, 1);
  assert.equal(bb[0].unterminated, true);
  assert.deepEqual(bb[0].lines, ['orphan', 'still orphan']);
});

test('lineNumberOf maps block content back to absolute 1-based lines', function () {
  const src = ['a', 'b', '```bash', 'first', 'second', '```'].join('\n');
  const b = bashBlocks(src)[0];
  assert.equal(b.start, 3);
  assert.equal(lineNumberOf(b, 0), 4);
  assert.equal(lineNumberOf(b, 1), 5);
});

test('CRLF input is handled identically to LF', function () {
  const lf = bashBlocks('```bash\nx\n```');
  const crlf = bashBlocks('```bash\r\nx\r\n```');
  assert.deepEqual(crlf.map(function (b) { return b.lines; }), lf.map(function (b) { return b.lines; }));
});

// ── 승격의 실질 차이를 실코퍼스에 고정한다 ─────────────────────────────────────
// 이 단언이 없으면 "승격했다"가 합성 fixture 위에서만 참일 수 있다.
test('the live corpus contains indented bash fences that a 0-column extractor misses', function () {
  const files = fs.readdirSync(COMMANDS_DIR).filter(function (f) { return f.endsWith('.md'); });
  assert.ok(files.length > 0, 'expected command markdown under ' + COMMANDS_DIR);

  let indented = 0;
  const perFile = {};
  files.forEach(function (f) {
    const src = fs.readFileSync(path.join(COMMANDS_DIR, f), 'utf8');
    const n = bashBlocks(src).filter(function (b) { return b.indent > 0; }).length;
    if (n) { perFile[f] = n; indented += n; }
  });

  // 모수 비공허 — 0 이면 이 단언은 공허하게 green 이 된다.
  assert.ok(indented > 0, 'indented bash fences must exist for this guard to mean anything');
  assert.equal(indented, 13, 'measured 2026-08-31: plan 2 · pr 1 · prp-implement 8 · santa-loop 2');
  assert.deepEqual(Object.keys(perFile).sort(), ['plan.md', 'pr.md', 'prp-implement.md', 'santa-loop.md']);
});
