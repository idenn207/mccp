'use strict';

// `markdownHash` read 초크포인트 회귀 (codex-harness-portability M3 — security S3/S4).
//
// **왜 ingress가 아니라 여기인가.** `--plan <path>`는 프롬프트에서 오고 진입점이 넷이다
// (`receipt-prompt.js` · `receipt-skill.js` · `receipt-prompt-submit.js` · `receipt/cli.js`).
// 그중 셋은 어떤 검사도 하지 않으므로, 수정 전에는 평문 `--plan /dev/zero` 하나로 무제한
// `readFileSync`에 도달했다 — 따옴표 우회조차 필요 없었다. 방어를 ingress마다 두면 새
// ingress가 생길 때 다시 빠뜨리므로 **읽는 자리 하나**에 둔다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const hash = require('../hash');

test('(a) 정규 파일이 아니면 해싱을 거부한다 — 크기가 아니라 isFile이 실효 가드다', () => {
  // `/dev/zero`는 `size`를 **0으로 보고**한다. 그래서 "size <= cap"만 재는 구현은 그것을
  // 통과시키고 곧바로 메모리를 소진한다(security S4). 이 test가 고정하는 것은 상한이
  // 아니라 `isFile()`이다.
  if (!fs.existsSync('/dev/zero')) return;   // 비POSIX 호스트에서는 이 축을 재지 않는다
  assert.strictEqual(fs.statSync('/dev/zero').size, 0, '전제가 깨졌다: /dev/zero의 size가 0이 아니다');
  assert.throws(() => hash.markdownHash('/dev/zero'), /non-regular file/);
});

test('(b) FIFO도 같은 이유로 거부된다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fifo-'));
  const fifo = path.join(dir, 'f.md');
  const r = require('child_process').spawnSync('mkfifo', [fifo], { shell: false });
  try {
    if (r.status !== 0) return;             // mkfifo 부재 — 축을 재지 않는다
    assert.throws(() => hash.markdownHash(fifo), /non-regular file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(c) 상한을 넘는 정규 파일은 거부된다 — 심층 방어', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-big-'));
  const big = path.join(dir, 'big.md');
  try {
    fs.writeFileSync(big, Buffer.alloc(hash.MAX_MARKDOWN_BYTES + 1, 0x61));
    assert.throws(() => hash.markdownHash(big), /above the .* cap/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(d) 정상 파일의 해시값은 바뀌지 않는다 — 기존 receipt를 stale로 만들지 않는다', () => {
  // 이것이 이 변경의 가장 큰 위험이다. bounded read가 바이트를 하나라도 다르게 읽으면
  // 저장소의 모든 receipt가 조용히 stale이 된다.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-eq-'));
  const f = path.join(dir, 'a.md');
  try {
    const body = '---\nstatus: x\n---\n\n# Title\r\n\ntrailing   \n\n\n';
    fs.writeFileSync(f, body);
    const legacy = 'sha256:' + crypto.createHash('sha256')
      .update(hash.canonicalizeMarkdown(fs.readFileSync(f, 'utf8')), 'utf8').digest('hex');
    assert.strictEqual(hash.markdownHash(f), legacy);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(e) 멀티바이트 경계에서도 온전히 읽는다 — 부분 read 누적의 회귀', () => {
  // bounded read는 `readSync`를 루프로 돌린다. 잘못 누적하면 UTF-8 문자가 잘려 해시가
  // 조용히 달라진다.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-utf8-'));
  const f = path.join(dir, 'k.md');
  try {
    const body = '# 한글 제목\n\n' + '가나다라마바사'.repeat(5000) + '\n';
    fs.writeFileSync(f, body);
    assert.strictEqual(hash.readTextBounded(f), body);
    assert.strictEqual(hash.markdownHash(f), 'sha256:' + crypto.createHash('sha256')
      .update(hash.canonicalizeMarkdown(body), 'utf8').digest('hex'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(f) markdownHashStructural도 같은 초크포인트를 지난다', () => {
  if (!fs.existsSync('/dev/zero')) return;
  assert.throws(() => hash.markdownHashStructural('/dev/zero'), /non-regular file/);
});

test('(g) 부재 파일의 오류 형태는 보존된다 — 호출자가 이미 다루는 형태다', () => {
  assert.throws(() => hash.markdownHash(path.join(os.tmpdir(), 'mccp-absent-' + process.pid + '.md')),
    (err) => err && err.code === 'ENOENT');
});
