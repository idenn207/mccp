'use strict';

// v1.3.1 — receipt-prompt informational ALLOW path.
//
// Threat model & invariants:
//   1. Recoverable command (mccp:plan / mccp:prp-implement / mccp:resume) +
//      missing-only integrity result → hook ALLOWs (exit 0) and emits
//      structured additionalContext containing the validateResult JSON +
//      decisionId + planPath. Phase 0 of the slash-command body reads this
//      context and auto-writes the missing receipt deterministically.
//   2. Terminal/mutating command (mccp:pr / mccp:code-review) → hook stays
//      hard-block (R2-F2: code-review POSTs an external GitHub review).
//   3. Any stale/blocking/open_critical result → hook stays hard-block
//      regardless of command (R2-F1: integrity failure ≠ recoverable).
//   4. decisionId in the emitted context is the derived slug, never the
//      silent fallback 'default'.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mkTmpRepo } = require('../../receipt/tests/helpers');

const HOOK = path.resolve(__dirname, '..', 'receipt-prompt.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');

function writePlan(repo, name) {
  const dir = path.join(repo, '.claude', 'plans');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, '# Plan ' + name + '\n\n## Codex Adversarial Review\n\nstub\n', 'utf8');
  return p;
}

function runHook(event, extraEnv) {
  const env = Object.assign({}, process.env, {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
  }, extraEnv || {});
  delete env.MCCP_SKIP_RECEIPT;
  // Force default (hard) mode so we test the v1.3.1 default partition path,
  // not the v0.2.2 soft-mode bypass.
  delete env.MCCP_RECEIPT_GATE_MODE;
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: env,
  });
}

function parseStdout(stdout) {
  if (!stdout || !stdout.trim()) return null;
  try { return JSON.parse(stdout); } catch (_) { return null; }
}

// Case (a) — recoverable command + missing receipt → ALLOW + structured context.
test('receipt-prompt informational: /mccp:prp-implement + missing receipt → ALLOW + context', function () {
  const repo = mkTmpRepo();
  const planRel = '.claude/plans/v1-3-1-info.plan.md';
  writePlan(repo, 'v1-3-1-info.plan.md');

  const r = runHook({
    session_id: 'test-info',
    tool_use_id: 'tuid-info-a',
    cwd: repo,
    command_name: 'mccp:prp-implement',
    command_args: planRel,
  });

  assert.strictEqual(r.status, 0,
    'hook should exit 0 on recoverable+missing-only; got ' + r.status +
    '\nstderr: ' + r.stderr);

  const payload = parseStdout(r.stdout);
  assert.ok(payload, 'hook should emit a JSON payload on stdout');
  assert.notStrictEqual(payload.decision, 'block',
    'recoverable+missing-only must NOT block; payload=' + JSON.stringify(payload));

  assert.ok(payload.hookSpecificOutput, 'expected hookSpecificOutput');
  assert.strictEqual(payload.hookSpecificOutput.hookEventName, 'UserPromptExpansion');

  // Context is JSON-encoded string inside additionalContext per Claude hook contract.
  const ctxRaw = payload.hookSpecificOutput.additionalContext;
  assert.ok(typeof ctxRaw === 'string', 'additionalContext should be a string');
  const ctx = JSON.parse(ctxRaw);
  assert.ok(ctx.mccp_receipt_gate, 'context root must be mccp_receipt_gate');
  const g = ctx.mccp_receipt_gate;
  assert.strictEqual(g.commandName, 'mccp:prp-implement');
  assert.strictEqual(g.must_not_proceed, false);
  assert.ok(Array.isArray(g.validateResult.missing));
  assert.ok(g.validateResult.missing.length > 0, 'missing[] should be populated');
  assert.deepStrictEqual(g.validateResult.stale, []);
  assert.deepStrictEqual(g.validateResult.blocking, []);
  assert.deepStrictEqual(g.validateResult.open_critical, []);

  // (c) — non-default slug forwarded; derived from plan basename.
  assert.notStrictEqual(g.decisionId, 'default',
    'decisionId must be the derived slug, not the silent fallback');
  assert.strictEqual(g.decisionId, 'v1-3-1-info');
});

// Case (a-bis) — informational ALLOW path persists with MCCP_RECEIPT_GATE_MODE=hard,
// confirming the v1.3.1 default-mode behavior change is NOT a soft-mode fallback.
test('receipt-prompt informational: MCCP_RECEIPT_GATE_MODE=hard does NOT regress informational path', function () {
  const repo = mkTmpRepo();
  const planRel = '.claude/plans/v1-3-1-info.plan.md';
  writePlan(repo, 'v1-3-1-info.plan.md');

  const r = runHook({
    session_id: 'test-info',
    tool_use_id: 'tuid-info-a-bis',
    cwd: repo,
    command_name: 'mccp:prp-implement',
    command_args: planRel,
  }, { MCCP_RECEIPT_GATE_MODE: 'hard' });

  assert.strictEqual(r.status, 0);
  const payload = parseStdout(r.stdout);
  assert.ok(payload, 'expected JSON payload');
  assert.notStrictEqual(payload.decision, 'block',
    'informational path must take precedence over legacy hard-mode block');
  const ctx = JSON.parse(payload.hookSpecificOutput.additionalContext);
  assert.strictEqual(ctx.mccp_receipt_gate.commandName, 'mccp:prp-implement');
  assert.strictEqual(ctx.mccp_receipt_gate.must_not_proceed, false);
});

// Case (b) — terminal /mccp:pr + missing receipt → BLOCK unchanged.
test('receipt-prompt informational: /mccp:pr + missing receipt → BLOCK unchanged (terminal gate)', function () {
  const repo = mkTmpRepo();
  const planRel = '.claude/plans/v1-3-1-info.plan.md';
  writePlan(repo, 'v1-3-1-info.plan.md');

  const r = runHook({
    session_id: 'test-info',
    tool_use_id: 'tuid-info-b',
    cwd: repo,
    command_name: 'mccp:pr',
    command_args: planRel,
  });

  assert.strictEqual(r.status, 0, 'hook always exits 0 — block is via stdout payload');
  const payload = parseStdout(r.stdout);
  assert.ok(payload, 'expected JSON payload');
  assert.strictEqual(payload.decision, 'block',
    '/mccp:pr must hard-block on missing receipt regardless of v1.3.1 informational path');
});

// Case (b-bis) — terminal /mccp:code-review + missing receipt → BLOCK unchanged.
test('receipt-prompt informational: /mccp:code-review + missing receipt → BLOCK unchanged (R2-F2 absorption)', function () {
  const repo = mkTmpRepo();

  // code-review with a PR number arg avoids the Local Review Mode bypass.
  const r = runHook({
    session_id: 'test-info',
    tool_use_id: 'tuid-info-b2',
    cwd: repo,
    command_name: 'mccp:code-review',
    command_args: '42',
  });

  assert.strictEqual(r.status, 0);
  const payload = parseStdout(r.stdout);
  assert.ok(payload, 'expected JSON payload');
  assert.strictEqual(payload.decision, 'block',
    '/mccp:code-review (PR Review Mode) POSTs GitHub review = mutating; must stay hard-block per R2-F2');
});

// Case (d) — must_not_proceed=true would set on terminal command per schema,
// but terminal commands hard-block (no additionalContext emitted from
// informational branch). This case validates the schema lib directly via
// the recoverable+stale variant where the informational branch correctly
// declines to ALLOW.
test('receipt-prompt informational: stale receipt on recoverable command → BLOCK (R2-F1 integrity invariant)', function () {
  const repo = mkTmpRepo();
  const planRel = '.claude/plans/v1-3-1-info.plan.md';
  const planPath = writePlan(repo, 'v1-3-1-info.plan.md');

  // Write a plan-codex receipt with a stale plan_hash to force the stale path.
  const receiptDir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, 'v1-3-1-info.json');
  fs.writeFileSync(receiptPath, JSON.stringify({
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    decision_id: 'v1-3-1-info',
    written_at: new Date().toISOString(),
    plan_path: planRel,
    plan_hash: 'sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    codex_outcome: 'approved',
  }, null, 2));

  // Now mutate the plan body so its hash differs from the receipt.
  fs.appendFileSync(planPath, '\n\n## Drift\n\nintentional change to invalidate hash\n');

  const r = runHook({
    session_id: 'test-info',
    tool_use_id: 'tuid-info-d',
    cwd: repo,
    command_name: 'mccp:prp-implement',
    command_args: planRel,
  });

  assert.strictEqual(r.status, 0);
  const payload = parseStdout(r.stdout);
  assert.ok(payload, 'expected JSON payload');
  // Stale path: informational branch declines (stale.length>0), v1.3.0 hard-
  // block path takes over. This is the invariant R2-F1 protects.
  assert.strictEqual(payload.decision, 'block',
    'stale receipt must hard-block even on recoverable command (R2-F1 invariant)');
});
