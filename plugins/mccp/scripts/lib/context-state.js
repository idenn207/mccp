'use strict';

// cost-model-subscription M1 — context overflow snapshot (context-current.json).
//
// The subscription overflow axis (subscription.js#evaluateOverflow) reads this
// snapshot. Written best-effort by ecc-context-monitor on every PostToolUse from
// the metrics bridge (context_remaining_pct + tool_count).
//
// Mirrors cost-state.js (read/isStale) + ecc-context-monitor.js#writeWarnState
// (pid+nonce unique-tmp atomic rename, NO lockfile — best-effort telemetry).
//
// DELIBERATE DIFFERENCE from cost-state.js: NOT monotonic-sticky. context% both
// rises (compaction/free) and falls, and tool_count rises, so this is a
// latest-wins snapshot. Out-of-order clobber is prevented by rejecting a write
// whose data is OLDER than what is stored — ordered by tool_count when present
// (monotonic), else by context_ts write time (Codex F2 absorption).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getCostStateDir } = require('./cost-state-path');

const CONTEXT_STATE_FILENAME = 'context-current.json';

function statePath(dir) {
  return path.join(dir || getCostStateDir(), CONTEXT_STATE_FILENAME);
}

// readState(opts?) → { context_remaining_pct, tool_count, context_ts } | null.
// Parse failure / missing → null (mirror cost-state.readState). opts.dir tests.
function readState(opts) {
  opts = opts || {};
  const p = statePath(opts.dir);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      context_remaining_pct: Number.isFinite(parsed.context_remaining_pct) ? parsed.context_remaining_pct : null,
      tool_count: Number.isFinite(parsed.tool_count) ? parsed.tool_count : null,
      context_ts: Number.isFinite(parsed.context_ts) ? parsed.context_ts : 0,
      // multi-session-work-loop M8 (DD6) — 귀속 필드. 없으면 null이고, 소비처
      // (session-end.js)는 null을 "일치하지 않음"으로 다뤄 stamp를 거른다.
      // 구 스냅샷에는 이 키가 없으므로 그 값들은 자동으로 미귀속 처리된다.
      session_id: typeof parsed.session_id === 'string' && parsed.session_id ? parsed.session_id : null,
    };
  } catch (_e) {
    return null;
  }
}

// isOlderSample(incoming, prev) — true when `incoming` is strictly older data
// than `prev` and must NOT clobber it (Codex F2). tool_count is the monotonic
// ordering key (every PostToolUse increments it); when either side lacks it,
// fall back to the write timestamp.
function isOlderSample(incoming, prev) {
  if (!prev) return false;
  const inTool = incoming.tool_count;
  const prevTool = prev.tool_count;
  if (Number.isFinite(inTool) && Number.isFinite(prevTool)) {
    return inTool < prevTool;
  }
  const inTs = incoming.context_ts;
  const prevTs = prev.context_ts;
  if (Number.isFinite(inTs) && Number.isFinite(prevTs)) {
    return inTs < prevTs;
  }
  return false;
}

// writeState({ contextRemainingPct, toolCount }, opts?) → { ok, skipped?, state? }
// opts.now (epoch ms, injectable for tests) stamps context_ts; opts.dir overrides
// the state dir (tests). Out-of-order writes are skipped (ok:true, skipped:true).
function writeState(input, opts) {
  input = input || {};
  opts = opts || {};
  const dir = opts.dir || getCostStateDir();
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const snapshot = {
    context_remaining_pct: Number.isFinite(input.contextRemainingPct) ? input.contextRemainingPct : null,
    tool_count: Number.isFinite(input.toolCount) ? input.toolCount : null,
    context_ts: now,
    // DD6 — 새 텔레메트리가 아니라 **기존 스냅샷의 귀속 필드**다.
    // `ecc-context-monitor`는 hook payload의 `input.session_id`를 이미 갖고
    // 있었는데 이 writer가 그것을 버리고 있었다. 버리는 바람에 `session-end.js`가
    // latest-wins 스냅샷을 어느 세션 것인지 모른 채 stamp했고, 그래서 M2 정직성
    // 강등이 그 read를 통째로 `null`로 막았다. 값을 실어 보존하는 것이 그 강등이
    // 요구한 복원 조건이다.
    session_id: typeof input.sessionId === 'string' && input.sessionId ? input.sessionId : null,
  };
  const prev = readState(opts);
  if (isOlderSample(snapshot, prev)) {
    return { ok: true, skipped: true, reason: 'older-sample', state: prev };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    const target = statePath(dir);
    const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    try {
      fs.renameSync(tmp, target);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
      throw err;
    }
    return { ok: true, state: snapshot };
  } catch (err) {
    return { ok: false, reason: 'write-error: ' + err.message };
  }
}

// isStale(maxAgeMs, opts?) — context_ts primary, file mtime fallback. Missing →
// stale (mirror cost-state.isStale). opts.now injectable for tests.
function isStale(maxAgeMs, opts) {
  opts = opts || {};
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const st = readState(opts);
  if (st && Number.isFinite(st.context_ts) && st.context_ts > 0) {
    return (now - st.context_ts) > maxAgeMs;
  }
  const p = statePath(opts.dir);
  try {
    const mtime = fs.statSync(p).mtimeMs;
    return (now - mtime) > maxAgeMs;
  } catch (_e) {
    return true;
  }
}

// ── A2 세션 바인딩 (multi-session-work-loop M8 Task 6 · DD6) ─────────────────
//
// 신선도 창은 **상수**다(DD9 — 새 env 토글 0개). producer에 kill switch를 달면
// 그 순간 "지표가 꺼져 있었다"가 정상 상태가 되고, 그것이 이 PRD가 없애려는
// 실패 양상이다. test는 `opts.maxAgeMs` 주입으로 경계를 검사한다.
//
// 15분: PostToolUse마다 갱신되는 스냅샷이므로 활성 세션에서는 항상 훨씬 신선하다.
// 이 창을 넘겼다는 것은 세션이 그동안 도구를 한 번도 안 썼다는 뜻이고, 그 값은
// 종료 시점의 context%를 대표하지 못한다.
const CONTEXT_SAMPLE_MAX_AGE_MS = 15 * 60 * 1000;

// resolveSessionBoundPct(sessionId, opts?) → number | null
//
// 스냅샷을 종료 중인 세션에 **귀속시킬 수 있을 때만** 값을 돌려준다. 셋 중
// 하나라도 아니면 `null`이고, 그 null은 M2 강등이 하드코딩했던 것과 같은 값이다 —
// 강등을 되돌리는 것이 아니라 강등이 요구한 조건을 충족시키는 것이다.
//
//   (a) 스냅샷에 `session_id`가 있고 종료 세션과 **엄격 문자열 일치**
//   (b) 샘플이 `maxAgeMs` 안
//   (c) 값이 유한수
//
// (a)의 엄격 비교는 security review R1 F5 흡수다: 손상된 스냅샷이 객체나 null을
// 실어 와도 타입 혼동 없이 곧바로 불일치가 된다.
function resolveSessionBoundPct(sessionId, opts) {
  opts = opts || {};
  try {
    const snap = readState(opts);
    if (!snap) return null;

    const snapSid = typeof snap.session_id === 'string' ? snap.session_id : '';
    const endingSid = typeof sessionId === 'string' ? sessionId : '';
    if (!snapSid || !endingSid || snapSid !== endingSid) return null;

    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const maxAgeMs = Number.isFinite(opts.maxAgeMs) ? opts.maxAgeMs : CONTEXT_SAMPLE_MAX_AGE_MS;
    if (!Number.isFinite(snap.context_ts) || (now - snap.context_ts) > maxAgeMs) return null;

    if (!Number.isFinite(snap.context_remaining_pct)) return null;
    return snap.context_remaining_pct;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  readState: readState,
  writeState: writeState,
  isStale: isStale,
  isOlderSample: isOlderSample,
  statePath: statePath,
  resolveSessionBoundPct: resolveSessionBoundPct,
  CONTEXT_STATE_FILENAME: CONTEXT_STATE_FILENAME,
  CONTEXT_SAMPLE_MAX_AGE_MS: CONTEXT_SAMPLE_MAX_AGE_MS,
};
