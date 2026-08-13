'use strict';

// diverse-agent-review M1 — DD3 through the CLI, not through the oracle.
//
// santa-loop R2 (Codex GPT-5.4). decideReview implements DD3 correctly: an L1
// that found violations resolves to `divergent` with "L2 was not fired", and it
// does so BEFORE it looks at L2 at all. But cmdDecide read and blocked on
// --l2-file before ever calling the oracle, so on the only path that reaches
// DD3 — L1 fails, 5.2c never runs, no l2.json exists — the answer came back
// `unavailable` with reason "L2 produced no readable result".
//
// The two are not interchangeable. `divergent` says "the gate ran and your plan
// has violations, here they are"; `unavailable` says "the gate could not run".
// The receipt recorded the wrong event, the L1 violation list never reached the
// operator, and the oracle's DD3 branch was dead code in production.
//
// Every assertion here is written against the CLI (runCli), because a pure-oracle
// test passes on this defect — decideReview was never wrong.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runCli, EX_OK, EX_BLOCK } = require('../plan-review/cli');
const { planAwareMarkdownHash } = require('../../receipt/hash');

function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-dd3-'));
  const captured = [];
  const savedWrite = process.stdout.write;
  const savedErr = process.stderr.write;
  process.stdout.write = function (c) { captured.push(String(c)); return true; };
  process.stderr.write = function () { return true; };
  try {
    return fn({
      dir: dir,
      decision: function () { return JSON.parse(captured.join('')); },
    });
  } finally {
    process.stdout.write = savedWrite;
    process.stderr.write = savedErr;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeL1(ctx, obj) {
  const p = path.join(ctx.dir, 'l1.json');
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
  return p;
}

const L1_FAILED = {
  verdict: 'divergent',
  violations: [
    { code: 'C2', detail: 'Files to Change row `receipt/schema.js` is not a repo-root path' },
    { code: 'C4', detail: 'Task 2 has no **Validate** line' },
  ],
};

test('DD3: an L1 failure decides WITHOUT an l2.json and reports divergent', () => {
  withTmp(function (ctx) {
    // No --l2-file at all: this is exactly the state 5.2c leaves behind when the
    // L1 gate stops the run before the panel is ever fired.
    const code = runCli(['decide', '--mode', 'multi-agent', '--l1-file', writeL1(ctx, L1_FAILED)]);
    const d = ctx.decision();

    assert.equal(d.review_verdict, 'divergent',
      'an L1 defect must not be reported as `unavailable` — that claims the gate could not run');
    assert.equal(d.review_source, 'multi-agent');
    assert.equal(code, EX_BLOCK, 'still a hard block; this widens nothing');
    assert.equal(d.forwardCodexVerdict, false);
    assert.equal(d.review_proof, null, 'a blocked review issues no approval proof');
  });
});

test('DD3: the L1 violations reach the decision reason (the author must see them)', () => {
  withTmp(function (ctx) {
    runCli(['decide', '--mode', 'multi-agent', '--l1-file', writeL1(ctx, L1_FAILED)]);
    const d = ctx.decision();
    assert.match(d.reason, /L2 was not fired/,
      'the reason must say the panel was deliberately skipped, not that it broke');
    assert.match(d.reason, /C2/, 'the first violation code must survive into the reason');
    assert.match(d.reason, /2 violation/, 'the violation count must be reported');
    assert.doesNotMatch(d.reason, /no readable result/,
      'the L2-missing wording is the wrong event for an L1 failure');
  });
});

test('DD3 is a gatekeeper, not a bypass: a CONVERGED L1 still requires a readable L2', () => {
  withTmp(function (ctx) {
    const code = runCli(['decide', '--mode', 'multi-agent',
      '--l1-file', writeL1(ctx, { verdict: 'converged', violations: [] })]);
    const d = ctx.decision();
    assert.equal(code, EX_BLOCK, 'a passing L1 must not let a missing panel through');
    assert.equal(d.review_verdict, 'unavailable');
    assert.equal(d.review_proof, null);
  });
});

test('an inconclusive L1 stays `unavailable` — "could not check" is not "found violations"', () => {
  withTmp(function (ctx) {
    const code = runCli(['decide', '--mode', 'multi-agent',
      '--l1-file', writeL1(ctx, {
        verdict: 'inconclusive',
        violations: [{ code: 'E_READ', detail: 'plan unreadable' }],
      })]);
    const d = ctx.decision();
    assert.equal(d.review_verdict, 'unavailable',
      'the divergent/unavailable split must survive the short-circuit');
    assert.equal(code, EX_BLOCK);
  });
});

test('a malformed L1 artifact does not become an approval', () => {
  withTmp(function (ctx) {
    [[], 'converged', 42, null].forEach(function (junk) {
      const code = runCli(['decide', '--mode', 'multi-agent', '--l1-file', writeL1(ctx, junk)]);
      assert.equal(code, EX_BLOCK, 'malformed L1 (' + JSON.stringify(junk) + ') must block');
    });
  });
});

// ── DD13 bind cannot be switched off by omission (santa-loop R4) ─────────────
//
// decideReview compares the sealed reviewed_plan_hash against currentPlanHash
// only when the latter is a non-empty string (decide.js:197). cmdDecide treated
// --plan as optional and swallowed a hashing failure into null, so either one
// left the bind evaluating nothing — a converged verdict could certify a plan
// version nobody checked. The bind exists because this project actually hit the
// failure it guards (reviewers launched, then the plan edited); a guard that
// no-ops when a flag is missing is not a guard.

// The L2 artifact must be READABLE and the quorum satisfiable, or the run blocks
// earlier than the plan check and the test would prove nothing about DD13.
function writeGoodL2(ctx) {
  const p = path.join(ctx.dir, 'l2.json');
  fs.writeFileSync(p, JSON.stringify({
    reviewedPlanHash: 'sha256:' + 'a'.repeat(64),
    results: ['architect', 'security', 'test', 'invariant'].map(function (k) {
      return { perspective: k, verdict: 'pass', refutationAttempted: 'looked', findings: [] };
    }),
  }), 'utf8');
  return p;
}

test('DD13: decide REFUSES to run without --plan rather than skipping the bind', () => {
  withTmp(function (ctx) {
    const code = runCli(['decide', '--mode', 'multi-agent',
      '--l1-file', writeL1(ctx, { verdict: 'converged', violations: [] }),
      '--l2-file', writeGoodL2(ctx)]);
    const d = ctx.decision();
    assert.equal(code, EX_BLOCK, 'a missing --plan must block, not silently unbind');
    assert.equal(d.review_verdict, 'unavailable');
    assert.equal(d.review_proof, null);
    assert.match(d.reason, /DD13/, 'the reason must name the invariant that could not be evaluated');
  });
});

test('DD13: an unhashable plan blocks instead of passing as a satisfied bind', () => {
  withTmp(function (ctx) {
    // A directory resolves and is contained, but cannot be hashed as a plan.
    const dirAsPlan = path.join(ctx.dir, 'not-a-file');
    fs.mkdirSync(dirAsPlan);
    const code = runCli(['decide', '--mode', 'multi-agent',
      '--l1-file', writeL1(ctx, { verdict: 'converged', violations: [] }),
      '--l2-file', writeGoodL2(ctx),
      '--repo-root', ctx.dir, '--plan', dirAsPlan]);
    const d = ctx.decision();
    assert.equal(code, EX_BLOCK);
    assert.equal(d.review_verdict, 'unavailable');
    assert.match(d.reason, /bind/, 'an unverifiable bind is not a satisfied bind');
  });
});

test('the DD3 short-circuit still runs BEFORE the --plan requirement', () => {
  // Ordering matters: an L1 failure is decidable without a plan hash, and making
  // --plan mandatory must not convert that honest `divergent` into `unavailable`.
  withTmp(function (ctx) {
    const code = runCli(['decide', '--mode', 'multi-agent', '--l1-file', writeL1(ctx, L1_FAILED)]);
    const d = ctx.decision();
    assert.equal(d.review_verdict, 'divergent', 'L1 violations still report as violations');
    assert.equal(code, EX_BLOCK);
  });
});

// ── a SKIPPED panel never fired (M4 follow-up) ───────────────────────────────
//
// Same class as the DD3 defect above, at a different seam: the oracle is right
// and the CLI mislabels the event. The workflow's budget gate returns
// `{skipped:true, reason:'budget', results:[]}`, and cmdDecide fed only
// `results` to decideQuorum — which answered `responded: 0`, which decideReview
// correctly renders as "L2 fired but no reviewer responded usably". Correct for
// the input it was given, and false about the world: the panel did not fire.
//
// This matters more since M4, because M4 is what made the branch reachable at
// all. Before it, `minRemaining` had no producer and the skip was unreachable
// source; now an operator can actually land here, read that the reviewers ran
// and failed, and be handed recovery paths (agent cap, new session) that cannot
// fix a token shortfall.

function writeSkippedL2(ctx, extra) {
  const p = path.join(ctx.dir, 'l2.json');
  fs.writeFileSync(p, JSON.stringify(Object.assign({
    skipped: true, reason: 'budget', coverage: 0, results: [],
    reviewedPlanHash: 'sha256:' + 'a'.repeat(64),
  }, extra || {})), 'utf8');
  return p;
}

test('a budget skip says the panel did not fire, and names the numbers it failed', () => {
  withTmp(function (ctx) {
    const code = runCli(['decide', '--mode', 'multi-agent',
      '--l1-file', writeL1(ctx, { verdict: 'converged', violations: [] }),
      '--l2-file', writeSkippedL2(ctx, { remaining: 100000, minRemaining: 600000 })]);
    const d = ctx.decision();

    assert.equal(code, EX_BLOCK, 'a skipped panel is still fail-closed — this widens nothing');
    assert.equal(d.review_verdict, 'unavailable');
    assert.equal(d.review_proof, null);
    assert.equal(d.forwardCodexVerdict, false);

    assert.doesNotMatch(d.reason, /L2 fired/,
      'the panel did not fire, and the stop must not claim it did');
    assert.match(d.reason, /did not fire/);
    assert.match(d.reason, /budget/);
    assert.match(d.reason, /100000/, 'the observed remaining must reach the operator');
    assert.match(d.reason, /600000/, 'so must the threshold it failed');
    assert.match(d.reason, /MCCP_PLAN_REVIEW_BUDGET/,
      'the reason must name a recovery that can actually fix this stop');
  });
});

test('a skip for any other reason is still reported as a skip, not as a bad panel', () => {
  withTmp(function (ctx) {
    const code = runCli(['decide', '--mode', 'multi-agent',
      '--l1-file', writeL1(ctx, { verdict: 'converged', violations: [] }),
      '--l2-file', writeSkippedL2(ctx, { reason: 'no-perspectives' })]);
    const d = ctx.decision();
    assert.equal(code, EX_BLOCK);
    assert.equal(d.review_verdict, 'unavailable');
    assert.match(d.reason, /no-perspectives/);
    assert.doesNotMatch(d.reason, /L2 fired/);
    // No numbers to report here, and inventing them would be the same dishonesty
    // in the other direction.
    assert.doesNotMatch(d.reason, /token\(s\) remaining/);
  });
});

test('a panel that DID fire and returned nothing keeps its own, different wording', () => {
  // The regression guard for the fix above: "fired and produced nothing" is a
  // real and distinct event (every reviewer errored), and collapsing the two
  // would trade one wrong label for another.
  //
  // Reaching that wording needs a satisfied DD13 bind, because the --plan
  // requirement blocks earlier — so this test carries a real plan and a matching
  // hash. That the SKIP tests above need none of this is the point: a panel that
  // never ran is decidable without a plan hash, exactly as an L1 failure is.
  withTmp(function (ctx) {
    const planPath = path.join(ctx.dir, 'x.plan.md');
    fs.writeFileSync(planPath, '# Plan\n\nbody\n', 'utf8');
    const hash = planAwareMarkdownHash(planPath);

    const p = path.join(ctx.dir, 'l2.json');
    fs.writeFileSync(p, JSON.stringify({
      skipped: false, results: [], reviewedPlanHash: hash,
    }), 'utf8');

    const code = runCli(['decide', '--mode', 'multi-agent',
      '--l1-file', writeL1(ctx, { verdict: 'converged', violations: [] }),
      '--l2-file', p, '--repo-root', ctx.dir, '--plan', planPath]);
    const d = ctx.decision();
    assert.equal(code, EX_BLOCK);
    assert.match(d.reason, /no reviewer responded usably/);
    assert.doesNotMatch(d.reason, /did not fire/);
  });
});

test('the codex mode is untouched by the short-circuit', () => {
  withTmp(function (ctx) {
    const code = runCli(['decide', '--mode', 'codex']);
    const d = ctx.decision();
    assert.equal(code, EX_OK, 'the rollback path must not acquire an L1 requirement');
    assert.equal(d.review_verdict, null, 'codex mode stamps no review_* fields');
    assert.equal(d.review_source, null);
    assert.equal(d.forwardCodexVerdict, true);
  });
});
