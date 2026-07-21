'use strict';

// plan-fanout reservation reconcile oracle — M3 follow-up (PR-Codex R1 F2).
//
// PROBLEM: plan.md used to pass the fan-out's actual launch count as
// `--actual "${FANOUT_ACTUAL_N:-$RES_GRANTED}"`, where FANOUT_ACTUAL_N was a shell
// variable the LLM was expected to set after reading the Workflow result. The
// paths the table says are ZERO (in-sandbox budget skip, Workflow never invoked)
// are exactly the paths where the LLM never reaches that reasoning step — so the
// default silently COMMITTED the full grant as if the fleet had run. A committed
// entry leaves `open[]` and is therefore NOT lease-expirable: a PERMANENT phantom,
// the very thing the two-phase reservation was added to remove.
//
// FIX: the LLM's only job is to write down what it got, verbatim, into a result
// artifact. The mapping from that result to a launch count is CODE:
//
//   invoked === false            → 0        nothing was ever called
//   skipped === true             → 0        the script contractually spawns zero agents
//   coverage > 0                 → granted  the fleet ran
//   anything else (coverage 0,
//   a throw, an odd shape)       → granted  agents may have spawned and then failed —
//                                           count them (conservative; over-count is the
//                                           safe direction, and the lease cannot rescue
//                                           an under-count once committed)
//
// NO artifact → deriveFanoutActualN returns null and the caller must NOT reconcile.
// "I don't know" is exactly what PENDING means, and pending self-heals: it stays
// counted (conservative) until the lease expires it. Defaulting to 0 there would be
// the opposite error — an under-count leaves the cap over-permissive, the one
// direction this cap must never err in.

// deriveFanoutActualN({ result, granted }) → { actualN, reason } | null
//   result   the parsed fan-out result artifact, or null/undefined when absent
//   granted  the reserved fleet size (fallback 1 when unusable)
// Returns null when `result` is absent/unusable — the signal to leave the
// reservation pending rather than guess a count.
function deriveFanoutActualN(opts) {
  opts = opts || {};
  const result = opts.result;
  const granted = (Number.isInteger(opts.granted) && opts.granted >= 0) ? opts.granted : 1;

  if (!result || typeof result !== 'object') return null;

  if (result.invoked === false) return { actualN: 0, reason: 'not-invoked' };
  if (result.skipped === true) return { actualN: 0, reason: 'sandbox-budget-skip' };
  if (Number.isFinite(result.coverage) && result.coverage > 0) {
    return { actualN: granted, reason: 'fleet-ran' };
  }
  return { actualN: granted, reason: 'conservative-unknown-outcome' };
}

module.exports = {
  deriveFanoutActualN: deriveFanoutActualN,
};
