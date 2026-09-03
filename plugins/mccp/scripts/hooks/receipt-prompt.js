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
const envValue = require('../lib/env-contract/value');

// Resolve the receipt CLI root. Prefer Claude-injected ${CLAUDE_PLUGIN_ROOT};
// fall back to the file-location-relative path when invoked outside the plugin
// harness (e.g. manual debugging).
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const RECEIPT_DIR = path.join(PLUGIN_ROOT, 'scripts', 'receipt');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');
const STATE_DIR = path.join(PLUGIN_ROOT, 'scripts', 'state');
// v1.23.5 G1 — receipt-mode was an UNGUARDED top-level require. A load failure
// killed the process at module scope, before main() existed to route it, so the
// documented fail-open above never ran: the hook died instead of allowing. Guard
// it at module scope (a require inside a catch can itself throw) and let main()
// route the failure through g1Allow.
const receiptModeMod = (function () {
  try { return require(path.join(LIB_DIR, 'receipt-mode')); }
  catch (err) { return { _load_error: err.message }; }
})();

// v0.2.7 G1 invariant — hook-trace is loaded once at module scope so a failed
// require during a catch block can't itself throw. C6: live hook state = event
// payload only; we never reach into module/filesystem state to fabricate context.
const hookTrace = (function () {
  try { return require(path.join(LIB_DIR, 'hook-trace')); }
  catch (_) { return null; }
})();

// M2 F2 — shared block-body formatter so tamper-aware recovery guidance matches
// preflight.js and the Skill hook. Loaded optionally (fail-open): a load failure
// falls back to generic labels inside block(), never throws.
const blockFormat = (function () {
  try { return require(path.join(RECEIPT_DIR, 'block-format')); }
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
  if (envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG')) {
    process.stderr.write('[mccp-receipt-prompt] ' + msg + '\n');
  }
}

// v0.2.8 Task 2.6.5b R6-F3 — shared --plan extractor lib so both hooks
// (this UserPromptExpansion + receipt-skill PreToolUse) parse the same
// way. Without this, branch-based commands on `main`/`default` with an
// explicit --plan hit the v0.2.8 generic-slug reject path.
//
// v1.23.5 G1 — guarded, and deliberately NOT with a `catch → null` fallback like
// blockFormat above. blockFormat may degrade to null because its absence only
// coarsens block LABELS. This module is a gate INPUT: a null fallback would make
// --plan silently vanish from the validator call, which is exactly the
// "validate without --plan" defect this milestone exists to close. A missing gate
// input routes loudly through g1Allow instead.
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

// v1.3.1 — informational-hook schema lib. Shared between hook ALLOW emit,
// receipt-context-schema unit tests, and validate-callsite-lint static check.
// Module-scope require so a failed load in main() can't itself throw — same
// pattern as hook-trace above. Falls back to null → hook reverts to the v1.3.0
// hard-block default if the lib is missing.
const receiptContext = (function () {
  try { return require(path.join(__dirname, 'lib', 'receipt-context-schema')); }
  catch (_) { return null; }
})();

function allow() { return 0; }

// v0.2.7 L2a — ALLOW-path systemMessage emit when MCCP_RECEIPT_DEBUG=1.
// Mirror of v0.2.5 block-payload inline debug, but on the ALLOW side: gates
// that pass silently are invisible, which is the original silent-hook UX
// incident this milestone targets. v0.2.5 block-payload inline is preserved
// orthogonally inside block() — this function only fires on ALLOW path.
// Advanced opt-out: MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0 (legacy-only mode).
function allowWithMessage(commandName, decisionId) {
  if (!envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG')) return 0;
  if (!envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG_LEGACY_INLINE')) return 0;
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

// ── A1 착수 producer (multi-session-work-loop M8 Task 3 · DD4) ───────────────
//
// 왜 이 hook인가: matcher가 `^mccp:.*`라 `/mccp:*` 최초 발화 시점에 확실히 돌고,
// `event.session_id`와 `deriveDecisionId(commandName, command_args)`를 **둘 다**
// 이미 들고 있다. UI3이 요구하는 "최초 지시 시점"에 기계가 도달할 수 있는 가장
// 이른 지점이다. 늦게 기록하면 완주율이 부풀려진다.
//
// 왜 차단 경로에서는 emit하지 않는가: **게이트가 막은 것은 착수가 아니다.** 막힌
// 프롬프트는 사용자가 복구한 뒤 다시 발화하고 그때 이 hook이 다시 돈다. 차단을
// 분모에 넣으면 A1은 "게이트에 막힌 횟수"를 완주 실패로 세게 된다.
//
// 중복은 문제가 아니다 — A1 분모는 distinct `work_unit` 수이므로(DD3) 같은 작업
// 단위의 재발화는 집계에서 하나로 접힌다.
//
// fail-open이 절대 조건이다(UI4 — 게이트 동작 불변): 이 함수는 어떤 경우에도
// throw하지 않고, 실패는 조용히 삼키지 않고 loud stderr로 표면화한다.
//
// **작업 단위가 아닌 granularity는 분모에 넣지 않는다** (local review M3):
// `deriveDecisionId`는 (command, args)에 결정적이라 명령마다 다른 슬러그를 낼 수
// 있다. `mccp:plan-prd`가 그렇다 — PLAN_PATH_COMMANDS라 **PRD basename**을 내는데,
// UI1이 정의한 작업 단위는 "PRD milestone 1개 = plan 1개 = PR 1개"이고 PRD는 그
// 여러 개를 담는 **상위 granularity**다. 실측: PRD `multi-session-work-loop` vs
// plan/branch `multi-session-work-loop-m8`. 전자를 착수로 세면 완주 기록을 영영
// 받지 못하는 유령 work_unit이 분모에 남아 A1이 눌린다. 방향은 과소(안전)지만
// DD3이 주장한 "work_unit은 단일 키"가 성립하지 않게 된다.
const NON_WORK_UNIT_COMMANDS = new Set(['mccp:plan-prd']);

function emitTaskStarted(event, decisionId, commandName) {
  try {
    // decisionId 해소에 실패한 degraded 경로('default')는 착수로 세지 않는다 —
    // 세면 서로 다른 작업이 한 버킷으로 붕괴해 분모가 조용히 1이 된다.
    if (!decisionId || decisionId === 'default') return;
    if (NON_WORK_UNIT_COMMANDS.has(String(commandName || ''))) return;

    const mswEvents = require(path.join(STATE_DIR, 'msw-events'));
    const { resolveRawSessionId } = require(path.join(LIB_DIR, 'session-identity'));
    const { sanitizeSessionId } = require(path.join(LIB_DIR, 'utils'));

    // hook payload의 session_id가 canonical이고 env 체인은 fallback이다.
    // sanitize를 여기서 거치는 이유는 이 값이 `<sid>.jsonl` 파일명이 되기
    // 때문이다 — `appendEvent`도 자체 guard를 갖지만 그것은 초크 포인트의
    // 방어이지 호출자의 면제가 아니다(security review R1 F2).
    const sid = sanitizeSessionId(event && event.session_id)
      || sanitizeSessionId(resolveRawSessionId(process.env));
    if (!sid) {
      process.stderr.write('[mccp:msw-a1] task_started skipped — no resolvable session id\n');
      return;
    }

    // DD3 — granularity는 emit 시점에 인자에서 판정한다. 여기가 `command_args`를
    // 들고 있는 유일한 지점이라 사후 추론이 필요 없다. `NON_WORK_UNIT_COMMANDS`는
    // 그대로 둔다 — 그것은 명령 축이고 이것은 인자 축이라 조건이 서로 다르다.
    //
    // 제외는 producer가 아니라 reader가 한다: 여기서 emit을 막으면 PRD 단위 착수가
    // 몇 건이었는지 사후 확인이 영구히 불가능해지고, PRD Open Question 1이 열어 둔
    // "두 축을 분리해 각각 산출"의 문이 닫힌다.
    const res = mswEvents.appendEvent(sid, {
      kind: 'task_started',
      work_unit: decisionId,
      work_unit_kind: mswEvents.classifyWorkUnitKind(event && event.command_args),
      producer: 'receipt-prompt',
    }, { repoRoot: (event && event.cwd) || process.cwd() });

    if (!res || !res.ok) {
      process.stderr.write('[mccp:msw-a1] task_started append failed: '
        + ((res && res.reason) || 'unknown') + '\n');
    }
  } catch (err) {
    process.stderr.write('[mccp:msw-a1] task_started emit error (fail-open): '
      + ((err && err.message) || String(err)) + '\n');
  }
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
  // M2 F2 — shared detail lines so a subject/receipt-tamper block is labeled
  // TAMPER (not generic INVALID) here too. Fall back to inline generic labels only
  // if the shared formatter failed to load (fail-open).
  if (blockFormat) {
    for (const l of blockFormat.blockDetailLines(result)) lines.push(l);
  } else {
    for (const m of result.missing || []) lines.push('  MISSING  ' + m.gate_id + ': ' + m.reason);
    for (const s of result.stale || []) lines.push('  STALE    ' + s.gate_id + ': ' + s.reason);
    for (const b of result.blocking || []) lines.push('  INVALID  ' + b.gate_id + ': ' + b.reason);
    for (const c of result.open_critical || []) lines.push('  CRITICAL ' + c.gate_id + ': ' + c.item);
  }
  lines.push('');
  lines.push('Bypass once: MCCP_SKIP_RECEIPT=1');
  lines.push('Inspect:     node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status');
  // M2 F2 — offer "Write missing receipt" ONLY when something is actually MISSING.
  // For a tamper/stale/critical block, writing a receipt would overwrite the
  // evidence (tamper) or paper over the failure. This mirrors preflight.js, which
  // gates its recovery hints on missing.length / stale.length.
  if ((result.missing || []).length > 0) {
    lines.push('Write missing receipt: node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write --gate <id> --decision ' + decisionId + ' --plan <path>');
  }
  // M2 F2 — investigation-first tamper guidance, identical wording across all
  // three surfaces via the shared formatter.
  if (blockFormat) {
    for (const l of blockFormat.tamperGuidanceLines(result)) lines.push(l);
  }

  if (envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG')) {
    lines.push('');
    lines.push('[DEBUG] mode=' + (process.env.MCCP_RECEIPT_GATE_MODE || 'hard') + ' decision="' + decisionId + '"');
    lines.push('[DEBUG] hook stderr is not surfaced in UserPromptExpansion block payload; debug inlined here.');
  }

  const isTamper = blockFormat
    ? blockFormat.hasTamper(result)
    : (result.blocking || []).some(function (b) { return b && (b.kind === 'receipt-tamper' || b.kind === 'subject-tamper'); });
  const additionalContext = isTamper
    ? 'mccp gate enforcement: a receipt failed INTEGRITY verification (hash tamper). Do NOT regenerate or overwrite it — inspect the receipt against its source and investigate the change before any re-run.'
    : 'mccp gate enforcement: previous-phase receipt is missing or stale. Either write the receipt, fix the staleness, or bypass with MCCP_SKIP_RECEIPT=1.';

  const payload = {
    decision: 'block',
    reason: lines.join('\n'),
    hookSpecificOutput: {
      hookEventName: 'UserPromptExpansion',
      additionalContext: additionalContext,
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

  if (envValue.parseBool(process.env, 'MCCP_SKIP_RECEIPT')) {
    debug('MCCP_SKIP_RECEIPT=1 bypass');
    return allow();
  }

  // v1.23.5 G1 — core gate modules (receipt-mode, extract-plan-path). Checked
  // here rather than at module scope so the failure takes the SAME loud
  // fail-open path as a validate-cmd load failure below: stdin is already
  // parsed, so g1Allow can write an L1 shard against the real session.
  const coreErr = coreModuleLoadError();
  if (coreErr) {
    debug('cannot load core gate module: ' + coreErr);
    return g1Allow(event, {
      exceptionClass: 'ModuleLoadError',
      reason: coreErr,
      commandName: commandName,
    });
  }

  // v0.2.2 Task 4 — MCCP_RECEIPT_GATE_MODE resolution.
  // 'off' → bypass entirely with loud stderr warning (debugging only).
  // 'soft' → opt-in, allow missing receipts (no placeholder write at hook time;
  //          placeholders are operator-driven via /mccp:receipt-write).
  // 'hard' (default) → existing behavior, block on missing/stale.
  const receiptMode = receiptModeMod.resolveMode(process.env);
  if (receiptMode === 'off') {
    receiptModeMod.warnIfOff('off', 'UserPromptExpansion ' + commandName);
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
  // v1.1.0-s1 — /mccp:review-pr is documented as an alias of /mccp:code-review,
  // so it must honor the same --standalone / Local Review Mode bypass. Without
  // this the alias path falls through to deriveDecisionId + branch-fallback and
  // blocks on a phantom mccp-pr-codex receipt the user never owed.
  const REVIEW_BYPASS_COMMANDS = new Set(['mccp:code-review', 'mccp:review-pr']);
  if (decisionMod && REVIEW_BYPASS_COMMANDS.has(commandName.toLowerCase())) {
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
  const planPath = extractPlanPathMod.extractPlanPath(event.command_args);
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
    emitTaskStarted(event, decisionId, commandName);
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
    emitTaskStarted(event, decisionId, commandName);
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

  // v1.3.1 — Informational hook for the recoverable subset.
  //
  // The architectural invariant from prior milestones is "every gate receipt
  // is mechanically proved before its consumer runs". The user-experience
  // cost was a 4-step hand-recovery whenever a previous session crashed
  // mid-/mccp:plan and left the receipt unwritten. v1.3.1 narrows the
  // mechanical invariant to its real load-bearing surface — stale, blocking,
  // and open_critical results — and reclassifies the missing-only case for
  // /mccp:plan, /mccp:prp-implement, /mccp:resume as informational context
  // that Phase 0 of those commands can auto-recover from deterministically.
  //
  // Terminal/mutating commands (/mccp:pr, /mccp:code-review) are NOT in the
  // recoverable allow-list — they stay hard-block (R2-F2 absorption: code-
  // review POSTs an external GitHub review). The hard-block path below is
  // untouched for them and for any stale/blocking/critical result.
  if (kind === 'block' &&
      receiptContext &&
      receiptContext.isRecoverable(commandName) &&
      (result.missing || []).length > 0 &&
      (result.stale || []).length === 0 &&
      (result.blocking || []).length === 0 &&
      (result.open_critical || []).length === 0) {
    debug('INFORMATIONAL ' + commandName + ' (decision="' + decisionId +
          '") — missing-only, recoverable, emitting context + ALLOW');
    emitTaskStarted(event, decisionId, commandName);
    try {
      const ctx = receiptContext.buildAdditionalContext(
        commandName,
        decisionId,
        planPath,
        event.cwd || process.cwd(),
        result,
        kind
      );
      const firstMissing = (result.missing[0] && result.missing[0].gate_id) || 'receipt';
      process.stdout.write(JSON.stringify({
        systemMessage: '[mccp] receipt-gate informational: ' + commandName +
          ' missing ' + firstMissing + ' (decision="' + decisionId +
          '"). Phase 0 of the command will auto-recover.',
        hookSpecificOutput: {
          hookEventName: 'UserPromptExpansion',
          additionalContext: JSON.stringify(ctx),
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
    emitTaskStarted(event, decisionId, commandName);
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
