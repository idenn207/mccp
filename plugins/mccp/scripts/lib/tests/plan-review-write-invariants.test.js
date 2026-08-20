'use strict';

// diverse-agent-review M1 Task 11 assertions (1)(2)(5)(6)(7) — the invariants
// that only exist if the WRITE PATH actually enforces them.
//
//   (1) legacy byte-equivalence   — delegation must not move any old verdict
//   (2) helper transitivity        — consumers inherit the new rules for free
//   (5) wall-clock stamp is real   — instrumentation promised is instrumentation written
//   (6) DD13 artifact bind         — a plan edited mid-review cannot be sealed
//   (7) provenance enum accepts    — the ledger will take the new values
//
// (6) and the DD11 all-or-nothing rejections are exercised through buildReceipt,
// the real producer, rather than a hand-built object — the point is that the
// guard fires on the path receipts are actually written by.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildReceipt } = require('../../receipt/write');
const { planAwareMarkdownHash } = require('../../receipt/hash');
const { validate } = require('../../receipt/schema');
const { isConvergedVerdict, isDivergentVerdict } = require('../receipt-convergence');
const { validateEntry, VALID_PROVENANCE } = require('../completion-ledger/store');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const PLAN_REL = '.claude/plans/diverse-agent-review-m1.plan.md';
const PLAN_ABS = path.join(REPO_ROOT, PLAN_REL);

// buildReceipt returns { repoRoot, receipt } — unwrap for readability.
function buildReceiptObj(args) {
  return buildReceipt(args).receipt;
}

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-review-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents, 'utf8');
  return p;
}

function validProof(reviewedPlanHash) {
  return {
    layers: { l1: 'converged', l2: 'converged', l3: null },
    verification_verdict: 'converged',
    quorum: { passed: true, required: 3, of: 4, roles: 4, responded: 4 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
      { perspective: 'test', verdict: 'pass' },
      { perspective: 'invariant', verdict: 'pass' },
    ],
    dispatch_evidence: ['.claude/state/dispatches/abc.envelope.json'],
    reviewed_plan_hash: reviewedPlanHash,
  };
}

function baseArgs(extra) {
  return Object.assign({
    gate: 'mccp-plan-codex',
    decision: 'diverse-agent-review-m1',
    plan: PLAN_REL,
    cwd: REPO_ROOT,
  }, extra || {});
}

// codex-intent-context M1 (origin/main) made mccp-plan-codex un-writable on a
// PRD-mode plan unless ONE of two things holds: a programmatic intentDecision —
// what plan-codex-runner.js supplies whenever Codex actually reviewed — or
// review_source='multi-agent', which write.js reads as mechanical proof that
// Codex never ran (diverse-agent-review M1 carve-out).
//
// Tests whose subject is NEITHER of those (meta stamping; the hybrid rules) hand
// over the runner's decision so the assertion they name is the one exercised,
// instead of every such test collapsing into the same INTENT_GATE_BLOCKED throw.
// The carve-out and its boundary get their own dedicated coverage in
// plan-review-intent-carveout.test.js — do not weaken it here.
function runnerIntent(extra) {
  return Object.assign({
    verdict: 'preserved',
    runtime_allowed: true,
    reason: 'all findings adjudicated',
    skip_proof: null,
    counts: { total: 0, conflict: 0, none: 0, overrides: 0, by_verdict: {} },
    section_present: true,
    items_count: 1,
    reference_injected: true,
    plan_digest: planAwareMarkdownHash(PLAN_ABS),
    run_nonce: '11111111-2222-4333-8444-555555555555',
    force_override: false,
    force_override_reason: null,
  }, extra || {});
}

function expectReviewStampInvalid(args, label) {
  let threw = null;
  try { buildReceipt(args); } catch (e) { threw = e; }
  assert.ok(threw, label + ': expected a throw');
  assert.equal(threw.code, 'REVIEW_STAMP_INVALID', label + ': ' + threw.message);
}

// ── DD11 all-or-nothing (write path) ─────────────────────────────────────────

test('DD11: any single review_* flag without the other two is rejected', () => {
  const proofPath = tmpFile('proof.json', JSON.stringify(validProof(planAwareMarkdownHash(PLAN_ABS))));
  expectReviewStampInvalid(baseArgs({ 'review-verdict': 'converged' }), 'verdict alone');
  expectReviewStampInvalid(baseArgs({ 'review-source': 'multi-agent' }), 'source alone');
  expectReviewStampInvalid(baseArgs({ 'review-proof-file': proofPath }), 'proof alone');
});

test('DD11: two of three is still rejected', () => {
  const proofPath = tmpFile('proof.json', JSON.stringify(validProof(planAwareMarkdownHash(PLAN_ABS))));
  expectReviewStampInvalid(
    baseArgs({ 'review-verdict': 'converged', 'review-source': 'multi-agent' }), 'no proof');
  expectReviewStampInvalid(
    baseArgs({ 'review-verdict': 'converged', 'review-proof-file': proofPath }), 'no source');
  expectReviewStampInvalid(
    baseArgs({ 'review-source': 'multi-agent', 'review-proof-file': proofPath }), 'no verdict');
});

test('DD11: an unreadable proof file is rejected, not silently defaulted', () => {
  expectReviewStampInvalid(baseArgs({
    'review-verdict': 'converged',
    'review-source': 'multi-agent',
    'review-proof-file': path.join(os.tmpdir(), 'definitely-not-here-' + process.pid + '.json'),
  }), 'missing proof file');
});

test('DD11: multi-agent source alongside a codex_verdict is a contradictory receipt', () => {
  const proofPath = tmpFile('proof.json', JSON.stringify(validProof(planAwareMarkdownHash(PLAN_ABS))));
  expectReviewStampInvalid(baseArgs({
    'review-verdict': 'converged',
    'review-source': 'multi-agent',
    'review-proof-file': proofPath,
    'codex-verdict': 'converged',
  }), 'multi-agent + codex_verdict');
});

// ── evidence-path leak: the LEAK axis is verdict-independent ─────────────────
//
// santa-loop R1 (Codex GPT-5.4). Schema relaxed the whole proof invariant for
// non-converged verdicts so an honest record of a failed review would not be
// blocked. But that relaxation covered dispatch_evidence PATH SHAPE too, and the
// two invariants answer different questions: "good enough to approve?" is
// verdict-dependent, "may this string be sealed into receipt_hash?" never is.
// The approval axis was already safe (the read-side oracle downgrades a leaking
// proof to `unavailable` — plan-review-decide.test.js asserts exactly that), so
// a divergent verdict was the one unguarded door into the durable corpus.

function leakyProof(reviewedPlanHash, evidence) {
  const p = validProof(reviewedPlanHash);
  p.layers = { l1: 'converged', l2: 'divergent', l3: null };
  p.verification_verdict = 'divergent';
  p.quorum = { passed: false, required: 3, of: 4, roles: 2, responded: 2 };
  p.dispatch_evidence = evidence;
  return p;
}

test('a non-converged proof may NOT seal an absolute evidence path', () => {
  const hash = planAwareMarkdownHash(PLAN_ABS);
  [
    ['C:/Users/me/secret.json', 'drive letter'],
    ['/home/me/secret.json', 'posix absolute'],
    ['..\\..\\outside.json', 'backslash + traversal'],
    ['.claude/../../outside.json', 'traversal segment'],
  ].forEach(function (pair) {
    const proofPath = tmpFile('leaky-proof.json',
      JSON.stringify(leakyProof(hash, [pair[0]])));
    let threw = null;
    try {
      buildReceipt(baseArgs({
        'review-verdict': 'divergent',
        'review-source': 'multi-agent',
        'review-proof-file': proofPath,
      }));
    } catch (e) { threw = e; }
    assert.ok(threw, 'divergent proof leaking a ' + pair[1] + ': expected a throw');
    // SCHEMA_INVALID, not REVIEW_STAMP_INVALID: the leak guard lives in the
    // schema because that is the layer every writer passes through, including
    // any future one that does not go via the review-stamp flags.
    assert.equal(threw.code, 'SCHEMA_INVALID',
      'divergent proof leaking a ' + pair[1] + ': ' + threw.message);
    assert.match(threw.message, /dispatch_evidence/,
      'the rejection must name the offending field, not fail generically');
  });
});

test('the relaxation itself survives: a non-converged proof with clean paths is accepted', () => {
  // Guards against over-correcting the fix into "non-converged proofs must be
  // structurally perfect", which would block the honest failed-review record
  // the relaxation exists to permit. A failed quorum is the POINT here.
  //
  // review-loop-bypass M1 added the two single-pass flags to this fixture, and
  // they are not decoration. With the toggle off, 5.2e HALTs on a dissenting
  // panel and no receipt is written at all — so a `mccp-plan-codex` receipt that
  // carries a panel source AND a non-converged verdict can only exist because the
  // toggle let the gate proceed. The schema's reverse invariant says exactly
  // that, which makes this fixture a single-pass record by construction; naming
  // it as one is what keeps the fixture honest. The assertion below is unchanged
  // and still owns its original subject: an unsatisfied quorum stays recordable.
  const proofPath = tmpFile('clean-divergent-proof.json', JSON.stringify(
    leakyProof(planAwareMarkdownHash(PLAN_ABS), ['.claude/state/plan-review/l2.json'])));
  const r = buildReceiptObj(baseArgs({
    'review-verdict': 'divergent',
    'review-source': 'multi-agent',
    'review-proof-file': proofPath,
    'review-single-pass-reason': 'scope_too_small',
    'review-single-pass-bypassed-verdict': true,
  }));
  assert.equal(r.resolution.review_verdict, 'divergent');
  assert.equal(r.resolution.review_proof.quorum.passed, false,
    'an unsatisfied quorum must still be recordable on a non-converged verdict');
});

function hybridProof(hash) {
  const p = validProof(hash);
  // A real hybrid run records the L3 verdict it actually got. santa-loop R5:
  // this fixture used to leave layers.l3 null, which pinned `hybrid without
  // any L3` as a valid cross-model receipt — the exact shape dedupe trusts to
  // skip terminal PR-Codex.
  p.layers = { l1: 'converged', l2: 'converged', l3: 'converged' };
  return p;
}

test('hybrid source legitimately carries a codex_verdict (L3 IS Codex)', () => {
  const proofPath = tmpFile('proof.json', JSON.stringify(hybridProof(planAwareMarkdownHash(PLAN_ABS))));
  const r = buildReceiptObj(baseArgs({
    'review-verdict': 'converged',
    'review-source': 'hybrid',
    'review-proof-file': proofPath,
    'codex-verdict': 'converged',
    intentDecision: runnerIntent(),
  }));
  assert.equal(r.resolution.review_source, 'hybrid');
  assert.equal(r.resolution.codex_verdict, 'converged');
});

// ── (6) DD13 artifact bind ───────────────────────────────────────────────────

test('DD13: a proof bound to a different plan version is rejected at seal time', () => {
  const staleHash = 'sha256:' + 'a'.repeat(64); // deliberately not the plan's hash
  const proofPath = tmpFile('proof.json', JSON.stringify(validProof(staleHash)));
  let threw = null;
  try {
    buildReceipt(baseArgs({
      'review-verdict': 'converged',
      'review-source': 'multi-agent',
      'review-proof-file': proofPath,
    }));
  } catch (e) { threw = e; }
  assert.ok(threw, 'expected a throw');
  assert.equal(threw.code, 'REVIEW_STAMP_INVALID');
  assert.match(threw.message, /plan changed after L2 reviewed it/);
  assert.match(threw.message, /rerun the L2 review/, 'must name the correct recovery');
  assert.doesNotMatch(threw.message, /reseal the receipt/i);
});

test('DD13: an edit to the plan between review and seal is caught end to end', () => {
  // Materialize the whole scenario instead of injecting a mismatch by hand:
  // the plan handed to write.js is the SAME file the proof was computed from,
  // and it really is edited in between. A mock that simply supplies two
  // different strings would pass even if write.js compared nothing.
  const planPath = tmpFile('subject.plan.md', fs.readFileSync(PLAN_ABS, 'utf8'));

  // (a) emit-workflow-args hashes the plan; (b) L2 reviews that version.
  const hashAtReviewTime = planAwareMarkdownHash(planPath);

  // (c) the controller edits the plan — one byte is enough.
  fs.appendFileSync(planPath, '\n<!-- one byte later -->\n', 'utf8');
  const hashNow = planAwareMarkdownHash(planPath);
  assert.notEqual(hashAtReviewTime, hashNow, 'the edit must actually change the hash');

  // (d) decide emits a proof carrying the reviewed version…
  const proofPath = tmpFile('proof.json', JSON.stringify(validProof(hashAtReviewTime)));

  // (e)(f) …and write.js, hashing the plan as it now stands, must refuse to seal.
  let threw = null;
  try {
    buildReceipt({
      gate: 'mccp-plan-codex',
      decision: 'diverse-agent-review-m1',
      plan: planPath,
      cwd: REPO_ROOT,
      'review-verdict': 'converged',
      'review-source': 'multi-agent',
      'review-proof-file': proofPath,
    });
  } catch (e) { threw = e; }
  assert.ok(threw, 'sealing an edited plan against a stale proof must throw');
  assert.equal(threw.code, 'REVIEW_STAMP_INVALID');
  assert.match(threw.message, /plan changed after L2 reviewed it/);

  // …and the same write succeeds once the proof is rebound to the current plan,
  // which is the sanctioned recovery: rerun the review, do not reseal.
  const freshProof = tmpFile('proof2.json', JSON.stringify(validProof(hashNow)));
  const ok = buildReceipt({
    gate: 'mccp-plan-codex',
    decision: 'diverse-agent-review-m1',
    plan: planPath,
    cwd: REPO_ROOT,
    'review-verdict': 'converged',
    'review-source': 'multi-agent',
    'review-proof-file': freshProof,
  }).receipt;
  assert.equal(ok.resolution.review_verdict, 'converged');
});

test('a proof bound to the CURRENT plan seals cleanly and validates', () => {
  const proofPath = tmpFile('proof.json',
    JSON.stringify(validProof(planAwareMarkdownHash(PLAN_ABS))));
  const r = buildReceiptObj(baseArgs({
    'review-verdict': 'converged',
    'review-source': 'multi-agent',
    'review-proof-file': proofPath,
  }));
  assert.equal(r.resolution.review_verdict, 'converged');
  assert.equal(r.resolution.review_source, 'multi-agent');
  assert.ok(r.resolution.review_proof);
  assert.equal(r.resolution.codex_verdict, undefined,
    'multi-agent must not carry a codex verdict');
  const res = validate(r);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

// ── (5) wall-clock instrumentation is really written ─────────────────────────

test('meta.review_wall_clock_ms is stamped as a non-negative integer', () => {
  const r = buildReceiptObj(baseArgs({
    'review-wall-clock-ms': '48213', intentDecision: runnerIntent(),
  }));
  assert.equal(r.meta.review_wall_clock_ms, 48213);
  assert.ok(Number.isInteger(r.meta.review_wall_clock_ms));
  assert.ok(r.meta.review_wall_clock_ms >= 0);
  assert.equal(validate(r).ok, true);
});

test('meta.review_l3_invoked / review_l3_reason stamp only when supplied', () => {
  const bare = buildReceiptObj(baseArgs({ intentDecision: runnerIntent() }));
  assert.equal(Object.prototype.hasOwnProperty.call(bare.meta, 'review_l3_invoked'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(bare.meta, 'review_wall_clock_ms'), false);

  const stamped = buildReceiptObj(baseArgs({
    'review-l3-invoked': true, 'review-l3-reason': 'codex converged',
    intentDecision: runnerIntent(),
  }));
  assert.equal(stamped.meta.review_l3_invoked, true);
  assert.equal(stamped.meta.review_l3_reason, 'codex converged');
});

test('a garbage wall-clock value is dropped rather than stamped', () => {
  ['abc', '-5', ''].forEach(function (raw) {
    const r = buildReceiptObj(baseArgs({
      'review-wall-clock-ms': raw, intentDecision: runnerIntent(),
    }));
    assert.equal(Object.prototype.hasOwnProperty.call(r.meta, 'review_wall_clock_ms'), false, raw);
  });
});

// ── (1) legacy byte-equivalence of the delegated helpers ─────────────────────

test('(1) legacy: every codex_verdict × converged combination is unchanged', () => {
  const verdicts = ['converged', 'divergent', 'critical', 'unavailable', 'skipped', undefined];
  verdicts.forEach(function (cv) {
    [true, false].forEach(function (flag) {
      const resolution = { converged: flag };
      if (cv !== undefined) resolution.codex_verdict = cv;

      // Pre-delegation semantics, restated literally:
      const expectedDivergent = cv === 'divergent' || cv === 'critical';
      const expectedConverged = !expectedDivergent && flag === true;

      const label = 'codex_verdict=' + String(cv) + ' converged=' + flag;
      assert.equal(isDivergentVerdict(resolution), expectedDivergent, label);
      assert.equal(isConvergedVerdict(resolution), expectedConverged, label);
    });
  });
});

// ── (2) helper transitivity ──────────────────────────────────────────────────

test('(2) a divergent review verdict reads as non-converged through the helper', () => {
  const resolution = {
    converged: true,                       // the always-true legacy flag
    review_verdict: 'divergent',
    review_source: 'multi-agent',
    review_proof: validProof('sha256:' + 'a'.repeat(64)),
  };
  assert.equal(isDivergentVerdict(resolution), true);
  assert.equal(isConvergedVerdict(resolution), false,
    'converged:true must not rescue a divergent panel verdict');
});

test('(2) an unavailable review verdict is also non-converged despite converged:true', () => {
  const resolution = {
    converged: true,
    review_verdict: 'converged',
    review_source: 'multi-agent',
    review_proof: { layers: { l1: 'divergent' } },  // structurally broken → unavailable
  };
  assert.equal(isConvergedVerdict(resolution), false);
});

test('(2) the three helper-routed consumers JUDGE through the helper', () => {
  // The plan claims these inherit the new rules "automatically because they go
  // through the helper". That is only true while it stays true, so assert the
  // structure rather than trusting the prose.
  //
  // What is asserted is that the DECISION goes through the helper. A raw
  // codex_verdict read is still legitimate for building a display string —
  // worktrees.js does exactly that when it words a blocked_reason — and DD10
  // deliberately leaves rendered vocabulary alone in M1. Banning the raw read
  // outright would flag correct code and, worse, would push someone to "fix" a
  // display line by changing what users see.
  const consumers = [
    'derive/sources/worktrees.js',
    'lib/briefing/invoke.js',
    'lib/escalate-detector.js',
  ];
  let checked = 0;
  consumers.forEach(function (rel) {
    const p = path.join(REPO_ROOT, 'plugins/mccp/scripts', rel);
    if (!fs.existsSync(p)) return;
    checked += 1;
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /receipt-convergence/, rel + ' must import the helper');
    assert.match(src, /isConvergedVerdict|isDivergentVerdict/,
      rel + ' must decide via the helper, not by comparing verdict strings itself');
  });
  assert.ok(checked >= 2, 'expected to check at least two consumers, saw ' + checked);
});

test('(2) transitivity in effect: the helper flips a divergent panel receipt', () => {
  // The concrete consequence the three consumers inherit — escalate-detector
  // sees a blocked gate, briefing does not report "converged: true", and the
  // worktree projection marks the gate blocked.
  const panelDivergent = {
    converged: true,
    review_verdict: 'divergent',
    review_source: 'multi-agent',
    review_proof: validProof('sha256:' + 'a'.repeat(64)),
  };
  assert.equal(isConvergedVerdict(panelDivergent), false);
  assert.equal(isDivergentVerdict(panelDivergent), true);

  // …while a legacy receipt keeps its exact previous reading.
  assert.equal(isConvergedVerdict({ converged: true, codex_verdict: 'converged' }), true);
  assert.equal(isConvergedVerdict({ converged: true, codex_verdict: 'divergent' }), false);
});

// ── (7) ledger provenance enum accepts the new values ────────────────────────

test('(7) VALID_PROVENANCE gained multi-agent and hybrid additively', () => {
  ['codex-verdict', 'legacy-unknown', 'superseded', 'multi-agent', 'hybrid']
    .forEach(function (v) {
      assert.ok(VALID_PROVENANCE.indexOf(v) !== -1, v);
    });
});

test('(7) writeEntry validation accepts entries with the new provenance', () => {
  // M1 never fires this path (pr-codex receipts carry no review_*), so a
  // behavioural regression would not catch it — assert it directly.
  const entry = {
    decision_id: 'feature-x',
    gate: 'mccp-pr-codex',
    verdict: 'converged',
    version: '1.23.1',
    completed_at: '2026-08-08T00:00:00.000Z',
    commit_sha: 'abc1234',
    plan_basename: 'feature-x.plan.md',
    plan_file_hash: 'sha256:' + 'a'.repeat(64),
    risks_closed: [],
    oq_closed: [],
    receipt_hash: 'sha256:' + 'b'.repeat(64),
    verdict_provenance: 'multi-agent',
  };
  const res = validateEntry(entry);
  assert.equal(res.ok, true, JSON.stringify(res.errors));

  const hybrid = Object.assign({}, entry, { verdict_provenance: 'hybrid' });
  assert.equal(validateEntry(hybrid).ok, true, JSON.stringify(validateEntry(hybrid).errors));

  const bogus = Object.assign({}, entry, { verdict_provenance: 'vibes' });
  assert.equal(validateEntry(bogus).ok, false, 'unknown provenance must still be rejected');
});

test('a converged hybrid receipt without an L3 layer cannot be written', () => {
  // hybrid buys a PR-Codex skip through cross-gate dedupe. A receipt claiming it
  // must carry the L3 verdict that claim rests on, or the skip is bought with
  // evidence that does not exist.
  const noL3 = validProof(planAwareMarkdownHash(PLAN_ABS));   // layers.l3 === null
  const proofPath = tmpFile('no-l3-proof.json', JSON.stringify(noL3));
  let threw = null;
  try {
    buildReceipt(baseArgs({
      'review-verdict': 'converged',
      'review-source': 'hybrid',
      'review-proof-file': proofPath,
      'codex-verdict': 'converged',
      intentDecision: runnerIntent(),
    }));
  } catch (e) { threw = e; }
  assert.ok(threw, 'a converged hybrid receipt with layers.l3 null must not reach disk');
  assert.match(threw.message, /layers\.l3/, threw.message);
});
