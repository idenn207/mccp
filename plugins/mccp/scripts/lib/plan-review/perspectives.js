'use strict';

// plan-review perspectives — L2 refute panel catalogue + prompt builder.
//
// DD4: these are NOT the fanout-* agents. Fan-out asks "what would make this
// plan better?" and its agents are written to propose. Review asks "is this
// plan wrong?" and an agent primed to propose will find something agreeable to
// say about almost anything. The system prompt has to be adversarial from the
// first line, so L2 gets its own four agents.
//
// The roster also differs: `explorer` (code reuse) is a GROUND concern and is
// dropped; `invariant` is added because this repo's characteristic defect is not
// a bad abstraction but a fail-closed gate quietly becoming fail-open, a receipt
// losing its anchor, or a rollback path that was never really there.
//
// Approval is defined negatively: a perspective passes ONLY when it looked for
// a defect and could not find one. "I see no problem" without an attempted
// refutation is not a pass — hence refutationAttempted is a required field.
//
// Read-only is guaranteed by tool ABSENCE in each agent's frontmatter
// (tools: [Read, Grep, Glob]), not by the prompt text below. The prompt restates
// it as defence in depth, exactly as plan-fanout does (Codex F1 pattern).

const REVIEW_PERSPECTIVES = Object.freeze([
  Object.freeze({
    key: 'architect',
    agentType: 'mccp:review-architect',
    lens: '구조·경계 — 추상화가 실제로 불변식을 담는가',
  }),
  Object.freeze({
    key: 'security',
    agentType: 'mccp:review-security',
    lens: '공격면·데이터 — 신뢰 경계와 유출 경로',
  }),
  Object.freeze({
    key: 'test',
    agentType: 'mccp:review-test',
    lens: '검증 전략·반증가능성 — 주장이 test로 존재하는가',
  }),
  Object.freeze({
    key: 'invariant',
    agentType: 'mccp:review-invariant',
    lens: 'fail-closed 게이트·receipt anchoring·rollback 안전성의 침식',
  }),
]);

const SEVERITY_ENUM = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const VERDICT_ENUM = Object.freeze(['pass', 'fail']);

// REVIEW_SCHEMA — enforced by the Workflow agent() StructuredOutput tool so each
// reviewer returns a validated object instead of prose the quorum oracle would
// have to guess at.
const REVIEW_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['perspective', 'verdict', 'findings', 'refutationAttempted'],
  properties: {
    perspective: { type: 'string' },
    verdict: { type: 'string', enum: VERDICT_ENUM.slice() },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'evidence', 'severity'],
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string' },
          severity: { type: 'string', enum: SEVERITY_ENUM.slice() },
        },
      },
    },
    // What was actually attacked. A pass with an empty or hand-wavy value here
    // is the failure mode this field exists to make visible.
    refutationAttempted: { type: 'string' },
  },
});

function findReviewPerspective(key) {
  for (let i = 0; i < REVIEW_PERSPECTIVES.length; i++) {
    if (REVIEW_PERSPECTIVES[i].key === key) return REVIEW_PERSPECTIVES[i];
  }
  return null;
}

// buildRefutePrompt({perspective, planPath, prdPath, reviewedPlanHash}) → string
//
// reviewedPlanHash is passed through for the reviewer's awareness only — the
// binding that matters is computed by cli.js emit-workflow-args and carried in
// the workflow args (DD13). Telling the reviewer which version it is reading
// makes a "the plan changed under me" report possible.
function buildRefutePrompt(opts) {
  opts = opts || {};
  const perspective = opts.perspective;
  if (!perspective || !perspective.key || !perspective.lens) {
    throw new Error('buildRefutePrompt requires a perspective { key, lens }');
  }
  const planPath = opts.planPath || '(plan path not supplied)';
  const prdPath = opts.prdPath || '(none — free-form plan)';
  const hash = opts.reviewedPlanHash || '(unbound)';

  return [
    'You are the "' + perspective.key + '" REFUTATION reviewer (lens: ' +
      perspective.lens + ')',
    'on a /mccp:plan approval gate. Four independent reviewers run in parallel;',
    'you cannot see the others and must not assume what they cover.',
    '',
    '── INPUTS ──',
    'Plan under review: ' + planPath,
    'Source PRD:        ' + prdPath,
    'Plan version:      ' + hash,
    '',
    '── YOUR JOB IS TO REFUTE, NOT TO APPROVE ──',
    'Find EVIDENCE that this plan is wrong through your lens. Attack it:',
    'read the modules it cites and check the citation actually says what the',
    'plan claims; look for the case the design does not handle; find the',
    'invariant it erodes; find the assertion it makes that no test would catch.',
    '',
    'You may return verdict="pass" ONLY when you genuinely attempted refutation',
    'and could not find a defect. Absence of evidence is the ONLY route to a',
    'pass. Do NOT construct a justification for approving — that is not your',
    'role, and a reviewer who reasons toward approval is worthless here.',
    '',
    'A plausible-sounding concern you cannot evidence is NOT a finding. Do not',
    'pad. If your honest answer is "I attacked X, Y, Z and found nothing", say',
    'exactly that in refutationAttempted and pass.',
    '',
    '── HARD MANDATE (read-only) ──',
    '- You have Read, Grep, Glob ONLY. You cannot edit files or run commands.',
    '- Do NOT propose patches. Report defects with evidence.',
    '- Stay strictly within your lens; sibling reviewers cover the rest.',
    '- Cite evidence as a concrete file:line or a direct plan/PRD quote. A',
    '  finding without a checkable citation will be treated as noise.',
    '',
    '── RETURN CONTRACT ──',
    'Return ONE object: { perspective:"' + perspective.key + '", verdict:"pass"|"fail",',
    'findings:[{claim,evidence,severity}], refutationAttempted:"<what you attacked>" }.',
    'severity ∈ LOW|MEDIUM|HIGH|CRITICAL. Any HIGH/CRITICAL finding means',
    'verdict="fail". No prose preamble.',
  ].join('\n');
}

module.exports = {
  REVIEW_PERSPECTIVES: REVIEW_PERSPECTIVES,
  REVIEW_SCHEMA: REVIEW_SCHEMA,
  SEVERITY_ENUM: SEVERITY_ENUM,
  VERDICT_ENUM: VERDICT_ENUM,
  findReviewPerspective: findReviewPerspective,
  buildRefutePrompt: buildRefutePrompt,
};
