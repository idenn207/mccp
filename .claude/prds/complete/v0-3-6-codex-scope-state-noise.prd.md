# mccp v0.3.6 — Pre-v1.0 Housekeeping Bundle

## Problem

v1.0 release 직전, mccp의 marketing narrative ("multi-model dual reviewer" + "mechanical receipt chain enforcement" + "single-entry orchestration")의 핵심에 균열을 내는 운영 결함 3축이 동시에 존재합니다. (1) Codex와 impeccable의 reviewer 권한 경계가 prompt에 implicit이라 두 reviewer가 같은 design 영역을 침범할 때 사용자가 verdict conflict를 중재해야 합니다. (2) STATE.md가 매 Claude 세션마다 timestamp 1–2줄만 다른 채로 `git status`에 dirty로 떠서 실제 변경을 검증하는 워크플로가 무너지고, branch 전환 시 merge conflict까지 발생합니다. (3) `/mccp:work` chain이 `/mccp:pr`에 진입할 때 derive-decision이 generic `default` slug를 반환해 plan/implement receipt의 실제 slug와 매칭 실패 → cross-gate dedupe invariant가 깨지고 사용자가 `--decision <slug>`을 수동 입력해야 자동 chain 가치가 보존됩니다. 셋 중 하나라도 v1.0에 남으면 첫인상이 깨집니다.

## Evidence

- (1) Codex design-domain 발화: **Assumption — needs validation via post-implementation dogfood**. 사용자 (skypark207) memory에 명시 관찰 evidence는 없으나, dual-reviewer 설계상 발화 가능성 명백. v0.3.6 시점에서는 가설로 다루고 implementation 단계에서 reproduction case를 캡처할 것.
- (2) STATE.md 노이즈: **관찰 evidence 있음**. git log에 `chore: STATE.md hook timestamp tick` 2건 (`bf4c993`, `10cd6f2`) — 사용자가 견디다 못해 수동 정리한 흔적. 본 sprint kickoff 직전 세션에서 실제 merge conflict 발생 (timestamp 두 줄만 다른 채로 `UU` flag — sprint commit `b7bba6c` 직전 resolve).
- (3) derive-decision 버그: **STATE.md `Open Questions`에 HIGH 우선순위로 등록**. "derive-decision returns generic default for /mccp:pr mode even with plan-path arg; explicit --decision override required to match plan/implement slugs (v0.2.8 quarantine pressure)" — v0.2.8 cycle부터 carry-over된 known issue.

## Users

- **Primary (1)**: mccp + impeccable 양쪽 plugin을 설치하고 `/mccp:pr`에서 양쪽 review를 받는 사용자. 현재 user = skypark207 본인이 primary instance이지만, v1.0 이후 같은 조합 사용자 모두에게 적용.
- **Primary (2)**: mccp 일상 사용자 전원. 매 Claude 세션 후 `git status`로 작업 진행을 확인하는 모든 워크플로 — Pair-programming handoff, branch 전환, PR commit prep 등.
- **Primary (3)**: `/mccp:work` 또는 `/mccp:pr`을 `--decision <slug>` 명시 override 없이 호출하는 모든 사용자 = 자연스러운 chain 워크플로를 따르는 mccp 사용자 전부.
- **Not for**: 단일 reviewer만 사용하는 사용자 (impeccable 미설치), STATE.md를 git-tracked로 운영하지 않는 사용자 (.gitignore에 추가한 경우 — §3.2 위반이지만 존재), `/mccp:pr` 대신 raw `gh pr create`를 직접 호출하는 사용자.

## Hypothesis

**축 1**: We believe **Codex prompt에 design-domain exclusion instruction + output-level keyword filter** will **PR review에서 Codex의 design-domain finding 충돌**을 **mccp + impeccable 동시 사용자**에게 해결할 것이다. We'll know we're right when **impeccable enabled 환경의 `/mccp:pr` invocation에서 Codex가 emit하는 visual-design 카테고리 finding 수가 0이고, receipt의 `meta.codex_design_scope_excluded=true` + `meta.design_findings_dropped` 카운터가 audit 가능한 형태로 기록**될 때.

**축 2**: We believe **state-writer.js write API에 content-hash skip 추가**가 **매 세션 dirty STATE.md**를 **mccp 일상 사용자 전원**에게 해결할 것이다. We'll know we're right when **timestamp만 다른 STATE.md 변경에 대해 disk write가 발생하지 않아 mtime 미변경 → `git status`가 clean을 유지**할 때.

**축 3**: We believe **derive-decision의 plan-path argument에서 slug 추출 로직**이 **`/mccp:pr` cross-gate dedupe 미발동**을 **`/mccp:work` chain을 따르는 모든 사용자**에게 해결할 것이다. We'll know we're right when **plan-path 인자 제공 시 derive-decision이 plan/implement receipt slug와 일치하는 slug를 반환하고, 양쪽 verdict=approve일 때 PR step Codex 호출이 자동 skip되어 `codex_dedupe_at_pr=true`가 자동 기록**될 때.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| (1) Codex design-domain finding rate (impeccable enabled) | 0 per `/mccp:pr` invocation | receipt `meta.design_findings_dropped` counter — dogfood 3 PR 평균 |
| (1) accessibility finding routing | 100% via impeccable | receipt `meta.a11y_routed_to_impeccable=true` 존재 |
| (2) STATE.md dirty-on-no-content-change rate | 0% | content unchanged 시 `git status --porcelain .claude/state/STATE.md` 빈 출력 (CI test) |
| (2) STATE.md merge-conflict rate | 0 per sprint | sprint 종료까지 conflict 발생 횟수 (인계 시 manual count) |
| (3) `/mccp:pr` cross-gate dedupe hit rate (chain workflow) | ≥95% | plan+implement receipt verdict=approve인 케이스에서 PR receipt `codex_dedupe_at_pr=true` 비율 |
| (3) `--decision` manual override 강제 빈도 | 0 | `/mccp:work` 자동 chain에서 `/mccp:pr`이 `--decision` 없이 호출되어도 dedupe 정상 동작 |

## Scope

**MVP** — 3축 묶음 single sprint. 각 축은 독립적으로 implement + receipt + test 가능. v1.0 cut 전에 3축 모두 ship.

- **(1) Codex/impeccable scope split**:
  - `codex-invoke.js` prompt builder가 impeccable Skill 가용성 detect → system instruction에 design-domain exclusion 리스트 inject (`visual design`, `color`, `typography`, `micro-interaction`, `animation`, `spacing aesthetic`, `brand consistency`)
  - accessibility는 impeccable 양도 — Codex prompt에 "accessibility findings should be routed to impeccable a11y-architect" 명시
  - Codex 응답에 design-domain keyword가 잡힌 finding은 receipt `meta.design_findings_dropped` 카운터에 기록 후 사용자 출력에서 제외
  - receipt schema에 `meta.codex_design_scope_excluded: bool` + `meta.design_findings_dropped: number` + `meta.a11y_routed_to_impeccable: bool` 추가
  - tests: prompt builder가 impeccable 가용 + 미가용 시 다른 prompt를 emit, output filter가 keyword 매칭, receipt schema validator가 새 field 받아들임

- **(2) STATE.md content-hash skip**:
  - `state-writer.js`의 write API에 content-hash compare 추가 — frontmatter `updated_at` / `last_event_at` 제외한 본문 content를 hash → 이전 snapshot과 동일하면 disk write skip
  - hash 알고리즘: sha256 of normalized content (CRLF → LF, trim trailing whitespace)
  - frontmatter의 last_event field가 변경된 경우는 write — last_event는 의미 있는 신호 (예: stop_loop_pass → stop_loop_fail)
  - 사용자가 STATE.md를 직접 편집한 경우 (드물지만) 다음 hook이 정상 write
  - tests: content unchanged 시 mtime 미변경 + `fs.writeFileSync` 미호출, last_event 변경 시 write 정상 동작, frontmatter timestamp만 다를 때 skip

- **(3) derive-decision slug 추출**:
  - `derive-decision.js`의 `/mccp:pr` mode에서 plan-path argument 인지 → filename에서 slug 추출 (`.claude/plans/<slug>.plan.md` → `<slug>`)
  - plan-path 없고 implement receipt만 있는 케이스에서는 implement receipt의 decision_id fallback
  - 둘 다 없을 때만 `default` 반환 (기존 동작 보존 — backward compat)
  - tests: plan-path 인자만 제공 시 slug 추출, implement receipt만 있을 때 fallback, 둘 다 없을 때 default 반환, plan-path가 unusual naming(예: `.plan.md` 확장자 부재)일 때 graceful fail + stderr warn

**Out of scope**
- LLM-based design-domain classifier — keyword + heuristic이 충분. ML classifier는 v1.1+ 검토.
- STATE.md schema version bump — content-hash skip은 schema 변경 없이 가능. schema 변경은 v0.4.0+.
- `/mccp:pr --decision <slug>` argument deprecation — backward compat 유지. derive-decision 개선은 자동 path 정상화일 뿐 manual override는 남김.
- impeccable Skill 자체의 a11y 처리 능력 검증 — Skill이 이미 a11y-architect 호출 경로를 가짐. 본 sprint는 Codex가 a11y 영역을 침범하지 않게 하는 것에 한정.
- Multi-session orchestrator (Idea 3) — v1.1 별도 milestone.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Codex/impeccable scope split | `/mccp:pr` 시 Codex가 design-domain finding을 emit하지 않고 accessibility는 impeccable로 route. receipt에 audit field. | complete | `.claude/plans/v0-3-6-codex-scope-state-noise.plan.md` |
| 2 | STATE.md content-hash skip | `git status`가 timestamp-only 변경에서 clean 유지. merge conflict 재발 0건. | complete | `.claude/plans/v0-3-6-codex-scope-state-noise.plan.md` |
| 3 | derive-decision slug extraction (정정: branch normalize + plan-path fallback) | `/mccp:work` 자동 chain에서 `/mccp:pr` cross-gate dedupe가 `--decision` override 없이 정상 발동. plan에서 진단 정정 — 실제 원인은 `slugFromBranch` dot/underscore normalize 부재. | complete | `.claude/plans/v0-3-6-codex-scope-state-noise.plan.md` |
| 4 | v1.0 release prep | 3축 ship 후 plugin.json 1.0.0 bump + README v1.0 narrative + CLAUDE.md §1.4 v0.3.6 + v1.0 ship row + 6주 burn-in 시작. | deferred to v0.3.7/v1.0 cycle | — |

## Open Questions

- [ ] **사용자 draft answer 검증 — 본 PRD는 사용자가 "Draft 답 그대로 채택" option을 선택해 derive된 content입니다. 사용자가 PRD 본문을 한 번 읽고 Problem / Users / Hypothesis 중 보정할 부분이 있는지 plan 단계 진입 전 확인 필요. plan-codex gate가 PRD를 input으로 받을 때 이 항목이 unchecked면 plan-codex에서 명시 caveat.**
- [ ] (축 1) accessibility를 impeccable에 양도하는 것의 boundary가 어디까지인지 — WCAG color contrast (design overlap), ARIA semantics (code overlap), keyboard navigation (code overlap) 각각 어디로? 본 sprint는 "Codex가 a11y 영역을 침범하지 않게"에만 집중하고 boundary 정의는 plan 단계에서 명확화.
- [ ] (축 2) frontmatter의 어떤 field가 "의미 있는 변경"인지 enumerate 필요 — `last_event`, `last_event_at`, `unsafe_checkpoint`, `confirm_required`, `session_end_imminent`, `chain_aborted`, `dep_check_at`, `dep_check_missing` 중 hash에 포함할 것 vs 제외할 것. `updated_at`은 명백히 제외, 나머지는 plan 단계 결정.
- [ ] (축 3) derive-decision이 plan-path 외에 PRD-path도 fallback 인식할지 — `/mccp:work` chain에서 PRD → plan → implement 순서이므로 PRD slug == plan slug == implement slug 가정 가능하지만 사용자가 plan을 수동 rename한 케이스 처리 필요.
- [ ] sprint 묶음 vs 분리: 3축을 하나의 PR로 ship할지, 축당 PR을 분리할지 — plan 단계에서 task 의존성 그래프 그린 후 결정.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| (1) Codex가 design exclusion instruction을 무시하고 발화 (LLM noncompliance) | Medium | Medium | output-level keyword filter가 backstop. receipt audit으로 noncompliance rate 추적. |
| (1) keyword filter가 valid finding을 false-positive로 drop | Low | High | dropped finding 전수를 receipt에 stash → 사용자가 audit 가능. dogfood 3 PR 후 keyword 리스트 tune. |
| (2) content-hash skip이 의도된 cosmetic refresh를 막음 (드문 케이스) | Low | Low | `last_event` 변경 시 write 강제. 사용자가 raw refresh가 필요하면 `state-writer.js --force` flag 제공 (별도 task). |
| (2) hash 계산이 STATE.md write hot path의 성능을 저하 | Low | Low | sha256은 ms 단위. STATE.md 크기 < 10KB. negligible. 성능 회귀 test로 monitoring. |
| (3) plan-path slug 추출이 unusual naming에서 fail (예: `.plan.md` 확장자 부재) | Low | Medium | fallback to current generic default + stderr warn. backward compat 보장. |
| (3) implement receipt fallback이 stale slug 반환 (이전 sprint 잔재) | Low | High | receipt mtime + decision_id 비교로 staleness 검출. plan 단계에서 staleness threshold 정의. |
| (overall) 3축을 하나의 PR로 묶으면 review 부담 | Medium | Low | plan 단계에서 PR 분리 가능 — task 의존성이 약하므로. |
| (overall) v1.0 release 일정 지연 | Medium | Medium | 각 축이 독립 implement 가능하므로 일부만 v0.3.6에 들어가고 나머지는 v0.3.7로 split 가능. |

## Design Direction

> impeccable unavailable, skipped (auto-fallback): skill-missing

Sprint scope이 backend/tooling 영역(codex-invoke prompt builder, state-writer write API, derive-decision argument parsing)만 다루며 design surface signal 없음. impeccable plugin은 본 환경에서 미설치 — design direction sub-step은 정상 skip. 축 (1) Codex/impeccable scope split이 design 영역의 *권한 경계*를 다루지만 design *작업 자체*가 아님 → 본 sprint 본문에 design direction 불필요.

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-10 — user selected "Draft 답 그대로 채택" option, confirming derived content from sprint scope description. User review of Problem / Users / Hypothesis sections recommended before plan-codex gate (see Open Questions item #1).*
