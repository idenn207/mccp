'use strict';

const fs = require('fs');
const path = require('path');

const envelope = require('../../lib/dispatch-envelope');
const dispatchController = require('../../lib/dispatch-controller');

const TERMINAL_STATUSES = ['ok', 'failure', 'timeout', 'crashed'];
const ENVELOPE_SUFFIX = '.envelope.json';
const HEARTBEAT_SUFFIX = '.heartbeat';

function isPlainFile(filePath) {
  let lst;
  try { lst = fs.lstatSync(filePath); } catch { return false; }
  if (lst.isSymbolicLink()) return false;
  return lst.isFile();
}

function heartbeatStaleness(envelopePath, ttlMs) {
  const hbPath = envelopePath + HEARTBEAT_SUFFIX;
  if (!fs.existsSync(hbPath)) return { heartbeat_path: hbPath, heartbeat_age_ms: null, stale: false };
  let stat;
  try { stat = fs.statSync(hbPath); } catch { return { heartbeat_path: hbPath, heartbeat_age_ms: null, stale: false }; }
  const ageMs = Date.now() - stat.mtimeMs;
  return { heartbeat_path: hbPath, heartbeat_age_ms: ageMs, stale: ageMs > ttlMs };
}

function scanEnvelopes(repoRoot, opts) {
  opts = opts || {};
  const ttlMs = typeof opts.heartbeatTtlMs === 'number'
    ? opts.heartbeatTtlMs
    : dispatchController.HEARTBEAT_TTL_DEFAULT_MS;
  const dir = path.join(repoRoot, '.claude', 'state', 'dispatches');
  if (!fs.existsSync(dir)) {
    return { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null };
  }
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    return { ok: false, count: 0, items: [], invalid_count: 0, degraded: false, error: err.message };
  }
  const items = [];
  let invalidCount = 0;
  for (const f of entries) {
    if (!f.endsWith(ENVELOPE_SUFFIX)) continue;
    const full = path.join(dir, f);
    if (!isPlainFile(full)) continue;
    const result = envelope.read(full);
    if (!result.ok) {
      invalidCount += 1;
      items.push({
        ok: false,
        path: path.relative(repoRoot, full),
        error: result.error,
      });
      continue;
    }
    const env = result.envelope;
    const hb = heartbeatStaleness(full, ttlMs);
    items.push({
      ok: true,
      dispatch_id: env.dispatch_id,
      worker_subagent_type: env.worker_subagent_type,
      worker_started_at: env.worker_started_at,
      worker_ended_at: env.worker_ended_at,
      worker_exit_status: env.worker_exit_status,
      controller_session_id: env.controller_session_id,
      parent_cwd: env.parent_cwd,
      receipts_added: env.receipts_added || [],
      finding_count: (env.findings || []).length,
      heartbeat_path: path.relative(repoRoot, hb.heartbeat_path),
      heartbeat_age_ms: hb.heartbeat_age_ms,
      stale: hb.stale,
      is_terminal: TERMINAL_STATUSES.indexOf(env.worker_exit_status) !== -1,
      path: path.relative(repoRoot, full),
    });
  }
  return {
    ok: true,
    count: items.length,
    items,
    invalid_count: invalidCount,
    degraded: invalidCount > 0,
    error: null,
  };
}

module.exports = {
  scanEnvelopes,
};
