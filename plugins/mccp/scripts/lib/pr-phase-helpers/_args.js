'use strict';

// _args — shared CLI utilities for pr-phase-helpers/*.js. Underscore prefix
// signals "internal — not allowlisted by the guard" (helper-path pattern
// matches `[a-z][a-z0-9-]*\.js`, not `_*`).

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[a.slice(2)] = argv[i + 1];
        i += 1;
      } else {
        out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// Resolve the receipt CLI path. CLAUDE_PLUGIN_ROOT is the canonical
// override (set by Claude Code at hook invoke time); fall back to walking
// up from this helper file in dev environments.
function locateReceiptCli() {
  const root = process.env.CLAUDE_PLUGIN_ROOT
    || path.resolve(__dirname, '..', '..', '..');
  return path.join(root, 'scripts', 'receipt', 'cli.js');
}

function locateLockCli() {
  const root = process.env.CLAUDE_PLUGIN_ROOT
    || path.resolve(__dirname, '..', '..', '..');
  return path.join(root, 'scripts', 'lib', 'pr-phase-lock.js');
}

function callReceiptCli(cliPath, args, opts) {
  opts = opts || {};
  if (!fs.existsSync(cliPath)) {
    return { error: 'receipt-cli not found at ' + cliPath, exitCode: -1, stdout: '', stderr: '' };
  }
  const result = spawnSync(process.execPath, [cliPath].concat(args), {
    cwd: opts.cwd,
    env: opts.env || process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeoutMs || 30000,
  });
  if (result.error) {
    return { error: result.error.message, exitCode: -1, stdout: result.stdout || '', stderr: result.stderr || '' };
  }
  return { error: null, exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

function emit(obj, exitCode) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  return exitCode || 0;
}

function fail(msg, exitCode) {
  process.stderr.write('[pr-phase-helpers] ' + msg + '\n');
  return exitCode === undefined ? 1 : exitCode;
}

module.exports = {
  parseArgs,
  locateReceiptCli,
  locateLockCli,
  callReceiptCli,
  emit,
  fail,
};
