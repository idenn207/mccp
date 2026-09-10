# Implement-Codex review — orchestrator-step-wiring M3 (rev2)

이 파일이 `## Codex Implementation Review`의 착지면이다. plan 본문이 아닌 이유는
`/mccp:prp-implement` 2.5.4가 명시한 대체 표면이기 때문이고, 이번 사이클에서 그것이
**필수**인 이유는 다음과 같다.

`mccp-plan-codex/orchestrator-step-wiring-m3-rev2.json`이 `plan_hash`
`sha256:6818cd91…`을 봉인했다. `validate-cmd.js:377-387`은 `/mccp:pr` 시점에 plan을
다시 해시해 **엄격 일치**를 요구하고, `aliases.js:41-45`대로 `/mccp:pr`은 plan-codex와
implement-codex **둘 다**를 선행 게이트로 요구한다. 따라서 plan 본문에 섹션을 주입하면
plan-codex가 `stale`이 되고, 이 저장소가 opt-in한 `MCCP_RECEIPT_GATE_MODE=soft`는
**missing만** 통과시키고 stale은 차단한다 — 그 사이클의 PR이 스스로 막힌다.

선행 사이클들이 plan 본문에 주입하고도 무사했던 것은 패널 모드가 plan receipt를 아예
쓰지 않아 `/mccp:pr`이 그것을 *missing*으로 봤기 때문이다. 이번 사이클은 §3.15 단일통과로
그 receipt를 실제로 썼으므로 같은 경로가 열려 있지 않다.

---

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- classification: `ok` · blocking `0` · exit `0` · `--impeccable-available` 전달됨
- 라운드 수: 1 (cap=1, `mccp-implement-codex__orchestrator-step-wiring-m3-rev2` 원장 봉인)
- structured verdict: `needs-attention` → `resolution.codex_verdict = divergent`
- 합치 결론: "Do not ship from this plan unchanged: Task 5 leaves session contamination
  possible, Task 6 targets a nonexistent column, and Task 9 can erase the current
  escalation. Task 1 already specifies conditional emission; an unconditional token
  would violate it."
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 가드를 엔트리 생성이 아니라 세션 누적 블록 전체에 걸어라 | HIGH | ACCEPT_NOW | `:212` push와 `:215-222` session_end 갱신이 생성 밖이라, 앞선 A1 이벤트가 만든 엔트리에 외래 span이 들어온다. 생성만 막는 것은 부족하다 |
  | F2 — Task 6이 존재하지 않는 필드를 지목한다 | MEDIUM | ACCEPT_NOW | 이미 착지면을 `docs/environment/orchestration.md`로 정한 편차와 **동일**. Codex가 독립 확인했고 권고도 같다 |
  | F3 — Task 9의 stale-M1 clear가 지금은 **살아 있는** M3 escalation을 지운다 | HIGH | ACCEPT_NOW | 이 사이클의 plan receipt(divergent)가 `escalate_pending`을 M3-rev2로 재점화했다. 무조건 clear는 미해소 알람을 M1 머지를 근거로 지우는 것이 된다 |

- Deferred to backlog: 0 (전건 ACCEPT_NOW)
- Open Questions: 없음 — R1에서 전건 흡수 가능하므로 escalate 조건 (a)∧(b) 미충족, R1에서 정지
- Codex session 참조: `<gitdir>/mccp/tmp/codex-stdout.json`

### F1 흡수 — 가드 범위

`derive/sources/session-activity.js`의 세션 누적 블록(`:196-223`) **전체**를
`!A1_AXIS_KINDS.has(evt.kind) && dirIsShared`로 감싼다. 엔트리 생성만 막으면
`:212`(`events.push`)와 `:215-222`(`session_end` 갱신 · `context_remaining_pct` 수집)가
그대로 돌아 이미 생성된 엔트리에 외래 이벤트가 실린다. **독립 계수기
(`:232-256`의 `task_started`/`task_completed`/`task_ship_sealed`)는 그 뒤에 그대로 둔다** —
A1 축은 공유 위치에서 읽혀야 하고, 그것이 M1이 세운 경계다.

술어에 `dirIsShared`를 **반드시 포함**한다. DD3 요약의 kind-단독 표현을 문자 그대로 쓰면
로컬 `session_start`/`session_end`도 막혀 `spanOf`가 span을 못 만들고
`concurrent_pairs_count`(B2 분모)와 `context_remaining_pct`(A2)가 통째로 사라진다.

### F1 흡수 — 단언 확장

plan의 기존 3단언은 두 설계를 구별하지 못한다(패널 architect/test HIGH + Codex F1 일치).
다음을 추가한다:

1. **로컬 겹침 세션이 B2에 기여한다** — 로컬 `session_start`+`session_end` 쌍 둘을 겹치게
   심으면 `concurrent_pairs_count`가 증가한다. kind-단독 오구현에서 red.
2. **로컬 `session_end`의 `context_remaining_pct`가 A2에 도달한다.** 같은 축의 두 번째 방향.
3. **이미 생성된 엔트리에 공유 비-A1 이벤트가 실리지 않는다** — 공유 A1 이벤트가 먼저
   엔트리를 만든 뒤 공유 `session_start`가 오는 순서. 생성-only 가드에서 red.

### F3 흡수 — clear를 조건부로

Task 9의 clear는 `escalate_pending`의 **decision이 M1일 때만** 수행한다. 이 사이클의
plan receipt가 divergent라 `write.js:1213-1234`가 escalation을 M3-rev2로 재점화했고,
무조건 clear는 그 살아 있는 알람을 지운다. `state-writer.update()` 경유(§3.2)는 유지하되
읽기-판정-쓰기를 같은 update lock 안에서 수행한다. clear가 성립하지 않으면 **하지 않고**
그 사실을 report에 기록한다 — 지우지 못한 것이 정직한 결과다.

Acceptance의 "두 소비 표면에서 침묵" 항목은 이 조건 때문에 **이번 사이클에 충족되지
않을 수 있다**. 그 경우도 report에 그대로 적는다(패널 architect/invariant가 그 항목을
반증 불가라 지목했고, `fix-task.md`가 방금 생겨 전제가 뒤집힌 것도 함께 기록한다).

### Security Reviewer

security-sensitive 카테고리(auth · crypto · secrets · input validation · SQL/cmd
injection · SSRF · path traversal · privilege escalation) 어디에도 해당하지 않아
호출하지 않았다 — 이 변경은 지표 집계 reader와 STATE.md 플래그다. 신뢰 경계 축
(공유 corpus vs 로컬)은 plan 게이트의 `mccp:review-security` 패널이 이미 심사해
`verdict=pass`를 냈고(경로 주입·traversal·유출 축 전부 반증 실패), 그 기록은
`.claude/reviews/plan-review-orchestrator-step-wiring-m3-rev2.md`에 있다.
따라서 auto-fallback이 아니므로 `security_skipped`를 stamp하지 않는다.

---

## Codex Implementation Review — 재진입 (2026-09-08)

앞선 R1 기록은 그대로 둔다. 이 절은 **같은 decision에 대한 두 번째 게이트 진입**이
무엇을 했는지만 적는다.

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review`
- classification: `round-cap-reached` · blocking `0` · exit `0` · `durationMs=0` · spawn 없음
- 원장: `roundsSoFar=1 cap=1` (key `mccp-implement-codex__orchestrator-step-wiring-m3-rev2`,
  2.5.0이 봉인)
- **Codex not invoked: round cap reached for this decision.** 예산 소진은 가용성 장애가
  아니라 terminal outcome이므로 `unavailable`이 아니라 `divergent`로 기록한다(§3.3 ·
  명령 본문 DD4). cross-gate dedupe는 그 값에서 닫힌 채로 남는다.
- 라운드 수: 1 (증가 없음 — 이 진입은 라운드를 열지 않았다)
- 합치 결론: 위 R1의 결론이 여전히 유효하다. F1·F2·F3는 전건 흡수됐고 새 findings는 없다
  (리뷰어가 발화하지 않았으므로 **없다고 확인된 것이 아니라 묻지 않은 것**이다).
- Open Questions: `DIVERGENT_UNRESOLVED` — 예산 소진으로 재리뷰 불가. §3.16대로 이연하고
  진행하며 verdict를 위조하지 않는다.
- Codex session 참조: 없음(spawn 0회)

### 이 재진입이 주장하지 않는 것

R1 흡수 이후의 구현 델타가 리뷰를 받았다는 것. 받지 않았다. 그 델타의 심사는 이
사이클에서 `/mccp:santa-loop` escalation(`fix-task-applied.md`가 지시)과 terminal
`/mccp:pr`의 PR-Codex가 나눠 맡는다 — dedupe가 `divergent`에서 닫히므로 후자는 반드시
발화한다.

### Security Reviewer

R1의 판정을 유지한다 — 이 변경은 지표 집계 reader와 STATE.md 플래그이고
security-sensitive 카테고리 어디에도 해당하지 않는다. auto-fallback이 아니므로
`security_skipped`를 stamp하지 않는다.
