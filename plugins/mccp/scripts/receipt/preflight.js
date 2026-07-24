'use strict';

const { validateCommand } = require('./validate-cmd');

// v0.2.8 Task 2.6.5a A3 R2 F2 absorption — shared classifier. Load
// optimistically; fall back to old `result.ok` gating on load failure.
let classify;
try { classify = require('./classify'); }
catch (err) {
  process.stderr.write('[mccp-receipt-preflight] classify helper load failed (' +
    err.message + '); falling back to result.ok\n');
  classify = null;
}

const GATE_TAG = '[MCCP-RECEIPT-GATE]';

function writeBlockReason(stderr, result) {
  stderr.write(GATE_TAG + ' BLOCKED ' + result.command + ' (decision="' + result.decisionId + '"):\n');
  for (const m of result.missing) {
    stderr.write('  MISSING  ' + m.gate_id + ': ' + m.reason + '\n');
  }
  for (const s of result.stale) {
    let extra = '';
    if (s.receipt_plan_hash && s.current_plan_hash) {
      extra = ' (was ' + s.receipt_plan_hash.slice(0, 16) + ' now ' + s.current_plan_hash.slice(0, 16) + ')';
    }
    stderr.write('  STALE    ' + s.gate_id + ': ' + s.reason + extra + '\n');
  }
  for (const b of result.blocking) {
    // v0.2.8 Task 2.6.5a A3 — tempfail entries surface as TEMPFAIL so the
    // operator-facing line matches the machine-readable exit (75 vs 2).
    // P5 (audit-remediation) — receipt-tamper surfaces as TAMPER (not generic
    // INVALID) so an integrity failure is legible; the dedicated recovery line
    // below deliberately does NOT say "regenerate" (that overwrites evidence).
    let label = 'INVALID ';
    if (b && b.kind === 'tempfail') label = 'TEMPFAIL';
    else if (b && (b.kind === 'receipt-tamper' || b.kind === 'subject-tamper')) label = 'TAMPER  ';
    stderr.write('  ' + label + ' ' + b.gate_id + ': ' + b.reason + '\n');
  }
  for (const c of result.open_critical) {
    stderr.write('  CRITICAL ' + c.gate_id + ': ' + c.item + '\n');
  }
  stderr.write('\n');
  if (result.missing.length > 0) {
    stderr.write(GATE_TAG + ' To recover MISSING: /mccp:receipt-write --gate <gate_id> --decision ' + result.decisionId + ' --plan <plan path>\n');
  }
  if (result.stale.length > 0) {
    stderr.write(GATE_TAG + ' To regenerate STALE: re-run the producing gate (e.g. /mccp:plan for mccp-plan-codex, /mccp:prp-implement for mccp-implement-codex)\n');
  }
  // P5 (audit-remediation) — receipt-tamper is INTEGRITY, not staleness. Do NOT
  // route it to the "regenerate" hint above: re-running the gate would overwrite
  // the tampered receipt and destroy the evidence. Emit an investigation-first
  // line instead (Codex R1 F1).
  if (result.blocking.some(function (b) { return b && b.kind === 'receipt-tamper'; })) {
    stderr.write(GATE_TAG + ' TAMPER: receipt_hash mismatch — receipt body (findings/resolution/meta) altered after signing. Do NOT regenerate (that destroys the evidence). Inspect the receipt against its source and investigate the change before any re-run.\n');
  }
  // M2 Task 1 — subject_hash tamper is INTEGRITY, not staleness (symmetric with
  // the receipt_hash line above). Same "Do NOT regenerate" investigation-first
  // guidance — routing it to the "regenerate STALE" hint would overwrite the
  // tampered receipt and destroy the evidence.
  if (result.blocking.some(function (b) { return b && b.kind === 'subject-tamper'; })) {
    stderr.write(GATE_TAG + ' TAMPER: subject_hash mismatch — receipt subject fields (task_id/phase/gate_id/plan_hash/base_sha/head_sha/round) altered after signing. Do NOT regenerate (that destroys the evidence). Inspect the receipt against its source and investigate the change before any re-run.\n');
  }
  stderr.write(GATE_TAG + ' To bypass once: MCCP_SKIP_RECEIPT=1\n');
  stderr.write(GATE_TAG + ' To inspect:     node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status --gate <name>\n');
}

function preflight(args, io) {
  const stdout = (io && io.stdout) || process.stdout;
  const stderr = (io && io.stderr) || process.stderr;
  const env = (io && io.env) || process.env;

  const command = args.command || (args._ && args._[0]);
  if (!command) {
    stderr.write(GATE_TAG + ' ERROR: --command is required\n');
    return 1;
  }

  if (env.MCCP_SKIP_RECEIPT === '1') {
    stderr.write(GATE_TAG + ' BYPASS: MCCP_SKIP_RECEIPT=1 (logged)\n');
    stdout.write(JSON.stringify({
      ok: true,
      bypassed: true,
      command: command,
      reason: 'MCCP_SKIP_RECEIPT',
    }, null, 2) + '\n');
    return 0;
  }

  let result;
  try {
    result = validateCommand(command, {
      decisionId: args.decision || 'default',
      planPath: args.plan,
      cwd: args.cwd,
    });
  } catch (err) {
    stderr.write(GATE_TAG + ' ERROR: ' + err.message + '\n');
    return 1;
  }

  const kind = classify ? classify.classifyValidationResult(result) : (result.ok ? 'ok' : 'block');

  if (kind === 'tempfail') {
    stderr.write(GATE_TAG + ' TEMPFAIL ' + result.command + ' (decision="' + result.decisionId + '"): ' +
      (result.reason || 'transient migration-in-progress; retry shortly') + '\n');
    stdout.write(JSON.stringify(result, null, 2) + '\n');
    return classify ? classify.EXIT_TEMPFAIL : 75;
  }

  if (kind === 'block') {
    writeBlockReason(stderr, result);
    stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 2;
  }

  if (env.MCCP_RECEIPT_DEBUG === '1') {
    stderr.write(GATE_TAG + ' OK ' + result.command + ' (decision="' + result.decisionId + '")\n');
  }
  stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}

module.exports = { preflight: preflight, GATE_TAG: GATE_TAG };
