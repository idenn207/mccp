'use strict';

// v1.4.0-m3 — append-only friction telemetry sidecar.
//
// Public API:
//   recordBannerInjected({ sessionId, projectBranch, now? }) → void
//
// Writes a single JSONL line to `<repo>/.claude/state/m3-friction-events.jsonl`
// when SessionStart hook injects the "Other active mccp sessions" banner.
// The line records that a banner was shown — Producer side of the M3 metric.
// User-side (whether reconciliation friction occurred in transcript) is
// measured separately via dogfood protocol (docs/v1.4.0-multi-session/
// m3-friction-metric.md).
//
// Invariants (Codex Implement R1 F1 absorption):
//   - Pure append-only. NEVER read-modify-write the file. No in-band cap.
//   - `fs.appendFileSync` with 'a' flag — single write < PIPE_BUF (4KB) is
//     atomic per-line on POSIX/Win32. Concurrent SessionStart processes can
//     each append without losing events.
//   - Retention is deferred to offline cleanup (v1.5.x backlog axis). Per-cycle
//     growth: SessionStart freq × per-cycle duration × ~150B line ≈ < 5KB/d.
//
// Fail-open invariants (CLAUDE.md §3.4):
//   - All errors: stderr WARN(`[mccp:friction-telemetry] WARN: <msg> (allow)`)
//     + function returns noop. NEVER throw.
//   - resolveLogPath returns null → caller noop (no log file possible).
//   - Worktrees: `.git` is a file (not directory). resolveLogPath accepts both.

const fs = require('fs');
const path = require('path');

function warn(msg) {
  try {
    process.stderr.write('[mccp:friction-telemetry] WARN: ' + msg + ' (allow)\n');
  } catch (_e) { /* unreachable in normal node — ignore */ }
}

// Walk up from startDir looking for a `.git` entry (file OR directory).
// `.git` is a directory in main checkouts; a file (pointer to gitdir) in
// worktrees. Both are valid repo roots for our purposes.
function findRepoRoot(startDir) {
  let dir;
  try {
    dir = path.resolve(startDir || process.cwd());
  } catch (_e) {
    return null;
  }
  const root = path.parse(dir).root;
  // Guard against runaway in malformed paths.
  let depth = 0;
  while (dir && dir !== root && depth < 64) {
    let st;
    try {
      st = fs.statSync(path.join(dir, '.git'));
    } catch (_e) {
      st = null;
    }
    if (st && (st.isDirectory() || st.isFile())) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    depth += 1;
  }
  // Final check at root in case repo is at filesystem root.
  try {
    const st = fs.statSync(path.join(dir, '.git'));
    if (st && (st.isDirectory() || st.isFile())) return dir;
  } catch (_e) { /* not a repo root */ }
  return null;
}

function resolveLogPath(options) {
  options = options || {};
  const repoRoot = options.repoRoot || findRepoRoot(options.cwd || process.cwd());
  if (!repoRoot) return null;
  return path.join(repoRoot, '.claude', 'state', 'm3-friction-events.jsonl');
}

function recordBannerInjected(args) {
  args = args || {};
  let logPath;
  try {
    logPath = resolveLogPath({ cwd: args.cwd, repoRoot: args.repoRoot });
  } catch (err) {
    warn('resolveLogPath threw: ' + ((err && err.message) || String(err)));
    return;
  }
  if (!logPath) {
    warn('repo root not found from cwd=' + (args.cwd || process.cwd()));
    return;
  }
  const ts = args.now || new Date().toISOString();
  const event = {
    ts,
    event: 'banner-injected',
    session_id: args.sessionId || null,
    project_branch: args.projectBranch || null,
  };
  let line;
  try {
    line = JSON.stringify(event) + '\n';
  } catch (err) {
    warn('JSON.stringify failed: ' + ((err && err.message) || String(err)));
    return;
  }
  try {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    warn('mkdir failed for ' + logPath + ': ' + ((err && err.message) || String(err)));
    return;
  }
  try {
    fs.appendFileSync(logPath, line, { flag: 'a', encoding: 'utf8' });
  } catch (err) {
    warn('appendFileSync failed for ' + logPath + ': ' + ((err && err.message) || String(err)));
    return;
  }
}

module.exports = {
  recordBannerInjected,
  resolveLogPath,
  findRepoRoot,
};
