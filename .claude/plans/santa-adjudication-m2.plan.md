# Plan: santa 판정 계약 M2 — 판정 원장

**Source PRD**: `.claude/prds/santa-adjudication.prd.md`
**Selected Milestone**: 2 — 판정 원장
**Complexity**: Medium

## Summary

santa-loop은 라운드마다 fresh reviewer를 띄우는데, 초기화되는 것이 산출물만이 아니라
**판정 기록**이다. 운영자가 라운드 N에서 기각한 지적이 라운드 N+1에 그대로 재등장하고
다시 blocker로 계수된다. 실측으로 receipt 149건의 `resolution.rejected` 총합이 **0**이다 —
기각이 어디에도 남지 않는다.

M2는 P0가 만들어 두고 소비자가 0인 `ledger.entries` 배열에 P1의 판정 행 스키마를 채우고,
그 원장을 **집계 단계**에만 주입한다(리뷰어는 fresh 유지 — I3). 세 축이다: (1) 판정 행을
쓰는 유일한 writer(`adjudicate` subcommand), (2) 종결된 issue를 **다음** 라운드의 blocking
계수에서 빼는 suppression, (3) 미판정 blocking이 남은 채로는 다음 라운드가 열리지 않는
begin-round coverage 게이트 — 기각 보존율을 희망이 아니라 **능력**으로 만드는 자리다.

여기에 M1이 명시적으로 이관한 **판정 lifecycle 3종**(`record`는 OPEN 라운드에서만 · 같은
`id` 중복 거부 · 라운드 verdict 1회)이 붙는다. M1 DD8 말미가 "라운드 상태 기계라 원장 축이고
milestone 2가 소유한다"고 적었고, 그중 앞 둘은 coverage 게이트의 **건전성 전제**다 — FINAL
라운드에 리뷰어가 더 붙을 수 있으면 판정한 blocking 집합과 검사하는 집합이 갈린다.

## User Intent

<!-- PRD 본문(사용자 공동 작성) + 우산 PRD review-loop-trust의 승계 불변식에서 추출.
     저자 정당화는 이 표에 넣지 않는다 — 아래 ## Design Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 리뷰어를 온화하게 만들지 말 것. 오탐은 판정 하류에서 거른다 | constraint |
| UI2 | 판정 원장은 리뷰어가 아니라 집계 단계가 읽는다. 리뷰어는 fresh를 유지한다 | constraint |
| UI3 | santa verdict를 게이트 승인으로 쓰지 말 것 | constraint |
| UI4 | 판정 행의 형식은 라운드·지적·흡수 증명·기각 사유 네 축이다 | direction |
| UI5 | 제기 대비 기각이 원장에 기록되는 비율이 100퍼센트가 되게 할 것 | direction |
| UI6 | 원장에 종결된 항목이 blocking으로 재계수되지 않게 할 것 | direction |
| UI7 | 강등되거나 기각된 항목은 보존되어 보고서에 남고 사라지지 않을 것 | constraint |
| UI8 | 원장이 생기면 오탐율 지표의 없어진 분모가 생긴다 | direction |
| UI9 | patch-chasing terminator와 캡 정책은 milestone 3 소유다 | exclusion |
| UI10 | 블라인드 레인과 스코프 확장은 P2 소유다 | exclusion |
| UI11 | 델타 스코프는 P3 소유다. terminator의 대상 필드 스키마도 그쪽이다 | exclusion |
| UI12 | Reviewer A 로테이션은 이연한다. MVP를 부풀리지 말 것 | exclusion |
| UI13 | 흡수 반사실 검증은 비용이 커서 MVP 포함 여부가 미정이다 | exclusion |
| UI14 | 동결 시그니처를 자식 PRD가 바꾸지 말 것. 바꿔야 하면 P0를 재개한다 | constraint |
| UI15 | 공유 표면인 커맨드 본문과 CLI에서는 자기 절만 편집할 것 | constraint |
| UI16 | 각 불변식의 회귀 test 존재를 지표에 포함할 것 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle + env 파서 분리 | `plugins/mccp/scripts/lib/santa/gate.js:137` · `plugins/mccp/scripts/lib/santa/counter.js:31` | 파서만 env를 읽고 판정 함수는 인자만 본다. 불량값은 loud warn 후 default fail-open |
| 전역 함수(total) 규약 | `plugins/mccp/scripts/lib/santa/gate.js:255` | `analyzeReviewers`는 비배열·null을 빈 배열로 정규화하고 어떤 입력에도 던지지 않는다 |
| 사유 텍스트 실질성 검사 | `plugins/mccp/scripts/receipt/lib/force-override-reason.js:63` | `validateReason(text, {strict:true, allowCodeVocabulary:true})` — 길이·단어수·filler 거부, 코드 어휘 면제 |
| claim 정규화 | `plugins/mccp/scripts/lib/santa/gate.js:212` | 소문자 + 공백 축약 + trim. dedupe 키의 유일한 정의 |
| 원장 스냅샷 1회 | `plugins/mccp/scripts/lib/santa/seal.js:314` | `ledger.read()` 한 번 + `reviewersFrom`/`aggregateFrom` 순수 파생. 읽기에 lock이 없어 N회 읽으면 동시에 존재한 적 없는 조합이 나온다 |
| additive 관용 | `plugins/mccp/scripts/lib/santa/ledger.js:311` | `entries` 부재를 throw가 아니라 `[]`로 흡수 — legacy 원장이 크래시하지 않는다 |
| fail-closed 변환 | `plugins/mccp/scripts/lib/santa/cli.js:196` | 타입 위반은 exit 2 + append 0건, 계약 미달은 강등. 부분 기록 없음 |
| Errors | `plugins/mccp/scripts/lib/santa/cli.js:460` | `SANTA_*` 접두 typed error → catch-all이 exit 2로 매핑. 신규 exit code를 만들지 않는다 |
| Tests (oracle) | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:142` | `node:test` + `assert/strict`, 조합 전수 고정, 입력 비변형 단언 |
| Tests (CLI 경유) | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:83` · `:110` | tmpdir `git init` 진짜 repo fixture + in-process `runCli`로 exit code 단언 |
| Tests (호출 대상 spy) | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:528` | 모듈 export를 카운터로 감싸 위임과 재구현을 구별한다 |
| 문서 문구 회귀 | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:383` | 커맨드 본문을 `readFileSync`로 읽어 문구를 직접 단언 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/adjudication.js` | CREATE | P1 소유(소유권 표에 이미 배정). 판정 행 스키마 · fold · coverage · env 파서 2종 |
| `plugins/mccp/scripts/lib/santa/gate.js` | UPDATE | P1 소유. `issueIdOf` 신규 export + `decideAdjudicatedVerdict`에 optional `resolved` 축 (DD4) |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | 공유 표면. `adjudicate` subcommand · `verdict` 단일 스냅샷+suppression · `begin-round` coverage 선검사 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | 공유 표면. Step 3 coverage 거부 분기 · Step 4 출력 · Step 5 판정 기록 단계 |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | UPDATE | 커버리지 26~60 추가. M1의 1~25는 무변경으로 남고 같은 스크립트가 1..MAX를 함께 검사한다(MAX는 커버리지 표에서 파생 — R3) |
| `docs/santa-loop/ownership.md` | UPDATE | 변경 프로토콜 4 — 신규 export와 `entries` 행 스키마를 **추가 기록** |
| `docs/ENVIRONMENT.md` | UPDATE | `MCCP_SANTA_ADJUDICATION_GATE` · `MCCP_SANTA_LEDGER_SUPPRESSION` 등재 (§11 canonical) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.26.2 → 1.26.3 (§3.7 patch — PRD 3개 중 2번째 milestone) |
| `CHANGELOG.md` | UPDATE | `## [1.26.3]` 행 |
| `.claude/prds/santa-adjudication.prd.md` | UPDATE | Milestone 2 행 `pending` → `in-progress` + Plan 셀 연결 |

`ledger.js`와 `seal.js`는 **건드리지 않는다** — 둘 다 P0 산출물이고 소유권 표에 없다. `entries`
배열과 `appendEntry(entry, opts)`는 P0가 이미 만들어 두었고(`plugins/mccp/scripts/lib/santa/ledger.js:520`)
계약이 "행 스키마는 P1이 정의한다"이므로, M2가 필요로 하는 것은 그 위에 얹는 검증·fold·배선뿐이다.
`seal.js`를 열지 않는 근거는 DD11.

## Design Decisions

### DD1 — 원장은 관측 기록이고, 판정은 fold의 결과다

`entries`는 **append-only 관측 배열**이다. 같은 issue에 대한 판정이 두 번 append되면 지우지
않고 둘 다 남기며, 소비자는 **fold**로 유효 판정을 얻는다(같은 `issue_id`에 대해 배열 뒤쪽이
이긴다 — append 순서가 시간 순서다).

이 분리가 없으면 `appendEntry`를 쓸 수 없다. 그 함수는 P0 동결 시그니처
(`plugins/mccp/scripts/lib/santa/ledger.js:520`)이고 술어를 주입할 자리가 없어, "이미 있으면
쓰지 않는다"를 lock **안에서** 판정할 방법이 없다. 검사를 lock 밖에서 하면 동시 append 둘이
나란히 통과하는 TOCTOU다. 그래서 중복을 **막지 않고 흡수**한다: fold가 하나로 수렴시키고
`duplicates` 카운터가 발생 횟수를 남긴다. 대가는 원장이 조금 커지는 것뿐이고, 얻는 것은
P0 동결 함수를 건드리지 않는 것이다(UI14).

같은 이유로 **손상된 entry는 throw가 아니다.** `parseState`가 `rounds`·`schema_version`에
대해 throw하는 것은 그 값이 캡을 결정하기 때문이고(캡이 0으로 리셋되면 루프가 무한이 된다),
`entries`는 그 축이 아니다. 손상 행은 `malformed`로 계수하고 **suppression에도 coverage에도
기여하지 않는다** — 양쪽 모두 fail-closed 방향이다(읽을 수 없는 판정은 blocking을 지우지도,
판정 의무를 면제하지도 않는다). `plugins/mccp/scripts/lib/santa/ledger.js:311`이 `entries`
부재를 이미 관용하는 것과 같은 additive 방향이고, ledger `SCHEMA_VERSION`은 1로 유지된다.

### DD2 — 판정 행 스키마 (UI4의 코드화)

PRD 문언은 `round | issue | ABSORBED(proof) | REJECTED(reason)`이다. 그 네 축을 필드로 편다.

```jsonc
// entries[] 원소 — adjudication.buildEntry가 만드는 유일한 형태
{ "kind": "adjudication",   // P0의 entries는 P1 전용이지만, 훗날 다른 행 종류가 생겨도
                            // fold가 자기 것만 골라 읽도록 태그를 둔다 (P2가 원장을 소비한다)
  "round": 2,               // 지적이 **제기된** 라운드. coverage 키의 절반
  "issue_id": "a3f19c2b7e40",   // gate.issueIdOf(claim) — 12 hex
  "claim": "…",             // 원문 그대로 (cli가 이미 500자로 bound)
  "severity": "HIGH",       // CRITICAL | HIGH — blocking만 판정 대상이다
  "disposition": "absorbed" | "rejected" | "skipped" | "reopened",
  "evidence": "…",          // absorbed면 proof, rejected면 reason. 30..2000자, 실질성 검증
  "at": "2026-08-17T…Z" }   // ISO. **호출자가 준다** — 모듈은 시각을 모른다
```

`at`을 인자로 받는 것이 이 모듈의 순수성 경계다. `gate.js`가 "판정 함수는 env를 모르고
파서만 안다"로 경계를 그은 것과 같은 형태이고(M1 DD3a), 여기서는 "구성 함수는 시각을 모르고
CLI가 준다"이다. 그래야 fold·coverage·buildEntry 전부가 결정적으로 test된다.

**MEDIUM·LOW는 판정 대상이 아니다.** 그것들은 애초에 blocking이 아니라 라운드를 하나 더
태우지 않으므로 판정할 것이 없고, 판정을 요구하면 coverage 게이트가 모든 remark에 30자 사유를
강제해 루프가 멈춘다. 보존은 M1이 이미 한다 — `findings`에 남고 `byReviewer`가 센다(UI7).

### DD3 — disposition 4종: 둘은 suppress하고 둘은 하지 않는다

| disposition | 의미 | suppress | coverage 충족 |
|---|---|---|---|
| `absorbed` | 고쳤다. `evidence`는 수정의 증명(커밋·파일 위치·설명) | **예** | 예 |
| `rejected` | 결함이 아니다. `evidence`는 기각 사유 | **예** | 예 |
| `skipped` | 지금 판정하지 않는다 | 아니오 | 예 |
| `reopened` | 이전 판정이 틀렸다. 다시 blocking으로 둔다 | 아니오 | 예 |

`skipped`가 존재하는 이유는 **탈출구를 env가 아니라 원장 안에 두기 위해서**다. 판정 의무를
env 하나로 통째로 끄면 그 사건은 어디에도 남지 않는데, `skipped` 행은 같은 writer·같은
검증을 지나면서 "이 지적은 판정되지 않았다"를 원장에 남긴다. 그리고 suppress하지 않으므로
그 지적은 다음 라운드에도 계속 blocking이다 — 회피가 공짜가 아니다.

`reopened`는 PRD Open Question("판정 끝났으니 재보고 금지, 판정 자체가 틀렸다는 논증만
유효 — 문구만으로는 강제 불가")에 대한 M2의 답이다. **기계적으로 구분하지 않는다.** 구분은
운영자가 하고, M2가 제공하는 것은 그 결정을 기록으로 남기는 채널이다. 리뷰어가 낸 재보고가
재쟁점으로 받아들여지면 운영자가 `reopened`를 append하고 그 순간 suppression이 풀린다.
그 판단이 옳았는지는 `evidence`가 감사 대상으로 남는다.

### DD4 — suppression은 `decideAdjudicatedVerdict`의 **optional 입력**이다

주입 지점을 어디로 둘지가 이 milestone의 중심 선택이다. 세 후보를 실제로 재 보았다.

- **(a) `adjudication.js`가 자기 판정 함수를 갖는다** — `analyzeReviewers`를 부르고 blocking을
  거른 뒤 스스로 AND를 다시 쓴다. 거부한다: M1 DD8이 감수한 "두 곳에서 세면 갈린다"를
  판정 규칙 자체에 대해 재현하는 것이고, 그때는 `seal.js`가 P0라 합칠 수 없었지만 여기서는
  합치지 않을 이유가 없다.
- **(b) `analyzeReviewers`가 suppression을 안다** — 그러면 `byReviewer[].blocking`이 suppression
  이후 값이 되어 **강등 비율의 분모가 사라진다**(UI8). 그 분모는 M1이 code-review L1 흡수로
  일부러 배송 경로에 실은 값이다.
- **(c) `decideAdjudicatedVerdict`에 optional `resolved`를 더한다** — 채택.

`resolved`가 부재하거나 비면 **M1의 7필드가 값까지 동일**하고, 반환에 더해지는 것은
`suppressed: []`와 `niceBySuppression: false` 둘뿐이다.

**"byte-identical"이라고 쓰지 않는다** (R1 architect HIGH 흡수). 초안이 그 낱말을 썼는데
같은 Task가 반환에 키 두 개를 더한다고 적고 있어 plan 안에서 서로를 반박했고, 그 표현대로
커버리지 33을 반환 전체 `deepEqual`로 구현하면 **통과할 수 없는 test**가 된다. 하위 호환의
정확한 명제는 "기존 키의 값이 하나도 바뀌지 않는다"이지 "반환이 같다"가 아니며, 커버리지
33도 그 형태로 잰다 — M1 7키만 뽑아 `deepEqual`하고 신규 두 키의 값을 따로 단언한다.
`analyzeReviewers`는 원시 분석을 그대로 내고, suppression은 판정 함수 안에서 blocking 배열을
`effective`와 `suppressed`로 가르는 한 단계로만 일어난다. 판정이 보는 것은
`effective.length === 0`이다.

**`decideAdjudicatedVerdict`는 P0 동결 대상이 아니다.** 동결 표는 `gate.decideVerdict`에 대한
것이고 그 함수는 M2에서도 한 글자도 바뀌지 않는다. `decideAdjudicatedVerdict`는 M1이 추가한
P1 소유 export이며, 지금 하는 것은 **optional 인자 추가 + 반환 필드 추가**라 기존 호출자가
관측하는 동작이 불변이다. 다만 ownership.md의 P1 표는 그 시그니처를 적어 두었으므로 같은
PR에서 갱신한다(변경 프로토콜 4).

**`blocking` 필드의 의미가 바뀐다는 사실을 숨기지 않는다.** M2 이후 반환의 `blocking`은
*게이트가 실제로 센 것*(= effective)이고, 지워진 행은 `suppressed`에 담긴다. entries가 0건인
원장에서는 두 정의가 같은 값이므로 기존 소비자(`santa-loop.md`의 `BLOCKING_N`, 커버리지 18)는
무변경이다. 그럼에도 이름이 같은 채 의미가 좁아지는 것은 드리프트 위험이라, 같은 커밋에서
Step 4 산문이 두 수를 나란히 출력하도록 고친다(Task 4).

### DD5 — issue 동일성은 정규화 claim이고, 그 한계를 지표로 관측한다

`gate.issueIdOf(claim) = sha256(normalizeClaim(claim)).slice(0, 12)`. `normalizeClaim`은 M1이
dedupe 키로 이미 쓰는 함수(`plugins/mccp/scripts/lib/santa/gate.js:212`)이고, **같은 함수를
쓰는 것이 요점이다** — 라운드 *안*의 병합과 라운드 *사이*의 동일성이 서로 다른 규칙을 쓰면
"한 라운드에서는 같은 지적인데 다음 라운드에서는 다른 지적"이 성립한다.

id 파생을 `gate.js`에 두는 이유도 같다: **쓰는 쪽과 읽는 쪽이 같은 함수를 부르지 않으면
suppression은 조용히 아무것도 하지 않는다.** `adjudication.js`가 `gate`를 import한다(반대
방향은 순수 모듈에 원장 의미론을 끌어들이므로 금지).

**이 키는 패러프레이즈에 뚫린다.** fresh reviewer는 같은 결함을 매번 다르게 쓸 개연성이
높고, 그러면 `issue_id`가 갈려 suppression이 발화하지 않는다. 이것을 여기서 fuzzy matcher로
메우지 않는다 — 임계값을 발명하면 방어할 근거가 없는 숫자가 생기고(§3.13.1과 같은 이유),
잘못 합쳐진 두 지적은 **실재 결함을 지우는** 방향으로 틀린다.

대신 **관측 가능하게 만든다** — 다만 무엇이 관측 가능한지를 정확히 적는다. 초안은 이 자리에
`reReportCandidates`("직전 라운드에도 있었으나 id가 다른 blocking 수")를 두었는데 **그 수는
계산할 수 없다**(R2 test HIGH 흡수). id가 다른 두 지적이 같은 결함이라는 판정은 정확히 이
문단이 만들지 않기로 한 fuzzy matching이므로, 그 정의를 유지하면 plan이 거부한 능력을 지표가
전제하게 된다 — 구현자는 임계값을 발명하거나 그 키를 조용히 0으로 채우게 된다.

계산 가능한 것은 **집합 차이 셋**이고, `verdict` 출력이 그것을 `carryOver`로 싣는다.

| 키 | 정의 (전부 집합 연산 — 임계 없음) |
|---|---|
| `suppressed` | 종결된 issue가 라운드 N에 **같은 id로** 재등장한 수 (= `suppressed[].length`) |
| `resolvedAbsent` | 라운드 `< N`에서 종결된 issue 중 라운드 N의 raw blocking에 **없는** 수 |
| `newBlocking` | 라운드 N의 raw blocking 중 라운드 N-1의 raw blocking에 **없는** id 수 |

패러프레이즈 실패의 서명은 `resolvedAbsent > 0 ∧ newBlocking > 0`이 연속 라운드에 걸쳐
유지되는 것이다 — 종결한 지적이 사라진 것처럼 보이는데 새 지적이 같은 속도로 늘어난다.
**이 쌍은 패러프레이즈를 식별하지 않는다. 그 패턴을 노출할 뿐이다.** 그래서 임계도 두지
않는다 — 두 수를 그대로 싣고 해석은 운영자가 한다. 처방이 필요해지면 그것은 임계 완화가
아니라 리뷰어에게 안정적 식별자를 요구하는 프롬프트 변경 — 즉 M3 또는 P2의 축이다.

PRD의 "재보고 차단 0" 지표는 **원장 대조 회귀 test**로 측정한다고 PRD가 이미 정했고
(Success Metrics의 How measured 열), 그 test는 정확 일치 경로를 고정하므로 이 한계와
무관하게 성립한다. 그리고 패러프레이즈 경로가 **suppress되지 않는다**는 사실 자체는 커버리지
58이 단언한다 — 알려진 실패 모드를 산문의 경고가 아니라 고정된 기대값으로 둔다.

### DD6 — 기각 보존율을 지시가 아니라 능력으로 만든다 (begin-round coverage)

"기각을 원장에 적으세요"를 산문으로 두면 M1 이전과 같은 상태다 — 실측 보존율 0%가 그
결과다. 그래서 **미판정 blocking이 남아 있으면 다음 라운드가 열리지 않는다.**

판정 위치는 `cli.js#cmdBeginRound`이고 `ledger.beginRound` **이전**이다. `ledger.js`는 P0
소유라 손대지 않으며, 이 순서 덕분에 거부 시 캡이 소모되지 않는다(라운드가 열리지 않으므로).

규칙:

> 원장에 FINAL 라운드가 하나 이상 있으면, **마지막 FINAL 라운드** N의 effective blocking 전건에
> 대해 `round === N`인 entry가 존재해야 한다. 아니면 `SANTA_ADJUDICATION_INCOMPLETE`로 exit 2
> (append 0건 · 라운드 미개설).

세 가지가 이 규칙에 붙어 있다.

- **`round === N` 결속이 필수다.** entry가 issue_id만 갖는다면 라운드 N에서 `reopened`된
  지적이 라운드 N+1에 재등장했을 때 "이미 판정된 것"으로 읽혀 coverage가 통과한다. 그러면
  `reopened`가 자기 자신을 면제하는 고리가 된다. 판정은 **그 라운드의 제기**에 대한 것이다.
- **suppressed 항목은 재판정 대상이 아니다.** 이미 종결된 지적이 재등장한 것은 blocking이
  아니므로 coverage 대상이 아니고, 아니라면 종결 항목이 매 라운드 판정을 재요구해
  suppression의 목적이 사라진다.
- **마지막 FINAL 라운드만 본다.** 그 이전 라운드는 자기 후속 라운드가 열릴 때 이미 같은
  검사를 통과했으므로 귀납적으로 덮인다. 예외는 아래 env로 검사를 끈 구간이며, 그 구멍은
  닫지 않는다 — 전 라운드를 매번 재검사하면 한 번의 audited skip이 그 slug의 루프를 영구히
  막는다. 대가는 문서화하고, 발생 여부는 `coverage` 출력에 남는다.

### DD7 — env 2종. 둘 다 default `enforce`이고 불량값은 **엄격한 쪽**으로 떨어진다

| env | 끄는 것 | `off`의 방향 |
|---|---|---|
| `MCCP_SANTA_ADJUDICATION_GATE` | begin-round coverage 선검사 **하나** | 덜 엄격 |
| `MCCP_SANTA_LEDGER_SUPPRESSION` | 종결 항목의 blocking 면제 **하나** | **더** 엄격 (M1 등가) |

`MCCP_SANTA_SEVERITY_GATE`와 같은 파서 규약을 쓴다 — 미설정은 default, 열거 밖은 loud stderr
warn 후 default. M1의 `parseSeverityGate`는 그 fallback이 *덜 엄격한* 쪽이라 DD10에서 세 항의
근거를 대야 했는데, 여기서는 두 축 모두 default가 엄격한 쪽이거나(전자) M1 대비 완화의
대상이라(후자) 그 비대칭이 없다.

축을 하나로 합치지 않는 이유: 둘은 서로 다른 실패에 대응한다. 전자는 "판정을 강요당하는 것이
지금 곤란하다"이고 후자는 "이 원장의 판정을 믿지 못하겠다"이다. 하나의 스위치로 묶으면 앞을
끄려는 운영자가 뒤까지 끄게 된다.

**`MCCP_SANTA_LEDGER_SUPPRESSION=off`는 대조군 도구이기도 하다.** PRD가 미결로 남긴 처방
(2)("대조군 측정을 별도 축으로 세울지")이 요구하는 것이 정확히 이 스위치다 — 같은 원장에
대해 suppression을 켠 판정과 끈 판정을 비교하면 M2의 효과가 한 라운드 안에서 관측된다.

### DD8 — `absorbed` 재등장은 suppress하되 **가장 크게 표면화한다**

가장 위험한 경로다. 운영자가 "고쳤다"고 기록했는데 수정이 불충분하면, fresh reviewer가 같은
지적을 다시 내고 M2는 그것을 지운다 — 실재 결함이 통과한다.

이 위험을 부정하지 않고 세 가지로 다룬다.

1. **`evidence`는 실질성 검증을 지난다.** `validateReason(strict, allowCodeVocabulary)`이므로
   "fixed" 한 단어로는 흡수를 주장할 수 없다. 이것이 막는 것은 성의 없는 흡수뿐이고,
   그럴듯한 거짓 증명은 막지 못한다 — M1 DD5가 `failure_scenario`에 대해 적은 한계와 **같은
   문장**이 여기에도 적용된다.
2. **재등장은 `kind:'absorbed-rereported'`로 분류되어 `suppressed[]`에 담기고 Step 4가 터미널에
   출력한다.** 이 줄은 "당신의 수정이 듣지 않았을 수 있다"는 신호이고, 라운드를 태우지 않으면서
   운영자에게 도달하는 유일한 경로다.
3. **되돌리는 비용이 낮다.** 운영자가 신호를 보고 동의하면 `reopened`를 append하는 것만으로
   그 지적이 다시 blocking이 된다.

**그럼에도 이것을 "안전하다"고 말하지 않는다.** M2가 주장하는 것은 "재보고가 조용히 라운드를
태우는 대신 기록된 suppression이 된다"까지다. 수정이 실제로 듣는지는 검증하지 않으며, 그
검증(흡수 반사실)은 PRD가 UI13으로 비용을 이유로 미결에 둔 축이다.

`suppression`을 `rejected`에만 걸고 `absorbed`는 계속 blocking으로 두는 설계도 검토했다. 그쪽이
안전하지만 PRD Success Metrics 2행("원장에 **종결된 항목**이 blocking으로 재계수되는 비율 0")을
절반만 달성하고, 무엇보다 `absorbed` 재등장의 가장 흔한 원인이 "수정 실패"가 아니라 "직전
라운드의 수정을 겨눈 지적"(= patch-chasing)이다 — 그 축의 소유자는 M3이다(UI9). 두 milestone이
같은 현상을 서로 다른 방향으로 처리하면 M3 착수 시 둘 중 하나를 되돌려야 한다.

### DD9 — 원장은 리뷰어에게 가지 않는다 (I3의 기계적 경계)

주입 지점은 `cli.js#cmdVerdict` **하나**다. 리뷰어 프롬프트를 만드는 것은 `santa-loop.md`
Step 3이고, 그 절에는 원장을 읽는 명령이 없으며 M2가 추가하지도 않는다.

이 불변식의 회귀 가드는 문서를 겨눈 test다(커버리지 47) — Step 3 블록에 `entries`·`adjudicate`·
`suppressed` 토큰이 **부재**함을 단언한다. 프롬프트가 LLM 산문이라 완전한 강제는 불가능하고,
이 test가 잡는 것은 "누군가 원장 요약을 리뷰어 프롬프트에 넣는" 가장 직접적인 형태 하나다.
그 이상을 주장하지 않는다.

### DD10 — `cmdVerdict`는 원장을 한 번만 읽는다

M2는 같은 호출에서 리뷰어와 entries **둘 다** 필요하다. 현재 `cmdVerdict`는
`ledger.readReviewers(round, opts)`를 부르고 그 함수가 내부에서 `read()`를 한다. entries를 위해
`ledger.read()`를 또 부르면 읽기 2회가 되고 **읽기에는 lock이 없다** — 그 사이 다른 CLI 호출이
mutate하면 리뷰어와 판정이 동시에 존재한 적 없는 조합이 되어, 그 조합으로 라운드가 FINAL로
봉인된다.

`seal.js`가 같은 문제를 이미 해결했으므로 그 형태를 그대로 쓴다
(`plugins/mccp/scripts/lib/santa/seal.js:314`): `ledger.read(opts)` 스냅샷 하나에서
`ledger.reviewersFrom(state, round)`(순수)와 `state.entries`를 파생한다. 두 함수 모두 P0가
M2에서 이미 export했고 `raw` 소거도 ledger 모듈 안에서 그대로 일어나므로 UI4 경계가 보존된다.

### DD11 — `seal.js`는 열지 않는다 (M1 DD12의 기대를 의도적으로 미이행)

M1 DD12는 "명시 라벨은 원장 `entries`가 보고서에 실리는 milestone 2에서 자연스럽게 붙는다"고
적었다. **M2는 그것을 하지 않고, 그 사실을 여기 적는다.**

근거는 M1이 그때 열지 않은 이유와 같다: `seal.js`는 소유권 표 어디에도 없는 P0 산출물이라,
P1이 편집하면 표에 없는 파일을 선점하게 되고 P2·P3가 전제로 삼은 교집합 ∅ 주장이 흔들린다.
M1은 그 근거로 열지 않았는데 M2가 같은 근거를 무시하면 그 원칙이 한 milestone짜리였다는 뜻이
된다.

**미이행의 대가가 작다는 것도 함께 적는다.** `renderReport`는 이미 `- entries: N`을 찍으므로
원장 규모는 보고서에 표면화된다. 판정 내역(어느 지적이 왜 기각됐는가)의 소비자는 운영자이고,
그 표면은 `cli.js verdict`/`adjudicate`의 stdout과 Step 4·5 출력이다 — M1이 `mismatches`에
대해 내린 것과 같은 결정이다. 보고서에 판정 표를 싣는 것은 `seal.js` 소유권이 열리는 시점의
일이고, 그때는 한 섹션 추가로 끝난다.

### DD12 — receipt schema는 건드리지 않는다

`santa_entries`는 P0 M2가 이미 present-only 정수로 봉인하고 있고(`plugins/mccp/scripts/receipt/schema.js`의
santa 4필드), M2가 하는 일은 그 값을 **처음으로 0이 아니게 만드는 것**뿐이다. 판정 내역은
gitignored 원장에만 산다.

흡수/기각 건수를 receipt에 나누어 싣고 싶은 유혹이 있으나 거부한다: present-only 필드 추가는
receipt 계층 파일 변경이고, `makeSkeleton` 비등록 규약을 다시 검증해야 하며, 무엇보다 그
숫자를 **지금 읽는 코드가 0개**다. 소비자 없는 필드를 봉인 corpus에 더하지 않는다.

**"P2가 원장을 소비한다"를 이 거부의 근거로 삼지 않는다** (R2 architect HIGH 흡수). PRD가
그렇게 적은 것은 사실이지만 그 소비 경로는 M2가 정의하지 않으며(DD15의 접속 계약), 정의되지
않은 소비자를 근거로 "그러니 receipt에는 필요 없다"고 말하면 두 milestone이 서로를 가리키며
아무도 그 표면을 소유하지 않게 된다. 여기서 성립하는 근거는 위의 "읽는 코드가 0개" 하나이고,
P2가 접속 계약을 정하면서 receipt 축이 필요하다고 판단하면 그때 추가하는 것이 옳다.

### DD13 — 판정은 **다음** 라운드부터 효력을 갖는다 (`entry.round < currentRound`)

fan-out architect·test 관점이 각각 다른 각도에서 짚은 자리를 합치면 M2가 스스로 만드는
우회가 하나 나온다. suppression이 `issue_id`만 보면 이렇게 된다:

> 라운드 N이 blocking X를 낸다 → NAUGHTY → 운영자가 X를 `absorbed`로 기록 →
> **같은 라운드 N에 대해 `verdict`를 다시 부른다** → X가 suppress되어 NICE →
> Step 5.5 seal → push. **리뷰가 한 번도 다시 돌지 않았다.**

그래서 suppression 조건에 라운드 결속을 넣는다: entry가 라운드 N의 판정을 suppress하려면
`entry.round < N`이어야 한다. 라운드 자신의 판정은 자기 자신을 지우지 못한다.

이것은 방어 장치가 아니라 **의미의 정확한 표현**이다. PRD 문언이 "기각한 지적이 *다음
라운드에* 재등장하고"이고 Success Metric이 "종결된 항목이 *재*계수되는 비율"이므로,
suppression의 대상은 애초에 **재등장**이지 최초 제기가 아니다. 라운드 결속이 없는 규칙은
그 문장을 잘못 옮긴 것이다.

부수 효과 하나가 유용하다: 라운드 N에 대한 `verdict` 재계산이 **항상 같은 값**을 낸다
(그 라운드의 판정이 입력에 들어오지 않으므로). 그래서 DD14의 "verdict 1회"를 재계산 일치
검사로 구현할 수 있고, 이미 FINAL인 라운드를 읽기 전용으로 조회하는 경로가 살아남는다.

### DD14 — M1이 이관한 판정 lifecycle 3종 (`cli.js`에서, `ledger.js`는 무접촉)

M1 DD8 말미: "`record`는 OPEN에서만 · `id` 중복 거부 · verdict 1회 — 셋은 라운드 상태
기계라 원장 축이고, milestone 2가 소유한다." M1은 그것들을 **위생**이라 불렀는데(dual-review
우회 자체는 `distinctIds >= 2`가 이미 닫았으므로 맞다), M2에서는 앞 둘이 위생을 넘어
**coverage 게이트의 전제**가 된다.

| 규칙 | 구현 | M2에서 왜 전제인가 |
|---|---|---|
| `record`는 OPEN 라운드에서만 | `cmdRecord`가 `rounds[N].verdict !== null`이면 exit 2 | FINAL 라운드에 리뷰어가 더 붙으면 blocking 집합이 커지는데, coverage는 판정 당시의 집합을 검사한다 — 판정을 마치고 라운드를 연 뒤에 새 blocking이 생긴다 |
| 같은 `id` 중복 거부 | `cmdRecord`가 그 라운드에 같은 `envelope.id`가 있으면 exit 2 | `byReviewer` 통계와 `blocking[].ids`가 한 리뷰어를 둘로 세지 않게 한다. 판정 대상 목록의 정확성 |
| 라운드 verdict 1회 | `cmdVerdict`가 FINAL 라운드에서 **재계산해 일치하면 무변경 반환(exit 0)**, 다르면 `SANTA_VERDICT_UNSTABLE` exit 2 | DD13이 이미 flip을 불가능하게 만들었으므로, 불일치는 "그 사이 무언가가 바뀌었다"는 뜻이고 그것을 조용히 덮어쓰면 안 된다 |

세 번째를 단순 거부가 아니라 **재계산 일치 검사**로 두는 이유는 조회 경로를 죽이지 않기
위해서다. 운영자와 Task 7의 Validate 명령이 이미 FINAL 라운드에 `verdict`를 부르고 있고,
DD13 덕분에 그 재계산은 결정적이다. 일치하면 mutation 없이 같은 JSON을 돌려주고, 갈리면
그 사실 자체가 진단이다.

**TOCTOU를 주장하지 않는다.** 세 검사 모두 `ledger.read()` 후 CLI 수준에서 판정하므로
동시 호출 둘이 나란히 통과할 수 있다. `ledger.recordReviewer`/`recordVerdict`는 P0 동결
시그니처라 술어를 lock 안으로 주입할 자리가 없다(DD1의 `appendEntry`와 같은 제약).
실질 방어는 여전히 판정 계층의 `distinctIds >= 2`(gate)와 `seal.deriveVerdict`이고, 이
셋은 **순차 호출에서의 오용을 막는 위생**이다. 그 범위를 넘는 주장을 하지 않는다.

### DD15 — 원장은 gitignored다. M2는 "보존"의 범위를 좁게 주장한다

PRD Success Metric 1행은 "기각 보존율 100%"이고, M2가 그것을 기록하는 곳은
`.claude/state/santa-loop/<slug>.json` — **gitignored 워킹트리 파일**이다. 워크트리를
지우거나(§3.8의 PR 후 cleanup이 정확히 그 행위다) 브랜치를 갈면 판정이 함께 사라진다.

**M2가 주장하는 보존은 "한 리뷰 루프 안에서"다.** 그 범위 안에서는 100%가 기계적으로
강제되고(DD6의 coverage 게이트), 그 밖에서는 receipt에 남는 `meta.santa_entries` 정수
하나가 "그 루프에서 판정이 N건 있었다"를 증언할 뿐이다.

세션 간 내구성을 여기서 만들지 않는 이유는 셋이다.

- **소비자가 아직 없다.** P2의 오류 상관 대리지표는 "P1 원장을 소비"한다고 적혀 있고 그
  소비는 같은 루프 안에서 일어난다. 없는 소비자를 위해 git-tracked 표면을 만들면 §3.12의
  ship corpus 계약(재봉인 금지 · hash 안정성)을 새로 지켜야 한다.
- **원장 본문에는 리뷰어 원문이 산다.** `entries`만 tracked로 빼려면 원장을 두 파일로
  가르거나 `raw`를 소거해야 하고, 그것은 P0의 저장 계층 설계(UI4의 모듈 경계)를 바꾸는
  일이다 — `ledger.js`는 P1 소유가 아니다.
- **decision slug가 브랜치 파생이라 스코프가 브랜치다.** 브랜치를 지우면 그 리뷰 스코프가
  끝난 것이라는 것이 P0의 명시적 설계이고, M2가 그 전제를 뒤집으면 캡·slug 규칙까지 함께
  손봐야 한다.

fan-out architect가 이 축을 HIGH로 짚었고 그 지적은 옳다. 다만 그것은 **M2의 결함이
아니라 P0 저장 계층의 성질**이므로, 여기서는 주장 범위를 좁히는 것으로 정직하게 처리하고
"세션 간 판정 내구성"을 backlog 항목으로 남긴다.

**P2 접속 계약 — 있는 것과 없는 것을 나눠 적는다** (R2 architect HIGH 흡수). 위 첫 번째
근거("소비자가 아직 없다")와 DD12의 초안 문언("P2가 원장을 직접 읽는다")은 **동시에 참일 수
없다**. 하나는 소비자가 없다고 말하고 다른 하나는 소비자가 있으니 receipt는 필요 없다고
말한다. 그 사이에 남는 것이 미문서화 데이터 의존이다 — 의존을 주장하면서 인터페이스를 주지
않으면 P2는 경로를 스스로 발명하고, 그 발명이 P0의 저장 계층 가정을 깨도 어떤 test도 잡지
않는다. 그래서 접속 표면을 여기서 좁게, 그러나 명시적으로 못박는다.

M2가 정의하는 접속은 **하나뿐이다**:

- **경로 파생** — `ledger.deriveSantaDecisionId(...)` → `.claude/state/santa-loop/<slug>.json`.
  P0가 이미 export한 함수이고, slug를 문자열로 조립하는 것은 계약이 아니다(브랜치 파생 규칙과
  fallback 3단이 그 함수 안에 있다).
- **유효 범위** — **같은 워크트리·같은 루프**. 그 밖에서 파일 부재는 오류가 아니라 "그 리뷰
  스코프가 끝났다"는 뜻이며, 소비자는 부재를 정상 상태로 처리해야 한다.
- **읽기 형태** — `ledger.read(opts)` 스냅샷 1회 + 순수 파생(DD10). `entries`를 직접
  `JSON.parse`하는 경로는 계약이 아니다.

**M2가 정의하지 않는 것**: 루프를 건너는 지속성 · 워크트리 간 조회 · slug discovery("어떤
slug들이 존재하는가"를 묻는 API는 없다). P2가 그 셋 중 하나라도 필요하면 그것은 P2의 설계
항목이거나 P0 재개 사유이지, M2가 조용히 채워 둘 자리가 아니다. 이 미정의를 PRD Open
Question으로 등재해 다음 milestone이 전제로 삼기 전에 보이게 한다.

## Tasks

### Task 1: `adjudication.js` 신규 — 순수 모듈

- **Action**: 아래 export를 만든다. 전부 순수이고 디스크·env·시각을 모른다(파서 2종만 env를
  읽는다 — `gate.js`의 DD3a 경계와 동형).

  ```jsonc
  // buildEntry({ round, claim, severity, disposition, evidence, at }) -> entry
  //   검증 실패는 SANTA_ADJUDICATION_INVALID throw (cli catch-all이 exit 2로 매핑).
  //   반환은 DD2의 8필드 **정확히** — 그 외 키를 더하지 않는다.
  //
  // foldEntries(entries) -> {
  //   **입력 필터가 먼저다** (R3 architect HIGH 흡수 — DD2가 `kind` 태그의 목적을 적어
  //   두었는데 이 명세는 필터를 암묵에 두고 있었다):
  //     - `kind`가 **다른 문자열**인 행 = 남의 행이다. 검증 이전에 조용히 건너뛰고
  //       `malformed`에도 `counts`에도 들어가지 않는다(손상이 아니라 무관).
  //     - `kind`가 **부재하거나 문자열이 아닌** 행은 adjudication 후보로 보고 스키마 검증에
  //       넘긴다 → 미달이면 `malformed`. 이쪽을 "남의 행"으로 접으면 태그를 빠뜨린 writer의
  //       행이 조용히 사라지는데, `malformed`는 suppression에도 coverage에도 기여하지 않아
  //       (DD1) 어느 쪽으로도 게이트를 열지 않는 fail-closed 방향이다.
  //   history: Map<issue_id, entry[]>,   // append 순서 보존. DD13 때문에 "최신 하나"가
  //                                      // 아니라 이력 전체가 필요하다 — 라운드 N의 판정은
  //                                      // `round < N`인 항목 중 마지막이고, 그 선택은
  //                                      // 질의 라운드마다 다르다
  //   resolution: Map<issue_id, entry>,  // 이력의 마지막. 보고 전용이며 판정 입력이 아니다
  //   byRoundIssue: Set<"<round>:<issue_id>">,                        // coverage 키
  //   counts: { absorbed, rejected, skipped, reopened },
  //   duplicates: <int>,      // 같은 (round, issue_id)가 2회 이상 append된 횟수
  //   malformed: <int> }      // 스키마 미달 — suppression·coverage 어디에도 기여 안 함
  //
  // coverageOf({ effectiveBlocking, round, folded }) -> {
  //   covered: <bool>, missing: [{ issueId, claim, severity }] }
  //
  //   **`issueId`가 없는 blocking 행은 uncovered로 떨어뜨린다** (R4 invariant CRITICAL 흡수).
  //   `issueId`가 비문자열·빈 문자열이면 `<round>:undefined` 키를 만들지 말고 그 행을
  //   `missing`에 `{issueId:null, …}`로 담는다. 이 규칙이 없으면 필드가 유실됐을 때
  //   coverage가 **늘 통과**하고 suppression이 **늘 0건**이 되는데, 그 조합은 크래시가 아니라
  //   게이트가 조용히 꺼진 상태다. 커버리지 56은 생산 지점을 build-time에 고정할 뿐이고
  //   이 규칙은 runtime을 fail-closed로 만든다 — 둘은 대체재가 아니다.
  //
  // carryOverOf({ rawBlockingIds, prevBlockingIds, folded, round }) -> {
  //   suppressed: <int>, resolvedAbsent: <int>, newBlocking: <int> }
  //   DD5의 계산 가능한 3수. 전부 집합 연산이고 임계가 없다. `prevBlockingIds`가 `null`
  //   (= 라운드 0, 비교 대상 없음)이면 `newBlocking`은 `rawBlockingIds`의 크기다 —
  //   "비교할 직전 라운드가 없다"와 "새 지적이 없다"를 같은 0으로 보고하면 첫 라운드가
  //   영원히 조용해진다.
  //
  // parseAdjudicationGate(env)  -> 'enforce' | 'off'
  // parseLedgerSuppression(env) -> 'enforce' | 'off'
  ```

  검증 규칙(전부 `buildEntry`가 소유):
  `round`는 음이 아닌 정수 · `claim`은 1..500자 문자열 · `severity ∈ {CRITICAL, HIGH}` ·
  `disposition`은 DD3의 4값(대소문자 구분) · `evidence`는 문자열이고
  `validateReason(evidence, {strict:true, allowCodeVocabulary:true}).ok`가 참이며 2000자 이하 ·
  `at`은 `Date.parse` 가능한 문자열. `issue_id`는 인자가 아니라 **`gate.issueIdOf(claim)`으로
  파생**한다 — 호출자가 id를 주면 claim과 어긋난 행을 만들 수 있고, 그 행은 어떤 재등장도
  suppress하지 못하면서 coverage만 충족시킨다.

  `evidence`에 `validateReason`을 **import해서 쓴다**(재구현 금지 — 규칙을 베끼면 원본이
  바뀔 때 두 사본이 갈리고 그 갈림은 어떤 test도 잡지 않는다). CJK 표시폭 보정이 필요하므로
  `gate.js`가 이미 가진 `widthNormalized` 투영을 **export해 재사용**한다 — 같은 하한이 gate와
  adjudication에서 다르게 걸리면 "blocking으로 인정된 시나리오를 사유로 그대로 붙여넣었는데
  기각 사유로는 거부된다"가 성립한다.

  `foldEntries`는 **전역 함수(total)다** — `entries`가 비배열·`null`·`undefined`여도 던지지
  않고 빈 fold를 낸다. `decideAdjudicatedVerdict`와 `cmdBeginRound` 양쪽이 legacy 원장(=
  `entries` 부재)에서 이것을 부르므로, 던지면 그 경로 전체가 죽는다
  (`plugins/mccp/scripts/lib/santa/gate.js:255`의 `analyzeReviewers`가 같은 계약을 갖는 이유와
  동일).
- **Mirror**: `plugins/mccp/scripts/lib/santa/gate.js:137`(env 파서 + loud fail-open) ·
  `plugins/mccp/scripts/lib/santa/gate.js:255`(전역 함수 규약) ·
  `plugins/mccp/scripts/lib/santa/cli.js:460`(`SANTA_*` typed error)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`
  (커버리지 26 · 28~32 · 39~40 · 57~58 · **60**(의 `coverageOf` 축) — `adjudication.js`가 소유하는 항목. 60은 단일 항목이고 `coverageOf`와 `decideAdjudicatedVerdict` 두 함수를 함께 단언하므로 Task 1·2 양쪽 Validate에 같은 번호로 나타난다. 한 항목을 두 Task가 나눠 진다고 해서 번호에 문자 접미사를 붙이면 안 된다 — Validation 스크립트는 커버리지 표에서 파생한 정수 id만 찾으므로 표에 없는 id는 영원히 미충족이다)

### Task 2: `gate.js` — `issueIdOf` 신규 export + `resolved` optional 축

- **Action**: 두 가지를 **추가**한다. `decideVerdict`는 M1과 마찬가지로 한 글자도 바뀌지
  않는다(UI14).

  1. `issueIdOf(claim)` — `sha256(normalizeClaim(claim))`의 앞 12 hex. 비문자열은 빈 문자열로
     정규화해 던지지 않는다. `widthNormalized`도 함께 export한다(Task 1이 재사용).
  2. **`analyzeReviewers`의 병합 행에 `issueId`를 additive로 더한다.** 이것은 (3)에 딸린
     세부가 아니라 **독립 작업 항목**이다(R2 invariant HIGH 흡수). 초안은 이 한 줄을 (3)과
     한 문장에 묶어 두었는데, 그 배치가 실제로 만드는 위험은 문서 미관이 아니다 — 이 필드의
     소비자가 셋이기 때문이다: Task 3의 `adjudicate`가 `--issue <id>`를 그 라운드의 blocking
     행에서 조회하고, `coverageOf`가 같은 필드로 `<round>:<issue_id>` 키를 만들며,
     suppression이 같은 필드로 이력을 찾는다. 빠지면 셋 다 `undefined`를 키로 쓰고, 증상은
     크래시가 아니라 **"coverage가 늘 통과하고 suppression이 늘 0건"이라는 조용한 fail-open**
     이다. 커버리지 56이 `blocking[].issueId === issueIdOf(blocking[].claim)`을 생산 지점에서
     직접 단언한다.

     **소비 지점도 각각 이미 test를 갖는다** (R3 architect HIGH — "세 경로를 통과하는지 검증
     되지 않았다"에 대한 답). 생산 한 곳만 고정하면 중간 변형을 놓치므로, 소비마다 어느 항목이
     지키는지 여기 적는다: `adjudicate` 조회는 **41·42·55**(정상 append · 없는 `--issue` exit 2 ·
     suppress된 issue의 `reopened`), `coverageOf` 키는 **39·40**(라운드 결속 · suppressed 제외),
     suppression 이력 조회는 **34~36·49**(재등장 suppress · 분류 · 자기-suppression 차단)다.
     넷 다 fixture repo를 지나므로 `issueId`가 중간에서 유실되면 그 자리에서 red가 된다.
  3. `decideAdjudicatedVerdict`가 optional `resolved`를 받는다.

  ```js
  // decideAdjudicatedVerdict({ reviewers, round, cap, severityGate, resolved })
  //   resolved: Map<issue_id, entry[]> | null   // 부재/빈 Map이면 M1과 동일
  const a = analyzeReviewers(reviewers);
  if (reviewers.length === 0) return { …M1 그대로…, suppressed: [], niceBySuppression: false };

  // (신규) blocking을 두 갈래로 가른다. SUPPRESSING = {absorbed, rejected}.
  //
  // **DD13 — `round` 인자가 여기서 처음으로 쓰인다.** M1까지 `round`는 받되 쓰지 않는
  // 파라미터였고(gate.js 머리말이 "P1이 종료 조건을 구현할 때 쓸 자리"로 예고했다),
  // 그 자리가 이것이다. `resolved`가 비어 있지 않은데 `round`가 정수가 아니면 **아무것도
  // suppress하지 않고** loud warn한다 — 라운드를 모르면 자기-suppression을 막을 수 없고,
  // 그 경우 안전한 기본값은 M1 동작이다.
  // gate.js **모듈 지역** 헬퍼 — export하지 않는다. `adjudication.js`에 두면
  // gate ← adjudication 순환 import가 된다(adjudication은 `issueIdOf` 때문에 이미 gate를
  // import한다). 초안은 이 함수를 이름만 쓰고 정의하지 않아 DD13의 정확성이 미명세인 채로
  // 남아 있었다(R3 architect CRITICAL 흡수).
  //
  //   lastBefore(history, round) -> entry | null
  //     history: entry[] | undefined   ← `resolved.get(issueId)`의 반환. **부재는 정상
  //                                      입력이다**(판정 이력이 없는 issue) — 던지지 않는다.
  function lastBefore(history, round) {
    if (!Array.isArray(history)) return null;   // undefined·null·비배열 전부 여기서 흡수
    let hit = null;
    for (const e of history) {
      // round가 정수가 아닌 행은 **건너뛴다**. 손상 행이 suppression을 발화시키면
      // 읽을 수 없는 판정이 blocking을 지우게 되고, 그것은 DD1이 정한 방향의 반대다.
      if (e && Number.isInteger(e.round) && e.round < round) hit = e;
    }
    return hit;   // 조건을 만족하는 것이 없으면 null → suppress하지 않는다
  }
  // **"마지막"은 append 순서이고 `round` 값으로 정렬하지 않는다.** DD1이 append 순서를 시간
  // 순서로 정의했으므로, 같은 issue를 라운드 1에서 `rejected`했다가 라운드 2에서 `reopened`한
  // 뒤 다시 라운드 2에서 `rejected`하면 마지막 `rejected`가 이긴다. 정렬로 바꾸면 같은
  // 라운드 안의 순서 정보가 사라진다. 커버리지 59가 이 선택을 고정한다.

  const canSuppress = resolved && resolved.size > 0 && Number.isInteger(round);
  const effective = [], suppressed = [];
  a.blocking.forEach(function (b) {
    // **`issueId`가 없으면 절대 suppress하지 않는다** (R4 invariant CRITICAL 흡수). 이 필드가
    // 유실되면 `resolved.get(undefined)`가 늘 `undefined`라 suppression은 어차피 0건이 되지만,
    // 조용히 0건이 되는 것과 **명시적으로 거부하고 warn하는 것**은 다르다 — 전자는 정상 동작과
    // 구별되지 않는다. coverageOf의 같은 규칙과 짝이며, 둘이 함께 있어야 필드 유실이
    // "게이트가 꺼졌다"가 아니라 "게이트가 막는다"로 나타난다.
    const hasId = typeof b.issueId === 'string' && b.issueId.length > 0;
    if (!hasId) { /* loud warn 1회 */ effective.push(b); return; }
    // 이력에서 **`round`보다 앞선** 마지막 항목. 같은 라운드의 판정은 보지 않는다.
    const e = canSuppress ? lastBefore(resolved.get(b.issueId), round) : null;
    if (e && SUPPRESSING.has(e.disposition)) {
      suppressed.push({ issueId: b.issueId, claim: b.claim, severity: b.severity,
                        ids: b.ids, disposition: e.disposition, entryRound: e.round,
                        kind: e.disposition + '-rereported' });
    } else effective.push(b);
  });

  const mitigated = severityGate === 'enforce' && a.contract === 'full';
  const noBlocking = effective.length === 0;   // ← 여기 한 곳만 바뀐다
  const bothIds    = a.distinctIds.length >= 2;
  const allPass    = mitigated ? true : decideVerdict({…}).verdict === 'NICE';
  const verdict = (noBlocking && bothIds && allPass) ? 'NICE' : 'NAUGHTY';

  // 이 라운드가 **suppression 덕분에** NICE가 됐는가. 판정에 쓰이지 않는 관측값이고,
  // Step 4가 이 값이 참일 때 경고를 찍는다 — 원장이 루프를 끝낸 사건은 눈에 보여야 한다.
  const niceBySuppression = verdict === 'NICE' && suppressed.length > 0;
  ```

  **강화 축 둘은 여전히 어느 값에서도 적용된다.** suppression은 `noBlocking` 한 항의 입력을
  좁힐 뿐이고 `bothIds`를 건드리지 않으며, `allPass`도 그대로다 — 즉 `contract='partial'`
  라운드는 종결 항목을 지워도 전원 PASS가 아니면 NAUGHTY다. suppression이 M1의 어느 강화 축도
  끄지 않는다는 것이 커버리지 36·38이 고정하는 명제다.

  `issueId`를 `analyzeReviewers`의 병합 행에 더하는 것은 M1 단언을 깨지 않는다 —
  커버리지 6은 `blocking[0].ids`·`.severity`·`.length`를 개별 단언하고 행 전체를
  `deepEqual`하지 않는다(`plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:254`).
  즉 M1 test 파일의 단언 코드에 diff가 없다.

  반환은 M1의 7필드 + `suppressed` + `niceBySuppression`이다. `blocking`은 **effective**를 담는다(DD4 말미 —
  entries 0건에서는 두 정의가 같은 배열이라 기존 소비자가 무변경이다). `failing` 파생은
  M1 그대로이되 `a.blocking`이 아니라 `effective`를 순회한다 — 지워진 지적을 낸 리뷰어를
  실패자로 부르면 그 라운드에서 아무도 실패하지 않았는데 이름이 남는다.

  `byReviewer`는 **원시값 그대로**다(DD4 (b)). suppression 이후 값으로 바꾸면 강등 비율의
  분모가 사라진다 — 커버리지 37이 그것을 고정한다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/gate.js:344`(M1의 불리언화 후 AND 규약) ·
  `plugins/mccp/scripts/lib/santa/gate.js:212`(정규화 claim — 같은 함수를 재사용)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`
  (커버리지 27 · 33~38 · 49~51 · 56 · 59 · **60**(의 `decideAdjudicatedVerdict` 축 — Task 1과 같은 단일 항목이다) — `gate.js`가 소유하는 항목) +
  `node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js` (동결 함수 회귀 — 착지 전후
  두 번 모두 green이어야 한다)

### Task 3: `cli.js` — `adjudicate` 신규 · `verdict` 배선 · `begin-round` 선검사

- **Action**: 세 곳을 고친다. **자기 절만 편집한다**(UI15).

  1. **`adjudicate` subcommand** (신규):
     `--round <N> --issue <id> --disposition absorbed|rejected|skipped|reopened --evidence <text>`.
     원장을 1회 읽어 `--issue`가 **그 라운드의 blocking(effective + suppressed 합집합)에
     실재하는 id**인지 확인하고(없으면 exit 2 — 존재하지 않는 지적에 대한 판정은 원장을
     오염시킨다), `buildEntry`로 행을 만들어 `ledger.appendEntry(entry, opts)`에 넘긴다.
     `at`은 여기서 stamp한다. stdout은
     `{ appended:true, round, issueId, disposition, entries:<int> }`.

     **effective가 아니라 합집합인 것이 요점이다.** 이미 suppress된 지적을 `reopened`로
     되돌리는 경로가 필요한데(DD3), effective만 보면 그 지적은 목록에 없어 재개가 구조적으로
     불가능해진다 — 탈출구를 만들어 놓고 문을 잠그는 셈이다.

     `--claim`/`--severity`는 인자가 아니라 **원장의 blocking 행에서 가져온다** — 호출자가
     타이핑하면 원문과 어긋난 claim이 저장되고 그 행의 `issue_id`가 실제 지적과 갈린다.
  2. **`cmdVerdict`**: `ledger.readReviewers`를 `ledger.read` + `ledger.reviewersFrom`로 바꿔
     스냅샷을 1회로 만들고(DD10), `foldEntries(state.entries).history`를
     `decideAdjudicatedVerdict`의 `resolved`로 넘긴다(`parseLedgerSuppression(env)`가 `off`면
     넘기지 않는다). stdout에 `suppressed` · `niceBySuppression` · `entries`(정수) ·
     `ledger:{counts, duplicates, malformed}` · `carryOver:{suppressed, resolvedAbsent,
     newBlocking}`을 더한다. 기존 7키는 이름·의미 모두 유지된다.

     `carryOver`는 `adjudication.carryOverOf`가 계산하고 `cmdVerdict`는 **배선만** 한다(DD5).
     직전 라운드의 raw blocking은 같은 스냅샷의 `reviewersFrom(state, N-1)`에서 파생하므로
     **읽기는 여전히 1회**다(DD10) — 이 값을 위해 원장을 다시 여는 순간 DD10이 닫은 창이
     그대로 다시 열린다. 라운드 0에서는 `prevBlockingIds`로 `null`을 넘긴다.

     **FINAL 라운드에서는 재계산 일치 검사만 하고 mutation하지 않는다**(DD14 3행):
     `rounds[N].verdict !== null`이면 `ledger.recordVerdict`를 부르지 않고, 재계산 결과가
     저장값과 같으면 exit 0으로 같은 JSON을 돌려주며, 다르면 `SANTA_VERDICT_UNSTABLE`로
     exit 2 (양쪽 값을 stderr에 싣는다).
  3. **`cmdRecord`**: `ledger.recordReviewer` **이전에** 두 가지를 본다(DD14) —
     그 라운드가 OPEN인가(`verdict === null`), 그리고 같은 `id`의 envelope이 이미 있는가.
     둘 중 하나라도 걸리면 `SANTA_ROUND_NOT_OPEN`/`SANTA_REVIEWER_DUPLICATE_ID`로 exit 2 +
     **append 0건**이다.
  4. **`cmdBeginRound`**: `ledger.beginRound` **이전에** coverage를 검사한다. 원장을 1회 읽어
     마지막 FINAL 라운드 N을 찾고, 그 라운드의 effective blocking을
     `gate.decideAdjudicatedVerdict({reviewers: reviewersFrom(state, N), round: N, …})`로
     파생한 뒤 `coverageOf`를 부른다. 미충족이면 `SANTA_ADJUDICATION_INCOMPLETE`로 exit 2 —
     **원장 접촉 0건**이므로 캡이 소모되지 않는다. `parseAdjudicationGate(env)`가 `off`면
     loud warn 후 건너뛴다.

     stderr 메시지는 빠진 `issue_id`와 claim 앞부분을 전부 열거한다. 판정을 요구하면서 무엇을
     판정해야 하는지 말하지 않으면 운영자는 원장 JSON을 손으로 읽어야 하고, 그 순간 이 게이트는
     우회 대상이 된다.
  5. `usage()`에 `adjudicate` 한 줄을 더한다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/cli.js:196`(fail-closed 변환 — 어떤 실패도 exit 2 +
  append 0건) · `plugins/mccp/scripts/lib/santa/seal.js:314`(스냅샷 1회)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`
  (커버리지 41~46 · 48 · 52~55 — `cli.js`가 소유하는 항목) **와**
  `node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js`
  (기존 CLI 회귀가 깨지지 않았는지) 둘 다

### Task 4: `santa-loop.md` — 판정 기록 단계

- **Action**: 세 절을 고친다. Step 3의 **리뷰어 프롬프트 블록은 손대지 않는다**(DD9 · UI1·UI2 —
  FAIL-first 문장과 severity contract 문언은 무변경).

  - **Step 3**: `begin-round` 비영점 분기에 exit 2 / `SANTA_ADJUDICATION_INCOMPLETE` 케이스를
    더한다. 현재 산문은 "exit 2는 usage 또는 무결성 오류"로 뭉뚱그리는데, 이제 그중 하나는
    **복구 절차가 있는 상태**(Step 5로 돌아가 판정을 기록하라)이므로 구분해 적는다. 캡 도달과
    달리 seal하지 않는다 — 판정이 끝나지 않은 루프는 종료가 아니다.
  - **Step 4**: `suppressed`와 `entries`를 출력에 더한다. `blocking`이 이제 *게이트가 센 수*
    라는 것을 명시하고, `raw = blocking + suppressed`를 나란히 찍어 의미 변화가 화면에서
    보이게 한다(DD4). `absorbed-rereported` 줄에는 "직전 수정이 듣지 않았을 수 있다"는 해석을
    한 문장으로 붙인다.
  - **Step 5**: NAUGHTY 경로에 **판정 기록 단계**를 신설한다. blocking 전건에 대해
    `adjudicate`를 부르고, 고친 것은 `absorbed`(증명), 고치지 않기로 한 것은 `rejected`(사유)
    또는 `skipped`다. 이 단계를 건너뛰면 다음 `begin-round`가 거부한다는 것을 명시한다 —
    산문이 게이트를 예고해야 운영자가 거부를 버그로 오해하지 않는다.

  **Step 3 본문의 무결성은 이미 기계로 고정돼 있다** (R2 architect HIGH — 부분 반증). 리뷰어는
  "공유 표면의 절 단위 편집에 기계적 강제가 없고, 커버리지 47은 토큰 3종의 부재만 보므로 Step 3
  원문이 온전한지는 검사하지 않는다"고 지적했다. 앞 절반은 옳고 뒤 절반은 사실과 다르다 — M1
  커버리지 **14**가 FAIL-first 문장을 한 글자 단위로,
  **20**이 구조화 스키마·`failure_scenario`·`MCCP_SANTA_SEVERITY_GATE` 문언을
  `readFileSync`로 읽어 **존재**를 단언하고
  (`plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` line 383 · line 517), 아래 Validation의
  커버리지 스크립트가 1..MAX를 전수 검사하므로 그 두 항목의 소실 자체도 red다. PR #110형
  머지 사고 — Step 3 프롬프트가 지워지는 경우 — 는 이미 잡힌다.

  남는 잔여는 정확히 하나다: 그 단언들이 **파일 전체**를 보므로 절을 구분하지 않는다.
  문장이 Step 3 밖으로 옮겨져도 통과한다. 커버리지 47을 그 자리에 맞춰 좁힌다 — 토큰 부재를
  Step 3 블록으로 **범위 한정**하고, 같은 블록 **안에** 위 두 문장이 있음을 함께 단언한다.
  절 경계를 파싱하는 test 하나가 "지워졌다"와 "옮겨졌다"를 모두 덮는다.
- **Mirror**: 현 Step 3~5의 서술 톤과 코드 블록 형식 (예: 현 Step 4의 `node -e` 출력 블록)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`
  (커버리지 47 — Step 3 블록 범위 한정 부재 단언 + 같은 블록 안의 M1 문언 존재 단언. 항목
  14·20도 함께 green이어야 한다)

### Task 5: 회귀 test — 커버리지 26~60

- **Action**: `santa-adjudication.test.js`에 항목 26~60을 더한다(현재 35개). **이 범위 표기는
  방향 안내이고 계약이 아니다** — 계약 원본은 아래 커버리지 표 하나이며 Validation 스크립트가
  그 표에서 상한을 파생한다(R3). M1의 1~25는 **무변경**이고
  같은 파일에 공존한다(`node:test`는 test별 setup을 가지므로 fixture 충돌이 성립하지 않는다 —
  M1 R6에서 같은 우려가 반례로 기각됐다). 파일 머리말의 "M1" 표기를 "M1·M2"로 넓힌다.

  라운드를 넘나드는 항목(34~36 · 49 · 55 · 57~58)은 fixture repo 하나 안에서 라운드 두 개를
  실제로 열고 닫는다 — 라운드 간 상태를 test 사이에 공유하지 않고 각 test가 자기 tmpdir repo를
  만든다(M1의 `makeRepo` 그대로).

  **이 문단이 fan-out이 요구한 test 격리 계약이다**(meta-gap "All three milestones need
  documented test-isolation contract for gitignored ledger files" — R2 architect HIGH가 미해소로
  인용했다). 세 문장으로 못박는다: (1) 원장 상태의 수명은 **한 test**이고 tmpdir과 함께
  사라진다, (2) slug는 test마다 다르게 지어 같은 tmpdir 안에서도 스코프가 겹치지 않는다,
  (3) **저장소의 실제 원장(`.claude/state/santa-loop/`)을 읽거나 쓰는 test는 0개다** — 실 경로
  검증은 Task 7이 소유하고 test는 fixture만 만진다. M2는 **자기 몫만** 적는다; P2·P3가 같은
  형태를 쓸지는 그쪽 plan의 판단이고, 세 milestone 몫을 여기서 대신 정하지 않는다(UI10·UI11).

  항목 33이 M2의 하위 호환 주장을 전부 진다. 재는 방법은 **반환 전체 비교가 아니다**:
  `resolved` 부재 반환에서 M1의 7키(`verdict`·`failing`·`exitReason`·`blocking`·`mismatches`·
  `contract`·`byReviewer`)만 뽑아 M1 반환과 `deepEqual`하고, 신규 두 키가 각각 `[]`와 `false`
  임을 따로 단언하며, **키 집합이 정확히 9개**임을 함께 고정한다(세 번째 키가 조용히 늘어나는
  것을 막는다). 반환 전체를 `deepEqual`하면 이 test는 설계상 통과할 수 없다.
- **Mirror**: 같은 파일의 기존 fixture helper(`finding` · `reviewer` · `makeRepo` · `cli`)를
  재사용한다 — 새 helper를 만들면 M1 항목과 M2 항목이 서로 다른 fixture 위에서 돌아 비교
  가능성이 사라진다
- **Validate**: 아래 Validation의 커버리지 스크립트가 **성공 종료한다**. 총계 숫자를 여기 다시
  적지 않는다 — 이 줄은 R1이 세 표면을 동기화하고도 `48/48`로 남아 R3에서 잡힌 **네 번째
  표면**이었다. 숫자를 하나 더 동기화하는 대신 지운다; 계약 원본은 커버리지 표이고 스크립트가
  그것을 읽어 상한을 파생한다

### Task 6: 문서 · 버전 · PRD 상태

- **Action**: `docs/santa-loop/ownership.md`에 P1 M2의 추가분을 **추가 기록**으로 남긴다 —
  신규 모듈 `adjudication.js`의 export 5종, `gate.issueIdOf`/`widthNormalized`,
  `decideAdjudicatedVerdict`의 `resolved` 축과 `blocking` 의미(effective), 그리고
  `ledger.entries` 행 스키마(DD2). `ledger.appendEntry` 행의 시그니처·계약 문언은 **무변경**
  이고, 바뀌는 것은 "P0는 배열을 만들기만 한다"에 P1이 채운 형태가 붙는 것뿐이다.
  `docs/ENVIRONMENT.md` §11에 env 2종을 등재한다(기본값 · 판정 순서 · `off`의 방향이 두
  축에서 서로 다르다는 점 명시). `plugin.json`을 1.26.3으로 bump하고 `CHANGELOG.md`에
  `## [1.26.3]`을 추가한다. PRD Milestone 2 행을 `in-progress` + Plan 셀 연결로 갱신한다.

  PRD Open Questions에 **한 항목을 신설**한다(DD15 P2 접속 계약이 예고한 등재): "P2가
  P1 원장을 소비한다면 그 접속은 같은 워크트리·같은 루프로 한정되며, 루프 간 지속성 ·
  워크트리 간 조회 · slug discovery는 M2가 정의하지 않는다 — P2 착수 시 그 셋 중 무엇이
  실제로 필요한지 먼저 판정하고, 필요하면 P0 재개 사유다." 미정의를 문서에 남기지 않으면
  다음 milestone이 그것을 있는 것으로 전제한다.
- **Mirror**: `docs/ENVIRONMENT.md:358`(M1의 `MCCP_SANTA_SEVERITY_GATE` 항목 서술 밀도) ·
  `docs/santa-loop/ownership.md:65`(P1 추가 기록 문단의 형식)
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"`
  이 `1.26.3`

### Task 7: 실 경로 1회 완주

- **Action**: 이 저장소에서 `/mccp:santa-loop`을 돌린다. **두 부분으로 나뉘고, 앞부분만
  무조건 달성 가능하다** — 그 사실을 미리 적는 것이 이 Task의 정직성 조건이다.

  **(A) 무조건부 — 라운드 결과와 무관하게 달성해야 한다.**
  1. `begin-round`가 coverage 선검사를 지나 라운드를 연다(최초 라운드이거나 직전 FINAL
     라운드의 blocking이 0건이면 공허 참으로 통과 — 그 통과 자체가 검사가 도는 증거다).
  2. `verdict` stdout에 `suppressed`·`entries`·`ledger` 키가 실린다.
  3. Step 5.5 seal이 성공하고 receipt `meta.santa_entries`가 정수로 봉인된다.

  **(B) 무조건부 — 종자 결함 probe로 성립시킨다.** 초안은 이 절을 "blocking을 낸 라운드가
  실제로 발생했을 때만"으로 두었다. **그 조건부를 제거한다**(R2 test CRITICAL + HIGH ×2,
  architect MEDIUM — 네 관점 중 둘이 독립으로 같은 자리를 지목했다).

  조건부였던 이유는 타당했다: M1이 같은 저장소에서 3라운드를 돌려 blocking 0건·전원 PASS를
  실측했으므로(PRD Open Questions), 리뷰어가 CRITICAL/HIGH를 낼지는 M2가 통제할 수 없다.
  그러나 그 통제 불가를 Acceptance의 조건절로 옮기면, **milestone의 중심 주장(종결된 지적이
  재계수되지 않는다)이 실경로에서 한 번도 검증되지 않은 채 "complete"가 성립한다.** 통제할 수
  없는 것은 리뷰어의 판단이지 **리뷰 대상**이 아니므로, 대상 쪽을 통제한다.

  **probe 절차** — 별도 워크트리(§3.8 `.worktrees/`)에 scratch 브랜치를 만들고, 거기서 M2가
  방금 넣은 fail-closed 가드 **하나를 되돌린다**: DD13의 라운드 결속(`entry.round < N`)을
  제거해 자기-suppression이 가능해지게 한다. 그 상태의 uncommitted diff를 대상으로
  `/mccp:santa-loop --decision santa-adjudication-m2-probe`를 돌린다. 리뷰어는 "판정을 기록하고
  같은 라운드의 `verdict`를 다시 부르면 리뷰 없이 NICE에 도달해 seal·push된다"는 구체적
  오동작을 서술할 수 있으므로 blocking이 성립한다. 그 뒤 4~6을 실행한다:

  4. 그 blocking 전건에 `adjudicate`를 기록하고, 하나 이상을 `rejected`로 남긴다.
  5. 판정 없이 `begin-round`를 부르면 exit 2 + 라운드 미개설임을 먼저 확인하고(캡 미소모),
     판정 후 다시 부르면 열린다.
  6. 다음 라운드에 같은 claim이 재등장하면 `suppressed`에 담기고 `blocking`에서 빠진다.

  **합성 리뷰어 JSON 금지는 그대로다 — 오히려 이 절차가 그 금지의 요점이다.** 종자는 *리뷰
  대상*에 있고 *리뷰어 출력*에는 없다. 리뷰어는 실제로 코드를 읽고 실제로 판단하며, 그 출력은
  실제 CLI를 지나 실제 원장에 들어간다. 합성 JSON이 이 Task를 삭제하는 이유(리뷰어를 우회하면
  검증 대상이 리뷰어가 아니라 나 자신이 된다)가 여기서는 발생하지 않는다.

  **probe는 본 브랜치를 오염시키지 않는다.** 되돌린 가드는 scratch 워크트리의 uncommitted
  변경으로만 존재하고 커밋·머지되지 않으며, probe 종료 후 `git worktree remove`로 제거한다.
  아래 Validation의 P0 무접촉 검사와 `--diff-filter=D` 검사는 본 브랜치에 대해 그대로 돌고,
  probe slug의 원장은 그 워크트리와 함께 사라진다(DD15 — 그 소멸이 정상 동작이다).

  **그럼에도 probe가 blocking을 못 얻으면 milestone은 complete가 아니다.** 확률은 크게
  낮아졌지만 0은 아니다 — 리뷰어가 되돌린 가드를 못 보거나 MEDIUM으로만 낼 수 있다. 그 경우
  처리는 M1이 세운 선례 그대로다: probe 각 라운드의 `contract`·`blocking`·`suppressed`·
  `carryOver` 실측값을 PRD Open Questions에 남기고 (B)를 **미충족으로 기록**하며, **PRD
  Milestone 2 행을 `complete`로 바꾸지 않는다**(Acceptance가 같은 문장을 반복한다 — 초안은
  Task 7이 "complete가 아니다"라고 적고 Acceptance는 "미충족으로 기록"만 요구해 두 절이 서로를
  반박했고, 그 틈이 R2 test CRITICAL의 실체였다). (B)의 기계적 정합성은 fixture repo를 지나는
  커버리지 41~46·49가 이미 덮으므로, 남는 것은 "실경로에서도 관측됐다"는 사실 하나이고 그것이
  이 Task가 사는 이유다.
- **Mirror**: `plugins/mccp/commands/santa-loop.md` Step 0~7 전 경로 (합성 fixture가 아니라
  실제 CLI)
- **Validate**: 아래 4개가 (A)에 대해 전부 통과해야 한다. `$DECISION`은
  `node $S resolve-decision`이 내는 값을 쓴다 — 하드코딩하면 브랜치가 다를 때 엉뚱한 원장을
  검사한다(M1 R2 backlog 항목).
  ```bash
  S=plugins/mccp/scripts/lib/santa/cli.js
  DECISION=$(node $S resolve-decision | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).decisionId)')
  # (a) 원장이 라운드를 기록했다
  node $S status --decision "$DECISION" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(!(j.rounds>=1))process.exit(1);console.log("rounds="+j.rounds+" entries="+j.entries)'
  # (b) verdict stdout이 M2 키 3종을 싣는다
  node $S verdict --decision "$DECISION" --round 0 | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));["suppressed","entries","ledger"].forEach(k=>{if(!(k in j)){console.error("missing key: "+k);process.exit(1)}});console.log("verdict keys ok: suppressed="+j.suppressed.length+" entries="+j.entries)'
  # (c) 집계 리포트가 산출됐다
  test -f ".claude/reviews/santa-review-$DECISION.md"
  # (d) receipt의 santa_entries가 원장과 일치한다 (타입만 보면 원장 0건에 receipt 5가 실려도 통과한다)
  node -e '
    const d=process.argv[1];
    const r=require("./.claude/receipts/mccp-santa-review/"+d+".json");
    const l=require("./.claude/state/santa-loop/"+d+".json");
    if(!Number.isInteger(r.meta.santa_entries))process.exit(1);
    if(r.meta.santa_entries!==(l.entries||[]).length){
      console.error("sealed santa_entries="+r.meta.santa_entries+" but ledger has "+(l.entries||[]).length);
      process.exit(1);}
    console.log("sealed santa_entries="+r.meta.santa_entries+" matches ledger")' "$DECISION"
  ```

  (B)는 probe slug에 대해 아래 셋이 전부 통과해야 한다. `$PROBE`는 probe 워크트리에서
  `santa-adjudication-m2-probe`로 고정한다 — 브랜치 파생에 맡기면 워크트리 이름에 따라 slug가
  갈려 (e)~(g)가 서로 다른 원장을 본다.
  ```bash
  S=plugins/mccp/scripts/lib/santa/cli.js
  PROBE=santa-adjudication-m2-probe
  # (e) 미판정 blocking이 남은 채로는 라운드가 열리지 않고 캡도 소모되지 않는다
  BEFORE=$(node $S status --decision "$PROBE" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).rounds))')
  node $S begin-round --decision "$PROBE"; test $? -eq 2 || { echo "begin-round should have refused"; exit 1; }
  AFTER=$(node $S status --decision "$PROBE" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).rounds))')
  test "$BEFORE" = "$AFTER" || { echo "cap consumed on a refused begin-round: $BEFORE -> $AFTER"; exit 1; }
  # (f) 판정을 기록하면(하나 이상 rejected) 같은 호출이 열린다
  node $S adjudicate --decision "$PROBE" --round "$N" --issue "$ISSUE" \
    --disposition rejected --evidence "<실질 사유 — validateReason strict를 지난다>"
  node $S begin-round --decision "$PROBE" || { echo "begin-round still refused after full adjudication"; exit 1; }
  # (g) 다음 라운드의 같은 claim은 suppressed에 담기고 blocking에서 빠진다
  node $S verdict --decision "$PROBE" --round $((N+1)) | node -e '
    const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const hit=(j.suppressed||[]).some(s=>s.issueId===process.argv[1]);
    if(!hit){console.error("issue not suppressed in round N+1");process.exit(1);}
    if((j.blocking||[]).some(b=>b.issueId===process.argv[1])){
      console.error("issue still counted as blocking after suppression");process.exit(1);}
    console.log("suppressed="+j.suppressed.length+" carryOver="+JSON.stringify(j.carryOver));
  ' "$ISSUE"
  ```

## Validation

```bash
# 단위 + CLI 경유 회귀
node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js
node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js
node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js
node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js
node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js

# 커버리지 계약 — 1..MAX. M1의 1~25를 함께 검사하는 것이 의도다: M2가 같은 파일을 고치므로
# 기존 항목의 소실이 이 스크립트로 잡혀야 한다.
#
# 상한은 **하드코딩하지 않고 plan의 커버리지 표에서 파생**한다(R3 흡수). R1이 카운트 드리프트
# 세 표면을 동기화했는데 네 번째(Task 5의 Validate 줄)가 `48/48`로 남아 R3에서 다시 잡혔다.
# 같은 수를 여러 곳에 적는 한 동기화는 계속 실패하므로, 계약 원본을 **표 하나**로 못박고
# 스크립트가 그것을 읽는다. 이제 표에 행을 더하면 상한이 따라 오르고, 그 행의 test가 없으면
# 그 자리에서 red다.
node -e '
  const fs=require("fs");
  const PLAN=".claude/plans/santa-adjudication-m2.plan.md";
  const files=["plugins/mccp/scripts/lib/tests/santa-adjudication.test.js",
               "plugins/mccp/scripts/lib/tests/santa-gate.test.js"];
  const absent=files.filter(f=>!fs.existsSync(f));
  if(absent.length){console.error("coverage check cannot run — test file(s) not found: "+
    absent.join(", "));process.exit(1);}
  let plan;
  try{plan=fs.readFileSync(PLAN,"utf8");}catch(e){
    console.error("coverage bound cannot be derived — plan unreadable: "+PLAN);process.exit(1);}
  // 커버리지 표는 첫 셀이 맨 정수인 유일한 표다(다른 표는 백틱 경로·UI id·산문으로 시작한다).
  const ids=[...plan.matchAll(/^\| (\d+) \|/gm)].map(m=>Number(m[1]));
  if(!ids.length){console.error("coverage table not found in "+PLAN+
    " — rows must start with `| <id> |`");process.exit(1);}
  const MAX=Math.max.apply(null,ids);
  const body=files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
  const missing=[], assertless=[];
  for(let i=1;i<=MAX;i++){
    const at=body.indexOf("["+i+"]");
    if(at===-1){missing.push(i);continue;}
    const rest=body.slice(at);
    const next=rest.slice(1).search(/\n\s*(?:test|it)\s*\(/);
    const block=next===-1?rest:rest.slice(0,next+1);
    if(!/\bassert\b/.test(block)) assertless.push(i);
  }
  if(missing.length){console.error("missing coverage ids: "+missing.join(", "));process.exit(1);}
  if(assertless.length){console.error("coverage ids present but assert-free: "+
    assertless.join(", "));process.exit(1);}
  console.log("coverage "+MAX+"/"+MAX+" (bound derived from the plan table), "+
    "every item has at least one assertion");
'

# 동결 함수 무변경 + 신규 export 존재. decideVerdict가 원장 축을 갖게 되면 red.
node -e '
  const a=require("assert");
  const g=require("./plugins/mccp/scripts/lib/santa/gate");
  const adj=require("./plugins/mccp/scripts/lib/santa/adjudication");
  const two=[{id:"A",model:"m",verdict:"PASS",criticalIssues:[]},
             {id:"B",model:"m",verdict:"PASS",criticalIssues:[]}];
  const r=g.decideVerdict({reviewers:two});
  a.equal(r.verdict,"NICE"); a.deepEqual(r.failing,[]); a.equal(r.exitReason,null);
  a.deepEqual(Object.keys(r).sort(), ["exitReason","failing","verdict"],
    "decideVerdict return shape must stay exactly 3 fields (ownership.md frozen contract)");
  ["decideAdjudicatedVerdict","analyzeReviewers","classifyFinding","parseSeverityGate",
   "issueIdOf","widthNormalized"].forEach(function(k){
    a.equal(typeof g[k],"function","missing gate export: "+k);
  });
  ["buildEntry","foldEntries","coverageOf","carryOverOf","parseAdjudicationGate",
   "parseLedgerSuppression"].forEach(function(k){
      a.equal(typeof adj[k],"function","missing adjudication export: "+k);
  });
  console.log("frozen function unchanged; gate 6 + adjudication 6 exports present");
'

# 소유권 표 교집합 ∅ — P1이 P0 파일(ledger.js · seal.js · counter.js)을 열지 않았는지
git diff --name-only origin/main...HEAD | node -e '
  const fs=require("fs");
  const P0=["plugins/mccp/scripts/lib/santa/ledger.js",
            "plugins/mccp/scripts/lib/santa/seal.js",
            "plugins/mccp/scripts/lib/santa/counter.js"];
  const touched=fs.readFileSync(0,"utf8").split(/\r?\n/).filter(Boolean);
  const bad=P0.filter(p=>touched.indexOf(p)!==-1);
  if(bad.length){console.error("P1 touched P0-owned files (ownership.md): "+bad.join(", "));
    process.exit(1);}
  console.log("P0 files untouched");
'

# §3.5.1 — 이 브랜치가 삭제하는 파일 확인 (의도치 않은 삭제 0건이어야 함)
git diff --diff-filter=D --name-only origin/main...HEAD
```

**커버리지 스크립트가 보증하는 것과 보증하지 않는 것** (R5 invariant HIGH 흡수). 스크립트는
`[N]` id의 **존재**와 그 블록에 `assert`가 **한 번 이상 나타남**까지만 본다. 단언의 *내용*은
보지 않으므로, 항목 56을 `assert.equal(1, 1)`로 써도 커버리지는 통과하고 `node --test`도
green이다. 이것은 항목 56의 결함이 아니라 id 계약이라는 기계 장치의 경계이고, 그 경계를 여기
적어 두는 이유는 `coverage 60/60`이라는 출력이 "60개 명제가 검증됐다"로 읽히기 쉽기 때문이다.
**그 출력이 뜻하는 것은 "60개 자리에 test가 있고 각각 최소 한 번 단언한다"까지다.** 내용의
정합성을 보는 것은 이 스크립트가 아니라 리뷰이고, 그래서 커버리지 표의 각 행이 *무엇을*
고정하는지를 한 문장으로 적는다 — 그 문장이 리뷰의 대조 기준이다. 임계나 커버리지 퍼센트를
발명해 이 간극을 메우지 않는다(§3.13.1과 같은 이유: 방어할 근거 없는 숫자를 만들지 않는다).

### 커버리지 계약 (test 이름의 `[N]`)

M1이 소유한 1~25는 이 표에 다시 적지 않는다 — 그 항목들은 무변경이고
`.claude/plans/santa-adjudication-m1.plan.md`가 계속 소유한다. 아래는 M2가 **새로 쓰는**
35개이고, 전부 `santa-adjudication.test.js`에 산다(커버리지 스크립트가 스캔하는 두 파일 중
하나여야 하고, `santa-gate.test.js`는 M2에서도 단언 코드에 diff가 없으므로 새 id를 받지 않는다).

| # | 무엇을 고정하는가 |
|---|---|
| 26 | `parseAdjudicationGate`·`parseLedgerSuppression` — 미설정은 `enforce`, `off`는 `off`, 불량값은 loud warn 후 `enforce`. 두 파서 각각 |
| 27 | `issueIdOf` — 대소문자·공백만 다른 claim은 같은 id, 다른 claim은 다른 id, 비문자열·`null`에도 던지지 않는다. **`normalizeClaim` 등가성만 잰다** — 패러프레이즈(같은 결함의 다른 문장)는 이 항목의 대상이 아니고 항목 58이 그 실패 모드를 따로 고정한다(R2 test HIGH — 27이 그 이상을 덮는 것처럼 읽혔다) |
| 28 | `buildEntry` — 정상 입력은 DD2의 8필드 **정확히**(그 외 키 0개)이고 `issue_id`는 인자가 아니라 `claim`에서 파생된다 |
| 29 | `buildEntry` — 미인식 `disposition`·`severity` MEDIUM·`round` 음수·비실질 `evidence`는 각각 throw. 네 경우를 각각 단언한다 |
| 30 | `foldEntries` — 같은 `issue_id`의 뒤 entry가 이긴다(last-wins). `round`가 다른 두 entry는 `byRoundIssue` 키가 다르다 |
| 31 | `foldEntries` — 손상 entry는 `malformed`로 계수되고 `resolution`·`byRoundIssue` 어디에도 들어가지 않는다(던지지 않는다). `entries` 비배열·`null`도 같다. **`kind`가 다른 문자열인 행은 `malformed`에도 들어가지 않고 무시되며, `kind` 부재 행은 반대로 검증을 거쳐 `malformed`가 된다** — 두 경우를 각각 단언한다(남의 행 vs 태그를 빠뜨린 행) |
| 32 | `foldEntries` — 같은 `(round, issue_id)` 중복 append는 `duplicates`로 계수되되 fold는 하나로 수렴한다 |
| 33 | **하위 호환** — `resolved` 부재 시 반환의 **M1 7키만 뽑아** M1 반환과 `deepEqual`, 신규 두 키가 `[]`·`false`, 그리고 **키 집합이 정확히 9개**. 반환 전체 `deepEqual`은 설계상 통과할 수 없으므로 쓰지 않는다(R1 architect HIGH) |
| 34 | `rejected` 종결 항목이 다음 라운드에 재등장하면 `blocking`에서 빠지고 `suppressed`에 담겨 라운드가 **NICE**가 된다 (PRD 재보고 차단) |
| 35 | `absorbed` 재등장도 suppress되되 `kind:'absorbed-rereported'`로 분류된다 (DD8 — 신호가 사라지지 않는다) |
| 36 | `skipped`·`reopened`는 suppress하지 **않는다** → 같은 입력이 NAUGHTY로 남는다. 두 값 각각 |
| 37 | suppression이 `byReviewer[].blocking`(원시 분모)을 바꾸지 않는다 — 강등 비율이 보존된다 (DD4 (b) · UI8) |
| 38 | `MCCP_SANTA_LEDGER_SUPPRESSION=off`면 종결 항목도 blocking으로 남는다 (M1 등가 · 대조군 — DD7) |
| 39 | `coverageOf` — 라운드 N의 effective blocking 전건에 `round === N` entry가 있어야 `covered`. 라운드가 다른 entry는 충족시키지 못한다 (DD6의 결속) |
| 40 | `coverageOf` — suppressed 항목은 `missing`에 들어가지 않는다 (종결 항목이 매 라운드 재판정을 요구하지 않는다) |
| 41 | `cli adjudicate` — 정상 append 후 원장 `entries` 길이가 1 늘고 stdout이 `{appended:true, …}`이며, 저장된 `claim`은 인자가 아니라 원장 blocking 행의 원문이다 |
| 42 | `cli adjudicate` — 미개설 라운드·그 라운드에 없는 `--issue`·미인식 `--disposition`은 각각 exit 2 + **append 0건**. 세 경우를 각각 단언한다 |
| 43 | `cli begin-round` — 직전 FINAL 라운드의 blocking이 미판정이면 exit 2이고 **라운드가 열리지 않는다**(`rounds.length` 불변 = 캡 미소모) |
| 44 | `cli begin-round` — 같은 fixture에서 전건 판정 후 다시 부르면 라운드가 열린다 (A/B — 43과 쌍) |
| 45 | `cli begin-round` — `MCCP_SANTA_ADJUDICATION_GATE=off`면 loud stderr warn 후 라운드가 열린다 |
| 46 | `cli verdict` — stdout에 `suppressed`·`entries`·`ledger`·`carryOver`가 실리고 기존 7키가 유지되며, `ledger.read`가 **1회만** 호출된다(spy — DD10). `carryOver`가 직전 라운드를 보는데도 읽기가 1회임을 같은 spy로 고정한다 — 최종 JSON만 보면 읽기 횟수가 보이지 않는다 |
| 47 | `santa-loop.md` — Step 5에 판정 기록 단계가 있고, **Step 3 블록으로 범위를 한정해** `adjudicate`·`entries`·`suppressed` 토큰이 **부재**하며(I3 · DD9), 같은 블록 **안에** M1이 고정한 두 문언(FAIL-first 문장 · `failure_scenario` 요구)이 존재한다. 부재+존재를 같은 절 경계 안에서 재는 것이 이 항목의 본체다 — 파일 전역 단언(항목 14·20)은 "지워졌다"만 잡고 "옮겨졌다"는 놓친다 |
| 48 | receipt negative — `meta.santa_entries`가 정수로 봉인되고 receipt에 entry의 `evidence`·`claim` 본문이 **부재**하며, 같은 왕복의 원장에는 존재한다. 두 단언이 함께 있어야 "원장에는 있고 receipt에는 없다"가 검사된다 |
| 49 | **DD13 자기-suppression 차단** — 라운드 N의 blocking을 `absorbed`로 기록한 뒤 `verdict --round N`을 다시 부르면 여전히 NAUGHTY이고, 같은 claim이 라운드 N+1에 재등장했을 때만 suppress된다. 이 항목 하나가 "판정만으로 루프를 끝내는" 우회를 고정한다 |
| 50 | `resolved`가 비어 있지 않은데 `round`가 정수가 아니면 suppression 0건 + loud warn (라운드를 모르면 자기-suppression을 막을 수 없으므로 M1 동작으로 떨어진다) |
| 51 | `niceBySuppression` — suppression 덕분에 NICE가 된 라운드에서만 `true`이고, suppression 없이 NICE인 라운드와 blocking이 남아 NAUGHTY인 라운드에서는 `false`. 세 경우를 각각 단언한다 |
| 52 | `cli record` — FINAL 라운드에 기록하면 exit 2 + **append 0건**(DD14). `rounds[N].reviewers.length` 불변을 단언한다 |
| 53 | `cli record` — 같은 라운드에 같은 `--id`를 다시 기록하면 exit 2 + append 0건 (DD14) |
| 54 | `cli verdict` — FINAL 라운드 재호출은 **mutation 없이** 같은 JSON을 exit 0으로 돌려준다(원장 바이트 불변). 저장 verdict와 재계산이 갈리는 fixture에서는 `SANTA_VERDICT_UNSTABLE` exit 2 |
| 55 | `cli adjudicate` — 이미 suppress된 issue도 `reopened`로 판정할 수 있다(존재 검사가 effective가 아니라 합집합이다). 그 뒤 라운드에서 다시 blocking으로 계수된다 |
| 56 | `analyzeReviewers` — 병합된 blocking 행마다 `issueId`가 존재하고 `issueIdOf(그 행의 claim)`과 **같다**. 같은 claim을 낸 두 리뷰어가 한 행으로 합쳐졌을 때도 id는 하나다. 이 필드가 빠지면 coverage·suppression·`adjudicate` 조회가 전부 `undefined` 키로 조용히 통과한다(Task 2 (2)) |
| 57 | `carryOverOf` — 정확 재보고는 `suppressed`로 잡히고 `resolvedAbsent === 0`. 라운드 0(`prevBlockingIds === null`)에서 `newBlocking`은 raw blocking 전체 크기다(비교 대상 부재를 0으로 접지 않는다) |
| 58 | **패러프레이즈 실패 모드** — 같은 결함을 다르게 쓴 claim은 id가 갈려 `suppressed`에 **담기지 않고** blocking으로 남으며, 그 사건이 `resolvedAbsent ≥ 1` ∧ `newBlocking ≥ 1`로 관측된다. DD5가 인정한 한계를 산문이 아니라 고정된 기대값으로 둔다 — 훗날 누군가 fuzzy matcher를 넣으면 이 test가 red가 되어 설계 변경이 명시적으로 드러난다 |
| 59 | **`lastBefore` 선택 규칙** (Task 2 모듈 지역 헬퍼 — `decideAdjudicatedVerdict` 경유로 잰다) — 같은 issue에 라운드 1 `rejected` · 라운드 2 `reopened` 이력이 있을 때 라운드 3의 판정은 **`reopened`**를 보아 suppress하지 않는다. 같은 라운드에 두 판정이 append되면 **append 순서상 뒤**가 이긴다(`round` 정렬이 아니다 — DD1). 이력이 부재(`undefined`)하거나 `round`가 정수가 아닌 행만 있으면 suppress 0건이고 던지지 않는다. 네 경우를 각각 단언한다 |
| 60 | **`issueId` 유실 시 runtime fail-closed** — blocking 행의 `issueId`가 부재·비문자열·빈 문자열일 때 (a) `coverageOf`가 그 행을 `missing`에 담아 `covered:false`를 내고, (b) `decideAdjudicatedVerdict`가 그 행을 절대 suppress하지 않고 `effective`에 남기며 loud warn한다. 두 단언이 함께 있어야 "필드가 사라지면 게이트가 꺼지는" 경로가 "게이트가 막는" 경로로 바뀐다(커버리지 56은 생산 지점의 build-time 가드이고 이 항목은 runtime 가드다) |

## Review Rounds

L2 반증 패널(architect · security · test · invariant, quorum 3-of-4)의 라운드 이력이다.
흡수·기각 판단은 CLAUDE.md §3.14를 따른다 — CRITICAL·HIGH만 그 자리에서 흡수하고,
MEDIUM·LOW와 기각한 HIGH는 근거와 함께 backlog에 남긴다.

### R1 — security·invariant pass (findings 0), architect·test fail, blocking 5건 → divergent

`decide`가 센 blocking 5건 중 **실질 finding은 3건**이고 나머지 둘은 `quorum.js`가 bare
`verdict='fail'` 하나로 합성한 `architect/FAIL`·`test/FAIL` 항목이다(CLAUDE.md §3.14가 해제
조건으로 지목한 그 누수). 실질 3건은 전부 **plan 내부 모순**이었고 전부 흡수했다.

| 출처 | 지적 | 흡수 |
|---|---|---|
| architect HIGH | DD4가 `resolved` 부재 시 반환이 M1과 **byte-identical**이라고 적는데 같은 Task가 반환에 `suppressed`·`niceBySuppression` 두 키를 더한다고 적는다. 그 표현대로 커버리지 33을 반환 전체 `deepEqual`로 구현하면 **통과할 수 없는 test**가 된다 | DD4에서 그 낱말을 제거하고 명제를 정정했다 — 하위 호환의 내용은 "반환이 같다"가 아니라 **"기존 7키의 값이 하나도 바뀌지 않는다"**이다. 커버리지 33도 그 형태로 재도록 다시 쓰고(7키만 뽑아 `deepEqual` + 신규 두 키 개별 단언 + **키 집합 9개** 고정), Task 5와 Risks의 같은 표현도 함께 고쳤다 |
| test HIGH ×2 | 커버리지 항목 수가 세 곳에서 서로 다른 말을 한다 — `Files to Change`와 Task 5 제목은 `26~48`(23개), 표는 `26~55`(30개), Validation 스크립트는 `1..55`를 검사하고 `55/55`를 출력한다 | 세 표면을 `26~55`(30개)로 통일했다. 원인은 항목 49~55를 나중에 추가하면서 카운트 문구만 스크립트로 일괄 치환하고 **Task 제목과 Files to Change 셀을 빠뜨린** 것이다. 같은 재발을 막기 위해 Task 1~3의 Validate 행에 **각 Task가 소유하는 항목 번호**를 명시했다 — 이제 표·스크립트·Task가 서로를 검증한다 |

기각한 것: 없다. security와 invariant는 findings 0으로 pass했고, 각자의
`refutationAttempted`에 공격한 축을 열거했다(security 10축 · invariant 10축).

**이 라운드가 잡은 셋은 전부 "plan이 자기 자신과 어긋난 자리"다.** 설계 판단을 뒤집은 것은
하나도 없고, 그래서 흡수 diff에 DD 신설이 없다 — 초안이 편집 중 갈라진 문장들을 다시 맞춘
것이 전부다. 그럼에도 architect 지적은 실질이었다: 그 문장을 그대로 구현했다면 커버리지 33이
**영원히 red**인 채로 착지했을 것이고, 그 test는 M2의 하위 호환 주장을 혼자 지고 있다.

### R2 — security pass, architect·test·invariant fail, blocking 10건 → divergent

`decide`가 센 10건 중 **실질 finding은 7건**이고 나머지 셋은 `quorum.js`가 bare
`verdict='fail'`로 합성한 `architect/FAIL`·`test/FAIL`·`invariant/FAIL`이다(§3.14 누수, R1과
동일). 실질 7건 중 여섯을 흡수하고 하나는 부분 반증했다. R1과 달리 이번에는 **설계를 바꾼
흡수가 둘**(DD5 지표 재정의 · Task 7 (B) 무조건화) 있다.

| 출처 | 지적 | 처리 |
|---|---|---|
| test **CRITICAL** + test HIGH ×1 (architect MEDIUM·test MEDIUM 동축) | Acceptance (B)가 "blocking 라운드가 발생했을 때만" 조건부라, milestone의 중심 주장(종결 지적 미재계수)이 **실경로에서 한 번도 검증되지 않은 채 complete가 성립**한다. Task 7은 "그때 complete가 아니다"라고 적는데 Acceptance는 "미충족으로 기록"만 요구해 두 절이 서로를 반박한다 | **흡수 — 조건절 제거.** 통제 불가능한 것은 리뷰어의 판단이지 **리뷰 대상**이 아니다. scratch 워크트리에서 DD13 라운드 결속을 되돌린 **종자 결함**을 실제 리뷰어에게 보이는 probe를 Task 7에 넣어 (B)를 무조건부로 만들고, Validate (e)~(g)를 추가했다. 합성 리뷰어 JSON 금지는 유지된다(종자는 대상에, 출력은 실물). Acceptance를 (A)/(B) 두 항목으로 갈라 Task 7과 **같은 문장**을 쓰게 했다 |
| test HIGH ×1 | DD5가 `reReportCandidates`("직전 라운드에도 있었으나 id가 다른 blocking 수")를 측정 수단으로 약속하는데 어떤 test도 그것을 검증하지 않는다 | **흡수 — 다만 test 추가가 아니라 지표 폐기.** 추적해 보니 그 수는 **계산 자체가 불가능**하다: "id가 다른데 같은 결함"이라는 판정이 곧 DD5가 거부한 fuzzy matching이다. Task 3에도 그 키가 없었다(약속만 있고 구현 자리가 없었다). 계산 가능한 집합 연산 3수(`carryOver:{suppressed, resolvedAbsent, newBlocking}`)로 대체하고 `adjudication.carryOverOf`를 신설했다 |
| test HIGH ×1 | 커버리지 27이 대소문자·공백 정규화만 재면서 DD5가 인정한 패러프레이즈 실패 모드는 test하지 않는다 | **흡수** — 27의 범위를 문언으로 좁히고, 항목 **58**을 신설해 "패러프레이즈는 suppress되지 **않는다**"를 고정된 기대값으로 뒀다. 훗날 fuzzy matcher가 들어오면 이 test가 red가 되어 설계 변경이 명시된다. 항목 **57**은 정확 재보고 쪽 대조군 |
| architect HIGH ×1 | DD15가 원장을 gitignored·ephemeral로 인정하면서 DD12는 "P2가 원장을 소비한다"를 receipt 필드 거부의 근거로 쓴다. 두 문장은 동시에 참일 수 없고, 그 사이에 **미문서화 데이터 의존**이 남는다 (P2의 slug discovery·경로 파생 미정의) | **흡수** — DD15에 **P2 접속 계약**을 신설했다: 정의하는 것 셋(경로 파생 함수 · 유효 범위 · 읽기 형태)과 **정의하지 않는 것** 셋(루프 간 지속성 · 워크트리 간 조회 · slug discovery)을 나눠 적고 후자를 PRD Open Question으로 등재한다. DD12의 근거도 "읽는 코드가 0개" 하나로 좁혔다 |
| invariant HIGH ×1 | Task 2가 `analyzeReviewers`에 `issueId`를 더하는 것을 독립 항목이 아니라 (3)에 딸린 절로 적어, `adjudicate`의 id 조회가 기댈 필드의 생성 책임이 불명확하다 | **흡수** — 독립 작업 항목으로 승격하고 소비자 셋(조회·coverage 키·suppression 이력)을 명시했다. 빠졌을 때의 증상이 크래시가 아니라 **조용한 fail-open**("coverage 늘 통과 · suppression 늘 0건")이라는 점을 적고, 커버리지 **56**이 `blocking[].issueId === issueIdOf(claim)`을 직접 단언한다 |
| architect HIGH ×1 | 공유 표면 `santa-loop.md`의 절 단위 편집에 기계적 강제가 없다. 커버리지 47은 토큰 3종의 **부재**만 보므로 Step 3 원문이 온전한지는 검사하지 않는다 | **부분 반증 + 잔여 흡수.** 뒤 절반은 사실과 다르다 — M1 항목 **14**(FAIL-first 문장 한 글자 단위)·**20**(스키마·`failure_scenario`·env 문언)이 `santa-loop.md`를 읽어 존재를 단언하고(`plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` line 383 · line 517), Validation이 1..MAX를 전수 검사하므로 **PR #110형 삭제 사고는 이미 red다**. 실재하는 잔여는 그 단언이 파일 전역이라 "옮겨졌다"를 놓치는 것 하나이고, 커버리지 47을 Step 3 블록 **범위 한정** + 같은 블록 내 존재 단언으로 좁혀 그것을 닫았다 |

기각/이연한 것 — 전부 §3.14대로 backlog에 근거와 함께 append했다:

- **합성 `FAIL` 3건** — `quorum.js:175-181`이 bare `verdict='fail'`을 `severity:'FAIL'` blocking으로
  올린 것. 세 리뷰어의 자기 최고 severity는 각각 HIGH·CRITICAL·HIGH이고 그 실질 항목은 위에서
  전부 처리했으므로, 이 세 행은 같은 지적의 중복 계수다. §3.14가 해제 조건으로 지목한 그 누수.
- **invariant MEDIUM** — "Step 5가 entry 수를 receipt writer에 어떻게 전달하는지 Tasks에
  명시되지 않았다". 리뷰어 스스로 "설계는 실제로 옳다(`seal.js`가 `aggregateFrom`으로
  `entries.length`를 읽는다)"고 적었다. 서술 명료성 항목이라 §3.14대로 backlog.

**R1은 plan이 자기와 어긋난 자리만 잡았고, R2는 plan이 세계와 어긋난 자리를 잡았다.** 계산할 수
없는 지표를 약속한 것과, 검증되지 않아도 통과하는 Acceptance를 둔 것 — 둘 다 문장을 맞추는
것으로는 닫히지 않고 설계를 바꿔야 닫힌다. 반대로 architect의 공유 표면 지적은 **이미 있는
가드를 보지 못한** 것이었고, 그 경우의 정직한 처리는 수용도 무시도 아니라 근거를 대고 잔여만
가져오는 것이다.

### R3 — security pass, architect·test fail, invariant 무응답, blocking 6건 → divergent

패널이 **3/4만 응답**했다 — invariant 리뷰어가 `StructuredOutput`을 부르지 않고 종료해
`results[3]`이 `null`이다(`coverage: 3`). quorum은 3-of-4라 응답 수 자체는 임계를 채웠고,
divergent 사유는 무응답이 아니라 blocking 6건이다. 그중 실질은 **4건**이고 둘은 R1·R2와 같은
`architect/FAIL`·`test/FAIL` 합성이다.

| 출처 | 지적 | 처리 |
|---|---|---|
| architect **CRITICAL** | Task 2 의사코드가 `lastBefore(resolved.get(b.issueId), round)`를 부르는데 **그 함수가 plan 어디에도 정의되지 않았다**. null/undefined 입력 동작과 경계 사례가 미명세다 | **흡수.** DD13의 정확성이 이름만 있고 몸이 없는 함수에 걸려 있었다. gate.js **모듈 지역** 헬퍼로 정의를 삽입했다(export하지 않는 이유: `adjudication.js`에 두면 gate ← adjudication 순환 import — adjudication은 `issueIdOf` 때문에 이미 gate를 import한다). 비배열·부재는 `null` 반환, `round` 비정수 행은 건너뜀(손상 판정이 blocking을 지우지 못하게 — DD1 방향), "마지막"은 **append 순서**이지 `round` 정렬이 아님을 명시했다. 커버리지 **59**가 네 경우를 고정한다 |
| architect HIGH | `foldEntries` 명세가 `kind` 필터링을 적지 않는다. DD2는 태그의 목적("fold가 자기 것만 골라 읽도록")을 적어 두었는데 Task 1의 명세에서는 암묵이다 | **흡수** — 입력 필터를 명세 맨 앞에 올렸다. 다만 두 경우를 **가른다**: `kind`가 다른 문자열이면 남의 행이라 검증 이전에 무시(`malformed` 아님), **부재·비문자열이면 adjudication 후보로 검증에 넘겨 `malformed`**로 떨어뜨린다. 후자를 "남의 행"으로 접으면 태그를 빠뜨린 writer의 행이 조용히 사라지는데, `malformed`는 suppression에도 coverage에도 기여하지 않아 어느 쪽으로도 게이트를 열지 않는다. 커버리지 31이 두 경우를 각각 단언한다 |
| architect HIGH | `issueId`가 세 소비 경로를 올바로 통과하는지 검증되지 않았다 — 생산 지점만 보고 중간 변형은 보지 않는다 | **흡수 — 새 test가 아니라 매핑 명시.** 소비마다 이미 fixture repo를 지나는 항목이 있다: `adjudicate` 조회 **41·42·55** · `coverageOf` 키 **39·40** · suppression 이력 **34~36·49**. 어느 항목이 어느 소비를 지키는지를 Task 2에 적어, "생산만 고정했다"는 읽기가 성립하지 않게 했다 |
| test HIGH (+ 같은 축 MEDIUM 1건) | Task 5의 Validate 줄이 `48/48`을 보고한다고 적는데 표는 26~58이고 스크립트는 1..58을 검사한다 | **흡수 — 그리고 이번엔 동기화하지 않고 숫자를 없앴다.** R1이 이 드리프트를 잡아 세 표면을 통일했는데 **네 번째 표면인 이 줄이 남아** 두 라운드 뒤 같은 결함으로 다시 잡혔다. 같은 수를 N곳에 적는 한 N+1번째가 생기므로, Validation 스크립트가 상한을 **커버리지 표에서 파생**하도록 바꾸고(`^\| (\d+) \|` — 첫 셀이 맨 정수인 유일한 표다) Task 5 Validate와 Acceptance에서 총계 숫자를 삭제했다. 이제 계약 원본은 표 하나이고, 표에 행을 더하면 상한이 따라 오른다 |

기각/이연 — backlog에 근거와 함께 append:

- **합성 `FAIL` 2건** — R1·R2와 같은 `quorum.js:175-181` 누수. 두 리뷰어의 자기 최고 severity는
  CRITICAL·HIGH이고 실질 항목은 위에서 전부 처리했다.
- **test MEDIUM — "항목 26~59가 test 파일에 아직 없어 Validation이 실패한다"** — 범주 오류다.
  그 항목들을 **쓰는 것이 Task 5**이고, 미작성 test를 근거로 plan을 반증하면 어떤 plan도
  통과할 수 없다. 같은 오류가 이전 사이클 R3·R6·R8에서 세 번 재발했고 STATE.md가 이미
  `mccp:review-test` 프롬프트 축으로 분류했다. 이 리뷰어는 그 오류를 **실재 결함(`48/48`)과
  한 finding에 묶어** 냈으므로 실재 절반만 흡수했다.
- **test MEDIUM — "(B) probe가 리뷰어의 발견에 의존한다"** — 사실이고 plan이 그렇게 적었다.
  리뷰어 스스로 "properly risk-disclosed and honest about incompleteness path"라고 적었다.
  확률을 낮추는 것이 probe의 목적이고 0으로 만들 수는 없다(§3.14대로 MEDIUM은 backlog).
- **invariant 무응답** — 결함이 아니라 도구 실패(`StructuredOutput` 미호출). quorum이 3-of-4라
  판정은 성립했다. 재발하면 관측 대상이므로 backlog에 남긴다.

**R3의 교훈은 "고쳤다고 선언한 결함이 네 번째 표면에서 살아 있었다"는 것 하나다.** R1은
표면을 세어 동기화했고 그 방법은 세는 데 실패했다. 흡수의 형태를 *같은 값을 한 곳 더 맞추는
것*에서 *값을 하나만 두고 나머지를 파생시키는 것*으로 바꾼 것이 이 라운드의 실제 산출이다.

### R4 — architect·security pass (findings 0), test·invariant fail → 실질 1건

패널 4/4 응답. **architect와 security가 각각 findings 0으로 pass**했고 — architect는 R2·R3에서
연속으로 실질 결함을 냈던 관점이다 — 남은 두 관점의 13건 중 **실질은 1건**이다.

| 출처 | 지적 | 처리 |
|---|---|---|
| invariant **CRITICAL** | `issueId`가 blocking 행에서 유실되면 coverage가 늘 통과하고 suppression이 늘 0건이 되는 조용한 fail-open | **흡수.** plan은 이 증상을 Task 2에 적어 두었고 커버리지 56으로 막았지만, **56은 생산 지점의 build-time 가드**다. 리뷰어가 가리킨 것은 runtime이고 그 구분은 옳다. `coverageOf`는 `issueId` 없는 행을 `missing`으로 떨어뜨려 `covered:false`를 내고, `decideAdjudicatedVerdict`는 그 행을 절대 suppress하지 않고 loud warn한다. 커버리지 **60**이 둘을 함께 단언한다 — 필드 유실이 "게이트가 꺼짐"에서 "게이트가 막음"으로 바뀐다 |

기각 — 전부 근거를 붙여 backlog에 append했다:

- **invariant HIGH ×2 — 방향이 반대다.** (a) "`round`가 정수가 아니면 fail-open이라 같은 라운드
  자기-suppression이 가능하다": `canSuppress`가 `Number.isInteger(round)`를 AND로 요구하므로
  정수가 아니면 **suppression이 0건**(= M1 동등)이다. 더 엄격해지는 쪽이고 커버리지 50이 그것을
  고정한다. (b) "손상 entry가 조용히 suppression을 우회한다": 우회가 아니라 **DD1이 정한 방향**
  이다 — 읽을 수 없는 판정은 blocking을 지우지도 판정 의무를 면제하지도 않는다. 그리고 조용하지
  않다: `malformed` 카운터가 `verdict` stdout의 `ledger`에 실린다.
- **invariant MEDIUM ×3** — §3.14대로 backlog(entry 수 전달 경로 명시 = R2에서 이미 등재한 항목의
  재관측 · `ledger.read` 실패 시 coverage 게이트 동작 미지정 · M1 test가 신규 `issueId` 필드를
  검증하지 않음 = 커버리지 56이 답이나 M1 파일에는 없다).
- **test 7건 전부 — 같은 범주 오류이고 이번엔 출력의 100%다.** CRITICAL 3 + HIGH 4가 모두
  "`gate.js`에 `issueIdOf`가 없다" · "`adjudication.js` 파일이 없다" · "`lastBefore`를 grep해도
  안 나온다" · "커버리지 26~60이 test 파일에 없다" 형태다. **그것을 만드는 것이 이 plan의
  Task 1~5**이므로, 이 논법이 유효하면 신규 코드를 담은 어떤 plan도 통과할 수 없다. 같은 오류가
  이전 사이클 R3·R6·R8과 이번 R3에 이어 **다섯 번째**이고, R3에서는 실재 결함과 섞여 있었으나
  이번에는 섞인 것이 하나도 없다.

**R4는 수렴 신호와 계측 결함을 동시에 보여준다.** 실질 지적이 4건(R2)→4건(R3)→1건(R4)으로
줄었고 R2·R3에서 가장 날카로웠던 architect가 findings 0으로 돌아섰다. 동시에 `mccp:review-test`는
**한 건의 유효 지적도 내지 못했다** — 이 관점은 현재 plan 게이트에서 신호가 아니라 상수다.
그 판정을 여기 적는 이유는 §3.14가 "증거로 기각한 항목은 근거와 함께 남긴다"를 요구하기
때문이고, 이 기록이 backlog의 `review-test.md` 프롬프트 수정 항목의 근거가 된다.

### R5 — architect pass, security 무응답, test·invariant fail → 실질 2건

패널 3/4 응답(security가 `StructuredOutput` 미호출 — R3의 invariant에 이은 **두 번째** 도구 실패).
architect는 두 라운드 연속 findings 0. 실질 2건이고 **둘 다 R4 흡수가 만든 것**이다.

| 출처 | 지적 | 처리 |
|---|---|---|
| test **CRITICAL** ×3 (같은 결함) | Task 1·2의 Validate 줄이 커버리지 `60a`·`60b`를 참조하는데 표에는 `60`만 있다. Validation 스크립트는 표에서 파생한 **정수** id만 찾으므로 그 둘은 영원히 미충족이고, "계약 원본은 표 하나"라는 R3의 선언을 plan이 스스로 위반한다 | **흡수.** R4에서 항목 60이 `coverageOf`와 `decideAdjudicatedVerdict` 두 함수를 함께 재는 것을 표현하려고 문자 접미사를 붙인 것이 원인이다. 한 항목을 두 Task가 나눠 지는 것은 정상이고 표현 방법은 **같은 정수를 양쪽에 적는 것**이다. 접미사를 제거하고, 왜 붙이면 안 되는지(스크립트가 정수만 찾는다)를 같은 자리에 적었다 |
| invariant HIGH | 커버리지 스크립트가 `[N]` 존재와 `assert` 출현만 보므로, 항목 56을 `assert.equal(1,1)`로 써도 통과한다 — 그 항목이 지키기로 한 fail-open이 무방비로 남는다 | **흡수 — 기계를 늘리지 않고 경계를 적었다.** 지적은 옳지만 이것은 항목 56의 결함이 아니라 **id 계약이라는 장치의 경계**이고, 단언 내용을 기계로 검증하려면 임계나 휴리스틱을 발명해야 한다(§3.13.1이 거부한 것). Validation 절에 스크립트가 보증하는 것과 보증하지 않는 것을 명시하고, `coverage 60/60` 출력이 "60개 명제가 검증됐다"가 아니라 "60개 자리에 test가 있고 각각 최소 한 번 단언한다"임을 못박았다. 내용 정합성의 대조 기준은 커버리지 표의 각 행 문장이다 |

기각 — backlog에 근거와 함께:

- **invariant MEDIUM ×2가 "파일을 다 못 봤다"에 기댄다.** (a) "커버리지 표 26~60이 연속으로
  보이지 않아 전부 있는지 확인 불가" — 표는 한 자리에 연속으로 있고 기계 확인 결과 35행·gap 0이다.
  (b) "`gate.js`에 `issueIdOf`가 export돼 있는지 확인해야 하는데 파일 앞부분만 봤다" — Task 2가
  **그것을 추가한다**고 적은 항목이라 R4에서 다섯 번째로 기각한 범주 오류의 약한 변종이다.
- **invariant MEDIUM ×1** (readReviewers spy가 옛 경로를 구별하지 못한다) · **LOW ×1**(fresh
  worktree에서 stale 원장으로 false INCOMPLETE) — §3.14대로 backlog. 후자는 실제로는 성립하지
  않는다: 워크트리가 새것이면 원장 파일이 아예 없어 FINAL 라운드가 0이고 coverage는 공허 참이다.

**R5는 흡수가 새 결함을 만들 수 있다는 것을 보여준다.** 두 실질 지적이 전부 R4 흡수의 부산물
이고, 그중 하나는 R3이 세운 규칙("계약 원본은 표 하나")을 R4가 곧바로 어긴 것이다. 라운드가
잡은 것은 plan의 설계가 아니라 **plan을 고치는 손**이고, 그래서 이 라운드는 낭비가 아니다.

## Risks

가장 큰 셋을 펼치고 나머지 8건은 접는다(SKILL `## Output Constraints` H4 — risk table은 상위 3개
expanded). 접힌 항목도 전부 실재하는 위험이고 완화가 붙어 있다 — 접은 것은 화면이지 내용이 아니다.

| Risk | Likelihood | Mitigation |
|---|---|---|
| `issue_id`가 정규화 claim이라 패러프레이즈에 뚫려 suppression이 거의 발화하지 않는다 | **High** | fuzzy matcher를 발명하지 않는다(잘못된 병합은 실재 결함을 지우는 방향으로 틀린다). `carryOver`의 `resolvedAbsent`·`newBlocking` 쌍으로 **패턴을 노출**하고(식별은 주장하지 않는다 — DD5), 커버리지 58이 그 실패 모드를 고정된 기대값으로 둔다. 값이 계속 크면 처방은 임계 완화가 아니라 리뷰어에게 안정 식별자를 요구하는 프롬프트 축(M3/P2) |
| M1이 실측한 "blocking 0건 라운드"가 M2에서도 재현되어 실경로 (B)가 미관측으로 남는다 | Low (probe 도입 후) | Task 7이 (B)를 조건부에서 **무조건부**로 바꿨다 — 통제할 수 없는 것은 리뷰어의 판단이지 리뷰 대상이 아니므로, scratch 워크트리에서 DD13 가드를 되돌린 종자 결함을 실제 리뷰어에게 보인다(합성 리뷰어 JSON 아님). 그래도 blocking이 안 나오면 milestone은 `complete`가 아니다 — Task 7과 Acceptance가 같은 문장을 쓴다 |
| `absorbed` suppression이 실패한 수정을 은폐한다 | Medium | `evidence` 실질성 검증 + `absorbed-rereported`를 Step 4가 터미널에 출력 + `reopened` 한 줄로 되돌림 + `MCCP_SANTA_LEDGER_SUPPRESSION=off` 대조군. **검증은 하지 않으며 그 한계를 DD8이 명시한다** |

<details><summary>+8 more</summary>

| Risk | Likelihood | Mitigation |
|---|---|---|
| coverage 게이트가 정상 루프를 막아 운영자가 env로 상시 끈다 | Medium | 탈출구를 env가 아니라 원장 안에 둔다 — `skipped` 한 행이면 라운드가 열리고 그 사건이 기록된다(DD3). stderr가 빠진 issue를 전부 열거해 판정 비용을 낮춘다 |
| `appendEntry`의 TOCTOU로 중복·경쟁 append | Low | fold last-wins + `duplicates` 계수(DD1). P0 동결 함수에 술어를 주입할 수 없으므로 막지 않고 흡수한다 |
| `blocking` 필드 의미 변경(raw → effective)이 하류를 깬다 | Low | entries 0건에서는 두 정의가 같은 배열이라 기존 소비자 무변경. 커버리지 33이 기존 7키의 값 동일성과 키 집합 9개를 고정하고, Step 4가 두 수를 나란히 출력한다 |
| `cmdVerdict`의 읽기 1회 전환이 `readReviewers`의 미개설 라운드 거부를 잃는다 | Low | `reviewersFrom(state, round, hint)`가 같은 `assertRoundOpened`를 부른다(P0가 이미 위임 형태로 분리해 두었다). 커버리지 46이 기존 7키 유지와 함께 고정 |
| 공유 표면(`santa-loop.md`·`cli.js`)에서 P2/P3 편집과 머지 충돌 | Medium | §3.5.1 — 커밋 직전 `git diff --diff-filter=D`로 반대편 신규 파일 삭제를 확인한다. 현재 P2·P3는 미착수라 창이 좁다 |
| suppression이 라운드를 끝내 리뷰 없이 push된다 (`niceBySuppression`) | Medium | DD13이 자기-suppression을 차단하므로 최소 한 라운드는 새로 돌아야 한다. 그 위에서 남는 경우는 "다음 라운드가 같은 지적만 냈다"이고, `niceBySuppression`이 참일 때 Step 4가 경고를 찍어 seal 이전에 운영자에게 도달한다. **자동 차단은 두지 않는다** — 그 상태는 M2가 의도한 수렴이기도 하므로, 차단하면 milestone이 자기 목적을 막는다 |
| 판정 lifecycle 3종이 CLI 수준 검사라 동시 호출에서 통과할 수 있다 (TOCTOU) | Low | P0 동결 함수에 술어를 lock 안으로 주입할 자리가 없다(DD14 말미). 실질 방어는 판정 계층의 `distinctIds >= 2`와 `seal.deriveVerdict`이고, 이 셋은 순차 오용을 막는 위생으로만 주장한다 |
| 판정이 gitignored 원장에 살아 워크트리와 함께 사라진다 | Medium | DD15 — 보존 주장의 범위를 "한 리뷰 루프 안에서"로 좁히고, 세션 간 내구성은 backlog로 남긴다. §3.8의 PR 후 worktree cleanup이 정확히 그 소실 경로이므로 문서로 예고한다 |

</details>

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes (커버리지 스크립트 성공 종료 — 상한은 커버리지 표에서 파생되고 각
      항목에 assert 1개 이상 + 동결 함수 무변경 + gate 6·adjudication 6 export 존재 + P0 파일
      무접촉)
- [ ] Patterns mirrored, not reinvented
- [ ] **(A) 실 경로 완주** — Task 7 Validate (a)~(d): `begin-round`가 coverage 선검사를 지나
      라운드를 열고, `verdict` stdout이 `suppressed`·`entries`·`ledger`·`carryOver`를 싣고,
      `.claude/reviews/santa-review-<slug>.md`가 산출되며, `mccp-santa-review` receipt의
      `meta.santa_entries`가 원장 `entries` 길이와 **일치**한다.
- [ ] **(B) 억제 경로 실 경로 관측** — Task 7 Validate (e)~(g): 종자 결함 probe에서 미판정
      blocking이 `begin-round`를 거부하고(캡 미소모), 판정 후 열리며, 다음 라운드의 같은
      claim이 `suppressed`에 담기고 `blocking`에서 빠진다. **조건절이 없다** — 이 항목이
      체크되지 않으면 milestone은 `complete`가 아니며 PRD Milestone 2 행을 `complete`로 바꾸지
      않는다. 그래도 관측되지 않으면 probe 각 라운드의 실측값을 PRD Open Questions에 남긴다.
      **합성 리뷰어 JSON으로 대체하지 않는다** — 종자는 리뷰 대상에 두고 리뷰어 출력은 실물을
      쓴다(Task 7).

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~44k.

M2에 실제로 닿는 상위 4건과 이 plan의 응답이다. 나머지는 M3 축(terminator·캡 이름 불일치)
이거나 P0 저장 계층의 성질이라 UI9·UI14대로 여기서 닫지 않는다. MEDIUM·LOW는 §3.14대로
backlog로 보내되, 같은 편집 자리를 지나는 두 건(evidence 표시폭 비대칭 · 원장 test 격리)은
흡수했다.

| Finding | 이 plan의 응답 |
|---|---|
| **[CRITICAL][explorer]** 공유 표면(`santa-loop.md`·`cli.js`)의 절 단위 편집 규율 · PR #110형 머지 삭제 | UI15 + Risks 6행 + Validation의 P0 무접촉 검사. `ledger.js`·`seal.js`·`counter.js`를 여는 순간 red |
| **[HIGH][architect]** `findings[]`가 gitignored 워킹트리에만 살아 P2/P3 데이터 의존이 미문서화 | **DD15 신설** — 같은 성질이 M2의 판정 행에도 적용된다. 보존 주장을 "한 리뷰 루프 안에서"로 좁히고 세션 간 내구성을 backlog로 명시 |
| **[HIGH][security]** `record --id A` 중복 등 판정 lifecycle 미구현 (P1 backlog) | **DD14 신설** — M1 DD8이 M2로 이관한 3종을 `cli.js`에서 닫는다. 앞 둘은 위생을 넘어 coverage 게이트의 전제다 |
| **[HIGH][test]** 기각 항목이 다음 blocking에서 실제로 빠지는지 검증할 negative 단언이 없다 | 커버리지 34·40·49 — 재등장 suppress · coverage 미요구 · **자기-suppression 차단**을 각각 고정 |

위 넷을 흡수하는 과정에서 fan-out이 직접 지목하지 않은 결함 하나가 드러났고 그것이 **DD13**이다:
suppression이 `issue_id`만 보면 같은 라운드에 판정을 기록하고 `verdict`를 다시 부르는 것만으로
리뷰 없이 NICE에 도달한다. 라운드 결속(`entry.round < N`)이 그 경로를 닫는다.

> **verbatim 계약의 명시 이탈 1건.** 아래 전문에서 파일명 뒤 `:N` 줄번호 6곳을 `(line N)`으로
> 바꿨다 — `plan-review/l1-check.js`의 `CITATION_RE`가 디렉토리 없는 basename 인용을
> 해결하지 못해 정상 plan을 `C6_UNRESOLVED_CITATION`으로 차단하기 때문이다(backlog
> 2026-08-16 MEDIUM이 같은 정규식의 dot-prefix 변종을 실측했고, 그 사이클도 `:56`을
> `(line 56)`으로 바꿔 우회했다). **주장 텍스트와 경로 문자열은 한 글자도 바뀌지 않았다.**

<details><summary>fan-out 전문 — findings 37 · meta-gaps 21 · patterns 25 (verbatim)</summary>
### Findings (severity-ranked)

- **[CRITICAL][explorer]** Shared files santa-loop.md and cli.js require per-PRD section editing discipline; PRD merge-drops test (CLAUDE.md §3.5.1) applies to M2/M3 PRD execution — ownership.md lines 38-40 lists shared surfaces; CLAUDE.md §3.5.1 documented real data loss in PR #110 where intervening PRD files were deleted during merge due to branch age
- **[HIGH][architect]** Ephemeral `findings[]` array creates undocumented data dependency for P2/P3 — severity axis lives only in working-tree state, not in receipt schema — PRD Scope lists `findings` as M1 entry in `.../cli.js#loadReviewer()` (envelope construction), but storage is gitignored original `.claude/state/santa-loop/<slug>.json`. Receipt holds only aggregated integers `meta.santa_rounds|entries|cap|exit_reason` (plugins/mccp/scripts/lib/santa/cli.js:366-389). P2 Scope references finding details (`lanes.js` blind review, `scope-always.js`), but no receipt field documents individual finding severity/scenario. docs/santa-loop/ownership.md:77-80 acknowledges this but does not specify P2/P3 recovery mechanism.
- **[HIGH][architect]** PRD M1 acceptance criteria partially unmet and deferred to Open Questions — design risk if deferral assumptions break — Milestone closure (santa-adjudication-m1.md (lines 12-99)) states acceptance 4 items (a)-(d): (a) FAIL+MEDIUM case unrealized, (b) `mismatches` surface never fired. Both deferred to PRD Open Question 3 citing 'structural suppression' (upstream prompt preventing scenario) and 'seal.js FINAL ALL-PASS requirement' (second cause already fixed in parallel). M1 marked `done` with partial acceptance. If P2/P3 rely on these observables being true in production, they will find the implementation incomplete.
- **[HIGH][security]** Dual-review bypass vulnerability: same reviewer ID can be recorded twice, circumventing the intended {A,B} quorum requirement — ledger.js:479-482 explicitly documents: '판정 lifecycle 검사는 넣지 않는다 — `{A,B}` 완전성 · `id` 중복...' Marked as P1 backlog. PRD 'Acceptance' section notes missing lifecycle validation.
- **[HIGH][test]** M2 judgment ledger lacks Oracle+Negative assertion pattern — no test will verify that rejected findings actually stay absent from pending blocks — PRD §Scope 'judgment ledger' + 'rejected items not recounted' metric; M1 test patterns show 'negative assertions are unusual and need separate items' (santa-adjudication.test.js:23 item 23); no M2 plan exists yet to validate ledger entry retention
- **[HIGH][test]** Terminator logic (M3 'targets: round_N_patch' detection) has no designed seam for testing; git-diff coupling makes oracle testing impossible without fixture — PRD Scope §(4) 'patch-chasing terminator' requires diffing previous round against current — will need CLI/fixture tests like M1 san-ta-loop-cap.test.js pattern, but no fixture template defined yet; no oracle can run pure without invoking git
- **[HIGH][explorer]** ownership.md table (9 paths, 0 intersection) is normative for merge safety; any M2/M3 plan that creates files outside table triggers validation failure per line 29 — docs/santa-loop/ownership.md:27-29 states 'M2 plan의 Validation 5번 스크립트가 이 표를 파싱해 P1·P2·P3 경로 집합의 교집합이 비었는지 확인하고, 비지 않으면 비영점으로 종료'
- **[HIGH][explorer]** ledger.read() has no internal lock; seal.js:10-17 (DD1) enforces single-read-per-seal to prevent mutation-race corruption of audit anchor — seal.js:11-14 'N+2회 읽게 되고 읽기에는 lock이 없다... 동시에 존재한 적 없는 조합이 되어, 감사 앵커가 실재하지 않은 상태를 영구 봉인'
- **[MEDIUM][architect]** Deduplication logic tightly coupled in gate module — P2/P3 will face coupling if they need to apply or extend blocking-claim deduplication — Deduplication happens in `analyzeReviewers()` via `blockingByClaim` Map using `normalizeClaim()` (plugins/mccp/scripts/lib/santa/gate.js:212-214, 260-300). If P2 lanes need per-lane deduplication or P3 delta-scope needs to reduplicate across rounds, they either duplicate the logic or import from gate.js, which is pure logic not strictly belonging to gate's verdict role. No shared utility module exists (intentionally, per DD3a boundary doctrine, but creates hidden coupling).
- **[MEDIUM][architect]** Contract field semantics is binary and won't scale if P2/P3 need nuanced completeness states — `contract` is defined as `contractFull ? 'full' : 'partial'` in `analyzeReviewers()` (gate.js:262-285). The AND rule means one unstructured finding makes the whole round `partial`. If P2 (blind lanes) needs 'structured-for-lane-A' and P3 (delta-scope) needs 'structured-for-diff' as separate states, the boolean cannot represent both dimensions. Ownership.md (line 44) acknowledges P1 closure is partial (2 of 4 acceptance items unmet); reopening P1 to add field types is cheaper than P2/P3 compensating.
- **[MEDIUM][architect]** Independent `distinctIds` counting in `gate.js` and `seal.js` enforced by test assertion only — no structural barrier to drift — Plan DD8 (santa-adjudication-m1.plan.md (lines 347-390)) explicitly acknowledges two modules count `distinctIds` separately and justifies NOT merging via ownership boundary (seal.js is P0). Test assertion (santa-adjudication.test.js) catches divergence but not synchronized bugs (both modules flip the rule the same wrong way). coverage item 25 (`gate.decideAdjudicatedVerdict` verdict == `seal.deriveVerdict` verdict) is the only insurance. If P2/P3 reuse gate logic without sealing (P0 boundary), distinctIds synchronization becomes harder to verify.
- **[MEDIUM][architect]** Ownership boundary in ownership.md enforced by document convention only — no automated check that P2/P3 don't add undeclared files — ownership.md (lines 10-29) enumerates 9 file paths under P1/P2/P3 ownership with claim '교집합은 ∅다' (intersection is empty). Validation script mentioned (line 28-29) exists in M2 plan but not visible in current codebase. If P2/P3 discover they need a file not in the table, they must escalate to P0 or violate the contract. No pre-commit hook prevents undeclared files from being shipped.
- **[MEDIUM][security]** Race condition window in lock acquisition: MCCP_EVIDENCE_CONFLICT_GUARD=off can bypass mutations without lock, allowing lost-update in begin-round cap enforcement — ledger.js:372-375 'if lock is not enforced, two simultaneous begin-round calls could both pass, and both reviewers would run but only one round would be counted, leading to fail-open of the cap.' Mitigated by hardcoding mode:'enforce' on line 382, but design reflects known risk.
- **[MEDIUM][security]** File mode permission enforcement gap on Windows: state file stored at mode 0o600 but POSIX permissions are 'practically ineffective' on Windows platform — ledger.js:248 'if (IS_WINDOWS) return;' comment at line 248-249 acknowledges POSIX mode is 'sự thực上 무력' on Windows. State file contains sensitive reviewer raw data with checks/suggestions.
- **[MEDIUM][security]** Input validation for failure_scenario allows wide field lengths (up to 2000 chars) without semantic validation of claimed failure scenarios — cli.js:64 defines MAX_FAILURE_SCENARIO_CHARS=2000. gate.js:194-196 validates only form (length, word count, filler) not semantic accuracy. PRD notes: '품질은 보지 않는다(DD5). 그럴듯한 거짓 시나리오는 이 검사를 통과하며'
- **[MEDIUM][security]** No path injection validation on reviewer-file argument; relies only on assertContained post-hoc verification which requires file to exist and realpath successfully — cli.js:259-267: loadReviewer reads arbitrary --reviewer-file path with only post-hoc assertContained check after realpath. If symlink target is outside repo during realpath, error occurs but after file read attempt. No pre-validation of path format.
- **[MEDIUM][test]** M2 acceptance criterion 'basic fact about rejection' (PRD Evidence 20: 'resolution.rejected total 0') is unmeasurable — no verdict enum value representing rejection exists yet — PRD Evidence §18-20 shows `receipt 149건...resolution.rejected 총합 0` proving the gap; M1 plan never introduces 'rejected' verdict (only PASS/FAIL at step 3); M2 must define it before writing tests
- **[MEDIUM][test]** State isolation boundary undefined for round-spanning tests — unclear whether test harness should keep gitignored ledger across rounds or reset per-test — M1 fixtures make tmpdir per test (completion-ledger.test.js (line 15) tmpRepo per test); M2/M3 must store state in `.claude/state/santa-loop/<slug>.json` across rounds; no documented cleanup contract for multi-round test scenarios
- **[MEDIUM][test]** Cross-gate dedupe validation will require sealed comparison (M1's lesson: decideAdjudicatedVerdict vs seal.deriveVerdict must stay synchronized) — but M2/M3 will multiply the surfaces needing sync checks — M1 test item 25 (santa-adjudication.test.js coverage) required comparing two independent code paths' verdicts; M2 adds ledger + terminator = at least 3 distinct decision surfaces now; no test pattern defined for detecting divergence between them
- **[MEDIUM][test]** 'Absorption' and 'rejection' as judgment states have no test-friendly oracle — acceptance will depend on behavioral observation (does round stop) rather than typed verdict — PRD Success Metric 'rejection preserved rate 100%' and 'recount of rejected 0' are end-to-end measures; no unit oracle in M1 validates judgment state transitions; M2 will need `classifyJudgment(verdict, reason) → {absorbed:bool, rejected:bool}` or similar pure function
- **[MEDIUM][test]** No test for ledger idempotency under concurrent append — completion-ledger.test.js exercises single append only; M2 must validate repeated `record` of same reviewer ID doesn't duplicate ledger entries — santa-adjudication PRD describes 'append' happening per round, but M1's `record` CLI command has no idempotency test (single invocation per test); M2 must ensure `record --id A --round 1` twice yields ledger.entries length 1 not 2
- **[MEDIUM][explorer]** M2 adjudication.js does not exist, but ledger.js#appendEntry signature is already frozen by P0 and awaits schema definition for entry rows — plugins/mccp/scripts/lib/santa/ledger.js:518-522 defines appendEntry with comment 'P1 소유 자리 — finding row 스키마는 P1이 정의'; ownership.md line 18 shows P1 owns 'adjudication.js (신규) 판정 원장'
- **[MEDIUM][explorer]** M3 terminator.js does not exist; oracle should mirror counter.js pattern (env parser + pure oracle) to avoid coupling environment to decision logic — plugins/mccp/scripts/lib/santa/counter.js:31-42 shows pattern: parseCap() + decideRound() separation; ownership.md line 19 owns terminator.js for 'patch-chasing terminator'; M1 plan comment at gate.js:12 notes 'patch-chasing terminator를 여기에 미리 넣지 않는다'
- **[MEDIUM][explorer]** Test coverage mapping is load-bearing: santa-adjudication.test.js owns all M1 IDs [1..25] per test name brackets; M2/M3 must own new test files not reuse M1 paths — plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:1-11 states 'test 이름의 대괄호 id는 plan `.claude/plans/santa-adjudication-m1.plan.md`의 커버리지 표와 1:1'; closure confirms '항목 21·25 포함' green
- **[MEDIUM][explorer]** CLI exit code 75 (tempfail) is already in use for ledger lock contention; M2/M3 cannot add new codes (no generic channels available) — ownership.md line 109 'EX_TEMPFAIL' reserved for 'lock 경합'; cli.js must map all M2/M3 errors to existing codes (0,2,12,75)
- **[LOW][architect]** Legacy envelope reconstruction is one-way — old findings irreversibly downgraded to `structured: false`, blocking re-evaluation under new rules — `findingsOf()` (gate.js:222-234) reconstructs `criticalIssues` string array as `{…structured: false}`. Once marked unstructured, no code path upgrades it. If operational severity rule (CLAUDE.md §3.14) changes from CRITICAL+HIGH to CRITICAL-only, or if future PR adds support for `suggestions` as lighter findings, old rounds' findings remain frozen at `structured:false`. Lossy one-way migration blocks retroactive re-evaluation.
- **[LOW][architect]** Width normalization workaround only applies to `failureScenario` — creates inconsistent text field handling — `widthNormalized()` (gate.js:120-126) duplicates CJK codepoints to compensate for character-count based validation in `validateReason()`. Applied only when checking `failureScenario` (line 196), but `evidence` field (max 500 chars) uses the same `validateReason` import in cli.js without normalization (cli.js:232-234). Asymmetry means a 300-char Korean failure scenario and a 300-char Korean evidence will be validated at different effective lengths.
- **[LOW][architect]** Character limit constants duplicated between cli.js and implicit gate.js rules — update risk if limits change — cli.js defines and exports MAX_CLAIM_CHARS=500, MAX_FAILURE_SCENARIO_CHARS=2000, MAX_EVIDENCE_CHARS=500 (cli.js:63-65). gate.js has no corresponding constants and does not import them. Plan comment (santa-adjudication-m1.plan.md:DD4) notes limits but does not enforce single-source-of-truth. If M2 needs to tighten limits, changes scattered across two modules with no shared constant.
- **[LOW][architect]** Blocking severity threshold hardcoded without operational override — if CLAUDE.md §3.14 changes, code change required — BLOCKING_SEVERITIES = ['CRITICAL', 'HIGH'] (gate.js:85) is hardcoded. CLAUDE.md §3.14 states 'CRITICAL·HIGH only … this section removes itself when quorum.js bare-verdict is fixed' — indicating the rule is temporary and future-proof for change. No env or config lever exists; code change is only path. If rule escalates or adds MEDIUM, gate.js:188 and cli.js:68 both need updates with no shared toggle.
- **[LOW][security]** Prototype pollution defense present but not uniformly applied: nested object validation occurs at entry point but legacy code paths may bypass check — cli.js:53-56 forbids __proto__, constructor, prototype as own properties. However, nested objects in arrays undergo only depth-limit check (line 148-171), not forbidden-key check recursively on all nested objects.
- **[LOW][security]** No test coverage visible for concurrent mutation attempts on same ledger slug; lock enforcement relies on evidence-lock module not locally tested — santa-adjudication.test.js test names and scope indicate single-threaded CLI testing. No test fixture shows two concurrent recordReviewer or beginRound calls. ledger.js:351-386 mutation logic relies on guardedReadModifyWrite but no concurrency test in scope.
- **[LOW][security]** Raw reviewer data (checks/suggestions fields) persisted in .claude/state/santa-loop/ leverages gitignore for protection but chmod window exists between tmp write and permission enforcement — ledger.js:242-245: 'tmp를 mode 인자 **없이** 만들고 rename하므로...umask 기본값...창은 두 단계로 좁힌다' Documents window where unencrypted state file may have world-readable mode before chmod.
- **[LOW][test]** Plan-to-ledger schema bridge untested — no validation that plan's `## Delivery Milestones` table structure (status column) can be read back from ledger entries deterministically — M1 plan owns ledger.readEntries, store; M2 owns 'record status changes'; no test yet validates round-trip: plan → ledger append → milestone status derived = original status
- **[LOW][test]** 'Targets' field design (M3 patch-chasing) lacks validation of partial round recovery — unclear if test must prove that a round interrupted mid-targets-computation doesn't corrupt state — M3 PRD scope references 'targets.round_N_patch' but no test pattern sketched; similar durability tests exist for ledger (completion-ledger.test.js 'git-safe happy path' writes atomically) but M3 adds delta-detection layer with no seam visible for unit test
- **[LOW][explorer]** seal.js already handles M2 receipt writing pipeline; adjudication.js must integrate via seal's calling code path (cli.js), not bypass it — plugins/mccp/scripts/lib/santa/seal.js:3 labeled 'santa-loop-materialize M2 — 봉인(seal)'; cli.js:399 comment '신규 exit code는 만들지 않는다: seal이 던지는'
- **[LOW][explorer]** M1 closure open-question 1 (line 74): failure_scenario judgment in scope M1 only; M2 must NOT re-examine M1's classifyFinding logic — PRD line 72 'DD5: 집계 단계가 검사한다... 기계적으로 검사하는지' answered in closure at milestone-closures/santa-adjudication-m1.md noting 'M1은 캡을 건드리지 않으므로 발현하지 않지만, M3 착수 시 PRD를 정정할지 코드를 정정할지'
- **[LOW][explorer]** Version bump for M2 must be patch (1.26.3) per CLAUDE.md §3.7: single-milestone ship = patch axis; M1 consumed patch from a shared 1.26.1 (gate-guard-integrity M3 also used it) — plugin.json (line 5) version '1.26.2'; PRD line 73 open-question notes name mismatch 'MCCP_SANTA_MAX_ROUNDS vs MCCP_SANTA_ROUND_CAP (1~10)' is M3 ownership, not M2

### Meta-gaps

- No specified data recovery mechanism if worktree with gitignored `findings[]` state is lost before M2 judgment ledger captures it  _(architect)_
- No documented scale limits for blocking deduplication (Map size, claim string lengths, finding counts per reviewer)  _(architect)_
- No boundary specification between what must be in receipt (git-tracked audit trail) vs. what can be in working-tree state; M2/M3 visibility into M1 data not defined  _(architect)_
- No specified upgrade path for legacy envelopes (pre-M1 `critical_issues` strings) if operational rules change after storage  _(architect)_
- Missing rationale for why `findings` array does not flow into receipt schema if it is essential for P2/P3 functioning  _(architect)_
- Plan does not address P1 backlog item (dual-review bypass via record --id A twice) which gate.js/cli.js acknowledge as open  _(security)_
- No specification of how judgment/verdict data escapes from raw ledger to receipt without leaking reviewer model outputs (checks/suggestions)  _(security)_
- Missing security test matrix for adversarial reviewer JSON inputs (oversized nested objects, homoglyph claim text, prototype pollution variants)  _(security)_
- No mitigation strategy for Windows POSIX mode ineffectiveness; state file containing raw data relies on OS-level ACL which may not exist  _(security)_
- Path containment validation happens post-hoc on existing paths; no pre-validation grammar for --reviewer-file argument format  _(security)_
- M2 plan must define what verdict enum value represents 'rejected judgment' and provide oracle test for state transitions (accept/absorb/reject/skip combinations)  _(test)_
- M3 plan must sketch terminator logic as testable pure function: `canTerminate(allBlockingFindings, diffTargets) → {shouldStop:bool, reason:string}` before implementation; git-coupling will require fixture tests  _(test)_
- All three milestones need documented test-isolation contract for gitignored ledger files — should per-test cleanup reset state, or reuse slugs?  _(test)_
- M2 acceptance must include negative assertion test (rejected finding does NOT resurface in next round's blocking count), mirroring M1 item 23 pattern  _(test)_
- Define oracle function for ledger entry synthesis: `assembleEntry(receipt, plan, verdict) → entry` suitable for pure unit test before M2 CLI integration test  _(test)_
- M2/M3 must spec deterministic round-trip validation: plan diff → ledger append → derived status == original, end-to-end in fixture  _(test)_
- M2 and M3 plans do not exist; PRD is requirements-only. No plan document to inspect for reuse gaps.  _(explorer)_
- adjudication.js schema for entries rows undefined — M2 plan must specify {round, issue, judgment, reason} structure before implementation  _(explorer)_
- terminator.js decision logic undefined — M2/M3 plans must specify patch-chasing heuristic (e.g., 'same files targeted by all remaining blocking findings as round N-1 diff')  _(explorer)_
- Integration point between adjudication and seal unknown — will entries be written via ledger.appendEntry directly or via seal context?  _(explorer)_
- No evidence of M2/M3 considering counter.js env-parser reuse pattern for terminator; may duplicate parseCap logic  _(explorer)_

### Patterns to mirror

- Pure oracle + env parser separation (plugins/mccp/scripts/lib/santa/counter.js:31, :50 — `parseCap(env)` parses, `decideRound({cap})` judges)  _(architect)_
- Binary contract completeness model without thresholds (CLAUDE.md §3.13.1 intent_reviewer_contract — 'full' or 'inconclusive', not percentages)  _(architect)_
- Test assertion as structural enforcement for drift detection across module boundaries (santa-adjudication.test.js coverage item 25 — two independent distinctIds counts must match)  _(architect)_
- Additive schema migrations with fallback reconstruction for missing fields (gate.js findingsOf legacy handling)  _(architect)_
- Language-aware text validation with explicit character normalization for CJK (gate.js widthNormalized applied to validateReason inputs)  _(architect)_
- path-containment.js:assertContained — dual-layer defense (realpath anchor + receipts-root check); mirror for reviewer-file path validation  _(security)_
- cli.js:assertSafeGraph — recursive depth/breadth limits on untrusted JSON; apply to nested finding objects in legacy criticalIssues  _(security)_
- ledger.js:mutate + guardedReadModifyWrite — atomic read-modify-write with enforced lock mode; reuse for decision lifecycle checks (prevent id duplication)  _(security)_
- gate.js:classifyFinding — structured-vs-blocking separation; finding field validation occurs twice (cli.js#loadReviewer type/length, gate.js#classifyFinding enum). Keep boundary.  _(security)_
- cli.js:MAX_* constants pattern — define upper bounds early; extend to claim deduplication (normalized claim collision budget) and reviewer count per round  _(security)_
- M1 test layout: single file (santa-adjudication.test.js), coverage IDs [N] in test name, machine-verified contract  _(test)_
- Pure oracle + env-parser separation: `gate.parseSeverityGate(env)` + `gate.classifyFinding(finding)` — M2 should offer `ledger.classifyJudgment(verdict, reason)` and parser for env  _(test)_
- Negative assertion pattern (M1 item 23): test absence not presence — `assert(!entry.findings)` proves receipt doesn't leak ledger data  _(test)_
- Document-as-test: M1 item 14/20 read santa-loop.md with fs.readFileSync to assert prompt text survives — M2 milestone table status values should be single-sourced this way  _(test)_
- Fixture repo with git init: tmpdir+execFileSync('git init') for CLI tests (santa-loop-cap.test.js:38 pattern) — M2 ledger append needs same for state persistence validation  _(test)_
- Idempotency assertion: calling CLI command twice with same inputs yields same ledger state (length, hash, entries) — template in completion-ledger.test.js not yet extended to multi-call scenarios  _(test)_
- Cross-layer sync test: feed same input to two independent functions (gate oracle + seal function in M1 item 25), assert verdict output matches; M2 must do: ledger + terminator oracle  _(test)_
- Exit code semantics test: begin-round exit 12 (cap reached) + Step 3.2 seal call must be present mechanically (santa-loop.md L79 loads 'exit code and seal must coexist') — M3 terminator exit codes need same audit  _(test)_
- plugins/mccp/scripts/lib/santa/counter.js:31-42 — env parser isolation (parseCap separate from decideRound) for pure oracle pattern  _(explorer)_
- plugins/mccp/scripts/lib/santa/gate.js:128-149 — env parser with fail-open loud warning and schema constants (ENV_SEVERITY_GATE, SEVERITY_GATE_DEFAULT, SEVERITY_GATE_VALUES)  _(explorer)_
- plugins/mccp/scripts/lib/santa/gate.js:175-207 — classifyFinding pure function returning {structured, blocking, severity, reason} for multi-axis judgment  _(explorer)_
- plugins/mccp/scripts/lib/santa/ledger.js:68-92 — deriveSantaDecisionId with 3-tier fallback (explicit → branch-derived → default) and slug validation  _(explorer)_
- plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:1-11 — test ID mapping via bracket notation [N] synchronized with plan coverage table  _(explorer)_
- plugins/mccp/scripts/lib/santa/seal.js:70-88 — project() function for raw-safe projection before receipt write (UI4 double defense)  _(explorer)_
- docs/santa-loop/ownership.md:31-36 — shared surface coordination protocol requiring per-PRD section editing and merge-drop testing  _(explorer)_

</details>

## Design Critique

- rounds: 2 (R0 → 흡수 → R1)
- verdict: `CONVERGED` (cap 2)
- R0 HIGH — H4(한 화면 항목 수 상한) 위반: `## Risks`가 11행 전부 펼쳐져 있었다. 흡수: 상위
  3건(High 2 + 영향 Critical 1)만 펼치고 나머지 8건을 `<details>`로 접었다. **내용은 한 줄도
  줄이지 않았다** — 완화가 붙은 위험은 전부 남아 있고 접힌 것은 화면이다. fan-out 전문
  (findings 37 · meta-gaps 21 · patterns 25)은 주입 시점에 이미 접혀 있었다.
- R0 MEDIUM (**기각 — 증거 첨부**): 나머지 큰 표 셋(`## User Intent` 16행 ·
  `## Files to Change` 10행 · 커버리지 계약 30행)은 접지 않는다. 셋 다 **기계가 파싱하는
  계약 표**다 — `## User Intent`는 intent 게이트가 `Constraint` 열만 읽고,
  `## Files to Change`는 `dedupe.js`의 planned matcher와 `plan-conflict-detector.js`가 첫 열을
  읽으며(backlog 2026-08-17 HIGH가 그 파서의 백틱 취약성을 실측했다), 커버리지 표는 Validation
  스크립트가 `[N]` id를 전수 대조한다. `<details>` 래퍼를 씌우면 화면은 조용해지는 대신 그
  파서들이 읽는 표면이 바뀐다 — H4가 막으려는 것은 인지 부하이지 기계 계약이 아니다.
  §3.14대로 backlog에 남긴다.
- H1(heading depth ≤ 3) 통과 — 코드 펜스 밖 `####` 이상 0건(기계 확인). H2(강조색)·H3(raw
  marker)는 이 산출물에 렌더 표면이 없어 해당 없음.
- **R2 흡수 후 재확인 — verdict 무변경.** 흡수가 더한 표면은 DD5의 3행 표 하나와 커버리지
  3행(56~58), 그리고 `### R2` 절이다. H1은 다시 기계 확인해 0건이고, H4는 커버리지 표가 이미
  위 R0 MEDIUM에서 **기계 파싱 계약 표**로 면제 근거를 받았으므로 3행 증가가 판정을 바꾸지
  않는다(`## Risks`는 행 수 무변경 — 상위 3 + `<details>` 8 구조 유지). 즉 critique를 다시
  돌릴 트리거가 없고, 돌리지 않았다는 사실을 여기 적는다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤
impeccable 명령도 **호출하지 않는다** — 아래는 구현자용 체크리스트다. 이 milestone은
CLI·JSON 표면만 만들고 렌더 표면을 만들지 않으므로(`renderingSurface=0`), implement
단계에서도 refine·discovery 행은 recommend로 강등될 것이다.

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
