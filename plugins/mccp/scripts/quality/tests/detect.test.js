'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { detect, detectPackageManager } = require('../detect');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-quality-detect-'));
}

function writeFile(repo, rel, content) {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

test('empty directory → no package manager, no stages', () => {
  const repo = mkTmp();
  const result = detect(repo);
  assert.strictEqual(result.packageManager, null);
  assert.deepStrictEqual(result.stages, {});
});

test('package.json only with no scripts → npm pm, no stages', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({ name: 'x' }));
  const result = detect(repo);
  assert.strictEqual(result.packageManager, 'npm');
  assert.deepStrictEqual(result.stages, {});
});

test('package-lock.json + lint script → npm + lint stage', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({
    name: 'x',
    scripts: { lint: 'eslint .' },
  }));
  writeFile(repo, 'package-lock.json', '{}');
  const result = detect(repo);
  assert.strictEqual(result.packageManager, 'npm');
  assert.strictEqual(result.stages.lint.command, 'npm run lint');
  assert.strictEqual(result.stages.lint.source, 'package.json scripts.lint');
});

test('pnpm-lock + test script → pnpm test', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({
    scripts: { test: 'jest' },
  }));
  writeFile(repo, 'pnpm-lock.yaml', '');
  const result = detect(repo);
  assert.strictEqual(result.packageManager, 'pnpm');
  assert.strictEqual(result.stages.test.command, 'pnpm test');
});

test('yarn.lock takes precedence over package-lock.json', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({ scripts: { test: 'jest' } }));
  writeFile(repo, 'yarn.lock', '');
  writeFile(repo, 'package-lock.json', '{}');
  const result = detect(repo);
  assert.strictEqual(result.packageManager, 'yarn');
  assert.strictEqual(result.stages.test.command, 'yarn test');
});

test('bun.lockb wins over all other lockfiles; bun test resolves to `bun run test`', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({ scripts: { test: 'jest' } }));
  writeFile(repo, 'bun.lockb', '');
  writeFile(repo, 'pnpm-lock.yaml', '');
  writeFile(repo, 'yarn.lock', '');
  writeFile(repo, 'package-lock.json', '{}');
  const result = detect(repo);
  assert.strictEqual(result.packageManager, 'bun');
  // `bun run test` invokes the declared package.json script; bare `bun test`
  // would run Bun's built-in test runner and skip the script entirely
  // (Reviewer B Round 3 #2).
  assert.strictEqual(result.stages.test.command, 'bun run test');
});

test('Bun 1.2+ text-based bun.lock is recognized as bun (Reviewer B Round 3 #1)', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({ scripts: { test: 'jest' } }));
  writeFile(repo, 'bun.lock', '');
  const result = detect(repo);
  assert.strictEqual(result.packageManager, 'bun');
  assert.strictEqual(result.stages.test.command, 'bun run test');
});

test('bun.lock takes precedence over npm/yarn/pnpm lockfiles', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({ scripts: { lint: 'eslint .' } }));
  writeFile(repo, 'bun.lock', '');
  writeFile(repo, 'pnpm-lock.yaml', '');
  writeFile(repo, 'yarn.lock', '');
  writeFile(repo, 'package-lock.json', '{}');
  const result = detect(repo);
  assert.strictEqual(result.packageManager, 'bun');
  assert.strictEqual(result.stages.lint.command, 'bun run lint');
});

test('TS-only project: tsconfig.json + test → typecheck via tsc + test', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({
    scripts: { test: 'vitest run' },
  }));
  writeFile(repo, 'tsconfig.json', '{}');
  const result = detect(repo);
  assert.ok(result.stages.typecheck);
  assert.match(result.stages.typecheck.command, /tsc --noEmit$/);
  assert.strictEqual(result.stages.typecheck.source, 'tsconfig.json');
  assert.strictEqual(result.stages.test.command, 'npm test');
  assert.ok(!result.stages.lint, 'no lint script present');
  assert.ok(!result.stages.e2e, 'no e2e source present');
});

test('package.json typecheck script wins over tsconfig.json fallback', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({
    scripts: { typecheck: 'tsc -p tsconfig.app.json --noEmit' },
  }));
  writeFile(repo, 'tsconfig.json', '{}');
  const result = detect(repo);
  assert.strictEqual(result.stages.typecheck.command, 'npm run typecheck');
  assert.strictEqual(result.stages.typecheck.source, 'package.json scripts.typecheck');
});

test('playwright.config.ts → e2e stage via npx playwright test', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({ name: 'x' }));
  writeFile(repo, 'playwright.config.ts', '');
  const result = detect(repo);
  assert.strictEqual(result.stages.e2e.command, 'npx playwright test');
  assert.strictEqual(result.stages.e2e.source, 'playwright.config.ts');
});

test('full project: lint + typecheck + test + e2e all present', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({
    scripts: {
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
      e2e: 'playwright test',
    },
  }));
  writeFile(repo, 'tsconfig.json', '{}');
  writeFile(repo, 'playwright.config.ts', '');
  const result = detect(repo);
  assert.strictEqual(Object.keys(result.stages).length, 4);
  assert.strictEqual(result.stages.lint.command, 'npm run lint');
  assert.strictEqual(result.stages.typecheck.command, 'npm run typecheck');
  assert.strictEqual(result.stages.test.command, 'npm test');
  assert.strictEqual(result.stages.e2e.command, 'npm run e2e');
});

test('detectPackageManager: empty dir', () => {
  const repo = mkTmp();
  assert.strictEqual(detectPackageManager(repo), null);
});

test('lint key aliases: lint:check is picked when lint is absent', () => {
  const repo = mkTmp();
  writeFile(repo, 'package.json', JSON.stringify({
    scripts: { 'lint:check': 'eslint .' },
  }));
  const result = detect(repo);
  assert.strictEqual(result.stages.lint.command, 'npm run lint:check');
});
