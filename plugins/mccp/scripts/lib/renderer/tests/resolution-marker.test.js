'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isResolved,
  isDeferred,
  extractMeta,
  stripLineMarker,
  stripMarker,
  escapeMarkerReason,
  buildMarker,
} = require('../parsers/resolution-marker');

test('isResolved — 마커 존재 시 true', () => {
  assert.equal(isResolved('- 질문 <!--mccp:resolved-->'), true);
  assert.equal(isResolved('- 질문 <!--mccp:resolved reason="구조 변경" at="2026-06-25T00:00:00Z"-->'), true);
});

test('isResolved — bare [x] 체크박스는 false (Codex 재설계 F1)', () => {
  assert.equal(isResolved('- [x] 이미 답한 질문'), false);
  assert.equal(isResolved('- [X] 대문자 체크'), false);
  assert.equal(isResolved('- [ ] 미답 질문'), false);
});

test('isResolved — fail-open on null/undefined/object', () => {
  assert.equal(isResolved(null), false);
  assert.equal(isResolved(undefined), false);
  assert.equal(isResolved({}), false);
});

test('isDeferred — trailing deferred 마커 인정, resolved 와 분리', () => {
  const line = '- "작업범위순" 정의: 보류. <!--mccp:deferred reason="측정 단위 미정 future-work" at="2026-06-30T13:06:10Z"-->';
  assert.equal(isDeferred(line), true, 'deferred 마커 인정');
  assert.equal(isResolved(line), false, 'deferred 는 resolved 아님(항목 active 유지, F1)');
  assert.equal(isDeferred('- 그냥 질문'), false);
  assert.equal(isDeferred(null), false);
});

test('stripMarker/stripLineMarker — trailing deferred 마커도 display 에서 제거(누출 0)', () => {
  // 핵심 회귀 — 이전엔 resolved 만 strip 해 deferred 가 escape 되어 대시보드에 누출됐다.
  const line = '- "작업범위순" 정의: 보류. <!--mccp:deferred reason="측정 단위 미정" at="2026-06-30T13:06:10Z"-->';
  assert.equal(stripMarker(line), '- "작업범위순" 정의: 보류.', 'stripMarker 가 deferred 제거');
  const sm = stripLineMarker(line);
  assert.equal(sm.line, '- "작업범위순" 정의: 보류.', 'stripLineMarker 가 deferred 제거');
  assert.equal(sm.resolved, false, 'deferred 는 resolved=false 유지(active)');
  // 표 셀 안전성 — deferred 마커가 최종 `|` 뒤에 와도 phantom 셀 0.
  const row = '| 위험 | 중 | 고 | 완화 |<!--mccp:deferred reason="보류"-->';
  assert.equal(stripLineMarker(row).line, '| 위험 | 중 | 고 | 완화 |');
});

test('stripMarker — mid-prose deferred 문서 언급은 보존(trailing-only)', () => {
  const doc = 'deferred 신호는 `<!--mccp:deferred-->` 마커로 표기';
  assert.equal(stripMarker(doc), doc, 'mid-prose deferred 마커는 display 보존');
  assert.equal(isDeferred(doc), false, 'mid-prose deferred 마커는 미인정');
});

test('extractMeta — reason/at 추출', () => {
  const m = extractMeta('행 <!--mccp:resolved reason="더 이상 필요 없음" at="2026-06-25T01:00:00Z"-->');
  assert.equal(m.reason, '더 이상 필요 없음');
  assert.equal(m.at, '2026-06-25T01:00:00Z');
});

test('extractMeta — reason only / 마커 없음', () => {
  assert.deepEqual(extractMeta('x <!--mccp:resolved reason="just reason"-->'), { reason: 'just reason', at: null });
  assert.deepEqual(extractMeta('plain line'), { reason: null, at: null });
});

test('stripLineMarker — 행끝 마커가 표 셀 split 이전 제거 (Codex F2)', () => {
  const raw = '| 위험 텍스트 | 중 | 고 | 완화책 |<!--mccp:resolved reason="해결" at="2026-06-25T00:00:00Z"-->';
  const { line, resolved, meta } = stripLineMarker(raw);
  assert.equal(resolved, true);
  assert.equal(meta.reason, '해결');
  // cleaned line 은 마커 없는 정상 표 행 — split 시 4 셀.
  assert.equal(line, '| 위험 텍스트 | 중 | 고 | 완화책 |');
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  assert.equal(cells.length, 4);
  assert.equal(cells[0], '위험 텍스트');
});

test('stripLineMarker — 마커 없는 행은 그대로', () => {
  const { line, resolved } = stripLineMarker('| 위험 | 중 | 고 | 완화 |');
  assert.equal(resolved, false);
  assert.equal(line, '| 위험 | 중 | 고 | 완화 |');
});

test('stripMarker — trailing 마커만 제거 (display 누출 0, Constraint 3)', () => {
  assert.equal(stripMarker('질문 텍스트 <!--mccp:resolved reason="x"-->'), '질문 텍스트');
  assert.equal(stripMarker(null), '');
});

test('stripMarker/isResolved — mid-prose 문서 언급은 보존·미인정 (메타-케이스)', () => {
  // plan 본문이 마커 컨벤션을 backtick 으로 *문서화* 할 때: 마커가 라인 끝이 아니므로
  // resolved 아님 + display 에서 보존(문서 손실 방지).
  const doc = 'resolved 신호는 `<!--mccp:resolved-->` 마커만';
  assert.equal(isResolved(doc), false, 'mid-prose 마커는 resolved 아님');
  assert.equal(stripMarker(doc), doc, 'mid-prose 마커는 display 보존');
});

test('escapeMarkerReason — |/"/--> 제거 (Codex F2)', () => {
  const r = escapeMarkerReason('reason with | pipe and "quote" and --> close');
  assert.equal(r.indexOf('|'), -1, 'pipe 제거');
  assert.equal(r.indexOf('"'), -1, 'double-quote 제거');
  assert.equal(r.indexOf('-->'), -1, '주석 종료 시퀀스 제거');
});

test('escapeMarkerReason — 개행 제거 + 길이 cap', () => {
  const r = escapeMarkerReason('line1\nline2');
  assert.equal(r, 'line1 line2');
  const long = escapeMarkerReason('x'.repeat(500));
  assert.ok(long.length <= 200);
});

test('buildMarker — escape 강제 + reason/at round-trip', () => {
  const marker = buildMarker('reason | with "specials" -->', '2026-06-25T00:00:00Z');
  // 생성된 마커는 다시 parse 가능 + reason 에 위험 문자 없음.
  assert.equal(isResolved('row |' + marker), true);
  const meta = extractMeta(marker);
  assert.equal(meta.reason.indexOf('|'), -1);
  assert.equal(meta.reason.indexOf('"'), -1);
  assert.equal(meta.reason.indexOf('-->'), -1);
  assert.equal(meta.at, '2026-06-25T00:00:00Z');
  // 표 행에 붙여도 stripLineMarker 후 셀 무손상.
  const { line } = stripLineMarker('| a | b | c | d |' + marker);
  assert.equal(line, '| a | b | c | d |');
});

test('buildMarker — reason 없으면 reason 속성 생략', () => {
  const marker = buildMarker('', '2026-06-25T00:00:00Z');
  assert.equal(/reason=/.test(marker), false);
  assert.equal(isResolved(marker), true);
});
