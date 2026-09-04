# Plan: review-record-linkage M4 — review-round-structure

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: M4 — review-round-structure
**Decision slug**: `review-record-linkage-m4` (명시 슬러그 — Risk R1. 기본 파생값 `review-record-linkage`는 M1이 커밋한 레코드를 덮어쓴다)
**Complexity**: Medium

## Summary

`record.js`가 `## Measurement` JSON에 `rounds`를 싣게 해서, M1이 D1으로 고정한 정의
(`measurement.rounds`가 정수 ≥ 1)를 착지 후 패널 레코드가 만족하게 한다. 값의 원천은
`write.js`가 `resolution.rounds`를 파생하는 것과 **같은 review-rounds 원장**이라 두 층이
같은 수를 말한다. 함께 못박는 것은 셋이다 — 0과 null의 구분, 캡을 강제한 원장과 레코드가
읽는 원장이 어긋났을 때의 관측, 그리고 dispatch 이전에 멎은 실행의 자격 판정.

오늘 실측: `round_structure: 0/42` (동결 코퍼스 전건 미보유). 라이브 파티션(HEAD, 레코드 68건)도 0이다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 과거 코퍼스는 소급하지 않는다. 재봉인도 사이드카도 만들지 않는다 | exclusion |
| UI2 | 라운드 구조 보유의 정의는 산문이 아니라 파서가 소유한다. 문서가 파서를 인용하지 그 반대가 아니다 | constraint |
| UI3 | 리뷰 레코드 내용 형식의 전면 재설계는 하지 않는다. 라운드 구조의 최소 계약만 정하고 나머지 서술 자유도는 유지한다 | exclusion |
| UI4 | acceptance는 producer가 아니라 산출된 실값이다. 배선 부재를 보는 test가 없으면 그 마일스톤은 완료가 아니다 | constraint |
| UI5 | 자식 브랜치는 plugin.json version을 선언하지 않는다. 번호는 릴리스 컷이 소유한다 | constraint |
| UI6 | 게이트 리뷰는 1라운드가 기본이다. plan을 다듬어 재리뷰하기보다 triage 후 진행한다 | direction |
| UI7 | 리뷰 finding은 HIGH와 CRITICAL만 그 자리에서 흡수하고 나머지는 backlog로 이연한다 | direction |
| UI8 | meta 계열 rounds 5종의 통합이나 정리는 이 사이클에서 하지 않는다 | exclusion |
| UI9 | 리드타임 목표치는 설정하지 않는다. 그 해석은 하류 자식이 소유한다 | exclusion |
| UI10 | backlog 표에 상태 열을 추가하지 않는다 | exclusion |

## 모듈 경계 (M3 선례를 그대로 승계)

정의는 하나가 소유하고 소비처는 호출만 한다. M4가 새로 만드는 모듈은 **없다**.

| 축 | 소유자 | M4가 하는 일 |
|---|---|---|
| D1 술어 (`hasRoundStructure`) | `linkage-defs.js` | **불변**. 값을 만드는 쪽이 이 술어를 import해 자기 산출물을 대조한다 |
| D1 자격 3값 (`classifyRoundStructure`) | `linkage-defs.js` | **신설**. D2(`classifyShipEligibility`)와 같은 모양 — 3값 + 사유 |
| 레코드 서명과 `## Measurement` 파싱 | `corpus.js` | 손대지 않는다 (M1 DD1a가 복제를 금지) |
| 레코드 생산 | `record.js` | measurement에 `rounds` 한 필드 추가 + 자기 대조 |
| I/O (원장 읽기) | `plan-review/cli.js` | `cmdRecord`가 읽어 순수 오라클에 주입 |
| 집계와 보고 | `linkage-audit.js` | 3값 집계 + 라이브 파티션 검사 종료코드 |

`record.js`에 원장 읽기를 넣지 않는 이유는 그 파일이 "Pure and dep-free … NEVER throws"를
계약으로 선언하고(`record.js:16-21`) 그 계약의 목적이 **계측이 승인을 막을 수 없게 하는 것**
이기 때문이다. M1 explorer가 같은 지적을 남겼다 — 링크 값은 `slug`/`planPath`처럼 `opts`로
주입한다. `linkage-defs.js`를 import하는 것은 이 계약을 깨지 않는다: 그 파일은 `require` 0건
이라 전이 의존이 0이고, M1 헤더가 "하류 milestone(M4)이 write-time 검증에 D1을 쓰려 하기
때문"이라며 이 용도를 명시 예약해 뒀다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 원장 읽기 (null-not-zero) | `plugins/mccp/scripts/receipt/write.js:59-96` | `readRoundLedgerState` — lazy require, 모듈 부재는 축 자체 생략, 판독 실패는 `null`(0 아님) + loud stderr |
| 3값과 사유 | `plugins/mccp/scripts/lib/plan-review/linkage-defs.js:150-186` | `classifyShipEligibility` — 부정 주장에는 사유를 요구하고, 사유가 없으면 `undecidable` |
| 주입 경계 | `plugins/mccp/scripts/lib/plan-review/cli.js:1223-1230` | `emitPanelFindings`가 `record.js`가 아니라 `cmdRecord`에 있는 이유(DD6)와 동일한 배치 |
| 부재 vs 0 서술 | `plugins/mccp/scripts/lib/plan-review/record.js:266-297` | `backlog_appended` — 부재는 `null`, 결손 여부는 **다른 사실이 정한다** |
| 자기신고 차단 | CLAUDE.md §3.13 (intent 결정은 CLI 표면을 갖지 않는다) | `--rounds` 플래그를 만들지 않는다 |
| test 관례 | `plugins/mccp/scripts/lib/tests/plan-review-record.test.js:59-143` | node native + 실제 `runCli` 호출 + tmp repo |
| test 실행 | CLAUDE.md §3.4 | `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <files>` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | UPDATE | `classifyRoundStructure` 신설(`halt_stage` 미참조 — R1 흡수). `hasRoundStructure`는 **불변** |
| `docs/review-record-linkage/` (경계 ref 상수의 거처) | UPDATE | DD7의 M4 착지 경계. M1의 동결 baseline 문서가 이미 이 디렉토리를 소유한다 |
| `plugins/mccp/scripts/lib/plan-review/record.js` | UPDATE | measurement에 `rounds` 추가 + D1 자기 대조 degradation |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `cmdRecord`가 원장을 읽어 주입 + 봉인 키 대조 |
| `plugins/mccp/scripts/lib/linkage-audit.js` | UPDATE | 3값 집계(라이브 파티션) + `--check-round-structure` 종료코드 |
| `plugins/mccp/scripts/lib/tests/linkage-defs.test.js` | UPDATE | 3값 분기 + 동결 술어 불변 단언 |
| `plugins/mccp/scripts/lib/tests/plan-review-record.test.js` | UPDATE | `rounds` 축 + measurement 키 집합 계약 + never-throw 재단언 |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | UPDATE | 3값 집계 + 종료코드 |
| `plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js` | UPDATE | 동결 블록 바이트 불변 (신규 필드가 라이브에만 나타난다) |
| `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | UPDATE | 5.-1 seal과 5.2h record가 **같은 파생**을 쓴다는 정적 단언 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래에 항목 추가 (UI5 — 번호를 부여하지 않는다) |
| `.claude/prds/review-record-linkage.prd.md` | UPDATE | M4 행 `pending` → `in-progress` + Plan 셀 |
| `docs/review-record-linkage/m4-enforcement-boundary.md` | CREATE | 위 디렉토리 행의 구체 파일. DD7 경계가 무엇을 가르는지·창의 정의·종료 코드·알려진 한계 |
| `.claude/reviews/plan-review-review-record-linkage-m4.md` | UPDATE | **Task 8의 산출물.** 이 파일이 곧 라이브 실값 acceptance다 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | §3.14 이연 채널. 게이트 2.5.4가 `DEFER_TO_BACKLOG` 항목의 적재를 요구한다 |
| `.claude/state/STATE.md` | UPDATE | 세션 연속성. hook이 쓴다 — 이 사이클이 편집하지 않는다 |
| `.claude/state/fix-task-applied.md` | UPDATE | 같은 축 |
| `.claude/plans/review-record-linkage-m4.plan.md` | UPDATE | 이 파일. 게이트 2.5.4가 `## Codex Implementation Review` 를 주입한다 |
| `.claude/PRPs/reports/review-record-linkage-m4-report.md` | CREATE | Phase 5 REPORT의 산출물 |
| `.claude/state/findings/review-record-linkage-m4.jsonl` | (상류 산출) | plan 게이트의 `emitPanelFindings` 가 남긴 것. 이 사이클이 쓰지 않는다 |
| `.claude/state/completion-ledger/review-record-linkage-m3__583a7bad868d.json` | (무관) | **M3 잔재다.** 이 사이클의 산출이 아니며 여기 적는 이유는 작업 트리에 있기 때문이다 |

> **이탈 기록 (implement 게이트, 2026-09-04).** 위 표의 아래 4행은 **구현 중에 추가**했다.
> `plan-conflict-detector.js`가 `file-expansion`으로 그 어긋남을 잡았고, 확인해 보니 결함은
> 구현이 아니라 **표 자체**였다 — plan이 자기 Task 8의 산출물(`plan-review-*.md`)도, §3.14와
> 게이트 2.5.4가 요구하는 이연 채널(`codex-findings-backlog.md`)도, hook이 쓰는 STATE 파일도
> 열거하지 않았고, `docs/review-record-linkage/`는 디렉토리로만 적혀 있었다. 즉 범위가 늘어난
> 것이 아니라 표가 처음부터 불완전했다. 탐지기를 만족시키려 표를 늘린 것이 아니라, 표를
> **사실과 일치시켰다** — 늘어난 4행은 전부 plan 본문이 이미 지시한 산출물이다.
>
> **추가로 이탈한 것 하나**: Task 8 실행 전에 기존 레코드를 `git commit`으로 보존했다
> (`c1b3bfa`). Task 8은 같은 슬러그로 재생성하라고 지시하고 그 대가로 `wall_clock_ms`가
> 재계산된다고 적으면서 "원본은 git 이력이 보존한다"고 했는데, 그 파일은 **untracked였다**.
> 즉 그 완화가 아직 거짓이었고, 커밋이 그것을 참으로 만든다. 재생성 결과는 별도 커밋
> (`19c1fc7`)이며, 그래야 `--check-round-structure`가 HEAD 트리를 읽어 실제로 판정할 수
> 있다(경계 검사는 작업 트리를 보지 않는다 — 그것이 우회를 막는 성질이다).

**변경하지 않는 파일과 그 이유**

- `plugins/mccp/scripts/lib/plan-review/corpus.js` — 레코드 서명과 펜스 파싱의 소유자다(M1 DD1a). M4가 자기 파서를 만들면 두 도구가 같은 코퍼스에 대해 다른 소속을 보고한다.
- `plugins/mccp/scripts/receipt/write.js` 와 `schema.js` — 결정층은 M2(dropped, 상류 출시)와 M3가 이미 닫았다. receipt 스키마 표면 변경이 0이므로 §3.12 no-rehash가 걸릴 일이 없다.
- `plugins/mccp/commands/plan.md` — 본문은 5.-1 seal과 5.2h record 양쪽에서 **이미 같은 `derive-decision` 파생**을 쓴다. 고칠 배선이 없으므로 산문을 늘리지 않고, 대신 그 성질을 정적 test로 고정해 미래의 편집이 둘을 조용히 갈라놓지 못하게 한다.
- `plugins/mccp/.claude-plugin/plugin.json` — UI5. `node scripts/version-declaration-guard.js`가 강제한다.

## Design Decisions

### DD1 — `rounds`의 원천은 review-rounds 원장이고, 그 의미는 "이 결정이 소비한 누적 라운드 수"다

`write.js:473-504`가 `resolution.rounds`를 같은 원장에서 파생한다. 다른 원천(패널
`dispatch-log-<slug>.jsonl`)을 쓰면 두 층이 다른 수를 말하고, 그때 어느 쪽이 맞는지 말해 줄
것이 없다 — M1이 정의 복제에 대해 세운 것과 같은 논거다. dispatch log는 여기서 쓰지 않는다:
그 `round_index`는 **같은 plan hash 안에서만** 증가해서(§3.16 IV1) plan을 고쳐 재리뷰하면
라운드로 보이지 않는다.

PRD Open Question 1("게이트마다 라운드 개념이 다르다")은 M4에서 **발생하지 않는다**. 패널
레코드를 쓰는 주체는 `/mccp:plan`의 5.2h 하나뿐이고 원장 키의 gate 축도 `mccp-plan-codex`
하나로 고정이다. 세 게이트를 하나의 정수로 접는 문제는 결정층(M2)의 것이었고 M4는 그 층을
건드리지 않는다. 이 판단을 여기 적어 리뷰어가 반증할 수 있게 둔다.

### DD2 — 원장은 `cmdRecord`가 읽고, gate id는 상수이며, `--rounds` 플래그는 만들지 않는다

`gateId`를 플래그로 열면 아무 셸 호출자나 다른 게이트의 원장을 가리켜 라운드 수를 부풀릴 수
있다. 이 서브커맨드는 패널 레코드만 쓰므로 `'mccp-plan-codex'`는 상수가 맞다. 값 자체를
받는 `--rounds`는 더 나쁘다 — 측정을 자기신고로 바꾼다(§3.13이 intent 결정에 CLI 표면을 주지
않은 것과 같은 이유).

### DD3 — 캡을 강제한 원장과 레코드가 읽는 원장이 어긋날 수 있고, 그것은 **관측 대상**이다

봉인(5.-1)은 `(gate, decision)`으로 캡을 강제하고, 레코드는 `--slug`로 원장을 찾는다. 저자가
슬러그를 명시 override하면(R1 완화가 요구하는 바로 그 행위) 둘이 갈라져 **캡이 강제된 원장과
다른 원장을 읽는다**. 이 사이클 자신이 그 조건에 있다.

닫는 방법은 봉인을 읽어 키를 대조하는 것이다 — `seal.readCap()`이 `gateId`와 `decisionId`를
돌려준다. 다만 **봉인을 주 키로 쓰지는 않는다**: 봉인은 git dir당 한 파일이고 `/mccp:pr`이
나중에 `mccp-pr-codex`로 덮어쓰므로, 사후 재생성 시점의 봉인은 이 실행의 것이 아니다. 그래서
주 키는 `('mccp-plan-codex', slug)`이고, 어긋남은 **degradation으로 표면화**한다. 값을 바꾸지
않는 이유는 어느 쪽이 옳은지 이 모듈이 알 수 없기 때문이다 — 모르는 것을 고르는 대신 말한다.

> **R1 흡수 (2026-09-03).** 초판은 그 degradation을 "봉인이 판독 가능하고 gate가 일치하는데
> decision만 다를 때"로 좁혔다. 그러면 **봉인 부재·만료·판독 불가**와 **다른 게이트가 덮어쓴
> 경우**가 전부 무표시로 지나간다 — 그런데 이 절 자신이 `/mccp:pr`의 덮어쓰기를 *예상된 일*
> 이라고 적었으므로, 정작 이 관측이 쓰여야 할 분기가 침묵한다(security·invariant MEDIUM).
> 상류 `write.js:52-58`은 같은 상황에 대해 정확히 반대로 한다 — 쓸 수 있는 봉인이 없으면
> "이 실행은 등록된 적이 없고 강제가 돌지 않았으므로 옆의 count는 authoritative하지 않다"를
> `meta.round_cap: null`로 **페어링해 남긴다**. 그 페어링을 레코드 층에서도 유지한다:
> degradation은 `reason !== 'ok'` · gate 불일치 · decision 불일치 **세 경우 모두**에서 나가고,
> 각 경우가 서로 구별되는 문장을 갖는다.

### DD4 — "기록 시점에 거부"는 문자 그대로 구현하지 않는다. 그 이탈을 여기 명시한다

PRD 지표 3의 "바꾸는 행동" 칸은 `record.js` 자체 검증 → 미달 형식은 기록 시점에 거부다.
그대로 구현하면 `record.js`가 throw하거나 `cmdRecord`가 비영점으로 끝나야 하는데, 그 파일의
never-throw · always-exit-0 계약은 **장식이 아니라 M1의 생존편향 결함을 고친 처방 자체**다
(`record.js:16-21` — 계측이 게이트를 죽일 수 있으면 그 계측은 첫 오발화 때 삭제된다). 막힌
실행일수록 느리고, 느린 실행일수록 표본으로 중요하다.

그래서 "거부"를 두 조각으로 나눈다.

1. **기록 시점** — `buildReviewRecord`가 자기 산출물을 `hasRoundStructure`로 대조하고, 미달
   이면 레코드 본문의 `### Recording degradations`와 stderr에 그 사실을 적는다. 레코드가
   자기 비적합을 **선언**한다. 게이트는 영향받지 않는다.
2. **강제** — `linkage-audit.js --check-round-structure`가 라이브 파티션에 `absent`가 있으면
   비영점으로 끝난다. 감사 도구는 게이트가 아니므로 여기서는 진짜로 막아도 안전하고,
   `## Validation`에 걸리므로 실효가 있다.

이것은 PRD 문장으로부터의 **의도된 이탈**이다. 리뷰어가 반박할 수 있게 근거와 함께 남긴다.

### DD5 — D1의 분모에 3값 자격을 도입하되, 과거 코퍼스 값은 1도 움직이지 않는다

> **R1 흡수 (2026-09-03).** 이 절의 초판은 `not_applicable`의 두 근거를 `rounds === 0` 과
> `halt_stage ∈ PRE_DISPATCH_HALT_STAGES`로 두고 "둘 다 봉인된 값이고 저자가 쓰는 값이
> 아니다"라고 적었다. **거짓이었다.** `halt_stage`는 `cli.js:1211`이 `--halt-stage`를 enum
> 검증 없이 받는 자유 문자열이고 `record.js:266-267`은 trim만 한다. 즉 면제 술어가
> caller-controlled였고, DD4가 유일한 강제 지점으로 지목한 `--check-round-structure`를
> 문자열 하나로 빠져나갈 수 있었다 — DD2가 `--rounds` 플래그를 거부한 바로 그 이유가
> 이 축에서 이미 열려 있었다(security·invariant HIGH). 아래는 그 근거를 **봉인된 패널
> 증거**로 교체한 판본이다.

dispatch 이전에 멎은 실행은 리뷰 라운드가 **실제로 0회**다. 그 레코드에 "라운드 구조 미보유"
라고 적는 것은 범주 오류다 — 구조는 있고 그 값이 없다. 그래서 D2와 같은 모양의 3값을 둔다:
`present` · `not_enrolled` · `absent`.

`not_enrolled`의 근거는 **caller가 쓸 수 없는 두 사실**이다 — (a) `rounds === null` 이고
(b) 그 레코드의 패널 증거가 비어 있을 때(`quorum === null`, 또는 `quorum.responded`가 0).
(a)는 원장 **파일 자체가 없다**는 파일시스템 사실이고(Task 4), (b)는 `l2.json`/`decision.json`
에서 파생돼 `record.js`가 스스로 계산하는 값이라 CLI 플래그가 아니다. `halt_stage`는 이제
어떤 자격 판정에도 쓰이지 않는다 — 사람이 읽는 서술로만 남는다.

이것이 분모 게이밍이 아니라는 근거는 **측정 가능**하다: 과거 레코드에는 `rounds` 키 자체가
없어 전건 `absent`이므로, 이 자격 도입 후에도 동결 baseline은 `0/42` 그대로다. 자격이 값을
올려 주는 대상은 오직 착지 후 레코드뿐이고, 그마저 실측상 희소하다 — 오늘 코퍼스 55건 중
dispatch 이전 halt는 **1건**(`plan-review-environment-uniformity.md`)이다.
`hasRoundStructure` 자체는 한 글자도 바꾸지 않으므로 UI2의 "정의는 파서가 소유한다"도 유지
된다 — 바뀌는 것은 정의가 아니라 그 정의를 적용할 **자격**이다.

### DD7 — 강제의 분모는 "라이브 파티션 전체"가 아니라 **M4 착지 경계 이후**다 (R1 흡수)

> 초판의 Task 5와 Acceptance는 `--check-round-structure`가 "라이브 파티션에 `absent`가 있으면
> 비영점"이면서 동시에 "Task 8 착지 후 exit 0"이라고 적었다. **동시에 참일 수 없다** —
> `linkage-audit.js`의 라이브 파티션은 HEAD 트리의 패널 레코드 **전건**이고(착지 시점 필터가
> 없다), UI1이 소급 주입을 금지하므로 기존 68건은 영구히 `absent`다. Task 8이 1건을 더해도
> 종료코드는 절대 0이 되지 않는다(architect·test HIGH 2건이 같은 축을 지목).

지표 3의 분모는 PRD가 "**착지 후** 발행분"이라고 이미 정해 뒀다. 없던 것은 그 "착지"를
기계가 아는 방법이다. M1이 동결 baseline에 대해 이미 그 장치를 갖고 있으므로(`--baseline-ref`)
같은 모양을 그대로 쓴다 — M4 착지 커밋을 가리키는 **경계 ref**를 도입하고,
`--check-round-structure`는 그 ref 이후에 추가·수정된 레코드에 대해서만 비영점으로 끝난다.
경계 이전 레코드는 **보고는 하되 강제하지 않는다**.

이 결정이 닫는 것은 "강제 범위와 지표 범위의 불일치"이고, 열지 않는 것은 소급이다 — 경계
이전을 통과시키는 것이 아니라 **애초에 목표를 갖지 않는 구간**임을 PRD 그대로 반영할 뿐이다.

### DD6 — `rounds` 하나만 넣는다. 보조 필드를 만들지 않는다

0 · `null` · 정수 셋이 이미 세 상태를 구분하고, *왜* 그 값인지는 degradation 문장이 나른다.
`rounds_source`나 `rounds_ledger_key` 같은 필드는 지금 읽을 소비처가 없다(UI9 — 해석은 하류
자식이 소유한다). 필요해지면 그때 만든다.

## Tasks

### Task 1: `linkage-defs.js` — D1 자격 3값화 (DD5 개정판)
- **Action**: `classifyRoundStructure(measurement)`를 신설한다. 반환은 `{ verdict, reason }`
  이고 verdict는 `present` / `not_enrolled` / `absent`. `not_enrolled`은 `rounds === null`
  이고 그 레코드의 패널 증거가 비어 있을 때만(`quorum === null` 또는 `quorum.responded`가
  `0`). **`halt_stage`는 읽지 않는다** — caller가 쓰는 자유 문자열이라 자격 근거가 될 수
  없다(R1 security·invariant HIGH). `PRE_DISPATCH_HALT_STAGES`도 **만들지 않는다**.
  `hasRoundStructure` · `ROUND_STRUCTURE_CONTROLS` · `classifyShipEligibility` ·
  `classifyLink`는 **한 글자도 바꾸지 않는다**. 순수 · dep-free · 총함수 계약 유지.
- **Mirror**: 같은 파일 `:150-186`의 `classifyShipEligibility` — 3값 + 사유, throw 없음.
- **Validate**: `rounds` 키 부재 · `null`+패널 증거 있음 · `null`+패널 증거 없음 · `0` ·
  `1` · `"3"`(문자열) · 배열 입력 각각에 대해 기대 verdict를 내고, **`halt_stage`를 임의
  문자열로 바꿔도 verdict가 불변임**을 단언한다(자기신고 면제가 닫혔다는 반증 test).
  `hasRoundStructure`의 반환이 M1 시점과 동일함을 함께 단언한다.

### Task 2: `record.js` — measurement에 `rounds` 추가
- **Action**: `opts.roundLedger`(주입된 판독 결과)를 받아 `measurement.rounds`를 만든다.
  판독 불가와 모듈 부재는 `null`이고 **절대 0이 아니다**. `rounds` 키는 항상 존재한다
  (부재는 "이 빌드에 축이 없다", `null`은 "관측하지 못했다" — `receipt_hash`의 M3 약정과 동형).
- **Mirror**: 같은 파일 `:266-297`의 `backlog_appended` — 부재는 null, 결손 여부는 다른 사실이 정한다.
- **Validate**: 주입 부재 / `{available:false}` / `{available:true,count:0}` /
  `{available:true,count:3}` 네 입력에 대해 `rounds`가 각각 `null` · `null` · `0` · `3`이고,
  `buildReviewRecord`가 여전히 어떤 입력에도 throw하지 않음을 단언한다.

### Task 3: `record.js` — D1 자기 대조 degradation (DD4의 1번)
- **Action**: `linkage-defs`의 `classifyRoundStructure`를 import해 방금 만든 measurement를
  대조한다. `absent`면 degradation을 push한다(관측값과 D1 정의를 문장에 담는다).
  `not_applicable`이면 degradation을 push하지 **않는다** — degradation은 "덜 기록됐다"는
  뜻이므로 정상 상태를 거기 적으면 진짜 결손이 그 노이즈에 묻힌다.
- **Mirror**: 같은 파일의 `note(...)` 패턴 + `linkage-defs.js` 헤더가 예약한 write-time 소비.
- **Validate**: `absent` 레코드가 degradation 문장을 갖고 **exit 0으로 기록되며**,
  `not_applicable` 레코드는 그 문장을 갖지 않음을 단언한다. throw 부재를 함께 단언한다.

### Task 4: `cli.js cmdRecord` — 원장 읽기와 봉인 키 대조 (DD2 · DD3)
- **Action**: 지역 헬퍼로 `../review-rounds/ledger`를 lazy require한다. **`count()`를 바로
  부르지 않는다** — `resolveStatePath({gateId, decisionId, cwd, repoRoot})`(이미 export됨,
  `ledger.js:259-270`)로 원장 경로를 얻어 `fs.existsSync`로 **파일 존재를 먼저 판정**하고,
  없으면 `{available:false}`(→ `rounds: null`)로 접는다. 파일이 있을 때만 `count()`를 부르고
  그 정수를 싣는다. 이어서 `seal.readCap` 결과를 대조해 `reason !== 'ok'` · gate 불일치 ·
  decision 불일치 **세 경우 모두** `extraDegradations`에 서로 구별되는 한 줄을 넣는다(DD3
  개정판). `--rounds`·`--ledger-decision` 류 플래그는 만들지 않는다.
- **Mirror**: `receipt/write.js:59-96` `readRoundLedgerState`(lazy require · 판독 실패는 null)
  + 같은 파일 `:52-58`의 "봉인 없음 ↔ count 비authoritative" 페어링 + `:1223`의
  `emitPanelFindings` 배치(I/O는 cli, 순수는 record).
- **왜 존재 검사를 먼저 하는가 (R1 흡수)**: 초판은 `count()`의 throw만 보고 "판독 불가는
  null"이라 적었는데, **원장 파일 부재는 throw가 아니라 정수 0으로 접힌다** —
  `ledger.js:187-198`이 `readFileSync` 실패를 `raw=null`로 삼키고 `parseState`가
  `emptyState`(`rounds: []`)를 돌려주므로 `count()`가 0이다. throw는 오직 손상 JSON뿐이다.
  즉 초판대로면 "측정된 0회"와 "애초에 세어진 적 없음"이 measurement에서 구분되지 않고,
  그 구분 불가능한 0 위에 DD5의 자격이 서게 된다(architect MEDIUM · test HIGH · invariant HIGH).
- **Validate**: tmp repo에서 (a) 원장 파일을 손으로 놓고 `runCli(['record', …])` → measurement가
  그 수를 담는다, (b) **원장 파일 부재** → `rounds`가 `null`이고 `0`이 **아니다**,
  (c) 손상 JSON → `null` + degradation, (d) 봉인 부재 / (e) gate 불일치 / (f) decision 불일치
  각각에서 서로 다른 degradation 문장이 나온다. 여섯 경우 모두 exit 0.

### Task 5: `linkage-audit.js` — 3값 집계와 검사 종료코드 (DD4의 2번)
- **Action**: 라이브 파티션의 `round_structure`에 `present` / `not_enrolled` / `absent`
  카운트를 더한다(**보고**). 동결 baseline 블록의 **수치 필드는 손대지 않는다**.
  `--check-round-structure [--since <ref>]`를 더하되 **강제 분모는 M4 착지 경계 이후**로
  한정한다(DD7): `<ref>..HEAD`에서 추가·수정된 `.claude/reviews/plan-review-*.md`만 판정 대상
  이고, 그 안에 `absent`가 1건 이상이면 비영점으로 끝나며 해당 경로를 나열한다. 경계 이전
  레코드는 개수만 보고한다. `--since`가 없으면 `docs/review-record-linkage/` 가 소유하는
  M4 경계 ref 상수를 쓴다(M1의 `--baseline-ref` 선례와 동형).
- **Mirror**: 같은 파일 `:839`의 `exitCodeForState` + `:560` 근처의 동결/라이브 파티션 분리 경고
  + M1의 `--baseline-ref` 경계 장치.
- **왜 경계가 필요한가 (R1 흡수)**: 초판은 "라이브 파티션에 `absent`가 1건이라도 있으면 비영점"
  과 "Task 8 착지 후 exit 0"을 **동시에** 적었다. 라이브 파티션은 HEAD 트리의 패널 레코드
  전건이고(`linkage-audit.js`의 post_baseline에 착지 시점 필터가 없다) 기존 68건은 UI1 때문에
  영구히 `absent`이므로, 두 문장은 동시에 참일 수 없었다(architect HIGH · test HIGH).
- **Validate**: 동결 블록 바이트가 변경 전후 동일함을 단언한다(`linkage-frozen-baseline.test.js`).
  경계 **이전**에만 `absent`가 있는 fixture에서 exit 0, 경계 **이후** `absent` 1건을 심은
  fixture에서 비영점임을 단언한다 — 두 방향을 모두 걸지 않으면 경계가 fail-open이 된다.

### Task 6: 형식 최소 계약 test (UI3 — 최소 계약만)
- **Action**: measurement의 **키 집합**을 test가 리터럴로 고정한다 — `verdict` · `source` ·
  `layers` · `quorum` · `wall_clock_ms` · `halt_stage` · `backlog_appended` ·
  `backlog_skipped_nonblocking` · `granted` · `reviewed_plan_hash` · `plan_path` ·
  `receipt_hash` · `recorded_at` · `rounds`. 키의 삭제와 개명이 붉어진다. 서술 본문(Findings와
  Refutation 표의 자유 문장)에는 아무 제약도 걸지 않는다.
- **Mirror**: `linkage-defs.test.js`가 `isPanelRecord`의 **부재**를 단언하는 구조적 가드와 같은 형태.
- **Validate**: 키를 하나 지우면 test가 실패하는 것을 실제로 확인한다(일시 편집 후 되돌림).

### Task 7: 배선 부재를 보는 test 2종 (UI4)
- **Action**: (a) 정적 — `plan-review-command-body.test.js`에 `plan.md`의 5.2h `record` 호출이
  `--slug`를 **넘긴다**는 것과, 5.-1 seal이 같은 `derive-decision` 파생을 쓴다는 단언을 더한다.
  (b) e2e — `child_process.spawnSync`로 실제 `cli.js record`를 tmp repo에서 띄워, 디스크에
  쓰인 `.claude/reviews/plan-review-<slug>.md`를 `corpus.parseRecord`로 읽고
  `classifyRoundStructure`가 `present`를 내는지 단언한다.
- **Mirror**: PRD Risks의 "정적 단언 + 실제 spawn e2e" 요구. 기존 test 파일의 tmp repo 패턴.
- **(a)가 무엇을 못 잡는지 명시한다 (R1 흡수)**: 이 사이클의 실제 어긋남은 본문 편집이 아니라
  **런타임 `--slug` override**(R1 완화)에서 왔고, 정적 단언은 그것을 볼 수 없다 — 본문이
  동일한 채 런타임 슬러그만 갈라지는 방향은 통과한다(test MEDIUM). 그 방향을 실제로 막는
  것은 Task 4의 봉인 대조 degradation이므로, (a)는 "본문 배선이 존재한다"만 주장하고
  런타임 축의 반증 test는 **Task 4의 (d)(e)(f)**가 소유한다. 두 test가 같은 것을 지킨다고
  적으면 어느 쪽도 지키지 않는다.
- **Validate**: (b)는 `runCli` 직접 호출이 아니라 **spawn**이어야 한다 — in-process 호출은 모듈
  해석 실패를 못 잡는다.

### Task 8: 라이브 실값 산출 (UI4의 acceptance)
- **Action**: 구현 착지 후 이 사이클의 실제 `REVIEW_DIR` 아티팩트와 실제 원장을 상대로
  `node plugins/mccp/scripts/lib/plan-review/cli.js record --slug review-record-linkage-m4 --plan .claude/plans/review-record-linkage-m4.plan.md`
  를 실행해 `.claude/reviews/plan-review-review-record-linkage-m4.md`를 **같은 슬러그로**
  재생성한다.
- **슬러그를 바꾸면 안 되는 이유 (R1 흡수)**: 초판은 `-postimpl` 접미 슬러그를 지시했는데,
  원장은 `<gateId>__<decisionId>`로 키잉되고 `decisionId`가 곧 `--slug`이므로 그 이름의
  원장 파일은 **존재하지 않는다**. Task 4 개정판대로면 `rounds`가 `null`로 접히고(초판대로면
  `0`), 어느 쪽이든 `classifyRoundStructure`는 `present`를 내지 못한다 — 즉 이 마일스톤의
  유일한 "산출된 실값" acceptance가 자기 완화(R1)에 의해 구조적으로 달성 불가였다
  (architect HIGH · test HIGH). 실제 라운드가 청구된 키는 `mccp-plan-codex__review-record-linkage-m4`
  하나뿐이므로(실측: `rounds_so_far=1`) 그 슬러그로 돌려야 한다.
- **덮어쓰기의 대가는 명시한다**: 재생성은 5.2h가 쓴 이 사이클의 벽시계(`wall_clock_ms`)를
  재계산값으로 대체한다. 판정 축(verdict · quorum · findings · plan_path)은 같은 아티팩트에서
  나오므로 불변이고, 원본은 **git 이력이 보존**한다. 별도 슬러그로 회피하지 않는 이유는 위와
  같다 — 회피하면 측정 자체가 성립하지 않는다.
- **Mirror**: PRD가 M1과 M3에 요구한 "산출된 실값" acceptance.
- **Validate**: 그 파일의 measurement가 `rounds` ≥ 1을 담고, `linkage-audit`의 라이브 파티션이
  `round_structure` present ≥ 1을 보고하며, **경계 이후 분모에 대해** `--check-round-structure`가
  0으로 끝난다(DD7).

### Task 9: PRD 표 갱신과 CHANGELOG (UI5)
- **Action**: PRD의 M4 행을 `pending` → `in-progress`로, Plan 셀에 이 파일 경로를 넣는다.
  `CHANGELOG.md`의 `## [Unreleased]` 아래에 M4 항목을 추가한다. `plugin.json` version은
  **선언하지 않는다**.
- **Mirror**: 우산 결정 1 + `CHANGELOG.md:13-18`의 명시 지시.
- **Validate**: `node scripts/version-declaration-guard.js`가 ok로 끝난다.

## Validation

```bash
# 1. 단위 + 계약 test (§3.4 — codex 경로 차단 필수)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/linkage-defs.test.js \
  plugins/mccp/scripts/lib/tests/linkage-audit.test.js \
  plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-record.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js

# 2. 인접 회귀 (record.js / cli.js 를 공유하는 test)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-partial-panel.test.js \
  plugins/mccp/scripts/lib/tests/linkage-link-receipt.test.js \
  plugins/mccp/scripts/lib/tests/linkage-wiring.test.js

# 3. 라이브 실값 (Task 8 착지 후에만 통과한다 — 그 이전의 실패는 정직한 부트스트랩 상태다)
node plugins/mccp/scripts/lib/linkage-audit.js
# 강제 분모는 M4 경계 이후다(DD7). --since 없이 호출하면 경계 상수를 쓴다.
#
# **이 사이클에서는 `--since` 를 명시한다** (local code-review M3). 기본 상수
# `2cb173c`(origin/main tip)는 이 브랜치의 조상이 아니라(fork point 는 `52e11d7`)
# 실효 창이 선언된 경계보다 넓고, 더 중요하게는 **머지 직후 기본형이 깨진다** —
# 상수가 main 의 조상이 되는 순간 창이 `2cb173c..HEAD` 로 넓어져 그 뒤 머지되는
# in-flight 브랜치의 pre-M4 레코드가 전부 분모에 들어온다. 실측(2026-09-04):
# `orchestrator-step-wiring` 1건 · `ci-full-suite` 2건이 전부 `rounds` 키 없이
# 대기 중이다. 그것은 boundary 문서가 「알려진 한계」로 이미 적은 성질이고 처방도
# 거기 있다(`--since` 로 그 사이클의 경계를 준다) — acceptance 명령이 기본형을
# 쓰면 며칠 안에 붉어지고, 그때 그것이 회귀인지 알려진 한계인지 가릴 장치가 없다.
BOUNDARY=$(git merge-base origin/main HEAD)
node plugins/mccp/scripts/lib/linkage-audit.js --check-round-structure --since "$BOUNDARY"; echo "exit=$?"

# 3b. 경계가 fail-open이 아님을 확인 (경계 이후 absent 를 심으면 비영점이어야 한다)
#     Task 5 의 fixture test 가 기계로 단언하므로 여기서는 재현 명령만 남긴다.

# 4. 동결 baseline 바이트 불변
git diff --stat -- docs/review-record-linkage/frozen-baseline.md   # 출력이 비어야 한다

# 5. version 미선언 (UI5)
node scripts/version-declaration-guard.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **R1 — 슬러그 충돌이 M1의 git-tracked 레코드를 덮어쓴다.** PRD 경로에서 파생되는 슬러그는 `review-record-linkage`이고 M1이 그 이름으로 커밋했다 | **높음** (기본 파생이 그렇다) | M3와 같은 완화 — 이 게이트와 이후 모든 M4 단계는 명시 슬러그 `review-record-linkage-m4`를 쓴다. **봉인(5.-1)도 같은 슬러그로 한다** — 안 그러면 R2가 즉시 발생한다 |
| **R2 — 캡을 강제한 원장과 레코드가 읽는 원장이 어긋난다.** R1의 완화가 슬러그를 override하는 순간 구조적으로 열린다 | **높음** (이 사이클이 그 조건이다) | DD3 — 주 키는 `('mccp-plan-codex', slug)`로 두고 봉인과 대조해 **관측**한다. 값을 임의로 고르지 않는다. Task 4의 Validate가 그 분기를 직접 단언 |
| **R3 — `ci-full-suite-m2`가 `plan-review/cli.js`를 공유 소유한다.** 실측: `git diff --name-only origin/main...ci-full-suite-m2`에 그 파일과 `l1-check.js`가 있다. PRD가 적은 `diverse-agent-review-m9`는 이미 머지돼 겹침이 0이다 | **높음** | 편집을 `cmdRecord` 국소로 한정하고 `l1-check.js`는 건드리지 않는다. 착수 직전과 `/mccp:pr` 직전에 그 브랜치 diff를 재확인한다 |
| **R4 — 계측이 게이트를 죽인다.** "기록 시점에 거부"를 문자대로 구현하면 `record.js`의 never-throw 계약이 깨진다 | **높음** (PRD 문장이 그렇게 읽힌다) | DD4 — 이탈을 명시하고 강제는 감사 도구 종료코드로 옮긴다. `buildReviewRecord`의 throw 부재를 Task 2와 3의 Validate가 각각 재단언 |
| **R5 — `not_applicable` 자격이 분모 게이밍으로 읽힌다** | 중 | DD5 — 두 기계 사실의 동시 성립을 요구하고, **동결 baseline이 `0/42`로 불변**임을 acceptance로 못박는다. 과거를 유리하게 만들지 못한다는 것이 측정으로 확인된다 |
| **R6 — 동결 baseline이 움직인다** (M3의 R3와 동형) | 중 | 신규 카운트는 라이브 파티션에만. Validation 4번 + `linkage-frozen-baseline.test.js` |
| **R7 — 새 필드를 만들었는데 라이브 실값이 0으로 남는다.** 이 저장소의 지배적 실패 모드이고 M2가 그것으로 dropped됐다 | **높음** | Task 8을 acceptance에 넣는다. test 통과만으로는 완료가 아니다 |
| **R8 — 이 게이트 자신이 R1과 R2를 밟는다** | 중 | 이 사이클의 5.-1 봉인과 5.2h record가 **둘 다** `review-record-linkage-m4`를 쓴다. 게이트 실행 후 `.claude/state/review-rounds/mccp-plan-codex__review-record-linkage-m4.json`의 존재로 확인 가능 |
| **R9 — 신규 test가 CI에 없다** (M3의 R9 상속) | 중 | `.github/workflows/`에 등재된 test는 셋뿐이라 강제는 `## Validation`의 로컬 실행이다. 새로 등재하지 않는다 — CI 편입은 `ci-full-suite` PRD 소관이다. 이 한계를 그대로 기록한다 |
| **R10 — 설치된 plugin 캐시가 M3보다 낡아 링크 축의 라이브 실값이 이 사이클에서 관측되지 않는다.** 실측: 이 게이트의 receipt에 `meta.plan_path`·`meta.review_record_path`가 부재하고, 게이트 본문은 캐시 `1.33.6`(M3는 `1.34.5`)에서 돌았다 | 중 | M4의 Task 8은 **워크트리 코드**를 직접 실행하므로 라운드 축은 영향받지 않는다. 링크 축은 `claude plugin update` 후의 사이클이 관측한다 — M4의 acceptance로 삼지 않는다(그것은 M3의 축이고 이미 ship됐다). 이 한계를 R1 흡수 절에 그대로 기록한다 |
| **R11 — 흡수가 receipt 봉인 뒤에 일어나 `reviewed_plan_hash`가 흡수 이전 판본을 가리킨다** | **확정** (이미 발생) | 위조가 아니라 순서의 결과다 — 이 저장소의 구조적 staleness이고 `prp-implement` 2.5.4가 같은 어긋남을 다시 만든다. 무엇이 언제 바뀌었는지는 R1 흡수 절의 8행 표가 나른다. implement 게이트는 plan이 아니라 **실제 diff**를 리뷰하므로 흡수분이 그 축에서 다시 검증된다 |

## R1 흡수 — 패널 4/4 fail (2026-09-03)

L2 패널(architect · security · test · invariant)이 **전원 fail**했고 blocking 12건이
[codex-findings-backlog.md](codex-findings-backlog.md)에 기계 적재됐다(`backlog_appended: 12`).
§3.16대로 **라운드를 늘리지 않고** §3.14 임계(HIGH·CRITICAL 즉시 흡수)로 처리했다.
receipt는 `review_verdict: divergent`를 **그대로 봉인**했고 `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`
으로 진행했다 — 위장 없음, cross-gate dedupe는 닫힌 채이므로 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

이 절 아래의 본문은 **흡수 후** 판본이다. 편집이 receipt 봉인 **뒤**에 일어났으므로 receipt의
`reviewed_plan_hash`(`sha256:b39fca3d…`)는 흡수 이전 판본을 가리킨다 — 이는 이 저장소의
구조적 staleness이고 모든 shipped 사이클이 겪는다(`prp-implement` 2.5.4의 plan 주입이 같은
어긋남을 만든다). 위조가 아니라 순서의 결과이며, 무엇이 언제 바뀌었는지는 이 절이 나른다.

| # | 지적 (severity · 관점) | 판정 | 흡수 |
|---|---|---|---|
| 1 | Task 8의 `-postimpl` 슬러그로는 원장 키가 존재하지 않아 `rounds ≥ 1`이 구조적으로 불가 (HIGH · architect·test) | **타당** | Task 8이 실제 원장 키 `review-record-linkage-m4`로 재생성. 덮어쓰기 대가를 명시 |
| 2 | `--check-round-structure`의 분모(라이브 파티션 전건)와 지표 3의 분모(착지 후)가 어긋나 exit 0이 영구 불가 (HIGH · architect·test) | **타당** | DD7 신설 — M4 착지 경계 ref 도입, 강제는 경계 이후에만. M1의 `--baseline-ref` 선례 동형 |
| 3 | `halt_stage`가 봉인값이 아니라 미검증 CLI 자유 문자열이라 `not_applicable`이 자기신고 면제 (HIGH · security·invariant) | **타당** | DD5 개정 — 자격 근거를 `rounds === null` ∧ **봉인된 패널 증거 부재**로 교체. `halt_stage`는 어떤 판정에도 미사용. `PRE_DISPATCH_HALT_STAGES` 폐기 |
| 4 | 원장 **파일 부재**는 throw가 아니라 정수 0이라 "측정된 0"과 "세어진 적 없음"이 구분 불가 (HIGH · test·invariant, MEDIUM · architect) | **타당** | Task 4가 `resolveStatePath` + `fs.existsSync`로 존재를 먼저 판정. 부재 → `null` |
| 5 | DD3의 degradation이 봉인 부재·gate 덮어쓰기 분기에서 침묵 (MEDIUM · security·invariant·architect) | **타당** | 세 경우 모두 서로 구별되는 문장으로 발화. `write.js:52-58`의 페어링을 레코드 층에 유지 |
| 6 | Task 7(a) 정적 단언이 실제 어긋남(런타임 `--slug` override)을 못 본다 (MEDIUM · test) | **타당** | (a)의 주장 범위를 "본문 배선 존재"로 좁히고 런타임 축은 Task 4의 (d)(e)(f)가 소유하도록 분리 명시 |
| 7 | Task 6의 Validate가 실행 가능한 검사가 아니라 수동 실험 (LOW · test) | **타당·이연** | backlog. 키 집합 단언 자체는 test 파일에 있고 `## Validation` 1번이 그 파일을 돌린다 |
| 8 | 레코드 파일명은 `sanitizeSlug`, 원장 조회는 raw slug — 정규화 불일치 (LOW · security) | **타당·이연** | backlog. 현재 호출자가 내는 슬러그는 두 규칙이 같은 결과를 내므로 발현 조건이 없다 |

### 이 게이트 실행에서 관측된 것 — M3 링크 필드가 이 receipt에 없다

발행된 `mccp-plan-codex/review-record-linkage-m4.json`에는 `meta.plan_path`도
`meta.review_record_path`도 **없다**. 결함이 아니라 **캐시 드리프트**다 — 게이트 본문은 설치된
plugin 캐시 `1.33.6`에서 도는데 M3는 `1.34.5`에 착지했으므로, 그 본문에는 링크를 봉인하는
단계 자체가 없다. M4의 라이브 acceptance(Task 8)는 **워크트리 코드**를 직접 실행하므로 이
드리프트의 영향을 받지 않지만, M3 링크 축의 라이브 실값은 캐시가 갱신된 뒤의 사이클에서만
관측된다. 아래 R10으로 등재한다.

## Out of scope (이 마일스톤이 하지 않는 것)

- **지표 2(층간 링크율)의 분모를 계산 가능하게 만드는 것.** `plan_review_expected` 생산자가 어떤 조건에 그 값을 켜는지는 PRD Open Question 5(chore ship 판별)에 걸려 있고, 오늘 라이브 84건이 전건 `undecidable`이다. M4의 outcome 문장은 라운드 구조만 말한다. **명시 이연**한다.
- **`resolution.rounds`(결정층) 축.** M2가 dropped됐고 상류가 출시했다.
- **과거 레코드에 `rounds`를 소급 주입하는 것** (UI1).
- **리뷰 서술 본문의 형식 제약** (UI3).

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트와 경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과는 경로 작동과 다르다)
- [ ] **라이브 실값**: `.claude/reviews/plan-review-review-record-linkage-m4.md`가 그 `## Measurement`에 `rounds`를 정수 ≥ 1로 담는다 (Task 8 — 슬러그는 원장 키와 같아야 한다)
- [ ] **집계 반영**: `linkage-audit`의 라이브 파티션이 `round_structure` present ≥ 1을 보고한다
- [ ] **경계 강제**: `--check-round-structure`가 **M4 경계 이후** 분모에 대해 exit 0이고, 경계 이후 `absent`를 심으면 비영점이다 (DD7 — 두 방향 모두)
- [ ] **자기신고 면제 부재**: `halt_stage`를 임의 문자열로 바꿔도 `classifyRoundStructure`의 verdict가 불변이다 (R1 security·invariant HIGH의 반증)
- [ ] **0과 null의 구분**: 원장 **파일 부재**에서 `rounds`가 `null`이고 `0`이 아니다 (R1 architect·test·invariant의 반증)
- [ ] **동결 불변**: 동결 baseline의 수치 필드가 바이트 단위로 불변이고 `round_structure`가 여전히 `0/42`다 (R5의 반증 자료)
- [ ] **never-throw 불변**: `buildReviewRecord`가 임의 입력에 throw하지 않고 `cli.js record`가 모든 경로에서 exit 0이다
- [ ] **version 미선언**: `node scripts/version-declaration-guard.js`가 ok다 (UI5)

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~54k.

### Findings (severity-ranked)

- **[CRITICAL][explorer]** buildReviewRecord/record.js is the single writer for .claude/reviews/plan-review-<slug>.md and already writes the ## Measurement JSON fence (which is what D1 reads via corpus.parseRecord). M4 plan should extend this existing writer, not create a parallel record-writing path. — plugins/mccp/scripts/lib/plan-review/record.js:194-204 and :407-415 (writes ## Measurement fenced JSON) — measurement.rounds is NOT currently populated by this builder (no rounds key at :305-342)
- **[HIGH][security]** PRD's no-rehash / present-only invariant (Decision 1, UI2/UI16) is the correct control against a real risk: any future milestone that adds fields to receipt writes must keep them out of makeSkeleton, or historical receipt_hash values in the git-tracked audit corpus break, silently invalidating the durability contract in CLAUDE.md 3.12. — PRD lines 88-90 (Decision 1) and CLAUDE.md 3.12 no-rehash invariant section
- **[HIGH][test]** No draft plan exists yet for this fan-out (PRD says only M4 `review-round-structure` remains pending), so the actual validation-strategy risk is that M4 must enforce write-time conformance to M1's parser definitions inside `record.js`, but `record.js`'s header contract explicitly states it 'NEVER throws' — M4 needs a test asserting rejection of non-conforming format happens somewhere in the write path without violating that no-throw invariant, and the draft plan must resolve where (caller vs record.js) that check lives before a 'Validate' step can be written. — plugins/mccp/scripts/lib/plan-review/record.js:16-21 ('buildReviewRecord NEVER throws') vs PRD line 75: 'record.js 자체 검증 → 미달 형식은 기록 시점에 거부' (Success Metrics row 3, 읽는 주체 → 바꾸는 행동 column)
- **[HIGH][test]** PRD Risk table's mitigation for the dominant failure mode ('새 통로를 만들었는데 게이트가 안 부른다') mandates two specific test types per milestone — a static assertion that the call-site line exists in the command body, AND a real spawn e2e — but M1/M3 precedent plans only show Node-native unit tests for pure modules (linkage-defs/linkage-audit), with no visible pattern for the command-body static-line assertion in the repo scan performed here. The upcoming M4 plan needs to specify both test kinds explicitly or repeat the M2-dropped pattern where 'producer exists' was mistaken for 'acceptance'. — PRD line 156: '배선 부재를 보는 test(본문에 호출 줄이 실재하는지의 정적 단언 + 실제 spawn e2e)가 없으면 그 마일스톤은 완료가 아니다'; M1 plan line 66 only lists `linkage-{audit,defs}.test.js` unit tests, no static command-body assertion or spawn e2e listed in the snippet examined
- **[HIGH][explorer]** D1 (hasRoundStructure — round-structure definition) already exists and is dep-free/pure. M4's outcome ('record.js가 M1의 파서 정의를 만족하는 형식으로만 기록') must call defs.hasRoundStructure from linkage-defs.js rather than re-deriving a definition — the file's own header explicitly reserves this contract for M4. — plugins/mccp/scripts/lib/plan-review/linkage-defs.js:25-29,54-59 — '하류 milestone(M4)이 write-time 검증에 D1을 쓰려 하기 때문'
- **[HIGH][explorer]** Panel-record recognition and Measurement-fence parsing are explicitly owned by plan-review/corpus.js and linkage-defs.js deliberately does NOT re-implement it. A draft plan for M4 that adds its own record-signature/parsing logic would duplicate an owner M1 already fixed by explicit prohibition. — plugins/mccp/scripts/lib/plan-review/linkage-defs.js:14-21 — '패널 레코드 서명 판별 … 파싱은 corpus.js가 이미 소유한다' and linkage-audit.js:69,424 (corpus.parseRecord(rec.text))
- **[MEDIUM][architect]** No draft plan exists yet for the next open milestone (M4 review-round-structure); the PRD leaves the concrete write-time format contract undefined. The read-side definition already implemented (linkage-defs.js hasRoundStructure) checks measurement.rounds as an integer >=1, but the PRD's own candidate-definitions table (A-E, heading/token based, 4.2%-59.2% spread) never states which textual/structural form M4's write-time enforcement in record.js must target. — plugins/mccp/scripts/lib/plan-review/linkage-defs.js:51-57 (hasRoundStructure via measurement.rounds integer) vs PRD lines 43-49 listing five candidate prose-based definitions without pinning which one M4 must enforce at write time. PRD line 113 says record.js should reject formats that don't satisfy 'M1's parser definition' but doesn't specify which artifact (Measurement JSON vs prose headings) is the enforced surface.
- **[MEDIUM][architect]** M4 will modify plan-review/record.js, the same file M3 already extended, and the PRD's own Risk table flags this file as shared with an in-flight sibling branch (diverse-agent-review-m9) requiring an ownership-boundary check before M3/M4 touch it. No such check is recorded for M4 since its plan does not exist yet. — PRD Risks table: 'in-flight diverse-agent-review-m9 가 plan-review/ 를 공유 소유한다 ... M3·M4가 record.js를 건드리므로 착수 전 그 브랜치의 소유 범위를 확인한다. M1·M2는 겹치지 않는다' (PRD lines 160-161).
- **[MEDIUM][architect]** M4's stated acceptance ('착지 후 리뷰의 커버리지가 100%가 된다') is a write-time enforcement guarantee, but the PRD explicitly forbids touching '.claude/reviews/ 내용 형식의 전면 재설계' (out of scope) and record.js's role per M1/M3 has so far been append-only (measurement fields). Introducing write-time rejection is a new class of behavior (record.js gains reject/HALT authority over review content) not present in M1 or M3's scope, and the PRD does not spell out what happens to a rejected write (retry? HALT the whole gate? fallback path?) — a control-flow boundary the plan must define before implementation, since record.js is invoked from three different gate command bodies (plan.md, prp-implement.md, pr.md per the codebase's dispatch pattern). — PRD Out of scope line 101: '.claude/reviews/ 내용 형식의 전면 재설계 — M4는 라운드 구조의 최소 계약만 정하고 나머지 서술 자유도는 유지한다.' PRD Delivery Milestones M4 row (line 113): 'record.js가 M1의 파서 정의를 만족하는 형식으로만 기록하고' — this is new authority (reject at write time) vs M1/M3's read-only/append-only role.
- **[MEDIUM][security]** PRD Open Questions 1 and 4 (what 'rounds' counts per gate; chore-ship classifier) are unresolved and directly gate M4's acceptance criterion that record.js only accept the parser-owned definition. If M4 proceeds without a code-owned, non-self-reported classifier for 'this ship has no plan review', the same failure mode M3 Task 5 explicitly rejected (promoting an unknown/absent signal to an authoritative false) could reappear in the write path record.js owns. — PRD lines 146-150 (Open Questions) and M3 plan Task 5 rejection of promoting 'unknown' to 'false' (review-record-linkage-m3.plan.md lines 157-158)
- **[MEDIUM][security]** finalize-receipt.js's plan_path anchor comparison is a normalized-string equality, not a filesystem/realpath resolution by design (per M3 plan Task 5) - this is a deliberate identity-not-content check, but it means the anchor trusts that meta.plan_path values were honestly derived upstream; any code path that lets an LLM-authored --plan value flow into meta.plan_path without the write.js machine derivation would let an unrelated milestone's review be claimed as this ship's approval evidence (the exact failure class R2/R3 reviewers caught in M3 and that this PRD's own Evidence section names as 'entweder true value or attacker-controlled self-report'). — review-record-linkage-m3.plan.md lines 105-107 (Task 1 fifth field explicitly given no CLI flag to prevent self-report) and lines 151 (normalized string equality, no realpath)
- **[MEDIUM][test]** Success Metric 3's acceptance oracle is defined as 'the parser definition is satisfied' but the definition-selection process in M1 already showed re-implementing the 'same' definition produces different values (Definition A: PRD claimed 3/71, M1 reproduction found 0/71). Any M4 test asserting '100% coverage of parser-defined format' is only meaningful if the test corpus used for measurement is pinned/frozen alongside the parser — otherwise coverage % is not reproducible across runs, repeating the exact 45.2%-not-reproducible failure the PRD calls out. — PRD lines 41-51 (definition-drift table) and M1 plan lines 61-73 ('같은 정의여도 구현이 다르면 값이 갈린다')
- **[MEDIUM][test]** The PRD explicitly instructs that regression baselines (frozen corpus of 71/75 past receipts) must never be re-hashed or re-verified against a live corpus (decision 1, out of scope: '과거 71건의 재봉인'), which means any M4 test that walks `.claude/reviews/*.md` live risks silently drifting the baseline if new reviews land during test runs — the test suite needs an explicit fixture/frozen-corpus boundary (as M1 apparently used, 'boundary tree') rather than scanning the live working tree, but this boundary mechanism is not evidenced as a reusable helper in the files inspected. — PRD line 78: 'M1이 멤버십을 경계 트리로 고정하면서 분모가 확정됐다'; PRD Out of scope line 97: '과거 71건의 재봉인 · 마이그레이션 · 사이드카'
- **[MEDIUM][test]** An Open Question left unresolved in the PRD ('rounds가 세는 것이 무엇인가 — 게이트마다 라운드 개념이 다르다') was scoped to be answered 'before M2 starts', but M2 was dropped entirely (upstream absorption) without that question being resolved in this PRD's own record — meaning the underlying semantic ambiguity of what 'a round' means per-gate was never actually tested/verified, only that a *channel* exists. Any M4 tests that assert on round *counts* (not just presence) inherit this unresolved semantic gap as an untested assumption. — PRD line 146: '`rounds`가 세는 것이 무엇인가 ... M2 착수 전에 답해야 한다'; M2 dropped per Delivery Milestones row 2 without evidence this question was independently closed
- **[MEDIUM][explorer]** linkage-audit.js already computes round_structure.selected/denominator/coverage over the frozen boundary tree using defs.hasRoundStructure — M4's acceptance metric (지표 3 커버리지) should read from/extend this existing aggregator's live/post-baseline partition rather than building a new coverage counter. — plugins/mccp/scripts/lib/linkage-audit.js:453-465 (pre_baseline round_structure) and :560-644 (live/post_baseline partition)
- **[MEDIUM][explorer]** D3 (link classification) and the M3 bidirectional-link fields (meta.review_record_path on receipt, measurement.receipt_hash on record) are already fully wired and consumed by linkage-audit.js's computeLinkage. M4 should not re-invent a join mechanism; the field-name contract (LINKAGE_FIELD_NAMES) is canonical and must be reused if M4 touches record-writing near these fields. — plugins/mccp/scripts/lib/plan-review/linkage-defs.js:153-158 (LINKAGE_FIELD_NAMES) and linkage-audit.js:297-348 (computeLinkage)
- **[MEDIUM][explorer]** record.js already documents the exact reason a rounds-like field wasn't added inline in earlier passes (measurement is written before the ship receipt exists) — this constrains where in the record.js call chain M4 can populate rounds: from panel/gate-side inputs available at write time, not a post-hoc back-patch like receipt_hash. — plugins/mccp/scripts/lib/plan-review/record.js:335-340 — 'M3 — the receipt-side of the bidirectional link. NEVER filled here: the record is written BEFORE the ship receipt exists'
- **[MEDIUM][explorer]** The PRD's frozen-baseline note references an upstream round-ledger mechanism (receipt/write.js, lib/codex-invoke.js:534, lib/plan-review/cli.js:348) already shipped via env-contract-integrity M3 that computes resolution.rounds on the ship-receipt side — a draft plan for content-layer rounds (M4) should confirm whether this ledger is reusable as the record-side measurement.rounds source too, to avoid two independently-counted round sources. — PRD lines 21-30 (2026-09-01 correction) — '(b) 증분 채널이 둘 실재한다 (lib/codex-invoke.js:534 Codex축 · lib/plan-review/cli.js:348 패널축)'
- **[LOW][architect]** M3 established the boundary that definitions live only in linkage-defs.js and consumers (record.js, link-receipt.js) must not reimplement predicates (UI4, mirrored explicitly in m3.plan.md's 'unchanged files' list). M4's outcome text ('record.js가 M1의 파서 정의를 만족하는 형식으로만 기록') risks collapsing that boundary if write-time validation logic is embedded directly in record.js instead of delegating to linkage-defs.js's exported predicate — the same drift pattern the PRD's decision #3 explicitly warns against ('정의는 산문이 아니라 파서가 소유한다'). — review-record-linkage-m3.plan.md 'Files to Change' unchanged-files note: 'plugins/mccp/scripts/lib/plan-review/linkage-defs.js(M1이 정의를 소유하고 M3는 소비만 한다 — UI4)'; PRD decision #3 (lines 92): '"라운드 구조 보유"의 정의는 산문이 아니라 파서가 소유한다 ... 파서가 문서를 따라가지 않는다'.
- **[LOW][security]** M3's path-containment hardening (resolveRecordForWrite, Task 4) is a strong shipped pattern: realpath-based, lstat-checks-symlink-leaf, no lexical fallback, dual containment against repo root and .claude/reviews. Any follow-on work (M4 review-round-structure) touching plan-review/cli.js or record.js should reuse this helper and the sanitizeSlug allowlist rather than re-deriving a denylist check. — plugins/mccp/scripts/lib/plan-review/cli.js:1260-1334 (resolveRecordForWrite) and record.js:77-85 (sanitizeSlug allowlist)
- **[LOW][security]** link-receipt CLI accepts --receipt-hash and --record with strict validation (sha256:[0-9a-f]{64} regex, repo-relative path plus realpath containment) - a solid baseline pattern for any new CLI surface M4 adds that accepts identifiers feeding path construction or hash comparison. — plugins/mccp/scripts/lib/plan-review/cli.js:1341-1349 (hash regex) and :1290-1333 (path containment)
- **[LOW][security]** Reason-bearing audited-override fields (no_plan_review_reason, link_evidence_skip_reason, MCCP_PR_SKIP_LINK_EVIDENCE) are free-text values sealed into the git-tracked ship receipt corpus; the plan cites strict validateReason reuse for link_evidence_skip_reason but PRD/plan text does not confirm the same strict validator applies to no_plan_review_reason, leaving a potential unvalidated free-text field permanently sealed into an audit artifact. — review-record-linkage-m3.plan.md Task 1: '(d) link_evidence_skip_reason이 있으면 strict validateReason을 만족하는 문자열일 것을 강제한다' -- no equivalent strict-validation clause is stated for no_plan_review_reason in the same list (c)
- **[LOW][explorer]** The five prose-token control definitions (A-E) used as the PRD's reproducibility counter-evidence already live in code as ROUND_STRUCTURE_CONTROLS, not just in the PRD table — a draft plan should cite/reuse this array rather than re-typing the 4.2%~59.2% table as new logic. — plugins/mccp/scripts/lib/plan-review/linkage-defs.js:66-95 (ROUND_STRUCTURE_CONTROLS array, ids A-E matching PRD Evidence table)

### Meta-gaps

- PRD/M4 outcome does not specify the write-time failure mode: does record.js refuse to write (throwing, blocking the gate) or does it silently coerce non-conforming content into the canonical format? This is a structural fork the plan must resolve before Task decomposition.  _(architect)_
- No explicit mapping from the five candidate round-structure definitions (A-E) in the PRD's own evidence table to the one actually encoded in linkage-defs.js's hasRoundStructure (which uses `measurement.rounds` integer, not a prose-heading form). The plan needs to state whether M4 targets the same integer-based definition or introduces a second definition for narrative content — and if the latter, why that isn't a second definition-owner violating decision #3.  _(architect)_
- No stated module boundary for M4 the way M3 explicitly answered '모듈 경계' for its own scope (extend linkage-audit.js vs new file). The next plan should carry the same explicit boundary statement so reviewers can verify UI4/decision-3 compliance up front rather than inferring it.  _(architect)_
- The Open Question in the PRD ('rounds가 세는 것이 무엇인가 — 게이트마다 라운드 개념이 다르다') was scoped to M2 (dropped) but the same ambiguity plausibly resurfaces for M4's round-structure format if different gates' review records encode round concepts differently (L1/L2/L3 vs Codex R1/R2 vs dedupe). The plan should state whether M4's format contract is gate-agnostic or per-gate.  _(architect)_
- Draft plan for the actual current milestone (M4 review-round-structure, status pending) was not yet written at fan-out time, so this review is grounded in the PRD and the already-shipped M3 plan/code rather than the milestone under active planning -- security findings specific to M4's new write surface in record.js could not be evaluated.  _(security)_
- PRD does not enumerate who/what can write to .claude/reviews/ review records outside the gate flow (e.g., could a malicious PR body or crafted Codex finding text inject content that corrupts the panel record parser's fence-based JSON extraction in corpus.js/record.js?) -- worth a targeted check when M4's plan lands.  _(security)_
- No explicit statement in the PRD about what happens if the receipt_hash sealed into a review record (M3's link-receipt) is later found to not correspond to the ship receipt it claims to link (e.g., a stale link left after a receipt is legitimately superseded) -- the PRD's Decision 1 forbids re-sealing, so a stale/incorrect link may be permanent; not addressed as a risk in the PRD's Risks table.  _(security)_
- No draft plan file exists yet at the path given to this fan-out — the 'test' lens has nothing concrete to review for task-level Validate steps; the parent session must first decide the milestone in scope (M4 is the only pending one) before task-level testability review is possible.  _(test)_
- PRD does not specify what 'chore ship' detection test coverage looks like beyond stating M1 already defined it — M4's plan needs to cite the specific predicate/function name from linkage-defs.js it will reuse, not redefine, to avoid a second definition (the PRD's own decision-3 anti-pattern).  _(test)_
- No edge-case discussion in the PRD for review files with zero rounds, malformed markdown tables, or partial/truncated writes during a crash mid-record — record.js explicitly documents 'the run blocked partway' as normal, but no test enumeration for that boundary is visible in the M1/M3 plan excerpts read.  _(test)_
- PRD Success Metric 1's residual case (Codex-not-invoked ships where round_ledger_count=0 but rounds stays literal 1 per schema floor) is explicitly deferred to C4 to decide how to count — no test currently pins this representational-limit behavior, so a future change to schema.js's `rounds >= 1` floor could silently break the documented distinction between 'not measured' and 'measured as zero' without any test catching it.  _(test)_
- No draft plan exists yet for this fan-out — investigation is speculative for whichever milestone is targeted (most likely M4 review-round-structure, since M1/M3 are 'complete' and M2 is 'dropped' per the Delivery Milestones table). The planning session should confirm the actual target milestone before treating these findings as scoped correctly.  _(explorer)_
- PRD does not fully detail the producer at lib/plan-review/cli.js:348 (panel-axis round increment channel) — the plan should trace that site to see what round counter is already available to feed into record.js's measurement block before inventing a new counter.  _(explorer)_
- linkage-audit.js and linkage-defs.js were both authored under this same PRD (M1/M3) and plugins/mccp/scripts/lib/tests/c1-coverage-gate.test.js exists but was not read in this pass — it likely already encodes the exact acceptance shape M4 needs; sibling perspectives should confirm.  _(explorer)_

### Patterns to mirror

- plugins/mccp/scripts/lib/plan-review/linkage-defs.js — single definition-owner module, zero `require`, total functions, undecidable states fold to null rather than guessing (pattern M4 must reuse for any new predicate rather than embedding logic in record.js).  _(architect)_
- review-record-linkage-m3.plan.md's explicit '모듈 경계' subsection (lines 43-49 of that plan) — stating up front whether new logic extends an existing module or creates a new one, and why — should be repeated for M4 given the shared-ownership risk with diverse-agent-review-m9.  _(architect)_
- record.js's 'backlog_appended' null-vs-absent-key convention (present-only fields distinguishing 'not yet known' from 'axis doesn't exist in this build') — cited in m3.plan.md Task 2 as the mirror source; M4 should follow the same convention if it needs a coverage/compliance status field.  _(architect)_
- evidence-stage-guard.js's identifier-anchor pattern (comparing immutable identifiers, not mutable content-hashes) — m3.plan.md Task 5 documents the same architect-lens correction (content-hash anchor rejected in favor of path-identity anchor) that M4 should recall if it needs to correlate a review record with its enforcing gate.  _(architect)_
- plugins/mccp/scripts/lib/plan-review/cli.js:1260-1334 resolveRecordForWrite -- realpath-first containment with no lexical fallback for write-locus resolvers, explicitly contrasted against the more permissive read-side resolveContained fallback.  _(security)_
- plugins/mccp/scripts/lib/plan-review/record.js:77-85 sanitizeSlug -- allowlist character stripping (not denylist) for filesystem-path-bound identifiers.  _(security)_
- plugins/mccp/scripts/lib/plan-review/cli.js:1341-1349 -- strict regex validation (sha256:[0-9a-f]{64}) for hash values accepted from CLI args before use in comparisons.  _(security)_
- CLAUDE.md 3.12 no-rehash invariant and present-only/makeSkeleton-exclusion discipline for any new receipt field that must not alter historical receipt_hash values.  _(security)_
- plugins/mccp/scripts/lib/plan-review/linkage-defs.js header pattern: dep-free pure-predicate module imported both by the audit/CLI tool and (intended for M4) by record.js at write-time, so the same definition function backs both measurement and enforcement — cited explicitly as the anti-drift mechanism (linkage-defs.js:21, 42 referencing linkage-defs.test.js asserting *absence* of certain functions, e.g. isPanelRecord, as a structural guard).  _(test)_
- M1/M3 test invocation convention: `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <files>` against `plugins/mccp/scripts/lib/tests/linkage-{audit,defs}.test.js` and `plugins/mccp/scripts/receipt/tests/receipt-linkage-fields.test.js` — M4 plan should mirror this exact invocation and directory convention rather than introducing a new test location.  _(test)_
- record.js's documented never-throw contract with 'total functions' (isObj/str/cell all handle null/undefined without throwing) is the pattern any new M4 validation logic must extend — new format-checking code must return a status/flag rather than throw, consistent with the file's stated design philosophy that measurement must not become a new failure mode for gate approval.  _(test)_
- Present-only field discipline for hash-stability: measurement.receipt_hash: null filled later via back-patch, never inline at record.js:334-340 write time — mirror this pattern if rounds also needs late population.  _(explorer)_
- Pure/dep-free/never-throws contract for definition modules (linkage-defs.js header) — any new M4 parsing/validation predicate should follow the same zero-require, total-function, ReDoS-safe-regex discipline documented at linkage-defs.js:23-42.  _(explorer)_
- Frozen-baseline vs live-partition separation in linkage-audit.js (aggregate() pre_baseline vs post_baseline, never summed) — M4's write-time validator must not conflate the boundary-tree corpus with live/HEAD corpus, per the explicit warning at linkage-audit.js:560-570.  _(explorer)_
- Single-owner-of-definition pattern already established twice in this PRD lineage (linkage-defs.js owns D1/D2/D3; corpus.js owns record-signature parsing) — any M4 validator embedded in record.js should call into linkage-defs.js rather than duplicate hasRoundStructure logic inline.  _(explorer)_

## External Research Provenance

- Source PRD: .claude/prds/review-record-linkage.prd.md
- References section sha256: 6285d0d8018061d14bd81f59fab68b7c3fcdd25580472eb34dd5b2f6449f5647
- Stamped at: 2026-09-03T08:53:33.952Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

trigger: `impeccable-detect.js` `design_signal=true` (axis a) — `signal_files: ["plugins/mccp/scripts/receipt/write.js"]`.
그 경로는 이 plan의 **변경하지 않는 파일** 목록에 인용된 것이므로 트리거는 실질적으로 위양성이나,
OR 트리거는 기계적이라 loop을 돌렸다. call-form은 오라클이 해소한 `impeccable`(user 채널, v4.0.4).

round=0/2 · verdict=**CONVERGED** · findings HIGH/CRITICAL 0건.

`frontend-design-direction` SKILL.md `## Output Constraints` 4개 앵커 대조 결과:

| 앵커 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth <= 3) | PASS | `grep -n "^#\{4,\}"` 0건 |
| 강조색 화면당 1개 | n/a | 색상 토큰/accent 도입 0건 |
| raw markdown marker 금지 | n/a | 렌더링 표면 미도입 — 이 문서는 편집기·diff에서 읽는 소스 산출물이다 |
| 한 화면 항목 수 상한 | n/a | 대상은 대시보드의 `list-of-N` 렌더링 섹션이다. 이 plan은 renderer·`status.html`·`STATUS.md`를 건드리지 않는다 |

**이 계획은 렌더링 표면을 새로 만들지도 수정하지도 않는다.** `Files to Change`는 control-plane `.js`
모듈 4개, test 5개, `CHANGELOG.md`, PRD뿐이고 `.html`/`.jsx`/`.tsx`/`.css` 계열이 0건이다.
`linkage-audit.js`의 산출물도 stderr 텍스트와 JSON이지 viewport가 아니다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더링된 UI가 없으므로 **어떤 impeccable
명령도 호출하지 않고** 체크리스트만 기록한다. 위 판정대로 이 마일스톤에는 렌더링 표면이 없어 아래
표는 실행 의무가 아니라 표면이 생길 경우의 참조다.

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

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0
- 합치 결론: Codex는 발화하지 않았다 — `MCCP_CODEX_DISABLED=1` 운영자 정책이 봉인돼(`codex-policy seal` → `codex_disabled=true`) spawn 직전 short-circuit(`classification=disabled`, `durationMs=1`, `blocking=false`). 라운드 캡도 같은 정책이 1로 pin했다(`pinnedBy=codex-disabled`). 이것은 장애가 아니라 정책이므로 advisory mode를 지나지 않으며, receipt는 `codex_verdict=skipped`로 봉인된다 — cross-gate dedupe는 닫힌 채라 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

> Codex skipped per MCCP_CODEX_DISABLED=1

- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | (none) | — | — | Codex가 발화하지 않아 finding이 0건이다 |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (라운드 캡 1 · Codex 미발화 — DIVERGENT_UNRESOLVED 아님)
- Codex session 참조: n/a (미발화)

### Implement-time decisions surfaced (2.5.2 — 리뷰어 부재로 미검증)

리뷰어가 없으므로 아래는 **검증된 합의가 아니라 저자 선언**이다. `/mccp:pr`의 PR-Codex가 실제 diff를 상대로 이 축들을 처음 본다.

1. M4 착지 경계 ref 상수의 거처는 `docs/review-record-linkage/`이고 `linkage-audit.js`가 읽는다 (DD7이 지정한 디렉토리).
2. `classifyRoundStructure`의 사유 문자열 어휘는 `classifyShipEligibility`의 형태를 그대로 따른다.
3. "경계 이후 추가·수정된 레코드"의 git 조회는 인자 배열 `spawnSync`로 하고 셸 문자열 보간을 쓰지 않는다 (`--since` ref는 caller 입력이다).
4. 봉인 대조 degradation은 세 분기가 서로 구별되는 문장을 갖는다 (DD3 개정판).
5. 경계 fixture test는 임시 git repo에 커밋 2개를 만들어 before/after 두 방향을 모두 건다.

### Security Reviewer

`Task(mccp:security-reviewer)` 호출됨 — auto-fallback 없음. 대상 축 3개(caller 슬러그로 경로 해소 · `--since <ref>`의 git 인자 처리 · 주입 경계의 never-throw).

| # | 지적 | Severity | Verdict | 흡수 |
|---|---|---|---|---|
| S1 | `--since <ref>`가 `isSafeRef`/`--end-of-options`를 우회하는 **새 호출부**를 만들 수 있다. `ref + '..HEAD'` 문자열 결합은 `--output=/tmp/x..HEAD` 를 단일 argv 토큰으로 만들고 git의 prefix-match 옵션 파서가 그것을 `--output`으로 존중한다 — 이 파일이 `--baseline-ref`에서 **실제로 재현했던** 임의 파일 쓰기 프리미티브다(`linkage-audit.js:217-224`) | HIGH | ACCEPT_NOW | Task 5가 `--since`를 CLI 파싱 시점에 `isSafeRef`로 fail-closed 검증하고, 범위 조회는 문자열 결합이 아니라 `gitRev()`(=`--end-of-options` + ref를 **독립 argv**로) 경유. 두 층 모두 적용 |
| S2 | `sanitizeSlug`(`[A-Za-z0-9._-]` 허용)와 `SLUG_RE`(`^[a-z0-9][a-z0-9-]{0,80}$`)의 비대칭은 traversal이 아니라 **예외 안전성** 구멍이다. `resolveStatePath`가 `REVIEW_ROUNDS_BAD_KEY`로 throw하는데, 그 호출을 `buildReviewRecord({...})` 인자 안에서 평가하면 기존 try/catch가 삼켜 **레코드 자체가 안 써진다** — DD4가 지키려는 "모든 halt 경로에서 레코드가 남는다"를 정면으로 깬다 | MEDIUM-HIGH | ACCEPT_NOW | Task 4가 원장 판독을 `buildReviewRecord` **앞의 독립 try/catch**로 분리하고 throw를 `{available:false}` + degradation으로 접는다. Validate에 7번째 경우(`sanitizeSlug` 통과 · `SLUG_RE` 실패 슬러그)를 추가 |
| S3 | Task 2의 Validate 4입력이 전부 well-shaped라 M3 선례(`plan-review-record.test.js:498-504`)의 malformed-shape never-throw 재단언이 빠져 있다 | LOW-MEDIUM | ACCEPT_NOW | 3줄이고 Task 2의 Validate가 이미 "throw 부재"를 요구하므로 backlog가 아니라 그 자리에서 단언 추가(`roundLedger: 'garbage'` · `[]` · `{available:true,count:'three'}`) |

**기각·완화 0건. CRITICAL 0건이므로 MCCP-GATE-STOP 해당 없음.**

S2의 등급 상향(plan R1 표의 8번은 LOW·이연이었다)을 그대로 받아들인다. 그 판정은 정규화 불일치를 traversal 축으로만 봤고, 실제 비용은 **이 마일스톤의 계측 표본 유실**이라는 다른 축이다. backlog의 해당 줄은 지우지 않고 남긴다 — 이연된 것은 두 규칙을 **하나로 통일**하는 일이고, 여기서 닫는 것은 그 불일치가 레코드를 죽이지 못하게 하는 것이다.
