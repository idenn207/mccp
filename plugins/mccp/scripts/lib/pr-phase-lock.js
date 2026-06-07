'use strict';

// pr-phase-lock — Codex-review subphase lock lifecycle CLI.
//
// v0.2.8 Task 2.6.1 R4-F2 absorption: declarative review-only invariant in
// pr.md is not enough to block a single AI lapse mid-Codex-review. This CLI
// owns the lock file lifecycle so the PreToolUse/PostToolUse guard hook has
// a single source of truth (the lock file) to enforce default-deny on
// write tools while Codex-review is active.
//
// v0.2.8 Task 2.6.1-FIX absorption (PR-Codex Round 1: F1+F2+F3+F4):
//   F4  cmdEnter uses fs.openSync(p,'wx') exclusive create (not readLock +
//       atomicWrite — TOCTOU); lockBody includes host=os.hostname() and
//       ownership_token=crypto.randomUUID(). enter stdout returns the
//       ownership_token so callers can pass it to heartbeat/exit.
//   F3  cmdDetectStale adopts host-aware tri-state policy mirroring
//       v0.2.8-generic-receipt-quarantine.js tryReclaimStaleLock:
//         same-host + pid-alive → NEVER reclaim (heartbeat keeps mtime fresh)
//         same-host + pid-dead  → reclaim (orphan)
//         cross-host            → mtime-only (foreign PID is meaningless)
//         zero-byte/unparseable → mtime-only (no host to compare)
//       New cmdHeartbeat({run-id, ownership-token}) lets long Codex calls
//       keep mtime fresh (caller responsibility — pr.md Bash background loop
//       around the spawnSync window; spawnSync itself blocks so an in-loop
//       heartbeat inside codex-invoke.js cannot run).
//   F2  computeMutations re-captures current head_sha + index_tree and
//       diffs against baseline.head_sha + baseline.index_tree, emitting
//       'head-changed' / 'index-changed' mutation reasons. Catches the
//       `git commit ... && git reset --soft HEAD~1` re-stage bypass that
//       leaves the porcelain delta empty.
//
// Token authority split (R2-F1 + R3-F1 + R3-F2 absorbed):
//   cmdExit       — REQUIRES --run-id AND --ownership-token. Wrong/missing
//                   token = exit 16 + stderr warn, NO unlinkSync. This is
//                   the only owner-release path.
//   cmdHeartbeat  — REQUIRES --run-id AND --ownership-token. Wrong/missing
//                   token = exit 15 + stderr warn, NO utimesSync.
//   cmdDetectStale — never takes a token. Operates on objectively stale /
//                   corrupt locks via the host-aware lease policy alone.
//                   Zero-byte and unparseable bodies fall through to
//                   mtime-only reclaim (no owner to verify against).
//
// Subcommands:
//   enter --run-id <uuid> [--pid <int>] [--subphase codex-review] [--branch]
//   exit  --run-id <uuid> --ownership-token <uuid> [--cwd <path>]
//   heartbeat --run-id <uuid> --ownership-token <uuid> [--cwd <path>]
//   detect-stale [--max-age-ms <ms>] [--cwd <path>]
//   read [--cwd <path>]
//
// Lock file: .claude/state/pr-phase.lock  (wx-exclusive create).
// The lock file itself is the run_id propagation SSoT (R4-F2 commitment) —
// hooks read it instead of relying on env variables.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const LOCK_DIRNAME = path.join('.claude', 'state');
const LOCK_FILENAME = 'pr-phase.lock';
const STALE_MS_DEFAULT = 60 * 1000;
const SUBPHASE_DEFAULT = 'codex-review';

function repoRoot(cwd) {
  cwd = cwd || process.cwd();
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd, encoding: 'utf8',
    }).trim();
  } catch (err) {
    throw new Error('not a git repo (or git not in PATH): ' + err.message);
  }
}

function lockPath(root) {
  return path.join(root, LOCK_DIRNAME, LOCK_FILENAME);
}

function gitStdout(args, cwd) {
  return execFileSync('git', args, { cwd: cwd, encoding: 'utf8' }).trim();
}

function gitStdoutBuffer(args, cwd) {
  return execFileSync('git', args, { cwd: cwd });
}

function parsePorcelainZ(buf) {
  const entries = [];
  let i = 0;
  while (i < buf.length) {
    if (buf.length - i < 3) break;
    const status = buf.toString('utf8', i, i + 2);
    i += 3;
    let nul = i;
    while (nul < buf.length && buf[nul] !== 0) nul += 1;
    const p = buf.toString('utf8', i, nul);
    i = nul + 1;
    entries.push({ status: status, path: p });
    if (status[0] === 'R' || status[0] === 'C') {
      let nul2 = i;
      while (nul2 < buf.length && buf[nul2] !== 0) nul2 += 1;
      i = nul2 + 1;
    }
  }
  return entries;
}

function dirtyPathsFromPorcelain(buf) {
  return parsePorcelainZ(buf).map(function (e) { return e.path; });
}

function fileHashSafe(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return null;
    throw err;
  }
}

function captureBaseline(root) {
  const headSha = gitStdout(['rev-parse', 'HEAD'], root);
  const indexTree = gitStdout(['write-tree'], root);
  const porcelainBuf = gitStdoutBuffer([
    'status', '--porcelain=v1', '-z', '--untracked-files=all',
  ], root);
  const porcelainB64 = porcelainBuf.toString('base64');
  const dirty = dirtyPathsFromPorcelain(porcelainBuf);
  const dirtyHashes = {};
  for (let i = 0; i < dirty.length; i++) {
    const rel = dirty[i];
    const abs = path.join(root, rel);
    const h = fileHashSafe(abs);
    if (h !== null) dirtyHashes[rel] = h;
  }
  return {
    head_sha: headSha,
    index_tree: indexTree,
    porcelain_z: porcelainB64,
    dirty_content_hashes: dirtyHashes,
  };
}

function readLock(root) {
  const p = lockPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (raw.length === 0) return { _zero_byte: true };
    return JSON.parse(raw);
  } catch (err) {
    return { _parse_error: err.message };
  }
}

function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'EPERM') return true;
    return false;
  }
}

// F3 host-aware reclaim — mirror of v0.2.8-generic-receipt-quarantine.js
// tryReclaimStaleLock. Returns true if the lock was reclaimed (unlinked),
// false otherwise. Cannot be called during cmdEnter race recovery; callers
// must `try { fs.openSync('wx') } catch (EEXIST)` and only then invoke this.
//
// Policy:
//   same-host + pid-alive      → false (NEVER reclaim — live holder; heartbeat
//                                  keeps mtime fresh)
//   same-host + pid-dead       → true  (orphan reclaim)
//   cross-host                 → mtime > LEASE_TTL ? true : false
//   zero-byte / unparseable    → mtime > LEASE_TTL ? true : false
function tryReclaimStaleLock(lockFilePath, maxAgeMs) {
  const leaseTtl = (typeof maxAgeMs === 'number' && maxAgeMs > 0)
    ? maxAgeMs : STALE_MS_DEFAULT;
  let stat;
  try { stat = fs.statSync(lockFilePath); } catch (_) { return false; }
  const mtimeMs = stat.mtimeMs || (stat.mtime && stat.mtime.getTime()) || 0;
  const ageMs = Date.now() - mtimeMs;
  const mtimeStale = Number.isFinite(ageMs) && ageMs > leaseTtl;

  let body = null;
  let raw = '';
  try { raw = fs.readFileSync(lockFilePath, 'utf8'); } catch (_) { return false; }
  if (raw.length > 0) {
    try { body = JSON.parse(raw); } catch (_) { body = null; }
  }

  if (!body || typeof body !== 'object') {
    if (!mtimeStale) return false;
    try { fs.unlinkSync(lockFilePath); return true; } catch (_) { return false; }
  }

  const sameHost = !!(body.host && body.host === os.hostname());
  if (sameHost) {
    if (isPidAlive(body.pid)) return false;
    try { fs.unlinkSync(lockFilePath); return true; } catch (_) { return false; }
  }

  if (mtimeStale) {
    try { fs.unlinkSync(lockFilePath); return true; } catch (_) { return false; }
  }
  return false;
}

const SELF_EXCLUDE_PREFIXES = [
  '.claude/state/pr-phase.lock',
  '.claude/state/hook-trace/',
  '.claude/receipts/',
  '.git/',
];

function isSelfExcluded(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  const norm = rel.replace(/\\/g, '/');
  for (let i = 0; i < SELF_EXCLUDE_PREFIXES.length; i++) {
    const prefix = SELF_EXCLUDE_PREFIXES[i];
    if (norm === prefix || norm.startsWith(prefix)) return true;
    if (norm.startsWith(prefix + '.')) return true;
  }
  return false;
}

// F2 — computeMutations now re-captures current head_sha + index_tree and
// diffs against baseline. Catches commit-then-reset-soft and git-add restage
// patterns that leave porcelain_z empty but mutate git state mid-subphase.
function computeMutations(root, baseline) {
  const mutations = [];

  // F2 — head_sha diff (commit happened mid-subphase)
  const currentHead = gitStdout(['rev-parse', 'HEAD'], root);
  if (baseline.head_sha && currentHead !== baseline.head_sha) {
    mutations.push({
      path: null,
      reason: 'head-changed',
      baseline_head: baseline.head_sha,
      current_head: currentHead,
    });
  }

  // F2 — index_tree diff (git add happened mid-subphase even if porcelain
  // shows no net change, e.g. add-then-restore-then-add)
  const currentIndexTree = gitStdout(['write-tree'], root);
  if (baseline.index_tree && currentIndexTree !== baseline.index_tree) {
    mutations.push({
      path: null,
      reason: 'index-changed',
      baseline_index: baseline.index_tree,
      current_index: currentIndexTree,
    });
  }

  const currentBuf = gitStdoutBuffer([
    'status', '--porcelain=v1', '-z', '--untracked-files=all',
  ], root);
  const baselineBuf = Buffer.from(baseline.porcelain_z, 'base64');
  const baselinePaths = new Set(
    dirtyPathsFromPorcelain(baselineBuf).filter(function (p) { return !isSelfExcluded(p); })
  );
  const currentPaths = new Set(
    dirtyPathsFromPorcelain(currentBuf).filter(function (p) { return !isSelfExcluded(p); })
  );
  for (const p of currentPaths) {
    if (!baselinePaths.has(p)) {
      mutations.push({ path: p, reason: 'untracked-or-new-status' });
    }
  }
  for (const p of baselinePaths) {
    if (!currentPaths.has(p)) {
      mutations.push({ path: p, reason: 'dirty-cleaned-during-subphase' });
    }
  }
  const dirty = baseline.dirty_content_hashes || {};
  for (const rel of Object.keys(dirty)) {
    if (isSelfExcluded(rel)) continue;
    const abs = path.join(root, rel);
    const before = dirty[rel];
    const now = fileHashSafe(abs);
    if (now === null) {
      mutations.push({ path: rel, reason: 'deleted-during-subphase' });
    } else if (now !== before) {
      mutations.push({ path: rel, reason: 'content-changed-during-subphase' });
    }
  }
  return mutations;
}

// F4 — cmdEnter uses fs.openSync(p, 'wx') exclusive create (R4-F2 absorbed).
// On EEXIST, try host-aware reclaim ONCE then retry the wx open. Adds
// ownership_token + host to the body. Returns the token in stdout JSON so
// callers (pr.md Bash flow) can capture it for subsequent heartbeat/exit.
function cmdEnter(args) {
  const root = repoRoot(args.cwd);
  const baseline = captureBaseline(root);
  const ownershipToken = crypto.randomUUID();
  const lockBody = {
    run_id: args['run-id'],
    started_at: new Date().toISOString(),
    pid: parseInt(args.pid, 10) || process.pid,
    host: os.hostname(),
    ownership_token: ownershipToken,
    branch: args.branch || null,
    subphase: args.subphase || SUBPHASE_DEFAULT,
    baseline: baseline,
  };
  const body = JSON.stringify(lockBody, null, 2);
  const p = lockPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });

  function tryOpen() {
    const fd = fs.openSync(p, 'wx');
    try { fs.writeSync(fd, body); } finally { fs.closeSync(fd); }
  }

  try {
    tryOpen();
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const existing = readLock(root);
    if (existing && !existing._parse_error && !existing._zero_byte
        && existing.run_id === args['run-id']) {
      process.stderr.write(
        '[pr-phase-lock] lock already held by SAME run_id=' + args['run-id'] +
        ' (pid=' + existing.pid + '); refuse fresh enter — caller should ' +
        'exit the existing lock first.\n');
      return 11;
    }
    if (!tryReclaimStaleLock(p)) {
      process.stderr.write(
        '[pr-phase-lock] lock held by another run' +
        (existing && existing.run_id ? ' (run_id=' + existing.run_id + ')' : '') +
        ' and is not stale; refuse fresh enter.\n');
      process.stderr.write('Hint: pr-phase-lock detect-stale\n');
      return 11;
    }
    try { tryOpen(); }
    catch (err2) {
      process.stderr.write(
        '[pr-phase-lock] EEXIST after reclaim race: ' + (err2 && err2.message) + '\n');
      return 11;
    }
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    lock_path: p,
    run_id: lockBody.run_id,
    ownership_token: ownershipToken,
    host: lockBody.host,
    head_sha: baseline.head_sha,
    dirty_paths: Object.keys(baseline.dirty_content_hashes).length,
  }, null, 2) + '\n');
  return 0;
}

// R2-F1 + R3-F1 + R3-F2 — cmdExit REQUIRES --run-id AND --ownership-token.
// Missing or wrong token = exit 16 + stderr warn, NO unlinkSync.
// Token verification happens BEFORE the mutation finalizer runs to avoid
// computing baseline diffs we can't act on (cleaner stderr path).
function cmdExit(args) {
  const root = repoRoot(args.cwd);
  const lock = readLock(root);
  if (!lock) {
    process.stderr.write('[pr-phase-lock] no active lock to exit\n');
    return 12;
  }
  if (lock._zero_byte) {
    process.stderr.write(
      '[pr-phase-lock] lock is zero-byte (acquireLock window or corrupt); ' +
      'cmdExit cannot prove ownership — leaving for detect-stale\n');
    return 16;
  }
  if (lock._parse_error) {
    process.stderr.write(
      '[pr-phase-lock] lock corrupted (' + lock._parse_error + '); ' +
      'cmdExit cannot prove ownership — leaving for detect-stale\n');
    return 16;
  }

  if (!args['ownership-token']) {
    process.stderr.write(
      '[pr-phase-lock] cmdExit requires --ownership-token (R3-F1: no legacy ' +
      'token-less path). Lock left in place.\n');
    return 16;
  }
  if (args['run-id'] && lock.run_id !== args['run-id']) {
    process.stderr.write(
      '[pr-phase-lock] run_id mismatch (lock=' + lock.run_id +
      ' arg=' + args['run-id'] + '); refuse exit\n');
    return 14;
  }
  if (lock.ownership_token !== args['ownership-token']) {
    process.stderr.write(
      '[pr-phase-lock] ownership-token mismatch; refuse exit — lock left ' +
      'in place for detect-stale\n');
    return 16;
  }

  const baselineMissing = !lock.baseline ||
    typeof lock.baseline.head_sha !== 'string' ||
    typeof lock.baseline.porcelain_z !== 'string' ||
    !lock.baseline.dirty_content_hashes;
  let mutations = [];
  if (!baselineMissing) {
    try {
      mutations = computeMutations(root, lock.baseline);
    } catch (err) {
      mutations = [{ path: null, reason: 'compute-error: ' + err.message }];
    }
  }
  try { fs.unlinkSync(lockPath(root)); } catch (_) { /* best-effort */ }
  const result = {
    ok: !baselineMissing && mutations.length === 0,
    run_id: lock.run_id,
    subphase: lock.subphase,
    baseline_missing: baselineMissing,
    mutations: mutations,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.ok ? 0 : 1;
}

// R2-F1 + R3-F1 + R3-F2 — cmdDetectStale NEVER takes a token. Operates on
// objectively stale / corrupt locks via the host-aware lease policy (mirror
// of tryReclaimStaleLock). Zero-byte / unparseable bodies fall through to
// mtime-only reclaim because no owner exists to verify against.
function cmdDetectStale(args) {
  const root = repoRoot(args.cwd);
  const p = lockPath(root);
  const maxAge = parseInt(args['max-age-ms'], 10) || STALE_MS_DEFAULT;

  let stat;
  try { stat = fs.statSync(p); }
  catch (_) {
    process.stdout.write(JSON.stringify({ ok: true, stale: false }, null, 2) + '\n');
    return 0;
  }

  const lock = readLock(root);

  if (lock && !lock._parse_error && !lock._zero_byte) {
    const sameHost = !!(lock.host && lock.host === os.hostname());
    const pidAlive = isPidAlive(lock.pid);
    const ageMs = Date.now() - stat.mtimeMs;

    if (sameHost) {
      if (pidAlive) {
        process.stdout.write(JSON.stringify({
          ok: true, stale: false,
          reason: 'same-host-live-pid',
          host: lock.host, run_id: lock.run_id, pid_alive: true, age_ms: ageMs,
        }, null, 2) + '\n');
        return 0;
      }
      const reclaimed = tryReclaimStaleLock(p, maxAge);
      process.stdout.write(JSON.stringify({
        ok: true,
        stale: reclaimed,
        cleared: reclaimed,
        reason: reclaimed ? 'same-host-dead-pid' : 'same-host-dead-pid-but-reclaim-failed',
        host: lock.host, run_id: lock.run_id, pid_alive: false, age_ms: ageMs,
      }, null, 2) + '\n');
      return 0;
    }

    const reclaimed = tryReclaimStaleLock(p, maxAge);
    process.stdout.write(JSON.stringify({
      ok: true,
      stale: reclaimed,
      cleared: reclaimed,
      reason: reclaimed ? 'cross-host-mtime-exceeded' : 'cross-host-mtime-within-lease',
      host: lock.host || null, run_id: lock.run_id, pid_alive: pidAlive, age_ms: ageMs,
    }, null, 2) + '\n');
    return 0;
  }

  const reclaimed = tryReclaimStaleLock(p, maxAge);
  process.stdout.write(JSON.stringify({
    ok: true,
    stale: reclaimed,
    cleared: reclaimed,
    reason: lock && lock._zero_byte
      ? (reclaimed ? 'zero-byte-mtime-exceeded' : 'zero-byte-mtime-within-lease')
      : (reclaimed ? 'parse-error-mtime-exceeded' : 'parse-error-mtime-within-lease'),
    age_ms: Date.now() - stat.mtimeMs,
  }, null, 2) + '\n');
  return 0;
}

// R2-F1 + R3-F1 — cmdHeartbeat REQUIRES --run-id AND --ownership-token.
// Missing or wrong token = exit 15 + stderr warn, NO utimesSync.
// Touches lock mtime to keep host-aware reclaim from treating a slow-but-
// alive holder as cross-host stale (caller responsibility — pr.md Bash
// background loop around the codex-invoke spawnSync window).
function cmdHeartbeat(args) {
  const root = repoRoot(args.cwd);
  const lock = readLock(root);
  if (!lock) {
    process.stderr.write('[pr-phase-lock] no active lock to heartbeat\n');
    return 12;
  }
  if (lock._zero_byte || lock._parse_error) {
    process.stderr.write(
      '[pr-phase-lock] heartbeat cannot read lock body; skip\n');
    return 15;
  }
  if (!args['ownership-token']) {
    process.stderr.write(
      '[pr-phase-lock] cmdHeartbeat requires --ownership-token (R3-F1: no ' +
      'legacy token-less path). No mtime update.\n');
    return 15;
  }
  if (!args['run-id'] || lock.run_id !== args['run-id']) {
    process.stderr.write(
      '[pr-phase-lock] heartbeat run_id mismatch (lock=' + lock.run_id +
      ' arg=' + (args['run-id'] || 'MISSING') + '); refuse heartbeat\n');
    return 15;
  }
  if (lock.ownership_token !== args['ownership-token']) {
    process.stderr.write(
      '[pr-phase-lock] heartbeat ownership-token mismatch; refuse — no ' +
      'utimesSync\n');
    return 15;
  }
  const now = new Date();
  try { fs.utimesSync(lockPath(root), now, now); }
  catch (err) {
    process.stderr.write('[pr-phase-lock] heartbeat utimesSync failed: ' + err.message + '\n');
    return 15;
  }
  process.stdout.write(JSON.stringify({
    ok: true, run_id: lock.run_id, mtime: now.toISOString(),
  }) + '\n');
  return 0;
}

function cmdRead(args) {
  const root = repoRoot(args.cwd);
  const lock = readLock(root);
  if (!lock) {
    process.stdout.write(JSON.stringify({ active: false }) + '\n');
    return 0;
  }
  if (lock._zero_byte) {
    process.stdout.write(JSON.stringify({ active: false, zero_byte: true }) + '\n');
    return 0;
  }
  if (lock._parse_error) {
    process.stdout.write(JSON.stringify({ active: false, parse_error: lock._parse_error }) + '\n');
    return 0;
  }
  process.stdout.write(JSON.stringify({
    active: true,
    run_id: lock.run_id,
    subphase: lock.subphase,
    pid: lock.pid,
    host: lock.host || null,
    branch: lock.branch,
    started_at: lock.started_at,
  }) + '\n');
  return 0;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function showHelp() {
  process.stdout.write(
    'pr-phase-lock subcommands:\n' +
    '  enter --run-id <uuid> [--pid <int>] [--subphase codex-review] [--branch <name>] [--cwd <path>]\n' +
    '  exit  --run-id <uuid> --ownership-token <uuid> [--cwd <path>]\n' +
    '  heartbeat --run-id <uuid> --ownership-token <uuid> [--cwd <path>]\n' +
    '  detect-stale [--max-age-ms <ms>] [--cwd <path>]\n' +
    '  read [--cwd <path>]\n');
}

function main(argv) {
  const sub = argv[2];
  const rest = parseArgs(argv.slice(3));
  switch (sub) {
    case 'enter': return cmdEnter(rest);
    case 'exit': return cmdExit(rest);
    case 'heartbeat': return cmdHeartbeat(rest);
    case 'detect-stale': return cmdDetectStale(rest);
    case 'read': return cmdRead(rest);
    case '--help': case 'help': case undefined: showHelp(); return 0;
    default:
      process.stderr.write('pr-phase-lock: unknown subcommand "' + sub + '"\n');
      return 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  LOCK_DIRNAME,
  LOCK_FILENAME,
  STALE_MS_DEFAULT,
  SUBPHASE_DEFAULT,
  cmdEnter,
  cmdExit,
  cmdHeartbeat,
  cmdDetectStale,
  cmdRead,
  captureBaseline,
  computeMutations,
  tryReclaimStaleLock,
  readLock,
  lockPath,
  repoRoot,
  parsePorcelainZ,
  fileHashSafe,
  isPidAlive,
};
