#!/usr/bin/env node
// v0.2.8 Task 2.6.5 — Generic receipt quarantine (one-shot idempotent).
//
// Origin: Codex R1-F3 absorption from v0.2.8 plan-codex. Before v0.2.8
// the validate-cmd `default`/`main` slug fallback let stale v0.1-era
// receipts re-validate any unrelated plan, producing a false-green path
// when /mccp:pr on `main` derived `decision_id=main`. v0.2.8 hardens
// validate-cmd to reject generic slugs without an explicit `--plan`
// match — but legacy `default.json` / `main.json` receipts in existing
// worktrees would suddenly hard-fail every command. This migration
// quarantines them to `<slug>.legacy.json` before the reject activates.
//
// Auto-trigger surface (per plan):
//   - validate-cmd entry point (top of validateCommand)
//   - /mccp:pr Phase 0 preflight
// Migration runs once per worktree, gated by a completion marker.
//
// Absorptions woven into this implementation:
//   R2-F3   resumable + collision-safe rename (active source preserved
//           via `<slug>.legacy-<ISO_TS>.json` on collision — never lost)
//   IMPL-R1-F1  receipt-store driven scan over GATE_IDS × {default, main}
//               (no hardcoded path list — future gates auto-covered)
//   IMPL-R1-F2  marker.lock with `fs.openSync('wx')` create-new exclusive,
//               try/finally release, stale-lock recovery
//   IMPL-R2-F1  lock-loser bounded poll on marker (max 2s @ 100ms);
//               on timeout/partial/failed → systemMessage + EX_TEMPFAIL.
//               Lock loser never proceeds against pre-migration state.
//
// Usage (programmatic):
//   const { migrate } = require('./v0.2.8-generic-receipt-quarantine');
//   const result = migrate(repoRoot);
//   // result.status ∈ {'complete', 'partial', 'failed', 'already-migrated',
//   //                  'in-progress-aborted'}
//
// Usage (CLI — for ops):
//   node v0.2.8-generic-receipt-quarantine.js [--dry-run] [--cwd <path>]

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const { listGenericReceipts } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'store'));

const MARKER_REL = path.join('.claude', 'receipts', '.migrations', 'v0.2.8-generic-quarantine.json');
const LOCK_REL = path.join('.claude', 'receipts', '.migrations', 'v0.2.8-generic-quarantine.lock');

// IMPL-R2-F1 lock loser bounded poll constants.
const POLL_INTERVAL_MS = 100;
const POLL_MAX_MS = 2000;
// Stale lock thresholds. 60s is migration worst case (8 collision renames
// + marker write) with a generous safety margin.
const STALE_LOCK_MS = 60_000;

// EX_TEMPFAIL — sysexits(3) convention. Caller (validate-cmd / /mccp:pr
// Phase 0) maps this to an abort with retry hint, not a hard fail.
const EX_TEMPFAIL = 75;

function markerPath(repoRoot) { return path.join(repoRoot, MARKER_REL); }
function lockPath(repoRoot) { return path.join(repoRoot, LOCK_REL); }

function readMarker(repoRoot) {
  const p = markerPath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// R2-F3 marker semantics: `complete` only when active generic source
// receipts reach zero. `partial` / `failed` preserve pending list for
// the next run to resume. The temp-then-rename here keeps marker writes
// atomic relative to readers polling for state="complete".
function writeMarkerAtomic(repoRoot, marker) {
  const p = markerPath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(marker, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

// IMPL-R1-F2 lock acquire — create-new exclusive. Returns null on
// contention (caller becomes lock loser). Returns null on stale lock if
// the holder couldn't be cleaned up (rare error path).
function acquireLock(repoRoot) {
  const p = lockPath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lockBody = JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    host: os.hostname(),
  });
  try {
    const fd = fs.openSync(p, 'wx');
    fs.writeSync(fd, lockBody);
    fs.closeSync(fd);
    return p;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    if (tryReclaimStaleLock(p)) {
      try {
        const fd = fs.openSync(p, 'wx');
        fs.writeSync(fd, lockBody);
        fs.closeSync(fd);
        return p;
      } catch { return null; }
    }
    return null;
  }
}

// IMPL-R1-F2 stale-lock recovery. Holder is considered orphan when its
// pid is no longer alive OR its `started_at` is older than STALE_LOCK_MS.
// On orphan detection we unlink the lock so the caller's next acquire
// attempt has a clean slot.
function tryReclaimStaleLock(lockFilePath) {
  let body;
  try { body = JSON.parse(fs.readFileSync(lockFilePath, 'utf8')); } catch { body = null; }
  if (!body || typeof body !== 'object') {
    try { fs.unlinkSync(lockFilePath); return true; } catch { return false; }
  }
  const ageMs = Date.now() - Date.parse(body.started_at || '');
  const ageStale = Number.isFinite(ageMs) && ageMs > STALE_LOCK_MS;
  const pidDead = !isPidAlive(body.pid);
  if (ageStale || pidDead) {
    try { fs.unlinkSync(lockFilePath); return true; } catch { return false; }
  }
  return false;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) {
    // ESRCH = no such process; EPERM = process exists but signal denied.
    return e.code === 'EPERM';
  }
}

function releaseLock(repoRoot) {
  try { fs.unlinkSync(lockPath(repoRoot)); } catch { /* already gone */ }
}

// IMPL-R2-F1 lock-loser bounded poll. Caller polls the marker for
// state="complete" while the winner finishes. Resolves to a status
// string the caller can map to its own control flow.
function waitForMarkerComplete(repoRoot) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_MAX_MS) {
    const m = readMarker(repoRoot);
    if (m && m.state === 'complete') return 'complete';
    if (m && (m.state === 'partial' || m.state === 'failed')) return m.state;
    sleepSync(POLL_INTERVAL_MS);
  }
  return 'timeout';
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy wait — short intervals only */ }
}

// Active = receipt is still on a "generic" path; passive once moved to
// `<slug>.legacy*.json`. The migration is "complete" only when zero
// active receipts remain — R2-F3 invariant.
function scanActiveGeneric(repoRoot) { return listGenericReceipts(repoRoot); }

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// R2-F3 collision-safe rename. Target may exist if the user ran a prior
// manual quarantine, or if v0.2.8 was applied, reverted, and re-applied.
// We never preserve the active source — collision case moves it to a
// timestamped legacy name so two distinct receipts cannot share a path.
function renameWithCollisionSafety(receipt) {
  const dir = path.dirname(receipt.path);
  const targetBase = receipt.decision_id + '.legacy.json';
  const targetPath = path.join(dir, targetBase);
  if (!fs.existsSync(targetPath)) {
    fs.renameSync(receipt.path, targetPath);
    return { renamed: { from: receipt.path, to: targetPath } };
  }
  const collisionTarget = path.join(dir, receipt.decision_id + '.legacy-' + isoStamp() + '.json');
  fs.renameSync(receipt.path, collisionTarget);
  return { collided_moved: { from: receipt.path, to: collisionTarget } };
}

function migrate(repoRoot, opts) {
  opts = opts || {};
  const existingMarker = readMarker(repoRoot);
  if (existingMarker && existingMarker.state === 'complete') {
    return { status: 'already-migrated', marker: existingMarker };
  }

  const acquired = acquireLock(repoRoot);
  if (!acquired) {
    // IMPL-R2-F1 lock-loser path. Wait briefly for the winner; if the
    // winner can't finish or marker stays partial/failed, surface the
    // EX_TEMPFAIL signal so the caller aborts instead of reading
    // pre-migration state.
    const waited = waitForMarkerComplete(repoRoot);
    if (waited === 'complete') {
      return { status: 'already-migrated', marker: readMarker(repoRoot) };
    }
    if (opts.systemMessage) opts.systemMessage(
      'v0.2.8 generic-receipt quarantine migration in progress, ' +
      'command aborted — retry in a moment (state: ' + waited + ')');
    return { status: 'in-progress-aborted', exitCode: EX_TEMPFAIL, waited: waited };
  }

  try {
    const renamed = [];
    const collidedMoved = [];
    const errors = [];
    const pending = [];

    let active = scanActiveGeneric(repoRoot);
    if (opts.beforeRenameHook) opts.beforeRenameHook(active);

    for (const receipt of active) {
      try {
        const result = renameWithCollisionSafety(receipt);
        if (result.renamed) renamed.push(result.renamed);
        if (result.collided_moved) collidedMoved.push(result.collided_moved);
      } catch (err) {
        errors.push({ path: receipt.path, code: err.code || null, message: err.message });
        pending.push({ gate_id: receipt.gate_id, decision_id: receipt.decision_id });
      }
    }

    const remaining = scanActiveGeneric(repoRoot);
    for (const r of remaining) {
      if (!pending.some(p => p.gate_id === r.gate_id && p.decision_id === r.decision_id)) {
        pending.push({ gate_id: r.gate_id, decision_id: r.decision_id });
      }
    }

    const state = remaining.length === 0
      ? 'complete'
      : (errors.length > 0 ? 'failed' : 'partial');

    const prior = existingMarker || { runs: [] };
    const marker = {
      state: state,
      worktree: repoRoot,
      pending: pending,
      runs: (prior.runs || []).concat([{
        ran_at: new Date().toISOString(),
        renamed: renamed,
        collided_moved: collidedMoved,
        errors: errors,
      }]),
    };
    if (errors.length > 0) marker.last_error = errors[errors.length - 1].message;

    writeMarkerAtomic(repoRoot, marker);
    return {
      status: state,
      renamed: renamed,
      collided_moved: collidedMoved,
      errors: errors,
      pending: pending,
    };
  } finally {
    releaseLock(repoRoot);
  }
}

function findRepoRoot(start) {
  let dir = path.resolve(start || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function runCli(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--cwd' && i + 1 < argv.length) args.cwd = argv[++i];
    else args._.push(a);
  }
  const repoRoot = findRepoRoot(args.cwd);
  if (!repoRoot) {
    process.stderr.write('v0.2.8-generic-receipt-quarantine: not in a git repository\n');
    return 1;
  }
  if (args.dryRun) {
    const active = listGenericReceipts(repoRoot);
    process.stdout.write(JSON.stringify({
      dryRun: true,
      repoRoot: repoRoot,
      activeGenericReceipts: active.map(r => ({ gate_id: r.gate_id, decision_id: r.decision_id, path: r.path })),
    }, null, 2) + '\n');
    return 0;
  }
  const result = migrate(repoRoot, {
    systemMessage: function (msg) { process.stderr.write('[mccp] ' + msg + '\n'); },
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status === 'in-progress-aborted') return result.exitCode;
  if (result.status === 'failed') return 1;
  return 0;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  migrate: migrate,
  acquireLock: acquireLock,
  releaseLock: releaseLock,
  tryReclaimStaleLock: tryReclaimStaleLock,
  waitForMarkerComplete: waitForMarkerComplete,
  readMarker: readMarker,
  writeMarkerAtomic: writeMarkerAtomic,
  scanActiveGeneric: scanActiveGeneric,
  renameWithCollisionSafety: renameWithCollisionSafety,
  markerPath: markerPath,
  lockPath: lockPath,
  EX_TEMPFAIL: EX_TEMPFAIL,
  POLL_INTERVAL_MS: POLL_INTERVAL_MS,
  POLL_MAX_MS: POLL_MAX_MS,
  STALE_LOCK_MS: STALE_LOCK_MS,
};
