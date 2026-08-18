'use strict';

// review-loop-bypass M1 — CLI round-trip for the single-pass toggle.
//
// The unit tests prove the ORACLE relaxes the right branch. They cannot prove
// the gate's exit code follows, and one path is only falsifiable here at all:
// the budget-skip return happens in `cmdDecide` BEFORE `decideReview` is called,
// so no oracle test can show that the toggle does not open it.
//
// Real child processes, not in-process `runCli`. An in-process assertion proves
// what the function returned; the gate's contract is what the process EXITS
// with, and env-driven behaviour deserves a real env.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { planAwareMarkdownHash } = require('../../receipt/hash');

const PLAN_REVIEW_CLI = path.join(__dirname, '..', 'plan-review', 'cli.js');
const SANTA_CLI = path.join(__dirname, '..', 'santa', 'cli.js');

const EX_OK = 0;
const EX_USAGE = 2;
const EX_BLOCK = 12;

function run(cliPath, args, opts) {
  opts = opts || {};
  const env = Object.assign({}, process.env, opts.env || {});
  // The toggle must be genuinely absent in the "off" cases, not inherited from
  // whatever shell is running the suite.
  if (!(opts.env && 'MCCP_REVIEW_SINGLE_PASS' in opts.env)) delete env.MCCP_REVIEW_SINGLE_PASS;
  const r = spawnSync(process.execPath, [cliPath].concat(args), {
    cwd: opts.cwd || process.cwd(),
    env: env,
    encoding: 'utf8',
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ── plan-review fixture ───────────────────────────────────────────────────────

function makeRepo(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['checkout', '-q', '-b', 'single-pass-fixture'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

// A repo whose L1 passes and whose L2 reports a panel that dissented.
function makeReviewRepo(overrides) {
  overrides = overrides || {};
  const repo = makeRepo('single-pass-gate-');
  const reviewDir = path.join(repo, '.claude', 'state', 'plan-review');
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.mkdirSync(path.join(repo, '.claude', 'plans'), { recursive: true });

  const planPath = path.join(repo, '.claude', 'plans', 'demo.plan.md');
  fs.writeFileSync(planPath, '# Plan: demo\n\n## Summary\n\nfixture plan body.\n', 'utf8');
  const planHash = planAwareMarkdownHash(planPath);

  fs.writeFileSync(path.join(reviewDir, 'l1.json'),
    JSON.stringify(overrides.l1 || { verdict: 'converged', violations: [] }), 'utf8');

  // Four usable responses across four distinct roles — so `responded` and
  // `roles` both clear their thresholds and the quorum fails for exactly one
  // reason: a blocking finding. That is the shape the relaxation is about (the
  // panel LOOKED and objected), as opposed to a panel that failed to answer,
  // which must stay blocked.
  const l2 = overrides.l2 || {
    reviewedPlanHash: planHash,
    results: [
      { perspective: 'architect', verdict: 'pass', findings: [] },
      { perspective: 'security', verdict: 'pass',
        findings: [{ claim: 'trust boundary is unchecked', severity: 'HIGH' }] },
      { perspective: 'invariant', verdict: 'pass', findings: [] },
      { perspective: 'test', verdict: 'pass', findings: [] },
    ],
  };
  fs.writeFileSync(path.join(reviewDir, 'l2.json'), JSON.stringify(l2), 'utf8');

  return { repo: repo, reviewDir: reviewDir, planPath: planPath, planHash: planHash };
}

function decide(f, env) {
  return run(PLAN_REVIEW_CLI, [
    'decide',
    '--mode', 'multi-agent',
    '--plan', f.planPath,
    '--repo-root', f.repo,
    '--l1-file', path.join(f.reviewDir, 'l1.json'),
    '--l2-file', path.join(f.reviewDir, 'l2.json'),
    '--evidence', '.claude/state/plan-review/l2.json',
  ], { cwd: f.repo, env: env });
}

// Assert the precondition rather than assuming it. If a default ever shifts so
// the fixture panel passes — or fails for the WRONG reason (nobody answered
// rather than somebody objected) — every test below would go green while
// testing nothing.
test('fixture precondition: the panel answers in full and still dissents → exit 12', () => {
  const f = makeReviewRepo();
  const r = decide(f, {});
  assert.equal(r.code, EX_BLOCK, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.equal(d.review_verdict, 'divergent',
    'divergent means "we looked and found a defect" — unavailable here would mean ' +
    'the fixture is testing the wrong branch');
  assert.equal(d.block, true);
  assert.equal(d.single_pass_reason, undefined);
  assert.equal(d.quorum.responded, 4);
  assert.equal(d.quorum.roles, 4);
  assert.equal(d.quorum.passed, false);
  assert.match(d.quorum.reason, /blocking finding/);
});

test('toggle on: the same dissenting panel exits 0 and stamps single_pass_reason', () => {
  const f = makeReviewRepo();
  const r = decide(f, { MCCP_REVIEW_SINGLE_PASS: 'scope_too_small' });
  assert.equal(r.code, EX_OK, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.equal(d.block, false);
  assert.equal(d.review_verdict, 'divergent', 'sealed honestly, never laundered');
  assert.equal(d.single_pass_reason, 'scope_too_small');
  assert.ok(d.review_proof, 'the receipt write needs the proof');
  assert.match(r.stderr, /SINGLE-PASS/, 'a relaxation must never be quiet');
});

test('toggle with a bogus value fails closed — exit 12 and a loud warn', () => {
  const f = makeReviewRepo();
  const r = decide(f, { MCCP_REVIEW_SINGLE_PASS: 'just_because' });
  assert.equal(r.code, EX_BLOCK, 'a typo must not open the gate');
  assert.match(r.stderr, /must be one of/);
});

test('UI7 through the CLI: L1 divergent stays exit 12 with the toggle on', () => {
  const f = makeReviewRepo({
    l1: { verdict: 'divergent', violations: [{ code: 'L1_MISSING_SECTION', detail: 'no Tasks' }] },
  });
  const r = decide(f, { MCCP_REVIEW_SINGLE_PASS: 'deadline_pressure' });
  assert.equal(r.code, EX_BLOCK, 'L1 is inviolable');
  const d = JSON.parse(r.stdout);
  assert.equal(d.single_pass_reason, undefined);
});

test('a budget-skipped panel stays exit 12 with the toggle on', () => {
  // Only falsifiable at the CLI layer: cmdDecide returns for `skipped:true`
  // before decideReview is ever called, so the oracle cannot be asked about it.
  // A panel that never fired is no-pass, not single-pass.
  const f = makeReviewRepo({
    l2: { skipped: true, reason: 'budget', remaining: 1000, minRemaining: 600000 },
  });
  const r = decide(f, { MCCP_REVIEW_SINGLE_PASS: 'scope_too_small' });
  assert.equal(r.code, EX_BLOCK, 'the toggle removes the repeat round, not the review');
  const d = JSON.parse(r.stdout);
  assert.equal(d.review_verdict, 'unavailable');
  assert.equal(d.single_pass_reason, undefined);
});

test('a plan edited after L2 read it stays exit 12 with the toggle on (DD13)', () => {
  const f = makeReviewRepo();
  fs.appendFileSync(f.planPath, '\n## Added after the panel ran\n\nnew content.\n', 'utf8');
  const r = decide(f, { MCCP_REVIEW_SINGLE_PASS: 'scope_too_small' });
  assert.equal(r.code, EX_BLOCK, 'an integrity fact is not a review opinion');
  assert.equal(JSON.parse(r.stdout).review_verdict, 'unavailable');
});

test('an unreadable L2 stays exit 12 with the toggle on', () => {
  const f = makeReviewRepo();
  fs.unlinkSync(path.join(f.reviewDir, 'l2.json'));
  const r = decide(f, { MCCP_REVIEW_SINGLE_PASS: 'scope_too_small' });
  assert.equal(r.code, EX_BLOCK);
});

// ── santa-loop refusal ────────────────────────────────────────────────────────

function santaLedgerPath(repo, slug) {
  return path.join(repo, '.claude', 'state', 'santa-loop', slug + '.json');
}

function rounds(repo, slug) {
  try { return JSON.parse(fs.readFileSync(santaLedgerPath(repo, slug), 'utf8')).rounds.length; }
  catch (_) { return null; }
}

test('santa begin-round: the toggle refuses with exit 2 and consumes no cap', () => {
  const repo = makeRepo('single-pass-santa-');
  const slug = 'demo-decision';

  // Open a baseline round with the toggle OFF. Without it the ledger file does
  // not exist and a "length unchanged" assertion would compare null to null —
  // passing while proving nothing.
  const baseline = run(SANTA_CLI, ['begin-round', '--decision', slug], { cwd: repo, env: {} });
  assert.equal(baseline.code, EX_OK, baseline.stderr);
  const before = rounds(repo, slug);
  assert.equal(before, 1, 'the baseline round must actually exist');

  const refused = run(SANTA_CLI, ['begin-round', '--decision', slug],
    { cwd: repo, env: { MCCP_REVIEW_SINGLE_PASS: 'deferred_to_prd_completion' } });
  assert.equal(refused.code, EX_USAGE, refused.stderr);

  const payload = JSON.parse(refused.stdout);
  assert.equal(payload.reason, 'SANTA_SINGLE_PASS_ACTIVE');
  assert.equal(payload.single_pass_reason, 'deferred_to_prd_completion');
  assert.equal(payload.allowed, false);
  assert.match(refused.stderr, /해제/, 'the refusal must say how to undo it');

  assert.equal(rounds(repo, slug), before,
    'the refusal happens before beginRound, so the ledger must be untouched');
});

test('santa begin-round: a rejected toggle value does not refuse — it is simply off', () => {
  const repo = makeRepo('single-pass-santa-bad-');
  const slug = 'demo-decision';
  const r = run(SANTA_CLI, ['begin-round', '--decision', slug],
    { cwd: repo, env: { MCCP_REVIEW_SINGLE_PASS: 'whenever' } });
  assert.equal(r.code, EX_OK, r.stderr);
  assert.equal(rounds(repo, slug), 1);
});

test('santa begin-round: no receipt is written for the refusal (DD5)', () => {
  const repo = makeRepo('single-pass-santa-receipt-');
  run(SANTA_CLI, ['begin-round', '--decision', 'demo-decision'],
    { cwd: repo, env: { MCCP_REVIEW_SINGLE_PASS: 'scope_too_small' } });
  assert.equal(fs.existsSync(path.join(repo, '.claude', 'receipts')), false,
    'mccp-santa-review is produces-only; the audit anchor is the loud refusal and ' +
    'the absent ledger entry, not a receipt with no round tally');
});
