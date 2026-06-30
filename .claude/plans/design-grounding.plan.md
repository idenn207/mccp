# Plan: impeccable design grounding 강화 (advisory → mechanical)

**Source**: free-form `/mccp:plan` 입력 (새 독립 patch axis — design-grounding)
**Worktree**: `.worktrees/design-grounding/` (branch `design-grounding`)
**채택 해석**: A (grounding 강화) — `[[feedback-impeccable-full-delegation]]` 근거
**Complexity**: Medium

## Summary

impeccable의 디자인 방향이 실제 produced diff에 반영됐는지 검증하는 mechanical 단계를 추가한다. 현행 `prp-implement`는 Phase 2.5.5b에서 `layout` invoke + critique loop로 **EXECUTE 이전**에 디자인 방향을 grounding하지만, critique은 plan/방향만 보고 produced diff는 절대 보지 못한다(critique이 EXECUTE보다 먼저 돈다). "신규 LLM 호출 금지" 제약상 critique을 post-EXECUTE 재실행할 수 없으므로, **방향 캡처 아티팩트 → EXECUTE 소비 → 결정적(LLM-free) grounding lint**의 3-step으로 그 gap을 mechanical하게 닫는다. critique의 divergent-block(§3.9)은 그대로 두고 그 위에 post-produce mechanical 게이트를 얹는다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Pure lint lib | `plugins/mccp/scripts/lib/renderer/output-constraints.js:510-535` | `runOutputConstraints({css,html,md}) → {violations, details}` 순수 함수 + `RULES[]` 반복. I/O 없음, rule throw 시 loud-fail-open(stderr WARN + allow). |
| Pure decision oracle | `plugins/mccp/scripts/lib/design-critique-decide.js:40-49` | `decideCritique({findings,round,cap}) → enum` 순수 함수 + `parseRetryCap(env)` 0~3 default 2. UMD 노출, node native test. |
| Diff signal classifier | `plugins/mccp/scripts/lib/impeccable-routing.js:142-156` | `extractDiffSignals(text) → {motion,color,typography,responsive}` 정규식 분류기(CSS prop + Tailwind + CSS-in-JS). 기존 인프라 재사용 대상. |
| 게이트 토글 enum | `design-critique-decide.js:25-30` (`MCCP_DESIGN_CRITIQUE_MAX_RETRY`) | env parse → 검증 → default fallback. kill-switch는 loud stderr warn. |
| Receipt present-only meta | `plugins/mccp/scripts/receipt/schema.js:247-262`, `write.js` design_critique_* 블록 | `args['flag-name']` → 타입/enum 검증 → null default. additionalProperties 미차단(permissive) → migration 불필요. |
| Receipt CLI 플래그 | `plugins/mccp/scripts/receipt/cli.js:21` (usage), `:40-68` (parseFlags) | kebab-case 플래그 → `args['...']` 추출. WRITE_FLAGS bash array 누적 패턴(prp-implement 2.5.6). |
| node native test | `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js`, `lib/tests/design-critique-decide.test.js` | `require` + `node:test`/`node:assert`, 순수 함수 직접 호출, fixture 인라인. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | 룰 반복 루프를 `runRules(input, rules)`로 추출하고 `runOutputConstraints`는 `runRules(input, RULES)` 위임으로 단순화. source-diff-안전 anchor 서브셋 ID(`GROUNDING_RULE_IDS = ['H15','H17']`) export. 기존 동작/대시보드 lint 완전 보존(behavior-preserving refactor). |
| `plugins/mccp/scripts/lib/design-grounding.js` | CREATE | 신규 순수 lib — `captureDirection()` / `readDirection()` / `extractRenderedSurfaceFromDiff()` / `lintProducedDiff()` / `decideGrounding()` / `parseGroundingMode()`. output-constraints `runRules`+서브셋과 impeccable-routing `extractDiffSignals` 재사용. 신규 LLM 호출 0. |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | (a) Phase 2.5.5b 라우팅/critique 직후 방향 캡처 호출 + `--design-grounding-captured` forward, (b) Phase 3 EXECUTE per-task 루프 시작에 "Design Grounding Constraints" 컨텍스트 블록 Read+소비, (c) 신규 **Phase 3.6 — DESIGN GROUNDING VERIFY**(post-EXECUTE, pre-Phase4) lint 게이트 + 위반 시 fix-task + bounded retry, (d) Phase 5 REPORT에 grounding verdict surface. |
| `plugins/mccp/skills/frontend-design-direction/SKILL.md` | UPDATE | `## Output Constraints` 하단에 "M3 lint가 produced diff(rendered-surface added lines)에도 H15/H17 anchor를 정적 적용" 1~2줄 명문화(현행 84-85줄은 "rendered surface"만 언급). DESIGN_SURFACE_PATHS hit → self-apply 대상. |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.design_grounding_captured`(boolean, default false) 검증 블록 + skeleton default 추가. (post-EXECUTE verdict는 receipt가 아니라 구현 report에 — 아래 시퀀싱 Risk 참조.) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `design_grounding_captured: args['design-grounding-captured'] === true` 파싱 블록 추가(design_critique 블록 옆). |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | write usage 문자열(line 21)에 `[--design-grounding-captured]` 추가. |
| `plugins/mccp/scripts/lib/tests/design-grounding.test.js` | CREATE | capture/read round-trip, diff 추출(rendered-surface 분류), lint verdict(verified/violations/skipped), kill-switch(off/warn/enforce), 비-rendered diff no-op, fail-open. |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE | `runRules`/`GROUNDING_RULE_IDS` export 회귀 단언(기존 54 test 무변경 보증 + 서브셋 실행 동등성). |
| `plugins/mccp/scripts/receipt/tests/` (해당 schema/write test) | UPDATE | `design_grounding_captured` 플래그 round-trip + 검증 단언. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.20 → 1.18.21` (patch — 단일 axis, §3.7). |
| `CHANGELOG.md` | UPDATE | `[1.18.21]` row 추가. |
| `plugins/mccp/scripts/lib/renderer/html.js` + `markdown.js` footer | UPDATE | user-visible footer version `1.18.21` 동기화(§3.7 drift 방지). 구현 시 현재 footer 값 확인 후 정합. |

## Tasks

### Task 1: output-constraints.js — behavior-preserving 룰 서브셋 추출
- **Action**: `runOutputConstraints(input)` 본문의 룰 반복(`for (const rule of RULES) {...}`)을 `runRules(input, rules)` 헬퍼로 추출. `runOutputConstraints = (input) => runRules({css,html,md}, RULES)`. module.exports에 `runRules`, `GROUNDING_RULE_IDS=['H15','H17']`(source-diff 안전 anchor — heading depth, nested-card no-op-safe), `GROUNDING_RULES = RULES.filter(r => GROUNDING_RULE_IDS.includes(r.id))` 추가.
- **Mirror**: `output-constraints.js:510-535` 기존 루프(loud-fail-open try/catch 유지).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` — 기존 54 test green + `runOutputConstraints` ≡ `runRules(input, RULES)` 동등성.
- **불변**: H16(raw marker)/H9·H11(accent)는 source diff false-positive 위험 → grounding 서브셋에서 **제외**(verify는 advisory warn 채널로만 사용, §Risk).

### Task 2: design-grounding.js — capture/read + produced-diff lint
- **Action**: 신규 순수 lib.
  - `captureDirection({slug, direction, routedCommands, critiqueVerdict, requiredSignals})` → **worktree-safe 경로**에 작성: caller가 `git rev-parse --git-path mccp/tmp/design-direction--<slug>.json`로 per-worktree gitdir 경로를 해소해 넘긴다(`.git/` hardcode 금지 — **Codex F1 흡수**: worktree에서 `.git`는 파일이라 `.git/mccp/tmp`가 깨짐, 본 plan 작성 중 실제 재현됨). stable slug 경로(`$$` 금지, 2.5.5b↔Phase3 별도 bash 호출 간 안정). 4 Output Constraints 체크리스트(SKILL.md anchor) + 캡처된 방향 요약 + routed commands + critique verdict + **`requiredSignals`(direction이 명시한 machine-checkable 필수 dimension: motion/color/typography/responsive 부분집합)** 포함. 반환: 경로.
  - `readDirection(path)` → 객체 or null(fail-open). caller가 git-path 해소 경로 전달.
  - `extractRenderedSurfaceFromDiff(diffText)` → unified diff의 **added line(`+`)** 만 파싱, rendered-surface 파일(UI 확장자 `\.(tsx|jsx|vue|svelte|astro|css|scss|html|md)$`)만 추려 `{css, html, md}` 버킷으로 분류. 비-rendered diff면 빈 버킷.
  - `lintProducedDiff({diffText, direction, mode})` → 버킷 추출 → `runRules(buckets, GROUNDING_RULES)` 실행(H15/H17) + `extractDiffSignals(addedText)`로 signal-consistency 계산(캡처된 `requiredSignals` 중 diff에 부재한 dimension 집합) → `{verdict, blockingViolations, missingRequiredSignals, advisories, details}`.
  - `decideGrounding({blockingViolations, missingRequiredSignals, hasRenderedDiff, mode})` → **verdict enum 5종(Codex F4 흡수)**: `mode='off'` → `skipped`; `blockingViolations>0 && mode='enforce'` → `violations`(block); `mode='enforce' && hasRenderedDiff && missingRequiredSignals.length>0` → `inconclusive`(block — 캡처된 방향이 요구한 machine-checkable signal이 produced diff에 부재); blockingViolations·missingRequiredSignals 모두 0 + requiredSignals이 실제 충족됨 → `grounded`; anchor만 clean하고 requiredSignals 없음/검증불가 → `anchor_clean`. warn 모드는 violations/missing 있어도 block 안 하되 advisories + verdict는 `inconclusive`/`anchor_clean`로 정직히 기록(silent 'verified' 금지 — F4 핵심).
  - `parseGroundingMode(env)` → `MCCP_DESIGN_GROUNDING ∈ {off,warn,enforce}` default `enforce`, 오타/미설정 → enforce(loud warn).
- **Mirror**: `design-critique-decide.js`(순수 oracle + env parse), `impeccable-routing.js:142-156`(`extractDiffSignals` import 재사용), `output-constraints.js`(runRules import).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/design-grounding.test.js`.

### Task 3: prp-implement.md — capture(2.5.5b) + consume(Phase 3) wiring
- **Action**:
  - (a) Phase 2.5.5b 라우팅+critique 직후(~line 423, `RECEIPT_VERDICT`/`ROUTED_JSON_FILE` 확정 지점): trigger 발화 시(`SKILL_AVAIL=1 && (SIGNAL=1 || DESIGN_INTENT_ACTIVE=1)`)에만 `captureDirection` 호출 → `DESIGN_GROUNDING_CAPTURED=1` set. 2.5.6 WRITE_FLAGS에 `--design-grounding-captured` 조건부 forward(design_critique forward 옆, line 505-517 패턴).
  - (b) Phase 3 EXECUTE per-task 루프 시작(~line 559 "Read MIRROR" 직전): 캡처 아티팩트 존재 시 `readDirection`로 읽어 "Design Grounding Constraints" 컨텍스트 블록(4 anchor 체크리스트 + 방향 요약)을 명시 입력으로 제시 — "각 task를 캡처된 impeccable 방향과 4 Output Constraints를 준수해 구현하라" prompt-level 강제.
- **Mirror**: prp-implement.md 기존 design-gate bash 블록 + WRITE_FLAGS array(2.5.6).
- **Validate**: prp-implement.md grep — capture 호출/`--design-grounding-captured` forward/consume 블록 존재. (command md는 LLM-실행 문서 → mechanical 단위 test 없음; design-grounding.js가 test 대상.)

### Task 4: prp-implement.md — Phase 3.6 DESIGN GROUNDING VERIFY (post-EXECUTE 게이트)
- **Action**: Phase 3 EXECUTE(line 876) ↔ Phase 4 VALIDATE(line 880) 사이 신규 **Phase 3.6** 삽입. 캡처 아티팩트 존재 시에만 실행(없으면 no-op):
  1. **신뢰할 produced-diff 소스 구성(Codex F2 흡수)**: `git diff HEAD`는 untracked 누락 + 무관 unstaged 포함이라 부적합. Phase 2.5.5b capture 시점에 baseline rev(`git rev-parse HEAD`)를 아티팩트에 기록 → Phase 3.6은 `git diff <baseline>` (tracked, baseline 이후 변경분) + `git ls-files --others --exclude-standard` untracked 파일을 **synthetic added-file diff**로 합쳐, 실제 EXECUTE가 생성한 rendered-surface 파일만 scope. (§3.10 M2 `extractDiffSignals`가 이미 tracked diff + untracked rendered-surface를 합치는 패턴 mirror.)
  2. `lintProducedDiff({diffText, direction, mode=parseGroundingMode(env)})` 실행.
  3. verdict ∈ {`violations`,`inconclusive`}(enforce) → `.claude/state/fix-task.md`에 위반/미충족 항목(H15/H17 evidence 또는 missingRequiredSignals) append + bounded retry(기존 stop-loop/critique fix-task 패턴 mirror, cap 도달 시 hard-stop). verdict ∈ {`grounded`,`anchor_clean`,`skipped`} → 통과.
  4. verdict + mode + retry count + baseline rev + advisories를 `git rev-parse --git-path mccp/tmp/design-grounding-result--<slug>.json` 경로(worktree-safe, F1)에 기록(Phase 5 REPORT + receipt re-stamp가 소비).
- **불변**: critique divergent-block(§3.9)은 그대로 — 본 게이트는 *produced-diff* mechanical 위반(H15/H17)에만 발화하는 **별도 locus**의 블록. layout/audit/clarify/distill/polish는 advisory 유지(승격 0). review-only 불변(pr/code-review)에 영향 없음(implement 전용).
- **Validate**: design-grounding.js의 `lintProducedDiff`/`decideGrounding` test가 enforce/warn/off 분기 + violations→block 경로 커버.

### Task 5: Receipt 스키마/CLI — design_grounding_captured(gate-time) + design_grounding_verdict(post-EXECUTE)
- **Action**:
  - `schema.js`: `meta.design_grounding_captured`(boolean default false) + `meta.design_grounding_verdict`(enum `grounded|anchor_clean|inconclusive|violations|skipped` or null, default null) 검증 블록(design_critique_verdict 옆 ~line 543) + skeleton default.
  - `write.js`: `design_grounding_captured: args['design-grounding-captured'] === true` + `design_grounding_verdict: <enum-or-null>` 파싱(design_critique 블록 동형).
  - `cli.js:21` usage에 `[--design-grounding-captured] [--design-grounding-verdict grounded|anchor_clean|inconclusive|violations|skipped]`.
  - **Codex F3 흡수**: captured(2.5.6 gate-time) 만으로는 "grounding 통과"를 증명 못 함. Phase 3.6 종료 시 implement-codex receipt를 **field-preserving re-stamp**(원 WRITE_FLAGS를 STATE/result.json에서 재구성해 `--design-grounding-verdict <verdict>` 추가)해 머신 auditor가 captured-verified vs captured-skipped/crashed/warn-pass를 구별 가능하게 한다. result.json(mode/verdict/retry/baseline-hash)이 canonical post-EXECUTE 증거.
- **Mirror**: `schema.js:247-262`(design_critique present-only enum), `write.js` 동형 블록, `finalize-receipt.js`(flag forward).
- **Validate**: receipt schema/write test에 두 플래그 round-trip + enum 검증 + permissive(legacy receipt 무영향) 단언. migration 불필요(additionalProperties 미차단 — agent 확인). re-stamp 시 prior design_critique_* 필드 보존 단언.

### Task 6: SKILL.md anchor 명문화 + 버전/footer/CHANGELOG
- **Action**: SKILL.md `## Output Constraints` 하단(현 84-85줄)에 "produced diff lint(M-grounding): rendered-surface added line에 H15(heading depth)/H17(nested-card) anchor 정적 적용" 1~2줄. plugin.json `1.18.20→1.18.21`. CHANGELOG `[1.18.21]` row. html.js/markdown.js footer 동기화.
- **Validate**: `node --test`(renderer suite — footer 단언 갱신 시), plugin.json/CHANGELOG 정합 확인.

## Validation

```bash
# 신규 + 회귀 단위 test (worktree cwd)
node --test plugins/mccp/scripts/lib/tests/design-grounding.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js
node --test plugins/mccp/scripts/lib/tests/design-critique-decide.test.js
node --test plugins/mccp/scripts/receipt/tests/
# renderer 전체 스위트(footer/html 변경 회귀)
node --test plugins/mccp/scripts/lib/renderer/tests/
# 자기-적용(dogfood): 본 plan은 output-constraints.js(renderer/) + design-critique-decide 인접 +
# SKILL.md(frontend-design-direction/) 를 건드려 DESIGN_SURFACE_PATHS hit →
# 본 cycle의 prp-implement 단계에서 Phase 3.6 grounding verify 가 실제 발화해야 함(pre-ship 검증).
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Receipt 시퀀싱**: implement-codex receipt가 2.5.6(EXECUTE 이전)에 작성 → post-EXECUTE grounding *verdict*를 gate-time에 못 넣음. (Codex F3) | 확실(구조적) | `design_grounding_captured`(gate-time boolean) + Phase 3.6 종료 시 **field-preserving re-stamp**로 `design_grounding_verdict`(enum) 추가. result.json(mode/verdict/retry/baseline-hash)이 canonical 증거 + REPORT/STATE 동시 기록. 무거운 "second fully-validated receipt"는 backlog defer. |
| **worktree `.git`는 파일** — `.git/mccp/tmp` 경로 깨짐(본 plan 작성 중 실제 hit, Codex F1) | 확실 | 모든 artifact 경로를 `git rev-parse --git-path mccp/tmp/<name>`(per-worktree gitdir)로 해소. worktree-`.git`-as-file 시뮬레이션 test 추가. |
| **`git diff HEAD`가 untracked 누락 + 무관 unstaged 포함**(Codex F2) | 높음 | baseline rev(capture 시점 기록) + `git diff <baseline>` + `git ls-files --others --exclude-standard`(synthetic added) 합성, 생성 rendered-surface 파일만 scope. |
| **`verified`가 anchor-clean과 grounded 혼동**(Codex F4) | 중 | verdict enum 5종 분리 + enforce 모드에서 캡처된 requiredSignals 부재 시 `inconclusive` block. warn 모드도 silent 'verified' 금지(정직한 enum 기록). |
| source diff lint false-positive(H16 raw marker, accent color는 source≠rendered라 오탐) | 높음 | grounding **blocking 서브셋 = H15/H17 한정**(heading depth는 JSX/HTML `<h4+>`/`####`로 저오탐, nested-card는 `class="card"` 부재 시 no-op-safe). H16/accent/signal-consistency는 **advisory warn 채널**로만(블록 안 함). |
| 임의 비-디자인 diff에서 게이트 오발화 | 중 | `extractRenderedSurfaceFromDiff`가 rendered-surface 파일만 추출 → 비-UI diff면 빈 버킷 → verdict 자동 'verified'(no-op). 캡처 아티팩트 없으면 Phase 3.6 전체 no-op. |
| critique 단독 divergent-blocking 소유 침해 우려 | 중 | grounding 게이트는 produced-diff mechanical 위반(H15/H17)이라는 **다른 locus/mechanism** — critique의 LLM-judged divergent와 중복 아님. 사용자 의도("그 위에 얹음")와 정합. advisory 명령(layout/audit/...) 승격 0. |
| 신규 LLM 호출로 비용 증가(제약 위반) | 낮음(설계상 0) | capture=아티팩트 write(I/O), verify=`runRules`+`extractDiffSignals`(순수 함수). LLM 호출 0. 추가 비용 = 기존 layout invoke 1회 + lint. |
| kill-switch/모드 silent disable | 낮음 | `MCCP_DESIGN_GROUNDING=off` 시 loud stderr warn(§feedback-loud-fail-open). 오타/미설정 → enforce default. |
| 버전/footer drift (반복 부채) | 중 | Task 6에서 plugin.json + CHANGELOG + html.js/markdown.js footer 동시 bump(§3.7). |

## Acceptance

- [ ] capture → consume → verify 3-step이 prp-implement에 wired (grep 확인).
- [ ] `design-grounding.js` 순수 함수 + node native test green (capture/read/extract/lint/decide/parseMode + kill-switch + 비-rendered no-op + fail-open).
- [ ] `output-constraints.js` runRules 추출 후 기존 54 test 무회귀 + `runOutputConstraints ≡ runRules(_, RULES)`.
- [ ] Phase 3.6 grounding verify가 enforce에서 H15/H17 위반 시 block(fix-task + retry), verified/skipped에서 통과.
- [ ] `design_grounding_captured` receipt 플래그 round-trip + migration 없이 legacy receipt 무영향.
- [ ] **(Codex F1)** 모든 artifact 경로가 `git rev-parse --git-path`로 해소 — worktree(`.git`=파일)에서 capture/result write 성공. worktree-`.git`-as-file test green.
- [ ] **(Codex F2)** produced-diff 소스 = baseline rev + tracked diff + untracked synthetic — untracked rendered 파일이 grounding을 우회 못 함.
- [ ] **(Codex F3)** Phase 3.6 종료 시 receipt re-stamp로 `design_grounding_verdict` 기록, prior design_critique_* 필드 보존.
- [ ] **(Codex F4)** verdict enum 5종 — enforce에서 requiredSignals 부재 시 `inconclusive` block, warn에서도 silent 'verified' 0.
- [ ] critique divergent-block(§3.9) + review-only(pr/code-review) + routing oracle 불변 보존(신규 agent 0).
- [ ] 신규 LLM 호출 0 (설계+코드 self-attest).
- [ ] plugin.json 1.18.21 + CHANGELOG + footer 동기화.
- [ ] self-apply dogfood: 본 cycle 구현이 DESIGN_SURFACE_PATHS hit → Phase 3.6 실발화 확인.

## Codex Adversarial Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` scope-narrow)
- 라운드 수: 1 (R1)
- classification: `ok` · blocking: `false` · Codex verdict: **needs-attention** (4 findings)
- Codex thread: `019f1289-0d94-7fc1-ac3e-d1395a67b0be`
- 합치 결론: Codex가 **F1(`.git` worktree 경로 결함)을 본 plan 작성 중 실제로 재현된 버그로 정확히 포착** — adversarial 가치 입증. F1/F2(HIGH)는 R1 plan 편집으로 완전 흡수, F3/F4(MEDIUM)는 경량 흡수 + 잔여 backlog.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 아티팩트가 worktree `.git`(파일) 하위에 작성됨 | HIGH | ACCEPT_NOW | 실제 재현된 버그. capture/result 경로를 `git rev-parse --git-path mccp/tmp/<name>`(per-worktree gitdir) 로 해소 + worktree-`.git`-as-file test. |
  | F2 — `git diff HEAD`가 신뢰할 produced-diff 소스 아님 | HIGH | ACCEPT_NOW | untracked 누락 + 무관 unstaged 포함. pre-EXECUTE baseline rev + `git diff <baseline>` tracked + `git ls-files --others --exclude-standard` untracked(synthetic added)로 해소(§3.10 M2 패턴 mirror). |
  | F3 — receipt가 capture 시도만 증명, grounding 통과는 미증명 | MEDIUM | ACCEPT_NOW(경량) | `design_grounding_verdict` enum을 receipt에 추가(additive) + Phase 3.6 field-preserving re-stamp + canonical result.json(mode/verdict/retry/baseline-hash). 무거운 "second fully-validated receipt"는 backlog. |
  | F4 — `verified`가 anchor-clean과 grounded를 혼동 | MEDIUM | ACCEPT_NOW(경량) | verdict enum 분리(`grounded`/`anchor_clean`/`inconclusive`/`violations`/`skipped`). enforce 모드 + rendered-surface diff 존재 + 캡처된 direction이 machine-checkable required signal 선언했는데 부재 → `inconclusive`(block). 그 외 advisory. |
- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md` (F3 heavy second-receipt, F4 full signal-grounding 강제)
- Open Questions: 없음 (auto-CRITICAL 0 — secret/data-loss/auth/migration/external-dest/crypto 해당 없음)

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` scope-narrow)
- 라운드 수: 1 (R1) — cross-gate dedupe **미적용**(origin/main stale로 `diff ⊆ Files to Change` mechanical guard 충족 불가 → fail-closed로 실제 review 수행).
- classification: `ok` · blocking: `false` · Codex verdict: **needs-attention** (4 findings)
- Codex thread: `019f133f-ff28-7bf2-95bb-3050db082c0e`
- 합치 결론: plan-level Codex(F1~F4)가 못 잡은 **implement-time 실현 디테일 버그 4건**을 정확히 포착 — dedupe 안 한 결정의 가치 입증. 4건 모두 R1 구현 조정으로 **완전 흡수**(HIGH 2건 포함 — R1 absorption이 fully resolve하므로 R2 escalate 불필요). cap=1.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — H17(nested-card)은 added-line 버킷에서 enforce 불가(DOM open-tag stack 필요 + `class=` 매처가 JSX `className=` miss) | HIGH | ACCEPT_NOW | blocking 서브셋을 `GROUNDING_RULE_IDS=['H15']`로 좁힘(H15는 `<h4-9>`/`####` line-local-safe, JSX `<h4>`도 매치). H17 nested-card enforce는 renderer full-HTML lint path가 계속 소유(rendered status.html에서 정상 동작). full-file/JSX-aware H17 grounding은 backlog. nested-card 회귀 test 추가. |
  | F2 — pre-EXECUTE baseline diff가 EXECUTE delta가 아님(worktree dirty 시 기존 변경 포함) | HIGH | ACCEPT_NOW | `captureDirection`이 capture 시점(pre-EXECUTE) rendered-surface added-line 버킷을 아티팩트에 스냅샷 → `lintProducedDiff`가 현재 버킷에서 per-bucket line-set 차감 → EXECUTE delta만 lint. worktree-dirty 시뮬레이션 test. |
  | F3 — receipt restamp가 실제로 field-preserving 아님(write.js가 fresh skeleton overwrite, existing은 auto-round만 read) | MEDIUM | ACCEPT_NOW(경량) | `write.js#restampGroundingVerdict`(read existing → `meta.design_grounding_verdict`만 mutate → subject/receipt hash 재계산 → validate → write) + `cli.js restamp-grounding` verb. unknown-meta + 기존 `design_critique_*` 보존 단언 test. verdict는 receiptHash carve-out 안 함(tamper-protected). |
  | F4 — capture 요구됐으나 artifact missing/corrupt 시 enforce가 no-op로 강등(readDirection null fail-open) | MEDIUM | ACCEPT_NOW(경량) | "no trigger" vs "capture-required-read-failed" 구별 — `decideGrounding({readFailed})`가 enforce에서 `inconclusive`(block) 반환. `captureDirection`는 temp+rename atomic write. read-failure→inconclusive test. |
- 추가 흡수(plan 잠재결함, Codex 미지적): bare `.md`를 rendered-surface로 포함하면 command-doc(`####` 다수)에 H15 오발화 → md 버킷은 `.claude/cache/*.md`(렌더된 대시보드 마크다운)만 scope. plan Risk "임의 비-디자인 diff 오발화 회피"와 정합한 refinement(보고서 deviation 기록).
- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md` (F1 full-file/JSX-aware H17 grounding, F4 full signal-grounding 강제)
- Open Questions: 없음 (auto-CRITICAL 0 — secret/data-loss/auth/migration/external-dest/crypto 해당 없음)

### Security Reviewer

> security-reviewer 미트리거 — 본 변경은 auth/crypto/secret/input-validation/injection/SSRF/path-traversal/privilege 영역 아님(순수 lint lib + receipt schema additive + command-doc wiring). 입력은 git diff 텍스트(신뢰경계 외부 데이터 아님) + 로컬 아티팩트. skip 아님(N/A).

## 채택 안 한 해석 (audit)

- **해석 B (impeccable sub-agent가 구현 소유)**: 진짜 위임이나 신규 agent + 감사체인(mutations attribution/dispatch-controller) 재설계 + review-only 불변 충돌 → 과대비용. 별도 장기 axis로만.
- **해석 C (impeccable native craft/live)**: 대화형이라 비대화형 receipt 게이트와 구조적 부적합(§3.10 명시 제외) → reject.

## Design Critique

- impeccable skill: available (detector `design_signal=true` — plan body가 `renderer/` + `frontend-design-direction/` design-surface 경로 언급 → DESIGN_SURFACE_PATHS 휴리스틱 발화).
- 라운드: 1 (R0) · verdict: **CONVERGED**.
- 판정 근거: 본 plan은 **렌더 UI 표면을 출시하지 않는다** — mccp 게이트에 mechanical design-grounding lint(capture→consume→verify) + 순수 함수 lib를 추가할 뿐. 4 Output Constraints(정보 위계 ≤3 / 강조색 viewport당 ≤1 / raw markdown marker 금지 / 한 화면 항목 수 상한)는 모두 *렌더된 viewport*를 전제하므로 적용 대상 표면 부재 → actionable design finding 0.
- 아키텍처/엔지니어링 검증(어떤 anchor를 produced diff에 강제할지, 시퀀싱)은 §Risk + Codex adversarial 게이트(아래)가 담당. critique은 §3.9 retry loop의 divergent-block 소유를 유지하되 본 plan에는 발화 항목 없음.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 어떤 impeccable 명령도 invoke하지 않으며 — 아래는 implement 시 stage-aware 라우팅이 다룰 명령 체크리스트(recommend-only).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `typeset` · `animate` · `colorize` · `bolder` · `quieter` · `overdrive` · `delight` |
| simplify | `/impeccable adapt` · `distill` · `clarify` |
| evaluate | `/impeccable critique`(§3.9 loop) · `audit` |
| harden | `/impeccable harden` · `optimize` · `onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `extract` |

본 plan의 구현 단계에서는 control-plane-only diff(lint/command 문서, 렌더 UI 산출 없음) 가능성이 높아 `renderingSurface` selector가 refine/discovery를 recommend로 강등할 수 있다(Codex F4 패턴). evaluate(critique/audit)는 유지.
