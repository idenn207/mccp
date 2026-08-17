# santa 판정 계약 — severity · 원장 · 종료 조건 (P1)

> 우산: [review-loop-trust.prd.md](review-loop-trust.prd.md) — 승계 불변식 **I1 · I3 · I4**
> 선행: [P0 santa-loop 실체화](santa-loop-materialize.prd.md) (모듈 인터페이스 확정 필요)
> 원 제보: [#124](https://github.com/idenn207/mccp/issues/124) — 제보자가 PR 제안, 운영자가 수용

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
| 1 | severity contract + 게이트 재배선 | 문구·스타일 지적이 NAUGHTY를 만들지 못하고, blocking은 `failure_scenario`를 쓸 수 있을 때만 성립 | complete | [santa-adjudication-m1.plan.md](../plans/santa-adjudication-m1.plan.md) |
| 2 | 판정 원장 | 기각·흡수가 보존되고 종결 항목이 재계수되지 않음. 항목 3(오탐율)의 없어진 분모가 생김 | in-progress | [santa-adjudication-m2.plan.md](../plans/santa-adjudication-m2.plan.md) |
| 3 | patch-chasing terminator + 캡 정책 | 직전 수정만 겨누는 라운드에서 루프가 스스로 종료하고, 종료 사유가 기록됨 | pending | — |

## Open Questions

- [x] **`failure_scenario` 판정의 주체** — 리뷰어가 스스로 "쓸 수 있다"고 선언하는지, 집계 단계가 서술 존재를 기계적으로 검사하는지. 후자가 위조에 강하나 서술 품질을 판정할 수 없다.
  - **답(M1 DD5)**: 집계 단계가 검사한다. 리뷰어의 자기 선언은 받지 않는다 — "나는 이것을 서술할 수 있다"는 위조 비용이 0이다. 검사는 두 층으로 나뉘어 기록 시점(`cli.js#loadReviewer`)이 타입·길이·열거값을, 판정 시점(`gate.classifyFinding`)이 실질성(`validateReason` strict + allowCodeVocabulary)을 본다. **지적된 한계는 그대로 남는다**: 이 검사는 그럴듯한 거짓 시나리오를 거르지 못하고, 닫는 것은 "서술 없이 blocker라고 부르는 것"뿐이다.
- [ ] **`MCCP_SANTA_MAX_ROUNDS`(본 PRD 문언, 1~5)와 배송된 `MCCP_SANTA_ROUND_CAP`(1~10)의 이름·범위 불일치** — milestone 3(캡 정책) 소유다. M1은 캡을 건드리지 않으므로 발현하지 않지만, M3 착수 시 PRD를 정정할지 코드를 정정할지 정해야 한다.
- [ ] **1순위 시나리오(`fail-without-blocking` 불일치)가 실경로 3라운드에서 재현되지 않았다 — M1 Acceptance 4번째 항목 미충족.** 2026-08-17에 이 저장소에서 `/mccp:santa-loop`을 캡이 허용하는 **3라운드 전부** 돌렸다(decision slug `santa-adjudication`, 리뷰어 6명, 모두 opus). 실측:

  | round | verdict | contract | blocking | mismatches | 비고 |
  |---|---|---|---|---|---|
  | 0 | NICE | full | 0 | 0 | 리뷰어 A·B 모두 PASS · findings 0 |
  | 1 | NICE | full | 0 | 0 | B가 MEDIUM 1건(실질 `failure_scenario` 포함) → `structured:1 / blocking:0` |
  | 2 | NICE | full | 0 | 0 | 리뷰어 A·B 모두 PASS · findings 0 |

  **확인된 것**: severity 게이팅은 실경로에서 작동한다 — 라운드 1에서 리뷰어가 낸 MEDIUM은 실질 시나리오를 갖췄는데도 `blocking:0`으로 계수됐고 라운드는 NICE를 유지했다. `contract`는 3라운드 모두 `full`이라 리뷰어의 구조화 계약 준수는 문제가 아니었다.

  **확인되지 않은 것**: 불일치 표면(`mismatches`)이 한 번도 발화하지 않았다. `fail-without-blocking`은 리뷰어가 **`FAIL`을 내면서** blocking을 하나도 못 내야 성립하는데, 6명 전원이 `PASS`를 냈다.

  **이것은 표본 부족이 아니라 구조적 억제로 보인다 — 그리고 그 억제의 원인은 같은 milestone이다.** M1은 게이트(하류)만이 아니라 `santa-loop.md` Step 3의 리뷰어 프롬프트(상류)도 함께 바꿨다. 새 문언이 "서술할 수 없으면 `suggestions`로 보내라"고 지시하므로, 문체 지적만 가진 리뷰어는 애초에 `FAIL`을 내지 않는다. 즉 프롬프트 축이 작동할수록 게이트 축이 완화할 대상이 사라진다 — 두 축이 같은 실패를 양끝에서 막고 있고, 관측하려던 시나리오는 상류가 이미 막은 뒤의 잔여다. Success Metrics의 `severity 게이팅` 행("`critical_issues`가 빈 리뷰어의 FAIL이 PASS로 계수되고 보고서에 불일치가 남음")은 그래서 **상류 프롬프트를 M1 이전 문언으로 되돌린 대조군**에서만 직접 측정 가능하다.

  **소유권 이관(2026-08-16)**: M1은 `/mccp:milestone-close`로 `done` 종료했고, 그 closure가 (a)·(b)를 **본 Open Question으로 명시 이연**했다 — 근거·판정 시점·미달 항목 원문은 [milestone-closures/santa-adjudication-m1.md](../milestone-closures/santa-adjudication-m1.md)가 봉인한다(sha256 stamp는 plan body `## Milestone Closure Provenance`). 이연은 "관측이 불필요하다"가 아니라 **"현 표본으로는 확정할 수 없고 재측정의 소유자가 M1이 아니다"**는 판정이므로, 아래 처방은 미결로 남는다.

  **처방(미결)**: (1) 지표를 "불일치 발화 건수"에서 "blocking으로 계수된 finding 대비 강등된 finding 비율"로 바꿀지, (2) 대조군 측정을 별도 축으로 세울지, (3) 상류·하류 중 하나만 배송하는 설계로 되돌릴지. 임계를 낮추는 것은 처방이 아니다. milestone 2가 판정 원장을 들이면 강등 이력이 원장에 남으므로 (1)의 분모가 그때 생긴다. **(1)의 분모는 부분적으로 앞당겨졌다** — code-review L1 흡수로 `cli.js verdict`의 stdout에 `byReviewer{findings, structured, blocking}`가 실리므로 라운드 단위 강등 비율은 지금도 관측된다(원장에 이력으로 **남는** 것은 여전히 milestone 2 소유다).

  **추가 실측(2026-08-17, code-review H1)**: 위 3라운드가 시나리오를 재현했더라도 **Acceptance는 통과하지 못했을 것이다.** `seal.js`의 `deriveVerdict`·`buildProof`가 FINAL 라운드 리뷰어 전원 `PASS`를 계속 요구하고 있었으므로, 게이트가 NICE를 낸 `fail-without-blocking` 라운드는 Step 5.5에서 `divergent`로 봉인되고 `exit 1`로 push가 막혔다(receipt에 divergent + `fix-task.md`에 `divergent_unresolved`). 즉 관측 실패의 원인은 상류 프롬프트의 억제 **하나가 아니라 둘**이었고, 하류 쪽은 같은 사이클에서 닫혔다. 위 표의 해석("상류가 이미 막은 뒤의 잔여")은 유효하지만, 그 결론은 **재측정 뒤에** 확정해야 한다 — 두 번째 원인이 살아 있는 동안 얻은 표본이기 때문이다.
- [ ] **원장의 재쟁점 허용 문구** — "판정 끝났으니 재보고 금지, 판정 자체가 틀렸다는 논증만 유효"를 어떻게 기계적으로 구분할지. 문구만으로는 강제 불가.
- [ ] **#125 제안 5와의 접속** — 원장을 집계에 주입할 때 지적 원문을 포함할지 ID·결론만 넘길지. I3가 리뷰어 미주입을 이미 강제하므로 집계 단계에서는 원문 보존이 안전하나, P2와 경계를 맞출 필요.
- [ ] **흡수 반사실 검증**(#124 제안 6) — 흡수한 지적마다 수정 전/후 검사를 돌려 결과가 뒤집히는지 확인. 비용이 크므로 MVP 포함 여부 미정.
- [ ] **Reviewer A 로테이션** — 라운드마다 전용 에이전트를 갈아 끼우는 정책. 별도 축으로 이연했으나 라운드 수 자체를 줄이므로 비용 효과가 큼.
- [ ] **P2가 P1 원장을 소비한다면 그 접속 표면은 무엇인가 (M2 DD15가 등재)** — M2가 정의하는 접속은 **하나뿐이다**: 경로는 `ledger.deriveSantaDecisionId(...)` → `.claude/state/santa-loop/<slug>.json`으로 파생하고, 읽기는 `ledger.read(opts)` 스냅샷 1회 + 순수 파생이며(`entries`를 직접 `JSON.parse`하는 경로는 계약이 아니다), 유효 범위는 **같은 워크트리·같은 루프**다. 그 밖에서 파일 부재는 오류가 아니라 "그 리뷰 스코프가 끝났다"는 뜻이고 소비자는 부재를 정상 상태로 처리해야 한다. **M2가 정의하지 않는 것**: 루프를 건너는 지속성 · 워크트리 간 조회 · slug discovery("어떤 slug들이 존재하는가"를 묻는 API는 없다). P2 착수 시 그 셋 중 무엇이 실제로 필요한지 **먼저 판정**하고, 필요하면 그것은 P2의 설계 항목이거나 P0 재개 사유다 — M2가 조용히 채워 둘 자리가 아니다. 이 미정의를 문서에 남기지 않으면 다음 milestone이 그것을 있는 것으로 전제하고 경로를 스스로 발명하며, 그 발명이 P0의 저장 계층 가정을 깨도 어떤 test도 잡지 않는다.

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
