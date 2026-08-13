# Plan: Codex Review Intent-Context Preservation — M1.5 (오심 탐지)

**Source PRD**: `.claude/prds/codex-intent-context.prd.md`
**Selected Milestone**: 1.5 — 오심(mislabelling) 탐지 (PRD가 **UI10 달성 milestone**으로 지정 — 실제 달성 조건은 DD9 참조)
**Complexity**: Medium

## Summary

M1(v1.23.4)은 **누락**을 닫았다 — 모든 Codex finding이 payload에 bind된 명시 판정을 받지 않으면 receipt가 써지지 않는다. 그러나 저자가 모든 finding을 `intent_conflict: 'none'`으로 찍으면 완전성 검사는 전부 통과하므로, M1은 **오심**을 막지 못하고 PRD 1차 지표(UI10)는 동어반복으로 남는다.

M1.5는 리뷰어에게 **per-finding `INTENT:` 계약**을 부과하고, 리뷰어의 주장과 저자의 판정을 **비대칭 대조**한다. **리뷰어가 지목한 `UI` id를 저자가 지목하지 않은** finding — 저자가 `none`으로 찍었든(`reviewer-only`) 다른 id를 찍었든(`id-mismatch`) — 은 저자에게 **명시 응답**(라벨 정정 또는 `intent_dispute_reason` 기재)을 강제한다. `enforce`에서 응답이 없으면 **receipt가 써지지 않는다**; `warn`에서는 receipt가 **blocking verdict를 봉인한 채** 작성되고 dedupe가 닫힌 채 남아 PR-Codex가 실제로 발화한다(`write.js:239`는 `runtime_allowed === false`에서만 멈춘다). 이로써 UI10의 분모가 **저자 라벨과 무관해진다** — 단 그 달성은 `enforce`에 한한다(DD9).

**M1.5가 주장하지 않는 것**: 오심을 *교정*하지 않는다. 저자 라벨을 **반증 가능(falsifiable)** 하게 만들 뿐이다. 양쪽이 모두 `none`이면 여전히 아무것도 탐지되지 않는다 — 다만 그 `none`이 이제 한 당사자의 무검증 라벨이 아니라 **독립된 두 당사자의 합의**다(L1/DD8이 리뷰어를 저자 정당화로부터 구조적으로 격리하므로). 그리고 UI10 달성은 **`warn` 모드에서는 성립하지 않는다**(DD9) — 리뷰어 준수율 실측이 default를 정하기 전까지 이 milestone은 감사 표면을 배송하는 것이지 지표를 달성하는 것이 아니다.

## User Intent

<!-- Reference-only. 이 섹션은 리뷰어 focus에 verbatim 주입된다(L1). USER-STATED 제약만 —
     저자 정당화(왜 이렇게 설계했나)는 절대 여기 쓰지 않는다(anchoring 회피, PRD Risk 4). -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M1.5는 오심 탐지 한 축만 소유한다 — arbiter 컨텍스트 분리와 cross-vendor 리뷰어는 M2다 | direction |
| UI2 | 리뷰어에게 주입하는 것은 "사용자가 무엇을 요구했나"뿐이다. 저자 정당화는 넣지 않는다 | constraint |
| UI3 | 판정을 빠뜨릴 수 없게 mechanical하게 강제하되, 판정 내용 자체는 LLM이 수행한다 | constraint |
| UI4 | `/mccp:prp-implement`의 Implement-Codex는 scope에서 제외한다 | exclusion |
| UI5 | Codex 자체 교체는 하지 않는다 | exclusion |
| UI6 | 완벽한 리뷰어 독립성은 추구하지 않는다 — 원리상 불가하며 완화가 목표다 | exclusion |
| UI7 | 게이트 성능·비용 최적화는 이번 scope가 아니다 | exclusion |
| UI8 | cross-vendor 독립 2차 리뷰어 복원은 Milestone 2로 분리한다 | exclusion |
| UI9 | 이 milestone에서 비로소 "의도-충돌 finding의 silent-accept 0건"이 실질적으로 성립해야 한다 | direction |
| UI10 | 리뷰어가 독립적으로 충돌을 주장하는 신호가 있어야 모집단이 저자 라벨과 무관해진다 | constraint |
| UI11 | 리뷰어 불응 시 처리(계약·데이터 바인딩·block 여부)를 자체 설계 라운드로 다룬다 | direction |

> **자기적용 유보(정직 표기)**: 이번 cycle의 게이트는 설치 캐시(`1.23.3`)의 구 command body로 실행되므로 M1.5 preamble이 실제 focus에 주입되지 **않는다**. 자기적용은 머지 + `claude plugin update` 이후 발효한다. Task 0 spike와 Task 8 e2e가 그 경로를 각각 실측·코드 레벨로 대신 증명한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 오라클 | `plugins/mccp/scripts/lib/intent-context.js:1-20` | fs/process/clock 없음 — 모든 I/O는 runner 소유 |
| 파서 위임 | `plugins/mccp/scripts/lib/intent-context.js:23` | 게이트가 파서를 재구현하지 않고 중립 모듈에 위임(DD7) |
| 소비처 분리 | `plugins/mccp/scripts/lib/intent-context.js:651` | 단일 `pass` 불리언 없음 — runtime/chain/dedupe 3분리(DD5) |
| 구조화 우선 판독 | `plugins/mccp/scripts/lib/codex-review-payload.js:86-123` | 구조화 read 우선, free-text는 fallback이며 승인 발급 불가 |
| preamble 합성 | `plugins/mccp/scripts/lib/codex-invoke.js:154-169` | design-scope → intent → focus 결정적 순서, 미지정 시 byte-identical |
| present-only meta | `plugins/mccp/scripts/receipt/schema.js:738-766` | `!== undefined` 가드 + `makeSkeleton` 미포함(hash 안정성) |
| 입력 하드닝 | `plugins/mccp/scripts/lib/intent-context.js:55-62` | 상한을 상수로 freeze, 위반은 예외가 아니라 **verdict** |
| 3-mode 토글 | CLAUDE.md §4 `MCCP_DESIGN_GROUNDING` | `off\|warn\|enforce`, 오타·미설정 → 보수적 default |
| 미실측 정직 강등 | v1.20.12 M3 `merge_strategy=disable-parallel` | 실측 못 한 축은 DORMANT로 두고 그렇다고 적는다 |
| 테스트 위치 | `plugins/mccp/scripts/lib/tests/intent-context.test.js` | `node --test`, 모듈당 1파일 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/intent-claims.js` | CREATE | 리뷰어 `INTENT:` 주장 파서 + 비대칭 대조 순수 오라클 |
| `plugins/mccp/scripts/lib/tests/intent-claims.test.js` | CREATE | 파서·대조·상한·오탐 회귀 |
| `plugins/mccp/scripts/lib/intent-context.js` | UPDATE | verdict 2종 · `intent_dispute_reason` 계약 · 대조 결과 소비 · `advisoryActive` 별개 입력 · **`isIntentChainAllowed`의 warn 분기**(DD6 — 자동 성립 안 함) |
| `plugins/mccp/scripts/lib/tests/intent-context.test.js` | UPDATE | 신규 verdict + dispute + `id-mismatch` + `partial` 차단 + warn 3분리 회귀 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | `INTENT_REFERENCE_PREAMBLE`에 per-finding 계약 문단 추가 |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATE | 계약 문단이 reference 없을 때 미출현(byte-identical) 확인 |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATE | in-memory payload에서 claims 파싱 → 오라클 주입 → meta stamp |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | UPDATE | claims가 **디스크가 아닌 메모리**에서 온다는 tamper 회귀 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | verdict enum 2종 + present-only meta **6필드**(DD2 claims digest + DD11 audit 배열 포함) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `intentDecision`의 신규 **6필드** stamp |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | 신규 verdict 2종의 **per-verdict 복구 메시지** — 현재는 어떤 blocking intent verdict든 M1 문구("모든 finding에 명시 판정") 하나만 내보내 오진 유도(`:543-555`) |
| `plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js` | UPDATE | 신규 필드 present-only + audit 배열 bind + 구 receipt 무손상 |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.5a 계약 필드 2개 추가 · 5.6 verdict 분기 2종 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.4` → `1.23.5` (patch — PRD 내 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기(§3.7 5면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | version 단언 2건 동기 |
| `docs/codex-intent-context/reviewer-contract-compliance.md` | CREATE | Task 0 실측 기록 — 기본 모드 결정의 근거 |
| `CHANGELOG.md` | UPDATE | `[1.23.5]` 엔트리 |
| `CLAUDE.md` | UPDATE | §3.13 M1.5 절 + §4 토글 1건 |
| `.claude/prds/codex-intent-context.prd.md` | UPDATE | Milestone 1.5 `pending` → `in-progress` + Plan 경로 |

## Design Decisions

> **santa-loop R1 반영**: 아래 DD들은 Opus + GPT-5.4 독립 리뷰(양쪽 FAIL)의 지적을 흡수해 개정된 판본이다. 무엇이 왜 바뀌었는지는 `## Adversarial Review Record`에 라운드별로 남긴다.

**DD1 — 계약은 finding 텍스트 안의 anchored 라인이며, 모호하면 주장이 아니다.** companion의 finding 스키마(`{severity,title,body,file,line_start,line_end,recommendation}`)는 **외부 plugin 소유**라 필드를 추가할 수 없다(UI5). 따라서 리뷰어 주장은 텍스트 안에 `INTENT: UI3` / `INTENT: none` 형태로 실린다. 자유 텍스트를 판정 채널로 쓰는 이상 **위조·오인은 파싱 규칙으로 막는 것이 아니라 모호성을 전부 `unclaimed`로 접어서** 막는다:

- **라인 선두 앵커만** 인정(`/^[ \t]*INTENT:[ \t]*(\S.*)$/m`). 산문 중간의 "UI3" 언급은 매칭 불가.
- 스캔 **전에** 인용 구조를 제거한다: 백틱 fence(``` … ```)·**틸드 fence(`~~~`)**·**4-space/tab 들여쓰기 코드 블록**·blockquote(`> …`)·**HTML `<pre>`/`<code>`/`<blockquote>` 블록**. 리뷰어가 이 plan이나 다른 finding을 **인용**하면 그 인용문의 `INTENT:` 줄이 주장으로 오인된다 — 이 문서 자체가 그 벡터다(자기참조 위험).
- **stripper는 완전할 수 없고, 그래서 1차 통제가 아니다.** 놓친 인용이 *추가* 매칭을 만들면 "정확히 1건" 규칙이 그 finding을 `unclaimed`로 접어 fail-closed로 끝난다. stripper가 실제로 막는 유일한 케이스는 **진짜 주장이 없는 finding에 인용문 1건만 살아남아 거짓 주장이 되는 것**이고, 위 목록은 그 표면을 좁힌다. 남는 잔여는 인정한다.
- finding 하나에서 앵커 매칭이 **정확히 1건이 아니면** 그 finding은 `unclaimed`. 0건이면 미주장, 2건 이상이면 어느 것이 진짜인지 알 수 없으므로 첫 줄을 고르지 **않는다**(fail-closed).
- 값은 `none` **또는 단일** `^UI\d+$`. 콤마 목록(`UI3, UI7`)은 `unclaimed` — 저자 라벨 `intent_conflict`가 단일 문자열이라(`intent-context.js:617-623`) 집합 대 스칼라 비교를 정의해야 하는데, 그 복잡도는 M1.5가 사는 값이 아니다.
- 섹션에 없는 id(dangling)는 `unclaimed`. 초안은 "그 토큰만 폐기"였으나 단일 id 규칙에서는 폐기 = 주장 소멸이므로 `none`으로 접히면 **탐지가 조용히 꺼진다**.

스캔 대상은 `title`+`body`+`recommendation`을 **이어붙인 하나의 텍스트**다(필드별 독립 주장 금지 — 그래야 "정확히 1건" 규칙이 성립한다).

**DD2 — 대조 입력은 메모리에서만 오고, 그 사실을 test가 고정한다.** `parseReviewerClaims`의 **유일한** 입력은 runner가 메모리에 들고 있는 `payload.findings`다. 디스크에서 claims를 읽는 코드 경로는 존재하지 않는다 — M1의 성질을 계승한다(`plan-codex-runner.js`는 `writePrivate(p.awaiting, …)` 이후 그 파일을 다시 읽지 않으며, envelope 사본도 audit 전용이다).

Task 6은 저자가 대조 상대를 볼 수 있도록 awaiting 아티팩트에 리뷰어 주장을 **투영**한다. 이것이 DD2를 깨지 않는 이유는 순서와 방향이 고정돼 있기 때문이다: **파싱(메모리) → 투영(쓰기) → 대기 → 대조(메모리 값)**. 투영은 출력이고, 대조는 투영을 읽지 않는다.

라벨만으로는 부족하므로 mechanical하게 고정한다: (a) 회귀 test가 대기 중 **awaiting 아티팩트 자체를 변조**한 뒤 verdict·counts 불변을 단언하고(초안은 envelope만 변조했는데, 정작 주장을 싣는 파일은 awaiting이라 겨냥이 어긋나 있었다), (b) **전체 claim map의 digest**(`meta.intent_claims_digest`)와 **분쟁 대상 finding의 상세**(`meta.intent_mislabel_audit`, DD11)를 receipt에 봉인한다.

두 필드로 나눈 이유: 전 finding의 claim을 통째로 담으면 receipt가 비대해지고, 분쟁 항목만 담으면 통과한 finding의 claim이 조작돼도 사후 대조가 불가능하다. digest는 **전체 map의 무결성**을, audit 배열은 **분쟁의 근거**를 각각 맡는다.

**(b)가 없으면 "조작이 진단 가능하다"는 주장은 공허하다.** 초안은 awaiting에 `claims_digest`를 stamp하는 것으로 충분하다고 적었는데, awaiting은 runner의 `finally`가 **삭제하는** per-run 임시 파일이고 그 digest를 나중에 대조하는 코드도 없다. 사라지는 파일 안의 digest는 감사 증거가 아니다. 내구적 증거는 receipt에 있어야 한다.

**DD3 — 대조 6분류, blocking 규칙은 단 하나다: "리뷰어가 지목한 id를 저자가 지목하지 않았다".**

| 분류 | 리뷰어 | 저자 | 처리 |
|---|---|---|---|
| `agree-none` | none | none | 통과 (탐지 불가 영역 — 정직 표기) |
| `agree-conflict` | UI*n* | UI*n* (동일) | 통과 |
| `id-mismatch` | UI*n* | UI*m* (n≠m) | **명시 응답 필요** |
| `reviewer-only` | UI*n* | none | **명시 응답 필요** |
| `author-only` | none | UI*n* | 통과 — 저자가 사용자에 더 가깝다. 과다 라벨은 안전 방향 |
| `unclaimed` | 미주장/모호 | * | compliance 축(DD5). 절대 `none`으로 접지 않는다 |

초안은 `agree-conflict`를 id 불일치까지 포함해 통과시켰다. 그러면 M1.5는 **conflict-vs-none만** 탐지하면서 "라벨 비대칭을 탐지한다"고 주장하게 된다 — 리뷰어가 UI2 위반이라 했는데 저자가 UI7이라 적으면 둘 다 "충돌 있음"이라 통과한다. 규칙을 하나로 통일해 그 구멍을 닫는다.

**DD4 — 해소는 둘 중 하나이고, 게이트가 강제하는 것은 *옳음*이 아니라 *기록*이다.** 저자가 ① `intent_conflict`를 리뷰어가 지목한 id로 정정하거나(그 순간 M1의 기존 규칙이 발동 — `ACCEPT_NOW`면 `intent_override_reason` 필수), ② 신규 필드 `intent_dispute_reason`에 **리뷰어 주장이 틀린 이유**를 적는다. 둘 다 없으면 신규 verdict `mislabel_unresolved`(blocking).

`intent_dispute_reason`에는 repo에 이미 있는 strict validator(`receipt/lib/force-override-reason.js#validateReason({strict:true})` — ≥30자·≥3단어·placeholder/URL-only/banlist 거부)를 **재사용**한다. `"no"`나 `"because I say so"` 같은 1-token 기각은 이걸로 죽는다.

**그러나 validator는 dispute를 참으로 만들지 못한다.** 저자가 그럴듯한 30자 문장을 리뷰어 주장마다 하나씩 적으면 게이트는 통과한다 — 이는 M1 `intent_override_reason`과 정확히 같은 성질이며, 텍스트 검증으로 닫을 수 있는 종류의 구멍이 아니다. M1.5가 사는 것은 **"기록 없는 수용"의 제거**이지 "잘못된 수용"의 제거가 아니다. 남용은 receipt의 dispute 카운트로 관측되고, 그 비율이 높으면 그 자체가 다음 milestone의 입력이다(DD9 항목 4).

**DD5 — `partial`은 통과 상태가 아니다.** compliance는 `claimed/total`로 계측하되 판정은 **이분법**이다:

- `full` (모든 finding이 유효 주장 1건) → 대조 수행.
- 그 외(`partial`·`absent`) → `inconclusive`. 미주장 finding은 `unclaimed`로 집계돼 감사에 남는다.

초안은 `partial`을 non-blocking으로 뒀는데, 그러면 20건 중 1건만 주장해도 게이트가 "탐지 축이 작동했다"와 구분 없이 통과한다 — M1의 구멍을 리뷰어 쪽으로 옮긴 것에 지나지 않는다. 임의 임계(예: 80%)를 도입하는 대신 이분법을 택한 이유는 방어할 근거 없는 숫자를 만들지 않기 위해서다. 계측값(`claimed/total`)은 별도로 남으므로 1/20과 19/20은 감사에서 구분된다.

`MCCP_INTENT_MISLABEL=enforce|warn|off`가 `inconclusive`/`mislabel_unresolved`의 효력을 정한다. **기본값은 Task 0 실측이 정한다**(DD10).

**`off`는 판정 억제가 아니라 경로 미진입이며, 그 경계는 오라클이 아니라 리뷰어 호출 *앞*에 있다.** 모드는 runner가 **Codex 호출 전에** 해석하고, `off`면 ① `codex-invoke`에 `mislabelContract:false`를 넘겨 preamble의 `INTENT:` 계약 문단을 **붙이지 않고**, ② `parseReviewerClaims`/`compareIntentClaims`를 **호출하지 않으며** ③ `decideIntentGate`에 `comparison`을 **넘기지 않는다**.

①이 없으면 `off`는 end-to-end M1 등가가 아니다 — `composeFocus`는 mislabel 모드를 모르므로 계약 문단이 그대로 붙고, **리뷰 payload 자체가 달라진다**. 오라클 레벨 byte-identity만 증명하는 acceptance는 그 차이를 못 잡는다. 따라서 회귀 단언은 **오라클 판정**과 **리뷰어에게 실제로 간 focus 문자열** 두 축 모두에 건다.

**DD6 — `warn`은 자체 sealed 상태를 가지며, `intent_gate_force_override`를 재사용하지 않는다.** 초안은 "기존 advisory 축 재사용"이라 적었으나 **구현 불가**였다: 하류 chain reader는 `intent_gate_force_override === true`만 인정하고(`intent-context.js:721-725`) 그 외 blocking verdict는 전부 차단한다. `warn` receipt가 그 플래그를 켜면 audited-override 표면의 의미와 strict reason 요구(`write.js:226-245`)를 오염시키고, 안 켜면 chain이 막혀 `warn`이 `enforce`와 구분되지 않는다.

따라서 신규 present-only 필드 `intent_mislabel_mode ∈ {enforce,warn,off}`를 세우고 reader를 명시적으로 확장한다:

- `deriveIntentGateDecision(input, { advisoryActive })` — `forceOverrideActive`와 **별개 입력**. `runtimeAllowed:true` · `chainAllowed:true` · **`dedupeApproved:false`**.
- `isIntentChainAllowed(meta)` — `meta.intent_mislabel_mode === 'warn'` ∧ blocking verdict가 mislabel 축(`inconclusive`/`mislabel_unresolved`)일 때 allow + warning. **다른 blocking verdict(`incomplete`/`conflict_unresolved`/`skipped-unproven`)에는 절대 적용하지 않는다** — warn은 M1.5가 새로 만든 축만 완화한다. 이 분기는 기존 `intent_gate_force_override` early-return과 **같은 위치**(`classifyIntentMeta` 호출 **전**)에 둔다 — `classifyIntentMeta`는 신규 verdict를 `blocked`로 반환하므로, 그 뒤에 두면 분기에 영영 도달하지 못한다.
- `isIntentApproved(receipt)` — **무변경**. dedupe는 `preserved`/증명된 `skipped`만 인정하므로 `warn`은 dedupe를 열지 않고 PR-Codex가 실제로 발화한다. `warn`이 공짜가 아닌 지점이 정확히 여기다.

**DD7 — 과다 주장 유도를 상쇄한다.** "충돌을 선언하라"는 요구는 리뷰어가 성실해 보이려 충돌을 **날조**하도록 유도할 수 있고, 그러면 dispute 부담만 늘고 신호는 희석된다. preamble이 `INTENT: none`을 **명시적 1급 답변**으로 규정하고 날조를 금지한다. 그리고 `reviewer_only`+`id_mismatch` 중 dispute로 기각된 비율이 receipt에 남으므로 과다 주장은 감사에서 관측된다 — 텍스트 훈계가 아니라 계측이 통제다.

**DD8 — 스키마는 additive-only이지만, reader는 한 곳 바뀐다.** 신규 meta 필드는 present-only이고 `makeSkeleton` 미포함(§3.12 tracked ship corpus의 `receipt_hash` 안정성 + M1 DD2의 "키 부재 = 모름"). verdict enum 확장은 **신규 값을 유효화**할 뿐이라 기존 receipt를 소급 invalid로 만들지 않는다.

`classifyIntentMeta`가 `preserved`/증명된 `skipped` 외 전부를 `blocked`로 반환하므로 신규 verdict 2종은 **차단 방향으로는** 코드 변경 없이 자동 성립한다. 초안은 여기서 멈췄는데 그건 절반만 참이었다 — `warn` 완화는 자동으로 생기지 않으므로 `isIntentChainAllowed`에 DD6의 명시 분기를 **추가해야 한다**. 그 분기는 mislabel 축에만 적용되므로 M1 verdict의 차단 동작은 불변이다.

**DD9 — UI10 달성 여부는 조건부이며, 조건을 계측한다.** `full` compliance인 리뷰에 한해 UI10의 분모는 `리뷰어 주장 충돌 ∪ 저자 주장 충돌`이고, 리뷰어 항은 저자 라벨과 독립이다. 그 분모 위에서 "기록된 근거 없는 수용"은 **`enforce` 모드에서** mechanical하게 0이 강제된다(`intent_override_reason` 또는 `intent_dispute_reason` 부재 시 receipt 미작성). `warn`에서는 receipt가 blocking verdict를 봉인한 채 작성되므로 강제가 아니라 **기록**만 남는다.

**강제되는 명제를 정확히 쓴다**: "리뷰어 또는 저자가 주장한 충돌이 **기록된 근거 없이** 수용되는 일은 0". **"오심이 0"이 아니다.**

**성립하지 않는 경우를 정직하게 열거한다**:

1. **`warn` 모드에서는 UI10이 달성되지 않는다.** 차단이 없으므로 저자는 무시하고 진행할 수 있다. Task 0 실측이 낮게 나와 `warn`으로 ship하면 M1.5는 **감사 표면**을 배송한 것이지 지표를 달성한 것이 아니며, PRD Milestone 1.5는 그 사실을 status에 반영한다(DD10).
2. **양쪽이 모두 놓친 충돌**은 여전히 탐지 불가. M2(arbiter 분리 + cross-vendor) 소관.
3. 리뷰어가 충돌을 주장할지는 저자의 결정이 아니지만, 주장의 **형식과 상한**은 저자가 쓴 preamble에 묶여 있다. 완전한 독립이 아니라 **부분 독립**이며, PRD Out-of-scope(UI6 "완벽한 독립성은 원리상 불가")와 정합한다.
4. **저자가 모든 `reviewer-only`/`id-mismatch`에 형식만 갖춘 dispute를 적으면 통과한다**(DD4). strict validator가 1-token 기각을 죽일 뿐 거짓 이유를 걸러내지 못하므로, 이 경로에서 M1.5는 **오심을 막지 못하고 오심을 기록만 한다**. 남는 것은 M1과 같은 종류의 구멍에 문장 하나만큼의 비용이 붙은 상태이며, 그것을 부정하지 않는다 — 다만 M1에서는 그 수용이 **흔적 없이** 일어났고 지금은 `intent_mislabel_disputes` 카운트로 **셀 수 있다**는 것이 차이다. 이 비율이 높게 나오면 그건 M1.5의 성공이 아니라 M2(심판 분리)가 필요하다는 증거다.

**DD10 — Task 0는 production 경로를 측정해야 하고, 측정 실패는 milestone 강등이지 조용한 default가 아니다.** 초안은 `codex exec` 직접 호출 3회로 측정하려 했는데, 그 경로는 실제 발화 경로가 **아니다** — production은 `codex-invoke.js#composeFocus`가 design-scope preamble과 intent reference를 합성해 넘기고(`codex-invoke.js:159-166`), 응답은 `parseReviewPayload`의 구조화 read로 들어온다(`codex-review-payload.js:48-59`). 다른 프롬프트 조립과 다른 판독으로 잰 준수율은 shipped default를 정당화하지 못한다.

- 측정은 **wrapper 경유**로 한다(`--intent-reference-file` + `parseReviewPayload`). `MCCP_CODEX_DISABLED=1`이 걸려 있으면 **그 측정 실행에 한해** 해제하고 그 사실을 문서에 적는다.
- 표본은 3회를 **하한**으로 두되, 준수율이 갈리면(예: full 2 / partial 1) 결론을 내리지 말고 회차를 늘린다. 3회는 "전부 full" 또는 "전부 absent" 같은 명백한 결과에서만 결론을 낼 수 있는 크기다.
- **측정 불가 시**: default `warn`으로 ship하되 PRD Milestone 1.5 status를 `complete`로 올리지 **않는다**. UI10 미달성을 명시하고 enforce flip을 측정 선행조건이 붙은 후속 축으로 남긴다(v1.20.12 M3의 DORMANT + 정직 강등 패턴). 초안 Acceptance의 "실측 문서 **또는** 미실행 사유"는 강도를 한 번도 재지 않은 게이트를 `complete`로 ship하는 것을 허용했고, 그건 이 plan이 반면교사로 인용한 실패 형태 그 자체였다.

**DD11 — 감사 증거는 receipt에 봉인되고, 카운트만으로는 부족하다.** `intent_mislabel_disputes` 같은 집계 수치는 대시보드용이지 감사 증거가 아니다 — "리뷰어가 UI2를 지목했는데 저자가 무슨 근거로 기각했나"를 나중에 대조할 수 없다. 따라서 present-only 필드 `intent_mislabel_audit`(배열)을 세우고 **명시 응답이 필요했던 finding에 한해** 다음을 봉인한다:

```
{ finding_index, finding_digest, reviewer_claim, author_conflict,
  classification: 'reviewer-only'|'id-mismatch',
  resolution: 'relabelled'|'disputed',
  dispute_reason: <text|null> }
```

`dispute_reason`을 텍스트로 담는 것은 M1의 `intent_gate_force_override_reason`(`write.js:233-235`)이 이미 세운 선례다. `finding_digest`가 함께 실리므로 이 항목은 특정 리뷰 payload에 bind되고, awaiting 아티팩트 변조는 receipt의 봉인값과 어긋나 **사후 진단이 가능**해진다. 통과한 finding(`agree-*`/`author-only`)은 담지 않는다 — 그쪽의 무결성은 `intent_claims_digest`가 맡는다(DD2).

**상한은 `ADJUDICATION_LIMITS.ITEMS`(1000)와 같게 둔다.** 초안의 200은 M1이 이미 허용하는 1000 adjudication과 어긋나, 분쟁이 200건을 넘을 때 truncate인지 block인지가 미정의였다. **조용한 truncation은 감사 표면을 무력화하므로 선택지가 아니고**, 상한을 맞추면 그 분기 자체가 사라진다(분쟁 항목은 finding 수의 부분집합이므로 1000을 넘을 수 없다).

**scope 주의**: intent 게이트는 `mccp-plan-codex` 전용(`write.js#INTENT_IN_SCOPE_GATES`)이고 §3.12상 plan receipt는 **working-tree only**다. 이 배열은 git-tracked ship corpus(`mccp-pr-codex`)에 들어가지 않으므로 추적 이력에 자유 텍스트가 남지 않는다.

**DD12 — 두 override의 관계는 하나의 확정된 결과를 갖는다.** 순서: ① mode가 verdict와 advisory(`warn`) 여부를 정한다 → ② 그 결과가 **여전히 blocking일 때만** `MCCP_SKIP_INTENT_GATE`가 `forceOverrideActive`로 적용된다.

따라서 봉인되는 조합은 셋뿐이다:

| mode | 결과 | `intent_mislabel_mode` | `intent_gate_force_override` |
|---|---|---|---|
| `warn` + mislabel 축 blocking | warn이 통과시킴 | `'warn'` | **`false`** — override는 적용될 일이 없었다 |
| `enforce` + `MCCP_SKIP_INTENT_GATE` | override가 통과시킴 | `'enforce'` | `true` + reason |
| `warn` + M1 축 blocking(`incomplete` 등) + `MCCP_SKIP_INTENT_GATE` | warn은 이 축을 열지 않으므로 override가 통과시킴 | `'warn'` | `true` + reason |

초안은 "둘 다 활성이면 두 필드를 동시에 봉인"이라 적었는데, `warn`이 이미 통과시킨 경우 override는 **적용되지 않았으므로** `true`를 찍으면 거짓 기록이다. 플래그는 *설정 여부*가 아니라 **실제로 효력을 발휘했는지**를 나타낸다. `dedupeApproved`는 세 경우 모두에서 닫힌 채다.

## Tasks

### Task 0: 리뷰어 계약 준수율 실측 (spike — 기본 모드 결정 게이트) — **시도됨 / 미측정 (2026-08-09)**

> **상태**: 하네스는 구축·검증됐고 spawn 경계까지 도달했으나 **Codex 계정 쿼터 소진**으로 측정 불가. companion이 `parseError`로 `"You've hit your usage limit … try again at Aug 16th, 2026 6:07 AM"`을 반환. 쿼터 복구는 **2026-08-16 06:07**.
>
> **DD10 fallback 발동**: `DEFAULT_MISLABEL_MODE = 'warn'`(측정값 아님) · **UI10 미달성** · **PRD Milestone 1.5는 `complete`로 올리지 않음**. 전말·하네스·재현법은 [docs/codex-intent-context/reviewer-contract-compliance.md](../../docs/codex-intent-context/reviewer-contract-compliance.md).
>
> 쿼터 복구 후 아래 절차를 그대로 실행하고 결과를 그 문서에 append한 뒤 `DEFAULT_MISLABEL_MODE`를 갱신하는 것이 `enforce` flip의 **유일한** 경로다.

- **Action**: **production 경로로** 측정한다(DD10) — Task 5의 preamble을 넣은 `codex-invoke.js adversarial-review --intent-reference-file <ref>`를 호출하고 응답을 `parseReviewPayload`로 판독한 뒤 Task 1의 `parseReviewerClaims`에 그대로 먹인다. 입력은 `## User Intent` 표 + **의도적 충돌을 심은 합성 plan**. 측정 **4축**: (a) finding당 유효 주장 1건 비율 → `claimed/total` 및 `full` 도달 여부, (b) 심어둔 충돌을 리뷰어가 `INTENT: UI<n>`으로 지목하는가(탐지 민감도), (c) 날조 주장(심지 않은 충돌 지목) 발생 여부(DD7 과다 주장 축), (d) **오형식 1건이 리뷰 전체를 `inconclusive`로 만드는 빈도** — DD5 이분법의 오탐율이며, 이 값이 곧 liveness 비용이다. 결과를 `docs/codex-intent-context/reviewer-contract-compliance.md`에 raw 발췌와 함께 기록한다.
- **결정 규칙(사전 선언 — 사후 합리화 방지)**: 리뷰 단위 `full` 도달률이 **≥95% → `enforce`** · **70~95% → `warn`** · **<70% → `off`**(계약 자체가 작동하지 않으므로 배선만 남기고 발화시키지 않는다).
- **결정이 코드에 남는 지점을 명시한다**: 측정 결과는 `intent-context.js`의 명명 상수 `DEFAULT_MISLABEL_MODE`에 **커밋**되고 `parseMislabelMode(env)`가 env 미설정 시 그 상수를 반환한다. Task 9가 CLAUDE.md §4 토글 문서의 default 표기를 같은 값으로 동기한다. 상수 위 주석에 **측정 근거 문서 경로와 측정일**을 적어, 나중에 "이 default가 왜 이 값인가"가 코드에서 추적 가능하게 한다. 초안은 "실측이 default를 정한다"고만 적고 그 값이 런타임 어디에 사는지를 비워뒀다. 이 임계는 *일회성 ship 결정*을 사람이 내리는 기준이지 runtime 게이트가 아니다 — DD5가 runtime 임계를 거부한 것과 모순되지 않는다. 실측이 이 규칙을 뒤집을 근거를 주면 규칙을 고치되, **고쳤다는 사실과 이유를 문서에 남긴다**.
- **Mirror**: v1.20.10 M2b Task 0 spike → 실측이 `merge_strategy` 기본값을 정한 선례.
- **Validate**: 문서에 (1) 회차별 raw 출력 발췌, (2) `claimed/total` 표, (3) 결정 근거 1문단이 존재. **정지 규칙**: 최소 **5회**. 관측된 `full` 도달률이 위 임계 경계에서 **10%p 이내**이면 **10회까지** 연장한다(경계 근처에서 소표본 잡음으로 default가 뒤집히는 것을 막기 위함). 5회가 만장일치(전부 `full` 또는 전부 `absent`)면 거기서 종료. 초안의 "3회, 갈리면 증회"는 정지 조건이 아니라 희망이었다.
- **`MCCP_CODEX_DISABLED=1` 처리**: wrapper 경유가 요건이므로 **이 측정 실행에 한해** env를 해제하고, 해제했다는 사실과 시각을 문서에 적는다. 직접 `codex exec` 호출로 대체하지 **않는다** — 프롬프트 조립(`composeFocus`)과 판독(`parseReviewPayload`)이 달라 shipped default를 정당화하지 못한다(DD10).
- **측정 불가 시(계정 한도 등)**: default `warn`으로 ship하되 **PRD Milestone 1.5를 `complete`로 올리지 않는다**. UI10 미달성을 PRD·CHANGELOG·CLAUDE.md에 명시하고, enforce flip을 "production 경로 측정 선행" 조건이 붙은 후속 축으로 남긴다.

### Task 1: `intent-claims.js` — 파서 + 대조 순수 오라클

- **Action**: CREATE. (a) `parseReviewerClaims({ findings, sectionItems })` — finding마다 `title`·`body`·`recommendation` 중 **문자열인 것만** 취해(비문자열·부재는 빈 문자열로 강제, `parseReviewPayload`가 형태를 보장하지 않으므로 — `codex-review-payload.js:48-59`) **`"\n"` 하나로 join**한 뒤 fenced code block과 blockquote 라인을 제거하고 DD1 앵커로 스캔. 매칭이 정확히 1건이 아니면(0건 또는 2건 이상) `unclaimed`. 값은 `none` 또는 **단일** `^UI\d+$`이며, 콤마 목록·`sectionItems`에 없는 id·상한 초과(스캔 텍스트 64KB)는 전부 `unclaimed`. **`unclaimed`은 절대 `none`으로 접히지 않는다.** (b) `compareIntentClaims({ claims, adjudications })` → finding별 DD3 **6종** 분류 + 집계 `{ reviewer_conflict, author_conflict, agree_conflict, agree_none, reviewer_only, id_mismatch, author_only, unclaimed, claimed, total }` + `compliance ∈ {full,partial,absent}`(계측값 — 판정은 `full` 여부 이분법, DD5). 순수 함수 — fs/process/clock 없음.
- **Mirror**: `intent-context.js`의 상한 freeze + "위반은 예외가 아니라 verdict" 원칙; `markdown-table.js` 위임 구조.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/intent-claims.test.js`

### Task 2: `intent-claims.test.js` — 파서·대조 회귀

- **Action**: CREATE. (a) 앵커 없는 산문 `"...UI3 conflict..."` → 미매칭(오탐 0) · (b) `INTENT: none` / `INTENT: UI3` 정상 파싱 · (c) **인용 구조 5종 안의 `INTENT: UI3` → 미매칭**(백틱 fence · `~~~` fence · 4-space 들여쓰기 · `> ` blockquote · HTML `<pre>`) · (d) **진짜 주장 1건 + 인용 1건이 남으면 2건 매칭 → `unclaimed`**(stripper가 놓쳐도 fail-closed임을 고정) · (e) **앵커 2건 이상 → `unclaimed`**(첫 줄을 고르지 않음) · (f) 콤마 목록 `INTENT: UI3, UI7` → `unclaimed` · (g) dangling id → `unclaimed`(`none` 아님) · (h) 64KB 초과 → `unclaimed` · (i) DD3 6종 분류 각각 1케이스 · (j) **`id-mismatch`가 blocking 후보로 잡힘** · (k) `author-only`가 blocking을 낳지 않음 · (l) `claimed/total` 계측이 1/20과 19/20을 구분.
- **Mirror**: `intent-context.test.js` 구조.
- **Validate**: 위와 동일, 12개 케이스 전부 green.

### Task 3: `intent-context.js` — verdict 확장 + dispute 계약 + warn 축 + chain reader

- **Action**: UPDATE. (a) `INTENT_GATE_VERDICTS`에 `inconclusive`·`mislabel_unresolved` 추가(PASS 집합 불변) · (b) `ADJUDICATION_LIMITS`에 `DISPUTE_REASON_CHARS: 5000` · (c) `parseAdjudicationFile`이 `intent_dispute_reason` 길이 검증 + **`validateReason({strict:true})` 적용**(`receipt/lib/force-override-reason.js` 재사용 — 1-token/placeholder/URL-only 기각; 위반 시 그 dispute는 **부재로 취급**돼 `mislabel_unresolved`, DD4) · (d) `decideIntentGate`가 신규 옵션 `comparison`을 받아 **M1 규칙 전부 통과 후** 판정: `comparison.compliance !== 'full'` → `inconclusive`(DD5); `reviewer-only` ∪ `id-mismatch` 중 라벨 미정정 ∧ `intent_dispute_reason` 부재가 1건이라도 있으면 → `mislabel_unresolved`(DD3/DD4) · (e) `deriveIntentGateDecision(input, { forceOverrideActive, advisoryActive })` — `advisoryActive`는 **별개 입력**이며 `runtimeAllowed/chainAllowed`만 열고 `dedupeApproved`는 안 연다 · (f) **`isIntentChainAllowed` 확장** — `meta.intent_mislabel_mode === 'warn'` ∧ verdict가 mislabel 축(`inconclusive`/`mislabel_unresolved`)일 때만 allow. `incomplete`/`conflict_unresolved`/`skipped-unproven`에는 **절대 미적용**(DD6/DD8). `isIntentApproved`는 **무변경** · (g) `parseMislabelMode(env)` 3-mode 파서 — env 미설정·오타 시 명명 상수 **`DEFAULT_MISLABEL_MODE`**(Task 0 측정 결과가 커밋되는 지점, 위 주석에 근거 문서 경로 + 측정일) 반환 + loud warn.
- **Mirror**: `deriveIntentGateDecision`의 기존 3분리; `design-critique-decide.js#parseRetryCap`의 3-mode 파서.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/intent-context.test.js`

### Task 4: `intent-context.test.js` — 신규 verdict 회귀

- **Action**: UPDATE. (a) `reviewer-only` + `none` + dispute 부재 → `mislabel_unresolved` · (b) 같은 상황 + dispute 기재 → `preserved` · (c) 같은 상황 + 라벨을 리뷰어 id로 정정 + `ACCEPT_NOW` + override 부재 → `conflict_unresolved`(M1 규칙이 여전히 발동) · (d) **`id-mismatch` + 미정정 + dispute 부재 → `mislabel_unresolved`**(초안이 통과시키던 케이스) · (e) `compliance='absent'` → `inconclusive` · (f) **`compliance='partial'`(1/20) → `inconclusive`**(초안이 통과시키던 케이스) · (g) **warn 모드에서 `runtimeAllowed:true` ∧ `chainAllowed:true` ∧ `dedupeApproved:false` ∧ verdict 원본 보존**을 동시 고정 · (h) **`isIntentChainAllowed`: `intent_mislabel_mode='warn'` + `mislabel_unresolved` → true, 같은 mode + `incomplete` → false**(warn이 M1 축까지 열지 않음) · (i) **`isIntentApproved`가 warn receipt에 대해 false**(dedupe 미개방) · (j) `off` 모드에서 M1 판정과 **byte-identical**(회귀 0) — runner test가 `off`일 때 `parseReviewerClaims`가 **호출되지 않음**을 spy로 고정(판정 억제가 아니라 경로 미진입, DD5) · (k) `comparison` 미공급(구 caller) 시 M1 동작 유지 · (l) `intent_mislabel_mode` 키 부재(구 receipt) → M1 동작 유지 · (m) **`intent_dispute_reason="no"` → validator 기각 → dispute 부재로 취급 → `mislabel_unresolved`**(DD4 strict validator) · (n) 30자 이상 실질 dispute → `preserved` ∧ `intent_mislabel_disputes` 카운트 증가.
- **Validate**: 위와 동일.

### Task 5: `codex-invoke.js` — preamble 계약 문단

- **Action**: UPDATE `codex-invoke.js`. `INTENT_REFERENCE_PREAMBLE`을 **base(항상) + contract(조건부)** 두 상수로 분리하고, `composeFocus(focus, opts)`가 `opts.mislabelContract === true`일 때만 contract를 base 뒤에 붙인다(`impeccableAvailable`가 preamble을 조건부로 붙이는 기존 패턴 미러). **contract 문단 원문**(구현자 재량 제거 — DD1과 1:1):

  ```
  [intent-conflict 판정 계약]
  각 finding 본문에 아래 형식의 줄을 **정확히 1줄** 포함하세요.
    INTENT: none        (이 finding은 위 제약 어느 것과도 충돌하지 않음)
    INTENT: UI3         (이 finding이 지적하는 제안이 UI3과 충돌함)
  규칙:
  - 줄 **맨 앞**에서 시작해야 합니다. 문장 중간의 언급은 무시됩니다.
  - id는 **하나만**. `UI3, UI7` 같은 목록은 주장으로 세지 않습니다.
  - 위 reference 블록에 **실제로 있는** id만 쓰세요.
  - 2줄 이상 쓰면 어느 것이 진짜인지 알 수 없어 주장이 **무효**가 됩니다.
  - 다른 finding이나 문서를 인용하지 마세요 — 인용문 안의 이 줄도 세어집니다.
  - `INTENT: none`은 회피가 아니라 **1급 정답**입니다. 충돌을 지어내지 마세요.
  [/intent-conflict 판정 계약]
  ``` **계약 문단은 신규 옵션 `mislabelContract`가 참일 때만 붙는다** — `composeFocus`가 mode를 모른 채 무조건 붙이면 `MCCP_INTENT_MISLABEL=off`에서도 리뷰어 프롬프트가 달라져 end-to-end M1 등가가 깨진다(DD5). reference 자체가 없으면 preamble도 안 붙는 기존 성질은 유지.
- **Mirror**: `DESIGN_SCOPE_PREAMBLE`의 상수 문자열 스타일; `impeccableAvailable` 옵션이 preamble을 조건부로 붙이는 기존 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js` — (a) reference 미공급 시 focus 무변경 · (b) **reference 공급 + `mislabelContract:false` → focus가 v1.23.4와 byte-identical**(off 등가의 핵심 단언) · (c) `mislabelContract:true` → 계약 문단 1회만 삽입.

### Task 6: `plan-codex-runner.js` — 배선 (순서가 불변식이다)

- **Action**: UPDATE. **엄격한 순서**(DD2): ⓪ `parseMislabelMode(env)`를 **Codex 호출보다 먼저** 해석 — `invokeAdversarialReview`에 `mislabelContract: (mode !== 'off')`를 넘기고, `off`면 ①②④의 mislabel 부분을 **전부 건너뛰고** `comparison`을 넘기지 않는다(DD5 구조적 byte-identity, 프롬프트 축 포함) · ① `payload`(메모리) + `section.items`로 `parseReviewerClaims` → `claims`를 **지역 변수에 보관** · ② awaiting 아티팩트에 finding별 `reviewer_claim`과 **`claims_digest`(in-memory claim map의 canonical digest)** 를 **투영**(출력 전용) · ③ adjudication 대기·검증 · ④ **①의 지역 변수**로 `compareIntentClaims` → `decideIntentGate({..., comparison})`. awaiting을 다시 읽는 코드는 추가하지 않는다. `warn`이면 `deriveIntentGateDecision`에 `advisoryActive:true` 전달(`forceOverrideActive`와 **독립** — DD12). `intentDecision`에 `reviewer_contract`·`claim_counts`·`mislabel_disputes`·`mislabel_mode`·**`mislabel_audit`**(DD11 — 명시 응답이 필요했던 finding만, `finding_digest` 동봉) 추가.
- **Mirror**: 기존 `skipProof` → `decision` → `derived` 흐름; M1의 "awaiting은 출력, envelope는 audit 사본" 성질.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` — **필수 케이스**: 대기 중 **awaiting 아티팩트를 변조**(주장을 전부 `none`으로 치환)한 뒤에도 `reviewer_only`/`id_mismatch` 카운트와 verdict가 불변. envelope 변조 케이스도 함께.

### Task 7: receipt 표면 — schema + write + test

- **Action**: UPDATE **4파일**. `schema.js`: `INTENT_VERDICT_VALUES`에 2종 추가 + present-only **6필드** — `intent_reviewer_contract` enum `full|partial|absent`|null · `intent_claim_counts` 객체|null(top-level 닫힌 키, 합계 불변식 검증) · `intent_mislabel_disputes` 비음 정수|null · `intent_mislabel_mode` enum `enforce|warn|off`|null(DD6 sealed warn 상태) · **`intent_claims_digest` `sha256:<64hex>`|null**(DD2 — 전체 claim map 무결성) · **`intent_mislabel_audit` 배열|null**(DD11 — entry 상한은 `ADJUDICATION_LIMITS.ITEMS`(1000)와 동일해 truncation 분기 없음, 항목 스키마 검증, `dispute_reason`은 `DISPUTE_REASON_CHARS` 상한). `write.js#stampIntentDecision`이 6필드 stamp(`--intent-*` CLI 플래그는 **여전히 0건** — M1 Implement-Codex R1 F2 불변식). **`validate-cmd.js`**: blocking intent verdict별 복구 문구 분기 — `incomplete`(기존 M1 문구) / `conflict_unresolved` / **`inconclusive`("리뷰어가 `INTENT:` 계약을 따르지 않았다 — 재실행하거나 `MCCP_INTENT_MISLABEL=warn`") / `mislabel_unresolved`("리뷰어가 지목한 id를 저자가 지목하지 않았다 — 라벨 정정 또는 `intent_dispute_reason` 기재")** / `skipped-unproven`. `intent-gate-fields.test.js`: present-only · 구 receipt 무손상 · `makeSkeleton` 미포함 · 합계 불변식 위반 reject · **audit entry의 `finding_digest`가 해당 payload에 bind** · **`intent_mislabel_mode='warn'` + blocking verdict receipt가 `isIntentChainAllowed=true` ∧ `isIntentApproved=false`**(DD6) · **mode+`MCCP_SKIP_INTENT_GATE` 동시 활성 시 두 필드가 모두 봉인**(DD12).
- **Mirror**: `schema.js:738-766` present-only 가드; `by_verdict` open-map 선례; `intent_gate_force_override_reason` 텍스트 봉인 선례(`write.js:233-235`).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js`

### Task 8: `plan.md` 명령 본문 + e2e

- **Action**: UPDATE. 5.5a 필드 표에 `intent_dispute_reason` 행 추가 + "awaiting 파일의 `reviewer_claim`과 다르면 정정하거나 dispute를 적어라" 지시 + 오심 관련 문단을 M1.5 계약으로 갱신(현재 "detecting the latter is M1.5's job" 문장 대체). 5.6 verdict 분기표에 `inconclusive`·`mislabel_unresolved` 2행 추가(각각 복구 지시 포함). e2e: 합성 payload로 `reviewer-only` → block → dispute 추가 → pass 경로를 코드 레벨로 1회 통과.
- **Mirror**: 5.6의 기존 verdict 분기 서술.
- **Validate**: e2e 테스트 green + `grep -c "intent_dispute_reason" plugins/mccp/commands/plan.md` ≥ 2.

### Task 9: 버전·문서 동기

- **Action**: UPDATE `plugin.json` `1.23.4`→`1.23.5` + renderer footer 2면 + `i18n-surface.test.js` 단언 2건 + `CHANGELOG.md` `[1.23.5]` + `CLAUDE.md` §3.13에 M1.5 절(M1과의 경계·DD9의 정확한 주장·`warn`이 dedupe를 안 연다는 점) + §4 토글 `MCCP_INTENT_MISLABEL` 1건 + PRD Milestone 1.5 `in-progress` + Plan 경로.
- **Mirror**: §3.7 5면 동기 체크리스트.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` + `grep -rn "1\.23\.5" plugins/mccp/.claude-plugin/plugin.json plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js CHANGELOG.md`

## Validation

```bash
# 신규 + 변경 모듈 단위
node --test plugins/mccp/scripts/lib/tests/intent-claims.test.js
node --test plugins/mccp/scripts/lib/tests/intent-context.test.js
node --test plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js
node --test plugins/mccp/scripts/receipt/tests/intent-gate-fields.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 회귀: off 모드에서 M1 판정 byte-identical
MCCP_INTENT_MISLABEL=off node --test plugins/mccp/scripts/lib/tests/intent-context.test.js

# receipt 표면 전체 (기존 corpus 무손상)
node --test plugins/mccp/scripts/receipt/tests/

# 버전 5면 동기
grep -rn "1\.23\.5" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js \
  plugins/mccp/scripts/lib/renderer/markdown.js CHANGELOG.md

# 머지 사고 방지 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 리뷰어가 `INTENT:` 계약을 아예 안 따라 탐지 축이 죽는다 | **高** | Task 0가 production 경로로 **먼저 측정**한다(DD10). 낮으면 default `warn`으로 ship하되 **milestone을 complete로 올리지 않는다** — 배선만 하고 켜지 않은 채 달성을 주장하지 않는다 |
| **`full` 요구가 게이트를 자주 막는다**(DD5가 `partial`을 없앤 대가) | **高** | 의도된 교환이다 — `partial` 통과는 탐지 축을 무력화한다. 완화는 임의 임계가 아니라 `warn` 모드와 `MCCP_SKIP_INTENT_GATE`(verdict 봉인 유지)가 담당한다. Task 0가 이 빈도를 실측한다 |
| 계약 강제가 게이트를 영구 wedge | 中 | `warn` 기본 후보 + 기존 `MCCP_SKIP_INTENT_GATE` override(verdict 봉인 유지). 불응은 hard-block이 아니라 `inconclusive`이며 효력은 모드가 정한다 |
| **`warn` 축이 M1 blocking verdict까지 열어버린다** | 中 | `isIntentChainAllowed`의 warn 분기를 mislabel 축(`inconclusive`/`mislabel_unresolved`)으로 **화이트리스트**하고, `incomplete`/`conflict_unresolved`/`skipped-unproven`에 열리지 않음을 Task 4 (h)가 고정 |
| 리뷰어가 충돌을 날조해 dispute 부담만 증가 | 中 | preamble이 `none`을 1급 답변으로 규정(DD7) + `reviewer_only` 대비 dispute 비율이 receipt에 남아 관측됨 |
| `intent_dispute_reason`이 새 고무도장 통로가 된다 | 中 | **사실이며 부정하지 않는다** — M1의 `intent_override_reason`과 동형이다. 게이트는 옳음이 아니라 기록을 강제한다(DD4). 카운트가 감사에 남는 것이 통제 |
| Codex 계정 한도로 Task 0 실측 불가 | 中 | fallback = default `warn` + 사유 문서화. `codex exec` 직접 경로는 wrapper env 게이트와 무관하므로 `MCCP_CODEX_DISABLED=1`은 장애가 아님 |
| 앵커 정규식 오탐으로 산문이 주장으로 오인 | 低 | 라인 선두 앵커 + 토큰 문법 `^UI\d+$` + Task 2 (a) 회귀 |
| 병렬 브랜치 version 충돌 (`diverse-agent-review-m1` 미머지) | 中 | §3.7 forward-only 상향. 머지 순서에 따라 `1.23.6`으로 올릴 준비 |
| 자기적용 유보 — 이번 게이트는 구 캐시로 돈다 | 中 | 정직 표기(위 User Intent 각주). Task 0 실측 + Task 8 e2e가 대신 증명 |

## Acceptance

- [ ] Task 0 실측이 **production 경로**(`codex-invoke` wrapper + `parseReviewPayload`)로 수행되고 `claimed/total` 표가 문서에 존재 — 또는 미실행 시 **PRD Milestone 1.5가 `complete`로 올라가지 않고** UI10 미달성이 명시됨(DD10)
- [ ] **`enforce`에서** `reviewer-only` 1건 + `intent_conflict='none'` + dispute 부재 → **receipt 미작성**(mechanical 증명). **`warn`에서는 receipt가 blocking verdict를 봉인한 채 작성**되고 `isIntentApproved=false`가 유지됨
- [ ] **`id-mismatch`(리뷰어 UI2 / 저자 UI7) + 미정정 + dispute 부재 → `enforce`에서 receipt 미작성** — conflict-vs-none만이 아니라 라벨 비대칭을 실제로 탐지함
- [ ] 같은 케이스에 dispute 기재 → pass, 라벨 정정 → M1 override 규칙으로 이관
- [ ] **`compliance='partial'`(1/20)이 `inconclusive`** — 주장 1건이 20건 리뷰를 통과시키지 못함
- [ ] `claimed/total` 계측이 receipt에 남아 1/20과 19/20이 감사에서 구분됨
- [ ] **fenced code block · blockquote · 앵커 2건 이상 · 콤마 목록 · dangling id가 전부 `unclaimed`** — `none`으로 접히지 않음(자기참조 인용 벡터 차단)
- [ ] **`warn`이 `dedupeApproved`를 절대 열지 않음** ∧ **`intent_gate_force_override`를 재사용하지 않음** ∧ **mislabel 축 외 verdict(`incomplete` 등)를 열지 않음**을 test가 고정
- [ ] **`off` 모드가 end-to-end M1 등가** — (1) 리뷰어에게 간 focus 문자열이 v1.23.4와 byte-identical(계약 문단 미삽입) ∧ (2) `parseReviewerClaims`가 **호출조차 되지 않음**(spy 고정) ∧ (3) 오라클 판정 동일. `intent_mislabel_mode` 키 부재 receipt도 M1 동작 유지
- [ ] **`intent_mislabel_audit`이 receipt에 봉인**되고 각 entry가 `finding_digest`로 해당 payload에 bind — 감사자가 "리뷰어 주장 vs 저자 근거"를 사후 대조 가능(카운트만으로는 불가). 상한이 `ADJUDICATION_LIMITS.ITEMS`와 같아 **truncation 경로가 존재하지 않음**
- [ ] **`intent_claims_digest`가 전체 claim map을 봉인** — 통과한 finding의 claim이 조작돼도 사후 탐지 가능(DD2)
- [ ] DD12 3조합 표대로 봉인 — 특히 **`warn`이 통과시킨 경우 `intent_gate_force_override`는 `false`**(적용되지 않은 override를 참으로 기록하지 않음)
- [ ] `parseMislabelMode`의 default가 **명명 상수 `DEFAULT_MISLABEL_MODE`** 이고, 그 위 주석이 Task 0 근거 문서 경로 + 측정일을 가리킴
- [ ] `validate-cmd`가 신규 verdict 2종에 **각각의 복구 문구**를 내보냄(M1 문구 재사용 금지)
- [ ] **`intent_dispute_reason`에 strict validator 적용** — `"no"` 류 1-token은 dispute 부재로 취급돼 여전히 blocking
- [ ] plan이 강제하는 명제가 **"기록 없는 수용 0"**으로 서술돼 있고, "오심 0"으로 읽히는 문구가 DD9·Summary·milestone 표기 어디에도 없음
- [ ] 리뷰어 주장이 **메모리에서만** 온다 — 대기 중 **awaiting 아티팩트** 변조에도 카운트·verdict 불변(DD2 회귀, envelope도 함께)
- [ ] `--intent-*` CLI 플래그 여전히 0건
- [ ] 신규 meta **6필드** present-only + `makeSkeleton` 미포함 + 구 ship corpus hash 무손상
- [ ] `plugin.json` `1.23.5` + footer 2면 + i18n test 2건 + CHANGELOG + CLAUDE.md §3.13/§4 동기
- [ ] `git diff --diff-filter=D` 결과에 의도치 않은 삭제 0건
- [ ] Patterns mirrored, not reinvented

## Adversarial Review Record

### santa-loop R1 — Opus + GPT-5.4 (독립·병렬, 양쪽 FAIL → NAUGHTY)

| Round | Reviewer A (Opus) | Reviewer B (GPT-5.4) |
|---|---|---|
| 1 | FAIL (8중 6 FAIL) | FAIL (8중 7 FAIL) |

**양쪽 포착 (3)**

| # | 지적 | 처리 |
|---|---|---|
| 1 | `partial` non-blocking은 M1의 구멍을 리뷰어 쪽으로 옮긴 것 — 1/20 준수가 통과 | DD5 재작성: `full` 이분법, `partial`→`inconclusive`. 임의 임계 대신 `claimed/total` 계측을 별도 보존 |
| 2 | DD9의 UI10 달성 주장이 과장 | DD9 재작성: `full` 리뷰에 한한 조건부 달성 + `warn`에서는 미달성임을 명시 |
| 3 | Task 0 3회 표본이 shipped default를 정하기에 부족 | DD10 신설: 3회는 만장일치에서만 결론, 갈리면 증회 |

**Reviewer A 단독 (1)**

| # | 지적 | 처리 |
|---|---|---|
| 4 | DD2 회귀 test가 **envelope**를 변조하는데 정작 주장을 싣는 파일은 **awaiting** | Task 6 Validate에 awaiting 변조 케이스 추가 + awaiting에 `claims_digest` stamp. A가 제시한 메커니즘("runner가 디스크에서 claims를 읽게 된다")은 **오류** — runner는 awaiting을 다시 읽지 않는다. A의 후속 제안("awaiting 쓰기를 결정 봉인 후로")도 성립 불가(저자가 그 파일을 보고 adjudication을 쓴다). **test 겨냥 오류만 실재했고 그것만 흡수** |

**Reviewer B 단독 (4) — 전부 실코드 대조로 확인**

| # | 지적 | 처리 |
|---|---|---|
| 5 | **`warn`이 구현 불가** — `isIntentChainAllowed`는 `intent_gate_force_override`만 인정(`intent-context.js:721-725`). 재사용하면 audited-override 의미 오염, 안 하면 chain이 막혀 `enforce`와 구분 불가 | DD6 전면 재작성 + 신규 sealed 필드 `intent_mislabel_mode` + reader 명시 확장. **이번 라운드 최대 수확** |
| 6 | 인용/코드블록 안의 `INTENT:` 줄이 실제 주장과 구분 불가 — **이 plan 문서 자체가 벡터** | DD1: fence·blockquote 제거 후 스캔 + **정확히 1건**이 아니면 `unclaimed` |
| 7 | 멀티 id 주장 vs 저자의 단일 `intent_conflict`(`:617-623`) 집합/스칼라 불일치 미정의 | DD1: 단일 id만 인정, 콤마 목록은 `unclaimed` |
| 8 | `agree-conflict`가 **다른 id**여도 auto-pass → conflict-vs-none만 탐지하면서 "라벨 비대칭 탐지"라 주장 | DD3: `id-mismatch` 분류 신설, blocking 규칙을 "리뷰어가 지목한 id를 저자가 지목 안 함" 하나로 통일 |
| 9 | Task 0가 `codex exec` 직접 호출이라 production 경로(`composeFocus:159-166` / `parseReviewPayload:48-59`)를 안 지남 | DD10: wrapper 경유 필수, 측정 위해 `MCCP_CODEX_DISABLED` 일시 해제 + 문서화 |
| 10 | 측정 불가 시 조용히 `warn` default로 ship 가능 | DD10 + Acceptance: milestone을 `complete`로 올리지 않는 정직 강등 |

**방법론 관찰**: 실행 가능성을 죽이는 결함(#5)은 GPT-5.4만 잡았고 Opus는 같은 축(`No regressions`)을 **PASS**로 통과시켰다. 반대로 Opus가 제기한 DD2 채널 우려는 GPT-5.4가 코드로 반증했다(`plan-codex-runner.js:6-25, :354-397`). 양방향 비대칭 포착 — M1 santa-loop 3라운드와 같은 패턴이 재현됐다.

**기각한 것**: A의 "Task 0 미측정 시 `enforce`가 fail-closed 정답" — `enforce` 기본은 리뷰어 불응 시 모든 plan 게이트를 막아 `MCCP_SKIP_INTENT_GATE` 상습 사용을 훈련시키고, 그게 게이트를 더 확실히 죽인다. 대신 **milestone을 complete로 올리지 않는 것**이 정직한 fail-closed다.

### santa-loop R2 — 개정판 재검 (양쪽 FAIL → 재수정)

| Round | Reviewer A (Opus) | Reviewer B (GPT-5.4) |
|---|---|---|
| 2 | FAIL (8중 **1** FAIL) | FAIL (8중 7 FAIL) |

R1 findings 기록은 프롬프트 사본에서 **제거**하고 돌렸다(이미 지적돼 고쳐진 항목을 리뷰어가 통과시키는 순환 근거 차단). A는 R1에서 자기가 제기했던 DD2 채널 우려를 이번엔 코드 인용과 함께 **스스로 철회**했다 — R1 수정이 실제로 착지했다는 신호.

**A 단독 (3, 전부 흡수)**

| # | 지적 | 처리 |
|---|---|---|
| 11 | `intent_dispute_reason` 무검증 — `"no"`로 통과. "M1 구멍에 문장 하나 값만 붙였다" | strict `validateReason` 재사용 + **DD9 항목 4**에 "형식만 갖춘 dispute면 통과한다"를 미달성 사유로 명시. 강제 명제를 "오심 0"이 아니라 **"기록 없는 수용 0"**으로 재서술 |
| 12 | `off` byte-identity의 단락 지점 미정의 | DD5: **판정 억제가 아니라 경로 미진입** |
| 13 | 이분법 compliance 오탐율 미측정 | Task 0 4번째 측정축 + 사전 선언 결정 규칙 |

**B 단독 (5, 전부 흡수) — 셋은 R1 수정안 *자체*의 결함**

| # | 지적 | 처리 |
|---|---|---|
| 14 | **`off`가 end-to-end 등가가 아니다** — Task 5가 preamble을 무조건 바꿔 `composeFocus`(`:52-58,159-167`)가 mode를 모른 채 계약 문단을 붙이므로 **리뷰 payload 자체가 달라진다**. A의 #12 수정(오라클 경로 미진입)은 절반만 닫았다 | `mislabelContract` 옵션 신설, 등가 단언을 **focus 문자열 축까지** 확장 |
| 15 | **`claims_digest`가 theater** — awaiting은 runner `finally`가 **삭제**하고(`:557-558`) 나중에 대조하는 코드도 없다. 사라지는 파일 안의 digest는 증거가 아니다 | **DD11 신설** — `intent_mislabel_audit`을 receipt에 봉인 |
| 16 | dispute가 "기록된다"지만 receipt는 **카운트만** 담는다(`write.js:230-235`) — 감사자가 근거를 볼 수 없다 | DD11이 `dispute_reason` 텍스트 + `finding_digest`를 봉인(M1 `intent_gate_force_override_reason` 선례) |
| 17 | `validate-cmd`가 blocking intent verdict 전부에 M1 문구 하나만 출력(`:543-555`) → 신규 verdict에 **오진 유도** | Files to Change에 `validate-cmd.js` 추가 + per-verdict 복구 문구 |
| 18 | Files to Change **3필드** vs DD8/Task 7 **4필드** 모순 · join/coercion 규칙 미정의 · 두 override 우선순위 미정의 | 5필드로 통일 · `"\n"` join + 비문자열 강제 명시 · **DD12 신설**(두 필드 동시 봉인) |

**B 제안 중 반영**: 정지 규칙 강화(3회 → 최소 5회, 경계 10%p 이내면 10회). **미반영**: "compliance를 mislabel blocking과 분리해 오형식 1건을 warning으로 강등" — DD5가 방금 닫은 `partial` 통과를 다른 이름으로 되살린다. 완화는 임계가 아니라 mode가 담당한다는 결정을 유지한다.

**방법론 관찰 2**: A는 1 FAIL, B는 7 FAIL. R1에서 A가 만든 수정 방향(#12 `off` 경로 미진입)을 B가 "절반만 닫혔다"고 정정했다 — **한 리뷰어의 수정이 다른 리뷰어의 다음 라운드 표적이 되는** 구조가 실제로 작동했다. 이번 라운드 흡수 8건 중 **3건(#14·#15·#16)은 R1 수정이 만든 결함**이다.

### santa-loop R3 — cap 도달, **비수렴 종료(NAUGHTY escalated)**

| Round | Reviewer A (Opus) | Reviewer B (GPT-5.4) |
|---|---|---|
| 3 | FAIL (8중 8 FAIL — 아래 참조) | FAIL (8중 **3** FAIL) |

**B의 지적 4건 — 전부 실재, 전부 흡수**

| # | 지적 | 처리 |
|---|---|---|
| 19 | Summary·Acceptance가 "응답 없으면 receipt 미작성"을 **무조건**으로 서술하나, `warn`에서는 receipt가 써진다(`write.js:239`는 `runtime_allowed===false`에서만 멈춤) — 자기 plan의 DD6과 모순 | Summary·DD9·Acceptance를 **mode-qualified**로 재서술 |
| 20 | `intent_mislabel_audit` 상한 200 vs M1의 adjudication 상한 1000 — 초과 시 truncate/block 미정의 | 상한을 `ADJUDICATION_LIMITS.ITEMS`(1000)로 일치 → 분기 자체 소멸(조용한 truncation은 감사 표면 무력화라 선택지 아님) |
| 21 | DD12 자기모순 — "여전히 blocking일 때만 override 적용"과 "둘 다 활성이면 두 필드 동시 봉인"이 양립 불가 | DD12를 **3조합 표**로 확정. `warn`이 통과시켰으면 override는 적용된 적 없으므로 `false` — 플래그는 *설정 여부*가 아니라 **효력 발휘 여부** |
| 22 | Task 0의 측정 default가 **런타임 어디에 사는지** 미정의 | `DEFAULT_MISLABEL_MODE` 명명 상수 + 근거 문서 경로·측정일 주석 + Task 9 문서 동기 |

B 제안 중 **미반영**: 다중 `UI` id 충돌 케이스 — 단일 id 계약이 정당한 multi-conflict를 `id-mismatch`로 만든다는 지적은 맞으나, 그 해소는 저자 라벨(`intent_conflict`)을 집합으로 바꾸는 M1 스키마 변경을 요구한다. `id-mismatch`는 **명시 응답을 요구할 뿐 차단이 아니므로** 이 경우 저자가 dispute로 "복수 충돌 중 하나를 지목했다"고 적으면 통과한다 — 비용이 문장 하나이므로 M1 스키마를 건드릴 근거가 못 된다.

**Reviewer A R3는 신뢰도가 낮아 대부분 기각했다.** 8/8 FAIL이었으나 실제 대조 결과: `composeFocus`에 파라미터가 "없다"(→ plan이 추가하자는 제안 · 범주 오류) · `INTENT_GATE_VERDICTS`가 "아직 확장 안 됐다"(→ Task 3(a) · 범주 오류) · DD12·Task 0·dispute 카운트가 "미명시"(→ 셋 다 본문에 있음 · 오독) · `intent_mislabel_audit`이 "git-tracked ship corpus에 leak 표면"(→ **전제 거짓**: intent 게이트는 `mccp-plan-codex` 전용이고 §3.12상 plan receipt는 working-tree only). 출력에 문자 깨짐(`리버에 间 focus文字列`)이 섞여 생성 품질 자체가 저하된 것으로 보인다. **채택한 3건**: `isIntentChainAllowed` 신규 분기의 **위치**를 명시(early-return, `classifyIntentMeta` 호출 전) · Task 5에 계약 문단 **원문** 기재 · DD11의 tracked-corpus scope를 본문에 명시.

**종료 판정**: 3라운드 cap 도달, 양쪽 FAIL → santa-loop 규정대로 **push 없이 escalate**. 단 B는 7→3으로 수렴했고 남은 3 FAIL은 전부 서술 정합성 결함이었지 설계 반론이 아니었다(Correctness·Security·Error handling·No regressions·Liveness 5축 PASS). **위 #19~#22 및 A 채택 3건은 cap 이후 수정이므로 어느 리뷰어의 검증도 받지 않았다** — 구현 착수 전 R4를 한 번 더 돌리거나, `/mccp:prp-implement`의 Implement-Codex 게이트가 그 역할을 대신해야 한다.

## Notes

- **브랜치**: 원 worktree의 `feat/codex-intent-context`는 PR #118로 머지 완료(HEAD == `origin/main`). M1.5 작업은 그 위에서 분기한 **`feat/codex-intent-context-m1-5`** 에서 진행한다(§3.8 — 별도 worktree 분리는 구현 착수 시).
- **fan-out**: 세션 정책상 workflow/Agent 미사용 → Phase 2.5 skip, 인라인 Pattern Grounding 사용. runaway 예약 없음(cap 소비 0).

## Design Critique

**Trigger**: axis (a) detector positive — `impeccable-detect` `design_signal=true`, `reason=ok`. signal files: `plugins/mccp/scripts/lib/renderer/{html.js,markdown.js}` + `renderer/tests/i18n-surface.test.js` (Task 9 version-footer sync).

**SKILL first-step**: `skills/frontend-design-direction/SKILL.md` `## Output Constraints` read before the loop.

| Round | Findings (HIGH/CRITICAL/UNKNOWN) | Verdict |
|---|---|---|
| R0 | 0 | **CONVERGED** (`decideCritique`, cap=2) |

**Assessment A (design review, narrow scope)** — Task 9의 렌더 표면 변경은 `v1.23.4 → v1.23.5` **버전 문자열 1개**뿐이다. 4개 Output Constraints 각각에 대해: heading depth 무변경 · accent/색 토큰 무변경 · footer 문자열에 unrendered marker 없음(`markdown.js`의 `_…_`는 markdown surface에서 정상 렌더) · list-of-N 항목 수 무변경. 위반 0.

**Assessment B (deterministic detector)** — `detect.mjs --json .claude/cache/status.html` → 2건, **둘 다 선재 항목이며 본 plan이 유발하지 않았다**:

- `em-dash-overuse` (warning) — 본문 em-dash 7개. derive된 `.claude/` 원본 콘텐츠에서 유입. 실재하는 지적이지만 M1.5 scope 밖(렌더러 카피 축).
- `numbered-section-markers` (advisory) — `06, 10, 11, 12`. PR/마일스톤 번호가 섹션 마커로 오인된 도메인 오탐.

둘 다 이 milestone이 손대는 표면이 아니므로 critique findings에 산입하지 않았다. 숨기지 않기 위해 여기 기록한다.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## External Research Provenance

- Source PRD: .claude/prds/codex-intent-context.prd.md
- References section sha256: 8fece5c94acfa1a583e0de7beae9e1d075c2461b9be38072f36cd8c9d21fd9bf
- Stamped at: 2026-08-09T09:18:52.936Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Codex Adversarial Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy)

- 호출: `node <plugin-root>/scripts/lib/codex-invoke.js adversarial-review` → `classification=disabled`, `blocking=false`, `durationMs=0` (spawn 직전 short-circuit, v0.3.5 first-class skip)
- 라운드 수: 0
- 합치 결론: **미판정** — Codex가 실행되지 않았다. 이 plan은 cross-model adversarial review를 **받지 않은 상태**다.
- YAGNI Triage: 해당 없음 (finding 0건)
- Deferred to backlog: 0
- Open Questions: 없음 (리뷰 미실행)
- `resolution.codex_verdict`: `skipped` — 승인이 아니다. cross-gate dedupe는 `converged`만 인정하므로 `/mccp:pr` 단계에서 PR-Codex가 **실제로 발화**한다(fail-closed 유지).

> **정직 표기**: 운영자 환경에 `MCCP_CODEX_DISABLED=1`이 설정돼 있어 Plan-Codex가 발화하지 않았다. 이 milestone은 리뷰어 계약 자체를 설계하는 축이므로 cross-model 검증의 가치가 특히 크다 — 구현 전 `/mccp:santa-loop`(Reviewer B가 `codex exec`를 직접 호출하므로 이 env와 무관, `commands/santa-loop.md:117`)로 적대 검증을 받는 것을 권장한다. Task 0 spike도 같은 경로를 쓴다.

## Codex Implementation Review

> Codex skipped per `MCCP_CODEX_DISABLED=1` (env-level policy, first-class)

- 호출: `node <plugin-root>/scripts/lib/codex-invoke.js adversarial-review` → `classification=disabled`, `blocking=false`, `durationMs=0` (spawn 직전 short-circuit, v0.3.5)
- 라운드 수: 0
- 합치 결론: **미판정** — Implement-Codex가 실행되지 않았다. 아래 implement-time 결정들은 cross-model 적대 검증을 **받지 않은 상태**다.
- YAGNI Triage: 해당 없음 (finding 0건)
- Deferred to backlog: 0
- Open Questions: 없음 (리뷰 미실행)
- `resolution.codex_verdict`: `skipped` — 승인이 아니다. cross-gate dedupe는 `converged`만 인정하므로 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.

### Implement-time decisions (plan이 사전 확정하지 않은 항목)

리뷰를 못 받았으므로 **무엇이 검증되지 않았는지**를 명시적으로 남긴다.

| # | 결정 | plan의 상태 |
|---|---|---|
| D1 | `intent-claims.js` 내부 분해 — 인용 stripper / 앵커 스캐너 / 분류기를 별도 함수로 분리 | 미확정 (파일 단위만 지정) |
| D2 | stripper 적용 순서 — fence(백틱·틸드) → HTML 블록 → 4-space 들여쓰기 → blockquote | DD1이 대상 5종만 열거, 순서 미지정 |
| D3 | `compareIntentClaims` 집계 객체의 최종 키 이름 | Task 1이 목록만 제시 |
| D4 | `intent_claim_counts`의 닫힌 키 집합 + 합계 불변식의 정확한 식 | Task 7이 "합계 불변식 검증"만 명시 |
| D5 | `DEFAULT_MISLABEL_MODE` 상수의 export 여부·배치 | Task 3(g)가 이름만 확정 |
| D6 | runner의 `off` 분기 배치 지점 (Codex 호출 전 단일 지점 vs 분산) | DD5가 "호출 앞"만 규정 |
| D7 | `validate-cmd.js` per-verdict 복구 문구의 최종 문안 | Task 7이 요지만 제시 |
| D8 | `parseReviewerClaims` 미호출을 고정하는 spy 구현 방식 | Task 4(j)가 "spy 고정"만 명시 |

### Security Reviewer

> security-reviewer unavailable, skipped (auto-fallback): 세션 정책상 Agent/subagent 호출이 금지돼 있어 Task tool을 호출할 수 없다 (plan `## Notes`의 "세션 정책상 workflow/Agent 미사용"과 동일 제약).

본 변경은 security-sensitive 축에 해당한다 — 신뢰할 수 없는 LLM 출력(reviewer free text)에 대한 **입력 검증**(앵커 정규식·인용 stripper·상한)과 **게이트 인가 표면**(`warn` 모드 완화·`intent_dispute_reason` 통로)을 동시에 다룬다. 따라서 이 skip은 무해하지 않으며, receipt에 `security_skipped=true`로 봉인돼 `/mccp:pr`을 fail-closed로 막는다.

### 검증 공백 (정직 표기)

`## Adversarial Review Record` 말미가 요구한 대체 검증 — "구현 착수 전 R4를 한 번 더 돌리거나, `/mccp:prp-implement`의 Implement-Codex 게이트가 그 역할을 대신해야 한다" — 은 **어느 쪽도 충족되지 않았다**. Implement-Codex는 `MCCP_CODEX_DISABLED=1`로 미발화했고 santa-loop R4는 실행되지 않았다. cap 이후 수정분(#19~#22 + Reviewer A 채택 3건)과 위 D1~D8은 리뷰 없이 구현된다.
