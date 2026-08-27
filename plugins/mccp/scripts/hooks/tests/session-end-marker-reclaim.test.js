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

// multi-session-work-loop M8 — "세션 키가 전혀 없다"는 상태는 이제 **세 이름을
// 전부** 비워야 성립한다. 이전 판본은 `CLAUDE_SESSION_ID` 하나만 지웠는데, M8이
// 해소기를 단일 체인(`MCCP_SESSION_ID` → `CLAUDE_CODE_SESSION_ID` →
// `CLAUDE_SESSION_ID`)으로 모으면서 나머지 둘이 주변 환경에서 새어 들어와
// "키 없음" 시나리오가 실제로는 키가 있는 상태가 됐다.
//
// 이름 목록을 여기 다시 적지 않고 오라클에서 가져온다 — 두 번 적으면 체인이
// 또 넓어질 때 이 test가 조용히 거짓이 되는 자리가 하나 더 생긴다.
const { SESSION_ID_ENV_NAMES } = require('../../lib/session-identity');

function withSessionEnv(sid, fn) {
  const prev = {};
  SESSION_ID_ENV_NAMES.forEach(function (n) { prev[n] = process.env[n]; });
  SESSION_ID_ENV_NAMES.forEach(function (n) { delete process.env[n]; });
  if (sid !== null) process.env.CLAUDE_SESSION_ID = sid;
  try { return fn(); }
  finally {
    SESSION_ID_ENV_NAMES.forEach(function (n) {
      if (prev[n] === undefined) delete process.env[n];
      else process.env[n] = prev[n];
    });
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

// santa-loop R4 corrected this pair. The original single case asserted that an
// absent CLAUDE_SESSION_ID skips reclaim "entirely" — while handing the hook a
// payload that carried the session id all along. It was pinning a gap as if it
// were a rule: the session's processes stayed registered forever even though the
// id needed to reclaim them was right there in the event.

test('(c) with NO session id from either source, reclaim is skipped', () => {
  const repo = tmpRepo();
  let called = false;
  const got = withSessionEnv(null, () => captureStderr(() => marker.run(
    JSON.stringify({ cwd: repo }),          // payload carries no session_id either
    { reclaimSession: () => { called = true; return OK_RESULT; } })));
  assert.strictEqual(called, false, 'with no session key at all there is no directory to reclaim from');
  assert.strictEqual(got.err, null);
});

test('(c3) env and payload disagree — the PAYLOAD wins, and the mismatch is named', () => {
  // santa-loop R6. Round 4 added the payload fallback but put the ENV first, so
  // a stale or inherited env made reclaim run against a session that was not
  // ending — killing that session's processes. The payload is Claude Code naming
  // the session that ended; the env is ambient. The authoritative source has to
  // be the one that answers the actual question.
  const repo = tmpRepo();
  let seen = null;
  const got = withSessionEnv('sess-STALE-ENV', () => captureStderr(() => marker.run(
    payload(repo, SID),
    { reclaimSession: (opts) => { seen = opts; return OK_RESULT; } })));

  assert.ok(seen, 'reclaim must run');
  assert.strictEqual(seen.sessionId, SID,
    'reclaiming the env session would terminate processes of a session that is NOT ending');
  assert.ok(/session id mismatch/.test(got.text),
    'and a disagreement is either a harness bug or a stale env — never silent');
});

test('(c2) env id absent but the PAYLOAD carries one — reclaim still runs', () => {
  const repo = tmpRepo();
  let seen = null;
  withSessionEnv(null, () => captureStderr(() => marker.run(payload(repo, SID), {
    reclaimSession: (opts) => { seen = opts; return OK_RESULT; },
  })));
  assert.ok(seen, 'an env-only miss must not strand this session\'s processes: the '
    + 'SessionEnd payload names the ending session, and reclaim needs nothing else');
  assert.strictEqual(seen.sessionId, SID);
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

// santa-loop R4. The `require` of the reclaim stack sat OUTSIDE the try, so a
// module-load failure threw straight out of run() — a NEW blocking failure mode
// in a hook whose contract (hooks.json: async, timeout 10) is non-blocking, and
// it bypassed the very stderr surfacing written to report it. Every other test
// here injects `deps.reclaimSession`, which short-circuits the require and so
// could never have caught this. This one breaks the real module load.
test('a module-load failure in the reclaim stack cannot break the hook', () => {
  const repo = tmpRepo();
  const Module = require('module');
  const original = Module._load;
  Module._load = function (request) {
    if (String(request).includes('session-processes')) {
      throw new Error('SIMULATED module load failure');
    }
    return original.apply(this, arguments);
  };

  let got;
  try {
    got = withSessionEnv(SID, () => captureStderr(() => marker.run(payload(repo, SID))));
  } finally {
    Module._load = original;
  }

  assert.strictEqual(got.err, null,
    'run() must not throw: a load failure here would be a blocking SessionEnd failure');
  assert.strictEqual(got.value, payload(repo, SID),
    'the return value must survive a load failure — UI8 makes reclaim non-blocking');
  assert.ok(fs.existsSync(endMarkerPath(repo, SID)),
    'and the end marker must already be on disk');
  assert.ok(/SIMULATED module load failure/.test(got.text),
    'and the failure must be NAMED — surviving quietly is the UI6 violation');
});

test('the default path reaches the real reclaimSession without a stub', () => {
  // Guards the wiring itself: with no injected dep the hook must still run the
  // module's own reclaim over an empty registry, and stay quiet about it.
  const repo = tmpRepo();
  const got = withSessionEnv(SID, () => captureStderr(() => marker.run(payload(repo, SID))));
  assert.strictEqual(got.err, null);
  assert.ok(!/session-reclaim/.test(got.text), 'an empty registry is a complete, silent no-op');
});
