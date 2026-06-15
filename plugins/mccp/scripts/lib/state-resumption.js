'use strict';

// v1.1.0 Stage 1 Task 3 — pure dispatch helper for /mccp:resume.
//
// Reads a STATE.md snapshot (the object returned by state-writer.readState)
// and decides which slash command should resume the session, with what args.
// No filesystem side effects in the core function — `dispatch(state, opts)` is
// pure. The resume.md slash command body is responsible for the actual
// state-writer.update + slash-command invocation.
//
// Why this module exists (F1 + F2 absorption from Codex R1):
//   The dispatch table encodes the 2-phase atomic semantics. Without a single
//   source of truth, the resume.md command body would have to re-derive the
//   semantics on every call, and any drift between the markdown body and the
//   helper would surface as either work loss (clearing handoff prematurely) or
//   infinite retry (failing to detect resume_dispatched). Centralizing the
//   table here makes the failure modes mechanical instead of textual.
//
// Dispatch table (matches plan.md §Task 3 — 6 rows):
//   ┌──────────────────────┬─────────────┬─────────┬──────────┬──────────────────┬─────────────────────────┬────────────────┐
//   │ state.last_event     │ unsafe_chk  │ fix-tsk │ attempt# │ output.command   │ output.args             │ shouldClearOn  │
//   │                      │             │ pending │          │                  │                         │ Success        │
//   ├──────────────────────┼─────────────┼─────────┼──────────┼──────────────────┼─────────────────────────┼────────────────┤
//   │ handoff_spawn        │ false       │ *       │ (n/a)    │ /mccp:work       │ --resume task=<fp>      │ true           │
//   │ handoff_spawn        │ true        │ true    │ (n/a)    │ /mccp:prp-implem │ --apply-fix-task        │ true           │
//   │ handoff_spawn        │ true        │ false   │ (n/a)    │ /mccp:work       │ --resume --unsafe-…     │ true           │
//   │ resume_dispatching   │ *           │ *       │ < 3      │ in-flight        │ (n/a — re-entry guard)  │ false          │
//   │ resume_dispatching   │ *           │ *       │ >= 3     │ resume_giveup    │ (n/a — manual recovery) │ false          │
//   │ anything else        │ *           │ *       │ (n/a)    │ noop             │ (n/a)                   │ false          │
//   └──────────────────────┴─────────────┴─────────┴──────────┴──────────────────┴─────────────────────────┴────────────────┘
//
// Sentinel command values (NOT slash commands — resume.md body interprets):
//   'in-flight'     — phase 1 already wrote resume_dispatching, attempt count
//                     under the giveup cap. Caller must not invoke any command;
//                     just emit a warning and exit.
//   'resume_giveup' — attempt count hit the cap. Caller emits manual-recovery
//                     guidance and exits. handoff_spawn signal is intentionally
//                     preserved (shouldClearOnSuccess=false) so the user can
//                     reset attempt count and retry.
//   'noop'          — nothing to do. Either no handoff signal, or the previous
//                     resume already completed (resume_dispatched).

const crypto = require('crypto');

const GIVEUP_AFTER = 3;

function dispatch(state, opts) {
  const options = opts || {};
  const uuidFn = typeof options.uuid === 'function' ? options.uuid : crypto.randomUUID;
  const fixTaskPending = !!options.fixTaskPending;

  if (!state || !state.frontmatter) {
    return {
      command: 'noop',
      args: null,
      reason: 'no STATE.md frontmatter — nothing to resume',
      shouldClearOnSuccess: false,
      dispatchId: null,
      attemptCount: 0,
    };
  }

  const fm = state.frontmatter;
  const lastEvent = fm.last_event;
  const currentAttemptCount = Number(fm.dispatch_attempt_count) || 0;
  const existingDispatchId = fm.dispatch_id || null;

  // Rows 4 + 5 — already-dispatching state. Re-entry guard.
  if (lastEvent === 'resume_dispatching') {
    if (currentAttemptCount >= GIVEUP_AFTER) {
      return {
        command: 'resume_giveup',
        args: null,
        reason:
          'resume dispatched ' + currentAttemptCount + ' times without success. ' +
          'handoff_spawn signal preserved — reset dispatch_attempt_count manually to retry.',
        shouldClearOnSuccess: false,
        dispatchId: existingDispatchId,
        attemptCount: currentAttemptCount,
      };
    }
    return {
      command: 'in-flight',
      args: null,
      reason:
        'resume is already dispatching (dispatch_id: ' +
        (existingDispatchId || '<unknown>') + ', attempt: ' +
        currentAttemptCount + '/' + GIVEUP_AFTER + ').',
      shouldClearOnSuccess: false,
      dispatchId: existingDispatchId,
      attemptCount: currentAttemptCount,
    };
  }

  // Row 6 — idempotency: resume_dispatched OR any non-handoff event.
  if (lastEvent !== 'handoff_spawn') {
    const isCompleted = lastEvent === 'resume_dispatched';
    return {
      command: 'noop',
      args: null,
      reason: isCompleted
        ? 'previous resume completed (resume_dispatched) — no pending handoff'
        : 'no handoff_spawn signal in STATE.md (last_event=' +
          (lastEvent || '<absent>') + ')',
      shouldClearOnSuccess: false,
      dispatchId: null,
      attemptCount: 0,
    };
  }

  // Rows 1–3 — fresh handoff_spawn dispatch. Generate new dispatchId, bump count.
  const fingerprint = fm.task_fingerprint || 'unknown';
  const unsafe = !!fm.unsafe_checkpoint;
  const newDispatchId = uuidFn();
  const nextAttemptCount = currentAttemptCount + 1;

  if (!unsafe) {
    // Row 1 — graceful handoff.
    return {
      command: '/mccp:work',
      args: '--resume task=' + fingerprint,
      reason: 'handoff_spawn (graceful, soft-ceiling) — resume normal work cycle',
      shouldClearOnSuccess: true,
      dispatchId: newDispatchId,
      attemptCount: nextAttemptCount,
    };
  }

  if (fixTaskPending) {
    // Row 2 — unsafe checkpoint + fix-task — implement-first.
    return {
      command: '/mccp:prp-implement',
      args: '--apply-fix-task',
      reason: 'handoff_spawn (unsafe checkpoint) with pending fix-task.md — apply fix-task first',
      shouldClearOnSuccess: true,
      dispatchId: newDispatchId,
      attemptCount: nextAttemptCount,
    };
  }

  // Row 3 — unsafe checkpoint, no fix-task pending — resume with marker.
  return {
    command: '/mccp:work',
    args: '--resume --unsafe-checkpoint task=' + fingerprint,
    reason: 'handoff_spawn (unsafe checkpoint) without fix-task — resume with unsafe marker',
    shouldClearOnSuccess: true,
    dispatchId: newDispatchId,
    attemptCount: nextAttemptCount,
  };
}

module.exports = {
  dispatch: dispatch,
  GIVEUP_AFTER: GIVEUP_AFTER,
};
