# santa 판정 계약 — severity · 원장 · 종료 조건 (P1)

> 우산: [review-loop-trust.prd.md](review-loop-trust.prd.md) — 승계 불변식 **I1 · I3 · I4**
> 선행: [P0 santa-loop 실체화](santa-loop-materialize.prd.md) (모듈 인터페이스 확정 필요)
> 원 제보: [#124](https://github.com/skypark207/my-claude-code-plugin/issues/124) — 제보자가 PR 제안, 운영자가 수용

## Problem

santa-loop이 수렴하지 않는다. 원인은 리뷰어 품질이 아니라 **게이트 설계 3곳**이다.

1. **severity 축이 없다** — Step 3 스키마는 `critical_issues`(blocker)와 `suggestions`(non-blocking)를 나눠 두는데 Step 4 게이트가 그걸 **읽지 않는다**. 판정 입력이 `verdict` 문자열뿐이라, 문구·네이밍·주석 표현 선호가 criterion FAIL로 올라가 그대로 NAUGHTY가 된다. `suggestions` 필드는 사실상 사문이다.
2. **판정 원장이 없다** — 매 라운드 fresh reviewer가 산출물뿐 아니라 **판정 기록까지** 초기화한다. 기각한 지적이 다음 라운드에 재등장하고, 종결 항목이 다시 blocker로 계수된다.
3. **종료 조건이 없다** — 리뷰 스코프가 delta가 아니라 고정이라, 라운드 N의 수정이 라운드 N+1의 1급 표적이 된다. 새로 여는 표면이 닫는 지적과 같은 속도로 늘어 **자연 종료하지 않는다**.

방치 비용: 라운드당 리뷰어 2명(Opus + codex xhigh)이므로 비용이 라운드 수에 선형으로 붙고, 운영자가 dual-review 자체를 불신하게 된다.

## Evidence

- **patch-chasing 실측**(#124) — 6라운드 실행에서 라운드 1~2는 게이트가 *없던* 자리, 3은 *한쪽 방향만* 보던 자리, **4~6은 전부 직전 라운드가 넣은 코드**. 원 산출물 불변식은 라운드 3에서 이미 전부 강제됨.
- **기각이 보존되지 않음(실측)** — receipt 149건 `resolution.rejected` 총합 **0**. 운영자가 대화에서 내린 기각 판정이 전부 증발.
- **오탐 수치는 문헌 범위 안** — 중립 조건 precision 29.0~42.4%, 오탐 58~71%([arXiv:2603.18740](https://arxiv.org/html/2603.18740v1)). 운영자 체감 80%는 과민이 아님.
- **그러나 리뷰어를 온화하게 만들면 안 됨** — 같은 논문: bug-free framing 시 탐지율 16~93%p 하락, **FN 편향이 FP 편향의 4~114배**, 겉보기 precision 88.9%인데 실제 탐지 3.2%(precision paradox).
- **처방의 선례** — [Refute-or-Promote (arXiv:2604.19049)](https://arxiv.org/pdf/2604.19049): finding이 refute 역할 에이전트의 비판을 통과해야만 승격. mccp의 `mccp:review-*` 4종이 이미 이 패턴이나 **santa-loop에는 그 층이 없다**.
- **Reviewer A 로테이션 실측**(#124 부수) — 범용 `code-reviewer`는 결함이 실재하는 시점에도 3~4라운드 연속 PASS를 냈고, `silent-failure-hunter` 같은 좁은 전용 에이전트로 바꾸자 즉시 실재 지적이 나왔다.

## Users

- **Primary**: santa-loop을 돌리는 mccp 운영자 — 라운드 4 이후 "직전 수정을 겨누는 지적"만 받을 때, 그리고 문구 선호로 NAUGHTY를 받을 때.
- **Not for**: 게이트 receipt chain 승인 — 이 판정은 santa-loop 내부 종료 조건이며 어떤 게이트도 통과시키지 않는다(I4).

## Hypothesis

We believe **BLOCKING의 정의를 `failure_scenario` 서술 가능성에 못박고, 판정 원장을 집계 단계에 주입하며, patch-chasing terminator를 1차 종료 조건으로 두는 것**이 **루프를 실제로 수렴시키고 기각 판정을 보존하는 데** 유효하다 — for **mccp 운영자**.
We'll know we're right when **문구·스타일 지적이 더 이상 NAUGHTY를 만들지 않고, 기각된 지적이 다음 라운드에 재계수되지 않으며, 라운드별 제기/흡수/기각 건수가 원장에 남을 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] 기각 보존율** | 제기 대비 기각이 원장에 기록되는 비율 100% (현 **0%**) | 원장 `REJECTED(reason)` 행 ÷ 제기 수 |
| 재보고 차단 | 원장에 종결된 항목이 blocking으로 재계수되는 비율 0 | 원장 대조 회귀 test |
| severity 게이팅 | `critical_issues`가 빈 리뷰어의 FAIL이 PASS로 계수되고 보고서에 불일치가 남음 | 게이트 단위 test |
| 자연 종료 비율 | 캡 도달 없이 종료한 실행 비율 (baseline 측정 → 이후 개선 추적) | receipt `exit_reason` 분포 |
| **I1 회귀 가드** | 리뷰어 프롬프트의 FAIL-first 프레이밍이 유지됨을 test가 단언 | 프롬프트 문구 회귀 test |

## Scope

**MVP** — 판정 **하류** 4종: (1) severity contract를 리뷰어 프롬프트에 못박기, (2) 게이트를 `verdict` 문자열이 아니라 **병합·중복제거된 blocking 건수**로 재배선, (3) 판정 원장(`round | issue | ABSORBED(proof) | REJECTED(reason)`)을 집계 단계에 주입, (4) patch-chasing terminator — 라운드 2 이후 살아남은 blocking이 전부 `targets: round_N_patch`면 종료하고 미해결 항목을 보고서에 기재.

**종료 조건 정책 (운영자 위임 → 확정)**: **terminator가 1차, 캡 3은 안전망, `MCCP_SANTA_MAX_ROUNDS`(1~5)로 override.** 고정 캡 단독은 수렴시킨 게 아니라 잘라낸 것이라, 캡만 강제하면 "라운드 수 감소" 목표가 정의상 달성되면서 실제 수렴 여부는 여전히 알 수 없다. 캡은 terminator가 실패했을 때의 하드스톱이고, 그 도달 자체가 `exit_reason`으로 기록되어 지표가 된다.

**Out of scope**

- **리뷰어 프롬프트 완화 / "find problems" 프레이밍 제거** — I1. FN 편향이 4~114배 크다. 오탐은 여기서 줄이지 않는다.
- **원장을 리뷰어에게 주입** — I3. 원장은 **집계 단계**가 읽는다. 리뷰어는 fresh를 유지한다(#125 제안 5의 앵커링 우려와 동일 축).
- **santa verdict를 게이트 승인으로 사용** — I4.
- **블라인드 레인 · 스코프 확장** — P2 소유.
- **델타 스코프** — P3 소유. 단 terminator의 `targets` 필드는 P3가 소비하므로 스키마를 여기서 확정한다.
- **Reviewer A 로테이션** — #124 부수 발견. 효과 근거는 있으나 축이 다르고(에이전트 선택 정책) MVP를 부풀리므로 Open Question으로 이연.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | severity contract + 게이트 재배선 | 문구·스타일 지적이 NAUGHTY를 만들지 못하고, blocking은 `failure_scenario`를 쓸 수 있을 때만 성립 | pending | — |
| 2 | 판정 원장 | 기각·흡수가 보존되고 종결 항목이 재계수되지 않음. 항목 3(오탐율)의 없어진 분모가 생김 | pending | — |
| 3 | patch-chasing terminator + 캡 정책 | 직전 수정만 겨누는 라운드에서 루프가 스스로 종료하고, 종료 사유가 기록됨 | pending | — |

## Open Questions

- [ ] **`failure_scenario` 판정의 주체** — 리뷰어가 스스로 "쓸 수 있다"고 선언하는지, 집계 단계가 서술 존재를 기계적으로 검사하는지. 후자가 위조에 강하나 서술 품질을 판정할 수 없다.
- [ ] **원장의 재쟁점 허용 문구** — "판정 끝났으니 재보고 금지, 판정 자체가 틀렸다는 논증만 유효"를 어떻게 기계적으로 구분할지. 문구만으로는 강제 불가.
- [ ] **#125 제안 5와의 접속** — 원장을 집계에 주입할 때 지적 원문을 포함할지 ID·결론만 넘길지. I3가 리뷰어 미주입을 이미 강제하므로 집계 단계에서는 원문 보존이 안전하나, P2와 경계를 맞출 필요.
- [ ] **흡수 반사실 검증**(#124 제안 6) — 흡수한 지적마다 수정 전/후 검사를 돌려 결과가 뒤집히는지 확인. 비용이 크므로 MVP 포함 여부 미정.
- [ ] **Reviewer A 로테이션** — 라운드마다 전용 에이전트를 갈아 끼우는 정책. 별도 축으로 이연했으나 라운드 수 자체를 줄이므로 비용 효과가 큼.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **severity 게이팅이 실재 결함을 non-blocking으로 강등** | Medium | Critical | `failure_scenario` 기준은 "심각해 보이는가"가 아니라 "구체적 오동작을 서술할 수 있는가"라 실재 결함은 통과한다. 강등된 항목은 `suggestions`로 **보존**되어 보고서에 남고 사라지지 않음. 강등 이력을 원장에 기록해 사후 검증 가능 |
| terminator가 실재하는 신규 결함을 patch-chasing으로 오분류 | Medium | High | `targets` 판정은 리뷰어가 아니라 **집계 단계**가 대상 파일·라인을 직전 라운드 diff와 대조해 기계적으로 내린다. 오분류 시에도 미해결 항목이 보고서에 기재되어 사람이 본다 |
| 원장이 앵커링 소스가 되어 탐색 공간을 줄인다 | Medium | Medium | I3 — 원장은 리뷰어에게 가지 않는다. 이 위험은 원장을 리뷰어에 주입할 때만 발생하며 그 경로를 열지 않는 것이 불변식 |
| 캡 override(`MCCP_SANTA_MAX_ROUNDS`)가 상시 상향으로 남용됨 | Low | Medium | override 사용이 receipt `exit_reason`에 기록되어 관측 가능. 기본 3을 벗어난 실행이 지표에 드러남 |
| P0 인터페이스가 늦게 확정돼 착수가 밀린다 | Medium | Medium | P0 Milestone 2의 소유권 표 + 시그니처가 착수 조건. 그 전까지는 severity 정의·원장 스키마 등 **코드 무관 설계**를 선행 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-12.*
