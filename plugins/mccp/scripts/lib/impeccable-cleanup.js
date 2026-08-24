'use strict';

// impeccable-cleanup — decide, and then perform, the removal of a redundant
// impeccable skill copy.
//
// This module deletes directories, so every rule that decides WHETHER a path may
// be deleted lives in code here, never in the prose of the command body that
// calls it. /mccp:setup Phase 3.5 renders a choice and forwards it; it does not
// get a vote on containment.
//
// Eight rejection rules (rules 1-6 from plan Task 4; 7-8 added when a code
// review of that task found rule 1 reachable-but-unenforced, see below):
//   1. The WINNING source is never removable. The winner is the body that
//      actually opens, so removing it is the one action guaranteed to break the
//      gates this whole contract exists to make fire.
//   2. `plugin` sources are never targets. Plugin removal belongs to
//      `claude plugin uninstall`; deleting a cache directory behind the
//      registry's back leaves installed_plugins.json pointing at nothing, which
//      is exactly the `install-path-stale` state impeccable-detect refuses to
//      count.
//   3. The target must be reachable from its anchor without traversing a link,
//      and its realpath must land exactly where the anchor says it should.
//   4. Nothing is deleted without an explicit confirm. --dry-run plans only.
//   5. git-tracked targets go through `git rm -r`, so the deletion is staged and
//      revertable; untracked targets are removed from disk. Neither commits.
//   6. `shadowed === true` makes rule 1 UNDECIDABLE (there is no winner to
//      protect), so nothing is removable at all.
//   7. A winner that names no path on disk makes rule 1 undecidable in exactly
//      the same way, so it is refused in exactly the same way.
//      `MCCP_IMPECCABLE_SKILL=available` produces such a winner: it asserts that
//      the call resolves and asserts NOTHING about which body answers it
//      (impeccable-detect says so in that branch). Under it every real copy is
//      eclipsed rather than winning, so without this rule the one body that
//      actually opens is offered for deletion -- and the post-condition below
//      cannot catch it either, because the same override keeps reporting
//      `available: true` after the body is gone.
//   8. The target must sit at the well-known location for its channel. The
//      deletion is derived from the anchor, so a caller that overrode
//      projectSkillDir/userSkillDir would have planCleanup report one directory
//      while applyCleanup removed another.
//
// Error contract (mirror: gitignore-provision.js): planCleanup/applyCleanup
// THROW a CleanupError carrying a closed REASONS value; the CLI maps anything
// else to `internal-error`. A caller branching on `reason` never sees an
// OS-specific message string.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const detect = require('./impeccable-detect.js');

const SKILL_DIRNAME = 'impeccable';
// The only shape a target may have, relative to its anchor. Anything else is
// not a well-known location and is refused before any stat happens.
const WELL_KNOWN_SEGMENTS = Object.freeze(['.claude', 'skills', SKILL_DIRNAME]);
const REMOVABLE_SOURCES = Object.freeze(['project', 'user']);

const REASONS = Object.freeze({
  OK: 'ok',
  NOT_INSTALLED: 'not-installed',
  AMBIGUOUS_WINNER: 'ambiguous-winner',
  UNVERIFIABLE_WINNER: 'unverifiable-winner',
  NON_STANDARD_LOCATION: 'non-standard-location',
  NOTHING_ECLIPSED: 'nothing-eclipsed',
  IS_WINNER: 'is-winner',
  PLUGIN_NOT_REMOVABLE: 'plugin-not-removable',
  UNKNOWN_SOURCE: 'unknown-source',
  NOT_ECLIPSED: 'not-eclipsed',
  TARGET_MISSING: 'target-missing',
  SYMLINK_PATH: 'symlink-path',
  PATH_ESCAPE: 'path-escape',
  NOT_CONFIRMED: 'not-confirmed',
  GIT_UNAVAILABLE: 'git-unavailable',
  GIT_RM_FAILED: 'git-rm-failed',
  PARTIAL_REMOVAL: 'partial-removal',
  RACED: 'raced',
  INTERNAL_ERROR: 'internal-error',
});
const REASON_VALUES = Object.freeze(Object.keys(REASONS).map((k) => REASONS[k]));

class CleanupError extends Error {
  constructor(reason, message, detail) {
    super(message);
    this.name = 'CleanupError';
    this.reason = reason;
    this.detail = detail === undefined ? null : detail;
  }
}

function defaultProjectSkillDir(repoRoot) {
  return path.join.apply(path, [repoRoot].concat(WELL_KNOWN_SEGMENTS));
}

function defaultUserSkillDir(homeDir) {
  return path.join.apply(path, [homeDir].concat(WELL_KNOWN_SEGMENTS));
}

function resolveOptions(options) {
  const opts = options || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const homeDir = opts.homeDir || os.homedir();
  return {
    repoRoot: repoRoot,
    homeDir: homeDir,
    installedPluginsPath: opts.installedPluginsPath,
    projectSkillDir: (opts.projectSkillDir != null)
      ? opts.projectSkillDir
      : defaultProjectSkillDir(repoRoot),
    userSkillDir: (opts.userSkillDir != null)
      ? opts.userSkillDir
      : defaultUserSkillDir(homeDir),
  };
}

function resolutionFor(o) {
  return detect.resolveImpeccable({
    repoRoot: o.repoRoot,
    installedPluginsPath: o.installedPluginsPath,
    projectSkillDir: o.projectSkillDir,
    userSkillDir: o.userSkillDir,
  });
}

// Windows NTFS is case-insensitive, so two spellings of one directory must
// compare equal. Both operands here come out of realpathSync, which already
// canonicalises case on win32 — this is belt and braces for the one operand
// that is rebuilt by path.join rather than resolved.
function samePath(a, b) {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'win32'
    ? na.toLowerCase() === nb.toLowerCase()
    : na === nb;
}

// Rule 3, in full.
//
// The anchor (repo root, or the user's home) is CANONICALISED rather than
// rejected when it is itself a link: repositories legitimately live under
// symlinked paths (macOS /tmp, a junctioned dev drive on Windows), and refusing
// those would refuse ordinary installs while buying nothing — the expected
// parent and the target resolve through the same link, so containment still
// holds. What must not be traversed is a link BETWEEN the anchor and the
// target, because there the two sides stop agreeing: a `.claude/skills`
// junction leaves the lexical path matching while the real directory is
// somewhere else entirely.
//
// Node reports a Windows junction as a symbolic link, so one lstat check covers
// both reparse-point kinds.
function assertReachableWithoutLinks(anchorAbs, label) {
  let anchorReal;
  try {
    anchorReal = fs.realpathSync(anchorAbs);
  } catch (_err) {
    throw new CleanupError(REASONS.TARGET_MISSING,
      label + ' anchor does not exist: ' + anchorAbs, { anchor: anchorAbs });
  }

  let cur = anchorReal;
  let st = null;
  for (let i = 0; i < WELL_KNOWN_SEGMENTS.length; i++) {
    cur = path.join(cur, WELL_KNOWN_SEGMENTS[i]);
    try {
      st = fs.lstatSync(cur);
    } catch (_err) {
      throw new CleanupError(REASONS.TARGET_MISSING,
        label + ' target path does not exist: ' + cur, { path: cur });
    }
    if (st.isSymbolicLink()) {
      throw new CleanupError(REASONS.SYMLINK_PATH,
        label + ' path crosses a symlink/junction at ' + cur
        + ' — refusing to delete through a link', { path: cur });
    }
    if (i < WELL_KNOWN_SEGMENTS.length - 1 && !st.isDirectory()) {
      throw new CleanupError(REASONS.TARGET_MISSING,
        label + ' path component is not a directory: ' + cur, { path: cur });
    }
  }
  // The final segment's lstat is the one the loop just took: re-statting it
  // here would open a second window in which the path can change, and a throw
  // from that call would escape as a raw ENOENT rather than a closed REASONS
  // value.
  if (!st || !st.isDirectory()) {
    throw new CleanupError(REASONS.TARGET_MISSING,
      label + ' target is not a directory: ' + cur, { path: cur });
  }

  // Redundant given the walk above, and kept anyway: it is the assertion that
  // states the invariant the walk is supposed to produce, and it costs one
  // syscall on a path we are about to delete.
  const targetReal = fs.realpathSync(cur);
  const expected = path.join.apply(path, [anchorReal].concat(WELL_KNOWN_SEGMENTS));
  if (!samePath(targetReal, expected)) {
    throw new CleanupError(REASONS.PATH_ESCAPE,
      label + ' target resolves outside its anchor: ' + targetReal
      + ' (expected ' + expected + ')', { real: targetReal, expected: expected });
  }
  return targetReal;
}

// Rule 7. A winner is only usable as a shield if it names a body on disk.
// `shadowed` is one way to have no such winner; an env-forced resolution is the
// other, and the two are the same undecidable state -- "which copy opens?" has
// no answer -- so they get the same refusal. Keying on `path` rather than on
// `source === 'env'` keeps the rule true for any later branch that resolves a
// name without locating a body.
function winnerNamesABody(winner) {
  return !!(winner && winner.source && winner.path);
}

// Rule 8. applyCleanup derives what it deletes from the ANCHOR, while
// planCleanup reports what the oracle read from the configured skill dirs. Those
// are the same directory for every shipped caller (the CLI and /mccp:setup pass
// neither override), and this assertion is what keeps them the same: if they
// ever diverge, the plan describes one directory and the deletion removes
// another.
function assertStandardLocation(o, source) {
  const configured = source === 'project' ? o.projectSkillDir : o.userSkillDir;
  const expected = source === 'project'
    ? defaultProjectSkillDir(o.repoRoot)
    : defaultUserSkillDir(o.homeDir);
  if (!samePath(configured, expected)) {
    throw new CleanupError(REASONS.NON_STANDARD_LOCATION,
      'the ' + source + ' skill directory was overridden to ' + configured
      + ', which is not the well-known location (' + expected + '); refusing to delete '
      + 'a directory the plan did not describe',
      { configured: configured, expected: expected });
  }
}

function anchorFor(source, o) {
  if (source === 'project') return { anchor: o.repoRoot, label: 'project' };
  if (source === 'user') return { anchor: o.homeDir, label: 'user' };
  throw new CleanupError(REASONS.UNKNOWN_SOURCE,
    'not a removable source: ' + String(source), { source: source });
}

function gitTracked(repoRoot, absPath) {
  let rel;
  try {
    rel = path.relative(repoRoot, absPath);
  } catch (_err) {
    return false;
  }
  // Outside the repo entirely (the user channel), so git owns nothing here.
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '--', rel.split(path.sep).join('/')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch (_err) {
    return false;
  }
}

// planCleanup — read-only. Never touches the filesystem beyond what the oracle
// already reads, and never validates containment: a plan is a statement about
// what the resolution says, and re-stating it cannot be a destructive act.
// Containment is applyCleanup's job precisely because it must be re-derived at
// the moment of deletion, not inherited from a plan of unknown age.
function planCleanup(options) {
  const o = resolveOptions(options);
  const resolved = resolutionFor(o);

  const base = {
    ok: true,
    action: 'plan',
    winner: resolved.shadowed || !resolved.available ? null : {
      source: resolved.source,
      invocation: resolved.invocation,
      version: resolved.version,
      path: resolved.path,
    },
    shadowed: resolved.shadowed,
    removable: [],
    skipped: [],
    reason: REASONS.OK,
  };

  if (!resolved.available) {
    base.reason = REASONS.NOT_INSTALLED;
    return base;
  }

  // Rule 6. An empty `eclipsed` under shadowed:true means "undeterminable",
  // NOT "nothing to remove" — the two readings are kept apart here because a
  // consumer that conflated them would offer to delete a body that might be the
  // one that opens.
  if (resolved.shadowed) {
    base.reason = REASONS.AMBIGUOUS_WINNER;
    base.skipped = (resolved.sources || []).map(function (row) {
      return { source: row.source, invocation: row.invocation, version: row.version, path: row.path,
        reason: REASONS.AMBIGUOUS_WINNER };
    });
    return base;
  }

  // Rule 7, stated where rule 6 is stated because it is the same undecidable
  // state arriving through a different door. Reported with every source listed
  // as skipped, so the caller sees the copies and is told why none is offered.
  if (!winnerNamesABody(base.winner)) {
    base.reason = REASONS.UNVERIFIABLE_WINNER;
    base.skipped = (resolved.sources || []).map(function (row) {
      return { source: row.source, invocation: row.invocation, version: row.version, path: row.path,
        reason: REASONS.UNVERIFIABLE_WINNER };
    });
    return base;
  }

  (resolved.eclipsed || []).forEach(function (row) {
    const entry = {
      source: row.source,
      invocation: row.invocation,
      version: row.version,
      path: row.path,
    };
    // Rule 2.
    if (REMOVABLE_SOURCES.indexOf(row.source) === -1) {
      base.skipped.push(Object.assign({ reason: REASONS.PLUGIN_NOT_REMOVABLE }, entry));
      return;
    }
    base.removable.push(entry);
  });

  if (base.removable.length === 0 && base.reason === REASONS.OK) {
    base.reason = REASONS.NOTHING_ECLIPSED;
  }
  return base;
}

// applyCleanup — the destructive half.
//
// Every check planCleanup made is made AGAIN here from a freshly resolved
// state. The plan result is informational and is never passed in: an approval
// the user gave against a plan from an hour ago must not authorise a deletion
// against a resolution that has since changed (security-reviewer S6).
function applyCleanup(options) {
  const opts = options || {};
  const o = resolveOptions(opts);
  const source = opts.source;
  const dryRun = opts.dryRun === true;
  const confirm = opts.confirm === true;

  const plan = planCleanup(opts);

  if (plan.reason === REASONS.NOT_INSTALLED) {
    throw new CleanupError(REASONS.NOT_INSTALLED,
      'impeccable does not resolve here; there is nothing to clean up', null);
  }
  // Rule 6 again, and this is the one that matters: with no winner, rule 1
  // cannot be evaluated, so EVERY --source is refused rather than one of them
  // being allowed through an undecidable check.
  if (plan.shadowed) {
    throw new CleanupError(REASONS.AMBIGUOUS_WINNER,
      'two bodies answer the same name and mccp cannot tell which one opens, so no '
      + 'copy can be shown to be safe to delete. Inspect the paths and remove one by hand.',
      { sources: plan.skipped });
  }

  // Rule 7 again. Without it `plan.winner.source === source` below is a
  // comparison against a winner that names no body, so it never matches and the
  // copy that actually opens is deleted -- with the post-condition reporting
  // success, because the override that produced this winner also keeps
  // reporting `available` afterwards.
  if (plan.reason === REASONS.UNVERIFIABLE_WINNER || !winnerNamesABody(plan.winner)) {
    throw new CleanupError(REASONS.UNVERIFIABLE_WINNER,
      'impeccable resolves, but the resolution names no body on disk (an env override '
      + 'asserts only that the name resolves), so no copy can be shown NOT to be the one '
      + 'that opens. Unset MCCP_IMPECCABLE_SKILL and re-run, or remove the copy by hand.',
      { winner: plan.winner });
  }

  const { anchor, label } = anchorFor(source, o);   // rule 2 + unknown source
  assertStandardLocation(o, source);                // rule 8

  // Rule 1, stated directly rather than inferred from the removable list.
  if (plan.winner && plan.winner.source === source) {
    throw new CleanupError(REASONS.IS_WINNER,
      'refusing to remove the ' + source + ' copy: it is the body that actually opens',
      { winner: plan.winner });
  }
  const chosen = plan.removable.filter(function (r) { return r.source === source; })[0];
  if (!chosen) {
    throw new CleanupError(REASONS.NOT_ECLIPSED,
      'no eclipsed ' + source + ' copy is present', { removable: plan.removable });
  }

  // Rule 3.
  const targetReal = assertReachableWithoutLinks(anchor, label);

  const tracked = gitTracked(o.repoRoot, targetReal);
  const result = {
    ok: true,
    action: dryRun ? 'dry-run' : 'removed',
    source: source,
    path: targetReal,
    tracked: tracked,
    reason: REASONS.OK,
  };

  // Rule 4. --dry-run is answered BEFORE the confirmation is required, so a
  // caller may plan a removal without holding one: a dry run deletes nothing, so
  // there is nothing for a confirmation to authorise. The flag is still reported
  // back as `confirmed`, which is how a caller sees that a real apply would have
  // been refused ('dry-run wins over confirm' in the tests).
  if (dryRun) {
    result.ok = true;
    result.confirmed = confirm;
    return result;
  }
  if (!confirm) {
    throw new CleanupError(REASONS.NOT_CONFIRMED,
      'refusing to delete without an explicit confirmation', { path: targetReal });
  }

  // security-reviewer S2/S8 — re-derive containment immediately before the
  // syscall. This NARROWS the window between the check and the delete; it does
  // not close it. Nothing portable can: Windows has no O_NOFOLLOW equivalent,
  // and holding a directory handle open across the delete is platform-specific.
  // The residual is recorded in the backlog rather than described as fixed.
  let recheck;
  try {
    recheck = assertReachableWithoutLinks(anchor, label);
  } catch (err) {
    throw new CleanupError(REASONS.RACED,
      'the target changed shape between validation and deletion; nothing was deleted',
      { cause: err.reason || null });
  }
  if (!samePath(recheck, targetReal)) {
    throw new CleanupError(REASONS.RACED,
      'the target moved between validation and deletion; nothing was deleted',
      { before: targetReal, after: recheck });
  }

  if (tracked) {
    // Rule 5. execFile, never a shell, and always with `--` so a path that
    // begins with a dash cannot be read as a git option (security-reviewer S3).
    const rel = path.relative(o.repoRoot, targetReal).split(path.sep).join('/');
    try {
      execFileSync('git', ['-C', o.repoRoot, 'rm', '-r', '-q', '--', rel], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const stderr = (err && err.stderr) ? String(err.stderr).trim() : '';
      throw new CleanupError(REASONS.GIT_RM_FAILED,
        'git rm refused to remove the tracked copy: ' + (stderr || String(err && err.message)),
        { path: rel, stderr: stderr });
    }
    // `git rm` stops at tracked files. A directory that also holds untracked
    // content is left behind, still carrying a SKILL.md in the worst case — so
    // the postcondition below is what decides success, not git's exit code.
    if (fs.existsSync(targetReal)) {
      try {
        fs.rmSync(targetReal, { recursive: true, force: true });
      } catch (_err) {
        // fall through to the postcondition, which reports it honestly
      }
    }
  } else {
    try {
      fs.rmSync(targetReal, { recursive: true, force: true });
    } catch (err) {
      throw new CleanupError(REASONS.PARTIAL_REMOVAL,
        'could not remove the untracked copy: ' + String(err && err.message),
        { path: targetReal });
    }
  }

  // Postcondition (Implement-Codex F2 / security-reviewer S7). Success is not
  // "the delete command returned zero" — it is "the body this cleanup was for
  // can no longer be opened". Re-resolve and prove it.
  if (fs.existsSync(path.join(targetReal, 'SKILL.md'))) {
    throw new CleanupError(REASONS.PARTIAL_REMOVAL,
      'the copy was only partially removed: SKILL.md is still present at ' + targetReal,
      { path: targetReal });
  }
  const after = resolutionFor(o);
  const stillThere = (after.sources || []).some(function (row) { return row.source === source; });
  if (stillThere) {
    throw new CleanupError(REASONS.PARTIAL_REMOVAL,
      'the ' + source + ' copy still resolves after removal', { resolution: after });
  }
  result.resolution_after = {
    available: after.available,
    source: after.source,
    invocation: after.invocation,
    version: after.version,
    shadowed: after.shadowed,
    eclipsed: (after.eclipsed || []).length,
  };
  return result;
}

module.exports = {
  planCleanup,
  applyCleanup,
  CleanupError,
  REASONS,
  REASON_VALUES,
  WELL_KNOWN_SEGMENTS,
  REMOVABLE_SOURCES,
  // Containment predicates, exported for their own tests and for nothing else.
  //
  // With rule 7 in place there is no configuration this oracle can produce in
  // which a bare copy is eclipsed (a bare source either wins, or is one of two
  // and rule 6 refuses both) -- so applyCleanup cannot be driven past rule 7,
  // and rules 3/8 sit in a branch no end-to-end test can reach. They are still
  // the rules that decide whether a directory may be deleted, so they are
  // asserted directly rather than left unchecked until some later change makes
  // that branch live again. `no configuration ... makes a copy removable` in
  // the test file is what keeps that claim honest.
  _internals: {
    assertReachableWithoutLinks,
    assertStandardLocation,
    winnerNamesABody,
  },
};

if (require.main === module) {
  const argv = process.argv.slice(0);
  const sub = argv[2];
  const args = { json: false, dryRun: false, confirm: false, source: null, repoRoot: null };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--confirm') args.confirm = true;
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--repo-root') args.repoRoot = argv[++i];
  }
  if (sub !== 'plan' && sub !== 'apply') {
    process.stderr.write('Usage: impeccable-cleanup.js plan [--repo-root <dir>] [--json]\n');
    process.stderr.write('       impeccable-cleanup.js apply --source <project|user> --confirm [--dry-run] [--repo-root <dir>] [--json]\n');
    process.exit(2);
  }
  const base = { repoRoot: args.repoRoot || process.cwd() };
  try {
    if (sub === 'plan') {
      const out = planCleanup(base);
      if (args.json) process.stdout.write(JSON.stringify(out) + '\n');
      else {
        process.stdout.write('impeccable-cleanup plan reason=' + out.reason + '\n');
        process.stdout.write('  winner    : ' + (out.winner
          ? out.winner.source + ' v' + (out.winner.version || '<unknown>') + ' as ' + out.winner.invocation
          : '<none established>') + '\n');
        process.stdout.write('  removable : ' + (out.removable.length
          ? '\n' + out.removable.map(function (r) {
            return '    - ' + r.source + ' v' + (r.version || '<unknown>') + '  ' + r.path;
          }).join('\n')
          : '<none>') + '\n');
        process.stdout.write('  skipped   : ' + (out.skipped.length
          ? '\n' + out.skipped.map(function (r) {
            return '    - ' + r.source + '  ' + (r.path || '<none>') + '  (' + r.reason + ')';
          }).join('\n')
          : '<none>') + '\n');
      }
      process.exit(0);
    }
    const out = applyCleanup(Object.assign({
      source: args.source, confirm: args.confirm, dryRun: args.dryRun,
    }, base));
    if (args.json) process.stdout.write(JSON.stringify(out) + '\n');
    else process.stdout.write('impeccable-cleanup ' + out.action + ' ' + out.source + ' at ' + out.path + '\n');
    process.exit(0);
  } catch (err) {
    const reason = (err instanceof CleanupError) ? err.reason : REASONS.INTERNAL_ERROR;
    const payload = { ok: false, action: sub, reason: reason, message: String(err && err.message) };
    if (args.json) process.stdout.write(JSON.stringify(payload) + '\n');
    else process.stderr.write('[impeccable-cleanup] ' + reason + ': ' + payload.message + '\n');
    process.exit(1);
  }
}
