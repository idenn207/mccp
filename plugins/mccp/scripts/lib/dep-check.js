'use strict';

// dep-check — read-only inspection of mccp's external dependencies.
//
//   - codex plugin (codex@openai-codex) via ~/.claude/plugins/installed_plugins.json
//   - impeccable CLI via PATH lookup (cross-platform: `where` on win32, `which` elsewhere)
//
// Never throws. Returns sentinel objects so command bodies can branch with
// plain `if (!result.installed)` without try/catch noise.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const INSTALLED_PLUGINS_PATH = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const CODEX_PLUGIN_KEY = 'codex@openai-codex';

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

function checkAll(options) {
  return {
    codex_plugin: checkCodexPlugin(options),
    impeccable_cli: checkImpeccableCli(options),
    codex_disabled: process.env.MCCP_CODEX_DISABLED === '1',
    checked_at: new Date().toISOString(),
  };
}

module.exports = {
  readInstalledPlugins,
  checkCodexPlugin,
  checkImpeccableCli,
  checkAll,
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
    '  impeccable CLI  : ' + (result.impeccable_cli.installed
      ? 'installed (' + (result.impeccable_cli.path || '?') + ')'
      : 'missing'),
    '  codex disabled  : ' + (result.codex_disabled ? 'yes (MCCP_CODEX_DISABLED=1)' : 'no'),
  ];
  process.stdout.write(lines.join('\n') + '\n');
}
