'use strict';

// workflow-orchestration live-activation M1 Task 4a — cost-state-INDEPENDENT
// catastrophic-runaway last-resort backstop (Codex F2 absorption).
//
// PROBLEM: live-activation flips the expensive fan-out / parallel oracles to
// fail-OPEN when cost-state is absent (assume green + run). With no cost-state
// the USD bomb-detector (hard_ceiling_reached / critical tier) can NEVER fire, so
// the only ceiling left is the per-dispatch structural cap (fleetSize ≤ 4). A
// repeated / recursive / retried dispatch loop could therefore keep launching
// bursts of workers with zero telemetry to stop it.
//
// SOLUTION: an independent, session-keyed cumulative worker-launch counter
// persisted on disk, plus an absolute env cap MCCP_ORCHESTRATION_MAX_AGENTS
// (default 24). A fail-open N that would push the session total past the cap is
// clamped (degraded fail-open) to a single worker — never 0: a lone worker is the
// minimum useful progress, so the pipeline is never fully blocked, but the
// parallel amplification is removed once the cumulative launches approach the cap.
//
// The pure oracle (clampForRunaway) is separated from the disk I/O (readCounter /
// bumpCounter) so the decision is unit-testable without touching disk. Mirrors
// cost-state.js acquireLock/releaseLock (wx O_EXCL + stale reclaim + atomic
// tmp+rename) and subscription.js loud fail-open env parse.

const fs = require('fs');
const path = require('path');

const ENV_MAX_AGENTS = 'MCCP_ORCHESTRATION_MAX_AGENTS';
const DEFAULT_MAX_AGENTS = 24;

const LOCK_RETRY_MAX = 5;
const LOCK_RETRY_MS = 20;
const STALE_LOCK_MS = 5000;

const REASONS = Object.freeze({
  OK: 'ok',
  RUNAWAY_CLAMP: 'runaway-clamp',
});

function warn(line) {
  process.stderr.write('[mccp:orchestration-runaway] ' + line + '\n');
}

// parseMaxAgents(env) → positive integer. Loud fail-open to default (mirror
// subscription.js / cost-thresholds.js env parse).
function parseMaxAgents(env) {
  const raw = env && env[ENV_MAX_AGENTS];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_MAX_AGENTS;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    warn(ENV_MAX_AGENTS + ' must be a positive integer; got "' + raw +
      '". Falling back to default ' + DEFAULT_MAX_AGENTS + '.');
    return DEFAULT_MAX_AGENTS;
  }
  return Math.floor(n);
}

// clampForRunaway({ requestedN, launchedSoFar, env }) → { n, degraded, reason, maxAgents }
// PURE. requestedN is the fleet/fanout oracle's already-structurally-capped N.
// launchedSoFar is the session cumulative worker-launch count (read from disk by
// the caller). If launching requestedN MORE workers would exceed the absolute
// cap, degrade fail-open to n=1 (never 0). Otherwise return requestedN unchanged.
function clampForRunaway(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const maxAgents = parseMaxAgents(env);
  const requestedN = (Number.isInteger(opts.requestedN) && opts.requestedN >= 1) ? opts.requestedN : 1;
  const launchedSoFar = (Number.isFinite(opts.launchedSoFar) && opts.launchedSoFar >= 0)
    ? Math.floor(opts.launchedSoFar) : 0;

  if (launchedSoFar + requestedN > maxAgents) {
    return { n: 1, degraded: true, reason: REASONS.RUNAWAY_CLAMP, maxAgents: maxAgents };
  }
  return { n: requestedN, degraded: false, reason: REASONS.OK, maxAgents: maxAgents };
}

// ── disk-backed session counter ──────────────────────────────────────────────

function getRunawayPath(opts) {
  opts = opts || {};
  if (opts.statePath) return opts.statePath;
  const dir = opts.stateDir || path.join(process.cwd(), '.claude', 'state');
  return path.join(dir, 'orchestration-runaway.json');
}

// readCounter({ sessionId, statePath?, stateDir? }) → { launched, sessionId, fresh }
// Reads the persisted counter. Returns a fresh {launched:0} when the file is
// missing / corrupt / belongs to a DIFFERENT session key (session reset). Pure of
// clock; touches only the read side of disk.
function readCounter(opts) {
  opts = opts || {};
  const sessionId = opts.sessionId || 'unknown';
  const p = getRunawayPath(opts);
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return { launched: 0, sessionId: sessionId, fresh: true };
  }
  if (!parsed || parsed.session_id !== sessionId || !Number.isFinite(parsed.launched) || parsed.launched < 0) {
    return { launched: 0, sessionId: sessionId, fresh: true };
  }
  return { launched: Math.floor(parsed.launched), sessionId: sessionId, fresh: false };
}

function acquireLock(targetPath) {
  const lockPath = targetPath + '.lock';
  for (let i = 0; i < LOCK_RETRY_MAX; i++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return lockPath;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Stale lock? If older than STALE_LOCK_MS, break it (mirror cost-state.js).
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (_e) { /* race; retry */ }
      const start = Date.now();
      while (Date.now() - start < LOCK_RETRY_MS) { /* spin */ }
    }
  }
  return null; // exhausted
}

function releaseLock(lockPath) {
  if (!lockPath) return;
  try { fs.unlinkSync(lockPath); } catch (_e) { /* ignore */ }
}

// bumpCounter({ sessionId, delta, statePath?, stateDir? }) → { launched } | null
// Atomically adds delta to the session's cumulative launch counter (resets to
// delta when the persisted key belongs to a different session). Uses the
// cost-state.js lock pattern (wx O_EXCL + stale reclaim + atomic tmp+rename). On
// lock exhaustion returns null — the caller proceeds fail-open (the clamp already
// ran against the read value; a missed bump only under-counts, never over-caps).
function bumpCounter(opts) {
  opts = opts || {};
  const sessionId = opts.sessionId || 'unknown';
  const delta = (Number.isFinite(opts.delta) && opts.delta > 0) ? Math.floor(opts.delta) : 0;
  const p = getRunawayPath(opts);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (_e) { /* best-effort */ }
  const lock = acquireLock(p);
  if (!lock) {
    warn('counter lock exhausted; skipping bump (fail-open).');
    return null;
  }
  try {
    const cur = readCounter({ sessionId: sessionId, statePath: p });
    const launched = cur.launched + delta;
    const body = JSON.stringify({
      session_id: sessionId,
      launched: launched,
      updated_at: new Date().toISOString(),
    });
    const tmp = p + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, p);
    return { launched: launched };
  } finally {
    releaseLock(lock);
  }
}

module.exports = {
  clampForRunaway: clampForRunaway,
  parseMaxAgents: parseMaxAgents,
  readCounter: readCounter,
  bumpCounter: bumpCounter,
  getRunawayPath: getRunawayPath,
  REASONS: REASONS,
  ENV_MAX_AGENTS: ENV_MAX_AGENTS,
  DEFAULT_MAX_AGENTS: DEFAULT_MAX_AGENTS,
};
