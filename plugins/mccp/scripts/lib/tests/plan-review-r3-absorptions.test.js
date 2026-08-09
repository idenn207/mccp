'use strict';

// diverse-agent-review M1 — santa-loop R3 absorptions.
//
// Three defects the third adversarial round surfaced, all found by Codex GPT-5.4
// after the Claude reviewer had rated the same criteria PASS.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { execFileSync } = require('child_process');
const { isReviewProofStructurallyValid } = require('../review-verdict');
const { isConvergedVerdict } = require('../receipt-convergence');
const { runCli, EX_BLOCK } = require('../plan-review/cli');

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'],
  { encoding: 'utf8' }).trim();
const WRITE_CLI = path.join(REPO_ROOT, 'plugins/mccp/scripts/receipt/cli.js');

// ── (1) the fail-open: a plan receipt with no verdict axis at all ─────────────
//
// A panel run whose decision.json was malformed forwards no review_* triple (the
// all-or-nothing guard turns a partial stamp into NO stamp) and, in panel mode,
// no --codex-verdict either. The receipt lands carrying only
// `resolution.converged: true` — write.js's defaultResolution literal — and
// resolveEffectiveVerdict answers axis:'none', so receipt-convergence skips its
// strict review branch and falls through to `resolution.converged === true`.
// A run that approved nothing read as converged.
//
// The read-side fallback CANNOT simply be flipped: a legacy v1.23.0 receipt is
// indistinguishable from this one by inspection, and the no-regression contract
// pins that legacy behaviour. So the fix lives at the producer.

test('the read-side fallback that made this reachable is still there (fix is at the producer)', () => {
  const legacy = { converged: true, rounds: 1 };
  assert.equal(isConvergedVerdict(legacy), true,
    'legacy receipts with no verdict axis must keep reading as converged — ' +
    'this is the contract that forces the fix to live at the write layer');
});

function writeAttempt(extraFlags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-noaxis-'));
  try {
    let threw = null;
    try {
      execFileSync('node', [WRITE_CLI, 'write',
        '--gate', 'mccp-plan-codex',
        '--decision', 'r3-no-axis',
        '--plan', 'CHANGELOG.md',
        '--cwd', REPO_ROOT,
        '--receipts-dir', dir,
        '--quiet',
      ].concat(extraFlags || []), { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) { threw = e; }
    return {
      threw: threw,
      msg: threw ? String(threw.stderr || '') + String(threw.stdout || '') : '',
      wrote: fs.readdirSync(dir).length,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a PANEL receipt with no approval record is refused at write time', () => {
  ['multi-agent', 'hybrid'].forEach(function (mode) {
    const r = writeAttempt(['--review-mode', mode]);
    assert.ok(r.threw, mode + ': a panel receipt with no triple must not reach disk');
    assert.match(r.msg, /read as CONVERGED/,
      mode + ': the refusal must name the actual consequence: ' + r.msg.slice(0, 300));
    assert.equal(r.wrote, 0, mode + ': nothing may be written');
  });
});

test('the gate is keyed on the declared mode, not on "plan receipt with no axis"', () => {
  // The broad form was tried first and broke ~30 tests including the e2e dogfood
  // chain: a verdict-less plan receipt is ordinary across advisory/skipped/manual
  // paths. Only a run that DECLARES it was a panel is guaranteed to owe a triple.
  assert.equal(writeAttempt([]).threw, null,
    'omitting --review-mode must reproduce the old behaviour exactly');
  assert.equal(writeAttempt(['--review-mode', 'codex']).threw, null,
    'the codex rollback path must not acquire a triple requirement');
});

// ── (2) quorum.roles is an observation, not a floor ──────────────────────────

function proofWithRoles(roles) {
  return {
    layers: { l1: 'converged', l2: 'converged', l3: null },
    verification_verdict: 'converged',
    quorum: { passed: true, required: 3, of: 4, roles: roles, responded: 4 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
      { perspective: 'test', verdict: 'pass' },
      { perspective: 'invariant', verdict: 'pass' },
    ],
    dispatch_evidence: ['.claude/state/plan-review/l2.json'],
    reviewed_plan_hash: 'sha256:' + 'a'.repeat(64),
  };
}

test('a proof may not UNDER-report the roles that answered', () => {
  assert.equal(isReviewProofStructurallyValid(proofWithRoles(4)), true,
    'the honest count still seals');
  [1, 2, 3].forEach(function (understated) {
    assert.equal(isReviewProofStructurallyValid(proofWithRoles(understated)), false,
      'four distinct perspectives must not seal roles:' + understated +
      ' — the proof would misstate its own evidence');
  });
});

test('a proof may not OVER-report either (the floor never guarded this side)', () => {
  assert.equal(isReviewProofStructurallyValid(proofWithRoles(5)), false);
});

// ── (3) --plan containment ───────────────────────────────────────────────────
//
// NOT the repo-relative string predicate used for dispatch_evidence: that one
// guards strings that get SEALED into a receipt, where the literal is the
// product. --plan is a file to read, so the property is containment, and an
// ordinary absolute path to a plan inside the repo must keep working.

function decideWithPlan(planArg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-contain-'));
  const l1 = path.join(dir, 'l1.json');
  fs.writeFileSync(l1, JSON.stringify({ verdict: 'converged', violations: [] }), 'utf8');
  const savedOut = process.stdout.write;
  const savedErr = process.stderr.write;
  process.stdout.write = function () { return true; };
  process.stderr.write = function () { return true; };
  try {
    return runCli(['decide', '--mode', 'multi-agent', '--l1-file', l1, '--plan', planArg]);
  } finally {
    process.stdout.write = savedOut;
    process.stderr.write = savedErr;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('an out-of-repo --plan is blocked on every subcommand that reads it', () => {
  const outside = path.join(os.tmpdir(), 'not-in-this-repo.plan.md');
  fs.writeFileSync(outside, '# Plan: elsewhere\n', 'utf8');
  try {
    [outside, '../../../etc/passwd', '..\\..\\outside.md'].forEach(function (p) {
      assert.equal(decideWithPlan(p), EX_BLOCK, 'decide must block --plan ' + p);
      const savedErr = process.stderr.write;
      const savedOut = process.stdout.write;
      process.stderr.write = function () { return true; };
      process.stdout.write = function () { return true; };
      let code;
      try { code = runCli(['l1', '--plan', p]); } finally {
        process.stderr.write = savedErr; process.stdout.write = savedOut;
      }
      assert.equal(code, EX_BLOCK, 'l1 must block --plan ' + p);
    });
  } finally {
    fs.rmSync(outside, { force: true });
  }
});

function l1Output(planArg) {
  const chunks = [];
  const savedOut = process.stdout.write;
  const savedErr = process.stderr.write;
  process.stdout.write = function (c) { chunks.push(String(c)); return true; };
  process.stderr.write = function () { return true; };
  let code;
  try { code = runCli(['l1', '--plan', planArg]); } finally {
    process.stdout.write = savedOut;
    process.stderr.write = savedErr;
  }
  return { code: code, text: chunks.join('') };
}

test('an ABSOLUTE path to a plan inside the repo is NOT rejected for containment', () => {
  // The reviewer's proposed fix (mirror isRepoRelativeEvidencePath) would have
  // rejected this and broken the ordinary flow — the command body may legitimately
  // pass an absolute path. Containment is the right property, not string shape.
  //
  // Asserted on the REASON, not the exit code: CHANGELOG.md is not a valid plan, so
  // L1 blocks it on content. The point is that it is not blocked on E_PATH.
  const insideAbs = path.join(REPO_ROOT, 'CHANGELOG.md');
  const r = l1Output(insideAbs);
  assert.doesNotMatch(r.text, /E_PATH/,
    'an absolute path resolving inside the repo must not raise a containment error');
});

test('the out-of-repo block is specifically a containment error', () => {
  const r = l1Output(path.join(os.tmpdir(), 'elsewhere.plan.md'));
  assert.equal(r.code, EX_BLOCK);
  assert.match(r.text, /E_PATH/, 'the block must be attributable to containment');
  assert.match(r.text, /inconclusive/,
    '"could not check" — not "checked and found violations"; the divergent/' +
    'inconclusive split must survive');
});
