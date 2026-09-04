#!/usr/bin/env node
'use strict';

// evidence-stage-guard — durable-evidence-substrate PR-Codex R2/F2 + R3/F1.
//
// The /mccp:pr Phase 3.0 evidence commit stages the WHOLE `mccp-pr-codex/`
// receipt directory (the audit corpus is deliberately all ship receipts). That
// broad `git add` is the gap Codex R2/F2 flagged: an unrelated local receipt,
// corrupt JSON, or a receipt carrying an absolute path would be published as
// durable evidence. R3/F1 sharpened it: a shallow "is receipt_hash a non-empty
// string" check lets a TAMPERED receipt through — flip `resolution.codex_verdict`
// (or any audited field) while leaving the stale `receipt_hash`, and the forged
// evidence becomes the canonical corpus. And validating the WORKING-TREE file is
// wrong: a concurrent edit after `git add` diverges from what is actually
// committed. So this guard is fail-CLOSED over the exact STAGED blob and requires
// the declared hash to match a recomputation of the canonical body.
//
// It reads newline-separated repo-relative receipt paths on stdin (the output of
// `git diff --cached --name-only -- .claude/receipts/mccp-pr-codex/`) and, for
// each, HALTs the push (exit 1 + offender list on stdout) when the STAGED blob is:
//   - not staged / unreadable                 (git show :<path> failed)
//   - not valid JSON                          (corrupt blob — never silently skip)
//   - missing a string `receipt_hash`         (not a real ship receipt)
//   - receipt_hash !== receiptHash(parsed)    (tampered or stale evidence)
//   - schema.validate(parsed) fails           (M1 R5-F1 — malformed receipt body)
//   - gate_id !== 'mccp-pr-codex'             (M1 R5-F1 — wrong gate, not a ship)
//   - phase !== 'pr'                          (M1 R5-F1 — wrong phase)
//   - basename(path) !== decision_id          (M1 R5-F1 — filename/decision mismatch)
//   - carrying an absolute `meta.cwd`         (drive-letter or POSIX-absolute leak)
//
// Read-only: it never writes or stages. The caller (pr.md) resets the index and
// exits on any offender. Exit 0 + empty stdout means every staged receipt is safe
// to publish.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { receiptHash } = require('../receipt/hash');
const { validate: validateReceiptSchema } = require('../receipt/schema');
// review-record-linkage M3 — panel-record parsing is corpus.js's (DD1a: one owner),
// and the link-evidence carrier has one validator shared with pr.md Phase 3.0.
const { parseRecord } = require('./plan-review/corpus');
const { parseLinkEvidence } = require('./plan-review/link-receipt');

// An absolute cwd is a leak: Windows drive-letter (`C:\`, `C:/`) or POSIX
// absolute (`/...`). A redacted receipt is repo-relative ('.', 'sub/dir') or the
// '<outside-repo>' placeholder — neither is absolute.
function isAbsoluteCwd(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return false;
  return path.isAbsolute(cwd) || /^[A-Za-z]:[\\/]/.test(cwd);
}

// ── review-record-linkage M3 — the review-record branch ──────────────────────
//
// Phase 3.0 now stages ONE `.claude/reviews/*.md` panel record alongside the
// receipt corpus, because the back-patched half of the link is git-tracked and
// would otherwise never reach history — leaving the audit permanently at zero.
//
// `anchor` is `{ record_path, receipt_path, receipt_hash }` from the run's
// link-evidence artifact, or `null`. It is an ARGUMENT, not an env var: the value
// must cross a fenced-block boundary, and this repository has twice had to patch
// stale exported vars that outlived their run (`pr.md:171-180`, `:472-481`). An
// artifact read fresh per run cannot be inherited from a previous one.
//
// Three checks, and the FIRST is what makes this a real defence layer:
//   1. the staged path must EQUAL `anchor.record_path`. Without it the branch
//      would trust the caller's pathspec scoping, and a later widening of that
//      pathspec to `^\.claude/reviews/` would silently admit the whole corpus —
//      exactly the change this milestone forbids elsewhere. A guard that only
//      holds while its caller stays correct is not a guard;
//   2. the blob must parse as a panel record carrying a `## Measurement` fence;
//   3. its `receipt_hash` must equal THIS ship's `anchor.receipt_hash` — not "some
//      staged receipt's". Matching against any receipt would pass a stale hash
//      left by a previous ship, which is the very case Task 8 axis 3 exists for.
//
// A null anchor is fail-CLOSED: with no anchor there is no "this ship" to compare
// against, and the alternative — accepting any well-formed record — is strictly
// worse than refusing.
function validateReviewRecord(relPath, raw, anchor) {
  if (!anchor || typeof anchor !== 'object') {
    return { path: relPath, reason: 'a review record is staged but no link-evidence anchor was ' +
      'supplied — refusing (an unanchored record cannot be shown to belong to this ship)' };
  }
  if (typeof anchor.record_path !== 'string' || anchor.record_path !== relPath) {
    return { path: relPath, reason: 'staged review record is not the one this ship linked ' +
      '(anchor names ' + JSON.stringify(anchor.record_path) + ')' };
  }
  let parsed;
  try { parsed = parseRecord(raw); }
  catch (e) { return { path: relPath, reason: 'review record parse threw: ' + (e && e.message) }; }
  if (parsed.kind !== 'record') {
    return { path: relPath, reason: 'not a panel record with a readable Measurement block (kind=' +
      parsed.kind + ')' };
  }
  const declared = parsed.measurement && parsed.measurement.receipt_hash;
  if (typeof declared !== 'string' || declared.length === 0) {
    return { path: relPath, reason: 'review record carries no measurement.receipt_hash — the ' +
      'back-patch did not land, so this record is not evidence of a link' };
  }
  if (declared !== anchor.receipt_hash) {
    return { path: relPath, reason: 'review record receipt_hash mismatch (stale/forged): declared ' +
      declared + ' but this ship sealed ' + anchor.receipt_hash };
  }
  return null;
}

// validateContent(relPath, raw) → null when safe, else { path, reason }. PURE —
// no I/O, so it is exhaustively unit-testable (tamper cases included).
function validateContent(relPath, raw) {
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch (_e) {
    return { path: relPath, reason: 'unparseable JSON' };
  }
  if (!receipt || typeof receipt !== 'object') {
    return { path: relPath, reason: 'not a JSON object' };
  }
  if (typeof receipt.receipt_hash !== 'string' || receipt.receipt_hash.length === 0) {
    return { path: relPath, reason: 'missing receipt_hash (not a ship receipt)' };
  }
  // R3/F1 — the tamper/stale-evidence check. The declared hash MUST equal a
  // recomputation of the canonical body (receiptHash strips receipt_hash itself
  // plus the briefing_*/ledger_write_skipped carve-outs, so a legit receipt
  // matches). A flipped codex_verdict with a stale hash fails here; a
  // non-empty-string check alone let it through.
  let recomputed;
  try {
    recomputed = receiptHash(receipt);
  } catch (e) {
    return { path: relPath, reason: 'hash recompute failed: ' + (e && e.message) };
  }
  if (recomputed !== receipt.receipt_hash) {
    return { path: relPath, reason: 'receipt_hash mismatch (tampered/stale): declared ' + receipt.receipt_hash + ' recomputed ' + recomputed };
  }
  // M1 Task 2 (R5-F1) — a matching hash proves the bytes are un-tampered, but NOT
  // that the blob is a well-formed pr-codex ship receipt FOR THIS decision. A
  // hash-valid receipt for the wrong gate/phase, a schema-invalid body, or a
  // decision_id that disagrees with its filename would still be published as
  // durable evidence. Fail-closed on each (same schema.validate validate-cmd uses).
  const schemaResult = validateReceiptSchema(receipt);
  if (!schemaResult.ok) {
    return { path: relPath, reason: 'schema invalid: ' + schemaResult.errors.slice(0, 3).join('; ') };
  }
  if (receipt.gate_id !== 'mccp-pr-codex') {
    return { path: relPath, reason: 'wrong gate_id (durable corpus is ship receipts only): ' + receipt.gate_id };
  }
  if (receipt.phase !== 'pr') {
    return { path: relPath, reason: 'wrong phase (ship receipts are phase="pr"): ' + receipt.phase };
  }
  // Filename basename must equal decision_id: a receipt copied under the wrong
  // slug (or a stray decision_id) breaks the ledger↔corpus join identity.
  const slug = path.basename(String(relPath)).replace(/\.json$/i, '');
  if (slug !== receipt.decision_id) {
    return { path: relPath, reason: 'filename slug "' + slug + '" != decision_id "' + receipt.decision_id + '"' };
  }
  const cwd = receipt.meta && receipt.meta.cwd;
  if (isAbsoluteCwd(cwd)) {
    return { path: relPath, reason: 'absolute meta.cwd leak: ' + cwd };
  }
  return null;
}

// readStagedBlob(repoRoot, relPath) → { ok, raw } | { ok:false, reason }.
// R3/F1 — validate the EXACT bytes being committed (the index/staged version via
// `git show :<path>`), not the working-tree file, which a concurrent edit could
// diverge from between `git add` and the evidence commit.
function readStagedBlob(repoRoot, relPath) {
  try {
    const raw = execFileSync('git', ['show', ':' + relPath], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, raw: raw };
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr).trim() : ((e && e.message) || 'unknown');
    return { ok: false, reason: 'not staged / unreadable blob (' + stderr + ')' };
  }
}

// validateStaged(repoRoot, relPaths) → { ok, offenders: [{path, reason}] }.
// Reads the STAGED blob for each path, then validates its content.
function validateStaged(repoRoot, relPaths, anchor) {
  const offenders = [];
  for (const p of relPaths) {
    const rel = String(p).trim();
    if (rel.length === 0) continue;
    const blob = readStagedBlob(repoRoot, rel);
    // M3 — the ONE review record this ship linked. Routed by extension, then
    // validated against the anchor; everything about "is it the right one" lives
    // in validateReviewRecord, not in the caller's pathspec.
    if (rel.endsWith('.md')) {
      if (!blob.ok) { offenders.push({ path: rel, reason: blob.reason }); continue; }
      const badRecord = validateReviewRecord(rel, blob.raw, anchor);
      if (badRecord) offenders.push(badRecord);
      continue;
    }
    // R4/F1 — the caller scopes input to the receipt corpus, so a non-JSON path
    // here is a stray file (scratch/backup/binary) that would be committed
    // unvalidated (the guard used to silently skip it, and the outside-path check
    // only rejects paths OUTSIDE the corpus dir). Reject fail-closed.
    if (!rel.endsWith('.json')) {
      offenders.push({ path: rel, reason: 'non-JSON path staged under receipt corpus (only ship-receipt .json is durable evidence)' });
      continue;
    }
    if (!blob.ok) { offenders.push({ path: rel, reason: blob.reason }); continue; }
    const bad = validateContent(rel, blob.raw);
    if (bad) offenders.push(bad);
  }
  return { ok: offenders.length === 0, offenders: offenders };
}

// Read the run's link-evidence artifact. Absent → null, which the review-record
// branch treats as fail-closed. A PRESENT-but-invalid artifact is also null: a
// malformed carrier is not a weaker anchor, it is no anchor.
function readAnchor(anchorPath) {
  if (typeof anchorPath !== 'string' || anchorPath.length === 0) return null;
  let raw;
  try { raw = fs.readFileSync(anchorPath, 'utf8'); }
  catch (_e) { return null; }
  const parsed = parseLinkEvidence(raw);
  if (!parsed.ok) {
    process.stderr.write('[evidence-stage-guard] link-evidence artifact rejected: ' +
      parsed.reason + '\n');
    return null;
  }
  return parsed;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_e) {
    return '';
  }
}

function main() {
  const repoRoot = process.env.MCCP_EVIDENCE_STAGE_ROOT || process.cwd();
  // M3 — `--anchor-file <path>`, deliberately argv rather than an env var so the
  // value cannot be inherited from a previous run (security-reviewer M1).
  let anchorPath = null;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--anchor-file' && i + 1 < argv.length) { anchorPath = argv[i + 1]; i += 1; }
  }
  const anchor = readAnchor(anchorPath);
  const paths = readStdin().split(/\r?\n/);
  const res = validateStaged(repoRoot, paths, anchor);
  if (!res.ok) {
    for (const o of res.offenders) {
      process.stdout.write('  BAD ' + o.path + ' — ' + o.reason + '\n');
    }
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  isAbsoluteCwd: isAbsoluteCwd,
  validateReviewRecord: validateReviewRecord,
  readAnchor: readAnchor,
  validateContent: validateContent,
  readStagedBlob: readStagedBlob,
  validateStaged: validateStaged,
};
