#!/usr/bin/env node
'use strict';

// PreToolUse(Skill) hook: dual-ingress for /mccp:* invoked via the Skill tool.
// Direct `/mccp:plan` typed by the user fires UserPromptExpansion. But if Claude
// (or an automation) invokes the same gate via the Skill tool, UserPromptExpansion
// is bypassed. This hook covers that path.
//
// Block protocol: exit code 2 + stderr (universal PreToolUse block signal).
//
// Fail-open on any internal error.

const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const RECEIPT_DIR = path.join(PLUGIN_ROOT, 'scripts', 'receipt');

function readStdin() {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 20000);
  });
}

function extractDecisionId(args) {
  if (!args || typeof args !== 'string') return 'default';
  const m = args.match(/--decision[=\s]+([a-z0-9][a-z0-9-]*)/i);
  if (m) return m[1].toLowerCase();
  const first = args.trim().split(/\s+/)[0];
  if (first && /^[a-z][a-z0-9-]{0,80}$/i.test(first)) {
    return first.toLowerCase();
  }
  return 'default';
}

function debug(msg) {
  if (process.env.MCCP_RECEIPT_DEBUG === '1') {
    process.stderr.write('[mccp-receipt-skill] ' + msg + '\n');
  }
}

async function main() {
  let event = null;
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      debug('empty stdin');
      return 0;
    }
    event = JSON.parse(raw);
  } catch (err) {
    debug('stdin parse error: ' + err.message);
    return 0;
  }

  if (!event || event.tool_name !== 'Skill') {
    debug('not a Skill tool call; skipping');
    return 0;
  }

  const ti = event.tool_input || {};
  const skillName = (ti.name || '').toString();
  if (!skillName.toLowerCase().startsWith('mccp:')) {
    debug('Skill name "' + skillName + '" not /mccp:*; skipping');
    return 0;
  }

  if (process.env.MCCP_SKIP_RECEIPT === '1') {
    process.stderr.write('[MCCP-RECEIPT-GATE] BYPASS: MCCP_SKIP_RECEIPT=1 (Skill ' + skillName + ')\n');
    return 0;
  }

  let validateCommand;
  try {
    validateCommand = require(path.join(RECEIPT_DIR, 'validate-cmd')).validateCommand;
  } catch (err) {
    debug('cannot load validate-cmd: ' + err.message);
    return 0;
  }

  const decisionId = extractDecisionId(ti.arguments);
  let result;
  try {
    result = validateCommand(skillName, {
      decisionId: decisionId,
      cwd: event.cwd || process.cwd(),
    });
  } catch (err) {
    debug('validate error: ' + err.message);
    return 0;
  }

  if (result.ok) {
    debug('OK Skill ' + skillName + ' (decision="' + decisionId + '")');
    return 0;
  }

  process.stderr.write('[MCCP-RECEIPT-GATE] Skill ' + skillName + ' (decision="' + decisionId + '") blocked:\n');
  for (const m of result.missing || []) process.stderr.write('  MISSING  ' + m.gate_id + ': ' + m.reason + '\n');
  for (const s of result.stale || []) process.stderr.write('  STALE    ' + s.gate_id + ': ' + s.reason + '\n');
  for (const b of result.blocking || []) process.stderr.write('  INVALID  ' + b.gate_id + ': ' + b.reason + '\n');
  for (const c of result.open_critical || []) process.stderr.write('  CRITICAL ' + c.gate_id + ': ' + c.item + '\n');
  process.stderr.write('\nBypass once: MCCP_SKIP_RECEIPT=1\n');
  process.stderr.write('Inspect:     node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status\n');
  return 2;
}

main().then(function (code) {
  process.exit(code);
}).catch(function (err) {
  process.stderr.write('[mccp-receipt-skill] fatal: ' + (err && err.stack || err) + '\n');
  process.exit(0);
});
