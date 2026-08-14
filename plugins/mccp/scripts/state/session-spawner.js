'use strict';

// v0.3.0 S10b — session spawner with race-lock + platform spawn + STATE.md
// continuity write.
//
// Architecture §4 priority policy #2 (hard ceiling override):
//   tier === 'critical' → fix-task is overridden as a defer signal.
//   The spawner still preserves fix-task.md on disk (next session inherits
//   it as the first chunk of work) and sets unsafe_checkpoint=true so
//   downstream readers can see this was a non-graceful handoff.
//
// Mode (MCCP_AUTO_HANDOFF env):
//   off    — no lock, no spawn, no STATE.md write. early-return noop.
//   notify — default. stderr loud message + STATE.md write + meta-only result.
//            No actual spawn.
//   spawn  — real spawn. claude-binary missing OR tmux missing (non-win32) →
//            degrade to notify mode silently (fallback_reason recorded).
//
// Race-lock pattern (A3 architecture decision — pr-phase-lock pattern reuse):
//   handoff-specific local helpers reuse pr-phase-lock primitives
//   (hashToken, tryReclaimStaleLock) without the PR-phase baseline capture
//   overhead. Same invariants: ownership_token_hash + host-aware tri-state
//   (same-host+pid-alive → NEVER reclaim; same-host+pid-dead → reclaim;
//   cross-host → mtime > LEASE_TTL).
//
// API (sync):
//   spawn({ root, tier, currentTask, mode, spawnImpl?, claudeAvailable? })
//     → { ok, mode, lockPath?, fallbackReason?, ownershipToken?, nextChunk? }
//
// Test isolation:
//   spawnImpl(command, args, opts) → injected for test (default: child_process.spawn).
//   claudeAvailable() → injected for test (default: spawnSync claude --version).

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const stateWriter = require('./state-writer');
const fixTask = require('./fix-task');
const prPhaseLock = require('../lib/pr-phase-lock');
const { assertContained } = require('../lib/path-containment');

const LOCK_DIRNAME = path.join('.claude', 'state');
const LOCK_PREFIX = 'handoff-lock-';
const LOCK_SUFFIX = '.lock';
const LEASE_TTL_MS = 60 * 1000;

const MODES = Object.freeze(['off', 'notify', 'spawn']);
const DEFAULT_MODE = 'notify';

const FALLBACK = Object.freeze({
  CLAUDE_BINARY_MISSING: 'claude-binary-not-found',
  TMUX_MISSING: 'tmux-not-available',
  SPAWN_FAILED: 'spawn-failed',
  SPAWN_EXPERIMENTAL_FLAG_MISSING: 'spawn-experimental-flag-missing',
});

function modeFromEnv(env) {
  const raw = String((env || {}).MCCP_AUTO_HANDOFF || DEFAULT_MODE).toLowerCase().trim();
  if (MODES.indexOf(raw) >= 0) return raw;
  return DEFAULT_MODE;
}

function taskHash(tier, currentTask) {
  return crypto
    .createHash('sha256')
    .update(String(tier) + '|' + String(currentTask || ''))
    .digest('hex')
    .slice(0, 8);
}

function lockPathFor(root, tier, currentTask) {
  return path.join(root, LOCK_DIRNAME, LOCK_PREFIX + taskHash(tier, currentTask) + LOCK_SUFFIX);
}

function ensureLockDir(root) {
  const dir = path.join(root, LOCK_DIRNAME);
  fs.mkdirSync(dir, { recursive: true });
  // Symlink-escape containment guard (same pattern as pr-phase-lock F8).
  assertContained(dir, path.join(root, '.claude'), null);
}

function tryAcquireLock(lockPath, tier, currentTask) {
  const ownershipToken = crypto.randomUUID();
  const ownershipTokenHash = prPhaseLock.hashToken(ownershipToken);
  const body = {
    ownership_token_hash: ownershipTokenHash,
    pid: process.pid,
    host: os.hostname(),
    started_at: new Date().toISOString(),
    tier: tier,
    current_task_hash: taskHash(tier, currentTask),
    purpose: 'auto-handoff',
  };
  const bodyJson = JSON.stringify(body, null, 2);

  function open() {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    try { fs.writeSync(fd, bodyJson); }
    finally { fs.closeSync(fd); }
  }

  try {
    open();
    return { ok: true, ownershipToken: ownershipToken };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    // Reclaim attempt — pr-phase-lock primitive (host-aware tri-state).
    if (prPhaseLock.tryReclaimStaleLock(lockPath, LEASE_TTL_MS)) {
      try {
        open();
        return { ok: true, ownershipToken: ownershipToken, reclaimed: true };
      } catch (err2) {
        return { ok: false, reason: 'lock-reclaim-race: ' + (err2 && err2.message) };
      }
    }
    return { ok: false, reason: 'lock-held-by-live-holder' };
  }
}

function releaseLock(lockPath, presentedToken) {
  if (!fs.existsSync(lockPath)) return { ok: true, reason: 'already-gone' };
  // Read body directly — pr-phase-lock.readLock is hardcoded to the
  // pr-phase.lock filename; we only need the JSON body here.
  let body;
  try { body = JSON.parse(fs.readFileSync(lockPath, 'utf8')); }
  catch (_) { return { ok: false, reason: 'lock-unreadable' }; }
  if (!prPhaseLock.verifyTokenAgainstLock(presentedToken, body)) {
    return { ok: false, reason: 'token-mismatch' };
  }
  try { fs.unlinkSync(lockPath); }
  catch (err) { return { ok: false, reason: 'unlink-failed: ' + err.message }; }
  return { ok: true };
}

function defaultClaudeAvailable() {
  try {
    const r = childProcess.spawnSync('claude', ['--version'], {
      stdio: 'ignore', timeout: 5000,
    });
    return r.status === 0;
  } catch (_) { return false; }
}

function defaultHasTmux() {
  if (process.platform === 'win32') return false;
  if (!process.env.TMUX) return false;
  try {
    const r = childProcess.spawnSync('tmux', ['-V'], { stdio: 'ignore', timeout: 2000 });
    return r.status === 0;
  } catch (_) { return false; }
}

// The handoff child cannot stamp its own start time, so the parent stamps
// spawn-time. §D15's tolerance absorbs the ms-scale spawn delay; and because
// handoff records never reach identity verification anyway, an imprecise value
// can only ever fail closed.
function registerHandoffChild(root, child) {
  const pid = child && child.pid;
  if (!Number.isInteger(pid) || pid <= 0) {
    process.stderr.write('[mccp:session-spawner] handoff child has no pid — '
      + 'not registered in the session-process registry\n');
    return { ok: false, reason: 'no_pid' };
  }
  try {
    return require('../lib/session-processes').register(root, {
      kind: 'handoff-session',
      lifetime: 'outlives-session',
      role: 'owner',
      pid: pid,
      // Not a filesystem path — a handoff is `powershell.exe -NoExit -Command
      // claude`. §D15 axis 1 could not match it, which is consistent because
      // handoff records are excluded from reclaim before identity is ever
      // consulted.
      execPath: 'powershell.exe',
      procStartedAtMs: Date.now(),
    });
  } catch (err) {
    process.stderr.write('[mccp:session-spawner] session-process register skipped: '
      + ((err && err.message) || err) + '\n');
    return { ok: false, reason: 'threw' };
  }
}

function platformSpawn(root, hash, deps) {
  const impl = deps.spawnImpl || childProcess.spawn;
  const platform = deps.platform || process.platform;
  const hasTmuxFn = deps.hasTmux || defaultHasTmux;
  if (platform === 'win32') {
    const child = impl('powershell.exe', [
      '-NoExit', '-Command', 'claude',
    ], { cwd: root, detached: true, stdio: 'ignore' });
    // session-process-reclaim M1 — the ONE site where a parent registers a
    // child. The child is a fresh `claude` session, not mccp code, so it cannot
    // self-register. It is recorded so the registry is complete, never so it can
    // be killed: `kind: 'handoff-session'` is excluded from reclaim
    // unconditionally (§D4/§D10) — outliving this session is the entire point of
    // a handoff, and MCCP_RECLAIM_OUTLIVES does not flip that.
    registerHandoffChild(root, child);
    if (child && typeof child.unref === 'function') child.unref();
    return { ok: true, kind: 'win32-powershell' };
  }
  if (hasTmuxFn()) {
    // Deliberately NOT registered: this is not a detached child we own — the
    // tmux server owns the window's lifetime, and killing the pid we get back
    // would say nothing about the session inside it.
    const child = impl('tmux', [
      'new-window', '-c', root, '-n', 'mccp-' + hash, 'claude',
    ], { stdio: 'ignore' });
    if (child && typeof child.unref === 'function') child.unref();
    return { ok: true, kind: 'tmux-new-window' };
  }
  return { ok: false, reason: FALLBACK.TMUX_MISSING };
}

function writeStateHandoff(root, opts) {
  return stateWriter.update(root, {
    event: 'handoff_spawn',
    nextChunk: opts.nextChunk,
    unsafeCheckpoint: !!opts.unsafeCheckpoint,
    sessionEndImminent: true,
  });
}

function buildNextChunk(tier, fixTaskPending) {
  if (tier === 'critical') {
    return 'Resume from hard-ceiling handoff. unsafe checkpoint. ' +
      (fixTaskPending
        ? 'Apply fix-task.md first, then continue current task.'
        : 'No fix-task pending — continue current task.');
  }
  return 'Resume from soft-ceiling handoff (graceful). Continue current task; cost-state reset on new session.';
}

function loudStderr(line) {
  process.stderr.write('[mccp:session-spawner] ' + line + '\n');
}

function spawn(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const root = o.root;
  const tier = o.tier;
  const currentTask = o.currentTask;
  const requestedMode = o.mode || modeFromEnv(env);
  const claudeCheck = o.claudeAvailable || defaultClaudeAvailable;
  const spawnImpl = o.spawnImpl;

  if (!root) {
    return { ok: false, mode: 'noop', fallbackReason: 'missing-root' };
  }

  // off mode: zero side effects.
  if (requestedMode === 'off') {
    return { ok: true, mode: 'noop', fallbackReason: 'mode-off' };
  }

  // Acquire lock (idempotency — same currentTask hash cannot double-fire).
  ensureLockDir(root);
  const lockPath = lockPathFor(root, tier, currentTask);
  const lock = tryAcquireLock(lockPath, tier, currentTask);
  if (!lock.ok) {
    return {
      ok: false,
      mode: 'noop',
      lockPath: lockPath,
      fallbackReason: 'lock-held: ' + lock.reason,
    };
  }

  try {
    const unsafeCheckpoint = (tier === 'critical');
    const fixTaskPending = fs.existsSync(fixTask.fixTaskPath(root));
    const nextChunk = buildNextChunk(tier, fixTaskPending);

    let effectiveMode = requestedMode;
    let fallbackReason = null;

    if (requestedMode === 'spawn') {
      if (env.MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN !== '1') {
        effectiveMode = 'notify';
        fallbackReason = FALLBACK.SPAWN_EXPERIMENTAL_FLAG_MISSING;
        loudStderr('spawn mode is experimental in v1.1.0+ — set MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1 to opt in. Degrading spawn → notify.');
      } else if (!claudeCheck()) {
        effectiveMode = 'notify';
        fallbackReason = FALLBACK.CLAUDE_BINARY_MISSING;
        loudStderr('claude binary not on PATH — degrading spawn → notify.');
      } else {
        const result = platformSpawn(root, taskHash(tier, currentTask), {
          spawnImpl: spawnImpl,
          platform: o.platform,
          hasTmux: o.hasTmux,
        });
        if (!result.ok) {
          effectiveMode = 'notify';
          fallbackReason = result.reason;
          loudStderr('platform spawn failed (' + result.reason + ') — degrading spawn → notify.');
        }
      }
    }

    // STATE.md continuity write — always, regardless of effectiveMode.
    // notify mode still updates STATE.md so the next session-start sees
    // the handoff signal even when the user opens the new session manually.
    writeStateHandoff(root, {
      nextChunk: nextChunk,
      unsafeCheckpoint: unsafeCheckpoint,
    });

    if (effectiveMode === 'notify') {
      const banner = (tier === 'critical')
        ? 'HARD CEILING ($100+) — manual session start required if no new session appeared.'
        : 'Soft ceiling ($80+) — consider starting a new session.';
      loudStderr(banner);
    }

    return {
      ok: true,
      mode: effectiveMode,
      lockPath: lockPath,
      ownershipToken: lock.ownershipToken,
      fallbackReason: fallbackReason,
      nextChunk: nextChunk,
      unsafeCheckpoint: unsafeCheckpoint,
    };
  } finally {
    // Always release — handoff lock is short-lived (just dedupe within Stop event).
    releaseLock(lockPath, lock.ownershipToken);
  }
}

module.exports = {
  spawn: spawn,
  modeFromEnv: modeFromEnv,
  taskHash: taskHash,
  lockPathFor: lockPathFor,
  buildNextChunk: buildNextChunk,
  FALLBACK: FALLBACK,
  MODES: MODES,
  DEFAULT_MODE: DEFAULT_MODE,
  LEASE_TTL_MS: LEASE_TTL_MS,
};
