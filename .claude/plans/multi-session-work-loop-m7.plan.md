# Plan: Multi-Session Work Loop M7 — 세션 경계 피드백 루프

**Source PRD**: `.claude/prds/multi-session-work-loop.prd.md`
**Selected Milestone**: M7 — 세션 경계 피드백 루프 (C1)
**Complexity**: Large

## Summary

한 세션에서 발견된 finding이 세션 경계를 넘지 못하고 backlog로 흘러가 사라지는 통로를 닫는다. 게이트가 **이미 구조화된 형태로 생산하고 있는** finding(패널 `l2.json`, Plan-Codex 판정, santa 라운드)을 append-only 레지스트리에 기록하고, 미해소 HIGH·CRITICAL을 다음 세션의 작업 목록에 자동으로 올리며, 그 결과로 C1(피드백 폐쇄율)이 `forward-only`에서 `computed`로 뒤집히게 한다.

M7은 게이트를 하나도 추가하지 않고 LLM 호출도 늘리지 않는다. 새로 만드는 것은 **관측·전달 층**이며, 판정 권한은 기존 게이트에 그대로 남는다.

## Producer Preflight

PRD Risks 표가 milestone 착수 시 필수로 요구하는 검사다 — *"이 milestone이 의존하는 지표의 producer가 프로덕션에서 산출하는가"*. 답은 **아니다**. 이 사실을 plan 상단에 명시하는 것이 그 완화 조항의 요구다(M4 plan 선례).

| 축 | 프로덕션 산출 여부 | 근거 |
|---|---|---|
| C1 derive source | **부재** | `plugins/mccp/scripts/derive/index.js:28` `SOURCE_SCANNERS`에 `findings` 항목이 없다. `computeC1`은 그 부재를 감지해 `forward-only` + `invalid_reason: 'no live findings derive source wired'`를 반환한다 (`plugins/mccp/scripts/lib/msw-metrics/index.js:606`) |
| receipt `findings[]` | **구조적 공백** | `--findings-file` 플래그는 `plugins/mccp/scripts/receipt/cli.js:21`에 존재하지만 **어떤 게이트 command body도 넘기지 않는다**(grep 결과 caller 0건 — `receipt-write.md` 문서 예시와 `dispatch-cli.js` worker 경로만). PRD Evidence의 "receipt 121건 중 findings 보유 1건"의 기계적 원인이 이것이다 |
| backlog | **분자가 될 수 없음** | `.claude/plans/codex-findings-backlog.md`는 이연 전용이다. 이연은 C1 해소로 계상 금지(UI5)이므로 backlog에 무엇이 얼마나 쌓이든 분자는 영구히 0이다 — 근거는 **분량이 아니라 종결 유형**이다. 규모는 오히려 반대 방향의 증거다: 206개 date-prefixed 항목 · 274KB이며(실측), 그만큼이 해소로 계상되지 않은 채 누적돼 있다 |

따라서 **C1 producer 구축은 M7의 범위이고 scope creep이 아니다.** PRD의 M8 목록(A1 완주 신호 · A2 세션 바인딩 · B3 numerator · C2·C3 귀속)에 C1은 들어 있지 않다 — C1은 M7 소관이다.

또한 이 milestone은 C1의 **소급** 라벨을 건드리지 않는다. `recoverability-undetermined`는 소급 baseline 축이고 M7이 세우는 것은 전향 기록이다. 두 축은 공존하며, M7 ship 이전의 finding은 분모에 들어가지 않는다.

## User Intent

<!-- USER-STATED constraints only. PRD는 운영자와 공동 작성된 문서이므로 그 안의
     freeze·금지·수용 조건은 사용자 발화로 취급한다. 저자 정당화는 아래
     Design Decisions에 둔다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 작업 단위 1개는 PRD milestone 1개이자 plan 1개이자 PR 1개이며 착수 후 재정의·세분화할 수 없다 | constraint |
| UI2 | Codex 이중 검사와 증거 chain, dual-review 불변식은 이번 주기에 그대로 유지한다 | exclusion |
| UI3 | 계측에 추가 LLM 호출을 도입하지 않고 이벤트는 구조화 데이터로만 기록한다 | constraint |
| UI4 | 지표 status가 computed로 뒤집히는 것만 완료 근거이며 코드 존재는 판정 근거가 아니다 | constraint |
| UI5 | 이연과 강등, 기각은 finding 해소로 계상 금지이고 유형 분리 없는 집계는 무효다 | constraint |
| UI6 | 모든 finding을 다음 세션 작업 목록에 올리면 노이즈이므로 승격 심각도 경계를 정한다 | direction |
| UI7 | 환경 토글 축의 단조 증가는 해악이며 은퇴 절차 없는 축 도입을 경계한다 | constraint |
| UI8 | 지표는 숫자로만 존재하지 않고 기존 대시보드 표면에서 추세와 함께 조회 가능해야 한다 | constraint |
| UI9 | label-protocol의 판별 기준과 밴드 집합은 계약층이며 사후 변경 금지다 | constraint |
| UI10 | milestone 착수 시 의존 지표 producer의 프로덕션 산출 여부를 검사하고 부재면 plan 상단에 명시한다 | constraint |
| UI11 | 지표별 매 측정 주기 5건을 사람이 원자료와 직접 대조하고 표본 기록을 남긴다 | constraint |
| UI12 | 팀 협업과 다중 사용자 동기화, 원격 분산 세션은 이번 PRD의 범위 밖이다 | exclusion |
| UI13 | 게이트 강도 조정은 C2·C3 측정 설계가 검정력을 입증한 뒤의 별도 축이다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/state/msw-events.js:36` | sidecar append-only writer — allowlist 필드 집합, per-field 256자 cap, per-line 8KB cap, malformed per-line skip |
| Errors | `plugins/mccp/scripts/derive/sources/handoff-items.js:68` | per-source degraded fail-open — scan 실패가 `ok:false` + `degraded:true`로 표면화되고 derive 전체를 멈추지 않는다 |
| Metrics | `plugins/mccp/scripts/lib/msw-metrics/index.js:602` | 지표 반환 shape — `status` · `integrity_ok` · `invalid_reason` · `coverage` 4축을 항상 채운다 |
| Coverage gate | `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js:36` | 승인 writer 레지스트리 + 정적 lint + 런타임 변형 감사 2축, 그리고 위협 모델의 정직한 한정 |
| Tests | `plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js:96` | claimed-computable 집합 열거 + null numerator/denominator 거부 단언 |
| Evidence | `plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js:31` | `REQUIRED_IDS` 하한 하드코딩 + manifest 항목의 test_title 실재 대조 |

## Design Decisions

### DD1 — 승격 경계는 CRITICAL·HIGH이고 상수다

PRD Open Question("어떤 심각도부터 자동 승격할 것인가")의 답이다. 새 숫자를 발명하지 않고 **CLAUDE.md §3.14가 이미 저장소를 운영하고 있는 규칙**을 승계한다 — CRITICAL·HIGH만 그 자리에서 흡수하고 MEDIUM·LOW는 backlog에 append. 승격은 그 규칙의 세션 경계 확장이므로 임계가 저장소 관행과 일치한다.

임계는 `PROMOTE_MIN_SEVERITY` **상수**이고 env 토글을 만들지 않는다(UI7). M5가 이력 보존 상한 3종을 상수로 고정한 것과 같은 이유이며, test 주입만 허용한다. §3.14는 해제 조건이 붙은 임시 규칙이므로, 그 절이 사라질 때 이 상수의 근거도 함께 재검토되도록 설계 문서에 의존 관계를 명시한다.

### DD2 — `ACCEPT_NOW`은 해소가 아니다

가장 큰 오설계 위험이 여기에 있다. Plan-Codex 판정 enum(`plugins/mccp/scripts/lib/intent-context.js:70`)의 `ACCEPT_NOW`를 곧바로 `fixed`로 매핑하면 **수용 의사를 해소로 계상**하게 된다. 판정은 plan 시점이고 수정은 implement 시점이므로 그 둘 사이에 유실이 일어나는 것이 바로 이 milestone이 닫으려는 통로다. UI5가 금지하는 강등·기각 계상과 같은 종류의 조작 경로다.

매핑은 다음과 같다. 터미널 판정만 즉시 종결로 기록하고, `ACCEPT_NOW`는 `accepted` 상태로 **열린 채** 남아 승격 대상이 된다.

| 판정 | 레지스트리 처리 | C1 분자 |
|---|---|---|
| `REJECTED_BY_DESIGN` | `closed{type:'invalidated'}` | 계상 |
| `DEFER_TO_BACKLOG` | `closed{type:'deferred'}` | 계상 금지 |
| `REJECT_YAGNI` | `closed{type:'rejected'}` | 계상 금지 |
| `ACCEPT_NOW` | `finding_adjudicated{state:'accepted'}` — 열린 채 | 아직 아님 |

`ACCEPT_NOW`가 종결 맵에서 `null`인 것은 **종결이 없다**는 뜻이지 **이벤트가 없다**는 뜻이 아니다. 그 구분을 흐리면 레지스트리가 "제기됐고 판정 대기"와 "제기됐고 수용됐다(저자가 고치기로 약속했다)"를 구별하지 못한다. 두 상태는 승격 의미가 다르고(후자는 약속이므로 다음 세션이 이어받을 대상이 명확하다) DD3의 `fixed` 판정 기준선도 다르므로, `ACCEPT_NOW`는 `finding_adjudicated` 이벤트를 남긴다.

### DD3 — `fixed`는 라운드 간 비재발로 판정한다

`ACCEPT_NOW`된 finding이 실제로 고쳐졌는지를 LLM에게 묻는 것은 UI3 위반이고 PRD Scope의 "LLM 기반 실패 원인 판정" 배제에도 걸린다. 대신 **이미 구조화되어 있는 라운드 이력**을 쓴다: 같은 작업 단위·같은 리뷰어 축에서 라운드 N에 열린 finding이 라운드 N+1에서 pass 판정과 함께 재발하지 않으면 `closed{type:'fixed'}`로 기록한다. 판정은 라운드 N+1의 emit 시점에 레지스트리의 open 집합과 diff해서 계산되며 새 호출이 없다.

이 판정의 한계를 정직히 적는다. `finding_id`는 내용 파생이므로 라운드 간 문면이 크게 바뀌면 매칭에 실패한다. 실패 시 그 finding은 **새 finding으로 계상**되어 분모를 늘리고 분자는 늘리지 않는다 — 즉 오차가 **C1을 낮게 보는 보수적 방향**으로만 작동한다. 이것이 이 설계를 방어 가능하게 만드는 유일한 성질이므로, 매칭을 관대하게 만드는 어떤 변경도 이 성질을 먼저 확인해야 한다.

### DD4 — 레지스트리는 git-tracked이고 work_unit으로 샤딩한다

레지스트리가 worktree 정리(§3.8)와 함께 사라지면 "발견과 해소 사이의 유실이 사라진다"는 M7의 표제 결과가 그 자리에서 반증된다. 그래서 `.claude/state/findings/`는 STATE.md·fix-task.md와 같은 이유로 git-tracked다(§3.2). 현재 `.gitignore`가 이 경로를 무시하지 않음을 실측 확인했다(`git check-ignore` exit 1).

샤딩 키는 **work_unit(= decision slug)** 이다. C1의 분모가 "같은 작업 단위 안"으로 정의되므로 지표 산출이 파일 1개 읽기로 끝나고, 병렬 worktree가 서로 다른 작업 단위를 잡는 통상 상황에서 같은 파일을 건드리지 않는다. 같은 작업 단위를 두 세션이 잡는 경우는 M3의 claim TTL이 이미 다루는 상황이고, append-only + `finding_id` 읽기 dedupe이므로 `merge=union`으로 합쳐도 계상이 어긋나지 않는다. **그 `merge=union` 선언은 Task 1이 소유한다** — 현재 `.gitattributes`에는 EOL 규칙만 있고 union driver가 없음을 실측 확인했다. 선언 없이 git-tracked append-only 로그를 병렬로 쓰면 병합이 한쪽 append를 조용히 버린다.

**`cited_path`는 repo-relative로 정규화해 기록한다.** 이 레지스트리는 git-tracked 감사 corpus이므로 절대경로를 실으면 §3.12가 `v1.22.4-cwd-rebind`로 이미 한 번 되돌린 누출(작업 트리 경로 · 구 worktree의 저장소명)을 그대로 재도입하게 된다. 정규화 규약은 `plugins/mccp/scripts/receipt/write.js:52` 의 `normalizeReceiptCwd`와 같다 — repo 밖 경로는 절대경로가 아니라 `<outside-repo>` placeholder로 접는다.

**아카이브는 work_unit을 바꾸지 않는다 — 파일명 변경만 바꾼다.** `slugFromPlanPath`(`plugins/mccp/scripts/receipt/decision.js:69-75`)는 경로에서 `split(/[\\/]/).pop()`으로 **basename만** 취한 뒤 `.prd.md`/`.plan.md` 확장자를 떼고 소문자화한다. 따라서 §3.11이 PRD를 `.claude/prds/archived/`로 옮겨도 slug은 동일하고, 아카이브로 인한 샤드 orphan은 **일어나지 않는다**. slug이 갈리는 경우는 PRD **파일명 자체**가 바뀔 때뿐이다.

그 경우에도 분모는 보존된다. Task 3의 derive source는 레지스트리 디렉토리의 **전 샤드를 스캔**하지 특정 slug을 조회하지 않으므로 옛 샤드가 계속 분모·분자에 들어가고, 끊기는 것은 **라운드 간 이어쓰기**뿐이다 — 새 샤드에서 시작한 finding은 옛 open 집합과 매칭되지 않아 새 finding으로 계상되며, 그 오차는 DD3의 id 매칭 실패와 **같은 보수적 방향**(분모만 증가)이다. 그럼에도 전 샤드 스캔은 명시 계약이다: derive source가 언젠가 "현재 slug만 읽기"로 좁혀지면 그 순간 분모가 조용히 줄어 **부풀리는 방향**이 열리므로, `C1-SOURCE-WIRED`가 **둘 이상의 샤드를 놓고** 합산을 단언한다.

보존은 M5 §6 원칙을 따른다 — per-file byte cap 초과 시 **삭제하지 않고 loud warn**만 한다. `msw-events.js:88`의 `evictLRU`는 채택하지 않는다. git-tracked 파일을 evict하면 이력을 재작성하게 되고, 그것이 PRD가 없애려는 "되돌릴 수 없는 압축"이다.

### DD5 — `computeC1`의 유형 분리 검사가 현재 틀렸다

`plugins/mccp/scripts/lib/msw-metrics/index.js:632`의 `typeIntegrity`는 `(deferred + downgraded + rejected) > 0`을 요구한다. 즉 **모든 finding이 실제로 고쳐진 작업 단위가 `invalid / type_separation_violated`로 판정된다.** 무결성 요구는 "비해소가 존재해야 한다"가 아니라 "유형이 분리 기록되어야 한다"이므로 이 추론은 요구를 잘못 구현한 것이다.

정정: 소스가 유형별 카운트를 **계약으로 선언**했는지(`type_separation`)를 검사하고, 합이 전체를 넘지 않는지는 그대로 유지한다. 이 정정 없이는 M7이 성공할수록 C1이 invalid가 된다.

**그 선언은 상수가 아니라 파생값이다.** 소스가 `type_separation: true`를 하드코딩하면 계약 검사는 findings 소스에 대해 영원히 참인 항진명제가 되고, 현행 추론이 (틀린 방향으로나마) 갖고 있던 런타임 반응성을 잃는다. 따라서 소스는 스캔 결과에서 파생한다 — 종결된 항목이 전부 5종 enum 안의 `closure_type`을 갖고 있을 때만 `true`이고, enum 밖 값이나 `closure_type` 없는 종결이 하나라도 있으면 `false`다. 손상된 샤드나 구 포맷이 유입되면 그 즉시 뒤집히므로 검사가 실제로 무언가를 잡는다.

이 정정은 기존 test를 깬다. `plugins/mccp/scripts/lib/tests/msw-metrics.test.js:416` 의 `'C1: feedback closure separates resolve types'`가 `type_separation` 없는 findings 모델로 computed 값을 단언하므로, 계약 검사가 들어오면 그 fixture가 invalid로 뒤집힌다. 따라서 **Task 2와 Task 3은 하나의 커밋으로 착지한다** — 계약(소비자)만 먼저 들어가면 그 사이 C1은 산출 불가가 되고, 그것은 M7이 없애려는 상태 그 자체다.

### DD6 — emit은 `record.js`가 아니라 `cli.js`에서 한다

`plugins/mccp/scripts/lib/plan-review/record.js:16` 은 스스로를 *"Pure and dep-free"* 로 선언하고 실제로 `fs` import가 **0건**이다(실측). 계측을 이 모듈에 넣으면 순수 계약이 깨지고, 그 계약의 목적("측정이 승인을 막을 수 없게 한다")도 함께 무너진다.

emit은 `plugins/mccp/scripts/lib/plan-review/cli.js:663` 의 write 경계에서 한다 — `buildReviewRecord`가 반환한 결과를 디스크에 쓰는 바로 그 지점이며, `record` 서브커맨드가 pass·halt 모든 exit path에서 실행된다는 성질은 그대로 상속된다. 순수 오라클과 I/O 경계의 분리를 지키면서 같은 커버리지를 얻는다.

### DD7 — 판정 → 종결 매핑은 레지스트리의 named export 한 곳에만 산다

DD2의 매핑이 호출부에 흩어지면 `ACCEPT_NOW`를 종결로 바꾸는 변경이 어디서든 일어날 수 있고, 그때 그것을 잡는 단일 지점이 없다. 매핑은 `findings-registry.js`의 `CLOSURE_FROM_ADJUDICATION` 상수 하나이며 `ACCEPT_NOW`의 값은 명시적으로 `null`이다. `plan-codex-runner.js`는 이 맵을 조회할 뿐 자체 분기를 갖지 않는다.

`C1-EMIT-PLAN-CODEX`는 두 가지를 단언한다 — 맵이 `plugins/mccp/scripts/lib/intent-context.js:69` 의 `ADJUDICATION_VERDICTS` **전건을 덮는다**(전사성), 그리고 `ACCEPT_NOW`의 상은 `null`이다. 새 판정 enum이 추가되면 전사성 단언이 먼저 붉어지므로 매핑 누락이 조용히 통과하지 못한다.

### DD8 — emit 실패는 막지 않되 보이게 한다

fail-open만 계약하면 디스크 실패 시 이벤트가 조용히 사라지고, 분모가 줄어든 C1이 아무 표시 없이 산출된다 — 계측층이 confidently-wrong해지는 M2의 실패 패턴 그대로다.

**1차 탐지는 마커가 아니라 데이터 자체다.** writer는 work_unit별 단조 `seq`를 부여하고, reader는 `seq` 수열의 **구멍**을 유실로 판정한다. 두 번째 write에 의존하지 않는다는 것이 요점이다 — 마커를 primary로 두면 "append가 실패한 디스크에 마커는 써진다"를 가정하게 되고, 그 가정이 깨지는 순간 가시성 기제 전체가 조용히 사라진다. `seq` 구멍은 **그 다음 성공한 write가 스스로 드러내므로** 실패한 write가 아무것도 못 남겨도 탐지된다.

`.claude/state/findings/<work_unit>.degraded` 마커는 **2차·best-effort**로 남긴다 — 실패 사유(errno·경로)를 담아 진단을 돕지만, 이것이 없어도 `seq` 축이 유실을 잡는다. fail-open 축은 그대로다: 호출자 exit code를 바꾸지 않는다.

derive source는 `seq` 구멍 수 또는 마커를 근거로 `degraded: true` + `producer_coverage: 'findings-registry-degraded'`를 emit하고, 그 값이 `computeC1`의 `coverage`로 올라간다. 즉 유실이 있었던 주기의 C1은 **유실 있음이 표시된 값**이지 깨끗한 값이 아니다.

**꼬리는 오차 방향으로 먼저 가른다.** 이전 개정은 *"말미 N개 append가 연속 실패하고 그 뒤로 성공한 write가 없으면 드러날 구멍이 없다"* 를 `seq` 설계의 한계로 기록하고 닫지 않았다. 그 기록이 빠뜨린 것이 하나 있다 — **유실 방향에 따라 C1이 낮아지기도 하고 높아지기도 한다.** `finding_closed` 유실은 분자만 줄여 C1을 낮게 보이게 하지만(보수적), `finding_opened` 유실은 **분모를 줄여 폐쇄율을 부풀린다**. 후자는 DD2가 막는 조작 경로와 결과가 같다. 따라서 "문서화로 대신한다"는 처방은 낮게 보는 방향에는 성립하고 **부풀리는 방향에는 성립하지 않는다**. 두 기제로 가른다.

1. **batch 단위 원자 append.** 한 emit 지점이 한 번에 N개 finding을 낼 때 N번 연속 append하지 않고 N줄을 **한 번의 write로** 붙인다. 부분 착지는 마지막 줄이 잘려 malformed로 격리되므로 reader가 본다(격리 규약은 `msw-events.js`에서 그대로 상속). "말미 k개만 사라지는" 상태가 애초에 만들어지지 않고 남는 것은 **batch 전체 유실** 하나다. 각 줄은 `batch_expected: N`을 싣는다 — 그 값이 batch의 **첫 줄**에 있으므로 뒤가 잘려도 기대치는 이미 디스크에 있다.
2. **부풀리는 방향은 독립 축이 잡는다.** Task 7의 런타임 falsifier는 finding **표면**(`.claude/reviews/`)의 delta가 전부 대응 `finding_opened`를 갖는지 본다. 표면은 레지스트리와 **다른 코드 경로가 다른 목적으로** 쓰므로 이것은 기록기의 기록기가 아니라 독립 관측이며 무한 후퇴가 아니다. batch 전체가 유실돼도 표면 delta가 남아 있으면 게이트가 비영점 exit한다.

따라서 M7이 주장하는 것은 정확히 이것이다 — **C1을 부풀리는 방향의 유실은 독립 축이 잡고, 잡히지 않는 잔여는 분자만 줄이는 보수적 방향뿐이다.** 잔여는 `finding_closed` batch 전체가 유실되고 그 work_unit에 이후 성공한 write가 없는 구간이며, 그 구간의 C1은 실제보다 **낮게** 보고된다. 이 잔여를 닫는다고 주장하지 않으며, 그것이 남는 이유는 무한 후퇴 회피다.

### DD9 — 2차 매칭 키는 Risks가 아니라 Task에 산다

DD3의 `(perspective, cited_path)` 2차 키가 Risks 표에만 있으면 구현되지 않는다. Task 1의 reader가 `matchKey`를 노출하고, 라운드 간 매칭은 `finding_id` 우선 · 실패 시 `matchKey` 순으로 시도한다. 두 필드는 이미 allowlist에 있으므로 스키마 변경이 아니라 reader 계약의 명시다.

2차 키가 DD3의 보수성을 뒤집지 않는지가 관건이다. `matchKey` 매칭은 **더 많은 재발을 인식**하므로 분모를 줄이는 방향(= C1을 높이는 방향)으로 작동한다. 따라서 세 제약을 건다: `cited_path`가 없는 finding에는 적용하지 않고, 같은 `matchKey`에 후보가 둘 이상이면 매칭하지 않으며, `<outside-repo>` placeholder는 2차 키에서 **제외**한다. 셋째가 필요한 이유는 그 값이 서로 다른 여러 경로가 접힌 결과라 무관한 finding들을 인위적으로 한 키에 합류시키기 때문이다 — 앞의 두 제약만으로는 그 합류가 "단일 후보"로 보일 수 있다.

**`cited_path`는 리뷰어가 주장한 값이지 검증된 사실이 아니다.** 출처가 Codex·패널 finding 본문이므로 환각이거나 무관한 경로일 수 있다. 레지스트리는 그것을 **기록만 하고 열지도 실행하지도 해석하지도 않는다** — 기계적 소비처는 위 2차 키 하나뿐이고, 세 제약이 그 축을 막는다. 승격(Task 5)은 그 경로를 **작업 목록에 표면화할 뿐 권한을 주지 않으며**, 무엇을 고칠지는 운영자가 정한다. 이 한정을 적어 두는 이유는, 적지 않으면 다음 사이클이 `cited_path`를 신뢰 입력으로 취급해 그 위에 기능(자동 파일 열기·자동 수정 대상 선정)을 얹을 수 있기 때문이다.

**남는 비용을 "노이즈"라고 부르면 틀린다 — 승격 표면의 독자는 사람이 아니라 다음 세션의 모델이다.** 앞 문단은 *권한* 축을 정확히 닫지만(경로를 적는다고 그 경로에 대한 권한이 생기지 않는다), 그 사실만으로 축이 하나 더 있다는 것을 가릴 수는 없다. Task 5는 리뷰어가 쓴 문자열(`cited_path`와 함께 실리는 항목 문면)을 `state-injector.js`의 주입 블록에 넣고, 그 블록은 다음 세션의 `<system-reminder>`로 들어간다. 즉 **미검증 외부 텍스트가 프롬프트 표면에 도달하는 경계**이며, 사람이 읽는 목록에 대해서는 "노이즈"가 맞는 서술이지만 모델이 읽는 컨텍스트에 대해서는 맞지 않는다. 승격 대상이 CRITICAL·HIGH로 좁혀져 있다는 것(DD1)과 건수가 상한으로 잘린다는 것(`PROMOTE_MAX_ITEMS`)은 **분량**의 방어이지 **내용**의 방어가 아니다.

이 경계는 저장소가 이미 한 번 닫아 둔 것이므로 새로 발명하지 않고 승계한다 — §3.13의 `<user_intent_reference>` 주입이 정확히 같은 문제(리뷰어·저자가 쓴 텍스트를 리뷰어 프롬프트에 싣는다)를 풀었다. Task 5는 `intent-context.js`의 파이프라인을 그대로 재사용한다: 유한 엔티티 **1회 비재귀** 디코드(`decodeBoundedEntities`) → **역슬래시 우선** 이스케이프(`escapeReferenceText`) → 길이 상한 + 홀수 trailing 역슬래시 제거(`trimDanglingEscape`), 그리고 토큰 내 mixed-script(`anyTokenMixedScript`)와 지시문 형태(`looksDirective`)는 항목을 **주입에서 제외**한다(레지스트리 기록 자체는 남긴다 — 관측을 지우지 않는 것이 DD8과 같은 원칙이다). `cited_path`는 산문이 아니라 **데이터로 렌더한다**(백틱 코드 스팬) — 문장 안에 벌거벗은 경로로 두면 그 줄이 지시로 읽힐 여지가 생긴다.

**리뷰어의 "privilege escalation" 프레이밍은 채택하지 않고 기각한다.** 그 논거는 "Codex 출력이 다음 세션의 작업 목록에 들어갈 파일을 정한다"인데, Codex 출력이 신뢰 불가라는 전제를 받아들이면 M7이 아니라 **plan-codex 게이트 자체**가 훨씬 직접적으로 무너진다 — 그 게이트의 finding은 이미 저자가 읽고 5.5a에서 판정해 계획을 고치는 입력이다. M7의 레지스트리는 그 텍스트의 **사본을 하나 더** 만들 뿐 새 권한도 새 신뢰도 부여하지 않으므로, 이것을 M7이 도입한 상승으로 계상하면 기존 게이트의 신뢰 근거를 이 milestone에 잘못 청구하는 것이다. 실제로 새로운 것은 위 문단의 **주입 표면 도달**뿐이고, 그것이 이 흡수가 닫는 것이다.

### DD10 — Task 2·3의 동시 착지는 산문이 아니라 정적 검사로 강제한다

"하나의 커밋으로 착지한다"는 규율일 뿐 기제가 아니다. 소비자(계약 검사)만 먼저 들어가면 그 사이 C1은 산출 불가가 되고, 그것을 잡는 것이 아무것도 없다.

Task 7의 coverage gate가 **정적 co-presence 검사**를 함께 소유한다: `computeC1`이 `type_separation` 계약을 요구하면, `SOURCE_SCANNERS`에 등록된 `findings` 소스가 그 필드를 선언해야 한다. 한쪽만 있으면 gate가 비영점 exit한다. 이 검사는 커밋 단위가 아니라 **트리 상태**를 보므로, 분할 착지가 일어난 순간의 트리에서 붉어진다 — 커밋 경계를 감시하는 것보다 강하고 단순하다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/state/findings-registry.js` | CREATE | append-only finding 레지스트리 — writer + reader + `finding_id` 파생 + 종결 유형 enum |
| `plugins/mccp/scripts/derive/sources/findings.js` | CREATE | C1 derive source — 레지스트리를 읽어 유형별 카운트와 `type_separation` 계약을 emit |
| `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js` | CREATE | emit 지점 레지스트리 + 정적 lint + 런타임 falsifier (C1 승격을 반증 가능하게 종속) |
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | DD5 유형 분리 계약 정정 + `open_count`/이연률 병기 |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | `SOURCE_SCANNERS`에 `findings` 등록 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | 패널 finding emit — `record` 서브커맨드의 write 경계. `record.js`가 아니다(아래 DD6) |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATE | Codex finding emit + 판정 verdict → 종결 유형 매핑 (DD2) |
| `plugins/mccp/scripts/lib/santa/seal.js` | UPDATE | santa 라운드 finding emit + 라운드 간 비재발 종결 (DD3) |
| `plugins/mccp/scripts/state/handoff-items.js` | UPDATE | `enumerateUnfinishedItems`에 `finding` 유형 추가 (승격 경로) |
| `plugins/mccp/scripts/state/state-injector.js` | UPDATE | 승격된 finding을 주입 블록으로 표면화 (상한 있음) |
| `plugins/mccp/scripts/derive/sources/handoff-items.js` | UPDATE | `by_type` 분해 보고 — 승격이 A4 분모 구성을 바꾸는 것을 관측 가능하게 |
| `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` | UPDATE | C1 행에 폐쇄율과 이연률을 분리 표기 (UI8) |
| `plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js` | UPDATE | `REQUIRED_IDS`에 C1 계열 추가 (`## Assertion Roster`와 1:1) |
| `plugins/mccp/scripts/lib/tests/findings-registry.test.js` | CREATE | Task 1 소유 test |
| `plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js` | CREATE | Task 2~5 소유 test |
| `plugins/mccp/scripts/lib/tests/c1-coverage-gate.test.js` | CREATE | Task 7 소유 test |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATE | 기존 C1 fixture(`'C1: feedback closure separates resolve types'`)가 `type_separation`을 선언하지 않아 Task 2 계약 검사에 회귀한다 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` | UPDATE | C1 렌더 단언 추가 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js` | UPDATE | C1을 forward-only에서 claimed-computable로 승격 |
| `plugins/mccp/scripts/lib/tests/msw-derive-sources.test.js` | UPDATE | `findings` source 등록 단언 |
| `.gitattributes` | UPDATE | 레지스트리 glob에 `merge=union` — append-only 로그의 병합 계약. **Task 1 소유**이며 같은 Task의 `C1-MERGE-UNION`이 `git check-attr`로 단언하고 Task 7의 `C1-GATE-MERGE-UNION`이 게이트로 재판정한다 |
| `docs/multi-session-work-loop/feedback-loop-design.md` | CREATE | 설계 계약 — 승격 경계 근거, 종결 유형 매핑, DD3 한계 |
| `docs/multi-session-work-loop/measurement-design.md` | UPDATE | C1 절의 소스 서술을 실제 배선으로 갱신 |
| `docs/multi-session-work-loop/m7-before.json` | CREATE | 착수 시점 C1 상태 봉인 |
| `docs/multi-session-work-loop/m7-after.json` | CREATE | ship 시점 C1 상태 (전후 대조) |
| `docs/multi-session-work-loop/m7-audit-sample.json` | CREATE | UI11 감사 표본 5건 |
| `docs/multi-session-work-loop/m7-assertion-manifest.json` | CREATE | 단언 매니페스트 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | M7 행 status + Plan 셀 + 승격 경계 Open Question 해소 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 patch — 착수 시 목표 `1.27.3`, PR 직전 재계산) |
| `CHANGELOG.md` | UPDATE | 새 항목 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |

## TDD Ownership

각 Task의 `Validate`가 **뒤 Task가 만들 산출물을 가리키지 않도록** 소유권을 고정한다(M6 R3 흡수 선례). 표 밖의 test 파일을 Validate에 쓰는 것은 순환이다.

| Test file | 생성 Task | 확장 Task |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/findings-registry.test.js` | Task 1 | — |
| `plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js` | Task 2 | Task 3 · 4 · 5 |
| `plugins/mccp/scripts/lib/tests/c1-coverage-gate.test.js` | Task 7 | — |
| `plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` | 기존 | Task 6 |
| `plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js` | 기존 | Task 8 |
| `plugins/mccp/scripts/lib/tests/msw-derive-sources.test.js` | 기존 | Task 3 |

## Assertion Roster

`node --test <dir>`는 *"돌린 test가 통과했다"*만 말하고 *"요구한 test가 있다"*는 말하지 않는다. 그래서 각 Task의 Validate에 흩어진 단언 id를 여기 한 번 평면 열거한다(M6 plan 선례). 이 목록이 `m7-assertion-manifest.json`의 항목 집합이자 `assertion-manifest-check.js`의 `REQUIRED_IDS` 하한과 **1:1**이며, 그 대조기가 (1) manifest가 하한을 전부 담는지 (2) 각 `test_title`이 실제 `test()` 호출로 실재하는지를 기계 검사한다. Task 본문에만 있고 여기 없는 id, 또는 그 역은 **드리프트**다.

이 절은 §3.9 H4(한 화면 항목 수 상한)의 collapse 대상이 아니다 — `## User Intent`·`## Files to Change`와 같은 이유로, 기계 파서가 읽는 계약 표면이기 때문이다.

- **Task 1** (8) — `C1-REGISTRY-APPEND` · `C1-REGISTRY-ALLOWLIST` · `C1-REGISTRY-TRACKED` · `C1-ID-SECONDARY-KEY` · `C1-REGISTRY-PATH-NORMALIZED` · `C1-DEGRADED-MARKER` · `C1-BATCH-ATOMIC` · `C1-MERGE-UNION`
- **Task 2** (4) — `C1-TYPE-SEPARATION-CONTRACT` · `C1-TYPE-COLLAPSE-REJECTED` · `C1-DEFER-NOT-CLOSURE` · `C1-SOURCE-REGISTERED-COPRESENT`
- **Task 3** (1) — `C1-SOURCE-WIRED`
- **Task 4** (5) — `C1-EMIT-PLAN-REVIEW` · `C1-EMIT-PLAN-CODEX` · `C1-EMIT-SANTA` · `C1-EMIT-FAILOPEN` · `C1-EMIT-LOSS-VISIBLE`
- **Task 5** (5) — `C1-PROMOTE-THRESHOLD` · `C1-PROMOTE-CONSTANT` · `C1-PROMOTE-BOUNDED` · `C1-A4-DENOMINATOR-REPORTED` · `C1-PROMOTE-SANITIZED`
- **Task 6** (1) — `C1-RENDER-SPLIT`
- **Task 7** (6) — `C1-COVERAGE-STATIC` · `C1-COVERAGE-REGISTRY-WRITER` · `C1-ACCEPTANCE-MECHANIZED` · `C1-COVERAGE-RUNTIME` · `C1-CONTRACT-COPRESENT` · `C1-GATE-MERGE-UNION`
- **Task 8** (1) — `C1-ACCEPTANCE-PROMOTED`

합 **31**. 라운드가 흡수를 더하면 이 수는 늘고, 그때 갱신 대상은 이 절 · manifest · `REQUIRED_IDS` 셋이다(Task 8 소관). 숫자를 Acceptance 체크박스에 리터럴로 적지 않는 이유는 그 두 곳이 어긋나기 때문이며, 대조 권한은 `assertion-manifest-check.js`에 있다.

## Tasks

### Task 1: finding 레지스트리 기판

- **Action**: `plugins/mccp/scripts/state/findings-registry.js` 신설. 두 이벤트 `finding_opened` / `finding_closed`를 `.claude/state/findings/<work_unit>.jsonl`에 append한다. allowlist 필드: `kind` · `ts` · `finding_id` · `work_unit` · `gate_id` · `perspective` · `severity` · `claim_digest` · `cited_path` · `session_id` · `round` · `state` · `closure_type` · `seq` · `event_id` · `batch_expected`. `kind` enum은 `finding_opened` · `finding_adjudicated` · `finding_closed` 3종이다. `finding_id`는 `(work_unit, gate_id, perspective, severity, normalizedClaim)`의 sha256 앞 16자이고 `normalizedClaim`은 소문자화 + 공백 축약 + 구두점 제거 후 절단이다. reader는 `finding_id`로 dedupe하고 종결은 last-write-wins로 접으며, DD9대로 `matchKey = (perspective, cited_path)`를 2차 매칭 키로 노출한다(둘 이상 후보이거나 `cited_path` 부재면 미적용). per-file cap 초과 시 loud warn만 하고 evict하지 않는다(DD4). 종결 유형 enum은 `fixed` · `invalidated` · `deferred` · `downgraded` · `rejected` 5종이고 앞 둘만 해소다. DD7의 `CLOSURE_FROM_ADJUDICATION` 맵, DD8의 work_unit별 단조 `seq` 부여와 reader의 구멍 탐지, 그리고 2차 `.degraded` 마커 writer도 이 모듈이 소유한다. **append API는 batch를 1급으로 받는다** — `appendFindings(events[])`가 N줄을 한 번의 `fs.writeSync`로 붙이고 각 줄에 `batch_expected: N`을 싣는다(DD8 1항). 단건 append는 N=1인 batch이므로 별도 경로가 아니다. 순차 N회 append를 허용하는 공개 API를 두지 않는 것이 요점이다 — 두면 호출자가 그 경로를 택하는 순간 DD8이 없앤 "말미 k개 유실"이 되돌아온다. reader는 `seq`로 **정렬한 뒤** 구멍을 판정하고(정렬 전 판정은 `merge=union` 이 줄 순서를 바꿀 여지를 무시한다), 중복 `seq`는 구멍과 **다른 신호**로 분류해 `degraded`에 올린다. **`seq` 생성에 락을 걸지 않는 것은 의도다.** writer는 `O_APPEND` 단일 write에만 의존하고(부분 착지 없음) 파일 끝에서 `seq`를 계산하므로, 두 프로세스가 같은 work_unit을 동시에 잡으면 같은 번호를 낼 수 있다 — M3 claim TTL이 통상 경로를 막지만 보장은 아니다. 락 대신 **탐지**를 택한 이유는 evidence write lock(§3.6)이 fail-closed라 계측이 게이트를 막게 되고, 그것이 DD8이 지키려는 성질을 정면으로 깨기 때문이다. 탐지는 두 축이다: 정렬 후 동값 인접(중복), 그리고 **`max(seq)`와 고유 `seq` 개수의 불일치** — 후자가 있어야 "6이 유실되고 5가 중복돼 구멍이 안 보이는" 상태가 잡힌다. 둘 중 하나라도 걸리면 `degraded`이고 그 주기의 C1은 유실 표시가 붙은 값이 된다. **중복이 계상을 바꾸지는 않는다** — `seq`는 유실 **탐지 전용 축**이고 계상 키는 `finding_id`다. 따라서 중복 `seq`를 가진 두 줄은 id가 같으면 하나로 접히고(기존 dedupe) 다르면 둘 다 계상되며, `seq`를 보고 어느 쪽을 버리는 분기는 존재하지 않는다. 탐지 축이 계상 축을 건드리면 유실 신호가 조용히 데이터를 바꾸게 되고, 그것은 관측이 아니라 개입이다. `cited_path` 정규화는 **레지스트리 내부의 단일 초크 포인트**다 — 호출자는 있는 그대로 넘기고 `appendFinding`이 기록 직전에 정규화한다. 호출자 책임으로 두면 emit 지점 3곳 중 하나만 빠져도 절대경로가 새고, 그 누락을 잡을 지점이 없다. 초크 포인트를 우회하는 유일한 방법은 레지스트리 경로에 직접 write하는 것인데, 그것은 Task 7 coverage gate의 승인 writer 레지스트리가 정적으로 거부한다 — **그 레지스트리는 finding 표면(`.claude/reviews/`)과 레지스트리 경로(`.claude/state/findings/`) 두 표면을 함께 덮으며**, 후자를 빼면 이 문장은 근거 없는 주장이 된다(그 누락이 R6 security 지적의 내용이다). 두 기제가 함께 있어야 "단일 초크 포인트"가 주장이 아니라 사실이 된다. **`.gitattributes`에 `.claude/state/findings/*.jsonl merge=union` 을 넣는 것도 이 Task의 작업이다**(glob을 여기 명시하는 이유는 미지정 glob이 미래 work_unit 이름에 안 걸려도 아무도 모르기 때문이다) — 표에만 있고 어느 Task도 소유하지 않으면 병합 안전성이 근거 없는 주장으로 남는다.
- **Mirror**: `plugins/mccp/scripts/state/msw-events.js:36` 의 allowlist·cap·malformed 격리 3축을 그대로 옮긴다. `sanitizeField`의 number/boolean 타입 보존 규칙도 함께 옮긴다 — 문자열 강제는 `round: 0`을 truthy로 만든다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/findings-registry.test.js` — 같은 finding 재관측 멱등(`C1-REGISTRY-APPEND`) · allowlist 밖 필드 미영속(`C1-REGISTRY-ALLOWLIST`) · `.claude/state/findings/` 가 어떤 canonical ignore 항목에도 매칭되지 않음(`C1-REGISTRY-TRACKED`) · 2차 키가 단일 후보에서만 매칭되고 다중 후보에서 미적용(`C1-ID-SECONDARY-KEY`) · 절대경로 `cited_path`가 repo-relative 또는 `<outside-repo>`로 접히고 원본이 디스크에 남지 않음(`C1-REGISTRY-PATH-NORMALIZED`) · `.degraded` 마커가 실패 사유와 함께 생성되고 reader가 읽어 `degraded:true`로 올림(`C1-DEGRADED-MARKER`) · N개 finding batch가 **단일 write**로 착지하고 각 줄이 `batch_expected: N`을 갖되, 마지막 줄을 잘라낸 파일에서 reader가 `batch_expected`와 실제 줄 수의 불일치를 `degraded`로 올림(`C1-BATCH-ATOMIC` — 순차 append 공개 API가 존재하지 않음도 함께 단언한다. DD8이 없앤 "말미 k개 유실"이 API 표면으로 되돌아오는 것을 막는 유일한 지점이다) · 레지스트리 경로의 `merge` attribute가 `union`으로 해석됨(`C1-MERGE-UNION` — test 본문이 `execFileSync('git', ['check-attr', 'merge', '--', <path>])`로 git에게 직접 묻는다. 파일 내용 grep이 아니고, `.gitattributes` 문자열 단언도 아니다 — 선언이 있어도 glob이 어긋나면 미적용이기 때문이다. 실제 work_unit 경로 **하나**와 아직 존재하지 않는 임의 이름 **하나**를 함께 물어 glob이 특정 파일이 아니라 패턴에 걸리는지 확인한다) · cap 초과가 warn이고 unlink 아님.

### Task 2: computeC1 유형 분리 계약 정정

- **Action**: `plugins/mccp/scripts/lib/msw-metrics/index.js:632` 의 `(deferred + downgraded + rejected) > 0` 추론을 소스의 `type_separation === true` 계약 검사로 교체한다(DD5). 합이 전체를 넘지 않는 검사는 유지한다. 반환에 `open_count`와 `deferred_rate`를 추가한다 — 산출식이 "이연률을 함께 보고한다"를 요구하기 때문이다.
  **`degraded`는 `status`를 뒤집지 않는다.** 소스가 `seq` 구멍·중복·malformed로 `degraded: true`를 올려도 C1은 여전히 `computed`이고, 그 사실은 `coverage`에 실린다(DD8: "유실이 있었던 주기의 C1은 **유실 있음이 표시된 값**이지 깨끗한 값이 아니다"). `invalid`로 뒤집지 않는 이유는 유실이 대부분 분자만 줄이는 보수적 방향이라 값이 여전히 하한으로서 유효하고, 계측 결함이 지표를 통째로 지우면 M2가 겪은 "산출 0개"로 되돌아가기 때문이다. 대신 **배송 증거로는 쓰지 않는다** — Task 7 `--acceptance`가 degraded를 거부하므로, "지표는 읽되 degraded 값으로 milestone을 완료 선언하지는 못한다"가 계약이다. 두 층을 분리하지 않으면 둘 중 하나가 반드시 틀린다.
  기존 fixture `plugins/mccp/scripts/lib/tests/msw-metrics.test.js:416` 이 계약을 선언하지 않아 회귀하므로 같은 Task에서 `type_separation: true`를 넣는다. **이 Task는 Task 3과 하나의 커밋으로 착지한다** — 계약만 먼저 들어가면 그 사이 C1이 산출 불가가 된다. 그 원자성은 산문이 아니라 **이 Task가 만드는 test 파일 안**에서 강제한다: `c1-feedback-loop.test.js`가 `SOURCE_SCANNERS`에 `findings` 키가 실재하는지를 직접 단언하므로(`C1-SOURCE-REGISTERED-COPRESENT`), Task 2만 착지한 트리에서는 **Task 2 자신의 test가 붉어진다**. DD10의 coverage gate는 Task 7이 만들어 그 시점 이후의 트리 상태를 보는 축이고, 이 단언은 `node --test`가 매 Task 검증 루프에서 도는 **pre-commit 축**이다 — 두 축의 시점이 다르므로 중복이 아니다. R6 invariant 지적("gate는 post-commit이라 Task 2-only 트리를 아무도 못 본다")이 닫히는 지점이 정확히 여기다.
- **Mirror**: `plugins/mccp/scripts/lib/msw-metrics/index.js:602` 의 4축 반환 shape. `invalid_reason`은 새 사유 `type_separation_undeclared`를 쓰고 기존 `type_separation_violated`는 합 초과 전용으로 남긴다 — 두 실패는 원인이 다르므로 한 이름으로 접으면 진단이 사라진다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js plugins/mccp/scripts/lib/tests/msw-metrics.test.js` — 비해소 0인 전건 해소가 `computed`(`C1-TYPE-SEPARATION-CONTRACT`) · `type_separation` 미선언 소스가 `invalid`(`C1-TYPE-COLLAPSE-REJECTED`) · 이연·강등·기각이 분자에 미포함(`C1-DEFER-NOT-CLOSURE`) · `SOURCE_SCANNERS`에 `findings` 키 실재(`C1-SOURCE-REGISTERED-COPRESENT` — Task 3 미착지 트리에서 이 Task의 test가 붉어지는 pre-commit 장벽) · 기존 C1 fixture 무회귀.

### Task 3: derive source 배선

- **Action**: `plugins/mccp/scripts/derive/sources/findings.js` 신설 — 레지스트리 전 샤드를 스캔해 `{ ok, count, closed_count, deferred_count, downgraded_count, rejected_count, open_count, type_separation: true, producer_coverage: 'findings-registry', degraded, invalid_count, error }`를 반환한다. `plugins/mccp/scripts/derive/index.js:28` 의 `SOURCE_SCANNERS`에 `findings` 키로 등록한다.
- **Mirror**: `plugins/mccp/scripts/derive/sources/handoff-items.js:68` 의 per-source degraded fail-open. 샤드 1개의 파싱 실패는 `invalid_count++`이고 전체 스캔을 중단하지 않는다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js plugins/mccp/scripts/lib/tests/msw-derive-sources.test.js` — `findings`가 `SOURCE_SCANNERS`에 실재하고 실 derive가 C1을 `computed`로 반환하며, **서로 다른 두 work_unit 샤드를 놓았을 때 양쪽이 합산**된다(`C1-SOURCE-WIRED` — DD4의 orphan 보존 성질이 "현재 slug만 읽기"로 조용히 좁혀지면 이 단언이 붉어진다).

### Task 4: emit 배선 3지점

- **Action**: 세 지점에서 `finding_opened`를 emit한다. (1) `plugins/mccp/scripts/lib/plan-review/cli.js:663` 의 record write 경계 — DD6대로 순수 모듈이 아니라 I/O 경계에 두며, `record` 서브커맨드가 pass·halt 모든 exit path에서 실행된다는 성질을 상속한다. (2) `plugins/mccp/scripts/lib/plan-codex-runner.js` 의 판정 소비 지점 — DD7의 `CLOSURE_FROM_ADJUDICATION` 맵을 조회할 뿐 자체 분기를 갖지 않는다 — 상이 `null`이 아니면 `finding_closed`를, `null`(= `ACCEPT_NOW`)이면 `finding_adjudicated{state:'accepted'}`를 emit한다. **판정을 받은 finding이 아무 이벤트도 남기지 않는 경로는 없다.** (3) `plugins/mccp/scripts/lib/santa/seal.js` 의 라운드 집계 지점 — DD3의 라운드 간 비재발 종결을 여기서 계산한다. emit 실패는 DD8을 따른다 — 호출자 exit code 불변(fail-open) + `seq` 구멍(1차 탐지) + `.degraded` 마커(2차 진단).
- **Mirror**: `plugins/mccp/scripts/lib/plan-review/record.js:16` 의 "측정이 승인을 막을 수 없다" 계약. emit 실패 처리가 같은 성질을 갖되, DD8이 그 계약에 가시성 축을 더한다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js` — 패널 finding emit(`C1-EMIT-PLAN-REVIEW`) · 매핑이 `ADJUDICATION_VERDICTS` 전건을 덮고 `ACCEPT_NOW`의 상이 `null`이며, 그 판정이 `finding_adjudicated{state:'accepted'}`를 남기되 `finding_closed`는 남기지 않는다(`C1-EMIT-PLAN-CODEX` — 맵의 형태와 **행동 귀결**을 함께 단언한다) · santa 라운드 비재발 종결(`C1-EMIT-SANTA`) · emit throw가 호출자 exit code를 바꾸지 않음(`C1-EMIT-FAILOPEN`) · emit 실패가 `seq` 구멍으로 드러나고 그 값이 C1 `coverage`에 도달(`C1-EMIT-LOSS-VISIBLE`). 이 test는 fs mock이 아니라 **실제 쓰기 불가 경로**(tmpdir 하위의 존재하지 않는 디렉토리)로 실패를 만든다 — mock 성공 경로만 검사하면 그 단언은 자기 자신만 증명한다.

### Task 5: 승격 — 작업 목록과 주입 표면

- **Action**: `plugins/mccp/scripts/state/handoff-items.js:125` 의 `enumerateUnfinishedItems`에 4번째 유형 `finding`을 추가한다. 열거 대상은 severity가 `PROMOTE_MIN_SEVERITY`(상수 `HIGH`) 이상이고 open인 finding이며, 상한 `PROMOTE_MAX_ITEMS`(상수)로 절단하고 절단 건수를 함께 보고한다. `plugins/mccp/scripts/state/state-injector.js:169` 의 `inject`에 `## Open Findings` 블록을 추가한다 — 상위 항목만 펼치고 나머지는 건수로만 적어 A3 점유를 방어한다. `plugins/mccp/scripts/derive/sources/handoff-items.js` 에 `by_type` 분해를 추가해 승격이 A4 분모 구성을 바꾸는 것이 관측되게 한다.
  **주입 텍스트는 DD9의 신뢰 경계 처리를 거친다.** 블록에 실리는 리뷰어 문자열(`cited_path` + 항목 문면)은 `intent-context.js`의 함수를 **재사용**한다 — `decodeBoundedEntities` → `escapeReferenceText` → 길이 상한 + `trimDanglingEscape`, 그리고 `anyTokenMixedScript` 또는 `looksDirective`에 걸리는 항목은 주입에서 제외하고 제외 건수만 적는다(레지스트리 기록은 그대로 남는다). 새 sanitizer를 쓰지 않는 것이 요점이다 — 두 벌을 두면 §3.13이 이미 닫은 경계가 이쪽에서만 조용히 열린다. `cited_path`는 백틱 코드 스팬으로 렌더해 데이터임을 표시한다.
- **Mirror**: `plugins/mccp/scripts/state/handoff-items.js:247` 의 `restoreAndMatch` 중복 계상 방지 — `seen` Set으로 같은 항목이 여러 handoff 파일에 있어도 한 번만 센다. finding 유형도 같은 규칙을 받는다. 주입 텍스트 처리는 `plugins/mccp/scripts/lib/intent-context.js:423`(`escapeReferenceText` — 역슬래시 우선)과 `:437`(`trimDanglingEscape`)을 **호출**해 승계한다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js` — MEDIUM 미승격(`C1-PROMOTE-THRESHOLD`) · 임계가 env로 열려 있지 않음(`C1-PROMOTE-CONSTANT`) · 주입 블록 상한 준수(`C1-PROMOTE-BOUNDED`) · A4 분모의 `by_type` 보고(`C1-A4-DENOMINATOR-REPORTED`) · 주입 경계 처리(`C1-PROMOTE-SANITIZED` — 지시문 형태 finding이 주입 블록에서 **제외**되되 레지스트리에는 남고, 엔티티 인코딩된 `&lt;`가 1회 디코드 후 이스케이프되어 원문 마커로 복원되지 않으며, 상한 절단이 홀수 trailing 역슬래시를 남기지 않음을 단언한다. 단언 대상은 `intent-context.js` 함수의 재구현이 아니라 **호출 여부와 그 귀결**이다).

### Task 6: 대시보드 표면

- **Action**: `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:86` 의 C1 항목이 폐쇄율과 이연률을 **분리 표기**하도록 한다. 단일 폐쇄율만 보이면 이연으로 100%를 만드는 경로가 표면에서 보이지 않으므로 UI5의 유형 분리가 렌더 층에서 무너진다. 강조색 1개 · heading depth 3 이하 제약(§3.9)을 유지한다.
- **Mirror**: `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js:19` 의 `METRICS_ORDER`와 상태 아이콘 규약. forward-only 중립 톤 규칙을 깨지 않는다.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js` — 폐쇄율과 이연률이 **각각 별개 수치로** 렌더되고 단일 값으로 접히지 않음(`C1-RENDER-SPLIT`). 그리고 `node plugins/mccp/scripts/derive/cli.js render` 후 `.claude/cache/STATUS.md`에 C1 행의 두 수치가 실재하는지 확인.

### Task 7: C1 coverage gate

- **Action**: `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js` 신설. 2축이다. **정적 lint** — 덮는 표면이 **둘**이고 **표면마다 승인 집합이 다르다**. 하나의 목록으로 뭉뚱그리면 레지스트리 축이 표면 축의 넓은 목록을 물려받아 초크 포인트 주장이 무력해지므로, 두 상수를 분리해 선언한다.

  | 상수 | 표면 | 승인 writer | 위반의 의미 |
  |---|---|---|---|
  | `APPROVED_SURFACE_WRITERS` | `.claude/reviews/` | `plugins/mccp/scripts/lib/plan-review/record.js` · `plugins/mccp/scripts/lib/santa/seal.js` | 계측되지 않은 finding 표면 writer — 표면 delta가 대응 이벤트 없이 생긴다 |
  | `APPROVED_REGISTRY_WRITERS` | `.claude/state/findings/` | `plugins/mccp/scripts/state/findings-registry.js` **단 하나** | Task 1의 단일 초크 포인트 우회 — 정규화되지 않은 절대경로가 git-tracked corpus에 실린다 |

  emit 지점 3곳(`plan-review/cli.js` · `plan-codex-runner.js` · `seal.js`)은 **레지스트리 승인 목록에 들어가지 않는다** — 그것들은 `appendFindings()`를 *호출*할 뿐 레지스트리 경로에 직접 write하지 않으며, 목록에 넣는 순간 초크 포인트가 넷이 되어 주장이 거짓이 된다. 판별 방식은 Mirror(`b2-coverage-gate.js`)와 동일한 **경로 리터럴 정적 스캔**이다: 소스 트리에서 각 표면의 경로 조각을 담은 파일을 열거하고, 그 집합이 해당 상수의 상집합이면 실패한다(집합 차를 파일명으로 보고한다). AST 분석이 아니므로 동적으로 조립된 경로는 원리상 못 본다 — 그 한계는 아래 위협 모델 한정에 이미 포함되며, 런타임 falsifier가 그 축을 담당한다. **런타임 falsifier** — finding 표면(`.claude/reviews/`)의 사전·사후 스냅샷 delta가 전부 대응 `finding_opened` 이벤트를 갖는지 파일시스템 결과로만 판정한다. 이 축은 **DD8의 batch 전체 유실 중 부풀리는 방향을 잡는 독립 관측**이기도 하다 — 표면은 레지스트리와 다른 코드 경로가 다른 목적으로 쓰므로 기록기의 기록기가 아니다. 정적 축은 두 개를 더 소유한다. (1) DD10의 **co-presence 검사** — `computeC1`이 `type_separation`을 요구하는데 등록된 `findings` 소스가 그것을 선언하지 않으면(또는 그 역) 비영점 exit. (2) **`merge=union` 적용 검사** — `git check-attr merge`를 레지스트리 경로와 아직 없는 임의 이름 양쪽에 물어 `union`이 아니면 비영점 exit. 이것을 Validation 블록의 수동 명령으로만 두면 게이트는 잘못 설정된 인프라 위에서도 통과한다. 병합 안전성이 게이트 안에 있어야 하는 이유는 그것이 조용한 데이터 손실을 막는 유일한 설정이기 때문이다. (3) **`--acceptance` 모드** — 이 milestone의 수용 조건 중 기계 판정 가능한 것을 **하나의 비영점-exit 명령**으로 모은다: 레지스트리 파일 실재 · **HEAD 커밋에 실재**(`git cat-file -e HEAD:<path>` — `git ls-files --error-unmatch`는 index 등재만 증명하고 commit 을 증명하지 않으므로 쓰지 않는다. 실측: `git add` 직후 통과한다) · `merge=union` 적용 · `metrics.C1.status === 'computed'` ∧ numerator/denominator non-null ∧ **`coverage`가 degraded 아님**(Task 2 — degraded는 지표 산출을 막지 않지만 배송 증거로는 쓰지 않는다) · `m7-audit-sample.json`의 5건이 전부 `matches:true`이고 그 `computed_denominator`가 라이브 산출과 일치. 이 모드가 필요한 이유는 R6 invariant 지적 그대로다 — 수용 조건이 산문 체크리스트로만 있으면 **건너뛰어도 PR이 통과**하므로 "코드 존재는 판정 근거가 아니다"(UI4)를 스스로 위반한다. 모드를 **opt-in으로 분리**하는 것은 정직성 요구다: 레지스트리 파일 실재를 default 모드에서 요구하면 아직 패널을 한 번도 돌리지 않은 fresh clone에서 게이트가 붉어져, 저장소 일반 불변식과 이 milestone의 배송 증거가 뒤섞인다. 위협 모델을 정직히 한정한다: 겨냥 대상은 *우발적 미계측 emit 지점*이고 repo write 권한을 가진 적대적 위조자가 아니다. `--acceptance`도 마찬가지로 *건너뛰기*를 막고 *위조*를 막지 않는다 — 조건을 만족시키는 가짜 아티팩트를 손으로 만들 수 있는 행위자는 이 모드가 겨냥하는 대상이 아니다.
- **Mirror**: `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js:36` 의 `APPROVED_WRITERS` + `SELF_EXEMPT` + `MUTATION_ENTRYPOINTS` 3구조, 그리고 정적 lint가 원리상 못 보는 것을 런타임 축이 담당한다는 역할 분담.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/c1-coverage-gate.test.js` 그리고 `node plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js --json` 이 영점 exit — 미등록 writer 주입이 실패(`C1-COVERAGE-STATIC`) · 레지스트리 경로에 직접 write하는 미등록 코드가 실패(`C1-COVERAGE-REGISTRY-WRITER` — 표면 축과 별개 표면이므로 `C1-COVERAGE-STATIC`이 이를 대신하지 않는다) · 수용 조건 5축 중 하나라도 미충족인 트리에서 `--acceptance`가 비영점 exit하고 어느 축이 깨졌는지 이름으로 보고(`C1-ACCEPTANCE-MECHANIZED`) · 이벤트 없는 표면 delta가 실패(`C1-COVERAGE-RUNTIME`) · 계약과 선언이 한쪽만 있는 트리가 실패(`C1-CONTRACT-COPRESENT`) · `merge` attribute가 `union`이 아닌 트리가 실패(`C1-GATE-MERGE-UNION` — Task 1의 `C1-MERGE-UNION`이 단언이라면 이쪽은 **게이트**다. 둘은 다른 층이라 중복이 아니다).

### Task 8: 수용 증거와 릴리스 메타데이터

- **Action**: `m7-before.json` / `m7-after.json`으로 C1의 전후 상태를 봉인하고, `m7-audit-sample.json`에 UI11 감사 표본 5건(자동 산출값을 보지 않고 레지스트리 원자료에서 독립 판정한 뒤 대조)을 남긴다. `m7-assertion-manifest.json`을 작성하고 `plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js:31` 의 `REQUIRED_IDS`에 C1 계열을 추가한다 — 항목 집합은 `## Assertion Roster`가 정본이며 셋(roster · manifest · `REQUIRED_IDS`)이 1:1이어야 한다. `plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js:194` 의 forward-only 목록에서 C1을 빼고 claimed-computable 집합에 넣는다. `feedback-loop-design.md`를 쓰고 `measurement-design.md`의 C1 소스 서술을 갱신한다. PRD M7 행 status·Plan 셀·승격 경계 Open Question을 해소하고, version bump과 footer 2면·CHANGELOG를 동기화한다(§3.7 — PR 직전 target 재계산).
- **Mirror**: `docs/multi-session-work-loop/m6-assertion-manifest.json` 의 `test_title`이 곧 계약이라는 규약, 그리고 `m6-audit-sample.json`의 anchor(commit sha + plan 파일 해시) 구조.
- **Validate**: `node plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js --manifest docs/multi-session-work-loop/m7-assertion-manifest.json` 영점 exit(이 도구는 `--manifest` 없이는 exit 2다 — 실측 확인) 그리고 `node --test plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js` — C1이 claimed-computable이고 forward-only 목록에 없음(`C1-ACCEPTANCE-PROMOTED`).

## Validation

```bash
# 단위 · 통합
node --test plugins/mccp/scripts/lib/tests/
node --test plugins/mccp/scripts/state/tests/
node --test plugins/mccp/scripts/derive/tests/
node --test plugins/mccp/scripts/receipt/tests/

# 단언 매니페스트 (요구한 test가 실재하는가) — --manifest 는 필수 인자다
node plugins/mccp/scripts/lib/msw-metrics/assertion-manifest-check.js \n  --manifest docs/multi-session-work-loop/m7-assertion-manifest.json

# C1 coverage gate (emit 지점이 전부 덮였는가)
node plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js --json

# 수용 조건의 기계 판정 5축 — 산문 체크리스트가 아니라 이 명령이 판정한다.
# 이 milestone 전용(opt-in)이다: default 모드에 넣으면 패널을 한 번도 돌리지
# 않은 fresh clone 에서 붉어져 저장소 불변식과 배송 증거가 뒤섞인다.
node plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js --acceptance --json

# 지표 산출 — C1.status 가 'computed' 여야 한다 (UI4 완료 판정)
node plugins/mccp/scripts/derive/cli.js run --json

# 라이브 산출물 실재 — Acceptance 의 배선 판정을 명령으로 내린다.
# unit test green 은 이 둘 중 어느 것도 대신하지 못한다.
test -s .claude/state/findings/multi-session-work-loop.jsonl
# `git ls-files --error-unmatch` 는 **쓰지 않는다** — 그것은 index 등재(tracked)만
# 증명하고 commit 을 증명하지 않는다(실측: `git add` 직후 통과). Acceptance 문언이
# 요구하는 것은 커밋이므로, HEAD 트리에 그 경로가 실재하는지를 직접 묻는다.
git cat-file -e HEAD:.claude/state/findings/multi-session-work-loop.jsonl

# 병합 안전성 — 선언이 실제로 해석되는지를 git 에게 묻는다(파일 grep 아님).
git check-attr merge -- .claude/state/findings/multi-session-work-loop.jsonl | grep -q ': merge: union$'
# glob 이 패턴으로 거는지 — 아직 없는 이름으로도 물어본다.
git check-attr merge -- .claude/state/findings/zzz-future-work-unit.jsonl | grep -q ': merge: union$'

# UI11 감사 표본 대조 — Acceptance 가 요구하는 일치를 명령으로 낸다.
node plugins/mccp/scripts/derive/cli.js run --json \n  | node -e 'const fs=require("fs");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).metrics.C1;const a=JSON.parse(fs.readFileSync("docs/multi-session-work-loop/m7-audit-sample.json","utf8"));const bad=(a.samples||[]).filter(x=>x.matches!==true);if(bad.length||a.computed_denominator!==m.denominator){console.error("audit sample mismatch");process.exit(1)}})'
node plugins/mccp/scripts/derive/cli.js metrics-assert
node plugins/mccp/scripts/derive/cli.js render

# 회귀 — gitignore canonical drift + 지시 계약 lint
node --test plugins/mccp/scripts/lib/tests/gitignore-provision.test.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 증거 감사 (ledger ↔ receipt 대조)
node plugins/mccp/scripts/lib/evidence-audit.js --json
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **`ACCEPT_NOW`를 해소로 계상해 C1이 조작 가능해짐** — 수용 의사가 곧 수정이 되어 finding을 처리하지 않고도 폐쇄율이 오른다 | 높음 | DD2가 매핑을 고정하고 `C1-EMIT-PLAN-CODEX` 단언이 이를 기계 강제한다. 종결 유형 5종을 레지스트리 enum으로 두어 새 유형이 조용히 해소로 편입되지 못하게 한다 |
| **DD3 비재발 판정의 id 매칭 실패** — 라운드 간 문면이 바뀌면 같은 finding이 새 finding으로 계상된다 | 높음 | 오차 방향이 보수적임을 설계로 고정(분모만 증가). 2차 키로 `(perspective, cited_path)` 쌍을 병용하고, 매칭을 관대하게 만드는 변경은 보수성 확인을 선행 조건으로 문서화 |
| 승격이 A4 분모를 부풀려 A4 값이 무의미해짐 | 중 | `by_type` 분해를 A4 소스에 함께 보고해 구성 변화가 관측되게 한다. A4 무결성 규칙은 분모 축소를 플래그하므로 증가 자체는 위반이 아니지만 해석이 바뀌는 것은 기록한다 |
| **DD8 미탐지 꼬리 — batch 전체 유실이 C1을 부풀린다** | 낮음 | **방향별로 다르게 처리한다**(R6 CRITICAL 흡수). 부풀리는 방향(`finding_opened` 유실 → 분모 축소)은 Task 7 런타임 falsifier가 표면 delta 대조로 잡는다 — 독립 코드 경로이므로 무한 후퇴가 아니다. "말미 k개" 부분 유실은 batch 원자 append + `batch_expected`로 **발생 자체를 없앤다**. 잔여는 `finding_closed` batch 전체 유실뿐이고 그 방향은 분자만 줄여 C1을 **낮게** 보이게 하므로 보수적이다. 이전 개정의 "문서화로 대신한다"는 부풀리는 방향에 대해 성립하지 않았다 |

<details>
<summary>나머지 8건 (중 위험)</summary>

| Risk | Likelihood | Mitigation |
|---|---|---|
| **수용 조건이 산문 체크리스트라 건너뛰어도 PR이 통과** | 중 | `c1-coverage-gate.js --acceptance`가 기계 판정 가능한 5축을 재판정하고 비영점 exit한다(R6 HIGH 흡수). 나머지 산문 항목은 사람이 읽을 서술로 남기되 판정 권한은 명령에 둔다 |
| **Task 2·3 분할 착지를 아무도 관측하지 못함** — DD10 게이트는 Task 7이 만들어 그 이후 트리만 본다 | 중 | Task 2 자신의 test 파일이 `SOURCE_SCANNERS`의 `findings` 키를 직접 단언하므로(`C1-SOURCE-REGISTERED-COPRESENT`) Task 2-only 트리에서 그 Task의 test가 붉어진다 — `node --test`가 도는 pre-commit 축이고 게이트와 시점이 다르다(R6 HIGH 흡수) |
| 주입 블록이 A3 점유를 되돌림 | 중 | 상한 상수 2종(`PROMOTE_MAX_ITEMS` · 문자 상한)으로 절단하고 절단 건수만 보고. SessionStart 컨텍스트 cap 아래에서 동작 |
| git-tracked 레지스트리가 병렬 worktree에서 병합 충돌 | 중 | work_unit 샤딩으로 통상 충돌을 구조적으로 제거하고, 같은 작업 단위 경합은 `merge=union` + 읽기 dedupe로 해소. 같은 단위 동시 진행은 M3 claim TTL이 이미 다루는 상황 |
| emit 배선이 게이트를 차단 | 중 | fail-open + loud warn을 계약으로 고정하고 `C1-EMIT-FAILOPEN`이 호출자 exit code 불변을 단언 |
| coverage gate가 정적 lint만으로 완결됐다고 주장 | 중 | B2 선례대로 런타임 falsifier를 primary로 두고, 정적 lint가 못 보는 범위(동적 경로 · 셸 writer · repo 밖)를 위협 모델에 명시 |
| C1이 `computed`가 되었으나 값이 신뢰 불가 | 중 | UI11 감사 표본 5건을 수용 조건에 포함. 불일치 시 지표를 다음 주기까지 무효 처리하는 규약을 그대로 적용 |
| 병렬 브랜치 version 충돌 (§3.7 실측 4회 재발) | 중 | target을 미리 확정하지 않고 base 병합 시점과 `/mccp:pr` 진입 직전 두 번 재계산. 재상향 후 4면 동기 검증 재실행 |
| **승격 표면이 미검증 리뷰어 텍스트를 다음 세션 프롬프트에 싣는다** — 승격 대상이 CRITICAL·HIGH로 좁고 건수가 잘린다는 것은 분량의 방어일 뿐 내용의 방어가 아니다 | 중 | DD9의 신뢰 경계 처리를 Task 5가 이행하고 `C1-PROMOTE-SANITIZED`가 단언한다(R11 security HIGH 흡수). sanitizer는 새로 쓰지 않고 §3.13이 같은 문제로 이미 배송한 `intent-context.js` 함수를 호출한다 — 두 벌을 두면 한쪽만 조용히 뒤처진다. 리뷰어가 붙인 "privilege escalation" 프레이밍은 근거와 함께 기각했다(DD9 말미) |

</details>

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
- [ ] **C1이 `computed`로 뒤집힌다** — `node plugins/mccp/scripts/derive/cli.js run --json`의 `metrics.C1.status === 'computed'` 이고 `numerator`/`denominator`가 non-null. 코드 존재는 판정 근거가 아니다 (UI4)
- [ ] **C1이 claimed-computable 집합에 있다** — `msw-metrics-acceptance.test.js`의 forward-only 목록에서 제거되고 열거 단언을 통과
- [ ] **라이브 완주 산출물**: 이 사이클 자신의 `/mccp:plan` 패널 실행이 `.claude/state/findings/multi-session-work-loop.jsonl`에 `finding_opened` 이벤트를 남기고, 그 파일이 **HEAD 커밋에 실재한다**(`git cat-file -e HEAD:<path>`). "tracked" 로 적지 않는 이유는 `git ls-files --error-unmatch` 가 `git add` 직후에도 통과해 **커밋되지 않은 파일을 커밋된 것으로 보고**하기 때문이다(실측) — 문언이 커밋을 요구하는데 검사가 등재만 보면, 검사가 자기 문언보다 약한 채로 통과한다. 파일명은 **decision slug**이지 plan 파일명이 아니다 — `derive-decision --command mccp:plan --args <PRD 경로>`가 PRD 기준으로 파생하므로 `-m7` 접미가 붙지 않는다(실측 확인). 레지스트리 파일 부재는 배선 실패이며 test green으로 대체되지 않는다
- [ ] **승격 왕복 확인**: 위 레지스트리의 open HIGH 이상 항목이 `node -e` 호출로 `enumerateUnfinishedItems`에 `type:'finding'`으로 나타나고, `state-injector`의 `inject` 출력에 `## Open Findings` 블록이 실재한다
- [ ] `assertion-manifest-check.js` 영점 exit + manifest 전건 실재 (항목 수는 Task 본문의 assertion id 수와 일치해야 하며, 그 수를 여기 리터럴로 적지 않는 이유는 라운드마다 단언이 늘어 두 숫자가 어긋나기 때문이다 — 대조는 `assertion-manifest-check.js`가 한다)
- [ ] `c1-coverage-gate.js --json` 영점 exit
- [ ] **`c1-coverage-gate.js --acceptance` 영점 exit** — 위 산문 체크리스트 중 기계 판정 가능한 5축(레지스트리 실재 · **HEAD 커밋 실재** · `merge=union` · C1 `computed` + non-null · 감사 표본 일치)을 이 한 명령이 재판정한다. 산문 항목이 남아 있는 이유는 사람이 읽을 서술이 필요하기 때문이고, **판정 권한은 이 명령에 있다** — 체크박스를 손으로 채우는 것은 판정이 아니다 (UI4). 이 명령은 위 `## Validation` 블록에 있으므로 `/mccp:prp-implement`의 validation loop이 실행하며, 비영점 exit는 그 loop을 통과하지 못한다 — 즉 실행 자체도 체크박스에 의존하지 않는다. emit이 fail-open인 것(DD8)과 모순되지 않는다: fail-open은 *게이트 실행 중* 계측 실패가 게이트를 막지 않게 하는 계약이고, 이쪽은 *배송 시점에* 계측이 실제로 작동했는지를 되묻는 별개 축이다
- [ ] `git check-attr merge -- .claude/state/findings/<work_unit>.jsonl` 이 `union` 을 반환. `.gitattributes` 에 문자열이 있는지가 아니라 **git 이 그 경로에 실제로 적용하는지**를 확인한다 — glob 이 어긋나면 선언이 있어도 미적용이다
- [ ] UI11 감사 표본 5건이 `m7-audit-sample.json`에 기록되고 자동 산출값과 일치 (불일치 시 그 사실을 기록하고 지표 무효 처리)
- [ ] `m7-after.json`이 DD8의 미탐지 꼬리를 명시 기록한다 — 이 수용 조건들은 `seq` 구멍이 없음을 확인할 뿐 "말미 연속 실패" 구간의 부재를 증명하지 않는다. 증명하지 않는 것을 증명했다고 적지 않는 것이 여기서의 요구다
- [ ] PRD M7 행 status 갱신 + 승격 경계 Open Question 해소 표기
- [ ] `plugin.json` version bump + footer 2면 + CHANGELOG 4면 동기 (§3.7)

## External Research Provenance

- Source PRD: .claude/prds/multi-session-work-loop.prd.md
- References section sha256: 1aaa7924f4e1ebed8993b242c00788e1c0ad84319463ff89f3a29625b33aa880
- Stamped at: 2026-08-17T12:44:08.697Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 4개 anchor를 critique 진입 전에 Read했다. detector `design_signal=true` (렌더러 3면 + derive 표면이 `DESIGN_SURFACE_PATHS`에 hit).

- 라운드 수: 2 (cap 2)
- 판정: `CONVERGED`

| Round | Anchor | Severity | 처리 |
|---|---|---|---|
| R0 | H4 한 화면 항목 수 상한 — `## Risks` 9행이 전건 노출 | HIGH | 흡수 — 상위 3행 유지, 나머지 6행을 `<details>`로 collapse |
| R1 | 전 anchor 재검사 | — | 잔여 HIGH/CRITICAL 0 → 수렴 |

anchor별 R1 상태: H1 정보 위계(heading depth 최대 3, 초과 없음) · H2 강조색(마크다운 bold 단일 emphasis 축) · H3 raw marker(미렌더 marker 없음) · H4 list-of-N(위 흡수로 충족).

**H4를 일부 표에 적용하지 않은 근거(기록).** `## User Intent` · `## Files to Change` · `## Acceptance`는 collapse 대상에서 제외했다. 셋 다 기계 파서가 읽는 계약 표면이기 때문이다 — `intent-context.js`가 User Intent 표의 `Constraint` 열을, `plugins/mccp/scripts/lib/plan-review/l1-check.js:312`의 C2·C3가 Files to Change 행의 경로·action 열을 파싱한다. 표시 규칙을 지키려고 게이트가 읽는 표에 wrapper를 넣는 것은 규칙 하나를 지키려 다른 규칙을 깨는 거래이므로 채택하지 않았다. anchor가 문언으로 지목하는 대상("Open Questions, action items, risk tables")과도 일치한다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 아직 없으므로 어떤 impeccable 명령도 **호출하지 않고** 아래를 구현자용 체크리스트로만 남긴다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
