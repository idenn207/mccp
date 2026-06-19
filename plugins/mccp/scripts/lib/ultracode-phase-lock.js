'use strict';

// ultracode-phase-lock — isolation lock lifecycle CLI for /effort ultracode
// delegation (mccp v1.4.0 axis B / M2).
//
// Mirrors plugins/mccp/scripts/lib/pr-phase-lock.js (v0.2.8 hardened):
//   - F11 token authority split (sha256 hash in lock body, raw token via
//     out-of-band channel)
//   - F3 host-aware tri-state reclaim policy (same-host+pid-alive=NEVER,
//     same-host+pid-dead=reclaim, cross-host=mtime-only, zero-byte=mtime-only)
//   - F8 symlink containment (lock parent dir realpath ⊆ <root>/.claude)
//   - F5 lock file mode 0o600
//
// M2-specific differences from pr-phase-lock:
//   1. Lock file: <root>/.claude/state/ultracode-phase.lock
//   2. F3 sidecar token file (NOT stdin-pipe IPC) — turn boundary durability:
//      <root>/.git/mccp/tmp/ultracode-token-<run-id>.dat (mode 0o600).
//      exit/heartbeat read raw token from sidecar based on --run-id;
//      caller passes only --run-id, no token in argv/stdin/env.
//      Rationale: prp-implement Phase 3.5 spans user turn boundaries
//      (mccp emits guide → user switches to /effort ultracode → returns to
//      mccp) — shell variable stash dies across the boundary. Sidecar file
//      on disk survives.
//   3. F1 Scenario A: owner_session_id field captured in lock body so
//      PreToolUse guard hook (ultracode-phase-guard.js) can distinguish
//      workflow-agent caller from mccp-caller. Field is best-effort —
//      absence triggers Scenario B fallback (advisory-only, stderr warn).
//   4. --task-index <N> captured for trace/debug (reclaim policy ignores it).
//   5. No mutation finalizer (M2 doesn't gate on git head_sha/index_tree drift).
//   6. No helper_manifest (M2 has no separate helpers dir).
//
// Subcommands:
//   enter --run-id <uuid> [--pid <int>] [--task-index <N>]
//         [--owner-session-id <id>] [--cwd <path>]
//   exit  --run-id <uuid> [--cwd <path>]      — token via sidecar
//   heartbeat --run-id <uuid> [--cwd <path>]  — token via sidecar
//   detect-stale [--max-age-ms <ms>] [--cwd <path>]
//   read [--cwd <path>]

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const LOCK_DIRNAME = path.join('.claude', 'state');
const LOCK_FILENAME = 'ultracode-phase.lock';
// Sidecar lives under the worktree's actual git directory (worktree-safe;
// .git inside a worktree is a file pointing to <main>/.git/worktrees/<name>).
const SIDECAR_RELATIVE_TO_GITDIR = path.join('mccp', 'tmp');
const SIDECAR_PREFIX = 'ultracode-token-';
const SIDECAR_SUFFIX = '.dat';
const STALE_MS_DEFAULT = 60 * 1000;

function repoRoot(cwd) {
  cwd = cwd || process.cwd();
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd, encoding: 'utf8',
    }).trim();
  } catch (err) {
    throw new Error('not a git repo (or git not in PATH): ' + err.message);
  }
}

function gitDir(cwd) {
  cwd = cwd || process.cwd();
  try {
    return execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: cwd, encoding: 'utf8',
    }).trim();
  } catch (err) {
    throw new Error('not a git repo (or git not in PATH): ' + err.message);
  }
}

function lockPath(root) {
  return path.join(root, LOCK_DIRNAME, LOCK_FILENAME);
}

function sidecarDir(rootOrCwd) {
  return path.join(gitDir(rootOrCwd), SIDECAR_RELATIVE_TO_GITDIR);
}

function sidecarPath(rootOrCwd, runId) {
  if (!runId || typeof runId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new Error('invalid run-id (must match [A-Za-z0-9_-]+)');
  }
  return path.join(sidecarDir(rootOrCwd), SIDECAR_PREFIX + runId + SIDECAR_SUFFIX);
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

function readLock(root) {
  const p = lockPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (raw.length === 0) return { _zero_byte: true };
    return JSON.parse(raw);
  } catch (err) {
    return { _parse_error: err.message };
  }
}

function readSidecarToken(rootOrCwd, runId) {
  try {
    const p = sidecarPath(rootOrCwd, runId);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return raw.trim() || null;
  } catch (_) {
    return null;
  }
}

function verifyTokenAgainstLock(presentedToken, lockBody) {
  if (typeof presentedToken !== 'string' || presentedToken.length === 0) return false;
  if (!lockBody || typeof lockBody !== 'object') return false;
  const presentedHash = hashToken(presentedToken);
  if (typeof lockBody.ownership_token_hash === 'string'
      && lockBody.ownership_token_hash.length > 0) {
    return lockBody.ownership_token_hash === presentedHash;
  }
  return false;
}

function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'EPERM') return true;
    return false;
  }
}

function tryReclaimStaleLock(lockFilePath, maxAgeMs) {
  const leaseTtl = (typeof maxAgeMs === 'number' && maxAgeMs > 0)
    ? maxAgeMs : STALE_MS_DEFAULT;
  let stat;
  try { stat = fs.statSync(lockFilePath); } catch (_) { return false; }
  const mtimeMs = stat.mtimeMs || (stat.mtime && stat.mtime.getTime()) || 0;
  const ageMs = Date.now() - mtimeMs;
  const mtimeStale = Number.isFinite(ageMs) && ageMs > leaseTtl;

  let body = null;
  let raw = '';
  try { raw = fs.readFileSync(lockFilePath, 'utf8'); } catch (_) { return false; }
  if (raw.length > 0) {
    try { body = JSON.parse(raw); } catch (_) { body = null; }
  }

  if (!body || typeof body !== 'object') {
    if (!mtimeStale) return false;
    try { fs.unlinkSync(lockFilePath); return true; } catch (_) { return false; }
  }

  const sameHost = !!(body.host && body.host === os.hostname());
  if (sameHost) {
    if (isPidAlive(body.pid)) return false;
    try { fs.unlinkSync(lockFilePath); return true; } catch (_) { return false; }
  }

  if (mtimeStale) {
    try { fs.unlinkSync(lockFilePath); return true; } catch (_) { return false; }
  }
  return false;
}

function sweepOrphanSidecars(rootOrCwd) {
  // Best-effort: when detect-stale reclaims a lock, the sidecar token file
  // for that run_id also becomes orphan. Sweep all sidecar files older than
  // STALE_MS_DEFAULT × 2 (conservative — sidecars older than 2 lease windows
  // are almost certainly orphan).
  let dir;
  try { dir = sidecarDir(rootOrCwd); } catch (_) { return []; }
  if (!fs.existsSync(dir)) return [];
  const removed = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return removed; }
  const threshold = Date.now() - (STALE_MS_DEFAULT * 2);
  for (const name of entries) {
    if (!name.startsWith(SIDECAR_PREFIX) || !name.endsWith(SIDECAR_SUFFIX)) continue;
    const abs = path.join(dir, name);
    try {
      const stat = fs.statSync(abs);
      if (stat.mtimeMs < threshold) {
        fs.unlinkSync(abs);
        removed.push(name);
      }
    } catch (_) { /* skip unreadable */ }
  }
  return removed;
}

function cmdEnter(args) {
  const root = repoRoot(args.cwd);
  const runId = args['run-id'];
  if (!runId) {
    process.stderr.write('[ultracode-phase-lock] enter requires --run-id\n');
    return 2;
  }

  const p = lockPath(root);
  const ownershipToken = crypto.randomUUID();
  const ownershipTokenHash = hashToken(ownershipToken);
  const lockBody = {
    run_id: runId,
    started_at: new Date().toISOString(),
    pid: parseInt(args.pid, 10) || process.pid,
    host: os.hostname(),
    ownership_token_hash: ownershipTokenHash,
    owner_session_id: args['owner-session-id'] || null,
    task_index: args['task-index'] != null
      ? parseInt(args['task-index'], 10) || null
      : null,
  };
  const body = JSON.stringify(lockBody, null, 2);
  fs.mkdirSync(path.dirname(p), { recursive: true });

  // F8 symlink containment: lock parent dir realpath must be inside <root>/.claude.
  const lockParent = path.dirname(p);
  const claudeRoot = path.join(root, '.claude');
  let lockParentReal;
  let claudeRootReal;
  try {
    lockParentReal = fs.realpathSync(lockParent);
    claudeRootReal = fs.realpathSync(claudeRoot);
  } catch (err) {
    process.stderr.write(
      '[ultracode-phase-lock] symlink-containment: realpathSync failed: ' + err.message + '\n');
    return 18;
  }
  if (!lockParentReal.startsWith(claudeRootReal + path.sep)
      && lockParentReal !== claudeRootReal) {
    process.stderr.write(
      '[ultracode-phase-lock] symlink-containment: lock parent ' +
      lockParentReal + ' escapes .claude root ' + claudeRootReal + '\n');
    return 18;
  }

  // F3 sidecar token file — turn-boundary-durable channel
  // Lives under <gitdir>/mccp/tmp/ (worktree-safe: gitdir is a real directory
  // in both regular repos and worktrees, while .git is a file in worktrees).
  // H2 absorption: mkdir BEFORE lock open so that a sidecar-dir mkdir failure
  // (permission, ENOSPC, race) does not orphan a lock file with no provable
  // ownership channel.
  const sp = sidecarPath(args.cwd, runId);
  try {
    fs.mkdirSync(path.dirname(sp), { recursive: true });
  } catch (err) {
    process.stderr.write(
      '[ultracode-phase-lock] sidecar dir mkdir failed: ' + err.message + '\n');
    return 19;
  }

  function tryOpen() {
    const fd = fs.openSync(p, 'wx', 0o600);
    try { fs.writeSync(fd, body); } finally { fs.closeSync(fd); }
  }

  try {
    tryOpen();
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const existing = readLock(root);
    if (existing && !existing._parse_error && !existing._zero_byte
        && existing.run_id === runId) {
      process.stderr.write(
        '[ultracode-phase-lock] lock already held by SAME run_id=' + runId +
        ' (pid=' + existing.pid + '); refuse fresh enter\n');
      return 11;
    }
    if (!tryReclaimStaleLock(p)) {
      process.stderr.write(
        '[ultracode-phase-lock] lock held by another run' +
        (existing && existing.run_id ? ' (run_id=' + existing.run_id + ')' : '') +
        ' and is not stale; refuse fresh enter.\n');
      process.stderr.write('Hint: node ultracode-phase-lock.js detect-stale\n');
      return 11;
    }
    // L1 absorption: reclaim succeeded → previous run_id's sidecar is orphan.
    // Sweep before tryOpen so the new lock's sidecar slot is clean.
    if (existing && existing.run_id && existing.run_id !== runId) {
      try { fs.unlinkSync(sidecarPath(args.cwd, existing.run_id)); } catch (_) { /* best-effort */ }
    }
    try { tryOpen(); }
    catch (err2) {
      process.stderr.write(
        '[ultracode-phase-lock] EEXIST after reclaim race: ' + (err2 && err2.message) + '\n');
      return 11;
    }
  }

  const sfd = fs.openSync(sp, 'w', 0o600);
  try { fs.writeSync(sfd, ownershipToken); } finally { fs.closeSync(sfd); }

  process.stdout.write(JSON.stringify({
    ok: true,
    lock_path: p,
    sidecar_path: sp,
    run_id: runId,
    ownership_token: ownershipToken,
    ownership_token_hash: ownershipTokenHash,
    owner_session_id: lockBody.owner_session_id,
    task_index: lockBody.task_index,
    host: lockBody.host,
  }, null, 2) + '\n');
  return 0;
}

function cmdExit(args) {
  const root = repoRoot(args.cwd);
  const runId = args['run-id'];
  if (!runId) {
    process.stderr.write('[ultracode-phase-lock] exit requires --run-id\n');
    return 2;
  }
  const lock = readLock(root);
  if (!lock) {
    process.stderr.write('[ultracode-phase-lock] no active lock to exit\n');
    return 12;
  }
  if (lock._zero_byte) {
    process.stderr.write(
      '[ultracode-phase-lock] lock is zero-byte; cannot prove ownership — leave for detect-stale\n');
    return 16;
  }
  if (lock._parse_error) {
    process.stderr.write(
      '[ultracode-phase-lock] lock corrupted (' + lock._parse_error + '); leave for detect-stale\n');
    return 16;
  }
  if (lock.run_id !== runId) {
    process.stderr.write(
      '[ultracode-phase-lock] run_id mismatch (lock=' + lock.run_id +
      ' arg=' + runId + '); refuse exit\n');
    return 14;
  }
  const token = readSidecarToken(args.cwd, runId);
  if (!token) {
    process.stderr.write(
      '[ultracode-phase-lock] sidecar token missing for run_id=' + runId +
      '; cannot prove ownership — leave for detect-stale\n');
    return 16;
  }
  if (!verifyTokenAgainstLock(token, lock)) {
    process.stderr.write(
      '[ultracode-phase-lock] ownership-token mismatch (sidecar vs lock); refuse exit\n');
    return 16;
  }
  try { fs.unlinkSync(lockPath(root)); } catch (_) { /* best-effort */ }
  try { fs.unlinkSync(sidecarPath(args.cwd, runId)); } catch (_) { /* best-effort */ }
  process.stdout.write(JSON.stringify({
    ok: true,
    run_id: lock.run_id,
    cleared: true,
  }, null, 2) + '\n');
  return 0;
}

function cmdHeartbeat(args) {
  const root = repoRoot(args.cwd);
  const runId = args['run-id'];
  if (!runId) {
    process.stderr.write('[ultracode-phase-lock] heartbeat requires --run-id\n');
    return 2;
  }
  const lock = readLock(root);
  if (!lock) {
    process.stderr.write('[ultracode-phase-lock] no active lock to heartbeat\n');
    return 12;
  }
  if (lock._zero_byte || lock._parse_error) {
    process.stderr.write('[ultracode-phase-lock] heartbeat cannot read lock body; skip\n');
    return 15;
  }
  if (lock.run_id !== runId) {
    process.stderr.write(
      '[ultracode-phase-lock] heartbeat run_id mismatch (lock=' + lock.run_id +
      ' arg=' + runId + '); refuse heartbeat\n');
    return 15;
  }
  const token = readSidecarToken(args.cwd, runId);
  if (!token || !verifyTokenAgainstLock(token, lock)) {
    process.stderr.write(
      '[ultracode-phase-lock] heartbeat token verification failed; no utimes\n');
    return 15;
  }
  const now = new Date();
  try { fs.utimesSync(lockPath(root), now, now); }
  catch (err) {
    process.stderr.write('[ultracode-phase-lock] heartbeat utimesSync failed: ' + err.message + '\n');
    return 15;
  }
  process.stdout.write(JSON.stringify({
    ok: true, run_id: lock.run_id, mtime: now.toISOString(),
  }) + '\n');
  return 0;
}

function cmdDetectStale(args) {
  const root = repoRoot(args.cwd);
  const p = lockPath(root);
  const maxAge = parseInt(args['max-age-ms'], 10) || STALE_MS_DEFAULT;

  let stat;
  try { stat = fs.statSync(p); }
  catch (_) {
    const sidecarsSwept = sweepOrphanSidecars(args.cwd);
    process.stdout.write(JSON.stringify({
      ok: true, stale: false, sidecars_swept: sidecarsSwept,
    }, null, 2) + '\n');
    return 0;
  }

  const lock = readLock(root);

  if (lock && !lock._parse_error && !lock._zero_byte) {
    const sameHost = !!(lock.host && lock.host === os.hostname());
    const pidAlive = isPidAlive(lock.pid);
    const ageMs = Date.now() - stat.mtimeMs;

    if (sameHost) {
      if (pidAlive) {
        process.stdout.write(JSON.stringify({
          ok: true, stale: false,
          reason: 'same-host-live-pid',
          host: lock.host, run_id: lock.run_id, pid_alive: true, age_ms: ageMs,
        }, null, 2) + '\n');
        return 0;
      }
      const reclaimed = tryReclaimStaleLock(p, maxAge);
      // Sidecar cleanup on successful reclaim
      let sidecarsSwept = [];
      if (reclaimed) {
        try { fs.unlinkSync(sidecarPath(args.cwd, lock.run_id)); sidecarsSwept.push(SIDECAR_PREFIX + lock.run_id + SIDECAR_SUFFIX); } catch (_) {}
        sidecarsSwept = sidecarsSwept.concat(sweepOrphanSidecars(args.cwd));
      }
      process.stdout.write(JSON.stringify({
        ok: true,
        stale: reclaimed,
        cleared: reclaimed,
        reason: reclaimed ? 'same-host-dead-pid' : 'same-host-dead-pid-but-reclaim-failed',
        host: lock.host, run_id: lock.run_id, pid_alive: false, age_ms: ageMs,
        sidecars_swept: sidecarsSwept,
      }, null, 2) + '\n');
      return 0;
    }

    const reclaimed = tryReclaimStaleLock(p, maxAge);
    let sidecarsSwept = [];
    if (reclaimed) {
      try { fs.unlinkSync(sidecarPath(args.cwd, lock.run_id)); sidecarsSwept.push(SIDECAR_PREFIX + lock.run_id + SIDECAR_SUFFIX); } catch (_) {}
      sidecarsSwept = sidecarsSwept.concat(sweepOrphanSidecars(args.cwd));
    }
    process.stdout.write(JSON.stringify({
      ok: true,
      stale: reclaimed,
      cleared: reclaimed,
      reason: reclaimed ? 'cross-host-mtime-exceeded' : 'cross-host-mtime-within-lease',
      host: lock.host || null, run_id: lock.run_id, pid_alive: pidAlive, age_ms: ageMs,
      sidecars_swept: sidecarsSwept,
    }, null, 2) + '\n');
    return 0;
  }

  const reclaimed = tryReclaimStaleLock(p, maxAge);
  let sidecarsSwept = [];
  if (reclaimed) {
    sidecarsSwept = sweepOrphanSidecars(args.cwd);
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    stale: reclaimed,
    cleared: reclaimed,
    reason: lock && lock._zero_byte
      ? (reclaimed ? 'zero-byte-mtime-exceeded' : 'zero-byte-mtime-within-lease')
      : (reclaimed ? 'parse-error-mtime-exceeded' : 'parse-error-mtime-within-lease'),
    age_ms: Date.now() - stat.mtimeMs,
    sidecars_swept: sidecarsSwept,
  }, null, 2) + '\n');
  return 0;
}

function cmdRead(args) {
  const root = repoRoot(args.cwd);
  const lock = readLock(root);
  if (!lock) {
    process.stdout.write(JSON.stringify({ active: false }) + '\n');
    return 0;
  }
  if (lock._zero_byte) {
    process.stdout.write(JSON.stringify({ active: false, zero_byte: true }) + '\n');
    return 0;
  }
  if (lock._parse_error) {
    process.stdout.write(JSON.stringify({ active: false, parse_error: lock._parse_error }) + '\n');
    return 0;
  }
  process.stdout.write(JSON.stringify({
    active: true,
    run_id: lock.run_id,
    pid: lock.pid,
    host: lock.host || null,
    owner_session_id: lock.owner_session_id || null,
    task_index: lock.task_index != null ? lock.task_index : null,
    started_at: lock.started_at,
  }) + '\n');
  return 0;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function showHelp() {
  process.stdout.write(
    'ultracode-phase-lock subcommands:\n' +
    '  enter --run-id <uuid> [--pid <int>] [--task-index <N>]\n' +
    '        [--owner-session-id <id>] [--cwd <path>]\n' +
    '  exit  --run-id <uuid> [--cwd <path>]      (token via sidecar)\n' +
    '  heartbeat --run-id <uuid> [--cwd <path>]  (token via sidecar)\n' +
    '  detect-stale [--max-age-ms <ms>] [--cwd <path>]\n' +
    '  read [--cwd <path>]\n');
}

function main(argv) {
  const sub = argv[2];
  const rest = parseArgs(argv.slice(3));
  switch (sub) {
    case 'enter': return cmdEnter(rest);
    case 'exit': return cmdExit(rest);
    case 'heartbeat': return cmdHeartbeat(rest);
    case 'detect-stale': return cmdDetectStale(rest);
    case 'read': return cmdRead(rest);
    case '--help': case 'help': case undefined: showHelp(); return 0;
    default:
      process.stderr.write('ultracode-phase-lock: unknown subcommand "' + sub + '"\n');
      return 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  LOCK_DIRNAME,
  LOCK_FILENAME,
  SIDECAR_RELATIVE_TO_GITDIR,
  SIDECAR_PREFIX,
  SIDECAR_SUFFIX,
  STALE_MS_DEFAULT,
  cmdEnter,
  cmdExit,
  cmdHeartbeat,
  cmdDetectStale,
  cmdRead,
  tryReclaimStaleLock,
  sweepOrphanSidecars,
  readLock,
  readSidecarToken,
  lockPath,
  sidecarDir,
  sidecarPath,
  repoRoot,
  gitDir,
  isPidAlive,
  hashToken,
  verifyTokenAgainstLock,
};
