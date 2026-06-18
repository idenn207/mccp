'use strict';

// deep-research-detect — mode-aware gate input for Anthropic native /deep-research integration.
//
// Returns JSON: {
//   availability:    "available" | "missing" | "unknown",
//   research_signal: bool,
//   signal_files:    [str] — reserved for future evidence-anchor links (currently always [])
//   mode:            "prd" | null,
//   reason:          "ok" | "no-signal" | "command-missing" | "unknown-default" | "path-traversal" | "mode-mismatch"
// }
//
// Two-axis prompt gate (mirror of plan-prd Phase 2.5 matrix):
//   availability=available + research_signal=true  → caller emits prompt
//   availability=missing OR unknown                → silent skip (phantom 안내 금지)
//   availability=available + research_signal=false → silent skip
//
// Security:
//   --plan path must resolve inside repoRoot. Traversal → reason=path-traversal,
//   research_signal=false, exit 0 (caller branches like any unavailability).
//
// research_signal heuristic = AND of:
//   (1) evidence-gap signal ≥1: (a) "Assumption — needs validation via" marker
//       OR (b) ## Evidence section empty or contains only "TBD —" placeholder
//   (2) research-trigger keyword ≥1: spec, standard, research, 표준, 외부, 리서치
//       English keywords use word boundary; Korean uses literal substring.
//
// Default availability is intentionally `unknown` — Anthropic native /deep-research
// is shipped as a built-in slash command with no plugin manifest entry, so
// absence in user-level command/skill paths does not prove missing. `unknown`
// triggers silent skip (no phantom prompt). Env override
// MCCP_DEEP_RESEARCH_SKILL={available|missing|unknown} takes precedence.

const fs = require('fs');
const os = require('os');
const path = require('path');

const MODES = ['prd'];
const ENGLISH_KEYWORDS = ['spec', 'standard', 'research'];
const KOREAN_KEYWORDS = ['표준', '외부', '리서치'];

function probeAvailability(options) {
  const opts = options || {};
  const env = process.env.MCCP_DEEP_RESEARCH_SKILL;
  if (env === 'available') return 'available';
  if (env === 'missing') return 'missing';
  if (env === 'unknown') return 'unknown';

  const userCommandPath = (opts.userCommandPath != null)
    ? opts.userCommandPath
    : path.join(os.homedir(), '.claude', 'commands', 'deep-research.md');
  try {
    if (fs.existsSync(userCommandPath) && fs.statSync(userCommandPath).isFile()) {
      return 'available';
    }
  } catch (_err) { /* ignore */ }

  const userSkillDir = (opts.userSkillDir != null)
    ? opts.userSkillDir
    : path.join(os.homedir(), '.claude', 'skills', 'deep-research');
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

function hasEvidenceGap(body) {
  if (!body) return false;
  // Channel (a): explicit "Assumption — needs validation via" marker.
  // The em-dash may render as "—" or "--" or "-" across editors.
  if (/Assumption\s*[—\-]+\s*needs\s+validation\s+via/i.test(body)) return true;

  // Channel (b): ## Evidence section empty or only "TBD —" placeholder.
  // [\t ]* (not \s*) restricts the trailing-heading whitespace to horizontal
  // characters so subsequent newlines don't get swallowed before content capture.
  const match = body.match(/(?:^|\n)##[ \t]+Evidence[ \t]*\r?\n([\s\S]*?)(?:\n##\s+|$)/i);
  if (match) {
    const content = match[1].trim();
    if (content === '') return true;
    const stripped = content.replace(/^[>\s\-*]+/gm, '').trim();
    if (/^TBD\s*[—\-]/i.test(stripped) && stripped.length < 200) return true;
  }
  return false;
}

function hasResearchKeyword(body) {
  if (!body) return false;
  for (let i = 0; i < ENGLISH_KEYWORDS.length; i++) {
    const kw = ENGLISH_KEYWORDS[i];
    if (new RegExp('\\b' + kw + '\\b', 'i').test(body)) return true;
  }
  for (let i = 0; i < KOREAN_KEYWORDS.length; i++) {
    if (body.indexOf(KOREAN_KEYWORDS[i]) !== -1) return true;
  }
  return false;
}

function computeResearchSignal(body) {
  if (!body) return false;
  return hasEvidenceGap(body) && hasResearchKeyword(body);
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
      research_signal: false,
      signal_files: [],
      mode: null,
      reason: 'mode-mismatch',
    };
  }

  if (planPath) {
    const safety = validatePlanPathSafety(planPath, repoRoot);
    if (!safety.ok) {
      return {
        availability: availability,
        research_signal: false,
        signal_files: [],
        mode: mode,
        reason: safety.reason,
      };
    }
    try {
      const abs = path.resolve(repoRoot, planPath);
      body = fs.readFileSync(abs, 'utf8');
    } catch (_err) {
      body = null;
    }
  }

  const researchSignal = computeResearchSignal(body);

  let reason;
  if (availability === 'unknown') reason = 'unknown-default';
  else if (availability === 'missing') reason = 'command-missing';
  else if (!researchSignal) reason = 'no-signal';
  else reason = 'ok';

  return {
    availability: availability,
    research_signal: researchSignal,
    signal_files: [],
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
  hasEvidenceGap: hasEvidenceGap,
  hasResearchKeyword: hasResearchKeyword,
  computeResearchSignal: computeResearchSignal,
  MODES: MODES,
  ENGLISH_KEYWORDS: ENGLISH_KEYWORDS,
  KOREAN_KEYWORDS: KOREAN_KEYWORDS,
};

if (require.main === module) {
  const argv = process.argv.slice(0);
  const sub = argv[2];
  if (sub !== 'detect') {
    process.stderr.write('Usage: deep-research-detect.js detect --mode prd [--plan <path>] [--stdin] [--repo-root <dir>] [--json]\n');
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
  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(
      'deep-research-detect ' + (result.mode || 'no-mode') + ' reason=' + result.reason + '\n' +
      '  availability    : ' + result.availability + '\n' +
      '  research_signal : ' + result.research_signal + '\n' +
      '  signal_files    : ' + (result.signal_files.length ? result.signal_files.join(', ') : '<none>') + '\n'
    );
  }
  process.exit(0);
}
