# santa-loop 모듈 소유권

santa-loop은 P0(`santa-loop-materialize`)가 기반을 놓고 자식 PRD 셋이 그 위에서 **병렬로**
착수한다. 이 문서는 그 셋이 같은 파일을 놓고 충돌하지 않도록 소유 경계를 확정하고,
P0가 동결한 함수 시그니처를 계약으로 고정한다.

세 PRD는 `.claude/prds/`의 `santa-adjudication`(P1) · `santa-evidence-diversity`(P2) ·
`santa-delta-review`(P3)다.

## 소유권 표

각 행은 **파일 1개**다 — 경로를 전수 열거해야 교집합이 ∅임을 표 자체로 읽을 수 있다.
`(신규)`는 해당 PRD가 만들 파일이고, 나머지는 이미 존재하는 파일이다.

| Owner | File | 근거 (자식 PRD Scope) |
|---|---|---|
| P1 | `plugins/mccp/scripts/lib/santa/gate.js` | 게이트를 verdict 문자열이 아니라 병합·중복제거된 blocking 건수로 재배선 — santa-adjudication PRD Scope MVP (2) |
| P1 | `plugins/mccp/scripts/lib/santa/adjudication.js` | (신규) 판정 원장 `round \| issue \| ABSORBED(proof) \| REJECTED(reason)` 을 집계 단계에 주입 — 같은 Scope MVP (3) |
| P1 | `plugins/mccp/scripts/lib/santa/terminator.js` | (신규) patch-chasing terminator. 라운드 2 이후 살아남은 blocking이 전부 `targets: round_N_patch`면 종료 — 같은 Scope MVP (4) |
| P1 | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | (신규) 위 셋의 회귀 test |
| P2 | `plugins/mccp/scripts/lib/santa/lanes.js` | (신규) 블라인드 레인 — Reviewer A 인스턴스 1명에게 파일 번들·사전 요약 대신 루트 + 경로 포인터만 전달 — santa-evidence-diversity PRD Scope MVP (1) |
| P2 | `plugins/mccp/scripts/lib/santa/scope-always.js` | (신규) 상시 스코프. diff 무관하게 **현재 decision의 plan + 그 plan이 선언한 Source PRD**를 changed-files에 포함 — 같은 Scope MVP (2). M2 DD1이 Scope 문언의 4개 글롭(이 저장소 실측 7 MB)을 이 폐포(실측 약 70 KB)로 좁혔고 PRD 본문도 같은 PR에서 정정했다(프로토콜 4) |
| P2 | `plugins/mccp/scripts/lib/santa/model-diversity.js` | (신규) 모델 계열 다양성 oracle. 원장의 리뷰어 `model` 문자열에서 계열을 분류해 봉인 층이 `converged`를 `degraded`로 좁힐 근거를 낸다 — 같은 Scope MVP (3). 리뷰어 수는 늘지 않는다(I5) |
| P2 | `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | (신규) 레인 분기 + 상시 스코프 + degrade 강등 회귀 test |
| P3 | `plugins/mccp/scripts/lib/santa/delta-scope.js` | (신규) 라운드 2 이후 리뷰 스코프를 직전 라운드 diff의 hunk 범위로 좁히는 계산 — santa-delta-review PRD Scope MVP |
| P3 | `plugins/mccp/scripts/lib/tests/santa-delta-scope.test.js` | (신규) 델타 범위 계산 + 인식론적 단언 금지 회귀 test |

교집합은 ∅다. 위 10개 경로에 중복이 없다는 것이 그 주장의 전부이고, 기계적으로 검증
가능하다 — M2 plan의 Validation 5번 스크립트가 이 표를 파싱해 P1·P2·P3 경로 집합의
교집합이 비었는지 확인하고, 비지 않으면 비영점으로 종료한다.

### 공유 표면 — 누구도 단독 소유하지 않는다

아래는 세 PRD가 **모두** 손대야 하는 파일이라 소유권 표에서 의도적으로 제외했다.
∅ 주장을 지키려고 아무에게나 배정하면 그 배정이 거짓이 된다. 이 파일들은 §변경
프로토콜의 조정 대상이다.

| File | 왜 공유인가 |
|---|---|
| `plugins/mccp/commands/santa-loop.md` | 명령 본문. P1은 severity 계약을 리뷰어 프롬프트에 넣고, P2는 레인을 분기하고, P3는 범위 지정 문구를 넣는다 — 셋 다 이 파일이다 |
| `plugins/mccp/scripts/lib/santa/cli.js` | subcommand facade. 각 PRD가 자기 진입점을 추가한다 |

## M1 동결 시그니처

P1·P2·P3가 전제로 삼는 계약이다. 아래 시그니처는 P0 소유이고 자식 PRD가 바꾸지 않는다.

| 함수 | 시그니처 | 계약 |
|---|---|---|
| `counter.decideRound` | `(opts) -> {allowed, roundIndex, exitReason}` | `opts.cap`이 정수이고 `>= MIN_CAP`이 아니면 `DEFAULT_CAP`. 순수 함수 — 디스크 미접촉 |
| `gate.decideVerdict` | `({reviewers, round, cap}) -> {verdict, failing, exitReason}` | `verdict`는 `'NICE' \| 'NAUGHTY'`. 전원 PASS만 NICE이고, envelope 0건은 NAUGHTY다(도달 불가가 아니라 살아 있는 규칙) |
| `ledger.beginRound` | `(opts)` | mutation. 라운드를 열고 `state.cap`에 그 시점 cap을 **저장**한다. 열린 라운드가 있으면 멱등 반환(캡 미소모) |
| `ledger.recordReviewer` | `(round, envelope, raw, opts)` | mutation. `{envelope, raw}`로 저장한다 — `raw`는 P1의 severity 축 입력이므로 파기하지 않는다 |
| `ledger.recordVerdict` | `(round, verdict, opts)` | mutation. 라운드를 FINAL로 전이. 완전성·중복·재판정 검사는 **P1 소유**라 여기 없다 |
| `ledger.appendEntry` | `(entry, opts)` | mutation. `entries`는 P1 소유이고 P0는 배열을 만들기만 한다 |
| `ledger.aggregate` | `(opts) -> {rounds, entries, exitReason}` | 집계값만. `opts.cap`이 정수가 아니면 env(`MCCP_SANTA_ROUND_CAP`)로 폴백한다 — 다만 `exitReason`은 더 이상 cap에서 파생되지 않으므로(아래 `aggregateFrom`) 그 폴백은 현재 어떤 반환값에도 닿지 않는다. 시그니처는 동결이라 유지 |
| `ledger.readReviewers` | `(round, opts) -> envelope[]` | `raw`를 반환하지 않는다. 이것이 UI4(리뷰어 본문 비유출)의 모듈 경계다 |

M2가 추가한 순수 파생 2종도 같은 계약에 포함된다. 둘 다 **이미 읽은 state**에서 파생하며,
위 두 함수가 이들에 위임하므로 기존 동작은 무변경이다.

| 함수 | 시그니처 | 왜 필요한가 |
|---|---|---|
| `ledger.reviewersFrom` | `(state, round, statePathHint) -> envelope[]` | 여러 값을 함께 봐야 하는 소비자가 라운드마다 재읽기를 하면 원장을 N+2회 읽게 되고 읽기에는 lock이 없다 — 그 사이 mutation이 끼면 동시에 존재한 적 없는 조합이 봉인된다 |
| `ledger.aggregateFrom` | `(state, cap) -> {rounds, entries, exitReason}` | 같은 이유. `exitReason`은 `beginRound`가 거부 시점에 남긴 `state.terminated` 마커에서만 나오되, **현재 라운드 수에 결속된**(`terminated.rounds === rounds.length`) 마커만 유효하다 — `rounds.length >= cap` 산술은 캡 *도달*과 *거부*를 뭉갰고(PR-Codex F1), 결속 없는 마커는 그 오봉인을 "언젠가 거부가 있었다"는 영구 낙인으로 재현한다(code-review H1). 그래서 `cap`은 동결 시그니처를 지키기 위한 **잔존 인자**이고 파생에 쓰이지 않는다. 제거는 인터페이스 변경이라 UI7대로 P0 재개 사안 |

P1(santa-adjudication M1)이 추가한 순수 export 4종은 **추가 기록**이지 변경 기록이 아니다
(프로토콜 4). 위 `gate.decideVerdict` 행의 시그니처·반환·계약 문언은 **한 글자도 바뀌지
않았고**, 그 함수는 아래 `decideAdjudicatedVerdict`가 완화 자격을 얻지 못했을 때의 **위임
대상**으로 계속 산다 — 즉 프로토콜 2가 허용하는 형태 그대로다.

| 함수 | 시그니처 | 왜 필요한가 |
|---|---|---|
| `gate.decideAdjudicatedVerdict` | `({reviewers, round, cap, severityGate}) -> {verdict, failing, exitReason, blocking, mismatches, contract, byReviewer}` | 판정 입력을 리뷰어의 `verdict` 문자열에서 **병합·중복제거된 blocking 건수**로 옮긴다. `noBlocking ∧ bothIds ∧ allPass`의 AND이고, 완화(`severityGate='enforce'` ∧ `contract='full'`)가 면제하는 것은 `allPass` 한 항뿐이다. 나머지 둘은 어느 값에서도 적용된다. `byReviewer`는 판정에 쓰이지 않는 계측 표면이지만 반환에 싣는다 — 강등 이력의 분모(PRD Open Question)라 재고도 버리면 재지 않은 것과 같다 |
| `gate.analyzeReviewers` | `(reviewers) -> {contract, blocking, byReviewer, distinctIds, mismatches}` | 계측·보고 재료. 전역 함수(어떤 입력에도 던지지 않는다)이고 `contract` 파생의 **단일 주체**다. `findings` 부재 legacy envelope는 여기서 `structured:false`로 흡수된다 |
| `gate.classifyFinding` | `(finding) -> {structured, blocking, severity, reason}` | blocking 자격을 정하는 **유일한 자리**. `structured ∧ severity ∈ {CRITICAL, HIGH} ∧ 실질 failureScenario`이며 실질성은 `force-override-reason#validateReason`(strict + allowCodeVocabulary)에 위임한다 |
| `gate.parseSeverityGate` | `(env) -> 'enforce' \| 'off'` | env 파서. 불량값은 loud warn 후 `enforce`. 판정 함수는 env를 모르고 파서만 안다(`counter.parseCap` 동형) |

P1(santa-adjudication **M2**)이 더한 것도 같은 성격의 **추가 기록**이다(프로토콜 4). 위
`gate.decideVerdict` 행은 여전히 무변경이고, `decideAdjudicatedVerdict`에 대한 변경은
**optional 인자 추가 + 반환 필드 추가**라 기존 호출자가 관측하는 동작이 불변이다 —
`resolved`가 부재하거나 비면 M1의 7키가 값까지 동일하다.

| 함수 | 시그니처 | 왜 필요한가 |
|---|---|---|
| `gate.decideAdjudicatedVerdict` | `({reviewers, round, cap, severityGate, resolved?}) -> {… M1 7키 …, suppressed, niceBySuppression}` | `resolved: Map<issue_id, entry[]> \| null`. 종결된 지적의 재등장을 `blocking`에서 빼고 `suppressed[]`로 옮긴다. **좁아지는 것은 `noBlocking` 한 항뿐**이고 강화 축 둘(`distinctIds >= 2` · `allPass`)은 어느 값에서도 그대로다. `round`가 M1까지 "받되 쓰지 않는" 파라미터였던 자리가 여기서 처음 쓰인다 — 억제는 `entry.round < N`인 이력만 보므로 라운드 자신의 판정은 자기 자신을 지우지 못한다 |
| `gate.issueIdOf` | `(claim) -> string(12 hex)` | 라운드 *사이*의 issue 동일성. `normalizeClaim`을 **재사용**하는 것이 요점이다 — 라운드 안의 병합과 다른 규칙을 쓰면 "한 라운드에서는 같은 지적인데 다음 라운드에서는 다른 지적"이 성립한다. 비문자열은 빈 claim으로 정규화하고 던지지 않는다 |
| `gate.widthNormalized` | `(text) -> string` | M1이 내부에 두었던 표시폭 투영의 export. `adjudication.buildEntry`가 `evidence` 실질성 검사에 **같은 투영**을 먹인다 — 하한이 두 곳에서 다르게 걸리면 "blocking으로 인정된 시나리오를 사유로 붙여넣었는데 기각 사유로는 거부된다"가 성립한다 |
| `gate.lastBefore` | `(history, round) -> entry \| null` | 이력 선택 규칙. **append 순서로** 마지막을 고르며 `round` 값으로 정렬하지 않는다(DD1이 append 순서를 시간 순서로 정의했다). `adjudication.carryOverOf`가 같은 규칙을 써야 하므로 export한다 — `adjudication.js`에 두면 gate ← adjudication 순환 import가 되고, 양쪽에 베끼면 두 사본이 갈린다 |
| `gate.DISPOSITIONS` · `gate.SUPPRESSING` | `string[4]` · `Set<string>` | 판정 어휘의 정본. 같은 순환 회피 이유로 gate가 소유하고 `adjudication.js`가 재사용한다 |

신규 모듈 `plugins/mccp/scripts/lib/santa/adjudication.js`(소유권 표에 이미 P1으로 배정)의
export 6종이다. 전부 순수이고 디스크·시각을 모른다 — env는 파서 2종만 읽고, `at`은 CLI가 준다.

| 함수 | 시그니처 | 계약 |
|---|---|---|
| `buildEntry` | `({round, claim, severity, disposition, evidence, at}) -> entry` | `entries` 행을 만드는 **유일한 경로**. 반환은 아래 8필드 정확히이고 `issue_id`는 인자가 아니라 `gate.issueIdOf(claim)`으로 파생된다(호출자가 id를 주면 claim과 어긋난 행이 만들어져, 어떤 재등장도 suppress하지 못하면서 coverage만 충족시킨다). 검증 실패는 `SANTA_ADJUDICATION_INVALID` throw |
| `foldEntries` | `(entries) -> {history, resolution, byRoundIssue, counts, duplicates, malformed}` | **전역 함수** — 비배열·null에 던지지 않는다. `kind`가 다른 문자열인 행은 남의 행이라 조용히 건너뛰고, 부재·비문자열은 검증을 거쳐 `malformed`다. 손상 행은 suppression에도 coverage에도 기여하지 않는다(양쪽 모두 fail-closed) |
| `coverageOf` | `({effectiveBlocking, round, folded}) -> {covered, missing}` | `issueId`가 비문자열·빈 문자열인 행은 `<round>:undefined` 키를 만들지 않고 `missing`에 담긴다 — 그 규칙이 없으면 필드 유실 시 coverage가 **늘 통과**한다 |
| `carryOverOf` | `({rawBlockingIds, prevBlockingIds, folded, round}) -> {suppressed, resolvedAbsent, newBlocking}` | 전부 집합 연산이고 **임계가 없다**. `prevBlockingIds === null`(라운드 0)이면 `newBlocking`은 raw 전체 크기다 |
| `parseAdjudicationGate` · `parseLedgerSuppression` | `(env) -> 'enforce' \| 'off'` | 불량값은 loud warn 후 `enforce`. 판정 함수는 env를 모르고 파서만 안다 |

`ledger.entries` 행 스키마(P0가 배열만 만들고 P1이 형태를 정한다 — 위 `appendEntry` 행의
시그니처·계약 문언은 **무변경**):

```jsonc
{ "kind": "adjudication",       // 태그. 훗날 다른 행 종류가 생겨도 fold가 자기 것만 읽는다
  "round": 2,                   // 지적이 **제기된** 라운드. coverage 키의 절반
  "issue_id": "a3f19c2b7e40",   // gate.issueIdOf(claim) — 12 hex, claim에서 파생
  "claim": "…",                 // 원문 그대로 (1..500자)
  "severity": "CRITICAL|HIGH",  // blocking만 판정 대상이다
  "disposition": "absorbed|rejected|skipped|reopened",   // 앞 둘만 suppress한다
  "evidence": "…",              // absorbed면 proof, rejected면 reason. ≤2000자 + 실질성 검증
  "at": "2026-08-17T…Z" }       // ISO. 호출자가 준다 — 모듈은 시각을 모른다
```

**원장은 append-only 관측 기록이고 판정은 fold의 결과다.** 같은 issue에 대한 판정이 두 번
들어와도 지우지 않는다 — `appendEntry`가 P0 동결 시그니처라 술어를 lock **안에서** 판정할
자리가 없고, 검사를 lock 밖에 두면 동시 append 둘이 나란히 통과하는 TOCTOU이기 때문이다.
막지 않고 흡수한다: fold가 하나로 수렴시키고(`같은 issue_id는 배열 뒤쪽이 이긴다`)
`duplicates`가 발생 횟수를 남긴다.

`cli.js`의 M2 추가분은 subcommand `adjudicate` 하나와 기존 셋의 선검사다 — `begin-round`가
`ledger.beginRound` 이전에 coverage를 보고(거부 시 캡 미소모), `record`가 OPEN 라운드·id 중복을
보며(DD14의 앞 둘), `verdict`가 `ledger.read` **1회** 스냅샷에서 리뷰어와 `entries`를 함께
파생하고 FINAL 라운드에서는 재계산 일치 검사만 한다. 셋 다 CLI 수준 검사라 **TOCTOU를
주장하지 않는다** — P0 동결 함수에 술어를 lock 안으로 주입할 자리가 없으므로 순차 오용을 막는
위생으로만 주장한다. 신규 exit code는 없고 `SANTA_ADJUDICATION_INCOMPLETE` ·
`SANTA_ADJUDICATION_INVALID` · `SANTA_ADJUDICATION_UNKNOWN_ISSUE` · `SANTA_REVIEWER_DUPLICATE_ID` ·
`SANTA_VERDICT_UNSTABLE`이 기존 `SANTA_*` → exit 2 매핑을 탄다.

`ledger.recordReviewer`의 계약도 그대로다 — envelope는 P1이 `findings[]`를 **더한** 형태로
저장되지만(`{claim, severity, failureScenario, evidence, structured}`), `criticalIssues`는 claim
문자열 배열로 길이가 보존되므로 `seal.js#project`의 `criticalIssueCount`가 무손상이다. `findings`가
사는 곳은 gitignored 원장뿐이고 receipt에는 집계 정수 4종만 실린다.

`beginRound`의 계약도 그 결속의 일부다: 라운드를 **열 때** 마커를 지우고(`state.terminated = null`)
`state.cap`을 갱신하며, **거부할 때**는 마커만 쓰고 `state.cap`은 건드리지 않는다. 전자는 캡 상향으로
루프를 재개한 뒤의 수렴이 종료로 읽히지 않게 하고, 후자는 거부만 받은 세션의 env cap이 원장을
덮어써 `santa_cap`이 라운드를 게이트한 적 없는 값을 싣는 것을 막는다.

**마커는 판정 입력이 아니다.** `seal.js#deriveVerdict`는 라운드에서만 판정하고, 마커는 수렴하지
않은 원장에 한해 "왜 끝났는지"로 투영된다 — 이미 수렴해 봉인된 slug에 재진입하면 Step 3의 정상
캡 거부가 마커를 쓰므로, 마커를 판정에 먹이면 재진입 하나가 converged receipt를 divergent로 덮는다.

**리뷰어의 `verdict` 문자열도 판정 입력이 아니다** (P1 code-review H1이 닫은 축). `deriveVerdict`와
`buildProof`가 FINAL 라운드 리뷰어 전원 `PASS`를 요구하던 절은 제거됐다 — P1이 게이트를 blocking
건수로 옮긴 뒤로 그 절은 봉인을 *엄격하게* 만드는 것이 아니라 **게이트를 반박**했다. MEDIUM만 낸
`FAIL`을 NICE로 두는 것이 설계된 결과인데 봉인이 그 라운드를 divergent로 막아, Step 5.5가 push를
차단하고 receipt에 divergent가 실렸다(그리고 `quorum.passed:false` + `verdict:'converged'`라는
자기모순 proof도 만들었다 — `review-verdict.js`가 구조적으로 거부하는 조합이다). 두 층이 갈릴 수
있는 자리는 이제 **같은 질문을 두 번 세는** `distinctIds >= 2` 하나뿐이고, 그 일치는 test가 잰다.

P1(santa-adjudication **M3**)이 더한 것도 같은 성격의 **추가 기록**이다(프로토콜 4). 위
`gate.decideVerdict`·`decideAdjudicatedVerdict` 행은 여전히 무변경이고, M3은 판정 자체를
건드리지 않는다 — 종료 조건을 **판정 바깥에** 새로 놓는다. 신규 모듈
`plugins/mccp/scripts/lib/santa/terminator.js`(소유권 표에 이미 P1으로 배정)의 export이며,
전부 순수이고 디스크·git·시각을 모른다(env는 파서 1종만 읽는다).

| 함수 | 시그니처 | 계약 |
|---|---|---|
| `parseTerminator` | `(env) -> 'enforce' \| 'off'` | env 파서. 불량값은 loud warn 후 `enforce`. **이 축은 default가 덜 엄격한 쪽이다** — `off`가 라운드를 더 돌리므로 리뷰를 더 받는다. 그럼에도 `enforce`가 default인 것은 M3이 닫는 결함이 "루프가 끝나지 않는다"라 오타가 그 결함을 되살리면 안 되기 때문이다 |
| `normalizeLocations` | `(raw) -> [{file, line}]` | **전역 함수**. 비배열·null → `[]`. 원소별로 `file` 문자열(1..300자) 검사, `line`은 양의 정수일 때만 보존하고 그 외는 `null`. ≤20개로 절삭하되 절삭 사실을 반환에 남기지 않는다 — 입력 정규화이지 판정이 아니다. 입력 배열을 변형하지 않는다 |
| `classifyTarget` | `({locations, patchRanges}) -> 'round_n_patch' \| 'preexisting' \| 'unknown'` | **전역 함수**. DD11의 표. `patchRanges[file]`이 **빈 배열**인 것은 "파일은 손댔지만 추가 라인이 없다"(삭제 전용 hunk)를 뜻하고 그 파일에 라인을 지정한 지적은 `preexisting`이다. 파일 집합과 범위를 두 자료구조로 나누지 않는 이유가 그 구분이다 |
| `decideTermination` | `({mode, round, minRound, effectiveBlocking, patchRanges, capAllowsAnotherRound}) -> {terminate, exitReason, reason, classified, targetsBreakdown, unresolved}` | AND 5항 — `mode==='enforce'` · `round >= minRound` · `effectiveBlocking.length > 0` · 전량 `round_n_patch` · `capAllowsAnotherRound`. 첫 항은 kill switch 축이고 나머지 넷이 판정 축이라, 문서가 "4항"이라 세면 `terminator.js`의 열거·plan 커버리지 69와 어긋난다. `exitReason`은 `'patch_chasing'` 또는 `null`. `reason`은 **어느 항이 막았는지**를 지목하는 **고정 토큰 5종**(`NO_FIRE` — `env-off` · `round-below-min` · `no-effective-blocking` · `not-all-round-n-patch` · `cap-would-end-this-run`)이다. 자유 문장이 아니다 — Task 3의 kill-switch 계약이 `off`에서 정확히 `'env-off'`를 요구하고 커버리지 85가 그 리터럴을 단언하므로, 문구를 다듬는 것 자체가 계약 위반이다. 미발화가 정상인지 입력 이상인지를 가르는 유일한 표면이다. `targetsBreakdown`은 분류 3종의 집계이고 **반환 계약의 일부다** — `cli.js`가 stdout JSON에 싣고 `santa-loop.md` Step 4.5 셸이 읽어 운영자 출력에 쓴다. `capAllowsAnotherRound` 항이 캡과의 배타를 만든다: 캡이 이미 끝낼 run에서는 terminator가 발화하지 않으므로 한 루프의 `exit_reason`은 두 값 중 하나만 갖는다 |
| `EXIT_REASON` · `TARGETS` · `ENV_TERMINATOR` · `MIN_ROUND` | 상수 | 어휘의 정본. `cli.js`·test가 리터럴을 베끼지 않는다 |

`gate.analyzeReviewers`의 반환은 **키가 하나 늘었다**(시그니처 무변경): 병합된 blocking 행이
`locations`를 갖고, 값은 같은 정규화 claim으로 병합된 findings의 `locations` **합집합**을
`(file, line)` 쌍으로 중복 제거한 것이다. `classifyFinding`은 건드리지 않았다 — `locations`는
blocking 자격에 어떤 영향도 주지 않는다. 합집합인 이유는 어느 한쪽을 버리는 규칙을 두면
**버림이 판정을 바꾸기** 때문이고(버리는 쪽이 patch 안이면 분류가 뒤집힌다), 전량 조건 아래에서
합집합은 항상 더 보수적이다(location이 늘수록 `round_n_patch`가 되기 어렵다). `recordReviewer`가
저장하는 envelope의 `findings[]` 원소도 `locations`를 갖는다(부재는 `[]`) — 병합 이전 단계에
읽을 것이 있어야 union이 성립하기 때문이며, 빈 배열은 `unknown` → 미발화 쪽이라 legacy 원장의
판정을 넓히지 않는다.

**DD2 — P0 파일 접촉 3곳.** M3은 P0 소유 파일 셋을 연다. 프로토콜 1·2에 비추어 각각이 왜
허용되는지를 여기 명시한다. 선언하지 않은 P0 파일의 변경은 plan Validation의 정적 검사가 red로
잡는다.

| P0 파일 | 무엇을 | 동결 표에 있는가 | 왜 허용인가 |
|---|---|---|---|
| `ledger.js` | `terminate(opts)` **신규 export** | 아니오 (신규) | 프로토콜 2 — 기존 시그니처 전부 무변경이고 추가만이다. 종료 마커를 **두 번째 채널로 만들지 않기 위해** P0의 기존 `state.terminated` 자리에 다른 `reason`으로 쓴다: 결속 규칙(`terminated.rounds === rounds.length`) · `beginRound`가 라운드를 열 때 마커를 지우는 규칙 · 멱등 규칙을 전부 상속한다. 짝이 되는 `clearTermination`이 없는 것은 `beginRound`의 기존 허용 분기가 이미 그 일을 하기 때문이다 |
| `ledger.js` | `assertTerminationMarker`의 허용 `reason` 집합 확장 | 예 (읽기 경로) | **한 커밋 불변식**. 쓰기만 넓히면 마커 직후의 첫 `read()`가 `SANTA_LEDGER_CORRUPT`로 던져 원장이 통째로 안 읽힌다 — 배송 불가가 되는 절반짜리 변경이다. 읽기·쓰기가 `TERMINATION_REASONS` **같은 상수**에서 파생되며, 그 상수는 `counter.REASONS.CAP_REACHED` + `terminator.EXIT_REASON.PATCH_CHASING`의 합이다 |
| `seal.js` | `buildProof`의 `capReached` 술어를 종료 일반으로 일반화 | 아니오 (`buildProof`는 동결 표에 없다) | 술어 1개이고 상수 import를 더하지 않는다(더하면 P0 접촉면이 넓어져 DD2가 그은 선을 넘는다). 일반화하지 않으면 `patch_chasing` 종료가 `layers.l1='converged'`로 봉인돼 **receipt가 승인하지 않은 게이트의 승인을 주장**한다 |
| `receipt/schema.js` | `meta.santa_exit_reason` 열거를 1종 → 2종 | 아니오 (santa 소유 필드) | additive-permissive라 기존 receipt corpus가 계속 valid다(Validation이 `receipt status`로 대조). 넓히지 않으면 `seal`이 쓴 receipt가 자기 schema에 거부당한다 |

`cli.js`의 M3 추가분은 subcommand `check-termination` 하나와 `begin-round`의 종료 선검사다.
후자는 마커 **조회**라 git이 필요 없다 — 판정은 `terminator.js`(순수) · I/O는 `cli.js` · 배선은
**정확히 두 지점**이고(`cmdCheckTermination` · `assertNotTerminated`), 각 함수가
`parseTerminator`를 1회씩 부른다. 셋째 자리(커맨드 본문 셸이 env 값을 직접 읽는 것)가 생기면
kill switch가 갈리므로 plan Validation이 그것을 정적으로 금지한다 — `santa-loop.md`는 env
**이름을 언급**할 수는 있어도 **값을 해석**하지 않는다. hunk 범위는 `git show --unified=0`의
`@@ -a,b +c,d @@`에서 `d > 0`인 것만 취하며, `--unified=0`이라 context 라인이 범위에 섞이지
않는다. 신규 exit code는 없고 `SANTA_TERMINATED`가 기존 `SANTA_*` → exit 2 매핑을 탄다.

### CLI exit code

`plugins/mccp/scripts/lib/santa/cli.js`가 소유한다. 자식 PRD는 **신규 code를 만들지 않는다** —
새 실패 종류가 필요하면 기존 매핑에 typed error code를 얹는다.

| Code | 의미 |
|---|---|
| `0` | 성공 |
| `2` | 사용/무결성 오류. `SANTA_*` 계열 error code 전부가 여기로 매핑된다 — santa-adjudication M3의 `SANTA_TERMINATED`(`begin-round`가 결속된 `patch_chasing` 마커에서 거부)도 신규 code 없이 여기를 탄다. **`12`와 구별되는 것이 요점이다**: 12는 캡 도달이고 2는 terminator 종료라, 두 종료 사유가 exit code에서도 갈린다 |
| `12` | 캡 도달. **`begin-round` 전용**이며 재사용 금지 |
| `75` | 원장 lock 경합. 재시도하면 해소된다(EX_TEMPFAIL) |

P2(santa-evidence-diversity **M1**)가 더한 것도 같은 성격의 **추가 기록**이다(프로토콜 4).
위 동결 시그니처는 한 글자도 바뀌지 않았고, 신규 모듈 `santa/lanes.js`의 export 5종이
아래에 더해질 뿐이다.

| export | 시그니처 | 계약 |
|---|---|---|
| `parseBlindLane` | `(env) → 'a'\|'b'\|'off'` | 미설정·불량값은 loud stderr warn 후 default `a`. 던지지 않는다 |
| `assignLanes` | `({mode, ids}) → {[id]: 'blind'\|'bundled'}` | DD2 표 3행이 전체 명세. 표에 없는 id는 `bundled`. 어떤 입력에도 던지지 않는다. 출력 키 수 == 입력 리뷰어 수(I5) |
| `blindIdsFrom` | `(assignment) → string[]` | 값이 `blind`인 id 전부. 2개 이상은 oracle 결함이라 `cmdLanes`가 exit 2로 거부한다 |
| `buildBlindPrompt` | `({repoRoot, targetPaths, rubric}) → string` | **파일 내용을 실을 인자가 없다**(DD3). UI5 문구 고정 포함, `MAX_TARGET_PATHS`(200) 초과 시 절삭 사실을 본문에 명시 |
| `laneCoverageFrom` | `(projection) → {blindRecords, blindRounds, rounds}` | 순수 집계. legacy 투영(레인 부재)에서 0. 어떤 입력에도 던지지 않는다 |

### P2 M1이 연 P0 파일과 근거

M1의 [primary] 지표가 "receipt stamp"라 봉인 경로를 지나지 않고는 성공 조건 자체가 관측
불가다. 프로토콜 2대로 **추가만** 했고 기존 함수의 시그니처·반환 계약은 무변경이다.

| 파일 | 연 부분 | 열지 않은 경계 |
|---|---|---|
| `santa/seal.js` | `project`에 `lane` 1필드 · 라운드 표에 열 1개 · `writeArgs`에 조건부 키 2개 | `deriveVerdict` — 봉인 판정에 레인 항을 더하는 것은 **차단**이고 M1 소관이 아니다 |
| `receipt/schema.js` | present-only 검증 2블록 | `makeSkeleton` — 키를 넣으면 전 receipt의 canonical hash 입력이 바뀐다(§3.12) |
| `receipt/write.js` | `SANTA_INT_FIELDS`에 2행 | 없음(기존 조건부 재료화 규약 그대로) |
| `santa/cli.js` | `lanes` subcommand + `record --lane` 검증 | 신규 exit code 0건 — `SANTA_LANE_MISMATCH`는 기존 `SANTA_*` → exit 2 매핑을 탄다 |

**`gate.js`는 열지 않았다.** 레인 커버리지 부족을 라운드 판정에 넣으면 그 파일을 열어야
하고 그것은 P1 행이다. M1은 레인을 **만들고 기록**하며 "블라인드가 없으면 막는다"를
주장하지 않는다. 그 강제의 소유자는 현재 미정이며 PRD Open Question이 소유한다 — M3의
Scope는 Reviewer B 부재 fallback이라 `MCCP_SANTA_BLIND_LANE=off`로 레인 자체가 꺼진 경우를
다루지 않는다.

### P2 M2 export 계약 (`santa/scope-always.js`)

P2(santa-evidence-diversity **M2**)도 프로토콜 2의 **추가**다. 동결 시그니처는 한 글자도
바뀌지 않았고 신규 모듈의 export 9종이 아래에 더해질 뿐이다.

| export | 시그니처 | 계약 |
|---|---|---|
| `ENV_ALWAYS_SCOPE` | `'MCCP_SANTA_ALWAYS_SCOPE'` | env 이름 상수 |
| `ALWAYS_SCOPE_DEFAULT` | `'enforce'` | **발화가 default**. `off`가 default면 오타 하나가 kill switch를 켜고 그 실행이 M2 이전과 똑같아 보인다(DD8) |
| `ALWAYS_SCOPE_VALUES` | `['enforce','off']` | 열거. `both` 류의 제3 상태를 만들지 않는다 |
| `MAX_ALWAYS_PATHS` | `40` | 상시 항목 상한. **diff 스코프에는 걸리지 않는다** — 변경 파일을 자르는 것은 이 축의 소관이 아니다 |
| `CONSISTENCY_RUBRIC` | `string` (고정) | UI4·UI5 고정 문구. 워킹트리 재독 지시 · 마일스톤 식별자/수/회부 건수 대조 · 불일치는 CRITICAL · `locations`에 두 파일 모두. `DO_NOT_TRUST_NARRATIVE`와 같은 취급이라 자유 문장으로 두지 않는다 |
| `parseAlwaysScope` | `(env) → 'enforce'\|'off'` | 미설정·불량값은 loud stderr warn 후 default `enforce`. 던지지 않는다 |
| `toRepoRelative` | `(raw) → string\|null` | 경로 문자열 → repo 상대 posix, 이탈 형태는 `null`. **이 모듈의 보안 경계**이자 표기 정규화의 단일 규칙 — CLI의 발견 단계가 같은 함수를 써야 `pairs`와 `paths`가 같은 문자열을 쓴다 |
| `sourcePrdFrom` | `(planText, {planPath}) → string\|null` | plan이 **스스로 선언한** Source PRD의 repo 상대 경로. 링크 형태 우선, 실패 시 평문. `./`·`../` 표기만 `planPath` 기준으로 환원하고 기준점이 없으면 `null`. **보안 경계** — 정규화 **후** `..` 잔존·절대경로(posix 루트/UNC/드라이브 문자)·NUL은 전부 `null`. 어떤 입력에도 던지지 않는다 |
| `mergeScope` | `({diffPaths, alwaysPaths}) → {paths, added, truncated, dropped}` | diff 순서 보존 후 상시 항목 append. 중복 제거는 정규화된 posix 경로 기준. 상한 초과는 **조용히 자르지 않고** `truncated` 수를 낸다. 정규화에 실패해 스코프에서 빠진 **원본 문자열**은 `dropped`로 낸다(중복으로 사라진 것은 담지 않는다 — 그쪽은 손실이 아니다). 어떤 입력에도 던지지 않는다 |

**이 모듈은 `fs`를 모른다.** 외부 require는 builtin `path` 하나(경로 정규화 전용)뿐이고,
plan 열거·파일 읽기·존재 확인·심볼릭 링크 이탈 판정은 전부 `cli.js#cmdScopeAlways`가
진다(DD2 — CLI는 후보를 **낼 뿐 주입하지 못하고**, `SCOPE_PATHS_JSON`의 생산자는 여전히
`santa-loop.md` Step 1이다).

**containment 정책이 두 갈래인 것은 의도다.** 필수 입력(`--paths-file`)은 기존
`assertContained`를 그대로 쓰고, **도출된** PRD 경로는 쓰지 않는다 — 그 함수는
`fs.realpathSync` 실패를 전부 `PATH_ESCAPES_GATE`로 던지므로(`path-containment.js:30-36`)
단순 부재도 exit 2가 되어 DD4("해소 불가 포인터는 드롭하되 라운드를 막지 않는다")와
정면으로 충돌한다. 도출 경로의 방어는 (1) `sourcePrdFrom`의 문자열 단계 이탈 거부와
(2) `cmdScopeAlways#resolveInRepo`의 **던지지 않는** realpath 격납 + 존재 확인 둘로 나뉜다.

**후보 상한은 경로 상한의 절반이다.** `cli.js`의 `MAX_ALWAYS_CANDIDATES`는
`MAX_ALWAYS_PATHS / 2`(올림)다 — 후보 하나가 최대 2개 경로(plan + 선언 PRD)를 내므로 두
숫자를 같게 두면 CLI 경로에서 `mergeScope`의 절삭이 발생하고, 그러면 `pairs`에는 있는데
`paths`에는 없는 쌍이 생긴다. rubric이 "target paths에 열거된 쌍"을 대조하라 지시하므로 그
쌍은 **검토되지 않은 채 개수만 보고된다**. 절반으로 두면 그 상태가 구조적으로 도달 불가고,
`mergeScope` 쪽 상한은 oracle을 직접 부르는 호출자를 위한 방어로 남는다.

### P2 M2가 연 P0 파일과 근거

| 파일 | 연 부분 | 열지 않은 경계 |
|---|---|---|
| `santa/cli.js` | `scope-always` subcommand 1개 + usage 1행 | 신규 exit code 0건 — 실패는 기존 `SANTA_USAGE` → exit 2 매핑을 탄다 |
| `commands/santa-loop.md` | Step 1(상시 스코프 병합 + `TMPDIR_SANTA` 정의 이동) · Step 2(고정 rubric 행 지시) · Step 3(`--rubric-file` 배선) | 다른 PRD의 절 — UI17대로 P2가 쓴 자리만 편집했다. `TMPDIR_SANTA`와 Step 3 레인 블록은 P2가 M1에서 쓴 절이다 |

**`seal.js`·`receipt/schema.js`·`receipt/write.js`는 열지 않았다.** M2는 상시 스코프를
receipt에 봉인하지 **않는다**(DD7): 상시 스코프는 라운드 단위 사실인데 `ledger.beginRound`의
라운드 형태는 P0 동결 시그니처라 필드 추가가 프로토콜 1의 P0 재개 사유이고, 리뷰어
envelope로 우회하면 값이 **호출자 선언**이 되는데 `--lane`과 달리 CLI가 Step 1의 판단을
재현할 수 없어 **검증 불가능한 필수 플래그**가 된다. 검증되지 않는 숫자를 봉인하면 receipt가
사실이 아닌 것을 사실처럼 기록한다. 그 대가로 남는 공백 — 상시 축이 조용히 0건을 낸 실행은
receipt만 봐서는 M1 시절 실행과 구분되지 않는다 — 은 PRD Open Question이 소유한다.

**`gate.js`도 열지 않았다.** "정합 불일치가 있으면 막는다"는 라운드 판정이고 그 파일은
P1 행이다. M2는 관계의 양쪽이 **스코프에 함께 들어오게** 만들고 rubric으로 대조를
지시할 뿐, 리뷰어가 실제로 불일치를 포착하는지는 LLM 행위라 셸로 단언할 대상이 없다.

### P3가 소비할 계약 — 상시 대상은 델타 축소에서 면제다

santa-delta-review(P3)가 라운드 2 이후 스코프를 직전 라운드 diff의 hunk 범위로 좁힐 때,
**상시 스코프로 들어온 항목(`scope-always`의 `added`)은 그 축소에서 제외한다**(M2 DD6,
PRD UI8). 근거는 축의 목적 자체다 — 관계 불변식은 계획이 라운드 사이에 수정되므로 매
라운드 재확인 대상이고, 델타가 그것을 잘라내면 M2는 라운드 1에서만 살아 있는 축이 된다.
M2는 `delta-scope.js`를 건드리지 않으므로(UI11) 이 줄이 그 계약의 전부이며, P3 착수 시
이 문단이 근거다.

### P2 M3 export 계약 (`santa/model-diversity.js`)

P2(santa-evidence-diversity **M3**)도 프로토콜 2의 **추가**다. 동결 시그니처는 한 글자도
바뀌지 않았고 신규 모듈의 export 11종이 아래에 더해질 뿐이다.

| export | 시그니처 | 계약 |
|---|---|---|
| `ENV_DEGRADE_GATE` | `'MCCP_SANTA_DEGRADE_GATE'` | env 이름 상수 |
| `DEGRADE_GATE_DEFAULT` | `'enforce'` | **발화가 default**. `off`가 default면 오타 하나가 kill switch를 켜고 그 실행이 M3 이전과 똑같아 보인다(DD8) |
| `DEGRADE_GATE_VALUES` | `['enforce','off']` | 열거 |
| `ENV_DEGRADE_ACK` | `'MCCP_SANTA_DEGRADE_ACK'` | env 이름 상수. **default 없음** — 부재가 곧 "승인 없음"이다 |
| `FAMILIES` | `['anthropic','openai','google']` | 계열 카탈로그. 넓히는 것은 1줄 PR이고, 그 비용이 낮다는 사실이 `unknown` fail-closed를 감당 가능하게 만든다 |
| `FAMILY_UNKNOWN` | `'unknown'` | 제4값. 카탈로그 밖 · 비문자열 · 빈 문자열 · **다중매치** 전부가 여기로 접힌다 |
| `DEGRADE_REASONS` | `['same_family','unknown_model']` | 봉인되는 사유. projection에서 파생 가능한 두 값뿐이다(DD7) |
| `familyOf` | `(model) → 'anthropic'\|'openai'\|'google'\|'unknown'` | `typeof` 가드가 **어떤 코어션보다 먼저**다 — `String(model)`을 먼저 부르면 `toString()` 오버라이드가 계열을 사고, 그 입력은 `--model` 검사를 거치지 않는 경로(`seal.project()`의 `e.model`)로 도달 가능하다. **매치된 계열이 정확히 1이 아니면 `unknown`** — 0건도 2건 이상도. precedence 표를 쓰지 않는 이유는 다중매치 문자열에 *어떤 계열이든 하나를* 주면 그 하나가 상대와 달라 곧바로 이종 판정을 사기 때문이다. 어떤 입력에도 던지지 않는다 |
| `parseDegradeGate` | `(env) → 'enforce'\|'off'` | 미설정·불량값은 loud stderr warn 후 default `enforce`. 던지지 않는다 — "gate를 못 읽어서 강등을 건너뛴다"는 분기가 존재하지 않는다 |
| `parseDegradeAck` | `(env) → {ok, reason, rejectedBecause}` | strict `validateReason`에 **위임**한다(재구현 금지 — `gate.js`가 같은 근거로 import한다). `allowCodeVocabulary`는 넘기지 않는다: push 게이트를 여는 override 표면이고 §3.13.1이 면제 대상에서 명시적으로 제외한 쪽이다. 미설정(`'absent'`)과 거부(validator 코드)를 `rejectedBecause`로 구분한다 — 호출자가 다른 안내를 해야 한다 |
| `diversityFrom` | `(projection) → {finalIndex, models, families, distinctFamilies, unknownCount, degraded, reason}` | **FINAL 라운드 하나만** 본다 — `deriveVerdict`가 같은 라운드에서 판정하므로 두 함수가 다른 라운드를 보면 봉인이 자기모순이 된다. 판정은 2줄이고 **순서가 전부**다: unknown이 하나라도 있으면 `unknown_model`, 아니면서 distinct < 2면 `same_family`. 반대로 두면 오탈자 하나가 곧바로 이종 판정을 얻는다. 라운드 0건·리뷰어 0건·legacy 투영(`model` 부재)은 전부 `degraded:true`/`unknown_model`로 접히고 어떤 입력에도 던지지 않는다 |

**이 모듈은 `fs`도 `child_process`도 모른다.** 외부 require는
`receipt/lib/force-override-reason` 하나이고 그것은 `gate.js`가 이미 지고 있어 santa 모듈군의
외부 의존 목록이 **0건 증가**한다. PATH 확인 같은 I/O는 전부 `cli.js`가 진다(`lanes.js`·
`terminator.js`와 같은 경계 — 판정 함수는 인자만 본다).

**강등의 적용은 이 모듈이 아니라 `seal.deriveVerdict`가 한다.** 여기는 "이 라운드가 실제로
이종이었는가"만 답하고, 그 답을 verdict로 바꿀지는 env와 함께 봉인 층이 정한다. 관측
(`diversityFrom`)과 강제(`deriveVerdict`)를 가른 것이 DD4가 말하는 "관측은 항상, 강제는
토글"의 구현이다 — `off`에서도 관측 3필드는 그대로 stamp된다.

### P2 M3이 연 P0 파일과 근거

| 파일 | 연 부분 | 열지 않은 경계 |
|---|---|---|
| `santa/seal.js` | `deriveVerdict`의 값 집합에 `degraded` 추가(선택 2번째 인자 `{env}`) · `renderReport` 계열 1줄 · `seal()` writeArgs 조건부 5키 · 반환 3키 · `exitReason` 술어 일반화 | `project()`의 투영 형태 **무변경**(`model`은 M2 이전부터 실려 있었다) · `buildProof`의 구조 무변경(**사영된** verdict를 인자로 받을 뿐) |
| `santa/cli.js` | `loadReviewer`의 `--model` 검사 직후 PATH 대조 1건 + 모듈 로컬 헬퍼 `isOnPath` | 신규 exit code 0건 — `SANTA_MODEL_UNAVAILABLE`은 기존 `SANTA_*` → exit 2 매핑을 탄다. 신규 CLI 플래그 0건 |
| `receipt/write.js` | `SANTA_INT_FIELDS` 1행 + 조건부 stamp 4블록 | `makeSkeleton` **무접촉** — 키를 넣으면 전 receipt의 canonical hash 입력이 바뀐다(§3.12) |
| `receipt/schema.js` | santa 블록 끝에 present-only 검증 5종 + 양방향 불변식 1개 | `REVIEW_VERDICT_VALUES`/`CODEX_VERDICT_VALUES` **무접촉** — 아래 참조 |
| `commands/santa-loop.md` | Step 3 Reviewer B fallback 1문단 · Step 5.5 degrade 분기 · Output 2행 · Notes 5항목 | 다른 PRD의 절 — UI15대로 P2가 쓴 자리와 P2가 여는 새 자리만 편집했다 |

**`gate.js`는 열지 않았다.** "동일모델이면 NICE를 주지 않는다"를 라운드 판정에 넣는 경로는
두 가지를 동시에 위반한다: `gate.decideVerdict`의 `'NICE'|'NAUGHTY'`는 P0 **동결
시그니처**(프로토콜 1의 P0 재개 사유)이고, `gate.js`는 소유권 표의 **P1 행**이다. 봉인 층은
두 조건 모두 열려 있다 — `seal.deriveVerdict`는 동결 표에 없고(선례: santa-adjudication M3이
같은 근거로 `seal.buildProof`를 열었다), 봉인 verdict는 **이미 push를 막는 자리**라 강등에
새 차단 배선이 필요하지 않다.

**`review-verdict.js`도 열지 않았다.** `REVIEW_VERDICT_VALUES`는 `receipt/schema.js`의
`CODEX_VERDICT_VALUES`와 **공유**되므로 거기에 `degraded`를 더하면 santa와 무관한 codex
축에서도 그 값이 표현 가능해지고 `pr-ship-gate.js`·`receipt-convergence.js`·dedupe·대시보드가
전부 새 값을 만난다 — 닫으려는 결함은 santa 한 축인데 폭발 반경이 receipt 계층 전체가 된다.
대신 어휘 경계에서 **좁히는 방향으로 사영**한다: `degraded`는 receipt와 proof에 `'divergent'`로
실리고(둘 다 비승인이라 사영이 넓히지 않는다) degrade라는 사실은 present-only 5필드가 진다.
사영 지점은 `seal()` 안 **한 곳**이며, 두 소비처(writeArgs · buildProof)가 같은 변수를 받는다 —
각자 사영하면 두 사영이 갈릴 수 있고 그때 새는 쪽은 조용하다.

**`ledger.js`도 열지 않았다.** M3의 입력은 원장에 **이미 있는** `model` 문자열이라 라운드
형태에 필드를 더할 이유가 없다. M2가 DD7에서 "라운드 형태는 P0 동결 시그니처"라 적은 그
경계를 M3도 그대로 지킨다 — 그리고 그 덕분에 M3은 M2가 감수해야 했던 "검증 불가능한 필수
플래그" 문제를 아예 만나지 않는다(파생원이 이미 원장 안에 있다).

### P3가 소비할 계약 — degrade 판정은 FINAL 라운드에서만 나온다

santa-delta-review(P3)가 라운드 2 이후 스코프를 좁힐 때 **`diversityFrom`은 영향받지
않는다** — 그 함수의 입력은 리뷰 스코프가 아니라 리뷰어 `model` 문자열이고, 판정은 FINAL
라운드 하나에서만 나온다. 델타 축소가 무엇을 잘라내든 그 라운드에 리뷰어 2명이 기록되는 한
계열 판정은 동일하다. M3은 `delta-scope.js`를 건드리지 않으므로(UI10) 이 줄이 그 계약의
전부다.

## 변경 프로토콜

1. **동결 시그니처는 자식 PRD가 바꾸지 않는다.** 위 표의 시그니처를 바꿔야 한다면 P0를
   재개해 그 변경을 P0 milestone으로 처리한다. 자식 PRD 안에서 조용히 바꾸면 나머지 둘이
   전제로 삼은 계약이 발밑에서 무너진다.
2. **추가는 동결 위반이 아니다.** 기존 함수의 시그니처·동작을 유지한 채 새 export를 더하는
   것은 허용된다 — M2의 `reviewersFrom`/`aggregateFrom`이 그 선례이고, 두 기존 함수는
   새 순수 함수에 위임만 하므로 호출자 관점에서 무변경이다.
3. **공유 표면은 선착순이 아니라 조정 대상이다.** `santa-loop.md`와 `cli.js`는 셋 다
   건드리므로, 병합 순서에 따라 뒤 PRD가 앞 PRD의 편집을 지우는 사고가 나기 쉽다
   (CLAUDE.md §3.5.1의 머지 삭제 사고와 같은 축). 각 PRD는 이 두 파일에서 **자기 절만**
   편집하고, 머지 전 `git diff --diff-filter=D` 로 반대편 추가분이 사라지지 않았는지
   확인한다.
4. **소유권 표가 실제 변경과 어긋나면 표를 고친다.** 표는 근거를 자식 PRD Scope에 두므로,
   Scope가 바뀌면 이 문서도 같은 PR에서 갱신한다. 표와 코드가 어긋난 채로 두면 병렬 착수의
   전제가 사라진다.
