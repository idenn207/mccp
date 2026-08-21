# Workflow Orchestration — Live Activation & Verification

## Problem
아카이브된 `workflow-orchestration` PRD의 4개 milestone(plan fan-out / N-worker 병렬 implement / verify 네이티브화 / 병렬 활성화)이 전부 `complete`로 마킹됐지만, `complete`의 근거는 unit-test + 합성 scratch-repo 실측 + M4 worktree topology probe뿐이다 — **실제 LLM-runtime에서 fan-out·병렬 implement·aggregate verify가 발화하는 것을 단 한 번도 관찰하지 못했다.** 게다가 이 기능들은 명시적 opt-in(`MCCP_PLAN_FANOUT=on`, `MCCP_WORK_IMPLEMENT_PARALLEL=1`) + cost-state green을 요구하고, cost-state 부재 시 `COST_STATE_UNKNOWN`으로 fail-closed skip된다. 즉 평소 dogfood 환경(cost-current.json 부재)에서는 **발화 자체가 구조적으로 불가능**하다. 결과적으로 4 cycle에 걸쳐 만들어 놓고도 실사용에서 한 번도 쓰이지 않는 "shelf-ware"가 됐고, 다음에 실제로 쓰려는 순간 발화 실패를 디버깅하게 될 위험이 방치돼 있다.

## Evidence
- 🟢 **[1차 실측]** 이 세션에서 `cost-current.json` 부재 확인 → `resolveFanout`/`resolveFleet`이 `COST_STATE_UNKNOWN`으로 fail-closed skip (실측: `resolveFleet(...)` → `{run:false, reason:'env-off'}`, cost-state 없으면 그 이전에 `COST_STATE_UNKNOWN`). 현 환경에서 fan-out/병렬이 구조적으로 발화 불가.
- 🟢 **[1차 실측]** 관련 unit test 전부 통과(implement-dispatch 118 + dispatch-cli/envelope/merged-verify 111). codex-invoke worktree tmp 하드코딩 버그는 이미 `git rev-parse --git-dir/--git-path`로 fix됨 — 코드 자체는 견고.
- 🟢 **[1차]** 아카이브 PRD + memory 명시: "dogfood LLM-runtime Workflow/Task 호출 leg은 미실행(고비용·재귀)". M1/M2a/M2b는 unit-test + 합성 실측만, M4만 worktree topology probe. **실제 병렬 implement가 LLM으로 발화한 관찰 기록 0.**
- 🟢 **[1차]** 운영자 철학(2026-07-14): cost gate의 원래 목적은 context 팽창→환각 최소화이지 비용 절감이 아니다. 병렬/fan-out은 worker별 fresh context 격리로 오히려 환각을 줄인다 → 비용 gate로 병렬을 막는 것은 **설계 목적에 역행**. 품질·속도가 압도적이면 비용은 "폭탄 수준"이 아닌 한 무시 가능.
- 🟡 **[일화]** 커뮤니티: 단일→5-agent 토큰 3×, "$47K/11일" 극단 사례. catastrophic-runaway guard(폭탄 방지 최후 안전판)의 근거로만 참고, 수치는 anecdotal.

## Users
- **Primary**: mccp 운영자(skypark207) 단독 — 이 플러그인의 유일 개발자이자 dogfooding 사용자. 매 cycle plan/implement를 돌리며 지금은 병렬/fan-out이 발화조차 안 되는 채로 단일 세션 오케스트레이션을 감당.
- **Not for**: 외부 배포 사용자층(아직 없음), 멀티 팀 협업 시나리오.

## Hypothesis
We believe **병렬/fan-out을 default 발화로 반전하고(단일은 opt-out 옵션), 비용 gate를 catastrophic-runaway 방지만 남긴 최소 안전판으로 재설계하고, 실제 live 완주로 검증하는 것**이 **"만들어 놓고 안 쓰이는 shelf-ware" 문제와 실동작 미확인을 해결**할 것이다 for **mccp 운영자**.
We'll know we're right when **실제 `/mccp:work` cycle에서 fan-out·병렬·verify가 default로 발화하고 dual-review·receipt chain 무손상으로 완주하며, 단일 vs 병렬/fan-out을 복수 cycle 비교했을 때 구현 중 PRD/plan 중간 수정·milestone 변경 빈도가 감소**한다.

## Success Metrics
<!-- 단일 사용자 dogfood라 엄밀한 A/B baseline은 약함. "감소"는 관찰 기반이며 정량 baseline 자체가 Open Question. -->

| Metric | Target | How measured |
|---|---|---|
| live 완주 성공 | fan-out·병렬·verify가 실제 `/mccp:work` cycle에서 발화 + dual-review·receipt chain 무손상 완주 (≥1 cycle) | dogfood 관찰 + receipt chain 검증 |
| default 발화율 | cost-state 부재 dogfood 환경에서도 opt-out 없이 발화 | 발화 판정 로그(`resolveFanout`/`resolveFleet` reason) |
| 중간 수정 / milestone 변경 빈도 | 단일 대비 병렬·fan-out에서 감소 | 복수 cycle 비교 관찰 기록 |
| 비용 폭주 방지 | catastrophic-runaway hard cap 이내 (폭탄 미발생) | Workflow `budget.spent()` / agent count |
| dual-review 무손상 | 100% | receipt chain 검증(기존 게이트) |

## Scope
**MVP** — (1) **발화 조건 반전**: `MCCP_PLAN_FANOUT`/`MCCP_WORK_IMPLEMENT_PARALLEL`를 default 발화로, 단일은 명시적 opt-out. cost-state fail-closed skip을 fail-open(green 가정)으로 반전하되 catastrophic-runaway hard cap을 최후 안전판으로 유지. (2) **발화 blocker 제거**: `mccp:fanout-*` agent 설치 캐시 포함, worktree seed/envelope 흐름이 실제 설치 환경에서 끊김 없이 동작. (3) **저비용 검증 harness**: 실제 LLM 발화 전 배선(seed→mark→collect→reconcile)을 관측하는 검증 경로. (4) **live 완주 검증**: 실제 `/mccp:work` cycle을 단일 vs 병렬/fan-out으로 복수 회 완주 관찰.

**Out of scope**
- 전면 Workflow 오케스트레이터(옵션 3) — irreversible state(commit/PR)를 workflow가 소유하는 위험, 비권장. commit/PR은 controller/메인 전용 격리 invariant 유지.
- E1 멀티세션/worktree observability 통합 뷰 — dashboard 별도 축(Workflow primitive가 직접 해결 못 함).
- 비용 절감/정밀 예산 최적화 — 운영자 판단상 품질·속도 우선, 비용은 catastrophic-runaway 방지 외 out of scope.
- 새 병렬화 대상 확장(예: code-review 병렬화) — 기존 4 milestone 검증·활성화에 집중.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 발화 조건 반전 + 검증 harness | 병렬/fan-out이 default 발화(단일은 opt-out)로, cost-state 부재에서도 발화. catastrophic-runaway hard cap만 안전판으로 유지. `mccp:fanout-*` agent·worktree seed·envelope 흐름이 실제 설치 환경에서 끊김 없이 동작. 저비용 배선 검증 harness 확보 | complete | `.claude/plans/workflow-orchestration-live-activation-m1.plan.md` |
| 2 | live 완주 검증 (복수 cycle) | 실제 `/mccp:work` cycle을 단일 vs 병렬/fan-out on/off로 복수 회 완주. fan-out·병렬·verify가 실제 LLM으로 발화하고 dual-review·receipt chain 무손상 확인. 중간수정·milestone 변경·품질 관찰 기록 | complete | `.claude/plans/workflow-orchestration-live-activation-m2.plan.md` |
| 3 | 발견 gap 보완 | milestone 1·2 검증에서 드러난 버그·부족분(발화 실패 지점, 배선 끊김, agent 미해결, 관찰된 회귀) 수정 | complete | `.claude/plans/workflow-orchestration-live-activation-m3.plan.md` |

## Open Questions
- [x] **catastrophic-runaway 임계 정의** — "폭탄 수준"을 무엇으로 mechanical하게 판정? agent count 절대 상한 / 누적 token / wall-clock 중 무엇을 hard cap으로? (운영자는 폭탄만 아니면 비용 무시 → 임계는 매우 높게)
  - **결정 (M3, v1.22.3)**: 단일 축이 아니라 **다층**이다. (1) **원자 agent-count 절대 상한** — `MCCP_ORCHESTRATION_MAX_AGENTS`(default 24) 세션 누적, `reserveWorkers`가 단일 lock 임계구역에서 check-and-bump(read-then-bump TOCTOU 봉인), 전 run 경로 적용. (2) **catastrophic-USD 상한** — `MCCP_ORCHESTRATION_CATASTROPHIC_USD`(default $500), operational $100과 **분리된** 훨씬 높은 임계. (3) **per-worker token budget** — `MCCP_WORK_PARALLEL_BUDGET`가 per-agent 토큰을 bound. **operational USD tier($50/$80/$100 + hard_ceiling)는 firing gate가 아니다** — 실측 sticky $186.92가 전 축을 잠갔고, 그게 M2 live row가 비어 있던 원인이었다. wall-clock은 채택 안 함(근거 없는 임계 날조 회피 — 필요 시 후속 축).
- [x] **default 반전 ↔ 기존 cost 축 상호작용** — cost-model-subscription M3 decay·`MCCP_SUBSCRIPTION`(context overflow 축)·tier autoDisable와 default 발화가 어떻게 공존? 반전이 이들을 무력화/중복하지 않는가?
  - **결정 (M3, v1.22.3)**: firing·auto-chain의 USD 축은 **catastrophic-USD / 원자 runaway-cap / subscription-overflow**만 남기고 operational tier는 은퇴. 무력화·중복 없음 — `AUTODISABLE_TIERS_DEFAULT`는 각 budget 모듈 **로컬**이라 briefing/breakpoint/handoff의 USD 축은 **독립·불변**(소비처 격리). `MCCP_SUBSCRIPTION` context-overflow branch도 불변. cost-state **시간축 decay**(v1.22.0)와는 **중복이 아니라 보완**: decay는 6h 시간 기반 완화라 활성 세션에서 지출이 다시 ceiling을 넘으면 sticky 차단이 재발하지만, M3은 구조적으로 제거한다. telemetry-integrity(missing/unreadable/stale)는 지출액과 직교하므로 auto-chain에서 **보수적 유지**.
- [ ] **복수 cycle 비교의 baseline 신뢰도** — 단일 사용자 dogfood에서 "중간수정·milestone 변경 감소"를 어떻게 편향 없이 관찰? 같은 작업을 on/off로 반복하면 학습 효과 오염.
- [ ] **live 검증의 재귀/비용** — 실제 `/mccp:work`를 이 세션(또는 dogfood)에서 돌리면 재귀·고비용. 검증 cycle의 scope를 어떻게 작게 잡아 안전하게 완주?
- [ ] **결정론/재개** — 기존 open question 잔존: markdown slash-command body ↔ JS workflow 스크립트 이전 시 STATE.md handoff/resume와 `resumeFromRunId` 캐시 replay 통합.
- [x] **opt-out 계약** — default 반전 후 단일(순차) 경로를 어떤 신호로 opt-out? 기존 kill switch(`MCCP_WORK_ISOLATE_IMPLEMENT=0` 등)와 semantics 정합.
  - **결정 (M1 Codex F1 + M3 확정)**: 발화 opt-out은 **`MCCP_WORK_IMPLEMENT_PARALLEL=off|0` / `MCCP_PLAN_FANOUT=off|0` 단일 축**(`MCCP_WORK_IMPLEMENT_WORKFLOW` default는 미변경 — 병렬 opt-out이 낯선 Workflow single leg로 새지 않음). **USD 차단 복원은 별개 축** `MCCP_ORCHESTRATION_USD_BOMB=1`(M3) — 발화 자체를 끄는 것과 "옛 USD 정책으로 되돌리는 것"은 서로 다른 의도이므로 분리한다. 표준 vocabulary `1|true|yes|on`, unknown non-empty → off + loud warn(rollback path 오타 은폐 금지).

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 비용 폭주(fan-out/병렬 토큰 3×+) | 높음 | 중간 | 운영자 수용(품질 우선). catastrophic-runaway hard cap만 최후 안전판. 폭탄 미발생이 metric |
| default 반전이 기존 fail-closed 안전 계약 파괴 → 예상 밖 회귀 | 중간 | 높음 | opt-out 경로·kill switch 보존, 반전은 gate 값만 변경(구조 유지), 단계적(M1) + live 검증(M2)으로 확인 |
| dual-review 게이트 무손상 실패(receipt chain 앵커링 붕괴) | 중간 | 높음 | read-only fan-out + workflow-외곽 게이트 유지(기존 invariant), M2에서 receipt chain 실측 검증 |
| live 검증이 재귀/고비용으로 완주 실패 | 중간 | 중간 | 검증 cycle scope 최소화(작은 task), M1 저비용 배선 harness로 사전 위험 제거 |
| 단일 사용자라 복수 cycle baseline 약함 | 높음 | 낮음 | 관찰 로그 + assumption 마커로 정직하게 표시 |
| 병렬 파일 쓰기 race(활성화 시) | 중간 | 높음 | `isolation:'worktree'` 강제 + envelope merge invariant + M4가 이미 live 입증한 worktree-merge 경로 재사용 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-07-14.*
*근거: 아카이브 `workflow-orchestration.prd.md` + `docs/research/multi-agent-orchestration-metasearch.md` + 이 세션 실측(cost-state fail-closed skip, unit-test green, worktree tmp fix 확인) + 운영자 cost-철학 재해석.*
