'use strict';

// Plan v0.2.2 R2#1 — cost-current.json writer with lockfile + monotonic merge.
//
// Invariants:
//   1. Canonical path: getCostStateDir() — both file and lock here, never cwd-relative.
//   2. Monotonic merge is UNCONDITIONAL — sticky safety fields (hard_ceiling_reached,
//      cost_usd MAX) merge regardless of timestamp. Only last_write_ts uses max().
//      This means a stale "hard_ceiling=true" event ARRIVING AFTER a "false" event
//      still sets the final state to true. Codex R2#1 explicitly required this.
//   3. Lockfile is `wx` (O_EXCL) create-or-fail. Spin retry 5 × 20ms = 100ms total
//      max wait. On exhaustion → conservative abort (do not write).
//
// Schema fields:
//   cost_usd            number  current cumulative cost
//   threshold_tier      string  'green' | 'notice' | 'warning' | 'critical'
//   hard_ceiling_reached boolean sticky true (R2#1 unconditional merge)
//   last_write_ts       number  epoch ms

const fs = require('fs');
const path = require('path');
const {
  getCostStateDir,
  getCostStatePath,
  getCostStateLockPath,
} = require('./cost-state-path');
const { getHandoffCostThresholds } = require('./cost-thresholds');

const LOCK_RETRY_MAX = 5;
const LOCK_RETRY_MS = 20;
const STALE_LOCK_MS = 5_000;

// v0.3.0 — 50/80/100 literals migrated to cost-thresholds.js (architecture
// §4 "Cost-threshold source of truth"). tierFor reads thresholds per call
// so MCCP_HANDOFF_THRESHOLDS_USD env override is honored without reload.
function tierFor(costUsd) {
  if (!Number.isFinite(costUsd)) return 'green';
  const t = getHandoffCostThresholds();
  if (costUsd >= t.critical) return 'critical';
  if (costUsd >= t.warning) return 'warning';
  if (costUsd >= t.notice) return 'notice';
  return 'green';
}

function ensureDir() {
  fs.mkdirSync(getCostStateDir(), { recursive: true });
}

function readState() {
  const p = getCostStatePath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      cost_usd: Number.isFinite(parsed.cost_usd) ? parsed.cost_usd : 0,
      threshold_tier: parsed.threshold_tier || 'green',
      hard_ceiling_reached: parsed.hard_ceiling_reached === true,
      last_write_ts: Number.isFinite(parsed.last_write_ts) ? parsed.last_write_ts : 0,
    };
  } catch (err) {
    // Corrupt file — treat as missing for safety reads; writers detect via separate path
    return null;
  }
}

function readStateOrThrow() {
  const p = getCostStatePath();
  if (!fs.existsSync(p)) {
    const e = new Error('cost-current.json missing at ' + p);
    e.code = 'COST_STATE_MISSING';
    throw e;
  }
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed;
}

function getStateMtimeMs() {
  const p = getCostStatePath();
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function acquireLock() {
  const lockPath = getCostStateLockPath();
  ensureDir();
  for (let i = 0; i < LOCK_RETRY_MAX; i++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return lockPath;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Stale lock? If older than STALE_LOCK_MS, break it.
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch { /* race; retry */ }
      // Synchronous busy-wait — keep micro to avoid blocking PostToolUse hook
      const start = Date.now();
      while (Date.now() - start < LOCK_RETRY_MS) { /* spin */ }
    }
  }
  return null; // exhausted
}

function releaseLock(lockPath) {
  if (!lockPath) return;
  try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
}

function mergeMonotonic(prev, update) {
  // R2#1: hard_ceiling_reached + cost_usd merge UNCONDITIONALLY (no ts gating).
  // Only last_write_ts uses max() — a stale-ts event still updates safety fields.
  const merged = {
    hard_ceiling_reached: (prev && prev.hard_ceiling_reached === true) ||
                          update.hard_ceiling_reached === true,
    cost_usd: Math.max(
      (prev && Number.isFinite(prev.cost_usd)) ? prev.cost_usd : 0,
      Number.isFinite(update.cost_usd) ? update.cost_usd : 0
    ),
    last_write_ts: Math.max(
      (prev && Number.isFinite(prev.last_write_ts)) ? prev.last_write_ts : 0,
      Number.isFinite(update.last_write_ts) ? update.last_write_ts : Date.now()
    ),
  };
  merged.threshold_tier = tierFor(merged.cost_usd);
  if (merged.hard_ceiling_reached) merged.threshold_tier = 'critical';
  return merged;
}

function writeStateMerged(update) {
  const lock = acquireLock();
  if (!lock) {
    // Conservative abort — caller should treat unwritten state as "no telemetry"
    // which auto-chain.js handles as abort by design.
    return { ok: false, reason: 'lock-exhausted' };
  }
  try {
    const prev = readState();
    const merged = mergeMonotonic(prev, update);
    const target = getCostStatePath();
    const tmp = target + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, target);
    return { ok: true, state: merged };
  } catch (err) {
    return { ok: false, reason: 'write-error: ' + err.message };
  } finally {
    releaseLock(lock);
  }
}

function isStale(maxAgeMs) {
  const mtime = getStateMtimeMs();
  if (!mtime) return true;
  // R2/R3#3 fix: now > mtime → positive age. stale if age > maxAgeMs.
  const age = Date.now() - mtime;
  return age > maxAgeMs;
}

module.exports = {
  tierFor: tierFor,
  readState: readState,
  readStateOrThrow: readStateOrThrow,
  writeStateMerged: writeStateMerged,
  mergeMonotonic: mergeMonotonic,
  isStale: isStale,
  acquireLock: acquireLock,
  releaseLock: releaseLock,
  STALE_LOCK_MS: STALE_LOCK_MS,
};
