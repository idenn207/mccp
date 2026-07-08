# Plan: Dashboard Interactivity — M3 impeccable 검증 워크플로 강화

**Source PRD**: `.claude/prds/dashboard-interactivity.prd.md`
**Selected Milestone**: M3 — code-review·pr가 critique에 더해 audit까지 돌고, prp-implement가 `/impeccable layout` 선행 + `/impeccable clarify`·`/impeccable distill` 마무리를 따른다
**Complexity**: Small

## Summary

M3은 렌더러가 아닌 **세 게이트 명령 본문(`.md`)**의 impeccable 검증 워크플로를 강화한다. grounding 결과 현재 상태는 PRD 전제보다 앞서 있다 — **pr.md(2.5.1)는 2026-06-03 Sprint 3(`29ded48`)부터 이미 `critique` + `audit` 양쪽을 호출**한다. 실제 gap은 **(1) code-review.md(2.5.2)가 critique 단독**(audit 미호출), **(2) prp-implement에 `/impeccable layout` 선행은 존재하나 `/impeccable clarify`·`/impeccable distill` "마무리"가 부재**, **(3) 세 본문에 강화 워크플로(audit advisory / clarify·distill post-implementation finish)가 명시 framing 안 됨**이다.

**Codex R1 F1(HIGH) 흡수 — clarify·distill 타이밍**: prp-implement의 stage-aware routing(2.5.5b)은 명령 본문 line 173에 따라 **Phase 3 EXECUTE(첫 코드 변경)보다 *먼저* 실행되는 pre-implementation 게이트**다. `clarify`/`distill`은 *produced code를 정리하는 post-implementation cleanup* 명령이므로, routing 테이블에서 callForm을 invoke로 승격하면 **존재하지 않는 코드에 대해 실행**돼 grep/test는 통과하지만 PRD의 "마무리(finish cleanup)" 요구를 놓친다. 따라서 routing oracle을 건드리지 않고, **Phase 3 EXECUTE 이후 신규 post-EXECUTE simplify-finish 단계**에서 produced diff를 대상으로 clarify·distill을 1회 invoke한다(advisory). layout은 기존 pre-implementation 2.5.5b에 그대로(디자인 방향 선도 = 선행). audit 추가는 PRD가 명시한 대로 **code-review·pr 전용**(둘 다 post-implementation review 명령 — 올바른 타이밍); prp-implement은 audit 미언급이라 기존 2.5.5b audit 불변.

## Open Questions 해소 (PRD M3 plan-결정 위임 항목)

PRD Open Question: *"M3 audit가 critique retry loop(§3.9 divergent blocking)과 공존 방식 — audit는 advisory인가 게이트 blocking인가. layout 선행 + clarify·distill 마무리가 prp-implement의 기존 stage-aware routing(§3.10)과 어떻게 합쳐지나(중복 호출 회피)."*

- **audit = advisory (게이트 blocking 아님)** — 세 명령 모두에서. **critique retry loop(§3.9)이 divergent gate-blocking을 단독 소유**한다. audit는 evaluate-stage Skill 호출이지만 findings를 surface만 하고(code-review→Phase 6 REPORT, pr→PR body `## Design Review`, prp-implement→기존 2.5.5b `impeccable_commands_routed` present-only) **게이트를 막지 않는다**. 근거: (i) pr/code-review는 review-only 불변(Edit/Write 없음) — audit는 본질적으로 advisory. (ii) prp-implement audit는 PRD 미언급 + 이미 routing `invoke` present-only(M1 결정 = blocking 미승격). dual-review 불변 + review-only 불변 + critique 단독 blocking 모두 보존. <!--mccp:resolved reason="verified: audit framed advisory in code-review/pr/prp-implement, critique retry-loop is sole blocking" at="2026-07-01T05:17:22.483Z"-->
- **layout 선행 + clarify·distill 마무리는 *타이밍 분리*로 합친다 — routing oracle 단일 메커니즘이 아니라 pre/post 단계 분리(Codex F1 흡수).** layout은 **pre-implementation 2.5.5b routing pass(invoke)** — 구현 전 디자인 방향 선도(선행). clarify·distill은 **post-EXECUTE finish 단계(신규)** — 구현 후 produced diff 정리(마무리). **중복 호출 0**: clarify/distill은 2.5.5b pre-impl pass에서 invoke되지 않고(recommend/deferred — routing oracle 불변) finish 단계에서만 1회 invoke된다. 같은 cycle 내 이중 invoke 구조적 부재(2.5.5b는 deferred-recommend, finish만 invoke). PRD가 가정한 "기존 stage-aware routing에 합침"은 routing이 pre-implementation 게이트라는 사실 때문에 *부분만* 성립 — layout은 routing이 담당, clarify·distill은 routing이 담당 불가(타이밍)하므로 별도 finish 단계가 정답. <!--mccp:resolved reason="verified: layout pre-EXECUTE invoke, clarify/distill/polish invoked only in Phase 3.6, no duplicate" at="2026-07-01T05:17:22.483Z"-->
- **pr.md 전제 stale 정직 기록** — pr.md는 PRD가 가정한 "audit 추가"를 이미 충족(2.5.1 line 310, `29ded48` 2026-06-03). M3의 pr.md 작업은 net-new가 아니라 **검증 + advisory framing 정합**(audit가 advisory임을 본문 명시 + code-review.md와 동형). reviewer가 "pr.md 변경이 왜 minimal인가"를 즉시 이해하게 함. <!--mccp:resolved reason="verified: pr.md 2.5.1 critique+audit since 29ded48, advisory framing present" at="2026-07-01T05:17:22.483Z"-->

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Invoke critique+audit | `pr.md:310` (2.5.1 `\| 1 \| 1 \|` 행) | `Skill(impeccable,"critique …")` AND `Skill(impeccable,"audit …")` 동시 호출 + `## Design Review` inject. code-review.md 2.5.2가 그대로 미러 |
| Reuse-first dedupe | `code-review.md:175` | design signal 시 PR body `## Design Review` 존재하면 재사용(재호출 금지). audit findings도 같은 섹션에서 재사용 |
| Post-impl Skill invoke | `prp-implement.md:405` `Skill(impeccable,"<command> <slug>")` against produced code/diff | post-EXECUTE finish 단계가 같은 invoke 패턴을 *Phase 3 이후* produced diff에 적용(clarify·distill) |
| Design trigger 재사용 | `prp-implement.md:303-337` (SKILL_AVAIL/SIGNAL/DESIGN_INTENT_ACTIVE) + `:382` renderingSurface | finish 단계는 2.5.5b가 산출한 동일 trigger state + post-EXECUTE 재계산 renderingSurface로 gating(신규 detector 0) |
| audit advisory | `code-review.md:183` "code-reviewer gate is **lenient** — warning, not blocking" | audit는 게이트 미차단. critique loop만 blocking — §3.9 |
| critique 소유권 보존 | `prp-implement.md:352` "`critique` is NOT routed here … `design_critique_verdict` blocking is preserved" | clarify·distill·audit·layout은 routing/finish, critique는 retry loop 단독 — 경계 불변 |
| Phase 삽입 컨벤션 | `prp-implement.md:551`(Phase 3) · `:880`(Phase 4) 사이 | 신규 advisory 단계는 Phase 3.6으로 삽입(번호 컨벤션 유지) |
| Version-sync 의무 | M2 plan §3.7 체크리스트 (`dashboard-interactivity-m2.plan.md:81-84`) | plugin.json + footer 2곳(html.js·markdown.js) + i18n-surface.test.js 동기 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/code-review.md` | UPDATE | 2.5.2 decision tree `\| 1 \| 1 \| no \|` 행을 **critique + audit 동시 호출**로(pr.md:310 미러). reuse-first 행은 `## Design Review`의 critique+audit findings 모두 재사용. audit advisory(gate lenient — 기존 명시 유지) |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | (a) 2.5.5b stage-aware routing 섹션에 framing — layout은 pre-implementation 선행(invoke), clarify·distill·polish은 produced code 미존재로 **이 pass에서 invoke 안 함(post-EXECUTE finish로 deferred)**, audit advisory, critique 단독 blocking 명시. (b) **신규 Phase 3.6 — DESIGN FINISH (simplify + polish)**: Phase 3 EXECUTE 이후, design trigger 발화 + renderingSurface(post-EXECUTE 재계산) 시 produced diff 대상 `Skill(impeccable,"clarify <slug>")` + `Skill(impeccable,"distill <slug>")` + `Skill(impeccable,"polish <slug>")` 1회 invoke, advisory → Phase 5 REPORT. routing 코드 블록·critique loop·receipt write(2.5.6) 불변 |
| `plugins/mccp/commands/pr.md` | UPDATE (minimal) | 2.5.1이 이미 critique+audit 호출(`29ded48`). audit가 **advisory(review-only — PR body `## Design Review`에 surface, 게이트 미차단)**임을 1줄 명시 + code-review.md와 framing 정합. 기능/호출 변경 0 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.20 → 1.18.21` (PRD 내 단일 milestone = patch, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot footer `v1.18.20 → v1.18.21` (html.js:1430). §3.7 surface version drift 방지 (렌더 로직 무변경) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 footer `v1.18.20 → v1.18.21` (markdown.js:154). §3.7 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 단언 `v1.18.20 → v1.18.21` (i18n-surface.test.js:123) |

> **명시적 비변경 (Codex F1 흡수)**: `impeccable-routing.js` `STAGE_ROUTING.implement` 테이블은 **불변** — clarify/distill을 pre-implementation pass에서 invoke로 승격하지 않는다(타이밍 오류 회피). 따라서 `tests/impeccable-routing.test.js`도 불변. clarify·distill의 "마무리" 실행은 routing이 아니라 신규 Phase 3.6 finish 단계가 담당.

## Tasks

### Task 1: code-review.md 2.5.2 — audit 추가 (critique+audit, advisory)
- **Action**: 2.5.2 decision tree(`code-review.md:179-184`)에서:
  - `| 1 | 1 | no |` 행: `Invoke Skill(impeccable, "critique PR #<NUMBER>")` → **`Invoke Skill(impeccable, "critique PR #<NUMBER>")` and `Skill(impeccable, "audit PR #<NUMBER>")`**. unknown_skill/not found 시 skipped fallback(기존 유지).
  - reuse-first 행(`| * | 1 | yes |`): `## Design Review` findings 재사용에 **critique + audit 양쪽** 포함 명시(pr.md가 audit를 같은 섹션에 inject하므로 재사용 가능).
  - `**Reuse-first**` 설명문에 audit가 advisory(code-reviewer gate lenient — warning, not blocking)임을 1줄 추가.
- **Mirror**: `pr.md:310` (critique+audit 동시 invoke) + `code-review.md:183` (lenient/advisory 명시)
- **Validate**: `grep -nE 'audit' plugins/mccp/commands/code-review.md`에 2.5.2 audit invoke 라인 존재 + `node --test plugins/mccp/scripts/receipt/` 회귀 0

### Task 2: prp-implement.md 2.5.5b framing — layout 선행 / clarify·distill deferred
- **Action**: 2.5.5b stage-aware routing 섹션(prp-implement.md:350-423) 도입부에 짧은 framing 단락 추가:
  - **layout 선행** — pre-implementation routing pass `invoke`(refine 선두). line 173에 따라 이 게이트는 Phase 3 EXECUTE *이전* 실행 → layout은 구현 전 디자인 방향을 선도.
  - **clarify·distill는 이 pass에서 invoke하지 않음** — produced code가 아직 없으므로(Phase 3 미실행) `recommend`/deferred. 실제 invoke는 Phase 3.6 finish 단계(Task 3). 이로써 동일 cycle 중복 호출 0.
  - **audit advisory** — evaluate stage, findings는 present-only 기록만(게이트 미차단).
  - **critique 단독 blocking** — retry loop(§3.9) 소유(line 352 기존 명시 재확인).
- **Constraint**: routing 코드 블록(line 354-396)·callForm 처리표(line 403-407)·critique loop(line 352) **불변**. framing은 prose only — 새 Skill 호출 코드 추가 금지.
- **Mirror**: `prp-implement.md:352`(critique 경계) + `:173`(phase 순서 명시문)
- **Validate**: `grep -nE 'layout|clarify|distill|선행|deferred' plugins/mccp/commands/prp-implement.md` framing 존재 + H10 em-dash 없음

### Task 3: prp-implement.md — 신규 Phase 3.6 DESIGN FINISH (clarify·distill·polish 마무리)
- **Action**: Phase 3 EXECUTE(line 551~) 종료 후, Phase 4 VALIDATE(line 880) 앞에 **`## Phase 3.6 — DESIGN FINISH: SIMPLIFY + POLISH (v1.18.21, post-EXECUTE, advisory)`** 신규 단계 추가:
  - 게이트: 2.5.5b가 design trigger 발화(SKILL_AVAIL=1 & (SIGNAL=1 OR DESIGN_INTENT_ACTIVE=1))했고 **post-EXECUTE diff에 renderingSurface 존재**(produced 코드 재계산 — tracked `git diff HEAD` ∪ untracked, UI ext/STATUS·status.html)할 때만. 미발화/비표면/`MCCP_IMPECCABLE_ROUTING_MODE=recommend`면 skip(stderr 1줄).
  - 동작: produced diff 대상 `Skill(impeccable, "clarify <slug>")` + `Skill(impeccable, "distill <slug>")` + `Skill(impeccable, "polish <slug>")` 각 1회 invoke. polish는 **순서상 마지막 = 구현 최종 검증**. findings는 **advisory** — Phase 5 REPORT의 `### Design Finish (simplify + polish)` 소제목에 surface. 구현자는 *trivial/안전* cleanup만 같은 cycle에 적용 후 Phase 4 VALIDATE 재통과로 회귀 가드, 큰 정리는 별도 cycle로 defer(audit advisory와 동형).
  - 불변: review-only 아님(prp-implement은 편집 가능 게이트) — 단 적용은 advisory 권고 + 재validate 필수. Skill unknown/not found 시 loud stderr skip(fail-open).
  - **중복 회피 불변**: clarify/distill/polish은 본 finish 단계에서만 invoke; 2.5.5b는 clarify/distill deferred-recommend·polish 미route(Task 2). 두 단계가 같은 명령을 invoke하지 않음을 본문에 명시.
- **post-plan-Codex 확장 (사용자 지시)**: 원안 plan(Codex R1 수렴)은 Phase 3.6 = clarify+distill만이었다. polish는 plan-Codex review *이후* 사용자 지시로 추가 — "polish는 구현 최종 검증인데 어느 게이트에서도 실제 invoke되지 않는다"(implement 테이블 부재 + pr는 review-only라 적용 불가)는 정당한 gap. clarify/distill과 **동일 decision-set**(post-EXECUTE finish가 produced diff에 finishing 명령을 advisory invoke)의 한 명령 추가이므로 cross-gate dedupe envelope 보존 — 신규 아키텍처 결정 아님(routing oracle 불변 유지).
- **Mirror**: `prp-implement.md:405`(produced diff Skill invoke) + `:382`(renderingSurface 재계산 node 블록) + `:409`(advisory recommend prose 톤)
- **Validate**: `grep -nE 'Phase 3.6|clarify|distill|polish|마무리|DESIGN FINISH' plugins/mccp/commands/prp-implement.md` finish 단계 존재 + clarify/distill/polish invoke가 finish 단계에만(2.5.5b 미invoke)

### Task 4: pr.md 2.5.1 — audit advisory framing 정합 (minimal)
- **Action**: pr.md 2.5.1(`pr.md:310`)이 이미 critique+audit 호출함을 확인. `| 1 | 1 |` 행 또는 직후에 audit가 **advisory(review-only — PR body `## Design Review`에 surface, 게이트 미차단; critique chain-check만 Phase 1.6에서 blocking)**임을 1줄 명시. code-review.md(Task 1)·prp-implement.md(Task 2/3)와 framing 동형. 기능/호출 변경 0.
- **Constraint**: 2.5.1 호출 자체·Phase 1.6 chain-check(line 155-201)·a11y-architect(2.5.6c) **불변**.
- **Mirror**: `pr.md:310` + `:323`(advisory/blocking 구분 톤)
- **Validate**: `grep -nE 'audit' plugins/mccp/commands/pr.md` (critique+audit + advisory 명시 라인)

### Task 5: version bump + footer 동기
- **Action**: `plugin.json` `1.18.20 → 1.18.21`. `html.js:1430` page-foot + `markdown.js:154` derived 줄 footer `v1.18.20 → v1.18.21` 동기. `i18n-surface.test.js:123` 단언(테스트명 + assert 본문) 갱신.
- **Mirror**: §3.7 milestone PR 의무 체크리스트(plugin.json + footer 2곳 + 테스트 동기) — M2 plan Task 5 precedent
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 회귀 0 게이트 — receipt + 렌더러(footer) 전 스위트 (routing oracle 불변이므로 routing test도 그대로 green)
node --test plugins/mccp/scripts/receipt/tests/
node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/

# 명령 본문 metric 수동 검증 (PRD Success Metric "본문에 존재")
grep -nE 'audit' plugins/mccp/commands/code-review.md
grep -nE 'audit' plugins/mccp/commands/pr.md
grep -nE 'layout|clarify|distill|선행|마무리|Phase 3.6' plugins/mccp/commands/prp-implement.md
# 중복-invoke 불변 — clarify/distill invoke가 finish(Phase 3.6)에만, 2.5.5b엔 deferred-recommend
```

## Design Critique

본 plan은 디자인 detector positive(`design_signal=true`)다 — `Files to Change`가 renderer 파일(html.js·markdown.js·i18n-surface.test.js)을 참조하기 때문. 다만 **그 변경은 footer version 문자열 `v1.18.20 → v1.18.21` 한 곳뿐**이며 렌더 구조/시각 변화는 0이다. 본 M3은 명령 본문 prose 변경이라 **새 렌더 디자인 surface를 도입하지 않는다**. §3.9 Output Constraints 4축 대조:

1. **정보 위계 3단계** — 신규 heading/surface 도입 0(footer 구조 불변). 해당 없음.
2. **강조색 화면당 1개** — 신규 accent/highlight 토큰 0. 해당 없음.
3. **raw markdown marker 금지** — 신규 렌더 markdown surface 0(footer는 plain version 문자열). 해당 없음.
4. **한 화면 항목 수 상한** — 대시보드에 신규 list-of-N 섹션 0. 해당 없음.

**Critique 결과** (§3.9 retry loop): round 1, verdict **CONVERGED**. R0에서 actionable finding 0(디자인 surface 무도입) → `decideCritique({findings:[]})` = CONVERGED. HIGH/CRITICAL/UNKNOWN 0이므로 escalate 불요. SKILL Output Constraints(SKILL.md:80-99) Read 완료(first-step). 본 M3의 디자인 surface 강화는 *대시보드*가 아니라 *디자인 검증 워크플로 자체*(항목 14 self-apply) — 렌더 산출이 아닌 게이트 명령 본문 대상.

## Design Routing Guide

routing mode: auto (effective at implement stage). 본 M3은 prp-implement에서 실제 stage-aware routing이 발화하지만, plan stage는 렌더 UI 없음 → recommend-only checklist. (본 plan 자체가 그 routing 워크플로를 *수정*하는 메타-변경이라, implement self-apply 시 layout 선행 + Phase 3.6 clarify·distill finish가 발화 대상.)

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **(Codex F1, HIGH)** clarify·distill이 pre-implementation pass에서 invoke돼 produced code 미존재 시 no-op(마무리 미수행) | 중 | routing oracle 승격 폐기 + 신규 Phase 3.6 post-EXECUTE finish 단계가 produced diff 대상 invoke. 2.5.5b는 deferred-recommend — 타이밍 정합 + 중복 0. Task 2/3에 흡수 |
| pr.md 전제 stale(audit 이미 존재) → "M3가 pr.md를 안 건드림" 오해 | 중 | Open Questions + Task 4에 명시(`29ded48` 2026-06-03 since Sprint 3). pr.md는 검증+framing minimal touch — net-new 아님을 투명화 |
| Phase 3.6 finish가 implement 게이트당 Skill 호출 2회 추가(비용) | 중 | renderingSurface gate(control-plane diff엔 미발화) + `MCCP_IMPECCABLE_ROUTING_MODE=recommend` escape. advisory(차단 0) — 부담 시 skip 안전 |
| Phase 3.6 cleanup 적용이 Phase 4 VALIDATE 회귀 유발 | 중 | advisory — trivial/안전 cleanup만 같은 cycle 적용 + Phase 4 재통과 가드, 큰 정리는 별도 cycle defer. audit advisory와 동형 |
| audit를 blocking으로 오해해 dual-review/review-only 불변 약화 | 중 | audit = advisory 명시(Task 1/4) — critique loop만 divergent blocking 단독(§3.9). pr/code-review review-only 유지 |
| footer version drift(plugin.json만 bump) | 중 | Task 5가 §3.7 체크리스트로 footer 2곳 + i18n 테스트 동기. 렌더러 로직 무변경(문자열만) |

## Acceptance

- [ ] code-review.md 2.5.2가 `| 1 | 1 | no |`에서 critique + audit 동시 호출(reuse-first도 양쪽 재사용), audit advisory 명시
- [ ] prp-implement.md 2.5.5b framing — layout 선행(pre-impl invoke), clarify·distill는 이 pass 미invoke(post-EXECUTE deferred), audit advisory, critique 단독 blocking
- [ ] **(Codex F1)** prp-implement.md에 신규 Phase 3.6 post-EXECUTE design-finish가 produced diff 대상 clarify·distill·polish 1회 invoke(advisory→REPORT), clarify/distill/polish invoke는 finish에만(2.5.5b 미invoke) — 중복 0. polish = 구현 최종 검증(post-plan-Codex 사용자 지시 확장, 동일 decision-set)
- [ ] pr.md 2.5.1 audit advisory framing 정합(기능 변경 0, since `29ded48` 명시)
- [ ] audit advisory / critique 단독 blocking 불변 — dual-review + review-only 보존
- [ ] routing oracle(`impeccable-routing.js`) + routing 테스트 **불변** — 전 스위트 `node --test` green(회귀 0)
- [ ] receipt + 렌더러 전 스위트 `node --test` green
- [ ] plugin.json + footer 2곳 version 1.18.21 동기, i18n-surface.test.js 단언 갱신
- [ ] Patterns mirrored, not reinvented(pr.md:310 invoke / produced-diff Skill 패턴 / design trigger 재사용 / §3.7 version-sync — 신규 메커니즘 0)

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, working-tree mode)
- 라운드 수: 1 (R1, `MCCP_GATE_ROUND_CAP` default=1)
- 합치 결론: Codex verdict=`needs-attention` — 1 finding(F1 HIGH, clarify·distill 타이밍). R1에서 plan 변경(routing 승격 폐기 + 신규 Phase 3.6 post-EXECUTE finish 단계)으로 **완전 흡수** → 미해소 ACCEPT_NOW HIGH/CRITICAL 0이므로 R2 미escalate.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 clarify·distill이 pre-execution hook(2.5.5b, Phase 3 EXECUTE 이전 — line 173)에서 승격돼 produced code가 아닌 pre-implementation diff에 작동 → "마무리" cleanup 미수행 + 나중 진짜 post-impl pass가 중복-invoke 문제 재개 | HIGH | ACCEPT_NOW | 정당 — 검증 결과 line 173 "Phase 2.5 … before Phase 3 (EXECUTE — first code change)"로 전제 확인. 원안의 routing 테이블 callForm 승격(recommend→invoke)은 타이밍 오류. 흡수: routing oracle 불변(승격 폐기) + clarify·distill을 **신규 Phase 3.6 post-EXECUTE finish 단계**에서 produced diff 대상 1회 invoke. layout은 pre-impl(선행) 유지. 중복 0(2.5.5b deferred-recommend, finish만 invoke). Summary·Open Questions·Files·Task 2/3·Risks·Acceptance에 흡수 |
- Deferred to backlog: 0 → (없음)
- Open Questions: Codex가 권고한 "command-body assertion(pre-layout vs post-clarify/distill 순서, no-duplicate on rerun)"의 mechanical 테스트는 현 repo에 command-body content 테스트 패턴 부재 → 본 M3는 grep 기반 acceptance + 구조적 불변(clarify/distill invoke가 Phase 3.6에만 출현)으로 가드. 전용 body-lint 테스트 신설은 별도 axis(severity LOW, blocking 아님, backlog 후보)
- Codex session 참조: threadId `019f0bf0-dcd0-75c2-b2f1-52c60e473ceb`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
