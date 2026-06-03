'use strict';

// Detect which quality stages are runnable in a given repo.
//
// Deterministic only — same inputs always produce the same output.
// No env, no clock, no network. Single source of truth used by
// `runner.js` and the Stop hook's pre-flight check.
//
// Output shape:
//   {
//     packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null,
//     stages: {
//       lint?:     { command: 'npm run lint' | 'pnpm run lint' | ..., source: 'package.json scripts.lint' }
//       typecheck?:{ command: 'npm run typecheck' | ..., source: 'package.json scripts.typecheck' | 'tsc --noEmit' }
//       test?:     { command: 'npm test' | ..., source: 'package.json scripts.test' }
//       e2e?:      { command: 'npm run e2e' | ..., source: 'package.json scripts.e2e' | 'playwright test' }
//     }
//   }
//
// Stages that cannot be detected are absent from `stages` — callers must
// treat absence as 'skipped' (Risk #5 mitigation).

const fs = require('fs');
const path = require('path');

const LINT_SCRIPT_KEYS = ['lint', 'lint:check', 'eslint'];
const TYPECHECK_SCRIPT_KEYS = ['typecheck', 'type-check', 'tsc'];
const TEST_SCRIPT_KEYS = ['test', 'test:unit'];
const E2E_SCRIPT_KEYS = ['e2e', 'test:e2e', 'playwright', 'cypress'];

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch (_e) { return false; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_e) { return null; }
}

function detectPackageManager(repoRoot) {
  // Bun 1.2+ (Feb 2025) ships text-based `bun.lock`; older releases used
  // binary `bun.lockb`. Detect both so the Stop-loop honors Bun repos that
  // upgraded to the newer lockfile format (Reviewer B Round 3 #1).
  if (fileExists(path.join(repoRoot, 'bun.lock'))) return 'bun';
  if (fileExists(path.join(repoRoot, 'bun.lockb'))) return 'bun';
  if (fileExists(path.join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(path.join(repoRoot, 'yarn.lock'))) return 'yarn';
  if (fileExists(path.join(repoRoot, 'package-lock.json'))) return 'npm';
  if (fileExists(path.join(repoRoot, 'package.json'))) return 'npm';
  return null;
}

function runScriptCommand(pm, scriptName) {
  // The `scripts.test` body in package.json must run through `bun run test`
  // — bare `bun test` invokes Bun's built-in test runner and ignores the
  // declared script (Reviewer B Round 3 #2). Same rationale applied for
  // `npm test` / `yarn test` / `pnpm test`: those *do* shell out to the
  // declared `scripts.test`, so the short form is correct there.
  if (scriptName === 'test') {
    if (pm === 'npm') return 'npm test';
    if (pm === 'yarn') return 'yarn test';
    if (pm === 'pnpm') return 'pnpm test';
    if (pm === 'bun') return 'bun run test';
  }
  if (pm === 'npm') return 'npm run ' + scriptName;
  if (pm === 'yarn') return 'yarn ' + scriptName;
  if (pm === 'pnpm') return 'pnpm run ' + scriptName;
  if (pm === 'bun') return 'bun run ' + scriptName;
  return null;
}

function pickFirstScript(scripts, keys) {
  if (!scripts || typeof scripts !== 'object') return null;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(scripts, k)) return k;
  }
  return null;
}

function detectPlaywrightConfig(repoRoot) {
  const candidates = [
    'playwright.config.js', 'playwright.config.ts',
    'playwright.config.mjs', 'playwright.config.cjs',
  ];
  for (const name of candidates) {
    if (fileExists(path.join(repoRoot, name))) return name;
  }
  return null;
}

function detect(repoRoot) {
  const result = {
    packageManager: detectPackageManager(repoRoot),
    stages: {},
  };

  const pkgJsonPath = path.join(repoRoot, 'package.json');
  const pkg = fileExists(pkgJsonPath) ? readJson(pkgJsonPath) : null;
  const scripts = (pkg && pkg.scripts) || null;
  const pm = result.packageManager;

  // Lint
  if (scripts && pm) {
    const lintKey = pickFirstScript(scripts, LINT_SCRIPT_KEYS);
    if (lintKey) {
      result.stages.lint = {
        command: runScriptCommand(pm, lintKey),
        source: 'package.json scripts.' + lintKey,
      };
    }
  }

  // Typecheck: package.json script first, else tsconfig.json => `tsc --noEmit`
  if (scripts && pm) {
    const tcKey = pickFirstScript(scripts, TYPECHECK_SCRIPT_KEYS);
    if (tcKey) {
      result.stages.typecheck = {
        command: runScriptCommand(pm, tcKey),
        source: 'package.json scripts.' + tcKey,
      };
    }
  }
  if (!result.stages.typecheck && fileExists(path.join(repoRoot, 'tsconfig.json'))) {
    result.stages.typecheck = {
      command: pm ? (pm === 'npm' ? 'npx tsc --noEmit' : pm + ' exec tsc --noEmit') : 'tsc --noEmit',
      source: 'tsconfig.json',
    };
  }

  // Test
  if (scripts && pm && pickFirstScript(scripts, TEST_SCRIPT_KEYS)) {
    const testKey = pickFirstScript(scripts, TEST_SCRIPT_KEYS);
    result.stages.test = {
      command: runScriptCommand(pm, testKey),
      source: 'package.json scripts.' + testKey,
    };
  }

  // E2E: package.json e2e script first, else playwright.config.*
  if (scripts && pm) {
    const e2eKey = pickFirstScript(scripts, E2E_SCRIPT_KEYS);
    if (e2eKey) {
      result.stages.e2e = {
        command: runScriptCommand(pm, e2eKey),
        source: 'package.json scripts.' + e2eKey,
      };
    }
  }
  if (!result.stages.e2e) {
    const pw = detectPlaywrightConfig(repoRoot);
    if (pw) {
      result.stages.e2e = {
        command: pm ? (pm === 'npm' ? 'npx playwright test' : pm + ' exec playwright test') : 'playwright test',
        source: pw,
      };
    }
  }

  return result;
}

module.exports = {
  detect: detect,
  detectPackageManager: detectPackageManager,
  detectPlaywrightConfig: detectPlaywrightConfig,
  runScriptCommand: runScriptCommand,
  LINT_SCRIPT_KEYS: LINT_SCRIPT_KEYS,
  TYPECHECK_SCRIPT_KEYS: TYPECHECK_SCRIPT_KEYS,
  TEST_SCRIPT_KEYS: TEST_SCRIPT_KEYS,
  E2E_SCRIPT_KEYS: E2E_SCRIPT_KEYS,
};
