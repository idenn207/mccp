'use strict';

// L1 hook-trace shard ledger — per-invocation observability via JSONL shards.
//
// Layout (per Milestone 2.5 Layered Design v3-minimal):
//   .claude/state/hook-trace/
//     <session_id>/
//       <tool_use_id>-<phase>.jsonl       — append-only shard
//       <tool_use_id>-<phase>.jsonl.<tmp> — atomic rename in-flight
//       .end                              — SessionEnd marker (L5)
//       consolidated.jsonl                — L5 compactor output
//       .quarantine/<name>.<ts>           — malformed shards moved here (C4)
//     <session_id>.lease                  — active-session lease (C3)
//
// Write-time allowlist enforced (C6 — live hook state = event payload only).
// Per-shard cap: 64KB OR 100 entries. Global cap 100MB via evictLRU().
// All filesystem errors fail silently — caller decides systemMessage policy
// (G1 invariant). Active-session lease guards LRU + compactor.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TRACE_DIRNAME = path.join('.claude', 'state', 'hook-trace');
const QUARANTINE_SUBDIR = '.quarantine';
const END_MARKER = '.end';
const LEASE_SUFFIX = '.lease';
const CONSOLIDATED_FILENAME = 'consolidated.jsonl';

const PER_SHARD_MAX_BYTES = 64 * 1024;
const PER_SHARD_MAX_ENTRIES = 100;
const GLOBAL_MAX_BYTES = 100 * 1024 * 1024;
// Lease TTL: covers long sessions without false-crash. Sessions heartbeat the
// lease on every recordWrite, so the absolute ceiling is reached only when a
// session goes truly idle (or crashed without SessionEnd).
const LEASE_STALE_MS = 24 * 60 * 60 * 1000;

// Allowlist — only these fields permitted in entries (C6).
const SHARD_ENTRY_FIELDS = new Set([
  'ts',
  'session_id',
  'tool_use_id',
  'command_id',
  'command_name',
  'gate_decision',
  'layer',
  'exception_class',
  'exit_code',
]);

const COMMAND_NAME_PASSTHROUGH_PREFIX = 'mccp:';
const FIELD_MAX_CHARS = 256;
const PATH_TOKEN_RE = /^[A-Za-z0-9_.\-]+$/;

class HookTraceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function repoBaseDir(repoRoot) {
  return path.join(repoRoot, TRACE_DIRNAME);
}

function assertPathToken(value, label) {
  if (!value || typeof value !== 'string' || !PATH_TOKEN_RE.test(value)) {
    throw new HookTraceError('invalid_' + label,
      label + ' must match ' + PATH_TOKEN_RE.source);
  }
  if (value === '.' || value === '..') {
    throw new HookTraceError('invalid_' + label, label + ' must not be . or ..');
  }
}

function sessionDir(repoRoot, sessionId) {
  assertPathToken(sessionId, 'session_id');
  return path.join(repoBaseDir(repoRoot), sessionId);
}

function shardPath(repoRoot, sessionId, toolUseId, phase) {
  assertPathToken(toolUseId, 'tool_use_id');
  assertPathToken(phase, 'phase');
  return path.join(sessionDir(repoRoot, sessionId), toolUseId + '-' + phase + '.jsonl');
}

function leasePath(repoRoot, sessionId) {
  assertPathToken(sessionId, 'session_id');
  return path.join(repoBaseDir(repoRoot), sessionId + LEASE_SUFFIX);
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeCommandName(name) {
  if (!name || typeof name !== 'string') return null;
  if (name.startsWith(COMMAND_NAME_PASSTHROUGH_PREFIX)) return name;
  return 'sha256:' + crypto.createHash('sha256').update(name).digest('hex').slice(0, 16);
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new HookTraceError('invalid_entry', 'entry must be an object');
  }
  for (const key of Object.keys(entry)) {
    if (!SHARD_ENTRY_FIELDS.has(key)) {
      throw new HookTraceError('forbidden_field',
        'field "' + key + '" not in allowlist (C6: live hook state = event payload only)');
    }
  }
  for (const k of ['ts', 'session_id', 'tool_use_id', 'layer']) {
    if (!entry[k]) throw new HookTraceError('missing_field', k + ' required');
  }
  for (const k of Object.keys(entry)) {
    const v = entry[k];
    if (v === null) continue;
    if (typeof v === 'string') {
      if (v.length > FIELD_MAX_CHARS) {
        throw new HookTraceError('field_too_long',
          'field "' + k + '" exceeds ' + FIELD_MAX_CHARS + ' chars');
      }
      continue;
    }
    if (typeof v !== 'number') {
      throw new HookTraceError('invalid_field_type',
        'field "' + k + '" must be string|number|null');
    }
  }
}

function normalizeEntry(raw) {
  // Raw-input allowlist check — must happen before we re-shape into the canonical
  // entry, otherwise unknown fields silently get dropped and we lose the C6 invariant.
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(raw)) {
      if (!SHARD_ENTRY_FIELDS.has(key)) {
        throw new HookTraceError('forbidden_field',
          'field "' + key + '" not in allowlist (C6: live hook state = event payload only)');
      }
    }
  }
  const entry = {
    ts: raw.ts || nowIso(),
    session_id: raw.session_id,
    tool_use_id: raw.tool_use_id,
    command_id: raw.command_id || null,
    command_name: sanitizeCommandName(raw.command_name),
    gate_decision: raw.gate_decision || null,
    layer: raw.layer,
    exception_class: raw.exception_class || null,
    exit_code: raw.exit_code === undefined ? null : raw.exit_code,
  };
  validateEntry(entry);
  return entry;
}

function readShardSize(shardFile) {
  try {
    return fs.statSync(shardFile).size;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

function countShardEntries(shardFile) {
  let raw;
  try {
    raw = fs.readFileSync(shardFile, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  let count = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    JSON.parse(trimmed); // throws if malformed → quarantine path triggered by caller
    count += 1;
  }
  return count;
}

function appendShardAtomic(shardFile, line) {
  // O_APPEND single-syscall append — OS-level race-safe for concurrent writes
  // when the payload fits in PIPE_BUF (typically 4096 bytes). A single JSONL
  // entry is bounded by FIELD_MAX_CHARS × allowlist count (~9 × 256 ≈ 2.5KB
  // worst case after JSON escaping), well under PIPE_BUF on Linux/macOS, and
  // NTFS preserves O_APPEND atomicity for small writes on Windows.
  //
  // The old read-then-tmp-rename was last-writer-wins: two hooks both reading
  // the same prior, the later rename erased the earlier line. O_APPEND fixes
  // that without giving up the corruption-resistance — partial writes can
  // only produce a malformed trailing line, which the read-side quarantines
  // (see countShardEntries + consolidateSession validation).
  ensureDir(path.dirname(shardFile));
  fs.appendFileSync(shardFile, line + '\n', 'utf8');
}

function quarantineShard(shardFile) {
  const parent = path.dirname(shardFile);
  const quarantineDir = path.join(parent, QUARANTINE_SUBDIR);
  ensureDir(quarantineDir);
  const target = path.join(quarantineDir, path.basename(shardFile) + '.' + Date.now());
  fs.renameSync(shardFile, target);
  return target;
}

function recordWrite(repoRoot, sessionId, toolUseId, phase, rawEntry) {
  // Public API. Caller hands schema-validated raw entry; we enforce allowlist
  // + caps + atomic write. Never throws — returns:
  //   { ok: true, path }
  //   { ok: false, code, reason }
  let entry;
  try {
    entry = normalizeEntry(Object.assign(
      { session_id: sessionId, tool_use_id: toolUseId }, rawEntry));
  } catch (err) {
    return { ok: false, code: err.code || 'validation_error', reason: err.message };
  }

  let target;
  try {
    target = shardPath(repoRoot, sessionId, toolUseId, phase);
  } catch (err) {
    return { ok: false, code: err.code || 'invalid_path', reason: err.message };
  }

  let size;
  try { size = readShardSize(target); }
  catch (err) {
    return { ok: false, code: err.code || 'stat_failed', reason: err.message };
  }
  if (size >= PER_SHARD_MAX_BYTES) {
    return { ok: false, code: 'shard_full', reason: 'per-shard byte cap reached' };
  }

  let entryCount;
  try {
    entryCount = countShardEntries(target);
  } catch (err) {
    // Malformed JSONL — quarantine and start fresh shard. recordWrite caller
    // gets a soft fail; next call lands cleanly.
    try { quarantineShard(target); } catch (_) { /* best-effort */ }
    return { ok: false, code: 'shard_corrupt_quarantined', reason: err.message };
  }
  if (entryCount >= PER_SHARD_MAX_ENTRIES) {
    return { ok: false, code: 'shard_full', reason: 'per-shard entry cap reached' };
  }

  const line = JSON.stringify(entry);
  try {
    appendShardAtomic(target, line);
  } catch (err) {
    return { ok: false, code: err.code || 'write_failed', reason: err.message };
  }
  // Heartbeat the lease so long sessions don't get false-crashed by the 24h
  // TTL or LRU-evicted while still active. Best-effort — never fails the write.
  try { renewLease(repoRoot, sessionId); } catch (_) { /* silent */ }
  return { ok: true, path: target };
}

// ── Active-session lease (C3) ────────────────────────────────────────────────

function acquireLease(repoRoot, sessionId) {
  ensureDir(repoBaseDir(repoRoot));
  const lease = leasePath(repoRoot, sessionId);
  fs.writeFileSync(lease, JSON.stringify({
    pid: process.pid,
    sessionId: sessionId,
    ts: nowIso(),
  }), 'utf8');
  return lease;
}

function renewLease(repoRoot, sessionId) {
  // Heartbeat — refreshes the lease's mtime + ts so listActiveLeases() keeps
  // treating the session as active across the long TTL.
  //
  // IMPORTANT: refresh-only, no lazy create. The lease is the SessionStart
  // hook's responsibility (acquireLease in L2c); recordWrite must not
  // fabricate leases for sessions that never went through SessionStart,
  // because that would make every prior session look "active" and defeat
  // crash detection (scanCrashAlerts uses lease absence as a crash signal).
  // Returns the lease path if refreshed, null if no lease existed.
  const lease = leasePath(repoRoot, sessionId);
  let existed = true;
  try { fs.accessSync(lease); }
  catch (err) {
    if (err.code === 'ENOENT') existed = false;
    else throw err;
  }
  if (!existed) return null;
  fs.writeFileSync(lease, JSON.stringify({
    pid: process.pid,
    sessionId: sessionId,
    ts: nowIso(),
  }), 'utf8');
  return lease;
}

function releaseLease(repoRoot, sessionId) {
  const lease = leasePath(repoRoot, sessionId);
  try { fs.unlinkSync(lease); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
}

function listActiveLeases(repoRoot) {
  const base = repoBaseDir(repoRoot);
  if (!fs.existsSync(base)) return {};
  const out = {};
  for (const name of fs.readdirSync(base)) {
    if (!name.endsWith(LEASE_SUFFIX)) continue;
    const leaseFile = path.join(base, name);
    let stat;
    try { stat = fs.statSync(leaseFile); }
    catch { continue; }
    if (Date.now() - stat.mtimeMs > LEASE_STALE_MS) continue;
    const sid = name.slice(0, -LEASE_SUFFIX.length);
    let payload = {};
    try { payload = JSON.parse(fs.readFileSync(leaseFile, 'utf8')); }
    catch { /* keep empty */ }
    out[sid] = Object.assign({}, payload, {
      leaseFile: leaseFile,
      mtimeMs: stat.mtimeMs,
    });
  }
  return out;
}

// ── SessionEnd marker + compactor (used by L5 hook) ──────────────────────────

function markSessionEnd(repoRoot, sessionId) {
  const target = path.join(sessionDir(repoRoot, sessionId), END_MARKER);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, nowIso(), 'utf8');
  return target;
}

function hasEndMarker(repoRoot, sessionId) {
  try {
    const dir = sessionDir(repoRoot, sessionId);
    fs.accessSync(path.join(dir, END_MARKER));
    return true;
  } catch { return false; }
}

function consolidateSession(repoRoot, sessionId) {
  const dir = sessionDir(repoRoot, sessionId);
  if (!fs.existsSync(dir)) return { ok: false, code: 'no_session_dir' };

  const lines = [];
  const quarantined = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === CONSOLIDATED_FILENAME) continue;
    if (name === END_MARKER) continue;
    if (name === QUARANTINE_SUBDIR) continue;
    if (!name.endsWith('.jsonl')) continue;
    const full = path.join(dir, name);
    let raw;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch (_err) {
      try { quarantineShard(full); } catch (_) { /* best-effort */ }
      quarantined.push(name);
      continue;
    }
    // Validate each JSONL line. A single malformed entry quarantines the
    // whole shard — partial corruption (e.g. interrupted append) shouldn't
    // poison consolidated.jsonl, which /mccp:trace relies on for recovery.
    const shardLines = [];
    let bad = false;
    for (const ln of raw.split('\n')) {
      const t = ln.trim();
      if (!t) continue;
      try { JSON.parse(t); }
      catch (_) { bad = true; break; }
      shardLines.push(t);
    }
    if (bad) {
      try { quarantineShard(full); } catch (_) { /* best-effort */ }
      quarantined.push(name);
      continue;
    }
    for (const t of shardLines) lines.push(t);
  }

  const target = path.join(dir, CONSOLIDATED_FILENAME);
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    return { ok: false, code: err.code || 'consolidate_failed', reason: err.message };
  }
  return { ok: true, path: target, lines: lines.length, quarantined: quarantined };
}

// ── LRU eviction (SessionStart) ──────────────────────────────────────────────

function listSessionDirs(repoRoot) {
  const base = repoBaseDir(repoRoot);
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const full = path.join(base, ent.name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    out.push({ sessionId: ent.name, dir: full, mtimeMs: stat.mtimeMs });
  }
  return out;
}

function dirTotalBytes(dir) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return 0; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isFile()) {
      try { total += fs.statSync(full).size; } catch { /* ignore */ }
    } else if (ent.isDirectory()) {
      total += dirTotalBytes(full);
    }
  }
  return total;
}

function evictLRU(repoRoot, opts) {
  const max = (opts && opts.maxBytes) || GLOBAL_MAX_BYTES;
  const leases = listActiveLeases(repoRoot);
  const sessions = listSessionDirs(repoRoot).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let total = 0;
  const sized = sessions.map(s => {
    const bytes = dirTotalBytes(s.dir);
    total += bytes;
    return Object.assign({}, s, { bytes });
  });
  const evicted = [];
  for (const s of sized) {
    if (total <= max) break;
    if (leases[s.sessionId]) continue;
    try { fs.rmSync(s.dir, { recursive: true, force: true }); }
    catch { continue; }
    evicted.push({ sessionId: s.sessionId, bytes: s.bytes });
    total -= s.bytes;
  }
  return { evicted: evicted, totalAfter: total };
}

module.exports = {
  PER_SHARD_MAX_BYTES,
  PER_SHARD_MAX_ENTRIES,
  GLOBAL_MAX_BYTES,
  SHARD_ENTRY_FIELDS,
  TRACE_DIRNAME,
  END_MARKER,
  CONSOLIDATED_FILENAME,
  QUARANTINE_SUBDIR,
  LEASE_SUFFIX,
  HookTraceError,
  repoBaseDir,
  sessionDir,
  shardPath,
  leasePath,
  sanitizeCommandName,
  validateEntry,
  recordWrite,
  acquireLease,
  renewLease,
  releaseLease,
  listActiveLeases,
  markSessionEnd,
  hasEndMarker,
  consolidateSession,
  listSessionDirs,
  dirTotalBytes,
  evictLRU,
};
