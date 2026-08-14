# santa 델타 리뷰 — 라운드별 스코프 축소 (P3)

> 우산: [review-loop-trust.prd.md](review-loop-trust.prd.md) — 승계 불변식 **I2**(최우선)
> 선행: [P0 실체화](santa-loop-materialize.prd.md) + [P1 판정 계약](santa-adjudication.prd.md)의 원장·`targets` 스키마
> 원 제기: 운영자 항목 6

## Problem

santa-loop의 리뷰 스코프가 라운드마다 **고정**이다. 라운드 1에서 검토한 산출물 전체를 라운드 2·3·…에서도 다시 검토한다. 결과:

- **인지 부하가 줄지 않는다** — 매 라운드가 전체 리뷰라 리뷰 효과성이 규모에 따라 떨어지는 구간에 계속 머문다.
- **소요가 라운드 수에 선형** — 라운드당 리뷰어 2명 × 전체 스코프.
- **이미 수렴한 부분이 반복 표적** — 라운드 N의 수정이 라운드 N+1의 1급 표적이 되는 patch-chasing과 겹쳐, 닫는 속도만큼 새 표면이 열린다.

운영자 제안: *"이번 구현(1)이 pass면 다음 리뷰 때 검토 미진행. 수정 내역(2)만 리뷰."*

**그러나 이 제안을 소박하게 구현하면 리뷰 품질이 붕괴한다** — 아래 Evidence 참조. 그 함정을 피하는 것이 이 PRD의 존재 이유다.

## Evidence

**스코프 축소를 지지하는 근거:**

- **SmartBear** — 리뷰 효과성이 400 LOC 초과 시 70% 미만, 200 LOC 이하 80~90%, 1,000 LOC 이상 50% 미만.
- **Google 수백만 건 분석** — 100 LOC 미만은 중앙값 턴어라운드 1시간 미만, 100~500 LOC는 4시간.
- 인지 부하·decision fatigue 문헌 일치([A Roadmap for Modern Code Review](https://arxiv.org/html/2405.18216v2), [Towards debiasing code review support](https://arxiv.org/pdf/2407.01407)).
- [Incremental Changes in Code Reviews](https://www.pullrequest.com/blog/incremental-changes-in-code-reviews-a-strategy-for-efficiency-and-clarity/) — stacked PR에서 리뷰어가 전체가 아닌 증분 diff만 보면 라운드당 인지 부하가 급감.

**소박한 구현이 치명적인 근거 (이 PRD의 핵심 제약):**

- [Measuring and Exploiting Confirmation Bias in LLM-Assisted Security Code Review](https://arxiv.org/html/2603.18740v1) — 취약 코드를 "안전하다"고 프레이밍하면 탐지율 **16~93%p 하락**(GPT-4o-mini 97.2% → **3.6%**). **FN 편향이 FP 편향의 4~114배.** 겉보기 precision이 88.9%로 오르면서 실제 탐지는 3.2%(precision paradox).
- 즉 **"이 부분은 이전 라운드에서 pass 했다"를 리뷰어에게 알리는 순간 그것이 bug-free framing**이다. 델타 리뷰를 소박하게 구현하면 항목 6이 항목 3(오탐 불신)을 악화시킨다.
- 같은 논문의 완화책이 방향을 확정한다 — **metadata redaction이 68.75% 회복, 명시적 debiasing instruction이 93.75~100% 회복.** 즉 **리뷰어에게 이전 판정을 숨기는 것**이 처방이다.

## Users

- **Primary**: santa-loop 라운드 3 이상을 겪는 mccp 운영자 — 이미 수렴한 부분을 매 라운드 재검토하며 시간을 쓸 때.
- **Not for**: 라운드 1 — 초회 리뷰는 전체 스코프가 정본이다. 델타는 라운드 2부터 의미가 있다.

## Hypothesis

We believe **라운드 2 이후 리뷰 스코프를 직전 라운드의 변경분으로 기계적으로 좁히되, "이전은 통과했다"는 상태 단언을 리뷰어에게 일절 전달하지 않는 것**이 **라운드당 소요와 인지 부하를 줄이면서 탐지율을 보존하는 데** 유효하다 — for **mccp 운영자**.
We'll know we're right when **라운드 2 이후 리뷰 대상 규모가 유의하게 줄고, 동시에 리뷰어 프롬프트에 상태 단언 문구가 0건이며, 알려진 결함 fixture의 탐지율이 전체 스코프 대비 떨어지지 않을 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] I2 준수 — 상태 단언 0** | 리뷰어에게 전달되는 프롬프트에 pass/승인/문제없음류 단언 **0건** | 프롬프트 문자열 회귀 test (금지 패턴 목록) |
| 스코프 축소 실효 | 라운드 2+ 평균 리뷰 대상 규모가 라운드 1 대비 감소 | 라운드별 스코프 크기 기록(P0 계측) |
| **탐지율 보존** | 알려진 결함 fixture에서 델타 스코프의 탐지율이 전체 스코프 대비 하락 없음 | 회귀 fixture 비교 test |
| 라운드당 소요 | 라운드 2+ wall-clock 감소 (baseline 대비) | receipt duration |
| 상시 스코프 면제 준수 | P2의 plan·PRD 상시 대상이 델타 축소에서 제외됨 | 스코프 계산 test |

## Scope

**MVP** — 라운드 2 이후 리뷰 스코프를 **직전 라운드 diff의 hunk 범위**로 좁힌다. 리뷰어에게 전달되는 것은 **범위 지정뿐**이다.

- **허용(기계적 스코프)**: `"다음 hunk만 검토하라: <file>:<line-range>"`
- **금지(인식론적 단언)**: `"나머지는 이미 승인됐다"` / `"pass 했다"` / `"문제없다"` / `"이전 라운드에서 검토 완료"`

이 구분이 MVP의 전부다. 범위를 좁히는 것은 리뷰어의 *주의 배분*을 바꾸고, 상태를 단언하는 것은 리뷰어의 *사전 확률*을 오염시킨다. 전자만 한다.

**Out of scope**

- **라운드 1 델타 적용** — 초회는 전체 스코프.
- **P2 상시 스코프의 축소** — plan·PRD 정합은 두 문서의 *관계*라 매 라운드 재확인 대상이다. 델타에서 **면제**한다.
- **리뷰어에게 원장 주입** — I3. 원장은 집계 단계가 읽는다. 델타 스코프 계산도 집계 단계가 하고 결과(범위)만 리뷰어에게 간다.
- **PR/코드리뷰 등 다른 게이트로의 델타 확장** — santa-loop 한정. 검증 후 별도 PRD.
- **패치 자체의 정당성 판단** — terminator(P1) 소유.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 델타 스코프 계산 + 상태 단언 금지 가드 | 라운드 2+ 리뷰가 직전 변경 범위로 좁혀지되, 프롬프트에 상태 단언이 들어가면 기계적으로 차단됨 | pending | — |
| 2 | 탐지율 보존 검증 | 알려진 결함 fixture로 델타 vs 전체 스코프 탐지율을 비교해 하락 없음을 입증. 하락 시 롤백 근거 | pending | — |

## Open Questions

- [ ] **금지 패턴 목록의 완결성** — "pass", "승인", "문제없음"의 한국어·영어 변형을 어디까지 열거할지. 열거식은 우회 가능하므로, **프롬프트 조립을 구조적으로 분리**(범위 필드와 서술 필드를 나누고 서술 필드를 아예 없앰)하는 편이 강하다. 어느 쪽을 택할지.
- [ ] **hunk 경계의 문맥 폭** — 변경 라인만 주면 리뷰어가 주변 문맥을 못 봐 오판한다. `-C N` 수준의 문맥을 얼마나 줄지. 너무 넓으면 축소 효과가 사라진다.
- [ ] **직전 라운드가 파일을 삭제·이동한 경우** — 델타 범위 계산의 경계 조건.
- [ ] **탐지율 fixture를 어디서 얻는가** — 과거 santa 실행에서 실재로 판명된 결함이 원장에 남지 않아(현 rejected 0) 재현 fixture가 없다. P1 원장이 쌓인 뒤 실측 fixture를 만들지, 합성 fixture로 시작할지. **현실적으로 합성으로 시작**해야 하며, 그 한계를 acceptance에 명시.
- [ ] **누적 델타** — 라운드 4에서 라운드 3 변경만 볼지, 라운드 2~3 누적을 볼지. 후자가 안전하나 축소 효과가 줄어든다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **구현이 I2를 위반해 탐지율이 붕괴한다** (16~93%p) | Medium | **Critical** | Milestone 1이 금지 패턴 가드를 **먼저** 넣고, Milestone 2가 fixture로 탐지율을 실측한다. 하락 검출 시 델타 비활성이 기본 동작. 이 PRD에서 가장 중요한 통제 |
| 델타 밖에 남은 실재 결함이 영구 미검출 | Medium | High | P2의 상시 스코프(plan·PRD 관계)가 델타 면제라 관계 불변식은 매 라운드 확인된다. 그 외 영역은 라운드 1 전체 리뷰가 담당하고, terminator(P1)가 종료를 판정하므로 델타는 종료 판정의 근거가 아니라 주의 배분일 뿐 |
| 합성 fixture가 실제 결함 분포를 대표하지 못한다 | High | Medium | 한계를 acceptance에 명시하고, P1 원장이 쌓인 뒤 실측 fixture로 재검증하는 후속을 Open Question에 남긴다. **"검증했다"고 과대 주장하지 않는다** |
| 문맥 폭 튜닝이 축소 효과를 상쇄 | Medium | Medium | 스코프 크기를 지표로 기록해 효과를 실측. 효과가 없으면 델타를 끄는 것이 정직한 결론 |
| P1의 `targets` 스키마 지연으로 착수 불가 | Medium | Medium | 델타 스코프 계산은 git diff로 독립 산출 가능. `targets` 소비는 terminator 연계 시점에만 필요하므로 Milestone 1은 P1과 병행 가능 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-12.*
