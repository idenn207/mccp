# Implementation Report: session-process-reclaim M3 — 출하 + 잔여 정리

**Plan**: `.claude/plans/session-process-reclaim-followup.plan.md`
**Branch**: `session-process-reclaim`
**Version**: `1.27.0` (§3.7 forward-only, main `1.26.2` 기준)

## Summary

M1+M2가 남긴 잔여를 닫고 출하 준비를 완료했다. 실질은 셋이다.

1. **base 동기화** — merge-base(`1c5220a`) 이후 main이 149 커밋 전진해 있었다. 머지 도중 main이 또
   두 번 발행해(`1.26.0` → `1.26.1` → `1.26.2`) base를 **두 번** 맞췄다. 두 머지 모두 사전 인벤토리
   대조로 파일 소실 0을 기계 확인했다(§3.5.1 PR #110 선례).
2. **PRD 1차 지표의 첫 관측** — `[primary] 회수율`은 M1+M2 종료 시점까지 한 번도 관측된 적이 없었다.
   실물 자식을 띄우고 실제 `reclaimSession`을 부른 뒤 `isPidAlive(pid) === false`를 bounded poll로
   확인하는 스모크를 신설해 **표본 1건**을 관측했다.
3. **잔여 정리** — 문서 3건(라벨화·주장 범위·§3.7 선례)과 test 하네스 1건(포트 추측 제거), 그리고
   backlog에 해소 3건 + 신규 이연 10건 등재.

**출하(Task 11)는 완료되지 않았다.** `/mccp:pr` 체인이 `security_skipped=true`로 막혀 있으며 이는
설계대로의 fail-closed다 — 아래 *미완료* 참조.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 다만 base 재동기화가 1회 추가 발생 |
| Tasks | 12 | 11 완료 · 1 차단(Task 11) |
| Files Changed | 14 (CREATE 1) | 11 (CREATE 2) — `CLAUDE.md`는 main이 선행 해소, notes 1건 추가 |
| 버전 target | `1.27.0` (main `1.26.0` 기준) | `1.27.0` (main이 `1.26.2`까지 전진했으나 동일 착지) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | base 동기화 + 머지 사고 검증 | 완료 | 충돌 8건 → 재동기화 시 5건. 전부 파일 단위 해소. 소실 0 · 삭제 0 |
| 2 | 버전 forward-only 상향 | 완료 | `1.27.0`. 4면 동기 + `i18n-surface` 10/10 |
| 3 | STATE.md 정정 | 완료 | santa-loop 완주·운영자 종료 반영, 버전 서술 정정 |
| 4 | 소실 아티팩트 서술 정정 | 완료 | 3파일. 참조:주석 같은 줄 짝 0 unpaired, 내용 단정 `대조 불가`로 완화 |
| 5 | 케이스 7 라벨화 (B6) | 완료 | `identity 1`~`identity 7` 전부 라벨. 코드 변경 0 |
| 6 | 포트 추측 제거 (B5) | 완료 | 4줄 → `freePort()`. 34/34 pass |
| 7 | owner-only 주장 범위 (B4) | 완료 | 주석만. 동작 무변경, 35 pass / 1 skip |
| 8 | PRD M3 행 | 완료(검증) | Phase 4 WRITE에서 이미 적용됨을 grep + `scan.js`로 확인 |
| 9 | backlog 등재 | 완료 | 해소 3 + 신규 이연 10. `escalate_pending` 해제는 no-op(아래) |
| 10 | `CLAUDE.md` §3.7 정정 | 완료(선행 해소) | main이 `v1.23.12`에서 이미 4면으로 고침. 선례 1건 추가로 갈음 |
| 11 | 출하 실행 | **미완료 — 차단** | 아래 *미완료* 참조 |
| 12 | 회수율 1차 실측 | 완료 | 표본 1건 관측, 독립 확인까지 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| V1 reclaim 5 suite | 통과 | 150 tests / 149 pass / 0 fail / 1 skip — plan이 적은 기준선과 정확히 일치 |
| V2 SessionEnd 결선 | 통과 | 10/10 |
| V3 버전 표면 | 통과 | `i18n-surface` 10/10 (manifest 파생 단언) |
| V4 머지 사고 검증 | 통과 | 두 머지 모두 dropped 0 · deleted 0 |
| V5 CHANGELOG | 통과 | `[1.27.0]`·`[1.26.2]` 각 1건, 양측 본문 생존 |
| V6 전체 suite 기준선 대조 | **미통과 — 신규 실패 1건** | 아래 별도 절 |
| V7 이연 실재·개방 | 통과 | 10 키워드 전건 실재 + 미해소, 개수 10 |
| V8 환경 정책 기록 | 기록 | `MCCP_CODEX_DISABLED=1` |
| V9 회수율 실측 | 통과 | 관측 줄 + 스크립트 밖 독립 pid 확인 |
| V10 Task별 단언 | 통과 | 18항목 전건 |

### Security Review — 이 코드가 받은 첫 심사

`Task(security-reviewer)`, 2026-08-17. 세션 agent 정책상 기본은 미호출이라 최초 receipt는
`security_skipped=true`를 정직하게 봉인했고 그것이 `/mccp:pr`를 막고 있었다. **사용자가 명시 허가한
뒤 실행**해 게이트를 우회가 아니라 **해소**로 닫았다. M1+M2가 출하된 적이 없어 어떤 security 리뷰도
받은 적이 없으므로 범위를 M3 델타가 아니라 `origin/main...HEAD` 전체로 잡았다.

판정: **CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1.**

LOW 1건은 `writePrivate`(`:230-234`)에서 `writeFileSync` 성공 후 `renameSync`가 실패하면 tmp가 남는
것이다. **리뷰어 결론을 그대로 받지 않고 코드로 확인했다**: 레지스트리를 읽는 세 지점 전부
(`list :501` · `collectSiblingReuse :615` · `scanForeignOrphans :1396`)가 `name.endsWith('.json')`으로
필터하는데 tmp 접미사는 `.tmp`다 — 누출된 tmp는 어떤 회수 판정에도 **구조적으로 도달할 수 없다**.
REJECT_YAGNI로 처리했고 backlog에 올리지 않았다(Task 9가 못박은 "정확히 10건" 계수를 깨뜨리지 않기
위해서이기도 하다).

**이 심사는 "주장하지 않는 것" 목록을 줄이지 않는다.** 기존 명시 잔여(§D11 ms TOCTOU · §D15 유계 오살
창 · `isNodeInterpreterImage` basename 축)를 리뷰어도 "acknowledged residual"로 확인했을 뿐 등급을
올리지 않았고, backlog가 이미 소유한 하드닝 4건도 별도 취약점으로 올라오지 않았다.

### Design Grounding

**N/A (no design trigger).** `impeccable-detect`가 `design_signal=false`(reason `no-signal`)를 냈고
Phase 2.5.5c capture가 발화하지 않았으므로 Phase 3.6·3.7은 no-op이다. 이 사이클의 렌더 표면 델타는
`html.js:1419`·`markdown.js:163`의 **버전 리터럴 2줄**뿐이라 detector 판정과 실제가 일치한다.

## Validation 6 — 공허했고, 고치자 red 2건이 나왔다

plan의 검증 블록은 `grep -E '^not ok '`로 실패를 센다. node 24의 기본 reporter는 `spec`이라 그 패턴이
**한 번도 매치되지 않으므로**, 기준선과 사후가 둘 다 빈 파일이 되고 차집합이 항상 0줄이다. 첫 실행이
정확히 그렇게 나왔다 — `after 0 / baseline 0 / delta 0`. `--test-reporter=tap`으로 재실행하자 실제 상태는
다음이었다.

| 측정 | 결과 |
|---|---|
| 기준선 (`origin/main` 임시 worktree) | **0 failing** — 직전 사이클의 선재 red 4건은 main에서 이미 해소됨 |
| 브랜치 1차 | **2 failing** |
| 브랜치 2차 (drift lint 수정 후) | **1 failing** |

### 해소 — gitignore drift lint (실결함)

`gitignore-provision.test.js:1276`이 `.claude/state/session-processes/`를 **미분류**로 잡았다. M1+M2가 이
저장소 `.gitignore`에만 넣고 provisioner 목록에는 넣지 않았는데, main의 setup-gitignore drift lint와
이번 머지에서 처음 만난 것이다. `MCCP_IGNORE_BLOCK`(canonical)에 등재해 닫았다(86/86).

`REPO_ONLY`가 아닌 이유는 `.claude/state/santa-loop/`가 canonical인 근거(`gitignore-provision.js:99-101`)와
같다 — 플러그인이 설치된 어느 저장소에서나 이 디렉토리가 자라므로 REPO_ONLY로 두면 대상 저장소가 첫
사용에 커밋한다. 그리고 이 레코드는 **살아 있는 PID + 절대 `exec_path`**를 담아, 커밋되면 모든 clone에
stale PID가 배포되고 SessionEnd 회수 경로가 그것을 kill 후보로 평가한다 — 노이즈가 아니라 오살 벡터다.

### 미해소 — `9d probeProcess`, 그리고 그것이 드러낸 처리량 한계

`9d — probeProcess against a REAL process`가 전체 suite에서 **2회 재현**으로 붉다(`probeProcess timed out
after 5018ms (cap 5000ms)`). 단독 실행은 외부 부하가 있어도 통과한다. 그 test는 cap 초과를 환경 skip이
아니라 **defect로 판정하도록 설계**돼 있고, 아래 실측이 그 설계 판단이 옳았음을 보인다 — flake가 아니라
**얇은 여유의 표면화**다.

probe는 `powershell.exe`로 `Get-CimInstance Win32_Process`를 **레코드마다 동기 spawn**한다.

| 측정 | 값 |
|---|---|
| 유휴 머신 probe 지연 (5회) | 3179 · 3185 · 3369 · 3410 · 3663 ms |
| cap (`PROBE_TIMEOUT_WIN32_MS`) | 5000 ms |
| 여유 | 1.3~1.8배 |

`guardedProbe`(`:1193`)는 `elapsed > budgetMs - probeTimeoutMs`면 probe를 거부한다. 기본값에서 그 창은
**6000 − 5000 = 1000ms**뿐이고, probe 하나가 3.4s이므로 **두 번째 레코드부터는 굶는다.** 실물로 확인했다
(유휴 머신, 자식 3개 등록, 기본 허용치):

| 예산 | 회수 | 누수 |
|---|---|---|
| 기본 `6000` | 1 | 2 (`budget_exceeded`, 실제로 살아남음) |
| `MCCP_RECLAIM_BUDGET_MS=9000` (문서화된 상한) | 2 | 1 |

**상한까지 올려도 win32 천장은 세션당 2개다.** `MAX_BUDGET_MS=9000`은 SessionEnd hook의 10s timeout
때문에 존재하므로 그냥 올릴 수 없다.

정확히 무엇을 주장하고 무엇을 주장하지 않는지 적는다:

- **오살 위험이 아니다.** probe 실패는 `identity_unverifiable` → kill 안 함이다. 손실은 회수 누락이다.
- **조용하지도 않다.** `budgetExceeded=true` + `unreclaimed[]`가 실리고 M2 결선이 그것을 stderr로
  표면화한다. 다만 같은 반환에 `complete:true`가 함께 실린다.
- **PRD Hypothesis가 win32에서 부분적으로만 성립한다.** PRD가 겨냥한 대상은 dashboard 서버 ·
  plan-codex-runner · handoff 세션으로 동시에 2개 이상이 흔하다.
- **지금까지 안 잡힌 이유가 구조적이다.** 모든 reclaim test가 probe를 mock 주입해(즉시 반환) 이 축을
  건드리지 않았고, Task 12 스모크는 레코드를 1개만 썼다. M3가 실제 경로를 처음 재고 나서야 보였다 —
  그리고 그 관측은 공허한 Validation 6이었다면 통과로 보고됐을 것이다.
- **해소 방향은 설계 변경이라 M3 범위 밖이다.** 후보: 한 번의 PowerShell 호출로 전체 pid를 조회해
  N probe를 1로 접는 것, 또는 값싼 소유권 축(host·repo·session)을 먼저 통과한 레코드에만 probe하는 것.

## PRD 1차 지표 — 회수율 첫 관측

```
RECLAIM_OBSERVATION {"attempted":1,"succeeded":1,"pid":447672,"pid_alive_after":false,
                     "skipped":[],"complete":true,"unreclaimed":[],"unverified":[],
                     "budget_exceeded":false,"platform":"win32",
                     "identity_tolerance_ms":10000,"sample_size":1}
```

**표본 1건이다.** 1/1을 "회수율 100%"로 옮겨 적지 않는다 — 이 값이 말하는 것은 "회수 경로가 실물
프로세스에 대해 최소 한 번은 끝까지 작동했다"이지 비율이 아니다. 상세와 하네스 조정 2건(파일 기동 ·
허용치 상향)이 해석 범위를 어떻게 좁히는지는 `session-process-reclaim-report.md`의 해당 절이 소유한다.

> **위 V6 절을 읽고 나면 이 1/1의 의미가 좁아진다.** 성공한 이유의 일부는 레코드가 **1개**였기
> 때문이다 — 같은 경로에 2개를 걸면 win32 기본값에서 1개만 회수된다(실측). 이 관측은 "회수 경로가
> 작동한다"를 보이지만 "세션이 띄운 자식 **전부**가 회수된다"는 PRD Hypothesis를 보이지 않는다.
> 지표를 처음 재자마자 분모가 1일 때만 참인 값이었다는 것이 드러난 셈이고, 그것이 이 사이클에서
> 측정이 준 가장 큰 소득이다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version → `1.27.0` |
| `CHANGELOG.md` | UPDATED | 헤딩 `[1.26.0]` → `[1.27.0]` + bump 서술 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | `:1419` footer |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | `:163` derived 줄 |
| `.gitignore` | UPDATED | `session-processes/` 항목 + journal 주석 병합 |
| `.claude/state/STATE.md` | UPDATED | Task 3·4·9 |
| `.claude/PRPs/reports/session-process-reclaim-report.md` | UPDATED | Task 4·12 |
| `.claude/state/fix-task-applied.md` | UPDATED | Task 4 |
| `.claude/plans/session-process-reclaim.plan.md` | UPDATED | Task 5 |
| `plugins/mccp/scripts/lib/tests/dashboard-server.test.js` | UPDATED | Task 6 (4줄) |
| `plugins/mccp/scripts/lib/session-processes.js` | UPDATED | Task 7 (주석만) |
| `plugins/mccp/scripts/lib/gitignore-provision.js` | UPDATED | **plan 밖** — V6이 잡은 drift lint red 수정 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | Task 9 (13행) |
| `CLAUDE.md` | UPDATED | Task 10 (선례 1건) |
| `plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js` | CREATED | Task 12 |
| `.claude/notes/session-process-reclaim-followup-implement-gate.md` | CREATED | 게이트 기록 |

## Deviations from Plan

전부 **WHAT / WHY** 로 적는다. 조용히 흡수한 것은 없다.

1. **Phase 2.5 게이트가 Task 1~2보다 늦게 돌았다.** 두 Task가 머지 충돌 해소 형태라 "Phase 2 PREPARE의
   remote 동기화"로 취급됐다. 결과적으로 그 두 결정은 착지 후에 리뷰 대상으로 제출됐다. 되돌리는 법은
   게이트 기록 notes의 표에 결정별로 적었다.
2. **머지 전에 pending 아티팩트를 커밋했다.** main도 `STATE.md`·`fix-task-applied.md`를 바꿨으므로
   uncommitted 트리로는 `git merge`가 거부한다(실측). plan은 이 선행 조건을 다루지 않았다.
3. **게이트 기록을 plan 본문이 아니라 `.claude/notes/`에 썼다.** plan 본문을 편집하면 방금 쓴
   `mccp-plan-codex` receipt의 `plan_hash`가 stale이 되어 체인이 스스로 깨진다. main의
   gate-guard-integrity M3가 같은 이유로 쓴 회피를 따랐다.
4. **Task 3의 `escalate_pending=true` 단언이 성립 불가였다.** `dfd18f4`는 그 필드를 갖고 있었으나
   **이전 세션의 STATE.md write**(2026-08-16T21:51:10Z, `d034ba2`로 커밋)가 R3 backlog 행이 생기기
   **전에** 지웠다. plan Task 9가 막으려던 손실이 이 plan 범위 밖에서 이미 일어난 것이다.
   플래그를 복원했다 다시 지우는 가짜 순서는 만들지 않았고, 실질(R3가 backlog에 열린 채로 실재)은
   충족했다. `plan-conflict-detector` 판정 `conflict:false`(minor deviation).
5. **Task 9의 `event: 'escalation_deferred_to_backlog'`를 생략했다.** 그 값은 `state-writer`의
   `VALID_EVENTS`에 없어 unknown-event 강등이 `last_event`를 `precompact`로 덮어쓴다 — 기록을 남기려던
   인자가 기록을 지우는 형태다.
6. **Validation 7의 "정확히 10건" 계수를 보정했다.** backlog에 main이 낸 **2026-08-17자 행이 이미 7건**
   있어(재동기화 후) 날짜 기반 계수가 12를 낸다. plan은 배치 날짜가 이 배치에만 속한다고 가정했다.
   `origin/main`의 같은 날짜 행 수를 빼는 형태로 같은 보증을 유지했다.
7. **Validation 7의 `grep -c 'RESOLVED'`를 `grep -cE '\bRESOLVED'`로 고쳤다.** 부분문자열 검사가
   **오류 코드** `C6_UNRESOLVED_CITATION` 안의 `RESOLVED`에 걸려, 멀쩡히 열려 있는 이연을 "닫힘"으로
   오판했다. 단어 경계 형태는 상태 마커(`RESOLVED-BY-IMPL`·`**RESOLVED (`)를 여전히 전부 잡으므로
   약화가 아니다.
8. **Validation 6 기준선을 stash가 아니라 임시 worktree에서 떴다.** 변경이 이미 커밋됐으므로 stash가
   비고, plan 자신이 그 경우 "기준선은 머지 커밋에서 떠야 한다"고 적었다. 직전 사이클 선례와 동형.
9. **Task 12의 자식을 `node -e`가 아니라 파일로 띄웠다.** `-e`는 `__filename`이 `[eval]`이라 명령줄에
   스크립트 경로가 없고 §D15 축 1이 인위적으로 어긋난다 — 회수 실패가 구현 결함이 아니라 하네스
   결함이 되는 형태이며, 보고서 santa-loop R3 절이 기록한 실측 함정이 정확히 이것이다. 함께
   `MCCP_RECLAIM_IDENTITY_TOLERANCE_MS`를 상향했고, 그래서 **이 관측은 기본 허용치에서의 정체 판정
   정확도를 말하지 않는다**.
10. **Task 10이 no-op이었다.** main이 `v1.23.12`에서 "동기 대상 5면"을 이미 4면으로 고쳤다. 대신 이
    사이클을 §3.7의 4번째 선례로 추가해 §3.7과 CHANGELOG의 재발 서술을 일치시켰다.
11. **base를 두 번 맞췄다.** 첫 머지(main `1.26.1`) 뒤 세션 중 누군가 `git pull`을 돌려 main이
    `1.26.2`로 전진했다(reflog 확인). 우리 `1.27.0`이 여전히 앞서므로 target은 움직이지 않았다.
12. **plan을 아카이브하지 않았다.** 명령 본문 Phase 5의 "`completed/`로 `mv`" 지시는 main의
    gate-guard-integrity M3 C2 수정이 "제자리에 둔다 — 아카이브는 `/mccp:archive-complete` 소관"으로
    대체했다. plan의 Out of Scope와 §3.11 C2도 같은 결론이다.
13. **Validation 6이 공허했다 — plan의 결함.** 검증 블록이 `grep -E '^not ok '`로 실패를 세는데
    node 24의 기본 reporter는 `spec`(`✔` / `ℹ fail N`)이라 그 패턴이 **한 번도 매치되지 않는다**.
    기준선과 사후가 둘 다 빈 파일이 되고 차집합이 0줄 → "신규 실패 없음"이 구현과 무관하게 항상
    참이 된다. 이 plan이 R9~R14에서 반복해 고친 vacuous 단언과 정확히 같은 계열이며, 실측으로
    확인했다(첫 실행이 `0 failing / 0 failing / delta 0`을 냈고 red 2건을 가리고 있었다).
    `--test-reporter=tap`을 붙여 재실행했다. **backlog 행으로 올리지 않았다** — 대상이 코드가 아니라
    이 plan의 검증 블록이고, Task 9가 못박은 "정확히 10건" 계수를 깨뜨리기 때문이다.
14. **`gitignore-provision.js`는 plan의 `Files to Change`에 없다.** V6이 잡은 drift lint red를 닫는
    데 필요했다(아래 별도 절). implement-time 파일 확장이므로 `plan-conflict-detector`에 넘겼고
    판정은 `conflict:false`(minor deviation)였다.
15. **security-reviewer를 사용자 허가 후 호출했다.** 세션 정책이 "Agent tool은 사용자가 요청할
    때만"이라 최초 게이트는 `security_skipped=true`로 fail-closed 차단됐다. 우회(`security_force_override`)
    대신 사용자에게 허가를 물어 **실제 심사로 해소**했다.

## Issues Encountered

- **`MSYS_NO_PATHCONV`** — Git Bash에서 `git show origin/main:.claude/…`가 MSYS 경로 변환에 걸려
  `origin\main;.claude\…`로 망가진다. `MSYS_NO_PATHCONV=1`로 우회했다.
- **전체 suite가 10분 상한을 넘는다**(306 test 파일). 백그라운드 순차 실행으로 처리했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/manual/session-process-reclaim-smoke.js` | 1 (수동) | 실물 프로세스 end-to-end 회수 — `tests/manual/` 하위라 CI 상시 suite 미편입 |

기존 test는 **추가하지 않았다.** Task 6은 하네스의 포트 확보 방식만 바꿨고 Task 7은 주석만 바꿨다 —
둘 다 제품 경로 밖이라 새 단언이 필요 없고, 대신 기준선 유지를 V1·V6이 판정한다.

## 미완료 — Task 11 출하

게이트는 열려 있다. 최초에는 `security_skipped=true`가 `/mccp:pr`를 막았고(설계대로의 fail-closed),
사용자 허가를 받아 security-reviewer를 **실제로 돌려** 해소했다 — 우회가 아니다. 현재
`validate --command mccp:pr` 는 `ok:true` · `blocking:[]`이다.

**출하를 멈춘 것은 게이트가 아니라 측정 결과다.** V6이 드러낸 win32 회수 처리량 한계(세션당 1~2개)는
PRD Hypothesis에 직접 걸리는 제품 판단이므로, 그 방침 없이 ship하지 않는다. 그리고 plan Acceptance의
"전체 suite 신규 실패 0"은 `9d`가 열려 있는 한 **미충족**이다.

이 사이클의 게이트 상태를 있는 그대로 적는다:

| 게이트 | 상태 | 근거 |
|---|---|---|
| plan-codex | `intent_gate_verdict=incomplete` + `force_override=true` | L2 패널 R1~R14 전 라운드 divergent, 승인 미획득. `MCCP_SKIP_INTENT_GATE` audited override로 진입 |
| implement-codex | `codex_verdict=skipped` | `MCCP_CODEX_DISABLED=1` env 정책(v0.3.5 first-class skip) |
| security-reviewer | **수행 · CRITICAL/HIGH/MEDIUM 0** | 사용자 허가 후 실행. 이 코드의 첫 security 심사 |
| impeccable | `silent_skip` | detector `design_signal=false` |

**cross-model 심사(Codex 축)는 여전히 0회다.** security 심사는 같은 모델 계열이므로 그것을 대신하지
않는다. override도 그것을 바꾸지 않는다 — verdict를 세탁하지 않고 봉인하므로 cross-gate dedupe는
fail-closed로 남고 PR-Codex는 반드시 발화한다. 감사 대조가 가능한 유일한 cross-model 기록은 아직
만들어지지 않은 ship receipt이며, Task 4가 남긴 `ANCHOR-PENDING(Task 11)` 자리표시자가 그 자리를
표시하고 있다.

## Next Steps

- [ ] **win32 probe 처리량 방침** — 출하 전 사용자 판단이 필요한 유일한 축.
  1. 설계 수정 후 출하 — 한 번의 PowerShell 호출로 전체 pid 조회(N probe → 1), 또는 값싼 소유권 축을
     먼저 통과한 레코드에만 probe. `9d`도 함께 녹색이 될 가능성이 높다
  2. 한계를 문서화하고 이연 후 출하 — 방향이 fail-closed이므로 안전 축은 아니다. 다만 PRD Hypothesis가
     win32에서 부분적으로만 성립함을 CHANGELOG·ENVIRONMENT·backlog에 명시해야 하고, plan Acceptance의
     "신규 실패 0"은 미충족으로 기록된다
  3. 출하 보류
- [ ] Task 11 완주 후 `ANCHOR-PENDING(Task 11)` 자리표시자를 실제 ship receipt 경로로 치환(Action 2)
- [ ] 머지 후 main에서 reclaim 5 suite 1회 재실행(Acceptance — 파일 존재는 동작 확인이 아니다)
- [ ] ship 후 `/mccp:archive-complete` — M3까지 complete가 된 **뒤에야** 대상(§3.11 C2)
- [ ] **Validation 6 단언 형태를 다음 사이클이 고칠 것** — `--test-reporter=tap` 없이는 영구 공허하다.
      이 plan 템플릿이 복제되면 같은 결함이 따라간다
