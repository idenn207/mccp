'use strict';

// pr-phase-lock — Codex-review subphase lock lifecycle CLI.
//
// v0.2.8 Task 2.6.1 R4-F2 absorption: declarative review-only invariant in
// pr.md is not enough to block a single AI lapse mid-Codex-review. This CLI
// owns the lock file lifecycle so the PreToolUse/PostToolUse guard hook has
// a single source of truth (the lock file) to enforce default-deny on
// write tools while Codex-review is active.
//
// Subcommands:
//   enter --run-id <uuid> [--pid <int>] [--subphase codex-review] [--branch]
//         Captures baseline snapshot (head_sha + index_tree + porcelain_z +
//         dirty_content_hashes) and writes the lock file atomically.
//
//   exit  [--run-id <uuid>]
//         Reads lock, re-captures current state, computes mutation list
//         against baseline (porcelain_z byte-equal + dirty_content_hashes
//         per-file sha256 re-check). Deletes lock and emits finalizer JSON
//         to stdout.  Exit 0 = no mutations; exit 1 = mutations or baseline
//         missing (R4-F1 — silent fail-open forbidden).
//
//   detect-stale [--max-age-ms <ms>]
//         For invocation boot. If lock exists with dead pid OR mtime older
//         than threshold (default 60s), run finalizer first (preserve
//         mutation evidence) then clear the lock so the next /mccp:pr
//         invocation starts fresh.
//
//   read
//         Pure read of current lock state.  Used by pr-phase-guard hook
//         which needs to know if the lock is active without mutating it.
//
// Lock file: .claude/state/pr-phase.lock  (atomic temp-then-rename writes).
// The lock file itself is the run_id propagation SSoT (R4-F2 commitment) —
// hooks read it instead of relying on env variables.

const fs = require('fs');
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
  // Parse `git status --porcelain=v1 -z --untracked-files=all` output.
  // Each entry: 2-char XY status + space + path + NUL.
  // Renames/copies: status R/C → next entry is source path (also NUL-terminated).
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
  // Returns sha256 of file content, or null if file missing / is directory.
  // Caller uses null to record "deleted-during-subphase" mutation reason.
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

function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);
}

function readLock(root) {
  const p = lockPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
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

// Paths excluded from mutation detection — bookkeeping artifacts the lock
// itself writes between enter and exit. Without this filter, the lock file
// shows up as an untracked-or-new-status mutation on a clean exit.
const SELF_EXCLUDE_PREFIXES = [
  '.claude/state/pr-phase.lock',           // the lock file (and its .tmp variants)
  '.claude/state/hook-trace/',             // hook-trace ledger writes during subphase
  '.claude/receipts/',                     // receipt writes are expected post-subphase
  '.git/',                                 // git internal moves
];

function isSelfExcluded(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  const norm = rel.replace(/\\/g, '/');
  for (let i = 0; i < SELF_EXCLUDE_PREFIXES.length; i++) {
    const prefix = SELF_EXCLUDE_PREFIXES[i];
    if (norm === prefix || norm.startsWith(prefix)) return true;
    // .tmp suffix variants of the lock file
    if (norm.startsWith(prefix + '.')) return true;
  }
  return false;
}

function computeMutations(root, baseline) {
  const mutations = [];
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

function cmdEnter(args) {
  const root = repoRoot(args.cwd);
  const existing = readLock(root);
  if (existing && !existing._parse_error) {
    if (existing.run_id !== args['run-id']) {
      process.stderr.write(
        '[pr-phase-lock] lock already held by run_id=' + existing.run_id +
        ' (pid=' + existing.pid + '); refuse fresh enter.\n');
      process.stderr.write('Hint: pr-phase-lock detect-stale\n');
      return 11;
    }
  }
  const baseline = captureBaseline(root);
  const lockBody = {
    run_id: args['run-id'],
    started_at: new Date().toISOString(),
    pid: parseInt(args.pid, 10) || process.pid,
    branch: args.branch || null,
    subphase: args.subphase || SUBPHASE_DEFAULT,
    baseline: baseline,
  };
  atomicWrite(lockPath(root), JSON.stringify(lockBody, null, 2));
  process.stdout.write(JSON.stringify({
    ok: true,
    lock_path: lockPath(root),
    run_id: lockBody.run_id,
    head_sha: baseline.head_sha,
    dirty_paths: Object.keys(baseline.dirty_content_hashes).length,
  }, null, 2) + '\n');
  return 0;
}

function cmdExit(args) {
  const root = repoRoot(args.cwd);
  const lock = readLock(root);
  if (!lock) {
    process.stderr.write('[pr-phase-lock] no active lock to exit\n');
    return 12;
  }
  if (lock._parse_error) {
    process.stderr.write('[pr-phase-lock] lock corrupted (' + lock._parse_error + '); unlinking\n');
    try { fs.unlinkSync(lockPath(root)); } catch (_) { /* best-effort */ }
    return 13;
  }
  if (args['run-id'] && lock.run_id !== args['run-id']) {
    process.stderr.write(
      '[pr-phase-lock] run_id mismatch (lock=' + lock.run_id +
      ' arg=' + args['run-id'] + '); refuse exit\n');
    return 14;
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

function cmdDetectStale(args) {
  const root = repoRoot(args.cwd);
  const lock = readLock(root);
  if (!lock) {
    process.stdout.write(JSON.stringify({ ok: true, stale: false }, null, 2) + '\n');
    return 0;
  }
  if (lock._parse_error) {
    try { fs.unlinkSync(lockPath(root)); } catch (_) { /* best-effort */ }
    process.stdout.write(JSON.stringify({
      ok: true, stale: true, reason: 'parse-error', cleared: true,
    }, null, 2) + '\n');
    return 0;
  }
  const maxAge = parseInt(args['max-age-ms'], 10) || STALE_MS_DEFAULT;
  let stat;
  try { stat = fs.statSync(lockPath(root)); }
  catch (_) {
    process.stdout.write(JSON.stringify({ ok: true, stale: false }, null, 2) + '\n');
    return 0;
  }
  const ageMs = Date.now() - stat.mtimeMs;
  const pidAlive = isPidAlive(lock.pid);
  const isStale = !pidAlive || ageMs > maxAge;
  if (!isStale) {
    process.stdout.write(JSON.stringify({
      ok: true, stale: false, run_id: lock.run_id, pid_alive: pidAlive, age_ms: ageMs,
    }, null, 2) + '\n');
    return 0;
  }
  let mutations = [];
  let baselineMissing = false;
  if (lock.baseline && lock.baseline.dirty_content_hashes) {
    try {
      mutations = computeMutations(root, lock.baseline);
    } catch (err) {
      mutations = [{ path: null, reason: 'orphan-compute-error: ' + err.message }];
    }
  } else {
    baselineMissing = true;
  }
  try { fs.unlinkSync(lockPath(root)); } catch (_) { /* best-effort */ }
  process.stdout.write(JSON.stringify({
    ok: true,
    stale: true,
    cleared: true,
    reason: !pidAlive ? 'pid-dead' : 'age-exceeded',
    age_ms: ageMs,
    run_id: lock.run_id,
    baseline_missing: baselineMissing,
    mutations: mutations,
  }, null, 2) + '\n');
  return 0;
}

function cmdRead(args) {
  const root = repoRoot(args.cwd);
  const lock = readLock(root);
  if (!lock) {
    process.stdout.write(JSON.stringify({ active: false }) + '\n');
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
    '  exit  [--run-id <uuid>] [--cwd <path>]\n' +
    '  detect-stale [--max-age-ms <ms>] [--cwd <path>]\n' +
    '  read [--cwd <path>]\n');
}

function main(argv) {
  const sub = argv[2];
  const rest = parseArgs(argv.slice(3));
  switch (sub) {
    case 'enter': return cmdEnter(rest);
    case 'exit': return cmdExit(rest);
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
  cmdDetectStale,
  cmdRead,
  captureBaseline,
  computeMutations,
  readLock,
  lockPath,
  repoRoot,
  parsePorcelainZ,
  fileHashSafe,
  isPidAlive,
};
