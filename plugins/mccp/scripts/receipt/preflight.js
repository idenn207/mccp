'use strict';

const { validateCommand } = require('./validate-cmd');
const blockFormat = require('./block-format');
const envValue = require('../lib/env-contract/value');

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
    // Label via the shared formatter (block-format.js) so preflight, the
    // UserPromptExpansion hook, and the Skill hook can never disagree on whether a
    // block is TEMPFAIL / TAMPER / INVALID. tempfail → machine-readable exit 75;
    // receipt/subject-tamper → TAMPER (the recovery line below deliberately does
    // NOT say "regenerate", which would overwrite evidence).
    stderr.write('  ' + blockFormat.entryLabel(b) + ' ' + b.gate_id + ': ' + b.reason + '\n');
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
  // receipt/subject-tamper is INTEGRITY, not staleness. Do NOT route it to the
  // "regenerate" hint above: re-running the gate would overwrite the tampered
  // receipt and destroy the evidence. The shared formatter emits the same
  // investigation-first line here, in the UserPromptExpansion hook, and in the
  // Skill hook (M2 F2 — no drift between surfaces).
  for (const line of blockFormat.tamperGuidanceLines(result, GATE_TAG)) {
    stderr.write(line + '\n');
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

  if (envValue.parseBool(env, 'MCCP_SKIP_RECEIPT')) {
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

  if (envValue.parseBool(env, 'MCCP_RECEIPT_DEBUG')) {
    stderr.write(GATE_TAG + ' OK ' + result.command + ' (decision="' + result.decisionId + '")\n');
  }
  stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}

module.exports = { preflight: preflight, GATE_TAG: GATE_TAG };
