#!/usr/bin/env node
'use strict';

// L2b PostToolUseFailure surface — event-native, no L1 lookup required.
//
// Reads JSON event from stdin (containing tool_use_id, tool_name, error).
// Emits `systemMessage` + `hookSpecificOutput.additionalContext` so the
// user always sees that a tool call failed. L1 shard write is opportunistic
// — caller never blocks on it (G1 contract: live hook state = event payload
// only, anything else is best-effort).
//
// Any internal exception falls through to a single systemMessage emit + exit 0
// so a buggy surface never compounds a tool failure into a silent disappearance.

const path = require('path');
const envValue = require('../lib/env-contract/value');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');

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
  if (envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG')) {
    process.stderr.write('[mccp:post-tool-use-failure] ' + msg + '\n');
  }
}

// M3 Task 4 (DD6-1) — 저장소 루트 판정은 hook-trace.js가 소유한다. 로컬 복사본은
// `event.cwd`를 그대로 루트로 써서 하위 디렉토리 호출이 shard를 산란시켰다.
// 모듈 로드 실패는 이 hook의 기존 fail-open 계약대로 접는다.
function repoRootOf(event) {
  const ht = loadHookTrace();
  if (ht && typeof ht.resolveRepoRoot === 'function') return ht.resolveRepoRoot(event);
  return (event && event.cwd) ? event.cwd : process.cwd();
}

// 표면에 실릴 경로를 repo 기준으로 접는다(DD6-3). repoRoot 밖이면 원본 그대로.
function surfacePath(repoRoot, abs) {
  if (!abs) return abs;
  const ht = loadHookTrace();
  if (ht && typeof ht.toRepoRelative === 'function') return ht.toRepoRelative(repoRoot, abs);
  return abs;
}

function loadHookTrace() {
  try {
    return require(path.join(LIB_DIR, 'hook-trace'));
  } catch (err) {
    debug('hook-trace unavailable: ' + err.message);
    return null;
  }
}

function summarizeError(errText) {
  if (errText === undefined || errText === null) return 'no error payload';
  const first = String(errText).split(/\r?\n/)[0];
  return first.length > 200 ? first.slice(0, 199) + '…' : first;
}

function buildSurface(event, traceLogPath) {
  const toolName = (event && event.tool_name) || 'unknown';
  const toolUseId = (event && event.tool_use_id) || 'unknown';
  const lines = [
    '[mccp] PostToolUseFailure: ' + toolName + ' (tool_use_id=' + toolUseId + ')',
    '  error: ' + summarizeError(event && event.error),
  ];
  if (traceLogPath) lines.push('  trace: ' + traceLogPath);
  lines.push('  recovery: run /mccp:trace for details, or check .claude/state/hook-trace/<session_id>/');
  return lines.join('\n');
}

function buildAdditionalContext(traceLogPath) {
  return 'mccp L2b surface: tool failure observed' +
    (traceLogPath ? ' — see ' + traceLogPath : '') +
    '. Run /mccp:trace for context.';
}

function emit(systemMessage, traceLogPath) {
  const payload = {
    systemMessage: systemMessage,
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext: buildAdditionalContext(traceLogPath),
    },
  };
  process.stdout.write(JSON.stringify(payload));
  return 0;
}

async function main() {
  let event = null;
  let raw = '';
  try {
    raw = await readStdin();
    if (raw.trim()) event = JSON.parse(raw);
  } catch (err) {
    debug('stdin parse error: ' + err.message);
    return emit('[mccp] PostToolUseFailure: malformed event payload (' + err.message + ')', null);
  }
  if (!event) {
    return emit('[mccp] PostToolUseFailure: no event payload', null);
  }

  // Opportunistic L1 shard write — never block surface on this (G1).
  let traceLogPath = null;
  const repoRoot = repoRootOf(event);
  try {
    const ht = loadHookTrace();
    if (ht && event.session_id && event.tool_use_id) {
      const result = ht.recordWrite(
        repoRoot,
        event.session_id,
        event.tool_use_id,
        'PostToolUseFailure',
        {
          layer: 'L2b',
          gate_decision: 'OBSERVED',
          command_id: event.command_id || null,
          command_name: event.command_name || null,
          exception_class: event.tool_name || null,
          exit_code: typeof event.exit_code === 'number' ? event.exit_code : null,
        }
      );
      if (result && result.ok) traceLogPath = surfacePath(repoRoot, result.path);
      else if (result && !result.ok) debug('L1 write soft-failed: ' + result.code);
    }
  } catch (err) {
    debug('L1 shard write threw (continuing): ' + err.message);
  }

  return emit(buildSurface(event, traceLogPath), traceLogPath);
}

if (require.main === module) {
  main().then(function (code) {
    process.exit(code || 0);
  }).catch(function (err) {
    // G1 last-ditch: emit something + exit 0 so the tool failure is never
    // hidden behind a hook bug.
    try {
      process.stdout.write(JSON.stringify({
        systemMessage: '[mccp] PostToolUseFailure surface internal error: ' + err.message,
      }));
    } catch (_) { /* nothing more we can do */ }
    process.exit(0);
  });
}

module.exports = {
  buildSurface: buildSurface,
  buildAdditionalContext: buildAdditionalContext,
  summarizeError: summarizeError,
};
