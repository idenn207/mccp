'use strict';

// decideReview — the three-layer composition oracle. Pure; the caller owns I/O.
//
// This is the ONLY place that turns (mode, L1, L2, L3) into an approval, and the
// only place that assembles review_proof. The command body must not hand-roll
// either: a shell that parses the mode and the L3 result separately and ANDs
// them is the exact shape that produced the v1.22.3 M3 round-4 defect, where a
// default in an unreached branch committed a wrong value.
//
// The composition table is exhaustive and the test suite walks every row:
//
//   mode      | L1           | L2                    | L3          | verdict     | source      | fwd
//   ----------|--------------|-----------------------|-------------|-------------|-------------|-----
//   any       | inconclusive | (not consulted)       | (n/c)       | unavailable | multi-agent | no
//   any       | divergent    | (not consulted)       | (n/c)       | divergent   | multi-agent | no
//   any       | pass         | hash mismatch         | (any)       | unavailable | multi-agent | no
//   any       | pass         | quorum not met        | (n/c)       | divergent   | multi-agent | no
//   any       | pass         | missing/unreadable    | (n/c)       | unavailable | multi-agent | no
//   multi     | pass         | pass                  | not fired   | converged   | multi-agent | no
//   hybrid    | pass         | pass                  | converged   | converged   | hybrid      | YES
//   hybrid    | pass         | pass                  | divergent/critical | (L3)  | hybrid      | YES
//   hybrid    | pass         | pass                  | did not run | unavailable | multi-agent | no
//
// The last row is the one that is easy to get wrong. "I asked for hybrid" is not
// "hybrid happened". Stamping source='hybrid' when L3 never ran would let
// cross-gate dedupe read cross-model corroboration that does not exist (DD2), so
// the verdict fails closed and the source honestly says multi-agent.
//
// One row is conditional on the single-pass toggle (review-loop-bypass M1):
//
//   any/hybrid| pass         | quorum not met        | (see below) | divergent   | as-is       | no
//
// with `singlePass.active` the quorum-not-met row returns block:false instead of
// block:true. Nothing else moves — the verdict stays divergent, the proof says
// the panel dissented, and every other row is unreachable from the relaxation.
// In hybrid mode the row additionally requires L3 to have run and converged.
//
// Two distinctions the oracle is careful about:
//   divergent    = we looked and found a defect
//   unavailable  = we could not certify (could not look, or the evidence does
//                  not bind to what we sealed)
// Collapsing them would make the audit trail claim a review found problems when
// in fact no review completed.

const { SOURCES, REVIEW_VERDICT_VALUES } = require('../review-verdict');
const { isUsableResult } = require('./quorum');

const MODES = Object.freeze(['codex', 'multi-agent', 'hybrid']);
const ENV_MODE = 'MCCP_PLAN_REVIEW';
const ENV_L3 = 'MCCP_PLAN_REVIEW_L3';

// DD7 — deliberately the OPPOSITE fallback direction from
// parseMergedVerifyMode, which sends unknown values to its strictest new mode.
// The failure mode here is different: a typo would silently change WHO ISSUES
// APPROVAL, so the safe landing is the already-verified legacy path, not the
// strictest new one. Unset means the operator has not opted out, so it gets the
// new default; a typo means we cannot tell what they wanted, so it gets codex.
const DEFAULT_MODE = 'multi-agent';
const TYPO_MODE = 'codex';

function warn(msg) {
  process.stderr.write('[mccp:plan-review] ' + msg + '\n');
}

function parseReviewMode(env) {
  const raw = env && env[ENV_MODE];
  if (raw === undefined || raw === null || raw === '') return DEFAULT_MODE;
  const v = String(raw).trim().toLowerCase();
  if (MODES.indexOf(v) !== -1) return v;
  warn('unknown ' + ENV_MODE + '="' + raw + '" — falling back to "' + TYPO_MODE +
    '" (the already-verified path; an unreadable mode must not silently change ' +
    'who issues approval)');
  return TYPO_MODE;
}

// parseL3Enabled(env) → boolean. Default off. Separate axis from mode so Codex
// quota exhaustion can disable L3 without touching the mode.
function parseL3Enabled(env) {
  const raw = env && env[ENV_L3];
  if (raw === undefined || raw === null || raw === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'on' || v === 'true' || v === 'yes';
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function mk(verdict, source, proof, reason, forwardCodexVerdict) {
  return {
    review_verdict: verdict,
    review_source: source,
    review_proof: proof,
    block: verdict !== 'converged',
    reason: reason,
    forwardCodexVerdict: forwardCodexVerdict === true,
  };
}

// The single-pass sibling of mk(). It differs in exactly two fields:
//
//   block               — a literal false, not a computation
//   forwardCodexVerdict — always false
//
// The literal is the point. mk() hardcodes `block: verdict !== 'converged'`
// (decide.js:86), so calling it can never yield block:false for a divergent
// verdict; a milestone that relaxes the panel has to say so in its own
// constructor rather than loosening the one every other path shares.
//
// The second field is load-bearing: source='multi-agent' shipped together with a
// codex_verdict makes write.js:492-501 throw on a contradictory receipt. 5.6b
// only appends --codex-verdict when decision.forwardCodexVerdict is true, so
// pinning it false here is the reason that throw is unreachable from this path.
//
// `single_pass_reason` is present-only: mk() does NOT gain a null-valued twin.
// A field that exists on every decision signals nothing by existing, and 5.6b
// keys the receipt's audit flags off exactly that presence — giving mk() the key
// would stamp bypassed_verdict=true on receipts that never bypassed anything,
// which Task 6's invariant then rejects.
function mkSinglePass(verdict, source, proof, reason, singlePassReason) {
  return {
    review_verdict: verdict,
    review_source: source,
    review_proof: proof,
    block: false,
    reason: reason,
    forwardCodexVerdict: false,
    single_pass_reason: singlePassReason,
  };
}

// A result with no review axis at all — the `codex` rollback mode. Nothing about
// L1/L2 is stamped, which is what makes MCCP_PLAN_REVIEW=codex a byte-exact
// restoration of the pre-M1 gate rather than "the new gate with fields blanked".
function noReviewAxis(reason) {
  return {
    review_verdict: null,
    review_source: null,
    review_proof: null,
    block: false,
    reason: reason,
    forwardCodexVerdict: true,
  };
}

// The proof is an EVIDENCE record, so every field here is an observation, never
// a threshold. `roles` used to carry `rolesMin` (the configured K) while
// `responded` beside it carried the real count — so a run where four distinct
// lenses answered under ROLES_MIN=2 sealed a proof claiming two. A record that
// understates its own evidence is the same class of dishonesty as
// resolution.converged, which this PRD exists to retire. The thresholds live in
// `required`/`of` where they belong; `roles`/`responded` report what happened.
function buildProof(opts) {
  return {
    layers: {
      l1: 'converged',
      l2: 'converged',
      l3: opts.l3Verdict || null,
    },
    verification_verdict: 'converged',
    quorum: {
      passed: true,
      required: opts.quorum.required,
      of: opts.quorum.of,
      roles: opts.quorum.roles,
      responded: opts.quorum.responded,
    },
    perspectives: opts.perspectives,
    dispatch_evidence: opts.dispatchEvidence,
    reviewed_plan_hash: opts.reviewedPlanHash,
  };
}

// The audit proof for a single-pass relaxation. buildProof() is the APPROVAL
// record and stays untouched; this one records a review that dissented and was
// proceeded past anyway, so every field says so honestly — layers.l2 divergent,
// verification_verdict divergent, quorum.passed false.
//
// `opts.l3` is 'converged' on the hybrid relaxation and null otherwise. Dropping
// it would put Task 6's hybrid reverse-invariant and Task 7's forged-hybrid
// tests permanently out of reach of any production artifact, and there would be
// no way to check after the fact whether DD2's L3 precondition was met.
//
// schema.js:224-238 asks a non-converged verdict's proof only for the path shape
// of dispatch_evidence, which is why quorum.passed:false can be stated plainly.
// The proof is not decoration: without it the review triple is a partial stamp,
// and write.js:458-469 plus plan.md 5.6b refuse to write the receipt at all —
// so it is the precondition of UI8 ("the receipt gets written").
function buildAuditProof(opts) {
  return {
    layers: {
      l1: 'converged',
      l2: 'divergent',
      l3: opts.l3 || null,
    },
    verification_verdict: 'divergent',
    quorum: {
      passed: false,
      required: opts.quorum.required,
      of: opts.quorum.of,
      roles: opts.quorum.roles,
      responded: opts.quorum.responded,
    },
    perspectives: opts.perspectives,
    dispatch_evidence: opts.dispatchEvidence,
    reviewed_plan_hash: opts.reviewedPlanHash,
  };
}

// Did L3 actually run and converge? Only consulted on the hybrid relaxation.
//
// The hybrid block below (`mode === 'hybrid'`) runs only on the quorum.passed
// === true path, so a relaxation placed in the quorum-failure branch would never
// reach its guard. Without this predicate, mode='hybrid' + L1 pass + quorum fail
// + L3 never fired would relax to block:false — and this code would then violate
// DD2's own table row that forbids exactly that ("requested" is not "happened",
// the rule decide.js already applies at :238).
function l3Corroborated(o) {
  const l3 = isPlainObject(o.l3) ? o.l3 : null;
  return !!l3 && l3.invoked === true &&
    typeof l3.verdict === 'string' &&
    REVIEW_VERDICT_VALUES.indexOf(l3.verdict) !== -1 &&
    l3.verdict === 'converged';
}

// decideReview({mode, l1, l2, l3, dispatchEvidence, reviewedPlanHash,
//               currentPlanHash, rounds, singlePass})
//
//   singlePass : { active: boolean, reason: <enum> } | null
//                Supplied by the caller (parseSinglePass); this oracle never
//                reads env. Only the quorum-failure return honours it.
//
//   l1 : { verdict: 'converged'|'divergent'|'inconclusive', violations: [...] }
//   l2 : { quorum: <decideQuorum result>, results: [<reviewer results>] } | null
//   l3 : { invoked: boolean, verdict: <codex verdict>, reason: string } | null
function decideReview(opts) {
  const o = opts || {};
  const mode = MODES.indexOf(o.mode) !== -1 ? o.mode : DEFAULT_MODE;

  if (mode === 'codex') {
    return noReviewAxis('MCCP_PLAN_REVIEW=codex — legacy Codex gate owns this ' +
      'approval; no review_* fields are stamped');
  }

  // ── L1 gatekeeper (DD3) ─────────────────────────────────────────────────────
  const l1 = isPlainObject(o.l1) ? o.l1 : null;
  if (!l1 || l1.verdict === 'inconclusive') {
    return mk('unavailable', 'multi-agent', null,
      'L1 could not be evaluated' +
      (l1 && Array.isArray(l1.violations) && l1.violations.length
        ? ': ' + l1.violations[0].code + ' — ' + l1.violations[0].detail
        : ' (no L1 result supplied)'),
      false);
  }
  if (l1.verdict !== 'converged') {
    const first = Array.isArray(l1.violations) && l1.violations.length
      ? l1.violations[0] : null;
    return mk('divergent', 'multi-agent', null,
      'L1 found ' + (Array.isArray(l1.violations) ? l1.violations.length : '?') +
      ' violation(s)' + (first ? ': ' + first.code + ' — ' + first.detail : '') +
      '. L2 was not fired.',
      false);
  }

  // ── L2 availability ─────────────────────────────────────────────────────────
  const l2 = isPlainObject(o.l2) ? o.l2 : null;
  const quorum = l2 && isPlainObject(l2.quorum) ? l2.quorum : null;
  if (!quorum) {
    return mk('unavailable', 'multi-agent', null,
      'L2 produced no readable result (workflow unavailable, threw, or the ' +
      'artifact is missing/unparseable) — the gate cannot certify what it did ' +
      'not observe',
      false);
  }
  if (quorum.responded === 0) {
    return mk('unavailable', 'multi-agent', null,
      'L2 fired but no reviewer responded usably' +
      (quorum.malformed ? ' (' + quorum.malformed + ' malformed)' : ''),
      false);
  }

  // ── DD13 bind: the proof must describe the plan we are about to seal ────────
  // Checked BEFORE the quorum verdict is honoured. A panel that reviewed another
  // version has not reviewed this one, whatever it concluded.
  const reviewedHash = o.reviewedPlanHash;
  const currentHash = o.currentPlanHash;
  if (typeof reviewedHash !== 'string' || reviewedHash.length === 0) {
    return mk('unavailable', 'multi-agent', null,
      'L2 result carries no reviewed_plan_hash — the review cannot be bound to a ' +
      'plan version (DD13)',
      false);
  }
  if (typeof currentHash === 'string' && currentHash.length > 0 &&
      currentHash !== reviewedHash) {
    return mk('unavailable', 'multi-agent', null,
      'plan changed after L2 read it: reviewed ' + reviewedHash.slice(0, 19) +
      '… but current is ' + currentHash.slice(0, 19) + '… — recovery is to rerun ' +
      'L2 against the current plan, NOT to reseal (DD13)',
      false);
  }

  // ── Proof assembly (only reachable once L1 holds and L2 is readable) ────────
  // Filtered by the SAME predicate decideQuorum counted with. A looser filter
  // here (any object carrying a `perspective` string) admitted results the
  // quorum had rejected as malformed, so perspectives.length could exceed
  // `responded` and the sealed proof failed its own self-consistency check.
  //
  // Hoisted above the quorum verdict (it used to sit below) so the single-pass
  // branch can build its audit proof from the same values. Pure computation, so
  // the approval paths are byte-identical. The hoist destination is exactly one
  // place — here, directly above the quorum check. The L1 branch (:150-167) and
  // the DD13 bind (:191-204) both still precede it, so UI7 holds regardless of
  // this move; hoisting any higher would compute over inputs L1 already rejected
  // and would blur the rule that everything above the relaxation is inviolable.
  const perspectives = (Array.isArray(l2.results) ? l2.results : [])
    .filter(isUsableResult)
    .map(function (r) { return { perspective: r.perspective, verdict: r.verdict }; });

  const dispatchEvidence = Array.isArray(o.dispatchEvidence) ? o.dispatchEvidence : [];

  if (quorum.passed !== true) {
    // Reaching this line already means: L1 converged, the quorum was readable,
    // responded > 0, and the reviewed hash binds to the current plan. Budget
    // skips and missing artifacts never get here — cli.js:435 returns
    // `unavailable` for them earlier. That ordering is what makes the relaxation
    // safe to place here and nowhere else (DD2).
    const spRaw = isPlainObject(o.singlePass) && o.singlePass.active === true
      ? o.singlePass : null;
    // In hybrid mode a converged L3 is an ADDITIONAL precondition of relaxing.
    const sp = (spRaw && (mode !== 'hybrid' || l3Corroborated(o))) ? spRaw : null;
    if (sp) {
      // Seal the fact that L3 corroborated, when it did. Flattening source to
      // multi-agent and layers.l3 to null would make Task 6's hybrid reverse
      // invariant unreachable from any real artifact. Dedupe stays shut anyway:
      // isCrossModelCorroborated demands verdict === 'converged' first, and this
      // receipt is divergent.
      const spSource = (mode === 'hybrid') ? 'hybrid' : 'multi-agent';
      const spL3 = (mode === 'hybrid') ? 'converged' : null;
      return mkSinglePass('divergent', spSource,
        buildAuditProof({
          quorum: quorum, perspectives: perspectives,
          dispatchEvidence: dispatchEvidence, reviewedPlanHash: reviewedHash,
          l3: spL3,
        }),
        'L2 quorum not satisfied: ' + (quorum.reason || 'unspecified') +
        ' — MCCP_REVIEW_SINGLE_PASS=' + sp.reason + ' 로 진행한다. ' +
        'verdict는 divergent 그대로 봉인된다.',
        sp.reason);
    }
    return mk('divergent', 'multi-agent', null,
      'L2 quorum not satisfied: ' + (quorum.reason || 'unspecified'),
      false);
  }

  // ── L3 (hybrid only) ────────────────────────────────────────────────────────
  if (mode === 'hybrid') {
    // `ran` means Codex actually produced an opinion we can seal. Membership in
    // the verdict vocabulary is part of that: the caller writes this JSON with
    // printf from a shell variable, so an unset variable yields verdict:"" —
    // which an "is a string and not unavailable/skipped" test happily accepts,
    // and mk() would then seal layers.l3:"". Downstream fails closed on it, but
    // an oracle must not emit a value its own enum forbids.
    const l3 = isPlainObject(o.l3) ? o.l3 : null;
    const ran = !!l3 && l3.invoked === true &&
      typeof l3.verdict === 'string' &&
      REVIEW_VERDICT_VALUES.indexOf(l3.verdict) !== -1 &&
      l3.verdict !== 'unavailable' && l3.verdict !== 'skipped';

    if (!ran) {
      // Requested hybrid, got multi-agent. Say so, and do NOT forward a codex
      // verdict — there is no Codex opinion to forward.
      return mk('unavailable', 'multi-agent', null,
        'hybrid mode requested but L3 did not run' +
        (l3 && l3.reason ? ' (' + l3.reason + ')' : '') +
        ' — "requested" is not "happened"; source stays multi-agent and the ' +
        'gate fails closed (DD2)',
        false);
    }

    const proof = buildProof({
      quorum: quorum,
      perspectives: perspectives,
      dispatchEvidence: dispatchEvidence,
      reviewedPlanHash: reviewedHash,
      l3Verdict: l3.verdict,
    });

    if (l3.verdict !== 'converged') {
      // L3 dissents. Its verdict stands as-is: the panel passing does not
      // overrule the cross-model layer.
      return mk(l3.verdict, 'hybrid', proof,
        'L1+L2 converged but L3 (Codex) returned ' + l3.verdict, true);
    }
    return mk('converged', 'hybrid', proof,
      'L1 + L2 quorum (' + quorum.responded + '/' + quorum.required + ', ' +
      quorum.roles + ' roles) + L3 Codex all converged', true);
  }

  // ── multi-agent ─────────────────────────────────────────────────────────────
  const proof = buildProof({
    quorum: quorum,
    perspectives: perspectives,
    dispatchEvidence: dispatchEvidence,
    reviewedPlanHash: reviewedHash,
    l3Verdict: null,
  });
  return mk('converged', 'multi-agent', proof,
    'L1 + L2 quorum satisfied (' + quorum.responded + '/' + quorum.required +
    ' responses, ' + quorum.roles + ' distinct roles); L3 not fired', false);
}

module.exports = {
  decideReview: decideReview,
  buildAuditProof: buildAuditProof,
  parseReviewMode: parseReviewMode,
  parseL3Enabled: parseL3Enabled,
  MODES: MODES,
  DEFAULT_MODE: DEFAULT_MODE,
  TYPO_MODE: TYPO_MODE,
  ENV_MODE: ENV_MODE,
  ENV_L3: ENV_L3,
  SOURCES: SOURCES,
};
