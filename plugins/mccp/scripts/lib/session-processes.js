'use strict';

// session-process-reclaim M1+M2 — long-lived process registry + SessionEnd reclaim.
//
// mccp spawns processes that outlive the command that started them (the dashboard
// server, the detached plan-codex-runner, the handoff `claude` session). Nothing
// recorded who owned them, so nothing could safely reap them. This module is the
// registry AND the reaper: each long-lived process self-registers under its own
// session key at boot, and SessionEnd reclaims ONLY what this session owns.
//
// The single metric that shapes every decision here is PRD "오살 0" — never kill a
// process belonging to another session, another repo, another host, or another
// user. Every predicate below therefore fails CLOSED: when we cannot prove
// ownership we leave the process alone and record why.
//
// Layout — one file per process, no shared mutable state:
//   .claude/state/session-processes/<session_id>/<pid>.json              record
//   .claude/state/session-processes/<session_id>/<pid>.failed.json       register failed
//   .claude/state/session-processes/<session_id>/<pid>.unreclaimed.json  reclaim failed
//
// Registration writes distinct files, so there is no read-modify-write and no
// lock (§D3). Only three places unlink: `unregister` (own pid, clean exit),
// `reclaimSession` (own session dir at SessionEnd), and `scanForeignOrphans`
// (DEAD pids inside DEAD session dirs — never a live one).
//
// ROLLBACK: `rm -rf .claude/state/session-processes/`
// The directory is gitignored and working-tree only, so VCS rollback does not
// touch it. Removing it is always safe: a missing record is not evidence that a
// process was reclaimed (see SEMANTICS), it just means nothing is known.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const evidenceLock = require('../receipt/evidence-lock');

// ── constants ────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;
const REGISTRY_DIRNAME = path.join('.claude', 'state', 'session-processes');

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

// Mirror of session-end-trace.js:24-31. The session id here is the SAME value
// that keys `hook-trace/<sid>/`; if the two patterns diverge the two directory
// layouts stop lining up.
const SESSION_ID_RE = /^[A-Za-z0-9_.\-]+$/;

const KINDS = ['dashboard-server', 'plan-codex-runner', 'handoff-session'];
const LIFETIMES = ['session', 'outlives-session'];
const ROLES = ['owner', 'reuse'];

const RECORD_FIELDS = [
  'schema', 'pid', 'host', 'session_id', 'session_pid', 'started_at',
  'proc_started_at_ms', 'exec_path', 'repo_root', 'kind', 'lifetime', 'role',
];

// §D15 axis 2 — platform-branched, because the two probes have different
// precision. win32 CIM CreationDate is sub-second (measured self-probe delta in
// this repo: 130ms). POSIX `ps -o etimes=` is quantized to whole SECONDS, so a
// healthy process can read up to 1000ms off from quantization alone; anything
// below that misclassifies every normal process as `identity_mismatch`.
const IDENTITY_TOLERANCE_WIN32_MS = 500;
const IDENTITY_TOLERANCE_POSIX_MS = 1500;
const IDENTITY_TOLERANCE_MS =
  process.platform === 'win32' ? IDENTITY_TOLERANCE_WIN32_MS : IDENTITY_TOLERANCE_POSIX_MS;

// DEVIATION from the plan's flat 2000ms (documented in the implementation
// report). Measured in this repo: `powershell.exe -Command Get-CimInstance` costs
// ~1.0s warm but ~2.9s on a COLD PowerShell start. A 2000ms cap therefore makes
// §D15 fail NONDETERMINISTICALLY on win32 — the one platform UI5 prioritizes —
// and every failure folds to `identity_unverifiable`, i.e. reclaim quietly dies
// out. POSIX keeps 2000ms because `ps` is a fast native binary. CIM is not
// replaceable by the cheaper `Get-Process`: that returns `.Path` (node.exe) and
// never the command line, so §D15 axis 1 could not match the registered script
// path at all.
const PROBE_TIMEOUT_WIN32_MS = 5000;
const PROBE_TIMEOUT_POSIX_MS = 2000;
const PROBE_TIMEOUT_MS =
  process.platform === 'win32' ? PROBE_TIMEOUT_WIN32_MS : PROBE_TIMEOUT_POSIX_MS;

const DEFAULT_BUDGET_MS = 6000;      // under the SessionEnd hook's timeout:10s
// hooks.json registers session:end:marker with `timeout: 10` (seconds). The
// DEFAULT sits under that by construction — but MCCP_RECLAIM_BUDGET_MS could
// walk straight out of it, and a sweep killed mid-flight at the hook timeout
// loses exactly the `.unreclaimed.json` records that make a partial sweep
// auditable. So the env knob is clamped, not trusted, in the same shape as
// resolveIdentityToleranceMs: it moves only where it cannot hurt, loudly.
const HOOK_TIMEOUT_MS = 10000;
const MAX_BUDGET_MS = 9000;          // 1s of headroom for the rest of the hook
const ORPHAN_STALE_MS = 24 * 60 * 60 * 1000;

// Not an enforcement device — the enforcement is Task 7's hook (which reads the
// return value and surfaces it) and Task 9(e)'s consumer whitelist. This string
// exists so a reader of the record directory cannot mistake absence for success.
const SEMANTICS = [
  'An absent record is NOT evidence that the process was reclaimed.',
  'A record can be absent because it was never written (register failed before',
  'mkdir, or no session identity was resolvable), because the process exited',
  'cleanly and unregistered itself, or because a reclaim removed it. Only',
  'reclaimSession().complete === true, read together with unreclaimed[] and',
  'writeFailures[], says anything about reclaim outcome.',
].join(' ');

function warn(msg) {
  process.stderr.write('[mccp:session-processes] ' + msg + '\n');
}

// ── paths + containment ──────────────────────────────────────────────────────

function registryDir(repoRoot) {
  return path.join(path.resolve(repoRoot), REGISTRY_DIRNAME);
}

function isSafeSessionId(sid) {
  return typeof sid === 'string' &&
    sid.length > 0 &&
    SESSION_ID_RE.test(sid) &&
    sid !== '.' && sid !== '..';
}

// Throws rather than returning a verdict: a caller holding an unsafe session id
// has a bug, and silently degrading would let a `../` land as a real path.
function assertSafeSessionId(sid) {
  if (!isSafeSessionId(sid)) {
    const err = new Error('session id must be a single safe path segment (got "' + sid + '")');
    err.code = 'SESSION_ID_INVALID';
    throw err;
  }
  return sid;
}

function sessionDir(repoRoot, sid) {
  return path.join(registryDir(repoRoot), assertSafeSessionId(sid));
}

function caseFold(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

// realpath of `p`, or of the nearest existing ancestor when `p` does not exist
// yet. Used so containment can be checked against a resolved parent even before
// the leaf is created.
function realpathNearest(p) {
  let cur = path.resolve(p);
  for (;;) {
    try { return fs.realpathSync.native(cur); }
    catch (_) {
      const parent = path.dirname(cur);
      if (parent === cur) return cur;
      cur = parent;
    }
  }
}

function isInside(child, parent) {
  const c = caseFold(path.resolve(child));
  const p = caseFold(path.resolve(parent));
  if (c === p) return true;
  const withSep = p.endsWith(path.sep) ? p : p + path.sep;
  return c.indexOf(withSep) === 0;
}

// §D8 — every write is preceded by mkdir. `writePrivate` (mirrored from
// plan-codex-runner.js:75-79) does tmp-write + rename and NOTHING else, so
// without this both `<pid>.json` and `<pid>.failed.json` would ENOENT and the
// registration would leave neither success nor failure behind.
// `recursive: true` is EEXIST-safe, which also closes the concurrent-first-write
// race for free.
function ensureDirPrivate(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
}

// security — owner-only, atomic-ish, never at a predictable path an attacker
// could pre-create as a symlink (mirror of plan-codex-runner.js writePrivate).
function writePrivate(file, text) {
  const tmp = file + '.' + process.pid + '.' +
    Math.random().toString(36).slice(2) + '.tmp';
  fs.writeFileSync(tmp, text, { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}

// The registry ROOT has to be sealed against the REPO, not just the session dir
// against the root. Checking only the inner edge passes vacuously when the root
// IS the escape: pre-create `.claude/state/session-processes` as a link to an
// external directory and `realpathNearest(reg)` becomes that target, so every
// session dir under it is trivially "inside the registry" and records land
// outside the repo. This was reproducible before this guard existed, on win32
// with a `junction` — which, unlike a symlink, needs no elevation at all.
function sealedRegistryDir(repoRoot) {
  const reg = registryDir(repoRoot);
  const realRepo = realpathNearest(repoRoot);
  // BEFORE mkdir: realpathNearest resolves the nearest EXISTING ancestor, so a
  // link at the root — or anywhere above it — is caught before `recursive: true`
  // follows it and creates anything on the far side.
  if (!isInside(realpathNearest(reg), realRepo)) return { ok: false, reason: 'path_escape' };
  ensureDirPrivate(reg);
  // AFTER mkdir: re-resolve. The leaf we just created is the first thing that
  // actually resolves, and it may have appeared between the two calls.
  const realReg = realpathNearest(reg);
  if (!isInside(realReg, realRepo)) return { ok: false, reason: 'path_escape' };
  return { ok: true, dir: reg, realDir: realReg };
}

// Read-only variant — no mkdir, so a missing registry is simply "nothing here".
// The sweeps use this because they READ and UNLINK; following an escaped root
// there would delete files outside the repo.
function containedRegistryDir(repoRoot) {
  const reg = registryDir(repoRoot);
  if (!isInside(realpathNearest(reg), realpathNearest(repoRoot))) return null;
  return reg;
}

function sealedSessionDir(repoRoot, sid) {
  const sealedReg = sealedRegistryDir(repoRoot);
  if (!sealedReg.ok) return sealedReg;
  const dir = sessionDir(repoRoot, sid);
  ensureDirPrivate(dir);
  // The inner check runs AFTER mkdir on purpose: `recursive: true` follows an
  // existing symlink, so a pre-mkdir check would look at a path that does not
  // yet resolve the way the write will.
  if (!isInside(realpathNearest(dir), sealedReg.realDir)) {
    return { ok: false, reason: 'path_escape' };
  }
  return { ok: true, dir: dir };
}

// ── schema ───────────────────────────────────────────────────────────────────

function validateRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    return { ok: false, reason: 'not_an_object' };
  }
  const keys = Object.keys(rec);
  for (const k of keys) {
    if (RECORD_FIELDS.indexOf(k) === -1) return { ok: false, reason: 'unknown_field:' + k };
  }
  for (const k of RECORD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(rec, k)) return { ok: false, reason: 'missing_field:' + k };
  }
  if (rec.schema !== SCHEMA_VERSION) return { ok: false, reason: 'schema_version' };
  if (!Number.isInteger(rec.pid) || rec.pid <= 0) return { ok: false, reason: 'pid' };
  if (typeof rec.host !== 'string' || !rec.host) return { ok: false, reason: 'host' };
  if (!isSafeSessionId(rec.session_id)) return { ok: false, reason: 'session_id' };
  if (rec.session_pid !== null && (!Number.isInteger(rec.session_pid) || rec.session_pid <= 0)) {
    return { ok: false, reason: 'session_pid' };
  }
  if (typeof rec.started_at !== 'string' || !Number.isFinite(Date.parse(rec.started_at))) {
    return { ok: false, reason: 'started_at' };
  }
  if (!Number.isInteger(rec.proc_started_at_ms) || rec.proc_started_at_ms <= 0) {
    return { ok: false, reason: 'proc_started_at_ms' };
  }
  if (typeof rec.exec_path !== 'string' || !rec.exec_path) return { ok: false, reason: 'exec_path' };
  if (typeof rec.repo_root !== 'string' || !path.isAbsolute(rec.repo_root)) {
    return { ok: false, reason: 'repo_root' };
  }
  if (KINDS.indexOf(rec.kind) === -1) return { ok: false, reason: 'kind' };
  if (LIFETIMES.indexOf(rec.lifetime) === -1) return { ok: false, reason: 'lifetime' };
  if (ROLES.indexOf(rec.role) === -1) return { ok: false, reason: 'role' };
  return { ok: true };
}

// ── registration ─────────────────────────────────────────────────────────────

function recordPath(dir, pid) { return path.join(dir, String(pid) + '.json'); }
function failedPath(dir, pid) { return path.join(dir, String(pid) + '.failed.json'); }
function unreclaimedPath(dir, pid) { return path.join(dir, String(pid) + '.unreclaimed.json'); }

function registerFailure(repoRoot, sid, pid, reason) {
  try {
    const sealed = sealedSessionDir(repoRoot, sid);
    if (!sealed.ok) { warn('registerFailure blocked: ' + sealed.reason); return { ok: false, reason: sealed.reason }; }
    writePrivate(failedPath(sealed.dir, pid), JSON.stringify({
      schema: SCHEMA_VERSION,
      pid: pid,
      host: os.hostname(),
      session_id: sid,
      reason: String(reason || 'unknown'),
      failed_at: new Date().toISOString(),
    }, null, 2));
    return { ok: true };
  } catch (err) {
    warn('registerFailure write failed: ' + (err && err.message));
    return { ok: false, reason: 'write_failed' };
  }
}

/**
 * Self-registration. Called once per long-lived process, at boot.
 *
 * `execPath` is stored as an ABSOLUTE path on purpose — §D15 axis 1 compares the
 * whole string against the probed command line, and normalizing it (the way
 * receipt/write.js normalizes meta.cwd) would delete exactly the information the
 * compare needs. That normalization precedent guards a git-tracked audit corpus;
 * this registry is gitignored and working-tree only, and `.gitignore` plus the
 * 0700 directory mode are its controls instead.
 */
function register(repoRoot, opts) {
  opts = opts || {};
  const env = opts.env || process.env;

  const sessionId = evidenceLock.resolveSessionId(env);
  if (!sessionId) {
    // §D6 explicit residual: with no session id there is no directory to write
    // into, so this is the one failure that can only ever reach stderr.
    warn('register skipped: no session identity (CLAUDE_CODE_SESSION_ID absent) — '
      + 'kind=' + opts.kind + ' pid=' + opts.pid);
    return { ok: false, reason: 'no_session_identity' };
  }
  assertSafeSessionId(sessionId);

  const rawSessionPid = evidenceLock.resolveSessionPid(env);
  const sessionPidUsable = rawSessionPid !== null && evidenceLock.isPidAlive(rawSessionPid);
  if (rawSessionPid !== null && !sessionPidUsable) {
    warn('CLAUDE_PID=' + rawSessionPid + ' is not alive — degrading session_pid to null');
  }

  const pid = opts.pid;
  const record = {
    schema: SCHEMA_VERSION,
    pid: pid,
    host: os.hostname(),
    session_id: sessionId,
    session_pid: sessionPidUsable ? rawSessionPid : null,
    started_at: new Date().toISOString(),
    // Self-registration knows its own start time without asking the OS.
    // A caller that registers SOMEONE ELSE's pid (the handoff child, a reuse
    // record) must pass `procStartedAtMs` — it cannot use our uptime.
    proc_started_at_ms: Number.isInteger(opts.procStartedAtMs)
      ? opts.procStartedAtMs
      : Math.round(Date.now() - process.uptime() * 1000),
    exec_path: opts.execPath,
    repo_root: path.resolve(repoRoot),
    kind: opts.kind,
    lifetime: opts.lifetime,
    role: opts.role,
  };

  const v = validateRecord(record);
  if (!v.ok) {
    warn('register rejected (fail-closed): ' + v.reason + ' kind=' + opts.kind + ' pid=' + pid);
    registerFailure(repoRoot, sessionId, Number.isInteger(pid) && pid > 0 ? pid : process.pid, v.reason);
    return { ok: false, reason: 'schema_invalid', detail: v.reason };
  }

  let sealed;
  try {
    sealed = sealedSessionDir(repoRoot, sessionId);
  } catch (err) {
    warn('register mkdir failed: ' + (err && err.message));
    return { ok: false, reason: 'mkdir_failed' };
  }
  if (!sealed.ok) {
    warn('register blocked: session dir resolves outside the registry (path_escape)');
    return { ok: false, reason: sealed.reason };
  }

  const file = recordPath(sealed.dir, pid);
  try {
    writePrivate(file, JSON.stringify(record, null, 2));
  } catch (err) {
    warn('register write failed: ' + (err && err.message));
    registerFailure(repoRoot, sessionId, pid, 'write_failed:' + (err && err.code));
    return { ok: false, reason: 'write_failed' };
  }
  return { ok: true, path: file, record: record };
}

function unregister(repoRoot, sid, pid) {
  try {
    fs.unlinkSync(recordPath(sessionDir(repoRoot, sid), pid));
    return { ok: true, removed: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, removed: false };
    warn('unregister failed: ' + (err && err.message));
    return { ok: false, reason: (err && err.code) || 'unlink_failed' };
  }
}

// ── read side ────────────────────────────────────────────────────────────────

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * @returns {{records: object[], failures: object[], unreclaimed: object[], incomplete: boolean}}
 *   `incomplete` true means at least one entry could not be understood. See
 *   SEMANTICS: absence of a record proves nothing on its own.
 */
function list(repoRoot, sid, deps) {
  deps = deps || {};
  const isAlive = deps.isAlive || evidenceLock.isPidAlive;
  const out = { records: [], failures: [], unreclaimed: [], incomplete: false };

  // Defense in depth for the escaped-root case. Returning NO records with
  // `incomplete: true` is the fail-closed direction: reclaimSession kills
  // nothing and reports itself unfinished. Suppressing only the sibling sweep
  // would have been fail-OPEN — fewer "in use" records means MORE kills.
  if (!containedRegistryDir(repoRoot)) {
    warn('list refused: the registry root resolves outside the repo (path_escape)');
    out.incomplete = true;
    return out;
  }

  let dir;
  try { dir = sessionDir(repoRoot, sid); } catch (err) { throw err; }

  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return out;
    warn('list readdir failed: ' + (err && err.message));
    out.incomplete = true;
    return out;
  }

  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    if (name.endsWith('.failed.json')) {
      try { out.failures.push(readJson(file)); }
      catch (_) { out.failures.push({ file: name, reason: 'unparsable' }); out.incomplete = true; }
      continue;
    }
    if (name.endsWith('.unreclaimed.json')) {
      try { out.unreclaimed.push(readJson(file)); }
      catch (_) { out.unreclaimed.push({ file: name, reason: 'unparsable' }); out.incomplete = true; }
      continue;
    }
    let rec;
    try {
      rec = readJson(file);
    } catch (err) {
      out.failures.push({ file: name, reason: 'unparsable', message: (err && err.message) || '' });
      out.incomplete = true;
      continue;
    }
    // A parseable-but-invalid record still enters `records` so that the reclaim
    // path lands it in `skipped[]` with reason `record_invalid` (§D4/§Task 6
    // mapping) rather than vanishing. `incomplete` marks that we saw something
    // we cannot trust.
    const v = validateRecord(rec);
    if (!v.ok) out.incomplete = true;
    // NON-ENUMERABLE on purpose. validateRecord enforces a strict allowlist, so
    // a plain `rec.alive = …` makes every record it just read fail as
    // `unknown_field:alive` — and because that verdict is `record_invalid`,
    // reclaim would skip everything and report success. Defining it this way
    // keeps the record byte-identical to what is on disk.
    Object.defineProperty(rec, 'alive', {
      value: v.ok ? !!isAlive(rec.pid) : false,
      enumerable: false, writable: true, configurable: true,
    });
    out.records.push(rec);
  }
  return out;
}

/**
 * Read-only sweep of SIBLING session directories for `role:'reuse'` records.
 * The producer of a reuse record is each session itself (§D7); this function is
 * the only runtime COLLECTOR.
 */
function collectSiblingReuse(repoRoot, selfSid) {
  // Blocking this ALONE would be fail-open (no siblings found ⇒ nothing looks
  // "in use" ⇒ more kills). It is safe only because `list` refuses the same
  // condition first, so there is nothing left to kill by the time we get here.
  const reg = containedRegistryDir(repoRoot);
  if (!reg) {
    warn('collectSiblingReuse refused: registry root resolves outside the repo (path_escape)');
    return [];
  }
  let sids;
  try {
    sids = fs.readdirSync(reg);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      warn('collectSiblingReuse readdir failed: ' + (err && err.message));
    }
    return [];
  }
  const out = [];
  for (const sid of sids) {
    if (sid === selfSid) continue;
    if (!isSafeSessionId(sid)) continue;
    let names;
    try { names = fs.readdirSync(path.join(reg, sid)); }
    catch (err) { warn('collectSiblingReuse skip ' + sid + ': ' + (err && err.message)); continue; }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      if (name.endsWith('.failed.json') || name.endsWith('.unreclaimed.json')) continue;
      let rec;
      try { rec = readJson(path.join(reg, sid, name)); } catch (_) { continue; }
      if (!validateRecord(rec).ok) continue;
      if (rec.role !== 'reuse') continue;
      out.push(rec);
    }
  }
  return out;
}

// ── §D15 process identity ────────────────────────────────────────────────────

// Separator + case normalization. Required, not cosmetic: both reclaim targets
// launch as `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/<name>.js"` so the probed
// command line carries FORWARD slashes, while the registered `exec_path`
// (`__filename`) carries BACKSLASHES on win32. Comparing the full paths without
// this would fail structurally every time.
function normPath(s, platform) {
  const t = String(s == null ? '' : s).replace(/\\/g, '/');
  return (platform || process.platform) === 'win32' ? t.toLowerCase() : t;
}

// Bare substring containment lets the registered path match while sitting INSIDE
// a longer token — `<path>.bak`, `<path>.lock`, `/other<path>` — which is a
// match on a different file entirely. Anchoring to token boundaries removes that
// class. It only ever NARROWS what matches, so it moves fail-closed: the cost of
// being wrong is a missed reclaim, never a mis-kill.
//
// WHAT THIS DOES NOT DO — stated because the honest boundary matters more than
// the appearance of one: a command line that names our path as a genuine
// separate ARGUMENT (`node other.js /repo/.../dashboard-server.js`) still
// matches, because axis 1 asks "does this command line name this script", not
// "is this script the one executing". Distinguishing those would mean rejecting
// a path preceded by a flag-shaped token, and that rejects `node
// --enable-source-maps <path>` too — a silent false negative that disables
// reclaim wholesale, which this design has already judged the worse failure
// (see the probe-timeout deviation). So the §D15 residual is NARROWED here, not
// closed, and the remaining window is: a process started within the start-time
// tolerance that carries our absolute script path as a bare argument.
//
// `=` is deliberately NOT a boundary — `--input=<path>` names the path as data.
const TOKEN_BOUNDARY = ['', ' ', '\t', '"', "'"];

function containsPathToken(haystack, needle) {
  if (!needle || !haystack) return false;
  for (let from = 0; ;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) return false;
    const before = i === 0 ? '' : haystack[i - 1];
    const end = i + needle.length;
    const after = end >= haystack.length ? '' : haystack[end];
    if (TOKEN_BOUNDARY.indexOf(before) !== -1 && TOKEN_BOUNDARY.indexOf(after) !== -1) return true;
    from = i + 1;
  }
}

/**
 * @returns {{startedAtMs: number, commandLine: string}|null}
 *   null on every failure mode — unsupported platform, spawn failure, timeout,
 *   permission denial, empty or non-integer output. The caller reads null as
 *   `identity_unverifiable` and does NOT kill.
 *
 * Both branches emit an INTEGER epoch-ms directly so no locale-dependent date
 * text is ever parsed (`ps -o lstart` is locale-shaped; CIM `CreationDate`
 * serializes differently per environment).
 */
function probeProcess(pid, deps) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  deps = deps || {};
  const platform = deps.platform || process.platform;
  const run = deps.execFileSync || execFileSync;
  const opts = {
    encoding: 'utf8',
    timeout: platform === 'win32' ? PROBE_TIMEOUT_WIN32_MS : PROBE_TIMEOUT_POSIX_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  };
  try {
    if (platform === 'win32') {
      const script =
        "$p=Get-CimInstance Win32_Process -Filter 'ProcessId=" + pid + "';" +
        "if($p){[long]([datetime]$p.CreationDate).ToUniversalTime()" +
        ".Subtract([datetime]'1970-01-01').TotalMilliseconds; $p.CommandLine}";
      const out = run('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script], opts);
      const lines = String(out || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length);
      if (!lines.length) return null;
      const ms = Number(lines[0]);
      if (!Number.isInteger(ms) || ms <= 0) return null;
      return { startedAtMs: ms, commandLine: lines.slice(1).join(' ') };
    }
    // `etimes` is ELAPSED SECONDS — locale-free and immune to wall-clock jumps
    // and DST, unlike an absolute start timestamp.
    const out = run('ps', ['-o', 'etimes=,args=', '-p', String(pid)], opts);
    const line = String(out || '').split(/\r?\n/).find((s) => s.trim().length);
    if (!line) return null;
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) return null;
    const etimes = Number(m[1]);
    if (!Number.isInteger(etimes) || etimes < 0) return null;
    return { startedAtMs: Date.now() - etimes * 1000, commandLine: m[2] };
  } catch (_) {
    return null;
  }
}

// Raising the tolerance is allowed (an operator widening the window trades
// mis-kill risk for reclaim coverage). LOWERING it is refused: below the POSIX
// second-quantization floor every healthy process reads as `identity_mismatch`
// and reclaim silently dies out entirely.
function resolveIdentityToleranceMs(env, platform) {
  const base = (platform || process.platform) === 'win32'
    ? IDENTITY_TOLERANCE_WIN32_MS : IDENTITY_TOLERANCE_POSIX_MS;
  const raw = (env || process.env).MCCP_RECLAIM_IDENTITY_TOLERANCE_MS;
  if (raw === undefined || raw === null || String(raw).trim() === '') return base;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < base) {
    warn('MCCP_RECLAIM_IDENTITY_TOLERANCE_MS=' + raw + ' ignored — the identity '
      + 'tolerance only moves UP (floor ' + base + 'ms on this platform). Lowering '
      + 'it would misclassify healthy processes as identity_mismatch and kill '
      + 'reclaim entirely.');
    return base;
  }
  return n;
}

function canonicalPath(p) {
  const abs = path.resolve(String(p == null ? '' : p));
  try { return fs.realpathSync.native(abs); }
  catch (_) { return abs; }
}

// fail-closed direction: "cannot tell" reads as LIVE. Reading it as dead is a
// mis-kill on the very next line.
function isSiblingLive(r, ctx) {
  if (!r) return true;
  if (r.host !== ctx.host) return true;          // another host's pid liveness is unknowable
  if (r.session_pid === null) return true;       // degraded identity — undecidable
  return !!ctx.isAlive(r.session_pid);
}

/**
 * §D4 ownership predicate. fail-closed, first match wins.
 * @returns {{ok: boolean, reason: string}}
 */
function isReclaimableBy(record, ctx) {
  ctx = ctx || {};
  const host = ctx.host || os.hostname();
  const isAlive = ctx.isAlive || evidenceLock.isPidAlive;
  const platform = ctx.platform || process.platform;
  const probe = ctx.probeProcess || probeProcess;
  const collect = ctx.collectSiblingReuse || collectSiblingReuse;
  const tolerance = Number.isFinite(ctx.toleranceMs)
    ? ctx.toleranceMs : resolveIdentityToleranceMs(ctx.env, platform);

  if (!validateRecord(record).ok) return { ok: false, reason: 'record_invalid' };
  if (record.host !== host) return { ok: false, reason: 'cross_host' };
  if (canonicalPath(record.repo_root) !== canonicalPath(ctx.repoRoot)) {
    return { ok: false, reason: 'cross_repo' };
  }
  if (record.session_id !== ctx.sessionId) return { ok: false, reason: 'cross_session' };
  if (!isAlive(record.pid)) return { ok: false, reason: 'already_dead' };

  const siblings = collect(ctx.repoRoot, ctx.sessionId) || [];
  const inUse = siblings.some(function (r) {
    return r && r.pid === record.pid && r.host === record.host &&
      canonicalPath(r.repo_root) === canonicalPath(record.repo_root) &&
      isSiblingLive(r, { host: host, isAlive: isAlive });
  });
  if (inUse) return { ok: false, reason: 'in_use_by_live_session' };

  if (record.lifetime === 'outlives-session' && !ctx.allowOutlives) {
    return { ok: false, reason: 'lifetime_outlives_session' };
  }
  // Kept in the TABLE, not in reclaimSession: a future caller reusing this
  // predicate must inherit the exclusion. Outliving this session is the whole
  // reason a handoff exists, so allowOutlives does not flip it.
  if (record.kind === 'handoff-session') {
    return { ok: false, reason: 'handoff_never_reclaimed' };
  }
  // DEVIATION from the plan's 11-row table (documented in the implementation
  // report): a `role:'reuse'` record means THIS session borrowed a process it
  // does not own. With MCCP_RECLAIM_OUTLIVES=1 the two rows above stop blocking,
  // and the sibling sweep only collects reuse records — never the OWNER record
  // that a live sibling session holds. Without this row a session that merely
  // reused the dashboard server could reap the owner's process, which is the
  // mis-kill UI2 forbids.
  if (record.role === 'reuse') {
    return { ok: false, reason: 'reuse_not_owner' };
  }

  // Everything above is a SESSION identity check. None of it distinguishes "the
  // process we registered" from "whatever the OS later handed this pid to", so
  // the process identity axis has to be its own gate — this is the PRD's
  // Critical PID-reuse scenario.
  const p = probe(record.pid);
  if (!p || !Number.isFinite(p.startedAtMs)) {
    return { ok: false, reason: 'identity_unverifiable' };
  }
  if (Math.abs(p.startedAtMs - record.proc_started_at_ms) > tolerance) {
    return { ok: false, reason: 'identity_mismatch' };
  }
  const want = normPath(record.exec_path, platform);
  const got = normPath(p.commandLine, platform);
  // Whole path, never basename: a bare filename is too short to name a process
  // (any directory can hold a `dashboard-server.js`), while the absolute path
  // carries repo_root inside it and cannot collide by accident. And the match
  // must land on TOKEN boundaries — see containsPathToken.
  if (!containsPathToken(got, want)) {
    return { ok: false, reason: 'identity_mismatch' };
  }
  return { ok: true, reason: 'owned_session_scoped' };
}

// ── §D9 reclaim ──────────────────────────────────────────────────────────────

function parseBudgetMs(env) {
  const n = Number.parseInt(String((env || process.env).MCCP_RECLAIM_BUDGET_MS || ''), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_BUDGET_MS;
  if (n > MAX_BUDGET_MS) {
    warn('MCCP_RECLAIM_BUDGET_MS=' + n + ' exceeds the SessionEnd hook budget — '
      + 'clamped to ' + MAX_BUDGET_MS + 'ms. hooks.json gives session:end:marker '
      + 'timeout:' + (HOOK_TIMEOUT_MS / 1000) + 's; a sweep permitted past that is '
      + 'killed mid-flight, which destroys the very .unreclaimed.json records that '
      + 'make a partial sweep auditable.');
    return MAX_BUDGET_MS;
  }
  return n;
}

function parseAllowOutlives(env) {
  return String((env || process.env).MCCP_RECLAIM_OUTLIVES || '').trim() === '1';
}

/**
 * Reclaim ONLY this session's processes. Best-effort and budgeted — never a
 * blocking condition for SessionEnd (UI8), and whatever it does not finish stays
 * on disk for the next SessionStart to see (UI9).
 *
 * @returns {{attempted:number, reclaimed:number[], skipped:object[],
 *            unreclaimed:object[], writeFailures:object[],
 *            complete:boolean, budgetExceeded:boolean}}
 *   Every field is consumed by the SessionEnd hook — none is computed for show.
 */
function reclaimSession(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const repoRoot = path.resolve(opts.repoRoot || process.cwd());
  const sessionId = opts.sessionId || evidenceLock.resolveSessionId(env);
  const now = opts.now || Date.now;
  const isAlive = opts.isAlive || evidenceLock.isPidAlive;
  const probe = opts.probeProcess || probeProcess;
  const collect = opts.collectSiblingReuse || collectSiblingReuse;
  const budgetMs = Number.isFinite(opts.budgetMs) ? opts.budgetMs : parseBudgetMs(env);
  const allowOutlives = opts.allowOutlives !== undefined
    ? !!opts.allowOutlives : parseAllowOutlives(env);
  const platform = opts.platform || process.platform;
  const host = opts.host || os.hostname();
  // The ONE kill site in this module (§D5/§Task 9(d)). Declared inside
  // reclaimSession so the source scan can prove the call lives in the same
  // function body that consults isReclaimableBy.
  const kill = opts.kill || function (pid, signal) { return process.kill(pid, signal); };

  const out = {
    attempted: 0, reclaimed: [], skipped: [], unreclaimed: [],
    writeFailures: [], complete: true, budgetExceeded: false,
  };
  if (!sessionId || !isSafeSessionId(sessionId)) {
    out.complete = false;
    return out;
  }
  // Refuse the whole sweep, loudly, rather than relying on `list` returning
  // nothing. A registry reached through a link out of the repo is not a registry
  // we can reason about ownership from, and the correct answer to "I cannot tell
  // whose these are" is to kill none of them.
  if (!containedRegistryDir(repoRoot)) {
    warn('reclaim refused: the registry root resolves outside the repo '
      + '(path_escape) — nothing is reclaimed');
    out.complete = false;
    return out;
  }

  const started = now();
  const l = list(repoRoot, sessionId, { isAlive: isAlive });
  if (l.incomplete) out.complete = false;

  const dir = sessionDir(repoRoot, sessionId);
  const probeTimeoutMs = Number.isFinite(opts.probeTimeoutMs)
    ? opts.probeTimeoutMs
    : (platform === 'win32' ? PROBE_TIMEOUT_WIN32_MS : PROBE_TIMEOUT_POSIX_MS);

  // A process's start time cannot change, so unlike the sibling sweep (§D11,
  // deliberately re-run per record) the probe is safe to memoize. On win32 one
  // probe costs ~1s, so re-probing a pid would burn the SessionEnd budget for
  // no new information.
  const probeMemo = new Map();
  function memoProbe(p) {
    if (probeMemo.has(p)) return probeMemo.get(p);
    const r = probe(p);
    probeMemo.set(p, r);
    return r;
  }

  function markUnreclaimed(pid, reason) {
    out.unreclaimed.push({ pid: pid, reason: reason });
    try {
      ensureDirPrivate(dir);
      writePrivate(unreclaimedPath(dir, pid), JSON.stringify({
        schema: SCHEMA_VERSION, pid: pid, host: host, session_id: sessionId,
        reason: reason, attempted_at: new Date().toISOString(),
      }, null, 2));
    } catch (err) {
      // Never swallowed: a failure to record the failure is itself surfaced.
      out.writeFailures.push({ pid: pid, op: 'unreclaimed_write', message: (err && err.message) || '' });
      warn('unreclaimed record write failed for pid ' + pid + ': ' + (err && err.message));
    }
  }

  function dropRecord(pid) {
    try { fs.unlinkSync(recordPath(dir, pid)); }
    catch (err) {
      if (err && err.code === 'ENOENT') return;
      out.writeFailures.push({ pid: pid, op: 'unlink', message: (err && err.message) || '' });
      warn('record unlink failed for pid ' + pid + ': ' + (err && err.message));
    }
  }

  for (const rec of l.records) {
    const pid = rec && rec.pid;
    if (now() - started >= budgetMs) {
      out.budgetExceeded = true;
      markUnreclaimed(pid, 'budget_exceeded');
      continue;
    }
    // A probe can burn up to PROBE_TIMEOUT_MS. Refuse to start one we cannot
    // afford rather than blowing the SessionEnd budget mid-flight.
    let probeStarved = false;
    const guardedProbe = function (p) {
      // Reserve the WORST case, not the typical one: execFileSync bounds a
      // single probe at probeTimeoutMs, so refusing to start one we cannot
      // afford is what keeps the whole sweep inside budgetMs. An already-probed
      // pid costs nothing and is always allowed.
      if (!probeMemo.has(p) && now() - started > budgetMs - probeTimeoutMs) {
        probeStarved = true;
        return null;
      }
      return memoProbe(p);
    };

    // §D11 — the sibling sweep is re-run per record, immediately before the kill
    // decision, so each record is judged against the FRESHEST world state. A
    // function (not a list) is injected precisely so a caller cannot cache one
    // snapshot and defeat this.
    const verdict = isReclaimableBy(rec, {
      host: host, repoRoot: repoRoot, sessionId: sessionId, isAlive: isAlive,
      probeProcess: guardedProbe, collectSiblingReuse: collect,
      allowOutlives: allowOutlives, platform: platform, env: env,
      toleranceMs: opts.toleranceMs,
    });

    if (!verdict.ok) {
      if (probeStarved) {
        out.budgetExceeded = true;
        markUnreclaimed(pid, 'budget_exceeded');
      } else {
        // Not unlinked: everything here is either "not ours" or "still in use",
        // so the file must survive for the next session to see. `already_dead`
        // is left to scanForeignOrphans so the two paths never race to unlink
        // the same file.
        out.skipped.push({ pid: pid, reason: verdict.reason });
      }
      continue;
    }

    try {
      kill(pid, 'SIGTERM');
      out.reclaimed.push(pid);
      dropRecord(pid);
    } catch (err) {
      const code = err && err.code;
      if (code === 'ESRCH') {
        // Already gone — the outcome we wanted.
        out.reclaimed.push(pid);
        dropRecord(pid);
      } else if (code === 'EPERM') {
        // NOT folded into success: we lack permission, the process is still there.
        markUnreclaimed(pid, 'eperm');
      } else {
        markUnreclaimed(pid, code || 'kill_failed');
      }
    }
  }

  out.attempted = out.reclaimed.length + out.unreclaimed.length;

  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch (_) { /* non-empty or gone — either way the next session reads it */ }

  return out;
}

// ── §D14 SessionStart orphan sweep (reports live, purges only DEAD records) ──

function sessionLooksDead(records, dirPath, nowMs, isAlive) {
  const pids = records
    .filter((r) => validateRecord(r).ok)
    .map((r) => r.session_pid)
    .filter((p) => Number.isInteger(p) && p > 0);
  if (pids.length) return !pids.some((p) => isAlive(p));
  // Degraded identity — fall back to staleness of the directory itself.
  try {
    return (nowMs - fs.statSync(dirPath).mtimeMs) > ORPHAN_STALE_MS;
  } catch (_) { return false; }
}

/**
 * Reports FOREIGN orphans and prunes dead bookkeeping. It never calls
 * process.kill — UI1 forbids reclaiming another session's live processes, and
 * §Task 9(d) pins kill to reclaimSession alone, mechanically.
 *
 * Deleting the record of a pid that is already dead is not a kill: no process is
 * referenced, so the mis-kill risk is zero by definition. That is what makes
 * PRD `:78` (unbounded registry growth) satisfiable without touching UI1.
 *
 * @returns {{liveCount:number, purgedCount:number}} counts scoped to DEAD sessions.
 */
function scanForeignOrphans(repoRoot, selfSid, deps) {
  deps = deps || {};
  const isAlive = deps.isAlive || evidenceLock.isPidAlive;
  const nowMs = (deps.now || Date.now)();
  const out = { liveCount: 0, purgedCount: 0 };

  // This function UNLINKS. An escaped registry root would make it delete files
  // outside the repo, so containment is a precondition, not a nicety.
  const reg = containedRegistryDir(repoRoot);
  if (!reg) {
    warn('scanForeignOrphans refused: registry root resolves outside the repo (path_escape)');
    return out;
  }
  const realReg = realpathNearest(reg);
  let sids;
  try { sids = fs.readdirSync(reg); } catch (_) { return out; }

  for (const sid of sids) {
    if (sid === selfSid) continue;
    if (!isSafeSessionId(sid)) continue;
    const dir = path.join(reg, sid);
    // A single session dir can be a link out even when the root is clean, and
    // the unlink below would follow it.
    if (!isInside(realpathNearest(dir), realReg)) {
      warn('scanForeignOrphans skipped ' + sid + ': resolves outside the registry (path_escape)');
      continue;
    }
    let names;
    try { names = fs.readdirSync(dir); } catch (_) { continue; }

    const recordNames = names.filter((n) => n.endsWith('.json')
      && !n.endsWith('.failed.json') && !n.endsWith('.unreclaimed.json'));
    const parsed = [];
    for (const n of recordNames) {
      try { parsed.push({ name: n, rec: readJson(path.join(dir, n)) }); } catch (_) { /* leave it */ }
    }
    if (!sessionLooksDead(parsed.map((p) => p.rec), dir, nowMs, isAlive)) continue;

    for (const p of parsed) {
      const rec = p.rec;
      if (!validateRecord(rec).ok) continue;
      if (isAlive(rec.pid)) { out.liveCount++; continue; }   // count only — never touch (UI1)
      try { fs.unlinkSync(path.join(dir, p.name)); out.purgedCount++; } catch (_) { /* best-effort */ }
    }
    // `.unreclaimed.json` / `.failed.json` are deliberately preserved: they are
    // the audit surface that keeps failures loud (UI6). Purging them would turn
    // PRD `:76` "handle it next SessionStart" into evidence destruction.
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (_) { /* keep */ }
  }
  return out;
}

module.exports = {
  SCHEMA_VERSION,
  SEMANTICS,
  REGISTRY_DIRNAME,
  SESSION_ID_RE,
  KINDS,
  LIFETIMES,
  ROLES,
  IDENTITY_TOLERANCE_MS,
  IDENTITY_TOLERANCE_WIN32_MS,
  IDENTITY_TOLERANCE_POSIX_MS,
  PROBE_TIMEOUT_MS,
  PROBE_TIMEOUT_WIN32_MS,
  PROBE_TIMEOUT_POSIX_MS,
  DEFAULT_BUDGET_MS,
  HOOK_TIMEOUT_MS,
  MAX_BUDGET_MS,
  ORPHAN_STALE_MS,
  registryDir,
  containedRegistryDir,
  sessionDir,
  isSafeSessionId,
  containsPathToken,
  parseBudgetMs,
  validateRecord,
  register,
  registerFailure,
  list,
  unregister,
  collectSiblingReuse,
  normPath,
  probeProcess,
  resolveIdentityToleranceMs,
  isReclaimableBy,
  reclaimSession,
  scanForeignOrphans,
};
