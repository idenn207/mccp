'use strict';

// dep-check — read-only inspection of mccp's external dependencies.
//
//   - codex plugin (codex@openai-codex) via ~/.claude/plugins/installed_plugins.json
//   - impeccable skill via impeccable-detect's resolveImpeccable (all install channels)
//   - impeccable CLI via PATH lookup (cross-platform: `where` on win32, `which` elsewhere)
//
// The last two answer different questions and are deliberately NOT merged.
// `impeccable_cli` says a binary named `impeccable` is on PATH; `impeccable`
// says the name our command bodies call actually resolves to a skill body.
// Only the second has decision authority — no gate branch reads the CLI probe
// (v1.0.0-baseline F-W1-2 prescribed two fields over one ambiguous one).
//
// Never throws. Returns sentinel objects so command bodies can branch with
// plain `if (!result.installed)` without try/catch noise.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const envValue = require('./env-contract/value');

const INSTALLED_PLUGINS_PATH = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const CODEX_PLUGIN_KEY = 'codex@openai-codex';

// version, source and invocation all originate outside this repo — SKILL.md
// frontmatter the user installed, and a registry key written by the plugin
// installer. They reach a terminal in the printer below and in /mccp:setup's
// Phase 1 table, so a value carrying ANSI escapes or control characters would
// render as terminal control rather than as text. Print only what these labels
// can legitimately be; anything else prints as `?`, which loses the value but
// not the fact that the source resolved.
const SAFE_LABEL_RE = /^[A-Za-z0-9._+:-]{1,64}$/;

function safeLabel(value) {
  return (typeof value === 'string' && SAFE_LABEL_RE.test(value)) ? value : '?';
}

function readInstalledPlugins(filePath) {
  const target = filePath || INSTALLED_PLUGINS_PATH;
  try {
    if (!fs.existsSync(target)) return { plugins: {} };
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.plugins && typeof parsed.plugins === 'object') {
      return parsed;
    }
    return { plugins: {} };
  } catch (_err) {
    return { plugins: {} };
  }
}

function checkCodexPlugin(options) {
  const opts = options || {};
  const manifest = readInstalledPlugins(opts.installedPluginsPath);
  const entries = manifest.plugins[CODEX_PLUGIN_KEY];
  if (!Array.isArray(entries) || entries.length === 0) {
    return { installed: false };
  }
  const first = entries[0] || {};
  return {
    installed: true,
    version: first.version || null,
    installPath: first.installPath || null,
    scope: first.scope || null,
  };
}

// Same shape resolveImpeccable returns, so a load failure is structurally
// indistinguishable from a genuine miss and callers need no second branch. It
// fails CLOSED: telling a gate that impeccable resolves when nothing was ever
// probed would turn a broken require into a silent design-review skip.
function impeccableSentinel(reason) {
  return {
    available: false,
    reason: reason,
    invocation: null,
    source: null,
    version: null,
    path: null,
    sources: [],
    shadowed: false,
  };
}

// impeccable-detect requires THIS module at top level, so requiring it back at
// top level would close the cycle and hand whichever side loaded second a
// partial export. The require stays inside the function body (mirror:
// auto-chain.js:109) — by call time both modules are loaded and cached.
//
// The guard is not defensive noise: this module's contract is "never throws"
// (see header), and a deferred require can fail for reasons dep-check cannot
// see from here.
function checkImpeccable(options) {
  let detect;
  try {
    detect = require('./impeccable-detect');
  } catch (_err) {
    return impeccableSentinel('detect-load-error');
  }
  if (!detect || typeof detect.resolveImpeccable !== 'function') {
    return impeccableSentinel('detect-load-error');
  }
  try {
    return detect.resolveImpeccable(options || {});
  } catch (_err) {
    return impeccableSentinel('detect-throw');
  }
}

function checkImpeccableCli(options) {
  const opts = options || {};
  const platform = opts.platform || os.platform();
  const finder = platform === 'win32' ? 'where' : 'which';
  let result;
  try {
    result = spawnSync(finder, ['impeccable'], { encoding: 'utf8' });
  } catch (_err) {
    return { installed: false };
  }
  if (!result || result.status !== 0) {
    return { installed: false };
  }
  const stdout = (result.stdout || '').trim();
  const firstLine = stdout.split(/\r?\n/)[0] || '';
  return {
    installed: true,
    path: firstLine.trim() || null,
  };
}

// Strict superset: the four pre-existing keys keep their exact meaning and a
// fifth is added. `options` is forwarded verbatim so resolveImpeccable's own
// default (process.cwd()) applies when no repoRoot is supplied — this module
// does not invent a second default for the same question.
function checkAll(options) {
  return {
    codex_plugin: checkCodexPlugin(options),
    impeccable_cli: checkImpeccableCli(options),
    impeccable: checkImpeccable(options),
    codex_disabled: envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED'),
    checked_at: new Date().toISOString(),
  };
}

function impeccableLabel(impeccable) {
  if (!impeccable || !impeccable.available) return 'missing';
  // An ambiguous winner reports nulls rather than a guess (impeccable-detect's
  // own contract), so there is no source or version to print. Say how many
  // bodies were seen instead of naming one that was never established.
  if (impeccable.shadowed) {
    return 'ambiguous (' + (impeccable.sources || []).length + ' sources)';
  }
  return 'available (' + safeLabel(impeccable.source) + ' v' + safeLabel(impeccable.version)
    + ', ' + safeLabel(impeccable.invocation) + ')';
}

module.exports = {
  readInstalledPlugins,
  checkCodexPlugin,
  checkImpeccable,
  checkImpeccableCli,
  checkAll,
  impeccableLabel,
  safeLabel,
  INSTALLED_PLUGINS_PATH,
  CODEX_PLUGIN_KEY,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(checkAll(), null, 2) + '\n');
    process.exit(0);
  }
  const result = checkAll();
  const lines = [
    'mccp dep-check',
    '  codex plugin    : ' + (result.codex_plugin.installed
      ? 'installed (v' + (result.codex_plugin.version || '?') + ')'
      : 'missing'),
    '  impeccable skill: ' + impeccableLabel(result.impeccable),
    '  impeccable CLI  : ' + (result.impeccable_cli.installed
      ? 'installed (' + (result.impeccable_cli.path || '?') + ')'
      : 'missing') + '  [telemetry only — no gate reads this]',
    '  codex disabled  : ' + (result.codex_disabled ? 'yes (MCCP_CODEX_DISABLED=1)' : 'no'),
  ];
  process.stdout.write(lines.join('\n') + '\n');
}
