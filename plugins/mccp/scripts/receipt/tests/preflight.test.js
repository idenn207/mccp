'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mkTmpRepo, writeFileSync, captureIO } = require('./helpers');
const { write } = require('../write');
const { preflight } = require('../preflight');

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/x.plan.md', '# x\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

test('preflight: missing --command → exit 1', function () {
  const io = captureIO();
  const code = preflight({}, io);
  assert.strictEqual(code, 1);
  assert.match(io.errput(), /--command is required/);
});

test('preflight: unknown command → exit 0 (out-of-scope)', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    const code = preflight({ command: '/mccp:nonsense' }, io);
    assert.strictEqual(code, 0);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: missing preceding receipt → exit 2 + block stderr', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 2);
    assert.match(io.errput(), /BLOCKED/);
    assert.match(io.errput(), /MISSING.*plan-codex/);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: satisfied chain → exit 0', function () {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    write({ gate: 'mccp-plan-codex', decision: 'x', plan: planRel });
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 0, io.errput());
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: MCCP_SKIP_RECEIPT=1 bypasses + logs', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  io.env.MCCP_SKIP_RECEIPT = '1';
  try {
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 0);
    assert.match(io.errput(), /BYPASS/);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: bypass output JSON has bypassed=true', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  io.env.MCCP_SKIP_RECEIPT = '1';
  try {
    preflight({ command: '/mccp:prp-implement' }, io);
    const out = JSON.parse(io.output());
    assert.strictEqual(out.bypassed, true);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: missing → emits /mccp:receipt-write recovery hint', function () {
  const { repo } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 2);
    assert.match(io.errput(), /To recover MISSING.*\/mccp:receipt-write.*--gate.*--decision x.*--plan/);
  } finally {
    process.chdir(cwd);
  }
});

test('preflight: stale → emits regenerate recovery hint', function () {
  const fs = require('fs');
  const { repo, plan, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    write({ gate: 'mccp-plan-codex', decision: 'x', plan: planRel });
    fs.appendFileSync(plan, '\n\nmutate after receipt write\n');
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x', plan: planRel }, io);
    assert.strictEqual(code, 2);
    assert.match(io.errput(), /STALE/);
    assert.match(io.errput(), /To regenerate STALE.*re-run the producing gate/);
  } finally {
    process.chdir(cwd);
  }
});

// P5 (audit-remediation) — receipt-tamper surfaces as TAMPER with an
// investigation-first recovery line, and MUST NOT emit the "regenerate STALE"
// hint (Codex R1 F1 — regenerating would overwrite the tampered evidence).
test('preflight: receipt-tamper → TAMPER label + investigate hint, no "regenerate STALE"', function () {
  const fs = require('fs');
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'x', plan: planRel });
    // Mutate a non-subject, non-carve-out field so subject_hash still matches
    // and the receipt_hash check is the one that fires (tamper-only, no stale).
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    raw.meta.command = '/tampered-after-signing';
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 2, io.errput());
    const err = io.errput();
    assert.match(err, /TAMPER/);
    assert.match(err, /Do NOT regenerate/);
    assert.doesNotMatch(err, /To regenerate STALE/);
  } finally {
    process.chdir(cwd);
  }
});

// M2 F2 — subject-tamper is symmetric with receipt-tamper: TAMPER label +
// investigation-first line, never the "regenerate STALE" hint. Confirms the
// block-format refactor still emits the subject_hash guidance from preflight.
test('preflight: subject-tamper → TAMPER label + subject_hash investigate hint, no "regenerate STALE"', function () {
  const fs = require('fs');
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  const io = captureIO();
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'x', plan: planRel });
    // Mutate a SUBJECT field (task_id — a free string that stays schema-valid;
    // round is range-checked [1,10] and would trip schema validation first) →
    // subject_hash mismatch (subject-tamper), which fires before receipt_hash.
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    raw.task_id = 'tampered-after-signing';
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
    const code = preflight({ command: '/mccp:prp-implement', decision: 'x' }, io);
    assert.strictEqual(code, 2, io.errput());
    const err = io.errput();
    assert.match(err, /TAMPER/);
    assert.match(err, /subject_hash mismatch/);
    assert.match(err, /Do NOT regenerate/);
    assert.doesNotMatch(err, /To regenerate STALE/);
  } finally {
    process.chdir(cwd);
  }
});
