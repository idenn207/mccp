# 메타 조사 커맨드 (H2)

> 우산: [review-loop-trust.prd.md](../review-loop-trust.prd.md) — day 0 병렬. 리뷰 루프 축과 의존 없음.
> 원 제기: 운영자 항목 1

## Problem

mccp에는 **조사·판정 결과를 산출하는 커맨드가 없다.** `/mccp:*` 21개는 전부 *만들기*(plan-prd → plan → implement → commit → pr)나 *점검*(receipt-status, trace, dashboard) 축이고, "이 문제의 근인이 무엇이고 어떤 선택지가 있는가"를 조사해 남기는 축이 비어 있다.

그런데 그 작업은 **이미 네 번 반복됐다** — `.claude/_meta/`의 문서 5종이 전부 수작업 산출물이다. 매번 (a) 코드 근거 수집 → (b) 문헌 조사 → (c) 선례 대조 → (d) 판정 기록 이라는 같은 절차를 손으로 재구성했고, 절차가 문서화돼 있지 않아 산출물 품질과 형식이 매번 달랐다.

방치 비용: 조사가 재현 불가능하고, 그 결과가 어디 있는지 발견되지 않으며(대시보드 미노출), 시간이 지나 전제가 무효화돼도 아무도 모른다 — 실제로 `diverse-agent-review-analysis.md` §1.3의 4축 경고는 M1 ship으로 무효화됐으나 그 사실이 6일간 문서에 반영되지 않았다.

## Evidence

- `/mccp:*` 커맨드 21개 중 조사·기록 축 **0개**([commands/](../../../plugins/mccp/commands/) 전수).
- `.claude/_meta/` 수작업 산출물 **5종** — `diverse-agent-review-analysis.md`(2026-08-06) · `converged-redefinition-design.md` · `verification-layer-design.md` · `2026-08-12-review-loop-meta-analysis.md` · `2026-08-12-prd-decomposition-addendum.md`. 4회 이상 반복된 패턴.
- **전제 무효화 실측** — `diverse-agent-review-analysis.md` §1.3이 "santa-loop을 gate로 봉인하면 깨지는 4축"을 경고했으나, 그 문서 작성 후 ship된 diverse-agent-review M1이 `CROSS_MODEL_SOURCES`로 4축을 전부 봉인했다. [부록 §2](../../_meta/2026-08-12-prd-decomposition-addendum.md)가 코드를 다시 읽고서야 발견. **메타 문서는 작성 시점 코드를 전제하는데 그 유효기간을 표시할 자리가 없었다.**
- **디렉토리 분기 실측** — 선행 3문서가 `.claude/meta/`, 신규 지시가 `.claude/_meta/`로 갈렸다. 2026-08-12에 `_meta/`로 통일 완료(운영자 결정) — 이 PRD의 잔여 범위는 **커맨드 신설뿐**이다.
- **발견 경로 부재** — 대시보드 PRD discovery는 활성 plan의 `source_prd`로만 이뤄지므로(§3.11 C1) `_meta/` 문서는 어느 스캔에도 잡히지 않는다.

## Users

- **Primary**: 구조적 문제에 부딪혀 "무엇부터 고쳐야 하는가"를 판정해야 하는 mccp 운영자 — 증상이 여럿이고 서로 얽혀 있어 PRD를 바로 쓸 수 없을 때.
- **Not for**: 단일 기능 요구 — 그건 `/mccp:plan-prd`가 이미 담당한다. 이 커맨드는 **PRD를 쓰기 전 단계**다.

## Hypothesis

We believe **조사 절차를 커맨드로 고정하고 산출물을 `_meta/`에 규격화된 형식으로 남기는 것**이 **조사를 재현 가능하게 하고 판정의 전제가 무효화됐을 때 그것을 드러내는 데** 유효하다 — for **mccp 운영자**.
We'll know we're right when **다음 조사가 커맨드 한 번으로 시작되고, 산출물이 자기 전제(참조한 코드 위치와 시점)를 명시해 재검증 가능할 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] 전제 명시** | 산출물이 참조 코드 경로 + 시점(commit/date)을 기재하는 비율 100% | 산출물 형식 검증 |
| 절차 재현성 | 커맨드 실행만으로 조사 골격(근거 수집 → 문헌 → 선례 → 판정)이 구성됨 | 커맨드 실행 결과 |
| 발견 가능성 | `_meta/` 색인에서 모든 산출물이 1홉 내 도달 | README 색인 대조 lint |
| 전제 무효화 감지 | 인용한 코드가 변경된 산출물을 표시 | 재검증 절차 |

## Scope

**MVP** — `/mccp:meta-research <주제>` 신설. (1) 조사 골격을 phase로 고정 — 코드 근거 수집 → 외부 문헌 → 저장소 내 선례·선행 문서 대조 → 판정. (2) 산출물을 `.claude/_meta/<date>-<slug>.md`로 규격 형식(전제 명시 포함)으로 기록. (3) `_meta/README.md` 색인에 자동 등재.

**전제 명시**가 MVP의 핵심 요구다 — 산출물은 "무엇을 근거로, 어느 시점 코드를 보고" 판정했는지를 반드시 적는다. 이것이 없으면 6일 만에 무효화된 §1.3 사고가 반복된다.

**Out of scope**

- **`.claude/meta/` → `_meta/` 이관** — 2026-08-12 완료. 잔여 없음.
- **receipt 발행** — 조사는 게이트가 아니다. `GATE_IDS` 미등재.
- **자동 재검증** — 인용 코드의 변경을 감지해 문서를 자동 갱신하는 것은 범위가 크다. MVP는 **재검증을 사람이 할 수 있게 전제를 적는 것**까지.
- **대시보드 통합** — `_meta/`를 derive source로 추가하는 것은 별도 축.
- **외부 문헌 조사의 자동화** — `/deep-research` 등 기존 채널을 쓰고, 이 커맨드는 그 결과를 받아 배치하는 역할.
- **조사 결과로부터 PRD 자동 생성** — `/mccp:plan-prd`가 co-creation을 요구하므로 자동 생성은 그 계약과 충돌.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | `/mccp:meta-research` + 규격 형식 | 조사가 커맨드로 시작되고, 산출물이 전제를 명시해 나중에 재검증 가능 | complete | [meta-research-command-m1.plan.md](../../PRPs/plans/archived/meta-research-command-m1.plan.md) |

## Open Questions

- [ ] **커맨드 이름** — `/mccp:meta-research` vs `/mccp:investigate` vs `/mccp:meta`. 기존 namespace와의 일관성(동사형 `plan`·`work`·`resume` vs 명사형 `trace`·`dashboard`).
- [ ] **`/mccp:plan-prd`와의 접속** — 조사 산출물을 PRD의 Evidence로 넘기는 경로. 본 사이클에서는 사람이 인용했다. 인자로 받게 할지.
- [ ] **전제 명시의 강제 수준** — 형식 검증(섹션 존재)만 할지, 인용 경로의 실존까지 검사할지. 후자는 링크 lint로 가능.
- [ ] **`_meta/`의 대시보드 노출** — 현재 어느 스캔에도 안 잡힌다. derive source 추가는 out of scope로 뒀으나, 산출물이 늘면 발견성이 실제 문제가 된다.
- [ ] **조사 산출물의 은퇴 절차** — 전제가 무효화된 문서를 삭제할지, 무효 표시만 남길지. PRD/plan은 `archived/` 관례가 있으나 `_meta/`는 없다. (현재는 README에 "유효기간 주의" 문단으로 수동 처리)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 커맨드가 형식만 강제하고 조사 품질은 못 올린다 | High | Medium | 형식이 목표가 맞다 — 품질은 사람과 모델의 몫이고, 커맨드는 **전제 명시·색인 등재·절차 누락 방지**를 담당한다. 과대 주장하지 않는다 |
| 산출물이 쌓이기만 하고 아무도 안 읽는다 | Medium | Medium | README 색인 자동 등재 + 1홉 도달을 지표로. 발견성이 여전히 문제면 대시보드 통합을 후속으로 |
| 전제 명시가 형식적으로만 채워진다 | Medium | Medium | 인용 경로 실존을 링크 lint로 검사(Open Question). 내용의 정확성은 강제 불가 |
| 조사 없이 PRD로 직행하는 기존 흐름을 오히려 느리게 만든다 | Medium | Low | 이 커맨드는 **선택적**이다. 단일 기능 요구는 `/mccp:plan-prd`로 직행하는 경로가 그대로 남는다 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-12.*
