'use strict';

// Dashboard Truthfulness M3 — 해결 마커 컨벤션 (pure, read-side, table-safe).
//
// 위험/OQ 행에 비파괴 해결 마커를 단다: `<!--mccp:resolved reason="…" at="…"-->`.
// resolved 신호는 **이 마커뿐**(Codex 재설계 F1 — bare `- [x]` 체크박스는 평가·
// 증거·승인 없이 live OQ 를 숨길 수 있으므로 resolved 로 보지 않는다).
// 마커는 표 셀 split 이전 raw 라인 단위로 추출·제거(Codex F2 — phantom 셀 0).
// 모든 함수 fail-open (throw 안 함).

// 두 capture group: reason(1), at(2). 둘 다 optional, 순서는 reason→at.
// **trailing-only 컨벤션**: 마커는 행/항목 라인의 *끝*에만 위치한다(applier 단일
// placement). reader 도 trailing 만 resolved 신호로 인정해야, plan 본문이 마커
// 컨벤션을 *문서화*(prose 안에 backtick 으로 `<!--mccp:resolved-->` 언급)할 때
// 그 항목이 거짓 resolved 로 숨겨지지 않는다(메타-케이스 차단).
const MARKER_SRC = '<!--\\s*mccp:resolved(?:\\s+reason="([^"]*)")?(?:\\s+at="([^"]*)")?\\s*-->';
// 호환용 base(위치 무관) — 외부 참조/디버그용.
const RESOLVED_RE = new RegExp(MARKER_SRC);
// trailing-anchored — 실제 detection/strip 의 진실원.
const RESOLVED_TRAILING_RE = new RegExp(MARKER_SRC + '\\s*$');

// deferred 마커 — 항목이 **여전히 open** 임을 문서화하는 주석(결정은 났으나 답은
// future-work). resolved 신호가 **아니므로** isResolved 는 절대 매칭하지 않는다(항목
// active 유지 = 정직). 단, rendered surface 에 raw HTML 주석이 escape 되어 누출되지
// 않도록 display strip(stripMarker/stripLineMarker)은 resolved 와 동일하게 제거한다.
const DEFERRED_SRC = '<!--\\s*mccp:deferred(?:\\s+reason="([^"]*)")?(?:\\s+at="([^"]*)")?\\s*-->';
const DEFERRED_TRAILING_RE = new RegExp(DEFERRED_SRC + '\\s*$');
// display strip 전용 — trailing resolved **또는** deferred 마커를 제거. detection
// (isResolved)에는 영향 없음(resolved 만 매칭). trailing-only 라 mid-prose 문서화는 보존.
const ANY_MARKER_TRAILING_RE = new RegExp('(?:' + MARKER_SRC + '|' + DEFERRED_SRC + ')\\s*$');

const REASON_CAP = 200;

// 라인 *끝* 의 `<!--mccp:resolved-->` 마커만 resolved 로 인정(trailing-only).
// bare `[x]` 는 false (F1). 본문 mid-prose 마커 언급(문서화)도 false.
function isResolved(rawLine) {
  if (rawLine == null) return false;
  try { return new RegExp(RESOLVED_TRAILING_RE).test(String(rawLine)); }
  catch (_) { return false; }
}

// 라인 *끝* 의 `<!--mccp:deferred-->` 마커 인정(trailing-only). resolved 와 별개 —
// 항목은 active 로 남되 display 에서만 strip 된다. detection 용도(예: 리포팅)로만 사용.
function isDeferred(rawLine) {
  if (rawLine == null) return false;
  try { return new RegExp(DEFERRED_TRAILING_RE).test(String(rawLine)); }
  catch (_) { return false; }
}

// trailing 마커의 reason/at 속성 추출. 부재 시 null.
function extractMeta(rawLine) {
  if (rawLine == null) return { reason: null, at: null };
  try {
    const m = String(rawLine).match(RESOLVED_TRAILING_RE);
    if (!m) return { reason: null, at: null };
    return {
      reason: m[1] != null ? m[1] : null,
      at: m[2] != null ? m[2] : null,
    };
  } catch (_) { return { reason: null, at: null }; }
}

// 표 셀 split 이전 raw 라인 단위 전처리 (Codex F2 핵심). **trailing** 마커만 추출·
// 제거해 cleaned line 을 반환. 마커가 최종 `|` 뒤에 와도 split 시 phantom 셀이
// 되지 않는다. mid-prose 문서 언급은 보존(detection 안 함). 우측 공백 정리.
function stripLineMarker(rawLine) {
  const line = String(rawLine == null ? '' : rawLine);
  let resolved = false;
  let meta = { reason: null, at: null };
  try {
    resolved = isResolved(line);
    meta = extractMeta(line);
  } catch (_) { /* fail-open */ }
  let cleaned = line;
  // resolved | deferred 양쪽 trailing 마커 제거(누출 0). resolved flag/meta 는 위에서
  // 이미 resolved 한정으로 산출 — deferred 는 active 유지(F1 불변).
  try { cleaned = line.replace(ANY_MARKER_TRAILING_RE, '').replace(/[ \t]+$/g, ''); }
  catch (_) { cleaned = line; }
  return { line: cleaned, resolved, meta };
}

// display 용 trailing 마커(resolved | deferred) 제거 + 우측 공백 정리. rendered
// surface 누출 0 (Constraint 3). mid-prose 문서 언급(backtick 예시)은 보존 — display
// 손실 방지. deferred 도 제거하되 isResolved 미인정이라 항목 active 유지.
function stripMarker(text) {
  if (text == null) return '';
  try {
    return String(text).replace(ANY_MARKER_TRAILING_RE, '').replace(/[ \t]+$/g, '').trim();
  } catch (_) { return String(text == null ? '' : text).trim(); }
}

// applier 가 reason 을 마커에 쓰기 전 표/주석 파싱 안전화 (Codex F2):
//   `|`→`/`(표 셀 분리 방지), `"`→`'`(속성 따옴표 종결 방지),
//   `-->`→`- >`(주석 조기 종료 방지), 개행 제거, 공백 정리, 길이 cap.
function escapeMarkerReason(s) {
  if (s == null) return '';
  let out;
  try {
    out = String(s)
      .replace(/\r?\n/g, ' ')
      .replace(/-->/g, '- >')
      .replace(/\|/g, '/')
      .replace(/"/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  } catch (_) { return ''; }
  if (out.length > REASON_CAP) out = out.slice(0, REASON_CAP).trim();
  return out;
}

// applier 가 마커 문자열을 구성하는 단일 진입점 (escape 강제).
function buildMarker(reason, at) {
  const r = escapeMarkerReason(reason);
  const parts = ['<!--mccp:resolved'];
  if (r) parts.push(' reason="' + r + '"');
  if (at) parts.push(' at="' + escapeMarkerReason(at) + '"');
  parts.push('-->');
  return parts.join('');
}

module.exports = {
  RESOLVED_RE,
  RESOLVED_TRAILING_RE,
  DEFERRED_TRAILING_RE,
  ANY_MARKER_TRAILING_RE,
  REASON_CAP,
  isResolved,
  isDeferred,
  extractMeta,
  stripLineMarker,
  stripMarker,
  escapeMarkerReason,
  buildMarker,
};
