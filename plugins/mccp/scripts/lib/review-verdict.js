'use strict';

// review-verdict — diverse-agent-review M1. The single approval-read SSoT.
//
// v1.22.5 M1 established that approval must be read through ONE helper
// (receipt-convergence.js) so a divergent ship can never render as converged.
// M1 of this PRD widens that surface: an approval may now be issued by a
// multi-agent refute panel (L1 mechanical + L2 quorum) instead of Codex, so the
// question "was this approved?" can no longer be answered by reading a single
// codex_verdict field. This module answers it, and it is the ONLY place that
// knows the precedence.
//
// Precedence:
//   review_verdict (+ review_source + review_proof)  →  wins whenever present
//   codex_verdict                                    →  legacy fallback
//   neither                                          →  {verdict:null, source:null}
//
// DD11 (the load-bearing rule) — once ANY review_* field is present the review
// axis OWNS the decision and we NEVER fall back to codex_verdict. That fallback
// is precisely the hole DD11 closes: a partial stamp (say review_source lost,
// codex_verdict left behind) would otherwise resolve to source='codex' and
// satisfy cross-gate dedupe, letting a cycle skip the terminal PR-Codex review
// while no cross-model review ever happened. A partial stamp is therefore an
// `unavailable` (fail-closed), never a downgrade to the legacy field.
//
// DD5 (division of labour) — this oracle is PURE. It validates the *structure*
// of review_proof and the *format* of the paths and hashes inside it. It never
// touches the filesystem. Two things it deliberately cannot decide:
//   • whether dispatch_evidence paths EXIST      → cli.js `verify-proof` (fs)
//   • whether reviewed_plan_hash MATCHES the plan → decideReview + write.js
// Both callers fail closed on their axis, mirroring pr-ship-gate's
// `skipped-unproven` pattern: a converged verdict whose proof does not hold up
// is downgraded to `unavailable`, not silently trusted.

// Approval issuers. 'codex' is the legacy cross-model judge; 'multi-agent' is
// the L1+L2 panel; 'hybrid' is the panel with a Codex L3 layer on top.
const SOURCES = ['codex', 'multi-agent', 'hybrid'];

// Sources that constitute CROSS-MODEL corroboration. Cross-gate dedupe skips
// the terminal PR-Codex review only when the approval came from one of these —
// a multi-agent converged verdict is not evidence that Codex ever spoke (DD2).
const CROSS_MODEL_SOURCES = ['codex', 'hybrid'];

// Shared with receipt/schema.js CODEX_VERDICT_VALUES — review_verdict reuses the
// existing vocabulary rather than inventing a parallel one.
const REVIEW_VERDICT_VALUES = ['converged', 'divergent', 'critical', 'unavailable', 'skipped'];

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

// Minimum quorum size. A "quorum" of one is not a quorum — it is a single
// judge wearing the vocabulary of a panel, which is the failure this PRD
// exists to avoid.
const MIN_QUORUM_REQUIRED = 2;

function present(v) {
  return v !== null && v !== undefined;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonNegInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

// Path format is part of the structural invariant, not a cosmetic preference.
// Receipts can be promoted into the git-tracked ship corpus (CLAUDE.md §3.12),
// and an absolute path leaking into that corpus is exactly what forced the
// sanctioned `v1.22.4-cwd-rebind` re-seal. We refuse to repeat that on a new
// field. A repo-relative path also survives worktree moves, which an absolute
// one does not.
//
// Rejected: POSIX absolute (`/x`), UNC (`//host/share`, `\\host\share`), drive
// letters (`C:...`), ANY backslash (mixed separators normalize differently per
// platform, so we refuse them outright rather than guess — Security Reviewer
// S3), `..` traversal, `.` and empty segments (an un-normalized path), NUL.
// Note `%2e%2e` and friends are NOT decoded anywhere downstream, so they are
// ordinary filename characters here, not traversal.
function isRepoRelativeEvidencePath(p) {
  if (typeof p !== 'string') return false;
  if (p.length === 0) return false;
  if (p !== p.trim()) return false;
  if (p.indexOf('\0') !== -1) return false;
  if (p.indexOf('\\') !== -1) return false;
  if (p.charAt(0) === '/') return false;
  if (/^[A-Za-z]:/.test(p)) return false;

  const segments = p.split('/');
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '' || seg === '.' || seg === '..') return false;
  }
  return true;
}

// isReviewProofStructurallyValid(proof) → boolean
//
// The proof is controller-authored, so this check is not a forgery defence —
// M1 openly defers per-perspective content binding to M2. What it IS: a
// guarantee that a `converged` verdict cannot be issued alongside a proof that
// contradicts it (quorum that did not pass, fewer perspectives than claimed,
// one role answering four times, a verification layer that failed, evidence
// paths that would leak, or a plan-hash binding that is malformed).
function isReviewProofStructurallyValid(proof) {
  if (!isPlainObject(proof)) return false;

  // Layer results — L1 is the gatekeeper (DD3), so a converged proof requires
  // it to have converged. l2 must agree; l3 is optional (multi-agent mode never
  // runs it) but when present must not be a failure.
  const layers = proof.layers;
  if (!isPlainObject(layers)) return false;
  if (layers.l1 !== 'converged') return false;
  if (layers.l2 !== 'converged') return false;
  if (present(layers.l3) && layers.l3 !== 'converged') return false;

  if (proof.verification_verdict !== 'converged') return false;

  // Quorum self-consistency. Four numbers, three axes:
  //   required  M — the threshold ("how many answers do we demand")
  //   of        N — the panel that was fielded
  //   responded   — how many of them actually answered usably (the OBSERVATION)
  //   roles     K — how many DISTINCT lenses those answers came from
  const q = proof.quorum;
  if (!isPlainObject(q)) return false;
  if (q.passed !== true) return false;
  if (!isNonNegInt(q.required) || !isNonNegInt(q.of) || !isNonNegInt(q.roles)) return false;
  if (!isNonNegInt(q.responded)) return false;
  if (q.required < MIN_QUORUM_REQUIRED) return false;
  if (q.of < q.required) return false;
  if (q.roles < 1) return false;
  // The observation must sit inside the panel and clear the threshold. Anything
  // else is a proof describing a run that could not have happened.
  if (q.responded < q.required) return false;
  if (q.responded > q.of) return false;
  if (q.roles > q.responded) return false;

  // Perspectives must account for exactly the answers the quorum OBSERVED — not
  // for the panel that was fielded. Binding to `of` instead was a defect: it
  // made the documented default `3of4` unsatisfiable, because a run where one
  // reviewer failed to answer passed the quorum and then produced a proof this
  // function rejected, silently downgrading a legitimate approval to
  // `unavailable`. M-of-N with M < N has to be expressible.
  //
  // No role may answer twice — that is how K gets satisfied without real
  // diversity, and it is the one thing counting alone cannot catch.
  const perspectives = proof.perspectives;
  if (!Array.isArray(perspectives)) return false;
  if (perspectives.length !== q.responded) return false;

  const seenRoles = Object.create(null);
  for (let i = 0; i < perspectives.length; i++) {
    const p = perspectives[i];
    if (!isPlainObject(p)) return false;
    const role = p.perspective;
    if (typeof role !== 'string' || role.length === 0) return false;
    if (seenRoles[role]) return false;
    seenRoles[role] = true;
  }
  // EXACT, not a floor. santa-loop R3 (Codex GPT-5.4): `>= q.roles` let a proof
  // with four distinct perspectives seal `roles: 1`. quorum.roles is an OBSERVATION
  // — decideReview writes what it counted — so any value other than the count is a
  // proof misstating its own evidence. Under-reporting is harmless to the approval
  // decision (it never over-claims diversity), which is exactly why a floor looked
  // sufficient; but the proof is the durable audit record, and a record permitted
  // to disagree with itself is not evidence. This repo has now had to fix the
  // threshold-in-an-observation-slot confusion twice (the earlier one wrote
  // rolesMin into this same field).
  if (Object.keys(seenRoles).length !== q.roles) return false;

  // Evidence — non-empty array of repo-relative paths. Existence is the
  // caller's axis (verify-proof); format is ours.
  const evidence = proof.dispatch_evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) return false;
  for (let i = 0; i < evidence.length; i++) {
    if (!isRepoRelativeEvidencePath(evidence[i])) return false;
  }

  // DD13 — the proof must name the plan version L2 actually read. Only the
  // FORMAT is checkable here; equality against the plan on disk belongs to
  // decideReview and write.js (both fail closed on mismatch).
  if (typeof proof.reviewed_plan_hash !== 'string') return false;
  if (!SHA256_RE.test(proof.reviewed_plan_hash)) return false;

  return true;
}

// resolveEffectiveVerdict(resolution) → { verdict, source, axis, proofFailed }
//   verdict     : the effective approval verdict (null when neither axis present)
//   source      : 'codex' | 'multi-agent' | 'hybrid' | null
//   axis        : 'review' | 'codex' | 'none' — WHICH field answered. Consumers
//                 need this to know whether the legacy resolution.converged flag
//                 is still meaningful: on the review axis the verdict IS the
//                 answer, while on the codex axis the historical flag still
//                 carries the approval and must keep its exact old behaviour.
//                 `source` alone cannot express this, because a partial stamp
//                 yields source=null while still being firmly on the review axis.
//   proofFailed : true when a review-axis approval was downgraded because the
//                 triple was incomplete, the source/verdict was not a known
//                 value, or the proof did not hold structurally
//
// Downgrades always land on 'unavailable' rather than 'divergent': "we could
// not certify this" is a different fact from "a reviewer found a defect", and
// collapsing them would make audit trails lie about what happened.
function resolveEffectiveVerdict(resolution) {
  if (!isPlainObject(resolution)) {
    return { verdict: null, source: null, axis: 'none', proofFailed: false };
  }

  const rv = resolution.review_verdict;
  const rs = resolution.review_source;
  const rp = resolution.review_proof;

  if (present(rv) || present(rs) || present(rp)) {
    // DD11 — review axis owns it from here. No codex_verdict fallback.
    const sourceValid = typeof rs === 'string' && SOURCES.indexOf(rs) !== -1;
    const complete = present(rv) && present(rs) && present(rp);

    if (!complete || !sourceValid) {
      return {
        verdict: 'unavailable', source: sourceValid ? rs : null,
        axis: 'review', proofFailed: true,
      };
    }
    if (typeof rv !== 'string' || REVIEW_VERDICT_VALUES.indexOf(rv) === -1) {
      return { verdict: 'unavailable', source: rs, axis: 'review', proofFailed: true };
    }
    if (rv === 'converged' && !isReviewProofStructurallyValid(rp)) {
      return { verdict: 'unavailable', source: rs, axis: 'review', proofFailed: true };
    }
    return { verdict: rv, source: rs, axis: 'review', proofFailed: false };
  }

  const cv = resolution.codex_verdict;
  if (present(cv)) {
    return { verdict: cv, source: 'codex', axis: 'codex', proofFailed: false };
  }
  return { verdict: null, source: null, axis: 'none', proofFailed: false };
}

// isCrossModelCorroborated(resolution) → boolean
// The DD2 predicate in one place: an approval that both converged AND came from
// a cross-model issuer. Cross-gate dedupe is its only intended consumer, but it
// lives here so the source vocabulary never gets re-derived at a call site.
function isCrossModelCorroborated(resolution) {
  const eff = resolveEffectiveVerdict(resolution);
  if (eff.verdict !== 'converged') return false;
  if (CROSS_MODEL_SOURCES.indexOf(eff.source) === -1) return false;

  // santa-loop R5 (Codex GPT-5.4) — `hybrid` must SHOW its L3 layer, not just
  // claim it.
  //
  // decideReview cannot emit hybrid without a real L3 verdict (decide.js:237
  // downgrades a requested-but-not-run hybrid to source 'multi-agent'), so the
  // producer was never the problem. But this predicate reads RECEIPTS, and a
  // receipt is a durable artifact that outlives the process that wrote it —
  // anything not produced by that exact oracle (a future writer, a hand-repaired
  // file, a partially migrated corpus) could assert `source: 'hybrid'` beside a
  // proof whose `layers.l3` is null and be counted as cross-model corroboration.
  //
  // That is not a cosmetic gap: this predicate is the DD2 gate. Reading it as
  // corroborated makes cross-gate dedupe skip PR-Codex, which is exactly the
  // "cross-model is moved to ship, not removed" guarantee the milestone rests on.
  // A same-model panel would have been stamped as cross-model and the terminal
  // check it was supposed to defer to would never run.
  if (eff.source === 'hybrid') {
    const proof = resolution && resolution.review_proof;
    const l3 = isPlainObject(proof) && isPlainObject(proof.layers) ? proof.layers.l3 : null;
    // Only a CONVERGED L3 corroborates. A dissenting L3 is a real cross-model
    // opinion, but it is not an approval, and eff.verdict already rejects it.
    if (l3 !== 'converged') return false;
  }
  return true;
}

module.exports = {
  resolveEffectiveVerdict: resolveEffectiveVerdict,
  isReviewProofStructurallyValid: isReviewProofStructurallyValid,
  isRepoRelativeEvidencePath: isRepoRelativeEvidencePath,
  isCrossModelCorroborated: isCrossModelCorroborated,
  SOURCES: SOURCES,
  CROSS_MODEL_SOURCES: CROSS_MODEL_SOURCES,
  REVIEW_VERDICT_VALUES: REVIEW_VERDICT_VALUES,
  MIN_QUORUM_REQUIRED: MIN_QUORUM_REQUIRED,
};
