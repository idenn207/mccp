'use strict';

const fs = require('fs');
const path = require('path');

const envelope = require('../../lib/dispatch-envelope');
const dispatchController = require('../../lib/dispatch-controller');
const { maskSecrets } = require('../mask');

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
    // v1.3.0-m4 Task 5 (Codex Plan-Codex R1 F3 absorption) — scan envelope
    // payload strings (next_action, findings[*], receipts_added[*]) for
    // secret patterns at source-scan time. The raw payload strings are
    // INTENTIONALLY NOT stored in the model — only the hit metadata
    // (kind/count/field) flows through to mask_hits. This preserves the M1
    // surface frozen invariant via additive field (`masked_payload_signal`)
    // while letting the verdict step 1.5 banner attribute by dispatch_id.
    const payloadHits = [];
    function scanField(value, fieldName) {
      if (value === null || value === undefined) return;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const r = maskSecrets(text, {
        fieldName: fieldName,
        sourceKind: 'envelope',
      });
      for (const h of r.hits) payloadHits.push(h);
    }
    scanField(env.next_action, 'next_action');
    const findingsArr = Array.isArray(env.findings) ? env.findings : [];
    for (let fi = 0; fi < findingsArr.length; fi++) {
      scanField(findingsArr[fi], 'findings[' + fi + ']');
    }
    const recAdded = Array.isArray(env.receipts_added) ? env.receipts_added : [];
    for (let ri = 0; ri < recAdded.length; ri++) {
      scanField(recAdded[ri], 'receipts_added[' + ri + ']');
    }
    const maskHitCount = payloadHits.reduce(function (acc, h) { return acc + h.count; }, 0);
    const maskKinds = Array.from(new Set(payloadHits.map(function (h) { return h.kind; })));
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
      masked_payload_signal: {
        mask_hit_count: maskHitCount,
        mask_kinds: maskKinds,
        hits: payloadHits,
      },
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
