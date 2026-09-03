'use strict';

// review-record-linkage M3 — the back-patch transform (review record -> receipt).
//
// The ship receipt seals `meta.review_record_path` (receipt -> review). This
// module supplies the other direction: after the ship receipt is sealed, its
// `receipt_hash` is written into the record's `## Measurement` fence as
// `receipt_hash`. That is the whole of the bidirectional link.
//
// ── pure, total, and it does NOT own the fence rules ─────────────────────────
//
// Fence discovery and panel-record membership belong to `corpus.js#parseRecord`
// (`:211` PANEL_TITLE_RE, `:225-273`). This module CONSUMES that oracle rather
// than re-deriving it — the same DD1a rule M1 imposed on `linkage-defs.js`. Two
// implementations of "which bytes are the Measurement block" would let two tools
// disagree about the same corpus with nothing to break the tie.
//
// Every export is total: no throw, ever. Failure is `{ok:false, reason}`. A
// transform that can throw turns instrumentation into a new way for the ship to
// die, and Task 6(b) deliberately treats a back-patch failure as warn-and-proceed.
//
// I/O is ZERO here. The CLI owns reading, containment and the atomic write; this
// file only maps text to text, which is what makes the tamper cases unit-testable.

const corpus = require('./corpus');
const { toRepoRelativePosix, samePath } = require('../repo-path');

// The canonical form is the receipt's OWN field format (`schema.js:63` SHA256_RE),
// NOT bare hex. `FINALIZE_RECEIPT_HASH` in pr.md is read straight out of the sealed
// receipt, and `linkage-defs.js` D3 compares `measurement.receipt_hash` against that
// same field. A bare-hex contract here would be one no producer in this repository
// satisfies: every real call would be rejected and the back-patch would never fire,
// while a suite written to the same wrong shape stayed green.
const RECEIPT_HASH_RE = /^sha256:[0-9a-f]{64}$/;
const REVIEW_DIR_PREFIX = '.claude/reviews/';

// ── the decision binding (R4 security HIGH `613d8e5f`) ───────────────────────
//
// Task 4's containment answers "is this path inside `.claude/reviews/`". It does
// NOT answer "is this record MINE". If an upstream `meta.review_record_path`
// points at ANOTHER decision's record, containment passes, the write lands, and
// the guard at Phase 3.0 can only refuse the commit — it cannot undo a write that
// already happened. So the binding must run BEFORE the write, and it must be
// fail-closed.
//
// The binding is the SAME anchor Task 5 uses: the record's own
// `measurement.plan_path` against this ship's plan path. Both ends are immutable
// identifiers (unlike `plan_hash`, which Phase 2.5.4's injection moves on every
// cycle — R3 proved that on a shipped pair), so this mirrors
// `evidence-stage-guard.js:95-98` in form, not just in spirit.
//
// Unreadable, unparsable, or plan_path-less records are NOT bound. Absence is
// never promoted to a match: on a fail-closed path "I cannot tell" must behave
// like "no", or the check is decoration.
function bindsToPlanPath(recordText, expectedPlanPath, repoRoot) {
  const parsed = safeParse(recordText);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }
  const recorded = parsed.measurement.plan_path;
  if (typeof recorded !== 'string' || recorded.trim().length === 0) {
    return {
      ok: false,
      reason: 'the record carries no measurement.plan_path, so it cannot be bound to this ' +
        'ship (a record written before review-record-linkage M3 is legacy, not a match)',
    };
  }
  if (typeof expectedPlanPath !== 'string' || expectedPlanPath.trim().length === 0) {
    return { ok: false, reason: 'no expected plan path was supplied — an unbound back-patch is refused' };
  }
  if (!samePath(recorded, expectedPlanPath, repoRoot)) {
    return {
      ok: false,
      reason: 'decision binding failed: the record was written for plan ' +
        JSON.stringify(toRepoRelativePosix(recorded, repoRoot) || recorded) +
        ' but this ship is for ' +
        JSON.stringify(toRepoRelativePosix(expectedPlanPath, repoRoot) || expectedPlanPath),
    };
  }
  return { ok: true, planPath: toRepoRelativePosix(recorded, repoRoot) };
}

// ── the transform ────────────────────────────────────────────────────────────
//
// Sets `receipt_hash` and NOTHING else. The rest of the Measurement object is
// re-serialized from the parsed value with the same 2-space indent `record.js`
// writes, so a byte diff of the block is exactly the one line that changed.
//
// Idempotent by construction: applying the same hash twice produces identical
// bytes, because the output is a function of (parsed measurement, hash) alone.
function applyReceiptHash(recordText, receiptHash) {
  if (typeof receiptHash !== 'string' || !RECEIPT_HASH_RE.test(receiptHash)) {
    return {
      ok: false,
      reason: 'receipt hash must match ' + RECEIPT_HASH_RE.source + ' — got ' +
        JSON.stringify(receiptHash),
    };
  }
  const parsed = safeParse(recordText);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const next = Object.assign({}, parsed.measurement, { receipt_hash: receiptHash });
  const rendered = JSON.stringify(next, null, 2);

  const replaced = replaceMeasurementFence(recordText, rendered);
  if (!replaced.ok) return replaced;
  return { ok: true, markdown: replaced.markdown, changed: replaced.markdown !== recordText };
}

// Parse + membership, folded into one total helper so both exports agree about
// what "not a panel record" means.
function safeParse(recordText) {
  if (typeof recordText !== 'string' || recordText.trim().length === 0) {
    return { ok: false, reason: 'empty or non-string record' };
  }
  let parsed;
  try { parsed = corpus.parseRecord(recordText); }
  catch (err) { return { ok: false, reason: 'record parse threw: ' + (err && err.message) }; }
  if (parsed.kind !== 'record') {
    return {
      ok: false,
      reason: 'not a back-patchable panel record (kind=' + parsed.kind + ': ' +
        (parsed.error || 'no detail') + ')',
    };
  }
  if (parsed.measurement === null || typeof parsed.measurement !== 'object') {
    return { ok: false, reason: 'the Measurement block did not parse to an object' };
  }
  return { ok: true, measurement: parsed.measurement };
}

// Swap the body of the `## Measurement` ```json fence. The fence is located the
// same way `corpus.js#parseRecord` locates it — first `## Measurement` heading,
// then the first ```json fence under it, then up to the closing ```.
//
// The line ending of the surrounding document is preserved: this repository runs
// on Windows and `core.autocrlf` can hand us CRLF. Re-emitting LF into a CRLF
// document would rewrite every line of the block as a diff.
//
// Only the FENCE BODY is spliced. An earlier spelling split the whole document and
// re-joined it with one detected EOL, which rewrote every line of a mixed-ending
// file even though one line changed — the opposite of what the paragraph above
// promises. Splicing by offset leaves every byte outside `[bodyStart, bodyEnd)`
// exactly as it was found, so the EOL choice below governs the inserted lines only.
function replaceMeasurementFence(text, renderedJson) {
  const lines = text.split(/\r?\n/);

  let head = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Measurement\s*$/.test(lines[i].trim())) { head = i; break; }
  }
  if (head === -1) return { ok: false, reason: 'no `## Measurement` heading' };

  let open = -1;
  for (let i = head + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^##\s+/.test(t)) break;                 // next section — fence is missing
    if (t === '```json') { open = i; break; }
  }
  if (open === -1) return { ok: false, reason: '`## Measurement` has no ```json fence' };

  let close = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === '```') { close = i; break; }
  }
  if (close === -1) return { ok: false, reason: 'the Measurement fence is never closed' };

  // Byte offsets of the body: just past the opening fence's line terminator, up to
  // the start of the closing fence's line. `lineStart` walks the ORIGINAL text so a
  // per-line CR is measured where it actually is, not where a global guess puts it.
  const bodyStart = lineStart(text, open + 1);
  const bodyEnd = lineStart(text, close);
  if (bodyStart === null || bodyEnd === null || bodyEnd < bodyStart) {
    return { ok: false, reason: 'could not locate the Measurement fence body offsets' };
  }
  // The inserted lines follow the terminator the OPENING fence line used, so a CRLF
  // document stays CRLF and an LF one stays LF without touching anything else.
  const eol = text.slice(bodyStart - 2, bodyStart) === '\r\n' ? '\r\n' : '\n';
  const body = renderedJson.split('\n').join(eol) + eol;
  return { ok: true, markdown: text.slice(0, bodyStart) + body + text.slice(bodyEnd) };
}

// Byte offset where 0-indexed line `n` begins, or `null` if the text has fewer
// lines. Counts terminators as they appear (`\r\n` or `\n`), never normalized.
function lineStart(text, n) {
  if (n === 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {             // '\n' ends a line either way
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return seen === n ? text.length : null;
}

// ── the 2.5.7 -> 3.0 evidence carrier (security-reviewer M1 · L1) ────────────
//
// Shell state does not cross a fenced block, so the record path, the ship receipt
// path and its hash travel to Phase 3.0 in ONE artifact file. It is deliberately
// not an env var: an exported var either fails to cross the fence (silently
// disabling the axis) or survives too long, which is the stale-value class this
// repository has already patched twice (`pr.md:171-180`, `:472-481` hard-reset
// `unset`s for CODEX_DEDUPE_AT_PR / PR_CODEX_FORCE_OVERRIDE_REASON).
//
// One artifact, one validator, three consumers: Phase 3.0's entry predicate, its
// `git add` pathspec / OUTSIDE exception, and the stage guard's anchor. Parsing it
// in one place is what keeps those three from disagreeing about which single path
// is in scope this run.
function parseLinkEvidence(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, reason: 'empty or non-string link-evidence artifact' };
  }
  let o;
  try { o = JSON.parse(text); }
  catch (err) { return { ok: false, reason: 'link-evidence artifact is not JSON: ' + (err && err.message) }; }
  if (o === null || typeof o !== 'object' || Array.isArray(o)) {
    return { ok: false, reason: 'link-evidence artifact is not a JSON object' };
  }

  const recordPath = o.record_path;
  const receiptPath = o.receipt_path;
  const receiptHash = o.receipt_hash;

  // A value that becomes a `git add` pathspec gets checked for shape before it is
  // used as one, not after. Single line, no control chars, no traversal, and
  // pinned to the review corpus — a prefix-widened value is exactly what the
  // OUTSIDE-HALT is there to refuse.
  // The `.md` suffix is part of the contract, not decoration. `evidence-stage-guard`
  // routes a staged path to its review-record branch BY EXTENSION, so a carrier that
  // accepted a suffix-less path would hand the guard an anchor it can never match:
  // the path would fall through to the receipt-corpus branch and HALT the ship with
  // "non-JSON path staged under receipt corpus" — fail-closed, but naming the wrong
  // cause. `record.js#reviewRecordPath` only ever produces `.md`, so requiring it
  // here costs nothing and makes the two routers agree by construction.
  if (!isSafeRelPath(recordPath)
      || recordPath.indexOf(REVIEW_DIR_PREFIX) !== 0
      || !/\.md$/.test(recordPath)) {
    return { ok: false, reason: 'record_path must be a single-line repo-relative `.md` path ' +
      'under ' + REVIEW_DIR_PREFIX + ' with no "..": got ' + JSON.stringify(recordPath) };
  }
  if (!isSafeRelPath(receiptPath) || receiptPath.indexOf('.claude/receipts/') !== 0) {
    return { ok: false, reason: 'receipt_path must be a single-line repo-relative path under ' +
      '.claude/receipts/ with no "..": got ' + JSON.stringify(receiptPath) };
  }
  if (typeof receiptHash !== 'string' || !RECEIPT_HASH_RE.test(receiptHash)) {
    return { ok: false, reason: 'receipt_hash must match ' + RECEIPT_HASH_RE.source + ': got ' +
      JSON.stringify(receiptHash) };
  }
  return {
    ok: true,
    record_path: recordPath,
    receipt_path: receiptPath,
    receipt_hash: receiptHash,
  };
}

// Shape rule, not a safety gate on its own — the CLI still resolves and contains
// the real path. Mirrors `linkage-defs.js#isRepoRelativePath` and adds the
// single-line requirement a pathspec needs.
function isSafeRelPath(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0 || s.length > 512) return false;
  if (s !== v) return false;                                   // no surrounding whitespace
  // Single line, no whitespace, no control chars (NUL included). Checked by code
  // point rather than a character-class literal so the rule survives being copied
  // between files without an escape being eaten.
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return false;
  }
  if (s.charAt(0) === '/' || s.charAt(0) === '\\') return false;
  if (/^[A-Za-z]:/.test(s)) return false;
  if (s.indexOf('..') !== -1) return false;
  if (s.indexOf('\\') !== -1) return false;                    // POSIX separators only
  return true;
}

module.exports = {
  applyReceiptHash: applyReceiptHash,
  bindsToPlanPath: bindsToPlanPath,
  parseLinkEvidence: parseLinkEvidence,
  isSafeRelPath: isSafeRelPath,
  RECEIPT_HASH_RE: RECEIPT_HASH_RE,
  REVIEW_DIR_PREFIX: REVIEW_DIR_PREFIX,
};
