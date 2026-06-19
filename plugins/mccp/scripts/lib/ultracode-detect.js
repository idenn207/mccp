'use strict';

// ultracode-detect — mode-aware gate input for Anthropic native /effort ultracode
// delegation integration (mccp v1.4.0 axis B / M2).
//
// Returns JSON: {
//   availability:    "available" | "missing" | "unknown",
//   ultracode_signal: bool,
//   signal_tasks:    [{ index: int, name: str, line: int }]
//   unknown_tiers:   [{ tier: str, line: int }] — F5 absorption: explicit reject + warn
//   mode:            "implement" | null,
//   reason:          "ok" | "no-signal" | "command-missing" | "unknown-default"
//                  | "path-traversal" | "mode-mismatch" | "plan-missing"
//                  | "unknown-effort-tier"
// }
//
// Two-axis prompt gate (mirror of deep-research-detect M1 ship + integration template §4):
//   availability=available + ultracode_signal=true   → caller emits prompt
//   availability=missing OR unknown                  → silent skip (phantom 안내 금지)
//   availability=available + ultracode_signal=false  → silent skip
//
// Security:
//   --plan path must resolve inside repoRoot. Traversal → reason=path-traversal,
//   ultracode_signal=false, exit 0 (caller branches like any unavailability).
//
// Marker detection (per Task 2 spec):
//   Exact regex `^\s*-\s+\*\*Effort\*\*:\s*([a-z][a-z0-9-]*)\s*$`
//   tier ∈ KNOWN_TIERS = { 'ultracode' } → signal_tasks push (M2 F5 absorption: strict whitelist).
//   tier ∉ KNOWN_TIERS → unknown_tiers push + reason='unknown-effort-tier' + stderr warn.
//
// Default availability is intentionally `unknown` — Anthropic native /effort
// is shipped as a built-in slash command with no plugin manifest entry, so
// absence in user-level paths does not prove missing. `unknown` triggers
// silent skip (no phantom prompt). Env override
// MCCP_ULTRACODE_FEATURE={available|missing|unknown} takes precedence.

const fs = require('fs');
const os = require('os');
const path = require('path');

const MODES = ['implement'];
const KNOWN_TIERS = ['ultracode'];
const MARKER_REGEX = /^\s*-\s+\*\*Effort\*\*:\s*([a-z][a-z0-9-]*)\s*$/;
const TASK_HEADING_REGEX = /^### Task (\d+):\s+(.+)$/;

function probeAvailability(options) {
  const opts = options || {};
  const env = process.env.MCCP_ULTRACODE_FEATURE;
  if (env === 'available') return 'available';
  if (env === 'missing') return 'missing';
  if (env === 'unknown') return 'unknown';

  const userCommandPath = (opts.userCommandPath != null)
    ? opts.userCommandPath
    : path.join(os.homedir(), '.claude', 'commands', 'effort.md');
  try {
    if (fs.existsSync(userCommandPath) && fs.statSync(userCommandPath).isFile()) {
      return 'available';
    }
  } catch (_err) { /* ignore */ }

  const userSkillDir = (opts.userSkillDir != null)
    ? opts.userSkillDir
    : path.join(os.homedir(), '.claude', 'skills', 'ultracode');
  try {
    if (fs.existsSync(userSkillDir) && fs.statSync(userSkillDir).isDirectory()) {
      return 'available';
    }
  } catch (_err) { /* ignore */ }

  return 'unknown';
}

function validatePlanPathSafety(planPath, repoRoot) {
  if (!planPath) return { ok: true };
  if (path.isAbsolute(planPath) === false && /^\.\.[\\/]|[\\/]\.\.[\\/]/.test(planPath)) {
    return { ok: false, reason: 'path-traversal' };
  }
  const abs = path.resolve(repoRoot, planPath);
  const rel = path.relative(repoRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: 'path-traversal' };
  }
  return { ok: true };
}

function findTaskHeadingAbove(lines, markerLineIdx) {
  for (let i = markerLineIdx - 1; i >= 0; i--) {
    const m = lines[i].match(TASK_HEADING_REGEX);
    if (m) {
      return { index: parseInt(m[1], 10), name: m[2].trim(), headingLine: i + 1 };
    }
  }
  return null;
}

function scanMarkers(body) {
  const out = { signal_tasks: [], unknown_tiers: [] };
  if (!body) return out;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER_REGEX);
    if (!m) continue;
    const tier = m[1];
    const lineNo = i + 1;
    if (KNOWN_TIERS.indexOf(tier) === -1) {
      out.unknown_tiers.push({ tier: tier, line: lineNo });
      continue;
    }
    const heading = findTaskHeadingAbove(lines, i);
    if (!heading) {
      // Marker present but no task heading above — skip silently (orphan marker).
      // Caller can probe stderr for warning trace if needed.
      continue;
    }
    out.signal_tasks.push({
      index: heading.index,
      name: heading.name,
      line: lineNo,
    });
  }
  return out;
}

function detect(options) {
  const opts = options || {};
  const mode = MODES.indexOf(opts.mode) !== -1 ? opts.mode : null;
  const repoRoot = opts.repoRoot || process.cwd();
  const planPath = opts.planPath || null;
  let body = (opts.body != null) ? opts.body : null;

  const availability = probeAvailability({
    userCommandPath: opts.userCommandPath,
    userSkillDir: opts.userSkillDir,
  });

  if (!mode) {
    return {
      availability: availability,
      ultracode_signal: false,
      signal_tasks: [],
      unknown_tiers: [],
      mode: null,
      reason: 'mode-mismatch',
    };
  }

  if (planPath) {
    const safety = validatePlanPathSafety(planPath, repoRoot);
    if (!safety.ok) {
      return {
        availability: availability,
        ultracode_signal: false,
        signal_tasks: [],
        unknown_tiers: [],
        mode: mode,
        reason: safety.reason,
      };
    }
    try {
      const abs = path.resolve(repoRoot, planPath);
      body = fs.readFileSync(abs, 'utf8');
    } catch (_err) {
      return {
        availability: availability,
        ultracode_signal: false,
        signal_tasks: [],
        unknown_tiers: [],
        mode: mode,
        reason: 'plan-missing',
      };
    }
  }

  const scan = scanMarkers(body);
  const ultracodeSignal = scan.signal_tasks.length > 0;

  let reason;
  if (scan.unknown_tiers.length > 0 && !ultracodeSignal) {
    reason = 'unknown-effort-tier';
  } else if (availability === 'unknown') {
    reason = 'unknown-default';
  } else if (availability === 'missing') {
    reason = 'command-missing';
  } else if (!ultracodeSignal) {
    reason = 'no-signal';
  } else {
    reason = 'ok';
  }

  return {
    availability: availability,
    ultracode_signal: ultracodeSignal,
    signal_tasks: scan.signal_tasks,
    unknown_tiers: scan.unknown_tiers,
    mode: mode,
    reason: reason,
  };
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_err) {
    return '';
  }
}

function parseArgs(argv) {
  const args = { mode: null, plan: null, stdin: false, repoRoot: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--stdin') args.stdin = true;
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--plan') args.plan = argv[++i];
    else if (a === '--repo-root') args.repoRoot = argv[++i];
  }
  return args;
}

module.exports = {
  detect: detect,
  probeAvailability: probeAvailability,
  validatePlanPathSafety: validatePlanPathSafety,
  scanMarkers: scanMarkers,
  findTaskHeadingAbove: findTaskHeadingAbove,
  MODES: MODES,
  KNOWN_TIERS: KNOWN_TIERS,
  MARKER_REGEX: MARKER_REGEX,
  TASK_HEADING_REGEX: TASK_HEADING_REGEX,
};

if (require.main === module) {
  const argv = process.argv.slice(0);
  const sub = argv[2];
  if (sub !== 'detect') {
    process.stderr.write('Usage: ultracode-detect.js detect --mode implement [--plan <path>] [--stdin] [--repo-root <dir>] [--json]\n');
    process.exit(2);
  }
  const args = parseArgs(argv);
  const body = args.stdin ? readStdinSync() : null;
  const result = detect({
    mode: args.mode,
    planPath: args.plan,
    body: body,
    repoRoot: args.repoRoot || process.cwd(),
  });
  if (result.unknown_tiers.length > 0) {
    for (const u of result.unknown_tiers) {
      process.stderr.write(
        '[mccp-ultracode-detect] unknown Effort tier "' + u.tier +
        '" at line ' + u.line + ' — known tiers: ' + KNOWN_TIERS.join(', ') + '\n'
      );
    }
  }
  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(
      'ultracode-detect ' + (result.mode || 'no-mode') + ' reason=' + result.reason + '\n' +
      '  availability     : ' + result.availability + '\n' +
      '  ultracode_signal : ' + result.ultracode_signal + '\n' +
      '  signal_tasks     : ' + (result.signal_tasks.length
        ? result.signal_tasks.map((t) => 'Task ' + t.index + ' (' + t.name + ')').join(', ')
        : '<none>') + '\n' +
      '  unknown_tiers    : ' + (result.unknown_tiers.length
        ? result.unknown_tiers.map((u) => u.tier + '@' + u.line).join(', ')
        : '<none>') + '\n'
    );
  }
  process.exit(0);
}
