'use strict';

// buildL3Record — turns one codex-invoke result into the L3 record decideReview
// reads. Pure; the caller owns I/O (the same division decide.js states at its
// head, for the same reason: the thing that decides must be testable without a
// filesystem or a network).
//
// WHY THIS MODULE EXISTS.
//
// The record used to be assembled by `printf` in commands/plan.md 5.2f from two
// shell variables. That is not a stylistic complaint. `printf
// '{"invoked":true,"verdict":"%s",...}' "$L3_VERDICT"` emits `"verdict":""` when
// the variable is empty, and empty is exactly what a shell variable is after a
// fenced-block boundary — which is where 5.2f read it from. decide.js:355 names
// this hazard in a comment and defends against it downstream, but an oracle must
// not emit a value its own enum forbids and then rely on the reader to catch it.
// Moving the assembly here means the forbidden value cannot be constructed.
//
// TWO WAYS TO SAY "NO VERDICT", AND ONLY ONE OF THEM IS HONEST (DD4).
//
//   {invoked:false, reason:'…'}            what we emit
//   {invoked:true, verdict:'unavailable'}  what we never emit
//
// Both fail closed at decide.js (its `ran` predicate rejects `unavailable` and
// `skipped` outright), so the difference is not safety — it is what the audit
// record CLAIMS. The second form asserts that Codex was asked, answered, and the
// answer was "unavailable". Codex has no such verdict in its vocabulary; the
// companion contract is `approve` | `needs-attention`. Writing it would put a
// sentence in the durable record that never happened, which is the same class of
// dishonesty as resolution.converged that this PRD exists to retire.
//
// So every non-answer folds to invoked:false and the REASON carries the detail.

const { REVIEW_VERDICT_VALUES } = require('../review-verdict');
const codexReviewPayload = require('../codex-review-payload');

// The files the `l3` subcommand writes, in WRITE ORDER. The order is a contract,
// not a listing — see ARTIFACT_ORDER_RATIONALE.
const L3_ARTIFACTS = Object.freeze([
  'codex-verdict', 'codex-class', 'l3-findings.json', 'l3.json',
]);

// Four tmp+rename writes are four atomic operations, not one. POSIX offers no
// way to make them a unit, so a crash partway through leaves a readable l3.json
// beside an absent peer.
//
// An earlier revision justified this by saying 5.6b would then read an empty
// codex-verdict and drop --codex-verdict from a receipt whose L3 spoke. That
// reader no longer exists on this path — the F1 absorption made 5.6b take the
// hybrid verdict out of l3.json (see bridgeArtifacts below). The rationale that
// survives is narrower and is about l3.json alone: it is the ONLY file 5.2f
// polls, so its presence has to mean "the run finished", and it can only mean
// that if it is written LAST. Writing it first would make the poll's success
// condition and the completeness condition two different facts.
const ARTIFACT_ORDER_RATIONALE =
  'l3.json is written last so that its presence implies the whole artifact set landed';

function nonEmptyString(v, fallback) {
  return (typeof v === 'string' && v.length > 0) ? v : fallback;
}

// buildL3Record({classification, exitCode, blocking, envelope, freeText,
//                runNonce, deriveVerdict}) →
//   { invoked, verdict?, reason, run_nonce }
//
//   deriveVerdict — injected for tests; defaults to the shared
//                   codex-review-payload oracle the PR and implement gates use.
//                   Not a policy seam: any substitute is still put through the
//                   enum check below.
//
// `verdict` is ABSENT, not null, on every invoked:false path. decide.js tests
// `typeof l3.verdict === 'string'`, so absence and null behave identically there
// — but a null-valued key reads as "we looked and found nothing", while absence
// reads as "this record has no such axis", and the second one is what happened.
function buildL3Record(opts) {
  const o = opts || {};
  const runNonce = nonEmptyString(o.runNonce, null);
  const cls = nonEmptyString(o.classification, 'unknown');

  const notInvoked = function (reason) {
    return { invoked: false, reason: reason, run_nonce: runNonce };
  };

  // Did the wrapper actually reach Codex and come back clean? All three
  // conditions, because any one of them alone has a hole: classification 'ok'
  // with blocking true is the advisory-mode fallback, and a non-zero exit beside
  // classification 'ok' would be a wrapper defect we must not read through.
  const reached = cls === 'ok' && o.blocking !== true && o.exitCode === 0;
  if (!reached) {
    // 'disabled' gets its own sentence: it is a policy decision, not a failure,
    // and an operator reading the receipt should not have to infer that from a
    // classification token.
    const detail = cls === 'disabled'
      ? 'classification=disabled — MCCP_CODEX_DISABLED=1, Codex was never invoked'
      : 'classification=' + cls +
        (o.blocking === true ? ' blocking=true' : '') +
        (o.exitCode !== 0 ? ' exit=' + String(o.exitCode) : '');
    return notInvoked(detail);
  }

  const derive = typeof o.deriveVerdict === 'function'
    ? o.deriveVerdict : codexReviewPayload.deriveGateVerdict;
  const g = derive({ envelope: o.envelope, freeText: o.freeText }) || {};
  const verdict = g.verdict;
  const source = nonEmptyString(g.source, 'unknown');

  // The payload oracle could not pin an opinion. Codex ran, but what came back
  // was not a review we can read — DD4's rule covers this exactly as it covers a
  // transport failure, so it folds the same way rather than sealing a verdict
  // Codex never uttered.
  if (source === 'unavailable' || verdict === 'unavailable') {
    return notInvoked('codex responded but the review payload was unreadable ' +
      '(verdict-source=' + source + ')');
  }

  // Enum membership. Load-bearing rather than defensive: this value goes into a
  // JSON file that decide.js seals into review_proof.layers.l3, and
  // REVIEW_VERDICT_VALUES is the vocabulary that field is validated against
  // (review-verdict.js). A verdict outside it would reach a receipt whose own
  // schema rejects it, and the failure would surface at write time as an opaque
  // error instead of here as a named one.
  if (typeof verdict !== 'string' || REVIEW_VERDICT_VALUES.indexOf(verdict) === -1) {
    return notInvoked('verdict ' + JSON.stringify(verdict) + ' is not a member of ' +
      'the review verdict vocabulary (' + REVIEW_VERDICT_VALUES.join('|') +
      '); folding to invoked:false rather than sealing a value the schema forbids');
  }

  return {
    invoked: true,
    verdict: verdict,
    reason: 'classification=ok verdict-source=' + source,
    run_nonce: runNonce,
  };
}

// The bare strings written to the two bridge artifacts. Derived from the SAME
// record, so the files and the record can never disagree about whether Codex
// spoke.
//
// NOBODY READS THESE ON THE HYBRID PATH — say so plainly rather than let a stale
// consumer claim justify them. 5.2z's own reader is `mode=codex`, which never runs
// this subcommand, and the F1 absorption pointed 5.6b's hybrid branch at the
// nonce-verified l3.json instead. They are still produced for two reasons:
//
//   1. DD5 kept the FILENAMES a shared contract with 5.2z. `mode=codex` depends on
//      those names, and a producer that emitted a different shape would make "which
//      producer wrote this" a question the directory can no longer answer.
//   2. They are the plain-text trace of the same record — one `cat` for an operator
//      who is looking at a review dir, with no JSON parse in the way.
//
// `codex-verdict` is empty when nothing was invoked, never a placeholder token: an
// empty read is honestly "no verdict", while a token would be indistinguishable
// from one Codex uttered if any future reader picked this file back up.
function bridgeArtifacts(record) {
  const r = record || {};
  return {
    'codex-verdict': (r.invoked === true && typeof r.verdict === 'string') ? r.verdict : '',
    'codex-class': nonEmptyString(r.reason, 'unknown'),
  };
}

// buildFindingsRecord({record, envelope, parse}) → the review BODY, persisted
// beside the verdict.
//
// Found by the M3 live run, which is the reason that task exists. The record this
// module's main export produces carries a verdict and a reason and nothing else,
// and `record.js#readL3` (:105-111) reads exactly those two — so a hybrid run that
// came back `divergent` told the operator that Codex objected and gave them no way
// to learn to what. Codex's actual findings were being parsed, mapped to one word,
// and dropped. 5.2f's prose meanwhile said the findings "reach the operator through
// 5.2h", which was simply not true of any code path.
//
// The verdict record stays lean on purpose — `decide` should not be handed a
// payload it might start reading — so the body goes to its own artifact instead.
function buildFindingsRecord(opts) {
  const o = opts || {};
  const rec = o.record || {};
  if (rec.invoked !== true) {
    return { invoked: false, reason: nonEmptyString(rec.reason, 'unknown') };
  }
  const parse = typeof o.parse === 'function'
    ? o.parse : codexReviewPayload.parseReviewPayload;
  const review = parse(o.envelope);
  if (!review) {
    // Unreachable from buildL3Record's own output (invoked:true implies the
    // payload parsed), but this function is exported and the honest answer to
    // "we could not re-read it" is to say so, not to emit an empty findings list
    // that reads as "Codex found nothing".
    return { invoked: true, verdict: rec.verdict || null, parsed: false,
      reason: 'the review payload did not parse on the second read' };
  }
  return {
    invoked: true,
    verdict: rec.verdict || null,
    raw_verdict: review.verdict,
    summary: review.summary,
    rounds: review.rounds,
    findings: review.findings,
  };
}

module.exports = {
  buildL3Record: buildL3Record,
  buildFindingsRecord: buildFindingsRecord,
  bridgeArtifacts: bridgeArtifacts,
  L3_ARTIFACTS: L3_ARTIFACTS,
  ARTIFACT_ORDER_RATIONALE: ARTIFACT_ORDER_RATIONALE,
};
