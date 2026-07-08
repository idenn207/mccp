'use strict';

// workflow-orchestration M2b Task 1 validate — disjoint-partition oracle.
// Cases: disjoint→N / file overlap→N=1 collapsed / mirror→merge / maxWorkers cap
// / empty plan / shared-output serialize (F2 a) / dependencyEdges (F2 b) / parse
// error. Mirrors plan-fanout/tests decision-tree style.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  partitionPlan, partitionFromPlanText, isSharedOutput, SHARED_OUTPUT_PATTERNS,
} = require('../partition');

const PLUGIN_JSON = 'plugins/mccp/.claude-plugin/plugin.json';

// ── isSharedOutput catalogue ─────────────────────────────────────────────────

test('isSharedOutput: shared manifests match, plain source does not', function () {
  assert.equal(isSharedOutput('CHANGELOG.md'), true);
  assert.equal(isSharedOutput('CLAUDE.md'), true);
  assert.equal(isSharedOutput(PLUGIN_JSON), true);
  assert.equal(isSharedOutput('package-lock.json'), true);
  assert.equal(isSharedOutput('.claude/cache/STATUS.md'), true);
  assert.equal(isSharedOutput('.claude/prds/workflow-orchestration.prd.md'), true);
  assert.equal(isSharedOutput('component.test.js.snap'), true);
  assert.equal(isSharedOutput('src/foo.js'), false);
  assert.equal(isSharedOutput('plugins/mccp/scripts/lib/bar.js'), false);
  assert.equal(isSharedOutput(''), false);
  assert.equal(isSharedOutput(null), false);
});

test('SHARED_OUTPUT_PATTERNS is frozen', function () {
  assert.ok(Object.isFrozen(SHARED_OUTPUT_PATTERNS));
});

// ── disjoint → N ──────────────────────────────────────────────────────────────

test('two disjoint tasks → n=2, not collapsed, disjoint reason', function () {
  const r = partitionPlan({
    planFiles: [{ path: 'a.js', taskIds: ['t1'] }, { path: 'b.js', taskIds: ['t2'] }],
    tasks: [{ id: 't1' }, { id: 't2' }],
    maxWorkers: 4,
  });
  assert.equal(r.n, 2);
  assert.equal(r.collapsed, false);
  assert.equal(r.reason, 'disjoint');
  // partitions carry the right files + task ids (sorted).
  const byTask = {};
  r.partitions.forEach(function (p) { byTask[p.taskIds.join(',')] = p.files; });
  assert.deepEqual(byTask['t1'], ['a.js']);
  assert.deepEqual(byTask['t2'], ['b.js']);
});

test('multiple files per disjoint partition are grouped correctly', function () {
  const r = partitionPlan({
    planFiles: [
      { path: 'mod-a/one.js', taskIds: ['t1'] },
      { path: 'mod-a/two.js', taskIds: ['t1'] },
      { path: 'mod-b/three.js', taskIds: ['t2'] },
    ],
    tasks: [{ id: 't1' }, { id: 't2' }],
    maxWorkers: 4,
  });
  assert.equal(r.n, 2);
  assert.equal(r.collapsed, false);
  const p1 = r.partitions.find(function (p) { return p.taskIds[0] === 't1'; });
  assert.deepEqual(p1.files, ['mod-a/one.js', 'mod-a/two.js']);
});

// ── file overlap → n=1 collapsed ──────────────────────────────────────────────

test('two tasks touching the SAME file → n=1 collapsed (file-overlap)', function () {
  const r = partitionPlan({
    planFiles: [{ path: 'a.js', taskIds: ['t1'] }, { path: 'a.js', taskIds: ['t2'] }],
    tasks: [{ id: 't1' }, { id: 't2' }],
    maxWorkers: 4,
  });
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'file-overlap');
  assert.deepEqual(r.partitions[0].taskIds, ['t1', 't2']);
});

// ── mirror / dependency → merge ───────────────────────────────────────────────

test('mirror dependency merges otherwise-disjoint tasks → n=1', function () {
  const r = partitionPlan({
    planFiles: [{ path: 'a.js', taskIds: ['t1'] }, { path: 'b.js', taskIds: ['t2'] }],
    tasks: [{ id: 't1' }, { id: 't2', mirrors: ['t1'] }],
    maxWorkers: 4,
  });
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'dependency-collapse');
});

test('dependencyEdges (import/test-impact) union crossing partitions (F2 b)', function () {
  const r = partitionPlan({
    planFiles: [{ path: 'a.js', taskIds: ['t1'] }, { path: 'b.js', taskIds: ['t2'] }],
    tasks: [{ id: 't1' }, { id: 't2' }],
    dependencyEdges: [['t1', 't2']],
    maxWorkers: 4,
  });
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'dependency-collapse');
});

// ── shared-output serialize (F2 a) ────────────────────────────────────────────

test('shared-output touchers serialize together, pure-source partition stays split', function () {
  const r = partitionPlan({
    planFiles: [
      { path: 'src/foo.js', taskIds: ['t1'] },     // pure source
      { path: 'src/bar.js', taskIds: ['t2'] },     // pure source
      { path: 'CHANGELOG.md', taskIds: ['t2'] },   // t2 touches shared
      { path: PLUGIN_JSON, taskIds: ['t3'] },      // t3 touches shared
    ],
    tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    maxWorkers: 4,
  });
  assert.equal(r.n, 2, 't2 + t3 (both shared-output touchers) collapse into one');
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'shared-output-serialized');
  const pure = r.partitions.find(function (p) { return p.taskIds.length === 1 && p.taskIds[0] === 't1'; });
  assert.ok(pure, 't1 (pure source) stays an independent partition');
  const serialized = r.partitions.find(function (p) { return p.taskIds.indexOf('t2') !== -1; });
  assert.deepEqual(serialized.taskIds, ['t2', 't3']);
  assert.ok(serialized.files.indexOf('CHANGELOG.md') !== -1);
  assert.ok(serialized.files.indexOf(PLUGIN_JSON) !== -1);
});

// ── maxWorkers cap ────────────────────────────────────────────────────────────

test('maxWorkers=1 forces every task into a single partition → n=1', function () {
  const r = partitionPlan({
    planFiles: [{ path: 'a.js', taskIds: ['t1'] }, { path: 'b.js', taskIds: ['t2'] }],
    tasks: [{ id: 't1' }, { id: 't2' }],
    maxWorkers: 1,
  });
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'max-workers-cap');
});

test('maxWorkers cap merges smallest partitions down to the cap', function () {
  const r = partitionPlan({
    planFiles: [
      { path: 'a.js', taskIds: ['t1'] },
      { path: 'b.js', taskIds: ['t2'] },
      { path: 'c.js', taskIds: ['t3'] },
    ],
    tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    maxWorkers: 2,
  });
  assert.equal(r.n, 2);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'max-workers-cap');
  // Every original file still appears exactly once across partitions (no loss).
  const all = r.partitions.reduce(function (acc, p) { return acc.concat(p.files); }, []).sort();
  assert.deepEqual(all, ['a.js', 'b.js', 'c.js']);
});

test('omitted maxWorkers defaults to 4 (5 disjoint tasks → n=4)', function () {
  const planFiles = [];
  const tasks = [];
  for (let i = 1; i <= 5; i++) {
    planFiles.push({ path: 'f' + i + '.js', taskIds: ['t' + i] });
    tasks.push({ id: 't' + i });
  }
  const r = partitionPlan({ planFiles: planFiles, tasks: tasks });
  assert.equal(r.n, 4);
  assert.equal(r.collapsed, true);
});

// ── empty / malformed ─────────────────────────────────────────────────────────

test('empty plan → n=1 collapsed (empty-plan)', function () {
  const r = partitionPlan({ planFiles: [], tasks: [], maxWorkers: 4 });
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'empty-plan');
});

test('malformed tasks (non-array) → n=1 collapsed (parse-error, fail-closed)', function () {
  const r = partitionPlan({ planFiles: [], tasks: 'nope', maxWorkers: 4 });
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'parse-error');
});

test('no argument at all does not throw → n=1', function () {
  const r = partitionPlan();
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
});

// ── partitionFromPlanText (work.md Step 3.prep-parallel derivation) ───────────

const PLAN_2_DISJOINT = [
  '# Plan',
  '',
  '## Files to Change',
  '',
  '| File | Action | Why |',
  '|---|---|---|',
  '| `src/a.js` | CREATE | alpha |',
  '| `src/b.js` | CREATE | beta |',
  '',
  '## Tasks',
  '',
  '### Task 1: alpha',
  '- **Action**: create `src/a.js`',
  '',
  '### Task 2: beta',
  '- **Action**: create `src/b.js`',
].join('\n');

test('partitionFromPlanText: two disjoint file-mapped tasks → n=2', function () {
  const r = partitionFromPlanText(PLAN_2_DISJOINT, 4);
  assert.equal(r.n, 2);
  assert.equal(r.collapsed, false);
});

test('partitionFromPlanText: a Mirror edge merges the tasks → n=1', function () {
  const planText = PLAN_2_DISJOINT.replace(
    '### Task 2: beta\n- **Action**: create `src/b.js`',
    '### Task 2: beta\n- **Mirror**: Task 1\n- **Action**: create `src/b.js`');
  const r = partitionFromPlanText(planText, 4);
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
});

test('partitionFromPlanText: shared manifest touched by a task serializes it', function () {
  const planText = [
    '## Files to Change',
    '|---|---|',
    '| `src/a.js` | CREATE |',
    '| `src/b.js` | CREATE |',
    '| `CHANGELOG.md` | UPDATE |',
    '## Tasks',
    '### Task 1: alpha',
    'edits `src/a.js`',
    '### Task 2: beta',
    'edits `src/b.js` and `CHANGELOG.md`',
  ].join('\n');
  const r = partitionFromPlanText(planText, 4);
  // task1 (a.js) stays; task2 (b.js + shared CHANGELOG) is a partition of its own.
  assert.equal(r.n, 2);
});

test('partitionFromPlanText: no Files-to-Change section → n=1 (no-files-parsed)', function () {
  const r = partitionFromPlanText('# Plan\n\nNo file table here.\n', 4);
  assert.equal(r.n, 1);
  assert.equal(r.collapsed, true);
  assert.equal(r.reason, 'no-files-parsed');
});

test('partitionFromPlanText: non-string input → n=1', function () {
  const r = partitionFromPlanText(null, 4);
  assert.equal(r.n, 1);
});
