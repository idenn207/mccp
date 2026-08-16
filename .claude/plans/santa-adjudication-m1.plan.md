# Plan: santa 판정 계약 M1 — severity contract + 게이트 재배선

**Source PRD**: `.claude/prds/santa-adjudication.prd.md`
**Selected Milestone**: 1 — severity contract + 게이트 재배선
**Complexity**: Medium

## Summary

santa-loop의 verdict 게이트는 리뷰어가 낸 `verdict` 문자열 하나만 읽는다 — `critical_issues`가
비어 있어도 `FAIL`이면 NAUGHTY다. 그래서 문구·네이밍 선호가 blocker와 같은 무게로 라운드를
하나 더 태운다. M1은 판정 입력을 **병합·중복제거된 blocking 건수**로 바꾸고, blocking의 자격을
`failure_scenario`를 실제로 쓸 수 있는가에 못박는다.

완화만 넣으면 게이트가 순수하게 약해지므로 같은 milestone에서 **`{A,B}` 완전성**을 함께 닫는다
(backlog 2026-08-13 HIGH가 "P1의 1순위"로 이관한 dual-review 우회 경로). 그리고 리뷰어가 계약을
지키지 못한 라운드는 완화를 **받지 못하고** 현행 규칙 그대로 판정된다 — 계약 미준수가 통과
티켓이 되지 않게 하는 것이 이 milestone의 유일한 실질 방어다.

## User Intent

<!-- PRD 본문(사용자 공동 작성) + 우산 PRD review-loop-trust의 승계 불변식에서 추출.
     저자 정당화는 이 표에 넣지 않는다 — 아래 ## Design Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 리뷰어를 온화하게 만들지 말 것. 오탐은 리뷰어 상류가 아니라 판정 하류에서 거른다 | constraint |
| UI2 | 리뷰어 프롬프트의 FAIL-first 프레이밍 제거는 범위 밖이다 | exclusion |
| UI3 | 판정 원장은 리뷰어가 아니라 집계 단계가 읽는다. 리뷰어는 fresh를 유지한다 | constraint |
| UI4 | santa verdict를 게이트 승인으로 쓰지 말 것. `review_source`는 `multi-agent` 고정 | constraint |
| UI5 | BLOCKING의 정의를 `failure_scenario` 서술 가능성에 못박을 것 | direction |
| UI6 | 게이트 입력을 `verdict` 문자열이 아니라 병합·중복제거된 blocking 건수로 재배선할 것 | direction |
| UI7 | 강등된 항목은 `suggestions`로 보존되어 보고서에 남고 사라지지 않을 것 | constraint |
| UI8 | 판정 원장은 milestone 2 소유다 | exclusion |
| UI9 | patch-chasing terminator와 캡 정책은 milestone 3 소유다 | exclusion |
| UI10 | 블라인드 레인과 스코프 확장은 P2 소유다 | exclusion |
| UI11 | 델타 스코프는 P3 소유다 | exclusion |
| UI12 | Reviewer A 로테이션은 이연한다. MVP를 부풀리지 말 것 | exclusion |
| UI13 | 각 불변식의 회귀 test 존재를 지표에 포함할 것 | constraint |
| UI14 | 동결 시그니처를 자식 PRD가 바꾸지 말 것. 바꿔야 하면 P0를 재개한다 | constraint |
| UI15 | 공유 표면(`santa-loop.md`·`cli.js`)에서는 자기 절만 편집할 것 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle + env 파서 분리 | `plugins/mccp/scripts/lib/santa/counter.js:31` · `:50` | `parseCap(env)`가 env를 읽고 `decideRound({cap})`이 인자만으로 판정. 불량값은 loud warn 후 default fail-open |
| 계약 준수의 이분법 | CLAUDE.md §3.13.1 (`intent_reviewer_contract`) | `full`이 아니면 `inconclusive`. 임의 임계(80%) 대신 이분법을 쓰되 계측값은 따로 남긴다 |
| 사유 텍스트 실질성 검사 | `plugins/mccp/scripts/receipt/lib/force-override-reason.js:63` | `validateReason(text, {strict:true, allowCodeVocabulary:true})` — 길이·단어수·filler 거부, 코드 어휘는 면제 |
| severity 어휘 | `plugins/mccp/skills/santa-method/SKILL.md:50` | `LOW｜MEDIUM｜HIGH｜CRITICAL` + `evidence`는 `file:line` 인용 |
| Naming | `plugins/mccp/scripts/lib/santa/gate.js` 전체 | JS·CLI JSON 양쪽 camelCase (`exitReason`·`criticalIssues`) — snake_case는 receipt 계층 전용 (DD10) |
| Errors | `plugins/mccp/scripts/lib/santa/cli.js:69` · `:314` | `SANTA_*` 접두 typed error → catch-all이 exit 2로 매핑. 신규 exit code를 만들지 않는다 |
| Tests (oracle) | `plugins/mccp/scripts/lib/tests/santa-gate.test.js:23` | `node:test` + `assert/strict`, 조합 전수 고정, 입력 비변형 단언 |
| Tests (CLI 경유) | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:38` · `:68` | tmpdir에 `git init`한 진짜 repo fixture + in-process `runCli`로 exit code 단언. 방어 장치를 우회하지 않고 그 위에서 돈다 |
| Tests (커버리지 계약) | `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js:8` | test 이름의 `[N]` 접두가 plan의 커버리지 계약 id |
| 프롬프트 문구 회귀 | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:31` (`SANTA_LOOP_MD`) | 커맨드 본문을 파일로 읽어 문구를 직접 단언 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/gate.js` | UPDATE | P1 소유. severity oracle 신규 export 추가(Task 1~2). `decideVerdict`는 **무변경**(DD3) |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | 공유 표면. 리뷰어 JSON → envelope 변환에 `findings` 축 추가 (DD4의 "유일한 파생 지점은 `loadReviewer`") |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | 공유 표면. Step 3 severity contract · Step 4 판정 설명 · Step 5 수정 범위 |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | CREATE | P1 소유 회귀 test (소유권 표에 이미 배정된 경로) |
| `plugins/mccp/scripts/lib/tests/santa-gate.test.js` | UPDATE | **단언 코드 무변경.** `:68`·`:74`의 주석만 "위임 대상"으로 갱신(Task 5) |
| `docs/santa-loop/ownership.md` | UPDATE | 변경 프로토콜 4 — DD3의 신규 export를 **추가 기록**. `decideVerdict`의 시그니처·반환은 무변경 |
| `docs/ENVIRONMENT.md` | UPDATE | `MCCP_SANTA_SEVERITY_GATE` 등재 (§11 canonical) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.26.0 → 1.26.1 (§3.7 patch — PRD 3개 중 1개 milestone) |
| `CHANGELOG.md` | UPDATE | `## [1.26.1]` 행 |
| `.claude/prds/santa-adjudication.prd.md` | UPDATE | Milestone 1 행 `pending` → `in-progress` + Plan 셀 연결 |

신규 파일은 test 1개뿐이고 그 경로는 소유권 표가 이미 P1에 배정했다. severity oracle을 별도
모듈로 빼지 않고 `gate.js` 안에 두는 이유는 DD2 참조.

## Design Decisions

### DD1 — 계약 미준수는 완화를 받지 못한다 (이 milestone의 유일한 실질 방어)

severity 게이팅은 **완화**다: 지금 NAUGHTY가 되는 것 중 일부가 NICE가 된다. 완화의 조건을
리뷰어가 스스로 만족시켜야 하므로, 계약을 지키지 않은 라운드에 완화를 주면 "구조화를 생략하면
게이팅이 꺼진다"가 아니라 "구조화를 생략해도 완화를 받는다"가 되어 방향이 뒤집힌다.

그래서 라운드마다 `contract ∈ {full, partial}`을 파생하고 **`full`일 때만** 완화(리뷰어의 `verdict`
문자열을 무시하고 blocking 건수만 보는 것)를 적용한다.

**파생 규칙을 여기 명세로 못박는다** (R9 architect MEDIUM 흡수 — 초안은 이 규칙을 Task 1의 구현
설명에만 두었고, 명세가 없으면 구현이 규칙의 유일한 정의가 된다):

> `contract = full` ⟺ **그 라운드 전 리뷰어의 전 finding이 `structured:true`**다. 즉 하나의 AND이며,
> finding 0건인 리뷰어는 그 AND에 `true`로 기여하고, 리뷰어 0명이면 `full`이다(그 경우 판정은 증거
> 0건 규칙이 먼저 잡는다 — DD11). 그 외는 전부 `partial`이고, `partial`은 **상태이지 오류가 아니다**.

`structured`의 값 자체는 DD4의 파생 표가 정하고, 그 표를 적용하는 단일 주체는 `analyzeReviewers`다
(Task 1). 이 문단은 *무엇을* 파생하는지의 명세이고 Task 1은 *어디서* 파생하는지의 배정이다. `partial`이면 현행 규칙(전원 PASS만
NICE)이 **추가로** 걸린다. 임의 임계 대신 이분법을 쓰는 근거는 §3.13.1과 같다: 방어할 수 없는
숫자를 만들지 않는다. 계측값(구조화 finding 수 / 전체)은 `verdict` 출력에 따로 싣는다.

**"추가로"가 이 절의 정정이고, 초안은 여기서 틀렸다** (L2 R5 invariant CRITICAL 흡수). 초안은
`partial`을 "현행 규칙으로 **대체**"한다고 적고 그것을 "더 엄격한 판정"이라 불렀는데, 두 규칙은
포함 관계가 아니라 **교차**한다. 반례가 실재한다:

> 리뷰어 A가 `verdict:"PASS"`를 내면서 CRITICAL finding을 구조화해 쓰고, 리뷰어 B는 finding을
> 비구조화로 낸다. → `contract='partial'` → 대체 규칙은 "전원 PASS"만 보므로 **NICE**. 그러나
> 완화 규칙은 blocking 1건을 보고 **NAUGHTY**를 냈을 것이다.

즉 대체는 그 케이스에서 *덜* 엄격하고, 비구조화 finding 하나로 다른 리뷰어의 blocking을 지우는
우회가 성립한다. 그래서 규칙을 **누적**으로 바꾼다:

| 경로 | NICE 조건 |
|---|---|
| `full` (완화 적용) | `blocking.length === 0` ∧ `distinctIds.length ≥ 2` |
| `partial` · `severityGate='off'` | **위 조건 전부** ∧ 전원 PASS |

이제 `partial`의 NICE 조건이 `full`의 조건에 하나를 더한 것이므로 "계약 미준수의 대가는 더 엄격한
판정"이 **참인 명제**가 된다. blocking 게이트는 어느 경로에서도 꺼지지 않는다 — 그것은 완화가
아니라 강화이고, 끌 이유가 없다.

`critical_issues`가 **빈** 리뷰어는 계약 위반이 아니다 — 지적할 것이 없었을 뿐이다. 이 구분이
없으면 무결점 라운드가 영원히 `partial`이 되어 게이팅이 도달 불가가 된다.

### DD2 — severity oracle은 `gate.js` 안에 둔다 (신규 모듈 0)

소유권 표는 P1에 `gate.js` · `adjudication.js` · `terminator.js` 셋을 배정하는데 뒤 둘은 각각
milestone 2·3의 근거로 배정된 파일이다. severity 판정을 새 파일로 빼면 표에 없는 경로가 생기고,
그러면 §변경 프로토콜 4대로 표를 고쳐야 하며 그 수정이 P2·P3가 전제로 삼은 교집합 ∅ 주장을
건드린다. 함수 3개(순수)면 `gate.js`가 감당하는 크기다.

### DD3 — `decideVerdict`는 한 글자도 바꾸지 않는다. 판정은 새 export가 한다 (UI14)

초안은 `decideVerdict`의 인자에 `severityGate`를, 반환에 3필드를 더하고 그것을 §변경 프로토콜
2로 정당화했다. **그 정당화는 틀렸다** — 프로토콜 2의 문언은 "기존 함수의 시그니처·동작을
**유지한 채** 새 export를 더하는 것"이고, 선례로 든 `reviewersFrom`/`aggregateFrom`은 전부
*새 함수*다. 기존 함수의 인자·반환을 늘리는 것은 프로토콜 1이 "P0 재개"로 보낸 쪽에 가깝고,
ownership.md의 계약 열은 한 걸음 더 나아가 판정 규칙 자체를 문장으로 적어 두었다 —
"전원 PASS만 NICE이고, envelope 0건은 NAUGHTY다".

그래서 **동결 함수를 건드리지 않는 형태로 되돌린다**:

| export | 상태 | 역할 |
|---|---|---|
| `gate.decideVerdict(opts)` | **무변경** | 현행 규칙(전원 PASS만 NICE). `severityGate='off'`와 `contract='partial'`의 위임 대상으로 계속 산다 |
| `gate.decideAdjudicatedVerdict(opts)` | 신규 export | severity 축 판정. 완화 조건을 만족하지 못하면 `decideVerdict`에 **위임**한다 |
| `gate.analyzeReviewers(reviewers)` | 신규 export | 순수. `{contract, blocking, byReviewer, mismatches}` — 계측·보고용이며 판정과 분리 |
| `gate.parseSeverityGate(env)` | 신규 export | env 파서 |

`cli.js cmdVerdict`의 호출 대상만 `decideAdjudicatedVerdict`로 바뀐다. 이렇게 하면
`reviewersFrom`/`aggregateFrom` 선례와 **정확히 같은 형태**가 된다 — 기존 함수는 그대로 있고
새 순수 함수가 그 위에 얹힌다(위임 방향만 반대이고, "기존 함수 무변경"은 오히려 더 강하게
성립한다). ownership.md의 계약 문언은 여전히 `decideVerdict`에 대해 참이므로, 그 문서 변경은
**변경 기록이 아니라 추가 기록**이다(프로토콜 4).

대가를 숨기지 않는다: `decideVerdict`를 **직접** 부르는 호출자에게는 DD8의 `{A,B}` 완전성이
적용되지 않는다. 실경로에서 그런 호출자는 0이고(`cli.js`가 유일 소비자이며 새 함수를 부른다),
backlog가 지목한 우회 경로도 CLI 경유라 닫힌다. 커버리지 항목 21이 "유일 소비자가 새 함수를
부른다"를 고정한다.

### DD3a — `gate.js`의 순수성 경계는 어디까지인가

`gate.js` 머리말은 "디스크·env·시각을 모른다"고 적는다. `parseSeverityGate(env)`는 env를 읽으므로
그 문장을 좁혀야 한다: **판정 함수는 env를 모르고, 파서만 안다.** `counter.js`가 이미 같은
구조다 — `parseCap(env)`가 env를 읽고 `decideRound({cap})`은 인자만 본다. 파싱은 `cli.js`가
호출하고 판정 함수에는 값만 넘어간다. 이 문장을 `gate.js` 머리말에 반영하는 것이 Task 1의
일부다.

### DD4 — envelope에 `findings`를 더하되 `criticalIssues`는 건드리지 않는다

fan-out architect 관점이 독립 확인한 gap이 여기다: `ledger.readReviewers`가 `raw`를 버리므로
(UI4의 모듈 경계) gate는 `checks`·`suggestions`를 볼 수 없다. severity 축의 입력을 gate까지
보내려면 **envelope에 실어야** 한다.

**`findings`가 어디에 저장되는지 먼저 못박는다 — 원장이지 receipt가 아니다.**

| 무엇 | 어디 | git |
|---|---|---|
| `findings`(및 envelope 전체) | 원장 `.claude/state/santa-loop/<slug>.json`의 `rounds[].reviewers[].envelope` | **gitignored** |
| 리뷰어 원본 JSON | 같은 원장의 `rounds[].reviewers[].raw` | gitignored |
| receipt에 실리는 santa 값 | `meta.santa_rounds` · `santa_entries` · `santa_cap` · `santa_exit_reason` **집계 정수 4종뿐** | git-tracked |

즉 이 변경은 **receipt schema를 건드리지 않는다.** `schema.js:886-907`의 santa 4필드는 전부
집계 정수이고 `findings`는 그중 어디에도 흘러들지 않는다 — `seal.js#project`가 envelope에서
뽑는 것은 `criticalIssueCount`(정수)뿐이고 `renderReport`에는 finding 본문을 실을 인자가 없다
(UI4). 따라서 receipt migration도, `SCHEMA_VERSION` bump도 불필요하다. 원장 쪽 하위 호환은
`findings` 부재 → `structured:false` → `contract='partial'`로 처리되며, `ledger.js:311`이 이미
`entries` 부재를 관용하는 것과 같은 additive 방향이다.

**입력 스키마 — 리뷰어가 실제로 내는 JSON** (`santa-loop.md` Step 3, Task 4가 이 블록을 그대로
싣는다). 바뀌는 것은 `critical_issues` 원소 하나뿐이고 나머지 3필드는 무변경이다. 새 최상위
필드는 만들지 않는다 — severity·failure_scenario는 `critical_issues` 원소 **안에** 산다.

```jsonc
{ "verdict": "PASS" | "FAIL",
  "checks": [ { "criterion": "…", "result": "PASS|FAIL", "detail": "…" } ],   // 무변경
  "critical_issues": [
    // 신규 권장 형태 — 객체
    { "claim": "…",                       // 필수, 문자열, 1..500자
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",  // 필수, 이 4값만
      "failure_scenario": "…",            // 생략 가능(blocking 주장 시에만 필요). 있으면 1..2000자
      "evidence": "path:line 또는 인용" }  // 선택, 문자열, 0..500자
    // 또는 legacy 형태 — 문자열 (그대로 받는다)
  ],
  "suggestions": ["…"] }                                                      // 무변경
```

**envelope — `cli.js`가 합성하는 것** (기존 4필드 + `findings`):

```jsonc
{ "id": "A"|"B", "model": "opus", "verdict": "PASS"|"FAIL",
  "criticalIssues": ["<claim 문자열>", …],        // 기존 그대로 (seal.js 무변경)
  "findings": [                                    // 신규
    { "claim": "…", "severity": "HIGH"|null,
      "failureScenario": "…"|null, "evidence": "…"|null,
      "structured": true|false } ] }
```

**입력 → envelope 파생 규칙** (`cli.js#loadReviewer`가 수행하며, 이것이 유일한 파생 지점이다 —
"유일"은 **기록 경로**에 한한 주장이고, 그 근거는 원장에 envelope를 쓰는 함수가 `cli.js`의
`cmdRecord` 하나이며 그것이 `loadReviewer`를 거친 값만 넘긴다는 것이다. `analyzeReviewers`는
파생 지점이 아니라 **소비 지점**이고 이미 저장된 원장을 읽으므로, 검증을 우회하는 경로가 아니라
검증 이전에 저장된 legacy를 흡수하는 자리다 — R9 architect MEDIUM).
표는 **배열 전체가 아니라 원소 하나**에 적용된다 — 따라서 문자열과 객체가 섞인 배열도 원소별로
처리된다. 모든 원소는 종류와 무관하게 `findings`에 한 항목을 만들고 `criticalIssues`에 claim
문자열을 하나 넣으므로, 두 배열의 **길이는 언제나 입력 원소 수와 같다**(그것이 `seal.js`의
`criticalIssueCount` 보존 조건이다). 섞인 배열은 구조화 원소가 하나라도 미달이면
`contract='partial'`이 되므로, 혼합 입력의 판정 경로는 전부 비구조화와 같다.

| 입력 원소 | `structured` | `severity` | `failureScenario` |
|---|---|---|---|
| 4필드를 전부 만족하는 객체 | `true` | 그 값 | 그 값 |
| 객체이되 `severity`가 4값 밖 / `claim` 부재·비문자열 / 길이 초과 | `false` | `null` | 원문 보존 |
| 문자열 (legacy) | `false` | `null` | `null` |
| 객체이되 `failure_scenario` 부재 (**의도된 예외** — 아래 별도 문단) | `true` | 그 값 | `null` |

**필드 타입 규약** (R7 invariant·test LOW 흡수 — 표가 길이·열거값만 적고 타입을 적지 않았다). 판정은
`typeof === 'string'` 하나로 하고, 그 외는 전부 **비문자열**로 같게 취급한다:

| 입력 값 | `claim` | `severity` | `failure_scenario` | `evidence` |
|---|---|---|---|---|
| 키 부재 · `null` · `undefined` | `structured:false` | `structured:false` | **부재로 취급** (표 4행) | `evidence:null` |
| 문자열 (길이 규약 내) | 그 값 | 열거값이면 그 값 | 그 값 | 그 값 |
| 비문자열 (숫자·불리언·객체·배열) | `structured:false` | `structured:false` | `structured:false` | `evidence:null` |

`failure_scenario`만 첫 행의 결과가 다른 이유는 위 예외 그대로다 — **부재와 `null`은 같은 상태**이고
"blocker로 주장하지 않는다"는 선언이다. 반면 `failure_scenario: 42`는 부재가 아니라 계약 위반이므로
강등한다. 빈 문자열 `""`은 길이 규약(1자 미만) 위반이라 강등이지 부재가 아니다 — 부재는 키가 없거나
`null`인 경우로만 정의한다.

**타입 위반은 거부이고 계약 미달은 강등이다** — 이 구분이 fail-open을 막는다. `critical_issues`가
배열이 아니거나 원소가 문자열·객체 어느 쪽도 아니면(숫자·배열·null) `SANTA_REVIEWER_INVALID`로
**exit 2 + append 0건**이다(현행 `loadReviewer`의 fail-closed 규약 그대로). 반면 객체이되
**구조화 필드**(`claim` · `severity` · 길이 상한)가 계약에 못 미치는 것은 `structured:false`로
떨어뜨린다 — 그 결과는 `contract='partial'`이고, DD1대로 그 라운드는 **완화를 받지 못한다**.
어느 경로도 조용한 통과를 만들지 않는다.

**`failure_scenario` 부재만은 예외이고, 그것이 표 4행의 의미다** (R6 security CRITICAL 흡수).
`claim`·`severity`·길이는 **구조화의 조건**이라 미달이 강등이지만, `failure_scenario`는 구조화의
조건이 아니라 **blocking의 조건**이다(UI5 · DD6). 생략은 계약 위반이 아니라 "이것을 blocker로
주장하지 않는다"는 선언이므로 `structured:true`로 남고, 무게는 `classifyFinding`이
`blocking:false`로 뺀다(커버리지 4). 반대로 강등하면 LOW 주석 하나에도 30자 시나리오를 요구하게
되어 라운드가 상시 `partial`이 되고(Risks 1행) 게이팅이 도달 불가가 된다 — DD1이 "지적할 것이
없었던 리뷰어를 계약 위반으로 보지 않는" 것과 같은 이유다.

**이 예외에 우회가 없는 이유**: blocking 자격을 판정하는 곳은 `classifyFinding` **하나뿐**이고 그
함수는 `failureScenario`의 실질성을 요구한다(DD6). 따라서 `severity:"CRITICAL"` + 시나리오 부재는
`structured:true`이되 `blocking:false`이며, 그 리뷰어가 `FAIL`을 냈다면 `mismatches`에
`fail-without-blocking`으로 표면화된다. **severity 문자열만으로 blocking이 되는 경로는 없다** —
"HIGH인데 시나리오가 없어 blocking으로 오계수된다"는 그래서 성립하지 않는다.

길이 상한은 `claim` 500 · `failure_scenario` 2000 · `evidence` 500자다. 초과는 절삭하지 않고
`structured:false`로 떨어뜨린다(DD5). 원소 수는 기존 `MAX_REVIEWER_ARRAY`(1000)가 이미 덮고,
전체 크기는 `MAX_REVIEWER_BYTES`(100KB)가 덮으며, prototype pollution은 `assertSafeGraph`가
파싱 직후 이미 차단한다 — 새 방어를 발명하지 않고 기존 것 위에 필드 검사만 얹는다.

`criticalIssues`를 유지하는 것이 핵심이다. `seal.js#project`(`:83`)가 그 길이로
`criticalIssueCount`를 뽑고 `renderReport`가 그것을 리포트 셀에 찍으므로, 이름을 바꾸거나
구조를 갈아치우면 M2 산출물이 조용히 깨진다. 구조화 입력에서는 `criticalIssues`를
`findings[].claim`으로 파생해 길이가 보존된다.

**legacy 원장 호환**: `findings`가 없는 envelope(현 원장에 이미 쌓인 것)은 `criticalIssues`에서
`{claim, structured:false}`로 파생된다 → `contract=partial` → 현행 규칙. 크래시도, 조용한 완화도
없다.

### DD5 — `failure_scenario` 판정의 주체 (PRD Open Question 1의 답)

**집계 단계가 기계적으로 검사한다.** 리뷰어의 자기 선언은 받지 않는다 — "나는 이것을 서술할 수
있다"는 위조 비용이 0이다.

검사는 **존재와 실질성**까지이고 **품질은 아니다**. `validateReason(text, {strict:true,
allowCodeVocabulary:true})`를 재사용한다(≥30자 · ≥3단어 · 1-token 금칙어 · `lorem`류 filler
거부, 단 `test`·`bar.ts` 같은 코드 어휘는 면제 — §3.13.1이 같은 조합을 쓰는 이유와 동일하다:
결함 서술은 코드를 이름으로 불러야 한다).

PRD Open Question이 지적한 한계는 그대로 남고, 남는다는 사실을 여기 적는다: **이 검사는 그럴듯한
거짓 시나리오를 거르지 못한다.** 닫는 것은 "서술 없이 blocker라고 부르는 것"뿐이다.

상한은 2000자다. 초과는 절삭하지 않고 `structured:false`로 떨어뜨린다 — 조용한 절삭은 감사
표면을 무력화하고(§3.13.1), 여기서 `partial`로 떨어지는 것은 *더 엄격한* 방향이라 안전하다.

**검사는 두 층으로 나뉘고 층마다 하는 일이 다르다.** 같은 문자열을 두 번 보는 것이 아니라,
한쪽은 *형태*를 보고 다른 쪽은 *내용*을 본다.

| 층 | 함수 | 무엇을 보는가 | 실패 시 |
|---|---|---|---|
| 기록 시점 | `cli.js#loadReviewer` | 타입·길이·`severity` 열거값 (DD4 파생 표) | 타입 위반은 exit 2 + append 0건 · 계약 미달은 `structured:false` |
| 판정 시점 | `gate.classifyFinding` | `failureScenario`의 **실질성**(`validateReason`) | `blocking:false` — finding은 남고 무게만 빠진다 |

기록 시점이 내용 실질성까지 판단하지 않는 이유는 원장이 **관측 기록**이기 때문이다 — 리뷰어가
실제로 무엇을 냈는지가 남아야 나중에 판정 규칙이 바뀌어도 재판정이 가능하다. 판정 시점이
타입을 다시 보지 않는 이유는 그 시점에 도달한 값은 이미 형태가 보장되기 때문이다.

### DD6 — blocking 자격: severity ∈ {CRITICAL, HIGH} ∧ failure_scenario 실질

CLAUDE.md §3.14가 이미 운영 규칙으로 강제하는 것을 코드로 내린다 — "CRITICAL·HIGH만 그 자리에서
흡수, 나머지는 backlog", 그리고 "라운드 판정도 미흡수 HIGH/CRITICAL 부재를 기준으로 하며,
리뷰어가 `verdict=fail`을 내도 그 리뷰어의 자기 최고 severity가 MEDIUM 이하이면 수렴으로 본다".

§3.14는 자기 해제 조건(`quorum.js`의 bare-verdict 합성 제거)을 가진 **임시** 규칙이므로 이 코드의
근거를 거기 둘 수 없다. 그러나 **근거를 PRD Scope MVP (1)·(2)에 둔다는 초안의 문장은 과장이었다**
(R9 architect CRITICAL 흡수). MVP (1)은 "severity contract를 **리뷰어 프롬프트에** 못박기"로
프롬프트 축을 말하고, MVP (2)는 입력을 "blocking 건수로 재배선"하라고만 하며, **어느 쪽도 어떤
severity가 blocking인지를 정하지 않는다.** 실제 근거는 다른 두 행이다:

- **Delivery Milestone 1의 Outcome** — "**문구·스타일 지적이 NAUGHTY를 만들지 못하고**, blocking은
  `failure_scenario`를 쓸 수 있을 때만 성립". 앞 절이 severity 축을 요구한다.
- **Success Metrics의 `severity 게이팅` 행** — "`critical_issues`가 빈 리뷰어의 FAIL이 PASS로
  계수되고 보고서에 불일치가 남음".

**두 조건이 왜 둘 다 필요한가**: `failure_scenario` 하나로는 문구 지적을 거르지 못한다 — 스타일
지적에도 그럴듯한 오동작 시나리오를 30자 이상 쓸 수 있고(`validateReason`은 품질을 보지 않는다,
DD5), 그러면 Milestone 1의 Outcome 앞 절이 달성되지 않는다. 거꾸로 severity 하나로는 Hypothesis의
문언("BLOCKING의 정의를 `failure_scenario` 서술 가능성에 못박고")이 달성되지 않는다. PRD가 명시한
것은 뒤 조건이고 앞 조건은 Outcome에서 **파생**되므로, 그 파생을 여기 적어 둔다 — §3.14가
삭제되면 이 문단이 유일한 근거로 남는다.

MEDIUM·LOW는 사라지지 않는다(UI7): `findings`에 그대로 남아 원장에 저장되고, 강등 사실은
`mismatches`로 표면화된다.

### DD7 — 미인식 severity는 blocking이 아니라 **계약 위반**이다

`quorum.js:166`은 미인식 severity를 blocking으로 취급한다("weight를 읽을 수 없는 finding은 버릴 수
없다"). 여기서는 그 finding 하나를 blocking으로 올리는 대신 라운드 전체를 `partial`로 떨어뜨린다.

두 규칙은 **같은 방향으로 더 강하다**: `partial`이면 그 라운드는 현행 규칙으로 판정되므로,
그 리뷰어가 `FAIL`이면 다른 finding의 severity와 무관하게 NAUGHTY다. finding 단위로 올리는 것보다
넓게 잡는다.

### DD8 — `{A,B}` 완전성을 같은 milestone에서 닫는다

backlog 2026-08-13 HIGH가 "P1의 1순위"로 이관한 항목이다: `record --id A`를 두 번 넣으면 A
envelope 2개가 쌓이고 둘 다 PASS면 NICE가 나온다 — dual-review가 우회된다.

M1이 이것을 함께 닫는 이유는 순서가 아니라 **정합성**이다. severity 게이팅은 완화이고, 우회
경로가 열린 채 완화만 들어가면 게이트가 순수하게 약해진다. 그래서 판정에 한 줄을 더한다:
**NICE는 distinct `id`가 2 이상일 때만.** 이것은 `severityGate` 값과 무관하게 항상 적용된다.

이 규칙은 이미 한 층 위에 존재한다 — `seal.js#deriveVerdict:126`이 `distinctIds(fin).length < 2`
에서 `divergent`를 낸다. 즉 지금은 게이트가 NICE를 내고 봉인이 divergent를 내는 **불일치**가
성립하며, M1은 두 층을 정합시킨다.

**정합시키는 것은 *규칙*이지 *코드*가 아니고, 그 구분과 대가를 여기 적는다** (R8 architect CRITICAL
흡수). M1 이후에도 `distinctIds`를 세는 곳은 둘이다 — 새 `gate.analyzeReviewers`와 기존
`seal.js`의 내부 함수(`plugins/mccp/scripts/lib/santa/seal.js` 91행). 하나로 합치지 않는 이유는
두 가지다:

- **`seal.js`는 소유권 표에 없는 P0 산출물이다.** 공유 헬퍼를 뽑아 `seal.js`가 그것을 부르게
  만들면 표에 없는 파일을 P1이 선점하게 되고, 그것은 DD12가 리포트 표면에 대해 거부한 것과 같은
  월권이다.
- **`gate.js`는 순수여야 한다.** 반대 방향(gate가 seal을 import)은 디스크를 아는 모듈을 순수 모듈
  안으로 끌어들이므로 DD3a의 경계를 깬다.

따라서 두 함수는 **각자 산다.** 남는 위험은 "지금은 같은 결론을 내지만 한쪽이 바뀌면 갈린다"이고,
그 위험은 문서로 닫히지 않는다 — **커버리지 25가 두 층의 공개 API(`decideAdjudicatedVerdict` ·
`seal.deriveVerdict`)에 같은 입력을 먹여 결론 일치를 단언한다.** 한쪽이 바뀌면 그 test가 red가
된다. 즉 M1이 주장하는 것은 "한 곳에서만 센다"가 아니라 "두 곳에서 세되 갈리면 즉시 잡힌다"이다.

**닫지 못하는 잔여를 숨기지 않는다** (R9 architect MEDIUM): 커버리지 25는 두 층이 **서로 갈리는**
것을 잡지, 둘이 **같이 틀리는** 것을 잡지 못한다. 누군가 양쪽을 함께 `>= 1`로 고치면 test는 green을
유지한다. 그것을 막는 장치는 이 milestone에 없고, 만들 수 있는 것도 아니다 — 두 곳을 한 곳으로
합치는 것만이 진짜 해결이며 그것은 `seal.js` 소유권(P0)이 열릴 때의 일이다. 지금 주장하는 범위는
**"우발적 드리프트는 즉시 red"**까지이고, "의도적 동시 변경"은 리뷰가 잡을 몫이다.

**이 규칙은 `decideAdjudicatedVerdict`에만 들어가고 `decideVerdict`에는 들어가지 않는다.** 따라서
`santa-gate.test.js:68`("리뷰어 1명 PASS만으로 NICE")은 **green을 유지한다** — 그 단언은
`decideVerdict`를 호출하고, DD3에 따라 그 함수는 무변경이기 때문이다. 그 test의 "이것을 red로
만들면 안 된다"는 주석은 지켜지며, Task 5가 바꾸는 것은 그 주석이 *왜* 그래도 되는지를 설명하는
문장뿐이다. 두 함수를 하나로 읽으면 이 plan이 P0의 보존 계약을 깨는 것처럼 보이는데, 깨지 않는
이유가 정확히 DD3의 분리다.

DD12 표의 나머지 셋(`record`는 OPEN에서만 · `id` 중복 거부 · verdict 1회)은 라운드 상태 기계라
원장 축이고, milestone 2가 소유한다. `{A,B}` 완전성만으로 A×2 우회는 이미 닫힌다(distinct id가
1이므로 NICE 불가) — 나머지 셋은 위생이지 이 우회의 필수 조건이 아니다.

### DD9 — dedupe는 판정을 바꾸지 않는다

blocking을 병합·중복제거(정규화 claim 문자열 일치: 소문자 + 공백 축약 + trim)하지만, 판정이 보는
것은 **0인가 아닌가**뿐이다. dedupe는 양수를 양수로만 옮기므로 판정에 영향이 없고, 따라서 문면이
다른 동일 지적을 못 잡는 한계가 게이트의 정확도를 낮추지 않는다. 값이 실제로 쓰이는 곳은 보고와
계측이며, 건수를 소비하는 terminator는 milestone 3 소유다.

### DD10 — `MCCP_SANTA_SEVERITY_GATE`는 게이트를 뚫을 수 없다

`enforce`(default) · `off`. 불량값은 loud warn 후 `enforce`로 fail-open(`counter.parseCap` 선례).

**두 값의 엄격도 순서를 먼저 못박는다: `off`가 `enforce`보다 엄격하다** (R7 invariant 흡수).
DD1 표대로 `off`의 NICE 조건은 `enforce`의 조건에 `allPass`가 더 붙은 것이므로 `off ⊃ enforce`이고,
따라서 불량값을 `enforce`로 떨어뜨리는 것은 **둘 중 덜 엄격한 쪽**을 고르는 것이다. 이것을 그대로
두는 근거는 세 가지이고, 셋 다 "안전하니까"가 아니라 **범위가 좁아서**다.

1. **이 축으로 도달 가능한 가장 느슨한 상태(`enforce`)조차 M0보다 엄격하다.** 강화 축 둘
   (`noBlocking` · `bothIds`)이 어느 값에서도 적용되므로, env를 어떻게 오타 내도 게이트가 M0
   아래로 내려가지 않는다. 커버리지 13·24가 그 단조성을 고정한다.
2. **`off`를 default로 삼으면 오타가 kill switch를 켠다.** 그쪽이 더 엄격한 것은 맞지만, 운영자가
   의도하지 않은 모드로 조용히 넘어가는 것은 방향과 무관하게 사고다. loud warn은 그래서 필수다.
3. **`counter.parseCap` 선례와 같은 형태를 유지한다** — 같은 모듈군에서 env 파서 두 개가 서로 다른
   실패 규약을 가지면 읽는 사람이 매번 확인해야 한다.

이 판단이 틀렸다면 대가는 작다: `parseSeverityGate`의 fallback 상수 하나와 커버리지 1의 기대값이
바뀐다. 판정 로직은 손대지 않는다.

**`off`가 끄는 것은 완화 하나뿐이다.** M1 전체를 끄는 스위치가 아니라, "리뷰어의 `verdict`
문자열을 무시하고 blocking 건수만 본다"는 *완화*만 되돌린다. 강화 축 둘 — blocking 게이트
(`blocking.length === 0`)와 `{A,B}` 완전성(`distinctIds ≥ 2`) — 은 **어느 값에서도 적용된다**.

그 구분이 kill switch를 안전하게 만든다. 초안은 `off`를 "현행 규칙으로 되돌린다"로 적고 그것을
"더 엄격하다"고 불렀는데, DD1이 정정한 것과 **같은 오류**였다: 순수한 M0 복귀는 `PASS`를 내면서
blocking을 쓴 리뷰어를 놓치므로 `enforce`보다 느슨한 케이스를 갖는다. 강화 축을 켜 둔 채로만
"이 env로 도달 가능한 가장 느슨한 상태조차 M0보다 엄격하다"가 참이 된다. test가 그 단조성을
고정한다(커버리지 항목 13·24).

### DD11 — envelope 0건 → NAUGHTY는 유지한다

backlog 2026-08-13 LOW가 P1에 재검토를 남긴 항목이다(`(a)` fail-closed 유지 / `(b)` 판정 거부 /
`(c)` 별도 상태). **(a)를 유지한다.** `(b)`는 이미 한 번 UI10 위반으로 되돌려진 규칙이고, 증거
0건을 통과가 아닌 실패로 읽는 것이 fail-closed 방향이다. DD8이 distinct id ≥ 2를 요구하므로
0건은 그 규칙으로도 NICE에 도달하지 못한다 — 두 규칙이 같은 결론을 내며 서로를 가리지 않는다.

### DD12 — 리포트 표면은 M1에서 건드리지 않는다

PRD Success Metric은 "`critical_issues`가 빈 리뷰어의 FAIL이 PASS로 계수되고 **보고서에 불일치가
남음**"을 요구한다. `seal.js#renderReport:163`이 이미 리뷰어 셀을 `A/opus FAIL (0 critical)`로
찍으므로 그 불일치는 **현재 렌더 형식 그대로 표면에 있다** — verdict가 FAIL인데 critical이 0인
셀이 정확히 그 사건이다.

`seal.js`는 소유권 표 어디에도 없는 P0 산출물이므로, 명시 라벨을 위해 지금 손대면 표에 없는
파일을 P1이 선점하는 것이 된다. 명시 라벨은 원장 `entries`가 보고서에 실리는 milestone 2에서
자연스럽게 붙는다. M1의 계측 표면은 `cli.js verdict`의 stdout JSON(`mismatches`·`contract`)이고,
`santa-loop.md` Step 4가 그것을 터미널에 출력한다.

이 판단이 틀렸다면 대가는 작다: `renderReport`에 셀 하나를 더하는 변경이다.

### DD13 — 리뷰어 프롬프트는 엄격해지지 개방되지 않는다 (UI1·UI2)

"Your job is to find problems, not to approve." 문구는 **한 글자도 바꾸지 않는다**. 회귀 test가
그 문자열을 파일에서 직접 단언한다(커버리지 항목 14).

추가되는 것은 완화 지시가 아니라 **증명 의무**다 — "blocker라고 부르려면 구체적 오동작을 써라".
이것은 리뷰어에게 덜 찾으라고 말하지 않는다. 서술할 수 없는 것을 blocker 칸에 넣지 말라고 말할
뿐이고, 갈 곳(`suggestions`)이 이미 있다.

## Tasks

### Task 1: severity oracle — 신규 export 3종 (`gate.js`, 전부 순수)

- **Action**: `parseSeverityGate(env)` · `classifyFinding(finding)` · `analyzeReviewers(reviewers)`
  를 **추가**한다(기존 `decideVerdict`는 이 Task에서 읽기만 하고 손대지 않는다).
  `classifyFinding`은 아래 **정확히 4필드**를 반환하고(그 외 키를 더하지 않는다 — 입력 finding을
  되싣지 않으므로 호출자가 `f`와 판정 결과를 각각 들고 있는다), `failureScenario` 실질성 검사에
  `force-override-reason#validateReason`(strict + allowCodeVocabulary)을 재사용한다.

  ```jsonc
  // classifyFinding(finding) — 순수. 입력을 변형하지 않는다
  { "structured": true | false,          // DD4 파생 표의 결과
    "blocking":   true | false,          // structured ∧ severity∈{CRITICAL,HIGH} ∧ 실질 failureScenario
    "severity":   "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null,   // 미인식·비문자열은 null (DD7)
    "reason":     "ok" | "unstructured" | "severity-below-gate"
                | "no-failure-scenario" | "insubstantial-failure-scenario" }
  ```

  `reason`은 **항상 위 5값 중 하나**이고 `null`이 아니다(R9 invariant HIGH 흡수 — 초안은 `null`을
  허용하면서 그 조건을 적지 않았다). 판정 순서는 위에서 아래로 **첫 일치에서 멈춘다**:
  `structured:false` → `"unstructured"` · severity ∉ {CRITICAL, HIGH} → `"severity-below-gate"` ·
  `failureScenario === null` → `"no-failure-scenario"` · **문자열이지만 `validateReason`이 거부** →
  `"insubstantial-failure-scenario"` · 그 외 → `"ok"`(이때만 `blocking:true`). 네 번째가 초안에
  빠져 있던 경우다: 그때 `structured`는 **`true`로 유지된다**(형태는 계약을 만족했다) 고
  `blocking`만 `false`가 된다 — DD5의 2층 분업("finding은 남고 무게만 빠진다")이 정확히 이것이고,
  여기서 `structured:false`로 떨어뜨리면 실질성 미달 하나가 라운드 전체를 `partial`로 만들어
  DD1의 계약 축과 DD6의 무게 축이 섞인다.

  `reason`은 **보고·계측 전용**이고 판정은 `blocking` 불리언만 본다 — `analyzeReviewers`가
  `mismatches`를 만들 때 왜 강등됐는지 적을 곳이 필요해서 두는 필드다. `blocking:true`일 때만
  `reason:"ok"`다.

  `validateReason`은 **import해서 쓰고 재구현하지 않는다**(R8 test 흡수) —
  `plugins/mccp/scripts/receipt/lib/force-override-reason.js`의 export를 그대로 호출한다. 규칙을
  베껴 적으면 원본이 바뀔 때 두 사본이 갈리고, 그 갈림은 어떤 test도 잡지 않는다. 호출 조건도
  좁힌다: `typeof failureScenario === 'string'`일 때만 부르고, `null`이면 부르지 않고 곧바로
  `blocking:false` · `reason:"no-failure-scenario"`다(R8 invariant 흡수 — 비문자열을 넘겨 예외를
  만들 경로를 없앤다). `classifyFinding`은 어떤 입력에도 던지지 않는다.
  **`analyzeReviewers`가 `contract` 파생의 단일 주체다** — 전 리뷰어의 전 finding에
  `classifyFinding`을 적용해 아래 4필드를 낸다. 같은 커밋에서 `gate.js` 머리말의 "env를 모른다"를
  DD3a의 문장으로 좁힌다. test를 함께 쓴다(커버리지 항목 1~6).

  ```jsonc
  // analyzeReviewers(reviewers) — 순수. 판정하지 않고 재료만 만든다.
  { "contract": "full" | "partial",
    "blocking": [ { "claim": "…", "severity": "CRITICAL"|"HIGH",
                    "ids": ["A","B"] } ],      // 중복제거 후. 배열이지 개수가 아니다
    "byReviewer": { "A": { "findings": 3, "structured": 3, "blocking": 1 },
                    "B": { "findings": 0, "structured": 0, "blocking": 0 } },
    "distinctIds": ["A","B"],                  // 판정이 쓰는 유일한 다양성 근거
    "mismatches": [ { "id": "A", "reviewerVerdict": "FAIL", "blocking": 0,
                      "kind": "fail-without-blocking" } ] }
  ```

  규칙 4가지를 이 함수가 소유한다.

  - `contract`는 "모든 finding이 `structured:true`"의 **AND**다. finding 0건인 리뷰어는 AND에
    `true`로 기여한다(DD1 — 지적할 것이 없었을 뿐이므로). 리뷰어가 0명이면 `contract`는 `full`
    이지만 판정은 증거 0건 규칙이 먼저 잡는다(DD11).
  - **`analyzeReviewers`는 전역 함수(total function)다 — 어떤 입력에도 던지지 않는다** (R8
    invariant HIGH 흡수: Task 2의 의사코드가 증거 0건 검사보다 **먼저** 이 함수를 부르므로, 빈
    입력에서 던지면 그 경로 전체가 죽는다). `reviewers`가 `[]`·`null`·`undefined`·비배열이면
    **빈 배열로 정규화**한 뒤 `{contract:'full', blocking:[], byReviewer:{}, distinctIds:[],
    mismatches:[]}`를 반환한다. `contract:'full'`이 위험하지 않은 이유는 그 값이 완화를 **혼자**
    켜지 못하기 때문이다 — `bothIds`가 `distinctIds:[]`에서 거짓이므로 판정은 NAUGHTY다.
  - `blocking`은 **배열**이고 정규화 claim으로 중복제거한다(DD9). 판정이 보는 것은 `length > 0`
    뿐이므로 dedupe 정확도가 판정을 바꾸지 않는다. `ids`는 같은 지적을 낸 리뷰어 전부를 담아
    `failing` 파생에 쓰인다.
  - `distinctIds`는 `reviewers[].id`의 중복 제거 결과다. **`decideAdjudicatedVerdict`의 step 4가
    이 필드를 쓴다** — 판정 함수가 id를 다시 세지 않는 이유는 세는 곳이 둘이면 두 값이 갈리기
    때문이고, 그것이 `seal.js#distinctIds`와 게이트가 지금 어긋나 있는 이유이기도 하다(DD8).
  - `mismatches`의 `kind`는 `fail-without-blocking`(리뷰어 FAIL · blocking 0)과
    `pass-with-blocking`(리뷰어 PASS · blocking ≥1) 두 값이다. 후자는 blocking이 이겨 NAUGHTY가
    되지만(커버리지 10) 그 불일치도 기록한다.

  **legacy envelope도 이 함수가 흡수한다.** 원장에 이미 쌓인 envelope에는 `findings`가 없다.
  `analyzeReviewers`는 그 경우 `criticalIssues`에서 `{claim, structured:false}`를 파생한다 —
  `loadReviewer`(기록 시점)와 `analyzeReviewers`(판정 시점) **둘 다** legacy를 흡수해야 하며,
  전자는 새로 들어오는 입력을, 후자는 이미 저장된 원장을 담당한다. 어느 쪽도 크래시하지 않고
  둘 다 `structured:false` → `contract='partial'`로 수렴한다(커버리지 12).
- **Mirror**: `counter.js:31`(env 파서 + loud fail-open) · `counter.js:50`(인자만으로 판정하는
  순수 oracle) · `gate.js:31-55`(입력 비변형)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`

### Task 2: `decideAdjudicatedVerdict` 신규 (`decideVerdict`는 무변경)

- **Action**: 새 export를 추가한다. 판정은 **아래 알고리즘 그대로**다 — R6 invariant HIGH 흡수로,
  "AND로 결합"을 산문으로만 두면 문자열 verdict와 불리언을 무엇으로 어떻게 묶는지가 구현자에게
  남지 않는다. **불리언화가 먼저이고 AND가 나중이다.**

  ```js
  // decideAdjudicatedVerdict({ reviewers, round, cap, severityGate })
  const a = analyzeReviewers(reviewers);        // (1) 정확히 1회. 재호출 금지
  if (reviewers.length === 0)                   // (2) 증거 0건 → 즉시 NAUGHTY (DD11)
    return { verdict: 'NAUGHTY', failing: [], exitReason: null,
             blocking: [], mismatches: [], contract: a.contract };

  // (3) 완화 자격 — 이 한 항만이 severityGate/contract에 좌우된다
  const mitigated = severityGate === 'enforce' && a.contract === 'full';

  // (4) 세 항을 전부 불리언으로 만든 뒤 AND. 어느 항도 다른 항을 덮어쓰지 않는다
  const noBlocking = a.blocking.length === 0;                  // 강화 축 1 — 항상 적용
  const bothIds    = a.distinctIds.length >= 2;                // 강화 축 2 — 항상 적용 (DD8)
  const allPass    = mitigated                                 // 완화 = 이 항의 면제
    ? true
    : decideVerdict({ reviewers, round, cap }).verdict === 'NICE';   // 위임 (커버리지 11)

  const verdict = (noBlocking && bothIds && allPass) ? 'NICE' : 'NAUGHTY';
  ```

  `mitigated`가 거짓일 때 `decideVerdict`의 반환을 **버리지 않고** `=== 'NICE'`로 불리언화해
  AND에 넣는 것이 DD1이 정정한 지점이다. 위임 결과로 **대체**하면 `PASS`를 낸 리뷰어가 쓴
  blocking이 무시되어 `partial`이 `full`보다 느슨해진다. 위 식이 DD1 표와 일치한다 —
  `full`은 `noBlocking ∧ bothIds`, `partial`·`off`는 거기에 `allPass`가 **더** 붙는다.
  `decideVerdict`가 NAUGHTY인데 blocking이 0인 경우는 정의되지 않은 것이 아니라 **NAUGHTY**다
  (AND의 한 항이 거짓이므로). 그 반대도 같다.

  **`failing` 파생**: `verdict === 'NICE'`면 `[]`. 아니면 `a.blocking[].ids` 전부와,
  위임을 탄 경우 `decideVerdict`가 준 `failing`을 합쳐 **입력 순서로 중복 제거**한다(커버리지 9가
  blocking 경로를 고정한다). `bothIds`만 거짓이어서 NAUGHTY가 된 라운드는 실패한 리뷰어가 없으므로
  `failing`은 `[]`이고, 진단은 `contract`·`mismatches`와 `distinctIds`가 진다 — 아무도 실패하지
  않은 라운드에서 누군가를 `failing`에 넣는 것이 더 나쁜 거짓이다.

  반환은 `decideVerdict`의 3필드 + `blocking`·`mismatches`·`contract`다 —
  이것은 **새 함수의 반환 스키마**이므로 동결 대상이 아니다(DD3). test를 함께 쓴다(커버리지
  항목 7~13·21~22·24). 항목 13과 22는 **같은 규칙을 두 경로에서** 잰다 — 13은 위임 경로(`off`),
  22는 완화 경로(`enforce` · contract=full · blocking 0)다. 완화가 실제로 적용되는 쪽에서
  `{A,B}` 완전성이 살아 있는지는 22만 증명하므로, 둘 중 하나만 두면 그 경로가 미검증으로 남는다.
- **Mirror**: `seal.js#deriveVerdict:121-129`(distinct id ≥ 2를 요구하는 기존 층 — M1이 정합시키는
  대상) · `gate.js`의 순수 함수 규약
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` +
  `node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js`

### Task 3: `cli.js` envelope 확장

- **Action**: `loadReviewer`가 **DD4의 파생 표를 그대로 구현**한다 — 원소가 문자열이면 legacy로,
  객체면 4필드를 검사해 `findings`를 합성하고, `criticalIssues`는 claim 문자열 배열로 유지한다.
  **표 4행(`failure_scenario` 부재 → `structured:true`)은 오타가 아니라 의도된 예외다** — 근거는
  DD4의 예외 문단이고, 표만 읽고 "필수 필드 부재이니 강등"으로 구현하면 UI5가 뒤집힌다.
  타입 위반(배열 아님·원소가 문자열/객체 어느 쪽도 아님)은 `SANTA_REVIEWER_INVALID` exit 2 +
  append 0건이고, 계약 미달은 `structured:false` 강등이다. 새 방어를 발명하지 않는다:
  `assertSafeGraph`가 파싱 직후 이미 돌았으므로 prototype pollution은 차단됐고, 여기서 더하는
  것은 필드 타입·열거값·길이 검사뿐이다. `cmdVerdict`는 호출 대상을
  **`decideAdjudicatedVerdict`**로 바꾸고 `parseSeverityGate(opts.env)`를 넘기며, stdout JSON에
  `blocking`·`mismatches`·`contract`를 싣는다. test를 함께 쓴다(커버리지 항목 15~19·21·23).
  항목 23은 `santa-adjudication.test.js`가 소유한다 — fixture repo에서 record → verdict → seal을
  왕복시킨 뒤 산출된 receipt를 읽어 `findings`·`raw`·리뷰어 본문 문자열이 **없음**을 단언한다.
  커버리지 스크립트가 스캔하는 파일은 `santa-adjudication.test.js`와 `santa-gate.test.js` 둘뿐이므로
  이 항목을 `santa-review-gate.test.js`에 두면 스크립트가 찾지 못한다.
- **Mirror**: `cli.js:161-221`의 fail-closed 변환 규약 — 어떤 실패도 exit 2 + append 0건
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` (새 항목이
  사는 곳) **와** `node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` (기존 CLI
  회귀가 깨지지 않았는지) 둘 다. 새 `[N]` 항목을 후자에 쓰면 커버리지 스크립트가 찾지 못한다

### Task 4: `santa-loop.md` severity contract

- **Action**: Step 3의 리뷰어 JSON 스키마 블록에 구조화 `critical_issues` 형태를 싣고, 리뷰어
  프롬프트 요구사항에 "blocker는 `failure_scenario`를 쓸 수 있을 때만" 한 줄을 더한다. Step 4를
  blocking 건수 판정으로 다시 쓰고 `mismatches` 출력을 지시한다. Step 5의 "Fix every flagged
  issue"를 blocking(CRITICAL/HIGH) 전건으로 좁히고 MEDIUM/LOW 보존을 명시한다. FAIL-first 문장은
  무변경이다. **자기 절만 편집한다**(UI15).
- **Mirror**: 현 Step 3/4의 서술 톤과 코드 블록 형식
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`
  (커버리지 항목 14·20 — 프롬프트 문구 회귀 + 스키마 문서화 존재)

### Task 5: 기존 test는 **무변경**, 주석만 갱신

- **Action**: DD3의 재설계로 `decideVerdict`가 무변경이므로 `santa-gate.test.js`의 **모든 단언이
  그대로 참이다** — `:68`("리뷰어 1명 PASS만으로 NICE")도 뒤집지 않는다. 그 test가 고정하는 것은
  이제 "M1이 닫지 않은 구멍"이 아니라 "위임 대상 함수의 현행 동작"이고, 그것이 유지되는 것이
  DD3의 전제다. 바꾸는 것은 `:68`·`:74`의 **주석**뿐이다: "P1 소유 자리 / 의도된 미봉"을
  "`decideAdjudicatedVerdict`의 위임 대상. 이 동작이 바뀌면 `severityGate='off'`와
  `contract='partial'` 경로가 함께 바뀐다"로 고쳐, 다음 독자가 이 단언을 미봉으로 오해해 지우지
  않게 한다. 단언 코드에 diff는 없다.
- **Mirror**: 같은 파일이 이미 쓰는 방식 — 단언 옆에 *왜 이 값이어야 하는가*를 적는다
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js` (Task 1~3 착지
  전후로 각각 1회, 두 번 모두 green이어야 한다 — 이 파일이 red가 되면 동결 함수가 바뀐 것이다)

### Task 6: 문서 · 버전 · PRD 상태

- **Action**: `docs/ENVIRONMENT.md` §11에 `MCCP_SANTA_SEVERITY_GATE`를 등재하고(기본값·판정
  순서·`off`가 더 엄격하다는 비대칭 명시), `docs/santa-loop/ownership.md`에 DD3의 확장 3건을
  기록하며, `plugin.json`을 1.26.1로 bump하고 `CHANGELOG.md`에 `## [1.26.1]`을 추가한다. PRD
  Milestone 1 행을 `in-progress` + Plan 셀 연결로 갱신한다.
- **Mirror**: `docs/ENVIRONMENT.md:357`의 `MCCP_SANTA_ROUND_CAP` 항목 서술 밀도
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version"` 이 `1.26.1`

### Task 7: 실 경로 1회 완주

- **Action**: 이 저장소에서 `/mccp:santa-loop`을 1회 돌린다. 리뷰어 한 명이 `verdict:"FAIL"` +
  MEDIUM 1건(구조화)만 내고 다른 한 명이 PASS를 내는 라운드를 **실제 리뷰어 출력으로** 만든다
  (합성 JSON을 손으로 넣는 것은 이 항목을 충족하지 않는다 — 그것은 이미 커버리지 15~19가
  덮는다). 확인 대상 4개는 아래 Validate의 명령이 각각 기계적으로 검사한다.

  **선행 상태를 어떻게 만드는가** (R7 test 흡수 — 이전 문면은 원장이 이미 있다고 전제했다).
  아래 Validate의 네 명령은 **원장이 존재한 뒤에만** 의미가 있고, 그 원장은 `santa-loop` 자체가
  만든다. 순서는 이렇다:

  1. Task 1~6이 착지한 상태에서 이 브랜치를 대상으로 `/mccp:santa-loop`을 호출한다. decision slug는
     `ledger.js#slugFromBranch`가 브랜치명에서 파생하며 이 브랜치에서는 `santa-adjudication`이다 —
     Validate가 그 값을 하드코딩하므로, 다른 브랜치에서 돌린다면 **명령의 `--decision`을 실제 slug로
     바꾼다**(그 불일치는 backlog에 이미 등재돼 있다).
  2. 커맨드 본문 Step 2~3이 리뷰어 둘을 띄우고 각자의 JSON을 `record`한다. 이 시점에 원장
     `.claude/state/santa-loop/santa-adjudication.json`이 생기고, 그 뒤에야 (a)~(d)를 잴 수 있다.
  3. **시나리오는 강제할 수 없고 강제해서도 안 된다** — 리뷰어 출력을 손으로 만들면 이 Task의
     목적(실경로 1회 완주) 자체가 사라진다. 대신 발생 확률을 높인다: 대상 diff를 M1이 방금 착지시킨
     변경으로 잡으면 blocker 없는 문체·네이밍 지적이 나오기 쉽고, Step 3의 새 문언("blocker는
     `failure_scenario`를 쓸 수 있을 때만")이 그것을 MEDIUM으로 보내는 것이 이 milestone의 가설이다.
     한 라운드에서 안 나오면 **재실행한다**(원장은 라운드를 누적하므로 `--round N`으로 원하는
     라운드를 가리키면 된다). 세 번 돌려도 나오지 않으면 그것은 실행 실패가 아니라 **가설의 반증**이고,
     Risks 1행("항상 `partial`")과 같은 처방 — 임계 완화가 아니라 프롬프트 재작성 — 으로 간다.
  4. **그때 milestone은 complete가 아니다** (R9 invariant MEDIUM 흡수 — 이 Task는 외부 조건에
     의존하므로 실패 시의 처리를 적어 두지 않으면 "안 나왔으니 넘어간다"가 된다). Acceptance 4번째
     항목이 네 산출물 전부를 요구하므로, 시나리오가 재현되지 않으면 **fail-closed로 미완료**이고
     그 사실 자체(3회 시도 · 각 라운드의 `contract`·`mismatches` 값)를 PRD Open Questions에 실측으로
     남긴다. 우회로 합성 JSON을 넣는 것은 금지다 — 그것은 이 Task를 통과시키는 대신 삭제한다.
- **Mirror**: `santa-loop.md` Step 0~7 전 경로 (합성 fixture가 아니라 실제 CLI)
- **Validate**: 아래 4개가 전부 통과해야 한다.
  ```bash
  S=plugins/mccp/scripts/lib/santa/cli.js
  # (a) 원장이 라운드를 기록했다
  node $S status --decision santa-adjudication | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(!(j.rounds>=1))process.exit(1);console.log("rounds="+j.rounds)'
  # (b) 그 라운드의 verdict가 NICE이고 mismatch가 1건 이상이다
  node $S verdict --decision santa-adjudication --round 0 | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(j.verdict!=="NICE"||!(j.mismatches||[]).length)process.exit(1);console.log("NICE with "+j.mismatches.length+" mismatch(es)")'
  # (c) 집계 리포트가 산출됐다
  test -f .claude/reviews/santa-review-santa-adjudication.md
  # (d) receipt에 원장 집계가 봉인됐고 그 값이 원장과 일치한다
  #     타입만 보면 원장 3라운드에 receipt 5가 실려도 통과한다(R8 invariant 흡수) — 두 파일을 대조한다.
  node -e '
    const r=require("./.claude/receipts/mccp-santa-review/santa-adjudication.json");
    const l=require("./.claude/state/santa-loop/santa-adjudication.json");
    if(!Number.isInteger(r.meta.santa_rounds))process.exit(1);
    if(r.meta.santa_rounds!==(l.rounds||[]).length){
      console.error("sealed santa_rounds="+r.meta.santa_rounds+" but ledger has "+(l.rounds||[]).length);
      process.exit(1);}
    console.log("sealed santa_rounds="+r.meta.santa_rounds+" matches ledger")'
  ```

## Validation

```bash
# 단위 + CLI 경유 회귀
node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js
node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js
node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js
node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js
node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js

# 커버리지 계약 — 아래 25개 항목의 [N] id가 test 이름에 존재하고 각 본문에 assert가
# 하나 이상 있는지 (누락·빈 본문 모두 비영점).
# 이 스크립트는 구현 착지 후에 도는 acceptance 검사다. 파일 부재는 ENOENT stack trace가
# 아니라 "아직 만들지 않았다"는 진단으로 나와야 한다 — 틀린 진단은 저자를 엉뚱한 곳으로 보낸다.
node -e '
  const fs=require("fs");
  const files=["plugins/mccp/scripts/lib/tests/santa-adjudication.test.js",
               "plugins/mccp/scripts/lib/tests/santa-gate.test.js"];
  const absent=files.filter(f=>!fs.existsSync(f));
  if(absent.length){console.error("coverage check cannot run — test file(s) not created yet: "+
    absent.join(", "));process.exit(1);}
  const body=files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
  const missing=[], assertless=[];
  for(let i=1;i<=25;i++){
    const at=body.indexOf("["+i+"]");
    if(at===-1){missing.push(i);continue;}
    // 마커부터 다음 test/it 선언까지를 그 항목의 본문으로 본다. assert 호출이 하나도
    // 없으면 통과 티켓이므로 거부한다 — 존재 검사만으로는 빈 본문이 통과한다(R8 흡수).
    const rest=body.slice(at);
    const next=rest.slice(1).search(/\n\s*(?:test|it)\s*\(/);
    const block=next===-1?rest:rest.slice(0,next+1);
    if(!/\bassert\b/.test(block)) assertless.push(i);
  }
  if(missing.length){console.error("missing coverage ids: "+missing.join(", "));process.exit(1);}
  if(assertless.length){console.error("coverage ids present but assert-free (empty test body): "+
    assertless.join(", "));process.exit(1);}
  console.log("coverage 25/25, every item has at least one assertion");
'

# 동결 함수 무변경 + 신규 export 존재 (DD3). decideVerdict가 severity 축을 갖게 되면 red.
node -e '
  const a=require("assert");
  const g=require("./plugins/mccp/scripts/lib/santa/gate");
  const two=[{id:"A",model:"m",verdict:"PASS",criticalIssues:[]},
             {id:"B",model:"m",verdict:"PASS",criticalIssues:[]}];
  const r=g.decideVerdict({reviewers:two});
  a.equal(r.verdict,"NICE"); a.deepEqual(r.failing,[]); a.equal(r.exitReason,null);
  a.deepEqual(Object.keys(r).sort(), ["exitReason","failing","verdict"],
    "decideVerdict return shape must stay exactly 3 fields (ownership.md frozen contract)");
  a.equal(g.decideVerdict({reviewers:[two[0]]}).verdict,"NICE",
    "delegation target must keep its current behaviour — DD3 depends on it");
  ["decideAdjudicatedVerdict","analyzeReviewers","parseSeverityGate"].forEach(function(k){
    a.equal(typeof g[k],"function","missing new export: "+k);
  });
  console.log("frozen function unchanged; 3 new exports present");
'

# §3.5.1 — 이 브랜치가 삭제하는 파일 확인 (의도치 않은 삭제 0건이어야 함)
git diff --diff-filter=D --name-only origin/main...HEAD
```

### 커버리지 계약 (test 이름의 `[N]`)

판정 항목(7~13 · 22 · 24)이 부르는 함수는 **전부 `decideAdjudicatedVerdict`**다. `decideVerdict`를
직접 부르는 항목은 하나도 없다 — DD3대로 그 함수는 무변경이므로 이 항목들의 입력에서 NAUGHTY를
내며, 그 이름으로 test를 쓰면 **동결 함수를 고쳐야 통과한다**(R6 test HIGH 흡수). `decideVerdict`의
현행 동작을 고정하는 단언은 `santa-gate.test.js`와 Validation의 frozen check가 이미 소유한다.

| # | 무엇을 고정하는가 |
|---|---|
| 1 | `parseSeverityGate` — 미설정은 `enforce`, `off`는 `off`, 불량값은 loud warn 후 `enforce` |
| 2 | `classifyFinding` — CRITICAL/HIGH + 실질 `failureScenario` → `blocking:true` |
| 3 | `classifyFinding` — MEDIUM/LOW는 `structured:true`이되 `blocking:false` (보존, UI7) |
| 4 | `classifyFinding` — `failureScenario` 부재/1-token/filler/**30자 미만**(`validateReason`의 하한 — `plugins/mccp/scripts/receipt/lib/force-override-reason.js:42`) → 전부 `blocking:false`. 네 경우를 각각 단언한다 |
| 5 | `classifyFinding` — 미인식 severity → `structured:false` (DD7, blocking으로 올리지 않음) |
| 6 | `analyzeReviewers` — 두 리뷰어의 동일 claim이 `blocking`에서 1건으로 합쳐지고 `byReviewer`는 각각 센다 (dedupe는 별도 export가 아니라 이 함수의 내부 규칙이다 — DD9) |
| 7 | **`decideAdjudicatedVerdict`** — contract=full · blocking 0 · 리뷰어 하나가 FAIL → **NICE** (PRD 1순위 시나리오) |
| 8 | 같은 입력에서 `mismatches`가 그 리뷰어를 지목한다 |
| 9 | contract=full · blocking ≥1 → NAUGHTY, `failing`은 그 finding을 낸 id |
| 10 | 리뷰어가 PASS인데 CRITICAL을 쓴 경우 → NAUGHTY (blocking이 이긴다) + mismatch 기록 |
| 11 | contract=partial(비구조화 1건 혼재) → 현행 규칙으로 판정, 완화 미적용 |
| 12 | `findings` 부재 legacy envelope → partial → 현행 규칙 (크래시 없음, DD4) |
| 13 | `severityGate='off'`에서도 distinct id < 2면 NICE 불가 (DD10 비대칭) |
| 14 | `santa-loop.md`에 FAIL-first 문장이 문자 그대로 남아 있다 (UI1·UI2 회귀 가드). **커맨드 본문을 `fs.readFileSync`로 읽어 단언하는 일반 test다** — `santa-loop-cap.test.js:29`가 `SANTA_LOOP_MD` 상수를 두고 `:854`·`:867`·`:886`·`:1057`에서 같은 방식으로 문서를 검사한다. 문서를 겨눈 항목이라고 해서 test 밖에 있는 것이 아니다 |
| 15 | `cli.js record` — 구조화 `critical_issues`가 `findings`로 들어가고 `criticalIssues` 길이가 보존된다 |
| 16 | `cli.js record` — 문자열 `critical_issues`(legacy)도 그대로 통과한다 |
| 17 | `cli.js record` — `failureScenario`가 2000자를 넘으면 절삭 없이 `structured:false` |
| 18 | `cli.js verdict` — stdout JSON에 `contract`·`mismatches`·`blocking`이 실린다 |
| 19 | `cli.js record` — 잘못된 finding 객체(타입 위반)는 exit 2 + append 0건 |
| 20 | `santa-loop.md` Step 3에 구조화 스키마와 `failure_scenario` 요구가 문서화돼 있다 (항목 14와 같은 방식 — 파일을 읽어 단언한다) |
| 21 | `cli.js cmdVerdict`의 판정 호출 대상이 `decideAdjudicatedVerdict`다 — `decideVerdict` 직접 호출이 실경로에 0건 (DD3의 잔여 대가를 고정). **방법**: `gate` 모듈의 두 export를 호출 카운터로 감싼 뒤 fixture repo에서 `cmdVerdict`를 in-process로 부르고(`santa-loop-cap.test.js:68`의 `runCli` 패턴), `decideAdjudicatedVerdict` ≥1회 · `decideVerdict` 0회를 단언한다. 최종 verdict만 보면 위임 경로와 재구현이 구별되지 않으므로 호출 자체를 재야 한다 |
| 22 | **`severityGate='enforce'` · contract=full · blocking 0 · distinct id 1** → NAUGHTY. 항목 13이 `off` 경로만 덮으므로, 완화가 실제로 적용되는 경로에서 `{A,B}` 완전성이 살아 있는지는 이 항목만 증명한다 (DD8) |
| 23 | `mccp-santa-review` receipt에 `findings`·`raw`·리뷰어 본문이 **부재**한다는 negative 단언 — DD4의 저장 위치 주장(원장 only)을 강제한다. 있어야 할 것의 존재가 아니라 **없어야 할 것의 부재**를 검사하는 유일한 항목이다. **같은 왕복에서 원장 쪽 `envelope.findings`가 비어 있지 않음도 함께 단언한다** — receipt만 보면 `loadReviewer`가 애초에 `findings`를 만들지 않은 경우와 만들었는데 `seal.js`가 떨궈낸 경우가 구별되지 않아, 전자의 결함이 이 항목을 통과한다(R8 invariant 흡수). 두 단언이 함께 있어야 "원장에는 있고 receipt에는 없다"가 검사된다 |
| 24 | `severityGate='off'` **및** `contract='partial'`에서 전원 PASS이지만 blocking ≥1이면 NAUGHTY — 어느 경로도 blocking을 무시하지 않는다. DD1의 단조성("계약 미준수는 더 엄격")을 참으로 만드는 유일한 항목이고, 이것이 없으면 비구조화 finding 하나로 다른 리뷰어의 blocking을 지우는 우회가 남는다 |
| 25 | **두 층이 `{A,B}` 완전성에서 같은 결론을 낸다** — 같은 라운드 입력을 `gate.decideAdjudicatedVerdict`와 `seal.deriveVerdict`에 각각 먹여, distinct id 1개·0개에서 전자가 `NAUGHTY`·후자가 `divergent`이고 2개(그 외 정상)에서 둘 다 통과함을 단언한다(세 입력). **`seal.js`의 내부 `distinctIds`를 직접 부르지 않는다** — 그 함수는 export되지 않고(`module.exports`는 `project`·`renderReport`·`buildProof`·`deriveVerdict`·`seal`·`SantaSealError`·`GATE_ID` 7종뿐) export시키면 DD8이 거부한 P0 선점이 된다(R9 test HIGH 흡수). 두 층의 **관측 가능한 결론**을 대조하는 것이 그 분리의 대가를 갚는 기계 장치이고, 내부 헬퍼의 반환값 일치보다 실제로 지켜야 할 불변식에 가깝다 |

**커버리지 항목은 전부 `santa-adjudication.test.js`가 소유한다** — 단 하나의 예외가
`santa-gate.test.js`이고, 그 파일은 Task 5대로 **단언 코드에 diff가 없으므로** 새 `[N]`을 받지
않는다. 즉 실제로는 23개 항목 전부가 신규 파일 하나에 들어간다. 커버리지 스크립트가 그 두
파일만 스캔하는 것도 같은 이유다. 항목이 다루는 대상이 `cli.js`든 `santa-loop.md`든 receipt든,
**test가 사는 곳은 이 파일**이다 — 대상 모듈별로 파일을 나누면 스크립트가 찾지 못한다.

## Review Rounds

L2 반증 패널(architect · security · test · invariant, quorum 3-of-4)의 라운드 이력이다. 흡수·기각
판단은 CLAUDE.md §3.14를 따른다 — CRITICAL·HIGH만 그 자리에서 흡수하고, MEDIUM·LOW와 기각한
HIGH는 근거와 함께 backlog에 남긴다.

### R1 — 4/4 fail, blocking 12건 → divergent

흡수한 것:

| 출처 | 지적 | 흡수 |
|---|---|---|
| architect CRITICAL | `decideVerdict` 시그니처 변경은 §변경 프로토콜 (2)가 아니라 (1)에 해당 — P0 재개 사안 | **DD3 전면 재작성.** 동결 함수 무변경 + `decideAdjudicatedVerdict`/`analyzeReviewers`/`parseSeverityGate` 3개 신규 export. Validation에 반환 3필드 고정 단언 추가 |
| architect HIGH · security MEDIUM ×3 · invariant HIGH·MEDIUM | 리뷰어 **입력** 스키마가 plan 어디에도 없다 — envelope(출력)만 보여준다 | **DD4에 입력 스키마 + 파생 표 4행 추가.** 필드명·타입·열거값·길이 상한 명시. "타입 위반은 거부, 계약 미달은 강등"으로 fail-open 경로를 닫음 |
| security MEDIUM ×1 | `failureScenario` 검증이 어디서 일어나는지 미명세 | **DD5에 2층 표 추가** — 기록 시점(`loadReviewer`, 형태)과 판정 시점(`classifyFinding`, 실질성)의 분업과 그 이유 |
| invariant HIGH | `contract` 파생의 주체·방법이 어느 Task에도 없다 | **Task 1에 명시** — `analyzeReviewers`가 단일 파생 주체이고 AND 규칙과 0건 처리를 함께 규정 |
| test CRITICAL | Validation 스크립트가 미생성 파일을 `readFileSync`해 ENOENT로 죽는다 | **존재 검사 선행 + 진단 메시지**로 교체 |
| test HIGH | 커버리지 7과 기존 `santa-gate.test.js:68`의 관계가 모호 | DD3 재설계로 자동 해소 — `:68`은 **무변경**이고 Task 5는 주석만 고친다 |
| invariant MEDIUM | `gate.js`가 "env를 모른다"고 적어 놓고 env 파서를 추가한다 | **DD3a 신설** — 판정 함수는 env를 모르고 파서만 안다(`counter.js` 동형). 머리말 수정을 Task 1에 포함 |
| invariant MEDIUM | Task 7 acceptance가 코드베이스에 anchor되지 않음 | **Validate를 실행 가능한 4개 명령으로 교체**. 합성 JSON 투입은 이 항목을 충족하지 않음을 명시 |

기각한 것 (증거 첨부 — §3.14):

- **test CRITICAL 2 / HIGH 2 — "커버리지 1~21이 존재하는지 검증할 수 없다. test 코드가 plan에
  없다."** 범주 오류다. plan은 구현 명세이고 test 코드를 담는 산출물이 아니다 — 이 저장소의
  어떤 plan도 test 본문을 담지 않으며(`.claude/PRPs/plans/archived/santa-loop-materialize-m1.plan.md`
  가 같은 형식이고 그 milestone은 ship됐다), 커버리지 계약은 구현 착지 **후** Validation이
  기계적으로 검사하도록 설계돼 있다. 같은 지적이 이 저장소의 `mccp:review-test`에서 R3·R6·R8에
  반복 관측됐고(STATE.md Open Questions), 그것이 plan 결함이 아니라 리뷰어 프롬프트 축의 문제라는
  판단이 이미 기록돼 있다. 이전 3회에 이은 네 번째 관측으로 backlog에 append한다.
- **invariant MEDIUM 4 — "envelope에 `findings`를 더하는 것은 receipt schema 변경이므로 migration이
  필요하다."** 전제가 틀렸다. `findings`가 들어가는 곳은 **원장**(`.claude/state/santa-loop/
  <slug>.json`, gitignored)이지 receipt가 아니다. receipt에 실리는 santa 필드는
  `schema.js:886-907`의 4종(`santa_rounds`·`santa_entries`·`santa_cap`·`santa_exit_reason`)뿐이고
  전부 집계 정수라 이 변경에 닿지 않는다. 원장 쪽 하위 호환은 DD4가 `findings` 부재 →
  `structured:false` → `partial`로 이미 처리하며, `ledger.js:311`이 `entries` 부재를 이미 관용하고
  `SCHEMA_VERSION`은 additive라 bump가 불필요하다.
- **security MEDIUM ×3 중 잔여** — 전부 입력 스키마 축이라 위 흡수로 함께 닫혔다. 별도 backlog
  항목을 만들지 않는다.

### R2 — security pass, 나머지 3인 fail, blocking 9건 → divergent

blocking이 12 → 9로 줄었고 security가 fail → **pass**로 전환했다(findings 0, refutation 근거를
입력 검증 흐름·env 우회·경로 봉인·prototype pollution·legacy 호환 6축으로 명시).

흡수한 것:

| 출처 | 지적 | 흡수 |
|---|---|---|
| architect CRITICAL | Acceptance가 "커버리지 20/20"인데 표는 21항목이고 스크립트는 21을 검사·출력한다 | Acceptance를 21/21로 정정하고 "신규 export 3종 존재"도 함께 명시 |
| architect HIGH | `findings`의 **저장 위치**가 본문 어디에도 없다 — 기각 응답에만 있어 구현자가 receipt로 오해할 수 있다 | **DD4 머리에 저장 위치 표 3행 신설.** 원장(gitignored) vs receipt(집계 정수 4종)를 갈라 적고 migration 불필요 근거를 본문으로 올림 |
| invariant HIGH | `analyzeReviewers`의 반환 4필드 중 `byReviewer`·`mismatches`가 정의되지 않았다 | **Task 1에 반환 jsonc + 규칙 4항 신설.** `blocking`이 개수가 아니라 배열임, `mismatches.kind` 2값, `byReviewer` 구조를 전부 명시 |
| invariant HIGH | step 4의 distinct id를 **무엇으로** 계산하는지 불명 | `analyzeReviewers`가 `distinctIds`를 내고 판정은 그것만 쓴다고 명시. 두 곳에서 세면 두 값이 갈리며, 그것이 지금 `seal.js#distinctIds`와 게이트가 어긋난 원인이다(DD8) |
| architect MEDIUM (부수) | `blocking`의 타입·알고리즘, `byReviewer` 구조 미명세 | 위 invariant HIGH와 **같은 블록**에서 닫혔다. §3.14상 MEDIUM은 backlog 대상이나, HIGH 흡수가 지나는 자리에 한 줄을 더 적는 것이 별도 항목을 만드는 것보다 정직하다 |
| invariant MEDIUM (부수) | legacy envelope 합성이 **어느 모듈**에서 일어나는지 불명 | 같은 블록에서 닫혔다 — `loadReviewer`는 새 입력을, `analyzeReviewers`는 이미 저장된 원장을 담당한다 |

기각한 것 (증거 첨부):

- **test HIGH ×2 — "커버리지 [15-21]이 어느 test 파일에도 없다" / "envelope 변환이 실제로
  일어나는지 검사되지 않는다."** R1과 **같은 범주 오류의 다섯 번째 관측**이다. R2 프롬프트는 이미
  `## SCOPE OF THIS ARTIFACT` 문단으로 "예정된 test·함수·모듈의 부재는 defect가 아니다"를 명시했고
  test 관점에는 "R1에서 세 번 제기돼 증거와 함께 기각됐다"까지 덧붙였는데도 재발했다. 후자
  주장은 사실관계도 틀렸다 — Validation은 커버리지 id 존재 검사와 `node --test` 실행을 **둘 다**
  담고 있고(후자가 단언을 실제로 돌린다), 리뷰어는 앞의 스크립트만 읽고 뒤의 5줄을 보지 않았다.
  backlog 항목을 다섯 번째 관측으로 갱신한다.
- **test MEDIUM — "새 export를 빠뜨려도 frozen check가 통과한다."** 사실이 아니다. 그 스크립트는
  `["decideAdjudicatedVerdict","analyzeReviewers","parseSeverityGate"].forEach(k => assert.equal(
  typeof g[k],"function"))`을 이미 담고 있어 하나라도 없으면 비영점으로 죽는다. 리뷰어가 인용한
  라인 범위(436-450)가 그 단언을 포함한다.
- **invariant MEDIUM — "Task 3가 `assertContained`를 인용하지 않는다."** M1은 새 경로를 만들지
  않는다. `--reviewer-file`은 이미 `cli.js:170`이 `assertContained`로 봉인하고 있고, M1이 더하는
  것은 그 파일 **안의 필드 검사**뿐이라 새 경로 표면이 0이다. 봉인할 대상이 없는 곳에 봉인
  호출을 적는 것은 방어가 아니라 장식이다.

MEDIUM 잔여(test 4건 · invariant 2건)는 §3.14대로 backlog에 append한다.

### R3 — architect·security·invariant pass, test만 fail, blocking 6건 → divergent

blocking이 12 → 9 → **6**으로 줄었고 3/4가 pass다. 남은 fail은 test 하나이며, 이번에는 **실질
지적 2건**을 냈다 — R3 프롬프트가 기각된 4개 축을 명시적으로 out-of-scope로 선언한 뒤 나온
변화다. 그 2건을 흡수한다.

| 출처 | 지적 | 흡수 |
|---|---|---|
| test CRITICAL | `distinctIds < 2` 규칙을 커버리지 13이 **`off` 경로에서만** 잰다. 완화가 실제로 적용되는 `enforce` · contract=full · blocking 0 경로에는 해당 항목이 없다 | **커버리지 22 신설.** Task 2에 "13과 22는 같은 규칙을 두 경로에서 잰다"를 명시 — 완화 경로의 `{A,B}` 완전성은 22만 증명한다 |
| test CRITICAL | DD4가 "`findings`는 receipt에 실리지 않는다"고 주장하는데 그것을 강제하는 negative 단언이 없다 | **커버리지 23 신설.** 없어야 할 것의 **부재**를 검사하는 유일한 항목이고, 소유 파일을 `santa-adjudication.test.js`로 못박았다(스크립트가 스캔하는 두 파일 중 하나여야 하므로) |

이 흡수로 커버리지가 21 → 23이 되므로 R2에서 architect가 CRITICAL로 잡았던 **세 표면**(표 ·
스크립트 상한 · Acceptance 문구)을 같은 편집에서 동기화했다.

기각한 것:

- **test HIGH ×2 — "test 파일이 아직 없어 항목 1~13이 실행되지 않는다" / "cli.js 변환의 입출력
  쌍이 plan에 없다."** R3 프롬프트가 `## OUT OF SCOPE`로 (a)(b)(d)를 명시적으로 배제했는데도 나온
  **여섯 번째** 관측이다. 다만 이번 라운드에서 같은 리뷰어가 실질 2건을 함께 냈으므로, 프롬프트
  보강은 부분적으로 작동했다 — 축이 사라지지 않고 비중이 줄었다.
- **test MEDIUM ×2 · invariant MEDIUM ×3** — §3.14대로 backlog. invariant는 MEDIUM만 냈으므로
  verdict가 `pass`다.

### R4 — architect·security·invariant pass (findings 0), test만 fail, blocking 3건 → divergent

blocking 12 → 9 → 6 → **3**. 세 관점이 findings **0건**으로 pass했고, R3에서 흡수한 커버리지
22·23이 깨뜨린 것이 없음을 architect·invariant가 각각 확인했다.

test의 finding 3건(HIGH·HIGH·MEDIUM)은 **전부 하나의 전제**에서 나왔다: "커버리지 14·20은 문서
검증 항목이므로 test 파일 이름에 `[N]`을 넣을 수 없고, 따라서 커버리지 스크립트가 영원히
`missing coverage ids: 14, 20`으로 죽는다."

**그 전제는 반증됐다.** 문서 내용을 겨눈 단언도 test 파일이 파일을 읽어 수행하는 일반 test이고,
이 저장소에 선례가 넷 있다 — `santa-loop-cap.test.js:29`가 `SANTA_LOOP_MD` 상수를 정의하고
`:854`·`:867`·`:886`·`:1057`이 그것을 `readFileSync`로 읽어 커맨드 본문을 검사한다. 이 plan은
그 파일을 Patterns to Mirror의 "프롬프트 문구 회귀" 행에 이미 인용하고 있었다. 따라서
`test('[14] santa-loop.md에 FAIL-first 문장이 남아 있다', …)`는 정상적으로 작성 가능하고
스크립트도 그것을 찾는다.

기각하되 **오해가 재발하지 않도록 커버리지 표 14·20 행에 그 방식과 선례 4곳을 명시**했다 —
리뷰어가 두 번 같은 곳에서 미끄러졌다면 그것은 문서가 덜 말한 것이기도 하다.

이 라운드로 test 리뷰어의 축은 **일곱 번째** 관측이 됐고, 세 라운드 연속 같은 계열(반증 불가능한
전제 → HIGH)이라 backlog 항목을 그에 맞게 갱신한다.

### R5 — architect pass, security malformed, test·invariant fail → divergent. **설계 결함 1건 발견**

security 워커가 구조화 출력을 내지 못해(`StructuredOutput` 미호출) 이 라운드에서 빠졌다. 남은
셋 중 architect는 findings 0으로 pass했고, invariant가 **이 게이트를 다섯 라운드 돌린 값을
혼자 회수하는 지적**을 냈다.

| 출처 | 지적 | 흡수 |
|---|---|---|
| invariant CRITICAL | **DD1의 "계약 미준수는 더 엄격"이 거짓이다.** `partial`이 blocking 규칙을 *대체*하므로, A가 `PASS`를 내면서 CRITICAL을 쓰고 B가 비구조화 finding을 내면 → contract=partial → 전원 PASS → **NICE**. 완화 규칙이었다면 NAUGHTY였다. 비구조화 finding 하나로 다른 리뷰어의 blocking이 지워진다 | **규칙을 대체에서 누적으로 바꿨다.** `full`은 `blocking===0 ∧ distinct≥2`, `partial`·`off`는 거기에 `allPass`가 **더** 붙는다. 이제 포함 관계가 성립해 DD1의 명제가 참이 된다. Task 2 step 3을 AND 결합으로 다시 쓰고 커버리지 24를 신설 |
| (같은 결함의 두 번째 표면) | DD10의 "`off`가 더 엄격하다"도 같은 이유로 거짓이었다 | **DD10 재작성.** `off`가 끄는 것은 *완화* 하나뿐이고 강화 축 둘(blocking 게이트 · `{A,B}` 완전성)은 어느 값에서도 적용된다고 명시 |
| invariant HIGH | 문자열과 객체가 섞인 `critical_issues`의 변환 규칙이 미명세 | DD4 파생 표가 **원소 단위**로 적용됨을 명시하고, 두 배열 길이가 언제나 입력 원소 수와 같다는 불변식(= `criticalIssueCount` 보존 조건)을 적었다 |
| test HIGH | 커버리지 15~19의 소유 파일이 지정되지 않았고 Task 3의 Validate는 `santa-loop-cap.test.js`를 가리켜, 스크립트가 스캔하지 않는 파일에 항목이 갈 수 있다 | **커버리지 표 아래에 소유 규칙을 명시** — 전 항목이 `santa-adjudication.test.js`에 산다. Task 3 Validate를 두 파일로 나누고 각각의 목적을 적었다 |
| test MEDIUM | 커버리지 6이 `mergeBlocking`을 부르는데 export 표에 그런 이름이 없다 | plan 내부 모순이라 즉시 정정 — R2에서 `analyzeReviewers`로 통합했는데 이 행만 옛 이름이 남아 있었다 |

기각:

- **invariant CRITICAL ×1 — "distinct-id 검사를 넣으면 `santa-gate.test.js:68`이 red가 되어 P0의
  보존 계약을 깬다."** 두 함수를 하나로 읽은 결과다. 그 검사는 `decideAdjudicatedVerdict`에만
  들어가고 `:68`은 `decideVerdict`를 호출하는데, DD3에 따라 그 함수는 **무변경**이다. 오해가
  두 번 나오지 않도록 DD8에 그 관계를 한 문단으로 명시했다.
- **test MEDIUM ×1 — "Validation은 5개 파일을 돌리는데 커버리지는 2개만 스캔한다."** 설계 의도다.
  실행은 회귀 그물 전체를 돌려야 하고(기존 4개가 깨지지 않았는지), 커버리지는 이 milestone이
  **새로 쓰는** 항목만 세야 한다. 다만 그 의도가 적혀 있지 않았으므로 소유 규칙 문단에 함께 적었다.

**이 라운드가 게이트의 값을 보여준다.** 다섯 라운드 중 넷은 명세 정밀도를 다퉜지만, R5의
invariant는 통과했다면 그대로 구현됐을 **우회 경로**를 찾았다 — 그리고 그 우회는 M1이 닫으려는
바로 그 종류(증거 없이 게이트를 통과시키는 경로)였다.

### R6 — 4/4 fail, blocking 11건(실질 HIGH/CRITICAL 7 + bare-verdict 합성 4) → divergent

R5의 흡수가 **본문 요약면과 어긋난 채로 남은 것**이 이 라운드의 주제다. R1이 DD3를 전면 재작성할
때 `## Files to Change` 표와 커버리지 표 7행은 옛 설계(동결 함수 확장)의 문장을 그대로 갖고 있었고,
architect와 test가 서로 다른 lens에서 같은 잔재를 각각 잡았다. 나머지 둘은 DD4·Task 2의 명세가
**두 곳에서 서로 다른 말을 한다**는 지적이다.

| 출처 | 지적 | 흡수 |
|---|---|---|
| security CRITICAL | `failure_scenario` 부재의 처리가 세 곳에서 어긋난다 — 입력 스키마는 `필수`, 서술은 "계약 미달은 `structured:false`", 파생 표 4행은 `structured:true` | **DD4에 예외 문단 2개 신설.** `claim`·`severity`·길이는 *구조화의 조건*이고 `failure_scenario`는 *blocking의 조건*(UI5·DD6)이므로 부재는 강등이 아니다. 서술 문장을 "구조화 필드"로 좁히고, 입력 스키마 주석을 "blocking을 주장할 때만 필수"로, 표 4행 라벨을 "의도된 예외"로 고쳤다. 반대로(강등으로) 정합시키면 LOW 주석 하나에 30자 시나리오를 요구하게 되어 라운드가 상시 `partial`이 되고 게이팅이 도달 불가가 된다 |
| security HIGH ×1 | 표대로면 `severity:HIGH` + 시나리오 부재가 `structured:true`로 살아남아 집계에서 blocking으로 오계수될 수 있다 | 같은 블록에서 닫혔다. 다만 **주장된 우회는 실재하지 않는다** — blocking 자격을 정하는 곳은 `classifyFinding` 하나뿐이고 그 함수가 `failureScenario` 실질성을 요구하므로(DD6·커버리지 4) severity 문자열만으로 blocking이 되는 경로가 없다. 그 사실을 DD4에 명시했다 |
| security HIGH ×1 | Task 3이 "표를 그대로 구현"이라고만 해서 구현자가 표의 4행을 결함으로 읽고 반대로 만든다 | Task 3 Action에 "표 4행은 오타가 아니라 의도된 예외"를 명시 |
| architect HIGH ×2 | `## Files to Change` 61행이 "`decideVerdict` 재배선", 66행이 "`decideVerdict` 반환 확장 기록" — **DD3가 금지한 바로 그 문장**이 요약 표에 남아 있다 | 두 행을 DD3 문언으로 교체. 같은 표의 65행(`santa-gate.test.js`를 "봉인 단언으로 갱신")도 Task 5의 "단언 코드 무변경"과 어긋나 있어 **같은 편집에서 함께** 고쳤다 — 리뷰어가 지목한 두 행만 고치면 같은 모순이 인접 행에 남는다 |
| test HIGH | 커버리지 7행이 `decideVerdict`를 이름으로 부르는데, 그 함수는 DD3대로 무변경이라 그 입력에서 NAUGHTY를 낸다. 그 이름으로 test를 쓰면 **동결 함수를 고쳐야 통과한다** | 7행을 `decideAdjudicatedVerdict`로 정정하고, 커버리지 표 위에 "판정 항목(7~13·22·24)은 전부 새 함수를 부른다"를 명시 |
| invariant HIGH | Task 2가 "위임 결과를 (3b)와 AND로 결합"이라고만 해서, 문자열 verdict와 불리언을 무엇으로 묶는지가 구현자에게 남지 않는다 | **Task 2 Action을 의사코드로 교체.** 세 항(`noBlocking`·`bothIds`·`allPass`)을 전부 불리언화한 뒤 AND하며, `mitigated`가 `allPass` 한 항만 면제한다. `failing` 파생 규칙도 함께 명시 |
| invariant MEDIUM ×3 (부수) | 같은 축 — "AND의 우선순위·결합 순서가 Task 2 Action에 없다" | 위 의사코드가 셋을 함께 닫는다. §3.14상 MEDIUM은 backlog 대상이나, HIGH 흡수가 지나는 자리라 R2 선례대로 같은 블록에서 처리한다 |
| architect MEDIUM (부수) | 62행이 "변환 주체는 CLI"의 근거로 DD9를 인용하는데 DD9는 dedupe 절이다 | 같은 표를 고치는 편집이라 인용을 DD4로 정정 |

기각한 것 (증거 첨부 — §3.14):

- **invariant MEDIUM — "plan 헤더 L3의 `Plan version: sha256:e58916b2…`를 검증하는 단계가 없다."**
  인용이 실재하지 않는다. plan 3행은 `**Source PRD**: .claude/prds/santa-adjudication.prd.md`이고,
  그 sha256 문자열은 plan 본문이 아니라 **리뷰어 자신의 프롬프트**에 있는 값이다
  (`plan-review.js:67` `'Plan version:      ' + reviewedPlanHash`). 게다가 그 검증은 이미 기계로
  존재한다 — `emit-workflow-args`가 L2 발화 **전에** 해시를 계산해 봉인하고, `write.js`가 디스크의
  plan이 그 해시로 되돌아가지 않으면 receipt를 exit 12로 거부한다(`/mccp:plan` 5.2 불변식 ii).
- **test MEDIUM — "24개 항목이 한 파일에 공존하면 setup/teardown이 충돌한다."** 반례가 있다.
  `santa-loop-cap.test.js`가 이미 tmpdir `git init` fixture(`:38`)와 in-process `runCli`(`:68`)와
  `readFileSync` 문서 단언(`:29`·`:854`)을 **한 파일에서** 돌린다. `node:test`는 test별 setup을
  가지므로 충돌 자체가 성립하지 않는다.
- **test MEDIUM — "`cmdVerdict`의 출력 스키마가 기존 3필드 유지인지 교체인지 불명."** Task 2가
  "반환은 `decideVerdict`의 3필드 + `blocking`·`mismatches`·`contract`"라고 이미 적었고 Task 3은
  "**싣는다**"(추가)라고 적었다. 다만 두 문장이 서로 다른 Task에 흩어져 있는 것은 사실이라
  backlog에 남긴다.

**R6에서 bare-verdict 합성이 처음으로 판정에 실제로 섞였다.** blocking 11건 중 4건은
리뷰어가 낸 finding이 아니라 `quorum.js:175-181`이 `verdict='fail'` 하나로 합성한
`severity:'FAIL'` 항목이다(CLAUDE.md §3.14가 해제 조건으로 지목한 그 누수). 라운드 판정은
§3.14대로 **미흡수 HIGH/CRITICAL 부재**를 기준으로 한다.

### R7 — architect·security pass(findings 0), test·invariant fail. **HIGH/CRITICAL 0건** → divergent

blocking이 **2건뿐이고 둘 다 리뷰어가 낸 finding이 아니다** — `quorum.js:175-181`이
`verdict='fail'` 하나로 합성한 `test/FAIL` · `invariant/FAIL`이다. 실제 findings는 MEDIUM 4 · LOW 2
이고 CRITICAL·HIGH는 **0건**이다. R6의 흡수(요약면 정합 · DD4 예외 · Task 2 의사코드 · 커버리지 7)가
깨뜨린 것이 없음을 architect와 security가 findings 0으로 각각 확인했다.

**§3.14의 MEDIUM-backlog 규칙을 이 라운드에는 적용하지 않고 여섯 건을 전부 흡수했다.** 근거는
§3.14 자신의 문언이다 — 그 절은 "finding 수용 범위만 정하고 게이트를 끄지 않는다"고 명시하며,
`/mccp:santa-loop`의 라운드 판정 override는 그 커맨드에 한정된다. 이 게이트의 수렴 조건은
`quorum.required=3`(4명 중 3명 pass)이라 MEDIUM을 backlog로 보내면 두 리뷰어가 `fail`로 남아
**라운드가 끝나지 않는다.** 여섯 건 모두 설계를 바꾸지 않는 명세 명확화라, 흡수가 재논쟁보다 싸다.

| 출처 | 지적 | 흡수 |
|---|---|---|
| invariant MEDIUM | `parseSeverityGate`가 불량값을 `enforce`로 떨어뜨리는데 `off`가 더 엄격하므로 이는 **덜 엄격한 쪽**으로의 fail-open이다 | **엄격도 순서를 DD10에 명시.** `off ⊃ enforce`가 참임을 인정하고 default를 유지하는 근거 3항(도달 가능한 최저조차 M0보다 엄격 · `off` default는 오타가 kill switch를 켠다 · `counter.parseCap` 선례 일관성)과 틀렸을 때의 대가(상수 1개 + 커버리지 1 기대값)를 적었다 |
| invariant MEDIUM | `classifyFinding`의 반환 계약이 4필드 이름만 있고 타입·값 집합이 없다 | Task 1에 반환 jsonc 신설. `reason`은 보고 전용이고 판정은 `blocking` 불리언만 본다는 분리를 명시 |
| invariant LOW · test LOW | DD4 파생 표가 길이·열거값만 적고 **타입**을 적지 않아 `null`·숫자·빈 문자열의 처리가 미정 | DD4에 **필드 타입 규약 표** 신설. 판정은 `typeof === 'string'` 하나로 하고, `failure_scenario`만 "키 부재 = `null` = 부재"로 예외 처리하되 `42`는 계약 위반, `""`은 길이 위반으로 각각 강등 |
| test MEDIUM | 커버리지 4가 `validateReason`의 **30자 하한**을 재지 않는다 — 부재·1-token·filler만 덮는다 | 항목 4에 "30자 미만"을 더하고 근거를 `plugins/mccp/scripts/receipt/lib/force-override-reason.js:42`(`MIN_LENGTH = 30`, 실측 확인)로 고정. 네 경우를 각각 단언하도록 명시 |
| test MEDIUM | Task 7의 Validate 4개가 **원장이 이미 있다고 전제**한다 — 그 상태를 무엇이 만드는지, 시나리오를 어떻게 얻는지가 없다 | Task 7 Action에 선행 상태 3단계 신설. slug 파생·재실행·`--round N` 지시를 적고, **시나리오를 손으로 만들면 이 Task의 목적이 사라진다**는 것과 3회 재실행에도 안 나오면 그것이 가설의 반증이라는 것을 명시 |

기각한 것: 없다. LOW 2건도 같은 편집 자리에서 닫혔다.

### R8 — security만 pass, blocking 12건 → divergent. **후퇴한 라운드**

R7에서 findings 0으로 pass했던 architect가 CRITICAL을 들고 돌아왔다. 이것은 노이즈가 아니라 이
게이트의 구조적 성질이다 — 표준 프롬프트는 매 라운드 **전면 재검토**이므로 직전 라운드의 흡수가
만든 새 문장이 곧 새 리뷰 표면이 된다. 그래도 이번 CRITICAL은 실질이었다.

**HIGH 4건이 한 축이었다** — 커버리지 `[N]` 존재 검사가 빈 본문을 통과시킨다(test 2건 · invariant
1건 · test의 파생 1건). 그 한계는 R2 backlog에 "계약의 알려진 한계"로 이미 적혀 있었는데, 세
관점이 각기 다른 항목(4 · 21 · 23)에서 같은 구멍에 도달했다. 알려진 한계를 backlog에 다시 적는
것은 답이 아니라고 보고 **기계로 닫았다.**

| 출처 | 지적 | 흡수 |
|---|---|---|
| test HIGH ×2 · invariant HIGH ×1 | 커버리지 스크립트가 `[N]` **존재**만 보므로 `test('[4] …', () => {})` 빈 본문이 통과한다 | **스크립트에 assert 검사 추가.** 마커부터 다음 `test(`/`it(` 선언까지를 그 항목의 본문으로 잘라 `\bassert\b`가 없으면 비영점으로 죽는다. 존재 검사와 별개 목록(`assertless`)으로 보고해 진단이 섞이지 않게 했다 |
| test HIGH | 커버리지 21(위임 호출 대상)의 **검사 방법**이 없다 — 최종 verdict만 보면 위임과 재구현이 구별되지 않는다 | 항목 21에 방법 명시 — 두 export를 호출 카운터로 감싸고 in-process `runCli`로 `cmdVerdict`를 부른 뒤 `decideAdjudicatedVerdict` ≥1 · `decideVerdict` 0을 단언. R2 backlog의 미해결 항목(2)을 여기서 닫는다 |
| architect CRITICAL + HIGH | `distinctIds`를 세는 곳이 여전히 둘(새 `analyzeReviewers` · `seal.js` 91행)인데 plan은 "정합시킨다"고만 하고 코드 차원 장치가 없다 | **DD8에 대가를 명시하고 커버리지 25를 신설.** 합치지 않는 이유 둘(`seal.js`는 소유권 표 밖 P0 · gate 순수성)을 적고, 주장을 "한 곳에서만 센다"가 아니라 **"두 곳에서 세되 갈리면 즉시 red"**로 낮춘 뒤 그 red를 내는 test를 만들었다 |
| invariant HIGH | Task 2 의사코드가 증거 0건 검사보다 **먼저** `analyzeReviewers`를 부르는데, 빈 입력에서의 반환이 정의돼 있지 않다 | Task 1에 **전역 함수(total) 계약** 추가 — `[]`·`null`·비배열을 빈 배열로 정규화하고 5필드 기본값을 반환한다. `contract:'full'`이 위험하지 않은 이유(`bothIds`가 거짓이라 완화를 혼자 켜지 못함)도 함께 |
| invariant HIGH · test MEDIUM ×2 | `classifyFinding`이 `validateReason`을 부를 때의 예외 경로가 없고, 재구현 대 import도 미지정 | Task 1에 **import 의무**와 호출 조건(`typeof === 'string'`일 때만) 명시. `null`이면 부르지 않고 `reason:"no-failure-scenario"`로 곧장 간다 — 비문자열을 넘겨 예외를 만들 경로 자체를 없앤다 |
| invariant MEDIUM | 커버리지 23이 receipt만 보므로, `loadReviewer`가 애초에 `findings`를 안 만든 경우와 만들었는데 seal이 떨궈낸 경우가 구별되지 않는다 | 항목 23에 **원장 쪽 `envelope.findings` 비어있지 않음** 단언을 추가. 두 단언이 함께 있어야 "원장에는 있고 receipt에는 없다"가 검사된다 |
| invariant MEDIUM | Acceptance (d)가 `santa_rounds`의 **타입만** 보므로 원장 3라운드에 receipt 5가 실려도 통과한다 | (d) 명령을 원장 파일과 대조하도록 교체 |

기각한 것 (증거 첨부):

- **architect HIGH — "Validation이 `santa-seal.test.js`를 돌리는데 `seal.js`는 Files to Change에
  없다. 순환 의존이다."** 회귀 test의 정의를 뒤집은 주장이다. 바꾸지 않는 모듈의 test를 돌리는
  것은 **바뀌지 않았음을 증명하기 위해서**이고, Risks 4행이 그 목적을 명시한다("envelope 확장이
  `criticalIssueCount`를 바꾼다 → `santa-seal.test.js`를 Validation에 넣어 회귀를 잡는다").
  이 규칙대로라면 회귀 그물의 나머지 셋(`santa-gate` · `santa-loop-cap` · `santa-review-gate`)도
  전부 빼야 하며, 그것은 M1이 남의 모듈을 깨뜨려도 모르는 상태를 뜻한다.
- **test MEDIUM ×1 — 커버리지 4를 인용만 하고 결함을 진술하지 않았다.** `claim`이 plan 문장의
  재인용이고 무엇이 잘못됐는지가 없다. 판정할 대상이 없으므로 기각한다.
- **test MEDIUM ×1 — Task 7의 slug 하드코딩.** R2 backlog 등재 + R7에서 Task 7에 대응 지시를 이미
  적었다. 파라미터화는 M1 범위 밖(Validate 명령은 실행 기록이지 재사용 스크립트가 아니다).
- **test MEDIUM ×1 · LOW ×1 — 항목 23의 fixture 전략·`validateReason` 설정 drift.** 전자는 구현
  선택이고, 후자는 위 import 의무로 닫혔다.

### R9 — security pass, 나머지 3인 fail (architect CRITICAL ×2 · test HIGH · invariant HIGH) → divergent

R8보다 findings가 줄었고(12 → 9), **두 HIGH가 직전 라운드의 흡수를 정확히 겨눴다** — R8에서 새로
쓴 커버리지 25와 `classifyFinding` 반환 계약이 각각 대상이다. 흡수가 새 표면을 만들고 다음 라운드가
그것을 검사하는 구조가 이번에는 유효하게 작동했다.

| 출처 | 지적 | 흡수 |
|---|---|---|
| architect CRITICAL ×2 | DD6이 blocking 자격에 `severity ∈ {CRITICAL, HIGH}`를 요구하면서 근거를 "PRD Scope MVP (1)·(2)"에 둔다고 적었는데, **PRD의 그 두 항목은 severity 임계를 정하지 않는다** — (1)은 프롬프트 축, (2)는 입력 shape 축이다. 임시 규칙(§3.14)이 삭제되면 근거가 사라진다 | **과장이었음을 인정하고 근거를 실제 행으로 교체.** Delivery Milestone 1의 Outcome("문구·스타일 지적이 NAUGHTY를 만들지 못하고")과 Success Metrics의 `severity 게이팅` 행이 severity 축을 요구하는 실제 문언이다. 더해서 **두 조건이 왜 둘 다 필요한지**를 적었다 — `failure_scenario`만으로는 스타일 지적에 그럴듯한 시나리오를 붙이면 통과하고(`validateReason`은 품질을 보지 않는다), severity만으로는 Hypothesis 문언이 달성되지 않는다 |
| test HIGH | 커버리지 25가 `seal.js`의 **내부** `distinctIds`를 부르라고 하는데 그 함수는 export되지 않는다(`module.exports`는 7종). export시키면 DD8이 거부한 P0 선점이 되므로 **구현 불가능한 항목**이다 | **항목 25를 공개 API 대조로 재작성.** `gate.decideAdjudicatedVerdict`와 `seal.deriveVerdict`에 같은 입력을 먹여 distinct id 0·1개에서 각각 `NAUGHTY`·`divergent`, 2개에서 둘 다 통과를 단언한다. 내부 헬퍼의 반환값 일치보다 **두 층의 관측 가능한 결론 일치**가 실제 불변식에 가깝다 |
| invariant HIGH | `classifyFinding`의 `reason` 열거가 "문자열인데 `validateReason`이 거부"하는 경우를 담지 않고 `null`을 허용하면서 그 조건도 적지 않았다 | `"insubstantial-failure-scenario"` 신설 + `null` 제거(항상 5값 중 하나) + **첫 일치에서 멈추는 판정 순서** 명시. 그 경우 `structured`는 `true`로 **유지**되고 `blocking`만 `false`다 — 여기서 강등하면 DD1의 계약 축과 DD6의 무게 축이 섞인다 |
| architect MEDIUM ×3 · invariant MEDIUM ×1 (부수) | `contract` 파생 규칙이 명세가 아니라 Task 설명에만 있음 · "유일한 파생 지점" 주장의 범위 불명 · 커버리지 25가 "둘이 같이 틀리는 것"은 못 잡음 · Task 7이 외부 조건에 의존하는데 실패 시 처리가 없음 | 넷 다 같은 라운드에서 닫았다(캡 잔량이 라운드 하나뿐이라 backlog로 미루지 않았다). DD1에 `contract` 파생 명세 신설 · DD4의 "유일"을 **기록 경로 한정**으로 좁히고 `analyzeReviewers`는 소비 지점임을 명시 · DD8에 "우발적 드리프트는 잡고 의도적 동시 변경은 못 잡는다"는 잔여를 명시 · Task 7에 "재현 안 되면 fail-closed 미완료, 합성 JSON 우회 금지" 4단계 추가 |

기각한 것: 없다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 리뷰어가 구조화 계약을 못 지켜 항상 `partial`이 되고 게이팅이 실질 미발동 | Medium | `partial`은 현행 동작이라 **회귀가 아니다**. 발생 여부는 `verdict` 출력의 `contract`로 즉시 관측되고, 그 값이 계속 `partial`이면 처방은 임계 완화가 아니라 프롬프트 재작성이다(§3.13.1이 같은 실패에 같은 답을 쓴다) |
| severity 게이팅이 실재 결함을 non-blocking으로 강등 | Medium | 기준이 "심각해 보이는가"가 아니라 "오동작을 서술할 수 있는가"다. 강등된 항목은 `findings`에 남아 원장에 저장되고 `mismatches`로 표면화된다(UI7). 게다가 강등은 contract=full일 때만 일어나고, 그때는 리뷰어가 스스로 severity를 MEDIUM 이하로 선언한 것이다 |
| `{A,B}` 완전성이 정상 라운드를 막는다 (리뷰어 B가 CLI 부재로 fallback될 때) | Low | fallback도 `--id B`로 기록되므로 distinct id는 2다. 실제로 막히는 것은 한쪽 record가 실패한 라운드인데, 그때 NICE를 내는 것이 바로 이 규칙이 막으려는 것이다 |
| envelope 확장이 `seal.js`의 `criticalIssueCount`를 바꾼다 | Low | `criticalIssues`를 길이 보존으로 유지하는 것이 DD4의 목적이고, `santa-seal.test.js`를 Validation에 넣어 회귀를 잡는다 |
| 공유 표면(`santa-loop.md`·`cli.js`)에서 P2/P3 편집과 머지 충돌 | Medium | §3.5.1 — 커밋 직전 `git diff --diff-filter=D`로 반대편 신규 파일 삭제를 확인한다. 현재 P2·P3는 미착수라 실제 충돌 창은 좁다 |
| `MCCP_SANTA_MAX_ROUNDS`(PRD 문언, 1~5)와 배송된 `MCCP_SANTA_ROUND_CAP`(1~10)의 이름·범위 불일치 | Low | milestone 3(캡 정책) 소유다. M1은 캡을 건드리지 않으므로 발현하지 않지만, M3가 착수 시 PRD를 정정할지 코드를 정정할지 정해야 한다 — PRD Open Questions에 남긴다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes (커버리지 25/25 — 각 항목에 assert 1개 이상 + 동결 함수 무변경 +
      신규 export 존재 포함)
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) —
      구체적으로: 이 저장소에서 `/mccp:santa-loop`을 1회 돌려 (a) 구조화 MEDIUM만 낸 FAIL
      리뷰어가 NICE로 계수되고, (b) `mismatches`가 터미널에 출력되며, (c)
      `.claude/reviews/santa-review-santa-adjudication.md`가 산출되고, (d) `mccp-santa-review`
      receipt의 `meta.santa_rounds`가 봉인된 것을 확인한다. 네 산출물이 전부 확인되지 않으면
      milestone은 complete가 아니다.

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~41k.

M1에 실제로 닿는 상위 3건과 이 plan의 응답은 아래와 같다. 나머지(원장 스키마·terminator
`targets`·entry id 체계)는 milestone 2·3 축이라 UI8·UI9대로 여기서 닫지 않는다.

| Finding | 이 plan의 응답 |
|---|---|
| **[HIGH][architect]** gate가 severity를 볼 수 없다 — `readReviewers`가 `raw`를 버린다 | DD4 — envelope에 `findings`를 더해 UI4 경계를 지키면서 축을 전달 |
| **[HIGH][test]** "`failure_scenario` 부재 시 FAIL→PASS 강등"의 순수함수 test가 없다 | 커버리지 항목 4·7 — 강등과 그 역방향을 각각 고정 |
| **[HIGH][explorer]** `decideVerdict` 시그니처가 동결이라 severity 층을 넣을 수 없다 | DD3 — 반환·인자 **확장**만 하고 기존 3필드는 무변경. 프로토콜 2 안 |

<details><summary>fan-out 전문 — findings 37 · meta-gaps 25 · patterns 29 (verbatim)</summary>

### Findings (severity-ranked)

- **[CRITICAL][test]** Judgment ledger schema and idempotency contract are undefined — no test for rejecting duplicate findings or detecting re-reports — PRD Scope (1): 판정 원장(`round | issue | ABSORBED(proof) | REJECTED(reason)`)을 집계 단계에 주입, but: (a) schema.js lacks `failure_scenario` and `targets` fields; (b) ledger.js structure is not designed for rejection deduplication; (c) no oracle test for 'if finding F was REJECTED in round N, round N+1 offering same F is pre-rejected without re-review'. Comparison: session-ledger.test.js tests idempotency (line 81-100) but santa judgment ledger has no equivalent.
- **[CRITICAL][test]** Patch-chasing terminator oracle is completely untested — no pure function test for 'all blocking in round N target only round N-1 patch' — PRD Scope (4): patch-chasing terminator — 라운드 2 이후 살아남은 blocking이 전부 `targets: round_N_patch`면 종료. But: (a) no file `santa/terminator.js` exists yet; (b) no test of termination logic separate from CLI wiring; (c) no edge case test for partial patch-chasing (some findings target prior round, others don't → continue); (d) santa-loop-cap.test.js contains no terminator oracle tests (lines 1-887 show cap+gate+ledger tests only).
- **[HIGH][architect]** Gate interface expansion lacks severity axis input contract. Gate.js must distinguish critical_issues from suggestions to implement blocking-issue counting, but ledger.readReviewers() intentionally drops `raw` (UI4), making critical_issues invisible to gate decision. — santa-loop.md Step 3 defines reviewer envelope with critical_issues/suggestions fields. santa/gate.js L45-47 filters only on verdict string. ledger.js L55 comment 'readReviewers does not return raw' and seal.js L78 confirms 'raw is severed from envelope'. PRD Scope MVP (2) says 'blocking건수로 재배선' but P1 owns only gate.js, not ledger.js.
- **[HIGH][architect]** Adjudication ledger schema undefined. PRD specifies entries as 'round | issue | ABSORBED(proof) | REJECTED(reason)', but 'issue' identifier has no scheme — is it finding array index? content hash? string equality? Without issue ID scheme, P2/P3 cannot reference findings across modules. — santa-adjudication.prd.md Scope MVP (3) specifies entry structure but Open Questions L71 asks 'failure_scenario 판정의 주체'. No finding-ID enum exists in ownership.md or seal.js. PRD Success Metrics L40 wants 'ABSORBED(proof)/REJECTED(reason)' counts but doesn't ground what 'issue' maps to.
- **[HIGH][architect]** Terminator logic's input data source unspecified. Terminator.js must detect 'targets: round_N_patch' annotations to classify findings as patch-chasing, but reviewer envelopes have no 'targets' field. PRD doesn't clarify whether reviewers emit this, or aggregation logic infers it from diff. — santa-adjudication.prd.md L48 describes 'patch-chasing terminator' and Success Metrics L42 mentions 'targets' field, but santa-loop.md Step 3 reviewer JSON schema (L106-115) has no targets field. Risks table L82 says '집계 단계가 대상 파일·라인을 직전 라운드 diff와 대조' — so targets come from aggregation, not reviewer. But who calls that logic and when?
- **[HIGH][security]** Concurrency race in appendEntry mutation could allow judgment ledger rows to be skipped or duplicated if lock acquisition fails — ledger.js:520-525 appendEntry uses mutate(), which wraps evidence-lock guardedReadModifyWrite(). The lock has mode:'enforce' (line 382) to prevent env bypass, but cli.js provides no handler for EVIDENCE_NON_TRANSIENT codes (lines 61-67). If lock acquisition fails with a non-transient error (CLAIM_DENIED, OVERWRITE_OBSERVED), the entry is dropped silently with stderr warning only. Caller cannot distinguish "entry was not written" from "entry was written but we lost the acknowledgment".
- **[HIGH][test]** Severity contract oracle lacks deterministic testability — `failure_scenario` presence check is mechanical but severity downgrade logic is not isolated — PRD §Hypothesis requires 'blocking은 `failure_scenario`를 쓸 수 있을 때만 성립', but the existing gate.js:decideVerdict (lines 31-55 in santa/gate.js) operates only on verdict+criticalIssues envelope fields. Severity filtering logic must be added, yet santa-loop.md Step 3 collects `checks` and `suggestions` into raw.{checks,suggestions} (santa-loop-cap.test.js:451-464) without validation. No pure function test exists for 'downgrade FAIL→PASS if failure_scenario absent'.
- **[HIGH][test]** CLI-to-receipt data flow for terminator is unspecified — gate.js:decideVerdict signature frozen but terminator requires new output fields — santa/gate.js lines 10-18 state 'P0가 확정하는 것은 시그니처뿐'. Current signature (line 31) is `decideVerdict({ reviewers, round, cap })` returning `{ verdict, failing, exitReason }`. PRD requires `exitReason` to contain terminator signal, but (a) gate.js:54 hardcodes `exitReason: null`; (b) CLI writes `meta.santa_exit_reason` (santa-review-gate.test.js line 108-111) but terminator outcome is separate from cap logic; (c) no test validates flow from terminator decision → CLI exit code → receipt.meta.santa_exit_reason. Frozen interface may need unfreezing.
- **[HIGH][test]** Acceptance gate `재보고 차단` (resubmit blocking) has no oracle test — measuring 'rejected item does not re-increment as blocking' is untested — PRD §Success Metrics row 2: 재보고 차단 | 원장에 종결된 항목이 blocking으로 재계수되는 비율 0 | 원장 대조 회귀 test. Current test suite has no regression test showing: round N finding F is REJECTED(reason X), round N+1 same finding F is reported again, ledger lookup prevents re-blocking. This is the core behavioral guarantee and needs dedicated oracle.
- **[HIGH][test]** No test of terminator `targets` field parsing from findings — does it accept 'round_2_patch', 'round_2-patch', or only exact enum? — PRD Scope (4) uses notation `targets: round_N_patch` but no schema or regex is defined. Test must verify: (a) exact format enforced (e.g., `/^round_\d+_patch$/`); (b) bad formats rejected (e.g., 'round2patch', 'round-2-patch'); (c) no parser fuzzing. Terminator.js will implement this, but test must exist before or alongside.
- **[HIGH][explorer]** Santa gate interface is frozen (P0) with `decideVerdict({ reviewers, round, cap })` signature — plan cannot modify gate logic directly, must add severity/blocking decision layer elsewhere — plugins/mccp/scripts/lib/santa/gate.js:6-13: 'FROZEN INTERFACE (P0 소유, 변경은 P0 재개 사안)'; comment explicitly blocks severity axis: '그것들이 `round`/`cap`을 쓰게 될 자리다'
- **[HIGH][explorer]** P1 adjudication ledger will be consumed by P2 (santa-evidence-diversity.prd.md) for error correlation metrics — ledger schema must be finalized before P2 implementation — .claude/prds/santa-evidence-diversity.prd.md (line 56): 'severity·원장·종료 조건 — P1 소유' + line 45: '오류 상관 대리지표는 P1 원장을 소비'
- **[MEDIUM][architect]** Mutation API boundary between P0 ledger.js and P1 adjudication/gate modules not contractually defined. P1 owns adjudication.js which must call ledger.appendEntry() (P0 module), but ledger.js L52-53 signature shows only `(entry, opts)` — P0 documentation doesn't specify what structure `entry` must have, only that P1 owns its contents. — ownership.md L52-53 shows P0 owns ledger.appendEntry signature but P1 owns entries[] contents. seal.js L41-45 reads ledger state but P1's adjudication.js doesn't exist yet. cli.js L35-38 imports all modules; no clear dispatch to adjudication. Ledger.js has no test fixtures documenting expected entry schema.
- **[MEDIUM][architect]** Composition order of gate/adjudication/terminator undefined. Gate.js decides verdict, terminator exits loop, adjudication records judgment. But PRD doesn't specify: are they called sequentially? Does terminator run before verdict? Does adjudication update gate's input? Which module owns the exit-reason generation? — PRD Hypothesis L33 says 'blocking의 정의를 failure_scenario에 못박고, 판정 원장을 집계 단계에 주입' but doesn't say which module injects to which. ownership.md M1 signatures show gate.decideVerdict, ledger.recordVerdict as separate calls. cli.js has no dispatch pattern for adjudication or terminator yet — P0 only built skeleton.
- **[MEDIUM][architect]** Gitignore boundary asymmetry: ledger persists only within session, but P2/P3 expect to read adjudication entries to filter findings. If ledger state is lost at session boundary (git checkout, worktree reset), P2 has no historical judgment to apply. — ledger.js L21 documents state file as '.claude/state/santa-loop/<slug>.json gitignored'. ownership.md notes P1 owns ledger entries mutation but doesn't address multi-session durability. P2 (lanes) ownership says 'P2는 레인을 분기하고' but doesn't say from where — if from ledger, and ledger gitignored, then P2 is fragile to session loss.
- **[MEDIUM][architect]** Receipt sealing contract for adjudication counts incomplete. PRD Success Metrics L40 says 'receipt에 봉인' and seal.js already has meta.santa_rounds/entries/cap/exit_reason as present-only fields. But P1 must decide: does receipt store *counts only* or full entry objects? Does it include rejection reasons (audit trail) or summary? — seal.js L886-907 schema shows santa_* fields present-only, all integers. PRD L34 wants '원장 행 수 ≥ 제기 finding 수' but doesn't say if receipt needs entry-by-entry granularity or just aggregate. If only counts → no audit trail after re-entrancy. If full entries → schema bloat and raw-text leak risk.
- **[MEDIUM][architect]** Shared surface merge conflict risk: P1·P2·P3 all edit santa-loop.md and cli.js. Ownership doc §변경 프로토콜 warns of this but offers only 'git diff --diff-filter=D' post-hoc check. No structural prevention — if P2's PR merges first, P1's additions to cli.js subcommand dispatch could be silently deleted. — ownership.md L34-40 lists santa-loop.md and cli.js as shared surfaces. §변경 프로토콜 L96-98 advises checking deletes after merge but provides no merge-blocking mechanism. CLAUDE.md §3.5.1 documents this as real hazard (PR #110: 9 files 2144 lines deleted by intervening PR merge).
- **[MEDIUM][architect]** P1 lacks explicit pattern for critical_issues → blocking mapping. PRD says 'failure_scenario' is the criterion, but doesn't specify: is critical_issues sufficient proof? Must every critical_issue have a failure_scenario? Who validates this — gate.js or adjudication.js? Violation path (ignore malformed data vs reject round) undefined. — PRD Open Questions L71 asks 'failure_scenario 판정의 주체'. L54 says gate must respect severity but Success Metrics L42 says 'failure_scenario를 쓸 수 있을 때만' — this is bidirectional: gate needs to see failure_scenario, but how does it check? JSON field? Free-text parsing? Schema undefined.
- **[MEDIUM][security]** New `failure_scenario` / severity axis fields risk injection into adjudication ledger without explicit bounds or sanitization contract — PRD states 'severity contract를 리뷰어 프롬프트에 못박기' (MVP scope Milestone 1) but does not specify validation rules for the new severity/blocking field entry. In cli.js:214, `criticalIssues` is extracted as-is into the envelope and stored in raw. New severity fields from the reviewer will follow the same path. Unlike existing bounded fields (MAX_REVIEWER_BYTES=100KB, MAX_REVIEWER_DEPTH=32), the `failure_scenario` text has no documented size bounds. ledger.js stores raw JSON without field-level validation, only structure validation.
- **[MEDIUM][security]** Judgment ledger entries (`REJECTED(reason)`, `ABSORBED(proof)`) lack input bounds and escaping rules, risking markdown/JSON injection into report or receipt — PRD Milestone 2 requires 'judgment ledger' injection into aggregation stage, but scope/schema section ("Scope") does not specify field format, size limits, or sanitization. seal.js:renderReport() builds markdown by string concatenation without escaping verdict/decisionId/cap/entries. If adjudication reasons contain backticks, angle brackets, or other markdown syntax, report integrity could be compromised. No MAX_REASON_BYTES or REASON_VALIDATION_REGEX documented.
- **[MEDIUM][security]** Reviewer model field (cli.js:204-207) accepts any non-empty string without enumeration, risking model spoofing in quorum validation — cli.js:204-207 accepts any string for --model argument with only 'non-empty' validation. review-verdict.js line ~226 checks quorum by counting distinct ids, not model+id pairs. An adversary calling `santa-cli record --id A --model fake-model` could populate the ledger with arbitrary model claims. The seal.js proof structure (line 228-230) iterates `distinctIds(fin)` to build quorum, not distinct model names. `review-source: 'multi-agent'` claim would be dishonest if one model impersonated two reviewers.
- **[MEDIUM][test]** Regression risk: severity contract must not weaken I1 FAIL-first framing in reviewer prompts — PRD Risks §severity 게이팅이 실재 결함을 non-blocking으로 강등: risk mitigation is 'blocked items remain in suggestions'. But: (a) santa-loop.md Step 2 rubric has no mention of `failure_scenario` prompt anchoring; (b) no test verifies reviewer receives unchanged FAIL-first preamble when severity axis is added; (c) codex-findings-backlog.md or similar 'soft-land' mechanism for downgraded findings is not design-tested. Acceptance criterion 'severity 게이팅' in deliverables table needs test anchor (§Success Metrics row 3).
- **[MEDIUM][test]** Ledger corruption handling mirrors M1 but needs explicit test — DD2 pattern not yet applied to judgment ledger — santa-loop-cap.test.js lines 280-300 test corrupted `terminated` marker detection via SANTA_LEDGER_CORRUPT. Future judgment ledger must have equivalent: (a) corrupted entry records (malformed JSON, bad keys); (b) schema version mismatch; (c) diverged round+entry index. No test file yet defines these failure cases, though pattern exists for terminal marker validation.
- **[MEDIUM][test]** Edge case: negative blocking count after ledger deduplication is untested — can patch-chasing terminator see 'rounds with 0 blocking' as all-absorbed state? — PRD Scope (4) says '직전 수정만 겨누는 라운드에서 루프가 스스로 종료'. If round N has 3 blocking findings all targeting round N-1 patch, they're all absorbed → blocking count = 0. But: (a) no oracle test for 'empty blocking array is valid terminal state'; (b) terminator behavior on 0-blocking unclear ('살아남은 blocking이 전부 targets:round_N_patch' vacuously true when blocking=[]).
- **[MEDIUM][test]** I4 regression: santa receipt must never enable PR-Codex bypass via cross-model corroboration — santa-review-gate.test.js lines 218-230 test [6] dual-review 우회 불가, asserting santa receipt is NOT in CROSS_MODEL_SOURCES. Plan must preserve this: when judgment ledger adds new gates or metadata, no path through the ledger+gate combination should satisfy `isCrossModelCorroborated()`. No new test needed if receipt schema remains isolated, but plan must document why ledger fields do NOT participate in dual-review deduction.
- **[MEDIUM][test]** Missing: test that severity contract applies per-round independently — severity downgrade in round N does not affect round N+1 re-review of same finding — PRD Scope (1) says severity contract applies when `failure_scenario` is absent. Iteration: if round N finding F has no failure_scenario (→ suggestions, not blocking), and round N+1 reviewer adds failure_scenario for same F, F should now be blocking. No oracle test validates this round-independence. Related: plan must specify whether ledger rejects round N+1 F as 'already seen' or permits re-review with new severity.
- **[MEDIUM][explorer]** Santa ledger already has `entries` array (marked as P1 owner) for adjudication records — reuse via `appendEntry(entry, opts)` call — plugins/mccp/scripts/lib/santa/ledger.js:272, 520-525: `entries: []` initialized in emptyState(); `appendEntry` function signature frozen; comment says 'P1 owns schema'
- **[MEDIUM][explorer]** Counter module has round cap enforcement with REASONS enum — plan should extend enum with new terminator exit reason (e.g., `PATCH_CHASING_STOP`) — plugins/mccp/scripts/lib/santa/counter.js:20: `REASONS = { OK: null, CAP_REACHED: 'cap_reached' }`; plan needs to add terminator reason as alternative exit condition
- **[MEDIUM][explorer]** Reviewer envelope structure in santa-loop.md already defines `critical_issues` and `suggestions` arrays — severity axis can be layered on these existing fields via validation — plugins/mccp/commands/santa-loop.md:106-115: reviewer JSON structure shows 'critical_issues', 'suggestions', no severity field yet; severities must be inferred or added to envelope
- **[MEDIUM][explorer]** Ledger state file uses guardedReadModifyWrite with atomic locks from evidence-lock module — plan's adjudication ledger write should reuse same lock pattern — plugins/mccp/scripts/lib/santa/ledger.js:354-387: mutate() wraps calls in guardedReadModifyWrite with mode:'enforce'; already imported at line 38
- **[LOW][security]** Decision slug derivation from git branch name accepts any alphabetic sequence after prefix removal without additional constraints, risking confusion if branch names collide — ledger.js:94-108 slugFromBranch() converts branch to slug by removing BRANCH_PREFIX_RE, lowercasing, and replacing [._] with '-'. Two different branches could produce the same slug (e.g., 'feat-my_feature' and 'feat-my-feature' both become 'feat-my-feature'). While SLUG_RE is anchored (^[a-z0-9][a-z0-9-]{0,80}$), the conversion is not injective. Collisions could cause reviews from different feature branches to accumulate in one ledger file.
- **[LOW][security]** Adjudication ledger entries stored in gitignored .claude/state/santa-loop/ directory lack inheritance documentation for future schema changes — ledger.js:19-22 defines entries as P1 owner field (comment: 'P1소유 — P0는 만들기만'), but schema version is frozen at SCHEMA_VERSION=1 (line 43). If P1 adds new required fields to entries, legacy entries without those fields will fail validation during aggregation. No migration path documented for existing entries. The present-only design (used elsewhere per CLAUDE.md §3.12) should be applied to all new entry fields to maintain additive schema evolution.
- **[LOW][security]** File mode repair on reread (ledger.js:252-262) is best-effort and silent on Windows, creating asymmetry in security guarantees between platforms — ledger.js:247-250 attempts chmod to 0o600 but skips on Windows (IS_WINDOWS). repairModeIfNeeded() logs a warning if mode was wrong, but the state file was already readable by other users on Windows during that instant. While P0 acknowledges this gap (line 248: 'POSIX mode는 사실상 무력'), documentation for P1 should clarify that Windows state files cannot be assumed private. The backlog note (line 246) indicates root fix is out-of-scope.
- **[LOW][explorer]** Seal module's receipt write pattern already writes present-only meta fields (santa_rounds, santa_entries, santa_cap, santa_exit_reason) — plan should follow same pattern for adjudication audit fields — plugins/mccp/scripts/lib/santa/seal.js:357-371: writeArgs populated conditionally; receipt/schema.js:893-906: present-only validation for santa_* fields
- **[LOW][explorer]** Schema validation in receipt/schema.js for santa_* fields is present-only additive (no schema_version bump) — plan's new adjudication fields must follow same additive pattern — plugins/mccp/scripts/receipt/schema.js:886-906: santa fields 'if present' validated; comment says '전부 PRESENT-ONLY'이며 schema_version 유지
- **[LOW][explorer]** Test pattern uses [N] coverage IDs in test names (e.g., test('[1] reject generic slug') — plan tests should follow same naming convention for audit coverage — plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js:8-10: '[N] 접두는 plan의 커버리지 계약 id다'
- **[LOW][explorer]** Review verdict module (review-verdict.js) shows proof validation pattern with structural checks and present-only fields — adjudication proof (if needed) should mirror this approach — plugins/mccp/scripts/lib/review-verdict.js:105-186: isReviewProofStructurallyValid pattern; used for diverse-agent-review which is similar multi-agent review system

### Meta-gaps

- Finding identifier scheme: How P1 labels individual findings for adjudication entries (array index? content hash? tuple of (reviewer_id, criterion)?) — needed for P2/P3 to reference findings.  _(architect)_
- Terminator input contract: Where 'targets: round_N_patch' annotation comes from (reviewer direct emit vs aggregation inference) — P1 PRD says 'targets 판정은 집계 단계가' but doesn't specify if that's adjudication.js or seal.js.  _(architect)_
- Gate re-architecture scope: Does P1 modify gate.js signature to accept critical_issues separately, or does gate.js recompute from raw? If latter, who provides raw to gate after ledger strips it?  _(architect)_
- Adjudication entry struct specification: Exact JSON schema for entries array elements (required fields, types, cardinality limits) — needed for ledger.appendEntry API contract and seal.js receipt validation.  _(architect)_
- Receipt audit trail decision: Do sealed santa_* counts include full entry objects (with rejection reasons) for audit, or only aggregate integers (counts only)? Affects schema size, retention, and post-hoc reconstruction.  _(architect)_
- P1/P2/P3 composition pattern: Which module calls adjudication.js? Is it cli.js dispatch, gate.js step, or seal.js projection? Execution order (adjudication before/after verdict?) — affects state consistency.  _(architect)_
- Multi-session ledger durability: If ledger gitignored and P2/P3 need historical entries, what's the recovery path when session is lost? Rely on receipt corpus reconstruction?  _(architect)_
- Test fixture boundaries: santa-adjudication.test.js must call ledger.js (P0-owned) but expects certain state shapes. Should ledger.js export test factories, or should P1 tests construct state JSON directly?  _(architect)_
- PRD does not specify validation regex, size bounds, or escaping requirements for new `failure_scenario` field or judgment ledger reason text. These must be defined before P1 implementation begins.  _(security)_
- No specification of how the new severity axis will be injected into the reviewer prompt without enabling anchoring bias (risk I3 from umbrella PRD review-loop-trust.prd.md). Security-relevant because LLM prompt injection could bypass severity contract.  _(security)_
- Adjudication ledger schema and fields are marked 'P1 소유' but no schema version bump or migration strategy is documented for schema_version:1 ledger.json files when P1 adds new required entry fields.  _(security)_
- No documented mechanism for detecting or recovering from corrupted adjudication entries (e.g., reason text with NUL bytes, prototype pollution via eval'd JSON, oversized fields). The fail-closed parseState() throws on JSON parse error, but appendEntry() validates only atomicity, not field content.  _(security)_
- Concurrent append race condition when evidence-lock fails is not handled in cli.js exception path. No documented recovery procedure for dropped entries or retries.  _(security)_
- No security-specific test requirement documented for severity/blocking gate logic. The MVP mentions test harness in Success Metrics but doesn't require pen-test scenarios for input manipulation or state machine races.  _(security)_
- Santa judgment ledger schema (keys, validation rules, TTL/archival policy) is not specified in PRD — plan must define whether it's per-decision or global, and whether old entries are pruned.  _(test)_
- Severity contract enforcement point unclear: does gate.js check failure_scenario presence, or does CLI/schema validation layer do it? PRD Open Question (1) hints at ambiguity.  _(test)_
- Terminator firing conditions not fully specified: does it fire *after* verdict, replacing it? Or is it a separate exit reason that can coexist with NICE verdict? PRD says '라운드 2 이후' but not when checks happen (immediate after recordRound? after verdict?).  _(test)_
- Plan must specify: when terminator detects patch-chasing and fires, what happens to findings marked 'targets:round_N_patch'? Are they silenced in output, or reported with special marker?  _(test)_
- Backward compatibility untested: old receipts without severity/targets fields — does plan ensure reads don't crash on missing keys?  _(test)_
- PRD specifies 'blocking 건수' re-gating but doesn't define how blocking is counted when findings have mixed severities — need specification of severity→blocking mapping rule  _(explorer)_
- PRD references 'patch-chasing terminator' detecting round N_patch targets but doesn't specify schema for `targets` field in ledger entries — need entry schema detail  _(explorer)_
- No specification of how severity is determined/stored in reviewer envelopes — whether it's inferred from failure_scenario text or explicitly added field  _(explorer)_
- Plan lacks detail on how 'failure_scenario' validation works mechanically — validator shape, length requirements, presence check timing (during verdict or at record time)  _(explorer)_
- Adjudication ledger append contract is undefined — will entries be appended per reviewer/issue or per round? How are ABSORBED/REJECTED reasons stored?  _(explorer)_
- New exit reason (terminator) needs definition in counter.REASONS enum — exact string value and when it's set (after which round check)  _(explorer)_

### Patterns to mirror

- seal.js: present-only stamping pattern (L752-768 write.js) — P1 should mirror for santa_* receipt fields, not materializing absent entries to avoid hash churn.  _(architect)_
- ledger.js: decision-id derivation (L68-92) shows 3-tier fallback (explicit → branch → default) with SLUG_RE validation front-loading (L76-81). P1 could mirror this for entry-ID validation if needed.  _(architect)_
- gate.js: pure function design (no disk I/O, only JSON transformation) — P1's adjudication.js should follow same pattern for testability.  _(architect)_
- counter.js: mutation-free oracle (L45-60 decideRound). P1's terminator.js should be pure too, receiving round state as argument rather than reading ledger.  _(architect)_
- cli.js: catch-all exit-code mapping (L42-68 EX_* enums) — P1 should define terminator/adjudication error codes (if any new ones) and map to existing exit space (2/12/75) rather than invent new codes.  _(architect)_
- ownership.md: frozen interface pattern (M1 Dynamic Signature table L42-63) — P1 should document which ledger.js functions it calls as immutable contract, marking changes as 'P0 reopen' scope.  _(architect)_
- receipt schema: gate_id-specific validation (schema.js L280-283 santa review_source check) — P1 should follow same pattern if it adds schema rules for santa entries (e.g., `if gate_id='mccp-santa-review' then meta.santa_entries validated`).  _(architect)_
- cli.js:50-52 — Use explicit MAX_* byte/depth/array bounds for all new JSON fields entering the ledger, paralleling MAX_REVIEWER_BYTES=100KB pattern.  _(security)_
- cli.js:56 FORBIDDEN_KEYS Set pattern — Apply prototype pollution defense to all new nested objects in severity/adjudication payload before storage.  _(security)_
- cli.js:161-172 assertContained() call before file read — Apply same path containment check to any new paths derived from user input or env variables in P1 adjudication code.  _(security)_
- cli.js:191-194 enum validation for verdict — Use strict enum checks (not substring matches) for new decision fields like `failure_scenario` to prevent fuzzy matching attacks.  _(security)_
- ledger.js:287-315 parseState() fail-closed JSON.parse — Mirror this pattern: throw immediately on schema_version mismatch for appendEntry validation, never silent fallback.  _(security)_
- seal.js:323-326 assertContained() before file write — Validate parent directory containment for all new ledger write paths, not just report/proof.  _(security)_
- review-verdict.js:80-95 isRepoRelativeEvidencePath() — Use this pattern for validating any new path fields in adjudication entries (no backslashes, no traversal, no UNC).  _(security)_
- plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js lines 14-24: use native `node:test` + assert/strict, create tmpdir fixtures with `git init`, repo-anchor via `.claude/state/`  _(test)_
- plugins/mccp/scripts/lib/tests/santa-gate.test.js lines 14-45: pure function oracle test with fixed 4-combo exhaustive cases, snapshot assertions on verdict/failing arrays, no mutations  _(test)_
- plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js lines 31-41: `santaProof()` fixture builder with present-only fields, hash-based verification, receipt round-trip validation  _(test)_
- plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js lines 742-759: lock contention + exit code 75 (TEMPFAIL) test; establish state file path, create lock, call CLI, verify no mutation  _(test)_
- plugins/mccp/scripts/state/tests/session-ledger.test.js lines 81-100: idempotency test — invoke operation twice, verify read result is identical to first invocation  _(test)_
- plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js lines 77-82: gate registration test (GATE_IDS.indexOf, phaseFromGate, assert gate only appears in one command chain)  _(test)_
- plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js lines 351-357: fail-closed DD11 test — attempt mutation on capped decision, expect exit 2 + zero byte change to state file  _(test)_
- plugins/mccp/scripts/lib/santa/ledger.js — use same state file location (.claude/state/santa-loop/<slug>.json), schema version, and guardedReadModifyWrite pattern for adjudication records  _(explorer)_
- plugins/mccp/scripts/lib/santa/counter.js:26-43 — parseCap/decideRound pattern: pure oracle taking env + numeric input, returning decision object with allowed/exitReason fields  _(explorer)_
- plugins/mccp/scripts/lib/santa/seal.js:140-186 — renderReport pattern: markdown table with aggregates only (no raw findings), handle empty/large result sets with <details> collapse  _(explorer)_
- plugins/mccp/scripts/receipt/schema.js:886-906 — present-only field validation pattern: `if (m.field !== null && m.field !== undefined) { validate... }`  _(explorer)_
- plugins/mccp/scripts/lib/tests/santa-*.test.js — test naming with [N] coverage IDs, mkTmpRepo fixture builders, deterministic test inputs  _(explorer)_
- plugins/mccp/scripts/lib/santa/ledger.js:48-54 — custom error class with SantaLedgerError(code, message) pattern; code prefixed with SANTA_ maps to exit codes  _(explorer)_
- plugins/mccp/scripts/lib/review-verdict.js:55-95 — isRepoRelativeEvidencePath validation for audit paths (no backslash, no traversal, no UNC) — adjudication proof paths should validate same way  _(explorer)_
- plugins/mccp/scripts/lib/santa/seal.js:202-235 — buildProof pattern: distinct quorum counting, verdict layer mapping, perspectives array binding  _(explorer)_

</details>

## Design Critique

- rounds: 2 (R0 → 흡수 → R1)
- verdict: `CONVERGED` (cap 2)
- R0 HIGH — H4(한 화면 항목 수 상한) 위반: fan-out 하위 3개 리스트가 37·25·29 항목으로 전부
  펼쳐져 있었다. 흡수: 상위 3건 요약 표를 펼친 채 두고 전문을 `<details>`로 접었다. **내용은 한
  글자도 바뀌지 않았다** — Phase 2.5.3의 verbatim 계약이 요구하는 것은 내용 보존이고, 래퍼는
  그것을 훼손하지 않으면서 H4를 만족시킨다.
- H1(heading depth ≤ 3) 통과 — `####` 이상 0건. H2(강조색)·H3(raw marker)는 이 산출물에 렌더
  표면이 없어 해당 없음.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤 impeccable
명령도 **호출하지 않는다** — 아래는 구현자용 체크리스트다. 이 milestone은 CLI·JSON 표면만 만들고
렌더 표면을 만들지 않으므로(`renderingSurface=0`), implement 단계에서도 refine·discovery 행은
recommend로 강등될 것이다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |

<details><summary>+4 more stages (refine · simplify · polish · system)</summary>

| Stage | Command |
|---|---|
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

</details>

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

