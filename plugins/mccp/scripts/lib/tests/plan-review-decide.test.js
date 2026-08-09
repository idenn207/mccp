'use strict';

// diverse-agent-review M1 Task 6 — three-layer composition oracle.
//
// Walks every row of the composition table, asserts forwardCodexVerdict is true
// ONLY when hybrid actually ran L3, checks the divergent/unavailable distinction
// ("found a defect" vs "could not certify"), and — the integration bit that
// matters — verifies the proof this oracle assembles actually satisfies the
// Task 1 structural oracle that schema.js and resolveEffectiveVerdict enforce.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideReview,
  parseReviewMode,
  parseL3Enabled,
  DEFAULT_MODE,
  TYPO_MODE,
} = require('../plan-review/decide');
const { isReviewProofStructurallyValid, resolveEffectiveVerdict } = require('../review-verdict');

const HASH_A = 'sha256:' + 'a'.repeat(64);
const HASH_B = 'sha256:' + 'b'.repeat(64);

const L1_PASS = { verdict: 'converged', violations: [] };
const L1_FAIL = {
  verdict: 'divergent',
  violations: [{ code: 'C3_MISSING_TARGET', detail: 'UPDATE target does not exist: x.js' }],
};
const L1_INCONCLUSIVE = {
  verdict: 'inconclusive',
  violations: [{ code: 'E_READ', detail: 'cannot read plan: ENOENT' }],
};

function quorumPass(overrides) {
  return Object.assign({
    passed: true, responded: 4, roles: 4, of: 4, required: 3, rolesMin: 3,
    malformed: 0, blockingFindings: [], reason: 'quorum satisfied',
  }, overrides || {});
}

function reviewerResults() {
  return ['architect', 'security', 'test', 'invariant'].map(function (p) {
    return { perspective: p, verdict: 'pass', findings: [], refutationAttempted: 'x' };
  });
}

function l2Pass(overrides) {
  return Object.assign({ quorum: quorumPass(), results: reviewerResults() }, overrides || {});
}

function base(overrides) {
  return Object.assign({
    mode: 'multi-agent',
    l1: L1_PASS,
    l2: l2Pass(),
    l3: null,
    dispatchEvidence: ['.claude/state/dispatches/abc.envelope.json'],
    reviewedPlanHash: HASH_A,
    currentPlanHash: HASH_A,
  }, overrides || {});
}

// ── row 1: L1 inconclusive ────────────────────────────────────────────────────

test('L1 inconclusive → unavailable/multi-agent, no forward, L2 irrelevant', () => {
  const d = decideReview(base({ l1: L1_INCONCLUSIVE }));
  assert.equal(d.review_verdict, 'unavailable');
  assert.equal(d.review_source, 'multi-agent');
  assert.equal(d.review_proof, null);
  assert.equal(d.block, true);
  assert.equal(d.forwardCodexVerdict, false);
  assert.match(d.reason, /E_READ/);
});

test('missing L1 result is inconclusive, not a pass', () => {
  const d = decideReview(base({ l1: null }));
  assert.equal(d.review_verdict, 'unavailable');
  assert.equal(d.block, true);
});

// ── row 2: L1 divergent ───────────────────────────────────────────────────────

test('L1 divergent → divergent, and L2 is never consulted', () => {
  const d = decideReview(base({ l1: L1_FAIL, l2: null }));
  assert.equal(d.review_verdict, 'divergent');
  assert.equal(d.review_source, 'multi-agent');
  assert.equal(d.block, true);
  assert.equal(d.forwardCodexVerdict, false);
  assert.match(d.reason, /L2 was not fired/);
});

test('L1 divergent in hybrid mode still short-circuits before L3', () => {
  const d = decideReview(base({
    mode: 'hybrid', l1: L1_FAIL,
    l3: { invoked: true, verdict: 'converged' },
  }));
  assert.equal(d.review_verdict, 'divergent');
  assert.equal(d.review_source, 'multi-agent');
  assert.equal(d.forwardCodexVerdict, false);
});

// ── row 3: hash mismatch (DD13) ───────────────────────────────────────────────

test('DD13: reviewed hash ≠ current hash → unavailable even with a passing quorum', () => {
  const d = decideReview(base({ reviewedPlanHash: HASH_A, currentPlanHash: HASH_B }));
  assert.equal(d.review_verdict, 'unavailable');
  assert.equal(d.review_source, 'multi-agent');
  assert.equal(d.review_proof, null);
  assert.match(d.reason, /plan changed after L2 read it/);
  assert.match(d.reason, /rerun L2/);
});

test('DD13: hash mismatch beats a converged L3 in hybrid mode too', () => {
  const d = decideReview(base({
    mode: 'hybrid', reviewedPlanHash: HASH_A, currentPlanHash: HASH_B,
    l3: { invoked: true, verdict: 'converged' },
  }));
  assert.equal(d.review_verdict, 'unavailable');
  assert.equal(d.forwardCodexVerdict, false);
});

test('DD13: absent reviewed hash → unavailable (an unbound review is uncertifiable)', () => {
  const d = decideReview(base({ reviewedPlanHash: null }));
  assert.equal(d.review_verdict, 'unavailable');
  assert.match(d.reason, /no reviewed_plan_hash/);
});

// ── row 4: quorum not met ─────────────────────────────────────────────────────

test('quorum not met → divergent (we looked and found a defect)', () => {
  const d = decideReview(base({
    l2: l2Pass({
      quorum: quorumPass({
        passed: false,
        blockingFindings: [{ perspective: 'security', claim: 'leak', severity: 'HIGH' }],
        reason: '1 blocking finding(s): security/HIGH',
      }),
    }),
  }));
  assert.equal(d.review_verdict, 'divergent');
  assert.equal(d.review_proof, null);
  assert.equal(d.block, true);
  assert.match(d.reason, /security\/HIGH/);
});

// ── row 5: L2 missing / unreadable / silent ───────────────────────────────────

test('L2 artifact missing → unavailable, NOT divergent', () => {
  const d = decideReview(base({ l2: null }));
  assert.equal(d.review_verdict, 'unavailable');
  assert.match(d.reason, /did not observe/);
});

test('L2 present but shapeless → unavailable', () => {
  [{}, { quorum: null }, { quorum: 'passed' }].forEach(function (l2) {
    const d = decideReview(base({ l2: l2 }));
    assert.equal(d.review_verdict, 'unavailable', JSON.stringify(l2));
  });
});

test('L2 fired but nobody responded usably → unavailable', () => {
  const d = decideReview(base({
    l2: l2Pass({ quorum: quorumPass({ passed: false, responded: 0, malformed: 4 }) }),
  }));
  assert.equal(d.review_verdict, 'unavailable');
  assert.match(d.reason, /no reviewer responded usably/);
});

// ── row 6: multi-agent happy path ─────────────────────────────────────────────

test('multi-agent: L1+L2 pass → converged/multi-agent, NO codex forward', () => {
  const d = decideReview(base());
  assert.equal(d.review_verdict, 'converged');
  assert.equal(d.review_source, 'multi-agent');
  assert.equal(d.block, false);
  assert.equal(d.forwardCodexVerdict, false,
    'multi-agent must never forward a codex verdict — that is what keeps dedupe fail-closed');
  assert.ok(d.review_proof);
  assert.equal(d.review_proof.layers.l3, null);
});

test('multi-agent ignores an L3 result it never asked for', () => {
  const d = decideReview(base({ l3: { invoked: true, verdict: 'converged' } }));
  assert.equal(d.review_source, 'multi-agent');
  assert.equal(d.forwardCodexVerdict, false);
  assert.equal(d.review_proof.layers.l3, null);
});

// ── row 7/8: hybrid with L3 ───────────────────────────────────────────────────

test('hybrid + L3 converged → converged/hybrid WITH codex forward', () => {
  const d = decideReview(base({ mode: 'hybrid', l3: { invoked: true, verdict: 'converged' } }));
  assert.equal(d.review_verdict, 'converged');
  assert.equal(d.review_source, 'hybrid');
  assert.equal(d.forwardCodexVerdict, true);
  assert.equal(d.review_proof.layers.l3, 'converged');
});

test('hybrid + L3 divergent → L3 verdict stands, panel does not overrule it', () => {
  ['divergent', 'critical'].forEach(function (v) {
    const d = decideReview(base({ mode: 'hybrid', l3: { invoked: true, verdict: v } }));
    assert.equal(d.review_verdict, v, v);
    assert.equal(d.review_source, 'hybrid', v);
    assert.equal(d.block, true, v);
    assert.equal(d.forwardCodexVerdict, true, v);
  });
});

// ── row 9: hybrid requested, L3 never ran ─────────────────────────────────────

test('hybrid requested but L3 did not run → unavailable, source honestly multi-agent', () => {
  const cases = [
    null,
    { invoked: false, reason: 'MCCP_PLAN_REVIEW_L3=0' },
    { invoked: true, verdict: 'unavailable', reason: 'codex timeout' },
    { invoked: true, verdict: 'skipped', reason: 'MCCP_CODEX_DISABLED=1' },
    { invoked: true },
  ];
  cases.forEach(function (l3, i) {
    const d = decideReview(base({ mode: 'hybrid', l3: l3 }));
    assert.equal(d.review_verdict, 'unavailable', 'case ' + i);
    assert.equal(d.review_source, 'multi-agent', 'case ' + i +
      ': source must NOT claim hybrid when L3 never spoke');
    assert.equal(d.forwardCodexVerdict, false, 'case ' + i);
    assert.equal(d.review_proof, null, 'case ' + i);
  });
});

// ── codex rollback mode ───────────────────────────────────────────────────────

test('codex mode stamps NO review_* fields at all (byte-exact legacy path)', () => {
  const d = decideReview(base({ mode: 'codex' }));
  assert.equal(d.review_verdict, null);
  assert.equal(d.review_source, null);
  assert.equal(d.review_proof, null);
  assert.equal(d.block, false);
  assert.equal(d.forwardCodexVerdict, true, 'codex mode forwards the codex verdict');
});

test('codex mode does not consult L1/L2 at all', () => {
  const d = decideReview(base({ mode: 'codex', l1: L1_FAIL, l2: null }));
  assert.equal(d.review_verdict, null);
  assert.equal(d.block, false);
});

// ── proof integration with the Task 1 oracle ──────────────────────────────────

test('the proof this oracle assembles satisfies the structural oracle', () => {
  const d = decideReview(base());
  assert.equal(isReviewProofStructurallyValid(d.review_proof), true,
    JSON.stringify(d.review_proof, null, 2));
});

test('hybrid proof also satisfies the structural oracle', () => {
  const d = decideReview(base({ mode: 'hybrid', l3: { invoked: true, verdict: 'converged' } }));
  assert.equal(isReviewProofStructurallyValid(d.review_proof), true);
});

test('end-to-end: a converged decision reads back as converged through the SSoT', () => {
  const d = decideReview(base());
  const eff = resolveEffectiveVerdict({
    converged: true,
    review_verdict: d.review_verdict,
    review_source: d.review_source,
    review_proof: d.review_proof,
  });
  assert.deepEqual(eff,
    { verdict: 'converged', source: 'multi-agent', axis: 'review', proofFailed: false });
});

test('a leaking evidence path makes the assembled proof fail the read-side oracle', () => {
  const d = decideReview(base({ dispatchEvidence: ['C:/Users/me/secret.json'] }));
  assert.equal(d.review_verdict, 'converged', 'decide itself does not check path format');
  const eff = resolveEffectiveVerdict({
    review_verdict: d.review_verdict,
    review_source: d.review_source,
    review_proof: d.review_proof,
  });
  assert.equal(eff.verdict, 'unavailable', 'but the read-side oracle downgrades it');
  assert.equal(eff.proofFailed, true);
});

// ── parseReviewMode (DD7) ─────────────────────────────────────────────────────

function captureWarns(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = function (c) { lines.push(String(c)); return true; };
  try { return { value: fn(), warns: lines.join('') }; } finally { process.stderr.write = orig; }
}

test('parseReviewMode: unset → multi-agent (the new default)', () => {
  assert.equal(parseReviewMode({}), DEFAULT_MODE);
  assert.equal(parseReviewMode(), DEFAULT_MODE);
  assert.equal(parseReviewMode({ MCCP_PLAN_REVIEW: '' }), DEFAULT_MODE);
});

test('parseReviewMode: each explicit mode parses, case/whitespace tolerant', () => {
  assert.equal(parseReviewMode({ MCCP_PLAN_REVIEW: 'codex' }), 'codex');
  assert.equal(parseReviewMode({ MCCP_PLAN_REVIEW: 'multi-agent' }), 'multi-agent');
  assert.equal(parseReviewMode({ MCCP_PLAN_REVIEW: 'hybrid' }), 'hybrid');
  assert.equal(parseReviewMode({ MCCP_PLAN_REVIEW: ' HYBRID ' }), 'hybrid');
});

test('parseReviewMode: DD7 — a typo falls back to codex WITH a loud warn', () => {
  ['cod-ex', 'multiagent', 'hybird', 'true', '1'].forEach(function (raw) {
    const r = captureWarns(function () {
      return parseReviewMode({ MCCP_PLAN_REVIEW: raw });
    });
    assert.equal(r.value, TYPO_MODE, raw);
    assert.match(r.warns, /unknown MCCP_PLAN_REVIEW/, raw);
  });
});

test('DD7 regression: a typo mode produces NO review_* fields (multi-agent never fires)', () => {
  const mode = parseReviewMode({ MCCP_PLAN_REVIEW: 'cod-ex' });
  const d = decideReview(base({ mode: mode }));
  assert.equal(d.review_verdict, null);
  assert.equal(d.review_source, null);
  assert.equal(d.review_proof, null);
});

// ── parseL3Enabled ────────────────────────────────────────────────────────────

test('parseL3Enabled: default off; explicit truthy values enable', () => {
  assert.equal(parseL3Enabled({}), false);
  assert.equal(parseL3Enabled({ MCCP_PLAN_REVIEW_L3: '0' }), false);
  assert.equal(parseL3Enabled({ MCCP_PLAN_REVIEW_L3: 'off' }), false);
  ['1', 'on', 'true', 'yes', 'YES'].forEach(function (v) {
    assert.equal(parseL3Enabled({ MCCP_PLAN_REVIEW_L3: v }), true, v);
  });
});
