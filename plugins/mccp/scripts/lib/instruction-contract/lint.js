'use strict';

// reachability lint — proves a CLAUDE.md reduction was a RELOCATION, not a
// deletion (multi-session-work-loop M4 Task 3, guarantee G2).
//
// Four checks, all fail-closed. Mirrors b2-coverage-gate.js: a static lint is
// the precondition for claiming the outcome. If this lint fails, the reduction
// figure is not claimed.
//
//   C1  destination exists      — every declared dest_file is a real file
//   C2  anchor exists           — dest_anchor is a real heading inside dest_file
//   C3  resident pointer exists — CLAUDE.md still points at the destination.
//                                 REQUIRED once a row declares a destination,
//                                 and the destination must be named in
//                                 CLAUDE.md: an optional pointer check is one
//                                 the author can switch off by leaving a column
//                                 blank, and a pointer that never names where it
//                                 leads sends the reader nowhere.
//   C4  no unrouted loss        — every heading that left CLAUDE.md is a ledger
//                                 row that is `retire`, or `on-demand` WITH a
//                                 destination. A section vanishing with nowhere
//                                 to go is a deletion, which is what G2 forbids.
//
// C4 is deliberately stricter than "removed ⊆ on-demand ∪ retire": an
// on-demand row with no destination that disappears would satisfy the looser
// reading while leaving the instruction nowhere, so a destination is required.
//
// C4 runs twice over different populations, because one of them cannot see the
// worst case. Walking ledger rows catches a declared section that lost its
// destination, but a section deleted from BOTH CLAUDE.md and the ledger has no
// row left to walk and would pass in silence. The strict pass therefore takes
// the pre-reduction heading set from git (the commit the A3 baseline is pinned
// against, so the reduction figure and this proof share one anchor) and
// enforces before − after ⊆ ledger(retire ∪ on-demand-with-dest). With no
// resolvable before-ref the lint FAILS rather than quietly proving less;
// --allow-missing-before opts into the weaker check and says so in the output.
//
// Security absorption S3: dest_file comes from a markdown document, i.e. it is
// document-controlled input that this lint then opens. Paths are screened
// lexically (no absolute, no `..`, no UNC/drive) BEFORE any filesystem call,
// then realpath-anchored under repoRoot via the shared containment guard. The
// lexical screen runs first so "escapes the repo" is never reported as the
// benign "file not found".

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseLedger, extractHeadings } = require('./ledger');
const { assertContained } = require('../path-containment');

// A ref is fed to `git show`, so keep it to the shapes git actually uses and
// nothing that could be read as an option or a second argument.
const SAFE_REF = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;

/** Read CLAUDE.md as of a git ref. Returns null when the ref cannot be read. */
function gitShowClaude(repoRoot, ref) {
  if (!SAFE_REF.test(ref)) return null;
  try {
    return execFileSync('git', ['show', ref + ':CLAUDE.md'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (_e) {
    return null;
  }
}

/**
 * Establish the pre-reduction heading set C4 compares against.
 *
 * Preference order: an explicit --before-ref, then the commit the A3 baseline
 * artifact was pinned against (the same commit the reduction figure is measured
 * from, so the two claims share one anchor), then the base branch. Whichever is
 * used is reported, because "which before" changes what C4 actually proved.
 */
function resolveBeforeHeadings(repoRoot, opts) {
  const candidates = [];
  if (opts.beforeRef) candidates.push({ ref: opts.beforeRef, source: 'explicit --before-ref' });

  const baselinePath = path.resolve(
    repoRoot,
    opts.baselinePath || path.join('docs', 'multi-session-work-loop', 'a3-baseline.json')
  );
  const raw = readFileOrNull(baselinePath);
  if (raw !== null) {
    try {
      const doc = JSON.parse(raw);
      if (doc && typeof doc.git_head === 'string' && doc.git_head) {
        candidates.push({ ref: doc.git_head, source: 'a3-baseline.json git_head' });
      }
    } catch (_e) { /* fall through to the base-branch candidate */ }
  }
  candidates.push({ ref: opts.baseRef || 'origin/main', source: 'base branch' });

  const tried = [];
  for (const candidate of candidates) {
    const text = gitShowClaude(repoRoot, candidate.ref);
    if (text !== null) {
      return {
        headings: new Set(extractHeadings(text).map((h) => h.title)),
        ref: candidate.ref,
        source: candidate.source,
        tried: tried,
        reason: null,
      };
    }
    tried.push(candidate.ref + ' (' + candidate.source + ')');
  }
  return {
    headings: null,
    ref: null,
    source: null,
    tried: tried,
    reason: 'no candidate ref resolved to a CLAUDE.md: ' + (tried.join(', ') || 'none tried'),
  };
}

/**
 * Reject document-supplied paths that could reach outside the repo.
 * @returns {string|null} rejection reason, or null when the shape is safe
 */
function unsafePathReason(p) {
  if (typeof p !== 'string' || p.trim() === '') return 'empty path';
  const raw = p.trim();
  if (/^[\\/]{2}/.test(raw)) return 'UNC path';
  if (/^[a-zA-Z]:/.test(raw)) return 'drive-qualified absolute path';
  if (path.isAbsolute(raw)) return 'absolute path';
  const segments = raw.split(/[\\/]+/);
  if (segments.indexOf('..') !== -1) return 'parent-directory traversal';
  if (raw.indexOf('\0') !== -1) return 'NUL byte';
  return null;
}

function readFileOrNull(target) {
  try {
    return fs.readFileSync(target, 'utf8');
  } catch (_e) {
    return null;
  }
}

/**
 * @param {Object} opts
 * @param {string} opts.repoRoot
 * @param {string} opts.claudePath  - path to CLAUDE.md (absolute or repo-relative)
 * @param {string} opts.ledgerPath  - path to instruction-contract.md
 * @returns {{ok: boolean, checks: Object, failures: Array, advisories: Array, stats: Object}}
 */
function lintReachability(opts = {}) {
  const repoRoot = opts.repoRoot || process.cwd();
  const claudePath = path.resolve(repoRoot, opts.claudePath || 'CLAUDE.md');
  const ledgerPath = path.resolve(
    repoRoot, opts.ledgerPath || path.join('docs', 'multi-session-work-loop', 'instruction-contract.md')
  );

  const failures = [];
  const advisories = [];
  const checks = { C1: 'pass', C2: 'pass', C3: 'pass', C4: 'pass' };
  const fail = (check, message) => {
    checks[check] = 'fail';
    failures.push({ check: check, message: message });
  };

  const ledgerText = readFileOrNull(ledgerPath);
  if (ledgerText === null) {
    fail('C1', `ledger not readable: ${ledgerPath}`);
    return { ok: false, checks: checks, failures: failures, advisories: advisories, stats: {} };
  }

  const parsed = parseLedger(ledgerText);
  if (!parsed.ok) {
    parsed.errors.forEach((e) => fail('C1', `ledger parse: ${e}`));
    return { ok: false, checks: checks, failures: failures, advisories: advisories, stats: {} };
  }

  const claudeText = readFileOrNull(claudePath);
  if (claudeText === null) {
    fail('C3', `CLAUDE.md not readable: ${claudePath}`);
    return { ok: false, checks: checks, failures: failures, advisories: advisories, stats: {} };
  }

  const currentHeadings = new Set(extractHeadings(claudeText).map((h) => h.title));
  const anchorCache = new Map();

  parsed.rows.forEach((row) => {
    // ---- C1 destination exists -------------------------------------------
    let destAbs = null;
    if (row.dest_file) {
      const reason = unsafePathReason(row.dest_file);
      if (reason) {
        fail('C1', `"${row.heading}": unsafe Dest File "${row.dest_file}" (${reason})`);
        return;
      }
      destAbs = path.resolve(repoRoot, row.dest_file);
      if (!fs.existsSync(destAbs) || !fs.statSync(destAbs).isFile()) {
        fail('C1', `"${row.heading}": Dest File does not exist — ${row.dest_file}`);
        return;
      }
      try {
        assertContained(destAbs, repoRoot);
      } catch (err) {
        fail('C1', `"${row.heading}": Dest File escapes the repo (${err.message})`);
        return;
      }

      // ---- C2 anchor exists ----------------------------------------------
      if (!anchorCache.has(destAbs)) {
        const text = readFileOrNull(destAbs);
        anchorCache.set(destAbs, new Set(
          text === null ? [] : extractHeadings(text, { maxLevel: 6 }).map((h) => h.title)
        ));
      }
      const anchors = anchorCache.get(destAbs);
      if (!anchors.has(row.dest_anchor)) {
        fail('C2', `"${row.heading}": Dest Anchor "${row.dest_anchor}" not found in ${row.dest_file}`);
      }
    }

    // ---- C3 resident pointer exists ---------------------------------------
    // The pointer column is REQUIRED once a row declares a destination. Leaving
    // it optional made the check vanish exactly where it matters: omit the
    // column and the "relocated with no way back" guard silently stops running
    // for that row while the lint still reports C3 pass.
    if (row.dest_file) {
      if (!row.resident_pointer) {
        fail('C3',
          `"${row.heading}": routed to ${row.dest_file} but the ledger declares no ` +
          'Resident Pointer (a relocation with no way back is a deletion)');
      } else if (claudeText.indexOf(row.resident_pointer) === -1) {
        fail('C3',
          `"${row.heading}": CLAUDE.md has no pointer containing "${row.resident_pointer}" ` +
          '(relocated without a way back is a deletion)');
      } else if (claudeText.indexOf(row.dest_file) === -1) {
        // Pointer text being present is not the same as the destination being
        // reachable. A pointer that never names where it leads sends the reader
        // nowhere, so matching arbitrary prose is not enough.
        fail('C3',
          `"${row.heading}": CLAUDE.md never names the destination "${row.dest_file}" ` +
          `(pointer "${row.resident_pointer}" does not lead anywhere)`);
      }
    } else if (row.resident_pointer && claudeText.indexOf(row.resident_pointer) === -1) {
      fail('C3',
        `"${row.heading}": CLAUDE.md has no pointer containing "${row.resident_pointer}" ` +
        '(relocated without a way back is a deletion)');
    }
  });

  // ---- C4 no unrouted loss -------------------------------------------------
  const ledgerHeadings = new Set(parsed.rows.map((r) => r.heading));
  parsed.rows.forEach((row) => {
    const present = currentHeadings.has(row.heading);
    if (present) return;

    if (row.disposition === 'resident') {
      fail('C4', `"${row.heading}": classified resident but is no longer in CLAUDE.md`);
      return;
    }
    if (row.disposition === 'retire') return;
    if (!row.dest_file || !row.dest_anchor) {
      fail('C4',
        `"${row.heading}": removed from CLAUDE.md but the ledger declares no destination ` +
        '(on-demand without a destination is a deletion, not a relocation)');
    }
  });

  currentHeadings.forEach((title) => {
    if (!ledgerHeadings.has(title)) {
      advisories.push(`CLAUDE.md heading not present in the ledger: "${title}"`);
    }
  });

  // ---- C4 (strict) vanished since the pre-reduction state -------------------
  // The loop above walks ledger rows, so it can only notice a loss the ledger
  // already knows about. A section deleted from BOTH CLAUDE.md and the ledger
  // leaves no row to iterate and passes silently — which is exactly the loss
  // C4 exists to forbid. The specified check is
  //     before-headings − after-headings ⊆ ledger(retire ∪ on-demand-with-dest)
  // and "before" has to come from outside the working tree to be trusted.
  const rowByHeading = new Map(parsed.rows.map((r) => [r.heading, r]));
  const before = resolveBeforeHeadings(repoRoot, opts);
  let vanished = [];
  if (before.headings) {
    before.headings.forEach((title) => {
      if (currentHeadings.has(title)) return;
      vanished.push(title);
      const row = rowByHeading.get(title);
      if (!row) {
        fail('C4',
          `"${title}": present in CLAUDE.md at ${before.ref} but gone now, and the ledger has ` +
          'no row for it (a section deleted from both the file and the ledger is an unrouted loss)');
        return;
      }
      if (row.disposition === 'retire') return;
      if (!row.dest_file || !row.dest_anchor) {
        fail('C4',
          `"${title}": removed since ${before.ref} but the ledger declares no destination ` +
          '(on-demand without a destination is a deletion, not a relocation)');
      }
    });
  } else if (opts.allowMissingBefore) {
    // Degrading is allowed, but never quietly: without a before-set this lint
    // cannot prove the thing G2 claims, and the caller has to see that.
    advisories.push(
      'C4 ran WITHOUT a pre-reduction baseline (' + before.reason + ') — it cannot detect a ' +
      'section deleted from both CLAUDE.md and the ledger'
    );
  } else {
    fail('C4',
      'no trusted pre-reduction heading set — ' + before.reason + '. Pass --before-ref <rev> ' +
      '(a commit whose CLAUDE.md predates the reduction), or --allow-missing-before to run the ' +
      'weaker ledger-only C4 and have the report say so.');
  }

  // Two distinct facts, deliberately not collapsed into one number:
  //   routed  — the ledger declares a destination (body moved out)
  //   removed — the heading is gone from CLAUDE.md entirely
  // The normal relocation keeps the heading as a pointer stub, so `routed` is
  // non-zero while `removed` stays zero. Reporting only one of them would read
  // as "nothing was relocated" right after a 50 percent reduction.
  const routed = parsed.rows.filter((r) => r.dest_file);
  const removed = parsed.rows.filter((r) => !currentHeadings.has(r.heading));

  return {
    ok: failures.length === 0,
    checks: checks,
    failures: failures,
    advisories: advisories,
    stats: {
      ledger_rows: parsed.rows.length,
      resident: parsed.rows.filter((r) => r.disposition === 'resident').length,
      on_demand: parsed.rows.filter((r) => r.disposition === 'on-demand').length,
      retire: parsed.rows.filter((r) => r.disposition === 'retire').length,
      claude_headings: currentHeadings.size,
      routed: routed.length,
      routed_headings: routed.map((r) => r.heading),
      removed: removed.length,
      removed_headings: removed.map((r) => r.heading),
      c4_strict: Boolean(before.headings),
      c4_before_ref: before.ref,
      c4_before_source: before.source,
      c4_before_headings: before.headings ? before.headings.size : null,
      vanished_since_before: vanished.length,
      vanished_headings: vanished,
    },
  };
}

function argValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

function main(argv) {
  const repoRoot = argValue(argv, '--repo-root', process.cwd());
  const result = lintReachability({
    repoRoot: repoRoot,
    claudePath: argValue(argv, '--claude', 'CLAUDE.md'),
    ledgerPath: argValue(argv, '--ledger', path.join('docs', 'multi-session-work-loop', 'instruction-contract.md')),
    beforeRef: argValue(argv, '--before-ref', null),
    baseRef: argValue(argv, '--base-ref', null),
    allowMissingBefore: argv.indexOf('--allow-missing-before') !== -1,
  });

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.ok ? 0 : 1;
  }

  const s = result.stats;
  process.stdout.write(
    `[instruction-contract] rows=${s.ledger_rows || 0} ` +
    `resident=${s.resident || 0} on-demand=${s.on_demand || 0} retire=${s.retire || 0} ` +
    `routed=${s.routed || 0} removed=${s.removed || 0} ` +
    `c4=${s.c4_strict ? 'strict@' + String(s.c4_before_ref).slice(0, 8) : 'ledger-only'}\n`
  );
  Object.keys(result.checks).forEach((c) => {
    process.stdout.write(`  ${c} ${result.checks[c]}\n`);
  });
  result.advisories.forEach((a) => process.stdout.write(`  advisory: ${a}\n`));
  result.failures.forEach((f) => process.stderr.write(`  FAIL ${f.check}: ${f.message}\n`));

  if (!result.ok) {
    process.stderr.write(
      '[instruction-contract] reachability lint FAILED — the reduction is not a relocation.\n' +
      '  Do not claim a reduction figure until these are resolved.\n'
    );
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { lintReachability, unsafePathReason };
