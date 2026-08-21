# Plan: santa 델타 리뷰 M3 — 사이클 잔여 마감 (backlog · fix-task · 부수 정정)

**Source PRD**: .claude/prds/santa-delta-review.prd.md
**Selected Milestone**: 3 — 사이클 잔여 마감 (backlog · fix-task · 부수 정정)
**Complexity**: Medium

## Summary

M1·M2가 배송되는 동안 santa-delta-review 사이클이 **관측했지만 닫지 않은 것들**을 한 번에
마감한다. 대상은 세 갈래다 — 이 사이클의 backlog 행, M1 게이트가 남긴 fix-task 에스컬레이션,
그리고 사이클 도중 실측된 부수 결함(백로그 파서의 조용한 행 유실 · 게이트 정책 env가 만드는
상시 red · hook-trace 루트의 cwd 표류와 절대경로 노출 · 명령 본문 2건 · version 충돌).

**M3는 탐지율을 재지 않고 `MCCP_SANTA_DELTA_SCOPE`의 default를 건드리지 않는다.** Layer 2
(라이브 리뷰어 비교)는 PRD Open Question 소유이며 이 milestone의 범위 밖이다 — M3가 닫는 것은
*사이클이 남긴 부채*이지 *PRD의 측정 축*이 아니다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | santa-delta-review PRD에 M3 milestone을 추가한다 | direction |
| UI2 | M3가 마감할 대상은 이 작업에서 발견된 backlog다 | constraint |
| UI3 | M3가 마감할 대상에 fix-task를 포함한다 | constraint |
| UI4 | M3가 마감할 대상에 추가적인 수정사항을 포함한다 | direction |
| UI5 | M3는 이 축의 최종 마무리다 | direction |
| UI6 | 리뷰 라운드 캡을 올려 수렴할 때까지 반복한다 | direction |
| UI7 | 통과시키려고 리뷰어 프롬프트를 완화하지 않는다 | constraint |
| UI8 | 미해소 항목은 조용히 버리지 않고 backlog·fix-task·신규 PRD 중 하나로 명시 이연한다 | constraint |
| UI9 | 명시 요청이 없으면 서브에이전트와 Workflow를 발화하지 않는다 | exclusion |
| UI10 | 탐지율 하락 없음을 입증하기 전에는 델타 default를 off에서 뒤집지 않는다 | exclusion |
| UI11 | 델타를 PR이나 code-review 등 다른 게이트로 확장하지 않는다 | exclusion |
| UI12 | 검증했다고 과대 주장하지 않는다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 미던지는 집계 함수 | `plugins/mccp/scripts/lib/santa/detection-corpus.js:366-391` | 어떤 입력에도 던지지 않고 형태 이탈을 `unknown` 레코드로 접는다 — 측정 도구가 던지면 측정이 중단되고, 중단된 측정은 "하락 없음"과 구별되지 않는다 |
| 닫힌 사유 enum | `plugins/mccp/scripts/lib/santa/detection-corpus.js:67-84` | 자유 문자열 대신 고정 하이픈 토큰. 소비처가 무엇이든 받는 필드를 갖지 않게 한다 |
| 미상과 관측된 0의 구별 | `plugins/mccp/scripts/lib/santa/detection-corpus.js:557-576` | `ABSENT`를 `DEGRADED`와 다른 토큰으로 둬 "안 쟀다"와 "재봤더니 하락"을 사후에 가른다 |
| 게이트 정책 env 격리 (자식 프로세스) | `plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js:35` | 명시 지정이 없으면 해당 키를 자식 env에서 `delete`. 저장소 자신의 설정이 검사 대상 축을 가리는 것을 제거한다 |
| 게이트 정책 env 격리 (in-process) | `plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js:66-73` | `withoutSinglePass` — 저장·삭제·복원 3단. 같은 계약을 자식 프로세스 축으로 옮긴 것이 Task 3 |
| repo root 앵커 | `plugins/mccp/scripts/hooks/session-activity-tracker.js:358-360` | `git rev-parse --show-toplevel`로 루트를 정하고 cwd를 그대로 믿지 않는다 |
| repo-relative 사용자 표면 | `plugins/mccp/scripts/receipt/write.js` 의 `meta.cwd` 정규화 (CLAUDE.md §3.12) | 밖으로 나가는 경로는 절대경로가 아니라 repo 기준 상대경로로 낸다 |
| 명령 본문 정적 단언 | `plugins/mccp/scripts/lib/tests/santa-delta-command-body.test.js:19-20` | test가 `commands/*.md`를 읽어 본문 문자열을 단언한다 — 이 저장소에 이미 세 파일(`santa-delta-` · `plan-review-` · `review-single-pass-command-body.test.js`)이 쓰는 확립된 패턴이다 |
| 파서의 degraded 신호 | `plugins/mccp/scripts/derive/sources/backlog.js:12` | `{ok, count, items, invalid_count, degraded, error}` 반환 형태를 유지한 채 값만 실제로 채운다 |
| backlog 행 보존 마킹 | `.claude/plans/codex-findings-backlog.md` 의 ABSORBED 행 | 흡수한 행을 지우지 않고 `**ABSORBED in <milestone>**` + `row 보존(audit trail)`로 표시한다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/derive/sources/backlog.js` | UPDATE | GFM 규약대로 leading/trailing pipe 선택 허용 + date 셀 엄격화 + `invalid_count`/`degraded` 실제 계수 |
| `plugins/mccp/scripts/derive/tests/backlog-source.test.js` | CREATE | 파서 회귀 — pipe 4형태 동일 파싱 + 불량 행 계수 + 산문 줄 미오인 |
| `plugins/mccp/scripts/lib/santa/detection-corpus.js` | UPDATE | `compareCoverage` — id 없는 레코드 유실 차단 · `totals.unknown` 양측 계수 · `measured`/`degradedReason`로 미측정과 무손실 분리 |
| `plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js` | UPDATE | 위 3축 회귀 + 기존 21건 불변 확인 |
| `plugins/mccp/scripts/lib/tests/helpers/gate-env.js` | CREATE | 자식 프로세스 env에서 게이트 정책 키를 제거하는 공유 헬퍼 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE | `cli()`·`spawnCli()`가 헬퍼를 경유해 ambient 상속을 끊는다 |
| `plugins/mccp/scripts/lib/hook-trace.js` | UPDATE | `resolveRepoRoot(event)` + `toRepoRelative(repoRoot, abs)` 신규 — 두 hook이 공유하는 **단일 판정 지점**(DD6) |
| `plugins/mccp/scripts/hooks/post-tool-use-failure.js` | UPDATE | 로컬 `repoRootOf`를 공유 판정으로 교체 + 사용자 표면 경로를 repo-relative로 |
| `plugins/mccp/scripts/hooks/session-end-trace.js` | UPDATE | 같은 공유 판정 사용 — shard와 `.end` 마커가 다른 디렉토리로 갈리는 것을 막는다 |
| `plugins/mccp/scripts/hooks/tests/hook-trace-root-anchor.test.js` | CREATE | 하위 디렉토리 cwd에서도 저장소 루트 한 곳 + 표면 절대경로 0건 + 미던짐 |
| `plugins/mccp/scripts/lib/plan-conflict-detector.js` | UPDATE | `normalizePath`가 백틱을 제거하지 않아 plan 표의 모든 경로가 영구 미매칭 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | plan-conflict 호출의 두 점 diff(`origin/main..HEAD`)를 세 점으로 — 발산 브랜치에서 상시 오발화 |
| `plugins/mccp/scripts/lib/tests/plan-conflict-detector.test.js` | UPDATE | 백틱 경로 매칭 회귀 + 본문 세 점 정적 단언 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 흡수 행 `ABSORBED` 마킹 + 미흡수 행 이연 사유 1줄 |
| `.claude/prds/santa-delta-review.prd.md` | UPDATE | M3 행 추가 + Open Question 갱신 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version — origin/main과의 `1.30.2` 충돌 forward-only 해소 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 중복 `## [1.30.2]` 헤딩 해소 + M3 항목 + `currently` 노트 |
| `.claude/notes/santa-delta-review-m3.md` | CREATE | backlog 처리 대장(흡수/이연 전건) + fix-task 방출 기록 |
| `.claude/PRPs/reports/santa-delta-review-m3-report.md` | CREATE | 구현 결과 |

## Design Decisions

### DD1 — 백로그 파서는 데이터가 아니라 파서를 고친다

현재 `scanBacklog`는 date 행 443개 중 **171개만** 본다(plan 작성 시점 실측 — 이 게이트가 도는
동안 리뷰 적재로 453 / 181이 됐다. 두 수가 함께 움직이므로 정본은 숫자가 아니라 **둘이 같아야
한다는 관계**다). 272개가 사라지는
이유는 데이터 이탈이 아니라 파서가 GFM을 좁게 읽기 때문이다 — GFM에서 leading/trailing pipe는
**선택**인데 `plugins/mccp/scripts/derive/sources/backlog.js:35`의 `startsWith('|')`와 `:36`의
`cells.length < 6`이 둘 다를 필수로 요구한다.

따라서 272행에 `|`를 붙이는 데이터 수정은 하지 않는다. 그것은 파서의 결함을 데이터의 결함으로
분류하는 것이고, 같은 결함이 다음 append에서 즉시 재발한다. **파서를 GFM에 맞춘다.**

동시에 date 셀을 `^\d{4}-\d{2}-\d{2}$`로 **엄격화**한다. leading pipe를 선택으로 만드는 순간
`|`가 하나라도 든 산문 줄이 행으로 오인될 표면이 열리므로, 느슨해지는 축과 조여지는 축이
같은 커밋에 있어야 한다. 실측: 엄격화 후에도 443행 전부 통과, invalid 0.

### DD2 — `invalid_count`는 리터럴 0을 그만두는 것이 요점이다

`plugins/mccp/scripts/derive/sources/backlog.js:49`는 `invalid_count: 0`을 **상수로** 반환한다.
즉 «건너뛴 행이 있었는가»를 물을 자리는 이미 스키마에 있고 값만 거짓이었다. §3.15가 «미흡수
지적은 자동 회수된다»를 이 표에 걸고 있으므로, 형식 이탈 한 글자가 그 불변식을 그 행에 한해
무력화하면서 **경고 하나 남기지 않는다**. 반환 형태는 바꾸지 않고 값만 실제로 채운다 —
소비처 변경이 필요 없다.

### DD3 — `degraded`의 의미를 넓히지 않고, 옆에 `measured`를 둔다

`compareCoverage`의 `degraded = totals.delta < totals.full`은 **containment 축의 판정**이고
그 이름과 의미는 M2가 의도적으로 좁게 잡았다(`detectionDegraded`로 짓지 않은 이유). 그러나
전 레코드가 `unknown`이면 `full=0, delta=0`이라 `degraded=false`가 되고, **측정 실패가
"손실 없음"으로 읽힌다.**

이것을 `degraded`의 정의를 바꿔서 고치지 않는다 — 기존 소비처의 명제가 조용히 달라진다.
대신 **`measured`(불리언)와 `degradedReason`(닫힌 enum)을 추가**하고 `degraded`는 그대로
둔다. `decideDefaultFlip`의 `ABSENT`/`DEGRADED` 분리와 같은 수단이다: 미상과 관측을 다른
토큰으로 남긴다.

### DD4 — 색인에서 사라지는 레코드는 조용히 사라지면 안 된다

`indexRecords`는 `id === null`이면 그 레코드를 건너뛴다. `classify`가 형태 이탈을
`unknownRecord(null, …)`로 접으므로, **id를 못 읽은 결함은 `totals.unknown`에도 `unmatched`에도
남지 않는다.** 즉 corpus 조립이 깨진 만큼 정확히 조용해진다.

`byId` 색인 자체는 그대로 둔다(id 없는 것을 색인할 수 없다는 것은 참이다). 대신
`compareCoverage`가 **색인이 아니라 records 배열을 직접 훑어** `totals.unknown`을 세고,
id 없는 레코드를 `unmatched`에 `side:'unindexable'`로 넣는다. `totals.unknown`은 같은 이유로
**양측** 계수한다(현재 `fullById` 키만 순회해 delta 쪽 unknown이 안 세어진다).

### DD5 — env 위생은 test 파일이 아니라 공유 헬퍼가 지고, 요건은 "env 무관"이다

`santa-loop-cap.test.js`의 `cli()`·`spawnCli()`는 `Object.assign({}, process.env, …)`로 ambient를
상속한다. 이 저장소는 `settings.json`에 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`를 켜 두므로
그 파일이 **상시 red**다 — 실측: 단독 실행 시 25 pass / 57 fail, env만 제거하면 53 pass / 0 fail.
전 스위트 기준으로도 저장소 env 그대로 2503건 중 **51 fail**인데, env 하나만 제거하면
2493건 중 **1 fail**이다.

**상시 red는 새 red를 묻는다** — 그것이 이 항목이 LOW가 아닌 이유다. 고치는 방식은 개별 파일에
`delete`를 흩뿌리는 것이 아니라 `plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js:35`가
이미 쓰는 계약을 공유 헬퍼로 올리는 것이다: **명시 지정이 없으면 게이트 정책 키를 자식 env에서
제거한다.** `Object.assign({}, process.env, …)`를 쓰는 파일은 30개지만 **실측으로 red인 파일에만**
적용한다 — 붉지 않은 파일을 건드리는 것은 이 milestone이 재려는 것을 흐린다.

**요건은 «53/0을 재현한다»가 아니라 «env 유무와 무관하게 같은 결과를 낸다»이다.** 전자는
`.claude/settings.json`이 특정 값을 갖고 있다는 전제에 매달리고, 그 전제는 사용자가 언제든
바꿀 수 있다. 후자는 전제를 갖지 않으며 Task 3이 실제로 사려는 성질이다 — acceptance는
**두 env 조합에서 같은 결과**를 요구한다.

### DD6 — hook-trace 루트는 cwd가 아니라 git toplevel이고, 판정은 한 자리에 있고, 표면은 repo-relative다

`plugins/mccp/scripts/hooks/post-tool-use-failure.js:38-39`와
`plugins/mccp/scripts/hooks/session-end-trace.js:60-62`의 `repoRootOf`는 `event.cwd`를 그대로
저장소 루트로 쓴다. 본 plan 세션이 실측 재현했다 — 하위 디렉토리에서 실패한 Bash 호출 하나가
`plugins/mccp/scripts/.claude/state/hook-trace/<sid>/…`를 만들었다(정리 완료).

쓰레기 파일보다 나쁜 것은 **shard와 `.end` 마커가 다른 디렉토리로 갈리는 것**이다. shard가
루트에 쌓이는 동안 세션이 하위 디렉토리에서 끝나면 루트 세션 디렉토리에 `.end`가 없고,
다음 세션의 `scanCrashAlerts`가 **거짓 crash alert**를 낸다 — v1.20.5가 `writeDegradedEndMarker`로
닫은 바로 그 실패 모드가 cwd 표류로 다시 열린다(§3.2). 이 방향은 본 사이클에서 *재현하지
않았다* — 재현한 것은 산란이고, 마커 분리는 같은 원인에서 따라 나오는 귀결이다. Task 4의
test가 두 hook을 서로 다른 cwd로 불러 이것을 **직접** 확인하며, 확인되지 않으면 그렇게 적는다(UI12).

세 가지를 함께 정한다.

1. **판정은 한 자리** — `plugins/mccp/scripts/lib/hook-trace.js`에 `resolveRepoRoot(event)`를
   두고 두 hook이 그것을 부른다. 두 파일에 같은 로직을 복사하면 다음 수정에서 갈린다.
   `hook-trace.js`가 이미 `repoBaseDir`·`sessionDir`·`shardPath` 전부를 `repoRoot` 인자로
   받는 소유자이므로, 그 인자를 만드는 판정도 여기가 자리다.
2. **fail-open 유지** — toplevel 판정이 실패하면 `event.cwd`로 되돌아간다. hook이 던져서
   도구 호출을 막는 것은 이 축이 사려는 것이 아니다.
3. **표면은 repo-relative** — `buildSurface`(`post-tool-use-failure.js:64`)와
   `buildAdditionalContext`(`:69-71`)가 `traceLogPath`를 **그대로** 출력한다. 현재 그 값은
   이미 절대경로이고(`event.cwd`가 절대경로이므로), toplevel 앵커는 그 성질을 바꾸지 않는다.
   즉 이것은 Task 4가 만드는 결함이 아니라 **선재 결함**이다. 그러나 §3.12가 receipt
   `meta.cwd`에 대해 이미 정한 관례(repo-relative 정규화로 절대경로 leak 회피)가 사용자
   표면에도 그대로 적용되어야 하므로, 같은 파일을 여는 김에 `toRepoRelative(repoRoot, abs)`로
   접는다.

   **주장의 범위를 좁혀 둔다.** «표면 절대경로 0건»은 **git toplevel 해석이 성공한 경로**에
   한정된다. 비-git cwd fallback에서는 `repoRoot`가 곧 `event.cwd`이고 대상이 그 밖이 아니므로
   상대경로가 나오지만, 저장소 자체가 없는 환경(fallback 중의 fallback)에서는 원본 절대경로가
   그대로 나간다 — 그것을 `..` 사슬로 바꾸는 것이 더 나쁘기 때문이다. test는 두 경우를 **다른
   단언으로** 나눠 검사한다: 단언 2가 git 성공 경로의 0건을, 단언 3이 fallback의 «원본 그대로 ·
   미던짐»을 본다. 이렇게 나누지 않으면 acceptance가 구현이 지킬 수 없는 명제를 요구하게 된다.

### DD7 — 두 점 diff와 백틱은 같은 결함의 양끝이다

`plugins/mccp/commands/prp-implement.md:1041`은 `git diff --name-only origin/main..HEAD`를
넘긴다. 두 점은 *트리 대 트리*라 브랜치가 base보다 뒤처지면 **base 쪽 변경까지 "이 브랜치가
바꾼 것"으로 보고**한다. 현재 브랜치가 정확히 그 상태다(`origin/main...HEAD` = 15 / 2).

`plugins/mccp/scripts/lib/plan-conflict-detector.js:42-44`의 `normalizePath`는 백틱을 제거하지
않는다. plan의 `Files to Change` 첫 열은 관례상 백틱으로 감싼 경로라 파싱 결과가 백틱을 달고
나오고, diff 경로는 맨몸이라 `isInPlan`이 **영구 미매칭**한다 → 변경 파일 전부가 unplanned로
보고된다.

실측 사슬(M2 plan 기준, 현 브랜치 · plan 작성 시점):

| 조합 | unplanned |
|---|---|
| 두 점 + 백틱 (현재) | 68 |
| 세 점 + 백틱 | 37 |
| 세 점 + 백틱 제거 | 23 |

둘 다 고치지 않으면 axis-H 가드는 «항상 발화»이고, 항상 발화하는 가드는 꺼진 가드와 같다.
**잔여 23은 오발화가 아니다** — 이 브랜치는 M1·M2 두 커밋을 함께 지고 있어 M2 plan의
`Files to Change` 밖 산출물(M1 report·note·closure·receipt)이 실제로 들어 있다. 즉 수정 후의
가드는 처음으로 *참인 것을 보고*한다.

**이 세 숫자는 저장소 상태에 매달린다** — 커밋이 하나 더 쌓이면 달라진다. 그러므로 test가
동결하는 것은 숫자가 아니라 **불변식**이다: 합성 fixture에서 백틱 경로가 bare diff 경로와
매칭되고(`isInPlan` true), 명령 본문에 두 점 diff가 0건이라는 것. 위 표는 plan 작성 시점의
관측 기록이며 acceptance의 판정 기준이 아니다.

### DD8 — version은 미리 정하지 않고 두 시점에 재계산한다

origin/main이 `1.30.2`를 diverse-agent-review M7에 이미 발행했는데(`11f7dc2`) 이 브랜치도
`1.30.2`를 santa-delta-review M1에 쓰고 있다. §3.7 forward-only에 따라 **이미 발행된 번호가
불가침**이므로 미머지 쪽을 민다: M1 `1.30.2 → 1.30.3`, M2 `1.30.3 → 1.30.4`, M3 `1.30.5`.

두 항목을 하나로 합치지 않는다 — CHANGELOG 서사가 뭉개진다. 그리고 §3.7이 실측 4회로 경고한
대로 **번호를 미리 확정하지 않는다**: (a) 머지 해소 시점과 (b) `/mccp:pr` 진입 직전에 각각
재계산하고, 재상향할 때마다 4면 동기와 `i18n-surface.test.js`를 다시 돌린다. 위 숫자는
현 시점의 예상이지 확정이 아니다.

### DD9 — fix-task는 손으로 편집하지 않고 내용을 방출해 닫는다

`.claude/state/fix-task.md`는 이 사이클에서 두 번 생겼다 — M1 게이트의 `codex_divergent`
에스컬레이션(적용됨: `fix-task-applied.md`)과, 이 M3 plan 게이트가 divergent로 판정될 때
`stop-review-loop`이 다시 쓴 것이다. 둘 다 같은 것을 요구한다: «리뷰의 미해소 지적을 각각
처리하라».

§3.2가 «직접 편집하지 말고 writer API를 쓰라»고 하므로 파일을 손으로 고치지 않는다. 대신
그 에스컬레이션이 **요구한 것**을 실제로 처리한다 — 그 지적들은 `plan-review/cli.js
backlog-append`가 `.claude/plans/codex-findings-backlog.md`에 기계 적재한 바로 그 행들이고,
Task 7이 전건을 흡수/이연으로 처리한다. 방출의 근거는 노트에 **finding → backlog 행 → M3
task** 대응표로 남긴다. 파일 자체는 writer 또는 TTL sweep이 소유한다.

### DD10 — M3는 PRD를 닫지 않는다

M1·M2·M3가 모두 `complete`가 되면 `/mccp:archive-complete`의 `scan.js`가 이 PRD를 archivable로
판정한다(§3.11 C3). 그러나 **Layer 2 Open Question은 여전히 열려 있다**. M2 closure가 같은
자리에서 남긴 권고를 M3도 유지한다: 아카이브는 별도 human-gate이고 Layer 2가 닫히기 전까지
보류한다. M3의 `complete`는 «사이클 부채를 닫았다»이지 «PRD 측정 축이 검증됐다»가 아니다(UI12).

### DD11 — 어떤 게이트가 무엇을 인증하는지 (acceptance의 시점 경계)

이 plan의 `## Acceptance`는 **구현 시점 검사**다. 그것은 결함이 아니라 게이트 분업이다.

| 게이트 | 인증하는 명제 | anchor |
|---|---|---|
| `/mccp:plan` (본 게이트) | 「이 **제안**이 리뷰를 거쳤다」 | receipt subject의 plan hash — 승인된 제안의 동일성. acceptance 충족 여부는 **인증하지 않는다** |
| `/mccp:prp-implement` | 「이 **구현**이 plan을 이행했고 validation이 통과했다」 | `mccp-implement-codex` receipt + validation loop + plan-conflict 가드 |
| `/mccp:pr` | 「이 **배송**이 dual-review를 통과했다」 | `mccp-pr-codex` ship receipt + ship gate verdict |

따라서 「acceptance가 plan 시점에 검증 불가하므로 fail-open」은 이 게이트가 하지도 않는 주장에
대한 지적이다. 그 지적을 수용하면 저장소의 모든 plan이 같은 결함을 갖는다 —
`plugins/mccp/commands/plan.md`의 PRD Artifact Output 템플릿이 acceptance를 plan 산출물의
일부로 규정하고 검증을 prp-implement로 넘기기 때문이다.

**다만 유효한 잔여가 있고 그것은 흡수한다**: acceptance 항목이 *구현 시점에도* 사람 눈으로만
확인 가능하면 그때 가서 fail-open이 된다. 그래서 아래 acceptance는 각 항목에 **판정 명령**을
붙였고, 명령으로 환원되지 않을 뻔한 유일한 항목(backlog 대장 대조)은 Task 7의 Validate가
`node -e` 검사로 기계화한다.

### DD12 — 실패·중단 시의 되돌리기

8개 task는 서로 다른 서브시스템이라 **독립적으로 되돌릴 수 있다.** 결합은 Task 5(두 점 + 백틱)
하나뿐이고 그것은 의도된 단일 커밋이다(DD7).

- **task별 커밋** — 한 task가 회귀를 내면 그 커밋만 `git revert`한다. 나머지 task는 서로의
  전제가 아니다(Task 6 version 동기만 마지막에 온다).
- **델타 축은 무접촉** — `scope-delta.js` · `scope-always.js` · `lanes.js` ·
  `DELTA_SCOPE_DEFAULT` 어느 것도 `## Files to Change`에 없다. 즉 M3가 실패해도 M1·M2가
  배송한 동작은 바뀌지 않으며, acceptance가 그 무접촉을 `git diff` 빈 출력으로 단언한다.
- **중단 시의 상태** — 미완 task는 backlog에 남는다. Task 7이 흡수/이연 이분법을 강제하므로
  «흡수하려다 못 한 것»은 «이연» 쪽으로 기록되어야 하고, 조용히 사라질 자리가 없다.
- **되돌릴 수 없는 것 0건** — 스키마 마이그레이션도, 파일 이동도, receipt 재봉인도 없다.
  `compareCoverage`는 **필드 추가만** 하고 기존 필드를 바꾸지 않으므로 소비처가 깨지지 않는다.

## Tasks

### Task 1: 백로그 파서가 행을 조용히 버리지 않게 한다

- **Action**: `derive/sources/backlog.js` — (a) 행 판정에서 leading pipe를 선택으로,
  cell 분리에서 trailing pipe를 선택으로 만든다. (b) 첫 셀을 `^\d{4}-\d{2}-\d{2}$`로 엄격
  검사한다. (c) 행 모양인데 셀 수·date 검사에 걸린 줄을 `invalid_count`로 세고
  `degraded = invalid_count > 0`으로 채운다(리터럴 0 제거). 반환 형태는 불변.
  **데이터 파일은 손대지 않는다**(DD1).
- **Mirror**: `plugins/mccp/scripts/derive/sources/backlog.js:12`의 반환 계약
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/backlog-source.test.js`
  (**Task 1이 만드는 파일이므로 Task 1 완료 후에 존재한다**). test가 동결하는 것은 저장소
  숫자가 아니라 불변식이다 — 합성 fixture에서 pipe 4형태(양쪽·leading만·trailing만·없음)가
  **같은 행 수**를 내고, 불량 행이 `invalid_count`로 세어지고, `|`가 든 산문 줄이 행으로
  오인되지 않는 것. **`invalid_count`가 리터럴 0으로 남으면 반드시 붉어지도록**, 불량 행을 심은
  fixture가 `invalid_count > 0`을 단언한다 — 이것이 없으면 DD2의 수정이 누락돼도 test가 통과한다.

  **저장소 실측치는 움직인다.** plan 작성 시점 `171 / 443`(파서가 보는 수 / 데이터 파일의 date
  행 수)이었고, 이 게이트가 도는 동안 리뷰 findings가 backlog에 적재되어 `181 / 453`으로
  **함께** 이동했다(실측). 즉 두 수의 차 272는 상수가 아니다. 그러므로 판정 기준은 숫자가
  아니라 **관계**다 — 수정 후 «파서가 보는 수 == 데이터 파일의 date 행 수»이고 `invalid_count`가
  실제 계수라는 것. acceptance (b)가 그 관계를 직접 비교한다. `status-grid` 이월 finding rail도
  같은 이유로 관측치(69 → 130)일 뿐 기준이 아니다

### Task 2: `compareCoverage`가 미측정을 무손실로 읽히지 않게 한다

- **Action**: `detection-corpus.js` 의 `compareCoverage` — (a) `totals.unknown`을 색인이 아니라
  full·delta **양측 records 배열**에서 센다. (b) id 없는 레코드를 `unmatched`에
  `side:'unindexable'`로 남긴다. (c) `measured`(불리언)와 `degradedReason`(닫힌 enum) 추가;
  기존 `degraded` 필드의 정의는 **불변**(DD3). `COVERAGE_REASONS` 같은 기존 enum 관례를 따른다.
- **Mirror**: `plugins/mccp/scripts/lib/santa/detection-corpus.js:67-84` 닫힌 enum ·
  `:557-576` ABSENT/DEGRADED 분리
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js` —
  기존 21건 전부 green 유지 + 신규 3축(전건 unknown일 때 `measured=false` · id 없는 레코드가
  `unmatched`에 남음 · delta 쪽 unknown이 계수됨)

### Task 3: 게이트 정책 env가 test 스위트를 상시 red로 만들지 않게 한다

- **Action**: `lib/tests/helpers/gate-env.js` 신규 — `childEnv(extra)`가 명시 지정이 없는
  게이트 정책 키를 자식 env에서 제거한다(최소 집합: `MCCP_REVIEW_SINGLE_PASS`. 추가 키는
  **실측으로 red를 만드는 것만** 넣는다). 통합 지점은 두 자리로 **명시**한다 —
  `santa-loop-cap.test.js`의 `spawnCli()`(현재 `env: Object.assign({}, process.env, opts.env || {})`)와
  같은 파일의 in-process `cli()` 헬퍼가 그 표현식을 `env: childEnv(opts.env)`로 바꾼다.
  `childEnv`는 `Object.assign({}, process.env, extra)`를 만든 뒤 **`extra`에 없는 정책 키만**
  `delete`하므로, 명시 지정은 항상 이기고 나머지 env는 그대로 상속된다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js:35`
  (명시 지정이 아니면 `delete`)
- **Validate**: **env 유무와 무관하게 같은 결과**(DD5) — 두 조합 모두 fail 0을 확인한다.
  이 형태는 `.claude/settings.json`의 현재 값에 의존하지 않는다.
  ```bash
  MCCP_REVIEW_SINGLE_PASS=deadline_pressure node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js
  env -u MCCP_REVIEW_SINGLE_PASS          node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js
  ```
  plan 작성 시점 실측 anchor(판정 기준 아님): 전자 25 pass / 57 fail, 후자 53 pass / 0 fail

### Task 4: hook-trace 루트를 git toplevel에 앵커하고 표면을 repo-relative로 만든다

- **Action**: (a) `plugins/mccp/scripts/lib/hook-trace.js`에 `resolveRepoRoot(event)`(toplevel
  우선 · 실패 시 `event.cwd` fallback)와 `toRepoRelative(repoRoot, abs)`를 추가한다 —
  두 경로를 `path.resolve`로 정규화한 뒤 **접두 일치일 때만** 상대경로를 내고, 아니면 **원본을
  그대로** 돌려준다. 즉 `..` 이 포함된 결과를 만들지 않는다(경로 탈출을 표면에 싣지 않기 위해서다) — **판정은 이 한 자리**(DD6-1). (b)
  `post-tool-use-failure.js`·`session-end-trace.js`의 로컬 `repoRootOf`를 그 공유 판정 호출로
  교체한다. (c) `post-tool-use-failure.js`의 `buildSurface`·`buildAdditionalContext`가
  `toRepoRelative`를 거친 경로를 출력한다(DD6-3).
- **Mirror**: `plugins/mccp/scripts/hooks/session-activity-tracker.js:358-360`의 `gitRepoRoot(cwd)`
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/hook-trace-root-anchor.test.js` —
  세 단언: (1) fixture 저장소의 **하위 디렉토리**를 `event.cwd`로 준 두 hook 호출이 저장소 루트
  `.claude/state/hook-trace/` **한 곳**에만 쓴다(shard와 `.end`가 같은 세션 디렉토리에 있다),
  (2) 사용자 표면 문자열에 저장소 루트 절대경로가 **0건**, (3) git이 아닌 cwd에서는 종전
  동작(fallback)이고 어떤 경로에서도 hook이 던지지 않는다

### Task 5: plan-conflict 가드가 처음으로 참을 말하게 한다

- **Action**: (a) `plan-conflict-detector.js` 의 `normalizePath`에 백틱 제거를 추가한다.
  (b) `prp-implement.md` 의 **두 점 diff 2자리를 모두** 세 점으로 고친다 — 실행되는 호출
  (`--files-changed "$(git diff --name-only origin/main..HEAD)"`)과, 같은 파일이 dedupe 전제를
  서술하는 산문(`git diff --name-only origin/<base>..HEAD ⊆ the plan's Files to Change`) 둘 다다.
  같은 파일 · 같은 결함이고 각각 한 글자이며, 하나만 고치면 acceptance의 «두 점 0건»이 성립하지
  않는다(실측: 현재 grep 카운트 **2**). **(a)와 (b)를 한 커밋에**(DD7). 같은 파일의
  `git diff --name-only HEAD` 호출 2곳은 working-tree 축이라 건드리지 않는다.
- **Mirror**: `plugins/mccp/scripts/lib/plan-conflict-detector.js:42-44` 기존 정규화
  체인(백슬래시·상대경로 접두 제거)에 이어 붙인다
- **Validate**: **불변식 2건이 서로 다른 두 명령으로 판정된다**(DD7). 하나가 빠져도 다른 하나가
  통과해 버리는 일이 없도록 분리한다.
  ```bash
  # 불변식 1 — 백틱 경로가 bare diff 경로와 매칭된다 (신규 test 케이스)
  node --test plugins/mccp/scripts/lib/tests/plan-conflict-detector.test.js
  # 불변식 2 — 명령 본문에 두 점 diff가 0건 (독립 판정, test 없이도 성립)
  test "$(grep -cE 'git diff --name-only origin/[^ ]+\.\.[^.]' plugins/mccp/commands/prp-implement.md)" = 0
  ```
  이 grep은 실행 호출과 산문 서술을 **둘 다** 세므로 (b)의 두 자리가 모두 고쳐져야 0이 된다
  (착수 전 카운트 2, 실측). 불변식 2는 test 안에도 **정적 단언으로 함께** 넣는다 — 이 저장소는 이미
  `santa-delta-command-body.test.js:19-20`처럼 test가 `commands/*.md`를 읽어 본문을 단언하는
  패턴을 세 파일에서 쓰므로 비표준 조작이 아니다. 두 자리에 두는 이유는 grep이 acceptance의
  독립 판정이고 test가 회귀 방지이기 때문이다. 저장소 실측 anchor(plan 작성 시점, 판정 기준
  아님): M2 plan 기준 unplanned 68 → 23이고 잔여 23이 M1 산출물임을 노트에 열거

### Task 6: version 충돌 forward-only 해소 + 4면 동기

- **Action**: `git merge origin/main` → §3.5.1대로
  `git diff --diff-filter=D --name-only origin/main...HEAD`로 **의도하지 않은 삭제 0건**을
  먼저 확인한다. CHANGELOG의 중복 `## [1.30.2]`를 forward-only로 해소(M1 → 1.30.3,
  M2 → 1.30.4, M3 → 1.30.5, 두 항목 병합 금지). `plugin.json` · `renderer/html.js` page-foot ·
  `renderer/markdown.js` derived 줄 · CHANGELOG `currently` 노트 4면 동기.
  **`/mccp:pr` 진입 직전 다시 재계산**(DD8).
- **Mirror**: CLAUDE.md §3.7 «병렬 브랜치 version 충돌 — forward-only 상향»
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` +
  CHANGELOG에 같은 version 헤딩이 둘 이상 없다(`grep -c` 결과가 1)

### Task 7: backlog 전건 처리 — 흡수 마킹과 이연 사유

- **Action**: santa-delta-review 사이클이 남긴 backlog 행을 **하나도 빠뜨리지 않고** 처리한다.
  흡수한 행에는 `**ABSORBED → santa-delta-review M3**` + `row 보존(audit trail)`을 덧붙이고,
  흡수하지 않은 행에는 **왜 이연하는지를 file:line 증거와 함께** 1줄 덧붙인다(§3.14). 행은
  삭제하지 않는다. 처리 대장을 `.claude/notes/santa-delta-review-m3.md`에 남기고, 그 노트에
  `backlog rows processed: <N>` 한 줄을 기계 판정용 앵커로 둔다.
  - 흡수 예정: 파서 유실 · `compareCoverage` 3축 · 단일통과 상시 red · env 위생 ·
    두 점 diff · 백틱 미제거 · hook-trace cwd 표류 · hook 표면 절대경로
  - 이연 예정(사유 명기): Layer 2 미실행(PRD Open Question 소유) · `impeccable-detect`의
    EXECUTE 이전 diff(게이트 발화 축, 별도 검증 필요) · plan-body 스탬프 시점 전제 미검사
    (명령 본문 축) · goal-phase allowlist의 `cd` 세그먼트(실피해 0) · 신규 test 24.6s
    (의도된 설계 대가) · fixture tmpdir 미정리(기존 관례와 일치) · L2 패널이 자동 적재한
    리뷰 기록 행(원문 링크가 정본이라 재기술 불필요)
- **Mirror**: `.claude/plans/codex-findings-backlog.md` 의 ABSORBED 마킹 선례
- **Validate**: 사람 눈이 아니라 **기계 검사**다 — 사이클 행 전건이 `ABSORBED` 또는 이연 사유
  중 정확히 하나를 갖고, 그 개수가 노트 대장 앵커와 일치한다:
  ```bash
  node -e '
    const {scanBacklog}=require("./plugins/mccp/scripts/derive/sources/backlog.js");
    const fs=require("fs");
    const rows=scanBacklog(process.cwd()).items
      .filter(function(r){ return /santa-delta-review/.test(r.source_plan); });
    const isAbs=function(r){ return /ABSORBED/.test(r.finding); };
    const isDef=function(r){ return /이연|기각/.test(r.finding); };
    const both=rows.filter(function(r){ return isAbs(r) && isDef(r); });
    const neither=rows.filter(function(r){ return !isAbs(r) && !isDef(r); });
    const note=fs.readFileSync(".claude/notes/santa-delta-review-m3.md","utf8");
    const m=note.match(/backlog rows processed:\s*(\d+)/);
    if(neither.length) throw new Error("unprocessed rows: "+neither.length);
    if(both.length)    throw new Error("rows marked both ways: "+both.length);
    if(!m || Number(m[1])!==rows.length)
      throw new Error("note ledger count != backlog rows: "+(m&&m[1])+" vs "+rows.length);
    console.log("ok rows="+rows.length+" absorbed="+rows.filter(isAbs).length+
                " deferred="+rows.filter(isDef).length);
  '
  ```

### Task 8: fix-task 방출 · PRD · report 마감

- **Action**: (a) 이 사이클이 남긴 fix-task 2건(M1 적용분 `fix-task-applied.md`, M3 plan 게이트
  divergent가 만든 `fix-task.md`)이 요구한 지적을 **finding → backlog 행 → M3 task** 대응표로
  노트에 방출 기록한다. 파일은 손으로 편집하지 않는다(DD9). (b) PRD의 M3 행을 올리고 Open
  Question을 갱신한다 — Layer 2 항목은 **열린 채로 둔다**(DD10). (c) report 작성 — «M3는
  탐지율을 검증하지 않았다»를 명시한다(UI12).
- **Mirror**: `.claude/PRPs/reports/santa-delta-review-m2-report.md` 구성
- **Validate**:
  ```bash
  node plugins/mccp/scripts/lib/instruction-contract/lint.js \
    --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
  grep -q "탐지율을 검증하지 않" .claude/PRPs/reports/santa-delta-review-m3-report.md
  grep -q "Layer 2" .claude/prds/santa-delta-review.prd.md
  git diff --name-only origin/main...HEAD | grep -q "fix-task" && exit 1 || exit 0
  ```

## Validation

**단계 순서가 있다.** 아래 블록은 위에서 아래로 실행하며, `CREATE` 대상 test는 해당 task가
끝난 뒤에야 존재한다. 0번 블록만 착수 전에 돌린다.

```bash
# --- 0. 착수 전 baseline (신규 red와 선재 red를 가르는 유일한 수단) ---
# plan 작성 시점 관측: 저장소 env 그대로 2503건 중 51 fail / env 없이 2493건 중 1 fail
node --test plugins/mccp/scripts/lib/tests/*.test.js 2>&1 | tee /tmp/m3-baseline.txt

# --- 1. Task 1 이후 ---
node --test plugins/mccp/scripts/derive/tests/backlog-source.test.js
node -e 'const{scanBacklog}=require("./plugins/mccp/scripts/derive/sources/backlog.js");
const r=scanBacklog(process.cwd());
console.log("items",r.count,"invalid",r.invalid_count,"degraded",r.degraded);'

# --- 2. Task 2 이후 ---
node --test plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js

# --- 3. Task 3 이후 (두 env 조합 모두 fail 0) ---
MCCP_REVIEW_SINGLE_PASS=deadline_pressure node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js
env -u MCCP_REVIEW_SINGLE_PASS          node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js

# --- 4. Task 4 이후 ---
node --test plugins/mccp/scripts/hooks/tests/hook-trace-root-anchor.test.js

# --- 5. Task 5 이후 (불변식 2건을 두 명령으로 따로 판정) ---
node --test plugins/mccp/scripts/lib/tests/plan-conflict-detector.test.js
test "$(grep -cE 'git diff --name-only origin/[^ ]+\.\.[^.]' plugins/mccp/commands/prp-implement.md)" = 0

# --- 6. Task 6 이후 ---
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# --- 7. 전 구간 회귀 (델타 축 무손상 + 계약 lint) ---
node --test plugins/mccp/scripts/lib/tests/santa-scope-delta.test.js \
             plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js \
             plugins/mccp/scripts/lib/tests/santa-delta-command-body.test.js \
             plugins/mccp/scripts/lib/tests/santa-lanes.test.js
node plugins/mccp/scripts/lib/env-contract/lint.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# --- 8. 전체 (baseline 대비) ---
node --test plugins/mccp/scripts/lib/tests/*.test.js 2>&1 | tee /tmp/m3-after.txt
```

선재 red(renderer `verdict-label.test.js` · `b2-coverage-gate` 2건)는 main 승계이며 이 축과
무관하다. baseline과 대조해 신규 red와 구별한다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 파서 수정이 272행을 갑자기 노출해 대시보드 수치가 튄다(이월 finding 69 → 130) | High | 그것이 **드러난 결함이지 만들어진 결함이 아니다**. 노트·report에 before/after를 명시하고, rail이 오른 것을 회귀가 아니라 정정으로 기록한다. 소비처(`plugins/mccp/scripts/lib/renderer/sections/status-grid.js:183-190`)는 배열 길이만 쓰므로 상한·절삭 로직이 없다 |
| leading pipe를 선택으로 만들자 산문 줄이 행으로 오인된다 | Medium | 같은 커밋에서 date 셀을 `^\d{4}-\d{2}-\d{2}$`로 엄격화한다. 실측으로 443행 통과·invalid 0을 확인했고, 이탈은 조용히 버려지지 않고 `invalid_count`로 센다. Task 1 test가 산문 줄 fixture로 이 축을 동결한다 |
| `compareCoverage` 확장이 M2의 21건 회귀를 깬다 | Medium | 기존 필드는 **하나도 바꾸지 않고** 추가만 한다(DD3). 기존 test 21건 green 유지가 Task 2의 통과 조건이다 |
| env 헬퍼가 다른 test의 의도된 env까지 지운다 | Medium | 명시 지정이 항상 이긴다. 적용 대상을 **실측으로 red인 파일**로 한정하고, baseline 대비 새 fail 0건을 acceptance가 `diff`로 판정한다 |
| hook 변경이 hook을 던지게 만들어 도구 호출을 막는다 | Medium | fail-open 유지 — toplevel 판정 실패 시 `event.cwd` fallback. Task 4 test의 세 번째 단언이 «어떤 경로에서도 던지지 않는다»를 직접 검사한다 |
| repo-relative 변환이 repo 밖 경로에서 상위 이동을 낸다 | Medium | `toRepoRelative`는 대상이 `repoRoot` 밖이면 **원본을 그대로 돌려준다**(접두 검사). 표면이 이상해지는 것보다 절대경로가 그대로 나오는 편이 정직하고, 그 경우는 fallback 경로에서만 생긴다 |
| 세 점 diff 전환이 다른 호출부와 어긋난다 | Low | `prp-implement.md`의 plan-conflict 호출 한 자리만 고친다. `git diff --name-only HEAD` 2곳은 working-tree 축이라 별개다 |
| 머지가 origin/main의 신규 파일을 조용히 삭제한다(§3.5.1 선례) | Medium | Task 6이 `--diff-filter=D` 검증을 머지 직후 **의무**로 둔다. 의도하지 않은 삭제가 1건이라도 있으면 멈추고 조사한다 |
| version을 미리 확정해 두고 머지·PR 사이에 다시 밀린다(§3.7 실측 4회) | High | DD8대로 두 시점(머지 해소 · `/mccp:pr` 진입 직전)에 재계산하고, 재상향마다 4면 동기 + `i18n-surface.test.js`를 다시 돌린다 |
| M3 완료가 PRD를 archivable로 만들어 Layer 2 Open Question이 활성 표면에서 사라진다 | Medium | DD10 — 아카이브는 별도 human-gate. PRD와 report 양쪽에 «Layer 2가 닫히기 전까지 아카이브 보류»를 남긴다 |
| 8개 task가 서로 다른 서브시스템이라 한 번에 회귀를 놓친다 | Medium | Validation을 task별 단계로 나누고 baseline 대조를 acceptance가 `diff`로 판정한다. 되돌리기는 DD12 — task별 커밋이라 개별 revert가 가능하고 되돌릴 수 없는 변경이 0건이다 |

## Acceptance

각 항목 뒤 괄호가 **판정 명령**이다(DD11). 명령이 exit 0으로 끝나는 것이 충족이며, 사람 눈으로만
확인하는 항목은 두지 않는다.

- [ ] All tasks complete — 8개 task 각각의 커밋이 존재한다
      (`git log --oneline origin/main...HEAD`)
- [ ] 머지가 origin/main의 파일을 조용히 삭제하지 않았다 — §3.5.1 검증이 **산문 의무가 아니라
      판정 명령**이다 (Task 6):
      `git diff --diff-filter=D --name-only origin/main...HEAD` 의 출력이 비어 있거나, 비어
      있지 않다면 그 전건이 `.claude/notes/santa-delta-review-m3.md` 의 «의도한 삭제» 목록과
      정확히 일치한다
- [ ] Validation passes — `## Validation`의 0~8 블록이 전부 exit 0
- [ ] Patterns mirrored, not reinvented — `## Patterns to Mirror`의 9개 출처가 실재한다
      (`node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/santa-delta-review-m3.plan.md`
      — C6 인용 해소 검사가 exit 0)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — 단위 test 통과만으로 완료를 주장하지
      않는다. 네 축 각각이 **명령으로 판정된다**:
      (a) `santa-loop-cap.test.js`가 `MCCP_REVIEW_SINGLE_PASS` 유무 **두 조합 모두** fail 0 (Task 3)
      (b) **저장소 데이터에 대해** `scanBacklog`가 `invalid_count === 0`이고 `count`가 데이터
          파일의 date 행 수와 같다 (Task 1). DD2와 모순이 아니다 — DD2가 없애는 것은 «항상 0을
          돌려주는 리터럴»이고, 여기서 0인 이유는 **이 저장소의 443행이 실제로 전부 적법**하기
          때문이다. 「리터럴이 아니라 실제 계수」임은 불량 행을 심은 **fixture**가 `> 0`을
          단언해 증명한다(Task 1 Validate). 두 명령이 각각 다른 명제를 판정한다:
          ```bash
          node -e 'const{scanBacklog}=require("./plugins/mccp/scripts/derive/sources/backlog.js");
          const r=scanBacklog(process.cwd());
          const n=require("fs").readFileSync(".claude/plans/codex-findings-backlog.md","utf8")
            .split(/\r?\n/).filter(function(l){return /^\|?\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l);}).length;
          if(r.invalid_count!==0) throw new Error("invalid_count="+r.invalid_count);
          if(r.count!==n) throw new Error("count "+r.count+" != date rows "+n);
          console.log("ok count="+r.count);'
          ```
      (c) `hook-trace-root-anchor.test.js`의 세 단언 통과 (Task 4) — 하위 디렉토리 cwd에서도
          저장소 루트 한 곳 · **git 안에서 해석된 경우** 표면 절대경로 0건 · 비-git fallback에서는
          원본을 그대로 내고 던지지 않음. 절대경로 0건은 **git 해석 성공 경로에 한정된 주장**이며,
          fallback 경로의 절대경로는 결함이 아니라 DD6-3이 명시한 정직한 잔여다
      (d) `plan-conflict-detector.test.js` 통과(불변식 1) **그리고** `grep -cE` 두 점 diff
          카운트가 0(불변식 2, 독립 명령) + 노트에 잔여 unplanned 목록이 열거됨 (Task 5)
- [ ] backlog의 사이클 행 **전건**이 `ABSORBED` 또는 증거 있는 이연 중 정확히 하나를 갖고
      노트 대장 앵커와 개수가 일치한다 (UI2·UI8 — Task 7 Validate의 `node -e` 검사가 판정)
- [ ] fix-task 방출이 **finding → backlog 행 → M3 task** 대응표로 노트에 남았고, 파일은
      손으로 편집되지 않았다 (UI3·DD9 — Task 8 Validate의 `grep` + `git diff --name-only`에
      `fix-task` 파일이 없음)
- [ ] 전 스위트 red 총량이 baseline을 **넘지 않는다** — 애매한 서술 대신 집합 비교다:
      `diff <(grep '^✖' /tmp/m3-baseline.txt | sort -u) <(grep '^✖' /tmp/m3-after.txt | sort -u)`
      의 `>` 줄(= baseline에 없던 새 fail)이 **0건**
- [ ] `MCCP_SANTA_DELTA_SCOPE`의 default가 `off` 그대로이고 델타 스코프 로직이 무변경이다
      (UI10·UI11 — `git diff origin/main...HEAD -- plugins/mccp/scripts/lib/santa/scope-delta.js
      plugins/mccp/scripts/lib/santa/scope-always.js plugins/mccp/scripts/lib/santa/lanes.js`
      가 빈 출력)
- [ ] PRD의 Layer 2 Open Question이 **열린 채**이고, report가 «M3는 탐지율을 검증하지 않았다»를
      명시한다 (UI12·DD10 — Task 8 Validate의 두 `grep`)

## Design Critique

- 트리거: 발화(`impeccable-detect.js` `design_signal=true`, `reason=ok`). 축은 whitelist —
  `## Files to Change`의 `plugins/mccp/scripts/lib/renderer/html.js` · `renderer/markdown.js`가
  `DESIGN_SURFACE_PATHS` 원소다.
- 라운드: 1 (R0) · cap: 2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default)
- 판정: `CONVERGED` (`decideCritique({findings: [], round: 0, cap: 2})`)
- 근거: 이 plan이 두 renderer 파일에 계획하는 변경은 **version 리터럴 한 자리**다(Task 6,
  §3.7 4면 동기). 렌더 표면의 구조·색·마커·항목 수를 바꾸지 않으므로 4개 Output Constraint
  (정보 위계 3단계 · 강조색 화면당 1개 · raw markdown marker 금지 · 한 화면 항목 수 상한)
  어디에도 HIGH/CRITICAL 소지가 없다. plan 본문 자체도 heading depth 3을 넘지 않는다(H15).
- **`Skill(impeccable, "critique …")`는 호출하지 않았다.** impeccable은 스스로 «Not for
  backend-only or non-UI tasks»를 범위로 선언하고, 이 사이클의 in-scope 디자인 표면에는
  인터페이스가 없다. 즉 트리거는 whitelist 경로 일치에서 왔지 렌더 표면 변경에서 오지 않았다.
  이 문단이 그 판단을 드러내 두는 자리이며, 판정에 이견이 있으면 이 문단이 반증 지점이다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤
impeccable 명령도 **호출하지 않고** 아래를 구현자용 체크리스트로만 기록한다.

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

## Multi-Perspective Fan-out

건너뜀 — Phase 2.5는 fail-open이고, 이 세션의 운영 지시가 명시 요청 없는 Workflow 발화를
제한한다. 접지 원천은 위의 `## Patterns to Mirror`(인라인 Pattern Grounding)이며, 그 위에
이 사이클이 **직접 실측한 수치**(파서 171/443 · rail 69/130 · santa-loop-cap 25·57 / 53·0 ·
전 스위트 51 fail 대 1 fail · plan-conflict 68/37/23 · 두 점 68 대 세 점 37)가 얹혀 있다.
plan은 차단되지 않았다.

## Review History

운영자 지시로 라운드 캡을 올려 수렴까지 반복한다(UI6). 라운드별 흡수·기각 기록:

| Round | 패널 판정 | 흡수한 것 | 기각한 것 (증거) |
|---|---|---|---|
| R0 | 4/4 fail · blocking 7 | architect MEDIUM(공유 판정 위치 미명시) → DD6-1 + `hook-trace.js`의 `resolveRepoRoot`를 `Files to Change`에 추가. security HIGH의 **잔여**(표면 절대경로) → DD6-3 + Task 4 단언 2. test MEDIUM 3건 → Validation 단계 분리 · DD5 «env 무관» 요건 · acceptance 판정 명령화. test LOW 2건 → Task 7 기계 검사 · DD7 «동결하는 것은 숫자가 아니라 불변식». invariant MEDIUM → acceptance의 집합 `diff` 비교. invariant LOW → DD12 롤백 | security HIGH의 **방향**: «Task 4가 절대경로 leak을 재도입» — `post-tool-use-failure.js:38-39`가 이미 `event.cwd`(절대경로)를 쓰므로 선재 결함이지 재도입이 아니다(본 세션 실측). invariant HIGH 2건: «acceptance가 plan 시점에 검증 불가» — 게이트 분업의 정의이며 DD11이 경계를 명시한다 |

| R1 | 3/4 pass · test만 fail(blocking 2) | test HIGH·MEDIUM(불변식 2가 test 하나에 묶여 누락돼도 안 잡힌다) → Task 5 Validate를 **두 명령으로 분리**하고 acceptance (d)에 독립 `grep`을 명시 + 명령 본문 정적 단언 선례를 `Patterns to Mirror`에 등재. test MEDIUM(`invalid_count`가 리터럴 0으로 남아도 통과) → Task 1 Validate에 «불량 행 fixture가 `invalid_count > 0`을 단언» 요건 추가. test MEDIUM(`toRepoRelative` 경로 탈출) → Task 4에 접두 일치·`..` 미생성 규약 명시 | test의 «명령 본문을 읽는 test는 비표준»: 이 저장소는 `santa-delta-command-body.test.js:19-20` 등 **세 파일**에서 같은 패턴을 쓴다. 다만 지적의 실질(단일 명령에 두 불변식이 묶임)은 위에서 흡수했다. test LOW(Task 3 falsifiability): 지적 스스로 «falsifiability는 명확하다»고 적었으므로 조치 없음 |
| R2 | architect pass · security·invariant·test fail | security MEDIUM 2건(«acceptance의 «절대경로 0건»이 fallback 구현과 모순») → **실재**. DD6-3에 주장의 범위를 명시하고 acceptance (c)를 «git 해석 성공 경로에 한정»으로 좁혀 test 단언 2/3을 분리. invariant MEDIUM(§3.5.1 삭제 검증이 산문 의무일 뿐) → **실재**. acceptance에 `--diff-filter=D` 판정 명령을 독립 항목으로 승격. test MEDIUM(`childEnv` 통합 미상세) → `spawnCli()`·`cli()` 두 자리와 «명시 지정이 이긴다» 규약 명시. test MEDIUM(`invalid 0` 대 `invalid_count > 0` 모순으로 읽힘) → 두 명제가 다름을 acceptance (b)에서 분리 판정 | test HIGH(«CREATE test 파일이 아직 없어 Task 1을 검증할 수 없다») **기각 — 범주 오류**: CREATE 대상 test는 정의상 그 task 이후에 존재하고, plan은 이미 «Task 1이 만드는 파일이므로 Task 1 완료 후에 존재한다»를 본문에 적었으며 Validation 블록이 단계 순서로 나뉘어 있다. 수용하면 test를 신설하는 모든 plan이 같은 결함을 갖는다. 같은 리뷰어의 R2 finding 3은 이 plan에 없는 일본어 문장(«リテラル0を続ける»)을 근거로 인용해 **출처 자체가 허구**다 — 리뷰어 열화의 증거로 기록한다. §3.16 전이 관측: R1에서 pass였던 security가 **R1 흡수로 추가된 텍스트**를 R2의 표적으로 삼았다 |
## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
