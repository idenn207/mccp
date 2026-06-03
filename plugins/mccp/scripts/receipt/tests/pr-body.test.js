'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo } = require('./helpers');
const prBody = require('../pr-body');

test('bodyPath places file under .git/mccp/tmp/ with slug + short sha', function () {
  const repo = mkTmpRepo();
  try {
    const p = prBody.bodyPath(repo, 'feature-x', 'abc1234567890def');
    const expected = path.join(repo, '.git', 'mccp', 'tmp', 'pr-body-feature-x-abc123456789.md');
    assert.strictEqual(p, expected);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('bodyPath sanitizes slug characters', function () {
  const repo = mkTmpRepo();
  try {
    const p = prBody.bodyPath(repo, 'Feature/With Spaces!', 'sha12345');
    const base = path.basename(p);
    assert.ok(/^pr-body-feature-with-spaces--sha12345\.md$/.test(base), 'got: ' + base);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('writeBody creates the file and returns its path', function () {
  const repo = mkTmpRepo();
  try {
    const content = '# PR Body\n\nMulti-line content\nwith newlines.\n';
    const written = prBody.writeBody(repo, 'feature-x', 'abc1234567', content);
    assert.ok(fs.existsSync(written));
    assert.strictEqual(fs.readFileSync(written, 'utf8'), content);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('writeBody overwrites existing body atomically', function () {
  const repo = mkTmpRepo();
  try {
    const target = prBody.writeBody(repo, 'feature-x', 'abc1234567', 'first\n');
    const target2 = prBody.writeBody(repo, 'feature-x', 'abc1234567', 'second\n');
    assert.strictEqual(target, target2);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'second\n');
    // No staging files left behind.
    const dir = path.dirname(target);
    const leftover = fs.readdirSync(dir).filter(function (n) { return n.indexOf('.tmp-') !== -1; });
    assert.deepStrictEqual(leftover, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('readBody returns null when file does not exist', function () {
  const repo = mkTmpRepo();
  try {
    assert.strictEqual(prBody.readBody(repo, 'nope', 'abc1234'), null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('readBody returns content after writeBody', function () {
  const repo = mkTmpRepo();
  try {
    prBody.writeBody(repo, 'feature-x', 'abc1234567', 'body text');
    assert.strictEqual(prBody.readBody(repo, 'feature-x', 'abc1234567'), 'body text');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('deleteBody removes the file and returns true; false when absent', function () {
  const repo = mkTmpRepo();
  try {
    prBody.writeBody(repo, 'feature-x', 'abc1234567', 'doomed');
    assert.strictEqual(prBody.deleteBody(repo, 'feature-x', 'abc1234567'), true);
    assert.strictEqual(prBody.deleteBody(repo, 'feature-x', 'abc1234567'), false);
    assert.strictEqual(prBody.readBody(repo, 'feature-x', 'abc1234567'), null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('sweepStale removes only files older than the age cap', function () {
  const repo = mkTmpRepo();
  try {
    const fresh = prBody.writeBody(repo, 'feature-x', 'abc1234567', 'fresh');
    const old = prBody.writeBody(repo, 'feature-y', 'def4567890', 'old');
    // Backdate the "old" file.
    const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    fs.utimesSync(old, past, past);
    const removed = prBody.sweepStale(repo, 7 * 24 * 60 * 60 * 1000);
    assert.deepStrictEqual(removed, [old]);
    assert.ok(fs.existsSync(fresh));
    assert.ok(!fs.existsSync(old));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('sweepStale on missing dir returns empty list (no crash)', function () {
  const repo = mkTmpRepo();
  try {
    // .git/mccp/tmp does not exist yet.
    const removed = prBody.sweepStale(repo);
    assert.deepStrictEqual(removed, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('writeBody handles empty content', function () {
  const repo = mkTmpRepo();
  try {
    const target = prBody.writeBody(repo, 'feature-x', 'abc1234567', '');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('writeBody handles null/undefined content as empty string', function () {
  const repo = mkTmpRepo();
  try {
    const target = prBody.writeBody(repo, 'feature-x', 'abc1234567', null);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// Worktree compatibility — Q5 followup for v0.2.3.
//
// In a worktree, `<wt>/.git` is a file containing `gitdir: <path>` pointing at
// `<main-repo>/.git/worktrees/<wt-name>`. The pre-fix code joined
// `<wt>/.git/mccp/tmp` and tried `mkdirSync`, which fails ENOTDIR because
// `.git` is a file. The fix reads the pointer and redirects to the real
// per-worktree git directory.

const { execFileSync } = require('child_process');

function mkTmpWorktree(mainRepo, name) {
  const wt = path.join(path.dirname(mainRepo), 'wt-' + name + '-' + Date.now());
  execFileSync('git', ['worktree', 'add', '-b', 'wt-' + name, wt], {
    cwd: mainRepo,
    stdio: 'ignore',
  });
  return wt;
}

test('gitDir: main repo case returns <repo>/.git directory', function () {
  const repo = mkTmpRepo();
  try {
    const dir = prBody.gitDir(repo);
    assert.strictEqual(dir, path.join(repo, '.git'));
    assert.ok(fs.statSync(dir).isDirectory());
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('gitDir: worktree case follows gitdir: pointer to real git dir', function () {
  const repo = mkTmpRepo();
  let wt;
  try {
    wt = mkTmpWorktree(repo, 'gitdir');
    const dir = prBody.gitDir(wt);
    // The real dir lives under the main repo, not under the worktree
    assert.ok(dir.includes('worktrees'), 'expected gitDir to land in worktrees/: ' + dir);
    assert.ok(fs.statSync(dir).isDirectory(), 'gitDir target must be a directory');
    // Sanity: the worktree's own .git path is a file, not a dir
    const wtDotGit = path.join(wt, '.git');
    assert.ok(fs.statSync(wtDotGit).isFile(), '.git in a worktree must be a file pointer');
  } finally {
    if (wt) try { fs.rmSync(wt, { recursive: true, force: true }); } catch (_e) {}
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch (_e) {}
  }
});

test('writeBody in worktree no longer fails with ENOTDIR (regression)', function () {
  const repo = mkTmpRepo();
  let wt;
  try {
    wt = mkTmpWorktree(repo, 'writebody');
    const target = prBody.writeBody(wt, 'feature-y', 'cafebabecafe', '# hello from worktree\n');
    assert.ok(fs.existsSync(target));
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '# hello from worktree\n');
    // Round-trip via readBody + deleteBody
    assert.strictEqual(prBody.readBody(wt, 'feature-y', 'cafebabecafe'), '# hello from worktree\n');
    assert.strictEqual(prBody.deleteBody(wt, 'feature-y', 'cafebabecafe'), true);
    assert.ok(!fs.existsSync(target));
  } finally {
    if (wt) try { fs.rmSync(wt, { recursive: true, force: true }); } catch (_e) {}
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch (_e) {}
  }
});

test('writeBody under main repo still places file under <repo>/.git/mccp/tmp', function () {
  const repo = mkTmpRepo();
  try {
    const target = prBody.writeBody(repo, 'feature-main', 'deadbeef0000', 'main repo body');
    // The fix must not regress the main-repo placement
    assert.ok(target.startsWith(path.join(repo, '.git', 'mccp', 'tmp')), 'got: ' + target);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'main repo body');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
