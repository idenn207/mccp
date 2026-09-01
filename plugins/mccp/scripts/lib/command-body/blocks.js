'use strict';

// 정본 셸 블록 추출기 (diverse-agent-review M5 Task 1).
//
// 저장소에는 이 추출기가 최소 네 벌 있었고 셋은 fence 를 0칼럼에 고정해 들여쓴 fence
// 13건(plan 2 · pr 1 · prp-implement 8 · santa-loop 2)을 보지 못했다. 넷째
// (`tests/command-tmp-worktree-safe.test.js`)만 들여쓰기와 `sh`/`shell` 태그를 처리한다.
// 이 모듈은 발명이 아니라 **그 넷째의 승격**이다.
//
// ── 닫힘 판정에 들여쓰기를 쓰지 않는 이유 (Implement-Codex R1 F3) ──
// 블록이 열린 상태에서 만나는 fence 는 들여쓰기·언어태그와 무관하게 그 블록을 닫는다.
// 초안은 plan Task 1 의 문면대로 "닫는 fence 는 여는 fence 이상의 들여쓰기"를 요구했는데,
// 그 술어는 dedented closer 를 닫힘으로 인정하지 않아 블록이 뒤따르는 산문과 다음 fence 를
// 통째로 삼킨다. 실측으로 재현됐다 — 그 초안으로 S1 을 돌리면 위반이 32/32 로 보고되고
// (참값 5) 원인은 규칙이 아니라 경계 붕괴였다. 경계가 무너지면 세 규칙의 판정이 전부
// 무의미해지므로 이것은 성능이 아니라 정확성 문제다.
//
// 언어 태그 없는 fence 는 bash 블록을 **열지 않는다**(`BASH_LANGS` 불일치). 닫을 수는 있다.

const FENCE_RE = /^(\s*)```(\w*)/;
const BASH_LANGS = /^(bash|sh|shell)$/;

// src 안의 모든 fenced block 을 반환한다.
//   { lang, start, end, indent, lines }
// `start`/`end` 는 여는/닫는 fence 자신의 1-based 줄번호다(내용이 아니라 fence).
// 따라서 `lines[i]` 의 1-based 줄번호는 `start + 1 + i` 이며, 규칙은 이 식으로만
// 줄번호를 도출한다 — 자체 정규식으로 경계를 재판정하지 않는다.
// 닫히지 않은 채 EOF 에 도달한 블록도 반환하되 `end` 는 마지막 줄이고 `unterminated`
// 가 true 다. 조용히 버리면 그 파일의 마지막 블록이 규칙 사거리 밖으로 사라진다.
function extractBlocks(src) {
  const lines = String(src == null ? '' : src).split(/\r?\n/);
  const out = [];
  let cur = null;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE_RE);
    if (!m) continue;

    if (cur === null) {
      cur = { lang: m[2], indent: m[1].length, startIdx: i };
      continue;
    }

    // 열려 있으면 이 fence 가 무엇이든 닫는다 (위 주석 참조).
    out.push({
      lang: cur.lang,
      indent: cur.indent,
      start: cur.startIdx + 1,
      end: i + 1,
      lines: lines.slice(cur.startIdx + 1, i),
      unterminated: false,
    });
    cur = null;
  }

  if (cur !== null) {
    out.push({
      lang: cur.lang,
      indent: cur.indent,
      start: cur.startIdx + 1,
      end: lines.length,
      lines: lines.slice(cur.startIdx + 1),
      unterminated: true,
    });
  }

  return out;
}

// bash/sh/shell 로 태깅된 블록만. 얇은 래퍼이며 판정 로직을 갖지 않는다.
function bashBlocks(src) {
  return extractBlocks(src).filter(function (b) { return BASH_LANGS.test(b.lang); });
}

// 블록 내용의 절대 줄번호. 규칙 구현이 `start + 1 + idx` 를 각자 재발명하면
// off-by-one 이 규칙마다 따로 생긴다.
function lineNumberOf(block, idx) {
  return block.start + 1 + idx;
}

module.exports = {
  extractBlocks: extractBlocks,
  bashBlocks: bashBlocks,
  lineNumberOf: lineNumberOf,
  FENCE_RE: FENCE_RE,
  BASH_LANGS: BASH_LANGS,
};
