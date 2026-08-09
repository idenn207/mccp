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
//   C3  resident pointer exists — CLAUDE.md still points at the destination
//   C4  no unrouted loss        — every heading that left CLAUDE.md is a ledger
//                                 row that is `retire`, or `on-demand` WITH a
//                                 destination. A section vanishing with nowhere
//                                 to go is a deletion, which is what G2 forbids.
//
// C4 is deliberately stricter than "removed ⊆ on-demand ∪ retire": an
// on-demand row with no destination that disappears would satisfy the looser
// reading while leaving the instruction nowhere, so a destination is required.
//
// Security absorption S3: dest_file comes from a markdown document, i.e. it is
// document-controlled input that this lint then opens. Paths are screened
// lexically (no absolute, no `..`, no UNC/drive) BEFORE any filesystem call,
// then realpath-anchored under repoRoot via the shared containment guard. The
// lexical screen runs first so "escapes the repo" is never reported as the
// benign "file not found".

const fs = require('fs');
const path = require('path');

const { parseLedger, extractHeadings } = require('./ledger');
const { assertContained } = require('../path-containment');

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
    if (row.resident_pointer && claudeText.indexOf(row.resident_pointer) === -1) {
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
  });

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.ok ? 0 : 1;
  }

  const s = result.stats;
  process.stdout.write(
    `[instruction-contract] rows=${s.ledger_rows || 0} ` +
    `resident=${s.resident || 0} on-demand=${s.on_demand || 0} retire=${s.retire || 0} ` +
    `routed=${s.routed || 0} removed=${s.removed || 0}\n`
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
