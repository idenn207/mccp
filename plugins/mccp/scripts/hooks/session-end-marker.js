#!/usr/bin/env node
'use strict';

/**
 * Session end marker hook - performs lightweight observer cleanup and
 * outputs stdin to stdout unchanged. Exports run() for in-process execution.
 */

const {
  resolveProjectContext,
  removeSessionLease,
  listSessionLeases,
  stopObserverForContext,
  resolveSessionId
} = require('../lib/observer-sessions');

function log(message) {
  process.stderr.write(`[SessionEnd] ${message}\n`);
}

function run(rawInput) {
  const output = rawInput || '';

  // v0.2.7 L5 — hook-trace end marker + consolidate. Best-effort, never blocks
  // the rest of SessionEnd. fail-loud-open (B#5): a wholesale L5 failure (parse
  // / module load / runSync throw) still attempts a hook-trace-independent
  // degraded end marker so the session is not false-flagged as crashed, and the
  // failure is surfaced LOUDLY instead of being swallowed by the old single
  // catch that exited success.
  let event = null;
  try {
    event = rawInput ? JSON.parse(rawInput) : null;
  } catch (err) {
    process.stderr.write('[SessionEnd] hook-trace L5 payload parse failed: ' + err.message + '\n');
  }
  if (event) {
    let trace = null;
    try {
      trace = require('./session-end-trace');
    } catch (err) {
      process.stderr.write('[SessionEnd] hook-trace L5 module load failed: ' + err.message + '\n');
    }
    if (trace) {
      try {
        trace.runSync(event);
      } catch (err) {
        // runSync should not throw (markSessionEndResilient swallows internally),
        // but if it does we still guarantee a degraded marker and surface loudly.
        process.stderr.write('[SessionEnd] hook-trace L5 runSync failed — writing degraded marker: ' + err.message + '\n');
        try {
          const repoRoot = event.cwd || process.cwd();
          const sid = event.session_id || process.env.CLAUDE_SESSION_ID || null;
          if (sid) trace.writeDegradedEndMarker(repoRoot, sid);
        } catch (degErr) {
          process.stderr.write('[SessionEnd] degraded marker also failed: ' + degErr.message + '\n');
        }
      }
    }
  }

  const sessionId = resolveSessionId();

  if (!sessionId) {
    log('No CLAUDE_SESSION_ID available; skipping observer cleanup');
    return output;
  }

  try {
    const observerContext = resolveProjectContext();
    removeSessionLease(observerContext, sessionId);
    const remainingLeases = listSessionLeases(observerContext);

    if (remainingLeases.length === 0) {
      if (stopObserverForContext(observerContext)) {
        log(`Stopped observer for project ${observerContext.projectId} after final session lease ended`);
      } else {
        log(`No running observer to stop for project ${observerContext.projectId}`);
      }
    } else {
      log(`Retained observer for project ${observerContext.projectId}; ${remainingLeases.length} session lease(s) remain`);
    }
  } catch (err) {
    log(`Observer cleanup skipped: ${err.message}`);
  }

  return output;
}

// Legacy CLI execution (when run directly)
if (require.main === module) {
  const MAX_STDIN = 1024 * 1024;
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
    }
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(raw));
  });
}

module.exports = { run };
