# PR #114 — Codex R3 cross-model findings (NO-SHIP, verified)

**Date**: 2026-07-26
**Gate**: `mccp-pr-codex` / decision `multi-session-work-loop-m2`
**Codex verdict**: `needs-attention` — **NO-SHIP** (2 HIGH + 1 MEDIUM)
**Run**: `codex-invoke.js adversarial-review --base main` · 623s (완주) · classification `ok`, blocking false
**Thread**: `019f9a96-2f12-7c72-a0d2-cd6ec88336b4`

## 왜 이 문서가 존재하나 (record correction)

기존 `.claude/reviews/pr-114-review.md`(same-model self-review, APPROVE)는 receipt의 `divergent`를
"미해결 코드 결함이 아니라 R3 재검증의 환경상 미완주"로 서술했다. **이 결론은 falsified다.**
R3 cross-model 리뷰가 이번에 **완주**(623s, 이전 세션의 ~10분 harness cap이 잘랐던 지점)하니,
same-model 리뷰가 놓친 **실제 measurement-honesty 결함 3건**을 발견했다. receipt의 `divergent`
seal은 이제 환경이 아니라 **실체가 뒷받침**한다 → seal 유지가 맞고, converged 재봉인은 없다.

세 결함은 한 테마다: **metric이 status `computed`라 주장하는데 값이 구조적으로 틀릴/자기신용/교차귀속될 수 있음.**

## Findings (전부 실제 코드로 재현 검증 — 액면 수용 아님)

### F1 — HIGH (conf 0.91) · B2가 live conflict producer 없이 0-collision을 "computed"로 보고
- **파일**: `plugins/mccp/scripts/derive/sources/session-activity.js:141-145`
- **검증**: production `appendEvent` 호출부는 정확히 2곳 — `session-start.js:710`(`session_start`) ·
  `session-end.js:360`(`session_end`). `kind:'conflict'|'collision'` 방출은 **production 0 / test 2**.
  → `collision_events_count`는 구조적으로 항상 0 → `computeB2`(msw-metrics/index.js:244-251)가
  `value = collisions/concurrentPairs = 0/N`을 `status:'computed'`로 표기. B2가 잡아야 할 회귀를 은폐.
- **Codex 권고**: hook-trace/file-overlap 상관으로 실 numerator 구현 **또는** 실 producer 생길 때까지 forward-only/insufficient.

### F2 — HIGH (conf 0.87) · A4가 현재 세션 자기 handoff를 restored로 self-credit
- **파일**: `plugins/mccp/scripts/derive/sources/handoff-items.js:43-67`
- **검증**: 스캐너가 `.claude/state/*.handoff-items.json`을 **현재-세션 제외/timestamp 필터 없이 전부** 읽음.
  `session-end.js:374-375`가 종료 시 현재 세션 sidecar를 기록 → `leftKeys`(분모)에도 `currentKeys`에도
  자기 항목이 들어가 `restored = leftKeys∩currentKeys`가 자기 카운트 → first-session이 세션 경계 없이 100% restore.
- **Codex 권고**: boundary-based로 — 현재 세션 sidecar 제외, 또는 prior sidecar/session id 키의 명시 SessionStart restore 이벤트 카운트.

### F3 — MEDIUM (conf 0.82) · A2가 stale/타 세션 context%를 종료 세션에 귀속
- **파일**: `plugins/mccp/scripts/hooks/session-end.js:354-365`
- **검증**: `contextState.readState()`를 session id·freshness 인자 없이 호출해 latest-wins
  `context-current.json` 값을 그대로 종료 세션의 `context_remaining_pct`로 기록. concurrent 세션 /
  이전 세션 stale telemetry가 유효 A2 샘플로 수용됨. `computeA2`(msw-metrics/index.js:170)는 이를 `computed`로 표기.
- **Codex 권고**: context 스냅샷에 session id+timestamp 태깅, SessionEnd가 현재 sid+fresh 매칭 요구, 아니면 context-unknown/insufficient.

## 채택 방향 — 정직 다운그레이드 (운영자 결정 2026-07-26)

B2/A4/A2를 `computed`에서 `forward-only`로 강등 (A1/C1이 이미 쓰는 패턴 —
`completions_producer_present` 부재 시 forward-only, msw-metrics/index.js:119-130 미러).
live producer/세션 스코프가 부적합한 지점만 정직 표기. MSW M2의 "claimed-computable=live source만" 원칙 준수.
실 producer 구현(F1 hook-trace 상관 / F2 boundary / F3 session-tag)은 후속 milestone 이연.

구현 표면: source scanner presence 플래그(default false, fixture가 true 주입) + compute forward-only 분기 +
`metrics-assert` claimedComputable 목록에서 B2/A4/A2 제거 + fixture + test + renderer forward-only 확인.
게이트: `/mccp:plan → /mccp:prp-implement` (ad hoc 편집 아님).

## Codex next_steps (원문)
- Block release until B2 has a real numerator producer or is downgraded from computed status.
- Add regression tests for A4 first-session self-credit and A2 stale/cross-session context attribution.
