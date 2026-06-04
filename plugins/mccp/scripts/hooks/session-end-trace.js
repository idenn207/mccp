#!/usr/bin/env node
'use strict';

// L5 SessionEnd marker + compactor.
//
// Plan §577-584: SessionEnd hook writes `.end` marker and consolidates
// per-shard files into `consolidated.jsonl`. C1: anchored to `SessionEnd`
// (NOT a non-existent "Pre-Stop"). C3: respects active-session leases —
// concurrent sessions are never touched. Compactor failure never blocks
// SessionEnd; we still emit the marker.

const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
const LIB_DIR = path.join(PLUGIN_ROOT, 'scripts', 'lib');

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
  if (process.env.MCCP_RECEIPT_DEBUG === '1') {
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

async function main() {
  let event = null;
  try {
    const raw = await readStdin();
    if (raw.trim()) event = JSON.parse(raw);
  } catch (err) {
    debug('stdin parse error: ' + err.message);
  }

  const ht = loadHookTrace();
  if (!ht) return 0;
  if (!event || !event.session_id) {
    debug('no session_id in SessionEnd event — skipping');
    return 0;
  }

  const repoRoot = repoRootOf(event);
  const sessionId = event.session_id;

  // 1. End marker first — even if compactor fails, the marker proves the
  //    session ended cleanly.
  try {
    ht.markSessionEnd(repoRoot, sessionId);
    debug('end marker written for session ' + sessionId);
  } catch (err) {
    debug('end marker write failed: ' + err.message);
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
  if (!ht || !event || !event.session_id) return 0;
  const repoRoot = repoRootOf(event);
  const sessionId = event.session_id;
  try { ht.markSessionEnd(repoRoot, sessionId); }
  catch (err) { debug('end marker (sync) failed: ' + err.message); }
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

module.exports = { main: main, runSync: runSync };
