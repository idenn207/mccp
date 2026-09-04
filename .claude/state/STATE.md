---
state_version: 1
task_fingerprint: ci-full-suite-m1
created_at: 2026-06-03T18:51:31.328Z
updated_at: 2026-09-03T07:23:36.949Z
last_event: stop_loop_pass
last_event_at: 2026-09-03T07:23:36.949Z
unsafe_checkpoint: false
confirm_required: false
session_end_imminent: true
chain_aborted: false
last_pr_url: https://github.com/idenn207/mccp/pull/71
dep_check_at: 2026-09-02T08:40:00.651Z
escalate_pending: true
escalate_pending_decision_id: ci-full-suite
---
## Goal
ci-full-suite (우산 PRD harness-wiring-integrity 자식 C3) M2 — suite-green. 구현·로컬 측정 완료, commit/PR 대기.

## Plan
- PRD: `.claude/prds/ci-full-suite.prd.md` — MVP는 축 A 하나(측정 가능)
- plan: `.claude/plans/ci-full-suite-m1.plan.md` — 봉인됨 `sha256:dab39c61…`. **편집하면 receipt가 stale이 된다**
- receipt: `.claude/receipts/mccp-plan-codex/ci-full-suite-m1.json` (verdict=divergent, single-pass 봉인)
- 리뷰 기록: `.claude/reviews/plan-review-ci-full-suite-m1.md` (직전 slug `ci-full-suite` 기록도 별도 보존)
- branch ci-full-suite · plugin.json version bump 없음 (우산 결정 1: `.github/`는 배포 표면 밖)

## Done
- M1 Acceptance 6/6 충족. 컨테이너 5원소(local · ci-node20/24 · 각 r2) 전부 ok:true · attribution:complete · redaction_ok:true
- 핵심 발견 — 전수 시간은 스위트가 아니라 플랫폼의 성질. 같은 Node v24.19.0에서 Windows 순차 합계가 Linux의 64.8배(코어는 Windows가 4배 많은데도). Linux 전수 75.5초 대 Windows 31.4분
- OQ1 해결(조용한 머신 = GitHub runner) · OQ4 해결(Node 20 하한 유지 무비용, data.file 귀속 6363/6363 완전) · OQ5 해결. PRD milestone 1 → complete
- red가 플랫폼마다 다름 — Windows 전용 6 · Linux 전용 7 · 교집합 2. M3의 CI matrix 필요 여부에 직접 근거
- run 간 편차 실측 — node20 벽시계 +27.1%. 그래서 node20-faster 주장을 철회했고 병렬 하한을 구간(17.5~27.2초)으로 기록
- plan 154줄 복구(직전 세션 섹션 치환 사고) · Task 0 재수행(PR CONFLICTING이면 pull_request run이 생성조차 안 됨)

## In Progress


## Next Step
/mccp:prp-commit → /mccp:pr. PR CI에서 Linux 3회 측정을 받아 컨테이너에 병합하고 m2-green.md §5c를 갱신한다.

## Last Decision
갈래 H의 귀속을 정정했다 — run.js 오염이 아니라 test가 gitDir를 격리하지 않은 것이고, 계획이 지시한 MCCP_ROUND_LEDGER 주입은 세 리뷰 관점이 반증해 폐기했다. 격리 경계는 env가 아니라 gitDir다.

## Open Questions
- Linux 3회 미측정 — 갈래 F·R 4건과 갈래 P 2건(mask · santa-loop-cap DD3)의 최종 판정이 거기 달려 있다
- post-edit-format-md.test.js는 flaky 확정이나 귀속 불가 — reporter가 파일 단위 실패의 내부 단언을 싣지 않는다(backlog 등재)
- 선행 mccp-plan-codex receipt가 구조적 stale — 2.5.4의 의무 주입이 plan_hash를 바꾸고 재봉인은 §3.12가 금지한다(backlog 등재)
- 계획 Acceptance 2번(3원소 failing 집합 동일) 로컬 미충족 — 반올림하지 않고 기록

## Last Updated
2026-09-03T07:23:36.949Z
