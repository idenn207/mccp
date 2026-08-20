#!/usr/bin/env node
'use strict';

// L5 SessionEnd marker + compactor.
//
// Plan §577-584: SessionEnd hook writes `.end` marker and consolidates
// per-shard files into `consolidated.jsonl`. C1: anchored to `SessionEnd`
// (NOT a non-existent "Pre-Stop"). C3: respects active-session leases —
// concurrent sessions are never touched. Compactor failure never blocks
// SessionEnd; we still emit the marker.

const fs = require('fs');
const path = require('path');
const envValue = require('../lib/env-contract/value');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');

// hook-trace layout constants, mirrored so the degraded path below is fully
// independent of the hook-trace module (which may have failed to load).
const TRACE_DIRNAME = path.join('.claude', 'state', 'hook-trace');
const END_MARKER = '.end';
const LEASE_SUFFIX = '.lease';
// Mirror of hook-trace.js PATH_TOKEN_RE (line 62). The degraded marker bypasses
// hook-trace's assertPathToken, so we self-validate the sessionId to keep the
// write anchored inside the session dir (no path traversal via `..`).
const SESSION_ID_RE = /^[A-Za-z0-9_.\-]+$/;

function isSafeSessionId(sessionId) {
  return typeof sessionId === 'string' &&
    SESSION_ID_RE.test(sessionId) &&
    sessionId !== '.' && sessionId !== '..';
}

function readStdin() {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 15000);
  });
}

function debug(msg) {
  if (envValue.parseBool(process.env, 'MCCP_RECEIPT_DEBUG')) {
    process.stderr.write('[mccp:session-end-trace] ' + msg + '\n');
  }
}

function loadHookTrace() {
  try { return require(path.join(LIB_DIR, 'hook-trace')); }
  catch (err) {
    debug('hook-trace unavailable: ' + err.message);
    return null;
  }
}

function repoRootOf(event) {
  return (event && event.cwd) ? event.cwd : process.cwd();
}

// hook-trace-independent SessionEnd marker (B#4). When the hook-trace module
// fails to load, ht.markSessionEnd is unreachable and the session ends WITHOUT
// a `.end` marker — a later SessionStart then false-flags it as a crash. This
// writes the marker directly via fs so "marker > lease": the marker's presence
// is the authoritative "ended cleanly" signal. Also unlinks the session lease
// (Codex R1 F2 / D5) so evictLRU can reclaim the dir — the degraded path can't
// call ht.releaseLease. Never throws (fail-open); returns true when written.
function writeDegradedEndMarker(repoRoot, sessionId) {
  try {
    if (!repoRoot || !isSafeSessionId(sessionId)) return false;
    const traceDir = path.join(repoRoot, TRACE_DIRNAME);
    const sessDir = path.join(traceDir, sessionId);
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, END_MARKER), nowIso(), 'utf8');
    try { fs.unlinkSync(path.join(traceDir, sessionId + LEASE_SUFFIX)); }
    catch (err) { if (err.code !== 'ENOENT') { /* best-effort lease release */ } }
    return true;
  } catch (_err) {
    return false;
  }
}

// Resilient end-marker write: prefer ht.markSessionEnd, fall back to the
// hook-trace-independent degraded marker when the module is unavailable OR
// markSessionEnd throws (B#4). The degraded path emits a LOUD stderr line (not
// debug-gated) so the fallback — and any hard failure — is observable rather
// than silently swallowed (B#5, fail-loud-open).
function markSessionEndResilient(repoRoot, sessionId, ht) {
  if (ht) {
    try {
      ht.markSessionEnd(repoRoot, sessionId);
      debug('end marker written for session ' + sessionId);
      return true;
    } catch (err) {
      debug('markSessionEnd failed, falling back to degraded: ' + err.message);
    }
  }
  const wrote = writeDegradedEndMarker(repoRoot, sessionId);
  if (wrote) {
    process.stderr.write('[mccp:session-end-trace] degraded end marker written ' +
      '(hook-trace unavailable) for session ' + sessionId + '\n');
  } else {
    process.stderr.write('[mccp:session-end-trace] FAILED to write end marker ' +
      'for session ' + sessionId + ' — session may be false-flagged as crashed\n');
  }
  return wrote;
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  let event = null;
  try {
    const raw = await readStdin();
    if (raw.trim()) event = JSON.parse(raw);
  } catch (err) {
    debug('stdin parse error: ' + err.message);
  }

  const ht = loadHookTrace();
  if (!event || !event.session_id) {
    debug('no session_id in SessionEnd event — skipping');
    return 0;
  }

  const repoRoot = repoRootOf(event);
  const sessionId = event.session_id;

  // 1. End marker first — resilient so a hook-trace load failure still records
  //    a clean SessionEnd (B#4). The marker's presence is the authoritative
  //    "ended cleanly" signal (marker > lease).
  markSessionEndResilient(repoRoot, sessionId, ht);

  if (!ht) {
    // hook-trace unavailable: degraded marker (+ lease release) written above.
    // Compaction and lease release need the module — nothing more to do.
    return 0;
  }

  // 2. Compaction — best-effort, never blocks SessionEnd. C3: do not touch
  //    other sessions' dirs. consolidateSession only acts on this session.
  try {
    const result = ht.consolidateSession(repoRoot, sessionId);
    if (result && result.ok) {
      debug('consolidated ' + result.lines + ' entries → ' + result.path);
    } else if (result) {
      debug('consolidate soft-failed: ' + result.code);
    }
  } catch (err) {
    debug('consolidate threw: ' + err.message);
  }

  // 3. Release our own lease so subsequent SessionStart LRU can evict if
  //    we get the boot order right next time.
  try { ht.releaseLease(repoRoot, sessionId); }
  catch (err) { debug('lease release failed: ' + err.message); }

  return 0;
}

// Sync entrypoint for in-process invocation from session-end-marker.js (the
// hooks.json-registered hook). Same semantics as main() but skips readStdin —
// caller already parsed the event payload.
function runSync(event) {
  const ht = loadHookTrace();
  if (!event || !event.session_id) return 0;
  const repoRoot = repoRootOf(event);
  const sessionId = event.session_id;
  // Resilient marker — degraded fallback when hook-trace failed to load (B#4).
  markSessionEndResilient(repoRoot, sessionId, ht);
  if (!ht) return 0;
  try { ht.consolidateSession(repoRoot, sessionId); }
  catch (err) { debug('consolidate (sync) failed: ' + err.message); }
  try { ht.releaseLease(repoRoot, sessionId); }
  catch (err) { debug('lease release (sync) failed: ' + err.message); }
  return 0;
}

if (require.main === module) {
  main().then(function (code) {
    process.exit(code || 0);
  }).catch(function (err) {
    // SessionEnd should never throw — last-ditch swallow.
    process.stderr.write('[mccp:session-end-trace] fatal (ignored): ' + err.message + '\n');
    process.exit(0);
  });
}

module.exports = {
  main: main,
  runSync: runSync,
  writeDegradedEndMarker: writeDegradedEndMarker,
  markSessionEndResilient: markSessionEndResilient,
};
