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

// v0.2.7 G1 invariant — hook-trace is loaded once at module scope so a failed
// require during a catch block can't itself throw. C6: live hook state = event
// payload only; we never reach into module/filesystem state to fabricate context.
const hookTrace = (function () {
  try { return require(path.join(LIB_DIR, 'hook-trace')); }
  catch (_) { return null; }
})();

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

// v0.2.8 Task 2.6.5b R6-F3 — shared --plan extractor lib so both hooks
// (this UserPromptExpansion + receipt-skill PreToolUse) parse the same
// way. Without this, branch-based commands on `main`/`default` with an
// explicit --plan hit the v0.2.8 generic-slug reject path.
const { extractPlanPath } = require(path.join(LIB_DIR, 'extract-plan-path'));

function allow() { return 0; }

// v0.2.7 L2a — ALLOW-path systemMessage emit when MCCP_RECEIPT_DEBUG=1.
// Mirror of v0.2.5 block-payload inline debug, but on the ALLOW side: gates
// that pass silently are invisible, which is the original silent-hook UX
// incident this milestone targets. v0.2.5 block-payload inline is preserved
// orthogonally inside block() — this function only fires on ALLOW path.
// Advanced opt-out: MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0 (legacy-only mode).
function allowWithMessage(commandName, decisionId) {
  if (process.env.MCCP_RECEIPT_DEBUG !== '1') return 0;
  if (process.env.MCCP_RECEIPT_DEBUG_LEGACY_INLINE === '0') return 0;
  try {
    process.stdout.write(JSON.stringify({
      systemMessage: '[mccp] receipt-gate ALLOW ' + commandName +
        ' (decision="' + decisionId + '")',
      hookSpecificOutput: {
        hookEventName: 'UserPromptExpansion',
        additionalContext: 'mccp ALLOW path: ' + commandName,
      },
    }));
  } catch (_) { /* best-effort */ }
  return 0;
}

// v0.2.7 G1 helpers — opportunistic L1 shard log + universal systemMessage emit
// for any internal exception. Caller always returns 0 (allow) after this; the
// surface is observability, not enforcement. event MAY be null when stdin parse
// failed before assignment.
function tryShardLog(event, opts) {
  if (!hookTrace || !event) return null;
  const sid = event.session_id;
  const tuid = event.tool_use_id;
  if (!sid || !tuid) return null;
  try {
    const result = hookTrace.recordWrite(
      event.cwd || process.cwd(),
      sid,
      tuid,
      'UserPromptExpansion',
      {
        layer: 'G1',
        gate_decision: 'ALLOW_DUE_TO_INTERNAL_ERROR',
        command_id: opts.commandId || null,
        command_name: opts.commandName || null,
        exception_class: opts.exceptionClass || null,
        exit_code: 0,
      }
    );
    return result && result.ok ? result.path : null;
  } catch (_) { return null; }
}

function g1Allow(event, opts) {
  const tracePath = tryShardLog(event, opts);
  const msg = '[mccp] receipt-gate internal error (allowing): ' +
    (opts.exceptionClass || 'unknown') +
    (opts.reason ? ': ' + opts.reason : '') +
    (tracePath ? '\n  trace: ' + tracePath : '');
  try {
    process.stdout.write(JSON.stringify({
      systemMessage: msg,
      hookSpecificOutput: {
        hookEventName: 'UserPromptExpansion',
        additionalContext: 'mccp G1 fail-open: ' + (opts.exceptionClass || 'unknown'),
      },
    }));
  } catch (_) { /* best-effort */ }
  return 0;
}

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

  if (process.env.MCCP_RECEIPT_DEBUG === '1') {
    lines.push('');
    lines.push('[DEBUG] mode=' + (process.env.MCCP_RECEIPT_GATE_MODE || 'hard') + ' decision="' + decisionId + '"');
    lines.push('[DEBUG] hook stderr is not surfaced in UserPromptExpansion block payload; debug inlined here.');
  }

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
    return g1Allow(event, {
      exceptionClass: 'ModuleLoadError',
      reason: err.message,
      commandName: commandName,
    });
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

  // v0.2.8 Task 2.6.5b R6-R3 F2 — extract planPath BEFORE deriveDecisionId
  // so plan-path commands derive the decisionId from the plan basename
  // (not the branch-fallback main/default). Without this swap a quoted
  // `--plan "path with space.md"` would still validate plan-aware but
  // against the wrong slug — the receipt lookup misses and falls through
  // to a stale receipt at the branch slug.
  const planPath = extractPlanPath(event.command_args);
  const decisionId = decisionMod
    ? decisionMod.deriveDecisionId(commandName, event.command_args, {
        cwd: event.cwd || process.cwd(),
        planPath: planPath,
      })
    : 'default';
  let result;
  try {
    result = validateCommand(commandName, {
      decisionId: decisionId,
      cwd: event.cwd || process.cwd(),
      planPath: planPath,
    });
  } catch (err) {
    debug('validate error: ' + err.message);
    return g1Allow(event, {
      exceptionClass: 'ValidationError',
      reason: err.message,
      commandName: commandName,
    });
  }

  if (result.ok) {
    debug('OK ' + commandName + ' (decision="' + decisionId + '")');
    return allowWithMessage(commandName, decisionId);
  }

  // v0.2.8 Task 2.6.5a A3 R2 F2 absorption — shared classifier. A transient
  // migration-in-progress (tempfail) must NOT block the user's prompt; we
  // emit a retry hint via systemMessage and ALLOW. Hook stays out of the
  // way of the user's natural retry.
  let classify;
  try { classify = require(path.join(RECEIPT_DIR, 'classify')); }
  catch (_) { classify = null; }
  const kind = classify ? classify.classifyValidationResult(result) : (result.ok ? 'ok' : 'block');
  if (kind === 'tempfail') {
    debug('TEMPFAIL ' + commandName + ' — emitting retry hint + ALLOW');
    try {
      process.stdout.write(JSON.stringify({
        systemMessage: '[MCCP-RECEIPT-GATE] TEMPFAIL ' + commandName +
          ' — migration in progress; retry shortly. (' + (result.reason || '') + ')',
        hookSpecificOutput: {
          hookEventName: 'UserPromptExpansion',
          additionalContext: 'mccp tempfail: transient, retryable. No block emitted.',
        },
      }));
    } catch (_) { /* best-effort */ }
    return 0;
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
