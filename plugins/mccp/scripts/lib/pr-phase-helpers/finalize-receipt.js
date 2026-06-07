#!/usr/bin/env node
'use strict';

// finalize-receipt — wraps the Phase 2.5.7 WRITE_FLAGS bash assembly +
// receipt CLI invocation. Builds the flag vector deterministically from
// (a) explicit argv flags and (b) an optional --codex-result JSON file
// produced by codex-runner.js.
//
// v0.2.8 Task 2.6.1-followup F10 — collapses the Bash array-build +
// conditional `if [ ... ]` + `WRITE_FLAGS+=(...)` ceremony so the guard
// allowlist no longer needs to permit shell array construction.
//
// Argv:
//   --gate <id>                     (default: mccp-pr-codex)
//   --decision <slug>               REQUIRED
//   --plan <path>                   REQUIRED
//   --codex-result <json-file>      optional — drives codex-skipped/dedupe/actionable
//   --security-force-override-reason <text>
//   --impeccable-skip-reason <text>
//   --quiet                         forwarded to receipt CLI
//   [--cwd <path>]
// Stdout (JSON): { ok, gate_id, decision, receipt_path, write_flags_used }
// Stderr passes through receipt CLI errors.

const fs = require('fs');
const path = require('path');
const { parseArgs, locateReceiptCli, callReceiptCli, emit, fail } =
  require('./_args');

function loadCodexResult(p) {
  if (!p) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { _load_error: err.message };
  }
}

function deriveCodexFlags(codexResult) {
  const flags = [];
  if (!codexResult || codexResult._load_error) return flags;
  // codex_outcome shape from codex-runner.js (or pr.md flow legacy):
  //   'invoked'  — actual Codex round happened; check actionable findings
  //   'skipped'  — MCCP_PR_SKIP_CODEX_REVIEW path
  //   'deduped'  — dedupe-check signalled skip_safe=true
  if (codexResult.codex_outcome === 'skipped' && codexResult.codex_skip_reason) {
    flags.push('--codex-skipped-at-pr');
    flags.push('--codex-skip-reason');
    flags.push(String(codexResult.codex_skip_reason));
  } else if (codexResult.codex_outcome === 'deduped') {
    flags.push('--codex-dedupe-at-pr');
  }
  if (codexResult.codex_actionable_findings === true) {
    flags.push('--codex-actionable-findings');
  }
  return flags;
}

function run(args) {
  if (!args.decision) return fail('--decision <slug> required');
  if (!args.plan) return fail('--plan <path> required');

  const gateId = args.gate || 'mccp-pr-codex';
  const codexResult = loadCodexResult(args['codex-result']);

  const writeFlags = [
    'write',
    '--gate', gateId,
    '--decision', args.decision,
    '--plan', args.plan,
  ];
  if (args.quiet) writeFlags.push('--quiet');

  // Conditional flags driven by codex-result
  const codexFlags = deriveCodexFlags(codexResult);
  for (let i = 0; i < codexFlags.length; i++) writeFlags.push(codexFlags[i]);

  // Security force-override (set when MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER had a reason)
  if (args['security-force-override-reason']
      && args['security-force-override-reason'] !== true) {
    writeFlags.push('--security-force-override');
    writeFlags.push('--security-force-override-reason');
    writeFlags.push(String(args['security-force-override-reason']));
  }

  // Impeccable skip (set when impeccable-detect returned skill_available=false)
  if (args['impeccable-skip-reason'] && args['impeccable-skip-reason'] !== true) {
    writeFlags.push('--impeccable-skipped');
    writeFlags.push('--impeccable-skip-reason');
    writeFlags.push(String(args['impeccable-skip-reason']));
  }

  const cli = locateReceiptCli();
  const result = callReceiptCli(cli, writeFlags, { cwd: args.cwd, timeoutMs: 60000 });
  if (result.error) {
    return fail('receipt cli error: ' + result.error, result.exitCode || 1);
  }
  if (result.exitCode !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
    return result.exitCode;
  }

  // Receipt write succeeded — compose summary
  const receiptPath = path.posix.join('.claude', 'receipts', gateId, args.decision + '.json');
  return emit({
    ok: true,
    gate_id: gateId,
    decision: args.decision,
    receipt_path: receiptPath,
    write_flags_used: writeFlags.slice(1), // drop leading 'write'
    receipt_cli_stdout: result.stdout.trim(),
  }, 0);
}

if (require.main === module) {
  process.exit(run(parseArgs(process.argv.slice(2))));
}

module.exports = { run, deriveCodexFlags };
