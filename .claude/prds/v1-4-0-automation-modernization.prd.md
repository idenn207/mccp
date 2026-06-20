# v1.4.0 — AI agent automation modernization (Claude Code native integration vector)

> Co-created with skypark207 on 2026-06-18. Status: **DRAFT** — requirements only. Implementation planning pending via `/mccp:plan`.
> Note: cycle version label (`v1.4.0`)는 working label. 다른 worktree에서 v1.3.0 M3가 같은 version target으로 진행 중이므로 plugin.json bump는 **PR ship 시점 main HEAD 기준**으로 결정 (v1.4.0 / v1.4.1 / v1.5.0 후보).

## Problem
mccp의 자동화 layer는 ECC fork에서 출발해 진화하면서 일부 구조가 노후화되었다. Anthropic은 Claude Code v2.1.139+ ~ v2.1.160 사이에 강력한 native automation primitives — `/deep-research` workflow, `ultracode` keyword + `/effort ultracode` mode, `/goal` completion-condition loop — 를 ship했으나, mccp 안에서 이들을 호출/통합할 경로가 없어 사용자가 매번 mccp chain을 벗어나 별도로 호출해야 하고, 그 결과가 mccp의 receipt chain audit-trail 밖에 머문다. 자동화가 mccp의 핵심 가치인데 자동화 산업 표준을 흡수 못 하면 가치가 정체된다.

## Evidence
- **메타 dogfood**: 이번 v1.4.0 PRD 작성 세션이 정확히 이 friction을 체험. `/deep-research` 존재를 사용자가 별도 대화로 확인하고, 공식 문서를 WebFetch로 수동 가져와 통합 가능성을 토론한 일련의 흐름이 PRD가 풀려는 friction 그 자체.
- **Roadmap 신호**: 통합 vector 4축(A=deep-research / B=ultracode / C=/goal / D=workflow runtime)이 같은 "native 기능 호출" 패턴을 공유. 첫 axis(A)에서 패턴 확립 못 하면 B/C가 각각 다른 방식으로 흩어져 일관성 깨짐.
- **ECC fork 주기 신호**: mccp는 이전에도 "upstream(ECC) 근대화 필요" 패턴을 한 번 거쳤음(v0.1 → v0.2 transition). 주기적인 광역 갱신이 mccp의 진화 리듬에 일관됨.

Note: 사용자가 Evidence 수집을 위임(`claude 판단에 맡김`)했고, Problem/Users/Hypothesis는 보호 필드이므로 별도 push-back 없이 위 3개 신호를 모두 채택.

## Users
- **Primary**: 솔로 dogfood 개발자 (skypark207, 그리고 mccp를 자신의 프로젝트에 비슷한 dogfood 방식으로 쓰는 미래 사용자). 특히 신규 axis 진입 시 외부 사실/표준 조사가 필요한 시점.
- **Not for**: mccp를 단순히 패키지로 install만 하고 receipt chain 없이 native 기능만 쓰는 사용자. 그들은 `/deep-research`, `ultracode`, `/goal`을 직접 호출하면 되고 mccp wrapping이 가치 없음.

## Hypothesis
We believe **Claude Code native automation 기능(`/deep-research`, `ultracode`, `/goal`)을 호출 패턴으로 흡수**하는 것이 **mccp 자동화 layer의 시기적 노후화를 해소**하기 위해 **솔로 dogfood 개발자**에게 작동할 것이다.
We'll know we're right when **3개 axis(A/B/C)가 receipt chain custody를 유지한 채 작동**하고 **dogfood 세션에서 외부 조사 round-trip 횟수가 측정 가능하게 감소**한다.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Axis A (deep-research → plan-prd) ship | M1 PR merged | `git log` |
| receipt chain custody 유지 | `mccp:receipt-validate` 모든 gate 통과 | receipt-validate CLI |
| dogfood friction 감소 | 새 axis 진입 시 외부 조사 round-trip 횟수 | M1 ship 전/후 dogfood 세션 정성 비교 |
| 통합 template 재사용 | M2/M3가 M1과 동일 호출 layer 패턴 사용 | code review의 pattern match |

## Principles (영구 원칙 — cycle 무관)

- **mccp 자체 native 기능 재구현 금지** — Anthropic이 이미 만든 것을 mccp가 다시 만들지 않는다. 통합 vector의 모든 axis가 이 원칙을 지킨다. 이번 cycle 한정이 아닌 영구 invariant.

## Scope
**MVP** — M1 (axis A: `/deep-research` → `/mccp:plan-prd` 통합) 단독 ship으로 가설 1차 검증. M2/M3는 패턴 확장 증명용이며 MVP는 아님.

**Out of scope** (이번 cycle 한정)
- 축 D (workflow runtime full integration) — dispatch-controller M2/M3 (pilot fanout + GC) 선행 필요. v1.5.0 이후로 defer.
- `/ultrareview` 통합 — `mccp:code-review`의 Codex cross-model review 가치를 깨뜨림(same-model fanout으로 대체 안 됨). Skip.
- `/ultraplan` 통합 — Codex bridge가 이미 background offload를 커버. `mccp:plan` chain custody 깨질 위험. Skip.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | axis A — deep-research → plan-prd | `mccp:plan-prd`가 PRD 작성 중 외부 조사 필요 여부를 묻고 `/deep-research` 실행을 안내, 결과 보고서를 PRD 본문 `## References` 섹션에 audit-trail | complete | [.claude/PRPs/plans/completed/v1-4-0-m1-deep-research.plan.md](../PRPs/plans/completed/v1-4-0-m1-deep-research.plan.md) |
| 2 | axis B — ultracode → prp-implement | plan task에 marker가 있는 task만 `ultracode:` 키워드로 위임. workflow agent가 mccp 상태에 침투하지 않는 isolation 보장 (mechanical lock + cooperative prompt 2-layer) | complete | [.claude/plans/v1-4-0-m2-ultracode.plan.md](../plans/v1-4-0-m2-ultracode.plan.md) |
| 3 | axis C — /goal → mccp:milestone-close | 신규 `/mccp:milestone-close` 명령이 `/goal`을 wrapping해서 milestone 종료 acceptance loop 실행. mccp Stop hook 격리 보장 (PreToolUse guard + Stop-hook short-circuit 2-axis) | in-progress | [.claude/plans/v1-4-0-m3-goal-milestone-close.plan.md](../plans/v1-4-0-m3-goal-milestone-close.plan.md) |
| 4 | integration template doc | `docs/automation-modernization/integration-template.md` — 향후 native 기능 흡수 시 재사용 가능한 호출 layer 패턴 명세 | dropped | M1+M2+M3 누적 패턴으로 충족 — 별도 milestone 불필요 (2026-06-19 결정, M3 cycle close 시 stamp) |

## Open Questions
- [x] M3(`/goal`)의 mccp Stop hook 격리는 env 토글로 할 것인가, 아니면 `/goal` 활성 중 Stop hook을 mechanical 우회할 것인가? 두 설계의 race 시나리오 명세 필요. **결정 (2026-06-19, M3 plan)**: mechanical hybrid 2-axis 채택 — (i) `goal-phase-lock.js` + `goal-phase-guard.js` PreToolUse guard + (ii) `stop-review-loop.js` lock-aware fresh-only short-circuit. env toggle은 채택 안 함 (loud fail-open 원칙에 위반 — env override는 silent로 격리를 무력화할 위험).
- [x] M2(`ultracode`)의 workflow agent isolation은 (a) 프롬프트 injection으로 "mccp:* 호출 금지" 명시인가, (b) pr-phase-guard 확장으로 mechanical block인가? 둘 다 leakage 가능. **결정 (M2 ship 시점)**: hybrid 2-layer — primary mechanical(`ultracode-phase-lock.js` + `ultracode-phase-guard.js`) + secondary cooperative(prompt 안내). M3가 동일 패턴 + Stop-hook layer로 확장.
- [x] integration template doc은 M4 별도 milestone으로 할 것인가, 아니면 M1/M2/M3 각 milestone의 부산물로 점진 누적할 것인가? cycle close 직전 결정. **결정 (2026-06-19, M3 plan Task 12)**: 누적 패턴 채택 — M4 별도 milestone redundant. `docs/automation-modernization/integration-template.md`가 §3/§5/§6/§7-9/§10을 모두 담고 있어 별도 milestone에서 추가할 새로운 content 없음. M4 row → status `dropped`.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| native 기능 spec이 cycle 중 바뀜 | 중 | 중 | 각 milestone 시작 시 공식 docs **WebFetch 재확인** 필수, version requirement plan에 명시 |
| receipt schema 부풀음 | 낮음 | 높음 | 각 axis가 schema 건드리지 않는 게 invariant. receipt-validate가 mechanical block |
| 비용 ceiling 충돌 (axis C `/goal` 무한 루프) | 중 | 높음 | turn bound 강제 + `MCCP_AUTO_HANDOFF` 신호 honor + acceptance condition에 timeout clause |
| mccp Stop hook과 `/goal` evaluator 충돌 | 중 | 중 | axis C 진입 전 격리 설계 PRP에서 명세, race 시나리오 enumerate |
| 통합 패턴이 axis마다 divergent | 중 | 중 | M1 ship 후 즉시 template doc 초안, M2/M3는 template 따름. divergence 발생 시 template 갱신 + 후행 axis refactor |
| `/deep-research` WebSearch 의존성으로 환경에 따라 비활성 | 중 | 낮음 | M1 preflight check가 WebSearch 가용성 확인, 미활성 시 안내 후 skip (phantom 안내 금지) |
| version 충돌 (다른 worktree에서 v1.4.0 진행) | 중 | 낮음 | branch 이름엔 working label만, plugin.json bump는 PR ship 시점 main HEAD 기준 결정. 충돌 시 v1.4.1/v1.5.0으로 shift 가능 |

---
*Evidence section composed under user delegation (`claude 판단에 맡김`) — 3개 신호 모두 채택.*
*Audit pass 2026-06-18: frontmatter 제거 (기존 PRD convention 정합), INVARIANT를 Principles 섹션으로 분리, M1/M2 outcome implementation detail 제거 (sandbox·frontmatter→outcome 언어), Open Questions 4→3 (use-ultracode marker syntax는 plan 단계 결정), version race risk 추가.*
