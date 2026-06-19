#!/usr/bin/env node
'use strict';

// ultracode-phase-guard — PreToolUse hook enforcing mccp-write isolation
// during /effort ultracode delegation (mccp v1.4.0 axis B / M2).
//
// Lifecycle: prp-implement Phase 3.5 calls ultracode-phase-lock.js enter
// before emitting the GUIDE PROMPT to the user. While the lock file is
// present, this PreToolUse hook DENY-blocks any tool call that would
// mutate mccp's audit surface (Edit/Write/NotebookEdit/MultiEdit, receipt
// CLI write, state-writer, mccp:* skill invocations). It ALLOWS read-only
// tools, git read commands, and the lock CLI's exit/heartbeat/detect-stale
// subcommands.
//
// F2 absorption (binding): lock file present but malformed (JSON parse
// error, 0-byte, missing required field) → DENY (fail-CLOSED). lock file
// absent → ALLOW (no isolation active). This inverts the previous
// fail-open default — a corrupt lock cannot be relied upon as proof of
// no-active-delegation; the operator must run `detect-stale` to clean
// up before mccp work proceeds.
//
// F1 absorption (Scenario A default + Scenario B fallback): If both
//   - hook payload `event.session_id` is present AND
//   - lock body `owner_session_id` is present AND
//   - they DIFFER
// → caller is a different session (workflow subagent) → ALLOW.
// Otherwise (same session, OR either field absent) → enforce deny matrix.
// When either field is absent we log a stderr warning per CLAUDE.md
// `feedback-loud-fail-open` and proceed with deny enforcement; the
// session_id field is a best-effort discriminator, not the SSoT.

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// Deny matrix for Bash (per-segment after tokenize).
const BASH_DENY_PATTERNS = [
  // receipt write (any path ending in receipt/cli.js write)
  /\breceipt[\/\\]cli\.js\b[^|;&]*\swrite\b/,
  // state-writer (STATE.md mutator)
  /\bstate-writer\b/,
  // fix-task writer
  /\bfix-task\b/,
  // direct shell redirect into .claude/state/
  /(?:>|>>)\s*[^|;&]*\.claude[\/\\]state[\/\\]/,
  // mutating git commands (commit/push/reset/rebase/merge/checkout/tag-write)
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
  /\bgit\s+reset\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+merge\b/,
  /\bgit\s+stash\b/,
  /\bgit\s+checkout\s+[^-]/,
  /\bgit\s+tag\b[^|;&]*-[dDfa]/,
  /\bgit\s+branch\b[^|;&]*-[dD]/,
  // mutating filesystem commands
  /(?:^|[\s;&|])rm\s+/,
  /(?:^|[\s;&|])mv\s+/,
  /(?:^|[\s;&|])cp\s+/,
  /(?:^|[\s;&|])chmod\b/,
  /(?:^|[\s;&|])chown\b/,
  /\bsed\s+-i\b/,
  // mccp slash command via direct CLI (defense-in-depth; primary path is Skill tool)
  /\bmccp:(plan|prp-implement|prp-commit|pr|prp-pr|code-review|receipt-write)\b/,
  // npm/pnpm/yarn mutating
  /\bnpm\s+(install|i|update|upgrade)\b/,
  /\bpnpm\s+(install|i|add|remove|update)\b/,
  /\byarn\s+(add|install|upgrade|remove)\b/,
];

// Allow matrix for Bash (per-segment after tokenize). If any segment
// matches none of these AND none of the deny patterns above, default DENY.
const BASH_ALLOW_PATTERNS = [
  /^\s*git\s+(status|log|diff|rev-parse|show|ls-files|cat-file|describe|remote|config\s+--get|branch(?!\s+-[dD])|tag(?!\s+-[dDa])|blame|fetch\s+--dry-run|whatchanged|worktree\s+list)\b/,
  /^\s*gh\s+(pr|issue|repo)\s+(list|view|status|checks|diff|comments)\b/,
  /^\s*gh\s+api\b/,
  /^\s*gh\s+auth\s+status\b/,
  /^\s*node\s+["']?[^"'\s]*ultracode-phase-lock\.js["']?\s+(exit|heartbeat|read|detect-stale)\b/,
  /^\s*node\s+["']?[^"'\s]*ultracode-detect\.js["']?\s+detect\b/,
  /^\s*ls\b/,
  /^\s*pwd\s*$/,
  /^\s*echo\s+/,
  /^\s*cat\s+/,  // cat is read-only (lock body holds only sha256 hash + pid/host metadata)
];

// ─── Tokenizer (lightweight mirror of pr-phase-guard) ──────────────────────

function stripComment(s) {
  let out = '';
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\' && i + 1 < s.length) { out += c + s[i + 1]; i += 1; continue; }
      if (c === q) q = null;
      out += c;
    } else {
      if (c === '\'' || c === '"') { q = c; out += c; }
      else if (c === '#') break;
      else out += c;
    }
  }
  return out;
}

function splitSegments(s) {
  const segs = [];
  let buf = '';
  let q = null;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    if (q) {
      if (c === '\\' && n) { buf += c + n; i += 1; continue; }
      if (c === q) q = null;
      buf += c;
      continue;
    }
    if (c === '\'' || c === '"') { q = c; buf += c; continue; }
    if (c === '(') { paren += 1; buf += c; continue; }
    if (c === ')') { paren = Math.max(0, paren - 1); buf += c; continue; }
    if (paren > 0) { buf += c; continue; }
    if (c === ';') { pushSeg(segs, buf); buf = ''; continue; }
    if ((c === '&' && n === '&') || (c === '|' && n === '|')) {
      pushSeg(segs, buf); buf = ''; i += 1; continue;
    }
    buf += c;
  }
  pushSeg(segs, buf);
  return segs;
}

function pushSeg(segs, s) {
  const t = s.trim();
  if (t.length > 0) segs.push(t);
}

function tokenize(cmd) {
  if (typeof cmd !== 'string') return { ok: false, segments: [] };
  return { ok: true, segments: splitSegments(stripComment(cmd)) };
}

// Returns {decision: 'allow'|'deny', reason: <string>}
function classifyBashCommand(cmd) {
  if (typeof cmd !== 'string') return { decision: 'deny', reason: 'non-string command' };
  const trimmed = cmd.trim();
  if (!trimmed) return { decision: 'deny', reason: 'empty command' };

  const tok = tokenize(trimmed);
  if (!tok.ok || tok.segments.length === 0) {
    return { decision: 'deny', reason: 'tokenize: no segments' };
  }

  for (let s = 0; s < tok.segments.length; s++) {
    const seg = tok.segments[s];

    for (let i = 0; i < BASH_DENY_PATTERNS.length; i++) {
      if (BASH_DENY_PATTERNS[i].test(seg)) {
        return {
          decision: 'deny',
          reason: 'segment-deny: ' + BASH_DENY_PATTERNS[i].source + ' (segment: ' + seg + ')',
        };
      }
    }

    let allowed = false;
    for (let i = 0; i < BASH_ALLOW_PATTERNS.length; i++) {
      if (BASH_ALLOW_PATTERNS[i].test(seg)) { allowed = true; break; }
    }
    if (!allowed) {
      return {
        decision: 'deny',
        reason: 'no allowlist match (default-deny during ultracode delegation) — segment: ' + seg,
      };
    }
  }
  return { decision: 'allow', reason: 'all segments matched allowlist' };
}

// ─── Hook plumbing ─────────────────────────────────────────────────────────

function readStdin() {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 2000);
  });
}

function debug(msg) {
  if (process.env.MCCP_RECEIPT_DEBUG === '1') {
    process.stderr.write('[mccp:ultracode-phase-guard] ' + msg + '\n');
  }
}

function loadLockMod() {
  try { return require(path.join(LIB_DIR, 'ultracode-phase-lock')); }
  catch (err) { debug('ultracode-phase-lock unavailable: ' + err.message); return null; }
}

function detectCwd(event) {
  if (event && typeof event.cwd === 'string') return event.cwd;
  return process.cwd();
}

// Returns one of:
//   { active: false }                               — no isolation active
//   { active: true, malformed: true, reason: '…' } — F2 fail-CLOSED
//   { active: true, lock: <body> }                  — enforce deny matrix
function lockState(lockMod, cwd) {
  if (!lockMod) return { active: false };
  let root;
  try { root = lockMod.repoRoot(cwd); }
  catch (err) { debug('repoRoot failed: ' + err.message); return { active: false }; }

  const lockPath = lockMod.lockPath(root);
  if (!fs.existsSync(lockPath)) return { active: false };

  const lock = lockMod.readLock(root);
  if (!lock) {
    // existsSync said yes but readLock returned null — race or transient FS
    // glitch. Treat as malformed → fail-CLOSED.
    return { active: true, malformed: true, reason: 'read-null' };
  }
  if (lock._zero_byte) {
    return { active: true, malformed: true, reason: 'zero-byte' };
  }
  if (lock._parse_error) {
    return { active: true, malformed: true, reason: 'parse-error: ' + lock._parse_error };
  }
  // Required fields invariant — F2 absorption: missing fields = malformed.
  if (!lock.run_id || !lock.ownership_token_hash) {
    return { active: true, malformed: true, reason: 'missing-required-field' };
  }
  return { active: true, lock: lock };
}

function emitDeny(reason, lockMeta) {
  const lines = [
    '[mccp:ultracode-phase-guard] BLOCK — ultracode 격리 invariant 활성.',
    '  run_id        : ' + (lockMeta && lockMeta.run_id) || 'unknown',
    '  task_index    : ' + (lockMeta && lockMeta.task_index != null ? lockMeta.task_index : '<none>'),
    '  reason        : ' + reason,
    '',
    '  ultracode 모드로 위임된 task가 진행 중입니다. mccp 자체의 file change /',
    '  receipt write / STATE.md write / mccp:* 명령 호출은 격리 invariant에 의해',
    '  차단됩니다. /effort ultracode 모드 turn 안에서 발생한 write는 허용되지만,',
    '  이 mccp turn에서의 직접 write는 거부됩니다.',
    '',
    '  lock 해제: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js exit --run-id <id>',
    '  강제 회수: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js detect-stale',
  ];
  process.stderr.write(lines.join('\n') + '\n');
}

function emitMalformedDeny(reason) {
  const lines = [
    '[mccp:ultracode-phase-guard] BLOCK — lock file malformed (' + reason + ') — DENY (fail-closed).',
    '',
    '  ultracode lock file이 손상되었거나 필수 field가 누락되었습니다.',
    '  F2 absorption: lock 손상은 lock 메커니즘이 anticipate한 정상 상태입니다 —',
    '  fail-open으로 진행하면 audit/isolation이 무력화되므로 fail-CLOSED 처리합니다.',
    '',
    '  복구: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js detect-stale',
    '  실패 시 60s mtime 만료 후 자동 reclaim, 그 후 재시도하세요.',
  ];
  process.stderr.write(lines.join('\n') + '\n');
}

function shouldEnforceForCaller(lock, event) {
  // F1 Scenario A: prefer session-id discriminator when BOTH sides present.
  const eventSid = event && typeof event.session_id === 'string' ? event.session_id : null;
  const ownerSid = lock && typeof lock.owner_session_id === 'string' ? lock.owner_session_id : null;

  if (eventSid && ownerSid) {
    if (eventSid !== ownerSid) {
      // Different session → workflow subagent or unrelated caller → ALLOW.
      return { enforce: false, reason: 'caller-session-mismatch (workflow-agent path)' };
    }
    return { enforce: true, reason: 'caller-session-match (mccp-turn path)' };
  }

  // F1 Scenario B fallback: caller-identity discrimination not available
  // — best-effort warn (loud fail-open per CLAUDE.md feedback principle) +
  // enforce deny matrix anyway (because Scenario B's worst case is over-block
  // not under-block; users can audit blocked calls via stderr trace).
  process.stderr.write(
    '[mccp:ultracode-phase-guard] WARN — caller-identity discriminator absent ' +
    '(event.session_id=' + (eventSid || 'null') + ', lock.owner_session_id=' +
    (ownerSid || 'null') + '); falling back to Scenario B blanket-enforce.\n'
  );
  return { enforce: true, reason: 'scenario-B-fallback-blanket-enforce' };
}

function classifySkillName(name) {
  if (typeof name !== 'string') return { decision: 'allow', reason: 'non-string skill' };
  if (/^mccp:/.test(name)) {
    return { decision: 'deny', reason: 'mccp:* skill invocation during lock' };
  }
  return { decision: 'allow', reason: 'non-mccp skill' };
}

async function main() {
  let raw = '';
  try { raw = await readStdin(); } catch (_) { /* fail open on stdin error */ }
  let event = null;
  try { if (raw.trim()) event = JSON.parse(raw); }
  catch (err) { debug('stdin parse error: ' + err.message); }
  if (!event) return 0;

  const eventName = event.hook_event_name || event.eventName || '';
  if (eventName !== 'PreToolUse') return 0;

  const toolName = event.tool_name || '';
  const toolInput = event.tool_input || {};
  const cwd = detectCwd(event);

  const lockMod = loadLockMod();
  const state = lockState(lockMod, cwd);
  if (!state.active) return 0;

  if (state.malformed) {
    emitMalformedDeny(state.reason);
    process.exit(2);
    return 2;
  }

  const callerDecision = shouldEnforceForCaller(state.lock, event);
  if (!callerDecision.enforce) {
    debug('caller-allow: ' + callerDecision.reason);
    return 0;
  }

  if (WRITE_TOOLS.has(toolName)) {
    emitDeny('tool=' + toolName + ' (write-capable; ' + callerDecision.reason + ')', state.lock);
    process.exit(2);
    return 2;
  }

  if (toolName === 'Bash') {
    const cls = classifyBashCommand(toolInput.command);
    if (cls.decision === 'deny') {
      emitDeny('Bash ' + cls.reason + ' (' + callerDecision.reason + ')', state.lock);
      process.exit(2);
      return 2;
    }
  }

  if (toolName === 'Skill') {
    const cls = classifySkillName(toolInput.skill || toolInput.name);
    if (cls.decision === 'deny') {
      emitDeny('Skill ' + cls.reason + ' (' + callerDecision.reason + ')', state.lock);
      process.exit(2);
      return 2;
    }
  }

  return 0;
}

if (require.main === module) {
  main().then(function (code) { process.exit(code || 0); })
    .catch(function (err) {
      debug('main exception: ' + err.message);
      process.exit(0);  // loud fail-open on hook internals exception
    });
}

module.exports = {
  WRITE_TOOLS,
  BASH_DENY_PATTERNS,
  BASH_ALLOW_PATTERNS,
  classifyBashCommand,
  classifySkillName,
  tokenize,
  stripComment,
  splitSegments,
  lockState,
  shouldEnforceForCaller,
};
