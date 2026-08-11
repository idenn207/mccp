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

// ── M1.5 — mislabel axis receipt surface (Task 7) ────────────────────────────

const MISLABEL_KEYS = [
  'intent_mislabel_mode', 'intent_reviewer_contract', 'intent_claim_counts',
  'intent_claims_digest', 'intent_mislabel_disputes', 'intent_mislabel_audit',
];

function goodCounts(extra) {
  return Object.assign({
    total: 2, claimed: 2, unclaimed: 0,
    agree_none: 1, agree_conflict: 0, id_mismatch: 0,
    reviewer_only: 1, author_only: 0,
    reviewer_conflict: 1, author_conflict: 0,
  }, extra || {});
}

function auditEntry(extra) {
  return Object.assign({
    finding_index: 0,
    finding_digest: 'sha256:' + 'b'.repeat(64),
    reviewer_claim: 'UI1',
    author_conflict: 'none',
    classification: 'reviewer-only',
    resolution: 'disputed',
    dispute_reason: 'the reviewer misread the boundary and this finding never touches it',
  }, extra || {});
}

// The two direct-write exits (free-form skip, audited override) never reach the
// runner, so they have to null the mislabel axis themselves. `hasOwnProperty` is
// the point of this helper, not decoration: an ABSENT key and a null one read
// identically through `meta.x === null`, and absence is precisely the regression
// — it would make a receipt written today indistinguishable from one written
// before M1.5 existed, which is the opposite of what the schema's present-only
// contract promises.
const MISLABEL_AXIS_KEYS = [
  'intent_mislabel_mode', 'intent_reviewer_contract', 'intent_claim_counts',
  'intent_claims_digest', 'intent_mislabel_disputes', 'intent_mislabel_audit',
];
function assertMislabelAxisNulled(meta) {
  MISLABEL_AXIS_KEYS.forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(meta, k),
      'meta.' + k + ' must be written (as null), not omitted, by a current writer');
    assert.strictEqual(meta[k], null, 'meta.' + k + ' must be null on a direct-write path');
  });
}

function mislabelDecision(extra) {
  return goodDecision(Object.assign({
    mislabel_mode: 'enforce',
    reviewer_contract: 'full',
    claim_counts: goodCounts(),
    claims_digest: 'sha256:' + 'c'.repeat(64),
    mislabel_disputes: 1,
    mislabel_audit: [auditEntry()],
  }, extra || {}));
}

test('M1.5 fields are PRESENT-ONLY and never materialized out of scope', function () {
  withRepo(FREE_FORM_PLAN, function (repo, planRel) {
    const r = write({ gate: 'mccp-implement-codex', decision: 'ig-x', plan: planRel });
    MISLABEL_KEYS.forEach(function (k) {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(r.receipt.meta, k), false,
        k + ' must not be materialized on an out-of-scope receipt');
    });
  });
});

test('M1.5 fields are absent from makeSkeleton — the tracked ship corpus hash is untouched', function () {
  // Call it rather than scanning its source: a textual scan silently passes the
  // day the function is renamed, which is exactly when this guard matters.
  const { makeSkeleton } = require('../schema');
  const meta = makeSkeleton({}).meta;
  assert.ok(meta && typeof meta === 'object', 'makeSkeleton must still produce a meta object');
  MISLABEL_KEYS.forEach(function (k) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(meta, k), false,
      k + ' must not be in makeSkeleton (absence is the "unknown" signal, and a ' +
      'materialized default would move receipt_hash for every existing receipt)');
  });
});

test('M1.5 — a full mislabel decision round-trips and validates', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(r.receipt.meta.intent_mislabel_mode, 'enforce');
    assert.strictEqual(r.receipt.meta.intent_reviewer_contract, 'full');
    assert.strictEqual(r.receipt.meta.intent_mislabel_disputes, 1);
    assert.strictEqual(r.receipt.meta.intent_mislabel_audit.length, 1);
    assert.strictEqual(r.receipt.meta.intent_mislabel_audit[0].finding_digest,
      'sha256:' + 'b'.repeat(64));
  });
});

test('M1.5 — a counts object that does not partition the findings is rejected', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    // Dropping a classification without redistributing it leaves the six
    // classifications summing to less than total. This test covers ONLY that
    // arithmetic — the aggregate-vs-evidence check is a separate axis below,
    // because a partition-preserving edit sails straight through this one.
    r.receipt.meta.intent_claim_counts = goodCounts({ reviewer_only: 0 });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.join(' ').indexOf('partition') !== -1, v.errors.join(' '));
  });
});

test('M1.5 — counts that partition cleanly but contradict the audit are rejected', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    // The edit the partition invariant cannot see: move the reviewer_only into
    // author_only. Total, claimed/unclaimed and the partition all still balance,
    // so the summary now reads "nothing needed a response" while the audit array
    // right below it still holds the evidence that one did.
    r.receipt.meta.intent_claim_counts = goodCounts({ reviewer_only: 0, author_only: 1 });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false, 'a clean-looking summary must not outvote its own evidence');
    const joined = v.errors.join(' ');
    assert.ok(joined.indexOf('partition') === -1,
      'this must fail on reconciliation, not on arithmetic: ' + joined);
    assert.ok(joined.indexOf('reviewer_only') !== -1 && joined.indexOf('audit') !== -1, joined);
  });
});

test('M1.5 — an id-mismatch tally that disagrees with the audit is rejected', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    // Relabel the response as the other blocking kind. The partition, the total
    // and even the number of entries all still agree — only the per-class tally
    // disagrees, so a reconciliation done on array length alone would miss it.
    r.receipt.meta.intent_claim_counts = goodCounts({ reviewer_only: 0, id_mismatch: 1 });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.join(' ').indexOf('id_mismatch') !== -1, v.errors.join(' '));
  });
});

test('M1.5 — the audit array cannot be dropped to make the counts look clean', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    // The other half of the same edit: keep the honest counts, delete the
    // evidence. Absence is only acceptable when the counts agree there was
    // nothing to record.
    r.receipt.meta.intent_mislabel_audit = null;
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.join(' ').indexOf('cannot be dropped') !== -1, v.errors.join(' '));
  });
});

test('M1.5 — a dispute count that the audit does not support is rejected', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    // Understating disputes hides that a reviewer objection was waved off;
    // overstating them manufactures a record that no entry backs.
    r.receipt.meta.intent_mislabel_disputes = 0;
    assert.strictEqual(validate(r.receipt).ok, false);

    r.receipt.meta.intent_mislabel_disputes = 2;
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.join(' ').indexOf('disputes') !== -1, v.errors.join(' '));
  });
});

test('M1.5 — an all-clear mislabel round (no responses needed) still validates', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    // The reconciliation must not make the ordinary clean case unwritable: an
    // empty audit array with zeroed response tallies is what a compliant review
    // with no disagreement actually produces.
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision({
        claim_counts: goodCounts({ reviewer_only: 0, agree_none: 2, reviewer_conflict: 0 }),
        mislabel_disputes: 0,
        mislabel_audit: [],
      }),
    });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  });
});

test('M1.5 — claimed + unclaimed must equal total', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    r.receipt.meta.intent_claim_counts = goodCounts({ claimed: 1, agree_none: 2 });
    assert.strictEqual(validate(r.receipt).ok, false);
  });
});

test('M1.5 — an unknown key in intent_claim_counts is rejected', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    r.receipt.meta.intent_claim_counts = goodCounts({ smuggled: 3 });
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.join(' ').indexOf('unknown key') !== -1, v.errors.join(' '));
  });
});

test('M1.5 — audit entries are schema-checked, not free-form', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    r.receipt.meta.intent_mislabel_audit = [auditEntry({ classification: 'agree-none' })];
    assert.strictEqual(validate(r.receipt).ok, false, 'only the two response-needed classes belong here');

    r.receipt.meta.intent_mislabel_audit = [auditEntry({ resolution: 'whatever' })];
    assert.strictEqual(validate(r.receipt).ok, false);

    r.receipt.meta.intent_mislabel_audit = [auditEntry({ finding_digest: 'not-a-digest' })];
    assert.strictEqual(validate(r.receipt).ok, false);

    r.receipt.meta.intent_mislabel_audit = [auditEntry({ finding_index: -1 })];
    assert.strictEqual(validate(r.receipt).ok, false);
  });
});

test('M1.5 — the audit array has no silent truncation branch', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision(),
    });
    const many = [];
    for (let i = 0; i < 1001; i++) many.push(auditEntry({ finding_index: i }));
    r.receipt.meta.intent_mislabel_audit = many;
    const v = validate(r.receipt);
    assert.strictEqual(v.ok, false, 'over-cap must ERROR, never be sliced away');
    assert.ok(v.errors.join(' ').indexOf('exceeds 1000') !== -1, v.errors.join(' '));
  });
});

test('M1.5 — a warn receipt allows the chain but is never dedupe-approved (DD6)', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision({
        verdict: 'mislabel_unresolved',
        runtime_allowed: true,          // warn allowed the run
        force_override: false,          // ...so the override never applied (DD12)
        mislabel_mode: 'warn',
        mislabel_disputes: 0,
        mislabel_audit: [auditEntry({ resolution: 'unresolved', dispute_reason: null })],
      }),
    });
    assert.strictEqual(validate(r.receipt).ok, true, JSON.stringify(validate(r.receipt).errors));
    assert.strictEqual(r.receipt.meta.intent_gate_verdict, 'mislabel_unresolved',
      'warn seals the real verdict rather than laundering it');
    assert.strictEqual(isIntentChainAllowed(r.receipt.meta), true);
    assert.strictEqual(isIntentApproved(r.receipt), false,
      'warn must never open cross-gate dedupe — this is where warn costs something');
    assert.strictEqual(r.receipt.meta.intent_gate_force_override, false);
  });
});

test('M1.5 — DD12: warn plus an applied override seals BOTH fields', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    // warn does not reach the M1 axis, so an `incomplete` under warn is passed
    // by the audited override — and both facts must be readable afterwards.
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: mislabelDecision({
        verdict: 'incomplete',
        runtime_allowed: true,
        mislabel_mode: 'warn',
        force_override: true,
        force_override_reason:
          'proceeding under an audited override because the reviewer quota is exhausted today',
      }),
    });
    assert.strictEqual(validate(r.receipt).ok, true, JSON.stringify(validate(r.receipt).errors));
    assert.strictEqual(r.receipt.meta.intent_mislabel_mode, 'warn');
    assert.strictEqual(r.receipt.meta.intent_gate_force_override, true);
    assert.strictEqual(r.receipt.meta.intent_gate_verdict, 'incomplete');
    assert.strictEqual(isIntentApproved(r.receipt), false);
  });
});

test('M1.5 — off leaves every mislabel field null except the mode itself', function () {
  withRepo(PRD_PLAN, function (repo, planRel) {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'ig-x', plan: planRel,
      intentDecision: goodDecision({
        mislabel_mode: 'off',
        reviewer_contract: null,
        claim_counts: null,
        claims_digest: null,
        mislabel_disputes: null,
        mislabel_audit: null,
      }),
    });
    assert.strictEqual(validate(r.receipt).ok, true, JSON.stringify(validate(r.receipt).errors));
    assert.strictEqual(r.receipt.meta.intent_mislabel_mode, 'off');
    assert.strictEqual(r.receipt.meta.intent_reviewer_contract, null);
    assert.strictEqual(r.receipt.meta.intent_mislabel_audit, null);
  });
});

test('M1.5 — there is still NO --intent-* CLI flag', function () {
  const src = require('fs').readFileSync(require.resolve('../cli.js'), 'utf8');
  assert.strictEqual(/--intent-[a-z-]+/.test(src), false,
    'any --intent-* flag would let a shell caller stamp an approving verdict');
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
    assertMislabelAxisNulled(r.receipt.meta);
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
    assertMislabelAxisNulled(m);
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
