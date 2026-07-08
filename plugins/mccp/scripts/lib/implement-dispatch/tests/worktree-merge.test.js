'use strict';

// workflow-orchestration M3 Task 1 validate — worktree→parent collect/apply/rollback.
// Pure correlation + diff helpers with injected stubs, PLUS real-git integration
// (temp repo, 2 worktrees) exercising the spike scenario end-to-end incl. the F4
// rollback-safety invariant (pre-existing dirty + untracked preserved).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const wm = require('../worktree-merge');

// ── pure: isEmptyDiff / parseChangedFiles ─────────────────────────────────────

test('isEmptyDiff: empty / whitespace / no-header → true; real diff → false', function () {
  assert.equal(wm.isEmptyDiff(''), true);
  assert.equal(wm.isEmptyDiff('   \n  '), true);
  assert.equal(wm.isEmptyDiff('just some text'), true);
  assert.equal(wm.isEmptyDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n'), false);
});

test('parseChangedFiles: adds/mods + deletion (+++ /dev/null → a/ side) + backslash norm', function () {
  const diff = [
    'diff --git a/x.js b/x.js', '--- a/x.js', '+++ b/x.js', '@@', '+z',
    'diff --git a/gone.js b/gone.js', '--- a/gone.js', '+++ /dev/null', '@@', '-y',
  ].join('\n');
  assert.deepEqual(wm.parseChangedFiles(diff).sort(), ['gone.js', 'x.js']);
});

// ── pure: buildWorktreeMap ────────────────────────────────────────────────────

test('buildWorktreeMap: correlates each dispatchId to its worktree', function () {
  const r = wm.buildWorktreeMap({
    worktrees: [{ path: '/wt/a' }, { path: '/wt/b' }],
    dispatchIds: ['id-a', 'id-b'],
    readDispatchIds: function (p) { return p === '/wt/a' ? ['id-a'] : ['id-b']; },
  });
  // map is a null-prototype object (proto-pollution defense) — spread to a plain
  // object for deepStrictEqual.
  assert.deepEqual(Object.assign({}, r.map), { 'id-a': '/wt/a', 'id-b': '/wt/b' });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.ambiguous, []);
});

test('buildWorktreeMap: expected id with no worktree → missing (fail-closed)', function () {
  const r = wm.buildWorktreeMap({
    worktrees: [{ path: '/wt/a' }],
    dispatchIds: ['id-a', 'id-b'],
    readDispatchIds: function () { return ['id-a']; },
  });
  assert.deepEqual(Object.assign({}, r.map), { 'id-a': '/wt/a' });
  assert.deepEqual(r.missing, ['id-b']);
});

test('buildWorktreeMap: same id in two worktrees → ambiguous (never mapped)', function () {
  const r = wm.buildWorktreeMap({
    worktrees: [{ path: '/wt/a' }, { path: '/wt/b' }],
    dispatchIds: ['id-a'],
    readDispatchIds: function () { return ['id-a']; },
  });
  assert.equal(r.map['id-a'], undefined);
  assert.equal(r.ambiguous.length, 1);
  assert.deepEqual(r.ambiguous[0].paths.sort(), ['/wt/a', '/wt/b']);
});

// ── pure: applyDisjointDiffs / rollbackApplied with injected runGit ───────────

function fakeGit(script) {
  // script(args, opts) → { code, stdout, stderr }
  const calls = [];
  const run = function (args, opts) {
    calls.push({ args: args, input: opts && opts.input });
    return script(args, opts) || { code: 0, stdout: '', stderr: '' };
  };
  run.calls = calls;
  return run;
}

test('applyDisjointDiffs: all-empty → no-op ok, applied 0', function () {
  const run = fakeGit(function () { return { code: 0 }; });
  const r = wm.applyDisjointDiffs({ diffs: ['', '   '], cwd: '/p', runGit: run });
  assert.equal(r.ok, true);
  assert.equal(r.applied, 0);
  assert.equal(r.skippedEmpty, 2);
  assert.equal(run.calls.length, 0); // never touched git
});

test('applyDisjointDiffs: check-fail → nothing applied (atomic gate)', function () {
  const good = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n+z\n';
  const run = fakeGit(function (args) {
    if (args.indexOf('--check') !== -1) return { code: 1, stderr: 'conflict' };
    return { code: 0 };
  });
  const r = wm.applyDisjointDiffs({ diffs: [good], cwd: '/p', runGit: run });
  assert.equal(r.ok, false);
  assert.equal(r.applied, 0);
  assert.match(r.error, /apply --check failed/);
  // never proceeded to a real apply
  assert.equal(run.calls.some(function (c) { return c.args.indexOf('--check') === -1 && c.args.indexOf('apply') !== -1; }), false);
});

test('applyDisjointDiffs: dryRun → checks pass, applies nothing', function () {
  const good = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n+z\n';
  const run = fakeGit(function () { return { code: 0 }; });
  const r = wm.applyDisjointDiffs({ diffs: [good], cwd: '/p', dryRun: true, runGit: run });
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
  assert.equal(r.applied, 0);
  assert.equal(run.calls.every(function (c) { return c.args.indexOf('--check') !== -1; }), true);
});

test('applyDisjointDiffs: mid-apply fail → reverse-applies what it applied', function () {
  const d0 = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n+z\n';
  const d1 = 'diff --git a/y b/y\n--- a/y\n+++ b/y\n@@\n+w\n';
  let applyN = 0;
  const run = fakeGit(function (args) {
    if (args.indexOf('--check') !== -1) return { code: 0 };
    if (args.indexOf('-R') !== -1) return { code: 0 };       // rollback ok
    if (args.indexOf('apply') !== -1) {                       // forward apply
      applyN += 1;
      return applyN === 1 ? { code: 0 } : { code: 1, stderr: 'boom' };
    }
    return { code: 0 };
  });
  const r = wm.applyDisjointDiffs({ diffs: [d0, d1], cwd: '/p', runGit: run });
  assert.equal(r.ok, false);
  assert.equal(r.applied, 0);
  assert.match(r.error, /rolled back 1/);
  assert.ok(run.calls.some(function (c) { return c.args.indexOf('-R') !== -1; }));
});

test('rollbackApplied: reverse order, best-effort past a failure', function () {
  const p0 = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n+z\n';
  const p1 = 'diff --git a/y b/y\n--- a/y\n+++ b/y\n@@\n+w\n';
  const order = [];
  const run = fakeGit(function (args, opts) {
    if (args.indexOf('-R') !== -1) { order.push(opts.input); return { code: 0 }; }
    return { code: 0 };
  });
  const r = wm.rollbackApplied({ appliedPatches: [p0, p1], cwd: '/p', runGit: run });
  assert.equal(r.ok, true);
  assert.equal(r.reversed, 2);
  assert.deepEqual(order, [p1, p0]); // reverse order

  // best-effort: a failing reverse is recorded, others still attempted
  const run2 = fakeGit(function (args) {
    if (args.indexOf('-R') !== -1) return { code: 1, stderr: 'x' };
    return { code: 0 };
  });
  const r2 = wm.rollbackApplied({ appliedPatches: [p0, p1], cwd: '/p', runGit: run2 });
  assert.equal(r2.ok, false);
  assert.equal(r2.failed.length, 2);
});

// ── real-git integration (temp repo, 2 worktrees) ─────────────────────────────

function git(args, cwd, input) {
  return spawnSync('git', args, { cwd: cwd, encoding: 'utf8', input: input });
}

function setupRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-int-'));
  git(['init', '-q', '-b', 'main', '.'], root);
  git(['config', 'user.email', 's@e.com'], root);
  git(['config', 'user.name', 'spike'], root);
  git(['config', 'commit.gpgsign', 'false'], root);
  git(['config', 'core.autocrlf', 'false'], root); // deterministic LF (Windows)
  fs.writeFileSync(path.join(root, 'a.txt'), 'alpha base\n');
  fs.writeFileSync(path.join(root, 'b.txt'), 'beta base\n');
  fs.writeFileSync(path.join(root, 'parent.txt'), 'parent-owned\n');
  git(['add', '-A'], root);
  git(['commit', '-qm', 'base'], root);
  return root;
}

function rimraf(t) { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} }

test('real-git: collect → assert clean → apply → rollback preserves parent dirty + untracked (F4)', function (t) {
  const probe = git(['--version']);
  if (probe.status !== 0) { t.skip('git not available'); return; }
  const root = setupRepo();
  try {
    const base = git(['rev-parse', 'HEAD'], root).stdout.trim();
    // two isolated worktrees (mimic agent-<uuid>)
    git(['worktree', 'add', '-q', '-b', 'wt-1', '.wt/a1', base], root);
    git(['worktree', 'add', '-q', '-b', 'wt-2', '.wt/a2', base], root);
    const wt1 = path.join(root, '.wt', 'a1');
    const wt2 = path.join(root, '.wt', 'a2');

    // disjoint edits, staged (mods + add + delete-free), matches spike proof
    fs.writeFileSync(path.join(wt1, 'a.txt'), 'alpha CHANGED\n');
    fs.writeFileSync(path.join(wt1, 'new1.txt'), 'new from w1\n');
    git(['add', '-A'], wt1);
    fs.writeFileSync(path.join(wt2, 'b.txt'), 'beta CHANGED\n');
    git(['add', '-A'], wt2);

    // envelopes for correlation
    fs.mkdirSync(path.join(wt1, '.claude', 'state', 'dispatches'), { recursive: true });
    fs.writeFileSync(path.join(wt1, '.claude', 'state', 'dispatches', 'id-1.envelope.json'), '{}');
    fs.mkdirSync(path.join(wt2, '.claude', 'state', 'dispatches'), { recursive: true });
    fs.writeFileSync(path.join(wt2, '.claude', 'state', 'dispatches', 'id-2.envelope.json'), '{}');

    // buildWorktreeMap over the real worktrees (default fs reader)
    const map = wm.buildWorktreeMap({
      worktrees: [{ path: wt1 }, { path: wt2 }],
      dispatchIds: ['id-1', 'id-2'],
    });
    assert.equal(map.map['id-1'], wt1);
    assert.equal(map.map['id-2'], wt2);
    assert.deepEqual(map.missing, []);

    // collect diffs
    const c1 = wm.collectWorkerDiff(wt1);
    const c2 = wm.collectWorkerDiff(wt2);
    assert.equal(c1.ok, true);
    assert.equal(c1.empty, false);
    assert.ok(c1.files.indexOf('a.txt') !== -1);
    assert.ok(c1.files.indexOf('new1.txt') !== -1);
    assert.ok(c2.files.indexOf('b.txt') !== -1);

    // pre-apply clean assert on target paths (parent still clean here)
    const clean = wm.assertPathsClean({ paths: ['a.txt', 'b.txt', 'new1.txt'], cwd: root });
    assert.equal(clean.clean, true);

    // introduce PRE-EXISTING parent state (F4): dirty tracked + untracked
    fs.writeFileSync(path.join(root, 'parent.txt'), 'parent-owned DIRTY\n');
    fs.writeFileSync(path.join(root, 'user-untracked.txt'), 'user scratch\n');

    // dry-run check then real apply
    const dry = wm.applyDisjointDiffs({ diffs: [c1.diff, c2.diff], cwd: root, dryRun: true });
    assert.equal(dry.ok, true);
    const applied = wm.applyDisjointDiffs({ diffs: [c1.diff, c2.diff], cwd: root });
    assert.equal(applied.ok, true);
    assert.equal(applied.applied, 2);
    assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'alpha CHANGED\n');
    assert.equal(fs.readFileSync(path.join(root, 'b.txt'), 'utf8'), 'beta CHANGED\n');
    assert.ok(fs.existsSync(path.join(root, 'new1.txt')));

    // patch-scoped rollback
    const rb = wm.rollbackApplied({ appliedPatches: applied.appliedPatches, cwd: root });
    assert.equal(rb.ok, true);
    assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'alpha base\n');
    assert.equal(fs.readFileSync(path.join(root, 'b.txt'), 'utf8'), 'beta base\n');
    assert.equal(fs.existsSync(path.join(root, 'new1.txt')), false); // new file removed by -R

    // F4 rollback-safety — pre-existing dirty + untracked PRESERVED
    assert.equal(fs.readFileSync(path.join(root, 'parent.txt'), 'utf8'), 'parent-owned DIRTY\n');
    assert.equal(fs.existsSync(path.join(root, 'user-untracked.txt')), true);
  } finally {
    git(['worktree', 'remove', '--force', '.wt/a1'], root);
    git(['worktree', 'remove', '--force', '.wt/a2'], root);
    rimraf(root);
  }
});

test('real-git: assertPathsClean detects a pre-existing dirty target (HALT signal)', function (t) {
  const probe = git(['--version']);
  if (probe.status !== 0) { t.skip('git not available'); return; }
  const root = setupRepo();
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'dirty already\n');
    const r = wm.assertPathsClean({ paths: ['a.txt', 'b.txt'], cwd: root });
    assert.equal(r.clean, false);
    assert.deepEqual(r.dirty, ['a.txt']);
  } finally {
    rimraf(root);
  }
});
