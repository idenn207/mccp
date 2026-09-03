'use strict';

// review-record-linkage M3 — back-patch transform · decision binding · evidence carrier.
//
// Three surfaces, one file, because they are one contract: the transform writes the
// hash, the binding decides whether it MAY, and the carrier tells Phase 3.0 what a
// successful write produced. Splitting them would let each be green while the seam
// between them is broken.
//
// The negative cases are the body of this file. A back-patch that only proves it can
// write the happy path proves nothing about the failure this milestone exists to
// close — mutating ANOTHER decision's git-tracked review record.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const lr = require('../plan-review/link-receipt');
const corpus = require('../plan-review/corpus');
const CLI = path.join(__dirname, '..', 'plan-review', 'cli.js');

// The canonical shape is the receipt's own `sha256:<64hex>` field format. An earlier
// draft of this suite used bare hex and passed against a contract no producer in this
// repository satisfies — the fixtures must speak the pipeline's vocabulary.
const HASH = 'sha256:' + 'a'.repeat(64);
const HASH2 = 'sha256:' + 'b'.repeat(64);
const PLAN = '.claude/plans/mine.plan.md';

function panel(slug, measurement) {
  const L = ['# Plan Review Panel — ' + slug, '',
    '**Verdict**: `divergent` via `multi-agent`', '',
    '## Findings', '', 'None.', ''];
  if (measurement !== null) {
    L.push('## Measurement', '', '```json', JSON.stringify(measurement, null, 2), '```', '');
  }
  return L.join('\n');
}

// ── applyReceiptHash ─────────────────────────────────────────────────────────

test('applyReceiptHash sets receipt_hash and touches nothing else', function () {
  const before = panel('mine', {
    verdict: 'divergent', source: 'multi-agent', wall_clock_ms: 710100,
    plan_path: PLAN, receipt_hash: null,
  });
  const r = lr.applyReceiptHash(before, HASH);
  assert.equal(r.ok, true);
  const m = corpus.parseRecord(r.markdown).measurement;
  assert.equal(m.receipt_hash, HASH);
  assert.equal(m.verdict, 'divergent');
  assert.equal(m.source, 'multi-agent');
  assert.equal(m.wall_clock_ms, 710100);
  assert.equal(m.plan_path, PLAN);
});

test('applyReceiptHash is idempotent — twice equals once', function () {
  const before = panel('mine', { verdict: 'divergent', plan_path: PLAN, receipt_hash: null });
  const once = lr.applyReceiptHash(before, HASH).markdown;
  const twice = lr.applyReceiptHash(once, HASH).markdown;
  assert.equal(twice, once);
});

test('applyReceiptHash preserves CRLF — this repository runs on Windows', function () {
  // core.autocrlf can hand us CRLF. Re-emitting LF would rewrite every line of the
  // block as a diff, which is the drift the frozen-baseline axis fights elsewhere.
  const before = panel('mine', { plan_path: PLAN, receipt_hash: null }).replace(/\n/g, '\r\n');
  const r = lr.applyReceiptHash(before, HASH);
  assert.equal(r.ok, true);
  assert.equal(r.markdown.indexOf('\n\n') === -1 || r.markdown.indexOf('\r\n') !== -1, true);
  assert.ok(r.markdown.indexOf('\r\n') !== -1, 'CRLF must survive the transform');
});

test('applyReceiptHash refuses a non-hex hash and a non-panel document', function () {
  const rec = panel('mine', { plan_path: PLAN, receipt_hash: null });
  assert.equal(lr.applyReceiptHash(rec, 'nope').ok, false);
  assert.equal(lr.applyReceiptHash(rec, HASH.toUpperCase()).ok, false);
  assert.equal(lr.applyReceiptHash(rec, 'a'.repeat(64)).ok, false, 'bare hex is NOT the receipt field format');
  assert.equal(lr.applyReceiptHash('# PR 9 review\n\nnot a panel\n', HASH).ok, false);
  assert.equal(lr.applyReceiptHash(panel('mine', null), HASH).ok, false, 'no Measurement fence');
  assert.equal(lr.applyReceiptHash('', HASH).ok, false);
  assert.equal(lr.applyReceiptHash(null, HASH).ok, false);
});

test('the corpus contract holds — a back-patched record is still kind="record"', function () {
  // Task 3's contract test. `linkage-audit.js` reaches the record only through
  // `corpus.parseRecord`, so a transform that produced valid-looking markdown the
  // parser rejects would silently drop the record out of every denominator.
  const before = panel('mine', { verdict: 'converged', plan_path: PLAN, receipt_hash: null });
  const after = lr.applyReceiptHash(before, HASH).markdown;
  const parsed = corpus.parseRecord(after);
  assert.equal(parsed.kind, 'record');
  assert.equal(parsed.measurement.receipt_hash, HASH);
});

// ── bindsToPlanPath ──────────────────────────────────────────────────────────

test('bindsToPlanPath accepts notation variance but not a different file', function () {
  const rec = panel('mine', { plan_path: PLAN, receipt_hash: null });
  assert.equal(lr.bindsToPlanPath(rec, PLAN, '/repo').ok, true);
  assert.equal(lr.bindsToPlanPath(rec, './' + PLAN, '/repo').ok, true);
  assert.equal(lr.bindsToPlanPath(rec, '.claude//plans/./mine.plan.md', '/repo').ok, true);
  assert.equal(lr.bindsToPlanPath(rec, '.claude/plans/theirs.plan.md', '/repo').ok, false);
});

test('bindsToPlanPath refuses absence — a legacy record is not a match', function () {
  // Absence must never be promoted to a match on a fail-closed path, or the check
  // is decoration.
  const noPath = panel('mine', { verdict: 'divergent', receipt_hash: null });
  assert.equal(lr.bindsToPlanPath(noPath, PLAN, '/repo').ok, false);
  const nullPath = panel('mine', { plan_path: null, receipt_hash: null });
  assert.equal(lr.bindsToPlanPath(nullPath, PLAN, '/repo').ok, false);
  const rec = panel('mine', { plan_path: PLAN, receipt_hash: null });
  assert.equal(lr.bindsToPlanPath(rec, '', '/repo').ok, false);
  assert.equal(lr.bindsToPlanPath(rec, null, '/repo').ok, false);
  assert.equal(lr.bindsToPlanPath('not a panel', PLAN, '/repo').ok, false);
});

// ── parseLinkEvidence ────────────────────────────────────────────────────────

const GOOD_EVIDENCE = {
  record_path: '.claude/reviews/plan-review-mine.md',
  receipt_path: '.claude/receipts/mccp-pr-codex/mine.json',
  receipt_hash: HASH,
};

test('parseLinkEvidence accepts a well-formed carrier', function () {
  const r = lr.parseLinkEvidence(JSON.stringify(GOOD_EVIDENCE));
  assert.equal(r.ok, true);
  assert.equal(r.record_path, GOOD_EVIDENCE.record_path);
  assert.equal(r.receipt_hash, HASH);
});

test('parseLinkEvidence refuses anything a git-add pathspec must not receive', function () {
  const bad = [
    ['traversal', { record_path: '.claude/reviews/../../etc/x.md' }],
    ['absolute', { record_path: '/etc/passwd' }],
    ['drive letter', { record_path: 'C:' + String.fromCharCode(92) + 'x.md' }],
    ['backslash separator', { record_path: '.claude' + String.fromCharCode(92) + 'reviews/x.md' }],
    ['outside the review corpus', { record_path: 'docs/x.md' }],
    ['embedded newline', { record_path: '.claude/reviews/a.md\n.claude/reviews/b.md' }],
    ['embedded space', { record_path: '.claude/reviews/a b.md' }],
    ['NUL byte', { record_path: '.claude/reviews/a' + String.fromCharCode(0) + '.md' }],
    ['receipt outside corpus', { receipt_path: 'docs/x.json' }],
    ['short hash', { receipt_hash: 'abc' }],
    ['bare hex without the sha256: prefix', { receipt_hash: 'a'.repeat(64) }],
    ['uppercase hash', { receipt_hash: HASH.toUpperCase() }],
    ['non-string hash', { receipt_hash: 42 }],
  ];
  for (const [label, patch] of bad) {
    const r = lr.parseLinkEvidence(JSON.stringify(Object.assign({}, GOOD_EVIDENCE, patch)));
    assert.equal(r.ok, false, label + ' must be refused');
  }
  assert.equal(lr.parseLinkEvidence('not json').ok, false);
  assert.equal(lr.parseLinkEvidence('[]').ok, false);
  assert.equal(lr.parseLinkEvidence('').ok, false);
  assert.equal(lr.parseLinkEvidence(null).ok, false);
});

// ── the CLI: containment, binding, atomicity ─────────────────────────────────

function mkRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lr-')));
  fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude/reviews/plan-review-mine.md'),
    panel('mine', { verdict: 'divergent', plan_path: PLAN, receipt_hash: null }));
  fs.writeFileSync(path.join(root, '.claude/reviews/plan-review-theirs.md'),
    panel('theirs', { verdict: 'converged', plan_path: '.claude/plans/theirs.plan.md', receipt_hash: null }));
  fs.writeFileSync(path.join(root, '.claude/reviews/not-a-panel.md'), '# PR 9\n\nnope\n');
  fs.writeFileSync(path.join(root, 'docs/outside.md'), panel('x', { plan_path: PLAN }));
  return root;
}

function runCli(root, args) {
  try {
    execFileSync(process.execPath, [CLI, 'link-receipt'].concat(args),
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return 0;
  } catch (e) {
    return typeof e.status === 'number' ? e.status : 1;
  }
}

const MINE = '.claude/reviews/plan-review-mine.md';

test('link-receipt writes the hash on the happy path and stays idempotent', function () {
  const root = mkRepo();
  const args = ['--record', MINE, '--receipt-hash', HASH, '--expect-plan-path', PLAN, '--repo-root', root];
  assert.equal(runCli(root, args), 0);
  const once = fs.readFileSync(path.join(root, MINE), 'utf8');
  assert.equal(corpus.parseRecord(once).measurement.receipt_hash, HASH);
  assert.equal(runCli(root, args), 0);
  assert.equal(fs.readFileSync(path.join(root, MINE), 'utf8'), once, 'a replay must not change bytes');
  fs.rmSync(root, { recursive: true, force: true });
});

test('link-receipt refuses every path shape that leaves the review corpus', function () {
  const root = mkRepo();
  const cases = [
    ['traversal', '.claude/reviews/../../etc/x.md'],
    ['absolute', '/etc/passwd'],
    ['drive letter', 'C:' + String.fromCharCode(92) + 'x.md'],
    ['outside .claude/reviews', 'docs/outside.md'],
    ['does not exist', '.claude/reviews/plan-review-ghost.md'],
    ['not a panel record', '.claude/reviews/not-a-panel.md'],
  ];
  for (const [label, rec] of cases) {
    assert.equal(
      runCli(root, ['--record', rec, '--receipt-hash', HASH, '--expect-plan-path', PLAN, '--repo-root', root]),
      12, label + ' must exit 12');
  }
  assert.equal(runCli(root, ['--record', MINE, '--receipt-hash', 'zz', '--expect-plan-path', PLAN, '--repo-root', root]),
    12, 'a non-hex hash must exit 12');
  fs.rmSync(root, { recursive: true, force: true });
});

test('link-receipt refuses an UNBOUND write, and refuses another decision\'s record', function () {
  // The security review's HIGH: containment answers "inside the corpus", not "mine".
  // A missing binding must be a refusal, not a permissive default, and the refusal
  // has to leave the other record untouched — the guard at 3.0 can only refuse the
  // commit, it cannot undo a write.
  const root = mkRepo();
  const theirs = '.claude/reviews/plan-review-theirs.md';
  const theirsBefore = fs.readFileSync(path.join(root, theirs), 'utf8');

  assert.equal(runCli(root, ['--record', MINE, '--receipt-hash', HASH, '--repo-root', root]), 12,
    'a missing --expect-plan-path must exit 12, not default to permissive');

  assert.equal(runCli(root, ['--record', theirs, '--receipt-hash', HASH,
    '--expect-plan-path', PLAN, '--repo-root', root]), 12);
  assert.equal(fs.readFileSync(path.join(root, theirs), 'utf8'), theirsBefore,
    "a refused binding must leave the other decision's record byte-identical");
  fs.rmSync(root, { recursive: true, force: true });
});

test('link-receipt refuses a record whose leaf is a symlink', function (t) {
  // security-reviewer H1: the read-side resolveContained accepts an unresolved
  // lexical path, which is a hole at a WRITE locus. Symlink creation needs
  // privileges on Windows; skip rather than fail when it is unavailable.
  const root = mkRepo();
  const link = path.join(root, '.claude', 'reviews', 'plan-review-link.md');
  try { fs.symlinkSync(path.join(root, 'docs', 'outside.md'), link); }
  catch (_e) {
    fs.rmSync(root, { recursive: true, force: true });
    t.skip('symlink creation not permitted in this environment');
    return;
  }
  assert.equal(runCli(root, ['--record', '.claude/reviews/plan-review-link.md',
    '--receipt-hash', HASH, '--expect-plan-path', PLAN, '--repo-root', root]), 12);
  fs.rmSync(root, { recursive: true, force: true });
});

test('link-receipt leaves no temp file behind on the happy path', function () {
  const root = mkRepo();
  runCli(root, ['--record', MINE, '--receipt-hash', HASH2, '--expect-plan-path', PLAN, '--repo-root', root]);
  const strays = fs.readdirSync(path.join(root, '.claude', 'reviews'))
    .filter(function (f) { return f.endsWith('.tmp'); });
  assert.deepEqual(strays, [], 'tmp+rename must not leave an orphan');
  fs.rmSync(root, { recursive: true, force: true });
});
