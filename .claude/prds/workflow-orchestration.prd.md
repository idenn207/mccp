# Multi-Agent Workflow Orchestration (plan fan-out 우선)

## Problem
mccp 운영자가 여러 worktree/세션을 dogfooding하며 plan/implement 파이프라인을 돌릴 때, 파이프라인이 단일 subagent(자체 `Agent`-primitive orchestrator) 방식이라 두 가지 근본 문제가 발생한다. (1) 오케스트레이션이 context 한계로 **auto hand-off를 수동 hand-off로 강등**시키고, (2) plan이 다관점 조사 없이 **단일 세션으로 만들어져 meta 정보가 부족** → 구현 착수 시 가설이 붕괴(PRD 중간 수정), 더 나은/일반적 해결책을 못 찾고 쉬운 해결책만 골라 근본 문제를 유발하며, milestone 변경이 빈번하다. 방치하면 매 cycle마다 plan 재작업·milestone 재설계 비용이 반복된다.

## Evidence
- 🟢 **[1차]** 운영자 관찰 — 오케스트레이션이 context 문제로 **수동 hand-off를 요구**(자동화 목표 미달). *(E2 — 본 PRD 핵심)*
- 🟢 **[1차]** 운영자 관찰 — plan meta 정보 부족으로 ① 구현 시 가설 붕괴(PRD 중간 수정), ② 쉬운 해결책 선택으로 근본 문제, ③ **milestone 변경 빈번**. *(E3 — 본 PRD 핵심)*
- 🟢 **[1차]** mccp가 이미 `dispatch-controller.js` + single-worker dispatch(v1.20.2 M1)를 손수 구축 = 병목을 느껴 부분 대응한 관찰된 행동.
- 🟢 **[1차]** 이번 `/deep-research` 실행 1건이 **102 agent / 6.1M 토큰 / ~13분** 소비 = multi-agent 비용 실재의 1차 증거 → 가드레일이 1급 요건.
- 🟡 **[일화]** 커뮤니티: 단일→5-agent 토큰 **3×**, "1 blip → 27 LLM calls", "$47K/11일" 극단 사례. 방향 참고용, 수치는 anecdotal.
- ⚪ **[scope 밖]** 운영자 관찰 — 멀티 worktree 세션 동시 운용 시 진행/완료/문제 상태 추적 불가. auto hand-off를 추구한 근본 동기지만 Workflow primitive가 직접 해결 못 함 → **dashboard 별도 축으로 분리**. *(E1)*

## Users
- **Primary**: mccp 운영자(skypark207) 단독 — 이 플러그인의 유일한 개발자이자 dogfooding 사용자. 매 cycle plan/implement를 돌리며 context 팽창·plan 품질 저하·수동 hand-off를 직접 감당.
- **Not for**: 외부 배포 사용자층(아직 없음), 멀티 팀 협업 시나리오.

## Hypothesis
We believe **plan 단계의 다관점 read-only 병렬 fan-out(Workflow primitive)** will **plan의 meta 정보 부족으로 인한 구현-가설 붕괴·milestone 변동을 해결** for **mccp 운영자**.
We'll know we're right when **구현 착수 후 PRD/plan 중간 수정·milestone 변경 빈도가 유의하게 감소**한다.

## Success Metrics
<!-- 단일 사용자 dogfood라 엄밀한 A/B baseline은 약함. target "감소"는 관찰 기반이며, 정량 baseline 자체가 Open Question. -->

| Metric | Target | How measured |
|---|---|---|
| plan당 구현 중 PRD/plan 중간 수정 횟수 | baseline 대비 감소 | cycle별 dogfood 관찰 기록 |
| milestone 변경 빈도 | 감소 | PRD Delivery Milestones 테이블 변경 이력 |
| plan fan-out 비용 | `budget.total` 상한 내 | Workflow `budget.spent()` |
| dual-review 무손상 | 100% | receipt chain 검증(기존 게이트) |

## Scope
**MVP** — 옵션 1: **plan 단계 read-only 병렬 fan-out**. architect/security/test/code-explorer(또는 유사 다관점)를 Workflow `agent()`로 병렬 spawn → synthesize → 기존 Codex dual-review·receipt chain은 **그대로**. read-only라 파일 race 무위험, `budget` 상한, kill switch로 인라인 fallback 보존.

**Out of scope**
- implement 병렬화(옵션 2) — 후속 milestone(dispatch-controller를 Workflow primitive로 리팩터 + verify를 pipeline 스테이지화)으로 이연.
- 전면 Workflow 오케스트레이터(옵션 3) — irreversible state(commit/PR)를 workflow가 소유하는 위험, 비권장.
- commit/PR을 workflow가 소유 — v1.20.2 격리 invariant(commit/PR은 controller/메인 전용) 유지.
- **E1 멀티세션/worktree observability 통합 뷰** — dashboard 별도 축으로 분리(Workflow primitive는 직접 해결 못 함).

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | plan fan-out (MVP) | plan이 다관점 병렬 조사로 meta 정보 강화 → 구현 가설 붕괴·milestone 변동 감소. budget 상한 + kill switch, dual-review 무손상 | in-progress | `.claude/plans/workflow-orchestration-m1-plan-fanout.plan.md` |
| 2 | implement 병렬화 | dispatch-controller를 Workflow primitive로 리팩터, N-worker 병렬 구현, worktree 격리 표준화. commit/PR 격리 invariant 유지 | pending | — |
| 3 | verify 네이티브화 | Codex adversarial review를 workflow 네이티브 adversarial-verify 패턴으로, verify를 pipeline 스테이지로 강제 | pending | — |

## Open Questions
- [ ] **게이트 합성 방식(척추 질문)** — dual-review를 (a) worker-내부 / (b) workflow-외곽 / (c) pipeline-스테이지 중 무엇으로? MVP는 (b) workflow-외곽(기존 게이트 무손상)으로 시작하지만 M2에서 본격 결정. receipt chain 앵커링 재설계 범위를 좌우.
- [ ] **receipt attribution** — workflow subagent가 fresh context인데, 현 3-플래그 controller-session anchor를 workflow 반환값 기반으로 어떻게 이전하나?
- [ ] **자체 IPC 운명** — dispatch-controller/envelope(v1.2.0-m1 substrate)를 Workflow primitive로 교체 vs 병존?
- [ ] **비용 정책** — Workflow `budget`을 cost-tier($50/$80/$100)와 어떻게 매핑? 게이트별 상한?
- [ ] **병렬 파일 쓰기 안전(M2)** — 공식 문서 침묵 영역. `isolation:'worktree'` + envelope merge invariant로 충분한가, 추가 락 필요한가?
- [ ] **결정론/재개** — 마크다운 slash-command body → JS workflow 스크립트 이전 시, 기존 STATE.md handoff/resume와 `resumeFromRunId` 캐시 replay를 어떻게 통합?
- [ ] **metric baseline** — 단일 사용자 dogfood에서 "중간 수정·milestone 변경 감소"를 어떻게 정량 관찰? (성공 판정의 신뢰도 근거)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 비용 폭증(fan-out 토큰 3×) | 높음 | 높음 | `budget.total` 하드 상한 + cost-tier 연동, kill switch |
| dual-review 게이트 합성 실패(receipt chain 앵커링 붕괴) | 중간 | 높음 | MVP는 read-only + workflow-외곽 게이트로 무손상 시작, M2에서 점진 재설계 |
| plan fan-out이 meta 품질을 실제로 안 높임(가설 반증) | 중간 | 중간 | MVP 저비용 검증, 관찰 기반 metric으로 조기 판단 |
| 병렬 파일 쓰기 race(M2) | 중간(M1은 read-only라 없음) | 높음 | `isolation:'worktree'` 강제 + envelope merge invariant |
| 단일 사용자라 정량 baseline 약함 | 높음 | 낮음 | 관찰 로그 + assumption 마커로 정직하게 표시 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-07-05.*
*근거 문서: `docs/research/multi-agent-orchestration-metasearch.md` (`/deep-research` 산출물 + `Workflow` tool 1차 스펙 + mccp 현행 진단).*
