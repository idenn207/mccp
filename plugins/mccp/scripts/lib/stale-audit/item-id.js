'use strict';

// Dashboard Interactivity M4 — opaque item-id SSoT (pure, dep-light, fail-open).
//
// Maps a stale-audit ref (risk / oq) to a deterministic 16-char id shared by:
//   - the renderer  (drawer-detail.js embeds it as `resolveId` in the drawer)
//   - the write-server (dashboard-server.js re-enumerates and matches the id
//     back to a SERVER-DERIVED ref → the browser never supplies a path).
//
// computeItemId(ref) = sha256(`${kind}\0${normSource(source)}\0${anchor}\0${norm(text)}`)
//   sliced to 16 hex chars.
//
// Determinism contract — BOTH sides must feed identical fields:
//   - kind   : 'risk' | 'oq'.
//   - source : plan/prd rel path. SEPARATOR-NORMALIZED — derive uses
//              path.relative (backslash on win32) while enumerate.js forward-
//              slashes; normSource collapses both to '/' so the hash is
//              platform-independent.
//   - anchor : positional anchor. oq → lineNumber (parser-native, stable).
//              risk → ordinal (parse-order index). The renderer has no line-
//              native anchor for risks (parseRisks drops line numbers; only
//              enumerate computes them via findRisksTableLine) but BOTH the
//              renderer derive model and enumerate share the parse-order
//              ordinal, so ordinal is the deterministic risk anchor. This keeps
//              the plan's positional-anchor intent (duplicate-text rows get
//              distinct ids; a stale id forces server re-validation → safe miss)
//              without expanding the derive layer (plan-body.js untouched).
//   - text   : norm()'d (whitespace-collapse + trim) — mirror of apply.js norm().

const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

// 공백 collapse + trim — apply.js#norm (`:88`) 미러. drift 시 id 불일치 → 안전 miss.
function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

// 경로 구분자 정규화(\\ 와 / 모두 /). derive p.path(win32 backslash) ↔ enumerate
// relPath(forward-slash) 합치. 플랫폼 독립 — 같은 ref 가 두 OS 에서 같은 id.
function normSource(s) {
  return String(s == null ? '' : s).split(/[\\/]/).join('/');
}

// kind 별 positional anchor 선택. oq=lineNumber, 그 외(risk)=ordinal.
function anchorOf(ref) {
  const r = ref || {};
  if (r.kind === 'oq') return r.lineNumber;
  return r.ordinal;
}

function computeItemId(ref) {
  const r = ref || {};
  const kind = String(r.kind == null ? '' : r.kind);
  const source = normSource(r.source);
  const anchor = anchorOf(r);
  const text = norm(r.text);
  const key = kind + '\0' + source + '\0' + String(anchor == null ? '' : anchor) + '\0' + text;
  return sha256(key).slice(0, 16);
}

module.exports = { computeItemId, norm, normSource, anchorOf };
