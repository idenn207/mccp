# Plan: Codex Review Intent-Context Preservation — M1

**Source PRD**: `.claude/prds/codex-intent-context.prd.md`
**Selected Milestone**: 1 — 의도 표면화 + arbiter intent-conflict gate + 측정
**Complexity**: Large (R1 흡수로 Medium → Large — 아래 `## Codex Adversarial Review` 참조)

## Summary

`/mccp:plan`의 Plan-Codex 게이트는 리뷰어(out-of-process Codex)에게 사용자 대화 의도를 전달할 채널이 없고, finding 수용 판단을 저자 자신이 내리며, 그 판단이 어디에도 기록되지 않는다. M1은 세 결함을 각각 (L1) plan 아티팩트의 구조화된 `## User Intent` 섹션 + 리뷰어 focus reference 주입, (L2) 단일 pure 오라클 `intent-context.js`가 소유하는 finding별 명시 판정(adjudication) 강제, (M) receipt `meta.intent_*` **9 필드** stamp로 닫는다.

강제 메커니즘은 v1.23.0 M3의 **이중 locus·단일 오라클** 패턴을 그대로 미러한다 — receipt write 경로(primary, LLM이 누락 불가) + `validate-cmd` canonical 표면이 같은 `deriveIntentGateDecision`을 호출해 판정 drift를 구조적으로 차단한다. 유일 우회는 audited override이며 **verdict를 세탁하지 않는다**(실제 `incomplete`/`conflict_unresolved`를 봉인한 채 ship).

santa-loop R1(Opus + GPT-5.4 둘 다 FAIL)이 초안의 근본 착각 하나를 무너뜨렸다 — 초안은 파일을 "봉인"한다고 썼지만 **이 저장소에는 provenance가 없다**(receipt는 자기-해시만 하고 아티팩트에는 서명이 없다). 따라서 Codex 호출과 receipt write는 **한 프로세스**(`plan-codex-runner.js`)로 합쳐 위조 창 자체를 제거하고(DD3), 인증이 원리상 불가능한 지점에서는 보증을 주장하는 대신 **fail-closed 방향**을 택한다(DD1b·DD13).

## User Intent

<!-- Reference-only. 이 섹션은 리뷰어 focus에 verbatim 주입된다(L1). USER-STATED 제약만 —
     저자 정당화(왜 이렇게 설계했나)는 절대 여기 쓰지 않는다(anchoring 회피, PRD Risk 4). -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | MVP는 L1(의도 표면화) + L2(arbiter intent-conflict gate) 두 축만 — 최소 단위로 검증한다 | direction |
| UI2 | 리뷰어에게 주입하는 것은 "사용자가 무엇을 요구했나"뿐이다. "저자가 왜 이렇게 했나"(저자 정당화)는 넣지 않는다 | constraint |
| UI3 | intent-conflict 판정을 빠뜨릴 수 없게 mechanical하게 강제하되, 판정 내용 자체는 LLM이 수행한다(hybrid) | constraint |
| UI4 | `/mccp:prp-implement`의 Implement-Codex는 scope에서 제외한다 — 코드 패턴 검토라 대화 의도 의존도가 낮다 | exclusion |
| UI5 | Codex 자체 교체는 하지 않는다 | exclusion |
| UI6 | "완벽한 리뷰어 독립성"은 추구하지 않는다 — frontier 모델은 pretraining 공유로 오류가 상관되므로 원리상 불가. 완화가 목표다 | exclusion |
| UI7 | 게이트 성능·비용 최적화는 이번 scope가 아니다 | exclusion |
| UI8 | cross-vendor 독립 2차 리뷰어 복원은 Milestone 2로 분리한다 | exclusion |
| UI9 | arbiter 완전 분리(fresh subagent)는 M2 — M1은 세션 내 역할 분리 + 구조적 gate로 시작한다 | direction |
| UI10 | 1차 성공기준은 "의도-충돌 finding의 silent-accept 0건"이며 mechanical하게 측정 가능해야 한다 | direction |

> **자기적용 유보(정직 표기)**: 이번 cycle의 Plan-Codex는 설치 캐시(`~/.claude/plugins/cache/mccp/mccp/1.22.7`)의 구 command body로 실행되므로, 이 섹션이 실제로 focus에 주입되지는 **않는다**. 자기적용(dogfood)은 머지 + `claude plugin update` 이후 다음 게이트 진입부터 발효한다. Task 9의 e2e가 이 경로를 코드 레벨로 대신 증명한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Pure 오라클 + 이중 locus | `plugins/mccp/scripts/lib/pr-ship-gate.js:86` | `deriveShipDecision(receipt, {forceOverrideActive})` → `{ship, blockingVerdict, overrideActive, reason}`. override가 `blockingVerdict`를 **보존**해 verdict 세탁 금지. finalize(runtime) + validate-cmd(canonical) 양쪽이 같은 오라클 호출 |
| Enum verdict 오라클 | `plugins/mccp/scripts/lib/design-critique-decide.js:40` | `decideCritique({findings, round, cap})` → 문자열 enum. 순수·dep-free·부작용 0. `Array.isArray` 실패 = fail-closed |
| Mode parse + loud fallback | `plugins/mccp/scripts/lib/design-grounding.js:30` | `parseGroundingMode(env)` — 미지정/오타 → fail-closed default + loud stderr warn |
| Focus 합성 | `plugins/mccp/scripts/lib/codex-invoke.js:142` | `composeFocus(focus, opts)` + `DESIGN_SCOPE_PREAMBLE`. `opts.x !== true` strict gate(truthy 문자열 오발화 방지) |
| 구조화 payload를 JSON 파일 채널로 | `plugins/mccp/scripts/receipt/write.js:315` (`impeccable-commands-routed-file`) | 다필드 구조체는 CLI 문자열이 아니라 `--*-file <path>` + `readJsonIfPresent` |
| Marker-gated all-or-nothing | `plugins/mccp/scripts/receipt/write.js:275` (`detectDispatchContext`) | marker 감지 시 관련 플래그 전부 require, 부분 공급은 write 시점 fail-closed exit 12 |
| Present-only meta 필드 | `plugins/mccp/scripts/receipt/schema.js:589-620` + `:830` | `!== null && !== undefined` 가드 + `makeSkeleton` default. 구 receipt 무손상 |
| Strict reason validator | `plugins/mccp/scripts/receipt/lib/force-override-reason.js` (`validateReason(x,{strict:true})`) | audited escape reason은 ≥30자·≥3단어·no placeholder/URL-only/banlist |
| validate blocking kind | `plugins/mccp/scripts/receipt/validate-cmd.js:494` (`design_critique_chain_divergent`) | `blocking[].kind` + INTEGRITY 힌트. aggregate `ok===false`로 HALT |
| Tests | `plugins/mccp/scripts/lib/tests/design-critique-decide.test.js`, `plugins/mccp/scripts/receipt/tests/design-grounding-fields.test.js` | `node:test` + `node:assert`, 오라클 결정 트리 전수 + 필드 present-only 회귀 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/intent-context.js` | CREATE | L1+L2 단일 pure 오라클 — 섹션 파싱·reference 합성(하드닝 포함)·adjudication 판정·counts 요약 |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | CREATE | santa-loop R1 M1 — Codex 호출 + intent 판정 + receipt write를 **한 프로세스**로 묶어 아티팩트 위조 창을 구조적으로 제거 |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | CREATE | injected fake codex-invoke로 위조 창 부재·fail-closed 경로 검증 |
| `plugins/mccp/scripts/lib/tests/intent-context.test.js` | CREATE | 오라클 결정 트리 전수 + 형식적-섹션(anti-formalism) 가드 + placeholder 판정 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | `--intent-reference-file` 파싱 + `composeFocus`에 `INTENT_REFERENCE_PREAMBLE` prepend(결정적 순서) + 판독 실패 시 spawn 전 exit 2 |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATE | focus 합성 순서(design → intent → base) + 파일 부재 fail-closed 회귀 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.intent_*` 9 present-only 필드 검증 + `makeSkeleton` default |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | runner가 넘긴 `intentDecision`으로 9 필드 stamp + fail-closed invariant + audited override (marker 자체 파생 제거 — santa-loop M1) |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | usage 문자열 + 신규 플래그 pass-through |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | blocking kind `intent_gate_incomplete` (canonical read-back locus) |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATE | R1 F3 — 봉인된 intent verdict를 **load-bearing**으로: `preserved` 아님 또는 `force_override=true`면 dedupe 불가(PR-Codex 실발화) |
| `plugins/mccp/scripts/receipt/tests/dedupe.test.js` | UPDATE | R1 F3 회귀 — override된 plan receipt가 `codex_verdict='converged'`여도 `skip_safe=false` |
| `plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js` | CREATE | schema present-only + write 파생 + fail-closed invariant + override 봉인 회귀 |
| `plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js` | CREATE | validate blocking/allow 판정 + 구 receipt(필드 부재) 무손상 |
| `plugins/mccp/commands/plan.md` | UPDATE | PRD 템플릿 `## User Intent` 필수화 + Phase 1.5 capture + 5.2 focus 주입 + 5.3 triage 열 확장 + 5.4a intent gate + 5.6 플래그 forward |
| `plugins/mccp/commands/pr.md` | UPDATE | L1만 — plan의 intent 섹션을 PR-Codex focus에 forward |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATE | `--intent-reference-file` pass-through(invoked 분기 한정) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.0` → `1.23.1` (단일 milestone = patch, §3.7) |
| `CHANGELOG.md` | UPDATE | `[1.23.1]` row |
| `CLAUDE.md` | UPDATE | §3.13 신규 서브섹션 + §4 운영 토글 2건 |
| `.claude/prds/codex-intent-context.prd.md` | UPDATE | Milestone 1 `pending` → `in-progress` + Plan 셀 |

## Design Decisions

리뷰 라운드에서 반복 노출될 우회 표면을 선제적으로 닫는다(v1.23.0 M3 §DD 선례).

**DD1 — 판정 집합 + `skipped`는 증명된 것만 (R1 F2 흡수).** pass 집합은 `{preserved, skipped(증명됨)}`, block 집합은 `{incomplete, inconclusive, conflict_unresolved, skipped-unproven}`이며 미지의 값은 block이다. `skipped`가 pass여야 하는 이유는 정당한 skip 경로가 실재하기 때문이다 — free-form(비-PRD) plan, Codex findings 0건, `MCCP_CODEX_DISABLED=1`. 그러나 **초안은 증명 없이 `skipped`를 pass로 뒀고 그것이 곧 무료 통과 티켓이었다** — `pr-ship-gate.js:55-68`이 `SKIP_PROOF_META_KEYS`/`hasSkipProof`로 이미 한 번 값을 치른 것과 **완전히 같은 구멍**이다(receipt를 손으로 쓰거나 legacy 모양으로 만들면 정당한 skip과 구별 불가). 따라서 `skipped`는 `meta.intent_skip_proof ∈ {free_form_plan, no_codex_findings, codex_disabled}` **하나를 반드시** 동반하고 그 증명은 mechanical하게 대조된다: `free_form_plan` → plan 본문에 `**Source PRD**:` 부재 · `no_codex_findings` → runner가 **메모리에서** 파싱한 review payload가 `findings.length === 0`(디스크 아티팩트 아님 — santa-loop M1) · `codex_disabled` → `meta.codex_disabled === true`. 증명 없는 `skipped`는 `skipped-unproven`으로 block(감사 표면이 **왜** 막혔는지 이름을 갖는다).

**DD1b — legacy는 "승인"이 아니라 "모름"이다 (santa-loop R1 M2 흡수 — 초안 철회).** 초안은 `makeSkeleton`이 필드를 항상 emit하므로 **키 부재 = legacy = 무증명 `skipped` 허용**이라 했다. GPT-5.4가 이것을 뒤집었다: `makeSkeleton` default는 **provenance가 아니다**. receipt는 자기-해시(`hash.js`)만 하므로 손으로 쓴·정규화로 키가 빠진·구 바이너리가 쓴 receipt가 legacy로 **위장**해 무증명 통과를 얻고, 더 나쁘게는 `isIntentApproved`가 legacy를 `true`로 돌려 **F3(dedupe 우회)가 그대로 되살아난다**. 즉 초안의 legacy 분기는 앞문을 잠그고 뒷문을 연 것이었다.

  수정 — legacy는 `unknown`이며 **소비처마다 다르게 취급**한다. 승인으로 승격시키지 않는다:
  - **`validate-cmd` 비-terminal chain(plan→implement)**: `unknown` → ALLOW + warning. 구 receipt로 이미 진행 중인 작업을 소급 차단하지 않는다(무회귀 유지). 차단해 봐야 얻는 것이 없다 — 그 plan에는 애초에 intent 기록이 없고, 강제는 다음 write부터 걸린다.
  - **`dedupe`(F3의 실제 축)**: `unknown` → `isIntentApproved=false` → **dedupe 불가 → PR-Codex 실발화**. 이 방향의 비용은 Codex 리뷰 1회 추가뿐이고, 반대 방향의 비용은 dual-review 완전 우회다. 비대칭이 명백하므로 fail-closed가 정답이며, 동시에 **"키를 빼면 공짜 dedupe skip"이라는 유인이 사라진다**(위장의 보상이 0이 되므로 위장을 탐지할 필요가 없어진다 — 인증 없이 위조를 무력화하는 유일한 방법).
  - 판별은 여전히 `'intent_gate_verdict' in meta`(값 `null`과 부재 `undefined`의 구분)를 쓰되, 그 결과는 pass가 아니라 `unknown` 라벨이다.

**DD2 — 이중 locus·단일 오라클.** (1) **runtime primary** = `write.js`. intent marker 감지 시 adjudication 파일이 없거나 판정이 block 집합이면 exit 12 → receipt 미작성 → Phase 5.7 validate 실패 → `/mccp:prp-implement` 진입 불가. LLM이 단계를 "잊는" 것으로는 통과할 수 없다(UI3의 mechanical 절반). (2) **canonical 표면** = `validate-cmd --command mccp:prp-implement`가 upstream plan-codex receipt의 `intent_gate_verdict`를 읽어 `blocking[].kind='intent_gate_incomplete'`. 양쪽이 같은 함수를 호출하므로 판정이 갈릴 수 없다.

**DD3 — marker는 호출자가 공급할 수 있는 데이터에서 파생하지 않는다 (R1 F1 흡수 — 초안의 사실 오류 포함).** 초안은 marker를 `isPrdModePlan(planText)` **AND** `resolution.findings.length > 0`로 정의했다. 두 가지가 틀렸다. (1) **사실 오류**: findings는 `resolution.findings`가 아니라 **top-level `receipt.findings`**다(`schema.js:101`). (2) **더 심각한 것**: 그 값의 출처가 `write.js:137` `readJsonIfPresent(args['findings-file'], [])`이고 **default가 `[]`**다. 즉 `--findings-file`을 넘기지 않으면 findings가 빈 배열이 되어 marker가 조용히 false로 떨어지고 게이트가 skip된다 — 게이트를 무력화하려고 거짓말을 할 필요조차 없고, 그저 플래그 하나를 생략하면 된다. 이는 PRD가 겨냥한 silent-accept와 정확히 같은 부류의 결함을 한 층 위에서 재생산한 것이다.

  초안의 수정안은 "**봉인된** review 아티팩트에서 파생한다"였다 — plan.md가 envelope JSON을 파일로 남기고 write.js가 `--codex-review-file`로 읽는 방식. **santa-loop R1에서 두 리뷰어가 모두 이것을 깼다(M1)**: 그 파일은 봉인되지 않았다. Phase 5.2 write와 5.6 read 사이에 `{result:{verdict:"approve",findings:[]}}`를 써 넣으면 marker와 DD1의 `no_codex_findings` 증명이 **동시에** 조작되고, `receipt_hash`는 조작된 값을 *사후에* 봉인해 위조를 감춘다. F1을 닫은 게 아니라 한 칸 옮긴 것이었고, "봉인"이라는 단어가 없는 보증을 주장했다.

  **진짜 수정 — 창을 감시하지 말고 없앤다.** Codex 호출과 receipt write를 **한 프로세스**로 합친 `plan-codex-runner.js`를 만든다. 이 프로세스가 codex-invoke를 직접 호출하고, 반환된 envelope를 **메모리에서** `parseReviewPayload`로 읽어 marker를 파생하고, 같은 프로세스에서 receipt를 쓴다. 리뷰와 write 사이에 LLM이 손댈 수 있는 파일이 존재하지 않으므로 M1이 구조적으로 소멸한다. 이는 발명이 아니라 PR 게이트가 이미 쓰는 형태다 — `pr-phase-helpers/codex-runner.js`가 Codex를 호출하고 `finalize-receipt.js`가 그 결과로 receipt를 쓰는 단일 체인. 아티팩트 파일은 **감사 사본으로만** 남기고 marker 파생에는 쓰지 않는다(읽히지 않는 파일은 위조해도 무의미하다). `--findings-file`도 receipt 본문 기록용으로만 남는다.

  아티팩트 부재 처리는 그대로 유효하다: 어떤 이유로든 runner가 review payload를 얻지 못하면 **`incomplete`(fail-closed)**다. 증명의 부재를 "지적할 것이 없었음"으로 읽지 않는 것이 이 축의 핵심이며, 아래 DD12에도 같은 원리가 적용된다.

**DD3b — plan 본문 TOCTOU도 같은 프로세스 안에서 사라진다.** 초안은 digest를 파일에 적어 두고 write 시 대조하려 했으나, 그 digest 파일 역시 위조 가능해 M1과 같은 결함이었다. 단일 프로세스에서는 runner가 Codex에 넘긴 plan 본문의 sha256을 **메모리에 들고 있다가** 자기가 쓰는 receipt에 `meta.intent_plan_digest`로 stamp하므로 대조할 외부 파일이 없다. 이 필드는 이제 *강제 수단*이 아니라 **사후 감사 앵커**다(리뷰된 본문이 무엇이었는지 제3자가 확인 가능) — 역할을 정직하게 축소해 표기한다.

**DD4 — 구 receipt·구 plan 무손상.** 9 필드는 present-only이므로 기존 receipt는 검증 무변경이고, validate는 `intent_gate_verdict` **부재**를 `unknown`으로 읽어 비-terminal chain에서 ALLOW+warning한다(구 receipt는 절대 신규 blocking을 유발하지 않음). 단 dedupe에서는 `unknown`이 승인이 아니다(DD1b). 다만 `## User Intent`가 없는 **기존 PRD-모드 plan에 신규 receipt를 쓰면** marker가 발화해 `incomplete`가 된다 — 이는 의도된 결과이며(그 plan에는 의도 기록이 실제로 없다) 복구 경로는 두 가지다: 게이트 재진입으로 섹션 작성, 또는 DD5 audited override.

**DD5 — audited override는 verdict를 세탁하지 않는다.** `MCCP_SKIP_INTENT_GATE="<reason>"`(strict validator 재사용)은 이번 호출의 mechanical HALT만 해제한다. receipt는 실제 `intent_gate_verdict='incomplete'`를 **봉인한 채** `meta.intent_gate_force_override=true` + reason과 함께 작성된다. `blockingVerdict`를 보존하는 이유는 M3 DD3와 동일하다 — verdict를 `preserved`로 매핑하면 감사 corpus가 거짓이 되고 후속 소비처(§3.12 ledger 승인 술어·derive·renderer)가 오염된다.

**DD6 — 형식적 섹션(anti-formalism) 구조 가드.** PRD Risk 3("의도 섹션이 형식적으로만 채워져 실효 없음")에 대해 오라클이 mechanical 최소치를 강제한다: 행 ≥1 · ID가 `^UI\d+$` 유일 · `kind ∈ {constraint, exception, exclusion, direction}` · constraint 텍스트 ≥3 단어 · placeholder(`{...}`, `TODO`, `TBD`, `N/A`, `-`, `—`) 미포함. 하나라도 위반하면 섹션은 **부재로 취급**(`present=false`)돼 marker가 발화한 상태에서 `incomplete`가 된다. 의미 판정은 못 하지만 "빈 표를 붙여 게이트를 통과"는 구조적으로 막는다.

**DD11 — 봉인된 intent verdict를 load-bearing으로 (R1 F3 흡수).** DD5는 override 하에서도 실제 verdict를 봉인한다고 했지만, **봉인만으로는 아무것도 막지 못한다**. `dedupe.js:374`의 dedupe 술어는 `receipt.resolution.codex_verdict === 'converged'` **단독**이고 intent gate를 전혀 보지 않는다. 따라서 plan-codex가 intent gate override로 통과하면서 Codex verdict는 `converged`인 조합에서, `/mccp:pr`의 cross-gate dedupe가 그 plan을 clean으로 보고 **PR-Codex를 통째로 skip**한다 — dual-review 우회. 이는 integrity-unification M1이 `resolution.converged`(항상 true)에 대해 이미 닫은 "봉인됐지만 승인 지점에서 무력한 필드" 패턴의 재발이다.

  수정: `evaluateForDedupe`가 **plan-codex receipt에 한해** `codex_verdict === 'converged'` **AND** intent 승인(`preserved` 또는 증명된 `skipped`) **AND** `intent_gate_force_override !== true`를 요구한다. 위반 시 `skip_safe=false` + reason에 intent 축 명시 → PR-Codex 실발화(fail-closed).

  **공유 헬퍼를 건드리면 안 된다 (santa-loop R2 M5)**: `codexConverged(receipt)`는 plan·implement 양쪽에 쓰이는 단일 함수라, 여기에 intent 조건을 넣으면 UI4로 out-of-scope인 implement receipt가 영구히 `unknown → false`가 되어 **dedupe 전체가 죽는다**. 조건은 `evaluateForDedupe`의 plan 축에만 얹는다. out-of-scope 게이트의 intent 필드가 `null`인 것은 **정상 상태**이며 판정 대상이 아니다.

  **적용 범위는 dedupe로 한정한다(정직 표기).** F3은 completion-ledger 승인 술어와 derive/renderer도 지목했으나, ledger(v1.22.5 M1)는 **ship receipt(`mccp-pr-codex`)**에만 append하고 이 게이트는 plan-codex만 stamp하므로 plan-codex override가 ledger 승인 경로에 도달하지 않는다 — 회피가 아니라 구조적 미도달이다. derive/renderer 노출은 critique C1(LOW)로 이미 기록됐고 UI1(MVP 2축)·UI7 상 M2 이후 축이다.

**DD12 — 오심(mislabelling)을 탐지 가능하게: 리뷰어 주장 비대칭 검사 (R1 F4 흡수).** F4가 정확하다 — 완전성 검사는 오심을 못 잡는다. 저자가 모든 finding을 `intent_conflict: 'none'`으로 찍으면 모든 mechanical 검사를 통과하며, 그러면 M1은 **더 나은 서류를 갖춘 같은 sycophancy**다. 이것을 미해소로 남기면 PRD가 쓰인 이유 그 자체를 ship하는 셈이라 이연하지 않는다.

  Codex가 제안한 형태(companion의 structured output에 `intent_conflict`/`intent_ref_ids` 필드를 **요구**)는 그대로는 실장 불가다 — 그 스키마는 codex plugin(`codex/prompts/adversarial-review.md`)이 소유하고 우리 통제 밖이며, Codex가 필드를 빠뜨리면 대조 대상이 사라져 검사가 조용히 무력해진다(우리가 통제하는 것으로만 강제해야 한다는 규칙 위반).

  우리가 통제하는 것으로 만든 형태: L1 preamble이 Codex에게 **모든 finding에 대해 intent 판정 한 줄을 반드시 emit하라**고 지시한다 — `INTENT: UI3` 또는 `INTENT: none`. 그러면 오라클이 **비대칭 검사**를 한다: finding이 `UI\d+`를 인용했는데 그 finding의 adjudication이 `intent_conflict: 'none'`이면 **`conflict_unresolved`로 block**한다. 리뷰어가 독립적으로 제기한 충돌 주장을 저자가 조용히 지울 수 없다. 비대칭 방향은 의도적이다 — 리뷰어가 인용 안 한 finding을 저자가 conflict로 올리는 것은 자유(보수적), 인용한 것을 none으로 내리는 것만 막는다.

  **초안의 결함 (santa-loop R1 M3 — GPT-5.4만 포착, Opus는 통과시킴).** 초안은 "Codex가 인용하지 않으면 검사가 발화하지 않는다"를 *한계 표기*로 처리했다. 그것으로 충분하지 않다. 인용 0건은 "진짜 충돌 없음"과 "지시가 먹히지 않았음/억제됨"을 **구별하지 못하므로**, 한계가 아니라 이 PRD가 겨냥한 바로 그 **silent bypass**다. 게다가 DD7이 의미 lint를 거부하므로 저자가 `## User Intent`를 모호하거나 지시문처럼 써서 인용을 억제할 수 있고, raw 텍스트를 focus에 그대로 넣는 것 자체가 **prompt-injection 표면**이다.

  **수정 1 — 부재를 증거로 읽는다(DD3와 같은 원리).** finding이 하나 이상인데 `INTENT:` 마커가 **전부 없으면** 지시가 발효되지 않은 것이므로 verdict는 `inconclusive`(신규, block 집합)다. 인용 0건이 조용한 통과가 아니라 **명시적 차단**이 된다. 마커가 일부라도 있으면 지시는 발효된 것이고 없는 finding은 `none`으로 읽는다. 복구는 preamble이 실린 채 재실행하거나 audited override.

  **수정 2 — 주입 하드닝.** reference는 `<user_intent_reference>` 구분자로 감싸 **데이터로만 취급하라**고 명시하고, item 텍스트는 구분자·백틱·개행을 이스케이프하며 항목당 길이 상한(예 300자)을 둔다. 지시문 형태(`ignore`, `disregard`, `system:`, `you must` 등)가 constraint 텍스트에 있으면 DD6 구조 가드가 `present:false`로 떨군다. 이것은 DD7의 "의미 lint 거부"와 모순되지 않는다 — DD7이 거부한 것은 *저자 정당화가 섞였는지*를 판정하는 의미 판단이고, 이것은 *주입 형태*를 막는 구문 검사다.

  **남는 한계 (정직 표기)**: Codex가 성실히 `INTENT: none`을 전부 emit하면 우리는 리뷰어를 신뢰하는 것이고, 그것이 이 설계의 의도다(저자와 **다른 모델·다른 컨텍스트**의 판단이므로 자기심판이 아니다). 저자가 `## User Intent`를 의미적으로 빈약하게 써서 Codex가 정직하게 `none`을 내는 경로는 **여전히 남는다** — 이는 구문으로 막을 수 없고, `intent_items_count`와 reference digest를 receipt에 남겨 **감사 가능**하게만 한다. 완전한 해소는 M2의 fresh-subagent arbiter(UI9)가 소유한다. 인용 건수는 `intent_adjudication_counts.reviewer_asserted_conflicts`로 세어 M2에 실측 baseline을 준다.

**DD13 — 위협 모델을 명시한다 (santa-loop R1 M1·M2 공통 근원).** 이 저장소에는 **provenance가 없다** — receipt는 자기-해시(`hash.js`)만 하고 아티팩트에는 서명이 없으며, LLM은 워크트리 전체에 write 권한이 있다. 따라서 파일 기반 "봉인"은 **원리상** 결정적 위조자를 막지 못하고, 그것을 막는다고 쓰는 것은 거짓이다. M1이 실제로 겨냥하는 것은 **누락과 표류**(플래그를 빠뜨림, 단계를 잊음, 자신감 있는 finding에 굴복함)이지 스스로 가짜 리뷰 envelope를 조립하는 적대적 저자가 아니다. 이 구분 위에서 M1은 세 가지만 약속한다: (1) 위조 **창을 제거**할 수 있으면 제거한다(DD3 단일 프로세스), (2) 인증할 수 없으면 **위조의 보상을 0으로** 만든다(DD1b — legacy 위장이 dedupe 우회를 못 얻음), (3) 증거의 **부재를 통과로 읽지 않는다**(DD3 아티팩트 부재·DD12 마커 전무 → block). 서명 기반 provenance는 이 PRD의 scope가 아니며(UI1 MVP 2축), 필요해지면 별도 PRD 축이다.

**DD7 — anchoring 회피는 텍스트 lint가 아니라 구조 분리로.** reference에 저자 정당화가 섞이는 것(UI2 · PRD Risk 4)을 금지 문구 lint로 잡으려 하면 우회 가능하고 오발화한다. 대신 오라클은 `## User Intent` 표의 `Constraint` 열만 읽고 **plan의 다른 어떤 부분도 읽지 않는다**. 저자 근거는 `## Design Decisions`에 쓰이며 구조적으로 reference 경로에 도달할 수 없다. 표 안에 저자 근거를 섞는 것은 여전히 가능하나, 그것은 사용자가 직접 편집하는 파일에 대한 사용자 책임이며 lint로 대체할 수 없는 축이다(정직 표기).

**DD8 — reference 판독 실패는 classification enum을 늘리지 않고 fail-closed.** `--intent-reference-file`이 없거나 판독 불가면 `codex-invoke`는 spawn **전에** exit 2 + loud stderr로 종료한다. CLAUDE.md §3.3이 "정확히 14종"이라 명시한 classification 계층을 건드리지 않기 위한 선택이다(신규 enum 추가는 문서·소비처 전면 변경). 호출자 관점에선 `CODEX_EXIT != 0` → 기존 blocking 분기로 흡수된다.

**DD9 — receipt_hash carve-out 불필요.** 9 필드는 write 시점에 stamp되므로 처음부터 hash에 포함된다. briefing(post-write stamp)과 달리 사후 재봉인이 없어 `hash.js` carve-out을 추가하지 않는다 — §3.12 no-rehash 불변식 무손상.

**DD10 — L2는 plan-codex 한정, L1은 plan+pr.** PR 게이트의 L2(수용 판정 강제)는 M3 ship-gate가 이미 non-approving verdict를 mechanical HALT하므로 중복이며, PR 단계는 review-only 불변식 때문에 triage 재편집 자체가 금지다. 따라서 PR에는 L1(reference 주입)만 넣는다. Implement-Codex는 UI4로 전면 제외.

## Tasks

### Task 1: `intent-context.js` 오라클 (L1+L2 단일 SoT)
- **Action**: CREATE. exports:
  - `INTENT_KINDS`, **`INTENT_GATE_VERDICTS = ['preserved','skipped','skipped-unproven','incomplete','inconclusive','conflict_unresolved']`** (6종 — pass 집합 `{preserved, 증명된 skipped}`, block 집합 나머지 전부. R1 M5가 잡은 enum drift 정정 + DD12 신규 `inconclusive` 포함), `ADJUDICATION_VERDICTS = ['ACCEPT_NOW','DEFER_TO_BACKLOG','REJECT_YAGNI','REJECTED_BY_DESIGN']`
  - `isPrdModePlan(planText)` — `/^\*\*Source PRD\*\*:/m`
  - `extractIntentSection(planText)` → `{present, items:[{id, text, kind}], reasons:[]}` — `## User Intent` 표 파싱 + DD6 구조 가드(위반 시 `present:false` + `reasons`)
  - `buildIntentReference(items)` → `INTENT_REFERENCE_PREAMBLE` + ID/kind/text 만으로 된 목록 문자열(DD7 — 다른 입력 없음). preamble은 DD12대로 "충돌 판단 시 `UI<n>`를 명시하라"를 포함
  - `findReviewerAssertedConflicts(findings, items)` → `[{findingIndex, refIds}]` — finding `title`+`body`+`recommendation`에서 `UI\d+` 인용 추출(DD12 비대칭 검사 입력)
  - `resolveSkipProof({planText, reviewPayload, meta})` → `{proof, ok}` — DD1 3종 증명 mechanical 대조
  - `summarizeAdjudications({items, adjudications, findings})` → `{total, adjudicated, conflicts, conflicts_accepted, conflicts_rejected_by_design, dangling_refs, missing_rationale, reviewer_asserted_conflicts, reviewer_conflicts_downgraded}`
  - `decideIntentGate({markerActive, section, adjudications, reviewPayload, planText, meta})` → verdict enum(DD1 `skipped-unproven` + DD12 비대칭 포함)
  - `deriveIntentGateDecision(input, {forceOverrideActive})` → `{pass, verdict, blockingVerdict, overrideActive, reason}` (DD1/DD5 — `blockingVerdict` 보존)
  - `classifyIntentMeta(meta)` → `'approved' | 'blocked' | 'unknown'` — 단일 소비처 판별기. 키 부재(`!('intent_gate_verdict' in meta)`) → `unknown`(승인 아님, DD1b)
  - `isIntentApproved(meta)` → bool — DD11 dedupe 소비용. `classifyIntentMeta === 'approved'` **한정**. **`unknown`은 false**(legacy 위장의 보상을 0으로 — DD1b 정정, 초안의 `true`는 F3를 되살렸음)
  - `isIntentChainAllowed(meta)` → bool — `validate-cmd` 비-terminal chain 소비용. `approved` 또는 `unknown` → true(+warning), `blocked` → false. dedupe와 **의도적으로 다른** 정책이며 그 비대칭 근거는 DD1b에 있다
  - `parseIntentGateSkipReason(env)` → `{active, reason, rejected}` (strict validator 재사용)
- **Mirror**: `pr-ship-gate.js` 오라클 형태 + `design-critique-decide.js` 순수성 + `design-grounding.js#parseGroundingMode` loud fallback
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/intent-context.test.js`

### Task 2: 오라클 테스트 (결정 트리 전수)
- **Action**: CREATE `intent-context.test.js`. 케이스: (a) verdict 6종 전수 + 미지값 fail-closed, (b) marker 미발화(free-form / 증명된 findings 0) → `skipped`, (c) DD6 가드 6종(빈 표·중복 ID·미지 kind·1단어·placeholder·표 부재) 각각 `present:false`, (d) adjudication 누락 1건 → `incomplete`(silent-accept 검출 = UI10 1차 성공기준), (e) conflict + `ACCEPT_NOW` + override reason 부재 → `conflict_unresolved`, (f) conflict + `REJECTED_BY_DESIGN` + rationale → `preserved`, (g) dangling intent ref → `incomplete`, (h) override 시 `pass:true` ∧ `blockingVerdict` 보존(DD5), (i) `buildIntentReference`가 items 외 어떤 입력도 반영하지 않음(DD7 구조 증명), **(j) R1 F2 — 증명 없는 `skipped` → `skipped-unproven` block + 3종 증명 각각 pass**, **(k) santa-loop M2 — 키 부재(legacy) → `unknown`이며 승인 아님: `isIntentChainAllowed=true`(+warning)이지만 `isIntentApproved=false`. 키를 빼서 dedupe skip을 얻는 경로가 성립하지 않음**(DD1b `in` 연산자 검증), **(l) R1 F1 — review payload 획득 실패(runner가 Codex 응답을 못 읽음)는 `findings:[]`(runner 성공 + 빈 목록)와 다르다: 전자는 `incomplete`, 후자는 `skipped`+`no_codex_findings`**(증명 부재 ≠ 지적 없음), **(m) DD3b — runner가 Codex에 넘긴 본문의 digest가 receipt에 stamp된다(감사 앵커). 디스크 감사 사본을 사후 변조해도 판정·stamp가 불변**(단일 프로세스라 대조할 외부 파일이 없음 — 강제가 아니라 감사임을 test가 고정), **(n) R1 F4 — 리뷰어가 `UI3`를 인용한 finding을 `intent_conflict:'none'`으로 adjudicate → `conflict_unresolved`**, **(o) DD12 비대칭 방향 — 리뷰어 미인용 finding을 conflict로 올리는 것은 pass**, **(p) `isIntentApproved`/`isIntentChainAllowed` 진리표 — legacy 키 부재는 chain ALLOW이지만 dedupe는 false(santa-loop M2)**, **(q) santa-loop M3 — finding≥1 ∧ `INTENT:` 마커 전무 → `inconclusive` block**, **(r) reference 하드닝 — 구분자/백틱/개행 이스케이프 + 항목 길이상한 + 지시문 형태 constraint는 `present:false`**
- **Mirror**: `design-critique-decide.test.js`
- **Validate**: 위와 동일 (모든 case green)

### Task 3: `codex-invoke.js` focus reference 주입
- **Action**: UPDATE. `INTENT_REFERENCE_PREAMBLE` 상수 추가, `parseCliArgs`에 `--intent-reference-file <path>`, `composeFocus(focus, opts)`를 `DESIGN_SCOPE_PREAMBLE + INTENT_REFERENCE + base` 결정적 순서로 확장(intent는 base 직전 = recency). `runCli`가 파일을 읽어 `opts.intentReference`를 채우며 판독 실패 시 spawn 전 `return 2` + loud stderr(DD8). `opts.intentReference` strict 문자열 gate(비문자열/빈 문자열은 미주입).
- **Mirror**: 기존 `impeccableAvailable !== true` strict gate 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js`

### Task 4: `codex-invoke` 테스트 확장
- **Action**: UPDATE. (a) design+intent 동시 → 정확한 3-part 순서 문자열, (b) intent만 → design preamble 부재, (c) `--intent-reference-file` 지정했으나 파일 부재 → `runCli` 2 + spawn 미발생, (d) 미지정 → 기존 동작 byte-identical(회귀 0)
- **Validate**: 위와 동일

### Task 5: receipt schema 9 present-only 필드
- **Action**: UPDATE `schema.js`. `intent_section_present`(bool) · `intent_items_count`(int≥0|null) · `intent_reference_injected`(bool) · `intent_gate_verdict`(**enum 6종**|null) · `intent_adjudication_counts`(object|null, 9 정수 키) · `intent_gate_force_override`(bool) · `intent_gate_force_override_reason`(string|null, `force_override=true`면 strict validator) · **`intent_skip_proof`**(enum `free_form_plan|no_codex_findings|codex_disabled`|null — R1 F2) · **`intent_plan_digest`**(`SHA256_RE`|null — DD3b 감사 앵커). `makeSkeleton`이 9 키를 **항상** emit.
- **`null` verdict 금지 불변식 (santa-loop R1 M4 — Opus만 포착)**: `makeSkeleton`이 키를 항상 emit하므로 free-form plan의 **신규** receipt는 "키 존재 + 값 `null`"이 되고, DD1의 "미지값 block"과 DD4 무회귀가 정면 충돌한다. 해소: **in-scope 게이트(`mccp-plan-codex`)의 신규 write는 `intent_gate_verdict`를 절대 `null`로 남기지 않는다** — free-form plan이면 `skipped` + `intent_skip_proof='free_form_plan'`을 명시 stamp한다. 따라서 `null`은 **out-of-scope 게이트**(`mccp-implement-codex`는 UI4로 미적용, `mccp-pr-codex`는 L1 필드만)에서만 나타나고, 소비처는 `gate_id`로 scope한다. "gate가 안 돌았다"와 "gate가 돌고 실패했다"가 값 하나로 구별된다.
- **Mirror**: `schema.js:589-620` design_critique 블록 + `:239-253` pr_codex_force_override strict reason
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js`

### Task 6: `write.js` 파생 + fail-closed invariant (runtime primary locus)
- **Action**: UPDATE. write.js는 더 이상 marker를 **스스로 파생하지 않는다**(R1 M1 — 그 입력이 전부 위조 가능했다). 대신 in-process 호출자(Task 6b runner)가 넘긴 `intentDecision`을 받아 9 필드를 stamp하고, `pass===false`면 `INTENT_GATE_BLOCKED` throw → cli exit 12(receipt 미작성). CLI 표면(`--intent-adjudication-file` 등)은 **runner 전용**으로 유지하되, in-scope 게이트에서 runner를 거치지 않은 직접 호출은 `intentDecision` 부재로 `incomplete` fail-closed(수동 `/mccp:receipt-write` 복구 경로는 DD5 override가 유일 통로 — 이것이 정상 동작이며 Risks에 기재). `--findings-file`은 receipt 본문 기록 전용. gate scope는 `mccp-plan-codex` 한정, `mccp-pr-codex`는 L1 필드만, `mccp-implement-codex`는 UI4로 미적용.

### Task 6b: `plan-codex-runner.js` — 리뷰와 write를 한 프로세스로 (R1 M1 구조적 해소)
- **Action**: CREATE `plugins/mccp/scripts/lib/plan-codex-runner.js`. 한 프로세스에서 (1) plan 본문 read + sha256 계산(메모리 보관), (2) `intent-context#buildIntentReference`로 하드닝된 reference 생성 후 `codex-invoke` 호출, (3) 반환 envelope를 **메모리에서** `parseReviewPayload`로 파싱해 findings·`INTENT:` 마커 추출, (4) adjudication 입력과 합쳐 `deriveIntentGateDecision`, (5) 같은 프로세스에서 `receipt/write` 호출. 리뷰와 write 사이에 LLM이 손댈 파일이 **존재하지 않는다**. envelope는 감사 사본으로만 디스크에 남기고 **다시 읽지 않는다**.
- **Mirror**: `pr-phase-helpers/codex-runner.js`(Codex 호출 + 단일 JSON envelope emit) + `finalize-receipt.js`(그 결과로 receipt write) 체인 — 이미 PR 게이트가 쓰는 형태
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` (codex-invoke를 injected fake로 대체해 위조 창 부재를 구조적으로 검증)
- **Mirror**: `write.js#detectDispatchContext` marker-gated all-or-nothing + exit 12
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js`

### Task 7: `cli.js` 플래그 + `validate-cmd.js` canonical locus
- **Action**: UPDATE `cli.js` usage/pass-through(runner 전용 플래그). UPDATE `validate-cmd.js`: `mccp:prp-implement` 경로에서 upstream `mccp-plan-codex` receipt를 `isIntentChainAllowed`로 판정, false면 `blocking[]`에 `kind:'intent_gate_incomplete'` + INTEGRITY 힌트("Do NOT hand-edit the receipt — re-enter /mccp:plan or use MCCP_SKIP_INTENT_GATE").
- **완전한 결정 트리 (R1 M4/M7 — Opus 지적, 초안은 미명세)**: (1) `gate_id`가 in-scope 아님 → 판정 없음(pass). (2) 키 부재(legacy) → `unknown` → **ALLOW + warning**(DD1b). (3) `verdict='preserved'` → pass. (4) `verdict='skipped'` ∧ `intent_skip_proof` 유효 → pass. (5) `verdict='skipped'` ∧ 증명 없음 → `skipped-unproven` → block. (6) `verdict ∈ {incomplete, inconclusive, conflict_unresolved}` → block. (7) `verdict=null`인데 in-scope 게이트 → **불변식 위반**(Task 5가 금지) → block. (8) 미지 enum 값 → block. 8개 상태 전수를 Task 8 test가 assert한다.
- **Mirror**: `validate-cmd.js:494` design_critique_chain_divergent
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js`

### Task 7b: `dedupe.js` — 봉인된 verdict를 load-bearing으로 (R1 F3)
- **Action**: UPDATE `dedupe.js`. **`codexConverged`(L372)는 손대지 않는다.** 대신 `evaluateForDedupe`(L381~)의 `convergence.plan_codex_receipt` 축에만 `intent_approved: intentContext.isIntentApproved(planReceipt.meta)`를 추가하고, `skipSafe`가 그 값도 요구하게 한다. 위반 시 reason에 intent 축 명시(예: `plan-codex intent gate not approved (verdict=incomplete, override=true) — dual-review required (fail-closed)`).
- **왜 gate-specific이어야 하나 (santa-loop R2 M5 — GPT-5.4 포착, 초안이 만든 심각한 회귀)**: 초안은 "게이트별 convergence 술어"를 확장하라 했는데, 실제 코드에서 `codexConverged(receipt)`는 plan·implement receipt에 **공유되는 단일 헬퍼**다(L422/L428이 같은 함수를 호출 — 코드로 확인). 거기에 intent 조건을 넣으면 UI4로 **의도적으로 out-of-scope인** `mccp-implement-codex` receipt가 항상 `unknown → false`가 되어 **모든 decision의 dedupe가 영구히 깨진다**. 이는 흡수가 아니라 신규 회귀이고, 복구 경로도 없다. intent 조건은 **plan-codex receipt에만** 적용한다.
- **legacy는 `false`다 (R1 M2 — GPT-5.4 포착, 초안 정정)**: 초안은 legacy(키 부재)를 `true`로 통과시켰는데, 그러면 receipt에서 키만 빼면 override된 plan이 PR-Codex를 계속 skip시켜 **F3가 그대로 되살아난다**. 이제 `unknown → false`이므로 legacy plan receipt는 dedupe되지 않고 PR-Codex가 실발화한다. 비용은 리뷰 1회, 이득은 위장의 보상 0. **기존 dedupe 동작이 바뀌는 유일한 지점**이므로 Task 12 회귀에서 명시 확인한다.
- **Mirror**: `dedupe.js:374` 기존 fail-closed 술어 + `receipt-convergence.js` 단일 헬퍼 철학
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js`

### Task 8: receipt 계층 테스트 2본
- **Action**: CREATE `intent-gate-fields.test.js`(schema present-only · write 파생 · marker 발화 시 exit 12 · override 시 verdict 봉인) + `validate-cmd-intent-gate.test.js`(block/allow · 구 receipt 무손상 · aggregate `ok===false`)
- **Mirror**: `design-grounding-fields.test.js`, `validate-cmd-design-critique.test.js`
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/`

### Task 9: `plan.md` 배선 (L1 capture + L2 gate)
- **Action**: UPDATE. (1) `## PRD Artifact Output` 템플릿에 `## User Intent` 표를 **필수 섹션**으로 추가 + 작성 규칙(사용자 발화만, 저자 근거 금지) 명시. (2) 신규 **Phase 1.5 — CAPTURE USER INTENT**: 대화·PRD에서 명시 제약을 추출해 표로 기록. (3) Phase 5.2~5.6을 **runner 호출 1회로 대체**한다(santa-loop R2 M1 정합). command body는 `node plan-codex-runner.js --plan <path> --decision <slug> --adjudication-file <path>`만 호출하고, **아티팩트 경로를 marker 입력으로 forward하지 않는다** — `--codex-review-file`·`--intent-plan-digest` 같은 플래그는 존재하지 않는다(존재하면 DD3가 무너진다). runner가 reference 합성·Codex 호출·payload 파싱·digest 계산·판정·receipt write를 소유한다. (4) Phase 5.3 YAGNI Triage 표에 `Intent conflict` · `Rationale` 열 추가 + adjudication JSON만 tmp에 기록(이것은 **저자의 판정 입력**이지 리뷰어 증거가 아니므로 위조 대상이 아니다 — 저자가 자기 판정을 쓰는 채널이다). (5) 신규 **Phase 5.4a — INTENT-CONFLICT GATE**: runner가 block을 반환하면 `[MCCP-INTENT-GATE-STOP]` + 복구 지시(비대칭 위반 시 어떤 finding이 어떤 `UI<n>`를 인용했는지 명시). (6) Bash 백그라운드 실행·완료 marker 패턴은 runner 내부로 흡수(아래 실측 근거). **Bash 도구 timeout 상한(10분) < codex timeout(15분)이므로 5.2 호출은 백그라운드 실행 + 완료 파일 marker 패턴을 command body에 명시**(이번 cycle 실측: 470s로 foreground 10분 상한에 걸려 SIGTERM).
- **Mirror**: Phase 5.0 design-critique 블록의 오라클 호출·flag forward 형태
- **Validate**: `grep -n "## User Intent" plugins/mccp/commands/plan.md` + `node --test plugins/mccp/scripts/lib/tests/command-tmp-worktree-safe.test.js`

### Task 10: `pr.md` + `codex-runner.js` L1 forward
- **Action**: UPDATE. `codex-runner.js`의 `invoked` 분기에서 `args.intentReferenceFile`을 `--intent-reference-file`로 pass-through(다른 분기는 spawn 없음 → no-op). `pr.md` Phase 2.5.3이 plan 본문에서 섹션을 추출해 tmp 파일로 쓰고 `RUNNER_FLAGS`에 forward. 섹션 부재 시 플래그 생략(fail-open — PR은 L1만, L2 없음 per DD10).
- **Mirror**: `codex-runner.js:308` invokeArgs 조립 + `pr.md` RUNNER_FLAGS 조건 append
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/` (codex-runner 회귀)

### Task 11: 문서 + version
- **Action**: UPDATE `plugin.json` `1.23.0`→`1.23.1`; `CHANGELOG.md` `[1.23.1]` row; `CLAUDE.md` §3.13 신규 서브섹션(3-축 요약 + verdict enum + 복구 경로) + §4 토글 2건(`MCCP_SKIP_INTENT_GATE`, `MCCP_INTENT_GATE=off|enforce`); PRD Milestone 1 → `in-progress` + Plan 셀.
- **Mirror**: §3.7 bump 규칙(단일 milestone = patch), 기존 §3.9/§3.10 서브섹션 서술 톤
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `1.23.1`

### Task 12: 전체 회귀
- **Action**: 전 suite 실행. 기존 known-fail 2건(`design-critique-loop-e2e` fixture 부재, `verdict-label.test.js`)만 재현하고 신규 실패 0을 확인. `git diff --diff-filter=D --name-only origin/main...HEAD`로 §3.5.1 삭제 검증.
- **Validate**: 아래 Validation 블록 전체

## Validation

```bash
# 신규 오라클 — 결정 트리 전수 + anti-formalism 가드 + DD7 구조 증명
node --test plugins/mccp/scripts/lib/tests/intent-context.test.js

# focus 합성 순서 + reference 판독 실패 fail-closed + 미지정 회귀 0
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js

# receipt 계층 — schema present-only · write marker-gated exit 12 · override verdict 봉인
node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js
node --test plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js

# R1 F3 — 봉인된 intent verdict가 dedupe에서 load-bearing (override/legacy → PR-Codex 실발화)
node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js

# santa-loop R1 M1 — 리뷰와 write 사이에 위조 가능한 파일이 없음을 구조적으로 검증
node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js

# 인접 표면 무손상 (verdict SoT · dedupe · ship-gate · hash)
node --test plugins/mccp/scripts/lib/tests/codex-review-payload.test.js
node --test plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js
node --test plugins/mccp/scripts/receipt/tests/

# 전체 회귀 (known-fail 2건 외 신규 실패 0)
node --test plugins/mccp/scripts/lib/tests/
node --test plugins/mccp/scripts/hooks/tests/

# command body 계약 — 필수 섹션 존재 + worktree-safe tmp 경로
grep -n "^## User Intent" plugins/mccp/commands/plan.md
# santa-loop R2 M1 — command body가 아티팩트를 marker 입력으로 되돌리지 않았는지 (0건이어야 함)
! grep -nE '\-\-codex-review-file|\-\-intent-plan-digest' plugins/mccp/commands/plan.md plugins/mccp/scripts/receipt/cli.js
node --test plugins/mccp/scripts/lib/tests/command-tmp-worktree-safe.test.js

# version drift
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 1.23.1

# §3.5.1 — 머지가 조용히 삭제한 파일 없음
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| write-time hard-block이 기존 PRD-모드 plan 재실행을 막는다 | 中 | DD4 — 구 receipt는 무손상이고 신규 write만 판정. 복구 2경로(섹션 작성 / DD5 audited override). override는 verdict를 세탁하지 않아 감사 정직성 유지 |
| 의도 섹션이 형식적으로만 채워져 실효 없음 (PRD Risk 3) | 中 | DD6 구조 가드 — 빈 표·placeholder·1단어·중복 ID는 `present:false`로 떨어져 marker 발화 상태에서 `incomplete`. 의미 판정 불가는 정직 표기 |
| LLM이 adjudication JSON을 형식만 맞춰 무근거 판정 (R1 F4) | 中 | 완전성 검사만으로는 오심을 못 잡음이 확인됨 → DD12 비대칭 검사 추가(리뷰어가 인용한 `UI<n>`를 저자가 `none`으로 내리면 block). Codex가 인용하지 않은 finding은 여전히 미탐지 — **하한이지 상한이 아니며** 완전 해소는 M2 arbiter(UI9). 인용 건수를 세어 M2에 baseline 제공 |
| 봉인된 intent verdict가 승인 지점에서 무력 (R1 F3) | 中 | DD11 — dedupe 술어에 intent 승인 조건 AND 추가로 load-bearing화. ledger는 ship receipt만 보므로 구조적 미도달, derive/renderer 노출은 C1(LOW)로 M2 이연 |
| runner 경유 요구가 Phase 0 recovery·수동 `/mccp:receipt-write` 경로를 막는다 | 中 | 두 경로는 in-process review payload가 없으므로 PRD-모드 plan에서 `incomplete` → DD5 audited override가 유일 통로이고 그것이 감사 기록을 남기는 정상 동작. Task 6이 recovery 경로 메시지에 override 지시를 명시 |
| legacy receipt가 dedupe 대상에서 빠져 PR-Codex가 추가로 도는 비용 (santa-loop M2) | 中 | 의도된 fail-closed 대가. 비용 = 리뷰 1회 · 회피 시 비용 = dual-review 완전 우회. 기존 dedupe 동작이 바뀌는 유일 지점이므로 Task 12에서 명시 확인하고 CHANGELOG에 기재 |
| 단일 프로세스 runner가 `/mccp:plan` command body 구조를 크게 바꾼다 | 中 | PR 게이트의 `codex-runner.js`+`finalize-receipt.js`가 이미 같은 형태라 새 패턴이 아니다. Task 6b가 injected fake로 단위 검증하고, Task 9는 body를 runner 호출 1회로 **단순화**한다(Bash 백그라운드 패턴도 runner 안으로 흡수) |
| 저자가 `## User Intent`를 의미적으로 빈약하게 써서 Codex가 정직하게 `INTENT: none`을 내는 경로 (santa-loop M3 잔여) | 中 | 구문으로 막을 수 없음을 DD12에 명시. `intent_items_count` + reference digest를 receipt에 남겨 **감사 가능**하게만 하고, 완전 해소는 M2 fresh-subagent arbiter(UI9)로 이연 |
| focus 길이 증가로 Codex 응답 품질/latency 저하 | 低 | reference는 ID+kind+text 목록만(저자 근거 배제 → 짧다). UI7로 성능 최적화는 scope 밖. 관측되면 M2에서 cap 도입 |
| 9 필드 추가가 receipt_hash·derive·renderer를 깬다 | 低 | DD9 — write 시점 stamp라 carve-out 불필요. present-only이므로 derive frontmatter passthrough·frozen schema 무손상. Task 12가 전 suite로 검증 |
| 이번 cycle의 자기적용 불가(캐시 1.22.7)를 "동작 확인"으로 오인 | 中 | `## User Intent` 하단 정직 표기 + Task 9 e2e가 코드 경로를 대신 증명. 실발화는 머지 + `claude plugin update` 후 |

## Acceptance

- [ ] Task 1-12 전부 완료
- [ ] Validation 블록 전 명령 통과 (known-fail 2건 외 신규 실패 0)
- [ ] `## User Intent`가 PRD-모드 plan 템플릿의 **필수** 섹션이고, 부재/형식적일 때 marker 발화 상태에서 `incomplete`로 떨어진다
- [ ] adjudication 1건 누락 = `incomplete` = write exit 12 (UI10 "silent-accept 0건"의 mechanical 증명)
- [ ] intent-conflict + 수용 판정에 override reason 부재 = `conflict_unresolved` = block
- [ ] audited override가 `pass:true`를 주지만 `blockingVerdict`와 receipt verdict는 실제 값으로 봉인된다 (DD5)
- [ ] `buildIntentReference`가 `## User Intent` 표의 Constraint 열 외 어떤 plan 내용도 포함하지 않는다 (DD7 · UI2)
- [ ] `mccp-implement-codex`는 어떤 경로로도 intent gate에 진입하지 않는다 (UI4)
- [ ] `receipt.meta.intent_adjudication_counts`가 판정 카운트를 담는다 (PRD 3번째 metric: baseline 0 → 측정 존재)
- [ ] 구 receipt(**키 부재**)·free-form plan·**증명된** findings 0건이 신규 blocking을 유발하지 않는다 (DD1b)
- [ ] **R1 F1**: `--findings-file` 생략으로 marker를 우회할 수 없다 — marker는 runner가 메모리에서 읽은 review payload에서만 파생되고, payload 부재는 `incomplete`(findings 0 아님)
- [ ] **R1 F1/DD3b**: runner가 Codex에 넘긴 plan 본문의 digest가 receipt에 stamp돼 사후 감사가 가능하다(단일 프로세스라 대조할 외부 파일이 없다)
- [ ] **R1 F2**: 증명 없는 `skipped`는 `skipped-unproven`으로 block되고, 3종 증명 각각은 mechanical하게 대조된다
- [ ] **R1 F3**: `intent_gate_force_override=true` 또는 non-`preserved` plan receipt는 `codex_verdict='converged'`여도 dedupe되지 않아 PR-Codex가 실제로 발화한다
- [ ] **R1 F4/DD12**: 리뷰어가 `UI<n>`를 인용한 finding을 `intent_conflict:'none'`으로 adjudicate하면 `conflict_unresolved`로 block된다 (오심 탐지 가능성 확보)
- [ ] **santa-loop M1/DD3**: 리뷰와 receipt write 사이에 marker가 의존하는 **읽히는 파일이 존재하지 않는다** — `plan-codex-runner.js` 단일 프로세스. 감사 사본 envelope를 조작해도 판정이 바뀌지 않음을 test가 증명
- [ ] **santa-loop M2/DD1b**: legacy(키 부재) receipt가 `isIntentApproved=false`라 dedupe되지 않는다 — 키를 빼서 PR-Codex를 skip시키는 우회가 성립하지 않는다
- [ ] **santa-loop R2/DD11**: `codexConverged` 공유 헬퍼는 **불변**이고 intent 조건은 `evaluateForDedupe`의 plan-codex 축에만 붙는다 — out-of-scope `mccp-implement-codex`(intent 필드 `null`)가 dedupe를 깨뜨리지 않음을 test가 고정
- [ ] **santa-loop R2/DD3**: command body와 `receipt/cli.js` 어디에도 `--codex-review-file` / `--intent-plan-digest` 같은 **아티팩트 marker 입력이 존재하지 않는다**(Validation의 negative grep) — runner가 `no_codex_findings` 증명과 plan digest stamp의 유일한 출처
- [ ] **santa-loop R2**: plan 전체(DD·Task·Test·Validation·Acceptance·Codex triage 표)가 단일 아키텍처를 서술한다 — 폐기된 아티팩트 기반 흡수안이 어디에도 유효한 지시로 남아있지 않다
- [ ] **santa-loop M3/DD12**: finding이 있는데 `INTENT:` 마커가 전무하면 `inconclusive`로 **block**된다 (인용 0건이 조용한 통과가 아님) + reference가 `<user_intent_reference>` 구분자·이스케이프·길이상한으로 하드닝되고 지시문 형태 constraint는 DD6가 `present:false`로 떨군다
- [ ] **santa-loop M4/Task 5**: in-scope 게이트의 신규 receipt는 `intent_gate_verdict`가 절대 `null`이 아니다 (free-form plan도 `skipped` + proof 명시 stamp) → free-form 무회귀와 "미지값 block"이 충돌하지 않는다
- [ ] **santa-loop M5**: enum(6종)·필드 수(9)가 Summary/DD/Task/Validation/Acceptance 전체에서 일치한다
- [ ] **DD13**: plan 어디에도 provenance/서명이 제공하는 보증을 주장하지 않는다 ("봉인" 류 과장 0)
- [ ] `plugin.json` `1.23.1` + CHANGELOG + CLAUDE.md §3.13/§4 동기
- [ ] Patterns mirrored, not reinvented

## Design Critique

- 트리거: detector positive (axis a) — `impeccable-detect detect --mode plan` → `design_signal=true`, `signal_files=["plugins/mccp/scripts/receipt/write.js"]`(v1.3.0 M1 `DESIGN_SURFACE_PATHS` 화이트리스트: briefing-stamp locus).
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료.
- 라운드: 1 (`round=0`, cap=2) · verdict **CONVERGED** (`design-critique-decide#decideCritique`).
- Assessment A (design review): 이 plan의 `Files to Change` 17행 중 rendered surface(`.css/.scss/.tsx/.jsx/.vue/.svelte/.astro/.html`, `.claude/cache/*.md`)는 **0건**. 산출물은 pure oracle lib · receipt meta 필드 · slash-command body로 전부 control-plane이다. 4 Output Constraints 판정: (1) heading depth ≤ 3 — plan 본문 `#{4,6}` **0건**, 도입 surface 없음 → PASS. (2) 강조색 화면당 1개 — color token 도입 없음 → N/A. (3) raw markdown marker 금지 — 렌더 대상 없음, `MD0xx` 0건 → N/A. (4) 한 화면 항목 수 상한 — `list-of-N` 렌더 섹션 도입 없음 → N/A.
- Assessment B (detector, 실제 시도): `detect.mjs --json .claude/plans/codex-intent-context-m1.plan.md` → `[]`, exit 0 (clean). slug `claude-plans-codex-intent-context-m1-plan-md`. 브라우저 검증은 viewable target 부재로 미적용.
- 종합: A·B 모두 위반 0. 억지 finding 없음.
- Findings:
  | # | Severity | Section | Finding |
  |---|---|---|---|
  | C1 | LOW | Files to Change | 신규 `meta.intent_adjudication_counts`가 receipt에만 존재하고 PM 콘솔(`status.html`/`STATUS.md`)에는 노출되지 않는다. PRD의 "측정 가능성" metric은 receipt 층에서 충족되나 PM이 보는 표면에는 안 뜬다. UI1(MVP 2축)·UI7(성능/비용 최적화 scope 밖) 상 이번 milestone에서는 의도된 미노출이며, derive/renderer 확장은 M2 이후 축. |
- LOW 1건은 `decideCritique` 실패 조건(HIGH/CRITICAL/UNKNOWN) 미해당 → retry 없이 CONVERGED.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). plan 단계는 렌더 UI가 없어 어떤 impeccable 명령도 invoke하지 않는다 — 아래는 implementer용 체크리스트다. 이 plan은 rendered surface를 만들지 않으므로 implement 단계에서 `renderingSurface=0` 판정을 받아 refine/discovery는 recommend로 강등될 것으로 예상된다(Codex F4 selector).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) + `--impeccable-available` (design-scope preamble 적용)
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`) · `classification=ok` · `durationMs=470556` (7.8분)
- verdict: **`needs-attention`** (structured `.result.verdict`, `codex-review-payload#parseReviewPayload` — free-text scan 아님)
- 합치 결론: Codex는 No-ship을 냈고 **4건 전부 ACCEPT_NOW로 흡수**했다. 네 건 모두 M1 헤드라인("의도-충돌 finding의 silent-accept를 mechanical하게 0으로 만든다") **내부의** 구멍이라, 하나라도 이연하면 중심 주장이 거짓인 채 ship된다(v1.23.0 M3의 "cap 안의 구멍 = 헤드라인 거짓 → 이연 기각" 선례 적용). **DEFER_TO_BACKLOG 0건.**
- **액면 수용 아님 — 두 HIGH를 실제 코드로 재현 검증**:
  - F1: `schema.js:101`이 findings를 **top-level**에 두고(초안이 `resolution.findings`라 쓴 것은 사실 오류) `write.js:137`이 `readJsonIfPresent(args['findings-file'], [])` — **default `[]`**. 플래그 하나 생략으로 marker가 조용히 false. 확인됨.
  - F3: `dedupe.js:374` 술어는 `resolution.codex_verdict === 'converged'` **단독**. intent gate 미참조. 확인됨.
  - F4의 Codex 제안 원형(companion structured output에 `intent_conflict` 필드 **요구**)은 그 스키마가 codex plugin 소유라 우리 통제 밖 → 통제 가능한 형태(preamble 지시 + 오라클 비대칭 검사)로 **변형 수용**. 원안 그대로 채택하면 Codex가 필드를 빠뜨릴 때 검사가 조용히 무력해진다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Marker Depends On Unsealed Caller Data | HIGH | ACCEPT_NOW | `--findings-file` 생략만으로 게이트가 skip됨을 코드로 재현. ~~marker를 review 아티팩트로 이전 + plan digest bind~~ → **이 흡수안은 santa-loop R1에서 폐기됨**(그 아티팩트도 위조 가능했다). 현행 흡수는 단일 프로세스 runner(DD3/DD3b/DD13) |
  | F2 Skipped Is An Unproven Pass | HIGH | ACCEPT_NOW | `pr-ship-gate.js:55-68`이 이미 값을 치른 `skipped-unproven`과 동일 구멍. 3종 증명 요구 + 키-존재 legacy 판별 (DD1/DD1b) |
  | F3 Override Verdict Can Still Certify Downstream | HIGH | ACCEPT_NOW | 봉인만으로는 아무것도 막지 못함을 `dedupe.js:374`로 확인. dedupe 술어에 intent 승인 AND 추가 (DD11). ledger/derive 축은 구조적 미도달·C1로 분리 |
  | F4 Adjudication Still Rubber-Stamps Conflicts | MEDIUM | ACCEPT_NOW | PRD가 쓰인 이유 그 자체라 이연 불가. 리뷰어 주장 비대칭 검사로 오심 **탐지 가능**화 (DD12). 상한 아닌 하한임을 정직 표기 |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` 미기록
- Open Questions: 없음 — auto-CRITICAL 카탈로그(secret exposure / data loss / irreversible migration / auth bypass / external destination / crypto key) 해당 0건. 4건 모두 gate-integrity 축.
- Escalate 판정: R1 흡수로 (b)"미해소" 조건 불성립 → R2 미발화 (cap=1과도 정합)
- Codex session 참조: envelope `<gitdir>/mccp/tmp/codex-plan-r1.json` (`classification=ok`, `stdoutLen=14977`)

## External Research Provenance

- Source PRD: .claude/prds/codex-intent-context.prd.md
- References section sha256: 8fece5c94acfa1a583e0de7beae9e1d075c2461b9be38072f36cd8c9d21fd9bf
- Stamped at: 2026-07-30T09:32:46.066Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
