'use strict';

// codex-intent-context M1 Task 8 — receipt-layer contract for the intent gate:
// present-only schema fields, write-side stamping, the fail-closed that has no
// CLI surface, and the override that seals rather than launders its verdict.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate } = require('../schema');
const { isIntentApproved, isIntentChainAllowed, classifyIntentMeta } = require('../../lib/intent-context');

const PRD_PLAN = [
  '# Plan: ig-x',
  '',
  '**Source PRD**: `.claude/prds/ig.prd.md`',
  '',
  '## User Intent',
  '',
  '| ID | Constraint (user-stated) | Kind |',
  '|---|---|---|',
  '| UI1 | keep the milestone scope narrow | direction |',
  '',
  '## Summary',
  '',
  'body',
  '',
].join('\n');

const FREE_FORM_PLAN = '# Plan: ig-free\n\n## Summary\n\nbody\n';

function withRepo(planBody, fn) {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/ig-x.plan.md', planBody);
  const cwd = process.cwd();
  process.chdir(repo);
  const savedOverride = process.env.MCCP_SKIP_INTENT_GATE;
  delete process.env.MCCP_SKIP_INTENT_GATE;
  try {
    return fn(repo, path.relative(repo, plan).split(path.sep).join('/'));
  } finally {
    if (savedOverride === undefined) delete process.env.MCCP_SKIP_INTENT_GATE;
    else process.env.MCCP_SKIP_INTENT_GATE = savedOverride;
    process.chdir(cwd);
  }
}

function goodDecision(extra) {
  return Object.assign({
    verdict: 'preserved',
    runtime_allowed: true,
    reason: 'all findings adjudicated',
    skip_proof: null,
    counts: { total: 2, conflict: 1, none: 1, overrides: 1, by_verdict: { ACCEPT_NOW: 2 } },
    section_present: true,
    items_count: 1,
    reference_injected: true,
    plan_digest: null,   // filled by the caller from the written receipt
    run_nonce: '11111111-2222-4333-8444-555555555555',
    force_override: false,
    force_override_reason: null,
  }, extra || {});
}

// ── present-only schema ──────────────────────────────────────────────────────

test('intent fields are PRESENT-ONLY: a receipt that never exercises the gate omits every key', function () {
  withRepo(FREE_FORM_PLAN, function (repo, planRel) {
    // An out-of-scope gate must carry no intent axis at all.
    const r = write({ gate: 'mccp-implement-codex', decision: 'ig-x', plan: planRel });
    assert.strictEqual(validate(r.receipt).ok, true);
    [
      'intent_section_present', 'intent_items_count', 'intent_reference_injected',
      'intent_gate_verdict', 'intent_adjudication_counts', 'intent_gate_force_override',
      'intent_gate_force_override_reason', 'intent_skip_proof', 'intent_plan_digest',
      'intent_run_nonce',
    ].forEach(function (k) {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(r.receipt.meta, k), false,
        k + ' must not be materialized on an out-of-scope receipt');
    });
    // DD2 — and therefore it reads as "unknown", never as approved.
    assert.strictEqual(classifyIntentMeta(r.receipt.meta), 'unknown');
  });
});

test('a legacy-shaped receipt (no intent keys) validates unchanged', function () {
  withRepo(FREE_FORM_PLAN, function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: 'ig-x', plan: planRel });
    delete r.receipt.meta.intent_gate_verdict;   // belt-and-braces
    assert.strictEqual(validate(r.receipt).ok, true);
  });
});

// ── write-side stamping ──────────────────────────────────────────────────────

test('write STAMPS the runner decision verbatim and the receipt validates', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      'codex-verdict': 'divergent',
      intentDecision: goodDecision(),
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    const m = r.receipt.meta;
    assert.strictEqual(m.intent_gate_verdict, 'preserved');
    assert.strictEqual(m.intent_section_present, true);
    assert.strictEqual(m.intent_items_count, 1);
    assert.strictEqual(m.intent_reference_injected, true);
    assert.strictEqual(m.intent_run_nonce, '11111111-2222-4333-8444-555555555555');
    assert.strictEqual(m.intent_adjudication_counts.total, 2);
    assert.strictEqual(m.intent_gate_force_override, false);
  });
});

test('DD1 — a free-form plan is a PROVEN skip, stamped mechanically, and approves dedupe', function () {
  withRepo(FREE_FORM_PLAN, function (repo, planRel) {
    const r = write({ gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel });
    assert.strictEqual(validate(r.receipt).ok, true);
    assert.strictEqual(r.receipt.meta.intent_gate_verdict, 'skipped');
    assert.strictEqual(r.receipt.meta.intent_skip_proof, 'free_form_plan');
    // the proof is corroborated by the very body being sealed
    assert.strictEqual(r.receipt.meta.intent_plan_digest, r.receipt.plan_hash);
    assert.strictEqual(isIntentApproved(r.receipt), true);
  });
});

// ── the fail-closed and its (absent) CLI surface ─────────────────────────────

test('a PRD-mode plan with NO decision fails closed with an actionable message', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    assert.throws(
      function () { write({ gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel }); },
      function (err) {
        assert.strictEqual(err.code, 'INTENT_GATE_BLOCKED');
        // Codex F1 — the message must name BOTH recovery paths, not just exit.
        assert.match(err.message, /\/mccp:plan/);
        assert.match(err.message, /MCCP_SKIP_INTENT_GATE/);
        return true;
      });
  });
});

test('R1 F2 — nothing parseFlags can produce is accepted as an intent decision', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    // cli.js parseFlags yields ONLY strings, `true`, or arrays of those. Each
    // must be refused, which is what makes "no CLI surface" structural rather
    // than a documentation promise.
    ['preserved', 'true', true, ['preserved'], 42].forEach(function (forged) {
      assert.throws(
        function () {
          write({
            gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
            intentDecision: forged,
          });
        },
        function (err) {
          assert.strictEqual(err.code, 'INTENT_GATE_BLOCKED');
          assert.match(err.message, /non-null object|CLI flags cannot/);
          return true;
        },
        'forged intentDecision accepted: ' + JSON.stringify(forged));
    });
  });
});

test('a blocking decision throws instead of writing an approving receipt', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    assert.throws(
      function () {
        write({
          gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
          intentDecision: goodDecision({
            verdict: 'incomplete', runtime_allowed: false, reason: 'one finding unadjudicated',
          }),
        });
      },
      function (err) {
        assert.strictEqual(err.code, 'INTENT_GATE_BLOCKED');
        assert.match(err.message, /incomplete/);
        return true;
      });
  });
});

test('the intent axis is refused on out-of-scope gates (UI4)', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    assert.throws(
      function () {
        write({
          gate: 'mccp-implement-codex', decision: 'ig-x', plan: planRel,
          intentDecision: goodDecision(),
        });
      },
      /out-of-scope gate/);
  });
});

// ── audited override: seals, never launders (DD6 / R1 F3) ────────────────────

test('DD6/R1 F3 — an overridden receipt seals the REAL verdict; chain allows, dedupe refuses', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    process.env.MCCP_SKIP_INTENT_GATE =
      'operator accepted the residual gap for this cycle after manual review';
    const r = write({ gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel });
    assert.strictEqual(validate(r.receipt).ok, true);

    const m = r.receipt.meta;
    // the verdict is NOT rewritten to a passing value
    assert.strictEqual(m.intent_gate_verdict, 'incomplete');
    assert.strictEqual(m.intent_gate_force_override, true);
    assert.ok(m.intent_gate_force_override_reason.length >= 30);

    // per-consumer split: the chain can proceed, dedupe cannot be certified
    assert.strictEqual(isIntentChainAllowed(m), true);
    assert.strictEqual(isIntentApproved(r.receipt), false,
      'a forced receipt must never certify a cross-gate dedupe skip');
  });
});

test('the override reason is held to the strict validator', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    process.env.MCCP_SKIP_INTENT_GATE = 'yes';
    assert.throws(
      function () { write({ gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel }); },
      /MCCP_SKIP_INTENT_GATE rejected/);
  });
});

// ── schema guards ────────────────────────────────────────────────────────────

test('schema rejects an unknown verdict and a broken counts invariant', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const base = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: goodDecision(),
    }).receipt;

    const badVerdict = JSON.parse(JSON.stringify(base));
    badVerdict.meta.intent_gate_verdict = 'totally-made-up';
    assert.strictEqual(validate(badVerdict).ok, false);

    const badSum = JSON.parse(JSON.stringify(base));
    badSum.meta.intent_adjudication_counts = {
      total: 5, conflict: 1, none: 1, overrides: 0, by_verdict: { ACCEPT_NOW: 2 },
    };
    const v = validate(badSum);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.join(' ').indexOf('sum of by_verdict') !== -1);

    const badProof = JSON.parse(JSON.stringify(base));
    badProof.meta.intent_skip_proof = 'because-i-said-so';
    assert.strictEqual(validate(badProof).ok, false);
  });
});

test('Codex F2 — by_verdict stays an OPEN map: a future verdict key still validates', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: goodDecision({
        counts: {
          total: 3, conflict: 1, none: 2, overrides: 0,
          // a verdict that does not exist today — must NOT retroactively
          // invalidate the receipt, or sealed history breaks on every enum bump
          by_verdict: { ACCEPT_NOW: 2, SOME_FUTURE_VERDICT: 1 },
        },
      }),
    });
    assert.strictEqual(validate(r.receipt).ok, true, JSON.stringify(validate(r.receipt).errors));
  });
});
