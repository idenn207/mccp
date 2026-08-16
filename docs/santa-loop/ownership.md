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
| P2 | `plugins/mccp/scripts/lib/santa/scope-always.js` | (신규) 상시 스코프. diff 무관하게 PRD·plan 문서를 changed-files에 포함 — 같은 Scope MVP (2) |
| P2 | `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | (신규) 레인 분기 + 상시 스코프 + degrade 강등 회귀 test |
| P3 | `plugins/mccp/scripts/lib/santa/delta-scope.js` | (신규) 라운드 2 이후 리뷰 스코프를 직전 라운드 diff의 hunk 범위로 좁히는 계산 — santa-delta-review PRD Scope MVP |
| P3 | `plugins/mccp/scripts/lib/tests/santa-delta-scope.test.js` | (신규) 델타 범위 계산 + 인식론적 단언 금지 회귀 test |

교집합은 ∅다. 위 9개 경로에 중복이 없다는 것이 그 주장의 전부이고, 기계적으로 검증
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

### CLI exit code

`plugins/mccp/scripts/lib/santa/cli.js`가 소유한다. 자식 PRD는 **신규 code를 만들지 않는다** —
새 실패 종류가 필요하면 기존 매핑에 typed error code를 얹는다.

| Code | 의미 |
|---|---|
| `0` | 성공 |
| `2` | 사용/무결성 오류. `SANTA_*` 계열 error code 전부가 여기로 매핑된다 |
| `12` | 캡 도달. **`begin-round` 전용**이며 재사용 금지 |
| `75` | 원장 lock 경합. 재시도하면 해소된다(EX_TEMPFAIL) |

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
