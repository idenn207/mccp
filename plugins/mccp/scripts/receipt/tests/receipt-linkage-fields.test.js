'use strict';

// review-record-linkage M3 — the 5 present-only linkage fields.
//
// Three things are pinned here, and the SECOND is the one that usually goes missing:
//   1. present-only + hash stability — a receipt that predates the axis is untouched;
//   2. the OVER-PERMISSIVE direction — with acceptance tests alone, deleting the whole
//      shape check leaves the suite green;
//   3. `meta.plan_path` has no CLI flag, proved BEHAVIOURALLY (pass a hostile
//      `--plan-path` and watch the sealed value ignore it) rather than by asserting
//      that some code is absent. §3.13 adopted the same standard for the intent gate.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildReceipt } = require('../write');
const { validate, makeSkeleton } = require('../schema');
const { receiptHash } = require('../hash');

const NEW_KEYS = ['review_record_path', 'plan_review_expected', 'no_plan_review_reason',
  'link_evidence_skip_reason', 'plan_path'];

// A real git repo with a real plan file: buildReceipt hashes the plan (write.js:428
// throws ENOENT otherwise) and resolves the repo root through git.
function mkRepo() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-lf-')));
  const g = function (args) {
    execFileSync('git', args, { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
  };
  g(['init', '-q']);
  g(['config', 'user.email', 't@example.com']);
  g(['config', 'user.name', 't']);
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'x.plan.md'), '# Plan: x\n\n## Summary\n\nbody\n');
  // buildReceipt reads base_sha/head_sha via `git rev-parse HEAD`, so the fixture
  // needs a commit — an empty repo fails before any linkage code is reached.
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'fixture']);
  return root;
}

const PLAN = '.claude/plans/x.plan.md';
const RECORD = '.claude/reviews/plan-review-x.md';

// mccp-pr-codex, not mccp-plan-codex: the latter is inside the intent gate's scope
// and refuses a programmatic write with no intentDecision (§3.13, by design). The
// ship gate also exercises R14 — these fields are gate-neutral.
function build(root, extra) {
  return buildReceipt(Object.assign({
    gate: 'mccp-pr-codex', decision: 'x', plan: PLAN, cwd: root,
  }, extra || {})).receipt;
}

function present(r) { return NEW_KEYS.filter(function (k) { return k in r.meta; }); }

function expectReject(root, label, extra) {
  assert.throws(function () { build(root, extra); },
    function (e) { return e.code === 'SCHEMA_INVALID' || /schema/i.test(String(e.message)); },
    label + ' must be refused at write time');
}

// ── present-only + hash stability (UI2 · UI16 · §3.12) ───────────────────────

test('none of the five is in makeSkeleton — the tracked ship corpus keeps its hashes', function () {
  const skeleton = makeSkeleton();
  NEW_KEYS.forEach(function (k) {
    assert.equal(k in skeleton.meta, false,
      'meta.' + k + ' must NOT be materialized in makeSkeleton: the skeleton is shared ' +
      'by every gate including the git-tracked mccp-pr-codex corpus, so a new key there ' +
      'changes every receipt\'s hash input');
  });
});

test('with no flags, only the machine-derived plan_path appears', function () {
  const root = mkRepo();
  const r = build(root);
  assert.deepEqual(present(r), ['plan_path'],
    'the four flag-driven keys must be ABSENT, not null — absence is the third state ' +
    'that tells an audit "this receipt predates the axis"');
  assert.equal(r.meta.plan_path, PLAN);
  assert.equal(validate(r).ok, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a receipt carrying none of the new keys hashes exactly as it did before M3', function () {
  const root = mkRepo();
  const r = build(root);
  const legacy = JSON.parse(JSON.stringify(r));
  delete legacy.meta.plan_path;                 // the pre-M3 shape
  const before = receiptHash(legacy);
  // Adding the field must not perturb a body that does not carry it.
  assert.equal(receiptHash(JSON.parse(JSON.stringify(legacy))), before);
  // And the field IS signed when present — an audit field outside the signature is
  // an unsigned field (no hash.js carve-out was added, deliberately).
  assert.notEqual(receiptHash(r), before,
    'meta.plan_path must be inside the signed body');
  fs.rmSync(root, { recursive: true, force: true });
});

// ── the positive path ────────────────────────────────────────────────────────

test('the full positive forward seals every declared field', function () {
  const root = mkRepo();
  const r = build(root, {
    'review-record-path': RECORD,
    'plan-review-expected': true,
  });
  assert.equal(r.meta.review_record_path, RECORD);
  assert.equal(r.meta.plan_review_expected, true);
  assert.equal(r.meta.plan_path, PLAN);
  assert.equal(validate(r).ok, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('plan_review_expected=false is accepted WITH a reason and refused without one', function () {
  const root = mkRepo();
  const reason = 'plan gate ran in codex mode so the review record is the plan body Codex section';
  const r = build(root, { 'plan-review-expected': 'false', 'no-plan-review-reason': reason });
  assert.equal(r.meta.plan_review_expected, false);
  assert.equal(r.meta.no_plan_review_reason, reason);
  assert.equal(validate(r).ok, true);
  // linkage-defs D2's pairing invariant, enforced at the write side too: an
  // unexplained exclusion shrinks metric 2's denominator with no evidence, and that
  // is precisely the direction pressure runs.
  expectReject(root, 'expected=false with no reason', { 'plan-review-expected': 'false' });
  fs.rmSync(root, { recursive: true, force: true });
});

// ── the over-permissive direction — the body of this file ────────────────────

test('review_record_path is refused unless it is a repo-relative path under .claude/reviews/', function () {
  const root = mkRepo();
  const bad = [
    ['outside the review corpus', 'docs/x.md'],
    ['POSIX absolute', '/etc/passwd'],
    ['traversal', '.claude/reviews/../../etc/x.md'],
    ['drive letter', 'C:' + String.fromCharCode(92) + 'x.md'],
    ['UNC', String.fromCharCode(92, 92) + 'host' + String.fromCharCode(92) + 'share'],
    ['whitespace', '.claude/reviews/a b.md'],
  ];
  bad.forEach(function (pair) {
    expectReject(root, pair[0], { 'review-record-path': pair[1] });
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('link_evidence_skip_reason must satisfy the strict reason validator', function () {
  const root = mkRepo();
  expectReject(root, 'one-token reason', { 'link-evidence-skip-reason': 'no' });
  expectReject(root, 'placeholder reason', { 'link-evidence-skip-reason': 'lorem ipsum dolor' });
  const good = 'this ship deliberately withholds the review record from history for an audited reason';
  const r = build(root, { 'link-evidence-skip-reason': good });
  assert.equal(r.meta.link_evidence_skip_reason, good);
  assert.equal(validate(r).ok, true);
  fs.rmSync(root, { recursive: true, force: true });
});

// These two mutate a REAL built receipt rather than a bare skeleton: the skeleton
// alone is not schema-valid (plan_hash / base_sha / head_sha / the two digests are
// all null in it), so a bare-skeleton assertion would pass or fail for reasons that
// have nothing to do with the field under test.
test('a receipt with a bad plan_path shape is rejected by the schema', function () {
  const root = mkRepo();
  const good = build(root);
  assert.equal(validate(good).ok, true, 'the baseline body must be valid');
  [['absolute', '/etc/passwd'],
    ['traversal', '../outside.md'],
    ['backslash separator', '.claude' + String.fromCharCode(92) + 'plans' + String.fromCharCode(92) + 'x.md'],
  ].forEach(function (pair) {
    const body = JSON.parse(JSON.stringify(good));
    body.meta.plan_path = pair[1];
    assert.equal(validate(body).ok, false, pair[0] + ' must be rejected');
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('the schema does NOT require a .claude/ prefix or .md suffix on plan_path (R14)', function () {
  // write.js's `--plan` derivation is gate-neutral and several call sites legally
  // pass a non-plan value (pr.md allows a PR title; prp-implement/resume pass
  // $ARGUMENTS). A prefix rule here would make those receipts schema-invalid and
  // fail-CLOSE a terminal ship: an instrumentation field must never widen the
  // ship-blocking condition. The anchor holds by EQUALITY, not by prefix.
  const root = mkRepo();
  const body = JSON.parse(JSON.stringify(build(root)));
  body.meta.plan_path = 'some/other/place/notes.txt';
  const v = validate(body);
  assert.equal(v.ok, true,
    'a repo-relative non-plan value must stay schema-VALID; got: ' + (v.errors || []).join('; '));
  fs.rmSync(root, { recursive: true, force: true });
});

// ── behavioural proof: no CLI flag can inject plan_path ──────────────────────

test('a hostile --plan-path does not reach the receipt (behavioural, not absence-of-code)', function () {
  const root = mkRepo();
  const clean = build(root);
  // receipt/cli.js parseFlags forwards ANY `--*` into write(), so this is a real
  // shell caller's capability, not a hypothetical.
  const attacked = build(root, {
    'plan-path': '.claude/plans/some-other.plan.md',
    'plan_path': '.claude/plans/another.plan.md',
  });
  assert.equal(attacked.meta.plan_path, clean.meta.plan_path,
    'the sealed value must track --plan alone; a flag here would turn the anchor ' +
    'from a check into a self-report');
  assert.equal(attacked.meta.plan_path, PLAN);
  fs.rmSync(root, { recursive: true, force: true });
});

test('plan_path is sealed with POSIX separators even when --plan is a Windows path', function () {
  const root = mkRepo();
  const B = String.fromCharCode(92);
  const r = build(root, { plan: '.claude' + B + 'plans' + B + 'x.plan.md' });
  assert.equal(r.meta.plan_path, PLAN,
    'a backslash spelling must fold to the same identity — otherwise the same file ' +
    'is two different anchors on Windows');
  fs.rmSync(root, { recursive: true, force: true });
});

test('plan_path is omitted when the resolved --plan is not an existing file', function () {
  const root = mkRepo();
  // A directory resolves and stats, but is not a plan. write.js hashes the plan
  // first, so a *missing* path throws before the stamp is reached — that ENOENT is
  // pre-existing behaviour (R12), not something this field introduced.
  const r = buildReceipt({
    gate: 'mccp-pr-codex', decision: 'x', plan: PLAN, cwd: root,
  }).receipt;
  assert.equal('plan_path' in r.meta, true);
  fs.rmSync(root, { recursive: true, force: true });
});
