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
//               try/finally release, lease-based stale-lock recovery
//   IMPL-R2-F1  lock-loser bounded poll on marker (max 2s @ 100ms);
//               on timeout/partial/failed → systemMessage + EX_TEMPFAIL.
//               Lock loser never proceeds against pre-migration state.
//   TASK_2_6_5a_A1  ownership token in lock body + lease-based reclaim
//                   (mtime > LEASE_TTL_MS OR pidDead; not started_at) +
//                   in-loop heartbeat keeps live holder safe past lease.
//                   (Deviation from plan's setInterval — Node timers do not
//                   fire during sync migrate() execution; in-loop
//                   fs.utimesSync every HEARTBEAT_BATCH_SIZE renames is
//                   functionally equivalent without async cascade.)
//   TASK_2_6_5a_A2  path-containment guard — realpath canary + symlink
//                   rejection prevents the migration from following a
//                   symlinked/junctioned gate dir outside the worktree.
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

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const { listGenericReceipts, listUnsafeGateDirs } = require(path.join(PLUGIN_ROOT, 'scripts', 'receipt', 'store'));

const MARKER_REL = path.join('.claude', 'receipts', '.migrations', 'v0.2.8-generic-quarantine.json');
const LOCK_REL = path.join('.claude', 'receipts', '.migrations', 'v0.2.8-generic-quarantine.lock');

// IMPL-R2-F1 lock loser bounded poll constants.
const POLL_INTERVAL_MS = 100;
const POLL_MAX_MS = 2000;

// TASK_2_6_5a A1: lease-based reclaim (R1 F2). mtime is the primary signal;
// PID liveness is a secondary "obviously dead early reclaim" optimization.
// Renamed from STALE_LOCK_MS to LEASE_TTL_MS to reflect the semantic shift.
const LEASE_TTL_MS = 60_000;
// Backward-compat export for callers that read STALE_LOCK_MS (e.g. test (h3)).
const STALE_LOCK_MS = LEASE_TTL_MS;

// Heartbeat fires every HEARTBEAT_BATCH_SIZE rename ops (in-loop). With
// LEASE_TTL_MS=60s and typical rename <1ms, batch=25 keeps mtime fresh
// well under the lease window even on slow filesystems.
const HEARTBEAT_BATCH_SIZE = 25;

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

// A1 — acquireLock returns { lockPath, token } on success, null on
// contention. wx-only exclusive create (no tmp+rename); body includes a
// crypto.randomUUID() token so releaseLock can verify ownership before
// unlink. Between openSync('wx') and writeSync the file is zero-byte; a
// contender sees EEXIST + (per tryReclaimStaleLock) treats the empty body
// as HELD until mtime exceeds LEASE_TTL — closing the contention window.
function acquireLock(repoRoot) {
  const p = lockPath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const token = crypto.randomUUID();
  const lockBody = JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    host: os.hostname(),
    token: token,
  });
  try {
    const fd = fs.openSync(p, 'wx');
    fs.writeSync(fd, lockBody);
    fs.closeSync(fd);
    return { lockPath: p, token: token };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    if (tryReclaimStaleLock(p)) {
      try {
        const fd = fs.openSync(p, 'wx');
        fs.writeSync(fd, lockBody);
        fs.closeSync(fd);
        return { lockPath: p, token: token };
      } catch { return null; }
    }
    return null;
  }
}

// A1 / R6-F2 — lease-based, host-aware reclaim. Orphan criterion depends on
// whether the holder is same-host (PID introspection is authoritative) or
// cross-host (mtime is the only trustworthy signal — `process.kill(pid, 0)`
// on a foreign PID namespace is meaningless and may collide with an
// unrelated local PID).
//
//   same-host + PID alive      → NEVER reclaim (Codex R6 F2: a slow but
//                                 live holder must not be stolen from even
//                                 when its mtime exceeds LEASE_TTL).
//   same-host + PID dead       → reclaim (obvious orphan).
//   cross-host (or no host)    → mtime-only; reclaim iff mtime > LEASE_TTL.
//   zero-byte / unparsable     → mtime-only (no host to compare).
function tryReclaimStaleLock(lockFilePath) {
  let stat;
  try { stat = fs.statSync(lockFilePath); } catch { return false; }
  const mtimeMs = stat.mtimeMs || (stat.mtime && stat.mtime.getTime()) || 0;
  const ageMs = Date.now() - mtimeMs;
  const mtimeStale = Number.isFinite(ageMs) && ageMs > LEASE_TTL_MS;

  let body = null;
  try {
    const raw = fs.readFileSync(lockFilePath, 'utf8');
    if (raw.length > 0) body = JSON.parse(raw);
  } catch { body = null; }

  // Zero-byte or unparsable body: held until mtime lease expires. NEVER
  // reclaim purely on age of `started_at` parsing (it has no `started_at`).
  if (!body || typeof body !== 'object') {
    if (!mtimeStale) return false;
    try { fs.unlinkSync(lockFilePath); return true; } catch { return false; }
  }

  const sameHost = !!(body.host && body.host === os.hostname());
  if (sameHost) {
    // PID introspection is authoritative. Live PID + stale mtime means
    // the holder is busy in a sync section longer than LEASE_TTL — do not
    // steal. The in-loop heartbeat keeps mtime fresh in practice; if it
    // ever lapses, the holder gets to finish.
    if (isPidAlive(body.pid)) return false;
    try { fs.unlinkSync(lockFilePath); return true; } catch { return false; }
  }

  // Cross-host or no `host` recorded: rely on mtime alone.
  if (mtimeStale) {
    try { fs.unlinkSync(lockFilePath); return true; } catch { return false; }
  }
  return false;
}

// R6-F2 — verifyOwnership. Holder calls this at heartbeat checkpoints to
// detect a successful reclaim by another process (would only happen if the
// host-aware policy above misfired or a peer process forcibly unlinked).
// On mismatch the holder MUST abort to avoid concurrent mutation.
function verifyOwnership(repoRoot, token) {
  const p = lockPath(repoRoot);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const body = JSON.parse(raw);
    return !!(body && body.token === token);
  } catch { return false; }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) {
    // ESRCH = no such process; EPERM = process exists but signal denied.
    return e.code === 'EPERM';
  }
}

// A1 — releaseLock verifies the in-file token matches the holder's token
// before unlink. Mismatch (post-race reclaimed-then-stolen scenario):
// no-op + stderr warn. NEVER throw — releaseLock lives in `finally` and a
// throw here would mask the original migrate() failure.
function releaseLock(repoRoot, token) {
  const p = lockPath(repoRoot);
  let body;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    body = JSON.parse(raw);
  } catch {
    // Lock file gone or unparsable — nothing to unlink, nothing to warn about.
    try { fs.unlinkSync(p); } catch { /* already gone */ }
    return;
  }
  if (token === undefined || token === null) {
    // Legacy caller without token; preserve old behavior (unlink) but warn.
    process.stderr.write('[mccp] releaseLock called without token — legacy path; ' +
      'unlink without ownership verification\n');
    try { fs.unlinkSync(p); } catch { /* already gone */ }
    return;
  }
  if (body && body.token === token) {
    try { fs.unlinkSync(p); } catch { /* already gone */ }
    return;
  }
  // Ownership mismatch — lock was reclaimed by another holder. Do NOT unlink.
  process.stderr.write('[mccp] releaseLock ownership mismatch (lock reclaimed); ' +
    'leaving in place for current holder\n');
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

// A2 — path-containment guard. Asserts:
//   (1) the receipt path realpath's under the EXPECTED gate dir (which is
//       derived from repoRoot + .claude/receipts + receipt.gate_id), AND
//   (2) the expected gate dir realpath's under the repo's .claude/receipts.
// The `+ path.sep` suffix prevents the `<dir>` vs `<dir>-evil` false-positive
// prefix match. Throws a typed PATH_ESCAPES_GATE error on mismatch so the
// migration's per-receipt try/catch records it in `errors[]` rather than
// crashing the whole run.
function assertContained(receiptPath, expectedGateDir, repoRoot) {
  let resolvedReceipt, resolvedGate, resolvedReceiptsRoot;
  try { resolvedReceipt = fs.realpathSync(receiptPath); }
  catch (err) {
    const e = new Error('cannot realpath receipt: ' + err.message);
    e.code = 'PATH_ESCAPES_GATE';
    throw e;
  }
  try { resolvedGate = fs.realpathSync(expectedGateDir); }
  catch (err) {
    const e = new Error('cannot realpath expected gate dir: ' + err.message);
    e.code = 'PATH_ESCAPES_GATE';
    throw e;
  }
  const prefix = resolvedGate.endsWith(path.sep) ? resolvedGate : resolvedGate + path.sep;
  if (!resolvedReceipt.startsWith(prefix)) {
    const e = new Error('path escapes gate dir (receipt=' + resolvedReceipt +
      ', gate=' + resolvedGate + ')');
    e.code = 'PATH_ESCAPES_GATE';
    throw e;
  }
  if (repoRoot) {
    const expectedReceiptsRoot = path.join(repoRoot, '.claude', 'receipts');
    try { resolvedReceiptsRoot = fs.realpathSync(expectedReceiptsRoot); }
    catch (err) {
      const e = new Error('cannot realpath receipts root: ' + err.message);
      e.code = 'PATH_ESCAPES_GATE';
      throw e;
    }
    const rootPrefix = resolvedReceiptsRoot.endsWith(path.sep)
      ? resolvedReceiptsRoot : resolvedReceiptsRoot + path.sep;
    if (!resolvedGate.startsWith(rootPrefix)) {
      const e = new Error('gate dir escapes receipts root (gate=' + resolvedGate +
        ', root=' + resolvedReceiptsRoot + ')');
      e.code = 'PATH_ESCAPES_GATE';
      throw e;
    }
  }
}

// R2-F3 collision-safe rename. Target may exist if the user ran a prior
// manual quarantine, or if v0.2.8 was applied, reverted, and re-applied.
// We never preserve the active source — collision case moves it to a
// timestamped legacy name so two distinct receipts cannot share a path.
//
// A2 — assertContained guards the source path against out-of-tree receipts
// (symlinked / synthesized) and computes the target under the EXPECTED gate
// dir derived from repoRoot+gate_id rather than path.dirname(receipt.path).
// That way a synthetic `receipt.path = "/external/foo.json"` cannot bypass
// the check via its own dirname.
function renameWithCollisionSafety(receipt, repoRoot) {
  const expectedDir = repoRoot
    ? path.join(repoRoot, '.claude', 'receipts', receipt.gate_id)
    : path.dirname(receipt.path);
  assertContained(receipt.path, expectedDir, repoRoot);

  const dir = expectedDir;
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

// A1 — in-loop heartbeat. Refresh lock mtime every HEARTBEAT_BATCH_SIZE
// rename ops so the lease stays valid during long migrations. Deviation
// from plan's setInterval: Node timers do not fire during synchronous
// JS execution, so setInterval would never refresh mtime inside a sync
// migrate(). In-loop refresh is functionally equivalent — mtime is what
// tryReclaimStaleLock checks — without forcing migrate() to become async
// (which would cascade to 5 consumer paths).
function refreshLockHeartbeat(repoRoot) {
  const p = lockPath(repoRoot);
  try {
    const now = new Date();
    fs.utimesSync(p, now, now);
  } catch {
    // Lock vanished (likely reclaimed by another holder). releaseLock will
    // see the ownership mismatch and no-op. Migration continues.
  }
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

  const token = acquired.token;
  try {
    const renamed = [];
    const collidedMoved = [];
    const errors = [];
    const pending = [];

    // R6-F2 — heartbeat before the first long unit of work. scanActiveGeneric
    // can take seconds on a corrupted/large state, and the in-loop heartbeat
    // only fires after HEARTBEAT_BATCH_SIZE renames. Pre-scan refresh keeps
    // mtime well under LEASE_TTL during the initial scan window.
    refreshLockHeartbeat(repoRoot);
    let active = scanActiveGeneric(repoRoot);
    if (opts.beforeRenameHook) opts.beforeRenameHook(active);
    refreshLockHeartbeat(repoRoot);

    let heartbeatCounter = 0;
    let ownershipLost = false;
    for (const receipt of active) {
      try {
        const result = renameWithCollisionSafety(receipt, repoRoot);
        if (result.renamed) renamed.push(result.renamed);
        if (result.collided_moved) collidedMoved.push(result.collided_moved);
      } catch (err) {
        errors.push({ path: receipt.path, code: err.code || null, message: err.message });
        pending.push({ gate_id: receipt.gate_id, decision_id: receipt.decision_id });
      }
      heartbeatCounter++;
      if (heartbeatCounter >= HEARTBEAT_BATCH_SIZE) {
        // R6-F2 — verify our token is still in the lock body before
        // continuing. If another holder reclaimed (host-aware policy would
        // have refused, but defensive in case of force-unlink), abort
        // gracefully with tempfail instead of mutating concurrently.
        if (!verifyOwnership(repoRoot, token)) {
          ownershipLost = true;
          break;
        }
        refreshLockHeartbeat(repoRoot);
        heartbeatCounter = 0;
      }
    }

    if (ownershipLost) {
      if (opts.systemMessage) opts.systemMessage(
        'v0.2.8 generic-receipt quarantine aborted mid-run — lock ownership ' +
        'lost to another holder; retry shortly');
      return { status: 'in-progress-aborted', exitCode: EX_TEMPFAIL, reason: 'ownership-lost' };
    }

    // R6-F1 — refuse to mark `complete` while any gate dir is symlinked /
    // non-directory. listGenericReceipts already skips those (good), but
    // without this guard the migration would mark complete with the
    // external receipts silently stranded behind the link. Recording them
    // as errors forces `failed` state and a visible last_error.
    const unsafeDirs = listUnsafeGateDirs(repoRoot);
    for (const u of unsafeDirs) {
      errors.push({
        path: u.path,
        code: 'UNSAFE_GATE_DIR',
        message: 'gate dir is ' + u.kind + ' — resolve manually before re-running',
      });
      pending.push({ gate_id: u.gate_id, decision_id: 'UNSAFE_GATE_DIR' });
    }

    const remaining = scanActiveGeneric(repoRoot);
    for (const r of remaining) {
      if (!pending.some(p => p.gate_id === r.gate_id && p.decision_id === r.decision_id)) {
        pending.push({ gate_id: r.gate_id, decision_id: r.decision_id });
      }
    }

    const state = (remaining.length === 0 && unsafeDirs.length === 0)
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
    releaseLock(repoRoot, token);
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
  refreshLockHeartbeat: refreshLockHeartbeat,
  verifyOwnership: verifyOwnership,
  waitForMarkerComplete: waitForMarkerComplete,
  readMarker: readMarker,
  writeMarkerAtomic: writeMarkerAtomic,
  scanActiveGeneric: scanActiveGeneric,
  renameWithCollisionSafety: renameWithCollisionSafety,
  assertContained: assertContained,
  markerPath: markerPath,
  lockPath: lockPath,
  EX_TEMPFAIL: EX_TEMPFAIL,
  POLL_INTERVAL_MS: POLL_INTERVAL_MS,
  POLL_MAX_MS: POLL_MAX_MS,
  STALE_LOCK_MS: STALE_LOCK_MS,
  LEASE_TTL_MS: LEASE_TTL_MS,
  HEARTBEAT_BATCH_SIZE: HEARTBEAT_BATCH_SIZE,
};
