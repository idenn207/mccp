'use strict';

// v1.3.0-m4 — debounced + locked + fail-open render trigger facade.
//
// Public surface:
//   triggerRender(reason, opts = {}) → boolean
//
// Caller-visible loud fail-open contract per [[feedback-loud-fail-open]]:
//   - NEVER throws. Outer try/catch catches everything.
//   - On any failure, writes a loud stderr line tagged "[mccp:renderer-trigger]
//     reason=<r> FAILED <msg> (allow)" and returns false.
//   - The caller (receipt-write, envelope-write, SessionStart hook) does its
//     own belt-and-suspenders try/catch but trigger.js MUST NOT throw.
//
// Codex Plan-Codex R1 F1 absorption — lock-first / debounce-after-render flow.
// The naive "debounce-then-lock" pattern consumes a debounce slot before the
// render is guaranteed; if the lock holder dies the next caller sees a fresh
// `.trigger-pending` and skips legitimately required work. Sequence:
//
//   1. Resolve repo root + .claude/cache/.
//   2. Lock attempt (`.render.lock` atomic fs.openSync wx).
//      - EEXIST + lock valid (same-host live PID, or mtime < lease) → append
//        a line to `.trigger-dirty` for audit + return false.
//      - EEXIST + lock orphan → host-aware tri-state reclaim → retry once.
//   3. After holding the lock, check content debounce: if `.trigger-pending`
//      mtime is within debounce window → release lock + return false.
//   4. If `.trigger-dirty` has entries, drain them (truncate) — purely
//        audit, the actual render proceeds the same way regardless.
//   5. Compute was_stale = (now - prevStatusMtime) > 60s (M4 stale-amber).
//   6. derive() + renderStatus().
//   7. Atomic write STATUS.md + status.html using unique tmp names
//      (`STATUS.md.<pid>-<random>.tmp` then renameSync). F4 absorption:
//      mirror M3's fixed-name tmp would clobber in a split-brain reclaim.
//   8. Write `.last-render.json` so the next derive surfaces last_render_meta.
//   9. Write `.trigger-pending` with current reason + ISO timestamp.
//  10. Release lock in finally{}.
//  11. Return true.
//
// Codex F4 absorption — host-aware tri-state lock reclaim mirrors
// pr-phase-lock.js / CLAUDE.md §3.6. same-host live PID is NEVER reclaimed;
// cross-host falls back to mtime-only. No ownership-token IPC needed because
// the trigger is in-process — the lock body only needs pid+host+started_at.
//
// Env toggles (debug only):
//   MCCP_RENDER_TRIGGER_DEBOUNCE_MS — default 5000
//   MCCP_RENDER_LOCK_LEASE_MS       — default 90000

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join('.claude', 'cache');
const LOCK_FILENAME = '.render.lock';
const DEBOUNCE_MARKER = '.trigger-pending';
const DIRTY_MARKER = '.trigger-dirty';
const LAST_RENDER_FILENAME = '.last-render.json';
const STATUS_MD = 'STATUS.md';
const STATUS_HTML = 'status.html';

const DEFAULT_DEBOUNCE_MS = 5000;
const DEFAULT_LOCK_LEASE_MS = 90000;
const STALE_THRESHOLD_MS = 60 * 1000;

function envInt(name, defaultMs) {
  const raw = process.env[name];
  if (!raw) return defaultMs;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultMs;
}

function findRepoRoot(cwd) {
  let cur = path.resolve(cwd);
  for (let i = 0; i < 16; i++) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function stderr(line) {
  process.stderr.write(line + '\n');
}

function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') return true;
    return false;
  }
}

function readLockBody(lockPath) {
  let raw;
  try { raw = fs.readFileSync(lockPath, 'utf8'); }
  catch (_) { return null; }
  if (!raw || raw.length === 0) return { _zero_byte: true };
  try { return JSON.parse(raw); }
  catch (err) { return { _parse_error: err.message }; }
}

// Codex F4 absorption — host-aware tri-state reclaim. Returns true iff the
// lock was unlinked.
function reclaimLock(lockPath, leaseMs) {
  let stat;
  try { stat = fs.statSync(lockPath); } catch (_) { return false; }
  const ageMs = Date.now() - (stat.mtimeMs || 0);
  const mtimeStale = ageMs > leaseMs;
  const body = readLockBody(lockPath);

  if (!body || body._parse_error || body._zero_byte) {
    if (!mtimeStale) return false;
    try { fs.unlinkSync(lockPath); return true; } catch (_) { return false; }
  }

  const sameHost = !!(body.host && body.host === os.hostname());
  if (sameHost) {
    if (isPidAlive(body.pid)) return false;
    try { fs.unlinkSync(lockPath); return true; } catch (_) { return false; }
  }
  if (mtimeStale) {
    try { fs.unlinkSync(lockPath); return true; } catch (_) { return false; }
  }
  return false;
}

function acquireLock(lockPath, leaseMs) {
  const body = JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    started_at: new Date().toISOString(),
  }) + '\n';
  function tryOpen() {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    try { fs.writeSync(fd, body); } finally { fs.closeSync(fd); }
  }
  try { tryOpen(); return { ok: true }; }
  catch (err) {
    if (!err || err.code !== 'EEXIST') return { ok: false, error: err && err.message };
    if (!reclaimLock(lockPath, leaseMs)) return { ok: false, error: 'EEXIST' };
    try { tryOpen(); return { ok: true, reclaimed: true }; }
    catch (err2) { return { ok: false, error: 'EEXIST-after-reclaim: ' + (err2 && err2.message) }; }
  }
}

function appendDirty(dirtyPath, reason) {
  try {
    fs.appendFileSync(dirtyPath, reason + '\t' + new Date().toISOString() + '\n', 'utf8');
  } catch (_) { /* dirty marker failure is non-fatal */ }
}

function drainDirty(dirtyPath) {
  let lines = [];
  try {
    const raw = fs.readFileSync(dirtyPath, 'utf8');
    lines = raw.split('\n').filter(Boolean);
  } catch (_) { /* missing dirty file is normal */ }
  try { fs.unlinkSync(dirtyPath); } catch (_) { /* idempotent */ }
  return lines;
}

function debounceFresh(pendingPath, debounceMs) {
  let stat;
  try { stat = fs.statSync(pendingPath); }
  catch (_) { return false; }
  const ageMs = Date.now() - (stat.mtimeMs || 0);
  return ageMs < debounceMs;
}

function statusPrevAge(statusPath) {
  let stat;
  try { stat = fs.statSync(statusPath); }
  catch (_) { return null; }
  return Date.now() - (stat.mtimeMs || 0);
}

function uniqueTmp(target) {
  const suffix = '.' + process.pid + '-' + crypto.randomBytes(4).toString('hex') + '.tmp';
  return target + suffix;
}

function atomicWriteUnique(target, content) {
  const tmp = uniqueTmp(target);
  fs.writeFileSync(tmp, content, 'utf8');
  try { fs.renameSync(tmp, target); }
  catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
}

function writeLastRender(cacheDir, payload) {
  const target = path.join(cacheDir, LAST_RENDER_FILENAME);
  try {
    atomicWriteUnique(target, JSON.stringify(payload, null, 2) + '\n');
  } catch (err) {
    stderr('[mccp:renderer-trigger] last-render write failed: '
      + (err && err.message) + ' (allow)');
  }
}

function writeDebounceMarker(cacheDir, reason) {
  const target = path.join(cacheDir, DEBOUNCE_MARKER);
  try {
    atomicWriteUnique(target, reason + '\t' + new Date().toISOString() + '\n');
  } catch (err) {
    stderr('[mccp:renderer-trigger] debounce-marker write failed: '
      + (err && err.message) + ' (allow)');
  }
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch (_) { /* best-effort */ }
}

function triggerRender(reason, opts) {
  opts = opts || {};
  reason = typeof reason === 'string' && reason.length > 0 ? reason : 'unknown';
  const debounceMs = typeof opts.debounceMs === 'number'
    ? opts.debounceMs : envInt('MCCP_RENDER_TRIGGER_DEBOUNCE_MS', DEFAULT_DEBOUNCE_MS);
  const lockLeaseMs = typeof opts.lockLeaseMs === 'number'
    ? opts.lockLeaseMs : envInt('MCCP_RENDER_LOCK_LEASE_MS', DEFAULT_LOCK_LEASE_MS);

  try {
    const cwd = opts.cwd || process.cwd();
    const repoRoot = opts.repoRoot || findRepoRoot(cwd) || cwd;
    const cacheDir = path.join(repoRoot, CACHE_DIR);
    try { fs.mkdirSync(cacheDir, { recursive: true }); }
    catch (err) {
      stderr('[mccp:renderer-trigger] reason=' + reason + ' FAILED mkdir cache: '
        + (err && err.message) + ' (allow)');
      return false;
    }

    const lockPath = path.join(cacheDir, LOCK_FILENAME);
    const pendingPath = path.join(cacheDir, DEBOUNCE_MARKER);
    const dirtyPath = path.join(cacheDir, DIRTY_MARKER);
    const statusPath = path.join(cacheDir, STATUS_MD);
    const htmlPath = path.join(cacheDir, STATUS_HTML);

    const lock = acquireLock(lockPath, lockLeaseMs);
    if (!lock.ok) {
      appendDirty(dirtyPath, reason);
      stderr('[mccp:renderer-trigger] reason=' + reason + ' SKIP render in-flight ('
        + (lock.error || 'unknown') + ')');
      return false;
    }

    let result = false;
    // v1.3.0-m5 Codex F2 absorption — hoist `model` outside the render try
    // block so the snapshot writer below can see it after render+writes succeed.
    // The naive inner-scoped `const model` collapses to ReferenceError in the
    // lazy-require try/catch and silently skips daily snapshots.
    let model = null;
    try {
      if (debounceFresh(pendingPath, debounceMs)) {
        // Debounce — release lock + return false. Dirty marker stays for
        // audit (the next caller after the debounce window will pick it up).
        return false;
      }

      // Audit-drain dirty marker. The actual render proceeds identically
      // regardless of dirty contents; this is the "concurrent reasons
      // collapsed into this render" record.
      const dirtyLines = drainDirty(dirtyPath);

      const prevAgeMs = statusPrevAge(statusPath);
      const wasStale = prevAgeMs !== null && prevAgeMs > STALE_THRESHOLD_MS;
      if (wasStale) {
        stderr('[mccp:renderer] cache_stale: previous render was '
          + Math.round(prevAgeMs / 1000) + ' seconds old');
      }

      let rendered;
      try {
        if (opts._injectRenderThrow === true) {
          throw new Error('injected render throw');
        }
        const deriveImpl = opts.deriveImpl || require('../../derive').derive;
        const renderImpl = opts.renderImpl || require('./index').renderStatus;
        // dashboard-multi-session M1 (Codex F1) — auto-refresh is a render
        // entry, so opt the worktree scanner IN (mirrors cli.js render). bare
        // derive() stays default-off for the spawn-free perf-budget path.
        model = deriveImpl(repoRoot, { worktreeScan: true });
        rendered = renderImpl(model, { snapshotsDir: path.join(cacheDir, 'snapshots') });
      } catch (err) {
        stderr('[mccp:renderer-trigger] reason=' + reason
          + ' FAILED render: ' + (err && err.message) + ' (allow)');
        return false;
      }

      try {
        atomicWriteUnique(statusPath, rendered.md);
        atomicWriteUnique(htmlPath, rendered.html);
      } catch (err) {
        stderr('[mccp:renderer-trigger] reason=' + reason
          + ' FAILED write cache: ' + (err && err.message) + ' (allow)');
        return false;
      }

      writeLastRender(cacheDir, {
        reason: reason,
        was_stale: wasStale,
        prev_age_seconds: prevAgeMs === null ? null : Math.round(prevAgeMs / 1000),
        render_at: new Date().toISOString(),
        dirty_drain_count: dirtyLines.length,
      });

      // v1.3.0-m5 — daily snapshot writer piggybacks on the trigger.
      // - Lazy require so test contexts without lib/snapshot/ still load.
      // - try/catch is belt-and-suspenders; writeSnapshotIfNeeded itself
      //   honors the loud fail-open contract and never throws.
      // - `model` truthy guard: if the render try block failed before
      //   assigning `model`, the snapshot also skips (no archive without
      //   a successful render).
      if (model) {
        try {
          require('../snapshot').writeSnapshotIfNeeded(model, {
            trigger: reason,
            repoRoot: repoRoot,
          });
        } catch (err) {
          stderr('[mccp:renderer-trigger] snapshot failed (allow): '
            + (err && err.message));
        }
      }

      // Debounce marker must be written AFTER a successful render so the next
      // legitimate trigger isn't skipped before any cache file exists.
      writeDebounceMarker(cacheDir, reason);
      result = true;
    } finally {
      releaseLock(lockPath);
    }
    return result;
  } catch (err) {
    stderr('[mccp:renderer-trigger] reason=' + reason
      + ' FAILED ' + (err && err.message) + ' (allow)');
    return false;
  }
}

module.exports = {
  triggerRender: triggerRender,
  // Exported for tests + audit consumers.
  DEFAULT_DEBOUNCE_MS: DEFAULT_DEBOUNCE_MS,
  DEFAULT_LOCK_LEASE_MS: DEFAULT_LOCK_LEASE_MS,
  STALE_THRESHOLD_MS: STALE_THRESHOLD_MS,
  CACHE_DIR: CACHE_DIR,
  LOCK_FILENAME: LOCK_FILENAME,
  DEBOUNCE_MARKER: DEBOUNCE_MARKER,
  DIRTY_MARKER: DIRTY_MARKER,
  LAST_RENDER_FILENAME: LAST_RENDER_FILENAME,
  findRepoRoot: findRepoRoot,
  reclaimLock: reclaimLock,
  isPidAlive: isPidAlive,
};
