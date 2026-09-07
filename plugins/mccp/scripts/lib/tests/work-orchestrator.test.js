'use strict';

// v0.3.1 Milestone 4 — work-orchestrator unit tests.
// Pattern mirror: auto-chain.test.js freshHome() + try/finally.

const test = require('node:test');
const assert = require('node:assert');

const orch = require('../work-orchestrator');

function diff(files, totalLoc, body, newFiles) {
  return {
    files: files,
    totalLoc: totalLoc,
    newFiles: newFiles || [],
    body: body || '',
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Trivial heuristic matrix (10 cases)
// ──────────────────────────────────────────────────────────────────────────

test('classifyTrivial: typo-fix single .md, 1 LOC → trivial', () => {
  const r = orch.classifyTrivial(diff(['README.md'], 1, '- old\n+ new\n'), {});
  assert.strictEqual(r.type, 'trivial');
  assert.strictEqual(r.reason, 'heuristic-passed');
});

test('classifyTrivial: README-only edit, 5 LOC → trivial', () => {
  const r = orch.classifyTrivial(diff(['README.md'], 5, 'minor wording'), {});
  assert.strictEqual(r.type, 'trivial');
});

test('classifyTrivial: 2 files where one has no extension (NOTICE) → full', () => {
  const r = orch.classifyTrivial(diff(['CLAUDE.md', 'NOTICE'], 18, 'doc update'), {});
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'non-trivial-extension');
});

test('classifyTrivial: 2 whitelisted docs files, 18 LOC → trivial', () => {
  const r = orch.classifyTrivial(diff(['CLAUDE.md', 'README.md'], 18, 'doc update'), {});
  assert.strictEqual(r.type, 'trivial');
  assert.strictEqual(r.reason, 'heuristic-passed');
});

test('classifyTrivial: json-config-only, small → trivial', () => {
  const r = orch.classifyTrivial(diff(['config.json'], 3, '"value": 1'), {});
  assert.strictEqual(r.type, 'trivial');
});

test('classifyTrivial: source code change → full (signature detected)', () => {
  const body = '+function newThing() { return 1; }';
  const r = orch.classifyTrivial(diff(['file.md'], 5, body), {});
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'source-code-signature');
});

test('classifyTrivial: large diff (50 LOC) → full', () => {
  const r = orch.classifyTrivial(diff(['big.md'], 50, 'long content'), {});
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'too-many-loc');
});

test('classifyTrivial: new file present → full', () => {
  const r = orch.classifyTrivial(diff(['existing.md'], 5, 'minor', ['brand-new.md']), {});
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'new-files-present');
});

test('classifyTrivial: mixed extension (.md + .js) → full', () => {
  const r = orch.classifyTrivial(diff(['notes.md', 'script.js'], 10, 'mixed'), {});
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'non-trivial-extension');
});

test('classifyTrivial: empty diff → full', () => {
  const r = orch.classifyTrivial(diff([], 0, ''), {});
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'empty-diff');
});

test('classifyTrivial: malformed diff (parseError) → full', () => {
  const r = orch.classifyTrivial({ parseError: 'git-diff-failed: corrupt' }, {});
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'diff-parse-failed');
});

// ──────────────────────────────────────────────────────────────────────────
// Override precedence (3 cases)
// ──────────────────────────────────────────────────────────────────────────

test('classifyTrivial: forceTrivial wins over non-trivial heuristic', () => {
  const r = orch.classifyTrivial(diff(['big.js'], 100, 'class X{}'), { forceTrivial: true });
  assert.strictEqual(r.type, 'trivial');
  assert.strictEqual(r.reason, 'user-override-trivial');
});

test('classifyTrivial: forceFull wins over trivial heuristic', () => {
  const r = orch.classifyTrivial(diff(['README.md'], 1, 'tiny'), { forceFull: true });
  assert.strictEqual(r.type, 'full');
  assert.strictEqual(r.reason, 'user-override-full');
});

test('classifyTrivial: both forceTrivial + forceFull → forceTrivial wins (spec precedence)', () => {
  const r = orch.classifyTrivial(diff(['x.md'], 5, 'x'), { forceTrivial: true, forceFull: true });
  assert.strictEqual(r.type, 'trivial');
  assert.strictEqual(r.reason, 'user-override-trivial');
});

// ──────────────────────────────────────────────────────────────────────────
// State machine transitions (4 cases)
// ──────────────────────────────────────────────────────────────────────────

test('nextStep: trivial init → commit', () => {
  const r = orch.nextStep('init', { type: 'trivial', skipCostCheck: true });
  // commit has no validateCommand so should not halt regardless of receipt state
  assert.strictEqual(r.step, 'commit');
  assert.strictEqual(r.slash_command, '/mccp:prp-commit');
  assert.strictEqual(r.halt, false);
});

test('nextStep: full init → plan_prd (no PRD provided)', () => {
  const r = orch.nextStep('init', { type: 'full', skipCostCheck: true });
  assert.strictEqual(r.step, 'plan_prd');
  assert.strictEqual(r.slash_command, '/mccp:plan-prd');
});

test('nextStep: full init with --prd → plan (skip plan_prd)', () => {
  const r = orch.nextStep('init', { type: 'full', prdProvided: true, skipCostCheck: true });
  assert.strictEqual(r.step, 'plan');
  assert.strictEqual(r.slash_command, '/mccp:plan');
});

test('nextStep: unknown state → halt with unknown-state trigger', () => {
  const r = orch.nextStep('bogus', { type: 'full', skipCostCheck: true });
  assert.strictEqual(r.halt, true);
  assert.ok(r.reasons.some(x => x.trigger === 'unknown-state'));
});

// ──────────────────────────────────────────────────────────────────────────
// Done state (1 extra integrity case)
// ──────────────────────────────────────────────────────────────────────────

test('nextStep: trivial pr → done', () => {
  const r = orch.nextStep('pr', { type: 'trivial', skipCostCheck: true });
  assert.strictEqual(r.step, 'done');
  assert.strictEqual(r.halt, false);
});

// ──────────────────────────────────────────────────────────────────────────
// orchestrator-step-wiring M2 — 신규 서브커맨드가 기존 계약을 깨지 않는다
// ──────────────────────────────────────────────────────────────────────────

test('M2: the halt surface is additive — classify/next-step exports are unchanged', () => {
  ['classifyTrivial', 'nextStep', 'readGitDiff', 'FULL_CHAIN', 'TRIVIAL_CHAIN',
    'STEP_TO_SLASH', 'ABORT_EXIT', 'TEMPFAIL_EXIT'].forEach((k) => {
    assert.ok(k in orch, 'pre-M2 export vanished: ' + k);
  });
  assert.strictEqual(typeof orch.classifyTrivial, 'function');
  assert.strictEqual(typeof orch.nextStep, 'function');
});

test('M2: HALT_STEPS is the DD7 enum and every chain step it names is real', () => {
  assert.deepStrictEqual(orch.HALT_STEPS,
    ['detect', 'plan_prd', 'plan', 'implement', 'verify', 'commit', 'pr']);
  // `detect` 와 `verify` 는 FULL_CHAIN 의 상태 이름이 아니라 halt 가 일어나는
  // phase 이름이다 — 나머지는 체인 상태와 같은 어휘를 쓴다. 그 교집합이 곧 A1
  // corpus 와의 조인 지점이므로 어휘가 갈라지면 조인이 조용히 깨진다.
  ['plan_prd', 'plan', 'implement', 'commit', 'pr'].forEach((s) => {
    assert.ok(orch.FULL_CHAIN.includes(s), 'chain vocabulary drifted for: ' + s);
  });
});

test('M2: the site regex accepts the wired slugs and rejects path-ish input', () => {
  ['3.preflight', '3.wp.no-return', '0.dirty-tree', '2t.commit'].forEach((s) => {
    assert.ok(orch.HALT_SITE_RE.test(s), 'must accept wired slug: ' + s);
  });
  ['../escape', 'has/slash', 'UPPER', '', 'a'.repeat(41), '-leading'].forEach((s) => {
    assert.ok(!orch.HALT_SITE_RE.test(s), 'must reject: ' + JSON.stringify(s));
  });
});
