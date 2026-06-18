'use strict';

// v1.3.1 — receipt-prompt informational-context schema.
//
// Single source of truth for the structured `additionalContext` payload that
// receipt-prompt.js emits on the ALLOW path for recoverable commands with
// a missing-only integrity result. Centralizing the shape here lets the lint
// test, hook, and Phase 0 auto-recovery body share one schema vocabulary
// instead of three drifting copies of "what fields should we trust".
//
// Schema (from .claude/plans/v1-3-1-informational-hooks.plan.md §Context Schema):
//
//   {
//     mccp_receipt_gate: {
//       commandName,       // never null
//       decisionId,        // derived slug, never silently "default"
//       planPath,          // null only if not derivable
//       cwd,
//       classifierKind,    // ok | block | tempfail | advisory | skipped
//       must_not_proceed,  // true = Claude must stop + ask user
//       validateResult: { ok, missing[], stale[], blocking[], open_critical[], warnings[] }
//     }
//   }
//
// Pure data — no side effects, no I/O. Safe to require from both the hook
// (which spawns under tight time budgets) and tests (which import freely).

const RECOVERABLE_ALLOW_LIST = Object.freeze([
  'mccp:plan',
  'mccp:prp-implement',
  'mccp:resume',
]);

function normalizeCommandName(commandName) {
  if (typeof commandName !== 'string') return '';
  return commandName.toLowerCase().replace(/^\/+/, '');
}

function isRecoverable(commandName) {
  return RECOVERABLE_ALLOW_LIST.indexOf(normalizeCommandName(commandName)) !== -1;
}

function computeMustNotProceed(commandName, result) {
  if (!isRecoverable(commandName)) return true; // terminal/mutating: always stop
  const r = result || {};
  if ((r.stale || []).length > 0) return true;
  if ((r.blocking || []).length > 0) return true;
  if ((r.open_critical || []).length > 0) return true;
  return false;
}

function normalizeResult(result) {
  const r = result || {};
  return {
    ok: Boolean(r.ok),
    missing: Array.isArray(r.missing) ? r.missing : [],
    stale: Array.isArray(r.stale) ? r.stale : [],
    blocking: Array.isArray(r.blocking) ? r.blocking : [],
    open_critical: Array.isArray(r.open_critical) ? r.open_critical : [],
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
  };
}

function buildAdditionalContext(commandName, decisionId, planPath, cwd, result, classifierKind) {
  return {
    mccp_receipt_gate: {
      commandName: typeof commandName === 'string' ? commandName : '',
      decisionId: typeof decisionId === 'string' ? decisionId : '',
      planPath: typeof planPath === 'string' && planPath.length > 0 ? planPath : null,
      cwd: typeof cwd === 'string' ? cwd : '',
      classifierKind: typeof classifierKind === 'string' ? classifierKind : 'block',
      must_not_proceed: computeMustNotProceed(commandName, result),
      validateResult: normalizeResult(result),
    },
  };
}

module.exports = {
  RECOVERABLE_ALLOW_LIST,
  isRecoverable,
  computeMustNotProceed,
  buildAdditionalContext,
};
