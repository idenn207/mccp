'use strict';

// Per-task bounded counter for the Stop-loop hook.
//
// Storage: `<repo>/.claude/state/loop-counter.json`
//   {
//     "version": 1,
//     "tasks": {
//       "<task_fingerprint>": {
//         "count": 0..2,
//         "lastAt": "<ISO-8601-UTC>",
//         "fixTaskHash": "<sha256-hex-first-12>"
//       }
//     }
//   }
//
// Reads, writes, and bumps are atomic via the unique-suffix-then-rename
// pattern that scripts/lib/session-bridge.js uses, so two parallel Stop
// hooks (rare but possible) cannot clobber each other's increment.
//
// Cap is 2. count=2 means the hook has already failed twice and the next
// Stop should emit "human takeover" meta + allow the response (Risk #1 +
// brainstorming pain ① mitigation).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COUNTER_VERSION = 1;
const MAX_COUNT = 2;
const STATE_DIRNAME = path.join('.claude', 'state');
const COUNTER_FILENAME = 'loop-counter.json';

function counterPath(repoRoot) {
  return path.join(repoRoot, STATE_DIRNAME, COUNTER_FILENAME);
}

function ensureDir(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
}

function fingerprintFromPrompt(firstUserPrompt) {
  const head = String(firstUserPrompt || '').slice(0, 200);
  return crypto.createHash('sha256').update(head).digest('hex').slice(0, 12);
}

function emptyState() {
  return { version: COUNTER_VERSION, tasks: {} };
}

function readState(repoRoot) {
  const target = counterPath(repoRoot);
  if (!fs.existsSync(target)) return emptyState();
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    // Reviewer B Round 2 #3: surface the failure so a corrupt/unreadable
    // counter is not invisibly bypassing the human-takeover bound.
    process.stderr.write('[mccp:loop-counter] WARNING: read failed for ' + target +
      ' (' + err.code + '); resetting state\n');
    return emptyState();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write('[mccp:loop-counter] WARNING: invalid JSON at ' + target +
      ' (' + err.message + '); resetting state\n');
    return emptyState();
  }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== COUNTER_VERSION) {
    process.stderr.write('[mccp:loop-counter] WARNING: unsupported state version at ' +
      target + ' (got ' + (parsed && parsed.version) + ', expected ' + COUNTER_VERSION +
      '); resetting state\n');
    return emptyState();
  }
  if (!parsed.tasks || typeof parsed.tasks !== 'object') parsed.tasks = {};
  return parsed;
}

function writeState(repoRoot, state) {
  const target = counterPath(repoRoot);
  ensureDir(target);
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
}

// Advisory lock around read-modify-write so two parallel Stop hooks cannot
// both read `count=0` and both persist `count=1` (Reviewer B Round 1 #3).
// Uses O_EXCL create + busy-wait retry. Fail-soft: if we cannot acquire
// within `LOCK_MAX_RETRIES * LOCK_RETRY_MS` we proceed unlocked rather than
// block the Stop hook entirely.
const LOCK_MAX_RETRIES = 50;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 30 * 1000;

function lockPath(repoRoot) {
  return counterPath(repoRoot) + '.lock';
}

function tryAcquire(lockFile) {
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, String(process.pid) + '\n' + new Date().toISOString());
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return false;
  }
}

function isStaleLock(lockFile) {
  try {
    const stat = fs.statSync(lockFile);
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch (_e) { return false; }
}

function withCounterLock(repoRoot, fn) {
  ensureDir(counterPath(repoRoot));
  const lockFile = lockPath(repoRoot);
  let acquired = false;
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    if (tryAcquire(lockFile)) { acquired = true; break; }
    if (isStaleLock(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
      continue;
    }
    const start = Date.now();
    while (Date.now() - start < LOCK_RETRY_MS) { /* spin briefly */ }
  }
  if (!acquired) {
    // Reviewer B Round 2 #2: lock unavailable after the retry budget would
    // silently reintroduce R-M-W races. Surface the situation; the caller
    // (Stop hook) prefers proceed-with-warning over an indefinite block.
    process.stderr.write('[mccp:loop-counter] WARNING: could not acquire lock at ' +
      lockFile + ' after ' + (LOCK_MAX_RETRIES * LOCK_RETRY_MS) +
      'ms; proceeding without lock (race window open)\n');
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockFile); } catch (_e) { /* ignore */ }
    }
  }
}

function bumpUnlocked(repoRoot, taskFingerprint, fixTaskHash) {
  const state = readState(repoRoot);
  const current = state.tasks[taskFingerprint] || { count: 0 };
  const nextCount = Math.min(current.count + 1, MAX_COUNT);
  state.tasks[taskFingerprint] = {
    count: nextCount,
    lastAt: new Date().toISOString(),
    fixTaskHash: fixTaskHash || null,
  };
  writeState(repoRoot, state);
  return state.tasks[taskFingerprint];
}

function get(repoRoot, taskFingerprint) {
  const state = readState(repoRoot);
  return state.tasks[taskFingerprint] || { count: 0, lastAt: null, fixTaskHash: null };
}

function bump(repoRoot, taskFingerprint, fixTaskHash) {
  return withCounterLock(repoRoot, function () {
    return bumpUnlocked(repoRoot, taskFingerprint, fixTaskHash);
  });
}

// Reviewer B Round 2 #1: compose the fix-task write and the counter bump
// atomically so two concurrent failing Stop hooks cannot leave fix-task.md
// at counter=N while loop-counter.json reaches counter=N+1.
//
// `compose(nextCount)` is invoked under the lock with the count value the
// counter is about to advance to. It returns the fix-task hash (e.g. from
// fix-task.js write()), which is persisted alongside the bump.
function bumpAndCompose(repoRoot, taskFingerprint, compose) {
  return withCounterLock(repoRoot, function () {
    const current = readState(repoRoot).tasks[taskFingerprint] || { count: 0 };
    const nextCount = Math.min(current.count + 1, MAX_COUNT);
    const hash = compose(nextCount);
    return bumpUnlocked(repoRoot, taskFingerprint, hash);
  });
}

function reset(repoRoot, taskFingerprint) {
  withCounterLock(repoRoot, function () {
    const state = readState(repoRoot);
    if (state.tasks[taskFingerprint]) {
      delete state.tasks[taskFingerprint];
      writeState(repoRoot, state);
    }
  });
}

function clearAll(repoRoot) {
  const target = counterPath(repoRoot);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

module.exports = {
  COUNTER_VERSION: COUNTER_VERSION,
  MAX_COUNT: MAX_COUNT,
  counterPath: counterPath,
  lockPath: lockPath,
  fingerprintFromPrompt: fingerprintFromPrompt,
  emptyState: emptyState,
  readState: readState,
  writeState: writeState,
  withCounterLock: withCounterLock,
  get: get,
  bump: bump,
  bumpUnlocked: bumpUnlocked,
  bumpAndCompose: bumpAndCompose,
  reset: reset,
  clearAll: clearAll,
};
