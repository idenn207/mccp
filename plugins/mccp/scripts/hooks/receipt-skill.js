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
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');
// v1.23.5 G1 — receipt-mode was an UNGUARDED top-level require (mirror of the
// receipt-prompt defect). A load failure killed the process at module scope,
// before main() existed to route it, so the fail-open invariant declared above
// never ran. Guard at module scope; main() routes the failure via g1Allow.
const receiptModeMod = (function () {
  try { return require(path.join(LIB_DIR, 'receipt-mode')); }
  catch (err) { return { _load_error: err.message }; }
})();

// v0.2.7 G1 invariant — hook-trace loaded once at module scope; require failure
// can't itself throw in a catch block. C6: live hook state = event payload only.
const hookTrace = (function () {
  try { return require(path.join(LIB_DIR, 'hook-trace')); }
  catch (_) { return null; }
})();

// M2 F2 — shared block-body formatter so tamper-aware guidance matches preflight
// and the UserPromptExpansion hook. Optional (fail-open): null → generic labels.
const blockFormat = (function () {
  try { return require(path.join(RECEIPT_DIR, 'block-format')); }
  catch (_) { return null; }
})();

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
      'PreToolUseSkill',
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
  const msg = '[mccp] Skill receipt-gate internal error (allowing): ' +
    (opts.exceptionClass || 'unknown') +
    (opts.reason ? ': ' + opts.reason : '') +
    (tracePath ? '\n  trace: ' + tracePath : '');
  try {
    process.stdout.write(JSON.stringify({
      systemMessage: msg,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: 'mccp G1 fail-open: ' + (opts.exceptionClass || 'unknown'),
      },
    }));
  } catch (_) { /* best-effort */ }
  return 0;
}

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
    process.stderr.write('[mccp-receipt-skill] ' + msg + '\n');
  }
}

// v0.2.8 Task 2.6.5b R6-F3 — shared --plan extractor lib (dual-ingress
// parity with receipt-prompt). Skill `arguments` can arrive as a string
// or pre-tokenized array; the lib normalizes both.
//
// v1.23.5 G1 — guarded, and deliberately NOT a `catch → null` fallback like
// blockFormat above. blockFormat's absence only coarsens block LABELS; this one
// is a gate INPUT, and a null fallback would silently drop --plan from the
// validator call — the very defect this milestone closes. Route loudly instead.
const extractPlanPathMod = (function () {
  try { return require(path.join(LIB_DIR, 'extract-plan-path')); }
  catch (err) { return { _load_error: err.message }; }
})();

// Shape check, not just load success: a module that loads but lacks its export
// would crash at the callsite with the same uncaught-throw failure mode.
function coreModuleLoadError() {
  if (!receiptModeMod || typeof receiptModeMod.resolveMode !== 'function' ||
      typeof receiptModeMod.warnIfOff !== 'function') {
    return 'receipt-mode: ' +
      ((receiptModeMod && receiptModeMod._load_error) || 'missing resolveMode/warnIfOff export');
  }
  if (!extractPlanPathMod || typeof extractPlanPathMod.extractPlanPath !== 'function') {
    return 'extract-plan-path: ' +
      ((extractPlanPathMod && extractPlanPathMod._load_error) || 'missing extractPlanPath export');
  }
  return null;
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

  // v1.23.5 G1 — core gate modules (receipt-mode, extract-plan-path). Checked
  // after stdin parse so g1Allow can write an L1 shard against the real session,
  // matching the validate-cmd load-failure path below.
  const coreErr = coreModuleLoadError();
  if (coreErr) {
    debug('cannot load core gate module: ' + coreErr);
    return g1Allow(event, {
      exceptionClass: 'ModuleLoadError',
      reason: coreErr,
      commandName: skillName,
    });
  }

  // v0.2.2 Task 4 — MCCP_RECEIPT_GATE_MODE resolution (mirrors receipt-prompt.js).
  const receiptMode = receiptModeMod.resolveMode(process.env);
  if (receiptMode === 'off') {
    receiptModeMod.warnIfOff('off', 'Skill ' + skillName);
    debug('MCCP_RECEIPT_GATE_MODE=off bypass');
    return 0;
  }

  let validateCommand;
  try {
    validateCommand = require(path.join(RECEIPT_DIR, 'validate-cmd')).validateCommand;
  } catch (err) {
    debug('cannot load validate-cmd: ' + err.message);
    return g1Allow(event, {
      exceptionClass: 'ModuleLoadError',
      reason: err.message,
      commandName: skillName,
    });
  }

  const decisionMod = loadDecisionModule();
  if (decisionMod && skillName.toLowerCase() === 'mccp:code-review') {
    if (decisionMod.isStandalone(ti.arguments)) {
      debug('--standalone bypass for Skill ' + skillName);
      return 0;
    }
    if (decisionMod.isLocalReviewMode(ti.arguments)) {
      debug('Local Review Mode bypass for Skill ' + skillName + ' (no PR target in args)');
      return 0;
    }
  }

  // v0.2.8 Task 2.6.5b R6-R3 F2 — extract planPath BEFORE deriveDecisionId
  // so plan-path commands derive their decisionId from the plan basename
  // instead of the branch fallback. Mirrors the receipt-prompt swap.
  const planPath = extractPlanPathMod.extractPlanPath(ti.arguments);
  const decisionId = decisionMod
    ? decisionMod.deriveDecisionId(skillName, ti.arguments, {
        cwd: event.cwd || process.cwd(),
        planPath: planPath,
      })
    : 'default';
  let result;
  try {
    result = validateCommand(skillName, {
      decisionId: decisionId,
      cwd: event.cwd || process.cwd(),
      planPath: planPath,
    });
  } catch (err) {
    debug('validate error: ' + err.message);
    return g1Allow(event, {
      exceptionClass: 'ValidationError',
      reason: err.message,
      commandName: skillName,
    });
  }

  if (result.ok) {
    debug('OK Skill ' + skillName + ' (decision="' + decisionId + '")');
    return 0;
  }

  // v0.2.8 Task 2.6.5a A3 R2 F2 absorption — shared classifier. tempfail =
  // transient migration-in-progress; emit retry hint via systemMessage on
  // stdout and ALLOW (return 0). Skill PreToolUse hook does not block on
  // transient state.
  let classify;
  try { classify = require(path.join(RECEIPT_DIR, 'classify')); }
  catch (_) { classify = null; }
  const kind = classify ? classify.classifyValidationResult(result) : (result.ok ? 'ok' : 'block');
  if (kind === 'tempfail') {
    debug('TEMPFAIL Skill ' + skillName + ' — ALLOW + retry systemMessage');
    try {
      process.stdout.write(JSON.stringify({
        systemMessage: '[MCCP-RECEIPT-GATE] TEMPFAIL Skill ' + skillName +
          ' — migration in progress; retry shortly. (' + (result.reason || '') + ')',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: 'mccp tempfail: transient, retryable. No block emitted.',
        },
      }));
    } catch (_) { /* best-effort */ }
    return 0;
  }

  // v0.2.2 Task 4 — soft mode tolerates missing receipts only.
  if (receiptMode === 'soft' &&
      (result.stale || []).length === 0 &&
      (result.blocking || []).length === 0 &&
      (result.open_critical || []).length === 0) {
    process.stderr.write(
      '[mccp-receipt-skill] MCCP_RECEIPT_GATE_MODE=soft: allowing Skill ' + skillName +
      ' with ' + (result.missing || []).length + ' missing receipt(s).\n'
    );
    return 0;
  }

  process.stderr.write('[MCCP-RECEIPT-GATE] Skill ' + skillName + ' (decision="' + decisionId + '") blocked:\n');
  // M2 F2 — shared detail lines so a subject/receipt-tamper block is labeled
  // TAMPER (not generic INVALID). Fall back to inline labels if the shared
  // formatter failed to load (fail-open).
  if (blockFormat) {
    for (const l of blockFormat.blockDetailLines(result)) process.stderr.write(l + '\n');
  } else {
    for (const m of result.missing || []) process.stderr.write('  MISSING  ' + m.gate_id + ': ' + m.reason + '\n');
    for (const s of result.stale || []) process.stderr.write('  STALE    ' + s.gate_id + ': ' + s.reason + '\n');
    for (const b of result.blocking || []) process.stderr.write('  INVALID  ' + b.gate_id + ': ' + b.reason + '\n');
    for (const c of result.open_critical || []) process.stderr.write('  CRITICAL ' + c.gate_id + ': ' + c.item + '\n');
  }
  process.stderr.write('\nBypass once: MCCP_SKIP_RECEIPT=1\n');
  process.stderr.write('Inspect:     node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status\n');
  // M2 F2 — investigation-first tamper guidance, identical to the other surfaces.
  // A tamper block must never be silently recoverable via a plain "write receipt".
  if (blockFormat) {
    for (const l of blockFormat.tamperGuidanceLines(result)) process.stderr.write(l + '\n');
  }
  return 2;
}

main().then(function (code) {
  process.exit(code);
}).catch(function (err) {
  process.stderr.write('[mccp-receipt-skill] fatal: ' + (err && err.stack || err) + '\n');
  process.exit(0);
});
