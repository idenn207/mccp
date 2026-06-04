'use strict';

// L2c — External `claude --version` probe + cross-session crash alerts.
//
// Probe runs once per session (cached at .claude/state/hook-caps.json with
// provenance — version + probed_at + binary_path + stderr_capture +
// supported_features). C8: binary path + stderr captured so a corrupt binary
// can be diagnosed without re-running the probe.
//
// Crash alerts: scans prior-session shard dirs in .claude/state/hook-trace/.
// Sessions WITHOUT .end marker AND WITHOUT active lease are flagged as
// "ended without compaction" — likely silent failures. Caller injects up to
// 3 system-reminders.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ht = require('./hook-trace');

const CACHE_FILENAME = 'hook-caps.json';
const CACHE_DIRNAME = path.join('.claude', 'state');
const CACHE_FRESH_MS = 24 * 60 * 60 * 1000; // 24h
const PROBE_TIMEOUT_MS = 5000;
const MIN_SUPPORTED_VERSION = '2.1.141';
const MAX_CRASH_ALERTS = 3;
const MAX_STDERR_BYTES = 4096;

function cachePath(repoRoot) {
  return path.join(repoRoot, CACHE_DIRNAME, CACHE_FILENAME);
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

// SemVer comparator — returns 1/0/-1. Tolerant of "claude code v2.1.141 (...)".
function parseSemver(text) {
  if (!text) return null;
  const m = String(text).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function compareSemver(a, b) {
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

function meetsMin(versionStr) {
  const v = parseSemver(versionStr);
  const min = parseSemver(MIN_SUPPORTED_VERSION);
  if (!v) return false;
  return compareSemver(v, min) >= 0;
}

function probeBinary(opts) {
  // Returns { version, binary_path, stderr_capture, exit, error_class }
  const binaryPath = (opts && opts.binaryPath) || 'claude';
  let r;
  try {
    r = spawnSync(binaryPath, ['--version'], {
      timeout: PROBE_TIMEOUT_MS,
      encoding: 'utf8',
    });
  } catch (err) {
    return {
      version: null,
      binary_path: binaryPath,
      stderr_capture: '',
      exit: null,
      error_class: err.code || 'spawn_failed',
    };
  }
  if (r.error) {
    return {
      version: null,
      binary_path: binaryPath,
      stderr_capture: String(r.stderr || '').slice(0, MAX_STDERR_BYTES),
      exit: r.status,
      error_class: r.error.code || 'spawn_error',
    };
  }
  const stdout = String(r.stdout || '').trim();
  const stderr = String(r.stderr || '').slice(0, MAX_STDERR_BYTES);
  return {
    version: stdout,
    binary_path: binaryPath,
    stderr_capture: stderr,
    exit: r.status,
    error_class: null,
  };
}

function computeFeatures(versionStr) {
  // Documented universal hook features. If probe fails or version is too old,
  // we degrade to minimum-spec mode (systemMessage only).
  const ok = meetsMin(versionStr);
  return {
    systemMessage: true, // universal — always supported per Claude Code docs
    permissionDecisionAsk: !!ok,
    terminalSequence: !!ok,
    postToolUseFailure: !!ok,
    sessionEnd: !!ok,
  };
}

function buildPayload(probe) {
  return {
    version: probe.version,
    probed_at: nowIso(),
    binary_path: probe.binary_path,
    stderr_capture: probe.stderr_capture || '',
    exit: probe.exit,
    error_class: probe.error_class,
    supported_features: computeFeatures(probe.version),
  };
}

function readCache(repoRoot) {
  const target = cachePath(repoRoot);
  if (!fs.existsSync(target)) return null;
  try {
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (_) {
    // Corrupt cache → reprobe (C4 self-healing for hook-caps.json).
    return null;
  }
}

function writeCache(repoRoot, payload) {
  const target = cachePath(repoRoot);
  ensureDir(target);
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
}

function isFresh(payload, now) {
  if (!payload || !payload.probed_at) return false;
  const ts = Date.parse(payload.probed_at);
  if (Number.isNaN(ts)) return false;
  return (now || Date.now()) - ts < CACHE_FRESH_MS;
}

function probeAndCache(repoRoot, opts) {
  // Returns { payload, fromCache, reprobed }
  const cached = readCache(repoRoot);
  const force = !!(opts && opts.force);
  if (!force && isFresh(cached, opts && opts.now)) {
    return { payload: cached, fromCache: true, reprobed: false };
  }
  const probe = probeBinary(opts);
  const payload = buildPayload(probe);
  try { writeCache(repoRoot, payload); }
  catch (_) { /* fs errors during cache write are non-fatal */ }
  return { payload: payload, fromCache: false, reprobed: true };
}

// ── Cross-session crash alerts ───────────────────────────────────────────────

function scanCrashAlerts(repoRoot, currentSessionId) {
  // List prior-session dirs lacking .end marker AND not held by an active
  // lease (C3 guard). Bound to MAX_CRASH_ALERTS so a long history doesn't
  // flood the SessionStart context.
  const sessions = ht.listSessionDirs(repoRoot);
  if (sessions.length === 0) return [];
  const leases = ht.listActiveLeases(repoRoot);
  const alerts = [];
  for (const s of sessions) {
    if (s.sessionId === currentSessionId) continue;
    if (leases[s.sessionId]) continue;
    if (ht.hasEndMarker(repoRoot, s.sessionId)) continue;
    const consolidatedPath = path.join(s.dir, ht.CONSOLIDATED_FILENAME);
    alerts.push({
      sessionId: s.sessionId,
      sessionDir: s.dir,
      consolidatedPath: fs.existsSync(consolidatedPath) ? consolidatedPath : null,
      mtimeMs: s.mtimeMs,
    });
    if (alerts.length >= MAX_CRASH_ALERTS) break;
  }
  // Most recent first — older crashes are less actionable.
  return alerts.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function renderCrashAlertReminder(alerts) {
  if (!alerts || alerts.length === 0) return '';
  const lines = [
    '<system-reminder>',
    '[mccp] Prior session(s) ended without a SessionEnd marker. Likely silent failure.',
  ];
  for (const a of alerts) {
    lines.push('  - session=' + a.sessionId +
      ' dir=' + a.sessionDir +
      (a.consolidatedPath ? ' consolidated=' + a.consolidatedPath : ''));
  }
  lines.push('Run /mccp:trace to inspect, or remove the dir to suppress.');
  lines.push('</system-reminder>');
  return lines.join('\n');
}

function renderCapsReminder(payload) {
  if (!payload) return '';
  if (payload.error_class || !payload.version) {
    return [
      '<system-reminder>',
      '[mccp] claude --version probe failed (' + (payload.error_class || 'no-version') + ').',
      '  binary: ' + (payload.binary_path || 'claude'),
      '  Layer 2c minimum-spec mode active: systemMessage only.',
      '</system-reminder>',
    ].join('\n');
  }
  if (!meetsMin(payload.version)) {
    return [
      '<system-reminder>',
      '[mccp] claude --version "' + payload.version + '" is below required ' +
        MIN_SUPPORTED_VERSION + '.',
      '  Layer 2c minimum-spec mode active: systemMessage only.',
      '</system-reminder>',
    ].join('\n');
  }
  return ''; // Healthy probe stays silent — no spam.
}

module.exports = {
  CACHE_FILENAME,
  CACHE_FRESH_MS,
  MIN_SUPPORTED_VERSION,
  MAX_CRASH_ALERTS,
  PROBE_TIMEOUT_MS,
  cachePath,
  parseSemver,
  compareSemver,
  meetsMin,
  probeBinary,
  computeFeatures,
  buildPayload,
  readCache,
  writeCache,
  isFresh,
  probeAndCache,
  scanCrashAlerts,
  renderCrashAlertReminder,
  renderCapsReminder,
};
