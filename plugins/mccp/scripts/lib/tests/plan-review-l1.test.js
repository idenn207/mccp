'use strict';

// diverse-agent-review M1 Task 3 — L1 mechanical plan-consistency check.
//
// Covers each violation class (C1..C7) in isolation, the converged path, the
// three-way verdict split (notably inconclusive ≠ divergent), and the
// abbreviated-citation false-positive regression that a prototype checker
// actually produced when self-applied to this cycle's plan.

const test = require('node:test');
const assert = require('node:assert/strict');
const nodePath = require('path');
const nodeFs = require('fs');

const { checkPlanConsistency, REQUIRED_SECTIONS } = require('../plan-review/l1-check');

const ROOT = '/repo';

// In-memory fs adapter. Paths are recorded repo-relative; existsSync resolves
// the absolute path back down to that form so the checker's path.join is
// exercised for real (including Windows separators).
function mockFs(existingRelPaths) {
  const set = new Set(existingRelPaths || []);
  const rootNorm = ROOT.replace(/\\/g, '/');
  return {
    existsSync: function (p) {
      const norm = String(p).replace(/\\/g, '/');
      if (norm.indexOf(rootNorm) !== 0) return false;
      const rel = norm.slice(rootNorm.length).replace(/^\//, '');
      return set.has(rel);
    },
    readFileSync: function () { throw new Error('readFileSync should not be called'); },
  };
}

// A plan that satisfies every check. Individual tests mutate one thing.
function goodPlan() {
  return [
    '# Plan: sample',
    '',
    '**Source PRD**: `.claude/prds/sample.prd.md`',
    '',
    '## Summary',
    'Does a thing.',
    '',
    '## Files to Change',
    '',
    '| File | Action | Why |',
    '|---|---|---|',
    '| `plugins/mccp/scripts/lib/existing.js` | UPDATE | tweak |',
    '| `plugins/mccp/scripts/lib/brand-new.js` | CREATE | new |',
    '',
    '## Tasks',
    '',
    '### Task 1: first',
    '- **Action**: do it',
    '- **Validate**: `node --test x.test.js`',
    '',
    '### Task 2: second',
    '- **Action**: do it again',
    '- **Validate**: `node --check y.js`',
    '',
    '## Validation',
    '```bash',
    'node --test',
    '```',
    '',
    '## Risks',
    '| Risk | Mitigation |',
    '|---|---|',
    '| none | n/a |',
    '',
    '## Acceptance',
    '- [ ] done',
    '',
  ].join('\n');
}

const GOOD_FS = [
  'plugins',
  '.claude',
  '.claude/prds/sample.prd.md',
  'plugins/mccp/scripts/lib/existing.js',
];

function run(planText, existing) {
  return checkPlanConsistency({
    planText: planText,
    repoRoot: ROOT,
    fsAdapter: mockFs(existing === undefined ? GOOD_FS : existing),
  });
}

function codes(result) {
  return result.violations.map(function (v) { return v.code; });
}

// ── converged path ────────────────────────────────────────────────────────────

test('a fully consistent plan converges with zero violations', () => {
  const r = run(goodPlan());
  assert.equal(r.verdict, 'converged', JSON.stringify(r.violations));
  assert.deepEqual(r.violations, []);
});

// ── C1 / C7 section structure ─────────────────────────────────────────────────

test('C1: each missing required section is reported', () => {
  REQUIRED_SECTIONS.forEach(function (name) {
    const text = goodPlan().replace('## ' + name + '\n', '## Removed' + name + '\n');
    const r = run(text);
    assert.equal(r.verdict, 'divergent', name);
    assert.ok(codes(r).indexOf('C1_MISSING_SECTION') !== -1, name);
  });
});

test('C7: duplicated required section is rejected', () => {
  const r = run(goodPlan() + '\n## Risks\nduplicate\n');
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C7_DUPLICATE_SECTION') !== -1);
});

test('C7: duplicate Task heading is rejected', () => {
  const text = goodPlan().replace('### Task 2: second', '### Task 1: second');
  const r = run(text);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C7_DUPLICATE_TASK') !== -1);
});

test('C7: ragged Files to Change row is rejected', () => {
  const text = goodPlan().replace(
    '| `plugins/mccp/scripts/lib/brand-new.js` | CREATE | new |',
    '| `plugins/mccp/scripts/lib/brand-new.js` | CREATE |');
  const r = run(text);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C7_TABLE_SHAPE') !== -1);
});

// ── C2 repo-root paths ────────────────────────────────────────────────────────

test('C2: abbreviated (non repo-root) path is rejected', () => {
  // `lib/existing.js` — there is no `lib/` at the repo root, which is exactly
  // the shape that silently defeats cross-gate dedupe (CLAUDE.md §1.2).
  const text = goodPlan().replace(
    '`plugins/mccp/scripts/lib/existing.js`', '`lib/existing.js`');
  const r = run(text);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C2_NOT_REPO_ROOT_PATH') !== -1);
});

// A CREATE row is allowed to name a top-level directory that does not exist yet
// — that is what "create" means. Flagging it was a false positive that hard-
// blocked correct plans before L2 ever fired. The exemption is narrow: it applies
// only when nothing resolves under a conventional base, because a path that DOES
// resolve there is an abbreviation, which is the case C2 exists to catch.
test('C2: CREATE introducing a new top-level directory is accepted', () => {
  const text = goodPlan().replace(
    '| `plugins/mccp/scripts/lib/brand-new.js` | CREATE | new |',
    '| `docs/newthing/spec.md` | CREATE | new |');
  const r = run(text);
  assert.equal(r.verdict, 'converged', JSON.stringify(r.violations));
});

test('C2: an abbreviated CREATE path is still rejected', () => {
  // `lib/existing.js` resolves under plugins/mccp/scripts/ — an abbreviation
  // wearing a CREATE action, not a new tree.
  const text = goodPlan().replace(
    '| `plugins/mccp/scripts/lib/brand-new.js` | CREATE | new |',
    '| `lib/existing.js` | CREATE | new |');
  const r = run(text);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C2_NOT_REPO_ROOT_PATH') !== -1);
});

test('C2: a non-CREATE row naming a missing top-level dir is still rejected', () => {
  const text = goodPlan().replace(
    '| `plugins/mccp/scripts/lib/existing.js` | UPDATE | tweak |',
    '| `docs/newthing/spec.md` | UPDATE | tweak |');
  const r = run(text);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C2_NOT_REPO_ROOT_PATH') !== -1);
});

test('C2: root-level file (CHANGELOG.md) is accepted', () => {
  const text = goodPlan().replace(
    '| `plugins/mccp/scripts/lib/existing.js` | UPDATE | tweak |',
    '| `CHANGELOG.md` | UPDATE | row |');
  const r = run(text, GOOD_FS.concat(['CHANGELOG.md']));
  assert.equal(r.verdict, 'converged', JSON.stringify(r.violations));
});

// ── C3 action/existence ───────────────────────────────────────────────────────

test('C3: UPDATE target that does not exist is rejected', () => {
  const r = run(goodPlan(), ['plugins', '.claude', '.claude/prds/sample.prd.md']);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C3_MISSING_TARGET') !== -1);
});

test('C3: CREATE target that already exists is rejected', () => {
  const r = run(goodPlan(), GOOD_FS.concat(['plugins/mccp/scripts/lib/brand-new.js']));
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C3_CREATE_EXISTS') !== -1);
});

test('C3: DELETE is held to the same existence requirement as UPDATE', () => {
  const text = goodPlan().replace('| UPDATE | tweak |', '| DELETE | remove |');
  const r = run(text, ['plugins', '.claude', '.claude/prds/sample.prd.md']);
  assert.ok(codes(r).indexOf('C3_MISSING_TARGET') !== -1);
});

// ── C4 per-task Validate ──────────────────────────────────────────────────────

test('C4: a task without a **Validate**: line is rejected', () => {
  const text = goodPlan().replace('- **Validate**: `node --check y.js`', '- (nothing)');
  const r = run(text);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C4_MISSING_VALIDATE') !== -1);
});

// ── C5 Source PRD ─────────────────────────────────────────────────────────────

test('C5: missing Source PRD file is rejected', () => {
  const r = run(goodPlan(), ['plugins', '.claude', 'plugins/mccp/scripts/lib/existing.js']);
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C5_MISSING_PRD') !== -1);
});

test('C5: a plan with no Source PRD line is not penalised', () => {
  const text = goodPlan().replace('**Source PRD**: `.claude/prds/sample.prd.md`', '');
  const r = run(text);
  assert.ok(codes(r).indexOf('C5_MISSING_PRD') === -1);
});

// ── C6 citations ──────────────────────────────────────────────────────────────

test('C6: an unresolvable path:line citation is rejected', () => {
  const r = run(goodPlan() + '\nSee `does/not/exist.js:42` for context.\n');
  assert.equal(r.verdict, 'divergent');
  assert.ok(codes(r).indexOf('C6_UNRESOLVED_CITATION') !== -1);
});

test('C6: citation resolving under a conventional base is accepted', () => {
  // `existing.js:20` resolves via the plugins/mccp/scripts/lib/ base.
  const r = run(goodPlan() + '\nMirror `existing.js:20-30`.\n');
  assert.equal(r.verdict, 'converged', JSON.stringify(r.violations));
});

test('C6: a bare filename with no :line is prose, not a citation', () => {
  const r = run(goodPlan() + '\nWe touch nonexistent-module.js somewhere.\n');
  assert.equal(r.verdict, 'converged', JSON.stringify(r.violations));
});

test('C6: CREATE targets are exempt (C3 owns their absence)', () => {
  const r = run(goodPlan() + '\nNew oracle at `plugins/mccp/scripts/lib/brand-new.js:12`.\n');
  assert.equal(r.verdict, 'converged', JSON.stringify(r.violations));
});

// ── inconclusive ≠ divergent (G3) ─────────────────────────────────────────────

test('unreadable plan yields inconclusive, not divergent', () => {
  const r = checkPlanConsistency({
    planPath: nodePath.join(ROOT, 'nope.plan.md'),
    repoRoot: ROOT,
    fsAdapter: {
      existsSync: function () { return false; },
      readFileSync: function () { throw new Error('ENOENT'); },
    },
  });
  assert.equal(r.verdict, 'inconclusive');
  assert.equal(r.violations[0].code, 'E_READ');
});

test('empty plan body yields inconclusive', () => {
  const r = run('', GOOD_FS);
  assert.equal(r.verdict, 'inconclusive');
  assert.equal(r.violations[0].code, 'E_READ');
});

test('no planText and no planPath yields inconclusive rather than throwing', () => {
  const r = checkPlanConsistency({ repoRoot: ROOT, fsAdapter: mockFs([]) });
  assert.equal(r.verdict, 'inconclusive');
});

test('checkPlanConsistency never throws on hostile input', () => {
  [undefined, {}, { planText: 42 }, { planText: {} }].forEach(function (opts) {
    assert.doesNotThrow(function () { checkPlanConsistency(opts); });
  });
});

// ── real-plan regression: abbreviated citations must NOT be false positives ────

test('C6 regression: this cycle\'s own plan produces zero citation violations', () => {
  // The measured failure a prototype checker hit: plan prose cites modules by
  // short name (`receipt-convergence.js:20-30`, `schema.js:33`) because that is
  // the house convention. Literal-existence checking flagged 4 of them. Base
  // resolution is what makes the convention legal.
  const repoRoot = nodePath.resolve(__dirname, '../../../../..');
  const planPath = nodePath.join(repoRoot, '.claude/plans/diverse-agent-review-m1.plan.md');
  if (!nodeFs.existsSync(planPath)) return; // plan archived after ship — skip

  const r = checkPlanConsistency({
    planText: nodeFs.readFileSync(planPath, 'utf8'),
    repoRoot: repoRoot,
  });
  const citationViolations = r.violations.filter(function (v) {
    return v.code === 'C6_UNRESOLVED_CITATION';
  });
  assert.deepEqual(citationViolations, [],
    'abbreviated citations should resolve under a conventional base');
});

test('structural checks on this cycle\'s own plan: sections, tasks, table shape', () => {
  const repoRoot = nodePath.resolve(__dirname, '../../../../..');
  const planPath = nodePath.join(repoRoot, '.claude/plans/diverse-agent-review-m1.plan.md');
  if (!nodeFs.existsSync(planPath)) return;

  const r = checkPlanConsistency({
    planText: nodeFs.readFileSync(planPath, 'utf8'),
    repoRoot: repoRoot,
  });
  // C3_CREATE_EXISTS is EXPECTED to appear once implementation lands the CREATE
  // targets — L1 runs at plan time, not mid-implementation. The structural
  // checks below are the ones that must hold at any point in the cycle.
  ['C1_MISSING_SECTION', 'C2_NOT_REPO_ROOT_PATH', 'C4_MISSING_VALIDATE',
   'C5_MISSING_PRD', 'C7_DUPLICATE_SECTION', 'C7_DUPLICATE_TASK',
   'C7_TABLE_SHAPE'].forEach(function (code) {
    const hits = r.violations.filter(function (v) { return v.code === code; });
    assert.deepEqual(hits, [], code + ' should be clean: ' + JSON.stringify(hits));
  });
});
