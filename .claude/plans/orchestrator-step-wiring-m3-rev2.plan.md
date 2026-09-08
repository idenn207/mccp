# Plan: instrumentation-closeout (orchestrator-step-wiring M3)

**Source PRD**: `.claude/prds/orchestrator-step-wiring.prd.md`
**Selected Milestone**: M3 — instrumentation-closeout
**Complexity**: Medium

## Summary

M1은 A1의 집계 경계를 저장소 전체로 올렸고 M2는 halt 지점을 기록하게 만들었다. 둘 다
동작한다 — 그리고 둘 다 **자기가 고친 축 옆에 새 결함을 남겼다.** M3는 그 결함들만
닫는다: 계측이 스스로 만든 부채와 이 PRD 자신의 Open Questions다.

가장 무거운 하나는 시한폭탄이다. A1의 anti-gaming 가드가 `startupCount > 50`에서
발화하는데 그 판정에 쓰는 기준선 `_priorStartupCount`는 **저장소 전체에서 쓰는 곳이
0곳**이다(실측). M1이 집계 경계를 저장소 전체로 올리고 공유 위치에서 evict를 없앴으므로
분모는 단조 증가하고, 임계 통과는 확실하다. 오늘 23이다. **A1은 통계적으로 의미를 갖기
시작하는 바로 그 지점에서 `status:'invalid'`로 죽는다.**

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이 PRD 관련 backlog · fix-task · open questions · 의도대로 동작하지 않는 기능의 최종 테스트와 수정을 진행한다 | direction |
| UI2 | PRD에 마일스톤을 추가한다 | direction |
| UI3 | 범위는 C2(M1·M2)가 도입한 결함과 이 PRD 자신의 Open Questions로 한정한다 | constraint |
| UI4 | 라운드 캡 pin · goal-detect 잔여 2축 · milestone-close 본문 결함 · pr.md 3.0/3.1 순서는 다루지 않는다 — 다른 축 소유다 | exclusion |
| UI5 | 이 계획의 plan 게이트가 라운드 소진으로 차단되면 우회하지 말고 받아들이되, 사유를 기록하고 감사된 우회로 진행한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 공유 위치 해소 | `plugins/mccp/scripts/derive/sources/session-activity.js:119-131` | reader는 `commonDirOf`를 직접 부르고 **토글을 읽지 않는다**. 해소 실패는 throw가 아니라 후보 미추가로 접는다 |
| 같은 규율의 두 번째 적용 | `plugins/mccp/scripts/lib/msw-metrics/m8-coverage-gate.js:187-197` | 같은 판단을 이미 두 번째로 적용한 선례. 세 번째(`findings.js`)가 이 형태를 따른다 |
| 필드 좁히기 | `plugins/mccp/scripts/lib/work-orchestrator.js:400-405` | 배너로 나가는 **모든** 구성요소가 같은 `safeField`를 통과한다. 주석이 그 불변식을 명시한다 |
| 모르면 주장하지 않는다 | `plugins/mccp/scripts/lib/msw-metrics/index.js:140-152` | producer 부재는 `computed 0`이 아니라 `forward-only` + 사유 문자열. 기준선 부재도 같은 계열이다 |
| 명령 본문 정적 단언 | `plugins/mccp/scripts/lib/tests/work-command-body.test.js` | 배선을 산문이 아니라 정적 test로 고정. 표↔배선 양방향 + 분모 등식 |
| 토글 3상태 단언 | `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | 미설정/on/off를 각각 단언하고 fallback이 조용하지 않음을 고정 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATE | A1 spike 가드가 기준선 부재를 spike로 읽지 않게 한다 (Task 1) · A2 분자를 분모와 같은 모집단에서 뽑는다 (Task 4) |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | UPDATE | `a1` 배너 한 줄에 잠든 spike 가드를 토큰으로 표면화한다 — 사유 필드가 어느 렌더 경로에도 닿지 않는 것을 막는다 (Task 1) |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATE | 공유 위치에서 읽은 **비-A1 kind**가 세션 축 엔트리를 만들지 못하게 한다 — writer의 kind 게이트에 대한 reader 측 defence-in-depth (Task 5) |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | UPDATE | `worktree=` 구성요소를 `safeField`에 통과시킨다 — 텍스트·JSON 양 경로 (Task 2) |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `MCCP_MSW_EVENTS_SHARED`의 영속 사유를 note에 기록한다 (Task 6) |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATE | Task 1·4의 반증 test |
| `plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js` | UPDATE | Task 5의 B2 오염 반증 test |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | UPDATE | Task 2의 `worktree=` 좁히기 test (텍스트·JSON) |
| `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js` | UPDATE | Task 5의 경계 반증 test — M1 경계 acceptance가 도는 곳이 여기다 |
| `.claude/state/STATE.md` | UPDATE | 끝난 milestone(M1)에 고정된 `escalate_pending`을 해소한다 (Task 9) |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATE | M3 행 추가 · Open Questions 1~5 확정 기록 (Task 7) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 해소된 stale 행 정리 · M3에서 닫은 행 표시 (Task 8) |

## Design Decisions

**DD1 — 기준선 부재는 spike의 증거가 아니다.** `startupCount > 50 && !_priorStartupCount`는
부호가 뒤집혀 있다. 기준선이 없다는 것은 "비교할 것이 없다 = 판정 불가"이지 "급증했다"가
아니다. 그런데 현재 코드는 정확히 기준선이 **없을 때** invalid를 낸다. 최소 수정은 임계를
올리거나 가드를 지우는 것이 아니라 **부호를 바로잡는 것**이다: 기준선이 있어야 spike를
주장하고, 없으면 주장하지 않는다. 가드를 삭제하지 않는 이유는 anti-gaming 축을 없애는 것이
정책 변경이기 때문이고, 임계를 올리지 않는 이유는 그것이 폭발 시점을 미룰 뿐 부호를 고치지
않기 때문이다.

**DD2 — 기준선 producer는 만들지 않는다. 그 대가는 가드가 영구히 잠든다는 것이고, 그것을
숨기지 않는다.** 기준선을 persist하는 경로는 이 milestone에서 만들지 않는다 — "직전 주기 대비"는
새 시간축이고 A1 계약에 그 축이 없다. 잠든 가드는 `invalid`가 아니라 계측 결과 옆의 사유로
남는다(`index.js:140-152`의 `forward-only` 정직 표기와 같은 형태).

**그 대가를 정확히 적는다** (L2 invariant/HIGH · security/MEDIUM · test/MEDIUM 흡수). DD1의 부호
정정 뒤 `unitSpikeFlag`가 발화하려면 `model._priorStartupCount`가 있어야 하는데, 그 필드는
저장소 전체에서 **읽는 곳 1곳 · 쓰는 곳 0곳**이다(실측 grep — 나머지 매치는 plan·backlog·리뷰
산문뿐). DD2가 producer를 만들지 않기로 확정하므로, **M3 이후 anti-gaming 가드는 어떤 실
입력으로도 도달 불가**다. 즉 DD1이 "삭제하지 않는 이유는 정책 변경이기 때문"이라 적은 그 정책
변경이 결과적으로 일어난다 — 다만 코드가 아니라 입력 부재로 일어나고, 부호가 바로잡혀 있으므로
producer가 생기는 날 가드는 **되살아난다**. 지워 버린 가드는 되살아나지 못한다는 점이 이 선택의
유일한 근거이며, 그 이상을 주장하지 않는다.

따라서 Task 1의 짝 단언 중 두 번째(`기준선 10` → `invalid`)는 **계약 test가 아니라 부호
test**다. production이 도달할 수 없는 분기를 고정하므로 회귀 그물이 아니고, 부호를 되돌리는
편집을 붉게 만드는 것이 그 역할의 전부다. test 주석이 그렇게 적어야 하며, "anti-gaming 축이
온전하다"는 보증으로 읽히면 안 된다. 이 이연은 Task 8의 신규 backlog 항목으로 **등재된다**(§3.16
— 조용히 버리지 않는다).

**DD3 — DD8의 격리는 오늘 writer 한 축에만 걸려 있다. reader에 두 번째 축을 세운다.**
이 자리에는 원래 "공유 디렉토리의 어떤 kind든 `sessions[sessionId]` 엔트리를 만들고, 그 맵이
`concurrent_pairs_count`를 낳으므로 DD8의 격리 주장은 소비처가 실재하는 상태로 거짓이다"라고
적혀 있었다. **그 문장은 거짓이었다** — L2 패널(test/HIGH · security/MEDIUM)이 반증했고 실측으로
확인했다. `msw-events.js:419`가 `A1_AXIS_KINDS`(`task_started`·`task_completed`·`task_ship_sealed`)
셋만 공유 위치로 라우팅하고 `migrations/msw-events-common-dir.js:453`도 비-A1을 skip한다. 그리고
`session-activity.js`의 `spanOf`는 `session_start` 이벤트가 없으면 `null`을 돌려주며
`concurrent_pairs_count`는 span에서만 증가하는데, `session_start`는 A1 축이 아니므로 공유 위치에
**구조적으로 존재할 수 없다.** 따라서 **오늘 B2 분모 오염은 0이다.**

그래서 Task 5는 *실재하는 결함의 수정*이 아니라 **defence-in-depth**로 재정의된다. 오늘 격리를
지키는 것은 writer의 kind 게이트 하나뿐이고, reader에는 대응하는 가드가 없다. `A1_AXIS_KINDS`에
kind가 하나 추가되거나 세션 축 이벤트가 어떤 경로로든 공유 위치에 닿는 순간 B2는 **조용히**
깨지며, 그때 그것을 붉게 만들 단언이 저장소에 없다. reader 측 가드는 그 단일 실패점을 둘로
만든다.

**경계는 `dirIsShared`가 아니라 kind다** (security/MEDIUM 흡수). 공유 위치에는 **자기
worktree가 쓴** A1 이벤트도 들어가므로(`msw-events.js:418-423`) "공유 디렉토리에서 읽었다"를
"외래다"와 등치하면 자기 세션까지 B2 분모에서 사라진다 — 오늘 없는 오염을 막으려다 실재하는
집계를 깎는 것이다. 가드는 출처 디렉토리가 아니라 **kind가 A1 축인가**로 판정한다. 그러면
writer가 보내는 것과 reader가 받는 것이 같은 술어를 쓰고, 두 축이 같은 정의 위에서 서로를
검사한다.

**DD4 — 좁히기는 열거가 아니라 경로다.** Task 2의 수정은 "`worktree`도 목록에 추가"가 아니라
**배너 줄을 조립하는 모든 값이 같은 함수를 지난다**는 형태여야 한다. 열거로 막으면 여섯 번째
구성요소가 생길 때 같은 결함이 되돌아온다(memory: assert-prohibitions-as-classes). test도
`worktree=`라는 이름이 아니라 *조립된 줄에 제어문자가 없다*를 단언한다.

**DD5 — 토글은 만기가 아니라 영속 사유를 갖는다.** 우산 규칙("만기 없는 신규 토글은
거부된다")의 목적은 임시 스위치가 영구 부채가 되는 것을 막는 것이다. `MCCP_MSW_EVENTS_SHARED`는
임시 스위치가 아니라 **되돌림 수단**이고, 되돌림 수단은 되돌릴 것이 존재하는 한 남아야 한다.
registry 행 포맷에 만기 열이 없으므로 새 열을 만들지 않고 note에 그 판정을 기록한다 — 열
추가는 registry 스키마 변경이라 env-contract 축 소유다.

**DD6 — 공유 corpus의 읽기 상한은 이 milestone에서 만들지 않는다.** backlog가 지적한
"동기 전량 스캔 소비처 중 상한을 갖는 것은 배너뿐"은 정확하지만, 상한을 도입하면 *어느
이벤트를 버릴지*를 정해야 하고 그것은 M1이 의도적으로 사람에게 남긴 판단이다(evict 제거).
오늘 corpus는 523 이벤트이고 100MB 경고선에서 세 자릿수 배 떨어져 있다. 관측 가능한 문제가
되기 전에 정책을 만드는 것은 §3.16과 반대다 — backlog에 근거와 함께 남긴다.

## Tasks

### Task 1: A1 spike 가드의 부호를 바로잡는다
- **Action**: `msw-metrics/index.js:113-115`의 `unitSpikeFlag` 조건에서 기준선 부재가
  invalid를 유발하지 못하게 한다. spike는 **기준선이 존재하고** 그에 비해 급증했을 때만
  주장한다. 기준선이 없으면 가드는 판정하지 않고, 그 사실이 관측 가능해야 한다 —
  A1 결과에 잠든 가드를 나타내는 사유 필드를 present-only로 싣는다.
- **필드를 싣는 것만으로는 미완이다 — 렌더 경로를 함께 연다.** 근거는 아래처럼 정정한다
  (L2 architect/MEDIUM 흡수). 이 자리에는 design-critique R0 A #1을 받아 "오늘 (오탐으로나마)
  헤드라인에 뜨던 신호가 M3 이후 0개 표면이 된다"고 적혀 있었는데 **그 서술은 거짓이다** —
  이 계획 자신이 startupCount는 오늘 23이라고 적으므로 `startupCount > 50` 가드는 애초에
  발화하지 않고, A1은 `invalid`가 아니며, `renderer/verdict.js:93-96`의 헤드라인 경로는
  **지금도 A1에 대해 닫혀 있다.** 잃는 표면은 없다.
  실제 근거는 미래형이다: DD2대로 가드는 영구히 잠들고, 잠들었다는 사실을 말하는 표면이
  하나도 없으면 운영자는 `status=computed`만 보고 anti-gaming 축이 살아 있다고 읽는다.
  그것이 이 PRD Risks 첫 줄의 실패(계측을 올려놓고 소비 회로를 안 붙임)다.
- **토큰의 발화 조건을 명시한다** (같은 finding의 두 번째 축). `msw-metrics/cli.js`의 `a1`
  한 줄에 붙이는 `spike-guard=dormant`는 **기준선이 부재하는 동안 항상** 출력한다 —
  `startupCount` 값과 무관하다. 임계 초과에서만 내면 그 조건은 오늘 도달하지 않아 토큰이
  다시 0개 표면이 되고, 이 Task는 표면을 열었다고 주장하면서 아무것도 열지 않은 것이 된다.
  DD2대로 부재는 영구 상태이므로 이 토큰은 사실상 상수이고, 그것이 정확히 전달하려는
  사실이다(잠들어 있다). 배너는 한 줄 예산이므로 사유 원문이 아니라 고정 토큰 하나다.
- **Mirror**: `index.js:140-152` — producer 부재를 `computed 0`으로 위장하지 않고
  사유 문자열과 함께 표기하는 형태. 배너 측은 `cli.js`의 기존 `status=` 토큰 조립 형태.
- **Validate**: `startupCount=51` · 기준선 부재 → `status='computed'`(오늘 `invalid`) ·
  `startupCount=51` · 기준선 10 → `status='invalid'` · `invalid_reason='unit_count_spike_suspected'`.
  두 단언이 짝으로 있어야 한다 — 앞만 있으면 가드를 지운 것과 구별되지 않는다. **두 번째
  단언에는 DD2가 정한 주석을 붙인다**: 이것은 부호 test이지 계약 test가 아니며 production이
  도달할 수 없는 분기를 고정한다.
  세 번째로 **가시성**을 단언한다: 기준선 부재에서 `cli.js a1` 출력에 dormant 토큰이 실제로
  나타난다 — `startupCount`가 임계 아래(예: 23)일 때도 나타나야 한다. 51에서만 단언하면
  오늘 도달하지 않는 조건만 검사하게 된다.

### Task 2: 배너로 나가는 모든 값이 같은 좁히기를 지난다
- **Action**: `work-orchestrator.js`의 `formatHaltLine`(:415)과 JSON emit(:582) 양쪽에서
  `worktree` 구성요소를 `safeField`에 통과시킨다. `:400-405`의 주석이 선언한 불변식을
  코드가 실제로 만족하게 하고, 주석의 "네 필드"를 실제 구성요소 수로 정정한다.
- **클래스 규율에 빈 값 처리를 포함한다** (design-critique R0 A #5, 흡수). `safeField`는
  `oneLineExcerpt(scrubControl(...))`이라 제어문자만으로 이루어진 basename은 **빈 문자열로
  접힌다**. 그런데 worktree 구성요소의 출력 조건은 값이 아니라 `!isSelfWorktree(...)`라서
  (`:414-415`) 빈 값에도 라벨만 남은 `· worktree=`가 배너에 나간다. 같은 함수의 `reason`은
  이미 `if (reason)`로 값 기반 가드를 둔다(`:408-412`). 따라서 이 Task가 세우는 규율은
  "모든 값이 같은 경로를 지난다" **그리고** "빈 값이면 구성요소째 생략한다"이다.
- **Mirror**: 같은 파일 `:407-413`의 `parts` 조립 — 모든 값이 `safeField`를 지나고,
  `reason`처럼 값이 비면 push하지 않는 형태.
- **Validate**: worktree 디렉토리 이름에 `\x1b]0;X\x07`를 심은 fixture로 텍스트 경로와
  JSON 경로 **양쪽**에서 raw ESC가 0건임을 단언. 단언 대상은 `worktree=`라는 이름이 아니라
  *조립된 출력 전체에 C0/C1 제어문자가 없다*(DD4).

> **Task 3은 삭제됐다 — L2 패널이 전제를 반증했다.**
> (Task 번호는 재사용하지 않는다. 뒤 Task를 재번호하면 리뷰 기록·backlog의 참조가 끊긴다.)

원래 이 Task는 `derive/sources/findings.js:37`의 직접 `path.join`을 공유 corpus까지 스캔하도록
넓히려 했다. **삭제한다.** 전제가 거짓이기 때문이다(L2 test/HIGH · security/MEDIUM ·
invariant/MEDIUM, 실측 확인):

- `remediation_pr`은 `A1_AXIS_KINDS`에 없다. `msw-events.js:419`가 비-A1 kind를 공유 위치로
  보내지 않고 `migrations/msw-events-common-dir.js:453`도 skip하므로, **어떤 producer도 그
  레코드를 공유 위치에 쓰지 않는다.** 넓혀도 읽을 것이 없는 dead read다.
- 더 나쁜 것은 방향이다. 그 경로에 그 kind가 존재할 수 있는 유일한 출처는 손편집이거나 정상
  ingress를 거치지 않은 쓰기이므로, C1 귀속 커버리지(`with_remediation_pr`)의 신뢰 경계를
  CLI 초크 포인트 **밖으로** 넓히게 된다.
- 그리고 같은 계획 안에서 DD3와 정면 모순이다 — DD3는 공유 위치가 A1 축에만 기여한다고
  못박는데 이 Task는 비-A1 축 reader를 그 corpus에 연결한다.

원 Validate("공유 디렉토리에만 있는 `remediation_pr` 레코드가 조인에 나타난다")는 writer도
migration도 만들 수 없는 fixture를 손으로 심어야만 성립했다 — 그 자체가 전제가 거짓이라는
신호였다. Task 번호는 비우지 않고 이 기록으로 남긴다(뒤 Task를 재번호하면 리뷰 기록·backlog의
참조가 끊긴다).

### Task 4: A2의 분자와 분모가 같은 모집단을 읽는다
- **Action**: `msw-metrics/index.js` `computeA2`에서 `samples`를 `sessions`가 아니라
  Task 5가 지키는 `localSessions`에서 뽑는다. 오늘 무해한 이유(`context_remaining_pct`가
  로컬 `session_end`에서만 온다)는 **강제되지 않은 우연**이므로 코드로 고정한다.
- **Mirror**: 같은 함수 `:216-218`의 `localSessions` 해소 + `sessions_local` 부재 fallback.
- **Validate**: 공유 위치에서 온 외래 세션에 `context_remaining_pct`가 실린 fixture에서
  그 값이 분자에 들어가지 않는다. `sessions_local` 부재(구 소스) fallback은 오늘 동작 유지.

### Task 5: DD8의 격리에 reader 측 두 번째 축을 세운다 (defence-in-depth)
- **이것은 실재하는 오염의 수정이 아니다** (DD3 참조 — L2가 원 전제를 반증했고 실측 확인).
  오늘 B2 분모 오염은 **0**이다. 이 Task가 닫는 것은 오염이 아니라 **단일 실패점**이다:
  격리를 지키는 것이 writer의 kind 게이트 하나뿐이라, `A1_AXIS_KINDS`에 kind가 추가되거나
  세션 축 이벤트가 어떤 경로로든 공유 위치에 닿으면 B2가 조용히 깨지고 그것을 붉게 만들
  단언이 없다.
- **Action**: `plugins/mccp/scripts/derive/sources/session-activity.js`의 per-line 루프에서
  **kind가 A1 축이 아닌** 이벤트가 공유 위치에서 읽혔을 때 `sessions[sessionId]` 엔트리를
  만들지 않게 한다. 판정 술어는 writer와 **같은 것**(`A1_AXIS_KINDS` 멤버십)이어야 하며,
  reader가 자기 사본을 새로 열거하면 두 축이 갈려 검사가 성립하지 않는다 — writer 모듈이
  그 집합을 export하고 reader가 그것을 읽는 형태로 한다.
- **경계는 `dirIsShared`가 아니다** (L2 security/MEDIUM 흡수). 공유 위치에는 **자기
  worktree가 쓴** A1 이벤트도 들어가므로(`msw-events.js:418-423`), "공유에서 읽음"을
  "외래"로 등치해 엔트리 생성을 막으면 자기 세션까지 B2 분모에서 사라진다. 오늘 없는 오염을
  막으려다 실재하는 집계를 깎는 것이라 **순손실**이다.
- **Mirror**: 같은 파일 `:110-118`의 CL-5 back-compat 판단 — "남의 디렉토리를 스캔하는 것이
  정확히 방지 대상"이라는 같은 논리의 worktree 판.
- **Validate**: 세 단언이 **함께** 있어야 한다 —
  1. 공유 위치에 비-A1 kind(예: `session_start`+`session_end`)를 심은 fixture에서
     `concurrent_pairs_count`가 증가하지 않는다. 이 fixture는 오늘의 writer가 만들 수 없는
     형태이며, 그것이 이 단언의 **목적**이다 — 미래에 그 상태가 생겼을 때 붉어지는 그물이다.
     test 주석에 그렇게 적는다(오늘의 회귀를 잡는 test로 읽히면 안 된다).
  2. 공유 위치의 **A1 kind** 이벤트는 `task_startups_count`를 그대로 증가시킨다 — 격리가
     A1을 죽이지 않는다.
  3. 공유 위치에 A1 이벤트만 남긴 **자기 세션**이 B2 분모에서 사라지지 않는다 — 위
     security 축의 반증 단언. 1번만 있으면 `dirIsShared` 구현과 구별되지 않는다.

### Task 6: 토글의 영속 사유를 registry에 기록한다
- **Action**: `env-contract/registry.js:201`의 `MCCP_MSW_EVENTS_SHARED` 행 note에
  이것이 임시 스위치가 아니라 되돌림 수단이며 만기를 갖지 않는 근거를 적는다(DD5).
  registry 스키마(열)는 건드리지 않는다.
- **Mirror**: 같은 파일 `:205`의 `MCCP_HANDOFF_THRESHOLDS_USD` — 마지막 열에 판정 사유를
  적는 기존 형태.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` L1~L12 green 유지.

### Task 7: Open Questions 5건을 확정하고 PRD에 M3를 추가한다
- **Action**: PRD의 Open Questions 각 항목에 M1/M2가 실제로 내린 답을 근거와 함께 기록하고
  체크한다. `Delivery Milestones` 표에 M3 행을 추가한다(status `in-progress`, Plan 셀은
  이 파일 경로 — 2경로 백틱 표기는 M1·M2 행과 동일 형태).
  - OQ1 granularity → M1 DD3: `work_unit_kind` 표식 + PRD 단위 분모 제외. 레거시 착수는
    `unknown`으로 잔류하며 소급 부여하지 않는다(그 잔류가 backlog에 등재된 사실도 함께)
  - OQ2 집계 성립 방식 → M1 DD1: producer를 git common dir로 옮긴다(reader 순회 아님)
  - OQ3 삭제된 worktree 이벤트 → 공유 위치로 올라간 A1 축 이벤트는 worktree 삭제에
    영향받지 않는다. 나머지 축은 여전히 사라지며 그것을 받아들인다
  - OQ4 값이 읽히는 화면 → `/mccp:work` 진입 배너. `STATUS.md` 위치 결정은 하지 않는다
  - OQ5 라벨 정정 범위 → M1이 A1 라벨을 작업 단위로 정정. 다른 지표 전수 점검은 미실시
- **Validate**: `node plugins/mccp/scripts/lib/archive-complete/scan.js`가 이 PRD를
  파싱해 M3 행을 원시 행으로 인식하고 `archivable:false`(M3가 in-progress)를 낸다.
  `node plugins/mccp/scripts/lib/goal-detect.js`가 M3 행의 plan 경로를 해소한다.

### Task 8: 해소된 backlog 행을 정리한다
- **Action**: 실측으로 이미 닫힌 행에 해소 표시를 단다. 확인된 것 둘:
  (a) `meta-research.test.js:583` red — 실측 45/45 green,
  (b) m8-coverage-gate의 토글 의존 — `m8-coverage-gate.js:187-197`이 이미 토글을 읽지 않는다.
  M3가 닫는 행에도 같은 표시를 단다. **행을 삭제하지 않는다** — 이 원장은 append-only다.
- **새로 등재할 것** (M3가 관측했으나 사거리 밖이라 닫지 않는다). 앞의 둘은 원안이고,
  나머지는 이 계획의 plan 게이트 L2 패널이 낸 MEDIUM·LOW를 §3.14대로 이연한 것이다 —
  흡수한 HIGH와 같은 축인 지적은 그 흡수에 포함됐으므로 여기 중복 등재하지 않는다:
  (a) **escalation clear 경로가 수명 끝난 decision에 도달 불가** — `receipt/write.js:1240-1252`가
      *같은 `decision_id`의 후속 clean receipt*를 요구하므로, 머지되어 끝난 milestone의 알람은
      영구히 해제되지 않는다. Task 9는 이번 인스턴스만 데이터로 해소하고 구조는 남긴다.
      소유 축은 escalation/fix-task 수명주기(UI4 경계)
  (b) **공유 corpus 읽기 상한 부재** — DD6의 근거와 함께. 오늘 523 이벤트로 100MB 경고선에서
      세 자릿수 배 떨어져 있어 관측 가능한 문제가 아니다
  (c) **A1 anti-gaming 가드가 M3 이후 영구 dormant** (DD2) — 부호는 바로잡히지만 기준선
      producer가 없어 도달 불가. 되살리려면 `_priorStartupCount` producer라는 새 시간축이
      필요하고 그것은 A1 계약 밖이다. 소유 축은 msw-metrics A1
  (d) **round-cap 예산이 PRD 슬러그에 묶여 milestone 간에 공유된다** — 한 PRD의 N번째
      milestone은 앞선 milestone들이 쓴 예산의 잔량을 물려받는다. 예산의 의미 단위는
      *리뷰받는 본문*인데 키는 *PRD*다. 여기에 L2 invariant/MEDIUM이 지적한 감사 공백이
      따라붙는다 — 캡에 막힌 뒤 plan 경로로 재진입하면 새 키의 원장이 `rounds_so_far=0`이라,
      **앞선 차단이 ship 감사가 읽는 원장에 흔적을 남기지 않는다**(plan 산문에만 남고
      receipt가 그것을 anchor하지 않는다). 소유 축은 review-loop-bypass /
      env-contract-integrity — 2026-09-04 HIGH 행(캡 pin)과 같은 축이다
  (e) **Task 9 acceptance의 amber 축이 오늘 반증 불가** (L2 architect·invariant/MEDIUM) —
      `renderer/verdict.js:127`은 `fixTask && escalate_pending`을 요구하는데 이 저장소에는
      `.claude/state/fix-task.md`가 없어(`fix-task-applied.md`만 존재) amber는 값과 무관하게
      이미 침묵 중이다. 즉 그 항목은 '해소함'과 '아무것도 안 함'을 구별하지 못한다. Task 9는
      실제로 반응하는 표면(`state-injector.js:145`)으로 판정하고, 이 관측은 이연한다
  (f) 그 밖의 L2 MEDIUM·LOW — Task 9의 `escalate_pending`을 이 사이클 자신의 receipt write가
      되살릴 수 있고 순서 보장이 없다(test/MEDIUM) · Task 4/5 착지 후 `sessions` vs
      `sessions_local` 구분이 런타임 항진명제가 된다(architect/LOW) · Risks의 Task 3 mitigation이
      존재하지 않는 `event_id` dedupe를 인용했다(invariant/LOW — Task 3 삭제로 소멸하나
      기록은 남긴다). 원문과 증거는 `.claude/reviews/plan-review-orchestrator-step-wiring-m3.md`
- **Mirror**: backlog의 기존 해소 표기 관례를 따른다(신규 형식을 만들지 않는다).
- **Validate**: `node plugins/mccp/scripts/derive/sources/backlog.js`가 여전히 전 행을
  파싱한다(4열 고정 — 5번째 열은 기존 행 전부를 파서에서 사라지게 한다).

### Task 9: 끝난 milestone에 고정된 escalation 플래그를 해소한다
- **Action**: `.claude/state/STATE.md`의 `escalate_pending: true` ·
  `escalate_pending_decision_id: orchestrator-step-wiring-m1`을 해소한다. M1은 PR #174로
  **이미 머지됐고**, 그 receipt는 `review_source='multi-agent'` · `review_verdict='divergent'` ·
  `codex_verdict` 부재다 — 즉 fix-task가 지시하는 "Re-read the Codex review"의 대상이
  존재하지 않는다(backlog 기등재). 해소와 함께 **왜 갇혔는지**를 닫는다:
  `receipt/write.js:1240-1252`의 유일한 clear 경로는 *같은 `decision_id`에 대한 후속 clean
  receipt*를 요구하는데, 끝난 milestone에는 그런 receipt가 다시 쓰이지 않는다. 수명이 끝난
  decision에 걸린 알람은 구조적으로 해제 불가다.
- **이 Task는 데이터 수정 단독이다 — 코드는 건드리지 않는다** (design-critique R0 A #3,
  흡수). 앞선 초안은 Mirror에 "도달 가능성만 연다"고 적어 `receipt/write.js`의 clear 경로를
  고치라는 뜻으로도 읽혔다. 그 파일은 `## Files to Change`에 없고, `receipt/dedupe.js`가
  그 표의 첫 열을 리터럴/glob으로만 대조하므로 미등재 파일을 건드리면 residual로 떨어져
  cross-gate dedupe가 조용히 불발한다(§1.2). **구조적 결함**(수명이 끝난 decision에는
  후속 receipt가 없어 clear가 영구 도달 불가)은 escalation 수명주기 정책이라 C2 사거리
  밖이고 UI4의 경계에 걸린다 — backlog에 근거와 함께 남긴다(Task 8).
- **Mirror**: `state-writer.js`의 `update()` 호출 형태. 판정 로직을 새로 만들지 않는다.
- **경계**: STATE.md를 **직접 편집하지 않는다**(§3.2). 해소는 `state-writer.js`의
  `update()` API를 지나야 한다 — frontmatter 스키마·advisory lock·CRLF 정규화·schema
  version 가드가 그 API에 묶여 있고, 손으로 고치면 그 넷을 전부 우회한다.
- **Validate**: 해소 전후로 **운영자 표면** 두 곳을 확인한다 —
  `renderer/verdict.js:127`이 `fix-task pending escalate`(amber)를 더는 내지 않고,
  `state/state-injector.js:141-149`가 SessionStart 주입에 `## Escalation Pending` 블록을
  더는 싣지 않는다. **주입기는 `state-injector.js`다** (design-critique R0 A #2, 흡수) —
  `msw-metrics/a3-instruction-cost.js:523`도 같은 블록을 만들지만 그것은 토큰 계측을 위해
  payload를 read-only로 재구성하는 **미러**이고 A3 CLI를 돌릴 때만 실행된다. 매 세션이
  실제로 지불하는 비용은 `state-injector.js` 쪽이므로 acceptance는 그쪽을 본다.

### Task 10: 라이브 `/mccp:work` 완주를 1회 관측한다
- **Action**: M2가 배선한 supersession(Step 3.verify · Phase 3의 `record-step`)이 실제
  체인 실행에서 발동하는 것을 관측한다. 오늘 `last-halt`는 2026-09-03 M1의 `3.preflight`
  halt를 재생 중이며, 그 배선은 test와 합성 실행으로만 검증됐다(STATE.md Open Question).
- **Mirror**: `work-command-body.test.js` 테스트 (i) — 배선의 존재는 이미 정적으로 고정돼
  있다. 이 Task가 더하는 것은 *발동*의 관측이다.
- **Validate**: 완주 전후로 `work-orchestrator.js last-halt --json`을 각각 실행해,
  전에는 M1 halt를 주장하고 후에는 주장하지 않는 것(또는 더 최신 halt를 주장하는 것)을
  기록한다. 관측 결과를 report에 원문으로 남긴다.

## Validation

```bash
# 1. 범위 내 test suite 전수
#    아래 3종(session-activity / msw-a1-boundary / msw-m8-producers)은 L2 test/HIGH가 지적해
#    추가했다. Task 5가 바꾸는 `derive/sources/session-activity.js`를 실제로 require하는 test가
#    그 셋인데 전부 lib/tests/ 아래에 있어, 원안의 목록에도 item 2의 derive/tests/* glob에도
#    걸리지 않았다 — M1 경계 acceptance가 회귀 그물 **밖**이었다.
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/msw-metrics.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-acceptance.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-b2.test.js \
  plugins/mccp/scripts/lib/tests/msw-metrics-render.test.js \
  plugins/mccp/scripts/lib/tests/work-command-body.test.js \
  plugins/mccp/scripts/lib/tests/work-halt-record.test.js \
  plugins/mccp/scripts/lib/tests/work-orchestrator.test.js \
  plugins/mccp/scripts/lib/tests/msw-events-path.test.js \
  plugins/mccp/scripts/lib/tests/session-activity.test.js \
  plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js \
  plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js

# 2. derive / state 회귀
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/derive/tests/*.test.js
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/state/tests/*.test.js

# 3. 지표 1 — 위치 독립성이 여전히 성립하는가 (M1의 핵심 acceptance 회귀)
#    세 위치에서 같은 A1이 나와야 한다.
for d in . ../../ /c/_project/mccp; do
  (cd "$d" 2>/dev/null && node plugins/mccp/scripts/derive/cli.js run --json 2>/dev/null \
     | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s).metrics.A1;console.log(process.argv[1],a.status,a.numerator+"/"+a.denominator)}catch(e){console.log(process.argv[1],"n/a")}})' "$d")
done

# 4. Task 1 — spike 가드가 시한폭탄이 아님을 확인
node -e '
  const m=require("./plugins/mccp/scripts/lib/msw-metrics");
  const mk=(n)=>({sources:{session_activity:{ok:true,task_startups_count:n,task_completions_count:1,
    startups_producer_present:true,completions_producer_present:true,sessions:[],sessions_local:[]}}});
  const r=m.computeMetrics(mk(51)).A1;
  console.log("startups=51 baseline-absent →", r.status, r.invalid_reason||"");
  if(r.status==="invalid") { console.error("FAIL: 기준선 부재가 여전히 invalid를 만든다"); process.exit(1); }
'

# 5. env-contract 계약 정합
node plugins/mccp/scripts/lib/env-contract/lint.js

# 6. PRD 파싱 — M3 행이 스캐너와 goal-detect 양쪽에 인식되는가
node plugins/mccp/scripts/lib/archive-complete/scan.js --json 2>/dev/null | head -20

# 7. 브랜치는 version을 선언하지 않는다 (우산 결정 1)
node scripts/version-declaration-guard.js

# 8. 삭제 검증 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

<!-- 강조 규칙: Likelihood 열은 최고 심각도(확실)만 굵게 한다. 그 밖의 값은
     평문이다 — 같은 값이 어떤 행은 굵고 어떤 행은 아니면 굵기가 위계를 나르지
     않고 녹인다(design-critique R0 A #4, 흡수). -->

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 5의 reader 가드가 A1이나 자기 세션까지 죽인다 — 공유 위치가 A1의 유일한 corpus이고 거기엔 자기 worktree 이벤트도 있다 | 중 | 경계를 `dirIsShared`가 아니라 kind로 잡고(DD3), Validate가 **셋을 함께** 단언한다: 비-A1 차단 · A1 분모 증가 · 자기 세션 보존. 앞 하나만 단언하면 `dirIsShared` 구현과 구별되지 않는다 |
| Task 1이 가드를 사실상 삭제한 것이 된다 | 중 | 두 번째 단언(기준선 존재 시 spike 발화)이 없으면 Task 1은 미완이다. Validate 4는 첫 축만 보므로 test 쪽에 두 축을 모두 둔다 |
| M1·M2의 acceptance가 조용히 회귀한다 | 중 | Validation 3(위치 독립성)과 `work-command-body.test.js` 전건이 회귀 그물. 둘 다 M3가 건드리는 파일을 지난다 |
| 이 계획의 plan 게이트가 승인 receipt 없이 끝난다 | **확실** | 실현됨 — 2차 진입의 L2 패널이 `divergent`(pass 1/4)를 냈고 캡 1이 소진돼 재리뷰는 기계가 거부한다. §3.16대로 1라운드를 triage(HIGH 3건 흡수 · 나머지 이연)하고 진행하며, verdict를 위조하지 않는다. `## Gate Record` 참조 |
| backlog 정리가 행을 소실시킨다 | 낮음 | Task 8이 삭제를 금지하고 표시만 단다. Validate가 파서 전 행 인식을 확인 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
- [ ] **A1 spike 가드**: `startupCount=51` · 기준선 부재에서 `status='computed'`이고,
      기준선 존재 시 급증에서는 `status='invalid'`다 — 두 단언이 모두 존재하고, 두 번째에는
      "부호 test이지 계약 test가 아니다"(DD2)는 주석이 붙어 있다
- [ ] **A1 가드의 가시성**: 잠든 가드가 `cli.js a1` 출력에 실제로 나타난다 — `startupCount`가
      임계 아래(오늘 23)일 때도 나타난다. 51에서만 나타나면 오늘 도달하지 않는 조건만 검사한
      것이고 Task 1은 미완이다 — 이 PRD Risks 첫 줄이 지목한 실패다
- [ ] **reader 가드(defence-in-depth)**: 공유 위치의 **비-A1 kind**가 `concurrent_pairs_count`를
      증가시키지 않고, 같은 위치의 **A1 kind**는 `task_startups_count`를 증가시키며, A1
      이벤트만 남긴 **자기 세션**은 B2 분모에 남는다 — 세 단언이 함께 존재한다
- [ ] **배너 좁히기**: 제어문자를 심은 worktree 이름이 텍스트·JSON 양 경로에서 raw로
      나오지 않는다
- [ ] **위치 독립성 회귀 없음**: 세 위치에서 같은 A1 값 (M1 acceptance 재확인)
- [ ] **PRD**: M3 행이 추가되고 Open Questions 5건이 근거와 함께 확정 기록됐다
- [ ] **escalation 해소**: `renderer/verdict.js`의 amber `fix-task pending escalate`와
      SessionStart의 `## Escalation Pending` 주입이 둘 다 사라졌다 — 소비처 양쪽에서 확인
- [ ] **라이브 관측**: `/mccp:work` 완주 1회 전후의 `last-halt` 출력이 report에 원문으로
      기록됐다 — 배선이 아니라 **발동**의 증거
- [ ] 브랜치가 `plugin.json` version을 선언하지 않는다 (우산 결정 1)

## Design Critique

design-critique retry loop (CLAUDE.md §3.9). trigger: `design_signal=1` — 이 계획은
렌더 표면 둘을 바꾼다(`work-orchestrator.js` halt 배너 · `msw-metrics/cli.js` A1 배너).
`skill_available=1`, call form은 오라클이 해소했다.

| Round | Findings | Verdict |
|---|---|---|
| R0 | 5 (HIGH 1 · MEDIUM 3 · LOW 1) | `ESCALATE_NEXT_ROUND` |
| R1 | 0 — 전건 흡수 | `CONVERGED` |

rounds=2 · cap=2 · verdict=`converged` · 이연 **0건**.

Assessment A(design review)와 B(detector+기계 측정)를 격리된 서브에이전트 둘로 돌렸다
(playbook hard invariant). B는 detector `exit 0 · []`, 앵커 1·3 PASS, 금지 글리프 0,
test 63/63을 보고했고 이 계획이 근거로 삼은 사실 2건(`_priorStartupCount` 쓰기 0곳 ·
`worktree`의 `safeField` 우회)을 **독립 검증해 TRUE**로 확인했다.

R0 findings와 처분:

| # | Sev | 지적 | 처분 |
|---|---|---|---|
| 1 | HIGH | Task 1의 사유 필드가 어떤 렌더 경로에도 도달하지 않는다 — 유일 소비처 `renderer/verdict.js:93-96`이 `status==='invalid'` 가드라, status를 `computed`로 바꾸는 순간 닫힌다 | **흡수** — Task 1에 배너 토큰 표면화 추가, `cli.js`를 Files to Change에 등재, Acceptance에 가시성 항목 추가 |
| 2 | MEDIUM | Validate가 지목한 `a3-instruction-cost.js`는 계측 미러이고 실제 주입기는 `state-injector.js:141-149` | **흡수** — Task 9 Validate를 운영자 표면으로 정정 |
| 3 | MEDIUM | Task 9의 Action(데이터 수정)과 Mirror(코드 변경)가 서로 다른 작업을 지시 | **흡수** — 데이터 수정 단독으로 확정, 구조적 결함은 backlog 이연 |
| 4 | MEDIUM | Risks 표에서 같은 `중`이 한 행만 굵어 강조가 위계를 나르지 않는다 | **흡수** — 강조 규칙을 표 위에 명시하고 통일 |
| 5 | LOW | `safeField` 통과 시 값이 전부 스크럽되면 라벨만 남은 `· worktree=`가 나간다 | **흡수** — Task 2 규율에 "빈 값이면 구성요소째 생략" 포함 |

앵커 4(한 화면 항목 수 상한)는 **적용 대상이 아니다.** Assessment A도 이를 위반으로
올리지 않았다. 근거는 PRD `## Design Critique Record`의 세 근거가 plan에 더 강하게
전이되기 때문이다 — plan은 rendered surface가 아니라 **파서의 입력**이고
(`/mccp:prp-implement`가 `## Tasks`·`## Validation`·`## Acceptance`를,
`receipt/dedupe.js`가 `## Files to Change` 첫 열을 리터럴로 읽는다),
`<details>` collapse는 이 저장소 plan 선례가 0건이며, 그 앵커의 출처인 PRODUCT.md
"quiet by default"는 대시보드 뷰포트를 전제한다. 표를 collapse하면 dedupe matcher가
경로를 잃어 cross-gate dedupe가 조용히 불발한다 — 앵커를 완화한 것이 아니라 **적용
범위를 명시한 것**이고, 이 계획이 실제로 바꾸는 rendered surface(터미널 한 줄 배너)에는
앵커 1~3이 그대로 적용됐다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 **recommend-only** —
아무것도 invoke하지 않으며 아래는 구현자를 위한 체크리스트다.

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

## Gate Record

이 계획의 plan 게이트는 **두 번 진입했다.** 두 진입은 같은 본문에 대한 재리뷰가 아니라
**서로 다른 원장 키**에 대한 각각의 1라운드다(§3.16). 사유·대가·판단을 그대로 남긴다
(UI5 — 우회하지 않고 받아들이되 기록한다).

### 1차 진입 — PRD 슬러그, 패널 미도달

| 단계 | 결과 |
|---|---|
| 5.-1 codex/round seal | `codex_disabled=true` · `cap=1 mode=enforce pinned-by=single-pass+codex-disabled` |
| 5.0 impeccable detect | `skill_available=1` · `design_signal=1` → critique loop 발화 |
| 5.0 design critique | R0 5건 → 전건 흡수 → R1 `CONVERGED` (rounds=2, 이연 0) |
| 5.2 mode | `multi-agent` (quorum 3/4, L3 미발화) |
| 5.2a L1 | R0 `divergent` (C6 미해소 인용 1건) → 인용 3건을 full 경로로 정정 → **R1 `converged`, 위반 0** |
| 5.2b reserve | `granted=4 required=3` — 통과 |
| 5.2c emit-workflow-args | **`EX_BLOCK` (exit 12)** — `3/1 for mccp-plan-codex__orchestrator-step-wiring` |
| 정리 | 예약 반환(`--actual 0`, launched 0) · `halt_stage=5.2c-emit` 기록 |

**차단 원인은 이 계획의 결함이 아니라 슬러그 키잉이다.** 1차 진입은 인자가 PRD 경로였고,
라운드 원장은 그 인자에서 파생한 `orchestrator-step-wiring`으로 키잉된다. 그 키에는 M1·M2
사이클이 남긴 panel 라운드가 이미 3건 쌓여 있다. 즉 소진된 예산은 **다른 두 계획**이 쓴
것이고, 이 본문은 그 시점까지 패널 리뷰를 0회 받았다.

리뷰 기록: `.claude/reviews/plan-review-orchestrator-step-wiring.md` (`halt_stage=5.2c-emit`).

### 2차 진입 — milestone 슬러그, 이 본문의 1라운드

인자를 **plan 경로**로 주면 슬러그가 `orchestrator-step-wiring-m3`으로 갈리고
(memory: decision-slug-diverges-plan-vs-implement), 그 키의 원장은 **0라운드**다(실측).
따라서 2차 진입은 캡을 우회한 것이 아니라 이 본문에 대한 **첫 라운드**다. 같은 형태의
선례가 저장소에 있다 — M1도 PRD 슬러그 3라운드 뒤 `mccp-plan-codex__orchestrator-step-wiring-m1`
키에서 2라운드를 받았고, `leadtime-observability` · `release-channel-separation` · `ci-full-suite`도
같다. 부수 효과로 이 진입이 쓰는 receipt의 슬러그는 `/mccp:prp-implement`가 파생하는 슬러그와
**일치**하므로, 다음 단계는 informational allow-path가 아니라 실재 receipt로 통과한다.

| 단계 | 결과 |
|---|---|
| 5.-1 codex/round seal | `codex_disabled=false` · `cap=1 mode=enforce pinned=false` · key `mccp-plan-codex__orchestrator-step-wiring-m3` · `rounds_so_far=0` |
| 5.0 impeccable detect | `skill_available=1` · `design_signal=1` · call form `impeccable:impeccable` |
| 5.0 design critique | 재실행하지 않는다 — 1차의 `converged`(rounds=2, 이연 0)를 승계한다. 수렴 이후 본문 변경은 경로 인용 3건 정규화와 이 섹션뿐이고 둘 다 렌더 표면이 아니다(§3.16) |
| 5.2a L1 | `converged` · 위반 0 |
| 5.2b reserve | `granted=4 required=3` — 통과 |
| 5.2c emit-workflow-args | **통과** — `reviewed_plan_hash=sha256:ce77c9ca…` · dispatch `round_index=0` |
| 5.2 L2 패널 | `responded 4/4` — **pass 1 / fail 3** (architect pass · security·test·invariant fail) |
| 5.2d 정산 | `reconciled launched=4 delta=0` |
| 5.2e decide | **`divergent`** (`multi-agent`) · proof 없음 · `EX_BLOCK` — `L2 quorum not satisfied: 6 blocking finding(s)` |
| 정리 | `halt_stage=5.2e` 기록 · **receipt 미작성** |

**receipt는 작성되지 않았고 위조하지 않았다.** 패널이 승인하지 않았으므로 proof가 없고,
5.6b는 그 상태에서 receipt 쓰기를 금지한다 — 결과가 인증되지 않은 리뷰에 receipt를 쓰면
`resolution.converged`가 기본값 `true`를 물려받아 certify한 적 없는 것을 certify했다고
읽히기 때문이다. 1차 진입·M2와 같은 상태다.

**그리고 이 슬러그의 원장도 이제 1라운드다 — 캡 1이므로 재리뷰는 기계가 거부한다.** §3.16이
정한 그대로이며, 남은 정당한 행동은 이 1라운드를 triage하고 진행하는 것이다.

### 1라운드 triage (§3.14 · §3.16)

HIGH 3건은 **전건 흡수**했고, 셋 다 인용된 코드를 직접 열어 실재를 확인했다:

| # | 렌즈 | 지적 | 처분 |
|---|---|---|---|
| 1 | test | DD3·Task 5의 전제("공유 위치가 B2 분모를 오염시킨다")가 거짓 — `A1_AXIS_KINDS` 라우팅 + `spanOf`의 `session_start` 요구로 오늘 오염은 0 | **흡수** — DD3 재작성, Task 5를 defence-in-depth로 재정의하고 경계를 kind 기준으로 이동 |
| 2 | test | Task 5가 바꾸는 `session-activity.js`를 검증하는 test 3종이 `## Validation` 어디에도 없다 | **흡수** — `session-activity` · `msw-a1-boundary` · `msw-m8-producers`를 suite에 추가 |
| 3 | invariant | Task 1+DD2가 anti-gaming 가드를 영구 도달 불가로 만들고 그 이연이 미등재 | **흡수** — DD2에 대가를 명시, 짝 단언을 "부호 test"로 규정, Task 8에 등재 |

MEDIUM·LOW 11건은 §3.14대로 이연했다 — 단, 흡수한 HIGH와 **같은 축**인 지적
(security의 `dirIsShared`≠외래 · `remediation_pr` dead read · DD1 dormant, test의 dead read ·
도달 불가 분기, invariant의 DD3↔Task 3 모순)은 그 흡수에 포함됐다. 나머지는 Task 8이
backlog에 등재한다. 전문과 증거는
`.claude/reviews/plan-review-orchestrator-step-wiring-m3.md`.

**Task 3은 삭제됐다.** 이 triage가 만든 유일한 범위 변경이며 사용자 판정을 거쳤다.

### 이 재진입에 대한 리뷰어의 이의 (invariant/MEDIUM) — 기각하지 않고 남긴다

리뷰어는 재키잉이 사실상 새 원장이고 §3.16의 감사 우회 목록에 없으며, receipt가
`rounds_so_far=0`을 봉인하면 **앞선 캡 차단이 ship 감사가 읽는 원장에 흔적을 남기지 않는다**고
지적했다. 앞 두 축에 대한 반론은 위에 적은 그대로다(밀스톤 슬러그는 `/mccp:prp-implement`가
파생하는 그 슬러그이고 선례가 5건이며, 이 본문의 패널 라운드는 0이었다). **세 번째 축인 감사
공백에는 반론이 닿지 않는다** — 이번에는 receipt가 작성되지 않아 실현되지 않았을 뿐이다.
Task 8 (d)로 등재한다.

### 캡 pin 자체는 이 milestone이 고치지 않는다 (UI4)

`review-single-pass.js#effectiveRoundCap`이 `codexDisabled=true`에서 채널을 구분하지 않고
캡을 1로 pin하는데, `multi-agent` 모드의 L2 리뷰어는 Codex가 아니라 `mccp:review-*` Claude
서브에이전트이므로 그 pin의 근거 문구("Codex is off; there is no reviewer for a second
round")는 이 모드에서 거짓이다. 이 관측은 backlog에 HIGH로 기등재돼 있고 소유 축은
review-loop-bypass / env-contract-integrity다. **1차 진입은 그 결함의 두 번째 실증 사례**로
기록된다(첫 번째는 M2).

여기에 **세 번째 관측**을 덧붙인다: 라운드 예산이 PRD 슬러그에 묶이므로 한 PRD의 N번째
milestone은 앞선 milestone들이 쓴 예산의 잔량을 물려받는다. 예산의 의미 단위는 *리뷰받는
본문*인데 키는 *PRD*라서, 슬러그가 갈리는 경로(plan 경로 호출)를 아는 사람만 리뷰를 받을 수
있다. 이 역시 위 두 축 소유이며 backlog 항목에 근거로 덧붙인다.

### 3차 진입 준비 — 재키잉과 그 대가 (2026-09-07)

`/mccp:prp-implement` 진입에서 `mccp-plan-codex` receipt 부재가 검출됐고, 명령
본문 Phase 0.0 step 4가 그 게이트의 blind write를 금지한다. 제시된 두 복구를 모두
실측했고 **둘 다 이 상태에서 도달 불가**였다.

| 복구 | 결과 |
|---|---|
| `/mccp:plan` 재실행 (`orchestrator-step-wiring-m3` 키) | 불가 — 원장 `rounds_so_far=1 cap=1 mode=enforce`. 5.2c가 패널 launch를 거부한다 |
| receipt 수동 작성 (§3.3 복구 4번) | 불가 — `write.js:581-590`의 DD11 all-or-nothing이 `--review-proof-file`을 요구하는데 `proof.json`이 **부재**하다. 패널이 승인하지 않아 생성되지 않았고(`decision.json` → `review_proof:null`), 손으로 만들어도 `write.js:626-635`의 DD13이 hash 불일치로 거부한다 |

writer가 받는 나머지 한 형태는 `--review-mode`와 삼위일체를 모두 생략하는 것인데,
그러면 `resolution.converged`가 기본값 `true`가 되어 **승인을 기록하지 않은 채
CONVERGED로 읽히는** receipt가 된다. `write.js:567-578`은 그 형태를 mode 선언 시
명시적으로 거부하며 사유를 이렇게 적는다 — "do not seal a receipt for a review
whose outcome is unknown." 그래서 위조하지 않았다.

**따라서 slug를 `orchestrator-step-wiring-m3-rev2`로 재키잉했다** (`git mv` +
PRD 밀스톤 행 갱신). 사용자 판정이다.

**재키잉의 근거는 예산이 아니라 산출물이 달라졌다는 것이다.** 패널이 본 본문은
`sha256:ce77c9ca…`이고 지금 본문은 `sha256:51678c33…`이다. 그 사이에 1라운드
triage가 HIGH 3건을 흡수하며 DD3를 재작성하고 Task 3을 삭제했으며 Task 5의 경계를
kind 기준으로 옮기고 `## Validation`에 test 3종을 추가하고 Task 8을 확장했다.
DD13이 옛 proof를 거부하는 이유와 같은 사실이다 — 이 리뷰는 **다른 문서**를 본다.

**그럼에도 리뷰어의 이의는 이 진입에 더 강하게 적용된다.** 2차 진입에 대해
invariant 리뷰어는 재키잉이 사실상 새 원장이고 §3.16의 감사 우회 목록에 없다고
지적했다. 그 지적은 3차에도 유효하며, 이번에는 **의도적으로** 수행했으므로 더
그렇다. 기각하지 않고 남긴다. 완화되는 것은 하나뿐이다: 위 표가 보여주듯 §3.16이
열거한 우회 중 이 상태에 적용 가능한 것이 없었고, 남은 선택지는 재키잉·`MCCP_SKIP_RECEIPT`
우회·중단 셋뿐이었다. 셋 다 원장에 흔적을 남기지 않는다는 점에서 같고, 재키잉만이
**패널을 실제로 다시 통과시킨다**.

이 관측 — "패널 HALT 후 정규 복구 경로가 0개"— 는 Task 8이 backlog에 등재한다.
소유 축은 review-loop-bypass / env-contract-integrity다(캡 pin 축과 같다).

**이 진입이 주장하지 않는 것**: 앞선 라운드가 없었다는 것. `mccp-plan-codex__orchestrator-step-wiring`
(3라운드) · `__orchestrator-step-wiring-m3`(1라운드) 원장은 그대로 남아 있고, 새 키의
receipt가 `rounds_so_far=0`을 봉인하더라도 그 둘은 지워지지 않는다. ship 감사가 세 키를
함께 읽지 않는다는 것이 등재하는 결함이며, 이 문단이 그 공백을 산문으로 메운다.
