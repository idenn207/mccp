'use strict';

// Task 11 — 4-axis receipt meta state matrix invariants (R3 finding #2).
//
// Axes: codex_skipped × security_skipped × advisory × security_force_override.
// Each combination has a defined verdict, and one combination is an explicit
// schema-reject invariant (security_skipped + security_force_override).
//
// Precedence (most-strict first):
//   codex_skipped > security_skipped > advisory > force_override
//
// This test pins all 7 documented combinations from the plan body matrix,
// plus the schema-reject invariant, plus precedence assertions.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');
const { validate } = require('../schema');
const { validateCommand } = require('../validate-cmd');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  return { repo, plan, planRel: path.relative(repo, plan) };
}

// Helper: write an implement-codex receipt with the given meta flags. Returns
// the validateCommand result against /mccp:pr (which checks plan-codex +
// implement-codex preceding gates).
function writeImplementWithFlags(repo, planRel, flags) {
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write(Object.assign({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
    }, flags));
    return validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
  } finally {
    process.chdir(cwd);
  }
}

test('matrix row 1: all-false → approving (default)', () => {
  const { repo, planRel } = setupRepo();
  const r = writeImplementWithFlags(repo, planRel, {});
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.blocking.length, 0);
  assert.strictEqual(r.warnings.length, 0);
});

test('matrix row 2: codex_skipped=true → blocking (wins over other axes)', () => {
  const { repo, planRel } = setupRepo();
  const r = writeImplementWithFlags(repo, planRel, {
    'codex-skipped': true,
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.some((b) => /codex_skipped/.test(b.reason)));
});

test('matrix row 3a: security_skipped=true on strict gate (implement) → blocking', () => {
  const { repo, planRel } = setupRepo();
  const r = writeImplementWithFlags(repo, planRel, {
    'security-skipped': true,
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.blocking.some((b) => b.gate_id === 'mccp-implement-codex' && /security_skipped/.test(b.reason)));
});

test('matrix row 3b: security_skipped=true on lenient gate (plan) → warning, not blocking', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({
      gate: 'mccp-plan-codex',
      decision: 'feature-x',
      plan: planRel,
      'security-skipped': true,
    });
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(r.warnings.some((w) => w.gate_id === 'mccp-plan-codex' && /security_skipped/.test(w.reason)));
  } finally {
    process.chdir(cwd);
  }
});

test('matrix row 4: security_force_override=true alone → warning, not blocking', () => {
  const { repo, planRel } = setupRepo();
  const r = writeImplementWithFlags(repo, planRel, {
    'security-force-override': true,
    'security-force-override-reason': 'audited override',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(r.warnings.some((w) => /MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER/.test(w.reason)));
});

test('matrix row 5: schema invariant — security_skipped=true AND force_override=true → SCHEMA REJECT', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    assert.throws(
      () => write({
        gate: 'mccp-implement-codex',
        decision: 'feature-x',
        plan: planRel,
        'security-skipped': true,
        'security-force-override': true,
        'security-force-override-reason': 'override',
      }),
      (err) => {
        // Schema validation failure throws a SCHEMA_INVALID error.
        return err.code === 'SCHEMA_INVALID' &&
          err.errors.some((e) => /cannot both be true/.test(e));
      },
    );
  } finally {
    process.chdir(cwd);
  }
});

test('matrix row 6: codex_skipped wins over security_skipped (precedence)', () => {
  const { repo, planRel } = setupRepo();
  const r = writeImplementWithFlags(repo, planRel, {
    'codex-skipped': true,
    'security-skipped': true,
  });
  assert.strictEqual(r.ok, false);
  // Both blockers surface; codex_skipped reason appears first by enforcement order.
  const codexBlock = r.blocking.find((b) => /codex_skipped/.test(b.reason));
  const securityBlock = r.blocking.find((b) => /security_skipped/.test(b.reason));
  assert.ok(codexBlock, 'codex_skipped present');
  assert.ok(securityBlock, 'security_skipped present');
});

test('matrix row 7: schema invariant fires on direct validate() call (no CLI layer)', () => {
  const minimal = {
    schema_version: 'v1',
    gate_id: 'mccp-implement-codex',
    phase: 'implement',
    decision_id: 'feature-x',
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64),
    receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z',
      command: '/mccp:prp-implement',
      cwd: '/x',
      git_branch: 'main',
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
      advisory: false,
      security_skipped: true,
      security_skip_reason: 'auto-fallback',
      security_force_override: true,
      security_force_override_reason: 'override',
      impeccable_skipped: false,
      impeccable_skip_reason: null,
      impeccable_force_override: false,
      impeccable_force_override_reason: null,
    },
  };
  const r = validate(minimal);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /cannot both be true/.test(e)),
    'invariant must fire at schema layer: ' + JSON.stringify(r.errors));
});

test('matrix row 8: schema-valid baseline (all new fields default false) accepts cleanly', () => {
  const minimal = {
    schema_version: 'v1',
    gate_id: 'mccp-implement-codex',
    phase: 'implement',
    decision_id: 'feature-x',
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64),
    receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z',
      command: '/mccp:prp-implement',
      cwd: '/x',
      git_branch: 'main',
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
      advisory: false,
      security_skipped: false,
      security_skip_reason: null,
      security_force_override: false,
      security_force_override_reason: null,
      impeccable_skipped: false,
      impeccable_skip_reason: null,
      impeccable_force_override: false,
      impeccable_force_override_reason: null,
    },
  };
  const r = validate(minimal);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
});

test('matrix: missing security_skipped field → schema reject (it is now required)', () => {
  // Receipts that predate v0.2.4 lacking the security_skipped field are invalid.
  // makeSkeleton fills it in for new writes; this test asserts the schema
  // requires it on validate() (no silent default).
  const v = {
    schema_version: 'v1',
    gate_id: 'mccp-implement-codex',
    phase: 'implement',
    decision_id: 'feature-x',
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64),
    receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z',
      command: '/x',
      cwd: '/x',
      git_branch: 'main',
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
      advisory: false,
      // security_skipped omitted
      security_force_override: false,
      security_force_override_reason: null,
    },
  };
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /security_skipped/.test(e)),
    'security_skipped must be required: ' + JSON.stringify(r.errors));
});

// === Milestone 1 Task 1.4 — impeccable axis (Codex R1 F1 absorption) ===
//
// 6-axis is expressed as 4 security_* + 4 impeccable_* fields on the same
// primary codex receipt meta (no separate namespace). Cross-namespace combos
// are ALLOWED — they represent legitimate concurrent states. Same-namespace
// invariant (skipped + force_override) → SCHEMA REJECT for both.

test('matrix row 10: impeccable_skipped=true on strict gate (implement) → blocking', () => {
  const { mkTmpRepo, writeFileSync } = require('./helpers');
  const { write } = require('../write');
  const { validateCommand } = require('../validate-cmd');
  const path = require('path');
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# x\n');
  const planRel = path.relative(repo, plan);
  const cwd = process.cwd(); process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    write({ gate: 'mccp-implement-codex', decision: 'feature-x', plan: planRel,
      'impeccable-skipped': true, 'impeccable-skip-reason': 'skill-missing' });
    const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.blocking.some((b) => b.gate_id === 'mccp-implement-codex' && /impeccable_skipped/.test(b.reason)));
  } finally { process.chdir(cwd); }
});

test('matrix row 11: impeccable_skipped=true on lenient gate (plan) → warning', () => {
  const { mkTmpRepo, writeFileSync } = require('./helpers');
  const { write } = require('../write');
  const { validateCommand } = require('../validate-cmd');
  const path = require('path');
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# x\n');
  const planRel = path.relative(repo, plan);
  const cwd = process.cwd(); process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel,
      'impeccable-skipped': true, 'impeccable-skip-reason': 'skill-missing' });
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true);
    assert.ok(r.warnings.some((w) => /impeccable_skipped/.test(w.reason)));
  } finally { process.chdir(cwd); }
});

test('matrix row 12: same-namespace invariant — impeccable_skipped + impeccable_force_override → SCHEMA REJECT', () => {
  const minimal = {
    schema_version: 'v1', gate_id: 'mccp-implement-codex', phase: 'implement',
    decision_id: 'feature-x', task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64), design_doc_hash: [],
    base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64), receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z', command: '/x', cwd: '/x', git_branch: 'main',
      skipped: false, skip_reason: null, codex_skipped: false, advisory: false,
      security_skipped: false, security_skip_reason: null,
      security_force_override: false, security_force_override_reason: null,
      impeccable_skipped: true, impeccable_skip_reason: 'fallback',
      impeccable_force_override: true,
      impeccable_force_override_reason: 'Bypass impeccable for the duration of release-window today because Skill registry probe returns missing in CI sandbox',
    },
  };
  const r = validate(minimal);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /impeccable_skipped \+ meta\.impeccable_force_override cannot both be true/.test(e)),
    'impeccable same-namespace invariant must fire: ' + JSON.stringify(r.errors));
});

test('matrix row 13: CROSS-namespace ALLOWED — security_skipped + impeccable_force_override (different gates)', () => {
  const minimal = {
    schema_version: 'v1', gate_id: 'mccp-pr-codex', phase: 'pr',
    decision_id: 'feature-x', task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64), design_doc_hash: [],
    base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64), receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z', command: '/x', cwd: '/x', git_branch: 'main',
      skipped: false, skip_reason: null, codex_skipped: false, advisory: false,
      security_skipped: true, security_skip_reason: 'agent not found',
      security_force_override: false, security_force_override_reason: null,
      impeccable_skipped: false, impeccable_skip_reason: null,
      impeccable_force_override: true,
      impeccable_force_override_reason: 'Override impeccable while CI lacks Skill registry access during the rollout window approved by team',
    },
  };
  const r = validate(minimal);
  assert.strictEqual(r.ok, true, 'cross-namespace combo must be allowed: ' + JSON.stringify(r.errors));
});

test('matrix row 14: CROSS-namespace ALLOWED — impeccable_skipped + security_force_override', () => {
  const minimal = {
    schema_version: 'v1', gate_id: 'mccp-pr-codex', phase: 'pr',
    decision_id: 'feature-x', task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64), design_doc_hash: [],
    base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64), receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z', command: '/x', cwd: '/x', git_branch: 'main',
      skipped: false, skip_reason: null, codex_skipped: false, advisory: false,
      security_skipped: false, security_skip_reason: null,
      security_force_override: true, security_force_override_reason: 'lenient namespace, no strict validator yet',
      impeccable_skipped: true, impeccable_skip_reason: 'skill-missing',
      impeccable_force_override: false, impeccable_force_override_reason: null,
    },
  };
  const r = validate(minimal);
  assert.strictEqual(r.ok, true, 'cross-namespace combo must be allowed: ' + JSON.stringify(r.errors));
});

test('matrix row 15: missing impeccable_skipped field → schema reject (required after v0.2.6)', () => {
  const v = {
    schema_version: 'v1', gate_id: 'mccp-implement-codex', phase: 'implement',
    decision_id: 'feature-x', task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64), design_doc_hash: [],
    base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + '1'.repeat(64), receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z', command: '/x', cwd: '/x', git_branch: 'main',
      skipped: false, skip_reason: null, codex_skipped: false, advisory: false,
      security_skipped: false, security_skip_reason: null,
      security_force_override: false, security_force_override_reason: null,
      // impeccable_skipped omitted
      impeccable_force_override: false, impeccable_force_override_reason: null,
    },
  };
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /impeccable_skipped/.test(e)),
    'impeccable_skipped must be required: ' + JSON.stringify(r.errors));
});

test('matrix row 9: advisory axis is writeable via --advisory flag (Codex Round 1 F1)', () => {
  // Previously meta.advisory was checked by validate-cmd but the receipt
  // writer had no way to set it. That left an MCCP_ALLOW_CODEX_UNAVAILABLE
  // advisory path silently producing approving receipts unless --codex-skipped
  // was also passed. Now --advisory is first-class.
  const { mkTmpRepo, writeFileSync } = require('./helpers');
  const { write } = require('../write');
  const { validateCommand } = require('../validate-cmd');
  const path = require('path');

  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  const planRel = path.relative(repo, plan);
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const r = write({
      gate: 'mccp-implement-codex',
      decision: 'feature-x',
      plan: planRel,
      'advisory': true,
    });
    assert.strictEqual(r.receipt.meta.advisory, true);
    const v = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(v.ok, false, 'advisory implement receipt must block /mccp:pr');
    assert.ok(v.blocking.some((b) => /advisory/.test(b.reason)),
      'blocking[] must surface advisory: ' + JSON.stringify(v.blocking));
  } finally {
    process.chdir(cwd);
  }
});
