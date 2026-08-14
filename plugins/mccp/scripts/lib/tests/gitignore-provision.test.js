'use strict';

// gitignore-provision tests.
//
// This file is the SINGLE owner of three checks that live nowhere else:
//   1. the bidirectional canonical <-> repo .gitignore drift lint (DD3),
//   2. the setup.md Phase 5 contract lint (16 items — the plan's Task 3 Validate
//      table plus the reporting-side items the review rounds added),
//   3. the gitignore-drift workflow trigger lint.
// .github/workflows/gitignore-drift.yml registers this file in CI, which is
// what turns all three from advisory into enforced.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const gp = require('../gitignore-provision');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const CLI = path.join(REPO_ROOT, 'plugins', 'mccp', 'scripts', 'lib', 'gitignore-provision.js');
const SETUP_MD = path.join(REPO_ROOT, 'plugins', 'mccp', 'commands', 'setup.md');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'gitignore-drift.yml');
const PLUGIN_JSON = path.join(REPO_ROOT, 'plugins', 'mccp', '.claude-plugin', 'plugin.json');

const VERSION = require(PLUGIN_JSON).version;
const POSIX = process.platform !== 'win32';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-gitignore-'));
  try {
    return fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

function initRepo(dir) {
  const r = spawnSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'git init failed: ' + (r.stderr || r.error));
}

function withTempRepo(fn) {
  return withTempDir((dir) => {
    initRepo(dir);
    return fn(dir, path.join(dir, '.gitignore'));
  });
}

// Async sibling. The sync helper tears the directory down as soon as its
// callback returns, which would delete the repo out from under a child process
// that has not started yet — the child then fails with a misleading
// git-unavailable instead of exercising the lock.
async function withTempRepoAsync(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-gitignore-'));
  try {
    initRepo(dir);
    return await fn(dir, path.join(dir, '.gitignore'));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

// Windows hands out 8.3 short paths (ADMINI~1) from os.tmpdir() while git
// reports the long form, so raw string comparison of paths is meaningless here.
function samePath(a, b) {
  const norm = (p) => {
    let out = p;
    try { out = fs.realpathSync.native(p); } catch (_e) {
      try { out = fs.realpathSync(p); } catch (_e2) { /* keep as-is */ }
    }
    return path.resolve(out).toLowerCase();
  };
  return norm(a) === norm(b);
}

function runCli(args, opts) {
  const o = opts || {};
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    cwd: o.cwd || REPO_ROOT,
    env: Object.assign({}, process.env, o.env || {}),
  });
}

function cliJson(res) {
  try { return JSON.parse(res.stdout); } catch (_e) { return null; }
}

// ---------------------------------------------------------------------------
// parseEntries
// ---------------------------------------------------------------------------

test('parseEntries: drops blank + leading-# lines, trims', () => {
  const out = gp.parseEntries('  a/  \n\n# comment\n b \n');
  assert.deepStrictEqual(out, ['a/', 'b']);
});

test('parseEntries: inline # is a literal, never truncated (gitignore spec)', () => {
  const out = gp.parseEntries('foo#bar\n*.log #keep\n#dropped\n');
  assert.deepStrictEqual(out, ['foo#bar', '*.log #keep']);
});

// ---------------------------------------------------------------------------
// locateManagedBlock / stripManagedBlock
// ---------------------------------------------------------------------------

const B = gp.BEGIN_MARKER;
const E = gp.END_MARKER;

const DAMAGED_CASES = [
  ['begin only', ['user/', B, 'x/']],
  ['end only', ['user/', E, 'x/']],
  ['two begins one end', [B, 'orphan/', B, 'blk/', E]],
  ['end before begin', [E, 'mid/', B]],
];

test('locateManagedBlock: absent / wellFormed', () => {
  assert.deepStrictEqual(gp.locateManagedBlock(['a/', 'b/']), { state: 'absent' });
  const ok = gp.locateManagedBlock(['a/', B, 'x/', E, 'b/']);
  assert.strictEqual(ok.state, 'wellFormed');
  assert.strictEqual(ok.beginIdx, 1);
  assert.strictEqual(ok.endIdx, 3);
});

for (const [label, lines] of DAMAGED_CASES) {
  test('locateManagedBlock: damaged — ' + label, () => {
    assert.strictEqual(gp.locateManagedBlock(lines).state, 'damaged');
  });

  test('stripManagedBlock: damaged input returned verbatim — ' + label, () => {
    const text = lines.join('\n') + '\n';
    assert.strictEqual(gp.stripManagedBlock(text), text);
  });

  test('planMerge: damaged input throws marker-damaged — ' + label, () => {
    const text = lines.join('\n') + '\n';
    assert.throws(
      () => gp.planMerge({ content: text, version: VERSION }),
      (err) => err instanceof gp.ProvisionError && err.reason === gp.REASONS.MARKER_DAMAGED
    );
  });
}

test('stripManagedBlock: wellFormed input leaves no marker lines behind', () => {
  const text = ['user/', B, '# managed', 'x/', E, 'tail/'].join('\n') + '\n';
  const stripped = gp.stripManagedBlock(text);
  assert.ok(!stripped.includes(B), 'BEGIN marker survived');
  assert.ok(!stripped.includes(E), 'END marker survived');
  assert.deepStrictEqual(gp.parseEntries(stripped), ['user/', 'tail/']);
});

// ---------------------------------------------------------------------------
// buildBlock / version
// ---------------------------------------------------------------------------

test('buildBlock: records the plugin.json version in the marker comment (DD4-Q4)', () => {
  const block = gp.buildBlock(VERSION);
  assert.ok(block.includes('# managed by /mccp:setup (mccp ' + VERSION + ')'));
  assert.strictEqual(block[0], B);
  assert.strictEqual(block[block.length - 1], E);
});

test('buildBlock: ships the ORDER IS LOAD-BEARING comment', () => {
  // The only channel carrying the receipt-negation ordering invariant to a
  // future maintainer of an installed repo.
  assert.ok(gp.buildBlock(VERSION).some((l) => l.includes('ORDER IS LOAD-BEARING')));
});

test('readPluginVersion: missing file throws (never write a block with an unknown version)', () => {
  assert.throws(
    () => gp.readPluginVersion(path.join(os.tmpdir(), 'mccp-no-such-plugin-' + process.pid + '.json')),
    (err) => err instanceof gp.ProvisionError && err.reason === gp.REASONS.INTERNAL_ERROR
  );
});

test('readPluginVersion: broken JSON throws', () => {
  withTempDir((dir) => {
    const p = path.join(dir, 'plugin.json');
    fs.writeFileSync(p, '{ not json', 'utf8');
    assert.throws(
      () => gp.readPluginVersion(p),
      (err) => err instanceof gp.ProvisionError && err.reason === gp.REASONS.INTERNAL_ERROR
    );
  });
});

// ---------------------------------------------------------------------------
// planMerge semantics
// ---------------------------------------------------------------------------

test('planMerge: missing file -> create, block only', () => {
  const plan = gp.planMerge({ content: null, version: VERSION });
  assert.strictEqual(plan.action, 'create');
  assert.strictEqual(plan.sourceHash, null);
  assert.ok(plan.nextContent.startsWith(B));
});

test('block replacement preserves the target file mode (POSIX modes only)', { skip: !POSIX }, () => {
  // rename() swaps the inode, so the target inherits the tmp's mode. The tmp is
  // 0600 so it is never world-readable while being written — but if that mode
  // survives the swap, the user's 0644 .gitignore silently becomes owner-only
  // and a shared checkout or service account can no longer read it.
  withTempRepo((dir, target) => {
    seedStaleBlock(target);
    fs.chmodSync(target, 0o644);
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 0, res.stderr);
    assert.strictEqual(cliJson(res).action, 'update');
    assert.strictEqual(fs.statSync(target).mode & 0o777, 0o644, 'the swap changed the target file mode');
  });
});

test('buildBlock: the block warns that in-block edits are replaced', () => {
  // `update` rebuilds the whole marker span, so a rule added between the markers
  // does not survive. That is what a managed block IS, but "managed by" alone
  // does not tell the person about to edit there. This warning is the only
  // channel that reaches them, so it has to actually be in the shipped bytes.
  const block = gp.buildBlock(VERSION).join('\n');
  assert.ok(/REPLACED on the next \/mccp:setup run/.test(block), 'in-block edit warning is missing');
  assert.ok(/OUTSIDE the markers/.test(block), 'the warning does not say where user rules belong');
  // It must sit inside the markers, or a reader of the installed file never sees
  // it next to the lines it is warning about.
  const lines = gp.buildBlock(VERSION);
  const begin = lines.indexOf(gp.BEGIN_MARKER);
  const end = lines.indexOf(gp.END_MARKER);
  const warnAt = lines.findIndex((l) => /REPLACED on the next/.test(l));
  assert.ok(begin < warnAt && warnAt < end, 'the warning is outside the managed block');
});

test('planMerge: an update keeps each outside line\'s OWN terminator (mixed EOL)', () => {
  // Rebuilding the file from split(/\r?\n/) + join(eol) rewrote the terminator
  // of every line, so a mixed-ending file came back normalized — including the
  // user's lines outside the block. Now that `update` runs on a normal setup,
  // that would silently rewrite user-owned bytes on every canonical change.
  const stale = gp.planMerge({ content: 'a/\r\nb/\nc/\r\n', version: '0.0.1-stale' });
  const mixed = stale.nextContent;
  assert.ok(mixed.startsWith('a/\r\nb/\nc/\r\n'), 'fixture lost its mixed endings before the test began');

  const plan = gp.planMerge({ content: mixed, version: VERSION });
  assert.strictEqual(plan.action, 'update');
  assert.ok(
    plan.nextContent.startsWith('a/\r\nb/\nc/\r\n'),
    'outside-block terminators were normalized: ' + JSON.stringify(plan.nextContent.slice(0, 20))
  );
  assert.ok(plan.nextContent.includes('mccp ' + VERSION), 'the block was not refreshed');
  assert.strictEqual(gp.planMerge({ content: plan.nextContent, version: VERSION }).action, 'noop');
});

test('planMerge: an existing empty file lands the same bytes as a missing one', () => {
  // `create` (missing file) and `append` (existing but empty) describe the same
  // end state, so they must agree on the bytes. They used to differ by a leading
  // blank line — a line outside the managed block that no user wrote.
  const fromMissing = gp.planMerge({ content: null, version: VERSION });
  const fromEmpty = gp.planMerge({ content: '', version: VERSION });
  assert.strictEqual(fromEmpty.action, 'append');
  assert.ok(fromEmpty.nextContent.startsWith(B), 'append prefixed the block with a blank line');
  assert.strictEqual(fromEmpty.nextContent, fromMissing.nextContent);
  assert.strictEqual(
    gp.planMerge({ content: fromEmpty.nextContent, version: VERSION }).action,
    'noop',
    'the result of an empty-file append is not already current'
  );

  // The separator exists to keep the block off the user's last line, so removing
  // it where there IS content would be the opposite overcorrection.
  const fromContent = gp.planMerge({ content: 'user/\n', version: VERSION });
  assert.ok(
    fromContent.nextContent.startsWith('user/\n\n' + B),
    'the blank separator after real content was lost'
  );
});

test('planMerge: absent markers -> append, existing lines preserved as a prefix (UI2)', () => {
  const content = 'user-a/\nuser-b/\n';
  const plan = gp.planMerge({ content, version: VERSION });
  assert.strictEqual(plan.action, 'append');
  assert.ok(plan.nextContent.startsWith(content), 'existing bytes are not a prefix of the result');
});

test('planMerge: append payload always starts with a newline (never joins an unterminated line)', () => {
  const plan = gp.planMerge({ content: 'no-trailing-newline/', version: VERSION });
  assert.strictEqual(plan.action, 'append');
  assert.ok(plan.appendPayload.startsWith('\n'), 'payload must open with a newline');
  const lines = plan.nextContent.split('\n');
  assert.ok(lines.includes(B), 'BEGIN marker must start its own line');
});

test('planMerge: re-planning over its own output is noop (idempotent)', () => {
  const first = gp.planMerge({ content: 'user/\n', version: VERSION });
  const second = gp.planMerge({ content: first.nextContent, version: VERSION });
  assert.strictEqual(second.action, 'noop');
  assert.strictEqual(second.nextContent, first.nextContent);
});

test('planMerge: stale block -> update replaces only the marker span, outer indices unchanged', () => {
  const stale = gp.planMerge({ content: 'head/\ntail-marker/\n', version: '0.0.1-stale' });
  const plan = gp.planMerge({ content: stale.nextContent, version: VERSION });
  assert.strictEqual(plan.action, 'update');
  const before = stale.nextContent.split('\n');
  const after = plan.nextContent.split('\n');
  assert.strictEqual(after[0], before[0], 'first outer line moved');
  assert.strictEqual(after[1], before[1], 'second outer line moved');
  assert.ok(plan.nextContent.includes('# managed by /mccp:setup (mccp ' + VERSION + ')'));
  assert.ok(!plan.nextContent.includes('0.0.1-stale'));
});

test('planMerge: EOL is detected and preserved (CRLF in -> CRLF out, LF in -> LF out)', () => {
  const crlf = gp.planMerge({ content: 'user/\r\n', version: VERSION });
  assert.strictEqual(crlf.eol, '\r\n');
  assert.ok(crlf.nextContent.includes('\r\n' + B));
  assert.ok(!/[^\r]\n/.test(crlf.nextContent.replace(/\r\n/g, '')), 'stray LF in CRLF output');

  const lf = gp.planMerge({ content: 'user/\n', version: VERSION });
  assert.strictEqual(lf.eol, '\n');
  assert.ok(!lf.nextContent.includes('\r\n'), 'CR leaked into LF output');
});

test('planMerge: receipt lines keep their load-bearing order (negation after ignore)', () => {
  // A string-position assertion. What git actually ignores is asserted
  // separately by the check-ignore E2E below — these are different claims.
  const c = gp.planMerge({ content: null, version: VERSION }).nextContent;
  const iIgnore = c.indexOf('.claude/receipts/*');
  const iNegate = c.indexOf('!.claude/receipts/mccp-pr-codex/');
  const iLock = c.indexOf('.claude/receipts/mccp-pr-codex/*.lock');
  const iTmp = c.indexOf('.claude/receipts/mccp-pr-codex/*.tmp');
  assert.ok(iIgnore >= 0 && iNegate >= 0 && iLock >= 0 && iTmp >= 0, 'a receipt line is missing');
  assert.ok(iIgnore < iNegate, 'negation must follow the ignore');
  assert.ok(iNegate < iLock, 'lock re-ignore must follow the negation');
  assert.ok(iNegate < iTmp, 'tmp re-ignore must follow the negation');
});

// ---------------------------------------------------------------------------
// resolveRepoRoot — the 6-row stub table (only row 1 is a skip)
// ---------------------------------------------------------------------------

function stubOnce(result) {
  const calls = [];
  const spawnSyncStub = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return result;
  };
  return { calls, deps: { spawnSync: spawnSyncStub } };
}

const RESOLVE_ROWS = [
  [
    'git says not-a-repo -> skip',
    { status: 128, stderr: 'fatal: not a git repository (or any of the parent directories): .git' },
    gp.REASONS.NOT_A_GIT_REPO,
  ],
  [
    'spawn ENOENT -> git-unavailable',
    { error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }), status: null },
    gp.REASONS.GIT_UNAVAILABLE,
  ],
  [
    'killed by signal -> git-unavailable',
    { status: null, signal: 'SIGKILL', stderr: '' },
    gp.REASONS.GIT_UNAVAILABLE,
  ],
  [
    'dubious ownership -> git-error (NOT a skip)',
    { status: 128, stderr: "fatal: detected dubious ownership in repository at '/repo'" },
    gp.REASONS.GIT_ERROR,
  ],
  [
    'corrupt repo quoting the phrase -> git-error (NOT a skip)',
    { status: 128, stderr: 'fatal: not a git repository: .git/modules/x (broken)' },
    gp.REASONS.GIT_ERROR,
  ],
  [
    'misuse status 129 -> git-error',
    { status: 129, stderr: 'usage: git rev-parse ...' },
    gp.REASONS.GIT_ERROR,
  ],
];

for (const [label, stubResult, expected] of RESOLVE_ROWS) {
  test('resolveRepoRoot: ' + label, () => {
    const { deps } = stubOnce(stubResult);
    const out = gp.resolveRepoRoot('/anywhere', deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, expected);
  });
}

test('resolveRepoRoot: exactly one row of the table is a non-error skip', () => {
  const skips = RESOLVE_ROWS.filter(([, , reason]) => reason === gp.REASONS.NOT_A_GIT_REPO);
  assert.strictEqual(skips.length, 1, 'fail-open regression: more than one row maps to skip');
});

test('resolveRepoRoot: success returns the trimmed toplevel', () => {
  const { deps } = stubOnce({ status: 0, stdout: '/some/repo\n', stderr: '' });
  assert.deepStrictEqual(gp.resolveRepoRoot('/anywhere', deps), { ok: true, root: '/some/repo' });
});

test('resolveRepoRoot: pins locale (LC_ALL=C) and forwards cwd', () => {
  const { calls, deps } = stubOnce({ status: 0, stdout: '/r\n' });
  gp.resolveRepoRoot('/target-dir', deps);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].opts.env.LC_ALL, 'C', 'translated stderr would break classification');
  assert.strictEqual(calls[0].opts.env.LANG, 'C');
  assert.strictEqual(calls[0].opts.cwd, '/target-dir', '--repo is cosmetic without cwd');
});

test('detectTrackedPollution: failure returns a sentinel, never throws (DD4-Q2)', () => {
  const { deps } = stubOnce({ status: 128, stderr: 'fatal: whatever' });
  const out = gp.detectTrackedPollution('/r', deps);
  assert.strictEqual(out.ok, false);
  assert.deepStrictEqual(out.files, []);
});

test('detectTrackedPollution: parses the file list on success', () => {
  const { deps } = stubOnce({ status: 0, stdout: 'a.json\nb.json\n' });
  assert.deepStrictEqual(gp.detectTrackedPollution('/r', deps).files, ['a.json', 'b.json']);
});

// ---------------------------------------------------------------------------
// Real write E2E
// ---------------------------------------------------------------------------

test('E2E: create then re-run is noop, byte-identical, and writes no .bak', () => {
  withTempRepo((dir, target) => {
    const first = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(first.status, 0, first.stderr);
    assert.strictEqual(cliJson(first).action, 'create');

    const afterFirst = fs.readFileSync(target, 'utf8');
    const second = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(second.status, 0, second.stderr);
    assert.strictEqual(cliJson(second).action, 'noop');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), afterFirst, 'noop rewrote the file');

    // create/append never do a whole-file replace, so there is nothing to back up.
    assert.ok(!fs.existsSync(target + '.bak'), '.bak must not exist on the create path');
    assert.ok(!fs.existsSync(target + '.lock'), 'lock was not released');
  });
});

test('E2E: append preserves every existing byte as a prefix (UI2) and writes no .bak', () => {
  withTempRepo((dir, target) => {
    const before = 'my-own-rule/\n# my own comment\nsecond/\n';
    fs.writeFileSync(target, before, 'utf8');
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 0, res.stderr);
    assert.strictEqual(cliJson(res).action, 'append');
    const after = fs.readFileSync(target, 'utf8');
    assert.ok(after.startsWith(before), 'existing bytes are no longer a prefix');
    assert.ok(!fs.existsSync(target + '.bak'), '.bak must not exist on the append path');
  });
});

test('E2E: git actually tracks the ship receipt and ignores the rest', () => {
  withTempRepo((dir) => {
    assert.strictEqual(runCli(['provision', '--repo', dir, '--json']).status, 0);
    const mk = (rel) => {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, '', 'utf8');
      return rel.split(path.sep).join('/');
    };
    const ship = mk(path.join('.claude', 'receipts', 'mccp-pr-codex', 'x.json'));
    const shipLock = mk(path.join('.claude', 'receipts', 'mccp-pr-codex', 'x.lock'));
    const shipTmp = mk(path.join('.claude', 'receipts', 'mccp-pr-codex', 'x.tmp'));
    const planReceipt = mk(path.join('.claude', 'receipts', 'mccp-plan-codex', 'x.json'));
    const stateLock = mk(path.join('.claude', 'state', 'foo.lock'));
    const cache = mk(path.join('.claude', 'cache', 'x'));

    // Positive case needs the stronger assertion: check-ignore only proves
    // "not ignored", which is weaker than the PRD's "tracked" metric.
    const add = spawnSync('git', ['-C', dir, 'add', '--', ship], { encoding: 'utf8' });
    assert.strictEqual(add.status, 0, add.stderr);
    const staged = spawnSync('git', ['-C', dir, 'ls-files', '--stage', '--', ship], { encoding: 'utf8' });
    assert.strictEqual(staged.status, 0);
    assert.ok(staged.stdout.trim().length > 0, 'ship receipt is not tracked — audit corpus would be lost');

    for (const rel of [shipLock, shipTmp, planReceipt, stateLock, cache]) {
      const r = spawnSync('git', ['-C', dir, 'check-ignore', '-q', rel], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, rel + ' should be ignored but is not');
    }
  });
});

test("E2E: the provisioner's own byproducts are ignored, not left in git status", () => {
  // The tool exists to keep runtime artifacts out of git. Its own lock, atomic
  // tmp, and block-replacement .bak are runtime artifacts, and the .bak is a
  // verbatim copy of the user's file that persists by design.
  withTempRepo((dir) => {
    assert.strictEqual(runCli(['provision', '--repo', dir, '--json']).status, 0);
    const mk = (rel) => {
      fs.writeFileSync(path.join(dir, rel), '', 'utf8');
      return rel;
    };
    for (const rel of [
      mk('.gitignore.lock'),
      mk('.gitignore.bak'),
      mk('.gitignore.4242.0123456789ab.tmp'),
    ]) {
      const r = spawnSync('git', ['-C', dir, 'check-ignore', '-q', rel], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, rel + ' is not ignored — the provisioner pollutes git status');
    }
  });
});

test('pollution: reported for write actions, scoped to the repo root and not to cwd', () => {
  withTempRepo((dir, target) => {
    // A file that is tracked BEFORE the rules land, and that the rules then
    // ignore. It lives at the repo root; the CLI is invoked from a subdirectory.
    const receipt = path.join(dir, '.claude', 'receipts', 'mccp-plan-codex', 'x.json');
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    fs.writeFileSync(receipt, '{}', 'utf8');
    const add = spawnSync('git', ['-C', dir, 'add', '-f', '--', '.claude/receipts/mccp-plan-codex/x.json'], { encoding: 'utf8' });
    assert.strictEqual(add.status, 0, add.stderr);

    const sub = path.join(dir, 'nested', 'deeper');
    fs.mkdirSync(sub, { recursive: true });

    const res = runCli(['provision', '--repo', dir, '--json'], { cwd: sub });
    assert.strictEqual(res.status, 0, res.stderr);
    const j = cliJson(res);
    assert.strictEqual(j.action, 'create');
    assert.ok(j.pollution, 'write actions must report a pollution result');
    assert.strictEqual(j.pollution.ok, true, 'the scan itself failed');
    assert.ok(
      j.pollution.files.includes('.claude/receipts/mccp-plan-codex/x.json'),
      'root-level pollution missed from a subdirectory invocation: ' + JSON.stringify(j.pollution.files)
    );
    assert.ok(fs.readFileSync(target, 'utf8').includes(gp.BEGIN_MARKER));
  });
});

test('pollution: reports only what OUR rules ignore, not what the user already ignored', () => {
  // The caller presents every reported path as newly ignored by this run and
  // tells the user to `git rm --cached` it. Scanning with --exclude-standard
  // evaluated the repo's whole ignore configuration, so a file the user had
  // already tracked AND already ignored by their own rule would show up here and
  // the user would be advised to untrack a file this tool never touched.
  withTempRepo((dir, target) => {
    fs.writeFileSync(target, 'user-secret-notes/\n', 'utf8');
    fs.mkdirSync(path.join(dir, 'user-secret-notes'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'user-secret-notes', 'a.txt'), 'mine\n', 'utf8');
    fs.mkdirSync(path.join(dir, '.claude', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'cache', 'x.json'), '{}\n', 'utf8');
    // -f: both are ignored by one rule set or the other, so a plain add is a no-op.
    const add = spawnSync('git', ['-C', dir, 'add', '-f', 'user-secret-notes/a.txt', '.claude/cache/x.json'], { encoding: 'utf8' });
    assert.strictEqual(add.status, 0, 'git add failed: ' + (add.stderr || add.error));

    const j = cliJson(runCli(['provision', '--repo', dir, '--json']));
    assert.strictEqual(j.pollution.ok, true, 'the scan itself failed');
    assert.ok(
      j.pollution.files.includes('.claude/cache/x.json'),
      'a file ignored by OUR canonical rule was not reported: ' + JSON.stringify(j.pollution.files)
    );
    assert.ok(
      !j.pollution.files.includes('user-secret-notes/a.txt'),
      'reported a file ignored solely by the user\'s own rule: ' + JSON.stringify(j.pollution.files)
    );
  });
});

test('pollution: null when nothing new became ignored (skip / noop / dry-run)', () => {
  withTempDir((nonRepo) => {
    assert.strictEqual(cliJson(runCli(['provision', '--repo', nonRepo, '--json'])).pollution, null);
  });
  withTempRepo((dir) => {
    assert.strictEqual(runCli(['provision', '--repo', dir, '--json']).status, 0);
    assert.strictEqual(cliJson(runCli(['provision', '--repo', dir, '--json'])).pollution, null, 'noop scanned anyway');
    assert.strictEqual(cliJson(runCli(['provision', '--repo', dir, '--dry-run', '--json'])).pollution, null);
  });
});

test('pollution: a failed scan is a sentinel, never a failed provisioning', () => {
  // Detection is extra information, not a precondition: a broken scan must not
  // turn a completed write into an error.
  withTempRepo((dir) => {
    const out = gp.provision({
      repo: dir,
      deps: {
        spawnSync: (cmd, args, opts) => (args[0] === 'ls-files'
          ? { status: 128, stderr: 'fatal: whatever' }
          : spawnSync(cmd, args, opts)),
      },
    });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.action, 'create');
    assert.strictEqual(out.pollution.ok, false);
    assert.deepStrictEqual(out.pollution.files, []);
  });
});

test('E2E: other ignore channels are untouched (UI4)', () => {
  withTempRepo((dir) => {
    const exclude = path.join(dir, '.git', 'info', 'exclude');
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.writeFileSync(exclude, '# user sentinel\n', 'utf8');
    const beforeBytes = fs.readFileSync(exclude);

    assert.strictEqual(runCli(['provision', '--repo', dir, '--json']).status, 0);

    assert.ok(beforeBytes.equals(fs.readFileSync(exclude)), '.git/info/exclude was modified');
    const cfg = spawnSync('git', ['-C', dir, 'config', '--local', '--get', 'core.excludesFile'], { encoding: 'utf8' });
    assert.notStrictEqual(cfg.status, 0, 'core.excludesFile must stay unset');
  });
});

test('E2E: --repo decides the target; the cwd repo is not touched', () => {
  withTempRepo((a) => {
    withTempRepo((b) => {
      const res = runCli(['provision', '--repo', a, '--json'], { cwd: b });
      assert.strictEqual(res.status, 0, res.stderr);
      assert.ok(fs.existsSync(path.join(a, '.gitignore')), 'target repo was not provisioned');
      assert.ok(!fs.existsSync(path.join(b, '.gitignore')), 'the cwd repo was written to');
      assert.ok(samePath(cliJson(res).repoRoot, a), 'repoRoot ' + cliJson(res).repoRoot + ' is not ' + a);
    });
  });
});

test('E2E: a repo that already has the canonical rules unmarked keeps them, and the lint set is unchanged', () => {
  withTempRepo((dir, target) => {
    const before = gp.MCCP_IGNORE_ENTRIES.join('\n') + '\n';
    fs.writeFileSync(target, before, 'utf8');
    const beforeSet = gp.parseEntries(gp.stripManagedBlock(before));

    assert.strictEqual(runCli(['provision', '--repo', dir, '--json']).status, 0);

    const after = fs.readFileSync(target, 'utf8');
    assert.ok(after.startsWith(before), 'pre-existing lines were altered (UI2/UI3)');
    // Duplicates are explicitly allowed by the PRD; what must hold is that the
    // lint sees the same set before and after provisioning.
    assert.deepStrictEqual(gp.parseEntries(gp.stripManagedBlock(after)).sort(), beforeSet.sort());
  });
});

test('E2E: --dry-run writes nothing (UI9)', () => {
  withTempRepo((dir, target) => {
    fs.writeFileSync(target, 'user/\n', 'utf8');
    const before = fs.readFileSync(target, 'utf8');
    const res = runCli(['provision', '--repo', dir, '--dry-run', '--json']);
    assert.strictEqual(res.status, 0, res.stderr);
    const j = cliJson(res);
    assert.strictEqual(j.dryRun, true);
    assert.ok(j.addedLines.length > 0, 'dry-run must show the lines it would add');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), before);
    assert.ok(!fs.existsSync(target + '.bak'));
  });
});

// ---------------------------------------------------------------------------
// block replacement (the `update` action)
// ---------------------------------------------------------------------------

function seedStaleBlock(target, extraBefore) {
  const stale = gp.planMerge({ content: extraBefore || 'user-head/\n', version: '0.0.1-stale' });
  fs.writeFileSync(target, stale.nextContent, 'utf8');
  return stale.nextContent;
}

test('E2E: a stale block IS replaced on a normal run, and lines outside survive (UI1+UI2)', () => {
  // The block is tool-owned and carries the plugin version, so gating its
  // replacement behind a consent flag meant every version bump left existing
  // installs on stale rules while setup still reported success — UI1's
  // idempotent merge stopped holding after the first upgrade. Replacing it by
  // default is only safe because the marker span is the ONLY thing that moves;
  // this test asserts both halves at once.
  withTempRepo((dir, target) => {
    const before = seedStaleBlock(target, 'user-head/\nkeep-me/\n');
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 0, res.stderr);
    const j = cliJson(res);
    assert.strictEqual(j.action, 'update', 'a stale block was not refreshed on a normal run');
    assert.ok(j.backupPath, 'a block replacement must leave a recovery copy');
    assert.strictEqual(fs.readFileSync(j.backupPath, 'utf8'), before, '.bak is not the pre-run file');

    const after = fs.readFileSync(target, 'utf8');
    assert.ok(after.includes('# managed by /mccp:setup (mccp ' + VERSION + ')'), 'block not refreshed');
    assert.ok(!after.includes('0.0.1-stale'), 'stale block survived');
    assert.ok(after.startsWith('user-head/\nkeep-me/\n'), 'lines outside the block moved or were lost');

    // And it settles: a second run has nothing left to do.
    assert.strictEqual(cliJson(runCli(['provision', '--repo', dir, '--json'])).action, 'noop');
  });
});

test('E2E: a block replacement leaves a byte-identical .bak', () => {
  withTempRepo((dir, target) => {
    const before = seedStaleBlock(target);
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 0, res.stderr);
    const j = cliJson(res);
    assert.strictEqual(j.action, 'update');
    assert.ok(j.backupPath, 'a block replacement must report a backup path');
    assert.strictEqual(fs.readFileSync(j.backupPath, 'utf8'), before, '.bak is not the pre-run file');

    const after = fs.readFileSync(target, 'utf8');
    assert.ok(after.includes('# managed by /mccp:setup (mccp ' + VERSION + ')'));
    assert.ok(!after.includes('0.0.1-stale'));
    assert.ok(after.startsWith('user-head/'), 'a line outside the block moved');
  });
});

test('block replacement: .bak is owner-only (POSIX modes only)', { skip: !POSIX }, () => {
  withTempRepo((dir, target) => {
    seedStaleBlock(target);
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 0, res.stderr);
    const mode = fs.statSync(cliJson(res).backupPath).mode & 0o777;
    assert.strictEqual(mode, 0o600, '.bak holds a verbatim copy of the user file');
  });
});

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

test('applyMerge: a file created after planning is not clobbered (create uses wx)', () => {
  withTempDir((dir) => {
    const target = path.join(dir, '.gitignore');
    const plan = gp.planMerge({ content: null, version: VERSION });
    fs.writeFileSync(target, 'appeared-after-planning/\n', 'utf8'); // racing writer
    assert.throws(
      () => gp.applyMerge(target, plan, { lockPath: target + '.lock' }),
      (err) => err instanceof gp.ProvisionError && err.reason === gp.REASONS.CONCURRENT_MODIFICATION
    );
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'appeared-after-planning/\n');
  });
});

test('applyMerge: an edit injected between plan and write is refused, and the edit survives (UI2)', () => {
  withTempDir((dir) => {
    const target = path.join(dir, '.gitignore');
    const before = seedStaleBlock(target);
    const plan = gp.planMerge({ content: before, version: VERSION });
    assert.strictEqual(plan.action, 'update');

    // The user edits the file after we planned but before we write.
    fs.writeFileSync(target, before + 'late-user-rule/\n', 'utf8');

    assert.throws(
      () => gp.applyMerge(target, plan, { lockPath: target + '.lock' }),
      (err) => err instanceof gp.ProvisionError && err.reason === gp.REASONS.CONCURRENT_MODIFICATION
    );
    assert.ok(
      fs.readFileSync(target, 'utf8').includes('late-user-rule/'),
      'the concurrently added line was lost — UI2 violated'
    );
  });
});

test('lock: a live owner past its lease is NOT reclaimed; the waiter times out (exit 1)', () => {
  withTempRepo((dir, target) => {
    const lockPath = target + '.lock';
    // Our own PID is alive by construction; backdate mtime far past the lease.
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ token: 'held', pid: process.pid, host: os.hostname(), acquired_at: new Date().toISOString() }),
      { mode: 0o600 }
    );
    const old = new Date(Date.now() - (gp.LOCK_LEASE_MS + 60000));
    fs.utimesSync(lockPath, old, old);

    const res = runCli(['provision', '--repo', dir, '--json'], { env: { MCCP_GITIGNORE_LOCK_WAIT_MS: '250' } });
    assert.strictEqual(res.status, 1, 'a live holder must never be preempted');
    assert.strictEqual(cliJson(res).reason, gp.REASONS.LOCK_TIMEOUT);
    assert.ok(fs.existsSync(lockPath), 'the live owner lost its lock');
    fs.unlinkSync(lockPath);
  });
});

test('lock: a dead owner is reclaimed', () => {
  withTempRepo((dir, target) => {
    const lockPath = target + '.lock';
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ token: 'stale', pid: 999999, host: os.hostname(), acquired_at: new Date().toISOString() }),
      { mode: 0o600 }
    );
    const res = runCli(['provision', '--repo', dir, '--json'], { env: { MCCP_GITIGNORE_LOCK_WAIT_MS: '2000' } });
    assert.strictEqual(res.status, 0, res.stderr);
    assert.strictEqual(cliJson(res).action, 'create');
  });
});

function spawnCli(dir, extraEnv) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [CLI, 'provision', '--repo', dir, '--json'], {
      env: Object.assign({}, process.env, extraEnv || {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, out, err }));
    c.on('error', reject);
  });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('lock: a waiter proceeds once the holder releases (deterministic serialization)', async () => {
  await withTempRepoAsync(async (dir, target) => {
    const lockPath = target + '.lock';
    fs.writeFileSync(target, 'user-head/\n', 'utf8');
    const token = gp.acquireLock(lockPath, { waitMs: 1000 });

    const running = spawnCli(dir, { MCCP_GITIGNORE_LOCK_WAIT_MS: '15000' });

    // While we hold the lock the waiter must not have written anything.
    await delay(400);
    assert.ok(
      !fs.readFileSync(target, 'utf8').includes(gp.BEGIN_MARKER),
      'the waiter wrote while the lock was held'
    );
    gp.releaseLock(lockPath, token);

    const res = await running;
    assert.strictEqual(res.code, 0, 'waiter failed: ' + res.err);
    assert.strictEqual(JSON.parse(res.out).action, 'append');
    assert.ok(fs.readFileSync(target, 'utf8').startsWith('user-head/'), 'user line lost');
  });
});

test('lock: two concurrent writers both succeed and leave exactly one managed block', async () => {
  await withTempRepoAsync(async (dir, target) => {
    fs.writeFileSync(target, 'user-head/\n', 'utf8');
    const env = { MCCP_GITIGNORE_LOCK_WAIT_MS: '15000' };
    const [r1, r2] = await Promise.all([spawnCli(dir, env), spawnCli(dir, env)]);

    assert.strictEqual(r1.code, 0, 'writer 1 failed: ' + r1.err);
    assert.strictEqual(r2.code, 0, 'writer 2 failed: ' + r2.err);
    // Serialized by the lock: one appends, the other reads the finished file and
    // plans a noop. An exit 1 here would make ordinary concurrent setup an error.
    assert.deepStrictEqual(
      [JSON.parse(r1.out).action, JSON.parse(r2.out).action].sort(),
      ['append', 'noop'],
      'expected one writer to append and the other to observe it'
    );

    const after = fs.readFileSync(target, 'utf8');
    const lines = after.split(/\r?\n/).map((l) => l.trim());
    assert.strictEqual(lines.filter((l) => l === gp.BEGIN_MARKER).length, 1,
      'duplicate managed block — the append path lost its lock');
    assert.strictEqual(lines.filter((l) => l === gp.END_MARKER).length, 1);
    assert.ok(after.startsWith('user-head/'), 'user line lost');
  });
});

test('block replacement: the tmp file is per-run unique (a fixed name would collide)', () => {
  withTempDir((dir) => {
    const target = path.join(dir, '.gitignore');
    const seen = new Set();
    for (let i = 0; i < 3; i += 1) {
      const before = seedStaleBlock(target);
      const plan = gp.planMerge({ content: before, version: VERSION });
      const applied = gp.applyMerge(target, plan, { lockPath: target + '.lock' });
      assert.ok(applied.tmpPath, 'a block replacement must use a tmp file');
      assert.ok(/\.\d+\.[0-9a-f]{12}\.tmp$/.test(applied.tmpPath), 'tmp must carry pid + nonce: ' + applied.tmpPath);
      assert.ok(!seen.has(applied.tmpPath), 'tmp name repeated across runs');
      seen.add(applied.tmpPath);
    }
  });
});

// ---------------------------------------------------------------------------
// Security-absorbed paths
// ---------------------------------------------------------------------------

test('write refuses a symlinked .gitignore instead of following it', (t) => {
  withTempRepo((dir, target) => {
    const victim = path.join(dir, 'victim.txt');
    fs.writeFileSync(victim, 'do-not-touch\n', 'utf8');
    try {
      fs.symlinkSync(victim, target);
    } catch (err) {
      // Unprivileged Windows cannot create symlinks; the guard is still compiled in.
      t.skip('symlink creation unavailable: ' + err.code);
      return;
    }
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 1);
    assert.strictEqual(cliJson(res).reason, gp.REASONS.SYMLINK_TARGET);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'do-not-touch\n', 'wrote through the symlink');
  });
});

test('block replacement refuses a symlinked .bak instead of writing through it', (t) => {
  // The backup path is as deterministic as the target, so it is as pre-placeable.
  // A plain 'w' write follows the link and lands the user's .gitignore — whose
  // lines an attacker with repo-write already controls — on whatever it points at.
  withTempRepo((dir, target) => {
    seedStaleBlock(target);
    const victim = path.join(dir, 'victim.txt');
    fs.writeFileSync(victim, 'do-not-touch\n', 'utf8');
    try {
      fs.symlinkSync(victim, target + '.bak');
    } catch (err) {
      t.skip('symlink creation unavailable: ' + err.code);
      return;
    }
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 1, 'wrote the backup through a symlink');
    assert.strictEqual(cliJson(res).reason, gp.REASONS.SYMLINK_TARGET);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'do-not-touch\n', 'the symlink target was overwritten');
    assert.ok(
      fs.readFileSync(target, 'utf8').includes('0.0.1-stale'),
      'refusing the backup must also leave the target unrewritten'
    );
  });
});

test('append opens with O_NOFOLLOW, so a symlink swapped in after the check is refused', (t) => {
  // The lstat before the append is a check-then-use: the file can become a
  // symlink between the two. Only the open itself can refuse atomically, so
  // assert that the flags the append path uses actually deliver that refusal on
  // this platform rather than trusting the constant to be spelled right.
  if (!(fs.constants.O_NOFOLLOW && (gp.APPEND_FLAGS & fs.constants.O_NOFOLLOW))) {
    t.skip('O_NOFOLLOW unavailable on this platform (' + process.platform + '); the lstat check still applies');
    return;
  }
  withTempDir((dir) => {
    const victim = path.join(dir, 'victim.txt');
    fs.writeFileSync(victim, 'do-not-touch\n', 'utf8');
    const link = path.join(dir, '.gitignore');
    fs.symlinkSync(victim, link);
    assert.throws(
      () => fs.closeSync(fs.openSync(link, gp.APPEND_FLAGS, 0o644)),
      (err) => err.code === 'ELOOP' || err.code === 'EMLINK',
      'the append flags followed a symlink'
    );
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'do-not-touch\n');
  });
});

test('acquireLock refuses a symlinked lock path instead of blaming a live writer', (t) => {
  // The exclusive create never writes through the link (O_EXCL fails on one),
  // but EEXIST is this loop's "somebody holds the lock" signal — so without the
  // guard the caller waits out the lease and is then told a writer it cannot
  // find is holding the file.
  withTempDir((dir) => {
    const victim = path.join(dir, 'victim.txt');
    fs.writeFileSync(victim, 'do-not-touch\n', 'utf8');
    const lockPath = path.join(dir, '.gitignore.lock');
    try {
      fs.symlinkSync(victim, lockPath);
    } catch (err) {
      t.skip('symlink creation unavailable: ' + err.code);
      return;
    }
    assert.throws(
      () => gp.acquireLock(lockPath, { waitMs: 0 }),
      (err) => err instanceof gp.ProvisionError && err.reason === gp.REASONS.SYMLINK_TARGET,
      'a symlinked lock path was reported as a busy lock'
    );
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'do-not-touch\n');
  });
});

test('lock file is owner-only (POSIX modes only)', { skip: !POSIX }, () => {
  withTempDir((dir) => {
    const lockPath = path.join(dir, '.gitignore.lock');
    const token = gp.acquireLock(lockPath, { waitMs: 100 });
    try {
      assert.strictEqual(fs.statSync(lockPath).mode & 0o777, 0o600);
    } finally {
      gp.releaseLock(lockPath, token);
    }
  });
});

test('lock reclaim: a lock replaced between judgement and unlink is NOT deleted', () => {
  // Two processes can both judge the same stale lock reclaimable. If the slower
  // one unlinks unconditionally it deletes the fresh lock the faster one just
  // installed, and both end up inside the critical section.
  withTempDir((dir) => {
    const lockPath = path.join(dir, '.gitignore.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ token: 'stale', pid: 999999, host: os.hostname() }), { mode: 0o600 });
    const verdict = gp.lockIsReclaimable(lockPath, Date.now());
    assert.strictEqual(verdict.reclaimable, true, 'a dead owner must be reclaimable');

    // The faster writer wins the race and installs its own lock.
    fs.writeFileSync(lockPath, JSON.stringify({ token: 'fresh', pid: process.pid, host: os.hostname() }), { mode: 0o600 });

    assert.strictEqual(gp.reclaimLock(lockPath, verdict.identity), false, 'unlinked a lock it never judged');
    assert.ok(fs.existsSync(lockPath), "the winner's lock was removed");
    assert.strictEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')).token, 'fresh');
  });
});

test('lock reclaim: an unchanged stale lock IS reclaimed (the guard is not a blanket refusal)', () => {
  withTempDir((dir) => {
    const lockPath = path.join(dir, '.gitignore.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ token: 'stale', pid: 999999, host: os.hostname() }), { mode: 0o600 });
    const verdict = gp.lockIsReclaimable(lockPath, Date.now());
    assert.strictEqual(gp.reclaimLock(lockPath, verdict.identity), true);
    assert.ok(!fs.existsSync(lockPath));
  });
});

test('releaseLock: refuses to unlink a lock it does not own', () => {
  withTempDir((dir) => {
    const lockPath = path.join(dir, '.gitignore.lock');
    const token = gp.acquireLock(lockPath, { waitMs: 100 });
    assert.strictEqual(gp.releaseLock(lockPath, 'not-my-token'), false);
    assert.ok(fs.existsSync(lockPath), 'someone else\'s lock was removed');
    assert.strictEqual(gp.releaseLock(lockPath, token), true);
    assert.ok(!fs.existsSync(lockPath));
  });
});

// ---------------------------------------------------------------------------
// CLI exit-code contract (DD1)
// ---------------------------------------------------------------------------

test('CLI: a non-git directory is a skip at exit 0 (UI5)', () => {
  withTempDir((dir) => {
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 0, res.stderr);
    const j = cliJson(res);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.action, 'skip');
    assert.strictEqual(j.reason, gp.REASONS.NOT_A_GIT_REPO);
  });
});

test('CLI: a damaged marker is exit 1 and leaves the file byte-identical', () => {
  withTempRepo((dir, target) => {
    const damaged = ['user/', gp.BEGIN_MARKER, 'orphan/'].join('\n') + '\n';
    fs.writeFileSync(target, damaged, 'utf8');
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 1);
    assert.strictEqual(cliJson(res).reason, gp.REASONS.MARKER_DAMAGED);
    assert.ok(res.stderr.length > 0, 'a failure must say something on stderr');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), damaged, 'the file was modified on a refused write');
  });
});

test('CLI: every emitted reason belongs to the closed enum', () => {
  // The failure below is a plain fs error, not a ProvisionError: it must still
  // surface as a stable protocol value rather than an OS-specific message.
  withTempRepo((dir, target) => {
    fs.mkdirSync(target); // .gitignore is a directory -> read/append fails
    const res = runCli(['provision', '--repo', dir, '--json']);
    assert.strictEqual(res.status, 1);
    const j = cliJson(res);
    assert.ok(gp.REASON_VALUES.includes(j.reason), 'reason escaped the enum: ' + j.reason);
    assert.strictEqual(j.reason, gp.REASONS.INTERNAL_ERROR);
    assert.strictEqual(j.action, null, 'a failed run must not report an action');
    assert.strictEqual(j.ok, false);
  });
});

test('CLI: usage error exits 2, distinct from a run failure', () => {
  const res = runCli(['bogus-subcommand']);
  assert.strictEqual(res.status, 2);
});

test('CLI: --repo without a value is a usage error, not a silent fallback to cwd', () => {
  // Blindly taking args[i+1] made a trailing `--repo` fall back to cwd and made
  // `--repo --json` target a directory literally named "--json" — both write to
  // a repository the caller never named.
  for (const args of [['provision', '--repo'], ['provision', '--repo', '--json']]) {
    const res = runCli(args);
    assert.strictEqual(res.status, 2, 'expected usage exit for: ' + args.join(' '));
    assert.match(res.stderr, /--repo requires a value/);
  }
});

test('provision: a non-git directory skips before the version is ever needed', () => {
  // Reading plugin.json first turned a corrupt manifest in a non-git directory
  // into exit 1 instead of the documented skip.
  withTempDir((dir) => {
    const out = gp.provision({ repo: dir, pluginJsonPath: path.join(dir, 'no-such-plugin.json') });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.action, 'skip');
    assert.strictEqual(out.reason, gp.REASONS.NOT_A_GIT_REPO);
    assert.strictEqual(out.version, null, 'skip must not claim a version it never read');
  });
});

test('applyMerge: an unrecognized action is refused, not treated as a whole-file rewrite', () => {
  withTempDir((dir) => {
    const target = path.join(dir, '.gitignore');
    fs.writeFileSync(target, 'user/\n', 'utf8');
    assert.throws(
      () => gp.applyMerge(target, { action: 'wat', nextContent: 'clobbered\n', sourceHash: null }, { lockPath: target + '.lock' }),
      (err) => err instanceof gp.ProvisionError && err.reason === gp.REASONS.INTERNAL_ERROR
    );
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'user/\n', 'the file was rewritten by an unknown action');
  });
});

test('lock: MCCP_GITIGNORE_LOCK_WAIT_MS=0 means do not wait, not "use the default"', () => {
  withTempRepo((dir, target) => {
    const lockPath = target + '.lock';
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ token: 'held', pid: process.pid, host: os.hostname(), acquired_at: new Date().toISOString() }),
      { mode: 0o600 }
    );
    const startedAt = Date.now();
    const res = runCli(['provision', '--repo', dir, '--json'], { env: { MCCP_GITIGNORE_LOCK_WAIT_MS: '0' } });
    const elapsed = Date.now() - startedAt;
    assert.strictEqual(res.status, 1);
    assert.strictEqual(cliJson(res).reason, gp.REASONS.LOCK_TIMEOUT);
    // Filtering 0 through `||` silently restored the 10s default.
    assert.ok(elapsed < 5000, 'waited ' + elapsed + 'ms — 0 was not honoured');
    fs.unlinkSync(lockPath);
  });
});

// ---------------------------------------------------------------------------
// Drift lint (DD3) — canonical <-> this repo's .gitignore
// ---------------------------------------------------------------------------

test('drift lint: this repo carries every canonical entry', () => {
  const gitignorePath = path.join(REPO_ROOT, '.gitignore');
  // A missing file is a red, not a skip: a silent skip is the exact defect class
  // this gate exists to close.
  assert.ok(fs.existsSync(gitignorePath), 'repo .gitignore is missing');
  const repoEntries = new Set(gp.parseEntries(gp.stripManagedBlock(fs.readFileSync(gitignorePath, 'utf8'))));
  const missing = gp.MCCP_IGNORE_ENTRIES.filter((e) => !repoEntries.has(e));
  assert.deepStrictEqual(missing, [], 'canonical entries not dogfooded in this repo: ' + missing.join(', '));
});

test('drift lint: every repo entry is classified as canonical or REPO_ONLY', () => {
  const gitignorePath = path.join(REPO_ROOT, '.gitignore');
  const repoEntries = gp.parseEntries(gp.stripManagedBlock(fs.readFileSync(gitignorePath, 'utf8')));
  const canonical = new Set(gp.MCCP_IGNORE_ENTRIES);
  const repoOnly = new Set(gp.REPO_ONLY.map((r) => r.entry));
  const unclassified = repoEntries.filter((e) => !canonical.has(e) && !repoOnly.has(e));
  assert.deepStrictEqual(
    unclassified, [],
    'new .gitignore entries are unclassified — add them to MCCP_IGNORE_BLOCK or REPO_ONLY: ' + unclassified.join(', ')
  );
});

test('drift lint: canonical and REPO_ONLY are disjoint', () => {
  // Intersection, not a count equation: a sum check would go red on a
  // provisioned repo or one where a user repeated a line, and that red would be
  // an artifact of counting rather than a real defect.
  const canonical = new Set(gp.MCCP_IGNORE_ENTRIES);
  const both = gp.REPO_ONLY.map((r) => r.entry).filter((e) => canonical.has(e));
  assert.deepStrictEqual(both, [], 'entries classified twice: ' + both.join(', '));
});

test('drift lint: every REPO_ONLY entry is still carried by this repo', () => {
  // The other direction. REPO_ONLY is documented as "entries this repo carries
  // that are deliberately NOT shipped", so a row for a line the repo has since
  // dropped is a claim about a file that no longer says it. Without this the
  // lint is bidirectional for canonical entries only, and a stale exclusion
  // stays green forever — it is exactly the class of row that later gets read
  // as evidence that a decision was made.
  const gitignorePath = path.join(REPO_ROOT, '.gitignore');
  const repoEntries = new Set(gp.parseEntries(gp.stripManagedBlock(fs.readFileSync(gitignorePath, 'utf8'))));
  const phantom = gp.REPO_ONLY.map((r) => r.entry).filter((e) => !repoEntries.has(e));
  assert.deepStrictEqual(
    phantom, [],
    'REPO_ONLY rows for entries this repo no longer carries: ' + phantom.join(', ')
  );
});

test('drift lint: every REPO_ONLY entry records why it stays behind', () => {
  for (const row of gp.REPO_ONLY) {
    assert.ok(typeof row.entry === 'string' && row.entry.length > 0);
    assert.ok(typeof row.reason === 'string' && row.reason.length > 0, row.entry + ' has no exclusion reason');
  }
});

// ---------------------------------------------------------------------------
// setup.md Phase 5 contract lint — the 16 items (single owner)
// ---------------------------------------------------------------------------

test('setup.md contract lint: Phase 5 exists and its fail-closed wiring is intact', () => {
  const md = fs.readFileSync(SETUP_MD, 'utf8');
  const phases = md.split(/\r?\n/).filter((l) => /^## Phase/.test(l));

  //  1
  assert.strictEqual(phases.length, 6, 'expected 6 phases, found ' + phases.length);
  //  2
  assert.ok(md.includes('gitignore-provision.js'), 'Phase 5 must call the provisioner');
  //  3 — the pollution scan is the PROVISIONER's, run against the repo root it
  //  resolved. setup.md must read the result, not re-run the scan in the
  //  caller's cwd (a subdirectory invocation would silently scan a subtree and
  //  report the partial result in the same shape as a clean one).
  //  Naming the command in a comment is fine and load-bearing; EXECUTING it is
  //  what reintroduces the cwd scope, so the lint targets non-comment lines.
  const runsScan = md.split(/\r?\n/).filter((l) => l.includes('git ls-files') && !/^\s*#/.test(l));
  assert.deepStrictEqual(runsScan, [], 'setup.md runs its own cwd-scoped pollution scan');
  assert.ok(md.includes('.pollution'), 'setup.md must read pollution from the provisioner JSON');
  //  4
  assert.ok(md.includes('--skip-gitignore'), 'skip flag missing');
  //  5
  assert.ok(md.includes('not-a-git-repo'), 'skip reason missing');
  //  6
  assert.ok(md.includes('PROVISION_EXIT=$?'), 'exit code is not captured');
  //  7
  assert.ok(md.includes('if [ "$PROVISION_EXIT" -ne 0 ]'), 'exit code is not tested');
  //  8
  assert.ok(md.includes('exit "$PROVISION_EXIT"'), 'exit code is not propagated');
  //  9 — the Phase writes no temp file, so an undefined var can never eat stderr.
  assert.ok(!md.includes('MCCP_TMP'), 'MCCP_TMP is undefined in setup.md — redirecting to it loses stderr');
  // 10
  assert.ok(md.includes('case "$PROVISION_ACTION" in'), 'action dispatch missing');
  for (const action of ['skip', 'noop', 'create', 'append', 'update']) {
    assert.ok(new RegExp('(^|[^-\\w])' + action + '([^-\\w]|$)', 'm').test(md), 'action branch missing: ' + action);
  }
  // 11
  assert.ok(md.includes('git rm --cached'), 'UI7 guidance missing — detection must only advise');
  // 12 — "could not check" must stay distinguishable from "checked, clean".
  assert.ok(md.includes('POLLUTED_OK'), 'pollution-check failure is not distinguished from "no pollution"');
  // 13 — generalized MCCP_TMP rule. Any variable the EXECUTED bash interpolates
  //      must be ASSIGNED in the same file: an unassigned ${DRY_RUN:+--dry-run}
  //      expands to nothing and turns a detection-only run into a real write.
  //      Scoped to bash fences — prose naturally names variables it never runs.
  const bashBlocks = (md.match(/```bash\r?\n[\s\S]*?```/g) || []).join('\n');
  assert.ok(bashBlocks.includes('DRY_RUN'), 'no bash block carries the dry-run flag to the provisioner');
  for (const ref of bashBlocks.match(/\$\{([A-Z_][A-Z0-9_]*)(:[-+][^}]*)?\}/g) || []) {
    const name = ref.replace(/^\$\{/, '').replace(/[:}].*$/, '');
    if (name === 'CLAUDE_PLUGIN_ROOT') continue; // supplied by the plugin harness
    assert.ok(
      new RegExp('^\\s*' + name + '=', 'm').test(bashBlocks),
      name + ' is interpolated but never assigned in setup.md — it expands to empty at runtime'
    );
  }
  // 14 — an action outside the closed set must not fall through as success.
  assert.ok(/^\s{2}\*\)/m.test(md), 'case has no default branch — an unknown action would report success');
  // 15 — the contract promises a line count on create/append/update, so the
  //      body has to actually read it. Printing only `action` satisfies the
  //      case statement and none of the contract.
  // Anchored on the property ACCESS, not the bare word: the bash blocks carry
  // comments that name these fields, and a lint satisfied by its own comment is
  // green for a body that reads nothing.
  assert.ok(
    /\.addedLines\b/.test(bashBlocks),
    'setup.md promises to report how many lines were added but never reads addedLines'
  );
  // 16 — a dry run reports the same action a real run would, so branching on
  //      action alone announces a write that did not happen. This is the same
  //      defect as an unassigned --dry-run flag, arriving from the reporting
  //      side instead of the invocation side.
  assert.ok(
    /\.dryRun\b/.test(bashBlocks),
    'setup.md never reads dryRun — a detection-only run would be reported as a write'
  );
});

// ---------------------------------------------------------------------------
// CI trigger lint — a step that never runs is dead code
// ---------------------------------------------------------------------------

test('gitignore-drift workflow: exists, is triggered by the lint inputs, and runs on Windows', () => {
  assert.ok(fs.existsSync(WORKFLOW), 'the drift gate workflow is missing — DD3 has no enforcement');
  const yml = fs.readFileSync(WORKFLOW, 'utf8');

  // paths must cover the lint's decision inputs, or the workflow never fires.
  for (const p of [
    'plugins/mccp/scripts/lib/gitignore-provision.js',
    'plugins/mccp/scripts/lib/tests/gitignore-provision.test.js',
    'plugins/mccp/commands/setup.md',
    '.gitignore',
    // The suite asserts this file's `eol=lf` pin, so it is a decision input like
    // any other. Without it a PR touching only .gitattributes retires the LF
    // guarantee without ever running the assertion that guards it.
    '.gitattributes',
  ]) {
    assert.ok(yml.includes("- '" + p + "'"), 'paths filter is missing ' + p);
  }
  // Windows earns its slot on write/lock/symlink behaviour (8.3 short paths,
  // absent POSIX modes, unprivileged symlink creation) — NOT on CRLF checkout,
  // which .gitattributes (`* text=auto eol=lf`) rules out on every runner.
  assert.ok(yml.includes('windows-latest'), 'platform-parity coverage is a claim unless Windows is in the matrix');
  assert.ok(yml.includes('node --test'), 'the workflow does not run the tests');
  assert.ok(yml.includes('plugins/mccp/scripts/lib/tests/gitignore-provision.test.js'), 'test file not run');

  // A `git config core.autocrlf` step placed after checkout changes nothing and
  // reads as a guarantee. If one is ever reintroduced it must precede checkout.
  const lines = yml.split(/\r?\n/);
  const cfgIdx = lines.findIndex((l) => l.includes('core.autocrlf'));
  if (cfgIdx >= 0) {
    const checkoutIdx = lines.findIndex((l) => l.includes('actions/checkout'));
    assert.ok(cfgIdx < checkoutIdx, 'core.autocrlf is configured after checkout — the step is a no-op');
  }
});

test('.gitattributes pins LF, which is what actually makes checkout bytes stable', () => {
  // The workflow's comment cites this file as the mechanism; assert the citation
  // is true rather than leaving it as prose.
  const attrs = fs.readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8');
  assert.ok(/^\*\s+text=auto\s+eol=lf\s*$/m.test(attrs), '.gitattributes no longer pins eol=lf');
});
