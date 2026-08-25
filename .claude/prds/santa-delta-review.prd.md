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
| 스코프 축소 실효 | 라운드 2+ 평균 리뷰 대상 규모가 라운드 1 대비 감소 | 라운드별 스코프 크기 기록(P0 계측). **M1은 실행 단위 관측 + durable 봉인 양쪽을 배송한다** — 원장 라운드 레코드의 `scope{applied,reason,before,after}`와 receipt `meta.santa_delta_rounds` · `meta.santa_delta_paths_dropped`(present-only, kill switch 무관 stamp). 초안은 durable 봉인을 M2로 이연했으나 계측 없는 축은 착지 여부를 사후에 못 가린다는 L2 지적으로 M1이 소유하게 됐다 |
| **탐지율 보존** | 알려진 결함 fixture에서 델타 스코프의 탐지율이 전체 스코프 대비 하락 없음 | 회귀 fixture 비교 test. **M2 소유 — M1은 이 지표를 주장하지 않는다.** M1이 세운 계측은 *스코프가 얼마나 줄었는가*를 재고 *줄여도 결함을 놓치지 않는가*는 재지 않는다 |
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
| 1 | 델타 스코프 계산 + 상태 단언 금지 가드 | 라운드 2+ 리뷰가 직전 변경 범위로 좁혀지되, 프롬프트에 상태 단언이 들어가면 기계적으로 차단됨 | complete | [m1](../plans/santa-delta-review-m1.plan.md) |
| 2 | 탐지율 보존 검증 | 알려진 결함 fixture로 델타 vs 전체 스코프 탐지율을 비교해 하락 없음을 입증. 하락 시 롤백 근거. **M1 인계: fixture 비교가 하락 없음을 보이면 `MCCP_SANTA_DELTA_SCOPE`의 default를 `off` → `enforce`로 뒤집는다.** M1이 `off`로 배송한 이유는 발화가 더 느슨한 방향이고 그 대가(16~93%p)를 아직 아무도 재지 않았기 때문이다. **부분 배송(2026-08-21)**: Layer 1(결정적 containment)과 사전 등록 규칙의 기계적 적용은 착지했고 default는 규칙대로 `off`로 유지됐다. **Layer 2(라이브 리뷰어 비교)는 미실행**이라 원래 Outcome인 "탐지율 비교"는 성립하지 않는다 — 배송된 것은 containment(리뷰어에게 보일 기회) 측정이지 detection(리뷰어가 찾는가) 측정이 아니다. **2026-08-21 종료**: 배송 범위 기준으로 닫고 Layer 2는 아래 Open Question으로 이연한다 ([closure](../milestone-closures/santa-delta-review-m2.md) — acceptance 7항목 중 4b 미충족을 명시). 이 `complete`는 "탐지율 보존이 검증됐다"가 아니라 "Layer 1과 규칙의 기계적 적용이 착지했고 미측정이 미측정으로 기록됐다"를 뜻한다 | complete | [m2](../plans/santa-delta-review-m2.plan.md) |
| 3 | 사이클 잔여 마감 (backlog · fix-task · 부수 정정) | M1·M2가 관측했지만 닫지 않은 사이클 부채를 마감한다 — 이 사이클의 backlog 행 전건이 흡수 또는 증거 있는 이연 중 하나를 갖고, M1 게이트가 남긴 fix-task 에스컬레이션이 그 지적의 처리로 방출되며, 도중 실측된 부수 결함(백로그 파서가 443행 중 272행을 조용히 버리는 것 · 게이트 정책 env가 만드는 상시 red · hook-trace 루트의 cwd 표류 · plan-conflict 가드의 두 점 diff와 백틱 미제거 · origin/main과의 `1.30.2` version 충돌)이 닫힌다. **탐지율을 재지 않고 `MCCP_SANTA_DELTA_SCOPE` default를 건드리지 않는다** — Layer 2는 아래 Open Question 소유이며, M3의 완료는 «사이클 부채를 닫았다»이지 «PRD 측정 축이 검증됐다»가 아니다. **2026-08-25 종료**: 사이클 backlog 65행 전건이 흡수(4) 또는 증거 있는 이연(61) 중 정확히 하나를 갖고(기계 판정), fix-task 2건이 그 지적의 처리로 방출됐으며, 부수 결함 5축이 닫혔다 — 백로그 파서 181→453행 · 게이트 정책 env 상시 red 51건 → 0 · hook-trace 루트 앵커 · plan-conflict 가드 unplanned 270→32 · version 충돌(`1.30.2` 선점 확인 후 forward-only로 M3를 `1.32.5`에 착지). 이 `complete`는 **탐지율 보존이 검증됐다는 뜻이 아니다** — 아래 Layer 2 Open Question은 그대로 열려 있고, 그것이 열려 있는 한 `MCCP_SANTA_DELTA_SCOPE` default는 `off`로 묶인다([note](../notes/santa-delta-review-m3.md) · [report](../PRPs/reports/santa-delta-review-m3-report.md)) | complete | [m3](../plans/santa-delta-review-m3.plan.md) |

## Open Questions

- [x] **금지 패턴 목록의 완결성** — **M1 결정: 둘 다 하되 계층을 나눈다.** 1차 통제는 구조 분리다 — `renderScopeLines({paths, ranges})`에 서술 인자가 **없어서** 상태 단언을 실을 자리가 구조적으로 없다(`lanes.buildBlindPrompt`가 파일 내용 인자를 없앤 것과 같은 수단). 열거식 denylist는 그 위에 얹는 벨트이고 **완결성을 주장하지 않는다**. 다만 목록을 두 개로 나눈 것이 실질이다: 엄격한 `SCOPE_ASSERTION_PATTERNS`는 델타가 렌더한 **스캐폴딩**에만, 좁은 `PRIOR_ROUND_PATTERNS`는 조립된 프롬프트 **전체**(caller-authored rubric 포함)에 건다 — 후자가 UI2를 rubric까지 덮는 유일한 통제다. 단일 목록을 전체에 걸면 규약상 "PASS/FAIL condition"을 담는 정상 rubric이 매 라운드 터진다. **구현 시 이탈 1건**: plan은 denylist를 `renderScopeLines`의 원시 출력 전체에 걸라고 적었으나, 실측에서 `review-loop-bypass-m1.plan.md`(`/pass(ed)?/i` — "by**pass**")와 `refactor-cleaner.md`(`/clean/i`)가 걸려 **평범한 저장소 경로가 라운드를 죽인다.** 데이터에 denylist를 거는 것은 fail-closed가 아니라 오작동이므로 검사를 스캐폴딩으로 한정했다(같은 동결, 오탐 0).
- [x] **hunk 경계의 문맥 폭** — **M1 결정: 상수 20줄(`CONTEXT_LINES`), env를 추가하지 않는다.** 블라인드 레인은 포인터만 받고 리뷰어가 자기 도구로 파일 전체를 읽으므로 문맥 부족이 구조적으로 없고, 이 상수가 실제로 묶는 것은 번들 레인의 재현성이다. 값의 타당성은 `before`/`after`가 매 실행 관측되므로 사후 조정 가능하다.
- [x] **직전 라운드가 파일을 삭제·이동한 경우** — **M1 결정: 이미 닫혀 있어 코드를 바꾸지 않고 회귀 test로 고정만 했다.** `cli.js`의 `DIFF_FILE_RE`가 `+++ b/`만 앵커하므로 `+++ /dev/null`(삭제)은 범위 집합에 열리지 않고, rename은 새 경로가 `+++ b/<new>`로 잡힌다. 실제 git 커밋으로 두 경우를 재는 test가 `santa-delta-instrumentation.test.js`에 있다.
- [x] **탐지율 fixture를 어디서 얻는가** — **M2 결정: 합성으로 시작하되 결함을 위치로 계층화한다.** 실측 fixture는 여전히 없다(rejected 0건은 M2 시점에도 그대로다). `detection-corpus.js`가 결함을 4계층(fix hunk 안 · 같은 파일 범위 밖 · 드롭된 경로 · 상시 스코프)으로 나눠 각 1건씩 심고, 실제 git fixture + 실제 CLI를 두 모드로 지난다. **계층화가 이 결정의 실질이다** — 단일 탐지율 하나를 내면 그 수는 corpus 구성이 결정하고 corpus를 고르는 사람이 답을 고르게 되는데, 계층별 개수는 그 조작이 불가능하다. 한계(N=1 · 합성 · 계층당 1건 · 비결정성)는 노트·report 두 자리에 명시했다. P1 원장이 쌓인 뒤 실측 fixture로 재검증하는 것은 아래 신규 Open Question이 잇는다.
- [ ] **Layer 2(라이브 리뷰어 비교)를 언제 완주하는가** — M2가 배송한 것은 Layer 1(결정적 containment)뿐이다. Layer 2는 같은 fixture에서 실제 리뷰어 레인을 `off`·`enforce` 두 번 완주해 발견 id를 대조하는 것인데, M2 사이클의 세션 운영 지시가 명시 요청 없는 서브에이전트 발화를 금지해 구조적으로 실행 불가였다. **그 부재가 default를 `off`로 묶는다** — 사전 등록 규칙의 전건이 Layer 2 비교이고, 미상은 flip 근거가 아니기 때문이다(`decideDefaultFlip` → `layer2-absent`, 회귀 test가 default와의 정합을 강제). 서브에이전트 발화가 허용된 세션에서 Task 3을 완주하고 `LAYER2_EVIDENCE` 상수를 실측치로 교체하면 같은 test가 그때의 default를 다시 판정한다. **Class B(같은 파일 범위 밖)가 이 측정의 핵심 질문이다** — Layer 1은 그 계층의 containment가 보존됨을 보였으나, 리뷰어의 주의가 실제로 범위 밖으로 가는지는 답하지 않는다. **M3(2026-08-25)도 닫지 않았다** — 같은 세션 운영 제약(UI9)이 유지됐고 M3의 범위는 사이클 부채였지 PRD의 측정 축이 아니었다. M1·M2·M3가 모두 `complete`라 `/mccp:archive-complete`의 `scan.js`는 이 PRD를 archivable로 판정하겠지만, **이 질문이 닫히기 전까지 아카이브는 보류한다** (M3 DD10 — 아카이브는 별도 human-gate이고, 옮기면 이 질문이 활성 표면에서 사라진다).
- [x] **누적 델타** — **M1 결정: 누적이다.** 델타는 존재하는 fix anchor **전부**의 hunk 합집합이다(라운드 N 진입 시점에 그것이 라운드 0..N-1의 anchor다). 비누적이 축소 효과는 크지만 "라운드 1이 rev0을 제대로 봤다"에 의존하고, 캡 기본 3에서 누적 대상은 최대 2~3개 커밋이라 축소 효과는 여전히 압도적이다 — 안전한 쪽이 싸다.

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
