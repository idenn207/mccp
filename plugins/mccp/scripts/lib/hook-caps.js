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
const RESOLVE_TIMEOUT_MS = 2000;
const MIN_SUPPORTED_VERSION = '2.1.141';
const MAX_CRASH_ALERTS = 3;
const MAX_STDERR_BYTES = 4096;
// Heartbeat window for "actively running" classification. listActiveLeases
// keeps any lease with mtime < LEASE_STALE_MS (24h), but the lease is
// heartbeated on every recordWrite — so a lease that hasn't moved in
// LEASE_LIVE_MS is far more likely to be from a crashed session than a
// genuinely idle one. Codex Round 2 F#1: skipping every "active" lease for
// 24h hid recovery alerts after immediate post-SessionStart crashes.
const LEASE_LIVE_MS = 10 * 60 * 1000; // 10 minutes

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

// Resolve a binary name to its absolute PATH location so the cache can
// distinguish "same binary" from "PATH shadowed by a stale install". Codex
// Round 2 F#4: probeBinary previously recorded the literal `"claude"`, so a
// stale or shadowed binary was indistinguishable from a healthy one.
function resolveBinaryPath(binaryPath) {
  const target = binaryPath || 'claude';
  if (path.isAbsolute(target)) return target;
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where' : 'which';
  let r;
  try {
    r = spawnSync(cmd, [target], { encoding: 'utf8', timeout: RESOLVE_TIMEOUT_MS });
  } catch (_) {
    return target;
  }
  if (!r || r.status !== 0 || !r.stdout) return target;
  const lines = String(r.stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[0] || target;
}

function statMtime(filePath) {
  if (!filePath) return null;
  try { return fs.statSync(filePath).mtimeMs; }
  catch { return null; }
}

function probeBinary(opts) {
  // Returns { version, binary_path, binary_resolved_path, binary_mtime_ms,
  //           stderr_capture, exit, error_class }
  const binaryPath = (opts && opts.binaryPath) || 'claude';
  const resolved = (opts && opts._resolved) || resolveBinaryPath(binaryPath);
  // Only stat when resolution actually moved us to an absolute path —
  // unresolved bare names give no useful mtime.
  const binaryMtimeMs = (resolved && resolved !== binaryPath && path.isAbsolute(resolved))
    ? statMtime(resolved)
    : null;
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
      binary_resolved_path: resolved,
      binary_mtime_ms: binaryMtimeMs,
      stderr_capture: '',
      exit: null,
      error_class: err.code || 'spawn_failed',
    };
  }
  if (r.error) {
    return {
      version: null,
      binary_path: binaryPath,
      binary_resolved_path: resolved,
      binary_mtime_ms: binaryMtimeMs,
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
    binary_resolved_path: resolved,
    binary_mtime_ms: binaryMtimeMs,
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
    binary_resolved_path: probe.binary_resolved_path || null,
    binary_mtime_ms: (typeof probe.binary_mtime_ms === 'number') ? probe.binary_mtime_ms : null,
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
  const binaryPath = (opts && opts.binaryPath) || 'claude';
  const resolved = resolveBinaryPath(binaryPath);
  // Codex Round 2 F#4 — invalidate cache when the binary has been replaced
  // (resolved path changed) or its mtime moved (in-place upgrade). Either
  // signal beats the 24h TTL; otherwise a stale entry would mask a fresh
  // install for nearly a day.
  let invalidated = false;
  if (cached) {
    if (cached.binary_resolved_path && resolved && cached.binary_resolved_path !== resolved) {
      invalidated = true;
    } else if (resolved && path.isAbsolute(resolved) && cached.binary_mtime_ms != null) {
      const currentMtime = statMtime(resolved);
      if (currentMtime != null && currentMtime !== cached.binary_mtime_ms) {
        invalidated = true;
      }
    }
  }
  if (!force && !invalidated && isFresh(cached, opts && opts.now)) {
    return { payload: cached, fromCache: true, reprobed: false };
  }
  const probe = probeBinary(Object.assign({}, opts, { _resolved: resolved }));
  const payload = buildPayload(probe);
  try { writeCache(repoRoot, payload); }
  catch (_) { /* fs errors during cache write are non-fatal */ }
  return { payload: payload, fromCache: false, reprobed: true };
}

// ── Cross-session crash alerts ───────────────────────────────────────────────

function scanCrashAlerts(repoRoot, currentSessionId, opts) {
  // List prior-session dirs lacking .end marker. A session whose lease has
  // been heartbeated within LEASE_LIVE_MS is treated as truly alive and
  // skipped; an older lease is treated as abandoned-by-crash (Codex Round 2
  // F#1) and surfaced with `staleLease: true` so the renderer can tell the
  // user the session may have crashed mid-run.
  //
  // Order of operations (Codex Round 2 F#3): collect ALL eligible alerts,
  // sort by mtime descending, THEN slice to MAX_CRASH_ALERTS — sorting after
  // the cap previously discarded the newest alerts whenever filesystem
  // enumeration order disagreed with mtime order.
  const sessions = ht.listSessionDirs(repoRoot);
  if (sessions.length === 0) return [];
  const leases = ht.listActiveLeases(repoRoot);
  const now = (opts && typeof opts.now === 'number') ? opts.now : Date.now();
  const eligible = [];
  for (const s of sessions) {
    if (s.sessionId === currentSessionId) continue;
    if (ht.hasEndMarker(repoRoot, s.sessionId)) continue;
    const lease = leases[s.sessionId];
    if (lease && typeof lease.mtimeMs === 'number' && (now - lease.mtimeMs) < LEASE_LIVE_MS) {
      // Heartbeat within the live window — session is genuinely running.
      continue;
    }
    const consolidatedPath = path.join(s.dir, ht.CONSOLIDATED_FILENAME);
    eligible.push({
      sessionId: s.sessionId,
      sessionDir: s.dir,
      consolidatedPath: fs.existsSync(consolidatedPath) ? consolidatedPath : null,
      mtimeMs: s.mtimeMs,
      staleLease: !!lease,
    });
  }
  eligible.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return eligible.slice(0, MAX_CRASH_ALERTS);
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
      (a.consolidatedPath ? ' consolidated=' + a.consolidatedPath : '') +
      (a.staleLease ? ' (stale lease — likely crashed mid-session)' : ''));
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
  LEASE_LIVE_MS,
  cachePath,
  parseSemver,
  compareSemver,
  meetsMin,
  resolveBinaryPath,
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
