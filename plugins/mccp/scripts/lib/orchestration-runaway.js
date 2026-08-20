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
// (default 24). An N that would push the session total past the cap is clamped to
// the REMAINING HEADROOM — including 0 once the cap is reached.
//
// PR-Codex R1 F1 (5th round) — THE FLOOR USED TO BE 1, AND THAT MADE THIS A
// THROTTLE, NOT A CAP. The original rule was "clamp to a single worker, never 0:
// a lone worker is the minimum useful progress, so the pipeline is never fully
// blocked". But reserveWorkers RECORDS what it grants, so every post-cap call
// granted and persisted one more launch: cap=24 → launched 25, 26, 27 … unbounded,
// one worker at a time. Measured directly at cap=4: launched went 5,6,7,8,9 with
// nothing but a `degraded` flag to show for it. A repeated / recursive dispatch —
// precisely the scenario this cap exists for — could exceed the cap without bound.
//
// That was survivable while operational USD was the real blocker. M3 retired it and
// promoted this counter to the PRIMARY structural backstop, so "the cap holds" is
// now a load-bearing claim, and a floor of 1 made it false.
//
// Granting 0 does NOT block the pipeline (same premise the 4th round verified for
// lock exhaustion): both callers have an inline fallback that launches no agent at
// all (work.md → inline implement, plan.md → inline Pattern Grounding), and inline
// consumes no cap. Progress continues; only the agent amplification stops.
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
const envValue = require('./env-contract/value');

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
  // Granted less than requested because only that much headroom remained.
  RUNAWAY_CLAMP: 'runaway-clamp',
  // M3 Codex F2 / PR-Codex R1 F1 (4th round) — reserveWorkers could not take the
  // lock, so the launch could not be RECORDED. Granting an unrecordable launch
  // bypasses the cap, so this grants 0 (fail-closed) and the caller goes inline.
  LOCK_EXHAUSTED: 'lock-exhausted',
  // PR-Codex R1 F1 (5th round) — the session already used its whole agent budget.
  // Grant 0: this is the cap actually capping. Distinct from LOCK_EXHAUSTED, which
  // means "cannot verify", while this means "verified, and the answer is no".
  CAP_EXHAUSTED: 'cap-exhausted',
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
  // 로컬 별칭 두 Set을 공유 규약으로 대체했다. 불량값 loud warn은 parseBool이
  // 낸다 — "설정했는데 아무 일도 안 났다"가 조용하면 안 되는 축은 그대로다.
  return envValue.parseBool(env || {}, ENV_USD_BOMB);
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
// count (read from disk by the caller). Grants at most the REMAINING headroom:
//   remaining == 0            → n=0, CAP_EXHAUSTED  (the cap, capping)
//   0 < remaining < requestedN → n=remaining, RUNAWAY_CLAMP (partial)
//   remaining >= requestedN    → n=requestedN, OK
//
// PR-Codex R1 F1 (5th round) — n=0 IS REACHABLE NOW. This used to floor at 1, which
// let a repeated dispatch walk past the cap one worker per call, forever (see the
// module header). The floor's stated purpose — "never fully block the pipeline" —
// is served by the callers' inline fallbacks, not by handing out agents the cap has
// already spent.
//
// M3: firing callers must go through reserveWorkers (atomic check-and-bump)
// instead. This pure form remains the decision core reserveWorkers calls under the
// lock, and is what the READ-ONLY firing-preview uses — observation must not bump.
//
// The preview and the firing path therefore share ONE formula, which is the point:
// a preview that still reported n=1 while reserveWorkers refused would be a false
// green-light, the exact failure class M2's Codex F1 built `effective_fire` to
// prevent. Purity (no I/O, no bump) is what keeps the preview read-only — not the
// shape of the answer.
function clampForRunaway(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const maxAgents = parseMaxAgents(env);
  const requestedN = (Number.isInteger(opts.requestedN) && opts.requestedN >= 1) ? opts.requestedN : 1;
  const launchedSoFar = (Number.isFinite(opts.launchedSoFar) && opts.launchedSoFar >= 0)
    ? Math.floor(opts.launchedSoFar) : 0;

  const remaining = Math.max(0, maxAgents - launchedSoFar);
  if (remaining === 0) {
    return { n: 0, degraded: true, reason: REASONS.CAP_EXHAUSTED, maxAgents: maxAgents };
  }
  if (remaining < requestedN) {
    return { n: remaining, degraded: true, reason: REASONS.RUNAWAY_CLAMP, maxAgents: maxAgents };
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

// ── debt markers (PR-Codex R1 F2, 5th round) ─────────────────────────────────
//
// A pending reservation is EXPIRABLE because the reserve→route window is
// structurally launch-free, so dropping it cannot un-count a real worker. plan.md's
// fan-out breaks that premise: the Workflow call IS the launch point, so once it
// returns with FANOUT_ACTUAL_N > 0 the agents demonstrably ran. If reconcile then
// fails to commit (lock held through every retry), the entry stays PENDING and the
// lease later subtracts it — erasing real launches from the counter and leaving the
// cap over-permissive, in the one direction it must never err.
//
// A debt marker pins such an entry: "these workers really launched; never expire
// this." reconcile clears the marker when it finally commits — or, if a lock-failed
// reconcile learns actualN===0, immediately: a pin over zero launches is false and
// would otherwise over-count a phantom forever (PR-Codex R1, 6th round). The permanent
// pin only survives the case we NEVER learned the count (controller death), never the
// case we learned it was zero.
//
// WHY A SEPARATE FILE INSTEAD OF A FLAG IN THE COUNTER: the counter needs the lock,
// and the only situation that creates debt is precisely being unable to take the
// lock. A marker is a unique write-once path, so it needs no lock and cannot
// contend. readCounter merely READS the directory, which keeps the read-only
// firing-preview read-only.
//
// The marker pins the EXISTING pending entry rather than adding a count, so nothing
// is double-counted: `launched` already includes the pending reservation.
function getDebtDir(opts) {
  return getRunawayPath(opts) + '.debt';
}

// readDebtIds(opts) → Set<string> of ids that PIN their pending entry. Missing dir →
// empty. READ-ONLY: nothing is unlinked here (a later reconcile is what clears a
// marker), so the firing-preview stays side-effect free.
//
// A marker pins its entry FOREVER — it never ages out. PR-Codex R1 (5th-round PR gate)
// rejected time-based decay here: every debt marker is written by plan.md's fan-out
// IMMEDIATELY before the Workflow call that launches the agents, so a marker present
// after a controller death is evidence that real workers launched. Aging it out lets
// readCounter subtract those real launches (lease-expire the still-open reservation),
// which UNDER-counts the cap — the one over-permissive direction it must never err in,
// and with operational USD retired the cap is the primary backstop.
//
// The permanent pin is the CONSERVATIVE (over-count) choice. The self-poisoning it
// leaves — a dead-controller fan-out holding headroom for the rest of the session — is
// bounded, not permanent: the counter is session-keyed (readCounterRaw returns fresh on
// a different session key — see resolveSessionKey), so the next session resets it, and each incident pins
// at most fleetSize (≤4) of MCCP_ORCHESTRATION_MAX_AGENTS. A bounded, self-resetting
// liveness cost is the right price for never bypassing a safety cap.
function readDebtIds(opts) {
  let names = [];
  try {
    names = fs.readdirSync(getDebtDir(opts));
  } catch (_e) {
    return new Set();
  }
  const ids = new Set();
  for (let i = 0; i < names.length; i++) {
    if (names[i].slice(-5) === '.json') ids.add(names[i].slice(0, -5));
  }
  return ids;
}

// markDebt({ reservationId, n?, statePath?, stateDir? }) → boolean
// Lock-free, idempotent. Records that reservationId's workers ACTUALLY launched, so
// readCounter stops treating it as expirable. Best-effort: a marker we cannot write
// leaves the pre-existing (already conservative) pending entry alone.
function markDebt(opts) {
  opts = opts || {};
  const reservationId = opts.reservationId;
  if (typeof reservationId !== 'string' || !reservationId) return false;
  // Reject path separators — the id becomes a filename.
  if (/[\\/]/.test(reservationId)) return false;
  const dir = getDebtDir(opts);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, reservationId + '.json'), JSON.stringify({
      reservation_id: reservationId,
      n: (Number.isFinite(opts.n) && opts.n >= 0) ? Math.floor(opts.n) : null,
      at: new Date().toISOString(),
      note: 'workers launched but reconcile could not commit; never lease-expire this',
    }));
    return true;
  } catch (_e) {
    return false;
  }
}

function clearDebt(opts) {
  opts = opts || {};
  const reservationId = opts.reservationId;
  if (typeof reservationId !== 'string' || !reservationId) return false;
  if (/[\\/]/.test(reservationId)) return false;
  try {
    fs.unlinkSync(path.join(getDebtDir(opts), reservationId + '.json'));
    return true;
  } catch (_e) {
    return false;
  }
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
  // R1 F2 (5th round) — a debt-marked entry is KNOWN to have launched, so the
  // lease's guess ("pending this long means it never ran") is simply wrong about
  // it. Positive evidence beats the lease, same principle as reconcile reading raw
  // state to find its own id (Implement-Codex R1 F2).
  const debtIds = readDebtIds(opts);
  const live = [];
  let expiredN = 0;
  for (let i = 0; i < raw.open.length; i++) {
    const e = raw.open[i];
    if (isExpired(e, leaseMs, now) && !debtIds.has(e.id)) { expiredN += e.n; continue; }
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
// LOCK EXHAUSTION GRANTS 0 (PR-Codex R1 F1). An earlier revision granted 1 here and
// called it "fail-safe, not fail-open". It was fail-OPEN in the only sense that
// matters to a cap: no lock means no write, so that worker was never recorded and
// no reservationId existed to reconcile it later. readCounter would never see it.
// Repeated exhaustion therefore leaks one untracked launch per call and
// MCCP_ORCHESTRATION_MAX_AGENTS is bypassed without bound — at the exact point M3
// promotes this counter to the PRIMARY structural backstop. Granting launch
// permission that cannot be recorded breaks the cap's whole invariant.
//
// Waiting longer is not the answer: acquireLock already retries LOCK_RETRY_MAX
// times AND breaks locks older than STALE_LOCK_MS, so exhaustion means a LIVE
// holder held it through the entire window. Pre-recording the debt is impossible —
// that would need the lock we could not get.
//
// So: grant nothing. This does NOT block the pipeline. Both callers keep an inline
// fallback that launches no agent at all (work.md → inline implement, plan.md →
// inline Pattern Grounding), and inline consumes no cap. The invariant holds
// without exception: EVERY agent launch is recorded.
// resolveSessionKey(env) — the cap is session-keyed so a dead-controller pin resets on
// the NEXT session (readCounterRaw returns fresh {launched:0} on a different key). That
// reset is the whole reason a permanent debt pin is "bounded, not permanent". The
// Claude Code runtime exposes the session id as CLAUDE_CODE_SESSION_ID; the older
// CLAUDE_SESSION_ID this code used to read is NOT set by the CLI, so every reserve /
// reconcile / preview fell through to the 'unknown' constant — collapsing every run on a
// machine into ONE shared bucket that NEVER reset. A single pinned marker then exhausted
// the cap for all future runs (PR-Codex R1, 7th round). Prefer an explicit mccp override,
// then the real runtime var, then the legacy name, and only then the degraded shared
// bucket (genuinely session-less contexts, e.g. a bare `node` invocation).
function resolveSessionKey(env) {
  env = env || process.env;
  return env.MCCP_SESSION_ID || env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || 'unknown';
}

// resolveCliSession(args, env) — a CLI `--session ''` or the literal `--session unknown`
// is the shell's "no session" sentinel (`${CLAUDE_SESSION_ID:-unknown}` when the var is
// unset), never a real id. Treat it as absent and resolve from the environment, so a
// caller that still passes the old sentinel is keyed to the real session anyway (the fix
// holds even for a shell call site left un-migrated). A real explicit id always wins.
function resolveCliSession(args, env) {
  const passed = typeof args.session === 'string' ? args.session.trim() : '';
  if (passed && passed !== 'unknown') return passed;
  return resolveSessionKey(env || process.env);
}

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
    warn('counter lock exhausted; granting 0 workers (fail-CLOSED — a launch that ' +
      'cannot be recorded would bypass the cap, and the caller has an inline ' +
      'fallback that launches nothing).');
    return {
      granted: 0, degraded: true, reason: REASONS.LOCK_EXHAUSTED,
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
    // PR-Codex R1 F1 (5th round) — the cap is spent. Record NOTHING and grant
    // nothing: writing a 0-worker reservation would only add an entry for
    // reconcile to clean up, and granting 1 "so something runs" is exactly the
    // leak this finding closed (every post-cap call used to persist one more
    // launch, without bound). The caller falls back to inline, which launches no
    // agent and consumes no cap.
    if (decision.n === 0) {
      return {
        granted: 0, degraded: true, reason: decision.reason,
        maxAgents: maxAgents, launched: cur.launched,
        // Nothing was recorded, so there is nothing to reconcile later. A null id
        // keeps callers from inventing one.
        reservationId: null,
      };
    }
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
    // PR-Codex R1 (6th round) — the warn below promises "the lease will reclaim it if
    // nothing launched", but a debt marker pins the entry against exactly that lease.
    // plan.md pre-pins EVERY fan-out reservation immediately before the Workflow call,
    // so when the Workflow launches 0 agents (in-sandbox budget skip / tool absent) and
    // the commit then cannot take the lock, the pin is FALSE: it protects zero real
    // launches yet would over-count the phantom PERMANENTLY — the lease never reclaims a
    // pinned entry, and this is the only reconcile the reservation gets. actualN===0
    // asserts no real launches, so clear the pin lock-free (clearDebt needs no lock, the
    // one thing we just failed to get): the lease then reclaims the 0-launch phantom and
    // the permanent over-count degrades to a bounded one. Guard on the RAW opts value so
    // a non-finite input (coerced to 0 at the top) can never clear a real launch's pin.
    if (opts.actualN === 0) clearDebt({ reservationId: reservationId, statePath: p });
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
    // R1 F2 (5th round) — this write PERSISTS the pruning of the other entries, so
    // it must honor debt markers exactly as readCounter does. Otherwise reconciling
    // reservation A would quietly evict B's known-launched workers.
    const debtIds = readDebtIds({ statePath: p });
    const liveOthers = [];
    let expiredN = 0;
    for (let i = 0; i < others.length; i++) {
      if (isExpired(others[i], leaseMs, now) && !debtIds.has(others[i].id)) {
        expiredN += others[i].n; continue;
      }
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
    // The entry is committed (out of `open[]`, permanent, no longer expirable), so
    // any debt marker pinning it has done its job.
    clearDebt({ reservationId: reservationId, statePath: p });
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
//                   PR-Codex R1 F2 (5th round): exit 11 alone was not enough. The
//                   callers that "warn and proceed" (fan-out must never block a
//                   plan) still left the launches expirable, so the under-count
//                   happened anyway ~10 min later. The CLI now also writes a DEBT
//                   MARKER, which pins the entry against the lease regardless of
//                   what the caller does with the exit code.
//
// --actual IS VALIDATED BEFORE reconcileReservation IS CALLED (PR-Codex R1 F3).
// It used to go straight through `Number(args.actual)`, so a malformed invocation
// silently corrupted the counter and reported success:
//   --actual omitted        → Number(undefined) = NaN → reconcileReservation coerces
//                             non-finite to 0 → the WHOLE reservation is subtracted
//                             and committed → slots handed back → exit 0.
//   --actual --session x    → args.actual === true → Number(true) = 1 → the count
//                             becomes 1 regardless of reality.
// Both under-count real launches — the over-permissive direction this cap must
// never err in — and the exit-11 guard below could not catch them, because it
// requires Number.isFinite(actualN) and NaN slips past. Reject up front instead:
// an invalid count means we do not know the answer, and the reservation must be
// left untouched (pending → the lease resolves it) rather than guessed at.
const EXIT_RECONCILE_UNCOMMITTED = 11;
const EXIT_USAGE = 2;

// parseActualN(raw) → non-negative integer | null. `true` is the valueless-flag
// form (`--actual --session x`) and is invalid, not 1.
function parseActualN(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

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
  if (cmd === 'reserve') return cliReserve(args);
  if (cmd === 'mark-debt') return cliMarkDebt(args);
  if (cmd !== 'reconcile') {
    process.stderr.write('usage: orchestration-runaway.js reconcile --reservation <id> ' +
      '--actual <n> [--session <id>] [--state-path <path>]\n' +
      '       orchestration-runaway.js reserve --n <n> [--session <id>] [--state-path <path>]\n' +
      '       orchestration-runaway.js mark-debt --reservation <id> [--n <n>] [--state-path <path>]\n');
    return EXIT_USAGE;
  }
  const actualN = parseActualN(args.actual);
  if (actualN === null) {
    warn('--actual must be a non-negative integer (the number of workers that ' +
      'ACTUALLY launched); got ' + JSON.stringify(args.actual) + '. The reservation ' +
      'was left untouched — it stays pending (counted, conservative) and the lease ' +
      'reclaims it if nothing launched. Re-run with a real count.');
    return EXIT_USAGE;
  }
  const statePath = typeof args['state-path'] === 'string' ? args['state-path'] : undefined;
  const out = reconcileReservation({
    sessionId: resolveCliSession(args, process.env),
    reservationId: typeof args.reservation === 'string' ? args.reservation : null,
    actualN: actualN,
    statePath: statePath,
  });
  process.stdout.write(JSON.stringify(out) + '\n');
  if (!out.reconciled && actualN > 0) {
    // PR-Codex R1 F2 (5th round) — we KNOW actualN workers launched and we could
    // not commit that. Leaving the entry merely pending hands it to the lease,
    // which subtracts it as "never ran" and under-counts the cap. Pin it instead:
    // a debt marker is lock-free (the lock is exactly what we could not get) and
    // stops the expiry. The error direction becomes a conservative over-count,
    // which is the only direction a cap may err in.
    const pinned = markDebt({
      reservationId: typeof args.reservation === 'string' ? args.reservation : null,
      n: actualN, statePath: statePath,
    });
    warn('reservation ' + args.reservation + ' could NOT be committed while actual=' +
      actualN + ' worker(s) launched. ' + (pinned
        ? 'Pinned with a debt marker — the lease will NOT drop them, so the cap stays ' +
          'conservative (over-counted) until a later reconcile commits it.'
        : 'AND the debt marker could not be written — these launches may be dropped by ' +
          'the lease and under-count the cap. Investigate the state dir permissions.') +
      ' Do NOT delete the reservation token; retry, and halt if it keeps failing.');
    return EXIT_RECONCILE_UNCOMMITTED;
  }
  return 0;
}

// cliReserve — the atomic check-and-bump exposed for the COMMON pre-launch boundary
// (Implement-Codex R1 F1, 7th round). Until now `reserveWorkers` was reachable only
// through resolveFleet's injected runawayClamp, and resolveFleet itself runs only
// behind work.md's 4-way parallel guard (ISOLATE≠0 ∧ PARALLEL≠off ∧
// merge-strategy=worktree-merge ∧ partitions). Every single-worker route —
// PARALLEL=off, merge-strategy disabled, single-partition, budget-insufficient —
// launched a worker that the cap NEVER counted, so "every agent launch is recorded"
// was false by construction and the cap only ever bounded parallel fleets.
//
// Step 3.route calls this when no fleet reservation exists and the route launches a
// worker. granted 0 → the caller must go inline (a launch we cannot record is not
// permitted). Always exits 0: `granted` is the answer, not an error condition.
function cliReserve(args) {
  const n = parseActualN(args.n);
  if (n === null || n < 1) {
    warn('--n must be a positive integer (the number of workers about to launch); got ' +
      JSON.stringify(args.n) + '. Nothing was reserved.');
    return EXIT_USAGE;
  }
  const out = reserveWorkers({
    sessionId: resolveCliSession(args, process.env),
    requestedN: n,
    env: process.env,
    statePath: typeof args['state-path'] === 'string' ? args['state-path'] : undefined,
  });
  process.stdout.write(JSON.stringify(out) + '\n');
  return 0;
}

// cliMarkDebt — pin a reservation BEFORE the launch that it accounts for
// (Implement-Codex R1 F2, 7th round). plan.md's fan-out has no pre-launch boundary:
// the Workflow call IS the launch. Writing the pin only AFTER the call returns leaves
// a window where the controller dies mid-flight and the lease later prunes real
// launches — readCounter honours debt markers, and nothing else. Pinning first closes
// the window; a failed write means the caller must NOT launch.
function cliMarkDebt(args) {
  const reservationId = typeof args.reservation === 'string' ? args.reservation : null;
  if (!reservationId) {
    warn('--reservation <id> is required.');
    return EXIT_USAGE;
  }
  const n = parseActualN(args.n);
  const ok = markDebt({
    reservationId: reservationId,
    n: n === null ? undefined : n,
    statePath: typeof args['state-path'] === 'string' ? args['state-path'] : undefined,
  });
  if (!ok) {
    warn('could not write a debt marker for reservation ' + reservationId + '. The ' +
      'caller MUST NOT launch: without the pin, a crash before reconcile lets the ' +
      'lease drop real launches and under-count the cap.');
    return EXIT_RECONCILE_UNCOMMITTED;
  }
  process.stdout.write(JSON.stringify({ pinned: true, reservation_id: reservationId }) + '\n');
  return 0;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  clampForRunaway: clampForRunaway,
  reserveWorkers: reserveWorkers,
  reconcileReservation: reconcileReservation,
  resolveSessionKey: resolveSessionKey,
  resolveCliSession: resolveCliSession,
  runCli: runCli,
  parseActualN: parseActualN,
  parseReservationLease: parseReservationLease,
  parseMaxAgents: parseMaxAgents,
  parseUsdBomb: parseUsdBomb,
  parseCatastrophicUsd: parseCatastrophicUsd,
  readCounter: readCounter,
  readCounterRaw: readCounterRaw,
  bumpCounter: bumpCounter,
  getRunawayPath: getRunawayPath,
  getDebtDir: getDebtDir,
  readDebtIds: readDebtIds,
  markDebt: markDebt,
  clearDebt: clearDebt,
  REASONS: REASONS,
  ENV_MAX_AGENTS: ENV_MAX_AGENTS,
  DEFAULT_MAX_AGENTS: DEFAULT_MAX_AGENTS,
  ENV_USD_BOMB: ENV_USD_BOMB,
  ENV_CATASTROPHIC_USD: ENV_CATASTROPHIC_USD,
  DEFAULT_CATASTROPHIC_USD: DEFAULT_CATASTROPHIC_USD,
  ENV_RESERVATION_LEASE_MS: ENV_RESERVATION_LEASE_MS,
  DEFAULT_RESERVATION_LEASE_MS: DEFAULT_RESERVATION_LEASE_MS,
};
