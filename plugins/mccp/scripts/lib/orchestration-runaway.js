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

// M3 follow-up (PR-Codex R1 F2) — RESERVE IS TWO-PHASE, NOT A PERMANENT SPEND.
//
// reserveWorkers used to add `granted` to `launched` at DECISION time and never
// give it back. Callers resolve the oracle well before any worker exists, and
// several downstream paths then launch nothing at all (prepare-fleet failure →
// FLEET_N=1, route falling back to Task, fan-out's in-sandbox budget pre-guard
// skipping, Workflow unavailable → inline). Those runs burned cap headroom for
// workers that never ran — PHANTOM reservations. With M3 promoting this counter
// to the PRIMARY structural backstop (operational USD retired), phantoms silently
// demote later REAL work to a single worker: the cap stops being trustworthy,
// which is exactly the claim M3 leads with.
//
// Lifecycle:
//   pending   — reserved, route not yet reached. Recorded in `open[]`. EXPIRABLE.
//   committed — reconciled against the actual launch count. Removed from `open[]`.
//               PERMANENT: a real launch is never un-counted.
//
// Expiry is sound ONLY because the pending window is structurally launch-free:
// work.md pins Step 3.route as the "before any worker is spawned" boundary
// (M2a Codex F1) and the reservation is taken upstream of it at Step 3.prep-parallel.
// So dropping an expired pending entry cannot un-count a real worker — the failure
// mode a lease normally risks (over-permissive) has no way to occur here. This is
// the same time-axis self-healing as cost-state.js#decayIfStale, which unstuck
// "one spike locks automation forever" in v1.22.0 M3.
//
// reconcile is a CORRECTION to the real launch count, not a blanket release:
//   workflow-parallel        → actualN = granted (the fleet really fired)
//   workflow-single / task   → actualN = 1       (a single worker really fired)
//   inline / skipped / N/A   → actualN = 0       (nothing fired)
// Releasing everything on the single-worker path would UNDER-count a real launch,
// which is over-permissive — the opposite of this module's conservative direction.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_MAX_AGENTS = 'MCCP_ORCHESTRATION_MAX_AGENTS';
const DEFAULT_MAX_AGENTS = 24;

// M3 follow-up (R1 F3) — pending-reservation lease. A caller that dies between
// reserve and route (crash, abandoned turn) would otherwise poison the session's
// headroom forever: readCounter only resets on a missing/corrupt file or a
// different session key, so a lost reservation is never recovered and the session
// self-demotes to N=1 permanently. Only PENDING entries expire.
const ENV_RESERVATION_LEASE_MS = 'MCCP_ORCHESTRATION_RESERVATION_LEASE_MS';
const DEFAULT_RESERVATION_LEASE_MS = 600000; // 10 min — reserve→route is Bash ×3 + one LLM turn

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

// parseReservationLease(env) → positive ms (M3 follow-up R1 F3). Loud fail-open to
// default (mirror of parseMaxAgents). 0 is NOT a kill switch: disabling expiry
// would restore the permanent self-poisoning this lease exists to prevent, so it
// is treated as invalid and warned about.
function parseReservationLease(env) {
  const raw = env && env[ENV_RESERVATION_LEASE_MS];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_RESERVATION_LEASE_MS;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    warn(ENV_RESERVATION_LEASE_MS + ' must be a positive number of milliseconds; got "' + raw +
      '". Falling back to default ' + DEFAULT_RESERVATION_LEASE_MS + '.');
    return DEFAULT_RESERVATION_LEASE_MS;
  }
  return Math.floor(n);
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

// readCounter({ sessionId, statePath?, stateDir?, env?, now? })
//   → { launched, open, sessionId, fresh }
//
// Reads the persisted counter. Returns a fresh {launched:0} when the file is
// missing / corrupt / belongs to a DIFFERENT session key (session reset).
//
// `launched` is committed + still-pending — the conservative value the cap must
// see. Expired PENDING reservations are subtracted IN THE VIEW ONLY: this
// function performs NO write, because the read-only firing-preview
// (orchestration-preview.js) calls it and observation must never mutate what it
// observes. The pruned view is persisted only by the write-side callers below,
// which recompute it under the lock. Legacy bodies (no `open`) read as [] and are
// therefore unaffected.
// readCounterRaw({ sessionId, statePath?, stateDir? })
//   → { launched, open, sessionId, fresh }
//
// The persisted state with NO lease expiry applied — malformed `open` entries are
// still dropped, since they are uninterpretable rather than merely old.
// reconcileReservation needs this: an explicit reconcile must be able to find its
// OWN reservation even after the lease has elapsed (Implement-Codex R1 F2).
function readCounterRaw(opts) {
  opts = opts || {};
  const sessionId = opts.sessionId || 'unknown';
  const p = getRunawayPath(opts);
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return { launched: 0, open: [], sessionId: sessionId, fresh: true };
  }
  if (!parsed || parsed.session_id !== sessionId || !Number.isFinite(parsed.launched) || parsed.launched < 0) {
    return { launched: 0, open: [], sessionId: sessionId, fresh: true };
  }
  const rawOpen = Array.isArray(parsed.open) ? parsed.open : [];
  const open = [];
  for (let i = 0; i < rawOpen.length; i++) {
    const e = rawOpen[i];
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' ||
        !Number.isFinite(e.n) || e.n < 0) {
      continue; // malformed entry: uninterpretable, never counted
    }
    open.push({ id: e.id, n: Math.floor(e.n), at: e.at });
  }
  return { launched: Math.floor(parsed.launched), open: open, sessionId: sessionId, fresh: false };
}

// isExpired(entry, leaseMs, now) → boolean. An unparseable timestamp cannot be
// aged; treat it as LIVE so a bad clock never releases headroom a real pending
// reservation is holding.
function isExpired(entry, leaseMs, now) {
  const at = Date.parse(entry.at);
  return Number.isFinite(at) && (now - at) > leaseMs;
}

// readCounter({ sessionId, statePath?, stateDir?, env?, now? })
//   → { launched, open, sessionId, fresh }
//
// The LEASE-APPLIED view. `launched` is committed + still-pending — the
// conservative value the cap must see — with expired PENDING reservations
// subtracted IN THE VIEW ONLY. This function performs NO write, because the
// read-only firing-preview (orchestration-preview.js) calls it and observation
// must never mutate what it observes. The pruned view is persisted only by the
// write-side callers below, which recompute it under the lock. Legacy bodies (no
// `open`) read as [] and are therefore unaffected.
function readCounter(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const raw = readCounterRaw(opts);
  if (raw.fresh) return raw;

  const leaseMs = parseReservationLease(env);
  const live = [];
  let expiredN = 0;
  for (let i = 0; i < raw.open.length; i++) {
    const e = raw.open[i];
    if (isExpired(e, leaseMs, now)) { expiredN += e.n; continue; }
    live.push(e);
  }
  return {
    launched: Math.max(0, raw.launched - expiredN),
    open: live,
    sessionId: raw.sessionId,
    fresh: false,
  };
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
    const cur = readCounter({ sessionId: sessionId, statePath: p, env: opts.env });
    const launched = cur.launched + delta;
    const body = JSON.stringify({
      session_id: sessionId,
      launched: launched,
      // Preserve pending reservations. This writer has no production caller today
      // (reserveWorkers is the firing path), but omitting `open` here would make
      // any future/legacy bump silently drop live reservations and hand their
      // headroom back — the phantom bug in reverse.
      open: cur.open,
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
      // No reservation was recorded, so there is nothing to reconcile later. A
      // null id keeps callers from inventing one.
      reservationId: null,
    };
  }
  try {
    const now = Date.now();
    // Reading under the lock also PRUNES expired pending entries out of the view;
    // the write below persists that pruning. Stale-reclaim therefore happens on
    // the write side only (R1 F3), never in the read-only preview.
    const cur = readCounter({ sessionId: sessionId, statePath: p, env: env, now: now });
    const decision = clampForRunaway({
      requestedN: requestedN, launchedSoFar: cur.launched, env: env,
    });
    const reservationId = crypto.randomUUID();
    const launched = cur.launched + decision.n;
    const open = cur.open.concat([{
      id: reservationId, n: decision.n, at: new Date(now).toISOString(),
    }]);
    const body = JSON.stringify({
      session_id: sessionId,
      launched: launched,
      open: open,
      updated_at: new Date(now).toISOString(),
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
      reservationId: reservationId,
    };
  } finally {
    releaseLock(lock);
  }
}

// reconcileReservation({ sessionId, reservationId, actualN, env, statePath?, stateDir? })
//   → { reconciled, delta, launched }
//
// M3 follow-up (R1 F2) — CORRECT a pending reservation to the number of workers
// that actually launched, then COMMIT it (remove from `open[]`, making it
// permanent and no longer expirable).
//
// This is deliberately not a "release": the route that degrades to a single
// worker still launches one, so releasing the whole reservation there would
// under-count a real launch and leave the cap over-permissive. Pass the real
// count — 0 only when nothing launched at all.
//
// Idempotent: an unknown / already-reconciled / null id is a no-op, so a retried
// or duplicated call cannot double-correct the counter.
//
// Lock exhaustion returns reconciled:false and leaves the reservation pending —
// conservative (the workers stay counted) and self-healing (the lease expires it
// if it truly never launched). It NEVER fails the caller's pipeline.
function reconcileReservation(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const sessionId = opts.sessionId || 'unknown';
  const reservationId = opts.reservationId;
  const actualN = (Number.isFinite(opts.actualN) && opts.actualN >= 0) ? Math.floor(opts.actualN) : 0;
  if (typeof reservationId !== 'string' || !reservationId) {
    return { reconciled: false, delta: 0, launched: null };
  }
  const p = getRunawayPath(opts);

  const lock = acquireLock(p);
  if (!lock) {
    warn('counter lock exhausted; reservation ' + reservationId + ' left pending ' +
      '(conservative — it stays counted and the lease will reclaim it if nothing launched).');
    return { reconciled: false, delta: 0, launched: null };
  }
  try {
    const now = Date.now();
    const leaseMs = parseReservationLease(env);
    // R1 F2 — find OUR reservation in the RAW state, BEFORE any lease pruning.
    // Reading the lease-applied view first made an explicit reconcile unable to
    // see its own id once the lease elapsed: it silently no-op'd, and the entry
    // was then pruned as "never launched" even though the agents HAD spawned —
    // under-counting real launches (over-permissive). plan.md's fan-out reserves
    // before the Workflow call and reconciles after it returns, so any fan-out
    // slower than the lease hit exactly this.
    //
    // An explicit reconcile is positive evidence about its own reservation and
    // must always win over the lease's guess. Expiry still applies to the OTHER
    // entries, which no one is currently reporting on.
    const raw = readCounterRaw({ sessionId: sessionId, statePath: p });
    let entry = null;
    const others = [];
    for (let i = 0; i < raw.open.length; i++) {
      if (raw.open[i].id === reservationId && !entry) { entry = raw.open[i]; continue; }
      others.push(raw.open[i]);
    }
    if (!entry) {
      // Unknown id: already reconciled, legacy body, or a different session.
      // Never guess a delta.
      return { reconciled: false, delta: 0, launched: readCounter({
        sessionId: sessionId, statePath: p, env: env, now: now }).launched };
    }
    const liveOthers = [];
    let expiredN = 0;
    for (let i = 0; i < others.length; i++) {
      if (isExpired(others[i], leaseMs, now)) { expiredN += others[i].n; continue; }
      liveOthers.push(others[i]);
    }
    const delta = actualN - entry.n;
    const launched = Math.max(0, raw.launched - expiredN + delta);
    const body = JSON.stringify({
      session_id: sessionId,
      launched: launched,
      open: liveOthers,
      updated_at: new Date(now).toISOString(),
    });
    const tmp = p + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, p);
    return { reconciled: true, delta: delta, launched: launched };
  } finally {
    releaseLock(lock);
  }
}

// ── CLI (M3 follow-up Task 6) ────────────────────────────────────────────────
//
// `reconcile --reservation <id> --actual <n> [--session <id>] [--state-path <p>]`
// so a slash-command body can correct a reservation in one Bash line at its route
// boundary. Mirrors the thin require.main block in orchestration-preview.js.
//
// EXIT CODE DEPENDS ON actualN (Implement-Codex R1 F1). An earlier revision always
// exited 0 "so a reconcile failure never breaks the pipeline". That reasoning only
// holds when nothing launches:
//
//   actualN == 0  — nothing spawned. A failed reconcile leaves the entry pending,
//                   the lease expires it, and the counter lands on the right
//                   answer anyway. Ignorable → exit 0.
//   actualN >  0  — workers ARE about to launch. A failed reconcile leaves them
//                   recorded as PENDING, and the lease then subtracts them as if
//                   they never ran: the cap UNDER-counts real launches. That is
//                   the over-permissive direction this cap must never err in, and
//                   the caller cannot see it because the shell said success and it
//                   already deleted the token. → exit 11 so the caller halts/retries.
const EXIT_RECONCILE_UNCOMMITTED = 11;
function runCli(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) === '--') {
      const next = argv[i + 1];
      if (next !== undefined && next.slice(0, 2) !== '--') { args[a.slice(2)] = next; i++; }
      else { args[a.slice(2)] = true; }
    }
  }
  const cmd = argv[0] && argv[0].slice(0, 2) !== '--' ? argv[0] : null;
  if (cmd !== 'reconcile') {
    process.stderr.write('usage: orchestration-runaway.js reconcile --reservation <id> ' +
      '--actual <n> [--session <id>] [--state-path <path>]\n');
    return 2;
  }
  const actualN = Number(args.actual);
  const out = reconcileReservation({
    sessionId: args.session || process.env.CLAUDE_SESSION_ID || 'unknown',
    reservationId: typeof args.reservation === 'string' ? args.reservation : null,
    actualN: actualN,
    statePath: typeof args['state-path'] === 'string' ? args['state-path'] : undefined,
  });
  process.stdout.write(JSON.stringify(out) + '\n');
  if (!out.reconciled && Number.isFinite(actualN) && actualN > 0) {
    warn('reservation ' + args.reservation + ' could NOT be committed while actual=' +
      actualN + ' worker(s) are about to launch. Those launches would be recorded as ' +
      'pending and then dropped by the lease, under-counting the cap. Do NOT delete ' +
      'the reservation token; retry, and halt if it keeps failing.');
    return EXIT_RECONCILE_UNCOMMITTED;
  }
  return 0;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  clampForRunaway: clampForRunaway,
  reserveWorkers: reserveWorkers,
  reconcileReservation: reconcileReservation,
  parseReservationLease: parseReservationLease,
  parseMaxAgents: parseMaxAgents,
  parseUsdBomb: parseUsdBomb,
  parseCatastrophicUsd: parseCatastrophicUsd,
  readCounter: readCounter,
  readCounterRaw: readCounterRaw,
  bumpCounter: bumpCounter,
  getRunawayPath: getRunawayPath,
  REASONS: REASONS,
  ENV_MAX_AGENTS: ENV_MAX_AGENTS,
  DEFAULT_MAX_AGENTS: DEFAULT_MAX_AGENTS,
  ENV_USD_BOMB: ENV_USD_BOMB,
  ENV_CATASTROPHIC_USD: ENV_CATASTROPHIC_USD,
  DEFAULT_CATASTROPHIC_USD: DEFAULT_CATASTROPHIC_USD,
  ENV_RESERVATION_LEASE_MS: ENV_RESERVATION_LEASE_MS,
  DEFAULT_RESERVATION_LEASE_MS: DEFAULT_RESERVATION_LEASE_MS,
};
