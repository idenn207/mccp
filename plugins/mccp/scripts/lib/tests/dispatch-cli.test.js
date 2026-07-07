'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const cli = require('../dispatch-cli');
const envelope = require('../dispatch-envelope');
const controller = require('../dispatch-controller');
const schema = require('../../receipt/schema');

const CONTROLLER_SESSION_ID = '019eced3-cce9-7be3-81a1-c8a5c30a27fe';
const RECEIPT_CLI = path.join(__dirname, '..', '..', 'receipt', 'cli.js');

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-cli-test-'));
}
function rimraf(target) {
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
}

// Capture the single JSON line emit() writes to stdout while `fn` runs.
function captureEmit(fn) {
  const chunks = [];
  const orig = process.stdout.write;
  process.stdout.write = function (s) { chunks.push(String(s)); return true; };
  let exitCode;
  try {
    exitCode = fn();
  } finally {
    process.stdout.write = orig;
  }
  const text = chunks.join('');
  return { exitCode: exitCode, json: text.trim() ? JSON.parse(text.trim()) : null };
}

// ── parseFlags (mirror of work-orchestrator.js) ───────────────────────────

test('parseFlags: value + boolean flags + positional', () => {
  // Mirror of work-orchestrator.js parseFlags: a boolean flag becomes true only
  // when it is the last token OR followed by another --flag. A trailing bare
  // token is consumed as the preceding flag's VALUE — hence boolean flags like
  // --dry-run are always placed last in real usage.
  const out = cli.parseFlags(['--plan', 'p.md', 'pos', '--x', 'y', '--dry-run']);
  assert.strictEqual(out.plan, 'p.md');
  assert.strictEqual(out['dry-run'], true);
  assert.strictEqual(out.x, 'y');
  assert.deepStrictEqual(out._, ['pos']);
});

// ── ipcEnvelopeRelPath (Codex F3 — repo-relative canonical path) ──────────

test('ipcEnvelopeRelPath: matches receipt schema ENVELOPE_PATH_RE', () => {
  const id = crypto.randomUUID();
  const rel = cli.ipcEnvelopeRelPath(id);
  assert.strictEqual(rel, '.claude/state/dispatches/' + id + '.envelope.json');
  assert.ok(schema.ENVELOPE_PATH_RE.test(rel),
    'repo-relative ipc path must satisfy receipt schema regex: ' + rel);
});

test('ipcEnvelopeRelPath: forward slashes even on win32 (path.posix)', () => {
  const rel = cli.ipcEnvelopeRelPath('019ecedf-1234-5678-9abc-def012345678');
  assert.strictEqual(rel.indexOf('\\'), -1, 'no backslashes in canonical path');
});

// ── buildImplementWorkerBasePrompt (Task 0 — self-contained shape) ────────

test('buildImplementWorkerBasePrompt: embeds plan + attribution + guardrails', () => {
  const id = '019ecedf-1234-5678-9abc-def012345678';
  const ipc = cli.ipcEnvelopeRelPath(id);
  const p = cli.buildImplementWorkerBasePrompt({
    planPath: '.claude/plans/x.plan.md',
    dispatchId: id,
    ipcEnvelopePath: ipc,
    controllerSessionId: CONTROLLER_SESSION_ID,
  });
  assert.ok(p.includes('.claude/plans/x.plan.md'), 'plan path present');
  assert.ok(p.includes('--dispatched-by-controller-session ' + CONTROLLER_SESSION_ID), 'session attribution present');
  assert.ok(p.includes('--worker-dispatch-id ' + id), 'dispatch id attribution present');
  assert.ok(p.includes('--ipc-envelope-path ' + ipc), 'ipc path attribution present');
  // F1 guardrail — worker must never commit/PR from inside isolation.
  assert.ok(p.includes('MCCP_AUTO_CHAIN_DISABLE=1'), 'auto-chain disable guardrail present');
  assert.ok(/Do NOT invoke \/mccp:prp-commit or \/mccp:pr/.test(p), 'no-commit/PR guardrail present');
  assert.ok(p.includes('Never write a mccp-pr-codex receipt'), 'no pr-codex receipt guardrail present');
  // Terminal envelope contract via the mark subcommand.
  assert.ok(p.includes('dispatch-cli.js mark'), 'envelope mark contract present');
});

// ── M2a Task 1 — schema return contract coexists with envelope mark ────────

test('buildImplementWorkerBasePrompt: schema field names + envelope mark + 3 flags all coexist', () => {
  const id = '019ecedf-1234-5678-9abc-def012345678';
  const ipc = cli.ipcEnvelopeRelPath(id);
  const p = cli.buildImplementWorkerBasePrompt({
    planPath: '.claude/plans/x.plan.md',
    dispatchId: id,
    ipcEnvelopePath: ipc,
    controllerSessionId: CONTROLLER_SESSION_ID,
  });
  // Structured return contract — every IMPLEMENT_RESULT_SCHEMA field is named.
  ['status', 'receiptsAdded', 'changedFiles', 'testResult', 'nextAction'].forEach((f) => {
    assert.ok(p.includes('"' + f + '"'), 'schema field named in return contract: ' + f);
  });
  // Coexistence — envelope mark AND the 3 attribution flags survive alongside.
  assert.ok(p.includes('dispatch-cli.js mark'), 'envelope mark still present (병존)');
  assert.ok(p.includes('--dispatched-by-controller-session ' + CONTROLLER_SESSION_ID));
  assert.ok(p.includes('--worker-dispatch-id ' + id));
  assert.ok(p.includes('--ipc-envelope-path ' + ipc));
  // Reconciliation intent stated (result MUST agree with envelope).
  assert.ok(/reconcile|AGREE/i.test(p), 'return-vs-envelope reconciliation intent stated');
});

// ── M2a Task 1 — emit-workflow-args ────────────────────────────────────────

test('emit-workflow-args: reshapes a prepare-single emit into Workflow args + expectedAnchor', () => {
  const sb = makeSandbox();
  try {
    // Produce a real prepare-single emit, persist it, then reshape it.
    const { json: prep } = captureEmit(() => cli.cmdPrepareSingle({
      plan: '.claude/plans/x.plan.md',
      'controller-session': CONTROLLER_SESSION_ID,
      'parent-cwd': sb,
      subagent: 'general-purpose',
    }));
    const prepFile = path.join(sb, 'prepare.json');
    fs.writeFileSync(prepFile, JSON.stringify(prep), 'utf8');

    const { exitCode, json } = captureEmit(() => cli.cmdEmitWorkflowArgs({ 'prepare-file': prepFile }));
    assert.strictEqual(exitCode, 0);
    assert.strictEqual(json.workerPrompt, prep.prompt, 'workerPrompt = prepare prompt');
    assert.strictEqual(json.agentType, 'general-purpose');
    assert.strictEqual(json.dispatchId, prep.dispatchId);
    assert.strictEqual(json.ipcEnvelopePath, prep.ipcEnvelopePath);
    assert.strictEqual(json.envelopePath, prep.envelopePath);
    assert.strictEqual(json.controllerSessionId, CONTROLLER_SESSION_ID);
    // expectedAnchor binds the exact controller identity for F3 verification.
    assert.deepStrictEqual(json.expectedAnchor, {
      sessionId: CONTROLLER_SESSION_ID,
      dispatchId: prep.dispatchId,
      ipcPath: prep.ipcEnvelopePath,
    });
  } finally { rimraf(sb); }
});

test('emit-workflow-args: missing --prepare-file → usage exit 2', () => {
  const { exitCode } = captureEmit(() => cli.cmdEmitWorkflowArgs({}));
  assert.strictEqual(exitCode, 2);
});

test('emit-workflow-args: prepare-file missing required fields → error exit 1', () => {
  const sb = makeSandbox();
  try {
    const bad = path.join(sb, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify({ dispatchId: 'x' }), 'utf8'); // no ipc/session/prompt
    const { exitCode } = captureEmit(() => cli.cmdEmitWorkflowArgs({ 'prepare-file': bad }));
    assert.strictEqual(exitCode, 1);
  } finally { rimraf(sb); }
});

test('emit-workflow-args: idempotent — regen from same prepare is byte-identical (work.md Step 3.gate M1)', () => {
  // work.md Step 3.gate REGENERATES args from prepare.json when the Step 3.prep
  // emit was lost (rare fs failure) so a healthy Task worker is not misclassified
  // result-unreadable. The regen MUST equal the first emit or the reconcile
  // expectedAnchor would drift — the very false HALT this fix removes. This
  // pins cmdEmitWorkflowArgs as a PURE derivation (no clock/random) of prepare.
  const sb = makeSandbox();
  try {
    const { json: prep } = captureEmit(() => cli.cmdPrepareSingle({
      plan: '.claude/plans/x.plan.md',
      'controller-session': CONTROLLER_SESSION_ID,
      'parent-cwd': sb,
    }));
    const prepFile = path.join(sb, 'prepare.json');
    fs.writeFileSync(prepFile, JSON.stringify(prep), 'utf8');
    const a = captureEmit(() => cli.cmdEmitWorkflowArgs({ 'prepare-file': prepFile }));
    const b = captureEmit(() => cli.cmdEmitWorkflowArgs({ 'prepare-file': prepFile }));
    assert.deepStrictEqual(a.json, b.json, 'regen must equal first emit (no expectedAnchor drift)');
    assert.deepStrictEqual(b.json.expectedAnchor, {
      sessionId: CONTROLLER_SESSION_ID,
      dispatchId: prep.dispatchId,
      ipcPath: prep.ipcEnvelopePath,
    });
  } finally { rimraf(sb); }
});

// ── prepare-single ────────────────────────────────────────────────────────

test('prepare-single --dry-run: emits absolute envelopePath + repo-relative ipcEnvelopePath, no disk write', () => {
  const sb = makeSandbox();
  try {
    const { exitCode, json } = captureEmit(() => cli.cmdPrepareSingle({
      plan: 'anything-even-bogus',
      'controller-session': CONTROLLER_SESSION_ID,
      'parent-cwd': sb,
      'dry-run': true,
    }));
    assert.strictEqual(exitCode, 0);
    assert.ok(envelope.UUID_RE.test(json.dispatchId));
    // absolute local-read path
    assert.strictEqual(path.isAbsolute(json.envelopePath), true, 'envelopePath must be absolute');
    assert.ok(json.envelopePath.endsWith(json.dispatchId + '.envelope.json'));
    // repo-relative receipt-flag path — the F3 property
    assert.strictEqual(json.ipcEnvelopePath, '.claude/state/dispatches/' + json.dispatchId + '.envelope.json');
    assert.ok(schema.ENVELOPE_PATH_RE.test(json.ipcEnvelopePath));
    assert.strictEqual(schema.ENVELOPE_PATH_RE.test(json.envelopePath), false,
      'absolute envelopePath must NOT satisfy receipt schema regex (F3 rationale)');
    assert.strictEqual(json.heartbeat, false, 'synchronous single worker → no heartbeat (F2)');
    assert.strictEqual(json.dryRun, true);
    // dry-run wrote nothing to disk
    assert.strictEqual(fs.existsSync(json.envelopePath), false, 'dry-run must not write placeholder');
  } finally { rimraf(sb); }
});

test('prepare-single (live): writes pending placeholder, subagent honored, prompt bound', () => {
  const sb = makeSandbox();
  try {
    const { exitCode, json } = captureEmit(() => cli.cmdPrepareSingle({
      plan: '.claude/plans/x.plan.md',
      'controller-session': CONTROLLER_SESSION_ID,
      'parent-cwd': sb,
      subagent: 'general-purpose',
    }));
    assert.strictEqual(exitCode, 0);
    assert.strictEqual(json.subagentType, 'general-purpose');
    assert.strictEqual(json.dryRun, false);
    const r = envelope.read(json.envelopePath);
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.envelope.worker_exit_status, 'pending');
    assert.strictEqual(r.envelope.worker_ended_at, null);
    assert.strictEqual(r.envelope.controller_session_id, CONTROLLER_SESSION_ID);
    // prompt carries the exact bound attribution
    assert.ok(json.prompt.includes('--worker-dispatch-id ' + json.dispatchId));
  } finally { rimraf(sb); }
});

test('prepare-single: missing --controller-session → usage exit 2', () => {
  const { exitCode } = captureEmit(() => cli.cmdPrepareSingle({ plan: 'p' }));
  assert.strictEqual(exitCode, 2);
});

test('prepare-single: non-UUID --controller-session → usage exit 2', () => {
  const { exitCode } = captureEmit(() => cli.cmdPrepareSingle({
    plan: 'p', 'controller-session': 'not-a-uuid',
  }));
  assert.strictEqual(exitCode, 2);
});

// ── Codex F2 — synchronous single worker is NOT a stale-reclaim target ─────

test('F2: prepare-single writes NO heartbeat → reclaimStale never marks it crashed', () => {
  const sb = makeSandbox();
  try {
    const { json } = captureEmit(() => cli.cmdPrepareSingle({
      plan: '.claude/plans/x.plan.md',
      'controller-session': CONTROLLER_SESSION_ID,
      'parent-cwd': sb,
    }));
    const envelopeDir = path.join(sb, '.claude', 'state', 'dispatches');
    // no .heartbeat sidecar exists
    const heartbeats = fs.readdirSync(envelopeDir).filter((f) => f.endsWith('.heartbeat'));
    assert.deepStrictEqual(heartbeats, [], 'skipHeartbeat:true must create no heartbeat file');
    // even with a 0ms TTL, reclaimStale finds nothing (no heartbeat to scan) →
    // the envelope stays `pending`, never gets paired with a false `crashed`.
    const result = controller.reclaimStale({ envelopeDir: envelopeDir, ttlMs: 0 });
    assert.deepStrictEqual(result.reclaimed, []);
    const r = envelope.read(json.envelopePath);
    assert.strictEqual(r.envelope.worker_exit_status, 'pending',
      'no heartbeat → envelope must not be reclaimed to crashed (F2 race closed)');
  } finally { rimraf(sb); }
});

// ── mark (worker-side envelope transition) ────────────────────────────────

test('mark: transitions pending placeholder → ok with receipts + next_action', () => {
  const sb = makeSandbox();
  try {
    const { json } = captureEmit(() => cli.cmdPrepareSingle({
      plan: '.claude/plans/x.plan.md',
      'controller-session': CONTROLLER_SESSION_ID,
      'parent-cwd': sb,
    }));
    const markRes = captureEmit(() => cli.cmdMark({
      envelope: json.envelopePath,
      status: 'ok',
      receipts: 'mccp-implement-codex/x.json, mccp-implement-codex/x.json',
      'next-action': 'implement done; controller may commit',
    }));
    assert.strictEqual(markRes.exitCode, 0);
    const r = envelope.read(json.envelopePath);
    assert.strictEqual(r.envelope.worker_exit_status, 'ok');
    assert.match(r.envelope.worker_ended_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepStrictEqual(r.envelope.receipts_added,
      ['mccp-implement-codex/x.json', 'mccp-implement-codex/x.json']);
    assert.strictEqual(r.envelope.next_action, 'implement done; controller may commit');
  } finally { rimraf(sb); }
});

test('mark: missing --status → usage exit 2', () => {
  const { exitCode } = captureEmit(() => cli.cmdMark({ envelope: 'x.json' }));
  assert.strictEqual(exitCode, 2);
});

// ── merge ─────────────────────────────────────────────────────────────────

function writeTerminal(sb, over) {
  const dir = path.join(sb, '.claude', 'state', 'dispatches');
  fs.mkdirSync(dir, { recursive: true });
  const id = (over && over.dispatch_id) || '019ecedf-1234-5678-9abc-def012345678';
  const body = Object.assign({
    schema_version: 'v1',
    dispatch_id: id,
    worker_subagent_type: 'general-purpose',
    worker_started_at: '2026-07-04T05:00:00.000Z',
    worker_ended_at: '2026-07-04T05:05:00.000Z',
    worker_exit_status: 'ok',
    receipts_added: ['mccp-implement-codex/x.json'],
    findings: [],
    next_action: 'done',
    controller_session_id: CONTROLLER_SESSION_ID,
    parent_cwd: sb,
  }, over || {});
  const p = path.join(dir, id + '.envelope.json');
  const w = envelope.write(p, body);
  assert.strictEqual(w.ok, true, w.error);
  return p;
}

test('merge: ok worker → verdict ok, receipts flow', () => {
  const sb = makeSandbox();
  try {
    const p = writeTerminal(sb);
    const { json } = captureEmit(() => cli.cmdMerge({ envelope: p }));
    assert.strictEqual(json.verdict, 'ok');
    assert.strictEqual(json.workerExitStatus, 'ok');
    assert.deepStrictEqual(json.receiptsAdded, ['mccp-implement-codex/x.json']);
    assert.deepStrictEqual(json.failedWorkers, []);
    assert.deepStrictEqual(json.invariantViolations, []);
    assert.strictEqual(json.nextAction, 'done');
  } finally { rimraf(sb); }
});

test('merge: failure worker → verdict failed', () => {
  const sb = makeSandbox();
  try {
    const p = writeTerminal(sb, {
      worker_exit_status: 'failure',
      findings: [{ severity: 'HIGH', message: 'validation red' }],
    });
    const { json } = captureEmit(() => cli.cmdMerge({ envelope: p }));
    assert.strictEqual(json.verdict, 'failed');
    assert.strictEqual(json.failedWorkers.length, 1);
    assert.strictEqual(json.findings.length, 1);
    assert.strictEqual(json.findings[0].severity, 'HIGH');
  } finally { rimraf(sb); }
});

test('merge F1: worker leaked a PR-gate receipt → verdict invariant-violation', () => {
  const sb = makeSandbox();
  try {
    const p = writeTerminal(sb, {
      receipts_added: ['mccp-implement-codex/x.json', 'mccp-pr-codex/x.json'],
    });
    const { json } = captureEmit(() => cli.cmdMerge({ envelope: p }));
    assert.strictEqual(json.verdict, 'invariant-violation');
    assert.strictEqual(json.invariantViolations.length, 1);
    assert.strictEqual(json.invariantViolations[0].kind, 'worker-ran-pr-gate');
    assert.strictEqual(json.invariantViolations[0].slug, 'mccp-pr-codex/x.json');
  } finally { rimraf(sb); }
});

test('merge: unreadable envelope → verdict envelope-unreadable (loud, not a crash)', () => {
  const { exitCode, json } = captureEmit(() => cli.cmdMerge({
    envelope: path.join(os.tmpdir(), 'nope-' + crypto.randomUUID() + '.json'),
  }));
  assert.strictEqual(exitCode, 0);
  assert.strictEqual(json.verdict, 'envelope-unreadable');
  assert.strictEqual(json.failedWorkers.length, 1);
});

// ── M2a Task 3 — reconcile (unified F1/F2/F3 gate, Workflow + Task paths) ──

const RECON_DISPATCH_ID = '019ecedf-1234-5678-9abc-def012345678';
const RECON_IPC = '.claude/state/dispatches/' + RECON_DISPATCH_ID + '.envelope.json';

function writeReceiptFile(sb, slug, metaOver) {
  const p = path.join(sb, '.claude', 'receipts', slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    meta: Object.assign({
      controller_context_marker_present: true,
      dispatched_by_controller_session_id: CONTROLLER_SESSION_ID,
      worker_dispatch_id: RECON_DISPATCH_ID,
      ipc_envelope_path: RECON_IPC,
    }, metaOver || {}),
  }), 'utf8');
  return p;
}

function writeArgsFile(sb, anchorOver) {
  const p = path.join(sb, 'wf-args.json');
  fs.writeFileSync(p, JSON.stringify({
    expectedAnchor: Object.assign({
      sessionId: CONTROLLER_SESSION_ID,
      dispatchId: RECON_DISPATCH_ID,
      ipcPath: RECON_IPC,
    }, anchorOver || {}),
  }), 'utf8');
  return p;
}

function writeResultFile(sb, resultObj) {
  const p = path.join(sb, 'wf-return.json');
  fs.writeFileSync(p, JSON.stringify({ result: resultObj, dispatchId: RECON_DISPATCH_ID }), 'utf8');
  return p;
}

test('reconcile (Workflow path): ok result + terminal envelope + anchored receipt → ok', () => {
  const sb = makeSandbox();
  try {
    const env = writeTerminal(sb);
    writeReceiptFile(sb, 'mccp-implement-codex/x.json');
    const argsFile = writeArgsFile(sb);
    const resultFile = writeResultFile(sb, {
      status: 'ok', receiptsAdded: ['mccp-implement-codex/x.json'],
      changedFiles: ['a.js'], testResult: '5 pass', nextAction: 'done',
    });
    const { json } = captureEmit(() => cli.cmdReconcile({
      envelope: env, 'args-file': argsFile, 'result-file': resultFile, 'repo-root': sb,
    }));
    assert.strictEqual(json.verdict, 'ok');
    assert.deepStrictEqual(json.receiptsAdded, ['mccp-implement-codex/x.json']);
  } finally { rimraf(sb); }
});

test('reconcile (Task path): --from-envelope mirrors envelope → ok', () => {
  const sb = makeSandbox();
  try {
    const env = writeTerminal(sb);
    writeReceiptFile(sb, 'mccp-implement-codex/x.json');
    const argsFile = writeArgsFile(sb);
    const { json } = captureEmit(() => cli.cmdReconcile({
      envelope: env, 'args-file': argsFile, 'from-envelope': true, 'repo-root': sb,
    }));
    assert.strictEqual(json.verdict, 'ok');
  } finally { rimraf(sb); }
});

test('reconcile F2: result status disagrees with envelope → reconcile-mismatch', () => {
  const sb = makeSandbox();
  try {
    const env = writeTerminal(sb); // envelope ok
    writeReceiptFile(sb, 'mccp-implement-codex/x.json');
    const argsFile = writeArgsFile(sb);
    const resultFile = writeResultFile(sb, {
      status: 'failure', receiptsAdded: ['mccp-implement-codex/x.json'],
      changedFiles: [], testResult: 'x', nextAction: null,
    });
    const { json } = captureEmit(() => cli.cmdReconcile({
      envelope: env, 'args-file': argsFile, 'result-file': resultFile, 'repo-root': sb,
    }));
    assert.strictEqual(json.verdict, 'reconcile-mismatch');
  } finally { rimraf(sb); }
});

test('reconcile F3: receipt marker=false → unanchored', () => {
  const sb = makeSandbox();
  try {
    const env = writeTerminal(sb);
    writeReceiptFile(sb, 'mccp-implement-codex/x.json', { controller_context_marker_present: false });
    const argsFile = writeArgsFile(sb);
    const { json } = captureEmit(() => cli.cmdReconcile({
      envelope: env, 'args-file': argsFile, 'from-envelope': true, 'repo-root': sb,
    }));
    assert.strictEqual(json.verdict, 'unanchored');
  } finally { rimraf(sb); }
});

test('reconcile F1: envelope leaked pr-codex receipt → invariant-violation', () => {
  const sb = makeSandbox();
  try {
    const env = writeTerminal(sb, {
      receipts_added: ['mccp-implement-codex/x.json', 'mccp-pr-codex/x.json'],
    });
    writeReceiptFile(sb, 'mccp-implement-codex/x.json');
    const argsFile = writeArgsFile(sb);
    const { json } = captureEmit(() => cli.cmdReconcile({
      envelope: env, 'args-file': argsFile, 'from-envelope': true, 'repo-root': sb,
    }));
    assert.strictEqual(json.verdict, 'invariant-violation');
  } finally { rimraf(sb); }
});

test('reconcile: Workflow returned {result:null} (worker death) → result-unreadable', () => {
  const sb = makeSandbox();
  try {
    const env = writeTerminal(sb);
    const argsFile = writeArgsFile(sb);
    const p = path.join(sb, 'wf-return.json');
    fs.writeFileSync(p, JSON.stringify({ result: null, dispatchId: RECON_DISPATCH_ID }), 'utf8');
    const { json } = captureEmit(() => cli.cmdReconcile({
      envelope: env, 'args-file': argsFile, 'result-file': p, 'repo-root': sb,
    }));
    assert.strictEqual(json.verdict, 'result-unreadable');
  } finally { rimraf(sb); }
});

test('reconcile: missing --args-file → usage exit 2', () => {
  const { exitCode } = captureEmit(() => cli.cmdReconcile({}));
  assert.strictEqual(exitCode, 2);
});

// ── runCli dispatch ─────────────────────────────────────────────────────

test('runCli: no args → usage exit 2', () => {
  const { exitCode } = captureEmit(() => cli.runCli([]));
  assert.strictEqual(exitCode, 2);
});

test('runCli: unknown subcommand → usage exit 2', () => {
  const { exitCode } = captureEmit(() => cli.runCli(['bogus']));
  assert.strictEqual(exitCode, 2);
});

// ── Codex F3 — receipt write→validate round-trip accepts repo-relative ipc ──
// Faithful integration test: a real receipt CLI write in a git sandbox with
// MCCP_DISPATCH_CONTEXT=1 must ACCEPT the repo-relative ipc path (not fail
// closed) and REJECT an absolute one. Skips if git is unavailable.

function git(sb, args) {
  return spawnSync('git', args, { cwd: sb, encoding: 'utf8' });
}

test('F3: receipt write accepts repo-relative ipc path, rejects absolute (round-trip)', (t) => {
  const sb = makeSandbox();
  try {
    if (git(sb, ['init', '-q']).status !== 0) { t.skip('git unavailable'); return; }
    git(sb, ['config', 'user.email', 'test@example.com']);
    git(sb, ['config', 'user.name', 'test']);
    git(sb, ['config', 'commit.gpgsign', 'false']);
    const planRel = path.join('.claude', 'plans', 'x.plan.md');
    fs.mkdirSync(path.join(sb, '.claude', 'plans'), { recursive: true });
    fs.writeFileSync(path.join(sb, planRel), '# Plan: x\n\n## Summary\n\nx\n', 'utf8');
    git(sb, ['add', '-A']);
    if (git(sb, ['commit', '-qm', 'init']).status !== 0) { t.skip('git commit failed'); return; }

    const dispatchId = crypto.randomUUID();
    const relIpc = '.claude/state/dispatches/' + dispatchId + '.envelope.json';
    const env = Object.assign({}, process.env, {
      MCCP_DISPATCH_CONTEXT: '1',
      MCCP_BRIEFING: 'off',
      MCCP_RECEIPT_DEBUG: '',
    });

    // (a) repo-relative → accepted (exit 0)
    const okRun = spawnSync('node', [
      RECEIPT_CLI, 'write',
      '--gate', 'mccp-implement-codex',
      '--decision', 'x',
      '--plan', planRel,
      '--dispatched-by-controller-session', CONTROLLER_SESSION_ID,
      '--worker-dispatch-id', dispatchId,
      '--ipc-envelope-path', relIpc,
      '--quiet',
    ], { cwd: sb, encoding: 'utf8', env: env });
    assert.strictEqual(okRun.status, 0,
      'repo-relative ipc path must be accepted (F3). stderr: ' + okRun.stderr);

    const receiptPath = path.join(sb, '.claude', 'receipts', 'mccp-implement-codex', 'x.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.strictEqual(receipt.meta.controller_context_marker_present, true);
    assert.strictEqual(receipt.meta.dispatched_by_controller_session_id, CONTROLLER_SESSION_ID);
    assert.strictEqual(receipt.meta.worker_dispatch_id, dispatchId);
    assert.strictEqual(receipt.meta.ipc_envelope_path, relIpc);
    // schema-level confirmation of the whole written receipt
    assert.strictEqual(schema.validate(receipt).ok, true);

    // (b) absolute ipc path → fail-closed (non-zero exit, schema reject)
    const absIpc = path.join(sb, relIpc);
    const badRun = spawnSync('node', [
      RECEIPT_CLI, 'write',
      '--gate', 'mccp-implement-codex',
      '--decision', 'y',
      '--plan', planRel,
      '--dispatched-by-controller-session', CONTROLLER_SESSION_ID,
      '--worker-dispatch-id', dispatchId,
      '--ipc-envelope-path', absIpc,
      '--quiet',
    ], { cwd: sb, encoding: 'utf8', env: env });
    assert.notStrictEqual(badRun.status, 0,
      'absolute ipc path must fail-closed (F3 rationale)');
  } finally { rimraf(sb); }
});
