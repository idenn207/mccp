'use strict';

const { validateCommand } = require('./validate-cmd');

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
    stderr.write('  INVALID  ' + b.gate_id + ': ' + b.reason + '\n');
  }
  for (const c of result.open_critical) {
    stderr.write('  CRITICAL ' + c.gate_id + ': ' + c.item + '\n');
  }
  stderr.write('\n' + GATE_TAG + ' To bypass once: MCCP_SKIP_RECEIPT=1\n');
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

  if (!result.ok) {
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
