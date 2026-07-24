'use strict';

// history-leak-scan contract (durable-evidence-substrate follow-up · F-H + F-I).
//
// The pre-push backstop: every NEW blob in origin/<base>..HEAD (incl. ancestor
// commits, not just the tip tree) must be free of repo-root absolute-path leaks.
// The gate must (a) catch a leak added in an ancestor even if the tip removed it
// (F-H), (b) catch it in a NON-receipt artifact like a plan/report (F-I), and
// (c) NOT false-positive on the plugin's own cache-path convention or test
// fixtures like `C:\evil\abs` (IF3 — the pattern is repo-root-anchored, and the
// allowlist is line/fixture-specific, never directory-wide).
//
// Fixture leak strings are built in JS from the temp repo root (path.join) —
// NEVER a bash heredoc ([[bash-tool-backslash-collapse]]).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const scan = require('../history-leak-scan');

function g(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// initBase() creates a repo with a single base commit and a `main` ref at it.
// Returns root — so test file contents can reference the real repo-root path.
function initBase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'histleak-'));
  g(root, ['init', '-q']);
  g(root, ['config', 'user.email', 't@t.local']);
  g(root, ['config', 'user.name', 't']);
  g(root, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(root, 'README.md'), '# base\n');
  g(root, ['add', '-A']);
  g(root, ['commit', '-q', '-m', 'base', '--no-verify']);
  g(root, ['branch', 'main']);        // base = main
  return root;
}

// commit(root, files, remove, msg) — write files (relpath→content), unlink
// `remove`, then commit. Returns root for chaining.
function commit(root, files, remove, msg) {
  for (const rel of Object.keys(files || {})) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  }
  for (const rel of (remove || [])) {
    try { fs.unlinkSync(path.join(root, rel)); } catch (_e) { /* ignore */ }
  }
  g(root, ['add', '-A']);
  g(root, ['commit', '-q', '-m', msg || 'c', '--no-verify']);
  return root;
}

// buildRepo(commits) — legacy shape for tests whose contents don't reference root.
function buildRepo(commits) {
  const root = initBase();
  (commits || []).forEach(function (c, i) { commit(root, c.files, c.remove, 'c' + i); });
  return root;
}

test('clean range: no repo-root leak → ok:true', function () {
  const root = buildRepo([{ files: { 'docs/note.md': 'hello world\nno leak here\n' } }]);
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, true, JSON.stringify(res.leaks));
  assert.ok(res.scanned_blobs >= 1);
});

test('F-I: a leak in a NON-receipt artifact (plan/report) is caught', function () {
  const root = initBase();
  commit(root, { '.claude/plans/x.plan.md': 'see the receipt at ' + root + '/plugins for detail\n' });
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, false);
  assert.ok(res.leaks.some(function (l) { return /x\.plan\.md/.test(l.path); }));
});

test('old-repo-name absolute path is caught (drive-letter prefix required)', function () {
  const root = buildRepo([{
    files: { 'report.md': 'legacy path C:\\_project\\my\\my-claude-code-plugin\\receipts\\a.json\n' },
  }]);
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, false);
  assert.ok(res.leaks.some(function (l) { return l.pattern.indexOf('old-repo') === 0; }));
});

test('bare old-repo NAME (no drive-letter path) does NOT trigger', function () {
  const root = buildRepo([{
    files: { 'doc.md': 'The project was renamed from my-claude-code-plugin to mccp.\n' },
  }]);
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, true, JSON.stringify(res.leaks));
});

test('IF3: plugin cache-path convention does NOT false-positive (not repo-root anchored)', function () {
  const root = buildRepo([{
    files: { 'plugins/cmd.md': 'node C:/Users/someone/.claude/plugins/cache/mccp/mccp/1.22.2/x.js\n' },
  }]);
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, true, JSON.stringify(res.leaks));
});

test('IF3: a test-fixture path like C:\\evil\\abs does NOT false-positive', function () {
  const root = buildRepo([{
    files: { 'tests/f.test.js': "const bad = 'C:\\\\evil\\\\abs';\n" },
  }]);
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, true, JSON.stringify(res.leaks));
});

test('F-H: a leak added in an ANCESTOR commit and REMOVED at the tip is still caught', function () {
  const root = initBase();
  commit(root, { 'leak.md': 'path ' + root + '/deep leaked here\n' }, null, 'ancestor-leak');
  commit(root, { 'clean.md': 'no leak\n' }, ['leak.md'], 'tip-removes-leak');
  // tip tree is clean, but the blob is still reachable in the range.
  assert.ok(!fs.existsSync(path.join(root, 'leak.md')));
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, false, 'ancestor leak must be caught even though the tip is clean');
  assert.ok(res.leaks.some(function (l) { return /leak\.md/.test(l.path); }));
});

test('allowlist: an EXACT path+contains entry suppresses that leak', function () {
  const root = buildRepo([{
    files: { 'CLAUDE.md': 'documented example path ' + '__ROOT__' + '/foo\n' },
  }]);
  // replace the placeholder with the real repo-root leak + commit.
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'documented example path ' + root + '/foo\n');
  g(root, ['add', '-A']);
  g(root, ['commit', '-q', '-m', 'doc', '--no-verify']);

  const without = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(without.ok, false, 'leak present without allowlist');

  const withAllow = scan.scanRange({
    repoRoot: root, base: 'main',
    allowlist: [{ path: 'CLAUDE.md', contains: 'documented example' }],
  });
  assert.equal(withAllow.ok, true, JSON.stringify(withAllow.leaks));
});

test('allowlist is path-EXACT, not directory-wide (IF3)', function () {
  const root = initBase();
  commit(root, {
    'docs/allowed.md': 'ok example ' + root + '/x\n',
    'docs/other.md': 'sneaky ' + root + '/y\n',
  });
  const res = scan.scanRange({
    repoRoot: root, base: 'main',
    allowlist: [{ path: 'docs/allowed.md' }], // only the exact file, NOT docs/
  });
  assert.equal(res.ok, false, 'the sibling file in the same dir is NOT allowlisted');
  assert.ok(res.leaks.every(function (l) { return l.path !== 'docs/allowed.md'; }));
  assert.ok(res.leaks.some(function (l) { return l.path === 'docs/other.md'; }));
});

test('DEFAULT allowlist suppresses the scanner OWN fixture path, but not a real leak elsewhere', function () {
  const root = initBase();
  const fixturePath = 'plugins/mccp/scripts/lib/tests/history-leak-scan.test.js';
  commit(root, {
    // the scanner's own fixture path with the sanctioned old-repo literal
    [fixturePath]: "files: { r: 'C:\\\\x\\\\my-claude-code-plugin\\\\a' }\n",
    // a DIFFERENT file with the SAME old-repo literal — must still be caught
    'somewhere/else.md': 'oops C:\\_project\\my\\my-claude-code-plugin\\a\n',
  });
  const res = scan.scanRange({ repoRoot: root, base: 'main' }); // NO explicit allowlist
  assert.ok(res.leaks.every(function (l) { return l.path !== fixturePath; }), 'own fixture suppressed by DEFAULT allowlist');
  assert.ok(res.leaks.some(function (l) { return l.path === 'somewhere/else.md'; }), 'a leak in a DIFFERENT file is NOT masked');
});

test('R5-F3: same blob at an allowlisted path AND a non-allowlisted path → non-allowlisted leak still reported', function () {
  // The masking bug: `git rev-list --objects` annotates a blob with only its
  // FIRST-seen path. If that representative path is allowlisted, the old code
  // suppressed the leak for the WHOLE blob — hiding the SAME content leaking on a
  // sibling (non-allowlisted) path. Two files with IDENTICAL content share one
  // blob oid (git sorts `allowed.md` before `other.md` within docs/, so the
  // representative is the allowlisted one — the exact masking case). ls-tree -r
  // augmentation now recovers BOTH paths and the allowlist is evaluated per-path.
  const root = initBase();
  const leak = 'documented example path ' + root + '/foo\n';
  commit(root, {
    'docs/allowed.md': leak,   // allowlisted below
    'docs/other.md': leak,     // SAME content → SAME blob oid, NOT allowlisted
  });
  const res = scan.scanRange({
    repoRoot: root, base: 'main',
    allowlist: [{ path: 'docs/allowed.md' }],
  });
  assert.equal(res.ok, false, 'the non-allowlisted sibling path of the same blob must still leak');
  assert.ok(res.leaks.some(function (l) { return l.path === 'docs/other.md'; }), 'other.md leak reported');
  assert.ok(res.leaks.every(function (l) { return l.path !== 'docs/allowed.md'; }), 'allowed.md path suppressed');
});

test('R5-F3: a blob reachable ONLY via allowlisted paths stays fully suppressed (regression 0)', function () {
  // The single-/all-allowlisted-path case must keep suppressing — the fix only
  // ADDS sibling-path reporting; it must not start reporting an all-allowlisted blob.
  const root = initBase();
  const leak = 'doc ' + root + '/bar\n';
  commit(root, {
    'docs/a.md': leak,
    'docs/b.md': leak,   // same blob, BOTH allowlisted
  });
  const res = scan.scanRange({
    repoRoot: root, base: 'main',
    allowlist: [{ path: 'docs/a.md' }, { path: 'docs/b.md' }],
  });
  assert.equal(res.ok, true, JSON.stringify(res.leaks));
});

test('empty range (HEAD === base) → ok, nothing scanned', function () {
  const root = buildRepo([]); // no extra commits: HEAD === main
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, true);
  assert.equal(res.commits, 0);
  assert.equal(res.scanned_blobs, 0);
});

test('R4/F2: a blob that cannot be read (e.g. >64MiB maxBuffer throw) is fail-CLOSED, not silently skipped', function () {
  const gitFn = function (args) {
    const a = args.join(' ');
    if (a.indexOf('rev-parse') === 0) return 'deadbeef';                       // base resolves
    if (a.indexOf('rev-list --count') === 0) return '1\n';
    if (a.indexOf('rev-list --objects') === 0) return 'oid1 clean.json\noid2 big.json\n';
    if (a === 'cat-file -t oid1' || a === 'cat-file -t oid2') return 'blob\n';
    if (a === 'cat-file blob oid1') return '{"receipt_hash":"x","meta":{"cwd":"."}}\n';
    if (a === 'cat-file blob oid2') { throw new Error('spawnSync git maxBuffer length exceeded'); }
    throw new Error('unexpected git call: ' + a);
  };
  const res = scan.scanRange({ repoRoot: '/fake-repo', base: 'main', gitFn: gitFn });
  assert.equal(res.ok, false, 'an unreadable blob must fail the scan closed');
  const err = (res.leaks || []).find(function (l) { return l.pattern === 'scan-error'; });
  assert.ok(err, 'a scan-error is recorded for the unreadable blob');
  assert.match(err.evidence, /cat-file blob failed/);
});

test('R4/F2: a cat-file -t classification failure is also fail-CLOSED', function () {
  const gitFn = function (args) {
    const a = args.join(' ');
    if (a.indexOf('rev-parse') === 0) return 'deadbeef';
    if (a.indexOf('rev-list --count') === 0) return '1\n';
    if (a.indexOf('rev-list --objects') === 0) return 'oidX weird/path\n';
    if (a === 'cat-file -t oidX') throw new Error('cat-file: bad object oidX');
    throw new Error('unexpected git call: ' + a);
  };
  const res = scan.scanRange({ repoRoot: '/fake-repo', base: 'main', gitFn: gitFn });
  assert.equal(res.ok, false);
  assert.ok((res.leaks || []).some(function (l) { return l.pattern === 'scan-error'; }));
});
