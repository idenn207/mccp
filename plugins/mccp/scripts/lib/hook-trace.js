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
const { execFileSync } = require('child_process');
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
//
// v0.2.8 Task 2.6.1 R1-F1 absorption: `phase`, `tool`, `file_path` optional —
// pr-phase-guard.js records successful PostToolUse mutations during the
// Codex-review subphase so the finalizer can audit them. Fields default to
// null when absent, preserving v0.2.7 fail-open invariant for callers that
// never set them.
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
  'phase',
  'tool',
  'file_path',
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

// ── repo root 판정 (santa-delta-review M3 Task 4 · DD6) ──────────────────────
//
// 두 hook(`post-tool-use-failure.js` · `session-end-trace.js`)이 `event.cwd`를 그대로
// 저장소 루트로 썼다. 하위 디렉토리에서 실패한 Bash 호출 하나가
// `plugins/mccp/scripts/.claude/state/hook-trace/<sid>/`를 만드는 것이 실측됐고,
// 쓰레기 파일보다 나쁜 것은 **shard와 `.end` 마커가 다른 디렉토리로 갈리는 것**이다 —
// shard가 루트에 쌓이는 동안 세션이 하위 디렉토리에서 끝나면 루트 세션 디렉토리에 `.end`가
// 없고, 다음 세션의 `scanCrashAlerts`가 거짓 crash alert를 낸다(§3.2 · v1.20.5가 닫은 실패
// 모드가 cwd 표류로 다시 열린다).
//
// 판정은 **여기 한 자리**다(DD6-1). 두 hook에 같은 로직을 복사하면 다음 수정에서 갈린다.
// 이 모듈이 이미 `repoBaseDir`·`sessionDir`·`shardPath` 전부를 `repoRoot` 인자로 받는
// 소유자이므로, 그 인자를 만드는 판정도 여기가 자리다.
function repoBaseDir(repoRoot) {
  return path.join(repoRoot, TRACE_DIRNAME);
}

// resolveRepoRoot — git toplevel 우선, 실패 시 `event.cwd` fallback.
//
// **fail-open이 요건이다**(DD6-2). hook이 던져서 도구 호출을 막는 것은 이 축이 사려는
// 것이 아니므로 git이 없든 cwd가 저장소 밖이든 절대 던지지 않는다.
// mirror: `hooks/session-activity-tracker.js:358-360` 의 `gitRepoRoot(cwd)`.
//
// **`receipt/hash.js#gitRepoRoot`를 재사용하지 않는 것은 의도다.** 이 모듈은 fail-open
// hook 두 개가 부팅 경로에서 require하는데, `receipt/hash`는 canonicalization·해시·
// receipt 스키마 보조까지 끌고 들어온다 — 그 그래프에서 나는 어떤 로드 실패도 hook을
// degraded로 만들고, 그것이 정확히 v1.20.5가 닫은 실패 모드다. 그래서 이 축은 자기
// 의존을 `child_process` 하나로 묶는다. 대가는 같은 git 호출의 세 번째 사본이고,
// 그 사본들은 계약이 서로 다르다(이쪽은 절대 던지지 않고 cwd로 접는다).
function resolveRepoRoot(event) {
  const cwd = (event && typeof event.cwd === 'string' && event.cwd) ? event.cwd : process.cwd();
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const top = String(out || '').trim();
    if (top) return path.resolve(top);
  } catch (_err) {
    // 비-git cwd, git 미설치, 권한 거부 — 전부 fallback으로 접는다.
  }
  return cwd;
}

// toRepoRelative — 사용자 표면에 실릴 경로를 repo 기준 상대경로로 접는다(DD6-3).
//
// §3.12가 receipt `meta.cwd`에 대해 이미 정한 관례(절대경로 leak 회피)를 hook 표면에도
// 적용한다. **대상이 `repoRoot` 밖이면 원본을 그대로 돌려준다** — `..` 사슬을 표면에
// 싣는 것이 절대경로보다 나쁘기 때문이다. 즉 「표면 절대경로 0건」은 git 해석이 성공한
// 경로에 한정된 주장이고, 비-git fallback의 절대경로는 결함이 아니라 명시된 잔여다.
function toRepoRelative(repoRoot, abs) {
  if (typeof abs !== 'string' || !abs) return abs;
  if (typeof repoRoot !== 'string' || !repoRoot) return abs;
  let root;
  let target;
  try {
    root = path.resolve(repoRoot);
    target = path.resolve(abs);
  } catch (_err) {
    return abs;
  }
  const rel = path.relative(root, target);
  // 접두 일치일 때만 상대화한다. `..`로 시작하거나 절대경로가 나오면 대상이 루트 밖이다.
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return abs;
  return rel.split(path.sep).join('/');
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
    // v0.2.8 Task 2.6.1 R1-F1 — optional pr-phase audit fields.
    phase: raw.phase || null,
    tool: raw.tool || null,
    file_path: raw.file_path || null,
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
  resolveRepoRoot,
  toRepoRelative,
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
