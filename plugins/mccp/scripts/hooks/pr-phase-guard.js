#!/usr/bin/env node
'use strict';

// pr-phase-guard — PreToolUse + PostToolUse hook enforcing review-only
// invariant during the Codex-review subphase of /mccp:pr.
//
// v0.2.8 Task 2.6.1 R1-F1 + R2-F1 + R3-F1 absorption:
//   - Declarative invariant in pr.md cannot stop a single AI lapse.
//   - This hook reads pr-phase-lock state. While subphase=codex-review:
//     * PreToolUse on write-capable tools (Edit/Write/MultiEdit/NotebookEdit)
//       blanket-denies (R2-F1 default-deny).
//     * PreToolUse on Bash applies the read-only allowlist (R3-F1 sub-allow)
//       — explicit mutation patterns DENY, ambiguous DENY (default-deny),
//       explicit read-only commands ALLOW.
//     * PostToolUse on any tool records the call into the hook-trace shard
//       with optional phase/tool/file_path fields, so the lock-exit
//       finalizer has an audit ledger to cross-check.
//   - Outside Codex-review subphase the hook is a no-op (allow + no record).
//   - Fail-open on any internal exception (v0.2.7 invariant): the worst
//     case is enforcement degrades to declarative — not "tool brick-walls
//     while real work needs to happen".

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// Explicit mutation patterns — any match → DENY.
// Layered as substring/regex checks against the raw command string.
const BASH_BLOCK_PATTERNS = [
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
  /\bgit\s+reset\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+stash\b/,
  /\bgit\s+merge\b/,
  /\bgit\s+checkout\s+[^-]/,             // checkout <path> mutates working tree
  /\bgit\s+branch\s+-[dD]\b/,            // delete branch
  /\bgit\s+tag\s+-[dDfFa]/,
  /\bgh\s+pr\s+create\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bgh\s+pr\s+edit\b/,
  /\bgh\s+pr\s+close\b/,
  /\bgh\s+pr\s+reopen\b/,
  /\bgh\s+issue\s+create\b/,
  /\bgh\s+issue\s+edit\b/,
  /\bgh\s+api\b[^|;&]*\s-X\s+(POST|PUT|PATCH|DELETE)\b/i,
  /\bgh\s+api\b[^|;&]*--method\s+(POST|PUT|PATCH|DELETE)\b/i,
  /\bnpm\s+(install|i|update|upgrade)\b/,
  /\bpnpm\s+(install|i|add|remove|update)\b/,
  /\byarn\s+(add|install|upgrade|remove)\b/,
  /(^|[\s;&|])rm\s+/,
  /(^|[\s;&|])mv\s+/,
  /(^|[\s;&|])cp\s+/,
  /(^|[\s;&|])mkdir\b/,
  /(^|[\s;&|])touch\s+/,
  /(^|[\s;&|])chmod\b/,
  /(^|[\s;&|])chown\b/,
  /\bsed\s+-i\b/,
  /\s>\s*[^&]/,                          // file redirect (rough)
  /\s>>\s*[^&]/,
  /\bcurl\b[^|;&]*\s-X\s+(POST|PUT|PATCH|DELETE)\b/i,
  /\bcurl\b[^|;&]*--data\b/i,
];

// Explicit read-only allowlist. A command is allowed if its FIRST token chain
// matches one of these. Pipes/redirects after the head are still subject to
// the block list above.
const BASH_ALLOW_PATTERNS = [
  /^\s*git\s+(status|log|diff|rev-parse|show|ls-files|cat-file|describe|remote|config\s+--get|branch(?!\s+-[dD])|tag(?!\s+-[dDa])|blame|fetch\s+--dry-run|whatchanged)\b/,
  /^\s*gh\s+(pr|issue|repo)\s+(list|view|status|checks|diff|comments)\b/,
  /^\s*gh\s+api\b/,                       // default method is GET; -X POST/etc caught by block list
  /^\s*gh\s+auth\s+status\b/,
  /^\s*(cat|head|tail|grep|find|ls|pwd|which|wc|echo|stat|file|less|more|diff|sort|uniq|cut|awk)\b/,
  /^\s*node\s+[^&|;]*\bpr-phase-lock\.js["']?\s+(read|detect-stale)\b/,
  /^\s*node\s+[^&|;]*receipt[\/\\]cli\.js["']?\s+(validate|status|derive-decision|preflight|pr-body\s+--action\s+path)\b/,
  /^\s*node\s+[^&|;]*\bimpeccable-detect\.js\b/,
  /^\s*node\s+[^&|;]*\bdep-check\.js\b/,
  /^\s*node\s+[^&|;]*\bcodex-invoke\.js\b/,  // Codex review itself must be allowed in Codex-review subphase
  /^\s*mkdir\s+-p\s+\.git\/mccp\/tmp\s*$/,    // pr.md uses this for codex stderr capture
];

function readStdin() {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 25000);
  });
}

function debug(msg) {
  if (process.env.MCCP_RECEIPT_DEBUG === '1') {
    process.stderr.write('[mccp:pr-phase-guard] ' + msg + '\n');
  }
}

function loadLock() {
  try { return require(path.join(LIB_DIR, 'pr-phase-lock')); }
  catch (err) { debug('pr-phase-lock unavailable: ' + err.message); return null; }
}

function loadHookTrace() {
  try { return require(path.join(LIB_DIR, 'hook-trace')); }
  catch (err) { debug('hook-trace unavailable: ' + err.message); return null; }
}

function detectRepoRoot(event) {
  if (event && typeof event.cwd === 'string') return event.cwd;
  return process.cwd();
}

function lockActive(lockMod, cwd) {
  if (!lockMod) return null;
  try {
    const root = lockMod.repoRoot(cwd);
    const lock = lockMod.readLock(root);
    if (!lock || lock._parse_error) return null;
    if (lock.subphase !== lockMod.SUBPHASE_DEFAULT) return null;
    return { root: root, lock: lock };
  } catch (err) {
    debug('lockActive error: ' + err.message);
    return null;
  }
}

function classifyBashCommand(cmd) {
  if (typeof cmd !== 'string') return { decision: 'deny', reason: 'non-string command' };
  const trimmed = cmd.trim();
  if (!trimmed) return { decision: 'deny', reason: 'empty command' };

  for (let i = 0; i < BASH_BLOCK_PATTERNS.length; i++) {
    if (BASH_BLOCK_PATTERNS[i].test(trimmed)) {
      return { decision: 'deny', reason: 'explicit mutation pattern: ' + BASH_BLOCK_PATTERNS[i].source };
    }
  }
  for (let i = 0; i < BASH_ALLOW_PATTERNS.length; i++) {
    if (BASH_ALLOW_PATTERNS[i].test(trimmed)) {
      return { decision: 'allow', reason: 'read-only allowlist match' };
    }
  }
  return { decision: 'deny', reason: 'no allowlist match (default-deny in Codex-review subphase)' };
}

function denyBlock(reason, lockMeta) {
  const lines = [
    '[mccp:pr-phase-guard] BLOCK — review-only invariant active.',
    '  subphase: ' + (lockMeta.subphase || 'codex-review'),
    '  run_id  : ' + lockMeta.run_id,
    '  reason  : ' + reason,
    '',
    '  Codex-review subphase forbids write-tool calls. Per pr.md Phase 2.5.3,',
    '  findings flow into the PR body only — fix-cycle requires a separate',
    '  /mccp:plan or /mccp:prp-implement invocation after /mccp:pr exits.',
    '',
    '  To release the lock manually (e.g. after a crash): node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-lock.js detect-stale',
  ];
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(2);
}

function extractFilePath(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  if (WRITE_TOOLS.has(toolName)) {
    if (typeof toolInput.file_path === 'string') return toolInput.file_path;
    if (typeof toolInput.notebook_path === 'string') return toolInput.notebook_path;
  }
  return null;
}

function recordPostUse(traceMod, event, ctx) {
  if (!traceMod || !event) return;
  const sessionId = event.session_id;
  const toolUseId = event.tool_use_id;
  if (!sessionId || !toolUseId) return;
  const filePath = extractFilePath(event.tool_name, event.tool_input);
  const filePathTruncated = filePath ? filePath.slice(0, 250) : null;
  try {
    traceMod.recordWrite(ctx.root, sessionId, toolUseId, 'post', {
      command_name: '/mccp:pr',
      gate_decision: 'pr-phase-guard:audit',
      layer: 'L2c',
      phase: ctx.lock.subphase || 'codex-review',
      tool: event.tool_name || null,
      file_path: filePathTruncated,
    });
  } catch (err) {
    debug('recordPostUse error: ' + err.message);
  }
}

async function main() {
  let raw = '';
  try { raw = await readStdin(); } catch (_) { /* fail open */ }
  let event = null;
  try { if (raw.trim()) event = JSON.parse(raw); }
  catch (err) { debug('stdin parse error: ' + err.message); }
  if (!event) return 0;

  const eventName = event.hook_event_name || event.eventName || '';
  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const cwd = detectRepoRoot(event);

  const lockMod = loadLock();
  const active = lockActive(lockMod, cwd);
  if (!active) return 0;

  if (eventName === 'PreToolUse') {
    if (WRITE_TOOLS.has(toolName)) {
      denyBlock('tool=' + toolName + ' is write-capable (blanket default-deny)', active.lock);
      return 2;
    }
    if (toolName === 'Bash') {
      const cls = classifyBashCommand(toolInput.command);
      if (cls.decision === 'deny') {
        denyBlock('Bash ' + cls.reason, active.lock);
        return 2;
      }
    }
    return 0;
  }

  if (eventName === 'PostToolUse') {
    const traceMod = loadHookTrace();
    recordPostUse(traceMod, event, { root: active.root, lock: active.lock });
    return 0;
  }

  return 0;
}

if (require.main === module) {
  main().then(function (code) { process.exit(code || 0); })
    .catch(function (err) {
      debug('main exception: ' + err.message);
      process.exit(0);
    });
}

module.exports = {
  WRITE_TOOLS,
  BASH_BLOCK_PATTERNS,
  BASH_ALLOW_PATTERNS,
  classifyBashCommand,
  lockActive,
  extractFilePath,
};
