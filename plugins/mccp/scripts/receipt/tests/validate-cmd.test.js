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

// ── integrity-unification M3 — PR-terminal self-verdict ship gate ─────────────

const { makeSkeleton } = require('../schema');
const { subjectHash, receiptHash, gitRefs } = require('../hash');
const { writeReceipt } = require('../store');

const M3_SG_REASON =
  'cherry-pick PR whose diff was already adversarially reviewed upstream branch';

// Seal a receipt via the store directly (no write()) so these tests don't trip
// the briefing invoke path — deterministic, hermetic (mirror of
// receipt-convergence.test.js#shipReceipt) with REAL subject/receipt hashes so the
// self-gate's tamper checks pass.
function sealReceipt(repo, gate, decision, opts) {
  opts = opts || {};
  const phase = gate === 'mccp-pr-codex' ? 'pr'
    : gate === 'mccp-implement-codex' ? 'implement' : 'plan';
  const r = makeSkeleton({});
  r.gate_id = gate;
  r.phase = phase;
  r.decision_id = decision;
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  // R2 F4 — default head_sha to the repo's CURRENT HEAD so the ship-gate staleness
  // check treats the fixture as a current receipt. opts.headSha forces a stale one.
  r.head_sha = opts.headSha || gitRefs({ cwd: repo }).headSha;
  r.resolution.converged = true;
  if (opts.codexVerdict !== undefined) r.resolution.codex_verdict = opts.codexVerdict;
  r.meta.command = '/' + (gate === 'mccp-pr-codex' ? 'mccp:pr' : gate);
  if (opts.meta) Object.assign(r.meta, opts.meta);
  r.subject_hash = subjectHash(r);
  r.receipt_hash = receiptHash(r);
  writeReceipt(repo, r);
  return r;
}

// Preceding gates (plan + implement) converged so the ONLY variable is the
// pr-codex self-verdict.
function seedConvergedUpstream(repo, decision) {
  sealReceipt(repo, 'mccp-plan-codex', decision, { codexVerdict: 'converged' });
  sealReceipt(repo, 'mccp-implement-codex', decision, { codexVerdict: 'converged' });
}

test('M3 self-gate: divergent pr-codex + --check-ship-verdict → blocking(pr_codex_nonconverged)', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-a');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-a', { codexVerdict: 'divergent' });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-a', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  const b = r.blocking.find(function (x) { return x.kind === 'pr_codex_nonconverged'; });
  assert.ok(b, 'expected pr_codex_nonconverged blocking: ' + JSON.stringify(r.blocking));
  assert.strictEqual(b.prior_verdict, 'divergent');
});

test('M3 self-gate: converged pr-codex + flag → ok (no self-block)', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-b');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-b', { codexVerdict: 'converged' });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-b', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(!r.blocking.some(function (x) { return x.kind === 'pr_codex_nonconverged'; }));
});

test('M3 self-gate: skipped pr-codex WITH dedupe proof + flag → ok', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-c');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-c',
    { codexVerdict: 'skipped', meta: { codex_dedupe_at_pr: true } });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-c', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

// F2 — a `skipped` verdict with no sanctioned proof marker fails closed at the
// self-gate (a forged/malformed {codex_outcome:"skipped"} cannot ship).
test('M3 self-gate: skipped pr-codex WITHOUT proof + flag → blocking (skipped-unproven) [F2]', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-c2');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-c2', { codexVerdict: 'skipped' });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-c2', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  const b = r.blocking.find(function (x) { return x.kind === 'pr_codex_nonconverged'; });
  assert.ok(b, 'expected pr_codex_nonconverged blocking: ' + JSON.stringify(r.blocking));
  assert.strictEqual(b.prior_verdict, 'skipped-unproven');
});

test('M3 self-gate: absent codex_verdict + flag → blocking (fail-closed, verdict=absent)', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-d');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-d', {}); // no codex_verdict
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-d', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, false);
  const b = r.blocking.find(function (x) { return x.kind === 'pr_codex_nonconverged'; });
  assert.ok(b);
  assert.strictEqual(b.prior_verdict, 'absent');
});

test('M3 self-gate: divergent + meta override → warning(not blocking), ok', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-e');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-e', {
    codexVerdict: 'divergent',
    meta: { pr_codex_force_override: true, pr_codex_force_override_reason: M3_SG_REASON },
  });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-e', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(!r.blocking.some(function (x) { return x.kind === 'pr_codex_nonconverged'; }));
  const w = r.warnings.find(function (x) { return x.kind === 'pr_codex_force_override'; });
  assert.ok(w, 'expected override warning: ' + JSON.stringify(r.warnings));
  assert.strictEqual(w.prior_verdict, 'divergent');
});

test('M3 self-gate: divergent + env override → warning(not blocking), ok', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-f');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-f', { codexVerdict: 'divergent' });
  const prev = process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE;
  process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE = M3_SG_REASON;
  try {
    const r = validateCommand('/mccp:pr', {
      cwd: repo, decisionId: 'feat-f', checkShipVerdict: true,
    });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(r.warnings.some(function (x) { return x.kind === 'pr_codex_force_override'; }));
  } finally {
    if (prev === undefined) delete process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE;
    else process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE = prev;
  }
});

test('M3 self-gate: env override with BAD reason does NOT unblock (stays blocking)', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-g');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-g', { codexVerdict: 'divergent' });
  const prev = process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE;
  process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE = 'nope';
  try {
    const r = validateCommand('/mccp:pr', {
      cwd: repo, decisionId: 'feat-g', checkShipVerdict: true,
    });
    assert.strictEqual(r.ok, false, 'bad reason must not unblock');
    assert.ok(r.blocking.some(function (x) { return x.kind === 'pr_codex_nonconverged'; }));
  } finally {
    if (prev === undefined) delete process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE;
    else process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE = prev;
  }
});

// DD4 re-entrancy regression — WITHOUT the flag the self-gate is entirely inert,
// even on a divergent pr-codex receipt, so a re-run is never self-poisoned.
test('M3 self-gate: divergent pr-codex WITHOUT flag → no self-block (re-entrancy)', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-h');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-h', { codexVerdict: 'divergent' });
  const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'feat-h' });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(!r.blocking.some(function (x) { return x.kind === 'pr_codex_nonconverged'; }),
    'flag-less validate must never self-gate (DD4)');
});

// F1 — checkShipVerdict is set ONLY by the POST-finalize read-back, so a missing
// pr-codex receipt there is an anomaly and must fail closed (not a benign no-op).
test('M3 self-gate: missing pr-codex receipt at read-back + flag → blocking (ship-gate-receipt-missing) [F1]', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-i');
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-i', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.blocking.some(function (x) { return x.kind === 'ship-gate-receipt-missing'; }),
    'missing ship receipt at read-back must fail closed: ' + JSON.stringify(r.blocking));
});

// F4 — a converged receipt whose head_sha is NOT the current HEAD is stale: it
// reviewed an older commit and must not certify the current (unreviewed) diff.
test('M3 self-gate: stale head_sha (converged receipt for older commit) + flag → blocking (ship-gate-stale-head) [F4]', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-stale');
  sealReceipt(repo, 'mccp-pr-codex', 'feat-stale',
    { codexVerdict: 'converged', headSha: 'c'.repeat(40) });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-stale', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.blocking.some(function (x) { return x.kind === 'ship-gate-stale-head'; }),
    'stale head_sha must fail closed even for a converged verdict: ' + JSON.stringify(r.blocking));
});

// F5 — the read-back binds to the exact receipt finalize sealed (expected-receipt-hash).
test('M3 self-gate: expected-receipt-hash MATCH + flag → ok (bound to finalize write) [F5]', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-bind');
  const rec = sealReceipt(repo, 'mccp-pr-codex', 'feat-bind', { codexVerdict: 'converged' });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-bind', checkShipVerdict: true,
    expectedReceiptHash: rec.receipt_hash,
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

test('M3 self-gate: expected-receipt-hash MISMATCH (swapped receipt) + flag → blocking (ship-gate-hash-mismatch) [F5]', function () {
  const { repo } = setupRepo();
  seedConvergedUpstream(repo, 'feat-swap');
  // The receipt on disk is converged, but finalize sealed a DIFFERENT (e.g.
  // divergent) receipt this invocation — the expected hash won't match.
  sealReceipt(repo, 'mccp-pr-codex', 'feat-swap', { codexVerdict: 'converged' });
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-swap', checkShipVerdict: true,
    expectedReceiptHash: 'sha256:' + 'd'.repeat(64),
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.blocking.some(function (x) { return x.kind === 'ship-gate-hash-mismatch'; }),
    'a receipt whose hash != finalize-sealed must fail closed: ' + JSON.stringify(r.blocking));
});

test('M3 self-gate: non-terminal command (prp-implement) + flag → self-gate inert', function () {
  const { repo } = setupRepo();
  sealReceipt(repo, 'mccp-plan-codex', 'feat-j', { codexVerdict: 'converged' });
  // Even if a divergent pr-codex receipt exists, prp-implement is not terminal.
  sealReceipt(repo, 'mccp-pr-codex', 'feat-j', { codexVerdict: 'divergent' });
  const r = validateCommand('/mccp:prp-implement', {
    cwd: repo, decisionId: 'feat-j', checkShipVerdict: true,
  });
  assert.ok(!r.blocking.some(function (x) { return x.kind === 'pr_codex_nonconverged'; }),
    'only terminal PR commands self-gate');
});

// Ship-gate integrity guards — the tamper/schema branches run BEFORE the verdict
// is trusted. These prove a receipt forged/broken after signing can NOT ship
// (they are the branches pr.md 2.5.9 now honors via ok===false, not just the
// pr_codex_nonconverged kind).

// Seal with correct hashes over `sealedVerdict`, then optionally forge the on-disk
// verdict to `forgedVerdict` WITHOUT re-hashing (subject fields untouched, so the
// receipt_hash mismatch is what must catch the forge).
function sealPrCodex(repo, decision, sealedVerdict, forgedVerdict) {
  seedConvergedUpstream(repo, decision);
  const r = makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = decision;
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'b'.repeat(40);
  r.resolution.converged = true;
  r.resolution.codex_verdict = sealedVerdict;
  r.meta.command = '/mccp:pr';
  r.subject_hash = subjectHash(r);
  r.receipt_hash = receiptHash(r);
  if (forgedVerdict !== undefined) r.resolution.codex_verdict = forgedVerdict;
  writeReceipt(repo, r);
}

test('M3 self-gate: receipt forged divergent→converged after signing → blocking(receipt-tamper), NOT silent ship', function () {
  const { repo } = setupRepo();
  sealPrCodex(repo, 'feat-forge', 'divergent', 'converged');
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-forge', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, false, 'a forged "converged" must NOT ship: ' + JSON.stringify(r));
  assert.ok(r.blocking.some(function (x) { return x.kind === 'receipt-tamper'; }),
    'expected receipt-tamper blocking: ' + JSON.stringify(r.blocking));
});

test('M3 self-gate: schema-invalid pr-codex (bad codex_verdict enum) + flag → blocking(ship-gate-schema-invalid)', function () {
  const { repo } = setupRepo();
  // hashes computed over the bogus content → subject/receipt checks PASS, isolating
  // the schema failure (which the ship-gate checks first).
  sealPrCodex(repo, 'feat-badenum', 'bogus-not-an-enum');
  const r = validateCommand('/mccp:pr', {
    cwd: repo, decisionId: 'feat-badenum', checkShipVerdict: true,
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.blocking.some(function (x) { return x.kind === 'ship-gate-schema-invalid'; }),
    'expected ship-gate-schema-invalid blocking: ' + JSON.stringify(r.blocking));
});
