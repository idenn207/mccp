'use strict';

// plan-fanout perspectives — read-only fan-out perspective catalogue + prompt
// builder for the /mccp:plan multi-perspective GROUND enhancement (M1).
//
// Pure, dep-free. Mirrors impeccable-routing.js (frozen catalogue, enum-ish
// constants, module.exports at bottom) and dispatch-cli.js:105
// buildImplementWorkerBasePrompt (explicit read-only guardrails + structured
// return contract stated inline in the prompt text).
//
// Codex F1 — every perspective maps to a DEDICATED read-only agent (fanout-*,
// frontmatter tools: Read/Grep/Glob). The write-capable mccp:security-reviewer /
// mccp:tdd-guide agents are deliberately NOT referenced here: read-only is
// enforced by tool-absence at the agent-definition layer, not by prompt text.

const PERSPECTIVES = Object.freeze([
  Object.freeze({ key: 'architect', agentType: 'mccp:fanout-architect', lens: '구조·확장성·경계' }),
  Object.freeze({ key: 'security', agentType: 'mccp:fanout-security', lens: '공격면·데이터' }),
  Object.freeze({ key: 'test', agentType: 'mccp:fanout-test', lens: '검증 전략·테스트 가능성' }),
  Object.freeze({ key: 'explorer', agentType: 'mccp:fanout-explorer', lens: '기존 코드 추적·재사용' }),
]);

const SEVERITY_ENUM = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// PERSPECTIVE_SCHEMA — JSON Schema the Workflow agent() call enforces via its
// StructuredOutput tool so each fan-out worker returns a validated object rather
// than free text. Arrays let synthesize.js aggregate deterministically.
const PERSPECTIVE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['perspective', 'findings', 'metaGaps', 'patternsToMirror'],
  properties: {
    perspective: { type: 'string' },
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
    metaGaps: { type: 'array', items: { type: 'string' } },
    patternsToMirror: { type: 'array', items: { type: 'string' } },
  },
});

function findPerspective(key) {
  for (let i = 0; i < PERSPECTIVES.length; i++) {
    if (PERSPECTIVES[i].key === key) return PERSPECTIVES[i];
  }
  return null;
}

// buildPerspectivePrompt({perspective, prdPath, planPath}) → string
// Restates the read-only + propose-only mandate (defence in depth over the
// agent's tool-absence) and binds the concrete PRD + draft-plan paths. Mirrors
// the dispatch-cli worker prompt shape: explicit guardrails + return contract,
// one string, no interpolated secrets.
function buildPerspectivePrompt(opts) {
  opts = opts || {};
  const perspective = opts.perspective;
  if (!perspective || !perspective.key || !perspective.lens) {
    throw new Error('buildPerspectivePrompt requires a perspective { key, lens }');
  }
  const prdPath = opts.prdPath || '(none — free-form plan)';
  const planPath = opts.planPath || '(draft plan not yet written)';

  return [
    'You are the "' + perspective.key + '" read-only perspective (lens: ' + perspective.lens + ')',
    'in a /mccp:plan multi-perspective fan-out. Investigate the plan and codebase',
    'through your lens ONLY and return structured findings.',
    '',
    '── INPUTS ──',
    'Source PRD:  ' + prdPath,
    'Draft plan:  ' + planPath,
    '',
    '── HARD MANDATE (read-only, propose-only) ──',
    '- You have Read, Grep, Glob ONLY. You CANNOT edit files or run commands.',
    '- Do NOT propose file edits or patches. Surface findings, meta-gaps, and',
    '  reusable patterns for the planning session to act on.',
    '- Stay strictly within your lens; sibling perspectives cover the rest.',
    '- Cite evidence as a concrete file:line or a direct PRD/plan quote.',
    '',
    '── RETURN CONTRACT ──',
    'Return ONE object: { perspective, findings:[{claim,evidence,severity}],',
    'metaGaps:[...], patternsToMirror:[...] }. severity ∈ LOW|MEDIUM|HIGH|CRITICAL.',
    'No prose preamble, no edit proposals.',
  ].join('\n');
}

module.exports = {
  PERSPECTIVES: PERSPECTIVES,
  PERSPECTIVE_SCHEMA: PERSPECTIVE_SCHEMA,
  SEVERITY_ENUM: SEVERITY_ENUM,
  findPerspective: findPerspective,
  buildPerspectivePrompt: buildPerspectivePrompt,
};
