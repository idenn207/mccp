'use strict';

// Recurrence guard for the worktree-unsafe `.git/mccp/tmp` literal (§3.8).
//
// In a git worktree, `.git` is a FILE (a `gitdir:` pointer), not a directory,
// so a literal `mkdir -p .git/mccp/tmp` fails with ENOTDIR and any redirect
// into that path fails too. Commands must resolve the real per-worktree gitdir
// via `git rev-parse --git-dir` (or `--git-path mccp/tmp`) instead.
//
// Two axes (per plan Task 6, Codex F1):
//   A (static)    — no command markdown's executable bash uses the literal.
//   B (usability) — the gitdir-resolved form actually works in a worktree, the
//                   literal actually breaks there, and a redirect WITHOUT a
//                   same-block mkdir still breaks (the F1 concern that a naive
//                   literal-removal misses — parent dir absence, not the literal).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..'); // plugins/mccp/
const COMMANDS_DIR = path.join(PLUGIN_ROOT, 'commands');

// --- Axis A: static scan of executable bash lines -------------------------

// Return { n, text } for every line inside a ```bash|sh|shell fenced block,
// excluding comment-only lines (first non-ws char is `#`). The guard targets
// executable mkdir/redirect statements, not explanatory comments (e.g.
// pr.md's comment that literally spells out `.git/mccp/tmp` to warn against it)
// or prose using the `<gitdir>/mccp/tmp` placeholder.
function bashLines(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inBash = false;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^\s*```(\w*)/);
    if (fence) {
      inBash = !inBash && /^(bash|sh|shell)$/.test(fence[1]);
      continue;
    }
    if (!inBash) continue;
    if (lines[i].replace(/^\s+/, '').startsWith('#')) continue; // comment — whitelisted
    out.push({ n: i + 1, text: lines[i] });
  }
  return out;
}

const LITERAL_MKDIR = /mkdir\s+-p\s+\.git\/mccp\/tmp/;
const LITERAL_REDIRECT = /[0-9]*>>?\s*\.git\/mccp\/tmp\//;

function offendingLines(md) {
  return bashLines(md).filter(function (l) {
    return LITERAL_MKDIR.test(l.text) || LITERAL_REDIRECT.test(l.text);
  });
}

test('Axis A — no command markdown uses a literal .git/mccp/tmp in executable bash', function () {
  const files = fs.readdirSync(COMMANDS_DIR).filter(function (f) { return f.endsWith('.md'); });
  assert.ok(files.length > 0, 'expected command markdown files under ' + COMMANDS_DIR);
  const offenders = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(COMMANDS_DIR, f), 'utf8');
    for (const l of offendingLines(md)) offenders.push(f + ':' + l.n + '  ' + l.text.trim());
  }
  assert.deepStrictEqual(
    offenders,
    [],
    'worktree-unsafe literal .git/mccp/tmp in executable bash:\n' + offenders.join('\n')
  );
});

// Self-check — a recurrence guard whose matcher silently matches nothing is a
// false-green. Prove the matcher flags both forms and ignores the safe forms.
test('Axis A self-check — matcher flags mkdir + redirect literals, ignores safe/comment forms', function () {
  const sample = [
    '```bash',
    'mkdir -p .git/mccp/tmp', // flagged
    'node foo.js 2> .git/mccp/tmp/x.stderr', // flagged
    '# a comment mentioning .git/mccp/tmp is ignored', // comment
    'echo "<gitdir>/mccp/tmp"', // prose placeholder
    'MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"', // safe
    'mkdir -p "$MCCP_TMP"', // safe
    '```',
  ].join('\n');
  assert.strictEqual(offendingLines(sample).length, 2);
});

// --- Axis B: usability in an actual worktree ------------------------------

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-cmd-tmp-test-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function mkTmpWorktree(mainRepo, name) {
  const wt = path.join(path.dirname(mainRepo), 'wt-' + name + '-' + process.pid + '-' + mainRepo.slice(-6));
  execFileSync('git', ['worktree', 'add', '-b', 'wt-' + name + '-' + process.pid, wt], {
    cwd: mainRepo,
    stdio: 'ignore',
  });
  return wt;
}

function cleanup(repo, wt) {
  if (wt) {
    try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repo, stdio: 'ignore' }); } catch (_e) {}
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch (_e) {}
  }
  try { fs.rmSync(repo, { recursive: true, force: true }); } catch (_e) {}
}

// Resolve the tmp dir exactly the way a migrated command does: `$(git rev-parse
// --git-dir)/mccp/tmp`. In a linked worktree this is the absolute path under
// <main>/.git/worktrees/<name>, so path.resolve honors either abs or rel output.
function resolveMccpTmp(cwd) {
  const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: cwd, encoding: 'utf8' }).trim();
  return path.resolve(cwd, gitDir, 'mccp', 'tmp');
}

// All Axis B assertions share ONE worktree — worktree add/remove is the
// expensive part (~seconds), so consolidating keeps the suite fast and avoids
// piling git-worktree load onto timing-sensitive tests elsewhere. Ordering is
// deliberate: the parent-dir-absent checks run before the positive mkdir.
test('Axis B — worktree usability: literal breaks, gitdir-resolved works, mkdir is load-bearing', function () {
  const repo = mkTmpRepo();
  let wt;
  try {
    wt = mkTmpWorktree(repo, 'usability');

    // (1) The condition that breaks the literal: `.git` is a FILE in a worktree.
    assert.ok(fs.statSync(path.join(wt, '.git')).isFile(), '.git in a worktree must be a file pointer');

    const mccpTmp = resolveMccpTmp(wt); // resolved but NOT yet created

    // (2) F1 — a redirect WITHOUT a prior mkdir fails (parent-dir absence). This
    // is the failure a naive literal-removal misses; every tmp-write block must
    // mkdir first.
    let redirectFailed = false;
    try {
      fs.writeFileSync(path.join(mccpTmp, 'x.stderr'), 'err');
    } catch (_e) {
      redirectFailed = true; // ENOENT — parent dir absent
    }
    assert.ok(redirectFailed, 'redirect into an un-created tmp dir must fail (mandates same-block mkdir)');

    // (3) The literal anti-pattern itself fails: `.git` is a file, so creating
    // `.git/mccp/tmp` under it fails with ENOTDIR — proving the fix is load-bearing.
    let literalFailed = false;
    try {
      fs.mkdirSync(path.join(wt, '.git', 'mccp', 'tmp'), { recursive: true });
    } catch (_e) {
      literalFailed = true;
    }
    assert.ok(literalFailed, 'literal .git/mccp/tmp mkdir must fail in a worktree');

    // (4) The gitdir-resolved form (what the migrated commands use) succeeds:
    // mkdir the resolved tmp, then the same redirect write lands.
    fs.mkdirSync(mccpTmp, { recursive: true }); // mirrors `mkdir -p "$MCCP_TMP"`
    fs.writeFileSync(path.join(mccpTmp, 'smoke.stderr'), 'err'); // mirrors `... 2> "$MCCP_TMP/…"`
    assert.ok(fs.existsSync(path.join(mccpTmp, 'smoke.stderr')), 'redirect target writable after mkdir');
    assert.ok(fs.statSync(mccpTmp).isDirectory(), 'resolved MCCP_TMP must be a directory');
    assert.ok(mccpTmp.includes('worktrees'), 'gitdir-resolved tmp should land under worktrees/: ' + mccpTmp);
  } finally {
    cleanup(repo, wt);
  }
});
