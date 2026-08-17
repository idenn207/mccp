# Review Loop Bypass — 게이트 리뷰 단일통과 토글

## Problem

`/mccp:plan` · `/mccp:prp-implement` · `/mccp:pr` 세 게이트의 리뷰 루프가 한 작업당 8~12시간을 소모한다. 소모의 주범은 리뷰 자체가 아니라 **라운드 반복**이다 — 승인 패널이 R0에서 끝나지 않고 R1, R2로 재실행되며, 운영자는 그 사이 `MCCP_GATE_ROUND_CAP`과 수렴 여부를 계속 감시해야 한다.

이 저장소의 운영자는 mccp 개발과 실무 개발을 **병행**한다. 게이트가 반나절을 가져가면 그 시간만큼 실무 일정이 밀린다. 현재 이 비용을 낮출 단일 축이 없다 — 리뷰 강도를 조절하는 토글은 5종 이상 흩어져 있고(`MCCP_PLAN_REVIEW`, `_QUORUM`, `_ROLES_MIN`, `_L3`, `_BUDGET`, `MCCP_GATE_ROUND_CAP`), 그 중 어느 것도 "이번 작업은 단일 통과로 끝내라"를 한 번에 표현하지 못한다.

방치 비용은 리뷰 품질이 아니라 **게이트 회피**다. 반나절이 드는 게이트는 결국 우회되고, 우회는 기록을 남기지 않으므로 dual-review 가치가 조용히 0이 된다.

## Evidence

- **실측 (2026-08-16~17, santa-loop-materialize M2)**: 단일 plan이 R0~R3에 이어 R4~R9까지 **총 10라운드**를 돌았다. 흡수 12건 · 기각 5건 · 리뷰 에이전트 누적 16~24개. 라운드 재실행이 시간 비용의 지배항임을 보여준다.
- **운영자 자기 보고**: "작업 한번에 8~12시간씩 걸려서 실무 개발을 진행하는데 일이 계속 밀리고 있어."
- **기존 회피 경로가 이미 사용되고 있음**: `MCCP_PR_SKIP_CODEX_REVIEW` audited escape가 P1 PR #86에서 dedupe 불발 우회에 실제로 사용됐다. 즉 "게이트를 건너뛰어야 하는 상황"은 이미 발생하고 있고, 지금은 축마다 별개의 임시 escape로 처리된다.
- **부분 통제만 존재함**: `MCCP_GATE_ROUND_CAP=1`이 default지만, 이는 *추가 라운드의 상한*일 뿐 santa-loop 발화나 L2 verdict의 차단력에는 닿지 않는다.

## Users

- **Primary**: mccp 저장소의 **단독 운영자** — mccp 자체 개발과 별도 실무 개발을 병행하며, 게이트를 직접 실행하고 라운드 수렴을 직접 판단하는 사람. 필요 시점은 (1) 변경 범위가 리뷰 비용보다 작을 때 (2) 기간이 촉박해 구현·시현·배포가 먼저일 때 (3) PRD가 여러 마일스톤이라 전체 종료 후에야 검증이 성립할 때.
- **Not for**: dual-review를 상시 우회하려는 사용. 본 토글은 **작업 단위 opt-in**이며 기본값이 아니다. 팀 단위 정책 완화(예: CI에서 전역 비활성)도 대상이 아니다.

## Hypothesis

We believe **하나의 환경변수로 세 게이트의 리뷰 루프를 단일 통과로 만드는 것**이 **라운드 반복이 만드는 8~12시간 비용**을 **mccp 운영자**에게서 제거할 것이다.

We'll know we're right when **토글을 켠 작업의 게이트 통과 시간이 단일 라운드 분량으로 떨어지고, 그렇게 건너뛴 리뷰 지적이 하나도 유실되지 않은 채 backlog에 남아 있을 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| 토글 사용 시 게이트 통과 시간 | 단일 라운드 분량 (기준선 8~12h 대비 1자릿수 배 단축) | plan review record의 `wall_clock_ms` + 운영자 자기 보고. 정확한 상한은 `TBD — 첫 사용 3건 실측으로 확정` |
| 미흡수 지적의 유실 | 0건 | 단일 라운드가 낸 미흡수 HIGH/CRITICAL 수 == backlog에 append된 줄 수 |
| 기본 경로 회귀 | 0건 | 토글 unset 상태에서 기존 test suite green + 기존 receipt corpus invalid 0 |
| 사후 감사 가능성 | 토글로 통과한 receipt 100%가 사유를 봉인 | receipt에서 skip 사유로 역검색했을 때 실제 사용 건수와 일치 |

## Scope

**MVP** — 단일 환경변수가 값 자체로 사유를 선언하고, 그 사유가 receipt에 봉인된 채 세 게이트를 단일 통과시킨다.

토글이 켜졌을 때의 요구 동작:

- **santa-loop** — 발화하지 않는다.
- **라운드 반복** — 1회로 고정한다. R0만 돌고 R1 이상은 없다.
- **L2 승인 패널** — **1회 발화한다.** verdict가 비수렴이어도 진행을 차단하지 않는다. (기존 리뷰 가치를 완전히 잃지 않기 위한 의도적 선택 — 끄는 것이 아니라 반복을 없애는 것이다.)
- **L1 (mechanical)** — 불가침. 토글과 무관하게 발화하고, 실패하면 토글이 켜져 있어도 HALT한다.
- **receipt** — 미작성이나 미승인이 아니라, **사유가 봉인된 승인**으로 남는다.

사유는 **고정 enum 3종**이며 토글의 값 자체다. 별도 사유 변수를 두지 않는 이유는, 두면 잊을 수 있고 잊힌 사유는 감사 불가이기 때문이다 — 토글을 켜는 행위와 사유를 대는 행위가 같은 동작이어야 한다.

| 사유 | 언제 |
|---|---|
| `scope_too_small` | 변경 범위가 작아 리뷰 비용이 변경 비용을 넘어설 때 |
| `deadline_pressure` | 기간이 촉박해 구현·시현·배포가 선행해야 할 때 |
| `deferred_to_prd_completion` | PRD가 여러 마일스톤이라 전체 종료 후에야 검증이 성립할 때 |

값이 enum 밖이면 **fail-closed** — 토글은 꺼진 것으로 보고 loud warn을 낸다. 오타가 조용한 우회가 되어서는 안 된다.

**Out of scope**

- **Codex 게이트 비활성화** — `mccp-plan-codex` · `mccp-implement-codex` · `mccp-pr-codex`는 무변경. 본 토글은 *반복*을 없애지 cross-model review를 없애지 않는다. Codex를 끄는 축은 `MCCP_CODEX_DISABLED`로 이미 존재한다.
- **L1 우회** — 설계상 불가침(`ENVIRONMENT.md:421`). mechanical 실패를 LLM의 "괜찮아 보임"이 덮을 수 없다는 불변식을 env 하나로 무력화하지 않는다.
- **terminal ship gate verdict 판정 변경** — `resolution.codex_verdict` 기반 no-ship 판정은 무변경.
- **기존 5종 리뷰 토글의 통합/은퇴** — 본 토글은 그 위에 얹히는 단일 축이지 대체가 아니다. 정리는 별건.
- **전역/CI 상시 활성 지원** — 작업 단위 opt-in만. 상시 활성은 dual-review 가치를 0으로 만들므로 명시적으로 만들지 않는다.
- **토글 사용률의 대시보드 노출** — 감사 데이터는 receipt에 봉인되지만, 그것을 STATUS.md에 표면화하는 것은 후속 축(아래 Open Questions 참조).

## Delivery Milestones

<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | 단일통과 토글 | 운영자가 사유 enum 하나를 env로 선언하면 세 게이트가 단일 라운드로 통과하고, 그 사유가 receipt에 봉인돼 사후 감사가 가능하다 | in-progress | [.claude/plans/review-loop-bypass-m1.plan.md](../plans/review-loop-bypass-m1.plan.md) |
| 2 | 미흡수 지적 회수 | 단일 라운드가 낸 미흡수 지적이 backlog에 자동 적재되어, 기존 fix-task 생성 경로가 그것을 그대로 집어간다 | pending | — |

M2가 없으면 M1은 **부채를 만드는 기능**이다 — 지적이 사라지므로. M1이 없으면 M2는 대상이 없다. 두 마일스톤이 함께 있어야 "나중에 한 번에 고친다"가 성립한다.

## Open Questions

- [ ] `deferred_to_prd_completion`으로 건너뛴 마일스톤들이 PRD 종료 시 **실제로** 검증됐는지 강제하는 장치가 없다. 현재는 명예 시스템 — 강제 장치가 필요한지, 필요하다면 PRD 종료 판정(`/mccp:archive-complete` 축)에 붙일지.
- [ ] 토글과 `MCCP_GATE_ROUND_CAP=2|3`이 동시에 설정됐을 때의 우선순위. 토글이 이기는 것이 직관적이나, 명시적으로 정해야 한다.
- [ ] L2가 1회 발화해 **비수렴** verdict를 냈는데 통과시킨 경우, 그 verdict를 receipt에 어떻게 남길지. `converged`로 위장하면 §3.12의 "완료 판정 키" 신뢰가 깨진다. 별도 상태값이 필요할 가능성.
- [ ] 토글 사용률이 높아지면 그 자체가 신호다 — 몇 %부터 "게이트 설계가 과하다"로 읽을지, 관측 표면을 어디에 둘지.
- [ ] santa-loop 미발화 시 `mccp-santa-review` receipt를 아예 안 쓸지, "미발화 사유 봉인" receipt를 쓸지. 후자가 감사에 유리하나 gate 스키마 변경을 부른다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 토글이 상시 켜진 채 방치돼 dual-review 가치가 0이 된다 | 높음 | 높음 | 사유가 토글 값 자체라 무사유 사용이 구조적으로 불가. receipt 봉인으로 사용률이 사후 계측 가능 — 높으면 그것이 게이트 재설계의 근거가 된다 |
| backlog에 적재만 되고 실제로는 안 고쳐져 부채가 누적된다 | 중간 | 높음 | M2가 기존 fix-task 생성 경로의 원천인 backlog로 보내므로, 회수 경로를 새로 만들지 않고 이미 도는 것에 얹는다 |
| 오타난 사유가 조용히 토글을 켜거나 끈다 | 중간 | 중간 | enum 밖 값은 fail-closed(꺼짐) + loud warn. 조용한 우회 경로를 만들지 않는다 |
| 단일 라운드가 통과시킨 잘못된 plan이 그대로 구현으로 흘러간다 | 중간 | 중간 | L1은 여전히 불가침이고 Codex 게이트도 유지된다. 토글이 없애는 것은 *반복*이지 리뷰 전부가 아니다 |
| 세 게이트에 흩어진 배선이 한 축을 빠뜨려 부분 적용된다 | 중간 | 중간 | "단일 라운드 통과"를 세 게이트 각각에서 검증하는 것을 acceptance 조건으로 둔다. 부분 적용은 8~12시간을 그대로 남기므로 가치가 0이다 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-18.*
