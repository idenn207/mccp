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
