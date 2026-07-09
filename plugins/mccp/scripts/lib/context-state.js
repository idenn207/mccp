'use strict';

// cost-model-subscription M1 — context overflow snapshot (context-current.json).
//
// The subscription overflow axis (subscription.js#evaluateOverflow) reads this
// snapshot. Written best-effort by ecc-context-monitor on every PostToolUse from
// the metrics bridge (context_remaining_pct + tool_count).
//
// Mirrors cost-state.js (read/isStale) + ecc-context-monitor.js#writeWarnState
// (pid+nonce unique-tmp atomic rename, NO lockfile — best-effort telemetry).
//
// DELIBERATE DIFFERENCE from cost-state.js: NOT monotonic-sticky. context% both
// rises (compaction/free) and falls, and tool_count rises, so this is a
// latest-wins snapshot. Out-of-order clobber is prevented by rejecting a write
// whose data is OLDER than what is stored — ordered by tool_count when present
// (monotonic), else by context_ts write time (Codex F2 absorption).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getCostStateDir } = require('./cost-state-path');

const CONTEXT_STATE_FILENAME = 'context-current.json';

function statePath(dir) {
  return path.join(dir || getCostStateDir(), CONTEXT_STATE_FILENAME);
}

// readState(opts?) → { context_remaining_pct, tool_count, context_ts } | null.
// Parse failure / missing → null (mirror cost-state.readState). opts.dir tests.
function readState(opts) {
  opts = opts || {};
  const p = statePath(opts.dir);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      context_remaining_pct: Number.isFinite(parsed.context_remaining_pct) ? parsed.context_remaining_pct : null,
      tool_count: Number.isFinite(parsed.tool_count) ? parsed.tool_count : null,
      context_ts: Number.isFinite(parsed.context_ts) ? parsed.context_ts : 0,
    };
  } catch (_e) {
    return null;
  }
}

// isOlderSample(incoming, prev) — true when `incoming` is strictly older data
// than `prev` and must NOT clobber it (Codex F2). tool_count is the monotonic
// ordering key (every PostToolUse increments it); when either side lacks it,
// fall back to the write timestamp.
function isOlderSample(incoming, prev) {
  if (!prev) return false;
  const inTool = incoming.tool_count;
  const prevTool = prev.tool_count;
  if (Number.isFinite(inTool) && Number.isFinite(prevTool)) {
    return inTool < prevTool;
  }
  const inTs = incoming.context_ts;
  const prevTs = prev.context_ts;
  if (Number.isFinite(inTs) && Number.isFinite(prevTs)) {
    return inTs < prevTs;
  }
  return false;
}

// writeState({ contextRemainingPct, toolCount }, opts?) → { ok, skipped?, state? }
// opts.now (epoch ms, injectable for tests) stamps context_ts; opts.dir overrides
// the state dir (tests). Out-of-order writes are skipped (ok:true, skipped:true).
function writeState(input, opts) {
  input = input || {};
  opts = opts || {};
  const dir = opts.dir || getCostStateDir();
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const snapshot = {
    context_remaining_pct: Number.isFinite(input.contextRemainingPct) ? input.contextRemainingPct : null,
    tool_count: Number.isFinite(input.toolCount) ? input.toolCount : null,
    context_ts: now,
  };
  const prev = readState(opts);
  if (isOlderSample(snapshot, prev)) {
    return { ok: true, skipped: true, reason: 'older-sample', state: prev };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    const target = statePath(dir);
    const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    try {
      fs.renameSync(tmp, target);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
      throw err;
    }
    return { ok: true, state: snapshot };
  } catch (err) {
    return { ok: false, reason: 'write-error: ' + err.message };
  }
}

// isStale(maxAgeMs, opts?) — context_ts primary, file mtime fallback. Missing →
// stale (mirror cost-state.isStale). opts.now injectable for tests.
function isStale(maxAgeMs, opts) {
  opts = opts || {};
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const st = readState(opts);
  if (st && Number.isFinite(st.context_ts) && st.context_ts > 0) {
    return (now - st.context_ts) > maxAgeMs;
  }
  const p = statePath(opts.dir);
  try {
    const mtime = fs.statSync(p).mtimeMs;
    return (now - mtime) > maxAgeMs;
  } catch (_e) {
    return true;
  }
}

module.exports = {
  readState: readState,
  writeState: writeState,
  isStale: isStale,
  isOlderSample: isOlderSample,
  statePath: statePath,
  CONTEXT_STATE_FILENAME: CONTEXT_STATE_FILENAME,
};
