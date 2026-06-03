'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mkTmpRepo, writeFileSync } = require('./helpers');

const {
  parsePlanFiles,
  gitDiffNameOnly,
  computeResidual,
  buildPlannedMatcher,
  globToRegex,
  normalizePath,
} = require('../dedupe');

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitQuiet(repo, args) {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
}

function writePlan(repo, body) {
  return writeFileSync(repo, '.claude/plans/feature-x.plan.md', body);
}

const VALID_PLAN_BODY = [
  '# Plan: Feature X',
  '',
  '## Files to Change',
  '| File | Action | Why |',
  '|---|---|---|',
  '| `src/foo.ts` | CREATE | core |',
  '| `src/bar.ts` | UPDATE | helper |',
  '| `tests/foo.test.ts` | CREATE | coverage |',
  '',
  '## Validation',
  '```bash',
  'pnpm test',
  '```',
  '',
].join('\n');

test('normalizePath converts backslashes and strips leading ./', function () {
  assert.strictEqual(normalizePath('src\\foo.ts'), 'src/foo.ts');
  assert.strictEqual(normalizePath('./src/foo.ts'), 'src/foo.ts');
  assert.strictEqual(normalizePath('src/foo.ts'), 'src/foo.ts');
  assert.strictEqual(normalizePath(''), '');
  assert.strictEqual(normalizePath(undefined), '');
});

test('globToRegex single-star matches within a path segment only', function () {
  const re = globToRegex('src/*.ts');
  assert.ok(re.test('src/foo.ts'));
  assert.ok(re.test('src/bar.ts'));
  assert.ok(!re.test('src/sub/foo.ts'), 'single * should not cross /');
  assert.ok(!re.test('other/foo.ts'));
});

test('globToRegex double-star matches across path segments', function () {
  const re = globToRegex('tests/**/*.test.ts');
  assert.ok(re.test('tests/a.test.ts'));
  assert.ok(re.test('tests/sub/b.test.ts'));
  assert.ok(re.test('tests/sub/deep/c.test.ts'));
  assert.ok(!re.test('tests/a.ts'));
  assert.ok(!re.test('src/a.test.ts'));
});

test('buildPlannedMatcher handles literals and globs together', function () {
  const match = buildPlannedMatcher(['src/foo.ts', 'tests/**/*.test.ts']);
  assert.strictEqual(match('src/foo.ts'), true);
  assert.strictEqual(match('tests/a.test.ts'), true);
  assert.strictEqual(match('tests/sub/b.test.ts'), true);
  assert.strictEqual(match('src/bar.ts'), false);
});

test('parsePlanFiles returns entries from "Files to Change" table', function () {
  const repo = mkTmpRepo();
  try {
    const planPath = writePlan(repo, VALID_PLAN_BODY);
    const result = parsePlanFiles(planPath);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.files, ['src/foo.ts', 'src/bar.ts', 'tests/foo.test.ts']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles is case-insensitive for the heading', function () {
  const repo = mkTmpRepo();
  try {
    const body = VALID_PLAN_BODY.replace('## Files to Change', '## FILES TO CHANGE');
    const planPath = writePlan(repo, body);
    const result = parsePlanFiles(planPath);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.files.length, 3);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles fails closed when heading is missing', function () {
  const repo = mkTmpRepo();
  try {
    const planPath = writePlan(repo, '# Plan: no files section\n\n## Validation\n');
    const result = parsePlanFiles(planPath);
    assert.strictEqual(result.ok, false);
    assert.ok(/files to change/i.test(result.error));
    assert.deepStrictEqual(result.files, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles fails closed when table separator is missing', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '| File | Action | Why |',
      '| `src/foo.ts` | CREATE | core |',
      '',
    ].join('\n');
    const planPath = writePlan(repo, body);
    const result = parsePlanFiles(planPath);
    assert.strictEqual(result.ok, false);
    assert.ok(/separator/i.test(result.error));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles handles comma-separated paths in a single row cell', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `src/a.ts`, `src/b.ts` | CREATE | pair |',
      '',
    ].join('\n');
    const planPath = writePlan(repo, body);
    const result = parsePlanFiles(planPath);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.files, ['src/a.ts', 'src/b.ts']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles stops at next heading or blank line', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `src/a.ts` | CREATE | one |',
      '',
      '## Tasks',
      'unrelated stuff',
      '',
    ].join('\n');
    const planPath = writePlan(repo, body);
    const result = parsePlanFiles(planPath);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.files, ['src/a.ts']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles fails closed when plan path does not exist', function () {
  const result = parsePlanFiles('/nonexistent/plan.md');
  assert.strictEqual(result.ok, false);
  assert.ok(/not found/i.test(result.error));
});

test('gitDiffNameOnly returns NUL-separated file list', function () {
  const repo = mkTmpRepo();
  try {
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(repo, 'src/foo.ts', 'export const foo = 1;\n');
    writeFileSync(repo, 'src/bar.ts', 'export const bar = 2;\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'add foo bar', '--quiet']);
    const diff = gitDiffNameOnly(repo, base, 'HEAD');
    assert.deepStrictEqual(diff.sort(), ['src/bar.ts', 'src/foo.ts']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('computeResidual: skip_safe true when PR diff stays inside planned set', function () {
  const repo = mkTmpRepo();
  try {
    writePlan(repo, VALID_PLAN_BODY);
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'add plan', '--quiet']);
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(repo, 'src/foo.ts', 'export const foo = 1;\n');
    writeFileSync(repo, 'tests/foo.test.ts', 'test;\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'implement foo', '--quiet']);
    const result = computeResidual({
      cwd: repo,
      planPath: '.claude/plans/feature-x.plan.md',
      baseRef: base,
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.residual, []);
    assert.strictEqual(result.skip_safe, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('computeResidual: residual surfaces files outside planned set', function () {
  const repo = mkTmpRepo();
  try {
    writePlan(repo, VALID_PLAN_BODY);
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'add plan', '--quiet']);
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(repo, 'src/foo.ts', 'export const foo = 1;\n');
    writeFileSync(repo, 'src/extra.ts', 'export const extra = 3;\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'implement + extra', '--quiet']);
    const result = computeResidual({
      cwd: repo,
      planPath: '.claude/plans/feature-x.plan.md',
      baseRef: base,
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.residual, ['src/extra.ts']);
    assert.strictEqual(result.skip_safe, false);
    assert.ok(/residual files present/.test(result.reason));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('computeResidual: post-gate diff (changes after implement receipt) surfaces in residual even for planned files', function () {
  const repo = mkTmpRepo();
  try {
    writePlan(repo, VALID_PLAN_BODY);
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'add plan', '--quiet']);
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(repo, 'src/foo.ts', 'v1\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'implement v1', '--quiet']);
    const implementHead = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(repo, 'src/foo.ts', 'v2 (changed after gate)\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'tweak foo post-gate', '--quiet']);
    const fakeReceipt = { head_sha: implementHead };
    const result = computeResidual({
      cwd: repo,
      planPath: '.claude/plans/feature-x.plan.md',
      baseRef: base,
      implementReceipt: fakeReceipt,
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.residual, ['src/foo.ts'], 'planned file changed after gate must still surface');
    assert.strictEqual(result.skip_safe, false);
    assert.strictEqual(result.implement_receipt_head_sha, implementHead);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('computeResidual: fails closed when plan is missing the Files to Change section', function () {
  const repo = mkTmpRepo();
  try {
    writePlan(repo, '# Plan with no files section\n\n## Validation\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'broken plan', '--quiet']);
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(repo, 'src/whatever.ts', 'x\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'change', '--quiet']);
    const result = computeResidual({
      cwd: repo,
      planPath: '.claude/plans/feature-x.plan.md',
      baseRef: base,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.skip_safe, false);
    assert.ok(result.plan_parse_error);
    assert.ok(/fail-closed/.test(result.reason));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('computeResidual: glob entries in plan match actual diff files', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `src/feature/*.ts` | CREATE | feature dir |',
      '| `tests/**/*.test.ts` | CREATE | all tests |',
      '',
    ].join('\n');
    writePlan(repo, body);
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'add plan', '--quiet']);
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(repo, 'src/feature/a.ts', 'a\n');
    writeFileSync(repo, 'src/feature/b.ts', 'b\n');
    writeFileSync(repo, 'tests/foo/bar.test.ts', 't\n');
    gitQuiet(repo, ['add', '.']);
    gitQuiet(repo, ['commit', '-m', 'implement', '--quiet']);
    const result = computeResidual({
      cwd: repo,
      planPath: '.claude/plans/feature-x.plan.md',
      baseRef: base,
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.residual, []);
    assert.strictEqual(result.skip_safe, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('computeResidual: requires planPath and baseRef', function () {
  const a = computeResidual({});
  assert.strictEqual(a.ok, false);
  assert.ok(/planPath required/.test(a.reason));
  const b = computeResidual({ planPath: 'x.md' });
  assert.strictEqual(b.ok, false);
  assert.ok(/baseRef required/.test(b.reason));
});
