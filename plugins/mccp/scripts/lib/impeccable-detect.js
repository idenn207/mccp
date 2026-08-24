'use strict';

// impeccable-detect — mode-aware gate input for impeccable design-review wiring.
//
// Returns JSON: {
//   skill_available:     bool,   // PRIMARY axis — drives gate branch decision
//   cli_available:       bool,   // telemetry — STATE.md dep_check_missing only
//   design_signal:       bool,   // any signal_files found?
//   signal_files:        [str],  // discovered design surface
//   mode:                str,    // prd | plan | implement | pr | review
//   reason:              str,    // classification: ok | skill-missing | no-signal | mode-mismatch | path-traversal
//   silent_skip:         bool,   // skill_available=true + design_signal=false (silent fall-through)
//   silent_skip_reason:  str|null // 'no-signal' when silent_skip=true, null otherwise
// }
//
// Classification enum mirrors codex-invoke.js — gate body branches on the
// reason field, not heuristics over the bool fields.
//
// v1.3.0 M1 — silent-skip surface + DESIGN_SURFACE_PATHS whitelist.
//   Previously the SKILL_AVAIL=1 + SIGNAL=0 path was unobservable: no receipt
//   trace, no caller branch could distinguish it from a green "no design
//   surface" path. v1.3.0 dashboard surface (M3 renderer) silently fell into
//   this path because UI_EXTENSIONS only matches .tsx/.jsx/.css/.html files,
//   not the .js generators that PRODUCE those artifacts. The whitelist names
//   the cache-producing pipeline files (renderer/, briefing/, derive/, hooks/
//   render-trigger, receipt/write.js, .claude/cache/STATUS.md|status.html)
//   so that touching them ALSO trips design_signal=true. Applied to BOTH
//   findDesignSignalInDiff (diff-mode detection) AND findDesignSignalInArtifact
//   (plan-mode detection) — Codex R1 F1 absorption: a one-sided fix would let
//   plan-mode silent-skip continue.
//
//   M1 enforcement is OBSERVATIONAL ONLY. silent_skip=true fires on every
//   no-signal plan including pure-backend changes (the detector cannot tell
//   "no design surface intended" from "design surface missed"). Strict-gate
//   blocking on silent_skip is deferred to M2, after the SKILL first-step +
//   critique loop close the false-negative window. Codex R1 F2 absorption
//   (strict-gate blocking) is intentionally partially deferred.
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

// v1.31.1 M1 — the registry key is `<pluginName>@<marketplaceName>`, so the key
// alone is NOT the plugin name. The observed key on a default install is
// `impeccable@impeccable`; the pre-M1 hardcode (`impeccable@anthropics`, since
// removed) matched nothing, which made a fully installed plugin invisible to
// every gate. Match by PREFIX so the marketplace half cannot break detection
// again, and keep the bare legacy key as a separate exact case. `@` must
// directly follow `impeccable`, so an unrelated `impeccable-foo@x` does not
// match.
const IMPECCABLE_PLUGIN_KEY_PATTERN = /^impeccable@/;
const IMPECCABLE_PLUGIN_LEGACY_BARE_KEY = 'impeccable';
const IMPECCABLE_SKILL_DIRNAME = 'impeccable';
// Directory names read off disk flow into `invocation` AND into path.join, so
// they are whitelisted before either use (security-reviewer 1A).
const SKILL_DIR_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
// Frontmatter sits in the first few hundred bytes of every SKILL.md measured
// (4.1.1 and 3.5.0 both carry `version:` on line 3). A bounded head read keeps
// an enormous file from being pulled into memory to answer one question.
const FRONTMATTER_READ_BYTES = 8 * 1024;
const UI_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte', '.astro', '.css', '.scss', '.html'];
const MODES = ['prd', 'plan', 'implement', 'pr', 'review'];

// v1.3.0 M1 Task 4 (Codex R1 F3 absorption) — design surface whitelist.
// Files that PRODUCE or LIVE AT cache surfaces, not just files with UI
// extensions. Match is prefix-based (for directories) or exact (for files).
// Path separator normalized to forward slash before matching, so the same
// table works on Windows + POSIX.
//
// Coverage rationale:
//   renderer/    — primary STATUS.md + status.html producer (M3).
//   briefing/    — feeds receipt meta.briefing_summary (M2), which renderer
//                  surfaces back to dashboard.
//   derive/      — single normalization model fed to renderer (M1).
//   render-trigger-session-start.js — kicks the producer.
//   receipt/write.js — emits briefing fields consumed by renderer.
//   .claude/cache/STATUS.md|status.html — the cache targets themselves; direct
//                  edits there must trigger critique (overshoot-safe because
//                  cache is gitignored — these are touched intentionally only).
//
// v1.3.0-m2 Task 6 (F1 absorption) — design-gate control-plane additions:
//   impeccable-detect.js     — the detector itself; changes must self-apply.
//   design-critique-decide.js — critique oracle; changes must self-apply.
//   skills/frontend-design-direction/ — output-constraint anchors; changes
//                  must run the critique loop against the new constraints.
// Scope is deliberately narrow — commands/*.md is NOT included because
// that would over-trigger on routine command-body refactors. The 3 paths
// added here are the design-gate control plane proper.
const DESIGN_SURFACE_PATHS = [
  'plugins/mccp/scripts/lib/renderer/',
  'plugins/mccp/scripts/lib/briefing/',
  'plugins/mccp/scripts/derive/',
  'plugins/mccp/scripts/hooks/render-trigger-session-start.js',
  'plugins/mccp/scripts/receipt/write.js',
  '.claude/cache/STATUS.md',
  '.claude/cache/status.html',
  // v1.3.0-m2 Task 6 F1 absorption (narrow design-gate control plane).
  'plugins/mccp/scripts/lib/impeccable-detect.js',
  'plugins/mccp/scripts/lib/design-critique-decide.js',
  'plugins/mccp/skills/frontend-design-direction/',
];

function normalizeSlashes(filePath) {
  return String(filePath).replace(/\\+/g, '/');
}

function hasUiExtension(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.module.css')) return true;
  return UI_EXTENSIONS.some(function (ext) { return lower.endsWith(ext); });
}

function isDesignPlanPath(filePath) {
  return /\.claude[\\/]design[\\/].+\.design\.plan\.md$/i.test(filePath);
}

function hasDesignSurfacePath(filePath) {
  if (!filePath) return false;
  const norm = normalizeSlashes(filePath);
  for (let i = 0; i < DESIGN_SURFACE_PATHS.length; i++) {
    const prefix = DESIGN_SURFACE_PATHS[i];
    // Trailing slash → directory prefix match; otherwise exact-or-prefix
    // (we never expect the cache files to be directories, so prefix-match
    // on a file path collapses to exact match).
    if (prefix.endsWith('/')) {
      if (norm.indexOf(prefix) !== -1) return true;
    } else {
      if (norm === prefix || norm.endsWith('/' + prefix)) return true;
    }
  }
  return false;
}

/// ── impeccable resolution oracle (v1.31.1 M1) ───────────────────────────────
//
// probeSkillAvailable used to answer "is impeccable installed?" with a bare
// boolean. That is the wrong question: mccp command bodies call
// `Skill(impeccable, ...)`, and a plugin-channel install registers under
// `<pluginName>:<skillDirName>` instead — so "installed" and "the name we call
// resolves" are different facts. resolveImpeccable answers the second one and
// enumerates every source it saw, so callers never have to guess.
//
// Contract: NEVER throws. Every filesystem path is injectable so tests can
// substitute a tmpdir. Unknown stays unknown — an ambiguous winner reports
// nulls rather than a guess.

function normalizeSourcePath(absPath, repoRoot) {
  if (!absPath) return null;
  try {
    const fromRepo = path.relative(repoRoot, absPath);
    if (fromRepo && !fromRepo.startsWith('..') && !path.isAbsolute(fromRepo)) {
      return normalizeSlashes(fromRepo);
    }
    const fromHome = path.relative(os.homedir(), absPath);
    if (fromHome && !fromHome.startsWith('..') && !path.isAbsolute(fromHome)) {
      return '~/' + normalizeSlashes(fromHome);
    }
  } catch (_err) { /* fall through to the raw path */ }
  return normalizeSlashes(absPath);
}

function isRegularFile(filePath) {
  try {
    const st = fs.statSync(filePath, { throwIfNoEntry: false });
    return !!st && st.isFile();
  } catch (_err) {
    return false;
  }
}

// A directory we are willing to read a skill out of. Rejecting symlinks here
// closes the window between listing a directory and reading the file inside it
// (security-reviewer 1B): without it, a link repointed mid-run makes us read —
// and then stamp a version from — a file we never enumerated.
function isPlainDirectory(dirPath) {
  try {
    const st = fs.lstatSync(dirPath, { throwIfNoEntry: false });
    return !!st && !st.isSymbolicLink() && st.isDirectory();
  } catch (_err) {
    return false;
  }
}

// Read `version` out of SKILL.md frontmatter using a bounded head read.
// isRegularFile comes first: a FIFO at this path would otherwise block the read
// forever and the gate would die on an opaque timeout (security-reviewer 2B).
function readFrontmatterVersion(skillMdPath) {
  if (!isRegularFile(skillMdPath)) return null;
  let fd = null;
  try {
    fd = fs.openSync(skillMdPath, 'r');
    const buf = Buffer.alloc(FRONTMATTER_READ_BYTES);
    const read = fs.readSync(fd, buf, 0, FRONTMATTER_READ_BYTES, 0);
    const head = buf.slice(0, read).toString('utf8');
    const match = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    const lines = match[1].split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      if (line.slice(0, colon).trim() !== 'version') continue;
      const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
      return value ? value : null;
    }
    return null;
  } catch (_err) {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_err2) { /* ignore */ } }
  }
}

// project and user channels register under the BARE name, so both answer the
// same `Skill(impeccable, ...)` call. Requiring SKILL.md — not merely the
// directory — is a deliberate behaviour change: the pre-M1 probe counted an
// empty directory as installed, which is answering "yes" for a body that
// cannot open.
function readBareSkillSource(sourceName, skillDir, repoRoot) {
  if (!skillDir || !isPlainDirectory(skillDir)) return null;
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!isRegularFile(skillMd)) return null;
  return {
    source: sourceName,
    invocation: IMPECCABLE_SKILL_DIRNAME,
    version: readFrontmatterVersion(skillMd),
    path: normalizeSourcePath(skillMd, repoRoot),
  };
}

function pluginNameFromRegistryKey(key) {
  const at = key.indexOf('@');
  return at === -1 ? key : key.slice(0, at);
}

// Enumerate plugin-channel skills. An entry counts only when its installPath is
// really on disk and carries skills/<name>/SKILL.md — a stale installPath is
// the failure codex-invoke already names `install-path-stale`, and counting it
// would manufacture the exact "points at a body that will not open" state this
// oracle exists to prevent. The skill name is READ, never assumed.
//
// installPath itself is not re-validated for traversal: it comes from the
// registry that dep-check.js owns, and a writer who can edit that file already
// has more direct means. The constraint that matters here is the one below —
// the directory name must be a plain identifier before it reaches path.join or
// the invocation string.
function readPluginSkillSources(installedPluginsPath, repoRoot) {
  const manifest = depCheck.readInstalledPlugins(installedPluginsPath);
  const plugins = (manifest && manifest.plugins) || {};
  const found = [];
  Object.keys(plugins).sort().forEach(function (key) {
    const matches = IMPECCABLE_PLUGIN_KEY_PATTERN.test(key)
      || key === IMPECCABLE_PLUGIN_LEGACY_BARE_KEY;
    if (!matches) return;
    const entries = plugins[key];
    if (!Array.isArray(entries)) return;
    entries.forEach(function (raw) {
      const entry = raw || {};
      if (typeof entry.installPath !== 'string' || !entry.installPath) return;
      const skillsDir = path.join(entry.installPath, 'skills');
      let names;
      try {
        names = fs.readdirSync(skillsDir);
      } catch (_err) {
        return;
      }
      names.sort().forEach(function (name) {
        if (!SKILL_DIR_NAME_PATTERN.test(name)) return;
        const dir = path.join(skillsDir, name);
        if (!isPlainDirectory(dir)) return;
        const skillMd = path.join(dir, 'SKILL.md');
        if (!isRegularFile(skillMd)) return;
        const manifestVersion = (typeof entry.version === 'string' && entry.version)
          ? entry.version
          : null;
        found.push({
          source: 'plugin',
          invocation: pluginNameFromRegistryKey(key) + ':' + name,
          version: manifestVersion || readFrontmatterVersion(skillMd),
          path: normalizeSourcePath(skillMd, repoRoot),
        });
      });
    });
  });
  return found;
}

// Every enumerated source that is NOT the winning row.
//
// The winner is passed by REFERENCE, captured in the branch that chose it, and
// excluded by object identity -- never by comparing source+invocation+path.
// Two rows can legitimately carry the same triple (a registry listing the same
// installPath twice, or two plugin entries resolving to one skills/ tree), and
// a field comparison would then drop BOTH, reporting nothing eclipsed while
// more than one body exists. That is the exact failure this field exists to
// prevent (Implement-Codex R1 F5).
//
// No version comparison happens here or anywhere downstream: a version may be
// null or not semver, and deciding which copy is 'newer' is a judgement this
// oracle does not make. It enumerates; the human reads (UI6).
function eclipsedFrom(sources, winnerRow) {
  if (!winnerRow) return [];
  return sources.filter(function (row) { return row !== winnerRow; });
}

function resolveImpeccable(options) {
  const opts = options || {};
  const forced = process.env.MCCP_IMPECCABLE_SKILL;

  // Only `available` and `missing` mean anything. A typo used to fall through
  // in silence, so an operator who meant to force one answer got the other one
  // and had nothing to read. Say so and then probe for real.
  if (forced !== undefined && forced !== '' && forced !== 'available' && forced !== 'missing') {
    process.stderr.write(
      '[mccp:impeccable-detect] WARNING: MCCP_IMPECCABLE_SKILL="' + forced
      + '" is not one of available|missing — ignoring the override and probing the real sources.\n'
    );
  }

  // env wins outright, and `missing` ends the answer immediately — enumerating
  // sources we have been told to ignore would only invite a caller to use them.
  if (forced === 'missing') {
    return {
      available: false,
      reason: 'env-forced-missing',
      invocation: null,
      source: null,
      version: null,
      path: null,
      sources: [],
      shadowed: false,
      eclipsed: [],
    };
  }

  const repoRoot = opts.repoRoot || process.cwd();
  const projectSkillDir = (opts.projectSkillDir != null)
    ? opts.projectSkillDir
    : path.join(repoRoot, '.claude', 'skills', IMPECCABLE_SKILL_DIRNAME);
  const userSkillDir = (opts.userSkillDir != null)
    ? opts.userSkillDir
    : path.join(os.homedir(), '.claude', 'skills', IMPECCABLE_SKILL_DIRNAME);

  const sources = [];
  // Held by reference so the return below excludes exactly this row rather
  // than any row that happens to look like it.
  let envRow = null;
  if (forced === 'available') {
    // No path and no version: the override asserts that the call will resolve,
    // and asserts nothing about which body answers it.
    envRow = {
      source: 'env',
      invocation: IMPECCABLE_SKILL_DIRNAME,
      version: null,
      path: null,
    };
    sources.push(envRow);
  }
  readPluginSkillSources(opts.installedPluginsPath, repoRoot).forEach(function (row) {
    sources.push(row);
  });
  const projectSource = readBareSkillSource('project', projectSkillDir, repoRoot);
  if (projectSource) sources.push(projectSource);
  const userSource = readBareSkillSource('user', userSkillDir, repoRoot);
  if (userSource) sources.push(userSource);

  if (forced === 'available') {
    return {
      available: true,
      reason: 'env-forced-available',
      invocation: IMPECCABLE_SKILL_DIRNAME,
      source: 'env',
      version: null,
      path: null,
      sources: sources,
      shadowed: false,
      eclipsed: eclipsedFrom(sources, envRow),
    };
  }

  // Bare sources are the ones mccp actually calls, so they decide the winner.
  // A plugin source neither shadows nor is shadowed by them — it answers to a
  // different name entirely.
  const bare = sources.filter(function (row) {
    return row.source === 'project' || row.source === 'user';
  });
  const pluginRows = sources.filter(function (row) { return row.source === 'plugin'; });

  if (bare.length > 1) {
    // Which body `Skill(impeccable, ...)` opens when two bare sources exist has
    // never been measured. Reporting one of them anyway would be the single
    // most damaging thing this oracle could do, because its whole promise is to
    // name the body that actually opens — so it names none, and says so.
    return {
      available: true,
      reason: 'ok',
      invocation: IMPECCABLE_SKILL_DIRNAME,
      source: null,
      version: null,
      path: null,
      sources: sources,
      shadowed: true,
      // Empty here does NOT mean 'nothing to clean up' -- it means 'which rows
      // are eclipsed cannot be determined', because naming the eclipsed set
      // requires naming the winner and no winner was established. Saying
      // otherwise would be the same guess this branch exists to refuse (UI6).
      // impeccable-cleanup rule (6) is what keeps the two readings apart for
      // consumers: an ambiguous winner refuses every removal outright.
      eclipsed: [],
    };
  }

  if (bare.length === 1) {
    return {
      available: true,
      reason: 'ok',
      invocation: bare[0].invocation,
      source: bare[0].source,
      version: bare[0].version,
      path: bare[0].path,
      sources: sources,
      shadowed: false,
      eclipsed: eclipsedFrom(sources, bare[0]),
    };
  }

  if (pluginRows.length > 0) {
    // A plugin may ship several skills; prefer the one whose directory is
    // literally `impeccable`, else the first in sorted order.
    let winner = null;
    for (let i = 0; i < pluginRows.length; i++) {
      if (pluginRows[i].invocation.split(':')[1] === IMPECCABLE_SKILL_DIRNAME) {
        winner = pluginRows[i];
        break;
      }
    }
    if (!winner) winner = pluginRows[0];
    return {
      available: true,
      reason: 'ok',
      invocation: winner.invocation,
      source: 'plugin',
      version: winner.version,
      path: winner.path,
      sources: sources,
      shadowed: false,
      eclipsed: eclipsedFrom(sources, winner),
    };
  }

  return {
    available: false,
    reason: 'not-installed',
    invocation: null,
    source: null,
    version: null,
    path: null,
    sources: sources,
    shadowed: false,
    eclipsed: [],
  };
}

// The seven reporting fields, assembled in ONE place. detect() returns from three
// branches, and the early return for a rejected --plan path used to omit them —
// which quietly falsified the strict-superset contract CLAUDE.md §3.17 states.
// A fourth branch added later cannot repeat that by forgetting to copy a list.
function resolutionFields(resolved) {
  return {
    impeccable_invocation: resolved.invocation,
    impeccable_source: resolved.source,
    impeccable_version: resolved.version,
    impeccable_path: resolved.path,
    impeccable_sources: resolved.sources,
    impeccable_shadowed: resolved.shadowed,
    impeccable_eclipsed: resolved.eclipsed,
  };
}

// Kept as the boolean face of the oracle so the four call sites stay unchanged.
function probeSkillAvailable(options) {
  return resolveImpeccable(options).available;
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
    return hasUiExtension(f) || isDesignPlanPath(f) || hasDesignSurfacePath(f);
  });
}

function findDesignSignalInArtifact(planPath) {
  // Scan plan/PRD artifact body for explicit design surface declarations.
  // Three channels:
  //   (a) ## Files to Change table rows with UI extension in the path cell.
  //   (b) ## Files to Change table rows whose backtick path hits the
  //       DESIGN_SURFACE_PATHS whitelist (M1 Task 4, Codex R1 F1 absorption —
  //       plan-mode detection must mirror diff-mode coverage, otherwise the
  //       wedge can't see its own surface).
  //   (c) Keyword markers — explicit author intent.
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

  const allBacktickPaths = content.match(/`[^`\n]+`/g) || [];
  allBacktickPaths.forEach(function (m) {
    const inner = m.slice(1, -1).trim();
    if (hasDesignSurfacePath(inner)) found.add(inner);
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

  // One resolution, used for BOTH the boolean branch and the new reporting
  // fields. Calling the oracle twice would let the two disagree.
  const resolved = resolveImpeccable({
    installedPluginsPath: opts.installedPluginsPath,
    projectSkillDir: opts.projectSkillDir,
    userSkillDir: opts.userSkillDir,
    repoRoot: repoRoot,
  });
  const skillAvailable = resolved.available;
  let cliAvailable;
  if (process.env.MCCP_IMPECCABLE_CLI_MOCK === 'available') cliAvailable = true;
  else if (process.env.MCCP_IMPECCABLE_CLI_MOCK === 'missing') cliAvailable = false;
  else cliAvailable = !!depCheck.checkImpeccableCli({ platform: opts.platform }).installed;

  if (!mode) {
    return Object.assign({
      skill_available: skillAvailable,
      cli_available: cliAvailable,
      design_signal: false,
      signal_files: [],
      mode: null,
      reason: 'mode-mismatch',
      silent_skip: false,
      silent_skip_reason: null,
    }, resolutionFields(resolved));
  }

  if (planPath) {
    const safety = validatePlanPathSafety(planPath, repoRoot);
    if (!safety.ok) {
      return Object.assign({
        skill_available: skillAvailable,
        cli_available: cliAvailable,
        design_signal: false,
        signal_files: [],
        mode: mode,
        reason: safety.reason,
        silent_skip: false,
        silent_skip_reason: null,
      }, resolutionFields(resolved));
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

  // v1.3.0 M1 Task 2 — silent-skip surface.
  // Skill is available but the detector reports no design signal: this is the
  // exact fall-through that v1.3.0 M0~M5 cycles flew under for 7 milestones.
  // Receipt now records the fact so M2 has an audit artifact to act on.
  // Beware: this flips true on every no-signal plan including pure-backend
  // changes — M1 validator surfaces silent_skip as informational warning at
  // every gate, NOT blocking. Strict-gate blocking is deferred to M2 once
  // SKILL first-step + critique loop close the false-negative window.
  const silentSkip = skillAvailable && !designSignal;
  const silentSkipReason = silentSkip ? 'no-signal' : null;

  return Object.assign({
    skill_available: skillAvailable,
    cli_available: cliAvailable,
    design_signal: designSignal,
    signal_files: signalFiles,
    mode: mode,
    reason: reason,
    silent_skip: silentSkip,
    silent_skip_reason: silentSkipReason,
  }, resolutionFields(resolved));
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
  hasDesignSurfacePath: hasDesignSurfacePath,
  normalizeSlashes: normalizeSlashes,
  validatePlanPathSafety: validatePlanPathSafety,
  findDesignSignalInArtifact: findDesignSignalInArtifact,
  findDesignSignalInDiff: findDesignSignalInDiff,
  UI_EXTENSIONS: UI_EXTENSIONS,
  DESIGN_SURFACE_PATHS: DESIGN_SURFACE_PATHS,
  MODES: MODES,
  resolveImpeccable: resolveImpeccable,
  readFrontmatterVersion: readFrontmatterVersion,
  IMPECCABLE_PLUGIN_KEY_PATTERN: IMPECCABLE_PLUGIN_KEY_PATTERN,
  IMPECCABLE_SKILL_DIRNAME: IMPECCABLE_SKILL_DIRNAME,
  FRONTMATTER_READ_BYTES: FRONTMATTER_READ_BYTES,
};

if (require.main === module) {
  const argv = process.argv.slice(0);
  const sub = argv[2];
  if (sub !== 'detect' && sub !== 'resolve') {
    process.stderr.write('Usage: impeccable-detect.js detect --mode <prd|plan|implement|pr|review> [--base <ref>] [--plan <path>] [--repo-root <dir>] [--json]\n');
    process.stderr.write('       impeccable-detect.js resolve [--repo-root <dir>] [--json]\n');
    process.exit(2);
  }
  const args = parseArgs(argv);
  if (sub === 'resolve') {
    const r = resolveImpeccable({ repoRoot: args.repoRoot || process.cwd() });
    if (args.json) {
      process.stdout.write(JSON.stringify(r) + '\n');
    } else {
      // Winner marking is identity-based for the same reason eclipsedFrom is:
      // a source+invocation+path comparison marks every duplicate row as the
      // winner, so a table meant to show which body opens would show two.
      // A row is the winner exactly when a winner exists and it was not
      // eclipsed -- under shadowed:true no row is marked, which is the point.
      const eclipsedSet = new Set(r.eclipsed || []);
      const hasWinner = r.source !== null;
      const rows = (r.sources || []).map(function (src) {
        const won = hasWinner && !eclipsedSet.has(src);
        return '  ' + (won ? '*' : ' ') + ' ' + src.source.padEnd(8)
          + ' ' + String(src.invocation).padEnd(22)
          + ' ' + String(src.version || '<unknown>').padEnd(10)
          + ' ' + String(src.path || '<none>');
      });
      const eclipsedRows = (r.eclipsed || []).map(function (src) {
        return '    - ' + src.source + ' ' + String(src.invocation)
          + ' v' + String(src.version || '<unknown>')
          + ' ' + String(src.path || '<none>');
      });
      process.stdout.write(
        'impeccable-resolve reason=' + r.reason + '\n'
        + '  available  : ' + r.available + '\n'
        + '  invocation : ' + (r.invocation || '<none>') + '\n'
        + '  source     : ' + (r.source || '<ambiguous-or-none>') + '\n'
        + '  version    : ' + (r.version || '<unknown>') + '\n'
        + '  shadowed   : ' + r.shadowed + '\n'
        + '  eclipsed   : ' + eclipsedRows.length
          + (r.shadowed ? '  (undeterminable -- no winner established)' : '')
          + (eclipsedRows.length ? '\n' + eclipsedRows.join('\n') : '') + '\n'
        + '  sources    :' + (rows.length ? '\n' + rows.join('\n') : ' <none>') + '\n'
      );
    }
    process.exit(0);
  }
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
