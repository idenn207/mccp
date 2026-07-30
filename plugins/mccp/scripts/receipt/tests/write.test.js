'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write, buildReceipt } = require('../write');
const { validate } = require('../schema');
const { subjectHash } = require('../hash');

test('write: minimal valid receipt is written and passes schema', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md',
    '# Plan: feature-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const result = write({
      gate: 'mccp-plan-codex',
      decision: 'feature-x',
      plan: path.relative(repo, plan),
    });
    assert.match(result.path, /\.claude[\\\/]receipts[\\\/]mccp-plan-codex[\\\/]feature-x\.json$/);
    const v = validate(result.receipt);
    assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
    assert.strictEqual(result.receipt.gate_id, 'mccp-plan-codex');
    assert.strictEqual(result.receipt.phase, 'plan');
    assert.strictEqual(result.receipt.decision_id, 'feature-x');
  } finally {
    process.chdir(cwd);
  }
});

test('write: subject_hash and receipt_hash both filled', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan) });
    assert.match(r.receipt.subject_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(r.receipt.receipt_hash, /^sha256:[0-9a-f]{64}$/);
  } finally {
    process.chdir(cwd);
  }
});

test('write: design-doc array properly captured', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const d1 = writeFileSync(repo, '.claude/design/a.design.plan.md', '# A\n');
  const d2 = writeFileSync(repo, '.claude/design/b.design.plan.md', '# B\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'plan-impeccable',
      decision: 'x',
      plan: path.relative(repo, plan),
      'design-doc': [path.relative(repo, d1), path.relative(repo, d2)],
    });
    assert.strictEqual(r.receipt.design_doc_hash.length, 2);
    assert.match(r.receipt.design_doc_hash[0].sha256, /^sha256:[0-9a-f]{64}$/);
  } finally {
    process.chdir(cwd);
  }
});

test('write: MCCP_SKIP_RECEIPT sets meta.skipped=true with reason', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  const prev = process.env.MCCP_SKIP_RECEIPT;
  process.env.MCCP_SKIP_RECEIPT = '1';
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan) });
    assert.strictEqual(r.receipt.meta.skipped, true);
    assert.strictEqual(r.receipt.meta.skip_reason, 'MCCP_SKIP_RECEIPT=1');
  } finally {
    process.chdir(cwd);
    if (prev === undefined) delete process.env.MCCP_SKIP_RECEIPT;
    else process.env.MCCP_SKIP_RECEIPT = prev;
  }
});

test('write: auto-round increments existing round', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r1 = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan), round: 1 });
    assert.strictEqual(r1.receipt.round, 1);
    const r2 = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan), 'auto-round': true });
    assert.strictEqual(r2.receipt.round, 2);
    const r3 = write({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan), 'auto-round': true });
    assert.strictEqual(r3.receipt.round, 3);
  } finally {
    process.chdir(cwd);
  }
});

test('write: rejects unknown gate_id', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    assert.throws(function () {
      write({ gate: 'made-up', decision: 'x', plan: path.relative(repo, plan) });
    }, /invalid --gate/);
  } finally {
    process.chdir(cwd);
  }
});

test('write: rejects missing required flags', function () {
  assert.throws(function () { write({}); }, /--gate is required/);
  assert.throws(function () { write({ gate: 'mccp-plan-codex' }); }, /--decision is required/);
  assert.throws(function () { write({ gate: 'mccp-plan-codex', decision: 'x' }); }, /--plan is required/);
});

test('write: findings-file is read into receipt', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const findings = writeFileSync(repo, '.tmp-findings.json', JSON.stringify([
    { severity: 'HIGH', area: 'arch', description: 'something' },
  ]));
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({
      gate: 'mccp-plan-codex', decision: 'x',
      plan: path.relative(repo, plan),
      'findings-file': path.relative(repo, findings),
    });
    assert.strictEqual(r.receipt.findings.length, 1);
    assert.strictEqual(r.receipt.findings[0].severity, 'HIGH');
  } finally {
    process.chdir(cwd);
  }
});

test('buildReceipt: subject_hash matches recomputation', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const built = buildReceipt({ gate: 'mccp-plan-codex', decision: 'x', plan: path.relative(repo, plan) });
    assert.strictEqual(built.receipt.subject_hash, subjectHash(built.receipt));
  } finally {
    process.chdir(cwd);
  }
});

// v0.3.2 / S12 — escalate-detector integration (Task 5.2)

const stateWriter = require('../../state/state-writer');
const fixTaskMod = require('../../state/fix-task');

function writeCriticalFindings(repo) {
  return writeFileSync(repo, '.claude/findings.json', JSON.stringify([
    { severity: 'CRITICAL', area: 'auth', description: 'token leaked in headers' },
  ]));
}

test('escalate integration: CRITICAL finding fires fix-task + STATE flag', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/escalate-x.plan.md', '# escalate-x\n');
  const findings = writeCriticalFindings(repo);
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({
      gate: 'mccp-plan-codex',
      decision: 'escalate-x',
      plan: path.relative(repo, plan),
      'findings-file': path.relative(repo, findings),
    });
    // fix-task.md exists with escalation section
    const ftPath = fixTaskMod.fixTaskPath(repo);
    assert.ok(fs.existsSync(ftPath), 'fix-task.md should be created');
    const ftBody = fs.readFileSync(ftPath, 'utf8');
    assert.match(ftBody, /## Dual Reviewer Escalation Required/);
    assert.match(ftBody, /verdict: codex_critical/);
    assert.match(ftBody, /escalate: true/);
    // STATE.md escalate_pending=true with matching decision_id
    const st = stateWriter.readState(repo);
    assert.strictEqual(st.frontmatter.escalate_pending, true);
    assert.strictEqual(st.frontmatter.escalate_pending_decision_id, 'escalate-x');
  } finally {
    process.chdir(cwd);
  }
});

test('escalate integration: same receipt twice is idempotent', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/dup-x.plan.md', '# dup-x\n');
  const findings = writeCriticalFindings(repo);
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({
      gate: 'mccp-plan-codex',
      decision: 'dup-x',
      plan: path.relative(repo, plan),
      'findings-file': path.relative(repo, findings),
    });
    const ftPath = fixTaskMod.fixTaskPath(repo);
    const first = fs.readFileSync(ftPath, 'utf8');
    // Second write of equivalent receipt — buildReceipt yields the same
    // receiptPath, so writeOrAppend's de-dup logic should produce a byte-
    // identical fix-task.md after the second call.
    write({
      gate: 'mccp-plan-codex',
      decision: 'dup-x',
      plan: path.relative(repo, plan),
      'findings-file': path.relative(repo, findings),
    });
    const second = fs.readFileSync(ftPath, 'utf8');
    assert.strictEqual(second, first, 'fix-task.md must be unchanged after duplicate escalate write');
    // originating_receipts contains exactly one entry
    const matches = first.match(/^  - .+\.json$/gm) || [];
    assert.strictEqual(matches.length, 1, 'expected exactly 1 originating receipt, got ' + matches.length);
  } finally {
    process.chdir(cwd);
  }
});

test('escalate integration: clean receipt clears escalate_pending for matching decision_id', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/clear-x.plan.md', '# clear-x\n');
  const findings = writeCriticalFindings(repo);
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    // First: trigger escalation
    write({
      gate: 'mccp-plan-codex',
      decision: 'clear-x',
      plan: path.relative(repo, plan),
      'findings-file': path.relative(repo, findings),
    });
    const before = stateWriter.readState(repo);
    assert.strictEqual(before.frontmatter.escalate_pending, true);

    // Second: write a clean receipt (no findings) for the same decision_id
    write({
      gate: 'mccp-implement-codex',
      decision: 'clear-x',
      plan: path.relative(repo, plan),
    });
    const after = stateWriter.readState(repo);
    assert.strictEqual(after.frontmatter.escalate_pending, false,
      'escalate_pending should be cleared by subsequent clean receipt');
    assert.strictEqual(after.frontmatter.escalate_pending_decision_id, null);
  } finally {
    process.chdir(cwd);
  }
});

// ── integrity-unification M3 — pr_codex_force_override write wiring ────────────

const M3_WRITE_REASON =
  'cherry-pick PR whose diff was already adversarially reviewed upstream';

test('write M3: --pr-codex-force-override[-reason] stamps meta + round-trips valid', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md',
    '# Plan: feature-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const result = write({
      gate: 'mccp-pr-codex',
      decision: 'feature-x',
      plan: path.relative(repo, plan),
      'codex-verdict': 'divergent',
      'pr-codex-force-override': true,
      'pr-codex-force-override-reason': M3_WRITE_REASON,
    });
    assert.strictEqual(result.receipt.meta.pr_codex_force_override, true);
    assert.strictEqual(result.receipt.meta.pr_codex_force_override_reason, M3_WRITE_REASON);
    // The real verdict is sealed unchanged (DD3 — override never launders it).
    assert.strictEqual(result.receipt.resolution.codex_verdict, 'divergent');
    assert.strictEqual(validate(result.receipt).ok, true);
  } finally {
    process.chdir(cwd);
  }
});

test('write M3: bad override reason → SCHEMA_INVALID (write REJECT, defense-in-depth)', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md',
    '# Plan: feature-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    assert.throws(function () {
      write({
        gate: 'mccp-pr-codex',
        decision: 'feature-x',
        plan: path.relative(repo, plan),
        'pr-codex-force-override': true,
        'pr-codex-force-override-reason': 'nope',
      });
    }, /schema validation failed|pr_codex_force_override_reason rejected/);
  } finally {
    process.chdir(cwd);
  }
});

test('write M3 [santa-R2]: a non-override receipt OMITS the override fields (present-only, hash stability)', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md',
    '# Plan: feature-x\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const result = write({
      gate: 'mccp-plan-codex',
      decision: 'feature-x',
      plan: path.relative(repo, plan),
    });
    // santa-loop R2 (Codex FAIL): present-only — a normal receipt must not carry the
    // keys at all, so its receipt_hash is bit-identical to a pre-M3 receipt (which
    // also lacked them). An idempotent re-write of a pre-M3 tracked receipt therefore
    // won't trip store.js TRACKED_RECEIPT_OVERWRITE.
    assert.strictEqual('pr_codex_force_override' in result.receipt.meta, false);
    assert.strictEqual('pr_codex_force_override_reason' in result.receipt.meta, false);
  } finally {
    process.chdir(cwd);
  }
});

test('write M3 [santa-R2]: an active override DOES stamp the keys (in-hash, tamper-protected)', function () {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-ov.plan.md',
    '# Plan: feature-ov\n\nbody\n');
  const reason = 'cherry-pick PR whose diff was already adversarially reviewed upstream branch';
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const result = write({
      gate: 'mccp-pr-codex',
      decision: 'feature-ov',
      plan: path.relative(repo, plan),
      'pr-codex-force-override': true,
      'pr-codex-force-override-reason': reason,
    });
    assert.strictEqual(result.receipt.meta.pr_codex_force_override, true);
    assert.strictEqual(result.receipt.meta.pr_codex_force_override_reason, reason);
  } finally {
    process.chdir(cwd);
  }
});

test('write M3 [santa-R2]: present-only override field does NOT perturb receipt_hash of a normal receipt', function () {
  // Directly prove the hash-stability property the fix restores: a receipt without
  // the override keys hashes the SAME as it would pre-M3, and materializing an inert
  // pr_codex_force_override=false WOULD change the hash (which is exactly why the
  // field must be absent, not present-and-false, on the now-tracked corpus).
  const { receiptHash } = require('../hash');
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-h.plan.md',
    '# Plan: feature-h\n\nbody\n');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const result = write({
      gate: 'mccp-plan-codex',
      decision: 'feature-h',
      plan: path.relative(repo, plan),
    });
    const baseHash = result.receipt.receipt_hash;
    // Recompute the stored receipt's hash — it must match (self-consistent, keys absent).
    assert.strictEqual(receiptHash(result.receipt), baseHash);
    // Now materialize the inert field the way pre-fix code did; the hash MUST change,
    // demonstrating why present-and-false broke the tracked-corpus hash stability.
    const perturbed = JSON.parse(JSON.stringify(result.receipt));
    perturbed.meta.pr_codex_force_override = false;
    perturbed.meta.pr_codex_force_override_reason = null;
    assert.notStrictEqual(receiptHash(perturbed), baseHash);
  } finally {
    process.chdir(cwd);
  }
});
