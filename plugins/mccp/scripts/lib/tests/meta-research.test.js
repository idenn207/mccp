'use strict';

// meta-research — scaffold / register / lint contract.
//
// Assertions target the `--json` shape (`code`, `exempt`), never the
// human-readable message strings: message text is regression-fragile, so `code`
// is the contract. The ordering regression (L3 screens lexically BEFORE
// touching the filesystem) is decided mechanically by whether a `..` reference
// reports REF_OUTSIDE_REPO rather than REF_NOT_FOUND.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const M = require('../meta-research');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// --- fixtures ---------------------------------------------------------------

function writeReadme(root, withIndex) {
  const lines = ['# `.claude/_meta/`', ''];
  if (withIndex) {
    lines.push('## 색인', '', '| 문서 | 날짜 | 상태 | 한 줄 |', '|---|---|---|---|', '');
  }
  lines.push('## 이력', '', 'x', '');
  fs.writeFileSync(path.join(root, '.claude', '_meta', 'README.md'), lines.join('\n'));
}

function mkRepo(opts) {
  opts = opts || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-meta-research-'));
  if (opts.metaDir !== false) {
    fs.mkdirSync(path.join(root, '.claude', '_meta'), { recursive: true });
    writeReadme(root, opts.index !== false);
  } else {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  }
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'target.js'), '// fixture\n');
  return root;
}

function mkOutside() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-meta-outside-'));
  fs.writeFileSync(path.join(dir, 'target.js'), '// outside\n');
  return dir;
}

// Directory links only. On win32 a JUNCTION needs no elevation (unlike a file
// symlink), so the containment proofs below actually run on the target platform
// instead of being skipped into vacuous green.
// Precedent: migrations/tests/path-containment.test.js:33-47,
//            receipt/tests/store-readreceipt-symlink.test.js:27-35.
function tryCreateDirLink(targetDir, linkPath) {
  try {
    if (process.platform === 'win32') fs.symlinkSync(targetDir, linkPath, 'junction');
    else fs.symlinkSync(targetDir, linkPath, 'dir');
    return true;
  } catch (_e) { return false; }
}

const SECTIONS = ['Premises', 'Evidence', 'Prior Art', 'Precedent', 'Verdict', 'Open Questions'];

function docBody(o) {
  o = o || {};
  const topic = o.topic || 'Fixture topic';
  const out = ['# ' + topic, ''];
  if (o.omit !== '**Status**') out.push('**Status**: ' + (o.status || 'active'));
  if (o.omit !== '**Date**') out.push('**Date**: ' + (o.date || '2026-08-13'));
  if (o.omit !== '**Topic**') out.push('**Topic**: ' + topic);
  out.push('');
  for (const s of SECTIONS) {
    if (o.omit === '## ' + s) continue;
    out.push('## ' + s, '');
    if (s === 'Premises') {
      out.push('| # | 참조 | 시점 | 무엇을 전제하는가 |', '|---|---|---|---|');
      for (const r of (o.rows || [])) out.push(r);
      out.push('');
    }
  }
  return out.join('\n') + '\n';
}

function premise(ref, when) {
  return '| 1 | ' + ref + ' | ' + (when === undefined ? '2026-08-13' : when) + ' | x |';
}

function writeDoc(root, filename, body) {
  fs.writeFileSync(path.join(root, '.claude', '_meta', filename), body);
  return '.claude/_meta/' + filename;
}

function codes(r) { return r.violations.map(function (v) { return v.code; }); }

function specLint(root, rel) {
  // --pre-register isolates L1/L2/L3 (and gives that mode real coverage).
  return M.lint({ repoRoot: root, doc: rel, preRegister: true });
}

function throwsCode(fn, code) {
  assert.throws(fn, function (err) {
    assert.equal(err.code, code, 'expected code ' + code + ', got ' + err.code + ': ' + err.message);
    return true;
  });
}

function metaFiles(root) {
  return fs.readdirSync(path.join(root, '.claude', '_meta')).sort();
}

// --- T0 round trip ----------------------------------------------------------
// The single machine-checkable evidence for the PRD's "procedure reproducibility"
// metric at the lib layer.

test('T0: scaffold → premises → register → green, and re-register updates in place', function () {
  const root = mkRepo();
  const s = M.scaffold({ repoRoot: root, topic: 'Round trip', slug: 'round-trip', date: '2026-08-13' });
  assert.ok(fs.existsSync(s.path), 'scaffold wrote the document');
  const rel = '.claude/_meta/2026-08-13-round-trip.md';

  // 1. born lint-red on L3 (empty Premises), green on L2
  const step1 = M.lint({ repoRoot: root, doc: rel });
  assert.ok(codes(step1).indexOf('PREMISES_EMPTY') !== -1, 'scaffold output is deliberately L3-red');
  assert.equal(codes(step1).indexOf('MISSING_COMPONENT'), -1, 'the template satisfies all nine L2 points');

  // 2. premises filled → still red, now only because it is unindexed
  const body = fs.readFileSync(s.path, 'utf8')
    .replace('|---|---|---|---|\n', '|---|---|---|---|\n' + premise('src/target.js') + '\n');
  fs.writeFileSync(s.path, body);
  const step2 = M.lint({ repoRoot: root, doc: rel });
  assert.deepStrictEqual(codes(step2), ['NOT_INDEXED'], 'only L4 remains');

  // 3. register → clean
  M.register({ repoRoot: root, doc: rel });
  const step3 = M.lint({ repoRoot: root, doc: rel });
  assert.equal(step3.ok, true, JSON.stringify(step3.violations));

  // 4. status change → same row count, and the STATUS CELL IS REFRESHED.
  //    Counting rows alone would pass an implementation that never re-reads the
  //    header — the value refresh is what idempotency actually means.
  const readme = M.readmeOf(root);
  const rowsOf = function () {
    return fs.readFileSync(readme, 'utf8').split('\n').filter(function (l) { return l.startsWith('| ['); });
  };
  assert.equal(rowsOf().length, 1);
  fs.writeFileSync(s.path, fs.readFileSync(s.path, 'utf8').replace('**Status**: active', '**Status**: superseded'));
  M.register({ repoRoot: root, doc: rel });
  const rows = rowsOf();
  assert.equal(rows.length, 1, 'idempotent: no second row');
  assert.match(rows[0], /superseded/, 'the status cell is updated, not stale');
});

// --- command skeleton contract ---------------------------------------------

test('command body: five phases in order and Phase 4 fixes the three-call order', function () {
  const body = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'mccp', 'commands', 'meta-research.md'), 'utf8');
  const heads = Array.from(body.matchAll(/^## Phase ([0-4]) — /gm));
  assert.equal(heads.length, 5, 'all five investigation phases must be defined');
  assert.deepStrictEqual(heads.map(function (m) { return m[1]; }), ['0', '1', '2', '3', '4']);
  for (let i = 1; i < heads.length; i++) {
    assert.ok(heads[i].index > heads[i - 1].index, 'phases appear in ascending order');
  }

  const rest = body.slice(heads[4].index + 1);
  const nextHeading = rest.search(/^## /m);
  const block = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  const iPre = block.indexOf('lint --doc "$DOC" --pre-register');
  const iReg = block.indexOf('register --doc "$DOC"');
  const iFull = block.indexOf('lint --doc "$DOC" --json');
  assert.ok(iPre !== -1, 'Phase 4 must call lint --pre-register');
  assert.ok(iReg !== -1, 'Phase 4 must call register');
  assert.ok(iFull !== -1, 'Phase 4 must call the full lint');
  // Order, not just presence: register before the pre-register lint reopens the
  // orphan-index window that this ordering exists to close.
  assert.ok(iPre < iReg, 'lint --pre-register must precede register');
  assert.ok(iReg < iFull, 'register must precede the closing full lint');
});

// --- scaffold negatives (6) -------------------------------------------------

test('scaffold negative: --slug traversal is rejected before any write', function () {
  const root = mkRepo();
  const before = metaFiles(root);
  throwsCode(function () {
    M.scaffold({ repoRoot: root, topic: 'x', slug: '../../etc/x', date: '2026-08-13' });
  }, 'BAD_SLUG');
  assert.deepStrictEqual(metaFiles(root), before, 'nothing was written');
});

test('scaffold negative: --date traversal is rejected before any write', function () {
  const root = mkRepo();
  const before = metaFiles(root);
  throwsCode(function () {
    M.scaffold({ repoRoot: root, topic: 'x', slug: 'demo', date: '2026-08-13/../x' });
  }, 'BAD_DATE');
  assert.deepStrictEqual(metaFiles(root), before, 'nothing was written');
});

test('scaffold negative: a Korean topic with no --slug fails closed', function () {
  const root = mkRepo();
  throwsCode(function () {
    M.scaffold({ repoRoot: root, topic: '한국어 주제', date: '2026-08-13' });
  }, 'BAD_SLUG');
});

test('scaffold negative: refuses to overwrite an existing document', function () {
  const root = mkRepo();
  M.scaffold({ repoRoot: root, topic: 'x', slug: 'demo', date: '2026-08-13' });
  throwsCode(function () {
    M.scaffold({ repoRoot: root, topic: 'x', slug: 'demo', date: '2026-08-13' });
  }, 'DOC_EXISTS');
});

test('scaffold negative: a missing _meta/ fails with its own reason, not a containment error', function () {
  const root = mkRepo({ metaDir: false });
  throwsCode(function () {
    M.scaffold({ repoRoot: root, topic: 'x', slug: 'demo', date: '2026-08-13' });
  }, 'META_DIR_MISSING');
});

test('scaffold negative: a _meta/ linked outside the repo is refused (containment layer 2)', function () {
  const root = mkRepo({ metaDir: false });
  const outside = mkOutside();
  const linkPath = path.join(root, '.claude', '_meta');
  // Not skippable: the "fires" half of the containment proof disappears if this
  // becomes a skip, and then deleting the assertContained call stays green.
  assert.ok(tryCreateDirLink(outside, linkPath),
    'directory link must be creatable (win32=junction, POSIX=dir) — the containment proof may not be skipped');
  throwsCode(function () {
    M.scaffold({ repoRoot: root, topic: 'x', slug: 'demo', date: '2026-08-13' });
  }, 'PATH_ESCAPES_GATE');
});

// --- register negatives (3) -------------------------------------------------

test('register negative: a document without **Date** is refused (no blank index cells)', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ omit: '**Date**' }));
  throwsCode(function () { M.register({ repoRoot: root, doc: rel }); }, 'MISSING_HEADER_FIELD');
});

test('register negative: a README without the `## 색인` table is refused before any write', function () {
  const root = mkRepo({ index: false });
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({}));
  const readme = M.readmeOf(root);
  const before = fs.readFileSync(readme, 'utf8');
  throwsCode(function () { M.register({ repoRoot: root, doc: rel }); }, 'INDEX_SECTION_MISSING');
  assert.equal(fs.readFileSync(readme, 'utf8'), before, 'README untouched');
  assert.deepStrictEqual(
    fs.readdirSync(path.join(root, '.claude', '_meta')).filter(function (f) { return f.endsWith('.tmp'); }),
    [], 'no tmp file was created on the refused path');
});

test('register negative: a --doc outside _meta/ is refused before indexing', function () {
  const root = mkRepo();
  fs.writeFileSync(path.join(root, 'src', 'stray.md'), docBody({}));
  throwsCode(function () { M.register({ repoRoot: root, doc: 'src/stray.md' }); }, 'DOC_OUTSIDE_META');
});

// --- L1 (1) -----------------------------------------------------------------

test('L1: a spec doc with a non-conforming filename reports BAD_FILENAME', function () {
  // The fixture MUST carry **Status**: without it the exemption predicate fires
  // and L1 never runs, so an entirely missing L1 implementation would look green.
  const root = mkRepo();
  const rel = writeDoc(root, 'no-date-prefix.md', docBody({ rows: [premise('src/target.js')] }));
  const r = specLint(root, rel);
  assert.ok(codes(r).indexOf('BAD_FILENAME') !== -1, JSON.stringify(r.violations));
});

// --- L2 (9 inspection points) ----------------------------------------------

for (const key of ['**Date**', '**Topic**']) {
  test('L2: a header missing ' + key + ' reports MISSING_COMPONENT', function () {
    const root = mkRepo();
    const rel = writeDoc(root, '2026-08-13-a.md', docBody({ omit: key, rows: [premise('src/target.js')] }));
    const r = specLint(root, rel);
    const hit = r.violations.filter(function (v) { return v.code === 'MISSING_COMPONENT' && v.detail === key; });
    assert.equal(hit.length, 1, 'checking only "is there a header block?" would let this through');
  });
}

for (const section of SECTIONS) {
  test('L2: a document missing ## ' + section + ' reports MISSING_COMPONENT', function () {
    const root = mkRepo();
    const rel = writeDoc(root, '2026-08-13-a.md', docBody({ omit: '## ' + section, rows: [premise('src/target.js')] }));
    const r = specLint(root, rel);
    const hit = r.violations.filter(function (v) {
      return v.code === 'MISSING_COMPONENT' && v.detail === '## ' + section;
    });
    assert.equal(hit.length, 1, JSON.stringify(r.violations));
  });
}

// The ninth L2 point, **Status**, is UNREACHABLE as a violation by construction:
// it is also the exemption predicate, so a document without it is exempt rather
// than in breach. This case pins that interaction so nobody "fixes" the gap by
// making L2 fire — which would drag every legacy document back under L1/L2/L3.
test('L2: **Status** is the exemption predicate, so its absence exempts rather than violates', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ omit: '**Status**' }));
  const r = specLint(root, rel);
  assert.deepStrictEqual(r.exempt, [{ doc: '2026-08-13-a.md', reason: 'no-status-header' }]);
  assert.deepStrictEqual(codes(r), [], 'no L1/L2/L3 violation is raised for an exempt document');
});

// --- L3 (7) -----------------------------------------------------------------

const LEXICAL = [
  ['parent traversal', '../../etc/passwd'],
  ['absolute path', process.platform === 'win32' ? '\\etc\\passwd' : '/etc/passwd'],
  ['drive letter', 'C:\\Windows\\System32\\drivers\\etc\\hosts'],
  ['UNC path', '\\\\server\\share\\x.js'],
  ['NUL byte', 'src/target.js\u0000../etc'],
];

for (const pair of LEXICAL) {
  test('L3 lexical: ' + pair[0] + ' reports REF_OUTSIDE_REPO', function () {
    const root = mkRepo();
    const rel = writeDoc(root, '2026-08-13-a.md', docBody({ rows: [premise(pair[1])] }));
    const r = specLint(root, rel);
    assert.ok(codes(r).indexOf('REF_OUTSIDE_REPO') !== -1, JSON.stringify(r.violations));
    // Ordering regression: the lexical screen must run BEFORE the filesystem, or
    // an escape gets misfiled under the innocuous "path not found".
    assert.equal(codes(r).indexOf('REF_NOT_FOUND'), -1,
      'an escape must not be reported as REF_NOT_FOUND (lexical screen runs first)');
  });
}

test('L3: a non-existent reference reports REF_NOT_FOUND', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ rows: [premise('src/does-not-exist.js')] }));
  const r = specLint(root, rel);
  assert.ok(codes(r).indexOf('REF_NOT_FOUND') !== -1, JSON.stringify(r.violations));
});

test('L3: an unparseable timestamp reports BAD_TIMESTAMP', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md',
    docBody({ rows: [premise('src/target.js', 'sometime in August')] }));
  const r = specLint(root, rel);
  assert.ok(codes(r).indexOf('BAD_TIMESTAMP') !== -1, JSON.stringify(r.violations));
});

// --- L4 (1) -----------------------------------------------------------------

test('L4: an unregistered document reports NOT_INDEXED', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ rows: [premise('src/target.js')] }));
  const r = M.lint({ repoRoot: root, doc: rel });
  assert.deepStrictEqual(codes(r), ['NOT_INDEXED']);
});

// --- positives (3) ----------------------------------------------------------

test('L3 positive: a plain repo-relative reference passes', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ rows: [premise('src/target.js')] }));
  assert.deepStrictEqual(codes(specLint(root, rel)), []);
});

test('L3 positive: a `path:98-102` line-range suffix is stripped before the existence check', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ rows: [premise('src/target.js:98-102')] }));
  assert.deepStrictEqual(codes(specLint(root, rel)), []);
});

test('L3 positive: a backtick-wrapped reference is unwrapped before the existence check', function () {
  const root = mkRepo();
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ rows: [premise('`src/target.js:12`')] }));
  assert.deepStrictEqual(codes(specLint(root, rel)), [],
    'not unwrapping backticks would make every normal citation REF_NOT_FOUND');
});

// --- containment regressions ------------------------------------------------

test('API contract: scaffold does NOT raise PATH_ESCAPES_GATE on a well-formed _meta/', function () {
  // Locks two ways of getting assertContained wrong: passing a truthy third
  // argument (which demands the parent live under .claude/receipts, so it always
  // throws) and anchoring the not-yet-created target file (which cannot realpath).
  const root = mkRepo();
  assert.doesNotThrow(function () {
    M.scaffold({ repoRoot: root, topic: 'x', slug: 'demo', date: '2026-08-13' });
  });
});

test('L3 containment: a reference reached through a directory link out of the repo is caught', function () {
  // This path clears all five lexical axes (no absolute, drive, UNC, .., or NUL)
  // and existsSync is true — so the realpath anchor is the ONLY thing that can
  // catch it. Without a "fires" case the whole layer could be deleted silently.
  const root = mkRepo();
  const outside = mkOutside();
  const linkPath = path.join(root, '.claude', '_meta', 'outside');
  assert.ok(tryCreateDirLink(outside, linkPath),
    'directory link must be creatable (win32=junction, POSIX=dir) — the containment proof may not be skipped');
  const rel = writeDoc(root, '2026-08-13-a.md',
    docBody({ rows: [premise('.claude/_meta/outside/target.js')] }));
  const r = specLint(root, rel);
  assert.ok(codes(r).indexOf('REF_OUTSIDE_REPO') !== -1, JSON.stringify(r.violations));
});

// --- concurrency ------------------------------------------------------------

test('register: a stale lock is reclaimed and both rows survive', function () {
  const root = mkRepo();
  const a = writeDoc(root, '2026-08-13-a.md', docBody({ topic: 'A' }));
  const b = writeDoc(root, '2026-08-13-b.md', docBody({ topic: 'B' }));
  M.register({ repoRoot: root, doc: a });

  const readme = M.readmeOf(root);
  const lock = readme + '.lock';
  fs.writeFileSync(lock, String(process.pid) + '\nstale');
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lock, old, old);

  M.register({ repoRoot: root, doc: b });
  const text = fs.readFileSync(readme, 'utf8');
  assert.match(text, /\[2026-08-13-a\.md\]/, 'the earlier row must not be dropped');
  assert.match(text, /\[2026-08-13-b\.md\]/);
  assert.equal(fs.existsSync(lock), false, 'the lock is released');
  assert.deepStrictEqual(
    fs.readdirSync(path.join(root, '.claude', '_meta')).filter(function (f) { return f.endsWith('.tmp'); }),
    [], 'no tmp leftover');
});

test('register: the tmp name is unique per call', function () {
  // A fixed `<target>.tmp` makes concurrent writers collide in the tmp stage
  // itself, which the lock alone does not prevent (CLAUDE.md §3.6).
  const a = M.tmpNameFor(path.join('x', 'README.md'));
  const b = M.tmpNameFor(path.join('x', 'README.md'));
  assert.notEqual(a, b);
  assert.match(a, /README\.md\.\d+\.[0-9a-f]{12}\.tmp$/);
});

// --- README byte preservation + index-range boundary ------------------------

test('register: a mixed-EOL README keeps every untouched line byte-identical', function () {
  // Regression for santa R1 (Codex, HIGH): split(/\r?\n/) + join(detectedEol)
  // rewrote the ending of every line, so adding one row silently reformatted
  // lines this command never touched.
  const root = mkRepo({ index: false });
  const readme = M.readmeOf(root);
  const before = '# x\r\n\r\n## 색인\r\n\r\n| 문서 | 날짜 | 상태 | 한 줄 |\r\n|---|---|---|---|\r\n'
    + '\r\n## 이력\n\nLF-only line\nanother LF line\n';
  fs.writeFileSync(readme, before);
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ topic: 'T' }));

  M.register({ repoRoot: root, doc: rel });
  const after = fs.readFileSync(readme, 'utf8');

  const lfOnly = function (s) { return (s.match(/(?<!\r)\n/g) || []).length; };
  assert.equal(lfOnly(after), lfOnly(before), 'LF-only lines must not be converted to CRLF');
  // Everything except the single inserted row is unchanged, terminators included.
  const inserted = after.split(/\r\n|\n/).filter(function (l) { return l.indexOf('[2026-08-13-a.md]') !== -1; });
  assert.equal(inserted.length, 1);
  assert.equal(after.replace('| [2026-08-13-a.md](2026-08-13-a.md) | 2026-08-13 | active | T |\r\n', ''), before,
    'removing just the inserted row must reproduce the original bytes');
});

test('register: a CRLF-only README stays CRLF', function () {
  const root = mkRepo({ index: false });
  const readme = M.readmeOf(root);
  fs.writeFileSync(readme, '# x\r\n\r\n## 색인\r\n\r\n| 문서 | 날짜 | 상태 | 한 줄 |\r\n|---|---|---|---|\r\n\r\n## 이력\r\n');
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ topic: 'T' }));
  M.register({ repoRoot: root, doc: rel });
  const after = fs.readFileSync(readme, 'utf8');
  assert.equal((after.match(/(?<!\r)\n/g) || []).length, 0, 'no bare LF introduced');
  assert.match(after, /\| \[2026-08-13-a\.md\]\(2026-08-13-a\.md\) \|[^\n]*\r\n/, 'the new row is CRLF-terminated');
});

test('lint: a lone-CR document parses like any other', function () {
  // Regression for santa R2 (Codex, HIGH): section detection split on /\r?\n/,
  // so a classic-Mac document was one long line and every `##` heading went
  // undetected. Header parsing was already CR-safe (JS multiline anchors on CR),
  // which is what made it invisible — the document passed the spec-doc predicate
  // and then failed every section check. Measured: 7 false violations.
  const root = mkRepo();
  const body = docBody({ rows: [premise('src/target.js')] }).replace(/\n/g, '\r');
  const rel = writeDoc(root, '2026-08-13-cr.md', body);
  assert.deepStrictEqual(codes(specLint(root, rel)), [],
    'a valid document must not go red merely for using CR line endings');
});

test('register: stale duplicate index rows are repaired, not left behind', function () {
  // Regression for santa R2 (Codex, HIGH): only the first match was updated, so
  // a hand-edited duplicate survived carrying different values for the same
  // document while L4 (a Set) still reported it reachable.
  const root = mkRepo({ index: false });
  fs.writeFileSync(M.readmeOf(root), [
    '# x', '', '## 색인', '',
    '| 문서 | 날짜 | 상태 | 한 줄 |', '|---|---|---|---|',
    '| [2026-08-13-a.md](2026-08-13-a.md) | 2026-01-01 | active | first |',
    '| [2026-08-13-a.md](2026-08-13-a.md) | 2026-01-01 | active | STALE DUPLICATE |',
    '', '## 이력', '',
  ].join('\n'));
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ topic: 'A', status: 'superseded' }));

  const r = M.register({ repoRoot: root, doc: rel });
  assert.equal(r.duplicatesRemoved, 1);
  const rows = fs.readFileSync(M.readmeOf(root), 'utf8').split('\n').filter(function (l) { return l.startsWith('| ['); });
  assert.equal(rows.length, 1, 'the duplicate is removed, not merely skipped');
  assert.match(rows[0], /superseded/);
  assert.equal(rows[0].indexOf('STALE DUPLICATE'), -1);
});

test('L4: a duplicated index row is reported rather than passing as reachable', function () {
  const root = mkRepo({ index: false });
  fs.writeFileSync(M.readmeOf(root), [
    '# x', '', '## 색인', '',
    '| 문서 | 날짜 | 상태 | 한 줄 |', '|---|---|---|---|',
    '| [2026-08-13-a.md](2026-08-13-a.md) | 2026-08-13 | active | one |',
    '| [2026-08-13-a.md](2026-08-13-a.md) | 2026-08-13 | superseded | two |',
    '', '## 이력', '',
  ].join('\n'));
  const rel = writeDoc(root, '2026-08-13-a.md', docBody({ rows: [premise('src/target.js')] }));
  const r = M.lint({ repoRoot: root, doc: rel });
  assert.deepStrictEqual(codes(r), ['DUPLICATE_INDEX_ROW'],
    'reachability alone would read a self-contradicting index as healthy');
  assert.deepStrictEqual(M.indexRowTargets(root), ['2026-08-13-a.md', '2026-08-13-a.md'],
    'the multiset is what makes the duplicate visible; a Set collapses it');
});

test('index range: a second table later in the same section is NOT absorbed', function () {
  // santa R1 (Codex) claimed the row scan keeps consuming `|` rows past a blank
  // line and swallows a following table. Measured false — the scan stops at the
  // first non-`|` line. This pins that boundary so the claimed shape cannot be
  // introduced later without going red.
  const lines = [
    '# x', '',
    '## 색인', '',
    '| 문서 | 날짜 | 상태 | 한 줄 |',
    '|---|---|---|---|',
    '| [a.md](a.md) | 2026-08-14 | active | first |',
    '',
    '산문 문단',
    '',
    '| other | table |',
    '|---|---|',
    '| [trap.md](trap.md) | x |',
    '',
    '## 이력',
  ];
  const t = M.locateIndexTable(lines);
  assert.equal(t.rowStart, 6);
  assert.equal(t.rowEnd, 7, 'the row range ends at the blank line, not at the next heading');
  assert.deepStrictEqual(lines.slice(t.rowStart, t.rowEnd), ['| [a.md](a.md) | 2026-08-14 | active | first |']);
});

test('index range: a trailing table does not leak into L4 reachability', function () {
  const root = mkRepo({ index: false });
  fs.writeFileSync(M.readmeOf(root), [
    '# x', '', '## 색인', '',
    '| 문서 | 날짜 | 상태 | 한 줄 |', '|---|---|---|---|',
    '| [a.md](a.md) | 2026-08-14 | active | first |', '',
    '다른 표:', '',
    '| other | table |', '|---|---|', '| [trap.md](trap.md) | x |', '',
    '## 이력', '',
  ].join('\n'));
  const targets = M.indexedTargets(root);
  assert.equal(targets.has('a.md'), true);
  assert.equal(targets.has('trap.md'), false, 'a row outside the index table must not count as indexed');
});

// --- exemption + real repo --------------------------------------------------

test('exemption: a legacy-shaped doc is exempt from L1/L2/L3, listed once, and still L4-checked', function () {
  const root = mkRepo();
  // Deliberately date-prefix-free, mirroring the real verification-layer-design.md,
  // so an implementation that forgot to wire the predicate into L1 goes red.
  fs.writeFileSync(path.join(root, '.claude', '_meta', 'verification-layer-design.md'),
    '# Legacy\n\n> 상태: 참고\n\n본문\n');
  const r = M.lint({ repoRoot: root, all: true });
  assert.deepStrictEqual(r.exempt, [{ doc: 'verification-layer-design.md', reason: 'no-status-header' }],
    'exactly one entry per exempt document, so exempt.length reads as a document count');
  assert.deepStrictEqual(codes(r), ['NOT_INDEXED'],
    'L4 still applies to exempt documents — that is what keeps discoverability intact');
});

test('real repo: lint --all is green and exempts exactly the five legacy documents', function () {
  const readme = M.readmeOf(REPO_ROOT);
  const text = fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : '';
  if (!/^## 색인$/m.test(text)) {
    // Loud skip, never silent green: before the index backfill every legacy doc
    // is NOT_INDEXED and that red would be misread as a lib defect.
    process.stderr.write('SKIP real-repo regression: `## 색인` section absent from ' + readme + '\n');
    return;
  }
  const r = M.lint({ repoRoot: REPO_ROOT, all: true });
  assert.equal(r.ok, true, 'violations: ' + JSON.stringify(r.violations));
  // A set, not a count: with a length check a legacy doc could vanish and a
  // non-conforming new doc take its place while the number stayed 5.
  assert.deepStrictEqual(r.exempt.map(function (e) { return e.doc; }).sort(), [
    '2026-08-12-prd-decomposition-addendum.md',
    '2026-08-12-review-loop-meta-analysis.md',
    'converged-redefinition-design.md',
    'diverse-agent-review-analysis.md',
    'verification-layer-design.md',
  ]);
});
