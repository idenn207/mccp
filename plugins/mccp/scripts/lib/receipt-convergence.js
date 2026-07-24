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

function isDivergentVerdict(resolution) {
  if (!resolution || typeof resolution !== 'object') return false;
  const cv = resolution.codex_verdict;
  return cv === 'divergent' || cv === 'critical';
}

function isConvergedVerdict(resolution) {
  if (!resolution || typeof resolution !== 'object') return false;
  if (isDivergentVerdict(resolution)) return false;
  return resolution.converged === true;
}

module.exports = {
  isConvergedVerdict: isConvergedVerdict,
  isDivergentVerdict: isDivergentVerdict,
};
