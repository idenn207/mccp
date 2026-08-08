'use strict';

// L1 — mechanical plan-consistency backbone. LLM-free, deterministic.
//
// DD3: L1 is the GATEKEEPER. It runs before L2 and short-circuits it, so a plan
// that fails a mechanical check never spends a single agent. The reasoning is
// that an LLM panel's "looks fine to me" must not be able to paper over a fact
// that can be checked exactly — if the plan cites a file that does not exist,
// no amount of reviewer agreement makes that citation real.
//
// Three verdicts, and the distinction between the last two is load-bearing:
//   converged     — every check passed
//   divergent     — we checked and found violations (the plan is wrong)
//   inconclusive  — we could NOT check (plan unreadable, parser threw)
// "We found no violations" and "we could not look" are different facts. G3/R2
// forced this split: decideReview maps inconclusive to `unavailable`, never to
// `divergent`, and the CLI maps it to exit 12 rather than exit 1 so the operator
// sees an environment problem instead of a plan problem.
//
// This module NEVER throws. Any internal fs/parse failure becomes an
// inconclusive verdict with an E_READ violation (mirrors design-grounding's
// read-failure handling: a read failure is a block, not a silent no-op).

const nodePath = require('path');
const nodeFs = require('fs');

const { normalizePath } = require('../plan-conflict-detector');

const REQUIRED_SECTIONS = [
  'Summary',
  'Files to Change',
  'Tasks',
  'Validation',
  'Risks',
  'Acceptance',
];

// C6 base-resolution set. Plan prose cites modules by their conventional short
// name (`receipt-convergence.js:20-30`, `schema.js:33`) because that is how
// people refer to them in this repo. A literal-existence check would flag that
// convention as a violation on every plan — measured: 4 false positives when a
// prototype checker was self-applied to this very plan. So a citation counts as
// resolved if it exists under ANY of these bases.
const CITATION_BASES = [
  '',
  'plugins/mccp/scripts/',
  'plugins/mccp/scripts/lib/',
  'plugins/mccp/scripts/receipt/',
  'plugins/mccp/scripts/state/',
  'plugins/mccp/scripts/hooks/',
  'plugins/mccp/',
];

// A fixed base list is not enough, and this was measured rather than guessed:
// the plan that introduced this checker cites `verify.js:44-52`, which lives in
// lib/implement-dispatch/ — a directory no static list anticipated. Hard-coding
// every subdirectory would rot on the next one added, so the bases below are
// discovered at check time by listing one level under these roots.
const DYNAMIC_BASE_ROOTS = [
  'plugins/mccp/scripts',
  'plugins/mccp/scripts/lib',
];

// Only `path:line` citations are checked. A bare `foo.js` mention is prose, not
// a claim about a location, and treating it as one produces noise.
const CITATION_RE = /([A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+):(\d+)(?:-\d+)?/g;

const ACTIONS_REQUIRING_EXISTENCE = ['UPDATE', 'DELETE'];
const ACTIONS_REQUIRING_ABSENCE = ['CREATE'];

function defaultFsAdapter() {
  return {
    existsSync: function (p) {
      try { return nodeFs.existsSync(p); } catch (_) { return false; }
    },
    readFileSync: function (p) { return nodeFs.readFileSync(p, 'utf8'); },
    readdirSync: function (p) {
      try { return nodeFs.readdirSync(p); } catch (_) { return []; }
    },
  };
}

// Resolve the citation base list once per check. Entries that turn out to be
// files rather than directories are harmless: joining a citation onto them
// simply never exists, so they cost one failed lookup and nothing else.
function buildCitationBases(fs, repoRoot) {
  const bases = CITATION_BASES.slice();
  if (typeof fs.readdirSync !== 'function') return bases;
  DYNAMIC_BASE_ROOTS.forEach(function (root) {
    let entries = [];
    try { entries = fs.readdirSync(nodePath.join(repoRoot, root)) || []; } catch (_) { entries = []; }
    entries.forEach(function (name) {
      const base = root + '/' + String(name) + '/';
      if (bases.indexOf(base) === -1) bases.push(base);
    });
  });
  return bases;
}

function v(code, detail) {
  return { code: code, detail: detail };
}

// Split a markdown table row into trimmed cells, ignoring the leading/trailing
// pipe. Returns null for a non-row line.
function tableCells(line) {
  if (!/^\s*\|/.test(line)) return null;
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '');
  return trimmed.split('|').map(function (c) { return c.trim(); });
}

function isSeparatorRow(cells) {
  return cells.every(function (c) { return /^:?-{2,}:?$/.test(c); });
}

// Extract the `Files to Change` rows WITH their action column. parseFilesToChange
// deliberately returns paths only (it feeds a different consumer), so C3 needs
// its own row walk; normalizePath is shared so both agree on path shape.
function parseFileRows(planText) {
  const lines = String(planText).split(/\r?\n/);
  const rows = [];
  let inSection = false;
  let headerSeen = false;
  let expectedCols = null;
  const columnMismatches = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      inSection = /^Files\s+to\s+Change\s*$/i.test(heading[1]);
      headerSeen = false;
      expectedCols = null;
      continue;
    }
    if (!inSection) continue;

    const cells = tableCells(line);
    if (!cells) continue;
    if (isSeparatorRow(cells)) continue;

    if (expectedCols === null) expectedCols = cells.length;
    else if (cells.length !== expectedCols) {
      columnMismatches.push({ line: i + 1, got: cells.length, want: expectedCols });
    }

    if (!headerSeen && /^File$/i.test(cells[0])) { headerSeen = true; continue; }

    const raw = cells[0];
    if (!raw) continue;
    const linkMatch = raw.match(/\[([^\]]+)\]\([^)]+\)/);
    const cell = linkMatch ? linkMatch[1] : raw;
    const path = normalizePath(cell.replace(/`/g, ''));
    if (!path) continue;

    const action = (cells[1] || '').replace(/`/g, '').trim().toUpperCase();
    rows.push({ path: path, action: action, line: i + 1 });
  }

  return { rows: rows, columnMismatches: columnMismatches };
}

function collectHeadings(planText) {
  const lines = String(planText).split(/\r?\n/);
  const h2 = [];
  const taskHeadings = [];
  for (let i = 0; i < lines.length; i++) {
    const m2 = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m2) h2.push({ title: m2[1].trim(), line: i + 1 });
    const m3 = lines[i].match(/^###\s+(Task\s+[0-9]+[a-z]?)\b/i);
    if (m3) taskHeadings.push({ title: m3[1].replace(/\s+/g, ' '), line: i + 1 });
  }
  return { h2: h2, taskHeadings: taskHeadings };
}

// Slice the body of each `### Task N` block so C4 can look for its Validate line.
function taskBlocks(planText) {
  const lines = String(planText).split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(Task\s+[0-9]+[a-z]?)\b(.*)$/i);
    if (m) {
      if (current) blocks.push(current);
      current = { title: m[1].replace(/\s+/g, ' '), line: i + 1, body: [] };
      continue;
    }
    // A new H2 ends the Tasks region.
    if (/^##\s+/.test(lines[i])) {
      if (current) { blocks.push(current); current = null; }
      continue;
    }
    if (current) current.body.push(lines[i]);
  }
  if (current) blocks.push(current);
  return blocks;
}

function resolvesUnderAnyBase(fs, repoRoot, rel, bases) {
  for (let i = 0; i < bases.length; i++) {
    const candidate = nodePath.join(repoRoot, bases[i] + rel);
    if (fs.existsSync(candidate)) return true;
  }
  return false;
}

// checkPlanConsistency({planText, planPath, repoRoot, fsAdapter})
//   → { verdict: 'converged'|'divergent'|'inconclusive', violations: [{code,detail}] }
function checkPlanConsistency(opts) {
  const o = opts || {};
  const fs = o.fsAdapter || defaultFsAdapter();
  const repoRoot = o.repoRoot || process.cwd();
  const violations = [];

  let planText = o.planText;
  try {
    if (typeof planText !== 'string') {
      if (!o.planPath) {
        return {
          verdict: 'inconclusive',
          violations: [v('E_READ', 'neither planText nor planPath supplied')],
        };
      }
      planText = fs.readFileSync(nodePath.resolve(o.planPath));
    }
    if (typeof planText !== 'string' || planText.length === 0) {
      return {
        verdict: 'inconclusive',
        violations: [v('E_READ', 'plan body is empty or unreadable: ' + (o.planPath || '(inline)'))],
      };
    }
  } catch (e) {
    return {
      verdict: 'inconclusive',
      violations: [v('E_READ', 'cannot read plan: ' + (e && e.message ? e.message : String(e)))],
    };
  }

  try {
    const headings = collectHeadings(planText);
    const h2Titles = headings.h2.map(function (h) { return h.title; });

    // C1 — required sections present.
    REQUIRED_SECTIONS.forEach(function (name) {
      const hit = h2Titles.some(function (t) {
        return t.toLowerCase() === name.toLowerCase();
      });
      if (!hit) violations.push(v('C1_MISSING_SECTION', 'missing required section: ## ' + name));
    });

    // C7a — required sections must not be duplicated (two `## Tasks` means one
    // of them is silently ignored by every downstream parser).
    REQUIRED_SECTIONS.forEach(function (name) {
      const count = h2Titles.filter(function (t) {
        return t.toLowerCase() === name.toLowerCase();
      }).length;
      if (count > 1) {
        violations.push(v('C7_DUPLICATE_SECTION',
          'section "## ' + name + '" appears ' + count + ' times'));
      }
    });

    // C7b — duplicate `### Task N` headings.
    const seenTasks = Object.create(null);
    headings.taskHeadings.forEach(function (t) {
      const key = t.title.toLowerCase();
      if (seenTasks[key]) {
        violations.push(v('C7_DUPLICATE_TASK',
          'duplicate task heading "' + t.title + '" at line ' + t.line +
          ' (first at line ' + seenTasks[key] + ')'));
      } else {
        seenTasks[key] = t.line;
      }
    });

    const parsed = parseFileRows(planText);

    // C7c — Files to Change rows must have a consistent column count.
    parsed.columnMismatches.forEach(function (m) {
      violations.push(v('C7_TABLE_SHAPE',
        'Files to Change row at line ' + m.line + ' has ' + m.got +
        ' columns, expected ' + m.want));
    });

    const createTargets = Object.create(null);
    parsed.rows.forEach(function (row) {
      if (ACTIONS_REQUIRING_ABSENCE.indexOf(row.action) !== -1) {
        createTargets[row.path] = true;
      }
    });

    const citationBases = buildCitationBases(fs, repoRoot);

    parsed.rows.forEach(function (row) {
      // C2 — repo-root-relative full path. The dedupe matcher in receipt/dedupe.js
      // compares these literally against git diff paths and does NOT infer a
      // prefix (CLAUDE.md §1.2), so an abbreviated path silently defeats
      // cross-gate dedupe. We judge it by whether the FIRST segment names a real
      // entry at the repo root — an abbreviation like `receipt/schema.js` fails
      // because there is no `receipt/` at the root.
      //
      // A CREATE row introducing a NEW top-level directory trips that test for an
      // innocent reason: `newdir/x.md` has no `newdir/` at the root precisely
      // because the plan is about to make one. Distinguishing the two cases needs
      // more than the first segment — an abbreviation is a path that RESOLVES
      // under a conventional base (`receipt/schema.js` → plugins/mccp/scripts/),
      // while a genuinely new tree resolves nowhere. So CREATE rows are exempt
      // only when nothing resolves, which is the honest reading of the evidence.
      const firstSeg = row.path.split('/')[0];
      const isCreate = ACTIONS_REQUIRING_ABSENCE.indexOf(row.action) !== -1;
      if (!firstSeg) {
        violations.push(v('C2_NOT_REPO_ROOT_PATH',
          'Files to Change row at line ' + row.line + ' has an empty path'));
      } else if (!fs.existsSync(nodePath.join(repoRoot, firstSeg))) {
        const looksAbbreviated = resolvesUnderAnyBase(fs, repoRoot, row.path, citationBases);
        if (!isCreate || looksAbbreviated) {
          violations.push(v('C2_NOT_REPO_ROOT_PATH',
            'path "' + row.path + '" (line ' + row.line + ') is not repo-root-relative: ' +
            'no "' + firstSeg + '" at repo root' +
            (looksAbbreviated ? ' but it resolves under a conventional base — ' +
              'this is an abbreviated path' : '') +
            '. Use the full path from the repo root (cross-gate dedupe matches literally).'));
        }
      }

      // C3 — action/existence agreement.
      const abs = nodePath.join(repoRoot, row.path);
      const exists = fs.existsSync(abs);
      if (ACTIONS_REQUIRING_EXISTENCE.indexOf(row.action) !== -1 && !exists) {
        violations.push(v('C3_MISSING_TARGET',
          row.action + ' target does not exist: ' + row.path + ' (line ' + row.line + ')'));
      }
      if (ACTIONS_REQUIRING_ABSENCE.indexOf(row.action) !== -1 && exists) {
        violations.push(v('C3_CREATE_EXISTS',
          'CREATE target already exists: ' + row.path + ' (line ' + row.line + ')'));
      }
    });

    // C4 — every task carries a Validate line.
    taskBlocks(planText).forEach(function (b) {
      const hasValidate = b.body.some(function (l) {
        return /\*\*Validate\*\*\s*:/.test(l);
      });
      if (!hasValidate) {
        violations.push(v('C4_MISSING_VALIDATE',
          '"' + b.title + '" (line ' + b.line + ') has no **Validate**: line'));
      }
    });

    // C5 — Source PRD path resolves.
    const prdMatch = planText.match(/\*\*Source PRD\*\*\s*:\s*`?([^`\n]+?)`?\s*$/m);
    if (prdMatch) {
      const prdPath = normalizePath(prdMatch[1]);
      if (!fs.existsSync(nodePath.join(repoRoot, prdPath))) {
        violations.push(v('C5_MISSING_PRD', 'Source PRD does not exist: ' + prdPath));
      }
    }

    // C6 — `path:line` citations resolve under at least one conventional base.
    // CREATE targets are exempt: they are supposed to be absent (C3 owns them).
    const citationSeen = Object.create(null);
    let m;
    CITATION_RE.lastIndex = 0;
    while ((m = CITATION_RE.exec(planText)) !== null) {
      const rel = normalizePath(m[1]);
      if (!rel || citationSeen[rel]) continue;
      citationSeen[rel] = true;
      if (createTargets[rel]) continue;
      if (!resolvesUnderAnyBase(fs, repoRoot, rel, citationBases)) {
        violations.push(v('C6_UNRESOLVED_CITATION',
          'cited file not found under any known base: ' + rel));
      }
    }
  } catch (e) {
    // A parser defect must not read as "plan is clean". It reads as "we could
    // not check", which blocks just the same but points at the right problem.
    return {
      verdict: 'inconclusive',
      violations: violations.concat([
        v('E_PARSE', 'L1 checker failed: ' + (e && e.message ? e.message : String(e))),
      ]),
    };
  }

  return {
    verdict: violations.length === 0 ? 'converged' : 'divergent',
    violations: violations,
  };
}

module.exports = {
  checkPlanConsistency: checkPlanConsistency,
  parseFileRows: parseFileRows,
  REQUIRED_SECTIONS: REQUIRED_SECTIONS,
  CITATION_BASES: CITATION_BASES,
};
