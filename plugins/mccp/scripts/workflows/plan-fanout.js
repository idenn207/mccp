export const meta = {
  name: 'mccp-plan-fanout',
  description: 'Read-only multi-perspective fan-out for /mccp:plan GROUND (M1).',
  phases: [
    { title: 'Fan-out', detail: 'spawn read-only perspective agents in parallel' },
    { title: 'Synthesize', detail: 'deterministic markdown assembly of perspective results' },
  ],
};

// Self-contained by necessity: the Workflow execution sandbox exposes no
// `require`/Node module access (Workflow runtime contract: "No filesystem or
// Node.js API access"), so this script inlines FAITHFUL PORTS of the TESTED
// plan-fanout/* oracles rather than importing them:
//   - CATALOG      ← lib/plan-fanout/perspectives.js  PERSPECTIVES
//   - SCHEMA       ← lib/plan-fanout/perspectives.js  PERSPECTIVE_SCHEMA
//   - buildPrompt  ← lib/plan-fanout/perspectives.js  buildPerspectivePrompt
//   - synthesize   ← lib/plan-fanout/synthesize.js    synthesizeFanout
//   - budget guard ← lib/plan-fanout/budget.js        shouldSkipForBudget
// Those libs stay the unit-tested reference implementations; budget.js
// resolveFanout additionally runs caller-side (plan.md Phase 2.5) as the
// run/skip gate. Keep the ports in sync when either side changes.
//
// No Date.now()/Math.random()/new Date() (they throw in the Workflow sandbox).

const CATALOG = [
  { key: 'architect', agentType: 'mccp:fanout-architect', lens: '구조·확장성·경계' },
  { key: 'security', agentType: 'mccp:fanout-security', lens: '공격면·데이터' },
  { key: 'test', agentType: 'mccp:fanout-test', lens: '검증 전략·테스트 가능성' },
  { key: 'explorer', agentType: 'mccp:fanout-explorer', lens: '기존 코드 추적·재사용' },
];

const SCHEMA = {
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
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        },
      },
    },
    metaGaps: { type: 'array', items: { type: 'string' } },
    patternsToMirror: { type: 'array', items: { type: 'string' } },
  },
};

const PERSPECTIVE_ORDER = ['architect', 'security', 'test', 'explorer'];
const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function buildPrompt(p, prdPath, planPath) {
  return [
    'You are the "' + p.key + '" read-only perspective (lens: ' + p.lens + ')',
    'in a /mccp:plan multi-perspective fan-out. Investigate the plan and codebase',
    'through your lens ONLY and return structured findings.',
    '',
    '── INPUTS ──',
    'Source PRD:  ' + (prdPath || '(none — free-form plan)'),
    'Draft plan:  ' + (planPath || '(draft plan not yet written)'),
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

function severityRank(s) {
  const r = SEVERITY_RANK[String(s || '').toUpperCase()];
  return r === undefined ? 4 : r;
}
function perspectiveRank(k) {
  const r = PERSPECTIVE_ORDER.indexOf(String(k || ''));
  return r === -1 ? PERSPECTIVE_ORDER.length : r;
}
function fmtTokens(n) {
  return (Number.isFinite(n) && n > 0) ? '~' + Math.round(n / 1000) + 'k' : 'n/a';
}
function uniq(list) {
  const seen = {};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = String(list[i]);
    if (s.trim() === '' || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out;
}

// synthesize — faithful port of lib/plan-fanout/synthesize.js synthesizeFanout.
function synthesize(results, spent, budgetTotal) {
  const perspectives = (Array.isArray(results) ? results : []).filter(Boolean);
  const HEAD = '## Multi-Perspective Fan-out';
  if (perspectives.length === 0) {
    return HEAD + '\n\n> fan-out yielded no perspectives — inline grounding used.\n';
  }
  const covered = perspectives.map(function (p) {
    return (p && p.perspective) ? String(p.perspective) : '(unknown)';
  });
  const tagged = [];
  perspectives.forEach(function (p) {
    const key = (p && p.perspective) ? String(p.perspective) : '(unknown)';
    const fs = Array.isArray(p && p.findings) ? p.findings : [];
    fs.forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      tagged.push({
        key: key,
        claim: String(f.claim || '').trim(),
        evidence: String(f.evidence || '').trim(),
        severity: String(f.severity || 'UNKNOWN').toUpperCase(),
      });
    });
  });
  tagged.sort(function (a, b) {
    const s = severityRank(a.severity) - severityRank(b.severity);
    return s !== 0 ? s : perspectiveRank(a.key) - perspectiveRank(b.key);
  });
  const tag = function (p, s) { return String(s) + '  _(' + (p.perspective || '?') + ')_'; };
  const gaps = uniq(perspectives.reduce(function (acc, p) {
    const g = Array.isArray(p && p.metaGaps) ? p.metaGaps : [];
    return acc.concat(g.map(function (x) { return tag(p, x); }));
  }, []));
  const pats = uniq(perspectives.reduce(function (acc, p) {
    const g = Array.isArray(p && p.patternsToMirror) ? p.patternsToMirror : [];
    return acc.concat(g.map(function (x) { return tag(p, x); }));
  }, []));
  const budgetSuffix = (Number.isFinite(budgetTotal) && budgetTotal > 0)
    ? ' / budget ' + fmtTokens(budgetTotal) : '';
  const lines = [];
  lines.push(HEAD, '', '<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->', '');
  lines.push('**Coverage**: ' + perspectives.length + '/4 perspectives (' + covered.join(', ') +
    ') · spent ' + fmtTokens(spent) + budgetSuffix + '.', '');
  lines.push('### Findings (severity-ranked)', '');
  if (tagged.length === 0) {
    lines.push('- (no findings surfaced)');
  } else {
    tagged.forEach(function (f) {
      lines.push('- **[' + f.severity + '][' + f.key + ']** ' + f.claim + (f.evidence ? ' — ' + f.evidence : ''));
    });
  }
  lines.push('', '### Meta-gaps', '');
  if (gaps.length === 0) lines.push('- (none surfaced)');
  else gaps.forEach(function (g) { lines.push('- ' + g); });
  lines.push('', '### Patterns to mirror', '');
  if (pats.length === 0) lines.push('- (none surfaced)');
  else pats.forEach(function (g) { lines.push('- ' + g); });
  lines.push('');
  return lines.join('\n');
}

// ── Workflow body ──────────────────────────────────────────────────────────
const input = args || {};
const prdPath = input.prdPath || null;
const planPath = input.planPath || null;
const minRemaining = Number.isFinite(input.minRemaining) ? input.minRemaining : 0;
const budgetTotal = Number.isFinite(input.budgetTotal) ? input.budgetTotal : null;
// v1.22.3 M3 (Implement-Codex R1 F3) — fleetKeys carries the fleet that
// reserveWorkers actually GRANTED, so defaulting a missing value to "all four"
// is the exact runaway-cap bypass M3 exists to close: a command-body
// substitution miss, a tool-call serialization drift, or any future caller that
// omits the arg would spawn four workers after the reserve granted one.
// Fail SAFE instead of fail-open — degrade to the conservative single-worker
// prefix rather than silently restoring the full fleet. (Not a hard skip: the
// fan-out is a GROUND enhancement and must never block the plan.)
const fleetKeysProvided = Array.isArray(input.fleetKeys) && input.fleetKeys.length > 0;
if (!fleetKeysProvided) {
  log('[plan-fanout] fleetKeys missing/empty — the granted fleet did not reach the'
    + ' workflow. Degrading to a single perspective (' + PERSPECTIVE_ORDER[0] + ') rather'
    + ' than spawning all ' + PERSPECTIVE_ORDER.length + ': an unverified fleet must not'
    + ' bypass the runaway cap.');
}
const fleetKeys = fleetKeysProvided ? input.fleetKeys : PERSPECTIVE_ORDER.slice(0, 1);

const fleet = CATALOG.filter(function (p) { return fleetKeys.indexOf(p.key) !== -1; });

// Codex F2 — budget pre-guard. When a +Nk target is set (budget.total) and the
// remaining pool cannot cover the whole fleet, skip WITHOUT spawning a single
// agent. budget.total is null when no target is set → the structural caps
// (fixed fleet size + effort:'low') are the only ceiling and we proceed.
if (budget.total && budget.remaining() < minRemaining) {
  log('[mccp:plan-fanout] budget-exhausted skip: remaining ' + budget.remaining()
    + ' < minRemaining ' + minRemaining);
  return {
    skipped: true, reason: 'budget', coverage: 0, spent: budget.spent(),
    results: [], markdown: synthesize([], budget.spent(), budgetTotal),
  };
}
if (fleet.length === 0) {
  log('[mccp:plan-fanout] no perspectives selected — nothing to fan out');
  return {
    skipped: true, reason: 'no-perspectives', coverage: 0, spent: budget.spent(),
    results: [], markdown: synthesize([], budget.spent(), budgetTotal),
  };
}

phase('Fan-out');
const results = await parallel(fleet.map(function (p) {
  return function () {
    return agent(buildPrompt(p, prdPath, planPath), {
      agentType: p.agentType,
      effort: 'low',
      label: 'fanout:' + p.key,
      phase: 'Fan-out',
      schema: SCHEMA,
    });
  };
}));

phase('Synthesize');
const spent = budget.spent();
return {
  skipped: false,
  results: results,
  coverage: results.filter(Boolean).length,
  spent: spent,
  markdown: synthesize(results, spent, budgetTotal),
};
