---
state_version: 1
task_fingerprint: impeccable-detection-contract-m2
created_at: 2026-06-03T18:51:31.328Z
updated_at: 2026-08-22T16:35:00.481Z
last_event: stop_loop_pass
last_event_at: 2026-08-22T16:35:00.481Z
unsafe_checkpoint: false
confirm_required: false
session_end_imminent: true
chain_aborted: false
last_pr_url: https://github.com/idenn207/mccp/pull/71
dep_check_at: 2026-08-22T16:34:57.858Z
dep_check_missing: impeccable
escalate_pending: true
escalate_pending_decision_id: impeccable-detection-contract-m3
---
## Goal
impeccable-detection-contract M3 — 섀도잉 해소. 구현 완료(v1.31.3), commit/PR 대기.

## Plan
- PRD: `.claude/prds/impeccable-detection-contract.prd.md` — M1·M2·**M3 complete**, M4(게이트 발화 정합)·M5(문서 드리프트) pending
- plan: `.claude/plans/impeccable-detection-contract-{m1,m2,m3}.plan.md` — 셋 다 봉인됨(plan_hash). **편집 금지**
- 게이트 산출물·라이브 증거: `.claude/notes/impeccable-detection-contract-{m1,m2,m3}.md`
- 구현 보고: `.claude/PRPs/reports/impeccable-detection-contract-m3-report.md`
- receipt: mccp-plan-codex/{impeccable-detection-contract,-m1,-m2,-m3} · mccp-implement-codex/{-m1,-m2,-m3}
- version 1.31.3 (patch — PRD 내 단일 milestone). 4면 동기 완료. branch impeccable-detection-contract

## Done
- M1 (3d38358, v1.31.1) 정직한 탐지 — resolveImpeccable() 오라클이 설치원을 전부 열거하고 실제로 열릴 본문 하나를 지목
- M2 (87c6acb·0433538, v1.31.2) 판정 권한을 available 하나로 — dep-check·SessionStart 배너·setup Phase 3 배선
- **M3 (미커밋, v1.31.3) 섀도잉 해소** — 아래 9 task 전부 착지
- M3/T1 오라클 `eclipsed` — 승자를 **객체 identity**로 제외(3-way 필드 비교는 중복 행에서 양쪽 다 승자로 판정해 eclipsed를 비운다). shadowed면 빈 배열이고 그것은 "판정 불가"라는 뜻
- M3/T2·T3 dep-check 라벨 `- +N eclipsed` + printer 행(경로는 신규 `safePath`, 라벨은 safeLabel) · SessionStart 정보성 1행(missing 배열과 분리, 같은 24h 시계, 새 probe 0)
- M3/T4 `impeccable-cleanup.js` 신규 — 거부 규칙 6 + 닫힌 REASONS enum. 봉쇄는 **앵커와 대상 사이 조상만** 검사(앵커 자신이 링크인 것은 허용 — 정상 저장소를 막으면서 아무것도 못 얻는다). git rm은 execFileSync + `--`. 성공은 재-resolve로 증명
- M3/T5 setup Phase 3.5 — 3분기. shadowed면 제거 선택지를 아예 안 보인다
- M3/T6·T7 **재배선 + 사본 제거를 같은 커밋으로 대기** — 명령 본문 bare 리터럴 0건, `.claude/skills/impeccable/` 79 파일 git rm. guard test 짝 단언이 반쪽 착지를 붉힌다
- M3/T8 CLAUDE.md §3.17(불변식 3) · gate-design `#### 섀도잉 해소 (M3)` · CHANGELOG 1.31.3 · PRD milestone 3 complete + OQ 1·2 종결 · instruction-contract ledger S3.17
- M3/T9 라이브: env 우회 없이 `detect(design_signal:true) → call-form: Skill(impeccable:impeccable, ...) → 실제 호출` 연결 확인
- 리뷰 산출: Implement-Codex R1 divergent(HIGH 3·MEDIUM 2 전건 흡수) · security-reviewer 10건 처리(HIGH 2 증거 기각) · backlog 4건 이연

## In Progress


## Next Step
`/mccp:prp-commit` — **T6 재배선과 T7 사본 제거는 반드시 같은 커밋**. 이어서 `/mccp:pr`. **PR 진입 직전 §3.7 version 재계산 필수**(두 번째 시점 — 현재 origin/main은 1.31.0).

## Last Decision
Task 5의 제거 선택지 조건을 plan의 `eclipsed.length > 0` 에서 `removable.length > 0` 으로 좁혔다. Task 4의 규칙 1(승자 불가침)과 2(plugin 불가침)가 함께 걸리면 실사용 구성에서 removable이 구조적으로 빈다 — bare가 항상 이기므로 bare 사본은 승자이거나 shadowed이고 남는 eclipsed 행은 plugin뿐이다. plan 문구를 그대로 쓰면 오라클이 반드시 거부할 행동을 권하는 화면이 된다. 규칙은 손대지 않고(각각 안전 근거가 있다) 화면만 정직하게 만들었으며, `rules 1+2 jointly` test가 이 성질을 고정해 나중에 넓히려는 milestone이 조용히 지나갈 수 없게 했다.

## Open Questions
- M3/T9 잔여 — 디자인 축이 발화한 채 봉인된 게이트 receipt는 아직 없다. prp-implement의 디자인 게이트는 EXECUTE 이전에 돌아 그 시점 diff에 신호가 없었다(구조적). 그 receipt는 이 사이클의 /mccp:pr(mode=pr)이 만든다
- 설치된 plugin cache가 1.31.0(pre-M1)이라 이 세션 밖 hook과 ${CLAUDE_PLUGIN_ROOT} 경유 호출은 여전히 옛 술어로 돈다. `claude plugin update` 필요(Bash에서 claude 바이너리 ENOENT — 사용자 직접 실행)
- PRD OQ2 잔여 — 비-bypass 권한 모드에서의 게이트 완주는 이 세션이 측정할 수 없다(프롬프트가 뜰 자리가 없다). ambient allow 목록이 mccp 게이트 전체를 덮지 않는 것은 확인됨
- 이 milestone의 test 중 어느 것도 CI에 등재돼 있지 않다(.github/workflows는 셋만 돌린다). 강제 지점은 사이클의 ## Validation — backlog 이연
- (main 승계 red 54건, HEAD 기준선 대조로 확정) santa-loop-cap 28 · santa-adjudication 22 · review-single-pass-fields 2 · santa-lanes 1 · session-processes-reclaim 1. M3가 만든 red는 0. santa-* 51건은 이전 STATE.md에 기록이 없던 항목
- (cleanup) .worktrees/m3-baseline 디렉토리가 핸들 점유로 삭제되지 않았다. worktree 등록은 prune됨, gitignored라 커밋 무영향. 다음 세션에서 `rm -rf .worktrees/m3-baseline`
- (main 승계) worktree cleanup .worktrees/review-loop-bypass-m2 잔존

## Last Updated
2026-08-22T16:35:00.481Z
