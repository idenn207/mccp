# Milestone Closure — env-contract-integrity-m2

## Milestone
- ID         : env-contract-integrity-m2
- Name       : 어긋난 값 수리 + 값 의미·멤버 어휘 문서화
- Plan       : .claude/plans/env-contract-integrity-m2.plan.md
- Status     : done   (acceptance 10항목 중 1건 부분 충족 — 아래 참조)
- Closed at  : 2026-08-25T11:29:01Z
- Closed by  : /mccp:milestone-close (run_id=74180f48-84ed-43c3-b6e9-ae4818ae135f)

## Acceptance Condition

plan `## Acceptance` 10항목이 판정 기준이다. 축약 없이 옮기면:

1. Task 1~10 전부 완료
2. Validation 1~7 전량 통과
3. 패턴을 재발명하지 않고 mirror — 격리 배수는 `QUARANTINE` 규약, L11의 대조는 L2의 양방향 형태,
   정책표 단일 소유는 `resolveVocabulary` 관계
4. **격리표가 실제로 비었다** — `L10.quarantined.length === 0`을 명령 출력으로 확인하고, 8건 중
   하나의 수리를 되돌리면 L10이 붉어지는지 1회 확인해 배수가 살아 있음을 실증한다
5. **L11이 실제로 막는다** — 값별 결과 한 줄을 지우면 L11이 그 토글 이름과 함께 붉어지고, 선언에
   없는 값의 줄을 더해도 붉어지는지(양방향) 각각 1회 확인
6. **승격 6건이 판정을 바꾸지 않았다** — 각 소비처의 기존 test가 무수정으로 통과하고, 새로 추가된
   것은 stderr warn 경로의 단언뿐임을 diff로 확인
7. **gap 7건과 각 사유를 실측해 적는다** — 7이라고 주장하기 전에 명령으로 세고, 정정된 2건의 사유가
   소비처 `path:line`을 지목하는지 확인. 0이라고 주장하지 않는다
8. 게이트와 경로를 실제로 1회 완주하고 산출물을 확인 — `doctor`를 이 저장소에서 돌려 **경고 2건이
   0건이 되고** `explain MCCP_HOOK_PROFILE`이 `standard` 기본값과 값별 결과를 출력하는지 확인.
   단위 test 통과와 경로 작동은 다른 명제다
9. **제거된 값마다 대체 경로가 문서에 있다** — `off`·`always`·`high`·`host` 등 사라지는 값 각각에
   «이것을 원했다면 오늘 무엇을 쓰는가»가 한 줄로 남았는지 열거해 확인(DD1)
10. version 4면 동기 + PRD M2 행 갱신. §3.7 재계산을 **머지 해소 직후와 `/mccp:pr` 진입 직전
    두 번** 수행

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).

## Goal Loop Result

verdict=done — **운영자 판정**이며, `/goal` 루프는 **돌지 않았다.**

운영자가 «`.claude/prds/env-contract-integrity.prd.md` m2를 complete로 바꿔줘»로 판정을 명시해
이 명령을 호출했다. 따라서 이 문서의 `done`은 «`/goal` 평가 모델이 조건 충족을 확인했다»가 아니라
«운영자가 완료를 선언했고, 어시스턴트가 그 선언을 마감 시점에 재실측으로 대조했다»를 뜻한다.
Phase 2~3(lock enter → `/goal` 안내 → grammar 응답 대기)은 **진입하지 않았다** — 판정이 이미
인수에 담겨 있어 왕복이 같은 답을 되받는 것 외의 정보를 만들지 않기 때문이다. 그 생략을 «loop이
통과시켰다»로 기록하지 않는다.

### 마감 시점 재실측 (2026-08-25, 이 세션)

| 조항 | 명령 | 결과 |
|---|---|---|
| 2 | `env-contract/lint.js` | L1~L11 전부 `ok`, exit 0 |
| 1·5·6 | `node --test env-contract/tests/*.test.js` | 113 pass / **0 fail** (M2가 101 → 113) |
| 4 | 위 test의 `quarantine is drained — M2 repaired every entry (DD8)` | pass — 격리표 공집합 |
| 8 | `env-contract/cli.js doctor --json` | `ok:true` · error 0 · **선언값 유래 경고 0** |
| 8 | `env-contract/cli.js explain MCCP_HOOK_PROFILE` | exit 0 · `default standard` · 어휘 3값 출력 |
| 10 | 4면 대조 | `plugin.json` 1.32.3 · `html.js:1419` · `markdown.js:163` · `CHANGELOG [1.32.3]` |
| 10 | PRD 표 77행 | `in-progress` → `complete` (이 명령이 수행) |

조항 3·7·9와 Task 1~10의 완료는 구현 세션의 기록(`.claude/PRPs/reports/env-contract-integrity-m2-report.md`)과
그것을 강제하는 test(`registry.test.js`의 gap 7건 + 사유 형태, `vocabulary.test.js`의 정책표 파생 대조)에
근거한다. 마감 시점에 재실행한 것은 위 표의 명령들이며, 그 전부가 통과했다.

### 부분 충족 1건 — 숨기지 않고 적는다

**조항 8의 후반 «`explain`이 값별 결과를 출력하는지»는 충족되지 않았다.** `explain MCCP_HOOK_PROFILE`은
기본값 `standard`와 어휘(`minimal | standard | strict`)를 출력하지만, **각 값이 무엇을 켜고 끄는지의
서술은 인라인하지 않는다.** 그 서술은 상세 문서(`docs/environment/hooks.md#mccp_hook_profile`)에 있고
L11이 그 존재를 양방향으로 강제하지만, 운영자가 `explain` 한 번으로 읽지는 못한다.

원인은 범위다 — `cli.js`가 이 plan의 `Files to Change` 밖이라 손대지 않았다. 처방 후보는 L11의 블록
파서를 공유 헬퍼로 올려 `explain`이 같은 블록을 읽게 하는 것이며, PRD M2의 성공 지표(«값 의미가 문서에
없는 enum 15 → 0»)는 문서 축에서 충족되므로 이 미충족은 **표면 축의 이월**이지 데이터 축의 결함이 아니다.
이월처는 STATE.md Open Questions이며, M2 범위 기준으로 마감한다.

### doctor 경고 1건은 저장소 결함이 아니라 진단이 작동한 관측이다

조항 8은 «경고 2건이 0건»을 요구한다. 마감 실측에서 저장소가 **선언한** 값에서 나온 경고는 0이고
(`contract-drift` 0건은 `doctor.test.js`가 강제한다), `ok:true`다. 다만 출력에는 warning 1건이 남는다:

```
value-outside-vocabulary  MCCP_CONTEXT_MONITOR_COST_MODE  actual="off"
  vocabulary: directive | notify
  source: plugins/mccp/scripts/hooks/ecc-context-monitor.js#COST_MODE_VALUES
```

이 값은 **어느 settings 계층도 선언하지 않았다** — user·project·local 셋 다 아니고, 이 세션의 셸
또는 부모 프로세스가 주입한 ambient다(같은 출력의 `ambient` info 4건 중 하나로도 잡힌다). 즉 저장소
파일의 결함이 아니라, **PRD Evidence가 적은 물림 유형이 운영자의 실제 환경에서 관측된 것**이다:
어휘 밖의 값이 프로세스에 도달해 있고, 그것을 알 방법이 M2 이전에는 없었다. M2가 만들려던 진단이
바로 그 사실을 표면화했으므로 이 경고는 «미충족»이 아니라 **작동 증거**로 기록한다.

### 표준 흐름과 달랐던 두 지점

**1. `goal-phase.lock`을 획득하지 않았다.** multi-turn `/goal` 루프에 진입하지 않았으므로 격리할
구간 자체가 없다. 게다가 lock 활성 중에는 mccp의 Edit/Write가 mechanical block되는데, 이 마감의
산출물(PRD flip + 이 문서)이 바로 그 대상이라 걸었다면 자기차단이 된다. 선례 두 건
(`review-loop-bypass-m1` · `gate-guard-integrity-m3`)도 같은 이유로 lock 미획득이었다.

**2. plan body의 `## Milestone Closure Provenance` stamp를 의도적으로 생략했다.** 명령 본문
Phase 4는 plan에 stamp를 찍으라고 지시하지만, 실측 결과 그렇게 하면 **이 사이클의 PR이 막힌다**:

```
현재 plan hash      sha256:307c9ba427707a7a342e7764d55fa60da1e879f4318346d8a334270a89f48a4a
mccp-plan-codex      동일
mccp-implement-codex 동일
```

두 receipt의 `plan_hash`가 현재 plan 본문과 **정확히 일치**한다. stamp는 본문을 바꾸므로 그 순간
둘 다 stale이 되고, CLAUDE.md §3.11이 복원한 staleness 가드(`/mccp:pr` 2.5.8·2.5.9가 `--plan`을
넘긴다)가 PR을 차단한다. 즉 감사 흔적을 남기려는 행위가 감사 체인을 깨는 구성이다.

그래서 stamp 대신 **이 문서 자체가 감사 앵커**다. 이 파일은 git-tracked이고 커밋에 포함되므로
mutation은 git history로 추적된다. stamp가 제공했을 sha256 결속은 이 사이클에서 포기하고, 그 사실을
여기 적는다 — «찍었다»고 적고 안 찍는 것이 아니라, 안 찍었고 왜인지를 적는다. 명령 본문과 §3.11
가드의 이 충돌은 milestone-close의 구조적 결함이며 backlog 대상이다(선례 `review-loop-bypass-m2`가
같은 축에서 cost probe 결함을 기록한 것과 같은 성격).

## Provenance
- Lock run_id        : 74180f48-84ed-43c3-b6e9-ae4818ae135f (생성만 — lock 미획득, 위 참조)
- Lock owner session : unknown (`CLAUDE_SESSION_ID` 미설정)
- Plan source        : .claude/plans/env-contract-integrity-m2.plan.md
- Plan hash at close : sha256:307c9ba427707a7a342e7764d55fa60da1e879f4318346d8a334270a89f48a4a (미변경)
- Detection signal   : {"availability":"available","goal_signal":true,"signal_ref":{"row":2,"name":"어긋난 값 수리 + 값 의미·멤버 어휘 문서화","plan":".claude/plans/env-contract-integrity-m2.plan.md","status":"in-progress"},"mode":"milestone-close","reason":"ok"}
- mccp version       : 1.32.3
- Branch / HEAD      : env-contract-integrity / 443b906
