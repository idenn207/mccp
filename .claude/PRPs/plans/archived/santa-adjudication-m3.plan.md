# Plan: santa 판정 계약 M3 — patch-chasing terminator + 캡 정책

**Source PRD**: `.claude/prds/santa-adjudication.prd.md`
**Selected Milestone**: 3 — patch-chasing terminator + 캡 정책
**Complexity**: Medium

## Summary

santa-loop은 라운드 N의 수정이 라운드 N+1의 1급 표적이 되어 자연 종료하지 않는다. #124의
6라운드 실측에서 **라운드 4~6은 전부 직전 라운드가 넣은 코드**를 겨눴고, 원 산출물의 불변식은
라운드 3에서 이미 전부 강제된 뒤였다. M1이 severity 축을, M2가 판정 원장을 놓았으므로 남은
축은 **루프가 스스로 끝나는 조건** 하나다.

M3은 라운드 N의 살아남은 blocking이 **전부** 직전 라운드의 패치를 겨눌 때 루프를 종료하고,
그 종료를 P0가 이미 가진 `state.terminated` 마커에 `patch_chasing`으로 남긴다. 대상 판정은
리뷰어의 자기 선언이 아니라 **집계 단계가 파일·라인을 직전 패치의 hunk 범위와 대조해**
기계적으로 내리며, 대조할 수 없는 항목은 전부 미발화 쪽으로 떨어진다. 함께 PRD가 M3 소유로
이연한 캡 이름·범위 불일치(`MCCP_SANTA_MAX_ROUNDS` 문언 vs 배송된 `MCCP_SANTA_ROUND_CAP`)를
해소한다.

## User Intent

<!-- PRD 본문(사용자 공동 작성) + 우산 PRD review-loop-trust의 승계 불변식에서 추출.
     저자 정당화는 이 표에 넣지 않는다 — 아래 ## Design Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 리뷰어를 온화하게 만들지 말 것. 오탐은 판정 하류에서 거른다 | constraint |
| UI2 | 판정 원장은 리뷰어가 아니라 집계 단계가 읽는다. 리뷰어는 fresh를 유지한다 | constraint |
| UI3 | santa verdict를 게이트 승인으로 쓰지 말 것 | constraint |
| UI4 | 라운드 2 이후 살아남은 blocking이 전부 직전 라운드 패치를 겨누면 루프를 종료할 것 | direction |
| UI5 | 종료할 때 미해결 항목을 보고서에 기재할 것 | direction |
| UI6 | terminator가 1차 종료 조건이고 캡은 안전망이다 | direction |
| UI7 | 캡 기본값은 3이고 환경 변수 override로 조정 가능해야 한다 | direction |
| UI8 | 고정 캡 단독으로 강제하지 말 것. 잘라내는 것은 수렴이 아니다 | constraint |
| UI9 | 캡 도달 자체가 종료 사유로 기록되어 지표가 되게 할 것 | direction |
| UI10 | 대상 판정은 리뷰어가 아니라 집계 단계가 파일과 라인을 직전 라운드 diff와 대조해 기계적으로 내린다 | constraint |
| UI11 | 대상 필드 스키마는 여기서 확정하되 델타 스코프 자체는 P3 소유다 | exclusion |
| UI12 | 블라인드 레인과 스코프 확장은 P2 소유다 | exclusion |
| UI13 | Reviewer A 로테이션은 이연한다. MVP를 부풀리지 말 것 | exclusion |
| UI14 | 흡수 반사실 검증은 비용이 커서 MVP 포함 여부가 미정이다 | exclusion |
| UI15 | 캡 환경 변수의 이름과 범위 불일치를 착수 시 문서와 코드 중 어느 쪽을 고칠지 정할 것 | direction |
| UI16 | 동결 시그니처를 자식 PRD가 바꾸지 말 것. 바꿔야 하면 P0를 재개한다 | constraint |
| UI17 | 공유 표면인 커맨드 본문과 CLI에서는 자기 절만 편집할 것 | constraint |
| UI18 | 각 불변식의 회귀 test 존재를 지표에 포함할 것 | constraint |
| UI19 | 오탐이 많다고 임계를 낮추는 것은 처방이 아니다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle + env 파서 분리 | `plugins/mccp/scripts/lib/santa/adjudication.js:81` · `plugins/mccp/scripts/lib/santa/counter.js:31` | 파서만 env를 읽고 판정 함수는 인자만 본다. 불량값은 loud warn 후 엄격한 쪽 default |
| 전역 함수(total) 규약 | `plugins/mccp/scripts/lib/santa/gate.js:255` | 비배열·null을 빈 배열로 정규화하고 어떤 입력에도 던지지 않는다 |
| 원장 스냅샷 1회 + 순수 파생 | `plugins/mccp/scripts/lib/santa/cli.js:545` · `plugins/mccp/scripts/lib/santa/seal.js:314` | `ledger.read(opts)` 한 번에서 리뷰어·entries를 함께 파생. 읽기에는 lock이 없어 N회 읽으면 동시에 존재한 적 없는 조합이 나온다 |
| mutation 전 선검사 | `plugins/mccp/scripts/lib/santa/cli.js:392` (`assertAdjudicationCoverage`) | 게이트를 `ledger.*` mutation **이전**에 둔다 — 거부 시 캡이 소모되지 않는다 |
| 판정 helper 단일화 | `plugins/mccp/scripts/lib/santa/cli.js:369` (`decideFor`) | 같은 판정을 두 호출 지점이 필요로 하면 helper 하나를 공유한다. 두 곳에서 세면 갈린다 |
| 종료 마커 결속 | `plugins/mccp/scripts/lib/santa/ledger.js:436` | `{reason, at, rounds}` — `rounds`가 관측 시점 라운드 수에 결속돼야 "언젠가 거부가 있었다"는 영구 낙인이 되지 않는다. 멱등(같은 사유·같은 결속이면 재기록 없음) |
| git 호출 | `plugins/mccp/scripts/lib/archive-complete/scan.js:158` | `execFileSync('git', [args...])` — 인자 배열. 셸 문자열 조립 금지(rev가 외부 입력이다) |
| Errors | `plugins/mccp/scripts/lib/santa/cli.js:460` | `SANTA_*` 접두 typed error → catch-all이 exit 2로 매핑. 신규 exit code를 만들지 않는다 |
| 관용 필드 | `plugins/mccp/scripts/lib/santa/cli.js:228` (`evidence`) | 선택 필드의 타입 위반은 **강등 없이** null로 떨어진다. 강등하면 부수 필드 하나가 blocking 자격을 지운다 |
| Tests (oracle) | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:142` | `node:test` + `assert/strict`, 조합 전수 고정, 입력 비변형 단언 |
| Tests (CLI 경유) | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:83` | tmpdir `git init` 진짜 repo fixture + in-process `runCli`로 exit code 단언 |
| 문서 문구 회귀 | `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:383` | 커맨드 본문을 `readFileSync`로 읽어 문구·절 경계를 직접 단언 |

**선례 없음을 명시한다** — 이 저장소에 **unified diff hunk 파서가 없다**. `git diff`를 부르는
두 곳(`plugins/mccp/scripts/lib/utils.js:446` · `plugins/mccp/scripts/lib/work-orchestrator.js:139`)은
`--name-only`/`--numstat`만 쓰고 `@@` 헤더를 읽지 않는다. Task 3의 hunk 파서는 **모방이 아니라
신규**이고, 그래서 그 자리에 커버리지 항목을 따로 붙인다(항목 66~68).

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/terminator.js` | CREATE | P1 소유(소유권 표에 이미 배정). 순수 분류·판정 oracle + env 파서 |
| `plugins/mccp/scripts/lib/santa/gate.js` | UPDATE | P1 소유. 병합 blocking 행에 `locations` union 추가(additive) |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | 공유 표면. `check-termination` subcommand · `begin-round` 종료 선검사 · `locations` 수용 · hunk 추출 |
| `plugins/mccp/scripts/lib/santa/ledger.js` | UPDATE | **P0 파일 — 추가만**. `terminate(opts)` 신규 export. 기존 시그니처 무변경(DD2) |
| `plugins/mccp/scripts/lib/santa/seal.js` | UPDATE | **P0 파일 — 술어 1개 일반화**. `buildProof`의 `capReached` → 종료 일반. 동결 표에 없는 함수(DD2) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.santa_exit_reason` 열거를 `cap_reached` 단일에서 2종으로 확장(additive-permissive) |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | 공유 표면. Step 3 `locations` 계약 · Step 4.5 신설 · Step 5 진입 분기 |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | UPDATE | 커버리지 61~87 추가. 1~60은 무변경으로 남고 같은 스크립트가 1..MAX를 함께 검사한다 |
| `docs/santa-loop/ownership.md` | UPDATE | 변경 프로토콜 4 — 신규 export·P0 접촉 3곳·`locations` 필드를 **추가 기록** |
| `docs/ENVIRONMENT.md` | UPDATE | `MCCP_SANTA_TERMINATOR` 등재 + `MCCP_SANTA_ROUND_CAP` 항목에 terminator 선행 관계 추가 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.27.1 → 1.28.0 (§3.7 minor — PRD 3 milestone 전부 완료) |
| `CHANGELOG.md` | UPDATE | `## [1.28.0]` 행 |
| `.claude/prds/santa-adjudication.prd.md` | UPDATE | Milestone 3 행 `pending` → `in-progress` + Plan 셀 · 캡 이름 Open Question 해소(DD8) |

`counter.js`와 `adjudication.js`는 건드리지 않는다. 캡 판정은 `counter.decideRound`가 이미
정확히 하고 있고(DD5가 그것을 **읽기만** 한다), 판정 원장 축은 M2가 닫았다.

## Design Decisions

### DD1 — 종료의 소재는 `state.terminated` 마커 하나다

P0는 이미 "루프가 왜 끝났는가"를 담는 자리를 갖고 있다 — `beginRound`가 캡 거부 시점에 쓰는
`{reason, at, rounds}` 마커이고, `aggregateFrom`이 그것을 `exitReason`으로 파생해
`seal()`이 receipt `meta.santa_exit_reason`에 봉인한다. 이 경로는 **PR-Codex F1이 산술
파생(`rounds.length >= cap`)의 오봉인을 고치며 방금 만든 것**이고, 그때 확립된 문언이
"`cap_reached`는 begin-round가 거부한 사건"이다.

M3이 두 번째 종료 종류를 들이면서 두 번째 채널을 만들면 그 수리가 무의미해진다. 종료가 두
곳에 살면 소비자(`seal`·리포트·receipt·`status`)마다 어느 쪽을 볼지 골라야 하고, 고르는
순간 갈린다. 그래서 `patch_chasing`은 **같은 마커에 다른 reason으로** 들어간다 — 결속 규칙
(`terminated.rounds === rounds.length`)도, `beginRound`가 라운드를 열 때 마커를 지우는
규칙도, 멱등 규칙도 전부 그대로 상속한다.

**종료 사유 열거는 M3 이후 정확히 3값이다** — 이것을 여기 못박는 이유는 fan-out test 관점이
"분포를 잰다면서 열거를 정의하지 않았다"를 HIGH로 짚었기 때문이다.

| `exit_reason` | 뜻 | 누가 쓰는가 |
|---|---|---|
| 부재(`null`) | 캡도 terminator도 끝내지 않았다 — 수렴(NICE)했거나 아직 진행 중이다 | 아무도. 마커 부재의 파생 |
| `cap_reached` | `begin-round`가 캡에서 거부했다 | `ledger.beginRound` 거부 분기(무변경) |
| `patch_chasing` | 살아남은 blocking이 전부 직전 패치를 겨눴다 | `ledger.terminate`(신규) |

`converged` receipt에서는 세 값 중 무엇이든 `null`로 투영된다(`seal()`의 기존 규칙, 무변경).
따라서 PRD의 "자연 종료 비율"은 **`cap_reached` 대 나머지**로 계산되고, `patch_chasing`은
그 나머지 안에서 "terminator가 실제로 줄인 run"을 세는 별도 수가 된다 — DD5의
`capAllowsAnotherRound` 항이 두 값을 배타로 유지한다.

대안으로 검토하고 버린 것 셋이다.

- **`entries`에 `kind:'termination'` 행을 append** — P1 소유 배열이라 P0 파일을 안 열어도
  된다. 그러나 `aggregateFrom`이 그 행을 읽지 않으므로 receipt·리포트·`status` 어디에도
  종료가 나타나지 않고, `santa_entries`(판정 행 수)만 부풀어 M2가 봉인한 수치가 거짓이 된다.
- **낮은 `--cap`으로 `begin-round`를 불러 거부를 유도** — 코드 0줄이지만 마커에
  `cap_reached`가 적힌다. 종료 사유가 거짓이 되고, 그것은 F1이 방금 닫은 결함과 **같은
  종류의 conflation**이다.
- **종료를 기록하지 않고 커맨드 본문만 멈춘다** — PRD Success Metrics의 "자연 종료 비율 ·
  receipt `exit_reason` 분포"가 측정 불가가 된다. 종료했다는 사실이 어디에도 남지 않으면
  M3은 "루프가 짧아진 것 같다"는 체감만 배송한다.

### DD2 — P0 파일 3곳을 연다. 여는 근거와 열지 않는 경계를 함께 적는다

M1은 `seal.js`를, M2는 다시 `seal.js`를 열지 않았다(M2 DD11). 그 원칙을 M3이 무시하면
"한 milestone짜리 원칙"이 되므로, **무엇이 달라졌는지**를 먼저 적는다.

M1·M2가 열지 않은 변경은 **선택적**이었다 — 보고서에 판정 라벨을 붙이는 편의였고, 열지
않아도 milestone의 주장이 모두 성립했다. M3의 셋은 **적재적**이다: 열지 않으면 PRD가 지정한
성공 지표가 산출되지 않거나(schema·ledger), 이미 있는 코드가 **거짓을 주장**한다(seal).

| 파일 | 변경 | 동결 표에 있는가 | 근거 |
|---|---|---|---|
| `ledger.js` | `terminate(opts)` **신규 export** + `assertTerminationMarker`의 reason 열거 확장 | 아니다(신규 · 비export 내부 함수) | 변경 프로토콜 2 — 추가는 동결 위반이 아니다. `beginRound` 등 기존 8종은 한 글자도 안 바뀐다 |
| `seal.js` | `buildProof`의 `capReached` 술어를 "종료 사유가 있는가"로 일반화 | 아니다(`seal.*`는 동결 표에 없다) | 아래 문단 |
| `receipt/schema.js` | `santa_exit_reason` 열거 1종 → 2종 | 아니다(receipt 계층) | additive-permissive. 기존 값은 계속 유효하므로 봉인된 receipt 48건이 무손상이고 마이그레이션이 없다 |

**`assertTerminationMarker`가 읽기 경로의 fail-closed 지점이라는 것이 이 축의 함정이다**
(fan-out architect HIGH 흡수). 그 함수는 `parseState` 안에서 **모든 `read()`마다** 돌고
`t.reason === counter.REASONS.CAP_REACHED`를 **하드 비교**한다 — 즉 `patch_chasing` 마커를
쓰기만 하고 이 검사를 넓히지 않으면, 마커를 쓴 직후의 첫 `read()`가
`SANTA_LEDGER_CORRUPT`로 던져 **그 slug의 원장이 통째로 읽히지 않는다**(seal도, status도,
begin-round도). 쓰기 쪽 열거만 넓히는 것은 이 milestone을 배송 불가로 만드는 절반짜리
변경이라, 두 곳을 **같은 상수 집합**에서 파생한다.

그 결과 **버전 간 방향성이 생긴다**: M3이 쓴 원장을 M2 코드가 읽으면 위와 같은 이유로
`SANTA_LEDGER_CORRUPT`를 던진다. 이것은 결함이 아니라 fail-closed의 정상 동작이고(원장이
조용히 오해되는 것보다 낫다), 원장이 gitignored 워킹트리 파일이라 실제 노출 창은 "같은
워크트리에서 plugin cache를 되돌린 경우" 하나뿐이다. `SCHEMA_VERSION`은 **올리지 않는다** —
올리면 M2가 쓴 기존 원장 전부가 M3에서 즉시 읽기 불가가 되어, 진행 중인 루프가 milestone
배송 시점에 전멸한다. 방향이 반대인 두 파손 중 후자가 훨씬 크다.

**seal.js 술어를 일반화하는 것은 의미 변경이 아니라 부족한 인코딩의 교정이다.** 현재 코드는
`const capReached = o.exitReason === 'cap_reached'`이고, 그 값이 참이면 `layers.l1`을
`divergent`로 둔다. 그 주석이 밝힌 의도는 "승인하지 않은 게이트가 승인했다고 주장하지
않게 한다"이다. 종료 사유가 `cap_reached` **하나뿐이던 동안** `exitReason === 'cap_reached'`와
`exitReason !== null`은 같은 술어였고, M3이 그 둘을 처음으로 가른다. 일반화하지 않으면
patch-chasing 종료가 `l1: 'converged'`로 봉인된다 — **최종 라운드가 NAUGHTY인데 M1 게이트가
그 라운드를 승인했다고 receipt가 적는 것**이고, 정확히 그 주석이 막겠다고 쓴 상태다.

**여기서 열지 않는 것도 적는다.** `ledger.beginRound`의 판정 로직, `counter.decideRound`,
`gate.decideVerdict`, `seal.deriveVerdict`, `seal.renderReport`의 표 구성 — 전부 무접촉이다.
특히 `deriveVerdict`는 **마커를 판정 입력으로 삼지 않는다**는 P0 불변식을 갖고 있고(수렴 후
재진입의 정상 거부가 converged receipt를 덮는 것을 막는다), M3은 그 불변식을 **강화하지도
완화하지도 않는다** — patch_chasing 마커 역시 판정 입력이 아니고, 그 라운드가 divergent인
이유는 마커가 아니라 최종 라운드가 NICE가 아니기 때문이다.

`docs/santa-loop/ownership.md`를 같은 PR에서 갱신한다(프로토콜 4). P2·P3가 전제로 삼는
교집합 ∅ 주장은 **9개 santa 경로**에 대한 것이고 위 셋 중 어느 것도 그 목록에 없으므로 ∅는
유지되지만, 표에 없는 파일을 만졌다는 사실 자체는 기록되어야 한다.

### DD3 — `targets`는 **계산된 분류**이고 `locations`가 그 입력이다

PRD 문언은 `targets: round_N_patch`다. 그 값은 위치가 아니라 **판정**이다("이 지적은 라운드
N의 패치를 겨눈다"). 그래서 두 이름을 나눈다.

| 이름 | 누가 만드는가 | 형태 |
|---|---|---|
| `locations` | 리뷰어(선택) | `[{ file: "repo/relative/path.js", line?: 212 }]` — ≤20개 |
| `targets` | 집계 단계(항상) | `'round_n_patch'` \| `'preexisting'` \| `'unknown'` |

**분류가 실리는 자리는 `decideTermination`의 반환 `classified[i].target`이고, blocking 행에는
실리지 않는다.** 집계가 입력 행을 되짚어 쓰면 "리뷰어가 준 것"과 "집계가 판정한 것"이 한
객체에 섞여 이 표의 분리가 이름만 남는다. DD5의 전량 조건도 그래서 `classified`를 읽는다.

**리뷰어는 위치만 말하고 판정은 하지 않는다**(UI10). "이건 직전 패치를 겨눈 지적입니다"를
리뷰어가 선언하게 하면 위조 비용이 0이고, 무엇보다 그 선언은 **루프를 끝내는 권한**이라
M1 DD5가 `failure_scenario` 자기 선언을 거부한 것과 같은 이유로 거부한다. 리뷰어가 제공하는
것은 대조 가능한 사실(파일·라인)뿐이고, 대조는 hunk 범위가 한다.

**`locations`는 선택 필드이고 타입 위반은 강등이 아니라 null이다.** `evidence`의 선례를
그대로 쓴다(`cli.js:228`). 강등하면 위치 표기 오류 하나가 `structured:false`를 만들어
**실재 blocking을 지운다** — terminator를 붙이려다 게이트를 뚫는 것이다. null로 떨어지면
그 지적은 `unknown`이 되고, `unknown`이 하나라도 있으면 terminator는 발화하지 않는다(DD5).
두 방향 모두 안전한 쪽이다.

**`issue_id`를 `locations`에서 파생하지 않는다.** M2 Open Question의 처방 (1)이 "리뷰어에게
안정적 식별자를 요구하고 `issue_id`를 claim이 아니라 거기서 파생할지 — M3 또는 P2의 축"이라
적었고, M3은 그 축을 **취하지 않는다**. 파생을 바꾸면 기존 원장의 모든 id가 갈려 M2가 배송한
suppression이 그 시점에 전멸하고, `locations`가 선택 필드인 이상 절반의 지적은 id를 얻지
못한다. `locations`가 그 축을 **가능하게** 만드는 것은 사실이고, 판단은 실측(항목 79의 실
경로 값)을 본 뒤에 하는 것이 옳다 — PRD Open Question으로 남긴다.

### DD4 — 직전 패치의 앵커는 추측하지 않고 호출자가 준다

hunk 범위를 얻으려면 "직전 라운드의 수정이 어느 커밋인가"를 알아야 한다. 원장은 그 값을
갖고 있지 않고, `state.rounds[]`에 필드를 더하는 것은 P0 저장 스키마 변경이다(DD2가 긋는
경계 밖).

검토한 추측 경로 둘을 버린다. **`HEAD` 고정**은 Step 5가 수정을 커밋한 직후라는 전제에
기대는데, 운영자가 그 사이 다른 커밋을 하나만 얹어도 조용히 틀린 범위를 만든다.
**커밋 메시지 grep**(`fix: address santa-loop review findings (round N)`)은 amend·squash·
번역에 즉시 깨지고, 깨졌다는 사실이 보이지 않는다.

그래서 **앵커는 명시 인자**다: `check-termination --prev-fix-rev <rev>`. 커맨드 본문 Step 5가
수정을 커밋한 직후 `git rev-parse HEAD`를 원장 옆 gitignored 임시 경로
(`.claude/state/santa-loop/tmp/<slug>/round-<N>-fix-rev.txt` — 리뷰어 JSON이 이미 사는 자리)에
적고, 다음 라운드의 Step 4.5가 그 파일을 읽어 넘긴다.

**경로의 `<slug>`는 장식이 아니라 이 절의 필수 요소다** (L2 R6 invariant HIGH 흡수 · R5
security가 같은 축을 MEDIUM으로 먼저 지적). 초안은 slug 없이 `round-<N>-fix-rev.txt`로 두었고,
그러면 서로 다른 decision의 병렬 루프가 같은 라운드 번호에서 **같은 파일**을 쓴다 — 나중 write가
앞의 rev를 덮고, terminator가 **다른 루프의 패치 범위**로 대조해 오분류한다. 대개는 전량 조건
덕에 미발화로 떨어지지만(안전 방향), 두 루프가 겹치는 파일을 건드렸다면 조기 종료도 성립하므로
"안전 방향이니 괜찮다"고 적을 수 없다. 저장 계층의 선례는 이미 반대 방향이었다 —
`ledger.js:205`가 `path.join(..., 'santa-loop', slug + '.json')`으로 네임스페이싱하므로, slug 없는
tmp 경로는 그 규약을 이 한 자리에서만 어긴 것이다. `<slug>`는 호출자가 준 문자열이 아니라
`ledger.deriveSantaDecisionId(...)`가 낸 **파생 slug**이고, 디렉토리 생성은 기존 `ensureStateDir`의
`assertContained` 경계 안에서 일어난다. 항목 86이 두 slug의 격리를 단독으로 잰다.

**부재·불량은 오류가 아니라 `unknown`이다.** 파일이 없거나, rev가 40-hex/`^[0-9a-f]{7,40}$`가
아니거나, `git show`가 비영점이거나, 출력에 hunk가 없으면 patch 범위는 빈 집합이고 모든
지적이 `unknown`이 되어 terminator는 발화하지 않는다. 루프는 캡이 끝낸다. 이것이 이 축의
기본 자세다 — **모르면 종료하지 않는다**.

rev는 외부 입력이므로 `execFileSync('git', [...])` 인자 배열로만 넘기고 셸 문자열을 조립하지
않는다. 형식 검사를 먼저 통과시키는 이유는 주입이 아니라 진단이다(`--upstream` 같은 문자열이
플래그로 해석되는 것을 막는다). `--` 종결자를 함께 붙인다.

**git 호출은 원장 lock 밖에서 일어난다.** `ledger.mutate`는 `guardedReadModifyWrite` 임계구역
안에서 콜백을 돌리므로, 그 안에서 `git show`를 부르면 프로세스 spawn 시간만큼 lock을 잡는다 —
라운드가 늘수록 경합이 커지고(fan-out architect MEDIUM), 무엇보다 lock 보유 중 외부 프로세스를
기다리는 것은 lock 계약이 상정한 형태가 아니다. 순서를 고정한다: **git → 분류 → 판정 → (발화
시에만) `ledger.terminate`**. 마커 write만이 임계구역이고 그 콜백은 순수 대입 하나다.

### DD5 — 발화 조건 넷의 AND. 셋은 fail-closed이고 하나는 지표를 정직하게 만든다

```
classified = effectiveBlocking.map(b => ({
  issueId: b.issueId,
  target:  classifyTarget({ locations: b.locations, patchRanges }),
}))

terminate ⟺  mode === 'enforce'
           ∧ round >= 1
           ∧ effectiveBlocking.length > 0
           ∧ classified.every(c => c.target === 'round_n_patch')
           ∧ capAllowsAnotherRound
```

**전량 조건이 읽는 것은 `classified`이지 입력 행이 아니다** (L2 R7 architect CRITICAL 흡수).
이전 초안은 `effectiveBlocking.every(b => b.targets === 'round_n_patch')`로 적어 blocking 행에
`targets` 키가 있는 것처럼 읽혔는데, **그 키는 존재하지 않는다** — Task 2가 병합 행에 더하는
것은 `locations` 하나이고 분류는 `decideTermination`이 계산해 `classified`로 낸다(항목 72).
초안대로 구현하면 두 결과 중 하나다: `b.targets`가 전건 `undefined`라 `every`가 항상 거짓이 되어
terminator가 **영원히 미발화**하거나, 그것을 고치려고 입력 행에 분류를 써넣어 **DD3의 분리**
(리뷰어 입력 `locations` ↔ 집계 판정 `targets`)가 무너진다. 어느 쪽도 조용하다.

- **`round >= 1`** — 라운드 0에는 직전 패치가 없다(DD6).
- **`length > 0`** — blocking이 0건이면 그 라운드는 NICE이고 루프의 정상 종료는 이미 그쪽이다.
  빈 배열에 `every`가 참이 되는 것이 여기서 유일하게 위험한 자리라, 조건을 따로 세운다.
- **`every(...)`** — 하나라도 `preexisting`이거나 `unknown`이면 발화하지 않는다. PRD 문언이
  "**전부** `targets: round_N_patch`면"이고, 그 전량 조건이 오분류 위험(PRD Risks 2행)에 대한
  1차 방어다.
- **`capAllowsAnotherRound`** — `counter.decideRound({roundsSoFar: rounds.length, cap: state.cap})`이
  다음 라운드를 허용할 때만 발화한다. 이 항은 안전이 아니라 **정직성**이다: 캡이 이미 끝낼
  run을 terminator가 자기 공으로 가져가면 "자연 종료 비율"이 부풀고, 두 종료 사유가 배타가
  아니게 되어 분포가 무의미해진다. terminator는 **자기가 실제로 줄인 run만** 주장한다.

`counter`를 읽기만 하고 고치지 않는 것이 UI6의 코드화다 — terminator가 1차인 것은 **더 이른
시점에 판정**하기 때문이지 캡을 무력화하기 때문이 아니다.

### DD6 — "라운드 2 이후"는 0-based index ≥ 1로 읽는다

PRD 문언은 "라운드 2 이후 살아남은 blocking"이고 원장 인덱스는 0-based라 두 독법이 있다.
**index ≥ 1(= 사람이 세는 두 번째 라운드)로 확정한다.**

근거는 산술이다. 기본 캡은 3이고 열리는 인덱스는 `{0, 1, 2}`다. index ≥ 2를 요구하면
terminator는 **마지막으로 허용된 라운드에서만** 판정할 수 있는데, 그 라운드 뒤에는 어차피
캡이 루프를 끝낸다 — 그리고 DD5의 `capAllowsAnotherRound` 항이 정확히 그 경우를 배제하므로,
index ≥ 2 독법에서는 기본 설정의 terminator가 **구조적으로 절대 발화하지 않는다**. 기본값에서
죽은 코드가 되는 독법은 PRD가 "1차 종료 조건"이라 부른 것의 해석일 수 없다.

index ≥ 1은 기계적 필요조건과도 일치한다 — index 0에는 대조할 직전 패치가 없다.

### DD7 — 판정은 한 oracle, 배선은 두 지점

Step 4.5(판정·기록)와 `begin-round`(기계적 재확인) 둘 다에 건다.

- **Step 4.5 — `check-termination`**: 라운드 N의 verdict 직후, Step 5 수정 사이클 **이전**에
  판정한다. 여기서 발화하면 운영자는 헛수고를 한 번 덜 한다(수정 → 커밋 → 판정 기록을 다
  하고 나서 "루프가 끝났습니다"를 듣는 것이 index ≥ 1에서 매 라운드 반복된다). 발화 시
  `ledger.terminate`로 마커를 쓰고 미해결 항목을 stdout에 싣는다.
- **`begin-round` 선검사**: `state.terminated`가 **현재 라운드 수에 결속된** `patch_chasing`
  마커를 갖고 있으면 `SANTA_TERMINATED`(exit 2)로 거부한다. 여기에 git이 필요 없다는 것이
  요점이다 — 마커가 이미 기록이므로 재판정이 아니라 **조회**다.

두 지점을 두는 이유는 이 저장소의 반복된 실측이다: 커맨드 본문은 LLM 산문이라 절 하나가
건너뛰어질 수 있고, "산문은 HALT, 코드는 통과"가 M2 R3·santa-loop.md Step 4·5.5에서 세 번
잡혔다. Step 4.5를 건너뛴 루프도 다음 라운드를 열지 못한다.

**드리프트는 구조로 막는다.** 판정 함수는 `terminator.decideTermination` 하나이고
`begin-round`는 그것을 **부르지 않는다** — 마커를 읽을 뿐이다. 같은 계산을 두 곳에서 하지
않으므로 갈릴 자리가 없다(`decideFor` helper가 세 호출 지점에 대해 쓰는 것과 같은 규율).

`MCCP_SANTA_TERMINATOR=off`는 두 지점을 **함께** 끈다. Step 4.5는 판정을 건너뛰고
`begin-round`는 선검사를 건너뛰므로, 이미 기록된 마커가 있어도 라운드가 열리고
`beginRound`가 그 마커를 지운다(재개 경로). 축을 나누지 않는 이유는 M2의 두 env와 달리
여기서는 **하나의 실패**만 있기 때문이다 — "terminator가 내 루프를 틀리게 끝냈다".

### DD8 — 캡 이름·범위 불일치는 **PRD를 고친다**(UI15 해소)

PRD 문언은 `MCCP_SANTA_MAX_ROUNDS`(1~5)이고 배송된 것은 `MCCP_SANTA_ROUND_CAP`(1~10)이다.
코드를 문언에 맞추지 않고 **문언을 코드에 맞춘다.**

- `MCCP_SANTA_ROUND_CAP`은 v1.23.8에 배송돼 `docs/ENVIRONMENT.md` §11의 canonical 항목이고,
  `counter.ENV_CAP` 상수이며, receipt `meta.santa_cap`으로 봉인된 값의 출처다. 이름을 바꾸면
  운영자 `settings.json`이 조용히 무시되고(구 이름은 파서가 모르므로 default 3으로 fail-open),
  그 사고는 로그에 "설정을 읽지 못했다"가 아니라 **아무것도 남기지 않는다**.
- 범위 1~10을 1~5로 좁히는 것은 **기존 설정을 무효화**한다. 6~10을 쓰던 원장은 다음 실행에서
  loud warn 후 default 3으로 떨어지고, 캡이 낮아지는 방향이라 진행 중인 루프가 즉시 종료된다.
- 넓은 상한의 비용이 M3에서 사라진다. PRD가 1~5를 적은 취지는 "캡이 무한 상향으로 남용되지
  않게"인데, M3 이후 캡은 **안전망**이고 1차 종료는 terminator다. 상한 10은 terminator가
  실패했을 때의 천장이고, 그 도달은 `exit_reason='cap_reached'`로 관측된다(UI9).

즉 코드 변경은 0이고, PRD의 해당 Open Question을 "코드가 정본 — `MCCP_SANTA_ROUND_CAP`,
1~10, default 3"으로 닫는다. `docs/ENVIRONMENT.md`의 그 항목에는 terminator와의 선행 관계
한 문장을 더한다(캡은 2차 조건이다).

### DD9 — 미해결 항목은 터미널과 원장에 남는다. 리포트에는 집계만 남는다

PRD MVP (4)는 "종료하고 **미해결 항목을 보고서에 기재**"라고 적는다. 그런데 P0의 리포트는
집계 전용이고, 리뷰어 본문과 critical issue 텍스트를 **담을 인자가 없다** — `renderReport`의
시그니처와 그 위의 UI4 주석이 그것을 명시한다. 두 문언이 충돌하므로 어느 쪽을 따르는지
적는다.

**UI4(P0 모듈 경계)를 따른다.** 미해결 항목은 세 곳에 남는다.

1. `check-termination` stdout의 `unresolved[]` — issueId · severity · claim · targets.
2. Step 4.5가 그것을 터미널 ESCALATION 블록으로 출력한다. 캡 도달 시 Step 5가 이미 같은
   형태를 쓰고 있고(`SANTA LOOP ESCALATION`), 운영자용 issue 텍스트의 표면이 터미널이라는
   것은 M1 `mismatches`·M2 `suppressed`가 이미 내린 결정이다.
3. 원장 — 그 라운드의 리뷰어 envelope에 `findings[]`가 그대로 살아 있다(UI7 보존).

**자동으로 `skipped` 행을 쓰지 않는다.** 종료 시점에 미해결 blocking 전건을 `skipped`로
append하면 "미해결 항목이 원장에 남는다"가 깔끔하게 성립하지만, 그 행들이 M2의 coverage
게이트를 **자동으로 충족**시킨다. 캡을 올려 루프를 재개한 운영자는 판정한 적 없는 지적들
위에서 다음 라운드를 열게 되고, M2가 기각 보존율을 능력으로 만든 자리가 그 순간 지시로
되돌아간다. 판정은 사람이 한다.

리포트에 판정·미해결 표를 싣는 것은 `seal.js` 소유권이 열리는 시점의 일이다(M2 DD11과 같은
문장). M3이 `seal.js`를 여는 것은 술어 하나뿐이고(DD2), 그 예외를 리포트 구성으로 확장하면
DD2가 그은 경계가 그 자리에서 무의미해진다.

### DD10 — env 1종. default `enforce`이고 불량값은 `enforce`로 떨어진다

`MCCP_SANTA_TERMINATOR=enforce|off`. `adjudication.parseEnum`과 **같은 파서 규약**을 쓴다 —
미설정은 default, 열거 밖(대소문자 불일치 포함)은 loud stderr warn 후 default.

**default가 `off`가 아닌 이유**: 기본값이 off면 M3은 다크 배송이고, PRD가 측정하겠다는
"자연 종료 비율"의 분자가 구조적으로 0이 된다. **`enforce`의 위험을 부정하지 않는다** —
잘못된 종료는 실재하는 신규 결함을 남긴 채 루프를 끝낼 수 있다. 그 위험은 DD5의 전량 조건과
DD3의 `unknown` 흡수로 좁히고, 남는 부분은 **되돌리는 비용이 낮다**는 것으로 감당한다:
운영자가 미해결 목록을 보고 동의하지 않으면 `MCCP_SANTA_TERMINATOR=off`로 같은 slug의 루프를
재개하면 되고, 그때 `beginRound`가 마커를 지운다.

**불량값이 `enforce`로 떨어지는 것은 완화 쪽이라는 점을 숨기지 않는다.** M2의
`MCCP_SANTA_ADJUDICATION_GATE`는 default가 엄격한 쪽이라 이 비대칭이 없었는데, terminator는
반대다 — `off`가 더 엄격하다(루프가 캡까지 돈다). 그럼에도 `enforce`를 default로 두는 근거는
위와 같고, 추가로 **오타가 kill switch를 켜지 않는 방향**이 여기서도 유지된다는 점이다:
오타는 terminator를 켜 두므로, 운영자가 끈 줄 알았는데 켜져 있는 상태가 아니라 켠 줄 알았는데
켜져 있는 상태다. 끄려는 의도가 반영되지 않는 것은 loud warn이 알린다.

### DD11 — 분류는 파일·라인 대조이고 그 정확도의 한계를 적는다

```
classifyTarget(locations, patchRanges):
  locations 없음/빈 배열                       → 'unknown'
  patchRanges 빈 집합                          → 'unknown'
  모든 location이 patch에 속함                 → 'round_n_patch'
  하나라도 patch 밖                            → 'preexisting'
```

"patch에 속한다"는 `file`이 patch의 파일 집합에 있고, `line`이 주어졌으면 그 파일의 hunk
범위 중 하나에 들어가는 것이다. `line`이 없으면 **파일 단위 일치로 충분**하다 — 라인을
요구하면 대부분의 지적이 `unknown`으로 떨어져 terminator가 사실상 죽고, 파일 단위 일치는
"직전 라운드가 손댄 파일을 겨눈다"는 약한 주장이지만 전량 조건 아래에서만 쓰이므로 단독으로
종료를 만들지 못한다.

**추가·수정 라인만 patch 범위다.** `@@ -a,b +c,d @@`의 `+c,d`에서 `d > 0`인 것만 범위로
삼고, 삭제 전용 hunk(`d === 0`)는 파일을 patch 파일 집합에 넣되 라인 범위는 만들지 않는다 —
지워진 라인을 겨누는 지적은 존재할 수 없고, 그 파일에 대한 라인 지정 지적은 `preexisting`이
된다(안전한 쪽).

**이 분류는 "새 결함"과 "직전 패치를 겨눈 지적"을 완벽히 가르지 못한다.** 직전 라운드가 손댄
파일에서 리뷰어가 **처음으로** 발견한 실재 결함은 `round_n_patch`로 분류된다 — 그것이
patch-chasing의 정의와 겹치기 때문이다(PRD Risks 2행이 Medium/High로 예고한 그 오분류다).
임계를 도입해 그것을 가르려 하지 않는다(UI19). 남는 방어는 셋이다: 전량 조건(하나라도 다른
파일을 겨누면 미발화) · 미해결 항목의 터미널 출력(사람이 본다) · `off`로 재개(비용 낮음).

## Tasks

### Task 1: `terminator.js` 신규 — 순수 oracle

- **Action**: 아래 export를 만든다. 전부 순수이고 디스크·git·시각을 모른다(env는 파서 1종만
  읽는다 — `adjudication.js`·`gate.js`의 경계와 동형).

  | 함수 | 시그니처 | 계약 |
  |---|---|---|
  | `parseTerminator` | `(env) -> 'enforce' \| 'off'` | 불량값은 loud warn 후 `enforce`(DD10) |
  | `normalizeLocations` | `(raw) -> [{file, line}]` | 전역 함수. 비배열·null → `[]`. 원소별로 `file` 문자열(1..300) 검사, `line`은 양의 정수일 때만 보존. ≤20개로 절삭하고 절삭 사실을 반환에 남기지 않는다(입력 정규화이지 판정이 아니다) |
  | `classifyTarget` | `({locations, patchRanges}) -> 'round_n_patch' \| 'preexisting' \| 'unknown'` | DD11의 표. 전역 함수 |
  | `decideTermination` | `({mode, round, minRound, effectiveBlocking, patchRanges, capAllowsAnotherRound}) -> {terminate, exitReason, reason, classified, unresolved}` | DD5의 AND. `exitReason`은 `'patch_chasing'` 또는 `null`. `reason`은 미발화 사유를 사람이 읽는 문장으로 남긴다(어느 항이 막았는지) |
  | `EXIT_REASON` · `TARGETS` · `ENV_TERMINATOR` · `MIN_ROUND` | 상수 | 어휘의 정본. `cli.js`·test가 리터럴을 베끼지 않는다 |

  `patchRanges`의 형태는 `{ [file: string]: Array<[number, number]> }`이고 **빈 배열인 키는
  "파일은 손댔지만 추가 라인이 없다"를 뜻한다**(DD11의 삭제 전용 hunk). `classifyTarget`이
  그 구분을 읽으므로 파일 집합과 범위를 두 자료구조로 나누지 않는다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/adjudication.js:81`(파서) ·
  `plugins/mccp/scripts/lib/santa/gate.js:255`(전역 함수 규약)
- **Validate**: 항목 61~65 · 69~72가 green (Task 6이 작성)

### Task 2: `gate.analyzeReviewers`의 병합 blocking 행에 `locations` union 추가

- **Action**: 병합된 blocking 행에 `locations` 키를 더한다 — 같은 정규화 claim으로 병합된
  findings의 `locations`를 **합집합**으로 모으고 `file` + `line` 쌍으로 중복 제거한다.
  기존 키(`claim`·`severity`·`ids`·`issueId`)는 이름·값 모두 무변경이고, `classifyFinding`은
  **건드리지 않는다** — `locations`는 blocking 자격에 어떤 영향도 주지 않는다.

  합집합인 이유: 두 리뷰어가 같은 지적을 서로 다른 라인 표기로 내면 어느 한쪽을 버리는 규칙이
  필요한데, 버리는 쪽이 patch 안이면 분류가 `preexisting`으로 바뀌어 **버림이 판정을 바꾼다**.
  합집합은 그 선택을 없애고, 전량 조건 아래에서 합집합은 항상 더 보수적이다(location이
  늘수록 `round_n_patch`가 되기 어렵다).
- **Mirror**: `plugins/mccp/scripts/lib/santa/gate.js`의 M2 `issueId` 추가분(같은 자리에 같은
  방식으로 키가 하나 더 붙은 선례)
- **Validate**: 항목 66 · 67이 green

### Task 3: `cli.js` — `locations` 수용 · hunk 추출 · `check-termination` · `begin-round` 선검사

- **Action**: 네 부분이다.
  1. `deriveFinding`에 `locations`를 더한다 — `terminator.normalizeLocations`에 위임하고,
     **타입 위반은 강등하지 않는다**(DD3). `structured` 계산식은 무변경이다.
  2. `patchRangesFrom(rev, opts)` — `execFileSync('git', ['show', '--unified=0', '--no-color',
     '--format=', rev, '--'])`의 stdout에서 `+++ b/<path>`와 `@@ … +c,d @@`를 읽어
     `patchRanges`를 만든다. rev 형식 검사(`^[0-9a-f]{7,40}$`)를 **먼저** 하고, 비영점 exit ·
     빈 출력 · 파싱 0건은 전부 `{}`(빈 집합)으로 흡수한다(DD4).

     **행 단위 규칙을 여기서 고정한다** (L2 R2 invariant MEDIUM 흡수 — 같은 편집 자리라 미룰
     이유가 없다). 파일 헤더는 `^\+\+\+ b/(.+)$`이고 `+++ /dev/null`(삭제된 파일)은 그 파일을
     **열지 않는다**. hunk 헤더는 `^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@`이며 `,d` 생략은
     `d=1`이다(unified diff 규약). **개별 hunk가 이 형태에 맞지 않으면 그 줄만 건너뛴다** —
     파일 전체나 결과 전체를 버리지 않는다. 방향이 안전한 쪽이기 때문이다: 범위를 덜 모으면
     그 위치의 지적이 `preexisting`이 되어 terminator가 **덜** 발화한다(DD5의 전량 조건).
     반대로 전체를 버리면 `{}`가 되어 모두 `unknown`이 되는데 그것도 미발화라 결과는 같지만,
     한 줄의 형식 이탈이 정상 hunk 전부를 지우는 것은 진단을 더 나쁘게 만든다.
  3. `cmdCheckTermination(args)` — `ledger.read` **1회** 스냅샷에서 `decideFor`로 effective
     blocking을 얻고, `--prev-fix-rev`로 patchRanges를 만들고, `terminator.decideTermination`을
     부른다. `terminate === true`면 `ledger.terminate({reason:'patch_chasing'}, opts)`로 마커를
     쓴다. exit는 **항상 0**이다 — 이 명령은 판정을 보고하는 것이고, 커맨드 본문이 stdout의
     `terminate` 불리언에 분기한다(비영점을 쓰면 "종료됨"이 오류로 읽혀 Step 4.5의 다른
     실패와 구별되지 않는다).

     stdout에 `targetsBreakdown`(`{round_n_patch, preexisting, unknown}` 카운트)을 함께 싣고,
     **effective blocking이 있는데 전량 `unknown`이면 loud stderr로 표면화**한다 — "리뷰어가
     `locations`를 내지 않아 terminator가 판정할 재료를 못 받았다". 이것이 L2 test 관점의
     HIGH(F4)를 닫는 자리다: `locations`가 선택 필드인 이상 미발화가 **설계상 정상 경로**와
     **리뷰어 미준수** 둘 다에서 나오는데, 그 둘을 구별하지 못하면 Acceptance (B) 미충족의
     원인이 사후에 진단 불가가 된다. 카운트는 판정을 바꾸지 않는 계측이고(DD5의 AND는
     무변경), 바꾸는 것은 **왜 발화하지 않았는지가 기록에 남는다**는 것뿐이다.
  4. `cmdBeginRound`에 `assertNotTerminated(opts)`를 `assertAdjudicationCoverage` **뒤,**
     `ledger.beginRound` **이전에** 건다 — 결속된 `patch_chasing` 마커가 있으면
     `SANTA_TERMINATED`(exit 2). 순서가 뒤가 아니라 앞이면 판정 미완료 루프가 종료 메시지를
     받아 진단이 틀린다.

     **`assertNotTerminated`의 첫 줄은 kill-switch다** — `terminator.parseTerminator(opts.env)`가
     `off`면 loud stderr(`assertAdjudicationCoverage`의 `off` 분기와 같은 형태) 후 즉시
     return한다. 이것이 DD7의 재개 경로를 성립시키는 유일한 코드다: 검사를 건너뛰면
     `ledger.beginRound`가 그대로 실행되고, **그 함수의 기존 허용 분기가 이미
     `state.terminated = null`을 수행한다**(`plugins/mccp/scripts/lib/santa/ledger.js:459` —
     캡 상향으로 루프를 재개할 때의 마커 clear). 즉 **마커 삭제 코드는 새로 만들지 않는다**;
     `ledger.terminate`에 짝이 되는 `clearTermination`이 없는 이유가 그것이고, P0 접촉을
     한 자리로 유지하는 근거이기도 하다.

  **kill-switch는 정확히 두 코드 자리에서만 해석된다** (L2 R1 invariant CRITICAL·HIGH ×2 흡수).
  DD7이 "두 지점을 함께 끈다"고 적었는데 초안의 Task 3·5가 그 분기를 **어디에도 적지 않아**,
  산문만 있고 코드가 없는 상태였다 — 이 저장소가 반복해서 잡아 온 "prose says HALT, code
  proceeds"의 거울상이다. 자리는 다음 둘이고 **커맨드 본문에는 없다**:

  | 자리 | 형태 |
  |---|---|
  | `cmdCheckTermination` | `parseTerminator(opts.env)`를 `decideTermination`의 `mode` 인자로 **주입**한다. `off`면 순수 oracle이 `{terminate:false, reason:'env-off'}`를 낸다(DD5의 첫 항) |
  | `assertNotTerminated` | `off`면 loud stderr 후 early return — 위 문단 |

  셋째 자리를 만들지 않는 것이 요점이다. Step 4.5의 셸이 자기 `if`로 env를 다시 읽으면 판정이
  두 곳에서 나뉘고, 그것이 DD7이 "판정 함수는 하나이고 `begin-round`는 마커를 **조회**할 뿐"으로
  막은 드리프트다. 커맨드 본문은 `terminate` 불리언에만 분기하므로 `off`에서도 코드 경로가
  같고, `reason='env-off'`가 그 이유를 터미널에 남긴다.

  `usage()`에 새 subcommand를 등재한다. **신규 exit code는 만들지 않는다**(소유권 표 §CLI exit
  code) — `SANTA_TERMINATED`는 기존 `SANTA_*` → exit 2 매핑을 탄다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/cli.js:392`(mutation 전 선검사 + 전량 열거 stderr) ·
  `:545`(스냅샷 1회) · `plugins/mccp/scripts/lib/archive-complete/scan.js:158`(`execFileSync` 인자 배열)
- **Validate**: 항목 68 · 73~77 · 86이 green

### Task 4: `ledger.terminate` 추가 · `seal` 술어 일반화 · `schema` 열거 확장

- **Action**: 세 파일에 최소 변경(DD2).
  1. `ledger.js` — **두 자리이고 둘은 한 커밋 불변식이다**(DD2 말미: 쓰기만 넓히면 그 원장이
     읽기 불가가 된다).
     - `TERMINATION_REASONS` 상수를 만든다 — `counter.REASONS.CAP_REACHED`와
       `terminator.EXIT_REASON.PATCH_CHASING`의 합집합. **읽기와 쓰기가 같은 집합을 본다.**
     - `assertTerminationMarker`의 `t.reason === counter.REASONS.CAP_REACHED`를 그 집합의
       멤버십 검사로 넓히고, 에러 메시지의 기대값 문구도 함께 갱신한다. 나머지 검사
       (`at` ISO · `rounds` 정수)는 무변경이다.
     - `terminate(opts)` 신규 export. `mutate` 안에서 `state.terminated`를
       `{reason, at, rounds: state.rounds.length}`로 쓴다. `beginRound`의 거부 분기와 **같은
       결속·같은 멱등 규칙**(같은 reason + 같은 rounds면 `write:false`)을 쓰고, `state.cap`은
       건드리지 않는다. 이미 **다른** reason의 결속 마커가 있으면 덮어쓰지 않고 그대로
       반환한다 — 먼저 관측된 종료가 실제 종료다. 집합 밖 reason은 throw.
     - `SCHEMA_VERSION`은 **1로 유지**한다(DD2).
     - **마커 삭제 함수는 만들지 않는다.** `terminate`의 짝처럼 보이는 `clearTermination`이
       없는 이유는 P0가 이미 그것을 하고 있기 때문이다 — `beginRound`의 허용 분기가
       `state.terminated = null`을 수행한다(`ledger.js:459`). 재개 경로는 그래서
       "`MCCP_SANTA_TERMINATOR=off` → `assertNotTerminated` 통과 → `ledger.beginRound` 실행 →
       기존 clear 발동"이고, 신규 코드는 Task 3의 early return 한 줄뿐이다(항목 76이 이
       경로 전체를 왕복으로 잰다).
  2. `seal.js` — `buildProof`의 `const capReached = o.exitReason === 'cap_reached'`를
     `const terminatedWithoutConvergence = o.exitReason !== null && o.exitReason !== undefined`로
     바꾸고 주석을 그 일반화로 갱신한다. `layers.l1` 표현식의 나머지와 다른 모든 함수는
     무변경이다.
  3. `receipt/schema.js` — `meta.santa_exit_reason` 검사를 `=== 'cap_reached'`에서
     `['cap_reached','patch_chasing'].indexOf(...) !== -1`로 넓히고 메시지를 갱신한다.
     present-only 가드는 그대로라 과거 receipt와 비-santa receipt는 무영향이다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/ledger.js:436`(마커 결속 + 멱등)
- **Validate**: 항목 78 · 79 · 80이 green + 기존 receipt corpus 검증이 invalid 0

### Task 5: `santa-loop.md` — 리뷰어 계약 · Step 4.5 · 종료 분기

- **Action**: 자기 절만 편집한다(UI17). 네 자리다.

  **번호를 다시 매기지 않는다** (L2 R3 invariant HIGH 흡수). Step 4.5는 기존 Step 5.5와 같은
  **소수점 삽입**이므로 Step 0~7의 어떤 번호도 바뀌지 않는다. 따라서 아래 (2)의 "Step 5 말미"는
  **현재의 Step 5(Fix Cycle)** 말미이고, 삽입 이후에도 그 절은 Step 5다. 이 문장이 없으면
  구현자가 기존 Step 5를 Step 6으로 미는 재번호를 고민하게 되고, 그렇게 하면 Step 5.5·6·7을
  가리키는 모든 산문과 항목 77의 절 경계 파싱이 함께 어긋난다.
  1. **Step 3 리뷰어 JSON 계약**에 `locations`를 선택 필드로 더한다 — 형태·상한·"위치만
     말하고 판정은 하지 않는다"를 명시하고, **severity 계약 문언은 한 글자도 바꾸지 않는다**
     (UI1 — 이 절의 FAIL-first 프레이밍은 M1이 봉인했고 회귀 test가 문구를 직접 단언한다).
  2. **Step 5 말미**에 fix 커밋 직후 `git rev-parse HEAD`를 `.claude/state/santa-loop/tmp/
     <slug>/round-<N>-fix-rev.txt`에 적는 두 줄을 더한다. `<N>`은 **방금 리뷰가 끝난 라운드의
     0-based 인덱스**다 — 그 라운드의 수정이 이 커밋이기 때문이다. **`<slug>` 없이 쓰지
     않는다** — DD4의 병렬 루프 교차오염 항이 그 근거이고 항목 86이 격리를 단언한다.
  3. **Step 4.5 신설** — Step 4의 NAUGHTY 분기와 Step 5 사이. `check-termination`을 부르고
     stdout의 `terminate`에 **셸 조건 분기**를 건다. 참이면 (a) 미해결 항목 ESCALATION 블록
     출력 → (b) `seal` 호출 → (c) `exit` — Step 5로 내려가지 않는다. seal 실패가 종료 진단을
     덮지 않도록 캡 도달 블록과 같은 규약을 쓴다(`$CHECK_EXIT`를 seal 결과로 덮지 않는다).

     **읽는 파일과 라운드 번호를 여기서 못박는다** (L2 R9 architect CRITICAL 흡수). 이전 초안은
     쓰기(2)만 보여 주고 읽기는 DD4의 서술("다음 라운드의 Step 4.5가 그 파일을 읽어 넘긴다")에
     기댔는데, Task가 보여 주는 코드가 쓰기뿐이면 구현자가 **어느 라운드의 파일인지** 정할
     근거가 없다. 잘못 고르면 파일이 없어 patchRanges가 빈 집합이 되고 전량 `unknown`으로
     떨어져 terminator가 **영원히 미발화**한다 — 예외도 로그도 없는 조용한 실패이고, 그 상태는
     "종료 조건이 아직 성립하지 않았다"와 관측상 구별되지 않는다.

     라운드 N의 Step 4.5는 **직전 라운드가 쓴** `round-<N-1>-fix-rev.txt`를 읽는다. 파일이
     없으면(라운드 0은 항상 그렇다) **`--prev-fix-rev`를 아예 넘기지 않는다** — 빈 문자열을
     넘기면 같은 미발화로 가더라도 사유가 "불량 rev"로 **잘못** 기록되어, 항목 84가 가르려는
     "정상 미발화 vs 입력 이상"의 구분이 무너진다.

     ```bash
     PREV_REV_FILE=".claude/state/santa-loop/tmp/$SLUG/round-$((ROUND-1))-fix-rev.txt"
     PREV_REV_ARG=""
     if [ "$ROUND" -ge 1 ] && [ -s "$PREV_REV_FILE" ]; then
       PREV_REV_ARG="--prev-fix-rev $(cat "$PREV_REV_FILE")"
     fi
     ```

     항목 87이 이 라운드 대응(N ↔ N-1)과 라운드 0의 플래그 부재를 커맨드 본문에서 단언한다.
  4. **Notes**에 terminator 한 줄과 `MCCP_SANTA_TERMINATOR` 한 줄. 후자는 **백틱 안의 이름
     언급 + `docs/ENVIRONMENT.md` 포인터**로만 쓴다 — 값을 읽는 형태(`$MCCP_SANTA_TERMINATOR`
     · `${…}` · `process.env.…`)도, 줄머리 대입(`MCCP_SANTA_TERMINATOR=off …`)도 넣지
     않는다. 앞은 셋째 판정 자리이고 뒤는 커맨드 본문이 kill-switch를 강제하는 것이라 둘 다
     DD7 위반이며, 값 예시는 canonical 등재처인 `docs/ENVIRONMENT.md`(Task 7)가 소유한다.
     **이 문장과 Validation의 constellation 검사는 같은 것을 금지한다** — 이전 초안은 여기서
     이름을 적으라고 지시하면서 검사가 이름 **문자열 전체**를 거부해, 지시대로 구현하면
     Acceptance가 구조적으로 불가능했다(L2 R5 architect CRITICAL 흡수).

  **커맨드 본문에 env 분기를 넣지 않는다** (L2 R1 invariant HIGH 흡수). DD7의 kill-switch는
  Task 3의 두 코드 자리에서만 해석되고, Step 4.5는 `terminate` 불리언에만 분기한다 —
  `off`에서는 `check-termination`이 `{terminate:false, reason:'env-off'}`를 내므로 셸이
  자기 `if`로 env를 다시 읽을 필요가 없고, 읽으면 판정이 세 곳으로 흩어진다. 대신 Step 4.5
  출력이 `reason`을 그대로 찍어 운영자가 "왜 발화하지 않았는가"를 터미널에서 본다.

  **`SEAL_EXIT` 없는 캡처를 만들지 않는다.** M2 R3이 잡은 결함이 정확히 "셸이 exit code를
  캡처만 하고 분기하지 않는다"였고, Step 4.5는 그 형태를 세 번(check · seal · 종료) 쓰므로
  Task 6의 항목 77이 **분기 존재 자체**를 파싱으로 단언한다.
- **Mirror**: `plugins/mccp/commands/santa-loop.md`의 Step 3 캡 거부 블록(종료 분기 + seal +
  `exit`의 3단 규약) · Step 5.5(exit·verdict 두 분기)
- **Validate**: 항목 74 · 77 · 86 · 87이 green

### Task 6: 회귀 test — 커버리지 61~87

- **Action**: `santa-adjudication.test.js`에 아래 27항목을 추가한다. **1~60은 무변경**이고
  같은 파일이 계약 전량을 계속 소유한다(그 파일 머리말의 규약).

**커버리지 표는 열 0에서 시작한다** — Validation의 스크립트가 `/^\| (\d+) \|/gm`으로 상한을
파생하므로, 이 표를 목록 항목 안으로 들여쓰면 행이 **한 건도 잡히지 않아** 상한 파생이 실패한다.
표만 열 0에 두고 서술은 위아래 목록에 남긴다.

| # | 항목 |
|---|---|
| 61 | `parseTerminator`: 미설정·`enforce`·`off`·불량값 4경우. 불량값은 `enforce` + stderr 발화 |
| 62 | `normalizeLocations`: 비배열·null·객체 아님·`file` 비문자열·`file` 빈 문자열·`line` 0/음수/실수 — 전부 던지지 않고 정규화된다 |
| 63 | `normalizeLocations`: 21개 입력이 20개로 절삭되고 입력 배열이 변형되지 않는다 |
| 64 | `classifyTarget`: DD11 표 4행 전수 + patchRanges 빈 집합 → `unknown` |
| 65 | `classifyTarget`: `line` 부재는 파일 단위 일치로 `round_n_patch`, 삭제 전용 파일(빈 범위)에 `line` 지정은 `preexisting` |
| 66 | `analyzeReviewers`: 병합 blocking 행의 `locations`가 두 리뷰어 입력의 합집합이고 중복이 제거된다 |
| 67 | `analyzeReviewers`: `locations` 부재·불량이 `classifyFinding`의 blocking 자격을 **바꾸지 않는다**(M1 기대값 동일) |
| 68 | `patchRangesFrom`: 실 repo fixture에서 `git show`가 낸 hunk를 파싱한다(추가·수정·삭제전용·신규파일 4종) |
| 69 | `decideTermination`: 5항 AND의 각 항을 하나씩 거짓으로 만든 5경우가 전부 미발화 + `reason`이 그 항을 지목 |
| 70 | `decideTermination`: `effectiveBlocking`이 빈 배열이면 `every`가 참이어도 미발화 — blocking 0건 라운드는 NICE이고 종료 사유는 부재다 |
| 71 | `decideTermination`: `capAllowsAnotherRound=false`면 미발화 — 캡이 끝낼 run을 terminator가 주장하지 않는다 |
| 72 | `decideTermination`: 발화 시 `unresolved`가 effective blocking 전건을 담고 `classified`가 항목별 분류를 `{issueId, target}` 형태로 담는다. **입력 `effectiveBlocking` 행에는 `target`/`targets` 키가 생기지 않는다**(입력 비변형 단언 — DD3의 분리가 코드에서 유지되는지를 재는 자리다) |
| 73 | `check-termination`(CLI): 발화 시 exit 0 + stdout `terminate:true` + 원장에 `patch_chasing` 마커가 결속돼 기록. **이 항목이 발화 경로의 결정적 증명이다** — fixture가 `locations`를 채운 원장을 직접 만들므로 리뷰어 행동에 의존하지 않는다. Task 8 (B)는 그 위에 얹는 *실경로 관측*이지 발화 로직의 유일한 증명이 아니다(L2 R3 test HIGH 흡수) |
| 74 | `check-termination`(CLI): `--prev-fix-rev` 부재·불량 rev·존재하지 않는 rev 3경우가 전부 미발화 + exit 0 |
| 75 | `begin-round`: 결속된 `patch_chasing` 마커에서 exit 2(`SANTA_TERMINATED`) + 라운드 미개설 + 캡 미소모 |
| 76 | `begin-round`: `MCCP_SANTA_TERMINATOR=off`면 마커가 있어도 라운드가 열리고 마커가 지워진다(재개 경로) |
| 77 | `santa-loop.md` 문구 회귀: Step 4.5가 존재하고 `terminate` 분기·`seal` 호출·`exit`이 **조건문 안에** 있다(if/fi 깊이 추적) |
| 78 | `ledger.terminate`: 결속·멱등·다른 reason 비덮어쓰기·열거 밖 throw·`state.cap` 무변경 5경우 |
| 79 | `seal`: **세 경우를 한 항목이 함께 고정한다** — (a) `cap_reached` 종료가 술어 일반화 **이후에도** `layers.l1='divergent'` + `santa_exit_reason='cap_reached'`로 봉인되고(회귀 대조군), (b) `patch_chasing` 종료가 `layers.l1='divergent'` + `santa_exit_reason='patch_chasing'`, (c) converged 원장에서는 exitReason이 null로 투영된다. **(a)가 이 항목의 새 절반이다** — 1~60에 캡 경로 seal test가 하나도 없어서, 술어를 `rounds.length` 같은 다른 축으로 잘못 일반화한 변이가 (b)·(c)만으로는 green을 유지하면서 캡 경로를 조용히 깬다(L2 R5 test HIGH 흡수) |
| 80 | `schema`: `santa_exit_reason`이 2종을 받고 그 밖(`''`·`'terminated'`·정수)은 invalid. 필드 부재 receipt는 여전히 valid |
| 81 | **읽기·쓰기 열거 동기**: `patch_chasing` 마커가 쓰인 원장을 `ledger.read`가 던지지 않고 읽는다. `assertTerminationMarker`를 넓히지 않으면 red가 되는 것이 이 항목의 전부다(DD2 한 커밋 불변식) |
| 82 | **legacy 원장 전방 호환**: `locations` 없는 M1/M2 형태 envelope만 담긴 원장 fixture를 미리 심고, terminator가 던지지 않으며 전량 `unknown` → 미발화임을 단언 |
| 83 | **I1·I3 회귀**: Step 3 블록에 종료 판정 토큰(`patch_chasing`·`check-termination`·`terminate`)이 **부재**하고 M1 severity 계약 문언이 무변경이다. `locations` **계약 문언**은 Step 3에 있어야 하므로 절 경계와 토큰을 나눠 단언한다 |
| 84 | **미발화 원인 진단**: effective blocking이 있는데 전량 `unknown`이면 `check-termination` stdout의 `targetsBreakdown.unknown`이 그 수와 같고 stderr가 발화한다. 부분 `unknown`(1건만)에서는 stderr가 **침묵**한다 — "리뷰어 미준수"와 "정상 미발화"를 가르는 것이 이 항목의 전부다 |
| 85 | **kill-switch 두 자리**: `MCCP_SANTA_TERMINATOR=off`에서 `check-termination`이 `{terminate:false, reason:"env-off"}`를 내고 **마커를 쓰지 않으며**, 같은 env로 `begin-round`가 결속 마커를 지나 라운드를 연다(항목 76과 짝). 셋째 자리(커맨드 본문 셸 `if`)가 생기면 `reason`이 `env-off`가 아니게 되어 red |
| 86 | **tmp 앵커 파일의 slug 격리**: 같은 라운드 번호로 서로 다른 두 slug가 각자의 `--prev-fix-rev`를 쓴 뒤, `check-termination`이 **자기 slug의 rev만** 읽는다(교차 read 0건). slug 없는 경로로 되돌리면 두 번째 write가 첫 번째를 덮어 이 항목이 red다 — 병렬 루프 교차오염을 구조적으로 막는 것이 DD4의 요구다(L2 R6 invariant HIGH 흡수) |
| 87 | **라운드 대응**: 커맨드 본문 Step 4.5가 `round-$((ROUND-1))` 경로를 만들고(라운드 N이 N-1을 읽는다), `ROUND=0`에서는 `--prev-fix-rev`를 **넘기지 않는다**(빈 문자열도 아니다). 실 `santa-loop.md`를 읽어 두 성질을 단언한다 — N을 잘못 고르면 patchRanges가 빈 집합이 되어 terminator가 예외 없이 영원히 미발화하고, 그 상태는 정상 미발화와 관측상 구별되지 않는다(L2 R9 architect CRITICAL 흡수) |

- **CLI를 겨눈 항목(68·73~76·81·82·84·85·86)은 tmpdir `git init` 진짜 repo fixture 위에서 in-process
  `runCli`를 지난다** — 순수 oracle만 test하면 배선 결함을 놓친다는 것이 이 저장소의 실측
  교훈이고, 특히 68은 진짜 `git show` 출력을 파싱해야 의미가 있다(합성 diff 문자열은 내가 쓴
  파서를 내가 쓴 입력으로 재는 것이다).
- **Mirror**: `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js:83`(fixture) · `:383`(문구 회귀)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`

### Task 7: 문서 · 버전 · PRD

- **Action**: `docs/santa-loop/ownership.md`에 P1 M3 추가분을 **추가 기록**으로 남긴다 —
  신규 모듈 `terminator.js`의 export 4종 + 상수, `gate.analyzeReviewers`의 `locations` union,
  `ledger.terminate`, 그리고 **DD2의 P0 접촉 3곳을 표로 명시**(무엇을·왜·동결 표에 있는지).
  `cli.js` §CLI exit code 절에 `SANTA_TERMINATED`가 기존 2 매핑을 탄다는 문장을 더한다.

  `docs/ENVIRONMENT.md` §11에 `MCCP_SANTA_TERMINATOR`를 등재하고(기본값 · `off`가 더 엄격한
  비대칭 · 두 배선 지점을 함께 끈다는 것), `MCCP_SANTA_ROUND_CAP` 항목에 DD8의 결론
  한 문단을 더한다(캡은 2차 조건 · PRD의 `MCCP_SANTA_MAX_ROUNDS` 문언은 폐기됨).

  `plugin.json`을 **1.28.0**으로 bump하고 `CHANGELOG.md`에 `## [1.28.0]`을 추가한다 —
  §3.7 minor(PRD 3 milestone 전부 완료). **번호는 미리 정해 두지 않는다**: origin/main이 이미
  1.27.1이므로 머지 해소 시점과 `/mccp:pr` 직전 두 번 재계산한다(§3.7 forward-only, 11회 재발).

  PRD를 갱신한다 — Milestone 3 행 `in-progress` + Plan 셀 연결, 캡 이름 Open Question을
  DD8의 결론으로 닫음, `issue_id`를 `locations`에서 파생할지를 **새 Open Question으로 등재**
  (DD3 말미 — 실측을 본 뒤 판단).
- **Mirror**: `docs/ENVIRONMENT.md:359`(M2 항목의 서술 밀도) · `docs/santa-loop/ownership.md:77`(추가 기록 문단 형식)
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"`이
  `1.28.0` · `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`가 green

### Task 8: 실 경로 1회 완주

- **Action**: 단위 test 통과는 경로 작동이 아니다. 두 부분이고 **둘 다 무조건부**다.

  **(A) 미발화 경로** — 이 저장소에서 `/mccp:santa-loop`을 돌린다. 라운드 0에서 Step 4.5가
  실제로 실행되고 `terminate:false` + `reason`이 `round < 1`을 지목하며, 루프가 M2까지의
  동작과 **동일하게** 진행된다(회귀 없음). 라운드가 하나 더 열리면 `--prev-fix-rev`가 실제로
  적히고 읽히는지 확인한다.

  **(B) 발화 경로 — 종자 패치 probe로 성립시킨다.** M1·M2가 각각 "리뷰어가 blocking을 낼지
  통제할 수 없다"로 조건절을 달았다가 M2에서 그것을 제거한 선례를 따른다. 통제할 수 없는
  것은 리뷰어의 판단이지 **리뷰 대상**이 아니다.

  별도 워크트리(§3.8 `.worktrees/`)에 scratch 브랜치를 만들고 **두 커밋**을 만든다: 커밋 1이
  결함 있는 함수를 넣고, 커밋 2(= "직전 라운드의 수정")가 그것을 불완전하게 고친다. 커밋 2를
  `--prev-fix-rev`로 넘긴 채 `/mccp:santa-loop --decision santa-adjudication-m3-probe`를 돌리면
  리뷰어의 지적이 커밋 2가 손댄 라인을 겨누므로 전량 `round_n_patch`가 성립한다. 그 상태에서:

  1. `check-termination`이 `terminate:true` + `exitReason:'patch_chasing'`을 낸다.
  2. 원장 `state.terminated`가 `{reason:'patch_chasing', rounds:N}`로 결속돼 기록된다.
  3. `begin-round`가 exit 2(`SANTA_TERMINATED`) — 라운드 미개설 · 캡 미소모.
  4. `seal`이 `verdict:'divergent'` + `meta.santa_exit_reason='patch_chasing'` +
     `layers.l1='divergent'`로 봉인되고 receipt가 schema를 통과한다.
  5. `MCCP_SANTA_TERMINATOR=off`로 `begin-round`를 다시 부르면 라운드가 열리고 마커가 지워진다.

  **probe의 seal 리포트는 M3 브랜치로 가져온다** (L2 R3 test MEDIUM 흡수 — Validation의 (B)
  검증 스크립트가 그 파일을 repo 루트 기준으로 찾는다). probe는 §3.8대로 별도 워크트리에서
  돌므로 `seal`이 쓰는 `.claude/reviews/santa-review-santa-adjudication-m3-probe.md`는 그
  워크트리에 생긴다. `.claude/reviews/`는 **git-tracked**이므로 그 한 파일을 M3 브랜치에
  커밋해야 증거가 워크트리 정리(§3.8)를 넘어 살아남고 (B) 스크립트가 green이 된다. 나머지
  probe 산출물(원장·receipt)은 gitignored이거나 working-tree only이므로 가져오지 않는다 —
  가져올 대상은 **리포트 1개**다.

  **합성 리뷰어 JSON을 쓰지 않는다.** 종자는 *리뷰 대상*에 있고 *리뷰어 출력*에는 없다 —
  리뷰어가 실제로 코드를 읽고 실제로 판단하며 그 출력이 실제 CLI를 지나 실제 원장에 들어가는
  것이 이 Task의 전부다. `locations`를 리뷰어가 실제로 채우는지도 여기서만 관측된다.

  **리뷰어가 `locations`를 채우지 않으면 (B)는 미충족이고 그것이 결과다.** 전량이 `unknown`이
  되어 terminator가 발화하지 않으며, 그 경우 milestone을 `complete`로 바꾸지 않고 실측값을
  PRD Open Questions에 남긴다 — 처방은 임계 완화가 아니라 Step 3 프롬프트의 재작성이다(UI19).
- **Validate**: 위 (A) 2건 · (B) 1~5의 실측값을 plan 하단이 아니라 **PRD Open Questions와
  커밋 메시지**에 남긴다(원장은 gitignored라 사라진다 — M2 DD15)

## Validation

```bash
# 단위 + CLI 경유 회귀
node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js
node --test plugins/mccp/scripts/lib/tests/santa-gate.test.js
node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js
node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js
node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js

# 커버리지 계약 — 1..MAX. 상한은 **M2와 M3 두 plan의 커버리지 표에서 파생**한다.
# M3이 같은 test 파일을 고치므로 M1·M2 항목(1~60)의 소실이 이 스크립트로 잡혀야 하고,
# 같은 수를 여러 곳에 적으면 동기화가 반드시 실패하므로 계약 원본은 표뿐이다.
node -e '
  const fs=require("fs");
  const PLANS=[".claude/plans/santa-adjudication-m2.plan.md",
               ".claude/plans/santa-adjudication-m3.plan.md"];
  const files=["plugins/mccp/scripts/lib/tests/santa-adjudication.test.js",
               "plugins/mccp/scripts/lib/tests/santa-gate.test.js"];
  const absentF=files.filter(f=>!fs.existsSync(f));
  if(absentF.length){console.error("coverage check cannot run — test file(s) not found: "+
    absentF.join(", "));process.exit(1);}
  let ids=[];
  for(const p of PLANS){
    let plan;
    try{plan=fs.readFileSync(p,"utf8");}catch(e){
      console.error("coverage bound cannot be derived — plan unreadable: "+p);process.exit(1);}
    const got=[...plan.matchAll(/^\| (\d+) \|/gm)].map(m=>Number(m[1]));
    if(!got.length){console.error("coverage table not found in "+p+
      " — rows must start with `| <id> |`");process.exit(1);}
    ids=ids.concat(got);
  }
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
  // 항목별 **구조** 요구 — 존재+assert만 보면 항목 68을 합성 diff 문자열로 만족시킬 수 있고,
  // 그러면 "내가 쓴 파서를 내가 쓴 입력으로 재는" test가 계약을 통과한다(L2 test HIGH F2).
  // 여기서 요구하는 것은 그 블록이 **진짜 git을 지난다**는 것뿐이다 — 파서의 정확도를 재는
  // 것이 아니라, 입력의 출처가 git이라는 사실을 기계로 고정한다.
  //
  // **이 검사가 닫지 못하는 것도 적는다**(L2 R3 test MEDIUM): setup에서 git을 부른 뒤 단언은
  // 미리 만든 문자열에 거는 test는 여전히 통과한다. 정규식은 호출의 존재를 보지 출력의 흐름을
  // 보지 못하고, 그것을 보려면 test 본문의 데이터 흐름을 정적 분석해야 한다 — 그 비용은 얻는
  // 것보다 크다. 이 guard가 하는 일은 **위반의 비용을 올리는 것**이지 위반을 불가능하게 만드는
  // 것이 아니며, 위 문단이 "합성 diff는 만족시키지 못한다"고 단정했던 것은 과장이었다.
  // L2 R7 invariant HIGH 흡수 — 항목 77은 STRUCT에 **없었다**. 그 항목이 주장하는 것은
  // "Step 4.5의 seal·exit이 조건문 **안에** 있다"인데, 존재+assert만 통과하면
  // `assert(/Step 4\.5/.test(md))` 한 줄로도 green이 되어 M2 R3이 잡은 결함("캡처만 하고
  // 분기 없음")의 재발을 **못 잡는 test가 계약을 만족**한다. `needs`를 배열로 일반화해
  // 항목별로 여러 구조 요구를 걸 수 있게 한다.
  const STRUCT={
    // `why`는 실패 메시지로 구현자에게 그대로 읽히므로, 위 문단이 **철회한** 주장을 여기
    // 남겨 두면 안 된다(L2 R8 test HIGH 흡수). 이전 문안은 "synthetic diff strings do not
    // satisfy item 68"이라 단정했는데, 바로 위에서 "setup에서 git을 부른 뒤 미리 만든
    // 문자열에 단언하는 test는 통과한다"고 적어 두고 메시지만 옛 주장을 유지한 것이었다.
    68:{needs:[/execFileSync\(\s*["\x27]git["\x27]|runGit\(/],
        why:"a real git invocation in the test block — this raises the cost of a synthetic-input test, it does NOT make one impossible (see the note above)"},
    77:{needs:[/readFileSync\([^)]*santa-loop\.md/, /\bfi\b|\bdepth\b/],
        why:"the real command body read from disk AND a nesting check (if/fi depth), not a token-presence assertion"},
  };
  const structFail=[];
  for(const id of Object.keys(STRUCT)){
    const at=body.indexOf("["+id+"]");
    const rest=body.slice(at);
    const next=rest.slice(1).search(/\n\s*(?:test|it)\s*\(/);
    const block=next===-1?rest:rest.slice(0,next+1);
    if(!STRUCT[id].needs.every(function(re){return re.test(block);}))
      structFail.push(id+" must use "+STRUCT[id].why);
  }
  if(structFail.length){console.error("coverage structural requirement unmet:\n  "+
    structFail.join("\n  "));process.exit(1);}
  console.log("coverage "+MAX+"/"+MAX+" (bound derived from both plan tables), "+
    "every item has at least one assertion, item 68 goes through real git");
'

# 동결 시그니처 무변경 + 신규 export 존재 + P0 접촉이 **선언된 3곳뿐**임을 확인.
node -e '
  const a=require("assert");
  const g=require("./plugins/mccp/scripts/lib/santa/gate");
  const t=require("./plugins/mccp/scripts/lib/santa/terminator");
  const l=require("./plugins/mccp/scripts/lib/santa/ledger");
  const c=require("./plugins/mccp/scripts/lib/santa/counter");
  // 동결: decideVerdict는 여전히 3키만 낸다
  const two=[{id:"A",model:"m",verdict:"PASS",criticalIssues:[]},
             {id:"B",model:"m",verdict:"PASS",criticalIssues:[]}];
  const r=g.decideVerdict({reviewers:two});
  a.deepEqual(Object.keys(r).sort(),["exitReason","failing","verdict"],
    "decideVerdict의 반환 키가 늘었다 — 동결 위반");
  a.equal(r.verdict,"NICE");
  // 동결: counter는 무변경
  a.equal(c.ENV_CAP,"MCCP_SANTA_ROUND_CAP"); a.equal(c.DEFAULT_CAP,3);
  a.equal(c.MIN_CAP,1); a.equal(c.MAX_CAP,10);
  // 추가: terminator 4종 + ledger.terminate
  for(const k of ["parseTerminator","normalizeLocations","classifyTarget","decideTermination"])
    a.equal(typeof t[k],"function","terminator."+k+" 부재");
  a.equal(typeof l.terminate,"function","ledger.terminate 부재");
  // L2 R9 test HIGH 흡수 — 함수 4종만 보고 **상수 4종은 보지 않았다**. Task 1이 그 상수를
  // "어휘의 정본이고 cli.js·test가 리터럴을 베끼지 않는다"의 근거로 삼으므로, 부재하거나
  // 값이 어긋나면 그 주장이 조용히 거짓이 된다(소비처는 `undefined`와 비교하며 통과한다).
  // 값으로 검사하는 이유는 키 이름까지 못박으면 plan에 없는 것을 강제하기 때문이다 — 값은
  // DD1(exit reason 2종 + 부재는 null이라 상수가 아니다) · DD3(targets 3종) · DD10 · DD6이
  // 이미 표로 확정했다.
  a.deepEqual(Object.values(t.EXIT_REASON||{}).sort(),["cap_reached","patch_chasing"],
    "terminator.EXIT_REASON이 DD1의 2종과 다르다");
  a.deepEqual(Object.values(t.TARGETS||{}).sort(),["preexisting","round_n_patch","unknown"],
    "terminator.TARGETS가 DD3의 3종과 다르다");
  a.equal(t.ENV_TERMINATOR,"MCCP_SANTA_TERMINATOR","terminator.ENV_TERMINATOR 불일치(DD10)");
  a.equal(t.MIN_ROUND,1,"terminator.MIN_ROUND는 DD6의 0-based index >= 1이다");
  // 전역 함수 규약 — 어떤 입력에도 던지지 않는다
  for(const bad of [undefined,null,0,"",{},[]]){
    a.doesNotThrow(()=>t.normalizeLocations(bad));
    a.doesNotThrow(()=>t.classifyTarget({locations:bad,patchRanges:bad}));
  }
  console.log("frozen signatures intact · terminator+ledger exports present");
'

# P0 접촉 경계 — 선언한 3곳 밖의 P0 파일이 이 브랜치에서 바뀌면 red.
node -e '
  const {execFileSync}=require("child_process");
  const base=process.env.SANTA_BASE||"origin/main";
  const out=execFileSync("git",["diff","--name-only",base+"...HEAD"],{encoding:"utf8"});
  const changed=out.split(/\r?\n/).filter(Boolean);
  const ALLOWED_P0=new Set(["plugins/mccp/scripts/lib/santa/ledger.js",
                            "plugins/mccp/scripts/lib/santa/seal.js",
                            "plugins/mccp/scripts/receipt/schema.js"]);
  const P0_PREFIX="plugins/mccp/scripts/lib/santa/";
  const P1_OWNED=new Set([P0_PREFIX+"gate.js",P0_PREFIX+"terminator.js",
                          P0_PREFIX+"adjudication.js",P0_PREFIX+"cli.js"]);
  const viol=changed.filter(f=>f.startsWith(P0_PREFIX)&&!P1_OWNED.has(f)&&!ALLOWED_P0.has(f));
  if(viol.length){console.error("P1이 선언하지 않은 P0 santa 파일을 변경했다: "+
    viol.join(", "));process.exit(1);}
  console.log("P0 contact limited to the 3 declared files");
'

# 소유권 표 교집합 ∅ (M2 Validation 5번과 동일 계약 — 표가 늘었으므로 다시 돌린다)
node -e '
  const fs=require("fs");
  const md=fs.readFileSync("docs/santa-loop/ownership.md","utf8");
  const rows=[...md.matchAll(/^\| (P[123]) \| `([^`]+)` \|/gm)];
  const sets={P1:new Set(),P2:new Set(),P3:new Set()};
  for(const m of rows) sets[m[1]].add(m[2]);
  const pairs=[["P1","P2"],["P1","P3"],["P2","P3"]];
  for(const [a,b] of pairs){
    for(const p of sets[a]) if(sets[b].has(p)){
      console.error("ownership overlap "+a+"/"+b+": "+p);process.exit(1);}
  }
  console.log("ownership intersection empty ("+Object.keys(sets)
    .map(k=>k+"="+sets[k].size).join(" ")+")");
'

# receipt corpus 무손상 — 열거 확장은 additive-permissive라 기존 receipt가 계속 valid여야 한다
node plugins/mccp/scripts/receipt/cli.js status

# 세 파일 constellation 정합 — **한 커밋 불변식을 산문에서 정적 검사로 옮긴다.**
#
# L2 R4 invariant CRITICAL+HIGH ×2 흡수. 이전 초안은 DD2의 "한 커밋"과 DD7의 "두 자리"를
# **문서 약속**으로 두고 검증을 test(항목 81·85)에 맡겼는데, test는 실행돼야 잡고 이 검사는
# 소스만 읽으면 잡는다. 셋이 갈린 상태가 만드는 것이 조용한 오동작이라 — read를 안 넓히면
# 원장이 통째로 안 읽히고, seal을 안 고치면 NAUGHTY 종료가 layers.l1='converged'로 봉인돼
# receipt가 승인하지 않은 게이트의 승인을 주장한다 — 검사를 앞당길 값어치가 있다.
#
# **정적 문자열 검사의 한계를 함께 적는다**: 이것은 "세 자리가 같은 어휘를 참조한다"만 보지
# 런타임 동치를 보지 않는다. 런타임 축은 여전히 항목 79·81이 소유하고, 이 스크립트가 하는
# 일은 **test를 돌리기 전에** 갈림을 드러내는 것이다.
node -e '
  const fs=require("fs");
  const L=fs.readFileSync("plugins/mccp/scripts/lib/santa/ledger.js","utf8");
  const S=fs.readFileSync("plugins/mccp/scripts/lib/santa/seal.js","utf8");
  const C=fs.readFileSync("plugins/mccp/scripts/receipt/schema.js","utf8");
  const T=fs.readFileSync("plugins/mccp/scripts/lib/santa/cli.js","utf8");
  const M=fs.readFileSync("plugins/mccp/commands/santa-loop.md","utf8");
  const bad=[];
  const reads=/function assertTerminationMarker[\s\S]*?\n}/.exec(L);
  const writes=/function terminate\s*\([\s\S]*?\n}/.exec(L);
  if(!reads) bad.push("ledger.js: assertTerminationMarker 없음");
  if(!writes) bad.push("ledger.js: terminate() 없음 — Task 4 미구현");
  if(reads && !/TERMINATION_REASONS/.test(reads[0]))
    bad.push("assertTerminationMarker가 TERMINATION_REASONS를 참조하지 않는다 (읽기 쪽 미확장 — 다음 read가 SANTA_LEDGER_CORRUPT)");
  if(writes && !/TERMINATION_REASONS/.test(writes[0]))
    bad.push("terminate()가 TERMINATION_REASONS를 참조하지 않는다 (쓰기 쪽 어휘 이탈)");
  if(/exitReason\s*===\s*.cap_reached./.test(S))
    bad.push("seal.js가 아직 exitReason === cap_reached 리터럴을 쓴다 — patch_chasing 종료가 l1=converged로 봉인된다");
  if(!/patch_chasing/.test(C))
    bad.push("receipt/schema.js가 patch_chasing을 받지 않는다 — seal이 쓴 receipt가 invalid가 된다");
  // L2 R7 invariant HIGH 흡수 — 개수만 세면 두 호출이 **같은 함수 안에** 있어도 통과하고,
  // 그러면 다른 배선 지점은 판정을 잃은 채 셋째 자리가 조용히 생긴다. DD7이 못박는 것은
  // "두 번"이 아니라 **"이 두 함수에서 각각 한 번"**이므로 함수 본문 단위로 센다
  // (본문 추출은 위 assertTerminationMarker·terminate와 같은 형태다).
  const sites=(T.match(/parseTerminator\s*\(/g)||[]).length;
  if(sites!==2) bad.push("cli.js의 parseTerminator 호출이 "+sites+"곳 — DD7은 정확히 2곳이다");
  for(const fn of ["cmdCheckTermination","assertNotTerminated"]){
    const m=new RegExp("function\\s+"+fn+"\\s*\\([\\s\\S]*?\\n}").exec(T);
    if(!m){ bad.push("cli.js에 "+fn+"이 없다 — DD7의 두 배선 지점 중 하나가 미구현이다"); continue; }
    const n=(m[0].match(/parseTerminator\s*\(/g)||[]).length;
    if(n!==1) bad.push(fn+" 안의 parseTerminator 호출이 "+n+"곳 — DD7은 각 함수에서 정확히 1회다");
  }
  // 금지 대상은 **값을 읽거나 강제하는 형태**이지 이름 언급이 아니다. Task 5 (4)가 Notes에
  // 백틱 이름을 적으라고 지시하므로, 문자열 전체를 거부하면 지시대로 구현했을 때 이 검사가
  // 영원히 red가 되어 Acceptance가 구조적으로 불가능해진다(L2 R5 architect CRITICAL 흡수).
  const envRead=/\$\{?MCCP_SANTA_TERMINATOR|process\.env\.MCCP_SANTA_TERMINATOR|(^|\n)[ \t]*(export[ \t]+)?MCCP_SANTA_TERMINATOR=/;
  if(envRead.test(M))
    bad.push("santa-loop.md가 MCCP_SANTA_TERMINATOR 값을 읽거나 줄머리에서 대입한다 — 셋째 판정 자리가 생겼다(DD7 위반). 이름 언급은 허용이고 값 해석만 금지다");
  if(bad.length){ console.error("three-file constellation incoherent:\n  "+bad.join("\n  ")); process.exit(1); }
  console.log("constellation coherent: ledger read/write share TERMINATION_REASONS, seal generalized, schema widened, kill-switch in exactly 2 sites");
'

# Acceptance (B) 기계 검증 — 실 경로 발화가 **실제로 일어났는가**.
#
# L2 R2 invariant HIGH 흡수. 이전 초안은 (B)를 "체크되지 않으면 complete가 아니다"라는
# **문장**으로만 두었는데, M1과 M2가 각각 (B)를 미충족한 채 종료한 실측 이력이 있다
# (M1은 Open Question으로 이연, M2는 운영자 override). 같은 구조를 세 번째로 반복하면서
# 이번에는 다를 것이라고 적는 것은 근거가 없다.
#
# 검증 대상은 receipt가 아니라 **seal 리포트**다. `.claude/receipts/`는 working-tree only라
# 워크트리를 지우면 사라지지만 `.claude/reviews/`는 git-tracked이고(§3.12의 durable 표면),
# `renderReport`가 `- exit reason: `<reason>`` 줄을 항상 찍으므로 grep 하나로 족하다.
# 이 스크립트가 green이면 "종자 패치 probe가 실제로 돌았고 terminator가 발화했다"가
# **파일로 증명**된다 — 체크박스가 아니라.
node -e '
  const fs=require("fs");
  const P=".claude/reviews/santa-review-santa-adjudication-m3-probe.md";
  if(!fs.existsSync(P)){
    console.error("Acceptance (B) unproven: "+P+" is absent. Task 8 (B)의 종자 패치 probe가 "+
      "실행되지 않았거나 seal이 리포트를 남기지 않았다. milestone은 complete가 아니다.");
    process.exit(1);}
  const body=fs.readFileSync(P,"utf8");
  if(!/^- exit reason: `patch_chasing`$/m.test(body)){
    console.error("Acceptance (B) unproven: "+P+" 는 있으나 exit reason이 `patch_chasing`이 "+
      "아니다. terminator가 그 루프를 끝내지 않았다는 뜻이므로 발화 경로는 미관측이다.\n"+
      (body.match(/^- exit reason:.*$/m)||["(exit reason 줄 없음)"])[0]);
    process.exit(1);}
  console.log("Acceptance (B) proven: terminator fired end-to-end and the seal recorded it");
'
```

## Risks

가장 큰 셋을 펼치고 나머지 7건은 접는다(SKILL `## Output Constraints` H4 — risk table은 상위
3개 expanded). 접힌 항목도 전부 실재하는 위험이고 완화가 붙어 있다 — 접은 것은 화면이지
내용이 아니다.

| Risk | Likelihood | Mitigation |
|---|---|---|
| terminator가 실재하는 신규 결함을 patch-chasing으로 오분류해 루프를 조기 종료 | **Medium** | DD11이 이 한계를 **부정하지 않는다** — 직전 패치가 손댄 파일에서 처음 발견된 실재 결함은 정의상 구별 불가다. 방어는 셋: 전량 조건(하나라도 다른 곳을 겨누면 미발화) · 미해결 항목의 터미널 ESCALATION 출력(사람이 본다) · `MCCP_SANTA_TERMINATOR=off` 재개(마커가 지워지고 루프가 이어진다). 임계는 도입하지 않는다(UI19) |
| 리뷰어가 `locations`를 채우지 않아 terminator가 실경로에서 절대 발화하지 않는다 | **Medium** | 선택 필드이므로 구조적으로 가능하다. Task 8 (B)가 이것을 **조건절 없이** 관측하고, 미충족이면 milestone은 `complete`가 아니다. 처방은 Step 3 프롬프트 재작성이며 그 축은 M1의 severity 계약이 같은 방식으로 성공한 선례가 있다 |
| P0 파일 3곳을 여는 것이 M1·M2가 두 번 지킨 원칙을 무너뜨린다 | Medium | DD2가 **무엇이 달라졌는지**로 근거를 세운다 — M1·M2의 미이행은 선택적 편의였고 M3의 셋은 지표 산출과 거짓 주장 제거에 적재적이다. 동결 시그니처는 하나도 안 바뀌고(프로토콜 2 추가 · 동결 표에 없는 함수 · receipt 계층 열거), 교집합 ∅는 9개 santa 경로에 대한 주장이라 유지된다. Validation의 P0 접촉 경계 스크립트가 선언 밖 변경을 red로 잡는다 |

<details><summary>+7 more</summary>

| Risk | Likelihood | Mitigation |
|---|---|---|
| `--prev-fix-rev` 임시 파일이 유실·오염돼 잘못된 patch 범위로 판정 | Low | DD4 — 부재·불량 rev·비영점 `git show`·파싱 0건이 전부 `unknown`으로 흡수되고 미발화다. 잘못된 **유효** rev(다른 커밋)를 넘기는 경우만 남고, 그때도 전량 조건이 걸린다. 다른 slug 루프에 의한 교차오염은 DD4의 `<slug>` 네임스페이싱이 **구조적으로** 막고 항목 86이 격리를 잰다 |
| 종료 마커가 결속을 잃어 "언젠가 종료했다"는 영구 낙인이 된다 | Low | `ledger.terminate`가 `beginRound` 거부 분기와 **같은 결속 규칙**(`rounds === rounds.length`)을 쓰고, `beginRound`가 라운드를 열 때 마커를 지운다. 항목 78이 다섯 경우를 고정 |
| `seal.buildProof` 술어 일반화가 캡 경로의 기존 동작을 바꾼다 | Low | `cap_reached`에서 `exitReason !== null`은 여전히 참이라 캡 경로의 `l1`은 무변경이다. 항목 79가 두 경로(cap·patch_chasing)와 converged 투영을 함께 고정 |
| Step 4.5가 산문으로만 존재해 실행되지 않는다 | Medium | DD7의 두 번째 배선 — `begin-round`가 마커를 조회해 기계적으로 막는다. 항목 77이 셸 분기의 **존재**를 if/fi 깊이로 단언한다(M2 R3이 잡은 "캡처만 하고 분기 없음"과 같은 형태) |
| `locations` 추가가 `structured` 계산을 건드려 blocking 자격을 바꾼다 | Low | DD3 — `evidence` 선례대로 타입 위반이 강등 없이 null이고 `structured` 식은 무변경이다. 항목 67이 M1 기대값과의 동일성을 고정 |
| 공유 표면(`santa-loop.md`·`cli.js`)에서 P2/P3 편집과 머지 충돌 | Medium | §3.5.1 — 커밋 직전 `git diff --diff-filter=D`로 반대편 신규 파일 삭제를 확인한다. 현재 P2·P3는 미착수라 창이 좁다 |
| 캡 이름 결정(DD8)이 PRD 문언을 폐기하는 것이라 사용자 의도와 어긋날 수 있다 | Low | UI15가 요구한 것은 "어느 쪽을 고칠지 정하라"이지 특정 방향이 아니다. 근거 셋(배송된 canonical · 조용한 설정 무효화 · 좁힌 범위가 진행 중 루프를 즉시 끝냄)을 PRD에 남겨 뒤집을 수 있게 한다 |
| M3이 쓴 `patch_chasing` 마커를 M2 코드가 읽으면 `SANTA_LEDGER_CORRUPT`로 던진다 | Low | DD2 — fail-closed의 정상 동작이고 원장이 gitignored라 노출 창은 "같은 워크트리에서 plugin cache를 되돌린 경우" 하나다. `SCHEMA_VERSION`을 올려 반대 방향을 깨는 것이 훨씬 크다(M2가 쓴 진행 중 원장 전멸) |
| 쓰기 열거만 넓히고 `assertTerminationMarker`를 빠뜨려 원장이 읽기 불가가 된다 | Medium | 두 자리를 **같은 상수 집합**에서 파생시키고(Task 4), 항목 81이 그 동기를 단독으로 잰다 — 읽기 쪽을 빠뜨리면 그 항목만으로 red다 |

</details>

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes (커버리지 스크립트 성공 종료 — 상한이 M2·M3 두 표에서 파생되고 각
      항목에 assert 1개 이상 + 동결 시그니처 무변경 + terminator 4종·`ledger.terminate` 존재 +
      **P0 접촉이 선언된 3파일뿐** + 소유권 교집합 ∅ + receipt corpus invalid 0 +
      **세 파일 constellation 정합의 정적 검사**(읽기·쓰기가 같은 상수 · seal 술어 일반화 ·
      schema 열거 2종 · kill-switch 정확히 2자리) + **(B) 실 경로 발화의 파일 증명**)
- [ ] Patterns mirrored, not reinvented (hunk 파서는 선례 없음을 명시하고 항목 68이 진짜
      `git show` 출력으로 재며, Validation의 **구조 요구**가 그 출처를 기계로 고정한다 —
      존재+assert만 검사하면 합성 diff 문자열로 그 항목을 만족시킬 수 있다)
- [ ] **(A) 미발화 경로 실 경로 완주** — Task 8 (A): 라운드 0에서 Step 4.5가 실행되고
      `terminate:false` + `reason`이 `round < 1`을 지목하며, M2까지의 루프 동작에 회귀가 없다
- [ ] **(B) 발화 경로 실 경로 관측** — Task 8 (B) 1~5: 종자 패치 probe에서
      `check-termination`이 `patch_chasing`을 내고, 마커가 결속돼 기록되며, `begin-round`가
      exit 2로 거부하고(캡 미소모), seal이 `layers.l1='divergent'` +
      `santa_exit_reason='patch_chasing'`으로 봉인되고, `off`로 재개된다. **조건절이 없다** —
      이 항목이 체크되지 않으면 milestone은 `complete`가 아니며 PRD Milestone 3 행을
      `complete`로 바꾸지 않는다. 관측되지 않으면 probe 각 라운드의 실측값을 PRD Open
      Questions에 남긴다. **합성 리뷰어 JSON으로 대체하지 않는다**. **이 항목은 체크박스가
      아니라 Validation의 마지막 스크립트가 기계로 검증한다** — `.claude/reviews/
      santa-review-santa-adjudication-m3-probe.md`의 `exit reason`이 `patch_chasing`이어야
      green이다. M1·M2가 각각 (B)를 미충족한 채 종료한 이력이 있으므로(M1 이연 · M2 운영자
      override) 같은 구조를 세 번째로 문장에만 맡기지 않는다
- [ ] **(B) 미충족 시 원인이 진단으로 남는다** — L2 test 관점 F4가 지적한 긴장(`locations`는
      선택 필드인데 (B)는 무조건부다)에 대한 답이다. `locations`가 선택인 것은 유지한다
      (필수로 만들면 위치 표기 오류 하나가 실재 blocking을 지운다 — DD3). 대신
      `targetsBreakdown`과 전량-`unknown` stderr가 **"설계상 정상 미발화"와 "리뷰어가 필드를
      안 채웠다"를 가른다**(항목 84). 후자면 처방은 임계 완화가 아니라 Step 3 프롬프트
      재작성이고, M1이 severity 계약에서 같은 축을 성공시킨 선례가 근거다(3라운드 전부
      `contract: full`). **그 재작성은 M3 자신의 Task 5가 소유한 파일이므로 (B)는 외부
      당사자에 막히지 않는다** — 미충족은 "milestone이 끝났는데 증명이 없다"가 아니라
      "Task 5를 한 번 더 손봐야 한다"는 뜻이고, 그 되먹임이 닫히는 것이 M3의 완료 조건이다
- [ ] PRD의 캡 이름·범위 Open Question이 DD8의 결론과 근거로 닫히고, `issue_id` 파생 축이
      새 Open Question으로 등재됐다

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~65k · 예약 4/4
정합 종료(`delta:0`).

CRITICAL 1 · HIGH 8 · MEDIUM 24 · LOW 1이 나왔다. §3.14대로 **CRITICAL·HIGH만 그 자리에서
흡수**하고 나머지는 backlog로 보낸다. 아래 표는 CRITICAL·HIGH 전건의 판정이고, 기각한 두
건은 근거를 file:line으로 남긴다(§3.14의 기각 증거 의무). 형식은 M2 plan의 같은 절을 따른다 —
생성 원문 전량(27.5k자)을 싣지 않는 것은 그 절이 세운 선례이고, 판정되지 않은 항목이 남지
않게 **전건을 아래에 표시**한다.

| Finding | 이 plan의 응답 |
|---|---|
| **[CRITICAL][architect]** `targets`가 스키마 없음 — finding에 file:line 구조가 없다 | **DD3 신설**로 흡수. 입력 `locations`(리뷰어, 선택)와 계산 결과 `targets`(집계, 열거 3종)를 이름부터 가른다. PRD 문언의 `targets: round_N_patch`는 **계산된 분류**이지 위치가 아니라는 것이 그 절의 첫 문장 |
| **[HIGH][architect]** exit reason 열거가 `cap_reached` 단일로 동결 — `assertTerminationMarker`가 그 값만 통과시킨다 | **가장 실질적인 지적. DD2 말미 + Task 4를 전면 개정해 흡수.** 쓰기만 넓히면 마커 직후의 첫 `read()`가 `SANTA_LEDGER_CORRUPT`로 던져 원장이 통째로 읽히지 않는다 — 배송 불가가 되는 절반짜리 변경이었다. 읽기·쓰기를 **같은 상수 집합**에서 파생시키고 항목 81이 그 동기를 단독으로 잰다 |
| **[HIGH][architect]** terminator 배치 미정 — 집계는 `seal.js`인데 거기엔 git이 없고 `gate.js`는 순수다 | **DD7**로 흡수. 판정은 `terminator.js`(순수) · I/O는 `cli.js` · 배선은 Step 4.5와 `begin-round` 두 지점이고, 두 번째는 마커 **조회**라 git이 필요 없다 |
| **[HIGH][architect]** `entries[]`가 미구현이고 M2 경계가 불명확 | **사실 오인 — 기각.** M2가 이미 배송했다(`adjudication.js` export 6종 · `cli.js:600` `cmdAdjudicate` · `cli.js:392` coverage 게이트 · 커버리지 26~60). explorer가 같은 사실을 정확히 보고했다("M2 already exists and should be extended, not reinvented"). M3은 `entries`를 **읽지도 쓰지도 않는다** — 종료는 `state.terminated`이고 판정 행이 아니다(DD1) |
| **[HIGH][security]** `record --id A` 재기록으로 dual-review 우회 | **사실 오인 — 기각.** M2가 닫았다(`cli.js:520-526` `SANTA_REVIEWER_DUPLICATE_ID` + 커버리지 53). 근거로 인용된 `ledger.js:482` 주석이 **stale**이고, 그 주석 정정을 backlog에 남긴다(코드가 아니라 문서 드리프트) |
| **[HIGH][test]** exit_reason 열거를 정의하지 않은 채 "분포를 잰다"고 한다 | **DD1에 열거 표 3행을 신설**해 흡수 — 부재/`cap_reached`/`patch_chasing`. 두 값의 배타성은 DD5의 `capAllowsAnotherRound` 항이 유지한다 |
| **[HIGH][test]** terminator 조건을 fixture에서 **강제**하는 방법이 없다 | **Task 8 (B)로 흡수** — 종자 **패치** probe(두 커밋: 결함 주입 + 불완전 수정)로 전량 `round_n_patch`를 성립시킨다. M2가 종자 결함 probe로 같은 문제를 푼 선례를 따르되 종자를 *패치*에 둔다 |
| **[HIGH][test]** "신규 blocking 0"과 "blocking 0"을 구별하지 않는다 | **DD5의 `length > 0` 항**으로 흡수(빈 배열에 `every`가 참이 되는 자리). 항목 70이 단독으로 잰다 |
| **[HIGH][explorer]** `targets` 스키마는 P3 소유이므로 M3이 정의하면 안 된다 | **PRD 오독 — 기각.** PRD L58은 "**단** terminator의 `targets` 필드는 P3가 **소비**하므로 스키마를 **여기서 확정한다**"이다. P3 소유는 델타 스코프이고 `targets` 확정은 명시적으로 M3이다(UI11이 그 문장을 그대로 옮겼다) |
| **[HIGH][explorer]** I1·I3 회귀 test가 acceptance에 있어야 한다 | **항목 83 신설**로 흡수 — Step 3에 종료 판정 토큰 부재 + M1 severity 계약 문언 무변경을 절 경계 단위로 단언 |
| **[HIGH][explorer]** 캡 게이트와 같은 자리·같은 구조(exit·seal·load-bearing `exit`)를 쓸 것 | **Task 5 (3)으로 흡수** — Step 4.5가 캡 거부 블록의 3단 규약을 그대로 쓰고 항목 77이 분기 **존재**를 if/fi 깊이로 단언한다. 다만 자리는 Step 3이 아니라 **Step 4.5**다: 라운드 N의 blocking을 봐야 판정할 수 있으므로 Step 3(리뷰어 발화 전)에는 입력이 없다. `begin-round` 쪽은 그래서 재판정이 아니라 마커 조회다(DD7) |

<details><summary>흡수한 MEDIUM 2건과 backlog로 보낸 나머지</summary>

같은 편집 자리를 지나는 두 MEDIUM은 흡수했다.

| Finding | 응답 |
|---|---|
| **[MEDIUM][architect]** lock 안에서 git을 부르면 임계구역이 프로세스 spawn만큼 길어진다 | **DD4 말미**로 흡수 — 순서를 `git → 분류 → 판정 → terminate`로 고정하고 임계구역은 마커 대입 하나로 둔다 |
| **[MEDIUM][test]** `locations` 없는 legacy 원장에서 terminator가 죽지 않아야 한다 | **항목 82 신설**로 흡수 — M1/M2 형태 envelope만 담긴 fixture를 미리 심어 전량 `unknown` → 미발화를 단언 |

backlog로 보낸 것(`.claude/plans/codex-findings-backlog.md`): 패러프레이즈 한계 재지적(M2 DD5가
이미 소유·PRD Open Question 등재됨) · `entries` TOCTOU(M2 DD1이 흡수 결정) · evidence의
그럴듯한 거짓(M1 DD5 한계 명시) · `chmod` 창(P0 저장 계층) · `schema_version` 미bump(DD2가
방향과 근거를 적음) · `ledger.js:482` stale 주석 정정 · receipt에 판정 내역 필드 추가(M2 DD12가
"읽는 코드 0개"로 거부) 등.

**채택하지 않은 patterns-to-mirror 하나**: architect가 `EX_TERMINATOR_MATCH=13` 신규 exit code를
제안했으나 `docs/santa-loop/ownership.md` §CLI exit code가 "자식 PRD는 신규 code를 만들지
않는다"를 명시하므로 거부한다 — `SANTA_TERMINATED`가 기존 `SANTA_*` → exit 2 매핑을 탄다.

</details>

## Design Critique

`impeccable-detect` 결과: `skill_available=true` · `design_signal=true` ·
`signal_files=["<keyword:design>"]`. 신호원은 렌더링 표면이 아니라 **본문의 "design" 키워드**
(`## Design Decisions`)이므로, 이 plan에는 실제 UI 표면이 없다. 그럼에도 detector가 positive인
이상 §3.9의 SKILL first-step + critique retry loop을 그대로 돌렸다 — 트리거가 OR이고 우회
경로를 만들지 않는 것이 그 절의 요점이다.

`frontend-design-direction/SKILL.md` `## Output Constraints` 4항을 Read한 뒤 문서 표면에
적용했다. cap 2, 2회 호출(R0 · R1).

| Round | Verdict | 흡수 |
|---|---|---|
| R0 | ESCALATE_NEXT_ROUND | **H3(raw markdown marker) HIGH 5건** — 닫는 `**` 앞이 구두점(`"`·`)`)이고 뒤가 한글 조사라 CommonMark right-flanking 조건을 만족하지 않아 **닫히지 않고 리터럴로 샌다**. 5건 전부 강조 범위를 조사까지 넓히거나(`**Task 8 (B)로 흡수**`) 인용부호만 남기는 방식으로 교정 |
| R1 | CONVERGED | 잔여 2건은 **여는** 구분자(`"**전부**`)라 left-flanking이 성립하고 짝이 정상 종료한다 — 위반 아님 |

H1(heading depth ≤ 3) 0건 위반 · H4(list-of-N 상한) Risks와 fan-out 두 절이
`<details><summary>+N more</summary>` 규약을 따른다 · H2(강조색)는 문서 표면에 해당 없음.

**커버리지 표(23행)와 User Intent 표(19행)는 접지 않는다** — H4가 지목하는 것은 Open
Questions·action items·risk table이고, 이 둘은 화면이 아니라 **기계가 읽는 계약**이다
(Validation 스크립트가 `/^\| (\d+) \|/gm`으로 상한을 파생한다). M2 plan이 같은 두 표를 펼친
채 CONVERGED를 받은 선례를 따른다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 **어떤
impeccable 명령도 호출하지 않는다** — 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| polish | `/impeccable polish` |

<details><summary>+17 more (refine · simplify · harden · system)</summary>

| Stage | Command |
|---|---|
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| system | `/impeccable document` · `/impeccable extract` |

</details>

본 milestone은 `plugins/mccp/scripts/lib/santa/*`와 커맨드 본문만 만지고 렌더링 표면
(`renderer/*.js`·`status.html`)을 건드리지 않으므로, implement 단계에서도 refine/discovery는
`renderingSurface=0` 강등 대상이다.

## Codex Adversarial Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)

이 milestone의 적대적 검토는 Codex가 아니라 **L2 반증 패널 11라운드(R0~R10)**가 수행했다.
R0~R4는 이전 세션, R5~R10은 2026-08-17 세션이고, 라운드 기록은 git-tracked
[plan-review-santa-adjudication-m3.md](../reviews/plan-review-santa-adjudication-m3.md)(최종
라운드) + [codex-findings-backlog.md](codex-findings-backlog.md)(라운드별 기각·이연 근거)에
남는다. 흡수한 지적은 본문 편집 자리마다 `L2 R<n> <관점> <severity> 흡수`로 인용돼 있다.

R5~R10 6라운드의 흡수는 전부 실질이었다 — CRITICAL 3건(Validation이 Task 지시를 거부해
Acceptance가 구조적으로 불가 · DD5가 존재하지 않는 필드를 읽어 terminator 영구 미발화 ·
읽기 자리와 라운드 번호 미명세로 같은 조용한 미발화) + HIGH 5건. **R10은 흡수할 지적이 0건인
첫 라운드**다.

그럼에도 게이트는 divergent로 남았고 그 원인은 plan이 아니라 리뷰 층의 알려진 결함 둘이다:
`mccp:review-test`의 범주 오류(plan이 산출하기로 선언한 파일의 부재를 결함으로 보고 — 6회
재발, R10 blocking 4건 전량) 와 `quorum.js:175-181`이 bare `verdict='fail'`을 `severity:'FAIL'`
blocking으로 합성하는 누수(CLAUDE.md §3.14가 해제 조건으로 지목 — 4회 실측). 후자 탓에
§3.14의 라운드 판정("자기 최고 severity가 MEDIUM 이하인 fail은 수렴으로 본다")을 게이트에
반영할 env 레버가 없다 — `MCCP_PLAN_REVIEW_QUORUM` 하향은 `blockingFindings.length > 0`이
독립 차단 사유라 효과가 없다(코드 확인). 두 결함의 처방은 backlog가 소유한다.

운영자 판정(2026-08-17): 패널 기록을 증거로 남기고 `MCCP_PLAN_REVIEW=codex` 경로로 receipt를
발행한다. env 정책상 Codex는 비활성이므로 verdict는 `skipped`(+`codex_disabled` proof)로
봉인되며 **승인을 주장하지 않는다**. cross-gate dedupe는 fail-closed를 유지하므로 PR-Codex는
ship 시점에 실제로 발화한다.

