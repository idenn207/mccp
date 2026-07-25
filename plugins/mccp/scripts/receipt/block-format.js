'use strict';

// M2 F2 (integrity-unification — Codex divergent absorption). Shared block-body
// formatter so tamper-aware recovery guidance can NEVER drift between the three
// enforcement surfaces:
//   - preflight.js       (CLI / auto-chain)
//   - receipt-prompt.js  (UserPromptExpansion hook — the slash-command surface)
//   - receipt-skill.js   (Skill PreToolUse hook)
//
// Before this, Task 1's tamper handling lived ONLY in preflight.js: a
// subject/receipt-tamper block was labeled TAMPER and carried "Do NOT regenerate
// (that destroys the evidence)". The two HOOKS — the actual slash-command
// enforcement surface — printed every block as generic INVALID and ALWAYS appended
// "Write missing receipt", i.e. they told the operator to regenerate/overwrite the
// tampered receipt, destroying the very evidence Task 1 exists to preserve. This
// module is the single source of the label + tamper guidance so all three agree.

const TAMPER_KINDS = Object.freeze(['receipt-tamper', 'subject-tamper']);

function isTamperKind(kind) {
  return TAMPER_KINDS.indexOf(kind) !== -1;
}

function hasTamper(result) {
  return (result.blocking || []).some(function (b) { return b && isTamperKind(b.kind); });
}

// entryLabel(blockEntry) → fixed-width label. tempfail and tamper are called out
// so the operator-facing line matches the machine-readable kind.
function entryLabel(b) {
  if (b && b.kind === 'tempfail') return 'TEMPFAIL';
  if (b && isTamperKind(b.kind)) return 'TAMPER  ';
  return 'INVALID ';
}

// tamperGuidanceLines(result, tag) → string[]
// The investigation-first "Do NOT regenerate" line(s) for whichever tamper kinds
// are present in result.blocking. Empty when no tamper block. Each line is
// prefixed with `tag` (defaults to the gate tag) so it reads the same on every
// surface. Strings are kept verbatim with preflight.js's original wording so its
// substring assertions (/TAMPER/, /Do NOT regenerate/) stay green.
function tamperGuidanceLines(result, tag) {
  const pre = (tag || '[MCCP-RECEIPT-GATE]') + ' ';
  const blocking = result.blocking || [];
  const lines = [];
  if (blocking.some(function (b) { return b && b.kind === 'receipt-tamper'; })) {
    lines.push(pre + 'TAMPER: receipt_hash mismatch — receipt body (findings/resolution/meta) altered after signing. Do NOT regenerate (that destroys the evidence). Inspect the receipt against its source and investigate the change before any re-run.');
  }
  if (blocking.some(function (b) { return b && b.kind === 'subject-tamper'; })) {
    lines.push(pre + 'TAMPER: subject_hash mismatch — receipt subject fields (task_id/phase/gate_id/plan_hash/base_sha/head_sha/round) altered after signing. Do NOT regenerate (that destroys the evidence). Inspect the receipt against its source and investigate the change before any re-run.');
  }
  return lines;
}

// blockDetailLines(result) → string[]
// The per-entry lines ("  MISSING …", "  TAMPER  …", "  CRITICAL …") with the
// shared label. Two-space indent matches the hook convention. preflight.js keeps
// its own richer STALE line (adds the plan-hash was/now detail), so it does not
// use this helper for the stale rows — but it shares entryLabel + tamper guidance.
function blockDetailLines(result) {
  const lines = [];
  for (const m of result.missing || []) lines.push('  MISSING  ' + m.gate_id + ': ' + m.reason);
  for (const s of result.stale || []) lines.push('  STALE    ' + s.gate_id + ': ' + s.reason);
  for (const b of result.blocking || []) lines.push('  ' + entryLabel(b) + ' ' + b.gate_id + ': ' + b.reason);
  for (const c of result.open_critical || []) lines.push('  CRITICAL ' + c.gate_id + ': ' + c.item);
  return lines;
}

module.exports = {
  TAMPER_KINDS: TAMPER_KINDS,
  isTamperKind: isTamperKind,
  hasTamper: hasTamper,
  entryLabel: entryLabel,
  tamperGuidanceLines: tamperGuidanceLines,
  blockDetailLines: blockDetailLines,
};
