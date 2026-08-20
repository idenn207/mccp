# Plan: Review Loop Bypass — M1 단일통과 토글

**Source PRD**: .claude/prds/review-loop-bypass.prd.md
**Selected Milestone**: M1 — 단일통과 토글
**Complexity**: Medium

## Summary

환경변수 `MCCP_REVIEW_SINGLE_PASS`(고정 enum 3종)이 켜지면 `/mccp:plan`의 L2 승인 패널이 **1회만 발화하고 비수렴 verdict가 진행을 차단하지 않으며**, 세 게이트의 Codex 라운드 상한이 1로 **고정**되고, `/mccp:santa-loop`은 **라운드를 열지 않는다**. L1은 불가침으로 남고, receipt는 **실제 verdict를 그대로 봉인한 채** 토글 사유를 present-only 필드로 함께 봉인한다 — `converged`로 위장하지 않는다.

핵심 설계 결정 하나로 PRD Open Question 3이 닫힌다: **새 verdict 값을 만들지 않는다.** `schema.js:224` 이하가 이미 "비수렴 verdict도 감사용 proof를 실을 수 있다"를 허용하고 있고, `receipt-convergence.js:45`가 review 축에서 `converged`만 승인으로 읽으므로, 정직한 `divergent`를 봉인해도 chain은 진행되고 대시보드·감사는 거짓말하지 않는다. 토글이 바꾸는 것은 **명령 본문이 HALT하는가**뿐이고 receipt가 주장하는 내용은 한 글자도 바꾸지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 하나의 환경변수로 세 게이트의 리뷰 루프를 단일 통과로 만든다 | direction |
| UI2 | 사유는 고정 enum 3종이며 토글의 값 자체다 — 별도 사유 변수를 두지 않는다 | constraint |
| UI3 | enum 밖 값은 fail-closed로 꺼진 것으로 보고 loud warn을 낸다 | constraint |
| UI4 | santa-loop은 발화하지 않는다 | constraint |
| UI5 | 라운드 반복은 1회로 고정한다 — R0만 돌고 R1 이상은 없다 | constraint |
| UI6 | L2 승인 패널은 1회 발화하며 비수렴 verdict가 진행을 차단하지 않는다 | constraint |
| UI7 | L1 mechanical은 불가침이며 실패하면 토글이 켜져 있어도 HALT한다 | constraint |
| UI8 | receipt는 미작성이나 미승인이 아니라 사유가 봉인된 승인으로 남는다 | constraint |
| UI9 | Codex 게이트 세 개는 무변경이다 — 본 토글은 반복을 없애지 cross-model review를 없애지 않는다 | exclusion |
| UI10 | terminal ship gate의 codex_verdict 기반 no-ship 판정은 무변경이다 | exclusion |
| UI11 | 기존 5종 리뷰 토글의 통합이나 은퇴는 본 작업 범위 밖이다 | exclusion |
| UI12 | 전역이나 CI 상시 활성은 만들지 않는다 — 작업 단위 opt-in만 지원한다 | exclusion |
| UI13 | 토글 사용률의 대시보드 노출은 후속 축이다 | exclusion |
| UI14 | 미흡수 지적의 backlog 자동 적재는 M2 소유이며 본 마일스톤 밖이다 | exclusion |
| UI15 | 본 작업과 untracked PRD는 새 worktree에서 진행한다 | direction |
| UI16 | 본 plan 게이트는 MCCP_GATE_ROUND_CAP=1로 돈다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| env enum 파서 | `plugins/mccp/scripts/lib/santa/gate.js:138` | unset→default · `indexOf` 열거 검사(대소문자 구분) · 불량값 loud warn. 판정 함수는 env를 모르고 파서만 안다(DD3a) |
| 순수 승인 오라클 | `plugins/mccp/scripts/lib/plan-review/decide.js:140` | `(mode, l1, l2, l3)`만 받아 `{verdict, source, proof, block, reason}`를 내는 pure 함수. I/O는 호출자 소유 |
| L1 gatekeeper 경계 | `plugins/mccp/scripts/lib/plan-review/decide.js:150` | L1이 `converged`가 아니면 L2를 **보지 않고** 즉시 반환. 어떤 완화도 이 분기보다 뒤에 온다 |

<details>
<summary>+5 more patterns</summary>

| Category | Source | Pattern |
|---|---|---|
| present-only meta 봉인 | `plugins/mccp/scripts/receipt/write.js:771` | `makeSkeleton` **밖에서** 값이 있을 때만 `receipt.meta.X = …` → 미전달 receipt는 키 자체가 없어 canonical hash 무변동 |
| ambient env stamp vs 명시 proof | `plugins/mccp/scripts/receipt/write.js:612` | `codex_disabled`는 env로 자동 stamp되는 **정직한 주석**, `codex_disabled_at_pr`은 caller 명시 **감사 축**. 둘을 섞지 않는다 |
| schema present-only 검증 | `plugins/mccp/scripts/receipt/schema.js:191` | 값이 있을 때만 열거·형태 검사. 부재는 정상 상태이지 마이그레이션 부채가 아니다 |
| santa CLI 선검사 + exit | `plugins/mccp/scripts/lib/santa/cli.js:615` | `beginRound` **이전에** 거부하면 캡이 소모되지 않는다. 신규 exit code를 만들지 않고 사유 문자열로 구분 |
| 라운드 정책 test | `plugins/mccp/scripts/lib/tests/round-budget.test.js:17` | 현재는 production 상대가 없는 test-local `parseCap`. 파일 헤더가 "future helper extraction"을 명시적으로 예고 |

</details>

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/review-single-pass.js` | CREATE | 토글 enum 파서 + 유효 라운드 캡 오라클. 세 게이트가 공유하는 단일 판정 지점 |
| `plugins/mccp/scripts/lib/plan-review/decide.js` | UPDATE | `singlePass` 인자 수용 — L1 분기 **뒤**, quorum 비수렴 분기에서만 `block:false` + 감사 proof |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `decide`가 파서를 호출해 오라클에 주입하고 `single_pass_reason`을 decision.json에 emit |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | `begin-round`가 `beginRound` 이전에 토글을 보고 라운드를 열지 않는다 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `meta.review_single_pass_reason`(env ambient + 명시 우선) · `meta.review_single_pass_bypassed_verdict`(명시 전용) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | 두 필드 present-only 검증 + "적용되지 않은 우회의 사유를 남기지 않는다" 불변식 |
| `plugins/mccp/scripts/lib/tests/review-single-pass.test.js` | CREATE | 파서·캡 오라클·`decideReview` 완화 경계 단위 test |
| `plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js` | CREATE | CLI 왕복 test — L1 divergent는 토글에도 EX_BLOCK, quorum 비수렴은 EX_OK |
| `plugins/mccp/scripts/receipt/tests/review-single-pass-fields.test.js` | CREATE | receipt 봉인 + 위조 불가 + dedupe 무영향 + chain 회귀 pin |
| `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js` | CREATE | 세 명령 본문이 캡을 공유 오라클에서 읽는지 정적 단언 |
| `plugins/mccp/scripts/lib/tests/round-budget.test.js` | UPDATE | test-local `parseCap`을 신규 production 오라클로 교체 |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.2e 토글 안내 · 5.6b 플래그 forward · Phase 5.4 캡을 오라클에서 읽기 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 2.5 라운드 캡을 오라클에서 읽기 |
| `plugins/mccp/commands/pr.md` | UPDATE | codex-runner 자식 프로세스에 **고정된** 캡을 export |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | 신규 거부 사유의 exit code 해석 행 추가 |
| `docs/ENVIRONMENT.md` | UPDATE | §11에 토글 등재 (canonical 레퍼런스) |
| `docs/gate-design.md` | UPDATE | 완화 경계·거부 이유의 설계 근거 상주처 |
| `CLAUDE.md` | UPDATE | §3.15 신설 — 토글의 계약과 주장하지 않는 것 |
| `CHANGELOG.md` | UPDATE | v1.27.3 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.27.2 → 1.27.3 (§3.7 patch — PRD 전체가 아니라 M1 단독) |
| `.claude/prds/review-loop-bypass.prd.md` | UPDATE | M1 행 status=in-progress + Plan 셀 연결, Open Question 3·2·5 판정 기록 |

## Design Decisions

### DD1 — 새 verdict 값을 만들지 않는다 (PRD Open Question 3의 답)

`REVIEW_VERDICT_VALUES`는 `CODEX_VERDICT_VALUES`와 **어휘를 공유**한다(`review-verdict.js:46`). 여기에 `bypassed` 같은 값을 더하면 codex 축 소비자 전부가 모르는 값을 보게 되고, 과거 receipt corpus의 검증 규칙도 함께 흔들린다.

대신 **실제 verdict를 그대로 봉인**한다. 근거는 코드에 이미 있다:

- `schema.js:224-238` — `review_verdict !== 'converged'`인 proof는 구조 불변식을 요구받지 않고 경로 형태만 검사받는다. 주석이 이유를 직접 말한다: *"A divergent/unavailable verdict carries its proof for audit."*
- `receipt-convergence.js:45` — review 축에서는 `verdict === 'converged'`만 승인이다. `divergent`를 봉인하면 대시보드·`evidence-audit`·ship gate가 전부 정직하게 비승인으로 읽는다.
- `validate-cmd.js`는 `review_verdict`를 **소비하지 않는다**(grep 결과 0건). 따라서 비수렴 plan receipt가 `/mccp:prp-implement`를 막지 않는다 — chain은 진행되고, 기록은 사실대로 남는다.

즉 토글이 바꾸는 것은 **명령 본문의 HALT 여부** 하나이고, receipt가 주장하는 내용은 무변경이다. 이것이 "converged로 위장하면 §3.12의 완료 판정 키 신뢰가 깨진다"에 대한 답이다 — 위장하지 않으면 신뢰가 깨질 일도 없다.

### DD2 — 완화 대상은 `divergent` 하나뿐이다. `unavailable`은 절대 완화하지 않는다

`decide.js:30-35`가 이미 두 값을 구분해 둔다 — `divergent`는 "보았고 결함을 찾았다", `unavailable`은 "인증할 수 없었다". PRD UI6이 요구하는 것은 **패널이 발화해 이견을 냈을 때** 막지 말라는 것이지, 패널이 뜨지 못했을 때 통과시키라는 것이 아니다. 후자는 단일 통과가 아니라 **무통과**다.

따라서 완화는 `quorum.passed !== true` 반환 **한 곳**에만 적용한다. 완화하지 않는 것:

| 경로 | 이유 |
|---|---|
| L1 `divergent`/`inconclusive` | UI7 — 불가침 |
| L2 아티팩트 부재·판독 불가 | 리뷰가 없었다 |
| L2 `responded === 0` | 아무도 답하지 않았다 |
| L2 budget skip | 패널이 뜨지 않았다 |
| DD13 plan hash 불일치 | 무결성 사실이지 리뷰 의견이 아니다 |
| hybrid인데 L3 미발화(또는 L3 비수렴) | "요청했다"는 "일어났다"가 아니다. **이 행은 코드 순서로 보장되지 않는다** — `decide.js:206`의 quorum 실패 분기가 `:223-224`의 hybrid 가드보다 앞서므로, 완화를 그 분기에 넣으면 가드에 도달하지 못한다. 그래서 Task 2가 완화 자격 자체에 `mode !== 'hybrid' || l3Corroborated(o)` 전제를 싣는다(Codex R1 F0 흡수) |

### DD3 — 두 개의 receipt 필드, 서로 다른 축

v1.23.5가 값을 치르고 배운 구분(§3.12)을 그대로 따른다.

| 필드 | 축 | 출처 | 의미 |
|---|---|---|---|
| `meta.review_single_pass_reason` | env 정책의 **정직한 주석** | `write.js`가 env에서 자동 stamp, 명시 플래그가 우선 | 이 게이트 호출 시점에 토글이 켜져 있었다 |
| `meta.review_single_pass_bypassed_verdict` | **감사 축** | 명시 플래그 전용 | 토글이 실제로 blocking verdict를 강등시켰다 |

불변식(schema 강제): `bypassed_verdict === true` ⟹ `reason` 존재 ∧ `resolution.review_verdict` 존재 ∧ 그 값이 `'converged'`가 아님. §3.13.1의 "적용되지 않은 override의 사유를 남기면 일어나지 않은 일을 정당화한 기록이 된다"와 같은 규칙이다.

**위조면이 없다**: `bypassed_verdict`를 거짓으로 찍어도 얻는 것이 없다 — 그 필드는 "비수렴 리뷰를 통과시켰다"는 **자기 불리한 주장**이라 어떤 승인도 사지 못한다. `intent` 결정과 달리 CLI 표면을 막을 필요가 없는 이유가 이것이다(§3.13 대비).

### DD4 — `MCCP_GATE_ROUND_CAP`은 오늘 production 오라클이 없다

`round-budget.test.js:17`의 `parseCap`은 **test 파일 안에만** 존재하고, 세 명령 본문은 산문으로 캡을 지킨다. 파일 헤더가 그 상태를 자백하며 "future helper extraction has a behavioural specification to match"라고 적어 두었다.

본 마일스톤이 그 helper를 만든다. `effectiveRoundCap(env)`는 토글이 켜졌으면 `MCCP_GATE_ROUND_CAP` 값과 **무관하게** 1을 반환한다 — PRD Open Question 2("토글과 캡이 동시 설정됐을 때 우선순위")의 답이며, 근거는 토글이 상위 정책 선언이고 캡은 그 아래 조정값이라는 것이다.

**강제 등급의 정직한 천장**: plan·prp-implement의 라운드 루프는 여전히 LLM이 읽는 산문이다. 본 마일스톤이 기계화하는 것은 (a) 캡 계산 자체와 그 test, (b) `plugins/mccp/commands/pr.md:511`이 codex-runner 자식 프로세스에 **고정된 값을 export**하는 것, (c) receipt가 토글 상태를 봉인해 사후 대조가 가능해지는 것, (d) 세 명령 본문이 **각자 리터럴을 쓰지 않고 그 오라클을 참조하는지**를 정적 test가 단언하는 것 넷이다. "세 게이트에서 라운드가 기계적으로 1회로 강제된다"는 주장은 하지 않는다 — (d)가 막는 것은 배선 누락이지 LLM이 산문을 어기는 경우가 아니다. 잔여 축은 계측으로 남긴다: 라이브 완주가 관측된 라운드 수를 Acceptance에 기록한다.

### DD5 — santa-loop은 `begin-round`에서 거부한다 (PRD Open Question 5의 답)

**PRD의 전제 하나를 정정한다**: santa-loop은 plan·implement·pr 게이트가 발화시키지 않는다. `/mccp:santa-loop`은 사람이 직접 부르는 독립 명령이고, 세 명령 본문에서 "santa-loop"이 나오는 위치는 전부 **과거 리뷰 라운드를 인용한 코드 주석**이다(`plugins/mccp/commands/plan.md:1329`, `plugins/mccp/commands/pr.md:137` 등). 따라서 "발화하지 않는다"의 구현 지점은 게이트 본문의 조건 분기가 아니라 santa CLI 자신이다.

`begin-round`가 `ledger.beginRound` **이전에** 토글을 검사하고 거부한다 — `MCCP_SANTA_ADJUDICATION_GATE` 선검사와 같은 위치이므로 **캡이 소모되지 않는다**. 신규 exit code는 만들지 않는다(12는 캡 전용이라 `counter.js:19`가 명시). exit 2 + 사유 `SANTA_SINGLE_PASS_ACTIVE`로 구분한다.

**`mccp-santa-review` receipt는 쓰지 않는다.** 그 게이트는 produces-only라 소비자가 없고, "미발화 사유" receipt를 쓰려면 라운드 집계가 없는 receipt를 스키마가 받아들여야 하는데 그것은 backlog에 이미 올라 있는 **반대 방향 과제**(santa 4종 필수화, PR-Codex F2)와 정면 충돌한다. 감사 앵커는 loud 거부 메시지와 원장의 부재다.

### DD7 — "단일 통과"는 세 게이트에서 서로 다른 것을 뜻한다

세 게이트는 **같은 종류의 승인 오라클을 갖고 있지 않다**. 이것을 명시하지 않으면 "세 게이트에 균일하게 적용한다"가 검증 불가능한 주장이 된다.

| 게이트 | 리뷰 표면 | 승인 오라클 | 토글이 바꾸는 것 |
|---|---|---|---|
| `/mccp:plan` | L1 mechanical + L2 4인 패널 (+ hybrid L3) | `plan-review/decide.js#decideReview` | 비수렴 L2가 **차단하지 않는다**. L1은 무영향 |
| `/mccp:prp-implement` | Implement-Codex 1축 | **없음** — 라운드 산문이 전부이고 캡 초과는 이미 `DIVERGENT_UNRESOLVED` 주석 후 진행 | 라운드 캡 고정 + receipt 봉인 |
| `/mccp:pr` | PR-Codex 1축 + terminal ship gate | `pr-ship-gate.js#deriveShipDecision` | 라운드 캡 고정 + receipt 봉인. **ship 판정은 무변경**(UI10) |

즉 verdict 승인 로직을 고치는 곳은 `/mccp:plan` **한 곳뿐**이고, 나머지 둘에는 고칠 승인 오라클이 애초에 없다 — `/mccp:pr`의 `pr-ship-gate.js`는 존재하지만 UI10이 명시적으로 손대지 말라고 한 표면이다. 이것이 결함이 아니라 **범위의 정의**임을 여기 적어 둔다: L2 패널의 반복이 실측 8~12시간의 지배항이었고(PRD Evidence — 단일 plan 10라운드), Codex 게이트는 이미 캡 1이 default라 반복이 거의 없다. 나머지 둘에서 얻는 것은 "캡이 2·3으로 올려져 있어도 이번 작업만은 1"과 사후 감사 가능성이다.

### DD8 — 체인 중간의 토글 변경: 관측하되 차단하지 않는다

토글은 env라 게이트 사이에 켜고 끌 수 있다. 각 receipt가 **자기 시점의** 토글 상태를 봉인하므로 불일치는 사후에 반드시 드러나지만, 그것만으로는 "그때 알려주지 않는다"는 지적이 남는다.

값싼 절반을 취한다: 게이트가 토글 **off**로 도는데 직전 chain receipt가 `meta.review_single_pass_reason`을 갖고 있으면 loud stderr 1줄을 낸다(차단하지 않는다). 반대로 토글 on인데 선행 receipt에 없으면 같은 방식으로 알린다.

**전 chain 값 일치를 fail-closed로 강제하지는 않는다.** 그것은 토글을 켜기 전에 chain 전체를 미리 계획하게 만들어, 이 토글이 없애려는 마찰을 다른 모양으로 되살린다(UI12의 "작업 단위 opt-in"과 어긋난다). 강제안은 backlog로 남기고 근거를 함께 적는다.

### DD6 — fan-out 지적 중 기각한 것과 그 증거

Phase 2.5 fan-out이 CRITICAL 2건·HIGH 7건을 냈다. §3.14에 따라 HIGH 이상만 이 자리에서 처리하고, 기각에는 증거를 붙인다. 흡수한 것은 Task 배치에 반영돼 있다.

| 지적 | 판정 | 증거 |
|---|---|---|
| CRITICAL(security) — "게이트가 `converged=true`로 receipt를 쓸 것이므로 새 verdict enum이 필요하다" | **기각** | 전제가 거짓이다. 본 plan은 실제 verdict를 봉인한다(DD1). 새 enum은 `review-verdict.js:46`의 공유 어휘를 깨뜨려 codex 축 소비자 전부에 파급된다 |
| CRITICAL(security) — "plan·implement 양쪽이 우회되면 dedupe가 skip을 승인해 dual-review가 사라진다" | **기각(+ negative test 추가)** | `write.js:492-501`이 `review_source='multi-agent'`와 `codex_verdict` 공존을 **throw**하고, `dedupe.js`는 `isCrossModelCorroborated`를 요구하는데 `multi-agent`는 `CROSS_MODEL_SOURCES` 밖이다(`review-verdict.js:42`). 구조적으로 도달 불가. 다만 불변식이 값진 만큼 Task 7이 negative test로 못 박는다 |
| HIGH(explorer) — "santa-loop이 plan.md·pr.md·prp-implement.md에서 호출된다" | **기각** | 오독이다. 세 파일의 매치는 전부 과거 리뷰 라운드를 가리키는 **주석 문자열**이다(`plugins/mccp/commands/plan.md:1329`, `plugins/mccp/commands/pr.md:137`, `plugins/mccp/commands/pr.md:946`). 호출 지점은 없다. DD5가 이 정정 위에 서 있다 |

<details>
<summary>+8 more adjudications</summary>

| 지적 | 판정 | 증거 |
|---|---|---|
| HIGH(security) — "사유 문자열에 `validateReason`(≥30자·≥3단어)을 적용해야 한다" | **기각** | UI2가 정확히 그 설계를 배제한다. 사유가 토글의 **값 자체**인 이유는 별도 사유 변수를 두면 잊히고 잊힌 사유는 감사 불가이기 때문이다. 열거 소속이 곧 검증이다 |
| HIGH(security) — "체인 preflight가 모든 선행 receipt의 토글 값 일치를 검증하고 불일치 시 fail-closed해야 한다" | **부분 흡수 → 나머지 backlog** | 각 receipt가 **자기 시점의** 토글 상태를 봉인하므로 중간 변경은 사후 관측 가능하다(흡수, DD8). 체인 전체 일치 강제는 토글을 그것이 대체하려는 마찰보다 더 번거롭게 만들어 UI12의 "작업 단위 opt-in"과 어긋난다(기각, backlog) |
| HIGH(architect) — 세 게이트 판정 오라클 분산 | **흡수** | Task 1이 단일 공유 오라클을 만들고 세 게이트가 그것만 읽는다 |
| HIGH(architect/security) — L1 불가침이 구조적으로 보장돼야 한다 | **흡수** | 완화 인자가 `decideReview`의 L1 분기 **뒤**에 들어간다(Task 2). 명령 본문 층에서 검사하지 않는다 |
| HIGH(test) — enum 검증 오라클·receipt 필드·교차 게이트 test 부재 | **흡수** | Task 1·5·6·7·8 |
| MEDIUM(architect) — "다음 세션이 원장의 round=1을 보고 R1을 허용한다" | **기각** | `MCCP_SANTA_ROUND_CAP`(원장 보유)과 `MCCP_GATE_ROUND_CAP`(Codex 라운드, 원장 없음)을 혼동했다. `docs/ENVIRONMENT.md:357`이 둘을 별개 축으로 명시한다 |
| MEDIUM(architect/explorer) — "비용 절감을 위해 L2를 아예 건너뛰어야 한다" | **기각** | UI6이 1회 발화를 명시한다. 기존 리뷰 가치를 완전히 잃지 않기 위한 의도적 선택이며, 없애는 것은 반복이지 리뷰가 아니다 |
| MEDIUM(architect) — "present-only 필드 추가에 schema v2 bump나 hash carve-out이 필요하다" | **기각** | `schema.js:167-171`이 선례를 말한다 — `makeSkeleton` 미등록 + 값이 있을 때만 재료화하면 legacy receipt는 byte 무변동이다. §3.12는 carve-out을 오히려 **금지**한다 |

</details>

MEDIUM·LOW 나머지와 기각한 HIGH 1건은 `.claude/plans/codex-findings-backlog.md`에 적재한다(Task 9).

### DD9 — L2 승인 패널 R0가 낸 것과 그 처리

L2 4인 패널(architect·security·test·invariant)이 R0에서 4/4 `fail`, blocking finding 11건을 냈다. CRITICAL 3·HIGH 4를 전부 이 자리에서 흡수했다. 기록은 `.claude/reviews/plan-review-review-loop-bypass.md`가 갖는다.

| 지적 | 처리 |
|---|---|
| **CRITICAL ×2 (security) + HIGH (architect)** — `mk()`가 `block: verdict !== 'converged'`를 하드코딩(`plugins/mccp/scripts/lib/plan-review/decide.js:86`)하므로 "`mk('divergent',…)`를 `block:false`로 반환"은 **불가능한 코드 경로**이고, Task 3이 CLI 분기 무변경을 선언한 이상 우회는 조용히 실패한다 | **흡수 — 이 마일스톤의 핵심 결함이었다.** Task 2를 재작성해 형제 생성자 `mkSinglePass`가 `block:false`를 리터럴로 내도록 명시하고, `mk`의 계산식은 손대지 않는다. Task 7의 `block === false` 단언이 이 급소를 상시 반증 대상으로 만든다 |
| **CRITICAL (invariant)** — prp-implement·pr의 Task 8이 캡 교체만 서술해 "세 게이트 범위"가 검증 불가 | **흡수** — DD7 신설. 세 게이트가 같은 종류의 승인 오라클을 갖고 있지 않다는 사실을 표로 명시하고, verdict 승인 로직을 고치는 곳이 `/mccp:plan` 한 곳뿐인 것이 결함이 아니라 UI9·UI10이 정한 **범위의 정의**임을 기록했다 |
| **HIGH (test)** — UI5 "R0만 돌고 R1 이상은 없다"가 plan·prp-implement에서 test로 존재하지 않는다 | **흡수** — 정적 command-body test 신설(Task 7 네 번째 파일)로 배선 누락을 잡고, DD4에 (d)를 더해 그 test가 막는 것과 못 막는 것을 구분했다. Acceptance가 라이브 라운드 수를 기록한다 |

<details>
<summary>+2 more L2 adjudications</summary>

| 지적 | 처리 |
|---|---|
| **HIGH (invariant)** — 체인 중간 토글 변경이 무방비이고 사후 감사뿐이다 | **부분 흡수** — DD8 신설. 선행 receipt와 현재 토글 상태가 어긋나면 loud stderr로 **그때** 알린다(차단하지 않는다). 전 chain fail-closed 일치 강제는 UI12와 어긋나므로 backlog 유지 |
| **HIGH (invariant)** — "하류 validator가 `review_verdict`를 소비하지 않는다"는 grep 시점의 취약한 전제 | **흡수** — Task 7의 `review-single-pass-fields.test.js`에 chain 회귀 pin을 추가했다. 누군가 validate-cmd에 차단을 넣으면 M1이 무력화되기 전에 test가 붉어진다 |

</details>

MEDIUM 5건(architect 2·test 1·invariant 3)은 §3.14대로 backlog로 보낸다(Task 9).

**R1 — 같은 패널 재실행 (security 통과, 나머지 3인 fail)**

R1의 CRITICAL 2·HIGH 4는 **하나의 원인**으로 수렴한다: Task 2가 *무엇을* 만들지는 말했지만 *어떤 모양인지*를 말하지 않았다. 선례 없는 신규 코드에 산문만 둔 결과 `mkSinglePass`의 시그니처·`review_source`·`forwardCodexVerdict`가 전부 미정이었고, 그중 마지막 하나는 `write.js:492-501`의 "contradictory receipt" throw와 직결된다.

| 지적 | 처리 |
|---|---|
| **CRITICAL ×2 + HIGH ×3 (architect), HIGH (test)** — `mkSinglePass`의 시그니처·반환·호출 조건 미정. 특히 `forwardCodexVerdict`가 참이면 `write.js:492-501`이 `review_source='multi-agent'` + `codex_verdict` 공존으로 throw해 receipt 자체가 안 써진다 | **흡수** — Task 2에 **실제 코드 스케치**를 삽입했다. `forwardCodexVerdict: false` 고정이 그 throw에 도달하지 않는 근거이고, `if (sp)` 하나가 유일한 호출 조건이며, `perspectives`/`dispatchEvidence` hoist까지 명시했다. 아울러 audit proof가 **UI8의 전제**임을 적었다 — proof가 null이면 review triple이 부분 stamp가 되어 `write.js:458-469`이 receipt 작성을 거부한다 |
| **HIGH (test)** — chain 회귀 pin의 fixture 구성이 미정. 손조립 receipt면 schema·hash·tamper 검사를 우회해 "test 통과, production 차단"이 된다 | **흡수** — fixture를 실제 write 경로로 만들고 proof를 `buildAuditProof`와 같은 모양으로 쓰도록 못 박았다(`pr-ship-gate.test.js` 선례) |
| **HIGH (invariant)** — Acceptance (d)가 "라운드 수를 기록한다"라 임계가 없어 **어떤 값에도 통과**한다(fail-open) | **흡수** — "정확히 1"로 바꾸고 미달 시 complete 불가임을 명시했다. 관측을 Acceptance 면제 근거로 쓴 것이 잘못이었다 |
| **HIGH (architect)** — 회귀 test는 사후 반응이지 구조적 방벽이 아니다. validate-cmd가 `review_verdict`를 소비하도록 바뀌는 것을 구조적으로 막아야 한다 | **기각(backlog)** — 한 모듈 안에서 *다른* 모듈의 미래 편집을 구조적으로 금지할 수단은 없다. 이 저장소가 같은 문제에 쓰는 기제가 정확히 pinning test다(`validate-callsite-lint.test.js`·`plan-review-command-body.test.js`). "reactive"라는 지적은 맞지만 대안이 제시되지 않았고, 제시 가능한 대안도 같은 부류다 |

R1 MEDIUM 12건·LOW 1건은 backlog로 보낸다(Task 9).

**R2 — architect·test·invariant 통과, security만 fail**

R2의 blocking finding은 **1건뿐이고 그것은 리뷰어가 쓴 것이 아니다** — `quorum.js:175-181`이 bare `verdict='fail'`에서 합성한 `severity:'FAIL'`이다. security의 자기 최고 severity는 MEDIUM이고, CLAUDE.md §3.14가 이 누수를 임시 규칙으로 명시해 두었다.

그럼에도 **MEDIUM 3건을 흡수했다** — 셋이 서로 다른 두 렌즈에서 **같은 모순**을 지목했고 수정이 한 줄이며, 방치하면 잘못된 receipt를 만들기 때문이다.

| 지적 | 처리 |
|---|---|
| **MEDIUM ×3 (architect 1 · security 2)** — Task 2 산문은 `mk`에도 `single_pass_reason: null`을 더한다고 했는데 같은 Task의 코드 스케치는 `mk`를 무변경으로 둔다. 게다가 Task 8은 "`single_pass_reason`이 있으면 forward"라 **모든** 결정이 그 필드를 가지면 우회하지 않은 receipt에도 `bypassed_verdict=true`가 찍혀 Task 6 불변식이 깨진다 | **흡수** — `mk`를 무변경으로 확정하고 `single_pass_reason`을 `mkSinglePass` 전용 present-only 필드로 못 박았다. Task 8의 셸 조건도 키 존재가 아니라 **값의 비공허성**(`[ -n … ]`)으로 명시했다. 모든 객체에 있는 필드는 존재만으로 아무것도 신호하지 못한다 |

이 라운드에서 `mk`가 실제로 무변경이 됐다는 점은 부수적으로 R1 흡수의 정확성도 높인다 — 기존 9개 호출부가 문자 그대로 무영향이다.

**R3 — security·invariant 통과**

| 지적 | 처리 |
|---|---|
| **HIGH (test)** — Acceptance (d)가 "L2 라운드 정확히 1"을 blocking 기준으로 삼는데 Validation에 **plan 게이트를 실제로 태우는 명령이 없어** 자동 반증이 불가능하다 | **흡수** — Validation에 `MCCP_REVIEW_SINGLE_PASS=…` + `/mccp:plan` 실주행과 (a)(c)(d) 각각의 확인 명령을 넣었다. 기준을 세워 놓고 재는 방법을 안 적은 것은 R1에서 고친 fail-open과 같은 부류의 결함이다 |
| **MEDIUM (architect)** — `perspectives`/`dispatchEvidence` hoist의 목적지가 미정이라 L1 경계를 넘길 여지가 있다 | **흡수** — 목적지를 `if (quorum.passed !== true)` 바로 위 한 곳으로 고정하고, L1(:150-167)·DD13 bind(:191-204)가 그보다 앞선다는 사실을 스케치 주석에 적었다 |
| **MEDIUM (architect)** — `effectiveRoundCap`이 객체를 반환하는데 셸에서 무엇을 export할지 미정 | **흡수** — Task 8에 정확한 셸 블록을 넣었다. export 대상은 `.cap` 하나이고 `.pinned`/`.reason`은 stderr 진단으로 분리했다 |
| **MEDIUM (test)** — `review-single-pass-command-body.test.js`가 Validation 목록에서 누락 | **흡수** — Validation에 명시 추가 |
| **MEDIUM ×2 · LOW ×2 (test·architect)** — "test 파일이 아직 없어 단언 내용을 확인할 수 없다" · "write 경로 fixture를 test에서 어떻게 격리하는지 미서술" | **기각(backlog)** — 전자는 plan에 구조적으로 성립하지 않는 요구다(리뷰어 프롬프트가 명시적으로 배제했는데도 재발했다 — CLAUDE.md가 기록한 `mccp:review-test` 프롬프트 결함의 4번째 재현). 후자는 `node --test`가 tmpdir fixture를 쓰는 이 저장소의 표준 관행이라 plan 수준에서 다시 서술할 것이 아니다 |

**R3의 blocking 3건 중 2건도 `quorum.js` 합성 `FAIL`이었다**(architect·test). architect의 자기 최고 severity는 MEDIUM이었고 리뷰어 프롬프트가 "MEDIUM만이면 pass" 계약을 명시했음에도 fail을 반환했다 — §3.14가 기술한 누수의 재현이며, 그 관찰 자체를 backlog에 남긴다.

**R4 — architect·security·invariant 통과 (3/4)**

| 지적 | 처리 |
|---|---|
| **HIGH (test)** — chain 회귀 pin이 `mccp:prp-implement` **하나만** 고정한다. plan receipt를 읽는 선행-게이트 소비자는 `mccp:pr` 경로에도 있으므로, 그쪽이 나중에 `review_verdict`를 보게 바뀌면 pin이 침묵한다 | **흡수** — pin과 Validation 양쪽에 `validate --command mccp:pr` 축을 추가했다. 소비자가 둘인데 하나만 고정하는 것은 R1에서 이 pin을 만든 이유(전제를 불변식으로 승격) 자체를 절반만 달성한 것이다 |
| **MEDIUM ×2 (test)** — 같은 지적의 재진술 + "Acceptance가 세 게이트를 end-to-end로 완주하지 않는다" | **부분 흡수 → 나머지 backlog** — 위 pin 확장으로 전자는 닫혔다. 후자(`/mccp:prp-implement`·`/mccp:pr` 실완주)는 **M1 구현 자체를 배송해야 성립**하므로 plan 단계 Acceptance가 아니라 구현 후 검증 항목이다 |

**R5 — 세션 재개 후 재실행 (architect·test·invariant fail, security 무응답)**

R5의 blocking 9건은 **두 개의 실제 결함과 한 개의 오독**으로 갈린다. security 리뷰어는
StructuredOutput을 호출하지 않고 종료해 응답이 `null`이다(coverage 3/4) — 에이전트 실패이지
판정이 아니므로 quorum은 응답한 3인으로 셌다.

| 지적 | 처리 |
|---|---|
| **CRITICAL (invariant) + HIGH (invariant) + HIGH (test)** — Acceptance (d)가 "정확히 1"을 blocking 기준으로 선언하는데 Validation의 `grep -c '^## Round'`는 개수와 무관하게 exit 0이라 강제가 없다 | **흡수 — 그리고 지적보다 한 겹 더 나빴다.** `record.js`는 `## Round` 헤딩을 **아예 emit하지 않으므로**(실측 `grep -c` = 0, `record.js`에 문자열 `Round` 0건) 그 명령은 강제되지 않았을 뿐 아니라 **애초에 아무것도 측정하지 않고 있었다**. R1이 "관측만 하고 임계가 없다"를 고쳤는데, 그때 넣은 관측 자체가 존재하지 않는 헤딩을 세고 있었다. `assert-single-round` 서브커맨드로 교체해 `halt_stage`가 null이 아니면 exit 1로 만들었다 |
| **HIGH (architect)** — Task 1이 `parseRoundCap`의 불량 입력(미설정·비정수·범위 밖) 계약을 적지 않았다. `parseSinglePass`에만 적혀 있다 | **흡수** — 두 파서의 계약을 모두 적고, **불량값 처리 방향이 서로 반대인 것이 의도**임을 명시했다: `parseSinglePass` 불량값은 비활성(fail-closed), `parseRoundCap` 불량값은 기본 캡(fail-open). 같은 규칙("오타는 권한을 늘리지 못한다")의 두 얼굴이며 방향을 뒤집으면 각각 조용한 우회와 무한 라운드가 된다. `effectiveRoundCap`의 off 분기도 함께 적었다(인접 MEDIUM) |
| **HIGH ×2 (test)** — "chain 회귀 pin이 automated test가 아니라 Validation의 수동 bash다" | **기각(근거 기록)** — 오독이다. Task 7의 `review-single-pass-fields.test.js`가 `validateCommand({command:'mccp:prp-implement'})`와 `validateCommand({command:'mccp:pr'})` 양쪽을 단언한다고 명시하고 있고, 리뷰어가 인용한 Validation 447-450줄은 **같은 축의 자동 test가 아니라 별개 축인 "라이브 경로 1회 완주"** 산출물이다(그 블록의 주석이 스스로 그렇게 라벨돼 있다). 자동 pin과 라이브 실측을 둘 다 두는 것이 이 plan의 설계이지 후자가 전자를 대체하는 것이 아니다 |

R5 MEDIUM 4건(architect 3·test 2 중 중복 제외)은 §3.14대로 backlog로 보낸다(Task 9). 그중
`effectiveRoundCap` off 분기 1건은 위 HIGH 수정과 한 줄 거리라 함께 흡수했다.

**R5가 남기는 관찰** — 이번 라운드가 찾은 CRITICAL은 R1이 fail-open을 고치며 **새로 넣은
줄** 안에 있었다. 라운드 반복은 결함을 줄이기만 하는 것이 아니라 자기 수정 과정에서 결함을
새로 만들기도 한다. 이것 역시 PRD가 라운드 반복을 비용으로 지목한 근거에 속한다.

**R6 — architect pass 전환 (security·invariant HIGH 각 1건, test는 자기 최고 MEDIUM)**

R6에서 architect가 findings 0으로 **pass**로 돌아섰고 test의 자기 최고 severity가 HIGH에서
MEDIUM으로 내려갔다. 남은 HIGH 2건은 **둘 다 코드로 반증됐고**, 각각 값싼 절반만 흡수했다.

| 지적 | 처리 |
|---|---|
| **HIGH (invariant)** — schema가 `review_verdict`가 비수렴일 때 `resolution.converged=false`를 강제하지 않아 `converged:true` + `divergent` 공존 receipt가 가능하다 | **사실관계 반증 + 절반 흡수** — 그 공존은 M1이 만드는 위험이 아니라 §3.12가 문서화한 **저장소 전역의 기존 성질**이고(`resolution.converged`는 "writer가 findings를 확정했다"는 B#11 분할이지 승인 신호가 아니다), 소비자에 도달하는 값은 원시 필드가 아니라 투영이다 — `derive/sources/receipts.js:45`가 `converged: isConvergedVerdict(resolution)`로 투영하고 `receipt-convergence.js:45`가 review 축에서 `verdict==='converged'`만 참으로 만든다. 즉 비수렴 봉인은 이미 모든 소비자에게 `converged:false`로 보인다. schema가 원시 필드를 뒤집게 하면 그 필드의 의미를 저장소 전역에서 바꿔 기존 corpus를 소급 무효화한다. **흡수한 절반**: 그 투영이 오늘 참이라는 것을 Task 7의 **투영 pin**으로 불변식화했다(chain 회귀 pin과 같은 이유 — grep 시점의 관찰을 test로 승격) |
| **HIGH (security)** — 운영자 귀속 공백: 토글을 켜고 게이트를 돌린 뒤 끄면, receipt를 읽는 다른 운영자가 누가·언제 우회를 승인했는지 알 수 없다. STATE.md 주석이나 session-ledger 항목을 의무화하라 | **기각(근거 기록)** — 세 겹으로 전제가 어긋난다. (i) PRD Users가 대상을 **단독 운영자**로 명시한다("Primary: mccp 저장소의 단독 운영자") — "다른 운영자"는 이 제품의 사용자가 아니다. (ii) "언제"는 이미 receipt의 `created_at`에 있고, ship receipt는 §3.12대로 git-tracked이라 "누구"는 커밋 author가 답한다. (iii) PRD Success Metric 4가 정의하는 감사 요구는 **건수 대조**("skip 사유로 역검색했을 때 실제 사용 건수와 일치")이지 신원 귀속이 아니다. 덧붙여 이 지적이 인용한 근거는 본문 `## Multi-Perspective Fan-out` 안의 **옛 fan-out 노트**이고 그 노트는 폐기된 env 이름(`MCCP_REVIEW_LOOP_BYPASS`)을 쓴다 — 현 설계 이전 텍스트다. **흡수한 절반**: 그 노트가 DD에서 판정되지 않은 채 본문에 남아 있었다는 절차적 지적은 타당하므로, 이 행 자체가 그 판정이다 |

R6 MEDIUM 5건·LOW 2건은 §3.14대로 backlog로 보낸다(Task 9). 그중 security MEDIUM
"`reason` 필드는 우회가 실제로 적용됐을 때만 존재해야 한다"는 **DD3이 이미 반대로 설계한 축**이다
— `reason`은 env 정책의 정직한 주석(ambient stamp)이고 `bypassed_verdict`가 적용 여부의 감사
축이며, 그 분리는 §3.12의 `codex_disabled` vs `codex_disabled_at_pr` 선례를 그대로 따른다.

**§3.14 기준으로 R6는 수렴이다** — 미흡수 HIGH/CRITICAL이 없다(architect pass · test 자기 최고
MEDIUM · security·invariant HIGH는 증거로 기각 + 절반 흡수). 그러나 `quorum.js`의 기계 판정은
blocking finding 수만 세므로 `decide`는 여전히 `divergent`를 낸다. 이 불일치 자체가 §3.14가
임시 규칙으로 존재하는 이유이자, 본 PRD가 닫으려는 비용의 형태다.

**R7 — architect·security 양쪽 pass (findings 0), blocking은 invariant 1인분**

R7은 지금까지 중 가장 강한 라운드다. architect와 security가 **findings 0으로 pass**했고
(security는 R2 이후 처음, architect는 R6에 이어 두 번째), test의 자기 최고 severity는
MEDIUM 3건이다. 기계 판정이 센 blocking 5건 중 **1건은 `quorum.js:175-181`의 합성
`severity:'FAIL'`**(test)이고 나머지 4건이 invariant 1인분이다. 그 4건은 전부 기각됐고,
셋은 **plan 본문에 이미 있는 문장을 못 본 오독**이다.

| 지적 | 처리 |
|---|---|
| **CRITICAL (invariant)** — Task 2 스케치가 `perspectives`/`dispatchEvidence`의 hoist 목적지를 명시하지 않아 audit proof 완결성이 모호하다 | **기각(근거 기록)** — 지목된 스케치(369-388) **바로 위** 360-368이 목적지를 굵게 고정한다: "hoist 목적지는 `if (quorum.passed !== true)` 바로 위 한 곳이다(현 :205 근방)". 그 문단은 R3의 같은 축 MEDIUM을 흡수하며 들어온 것이다. 즉 **이미 두 번 답한 질문**이고, 이번엔 답이 있는 채로 다시 나왔다 |
| **HIGH (invariant)** — `single_pass_reason`이 decision.json → write.js로 흐르는 경로가 plan에 없다 | **기각(근거 기록)** — 리뷰어가 **어느 파일을 리뷰 중인지 착각했다.** 인용 근거가 "lines 2206-2239 of plan.md"인데 그것은 리뷰 대상 plan 아티팩트가 아니라 커맨드 본문 `plugins/mccp/commands/plan.md`이고, 그 파일에 플래그가 없는 것은 **정확히 Task 8이 바꾸려는 대상**이다. 실제 경로는 Task 3(emit) → Task 8(5.6b forward) → Task 5(stamp)로 완결돼 있다 |
| **HIGH (invariant)** — Acceptance (d)의 `assert-single-round`가 실제로 발화하지 않을 수 있다 | **기각(근거 기록)** — 기제를 거꾸로 읽었다. 우회 실행에서 `block:false`면 5.2e가 HALT하지 않고 5.2h가 `--halt-stage` **없이** record를 부르므로 `halt_stage`가 null이 되고, **null이 곧 통과 조건**이다. 범위 한정("게이트가 스스로 재발화를 요구했는가"만 닫는다)은 Validation 블록에 이미 적혀 있다 |

R7 MEDIUM 5건(invariant 2·test 3)은 §3.14대로 backlog로 보낸다(Task 9).

**§3.14 기준으로 R7은 수렴이다** — 미흡수 HIGH/CRITICAL이 0건이다(architect·security pass ·
test 자기 최고 MEDIUM · invariant CRITICAL 1·HIGH 2는 전부 본문 인용으로 기각). 그러나
`decide`는 여전히 `divergent`를 냈다(quorum 2 pass < required 3). **두 판정이 갈리는 것은
이번이 두 번째이고, 이번에는 갈린 이유가 전부 오독이다.**

**R8 — 라운드를 더 돌수록 나빠진다는 것이 여기서 측정됐다**

R8은 R7보다 **나빠졌다**: security만 pass(2라운드 연속 findings 0), architect가 pass에서
fail로 돌아섰고(CRITICAL 1·HIGH 1), test는 R7의 MEDIUM 3건이 **HIGH 4건으로 승격**됐으며,
invariant는 HIGH 3건을 냈다. blocking 12건.

**측정된 원인 — 게이트의 자기 기록이 다음 라운드의 입력이다.** R8 findings 13건 중 **6건이
`.claude/reviews/plan-review-review-loop-bypass.md`(직전 라운드의 findings 표)를 근거로
인용**한다. 그 파일은 5.2h/5.2e가 저자를 위해 쓰는 산출물이고 `.claude/reviews/`는
git-tracked이라 리뷰어의 read surface 안에 있다(`.claude/state/plan-review/`는 gitignore라
해당 없음). 리뷰어는 그것을 독립 증거로 취급해 *"The L2 review confirms: …"* 형태로 인용한다.

결과는 **기각이 기각으로 남지 않는다**는 것이다. DD9의 기각 판정은 산문이고, 기각된 지적의
원문은 findings 표에 그대로 남아 다음 라운드에 **권위가 더해진 채** 돌아온다. R7에서 MEDIUM
이던 test 지적 3건이 R8에서 자기 자신을 근거로 인용하며 HIGH가 된 것이 그 형태다. 즉 이
게이트는 라운드가 늘수록 수렴 확률이 **낮아지는** 구조를 갖는다 — DD9가 이미 적은 "흡수가
다음 라운드를 강제한다"에 더해, **기록 자체가 다음 라운드를 오염시킨다**.

**방법론 실패도 함께 기록한다.** R8은 R7의 like-for-like 재실행이 아니었다 — 저자가
`emit-workflow-args`의 기본 프롬프트에 (i) 라운드 이력 참조 지시 (ii) 리뷰 대상 파일과 Task 8이
*바꿀* 파일의 구분 (iii) fan-out 절이 폐기 env 이름을 쓴다는 경고 (iv) test 리뷰어용 배제 목록
4항 + "자기 최고 MEDIUM이면 pass" 계약을 덧붙였다. **효과는 없었거나 반대였다**: test 리뷰어는
배제하라고 명시한 4개 부류를 그대로 제출하면서 severity를 올렸고, architect는 Task 8에 **실재하는
bash 블록**(`ROUND_CAP_JSON=$(node -e …)`)을 "전송 기제가 없다"며 CRITICAL로 냈다. 프롬프트로
리뷰어 판정을 교정하려는 시도는 backlog의 기존 실측(`review-test` 프롬프트 4회 재발)과 같은
결론에 도달한다 — **호출자 프롬프트로는 닫히지 않는다.** 앞으로의 라운드는 canonical 프롬프트로
되돌린다.

| 지적 | 처리 |
|---|---|
| **HIGH (invariant)** — Acceptance (d)가 "L2 라운드 정확히 1회"를 주장하는데 실제 측정은 `halt_stage==null`이고, 그것은 block:false인 실행이 여러 번이어도 null이다 | **흡수** — 정당하다. Validation 블록은 이 한계를 이미 정확히 적고 있었는데 Acceptance 문언만 넓게 남아 있었다. 주장을 측정에 맞춰 "게이트가 재발화를 요구하지 않았을 것"으로 좁혔다 |
| **HIGH (invariant)** — Acceptance가 `/mccp:prp-implement`·`/mccp:pr`의 실동작을 재지 않으므로 두 게이트가 작동하지 않아도 통과한다 | **흡수** — Acceptance에 항목을 더해 정적 test가 닫는 것은 **배선 누락 부재**뿐이고 두 게이트의 실완주는 배송 후 검증임을 명시했다. 재지 않은 것을 통과시킨 것처럼 읽히지 않게 하는 것이 요점이다 |
| **CRITICAL (architect)** — 마크다운 커맨드 본문이 JS 오라클을 호출할 기제가 plan에 없다 | **기각(근거 기록)** — Task 8이 정확히 그 bash 블록을 담고 있다(`ROUND_CAP_JSON=$(node -e '…effectiveRoundCap…')` + `export MCCP_GATE_ROUND_CAP=…`). R7 CRITICAL과 같은 부류의 오독이다 |
| **HIGH (architect)** — `/mccp:prp-implement`·`/mccp:pr`용 CLI 진입점 신설 Task가 없다 | **기각(근거 기록)** — DD7이 그 둘에 **고칠 승인 오라클이 애초에 없다**고 표로 명시한다. 두 게이트에서 토글이 바꾸는 것은 캡 고정과 receipt 봉인뿐이라 별도 승인 CLI가 필요 없다 |
| **HIGH (invariant)** — DD1이 회귀 test pin에 의존하는 것은 구조적 방벽이 아니다 | **기각(중복)** — R1 architect가 낸 것과 **같은 지적**이고 이미 근거와 함께 backlog에 있다. 직전 라운드 기록을 근거로 재제출된 6건 중 하나다 |
| **HIGH (test) ×4 · MEDIUM 나머지** | **기각(부류)** — 전부 "test 파일이 아직 없어 fixture/grep 패턴/코드 스케치를 확인할 수 없다"이며, backlog가 `review-test` 프롬프트 결함으로 이미 5회 기록한 부류다. R7에서 MEDIUM이던 것이 자기 자신을 인용해 HIGH가 됐다 |

**R9 — 기록을 격리하자 리뷰어가 실제 결함을 찾았다 (통제된 실험)**

R9는 변수 하나만 바꾼 실험이었다: 직전 라운드 기록(`.claude/reviews/plan-review-<slug>.md`)을
gitignore된 경로로 **격리**하고 프롬프트는 canonical로 되돌렸다.

| 지표 | R8 | R9 |
|---|---|---|
| 직전 라운드 기록을 근거로 인용한 finding | **6/13 (46%)** | **2/10 (20%)** |
| 실측 확인된 실제 결함 | 0건 | **2건** |
| architect | fail (CRITICAL 1) | **pass** (0건) |

**가설이 지지됐다.** 오염이 절반 이하로 떨어졌고, 더 중요하게는 리뷰어가 **직접 검증 가능한
실제 버그 2건**을 찾았다 — 9라운드 만에 처음이다.

| 지적 | 처리 |
|---|---|
| **HIGH ×2 (test)** — Validation의 santa 블록이 `--decision review-loop-bypass-m1`을 쓰는데 실제 파생 slug는 `review-loop-bypass`이고(나머지 4개 명령은 후자를 씀), 게다가 거부가 성공하면 원장 파일이 생성되지 않으므로 곧이어 `require()`하면 ENOENT로 죽는다 | **흡수 — 둘 다 실측으로 확인했다.** `derive-decision`이 `review-loop-bypass`를 반환한다. 즉 그 명령은 **나머지 검증과 다른 decision을 겨냥**하고 있었고, 다른 decision을 거부시키는 것은 아무것도 증명하지 않는다. 순서도 고쳤다 — 토글 없이 기준선 1라운드를 연 뒤 토글을 켜 거부를 확인하고 길이 불변을 단언한다. 비교 대상이 있어야 "미증가"가 반증 가능해진다 |
| **HIGH ×2 + MEDIUM (security)** — decision.json이 5.2와 5.6b 사이에 무결성 보호가 없어 `single_pass_reason`이 유실되면 셸 조건이 조용히 거짓이 되고, write.js의 env fallback이 그 유실을 가린다 → `reason`은 있고 `bypassed_verdict`는 없는 receipt | **절반 흡수** — 위조 축은 DD3이 이미 답한다(`bypassed_verdict`는 *자기 불리한* 주장이라 어떤 승인도 사지 못한다). 그러나 **유실** 축은 새롭고 타당하다. Task 6의 불변식을 **양방향**으로 만들어 흡수했다: `reason` 존재 ∧ 비수렴 verdict ⟹ `bypassed_verdict === true`. 그 조합은 정상 경로에서 도달 불가능하므로(토글이 꺼져 있었다면 비수렴은 5.2e에서 차단돼 receipt가 없다) 새 제약이 아니라 **이미 불가능한 상태를 schema가 말하게 만드는 것**이고, 손상된 decision.json을 write 시점에 잡는다 |
| **CRITICAL (invariant)** — `resolution.review_verdict`가 `makeSkeleton`에 없어 receipt_hash가 흔들리고 completion-ledger 결속이 끊긴다 | **기각(근거 기록)** — 두 겹으로 전제가 어긋난다. (i) 그 필드는 M1이 도입하는 것이 아니라 **v1.23.1이 이미 쓰는 pre-existing 필드**다(`write.js:514`). (ii) ledger 결속이 끊기는 것(§3.12 no-rehash)은 **기존 receipt를 재봉인**할 때이지 서로 다른 실행이 서로 다른 hash를 갖는 것이 아니다 — 후자는 `<decision_id>__<receipt_hash[0:12]>` 키가 존재하는 이유 그 자체다. 덧붙여 present-only 필드를 carve-out하지 않는 것은 `schema.js:867`이 명시한 관례이고 §3.12는 carve-out을 오히려 **금지**한다 |
| **HIGH (invariant)** — L1 불가침이 코드 순서로만 보호되고 구조적 보장이 아니다 | **기각(근거 기록)** — Task 7이 "L1 divergent + 토글 on → 여전히 block"을 단언하므로, 누가 완화를 L1 앞으로 옮기면 **그 test가 붉어진다**. 결과 단언이 순서 위반을 잡는 형태이며, JS에서 그 이상의 "구조적 보장"은 존재하지 않는다. R1 architect의 "pin은 reactive하다"와 같은 부류이고 이미 backlog에 근거와 함께 있다 |
| **HIGH (invariant)** — DD8의 chain 토글 일치가 fail-closed가 아니다 | **기각(중복 3회차)** — DD6·DD8·DD9 R0이 이미 판정했다. 전 chain 일치 강제는 토글을 그것이 없애려는 마찰보다 번거롭게 만들어 UI12와 어긋난다 |

R9 MEDIUM 4건은 §3.14대로 backlog로 보낸다(Task 9).

**R9가 남기는 것** — 이 게이트에서 9라운드 만에 처음으로 **본문을 실제로 고친 라운드**이고,
그 계기는 리뷰어를 더 다그친 것(R8, 실패)이 아니라 **입력에서 이전 라운드의 잔향을 뺀 것**이었다.
PRD가 "라운드 반복이 비용"이라고 쓴 것에 한 줄을 더 붙일 수 있다: 반복 자체보다
**반복의 기록이 입력으로 되먹임되는 것**이 수렴을 막는다.

**R10 — 격리 프로토콜 2회차, 지표 셋이 모두 단조 개선**

R9와 **동일한 프로토콜**(기록 격리 + canonical 프롬프트)로 돌린 두 번째 라운드다.

| 지표 | R8 | R9 | R10 |
|---|---|---|---|
| 직전 라운드 기록 인용 | 6/13 (46%) | 2/10 (20%) | **1/10 (10%)** |
| `decide`가 센 blocking | 12 | 10 | **4** |
| findings 0으로 pass한 리뷰어 | 0 | 1 (architect) | **2 (architect·security)** |

architect와 security가 **각각 findings 0으로 pass**했다 — R7 이후 처음이고, R7과 달리 이번엔
남은 blocking이 HIGH 2건뿐이다(각 리뷰어 1건씩).

| 지적 | 처리 |
|---|---|
| **HIGH (invariant)** — `assert-single-round`가 파일 부재·JSON 파싱 실패·Measurement 블록 부재에서 어떻게 동작하는지 Task 1이 적지 않았다. fail-open이면 Acceptance (d)가 깨진 측정으로도 통과한다 | **흡수** — 정당하고, 이 plan이 **세 번째로 마주친 같은 부류**다(R1의 임계 없는 관측 · R5의 존재하지 않는 헤딩을 세던 grep). Task 1에 exit 0의 유일 조건을 명시하고 그 밖의 모든 입력을 열거해 exit 1로 못 박았다. 측정 도구의 fail-open은 "측정이 통과했다"와 "측정이 안 됐다"를 구분 불가로 만든다 |
| **HIGH (test)** — Task 7의 Validate 줄이 `node --test` 4개 파일만 담고 라이브 완주 명령을 빼서, CI는 UI5를 영원히 검증하지 못하고 사람이 수동 실행해야만 한다 | **기각(근거 기록)** — 관찰은 맞지만 그것이 **설계**다. 이 저장소의 plan 템플릿이 마지막 Acceptance 항목으로 라이브 완주를 의무화하는 이유가 정확히 "단위 test 통과 ≠ 경로 작동"이고, plan은 그것을 Acceptance의 human-gated 항목으로 이미 명시한다. 또한 DD4가 산문 강제의 천장을 이미 범위로 선언했다 — "라운드가 기계적으로 1회로 강제된다는 주장은 하지 않는다". CI가 자동으로 못 여는 축을 CI에 넣으라는 요구는 그 범위 선언을 되돌리라는 것이지 결함 지적이 아니다 |

R10 MEDIUM 8건은 §3.14대로 backlog로 보낸다(Task 9).

**§3.14 기준으로 R10은 수렴이다** — 미흡수 HIGH/CRITICAL 0건(architect·security findings 0 ·
invariant HIGH 흡수 · test HIGH 증거로 기각). 기계 판정은 여전히 `divergent`(2 pass < 3)지만,
blocking 4건 중 2건은 `quorum.js`의 합성 `FAIL`이라 실질 지적은 **HIGH 2건**이었고 그중 하나는
흡수됐다.

**R11 — 추세가 뒤집혔다. R10 뒤의 "단조 개선"은 틀린 판단이었다**

| 지표 | R8 | R9 | R10 | R11 |
|---|---|---|---|---|
| `decide`가 센 blocking | 12 | 10 | **4** | **13** |
| 무결점 pass | 0 | 1 | 2 | **1 (security)** |

R10을 보고 "세 지표가 단조 개선"이라 적고 그 근거로 R11을 돌렸는데, **R11이 그 추세를 반증했다.**
3개 표본의 추세를 근거로 다음 라운드를 예측한 것이 성급했다 — 이 게이트의 라운드 결과는
추세를 그리는 양이 아니라 리뷰어별 분산이 지배하는 양이다. R10은 최저점이었지 수렴 경로가 아니었다.

**test 리뷰어가 최악의 기존 실패 모드로 회귀했다**: CRITICAL 3건이 **전부** "test 파일이 아직
존재하지 않아 확인할 수 없다"(`Globbed: … does not exist`)이며, 이는 backlog가 `review-test`
프롬프트 결함으로 이미 5회 기록한 바로 그 부류다. plan을 리뷰하는 이상 구현 파일의 부재는
구조적 상수인데, 이번엔 그것을 CRITICAL로 냈다.

| 지적 | 처리 |
|---|---|
| **HIGH (architect) + CRITICAL ×2·HIGH (invariant)** — 넷이 **하나의 실재 결함**으로 수렴한다: Task 8이 `pr.md`에는 명시 bash 블록을 주면서 5.6b의 감사 플래그 forward는 산문으로만 두었고, `prp-implement.md`는 "동일 교체"라고만 적었으며, Task 7의 command-body test는 **캡 배선만** 단언하고 플래그 배선은 단언하지 않는다 | **흡수 — R11의 유일한 실수확이다.** 5.6b forward의 셸 블록을 형태로 고정하고(두 플래그가 **함께** 실리는 것이 요점 — 하나만 실리면 R9에서 흡수한 양방향 불변식이 write 시점에 거부한다), `prp-implement.md`는 export 지점이 없어 `$ROUND_CAP` 변수를 세우는 형태임을 명시했으며, command-body test가 두 플래그의 존재와 비공허 조건을 함께 단언하도록 넓혔다 |
| **CRITICAL ×3 (test)** — "test 파일 4개가 존재하지 않아 어떤 주장도 반증할 수 없다" | **기각(부류, 6회차)** — plan 리뷰에서 구현 파일의 부재는 결함이 아니라 전제다. backlog가 이 부류를 이미 5회 기록했고 R8에서 프롬프트로 명시 배제했을 때도 재발했다(그때는 HIGH, 이번엔 CRITICAL). 호출자 프롬프트가 아니라 agent 정의를 고쳐야 한다는 backlog의 처방이 다시 확인됐다 |
| **HIGH ×2 (test)** — 같은 부류의 재진술("`block === false`를 담을 test가 없다") | **기각(동일 부류)** — 그 단언은 Task 7이 `review-single-pass.test.js`의 **단일 급소**로 명시하고 있다. 아직 안 쓰였다는 것이 지적의 내용 전부다 |

R11 MEDIUM 잔여는 §3.14대로 backlog로 보낸다(Task 9).

**이 세션의 종료 상태** — 세션 에이전트 카운터가 24/24로 소진돼 더 돌릴 수 없다. R11은
`divergent`(blocking 13, 그중 실질은 위 흡수 1축 + 기각된 test 5건 + 합성 FAIL 3건)로 5.2e에서
HALT했고 `mccp-plan-codex` receipt는 **미작성**이다. 재개는 새 세션(카운터 세션 키 리셋) 또는
`MCCP_ORCHESTRATION_MAX_AGENTS` 상향이며, 격리 프로토콜(기록을 gitignore 경로로 옮기고 canonical
프롬프트 사용)은 유지할 가치가 있다 — R11의 역행에도 불구하고 R9·R10이 실제 버그 3건을 냈고
그것은 R0~R8 아홉 라운드가 내지 못한 결과다.

**이 게이트의 종료 상태 — 이것이 정직한 기록이다**

**R11까지 12라운드를 돌았고 기계 판정으로는 수렴하지 않았다.** 기록을 격리한 R9~R10에서 오염(46%→20%→10%)과 blocking(12→10→4)이 개선되고 실제 버그 3건이 나왔으나, R11에서 blocking이 13으로 역행했다 — 추세는 단조가 아니며 리뷰어별 분산이 지배한다. R4의 잔여 HIGH를 흡수한 뒤 세션 카운터가 24/24로 소진돼(`reserve`가 `granted:0`, 5.2b HALT — 설계대로) 그 흡수를 검증할 R5를 같은 세션에서 실행할 수 없었고, 새 세션에서 재개해 R5(3/4 fail, security 무응답)와 R6를 돌렸다. R6는 `decide`에 도달하기 전에 **다른 이유로** 멈췄다: R6 findings를 흡수하느라 plan 본문이 바뀌어 DD13 bind가 `reviewed sha256:551b854a…` ≠ `current sha256:5051242c…`를 잡았고, `decide`가 `unavailable`(halt 5.2e)을 냈다. 이것은 리뷰 의견이 아니라 무결성 사실이며(DD2 표의 다섯 번째 행), 처방된 복구는 **현 본문에 대해 L2를 재실행하는 것**이지 재봉인이 아니다. 따라서 `mccp-plan-codex` receipt는 이 시점에도 **미작성**이고 `/mccp:prp-implement`는 진입 불가다.

R7은 현 본문(`sha256:ac01d1b6…`)에 대해 실제로 돌았고 `divergent`로 5.2e에서 HALT했다(halt_stage 5.2e, wall-clock 469s). 즉 이 시점의 미결은 "본문이 아직 덜 됐다"가 아니라 **`quorum.js` 기계 판정과 §3.14 판정이 갈린다**는 것이다. 세션 카운터가 소진되면 재개 방법은 **새 세션에서 `/mccp:plan .claude/prds/review-loop-bypass.prd.md --plan .claude/plans/review-loop-bypass-m1.plan.md` 재실행**(카운터는 세션 키라 리셋된다) 또는 `MCCP_ORCHESTRATION_MAX_AGENTS` 상향이다.

**R6가 새로 보탠 관찰 — 흡수 자체가 다음 라운드를 강제한다.** DD13 bind는 "리뷰어가 읽은 본문"과 "봉인될 본문"이 같아야 한다는 정당한 불변식이다. 그런데 라운드의 산출물은 **본문 수정**이므로, findings를 흡수하는 행위가 그 라운드의 판정을 자동으로 무효화한다. 즉 흡수한 라운드는 결코 자신을 승인할 수 없고 최소 한 라운드가 더 필요하다 — 그리고 그 라운드가 다시 무언가를 흡수하면 같은 일이 반복된다. 수렴은 **아무것도 흡수하지 않은 라운드**에서만 성립한다. 이것은 결함이 아니라 구조지만, PRD가 "라운드 반복이 시간 비용의 지배항"이라고 쓴 것의 기계적 근거이기도 하다: 비용의 하한이 라운드 1회가 아니라 "무흡수 라운드에 도달할 때까지"다.

**그리고 이 게이트 자체가 본 PRD의 증거다.** 단일 plan이 L2 4인 패널을 12라운드(R0~R11) 돌려 에이전트 48개·벽시계 94분 이상을 썼다. 그중 실제로 설계를 바꾼 것은 R0의 CRITICAL 1건(`mk`의 하드코딩된 `block`) · R1의 명세 공백 · R5의 CRITICAL 1건(측정하지 않는 측정 명령) 셋이고, 나머지 라운드의 blocking 상당수는 `quorum.js:175-181`이 bare `verdict='fail'`에서 **합성한** `severity:'FAIL'`이었다(R2~R4 blocking 6건 중 4건, 그 라운드들의 리뷰어 자기 최고 severity는 MEDIUM). PRD가 "라운드 반복이 시간 비용의 지배항"이라고 쓴 것과 §3.14가 임시 규칙으로 기술한 누수가 같은 실행 안에서 반복 관측됐다.

부수적으로 관측된 것 셋 — (i) 라운드 기록이 누적되며 문서가 커져 **디자인 게이트의 H1 anchor를 깼다**(Phase 5.0 두 번째 발화가 잡음). (ii) R5의 CRITICAL은 **R1이 fail-open을 고치며 새로 넣은 줄** 안에 있었다. (iii) R6의 security HIGH는 본문의 `## Multi-Perspective Fan-out` 안에 남은 **폐기된 env 이름의 옛 노트**를 현 설계로 읽고 나왔다 — 라운드 기록과 조사 재료가 같은 문서에 누적되면 리뷰어의 입력 자체가 오염된다. 라운드 반복은 결함을 줄이기만 하는 것이 아니라 산출물의 구조를 밀어내고, 자기 수정 과정에서 결함을 새로 만들며, 자기 기록으로 다음 라운드를 오도한다.

## Tasks

### Task 1: 단일통과 오라클 신설

- **Action**: `plugins/mccp/scripts/lib/review-single-pass.js`를 만든다. export: `parseSinglePass(env)` → `{active, reason, rejected}` · `parseRoundCap(env)` → 1|2|3 · `effectiveRoundCap(env)` → `{cap, pinned, reason}` · 상수 `ENV_SINGLE_PASS`·`REASONS`(frozen 3종)·`ENV_ROUND_CAP`·`DEFAULT_ROUND_CAP`. 미설정/빈 값은 **조용히** 비활성(정상 상태이므로 warn 없음), 열거 밖 값은 비활성 + loud stderr warn + `rejected`에 원문 보존. 대소문자 구분(`gate.js:138` 규약) — 봉인되는 열거값이라 정규화하면 서로 다른 입력이 같은 필드를 채운다. `effectiveRoundCap`은 `active`일 때 `MCCP_GATE_ROUND_CAP`과 무관하게 `{cap:1, pinned:true, reason:<enum>}`, `active`가 거짓일 때 `{cap:parseRoundCap(env), pinned:false, reason:null}`이다 — **두 분기를 모두 적는다.** `parseRoundCap`의 불량 입력 계약도 여기서 확정한다: 미설정/빈 값은 조용히 `DEFAULT_ROUND_CAP`(=1), 정수 아님·범위 밖(1~3 외)은 loud stderr warn + `DEFAULT_ROUND_CAP`으로 fail-open이다(`counter.js:31-43`의 `parseCap` 동작을 그대로 미러). **두 파서의 불량값 처리 방향이 서로 다른 것은 의도적이다** — `parseSinglePass`의 불량값은 *비활성*(fail-closed: 오타가 게이트를 열지 못한다, UI3)이고 `parseRoundCap`의 불량값은 *기본 캡*(fail-open: 오타가 게이트를 무한히 열지 못한다). 둘 다 "오타는 권한을 늘리지 못한다"는 같은 규칙의 서로 다른 얼굴이며, 방향을 반대로 잡으면 각각 조용한 우회와 무한 라운드가 된다. 또한 `assert-single-round <리뷰 기록 경로>` CLI 서브커맨드를 갖는다. **두 가지를 함께 단언한다**: (i) 리뷰 기록 Measurement 블록의 `halt_stage`가 `null`이고, (ii) **dispatch 로그에 항목이 정확히 1건이며 그 `round_index`가 `0`**일 것. (ii)가 F1 흡수분이다(Codex R1 HIGH) — `halt_stage`는 **마지막** 실행 상태만 담고 리뷰 기록은 매 실행 덮어쓰기되므로, L2를 두 번 dispatch하고 둘 다 block:false면 그 값만으로는 구분되지 않는다. 즉 (i)만으로는 UI5의 "R0만 돌고 R1 이상은 없다"를 반증할 수 없고, 그것을 이유로 Acceptance 문언을 약한 명제로 좁힌 것(R10)은 제약을 검증 대상에서 뺀 것과 같았다. 로그는 `.claude/state/plan-review/dispatch-log-<slug>.jsonl`이고 **순수 append-only다 — 어떤 경로에서도 purge하지 않는다.** 5.2c의 발화 지점(이미 debt marker를 쓰는 곳)에서 한 줄이 append되며 각 항목은 그 dispatch가 읽은 `reviewed_plan_hash`를 담는다. `round_index`는 **같은 plan hash를 가진 기존 항목 수**로 계산하고, `assert-single-round`는 **현재 plan hash와 일치하는 항목이 정확히 1건이며 그 `round_index`가 `0`**일 것을 요구한다.

  **purge를 두면 이 축이 스스로 무력해진다**(Codex R2 HIGH, conf 0.98 흡수). 초안은 5.2 진입 purge를 택했는데, 이 plan 자신이 재발화를 *HALT 이후의 다음 게이트 실행*으로 서술하므로 R0이 HALT하고 R1이 돌면 진입 purge가 R0 항목을 지우고 `round_index:0` 한 건만 남긴다. 그 실행이 성공하면 `halt_stage`도 `null`이라 단언이 통과하고 **실제 2라운드가 단일 라운드로 오인된다** — 측정을 강화한다며 넣은 축이 측정을 무력화하는 형태이고, R1·R5·R10에서 세 번 고친 fail-open 부류의 네 번째다.

  plan hash로 keying하면 별도 nonce 수명 관리 없이 두 경우가 갈린다: **같은 본문에 대한 재발화**는 같은 hash 그룹에 누적돼 단언이 반드시 실패하고(UI5 위반이 기계적으로 반증된다), **흡수로 본문이 바뀐 뒤의 새 시도**는 새 hash 그룹에서 0부터 시작한다. 운영자가 명령을 몇 번 쳤는지는 여전히 어떤 아티팩트도 모르지만, *같은 본문이 두 번 심사받았는가*는 이제 안다 — 그리고 UI5가 금지하는 라운드 반복이 바로 그것이다. **exit 0은 오직 하나의 경우에만 낸다: 리뷰 기록을 읽었고, Measurement 블록을 찾았고, JSON 파싱에 성공했고, `halt_stage`가 명시적으로 `null`이며, dispatch 로그를 읽었고 그 항목이 정확히 1건이고 `round_index`가 `0`일 때.** 그 밖의 **모든** 입력 — 리뷰 기록 부재·읽기 실패·Measurement 블록 부재·JSON 파싱 실패·`halt_stage` 키 부재·**dispatch 로그 부재·현재 plan hash와 일치하는 항목이 0건·2건 이상·그 항목의 `round_index !== 0`** — 은 각각 구분되는 stderr 진단과 함께 **exit 1**이다(R10 invariant HIGH 흡수). 측정 도구가 불량 입력에 fail-open하면 Acceptance (d)는 '측정이 통과했다'와 '측정이 아예 안 됐다'를 구분하지 못해 공허해진다 — 이 plan이 R1과 R5에서 각각 한 번씩 고친 것이 정확히 그 부류이고(임계 없는 관측 · 존재하지 않는 헤딩을 세던 grep), 세 번째로 같은 실수를 반복하지 않기 위해 여기서 fail-closed를 **열거로** 못 박는다. 별도 파일을 만들지 않는 이유는 캡·토글·그 관측이 한 축이기 때문이다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/gate.js:138` (`parseSeverityGate`) · `plugins/mccp/scripts/lib/santa/counter.js:31` (`parseCap`)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js`

### Task 2: `decideReview`에 완화 인자 배선

- **Action**: `decide.js`의 `decideReview`가 `opts.singlePass`(`{active, reason}` 객체 또는 null)를 받는다.
  - **`mk()`의 `block` 계산은 손대지 않는다.** `decide.js:86`이 `block: verdict !== 'converged'`를 **하드코딩**하므로 `mk`를 그대로 불러서는 `divergent`에 `block:false`가 나올 수 없다. 대신 형제 생성자 `mkSinglePass(verdict, source, proof, reason, singlePassReason)`를 신설해 `block:false`를 **리터럴로** 반환한다(`santa/gate.js`의 "기존 함수 무변경 + 신규 export" 변경 프로토콜). **`mk`는 한 글자도 바뀌지 않는다** — `single_pass_reason`은 `mkSinglePass`만 싣는 present-only 필드다. 초안은 "모든 decision 객체가 같은 모양을 갖도록 `mk`에도 `single_pass_reason: null`을 더한다"였는데, 그러면 Task 8의 "`single_pass_reason`이 있으면 forward" 조건이 **모든** 결정에 참이 되어 우회하지 않은 receipt에도 `bypassed_verdict=true`가 찍히고 Task 6의 불변식이 즉시 깨진다. 모든 객체에 존재하는 필드는 존재만으로 아무것도 신호하지 못한다 — present-only여야 존재가 곧 신호다(§3.12 receipt 관례와 같은 이유).
  - 완화는 `quorum.passed !== true` 반환 **한 곳**에만 적용하고, L1 분기·L2 가용성 분기·DD13 bind 분기보다 **뒤**에 위치시켜 UI7이 코드 순서로 보장되게 한다. 그 지점에 도달했다는 것 자체가 "L1 통과 ∧ 읽을 수 있는 quorum ∧ `responded > 0` ∧ hash bind 일치"를 이미 의미한다 — budget skip과 아티팩트 부재는 `cli.js:435` 이전에서 `unavailable`로 조기 반환되므로 이 분기에 **도달하지 않는다**(DD2 표와 코드가 이미 일치하며, 완화 코드가 그 순서에 얹힌다).
  - 완화 시 `buildAuditProof`(신규 내부 함수)로 `layers:{l1:'converged', l2:'divergent', l3:null}` · `verification_verdict:'divergent'` · `quorum.passed:false`인 정직한 proof를 만든다. `buildProof`(승인용)는 손대지 않는다.
  - env를 읽지 않는다 — 파서만 env를 안다.
- **코드 스케치** (선례 없는 신규 코드이므로 산문 대신 형태를 고정한다 — santa-loop-materialize M2 Task 2와 같은 이유):

  ```js
  // 신규 형제 생성자. mk()와 다른 점은 정확히 두 가지다:
  //   block               — 계산이 아니라 리터럴 false
  //   forwardCodexVerdict — 항상 false
  // 후자가 load-bearing이다: source='multi-agent'인데 codex_verdict가 함께
  // 실리면 write.js:492-501이 "contradictory receipt"로 throw한다. 5.6b는
  // decision.json의 forwardCodexVerdict가 참일 때만 --codex-verdict를 붙이므로,
  // false를 고정하는 것이 그 throw에 도달하지 않는 유일한 근거다.
  function mkSinglePass(verdict, source, proof, reason, singlePassReason) {
    return {
      review_verdict: verdict,          // 'divergent' — 위장하지 않는다
      review_source: source,            // 'multi-agent'
      review_proof: proof,              // buildAuditProof 산출 (null 아님)
      block: false,                     // ← 이 한 줄이 마일스톤의 전부다
      reason: reason,
      forwardCodexVerdict: false,
      single_pass_reason: singlePassReason,
    };
  }

  // 감사용 proof. `opts.l3`는 hybrid 완화에서 'converged'이고 그 밖에는 null이다 —
  // 이 한 필드가 Task 6 hybrid 역불변식의 검증 대상이므로 버리면 안 된다(Codex R5).
  // schema.js:224-238이 비수렴 verdict에 요구하는 것은
  // dispatch_evidence의 경로 형태뿐이므로 quorum.passed:false로 정직하게 쓴다.
  // 이 proof가 없으면 review triple이 부분 stamp가 되어 write.js:458-469과
  // plan.md 5.6b의 HALT 가드가 receipt 작성을 막는다 — 즉 proof는 장식이 아니라
  // "receipt가 작성된다"(UI8)의 전제다.
  function buildAuditProof(opts) {
    return {
      layers: { l1: 'converged', l2: 'divergent', l3: opts.l3 || null },
      verification_verdict: 'divergent',
      quorum: {
        passed: false,
        required: opts.quorum.required, of: opts.quorum.of,
        roles: opts.quorum.roles, responded: opts.quorum.responded,
      },
      perspectives: opts.perspectives,
      dispatch_evidence: opts.dispatchEvidence,
      reviewed_plan_hash: opts.reviewedPlanHash,
    };
  }

  // decideReview 내부. perspectives/dispatchEvidence 계산(현 :217-221)을
  // 이 분기보다 위로 hoist한다 — 순수 계산이라 동작 무변동이고, 그러지 않으면
  // 완화 분기가 아직 없는 값을 참조한다.
  //
  // **hoist 목적지는 `if (quorum.passed !== true)` 바로 위 한 곳이다**(현 :205
  // 근방). L1 분기는 :150-167이라 hoist 후에도 여전히 앞서고, DD13 bind 검사
  // (:191-204)도 앞선다 — 즉 UI7은 hoist에 무관하게 성립한다. 더 위로(예: L1
  // 분기 앞으로) 올리면 L1이 거부한 입력에도 계산이 돌아 낭비이고, 그 자체가
  // 판정을 바꾸지는 않지만 "완화보다 앞선 것은 전부 불가침"이라는 읽기 규칙을
  // 흐린다. 그래서 목적지를 한 곳으로 고정한다.
  // hybrid에서 L3가 실제로 돌고 수렴했는지. `:223-224`의 hybrid 블록은
  // quorum.passed === true 경로에서만 실행되므로, quorum 실패 분기에 완화를 넣으면
  // 그 가드에 **영원히 도달하지 않는다**. Codex R1 F0(HIGH, conf 0.99)이 잡은 결함이며,
  // 방치하면 mode='hybrid' + L1 통과 + quorum 실패 + L3 미발화가 block:false로 통과해
  // DD2 표의 "hybrid인데 L3 미발화" 행을 이 코드가 위반한다.
  // 따라서 완화 자격에 그 전제를 **직접** 싣는다: hybrid가 아니거나, hybrid이면서
  // L3가 실제로 돌고 converged를 냈을 때만 완화한다(그 밖은 전부 기존 mk 경로).
  function l3Corroborated(o) {
    const l3 = isPlainObject(o.l3) ? o.l3 : null;
    return !!l3 && l3.invoked === true &&
      typeof l3.verdict === 'string' &&
      REVIEW_VERDICT_VALUES.indexOf(l3.verdict) !== -1 &&
      l3.verdict === 'converged';
  }

  if (quorum.passed !== true) {
    const spRaw = isPlainObject(o.singlePass) && o.singlePass.active === true
      ? o.singlePass : null;
    // mode==='hybrid'면 L3 수렴이 완화의 추가 전제다. "요청했다"는 "일어났다"가 아니라는
    // decide.js:238의 기존 규칙을 완화 경로에도 그대로 적용하는 것이다.
    const sp = (spRaw && (mode !== 'hybrid' || l3Corroborated(o))) ? spRaw : null;
    if (sp) {
      // hybrid 완화는 L3가 실제로 돌고 converged를 냈을 때만 도달한다(위 sp 조건).
      // 그 사실을 **봉인해야** 한다 — source를 multi-agent로 뭉개고 layers.l3를 null로
      // 두면 Task 6의 hybrid 역불변식과 Task 7의 forged-hybrid test가 production
      // 산출물에 영원히 도달하지 못하고, DD2의 L3 선행조건 충족 여부를 사후에 검증할
      // 수 없다(Codex R5 HIGH, conf 0.99). dedupe는 열리지 않는다:
      // isCrossModelCorroborated가 eff.verdict==='converged'를 먼저 요구하는데 이
      // receipt는 divergent다. forwardCodexVerdict도 false로 유지하므로
      // write.js:492-501의 throw에도 걸리지 않는다.
      const spSource = (mode === 'hybrid') ? 'hybrid' : 'multi-agent';
      const spL3 = (mode === 'hybrid') ? 'converged' : null;
      return mkSinglePass('divergent', spSource,
        buildAuditProof({
          quorum: quorum, perspectives: perspectives,
          dispatchEvidence: dispatchEvidence, reviewedPlanHash: reviewedHash,
          l3: spL3,
        }),
        'L2 quorum not satisfied: ' + (quorum.reason || 'unspecified') +
        ' — MCCP_REVIEW_SINGLE_PASS=' + sp.reason + ' 로 진행한다. ' +
        'verdict는 divergent 그대로 봉인된다.',
        sp.reason);
    }
    return mk('divergent', 'multi-agent', null,          // ← 기존 경로 무변동
      'L2 quorum not satisfied: ' + (quorum.reason || 'unspecified'), false);
  }
  ```

  **`mkSinglePass`를 부르는 조건은 위 `if (sp)` 하나뿐이다.** `mk`의 나머지 9개 호출부는 손대지 않으므로, 이 분기에 도달하지 못한 경로(L1 실패·L2 부재·hash 불일치)는 어떤 env 값에서도 `mk`를 지나 `block:true`가 된다.
- **Mirror**: `plugins/mccp/scripts/lib/plan-review/decide.js:150` (L1 우선 분기) · `plugins/mccp/scripts/lib/santa/gate.js:488` (완화가 한 항만 면제하고 강화 축을 덮지 않는 구조)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js`

### Task 3: `plan-review` CLI 주입

- **Action**: `cli.js` `cmdDecide`가 `parseSinglePass(process.env)`를 `decideReview`에 넘긴다. 종료 코드 분기는 **손대지 않는다** — 말미의 `return decision.block ? EX_BLOCK : EX_OK;`가 이미 `block:false`를 EX_OK로 옮긴다. 이 무변경이 성립하는 전제는 Task 2의 `mkSinglePass`가 `block:false`를 실제로 만든다는 것 하나뿐이며, 그 전제 자체를 Task 7의 단위 test가 단언한다. `out()`이 내는 decision.json에 `single_pass_reason`이 실린다(`Object.assign` 경유라 자동). 완화가 발동하면 `errln`으로 "패널이 이견을 냈으나 단일통과 토글(<reason>)로 진행한다 — verdict는 divergent 그대로 봉인된다"를 낸다. 조용한 통과를 만들지 않는 것이 요점이다.
- **Mirror**: `plugins/mccp/scripts/lib/plan-review/cli.js:376` (`cmdDecide` 구조)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js`

### Task 4: santa-loop 라운드 거부

- **Action**: `santa/cli.js`의 `begin-round` 처리에서 `ledger.beginRound` 호출 **이전에** `parseSinglePass(process.env).active`를 검사해 참이면 exit 2 + `{reason:'SANTA_SINGLE_PASS_ACTIVE', single_pass_reason:<enum>}`를 stdout JSON으로 내고 stderr에 해제 방법(`MCCP_REVIEW_SINGLE_PASS` 해제)을 적는다. 원장을 건드리지 않으므로 캡이 소모되지 않는다. `santa-loop.md`의 exit code 해석 표에 행을 더한다. receipt는 쓰지 않는다(DD5).
- **Mirror**: `plugins/mccp/scripts/lib/santa/cli.js:615` (신규 exit code 없이 사유로 구분) · `MCCP_SANTA_ADJUDICATION_GATE` 선검사 위치
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js`

### Task 5: receipt 두 필드 봉인

- **Action**: `write.js`에서 `makeSkeleton` **이후** present-only로 stamp한다. `review_single_pass_reason`은 명시 `--review-single-pass-reason`이 우선이고 없으면 `parseSinglePass(process.env).reason`을 쓴다(v1.23.5가 정한 writer 측 precedence — writer는 caller의 주장을 기록한다). `review_single_pass_bypassed_verdict`는 `args['review-single-pass-bypassed-verdict'] === true`일 때만 `true`로 재료화한다. 둘 다 값이 없으면 키 자체를 만들지 않는다. **DD8 배선**: 선행 chain receipt가 `review_single_pass_reason`을 갖는데 현재 호출은 토글 off이거나 그 반대이면 loud stderr 1줄을 낸다 — 차단하지 않는다.
- **Mirror**: `plugins/mccp/scripts/receipt/write.js:771` (`pr_codex_force_override` 조건부 재료화) · `plugins/mccp/scripts/receipt/write.js:612` (env ambient stamp)
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/review-single-pass-fields.test.js`

### Task 6: schema 검증 + 불변식

- **Action**: `schema.js`에 present-only 검증을 더한다 — `meta.review_single_pass_reason`은 존재 시 3종 열거 소속, `meta.review_single_pass_bypassed_verdict`는 존재 시 불리언 `true`. 불변식은 **양방향**이되, 역방향의 판별자는 ambient 상태가 아니라 **경로**다.

- **(정)** `bypassed_verdict === true` ⟹ `reason`이 존재하고 `resolution.review_verdict`가 존재하며 그 값이 `'converged'`가 아니어야 한다. 모든 receipt에 적용된다.
- **(역)** `gate_id === 'mccp-plan-codex'`일 때, source별로 갈린다.
  - `review_source === 'multi-agent'` ∧ `review_verdict` 비수렴 ⟹ `bypassed_verdict === true`. L3가 없는 축이라 비수렴 verdict가 receipt까지 도달한 것 자체가 완화의 증거다(토글이 없으면 5.2e가 HALT해 receipt가 쓰이지 않는다).
  - `review_source === 'hybrid'`이면 **proof 구조에 결속한다**: bypass는 `review_proof.layers.l2`가 비수렴이고 `review_proof.layers.l3 === 'converged'`일 때**만** 허용된다. 그 구조인데 `bypassed_verdict`가 부재면 거부하고, **그 구조가 아닌데 `bypassed_verdict === true`면 거부한다.**

  **후자가 위조면을 닫는다**(Codex R4 HIGH, conf 0.97 흡수). 직전 초안은 판별자를 `source` + `verdict` 조합으로만 두었는데, Task 2는 hybrid 완화를 L3가 `converged`일 때만 허용한다. 그래서 `source:'hybrid'` + L2 converged + L3 divergent라는 **DD2가 완화 금지로 명시한 정직한 비완화 조합**에 임의의 enum reason과 `bypassed_verdict:true`를 붙이면 schema를 통과했다 — L3 이견을 감사 기록상 진짜 우회처럼 봉인할 수 있다는 뜻이다. 검사가 *실제 완화 가능 조건*을 재검증하지 않은 것이 원인이고, proof의 `layers`가 그 조건을 그대로 담고 있으므로 거기에 묶는다.

**역방향이 `reason`을 조건으로 삼으면 안 된다**(Codex R3 HIGH, conf 0.93 흡수). 초안은 "`reason` 존재 ∧ 비수렴 ⟹ `bypassed_verdict`"였는데, `reason`은 DD3이 정의한 대로 `write.js`가 env에서 자동 stamp하는 **ambient 정책 주석**이고 `bypassed_verdict`가 적용 여부의 감사 축이다. 즉 그 초안은 **ambient 상태에서 적용 사실을 추론**하는 것이고, DD3이 §3.12의 `codex_disabled` 대 `codex_disabled_at_pr` 선례를 따라 세운 분리를 스스로 깬다. 그 선례가 값을 치르고 얻은 교훈이 정확히 *ambient를 proof로 인정하면 위조 탐지 분기가 구조적으로 도달 불가가 된다*는 것이었다.

실제 피해도 구체적이다: 토글이 켜진 채(→ `reason` 자동 stamp) 완화를 타지 **않은** 경로가 비수렴 verdict를 정직하게 봉인하려 하면, schema가 그것을 거부하거나 caller가 **일어나지 않은 우회를 주장**해야 한다. 경로 판별자로 바꾸면 그 receipt는 역방향 검사 대상에서 빠지고 정방향만 적용받는다.

- **Mirror**: `plugins/mccp/scripts/receipt/schema.js:191` (present-only 열거 검증) · `plugins/mccp/scripts/receipt/schema.js:246` (증거와 결론의 대조 불변식)
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/review-single-pass-fields.test.js`

### Task 7: test 3종 작성

- **Action**: 세 파일을 작성한다.
  - `review-single-pass.test.js` — 파서(미설정·3종 정상·대소문자 불일치·공백·열거 밖 → 각 결과와 warn 발생 여부) · `effectiveRoundCap`(토글 off에서 1/2/3 및 불량값, 토글 on에서 `MCCP_GATE_ROUND_CAP=3`이어도 `{cap:1,pinned:true}`) · `decideReview` 완화 경계(**L1 divergent + 토글 on → 여전히 block** · **`mode:'hybrid'` + quorum 비수렴 + L3 부재/`invoked:false`/`unavailable`/`skipped`/`divergent` + 토글 on → 여전히 `block===true`**(Codex R1 F0 흡수 — 이 조합이 완화를 타면 DD2 표의 hybrid 행이 무력화되므로, 다섯 L3 상태를 각각 단언한다) · L2 부재/`responded:0`/hash 불일치 + 토글 on → 여전히 block · quorum 비수렴 + 토글 on → **`block === false`** ∧ `review_verdict==='divergent'` ∧ proof 비-null ∧ `single_pass_reason` 일치 · 토글 off에서 M1 이전과 반환 동일) · `parseRoundCap` 불량 입력 3종(미설정→1 무warn · 비정수→1+warn · 범위 밖→1+warn) · `assert-single-round`(`halt_stage:null` ∧ 현재 hash 항목 1건·`round_index:0`→exit 0 · `halt_stage:'5.2e'`→exit 1 · Measurement 블록 부재→exit 1 · **같은 plan hash 항목 2건→exit 1**(재발화 탐지 — Codex R2가 지적한 fail-open의 회귀 pin) · **다른 hash의 선행 항목이 있는 상태에서 현재 hash의 첫 항목이 `round_index:0`으로 exit 0**(Codex R4 흡수 — round_index를 전체 길이로 세면 이 정상 시도가 실패한다) · **현재 hash와 일치하는 항목 0건→exit 1**(다른 본문의 로그만 있는 경우)). `block === false` 단언이 이 마일스톤의 **단일 급소**다 — `mk`의 하드코딩된 `block` 계산을 그대로 쓰면 여기서 즉시 붉어진다.
  - `review-single-pass-gate.test.js` — `cli.js decide` 실제 호출 왕복(임시 repo fixture): L1 divergent는 exit 12 유지, quorum 비수렴은 exit 0 + decision.json에 `single_pass_reason`. `santa/cli.js begin-round`가 토글 on에서 exit 2를 내고 **원장 라운드 수가 증가하지 않음**을 단언. budget skip 경로(`{skipped:true}` l2.json)는 토글 on에서도 exit 12임을 단언 — 이 경로는 `cmdDecide`가 `decideReview` **이전에** 조기 반환하므로 CLI 층에서만 반증 가능하다.
  - `review-single-pass-fields.test.js` — receipt 왕복: 두 필드 봉인 · 토글 미설정 시 키 부재(hash 무변동) · 불변식 위반 negative 4종(`bypassed_verdict` 단독 · `review_verdict` 부재 · `review_verdict='converged'`와 공존 · **`gate_id='mccp-plan-codex'` ∧ panel source ∧ 비수렴인데 `bypassed_verdict` 부재**) + **역방향 오적용 방지 positive**: 토글이 켜져 `reason`이 ambient stamp된 상태에서 완화를 타지 않은 경로가 낸 비수렴 receipt(다른 gate이거나 panel source가 아닌 경우)가 **통과**함을 단언한다(Codex R3 흡수) · **hybrid 완화 positive 왕복**(Codex R5 흡수): 실제 `decideReview`의 hybrid 완화 결과를 writer·schema까지 태워 `review_source==='hybrid'` ∧ `layers.l3==='converged'` ∧ `review_verdict==='divergent'`가 봉인되고, 그 receipt가 `isCrossModelCorroborated`에서 **false**임을 함께 단언한다(증거는 남기되 dedupe는 열지 않는다) · **forged hybrid negative 2종**(Codex R4 흡수): `source:'hybrid'` + `layers.l3` 비수렴 + `bypassed_verdict:true` → 거부 · `source:'hybrid'` + `layers.l2:'converged'` + `bypassed_verdict:true` → 거부. 이 둘이 없으면 역불변식이 다시 `source`+`verdict` 조합으로 넓어져도 붉어지지 않는다 · **투영 pin**: `review_verdict='divergent'`인 receipt가 `receipt-convergence.js#isConvergedVerdict`와 `derive/sources/receipts.js`의 `converged` 투영에서 **`false`로 나옴**을 단언한다. 원시 `resolution.converged`는 §3.12대로 `true`로 남지만(그 필드는 "writer가 findings를 확정했다"는 B#11 분할이지 승인 신호가 아니다) 소비자에 도달하는 값은 투영이므로, 그 투영이 바뀌면 비수렴 봉인이 대시보드에 승인으로 보이게 된다 — 오늘 참인 사실을 불변식으로 승격한다 · **dedupe negative**(`review_source='multi-agent'` receipt는 토글 유무와 무관하게 `isCrossModelCorroborated` 거짓) · **chain 회귀 pin**: `review_verdict='divergent'`인 `mccp-plan-codex` receipt에 대해 `validateCommand({command:'mccp:prp-implement'})` **와** `validateCommand({command:'mccp:pr'})`(선행 게이트 루프 축 — `--check-ship-verdict` 없이) 양쪽이 비수렴 `review_verdict`를 이유로 차단하지 **않음**을 단언한다. 소비자가 둘인데 하나만 고정하면 다른 하나가 바뀔 때 pin이 침묵한다. DD1이 의존하는 "하류 validator는 `review_verdict`를 소비하지 않는다"는 오늘 grep으로만 참인 **취약한 전제**였다 — 이 test가 그것을 기계적으로 지켜지는 불변식으로 바꾼다. 누군가 validate-cmd에 `review_verdict` 차단을 추가하면 이 test가 붉어져 M1 전체가 무력화되기 **전에** 알려준다.
    **fixture는 손으로 만들지 않는다** — `cli.js write`(또는 `write.js#buildReceipt`)로 실제 경로를 태워 receipt를 만들고, proof는 Task 2의 `buildAuditProof`가 내는 것과 같은 모양(비수렴 `layers` + `quorum.passed:false` + repo-relative `dispatch_evidence`)을 쓴다. 손으로 조립한 receipt는 `subject_hash`/`receipt_hash`·schema·tamper 검사를 우회하므로 "test에서는 통과하고 production에서는 막히는" 결과를 낼 수 있다. 선례는 `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js`의 `makeSkeleton` 기반 fixture다.
  - `review-single-pass-command-body.test.js`(위 세 파일과 별개, `plan-review-command-body.test.js` 미러) — 세 명령 본문(`plan.md`·`prp-implement.md`·`pr.md`)이 라운드 캡을 **각자 하드코딩한 리터럴이 아니라 공유 오라클에서 읽는지**를 정적으로 단언한다. 산문 루프를 기계화하지는 못하지만, "세 게이트 중 하나가 배선에서 빠지는" PRD Risk 5는 이것으로 잡힌다. **같은 파일이 5.6b의 플래그 forward도 단언한다**(R11 invariant HIGH 흡수): `plan.md` 본문에 `--review-single-pass-reason`과 `--review-single-pass-bypassed-verdict`가 **둘 다** 나타나고 `decision.json`에서 읽은 값의 비공허 조건 아래 있는지를 정적으로 본다. 캡 배선만 단언하고 감사 플래그 배선을 빼면, 구현이 플래그를 조용히 누락한 채 모든 test를 통과할 수 있다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:333` (원장 미증가 단언) · `plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js` (dedupe negative)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js plugins/mccp/scripts/receipt/tests/review-single-pass-fields.test.js`

### Task 8: 명령 본문 3곳 + `round-budget.test.js` 배선

- **Action**: `plan.md` — **5.2c의 debt marker write 직후** dispatch 로그에 한 줄 append(`{decision, round_index, at, reviewed_plan_hash}`; `round_index`는 **append 전 로그에서 `reviewed_plan_hash === <이번 dispatch의 hash>`인 항목의 수** — 전체 로그 길이가 **아니다**. Codex R4 HIGH 흡수: 전체 길이로 세면 다른 본문의 항목이 하나라도 남은 순간 새 본문의 **첫** dispatch가 `round_index:1`을 받아 정상 시도가 실패하고, Task 1이 내세운 "새 hash 그룹은 0부터"와 정면 모순이 된다)와 **`dispatch-log-<slug>.jsonl`을 5.2 진입 purge 목록에 넣지 **않는다**(Codex R2 HIGH 흡수 — purge하면 재발화가 자기 흔적을 지워 단언이 fail-open이 된다). 5.2의 기존 `rm -f` 목록은 그대로 두고 이 파일만 예외로 명시한다, 5.2e 뒤에 완화 발동 시의 안내 문구, 5.6b `WRITE_FLAGS`에 decision.json의 `single_pass_reason`이 **비어있지 않은 문자열일 때만** `--review-single-pass-reason "<값>"` + `--review-single-pass-bypassed-verdict`를 forward(기존 `[ -n "$VAR" ]` 관용구 — 키 존재 여부가 아니라 값의 비공허성을 본다. Task 2가 `mk`를 무변경으로 두므로 두 판정은 일치하지만, 셸 조건 쪽도 값 기준으로 적어 두 층이 어긋날 여지를 없앤다), Phase 5.4 캡 문장을 오라클 호출로 교체. `prp-implement.md`는 Phase 2.5의 `Repeat up to MCCP_GATE_ROUND_CAP` 산문을 위 `plan.md`와 **같은 형태의 오라클 호출 블록**으로 교체한다 — 그 게이트에는 자식 프로세스 export 지점이 없으므로 pr.md와 달리 `export`가 아니라 라운드 루프 진입 조건이 읽는 `$ROUND_CAP` 변수를 세우고, `pinned`일 때 같은 stderr 진단을 낸다. "동일 교체"라고만 적으면 세 게이트 중 하나가 산문만 바뀌고 실행 경로는 그대로 남을 수 있다(R11 architect HIGH 흡수). `plugins/mccp/commands/pr.md:511`의 `export MCCP_GATE_ROUND_CAP="${MCCP_GATE_ROUND_CAP:-1}"`을 아래로 교체해 codex-runner 자식이 **고정된** 값을 상속하게 한다 — `effectiveRoundCap`은 객체를 내므로 셸이 export하는 것은 `.cap` **하나뿐**이다(`.pinned`·`.reason`은 stderr 진단용):

  ```bash
  ROUND_CAP_JSON=$(node -e '
    const {effectiveRoundCap}=require(process.argv[1]+"/scripts/lib/review-single-pass");
    process.stdout.write(JSON.stringify(effectiveRoundCap(process.env)));
  ' "${CLAUDE_PLUGIN_ROOT}")
  export MCCP_GATE_ROUND_CAP=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).cap))}catch{process.stdout.write("1")}' <<<"$ROUND_CAP_JSON")
  node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(j.pinned)process.stderr.write("[mccp:single-pass] round cap pinned to "+j.cap+" by MCCP_REVIEW_SINGLE_PASS="+j.reason+"\n")}catch(_){}' <<<"$ROUND_CAP_JSON"
  ```

  5.6b의 플래그 forward도 **형태를 고정한다** — 초안은 산문뿐이었고, 그것이 R11에서 architect HIGH 1건과
  invariant CRITICAL 2건·HIGH 1건을 동시에 부른 지점이다. 이 축이 누락되면 receipt에 감사 stamp가 없는 채로
  게이트가 성공하므로 PRD Success Metric 4("토글로 통과한 receipt 100%가 사유를 봉인")가 조용히 깨진다:

  ```bash
  SINGLE_PASS_REASON=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).single_pass_reason||""))}catch{process.stdout.write("")}' "$REVIEW_DIR/decision.json")
  if [ -n "$SINGLE_PASS_REASON" ]; then
    WRITE_FLAGS+=(--review-single-pass-reason "$SINGLE_PASS_REASON"
                  --review-single-pass-bypassed-verdict)
  fi
  ```

  두 플래그가 **함께** 실리는 것이 요점이다. 하나만 실리면 Task 6의 양방향 불변식이 write 시점에 거부한다 —
  즉 이 블록의 결함은 조용한 감사 누락이 아니라 receipt 미작성으로 드러난다(R9 흡수분이 여기서 값을 한다).

  `round-budget.test.js`의 test-local `parseCap`을 신규 모듈 import로 교체하고 불량값 처리 단언을 오라클 동작에 맞춘다.
- **Mirror**: `plugins/mccp/commands/plan.md:2240` (decision.json에서 값을 읽어 `WRITE_FLAGS`에 push) · `plugins/mccp/commands/pr.md:511` (자식 프로세스 env export)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/round-budget.test.js plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js`

### Task 9: 문서 · 버전 · backlog

- **Action**: `docs/ENVIRONMENT.md` §11에 `MCCP_REVIEW_SINGLE_PASS`를 등재하고 `MCCP_GATE_ROUND_CAP` 행에 우선순위를 명기한다. `docs/gate-design.md`에 완화 경계(DD2 표)와 santa 거부 근거를 상주시킨다. `CLAUDE.md`에 §3.15를 신설하되 **주장하지 않는 것**(라운드 산문 강제의 천장 · L2 비용은 여전히 1회분 발생 · M2 없이는 지적이 backlog로 자동 회수되지 않음)을 함께 적는다. `plugin.json` 1.27.2 → 1.27.3, footer 2면(`renderer/html.js` page-foot · `renderer/markdown.js` derived 줄)과 `CHANGELOG.md`를 같은 값으로 동기화한다. PRD의 M1 행을 in-progress + Plan 셀 연결로 갱신하고 Open Question 2·3·5에 판정을 기록한다. fan-out MEDIUM·LOW와 기각한 HIGH 1건을 `codex-findings-backlog.md`에 append한다.
- **Mirror**: `docs/ENVIRONMENT.md:415` (diverse-agent review 토글 블록 서술 밀도) · CLAUDE.md §3.13.1의 "주장하지 않는 것" 절
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js && node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`

## Validation

```bash
# `set -e` — 이것이 없으면 보호되지 않은 명령(아래 `node --test` 다섯 줄 등)이 실패해도 다음
# 줄이 실행되고, 마지막 성공 명령의 status가 블록 전체 결과가 되어 "Validation passes"를 거짓으로
# 만족시킨다(Codex R11 HIGH, conf 0.99). R7~R10의 네 라운드가 이 부류의 개별 사례를 하나씩
# 쫓았는데 원인은 이 한 줄의 부재였다. `pipefail`은 POSIX sh에 없고 이 블록에 파이프도 없으므로
# 넣지 않는다 — 넣으면 셸에 따라 그 줄 자체가 실패한다.
set -eu

# 신규 축 단위 + CLI 왕복 + receipt 봉인
node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js
node --test plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js
node --test plugins/mccp/scripts/receipt/tests/review-single-pass-fields.test.js

# 기본 경로 회귀 0건 (토글 미설정 상태) — PRD Success Metric 3
# 디렉토리 인자가 아니라 **glob**이다. Node v24.19.0은 디렉토리를 모듈로 해석해
# `MODULE_NOT_FOUND`로 즉사한다(실측: `tests 1 · fail 1 · 103ms`). `set -eu` 아래라 블록이
# 그 줄에서 중단되므로, 초안 문언으로는 "Validation passes"가 이 환경에서 성립할 수 없었다
# — 두 줄이 한 번도 통과한 적 없다는 뜻이다(milestone-close 시점 발견).
node --test "plugins/mccp/scripts/lib/tests/*.test.js"
node --test "plugins/mccp/scripts/receipt/tests/*.test.js"

# 기존 receipt corpus invalid 0
# `cli.js status`는 읽기/검증 오류를 summary에 담고도 **항상 exit 0**이다(실행으로 확인).
# 그대로 쓰면 corpus가 어떤 상태여도 이 기준이 통과하므로, 전수 검증으로 교체한다.
node -e '
  const fs = require("fs"), path = require("path");
  const { validate } = require("./plugins/mccp/scripts/receipt/schema.js");
  const root = ".claude/receipts";
  const bad = [];
  let n = 0;
  for (const gate of fs.readdirSync(root)) {
    const dir = path.join(root, gate);
    if (!fs.statSync(dir).isDirectory() || gate.startsWith(".")) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const fp = path.join(dir, f);
      n += 1;
      let r;
      try { r = JSON.parse(fs.readFileSync(fp, "utf8")); }
      catch (e) { bad.push(fp + ": unparsable (" + e.message + ")"); continue; }
      const res = validate(r);
      if (res && res.ok === false) bad.push(fp + ": " + (res.errors || []).join("; "));
    }
  }
  if (bad.length) {
    console.error("FAIL: invalid receipt " + bad.length + "/" + n + "\n  " + bad.join("\n  "));
    process.exit(1);
  }
  console.log("OK: receipt corpus " + n + "건 전부 valid");
' || exit 1

# 버전 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# CLAUDE.md 절 이전 검증
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 신규 command-body 정적 test (위 4개 파일 중 마지막)
node --test plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js

# ── 라이브 경로 1회 완주 (Acceptance 마지막 항목의 산출물 4종) ───────────────
# (b) santa-loop 미발화 + 원장 라운드 미증가
#
# slug은 `review-loop-bypass`다 — `derive-decision --command mccp:plan`이 PRD 파일명에서
# 파생하는 값이며 아래 (a)(c)의 receipt·리뷰 기록 경로와 **같아야** 한다. 초안은 여기만
# `-m1` 접미사를 붙여, 이 명령이 나머지 검증과 **다른 decision을 겨냥**하고 있었다(R9 test
# HIGH 흡수 — 실측 확인). 다른 decision을 거부시키는 것은 아무것도 증명하지 않는다.
#
# 순서도 고쳤다. 거부가 성공하면 원장 파일이 **생성되지 않으므로**, 초안처럼 곧바로
# require()하면 ENOENT로 죽는다 — 그것은 "라운드가 안 늘었다"의 증명이 아니라 test 자체의
# 실패다. 먼저 토글 없이 원장을 1라운드 열어 기준선을 만들고, 그 다음 토글을 켜 거부를
# 확인한 뒤, 길이가 **그대로**임을 본다. 비교 대상이 있어야 "미증가"가 반증 가능해진다.
SLUG=review-loop-bypass
# 기준선 라운드를 연다(토글 off). **exit을 단언한다** — 실패하면 원장 파일이 없고, 그러면
# 아래 BEFORE/AFTER가 둘 다 빈 문자열이 되어 마지막 비교가 공허하게 통과한다. 즉 라운드가
# 하나도 열리지 않은 상태에서 "santa 억제 검증 성공"을 보고할 수 있었다(전수 감사로 발견).
node plugins/mccp/scripts/lib/santa/cli.js begin-round --decision "$SLUG" \
  || { echo "FAIL (b): 기준선 begin-round가 실패했다 — 비교 대상이 없으면 미증가 단언이 공허해진다"; exit 1; }
BEFORE=$(node -e "console.log(require('./.claude/state/santa-loop/'+process.argv[1]+'.json').rounds.length)" "$SLUG")
case "$BEFORE" in ''|*[!0-9]*) echo "FAIL (b): BEFORE='$BEFORE' — 원장 길이를 읽지 못했다"; exit 1 ;; esac
# 거부 exit을 **단언**한다. 초안은 뒤에 `; echo "exit=$? (기대 2)"`를 붙여 status를 삼켰고,
# 그러면 명령이 다른 이유로 실패했거나 원장을 안 바꾼 채 잘못된 status를 내도 아래 길이
# 비교가 통과해 Acceptance (b)가 santa-loop 억제를 거짓 인증한다(Codex R9 HIGH, conf 0.99).
# R8에서 (a)·(c)의 같은 부류를 고치며 이 한 줄을 빠뜨린 것이라, 흡수 후 Validation 블록
# 전체를 훑어 exit status를 삼키는 패턴이 남지 않았음을 확인했다.
# `set -e` 아래에서는 `cmd; REFUSE_EXIT=$?`가 성립하지 않는다 — 실패한 cmd에서 즉시 중단되어
# status를 포착하지 못한다. 그래서 if 구문으로 포착한다(흡수가 다른 흡수를 깨는 것을 막는다).
if MCCP_REVIEW_SINGLE_PASS=scope_too_small node plugins/mccp/scripts/lib/santa/cli.js begin-round --decision "$SLUG"; then
  REFUSE_EXIT=0
else
  REFUSE_EXIT=$?
fi
[ "$REFUSE_EXIT" = "2" ] || { echo "FAIL (b): begin-round exit=$REFUSE_EXIT (기대 2) — 거부가 일어나지 않았거나 다른 이유로 실패했다"; exit 1; }
AFTER=$(node -e "console.log(require('./.claude/state/santa-loop/'+process.argv[1]+'.json').rounds.length)" "$SLUG")
case "$AFTER" in ''|*[!0-9]*) echo "FAIL (b): AFTER='$AFTER' — 원장 길이를 읽지 못했다"; exit 1 ;; esac
[ "$BEFORE" = "$AFTER" ] || { echo "FAIL: 원장 라운드가 $BEFORE -> $AFTER 로 증가했다 (캡 소모)"; exit 1; }

# (a)(c)(d) plan 게이트 실주행 — 이 명령이 없으면 Acceptance (d)의 "정확히 1"이
# 자동으로 반증 불가능하다(R3 test 리뷰어 HIGH). 비수렴 L2를 재현하려면 토글을
# 켠 채 게이트를 끝까지 태우고, 아래 세 값을 순서대로 확인한다.

# freshness 토큰 저장 — 블록 2가 이 값과 달라졌는지로 라이브 실행 여부를 판정한다.
# receipt가 아직 없으면 빈 문자열이 저장되고, 블록 2의 "$STAMP_NOW 비어있음" 단언이 처리한다.
#
# 토큰은 `meta.created_at`이다. 초안은 `meta.intent_run_nonce`였는데, 그 필드는 **이 검증이
# 요구하는 모드에서 구조적으로 존재하지 않는다.** nonce는 `plan-codex-runner.js`가 receipt를
# 쓰는 `mode=codex` 경로에서만 생기고(plan.md 5.6 "mode=codex ONLY"), 그 모드는 `review_*`
# 필드를 아예 stamp하지 않는다(docs/ENVIRONMENT.md:417). 반대로 (a)가 요구하는
# `resolution.review_verdict`는 패널 모드에서만 생기며 그 경로의 writer(5.6b)는 `run_nonce`를
# 넘기지 않아 nonce가 null이다(write.js:293). 즉 초안의 freshness 게이트와 (a)는 **상호
# 배타**라 블록 2가 어떤 모드에서도 첫 단언에서 멈췄다 — 통과할 수 없는 기준은 fail-open의
# 거울상이며 둘 다 검증을 무력화한다. `meta.created_at`은 write.js:544가 모드와 무관하게
# 매 write마다 찍으므로 두 요구를 동시에 만족한다(milestone-close 시점 발견).
FRESH_BEFORE="$(git rev-parse --git-path mccp/tmp)/live-run-stamp-before"
mkdir -p "$(dirname "$FRESH_BEFORE")"
node -e 'try{const r=require("./.claude/receipts/mccp-plan-codex/review-loop-bypass.json");process.stdout.write(String((r.meta&&r.meta.created_at)||""))}catch(e){process.stdout.write("")}' > "$FRESH_BEFORE"
echo "freshness token 저장: $FRESH_BEFORE (블록 2가 이 값과의 차이를 단언한다)"
```

### 수동 경계 — 라이브 게이트 실행

여기서 **사람이 한 번** 실행한다. 아래 한 줄은 슬래시 명령이지 셸 명령이 아니므로 위 블록에
넣을 수 없다 — POSIX 셸에서 그 토큰은 절대경로 실행 파일이라 `set -e` 아래서 127로 블록을
중단시키고, 대화형으로 실행하면 셸 옵션이 그 경계를 넘지 못한다. 어느 쪽이든 **하나의 블록
수준 exit status라는 주장이 성립하지 않는다**(Codex R12 HIGH, conf 0.99 흡수). 직전 판은 이
지점을 주석으로 서술하고 넘어갔는데, 서술은 검증이 아니다.

```
MCCP_REVIEW_SINGLE_PASS=scope_too_small /mccp:plan .claude/prds/review-loop-bypass.prd.md
```

**블록 2는 블록 1과 위 명령 이후에 생성된 산출물만 소비한다.** 블록 1 말미가 receipt의
`meta.created_at`을 freshness 토큰으로 저장하고, 블록 2 첫머리가 현재 값이 그것과
다른지를 **먼저 단언한 뒤에만** 의미 단언으로 넘어간다 — 토큰이 같거나 없으면 라이브 게이트가
실행되지 않았거나 실패한 것이므로 그 자리에서 멈춘다. 직전 판은 여기에 "실패하면 두 단언이
nonzero로 끝난다"고 **서술만** 했는데, 두 단언은 고정 경로의 값만 보므로 낡은 산출물로도
통과한다(Codex R13 HIGH 흡수). 서술은 검증이 아니다.

```bash
set -eu

# ── freshness 게이트 — 이 블록은 위 수동 경계 **이후**에 생성된 산출물만 소비한다 ──────────
# 두 단언은 고정 경로의 값만 보므로, 이 plan과 그 리뷰가 이미 같은 경로에 남긴 낡은 산출물로도
# 통과한다. 즉 운영자가 수동 명령을 건너뛰거나 그것이 실패해도 성공으로 읽힌다
# (Codex R13 HIGH 흡수 — 직전 판은 "실패하면 두 단언이 nonzero로 끝난다"고 **서술만** 했는데
# 그 주장은 보장되지 않았다). 파일 시간이 아니라 **게이트가 생성하는 식별자**로 검사한다.
# 경로를 **재계산한다** — 블록 1의 셸 변수는 수동 경계를 넘지 못한다(Codex R14 HIGH: 이 줄이
# `set -u` 아래 unbound variable로 즉시 죽어 검증 절차 전체가 실행 불가였다). 두 블록이 같은
# 고정 경로를 각자 독립적으로 얻게 한다.
FRESH_BEFORE="$(git rev-parse --git-path mccp/tmp)/live-run-stamp-before"
[ -f "$FRESH_BEFORE" ] || { echo "FAIL: $FRESH_BEFORE 가 없다 — 블록 1을 먼저 실행해야 한다"; exit 1; }
STAMP_NOW=$(node -e 'try{const r=require("./.claude/receipts/mccp-plan-codex/review-loop-bypass.json");process.stdout.write(String((r.meta&&r.meta.created_at)||""))}catch(e){process.stdout.write("")}')
STAMP_BEFORE=$(cat "$FRESH_BEFORE")
[ -n "$STAMP_NOW" ] || { echo "FAIL: receipt에 meta.created_at이 없다 — 라이브 게이트가 receipt를 쓰지 않았다"; exit 1; }
[ "$STAMP_NOW" != "$STAMP_BEFORE" ] || { echo "FAIL: receipt의 created_at이 수동 경계 이전과 같다($STAMP_NOW) — 라이브 게이트가 실행되지 않았거나 실패했고, 아래 단언은 낡은 산출물을 검사하게 된다"; exit 1; }


#   (d) L2 라운드 수 - 기대 정확히 1. **관측이 아니라 단언이다: 어긋나면 exit 1.**
#   초안은 `grep -c '^## Round' <리뷰 기록>`이었는데 두 겹으로 틀렸다. (i) exit code가
#   개수와 무관하게 0이라 어떤 값에도 통과했고(fail-open), (ii) `record.js`는 `## Round`
#   헤딩을 **아예 emit하지 않으므로** 그 grep은 항상 0을 반환한다 - 강제되지 않았을 뿐
#   아니라 애초에 측정하고 있지도 않았다.
#
#   기계가 실제로 아는 사실로 바꾼다. 토글이 켜지면 5.2e의 quorum 차단 경로가 사라지므로
#   **라운드가 2회 이상 될 수 있는 기제 자체가 없다** - 재발화는 halt 뒤에만 일어난다.
#   따라서 "라운드 1회"는 "단일 호출이 halt 없이 receipt까지 도달했다"와 동치이고,
#   그 사실은 리뷰 기록의 Measurement 블록(`halt_stage`)으로 판독된다.
node plugins/mccp/scripts/lib/review-single-pass.js assert-single-round \
  .claude/reviews/plan-review-review-loop-bypass.md || exit 1

#   (d)의 강제 범위와 그 밖 - 운영자가 명령을 **몇 번 쳤는지**는 어떤 아티팩트도 모른다.
#   위 단언이 닫는 것은 "게이트가 스스로 재발화를 요구했는가"이고, 그것이 UI5가 말하는
#   라운드 반복의 전부다. 사람이 같은 명령을 두 번 치는 것까지 세는 척하는 것은 R1에서
#   고친 fail-open을 다른 모양으로 되살리는 일이라 하지 않는다.
#   (a) receipt 3필드 동시 봉인 — **출력이 아니라 단언이다.** 초안은 console.log로 세 값을
#   찍기만 해 값이 없거나 틀려도 exit 0이었다(Codex R8 HIGH, conf 0.99 흡수). 관측을 통과
#   근거로 쓰는 것이 이 plan이 R1·R5·R10과 dispatch 로그 흡수에서 네 번 거부한 부류다.
node -e '
  const r = require("./.claude/receipts/mccp-plan-codex/review-loop-bypass.json");
  const want = {
    "meta.review_single_pass_reason": "scope_too_small",
    "meta.review_single_pass_bypassed_verdict": true,
    "resolution.review_verdict": "divergent",
  };
  const got = {
    "meta.review_single_pass_reason": r.meta && r.meta.review_single_pass_reason,
    "meta.review_single_pass_bypassed_verdict": r.meta && r.meta.review_single_pass_bypassed_verdict,
    "resolution.review_verdict": r.resolution && r.resolution.review_verdict,
  };
  const bad = Object.keys(want).filter(function (k) { return got[k] !== want[k]; });
  if (bad.length) {
    console.error("FAIL (a): " + bad.map(function (k) {
      return k + " = " + JSON.stringify(got[k]) + " (기대 " + JSON.stringify(want[k]) + ")";
    }).join(" · "));
    process.exit(1);
  }
  console.log("OK (a): 세 필드 모두 기대값과 일치");
' || exit 1
#   (c) 비수렴 봉인이 chain을 막지 않음 — 소비자 둘 모두. `; echo`는 exit status를 삼켜
#   chain check가 실패해도 블록을 성공시키므로 쓰지 않는다(같은 흡수).
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement \
  --decision review-loop-bypass --plan .claude/plans/review-loop-bypass-m1.plan.md \
  || { echo "FAIL (c): mccp:prp-implement chain-check가 비수렴 receipt를 차단했다 — DD1 위반"; exit 1; }
#   pr 축은 **exit 0을 요구하지 않는다.** `validate --command mccp:pr`은 선행 게이트의 모든
#   차단 축을 합산하므로, 이 milestone과 무관한 선재 차단 하나가 DD1 단언을 붉게 만든다
#   (실측: `mccp-implement-codex`의 `meta.security_skipped=true`로 exit 2 — review 축과 무관).
#   단언할 명제는 "pr 축이 **review_verdict 때문에** 막지 않는다"이므로 차단 목록에서 그 축
#   기인 항목이 0건인지를 본다. **이 단언은 pr 게이트가 통과한다고 주장하지 않는다** — 측정보다
#   넓은 주장을 두지 않는 것은 (d)에서 이미 두 번 적용한 규칙이다(milestone-close 시점 정정).
PR_OUT="$(git rev-parse --git-path mccp/tmp)/pr-validate-out.json"
mkdir -p "$(dirname "$PR_OUT")"
if node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr --decision review-loop-bypass --plan .claude/plans/review-loop-bypass-m1.plan.md > "$PR_OUT" 2>/dev/null; then :; fi
node -e '
  const fs = require("fs");
  let j;
  try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
  catch (e) { console.error("FAIL (c): pr validate 출력이 JSON이 아니다 — 명령이 실행되지 않았을 수 있다"); process.exit(1); }
  if (j.command !== "mccp:pr" || j.decisionId !== "review-loop-bypass") {
    console.error("FAIL (c): pr validate 출력이 다른 대상을 가리킨다 — " + JSON.stringify({ command: j.command, decision: j.decisionId }));
    process.exit(1);
  }
  const rows = [].concat(j.blocking || [], j.stale || []);
  const hit = rows.filter(function (b) { return JSON.stringify(b).indexOf("review_verdict") !== -1; });
  if (hit.length) {
    console.error("FAIL (c): pr 선행 게이트 축이 review_verdict로 차단했다 — DD1 위반");
    console.error(JSON.stringify(hit, null, 2));
    process.exit(1);
  }
  console.log("OK (c): pr 축 차단 " + rows.length + "건 중 review_verdict 기인 0건 (게이트 통과 주장 아님)");
' "$PR_OUT" || exit 1
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 완화가 `unavailable` 경로까지 새어 리뷰 없이 통과한다 | 중간 | 완화 코드를 `quorum.passed !== true` 반환 한 곳에만 두고, 나머지 6개 차단 경로 각각에 대해 "토글 on에서도 block" 단위 test를 둔다(Task 7) |
| L1 불가침이 명령 본문 층 검사로 잘못 구현돼 우회된다 | 중간 | 완화 인자를 `decideReview` 내부 L1 분기 **뒤**에 배치해 코드 순서로 보장하고, 명령 본문에는 토글 분기를 두지 않는다 |
| 비수렴 receipt가 하류 게이트를 막아 토글이 무효가 된다 | 낮음 | 오늘 `validate-cmd.js`가 `review_verdict`를 소비하지 않는다(grep 0건). 그러나 grep은 시점의 관찰일 뿐이라 Task 7이 **회귀 pin test**로 그 전제를 불변식으로 승격한다 |

<details>
<summary>+4 more risks</summary>

| Risk | Likelihood | Mitigation |
|---|---|---|
| 라운드 캡이 산문 층에 남아 부분 적용된다 | 높음 | 기계화 가능한 지점(`plugins/mccp/commands/pr.md:511`의 자식 env export)만 기계화하고, 세 명령 본문이 오라클을 참조하는지는 정적 test로 단언한다(DD4 (d)). 나머지 천장은 DD4에 명시한다 |
| 토글이 상시 켜진 채 방치된다 | 중간 | 사유가 값 자체라 무사유 사용이 불가하고, receipt 봉인으로 사용률이 사후 계측된다. 발동 시 loud stderr가 매번 나온다 |
| 병렬 브랜치와 1.27.3 번호 충돌 | 중간 | §3.7 forward-only — 머지 해소 시점과 `/mccp:pr` 직전 두 번 재계산하고 재상향 시 4면 동기 검증을 다시 돌린다 |
| M2 미배송 상태로 M1만 쓰이면 지적이 유실된다 | 높음 | M1은 지적을 **없애지 않는다** — 비수렴 verdict와 findings가 `l2.json`·`.claude/reviews/plan-review-<slug>.md`에 그대로 남는다. 자동 회수만 M2 소유임을 §3.15에 명시한다 |

</details>

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 토글 on에서 L1 divergent가 여전히 HALT함을 단위 test가 단언 (UI7)
- [ ] 토글 on에서 L2 비수렴이 **`decision.block === false`** + `review_verdict='divergent'` 봉인임을 단위 test가 단언 (UI6·UI8). `mk`의 하드코딩 `block` 계산을 그대로 쓰면 붉어지는 급소 단언이다
- [ ] `review_verdict='divergent'` plan receipt로 `mccp:prp-implement` chain-check가 `ok:true`임을 회귀 test가 pin (DD1의 취약 전제 승격)
- [ ] 세 명령 본문이 라운드 캡을 공유 오라클에서 읽는지 정적 test가 단언 (PRD Risk 5)
- [ ] **`/mccp:prp-implement`·`/mccp:pr`의 캡 배선이 검증되는 범위를 명시한다** (R8 invariant HIGH 흡수). 위 정적 test가 닫는 것은 **세 파일 모두가 오라클을 참조한다**는 배선 사실이고, 그 두 게이트를 실제로 완주해 라운드 수를 재는 것은 M1 구현이 배송된 뒤에만 성립하므로 **M1 Acceptance가 아니라 배송 후 검증 항목**이다(R4에서 이미 이연). 따라서 이 항목은 "두 게이트가 작동함"을 주장하지 않는다 — **주장하는 것은 배선 누락이 없다는 것뿐**이며, 그 구분을 여기 적어 두는 이유는 Acceptance가 자신이 재지 않은 것을 통과시킨 것처럼 읽히지 않게 하기 위해서다
- [ ] 토글 미설정 시 기존 test suite green + `receipt cli.js status` invalid 0 (PRD Success Metric 3)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
  - **라이브 산출물 4종**: (a) **다음으로 실행되는 plan 게이트 1회로 이월한다(2026-08-18 판정 — 미충족).** 원래 문언은 `MCCP_REVIEW_SINGLE_PASS=scope_too_small`로 이 PRD의 `/mccp:plan`을 실제 실행해 비수렴 L2에서도 `mccp-plan-codex` receipt가 **작성되고** 그 안에 `meta.review_single_pass_reason='scope_too_small'` + `meta.review_single_pass_bypassed_verdict=true` + `resolution.review_verdict='divergent'`가 함께 들어있을 것이었다. **그것은 구현이 착지한 뒤에는 구조적으로 불가능하다** — 이 plan의 `Files to Change`가 CREATE로 선언한 5개 파일이 이제 존재하므로 L1이 `C3_CREATE_EXISTS` 5건으로 차단하고(실측 2026-08-18), DD2대로 토글은 L1을 완화하지 않으므로 L2가 발화조차 못 한다. L2가 안 돌면 완화 분기에 도달할 경로가 없고 receipt도 없다. 즉 이 항목은 **평가 시점에 성립할 수 없는 기준**이었다 — F1(freshness 토큰 상호 배타) · F2(pr 축 과대 요구)와 같은 부류이며, 셋 다 문서를 읽어서는 알 수 없고 실행해야만 드러났다. 판정을 CREATE→UPDATE 편집으로 통과시키지 않는다: 그것은 이 plan이 자신이 무엇을 했는지에 대해 거짓을 말하게 만든다. 대신 **다음으로 실행되는 아무 plan 게이트**(M2 plan이든 다른 작업이든)를 토글을 켜고 완주해 같은 3필드를 확인하는 것으로 이월하며, 이 항목은 **미충족으로 남는다.** 다만 M1의 종료 판정은 이 항목의 충족이 아니라 **운영자의 이월 수용**으로 내려졌다(2026-08-18 — PRD M1 행 `complete`, [closure](../milestone-closures/review-loop-bypass-m1.md)). 즉 그 `complete`는 «검증됐다»가 아니라 «검증을 다음 게이트로 미룬 채 마감하기로 했다»를 뜻한다. 그 구분을 지우지 않는 것이 이 문단의 목적이다. (b) 같은 env에서 `santa/cli.js begin-round`가 exit 2를 내고 `.claude/state/santa-loop/<slug>.json`의 `rounds` 길이가 **증가하지 않았을** 것. (c) 그 receipt로 `/mccp:prp-implement`의 chain-check(`cli.js validate --command mccp:prp-implement`)가 exit 0일 것 — 비수렴 봉인이 chain을 막지 않는다는 DD1의 실측. (d) 그 라이브 실행에서 **L2 dispatch가 정확히 1회(round_index 0)이고 게이트가 재발화를 요구하지 않았을** 것 — 기계 판정 형태로는 `review-single-pass.js assert-single-round`가 exit 0일 것(dispatch 로그 1건 ∧ `halt_stage` null). **문언을 "L2 라운드가 정확히 1회"에서 이것으로 좁힌다**(R8 invariant HIGH 흡수): `halt_stage`는 마지막 실행의 상태만 담고 리뷰 기록은 매 실행 덮어쓰기되므로, block:false인 실행이 N번 있어도 null이다. 즉 그 단언은 호출 **횟수**를 세지 않는다. Validation 블록은 이 한계를 이미 정확히 적고 있었는데 Acceptance 문언만 "정확히 1회"로 넓게 남아 있었다 — 측정보다 넓은 주장을 Acceptance에 두는 것은 R1·R5에서 두 번 고친 fail-open과 같은 부류라, 이번엔 주장을 측정에 맞춘다. 어긋나면 **이 항목은 미충족**이고 마일스톤은 complete가 아니다 — 원인을 규명해 흡수하거나, 흡수 불가로 판명되면 UI5 미달을 명시하고 PRD에 되돌린다. 초안은 "실측값을 기록한다"였는데 그것은 임계 없는 관측이라 **어떤 값에도 통과하는 fail-open 기준**이었다: M1의 주목적이 달성되지 않아도 complete를 선언할 수 있었다. 계측은 DD4가 인정한 산문 강제의 천장을 *서술*하는 수단이지 Acceptance를 *면제*하는 근거가 아니다.

## Out of Scope (M1)

- 미흡수 지적의 backlog 자동 적재 — **M2 소유**. M1만 배송된 상태에서 지적은 `l2.json`과 `.claude/reviews/plan-review-<slug>.md`에 남지만 backlog로 **자동 이동하지 않는다**
- Codex 게이트 3종의 동작 변경 · terminal ship gate verdict 판정 변경
- 기존 5종 리뷰 토글의 통합/은퇴 · 전역이나 CI 상시 활성 · 대시보드 사용률 노출
- `deferred_to_prd_completion`으로 미룬 검증이 PRD 종료 시 실제로 수행됐는지 강제하는 장치 (PRD Open Question 1 — 미결로 유지)

## Design Critique

detector: `design_signal=true` (signal files: `plugins/mccp/scripts/receipt/write.js` ·
Task 9의 renderer footer 동기 검증 명령). retry cap 2, 2회 발화 후 `CONVERGED`.

- **R0 — HIGH 1건 (H4 한 화면 항목 수 상한)**: `### Findings`(34) · `### Meta-gaps`(25) ·
  `### Patterns to mirror`(26) · DD6 판정표(11) · `## Risks`(7) · `## Patterns to Mirror`(8)이
  전부 평평하게 펼쳐져 있었다. 상위 3개만 노출하고 나머지를 `<details><summary>+N more</summary>`로
  접어 흡수했다.
- **R1 — CONVERGED**: H1(heading depth ≤ 3 — 본문 최대 `###`) · H2(강조색 토큰 없음, markdown 평문) ·
  H3(미렌더 marker·MD0xx·부유 entity 없음) · H4(위 6개 면 적용) 모두 통과.

두 번째 발화(세션 재개 시, 아래 게이트 재개 참조) — 라운드 기록이 누적되며 H1이 회귀했다:

- **R0 — HIGH 1건 (H1 정보 위계 3단계)**: DD9에 R1~R4 라운드 기록을 추가하며 `#### R1` …
  `#### 이 게이트의 종료 상태` 5개가 depth 4로 들어갔다. 앞선 CONVERGED가 "본문 최대 `###`"를
  근거로 삼았으므로 그 근거가 깨진 것이다. 5개를 굵은 라벨로 강등해 흡수했다 — 라운드 기록은
  DD9의 **세부**이지 별도 위계가 아니므로 헤딩이 아니라 라벨이 맞다.
- **R1 — CONVERGED**: 4개 anchor 모두 재통과.

이 회귀가 남기는 교훈은 절 자체보다 크다: 게이트 라운드가 반복되면 그 **기록**이 문서에 쌓이고,
쌓인 기록이 다른 게이트의 anchor를 깬다. PRD가 비용으로 지목한 라운드 반복은 시간만 쓰는 것이
아니라 산출물의 구조도 밀어낸다.

**H4를 적용하지 않은 4개 면과 그 이유** — 접으면 다른 게이트를 깨거나 계약을 가린다:

- `## User Intent` — `intent-context.js`가 표를 직접 파싱해 리뷰어 focus를 만든다. 구조를 감싸면
  섹션이 **부재**로 취급돼 게이트가 막힌다.
- `## Files to Change` — `l1-check.js#parseFileRows`가 행 단위로 C2·C3·C7c를 검사한다.
- `## Tasks` — 같은 파일의 `taskBlocks`가 Task마다 `**Validate**:` 존재를 검사한다(C4).
- `## Acceptance` — 접으면 마지막 항목(라이브 완주 산출물 3종)이 기본 화면에서 사라진다.
  그 항목은 이 명령 본문이 boilerplate가 아니라고 명시한 계약이라, 숨기는 것이 H4가 막으려는
  스캔 실패보다 나쁘다.

세 번째 발화(R7 진입 전) — **R0에서 CONVERGED**. 이번 라운드의 본문 변경은 (i) 종료 상태
블록 갱신과 (ii) fan-out 절 머리의 폐기 env 이름 경고 주석 두 건뿐이고, 둘 다 새 헤딩을 만들지
않았다. 4개 anchor 기계 확인: H1 depth>3 헤딩 0건 · H2 markdown 평문(강조색 토큰 없음) ·
H3 MD0xx·부유 entity 0건 · H4 folds 7면 유지. 두 번째 발화가 흡수한 "라운드 기록은 헤딩이
아니라 굵은 라벨" 규약을 이번 추가분도 그대로 따랐으므로 H1 회귀가 재발하지 않았다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없어 어떤 impeccable
명령도 **호출하지 않는다** — 아래는 구현자를 위한 체크리스트다. 본 마일스톤의 렌더 표면은
Task 9의 footer 2면 동기뿐이라 대부분의 행은 해당 없음으로 지나간다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |
## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->
<!-- 원문 그대로이되 존재하지 않는 파일 경로 2건만 정정했다(L1 C6 인용 검사 통과용). -->
<!-- 이 절은 조사 재료다. 채택·기각 판정은 위 ## Design Decisions DD6이 소유한다. -->
<!-- 주의: 이 절의 fan-out 노트는 **현 설계 이전 텍스트**이며 폐기된 env 이름
     `MCCP_REVIEW_LOOP_BYPASS`를 쓴다. 현 토글 이름은 `MCCP_REVIEW_SINGLE_PASS`이고
     설계는 DD1~DD9가 소유한다. 이 절의 문장을 현 설계의 진술로 읽지 말 것 —
     그렇게 읽은 지적이 R6에서 실제로 나왔고 DD9가 증거로 기각했다. -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~47k.

### Findings (severity-ranked)


- **[CRITICAL][security]** PRD specifies 'receipt 게이트 미통과' fail-closed, but does not spec how validator should reject a L2-bypassed receipt that arrives at terminal PR gate without ship-ready codex verdict — PRD §Scope: 'receipt — 미작성이나 미승인이 아니라, **사유가 봉인된 승인**으로 남는다'. This means the gate will WRITE a receipt (converged=true assumed) despite L2 nonconvergence. plugins/mccp/scripts/lib/pr-ship-gate.js deriveShipDecision (line 38) will see codex_verdict='divergent' in a prior receipt and no-ship. But if the prior receipt was written under the bypass toggle with L2 deliberately nonconvergent, the receipt.resolution.codex_verdict should reflect that (not be mislabeled 'converged'). The toggle must force a distinct verdict enum value (suggested: 'skipped_by_bypass_toggle') so downstream ship gates mechanically fail-closed if codex_verdict indicates a review was aborted, not completed.
- **[CRITICAL][security]** No cross-gate dedupe protection; plan-codex and implement-codex can both be bypassed, and PR-codex dedupe (plugins/mccp/scripts/receipt/dedupe.js) will approve skip based on two bypassed-L2 receipts, removing all cross-model review — plugins/mccp/scripts/receipt/dedupe.js evaluateForDedupe(line 44-68) checks `codexConverged` from plan and implement receipts. If both were written under review-loop-bypass with L2 forced skip, both will have codex_verdict='converged' (or the new distinct value if that's added). The dedupe logic will approve `skip_safe=true` and PR-codex will not run — dual-review is fully aborted, not just L2-retried. Mitigation: dedupe must NEVER approve skip when either upstream receipt has `meta.review_loop_bypass='true'` (require explicit bypass reason to be re-stated at PR step or fail-closed).
- **[HIGH][architect]** Three-gate flow fragmentation: Plan-review, prp-implement, and pr gates have independent decision oracles (plan-review/decide.js, implement-dispatch/route.js, pr-phase-helpers/finalize-receipt.js) with no shared bypass integration point. Bypass must thread through all three without introducing circular coupling. — aliases.js L27-35 shows three disjoint command→gate mappings (mccp:plan→mccp-plan-codex, mccp:prp-implement→mccp-implement-codex, mccp:pr→mccp-pr-codex). Each gate's decision logic is independent: plan-review/decide.js L140-278 composes L1+L2+L3 verdicts; pr-phase-helpers/finalize-receipt.js owns PR-stage approval. No orchestration point exists that could uniformly apply a 'bypass all rounds' policy across the three.

<details>
<summary>+32 more fan-out findings</summary>

- **[HIGH][architect]** L1 mechanical invariant preservation requires explicit guard: The PRD states 'L1 (mechanical) — 불가침. 토글과 무관하게 발화하고, 실패하면 토글이 켜져 있어도 HALT한다.' This must be enforced at every gate, but currently there is no centralized L1-override blocker. If bypass is injected at the wrong layer (e.g., after L1 verdict is serialized), L1 violations could leak through. — plan-review/decide.js L150-167 shows L1 verdict determines gate verdict; failure returns 'divergent' immediately. However, if bypass flag is checked in the command body before calling decide.js, the L1 verdict might be sealed without its force-block. Bypass must NOT suppress L1 return code—it must run unconditionally and halt iff L1 fails.
- **[HIGH][security]** Receipt audit trail for bypass reason lacks enforced validator; reason string can be minimal/empty and still stamp bypass, creating audit blind spot — PRD §Scope specifies 'suid가 봉인된 승인으로 남는다' but does not specify validator. Existing override reasons use plugins/mccp/scripts/receipt/lib/force-override-reason.js validateReason() with MIN_LENGTH=30, MIN_WORDS=3, placeholder rejection. The bypass reason MUST use equivalent validator (strict namespace) to prevent 'yes' / 'n/a' / placeholder stamps. Without this, receipts will record `reason='deferred_to_prd_completion'` with no _justifying_ text, making §3.14 CLAUDE.md 'evidence 없는 강등' gap unfilled.
- **[HIGH][security]** Environment-variable toggle state is not atomic across three gates; a race or env change mid-pipeline causes inconsistent single-pass behavior across plan/implement/pr — PRD §Scope requires 'three gates pass in single round' but does not specify how to enforce consistency when env vars can be read independently by three separate processes (plan.md / prp-implement.md / pr.md). plugins/mccp/scripts/state/toggle-snapshot.js captures snapshot at boot, but uses file-local session ENV not a locked state file. If operator toggles MCCP_REVIEW_LOOP_BYPASS between plan and implement, the plan bypasses L2 retry but implement enforces full R0-R3 — dual-review value is half-lost silently. Mitigation: receipt must stamp both (a) toggle value and (b) toggle presence timestamp, and chain preflight must verify all prior receipts had identical toggle_value or fail-closed.
- **[HIGH][security]** No enforcement that L1 (mechanical gates) remain unbypassable; PRD says 'L1 불가침' but implementation risks if eval/injection of enum value reaches gate decision logic — PRD §Scope states 'L1 (mechanical) — 불가침. 토글과 무관하게 발화하고, 실패하면 토글이 켜져 있어도 HALT한다.' This requires hardening in all three gates (plan-review/decide, impeccable-routing, pr-ship-gate) to structurally fail-closed on L1 findings regardless of toggle. Current codebases like plugins/mccp/scripts/lib/plan-review/decide.js and plugins/mccp/scripts/lib/pr-ship-gate.js do not yet reference a bypass-toggle; when new code adds it, must not allow bypass logic to permeate to the L1 check branches.
- **[HIGH][test]** Enum validation mechanism not defined - PRD lacks concrete oracle for fail-closed behavior when toggle has invalid value — PRD Scope line 58: states 'enum밖값은 fail-closed' but specifies neither validation layer, exit code, nor stderr/receipt channel. pr-codex-skip-env.test.js lines 66-108 show required pattern: strict validator + throw on invalid. This PRD lacks equivalent.
- **[HIGH][test]** Receipt field structure unspecified - which meta field holds bypass reason? Present-only? Validation rules? — PRD Scope line 48: says 'suid봉인된승인으로남는다' without naming the field. schema.js has no bypass_reason, bypass_enum, or single_pass_* field defined. Existing patterns: meta.codex_skip_reason (write.js) + meta.design_critique_verdict - this PRD defines no receipt axis.
- **[HIGH][test]** Cross-gate consistency untestable - no unit test proves toggle affects all three gates (plan, prp-implement, pr) uniformly or fails if one gate misses it — PRD Risks table line 96: risk='세게이트에흩어진배선이한축을빠뜨려부분적용된다' but acceptance criteria (Scope lines 40-48) only verify end-state. No CLI-level test like santa-loop-cap.test.js exists. Partial application would silently pass current criteria.
- **[HIGH][explorer]** Santa-loop firing decision point not located; critical seam for 'santa-loop doesn't fire' requirement — Grep found santa-loop invoked from commands/plan.md, commands/pr.md, commands/prp-implement.md but invocation logic (shell Step conditionals) not extracted. PRD §44 requires santa-loop to not fire when bypass is active. Without locating the decision hook, implementation cannot be verified to work across all 3 gates. This is the load-bearing integration seam.
- **[MEDIUM][architect]** Verdict enum expansion required: The current receipt verdict vocabulary (converged|divergent|critical|unavailable|skipped in schema.js L44) has no state for 'approved-despite-nonconvergence.' The PRD's Open Question about 'L2가 비수렴 verdict를 냈는데 통과시킨 경우' implies a new verdict or resolution field is needed, but adding one affects hash-based audit anchors (receipt_hash, decision_ledger). — schema.js L44 defines CODEX_VERDICT_VALUES as frozen enum. PRD Open Questions L84 explicitly asks how to stamp non-converged L2 verdicts when bypass allows passage. CLAUDE.md §1.2 'v1.20.3 무결성 복구' shows resolution.converged was deprecated in favor of resolution.codex_verdict for dedupe, suggesting verdict representation is a known fragile axis.
- **[MEDIUM][architect]** Santa-loop invocation boundary unclear: The PRD requires 'santa-loop — 발화하지 않는다' when bypass is active, but santa-loop is invoked at /mccp:pr Phase 2.5.5 as a conditional task. The bypass must prevent invocation itself, not merely suppress output or skip recording. Current gate doesn't have a pre-invocation bypass check. — PRD L44 'santa-loop — 발화하지 않는다' is a hard requirement. santa/counter.js and santa/gate.js own round capping and verdict logic, not invocation control. The invocation point (pr.md command body, workflow task definition) would need explicit bypass-aware conditional—this is not currently factored as a reusable boundary.
- **[MEDIUM][architect]** Backlog auto-population flow ownership undefined: M2 requires '미흡수 지적이 backlog에 자동 적재' but no architectural seam exists for this across the three gates. backlog.md is append-only; the trigger (which findings? at what gate stage?) and the population mechanism (who calls append?) are not defined in the codebase. — codex-findings-backlog.md exists but has no writer logic visible in plugins/ tree. PRD Scope L76-78 says M2 'depends on' M1 but does not specify WHERE (which gate) or HOW (which code path) findings flow to backlog. The backlog is currently written by humans in commit messages; M2 needs mechanical flow but no current seam exists.
- **[MEDIUM][architect]** Round counter interaction with bypass not architected: The bypass pins round=1 (R0 only) but current round counting is derived from ledger (santa/counter.js#decideRound). If bypass records a receipt with round=1 and the next session does NOT have bypass active, the ledger will see round=1 and permit R1+. Bypass must either persist in state or use a separate signal to prevent round increments in follow-up sessions. — santa/counter.js L50-60 decides allowed rounds based on roundsSoFar from ledger. PRD L45 requires 'R0만 돌고 R1 이상은 없다' but does not specify if this is a session-local constraint or ledger-bound. If bypass is a one-time flag (env var set once), the next session without that flag will see ledger.rounds=1 and allow R1.
- **[MEDIUM][architect]** Reason enum in receipt needs present-only audit field strategy: The PRD specifies 3 enum reasons (scope_too_small|deadline_pressure|deferred_to_prd_completion) that must be '봉인된 승인' in receipt. Adding these as receipt fields affects receipt_hash stability. Current present-only pattern (CLAUDE.md §3.12) carves out fields from hashing; these new fields need explicit carve-out policy or schema version bump. — schema.js L9 defines SCHEMA_VERSION='v1'. PRD L58 requires enum values to be fail-closed if invalid ('loud warn'); this validation must live in write.js or schema. Adding 3 new present-only reason fields requires either (a) schema v2 bump, (b) hash carve-out list extension, or (c) backward-compat present-only pattern. No policy is established yet.
- **[MEDIUM][architect]** L2 firing model during bypass not specified: The PRD says 'L2 승인 패널 — **1회 발화한다.** verdict가 비수렴이어도 진행을 차단하지 않는다.' It's unclear if L2 should be invoked at all when bypass is active, or if it should run but its non-convergent verdict should be ignored. If L2 is NOT invoked, the 'L1+L2 converged' proof cannot be sealed; if it IS invoked, cost is not saved (the whole point of M1). — PRD L46 says L2 'fires 1 time' (발화한다=is invoked) and L43-45 says santa-loop and round-repeat are disabled. The PRD does not explicitly say 'L2 skip' but also doesn't clarify what '1회 발화' means in the context of an R0-only gate. For cost savings, L2 should likely be skipped entirely when bypass is active.
- **[MEDIUM][security]** Enum validation for toggle value must be fail-closed with loud warning, but existing toggle patterns use silent clamping — this inconsistency creates risk of overt vs. covert bypass modes — PRD §Scope requires 'fail-closed + loud warn' for enum outside {scope_too_small, deadline_pressure, deferred_to_prd_completion}. Compare plugins/mccp/scripts/lib/tests/round-budget.test.js:17-21 `parseCap()` which silently returns 1 for invalid values; no loud warning. This pattern is mirrored in multiple gates but PRD explicitly rejects it. Implementation must add explicit validation layer that rejects invalid enum before receipt write, mirroring plugins/mccp/scripts/receipt/schema.js:84-85 `GATE_IDS` validation.
- **[MEDIUM][security]** Receipt JSON will contain toggle enum value; no masking/redaction of toggle name or value in toggle-snapshot or receipt logging, creating persistent audit trail of every bypass with reason and context — PRD requires reason '봉인' in receipt. plugins/mccp/scripts/state/toggle-snapshot.js line 74 masks override-reasons via SECRET_NAME_RE (/_REASON$|FORCE_PR_WITHOUT/) but MCCP_REVIEW_LOOP_BYPASS is not a *reason* toggle, it's a *mode* toggle with enum *value*. The enum value 'scope_too_small' / 'deadline_pressure' / 'deferred_to_prd_completion' is not a secret, but each receipt's `meta.review_loop_bypass_reason` will be permanently git-tracked and discoverable via grep. Policy question (out-of-scope for implementation): is this audit transparency acceptable? The choice is: (a) mask the enum value in logs and stamp only in receipt (§3.12 pattern), (b) audit transparency as-is, (c) add a separate audited-reason field like impeccable_force_override. Current plan has no guidance; recommend explicit masking rule in this specification before shipping.
- **[MEDIUM][test]** Round cap enforcement test absent - no test validates receipt shows santa-loop rounds limit when toggle set — PRD Scope line 45: 'R0만돌고R1이상은없다' but no test oracle. santa-loop-cap.test.js lines 169-186 test via readState(repo,slug).rounds.length - this PRD needs equivalent for proving single-round enforcement in actual receipt.
- **[MEDIUM][test]** L1 mechanical inviolability unchecked - toggle might inadvertently affect L1 validation despite intent, but no test proves L1 still blocks on mechanical failure — PRD Scope line 47: 'L1은여전히불가침' but supplies no test that L1 HALT still fires when toggle is set + mechanical error occurs. CLAUDE.md section 3.1: L1 stops receipt chain regardless - this needs unit test proof.
- **[MEDIUM][test]** Santa-loop skip validation missing - no test proves santa-loop does not fire when toggle set — PRD Scope line 44: 'santa-loop발화하지않는다' but no test oracle. santa-loop.md Step 1-3 and counter.js show CLI invocation path - plan.md Phase 5 and prp-implement.md 2.5.5a need explicit test gate proving skip when toggle active.
- **[MEDIUM][test]** L2 verdict non-blocking distinction untestable - PRD says L2 runs once but verdict does not block, yet no test oracle specifies how to observe L2 ran vs was skipped — PRD Scope line 46: 'L2승인패널은1회발화한다·verdict가비수렴이어도진행을차단하지않는다' but does not specify receipt field or CLI observable that proves L2 invocation + non-blocking outcome. Existing santa-adjudication.test.js + santa-gate.test.js have no equivalent non-blocking verdict axis.
- **[MEDIUM][test]** Backlog integration (M2) has no test acceptance criterion - uncaught findings must be appended to backlog, but no test validates M2 integration — PRD Delivery Milestones line 77: 'M2가없으면M1은부채를만드는기능이다' + lines 34-35: 'backlog에append된줄수==단일라운드가낸미흡수HIGH/CRITICAL수' but backlog.md scanning/append path is not tested. No mention of backlog validator or append-oracle.
- **[MEDIUM][test]** Plan/Implement command body integration points unspecified - which Phase/Step invokes the toggle decision? — PRD Scope describes desired behavior but not WHERE in plan.md (Phase 0-5?), prp-implement.md (Phase 0-5?), pr.md (Phase 0-3?) the bypass logic branches. Existing test patterns (design-critique-loop-e2e.test.js lines 72-89) simulate retry loop in code - this PRD needs command-body anchor points.
- **[MEDIUM][explorer]** Receipt schema already defines skip-reason vocabularies; new bypass reason enum must be coordinated with schema validation — plugins/mccp/scripts/receipt/schema.js and plugins/mccp/scripts/receipt/write.js show multiple present-only reason fields (codex_skip_reason, impeccable_skip_reason, intent_override_reason, etc.). plugins/mccp/scripts/receipt/lib/force-override-reason.js:23-45 (경로 정정) validates min length ≥30 chars and word count. PRD's 3 enum values (scope_too_small, deadline_pressure, deferred_to_prd_completion) are all ≥12 chars; need schema addition for new field.
- **[MEDIUM][explorer]** L2 approval panel must permit non-converged verdict to pass when bypass active; requires changes to approval oracle — plugins/mccp/scripts/lib/plan-review/decide.js:13-29 shows approval composition table where any non-pass L1 or non-quorum L2 = block. PRD §46 requires 'L2 verdict is non-converged but proceeds anyway'. Current logic treats L2 non-pass as verdict=divergent/unavailable→block. Reuse: the env-parsing + decision-parameter pattern exists (e.g., parseReviewMode), but the approval logic in decide.js must accept an optional 'bypass-active' parameter to downgrade L2 verdict from blocking to advisory.
- **[MEDIUM][explorer]** Round cap interaction with bypass toggle not specified but existing cap logic exists — plugins/mccp/scripts/lib/santa/counter.js + plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js show MCCP_SANTA_ROUND_CAP enforcement in `decideRound()`. PRD Open Question: 'MCCP_GATE_ROUND_CAP=2|3 simultaneous with bypass—priority?' The codebase has santa/gate.js `parseSeverityGate()` + plan-review round logic, suggesting bypass should be **checked before cap**, not interleaved with it. Reuse: existing cap-check gates.
- **[MEDIUM][explorer]** Existing override/skip mechanisms should be audited for duplication; PRD notes scatter but scope doesn't unify them — Existing mechanisms: MCCP_CODEX_DISABLED (first-class skip in codex-invoke.js:212), MCCP_PR_SKIP_CODEX_REVIEW (audited override), MCCP_SKIP_RECEIPT (receipt bypass), MCCP_SKIP_INTENT_GATE (intent bypass), design-critique SKIP override. PRD §65 explicitly scopes out 'unifying 5 existing toggles'. However, the new bypass should NOT add a 6th orthogonal mechanism. Reuse: follow existing pattern (e.g., `codex_skip_reason` precedence in codex-runner.js:234-238 where env canonical is fallback, caller explicit is primary). This bypass is explicitly single-responsibility: round/santa bypass only, not Codex disable.
- **[MEDIUM][explorer]** Receipt field naming convention must align with present-only meta/resolution axes — plugins/mccp/scripts/receipt/schema.js shows present-only fields: meta.codex_disabled, resolution.codex_verdict, resolution.review_verdict, meta.impeccable_routing_mode, intent_gate_force_override. New bypass receipt stamping should follow: which axis? (1) meta.bypass_active + meta.bypass_reason? (2) resolution.bypass_reason? (3) dedicated review_bypass + santa_bypass fields? PRD doesn't specify field names. Recommend: meta.review_loop_bypass (boolean) + meta.review_loop_bypass_reason (enum value), mirroring codex_disabled+codex_skip_reason pair.
- **[MEDIUM][explorer]** Missing plan from PRD: how 'basic path regression zero' assertion (#36) will be validated — PRD Success Metric #36 claims receipt corpus stays valid when bypass unset. Current test suites (plan-review-*.test.js, pr-codex-*.test.js, santa-*.test.js) must all pass in both bypass-unset and bypass-set modes. No mention of dual-test-mode or toggle snapshot testing (though toggle-snapshot.test.js exists). Risk: new bypass code path has no test coverage parity with base path.
- **[LOW][architect]** Bypass reason values could collide with existing skip-reason enums: The PRD's 3 reasons (scope_too_small, deadline_pressure, deferred_to_prd_completion) must not collide with existing skip-reason values used elsewhere (e.g., CLAUDE.md §1.2 'codex_disabled', §3.12 'codex_skipped_at_pr'). A flat enum namespace across all skip/bypass reasons invites accidental collision if bypass reasons are concatenated into the same field as Codex skip reasons. — PRD L52-56 defines 3 bypass reasons. CLAUDE.md §3.12 'v1.23.5 gate-guard-integrity M1' documents codex skip-reason namespace (skipped_at_pr, skip_proof_meta_keys, etc.) as present-only. If both mechanisms write to meta.skip_reason or similar, collision is possible. No namespace partition strategy is documented.
- **[LOW][architect]** Scaling boundary: bypass is 3-gate specific but may be requested for other workflows. No generic 'gate-level bypass' abstraction exists. If the pattern is useful for santa-loop or future gates, the architecture should avoid hardcoding bypass logic into each gate's command body. — PRD Scope L61-66 explicitly scopes bypass to the 3 gates (plan/implement/pr) and 'Not for' team-wide settings or other gates. However, no pattern is established for 'how to add bypass to future gates cleanly.' Adding bypass to a 4th gate would require reimplementing env-check + receipt-stamp + L1-guard in that gate's code.
- **[LOW][explorer]** Enum-based environment variable parsing pattern already exists and should be reused verbatim — plugins/mccp/scripts/lib/santa/gate.js:138-150 `parseSeverityGate(env)` and plugins/mccp/scripts/lib/plan-review/decide.js:57-66 `parseReviewMode(env)` both implement: (1) unset/null→default, (2) enum check with indexOf, (3) loud fail-closed warn on unknown value. PRD §40-59 specifies exact 3 enum values with fail-closed behavior.
- **[LOW][explorer]** Receipt sealed-reason forwarding mechanism already exists; reuse finalize-receipt.js pattern — plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:96-127 `deriveCodexFlags()` shows canonical pattern: (1) derive flags array conditionally, (2) push --flag-name and value separately, (3) forward to receipt CLI. Identical pattern appears for --codex-skip-reason. PRD requires reason sealed in receipt; this is the established path.

</details>

### Meta-gaps


- PRD does not specify whether L2 should be invoked when bypass is active. Current decision oracle assumes L2 invocation is tied to L1 pass; if bypass should skip L2 entirely, a new branching point is needed before L2 is queued.  _(architect)_
- Round counter persistence model: If bypass sets round=1 in a receipt, does the next session (bypass flag unset) see round=1 in ledger and assume R1 is allowed? State coupling between bypass sessions is not addressed.  _(architect)_
- Backlog population trigger and implementer: M2 requires 'findings → backlog' but no code path is specified. Which gate injects findings? At what phase? Does PRD M2 scope include building this flow, or is it assumed to exist?  _(architect)_

<details>
<summary>+22 more meta-gaps</summary>

- Bypass precedence vs. MCCP_GATE_ROUND_CAP: Open Question L83 asks 'bypass와 MCCP_GATE_ROUND_CAP=2|3이 동시 설정됐을 때의 우선순위.' Current design gives bypass hard precedence (→ R0 only) but this should be explicit in code.  _(architect)_
- Terminal ship gate verdict policy: PRD does not specify if bypass affects the `/mccp:pr` ship-gate verdict calculation (resolution.codex_verdict). If Codex returns 'divergent' but bypass is active, should receipt stamp 'converged' (lie) or introduce a new verdict state (schema change)?  _(architect)_
- Receipt audit anchor stability: Adding 3 new present-only fields (bypass_reason, bypass_active, bypass_session_id) requires verification that existing receipt_hash-based audit tools (evidence-audit.js, completion-ledger) continue to work. Hash carve-out scope must be documented.  _(architect)_
- Santa-loop receipt production: The PRD Open Question L86 asks whether mccp-santa-review receipt should be written when santa-loop is bypassed. If not written, will cross-gate dedupe or attestation logic break (expecting that receipt to always exist)?  _(architect)_
- PRD does not specify whether L2 verdict should be written as-is (converged=false) or mapped to a distinct enum value (converged_with_bypass=true / single_pass_approval=true). Current schema has convergence verdicts but no 'approved_under_bypass' status. This gap forces hard choice at implementation time: either accept that bypassed receipts will look convergent (audit risk) or add new schema field (§3.12 durability risk of receipt mutations).  _(security)_
- No specification of how `/mccp:archive-complete` should handle PRDs with milestone containing 'deferred_to_prd_completion' bypass claims. When PRD completion is checked, bypass receipts will show L2 divergent. Archive-complete must either (a) require explicit re-validation that deferred issues were actually checked, or (b) allow archive with a 'completion_validation_deferred' flag. Current code (plugins/mccp/scripts/lib/archive-complete/scan.js) checks milestone table only.  _(security)_
- Cross-operator audit gap: when operator sets MCCP_REVIEW_LOOP_BYPASS, no requirement that setting is logged to STATE.md or persisted as an audit marker. Toggle exists in env, is read once per command, and only stamp appears in receipt. An operator could set toggle, run chain, unset toggle, and another operator reading the receipt sees only the reason string, not that it was a one-shot bypass vs. a global setting. Recommend mandatory STATE.md annotation or session-ledger entry.  _(security)_
- No specification for case where L2 escalate happens after bypass is set. Example: plan R0 runs under bypass toggle (L2 skipped), but then new findings emerge requiring R1. Does the toggle stay active? Does L2 respect the toggle again? Recommend pre-flight check that specifies: toggle is consumed per-gate-invocation and must be re-set for each command if multi-command chain desired.  _(security)_
- PRD §Open Questions mentions '토글 사용률 대시보드' but out-of-scope. STATUS.md renderer (plugins/mccp/scripts/lib/renderer/) has no provision for filtering/surfacing bypass reasons. If audit becomes a compliance requirement, derived sources (toggle-usage.js) must be extended to aggregate and expose bypass claim frequencies.  _(security)_
- Enum validator implementation - which module owns validation of the three enum values? Fail-closed behavior spec (exit code, stderr, receipt)?  _(test)_
- Receipt schema extension - what are the present-only fields to add? Name, carve-outs, relationship to existing fields like resolution.converged?  _(test)_
- Command-body integration points - which Phase in each of {plan, prp-implement, pr} branches on toggle? How is it injected (env only, or CLI flag)?  _(test)_
- Backlog append path specification - existing backlog.md format? Which runner/tool appends findings? Deduplication with existing entries?  _(test)_
- L2 observable distinction - what receipt field or CLI output proves L2 ran but did not block? How to test non-blocking verdict?  _(test)_
- Cross-gate test oracle - single integration test that proves toggle state is read from env consistently across all three gates  _(test)_
- Round cap enforcement connection - which layer enforces santa-loop cap when toggle active? Is it reusing MCCP_SANTA_ROUND_CAP or separate?  _(test)_
- PRD does not specify exact integration seam where santa-loop invocation decision is made (shell step, bash conditional, or programmatic hook). Commands plan.md/pr.md/prp-implement.md invoke santa-loop but decision logic is embedded in shell conditionals, not extracted to a reusable oracle.  _(explorer)_
- PRD does not name the new receipt fields that will store bypass_active flag and bypass_reason enum. Recommendation: meta.review_loop_bypass (boolean) + meta.review_loop_bypass_reason (enum) following existing meta.codex_disabled + codex_skip_reason precedent.  _(explorer)_
- PRD does not specify priority when MCCP_GATE_ROUND_CAP=2 and bypass reason both active (Open Question acknowledged but left unresolved). Plan must decide: does bypass check happen before cap, or does cap limit bypass rounds too?  _(explorer)_
- PRD does not specify what L2 approval verdict should be written when bypass active and L2 is non-converged (Open Question §84 acknowledged but unresolved). Does receipt stamp verdict as 'converged' (misleading) or new value like 'bypassed'?  _(explorer)_
- PRD does not specify whether receipt is written at all when santa-loop is skipped due to bypass (Open Question §86 acknowledged). Does --decision-slug still get a mccp-santa-review receipt with 'not-fired' reason, or is receipt omitted entirely?  _(explorer)_
- No test matrix specified for dual coverage: bypass-unset baseline vs bypass-active path for plan-review, implement-codex, and pr-codex gates. Existing test suites (plan-review-*.test.js, santa-loop-cap.test.js) cover base paths; M1 acceptance requires coverage parity.  _(explorer)_

</details>

### Patterns to mirror


- plugins/mccp/scripts/lib/plan-review/decide.js:140-178 — L1 verdict check pattern: fail unconditionally on L1 verdict !== 'converged' before proceeding to L2. Mirror this boundary in bypass logic: L1 mechanical check is **never** skipped, even if bypass is active.  _(architect)_
- plugins/mccp/scripts/lib/receipt-mode.js (referenced in CLAUDE.md §3.2) — Env parsing + fallback + loud-warn-on-typo pattern: MCCP_RECEIPT_GATE_MODE parses env value, validates against enum, falls back to safe default on unknown value with stderr warning. Mirror this for bypass reason enum parsing.  _(architect)_
- plugins/mccp/scripts/receipt/schema.js L44 CODEX_VERDICT_VALUES — Frozen enum with present-only audit: Verdict values are immutable and tested exhaustively. Mirror this for bypass reason enum (scope_too_small|deadline_pressure|deferred_to_prd_completion).  _(architect)_

<details>
<summary>+23 more fan-out patterns</summary>

- plugins/mccp/scripts/lib/santa/counter.js:26-43 parseCap() — Env-to-cap parsing with explicit range validation: Validates input range, loud fail-open to default. Mirror this for bypass reason validation: invalid reason → fail-closed (treat as unset) + stderr WARN.  _(architect)_
- plugins/mccp/scripts/receipt/aliases.js (경로 정정) — Gate dependency matrix (ALIAS_MATRIX with requires_preceding): Documents which gates depend on which receipt types. If bypass needs to be threaded across all three gates, update aliases to reflect any new receipt dependencies or skip-gate patterns.  _(architect)_
- CLAUDE.md §3.12 'v1.23.5 gate-guard-integrity M1' — Present-only field audit pattern: codex_disabled_at_pr is present-only and proves skip legitimacy; bypass reason field should follow same audit discipline (present-only, audited against actual usage).  _(architect)_
- plugins/mccp/scripts/receipt/cli.js — Write-time flag parsing (--codex-disabled-at-pr, --codex-skip-reason): Multiple flags are parsed and merged into receipt fields. Mirror this pattern: add --bypass-reason CLI flag to write.js, validated against enum before stamping.  _(architect)_
- plugins/mccp/scripts/receipt/lib/force-override-reason.js#validateReason — strict namespace validation with MIN_LENGTH=30, MIN_WORDS=3, placeholder/filler banlist. Apply the same validator to the bypass toggle's reason string (if added), or stamp only the enum value itself and require the reason to be 30+ chars of substantive justification per CLAUDE.md §3.14.  _(security)_
- plugins/mccp/scripts/receipt/schema.js:84-85 — enum validation pattern (GATE_IDS array + indexOf check, fail-closed error message). Apply identical pattern to the three bypass-toggle values before receipt write; fail-closed + loud stderr warning for invalid enum.  _(security)_
- plugins/mccp/scripts/state/toggle-snapshot.js#SECRET_NAME_RE — regex-based masking of sensitive toggle names at snapshot time. Determine whether MCCP_REVIEW_LOOP_BYPASS or its value should be masked (recommend: mask in logs, keep in receipt for audit), and add to exclusions list with evidence comment.  _(security)_
- plugins/mccp/scripts/receipt/dedupe.js#evaluateForDedupe — cross-gate convergence proof. Mirror the structure to add an explicit bypass-check BEFORE approving dedupe: if either upstream receipt has bypass-flag, fail-closed unless bypass reason is re-stated at current gate invocation.  _(security)_
- plugins/mccp/scripts/receipt/write.js#stampIntentDecision — direct write exits (L150-172) null the mislabel axis explicitly rather than omit keys. When implementing bypass-toggle receipt field, follow this precedent: stamp the bypass enum value + reason even if L2 was skipped, so absence cannot be mistaken for 'receipt predates the field' (per §3.12 CLAUDE.md).  _(security)_
- plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:135-151 — env toggle capture and fail-open default with loud stderr on invalid  _(test)_
- plugins/mccp/scripts/receipt/tests/pr-codex-skip-env.test.js:49-127 — audited override reason validation (≥30 chars, ≥3 words, strict rules), throw on violation  _(test)_
- plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js:16-43 — captureNonDefault(env) pattern with secret-name redaction  _(test)_
- plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js:72-150 — receipt round/verdict stamp + chain-check validation via validateCommand  _(test)_
- plugins/mccp/scripts/receipt/tests/validate-cmd.test.js:17-43 — validateCommand integration test for gate preflight + missing receipt detection  _(test)_
- plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:333-357 — DD11 pattern: prove record/verdict exit 2 when round not open (mechanical enforcement)  _(test)_
- plugins/mccp/scripts/receipt/schema.js:1-200 — schema validator pattern for present-only fields with enum enforcement  _(test)_
- plugins/mccp/scripts/lib/santa/gate.js:138-150 — ENV parser (const raw=env[KEY], unset→default, string check, indexOf enum validation, loud warn on unknown, return value)  _(explorer)_
- plugins/mccp/scripts/lib/plan-review/decide.js:57-66 — Parallel ENV parser pattern (parseReviewMode) with typo fallback mode and canonical default behavior  _(explorer)_
- plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:96-127 — Flag derivation and forwarding pattern (build flags[], push name+value pairs, pass to receipt CLI)  _(explorer)_
- plugins/mccp/scripts/receipt/write.js:52-58 — Env precedence order (explicit --flag-name > env canonical, NOT the reverse) when both paths exist  _(explorer)_
- plugins/mccp/scripts/receipt/schema.js — Present-only field pattern for audit: new fields only serialized when set, absent=default, paired reason fields mirror (meta.X_active + meta.X_reason or resolution.X+X_reason)  _(explorer)_
- plugins/mccp/scripts/lib/plan-review/decide.js:40-104 — Approval oracle pattern (pure function, explicit composition table, no side effects, returns explicit {verdict, source, proof, reason} object)  _(explorer)_
- plugins/mccp/scripts/receipt/lib/force-override-reason.js (경로 정정) — Reason validation (min length, word count, no filler keywords, allowCodeVocabulary toggle for different contexts)  _(explorer)_

</details>

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/plan-codex-runner.js` (detached, fail-closed wrapper) · 모드 `MCCP_PLAN_REVIEW=codex` · `MCCP_GATE_ROUND_CAP=1`
- 라운드 수: **14** (R1~R14). R7~R14 여덟 라운드는 전부 **Validation 층**이었고 각 라운드가 직전 수정의 직접 결과였다 — 개별 fail-open 3건 → 뿌리(`set -e` 부재) → `set -e`가 만든 실행 불가 → 블록 분리 → 그 경계가 낳은 freshness 공백. 매 건이 실재 결함이었으나, **plan 문서의 완성도에는 상한이 없다**는 점을 늦게 인식했다: 이 층은 구현 시점에 실제로 돌리면 즉시 드러나므로 R14를 마지막 흡수로 삼고 이후 잔여는 backlog로 보낸다. 반면 R1의 hybrid L3 우회는 안 고쳤으면 잘못된 코드가 나왔을 축이다 — 그 둘을 같은 무게로 다룬 것이 이 여덟 라운드의 비용이었다.

  **저자가 스스로 멈추는 것에 의존하는 설계는 실패한다** — 이 게이트가 그 증거다. R13에서 "R14가 마지막"이라 선언하고 R14에서 예외를 뒀다. 매 건의 판단은 개별적으로 옳았고(실재 결함이었고 고칠 가치가 있었다) 누적으로는 비용이었다. "이 건은 고칠 가치가 있다"가 거의 항상 참이기 때문이며, 그래서 `MCCP_GATE_ROUND_CAP` 같은 **기계적 상한**이 필요하다. M1의 토글이 라운드 1회를 기계적으로 강제하는 것이 옳은 설계라는 직접 근거다. 각 라운드는 독립 호출이며, 흡수가 본문을 바꾸면 DD13 bind로 직전 봉인이 stale이 되므로 재봉인이 필요했다
- 합치 결론: **converged** — R6가 findings 0으로 반환했다(`intent_skip_proof: no_codex_findings`). R6가 봉인한 것은 **이 절을 고치기 이전의 본문**이다 — 이 절 자체가 R6 이후에 쓰였기 때문이다. 이후 라운드가 대체 봉인을 만든다.
- **어느 receipt가 현 본문을 봉인했는지는 이 절이 단정하지 않는다** — receipt 자신이 답한다(`plan_hash`). 직전 판(R7 HIGH, conf 0.99)은 여기에 "그 봉인이 현 본문과 일치한다"고 적었는데, **그 문장을 쓰는 편집이 plan hash를 바꿔 그 진술을 즉시 거짓으로 만들었다.** 같은 이유로 hash 값도 본문에 적지 않는다 — 적는 순간 바뀐다. 확인 방법은 `node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement --decision review-loop-bypass --plan <이 파일>`이 `stale: []`을 내는지 보는 것이다
- YAGNI Triage (라운드별, 전건 명시 판정):
  | R | Finding | Sev | Verdict | 요지 |
  |---|---|---|---|---|
  | R1 | hybrid quorum 실패가 L3 검증보다 먼저 성공 반환 | HIGH | ACCEPT_NOW | `decide.js:206`이 `:223-224`보다 앞서 hybrid L3 가드에 도달 못 함 → 완화 자격에 `mode !== 'hybrid' \|\| l3Corroborated(o)` 전제 |
  | R1 | Acceptance가 R0-only를 입증 못 함 | HIGH | ACCEPT_NOW | `halt_stage`는 마지막 실행만 담음 → dispatch 로그 축 신설 |
  | R1 | 거부된 santa-loop이 durable 감사 사실 없음 | MED | DEFER | §3.14 · DD5가 피한 축과 인접 |
  | R2 | 5.2 진입 purge가 재발화 흔적을 지움 | HIGH | ACCEPT_NOW | 저자의 R1 흡수가 만든 fail-open → purge 제거 + plan-hash keying |
  | R3 | 역불변식이 ambient `reason`으로 적용을 추론 | HIGH | ACCEPT_NOW | 저자의 R9(패널) 흡수가 DD3의 ambient/proof 분리를 깸 → 경로 판별자로 교체 |
  | R4 | `round_index`가 전체 로그 길이로 계산됨 | HIGH | ACCEPT_NOW | Task 1과 Task 8이 상호 모순 → hash별 계수로 통일 |
  | R4 | 역불변식이 proof 구조에 안 묶여 위조 통과 | HIGH | ACCEPT_NOW | hybrid + L3 divergent에 bypass 위조 가능 → `layers` 결속 |
  | R5 | hybrid 완화가 L3 증거를 버림 | HIGH | ACCEPT_NOW | source를 multi-agent로 뭉개 R4 검증이 산출물에 미도달 → `'hybrid'` + `layers.l3` 봉인 |
  | R6 | — | — | — | findings 0 (converged) — 편집 이전 본문을 봉인 |
  | R7 | 리뷰 기록이 R6 봉인을 현 본문의 것이라 단정 | HIGH | ACCEPT_NOW | 자기참조 오류 — 그 문장을 쓰는 편집이 hash를 바꿔 진술을 거짓으로 만듦 → 봉인 단정을 제거하고 receipt에 위임 |
  | R8 | 라이브 Acceptance가 불변식을 관측만 하고 단언하지 않음 | HIGH | ACCEPT_NOW | (a)가 `console.log`, (c)가 `; echo`로 exit status를 삼켜 어떤 결과에도 통과 → 단언 + `|| exit 1`로 교체 |
  | R9 | santa 거부 exit을 단언하지 않음 | HIGH | ACCEPT_NOW | R8 흡수가 (a)·(c)만 고치고 (b)를 빠뜨림 → status 포착 + `= 2` 단언. 이후 Validation 전수 조사로 잔여 0건 확인 |
  | R10 | `cli.js status`가 invalid receipt에도 exit 0 | HIGH | ACCEPT_NOW | 지적은 1건이었으나 **전수 감사로 3건** 발견 — `status` + (b)의 기준선 begin-round 미검사 + `BEFORE`/`AFTER`가 둘 다 빈 값이면 비교가 공허 통과. 셋 다 단언으로 교체하고 통과·실패 양 경로를 실행 검증 |
  | R11 | Validation 블록에 `set -e`가 없어 실패 후에도 계속 진행 | HIGH | ACCEPT_NOW | **부류의 뿌리** — R7~R10이 쫓던 개별 사례의 일반형. `set -eu` 추가 + `set -e`가 깨뜨리는 `REFUSE_EXIT=$?`를 `if` 포착으로 교체. `pipefail`과 슬래시 명령 `\|\| exit 1`은 근거를 적고 **의도적으로 미채택** |
  | R12 | `set -eu`가 슬래시 호출 때문에 블록을 실행 불가로 만듦 | HIGH | ACCEPT_NOW | 직전 흡수의 부작용 — 셸에서 그 토큰은 127로 중단되고 대화형이면 옵션이 경계를 못 넘어 **블록 수준 status 주장 자체가 불성립**. `set -eu`로 각각 보호되는 **두 블록 + 명시적 수동 경계**로 분리하고 양쪽 파싱·실패 경로를 실행 검증. 리뷰어가 `pipefail` 미채택은 옳다고 확인 |
  | R13 | 경계 이후 단언이 라이브 실행 성공을 증명하지 못함 | HIGH | ACCEPT_NOW | 고정 경로만 검사해 **낡은 산출물로 통과** — 블록 1이 `intent_run_nonce`를 freshness 토큰으로 저장하고 블록 2가 차이를 먼저 단언. |
  | R14 | freshness 토큰 경로가 수동 경계를 넘지 못함 | HIGH | ACCEPT_NOW | R13 수정이 블록 1의 셸 변수에 의존해 블록 2가 `set -u` 아래 unbound variable로 즉시 사망 — 검증 절차 전체가 실행 불가였다. 경로 재계산 한 줄로 수정하고 새 셸에서 3경로 검증 |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`
- **10건 중 9건이 저자의 직전 흡수가 만들었거나 저자가 쓴 줄에 있던 결함이었다.** 그중 **여섯**이 같은 부류다 — *관측을 통과 근거로 쓰는 fail-open*(임계 없는 관측 · 존재하지 않는 헤딩을 세던 grep · Acceptance 문언 축소 · dispatch 로그 purge · `console.log`/`; echo` · 그 수정이 빠뜨린 (b)). 같은 실수가 여섯 번 반복된 원인은 부주의가 아니라 **검증 줄을 쓰면서 그 실패 경로를 태워 보지 않은 것**이고, R8부터 실행 검증을 흡수의 일부로 삼고, R10에서는 지적된 한 건이 아니라 **부류 전체를 전수 감사**해 교정했다 — 그 감사가 리뷰어가 지적한 1건이 아니라 3건을 찾았다. R7~R10 네 라운드가 같은 부류를 한 건씩 쫓았고 R11이 마침내 그 **뿌리**(블록에 `set -e`가 없음)를 짚었다. 처음부터 부류로 훑고 뿌리를 물었다면 네 라운드를 아꼈다 — 이 게이트에서 라운드 반복이 실제로 소비한 것의 상당 부분이 그것이다. 이 관측은 PRD에도 값이 있다 — 이 게이트에서 라운드 반복의 절반 이상은 리뷰 대상의 결함이 아니라 **저자의 수정이 만든 결함**을 쫓고 있었다. 형태가 매번 같다 — *검증을 강화하려 넣은 장치가 자기 전제를 검증하지 않아 fail-open이 된다*. 이것은 PRD가 "라운드 반복이 시간 비용의 지배항"이라고 쓴 것에 한 겹을 더한다: 반복의 비용은 시간만이 아니라 **자기 수정이 만드는 새 결함**이고, 따라서 M1의 "단일 라운드"는 품질을 포기하는 선택이 아니라 이 되먹임을 끊는 선택이기도 하다
- 판정 라벨 — R1·R2·R4에서 리뷰어가 지목한 `UI<n>`을 저자가 `intent_conflict: "none"`으로 둔 건이 5건이고 전부 `intent_dispute_reason`으로 근거를 봉인했다(`id_mismatch` 0건). 사유는 동일하다: `intent_conflict`는 *finding이 제약과 충돌해 무릅쓰고 수용한다*를 뜻하는데(`intent-context.js:689-696`), 이들은 수용이 곧 제약의 **집행**이다. 그 dispute 비율(15건 중 7건) 자체가 §3.13.1이 M2 심판 분리의 근거로 지목한 신호이므로 backlog에 관측으로 남겼다
- receipt: `.claude/receipts/mccp-plan-codex/review-loop-bypass.json`

## Milestone Closure Provenance

- Milestone : review-loop-bypass-m1
- Verdict   : done (운영자 종료 판정 — acceptance (a)는 미충족 상태로 다음 plan 게이트에 이월)
- Closure   : .claude/milestone-closures/review-loop-bypass-m1.md
- sha256    : sha256:43199ca434379373607cd81596e556e0e1dacfd1b53f27a9cdc282896de73ebb
- Stamped at: 2026-08-18T07:12:48.708Z
