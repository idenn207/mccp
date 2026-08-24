---
state_version: 1
task_fingerprint: impeccable-detection-contract-m5
created_at: 2026-06-03T18:51:31.328Z
updated_at: 2026-08-23T10:33:25.618Z
last_event: stop_loop_pass
last_event_at: 2026-08-23T10:33:25.618Z
unsafe_checkpoint: false
confirm_required: false
session_end_imminent: true
chain_aborted: false
last_pr_url: https://github.com/idenn207/mccp/pull/71
dep_check_at: 2026-08-23T09:38:09.736Z
dep_check_missing: impeccable
escalate_pending: true
escalate_pending_decision_id: impeccable-detection-contract-m5
---
## Goal
impeccable-detection-contract M5 — 문서·계약 드리프트 정리. 구현 완료(v1.32.0), commit/PR 대기. PRD 전체 종료.

## Plan
- PRD: `.claude/prds/impeccable-detection-contract.prd.md` — M1·M2·M3·**M4 complete**, M5(문서 드리프트) pending
- plan: `.claude/plans/impeccable-detection-contract-{m1,m2,m3,m4}.plan.md` — 넷 다 봉인됨(plan_hash). **편집 금지**
- 게이트 산출물·라이브 증거: `.claude/notes/impeccable-detection-contract-{m1,m2,m3,m4}.md`
- 구현 보고: `.claude/PRPs/reports/impeccable-detection-contract-m4-report.md`
- version 1.31.4 (patch — PRD 내 단일 milestone). 4면 동기 완료. branch impeccable-detection-contract

## Done
- M1 (3d38358, v1.31.1) 정직한 탐지 / M2 (87c6acb·0433538, v1.31.2) 판정 권한 일원화 / M3 (66aaa19, v1.31.3) 섀도잉 해소
- **M4 (미커밋, v1.31.4) 게이트 발화 정합** — 8 task 전부 착지
- M4/T1 UI10 재확인 실측 — `shape`는 벤더 메타데이터상 **조건 없이** required interview. **정정**: `teach`는 4.1.1의 23개 카탈로그에 없다(차단 프로즈만 부름) — 집합 유지 근거는 미래 카탈로그 확장 방어
- M4/T2 `INTERVIEW_REQUIRED_COMMANDS` 신설 + implement `shape` background→recommend. `background`는 오라클 전체 **도달 불가**가 됐으나 enum 유지(과거 receipt 해석 보존) — test가 전수 128조합에서 고정
- M4/T3 테이블 `phase` 축(pre/finish). implement 16→19(pre 14 + finish 5). `clarify`/`distill` finish 이동 + `polish`/`harden`/`optimize` 신설. `onboard`은 "없던 표면을 새로 짓는" 성질이라 제외. plan/prd/pr 출력 바이트 동일
- M4/T4 `restampRoutedCommands` + `cli.js restamp-routed` — append-only(중복=drift 신호) ∧ **restamp 내 멱등**(tail match, 락 **안**). 게이트 `mccp-implement-codex` 한정, 여분 키 거부, 경로 resolve
- M4/T5 prp-implement 재배선 — 2.5.5b `phase:"pre"` 명시 · Phase 3.6 전면 교체(오라클 구동 → 처리 → restamp) · 낡은 문단 정정. **duplicate-call 불변식이 산문에서 phase 필터로 이동**
- M4/T6 test — routing +11(전수 128조합) · restamp-routed 14 신규 · guard 짝 단언 4(`phase:"finish"` ⟺ `restamp-routed`)
- M4/T7 gate-design `#### 게이트 발화 정합` · CLAUDE.md §3.10(낡은 stage→command 나열 제거) · CHANGELOG 1.31.4 · 4면 동기 · PRD milestone 4 complete · backlog 5건 이연
- M4/T8 라이브 — finish 오라클 5종 `invoke` → `impeccable:impeccable`로 전부 완주(어느 것도 멎지 않음) → restamp 착지. receipt에 finish 5건, `shape` non-recommend 0건, 재생 시 `noop:true`
- 검증: V1 37/37 · V2 14/14 · V3 16/16 · V4 81/81 · **V5 682(681 pass·0 fail)** · V6 10/10 · V7 C1~C4 pass · V8 매트릭스 일치
- 리뷰 산출: Codex R1 divergent(HIGH 2건 전건 흡수) · security-reviewer 4건 흡수 + 2건 PASS 독립 확인(F3 HIGH→MEDIUM 증거 정정) · backlog 5건 이연

## In Progress


## Next Step
/mccp:prp-commit → /mccp:pr. PR 진입 직전 §3.7 version 재계산 필수(origin/main 1.31.0, 로컬 1.32.0 minor=PRD 종료).

## Last Decision
Codex R1 HIGH(래칫 로더 fail-closed 미명시)와 plan L2 CRITICAL이 같은 축이라 R1에서 전건 흡수 — evidence-debt.js 로드 시점 throw + lint try/catch 2겹. MEDIUM 2건은 §3.14대로 backlog 이연. §3.16대로 1라운드로 끝내고 divergent를 정직하게 봉인.

## Open Questions
- EVIDENCE_DEBT 29건(plan 예상 28)은 각 축의 부채 — 경계 일치가 MCCP_PLAN_REVIEW_(scan-artifact)를 C로 분류한 차이
- L10 역방향은 walkSurfaces 범위 부재만 증명 — env-contract/ 디렉토리 전체 제외(backlog)
- 설치 plugin cache가 1.31.0(pre-M1) — 머지 후 claude plugin update 필요
- sibling worktree env-contract-integrity가 같은 subsystem PRD 보유(1.30.0, 문서 전용) — 충돌 없음

## Last Updated
2026-08-23T10:33:25.618Z
