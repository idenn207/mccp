'use strict';

// v0.2.8 Task 2.6.5a A3 (R2 F2 absorption) — shared validateCommand result
// classifier. Five direct consumers of validateCommand need to distinguish
// transient migration-in-progress (tempfail, exit 75) from hard gate
// failure (block, exit 2) from success (ok, exit 0). Previously each
// consumer rolled its own check on `result.ok`, which collapsed tempfail
// into a hard block. The shared helper enforces the precedence contract
// in one place:
//
//   1. result.tempfail === true   → 'tempfail'  (retryable; exit 75)
//   2. result.ok === false        → 'block'     (hard fail; exit 2)
//   3. else                        → 'ok'        (success; exit 0)
//
// Consumers: cli.js cmdValidate, preflight.js preflight, receipt-prompt.js
// PreToolUse hook, receipt-skill.js PreToolUse Skill hook, auto-chain.js
// next-step orchestrator.

const KIND_TEMPFAIL = 'tempfail';
const KIND_BLOCK = 'block';
const KIND_OK = 'ok';

const EXIT_OK = 0;
const EXIT_BLOCK = 2;
const EXIT_TEMPFAIL = 75;

// classifyValidationResult — apply the precedence contract. Pure function;
// no I/O, no requires of optional deps. Designed so a failure to load this
// module is itself a loud-fail-open path (caller's old `result.ok` check
// remains correct for non-tempfail cases).
function classifyValidationResult(result) {
  if (result && result.tempfail === true) return KIND_TEMPFAIL;
  if (result && result.ok === false) return KIND_BLOCK;
  return KIND_OK;
}

// exitCodeFor — translate the classifier output to the canonical exit code.
// Single source of truth so cli/preflight/auto-chain stay in lockstep.
function exitCodeFor(kind) {
  switch (kind) {
    case KIND_TEMPFAIL: return EXIT_TEMPFAIL;
    case KIND_BLOCK: return EXIT_BLOCK;
    case KIND_OK: return EXIT_OK;
    default: return EXIT_BLOCK; // unknown → treat as block (fail closed)
  }
}

module.exports = {
  classifyValidationResult: classifyValidationResult,
  exitCodeFor: exitCodeFor,
  KIND_TEMPFAIL: KIND_TEMPFAIL,
  KIND_BLOCK: KIND_BLOCK,
  KIND_OK: KIND_OK,
  EXIT_OK: EXIT_OK,
  EXIT_BLOCK: EXIT_BLOCK,
  EXIT_TEMPFAIL: EXIT_TEMPFAIL,
};
