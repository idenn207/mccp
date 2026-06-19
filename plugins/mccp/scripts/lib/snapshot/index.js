'use strict';

// v1.3.0-m5 — daily snapshot writer + 30-day retention.
//
// Public surface:
//   writeSnapshotIfNeeded(model, opts = {}) → { written, path, evicted, error }
//
// Loud fail-open contract per [[feedback-loud-fail-open]]:
//   - NEVER throws into the caller. Outer try/catch absorbs all errors.
//   - On any failure, writes a loud stderr line tagged "[mccp:snapshot]"
//     with "(allow)" suffix and returns the result struct with error set.
//
// Codex Implement-Codex R1 absorption notes:
//   - F1 receipt_hash + dispatched_by_controller_session_id alignment:
//     projection reads the canonical field names already surfaced by
//     derive/sources/receipts.js (v1.3.0-m5 add: receipt_hash). De-dup
//     identity in audit-timeline.js uses gate_id + decision_id + receipt_hash
//     with created_at fallback.
//   - F3 .last-render.json field is `render_at` (not `derived_at`).
//   - F4 retention runs whenever the snapshots directory exists, regardless
//     of write eligibility. Empty-state short-circuit only skips creating
//     today's snapshot, not cleaning old ones.
//
// Filename-based retention contract:
//   - Snapshots live at <repoRoot>/.claude/cache/snapshots/YYYY-MM-DD.json.
//   - Date arithmetic uses filename parse + Date.UTC, NOT fs.statSync mtime.
//     mtime would race with archival branches that resurrect old snapshots.
//   - Window: today minus 30 calendar days (RETENTION_DAYS).
//   - Skew guard (a): future-dated files (>today+1d) are NEVER unlinked.
//   - Skew guard (b): if cutoff > .last-render.json `render_at`, abort
//     eviction (clock-skew suspect — new write still proceeds).
//
// Always-mask invariant:
//   - Snapshot content is masked even when the input model has
//     `model.masked === false` (--raw derive). Snapshots outlive the
//     session that wrote them and must be share-safe.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { applySecretMask, applyPathMask } = require('../../derive/mask');

const SNAPSHOT_SCHEMA_VERSION = 'snapshot-v1';
const SNAPSHOTS_SUBDIR = path.join('.claude', 'cache', 'snapshots');
const LAST_RENDER_SUBPATH = path.join('.claude', 'cache', '.last-render.json');
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_DAYS = 1;
const FILENAME_RE = /^(\d{4})-(\d{2})-(\d{2})\.json$/;

function stderr(line) { process.stderr.write(line + '\n'); }

function todayUtcYmd() { return new Date().toISOString().slice(0, 10); }

function ymdToUtcMs(ymd) {
  const y = parseInt(ymd.slice(0, 4), 10);
  const mo = parseInt(ymd.slice(5, 7), 10) - 1;
  const d = parseInt(ymd.slice(8, 10), 10);
  return Date.UTC(y, mo, d);
}

function parseFilenameDate(name) {
  const m = FILENAME_RE.exec(name);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const ts = Date.UTC(y, mo, d);
  return Number.isFinite(ts) ? ts : null;
}

function readLastRenderMs(repoRoot) {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, LAST_RENDER_SUBPATH), 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.render_at !== 'string') return null;
    const ms = Date.parse(obj.render_at);
    return Number.isFinite(ms) ? ms : null;
  } catch (_) {
    return null;
  }
}

function evictSnapshots(snapshotsDir, todayMs, lastRenderMs) {
  const evicted = [];
  let entries;
  try { entries = fs.readdirSync(snapshotsDir); }
  catch (_) { return evicted; }

  const cutoffMs = todayMs - (RETENTION_DAYS * DAY_MS);
  const futureCutoffMs = todayMs + (FUTURE_TOLERANCE_DAYS * DAY_MS);

  // F3 skew guard (b): cutoff must not be in the future relative to last
  // observed render. If it is, the host clock is suspect — skip eviction
  // entirely. The new snapshot write still proceeds.
  if (lastRenderMs !== null && cutoffMs > lastRenderMs) {
    stderr('[mccp:snapshot] cutoff > last-render.render_at — eviction aborted (clock-skew suspect)');
    return evicted;
  }

  for (const name of entries) {
    const ts = parseFilenameDate(name);
    if (ts === null) continue;
    // F3 skew guard (a): never unlink files dated past today + tolerance.
    if (ts > futureCutoffMs) {
      stderr('[mccp:snapshot] future-dated ' + name.replace(/\.json$/, '')
        + ' detected — eviction skipped (allow)');
      continue;
    }
    if (ts < cutoffMs) {
      const full = path.join(snapshotsDir, name);
      try { fs.unlinkSync(full); evicted.push(name); }
      catch (err) {
        stderr('[mccp:snapshot] evict ' + name.replace(/\.json$/, '')
          + ' failed: ' + (err && err.message) + ' (allow)');
      }
    }
  }
  return evicted;
}

function projectReceipt(r) {
  if (!r || r.ok === false) return null;
  return {
    gate_id: r.gate || r.gate_id || null,
    decision_id: r.decision_id || null,
    created_at: r.created_at || null,
    converged: !!r.converged,
    receipt_hash: r.receipt_hash || null,
    briefing_summary: r.briefing_summary || null,
    briefing_token_count: typeof r.briefing_token_count === 'number'
      ? r.briefing_token_count : null,
    briefing_invocation_count: typeof r.briefing_invocation_count === 'number'
      ? r.briefing_invocation_count : null,
    codex_skipped_at_pr: !!r.codex_skipped_at_pr,
    codex_skip_reason: r.codex_skip_reason || null,
    codex_dedupe_at_pr: !!r.codex_dedupe_at_pr,
    ipc_envelope_path: r.ipc_envelope_path || null,
    dispatched_by_controller_session_id: r.dispatched_by_controller_session_id || null,
    worker_dispatch_id: r.worker_dispatch_id || null,
  };
}

function projectEnvelope(e) {
  if (!e || e.ok === false) return null;
  return {
    dispatch_id: e.dispatch_id || null,
    status: e.status || null,
    started_at: e.started_at || null,
    ended_at: e.ended_at || null,
    parent_session_id: e.parent_session_id || null,
    error: e.error || null,
  };
}

function buildPayload(model, todayYmd) {
  const s = model.sources || {};
  const receiptItems = (s.receipts && s.receipts.items) || [];
  const envelopeItems = (s.envelopes && s.envelopes.items) || [];
  const receipts = receiptItems.map(projectReceipt).filter(Boolean);
  const envelopes = envelopeItems.map(projectEnvelope).filter(Boolean);
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    snapshot_date: todayYmd,
    derived_at: model.derived_at || null,
    model_version: model.schema_version || null,
    counts: {
      plans: (s.plans && s.plans.count) || 0,
      receipts: (s.receipts && s.receipts.count) || 0,
      state: s.state && s.state.item ? 1 : 0,
      backlog: (s.backlog && s.backlog.count) || 0,
      fix_task: s.fix_task && s.fix_task.item ? 1 : 0,
      pr: s.pr && s.pr.item ? 1 : 0,
      envelopes: (s.envelopes && s.envelopes.count) || 0,
      correlations: (model.correlations || []).length,
      warnings: (model.warnings || []).length,
    },
    receipts: receipts,
    envelopes: envelopes,
    m0_capability: {
      contract_present: model.m0_capability
        ? !!model.m0_capability.contract_present : null,
    },
  };
}

function uniqueTmp(target) {
  return target + '.' + process.pid + '-'
    + crypto.randomBytes(4).toString('hex') + '.tmp';
}

function ensureMasked(model, repoRoot) {
  // Snapshot must be share-safe regardless of `model.masked`. If the model
  // was derived with --raw, re-apply both secret + path mask before write.
  // Masking is idempotent (maskPath('<repo>') → '<repo>'), so re-masking an
  // already-masked model is a no-op.
  const cloned = JSON.parse(JSON.stringify(model || {}));
  applySecretMask(cloned);
  applyPathMask(cloned, repoRoot || cloned.repo_root || process.cwd());
  return cloned;
}

function writeSnapshotIfNeeded(model, opts) {
  opts = opts || {};
  const out = { written: false, path: null, evicted: [], error: null };

  try {
    if (opts._injectFsThrow === true) throw new Error('injected fs throw');

    if (!model || typeof model !== 'object') {
      out.error = 'model missing';
      stderr('[mccp:snapshot] writeSnapshotIfNeeded: model missing (allow)');
      return out;
    }

    // Resolve repoRoot. derive() returns model.repo_root='<repo>' in masked
    // mode (default). For snapshot we need a real filesystem path — caller
    // (trigger.js / cli.js) passes opts.repoRoot. As a fallback, use cwd.
    const repoRoot = opts.repoRoot
      || (typeof model.repo_root === 'string'
          && model.repo_root !== '<repo>'
          && path.isAbsolute(model.repo_root) ? model.repo_root : null)
      || process.cwd();
    const snapshotsDir = path.join(repoRoot, SNAPSHOTS_SUBDIR);

    const todayYmd = opts._todayYmd || todayUtcYmd();
    const todayMs = typeof opts._todayMs === 'number'
      ? opts._todayMs : ymdToUtcMs(todayYmd);

    // F3 skew guard support — test injection lets us drive the last-render
    // path without writing a real .last-render.json.
    let lastRenderMs;
    if (opts._injectStaleLastRender === true) {
      lastRenderMs = todayMs - (RETENTION_DAYS + 365) * DAY_MS;
    } else if (typeof opts._lastRenderMs === 'number') {
      lastRenderMs = opts._lastRenderMs;
    } else {
      lastRenderMs = readLastRenderMs(repoRoot);
    }

    // F4 absorption: retention always runs when the directory exists,
    // regardless of write eligibility. This stops stale snapshots from
    // surviving past the 30-day window in zero-activity-day repos.
    if (fs.existsSync(snapshotsDir)) {
      out.evicted = evictSnapshots(snapshotsDir, todayMs, lastRenderMs);
    }

    // Write eligibility check (after retention runs).
    const receiptsCount = (model.sources && model.sources.receipts
      && model.sources.receipts.count) || 0;
    const envelopesCount = (model.sources && model.sources.envelopes
      && model.sources.envelopes.count) || 0;
    if (receiptsCount === 0 && envelopesCount === 0) {
      return out; // written stays false, evicted preserved
    }

    try { fs.mkdirSync(snapshotsDir, { recursive: true }); }
    catch (err) {
      out.error = 'mkdir failed: ' + (err && err.message);
      stderr('[mccp:snapshot] mkdir failed: ' + (err && err.message) + ' (allow)');
      return out;
    }

    const finalPath = path.join(snapshotsDir, todayYmd + '.json');
    if (fs.existsSync(finalPath)) {
      // Idempotent: today's snapshot already exists; second call same UTC
      // day is a no-op. Surface the path so caller can introspect.
      out.path = finalPath;
      return out;
    }

    const maskedModel = ensureMasked(model, repoRoot);
    const payload = buildPayload(maskedModel, todayYmd);
    const content = JSON.stringify(payload, null, 2) + '\n';

    const tmpPath = uniqueTmp(finalPath);
    try {
      fs.writeFileSync(tmpPath, content, 'utf8');
      fs.renameSync(tmpPath, finalPath);
      out.written = true;
      out.path = finalPath;
      stderr('[mccp:snapshot] write ' + todayYmd + ' ok');
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      out.error = 'write failed: ' + (err && err.message);
      stderr('[mccp:snapshot] write ' + todayYmd + ' failed: '
        + (err && err.message) + ' (allow)');
      return out;
    }

    return out;
  } catch (err) {
    out.error = (err && err.message) || 'unknown';
    stderr('[mccp:snapshot] writeSnapshotIfNeeded failed: '
      + out.error + ' (allow)');
    return out;
  }
}

module.exports = {
  writeSnapshotIfNeeded,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOTS_SUBDIR,
  RETENTION_DAYS,
  FILENAME_RE,
  // Test-exposed internals.
  _projectReceipt: projectReceipt,
  _projectEnvelope: projectEnvelope,
  _buildPayload: buildPayload,
  _parseFilenameDate: parseFilenameDate,
  _ymdToUtcMs: ymdToUtcMs,
  _evictSnapshots: evictSnapshots,
};
