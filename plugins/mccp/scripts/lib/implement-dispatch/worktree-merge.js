'use strict';

// workflow-orchestration M3 Task 1 — worktree → parent collect + apply + rollback.
//
// Once a fleet of isolated `isolation:'worktree'` workers returns, their disjoint
// changes live only inside their own agent worktrees (M2b spike: separate dir +
// branch, uncommitted, never auto-propagated). Mechanism 1 (DD3) collects those
// changes from the CONTROLLER (main session) — which, unlike the Workflow sandbox,
// CAN run `git worktree list` and `git -C <wt> diff` — and applies the disjoint
// diffs to the parent, verdict-gated.
//
// Task 0 spike (2026-07-08) PROVED the git substrate synthetically (enumerate /
// collect / disjoint apply / patch-scoped reverse-apply / rollback-safety = data
// loss 0), but the live harness correlation (worktree↔dispatchId after parallel()
// returns) is UNPROVEN under the cost hard-ceiling → merge_strategy stays
// `disable-parallel`. This lib is therefore BUILT + unit-tested but DORMANT: it is
// the substrate M4 activates once the live correlation is proven.
//
// SAFETY INVARIANTS (Codex R1 F4):
//   - pre-apply clean assert — the target paths must be clean in the parent before
//     apply (a pre-existing dirty edit there is the user's, not a worker's).
//   - patch-scoped rollback — rollback reverse-applies the EXACT recorded patches
//     (`git apply -R`), NEVER a broad `git checkout --` / `git clean` (which would
//     destroy the user's pre-existing dirty tracked changes + untracked files on a
//     dirty feature branch = irreversible data loss).
//
// SEPARATION: the pure correlation judgment (buildWorktreeMap) takes an injected
// reader; the git-touching ops (collectWorkerDiff / assertPathsClean /
// applyDisjointDiffs / rollbackApplied) take an injected `runGit` (default
// spawnSync). Callers (dispatch-cli) supply the real impls; tests inject stubs or
// drive a real temp repo.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DISPATCH_REL_DIR = path.join('.claude', 'state', 'dispatches');

// runGit(args, opts) → { code, stdout, stderr, error }. NEVER throws. `opts.input`
// pipes a patch to stdin (git apply). code is the process exit; a spawn error maps
// to code:-1 so callers branch on code alone.
function defaultRunGit(args, opts) {
  opts = opts || {};
  try {
    const r = spawnSync('git', args, {
      encoding: 'utf8',
      input: typeof opts.input === 'string' ? opts.input : undefined,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error) {
      return { code: -1, stdout: r.stdout || '', stderr: r.stderr || '', error: String(r.error.message || r.error) };
    }
    return { code: typeof r.status === 'number' ? r.status : 1, stdout: r.stdout || '', stderr: r.stderr || '', error: null };
  } catch (e) {
    return { code: -1, stdout: '', stderr: String((e && e.message) || e), error: String((e && e.message) || e) };
  }
}

// defaultReadDispatchIds(worktreePath) → [dispatchId...]. Reads the worktree's
// .claude/state/dispatches/*.envelope.json filenames. Absent dir → []. fs is
// isolated here so buildWorktreeMap stays pure (takes this as an injectable).
function defaultReadDispatchIds(worktreePath) {
  const dir = path.join(worktreePath, DISPATCH_REL_DIR);
  try {
    return fs.readdirSync(dir)
      .filter(function (f) { return /\.envelope\.json$/.test(f); })
      .map(function (f) { return f.replace(/\.envelope\.json$/, ''); });
  } catch (_) {
    return [];
  }
}

function normFile(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/').trim() : '';
}

// isEmptyDiff(text) → true when there is no patch body (empty / whitespace only /
// no `diff --git` header). git apply on an empty patch exits non-zero, so callers
// MUST treat an empty diff as an explicit no-op (spike observation [9]).
function isEmptyDiff(text) {
  if (typeof text !== 'string') return true;
  const t = text.trim();
  if (t.length === 0) return true;
  return !/^diff --git /m.test(t) && !/^--- /m.test(t);
}

// parseChangedFiles(diffText) → [repo-relative path...]. Collects `+++ b/<path>`
// (adds/mods) and, for deletions (`+++ /dev/null`), the `--- a/<path>` side.
function parseChangedFiles(diffText) {
  if (typeof diffText !== 'string' || diffText.length === 0) return [];
  const files = [];
  const lines = diffText.split(/\r?\n/);
  let pendingMinus = null;
  lines.forEach(function (line) {
    if (line.indexOf('--- ') === 0) {
      const p = line.slice(4).trim();
      pendingMinus = (p === '/dev/null') ? null : p.replace(/^a\//, '');
    } else if (line.indexOf('+++ ') === 0) {
      const p = line.slice(4).trim();
      let f = null;
      if (p === '/dev/null') {
        f = pendingMinus; // deletion — take the a/ side
      } else {
        f = p.replace(/^b\//, '');
      }
      f = normFile(f);
      if (f && f !== '/dev/null' && files.indexOf(f) === -1) files.push(f);
      pendingMinus = null;
    }
  });
  return files;
}

// ── pure correlation ──────────────────────────────────────────────────────────

// buildWorktreeMap({ worktrees:[{path}], dispatchIds:[], readDispatchIds }) →
//   { map:{dispatchId:worktreePath}, missing:[dispatchId], ambiguous:[{dispatchId,paths}], unmatchedWorktrees:[path] }
//
// Correlate each EXPECTED dispatchId to the worktree that holds its envelope. A
// dispatchId present in >1 worktree is `ambiguous` (never mapped — fail-closed).
// An expected id with no worktree is `missing` (the caller HALTs the merge — a
// lost worker must not be silently dropped). Pure: readDispatchIds is injected.
function buildWorktreeMap(input) {
  input = input || {};
  const worktrees = Array.isArray(input.worktrees) ? input.worktrees : [];
  const expected = Array.isArray(input.dispatchIds)
    ? input.dispatchIds.filter(function (d) { return typeof d === 'string' && d.length > 0; })
    : [];
  const readIds = typeof input.readDispatchIds === 'function'
    ? input.readDispatchIds : defaultReadDispatchIds;

  const expectedSet = Object.create(null);
  expected.forEach(function (d) { expectedSet[d] = true; });

  // dispatchId → Set of worktree paths that hold it.
  const found = Object.create(null);
  const unmatchedWorktrees = [];
  worktrees.forEach(function (wt) {
    const wtPath = wt && typeof wt.path === 'string' ? wt.path : null;
    if (!wtPath) return;
    const ids = readIds(wtPath) || [];
    let matchedHere = false;
    ids.forEach(function (id) {
      if (!expectedSet[id]) return;
      matchedHere = true;
      if (!found[id]) found[id] = [];
      if (found[id].indexOf(wtPath) === -1) found[id].push(wtPath);
    });
    if (!matchedHere) unmatchedWorktrees.push(wtPath);
  });

  const map = Object.create(null);
  const ambiguous = [];
  const missing = [];
  expected.forEach(function (id) {
    const paths = found[id] || [];
    if (paths.length === 1) {
      map[id] = paths[0];
    } else if (paths.length > 1) {
      ambiguous.push({ dispatchId: id, paths: paths });
    } else {
      missing.push(id);
    }
  });

  return { map: map, missing: missing, ambiguous: ambiguous, unmatchedWorktrees: unmatchedWorktrees };
}

// ── git-touching collect + apply ──────────────────────────────────────────────

// collectWorkerDiff(worktreePath, opts) → { ok, diff, empty, files, error }.
// tracked (git diff --no-ext-diff HEAD) ∪ untracked (ls-files --others → synthetic
// --no-index new-file diff). `git diff --no-index` exits 1 when the files differ —
// that is the EXPECTED "there is a diff" signal, not an error.
function collectWorkerDiff(worktreePath, opts) {
  opts = opts || {};
  const runGit = typeof opts.runGit === 'function' ? opts.runGit : defaultRunGit;
  const includeUntracked = opts.includeUntracked !== false;
  if (typeof worktreePath !== 'string' || worktreePath.length === 0) {
    return { ok: false, diff: '', empty: true, files: [], error: 'worktreePath required' };
  }

  const tracked = runGit(['-C', worktreePath, 'diff', '--no-ext-diff', 'HEAD']);
  if (tracked.code !== 0) {
    return { ok: false, diff: '', empty: true, files: [], error: 'git diff failed: ' + (tracked.stderr || tracked.error || 'code ' + tracked.code) };
  }
  let diff = tracked.stdout || '';

  if (includeUntracked) {
    const un = runGit(['-C', worktreePath, 'ls-files', '--others', '--exclude-standard']);
    if (un.code === 0) {
      (un.stdout || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (f) {
        const nd = runGit(['-C', worktreePath, 'diff', '--no-ext-diff', '--no-index', '--', '/dev/null', f]);
        if ((nd.code === 0 || nd.code === 1) && nd.stdout) {
          if (diff.length > 0 && !diff.endsWith('\n')) diff += '\n';
          diff += nd.stdout;
        }
      });
    }
  }

  return { ok: true, diff: diff, empty: isEmptyDiff(diff), files: parseChangedFiles(diff), error: null };
}

// assertPathsClean({ paths, cwd, runGit }) → { clean, dirty:[path], checked, error }.
// The target paths must be clean in the parent before merge-apply (F4 — a
// pre-existing dirty edit there is the user's; overwriting it is data loss).
function assertPathsClean(input) {
  input = input || {};
  const runGit = typeof input.runGit === 'function' ? input.runGit : defaultRunGit;
  const cwd = input.cwd || process.cwd();
  const paths = (Array.isArray(input.paths) ? input.paths : [])
    .map(normFile).filter(Boolean);
  if (paths.length === 0) return { clean: true, dirty: [], checked: [], error: null };

  const r = runGit(['-C', cwd, 'status', '--porcelain', '--'].concat(paths));
  if (r.code !== 0) {
    return { clean: false, dirty: [], checked: paths, error: 'git status failed: ' + (r.stderr || r.error || 'code ' + r.code) };
  }
  const dirty = [];
  (r.stdout || '').split(/\r?\n/).forEach(function (line) {
    if (line.length < 4) return;
    let p = line.slice(3).trim();
    const arrow = p.indexOf(' -> ');
    if (arrow !== -1) p = p.slice(arrow + 4).trim();
    if (p.length >= 2 && p[0] === '"' && p[p.length - 1] === '"') p = p.slice(1, -1);
    p = normFile(p);
    if (p && dirty.indexOf(p) === -1) dirty.push(p);
  });
  return { clean: dirty.length === 0, dirty: dirty, checked: paths, error: null };
}

// normalizeDiffs(diffs) → [{ diff }]. Accepts [string] or [{diff}] or
// [{dispatchId,diff}]. Non-string/empty entries are dropped to empty markers.
function normalizeDiffs(diffs) {
  return (Array.isArray(diffs) ? diffs : []).map(function (d, i) {
    if (typeof d === 'string') return { index: i, diff: d };
    if (d && typeof d.diff === 'string') return { index: i, diff: d.diff, dispatchId: d.dispatchId };
    return { index: i, diff: '' };
  });
}

// applyDisjointDiffs({ diffs, cwd, dryRun, runGit }) →
//   { ok, applied, appliedPatches:[patch], skippedEmpty, failedIndex, error, checked }
//
// All-or-nothing: `git apply --check` EVERY non-empty patch first; only if all
// pass (and not dryRun) apply them, recording each APPLIED patch for rollback. A
// mid-apply failure reverse-applies what was already applied (patch-scoped) and
// reports failure — the parent is never left partially merged.
function applyDisjointDiffs(input) {
  input = input || {};
  const runGit = typeof input.runGit === 'function' ? input.runGit : defaultRunGit;
  const cwd = input.cwd || process.cwd();
  const dryRun = input.dryRun === true;
  const entries = normalizeDiffs(input.diffs);

  const nonEmpty = entries.filter(function (e) { return !isEmptyDiff(e.diff); });
  const skippedEmpty = entries.length - nonEmpty.length;

  if (nonEmpty.length === 0) {
    return { ok: true, applied: 0, appliedPatches: [], skippedEmpty: skippedEmpty, failedIndex: null, error: null, checked: 0 };
  }

  // Phase 1 — check ALL (atomic gate).
  for (let i = 0; i < nonEmpty.length; i++) {
    const e = nonEmpty[i];
    const chk = runGit(['-C', cwd, 'apply', '--check', '--whitespace=nowarn'], { input: e.diff });
    if (chk.code !== 0) {
      return {
        ok: false, applied: 0, appliedPatches: [], skippedEmpty: skippedEmpty,
        failedIndex: e.index, checked: i,
        error: 'apply --check failed for diff[' + e.index + ']: ' + (chk.stderr || chk.error || 'code ' + chk.code),
      };
    }
  }

  if (dryRun) {
    return { ok: true, applied: 0, appliedPatches: [], skippedEmpty: skippedEmpty, failedIndex: null, error: null, checked: nonEmpty.length, dryRun: true };
  }

  // Phase 2 — apply, recording each applied patch for patch-scoped rollback.
  const appliedPatches = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    const e = nonEmpty[i];
    const ap = runGit(['-C', cwd, 'apply', '--whitespace=nowarn'], { input: e.diff });
    if (ap.code !== 0) {
      // mid-apply failure — reverse what we applied, then report.
      rollbackApplied({ appliedPatches: appliedPatches, cwd: cwd, runGit: runGit });
      return {
        ok: false, applied: 0, appliedPatches: [], skippedEmpty: skippedEmpty,
        failedIndex: e.index, checked: nonEmpty.length,
        error: 'apply failed mid-sequence for diff[' + e.index + '] (rolled back ' + appliedPatches.length + '): ' + (ap.stderr || ap.error || 'code ' + ap.code),
      };
    }
    appliedPatches.push(e.diff);
  }

  return { ok: true, applied: appliedPatches.length, appliedPatches: appliedPatches, skippedEmpty: skippedEmpty, failedIndex: null, error: null, checked: nonEmpty.length };
}

// rollbackApplied({ appliedPatches, cwd, runGit }) → { ok, reversed, failed:[{index,error}] }.
// Patch-scoped reverse-apply (`git apply -R`) in REVERSE order — restores exactly
// what applyDisjointDiffs added, preserving the parent's pre-existing dirty tracked
// changes + untracked files (F4 — NO broad checkout/clean). Best-effort: continues
// past an individual reverse failure and reports it (the caller then HALTs loudly).
function rollbackApplied(input) {
  input = input || {};
  const runGit = typeof input.runGit === 'function' ? input.runGit : defaultRunGit;
  const cwd = input.cwd || process.cwd();
  const patches = Array.isArray(input.appliedPatches) ? input.appliedPatches : [];

  let reversed = 0;
  const failed = [];
  for (let i = patches.length - 1; i >= 0; i--) {
    const patch = patches[i];
    if (isEmptyDiff(patch)) continue;
    const r = runGit(['-C', cwd, 'apply', '-R', '--whitespace=nowarn'], { input: patch });
    if (r.code === 0) {
      reversed += 1;
    } else {
      failed.push({ index: i, error: r.stderr || r.error || 'code ' + r.code });
    }
  }
  return { ok: failed.length === 0, reversed: reversed, failed: failed };
}

module.exports = {
  DISPATCH_REL_DIR: DISPATCH_REL_DIR,
  defaultRunGit: defaultRunGit,
  defaultReadDispatchIds: defaultReadDispatchIds,
  isEmptyDiff: isEmptyDiff,
  parseChangedFiles: parseChangedFiles,
  buildWorktreeMap: buildWorktreeMap,
  collectWorkerDiff: collectWorkerDiff,
  assertPathsClean: assertPathsClean,
  applyDisjointDiffs: applyDisjointDiffs,
  rollbackApplied: rollbackApplied,
};
