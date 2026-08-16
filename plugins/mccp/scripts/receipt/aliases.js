'use strict';

// mccp command-to-gate alias matrix.
// Each entry: { produces: [gate_id], requires_preceding: [gate_id], design_optional: [gate_id] }
//
// "produces" = receipts a successful invocation of this command should leave behind.
// "requires_preceding" = receipts that MUST exist (matching subject) before this command runs.
//   Missing/stale => preflight returns exit 2.
// "design_optional" = additional receipts required only when design context is detected.
//   We treat design as optional at preflight time (warn only).
//
// Keys are normalized: leading slash stripped, lowercased.
const ALIAS_MATRIX = {
  'mccp:plan-prd': {
    // PRD stage is co-created with the user and writes no receipt.
    // Listed here so hooks recognize it explicitly (rather than fall through
    // to "unknown command, allow"), but produces/requires are empty.
    produces: [],
    requires_preceding: [],
    design_optional: [],
  },
  'mccp:meta-research': {
    // Research is not a gate: it writes no receipt and requires none
    // (GATE_IDS is untouched). Listed here for the same reason as plan-prd —
    // so hooks recognize the command explicitly rather than falling through to
    // "unknown command, allow". Empty arrays are the contract, not an oversight.
    produces: [],
    requires_preceding: [],
    design_optional: [],
  },
  'mccp:plan': {
    produces: ['mccp-plan-codex'],
    requires_preceding: [],
    design_optional: ['plan-impeccable'],
  },
  'mccp:prp-implement': {
    produces: ['mccp-implement-codex'],
    requires_preceding: ['mccp-plan-codex'],
    design_optional: ['implement-impeccable'],
  },
  'mccp:pr': {
    produces: ['mccp-pr-codex'],
    requires_preceding: ['mccp-plan-codex', 'mccp-implement-codex'],
    design_optional: ['pr-impeccable'],
  },
  // /mccp:prp-pr is a verbatim alias of /mccp:pr (PRP-flow naming).
  'mccp:prp-pr': {
    produces: ['mccp-pr-codex'],
    requires_preceding: ['mccp-plan-codex', 'mccp-implement-codex'],
    design_optional: ['pr-impeccable'],
  },
  'mccp:code-review': {
    produces: ['code-reviewer'],
    requires_preceding: ['mccp-pr-codex'],
    design_optional: ['pr-impeccable'],
  },
  // /mccp:review-pr is a verbatim alias of /mccp:code-review (ECC naming).
  'mccp:review-pr': {
    produces: ['code-reviewer'],
    requires_preceding: ['mccp-pr-codex'],
    design_optional: ['pr-impeccable'],
  },
};

const PHASE_FROM_GATE = {
  'plan-impeccable': 'plan',
  'mccp-plan-codex': 'plan',
  'implement-impeccable': 'implement',
  'mccp-implement-codex': 'implement',
  // workflow-orchestration M3 — produces-only aggregate verify gate. Same phase
  // as implement (it runs at the tail of the implement dispatch, pre-commit). Not
  // in ALIAS_MATRIX: no command lists it in produces/requires, so command
  // preflight (validate-cmd), cross-gate dedupe, and the PR chain-check are all
  // non-invasive to it (DD5 / Codex R1 F3).
  'mccp-implement-verify': 'implement',
  'pr-impeccable': 'pr',
  'mccp-pr-codex': 'pr',
  'security-reviewer': 'review',
  'code-reviewer': 'review',
  // santa-loop-materialize M2 — produces-only 봉인 게이트. ALIAS_MATRIX 무변경
  // (DD1/UI2). phase='review'는 santa-loop의 실제 위치(push 직전 리뷰)이며,
  // 'pr'을 고르면 evidence-stage-guard.js가 ship receipt로 오분류한다.
  'mccp-santa-review': 'review',
};

function normalizeCommand(cmd) {
  if (typeof cmd !== 'string') return null;
  return cmd.replace(/^\//, '').toLowerCase();
}

function getCommandSpec(command) {
  const key = normalizeCommand(command);
  if (!key) return null;
  return ALIAS_MATRIX[key] || null;
}

function phaseFromGate(gateId) {
  return PHASE_FROM_GATE[gateId] || null;
}

module.exports = {
  ALIAS_MATRIX: ALIAS_MATRIX,
  PHASE_FROM_GATE: PHASE_FROM_GATE,
  getCommandSpec: getCommandSpec,
  normalizeCommand: normalizeCommand,
  phaseFromGate: phaseFromGate,
};
