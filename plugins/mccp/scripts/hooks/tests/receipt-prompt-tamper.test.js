'use strict';

// M2 F2 (integrity-unification — Codex divergent absorption). The
// UserPromptExpansion hook is the ACTUAL slash-command enforcement surface. Before
// this, it printed every block as generic INVALID and ALWAYS appended "Write
// missing receipt" — so a receipt/subject-tamper block reached the operator
// without the investigation-first warning and with an instruction that would
// OVERWRITE (destroy) the tampered evidence. This spawns the real hook against a
// tampered receipt and asserts the tamper-aware output.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mkTmpRepo } = require('../../receipt/tests/helpers');
const { write } = require('../../receipt/write');

const HOOK = path.resolve(__dirname, '..', 'receipt-prompt.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');

function runHook(event) {
  const env = Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT });
  delete env.MCCP_SKIP_RECEIPT;
  delete env.MCCP_RECEIPT_GATE_MODE;
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(event), encoding: 'utf8', env: env });
}

// Write a valid plan-codex receipt, then mutate the given field, and run the hook
// for /mccp:prp-implement (whose preceding gate is mccp-plan-codex).
function setupTamperedAndRun(mutate) {
  const repo = mkTmpRepo();
  const planRel = '.claude/plans/tamper-x.plan.md';
  fs.mkdirSync(path.join(repo, '.claude', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(repo, planRel), '# tamper-x\n', 'utf8');
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    const r = write({ gate: 'mccp-plan-codex', decision: 'tamper-x', plan: planRel });
    const raw = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    mutate(raw);
    fs.writeFileSync(r.path, JSON.stringify(raw, null, 2));
  } finally {
    process.chdir(cwd);
  }
  return runHook({
    session_id: 'test-tamper',
    tool_use_id: 'tuid-tamper',
    cwd: repo,
    command_name: 'mccp:prp-implement',
    command_args: planRel,
  });
}

test('receipt-prompt F2: receipt-tamper block → TAMPER + Do NOT regenerate, NO "Write missing receipt"', function () {
  // Mutate a non-subject, non-carve-out body field → receipt_hash mismatch.
  const res = setupTamperedAndRun(function (raw) { raw.meta.command = '/tampered-after-signing'; });
  assert.strictEqual(res.status, 0, res.stderr);
  const payload = JSON.parse(res.stdout);
  assert.strictEqual(payload.decision, 'block', res.stdout);
  assert.match(payload.reason, /TAMPER/, 'block reason must label the tamper');
  assert.match(payload.reason, /Do NOT regenerate/, 'investigation-first guidance required');
  assert.doesNotMatch(payload.reason, /Write missing receipt/,
    'a tamper block must NOT tell the operator to write/overwrite the receipt (evidence)');
  assert.match(payload.hookSpecificOutput.additionalContext, /INTEGRITY|tamper/i,
    'additionalContext must flag integrity, not "missing or stale"');
});

test('receipt-prompt F2: subject-tamper block → TAMPER + Do NOT regenerate', function () {
  // Mutate a SUBJECT field (task_id — a free string, so it stays schema-valid;
  // round is range-checked [1,10] and would trip schema validation first) →
  // subject_hash mismatch (subject-tamper), which pre-empts the receipt_hash
  // check via `continue`.
  const res = setupTamperedAndRun(function (raw) { raw.task_id = 'tampered-after-signing'; });
  assert.strictEqual(res.status, 0, res.stderr);
  const payload = JSON.parse(res.stdout);
  assert.strictEqual(payload.decision, 'block', res.stdout);
  assert.match(payload.reason, /TAMPER/);
  assert.match(payload.reason, /subject_hash mismatch/);
  assert.match(payload.reason, /Do NOT regenerate/);
  assert.doesNotMatch(payload.reason, /Write missing receipt/);
});

test('receipt-prompt F2: a genuinely MISSING receipt still offers "Write missing receipt"', function () {
  // Regression guard: the conditional must not suppress the recovery hint when a
  // receipt is actually missing. /mccp:pr is terminal → hard-block on missing.
  const repo = mkTmpRepo();
  const planRel = '.claude/plans/tamper-x.plan.md';
  fs.mkdirSync(path.join(repo, '.claude', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(repo, planRel), '# tamper-x\n', 'utf8');
  const res = runHook({
    session_id: 'test-missing',
    tool_use_id: 'tuid-missing',
    cwd: repo,
    command_name: 'mccp:pr',
    command_args: planRel,
  });
  assert.strictEqual(res.status, 0, res.stderr);
  const payload = JSON.parse(res.stdout);
  assert.strictEqual(payload.decision, 'block');
  assert.match(payload.reason, /MISSING/);
  assert.match(payload.reason, /Write missing receipt/, 'missing receipt still gets the write hint');
  assert.doesNotMatch(payload.reason, /Do NOT regenerate/, 'no tamper guidance when nothing is tampered');
});
