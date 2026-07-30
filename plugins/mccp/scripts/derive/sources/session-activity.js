'use strict';

// derive source: session-activity
// 관측: msw-events sidecar + session-ledger(read-only) + hook-trace shard → 착수/종료/활성 구간/동시세션 충돌
// Emits: { task_startups_count, task_completions_count, sessions, concurrent_pairs_count, collision_events_count, ... }
// degraded fail-open per-source.

const fs = require('fs');
const path = require('path');

function scanSessionActivity(repoRoot) {
  const result = {
    ok: true,
    task_startups_count: 0,
    task_completions_count: 0,
    // PR-Codex F2: A1 완료 신호에 live producer가 있는지. task_completed KIND
    // 이벤트를 emit하는 hook은 없으므로(session-end는 필드로 false만 기록) 실
    // corpus에서 이 값은 false로 남고, computeA1이 이를 보고 A1을 'computed 0%'가
    // 아니라 forward-only(신호 미배선)로 정직하게 판정한다. fixture는 명시적으로
    // true를 주입해 compute 경로를 실증한다.
    completions_producer_present: false,
    sessions: [],
    concurrent_pairs_count: 0,
    collision_events_count: 0,
    inversion_detected: false,
    producer_coverage: 'session-activity',
    degraded: false,
    invalid_count: 0,
    error: null,
  };

  try {
    // 1. Read msw-events sidecars (.claude/state/msw-events/<session_id>.jsonl)
    const mswEventsDir = path.join(repoRoot, '.claude', 'state', 'msw-events');
    const sessions = {};

    if (fs.existsSync(mswEventsDir)) {
      const files = fs.readdirSync(mswEventsDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const sessionId = file.replace(/\.jsonl$/, '');
        const filePath = path.join(mswEventsDir, file);

        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split(/\r?\n/).filter(l => l.trim());

          for (const line of lines) {
            try {
              const evt = JSON.parse(line);
              if (!sessions[sessionId]) {
                sessions[sessionId] = {
                  session_id: sessionId,
                  events: [],
                  context_remaining_pct: null,
                  task_completed: false,
                  created_at: evt.created_at,
                  ended_at: evt.ended_at,
                };
              }
              sessions[sessionId].events.push(evt);

              // Collect context_remaining_pct and task_completed from session_end events
              if (evt.kind === 'session_end') {
                sessions[sessionId].ended_at = evt.ended_at;
                if (evt.context_remaining_pct !== undefined && evt.context_remaining_pct !== null) {
                  sessions[sessionId].context_remaining_pct = evt.context_remaining_pct;
                }
                if (evt.task_completed !== undefined && evt.task_completed !== null) {
                  sessions[sessionId].task_completed = evt.task_completed;
                }
              }

              // Count task completions. task_completed는 별도 KIND 이벤트로만
              // 계상한다 — 존재 자체가 완료 producer가 배선됐다는 신호(F2).
              if (evt.kind === 'task_completed') {
                result.task_completions_count++;
                result.completions_producer_present = true;
              }
            } catch (lineErr) {
              // Per-line malformed isolation (R2-F1 absorption)
              result.invalid_count++;
            }
          }
        } catch (fileErr) {
          result.degraded = true;
        }
      }
    }

    // 2. Count task startups (from session_start events)
    for (const sid of Object.keys(sessions)) {
      const sess = sessions[sid];
      const hasStart = sess.events.some(e => e.kind === 'session_start');
      if (hasStart) {
        result.task_startups_count++;
      }
    }

    // PR-Codex F3: session-end.js는 Stop hook이라 매 응답마다 session_end 이벤트를
    // emit한다. 따라서 세션은 session_end를 여러 개 갖고, 활성 구간의 종료는 첫
    // session_end가 아니라 **가장 늦은** session_end(마지막 활동 시각)여야 한다.
    // 첫 session_end를 쓰면 첫 응답 이후 지속된 세션이 inactive로 처리돼 B2가
    // 동시성을 undercount한다(측정 목적 무력화).
    const spanOf = (sess) => {
      const startEvt = sess.events.find(e => e.kind === 'session_start');
      if (!startEvt) return null;
      let maxEnd = -Infinity;
      for (const e of sess.events) {
        if (e.kind !== 'session_end') continue;
        const t = new Date(e.ended_at || e.ts).getTime();
        if (Number.isFinite(t) && t > maxEnd) maxEnd = t;
      }
      if (maxEnd === -Infinity) return null;
      const start = new Date(startEvt.created_at || startEvt.ts).getTime();
      if (!Number.isFinite(start)) return null;
      return { start, end: maxEnd };
    };

    // 3. Build active spans (session_start → last session_end) and find concurrent pairs
    const activeSpans = [];
    for (const sid of Object.keys(sessions)) {
      const span = spanOf(sessions[sid]);
      if (span) {
        activeSpans.push({ session_id: sid, start: span.start, end: span.end });
      }
    }

    // 4. Detect concurrent pairs (overlapping spans)
    for (let i = 0; i < activeSpans.length; i++) {
      for (let j = i + 1; j < activeSpans.length; j++) {
        const a = activeSpans[i];
        const b = activeSpans[j];
        // Check overlap: a.start < b.end AND b.start < a.end
        if (a.start < b.end && b.start < a.end) {
          result.concurrent_pairs_count++;
        }
      }
    }

    // 5. Detect collision events (from msw-events collision markers)
    for (const sid of Object.keys(sessions)) {
      const sess = sessions[sid];
      const collisionEvents = sess.events.filter(e => e.kind === 'conflict' || e.kind === 'collision');
      result.collision_events_count += collisionEvents.length;
    }

    // 6. Check for timestamp inversions (착수 시각 > 종료 시각)
    // 원본 지시 시각은 msw-events에 없으므로 세션 내 event 순서로 근사한다.
    // span helper와 동일하게 마지막 session_end를 종료로 쓴다(F3 일관성).
    for (const sid of Object.keys(sessions)) {
      const span = spanOf(sessions[sid]);
      if (span && span.start > span.end) {
        result.inversion_detected = true;
      }
    }

    result.sessions = Object.values(sessions);
  } catch (err) {
    result.ok = false;
    result.error = err.message;
    result.degraded = true;
  }

  return result;
}

module.exports = {
  scanSessionActivity,
};
