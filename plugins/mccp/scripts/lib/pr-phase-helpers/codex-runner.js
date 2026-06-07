#!/usr/bin/env node
'use strict';

// codex-runner — orchestrates the Codex-review subphase end-to-end so pr.md
// can replace its Bash block with one helper-path call.
//
// v0.2.8 Task 2.6.1-followup F10 + F11 R3-F2 — single owner of the
// ownership_token lifecycle: capture from cmdEnter via anonymous-pipe IPC,
// pipe to cmdHeartbeat / cmdExit via stdin. Token NEVER appears in argv,
// env, or filesystem (stdout-pipe-ipc.js contract).
//
// Modes:
//   (default / --mode run)    — main orchestration
//   --mode heartbeat          — internal: forked child that runs the
//                               heartbeat loop. Reads token from stdin.
//
// Argv (--mode run):
//   --base <branch>                    REQUIRED
//   --decision <slug>                  REQUIRED
//   --body-file <path>                 REQUIRED — body draft path
//   [--skip-reason <text>]             Phase 0.2 MCCP_PR_SKIP_CODEX_REVIEW
//   [--dedupe]                         Phase 2.5.2 produced skip_safe=true
//   [--codex-invoke <path>]            override (tests)
//   [--lock-cli <path>]                override (tests)
//   [--timeout-ms <int>]               default 900000
//   [--heartbeat-ms <int>]             default 10000
//   [--cwd <path>]
// Stdout (JSON):
//   { ok, codex_outcome, codex_rounds, codex_summary, codex_actionable_findings,
//     lock_exit_ok, mutations, run_id, helper_manifest, codex_skip_reason }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const { parseArgs, locateLockCli, emit, fail } = require('./_args');
const { spawnAndCaptureToken, spawnAndPipeToken } = require('./stdout-pipe-ipc');

const NODE = process.execPath;

function locateCodexInvoke() {
  const root = process.env.CLAUDE_PLUGIN_ROOT
    || path.resolve(__dirname, '..', '..', '..');
  return path.join(root, 'scripts', 'lib', 'codex-invoke.js');
}

function readTokenFromStdinSync() {
  try {
    const buf = fs.readFileSync(0);
    return buf.toString('utf8').replace(/\r?\n$/, '').trim();
  } catch (_) { return ''; }
}

// --mode heartbeat (forked child). One-shot stdin read for the token, then
// setInterval loop. Exits on SIGTERM (parent kill) or lock-file disappearance.
function runHeartbeat(args) {
  const tok = readTokenFromStdinSync();
  if (!tok) { process.stderr.write('codex-runner heartbeat: empty token via stdin\n'); process.exit(1); }
  const runId = args['run-id'];
  const cwd = args.cwd || process.cwd();
  const lockCli = args['lock-cli'] || locateLockCli();
  const lockPath = path.join(cwd, '.claude', 'state', 'pr-phase.lock');
  const intervalMs = parseInt(args['heartbeat-ms'], 10) || 10000;

  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    clearInterval(t);
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const t = setInterval(function () {
    if (!fs.existsSync(lockPath)) { shutdown(); return; }
    const r = spawnAndPipeToken(
      [NODE, lockCli, 'heartbeat', '--run-id', runId,
        '--ownership-token-stdin', '--cwd', cwd],
      tok,
      { captureStderr: true, timeoutMs: 5000 });
    if (r.exitCode !== 0) {
      // Heartbeat refused — stop loop. Lock may have been reclaimed.
      shutdown();
    }
  }, intervalMs);
}

// --mode run main orchestration.
function runMain(args) {
  if (!args.base) return fail('--base <branch> required');
  if (!args.decision) return fail('--decision <slug> required');
  if (!args['body-file']) return fail('--body-file <path> required');

  const cwd = args.cwd || process.cwd();
  const lockCli = args['lock-cli'] || locateLockCli();
  const codexInvoke = args['codex-invoke'] || locateCodexInvoke();
  const codexTimeout = parseInt(args['timeout-ms'], 10) || 900000;
  const heartbeatMs = parseInt(args['heartbeat-ms'], 10) || 10000;
  const runId = crypto.randomUUID();

  // 1. Acquire lock via anonymous-pipe capture (F11 R3-F2).
  const enterRes = spawnAndCaptureToken(
    [NODE, lockCli, 'enter',
      '--run-id', runId, '--pid', String(process.pid),
      '--subphase', 'codex-review', '--cwd', cwd],
    { captureStderr: true, timeoutMs: 15000 });
  if (enterRes.exitCode !== 0 || !enterRes.rawToken) {
    return fail('lock enter failed (exit=' + enterRes.exitCode + ' err=' +
      (enterRes.stderr || enterRes.parseError || '') + ')', 11);
  }
  const rawToken = enterRes.rawToken;
  const helperManifest = enterRes.stdoutJSON.helper_manifest || {};

  // 2. Determine codex outcome (skip / dedupe / invoke).
  let codexOutcome = 'invoked';
  let codexSkipReason = null;
  if (args['skip-reason'] && args['skip-reason'] !== true) {
    codexOutcome = 'skipped';
    codexSkipReason = String(args['skip-reason']);
  } else if (args.dedupe) {
    codexOutcome = 'deduped';
  }

  // 3. Fork background heartbeat (token via stdin, run_id via argv — not secret).
  let heartbeatChild = null;
  if (codexOutcome === 'invoked') {
    heartbeatChild = spawn(NODE, [__filename,
      '--mode', 'heartbeat',
      '--run-id', runId,
      '--cwd', cwd,
      '--lock-cli', lockCli,
      '--heartbeat-ms', String(heartbeatMs),
    ], {
      stdio: ['pipe', 'ignore', 'inherit'],
      detached: false,
    });
    heartbeatChild.stdin.write(rawToken + '\n');
    heartbeatChild.stdin.end();
  }

  // 4. Invoke Codex (or short-circuit).
  let codexRounds = 0;
  let codexSummary = '';
  let codexActionableFindings = false;
  if (codexOutcome === 'skipped') {
    codexSummary = 'MCCP_PR_SKIP_CODEX_REVIEW audited escape (reason recorded in receipt).';
  } else if (codexOutcome === 'deduped') {
    codexSummary = 'Decision ' + args.decision + ' already converged in mccp-plan-codex + mccp-implement-codex; cross-gate dedupe applied at PR step.';
  } else {
    const focus = args.focus || ('challenge this PR diff against base ' + args.base);
    const codexRes = spawnSync(NODE, [codexInvoke, 'adversarial-review',
      '--focus', focus,
      '--base', args.base,
      '--timeout-ms', String(codexTimeout),
      '--json',
    ], {
      cwd: cwd,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: codexTimeout + 30000,
    });
    let codexJson = null;
    try { codexJson = JSON.parse(codexRes.stdout || '{}'); } catch (_) {}
    const codexClass = codexJson && codexJson.classification;
    const codexBlocking = codexJson && codexJson.blocking;
    if (codexRes.status !== 0 || codexBlocking || codexClass !== 'ok') {
      // Release lock before fail-stop so next invocation isn't blocked.
      tryHeartbeatStop(heartbeatChild);
      tryLockExit(lockCli, runId, rawToken, cwd);
      return fail('codex review failed (class=' + codexClass +
        ' exit=' + codexRes.status + ')', 12);
    }
    const findings = Array.isArray(codexJson.findings) ? codexJson.findings : [];
    codexActionableFindings = findings.length > 0;
    codexRounds = codexJson.rounds || 1;
    codexSummary = codexJson.summary || codexJson.conclusion || '';
  }

  // 5. Kill heartbeat, then exit lock and capture mutations.
  tryHeartbeatStop(heartbeatChild);
  const exitRes = spawnAndPipeToken(
    [NODE, lockCli, 'exit',
      '--run-id', runId, '--ownership-token-stdin', '--cwd', cwd],
    rawToken,
    { captureStderr: true, timeoutMs: 15000 });
  let exitJson = null;
  try { exitJson = JSON.parse(exitRes.stdout || '{}'); } catch (_) {}
  const lockExitOk = !!(exitJson && exitJson.ok);
  const mutations = (exitJson && Array.isArray(exitJson.mutations)) ? exitJson.mutations : [];
  const baselineMissing = !!(exitJson && exitJson.baseline_missing);

  return emit({
    ok: lockExitOk,
    codex_outcome: codexOutcome,
    codex_rounds: codexRounds,
    codex_summary: codexSummary,
    codex_actionable_findings: codexActionableFindings,
    codex_skip_reason: codexSkipReason,
    lock_exit_ok: lockExitOk,
    baseline_missing: baselineMissing,
    mutations: mutations,
    run_id: runId,
    helper_manifest: helperManifest,
  }, lockExitOk ? 0 : 1);
}

function tryHeartbeatStop(child) {
  if (!child) return;
  try { child.kill('SIGTERM'); } catch (_) {}
}

function tryLockExit(lockCli, runId, rawToken, cwd) {
  try {
    spawnAndPipeToken(
      [NODE, lockCli, 'exit',
        '--run-id', runId, '--ownership-token-stdin', '--cwd', cwd],
      rawToken,
      { captureStderr: true, timeoutMs: 10000 });
  } catch (_) { /* best-effort */ }
}

function main(argv) {
  const args = parseArgs(argv);
  const mode = args.mode || 'run';
  if (mode === 'heartbeat') return runHeartbeat(args);
  return runMain(args);
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main, runMain, runHeartbeat };
