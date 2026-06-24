# Plan: Stage-Aware impeccable Command Routing (M2)

**Source PRD**: .claude/prds/impeccable-command-routing.prd.md
**Selected Milestone**: M2 — Extended Refine/Simplify 카탈로그 + content 기반 선별 휴리스틱
**Complexity**: Medium

## Summary
M1이 출고한 stage-aware routing oracle(`impeccable-routing.js`)에 Extended Refine/Simplify/Harden 카탈로그 10개 명령(animate/colorize/bolder/quieter/overdrive/distill/clarify/adapt/optimize/onboard)을 추가한다. 단순 테이블 확장에 그치지 않고, PRD Risk #1 + Open Question("auto mode에서 매번 전부 호출하면 비용 부담 — M2에서 선별?")이 명시적으로 M2 scope로 지정한 **content 기반 선별 휴리스틱**을 함께 출고한다: content-detectable 명령(animate←motion, colorize←color, typeset←typography, adapt←responsive)은 diff signal이 있을 때만 invoke로 라우팅되고, mood/direction 명령(bolder/quieter/overdrive/delight)은 diff로 감지 불가하므로 recommend-only base로 고정한다. 선별은 backward-compatible — diffSignals 미제공 시 M1 동작(전부 라우팅) 보존.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Pure oracle 확장 | `plugins/mccp/scripts/lib/impeccable-routing.js:42` | `STAGE_ROUTING` frozen 테이블 + `resolveCallForm` downgrade-only 변환 |
| 선별 함수 순수성 | `plugins/mccp/scripts/lib/impeccable-routing.js:74` | enum 입력 + side-effect 없는 결정 함수 |
| Diff signal 추출 | `plugins/mccp/commands/prp-implement.md:360` | `git diff --name-only` → node 정규식 분류(renderingSurface 패턴) |
| Receipt 무변경 | `plugins/mccp/scripts/receipt/schema.js:568` | `command`은 임의 non-empty string — 신규 명령 schema 변경 불필요 |
| Tests | `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | `node --test` + 명시적 입력/enum 단언 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-routing.js` | UPDATE | STAGE_ROUTING에 신규 명령 + 명령별 `signal` 필드 + `selectByDiffSignals` + `routeCommands`에 `diffSignals` 입력 |
| `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | UPDATE | 신규 케이스 — content 선별, mood recommend-only base, Simplify 단계, backward-compat(diffSignals 미제공) |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | routing 단계에서 diff content signal 추출 → `routeCommands`에 `diffSignals` forward |
| `plugins/mccp/commands/plan.md` | UPDATE | `## Design Routing Guide` 표에 신규 단계/명령 행 추가(recommend-only) |
| `plugins/mccp/commands/plan-prd.md` | UPDATE | plan.md mirror — guide 표 확장 |
| `plugins/mccp/commands/pr.md` | UPDATE | harden 단계 recommend 줄에 optimize/onboard 추가(review-only 유지) |
| `CLAUDE.md` | UPDATE | §3.10에 M2 카탈로그 표 + content 선별 휴리스틱 서브섹션 |
| `CHANGELOG.md` | UPDATE | [Unreleased]/v1.13.0 M2 행 추가 |

> plugin.json version은 M2에서 건드리지 않는다 — v1.13.0 feature를 M1/M2/M3로 누적 빌드 중이며, main이 이미 1.15.0을 ship했으므로 최종 forward-only 버전(≥1.16.0)은 PR #55 conflict 해소(merge) 단계에서 일괄 reconcile한다(중복 conflict 회피).

## Tasks

### Task 1: oracle 카탈로그 + 선별 확장 (`impeccable-routing.js`)
- **Action**:
  - `STAGE_ROUTING.implement`에 신규 entry 추가(순서: discovery→refine→simplify→evaluate):
    - Refine content: `animate`(signal:`motion`, callForm:`invoke`), `colorize`(signal:`color`, callForm:`invoke`). 기존 `typeset`에 `signal:'typography'` 부여, `layout`은 signal 없음(구조적 — 항상 관련).
    - Refine mood: `bolder`, `quieter`, `overdrive`, `delight` — callForm base `recommend`(diff로 감지 불가한 direction 명령. resolveCallForm downgrade-only라 어떤 모드에서도 invoke로 승격 안 됨).
    - Simplify(신규 stage): `adapt`(signal:`responsive`, callForm:`invoke`), `distill`(callForm:`recommend`), `clarify`(callForm:`recommend`).
  - `STAGE_ROUTING.pr`에 `optimize`(harden stage, recommend), `onboard`(harden stage, recommend) 추가 — pr은 전부 recommend(review-only 불변식).
  - `PLAN_GUIDE`(plan/prd)에 신규 명령 행을 recommend로 추가(전부 guide-only).
  - 신규 pure 함수 `selectByDiffSignals(commands, diffSignals)`: **positive-presence narrowing 의미론(Codex R1 F1+F2)** — `diffSignals`가 object일 때, `entry.signal`이 있고 `diffSignals[entry.signal] !== true`이면 callForm을 `recommend`로 강등. `diffSignals`가 `undefined`/`null`이면 무변경(backward-compat, M1 fail-open). **caller 계약(Task 3): rendered surface가 있는데 신호가 하나도 안 잡히면(추출 불완전/Tailwind·CSS-in-JS 미커버 가능) all-false object를 forward하지 말고 `diffSignals`를 omit해 fail-open** — "부재로 강등"이 아니라 "positive 증거가 있을 때만 narrow". evaluate 명령(audit)은 signal 없으니 영향 없음.
  - 신규 mood-intent 입력(Codex R1 F3): `routeCommands`에 `opts.intentCommands`(string[]) 추가. mood 명령은 base `recommend`로 유지하되, `auto` 모드 + `renderingSurface===true` + `designIntentActive===true` + `command ∈ intentCommands`이면 해당 mood 명령만 `invoke`로 승격. intentCommands 미제공/조건 미충족이면 recommend-only(기존). 이는 downgrade-only 불변식의 유일한 예외 — audited intent로만 열리고, 그 외 경로에서는 절대 mood 명령이 invoke되지 않음(테스트로 양면 고정).
  - `routeCommands(opts)`에 `opts.diffSignals` 입력 추가 — `auto` 모드 + skipped=false일 때만 `selectByDiffSignals` 적용(hybrid/recommend는 이미 강등 처리되므로 무관). 적용 순서: `resolveCallForm`(mode/renderingSurface) → intent 승격(mood) → `selectByDiffSignals`(content narrow). 
  - export에 `selectByDiffSignals` 추가.
- **Mirror**: `resolveCallForm` downgrade-only 불변식(:74) — 선별은 절대 invoke로 승격 안 함. 유일한 upgrade 경로는 audited intent(F3)이며 4중 AND 가드(auto+renderingSurface+designIntentActive+intentCommands membership).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js`

### Task 2: oracle 테스트 확장
- **Action**: 신규 케이스 —
  - (i) auto/implement + diffSignals={motion:true} → animate=invoke, colorize=recommend(강등), layout=invoke(unconditional), typeset=recommend(typography 없음).
  - (j) auto/implement + diffSignals 미제공 → M1 backward-compat: content 명령 전부 base callForm 유지(강등 없음).
  - (k) mood 명령(bolder/quieter/overdrive/delight)은 어떤 모드/signal에서도 `recommend`(invoke 승격 불가).
  - (l) Simplify: adapt + diffSignals={responsive:true} → invoke / responsive 없으면 recommend. distill/clarify는 항상 recommend.
  - (m) pr gate → optimize/onboard 포함 전부 recommend(어느 모드든 invoke 0).
  - (n) hybrid/implement → evaluate(audit)만 invoke, 신규 content/mood/simplify 전부 recommend.
  - (o) **F3 intent 승격**: auto + renderingSurface=true + designIntentActive=true + intentCommands=['bolder'] → bolder=invoke, 나머지 mood(quieter/overdrive/delight)=recommend. **(o2) 비-승격 고정**: 같은 intentCommands라도 designIntentActive=false면 bolder=recommend / renderingSurface=false면 recommend / mode≠auto면 recommend (4중 가드 각각 단독 차단 단언).
  - (p) **F1/F2 fail-open**: selectByDiffSignals(commands, undefined) → 무변경(전부 base 유지). selectByDiffSignals(commands, {color:true}) → colorize 유지, animate/typeset/adapt 강등(positive-presence narrow).
- **Mirror**: 기존 테스트 단언 스타일.
- **Validate**: 테스트 통과 + 기존 M1 케이스 회귀 PASS.

### Task 3: prp-implement.md diff-signal forward (Codex R1 F1+F2 absorption)
- **Action**: `#### Stage-aware command routing` 블록(:354)에서 `RENDERING_SURFACE` 추출 직후 diff content signal 추출 추가. **순수 추출 로직은 oracle 옆 신규 pure helper `extractDiffSignals(text)`로 분리**(테스트 가능성 + prp-implement.md inline node 최소화):
  - **(F1) untracked 포함**: 신호 입력은 `git diff HEAD`(tracked 변경) **+ `git ls-files --others --exclude-standard`로 나온 rendered-surface untracked 파일의 bounded content**(파일당 상한, UI ext/cache surface만)를 합쳐 추출. greenfield 새 `.tsx`/`.css`도 신호에 반영.
  - **(F2) 확장 정규식** — CSS property + Tailwind utility class + CSS-in-JS camelCase를 모두 커버:
    - motion: `@keyframes|animation[:-]|transition[:-]|transform[:-]|cubic-bezier|\b(motion|translate|scale|rotate|duration|ease)-|\b(animate|transition|duration|delay)\b`
    - color: `oklch\(|hsl\(|rgb\(|#[0-9a-fA-F]{3,8}\b|--[\w-]*colou?r|background-?[Cc]olor|\bcolor:|\b(bg|text|border|fill|stroke|ring)-[a-z]|backgroundColor`
    - typography: `font[-A-Z]|line-?[Hh]eight|letter-?[Ss]pacing|text-(align|transform|decoration|xs|sm|base|lg|xl)|\b(leading|tracking|font)-|fontSize|fontWeight`
    - responsive: `@media|min-width|max-width|\b(sm|md|lg|xl|2xl):|breakpoint|i18n|locale|dir=|\brtl\b|useMediaQuery`
  - **(F1+F2) fail-open 계약**: `RENDERING_SURFACE=1`인데 `extractDiffSignals`가 **신호를 하나도 못 잡으면**(추출 불완전 / 미커버 패턴 가능성) `DIFF_SIGNALS_JSON`을 **omit**(빈/누락)하고 `routeCommands`에 `diffSignals`를 넘기지 않음 → oracle은 M1 fail-open(content 명령 전부 base 유지). all-false object는 **절대 forward 금지**. 신호가 ≥1 잡힌 경우에만 `diffSignals: <parsed>` 전달.
  - `routeCommands(...)` 호출에 위 조건부 `diffSignals` + `intentCommands`(audited intent 활성 시 `MCCP_IMPECCABLE_INTENT_COMMANDS` 파싱값) 추가.
  - stderr 라인에 선별/fail-open 여부 반영.
- **Mirror**: `RENDERING_SURFACE` 추출 패턴(:360) — 동일 `git diff` + node helper. `extractDiffSignals`는 `impeccable-routing.js` 또는 인접 lib에 두고 단위 테스트.
- **Note**: critique은 여전히 routing 리스트에서 제외(Plan-Codex M1 F2 불변식 — 기존 retry loop 전용). diff-signal은 selection만 좌우, critique blocking 무관.
- **Validate**: (a) `extractDiffSignals` 단위 테스트 — CSS-prop diff, Tailwind utility diff, CSS-in-JS camelCase diff 각각에서 올바른 signal set. (b) rendered surface인데 신호 0 → diffSignals omit(fail-open) 단언. (c) prp-implement.md 수동 검증 — motion-only diff 시 animate invoke / colorize recommend, untracked 새 .css도 신호 반영. receipt `impeccable_commands_routed[]`에 강등/fail-open outcome 정직 기록.

### Task 4: plan/plan-prd guide + pr recommend 확장
- **Action**:
  - plan.md / plan-prd.md `## Design Routing Guide` 표에 신규 단계 행(Refine: animate/colorize/bolder/quieter/overdrive · Simplify: adapt/distill/clarify · Harden: optimize/onboard) 추가 — 전부 recommend-only(plan/prd는 렌더 surface 없음).
  - pr.md harden recommend 줄에 optimize/onboard 추가. review-only 불변식 유지(Edit/Write invoke 없음 — stderr + 비-mutating PR body note만).
- **Mirror**: M1 guide 행 + pr.md recommend 줄.
- **Validate**: plan 생성 시 확장 guide 표 출현 / pr 생성 시 optimize/onboard recommend 줄 확인.

### Task 5: 문서
- **Action**: CLAUDE.md §3.10에 (a) M2 확장 카탈로그 표(단계→명령→callForm base), (b) content 선별 휴리스틱 서브섹션(positive-presence narrow + untracked 포함 + zero-signal fail-open + Tailwind/CSS-in-JS 커버 + mood recommend-only 근거), (c) §4 운영 토글에 `MCCP_IMPECCABLE_INTENT_COMMANDS="bolder,quieter,..."`(audited intent 활성 시에만 해당 mood 명령 invoke 승격, 4중 가드) 추가. CHANGELOG M2 행.
- **Validate**: §3.10에 M2 표 + 선별 서브섹션 + intent env 존재 확인.

## Validation
```bash
cd "C:/_project/my/my-claude-code-plugin/.worktrees/v1.13.0-impeccable-command-routing"
node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js
node --test plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js
node --test plugins/mccp/scripts/receipt/tests/schema.test.js
# 전체 lib 회귀
node --test plugins/mccp/scripts/lib/tests/*.test.js 2>&1 | tail -15
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 선별이 잘못 강등해 관련 명령을 놓침 | Medium | diffSignals 미제공 시 강등 0(backward-compat) + 강등은 outcome에 정직 기록(loud fail-open). 정규식 false-negative는 recommend로 안전 강등(invoke 누락이지 잘못된 invoke 아님) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| 신규 명령이 unknown-skill(미설치 카탈로그) | Medium | M1 unknown-skill 폴백 경로 그대로 — status='unknown-skill' 정직 기록, 게이트 blocking 승격 안 함 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| mood 명령을 recommend-only로 고정해 auto 가치 약화 | Low | direction 명령은 본질적으로 사용자 의도 — diff 감지 불가. M3에서 explicit intent env 검토(Open Question) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| diffSignals 정규식이 무관 매치(false-positive)로 과호출 | Low | 과호출은 비용↑이나 정확성 손상 없음. auto 기본 + renderingSurface=false면 어차피 강등 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| 신규 schema 필드 필요 오해 | Low | schema `command` open string 확인됨(:568) — 변경 불필요 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance
- [ ] oracle 카탈로그 확장 + `selectByDiffSignals` + diffSignals 입력 (Task 1)
- [ ] 테스트 신규 6케이스 + M1 회귀 PASS (Task 2)
- [ ] prp-implement diff-signal 추출 + forward (Task 3)
- [ ] plan/plan-prd guide + pr recommend 확장 (Task 4)
- [ ] CLAUDE.md §3.10 M2 + CHANGELOG (Task 5)
- [ ] 전체 lib 테스트 회귀 PASS
- [ ] Patterns mirrored, not reinvented (선별도 downgrade-only)

## Design Critique

> impeccable silent-skip (reason=no-signal): M2 plan은 routing oracle(JS) + command-body(MD) + 문서만 변경하고 렌더링 design surface(.tsx/.css/.html/STATUS·status.html 출력)를 도입하지 않음. design_signal=0, critique loop 미실행. receipt에 silent_skip 정보성 기록.

## Codex Adversarial Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · `--impeccable-available` (design-scope preamble)
- 라운드 수: 1 (cap=1; R1 absorption이 HIGH F1을 plan 내에서 완결 → R2 미escalate)
- 합치 결론: wrapper classification=`ok` (blocking=false) — 게이트 통과. 내부 verdict=`needs-attention`, 3 findings 전부 plan에 absorb.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 diff-signal이 untracked 새 UI 파일 누락 → all-false forward로 잘못 강등 | HIGH | ACCEPT_NOW | Task 3 재작성 — `git ls-files --others --exclude-standard`로 untracked rendered-surface 포함 + rendered surface인데 신호 0이면 diffSignals omit(fail-open). all-false forward 금지 |
  | F2 정규식이 Tailwind utility/CSS-in-JS camelCase 미커버 | MEDIUM | ACCEPT_NOW | Task 3 정규식 확장(`md:`/`bg-primary`/`transition-all`/`fontSize` 등) + zero-match fail-open(부재로 강등 금지, positive-presence narrow). 대표 fixture 단위 테스트(Task 2 p) |
  | F3 mood 명령 recommend-only가 audited intent 무시 | MEDIUM | ACCEPT_NOW | `intentCommands` oracle 입력 + `MCCP_IMPECCABLE_INTENT_COMMANDS` env. mood 기본 recommend, `auto+renderingSurface+designIntentActive+membership` 4중 AND에서만 invoke 승격. 비-승격 양면 테스트(Task 2 o/o2) |
- Deferred to backlog: 0 (3건 전부 R1 absorb)
- Open Questions: 없음 (selector 의미론을 "부재 강등"→"positive-presence narrow + fail-open"으로 전환해 under-routing 위험 해소)
- Codex session 참조: threadId 019ef015-99fa-7202-a272-ce9505b274ac

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper, v0.2.2) · `--impeccable-available`
- 라운드 수: 1 (cap=1; HIGH [0]은 M2-제어 범위 내 완결 + detector gap 문서화 → R2 미escalate)
- 합치 결론: wrapper classification=`ok` (blocking=false) — 게이트 통과. 내부 verdict=`needs-attention`, 2 findings absorb.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | [0] untracked greenfield UI가 trigger + renderingSurface 게이트 우회 | HIGH | ACCEPT_NOW | prp-implement.md를 tracked+untracked rendered-surface 단일 셋으로 재작성 — RENDERING_SURFACE + extractDiffSignals 일관 도출. detector `design_signal`의 untracked gap은 `MCCP_DESIGN_INTENT_REASON`(axis c) escape로 문서화(detector scan 확장은 별도 axis) |
  | [1] routeCommands 반환이 내부 `signal` 메타 노출 | MEDIUM | ACCEPT_NOW | 반환 직전 `signal` strip → public schema `{command, stage, callForm}` 안정화. selectByDiffSignals는 내부 signal-aware helper로 유지. exact-key 안정성 테스트 추가 |
- Deferred to backlog: 0
- Open Questions: detector untracked-scan 확장(MEDIUM, 별도 detector axis — 본 M2 blocking 아님; designIntentActive escape로 우회 가능)
- Codex session 참조: implement-review needs-attention, 2 findings R1-absorbed

### Design Review

- 트리거: implement mode detect → SKILL_AVAIL=1, SIGNAL=0 (silent-skip). M2 diff는 routing oracle(JS) + command-body(MD) + 문서 — 렌더링 design surface 0.
- verdict: silent-skip(observational) — critique loop 미실행, receipt에 silent_skip 정보성 기록.
