# Plan: Codex Review Intent-Context Preservation — M1

**Source PRD**: `.claude/prds/codex-intent-context.prd.md`
**Selected Milestone**: 1 — 의도 표면화 + 판정 커버리지 + 측정 인프라
**Complexity**: Medium

## Summary

`/mccp:plan`의 Plan-Codex 게이트는 리뷰어(out-of-process Codex)에게 사용자 대화 의도를 전달할 채널이 없고, finding 수용 판단이 어디에도 기록되지 않는다. M1은 (L1) plan 아티팩트의 구조화된 `## User Intent` 섹션 + 하드닝된 reference를 리뷰어 focus에 주입, (L2-A) **모든 finding에 명시 판정을 요구하는 완전성 강제**, (M) receipt `meta.intent_*` 9 필드 stamp로 세 축을 닫는다.

강제는 **단일 프로세스 runner**(`plan-codex-runner.js`)가 소유한다 — Codex 호출·판정·receipt write가 한 프로세스 안에서 일어나므로 중간 아티팩트를 조작할 창이 존재하지 않는다. 이는 발명이 아니라 PR 게이트의 `codex-runner.js` + `finalize-receipt.js` 체인과 같은 형태다.

**M1이 닫지 않는 것, 그리고 UI10을 달성하지 못한다는 것**: 저자가 모든 finding을 `intent_conflict: 'none'`으로 표시하면 커버리지 검사는 전부 통과한다. M1은 **누락**을 막고 **오심**은 막지 못한다.

따라서 **M1은 UI10(의도-충돌 finding의 silent-accept 0건)을 달성하지 않는다**(Plan-Codex F1 흡수 — 초안은 달성한다고 적었고 그것은 거짓이었다). 그 지표는 *intent-conflict finding*을 분모로 삼는데, 저자가 충돌을 `none`으로 표시하면 그 finding이 분모에서 빠져 지표가 **동어반복**이 된다. 모집단이 저자 라벨과 무관해지려면 리뷰어가 독립적으로 충돌을 주장하는 신호가 필요하고 그것은 M1.5가 소유한다. M1이 실제로 주는 것은 **커버리지 강제 + payload bind + 측정 인프라**이며, UI10 달성 milestone은 **M1.5**다.

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
| UI11 | santa-loop 미해소분은 M1 scope를 축소해 덜어내되, **M2에 합치지 말고 M1.5로 별도 분리**한다 | direction |

> **자기적용 유보(정직 표기)**: 이번 cycle의 게이트는 설치 캐시(`1.22.7`)의 구 command body로 실행되므로 이 섹션이 실제로 focus에 주입되지는 **않는다**. 자기적용은 머지 + `claude plugin update` 이후 발효한다. Task 9의 e2e가 그 경로를 코드 레벨로 대신 증명한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Pure 오라클 + 이중 locus | `plugins/mccp/scripts/lib/pr-ship-gate.js:86` | `deriveShipDecision(receipt, {forceOverrideActive})` → `{ship, blockingVerdict, overrideActive, reason}`. override가 `blockingVerdict`를 **보존**해 verdict 세탁 금지 |
| Skip proof 마커 | `plugins/mccp/scripts/lib/pr-ship-gate.js:55-68` | `SKIP_PROOF_META_KEYS` + `hasSkipProof` — 증명 없는 `skipped`는 `skipped-unproven`으로 fail-closed |
| Enum verdict 오라클 | `plugins/mccp/scripts/lib/design-critique-decide.js:40` | `decideCritique({findings, round, cap})` → 문자열 enum. 순수·dep-free·부작용 0 |
| 리뷰 호출 + receipt write 단일 체인 | `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` + `finalize-receipt.js` | Codex spawn → 결과를 in-process로 소비 → receipt write. 중간 파일이 판정 입력이 아님 |
| Focus 합성 | `plugins/mccp/scripts/lib/codex-invoke.js:142` | `composeFocus(focus, opts)` + `DESIGN_SCOPE_PREAMBLE`. `opts.x !== true` strict gate |
| 구조화 payload를 JSON 파일 채널로 | `plugins/mccp/scripts/receipt/write.js:315` (`impeccable-commands-routed-file`) | 다필드 구조체는 CLI 문자열이 아니라 `--*-file <path>` + `readJsonIfPresent` |
| Present-only meta 필드 | `plugins/mccp/scripts/receipt/schema.js:589-620` + `:830` | `!== null && !== undefined` 가드 + `makeSkeleton` default |
| Strict reason validator | `plugins/mccp/scripts/receipt/lib/force-override-reason.js` | audited escape reason은 ≥30자·≥3단어·no placeholder/URL-only/banlist |
| validate blocking kind | `plugins/mccp/scripts/receipt/validate-cmd.js:494` | `blocking[].kind` + INTEGRITY 힌트. aggregate `ok===false`로 HALT |
| Tests | `plugins/mccp/scripts/lib/tests/design-critique-decide.test.js`, `plugins/mccp/scripts/receipt/tests/design-grounding-fields.test.js` | `node:test` + `node:assert`, 오라클 결정 트리 전수 + 필드 present-only 회귀 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/intent-context.js` | CREATE | L1+L2-A 단일 pure 오라클 — 섹션 파싱·reference 합성(하드닝)·adjudication 완전성 판정·counts 요약 |
| `plugins/mccp/scripts/lib/tests/intent-context.test.js` | CREATE | 오라클 결정 트리 전수 + anti-formalism 가드 + 주입 하드닝 |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | CREATE | Codex 호출 + 판정 + receipt write를 한 프로세스로 (DD3) |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | CREATE | injected fake codex-invoke로 위조 창 부재·fail-closed·digest 재검증 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | `--intent-reference-file` + `composeFocus`에 `INTENT_REFERENCE_PREAMBLE` prepend(결정적 순서) + 판독 실패 시 spawn 전 exit 2 |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATE | focus 합성 순서 + 파일 부재 fail-closed + 미지정 시 회귀 0 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.intent_*` 9 present-only 필드 + `makeSkeleton` default |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | runner가 넘긴 `intentDecision`으로 9 필드 stamp + in-scope 게이트 fail-closed |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | usage + runner 전용 플래그 pass-through |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | blocking kind `intent_gate_incomplete` (canonical read-back locus) |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATE | plan-codex 축에만 intent 승인 조건 추가 (공유 헬퍼 불변 — DD9) |
| `plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js` | CREATE | schema present-only + write 파생 + fail-closed + override 봉인 |
| `plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js` | CREATE | 8-state 결정 트리 전수 + 구 receipt 무손상 |
| `plugins/mccp/scripts/receipt/tests/dedupe.test.js` | UPDATE | plan 축 intent 조건 + implement receipt 무영향 회귀 |
| `plugins/mccp/commands/plan.md` | UPDATE | `## User Intent` 필수 섹션 + Phase 1.5 capture + Phase 5를 runner 호출로 재구성 |
| `plugins/mccp/commands/pr.md` | UPDATE | L1만 — plan의 intent reference를 PR-Codex focus에 forward |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATE | `--intent-reference-file` pass-through(invoked 분기 한정) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.0` → `1.23.1` (단일 milestone = patch, §3.7) |
| `CHANGELOG.md` | UPDATE | `[1.23.1]` row |
| `CLAUDE.md` | UPDATE | §3.13 신규 서브섹션 + §4 운영 토글 1건(`MCCP_SKIP_INTENT_GATE`) |
| `.claude/prds/codex-intent-context.prd.md` | UPDATE | Milestone 1 in-progress + M1.5 신설 (완료) |

## Adjudication 데이터 계약

오라클과 command body가 공유하는 유일한 구조. 인덱스만으로는 **어느 리뷰의 finding인지**가 고정되지 않으므로(Plan-Codex F3), 파일 전체를 review payload에 bind하고 각 행을 finding 내용에 bind한다.

```jsonc
{
  "plan_path": ".claude/plans/<name>.plan.md",
  "round": 1,
  "review_payload_digest": "sha256:…",     // runner가 메모리 payload로 계산한 값과 일치해야 함 (F3)
  "adjudications": [
    {
      "finding_index": 0,                    // review payload findings[] 인덱스 (0-based, 필수)
      "finding_digest": "sha256:…",          // 해당 finding의 canonical digest — 재정렬/재생성 탐지 (F3)
      "intent_conflict": "none",             // "none" | "UI3" (표에 존재하는 id여야 함)
      "verdict": "ACCEPT_NOW",               // ADJUDICATION_VERDICTS 중 하나
      "rationale": "…",                      // 비어 있으면 incomplete
      "intent_override_reason": null         // intent_conflict≠none ∧ verdict=ACCEPT_NOW면 필수
    }
  ]
}
```

완전성 규칙(전부 mechanical): **`review_payload_digest`가 runner의 메모리 payload digest와 불일치 → `incomplete`**(stale/타 리뷰 파일 차단) · **각 행의 `finding_digest`가 그 인덱스 finding의 canonical digest와 불일치 → `incomplete`**(같은 길이의 재정렬·재생성 payload 차단) · `findings.length`개의 항목이 `finding_index` 0..N-1을 **빠짐없이 정확히 한 번씩** 덮어야 한다(누락·중복·범위 밖 → `incomplete`) · `rationale` 비어 있음 → `incomplete` · `intent_conflict`가 `## User Intent` 표에 없는 id → `incomplete`(dangling) · `intent_conflict≠none` ∧ `verdict='ACCEPT_NOW'` ∧ `intent_override_reason` 부재 → `conflict_unresolved`.

## Design Decisions

**DD1 — 판정 집합, 그리고 `skipped`는 증명된 것만.** pass 집합 `{preserved, 증명된 skipped}`, block 집합 `{incomplete, conflict_unresolved, skipped-unproven}`, 미지 값은 block. `skipped`가 pass여야 하는 이유는 정당한 skip이 실재하기 때문이다 — free-form(비-PRD) plan, Codex findings 0건, `MCCP_CODEX_DISABLED=1`. 그러나 **증명 없는 `skipped`는 무료 통과 티켓**이며 이는 `pr-ship-gate.js:55-68`이 이미 한 번 값을 치른 것과 같은 구멍이다. 따라서 `meta.intent_skip_proof ∈ {free_form_plan, no_codex_findings, codex_disabled}` 하나를 반드시 동반하고 각각 mechanical하게 대조된다: `free_form_plan` → plan 본문에 `**Source PRD**:` 부재 · `no_codex_findings` → runner가 **메모리에서** 파싱한 payload가 `findings.length === 0` · `codex_disabled` → `meta.codex_disabled === true`.

**DD2 — legacy는 "승인"이 아니라 "모름"이다.** 키 부재(`!('intent_gate_verdict' in meta)`)는 그 필드가 존재하기 전에 쓰인 receipt를 뜻한다. **전제는 실증됐다**: `makeSkeleton`은 `write.js:170` 한 곳에서 **새 receipt를 만들 때만** 호출되고 디스크의 기존 receipt에 default를 병합하는 경로가 없다. 실제 corpus가 이를 보인다 — `archive-cleanup-1-20-14.json`은 `design_critique_verdict` 키는 있고(그 필드보다 나중 작성) `merged_verify_verdict` 키는 없다(v1.20.12에서 나중 도입). 이 전제를 명시하는 이유는 두 번의 독립 리뷰가 여기서 오독했기 때문이다.

  legacy를 승인으로 승격시키지 않는다. 소비처별로 다르게 취급한다:
  - **`validate-cmd` 비-terminal chain**: `unknown` → ALLOW + warning. 구 receipt로 진행 중인 작업을 소급 차단해도 얻는 것이 없다(그 plan에는 애초에 의도 기록이 없고, 강제는 다음 write부터 걸린다).
  - **`dedupe`**: `unknown` → `isIntentApproved=false` → dedupe 불가 → PR-Codex 실발화. 비용은 리뷰 1회, 반대 방향 비용은 dual-review 완전 우회. 동시에 **"키를 빼면 공짜 dedupe skip"이라는 유인이 사라진다**(위조의 보상을 0으로 만드는 것이 인증 없이 위조를 무력화하는 유일한 방법).

**DD3 — 위조 창을 감시하지 말고 없앤다.** Codex 호출과 receipt write를 한 프로세스(`plan-codex-runner.js`)로 합친다. runner가 codex-invoke를 호출하고, 반환 envelope를 **메모리에서** `parseReviewPayload`로 읽어 findings를 얻고, 같은 프로세스에서 receipt를 쓴다. 리뷰와 write 사이에 LLM이 손댈 수 있는 판정 입력 파일이 **존재하지 않는다**. envelope는 감사 사본으로만 디스크에 남기고 **다시 읽지 않는다**. `--codex-review-file` 같은 아티팩트 marker 입력 플래그는 **만들지 않는다**(존재하면 이 결정이 무너진다 — Validation의 negative grep이 재도입을 막는다).

  `parseReviewPayload`가 `null`(stdout 부재/malformed)을 반환하면 runner는 그것을 "findings 0건"으로 읽지 않고 **`incomplete`로 종료**한다. 증명의 부재를 통과로 읽지 않는 것이 이 축의 핵심이며, 이 분기는 `decideIntentGate` 진입 **전에** runner가 소유한다(오라클은 `reviewPayload`를 non-null로만 받는다).

**DD4 — 리뷰된 본문이 실제로 봉인되게 한다 (Plan-Codex F2 흡수 — 초안 정정).** `write.js:123`은 `plan_hash`를 write 시점에 **디스크에서 다시 읽어** 계산한다. 따라서 단일 프로세스라는 사실만으로 TOCTOU가 사라지지 않는다.

  초안은 write **직후** 대조하고 불일치 시 receipt를 남긴 채 실패 보고하려 했다. **그것은 너무 늦다** — write.js가 *바뀐* plan으로 계산한 `plan_hash`는 그 receipt 안에서 **자기정합적**이므로, 옛 본문에 대한 intent verdict를 실은 receipt가 디스크에 남고 이후 소비처는 runner의 휘발성 실패 보고를 보지 못한 채 그것을 신뢰한다.

  수정 — 두 겹으로 닫는다. **(1) write 전 차단**: runner는 `receipt/write` 호출 **직전에** plan을 다시 읽어 digest를 대조하고, 불일치면 **write를 하지 않고** `incomplete`로 종료한다(나쁜 receipt가 애초에 생기지 않는다). **(2) canonical 규칙**: 그럼에도 어떤 경로로 그런 receipt가 존재하면, in-scope 게이트에서 `meta.intent_plan_digest !== plan_hash`인 receipt를 `validate-cmd`가 block하고 `dedupe`가 not-approved로 읽는다. 이로써 stamp된 digest가 장식이 아니라 **load-bearing**이 된다.

**DD5 — 이중 locus·단일 오라클.** (1) **runtime primary** = runner. 판정이 block 집합이면 receipt를 쓰지 않고 exit 12 → Phase 5.7 validate 실패 → `/mccp:prp-implement` 진입 불가. LLM이 단계를 "잊는" 것으로는 통과할 수 없다(UI3의 mechanical 절반). (2) **canonical 표면** = `validate-cmd`가 upstream plan-codex receipt를 읽어 `blocking[].kind='intent_gate_incomplete'`. 양쪽이 같은 `deriveIntentGateDecision`을 호출하므로 판정이 갈릴 수 없다. **write.js는 판정하지 않는다** — runner가 넘긴 결정을 stamp하고, in-scope 게이트인데 결정이 없으면 fail-closed한다.

**DD6 — audited override는 verdict를 세탁하지 않는다.** `MCCP_SKIP_INTENT_GATE="<reason>"`(strict validator)은 이번 호출의 mechanical HALT만 해제한다. receipt는 실제 `intent_gate_verdict`를 봉인한 채 `meta.intent_gate_force_override=true` + reason과 함께 작성된다. `blockingVerdict`를 보존하는 이유는 M3 DD3와 같다 — `preserved`로 매핑하면 감사 corpus가 거짓이 되고 후속 소비처가 오염된다.

**DD7 — 형식적 섹션(anti-formalism) 구조 가드.** 오라클이 mechanical 최소치를 강제한다: 행 ≥1 · ID `^UI\d+$` 유일 · `kind ∈ {constraint, exception, exclusion, direction}` · constraint 텍스트 ≥3 단어 · placeholder(`{...}`, `TODO`, `TBD`, `N/A`, `-`, `—`) 미포함 · 지시문 형태(`ignore`, `disregard`, `system:`, `you must` 등) 미포함. 위반 시 섹션을 **부재로 취급**(`present=false`)한다. 의미 판정은 못 하지만 "빈 표를 붙여 게이트 통과"와 "주입 시도"는 구조적으로 막는다.

**DD8 — anchoring 회피는 텍스트 lint가 아니라 구조 분리로.** 오라클은 `## User Intent` 표의 `Constraint` 열만 읽고 plan의 다른 어떤 부분도 읽지 않는다. 저자 근거는 `## Design Decisions`에 있으며 구조적으로 reference 경로에 도달할 수 없다. reference는 `<user_intent_reference>` 구분자로 감싸 **데이터로만 취급하라**고 명시하고, item 텍스트의 구분자·백틱·개행을 이스케이프하며 항목당 300자 상한을 둔다. 표 안에 저자 근거를 섞는 것은 여전히 가능하나 그것은 사용자가 직접 편집하는 파일에 대한 사용자 책임이다(정직 표기).

**DD9 — dedupe 조건은 gate-specific이다.** `codexConverged(receipt)`(`dedupe.js:372`)는 plan·implement receipt **양쪽에 쓰이는 공유 함수**다(L422/L428). 거기에 intent 조건을 넣으면 UI4로 의도적 out-of-scope인 `mccp-implement-codex`가 항상 `unknown → false`가 되어 **모든 decision의 dedupe가 영구히 죽는다**. 따라서 공유 헬퍼는 건드리지 않고, `evaluateForDedupe`의 `plan_codex_receipt` 축에만 `intent_approved`를 추가한다. out-of-scope 게이트의 intent 필드가 `null`인 것은 정상 상태이며 판정 대상이 아니다.

**DD10 — 위협 모델을 명시한다.** 이 저장소에는 **provenance가 없다** — receipt는 자기-해시(`hash.js`)만 하고 아티팩트에 서명이 없으며 LLM은 워크트리 전체에 write 권한이 있다. 따라서 파일 기반 "봉인"은 원리상 결정적 위조자를 막지 못하고, 막는다고 쓰는 것은 거짓이다. M1이 겨냥하는 것은 **누락과 표류**(플래그를 빠뜨림, 단계를 잊음)이지 가짜 리뷰 envelope를 조립하는 적대적 저자가 아니다. 그 위에서 M1은 셋만 약속한다: 위조 **창을 제거**할 수 있으면 제거하고(DD3), 인증할 수 없으면 **위조의 보상을 0으로** 만들고(DD2 dedupe), 증거의 **부재를 통과로 읽지 않는다**(DD3 payload null → incomplete). 서명 기반 provenance는 이 PRD scope 밖이다.

**DD11 — M1 / M1.5 / M2 경계.** M1은 **누락**을 막는다(모든 finding이 명시 판정을 받지 않으면 receipt가 없다 = UI10 1차 성공기준). M1은 **오심**을 막지 못한다 — 저자가 전부 `intent_conflict: 'none'`으로 찍으면 완전성 검사는 통과한다. 오심 탐지(리뷰어의 per-finding `INTENT:` 계약 + 비대칭 대조 + 불응 시 block)는 **M1.5**가 소유하고, 심판 컨텍스트 분리는 **M2**가 소유한다. 이 경계는 santa-loop 3라운드가 오심 탐지 축에서만 반복 비수렴한 실측 결과로 그어졌다(UI11).

## Tasks

### Task 1: `intent-context.js` 오라클 (L1 + L2-A 단일 SoT)
- **Action**: CREATE. exports: `INTENT_KINDS` · `INTENT_GATE_VERDICTS = ['preserved','skipped','skipped-unproven','incomplete','conflict_unresolved']` · `ADJUDICATION_VERDICTS` · `isPrdModePlan(planText)` · `extractIntentSection(planText)`(DD7 가드 포함) · `buildIntentReference(items)`(DD8 하드닝) · `resolveSkipProof({planText, reviewPayload, meta})` · `summarizeAdjudications({items, adjudications, findings})` · `decideIntentGate({markerActive, section, adjudications, reviewPayload, planText, meta})` · `deriveIntentGateDecision(input, {forceOverrideActive})` → `{pass, verdict, blockingVerdict, overrideActive, reason}` · `classifyIntentMeta(meta)` → `'approved'|'blocked'|'unknown'` · `isIntentApproved(receipt)`(dedupe용, `unknown`은 false, `intent_plan_digest !== plan_hash`도 false — DD4-2) · `isIntentChainAllowed(meta)`(chain용, `unknown`은 true) · `parseIntentGateSkipReason(env)`
- **Mirror**: `pr-ship-gate.js` 오라클 형태 + `design-critique-decide.js` 순수성
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/intent-context.test.js`

### Task 2: 오라클 테스트 (결정 트리 전수)
- **Action**: CREATE. (a) verdict 5종 전수 + 미지값 fail-closed · (b) marker 미발화(free-form / 증명된 findings 0) → `skipped` + proof · (c) DD7 가드 7종(빈 표·중복 ID·미지 kind·1단어·placeholder·표 부재·지시문 형태) 각각 `present:false` · (d) **adjudication 누락 1건 → `incomplete`**(커버리지 강제의 mechanical 증명 — UI10 달성은 M1.5 소유) · (e) 인덱스 중복/범위 밖 → `incomplete` · (f) `rationale` 빈 문자열 → `incomplete` · (g) dangling `intent_conflict` id → `incomplete` · (h) conflict + `ACCEPT_NOW` + override reason 부재 → `conflict_unresolved` · (i) conflict + `REJECTED_BY_DESIGN` + rationale → `preserved` · (j) 증명 없는 `skipped` → `skipped-unproven` + 3종 증명 각각 pass · (k) 키 부재 → `isIntentChainAllowed=true` ∧ `isIntentApproved=false`(DD2) · (l) override 시 `pass:true` ∧ `blockingVerdict` 보존(DD6) · (m) `buildIntentReference`가 items 외 입력 미반영 + 구분자/백틱/개행 이스케이프 + 300자 상한(DD8) · **(n) F3 — `review_payload_digest` 불일치 → `incomplete`** · **(o) F3 — 같은 길이의 재정렬/재생성 payload에 대해 stale adjudication이 모든 인덱스 규칙을 만족해도 per-finding digest 불일치로 `incomplete`**(회귀 test 필수) · **(p) F2/DD4-2 — `intent_plan_digest !== plan_hash`면 `isIntentApproved=false` ∧ validate block**
- **Validate**: 위와 동일

### Task 3: `codex-invoke.js` reference 주입
- **Action**: UPDATE. `INTENT_REFERENCE_PREAMBLE` 상수 + `--intent-reference-file` 파싱 + `composeFocus`를 `DESIGN_SCOPE_PREAMBLE + INTENT_REFERENCE + base` 결정적 순서로 확장(intent는 base 직전 = recency). 파일 판독 실패 시 spawn 전 `return 2` + loud stderr(classification enum을 늘리지 않기 위한 선택 — CLAUDE.md §3.3의 "정확히 14종"을 보존).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js`

### Task 4: `codex-invoke` 테스트 확장
- **Action**: UPDATE. (a) design+intent 동시 → 정확한 3-part 순서 · (b) intent만 → design preamble 부재 · (c) 파일 부재 → exit 2 + spawn 미발생 · (d) 미지정 → 기존 동작 byte-identical
- **Validate**: 위와 동일

### Task 5: receipt schema 9 present-only 필드
- **Action**: UPDATE `schema.js`. `intent_section_present`(bool) · `intent_items_count`(int≥0|null) · `intent_reference_injected`(bool) · `intent_gate_verdict`(enum 5종|null) · `intent_adjudication_counts`(object|null) · `intent_gate_force_override`(bool) · `intent_gate_force_override_reason`(string|null, strict validator) · `intent_skip_proof`(enum 3종|null) · `intent_plan_digest`(`SHA256_RE`|null). `makeSkeleton`이 9 키를 항상 emit.
- **`null` verdict 금지 불변식**: in-scope 게이트(`mccp-plan-codex`)의 신규 write는 `intent_gate_verdict`를 절대 `null`로 남기지 않는다 — free-form plan도 `skipped` + `free_form_plan` proof를 명시 stamp한다. `null`은 out-of-scope 게이트에서만 나타나고 소비처는 `gate_id`로 scope한다.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js`

### Task 6: `write.js` — stamp only, 판정 없음
- **Action**: UPDATE. runner가 넘긴 `intentDecision`으로 9 필드 stamp. `pass===false`면 `INTENT_GATE_BLOCKED` throw → cli exit 12. **in-scope 게이트인데 `intentDecision`이 없으면 `incomplete` fail-closed**(수동 `/mccp:receipt-write`·Phase 0 recovery의 유일 통로는 DD6 override — Risks에 기재). marker 자체 파생 없음.
- **Validate**: 위와 동일

### Task 6b: `plan-codex-runner.js` (DD3/DD4)
- **Action**: CREATE. 한 프로세스에서 (1) plan read + sha256 보관 · (2) `buildIntentReference` → reference 파일 → codex-invoke 호출 · (3) 반환 envelope를 메모리에서 `parseReviewPayload`; `null`이면 즉시 `incomplete` 종료(DD3) · (4) 메모리 payload로 `review_payload_digest`와 per-finding digest를 계산해 adjudication 파일의 값과 대조, 불일치면 `incomplete`(F3) · (5) `deriveIntentGateDecision` · (6) **write 직전** plan을 다시 읽어 digest 재대조, 불일치면 **write 없이** `incomplete` 종료(DD4-1) · (7) `receipt/write` 호출. envelope는 감사 사본으로만 기록하고 재read 금지.
- **Mirror**: `pr-phase-helpers/codex-runner.js` + `finalize-receipt.js` 체인
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js`

### Task 7: `cli.js` + `validate-cmd.js` (canonical locus)
- **Action**: UPDATE. cli usage/pass-through(runner 전용). validate는 upstream plan-codex receipt를 `isIntentChainAllowed`로 판정, false면 `blocking[].kind='intent_gate_incomplete'` + INTEGRITY 힌트.
- **결정 트리 9-state 전수**: (1) out-of-scope gate → 판정 없음 · (2) 키 부재 → ALLOW+warning · (3) `preserved` → pass · (4) `skipped`+유효 proof → pass · (5) `skipped`+proof 부재 → block · (6) `incomplete`/`conflict_unresolved` → block · (7) in-scope인데 `null` → 불변식 위반 → block · (8) 미지 enum → block · **(9) in-scope인데 `meta.intent_plan_digest !== plan_hash` → block(DD4-2 — 리뷰된 본문과 봉인된 본문 불일치)**
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js`

### Task 7b: `dedupe.js` (DD9)
- **Action**: UPDATE. `codexConverged`(L372)는 **불변**. `evaluateForDedupe`의 `convergence.plan_codex_receipt`에 `intent_approved: isIntentApproved(planReceipt)`를 추가하고 `skipSafe`가 이를 요구. `isIntentApproved`는 meta뿐 아니라 **`intent_plan_digest`와 receipt의 `plan_hash` 일치까지** 확인한다(DD4-2). 위반 시 reason에 intent 축 명시.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js`

### Task 8: receipt 계층 테스트 2본
- **Action**: CREATE `intent-gate-fields.test.js`(schema present-only · write stamp · in-scope 결정 부재 시 exit 12 · override verdict 봉인) + `validate-cmd-intent-gate.test.js`(8-state 전수 · 구 receipt 무손상)
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/`

### Task 9: `plan.md` 배선
- **Action**: UPDATE. (1) PRD 템플릿에 `## User Intent`를 **필수 섹션**으로 + 작성 규칙 명시 · (2) 신규 **Phase 1.5 CAPTURE USER INTENT** · (3) Phase 5.2~5.6을 **runner 호출 1회로 대체**(아티팩트 경로를 판정 입력으로 forward하지 않음) · (4) Phase 5.3 triage 표에 `Intent conflict`·`Rationale` 열 + adjudication JSON 기록(위 데이터 계약 형식) · (5) 신규 **Phase 5.4a**: runner가 block이면 `[MCCP-INTENT-GATE-STOP]` + 복구 지시 · (6) Codex 호출은 **백그라운드 실행 + 완료 marker** 패턴을 runner 내부에 흡수(실측: Bash 도구 상한 10분 < codex timeout 15분, 470s 소요 사례로 foreground가 SIGTERM됨)
- **Validate**: `grep -n "^## User Intent" plugins/mccp/commands/plan.md` + Validation의 negative grep

### Task 10: `pr.md` + `codex-runner.js` L1 forward
- **Action**: UPDATE. codex-runner의 `invoked` 분기에서 `--intent-reference-file` pass-through. pr.md가 plan에서 섹션을 추출해 reference 파일을 만들고 forward. 섹션 부재 시 플래그 생략(PR은 L1만 — L2는 plan 단계 소유).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/`

### Task 11: 문서 + version
- **Action**: UPDATE `plugin.json` `1.23.0`→`1.23.1` · `CHANGELOG.md` · `CLAUDE.md` §3.13 + §4 토글 **1건(`MCCP_SKIP_INTENT_GATE`)**. M1이 오심을 막지 못하고 M1.5가 그것을 소유한다는 경계를 문서에 명시.
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `1.23.1`

### Task 12: 전체 회귀
- **Action**: 전 suite 실행. 기존 known-fail 2건만 재현하고 신규 실패 0. `git diff --diff-filter=D --name-only origin/main...HEAD`로 §3.5.1 삭제 검증. dedupe 동작 변화(legacy plan receipt가 dedupe되지 않음)를 명시 확인.

## Validation

```bash
# 오라클 — 결정 트리 전수 + anti-formalism + 주입 하드닝 + payload bind(F3)
node --test plugins/mccp/scripts/lib/tests/intent-context.test.js

# 단일 프로세스 runner — 위조 창 부재 · payload null fail-closed · plan_hash 재검증
node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js

# focus 합성 순서 + reference 판독 실패 fail-closed + 미지정 회귀 0
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js

# receipt 계층 — schema · write stamp · 8-state validate · dedupe gate-specific
node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js
node --test plugins/mccp/scripts/receipt/tests/validate-cmd-intent-gate.test.js
node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js

# 인접 표면 무손상
node --test plugins/mccp/scripts/lib/tests/codex-review-payload.test.js
node --test plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js
node --test plugins/mccp/scripts/receipt/tests/

# 전체 회귀 (known-fail 2건 외 신규 실패 0)
node --test plugins/mccp/scripts/lib/tests/
node --test plugins/mccp/scripts/hooks/tests/

# command body 계약
grep -n "^## User Intent" plugins/mccp/commands/plan.md
# DD3 — 아티팩트가 판정 입력으로 되돌아오지 않았는지 (0건이어야 함)
! grep -nE '\-\-codex-review-file|\-\-intent-plan-digest' plugins/mccp/commands/plan.md plugins/mccp/scripts/receipt/cli.js

# version drift
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 1.23.1

# §3.5.1 — 머지가 조용히 삭제한 파일 없음
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| M1이 오심을 막지 못해 "서류만 늘었다"는 비판이 유효하다 | 高 | **사실이며 부정하지 않는다**(DD11). M1은 누락(UI10 1차 성공기준)을 막고, 오심은 M1.5가 소유한다. PRD가 M1을 부분 완화로 규정한 것과 정합 |
| runner 경유 요구가 Phase 0 recovery·수동 receipt-write를 막는다 | 中 | in-process 결정이 없으므로 PRD-모드 plan에서 `incomplete` → DD6 override가 유일 통로이며 감사 기록을 남기는 정상 동작. Task 6이 메시지에 override 지시 명시 |
| legacy receipt가 dedupe 대상에서 빠져 PR-Codex가 추가로 도는 비용 | 中 | 의도된 fail-closed 대가. 기존 dedupe 동작이 바뀌는 유일 지점이므로 Task 12에서 명시 확인 + CHANGELOG 기재 |
| 의도 섹션이 형식적으로만 채워져 실효 없음 | 中 | DD7 구조 가드가 빈 표·placeholder·1단어·주입 형태를 `present:false`로 떨군다. 의미 판정 불가는 정직 표기 |
| 단일 프로세스 runner가 `/mccp:plan` body 구조를 크게 바꾼다 | 中 | PR 게이트가 이미 같은 형태(`codex-runner.js`+`finalize-receipt.js`). Task 6b가 injected fake로 단위 검증하고 Task 9는 body를 runner 호출 1회로 **단순화**한다 |
| 9 필드 추가가 receipt_hash·derive·renderer를 깬다 | 低 | write 시점 stamp라 carve-out 불필요. present-only이므로 derive passthrough·frozen schema 무손상. Task 12가 전 suite 검증 |

## Acceptance

- [ ] Task 1-12 전부 완료
- [ ] Validation 블록 전 명령 통과 (known-fail 2건 외 신규 실패 0)
- [ ] `## User Intent`가 PRD-모드 plan 템플릿의 **필수** 섹션이고, 부재/형식적일 때 `present:false`로 떨어져 marker 발화 시 `incomplete`
- [ ] **adjudication 1건 누락 = `incomplete` = receipt 미작성** (커버리지 강제의 mechanical 증명 — UI10 달성은 M1.5 소유이며 M1은 이를 주장하지 않는다)
- [ ] **F1**: plan·PRD 어디에도 M1이 UI10(silent-accept 0건)을 달성한다고 적혀 있지 않다 — M1 = 커버리지 + payload bind + 측정 인프라
- [ ] **F3**: `review_payload_digest` 불일치 시 `incomplete`, 그리고 **같은 길이의 재정렬/재생성 payload에 대해 stale adjudication이 인덱스 규칙을 모두 만족해도 per-finding digest로 걸린다**(회귀 test)
- [ ] **F2/DD4-1**: digest 대조가 `receipt/write` **이전**에 일어나 불일치 시 receipt가 **생성되지 않는다**
- [ ] **F2/DD4-2**: 그럼에도 존재하는 `intent_plan_digest !== plan_hash` receipt는 validate가 block하고 dedupe가 not-approved로 읽는다
- [ ] 인덱스 중복·범위 밖·빈 rationale·dangling id가 각각 `incomplete`로 떨어진다
- [ ] intent-conflict + `ACCEPT_NOW`에 override reason 부재 = `conflict_unresolved` = block
- [ ] 증명 없는 `skipped` = `skipped-unproven` = block, 3종 증명 각각 mechanical 대조
- [ ] audited override가 `pass:true`를 주되 `blockingVerdict`와 receipt verdict는 실제 값으로 봉인 (DD6)
- [ ] 리뷰와 receipt write 사이에 **판정이 의존하는 파일이 존재하지 않는다** — 감사 사본 envelope를 변조해도 판정 불변 (DD3)
- [ ] `parseReviewPayload`가 `null`이면 `incomplete` — "findings 0건"으로 읽지 않는다 (DD3)
- [ ] write 후 `plan_hash`가 리뷰된 본문 digest와 대조되고 불일치 시 `incomplete` (DD4)
- [ ] legacy(키 부재) receipt: chain ALLOW+warning ∧ `isIntentApproved=false`로 dedupe 불가 (DD2)
- [ ] `codexConverged` 공유 헬퍼 **불변**이고 intent 조건은 plan-codex 축에만 — out-of-scope implement receipt가 dedupe를 깨지 않는다 (DD9)
- [ ] in-scope 게이트 신규 receipt는 `intent_gate_verdict`가 절대 `null`이 아니다
- [ ] `receipt.meta.intent_adjudication_counts`가 판정 카운트를 담는다 (PRD 3번째 metric: baseline 0 → 측정 존재)
- [ ] command body와 `cli.js`에 아티팩트 marker 입력 플래그가 **존재하지 않는다** (Validation negative grep)
- [ ] plan 전체(DD·Task·Test·Validation·Acceptance)가 **단일 아키텍처**를 서술한다 — 폐기된 지시 0
- [ ] plan 어디에도 provenance/서명이 제공하는 보증을 주장하지 않는다 (DD10)
- [ ] `mccp-implement-codex`는 어떤 경로로도 intent gate에 진입하지 않는다 (UI4)
- [ ] `plugin.json` `1.23.1` + CHANGELOG + CLAUDE.md §3.13/§4 동기 + M1/M1.5 경계 문서화
- [ ] Patterns mirrored, not reinvented

## Design Critique

- 트리거: detector positive (axis a) — `design_signal=true`, `signal_files=["plugins/mccp/scripts/receipt/write.js"]`(`DESIGN_SURFACE_PATHS` whitelist: briefing-stamp locus).
- SKILL first-step: `frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료.
- 라운드 1 · verdict **CONVERGED** (`decideCritique`, cap=2).
- Assessment A: `Files to Change`에 rendered surface 0건 — 산출물이 전부 control-plane. 4 Output Constraints: heading depth ≤ 3(plan 본문 `#{4,6}` 0건) PASS · 나머지 3개는 도입 surface 부재로 N/A.
- Assessment B (detector 실제 시도): `detect.mjs --json` → `[]`, exit 0. 브라우저 검증은 viewable target 부재로 미적용.
- Findings: C1 (LOW, `Files to Change`) — `intent_adjudication_counts`가 receipt에만 있고 PM 콘솔에 미노출. UI1/UI7 상 이번 milestone에서는 의도된 미노출.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 어떤 impeccable 명령도 invoke하지 않는다 — implementer용 체크리스트다. 이 plan은 rendered surface를 만들지 않으므로 implement에서 `renderingSurface=0` 판정으로 refine/discovery가 recommend로 강등될 것으로 예상된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Adversarial Review Record

### Plan-Codex R1 (GPT-5.4 via `codex-invoke`, 470s, `classification=ok`)

verdict **`needs-attention`** (structured `.result.verdict`) · HIGH 3 + MEDIUM 1 · **DEFER_TO_BACKLOG 0**.

| Finding | Severity | Verdict | 처리 |
|---|---|---|---|
| F1 Marker Depends On Unsealed Caller Data | HIGH | ACCEPT_NOW | `--findings-file` default `[]` 생략만으로 게이트 skip됨을 코드로 재현. 초안의 "아티팩트로 이전" 흡수안은 santa-loop에서 **폐기**되고 단일 프로세스 runner(DD3/DD4/DD10)로 대체 |
| F2 Skipped Is An Unproven Pass | HIGH | ACCEPT_NOW | `pr-ship-gate.js:55-68`과 동일 구멍. 3종 증명 요구 (DD1) |
| F3 Override Verdict Can Still Certify Downstream | HIGH | ACCEPT_NOW | `dedupe.js:374`가 intent를 미참조. plan 축 한정 조건 추가 (DD9) |
| F4 Adjudication Still Rubber-Stamps Conflicts | MEDIUM | ACCEPT_NOW → **M1.5 이관** | 초안은 DD12(리뷰어 `UI<n>` 인용 비대칭)로 흡수했으나 santa-loop 3라운드가 반복해 구멍을 냈다. M1 scope에서 제외하고 M1.5가 소유 (DD11) |

R1 절대 오류 정정: 초안이 findings를 `resolution.findings`라 기재했으나 실제는 top-level `receipt.findings`(`schema.js:101`).

### santa-loop (3라운드, Opus + GPT-5.4 독립·병렬)

| Round | Reviewer A (Opus) | Reviewer B (GPT-5.4) |
|---|---|---|
| 1 | FAIL | FAIL |
| 2 | **PASS** | FAIL |
| 3 | FAIL | FAIL |

**닫힌 것**: 원 F1(아티팩트 위조)은 R3에서 GPT-5.4가 명시 확인(`attack c: is_defect false`) — 단일 프로세스 runner가 해결. F3(dedupe load-bearing)은 R3 Opus PASS.

**M1으로 흡수된 것**: 공유 헬퍼 `codexConverged` 회귀(R2, Codex 단독 포착 — 그대로 구현했으면 전 dedupe 사망) → DD9 · legacy 위장이 dedupe 우회를 얻던 문제(R1) → DD2 · free-form `null` verdict 충돌(R1, Opus 단독 포착) → Task 5 불변식 · `plan_hash` 디스크 재read로 인한 bind 미성립(R3) → DD4 · adjudication 데이터 계약 미정의(R3) → 본 문서 `## Adjudication 데이터 계약` · payload `null` 처리 소유 불명(R3) → DD3.

**M1.5로 이관된 것**: per-finding `INTENT:` 계약 · 리뷰어 주장 비대칭 대조 · 불응 시 `inconclusive` block. 3라운드 모두 이 축에서만 비수렴했다.

**기각된 것(코드로 반증)**: (1) "`makeSkeleton`이 키를 항상 emit하므로 legacy 판별이 깨진다"(Opus R3) → `makeSkeleton`은 `write.js:170` 신규 생성 시에만 호출되고, 실제 corpus가 반증(`archive-cleanup-1-20-14.json`은 `design_critique_verdict` 키 있고 `merged_verify_verdict` 키 없음). 근거를 DD2에 본문화. (2) "legacy 위장이 chain pass를 얻는다"(GPT-5.4 R3) → DD10 위협 모델 밖이며 `preserved` 위조가 동일하게 쉬우므로 조여서 얻는 이득 0.

**방법론적 관찰**: 3라운드 연속으로 비대칭 포착이 양방향으로 났다(R2는 Opus PASS / Codex FAIL). 이 PRD의 가설 — "저자와 같은 모델이 심판하면 놓친다" — 이 그 PRD의 plan 자체에서 재현됐다.

### Plan-Codex (M1 재판정, 422s, `classification=ok`)

scope 축소 후 재실행. verdict **`needs-attention`** · HIGH 3 · **전부 ACCEPT_NOW · DEFER 0**. 세 건 모두 M1이 스스로 하겠다고 한 범위(누락 차단·본문 bind) 안의 결함이라 이연 대상이 아니었다.

| Finding | Severity | Verdict | 처리 |
|---|---|---|---|
| F1 저자 라벨만 세면서 PRD 지표를 주장 | HIGH | ACCEPT_NOW | **정확한 지적**. 저자가 충돌을 `none`으로 찍으면 그 finding이 분모에서 빠져 지표가 동어반복이 된다. M1의 UI10 달성 주장을 **철회**하고 M1.5를 UI10 달성 milestone으로 명시(PRD·plan 양쪽 수정). scope 재확대가 아니라 주장 하향 — 사용자 결정(UI11) 보존 |
| F2 DD4가 receipt를 쓴 **뒤** 탐지 | HIGH | ACCEPT_NOW | write 직후 대조는 늦다 — 바뀐 plan으로 계산된 `plan_hash`는 자기정합적이라 나쁜 receipt가 남고 runner의 실패 보고는 휘발한다. **write 이전 차단**(DD4-1) + **canonical 규칙**(DD4-2, validate·dedupe가 `intent_plan_digest !== plan_hash`를 거부)으로 이중화 |
| F3 인덱스만으로는 payload가 고정되지 않음 | HIGH | ACCEPT_NOW | 같은 길이의 이전/재생성 리뷰에 대한 stale adjudication이 모든 인덱스 규칙을 통과한다 — 이는 **오심이 아니라 누락**이므로 정확히 M1 범위다. `review_payload_digest` + per-finding `finding_digest`를 계약에 추가하고 write 전 대조 |

Escalate 판정: R1 흡수로 (b)"미해소" 불성립 → R2 미발화(cap=1과 정합).

## External Research Provenance

- Source PRD: .claude/prds/codex-intent-context.prd.md
- References section sha256: 8fece5c94acfa1a583e0de7beae9e1d075c2461b9be38072f36cd8c9d21fd9bf
- Stamped at: 2026-07-30T18:34:39.456Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
