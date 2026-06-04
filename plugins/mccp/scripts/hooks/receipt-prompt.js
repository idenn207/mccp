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
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');
const { resolveMode: resolveReceiptMode, warnIfOff } = require(path.join(LIB_DIR, 'receipt-mode'));

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

function loadDecisionModule() {
  try {
    return require(path.join(RECEIPT_DIR, 'decision'));
  } catch (err) {
    debug('cannot load decision module: ' + err.message);
    return null;
  }
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

  // v0.2.2 Task 4 — MCCP_RECEIPT_GATE_MODE resolution.
  // 'off' → bypass entirely with loud stderr warning (debugging only).
  // 'soft' → opt-in, allow missing receipts (no placeholder write at hook time;
  //          placeholders are operator-driven via /mccp:receipt-write).
  // 'hard' (default) → existing behavior, block on missing/stale.
  const receiptMode = resolveReceiptMode(process.env);
  if (receiptMode === 'off') {
    warnIfOff('off', 'UserPromptExpansion ' + commandName);
    debug('MCCP_RECEIPT_GATE_MODE=off bypass');
    return allow();
  }

  let validateCommand;
  try {
    validateCommand = require(path.join(RECEIPT_DIR, 'validate-cmd')).validateCommand;
  } catch (err) {
    debug('cannot load validate-cmd: ' + err.message);
    return allow();
  }

  const decisionMod = loadDecisionModule();
  if (decisionMod && commandName.toLowerCase() === 'mccp:code-review') {
    if (decisionMod.isStandalone(event.command_args)) {
      debug('--standalone bypass for ' + commandName);
      return allow();
    }
    if (decisionMod.isLocalReviewMode(event.command_args)) {
      debug('Local Review Mode bypass for ' + commandName + ' (no PR target in args)');
      return allow();
    }
  }

  const decisionId = decisionMod
    ? decisionMod.deriveDecisionId(commandName, event.command_args, { cwd: event.cwd || process.cwd() })
    : 'default';
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

  // v0.2.2 Task 4 — soft mode: ONLY missing receipts pass; stale/blocking/critical
  // still block (those are integrity failures, not Codex unavailability).
  if (receiptMode === 'soft' &&
      (result.stale || []).length === 0 &&
      (result.blocking || []).length === 0 &&
      (result.open_critical || []).length === 0) {
    process.stderr.write(
      '[mccp-receipt-prompt] MCCP_RECEIPT_GATE_MODE=soft: allowing ' + commandName +
      ' with ' + (result.missing || []).length + ' missing receipt(s). ' +
      'Audit-write a placeholder via: node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write --codex-skipped\n'
    );
    return allow();
  }

  debug('BLOCK ' + commandName + ' (decision="' + decisionId + '", mode=' + receiptMode + ')');
  return block(commandName, decisionId, result);
}

main().then(function (code) {
  process.exit(code);
}).catch(function (err) {
  process.stderr.write('[mccp-receipt-prompt] fatal: ' + (err && err.stack || err) + '\n');
  process.exit(0);
});
