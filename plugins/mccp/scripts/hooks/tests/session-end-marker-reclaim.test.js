'use strict';

// session-process-reclaim M2 — SessionEnd wiring.
//
// Two invariants, and they pull in opposite directions:
//   UI10/UI8 — reclaim runs LAST and can never cost us the end marker or change
//              the hook's return value.
//   UI6      — and yet it must not be able to fail quietly.
//
// The stderr assertions below are the load-bearing ones. Checking only "run()
// still returned" would be satisfied by `catch (_) {}`, which is precisely the
// implementation UI6 forbids.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const marker = require('../session-end-marker');

const SID = 'sess-reclaim-test';

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-sem-'));
  fs.mkdirSync(path.join(dir, '.claude', 'state'), { recursive: true });
  return fs.realpathSync.native(dir);
}

function endMarkerPath(repo, sid) {
  return path.join(repo, '.claude', 'state', 'hook-trace', sid, '.end');
}

// Captures stderr for the duration of `fn`. The hook writes its surfacing there
// by design (a detached child's stdout is not an observation channel), so this
// is the only place the assertions can look.
function captureStderr(fn) {
  const chunks = [];
  const original = process.stderr.write;
  process.stderr.write = function (chunk) { chunks.push(String(chunk)); return true; };
  try { return { value: fn(chunks), err: null, text: chunks.join('') }; }
  catch (err) { return { value: undefined, err, text: chunks.join('') }; }
  finally { process.stderr.write = original; }
}

function withSessionEnv(sid, fn) {
  const prev = process.env.CLAUDE_SESSION_ID;
  if (sid === null) delete process.env.CLAUDE_SESSION_ID;
  else process.env.CLAUDE_SESSION_ID = sid;
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = prev;
  }
}

function payload(repo, sid) {
  return JSON.stringify({ session_id: sid, cwd: repo });
}

const OK_RESULT = {
  attempted: 0, reclaimed: [], skipped: [], unreclaimed: [],
  writeFailures: [], complete: true, budgetExceeded: false,
};

// ── (a) exception path ──────────────────────────────────────────────────────

test('(a) a throwing reclaim leaves the return value and the end marker intact — and says so', () => {
  const repo = tmpRepo();
  const input = payload(repo, SID);

  const got = withSessionEnv(SID, () => captureStderr(() => marker.run(input, {
    reclaimSession: () => { throw new Error('boom-from-reclaim'); },
  })));

  assert.strictEqual(got.err, null, 'run() must not propagate the failure');
  assert.strictEqual(got.value, input, 'the hook output stays byte-identical (UI8)');
  assert.ok(fs.existsSync(endMarkerPath(repo, SID)),
    'the marker was written before reclaim was attempted (UI10)');
  assert.match(got.text, /\[mccp:session-reclaim\] threw/,
    'a `catch (_) {}` implementation would pass every assertion above — this is '
    + 'the one that fails it');
  assert.match(got.text, /boom-from-reclaim/, 'the underlying error must be quoted, not summarised away');
});

// ── (b) ordering ────────────────────────────────────────────────────────────

test('(b) order is marker → observer cleanup → reclaim', () => {
  const repo = tmpRepo();
  const seen = {};

  withSessionEnv(SID, () => captureStderr((chunks) => marker.run(payload(repo, SID), {
    reclaimSession: () => {
      // Sampled from INSIDE the reclaim call, so it can only report what had
      // already happened by then.
      seen.markerExists = fs.existsSync(endMarkerPath(repo, SID));
      seen.observerRan = chunks.join('').includes('[SessionEnd]');
      return OK_RESULT;
    },
  })));

  assert.strictEqual(seen.markerExists, true, 'marker precedes reclaim');
  assert.strictEqual(seen.observerRan, true,
    'observer cleanup precedes reclaim — it logs a [SessionEnd] line on every branch');
});

// ── (c) no session identity ─────────────────────────────────────────────────

test('(c) with no CLAUDE_SESSION_ID the reclaim is skipped entirely', () => {
  const repo = tmpRepo();
  let called = false;
  const got = withSessionEnv(null, () => captureStderr(() => marker.run(payload(repo, SID), {
    reclaimSession: () => { called = true; return OK_RESULT; },
  })));
  assert.strictEqual(called, false, 'without a session key there is no directory to reclaim from');
  assert.strictEqual(got.err, null);
});

// ── (d)(e) the return value is actually consumed ────────────────────────────

test('(d) complete:false is surfaced — an implementation that drops the result is red here', () => {
  const repo = tmpRepo();
  const got = withSessionEnv(SID, () => captureStderr(() => marker.run(payload(repo, SID), {
    reclaimSession: () => Object.assign({}, OK_RESULT, { complete: false }),
  })));
  assert.match(got.text, /\[mccp:session-reclaim\] incomplete/);
  assert.match(got.text, /complete=false/,
    '§D6 claims "an absent record is not proof of reclaim"; this line is what '
    + 'makes that claim observable rather than a comment');
});

test('(e) one unreclaimed entry fires the warning even when complete is true', () => {
  const repo = tmpRepo();
  const got = withSessionEnv(SID, () => captureStderr(() => marker.run(payload(repo, SID), {
    reclaimSession: () => Object.assign({}, OK_RESULT, {
      attempted: 1, unreclaimed: [{ pid: 4242, reason: 'eperm' }],
    }),
  })));
  assert.match(got.text, /\[mccp:session-reclaim\] incomplete/,
    'the trigger is a disjunction, not `complete` alone — an EPERM process is '
    + 'still running and the operator has to hear about it');
  assert.match(got.text, /unreclaimed=1/);
});

test('a fully clean reclaim stays silent', () => {
  const repo = tmpRepo();
  const got = withSessionEnv(SID, () => captureStderr(() => marker.run(payload(repo, SID), {
    reclaimSession: () => Object.assign({}, OK_RESULT, { attempted: 1, reclaimed: [4242] }),
  })));
  assert.ok(!/session-reclaim/.test(got.text),
    'noise on the happy path is how real warnings stop being read');
});

test('the default path reaches the real reclaimSession without a stub', () => {
  // Guards the wiring itself: with no injected dep the hook must still run the
  // module's own reclaim over an empty registry, and stay quiet about it.
  const repo = tmpRepo();
  const got = withSessionEnv(SID, () => captureStderr(() => marker.run(payload(repo, SID))));
  assert.strictEqual(got.err, null);
  assert.ok(!/session-reclaim/.test(got.text), 'an empty registry is a complete, silent no-op');
});
