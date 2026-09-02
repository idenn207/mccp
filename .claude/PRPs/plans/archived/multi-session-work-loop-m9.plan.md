# Plan: Multi-Session Work Loop M9 — 아카이브 조건 충족

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M9 — 아카이브 조건 충족 (A3 재측정 · C1 종결 producer · C2/C3 귀속 · A2 판정 · status 정본화)
**Complexity**: Large

## Summary

M4·M5·M8 세 행이 `complete (인정 조건 미충족: …)` 라는 비정본 status를 달고 있어
`/mccp:archive-complete`가 §3.11 C4대로 이 PRD의 아카이브를 거부한다. 그 거부는 PRD:167이
명시한 대로 **의도된 것**이었고, M9는 그 의도를 뒤집는 것이 아니라 **의도가 가리키던 조건을
실제로 닫는다**. 조건을 닫을 수 없는 축은 임계를 낮추는 대신 **증거와 함께 반증 조건을
개정한다** — PRD가 대형 코호트 임계에서 이미 한 번 쓴 수법이고, 미측정을 측정된 것으로
위장하지 않는 유일한 방법이다.

착수 실측(2026-08-27)에서 세 행의 상태가 M8 머지 시점보다 **좋기도 하고 나쁘기도 하다**.
M5의 A4는 이미 `computed`로 전환됐고(조건 충족), M8의 A1·B3도 `computed`다. 반면 M4가 근거로
삼은 A3는 `insufficient`로 **회귀**했으며 — 그 회귀는 단순 stale이 아니라 (a) 측정 경로가
tiktoken 부재에서 graceful degrade 없이 **크래시**하고 (b) 봉인된 감축 주장이 CLAUDE.md의
재성장으로 **실질 침식**됐다는 두 겹이다. C1·C2/C3은 producer가 구조적으로 비어 있다.

M9는 게이트를 하나도 추가하지 않고 LLM 호출도 늘리지 않는다. 새 env 토글도 만들지 않는다.

## User Intent

<!-- 사용자가 이 사이클에서 실제로 말한 것만. 저자 정당화는 ## Design Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | multi-session-work-loop PRD를 아카이브할 수 있는 상태로 만든다 | direction |
| UI2 | 아카이브를 실제로 막는 축만 담는다 — backlog 734건 트리아지는 이 계획에 넣지 않는다 | exclusion |
| UI3 | B2 coverage gate와 STATE.md escalation 해소도 이 계획에 넣지 않는다 | exclusion |
| UI4 | 결과물은 별도 PRD가 아니라 이 PRD의 단일 마일스톤 M9로 만든다 | direction |
| UI5 | A2는 statusline을 교체하기 전에 대체 producer가 있는지 먼저 조사한다 | constraint |
| UI6 | A2 산출이 불가능한 것으로 확인되면 증거와 함께 인정 조건을 개정한다 | exception |
| UI7 | 계획은 마일스톤 표에 추가하고 최종 검토는 사람이 한다 | direction |
| UI8 | 최종 검토 대상에는 자식 PRD들도 포함한다 | direction |

## Producer Preflight

PRD Risks 표가 milestone 착수 시 요구하는 검사다 — *"이 milestone이 의존하는 지표의 producer가
프로덕션에서 산출하는가"*. 답을 "없다"로 끝내면 M4·M7이 그랬듯 범위가 예측 불가해지므로
**어디까지 없는지**를 실측해 적는다. 전량 2026-08-27 측정.

| 축 | 산출 여부 | 실측 근거 |
|---|---|---|
| A1 | **산출** `computed 1/1` | M8 Phase 5.1 완주 emit이 실제 발화. 조건 충족 |
| A4 | **산출** `computed 0/42` (boundary 2) | 저널 경계 2건에서 파생. M5의 "전환 미확인"이 해소됨 |
| B1 | **산출** `computed`, drift 0건 / 24 | `value: null`은 고장이 아니라 UI4 설계(건수 지표라 `numerator`가 계약값) |
| B3 | **산출** `computed 20/117` | 조건 충족 |
| A3 | **회귀** `insufficient` · `integrity_ok:false` | ① `node …/msw-metrics/cli.js a3 --print`가 `Error: write EOF` **unhandled throw**로 죽는다(tiktoken 부재 시 graceful degrade 없음) ② `python -c "import tiktoken"` → `ModuleNotFoundError` ③ 봉인된 `after`의 CLAUDE.md는 87,583B인데 현재 119,295B — **감축 주장이 실질 침식**됐다(45.2% claim의 재현 불가) |
| A2 | **부재** `forward-only`, sample 0 | `context_remaining_pct`를 bridge에 쓰는 유일한 writer는 `plugins/mccp/scripts/hooks/ecc-statusline.js:127`인데 사용자 전역 설정의 `statusLine.command`가 `ccstatusline`으로 등록되어 있다(저장소 밖 파일이라 경로 인용 불가) — **producer가 설치되어 있지 않다**. 부차로 live snapshot의 `session_id`도 null(캐시 1.32.6 < 1.33.0, M8 session-identity 미반영) |
| C1 | **반쪽** `computed 0/12`, open 12 | `plugins/mccp/scripts/lib/plan-review/cli.js:864` `emitPanelFindings`가 `finding_opened`만 낸다. 패널 경로에 **종결 producer가 없어** 모든 패널 finding이 영구 open. 실측 12건 전부 2026-08-21 M7 패널 산출(CRITICAL 1 · HIGH 4 · MEDIUM 6 · LOW 1), 종결 0건 |
| C2/C3 | **부재** gate 0 · PR 0 / 12 | `plugins/mccp/commands/pr.md:1445-1446`이 `FINDING_ID=""` · `GATE_DECISION_ID=""`를 **빈 리터럴로 하드코딩**하고 산문으로 LLM에게 채우라고 한다. 파생하는 코드가 없어 emit이 한 번도 발화한 적 없다. 좌변(`gate_decision_id`)은 M8 Task 7이 배선했으나 레지스트리의 12건이 그 stamp **이전** 기록이라 소급 0 |

> **이 milestone의 게이트 실행이 위 진단을 실시간으로 재현했다** (2026-08-27, 같은 세션).
> M9 plan의 L2 패널이 `finding_opened` 12건을 새로 emit하자 C1이 **0/12 → 0/24**로,
> `open_count`가 **24**로 올랐다. 종결은 여전히 0건이다 — 즉 리뷰를 한 번 돌릴 때마다
> 영구 open finding이 12건씩 쌓인다는 것이 관측으로 확인됐다. 이것이 Task 2가 닫는 구멍이다.
> 동시에 C2의 `with_gate_decision`은 **0 → 12**로 올랐다(신규 12건은 M8 Task 7의 stamp를
> 갖고, 레거시 12건은 갖지 않는다) — 좌변은 살아 있고 `with_remediation_pr`만 0에 머문다는
> Task 4의 전제도 함께 확인됐다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 종결 이벤트 emit | `plugins/mccp/scripts/lib/santa/seal.js:473-480` | `closedIds` 중복 가드 → `{kind:'finding_closed', finding_id, closure_type}` batch → `appendFindings` 1회 |
| 판정 → 종결 매핑 | `plugins/mccp/scripts/state/findings-registry.js:58-63` | `CLOSURE_FROM_ADJUDICATION` 단일 테이블. 호출부에 매핑을 흩뿌리지 않는다 |
| 귀속 stamp 실패 시 | `plugins/mccp/scripts/lib/plan-review/cli.js:891-893` | 형태가 어긋나면 **붙이지 않는다** — 귀속을 얻으려다 finding을 잃지 않는다 |
| coverage gate | `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js:39-60` | `APPROVED_*_SITES` frozen 레지스트리 + 실재 축 + 정적 lint 축. 위협 모델을 헤더에 정직히 한정 |
| 측정 산출 거부 | `plugins/mccp/scripts/lib/msw-metrics/cli.js:152-156` | `status !== 'computed'`면 아티팩트를 **쓰지 않는다**(측정 불가를 baseline으로 봉인 금지) |
| 신선도 범위 공표 | `plugins/mccp/scripts/derive/sources/instruction-cost.js:91` | `freshness_scope`를 **값과 함께 싣는다** — 범위가 안 보이는 신선도 주장은 전체를 덮은 것처럼 읽힌다 |
| 지표 정직 강등 | `plugins/mccp/scripts/lib/msw-metrics/index.js:319-321` | stale은 `insufficient` + `stale_reason` 병기. 값을 살려두고 경고만 하지 않는다 |
| test 위치 | `plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js` | `node --test`, producer별 배선 단언 + 정적 스캔 단언 |

## Files to Change

<!-- §3.7 dedupe: repo-root full 경로. 축약 경로는 planned matcher를 불발시킨다. -->

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js` | UPDATE | tiktoken 부재 시 unhandled `write EOF` throw → `status:'error'` graceful 반환 (Task 1a) |
| `docs/multi-session-work-loop/a3-baseline.json` | UPDATE | `--emit-after` 재측정으로 `after` + `reduction` 정직 갱신 (Task 1c) |
| `docs/multi-session-work-loop/a3-freshness-policy.md` | CREATE | A3가 CLAUDE.md 편집마다 stale이 되는 성질의 처리 규칙 (Task 1d) |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | 패널 경로 `finding_closed` producer — backlog 적재분을 `deferred`로 종결 (Task 2) |
| `plugins/mccp/scripts/state/findings-registry.js` | UPDATE | 필요 시 종결 사유 매핑 확장 (Task 2, 단일 테이블 유지) |
| `plugins/mccp/commands/pr.md` | UPDATE | `FINDING_ID`/`GATE_DECISION_ID` 빈 리터럴을 기계적 파생으로 교체 (Task 4) |
| `plugins/mccp/scripts/state/cli.js` | UPDATE | 파생을 위한 조회 서브커맨드(해당 슬러그의 미귀속 종결 finding 열거) (Task 4) |
| `plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js` | CREATE | M9 승격을 종속시키는 반증 가능 gate (Task 6) |
| `plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js` | CREATE | Task 1~4 배선 회귀 test — **Task 2가 생성**하고 Task 3·4가 증분 확장한다(아래 Tasks 배너가 정본. Task 6은 이 파일을 만들지 않는다) |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATE | A3 graceful-degrade 단언 추가 (Task 1a) |
| `docs/multi-session-work-loop/a2-producer-investigation.md` | CREATE | A2 대체 producer 조사 결과 — 산출 경로 또는 불가 증거 (Task 5) |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M9 행 추가 · M4/M5/M8 status 정본화 · 인정 조건 개정 · PRD:167 갱신 (Task 7) |
| `.claude/state/findings/multi-session-work-loop-m7.jsonl` | UPDATE | 12건 판정 종결 이벤트 append (Task 3, append-only) |
| `docs/multi-session-work-loop/m9-before.json` | CREATE | 착수 시점 지표 스냅샷 |
| `docs/multi-session-work-loop/m9-after.json` | CREATE | 종료 시점 지표 스냅샷 |
| `docs/multi-session-work-loop/m9-assertion-manifest.json` | CREATE | 단언 매니페스트 (M5~M8 선례) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump — PRD 전체 종료이므로 minor (§3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면 중 2면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면 중 3면) |
| `CHANGELOG.md` | UPDATE | 새 항목 + `currently \`X.Y.Z\`` 노트 동기 (4면 중 4면) |

## Tasks

> **test 파일은 자기가 검증할 Task와 같은 커밋에 든다** (L2 test F2, CRITICAL — 흡수).
> 최초 판본은 Task 2·4의 Validate가 `msw-m9-producers.test.js`를 돌리게 해 놓고 그 파일을
> **Task 6에서** 만들었다 — 즉 Task 2·4가 도는 동안 검증 수단이 존재하지 않아 두 Task의 산출이
> 마지막 Task까지 **측정 불가**였고, `--json` 호출은 gate 로직에 닿기도 전에 ENOENT로 죽었을
> 것이다. 그래서 `plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js`는 **Task 2에서
> 생성되고 Task 3·4에서 증분 확장**되며, 각 Task의 Validate는 *그 시점까지 존재하는* 단언만
> 돌린다. Task 6은 test 파일을 만들지 않고 **coverage gate만** 만든다. Task 1의 A3 단언은
> 기존 `msw-metrics.test.js`에 들어가므로 이 규칙 밖이다.

### Task 1: A3 측정 경로 복구와 정직한 재측정

- **Action (1a)** — `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js`의 Python
  서브프로세스 stdin을 보호한다. **고장 기전을 정확히 적는다**(L2 invariant F7 흡수 —
  최초 서술은 "unhandled throw"였고 그것은 틀렸다): tiktoken import가 실패해 자식이 즉시 죽으면
  broken pipe에 대한 write가 **비동기 `'error'` 이벤트**로 나오는데 `proc.stdin`에 `'error'`
  리스너가 없어 unhandled `'error'`가 프로세스를 죽인다. `:431-434`의 try/catch는 **동기 throw만**
  잡으므로 이 경로를 원리상 못 잡는다 — 즉 "try/catch가 이미 있다"는 관측은 참이지만 이 결함을
  반증하지 못한다. 실측 증상은 `Error: write EOF` at `WriteWrap.onWriteComplete`.
  fix는 `proc.stdin.on('error', …)` 등록이고, 그 위에서 측정기는 던지지 말고
  `{status:'error', not_delivered_reason:'tiktoken unavailable: <detail>'}`을 반환한다
  (`plugins/mccp/scripts/lib/msw-metrics/cli.js:152`가 이미 `status !== 'computed'`를 받을 준비가 되어 있다).
- **Action (1b)** — tiktoken 전제조건을 문서화한다. 설치는 이 계획이 **강제하지 않는다**(사용자
  환경 변경). 부재 시 A3가 `insufficient`로 남는 것이 정직한 결과이고, 1a가 그 결과를
  **크래시 대신** 만들어 준다.
- **Action (1c)** — tiktoken이 있으면 `--emit-after`로 재측정한다. **결과를 예단하지 않는다**:
  봉인 `after`는 CLAUDE.md 87,583B 기준이고 현재는 119,295B이므로 감축비는 45.2%보다
  **낮게 나올 것이 거의 확실하다**. 낮게 나오면 낮은 값을 쓴다. baseline(`before`)은
  `7fe48d9`에 봉인돼 있고 emitter가 재봉인을 거부하므로 `after`만 갱신된다 — 그 비대칭이
  감축 주장을 반증 가능하게 유지하는 장치다.
- **Action (1d)** — 신선도 정책을 확정해 문서화한다. A3는 CLAUDE.md가 바뀔 때마다 stale이
  되므로 1회 재측정은 다음 편집에서 다시 무너진다. 선택지는 (i) 사이클마다 재측정하는
  문서화된 단계, (ii) 신선도 주장 범위를 좁힘. **범위를 넓히는 선택지는 없다** —
  `freshness_scope`가 값과 함께 실리는 이유가 그것이다.
- **Mirror**: `plugins/mccp/scripts/lib/msw-metrics/cli.js:152-156` 산출 거부 규약 · `plugins/mccp/scripts/derive/sources/instruction-cost.js:91` 신선도 범위 공표
- **Validate**: exit code만 보면 `baseline-unavailable`(기존 동작)·`error`(신규)·`computed`가
  전부 통과해 **주장을 반증하지 못한다**(L2 test F3 흡수). 그래서 값을 단언한다 —
  tiktoken 부재를 강제한 환경에서 `a3 --print`의 stdout JSON이 `status === 'error'` ∧
  `not_delivered_reason`이 `tiktoken`을 포함하고, 프로세스가 **stack trace 없이** 끝난다.
  `plugins/mccp/scripts/lib/tests/msw-metrics.test.js`에 이 단언을 추가하는 것이 Task 1a의
  완료 조건이며, 그 test는 Task 6이 아니라 **Task 1과 같은 커밋**에 든다.

### Task 2: 패널 경로 C1 종결 producer

- **Action** — `plan-review/cli.js`의 `backlog-append` 경로가 성공했을 때, 적재된
  `blockingFindings`에 대해 `{kind:'finding_closed', closure_type:'deferred'}`를 같은 batch로
  emit한다. `backlog_appended`는 이미 기계적으로 관측되는 사실이므로 새 신호를 발명하지 않는다.
- **왜 `deferred`인가** — `RESOLVING_CLOSURE_TYPES`는 `['fixed','invalidated']`뿐이라
  `deferred`는 **C1 분자에 들어가지 않는다**. 즉 이 producer는 폐쇄율을 부풀릴 수 없고,
  finding을 `open`에서 `deferred`로 옮길 뿐이다 — 그것이 실제로 일어난 일이다.
  종결을 `fixed`로 쓰는 producer는 이 Task에서 만들지 않는다.
- **이 Task는 C1의 status를 바꾸지 않는다** (L2 architect F1 흡수). C1은 착수 시점에 이미
  `computed 0/12`이고 `derive/index.js:56`에 findings source가 등록돼 있다 — `computeC1`의
  `forward-only` 분기(`plugins/mccp/scripts/lib/msw-metrics/index.js:673-688`)는 source가
  없거나 `ok:false`일 때의 경로이고 현재는 해당하지 않는다. Task 2가 닫는 것은 **status가 아니라
  종결 경로의 부재**다. 따라서 이 Task의 성공 판정에 "C1이 computed로 뒤집힌다"를 쓰지 않는다 —
  이미 그러하므로 그 단언은 아무것도 반증하지 못한다.
- **구현 앵커** (L2 architect/test MEDIUM 흡수) — emit은 `cmdBacklogAppend`의 `appendRows`가
  **성공한 뒤**에 같은 함수 안에서 일어난다. 순서가 계약이다: 적재가 실패하면 종결도 없어야
  한다(적재되지 않은 finding을 `deferred`로 종결하면 이연 기록 없는 종결이 된다).
  `appendRows` 실패 시 이 Task의 emit은 **실행되지 않고**, 5.2g2의 기존 `EX_BLOCK` 경로가
  그대로 살아 있다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/seal.js:473-480` batch 형태 · `plugins/mccp/scripts/state/findings-registry.js:58-63` 단일 매핑 테이블
- **Validate**: 이 Task가 `plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js`를
  **생성**한다. 패널 단일통과 경로를 fixture로 돌려 `finding_closed` N건이 append되고
  `computeC1`의 `deferred_count`가 N, `numerator`는 **불변**임을 단언한다. 추가로
  `appendRows` 실패 fixture에서 종결 emit이 **일어나지 않음**을 단언(negative).

### Task 3: 미판정 finding 12건 종결

- **Action** — `.claude/reviews/plan-review-multi-session-work-loop-m7.md`를 읽고 12건을
  §3.14 임계로 판정한다. CRITICAL 1 + HIGH 4는 그 자리에서 흡수 여부를 결정하고, 기각하면
  **file:line 증거를 backlog 줄에 남긴다**. MEDIUM 6 + LOW 1은 backlog append.
  판정 결과를 `finding_closed` 이벤트로 레지스트리에 append한다(append-only — 기존 줄 미수정).
- **주장하지 않는 것** — 이 Task는 C1을 0에서 끌어올리는 것이 목적이 아니다. `fixed`로 종결되는
  건수만 분자에 들어가고, 나머지는 `deferred`/`rejected`로 분모 안에서 이동한다.
  C1 값이 여전히 낮게 나오면 낮은 값을 기록한다.
- **Mirror**: CLAUDE.md §3.14 수용 임계 · `findings-registry.js` closure enum
- **Validate**: `open_count`가 12에서 판정 후 잔여로 감소하고, `type_separation`이 true 유지.
  단언은 Task 2가 만든 `msw-m9-producers.test.js`에 **증분 추가**한다.

### Task 4: C2/C3 귀속 기계화

- **Action** — `plugins/mccp/commands/pr.md:1445-1446`의 빈 리터럴 두 개를 제거하고, 이 PR이 종결한 finding을
  **레지스트리에서 파생**한다. `state/cli.js`에 조회 서브커맨드를 더해
  `(work_unit = DECISION_SLUG) ∧ (closure_type ∈ RESOLVING) ∧ (아직 remediation_pr 미결속)`
  집합을 열거하고, 각 건에 대해 `remediation_pr`을 emit한다.
- **파생할 수 없으면 emit하지 않는다.** 조인 키 없는 귀속 레코드는 어느 소비처도 읽지 못하고,
  추정으로 채운 귀속은 지표를 오염시킨다. 0건은 정상이다.
- **Mirror**: `plugins/mccp/scripts/lib/plan-review/cli.js:891-893` "형태가 어긋나면 붙이지 않는다" · `plugins/mccp/commands/pr.md:1425` A1 emit 형태
- **Validate**: fixture 저장소에서 종결 finding 2건 + PR 번호를 주고 `with_remediation_pr`이
  0 → 2로 오르는지. 종결이 0건이면 emit 0건 + exit 0. 단언은 Task 2가 만든
  `msw-m9-producers.test.js`에 **증분 추가**한다 — 이 Task가 그 파일을 새로 만들지 않는다.

### Task 5: A2 대체 producer 조사 (UI5) 또는 인정 조건 개정 (UI6)

- **Action (5a)** — statusline을 건드리지 않고 context 잔여를 얻을 경로가 있는지 조사한다.
  후보: transcript 토큰 누적 추정 · `ecc-metrics-bridge`가 이미 갖고 있는 값 · 하네스가
  다른 hook payload로 노출하는 필드. 조사 결과를 `a2-producer-investigation.md`에 기록한다.
- **Action (5b)** — 산출 경로가 있으면 배선하고 A2를 `computed`로 전환한다.
- **Action (5c)** — **없으면** 조사 결과를 증거로 삼아 M8의 A2 조항을 개정한다.
  개정문은 "A2는 하네스가 statusline 밖으로 노출하지 않아 산출 불가이며, 그 사실이
  `a2-producer-investigation.md`에 실측으로 남는다"이지 "A2를 달성했다"가 아니다.
- **Validate**: 5b로 끝나면 `derive run --json`의 `metrics.A2.status === 'computed'` ∧ `sample_count > 0`.
  5c로 끝나면 `docs/multi-session-work-loop/a2-producer-investigation.md`가 시도한 경로를 전부
  열거하고 각각 왜 불가인지 파일과 줄 번호로 지목한다. 둘 중 하나는 반드시 성립해야 한다.

### Task 6: M9 coverage gate (test 파일은 만들지 않는다)

- **Action** — `m9-coverage-gate.js`를 `m8-coverage-gate.js` 형태로 만든다. 축은 셋이다:
  (1) Task 2·4가 더한 emit 지점이 실재하는가, (2) 목록 밖에서 같은 어휘로 쓰는 파일이 있는가,
  (3) **Task 7a의 행별 선행 술어**를 평가하되 **평가에서 멈추지 않는다** — PRD에서 실제로
  flip된 행을 읽어 그 행의 술어와 **교차 검증**해 exit code로 답한다. 즉 status 셀이 정본
  `complete`인 행 각각에 대해 그 행의 술어가 참인지 확인하고, **하나라도 거짓이면 비영점**이다.
  술어를 *평가만* 하면 gate는 "무엇이 참인지" 보고서를 낼 뿐 "무엇이 flip됐는지"를 보지 않아,
  술어가 거짓인 채 괄호만 지워진 행을 통과시킨다 — R1 invariant F4가 지목한 자기차단 구조가
  그대로 남는다(R2에서 security F1 · test F4·F5·F7 · invariant F3 다섯 건이 같은 축을 다시
  지목했다). markdown 편집을 런타임으로 차단하는 수단은 이 하네스에 없으므로 이 **사후 교차
  검증이 가용한 최강 강제**이고, 그래서 `## Validation`과 `## Acceptance`가 이 gate의 exit 0을
  요구한다. (3)이 이 gate를 단순 emit-lint가 아니라 flip 권한의 소유자로 만든다. 헤더에 위협 모델을 **한정해서** 적는다 —
  우발적 미승인 emit 유입이 대상이지 적대적 위조자가 아니다.
- **회귀 test는 Task 2가 이미 만들었다** — 이 Task는 그 파일에 gate 자체의 단언만 더한다
  (위 Tasks 배너 참조).
- **Mirror**: `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js:39-60`
- **Validate**: `node plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js --json` exit 0
  ∧ 술어를 거짓으로 만든 fixture에서 **비영점**(Task 7a negative test와 같은 fixture).

### Task 7: PRD status 정본화와 기록 이전

> **이 Task는 게이트를 침묵시킬 수 있다** (L2 invariant F4, CRITICAL — 흡수).
> `archive-complete/scan.js:106`의 `normalizeStatus`는 `complete (인정 조건 미충족: …)`를
> `non-canonical`로, 맨 `complete`를 `complete`로 판정한다. 즉 **괄호를 지우는 편집 하나가**
> 게이트 판정을 non-archivable → archivable로 뒤집는다. 조건이 실제로 닫혔는지와 무관하게.
> 게이트는 마커의 존재에 의존하고, 이 Task는 그 마커를 제거하는 주체다 — 자기가 통과해야 할
> 검사를 자기가 지우는 구조다. 그래서 아래 **선행 술어**가 이 Task의 일부이지 곁다리가 아니다.

#### 7a — 행별 선행 술어 (flip 전에 기계로 통과해야 한다)

각 행은 자기 술어가 **기계적으로 참일 때만** flip한다. 술어는
`plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js`가 소유하고 exit code로 답한다 —
산문 체크리스트가 아니다(산문이면 이 Task가 자기 자신을 통과시킨다).

| 행 | 술어 (전부 참이어야 flip 허용) |
|---|---|
| M5 | `derive` 산출의 `metrics.A4.status === 'computed'` |
| M8 | `metrics.A1.status === 'computed'` ∧ `metrics.B3.status === 'computed'` ∧ (`metrics.A2.status === 'computed'` **또는** `docs/multi-session-work-loop/a2-producer-investigation.md`가 실재하고 개정문이 PRD에 반영됨) ∧ (`sources.findings.with_gate_decision > 0` **또는** `with_remediation_pr > 0` **또는** 귀속 0건이 Task 4의 "파생 불가" 기록으로 설명됨) |
| M4 | `metrics.B1.status === 'computed'` ∧ `metrics.C1.status === 'computed'` ∧ `docs/multi-session-work-loop/a3-baseline.json`의 `after.measured_at`이 현재 CLAUDE.md digest와 일치(= A3 non-stale) **또는** A3 미산출 사유가 개정문에 기록됨 |

술어가 거짓인 행은 **flip하지 않는다**. 세 행 중 일부만 참이면 참인 행만 flip하고,
그 결과 PRD는 여전히 archivable이 아니다 — 그것이 정직한 상태이며 Task 8은 실행되지 않는다.
**"아카이브 가능해지는 것"은 이 milestone의 목표이지 통과 조건이 아니다.**

#### 7b — 기록 이전은 결속을 유지한다 (L2 invariant F5, HIGH — 흡수)

괄호를 `## 순서의 근거`로 옮기기만 하면 텍스트는 살지만 **결속이 끊긴다** — 표만 읽는 사람은
맨 `complete`를 보고 그것이 어떤 증거 맥락에서 나왔는지 알 수 없다(§3.12가 요구하는
"기록이 그것이 서술하는 대상에 결속하는가"). 그러므로:

- **Status 셀**은 정확히 `complete` — 여기에 텍스트를 더하면 다시 non-canonical이 된다.
- **결속은 같은 행의 Outcome 셀**이 진다. Outcome 끝에
  `(인정 조건 개정: [순서의 근거 §M4](#순서의-근거))` 형태의 **행-내 포인터**를 남긴다.
  포인터는 표를 벗어나지 않으므로 표만 읽어도 "이 complete에는 딸린 사연이 있다"가 보인다.
- `## 순서의 근거` bullet은 ① 원래 조건 ② M9가 실제로 닫은 것 ③ 개정한 것과 근거 문서를 적는다.

#### 7c — PRD:167 갱신

그 문단은 현재 "이 표기는 §3.11 C4 기준상 non-canonical이라 `/mccp:archive-complete`가
보수적으로 아카이브를 거부하며, 그 거부는 의도된 것이다"라고 적혀 있다. 조건을 닫거나 개정한
뒤에는 그 문장이 거짓이 되므로, 삭제가 아니라 **경위를 남긴 갱신**을 한다(언제 왜 그렇게
적었고 무엇이 그것을 해소했는지). 지우면 왜 한동안 거부됐는지가 사라진다.

#### 7d — M4의 원 조건은 "충족"이 아니라 "포기"다 (L2 invariant F6, HIGH — 흡수)

원 조건은 "감축 **전후** B1·C1 회귀 검사 통과"다. 감축 시점(2026-08-09)에 두 producer가
없었으므로 "before"가 존재하지 않고 소급 생성도 불가능하다. 여기서 **전방 증거가 과거 주장을
검증한다고 말하면 그것은 거짓**이다 — "지금 drift가 0이다"는 "그때 감축이 품질을 유지했다"를
함의하지 않고, 입증 책임을 "producer 산출이 조건 성립을 증명한다"에서 "관측된 회귀의 부재가
조건 성립을 증명한다"로 뒤집는다. 그래서 개정문은 **충족을 주장하지 않는다**:

> M4의 전후 회귀 검사는 **반증 불가로 판정되어 포기한다**. 감축 시점에 B1·C1 producer가
> 부재했으므로 before가 존재하지 않으며 소급 생성도 불가능하다. 대체하는 것은 같은 명제의
> 약한 판본이 아니라 **다른 명제**다 — "현재 시점의 B1 drift와 C1 산출이 건강하다"는
> 전방 관측이며, 과거 감축의 품질에 대해 아무것도 말하지 않는다. 그 한계를 명시한 채 기록한다.

Task 1c의 재측정값이 45.2%보다 낮으면 **낮은 값을 그 bullet에 적는다**.

- **Validate**: (1) `node plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js --json`이
  각 행의 술어 결과를 내고, flip된 행의 술어가 전부 `true`. (2) 술어를 거짓으로 만든 fixture에서
  gate가 **비영점**으로 끝나 flip이 거부되는 negative test. (3) 그 뒤에야
  `node plugins/mccp/scripts/lib/archive-complete/scan.js --json`의
  `archivable`/`counts.nonCanonical`을 **관측**한다 — 이 값은 목표이지 통과 조건이 아니다.

### Task 8: 아카이브 완주 (라이브 1회)

- **Action** — `/mccp:archive-complete`를 실제로 돌려 PRD와 plan 9건이
  `.claude/prds/archived/` · `.claude/PRPs/plans/archived/`로 이동하고 journal이 남는 것을
  확인한다. 단위 test 통과는 경로 작동의 증거가 아니다.
- **Validate**: `moved` ≥ 10 · `aborted:false` · `errors:[]` · 렌더 후 전 derive source
  `degraded:false` · `milestone-history`에 이력 잔존.

## Validation

```bash
cd C:/_project/mccp/.worktrees/multi-session-work-loop-m9

# Task 1 — A3 측정 경로가 크래시하지 않는다
node plugins/mccp/scripts/lib/msw-metrics/cli.js a3 --print; echo "exit=$?"

# Task 2·3·4 — producer 회귀
node --test plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js
node --test plugins/mccp/scripts/lib/tests/msw-metrics.test.js

# Task 6 — coverage gate
node plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js --json

# 지표 전이 확인 (before/after 스냅샷 대조)
node plugins/mccp/scripts/derive/cli.js run --json > docs/multi-session-work-loop/m9-after.json

# Task 7 — 아카이브 가능 여부는 **관측**이지 통과 조건이 아니다 (7a 술어가 통과 조건)
node plugins/mccp/scripts/lib/archive-complete/scan.js --json \
  | node -e 'const m=JSON.parse(require("fs").readFileSync(0));const p=m.prds.find(x=>x.path.includes("multi-session-work-loop"));console.log(p.archivable, JSON.stringify(p.counts));'

# 회귀 전수
node --test plugins/mccp/scripts/**/tests/*.test.js

# 계약 lint
node plugins/mccp/scripts/lib/env-contract/lint.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **A3 재측정이 감축 주장을 무너뜨린다** — CLAUDE.md가 87,583B → 119,295B로 재성장해 45.2% 주장이 재현되지 않을 것이 거의 확실 | 높음 | 낮은 값을 그대로 적는다. baseline은 `7fe48d9`에 봉인돼 있고 emitter가 재봉인을 거부하므로 주장은 반증 가능한 채로 남는다. 이 위험의 실현은 M9의 실패가 아니라 M9가 존재하는 이유다 |
| tiktoken 미설치로 A3를 끝내 측정할 수 없다 | 중 | Task 1a가 크래시를 `insufficient`로 바꾸므로 최소한 **정직한 미산출**이 된다. M4 조건은 Task 7의 개정 경로로 닫는다 |
| A2 대체 producer가 존재하지 않는다 | 높음 | UI6이 이미 그 경우의 처리를 정했다 — 증거와 함께 개정. 조사 문서가 시도 경로를 열거해야 개정이 정당해진다 |
| C1 종결 producer가 폐쇄율을 부풀린다 | 낮음 | `deferred`는 `RESOLVING_CLOSURE_TYPES` 밖이라 분자에 **구조적으로** 들어갈 수 없다. `fixed` 종결 producer를 이 계획에서 만들지 않는 것이 그 보장의 다른 반쪽 |
| status 정본화가 미충족 기록을 소실시킨다 | 중 | Task 7이 괄호 주석을 삭제가 아니라 `## 순서의 근거`로 **이전**한다. 이전 후 원문이 문서 어딘가에 남아 있는지 grep으로 확인하는 것이 Acceptance 항목 |
| 정본화가 PRD:167의 명시 결정을 조용히 뒤집는다 | 중 | 그 문단을 갱신 대상으로 **명시**했다. 삭제하면 왜 한동안 아카이브가 거부됐는지가 사라진다 |
| 병렬 브랜치 version 충돌 (§3.7 실측 4회 재발) | 중 | target을 머지 해소 시점과 `/mccp:pr` 진입 직전 **두 번** 재계산. 재상향 시 4면 동기 전부 재검증 |
| 머지가 다른 PR의 신규 파일을 소리 없이 삭제 (§3.5.1 PR #110 선례) | 중 | 커밋 직전 `git diff --diff-filter=D --name-only <base>...HEAD` 확인 |

## Out of Scope

UI2·UI3이 정한 제외선이다. 아래는 실재하는 부채이지만 **아카이브를 막지 않으므로** M9에 넣지 않는다.

- **backlog 734건 트리아지** — 어느 milestone의 인정 조건에도 없다. 단독 PRD 분량
- **B2 coverage gate** (`forward-only`) — M3 소관이고 M3는 이미 정본 `complete`다
- **STATE.md escalation 해소** (`decision: multi-session-work-loop`, `/mccp:santa-loop` 대기)
- **statusline 교체** — UI5가 조사 우선을 명시했고, 교체는 사용자 환경 변경이다
- **`prp-implement.md`의 `completed/` 목적지 오류** (backlog 2026-08-13 MEDIUM) — §3.11 C2
  소실 경로이나 별개 축

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] `a3 --print`가 tiktoken 부재 환경에서 `status === 'error'` ∧ `not_delivered_reason`에
      `tiktoken`을 담아 반환하고 **stack trace 없이** 끝난다 — exit code만 보는 단언은
      기존 `baseline-unavailable`도 통과시켜 주장을 반증하지 못한다(L2 test F3)
- [ ] A3 재측정값이 45.2%보다 낮게 나왔다면 **낮은 값이 PRD와 아티팩트에 적혀 있다**
- [ ] C1 `deferred_count > 0` ∧ `numerator` 불변 — 종결 producer가 폐쇄율을 올리지 않았음
- [ ] A2가 `computed`로 전환됐거나, 전환 불가 증거가 `a2-producer-investigation.md`에 file:line으로 남았다
- [ ] 세 행의 미충족 원문이 `## 순서의 근거`에서 grep으로 발견된다 (이전됐고 소실되지 않음)
- [ ] PRD:167이 갱신됐고 "왜 한동안 거부됐는가"의 경위가 남아 있다
- [ ] **flip된 모든 행이 Task 7a 술어를 기계로 통과**했고, 술어 거짓 fixture에서
      `m9-coverage-gate.js`가 비영점으로 flip을 거부하는 negative test가 green
- [ ] flip된 각 행의 Outcome 셀에 `## 순서의 근거` 행-내 포인터가 있다 (§3.12 결속 유지)
- [ ] M4 개정문이 원 조건을 **포기**로 명시하고, 전방 증거가 과거 주장을 검증한다고 말하지 **않는다**
- [ ] `scan.js`의 `archivable`/`nonCanonical`을 관측해 기록했다 — 술어가 일부만 참이면
      `archivable:false`가 정직한 결과이며 Task 8은 미실행이다
- [ ] **`/mccp:archive-complete`를 실제로 1회 완주해 PRD + plan 9건이 이동하고 journal이 남았다** (단위 test 통과 ≠ 경로 작동)
- [ ] 렌더 후 전 derive source `degraded:false`
- [ ] §3.7 4면 version 동기 (plugin.json · html.js · markdown.js · CHANGELOG.md)

## Design Critique

⚠️ DEGRADED: single-context (no sub-agent used — this session carries a standing instruction not to spawn agents; `critique.md` requires the banner whenever Assessment A/B run inline)

- trigger: §3.9 축 (b) — `DESIGN_SURFACE_PATHS` whitelist hit. `detect --mode plan` → `skill_available:true` · `design_signal:true` · `reason:ok`
- call form: resolved `impeccable` (오라클 `impeccable_invocation`, 리터럴 하드코딩 아님)
- rounds: 1 (R0) · cap 2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 기본)
- verdict: **CONVERGED**

### Assessment A — 이 plan에 귀속되는 디자인 표면

이 plan이 렌더 표면에 도입하는 변경은 `renderer/html.js` page-foot와 `renderer/markdown.js`
derived 줄의 **version 리터럴 하나**뿐이다(§3.7 4면 동기). 4개 Output Constraint 대조:

| 제약 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | 해당 없음 | 렌더 표면에 heading을 도입하지 않음 |
| 강조색 화면당 1개 | 해당 없음 | accent token 미도입 |
| raw markdown marker 금지 | 해당 없음 | markdown.js 줄은 파생 평문 |
| 한 화면 항목 수 상한 | 해당 없음 | list-of-N 섹션 미도입 |

귀속 finding **0건**. PRODUCT.md의 anti-reference 3종(SaaS hero-metric · AI-cream warm minimal ·
Bloomberg terminal) 시그니처도 도입하지 않는다.

### Assessment B — detector 실측

`detect.mjs --json .claude/cache/status.html` → **48건, 전부 `advisory`, non-advisory 0건**
(font-size 38 · radius 8 · color 2). 전량 기존 렌더 산출물의 DESIGN.md 토큰 드리프트이며
**이 plan이 도입한 것이 아니다**. 렌더 시 `design-lint 1 violation: H16 (advisory)`도 같은 성격.

### 종합에서 원시 덤프를 오라클에 먹이지 않은 이유

`normalizeSeverity('advisory')`는 `SEVERITY_ALIASES`에 그 키가 없어 **`UNKNOWN`**을 반환하고,
`decideCritique`는 `UNKNOWN`을 fail-closed로 센다(Codex R1 F2 흡수). 즉 48건을 그대로 넘기면
`DIVERGENT_UNRESOLVED`가 되는데, 그것은 이 plan의 결함이 아니라 **두 어휘의 불일치**다 —
detector의 severity 어휘(`advisory`)와 critique 오라클의 어휘가 겹치지 않는다. 게다가 그 48건은
critique loop의 계약("각 finding은 편집할 plan 섹션을 지목해야 한다")을 만족하지 못한다:
지목하는 것은 `status.html`의 줄 번호이지 이 plan의 섹션이 아니다.

따라서 오라클에는 **이 plan에 귀속되는 finding 집합**(0건)을 넘겼고, 48건은 소실시키지 않고
`codex-findings-backlog.md`에 1줄로 적재했다(§3.14 — MEDIUM 이하는 흡수하지 않고 이연).
어휘 불일치 자체도 같은 줄에 기록했다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-08-27T05:43:24.482Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
