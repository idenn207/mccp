export const meta = {
  name: 'mccp-plan-review',
  description: 'Read-only refutation panel for the /mccp:plan L2 approval gate (M1).',
  phases: [
    { title: 'Refute', detail: 'spawn read-only refutation reviewers in parallel' },
  ],
};

// Self-contained by necessity: the Workflow execution sandbox exposes no
// `require`/Node module access, so this script inlines FAITHFUL PORTS of the
// TESTED plan-review/* oracles rather than importing them:
//   - CATALOG      ← lib/plan-review/perspectives.js  REVIEW_PERSPECTIVES
//   - SCHEMA       ← lib/plan-review/perspectives.js  REVIEW_SCHEMA
//   - buildPrompt  ← lib/plan-review/perspectives.js  buildRefutePrompt
// Those libs stay the unit-tested reference implementations. Keep the ports in
// sync when either side changes.
//
// This workflow deliberately does NOT decide anything. It fires the panel and
// returns raw reviewer results; decideQuorum/decideReview run caller-side in
// cli.js. A gate that let the thing being measured also compute its own verdict
// would be exactly the structure this PRD is replacing.
//
// No Date.now()/Math.random()/new Date() (they throw in the Workflow sandbox).

const CATALOG = [
  { key: 'architect', agentType: 'mccp:review-architect', lens: '구조·경계 — 추상화가 실제로 불변식을 담는가' },
  { key: 'security', agentType: 'mccp:review-security', lens: '공격면·데이터 — 신뢰 경계와 유출 경로' },
  { key: 'test', agentType: 'mccp:review-test', lens: '검증 전략·반증가능성 — 주장이 test로 존재하는가' },
  { key: 'invariant', agentType: 'mccp:review-invariant', lens: 'fail-closed 게이트·receipt anchoring·rollback 안전성의 침식' },
];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['perspective', 'verdict', 'findings', 'refutationAttempted'],
  properties: {
    perspective: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'evidence', 'severity'],
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string' },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        },
      },
    },
    refutationAttempted: { type: 'string' },
  },
};

const PERSPECTIVE_ORDER = ['architect', 'security', 'test', 'invariant'];

function buildPrompt(p, planPath, prdPath, reviewedPlanHash) {
  return [
    'You are the "' + p.key + '" REFUTATION reviewer (lens: ' + p.lens + ')',
    'on a /mccp:plan approval gate. Four independent reviewers run in parallel;',
    'you cannot see the others and must not assume what they cover.',
    '',
    '── INPUTS ──',
    'Plan under review: ' + (planPath || '(plan path not supplied)'),
    'Source PRD:        ' + (prdPath || '(none — free-form plan)'),
    'Plan version:      ' + (reviewedPlanHash || '(unbound)'),
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
    'Return ONE object: { perspective:"' + p.key + '", verdict:"pass"|"fail",',
    'findings:[{claim,evidence,severity}], refutationAttempted:"<what you attacked>" }.',
    'severity ∈ LOW|MEDIUM|HIGH|CRITICAL. Any HIGH/CRITICAL finding means',
    'verdict="fail". No prose preamble.',
  ].join('\n');
}

// ── Workflow body ──────────────────────────────────────────────────────────
// `args` is supposed to arrive as an object, but a caller that hands the tool a
// JSON-encoded STRING gets one silently: every field then reads as `undefined`,
// so fleetKeys is "missing", the panel degrades to one reviewer, the quorum can
// never be satisfied, and multi-agent mode fails closed on EVERY run — a total
// functional failure wearing the costume of a safe HALT. Measured twice in the
// M1 dry-run before this parse existed. Accepting both encodings is cheap and
// removes the whole failure mode; a string that is not JSON still falls through
// to `{}` and degrades exactly as before.
function coerceInput(a) {
  if (typeof a === 'string') {
    try {
      const parsed = JSON.parse(a);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        log('[mccp:plan-review] args arrived as a JSON string — parsed it. The'
          + ' caller should pass an object; this parse exists so a string does not'
          + ' silently collapse the panel to one reviewer.');
        return parsed;
      }
    } catch (_) { /* not JSON — fall through to the empty-input degrade */ }
    log('[mccp:plan-review] args arrived as a non-JSON string — treating as empty.');
    return {};
  }
  return (a && typeof a === 'object' && !Array.isArray(a)) ? a : {};
}
const input = coerceInput(args);
const planPath = input.planPath || null;
const prdPath = input.prdPath || null;
// DD13 — carried in, carried straight back out. The workflow never computes
// this: it is computed by cli.js emit-workflow-args BEFORE the reviewers read
// the plan, and returning it unchanged is what lets decide/write detect a plan
// edited mid-review.
const reviewedPlanHash = input.reviewedPlanHash || null;
const minRemaining = Number.isFinite(input.minRemaining) ? input.minRemaining : 0;

// fleetKeys carries the fleet the runaway reservation actually GRANTED. It is
// emitted by cli.js `emit-workflow-args` (which caps `fleet` by --granted and
// mirrors the keys into this field) — an earlier revision omitted it from the
// payload entirely, so this degrade branch fired on EVERY run and the panel was
// permanently a single reviewer that could never satisfy the quorum.
//
// Defaulting a missing value to "all four" would be a straight cap bypass, so
// degrade to a single reviewer instead (mirrors plan-fanout's fail-safe).
// Unlike fan-out this is a GATE, so a degraded panel will simply fail the quorum
// downstream rather than quietly approving — which is the correct outcome.
const fleetKeysProvided = Array.isArray(input.fleetKeys) && input.fleetKeys.length > 0;
if (!fleetKeysProvided) {
  log('[plan-review] fleetKeys missing/empty — the granted fleet did not reach the'
    + ' workflow. Degrading to a single reviewer (' + PERSPECTIVE_ORDER[0] + ') rather'
    + ' than spawning all ' + PERSPECTIVE_ORDER.length + ': an unverified fleet must not'
    + ' bypass the runaway cap. The quorum will not be satisfiable, which is correct.');
}
const fleetKeys = fleetKeysProvided ? input.fleetKeys : PERSPECTIVE_ORDER.slice(0, 1);

const fleet = CATALOG.filter(function (p) { return fleetKeys.indexOf(p.key) !== -1; });

// M4 axis B — this branch could not fire before the payload carried
// `minRemaining` (cli.js emit-workflow-args now emits it, capped by --granted).
// `budget.total` unset still means "no target was set for this turn", so an
// unmetered run is never gated: that is the pre-existing behaviour and it is
// pinned by test.
const budgetRemaining = budget.remaining();
if (budget.total && budgetRemaining < minRemaining) {
  log('[mccp:plan-review] budget-exhausted: remaining ' + budgetRemaining
    + ' < minRemaining ' + minRemaining + ' — panel not fired');
  return {
    skipped: true, reason: 'budget', coverage: 0, spent: budget.spent(),
    results: [], reviewedPlanHash: reviewedPlanHash,
    // Carry the OBSERVED numbers out. Without them the caller sees only
    // "results: []" and `decide` reports "L2 produced no readable result" — the
    // same message a crashed panel produces. A stop the operator cannot name is
    // a stop they will route around.
    remaining: budgetRemaining, minRemaining: minRemaining,
  };
}
if (fleet.length === 0) {
  log('[mccp:plan-review] no reviewers selected — nothing to fire');
  return {
    skipped: true, reason: 'no-perspectives', coverage: 0, spent: budget.spent(),
    results: [], reviewedPlanHash: reviewedPlanHash,
  };
}

phase('Refute');
const results = await parallel(fleet.map(function (p) {
  return function () {
    return agent(buildPrompt(p, planPath, prdPath, reviewedPlanHash), {
      agentType: p.agentType,
      effort: 'low',
      label: 'review:' + p.key,
      phase: 'Refute',
      schema: SCHEMA,
    });
  };
}));

const spent = budget.spent();
const usable = results.filter(Boolean);
log('[mccp:plan-review] panel returned ' + usable.length + '/' + fleet.length
  + ' reviewer result(s); quorum is decided caller-side');

return {
  skipped: false,
  results: results,
  coverage: usable.length,
  spent: spent,
  reviewedPlanHash: reviewedPlanHash,
};
