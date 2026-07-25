'use strict';

// pr-ship-gate — integrity-unification M3. The single pure oracle that decides
// whether a terminal /mccp:pr may ship, given the mccp-pr-codex receipt's real
// Codex verdict.
//
// Why one oracle: the enforcement is defense-in-depth across TWO loci —
//   1. finalize-receipt.js (runtime primary; write path itself, cannot be skipped)
//   2. validate-cmd.js --check-ship-verdict (canonical/external audit surface)
// Both call deriveShipDecision so the partition can NEVER drift (mirrors M1's
// receipt-convergence.js single-helper philosophy).
//
// DD1 verdict partition (resolution.codex_verdict is authoritative — the
// resolution.converged flag is retired per M1):
//   converged    → SHIP    (Codex approved)
//   skipped      → SHIP    (dedupe happy-path / MCCP_CODEX_DISABLED env policy /
//                           MCCP_PR_SKIP_CODEX_REVIEW audited escape — all three
//                           are constructively already-approved ship states)
//   divergent    → NO-SHIP (Codex "No ship" / needs-attention)
//   critical     → NO-SHIP (divergent's higher severity)
//   unavailable  → NO-SHIP (invoked but verdict unreadable — fail-closed, cannot certify)
//   absent       → NO-SHIP (fresh receipt with no verdict = finalize defect — fail-closed;
//                           DD5: the self-gate only judges the just-written receipt, so the
//                           historical-absent exception is satisfied by locus, never here)
//   any unknown  → NO-SHIP (fail-closed default — schema rejects unknown enum values at
//                           write time, but the oracle stays fail-closed for external audit)
//
// The correct no-ship set is {divergent, critical, unavailable, absent}, NOT the
// whole complement of 'converged' — mapping "!== converged → block" would wrongly
// freeze the sanctioned `skipped` ship states (DD1 대안 기각).
//
// DD3 audited override: opts.forceOverrideActive=true flips ship→true but NEVER
// rewrites blockingVerdict — the receipt keeps sealing the real (divergent) verdict
// so cross-gate dedupe stays fail-closed and the §3.12 sealing invariant holds. The
// override unblocks THIS invocation's mechanical HALT only; it does not launder the
// verdict into 'converged'.

const { isDivergentVerdict } = require('./receipt-convergence');

// Distinct exit code for a ship-blocked finalize (aligned with codex-invoke's
// blocking exit 12). pr.md branches on it to emit a ship-specific GATE-STOP.
const EX_SHIP_BLOCKED = 12;

// Verdicts that constructively authorize a ship. Anything else is fail-closed.
const SHIP_VERDICTS = ['converged', 'skipped'];

// classifyVerdict(resolution) → { ship, absent, verdict }
//   ship    : true iff codex_verdict ∈ SHIP_VERDICTS
//   absent  : true iff codex_verdict is missing/null
//   verdict : the raw codex_verdict string (null when absent)
// Reuses the M1 isDivergentVerdict helper for the divergent/critical branch so the
// convergence vocabulary lives in ONE place; unavailable + unknown fall through to
// the positive-membership test, which is fail-closed by construction.
function classifyVerdict(resolution) {
  const cv = (resolution && typeof resolution === 'object')
    ? resolution.codex_verdict : undefined;
  const absent = cv === undefined || cv === null;
  if (absent) return { ship: false, absent: true, verdict: null };
  if (isDivergentVerdict(resolution)) return { ship: false, absent: false, verdict: cv };
  return { ship: SHIP_VERDICTS.indexOf(cv) !== -1, absent: false, verdict: cv };
}

// deriveShipDecision(receipt, opts) → {
//   ship,            // boolean — may this invocation ship (rawShip OR override)
//   blockingVerdict, // the verdict that WOULD block, PRESERVED even under override
//                    //   (null when the raw decision already ships); 'absent' when
//                    //   the verdict field is missing
//   absent,          // boolean — codex_verdict missing on the receipt
//   overrideActive,  // boolean — audited override in effect
//   reason,          // short human-readable explanation of the decision
// }
//
// opts.forceOverrideActive — computed by the caller: finalize reads it from
//   receipt.meta.pr_codex_force_override; validate-cmd from that meta field OR a
//   strict-validated MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE env var.
function deriveShipDecision(receipt, opts) {
  opts = opts || {};
  const overrideActive = opts.forceOverrideActive === true;
  const resolution = (receipt && typeof receipt === 'object') ? receipt.resolution : null;
  const cls = classifyVerdict(resolution);

  const rawShip = cls.ship;
  const ship = rawShip || overrideActive;
  const blockingVerdict = rawShip ? null : (cls.absent ? 'absent' : cls.verdict);

  let reason;
  if (rawShip) {
    reason = 'codex_verdict=' + cls.verdict + ' authorizes ship';
  } else if (overrideActive) {
    reason = 'PR-Codex non-approving (verdict=' + blockingVerdict +
      ') — shipped under audited override (verdict sealed unchanged)';
  } else {
    reason = 'PR-Codex non-approving (verdict=' + blockingVerdict + ') — push blocked';
  }

  return {
    ship: ship,
    blockingVerdict: blockingVerdict,
    absent: cls.absent,
    overrideActive: overrideActive,
    reason: reason,
  };
}

module.exports = {
  deriveShipDecision: deriveShipDecision,
  classifyVerdict: classifyVerdict,
  EX_SHIP_BLOCKED: EX_SHIP_BLOCKED,
  SHIP_VERDICTS: SHIP_VERDICTS,
};
