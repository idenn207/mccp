'use strict';

// codex-invoke — fail-closed wrapper around codex-companion.mjs adversarial-review.
//
// Plan v0.2.2 Task 1 + R1#3 + R2#1 commitments:
//   - resolve codex@openai-codex via ~/.claude/plugins/installed_plugins.json
//   - verifyCompanionInterface() against compatible plugin.json version list
//   - spawnSync(process.execPath, [companion, ...]) — never rely on PATH-resolved node
//   - All non-ok paths return valid JSON, classification field set, blocking=true by default
//   - MCCP_ALLOW_CODEX_UNAVAILABLE=1 demotes blocking=false (advisory mode, opt-in)
//   - CLI mode: stdout JSON; exit 12 if blocking, exit 0 otherwise
//   - Single CodexInvokeError class with `reason` enum (no subclass hierarchy)
//
// Classification enum: ok | registry-missing | registry-malformed | plugin-not-installed
//   | install-path-stale | companion-not-found | companion-version-mismatch
//   | not-authenticated | timeout | exit-nonzero | stdout-empty | spawn-enoent

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REGISTRY_PATH_DEFAULT = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const PLUGIN_KEY = 'codex@openai-codex';
const COMPANION_REL = path.join('scripts', 'codex-companion.mjs');
const PLUGIN_JSON_REL = path.join('.claude-plugin', 'plugin.json');
const COMPATIBLE_VERSION_PATTERNS = [/^1\.0\.\d+$/];
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const BLOCKING_EXIT = 12;

class CodexInvokeError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'CodexInvokeError';
    this.reason = reason;
  }
}

function resolveCodexInstallPath(opts) {
  opts = opts || {};
  const registryPath = opts.registryPath || REGISTRY_PATH_DEFAULT;
  let raw;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch (err) {
    throw new CodexInvokeError('registry-missing',
      'installed_plugins.json not found at ' + registryPath + ': ' + err.message);
  }
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (err) {
    throw new CodexInvokeError('registry-malformed',
      'installed_plugins.json JSON parse failed: ' + err.message);
  }
  if (!registry || typeof registry !== 'object' || !registry.plugins) {
    throw new CodexInvokeError('registry-malformed',
      'installed_plugins.json missing .plugins key');
  }
  const entries = registry.plugins[PLUGIN_KEY];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new CodexInvokeError('plugin-not-installed',
      PLUGIN_KEY + ' not found in plugins registry');
  }
  const entry = entries[0];
  if (!entry || typeof entry.installPath !== 'string' || !entry.installPath.length) {
    throw new CodexInvokeError('plugin-not-installed',
      PLUGIN_KEY + ' installPath missing or empty');
  }
  if (!fs.existsSync(entry.installPath)) {
    throw new CodexInvokeError('install-path-stale',
      'installPath does not exist on disk: ' + entry.installPath);
  }
  return entry.installPath;
}

function verifyCompanionInterface(installPath) {
  const companionPath = path.join(installPath, COMPANION_REL);
  if (!fs.existsSync(companionPath)) {
    throw new CodexInvokeError('companion-not-found',
      'codex-companion.mjs not found at ' + companionPath);
  }
  const pluginJsonPath = path.join(installPath, PLUGIN_JSON_REL);
  let pluginJson;
  try {
    pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  } catch (err) {
    throw new CodexInvokeError('companion-version-mismatch',
      'cannot read plugin.json at ' + pluginJsonPath + ': ' + err.message);
  }
  const version = String(pluginJson.version || '');
  const compatible = COMPATIBLE_VERSION_PATTERNS.some(re => re.test(version));
  if (!compatible) {
    throw new CodexInvokeError('companion-version-mismatch',
      'codex plugin version ' + JSON.stringify(version) +
      ' is not in compatible list (expected one of: ' +
      COMPATIBLE_VERSION_PATTERNS.map(r => String(r)).join(', ') + ')');
  }
  return { companionPath: companionPath, version: version };
}

function makeFail(env, t0, classification, stderr) {
  const advisoryAllowed = (env && env.MCCP_ALLOW_CODEX_UNAVAILABLE === '1');
  return {
    ok: false,
    stdout: '',
    stderr: String(stderr || ''),
    durationMs: Date.now() - t0,
    classification: classification,
    blocking: !advisoryAllowed,
    advisory: advisoryAllowed,
  };
}

function invokeAdversarialReview(focus, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const t0 = Date.now();

  let installPath;
  try {
    installPath = resolveCodexInstallPath({ registryPath: opts.registryPath });
  } catch (err) {
    const reason = err instanceof CodexInvokeError ? err.reason : 'registry-missing';
    return makeFail(env, t0, reason, err.message);
  }

  let verified;
  try {
    verified = verifyCompanionInterface(installPath);
  } catch (err) {
    const reason = err instanceof CodexInvokeError ? err.reason : 'companion-not-found';
    return makeFail(env, t0, reason, err.message);
  }

  const args = [verified.companionPath, 'adversarial-review', '--wait'];
  if (opts.base) args.push('--base', String(opts.base));
  if (opts.scope) args.push('--scope', String(opts.scope));
  if (focus && String(focus).length) args.push(String(focus));

  let result;
  try {
    result = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER,
    });
  } catch (err) {
    return makeFail(env, t0, 'spawn-enoent', 'spawnSync threw: ' + err.message);
  }

  if (result && result.error) {
    const code = result.error.code || '';
    if (code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
      return makeFail(env, t0, 'timeout',
        'companion timed out after ' + timeoutMs + 'ms');
    }
    if (code === 'ENOENT') {
      return makeFail(env, t0, 'spawn-enoent',
        'spawnSync ENOENT: ' + result.error.message);
    }
    return makeFail(env, t0, 'exit-nonzero',
      'spawnSync error: ' + result.error.message);
  }

  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');

  if (result.status !== 0) {
    const combined = stdout + '\n' + stderr;
    if (/not[\s-]authenticated|setup[_ ]required/i.test(combined)) {
      return makeFail(env, t0, 'not-authenticated', stderr || stdout);
    }
    return makeFail(env, t0, 'exit-nonzero',
      stderr || ('companion exited with status ' + result.status));
  }

  if (!stdout.trim()) {
    return makeFail(env, t0, 'stdout-empty',
      'companion exited 0 but produced no stdout');
  }

  return {
    ok: true,
    stdout: stdout,
    stderr: stderr,
    durationMs: Date.now() - t0,
    classification: 'ok',
    blocking: false,
    advisory: false,
  };
}

function runCli(argv) {
  if (!argv || argv[0] !== 'adversarial-review') {
    process.stderr.write(
      'usage: codex-invoke adversarial-review --focus "<text>" ' +
      '[--base <ref>] [--scope <s>] [--timeout-ms N] [--json]\n');
    process.stderr.write('Always emits JSON to stdout. Exit 12 = blocking, 0 = ok/advisory.\n');
    return 2;
  }
  const opts = {};
  let focus = '';
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--focus' && i + 1 < argv.length) { focus = argv[++i]; continue; }
    if (a === '--base' && i + 1 < argv.length) { opts.base = argv[++i]; continue; }
    if (a === '--scope' && i + 1 < argv.length) { opts.scope = argv[++i]; continue; }
    if (a === '--timeout-ms' && i + 1 < argv.length) {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) opts.timeoutMs = n;
      continue;
    }
    if (a === '--json') continue;
  }
  let result;
  try {
    result = invokeAdversarialReview(focus, opts);
  } catch (err) {
    const advisoryAllowed = process.env.MCCP_ALLOW_CODEX_UNAVAILABLE === '1';
    result = {
      ok: false,
      stdout: '',
      stderr: 'unexpected error: ' + (err && err.message || String(err)),
      durationMs: 0,
      classification: 'parse-error',
      blocking: !advisoryAllowed,
      advisory: advisoryAllowed,
    };
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  return result.blocking ? BLOCKING_EXIT : 0;
}

if (require.main === module) {
  const code = runCli(process.argv.slice(2));
  process.exit(code);
}

module.exports = {
  resolveCodexInstallPath: resolveCodexInstallPath,
  verifyCompanionInterface: verifyCompanionInterface,
  invokeAdversarialReview: invokeAdversarialReview,
  runCli: runCli,
  CodexInvokeError: CodexInvokeError,
  COMPATIBLE_VERSION_PATTERNS: COMPATIBLE_VERSION_PATTERNS,
  PLUGIN_KEY: PLUGIN_KEY,
  REGISTRY_PATH_DEFAULT: REGISTRY_PATH_DEFAULT,
  BLOCKING_EXIT: BLOCKING_EXIT,
};
