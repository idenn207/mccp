#!/usr/bin/env node
// v1.22.4 cwd-rebind — durable-evidence-substrate Phase A follow-up · F1.
//
// The 33 git-tracked mccp-pr-codex ship receipts each carry an ABSOLUTE
// meta.cwd (21 leak the old repo name `…\my-claude-code-plugin`, 12 the current
// `…\mccp`). Phase A stages the receipt dir wholesale, so `git push` publishes
// those local drive-letter paths into public history irreversibly. This tool
// redacts each receipt's cwd to a repo-relative form AND atomically re-keys the
// git-tracked completion-ledger entries bound to it, so the ledger↔receipt
// binding is preserved (no dangling, no duplicate) while the leak is removed.
//
// THE ONE SANCTIONED RE-SEAL (CLAUDE.md §3.12): recomputing receipt_hash is
// exactly what §3.12's no-rehash invariant forbids — because a naive re-seal
// snaps the ledger↔receipt binding (E4). This tool is the sanctioned exception
// §3.12 anticipated: it re-keys the ledger entry (filename + entry.receipt_hash)
// in the SAME run, atomically per receipt, so the E4 concern does not arise. It
// therefore writes tracked receipts via DIRECT fs (atomic tmp+rename), bypassing
// store.writeReceipt's TRACKED_RECEIPT_OVERWRITE guard — the guard forbids a
// tracked-hash change precisely because it would snap a binding, and this is the
// one place that re-keys the binding alongside. Every OTHER writer stays bound
// by the no-rehash invariant + the store guard.
//
// Safety invariants (fail-closed, all-or-nothing per run):
//   (a) NEVER writes/renames/unlinks any git-UNTRACKED ledger file. The re-key
//       set is filtered to git-tracked ledger files (Codex R1 F-A). The untracked
//       E6 entry (live-activation-m3-pr-codex-absorption__c8b9175d489a.json) is
//       hash-bound but untracked → excluded; its receipt is still redacted, which
//       leaves E6 locally dangling (accepted — Phase B poison, never pushed).
//   (b) NEVER touches the 19 pre-existing dangling ledger entries (no matching
//       receipt → no oldHash key → never visited).
//
// Ordering: new-ledger → receipt → unlink-old. Every crash window leaves an
// over-count with >=1 intact binding, never a missing one (Codex R1 F-B); an
// idempotent re-run + the fail-closed post-apply scan heal any partial state
// BEFORE anything is committed.
//
// Usage (CLI):
//   node v1.22.4-cwd-rebind.js [--dry-run] [--cwd <path>]   (dry-run is default)
//   node v1.22.4-cwd-rebind.js --apply [--cwd <path>]
//   node v1.22.4-cwd-rebind.js --stage [--cwd <path>]   (git add planned set + manifest gate)
//   node v1.22.4-cwd-rebind.js --verify [--cwd <path>]  (manifest gate only, no staging)

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const { normalizeReceiptCwd } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'write'));
const { receiptHash } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'hash'));
const { entryId, validateEntry } = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'completion-ledger', 'store'));

const RECEIPT_SUBDIR = path.join('.claude', 'receipts', 'mccp-pr-codex');
const LEDGER_SUBDIR = path.join('.claude', 'state', 'completion-ledger');
const LOCK_REL = path.join('.claude', 'receipts', '.migrations', 'v1.22.4-cwd-rebind.lock');
const MANIFEST_REL = path.join('.claude', 'receipts', '.migrations', 'v1.22.4-cwd-rebind.manifest.json');

// Lock constants — mirror store.js#withLedgerLock SHAPE (wx create, PID+ISO
// body, 30s stale reclaim), NOT its fail-OPEN behavior. On acquisition failure
// after these retries the tool FAILS CLOSED (throws → nonzero exit) before any
// read/plan/write, unlike withLedgerLock which warns and proceeds unlocked.
const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30000;

const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) { Atomics.wait(SLEEP_BUF, 0, 0, ms); }

function warn(line) { process.stderr.write('[mccp:cwd-rebind] ' + line + '\n'); }

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitRaw(args, cwd) {
  // Same as git() but without .trim() — for -z NUL-delimited output.
  return execFileSync('git', args, { cwd: cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function toPosixRel(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function writeAtomic(target, content) {
  ensureDir(path.dirname(target));
  const tmp = target + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    throw err;
  }
}

function readJson(absPath) {
  try { return JSON.parse(fs.readFileSync(absPath, 'utf8')); } catch (_e) { return null; }
}

// git blob OID of a file's staged-equivalent content (applies the same clean
// filters git add would). Computed at APPLY time so a concurrent write between
// apply and stage is detectable (staged OID would then differ).
function hashObject(repoRoot, absPath) {
  return git(['hash-object', '--', absPath], repoRoot);
}

// ── fail-closed lock ─────────────────────────────────────────────────────────

function lockPath(repoRoot) { return path.join(repoRoot, LOCK_REL); }

function tryReclaimStale(lockFile) {
  let stat;
  try { stat = fs.statSync(lockFile); } catch (_e) { return false; }
  const ageMs = Date.now() - (stat.mtimeMs || 0);
  if (Number.isFinite(ageMs) && ageMs > LOCK_STALE_MS) {
    try { fs.unlinkSync(lockFile); return true; } catch (_e) { return false; }
  }
  return false;
}

// FAIL-CLOSED: return { token } on success; throw (→ nonzero exit) on failure.
// This is the deliberate inversion of withLedgerLock's fail-open proceed.
function acquireLockFailClosed(repoRoot) {
  const p = lockPath(repoRoot);
  ensureDir(path.dirname(p));
  const token = crypto.randomUUID();
  const body = JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), host: os.hostname(), token: token });
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      const fd = fs.openSync(p, 'wx', 0o600);
      fs.writeSync(fd, body);
      fs.closeSync(fd);
      return { token: token };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (tryReclaimStale(p)) continue; // reclaimed a stale lock — retry immediately
      sleepSync(LOCK_RETRY_MS);
    }
  }
  const e = new Error('could not acquire rebind lock at ' + p + ' after ' +
    (LOCK_MAX_RETRIES * LOCK_RETRY_MS) + 'ms (live holder or contention) — FAIL-CLOSED, refusing to proceed unlocked');
  e.code = 'LOCK_FAILED';
  throw e;
}

function releaseLock(repoRoot, token) {
  const p = lockPath(repoRoot);
  let body;
  try { body = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_e) { return; }
  if (body && body.token === token) {
    try { fs.unlinkSync(p); } catch (_e) { /* ignore */ }
  }
}

// ── tracked-file discovery ───────────────────────────────────────────────────

function trackedBasenames(repoRoot, subdirRel) {
  let out;
  try {
    out = git(['ls-files', '--', subdirRel], repoRoot);
  } catch (_e) {
    return new Set();
  }
  return new Set(out.split(/\r?\n/).filter(Boolean).map(function (p) { return path.basename(p); }));
}

// ── plan phase (pure, no writes) ─────────────────────────────────────────────

function planRebind(repoRoot) {
  const receiptDir = path.join(repoRoot, RECEIPT_SUBDIR);
  const ledgerDir = path.join(repoRoot, LEDGER_SUBDIR);

  // 1. enumerate receipts + compute redaction.
  const receipts = [];         // { file, absPath, relPath, decisionId, oldHash, newHash, clone }
  let skipped = 0;
  const allOldHashes = new Set();
  const receiptHashByDecision = new Map(); // decision_id → current on-disk receipt hash (R3/F2 stranded detection)
  // (F3 — PR-Codex R2 absorption) Only git-TRACKED receipts are eligible for
  // rewrite, mirroring the tracked-ledger filter below. --apply rewrites+rehashes
  // in place and --stage uses `git add -u` (tracked only); an UNtracked receipt
  // rewritten here could never be staged, stranding the exact-manifest gate. So an
  // untracked receipt is classified skipped and left byte-untouched. Its hash is
  // still collected into allOldHashes so a tracked ledger bound to it is not
  // mis-counted as dangling.
  const trackedReceipts = trackedBasenames(repoRoot, RECEIPT_SUBDIR);
  const receiptFiles = fs.existsSync(receiptDir)
    ? fs.readdirSync(receiptDir).filter(function (f) { return f.endsWith('.json'); })
    : [];
  for (const file of receiptFiles) {
    const absPath = path.join(receiptDir, file);
    const receipt = readJson(absPath);
    if (!receipt || !receipt.meta || typeof receipt.meta.cwd !== 'string') continue;
    if (typeof receipt.receipt_hash === 'string') allOldHashes.add(receipt.receipt_hash);
    if (trackedReceipts.has(file) && receipt.decision_id && typeof receipt.receipt_hash === 'string') {
      receiptHashByDecision.set(receipt.decision_id, receipt.receipt_hash);
    }
    if (!trackedReceipts.has(file)) { skipped += 1; continue; } // untracked → never rewritten
    const oldCwd = receipt.meta.cwd;
    // Redaction targets ONLY an ABSOLUTE cwd — an already-relative value ('.',
    // 'sub/dir', '<outside-repo>') is done. This is the idempotency test and it
    // does NOT route through normalizeReceiptCwd, whose path.resolve('.') would
    // resolve against process.cwd() (not repoRoot) and spuriously re-redact a '.'
    // when the tool is invoked from anywhere but the repo root.
    const isAbsoluteCwd = path.isAbsolute(oldCwd) || /^[A-Za-z]:[\\/]/.test(oldCwd);
    if (!isAbsoluteCwd) { skipped += 1; continue; } // already redacted — idempotency
    const newCwd = normalizeReceiptCwd(oldCwd, repoRoot);
    // pre-flight: normalizeReceiptCwd must never yield an absolute/empty leak.
    if (newCwd === '' || path.isAbsolute(newCwd) || /^[A-Za-z]:[\\/]/.test(newCwd)) {
      throw preflightError('normalizeReceiptCwd produced a non-relative value "' + newCwd + '" for ' + file);
    }
    const clone = JSON.parse(JSON.stringify(receipt));
    clone.meta.cwd = newCwd;
    const newHash = receiptHash(clone); // receiptHash deletes receipt_hash internally
    clone.receipt_hash = newHash;
    receipts.push({
      file: file,
      absPath: absPath,
      relPath: toPosixRel(repoRoot, absPath),
      decisionId: receipt.decision_id,
      oldHash: receipt.receipt_hash || null,
      newHash: newHash,
      clone: clone,
    });
  }

  // 2. binding index over TRACKED ledger files ONLY (Codex R1 F-A). Read RAW
  //    (no decision-dedup — a decision may have N ledger files). oldHash → [files].
  const trackedLedger = trackedBasenames(repoRoot, LEDGER_SUBDIR);
  const byOldHash = new Map(); // oldHash → [{ basename, absPath, entry }]
  const allLedgerEntries = [];  // { basename, tracked, receipt_hash } — for dangling accounting
  const trackedLedgerDetailed = []; // { basename, absPath, receipt_hash, decision_id } (tracked only, R3/F2)
  const ledgerFiles = fs.existsSync(ledgerDir)
    ? fs.readdirSync(ledgerDir).filter(function (f) { return f.endsWith('.json'); })
    : [];
  for (const basename of ledgerFiles) {
    const isTracked = trackedLedger.has(basename);
    const absPath = path.join(ledgerDir, basename);
    const parsed = readJson(absPath);
    const entry = parsed && parsed.entry;
    const rh = entry && typeof entry.receipt_hash === 'string' ? entry.receipt_hash : null;
    allLedgerEntries.push({ basename: basename, tracked: isTracked, receipt_hash: rh });
    if (!isTracked) continue;            // (a) untracked → never re-keyed (E6)
    trackedLedgerDetailed.push({ basename: basename, absPath: absPath, receipt_hash: rh, decision_id: (entry && entry.decision_id) || null });
    if (!rh) continue;
    if (!byOldHash.has(rh)) byOldHash.set(rh, []);
    byOldHash.get(rh).push({ basename: basename, absPath: absPath, entry: entry });
  }

  // 3. build renames + pre-flight collision checks.
  const renames = [];  // { receiptAbs, oldHash, newHash, oldName, newName, oldAbs, newAbs, oldRel, newRel, newEntry, decisionId }
  const newHashes = new Set();
  const problems = [];
  for (const r of receipts) {
    // newHash must not collide with a DIFFERENT receipt's identity (merge).
    if (newHashes.has(r.newHash)) problems.push('newHash collision (two receipts → same hash): ' + r.newHash);
    newHashes.add(r.newHash);
    if (allOldHashes.has(r.newHash) && r.newHash !== r.oldHash) {
      problems.push('newHash ' + r.newHash + ' collides with an existing receipt oldHash (identity merge)');
    }
    const bound = byOldHash.get(r.oldHash) || [];
    for (const b of bound) {
      const newEntry = JSON.parse(JSON.stringify(b.entry));
      newEntry.receipt_hash = r.newHash;
      const v = validateEntry(newEntry);
      if (!v.ok) problems.push('re-keyed entry invalid for ' + b.basename + ': ' + v.errors.join('; '));
      const newName = entryId(newEntry) + '.json';
      const newAbs = path.join(ledgerDir, newName);
      // target collision: exists AND is not the same (decision, newHash) we intend.
      if (fs.existsSync(newAbs) && newName !== b.basename) {
        const existing = readJson(newAbs);
        const ee = existing && existing.entry;
        const sameReKey = ee && ee.decision_id === newEntry.decision_id && ee.receipt_hash === r.newHash;
        if (!sameReKey) {
          problems.push('target ledger filename ' + newName + ' already exists and is a DIFFERENT entry (collision)');
        }
      }
      renames.push({
        receiptAbs: r.absPath,
        oldHash: r.oldHash,
        newHash: r.newHash,
        oldName: b.basename,
        newName: newName,
        oldAbs: b.absPath,
        newAbs: newAbs,
        oldRel: toPosixRel(repoRoot, b.absPath),
        newRel: toPosixRel(repoRoot, newAbs),
        newEntry: newEntry,
        decisionId: newEntry.decision_id,
      });
    }
  }
  if (problems.length > 0) throw preflightError('pre-flight validation failed:\n  - ' + problems.join('\n  - '));

  // 3b. R3/F2 — stranded old-ledger detection (partial-crash recovery for the
  //     "receipt redacted → old-ledger not yet unlinked" window). applyRebind
  //     writes the new ledger BEFORE redacting the receipt, so a redacted receipt
  //     ALWAYS has a correctly-bound sibling ledger. A tracked ledger that is (a)
  //     dangling (its hash binds no current receipt) and (b) belongs to a decision
  //     whose current receipt hash IS bound by another tracked ledger is a stranded
  //     old ledger → plan its unlink. A LEGITIMATELY dangling entry has no
  //     correctly-bound sibling and is left untouched (conservative).
  const strandedUnlinks = [];
  const renameOldNames = new Set(renames.map(function (rn) { return rn.oldName; }));
  const ledgersByDecision = new Map();
  for (const L of trackedLedgerDetailed) {
    if (!L.decision_id) continue;
    if (!ledgersByDecision.has(L.decision_id)) ledgersByDecision.set(L.decision_id, []);
    ledgersByDecision.get(L.decision_id).push(L);
  }
  for (const pair of receiptHashByDecision) {
    const decision = pair[0];
    const curHash = pair[1];
    const entries = ledgersByDecision.get(decision) || [];
    const hasCorrectlyBound = entries.some(function (e) { return e.receipt_hash === curHash; });
    if (!hasCorrectlyBound) continue; // redaction not complete for this decision → not the crash window
    for (const e of entries) {
      if (e.receipt_hash === curHash) continue;       // the correct one
      if (allOldHashes.has(e.receipt_hash)) continue; // still binds SOME receipt → not stranded
      if (renameOldNames.has(e.basename)) continue;   // already handled as a rekey unlink
      strandedUnlinks.push({
        basename: e.basename,
        oldAbs: e.absPath,
        oldRel: toPosixRel(repoRoot, e.absPath),
        decisionId: decision,
        oldHash: e.receipt_hash,
      });
    }
  }
  const strandedNames = new Set(strandedUnlinks.map(function (s) { return s.basename; }));

  // 4. dangling accounting for the post-apply scan (iii).
  //    preRunDangling = tracked ledger entries whose receipt_hash matches NO
  //    receipt oldHash. intendedTrackedSet = pre-run tracked basenames with the
  //    old→new renames applied (E6 untracked + stranded deletions excluded — they
  //    leave the tracked tree).
  const renameByOld = new Map(renames.map(function (rn) { return [rn.oldName, rn.newName]; }));
  const trackedBasenamesArr = allLedgerEntries.filter(function (e) { return e.tracked; }).map(function (e) { return e.basename; });
  let preRunDangling = 0;
  for (const e of allLedgerEntries) {
    if (!e.tracked) continue;
    if (!e.receipt_hash || !allOldHashes.has(e.receipt_hash)) preRunDangling += 1;
  }
  const intendedTrackedSet = trackedBasenamesArr
    .map(function (b) { return renameByOld.has(b) ? renameByOld.get(b) : b; })
    .filter(function (b) { return !strandedNames.has(b); });

  return {
    repoRoot: repoRoot,
    receipts: receipts,
    renames: renames,
    strandedUnlinks: strandedUnlinks,
    skipped: skipped,
    preRunDangling: preRunDangling,
    intendedTrackedSet: intendedTrackedSet,
    ledgerDir: ledgerDir,
  };
}

function preflightError(msg) {
  const e = new Error(msg);
  e.code = 'PREFLIGHT_ABORT';
  return e;
}

// ── apply phase ──────────────────────────────────────────────────────────────

function applyRebind(repoRoot, plan) {
  const expectedBlobs = {}; // relPath → git blob OID (M/A paths only; D has none)
  // group renames by receipt so we do new-ledger → receipt → unlink-old per receipt.
  const renamesByReceipt = new Map();
  for (const rn of plan.renames) {
    if (!renamesByReceipt.has(rn.receiptAbs)) renamesByReceipt.set(rn.receiptAbs, []);
    renamesByReceipt.get(rn.receiptAbs).push(rn);
  }

  for (const r of plan.receipts) {
    // TOCTOU guard — re-read the on-disk receipt, assert its identity is still
    // the planned oldHash. Abort the WHOLE run if it changed under us.
    const disk = readJson(r.absPath);
    const diskHash = disk && disk.receipt_hash;
    if (diskHash !== r.oldHash) {
      const e = new Error('TOCTOU: receipt ' + r.file + ' changed under the run (disk=' +
        String(diskHash).slice(0, 20) + '… planned=' + String(r.oldHash).slice(0, 20) + '…); aborting all-or-nothing');
      e.code = 'TOCTOU_ABORT';
      throw e;
    }
    const rns = renamesByReceipt.get(r.absPath) || [];
    // (a) NEW-named ledger first (idempotent: skip if already the right content).
    for (const rn of rns) {
      const body = JSON.stringify({ schema_version: 'v1', entry: rn.newEntry }, null, 2) + '\n';
      const existing = readJson(rn.newAbs);
      const already = existing && existing.entry && existing.entry.receipt_hash === rn.newHash
        && existing.entry.decision_id === rn.newEntry.decision_id;
      if (!already) writeAtomic(rn.newAbs, body);
    }
    // (b) redacted receipt via DIRECT fs (bypasses store.writeReceipt guard).
    //     writeAtomic is tmp+rename — the receipt is never truncated in place
    //     (Implement-Codex IF2): a crash leaves the OLD intact receipt until the
    //     atomic rename lands the fully-written new one. Re-read + validate the
    //     landed content before proceeding (IF2 belt-and-suspenders).
    writeAtomic(r.absPath, JSON.stringify(r.clone, null, 2) + '\n');
    const back = readJson(r.absPath);
    if (!back || back.receipt_hash !== r.newHash) {
      const e = new Error('post-write validation failed for ' + r.file +
        ' (re-read hash != newHash); aborting all-or-nothing');
      e.code = 'POSTWRITE_VALIDATE';
      throw e;
    }
    expectedBlobs[r.relPath] = hashObject(repoRoot, r.absPath);
    for (const rn of rns) expectedBlobs[rn.newRel] = hashObject(repoRoot, rn.newAbs);
    // (c) unlink OLD-named ledger last.
    for (const rn of rns) {
      if (rn.oldAbs !== rn.newAbs && fs.existsSync(rn.oldAbs)) {
        try { fs.unlinkSync(rn.oldAbs); } catch (_e) { /* leftover — caught by scan */ }
      }
    }
  }
  // R3/F2 — unlink stranded old ledgers (partial-crash leftovers with no rekey
  // this run). Idempotent: skip if already gone. The post-apply scan verifies it.
  for (const s of (plan.strandedUnlinks || [])) {
    if (fs.existsSync(s.oldAbs)) {
      try { fs.unlinkSync(s.oldAbs); } catch (_e) { /* leftover — caught by scan */ }
    }
  }
  return expectedBlobs;
}

// ── post-apply invariant scan (self-contained, fail-closed) ──────────────────
// Driven by the in-memory plan + disk reads ONLY — NEVER `git ls-files` (post-
// rename the new files are untracked-in-index, so an index-based scan would
// exclude the very bindings it must verify — Codex R2 F-C).

function postApplyScan(repoRoot, plan) {
  const violations = [];
  // current receipt hashes (post-apply, read from disk) for dangling accounting.
  const receiptDir = path.join(repoRoot, RECEIPT_SUBDIR);
  const currentReceiptHashes = new Set();
  if (fs.existsSync(receiptDir)) {
    for (const f of fs.readdirSync(receiptDir)) {
      if (!f.endsWith('.json')) continue;
      const j = readJson(path.join(receiptDir, f));
      if (j && typeof j.receipt_hash === 'string') currentReceiptHashes.add(j.receipt_hash);
    }
  }
  // (i) each new-named ledger exists + bound to its receipt's new hash.
  for (const rn of plan.renames) {
    if (!fs.existsSync(rn.newAbs)) { violations.push('missing new-ledger ' + rn.newRel); continue; }
    const entry = (readJson(rn.newAbs) || {}).entry;
    if (!entry || entry.receipt_hash !== rn.newHash) {
      violations.push('new-ledger ' + rn.newRel + ' not bound to newHash');
    }
    const receiptDisk = readJson(rn.receiptAbs);
    if (!receiptDisk || receiptDisk.receipt_hash !== rn.newHash) {
      violations.push('receipt ' + toPosixRel(repoRoot, rn.receiptAbs) + ' not redacted to newHash (partial write)');
    }
    // (ii) old-named ledger gone (no old+new duplicate).
    if (rn.oldAbs !== rn.newAbs && fs.existsSync(rn.oldAbs)) {
      violations.push('old-ledger ' + rn.oldRel + ' still present (duplicate/dangling)');
    }
  }
  // (ii-b) R3/F2 — stranded old ledgers unlinked (partial-crash leftovers cleaned).
  for (const s of (plan.strandedUnlinks || [])) {
    if (fs.existsSync(s.oldAbs)) {
      violations.push('stranded old-ledger ' + s.oldRel + ' still present (partial-crash leftover not cleaned)');
    }
  }
  // (iii) zero NEW dangling among the intended tracked set.
  let postDangling = 0;
  for (const basename of plan.intendedTrackedSet) {
    const abs = path.join(plan.ledgerDir, basename);
    const entry = (readJson(abs) || {}).entry;
    const rh = entry && entry.receipt_hash;
    if (!rh || !currentReceiptHashes.has(rh)) postDangling += 1;
  }
  if (postDangling > plan.preRunDangling) {
    violations.push('NEW dangling appeared: post=' + postDangling + ' > pre=' + plan.preRunDangling);
  }
  return { ok: violations.length === 0, violations: violations, post_dangling: postDangling };
}

// ── manifest (bridges apply → stage/verify across processes) ──────────────────

function manifestPath(repoRoot) { return path.join(repoRoot, MANIFEST_REL); }

function writeManifest(repoRoot, plan, expectedBlobs) {
  const manifest = {
    generated_at: new Date().toISOString(),
    receipts: plan.receipts.map(function (r) { return r.relPath; }),          // status M or A
    ledger_deleted: plan.renames
      .filter(function (rn) { return rn.oldAbs !== rn.newAbs; })
      .map(function (rn) { return rn.oldRel; })
      .concat((plan.strandedUnlinks || []).map(function (s) { return s.oldRel; })), // status D (+ R3/F2 stranded)
    ledger_added: plan.renames.map(function (rn) { return rn.newRel; }),      // status M or A
    expected_blobs: expectedBlobs,                                            // for the "present" paths
  };
  writeAtomic(manifestPath(repoRoot), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function readManifest(repoRoot) { return readJson(manifestPath(repoRoot)); }

// Parse `git diff --cached --name-status -z --no-renames` → [{ status, path }].
function parseNameStatusZ(raw) {
  const parts = raw.split('\0').filter(function (s) { return s.length > 0; });
  const out = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    out.push({ status: parts[i][0], path: parts[i + 1] });
  }
  return out;
}

// EXACT-MANIFEST gate (Codex R3 F-F + R4 F-G). The staged index must be EXACTLY
// the planned manifest — no more, no less — with correct statuses + content
// blobs. An allowlist (reject out-of-plan) is insufficient: a concurrent
// writeEntry recreating an unlinked old ledger file makes `git add -u` silently
// skip its D, leaving the manifest short one deletion; only exact set-equality
// (every planned D present) catches it. Receipt/new-ledger "present" accepts
// BOTH M (rebind-in-place, base=HEAD) and A (post `reset --soft`, base=origin/
// main) — the base determines the letter; the invariant is presence + expected
// content, and old-ledger MUST be D.
function verifyManifest(repoRoot) {
  const manifest = readManifest(repoRoot);
  if (!manifest) return { ok: false, violations: ['no manifest — run --apply first'] };
  const violations = [];
  const expected = new Map(); // path → 'present' | 'deleted'
  for (const p of manifest.receipts) expected.set(p, 'present');
  for (const p of manifest.ledger_added) expected.set(p, 'present');
  for (const p of manifest.ledger_deleted) expected.set(p, 'deleted');

  let staged;
  try {
    staged = parseNameStatusZ(gitRaw(['diff', '--cached', '--no-renames', '--name-status', '-z'], repoRoot));
  } catch (err) {
    return { ok: false, violations: ['git diff --cached failed: ' + (err && err.message)] };
  }
  const stagedMap = new Map(staged.map(function (s) { return [s.path, s.status]; }));

  for (const [p, kind] of expected) {
    if (!stagedMap.has(p)) { violations.push('planned ' + kind + ' path NOT staged: ' + p); continue; }
    const st = stagedMap.get(p);
    if (kind === 'deleted' && st !== 'D') {
      violations.push('expected D, got ' + st + ': ' + p + ' (missing planned deletion — concurrent recreate?)');
    }
    if (kind === 'present') {
      if (st !== 'A' && st !== 'M') violations.push('expected A/M, got ' + st + ': ' + p);
      const want = manifest.expected_blobs[p];
      let got = null;
      try { got = git(['rev-parse', ':' + p], repoRoot); } catch (_e) { got = null; }
      if (!want || got !== want) {
        violations.push('staged blob != expected redacted content: ' + p + ' (want ' + String(want).slice(0, 12) + ' got ' + String(got).slice(0, 12) + ')');
      }
    }
  }
  for (const s of staged) {
    if (!expected.has(s.path)) violations.push('UNEXPECTED staged path (out of plan — E6 or concurrent write?): ' + s.status + ' ' + s.path);
  }
  return { ok: violations.length === 0, violations: violations };
}

// Explicit planned-set staging (Codex R3 F-E) — NEVER `git add -A` the ledger
// dir (would sweep in the untracked E6). Stages tracked receipt rewrites + the 9
// old-ledger deletions via `git add -u <scoped>`, then the 9 new-named files
// explicitly. Runs the exact-manifest gate; on failure UNstages and reports.
function stagePlanned(repoRoot) {
  const manifest = readManifest(repoRoot);
  if (!manifest) return { ok: false, violations: ['no manifest — run --apply first'] };
  git(['add', '-u', '--', RECEIPT_SUBDIR, LEDGER_SUBDIR], repoRoot);
  if (manifest.ledger_added.length > 0) {
    git(['add', '--'].concat(manifest.ledger_added), repoRoot);
  }
  const res = verifyManifest(repoRoot);
  if (!res.ok) {
    // unstage the scoped set so a bad run leaves a clean index.
    try { git(['reset', '-q', 'HEAD', '--', RECEIPT_SUBDIR, LEDGER_SUBDIR], repoRoot); } catch (_e) { /* ignore */ }
  }
  return res;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function resolveRepoRoot(cwdArg) {
  const cwd = cwdArg || process.cwd();
  try { return git(['rev-parse', '--show-toplevel'], cwd); } catch (_e) { return path.resolve(cwd); }
}

function runCli(argv) {
  const args = { mode: 'dry-run' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.mode = 'apply';
    else if (a === '--dry-run') args.mode = 'dry-run';
    else if (a === '--stage') args.mode = 'stage';
    else if (a === '--verify') args.mode = 'verify';
    else if (a === '--cwd') args.cwd = argv[++i];
    else if (a === '-h' || a === '--help') { printUsage(); return 0; }
    else warn('unknown argument "' + a + '" (ignored)');
  }
  const repoRoot = resolveRepoRoot(args.cwd);

  if (args.mode === 'verify') {
    const res = verifyManifest(repoRoot);
    process.stdout.write(JSON.stringify({ mode: 'verify', ok: res.ok, violations: res.violations }, null, 2) + '\n');
    return res.ok ? 0 : 1;
  }
  if (args.mode === 'stage') {
    const res = stagePlanned(repoRoot);
    process.stdout.write(JSON.stringify({ mode: 'stage', ok: res.ok, violations: res.violations }, null, 2) + '\n');
    return res.ok ? 0 : 1;
  }

  // dry-run + apply both plan first.
  let plan;
  try {
    plan = planRebind(repoRoot);
  } catch (err) {
    warn((err && err.message) || String(err));
    return 1;
  }

  if (args.mode === 'dry-run') {
    process.stdout.write(JSON.stringify({
      mode: 'dry-run',
      repoRoot: repoRoot,
      receipts_planned: plan.receipts.length,
      ledger_rekeys_tracked: plan.renames.length,
      already_relative_skipped: plan.skipped,
      pre_run_dangling_tracked: plan.preRunDangling,
      collisions: 0,
      e6_excluded: true,
      sample: plan.receipts.slice(0, 3).map(function (r) {
        return { file: r.file, oldHash: String(r.oldHash).slice(0, 18), newHash: String(r.newHash).slice(0, 18) };
      }),
    }, null, 2) + '\n');
    return 0;
  }

  // apply — fail-closed lock FIRST (before any write), release in finally.
  let lock;
  try {
    lock = acquireLockFailClosed(repoRoot);
  } catch (err) {
    warn((err && err.message) || String(err));
    return 1;
  }
  try {
    // re-plan under the lock (state may have moved between the pre-lock plan and now).
    plan = planRebind(repoRoot);
    const expectedBlobs = applyRebind(repoRoot, plan);
    const scan = postApplyScan(repoRoot, plan);
    if (!scan.ok) {
      warn('POST-APPLY SCAN FAILED — DO NOT stage/commit (idempotent re-run heals partial state):');
      scan.violations.forEach(function (v) { warn('  - ' + v); });
      process.stdout.write(JSON.stringify({ mode: 'apply', ok: false, scan: scan }, null, 2) + '\n');
      return 1;
    }
    writeManifest(repoRoot, plan, expectedBlobs);
    process.stdout.write(JSON.stringify({
      mode: 'apply',
      ok: true,
      receipts_redacted: plan.receipts.length,
      ledger_rekeyed: plan.renames.length,
      post_dangling: scan.post_dangling,
      manifest: toPosixRel(repoRoot, manifestPath(repoRoot)),
      next: 'run --stage to stage the planned set + exact-manifest gate, then commit',
    }, null, 2) + '\n');
    return 0;
  } catch (err) {
    warn((err && err.message) || String(err));
    return 1;
  } finally {
    releaseLock(repoRoot, lock.token);
  }
}

function printUsage() {
  process.stdout.write([
    'Usage: v1.22.4-cwd-rebind.js [--dry-run|--apply|--stage|--verify] [--cwd <path>]',
    '',
    '  --dry-run  (default)  plan only: print counts, no writes',
    '  --apply               fail-closed lock → redact receipts + re-key tracked ledger',
    '                        (new-ledger→receipt→unlink-old) → post-apply scan → manifest',
    '  --stage               git add the planned set (never `git add -A`) + exact-manifest gate',
    '  --verify              exact-manifest gate only (no staging)',
  ].join('\n') + '\n');
}

module.exports = {
  planRebind: planRebind,
  applyRebind: applyRebind,
  postApplyScan: postApplyScan,
  writeManifest: writeManifest,
  readManifest: readManifest,
  verifyManifest: verifyManifest,
  stagePlanned: stagePlanned,
  parseNameStatusZ: parseNameStatusZ,
  acquireLockFailClosed: acquireLockFailClosed,
  releaseLock: releaseLock,
  tryReclaimStale: tryReclaimStale,
  lockPath: lockPath,
  manifestPath: manifestPath,
  runCli: runCli,
  LOCK_STALE_MS: LOCK_STALE_MS,
};

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}
