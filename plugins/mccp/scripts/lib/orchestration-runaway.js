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
//
// M3 — this module is now the single owner of the MCCP_ORCHESTRATION_* env axis,
// and the cap it enforces is load-bearing rather than a fail-open-path extra:
//   - parseUsdBomb (Codex F4) — MCCP_ORCHESTRATION_USD_BOMB, the back-compat kill
//     switch that restores the M1 operational-USD bomb-detector (hard_ceiling skip
//     + critical autoDisable + auto-chain hard_ceiling abort) across all surfaces.
//     Default OFF. Unknown non-empty → OFF + LOUD warn: this is a rollback path,
//     so a typo silently disabling the restore must be surfaced, never swallowed.
//   - parseCatastrophicUsd (Codex F1) — MCCP_ORCHESTRATION_CATASTROPHIC_USD, the
//     REPLACEMENT bomb detector. M3 retires the OPERATIONAL USD tiers ($50/$80/
//     $100 + hard_ceiling) as firing blockers, so a separate, far higher ceiling
//     ($500 default) still stops a genuine cost runaway while an ordinary sticky
//     $186 fires. Operational and catastrophic are deliberately distinct axes.
//   - reserveWorkers (Codex F2) — the ATOMIC check-and-bump. With operational USD
//     retired, the agent-count cap is the primary structural backstop, so the old
//     read-then-bump (clampForRunaway against a stale read, then a separate
//     bumpCounter) is no longer sound: concurrent / re-entrant dispatches observe
//     the same pre-bump value and each grant a full fleet, overshooting the cap.
//     reserveWorkers collapses both halves into ONE lock critical section.
//
// clampForRunaway stays exported as the PURE, no-bump oracle — it is what the
// read-only firing-preview (orchestration-preview.js) uses, since observation must
// never mutate the counter it observes.

const fs = require('fs');
const path = require('path');

const ENV_MAX_AGENTS = 'MCCP_ORCHESTRATION_MAX_AGENTS';
const DEFAULT_MAX_AGENTS = 24;

// M3 Codex F4 — back-compat kill switch restoring the M1 operational-USD bomb.
const ENV_USD_BOMB = 'MCCP_ORCHESTRATION_USD_BOMB';
// M3 Codex F1 — replacement bomb detector, deliberately far above the operational
// $100 hard ceiling so ordinary sticky cost-state fires but real runaway does not.
const ENV_CATASTROPHIC_USD = 'MCCP_ORCHESTRATION_CATASTROPHIC_USD';
const DEFAULT_CATASTROPHIC_USD = 500;

const USD_BOMB_TRUE = Object.freeze(new Set(['1', 'true', 'yes', 'on']));
const USD_BOMB_FALSE = Object.freeze(new Set(['0', 'false', 'no', 'off']));

const LOCK_RETRY_MAX = 5;
const LOCK_RETRY_MS = 20;
const STALE_LOCK_MS = 5000;

const REASONS = Object.freeze({
  OK: 'ok',
  RUNAWAY_CLAMP: 'runaway-clamp',
  // M3 Codex F2 — reserveWorkers could not take the lock, so the counter is
  // unverifiable. The cap is the primary backstop now, so this degrades to the
  // conservative floor (1) rather than granting the full fleet unchecked.
  LOCK_EXHAUSTED: 'lock-exhausted',
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

// parseUsdBomb(env) → boolean (M3 Codex F4). Default OFF — M3 retires the
// operational-USD firing block; setting this restores the M1 behavior verbatim.
// Accepts the standard truthy/falsy vocabulary. An unrecognised non-empty value
// is OFF + a LOUD warn: this is the rollback switch, so "I set it but it did
// nothing" must never be silent.
function parseUsdBomb(env) {
  const raw = String((env && env[ENV_USD_BOMB]) || '').trim().toLowerCase();
  if (raw === '') return false;
  if (USD_BOMB_TRUE.has(raw)) return true;
  if (USD_BOMB_FALSE.has(raw)) return false;
  warn(ENV_USD_BOMB + ' expects 1|true|yes|on (restore the M1 USD bomb-detector) or ' +
    '0|false|no|off; got "' + raw + '". Treating as OFF — the USD bomb-detector stays retired.');
  return false;
}

// parseCatastrophicUsd(env) → positive USD amount (M3 Codex F1). Loud fail-open to
// default (mirror of parseMaxAgents). Not floored — a fractional ceiling is valid.
function parseCatastrophicUsd(env) {
  const raw = env && env[ENV_CATASTROPHIC_USD];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_CATASTROPHIC_USD;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    warn(ENV_CATASTROPHIC_USD + ' must be a positive USD amount; got "' + raw +
      '". Falling back to default ' + DEFAULT_CATASTROPHIC_USD + '.');
    return DEFAULT_CATASTROPHIC_USD;
  }
  return n;
}

// clampForRunaway({ requestedN, launchedSoFar, env }) → { n, degraded, reason, maxAgents }
// PURE, and does NOT bump. requestedN is the fleet/fanout oracle's already-
// structurally-capped N. launchedSoFar is the session cumulative worker-launch
// count (read from disk by the caller). If launching requestedN MORE workers would
// exceed the absolute cap, degrade fail-open to n=1 (never 0) — the parallel
// amplification is removed while a lone worker still makes progress. Otherwise
// return requestedN unchanged.
//
// M3: firing callers must go through reserveWorkers (atomic check-and-bump)
// instead. This pure form remains the decision core reserveWorkers calls under the
// lock, and is what the READ-ONLY firing-preview uses — observation must not bump.
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

// reserveWorkers({ sessionId, requestedN, env, statePath?, stateDir? })
//   → { granted, degraded, reason, maxAgents, launched }
//
// M3 Codex F2 — the ATOMIC replacement for the read-then-bump pair. Decides how
// many workers may launch AND commits that decision inside a SINGLE lock critical
// section, so two concurrent / re-entrant dispatches can never both observe the
// same pre-bump counter and each grant a full fleet.
//
// `granted` is what the caller may actually launch and is ALREADY counted — the
// caller must NOT call bumpCounter afterwards.
//
// Lock exhaustion is fail-SAFE, not fail-open: the counter cannot be verified, and
// with the operational-USD block retired this cap is the primary structural
// backstop, so the conservative floor (1) is granted rather than the full fleet.
// One worker is still granted (never 0) — the pipeline is degraded, never blocked.
function reserveWorkers(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const sessionId = opts.sessionId || 'unknown';
  const requestedN = (Number.isInteger(opts.requestedN) && opts.requestedN >= 1) ? opts.requestedN : 1;
  const maxAgents = parseMaxAgents(env);
  const p = getRunawayPath(opts);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (_e) { /* best-effort */ }

  const lock = acquireLock(p);
  if (!lock) {
    warn('counter lock exhausted; granting 1 worker (fail-safe degrade — the cap ' +
      'is the primary backstop, so an unverifiable counter must not grant a fleet).');
    return {
      granted: 1, degraded: true, reason: REASONS.LOCK_EXHAUSTED,
      maxAgents: maxAgents, launched: null,
    };
  }
  try {
    const cur = readCounter({ sessionId: sessionId, statePath: p });
    const decision = clampForRunaway({
      requestedN: requestedN, launchedSoFar: cur.launched, env: env,
    });
    const launched = cur.launched + decision.n;
    const body = JSON.stringify({
      session_id: sessionId,
      launched: launched,
      updated_at: new Date().toISOString(),
    });
    const tmp = p + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, p);
    return {
      granted: decision.n,
      degraded: decision.degraded,
      reason: decision.reason,
      maxAgents: maxAgents,
      launched: launched,
    };
  } finally {
    releaseLock(lock);
  }
}

module.exports = {
  clampForRunaway: clampForRunaway,
  reserveWorkers: reserveWorkers,
  parseMaxAgents: parseMaxAgents,
  parseUsdBomb: parseUsdBomb,
  parseCatastrophicUsd: parseCatastrophicUsd,
  readCounter: readCounter,
  bumpCounter: bumpCounter,
  getRunawayPath: getRunawayPath,
  REASONS: REASONS,
  ENV_MAX_AGENTS: ENV_MAX_AGENTS,
  DEFAULT_MAX_AGENTS: DEFAULT_MAX_AGENTS,
  ENV_USD_BOMB: ENV_USD_BOMB,
  ENV_CATASTROPHIC_USD: ENV_CATASTROPHIC_USD,
  DEFAULT_CATASTROPHIC_USD: DEFAULT_CATASTROPHIC_USD,
};
