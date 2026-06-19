'use strict';

// dispatch-watcher — Stage 2 M1 Task 4.
//
// Hybrid envelope-arrival watcher: fs.watch as event-driven accelerator,
// setInterval polling as the always-on safety net + source of truth.
//
// Rationale:
//   fs.watch behavior diverges across platforms (Linux inotify reliable,
//   macOS FSEvents coalesces, Windows ReadDirectoryChangesW occasionally
//   drops events). Polling is the SSoT because it cannot miss; fs.watch
//   reduces tail latency from pollMs down to ~zero when the OS hook fires.
//   This is why the plan calls it "hybrid Monitor + polling fallback" —
//   the Monitor (fs.watch) path is opportunistic, polling is binding.
//
// Boot-time mode detection:
//   - Try watcherFactory(envelopeDir, listener). If it throws (ENOENT before
//     directory exists, ENOTSUP, permission), mode falls back to 'polling'.
//   - Mode is reported through the returned .mode() getter so the
//     controller can stamp it onto STATE.md / receipt meta for debugging.
//
// onEvent contract — at most one emit per dispatch_id:
//   { type: 'envelope', envelopePath, dispatchId, mode } — new envelope file
//                                                          (UUID name matched)
//   { type: 'timeout' }                                  — deadlineMs reached
//   { type: 'error', error }                             — non-ENOENT scan failure
//
// stop() is idempotent — repeat calls are safe no-ops. Timeout fires stop
// internally so a deadline-hit watcher cleans itself up.
//
// MCCP_ORCHESTRATOR_POLL_MS env var overrides the default 500ms interval.

const fs = require('fs');
const path = require('path');

const DEFAULT_POLL_MS = 500;
const ENVELOPE_SUFFIX = '.envelope.json';
const DISPATCH_ID_BASENAME_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.envelope\.json$/i;

function envelopeIdFromBasename(basename) {
  const m = String(basename || '').match(DISPATCH_ID_BASENAME_RE);
  return m ? m[1] : null;
}

function defaultTimers() {
  return {
    setInterval: setInterval,
    clearInterval: clearInterval,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

function defaultFs() {
  return { readdirSync: fs.readdirSync };
}

function resolvePollMs(opts) {
  if (opts && opts.pollMs !== undefined && opts.pollMs !== null) {
    return opts.pollMs;
  }
  const env = process.env.MCCP_ORCHESTRATOR_POLL_MS;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_POLL_MS;
}

function watch(args, opts) {
  args = args || {};
  opts = opts || {};
  const envelopeDir = args.envelopeDir;
  const deadlineMs = args.deadlineMs;
  const onEvent = typeof args.onEvent === 'function' ? args.onEvent : function () {};

  if (typeof envelopeDir !== 'string' || envelopeDir.length === 0) {
    throw new TypeError('envelopeDir must be a non-empty string');
  }
  if (typeof deadlineMs !== 'number' || !Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new TypeError('deadlineMs must be a positive finite number');
  }

  const fsImpl = opts.fsImpl || defaultFs();
  const timers = opts.timers || defaultTimers();
  const watcherFactory = opts.watcherFactory || fs.watch;
  const pollMs = resolvePollMs(opts);

  let stopped = false;
  let mode = 'polling';
  let fsWatcher = null;
  const seen = new Set();

  function scan() {
    if (stopped) return;
    let entries;
    try {
      entries = fsImpl.readdirSync(envelopeDir);
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      onEvent({ type: 'error', error: err.message });
      return;
    }
    for (let i = 0; i < entries.length; i++) {
      if (stopped) return;
      const dispatchId = envelopeIdFromBasename(entries[i]);
      if (!dispatchId) continue;
      if (seen.has(dispatchId)) continue;
      seen.add(dispatchId);
      onEvent({
        type: 'envelope',
        envelopePath: path.join(envelopeDir, entries[i]),
        dispatchId: dispatchId,
        mode: mode,
      });
      // v1.3.0-m4 — envelope-move render trigger. Watcher is long-lived so
      // the 5s content debounce in trigger.js collapses bursty terminal-status
      // transitions. Lazy-require + try/catch keeps a staged install from
      // breaking the watcher loop.
      try {
        require('./renderer/trigger').triggerRender('envelope-move');
      } catch (err) {
        process.stderr.write('[mccp:dispatch-watcher] envelope-move trigger threw (allow): '
          + (err && err.message ? err.message : err) + '\n');
      }
    }
  }

  try {
    fsWatcher = watcherFactory(envelopeDir, function () {
      if (!stopped) scan();
    });
    mode = 'fs-watch';
  } catch (_) {
    mode = 'polling';
    fsWatcher = null;
  }

  const pollHandle = timers.setInterval(scan, pollMs);
  if (pollHandle && typeof pollHandle.unref === 'function') {
    try { pollHandle.unref(); } catch (_) {}
  }

  const timeoutHandle = timers.setTimeout(function () {
    if (stopped) return;
    onEvent({ type: 'timeout' });
    stopInternal();
  }, deadlineMs);
  if (timeoutHandle && typeof timeoutHandle.unref === 'function') {
    try { timeoutHandle.unref(); } catch (_) {}
  }

  function stopInternal() {
    if (stopped) return;
    stopped = true;
    if (fsWatcher && typeof fsWatcher.close === 'function') {
      try { fsWatcher.close(); } catch (_) {}
    }
    timers.clearInterval(pollHandle);
    timers.clearTimeout(timeoutHandle);
  }

  return {
    stop: stopInternal,
    mode: function () { return mode; },
    scanNow: scan,
  };
}

module.exports = {
  DEFAULT_POLL_MS: DEFAULT_POLL_MS,
  ENVELOPE_SUFFIX: ENVELOPE_SUFFIX,
  envelopeIdFromBasename: envelopeIdFromBasename,
  defaultFs: defaultFs,
  defaultTimers: defaultTimers,
  watch: watch,
};
