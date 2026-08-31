'use strict';

// derive source: session-activity
// 관측: msw-events sidecar + session-ledger(read-only) + hook-trace shard → 착수/종료/활성 구간/동시세션 충돌
// Emits: { task_startups_count, task_completions_count, sessions, concurrent_pairs_count, collision_events_count, ... }
// degraded fail-open per-source.

const fs = require('fs');
const path = require('path');

// `evidence_conflict_prevented` 중 **claim fence**가 막은 것들의 `conflict_kind`.
//
// 이전 판본은 별도 kind `work_claim_denied`를 셌는데 그것을 emit하는 producer가
// 없었다 — 바로 아래 §5 주석이 제거를 설명하는 `conflict`/`collision`과 정확히
// 같은 dead read다. 실제 producer(`receipt/evidence-lock.js`)는 claim 거부를
// `evidence_conflict_prevented` + `conflict_kind=<fence reason>`로 낸다. 그래서
// 별도 kind를 기다리는 대신 그 discriminator에서 파생한다. 나머지 prevented
// (`base-hash-changed` 등)는 lock 축이라 여기 들어가지 않는다.
const CLAIM_FENCE_KINDS = new Set([
  'other-live-holder',
  'resurrected-holder',
  'claim-denied',
]);

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
    // multi-session-work-loop M8 — A1 분모의 계약 위반 시정 (DD3).
    //
    // `measurement-design.md` §A1(FROZEN)은 분모를 "착수 이벤트가 기록된 **작업
    // 단위** 전수"로 고정했는데 이 소스는 `session_start`를 가진 **세션 수**를
    // 세고 있었다. 세션과 작업 단위는 1:1이 아니다 — PRD가 없애려는 문제 자체가
    // "한 작업이 여러 세션에 걸친다"이므로, 세션을 세면 한 작업이 세 세션에
    // 걸릴 때 분모가 3이 되어 완주율이 1/3로 눌린다. 계약 변경이 아니라 코드가
    // 계약을 어기고 있던 것의 시정이다.
    //
    // 새 키 체계를 만들지 않는다: `work_unit`은 M3 evidence-claim이 이미 쓰는
    // decision slug와 **같은 키**다.
    startups_producer_present: false,
    // DD5 — 봉인은 됐는데 완주 기록이 없는 작업 단위 수. 분자가 아니라 **커버리지
    // 축**이다. DD4가 완주 emit을 산문에 맡겼고 그 산문은 불이행될 수 있으므로,
    // 그 간극을 침묵시키지 않고 수치로 낸다.
    sealed_without_completion: 0,
    sessions: [],
    concurrent_pairs_count: 0,
    collision_events_count: 0,
    // multi-session-work-loop M3 — 증거 충돌 taxonomy.
    //
    // `collision_producer_present`는 **충돌 건수와 독립**이다. M2가 요구한
    // "INDEPENDENT collision-producer-presence signal"이 정확히 이것 —
    // `evidence_guard_active`는 guard가 감싼 write **마다** emit되므로 충돌이
    // 0건이어도 producer 배선을 증명한다. 충돌 관측에서 파생하면 정당한
    // computed-zero(배선된 producer가 N쌍에서 0충돌을 관측)가 도달 불가해진다.
    collision_producer_present: false,
    guard_active_count: 0,
    overwrite_observed_count: 0,      // B2 분자 — 방어를 뚫고 덮인 실사고
    conflict_prevented_count: 0,      // 병기만 (예방은 사고가 아니다)
    claim_denied_count: 0,            // 병기만 — prevented의 claim-fence 부분집합
    coverage_gate_ok: false,          // b2-coverage-gate 아티팩트 verdict
    inversion_detected: false,
    producer_coverage: 'session-activity',
    degraded: false,
    invalid_count: 0,
    error: null,
  };

  try {
    // 1. Read msw-events sidecars (.claude/state/msw-events/<session_id>.jsonl)
    //
    // CL-5 back-compat — 이벤트 위치가 M3 이전에는 writer의 cwd 상대였고 지금은
    // repoRoot 고정이다. 그래서 구 위치에 남은 이벤트도 읽되 **중복 계상은
    // 금지**다. 두 후보 디렉토리를 canonical realpath로 정규화해 같은 곳이면
    // 한 번만 스캔하고, 다르면 둘 다 스캔하되 dedupe한다.
    //
    // dedupe 키는 `event_id`(M3부터 append 시점에 부여)다. 본문 전체로 dedupe하면
    // 필드가 우연히 같은 **별개 이벤트가 붕괴**한다(Implement-Codex R1 F6).
    // event_id가 없는 구 이벤트는 **위치 간 교차**에서만 보수적 복합키로
    // 판정하고(같은 위치 안에서는 절대 dedupe하지 않는다) 이 한계를 명시한다.
    const canonical = (p) => {
      try { return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p); }
      catch (_e) { return path.resolve(p); }
    };
    const primaryDir = path.join(repoRoot, '.claude', 'state', 'msw-events');

    // The legacy (cwd-relative) location is back-compat ONLY when the cwd is
    // inside this repoRoot. If the process happens to run from a DIFFERENT repo
    // or worktree, that directory belongs to someone else and scanning it is
    // precisely the cross-contamination CL-5 exists to prevent — it would inflate
    // B2's denominator and the guard-coverage signal with a stranger's events.
    // (Caught by msw-events-path.test.js: a temp-repo scan pulled in 127 events
    // from the real worktree.)
    const cwdAbs = path.resolve(process.cwd());
    const rootAbs = path.resolve(repoRoot);
    const cwdInsideRepo = cwdAbs === rootAbs || cwdAbs.startsWith(rootAbs + path.sep);
    const candidates = cwdInsideRepo
      ? [primaryDir, path.join(cwdAbs, '.claude', 'state', 'msw-events')]
      : [primaryDir];

    const scanDirs = [];
    const seenDirs = new Set();
    for (const d of candidates) {
      if (!fs.existsSync(d)) continue;
      const key = canonical(d);
      if (seenDirs.has(key)) continue;
      seenDirs.add(key);
      scanDirs.push(d);
    }

    const sessions = {};
    // M8 (DD3 · DD5) — A1의 세 축은 전부 **distinct work_unit** 집합이다.
    // 세션 축(`sessions`)과 나란히 두되 서로 섞지 않는다: 아래 B2 동시성은
    // 세션을, A1은 작업 단위를 센다.
    const startedWorkUnits = new Set();
    const completedWorkUnits = new Set();
    const sealedWorkUnits = new Set();
    const seenEventIds = new Set();
    const seenLegacyKeys = new Set();
    const legacyKeyOf = (e) => [e.session_id, e.kind, e.ts, e.ended_at || '', e.created_at || ''].join('\u0000');

    for (let di = 0; di < scanDirs.length; di++) {
      const mswEventsDir = scanDirs[di];
      const isCrossLocation = di > 0;   // 첫 디렉토리는 전부 수용
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
              if (evt && evt.event_id) {
                if (seenEventIds.has(evt.event_id)) continue;
                seenEventIds.add(evt.event_id);
              } else if (isCrossLocation) {
                const k = legacyKeyOf(evt || {});
                if (seenLegacyKeys.has(k)) continue;
                seenLegacyKeys.add(k);
              } else if (evt) {
                seenLegacyKeys.add(legacyKeyOf(evt));
              }
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
              //
              // M8: 계수 단위가 **이벤트**에서 **distinct work_unit**으로 바뀐다.
              // producer-present는 여전히 이벤트 관측에서 파생한다 — work_unit이
              // 없는 이벤트도 producer가 살아 있다는 사실은 증명하므로, 둘을
              // 같은 조건에 묶으면 배선 신호가 attribution 결함에 가려진다.
              if (evt.kind === 'task_completed') {
                result.completions_producer_present = true;
                if (evt.work_unit) completedWorkUnits.add(String(evt.work_unit));
              }

              // M8 — A1 분모(DD3). 착수는 `receipt-prompt` hook이 `/mccp:*` 최초
              // 발화 시점에 emit한다. 같은 작업 단위의 재발화는 Set이 접는다.
              if (evt.kind === 'task_started') {
                result.startups_producer_present = true;
                if (evt.work_unit) startedWorkUnits.add(String(evt.work_unit));
              }

              // M8 — DD5 병기 축. 분자가 **아니다**: 봉인 뒤 `gh pr create`가
              // 실패하면 완주가 아니기 때문이다.
              if (evt.kind === 'task_ship_sealed') {
                if (evt.work_unit) sealedWorkUnits.add(String(evt.work_unit));
              }

              // M3 증거 충돌 taxonomy. guard_active는 충돌 유무와 무관하게
              // guarded write마다 emit되므로 producer-present의 **독립** 신호다.
              if (evt.kind === 'evidence_guard_active') {
                result.guard_active_count++;
                result.collision_producer_present = true;
              } else if (evt.kind === 'evidence_overwrite_observed') {
                result.overwrite_observed_count++;
              } else if (evt.kind === 'evidence_conflict_prevented') {
                result.conflict_prevented_count++;
                if (CLAIM_FENCE_KINDS.has(evt.conflict_kind)) result.claim_denied_count++;
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

    // 2. A1의 분모·분자는 **작업 단위** 기준이다 (M8 · DD3).
    //
    // 이전 판본은 `session_start`를 가진 세션 수를 세었다. 그것은
    // `measurement-design.md` §A1(FROZEN)이 정의한 값이 아니다 — 그 문서는
    // 분모를 "착수 이벤트가 기록된 작업 단위 전수"로 이미 고정해 두었다.
    // 세션 축은 사라지지 않는다: 아래 B2 동시성 계산은 여전히 `sessions`와
    // `spanOf`를 쓴다. 바뀐 것은 A1이 무엇을 세는가뿐이다.
    result.task_startups_count = startedWorkUnits.size;
    result.task_completions_count = completedWorkUnits.size;

    // DD5 — 봉인됐으나 완주 기록이 없는 작업 단위. 산문 의존(DD4)이 남긴 간극의
    // 크기이며, 0이 아니라고 해서 결함이라는 뜻은 아니다(봉인 후 PR 생성이 실제로
    // 실패했을 수도 있다). 주장하는 것은 "누락이 0"이 아니라 "침묵하는 누락이
    // 없다"이다.
    let sealedWithout = 0;
    for (const wu of sealedWorkUnits) {
      if (!completedWorkUnits.has(wu)) sealedWithout++;
    }
    result.sealed_without_completion = sealedWithout;

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

    // 5. B2 분자 = `evidence_overwrite_observed`(실사고)뿐이다.
    //
    // 이전 구현은 `kind === 'conflict' || 'collision'`을 읽었는데 그 kind를 쓰는
    // producer가 없어 **dead read**였다(back-compat 부담 0 — reader만 교체).
    // `prevented`는 분자에 넣지 않는다: 계상하면 방어가 잘 될수록 지표가
    // 나빠지는 역인센티브가 생긴다. 병기만 한다.
    result.collision_events_count = result.overwrite_observed_count;

    // 6. coverage gate verdict — B2 flip의 전제. derive는 read-only에 시점이
    // 하나뿐이라 사전/사후 관측 창을 스스로 만들 수 없으므로, 하니스가 남긴
    // gate 아티팩트의 판정을 소비한다. 아티팩트가 없으면 gate 미통과로 본다
    // (fail-closed — 관측하지 않은 것을 통과로 읽지 않는다).
    try {
      const gate = require('../../lib/msw-metrics/b2-coverage-gate').readGateArtifact(repoRoot);
      result.coverage_gate_ok = !!(gate && gate.ok === true);
    } catch (_e) {
      result.coverage_gate_ok = false;
    }

    // 7. Check for timestamp inversions (착수 시각 > 종료 시각)
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
