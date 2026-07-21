'use strict';

// codex-review-payload — the SINGLE structured reader for a Codex
// adversarial-review response. Shared by all three gates (plan / implement / pr)
// so they can never drift into disagreeing about what Codex actually concluded.
//
// WHY THIS MODULE EXISTS (v1.22.3 M3 follow-up, F5 — found live in this cycle).
//
// M3 fixed the PR gate's verdict blindness but left plan/implement deriving
// $CODEX_VERDICT through codex-bridge.parseVerdict, which is a FREE-TEXT keyword
// scan: it has no `needs-attention` in its vocabulary and its `/\bconverged\b/i`
// rule matches the word anywhere in the prose. Measured on this very cycle's
// Plan-Codex R1 (verdict='needs-attention', summary='No ship: …', 4 findings),
// parseVerdict returned **'converged'** — it matched the word inside a Codex
// finding that was *warning* that stamping `converged` would be an integrity bug.
//
// That is not cosmetic. plan/implement receipts' resolution.codex_verdict is the
// input to cross-gate dedupe (receipt/dedupe.js keys on === 'converged'), so two
// false 'converged' stamps make /mccp:pr skip PR-Codex entirely — dual review
// silently bypassed. v1.20.3 closed the always-true `resolution.converged` hole
// to establish exactly that fail-closed contract; a free-text scan walks around it.
//
// PRECEDENCE (the contract every caller gets):
//   1. STRUCTURED  — `.result.verdict` from the companion envelope's `.stdout`.
//                    Authoritative whenever present.
//   2. FREE-TEXT   — codex-bridge.parseVerdict, fallback ONLY when there is no
//                    structured verdict to read (legacy / non-envelope callers).
//   3. UNAVAILABLE — neither readable → fail-closed. Never certify approval from
//                    an unreadable review.
//
// The verdict vocabulary is the companion's contract
// (codex/prompts/adversarial-review.md <structured_output_contract>):
// exactly `approve` | `needs-attention`. The gate mapping mirrors
// finalize-receipt.js#deriveCodexFlags so all gates agree byte-for-byte.

const APPROVING_VERDICTS = Object.freeze(new Set(['approve']));

// parseReviewPayload(envelope) → { verdict, summary, findings, rounds } | null
//
// `envelope` is codex-invoke.js's ok-path JSON:
//   { ok, stdout, stderr, durationMs, classification, blocking, advisory }
// The review itself lives entirely inside `.stdout` as the companion's JSON TEXT;
// the envelope carries no verdict/summary/findings of its own. Reading the
// envelope directly is the M3 bug this module exists to prevent.
//
// null means "could not read the review" — callers MUST treat that as
// fail-closed (actionable / unavailable), never as approval.
function parseReviewPayload(envelope) {
  let inner = null;
  try { inner = JSON.parse((envelope && envelope.stdout) || ''); } catch (_) { return null; }
  if (!inner || typeof inner !== 'object') return null;
  // The companion wraps the model payload in `.result`; tolerate a bare payload.
  const r = (inner.result && typeof inner.result === 'object') ? inner.result : inner;
  if (typeof r.verdict !== 'string' || !r.verdict.trim()) return null;
  return {
    verdict: r.verdict.trim(),
    summary: typeof r.summary === 'string' ? r.summary : '',
    findings: Array.isArray(r.findings) ? r.findings : [],
    rounds: Number.isFinite(inner.rounds) ? inner.rounds : (Number.isFinite(r.rounds) ? r.rounds : 1),
  };
}

// verdictToGate(rawVerdict) → 'converged' | 'divergent' | 'unavailable'
// The single mapping rule (mirror of finalize-receipt.js#deriveCodexFlags):
//   approve           → converged
//   any other verdict → divergent   (needs-attention per the companion contract)
//   null/absent       → unavailable (fail-closed)
function verdictToGate(rawVerdict) {
  if (rawVerdict === null || rawVerdict === undefined) return 'unavailable';
  const v = String(rawVerdict).trim().toLowerCase();
  if (!v) return 'unavailable';
  return APPROVING_VERDICTS.has(v) ? 'converged' : 'divergent';
}

// deriveGateVerdict({ envelope, freeText, parseVerdict }) →
//   { verdict, source, rawVerdict }
//
// The one call plan.md / prp-implement.md make to derive $CODEX_VERDICT.
//   verdict    — 'converged' | 'divergent' | 'unavailable' (the receipt value)
//   source     — 'structured' | 'free-text' | 'unavailable' (provenance, so a
//                fallback can never masquerade as an authoritative read)
//   rawVerdict — what the model literally said, or null
//
// `parseVerdict` is injected (default: codex-bridge.parseVerdict) to keep this
// module dependency-light and the precedence unit-testable in isolation.
function deriveGateVerdict(opts) {
  opts = opts || {};
  const review = parseReviewPayload(opts.envelope);
  if (review) {
    return {
      verdict: verdictToGate(review.verdict),
      source: 'structured',
      rawVerdict: review.verdict,
    };
  }
  // No structured verdict. Fall back to the free-text scan ONLY here — this is
  // the legacy path, and it must never override a structured read above.
  //
  // THE FALLBACK CAN NEVER PRODUCE 'converged' (Implement-Codex R1 F3).
  //
  // An earlier revision returned whatever parseVerdict said as long as it was not
  // 'unavailable' — which kept the exact bug this module exists to kill. Under
  // schema drift or malformed stdout the structured read fails, the scan runs, and
  // prose containing the word `converged` stamps an approving receipt; cross-gate
  // dedupe keys on that value and skips PR-Codex entirely. Reproduced:
  //   deriveGateVerdict({envelope:{stdout:'MALFORMED'},
  //                      freeText:'the reviewer notes we converged on the approach'})
  //     → verdict 'converged'   ← dual review silently bypassed
  //
  // Approval is the one claim a keyword scan is not entitled to make. A scan may
  // only RAISE suspicion (divergent), never certify. Anything it cannot pin to a
  // divergence becomes 'unavailable' — fail-closed, which callers already treat as
  // non-approving.
  const text = typeof opts.freeText === 'string' ? opts.freeText : '';
  if (text.trim()) {
    const fn = opts.parseVerdict || require('./codex-bridge').parseVerdict;
    const v = fn(text);
    if (v === 'divergent' || v === 'critical') {
      return { verdict: 'divergent', source: 'free-text', rawVerdict: null };
    }
  }
  return { verdict: 'unavailable', source: 'unavailable', rawVerdict: null };
}

module.exports = {
  parseReviewPayload: parseReviewPayload,
  verdictToGate: verdictToGate,
  deriveGateVerdict: deriveGateVerdict,
  APPROVING_VERDICTS: APPROVING_VERDICTS,
};
