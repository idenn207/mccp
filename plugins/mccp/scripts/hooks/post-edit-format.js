#!/usr/bin/env node
/**
 * PostToolUse Hook: Auto-format JS/TS files after edits + delegate `.md`
 * lint fixing to VSCode markdownlint extension (α) with `markdownlint-cli`
 * fallback (β).
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * JS/TS branch — auto-detects Biome or Prettier from project config and
 * runs `check --write` / `--write` once per edit.
 *
 * Markdown branch (v0.2.8 Task 2.6.2, F2 + R2-F2 + R3-F3 + R4-F3 absorption) —
 * tries `code --command markdownlint.fixAll` first (lets the user's IDE
 * extension fix the file in-place so the warning is gone before Claude reads
 * the next diagnostic). α success is **count-based**: `postCount === 0` or
 * `preCount > 0 && postCount < preCount`. Plain exit-0 is NOT enough — VSCode
 * 1.123.0 silently passes the `--command` flag through Electron without
 * executing it (see `.claude/PRPs/reports/q5-vscode-markdownlint-probe-*.md`).
 * Anything short of the count-based success criterion falls through to β,
 * which runs `markdownlint --fix` directly. Telemetry surfaces on stderr as
 * `[mccp:markdownlint] {...}` JSON for observability without taking a
 * dependency on hook-trace allowlist fields.
 *
 * Prefers local node_modules/.bin over npx to skip package-resolution overhead.
 * Fails silently if no toolchain is found.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Shell metacharacters that cmd.exe interprets as command separators/operators
const UNSAFE_PATH_CHARS = /[&|<>^%!;`()$]/;

const { findProjectRoot, detectFormatter, resolveFormatterBin } = require('../lib/resolve-formatter');
const { findCodeCli } = require('../lib/find-code-cli');

const MAX_STDIN = 1024 * 1024; // 1MB limit
const MD_TIMEOUT_MS = 5000;
const isWin = process.platform === 'win32';

// v0.2.8 Task 2.6.2 stderrBad regex — extended after Q5 empirical probe
// observed VSCode 1.123.0 emitting `Warning: 'command' is not in the list of
// known options` instead of the older `Command ... not found` shape. Without
// the extra branch, dead-α invocations classify as `noop-exit-0` rather than
// the cleaner `commandid-not-found`.
const STDERR_BAD_RE = /Command .* not found|Unknown command|'command' is not in the list/i;

/**
 * Resolve a usable `markdownlint` invocation.
 * Prefers local `node_modules/.bin/markdownlint(.cmd)` for speed; falls back to
 * `npx --yes markdownlint-cli` so first-time runs work without a project install.
 *
 * @param {string} projectRoot
 * @returns {{ bin: string, prefix: string[], local: boolean } | null}
 */
function resolveMarkdownlintBin(projectRoot) {
  const localBin = path.join(projectRoot, 'node_modules', '.bin', isWin ? 'markdownlint.cmd' : 'markdownlint');
  if (fs.existsSync(localBin)) {
    return { bin: localBin, prefix: [], local: true };
  }
  const npxBin = isWin ? 'npx.cmd' : 'npx';
  return { bin: npxBin, prefix: ['--yes', 'markdownlint-cli'], local: false };
}

/**
 * Count markdownlint violations in `file` using the resolved bin.
 * Returns `{ status, count }` or null when the bin is missing/un-spawnable
 * or when stdout cannot be parsed (preserves caller's fall-through invariant).
 */
function countLint(mdLintBin, file) {
  if (!mdLintBin) return null;
  const r = spawnSync(mdLintBin.bin, [...mdLintBin.prefix, '--json', file], {
    encoding: 'utf8', timeout: MD_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe']
  });
  // markdownlint exits 1 when violations exist; stdout still contains the JSON.
  // Wrap-and-return null for any structural failure so callers fall through.
  try {
    const stdout = r.stdout || '';
    if (!stdout.trim()) {
      return { status: r.status, count: 0 };
    }
    const obj = JSON.parse(stdout);
    if (Array.isArray(obj)) {
      return { status: r.status, count: obj.length };
    }
    const total = Object.values(obj).reduce(function (n, arr) { return n + (Array.isArray(arr) ? arr.length : 0); }, 0);
    return { status: r.status, count: total };
  } catch {
    return { status: r.status, count: null };
  }
}

function emitTelemetry(obj) {
  try {
    process.stderr.write('[mccp:markdownlint] ' + JSON.stringify(obj) + '\n');
  } catch {
    // best-effort
  }
}

/**
 * Markdown branch — dispatched when the edited file ends in `.md`.
 * `deps` is the seam tests use to inject mocks for `code` + markdownlint
 * resolution without touching the user's actual PATH.
 *
 * @param {string} filePath
 * @param {object} [deps]
 * @param {() => (string|null)} [deps.findCodeCli]
 * @param {(root: string) => ({ bin: string, prefix: string[], local: boolean } | null)} [deps.resolveMarkdownlintBin]
 * @param {(bin: object, file: string) => ({ status: number, count: number|null } | null)} [deps.countLint]
 * @param {(...args: any[]) => any} [deps.spawn] - spawnSync-shaped factory used for α invoke
 */
function runMdBranch(filePath, deps) {
  const d = deps || {};
  const findCli = d.findCodeCli || findCodeCli;
  const resolveMd = d.resolveMarkdownlintBin || resolveMarkdownlintBin;
  const counter = d.countLint || countLint;
  const spawn = d.spawn || spawnSync;

  const resolvedFilePath = path.resolve(filePath);
  const projectRoot = findProjectRoot(path.dirname(resolvedFilePath));
  const mdLintBin = resolveMd(projectRoot);
  const codeBin = findCli();

  // α — invoke VSCode commandId, evaluate strictly with count-based gate.
  if (codeBin) {
    try {
      const preLint = counter(mdLintBin, resolvedFilePath);
      const r = spawn(codeBin, ['--reuse-window', '--command', 'markdownlint.fixAll', resolvedFilePath], {
        encoding: 'utf8', timeout: MD_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe']
      });
      const postLint = counter(mdLintBin, resolvedFilePath);
      const stderrBad = STDERR_BAD_RE.test(r.stderr || '');

      // R4-F3: only count-based evidence is acceptable as α success.
      const lintClean = postLint && postLint.count === 0;
      const lintStrictlyReduced = preLint && postLint
        && typeof preLint.count === 'number' && typeof postLint.count === 'number'
        && preLint.count > 0 && postLint.count < preLint.count;
      const noLintBin = !mdLintBin;

      if (r.status === 0 && !stderrBad && (lintClean || lintStrictlyReduced || noLintBin)) {
        emitTelemetry({
          event: 'markdownlint_alpha_ok',
          preCount: preLint ? preLint.count : null,
          postCount: postLint ? postLint.count : null,
          noLintBin: noLintBin
        });
        return;
      }

      const failReason = stderrBad
        ? 'commandid-not-found'
        : (r.status !== 0
          ? 'exit=' + r.status
          : (preLint && postLint && typeof preLint.count === 'number' && typeof postLint.count === 'number' && postLint.count >= preLint.count
            ? 'lint-not-reduced'
            : 'noop-exit-0'));
      emitTelemetry({
        event: 'markdownlint_alpha_failed',
        reason: failReason,
        preCount: preLint ? preLint.count : null,
        postCount: postLint ? postLint.count : null
      });
      // fall through to β
    } catch (e) {
      emitTelemetry({
        event: 'markdownlint_alpha_failed',
        reason: e && (e.code || (e.message || '').slice(0, 200)) || 'unknown'
      });
    }
  }

  // β — run markdownlint-cli directly. Non-zero exit means violations remain,
  // which is still informational; the file may have partial fixes applied.
  if (mdLintBin) {
    try {
      execFileSync(mdLintBin.bin, [...mdLintBin.prefix, '--fix', resolvedFilePath], {
        stdio: ['ignore', 'ignore', 'pipe'], timeout: MD_TIMEOUT_MS
      });
      emitTelemetry({ event: 'markdownlint_beta_ok' });
      return;
    } catch (e) {
      emitTelemetry({ event: 'markdownlint_beta_done', exitCode: e && (e.status != null ? e.status : null) });
      return;
    }
  }

  emitTelemetry({ event: 'markdownlint_skipped', reason: 'no-cli' });
}

/**
 * Core logic — exported so run-with-flags.js can call directly
 * without spawning a child process.
 *
 * @param {string} rawInput - Raw JSON string from stdin
 * @returns {string} The original input (pass-through)
 */
function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePath = input.tool_input?.file_path;

    if (filePath && /\.(ts|tsx|js|jsx)$/.test(filePath)) {
      try {
        const resolvedFilePath = path.resolve(filePath);
        const projectRoot = findProjectRoot(path.dirname(resolvedFilePath));
        const formatter = detectFormatter(projectRoot);
        if (!formatter) return rawInput;

        const resolved = resolveFormatterBin(projectRoot, formatter);
        if (!resolved) return rawInput;

        // Biome: `check --write` = format + lint in one pass
        // Prettier: `--write` = format only
        const args = formatter === 'biome' ? [...resolved.prefix, 'check', '--write', resolvedFilePath] : [...resolved.prefix, '--write', resolvedFilePath];

        if (process.platform === 'win32' && resolved.bin.endsWith('.cmd')) {
          // Node 16+ launches .cmd via cmd.exe automatically without shell:true,
          // avoiding DEP0190 (Node 22+ warns when args array is concat'd into
          // a shell command string without escaping). The unsafe-chars guard
          // is kept as defense-in-depth even though execFileSync no longer
          // exposes the path to cmd.exe parsing.
          if (UNSAFE_PATH_CHARS.test(resolvedFilePath)) {
            throw new Error('File path contains unsafe shell characters');
          }
          execFileSync(resolved.bin, args, {
            cwd: projectRoot,
            stdio: 'pipe',
            timeout: 15000
          });
        } else {
          execFileSync(resolved.bin, args, {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 15000
          });
        }
      } catch {
        // Formatter not installed, file missing, or failed — non-blocking
      }
    } else if (filePath && /\.md$/i.test(filePath)) {
      try { runMdBranch(filePath); } catch {
        // Markdown branch is best-effort; never block the edit pipeline.
      }
    }
  } catch {
    // Invalid input — pass through
  }

  return rawInput;
}

// ── stdin entry point (backwards-compatible) ────────────────────
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      const remaining = MAX_STDIN - data.length;
      data += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    data = run(data);
    process.stdout.write(data);
    process.exit(0);
  });
}

module.exports = {
  run,
  runMdBranch,
  resolveMarkdownlintBin,
  countLint,
  STDERR_BAD_RE,
};
