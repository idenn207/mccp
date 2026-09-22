# Plan Review Panel — orchestrator-step-wiring-m3-rev2

**Plan**: `.claude/plans/orchestrator-step-wiring-m3-rev2.plan.md` · **Plan version**: `sha256:b4385c9e9dd177afdfe1714382e7e6a1bb31aa27a9339e7d12ec0cf40a602349`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 7 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD3/Task 5가 지정한 reader 가드 술어(kind 단독)는 자기가 지키겠다고 선언한 불변식을 깨뜨린다 — 로컬 session_start/session_end가 전부 비-A1 kind이므로 kind 단독 판정은 B2의 concurrent_pairs_count와 A2의 context_remaining_pct 모집단을 통째로 삭제한다. 플랜은 dirIsShared 단독의 위험(자기 세션 소실)만 논증하고 반대 방향의 과다 차단은 논증하지 않는다. | plan L109 "가드는 출처 디렉토리가 아니라 **kind가 A1 축인가**로 판정한다" + L216 "판정 술어는 writer와 **같은 것**(`A1_AXIS_KINDS` 멤버십)이어야 하며". 실제 성립 조건은 논리곱이다: plugins/mccp/scripts/derive/sources/session-activity.js:248-249 `!(dirIsShared && !mswEvents.A1_AXIS_KINDS.has(...))`, 그 사유는 같은 파일 :231-235 "반대로 kind **단독**이면 로컬 `session_start`/`session_end`까지 막혀 `concurrent_pairs_count`와 `context_remaining_pct`가 통째로 사라진다 … 순손실". |
| architect | MEDIUM | Task 5의 Validate 3단언은 위 결함을 구조적으로 탐지하지 못한다 — 3번 단언의 fixture가 '**A1 이벤트만** 남긴 자기 세션'이라, kind 단독 가드에서도 A1 kind는 통과하므로 green이 유지된다. 즉 플랜이 스스로 세운 반증 그물이 자기 술어의 유일한 실패 모드를 비켜간다. | plan L232-233 "공유 위치에 A1 이벤트만 남긴 **자기 세션**이 B2 분모에서 사라지지 않는다 — 위 security 축의 반증 단언". 로컬 비-A1 세션 축 이벤트(session_start/session_end)가 살아남는지를 단언하는 항목이 Task 5 Validate·Acceptance(L415-417) 어디에도 없다. |
| architect | MEDIUM | Task 5 Action의 가드 범위가 '엔트리 생성'으로만 한정돼, 공유 A1 이벤트가 이미 만든 엔트리에 외래 span·context 샘플이 실리는 경로가 열린 채 남는다 — 경계가 하나의 초크포인트가 아니라 부분 조건이 된다. | plan L214-216 "… 이벤트가 공유 위치에서 읽혔을 때 `sessions[sessionId]` 엔트리를 만들지 않게 한다". 반면 session-activity.js:237-240은 "엔트리 생성만 막으면 아래 `events.push`와 `session_end` 갱신이 그대로 돌아 … 외래 span과 외래 context 샘플이 실린다"고 적고 가드를 세션 누적 블록 전체로 확장한다(:250-281). 같은 누락이 evidence 계수기 3종에도 재발했다(:319-329). |
| security | MEDIUM | Task 5의 가드 범위가 '세션 엔트리 생성'으로만 서술돼, 같은 루프에서 공유(git common dir) 이벤트를 읽는 evidence 계수기 3종이 격리 밖에 남는다. plan의 Validate 3단언·Acceptance 어느 것도 그 축을 검사하지 않으므로, plan대로만 착지하면 외래 `evidence_guard_active` 한 줄이 `collision_producer_present=true`를 세워 B2 producer 신호를 연다. | plan L214-215 "per-line 루프에서 kind가 A1 축이 아닌 이벤트가 공유 위치에서 읽혔을 때 `sessions[sessionId]` 엔트리를 만들지 않게 한다" vs 실제 필요 범위 `derive/sources/session-activity.js:329-338`(evidence 계수기에 `sessionAxisAdmissible` 재사용). test는 plan 밖에서 santa R3가 추가했다 — `lib/tests/msw-a1-boundary.test.js:801-817`. |
| security | MEDIUM | Task 4가 A2를 `sessions_local`(=`observed_local` 표식)에 결속시키면서, 그 표식을 심는 키가 신뢰 불가 입력(공유 디렉토리의 파일명)이라는 사실을 plan이 다루지 않는다. `__proto__.jsonl` 한 파일이면 `sessions['__proto__']`가 `Object.prototype`으로 해소돼 `observed_local`이 프로세스 전 객체에 심기고, Task 4·5가 세운 모집단 분리가 통째로 무효가 된다. | writer가 그 이름을 허용한다 — `state/msw-events.js:45` `SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/`. 소비 지점은 `derive/sources/session-activity.js:251-268`(`sessions[sessionId]` · `observed_local = true`) → `:474` `sessions_local` 필터. 방어(`Object.create(null)`, `:170`)와 반증 test(`lib/tests/msw-a1-boundary.test.js:759-790`)는 plan 본문·Validate·Acceptance 어디에도 없고 santa R2에서 사후 추가됐다. |
| test | HIGH | Task 5의 Validate 3단언(과 그에 1:1 대응하는 Acceptance 항목)은 이 Task가 세우려는 명제를 구별하지 못한다 — 잘못된 구현(dirIsShared 단독 가드, 또는 kind 단독 가드)도 세 단언을 전부 통과한다. 즉 over-permissive 방향(잘못된 구현이 승인됨)을 덮지 않는다. | plan Task 5 Validate(:225-233) + Acceptance(:415-417)는 (1) 공유 비-A1 → concurrent_pairs 미증가 (2) 공유 A1 → task_startups 증가 (3) A1-only 자기 세션이 B2 분모에 남음 셋을 요구한다. 그러나 실제 test는 plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js:617-622에서 "plan 원안의 세 단언은 **어느 것도** kind 기준 가드와 `dirIsShared` 기준 가드를 구별하지 못했다 … 실제 판별자는 (4)(5)(6)이다"라고 명시하고 판별자 3종(:662, :680, :695)을 추가로 요구한다. plan 본문·Acceptance는 여전히 3단언 그대로다. |
| test | HIGH | M1 핵심 acceptance인 '위치 독립성'을 검증하는 Validation 3은 조용히 vacuous로 접힌다 — 세 위치 중 둘이 존재하지 않아도 실패하지 않고 'n/a'를 출력하고 끝난다. | plan :361-364 — `for d in . ../../ /c/_project/mccp; do (cd "$d" 2>/dev/null && … 2>/dev/null \| node -e '…catch(e){console.log(process.argv[1],"n/a")}')`. 하드코딩된 `/c/_project/mccp`는 이 환경(/home/madsc/work/mccp)에 대응물이 없고, cd 실패·JSON 파싱 실패가 모두 삼켜져 비교 대상이 1개만 남아도 exit 0이다. Acceptance :420 '세 위치에서 같은 A1 값'이 이 명령으로는 반증되지 않는다. |
| test | MEDIUM | Acceptance의 escalation 항목은 절반이 오늘 반증 불가인데도 그대로 남아 있다 — plan 자신이 그 사실을 Task 8 (e)에 적고서도 Acceptance 문구를 정정하지 않았다. | plan :422-423 '`renderer/verdict.js`의 amber … 와 SessionStart 주입이 **둘 다** 사라졌다 — 소비처 양쪽에서 확인'. 그러나 plan :282-286은 `renderer/verdict.js:127`이 `fixTask && escalate_pending`을 요구하는데 저장소에 `fix-task.md`가 없어 amber가 '값과 무관하게 이미 침묵 중'이라고 적는다. 실측 확인: verdict.js:127 `if (fixTask && stateItem && stateItem.escalate_pending)`. 즉 그 축은 '해소함'과 '아무것도 안 함'을 구별하지 못한다. |
| test | LOW | Task 4의 Validate는 손으로 만든 fixture만 검증하며, 실제 producer가 그 형태를 낼 수 없음을 plan이 표면화하지 않는다(계약 test임이 plan 본문에 없다). Task 1의 짝 단언에는 같은 성격의 주석을 명시적으로 요구하면서 Task 4에는 요구하지 않는 비대칭이다. | plan Task 4 Validate(:205-206)는 '공유 위치에서 온 외래 세션에 `context_remaining_pct`가 실린 fixture'를 요구하지만, 같은 plan의 DD3(:94-98)와 Task 5 착지 후에는 그 상태가 scan 결과로 생성될 수 없다. 실제 test는 msw-metrics.test.js:970-975에서 '이 fixture는 **코드 계약 test**다'라고 스스로 적어 그 간극을 메운다 — plan에는 그 규정이 없다. |
| invariant | HIGH | 라운드 캡 게이트가 slug 재키잉으로 무력화되고, 그 재키잉이 이 계획의 공식 진행 경로가 됐다 — 게이트는 여전히 게이트처럼 보이지만 아무것도 멈추지 못한다. skip predicate('이 키의 원장은 0라운드')는 파일 이름을 바꾸는 것만으로 성립하므로, '리뷰를 받지 않았다'는 증거가 실제 작업 없이 존재할 수 있다. | plan L611-612 "따라서 slug를 `orchestrator-step-wiring-m3-rev2`로 재키잉했다 (`git mv` + PRD 밀스톤 행 갱신)"; L620-626은 리뷰어 이의를 "기각하지 않고 남긴다"며 backlog 이연만 한다. CLAUDE.md §3.16이 열거한 감사 우회 목록(MCCP_SKIP_RECEIPT · MCCP_SKIP_INTENT_GATE · MCCP_ALLOW_CODEX_UNAVAILABLE · MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE)에 재키잉은 없다. 게이트 진입은 이미 3회(PRD slug 3라운드 · -m3 1라운드 · -rev2)이며 plan L631-634가 "ship 감사가 세 키를 함께 읽지 않는다"고 스스로 인정한다 — 즉 봉인될 receipt의 rounds_so_far=0은 실제 리뷰 이력을 anchor하지 않는 거짓 기록이다. |
| invariant | MEDIUM | Task 9의 escalation 해소는 같은 사이클의 receipt write가 즉시 되살릴 수 있고, 순서를 강제하는 것도 test로 pin하는 것도 없다 — acceptance 체크는 '해소함'을 통과시킨 뒤 조용히 회귀할 수 있다. | receipt/write.js:1213-1234 `triggerEscalateIfNeeded`는 divergent/critical detector 발화 시 `escalate_pending: true` + 새 `decision_id`를 무조건 set하고, 역경로(:1240-1252)는 **같은 decision_id**의 후속 clean receipt만 clear한다. 이 사이클의 리뷰 결과는 plan L541이 기록한 대로 `divergent`이며 slug가 `-rev2`로 갈렸으므로, Task 9가 데이터로 지운 플래그가 새 decision_id로 재점화된다. plan Task 8 (f)가 바로 이 위험을 "순서 보장이 없다(test/MEDIUM)"로 인정하고 이연할 뿐, Acceptance L422-423은 여전히 소비처 2곳의 침묵만 요구한다. |
| invariant | MEDIUM | 계획 본문이 자기 body hash를 잘못 anchor한다 — 재키잉의 유일한 정당화("산출물이 달라졌다")가 지목하는 문서가 지금 리뷰되는 문서가 아니다. | plan L614-615 "패널이 본 본문은 `sha256:ce77c9ca…`이고 지금 본문은 `sha256:51678c33…`이다". 그러나 이 게이트가 리뷰하는 plan version은 `sha256:b4385c9e9dd177af…`다. 즉 그 문단 이후에도 본문이 편집됐고(L16-19·L562-563의 santa R3/R4 정정), 재키잉 논증이 봉인한 hash는 어떤 현행 아티팩트도 가리키지 않는다. |
| invariant | MEDIUM | DD1의 '급증' 계약과 실제 착지한 술어가 어긋나며, 짝 단언(부호 test)은 그 어긋남을 잡지 못한다 — anti-gaming 가드는 도달 불가일 뿐 아니라, 도달하더라도 계획이 적은 것보다 약한 조건을 pin한다. | plan L133-135는 "기준선이 존재하고 그에 비해 **급증**했을 때만 주장한다"고 적지만, 착지한 코드 `msw-metrics/index.js:180-182`는 `startupCount > 50 && spikeBaselinePresent && startupCount > priorStartupCount` — 임계 초과 후 기준선보다 1만 커도 spike다. 배수·증가폭 기준이 없어 '급증'이라는 계약어를 코드가 만족하지 않으며, Validate(L154-158)의 두 단언(51/기준선 10)은 이 약한 술어에서도 green이라 차이를 반증하지 못한다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | DD1/DD2의 부호 정정과 dormant 토큰 배선을 msw-metrics/index.js:161-194 · cli.js:342와 대조했고(주장대로 성립, 반증 실패), Task 2의 safeField 단일 경로 주장을 work-orchestrator.js:492-509(텍스트)·:688-706(JSON)에서 확인했으며 빈 값 생략 규율도 실재함을 확인했다. Task 4의 localSessions/`sessions_local` fallback 주장은 index.js:305-307에 그대로 있었다. A1_AXIS_KINDS가 writer 모듈에서 실제 export되는지(msw-events.js:254,541) 확인해 '두 축이 같은 술어를 읽는다'는 주장은 성립했다. 공격이 통한 곳은 Task 5/DD3의 경계 술어다 — 플랜이 명시한 kind-단독 판정은 dirIsShared와의 논리곱 없이는 B2/A2 로컬 모집단을 통째로 지우며, 플랜의 3단언 그물이 그 실패를 잡지 못한다. 부수적으로 가드 적용 범위가 엔트리 생성으로만 좁게 쓰여 있다. |
| security | pass | 공격한 것: (1) Task 2의 `safeField` 좁히기 — `scrubControl`+`scrubAbsPaths` 순서와 OSC(`\\x1b]0;X\\x07`) 입력을 추적했고 `RESIDUAL_CONTROL_RE`가 ESC/BEL을 모두 포함해 텍스트·JSON 양 경로에서 제어문자 탈출을 만들지 못했다(`work-orchestrator.js:278,292-315,506,700`). (2) Task 5 가드가 `dirIsShared` 단독으로 퇴화해 자기 세션을 깎는 순손실 — 술어가 논리곱이고 판별자 test가 존재해 landing하지 않았다(`session-activity.js:248-249`). (3) 공유 corpus를 통한 `event_id` 충돌로 로컬 이벤트 억제 — scanDirs 순서가 local-first(`:146-150`, `isCrossLocation = di>0`)라 극성이 안전하며 M1 소유 축이다. (4) Task 1의 `spike_guard_reason`·`invalid_reason` 절대경로 유출 — 고정 문자열이고 error 경로는 `mask.scrubAbsPaths`를 지난다(`msw-metrics/index.js:130-137,190-194`). (5) Task 9의 STATE.md 직접 편집 우회 — plan이 `state-writer.update()` 경유를 명시적으로 강제한다(L313-315). landing한 것은 위 둘이며 둘 다 plan의 명세 공백이고, 코드 쪽은 사후 라운드에서 이미 닫혔으므로 HIGH로 올리지 않는다. |
| test | fail | plan이 인용한 msw-metrics/index.js computeA1·computeA2, session-activity.js의 sessionAxisAdmissible(:248-250), msw-events.js:254/419, verdict.js:127, env-contract/lint.js(L11·L12 실재 확인 — Task 6의 'L1~L12'는 정확)을 직접 열어 인용 정합을 검사했다. Task별로 대응 test 존재 여부를 grep으로 확인했고(msw-a1-boundary·msw-metrics·work-halt-record 모두 실재, Validation 목록에 포함됨), Task 1의 dormant 토큰 가시성 단언은 임계 아래에서 실제로 재는 것을 확인해 반증에 실패했다. 반면 Task 5 Validate의 판별력, Validation 3의 무음 degrade, escalation acceptance의 반증 불가 축은 plan 자신의 산문·test 주석과 대조해 결함을 확인했다. |
| invariant | fail | plan/PRD 전문을 읽고 인용한 모듈을 직접 열어 대조했다: (1) DD1/Task 1의 spike 가드 — `msw-metrics/index.js:151-213`에서 부호 정정·`spike_guard` present-only 필드·dormant 경로의 실제 형태를 확인하고 '급증' 술어의 강도를 비교; (2) Task 5 reader 가드 — `derive/sources/session-activity.js:10,222-249`가 writer의 `A1_AXIS_KINDS`를 실제로 공유 술어로 읽는지 확인(요구대로 kind 기준이며 `dirIsShared` 단독 판정이 아님 — 이 축은 반증 실패); (3) Task 9의 escalation — `receipt/write.js:1213-1252`의 set/clear 경로를 열어 clear가 decision_id 키잉임과 같은 사이클 재점화 가능성을 확인; (4) Gate Record 3회 진입의 원장 키 이동과 §3.16 우회 목록 대조; (5) plan 자기 hash 주장과 이 게이트가 받은 plan version 대조. Task 4(A2 모집단)·DD6(읽기 상한 미도입)·Task 6(registry note)은 공격했으나 fail-open 드리프트나 미고정 skip predicate를 찾지 못해 보고하지 않는다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": null,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:b4385c9e9dd177afdfe1714382e7e6a1bb31aa27a9339e7d12ec0cf40a602349",
  "plan_path": ".claude/plans/orchestrator-step-wiring-m3-rev2.plan.md",
  "receipt_hash": null,
  "recorded_at": "2026-09-08T07:45:26.342Z",
  "rounds": 2
}
```

### Recording degradations

- started-at absent or unreadable — wall_clock_ms recorded as null, NOT as zero (an unmeasured duration must not read as an instant one)
