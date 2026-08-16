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
  evaluateForDedupe,
  codexConverged,
  buildPlannedMatcher,
  globToRegex,
  normalizePath,
} = require('../dedupe');
const { buildReceipt } = require('../write');
const { writeReceipt } = require('../store');

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

// gate-guard-integrity M3 (C3). The two cases below are a pair: the first is
// the tolerance being added, the second is the fail-closed property that must
// NOT be relaxed along with it. Their names are fixed by the plan body because
// the plan's Validation greps for them — a free-form name would make that check
// depend on the implementer's wording.
test('parsePlanFiles tolerates a prose line between heading and table', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '',
      'The table below lists every file this milestone touches, with the axis',
      'each change closes.',
      '',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `src/foo.ts` | UPDATE | close axis A |',
      '| `src/bar.ts` | CREATE | close axis B |',
      '',
    ].join('\n');
    const planPath = writePlan(repo, body);
    const result = parsePlanFiles(planPath);
    // Before the fix the prose line was adopted as the header row and the next
    // line failed with "table separator missing" — a silent dedupe miss.
    assert.strictEqual(result.ok, true, 'prose before the table must not break parsing: ' + result.error);
    assert.strictEqual(result.files.length, 2);
    assert.ok(result.files.includes('src/foo.ts'));
    assert.ok(result.files.includes('src/bar.ts'));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles fails closed when the table is absent entirely', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '',
      'This milestone touches no files; the work is entirely operational.',
      '',
      '## Validation',
      '',
      'nothing to validate',
      '',
    ].join('\n');
    const planPath = writePlan(repo, body);
    const result = parsePlanFiles(planPath);
    // Tolerating prose must not degrade into accepting a section with no table.
    // The scan stops at the next heading and reports empty — never ok:true.
    assert.strictEqual(result.ok, false, 'a section with prose but no table must stay fail-closed');
    assert.deepStrictEqual(result.files, []);
    assert.ok(/empty/i.test(result.error), 'unexpected error text: ' + result.error);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// Local-review absorption (2026-08-16), same C3 locus. Tolerating prose opened a
// second question the original pair did not answer: what counts as "the table"
// when the section also contains FENCED text? These three pin it.

test('parsePlanFiles ignores a fenced example table and adopts the real one', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '',
      'For example, a row looks like this:',
      '',
      '```markdown',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `docs/**` | UPDATE | illustrative only |',
      '```',
      '',
      'The actual table:',
      '',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `src/real.ts` | UPDATE | the only planned file |',
      '',
    ].join('\n');
    const result = parsePlanFiles(writePlan(repo, body));
    assert.strictEqual(result.ok, true, 'the real table must parse: ' + result.error);
    // The load-bearing assertion. Adopting the fenced example would yield the
    // glob `docs/**`, which can swallow the real diff and flip skip_safe to true
    // — a dual-review bypass, not merely a wrong file list.
    assert.deepStrictEqual(result.files, ['src/real.ts']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles is not stopped by a `#` comment inside a fenced snippet', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '',
      '```bash',
      '# regenerate the list with:',
      'git diff --name-only',
      '```',
      '',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `src/foo.ts` | UPDATE | close axis A |',
      '',
    ].join('\n');
    const result = parsePlanFiles(writePlan(repo, body));
    // HEADING_RE is /^#{1,6}\s+/, so an unskipped fence body would read that
    // bash comment as the next heading and report the section empty.
    assert.strictEqual(result.ok, true, 'fenced `#` must not read as a heading: ' + result.error);
    assert.deepStrictEqual(result.files, ['src/foo.ts']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('parsePlanFiles fails closed when a fence is never closed', function () {
  const repo = mkTmpRepo();
  try {
    const body = [
      '## Files to Change',
      '',
      '```markdown',
      '| File | Action | Why |',
      '|---|---|---|',
      '| `src/foo.ts` | UPDATE | inside an unterminated fence |',
      '',
    ].join('\n');
    const result = parsePlanFiles(writePlan(repo, body));
    // Scanning to EOF must report empty, never fall back to adopting the fenced
    // rows — "we could not find the table" may not degrade into "here is one".
    assert.strictEqual(result.ok, false, 'an unterminated fence must not yield a table');
    assert.deepStrictEqual(result.files, []);
    assert.ok(/empty/i.test(result.error), 'unexpected error text: ' + result.error);
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

// ---------------------------------------------------------------------------
// v1.20.3 — evaluateForDedupe convergence regression (P1 codex-dedupe-integrity).
//
// The critical bug: dedupe read resolution.converged (always defaults true at
// write time) instead of the real Codex verdict, so a divergent review still
// skipped PR-Codex. These tests write real plan-codex + implement-codex receipts
// via buildReceipt (exercising write.js codex_verdict persistence) and assert
// evaluateForDedupe fail-closes unless BOTH receipts carry
// resolution.codex_verdict === 'converged' AND residual is empty.
// ---------------------------------------------------------------------------

const DEDUPE_PLAN_REL = '.claude/plans/feature-x.plan.md';
const DEDUPE_DECISION = 'feature-x';

// Write a gate receipt through buildReceipt so the codex_verdict actually flows
// through write.js's resolution assembly + schema validation, then persist it.
// verdict === undefined leaves the field absent (legacy / not-forwarded case).
function writeGateReceipt(repo, gateId, verdict) {
  const args = {
    gate: gateId,
    decision: DEDUPE_DECISION,
    plan: DEDUPE_PLAN_REL,
    cwd: repo,
  };
  if (verdict !== undefined) args['codex-verdict'] = verdict;
  const built = buildReceipt(args);
  return writeReceipt(built.repoRoot, built.receipt);
}

// Build a tmp repo with the plan committed, then the planned files implemented,
// so the PR diff stays inside the planned set (residual empty). Returns { base }.
// When extraFile is given it is committed alongside the planned files, forcing a
// non-empty residual regardless of convergence.
function setupDedupeRepo(repo, extraFile) {
  writePlan(repo, VALID_PLAN_BODY);
  gitQuiet(repo, ['add', '.']);
  gitQuiet(repo, ['commit', '-m', 'add plan', '--quiet']);
  const base = git(repo, ['rev-parse', 'HEAD']);
  writeFileSync(repo, 'src/foo.ts', 'export const foo = 1;\n');
  writeFileSync(repo, 'src/bar.ts', 'export const bar = 2;\n');
  writeFileSync(repo, 'tests/foo.test.ts', 'test;\n');
  if (extraFile) writeFileSync(repo, extraFile, 'export const extra = 3;\n');
  gitQuiet(repo, ['add', '.']);
  gitQuiet(repo, ['commit', '-m', 'implement', '--quiet']);
  return { base: base };
}

test('codexConverged: only codex_verdict==="converged" is truthy (fail-closed)', function () {
  assert.strictEqual(codexConverged(null), false);
  assert.strictEqual(codexConverged({}), false);
  assert.strictEqual(codexConverged({ resolution: {} }), false);
  assert.strictEqual(codexConverged({ resolution: { converged: true } }), false,
    'legacy converged=true without codex_verdict must NOT count as converged');
  assert.strictEqual(codexConverged({ resolution: { codex_verdict: 'divergent' } }), false);
  assert.strictEqual(codexConverged({ resolution: { codex_verdict: 'converged' } }), true);
});

test('evaluateForDedupe: both gates converged + residual empty → skip_safe true', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    writeGateReceipt(repo, 'mccp-plan-codex', 'converged');
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    const result = evaluateForDedupe({
      cwd: repo,
      planPath: DEDUPE_PLAN_REL,
      baseRef: base,
      decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, true, result.reason);
    assert.ok(/both gates codex_verdict="converged"/.test(result.reason));
    assert.strictEqual(result.convergence.plan_codex_receipt.codex_verdict, 'converged');
    assert.strictEqual(result.convergence.implement_codex_receipt.codex_verdict, 'converged');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('evaluateForDedupe: one gate divergent → skip_safe false (PR-Codex runs)', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    writeGateReceipt(repo, 'mccp-plan-codex', 'divergent');
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    const result = evaluateForDedupe({
      cwd: repo,
      planPath: DEDUPE_PLAN_REL,
      baseRef: base,
      decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, false);
    assert.ok(/plan-codex codex_verdict/.test(result.reason), result.reason);
    assert.strictEqual(result.convergence.plan_codex_receipt.converged, false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('evaluateForDedupe: implement codex_verdict absent → skip_safe false (fail-closed)', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    writeGateReceipt(repo, 'mccp-plan-codex', 'converged');
    writeGateReceipt(repo, 'mccp-implement-codex', undefined); // legacy: no verdict field
    const result = evaluateForDedupe({
      cwd: repo,
      planPath: DEDUPE_PLAN_REL,
      baseRef: base,
      decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, false);
    assert.ok(/implement-codex codex_verdict/.test(result.reason), result.reason);
    assert.strictEqual(result.convergence.implement_codex_receipt.codex_verdict, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('evaluateForDedupe: plan receipt missing → skip_safe false', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    // Only the implement receipt exists — no plan-codex receipt.
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    const result = evaluateForDedupe({
      cwd: repo,
      planPath: DEDUPE_PLAN_REL,
      baseRef: base,
      decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, false);
    assert.ok(/plan-codex codex_verdict/.test(result.reason), result.reason);
    assert.strictEqual(result.convergence.plan_codex_receipt, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('evaluateForDedupe: residual present overrides both-converged → skip_safe false', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo, 'src/extra.ts'); // unplanned file in diff
    writeGateReceipt(repo, 'mccp-plan-codex', 'converged');
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    const result = evaluateForDedupe({
      cwd: repo,
      planPath: DEDUPE_PLAN_REL,
      baseRef: base,
      decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, false);
    assert.deepStrictEqual(result.residual, ['src/extra.ts']);
    assert.ok(/residual files present/.test(result.reason), result.reason);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── diverse-agent-review M1 (DD2) — cross-model corroboration required ────────
// The skip predicate asserts "Codex already reviewed this twice". A multi-agent
// panel approval is not evidence Codex ever spoke, so it must not satisfy the
// skip — otherwise moving plan review off Codex would delete cross-model review
// from the pipeline instead of relocating it to the ship point.

const { crossModelConverged } = require('../dedupe');

function panelResolution(verdict, source) {
  return {
    converged: true,
    review_verdict: verdict,
    review_source: source,
    review_proof: {
      layers: { l1: 'converged', l2: 'converged', l3: null },
      verification_verdict: 'converged',
      quorum: { passed: true, required: 3, of: 4, roles: 4, responded: 4 },
      perspectives: [
        { perspective: 'architect', verdict: 'pass' },
        { perspective: 'security', verdict: 'pass' },
        { perspective: 'test', verdict: 'pass' },
        { perspective: 'invariant', verdict: 'pass' },
      ],
      dispatch_evidence: ['.claude/state/dispatches/abc.envelope.json'],
      reviewed_plan_hash: 'sha256:' + 'a'.repeat(64),
    },
  };
}

test('DD2: a multi-agent converged receipt does NOT satisfy the skip predicate', () => {
  assert.strictEqual(
    crossModelConverged({ resolution: panelResolution('converged', 'multi-agent') }),
    false,
    'multi-agent approval is not cross-model corroboration');
});

test('DD2: a hybrid converged receipt DOES satisfy it (Codex was in the loop)', () => {
  // santa-loop R5: the L3 layer must be present. A hybrid stamp without it is a
  // cross-model claim with no cross-model evidence, and this predicate is what
  // buys the PR-Codex skip.
  const r = panelResolution('converged', 'hybrid');
  r.review_proof.layers = { l1: 'converged', l2: 'converged', l3: 'converged' };
  assert.strictEqual(crossModelConverged({ resolution: r }), true);
});

test('DD2: a hybrid receipt WITHOUT the L3 layer does NOT satisfy it', () => {
  const r = panelResolution('converged', 'hybrid');   // layers.l3 stays null
  assert.strictEqual(crossModelConverged({ resolution: r }), false,
    'claiming hybrid must not be enough to skip terminal PR-Codex');
});

test('DD2: legacy codex_verdict=converged still satisfies it (no regression)', () => {
  assert.strictEqual(
    crossModelConverged({ resolution: { converged: true, codex_verdict: 'converged' } }),
    true);
});

test('DD2: every non-converged verdict fails closed regardless of source', () => {
  ['divergent', 'critical', 'unavailable', 'skipped'].forEach(function (v) {
    assert.strictEqual(
      crossModelConverged({ resolution: panelResolution(v, 'hybrid') }), false, v);
    assert.strictEqual(
      crossModelConverged({ resolution: { converged: true, codex_verdict: v } }), false, v);
  });
});

test('DD2: a missing receipt or a structurally broken proof fails closed', () => {
  assert.strictEqual(crossModelConverged(null), false);
  assert.strictEqual(crossModelConverged({}), false);
  const broken = panelResolution('converged', 'hybrid');
  broken.review_proof.quorum.passed = false;
  assert.strictEqual(crossModelConverged({ resolution: broken }), false);
});

// ---------------------------------------------------------------------------
// codex-intent-context M1 Task 7b (DD9) — the intent axis is added on the PLAN
// receipt only. The shared codexConverged helper is untouched, because it is
// used for BOTH receipts and mccp-implement-codex is deliberately outside the
// intent scope (UI4) — folding intent in there would make every implement
// receipt read as unknown and kill dedupe for every decision in the repo.
// ---------------------------------------------------------------------------

const { isIntentApproved } = require('../../lib/intent-context');

// Rewrite a receipt's intent meta in place and re-seal it (fixtures need states
// write.js will not produce, e.g. a legacy receipt with no intent keys).
function restampIntent(repo, gateId, mutate) {
  const { readReceipt, writeReceipt: wr } = require('../store');
  const { subjectHash, receiptHash } = require('../hash');
  const r = readReceipt(repo, gateId, DEDUPE_DECISION);
  mutate(r.meta, r);
  r.subject_hash = subjectHash(r);
  r.receipt_hash = receiptHash(r);
  wr(repo, r);
  return r;
}

test('DD9: codexConverged remains gate-agnostic — no intent condition inside it', function () {
  // If intent were folded into the shared helper, an implement receipt (which
  // never carries intent fields) would read as false here.
  const implementLike = {
    resolution: { codex_verdict: 'converged' },
    meta: { created_at: 'x' },
  };
  assert.strictEqual(codexConverged(implementLike), true);
});

test('DD2: a legacy plan receipt (no intent keys) blocks dedupe → PR-Codex runs', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    writeGateReceipt(repo, 'mccp-plan-codex', 'converged');
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    // Strip the intent axis to emulate a receipt written before the field existed.
    restampIntent(repo, 'mccp-plan-codex', function (meta) {
      delete meta.intent_gate_verdict;
      delete meta.intent_skip_proof;
      delete meta.intent_plan_digest;
    });
    const result = evaluateForDedupe({
      cwd: repo, planPath: DEDUPE_PLAN_REL, baseRef: base, decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, false, result.reason);
    assert.match(result.reason, /intent gate not approved/);
    assert.strictEqual(result.convergence.plan_codex_receipt.intent_approved, false);
    // ...and the implement receipt is unaffected: it still reads as converged.
    assert.strictEqual(result.convergence.implement_codex_receipt.converged, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('DD6: a plan receipt forced through the audited override cannot certify a skip', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    writeGateReceipt(repo, 'mccp-plan-codex', 'converged');
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    restampIntent(repo, 'mccp-plan-codex', function (meta) {
      meta.intent_gate_verdict = 'incomplete';
      meta.intent_skip_proof = null;
      meta.intent_gate_force_override = true;
      meta.intent_gate_force_override_reason =
        'operator accepted the residual gap after manual review this cycle';
    });
    const result = evaluateForDedupe({
      cwd: repo, planPath: DEDUPE_PLAN_REL, baseRef: base, decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, false, result.reason);
    assert.match(result.reason, /intent gate not approved/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('DD4-2: a plan digest that disagrees with plan_hash blocks dedupe', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    writeGateReceipt(repo, 'mccp-plan-codex', 'converged');
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    restampIntent(repo, 'mccp-plan-codex', function (meta) {
      meta.intent_gate_verdict = 'preserved';
      meta.intent_plan_digest = 'sha256:' + '0'.repeat(64);
    });
    const result = evaluateForDedupe({
      cwd: repo, planPath: DEDUPE_PLAN_REL, baseRef: base, decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, false, result.reason);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('an intent-approved plan receipt still dedupes (no regression on the happy path)', function () {
  const repo = mkTmpRepo();
  try {
    const { base } = setupDedupeRepo(repo);
    writeGateReceipt(repo, 'mccp-plan-codex', 'converged');
    writeGateReceipt(repo, 'mccp-implement-codex', 'converged');
    restampIntent(repo, 'mccp-plan-codex', function (meta, r) {
      meta.intent_gate_verdict = 'preserved';
      meta.intent_plan_digest = r.plan_hash;
    });
    const result = evaluateForDedupe({
      cwd: repo, planPath: DEDUPE_PLAN_REL, baseRef: base, decisionId: DEDUPE_DECISION,
    });
    assert.strictEqual(result.skip_safe, true, result.reason);
    assert.strictEqual(result.convergence.plan_codex_receipt.intent_approved, true);
    assert.ok(isIntentApproved({
      plan_hash: 'sha256:x', meta: { intent_gate_verdict: 'preserved', intent_plan_digest: 'sha256:x' },
    }));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
