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

// An absolute cwd is a leak: Windows drive-letter (`C:\`, `C:/`) or POSIX
// absolute (`/...`). A redacted receipt is repo-relative ('.', 'sub/dir') or the
// '<outside-repo>' placeholder — neither is absolute.
function isAbsoluteCwd(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return false;
  return path.isAbsolute(cwd) || /^[A-Za-z]:[\\/]/.test(cwd);
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
function validateStaged(repoRoot, relPaths) {
  const offenders = [];
  for (const p of relPaths) {
    const rel = String(p).trim();
    if (rel.length === 0) continue;
    // R4/F1 — the caller scopes input to the receipt corpus, so a non-JSON path
    // here is a stray file (scratch/backup/binary) that would be committed
    // unvalidated (the guard used to silently skip it, and the outside-path check
    // only rejects paths OUTSIDE the corpus dir). Reject fail-closed.
    if (!rel.endsWith('.json')) {
      offenders.push({ path: rel, reason: 'non-JSON path staged under receipt corpus (only ship-receipt .json is durable evidence)' });
      continue;
    }
    const blob = readStagedBlob(repoRoot, rel);
    if (!blob.ok) { offenders.push({ path: rel, reason: blob.reason }); continue; }
    const bad = validateContent(rel, blob.raw);
    if (bad) offenders.push(bad);
  }
  return { ok: offenders.length === 0, offenders: offenders };
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
  const paths = readStdin().split(/\r?\n/);
  const res = validateStaged(repoRoot, paths);
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
  validateContent: validateContent,
  readStagedBlob: readStagedBlob,
  validateStaged: validateStaged,
};
