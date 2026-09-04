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

// caseVariantOf — 반드시 대소문자가 **다른** 경로를 낸다.
//
// 이전 F4 본문은 `variant === root`이면 조용히 return했는데, 그것은 단언 없이
// 통과하는 길이라 이 파일이 막으려는 형태 그 자체였다(mkdtemp 난수가 전부
// 소문자로 나오면 Windows에서도 열린다). 소문자화가 항등이면 대문자화로 뒤집어
// 변형을 보장하고, 그래도 같으면 그때는 조용히 넘어가는 대신 시끄럽게 실패한다.
function caseVariantOf(root) {
  const lower = root.toLowerCase();
  const variant = lower === root ? root.toUpperCase() : lower;
  assert.notStrictEqual(variant, root,
    'a case variant must actually differ, or the assertion below proves nothing');
  return variant;
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

test('a URL carrying the old repo name does NOT trigger (scheme is not a drive letter)', function () {
  // `[A-Za-z]:` also matches the LAST letter of a URL scheme, so `https://` read
  // as a drive-letter path and a stale hyperlink blocked the push. That costs as
  // much as a miss: the only ways past a false positive are rewriting history or
  // allowlisting a line that was never a leak. Measured against a real link that
  // did block one.
  const root = buildRepo([{
    files: {
      'prd.md': 'origin report: [#124](https://github.com/skypark207/my-claude-code-plugin/issues/124)\n'
        + 'and http://example.com/my-claude-code-plugin as well\n',
    },
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

test('DEFAULT allowlist suppresses the backlog line that REPORTS this scanner, keyed on the citation not the repo name', function () {
  const root = initBase();
  const backlog = '.claude/plans/codex-findings-backlog.md';
  commit(root, {
    // The real shape of the offending line: a finding about THIS scanner that
    // quotes both the drive-letter class it targets and the match string, and
    // cites the source line. Only the citation makes it allowlisted.
    [backlog]: [
      '2026-08-14 | MEDIUM | plugins/mccp/scripts/lib/history-leak-scan.js | old-repo'
        + ' pattern false-positives. `history-leak-scan.js:90` targets `C:\\_project\\my-claude-code-plugin\\x`'
        + ' but the match string was `s://github.com/<owner>/my-claude-code-plugin`.',
      // A LATER backlog line naming the old repo WITHOUT the citation: the
      // exemption must not extend to it, or the file becomes a blind spot.
      '2026-09-01 | HIGH | somewhere.js | leaked C:\\_project\\my-claude-code-plugin\\y',
      '',
    ].join('\n'),
  });
  const res = scan.scanRange({ repoRoot: root, base: 'main' }); // NO explicit allowlist
  const hits = res.leaks.filter(function (l) { return l.path === backlog; });
  assert.deepEqual(hits.map(function (l) { return l.line; }), [2],
    'only the un-cited line 2 leaks; the reporting line 1 is suppressed: ' + JSON.stringify(res.leaks));
});

test('DEFAULT allowlist covers the M9 snapshot copy of that same reporting line, and covers ONLY it', function () {
  // The snapshot artifact is a derived capture of the backlog, so it carries the
  // entry-2 line verbatim into a second path. Because the allowlist is evaluated
  // per path, the copy was reported until it got its own row. This test pins the
  // two properties that make that row safe rather than a blind spot: it is keyed
  // on the SAME citation (so both rows lapse together if the finding is rewritten)
  // and it is scoped to the ONE snapshot file (so a sibling snapshot carrying the
  // identical bytes still leaks).
  const root = initBase();
  const snapshot = 'docs/multi-session-work-loop/m9-after.json';
  const sibling = 'docs/multi-session-work-loop/m9-before.json';
  const citedLine = '{"finding": "old-repo pattern false-positives.'
    + ' `history-leak-scan.js:90` targets `C:\\_project\\my-claude-code-plugin\\x`"}';
  const unCitedLine = '{"finding": "leaked C:\\_project\\my-claude-code-plugin\\y"}';
  commit(root, {
    [snapshot]: [citedLine, unCitedLine, ''].join('\n'),
    // Same bytes as the exempted line, different file. A directory-wide or
    // content-keyed exemption would swallow this; a path-exact one must not.
    [sibling]: [citedLine, ''].join('\n'),
  });
  const res = scan.scanRange({ repoRoot: root, base: 'main' }); // NO explicit allowlist

  const snapHits = res.leaks.filter(function (l) { return l.path === snapshot; });
  assert.deepEqual(snapHits.map(function (l) { return l.line; }), [2],
    'only the un-cited line 2 leaks in the snapshot; the cited line 1 is suppressed: '
      + JSON.stringify(res.leaks));

  const sibHits = res.leaks.filter(function (l) { return l.path === sibling; });
  assert.equal(sibHits.length, 1,
    'the identical cited line in a SIBLING snapshot is still reported (exemption is path-exact): '
      + JSON.stringify(res.leaks));
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

test('F1: a NEW path onto a blob that ALREADY exists in base (allowlisted there) still leaks', function () {
  // Codex divergent F1: `git rev-list --objects base..HEAD` excludes objects
  // already reachable from base. A branch that copies an existing (base) leaking
  // blob to a NON-allowlisted new path therefore never entered `byOid`, and the
  // ls-tree walk's old `byOid.has(oid)` guard skipped it too — so the new
  // disclosure path escaped the scan entirely (reported ok). The base-tree map lets
  // the walk fold OLD blobs at any (oid,path) pair base did not already publish.
  const root = initBase();
  const leak = 'documented path ' + root + '/foo\n';
  // Put the leaking blob in BASE at an allowlisted path, then move `main` onto it
  // so the blob is already reachable from base (excluded by rev-list base..HEAD).
  commit(root, { 'docs/allowed.md': leak }, null, 'base-adds-allowlisted-leak');
  g(root, ['branch', '-f', 'main', 'HEAD']);
  // Feature commit: copy the SAME content to a non-allowlisted sibling path. Git
  // dedups identical content → SAME blob oid, which predates the new base.
  commit(root, { 'docs/other.md': leak }, null, 'copy-to-nonallowlisted-path');
  const res = scan.scanRange({
    repoRoot: root, base: 'main',
    allowlist: [{ path: 'docs/allowed.md' }],
  });
  assert.equal(res.ok, false, 'a new non-allowlisted path onto a pre-existing blob must still leak');
  assert.ok(res.leaks.some(function (l) { return l.path === 'docs/other.md'; }), 'docs/other.md leak reported');
  assert.ok(res.leaks.every(function (l) { return l.path !== 'docs/allowed.md'; }), 'the allowlisted base path stays suppressed');
});

test('F1 (Codex R2): ancestor-only old-blob path (copied then DELETED before HEAD) still leaks', function () {
  // The residual R1 missed: a net base..HEAD diff only sees paths present at HEAD.
  // A branch can copy a base-existing leaking blob to a non-allowlisted path in an
  // INTERMEDIATE commit, then delete that path before HEAD — pushed history still
  // carries the disclosure path, but the net diff no longer shows it. Walking EVERY
  // range commit's full tree (against the base-tree map) catches it: the
  // intermediate commit's tree still lists the path.
  const root = initBase();
  const leak = 'documented path ' + root + '/foo\n';
  commit(root, { 'docs/allowed.md': leak }, null, 'base-adds-allowlisted-leak');
  g(root, ['branch', '-f', 'main', 'HEAD']);
  // Intermediate commit copies the base blob to a non-allowlisted path...
  commit(root, { 'docs/sneaky.md': leak }, null, 'intermediate-copies-to-nonallowlisted');
  // ...then a later commit deletes it before HEAD (net diff no longer sees it).
  commit(root, { 'docs/clean.md': 'no leak\n' }, ['docs/sneaky.md'], 'tip-removes-sneaky');
  assert.ok(!fs.existsSync(path.join(root, 'docs/sneaky.md')), 'sneaky path is gone at HEAD');
  const res = scan.scanRange({
    repoRoot: root, base: 'main',
    allowlist: [{ path: 'docs/allowed.md' }],
  });
  assert.equal(res.ok, false, 'an ancestor-only disclosure path onto a base blob must still leak');
  assert.ok(res.leaks.some(function (l) { return l.path === 'docs/sneaky.md'; }), 'docs/sneaky.md leak reported from the intermediate commit');
  assert.ok(res.leaks.every(function (l) { return l.path !== 'docs/allowed.md'; }), 'the allowlisted base path stays suppressed');
});

test('F4 (Codex R4): a repo-root path with different CASE still leaks (Windows case-insensitivity)',
  // ci-full-suite M2 갈래 P — 가드는 이름이 아니라 실행으로 건다.
  //
  // 이 단언은 스캐너가 repo-root 패턴을 case-insensitive로 컴파일할 때만 참이고,
  // 그것은 history-leak-scan.js:130-136이 **드라이브 문자 루트일 때만** 한다
  // (POSIX 파일시스템은 case-sensitive라 대소문자 변형이 실제로 다른 경로이고,
  // `i`를 붙이면 과매칭한다 — 의도된 비대칭이다).
  //
  // 기존 가드 `if (variant === root) return;`은 그 성질의 프록시로 쓰였지만 틀린
  // 프록시다: `fs.mkdtempSync`의 6자 난수에 대문자가 하나만 섞여도 POSIX에서
  // `variant !== root`가 되어 가드가 열리고, 그 순간 case-sensitive 파일시스템에서
  // 참이 아닌 명제를 단언하게 된다. Linux CI의 red가 정확히 그 경로였다.
  { skip: process.platform === 'win32'
      ? false
      : 'Windows only (case-insensitive repo-root matching is drive-letter-gated)' },
  function () {
  // Windows paths are case-insensitive: C:\X and c:\x name the same root, so a leak
  // line spelling the repo root with a lowercased drive/segment must still be
  // caught. On POSIX (case-sensitive fs) a case variant is a genuinely different
  // path, so the repo-root pattern stays case-sensitive there and this does not
  // apply — the platform guard above owns that split, and F4b asserts the POSIX
  // half of it.
  const root = initBase();
  const variant = caseVariantOf(root);
  commit(root, { 'report.md': 'leaked path ' + variant + '/sub here\n' });
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, false, 'a case-variant of the repo root must still leak on Windows');
  assert.ok(res.leaks.some(function (l) { return /report\.md/.test(l.path) && l.pattern === 'repo-root'; }),
    'the differently-cased repo-root path is detected by the repo-root pattern');
});

// F4b — F4의 POSIX 절반. 이것이 없으면 Linux 에서 repo-root 대소문자 축의 커버리지가
// 0이다: F4는 그 플랫폼에서 통째로 skip 되고, 대신 참이어야 할 반대 명제
// (case-sensitive fs 에서 대소문자 변형은 **다른 경로**라 repo-root 로 잡히지 않는다)를
// 아무도 단언하지 않는다. 비대칭이 의도된 것이라면 양쪽을 다 고정해야 그 의도가
// 회귀에서 살아남는다 — 스캐너가 언젠가 `i` 를 무조건 붙이면 여기가 붉어진다.
test('F4b: on POSIX a case variant is a DIFFERENT path and must NOT match repo-root',
  { skip: process.platform === 'win32'
      ? 'POSIX only (Windows compiles the repo-root pattern case-insensitively)'
      : false },
  function () {
    const root = initBase();
    const variant = caseVariantOf(root);
    commit(root, { 'report.md': 'leaked path ' + variant + '/sub here\n' });
    const res = scan.scanRange({ repoRoot: root, base: 'main' });
    // `res.ok` 전체가 아니라 **repo-root 패턴만** 본다 — 다른 패턴이 이 줄을 잡는 것은
    // 이 test 의 명제와 무관하고, ok 를 단언하면 그 무관한 변화에 결속된다.
    assert.ok(!res.leaks.some(function (l) {
      return /report\.md/.test(l.path) && l.pattern === 'repo-root';
    }), 'case-sensitive fs: a differently-cased path is a genuinely different path');
  });

test('empty range (HEAD === base) → ok, nothing scanned', function () {
  const root = buildRepo([]); // no extra commits: HEAD === main
  const res = scan.scanRange({ repoRoot: root, base: 'main' });
  assert.equal(res.ok, true);
  assert.equal(res.commits, 0);
  assert.equal(res.scanned_blobs, 0);
});

test('F5 (Codex R5): the scanner source must not embed THIS repo root in its own comments', function () {
  // F4 made repo-root matching case-insensitive; a comment that spells the real
  // workspace root (even as an example) is then flagged by the scanner against its
  // own source, failing the mandatory pre-push gate. Examples MUST be synthetic
  // (X:/parent/repo). Guard: compile patterns from the ACTUAL repo root and assert
  // the scanner source file has zero matches. Uses the dynamic root so it is not
  // tied to any checkout location.
  let realRoot;
  try { realRoot = g(process.cwd(), ['rev-parse', '--show-toplevel']); }
  catch (_e) { return; } // not in a git repo (unlikely in CI) — skip
  const patterns = scan.buildLeakPatterns(realRoot);
  const srcPath = path.resolve(__dirname, '..', 'history-leak-scan.js');
  const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);
  lines.forEach(function (line, i) {
    for (const pat of patterns) {
      assert.ok(!pat.re.test(line),
        'history-leak-scan.js:' + (i + 1) + ' embeds the real repo root (' + pat.name + '): ' + line.trim());
    }
  });
});

test('F3 (Codex R3): unresolved base ref → fail-CLOSED (ok:false scan-error), NOT silent pass', function () {
  // An empty range (HEAD===base) is ok:true; an UNRESOLVED base is different — it
  // is unclassified. When no base candidate resolves (bare CI checkout without
  // origin/main|master or main|master), the mandatory pre-push gate must NOT
  // publish HEAD unscanned. rev-parse throws for every candidate here.
  const gitFn = function (args) {
    const a = args.join(' ');
    if (a.indexOf('rev-parse') === 0) throw new Error('fatal: Needed a single revision');
    throw new Error('unexpected git call: ' + a);
  };
  const res = scan.scanRange({ repoRoot: '/fake-repo', gitFn: gitFn }); // no opts.base either
  assert.equal(res.ok, false, 'an unresolved base must fail closed, not pass silently');
  assert.equal(res.base, null);
  assert.ok((res.leaks || []).some(function (l) { return l.pattern === 'scan-error'; }), 'a scan-error is recorded');
  assert.ok((res.leaks || []).some(function (l) { return /no base ref resolved/.test(l.evidence); }));
});

test('R4/F2: a blob that cannot be read (e.g. >64MiB maxBuffer throw) is fail-CLOSED, not silently skipped', function () {
  const gitFn = function (args) {
    const a = args.join(' ');
    if (a.indexOf('rev-parse') === 0) return 'deadbeef';                       // base resolves
    if (a.indexOf('rev-list --count') === 0) return '1\n';
    if (a.indexOf('rev-list --objects') === 0) return 'oid1 clean.json\noid2 big.json\n';
    if (a.indexOf('ls-tree') === 0) return '';          // M2 F1 base-tree map + walk — empty base tree
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
    if (a.indexOf('ls-tree') === 0) return '';          // M2 F1 base-tree map + walk — empty base tree
    if (a === 'cat-file -t oidX') throw new Error('cat-file: bad object oidX');
    throw new Error('unexpected git call: ' + a);
  };
  const res = scan.scanRange({ repoRoot: '/fake-repo', base: 'main', gitFn: gitFn });
  assert.equal(res.ok, false);
  assert.ok((res.leaks || []).some(function (l) { return l.pattern === 'scan-error'; }));
});
