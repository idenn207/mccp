'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const observerSessions = require('../lib/observer-sessions');

const SCHEMA_VERSION = 'v2';
const SCHEMA_VERSIONS_SUPPORTED = Object.freeze(['v1', 'v2']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30000;

const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  Atomics.wait(SLEEP_BUF, 0, 0, ms);
}

// v1.4.0-m2 — heartbeat-driven active filter (Codex Implement R1 F2 absorption).
// 24h legacy fallback removed (false-immortal source). v1 ledgers are read-lifted
// to v2 with last_seen_at = created_at; if their created_at is older than the
// heartbeat TTL they are correctly classified inactive without the 24h cap.
const DEFAULT_HEARTBEAT_TTL_MS = 5 * 60 * 1000;
// Legacy export kept so unrelated callers compile. Treated as a heartbeat-TTL
// override when caller passes activeTtlMs explicitly (no special handling).
const DEFAULT_ACTIVE_TTL_MS = DEFAULT_HEARTBEAT_TTL_MS;

const VALID_SCOPES = Object.freeze(['global', 'repo', 'hybrid']);

const KNOWN_KEYS_V1 = Object.freeze(new Set([
  'schema_version',
  'session_id',
  'created_at',
  'ended_at',
  'cwd',
  'git_branch',
  'pid',
  'host',
  'project_id',
  'claude_version',
]));

const KNOWN_KEYS_V2 = Object.freeze(new Set([
  ...KNOWN_KEYS_V1,
  'last_seen_at',
]));

const LEDGER_SUBDIR = '.session-ledgers';

function nowIso() {
  return new Date().toISOString();
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// v1.4.x patch — git ref-format helper. Total function: null → true,
// non-string → false; never throws. Mirrors git's strict ref name rules.
function isValidGitBranch(name) {
  if (name === null) return true;
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > 255) return false;
  if (name.startsWith('.')) return false;
  if (name.includes('..')) return false;
  if (/\s/.test(name)) return false;
  if (/[\x00-\x1f\x7f]/.test(name)) return false;
  if (name.includes('@{')) return false;
  if (name.includes('//')) return false;
  if (name.endsWith('/')) return false;
  if (name.endsWith('.lock')) return false;
  if (/[~^:?*\[]/.test(name)) return false;
  return true;
}

// v1.4.x patch — module-level WARN memo: per-process per-sourcePath 1 emit
// (Codex R2 F3 absorption: listLedgers polling must not flood stderr).
const WARNED_LEGACY_BRANCH_PATHS = new Set();

// v1.4.x patch — read-side branch lift (Codex R1 F1 + R2 F1 absorption).
// Mutates ledger in-place IN-MEMORY only — caller decides whether to persist.
// Returns the same ledger reference for chaining.
function liftLegacyBranch(ledger, sourcePath) {
  if (!isPlainObject(ledger)) return ledger;
  if (ledger.git_branch === null) return ledger;
  if (isValidGitBranch(ledger.git_branch)) return ledger;
  const original = ledger.git_branch;
  ledger.git_branch = null;
  if (sourcePath && !WARNED_LEGACY_BRANCH_PATHS.has(sourcePath)) {
    WARNED_LEGACY_BRANCH_PATHS.add(sourcePath);
    process.stderr.write('[mccp:session-ledger] WARNING: lifting invalid git_branch '
      + JSON.stringify(original) + ' to null at ' + sourcePath + '\n');
  }
  return ledger;
}

function validate(ledger) {
  const errors = [];
  function err(msg) { errors.push(msg); }
  function req(cond, msg) { if (!cond) err(msg); }

  req(isPlainObject(ledger), 'ledger must be an object');
  if (errors.length) return { ok: false, errors: errors };

  const version = ledger.schema_version;
  req(version === 'v1' || version === 'v2',
    'schema_version must be "v1" or "v2"');
  if (errors.length) return { ok: false, errors: errors };

  const knownKeys = version === 'v2' ? KNOWN_KEYS_V2 : KNOWN_KEYS_V1;

  req(typeof ledger.session_id === 'string' && UUID_RE.test(ledger.session_id),
    'session_id must be UUID matching ' + UUID_RE);

  req(typeof ledger.created_at === 'string' && ISO8601_RE.test(ledger.created_at),
    'created_at must be ISO8601 string');

  if (ledger.ended_at !== null) {
    req(typeof ledger.ended_at === 'string' && ISO8601_RE.test(ledger.ended_at),
      'ended_at must be ISO8601 string or null');
  }

  req(typeof ledger.cwd === 'string' && ledger.cwd.length > 0,
    'cwd must be a non-empty string');

  if (ledger.git_branch !== null) {
    req(typeof ledger.git_branch === 'string' && ledger.git_branch.length > 0,
      'git_branch must be a non-empty string or null');
    req(isValidGitBranch(ledger.git_branch),
      'git_branch fails git ref-format rules: ' + ledger.git_branch);
  }

  req(Number.isInteger(ledger.pid) && ledger.pid > 0,
    'pid must be a positive integer');

  req(typeof ledger.host === 'string' && ledger.host.length > 0,
    'host must be a non-empty string');

  req(typeof ledger.project_id === 'string' && /^[a-z0-9_-]{1,64}$/.test(ledger.project_id),
    'project_id must match /^[a-z0-9_-]{1,64}$/');

  if (ledger.claude_version !== null) {
    req(typeof ledger.claude_version === 'string' && ledger.claude_version.length > 0,
      'claude_version must be a non-empty string or null');
  }

  if (version === 'v2') {
    req(typeof ledger.last_seen_at === 'string' && ISO8601_RE.test(ledger.last_seen_at),
      'last_seen_at must be ISO8601 string for v2 ledger');
  } else {
    if (Object.prototype.hasOwnProperty.call(ledger, 'last_seen_at')) {
      err('last_seen_at is v2-only; remove it for v1 ledger');
    }
  }

  for (const k of Object.keys(ledger)) {
    if (!knownKeys.has(k)) {
      err('unknown top-level key "' + k + '" (ledger schema is strict for ' + version + ')');
    }
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors: errors };
}

// Lift a v1 ledger into v2 in-memory (read-only).
// Returns a NEW object — does not mutate the input.
// last_seen_at anchors at created_at (best available signal for legacy ledgers).
function liftV1(ledger) {
  if (!isPlainObject(ledger)) return ledger;
  if (ledger.schema_version !== 'v1') return ledger;
  return {
    schema_version: 'v2',
    session_id: ledger.session_id,
    created_at: ledger.created_at,
    last_seen_at: ledger.created_at,
    ended_at: ledger.ended_at,
    cwd: ledger.cwd,
    git_branch: ledger.git_branch,
    pid: ledger.pid,
    host: ledger.host,
    project_id: ledger.project_id,
    claude_version: ledger.claude_version,
  };
}

// pidIsLive — POSIX-style presence probe; Windows-compatible.
// EPERM on Windows usually means "process exists but we can't signal it";
// classify as alive to avoid false reclaim of cross-user sessions.
function pidIsLive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') return true;
    return false;
  }
}

function resolveLedgerScope(opts) {
  opts = opts || {};
  const envRaw = (opts.env && typeof opts.env === 'object')
    ? opts.env
    : process.env;
  const rawScope = (envRaw.MCCP_SESSION_LEDGER_SCOPE || '').trim().toLowerCase();
  const scope = VALID_SCOPES.indexOf(rawScope) !== -1 ? rawScope : 'global';

  let projectContext = opts.projectContext;
  if (!projectContext) {
    projectContext = observerSessions.resolveProjectContext(opts.cwd || process.cwd());
  }

  const globalPath = path.join(projectContext.projectDir, LEDGER_SUBDIR);
  const repoPath = (projectContext.projectRoot && !projectContext.isGlobal)
    ? path.join(projectContext.projectRoot, '.claude', 'state', 'session-ledgers')
    : null;

  let paths = [];
  let primary;
  if (scope === 'repo') {
    if (repoPath) {
      paths = [repoPath];
      primary = repoPath;
    } else {
      paths = [globalPath];
      primary = globalPath;
    }
  } else if (scope === 'hybrid') {
    if (repoPath) {
      paths = [globalPath, repoPath];
    } else {
      paths = [globalPath];
    }
    primary = globalPath;
  } else {
    paths = [globalPath];
    primary = globalPath;
  }

  return { paths: paths, primary: primary, scope: scope };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ledgerFilePath(dir, sessionId) {
  return path.join(dir, sessionId + '.json');
}

function tryAcquire(lockFile) {
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, String(process.pid) + '\n' + nowIso());
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return false;
  }
}

function isStaleLock(lockFile) {
  try {
    const stat = fs.statSync(lockFile);
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch (_e) { return false; }
}

function withLedgerLock(targetFile, fn) {
  const lockFile = targetFile + '.lock';
  ensureDir(path.dirname(targetFile));
  let acquired = false;
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    if (tryAcquire(lockFile)) { acquired = true; break; }
    if (isStaleLock(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (_e) {}
      continue;
    }
    sleepSync(LOCK_RETRY_MS);
  }
  if (!acquired) {
    process.stderr.write('[mccp:session-ledger] WARNING: could not acquire lock at '
      + lockFile + ' after ' + (LOCK_MAX_RETRIES * LOCK_RETRY_MS)
      + 'ms; proceeding without lock (race window open)\n');
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockFile); } catch (_e) {}
    }
  }
}

function writeLedgerAtomic(target, ledger) {
  const tmp = target + '.tmp';
  ensureDir(path.dirname(target));
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_e) {}
    throw err;
  }
}

function createLedger(args) {
  args = args || {};
  const sessionId = String(args.sessionId || '').trim();
  if (!sessionId) {
    return { ok: false, error: 'sessionId is required' };
  }

  const scopeInfo = resolveLedgerScope({
    env: args.scopeOverride ? { MCCP_SESSION_LEDGER_SCOPE: args.scopeOverride } : undefined,
    projectContext: args.projectContext,
    cwd: args.cwd,
  });

  const projectContext = args.projectContext
    || observerSessions.resolveProjectContext(args.cwd || process.cwd());

  const createdAt = args.createdAt || nowIso();
  const ledger = {
    schema_version: SCHEMA_VERSION,
    session_id: sessionId,
    created_at: createdAt,
    last_seen_at: createdAt,
    ended_at: null,
    cwd: args.cwd || process.cwd(),
    git_branch: args.gitBranch || null,
    pid: typeof args.pid === 'number' ? args.pid : process.pid,
    host: args.host || os.hostname(),
    project_id: projectContext.projectId || 'global',
    claude_version: args.claudeVersion || null,
  };

  const v = validate(ledger);
  if (!v.ok) {
    return { ok: false, error: 'ledger invalid: ' + v.errors.join('; ') };
  }

  const written = [];
  const errors = [];
  for (const dir of scopeInfo.paths) {
    const target = ledgerFilePath(dir, sessionId);
    try {
      withLedgerLock(target, function () {
        writeLedgerAtomic(target, ledger);
      });
      written.push(target);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      errors.push({ path: target, error: msg });
      process.stderr.write('[mccp:session-ledger] WARNING: ledger write failed at '
        + target + ': ' + msg + ' (continuing)\n');
    }
  }

  if (written.length === 0) {
    return { ok: false, error: 'all ledger writes failed', errors: errors };
  }

  return {
    ok: true,
    ledger: ledger,
    paths: written,
    primary: scopeInfo.primary,
    scope: scopeInfo.scope,
    errors: errors,
  };
}

// updateLedgerHeartbeat — v1.4.0-m2 surface (Codex Implement R1 F1 absorption).
// Honors hybrid all-or-nothing invariant: when scope=hybrid and ≥1 existing
// path fails to update, returns ok=false so callers can audit partial state.
// Missing-ledger no-op returns ok=true with noop=true (idempotent across
// repeated SessionStart triggers when the ledger has been finalized).
function updateLedgerHeartbeat(args) {
  args = args || {};
  const sessionId = String(args.sessionId || '').trim();
  if (!sessionId) {
    return { ok: false, error: 'sessionId is required', paths: [], errors: [] };
  }

  const scopeInfo = resolveLedgerScope({
    env: args.scopeOverride ? { MCCP_SESSION_LEDGER_SCOPE: args.scopeOverride } : undefined,
    projectContext: args.projectContext,
    cwd: args.cwd,
  });

  const updated = [];
  const errors = [];
  const seen = [];
  const timestamp = args.timestamp || nowIso();

  for (const dir of scopeInfo.paths) {
    const target = ledgerFilePath(dir, sessionId);
    if (!fs.existsSync(target)) {
      seen.push({ path: target, exists: false });
      continue;
    }
    try {
      withLedgerLock(target, function () {
        const raw = fs.readFileSync(target, 'utf8');
        let ledger = JSON.parse(raw);
        if (ledger.schema_version === 'v1') {
          ledger = liftV1(ledger);
        }
        liftLegacyBranch(ledger, target);
        ledger.last_seen_at = timestamp;
        const v = validate(ledger);
        if (!v.ok) {
          throw new Error('post-heartbeat ledger invalid: ' + v.errors.join('; '));
        }
        writeLedgerAtomic(target, ledger);
      });
      updated.push(target);
      seen.push({ path: target, exists: true, ok: true });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      errors.push({ path: target, error: msg });
      seen.push({ path: target, exists: true, ok: false, error: msg });
      process.stderr.write('[mccp:session-ledger] WARNING: heartbeat update failed at '
        + target + ': ' + msg + ' (continuing)\n');
    }
  }

  const noneExisted = seen.every(function (s) { return !s.exists; });
  if (noneExisted) {
    process.stderr.write('[mccp:session-ledger] WARNING: heartbeat target not found for '
      + sessionId + ' (no-op)\n');
    return { ok: true, paths: updated, errors: errors, noop: true };
  }

  const isHybrid = scopeInfo.scope === 'hybrid' && scopeInfo.paths.length >= 2;
  if (isHybrid) {
    const existingCount = seen.filter(function (s) { return s.exists; }).length;
    const failedCount = seen.filter(function (s) { return s.exists && !s.ok; }).length;
    if (existingCount >= 1 && failedCount > 0) {
      return { ok: false, paths: updated, errors: errors };
    }
  }

  if (updated.length === 0) {
    return { ok: false, paths: updated, errors: errors };
  }

  return { ok: true, paths: updated, errors: errors };
}

function finalizeLedger(args) {
  args = args || {};
  const sessionId = String(args.sessionId || '').trim();
  if (!sessionId) {
    return { ok: false, error: 'sessionId is required' };
  }
  const endedAtIn = args.endedAt || nowIso();

  const scopeInfo = resolveLedgerScope({
    env: args.scopeOverride ? { MCCP_SESSION_LEDGER_SCOPE: args.scopeOverride } : undefined,
    projectContext: args.projectContext,
    cwd: args.cwd,
  });

  const updated = [];
  const errors = [];
  for (const dir of scopeInfo.paths) {
    const target = ledgerFilePath(dir, sessionId);
    if (!fs.existsSync(target)) continue;
    try {
      withLedgerLock(target, function () {
        const raw = fs.readFileSync(target, 'utf8');
        let ledger = JSON.parse(raw);
        if (ledger.schema_version === 'v1') {
          ledger = liftV1(ledger);
        }
        liftLegacyBranch(ledger, target);
        // ended_at > last_seen_at invariant (Task 5 acceptance).
        let endedAt = endedAtIn;
        if (ledger.last_seen_at) {
          const lsMs = Date.parse(ledger.last_seen_at);
          const enMs = Date.parse(endedAt);
          if (Number.isFinite(lsMs) && Number.isFinite(enMs) && enMs <= lsMs) {
            endedAt = new Date(lsMs + 1).toISOString();
          }
        }
        ledger.ended_at = endedAt;
        const v = validate(ledger);
        if (!v.ok) {
          throw new Error('post-finalize ledger invalid: ' + v.errors.join('; '));
        }
        writeLedgerAtomic(target, ledger);
      });
      updated.push(target);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      errors.push({ path: target, error: msg });
      process.stderr.write('[mccp:session-ledger] WARNING: finalize failed at '
        + target + ': ' + msg + ' (continuing)\n');
    }
  }

  return {
    ok: updated.length > 0 || scopeInfo.paths.every(function (d) {
      return !fs.existsSync(ledgerFilePath(d, sessionId));
    }),
    paths: updated,
    errors: errors,
  };
}

function readLedger(args) {
  args = args || {};
  const sessionId = String(args.sessionId || '').trim();
  if (!sessionId) return { ok: false, error: 'sessionId is required' };

  const scopeInfo = resolveLedgerScope({
    env: args.scopeOverride ? { MCCP_SESSION_LEDGER_SCOPE: args.scopeOverride } : undefined,
    projectContext: args.projectContext,
    cwd: args.cwd,
  });

  for (const dir of scopeInfo.paths) {
    const target = ledgerFilePath(dir, sessionId);
    if (!fs.existsSync(target)) continue;
    try {
      const raw = fs.readFileSync(target, 'utf8');
      let ledger = JSON.parse(raw);
      if (ledger.schema_version === 'v1') {
        ledger = liftV1(ledger);
      }
      liftLegacyBranch(ledger, target);
      const v = validate(ledger);
      if (!v.ok) {
        return { ok: false, error: 'ledger invalid: ' + v.errors.join('; '), path: target };
      }
      return { ok: true, ledger: ledger, path: target };
    } catch (err) {
      return { ok: false, error: 'read failed: ' + (err.message || String(err)), path: target };
    }
  }
  return { ok: false, error: 'ledger not found for session: ' + sessionId };
}

// listLedgers — v1.4.0-m2 host-aware tri-state reclaim.
// (1) Hybrid dedupe (F1 absorption): newest last_seen_at wins. Older path
//     entries are tracked in errors and the result is marked degraded.
// (2) Active filter (F2 absorption): same-host requires (pidLive AND
//     fresh heartbeat). Stale heartbeat with live PID is treated as PID-reuse
//     suspicion and classified inactive. Cross-host trusts heartbeat alone.
function listLedgers(args) {
  args = args || {};
  const activeOnly = !!args.activeOnly;
  const heartbeatTtlMs = typeof args.heartbeatTtlMs === 'number'
    ? args.heartbeatTtlMs
    : (typeof args.activeTtlMs === 'number' ? args.activeTtlMs : DEFAULT_HEARTBEAT_TTL_MS);
  const pidProbe = typeof args.pidIsLive === 'function' ? args.pidIsLive : pidIsLive;
  const selfHost = typeof args.selfHost === 'string' && args.selfHost.length > 0
    ? args.selfHost
    : os.hostname();

  const scopeInfo = resolveLedgerScope({
    env: args.scopeOverride ? { MCCP_SESSION_LEDGER_SCOPE: args.scopeOverride } : undefined,
    projectContext: args.projectContext,
    cwd: args.cwd,
  });

  const candidates = new Map();
  let degraded = false;
  const errors = [];
  const now = Date.now();

  for (const dir of scopeInfo.paths) {
    if (!fs.existsSync(dir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (err) {
      degraded = true;
      errors.push({ path: dir, error: err.message || String(err) });
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const target = path.join(dir, name);
      try {
        const raw = fs.readFileSync(target, 'utf8');
        let ledger = JSON.parse(raw);
        if (ledger.schema_version === 'v1') {
          ledger = liftV1(ledger);
        }
        liftLegacyBranch(ledger, target);
        const v = validate(ledger);
        if (!v.ok) {
          degraded = true;
          errors.push({ path: target, error: 'invalid: ' + v.errors.join('; ') });
          continue;
        }
        const lastSeenMs = Date.parse(ledger.last_seen_at);
        const existing = candidates.get(name);
        if (existing) {
          if (Number.isFinite(lastSeenMs) && lastSeenMs > existing.lastSeenMs) {
            candidates.set(name, { ledger: ledger, path: target, lastSeenMs: lastSeenMs });
            degraded = true;
            errors.push({
              path: target,
              error: 'hybrid dedupe: replaced older entry at ' + existing.path,
            });
          } else if (Number.isFinite(lastSeenMs) && lastSeenMs < existing.lastSeenMs) {
            degraded = true;
            errors.push({
              path: target,
              error: 'hybrid dedupe: kept newer entry at ' + existing.path,
            });
          }
        } else {
          candidates.set(name, { ledger: ledger, path: target, lastSeenMs: lastSeenMs });
        }
      } catch (err) {
        degraded = true;
        errors.push({ path: target, error: err.message || String(err) });
      }
    }
  }

  const result = [];
  const resultPaths = [];
  for (const entry of candidates.values()) {
    if (activeOnly) {
      const ledger = entry.ledger;
      if (ledger.ended_at !== null) continue;
      if (!Number.isFinite(entry.lastSeenMs)) continue;
      const fresh = (now - entry.lastSeenMs) <= heartbeatTtlMs;
      if (ledger.host === selfHost) {
        if (!fresh) continue;
        if (!pidProbe(ledger.pid)) continue;
      } else {
        if (!fresh) continue;
      }
    }
    result.push(entry.ledger);
    resultPaths.push(entry.path);
  }

  return {
    ok: true,
    degraded: degraded,
    errors: errors,
    ledgers: result,
    paths: resultPaths,
    scope: scopeInfo.scope,
  };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  SCHEMA_VERSIONS_SUPPORTED: SCHEMA_VERSIONS_SUPPORTED,
  KNOWN_KEYS_V1: KNOWN_KEYS_V1,
  KNOWN_KEYS_V2: KNOWN_KEYS_V2,
  KNOWN_KEYS: KNOWN_KEYS_V2,
  LEDGER_SUBDIR: LEDGER_SUBDIR,
  DEFAULT_ACTIVE_TTL_MS: DEFAULT_ACTIVE_TTL_MS,
  DEFAULT_HEARTBEAT_TTL_MS: DEFAULT_HEARTBEAT_TTL_MS,
  VALID_SCOPES: VALID_SCOPES,
  validate: validate,
  liftV1: liftV1,
  isValidGitBranch: isValidGitBranch,
  liftLegacyBranch: liftLegacyBranch,
  pidIsLive: pidIsLive,
  resolveLedgerScope: resolveLedgerScope,
  createLedger: createLedger,
  updateLedgerHeartbeat: updateLedgerHeartbeat,
  finalizeLedger: finalizeLedger,
  readLedger: readLedger,
  listLedgers: listLedgers,
};
