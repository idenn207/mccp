'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const observerSessions = require('../lib/observer-sessions');

const SCHEMA_VERSION = 'v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30000;

// Canonical Node sync-sleep (no busy-spin). SharedArrayBuffer lives in
// module scope so we allocate once. Atomics.wait blocks the thread for up
// to `ms` milliseconds with zero CPU.
const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  Atomics.wait(SLEEP_BUF, 0, 0, ms);
}

const DEFAULT_ACTIVE_TTL_MS = 24 * 60 * 60 * 1000;

const VALID_SCOPES = Object.freeze(['global', 'repo', 'hybrid']);

const KNOWN_KEYS = Object.freeze(new Set([
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

const LEDGER_SUBDIR = '.session-ledgers';

function nowIso() {
  return new Date().toISOString();
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validate(ledger) {
  const errors = [];
  function err(msg) { errors.push(msg); }
  function req(cond, msg) { if (!cond) err(msg); }

  req(isPlainObject(ledger), 'ledger must be an object');
  if (errors.length) return { ok: false, errors: errors };

  req(ledger.schema_version === SCHEMA_VERSION,
    'schema_version must be "' + SCHEMA_VERSION + '"');

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

  for (const k of Object.keys(ledger)) {
    if (!KNOWN_KEYS.has(k)) {
      err('unknown top-level key "' + k + '" (ledger schema is strict)');
    }
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors: errors };
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

  const ledger = {
    schema_version: SCHEMA_VERSION,
    session_id: sessionId,
    created_at: args.createdAt || nowIso(),
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

function finalizeLedger(args) {
  args = args || {};
  const sessionId = String(args.sessionId || '').trim();
  if (!sessionId) {
    return { ok: false, error: 'sessionId is required' };
  }
  const endedAt = args.endedAt || nowIso();

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
        const ledger = JSON.parse(raw);
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
    ok: updated.length > 0 || scopeInfo.paths.every(d => !fs.existsSync(ledgerFilePath(d, sessionId))),
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
      const ledger = JSON.parse(raw);
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

function listLedgers(args) {
  args = args || {};
  const activeOnly = !!args.activeOnly;
  const activeTtlMs = typeof args.activeTtlMs === 'number'
    ? args.activeTtlMs
    : DEFAULT_ACTIVE_TTL_MS;

  const scopeInfo = resolveLedgerScope({
    env: args.scopeOverride ? { MCCP_SESSION_LEDGER_SCOPE: args.scopeOverride } : undefined,
    projectContext: args.projectContext,
    cwd: args.cwd,
  });

  const seen = new Map();
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
      if (seen.has(name)) continue;
      try {
        const raw = fs.readFileSync(target, 'utf8');
        const ledger = JSON.parse(raw);
        const v = validate(ledger);
        if (!v.ok) {
          degraded = true;
          errors.push({ path: target, error: 'invalid: ' + v.errors.join('; ') });
          continue;
        }
        if (activeOnly) {
          if (ledger.ended_at !== null) continue;
          const created = Date.parse(ledger.created_at);
          if (!Number.isFinite(created) || (now - created) > activeTtlMs) continue;
        }
        seen.set(name, { ledger: ledger, path: target });
      } catch (err) {
        degraded = true;
        errors.push({ path: target, error: err.message || String(err) });
      }
    }
  }

  return {
    ok: true,
    degraded: degraded,
    errors: errors,
    ledgers: Array.from(seen.values()).map(function (e) { return e.ledger; }),
    paths: Array.from(seen.values()).map(function (e) { return e.path; }),
    scope: scopeInfo.scope,
  };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  KNOWN_KEYS: KNOWN_KEYS,
  LEDGER_SUBDIR: LEDGER_SUBDIR,
  DEFAULT_ACTIVE_TTL_MS: DEFAULT_ACTIVE_TTL_MS,
  VALID_SCOPES: VALID_SCOPES,
  validate: validate,
  resolveLedgerScope: resolveLedgerScope,
  createLedger: createLedger,
  finalizeLedger: finalizeLedger,
  readLedger: readLedger,
  listLedgers: listLedgers,
};
