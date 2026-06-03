'use strict';

// settings-writer — minimal, side-channel safe edits to ~/.claude/settings.json.
//
// Only the `env` block is touched. All other keys (hooks, permissions, model,
// statusLine, etc.) are preserved verbatim. Writes are atomic via .tmp +
// rename, and a single .bak rotation keeps the previous good state for manual
// recovery.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function resolveTarget(options) {
  const opts = options || {};
  return opts.path || DEFAULT_SETTINGS_PATH;
}

function readSettings(options) {
  const target = resolveTarget(options);
  try {
    if (!fs.existsSync(target)) return {};
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    const e = new Error('settings.json parse failed: ' + err.message);
    e.code = 'EBADSETTINGS';
    e.cause = err;
    throw e;
  }
}

function writeAtomic(target, contents) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, contents, 'utf8');
  if (fs.existsSync(target)) {
    const bak = target + '.bak';
    try { if (fs.existsSync(bak)) fs.unlinkSync(bak); } catch (_e) {}
    try {
      fs.renameSync(target, bak);
    } catch (_e) {
      fs.copyFileSync(target, bak);
      fs.unlinkSync(target);
    }
  }
  try {
    fs.renameSync(tmp, target);
  } catch (_e) {
    fs.copyFileSync(tmp, target);
    fs.unlinkSync(tmp);
  }
}

function serialize(settings) {
  return JSON.stringify(settings, null, 2) + '\n';
}

function setEnv(key, value, options) {
  if (!key || typeof key !== 'string') throw new TypeError('key required');
  if (value === undefined || value === null) throw new TypeError('value required');
  const opts = options || {};
  const target = resolveTarget(opts);
  const settings = readSettings(opts);
  if (!settings.env || typeof settings.env !== 'object') settings.env = {};

  const prior = settings.env[key];
  const next = String(value);
  if (prior === next) {
    return { ok: true, action: 'noop', path: target, key, value: next };
  }
  settings.env[key] = next;

  if (opts.dryRun) {
    return { ok: true, action: 'set', dryRun: true, path: target, key, value: next, settings };
  }
  writeAtomic(target, serialize(settings));
  return {
    ok: true,
    action: 'set',
    path: target,
    backupPath: fs.existsSync(target + '.bak') ? target + '.bak' : null,
    key,
    value: next,
  };
}

function unsetEnv(key, options) {
  if (!key || typeof key !== 'string') throw new TypeError('key required');
  const opts = options || {};
  const target = resolveTarget(opts);
  const settings = readSettings(opts);
  if (!settings.env || typeof settings.env !== 'object' || !(key in settings.env)) {
    return { ok: true, action: 'noop', path: target, key };
  }
  delete settings.env[key];
  if (Object.keys(settings.env).length === 0) delete settings.env;

  if (opts.dryRun) {
    return { ok: true, action: 'unset', dryRun: true, path: target, key, settings };
  }
  writeAtomic(target, serialize(settings));
  return {
    ok: true,
    action: 'unset',
    path: target,
    backupPath: fs.existsSync(target + '.bak') ? target + '.bak' : null,
    key,
  };
}

module.exports = {
  readSettings,
  setEnv,
  unsetEnv,
  DEFAULT_SETTINGS_PATH,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const flag = (name) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dryRun = args.includes('--dry-run');
  const explicitPath = flag('path');
  const key = flag('key');
  const value = flag('value');

  function emit(result) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }

  try {
    if (cmd === 'set') {
      if (!key || value === undefined) {
        process.stderr.write('usage: settings-writer.js set --key K --value V [--dry-run]\n');
        process.exit(2);
      }
      emit(setEnv(key, value, { dryRun, path: explicitPath }));
    } else if (cmd === 'unset') {
      if (!key) {
        process.stderr.write('usage: settings-writer.js unset --key K [--dry-run]\n');
        process.exit(2);
      }
      emit(unsetEnv(key, { dryRun, path: explicitPath }));
    } else if (cmd === 'read') {
      emit({ ok: true, path: resolveTarget({ path: explicitPath }), settings: readSettings({ path: explicitPath }) });
    } else {
      process.stderr.write('usage: settings-writer.js <set|unset|read> [--key K] [--value V] [--dry-run] [--path P]\n');
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write('error: ' + err.message + '\n');
    process.exit(1);
  }
}
