#!/usr/bin/env node
'use strict';

// dedupe-check — Cross-gate dedupe wrapper for /mccp:pr Phase 2.5.2.
//
// v0.2.8 Task 2.6.1-followup F10 — extracts the Phase 2.5.2 Bash logic into
// a single Node helper so pr-phase-guard.js can replace its head-token regex
// allowlist with a single helper-path anchored pattern. Wraps the existing
// `receipt/cli.js dedupe` subcommand — does not duplicate parsing.
//
// Argv: --decision <slug> --plan <path> --base <ref> [--cwd <path>] [--json]
// Stdout (JSON):
//   { ok, skip_safe, residual: [string], dedupe_note: string, sources: [string], raw }
// Exit 0 on success (regardless of skip_safe). Exit 1 on caller error.

const { parseArgs, locateReceiptCli, callReceiptCli, emit, fail } =
  require('./_args');

function buildDedupeNote(parsed, decision) {
  if (parsed.skip_safe === true) {
    const plan = parsed.convergence && parsed.convergence.plan_codex_receipt;
    const impl = parsed.convergence && parsed.convergence.implement_codex_receipt;
    const rN1 = plan && typeof plan.round === 'number' ? plan.round : 1;
    const rN2 = impl && typeof impl.round === 'number' ? impl.round : 1;
    return 'Decision `' + decision + '` already converged in mccp-plan-codex ' +
      '(round ' + rN1 + ') and mccp-implement-codex (round ' + rN2 + '). ' +
      'PR-Codex skipped inside scope.';
  }
  return '';
}

function run(args) {
  if (!args.decision) return fail('--decision <slug> required');
  if (!args.plan) return fail('--plan <path> required');
  if (!args.base) return fail('--base <ref> required');

  const cli = locateReceiptCli();
  const cliArgs = [
    'dedupe',
    '--plan', args.plan,
    '--base', args.base,
    '--decision', args.decision,
  ];
  if (args.cwd) cliArgs.push('--cwd', args.cwd);

  const result = callReceiptCli(cli, cliArgs, { cwd: args.cwd });
  if (result.error) {
    return emit({
      ok: false,
      skip_safe: false,
      residual: [],
      dedupe_note: '',
      sources: ['receipt-cli-error: ' + result.error],
      raw: null,
    }, 0);
  }

  let parsed = null;
  try { parsed = JSON.parse(result.stdout); }
  catch (err) {
    return emit({
      ok: false,
      skip_safe: false,
      residual: [],
      dedupe_note: '',
      sources: ['parse-error: ' + err.message],
      raw: result.stdout,
    }, 0);
  }

  const skipSafe = parsed.ok === true && parsed.skip_safe === true;
  const residual = Array.isArray(parsed.residual) ? parsed.residual : [];
  const note = skipSafe ? buildDedupeNote(parsed, args.decision) : '';
  const sources = [];
  if (parsed.convergence && parsed.convergence.plan_codex_receipt && parsed.convergence.plan_codex_receipt.path) {
    sources.push(parsed.convergence.plan_codex_receipt.path);
  }
  if (parsed.convergence && parsed.convergence.implement_codex_receipt && parsed.convergence.implement_codex_receipt.path) {
    sources.push(parsed.convergence.implement_codex_receipt.path);
  }

  return emit({
    ok: parsed.ok !== false,
    skip_safe: skipSafe,
    residual: residual,
    dedupe_note: note,
    sources: sources,
    raw: parsed,
  }, 0);
}

if (require.main === module) {
  process.exit(run(parseArgs(process.argv.slice(2))));
}

module.exports = { run, buildDedupeNote };
