'use strict';

// impeccable-detect — mode-aware gate input for impeccable design-review wiring.
//
// Returns JSON: {
//   skill_available: bool,   // PRIMARY axis — drives gate branch decision
//   cli_available:   bool,   // telemetry — STATE.md dep_check_missing only
//   design_signal:   bool,   // any signal_files found?
//   signal_files:    [str],  // discovered design surface
//   mode:            str,    // prd | plan | implement | pr | review
//   reason:          str,    // classification: ok | skill-missing | no-signal | mode-mismatch | path-traversal
// }
//
// Classification enum mirrors codex-invoke.js — gate body branches on the
// reason field, not heuristics over the bool fields.
//
// Security:
//   - F-Sec-2 (security-reviewer NEEDS-ATTENTION): --plan path must resolve
//     inside the repo root. A traversal attempt returns reason=path-traversal
//     with design_signal=false and exit 0 (helper does not throw; caller
//     branches like any other unavailability).
//   - F-Sec-3: cli_available is telemetry only. Callers other than the
//     session-start.js dep-check writer must ignore it.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const depCheck = require('./dep-check.js');

const IMPECCABLE_PLUGIN_KEY = 'impeccable@anthropics';
const UI_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte', '.astro', '.css', '.scss', '.html'];
const MODES = ['prd', 'plan', 'implement', 'pr', 'review'];

function hasUiExtension(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.module.css')) return true;
  return UI_EXTENSIONS.some(function (ext) { return lower.endsWith(ext); });
}

function isDesignPlanPath(filePath) {
  return /\.claude[\\/]design[\\/].+\.design\.plan\.md$/i.test(filePath);
}

// Probe skill availability via two channels (env override > plugin manifest >
// user-level skill directory). v0.3.6 Task 0 extended the probe with the
// user-level skill directory branch — previously the function only checked
// installed_plugins.json, which false-negated impeccable installs at
// `~/.claude/skills/impeccable` (skill-scope, not plugin-scope).
function probeSkillAvailable(options) {
  const opts = options || {};
  if (process.env.MCCP_IMPECCABLE_SKILL === 'available') return true;
  if (process.env.MCCP_IMPECCABLE_SKILL === 'missing') return false;
  const manifest = depCheck.readInstalledPlugins(opts.installedPluginsPath);
  if (manifest.plugins) {
    const probeKeys = [IMPECCABLE_PLUGIN_KEY, 'impeccable'];
    for (let i = 0; i < probeKeys.length; i++) {
      const key = probeKeys[i];
      const entries = manifest.plugins[key];
      if (Array.isArray(entries) && entries.length > 0) return true;
    }
  }
  const userSkillDir = (opts.userSkillDir != null)
    ? opts.userSkillDir
    : path.join(os.homedir(), '.claude', 'skills', 'impeccable');
  try {
    if (fs.existsSync(userSkillDir) && fs.statSync(userSkillDir).isDirectory()) {
      return true;
    }
  } catch (_err) { /* ignore — fall through to false */ }
  return false;
}

function gitDiffNames(baseRef, cwd) {
  if (!baseRef) return { ok: false, files: [] };
  let result;
  try {
    result = spawnSync('git', ['diff', '--name-only', baseRef + '...HEAD'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
    });
  } catch (_err) {
    return { ok: false, files: [] };
  }
  if (!result || result.status !== 0) return { ok: false, files: [] };
  const files = (result.stdout || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  return { ok: true, files: files };
}

function gitWorktreeNames(cwd) {
  let result;
  try {
    result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
    });
  } catch (_err) {
    return [];
  }
  if (!result || result.status !== 0) return [];
  return (result.stdout || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function findDesignSignalInDiff(files) {
  return files.filter(function (f) {
    return hasUiExtension(f) || isDesignPlanPath(f);
  });
}

function findDesignSignalInArtifact(planPath) {
  // Scan plan/PRD artifact body for explicit design surface declarations.
  // Two channels:
  //   (a) ## Files to Change table rows with UI extension in the path cell.
  //   (b) Keyword markers — explicit author intent.
  let content;
  try {
    content = fs.readFileSync(planPath, 'utf8');
  } catch (_err) {
    return [];
  }
  const found = new Set();

  const fileTableMatches = content.match(/`[^`\n]+\.(?:tsx|jsx|vue|svelte|astro|css|scss|html)`/gi) || [];
  fileTableMatches.forEach(function (m) {
    const inner = m.slice(1, -1);
    if (hasUiExtension(inner)) found.add(inner);
  });

  const designPlanRefs = content.match(/\.claude[\\/]design[\\/][^\s)`]+\.design\.plan\.md/gi) || [];
  designPlanRefs.forEach(function (m) { found.add(m); });

  // Keyword sentinel — only count as signal when no concrete file paths are
  // found but the author explicitly tagged design intent.
  if (found.size === 0 && /^#+\s*Design\b|#design\b|##\s*Design Direction/im.test(content)) {
    found.add('<keyword:design>');
  }

  return Array.from(found);
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

function detect(options) {
  const opts = options || {};
  const mode = MODES.indexOf(opts.mode) !== -1 ? opts.mode : null;
  const repoRoot = opts.repoRoot || process.cwd();
  const baseRef = opts.baseRef || null;
  const planPath = opts.planPath || null;

  const skillAvailable = probeSkillAvailable({ installedPluginsPath: opts.installedPluginsPath });
  let cliAvailable;
  if (process.env.MCCP_IMPECCABLE_CLI_MOCK === 'available') cliAvailable = true;
  else if (process.env.MCCP_IMPECCABLE_CLI_MOCK === 'missing') cliAvailable = false;
  else cliAvailable = !!depCheck.checkImpeccableCli({ platform: opts.platform }).installed;

  if (!mode) {
    return {
      skill_available: skillAvailable,
      cli_available: cliAvailable,
      design_signal: false,
      signal_files: [],
      mode: null,
      reason: 'mode-mismatch',
    };
  }

  if (planPath) {
    const safety = validatePlanPathSafety(planPath, repoRoot);
    if (!safety.ok) {
      return {
        skill_available: skillAvailable,
        cli_available: cliAvailable,
        design_signal: false,
        signal_files: [],
        mode: mode,
        reason: safety.reason,
      };
    }
  }

  let signalFiles = [];
  if (mode === 'prd' || mode === 'plan') {
    if (planPath) {
      const abs = path.resolve(repoRoot, planPath);
      signalFiles = findDesignSignalInArtifact(abs);
    }
  } else if (mode === 'implement') {
    const worktree = gitWorktreeNames(repoRoot);
    signalFiles = findDesignSignalInDiff(worktree);
  } else if (mode === 'pr' || mode === 'review') {
    const diff = gitDiffNames(baseRef || 'origin/main', repoRoot);
    signalFiles = findDesignSignalInDiff(diff.files);
  }

  const designSignal = signalFiles.length > 0;
  let reason;
  if (!skillAvailable) reason = 'skill-missing';
  else if (!designSignal) reason = 'no-signal';
  else reason = 'ok';

  return {
    skill_available: skillAvailable,
    cli_available: cliAvailable,
    design_signal: designSignal,
    signal_files: signalFiles,
    mode: mode,
    reason: reason,
  };
}

function parseArgs(argv) {
  const args = { mode: null, base: null, plan: null, repoRoot: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--plan') args.plan = argv[++i];
    else if (a === '--repo-root') args.repoRoot = argv[++i];
  }
  return args;
}

module.exports = {
  detect: detect,
  probeSkillAvailable: probeSkillAvailable,
  hasUiExtension: hasUiExtension,
  isDesignPlanPath: isDesignPlanPath,
  validatePlanPathSafety: validatePlanPathSafety,
  findDesignSignalInArtifact: findDesignSignalInArtifact,
  findDesignSignalInDiff: findDesignSignalInDiff,
  UI_EXTENSIONS: UI_EXTENSIONS,
  MODES: MODES,
  IMPECCABLE_PLUGIN_KEY: IMPECCABLE_PLUGIN_KEY,
};

if (require.main === module) {
  const argv = process.argv.slice(0);
  const sub = argv[2];
  if (sub !== 'detect') {
    process.stderr.write('Usage: impeccable-detect.js detect --mode <prd|plan|implement|pr|review> [--base <ref>] [--plan <path>] [--repo-root <dir>] [--json]\n');
    process.exit(2);
  }
  const args = parseArgs(argv);
  const result = detect({
    mode: args.mode,
    baseRef: args.base,
    planPath: args.plan,
    repoRoot: args.repoRoot || process.cwd(),
  });
  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(
      'impeccable-detect ' + (result.mode || 'no-mode') + ' reason=' + result.reason + '\n' +
      '  skill_available : ' + result.skill_available + '\n' +
      '  cli_available   : ' + result.cli_available + ' (telemetry only)\n' +
      '  design_signal   : ' + result.design_signal + '\n' +
      '  signal_files    : ' + (result.signal_files.length ? result.signal_files.join(', ') : '<none>') + '\n'
    );
  }
  process.exit(0);
}
