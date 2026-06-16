'use strict';

// worktree-sync — Stage 2 M1 Task 3.
//
// Atomic IPC envelope transfer from a worker's worktree to the parent cwd.
// The Agent tool dispatches workers into isolated worktrees and reaps them
// when no changes occur (auto-cleanup). If the worker writes its envelope
// inside the worktree and the worktree is then auto-removed, the envelope
// disappears with it. syncEnvelopeOut is what keeps the IPC payload alive.
//
// fs.renameSync is atomic within a single filesystem but throws EXDEV on a
// cross-device move (Windows: worker worktree on a different volume from the
// parent; Linux: bind-mounted tmpfs). Fallback path: copyFileSync + unlinkSync.
//
// Race contract (per plan §Risks):
//   Two workers should never share the same dispatch_id. If two syncs land
//   on the same destination, the second sees EEXIST and returns ok:false
//   loudly — silent overwrite would mask a controller logic bug.
//
// Cleanup contract (per plan Task 3 step 2):
//   syncEnvelopeOut MUST be called before any worktree cleanup. The Agent
//   tool's auto-cleanup-on-no-changes can delete the envelope along with the
//   worktree. cleanupWorktree exists to make the cleanup decision explicit
//   in the controller body — pass 'keep' to preserve the worktree for
//   post-mortem (failed sync), 'remove' to delete it after a green sync.

const fs = require('fs');
const path = require('path');

const ENVELOPE_REL_DIR = path.join('.claude', 'state', 'dispatches');

function envelopeRelPath(dispatchId) {
  return path.join(ENVELOPE_REL_DIR, dispatchId + '.envelope.json');
}

function defaultFs() {
  return {
    statSync: fs.statSync,
    mkdirSync: fs.mkdirSync,
    renameSync: fs.renameSync,
    copyFileSync: fs.copyFileSync,
    unlinkSync: fs.unlinkSync,
    rmSync: fs.rmSync,
  };
}

function safeStat(f, target) {
  try {
    return { ok: true, stat: f.statSync(target) };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: false, missing: true };
    return { ok: false, error: err };
  }
}

function syncEnvelopeOut(workerWorktreePath, parentCwd, dispatchId, opts) {
  opts = opts || {};
  const f = opts.fsImpl || defaultFs();

  if (typeof workerWorktreePath !== 'string' || workerWorktreePath.length === 0) {
    return { ok: false, error: 'workerWorktreePath must be a non-empty string' };
  }
  if (typeof parentCwd !== 'string' || parentCwd.length === 0) {
    return { ok: false, error: 'parentCwd must be a non-empty string' };
  }
  if (typeof dispatchId !== 'string' || dispatchId.length === 0) {
    return { ok: false, error: 'dispatchId must be a non-empty string' };
  }

  const rel = envelopeRelPath(dispatchId);
  const src = path.join(workerWorktreePath, rel);
  const dst = path.join(parentCwd, rel);

  const srcCheck = safeStat(f, src);
  if (!srcCheck.ok) {
    if (srcCheck.missing) {
      return { ok: false, error: 'source envelope missing: ' + src };
    }
    return { ok: false, error: 'stat source failed: ' + srcCheck.error.message };
  }
  if (!srcCheck.stat.isFile()) {
    return { ok: false, error: 'source is not a regular file: ' + src };
  }

  const dstCheck = safeStat(f, dst);
  if (dstCheck.ok) {
    return { ok: false, error: 'destination already exists: ' + dst };
  }
  if (!dstCheck.missing) {
    return { ok: false, error: 'stat dst failed: ' + dstCheck.error.message };
  }

  try {
    f.mkdirSync(path.dirname(dst), { recursive: true });
  } catch (err) {
    return { ok: false, error: 'mkdir dst failed: ' + err.message };
  }

  try {
    f.renameSync(src, dst);
    return { ok: true, envelopePath: dst };
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      try {
        f.copyFileSync(src, dst);
      } catch (copyErr) {
        return { ok: false, error: 'copy fallback failed: ' + copyErr.message };
      }
      try {
        f.unlinkSync(src);
      } catch (unlinkErr) {
        return {
          ok: true,
          envelopePath: dst,
          crossDevice: true,
          warning: 'src unlink failed after copy: ' + unlinkErr.message,
        };
      }
      return { ok: true, envelopePath: dst, crossDevice: true };
    }
    if (err && err.code === 'EEXIST') {
      return { ok: false, error: 'destination already exists (race): ' + dst };
    }
    return { ok: false, error: 'rename failed: ' + err.message };
  }
}

function cleanupWorktree(workerWorktreePath, action, opts) {
  opts = opts || {};
  const f = opts.fsImpl || defaultFs();
  if (typeof workerWorktreePath !== 'string' || workerWorktreePath.length === 0) {
    return { ok: false, error: 'workerWorktreePath must be a non-empty string' };
  }
  if (action !== 'keep' && action !== 'remove') {
    return { ok: false, error: "action must be 'keep' or 'remove'" };
  }
  if (action === 'keep') {
    return { ok: true, action: 'keep' };
  }
  try {
    f.rmSync(workerWorktreePath, { recursive: true, force: true });
    return { ok: true, action: 'remove' };
  } catch (err) {
    return { ok: false, error: 'rm failed: ' + err.message };
  }
}

module.exports = {
  ENVELOPE_REL_DIR: ENVELOPE_REL_DIR,
  envelopeRelPath: envelopeRelPath,
  defaultFs: defaultFs,
  syncEnvelopeOut: syncEnvelopeOut,
  cleanupWorktree: cleanupWorktree,
};
