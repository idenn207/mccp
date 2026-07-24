'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write, restampGroundingVerdict } = require('../write');
const { validateCommand } = require('../validate-cmd');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-x.plan.md', '# feature x\n\nbody\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

test('validate-cmd: unknown command → ok with reason', function () {
  const { repo } = setupRepo();
  const r = validateCommand('/mccp:nonsense', { cwd: repo });
  assert.strictEqual(r.ok, true);
  assert.match(r.reason, /out-of-scope/);
});

test('validate-cmd: prp-implement without plan-codex receipt → blocked (missing)', function () {
  const { repo } = setupRepo();
  const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.missing.length, 1);
  assert.strictEqual(r.missing[0].gate_id, 'mccp-plan-codex');
});

test('validate-cmd: prp-implement with plan-codex receipt → ok', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: stale plan_hash → blocked (stale)', function () {
  const { repo, planRel, plan } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    fs.appendFileSync(plan, '\n\nNew content added after receipt was written\n');
    const r = validateCommand('/mccp:prp-implement', {
      cwd: repo,
      decisionId: 'feature-x',
      planPath: planRel,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.stale.length, 1);
    assert.match(r.stale[0].reason, /plan file hash differs/);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: tampered subject_hash → blocking (subject-tamper, NOT stale)', function () {
  // M2 Task 1 (integrity-unification) — a subject_hash mismatch is a post-seal
  // alteration of the receipt's own SUBJECT_FIELDS (tamper), not plan staleness.
  // It MUST classify as blocking(kind='subject-tamper'), never stale: stale routes
  // preflight to "regenerate STALE", which would overwrite (destroy) the evidence.
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    raw.task_id = 'tampered-after-signing';
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.blocking.length, 1, JSON.stringify(result));
    assert.strictEqual(result.blocking[0].kind, 'subject-tamper');
    assert.match(result.blocking[0].reason, /subject_hash mismatch/);
    assert.strictEqual(result.stale.length, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: open CRITICAL question → blocked', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const resolutionFile = writeFileSync(repo, '.tmp-res.json', JSON.stringify({
      converged: false, rounds: 1, accepted: [], rejected: [],
      open_questions: [{ item: 'unresolved critical', severity: 'CRITICAL' }],
    }));
    const r = write({
      gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel,
      'resolution-file': path.relative(repo, resolutionFile),
    });
    // Re-sign after tampering with json since we wrote it through full pipeline already
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.open_critical.length, 1);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: pr requires both plan-codex AND implement-codex', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    let r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.missing.length, 1);
    assert.strictEqual(r.missing[0].gate_id, 'mccp-implement-codex');

    write({ gate: 'mccp-implement-codex', decision: 'feature-x', plan: planRel });
    r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: skipped preceding gate is treated as blocking', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  const prev = process.env.MCCP_SKIP_RECEIPT;
  process.chdir(repo);
  try {
    process.env.MCCP_SKIP_RECEIPT = '1';
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    delete process.env.MCCP_SKIP_RECEIPT;
    const r = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.blocking.length >= 1);
    assert.match(r.blocking[0].reason, /skipped/);
  } finally {
    process.chdir(cwd);
    if (prev === undefined) delete process.env.MCCP_SKIP_RECEIPT;
    else process.env.MCCP_SKIP_RECEIPT = prev;
  }
});

// v0.2.2 Task 4 — codex_skipped + advisory mode receipts are non-approving (R1#2 hollow-gate fix).

test('validate-cmd: receipt with meta.codex_skipped=true is non-approving', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel, 'codex-skipped': true });
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false, JSON.stringify(result));
    assert.ok(result.blocking.length >= 1);
    assert.match(result.blocking[0].reason, /codex_skipped/);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: receipt with meta.advisory=true is non-approving', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    // Hand-edit advisory flag (no CLI flag for this yet — set by future wrappers)
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    raw.meta.advisory = true;
    // Re-seal BOTH digests so this simulates a legitimately-written advisory
    // receipt. P5 receipt_hash tamper-detect now recomputes receipt_hash over
    // meta; re-signing only subject_hash would trip the tamper check (blocking,
    // continue) before the advisory rule below could run.
    const { subjectHash, receiptHash } = require('../hash');
    raw.subject_hash = subjectHash(raw);
    raw.receipt_hash = receiptHash(raw);
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false, JSON.stringify(result));
    assert.ok(result.blocking.some(b => /advisory/.test(b.reason)));
  } finally {
    process.chdir(cwd);
  }
});

// P5 (audit-remediation) — receipt_hash tamper-detect. subject_hash only covers
// SUBJECT_FIELDS; post-seal mutation of findings/resolution/meta must surface as
// blocking(kind='receipt-tamper'), NOT stale (stale routes to "regenerate",
// which would overwrite the tampered receipt and destroy the evidence).

test('validate-cmd: tampered findings → blocking (receipt-tamper)', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    // Schema-valid finding shape (severity/area/description all required) so the
    // injection passes the schema gate (L242) and reaches the receipt_hash check.
    raw.findings.push({ severity: 'CRITICAL', area: 'injected', description: 'injected after signing' });
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false, JSON.stringify(result));
    assert.strictEqual(result.blocking.length, 1, JSON.stringify(result));
    assert.strictEqual(result.blocking[0].kind, 'receipt-tamper');
    assert.match(result.blocking[0].reason, /receipt_hash mismatch/);
    assert.strictEqual(result.stale.length, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: tampered resolution.codex_verdict → blocking (receipt-tamper)', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    // Written with the real dual-review verdict (P1 field) sealed into receipt_hash.
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel, 'codex-verdict': 'converged' });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    assert.strictEqual(raw.resolution.codex_verdict, 'converged');
    raw.resolution.codex_verdict = 'divergent';  // flip the integrity field after signing
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false, JSON.stringify(result));
    assert.strictEqual(result.blocking.length, 1, JSON.stringify(result));
    assert.strictEqual(result.blocking[0].kind, 'receipt-tamper');
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: tampered meta.command → blocking (receipt-tamper)', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    raw.meta.command = '/tampered';
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false, JSON.stringify(result));
    assert.strictEqual(result.blocking.length, 1, JSON.stringify(result));
    assert.strictEqual(result.blocking[0].kind, 'receipt-tamper');
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: subject-field tamper wins as subject-tamper (pre-empts receipt-tamper via continue)', function () {
  // M2 Task 1 — altering a SUBJECT_FIELD trips subject_hash FIRST; that block now
  // `continue`s with blocking(subject-tamper), so the downstream receipt_hash
  // receipt-tamper block is never reached. Both are integrity failures; the
  // subject block just pre-empts.
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    raw.task_id = 'tampered-after-signing';  // a SUBJECT_FIELD → subject_hash catches first
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.blocking.length, 1, JSON.stringify(result));
    assert.strictEqual(result.blocking[0].kind, 'subject-tamper');
    assert.match(result.blocking[0].reason, /subject_hash mismatch/);
    assert.strictEqual(result.stale.length, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: briefing/ledger carve-out mutation does NOT false-positive as tamper', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    // briefing_* + ledger_write_skipped are stamped AFTER the canonical hash and
    // carved out of receiptHash — post-seal mutation must NOT trip tamper-detect.
    raw.meta.briefing_summary = 'post-seal briefing text';
    raw.meta.briefing_token_count = 1234;
    raw.meta.briefing_token_estimated = true;
    raw.meta.briefing_invocation_count = 1;
    raw.meta.ledger_write_skipped = true;
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(result.blocking.length, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('validate-cmd: grounding restamp (legit re-seal) does NOT false-positive as tamper', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    write({ gate: 'mccp-plan-codex', decision: 'feature-x', plan: planRel });
    // restampGroundingVerdict mutates meta.design_grounding_verdict then re-seals
    // receipt_hash — a legitimate post-seal write path that must validate clean.
    restampGroundingVerdict({ gate: 'mccp-plan-codex', decision: 'feature-x', 'design-grounding-verdict': 'grounded' });
    const result = validateCommand('/mccp:prp-implement', { cwd: repo, decisionId: 'feature-x' });
    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(result.blocking.length, 0);
  } finally {
    process.chdir(cwd);
  }
});
