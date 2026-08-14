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
const crypto = require('crypto');
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
// The nonce is CSPRNG, not `Math.random()`: the whole point of the suffix is to
// be unguessable to whoever might pre-create that path, and Math.random is
// seeded predictably enough that it does not carry that claim.
function writePrivate(file, text) {
  const tmp = file + '.' + process.pid + '.' +
    crypto.randomUUID() + '.tmp';
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

// The WRITE path seals the session dir (sealedSessionDir); the READ/UNLINK path
// has to seal it too, and originally did not. Sealing only the registry ROOT
// there was not enough: replace `<registry>/<sid>` with a link out after
// registration and reclaim would judge records from outside the repo, kill the
// pid they name, and unlink files on the far side. Reproduced before this guard
// existed. `scanForeignOrphans` already carried the per-directory check — the
// reclaim path was the inconsistency.
function containedSessionDir(repoRoot, sid) {
  const reg = containedRegistryDir(repoRoot);
  if (!reg) return null;
  const dir = sessionDir(repoRoot, sid);
  if (!isInside(realpathNearest(dir), realpathNearest(reg))) return null;
  return dir;
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

// This unlinks, so it needs the same containment the other unlink paths have.
// It was the ONE mutating path left without it — register seals, list seals,
// reclaimSession seals (and re-seals before every write), scanForeignOrphans
// seals per directory, and clean shutdown came through here unguarded. Replace
// `<registry>/<sid>` with a link out after registration and a normal dashboard
// close or runner exit would delete a file outside the repo.
function unregister(repoRoot, sid, pid) {
  const dir = containedSessionDir(repoRoot, sid);
  if (!dir) {
    warn('unregister refused: ' + sid + ' resolves outside the registry (path_escape)');
    return { ok: false, reason: 'path_escape' };
  }
  try {
    fs.unlinkSync(recordPath(dir, pid));
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

  // Defense in depth for the escaped-path case. Returning NO records with
  // `incomplete: true` is the fail-closed direction: reclaimSession kills
  // nothing and reports itself unfinished. Suppressing only the sibling sweep
  // would have been fail-OPEN — fewer "in use" records means MORE kills.
  // The SESSION dir is checked, not just the root: a link at either level puts
  // the records we are about to judge outside the repo.
  const dir = containedSessionDir(repoRoot, sid);
  if (!dir) {
    warn('list refused: ' + sid + ' resolves outside the registry (path_escape)');
    out.incomplete = true;
    return out;
  }

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
// `deps.deadline` (absolute ms) bounds the scan. It exists because this is the
// one genuinely unbounded piece of the SessionEnd sweep: §D11 forbids memoizing
// it, so it re-reads EVERY sibling directory and file for EVERY record, and the
// budget loop only checks elapsed time BETWEEN records — a single pass over a
// large registry could therefore run past the hook's 10s timeout on its own.
// Hitting the deadline marks the result INCOMPLETE, which blocks the kill.
// Fail-closed: running out of time to check whether someone else is using a
// process is not permission to kill it.
function collectSiblingReuse(repoRoot, selfSid, deps) {
  deps = deps || {};
  const now = deps.now || Date.now;
  const deadline = Number.isFinite(deps.deadline) ? deps.deadline : Infinity;
  const outOfTime = () => now() > deadline;
  const out = [];
  // Non-enumerable so the array still behaves as a plain list of records for
  // every existing caller and test, while carrying the one bit that decides
  // whether reclaim may proceed.
  //
  // EVERY exit goes through `done()`. The scaffolding is declared before the
  // first possible return for exactly that reason: this function once returned
  // a bare `[]` on the path_escape path, so `.incomplete` came back `undefined`
  // — falsy, i.e. "we checked and nobody is using it" — on the single most
  // safety-relevant exit. It was harmless only because every present caller
  // happens to check containment first, which is a property of the callers, not
  // of this function.
  let incomplete = false;
  const markIncomplete = (why) => { incomplete = true; warn('collectSiblingReuse ' + why); };
  const done = () => {
    Object.defineProperty(out, 'incomplete', {
      value: incomplete, enumerable: false, writable: true, configurable: true,
    });
    return out;
  };

  const reg = containedRegistryDir(repoRoot);
  if (!reg) {
    markIncomplete('refused: registry root resolves outside the repo (path_escape)');
    return done();
  }

  let sids;
  try {
    sids = fs.readdirSync(reg);
  } catch (err) {
    // ENOENT is genuinely "no siblings exist". Anything else is "we could not
    // look", which is a different fact and must not read as absence.
    if (!err || err.code !== 'ENOENT') markIncomplete('readdir failed: ' + (err && err.message));
    return done();
  }
  const realReg = realpathNearest(reg);
  for (const sid of sids) {
    if (outOfTime()) { markIncomplete('ran out of time before scanning ' + sid); break; }
    if (sid === selfSid) continue;
    if (!isSafeSessionId(sid)) continue;
    const sibDir = path.join(reg, sid);
    // Per-directory containment, the same check scanForeignOrphans carries. A
    // clean root does not make every directory under it clean: one sibling dir
    // replaced by a link out would have this reading attacker-chosen JSON from
    // outside the repo as reclaim evidence. `incomplete`, not `continue`,
    // because a sibling we refused to read is a sibling we did not check.
    if (!isInside(realpathNearest(sibDir), realReg)) {
      markIncomplete('skipped ' + sid + ': resolves outside the registry (path_escape)');
      continue;
    }
    let names;
    try { names = fs.readdirSync(sibDir); }
    catch (err) { markIncomplete('cannot list ' + sid + ': ' + (err && err.message)); continue; }
    for (const name of names) {
      if (outOfTime()) { markIncomplete('ran out of time inside ' + sid); break; }
      if (!name.endsWith('.json')) continue;
      if (name.endsWith('.failed.json') || name.endsWith('.unreclaimed.json')) continue;
      let rec;
      try { rec = readJson(path.join(sibDir, name)); }
      catch (err) {
        // An unreadable file may have been the reuse record that proves a
        // borrower is still live. Skipping it silently is fail-OPEN: the guard
        // disappears and the owner kills a process still in use.
        markIncomplete('cannot read ' + sid + '/' + name + ': ' + (err && err.message));
        continue;
      }
      if (!validateRecord(rec).ok) {
        // Parseable but untrusted. We can still read `role`, and a record that
        // is definitively NOT a reuse record was never a guard — ignoring it is
        // safe, and NOT treating it as incomplete is what keeps a future schema
        // bump from blocking reclaim on every legacy owner record.
        if (rec && typeof rec === 'object' && rec.role === 'reuse') {
          markIncomplete('untrusted reuse record ' + sid + '/' + name);
        }
        continue;
      }
      if (rec.role !== 'reuse') continue;
      out.push(rec);
    }
  }
  return done();
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

// Axis 1 has to answer "is this script the one EXECUTING", not the much weaker
// "does this command line mention this script". Substring containment answers
// the weak question, and the gap between them is a kill: `node other.js
// /repo/.../dashboard-server.js` names our path as DATA, and a recycled pid
// whose start time also lands inside the tolerance would be terminated.
//
// The rule that closes it: our path must be the FIRST script-shaped token on the
// command line. Both real launch shapes put it there —
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dashboard-server.js" $ARGUMENTS
//   nohup node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-codex-runner.js" …
// — while `node other.js <ourpath>` puts `other.js` there instead, and is now
// refused. Flag-shaped tokens are skipped, so interpreter flags
// (`node --enable-source-maps <ourpath>`) do not knock the real script out of
// first place; that false-negative class was the reason a
// "reject anything preceded by a flag" rule was rejected.
//
// The compare is EQUALITY, not containment, so `<path>.bak`, `<path>.lock` and
// `/evil<path>` are all refused as the different files they are.
//
// Residual, stated rather than papered over: a RELATIVE launch
// (`node scripts/lib/x.js` from the repo root) reads as identity_mismatch,
// because the record holds `__filename` and there is no safe way to re-anchor a
// relative token — accepting a suffix match would reinstate exactly the
// basename collision the whole-path rule exists to prevent. That direction is
// fail-closed (a missed reclaim, recorded in `skipped[]`), and neither mccp
// launch shape is relative.
const SCRIPT_EXT_RE = /\.(?:js|mjs|cjs)$/;

// Quote-aware: a win32 command line is `"C:\…\node.exe" "C:\…\script.js"`, so
// splitting on whitespace alone would shred any path containing a space.
function tokenizeCommandLine(s) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of String(s == null ? '' : s)) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ' ' || ch === '\t') {
      if (cur) { out.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// §D15 axis 1 is TWO independent questions, and collapsing them into one
// command-line rule is what produced santa-loop R7's critical finding.
//
//   1. Is `wantPath` the script this command line RUNS (not one it mentions)?
//      -> isExecutedScript, below. A token rule answers this.
//   2. Is a node interpreter the thing running it?
//      -> isNodeInterpreterImage. A token rule CANNOT answer this.
//
// The old rule asked (2) by testing whether a `node` token appeared anywhere
// before the script. `grep node <ourpath>` and `echo node <ourpath>` satisfy
// that while running no script at all, so a recycled pid landing inside the
// start-time tolerance reached `owned_session_scoped` and SIGTERMed an
// unrelated process. `nohup node <ourpath>` — which MUST keep matching, locked
// by test `identity 3e` — is the same token sequence, so no tightening of the
// token rule separates them. Only the executable image does.
const NODE_IMAGE_RE = /^node(?:js)?(?:\.exe)?$/i;

// The kernel's answer to "what binary is this pid", never a command-line token.
// `grep node <path>` has image `grep`. `nohup node <path>` has image `node`,
// because nohup EXECs node rather than remaining in the process.
function isNodeInterpreterImage(image) {
  if (!image) return false;
  const base = String(image).replace(/\\/g, '/').split('/').pop();
  return NODE_IMAGE_RE.test(base);
}

function isExecutedScript(commandLine, wantPath) {
  if (!wantPath || !commandLine) return false;
  const tokens = tokenizeCommandLine(commandLine);
  const scriptIdx = tokens.findIndex((t) => t[0] !== '-' && SCRIPT_EXT_RE.test(t));
  return scriptIdx !== -1 && tokens[scriptIdx] === wantPath;
}

// win32 emits ONE DELIMITED line rather than one field per line. An empty
// ExecutablePath or CommandLine (both occur — access-denied and kernel-owned
// pids) would otherwise print nothing and SHIFT every later field up, handing
// the parser a command line where it expects an image.
//
// The delimiter is `|` because Windows FORBIDS it in a file name, so it cannot
// appear inside the two fields the parser has to split on (an epoch integer and
// an executable PATH). A tab would not do: NTFS permits 0x09 in a name, so a
// binary living under a tabbed directory would split wrong. The command line is
// last and may contain `|` freely — only the first two delimiters are read.
const WIN32_PROBE_DELIM = '|';

function parseWin32ProbeLine(body) {
  if (!body) return null;
  const i1 = body.indexOf(WIN32_PROBE_DELIM);
  if (i1 === -1) return null;
  const i2 = body.indexOf(WIN32_PROBE_DELIM, i1 + 1);
  if (i2 === -1) return null;
  const ms = Number(body.slice(0, i1).trim());
  if (!Number.isInteger(ms) || ms <= 0) return null;
  const image = body.slice(i1 + 1, i2).trim();
  return {
    startedAtMs: ms,
    commandLine: body.slice(i2 + 1).trim(),
    execImage: image || null,
  };
}

/**
 * @returns {{startedAtMs: number, commandLine: string, execImage: string|null}|null}
 *   null on every failure mode — unsupported platform, spawn failure, timeout,
 *   permission denial, empty or non-integer output. The caller reads null as
 *   `identity_unverifiable` and does NOT kill.
 *
 * Both branches emit an INTEGER epoch-ms directly so no locale-dependent date
 * text is ever parsed (`ps -o lstart` is locale-shaped; CIM `CreationDate`
 * serializes differently per environment).
 *
 * `execImage` is the executable image — the binary the kernel is running, not a
 * token off the command line. It is the only thing that separates `nohup node
 * <path>` from `grep node <path>` (santa-loop R7/R8, both reviewers). It is
 * `null` when the platform would not give it up, which the caller reads as
 * `identity_unverifiable` — never as permission to kill.
 */
function probeProcess(pid, deps) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  deps = deps || {};
  const platform = deps.platform || process.platform;
  const run = deps.execFileSync || execFileSync;
  const readLink = deps.readlinkSync || fs.readlinkSync;
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
        'if($p){$ms=[long]([datetime]$p.CreationDate).ToUniversalTime()' +
        ".Subtract([datetime]'1970-01-01').TotalMilliseconds;" +
        "$i=$p.ExecutablePath; if(-not $i){$i=''};" +
        "$c=$p.CommandLine; if(-not $c){$c=''};" +
        '"$ms|$i|$c"}';
      const out = run('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script], opts);
      return parseWin32ProbeLine(String(out || '').replace(/\r/g, '')
        .split('\n').filter((s) => s.trim().length).join(' '));
    }
    // `etimes` is ELAPSED SECONDS — locale-free and immune to wall-clock jumps
    // and DST, unlike an absolute start timestamp. `comm` carries the image and
    // sits BEFORE `args` because args is the field that holds spaces.
    const out = run('ps', ['-o', 'etimes=,comm=,args=', '-p', String(pid)], opts);
    const line = String(out || '').split(/\r?\n/).find((s) => s.trim().length);
    if (!line) return null;
    const m = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) return null;
    const etimes = Number(m[1]);
    if (!Number.isInteger(etimes) || etimes < 0) return null;
    // `/proc/<pid>/exe` is the kernel's own answer and outranks `comm`, which a
    // process can rewrite (prctl PR_SET_NAME) and which Linux truncates to 15
    // characters. Where there is no procfs (macOS, BSD) `comm` stands.
    let image = m[2];
    try {
      const link = readLink('/proc/' + pid + '/exe');
      if (link && String(link).trim()) image = String(link).trim();
    } catch (_) { /* no procfs — comm stands */ }
    return {
      startedAtMs: Date.now() - etimes * 1000,
      commandLine: m[3],
      execImage: image || null,
    };
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
  // The `in_use_by_live_session` row below is only as good as the evidence it
  // reads. If any of that evidence was unreadable, "no sibling holds this" is
  // not something we know — it is something we failed to check, and acting on
  // it kills a process another live session is using.
  if (siblings.incomplete) {
    return { ok: false, reason: 'sibling_evidence_unreadable' };
  }
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
  // No image means the platform would not say WHAT is running under this pid.
  // That is "cannot verify", not "not ours" — and it must not fall through to
  // the command-line rules, which on their own cannot tell `nohup node <path>`
  // from `grep node <path>`. Falling through is exactly the santa-loop R7
  // critical; the fail-closed cost is a missed reclaim, recorded in skipped[].
  if (!p.execImage) {
    return { ok: false, reason: 'identity_unverifiable' };
  }
  // Every process that reaches this gate is a node script by construction: both
  // registering kinds pass `execPath: __filename` from inside a node module,
  // and the one non-node kind (`handoff-session`, powershell) is excluded
  // before identity is ever consulted. So a non-node image is not our process.
  if (!isNodeInterpreterImage(p.execImage)) {
    return { ok: false, reason: 'identity_mismatch' };
  }
  if (Math.abs(p.startedAtMs - record.proc_started_at_ms) > tolerance) {
    return { ok: false, reason: 'identity_mismatch' };
  }
  const want = normPath(record.exec_path, platform);
  const got = normPath(p.commandLine, platform);
  // Whole path, never basename: a bare filename is too short to name a process
  // (any directory can hold a `dashboard-server.js`), while the absolute path
  // carries repo_root inside it and cannot collide by accident. And it must be
  // the script being EXECUTED, not merely a path the command line mentions —
  // see isExecutedScript. The interpreter question is the image check above.
  if (!isExecutedScript(got, want)) {
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
  // whose these are" is to kill none of them. Both levels are checked — root AND
  // this session's directory.
  const dir = containedSessionDir(repoRoot, sessionId);
  if (!dir) {
    warn('reclaim refused: the registry root or session dir resolves outside the '
      + 'repo (path_escape) — nothing is reclaimed');
    out.complete = false;
    return out;
  }

  const started = now();
  const l = list(repoRoot, sessionId, { isAlive: isAlive });
  if (l.incomplete) out.complete = false;
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

  // Re-validated immediately before every mutating op, not only once at entry.
  // A link swapped in mid-sweep would otherwise redirect the write or the
  // unlink to the far side. This NARROWS the window to the gap between this
  // check and the syscall — Node's sync fs offers no fd-relative variant that
  // would close it outright — and the direction on failure is to touch nothing.
  function dirStillContained() {
    if (containedSessionDir(repoRoot, sessionId)) return true;
    warn('registry path stopped resolving inside the repo mid-sweep — refusing '
      + 'to write or unlink anything further for ' + sessionId);
    return false;
  }

  function markUnreclaimed(pid, reason) {
    out.unreclaimed.push({ pid: pid, reason: reason });
    if (!dirStillContained()) {
      out.writeFailures.push({ pid: pid, op: 'unreclaimed_write', message: 'path_escape' });
      return;
    }
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
    if (!dirStillContained()) {
      out.writeFailures.push({ pid: pid, op: 'unlink', message: 'path_escape' });
      return;
    }
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
    // The sibling sweep inherits the sweep's own deadline. Without it, the one
    // unbounded scan in this function could blow the hook timeout by itself —
    // the loop check above only fires BETWEEN records.
    const collectWithDeadline = function (root, sid) {
      return collect(root, sid, { deadline: started + budgetMs, now: now });
    };

    const verdict = isReclaimableBy(rec, {
      host: host, repoRoot: repoRoot, sessionId: sessionId, isAlive: isAlive,
      probeProcess: guardedProbe, collectSiblingReuse: collectWithDeadline,
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

  // Same containment discipline as every other mutating op (santa-loop R7
  // Reviewer B). This one only removes an EMPTY directory, so a lost race costs
  // an empty rmdir rather than a kill — but "most mutating paths are sealed" is
  // exactly the partial-coverage shape six prior rounds kept finding, and the
  // invariant is cheaper to hold uniformly than to reason about per site.
  if (dirStillContained()) {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch (_) { /* non-empty or gone — either way the next session reads it */ }
  }

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
 * @returns {{liveCount:number, purgedCount:number, unreadable:number, purgeFailures:number}}
 *   counts scoped to DEAD sessions. `unreadable` and `purgeFailures` exist so a
 *   sweep that could not do its job is distinguishable from one that had nothing
 *   to do — without them both report as a clean zero.
 */
// A reuse record whose OWNING session is provably dead ALREADY reads as
// "not in use" to isSiblingLive — same host, an integer session_pid, and that
// pid dead is exactly the branch that returns false there. So deleting it cannot
// change a single reclaim decision: this is garbage collection, not a policy
// change, and that equivalence is the whole reason it is safe.
//
// The records isSiblingLive still honours FAIL-CLOSED — `session_pid === null`
// (degraded identity) or another host (liveness unknowable) — are deliberately
// left alone, even though they are precisely the ones that accumulate in
// degraded environments. Purging those would silently convert "we cannot tell if
// anyone is still using this" into "nobody is", which authorizes a kill. Bounded
// growth is worth less than that.
function isInertReuseRecord(rec, host, isAlive) {
  return rec.role === 'reuse'
    && rec.host === host
    && Number.isInteger(rec.session_pid)
    && !isAlive(rec.session_pid);
}

function scanForeignOrphans(repoRoot, selfSid, deps) {
  deps = deps || {};
  const isAlive = deps.isAlive || evidenceLock.isPidAlive;
  const host = deps.host || os.hostname();
  const nowMs = (deps.now || Date.now)();
  const out = { liveCount: 0, purgedCount: 0, unreadable: 0, purgeFailures: 0 };

  // This function UNLINKS. An escaped registry root would make it delete files
  // outside the repo, so containment is a precondition, not a nicety.
  const reg = containedRegistryDir(repoRoot);
  if (!reg) {
    warn('scanForeignOrphans refused: registry root resolves outside the repo (path_escape)');
    return out;
  }
  const realReg = realpathNearest(reg);
  let sids;
  try { sids = fs.readdirSync(reg); }
  catch (err) {
    // ENOENT means there is nothing to sweep. Anything else means we could not
    // sweep, and folding that into a clean zero is how a registry grows unseen.
    if (err && err.code !== 'ENOENT') {
      out.unreadable++;
      warn('scanForeignOrphans cannot list the registry: ' + err.message);
    }
    return out;
  }

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
    try { names = fs.readdirSync(dir); }
    catch (err) {
      // Same rule as everywhere else here: a directory we could not read is not
      // a directory with nothing in it.
      out.unreadable++;
      warn('scanForeignOrphans cannot list ' + sid + ': ' + (err && err.message));
      continue;
    }

    const recordNames = names.filter((n) => n.endsWith('.json')
      && !n.endsWith('.failed.json') && !n.endsWith('.unreclaimed.json'));
    const parsed = [];
    for (const n of recordNames) {
      try { parsed.push({ name: n, rec: readJson(path.join(dir, n)) }); }
      catch (err) {
        // Counted and named, not dropped. An unreadable record is a record whose
        // pid we can no longer account for — the exact state UI6 says must stay
        // loud rather than look like a clean sweep.
        out.unreadable++;
        warn('scanForeignOrphans cannot read ' + sid + '/' + n + ': ' + (err && err.message));
      }
    }
    if (!sessionLooksDead(parsed.map((p) => p.rec), dir, nowMs, isAlive)) continue;

    for (const p of parsed) {
      const rec = p.rec;
      if (!validateRecord(rec).ok) continue;
      // A LIVE pid is never touched (UI1) — unless the record is an inert reuse
      // marker, where the thing being deleted is bookkeeping about someone
      // else's dead session, not a claim on the live process itself. That is the
      // case PRD :78 needs: one dir per short session that borrowed a long-lived
      // dashboard, otherwise kept for as long as the dashboard runs.
      if (isAlive(rec.pid) && !isInertReuseRecord(rec, host, isAlive)) {
        out.liveCount++;
        continue;
      }
      try { fs.unlinkSync(path.join(dir, p.name)); out.purgedCount++; }
      catch (err) {
        // Best-effort in EFFECT, but not in silence: a purge that keeps failing
        // is how PRD :78 (unbounded growth) comes back, and nothing else in the
        // system would ever say so.
        out.purgeFailures++;
        warn('scanForeignOrphans cannot purge ' + sid + '/' + p.name + ': ' + (err && err.message));
      }
    }
    // `.unreclaimed.json` / `.failed.json` are deliberately preserved: they are
    // the audit surface that keeps failures loud (UI6). Purging them would turn
    // PRD `:76` "handle it next SessionStart" into evidence destruction.
    // Re-sealed, not carried over from the entry check at the top of this
    // iteration (santa-loop R7 Reviewer B): the purge loop above ran syscalls in
    // between, so the earlier result is stale by the time we mutate again.
    if (isInside(realpathNearest(dir), realReg)) {
      try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (_) { /* keep */ }
    }
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
  containedSessionDir,
  sessionDir,
  isSafeSessionId,
  tokenizeCommandLine,
  isExecutedScript,
  isNodeInterpreterImage,
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
