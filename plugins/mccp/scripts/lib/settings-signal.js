'use strict';

// settings-signal — shared availability-signal helper for the three built-in
// feature detectors (deep-research / ultracode / goal).
//
// The earlier detectors probed `~/.claude/commands/*.md` and
// `~/.claude/skills/*/` to guess whether a built-in Claude Code feature was
// active. That was structurally wrong: built-in slash commands ship with no
// user-level command/skill file, so the probe could never observe them. This
// helper replaces that guess with the *actual* activation signals documented by
// Claude Code:
//
//   deep-research / ultracode — gated on the dynamic workflows feature.
//     off signal: settings `disableWorkflows: true` OR env
//       `CLAUDE_CODE_DISABLE_WORKFLOWS=1`.
//     on signal:  settings `enableWorkflows: true` (Pro opt-in, written by
//       /config). No positive key → conservative `unknown` (phantom guidance
//       prevention).
//
//   goal — unrelated to workflows; a prompt-based Stop hook wrapper.
//     off signal: settings `disableAllHooks: true` OR `allowManagedHooksOnly:
//       true` at any level. goal is default-on with no positive opt-in key, so
//       the *absence* of any hook-disable signal across all levels is the active
//       signal. Managed policy present-but-unreadable → `unknown` (loud).
//
// Settings precedence (highest wins): project > user > managed. Each level is
// read via settings-writer.readSettings, which is fail-loud on parse error
// (EBADSETTINGS) and returns {} when the file is absent.

const os = require('os');
const path = require('path');
const fs = require('fs');
const settingsWriter = require('./settings-writer');

// OS-specific managed-settings location (enterprise policy file).
const MANAGED_SETTINGS_PATHS = {
  win32: 'C:\\ProgramData\\ClaudeCode\\managed-settings.json',
  darwin: '/Library/Application Support/ClaudeCode/managed-settings.json',
  linux: '/etc/claude-code/managed-settings.json',
};

function managedSettingsPath() {
  return MANAGED_SETTINGS_PATHS[process.platform] || MANAGED_SETTINGS_PATHS.linux;
}

function defaultUserPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function defaultProjectPath(projectRoot) {
  return path.join(projectRoot || process.cwd(), '.claude', 'settings.json');
}

// Read one settings level. Returns { settings, present, readable }.
//   present  = the file exists on disk.
//   readable = the file was read AND parsed (false on EBADSETTINGS).
// Absent file → present=false, readable=true, settings={} (no policy here).
// Parse failure → present=true, readable=false, settings={} + loud stderr.
function readLevel(targetPath) {
  let present = false;
  try {
    present = fs.existsSync(targetPath);
  } catch (_err) {
    present = false;
  }
  if (!present) {
    return { settings: {}, present: false, readable: true };
  }
  try {
    const settings = settingsWriter.readSettings({ path: targetPath });
    return { settings: settings, present: true, readable: true };
  } catch (err) {
    process.stderr.write(
      '[mccp:settings-signal] settings parse failed at ' + targetPath +
      ' (' + err.message + ') — treating level as unreadable\n'
    );
    return { settings: {}, present: true, readable: false };
  }
}

// Read managed + user + project levels and merge (project > user > managed).
// Returns {
//   merged:           shallow-merged settings object (last-write-wins per level),
//   levels:           { managed, user, project } each = readLevel() result,
// }
//
// NOTE: `merged` uses last-write-wins precedence and is NOT the canonical source
// for feature-activation signals. The signal helpers below evaluate `levels`
// with disable-wins semantics (a disable at ANY level beats an enable at a
// higher-precedence level — see workflowsEnabled / anyLevelTrue), so reading
// e.g. `merged.disableWorkflows` directly can diverge from workflowsEnabled().
// Always go through workflowsEnabled() / hooksGoalEnabled() for activation.
function readMergedSettings(options) {
  const opts = options || {};
  const projectRoot = opts.projectRoot || process.cwd();
  const userPath = (opts.userPath != null) ? opts.userPath : defaultUserPath();
  const projectPath = (opts.projectPath != null)
    ? opts.projectPath
    : defaultProjectPath(projectRoot);
  const managedPath = (opts.managedPath != null)
    ? opts.managedPath
    : managedSettingsPath();

  const managed = readLevel(managedPath);
  const user = readLevel(userPath);
  const project = readLevel(projectPath);

  // project > user > managed
  const merged = Object.assign({}, managed.settings, user.settings, project.settings);

  return {
    merged: merged,
    levels: { managed: managed, user: user, project: project },
  };
}

// True if any level's settings object has key===true.
function anyLevelTrue(levels, key) {
  return ['managed', 'user', 'project'].some((name) => {
    const lvl = levels[name];
    return lvl && lvl.settings && lvl.settings[key] === true;
  });
}

// Workflows activation tristate for deep-research / ultracode.
//   env CLAUDE_CODE_DISABLE_WORKFLOWS==='1' OR any-level disableWorkflows===true
//     → 'missing'
//   any-level enableWorkflows===true → 'available'
//   else → 'unknown' (no positive opt-in observed; phantom guidance prevention)
function workflowsEnabled(options) {
  const opts = options || {};
  if (process.env.CLAUDE_CODE_DISABLE_WORKFLOWS === '1') return 'missing';
  const read = readMergedSettings(opts);
  const levels = read.levels;
  if (anyLevelTrue(levels, 'disableWorkflows')) return 'missing';
  if (anyLevelTrue(levels, 'enableWorkflows')) return 'available';
  return 'unknown';
}

// Hooks/goal activation tristate.
//   any-level disableAllHooks===true OR allowManagedHooksOnly===true → 'missing'
//   managed present-but-unreadable → 'unknown' (policy unconfirmed; loud)
//   else → 'available' (goal is default-on; no disable signal = active)
function hooksGoalEnabled(options) {
  const opts = options || {};
  const read = readMergedSettings(opts);
  const levels = read.levels;

  if (anyLevelTrue(levels, 'disableAllHooks')) return 'missing';
  if (anyLevelTrue(levels, 'allowManagedHooksOnly')) return 'missing';

  // F1+F3 absorption: if managed policy exists but could not be parsed, we
  // cannot confirm the absence of a disable signal — downgrade to unknown
  // rather than optimistically claiming available.
  if (levels.managed && levels.managed.present && !levels.managed.readable) {
    return 'unknown';
  }

  return 'available';
}

module.exports = {
  MANAGED_SETTINGS_PATHS: MANAGED_SETTINGS_PATHS,
  managedSettingsPath: managedSettingsPath,
  readMergedSettings: readMergedSettings,
  workflowsEnabled: workflowsEnabled,
  hooksGoalEnabled: hooksGoalEnabled,
};
