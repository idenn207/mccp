#!/usr/bin/env node
'use strict';

// goal-phase-guard — PreToolUse hook enforcing mccp-write isolation during
// /goal completion-condition delegation (mccp v1.x.x axis C / M3).
//
// Lifecycle: /mccp:milestone-close Phase 2 calls goal-phase-lock.js enter
// before emitting the cooperative-guide prompt that asks the user to invoke
// /goal out-of-band. While the lock file is present, this PreToolUse hook
// DENY-blocks any tool call that would mutate mccp's audit surface
// (Edit/Write/MultiEdit/NotebookEdit, receipt CLI write, state-writer,
// milestone-closures write, mccp:* skill invocations). It ALLOWS read-only
// tools, git read commands, and the lock CLI's exit/heartbeat/detect-stale
// subcommands.
//
// F2 absorption (binding): lock file present but malformed (JSON parse
// error, 0-byte, missing required field) → DENY (fail-CLOSED). lock file
// absent → ALLOW (no isolation active).
//
// F3 absorption (Codex implement-codex R1) — STRICT non-owner policy:
//   - If event.session_id == lock.owner_session_id (mccp's own turn) →
//     enforce full deny matrix (no writes during goal-phase).
//   - If event.session_id != lock.owner_session_id (theoretical sub-session
//     /goal evaluator path) → ALLOW only read-only tools (Read, Grep, Glob,
//     ToolSearch + git read-only Bash + lock lifecycle Bash). Write tools
//     (Edit/Write/MultiEdit/NotebookEdit) and Skill mccp:* are DENY
//     regardless of session_id. This preserves the closure-doc anchor
//     (option B) custody invariant — sub-session writes cannot bypass the
//     receipt gate without surfacing in an artifact mccp audits.
//   - If either side absent → blanket-enforce + stderr warn (CLAUDE.md
//     feedback-loud-fail-open).
//
// /goal spec note (per WebFetch 2026-06-19 confirmed in plan body): /goal IS
// a session-scoped prompt-based Stop hook — evaluator runs IN the same
// session_id. F3 strict policy is defense-in-depth; the primary protection
// is that the deny matrix forbids writes regardless of session_id.

const fs = require('fs');
const path = require('path');
const envValue = require('../lib/env-contract/value');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'ToolSearch']);

const BASH_DENY_PATTERNS = [
  /\breceipt[\/\\]cli\.js\b[^|;&]*\swrite\b/,
  /\bstate-writer\b/,
  /\bfix-task\b/,
  /(?:>|>>)\s*[^|;&]*\.claude[\/\\]state[\/\\]/,
  /(?:>|>>)\s*[^|;&]*\.claude[\/\\]receipts[\/\\]/,
  /(?:>|>>)\s*[^|;&]*\.claude[\/\\]milestone-closures[\/\\]/,
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
  /\bgit\s+reset\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+merge\b/,
  /\bgit\s+stash\b/,
  /\bgit\s+checkout\s+[^-]/,
  /\bgit\s+tag\b[^|;&]*-[dDfa]/,
  /\bgit\s+branch\b[^|;&]*-[dD]/,
  /(?:^|[\s;&|])rm\s+/,
  /(?:^|[\s;&|])mv\s+/,
  /(?:^|[\s;&|])cp\s+/,
  /(?:^|[\s;&|])chmod\b/,
  /(?:^|[\s;&|])chown\b/,
  /\bsed\s+-i\b/,
  /\bmccp:(plan|prp-implement|prp-commit|pr|prp-pr|code-review|receipt-write|milestone-close)\b/,
  /\bnpm\s+(install|i|update|upgrade)\b/,
  /\bpnpm\s+(install|i|add|remove|update)\b/,
  /\byarn\s+(add|install|upgrade|remove)\b/,
];

const BASH_ALLOW_PATTERNS = [
  /^\s*git\s+(status|log|diff|rev-parse|show|ls-files|cat-file|describe|remote|config\s+--get|branch(?!\s+-[dD])|tag(?!\s+-[dDa])|blame|fetch\s+--dry-run|whatchanged|worktree\s+list)\b/,
  /^\s*gh\s+(pr|issue|repo)\s+(list|view|status|checks|diff|comments)\b/,
  /^\s*gh\s+api\b/,
  /^\s*gh\s+auth\s+status\b/,
  /^\s*node\s+["']?[^"'\s]*goal-phase-lock\.js["']?\s+(exit|heartbeat|read|detect-stale)\b/,
  /^\s*node\s+["']?[^"'\s]*goal-detect\.js["']?\s+detect\b/,
  /^\s*ls\b/,
  /^\s*pwd\s*$/,
  /^\s*echo\s+/,
  /^\s*cat\s+/,
];

// ─── Tokenizer ─────────────────────────────────────────────────────────────

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
        reason: 'no allowlist match (default-deny during goal-phase) — segment: ' + seg,
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
  if (envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG')) {
    process.stderr.write('[mccp:goal-phase-guard] ' + msg + '\n');
  }
}

function loadLockMod() {
  try { return require(path.join(LIB_DIR, 'goal-phase-lock')); }
  catch (err) { debug('goal-phase-lock unavailable: ' + err.message); return null; }
}

function detectCwd(event) {
  if (event && typeof event.cwd === 'string') return event.cwd;
  return process.cwd();
}

function lockState(lockMod, cwd) {
  if (!lockMod) return { active: false };
  let root;
  try { root = lockMod.repoRoot(cwd); }
  catch (err) { debug('repoRoot failed: ' + err.message); return { active: false }; }

  const lockPath = lockMod.lockPath(root);
  if (!fs.existsSync(lockPath)) return { active: false };

  const lock = lockMod.readLock(root);
  if (!lock) {
    return { active: true, malformed: true, reason: 'read-null' };
  }
  if (lock._zero_byte) {
    return { active: true, malformed: true, reason: 'zero-byte' };
  }
  if (lock._parse_error) {
    return { active: true, malformed: true, reason: 'parse-error: ' + lock._parse_error };
  }
  if (!lock.run_id || !lock.ownership_token_hash) {
    return { active: true, malformed: true, reason: 'missing-required-field' };
  }
  return { active: true, lock: lock };
}

function emitDeny(reason, lockMeta) {
  const lines = [
    '[mccp:goal-phase-guard] BLOCK — /goal milestone-close 격리 invariant 활성.',
    '  run_id        : ' + ((lockMeta && lockMeta.run_id) || 'unknown'),
    '  milestone_id  : ' + ((lockMeta && lockMeta.milestone_id) || '<none>'),
    '  reason        : ' + reason,
    '',
    '  /mccp:milestone-close가 /goal mode를 통해 milestone 종료 acceptance loop를',
    '  진행 중입니다. 이 turn에서의 mccp 자체 write는 closure-doc anchor invariant를',
    '  보존하기 위해 mechanical 차단됩니다.',
    '',
    '  응답 grammar로 종료: goal-done:<≥3-word summary> / goal-failed:<reason> /',
    '                       goal-skipped:<reason>',
    '  /goal early exit:  /goal clear  (또는 stop|off|reset|none|cancel)',
    '  lock 강제 회수:    node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-phase-lock.js detect-stale',
  ];
  process.stderr.write(lines.join('\n') + '\n');
}

function emitMalformedDeny(reason) {
  const lines = [
    '[mccp:goal-phase-guard] BLOCK — lock file malformed (' + reason + ') — DENY (fail-closed).',
    '',
    '  goal-phase lock file이 손상되었거나 필수 field가 누락되었습니다.',
    '  F2 absorption: lock 손상은 mechanism이 anticipate한 정상 상태입니다 —',
    '  fail-open으로 진행하면 audit/isolation이 무력화되므로 fail-CLOSED 처리.',
    '',
    '  복구: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-phase-lock.js detect-stale',
    '  실패 시 90s mtime 만료 후 자동 reclaim, 그 후 재시도.',
  ];
  process.stderr.write(lines.join('\n') + '\n');
}

function classifySkillName(name) {
  if (typeof name !== 'string') return { decision: 'allow', reason: 'non-string skill' };
  if (/^mccp:/.test(name)) {
    return { decision: 'deny', reason: 'mccp:* skill invocation during goal-phase' };
  }
  return { decision: 'allow', reason: 'non-mccp skill' };
}

// F3 absorption: STRICT non-owner policy.
// - same session (owner-match)        → enforce full deny matrix
// - different session (non-owner)     → ALLOW read-only tools only;
//                                       write tools + Skill mccp:* + bash-mutate
//                                       remain DENY
// - either absent                     → blanket-enforce + stderr warn (loud)
function shouldEnforceForCaller(lock, event, toolName) {
  const eventSid = event && typeof event.session_id === 'string' ? event.session_id : null;
  const ownerSid = lock && typeof lock.owner_session_id === 'string' ? lock.owner_session_id : null;

  if (eventSid && ownerSid) {
    if (eventSid !== ownerSid) {
      // Non-owner caller — read-only ALLOW path.
      if (READ_ONLY_TOOLS.has(toolName)) {
        return { enforce: false, reason: 'non-owner-readonly-allow' };
      }
      // Write tools and Skill mccp:* and Bash remain enforced — sub-session
      // mutation cannot bypass closure-doc anchor invariant.
      return { enforce: true, reason: 'non-owner-write-enforce (F3 absorption)' };
    }
    return { enforce: true, reason: 'owner-session-match' };
  }

  process.stderr.write(
    '[mccp:goal-phase-guard] WARN — caller-identity discriminator absent ' +
    '(event.session_id=' + (eventSid || 'null') + ', lock.owner_session_id=' +
    (ownerSid || 'null') + '); falling back to blanket-enforce (loud).\n'
  );
  return { enforce: true, reason: 'scenario-B-fallback-blanket-enforce' };
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

  const callerDecision = shouldEnforceForCaller(state.lock, event, toolName);
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
      process.exit(0);
    });
}

module.exports = {
  WRITE_TOOLS,
  READ_ONLY_TOOLS,
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
