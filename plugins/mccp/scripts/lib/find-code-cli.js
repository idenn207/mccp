'use strict';

// v0.2.8 Task 2.6.2 — locate the VSCode `code` CLI (or supported alternatives)
// for the post-edit-format `.md` α path.
//
// The α path calls `code --reuse-window --command markdownlint.fixAll <file>`
// to let the user's davidanson.vscode-markdownlint extension fix violations
// before the file makes it through Edit. Whether `--command` is honored
// depends on the VSCode version (1.123.0 emits a stderr warning and
// silent-fails — see q5-vscode-markdownlint-probe-2026-06-07.md for the
// empirical record). The β path runs `markdownlint-cli` regardless of α's
// outcome, so this helper only needs to answer "does the user have a `code`
// binary at all" — not "does that `code` honor commandIds".
//
// Resolution order:
//   1. process.env.MCCP_CODE_CLI   — explicit override (escape hatch)
//   2. `code` on PATH               — POSIX + Linux + macOS
//   3. `code.cmd` on PATH (Windows) — shim installed by VSCode
//   4. `code-insiders` / `code-insiders.cmd` fallback
//   5. Windows: VSCode user install at %LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code(.cmd)
//
// Returns the absolute path to a usable binary, or null. Caller treats null
// as "α path unavailable, jump straight to β".

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const isWin = process.platform === 'win32';

function looksLikeCodeBin(binPath) {
  try {
    const stat = fs.statSync(binPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function whichOnPath(name) {
  // Prefer node's built-in resolution via `which`/`where`. Falling back to
  // PATH walk gives consistent behavior across the project's existing PATH
  // probe pattern (dep-check.js).
  const cmd = isWin ? 'where' : 'which';
  try {
    const out = execFileSync(cmd, [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).map(function (s) { return s.trim(); }).find(Boolean);
    return first && looksLikeCodeBin(first) ? first : null;
  } catch {
    return null;
  }
}

function windowsUserInstall(channel) {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const folder = channel === 'insiders'
    ? 'Microsoft VS Code Insiders'
    : 'Microsoft VS Code';
  const exe = channel === 'insiders' ? 'code-insiders.cmd' : 'code.cmd';
  const candidate = path.join(localAppData, 'Programs', folder, 'bin', exe);
  return looksLikeCodeBin(candidate) ? candidate : null;
}

/**
 * @returns {string | null} Absolute path to a usable `code` binary, or null
 *                          when none of the resolution sources match.
 */
function findCodeCli() {
  if (process.env.MCCP_CODE_CLI) {
    return looksLikeCodeBin(process.env.MCCP_CODE_CLI) ? process.env.MCCP_CODE_CLI : null;
  }

  const candidates = isWin
    ? ['code.cmd', 'code', 'code-insiders.cmd', 'code-insiders']
    : ['code', 'code-insiders'];

  for (const name of candidates) {
    const found = whichOnPath(name);
    if (found) return found;
  }

  if (isWin) {
    return windowsUserInstall('stable') || windowsUserInstall('insiders');
  }

  return null;
}

module.exports = { findCodeCli: findCodeCli };
