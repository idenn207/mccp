'use strict';

// goal-detect — mode-aware gate input for Anthropic native /goal completion-condition
// integration (mccp v1.x.x axis C / M3).
//
// Returns JSON: {
//   availability:  "available" | "missing" | "unknown",
//   goal_signal:   bool,
//   signal_ref:    { row: int, name: str, plan: str|null, status: str } | null,
//   mode:          "milestone-close" | null,
//   reason:        "ok" | "command-missing" | "no-signal" | "path-traversal"
//                | "unknown-default" | "mode-mismatch" | "milestone-not-found"
//                | "already-closed" | "not-started" | "plan-missing"
//                | "no-milestones-table" | "cost-ceiling-blocked"
// }
//
// Two-axis prompt gate (mirror of ultracode-detect M2 ship + integration template §4):
//   availability=available + goal_signal=true   → caller emits cooperative guide
//   availability=missing OR unknown             → silent skip (phantom 안내 금지)
//   availability=available + goal_signal=false  → silent skip
//
// Security (S2 absorption — symlink path-traversal guard):
//   --milestone PRD path or --prd path must resolve inside repoRoot via realpath.
//   Traversal (relative .. AND realpath escape) → reason=path-traversal,
//   goal_signal=false, exit 0 (caller branches like any unavailability).
//
// Milestone parsing (PRD `Delivery Milestones` markdown table):
//   header: `| # | Milestone | Outcome | Status | Plan |`
//   row:    `| <id> | <name> | <outcome> | <status> | <plan-link-or-dash> |`
//   --milestone <id>     → match row by id (int) OR partial name (case-insensitive substring)
//   --milestone <prd>    → treat as PRD path, auto-pick first in-progress row
//   --prd <path>         → explicit PRD path (auto-pick)
//   row.status='in-progress' + plan cell !== '—' + plan file exists → goal_signal=true
//   plan cell accepts `` `path` ``, `[label](path)` and bare `path`; a bare path
//   resolves against repoRoot (PRD table convention), `./`-prefixed against the
//   PRD dir, with the other base as fallback.
//
// `/goal` is a built-in (v2.1.139+) prompt-based Stop hook wrapper — unrelated
// to the dynamic workflows feature. Availability is derived from hooks settings
// signals (settings-signal.hooksGoalEnabled), NOT a filesystem probe of
// user-level command paths (which can never observe a built-in command). goal is
// default-on with no positive opt-in key, so the absence of any hook-disable
// signal across all levels (managed included) is the active signal; managed
// policy present-but-unreadable downgrades to `unknown`. `unknown`/`missing`
// trigger silent skip. Env override MCCP_GOAL_FEATURE={available|missing|unknown}
// takes precedence.

const fs = require('fs');
const path = require('path');
const settingsSignal = require('./settings-signal');

const MODES = ['milestone-close'];
const PRD_TABLE_HEADER_RE = /^\|\s*#\s*\|\s*Milestone\s*\|\s*Outcome\s*\|\s*Status\s*\|\s*Plan\s*\|/;
const PRD_TABLE_SEPARATOR_RE = /^\|\s*-{2,}\s*\|/;
const STATUS_VALUES = ['pending', 'in-progress', 'complete', 'dropped'];

function probeAvailability(options) {
  const opts = options || {};
  const env = process.env.MCCP_GOAL_FEATURE;
  if (env === 'available') return 'available';
  if (env === 'missing') return 'missing';
  if (env === 'unknown') return 'unknown';

  // goal is gated on hooks (disableAllHooks / allowManagedHooksOnly), not the
  // workflows feature. Delegate to the settings-signal helper; on any
  // unexpected failure fall open to 'unknown' (silent skip).
  try {
    return settingsSignal.hooksGoalEnabled({
      projectRoot: opts.projectRoot,
      userPath: opts.userPath,
      projectPath: opts.projectPath,
      managedPath: opts.managedPath,
    });
  } catch (err) {
    process.stderr.write(
      '[mccp:goal-detect] hooks signal probe failed (' +
      err.message + ') — defaulting to unknown\n'
    );
    return 'unknown';
  }
}

function validatePathSafety(target, repoRoot) {
  if (!target) return { ok: true, resolved: null };
  if (path.isAbsolute(target) === false && /(^|[\\/])\.\.([\\/]|$)/.test(target)) {
    return { ok: false, reason: 'path-traversal' };
  }
  const candidate = path.resolve(repoRoot, target);
  let resolvedTarget;
  let resolvedRoot;
  try {
    resolvedRoot = fs.realpathSync(repoRoot);
  } catch (_err) {
    resolvedRoot = path.resolve(repoRoot);
  }
  try {
    resolvedTarget = fs.realpathSync(candidate);
  } catch (_err) {
    resolvedTarget = candidate;
  }
  const rel = path.relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: 'path-traversal' };
  }
  return { ok: true, resolved: resolvedTarget };
}

function parseMilestoneTable(prdBody) {
  if (!prdBody) return { rows: [], headerFound: false };
  const lines = prdBody.split(/\r?\n/);
  let i = 0;
  let headerLine = -1;
  for (; i < lines.length; i++) {
    if (PRD_TABLE_HEADER_RE.test(lines[i])) {
      headerLine = i;
      break;
    }
  }
  if (headerLine === -1) return { rows: [], headerFound: false };
  let cursor = headerLine + 1;
  if (cursor < lines.length && PRD_TABLE_SEPARATOR_RE.test(lines[cursor])) cursor++;

  const rows = [];
  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (!line.trim().startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const idCell = cells[0];
    const idInt = parseInt(idCell, 10);
    if (Number.isNaN(idInt)) continue;
    rows.push({
      row: idInt,
      name: cells[1],
      outcome: cells[2],
      status: cells[3].toLowerCase(),
      plan: cells[4],
      line: cursor + 1,
    });
  }
  return { rows: rows, headerFound: true };
}

function matchMilestoneRow(rows, milestoneRef) {
  if (!milestoneRef) return null;
  const refInt = parseInt(milestoneRef, 10);
  if (!Number.isNaN(refInt) && String(refInt) === String(milestoneRef).trim()) {
    return rows.find((r) => r.row === refInt) || null;
  }
  const needle = String(milestoneRef).toLowerCase();
  for (const r of rows) {
    if (r.name.toLowerCase().indexOf(needle) !== -1) return r;
  }
  return null;
}

function extractPlanPath(planCell) {
  if (planCell == null) return null;
  let cell = String(planCell).trim();
  // PRD tables wrap the plan path in inline code far more often than in a
  // markdown link — strip the fence before anything else so the backticks
  // never reach path resolution.
  const fenced = cell.match(/^`+([^`]+)`+$/);
  if (fenced) cell = fenced[1].trim();
  if (!cell || cell === '—' || cell === '-') return null;
  const md = cell.match(/\[[^\]]+\]\(([^)]+)\)/);
  if (md) return md[1].trim();
  return cell;
}

// A cell written `./x.plan.md` / `../x.plan.md` is a document-relative markdown
// reference (resolve against the PRD), a bare `.claude/plans/x.plan.md` is the
// repo-root-relative form every mccp PRD table actually uses. Try the likely
// base first and keep the other as fallback so neither convention breaks.
function planResolutionBases(planRel, repoRoot, prdDir) {
  if (path.isAbsolute(planRel)) return [null];
  return /^\.\.?[\\/]/.test(planRel) ? [prdDir, repoRoot] : [repoRoot, prdDir];
}

function evaluateRow(row, repoRoot, prdDir) {
  if (!row) {
    return { goal_signal: false, signal_ref: null, reason: 'milestone-not-found' };
  }
  if (row.status === 'complete') {
    return {
      goal_signal: false,
      signal_ref: { row: row.row, name: row.name, plan: null, status: row.status },
      reason: 'already-closed',
    };
  }
  if (row.status === 'pending' || row.status === 'dropped') {
    return {
      goal_signal: false,
      signal_ref: { row: row.row, name: row.name, plan: null, status: row.status },
      reason: 'not-started',
    };
  }
  const planRel = extractPlanPath(row.plan);
  if (!planRel) {
    return {
      goal_signal: false,
      signal_ref: { row: row.row, name: row.name, plan: null, status: row.status },
      reason: 'plan-missing',
    };
  }
  let anyBaseSafe = false;
  let planExists = false;
  for (const base of planResolutionBases(planRel, repoRoot, prdDir)) {
    const planAbs = base === null ? planRel : path.resolve(base, planRel);
    const safety = validatePathSafety(planAbs, repoRoot);
    if (!safety.ok) continue;
    anyBaseSafe = true;
    const candidate = safety.resolved || planAbs;
    try {
      planExists = fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch (_err) { planExists = false; }
    if (planExists) break;
  }
  // Only a cell that escapes the repo under EVERY base is a traversal attempt;
  // one safe-but-absent base is an ordinary missing plan.
  if (!anyBaseSafe) {
    return {
      goal_signal: false,
      signal_ref: { row: row.row, name: row.name, plan: planRel, status: row.status },
      reason: 'path-traversal',
    };
  }
  if (!planExists) {
    return {
      goal_signal: false,
      signal_ref: { row: row.row, name: row.name, plan: planRel, status: row.status },
      reason: 'plan-missing',
    };
  }
  return {
    goal_signal: true,
    signal_ref: { row: row.row, name: row.name, plan: planRel, status: row.status },
    reason: 'ok',
  };
}

function detect(options) {
  const opts = options || {};
  const mode = MODES.indexOf(opts.mode) !== -1 ? opts.mode : null;
  const repoRoot = opts.repoRoot || process.cwd();

  const availability = probeAvailability({
    projectRoot: opts.projectRoot != null ? opts.projectRoot : repoRoot,
    userPath: opts.userPath,
    projectPath: opts.projectPath,
    managedPath: opts.managedPath,
  });

  if (!mode) {
    return {
      availability: availability,
      goal_signal: false,
      signal_ref: null,
      mode: null,
      reason: 'mode-mismatch',
    };
  }

  const prdPath = opts.prdPath || null;
  const milestoneRef = opts.milestone || null;

  let resolvedPrdPath = null;
  if (prdPath) {
    const safety = validatePathSafety(prdPath, repoRoot);
    if (!safety.ok) {
      return {
        availability: availability,
        goal_signal: false,
        signal_ref: null,
        mode: mode,
        reason: safety.reason,
      };
    }
    resolvedPrdPath = safety.resolved || path.resolve(repoRoot, prdPath);
  } else if (milestoneRef && /[\\/]/.test(milestoneRef)) {
    const safety = validatePathSafety(milestoneRef, repoRoot);
    if (!safety.ok) {
      return {
        availability: availability,
        goal_signal: false,
        signal_ref: null,
        mode: mode,
        reason: safety.reason,
      };
    }
    resolvedPrdPath = safety.resolved || path.resolve(repoRoot, milestoneRef);
  }

  let prdBody = opts.prdBody != null ? opts.prdBody : null;
  if (resolvedPrdPath && prdBody == null) {
    try {
      prdBody = fs.readFileSync(resolvedPrdPath, 'utf8');
    } catch (_err) {
      return {
        availability: availability,
        goal_signal: false,
        signal_ref: null,
        mode: mode,
        reason: 'plan-missing',
      };
    }
  }

  if (prdBody == null) {
    return {
      availability: availability,
      goal_signal: false,
      signal_ref: null,
      mode: mode,
      reason: 'no-signal',
    };
  }

  const parsed = parseMilestoneTable(prdBody);
  if (!parsed.headerFound) {
    return {
      availability: availability,
      goal_signal: false,
      signal_ref: null,
      mode: mode,
      reason: 'no-milestones-table',
    };
  }

  let row = null;
  if (milestoneRef && !/[\\/]/.test(milestoneRef)) {
    row = matchMilestoneRow(parsed.rows, milestoneRef);
    if (!row) {
      return {
        availability: availability,
        goal_signal: false,
        signal_ref: null,
        mode: mode,
        reason: 'milestone-not-found',
      };
    }
  } else {
    row = parsed.rows.find((r) => r.status === 'in-progress') || null;
    if (!row) {
      return {
        availability: availability,
        goal_signal: false,
        signal_ref: null,
        mode: mode,
        reason: 'milestone-not-found',
      };
    }
  }

  const prdDir = resolvedPrdPath ? path.dirname(resolvedPrdPath) : repoRoot;
  const result = evaluateRow(row, repoRoot, prdDir);

  let reason = result.reason;
  if (result.goal_signal && availability !== 'available') {
    if (availability === 'unknown') reason = 'unknown-default';
    else reason = 'command-missing';
  }

  return {
    availability: availability,
    goal_signal: availability === 'available' && result.goal_signal,
    signal_ref: result.signal_ref,
    mode: mode,
    reason: reason,
  };
}

function parseArgs(argv) {
  const args = {
    mode: null,
    milestone: null,
    prd: null,
    repoRoot: null,
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--milestone') args.milestone = argv[++i];
    else if (a === '--prd') args.prd = argv[++i];
    else if (a === '--repo-root') args.repoRoot = argv[++i];
  }
  return args;
}

module.exports = {
  detect: detect,
  probeAvailability: probeAvailability,
  validatePathSafety: validatePathSafety,
  parseMilestoneTable: parseMilestoneTable,
  matchMilestoneRow: matchMilestoneRow,
  extractPlanPath: extractPlanPath,
  evaluateRow: evaluateRow,
  MODES: MODES,
  STATUS_VALUES: STATUS_VALUES,
};

if (require.main === module) {
  const argv = process.argv.slice(0);
  const sub = argv[2];
  if (sub !== 'detect') {
    process.stderr.write('Usage: goal-detect.js detect --mode milestone-close [--milestone <id-or-path>] [--prd <path>] [--repo-root <dir>] [--json]\n');
    process.exit(2);
  }
  const args = parseArgs(argv);
  const result = detect({
    mode: args.mode,
    milestone: args.milestone,
    prdPath: args.prd,
    repoRoot: args.repoRoot || process.cwd(),
  });
  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(
      'goal-detect ' + (result.mode || 'no-mode') + ' reason=' + result.reason + '\n' +
      '  availability  : ' + result.availability + '\n' +
      '  goal_signal   : ' + result.goal_signal + '\n' +
      '  signal_ref    : ' + (result.signal_ref
        ? 'row=' + result.signal_ref.row + ' name="' + result.signal_ref.name + '" status=' + result.signal_ref.status
        : '<none>') + '\n'
    );
  }
  process.exit(0);
}
