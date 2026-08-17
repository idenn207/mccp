---
state_version: 1
task_fingerprint: session-process-reclaim
created_at: 2026-06-03T18:51:31.328Z
updated_at: 2026-08-17T05:24:13.125Z
last_event: stop_loop_pass
last_event_at: 2026-08-17T05:24:13.125Z
unsafe_checkpoint: false
confirm_required: false
session_end_imminent: true
chain_aborted: false
last_pr_url: https://github.com/idenn207/mccp/pull/71
dep_check_at: 2026-08-14T08:40:43.437Z
---
## Goal
session-process-reclaim M3(출하 + 잔여 정리) 진행 중 — M1+M2 구현은 끝났으나 아직 main에 없다. plugin.json 1.27.0.
santa-loop은 R1~R10을 완주했고 R10은 수렴이 아니라 운영자 종료 결정으로 끝났다 — 승인 도장은 없다.

## Plan
- plan: `.claude/plans/session-process-reclaim-followup.plan.md` (M3) · 선행: `.claude/plans/session-process-reclaim.plan.md` (M1+M2) · PRD: `.claude/prds/session-process-reclaim.prd.md` (M3 행 in-progress)
- 리뷰 기록: `.claude/reviews/plan-review-session-process-reclaim-followup-rounds.md` — L2 패널 R1~R14 전 라운드 divergent(4관점 동시 pass 0회), R14에서 정밀도 붕괴(100→50→23%)로 운영자 종료 · `.claude/reviews/santa-review-session-process-reclaim.md` — santa-loop 산출
- receipt(진단용 — working-tree only · 소실됨이 정상, §3.12): `mccp-plan-codex/session-process-reclaim-followup.json`(intent_gate_verdict=incomplete · intent_gate_force_override=true) · `mccp-implement-codex/session-process-reclaim-followup.json`(codex_verdict=skipped · security_skipped=true). 감사 corpus가 아니므로 worktree 정리를 넘겨 살아남지 않는다
- 이전 decision `session-process-reclaim`의 같은 두 게이트 기록은 이미 사라졌다 — 당시 기록에 따르면 findings 5건 원본 severity 봉인 · codex_verdict=skipped였다고 하나 파일이 없어 대조 불가
- 이 작업의 cross-model 감사 anchor는 아직 없다 — `ANCHOR-PENDING(Task 11)`. 출하 게이트를 완주해 ship receipt가 실제로 생성되면 그때 이 자리에 그 경로를 기입한다
- backlog: `.claude/plans/codex-findings-backlog.md` — 해소 3건 + 신규 이연 10건(Task 9)

## Done
- M1+M2 구현 — `session-processes.js` 레지스트리 + 13행 소유권 판정 + §D15 정체 probe + `reclaimSession` + `scanForeignOrphans`, 호출부 5곳 결선, test 신규 4파일
- PR-Codex R1~R3에서 실결함 3건 수정(kill 반환 오인 · 형제 sweep 순서 · degraded skip 미보고) + 회귀 test 9종
- santa-loop R1~R10 완주 — R10은 운영자 종료 결정. L2 패널 R1~R14는 전 라운드 divergent로 승인 미획득
- M3 Task 1 — origin/main 머지(149 커밋). 충돌 8건 파일 단위 해소, main 파일 소실 0 · 브랜치 삭제 0을 사전 캡처 대조로 기계 확인
- M3 Task 2 — 버전 forward-only 1.27.0(main이 머지 중 1.26.1까지 밀어 §3.7 7번째 재발). 4면 동기 + i18n-surface 10/10
- M3 게이트 — plan-codex는 `MCCP_SKIP_INTENT_GATE` audited override(verdict=incomplete 봉인), implement-codex는 codex_verdict=skipped + security_skipped=true. 게이트 기록은 `.claude/notes/session-process-reclaim-followup-implement-gate.md`(plan 본문 편집 시 plan_hash self-stale 회피)

## In Progress
M3 Task 1~10·12 완료 + security 심사 통과. Task 11(출하) 보류 — V6이 win32 회수 처리량 한계를 실측으로 드러냈고 그것이 제품 결정이다

## Next Step
win32 probe 처리량 방침 확정(설계 수정 vs 문서화 후 이연) → 정해지면 Task 11 출하(게이트는 이미 통과 상태)

## Last Decision
Validation 6이 공허했음을 발견해(node 기본 reporter가 spec이라 `^not ok `가 영구 미매치) TAP로 재측정했고, 가려져 있던 red 2건이 드러났다. 하나(gitignore drift lint 미분류)는 고쳤고 — 그 항목은 살아 있는 PID + 절대 exec_path를 담아 커밋되면 오살 벡터가 된다 — 다른 하나는 win32 probe가 레코드당 3.4s라 세션당 1~2개만 회수된다는 실측으로 이어졌다. 공허한 단언을 통과로 받았다면 둘 다 그대로 출하됐을 것이다.

## Open Questions
- win32 회수 처리량 한계(실측, M3에서 처음 측정): probe가 `powershell.exe`로 `Get-CimInstance Win32_Process`를 **레코드마다 동기 spawn**해 유휴 머신에서도 3.2~3.7s가 걸린다(cap 5000ms). `guardedProbe`(`:1193`)가 `elapsed > budgetMs - probeTimeoutMs`면 probe를 거부하므로 기본값에서 probe 시작 창은 **1000ms**뿐이다. 실측: 자식 3개 등록 시 기본 예산 6000 → 1개 회수·2개 누수(`budget_exceeded`), 문서화된 상한 `MCCP_RECLAIM_BUDGET_MS=9000` → 2개 회수·1개 누수. `MAX_BUDGET_MS=9000`은 SessionEnd hook의 10s timeout 때문이라 그냥 못 올린다. **방향은 fail-closed(오살 아님, 회수 누락)**지만 PRD Hypothesis(고아 누적 차단)가 win32에서 부분적으로만 성립한다는 뜻이다. 지금까지 안 잡힌 이유: 모든 reclaim test가 probe를 mock 주입하고(즉시 반환) Task 12 스모크는 레코드 1개만 썼다. 해소 방향은 설계 변경 — 한 번의 PowerShell 호출로 전체 pid를 조회하거나(N probe → 1), 값싼 소유권 축을 먼저 통과한 레코드에만 probe하는 것. M3 범위 밖
- 전체 suite 신규 실패 1건 미해소: `9d — probeProcess against a REAL process`가 전체 suite 병렬 실행에서 probe cap 초과로 붉다(2회 재현, 단독 실행은 통과). 그 test는 cap 초과를 환경 skip이 아니라 **defect로 판정하도록 설계**됐고 위 실측이 그 판정을 뒷받침한다 — 즉 flake가 아니라 얇은 여유의 표면화다. plan Acceptance의 "신규 실패 0"은 **미충족**
- PR-Codex R3 미해소(HIGH): `dashboard-server.js:643-645`가 reuse 레코드 기록 실패 시 경고만 하고 `reused:true` 반환. 이연 권고 — 파괴 경로가 `MCCP_RECLAIM_OUTLIVES=1` opt-in에 걸려 있고, `announceReuseRegistration`이 복구법까지 경고하며, "재사용 대신 자기 서버 기동"은 `resolveSessionId`가 null일 때 아무도 회수 못 하는 미등록 프로세스를 만든다(중단이 누수로 바뀜). Task 9가 backlog에 열린 채로 등재
- cross-model 심사는 여전히 0회 — Codex는 `MCCP_CODEX_DISABLED=1`로 미발화, security-reviewer는 세션 agent 정책상 미호출. 감사 대조가 가능한 유일한 기록은 Task 11이 만들 ship receipt다
- 주장하지 않는 것: §D11 ms TOCTOU와 §D15 유계 오살 창은 단위 test로 재현 불가 — "무관한 프로세스가 죽는 경로는 없다"고 주장하지 않는다
- POSIX symlink 봉쇄 test 2건이 win32에서 skip — §D4 주장은 플랫폼 무관인데 검증은 아니다(backlog MEDIUM)
- macOS `ps`는 `etimes` 미지원 → probe null → `identity_unverifiable`로 회수 미수행(fail-closed, 오살 아님)
- plan 아카이브 미수행 — 지금 옮기면 receipt의 `--plan` anchor가 끊긴다. ship 이후 `/mccp:archive-complete` 소관(§3.11)
- 선재 red: `b2-coverage-gate` 2건 · `ecc-context-monitor` Axis B (f) · `perf-budget` flake — merge-base 대조로 선재 확정
- escalate_pending 순서 guard는 돌지 못했다 — `dfd18f4`가 `escalate_pending: true`를 담고 있었으나 **이전 세션의 STATE.md write**(2026-08-16T21:51:10Z, `d034ba2`로 커밋)가 R3 backlog 행이 생기기 전에 그것을 지웠다. plan Task 9가 막으려던 손실("열렸으나 수렴 없이 끝난 사실이 사라짐")이 이 plan 범위 밖에서 이미 일어난 것이다. 플래그를 복원했다 다시 지우는 가짜 순서는 만들지 않았고, 실질(R3가 backlog에 열린 채로 실재)은 충족했다 — `plan-conflict-detector` 판정은 `conflict:false`(minor deviation)

## Last Updated
2026-08-17T05:24:13.125Z
