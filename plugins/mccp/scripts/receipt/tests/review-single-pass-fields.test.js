'use strict';

// review-loop-bypass M1 — the two single-pass receipt fields, their bidirectional
// invariant, and the downstream properties DD1 rests on.
//
// **Fixtures go through the real write path.** A hand-assembled receipt skips
// subject_hash/receipt_hash, schema validation, and the DD13 plan bind, which is
// how a test ends up green against a receipt production would refuse. Where a
// state is by construction unreachable through the writer (a forged proof shape),
// the fixture is still produced by `write()` and only the input proof is crafted.
//
// The chain-regression pin at the bottom is doing quiet but essential work: DD1's
// whole argument is "no downstream validator consumes review_verdict", which was
// true only by grep. If someone adds such a consumer, that test goes red BEFORE
// the milestone is silently neutered.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate } = require('../schema');
const { planAwareMarkdownHash } = require('../hash');
const { validateCommand } = require('../validate-cmd');
const { isCrossModelCorroborated } = require('../../lib/review-verdict');
const { isConvergedVerdict } = require('../../lib/receipt-convergence');
const { scanReceipts } = require('../../derive/sources/receipts');
const { decideReview } = require('../../lib/plan-review/decide');

const EVIDENCE = ['.claude/state/plan-review/l2.json'];

function withRepo(fn) {
  const repo = mkTmpRepo();
  const planAbs = writeFileSync(repo, '.claude/plans/sp.plan.md',
    '# Plan: sp\n\n## Summary\n\nsingle-pass fixture.\n');
  const planRel = '.claude/plans/sp.plan.md';
  const planHash = planAwareMarkdownHash(planAbs);
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    return fn({
      repo: repo, planRel: planRel, planHash: planHash,
      // Write a proof object to disk and hand back the path write() expects.
      proofFile: function (proof) {
        const p = path.join(repo, 'proof-' + Math.random().toString(36).slice(2) + '.json');
        fs.writeFileSync(p, JSON.stringify(proof), 'utf8');
        return p;
      },
    });
  } finally { process.chdir(cwd); }
}

// The audit proof shape decide.js#buildAuditProof produces for a relaxation.
function auditProof(planHash, l3) {
  return {
    layers: { l1: 'converged', l2: 'divergent', l3: l3 === undefined ? null : l3 },
    verification_verdict: 'divergent',
    quorum: { passed: false, required: 3, of: 4, roles: 4, responded: 4 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
    ],
    dispatch_evidence: EVIDENCE.slice(),
    reviewed_plan_hash: planHash,
  };
}

function relaxedArgs(ctx, extra) {
  return Object.assign({
    gate: 'mccp-plan-codex',
    decision: 'sp',
    plan: ctx.planRel,
    'review-mode': 'multi-agent',
    'review-verdict': 'divergent',
    'review-source': 'multi-agent',
    'review-proof-file': ctx.proofFile(auditProof(ctx.planHash)),
    'review-single-pass-reason': 'scope_too_small',
    'review-single-pass-bypassed-verdict': true,
  }, extra || {});
}

function throwsWrite(args, rx, message) {
  assert.throws(function () { write(args); }, function (e) {
    assert.match(e.message, rx, message + ' — got: ' + e.message);
    return true;
  }, message);
}

// ── sealing ───────────────────────────────────────────────────────────────────

test('a relaxed plan receipt seals reason + bypass flag beside the honest verdict', () => {
  withRepo(function (ctx) {
    const r = write(relaxedArgs(ctx));
    assert.strictEqual(validate(r.receipt).ok, true, JSON.stringify(validate(r.receipt).errors));
    assert.strictEqual(r.receipt.meta.review_single_pass_reason, 'scope_too_small');
    assert.strictEqual(r.receipt.meta.review_single_pass_bypassed_verdict, true);
    assert.strictEqual(r.receipt.resolution.review_verdict, 'divergent',
      'UI8 — a sealed reason, not a laundered verdict');
  });
});

test('without the toggle the keys do not exist at all (present-only)', () => {
  withRepo(function (ctx) {
    const r = write({ gate: 'mccp-plan-codex', decision: 'sp-plain', plan: ctx.planRel });
    assert.strictEqual('review_single_pass_reason' in r.receipt.meta, false);
    assert.strictEqual('review_single_pass_bypassed_verdict' in r.receipt.meta, false);
    assert.strictEqual(validate(r.receipt).ok, true);
  });
});

test('the fields are hash-covered, not carved out', () => {
  // Tamper protection: the bypass decision must be as tamper-evident as the
  // verdict it accompanies (the pr_codex_force_override precedent). Absent keys
  // therefore leave the existing corpus byte-identical, and present ones move
  // the hash.
  withRepo(function (ctx) {
    const plain = write({ gate: 'mccp-plan-codex', decision: 'h1', plan: ctx.planRel });
    const stamped = write(Object.assign(relaxedArgs(ctx), { decision: 'h1' }));
    assert.notStrictEqual(plain.receipt.receipt_hash, stamped.receipt.receipt_hash);
  });
});

test('an explicit reason beats the ambient env value (writer-side precedence)', () => {
  withRepo(function (ctx) {
    const prior = process.env.MCCP_REVIEW_SINGLE_PASS;
    process.env.MCCP_REVIEW_SINGLE_PASS = 'deadline_pressure';
    try {
      const r = write(relaxedArgs(ctx));
      assert.strictEqual(r.receipt.meta.review_single_pass_reason, 'scope_too_small',
        'the writer records what the caller ASSERTED; env is the fallback');
    } finally {
      if (prior === undefined) delete process.env.MCCP_REVIEW_SINGLE_PASS;
      else process.env.MCCP_REVIEW_SINGLE_PASS = prior;
    }
  });
});

test('env alone stamps the reason but never the bypass flag', () => {
  // The two fields are different axes: env says the toggle was SET, the flag
  // says a bypass was APPLIED. Inferring the second from the first is the
  // codex_disabled mistake §3.12 already paid for.
  withRepo(function (ctx) {
    const prior = process.env.MCCP_REVIEW_SINGLE_PASS;
    process.env.MCCP_REVIEW_SINGLE_PASS = 'scope_too_small';
    try {
      const r = write({ gate: 'mccp-implement-codex', decision: 'amb', plan: ctx.planRel });
      assert.strictEqual(r.receipt.meta.review_single_pass_reason, 'scope_too_small');
      assert.strictEqual('review_single_pass_bypassed_verdict' in r.receipt.meta, false);
      assert.strictEqual(validate(r.receipt).ok, true);
    } finally {
      if (prior === undefined) delete process.env.MCCP_REVIEW_SINGLE_PASS;
      else process.env.MCCP_REVIEW_SINGLE_PASS = prior;
    }
  });
});

// ── forward invariant ─────────────────────────────────────────────────────────

test('negative: the bypass flag alone is rejected', () => {
  withRepo(function (ctx) {
    throwsWrite({
      gate: 'mccp-implement-codex', decision: 'n1', plan: ctx.planRel,
      'review-single-pass-bypassed-verdict': true,
    }, /requires meta\.review_single_pass_reason/, 'an unattributable bypass');
  });
});

test('negative: a bypass claim with no review_verdict is rejected', () => {
  withRepo(function (ctx) {
    throwsWrite({
      gate: 'mccp-implement-codex', decision: 'n2', plan: ctx.planRel,
      'review-single-pass-reason': 'scope_too_small',
      'review-single-pass-bypassed-verdict': true,
    }, /requires resolution\.review_verdict/, 'a downgrade with nothing downgraded');
  });
});

test('negative: a bypass claim beside a CONVERGED verdict is rejected', () => {
  withRepo(function (ctx) {
    throwsWrite(relaxedArgs(ctx, {
      decision: 'n3',
      'review-verdict': 'converged',
      'review-proof-file': ctx.proofFile({
        layers: { l1: 'converged', l2: 'converged', l3: null },
        verification_verdict: 'converged',
        quorum: { passed: true, required: 3, of: 4, roles: 4, responded: 4 },
        perspectives: [{ perspective: 'architect', verdict: 'pass' }],
        dispatch_evidence: EVIDENCE.slice(),
        reviewed_plan_hash: ctx.planHash,
      }),
    }), /requires resolution\.review_verdict="divergent"/,
    'a converged panel had nothing to bypass');
  });
});

// ── reverse invariant ─────────────────────────────────────────────────────────

test('negative: a DIVERGENT panel plan receipt WITHOUT the bypass flag is rejected', () => {
  // With the toggle off, 5.2e HALTs and this receipt is never written. Its
  // existence is therefore itself the evidence a relaxation happened, and the
  // audit flag may not be silently omitted.
  withRepo(function (ctx) {
    const args = relaxedArgs(ctx, { decision: 'n4' });
    delete args['review-single-pass-bypassed-verdict'];
    throwsWrite(args, /must carry meta\.review_single_pass_bypassed_verdict=true/,
      'a bypass that hid its own audit flag');
  });
});

// ── the eligible verdict is `divergent`, not "not converged" ─────────────────
//
// Implement-Codex R1 F1 (high). Reading the invariants as non-converged breaks
// both directions at once, because DD2 relaxes `divergent` ("we looked and found
// a defect") and never `unavailable` ("we could not certify").

test('an UNAVAILABLE panel plan receipt is valid with no bypass claim', () => {
  // The reverse invariant must not fire here. If it did, an honest record of a
  // review that could not certify would be forced to assert a bypass that DD2
  // says the gate cannot even produce.
  withRepo(function (ctx) {
    const proof = auditProof(ctx.planHash);
    proof.layers.l2 = 'unavailable';
    proof.verification_verdict = 'unavailable';
    const r = write({
      gate: 'mccp-plan-codex', decision: 'unav1', plan: ctx.planRel,
      'review-mode': 'multi-agent',
      'review-verdict': 'unavailable',
      'review-source': 'multi-agent',
      'review-proof-file': ctx.proofFile(proof),
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual('review_single_pass_bypassed_verdict' in r.receipt.meta, false);
  });
});

test('negative: a bypass claim beside an UNAVAILABLE verdict is rejected', () => {
  // The mirror direction. Accepting this would let "could not certify" be
  // recorded as "the toggle let a dissent through" — laundering the one verdict
  // the relaxation is forbidden to touch.
  withRepo(function (ctx) {
    const proof = auditProof(ctx.planHash);
    proof.layers.l2 = 'unavailable';
    proof.verification_verdict = 'unavailable';
    throwsWrite({
      gate: 'mccp-plan-codex', decision: 'unav2', plan: ctx.planRel,
      'review-mode': 'multi-agent',
      'review-verdict': 'unavailable',
      'review-source': 'multi-agent',
      'review-proof-file': ctx.proofFile(proof),
      'review-single-pass-reason': 'scope_too_small',
      'review-single-pass-bypassed-verdict': true,
    }, /requires resolution\.review_verdict="divergent"/,
    'unavailable is never relaxed, so it can never be the subject of a bypass');
  });
});

test('the reverse invariant does NOT fire on other gates (ambient reason is not proof)', () => {
  // The discriminator is the PATH, not the ambient toggle state. A gate that
  // never had a relaxation branch must be able to seal a non-converged verdict
  // honestly while the toggle happens to be on.
  withRepo(function (ctx) {
    const prior = process.env.MCCP_REVIEW_SINGLE_PASS;
    process.env.MCCP_REVIEW_SINGLE_PASS = 'scope_too_small';
    try {
      const r = write({
        gate: 'mccp-implement-codex', decision: 'rev1', plan: ctx.planRel,
        'codex-verdict': 'divergent',
      });
      assert.strictEqual(validate(r.receipt).ok, true,
        'forcing this receipt to claim a bypass would be asserting an event that did not occur');
      assert.strictEqual(r.receipt.meta.review_single_pass_reason, 'scope_too_small');
      assert.strictEqual('review_single_pass_bypassed_verdict' in r.receipt.meta, false);
    } finally {
      if (prior === undefined) delete process.env.MCCP_REVIEW_SINGLE_PASS;
      else process.env.MCCP_REVIEW_SINGLE_PASS = prior;
    }
  });
});

// ── multi-agent: the shape is the discriminator here too ─────────────────────
//
// The first draft of the reverse invariant keyed on the SOURCE NAME: every
// divergent multi-agent plan receipt had to claim a bypass, on the argument that
// with the toggle off 5.2e halts and none is ever written. That argument is
// sound but it is about COMMAND-BODY PROSE, and the schema cannot see prose. The
// cost was the same shape the `unavailable` carve-out already rejected one axis
// over: an honest record of a collapsed L1 — the documented manual recovery in
// §3.3 — would have to assert a bypass that never happened.
//
// Binding to `review_proof.layers.l2` costs nothing in coverage, because every
// real relaxation goes through `buildAuditProof`, which always writes a
// non-converged l2.

// The proof an operator would craft when recording an L1 collapse: the panel
// never ran, so there is no L2 layer to speak of.
function l1CollapseProof(planHash) {
  return {
    layers: { l1: 'divergent', l2: null, l3: null },
    verification_verdict: 'divergent',
    quorum: { passed: false, required: 3, of: 4, roles: 0, responded: 0 },
    perspectives: [],
    dispatch_evidence: EVIDENCE.slice(),
    reviewed_plan_hash: planHash,
  };
}

test('an honest L1-collapse record needs no bypass claim (the prose is not the schema)', () => {
  withRepo(function (ctx) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'l1c', plan: ctx.planRel,
      'review-mode': 'multi-agent',
      'review-verdict': 'divergent',
      'review-source': 'multi-agent',
      'review-proof-file': ctx.proofFile(l1CollapseProof(ctx.planHash)),
    });
    assert.strictEqual(validate(r.receipt).ok, true,
      'requiring a bypass claim here would force the record to assert an event that ' +
      'did not occur — the failure the unavailable carve-out already refused');
    assert.strictEqual('review_single_pass_bypassed_verdict' in r.receipt.meta, false);
  });
});

test('negative: a bypass claim on the L1-collapse shape is rejected', () => {
  withRepo(function (ctx) {
    throwsWrite({
      gate: 'mccp-plan-codex', decision: 'l1c2', plan: ctx.planRel,
      'review-mode': 'multi-agent',
      'review-verdict': 'divergent',
      'review-source': 'multi-agent',
      'review-proof-file': ctx.proofFile(l1CollapseProof(ctx.planHash)),
      'review-single-pass-reason': 'scope_too_small',
      'review-single-pass-bypassed-verdict': true,
    }, /requires the relaxation shape \(review_proof\.layers\.l2 non-converged\)/,
      'a panel that never dissented had nothing to bypass');
  });
});

test('the relaxation shape itself still REQUIRES the flag (no hole opened)', () => {
  withRepo(function (ctx) {
    throwsWrite({
      gate: 'mccp-plan-codex', decision: 'l1c3', plan: ctx.planRel,
      'review-mode': 'multi-agent',
      'review-verdict': 'divergent',
      'review-source': 'multi-agent',
      'review-proof-file': ctx.proofFile(auditProof(ctx.planHash)),
    }, /must carry meta\.review_single_pass_bypassed_verdict=true/,
      'loosening the discriminator must not let a real relaxation ship unmarked');
  });
});

// ── explicit reason: enum-checked at the writer, not only at the schema ───────

test('negative: an out-of-enum explicit reason is named by the writer', () => {
  withRepo(function (ctx) {
    throwsWrite(relaxedArgs(ctx, {
      decision: 'badreason',
      'review-single-pass-reason': 'because_i_said_so',
    }), /--review-single-pass-reason must be one of/,
      'the env path gets "must be one of [...]" from parseSinglePass; the explicit ' +
      'path deserves the same sentence rather than a generic SCHEMA_INVALID');
  });
});

// ── DD8 chain drift: observed, never blocking ────────────────────────────────

function withToggle(value, fn) {
  const prior = process.env.MCCP_REVIEW_SINGLE_PASS;
  if (value === null) delete process.env.MCCP_REVIEW_SINGLE_PASS;
  else process.env.MCCP_REVIEW_SINGLE_PASS = value;
  try { return fn(); } finally {
    if (prior === undefined) delete process.env.MCCP_REVIEW_SINGLE_PASS;
    else process.env.MCCP_REVIEW_SINGLE_PASS = prior;
  }
}

function captureStderr(fn) {
  const original = process.stderr.write;
  let out = '';
  process.stderr.write = function (c) { out += String(c); return true; };
  try { fn(); } finally { process.stderr.write = original; }
  return out;
}

test('chain drift: toggle ON at plan, OFF at implement → warn, and the write succeeds', () => {
  withRepo(function (ctx) {
    withToggle('scope_too_small', function () { write(relaxedArgs(ctx, { decision: 'drift1' })); });

    let r = null;
    const stderr = captureStderr(function () {
      r = withToggle(null, function () {
        return write({
          gate: 'mccp-implement-codex', decision: 'drift1', plan: ctx.planRel,
          'codex-verdict': 'converged',
        });
      });
    });
    assert.match(stderr, /chain drift/, 'the mismatch must be surfaced');
    assert.match(stderr, /scope_too_small/, 'and must name what the prior gate recorded');
    assert.strictEqual(validate(r.receipt).ok, true,
      'DD8 observes and does not block — forcing chain-wide agreement would make the ' +
      'operator plan the whole chain before setting the toggle');
    assert.strictEqual('review_single_pass_reason' in r.receipt.meta, false);
  });
});

test('chain drift: toggle OFF at plan, ON at implement → warn the other way', () => {
  withRepo(function (ctx) {
    withToggle(null, function () {
      write({
        gate: 'mccp-plan-codex', decision: 'drift2', plan: ctx.planRel,
        'codex-verdict': 'converged',
      });
    });

    const stderr = captureStderr(function () {
      withToggle('deadline_pressure', function () {
        write({
          gate: 'mccp-implement-codex', decision: 'drift2', plan: ctx.planRel,
          'codex-verdict': 'converged',
        });
      });
    });
    assert.match(stderr, /chain drift/);
    assert.match(stderr, /deadline_pressure/);
  });
});

test('chain drift: agreement is quiet, and the first gate has nothing to compare against', () => {
  withRepo(function (ctx) {
    withToggle('scope_too_small', function () {
      // plan is REVIEW_CHAIN_ORDER[0] — no predecessor exists, so no comparison
      // is attempted no matter what the toggle says.
      const first = captureStderr(function () { write(relaxedArgs(ctx, { decision: 'drift3' })); });
      assert.doesNotMatch(first, /chain drift/,
        'the first gate in the chain has no prior receipt to disagree with');

      const second = captureStderr(function () {
        write({
          gate: 'mccp-implement-codex', decision: 'drift3', plan: ctx.planRel,
          'codex-verdict': 'converged',
        });
      });
      assert.doesNotMatch(second, /chain drift/, 'matching state must not warn');
    });
  });
});

// ── hybrid: the shape is the discriminator ────────────────────────────────────

test('hybrid relaxation round-trips from the real oracle through writer and schema', () => {
  withRepo(function (ctx) {
    const d = decideReview({
      mode: 'hybrid',
      l1: { verdict: 'converged', violations: [] },
      l2: {
        quorum: { passed: false, responded: 4, required: 3, of: 4, roles: 4,
          reason: '1 blocking finding' },
        results: [
          { perspective: 'architect', verdict: 'pass' },
          { perspective: 'security', verdict: 'pass' },
        ],
      },
      l3: { invoked: true, verdict: 'converged' },
      dispatchEvidence: EVIDENCE.slice(),
      reviewedPlanHash: ctx.planHash,
      currentPlanHash: ctx.planHash,
      singlePass: { active: true, reason: 'deadline_pressure' },
    });
    assert.strictEqual(d.block, false);

    const r = write({
      gate: 'mccp-plan-codex', decision: 'hy1', plan: ctx.planRel,
      'review-mode': 'hybrid',
      'review-verdict': d.review_verdict,
      'review-source': d.review_source,
      'review-proof-file': ctx.proofFile(d.review_proof),
      'review-single-pass-reason': d.single_pass_reason,
      'review-single-pass-bypassed-verdict': true,
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.resolution.review_source, 'hybrid');
    assert.strictEqual(r.receipt.resolution.review_proof.layers.l3, 'converged',
      'the corroborating L3 must be sealed, not flattened away');
    assert.strictEqual(r.receipt.resolution.review_verdict, 'divergent');

    // Evidence is kept, but it buys no dedupe: cross-model corroboration
    // requires a converged verdict first, and this one is divergent.
    assert.strictEqual(isCrossModelCorroborated(r.receipt.resolution), false);
  });
});

test('negative: forged hybrid — a dissenting L3 cannot be dressed as a bypass', () => {
  withRepo(function (ctx) {
    throwsWrite({
      gate: 'mccp-plan-codex', decision: 'fh1', plan: ctx.planRel,
      'review-mode': 'hybrid',
      'review-verdict': 'divergent',
      'review-source': 'hybrid',
      'review-proof-file': ctx.proofFile(auditProof(ctx.planHash, 'divergent')),
      'review-single-pass-reason': 'scope_too_small',
      'review-single-pass-bypassed-verdict': true,
    }, /requires the relaxation shape/,
    'DD2 forbids relaxing a dissenting L3, so the flag would seal a bypass that never happened');
  });
});

test('negative: forged hybrid — a converged L2 cannot be dressed as a bypass', () => {
  withRepo(function (ctx) {
    const proof = auditProof(ctx.planHash, 'divergent');
    proof.layers.l2 = 'converged';   // L1+L2 fine, L3 dissented: an honest NON-relaxation
    throwsWrite({
      gate: 'mccp-plan-codex', decision: 'fh2', plan: ctx.planRel,
      'review-mode': 'hybrid',
      'review-verdict': 'divergent',
      'review-source': 'hybrid',
      'review-proof-file': ctx.proofFile(proof),
      'review-single-pass-reason': 'scope_too_small',
      'review-single-pass-bypassed-verdict': true,
    }, /requires the relaxation shape/, 'L3 dissent recorded as if it were a bypass');
  });
});

// ── downstream properties DD1 depends on ──────────────────────────────────────

test('projection pin: a divergent review receipt reads as NOT converged everywhere', () => {
  withRepo(function (ctx) {
    const r = write(relaxedArgs(ctx, { decision: 'proj' }));

    // Raw resolution.converged stays true — it means "the writer finalized
    // findings" (the B#11 split), not "approved". What consumers see is the
    // projection, so THAT is what must read false.
    assert.strictEqual(r.receipt.resolution.converged, true);
    assert.strictEqual(isConvergedVerdict(r.receipt.resolution), false);

    const scan = scanReceipts(ctx.repo);
    assert.strictEqual(scan.ok, true, scan.error);
    const rows = scan.items.filter(function (x) { return x && x.decision_id === 'proj'; });
    assert.ok(rows.length > 0, 'the derive source must see the receipt');
    rows.forEach(function (row) {
      assert.strictEqual(row.converged, false,
        'if this projection ever flips, a sealed non-converged review renders as approved');
    });
  });
});

test('dedupe negative: a multi-agent receipt never counts as cross-model corroboration', () => {
  withRepo(function (ctx) {
    const r = write(relaxedArgs(ctx, { decision: 'ded' }));
    assert.strictEqual(isCrossModelCorroborated(r.receipt.resolution), false,
      'skipping PR-Codex on a panel-only receipt would buy a dual review that never happened');
  });
});

test('chain regression pin: a divergent review receipt blocks NEITHER downstream consumer', () => {
  // DD1 rests on "no downstream validator consumes review_verdict", which was
  // true by grep alone. Both consumers are pinned: pinning one lets the other
  // change in silence.
  withRepo(function (ctx) {
    write(relaxedArgs(ctx, { decision: 'chain' }));

    ['mccp:prp-implement', 'mccp:pr'].forEach(function (command) {
      const res = validateCommand(command, {
        cwd: ctx.repo, decisionId: 'chain', planPath: ctx.planRel,
      });
      const offenders = []
        .concat(res.blocking || [], res.stale || [])
        .filter(function (b) { return /review_verdict|divergent/i.test(JSON.stringify(b)); });
      assert.deepStrictEqual(offenders, [],
        command + ' must not block on a non-converged review_verdict (DD1). ' +
        'If this went red, M1 has been neutralised downstream: ' + JSON.stringify(res));
    });
  });
});
