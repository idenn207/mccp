---
state_version: 1
task_fingerprint: impeccable-detection-contract-m2
created_at: 2026-06-03T18:51:31.328Z
updated_at: 2026-08-22T13:57:43.242Z
last_event: stop_loop_pass
last_event_at: 2026-08-22T13:57:43.242Z
unsafe_checkpoint: false
confirm_required: false
session_end_imminent: true
chain_aborted: false
last_pr_url: https://github.com/idenn207/mccp/pull/71
dep_check_at: 2026-08-22T13:57:42.752Z
escalate_pending: true
escalate_pending_decision_id: impeccable-detection-contract-m2
---
## Goal
impeccable-detection-contract M2 — setup·경고 정합. 구현 완료(v1.31.2), escalation 해소 후 commit/PR 대기.

## Plan
- PRD: `.claude/prds/impeccable-detection-contract.prd.md` — M1·M2 complete, M3(섀도잉 해소)·M4(게이트 발화 정합)·M5(문서 드리프트) pending
- plan: `.claude/plans/impeccable-detection-contract-{m1,m2}.plan.md` — 둘 다 봉인됨(plan_hash). **편집 금지**
- 게이트 산출물·라이브 증거: `.claude/notes/impeccable-detection-contract-{m1,m2}.md` (plan 본문 대신 이 자리)
- receipt: mccp-plan-codex/{impeccable-detection-contract,-m1,-m2} · mccp-implement-codex/{-m1,-m2}
- version 1.31.2 (patch — PRD 내 단일 milestone). 4면 동기 완료. branch impeccable-detection-contract

## Done
- M1 (3d38358, v1.31.1) 정직한 탐지 — resolveImpeccable() 오라클이 4개 설치원을 전부 열거하고 실제로 열릴 본문 하나를 지목. detect()는 기존 키 의미를 보존한 엄격한 상위집합(6필드 추가)이라 게이트 분기 무변경
- M1 — 모호하면 답하지 않는다: bare 소스가 둘이면 shadowed:true + source·path·version 전부 null. 이름(invocation)만 남음
- M2 (87c6acb, v1.31.2) 판정 권한을 available 하나로 — checkImpeccable()이 dep-check.js에서 오라클을 지연 require(순환 회피), checkAll()은 기존 4키 보존 상위집합
- M2 — SessionStart 배너 술어를 impeccable_cli.installed → impeccable.available로 교체. CLI probe는 telemetry로 강등(어느 게이트도 읽지 않음)
- M2 — 지연 require를 try/catch로 감싸 fail-closed sentinel 반환(security S2). 렌더 경계에 화이트리스트+길이 상한(S1). `Bash(npx:*)` → `Bash(npx impeccable:*)` 축소(S3)
- M2 — `.impeccable/` 무시 규칙 극성 확정: config.json=commit · design.json=생성물. 근거는 impeccable v4.1.1 자신의 reference/hooks.md(비밀·동의 값은 gitignored config.local.json에 거주)
- M2 — /mccp:setup Phase 3 설치 분기에 재-dep-check + Phase 1 표 갱신(C2). env override 없는 hook-spawn test 추가(C1)
- 문서: CLAUDE.md §3.17 · docs/gate-design.md ## impeccable-detection · CHANGELOG · 4면 version 동기
- 리뷰 산출: Implement-Codex R1 divergent(HIGH 2 흡수 · CRITICAL 1 등 3건 증거 기각) · security-reviewer 8건 전건 처리 · backlog 6건 이연

## In Progress


## Next Step
escalate_pending(impeccable-detection-contract-m2) 해소 — /mccp:santa-loop 통과 후 /mccp:prp-commit → /mccp:pr. **PR 진입 직전 §3.7 version 재계산 필수**(두 번째 시점).

## Last Decision
code-review 3건을 전건 수용했다. dep_check_missing:impeccable은 worktree 코드가 아니라 stale plugin cache v1.31.0(pre-M2 술어 impeccable_cli.installed)이 쓴 거짓 신호였다 — worktree 오라클과 dep-check는 둘 다 available을 보고한다. M2가 없애려던 오탐이 git-tracked 상태 파일에 고정되는 것을 막기 위해, 하드 편집이 아니라 state-writer API로 실제 checkAll() 결과를 다시 썼다. 배너는 사용자가 claude plugin update로 1.31.2를 설치할 때까지 계속 뜬다(cache 목록이 1.31.0에서 끊겨 있음).

## Open Questions
- STATE.md last_pr_url이 pull/71로 오래됐다 — 현재 task에 PR이 없어 값을 지어내지 않고 그대로 뒀다. M2 PR 생성 시 자동 갱신될 것
- 설치된 plugin cache가 1.31.0에 멈춰 있어 이 세션의 hook은 pre-M2 술어로 동작한다. `claude plugin update` 필요(Bash에서 claude 바이너리 ENOENT — 사용자 직접 실행)
- PRD M3(섀도잉 해소)가 이 저장소의 project-local 사본 v3.5.0을 지운다 — §3.17대로 **지우기 전에 bare Skill(impeccable, ...) 호출부 4곳을 재배선**해야 한다
- (main 승계) 선재 red: receipt/tests/review-single-pass-fields.test.js:162 schema↔test 문구 drift
- (main 승계) worktree cleanup .worktrees/review-loop-bypass-m2 잔존

## Last Updated
2026-08-22T13:57:43.242Z
