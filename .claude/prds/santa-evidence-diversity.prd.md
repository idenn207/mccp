# santa 증거 다양성 — 블라인드 레인 · 스코프 · degrade 차단 (P2)

> 우산: [review-loop-trust.prd.md](review-loop-trust.prd.md) — 승계 불변식 **I1 · I5**
> 선행: [P0 santa-loop 실체화](santa-loop-materialize.prd.md) (모듈 인터페이스 확정 필요)
> 원 제보: [#125](https://github.com/idenn207/mccp/issues/125)

## Problem

santa-loop이 선언한 `"different models, no shared context"`는 **대화 격리만 보장하고 증거 격리는 보장하지 않는다.** Reviewer A 계열은 오케스트레이터가 미리 만들어 넘긴 파일 번들을 그대로 소비하므로, **그 번들 밖에 있는 사실은 몇 인스턴스를 띄우든 몇 라운드를 돌든 구조적으로 발견 불가능**하다.

세 겹으로 겹친다.

1. **증거 출처 단일화** — 리뷰어 컨텍스트가 전부 오케스트레이터 한 곳에서 나온다. 컨텍스트 격리는 됐지만 오류 상관은 안 끊긴다.
2. **스코프 = diff** — 검증해야 할 불변식(계획⟷PRD 정합)은 두 문서의 *관계*인데, PRD 갱신이 diff에 안 잡히면 리뷰 대상에서 사라진다.
3. **degrade가 무성(無聲)** — Reviewer B 부재 시 동일모델 2인 앙상블이 되는데, 그 조합의 NICE와 이종 조합의 NICE가 게이트에서 구분되지 않는다.

방치 비용: 리뷰어를 늘리고 라운드를 늘려도 못 잡는 결함군이 영구히 남고, degrade가 조용히 통과해 dual-review가 이름만 남는다.

## Evidence

- **실측**(#125) — `/mccp:plan` 계획을 동일모델 **4인스턴스 × 12라운드**로 검증했으나 아무도 못 찾은 결함(워킹트리 PRD가 회부 5건·마일스톤 7개로 확장됐는데 계획은 4/4와 M5·M6를 강제 — 실행하면 신규 회부를 지우거나 자기 단언에 실패)을 Reviewer B가 **첫 라운드**에 포착.
- **승리 원인은 모델이 아님**(#125) — Reviewer B만 `codex exec --sandbox read-only -C "$(pwd)"`로 저장소 전체를 자기 루프로 재탐색했다. A 계열은 오케스트레이터 스냅샷만 봤고, 갱신된 PRD는 diff 밖이라 그 스냅샷에 없었다.
- **코드 근거**(v1.23.7) — [santa-loop.md](../../plugins/mccp/commands/santa-loop.md): L9 "no shared context" 선언 · L53 오케스트레이터가 changed files를 읽어 컨텍스트 선구축 · L91 Reviewer A에 "all files under review" 주입 · L142 Reviewer B만 `-C "$(pwd)"` · L153 fallback이 경고 로그만 남기고 NICE 허용. [santa-method/SKILL.md](../../plugins/mccp/skills/santa-method/SKILL.md) L11의 "no shared context breaks this failure mode" 주장은 증거 출처가 단일이면 성립하지 않는다.
- **문헌 — 리샘플링은 입력에 없는 정보를 못 만든다**: [Correlated Errors ICML 2025](https://arxiv.org/pdf/2506.07962)(두 모델이 동시에 틀릴 때 60% 일치) · [Are Diversity Metrics Measuring Diversity?](https://arxiv.org/html/2607.20768v1)(동일모델 N인스턴스는 중복도만 증가) · [Multi-Agent Code Verification](https://arxiv.org/html/2511.16708)(한계 정보이득 +14.9/+13.5/+11.2%p 후 평탄) · [Codified Context](https://arxiv.org/html/2602.20478v1)("명세 staleness가 주된 실패 모드 — 외부 상태를 프롬프트에 캐싱하지 말고 매번 저장소에서 on-demand 재독").
- **모델 다양성의 잔여 가치** — same-model persona 상관 ≈ 0.4 vs cross-model ≈ 0.08([arXiv:2507.11198](https://arxiv.org/abs/2507.11198)). degrade를 무성으로 두면 안 되는 정량 근거.

## Users

- **Primary**: santa-loop으로 plan·PRD를 검증하는 mccp 운영자 — 리뷰어 전원이 PASS를 냈는데 실행 단계에서 정합 위반이 드러날 때.
- **Not for**: 코드 diff만 보는 순수 구현 리뷰 — 이 축의 가치는 *문서 간 관계* 같은 diff 밖 불변식에서 가장 크다.

## Hypothesis

We believe **리뷰어 최소 1명에게 컨텍스트 번들 대신 포인터만 주어 디스크에서 직접 재유도하게 하고, plan·PRD 계열을 diff와 무관하게 상시 스코프에 넣으며, Reviewer B 부재 시 NICE를 금지하는 것**이 **오류 상관을 끊고 diff 밖 불변식 위반을 포착하는 데** 유효하다 — for **mccp 운영자**.
We'll know we're right when **#125가 보고한 계획⟷PRD 정합 위반 유형이 라운드 1에 포착되고, Reviewer B 부재 실행이 자동 통과하지 못할 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] 블라인드 레인 발동** | 매 실행에서 리뷰어 ≥1명이 번들 미수령으로 기록됨 | receipt `evidence_paths` stamp |
| diff 밖 포착 | #125 회귀 시나리오(계획⟷PRD 불일치)가 라운드 1에 NAUGHTY | 재현 fixture 회귀 test |
| degrade 가시화 | Reviewer B 부재 실행의 verdict가 `degraded`로 구분됨 (NICE 아님) | fallback 경로 test |
| **I5 준수** | 리뷰어 수 증가 0 — 다양성은 증거 경로로만 | 변경 diff 검토 |
| 오류 상관 대리지표 | 두 레인이 동시에 놓친 항목 비율 (baseline 측정) | 원장 교차 집계 (P1 원장 소비) |

## Scope

**MVP** — (1) **블라인드 레인**: Reviewer A 인스턴스 중 1명이 파일 번들·사전 요약을 받지 않고 저장소 루트 + 대상 경로 포인터만 받아 "주어진 서술을 사실로 취급하지 말 것" 지시와 함께 재유도. (2) **상시 스코프**: changed-files 수집에 diff 무관하게 `.claude/PRPs/**` · `.claude/prds/**` · `*plan*.md` · `*PRD*.md` 추가 + rubric 고정 1행(계획의 항목 수·마일스톤 범위·회부 건수가 **현재 워킹트리** PRD와 일치하는가 — 불일치 시 즉시 NAUGHTY). (3) **degrade 차단**: Reviewer B 부재 fallback의 NICE를 `degraded` 판정으로 강등.

**Out of scope**

- **리뷰어 수 증설** — I5. N=4가 knee. 이 PRD는 리뷰어를 **늘리지 않고** 기존 인스턴스의 입력 경로만 분기한다.
- **리뷰어 프롬프트 완화** — I1.
- **Codex 제거 또는 다른 외부 모델 도입** — cross-model의 blind-spot 가치는 존속(상관 0.08 vs 0.4). Gemini 등은 이 머신 미설치.
- **severity·원장·종료 조건** — P1 소유. 단 "오류 상관 대리지표"는 P1 원장을 **소비**한다(생산 아님).
- **델타 스코프** — P3 소유. 본 PRD의 상시 스코프(항상 포함)와 P3의 델타(라운드마다 축소)는 **경계가 겹치므로** Open Question에 조정 항목을 둔다.
- **`gpt-5.4` 하드코딩 갱신**(#125·#124 부수) — 모델명·effort 플래그 정정. 1줄 변경이라 P0 또는 별도 hot-fix가 적합.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 블라인드 레인 | 리뷰어 1명이 오케스트레이터 서술을 사실로 받지 않고 디스크에서 재유도한다. codex가 우연히 하던 일이 계약이 됨 | pending | — |
| 2 | 상시 스코프 + 정합 rubric | plan·PRD 계열이 diff 여부와 무관하게 검토 대상이 되고, 워킹트리 PRD와의 불일치가 즉시 NAUGHTY | pending | — |
| 3 | degrade 차단 | 동일모델 앙상블의 NICE가 이종 조합의 NICE와 구분되어 사람 승인을 요구함 | pending | — |

## Open Questions

- [ ] **블라인드 레인이 몇 명인가** — #125는 "최소 1명". 전원 블라인드는 오케스트레이터가 스코프를 정하는 의미를 없애고 비용·시간을 키운다. 1명 고정 vs 비율 지정.
- [ ] **P3 델타와의 경계** — 본 PRD는 "plan·PRD를 항상 넣어라", P3는 "라운드마다 스코프를 줄여라". 상시 포함 대상이 델타 축소에서 **면제**되는지 결정 필요. 권장: 상시 스코프는 델타 면제(관계 불변식은 매 라운드 재확인 대상).
- [ ] **`degraded` 판정의 하류 취급** — santa receipt는 게이트를 통과시키지 않으므로(I4) `degraded`가 무엇을 막는지 정의 필요. 보고서 표기 + 사람 승인 요구가 기본선.
- [ ] **블라인드 레인의 토큰 비용** — 저장소 재탐색은 번들 소비보다 비싸다. 실측 후 스코프 힌트 수준을 조정.
- [ ] **상시 스코프가 무관한 PRD까지 끌어오는가** — `.claude/prds/**` 전체는 넓다. 현재 decision 관련분으로 좁힐지, 전체를 넣고 rubric이 걸러내게 할지.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 블라인드 레인이 스코프를 못 찾아 헛돈다 | Medium | Medium | 포인터에 저장소 루트 + **대상 파일 경로**는 준다(번들·요약만 금지). #125 실측에서 codex는 이 조건으로 성공했다 |
| 상시 스코프가 커져 리뷰 품질이 떨어진다 (400 LOC 임계) | Medium | High | plan·PRD는 문서라 LOC 부담이 코드보다 작다. 그래도 P3 델타와 조정해 **상시 대상은 관계 검증에만** 쓰이도록 rubric으로 좁힌다 |
| `degraded` 강등이 codex 미가용 환경에서 상시 발동해 운영을 막는다 | Medium | High | `degraded`는 차단이 아니라 **구분**이다 — 사람 승인 경로를 남긴다. `MCCP_CODEX_DISABLED=1` 같은 의도적 비활성과 미가용을 분리(기존 receipt 계층의 `skipped` vs `unavailable` 선례를 따름) |
| 블라인드 레인이 "번들을 안 받았다"고 주장만 하고 실제로는 동일 결론 | Medium | Medium | 증거 경로를 receipt에 stamp하고, 두 레인이 동시에 놓친 항목 비율을 지표로 추적(P1 원장 소비). 주장이 아니라 결과 분포로 검증 |
| P1과 동시 진행 중 원장 스키마 가정이 어긋난다 | Medium | Medium | 본 PRD는 원장을 **소비만** 한다(생산 없음). 지표 5번은 P1 종료 후 산출로 미뤄도 MVP가 성립 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-12.*
