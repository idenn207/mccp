'use strict';

/**
 * Harness-cost cache contract (cost-model-subscription M2 — Axis A).
 *
 * The Claude Code runtime passes the authoritative per-process session cost to
 * the statusLine as `cost.total_cost_usd`. ecc-statusline.js writes it to a
 * per-session cache file on each render; cost-tracker.js (Stop) and
 * ecc-context-monitor.js (PostToolUse) read it back so cost accounting and
 * agent-facing warnings converge on real billed cost instead of the inflated
 * transcript-sum estimate.
 *
 * File: <os.tmpdir()>/harness-cost-<sessionId>.json  →  { ts, cost_usd }
 *   ts       epoch SECONDS (Number) — cost-sample time
 *   cost_usd cumulative USD (Number, ≥ 0)
 *
 * Single-validator design (Implement-Codex F4): readHarnessCostRecord is the
 * ONE place that validates the cache (existence, JSON, finite ts + cost,
 * non-negative cost, age within [0, maxAge]). readHarnessCost (number, kept
 * for cost-tracker back-compat) and readHarnessCostMeta ({cost_usd, ts}) are
 * thin adapters over it, so the two public read paths can never drift on what
 * counts as a valid / stale / future / corrupt cache.
 *
 * Core-module-only (fs / os / path / crypto); no external deps. crypto is used
 * solely for the unique tmp nonce, mirroring writeWarnState / writeBridgeAtomic.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @param {string} sessionId - already-sanitized session id
 * @returns {string} the cache file path (identical string to the legacy
 *   cost-tracker inline path so existing caches stay readable)
 */
function getHarnessCostPath(sessionId) {
  return path.join(os.tmpdir(), `harness-cost-${sessionId}.json`);
}

/**
 * Single validator (F4 SoT). Reads + fully validates the cache record.
 * @param {string} sessionId
 * @param {number} maxAgeSeconds
 * @returns {{cost_usd: number, ts: number}|null} null on miss / stale / future
 *   / corrupt / non-finite / negative-cost.
 */
function readHarnessCostRecord(sessionId, maxAgeSeconds) {
  if (!sessionId) return null;
  try {
    const fp = getHarnessCostPath(sessionId);
    if (!fs.existsSync(fp)) return null;
    const obj = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const ts = Number(obj && obj.ts);
    const cost = Number(obj && obj.cost_usd);
    if (!Number.isFinite(ts) || !Number.isFinite(cost) || cost < 0) return null;
    const age = Math.floor(Date.now() / 1000) - ts;
    if (age < 0 || age > maxAgeSeconds) return null; // future OR stale → reject
    return { cost_usd: cost, ts: ts };
  } catch {
    return null;
  }
}

/**
 * Back-compat adapter: cost value only (cost-tracker expects number|null).
 * @param {string} sessionId
 * @param {number} maxAgeSeconds
 * @returns {number|null}
 */
function readHarnessCost(sessionId, maxAgeSeconds) {
  const rec = readHarnessCostRecord(sessionId, maxAgeSeconds);
  return rec ? rec.cost_usd : null;
}

/**
 * Meta adapter: exposes the cost-sample ts for the freshness guard
 * (Implement-Codex F1). Shape locked to { cost_usd, ts }.
 * @param {string} sessionId
 * @param {number} maxAgeSeconds
 * @returns {{cost_usd: number, ts: number}|null}
 */
function readHarnessCostMeta(sessionId, maxAgeSeconds) {
  return readHarnessCostRecord(sessionId, maxAgeSeconds);
}

/**
 * Best-effort atomic write of the cache (pid+nonce tmp → rename, mirror of
 * writeWarnState / writeBridgeAtomic). Never throws — returns { ok }. No-op on
 * falsy sessionId or non-finite / negative cost.
 * @param {string} sessionId
 * @param {number} costUsd
 * @returns {{ok: boolean}}
 */
function writeHarnessCost(sessionId, costUsd) {
  if (!sessionId) return { ok: false };
  const cost = Number(costUsd);
  if (!Number.isFinite(cost) || cost < 0) return { ok: false };
  const target = getHarnessCostPath(sessionId);
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    const payload = JSON.stringify({ ts: Math.floor(Date.now() / 1000), cost_usd: cost });
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, target);
    return { ok: true };
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    return { ok: false };
  }
}

module.exports = {
  getHarnessCostPath,
  readHarnessCostRecord,
  readHarnessCost,
  readHarnessCostMeta,
  writeHarnessCost,
};
