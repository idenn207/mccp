#!/usr/bin/env node
'use strict';

// v0.3.0 S10b — Stop hook entry for cost-tier-based auto-handoff.
//
// Wired after stop-review-loop.js in hooks.json `Stop` array so the
// safe-event AND-gate (architecture §4) sees the freshest STATE.md
// last_event signal.
//
// Contract:
//   stdin:  raw JSON event {session_id, transcript_path, cwd, ...}
//   stdout: JSON telemetry {ok, mode, tier, reason, fallback_reason?}
//   stderr: human-readable banner (notify mode) / debug line (debug)
//   exit:   ALWAYS 0 — auto-handoff is fail-open by design (never blocks Stop).
//
// Idempotency: session-spawner's race-lock is the idempotency key. Two
// concurrent Stop fires with the same currentTask hash → second call
// returns ok:false reason:'lock-held' and ledger records both attempts.
//
// Ledger: <repo>/.claude/state/auto-handoff-log.jsonl
//   schema: { ts, tier, mode, reason, fallback_reason?, cost_usd?, lock_path?,
//             experimental_spawn_requested? }
//
// v1.1.0 deprecation marker: `spawn` mode is now experimental. Caller asks for
// it via MCCP_AUTO_HANDOFF=spawn, but the spawner refuses unless
// MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1 is also set. The
// `experimental_spawn_requested` ledger field captures the intent regardless of
// whether the spawn actually fired — useful for observing how many users still
// reach for the deprecated mode after the v1.1.0 quarantine landed.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

const detector = require(path.join(PLUGIN_ROOT, 'scripts', 'state', 'breakpoint-detector'));
const spawner = require(path.join(PLUGIN_ROOT, 'scripts', 'state', 'session-spawner'));
const stateWriter = require(path.join(PLUGIN_ROOT, 'scripts', 'state', 'state-writer'));

const MAX_STDIN_BYTES = 1024 * 1024;
const LEDGER_RELPATH = path.join('.claude', 'state', 'auto-handoff-log.jsonl');

function debug(stderr, line) {
  if (stderr && typeof stderr.write === 'function') {
    stderr.write('[mccp:auto-handoff] ' + line + '\n');
  }
}

function repoRootFor(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    }).trim();
  } catch (_) { return null; }
}

function readCurrentTask(root) {
  // task_fingerprint from STATE.md is the canonical identifier; falls back
  // to 'unknown' if state-writer cannot read (no STATE.md yet).
  try {
    const s = stateWriter.readState(root);
    return (s && s.frontmatter && s.frontmatter.task_fingerprint) || 'unknown';
  } catch (_) { return 'unknown'; }
}

function appendLedger(root, entry) {
  const target = path.join(root, LEDGER_RELPATH);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    // Ledger is observability — never fail the hook on ledger write error.
    process.stderr.write('[mccp:auto-handoff] ledger write failed: ' +
      err.message + '\n');
  }
}

function run(rawInput, opts) {
  const options = opts || {};
  const env = options.env || process.env;
  const stderr = options.stderr || process.stderr;

  // Parse stdin event.
  let event = {};
  try {
    if (rawInput && rawInput.trim()) event = JSON.parse(rawInput);
  } catch (err) {
    debug(stderr, 'stdin parse failure: ' + err.message + '; pass-through');
    return { telemetry: { ok: false, reason: 'stdin-parse-error' } };
  }

  const cwd = (event && event.cwd) || options.cwd || process.cwd();
  const root = options.root || repoRootFor(cwd);
  if (!root) {
    debug(stderr, 'not a git repo (cwd=' + cwd + '); skip');
    return { telemetry: { ok: false, reason: 'not-a-repo' } };
  }

  // Detect.
  const detect = options.detect || detector.detect;
  const decision = detect({ root: root });
  debug(stderr, 'tier=' + decision.tier + ' reason=' + decision.reason +
    ' shouldHandoff=' + decision.shouldHandoff);

  // Compose ledger entry baseline.
  const baseEntry = {
    ts: new Date().toISOString(),
    tier: decision.tier,
    reason: decision.reason,
    cost_usd: decision.costUsd,
    should_handoff: decision.shouldHandoff,
  };

  if (!decision.shouldHandoff) {
    appendLedger(root, Object.assign({}, baseEntry, { mode: 'noop' }));
    return { telemetry: Object.assign({ ok: true, mode: 'noop' }, baseEntry) };
  }

  // Hand-off path.
  const currentTask = options.currentTask || readCurrentTask(root);
  const spawnFn = options.spawn || spawner.spawn;
  const requestedMode = options.mode || spawner.modeFromEnv(env);
  const result = spawnFn({
    root: root,
    tier: decision.tier,
    currentTask: currentTask,
    mode: requestedMode,
    env: env,
    spawnImpl: options.spawnImpl,
    claudeAvailable: options.claudeAvailable,
    platform: options.platform,
    hasTmux: options.hasTmux,
  });

  const ledgerEntry = Object.assign({}, baseEntry, {
    mode: result.mode,
    fallback_reason: result.fallbackReason || null,
    lock_path: result.lockPath || null,
    unsafe_checkpoint: !!result.unsafeCheckpoint,
    experimental_spawn_requested: requestedMode === 'spawn',
  });
  appendLedger(root, ledgerEntry);

  return {
    telemetry: Object.assign({ ok: result.ok }, ledgerEntry),
  };
}

function readStdin(maxBytes) {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
      if (buf.length < maxBytes) buf += chunk.substring(0, maxBytes - buf.length);
    });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 280000);
  });
}

if (require.main === module) {
  readStdin(MAX_STDIN_BYTES).then(function (raw) {
    try {
      const result = run(raw);
      process.stdout.write(JSON.stringify(result.telemetry) + '\n');
    } catch (err) {
      process.stderr.write('[mccp:auto-handoff] fatal: ' +
        (err && err.stack || err) + '\n');
      // Loud fail-open principle: log + telemetry + ALLOW.
      process.stdout.write(JSON.stringify({
        ok: false, reason: 'fatal: ' + (err && err.message),
      }) + '\n');
    }
    process.exit(0);
  });
}

module.exports = {
  run: run,
  appendLedger: appendLedger,
  readCurrentTask: readCurrentTask,
  LEDGER_RELPATH: LEDGER_RELPATH,
};
