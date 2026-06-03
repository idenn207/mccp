'use strict';

// PR body persistence helper. Per Codex Q2 (Sprint 6 design): the
// `## Codex Adversarial Review` and `## Design Review` sections that
// Phase 2.5 generates must survive between phases without depending on
// shell escaping of multi-line content. Persist the body draft under
// `.git/mccp/tmp/pr-body-<slug>-<head_sha>.md`, then `gh pr create
// --body-file <path>`, then delete on success.
//
// Storage is under `.git/` (not `.claude/`) to avoid worktree pollution
// and accidental commits. The directory is created on demand.

const fs = require('fs');
const path = require('path');
const { gitRepoRoot } = require('./hash');

// In a worktree, `<repoRoot>/.git` is a *file* containing `gitdir: <path>`
// pointing at the worktree-specific git directory (typically
// `<main-repo>/.git/worktrees/<wt-name>`). Naively `path.join(repoRoot, '.git',
// 'mccp', 'tmp')` then `fs.mkdirSync` fails with ENOTDIR. Read the pointer and
// redirect to the real git directory. In the main repo `.git` is a directory
// and this helper returns it unchanged.
function gitDir(repoRoot) {
  const dotGit = path.join(repoRoot, '.git');
  let stat;
  try { stat = fs.statSync(dotGit); } catch (_e) { return dotGit; }
  if (stat.isDirectory()) return dotGit;
  try {
    const content = fs.readFileSync(dotGit, 'utf8');
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (match) {
      const target = match[1].trim();
      return path.isAbsolute(target) ? target : path.resolve(repoRoot, target);
    }
  } catch (_e) { /* fall through */ }
  return dotGit;
}

function tmpDir(repoRoot) {
  return path.join(gitDir(repoRoot), 'mccp', 'tmp');
}

function bodyPath(repoRoot, decisionSlug, headSha) {
  const shortSha = String(headSha || 'unknown').slice(0, 12);
  const safeSlug = String(decisionSlug || 'default').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return path.join(tmpDir(repoRoot), 'pr-body-' + safeSlug + '-' + shortSha + '.md');
}

function writeBody(repoRoot, decisionSlug, headSha, content) {
  const dir = tmpDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  const target = bodyPath(repoRoot, decisionSlug, headSha);
  // Atomic write: stage to a sibling temp file then rename. Same volume so
  // rename is atomic on Windows + POSIX.
  const staging = target + '.tmp-' + process.pid;
  fs.writeFileSync(staging, String(content == null ? '' : content), 'utf8');
  fs.renameSync(staging, target);
  return target;
}

function readBody(repoRoot, decisionSlug, headSha) {
  const target = bodyPath(repoRoot, decisionSlug, headSha);
  if (!fs.existsSync(target)) return null;
  return fs.readFileSync(target, 'utf8');
}

function deleteBody(repoRoot, decisionSlug, headSha) {
  const target = bodyPath(repoRoot, decisionSlug, headSha);
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}

// Sweep any leftover pr-body-*.md files that are older than `maxAgeMs`.
// Default: 7 days. Returns the list of paths removed.
function sweepStale(repoRoot, maxAgeMs) {
  const ageCap = typeof maxAgeMs === 'number' ? maxAgeMs : 7 * 24 * 60 * 60 * 1000;
  const dir = tmpDir(repoRoot);
  if (!fs.existsSync(dir)) return [];
  const now = Date.now();
  const removed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('pr-body-')) continue;
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch (_e) { continue; }
    if (!stat.isFile()) continue;
    if (now - stat.mtimeMs > ageCap) {
      try {
        fs.unlinkSync(full);
        removed.push(full);
      } catch (_e) { /* swallow — best-effort sweep */ }
    }
  }
  return removed;
}

function resolveRepoRoot(cwd) {
  return gitRepoRoot(cwd || process.cwd());
}

module.exports = {
  gitDir: gitDir,
  tmpDir: tmpDir,
  bodyPath: bodyPath,
  writeBody: writeBody,
  readBody: readBody,
  deleteBody: deleteBody,
  sweepStale: sweepStale,
  resolveRepoRoot: resolveRepoRoot,
};
