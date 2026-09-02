# Plan: Multi-Session Work Loop M8 — 측정 부채 상환

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M8 — 측정 부채 상환 (A1 · A2 · B3 · C2/C3 귀속 스캐폴드)
**Complexity**: Large

## Summary

M2가 "배송했다"고 선언한 지표 producer 중 프로덕션에서 한 번도 발화하지 않은 것들을 실제로 배선한다. GROUND 결과 PRD가 적은 것보다 원인이 단순하고 나빴다 — A1 착수·A2 종료·B3 사용이력 세 축의 producer가 **같은 한 줄** 때문에 전부 죽어 있었다. `observer-sessions.resolveSessionId()`가 이 하네스에 존재하지 않는 `CLAUDE_SESSION_ID`만 읽어 빈 문자열을 반환하고, 그 값이 falsy라서 `session-start.js`/`session-end.js`의 M2 계측 블록 **전체**가 실행된 적이 없다.

M8은 그 뿌리를 단일 해소기로 닫고, A1의 분모를 계약(작업 단위)에 맞게 정정하며, A2에 세션 바인딩을 부여하고, B3의 분자 우주와 분모 우주를 기계적으로 일치시킨다. C2/C3은 label-protocol이 산출을 금지했으므로 **값이 아니라 귀속 기록만** 세운다. 게이트를 하나도 추가하지 않고 LLM 호출도 늘리지 않는다.

## Producer Preflight

PRD Risks 표가 milestone 착수 시 필수로 요구하는 검사다 — *"이 milestone이 의존하는 지표의 producer가 프로덕션에서 산출하는가"*. M8은 그 검사 자체를 대상으로 삼는 milestone이므로 답은 정의상 **아니다**. 다만 "없다"로 끝내면 M4·M7이 그랬듯 범위가 예측 불가해지므로, **어디까지 없는지를 실측해 적는다**.

| 축 | 프로덕션 산출 여부 | 실측 근거 (2026-08-25) |
|---|---|---|
| A1 착수 | **부재** | 트리 전체(main + worktree 4개) msw-events 파일 13개 · 이벤트 116건을 전수 집계한 결과 kind는 `evidence_guard_active` **한 종류뿐**이다. `session_start`·`session_end` **0건**. 따라서 `task_startups_count`가 0이고 `computeA1`은 `forward-only` (`plugins/mccp/scripts/lib/msw-metrics/index.js:126`) |
| A1 완주 | **부재** | `task_completed` KIND를 emit하는 호출자가 0건. `session-end.js:369`는 `task_completed: false`를 `session_end` 이벤트 필드로 실을 뿐이고, `derive/sources/session-activity.js:157`이 세는 것은 **별도 KIND 이벤트**다 — 그 KIND는 어디서도 발화하지 않는다 |
| A1 분모 의미 | **계약 위반** | `measurement-design.md` §A1(FROZEN)은 분모를 "착수 이벤트가 기록된 **작업 단위** 전수"로 고정했는데, `derive/sources/session-activity.js:186-190`은 `session_start`를 가진 **세션 수**를 센다. 세션과 작업 단위는 1:1이 아니므로(PRD가 없애려는 문제 자체가 "한 작업이 여러 세션에 걸친다"이다) 현재 비율은 계약이 정의한 값이 아니다 |
| A2 세션 바인딩 | **부재** | `session-end.js:359`가 `contextRemainingPct = null`을 **하드코딩**한다(m2-honesty-downgrade). `context-state.js:30-44`의 스냅샷 스키마에 `session_id`가 없어 귀속을 검증할 수단이 실제로 없다 — 주석이 "session-bound context가 구현되면 여기 read를 복원하라"고 남겨둔 자리다 |
| B3 분자 corpus | **부재** | `*.env-snapshot.json` = 트리 전체 **0건**. M4 Task 6이 `stateDir` 경로 결함을 고쳤고(v1.23.5, 설치 캐시 1.30.0에 포함됨) 그럼에도 0인 이유는 경로가 아니라 위 A1과 **같은 뿌리**다 — 블록 자체가 실행되지 않는다 |
| B3 분자 커버리지 | **구조적 공백** | 분모 집합(123)과 분자가 셀 수 있는 집합(`TOGGLE_DEFAULTS`, 117)이 다르다. 분모에만 있는 **7개**는 영원히 분자가 될 수 없고, `TOGGLE_DEFAULTS`에만 있는 `CODEX_DEDUPE_AT_PR` 1개는 분모 밖을 센다. `toggle-snapshot.js:266-271`이 이 모순을 이미 감지해 표면화하며 주석에 "numerator 정합은 M8 소관"이라 적어 두었다 |
| C2/C3 귀속 | **부재** | `gate_decision_id` → `finding_id` → `remediation_pr` 삼각 중 `finding_id`만 존재한다(M7 findings-registry). `gate_decision_id`는 레지스트리 allowlist에 없고, ship receipt(`meta` 60여 키)에도 completion-ledger 엔트리에도 **PR 번호가 없다** |

**동시에, 이 표에 없는 것은 M8이 손대지 않는다.** A4(경계 복원)와 B2(동시 충돌)도 forward-only지만 각각 M5·M3 소관이고 PRD의 M8 열거에 없다. 아래 Task 1의 해소기 수정이 A4의 producer(`handoff-items`)를 **부수적으로 되살리지만**, M8은 A4의 전환을 주장하지 않는다 — 관측되면 그 사실만 note에 기록한다. A3는 현재 `insufficient`("CLAUDE.md changed since the A3 measurement")인데 이 역시 M4 축이며, M8이 CLAUDE.md를 편집하므로 재측정해도 다시 낡는다. 재측정하지 않고 Risks에 남긴다.

## User Intent

<!-- USER-STATED constraints only. PRD는 운영자와 공동 작성된 문서이므로 그 안의
     freeze·금지·수용 조건은 사용자 발화로 취급한다. 저자 정당화는 아래
     Design Decisions에 둔다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 작업 단위 1개는 PRD milestone 1개이자 plan 1개이자 PR 1개이며 착수 후 재정의·세분화할 수 없다 | constraint |
| UI2 | 지표 status가 computed로 뒤집히는 것만 완료 근거이며 코드 존재는 판정 근거가 아니다 | constraint |
| UI3 | 착수 이벤트는 최초 지시 시점에 기록하며 늦게 기록하면 완주율이 부풀려진다 | constraint |
| UI4 | Codex 이중 검사와 증거 chain, dual-review 불변식은 이번 주기에 그대로 유지한다 | exclusion |
| UI5 | 계측에 추가 LLM 호출을 도입하지 않고 이벤트는 구조화 데이터로만 기록한다 | constraint |
| UI6 | 토글 제거는 삭제가 아니라 default 고정으로만 인정하고 동작 분기 수를 함께 계수한다 | constraint |
| UI7 | 토글 제외는 이름을 규범 문서에 적을 때만 유효하며 범위를 조용히 좁히는 것은 금지한다 | constraint |
| UI8 | C2와 C3은 관측 전용이며 측정 설계가 검정력을 보이기 전까지 의사결정에 사용하지 않는다 | exclusion |
| UI9 | measurement-design과 label-protocol의 분모와 판별 기준은 계약층이며 사후 변경 금지다 | constraint |
| UI10 | 환경 토글 축의 단조 증가는 해악이므로 은퇴 절차 없는 축 도입을 경계한다 | constraint |
| UI11 | 지표는 기존 대시보드 표면에서 추세와 함께 조회 가능해야 한다 | constraint |
| UI12 | 지표별 매 측정 주기 5건을 사람이 원자료와 직접 대조하고 표본 기록을 남긴다 | constraint |
| UI13 | 팀 협업과 다중 사용자 동기화, 원격 분산 세션은 이번 PRD의 범위 밖이다 | exclusion |
| UI14 | 축 은퇴는 사용 이력이 쌓인 뒤의 별도 주기이며 이번 milestone은 producer를 고치는 데까지다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 세션 식별 | `plugins/mccp/scripts/lib/orchestration-runaway.js:548` | 같은 결함의 선례 — 이 저장소는 이미 한 번 `CLAUDE_SESSION_ID`가 CLI에 없음을 발견하고 `MCCP_SESSION_ID` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID` 우선순위로 고쳤다. 주석이 실패 양상까지 적어 두었다 |
| 단일 진실원 | `plugins/mccp/scripts/state/toggle-snapshot.js:12` | 세 번째 진실원을 만들지 않는다 — 리터럴 표를 레지스트리 **투영**으로 바꿔 "셋이 서로를 모르므로 조용히 갈라진다"를 구조적으로 차단한 선례 |
| 정적 부재 단언 | `plugins/mccp/scripts/lib/env-contract/lint.js` L10 역방향 | 이름이 특정 파일 밖에 **없어야 한다**를 스캔으로 단언하는 형태 (`plan.md` 5.2z의 runner 소스 0회 등장 단언과 같은 축) |
| Sidecar writer | `plugins/mccp/scripts/state/msw-events.js:36` | append-only allowlist · per-field 256자 cap · per-line 8KB cap · malformed per-line skip. 새 축을 기록하려면 allowlist를 **먼저** 넓혀야 한다 |
| 소스 degraded | `plugins/mccp/scripts/derive/sources/toggle-usage.js:46` | drift를 계산만 하고 버리지 않는다 — 분모를 내는 바로 그 자리에서 `degraded:true` + 사유를 실어 소비처까지 닿게 한다 |
| 지표 반환 shape | `plugins/mccp/scripts/lib/msw-metrics/index.js:126` | `status` · `integrity_ok` · `invalid_reason` · `coverage` 4축을 항상 채우고, producer 부재를 `computed 0%`로 위장하지 않는다 |
| Coverage gate | `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js` · `b2-coverage-gate.js:36` | 승인 emit 지점 레지스트리 + 정적 lint + `--acceptance` opt-in 판정. 위협 모델의 정직한 한정을 함께 적는다 |
| 단언 매니페스트 | `plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js:31` | `REQUIRED_IDS` 하한 하드코딩 + manifest 항목의 `test()` 앵커 실재 대조. 대조기 자신도 test된다 |
| 전후 스냅샷 | `docs/multi-session-work-loop/m7-before.json` · `m7-after.json` · `m7-audit-sample.json` | 동일 스키마·동일 앵커로 전환 전후를 박제하고 UI12 감사 표본을 함께 남긴다 |

## Design Decisions

**DD1 — 뿌리는 하나이므로 해소기도 하나다.** `CLAUDE_SESSION_ID`를 단독으로 읽는 런타임 지점은 실측 12곳이고 그중 4개는 서로 다른 해소기를 각자 들고 있다(`observer-sessions` · `evidence-lock` · `orchestration-runaway` · `session-bridge`). 우선순위 체인을 새 모듈 `session-identity.js` **하나**로 옮기고 기존 해소기들은 그 체인을 소비한다. **정규화는 옮기지 않는다** — `evidence-lock`은 `null`을, `observer-sessions`는 `''`을 반환하며 호출자들이 그 차이에 의존하므로, 반환 계약을 통일하려 들면 M3 증거 락과 M8이 같은 커밋에서 섞인다. 옮기는 것은 **체인뿐**이고, 그것이 실제로 갈라졌던 유일한 축이다.

**변환 패턴은 기본값 표현식 교체 한 줄이다** (L2 R1 architect HIGH 흡수). "체인을 소비한다"와 "반환 계약 불변"은 긴장 관계가 아니다 — 바뀌는 것은 **default parameter의 표현식**뿐이고 arity·호출 형태·반환값은 그대로다:

```js
// observer-sessions.js:127 — before
function resolveSessionId(rawSessionId = process.env.CLAUDE_SESSION_ID) { … }
// after (arity 1 유지 · 무인자 호출부 전부 무변경 · sanitize + '' 반환 계약 그대로)
const { resolveRawSessionId } = require('./session-identity');
function resolveSessionId(rawSessionId = resolveRawSessionId(process.env)) { … }
```

기본값 표현식은 **호출 시점**에 평가되므로 모듈 로드 시점 env 캡처 문제가 없고, `session-start.js:705`의 `resolveSessionId()` 같은 무인자 호출부는 한 글자도 바뀌지 않는다. `getSessionLeaseFile`·`writeSessionLease`·`removeSessionLease`의 동일 기본값도 같은 방식이다. `evidence-lock.js:71` · `orchestration-runaway.js:558` · `session-bridge.js:136`은 이미 `env` 인자를 받으므로 본문의 3항 `||` 체인을 호출 한 번으로 바꾸고 각자의 정규화(`!=='unknown' ? s : null` / `'unknown'` fallback / trim)는 **그 자리에 남긴다**.

**잔여로 인정하는 것**: `resolveRawSessionId`는 sanitize하지 않으므로 raw 경로가 하나 열린다. 그 경로를 파일명에 쓰면 경로 주입이 되므로, **`session-identity.js`는 `resolveRawSessionId`만 export하고 파일명 생산 지점은 기존 `sanitizeSessionId`를 반드시 거친다**는 것을 Task 2의 스캔이 함께 단언한다(raw 반환값이 `path.join`에 직접 도달하는 호출부 0건). 구조적 보장이 아니라 test 보장이라는 한계는 그대로 기록한다.

**DD2 — 부재를 test가 단언한다.** 체인을 한곳으로 모으는 것만으로는 다음에 누가 `process.env.CLAUDE_SESSION_ID`를 다시 적는 것을 막지 못한다. `session-identity.js`와 명시 allowlist(레지스트리 선언·문서) 밖의 런타임 파일에 그 이름이 **등장하지 않음**을 test가 스캔으로 단언한다. env-contract L10 역방향의 형태를 그대로 빌린다.

**DD3 — A1 분모는 세션이 아니라 작업 단위다.** 이것은 계약 변경이 아니라 **계약 위반의 시정**이다. `measurement-design.md` §A1은 FROZEN 문서이고 이미 "작업 단위 전수"라 적혀 있다. 코드가 세션을 세고 있었을 뿐이다. 따라서 분모는 `task_started` 이벤트가 관측된 **distinct `work_unit`** 수이고, `work_unit`은 M3 evidence-claim이 이미 쓰는 decision slug와 **같은 키**다(새 키 체계를 만들지 않는다).

**DD4 — 착수는 hook이, 완주는 명령 본문이 기록한다. 그 비대칭은 의도적이다.** 착수(`task_started`)는 `receipt-prompt.js`(UserPromptExpansion, matcher `^mccp:.*`)가 emit한다 — 그 hook은 이미 `event.session_id`와 `deriveDecisionId(commandName, command_args)`를 **둘 다** 들고 있고(`:328`), `/mccp:*` 최초 발화 시점에 확실히 돈다. UI3의 "최초 지시 시점"에 기계가 도달할 수 있는 가장 이른 지점이다.

완주(`task_completed`)는 PR 번호가 있어야 성립하고, PR 번호는 `gh pr create` **이후**에만 존재한다. 그 뒤에 도는 코드가 없으므로 `/mccp:pr` Phase 5가 CLI를 호출한다. 산문 의존이라 빠질 수 있고 — 실제로 이 저장소의 산문 지시는 자주 불이행된다 — 그래서 방향을 고른다: **빠지면 분자가 준다(과소 계상)**. A1은 부풀리면 안 되는 지표이므로 과소가 안전한 방향이다.

**DD5 — 산문 누락을 침묵시키지 않는다.** ship receipt 봉인 시점(`lib/pr-phase-helpers/finalize-receipt.js`, 코드)에 `task_ship_sealed`를 emit한다. 이것은 **분자가 아니다** — 봉인 후 `gh pr create`가 실패하면 완주가 아니기 때문이다. 대신 `sealed_without_completion` 카운트를 A1 옆에 병기해, DD4가 남긴 산문 간극이 **관측 가능한 수치**가 되게 한다. 침묵하는 과소 계상과 보이는 과소 계상은 다르다.

**DD6 — A2의 바인딩은 새 텔레메트리가 아니라 기존 스냅샷의 귀속 필드다.** `ecc-context-monitor.js:288`은 이미 hook payload의 `input.session_id`를 갖고 있으나 `context-state.writeState`가 그것을 버린다. 스냅샷에 `session_id`를 실어 보존하고, `session-end.js`는 (a) 스냅샷의 session_id가 종료 중인 세션과 일치하고 (b) 샘플이 신선할 때에만 stamp한다. 둘 중 하나라도 아니면 **지금처럼 null**을 쓴다 — 강등을 되돌리는 것이 아니라 강등이 요구한 조건을 충족시키는 것이다. 값은 평균이 아니라 p50·p95로만 보고한다(§A2 계약).

**DD7 — B3는 제외 목록을 자동 파생하지 않는다.** 분모(정규식 스캔)와 분자 우주(`TOGGLE_DEFAULTS`, 레지스트리 파생)의 7건 불일치는 전부 레지스트리가 이미 `retired`/`test-only`로 분류한 **환경변수가 아닌 이름**들이다(JS 상수 3 · 주석 잔존 1 · 에러 코드 1 · 접두사 오탐 1 · test 전용 1). 그러나 제외를 레지스트리에서 **자동 파생**하면 미래의 레지스트리 편집이 분모를 조용히 줄일 수 있고, 그것이 UI7이 금지한 경로다. 따라서 이름은 `TOGGLE_EXCLUSIONS`와 `measurement-design.md` §B3 표에 **명시로 적고**, 대신 **집합 등식**(분모 집합과 `TOGGLE_DEFAULTS` 키 집합이 같음)을 기계 검사로 세운다. 등식이 깨지면 소스가 degraded되므로, 앞으로의 모든 불일치는 명시 편집으로만 해소된다.

`CODEX_DEDUPE_AT_PR`은 반대 방향이다 — `MCCP_` 접두 규약이 mccp 토글의 정의이므로(§B3 실행 규칙) 이 이름은 애초에 분모 우주 밖이고, 분자 표에서 빠져야 한다. 이것은 은퇴가 아니라 **분류 오류의 시정**이며, 은퇴 건수는 M8에서도 **0**이다(UI14).

**DD8 — C2/C3은 값을 만들지 않는다.** `label-protocol.md` §2.2와 §4.2가 "M2가 귀속을 전향 기록하기 전까지 산출하지 않는다"를 이미 확정했고 그 문서는 계약층이다(UI9). M8이 세우는 것은 기록뿐이고 두 지표는 `forward-only`에 **머문다**. 따라서 M8의 완료 판정에서 C2/C3은 UI2의 "computed로 뒤집힘"이 **적용되지 않는 축**이며, 대신 "귀속 레코드가 라이브에서 실제로 생성됐는가"로 판정한다. 이 예외를 plan에 명시하지 않으면 수용 조건이 충족 불가능해지거나 — 더 나쁘게 — 금지된 산출을 하도록 압력이 생긴다.

**DD9 — 새 env 토글 0개.** M8은 producer를 켜는 milestone이고 producer에 kill switch를 달면 그 순간 "지표가 꺼져 있었다"가 정상 상태가 된다(UI10 · M7의 `PROMOTE_MIN_SEVERITY` 상수 선례). 상한·신선도 창은 전부 **상수**로 두고 test 주입만 허용한다.

**DD10 — 설치 캐시 지연은 숨기지 않는다.** 실 세션의 hook은 워크트리가 아니라 `~/.claude/plugins/cache/mccp/mccp/<version>/`에서 돈다. 현재 캐시 최고 버전은 **1.30.0**이고 워크트리는 1.32.2다. 따라서 "다음 세션에서 자동으로 산출된다"는 머지 + `claude plugin update` 이후에만 참이다. 라이브 완주는 워크트리의 hook 스크립트를 **실제 payload로 직접 실행**해 증명하고, 캐시 지연은 한계로 note에 적는다. 이것을 적지 않으면 M8은 "코드가 있다"를 "산출된다"로 바꿔 부르는 milestone이 된다 — PRD가 M8을 만든 이유가 정확히 그것이다.

**DD11 — 신규 병기 축은 값 셀이 아니라 `coReportDetails()`에 둔다.** (design critique R0 · F1·F2 흡수)

`renderer/sections/msw-metrics.js`는 이미 이 규칙을 명문화하고 있다 — `formatValue`의 F3 주석("값 셀은 **한 지표만** 담는다")과 `coReportDetails`의 F2 주석("병기 수치는 값 셀이 아니라 여기 산다"). 값 셀 예외는 정확히 둘(B1 커버리지 · C1 이연률)이고 **둘 다 같은 근거를 갖는다**: 맨 숫자가 *다른 진술로 오독된다*는 것. M8이 더하는 세 축은 그 근거를 만족하지 않는다.

- `sealed_without_completion`은 **커버리지 축**이다. A1의 맨 백분율은 오독되지 않고, 이 수치가 말하는 것은 "분자 producer가 얼마나 덮였는가"이므로 `B3 상세:` · `B1 커버리지:`와 같은 계층이 정확한 자리다.
- C2/C3 귀속 커버리지를 값 셀에 붙이는 것은 **구조적으로 불가능**하다. `formatValue`는 `status === 'forward-only'`를 다른 어떤 분기보다 **먼저** 검사해 `'-'`를 반환하고, 그 조기 반환을 고치면 모듈 헤더가 선언한 "C2·C3 forward-only 정직 표기(값 미산출)"가 깨진다. 즉 이 축은 collapse 외에 갈 곳이 없고, 그것이 옳다.
- A2 표본 수도 같다 — percentile 분기는 `p50 X% · p95 Y%` 두 사실로 이미 차 있다.

부수 규약 셋을 함께 고정한다: (a) **새 collapse를 열지 않는다** — 단일 공유 `<details class="msw-metrics-extra">` 안의 한 원소로 들어간다(2단 중첩은 제약 4와 PRODUCT.md 원칙 3이 둘 다 거부한다). (b) 줄 순서는 **지표 id 순**으로 결정적이며, 늘어난 줄 수가 순서 없는 덤프가 되지 않게 한다. (c) 신규 문자열은 **em-dash 금지**, 구분자는 `·`와 괄호만(모듈의 M3 F4 카피 규칙). **신규 색 클래스 0개**(제약 2). 값 셀(`formatValue`)과 상태 컬럼은 **무변경**이다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/session-identity.js` | CREATE | 세션 id 우선순위 체인의 단일 진실원 (DD1) |
| `plugins/mccp/scripts/lib/observer-sessions.js` | UPDATE | 죽은 해소기를 체인 소비로 교체 — A1·A2·B3 producer를 되살리는 한 줄 |
| `plugins/mccp/scripts/receipt/evidence-lock.js` | UPDATE | 자체 체인을 `session-identity` 소비로 교체 (정규화는 불변) |
| `plugins/mccp/scripts/lib/orchestration-runaway.js` | UPDATE | 동일 — 이 파일의 주석이 선례를 이미 기록하고 있다 |
| `plugins/mccp/scripts/lib/session-bridge.js` | UPDATE | 동일 |
| `plugins/mccp/scripts/lib/utils.js` | UPDATE | `getShortSessionId`가 legacy 이름 단독 read |
| `plugins/mccp/scripts/hooks/cost-tracker.js` | UPDATE | 체인 소비 (`:131`) |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | 체인 소비 + `writeState`에 `session_id` 전달 (DD6) |
| `plugins/mccp/scripts/hooks/ecc-metrics-bridge.js` | UPDATE | 체인 소비 (`:193`) |
| `plugins/mccp/scripts/hooks/session-activity-tracker.js` | UPDATE | 체인 소비 (`:570`) |
| `plugins/mccp/scripts/hooks/post-edit-accumulator.js` | UPDATE | 체인 소비 (`:26`) |
| `plugins/mccp/scripts/hooks/stop-format-typecheck.js` | UPDATE | 체인 소비 (`:42`) |
| `plugins/mccp/scripts/hooks/suggest-compact.js` | UPDATE | 체인 소비 (`:37`) |
| `plugins/mccp/scripts/hooks/session-end-marker.js` | UPDATE | 체인 소비 (`:101`) |
| `plugins/mccp/scripts/hooks/gateguard-fact-force.js` | UPDATE | 체인 소비 (`:460`) |
| `plugins/mccp/scripts/lib/archive-complete/apply.js` | UPDATE | 체인 소비 (`:306`) |
| `plugins/mccp/scripts/lib/state-journal/record.js` | UPDATE | 체인 소비 (`:288`) |
| `plugins/mccp/scripts/derive/sources/state.js` | UPDATE | 체인 소비 (`:22`) |
| `plugins/mccp/scripts/state/msw-events.js` | UPDATE | allowlist에 `pr_number` · `gate_decision_id` 추가 (A1 완주 · C2/C3 귀속) |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | `task_started` emit (A1 분모, DD4) |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | `task_ship_sealed` emit (DD5) |
| `plugins/mccp/scripts/state/cli.js` | UPDATE | `msw-event emit` 서브커맨드 — 명령 본문의 유일한 emit 경로 |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 5에서 `task_completed` + `remediation_pr` emit (DD4 · Task 7) |
| `plugins/mccp/scripts/lib/context-state.js` | UPDATE | 스냅샷에 `session_id` 보존 (DD6) |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATE | 세션 일치 + 신선도 충족 시에만 context% stamp (DD6) |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATE | A1을 work_unit 키로 집계 · A2 샘플 수집 · `sealed_without_completion` 병기 |
| `plugins/mccp/scripts/state/toggle-snapshot.js` | UPDATE | 제외 7건 명시 추가 · `CODEX_DEDUPE_AT_PR` 분자 우주 제외 · 집합 등식 검사 (DD7) |
| `plugins/mccp/scripts/derive/sources/toggle-usage.js` | UPDATE | 등식 불일치를 degraded로 표면화 |
| `plugins/mccp/scripts/state/findings-registry.js` | UPDATE | allowlist에 `gate_decision_id` · `remediation_pr` 추가 (DD8) |
| `plugins/mccp/scripts/derive/sources/findings.js` | UPDATE | 귀속 커버리지 필드 집계 |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | `computeA1` 분모 정정 · `computeA2` 분위수 복원 · `computeB3` 커버리지 반영 |
| `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js` | CREATE | emit 지점 레지스트리 + 정적 lint + `--acceptance` (b2/c1 gate 거울) |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATE | 새 병기 축(귀속 커버리지 · sealed_without_completion) 표시 (UI11) |
| `plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js` | UPDATE | A1·A2·B3을 claimed-computable로 승격 |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | **두 번째 claimed-computable 목록**(`:246-250`). test 파일과 lockstep이 계약인데 이미 drift 중 — M7이 승격한 C1이 여기 없다 |
| `plugins/mccp/scripts/lib/tests/session-identity.test.js` | CREATE | 체인 단언 + legacy 이름 부재 정적 스캔 (DD2) |
| `plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js` | CREATE | emit 지점 · 분모 키 · A2 바인딩 거부 경로 회귀 |
| `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js` | UPDATE | 집합 등식 · 제외 표 1:1 · 은퇴 0건 단언 |
| `plugins/mccp/scripts/lib/tests/session-activity.test.js` | UPDATE | work_unit 집계 · 중복 착수 · sealed-without-completion |
| `docs/multi-session-work-loop/measurement-design.md` | UPDATE | §B3 제외 분류표에 7건 추가 (집행부와 1:1) |
| `docs/multi-session-work-loop/measurement-instrumentation.md` | UPDATE | producer 행 · 전환 조건 · 캐시 지연 한계 |
| `docs/multi-session-work-loop/m8-before.json` | CREATE | 전환 전 스냅샷 |
| `docs/multi-session-work-loop/m8-after.json` | CREATE | 전환 후 스냅샷 |
| `docs/multi-session-work-loop/m8-assertion-manifest.json` | CREATE | 단언 ↔ test 기계 대조 |
| `docs/multi-session-work-loop/m8-audit-sample.json` | CREATE | UI12 감사 표본 (지표별 5건) |
| `.claude/notes/multi-session-work-loop-m8.md` | CREATE | 게이트 산출물 · 라이브 완주 증거 · 한계 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | milestone 8 status + Plan 셀 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 — PRD 종료이므로 minor 후보, PR 진입 직전 재계산) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면) |
| `CHANGELOG.md` | UPDATE | 새 항목 |
| `CLAUDE.md` | UPDATE | 세션 식별 단일 진실원 절 (상주 판정은 instruction-contract lint가 검증) |

## Tasks

### Task 1: 세션 식별 단일 진실원 (뿌리)

- **Action**: `lib/session-identity.js`를 만들어 `resolveRawSessionId(env)` 하나만 export한다 — 우선순위 `MCCP_SESSION_ID` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID`. 위 표의 런타임 소비처 전부를 이 함수 소비로 바꾸되 **각자의 정규화·반환 계약은 건드리지 않는다**(DD1). `observer-sessions.resolveSessionId`가 첫 대상이다 — 그 한 줄이 A1·A2·B3 producer 전체의 차단기다.
- **Mirror**: `orchestration-runaway.js:548`의 체인과 그 주석의 실패 서술.
- **Validate**: 세 변수 조합 8가지에서 기존 4개 해소기의 반환값이 체인 이전/이후 동일함을 대조하는 test. 그리고 `node --test plugins/mccp/scripts/lib/tests/session-identity.test.js`.

### Task 2: legacy 이름 부재를 test가 단언 (DD2)

- **Action**: 런타임 표면(`plugins/mccp/scripts/**/*.js`, `*/tests/*`와 `*.test.js` 제외)을 스캔해 `process.env.CLAUDE_SESSION_ID`가 `session-identity.js`와 명시 allowlist(레지스트리 선언 행 등) 밖에 **0회** 등장함을 단언한다. 위반 시 이름과 file:line을 전부 열거한다.
- **Mirror**: `lib/env-contract/lint.js` L10 역방향.
- **Validate**: **자동 단언이 gate다** (L2 R1 test HIGH 흡수) — `session-identity.test.js`가 (a) 런타임 표면 스캔 결과 `process.env.CLAUDE_SESSION_ID` 등장 **0건**, (b) `resolveRawSessionId` 반환값이 `path.join`/파일명 생산에 직접 도달하는 호출부 **0건**, (c) 세 env 조합 8가지에서 4개 해소기의 반환값이 변환 전후 동일함을 단언한다. 셋 다 test 파일 안의 `assert`이고 사람 개입이 없다. 작성 시점에 한 번 legacy read를 심어 red를 확인하는 것은 **단언이 실제로 무언가를 잡는지에 대한 저자 확인**이지 gate가 아니다 — gate는 (a)~(c)다.

### Task 3: A1 착수 producer (분모)

- **Action**: `receipt-prompt.js`가 ALLOW/INFORMATIONAL 경로에서 `msw-events`에 `kind:'task_started'` + `work_unit:<decisionId>` + `session_id`를 append한다. **차단(block) 경로에서는 emit하지 않는다** — 게이트가 막은 것은 착수가 아니다. fail-open: append 실패는 loud stderr 후 hook 진행(UI4 — 게이트 동작 불변).
- **Mirror**: `session-start.js:774`의 append 형태 + `evidence-lock.js:293`의 fail-open 호출.
- **Validate**: hook payload를 stdin으로 주입해 직접 실행 → `.claude/state/msw-events/<sid>.jsonl`에 `task_started` 1행. 같은 work_unit으로 2회 실행해도 derive 분모가 1로 유지되는지(distinct 집계) 확인.

### Task 4: A1 완주 producer + 봉인 병기 (분자)

- **Action**: (a) `state/cli.js`에 `msw-event emit --kind <k> --work-unit <w> [--pr-number <n>]` 서브커맨드를 추가한다(allowlist 밖 키 거부). (b) `pr.md` Phase 5에서 `gh pr view --json number`로 얻은 번호로 `task_completed`를 emit한다. (c) `finalize-receipt.js`가 ship receipt 봉인 시 `task_ship_sealed`를 emit한다(분자 아님, DD5).
- **Mirror**: `state/cli.js`의 기존 서브커맨드 dispatch · `pr.md` Phase 5 블록 구조.
- **Validate**: 세 emit 경로를 각각 실행하고 `session-activity` 집계가 `task_completions_count`(distinct work_unit)와 `sealed_without_completion`을 분리해 내는지 확인.

### Task 5: A1 집계·지표 정정 (계약 위반 시정)

- **Action**: `session-activity.js`의 `task_startups_count`를 **distinct `work_unit`** 기준으로 재정의하고(세션 수 집계 제거), `completions_producer_present`를 `task_completed` 관측에서 파생한다. `computeA1`은 분모가 0보다 크고 producer가 present일 때만 `computed`이며, 시각 역전과 분할 의심 플래그는 기존 무결성 검사를 유지한다. `sealed_without_completion`을 병기 축으로 반환한다 — 렌더 배치는 값 셀이 아니라 `coReportDetails()`의 `A1 커버리지:` 줄이다(DD11).
- **Mirror**: `computeB1`(`index.js:353`)의 4축 반환 + `computeC1`의 유형 분리 병기.
- **Validate**: fixture로 (세션 3 · work_unit 2 · 완주 1) 코퍼스를 주입해 분모가 3이 아니라 **2**임을 단언.

### Task 6: A2 세션 바인딩

- **Action**: `context-state.writeState`가 `session_id`를 스냅샷에 보존하고(`readState`도 반환), `ecc-context-monitor`가 해소된 session id를 전달한다. `session-end.js`는 스냅샷의 `session_id`가 종료 세션과 일치하고 `context_ts` 신선도 상한(**상수**, DD9) 안일 때만 `context_remaining_pct`를 stamp하고 그 외에는 지금처럼 `null`. `computeA2`는 p50·p95를 반환하고 평균은 내지 않는다. 표본 수와 소표본 caveat은 값 셀의 percentile 분기를 건드리지 않고 `coReportDetails()`의 `A2 상세:` 줄로 낸다(DD11).
- **Mirror**: `context-state.js:47`의 `isOlderSample` 순서 판정 · `session-end.js:352`의 강등 주석이 명시한 복원 조건.
- **Validate**: (a) 일치 + 신선 → stamp, (b) 불일치 → null, (c) 신선도 초과 → null 세 경로 test. 표본 수를 값과 함께 보고하는지 확인.

### Task 7: C2/C3 귀속 스캐폴드 (값 아님)

- **Action**: `findings-registry` allowlist에 `gate_decision_id`(finding을 낳은 차단 판정)와 `remediation_pr`을 추가하고, M7이 이미 배선한 emit 지점들이 `gate_decision_id`를 함께 싣게 한다. `pr.md` Phase 5가 그 PR이 해소한 finding에 대해 `remediation_pr` 레코드를 append한다. `derive/sources/findings.js`가 귀속 커버리지(`with_gate_decision` / `with_remediation_pr`)를 집계한다. **C2·C3의 status는 `forward-only`로 유지**하고 값·목표를 만들지 않는다(DD8 · UI8). 커버리지는 `formatValue`(forward-only 조기 반환 `'-'`)를 **건드리지 않고** `coReportDetails()`의 `C2/C3 귀속:` 줄로만 낸다(DD11).
- **Mirror**: `findings-registry.js:71`의 allowlist 확장 규약("새 축을 기록하려면 이 집합을 먼저 넓혀야 한다") · `c1-coverage-gate.js`의 emit 지점 레지스트리.
- **Validate**: 귀속 레코드를 1건 생성한 뒤 커버리지 필드가 0이 아님을 확인하고, `metrics.C2.status === 'forward-only'`가 **유지**되는지 단언(승격 금지 회귀).

### Task 8: B3 분자 커버리지 (집합 등식)

- **Action**: 분모에만 있던 7개(`MCCP_DISABLE_VALUES` · `MCCP_EXPLORE_CONTROL_PLACEMENT` · `MCCP_IGNORE_BLOCK` · `MCCP_IGNORE_ENTRIES` · `MCCP_JOURNAL_DEGRADED_UNRECORDED` · `MCCP_PLAN_REVIEW_` · `MCCP_PLAN_REVIEW_TEST_INVOKE`)를 `TOGGLE_EXCLUSIONS`와 `measurement-design.md` §B3 표에 **명시로** 추가한다(각각 레지스트리가 이미 가진 file:line 근거를 옮긴다). `CODEX_DEDUPE_AT_PR`을 분자 우주에서 제외한다(`MCCP_` 접두 규약). `scanSurfaceDetailed`가 `numerator_coverage` 등식을 계산하고, 불일치를 `toggle-usage.js`가 `degraded:true` + 사유로 표면화한다. `raw_surface_count` · `excluded_count` · `denominator` 3중 보고는 유지하고 **은퇴 0건**을 명시한다(UI6 · UI14).
- **Mirror**: `derive/sources/toggle-usage.js:46`의 `exclusion_doc` drift 처리 · `toggle-snapshot.js:266`이 남긴 M8 인계 주석.
- **Validate**: 두 집합 차집합이 **양방향 공집합**임을 단언. 임의 이름을 한쪽에만 넣어 degraded가 실제로 발화하는지 확인.

### Task 9: coverage gate · 스냅샷 · 문서 · 릴리스

- **Action**: **claimed-computable 목록 2곳을 함께 승격한다** (L2 R1 test HIGH 흡수) — `msw-metrics-acceptance.test.js:87`의 `CLAIMED_COMPUTABLE`과 `derive/cli.js:246`의 `claimedComputable`. 후자의 주석이 스스로 "editing one without the other is the silent-promotion path this list exists to block"이라 적었는데 **이미 깨져 있다**: M7이 test 파일에 C1을 넣었고 cli.js에는 없다. M8은 A1·A2·B3 승격과 **함께 C1 누락도 닫고**, 두 목록의 집합 동일성을 test로 단언해 lockstep을 산문에서 기계로 옮긴다.
  `m8-coverage-gate.js`(emit 지점 레지스트리 + 정적 lint + `--acceptance` opt-in)를 만든다 — 승인 emit 지점 집합은 **정확히 5개**이고 각각 file:line으로 고정한다: `hooks/receipt-prompt.js`(`task_started`) · `commands/pr.md` Phase 5(`task_completed` · `remediation_pr`) · `lib/pr-phase-helpers/finalize-receipt.js`(`task_ship_sealed`) · `hooks/session-start.js`(`session_start` · env-snapshot) · `hooks/session-end.js`(`session_end`). 그 밖의 파일이 `msw-events.appendEvent`나 `state/cli.js msw-event emit`을 호출하면 gate가 붉어진다(b2/c1 gate의 승인 writer 레지스트리와 같은 형태).
  그리고 `m8-before.json` / `m8-after.json` / `m8-assertion-manifest.json` / `m8-audit-sample.json`을 남긴다. acceptance test의 claimed-computable 집합에 A1·A2·B3을 승격한다. 대시보드 섹션에 새 병기 축 3줄(`A1 커버리지:` · `A2 상세:` · `C2/C3 귀속:`)을 **`coReportDetails()` 안에 지표 id 순으로** 추가한다 — 값 셀·상태 컬럼·색 클래스는 무변경이고 새 collapse를 열지 않는다(DD11 · UI11). `measurement-instrumentation.md` · CLAUDE.md · CHANGELOG · PRD status · version 4면을 동기한다.
- **Mirror**: `c1-coverage-gate.js` 전체 구조 · `assertion-manifest-check.js:31`의 `REQUIRED_IDS` 하한 · M7의 전후 스냅샷 4종.
- **Validate**: 아래 Validation 전량 + 라이브 완주(Acceptance).

## Validation

```bash
# 단위 · 통합
node --test plugins/mccp/scripts/lib/tests/
node --test plugins/mccp/scripts/state/tests/
node --test plugins/mccp/scripts/derive/tests/
node --test plugins/mccp/scripts/receipt/tests/

# 단언 매니페스트 (요구한 test가 실재하는가) — --manifest 는 필수 인자다
node plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js \
  --manifest docs/multi-session-work-loop/m8-assertion-manifest.json

# M8 coverage gate — emit 지점이 전부 덮였는가 / 수용 조건 기계 판정(opt-in)
node plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js --json
node plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js --acceptance --json

# 뿌리 회귀 — legacy 세션 변수 단독 read 가 런타임 표면에 0건인가 (DD2)
node --test plugins/mccp/scripts/lib/tests/session-identity.test.js

# B3 집합 등식 — 양방향 차집합이 공집합인가 (DD7)
node -e "const ts=require('./plugins/mccp/scripts/state/toggle-snapshot');const s=ts.scanSurfaceDetailed(process.cwd());const den=new Set(s.toggles),num=new Set(Object.keys(ts.TOGGLE_DEFAULTS));const a=[...den].filter(n=>!num.has(n)),b=[...num].filter(n=>!den.has(n));if(a.length||b.length){console.error('B3 numerator coverage drift',{denOnly:a,numOnly:b});process.exit(1)}console.log('B3 coverage OK den='+den.size+' num='+num.size)"

# 지표 산출 — A1·A2·B3 이 computed 여야 한다 (UI2 완료 판정).
# C2·C3 은 forward-only 로 **유지**되어야 한다 (DD8 — 승격은 label-protocol 위반).
node plugins/mccp/scripts/derive/cli.js run --json
node plugins/mccp/scripts/derive/cli.js metrics-assert
node plugins/mccp/scripts/derive/cli.js render

# 라이브 산출물 실재 — unit test green 은 이 어느 것도 대신하지 못한다 (DD10).
# hook 은 설치 캐시(1.30.0)에서 도는데 이 코드는 워크트리에 있으므로,
# 워크트리 스크립트를 실제 payload 로 직접 실행해 증명한다.
#
# **두 단계로 나뉜다 (L2 R1 test HIGH 흡수).** `task_completed` 는 이 milestone
# 자신의 `/mccp:pr` 이 처음 발화시키므로, 커밋 전 실행에서 그것을 요구하면 검증이
# 구조적으로 실패한다. 순환은 실재하고 숨기지 않는다 — PRE 는 커밋 전 gate 이고
# POST 는 PR 생성 직후 1 회 실행해 note 에 결과를 붙인다.
#
# --- PRE (커밋 전 · 이 3 종은 지금 산출 가능해야 한다) ---
test -d .claude/state/msw-events
node -e "const fs=require('fs');const d='.claude/state/msw-events';const k={};fs.readdirSync(d).forEach(f=>fs.readFileSync(d+'/'+f,'utf8').split(/\r?\n/).filter(Boolean).forEach(l=>{try{k[JSON.parse(l).kind]=1}catch(_){}}));for(const need of ['session_start','session_end','task_started'])if(!k[need]){console.error('live producer missing (PRE): '+need);process.exit(1)}console.log('PRE live kinds:',Object.keys(k).join(','))"
ls .claude/state/*.env-snapshot.json >/dev/null
#
# --- POST (PR 생성 직후 1 회 · 결과는 note 에 기록) ---
# node -e "…same scan…; for (const need of ['task_completed','task_ship_sealed']) …"
# node plugins/mccp/scripts/derive/cli.js run --json   # A1 numerator 전환 확인

# UI12 감사 표본 대조 — 자동 산출값과 사람 판정이 일치하는가
node plugins/mccp/scripts/derive/cli.js run --json \
  | node -e "const fs=require('fs');let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s).metrics;const a=JSON.parse(fs.readFileSync('docs/multi-session-work-loop/m8-audit-sample.json','utf8'));const bad=(a.samples||[]).filter(x=>x.matches!==true);if(bad.length){console.error('audit sample mismatch',bad.length);process.exit(1)}for(const [k,v] of Object.entries(a.computed||{})){if(m[k].denominator!==v.denominator||m[k].numerator!==v.numerator){console.error('audit drift on '+k);process.exit(1)}}})"

# 회귀 — gitignore canonical drift · 지시 계약 lint · env-contract lint
node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
node plugins/mccp/scripts/lib/env-contract/lint.js

# 증거 감사 (ledger ↔ receipt 대조)
node plugins/mccp/scripts/lib/evidence-audit.js --json
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **세션 해소기 수정이 지금까지 no-op이던 코드 경로를 일제히 켠다** — lease 기록·handoff 복원·observer 정리가 처음으로 실행되며, 한 번도 실행된 적 없는 코드라 결함이 잠복해 있을 수 있다 | 높음 | 소비처가 유계다(`session-end-marker.js` lease 정리 · `derive/sources/state.js` · `session-end.js`). Task 1을 단독 커밋으로 두고, 켜진 직후 한 세션을 완주시켜 stderr WARNING 0건을 확인한 뒤 나머지 Task를 얹는다. 모든 신규 emit은 fail-open이라 실패해도 세션을 막지 못한다 |
| **A1 완주 emit이 산문이라 불이행된다** | 높음(실측 관행) | DD4가 방향을 과소로 고정했고 DD5가 `sealed_without_completion`으로 간극을 수치화한다. 침묵하는 누락이 없다는 것이 완화의 내용이며, "누락이 0"이라고 주장하지 않는다 |
| **A1이 이 주기 안에 `computed`에 도달하지 못한다** — 완주 신호의 첫 데이터는 이 milestone 자신의 PR 생성 시점에만 생긴다 | 높음 | 순환은 실재하며 숨기지 않는다. `m8-after.json`은 커밋 시점 상태를 그대로 박제하고, PR 생성 후 재실행 결과를 note에 별도 기록한다. 소급 backfill은 §A1이 금지하므로 하지 않는다(completion-ledger를 판정에 쓰는 것은 손상된 술어 재사용) |
| **A2가 표본 1건으로 `computed`가 되어 분위수가 무의미** | 중 | 값과 함께 표본 수를 항상 병기하고 소표본 caveat을 대시보드 병기 축에 싣는다. 목표 판정(p50 30% 이상)은 표본이 쌓인 뒤로 미룬다 — M8은 산출 가능성만 주장한다 |
| **B3 제외 7건이 분모 축소(게이밍)로 읽힌다** | 중 | 7건 전부 레지스트리가 이미 `retired`/`test-only`로 분류한 비-환경변수이고 각각 file:line 근거가 붙는다. `raw_surface_count`(133) · `excluded_count` · `denominator`를 3중 보고하며 **은퇴 0건**을 명시한다. 목표(40 이하)는 여전히 멀다 |
| **설치 캐시(1.30.0)가 워크트리(1.32.x)보다 낡아 라이브 증거가 캐시 동작을 증명하지 못한다** | 확정 | DD10 — 한계로 기록하고, 라이브 완주는 워크트리 스크립트 직접 실행으로 증명한다. 머지 후 `claude plugin update` 필요를 note와 CHANGELOG에 적는다 |
| **C2/C3 스캐폴드가 값 산출 압력으로 이어진다** | 중 | DD8 + `metrics.C2.status === 'forward-only'` 유지를 회귀 test로 단언한다. 승격은 label-protocol 개정을 거쳐야 하며 M8의 권한 밖이다 |
| **findings-registry allowlist 확장이 M7 소비처를 깨뜨린다** | 중 | 추가만 하고 기존 필드·cap·malformed 격리 계약은 불변. C1 산출값이 변경 전후 동일함을 회귀로 단언한다 |
| **evidence-debt 래칫이 붉어진다** — 대상 7건 중 3개가 `evidence-debt.js`에 열거돼 있다 | 중 | M8은 registry의 `evidence` 행을 옮기지 않으므로 래칫 입력이 바뀌지 않는다. 그럼에도 `env-contract/lint.js`를 Validation에 넣어 붉어지면 즉시 드러나게 한다. 래칫 항목 상환은 env-contract 축 소관이며 M8이 대신 갚지 않는다 |
| **A3가 `insufficient`로 남는다** — M8이 CLAUDE.md를 편집하므로 재측정해도 다시 낡는다 | 중 | M4 축이므로 범위 밖으로 명시하고 note에 관측만 남긴다. 재측정하지 않는다(값을 만들면 M4의 감축 주장이 M8 편집분을 섞어 잘못 재봉인된다) |
| **병렬 브랜치 version 충돌** — origin/main과 로컬이 현재 둘 다 1.32.2 | 중 | §3.7대로 머지 해소 시점과 `/mccp:pr` 진입 직전 **두 번** 재계산한다. PRD 전 milestone 종료이므로 minor 후보(1.33.0)이며, 재상향 시 4면 동기를 전부 다시 검증한다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

라이브 완주가 산출해야 하는 **구체 아티팩트** (UI2 — 코드 존재는 판정 근거가 아니다):

- [ ] `.claude/state/msw-events/<sid>.jsonl`에 `session_start` · `session_end` · `task_started`가 실재한다 — 이 저장소에서 **처음으로** `evidence_guard_active` 이외의 kind가 기록된다
- [ ] `.claude/state/<sid>.env-snapshot.json`이 **1건 이상** 실재한다 — 트리 전체 0건에서의 전환
- [ ] `derive/cli.js run --json`에서 **A1·A2·B3의 status가 `computed`**이고 numerator·denominator가 non-null이다. A1 분모는 세션 수가 아니라 distinct work_unit 수임이 `m8-audit-sample.json`의 사람 대조로 확인된다
- [ ] 같은 실행에서 **C2·C3의 status가 `forward-only`로 유지**되고, 귀속 커버리지 필드(`with_gate_decision` / `with_remediation_pr`)가 0이 아니다
- [ ] `metrics-assert`가 A1·A2·B3을 claimed-computable로 통과시킨다
- [ ] `m8-coverage-gate.js --acceptance --json`이 exit 0
- [ ] 대시보드 렌더 산출물(`.claude/cache/STATUS.md` · `status.html`)에 세 지표가 병기 축과 함께 표시된다 (UI11)
- [ ] `m8-before.json` / `m8-after.json`이 동일 스키마로 전환을 박제하고, `m8-audit-sample.json`이 지표별 5건 사람 대조를 기록한다 (UI12)
- [ ] A1 완주 신호는 이 milestone 자신의 `/mccp:pr`에서 처음 발화하므로, **PR 생성 후 재실행 결과**를 `.claude/notes/multi-session-work-loop-m8.md`에 별도 기록한다. `m8-after.json`은 커밋 시점 상태를 그대로 두고 그 차이를 note가 설명한다
- [ ] 설치 캐시가 워크트리보다 낡다는 사실과 머지 후 `claude plugin update`가 필요하다는 점이 note와 CHANGELOG에 적혀 있다 (DD10)

## Design Critique

- 호출: `Skill(impeccable, "critique …")` — 오라클 해소 결과 invocation `impeccable` (source `user` · v4.0.4 · shadowed false)
- 트리거: axis (a) detector positive. `design_signal=true`, signal files에 `renderer/html.js` · `renderer/markdown.js` · `renderer/sections/msw-metrics.js` · `status.html` · `.claude/cache/STATUS.md` 포함
- 라운드: 2 / cap 2 · 최종 verdict **CONVERGED**

| # | Severity | 대상 | 지적 | 처리 |
|---|---|---|---|---|
| F1 | HIGH | Task 5 · Task 9 | `sealed_without_completion` 배치 미지정 — 값 셀에 넣으면 `formatValue`의 "값 셀은 한 지표만" 규칙 위반. 정당화된 예외 2건(B1·C1)은 "맨 숫자가 오독된다"는 근거를 갖는데 A1은 그렇지 않다 | 흡수 (DD11) |
| F2 | HIGH | Task 7 · Task 9 | C2/C3 귀속 커버리지를 값 셀에 붙이는 것은 구조적으로 도달 불가 — `formatValue`가 `status==='forward-only'`에서 `'-'`를 조기 반환하고, 그 분기를 고치면 모듈 헤더의 "값 미산출" 정직 표기가 깨진다 | 흡수 (DD11) |
| F3 | MEDIUM | Task 6 | A2 표본 수를 percentile 분기에 넣으면 한 셀에 사실 3개 | DD11의 일반 규칙으로 함께 해소 |
| F4 | MEDIUM | Task 9 | collapse 줄이 4 → 7로 늘어나는데 순서 규약 미명시 | DD11 (b) 지표 id 순 고정 |
| F5 | LOW | Task 9 | 모듈 카피 규칙(em-dash 금지, `·`와 괄호만)이 plan에 부재 | DD11 (c) 명시 |

R1 재비평에서 미해소 HIGH/CRITICAL 0건. 이연 항목 0건이므로 backlog append 없음.

4 Output Constraints 대조: heading depth 3 이하 유지(신규 heading 0) · 강조색 신규 0개 · raw markdown marker 0 · 항목 수 상한은 단일 공유 collapse 안에서 지표 id 순으로 충족.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only.

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

## Plan Review Triage (L2 R1)

패널 4관점 발화 · 응답 3(`invariant`는 산출 실패) · quorum 3 of 4 미충족 → `divergent`.
§3.14 임계대로 **HIGH 5건 전건 흡수**, MEDIUM 4건은 backlog 이연(기각 1건은 증거 첨부).
§3.16대로 라운드를 늘려 plan을 다듬지 않고, 흡수는 이 라운드 안에서 끝낸다.

| # | 관점 | Sev | 지적 | 처리 |
|---|---|---|---|---|
| R1-1 | architect | HIGH | DD1이 "체인 단일화"와 "반환 계약 불변"을 함께 주장하는데 변환 패턴 미명시 — 무인자 호출부(`session-start.js:705`)와 signature 변경이 긴장 관계 | 흡수 — DD1에 기본값 표현식 교체 패턴을 코드로 명시(arity·호출부·반환 계약 전부 불변) |
| R1-2 | test | HIGH | claimed-computable 목록이 **둘**인데 plan은 test 파일만 갱신 — `derive/cli.js:246`이 별도 하드코딩이고 `metrics-assert`는 그쪽을 읽는다 | 흡수 — Files to Change에 `derive/cli.js` 추가. 대조 결과 **이미 drift 중**(M7의 C1 승격이 cli.js에 없음)이라 그 누락도 함께 닫고 두 목록의 집합 동일성을 test로 고정 |
| R1-3 | test | HIGH | 라이브 검증이 `task_completed`를 요구하는데 그 이벤트는 이 milestone의 PR이 처음 발화 — 커밋 전 실행은 구조적으로 실패 | 흡수 — Validation을 PRE/POST 2단계로 분리. 순환은 Risks·Acceptance에 이미 기록돼 있었으나 Validation 블록이 그것을 반영하지 않았다 |
| R1-4 | test | HIGH | `m8-coverage-gate.js`의 승인 emit 지점 집합 미명시 → 무엇을 검증하는 gate인지 반증 불가 | 흡수 — Task 9에 승인 지점 5개를 file:line으로 열거 |
| R1-5 | test | HIGH | DD2 검증이 "수동으로 심고 red 확인"이라 자동 gate가 아님 | 흡수 — 자동 단언 3종(a·b·c)을 gate로 명시하고, 수동 mutation은 저자 확인으로 강등 |
| R1-6 | architect | MEDIUM | raw/sanitize 2경로 잔여 | backlog (구조적 보장은 반환 계약 통일을 요구 — 별도 축) |
| R1-7 | test | MEDIUM | producer fail-open이 조용한 미계상을 만든다 | backlog (카운터 자신이 같은 문제를 가짐 — 별도 설계) |
| R1-8 | test | MEDIUM | B3 등식이 inline 셸뿐 | **기각** — Files to Change가 `lib/tests/toggle-snapshot.test.js`를 이미 명시. 리뷰어가 L1 정정 전 경로를 근거로 삼았다 |
| R1-9 | — | MEDIUM | `invariant` 관점 산출 실패(커버리지 공백) | backlog — 하필 fail-closed·receipt anchoring 렌즈가 빠졌다. 회수는 `/mccp:code-review` |

`security` 관점은 신뢰 경계·경로 안전성·allowlist 강제·PR 번호 출처를 공격하고 `pass`를 냈다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: `classification=disabled` · `blocking=false` · `durationMs=0` — `MCCP_CODEX_DISABLED=1` env 정책에 따른 first-class skip. Codex는 발화하지 않았고 receipt는 `codex_verdict=skipped`로 봉인된다(cross-gate dedupe는 열리지 않으므로 terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다).
- 라운드 수: 1 (§3.16 — 1라운드 기본)
- 합치 결론: implement-time 신규 결정은 **없다**. plan이 DD1~DD11과 `Files to Change` 표로 파일 배치·추상화 경계·동시성 원시·에러 형태를 전부 선점했다. 유일한 실질 판정은 아래 security-reviewer가 지목한 **파일명 성분 검증 부재**이고, 그것은 R1에서 전건 흡수했다.

### Security Reviewer

- 호출: `Task(mccp:security-reviewer)` — "review proposed implementation: 경로 주입 / hook 입력 신뢰 / allowlist 확장 / A2 세션 바인딩"
- 결과: **BLOCK** (HIGH 1 · MEDIUM 4 · LOW 1). 전건 실측 검증 후 R1에서 흡수 → 미해소 CRITICAL/HIGH **0건**.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 `findings-registry.appendFindings`가 `workUnit`을 타입만 검사하고 `shardPath`에서 파일명 성분으로 쓴다 | HIGH | ACCEPT_NOW | 실측 확인 — `'../../etc/passwd'`는 non-empty 문자열이라 통과했다. `santa/ledger.js:91`이 같은 이유로 쓰는 canonical `SLUG_RE`(receipt/decision.js:32)를 초크 포인트에 적용 |
| F2 `msw-events.appendEvent`가 `sessionId`를 `<sid>.jsonl` 파일명으로 쓰며 검증하지 않는다 | MEDIUM | ACCEPT_NOW | F1과 **동일 결함 클래스**이고, M8이 이 초크 포인트에 새 producer 둘(Task 3 착수 emit · Task 4 CLI emit)을 더한다. 그중 하나는 미sanitize raw 세션 id에 닿으므로 이연은 "이번 주기가 만드는 구멍을 알고도 남긴다"가 된다. `SESSION_ID_RE` 추가 |
| F3 `state/cli.js msw-event emit`이 shell 도달 가능한 위조 입력 경로가 된다 | MEDIUM | ACCEPT_NOW | **아직 쓰지 않은 코드**에 대한 구성 제약이다. Task 4를 쓸 때 `--work-unit` SLUG_RE · `--pr-number` 부호없는 정수 검증을 처음부터 넣는다 |
| F4 `writeDegradedMarker`가 같은 미검증 `workUnit`으로 `.degraded` 마커 경로를 만든다 | MEDIUM | ACCEPT_NOW | F1과 같은 파일·같은 결함이고 공개 export라 초크 포인트를 우회하는 직접 호출이 가능하다. 1줄 |
| F5 `session-end.js`의 스냅샷 session_id 비교가 타입 강제를 안 한다 | LOW | ACCEPT_NOW | **아직 쓰지 않은 코드**(Task 6). 엄격 문자열 비교로 처음부터 작성 |
| F6 신규 allowlist 필드(`gate_decision_id` · `remediation_pr`)의 값 제약 미명시 | LOW | ACCEPT_NOW | **아직 쓰지 않은 코드**(Task 7). slug 규칙 · 부호없는 정수로 고정하고 문서화 |

**§3.14 임계에서 벗어난 지점을 명시한다.** 그 절은 MEDIUM·LOW를 backlog 이연으로 정하지만 F2~F6은 전부 이연하지 않았다. 근거는 둘이고 서로 다르다 — F2·F4는 흡수한 HIGH와 **같은 결함 클래스의 같은 초크 포인트**라 한쪽만 닫으면 형제 경로로 그대로 열려 있고(각각 1줄), F3·F5·F6은 **기존 코드의 지적이 아니라 아직 쓰지 않은 Task 4·6·7의 구성 제약**이라 "이연"할 대상 코드가 존재하지 않는다. 어느 쪽도 범위 확장이 아니다.

- Deferred to backlog: 0
- Open Questions: 없음 (미해소 CRITICAL/HIGH 0건)
- 검증: `plugins/mccp/scripts/lib/tests/session-identity.test.js` `(b3)`이 두 초크 포인트의 거절을 **동작으로** 단언한다(텍스트 검사가 아니라 실제 호출).

### Design Review

- 탐지: `impeccable-detect.js detect --mode implement` → `skill_available=true` · `design_signal=false` · `silent_skip=true` · `reason=no-signal` · invocation `impeccable` (source `user` · v4.0.4 · shadowed false)
- 판정: SKILL_AVAIL=1 · SIGNAL=0 · DESIGN_INTENT_ACTIVE=0 → **silent-skip 행**. gate 진입 시점의 diff에 렌더 표면이 없다는 정직한 관측이다(EXECUTE 전이므로 `renderer/*` 변경이 아직 존재하지 않는다). receipt에 `impeccable_silent_skip=true` + 사유를 forward한다.
- 결과적으로 2.5.5c 방향 캡처 · Phase 3.6 · Phase 3.7이 전부 no-op이다. M8의 렌더 표면 제약은 대신 **plan 시점 critique 루프**가 이미 고정했다 — `## Design Critique`가 2라운드 CONVERGED로 F1~F5를 흡수해 DD11(값 셀 불변 · 단일 공유 collapse · 지표 id 순 · em-dash 금지 · 신규 색 클래스 0)로 봉인했고, Task 9는 그 제약 안에서만 `coReportDetails()`에 3줄을 더한다.

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-08-25T01:01:37.816Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
