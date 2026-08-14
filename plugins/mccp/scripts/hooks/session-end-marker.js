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

// session-process-reclaim M2. Surfacing is stderr — never the hook's return
// value, which must stay byte-identical (UI8: reclaim is not a blocking
// condition for ending a session).
function reclaimOwnedProcesses(repoRoot, sessionId, deps) {
  // Bound under its own name rather than an alias so the Task 9(f) source scan
  // can see this call site. An alias would make the scan pass vacuously — the
  // exact failure mode that check exists to prevent.
  const reclaimSession = (deps && deps.reclaimSession)
    || require('../lib/session-processes').reclaimSession;
  try {
    const r = reclaimSession({ repoRoot, sessionId });
    // The return value is READ, not discarded. §D6 claims "absence of a record
    // is not proof of reclaim"; this line is what makes that claim mean
    // something, because it is the only place the incompleteness becomes
    // visible to a human.
    if (!r.complete || r.unreclaimed.length || r.writeFailures.length || r.budgetExceeded) {
      process.stderr.write('[mccp:session-reclaim] incomplete — '
        + `reclaimed=${r.reclaimed.length} unreclaimed=${r.unreclaimed.length} `
        + `writeFailures=${r.writeFailures.length} budgetExceeded=${r.budgetExceeded} `
        + `complete=${r.complete} · .claude/state/session-processes/${sessionId}/ 확인\n`);
    }
    return r;
  } catch (err) {
    // Deliberately not an empty catch: a thrown error is just another shape of
    // "not finished" (UI6). Swallowing it here would satisfy every assertion
    // about run() still returning, while hiding the failure completely.
    process.stderr.write('[mccp:session-reclaim] threw — '
      + `${err && err.message} · 회수 미완료. `
      + `.claude/state/session-processes/${sessionId}/ 확인\n`);
    return null;
  }
}

function run(rawInput, deps) {
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

  // LAST — after the hook-trace marker and after observer cleanup (UI10). The
  // marker is already on disk, so a reclaim that fails, throws, or runs out of
  // budget can no longer cost us the SessionEnd record.
  reclaimOwnedProcesses((event && event.cwd) || process.cwd(), sessionId, deps);

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
