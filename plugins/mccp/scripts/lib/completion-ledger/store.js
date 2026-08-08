'use strict';

// Dashboard Truthfulness M1 — completion-ledger store.
//
// One-file-per-entry directory `.claude/state/completion-ledger/<id>.json`
// (Codex F2 absorption — distinct filenames give cross-worktree append a zero
// git-merge-conflict surface, mirroring the per-session-file session-ledger
// pattern). Each file is `{ schema_version: 'v1', entry: {...} }`.
//
// Public surface:
//   writeEntry(repoRoot, entry, opts)  → { ok, path, noop?, error? }  (fail-open)
//   readLedger(repoRoot, opts)         → { ok, entries, invalid_count, degraded, error }
//   validateEntry(entry)               → { ok, errors }
//   isLedgerAppendSafe(repoRoot, opts) → { safe, reason, commit_sha? }  (Task 2 / F1)
//   entryId(entry)                     → filesystem-safe `<decision>__<hash12>`
//
// lock + atomic (tmp+rename) + strict validate + loud fail-open mirror
// state/session-ledger.js.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SCHEMA_VERSION = 'v1';
const LEDGER_SUBDIR = path.join('.claude', 'state', 'completion-ledger');

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const SHA_HEX_RE = /^[0-9a-f]{7,40}$/i;
const VALID_VERDICTS = Object.freeze(['converged', 'advisory', 'skipped']);

// M1 Task 1 — verdict_provenance (additive, present-only). Records HOW an entry's
// verdict was established so audits + the migration can distinguish a fresh
// codex_verdict-corroborated append from a preserved-but-unverified legacy entry.
//   'codex-verdict'  new append, corroborated by a present resolution.codex_verdict
//   'legacy-unknown' migration-preserved: no ship OR a ship with no codex_verdict
//   'superseded'     migration-preserved: recorded verdict disagrees with the ship
//   'multi-agent'    diverse-agent-review M1: approval issued by the L1+L2 review
//                    panel (no Codex in the loop for this gate)
//   'hybrid'         M1: L1+L2 panel corroborated by a Codex L3 layer
// The two M1 values are ADDITIVE — the original three keep their exact meaning,
// so no existing git-tracked ledger entry needs rekeying (§3.12 no-rehash).
const VALID_PROVENANCE = Object.freeze([
  'codex-verdict', 'legacy-unknown', 'superseded', 'multi-agent', 'hybrid',
]);

const KNOWN_ENTRY_KEYS = Object.freeze(new Set([
  'decision_id',
  'gate',
  'verdict',
  'version',
  'completed_at',
  'commit_sha',
  'plan_basename',
  'plan_file_hash',
  'risks_closed',
  'oq_closed',
  'receipt_hash',
  'verdict_provenance',
]));

// clean-tree git-safety allowlist (F1). These are mccp's own
// generated/working/bookkeeping artifacts; their presence in
// `git status --porcelain` must NOT mark the tree dirty for ledger-append
// purposes. Everything else (source code, plan body edits) being dirty means
// the commit_sha we would record does not reproduce the reviewed state → skip.
//
// `.claude/receipts/` is included because the receipt-write epilogue persists
// the receipt file BEFORE this gate runs; in repos that gitignore receipts
// (the mccp norm, CLAUDE.md §3.8) porcelain hides them anyway, but the
// allowlist makes the gate correct independent of gitignore config — receipts
// are worktree-local ephemera, never the reviewed source state.
const APPEND_SAFE_ALLOWLIST = Object.freeze([
  '.claude/state/completion-ledger/',
  '.claude/state/STATE.md',
  '.claude/cache/',
  '.claude/receipts/',
]);

const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30000;

const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  Atomics.wait(SLEEP_BUF, 0, 0, ms);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function warn(message) {
  process.stderr.write('[mccp:completion-ledger] WARNING: ' + message + '\n');
}

function ledgerDir(repoRoot) {
  return path.join(repoRoot, LEDGER_SUBDIR);
}

// Filesystem-safe id part: collapse anything outside [A-Za-z0-9._-] to '_',
// strip leading dots (no hidden files / no `..` traversal), cap length.
function sanitizeIdPart(s) {
  let out = String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]/g, '_');
  out = out.replace(/^\.+/, '');
  return out.slice(0, 200);
}

function entryId(entry) {
  const dec = sanitizeIdPart(entry && entry.decision_id) || 'unknown';
  const rawHash = String((entry && entry.receipt_hash) || '').replace(/^sha256:/, '');
  const hash12 = sanitizeIdPart(rawHash).slice(0, 12) || 'nohash';
  return dec + '__' + hash12;
}

function entryFilePath(repoRoot, entry) {
  return path.join(ledgerDir(repoRoot), entryId(entry) + '.json');
}

function validateEntry(entry) {
  const errors = [];
  function req(cond, msg) { if (!cond) errors.push(msg); }

  if (!isPlainObject(entry)) return { ok: false, errors: ['entry must be an object'] };

  req(typeof entry.decision_id === 'string' && entry.decision_id.length > 0,
    'decision_id must be a non-empty string');
  req(typeof entry.gate === 'string' && entry.gate.length > 0,
    'gate must be a non-empty string');
  req(typeof entry.verdict === 'string' && VALID_VERDICTS.indexOf(entry.verdict) !== -1,
    'verdict must be one of: ' + VALID_VERDICTS.join(', '));
  req(entry.version === null
      || (typeof entry.version === 'string' && entry.version.length > 0),
    'version must be a non-empty string or null');
  req(typeof entry.completed_at === 'string' && ISO8601_RE.test(entry.completed_at),
    'completed_at must be an ISO8601 string');
  req(entry.commit_sha === null
      || (typeof entry.commit_sha === 'string' && SHA_HEX_RE.test(entry.commit_sha)),
    'commit_sha must be a 7-40 char hex string or null');
  req(typeof entry.plan_basename === 'string' && entry.plan_basename.length > 0,
    'plan_basename must be a non-empty string');
  req(entry.plan_file_hash === null
      || (typeof entry.plan_file_hash === 'string' && entry.plan_file_hash.length > 0),
    'plan_file_hash must be a non-empty string or null');
  req(Array.isArray(entry.risks_closed)
      && entry.risks_closed.every(function (x) { return typeof x === 'string'; }),
    'risks_closed must be an array of strings');
  req(Array.isArray(entry.oq_closed)
      && entry.oq_closed.every(function (x) { return typeof x === 'string'; }),
    'oq_closed must be an array of strings');
  req(typeof entry.receipt_hash === 'string' && entry.receipt_hash.length > 0,
    'receipt_hash must be a non-empty string');
  // Present-only: absent on pre-M1 entries (they validate unchanged).
  if (entry.verdict_provenance !== undefined && entry.verdict_provenance !== null) {
    req(typeof entry.verdict_provenance === 'string'
        && VALID_PROVENANCE.indexOf(entry.verdict_provenance) !== -1,
      'verdict_provenance must be one of: ' + VALID_PROVENANCE.join(', ') + ' (or absent)');
  }

  for (const k of Object.keys(entry)) {
    if (!KNOWN_ENTRY_KEYS.has(k)) {
      errors.push('unknown entry key "' + k + '" (completion-ledger entry schema is strict)');
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function tryAcquire(lockFile) {
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, String(process.pid) + '\n' + new Date().toISOString());
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return false;
  }
}

function isStaleLock(lockFile) {
  try {
    const stat = fs.statSync(lockFile);
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch (_e) { return false; }
}

function withLedgerLock(targetFile, fn) {
  const lockFile = targetFile + '.lock';
  ensureDir(path.dirname(targetFile));
  let acquired = false;
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    if (tryAcquire(lockFile)) { acquired = true; break; }
    if (isStaleLock(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
      continue;
    }
    sleepSync(LOCK_RETRY_MS);
  }
  if (!acquired) {
    warn('could not acquire lock at ' + lockFile + ' after '
      + (LOCK_MAX_RETRIES * LOCK_RETRY_MS) + 'ms; proceeding without lock (race window open)');
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
    }
  }
}

function writeFileAtomic(target, content) {
  const tmp = target + '.tmp';
  ensureDir(path.dirname(target));
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    throw err;
  }
}

// writeEntry — idempotent per (decision_id, receipt_hash) filename. Existing
// file → no-op (same receipt re-shipped). Loud fail-open: never throws.
function writeEntry(repoRoot, entry, opts) {
  opts = opts || {};
  try {
    const v = validateEntry(entry);
    if (!v.ok) {
      warn('refusing to write invalid entry: ' + v.errors.join('; '));
      return { ok: false, error: 'invalid entry: ' + v.errors.join('; ') };
    }
    const target = entryFilePath(repoRoot, entry);
    if (fs.existsSync(target)) {
      return { ok: true, noop: true, path: target };
    }
    const body = JSON.stringify({ schema_version: SCHEMA_VERSION, entry: entry }, null, 2) + '\n';
    let raced = false;
    withLedgerLock(target, function () {
      // Re-check inside the lock — another writer may have landed the same id.
      if (fs.existsSync(target)) { raced = true; return; }
      writeFileAtomic(target, body);
    });
    return { ok: true, noop: raced, path: target };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    warn('entry write failed: ' + msg + ' (continuing)');
    return { ok: false, error: msg };
  }
}

// readLedger — glob the directory, validate each file, dedup by decision_id
// (latest completed_at wins). Loud fail-open: degraded flag, never throws.
function readLedger(repoRoot, opts) {
  opts = opts || {};
  const dir = ledgerDir(repoRoot);
  if (!fs.existsSync(dir)) {
    return { ok: true, entries: [], invalid_count: 0, degraded: false, error: null };
  }
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return {
      ok: false, entries: [], invalid_count: 0, degraded: false,
      error: err && err.message ? err.message : String(err),
    };
  }
  const byDecision = new Map();
  let invalidCount = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const target = path.join(dir, name);
    try {
      const raw = fs.readFileSync(target, 'utf8');
      const parsed = JSON.parse(raw);
      const entry = parsed && parsed.entry;
      const v = validateEntry(entry);
      if (!v.ok) { invalidCount += 1; continue; }
      const prev = byDecision.get(entry.decision_id);
      if (!prev) {
        byDecision.set(entry.decision_id, entry);
      } else {
        const a = Date.parse(entry.completed_at);
        const b = Date.parse(prev.completed_at);
        if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
          byDecision.set(entry.decision_id, entry);
        }
      }
    } catch (_err) {
      invalidCount += 1;
    }
  }
  const entries = Array.from(byDecision.values());
  return {
    ok: true,
    entries: entries,
    invalid_count: invalidCount,
    degraded: invalidCount > 0,
    error: null,
  };
}

// --- Task 2: clean-tree git-safety gate (F1) ---

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isAllowlisted(p) {
  const norm = String(p).replace(/\\/g, '/');
  return APPEND_SAFE_ALLOWLIST.some(function (a) {
    return norm === a || norm.startsWith(a);
  });
}

// Parse a `git status --porcelain` line down to its (renamed-to) path.
function extractPorcelainPath(line) {
  if (!line || line.length < 4) return null;
  let p = line.slice(3);
  const arrow = p.indexOf(' -> ');
  if (arrow !== -1) p = p.slice(arrow + 4);
  if (p.length >= 2 && p.charCodeAt(0) === 34 && p.charCodeAt(p.length - 1) === 34) {
    p = p.slice(1, -1);
  }
  return p;
}

// isLedgerAppendSafe — F1 absorption. A ledger entry records commit_sha as the
// reviewed state's anchor. If HEAD is unborn/detached OR the working tree is
// dirty (after the allowlist), that anchor is not reproducible → unsafe.
// In the mccp flow `/mccp:pr` runs AFTER `/mccp:prp-commit`, so the source
// tree is clean and normal PRs append successfully.
function isLedgerAppendSafe(repoRoot, opts) {
  opts = opts || {};
  const git = typeof opts.runGit === 'function' ? opts.runGit : runGit;

  let commitSha;
  try {
    commitSha = git(['rev-parse', 'HEAD'], repoRoot);
  } catch (_e) {
    return { safe: false, reason: 'unborn-head' };
  }
  if (!commitSha || !SHA_HEX_RE.test(commitSha)) {
    return { safe: false, reason: 'head-unresolved' };
  }

  let branch;
  try {
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  } catch (_e) {
    return { safe: false, reason: 'head-unresolved' };
  }
  if (branch === 'HEAD') {
    return { safe: false, reason: 'detached-head' };
  }

  let porcelain;
  try {
    porcelain = git(['status', '--porcelain'], repoRoot);
  } catch (_e) {
    return { safe: false, reason: 'status-failed' };
  }
  const dirty = porcelain.split(/\r?\n/).filter(Boolean).filter(function (line) {
    const p = extractPorcelainPath(line);
    return p && !isAllowlisted(p);
  });
  if (dirty.length > 0) {
    return { safe: false, reason: 'dirty-working-tree', dirty_count: dirty.length };
  }

  return { safe: true, reason: 'clean', commit_sha: commitSha };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  LEDGER_SUBDIR: LEDGER_SUBDIR,
  APPEND_SAFE_ALLOWLIST: APPEND_SAFE_ALLOWLIST,
  VALID_VERDICTS: VALID_VERDICTS,
  VALID_PROVENANCE: VALID_PROVENANCE,
  ledgerDir: ledgerDir,
  entryId: entryId,
  entryFilePath: entryFilePath,
  validateEntry: validateEntry,
  writeEntry: writeEntry,
  readLedger: readLedger,
  isLedgerAppendSafe: isLedgerAppendSafe,
};
