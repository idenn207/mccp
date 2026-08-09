'use strict';

// M1 (integrity-unification) — codex_verdict-first convergence read helper.
//
// resolution.converged is ALWAYS true once the writer finalized findings
// ("writer finalized", NOT "Codex approved" — the B#11 semantic split). Reading
// it as "converged/approved" lets a DIVERGENT ship (codex_verdict='divergent',
// converged still true) render or be treated as converged — the exact
// false-positive this cycle exists to kill. resolution.codex_verdict is the
// authoritative outcome, so it wins:
//
//   codex_verdict ∈ {divergent, critical}  → NEVER converged (a No-ship)
//   otherwise                              → fall back to resolution.converged
//
// Shared by every consumer that read resolution.converged directly (semantic +
// display) so the fix lands in ONE place. `converged`/`skipped`/`unavailable`/
// absent verdicts keep the pre-existing converged-flag behaviour; only
// divergent/critical are forced to non-converged (the minimal correct change).

// diverse-agent-review M1 — the authoritative field is no longer always
// codex_verdict, because an approval may now be issued by the multi-agent review
// panel. Both helpers below delegate to resolveEffectiveVerdict so there is
// still exactly ONE place that knows which field answers.
//
// Legacy behaviour is preserved byte-for-byte. When no review_* field is present
// the helper reports axis='codex' (or 'none') and its verdict IS the raw
// codex_verdict, so these two functions compute exactly what they computed
// before. Only receipts that actually carry a review verdict take the new branch.
const { resolveEffectiveVerdict } = require('./review-verdict');

function isDivergentVerdict(resolution) {
  if (!resolution || typeof resolution !== 'object') return false;
  const eff = resolveEffectiveVerdict(resolution);
  return eff.verdict === 'divergent' || eff.verdict === 'critical';
}

function isConvergedVerdict(resolution) {
  if (!resolution || typeof resolution !== 'object') return false;
  const eff = resolveEffectiveVerdict(resolution);

  // On the review axis the verdict is the whole answer. resolution.converged
  // means "the writer finalized findings" (the B#11 split) and was never an
  // approval signal; deferring to it here would let an `unavailable` review —
  // a proof that did not hold, or a partial stamp — read as converged.
  if (eff.axis === 'review') return eff.verdict === 'converged';

  if (eff.verdict === 'divergent' || eff.verdict === 'critical') return false;
  return resolution.converged === true;
}

module.exports = {
  isConvergedVerdict: isConvergedVerdict,
  isDivergentVerdict: isDivergentVerdict,
};
