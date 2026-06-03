'use strict';

// SessionStart injector — replays STATE.md + pending fix-task.md as
// <system-reminder> blocks in the new session's context. Rotates
// fix-task.md → fix-task-applied.md after inject, and sweeps applied
// files older than 7 days.
//
// Schemas: docs/v0.2-state-schema.md §1 (STATE.md), §2 (fix-task)
//
// Failure isolation: STATE.md and fix-task.md are independent — a failure
// reading one must not block the other. All exceptions are caught and
// logged to stderr; the caller (session-start.js) gets at least an empty
// stdout instead of an aborted session.

const fs = require('fs');
const path = require('path');

const STATE_DIRNAME = path.join('.claude', 'state');
const STATE_FILENAME = 'STATE.md';
const FIX_TASK_FILENAME = 'fix-task.md';
const APPLIED_FILENAME = 'fix-task-applied.md';
const SWEEP_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUIRED_FRONTMATTER_KEYS = ['state_version', 'task_fingerprint', 'created_at', 'updated_at'];
const SUPPORTED_STATE_VERSION = 1;
const SUPPORTED_FIX_TASK_VERSION = 1;

function stateDir(repoRoot) {
  return path.join(repoRoot, STATE_DIRNAME);
}

function statePath(repoRoot) {
  return path.join(stateDir(repoRoot), STATE_FILENAME);
}

function fixTaskPath(repoRoot) {
  return path.join(stateDir(repoRoot), FIX_TASK_FILENAME);
}

function appliedPath(repoRoot) {
  return path.join(stateDir(repoRoot), APPLIED_FILENAME);
}

function sweepOldApplied(repoRoot, applied) {
  if (!fs.existsSync(applied)) return false;
  try {
    const stat = fs.statSync(applied);
    if (Date.now() - stat.mtimeMs > SWEEP_AGE_MS) {
      fs.unlinkSync(applied);
      process.stderr.write('[mccp:state-injector] swept stale fix-task-applied.md (age ' +
        Math.round((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000)) + 'd)\n');
      return true;
    }
  } catch (err) {
    process.stderr.write('[mccp:state-injector] WARNING: sweep check failed: ' + err.message + '\n');
  }
  return false;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (!m) continue;
    let value = m[2].trim();
    if (value === 'true') fm[m[1]] = true;
    else if (value === 'false') fm[m[1]] = false;
    else if (value === 'null' || value === '') fm[m[1]] = null;
    else if (/^\d+$/.test(value)) fm[m[1]] = parseInt(value, 10);
    else fm[m[1]] = value;
  }
  return { frontmatter: fm, body: match[2] };
}

function readState(repoRoot) {
  const target = statePath(repoRoot);
  if (!fs.existsSync(target)) return { kind: 'missing' };
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    return { kind: 'error', reason: 'read failed: ' + err.message };
  }
  const parsed = parseFrontmatter(raw);
  if (!parsed) return { kind: 'invalid', reason: 'frontmatter missing or malformed' };
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (parsed.frontmatter[key] === undefined || parsed.frontmatter[key] === null) {
      return { kind: 'invalid', reason: 'required key missing: ' + key };
    }
  }
  if (parsed.frontmatter.state_version !== SUPPORTED_STATE_VERSION) {
    return { kind: 'invalid', reason: 'unsupported state_version ' + parsed.frontmatter.state_version };
  }
  return { kind: 'ok', frontmatter: parsed.frontmatter, body: parsed.body.trim() };
}

function readFixTask(repoRoot) {
  const target = fixTaskPath(repoRoot);
  if (!fs.existsSync(target)) return { kind: 'missing' };
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    return { kind: 'error', reason: 'read failed: ' + err.message };
  }
  const parsed = parseFrontmatter(raw);
  if (!parsed) return { kind: 'invalid', reason: 'frontmatter missing or malformed' };
  if (parsed.frontmatter.fix_task_version !== SUPPORTED_FIX_TASK_VERSION) {
    return { kind: 'invalid', reason: 'unsupported fix_task_version ' + parsed.frontmatter.fix_task_version };
  }
  return { kind: 'ok', frontmatter: parsed.frontmatter, body: parsed.body.trim(), raw: raw };
}

function rotateFixTask(repoRoot) {
  const src = fixTaskPath(repoRoot);
  const dst = appliedPath(repoRoot);
  try {
    fs.renameSync(src, dst);
    return true;
  } catch (err) {
    process.stderr.write('[mccp:state-injector] WARNING: rotate failed: ' + err.message + '\n');
    return false;
  }
}

// Commit the consume-and-deliver cycle. Call this AFTER the caller has
// successfully delivered the inject() result to the user (stdout flushed,
// payload accepted by the session frontend). Idempotent — calling without a
// pending fix-task.md is a no-op.
function commitFixTaskApplied(repoRoot) {
  if (!fs.existsSync(fixTaskPath(repoRoot))) return false;
  return rotateFixTask(repoRoot);
}

function formatStateBlock(body) {
  return '<system-reminder>\n[mccp:STATE.md — restored from previous session]\n\n' +
    body + '\n</system-reminder>\n';
}

// Tail sentinel: paired with the head marker so the SessionStart guard can
// verify the ENTIRE block survived limitSessionStartContext truncation, not
// just the first few chars (Codex stop-time finding: head-only check accepts
// a mid-body slice as "delivered" and rotates fix-task.md prematurely).
const FIX_TASK_HEAD_MARKER = '[mccp:fix-task — pending correction from previous Stop-loop]';
const FIX_TASK_TAIL_MARKER = '[mccp:fix-task — end of pending correction]';

function formatFixTaskBlock(body) {
  return '<system-reminder>\n' + FIX_TASK_HEAD_MARKER + '\n\n' +
    body + '\n\n' + FIX_TASK_TAIL_MARKER + '\n</system-reminder>\n';
}

function inject(repoRoot) {
  const parts = [];
  const applied = { state: false, fixTask: false, sweep: false, stateSkip: null, fixTaskSkip: null };

  applied.sweep = sweepOldApplied(repoRoot, appliedPath(repoRoot));

  try {
    const state = readState(repoRoot);
    if (state.kind === 'ok') {
      parts.push(formatStateBlock(state.body));
      applied.state = true;
    } else if (state.kind === 'missing') {
      applied.stateSkip = 'missing';
    } else {
      process.stderr.write('[mccp:state-injector] STATE.md skipped: ' + state.reason + '\n');
      applied.stateSkip = state.reason;
    }
  } catch (err) {
    process.stderr.write('[mccp:state-injector] STATE.md exception: ' + err.message + '\n');
    applied.stateSkip = 'exception: ' + err.message;
  }

  let fixTaskFrontmatter = null;
  try {
    const fix = readFixTask(repoRoot);
    if (fix.kind === 'ok') {
      parts.push(formatFixTaskBlock(fix.body));
      applied.fixTask = true;
      fixTaskFrontmatter = fix.frontmatter;
    } else if (fix.kind === 'missing') {
      applied.fixTaskSkip = 'missing';
    } else {
      process.stderr.write('[mccp:state-injector] fix-task.md skipped: ' + fix.reason + '\n');
      applied.fixTaskSkip = fix.reason;
    }
  } catch (err) {
    process.stderr.write('[mccp:state-injector] fix-task.md exception: ' + err.message + '\n');
    applied.fixTaskSkip = 'exception: ' + err.message;
  }

  const stdout = parts.join('\n');

  // Codex finding: fix-task must NOT be rotated inside inject(). If the
  // caller fails to deliver `stdout` (Claude Code drops the payload,
  // session-start.js throws after this point, stdout flush fails), a
  // pre-rotated fix-task is consumed without reaching the user — the
  // pending fix is lost forever.
  //
  // Contract: inject() is read-only with respect to fix-task.md. The caller
  // calls commitFixTaskApplied(repoRoot) AFTER stdout delivery succeeds.
  // Re-running inject() with fix-task.md still present is idempotent.

  const confirmRequired = applied.state && !!readSafe(statePath(repoRoot), 'confirm_required');

  let suffix = '';
  if (confirmRequired) {
    suffix = '\n<system-reminder>\n[mccp:state-injector] confirm_required=true. 이어가시겠습니까? (y/n)\n</system-reminder>\n';
  }

  return { stdout: stdout + suffix, applied: applied, fixTaskFrontmatter: fixTaskFrontmatter };
}

function readSafe(file, key) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = parseFrontmatter(raw);
    if (!parsed) return null;
    return parsed.frontmatter[key];
  } catch (_) {
    return null;
  }
}

module.exports = {
  SWEEP_AGE_MS: SWEEP_AGE_MS,
  REQUIRED_FRONTMATTER_KEYS: REQUIRED_FRONTMATTER_KEYS,
  SUPPORTED_STATE_VERSION: SUPPORTED_STATE_VERSION,
  SUPPORTED_FIX_TASK_VERSION: SUPPORTED_FIX_TASK_VERSION,
  FIX_TASK_HEAD_MARKER: FIX_TASK_HEAD_MARKER,
  FIX_TASK_TAIL_MARKER: FIX_TASK_TAIL_MARKER,
  statePath: statePath,
  fixTaskPath: fixTaskPath,
  appliedPath: appliedPath,
  readState: readState,
  readFixTask: readFixTask,
  sweepOldApplied: sweepOldApplied,
  rotateFixTask: rotateFixTask,
  commitFixTaskApplied: commitFixTaskApplied,
  inject: inject,
};
