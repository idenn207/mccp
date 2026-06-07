'use strict';

// path-containment — generic realpath-anchored containment guard.
//
// v0.2.8 Task 2.6.1-followup F8 absorption: extracted from
// v0.2.8-generic-receipt-quarantine.js so pr-phase-lock.js (and future
// callers) can guard their write targets against symlink-escape without
// vendoring the migration module. The migration file re-exports this
// symbol so existing direct callers and existing tests keep working
// unchanged.
//
// Asserts (in order):
//   (1) `targetPath` realpath's under `expectedParentDir` realpath, AND
//   (2) (if `repoRoot` is truthy) `expectedParentDir` realpath's under
//       `<repoRoot>/.claude/receipts` realpath. Callers outside the
//       receipts tree MUST omit `repoRoot` so the receipts-root check
//       is skipped — pr-phase-lock writes under `.claude/state`, not
//       under receipts.
//
// The `+ path.sep` suffix prevents the `<dir>` vs `<dir>-evil`
// false-positive prefix match. Throws a typed `PATH_ESCAPES_GATE`
// error on mismatch. The error message is held stable (`path escapes
// gate dir`, `gate dir escapes receipts root`) because existing
// migration boundary tests pin it via regex.

const fs = require('fs');
const path = require('path');

function assertContained(targetPath, expectedParentDir, repoRoot) {
  let resolvedTarget, resolvedParent, resolvedReceiptsRoot;
  try { resolvedTarget = fs.realpathSync(targetPath); }
  catch (err) {
    const e = new Error('cannot realpath receipt: ' + err.message);
    e.code = 'PATH_ESCAPES_GATE';
    throw e;
  }
  try { resolvedParent = fs.realpathSync(expectedParentDir); }
  catch (err) {
    const e = new Error('cannot realpath expected gate dir: ' + err.message);
    e.code = 'PATH_ESCAPES_GATE';
    throw e;
  }
  const prefix = resolvedParent.endsWith(path.sep) ? resolvedParent : resolvedParent + path.sep;
  if (!resolvedTarget.startsWith(prefix)) {
    const e = new Error('path escapes gate dir (receipt=' + resolvedTarget +
      ', gate=' + resolvedParent + ')');
    e.code = 'PATH_ESCAPES_GATE';
    throw e;
  }
  if (repoRoot) {
    const expectedReceiptsRoot = path.join(repoRoot, '.claude', 'receipts');
    try { resolvedReceiptsRoot = fs.realpathSync(expectedReceiptsRoot); }
    catch (err) {
      const e = new Error('cannot realpath receipts root: ' + err.message);
      e.code = 'PATH_ESCAPES_GATE';
      throw e;
    }
    const rootPrefix = resolvedReceiptsRoot.endsWith(path.sep)
      ? resolvedReceiptsRoot : resolvedReceiptsRoot + path.sep;
    if (!resolvedParent.startsWith(rootPrefix)) {
      const e = new Error('gate dir escapes receipts root (gate=' + resolvedParent +
        ', root=' + resolvedReceiptsRoot + ')');
      e.code = 'PATH_ESCAPES_GATE';
      throw e;
    }
  }
}

module.exports = { assertContained };
