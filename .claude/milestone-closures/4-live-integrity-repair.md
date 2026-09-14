# Milestone Closure — 4-live-integrity-repair

## Milestone
- ID         : 4-live-integrity-repair
- Name       : live-integrity-repair
- Plan       : .claude/plans/orchestrator-step-wiring-m4.plan.md
- Status     : done
- Closed at  : 2026-09-14T08:32:23.958Z
- Closed by  : /mccp:milestone-close (run_id=bfdfef45-d4c1-4265-baca-10bb749cd13c)

## Acceptance Condition

M4 report가 존재하고 Validation 1 in-scope 회귀가 0 fail이며 report Acceptance 8항목이 전부 [x]이다. 또는 20 turn 후 종료

## Goal Loop Result

goal-done: M4 report 실재 · Acceptance 8/8 [x] · Validation 1 최종 트리 198 pass 0 fail

검증 세 축 (assistant, 이번 세션에서 직접 관측):

1. report 실재 — `.claude/PRPs/reports/orchestrator-step-wiring-m4-report.md` (13572 bytes).
2. Acceptance 8/8 — `report:125-133`에 `[x]` 8건, `[ ]` 0건.
3. Validation 1 — 최종 트리(working tree == `f155fff`, 무관한 dirty 1건 제외)에서 8파일 전체를
   `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2`로 실행: **198 pass / 0 fail**.
   report가 기록한 197은 리뷰 흡수 **전** 값이고, 흡수 때 추가된 Task 3g test 1건만큼 늘었다.
   흡수 후 report가 재실행한 것은 8개 중 4개였으므로, 나머지 4개(`msw-metrics-b2` ·
   `msw-metrics-acceptance` · `msw-events-path` · `work-command-body`)가 최종 코드에서
   통과함을 확인한 것은 이 실행이다.

## Protocol deviation

**lock exit을 판정 응답 **전**에 앞당겼다** (명령 본문 Phase 4의 1단계를 Phase 3 앞으로).

사유: `goal-phase-guard.js`의 Bash allowlist(`:76-87`)에 `node --test`가 없어, lock이 걸린
동안에는 acceptance의 Validation 축을 **검증할 수단이 없다**. `/goal` Stop hook은 그 결과가
transcript에 없다는 이유로 종료를 막았고, 대기만 하면 turn 예산만 소모된다. lock exit은 guard가
명시적으로 허용하는 lifecycle 명령이고(`:81`), done·failed·skipped 세 판정이 모두 Phase 4에서
어차피 거치는 단계다. 따라서 순서를 바꿔도 어느 판정 경로도 달라지지 않으며, 잃는 것은 아무
작업도 일어나지 않는 대기 구간의 격리뿐이다.

우회하지 **않은** 것: guard tokenizer의 단일 `|` 빈틈(아래 관측 1)을 이용하면 lock을 건 채로
테스트를 돌릴 수 있었으나, 격리 장치를 우회하는 행위이므로 쓰지 않았다.

lock 수명: enter `2026-09-14T06:37:24Z` → heartbeat `06:41:17Z` → exit `06:43:47Z`
(`cleared: true`, 잔여 lock 파일 없음).

## 이 사이클이 관측한 명령·guard 결함 3건

backlog 등재 대상이며 M4 코드 축과는 무관하다.

1. **`goal-phase-guard.js:109-135` — tokenizer가 단일 `|`를 세그먼트로 나누지 않는다.**
   `splitSegments`는 `;` · `&&` · `||`만 분리하므로, 첫 세그먼트가 allowlist에 걸리면 파이프
   뒤는 검사되지 않는다. 실측: `classifyBashCommand("echo x | tee .claude/receipts/a.json")`
   → `allow`. deny 패턴은 `>`/`>>` 리다이렉트만 보고 `tee`를 보지 않으므로, 격리 중에도
   receipt 디렉토리에 쓰는 경로가 열려 있다.
2. **`commands/milestone-close.md` Phase 4 — 마스킹 호출이 틀렸다.**
   본문의 `applySecretMask(x).text`에서 `applySecretMask`는 문자열이 아니라 derive **model
   객체**를 받고(`derive/mask.js`), 문자열을 주면 그대로 돌려준다. 게다가 반환값에 `.text`가
   없어 결과는 `undefined`다. 본문대로 실행하면 closure의 Goal Loop Result에 `undefined`가
   박히거나, 그것을 피하려고 원문을 넣으면 S5 흡수가 막으려던 마스킹이 조용히 빠진다.
   올바른 API는 `maskSecrets(text).masked`이며, 이 문서는 그것으로 마스킹했다(hits 0).
3. **설계 공백 — lock 안에서는 acceptance를 검증할 수 없다.** 위 Protocol deviation의 사유.
   allowlist가 읽기 전용 명령만 허용하므로, "테스트가 통과하는가"류 condition은 구조적으로
   lock 밖에서만 확인된다.

## Provenance
- Lock run_id        : bfdfef45-d4c1-4265-baca-10bb749cd13c
- Lock owner session : fb84bab4-b5d4-4a3f-b802-2024d0b56d49
- Plan source        : .claude/plans/orchestrator-step-wiring-m4.plan.md
- Detection signal   : {"row":4,"name":"live-integrity-repair","plan":".claude/plans/orchestrator-step-wiring-m4.plan.md","status":"in-progress"}
- mccp version       : 1.33.6 (실행 중인 설치 cache). worktree `plugin.json`은 `1.34.4`이나
  브랜치는 version을 선언하지 않는다(CLAUDE.md §3.7 우산 결정 1).
- Ship 상태          : 이 closure 시점에 `f155fff`는 미푸시이고 PR은 없다. M3는 PR #189 머지
  (2026-09-09T01:46Z) 뒤에 `e7f1855`(2026-09-11T02:12Z)로 닫았으므로, 이번 close는 그 선례보다
  **앞선다**. 사용자 결정으로 진행했다. 후속 `/mccp:pr`에서 PR-Codex가 반드시 발화한다
  (plan·implement receipt 둘 다 `codex_verdict=divergent`라 cross-gate dedupe가 닫혀 있다).
