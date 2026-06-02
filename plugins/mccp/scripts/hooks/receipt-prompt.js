#!/usr/bin/env node
'use strict';

// UserPromptExpansion hook: gate /mccp:* commands at slash-command expansion time.
// Reads JSON event from stdin, runs mccp-receipt preflight, emits block JSON if needed.
//
// Block protocol (per https://code.claude.com/docs/en/hooks):
//   stdout: {"decision":"block","reason":"..."}
//   exit code 0
//
// Fail-open: any error in this hook itself (parse, missing module, etc.) MUST
// allow the command through. A buggy gate is worse than no gate.

const path = require('path');

// Resolve the receipt CLI root. Prefer Claude-injected ${CLAUDE_PLUGIN_ROOT};
// fall back to the file-location-relative path when invoked outside the plugin
// harness (e.g. manual debugging).
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const RECEIPT_DIR = path.join(PLUGIN_ROOT, 'scripts', 'receipt');

function readStdin() {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 25000); // safety: well under 30s timeout
  });
}

function extractDecisionId(commandArgs) {
  if (!commandArgs || typeof commandArgs !== 'string') return 'default';
  const m = commandArgs.match(/--decision[=\s]+([a-z0-9][a-z0-9-]*)/i);
  if (m) return m[1].toLowerCase();
  const first = commandArgs.trim().split(/\s+/)[0];
  if (first && /^[a-z][a-z0-9-]{0,80}$/i.test(first)) {
    return first.toLowerCase();
  }
  return 'default';
}

function debug(msg) {
  if (process.env.MCCP_RECEIPT_DEBUG === '1') {
    process.stderr.write('[mccp-receipt-prompt] ' + msg + '\n');
  }
}

function allow() { return 0; }

function block(commandName, decisionId, result) {
  const lines = [];
  lines.push('[MCCP-RECEIPT-GATE] ' + commandName + ' (decision="' + decisionId + '") blocked:');
  for (const m of result.missing || []) {
    lines.push('  MISSING  ' + m.gate_id + ': ' + m.reason);
  }
  for (const s of result.stale || []) {
    lines.push('  STALE    ' + s.gate_id + ': ' + s.reason);
  }
  for (const b of result.blocking || []) {
    lines.push('  INVALID  ' + b.gate_id + ': ' + b.reason);
  }
  for (const c of result.open_critical || []) {
    lines.push('  CRITICAL ' + c.gate_id + ': ' + c.item);
  }
  lines.push('');
  lines.push('Bypass once: MCCP_SKIP_RECEIPT=1');
  lines.push('Inspect:     node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status');
  lines.push('Write missing receipt: node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write --gate <id> --decision ' + decisionId + ' --plan <path>');

  const payload = {
    decision: 'block',
    reason: lines.join('\n'),
    hookSpecificOutput: {
      hookEventName: 'UserPromptExpansion',
      additionalContext: 'mccp gate enforcement: previous-phase receipt is missing or stale. Either write the receipt, fix the staleness, or bypass with MCCP_SKIP_RECEIPT=1.',
    },
  };
  process.stdout.write(JSON.stringify(payload));
  return 0;
}

async function main() {
  let event = null;
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      debug('empty stdin');
      return allow();
    }
    event = JSON.parse(raw);
  } catch (err) {
    debug('stdin parse error: ' + err.message);
    return allow();
  }

  const commandName = (event && event.command_name) || '';
  if (!commandName.toLowerCase().startsWith('mccp:')) {
    debug('not an mccp:* command (got "' + commandName + '"); skipping');
    return allow();
  }

  if (process.env.MCCP_SKIP_RECEIPT === '1') {
    debug('MCCP_SKIP_RECEIPT=1 bypass');
    return allow();
  }

  let validateCommand;
  try {
    validateCommand = require(path.join(RECEIPT_DIR, 'validate-cmd')).validateCommand;
  } catch (err) {
    debug('cannot load validate-cmd: ' + err.message);
    return allow();
  }

  const decisionId = extractDecisionId(event.command_args);
  let result;
  try {
    result = validateCommand(commandName, {
      decisionId: decisionId,
      cwd: event.cwd || process.cwd(),
    });
  } catch (err) {
    debug('validate error: ' + err.message);
    return allow();
  }

  if (result.ok) {
    debug('OK ' + commandName + ' (decision="' + decisionId + '")');
    return allow();
  }

  debug('BLOCK ' + commandName + ' (decision="' + decisionId + '")');
  return block(commandName, decisionId, result);
}

main().then(function (code) {
  process.exit(code);
}).catch(function (err) {
  process.stderr.write('[mccp-receipt-prompt] fatal: ' + (err && err.stack || err) + '\n');
  process.exit(0);
});
