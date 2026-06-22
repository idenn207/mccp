# Stage-Aware impeccable Command Routing

## Problem
mccp의 디자인 게이트는 design surface 변경을 감지하면 impeccable의 `critique` 명령 **하나만** 호출한다. 하지만 impeccable 공식 카탈로그(https://impeccable.style/docs/)에는 디자인 라이프사이클 단계별로 23개의 명령이 있고(shape/audit/layout/typeset/polish/harden 등), mccp는 그중 critique 단 하나만 활용한다. a11y는 a11y-architect로 "routing 표시"만 하고 실제 자동 호출조차 하지 않는다. 결과적으로 디자인 작업이 "리뷰 1회"에 갇혀, 발견(shape)·정돈(layout/typeset)·프로덕션화(harden)·마무리(polish) 같은 단계가 도구 지원 없이 수작업으로 남는다.

## Evidence
- `plugins/mccp/scripts/lib/codex-result-filter.js` 주석: a11y finding은 drop + `a11yRoutedCount` 카운트만 하고 a11y-architect를 **자동 spawn하지 않음** ("optionally route").
- `commands/plan.md`의 design-critique 루프는 `Skill(impeccable, "critique <slug>")` 단일 명령만 invoke (Refine/Harden/Create 군 미사용).
- impeccable 공식 문서 확인(2026-06): Create(craft/shape) · Evaluate(critique/audit) · Refine(animate/bolder/colorize/delight/layout/overdrive/quieter/typeset) · Simplify(adapt/clarify/distill) · Harden(harden/onboard/optimize) · System(document/extract/live/init/detect/hooks) — 23개 명령 중 1개만 wiring됨.

## Users
- **Primary**: skypark207 — mccp를 dogfooding하며 `/mccp:work` chain으로 디자인 surface(dashboard renderer, STATUS.md/html 등)를 구현하는 maintainer-operator. 디자인 작업 시 단계마다 적절한 impeccable 명령을 수동으로 떠올려 실행해야 하는 부담을 진다.
- **Not for**: backend-only 변경 작업(디자인 signal 0) · impeccable 미설치 사용자(게이트가 graceful skip) · impeccable을 mccp 밖에서 직접 쓰는 워크플로.

## Hypothesis
We believe **디자인 라이프사이클 단계(discovery→build→refine→evaluate→harden→polish)에 impeccable 명령을 적재적소로 매핑하는 stage-aware routing 엔진**이 **"critique 1회"에 갇힌 디자인 게이트를 단계별 도구 지원으로 확장**할 것이다 — 대상은 **mccp로 디자인 surface를 구현하는 maintainer**다.
We'll know we're right when **design-signal이 있는 게이트 통과 시 stage-appropriate impeccable 명령이 자동 호출(auto mode)되거나 명시적으로 권장(hybrid mode)되고, 그 결정이 receipt audit 필드에 기록된다**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Stage-aware 명령 라우팅 | design-signal 게이트에서 단계별 최소 1개 impeccable 명령이 호출/권장 | receipt `meta.impeccable_commands_routed[]` audit 필드 |
| 모드 전환 가능성 | auto ↔ hybrid ↔ recommend 무중단 토글 | `MCCP_IMPECCABLE_ROUTING_MODE` env 토글 + e2e 테스트 |
| Fail-open 불변식 | impeccable 미가용/명령 실패가 게이트 write를 오염시키지 않음 | 기존 `impeccable_skipped` 경로 회귀 테스트 |

## Scope

**MVP** — 디자인 라이프사이클 backbone을 구성하는 **핵심 6개 명령**을 3개 게이트(plan/plan-prd, prp-implement, pr)에 stage-aware로 라우팅한다:

| 단계 | impeccable 명령 | 배치 게이트 | 호출 형태 |
|---|---|---|---|
| Discovery | `shape` | prp-implement 진입 | background(가능 시), 디자인 surface 구현 전 design brief |
| Refine | `layout`, `typeset` | prp-implement (구현 중/후) | design diff 감지 시 |
| Evaluate | `critique`(기존) + `audit` | prp-implement **마무리 1회** + pr | 검증은 끝에 한 번 |
| Harden | `harden` | pr | 프로덕션화(엣지케이스·i18n·에러상태) |
| Polish | `polish` | pr | 최종 마무리 패스 |

- **모드 토글**: `auto`(자동 invoke, default) / `hybrid`(evaluate군 자동 + 나머지 권장) / `recommend`(전부 권장만). 운영 중 문제 식별 시 hybrid/recommend로 강등 가능.
- **plan / plan-prd**: 실제 UI가 없는 단계이므로 **라우팅 가이드만 plan/PRD body에 기록**(어떤 단계에 어떤 명령을 쓸지 청사진).
- **Fail-open 보존**: impeccable 미가용 시 기존 `impeccable_skipped` graceful-skip 경로 그대로.

**Out of scope**
- `craft` — 각 디자인 명령의 chain(설계→구현 일괄)이라 mccp 자체 implement 흐름과 중복/충돌. 제외.
- `live` — localhost:4321 실시간 브라우저 반복. 비대화형 게이트와 부적합. 제외.
- 확장 Refine/Simplify 카탈로그(`animate`, `colorize`, `bolder`, `quieter`, `delight`, `overdrive`, `distill`, `clarify`, `adapt`, `onboard`, `optimize`) — 후속 milestone.
- System 군(`document`, `extract`, `init`, `detect`, `hooks`) — 후속 milestone.
- a11y-architect 실제 auto-invoke 전환(현재 routing-only) — 후속 milestone(별도 결정 필요).

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Core routing engine + 6 commands | design-signal 게이트가 단계별로 shape/layout/typeset/critique/audit/harden/polish를 라우팅하고 모드 토글이 동작 | in-progress | `.claude/plans/impeccable-command-routing.plan.md` |
| 2 | Extended Refine/Simplify 카탈로그 | animate/colorize/bolder/quieter/distill/clarify/adapt/optimize/onboard/overdrive 라우팅 추가 | complete | `.claude/PRPs/plans/completed/impeccable-command-routing-m2.plan.md` |
| 3 | System 명령 + a11y auto-invoke | document/extract wiring + a11y-architect routing-only → 실제 호출 전환 | complete | `.claude/PRPs/plans/completed/impeccable-command-routing-m3.plan.md` |

## Open Questions
- [ ] `shape`의 background 실행: 비대화형 게이트에서 background Agent invocation이 안정적인가? 불가 시 foreground 권장으로 폴백하는 기준은?
- [ ] auto mode에서 단계별 명령을 매번 전부 호출하면 비용/시간 부담 — design diff의 성격(타이포만 변경 vs 레이아웃 전반)에 따라 명령을 선별하는 휴리스틱이 MVP에 필요한가, 아니면 단계별 전부 호출 후 M2에서 선별?
- [ ] receipt schema 확장(`impeccable_commands_routed[]`, `routing_mode`)이 기존 design-critique 필드(`design_critique_verdict` 등)와 어떻게 공존하는가 — 별도 필드 vs 통합.
- [ ] hybrid 강등 트리거: 수동 env 토글만인가, 아니면 명령 실패율 같은 자동 강등 신호도 두는가?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| auto-invoke가 게이트 latency/비용을 크게 늘림 | High | Medium | 모드 토글로 hybrid/recommend 강등 + 단계별 명령 선별 휴리스틱(M2) |
| impeccable 명령 인터페이스가 문서와 실제가 다름(미설치 dogfood 환경) | Medium | High | probeSkillAvailable graceful-skip + 명령별 unknown_skill 폴백을 critique 패턴 그대로 재사용 |
| craft/live 외에도 비대화형과 충돌하는 명령 존재 | Medium | Medium | MVP를 검증된 6개로 한정 + 명령별 호출 형태(background/foreground/recommend) 명시 |
| 라우팅 로직이 design-gate control-plane을 건드려 자기-재현 무한루프 | Low | Medium | 기존 DESIGN_SURFACE_PATHS 자기-적용 whitelist + dogfood fixture 패턴 재사용 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-23.*
