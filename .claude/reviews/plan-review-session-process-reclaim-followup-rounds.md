# Plan Review — session-process-reclaim-followup · 라운드 이력 (R1~R7)

> `plan-review/cli.js record`는 항상 같은 파일(`plan-review-<slug>.md`)에 쓰고 **직전 기록을
> 덮어쓴다.** R7 진입 시 l2.json을 리셋한 뒤 halt를 기록하면서 R6의 findings가 degraded stub으로
> 대체됐다(그 파일은 untracked라 git 복구 불가). 이 문서는 그 손실을 메우는 **수기 보존본**이며,
> 다음 세션이 같은 지적을 처음부터 다시 받지 않도록 남긴다.
> 관련 backlog: Task 9 신규 이연 4번(`record 슬러그 충돌`).

## 결론

**승인 미획득.** `mccp-plan-codex` receipt 미작성 → `/mccp:prp-implement` 진입 불가(정상 fail-closed).
L1은 7회 연속 `converged`. L2가 6라운드 모두 `divergent`. R7은 패널을 띄우지 못하고 정지 —
세션 에이전트 상한 소진(`cap-exhausted`, launched 24 / max 24).

## 라운드 추이

| R | plan hash | coverage | pass 관점 | blocking | halt |
|---|---|---|---|---|---|
| 1 | `876d2a5f` | 3/4 | security | 5 | 5.2e |
| 2 | `5b43818c` | 2/4 (architect·security 빈 결과) | invariant | 3 + 정족수 미달 | 5.2e |
| 3 | `16c6d8ab` | 4/4 | architect | 8 | 5.2e |
| 4 | `b11afaec` | 4/4 | architect · security | 4 | 5.2e |
| 5 | `fd04c955` | 4/4 | architect · invariant | 3 | 5.2e |
| 6 | `2148f5f4` | 4/4 | 없음 | 7 | 5.2e |
| 7 | — | 미발화 | — | — | 5.2b (`cap-exhausted`) |
| 8 | `5602a7ee` | 4/4 | security · test | 5 (architect HIGH+2M · invariant HIGH+CRITICAL) | 5.2e |
| 9 | `ad1e88b0` | 4/4 | architect · security · test | 4 (invariant CRITICAL+2H+1M) | 5.2e |
| 10 | `91560fb1` | 4/4 | architect · security · invariant | 1 (test/FAIL — HIGH/CRITICAL **0건**, MEDIUM 1이 견인) | 5.2e |
| 11 | `26fe6d39` | 4/4 | security | 4 (invariant CRITICAL 포함) — **퇴행** | 5.2e |
| 12 | `838db85f` | 3/4 (test StructuredOutput 미호출) | **architect(findings 0)** | 2 (security MEDIUM · invariant MEDIUM) — **HIGH/CRITICAL 0건** | 5.2e |
| 13 | `685fc9e9` | 4/4 (**2회 launch 조립** — 아래 참조) | **security(findings 0)** · test | 4 (architect M · invariant M+H+M+H) | 5.2e |
| 14 | `2e33d2e1` | 4/4 (미응답 0) | 없음 | 8 (architect M · security H+M+M · test H+M+M+M+L · invariant C+H+M+M) | 5.2e |

R2의 빈 결과 2건은 StructuredOutput 미호출이었고, R3부터 프롬프트에 "그 도구 호출 없이 끝나면
리뷰 폐기"를 명시해 재발하지 않았다.

## 흡수한 실결함 11건 (전부 현재 plan에 반영됨)

1. `.git/mccp/tmp` 미생성 — `git rev-parse --git-path` + `mkdir -p`. linked worktree에서 `.git`은 파일이다
2. Task 12 스모크 스크립트 경로 부재 — `tests/manual/session-process-reclaim-smoke.js`로 확정
3. Validation 4가 vacuous — 사전 캡처 파일 부재 시 `comm`이 0줄을 내어 통과. `test -s` 선행 가드를 **Validation 블록에** 배치(Task 1 산문에만 두면 Acceptance가 가리키지 않는다)
4. Task 9 guard 정규식이 무의미 — `grep -qE '…| (HIGH|MEDIUM|LOW) |…'`의 `|`가 ERE 교대라 **R3와 무관한 날짜 행 하나만 있어도 통과**(가짜 backlog로 재현). `grep -qF`로 교체
5. `Files to Change` 82행과 Task 3의 모순 — 표는 STATE.md에 "escalate_pending 해제"를 적고 Task 3은 "건드리지 않는다"고 적었다. Task별 소관을 표에 명시
6. Validation 6 stash fail-open — `git stash push … || true`가 실패를 삼켜 기준선과 사후가 같은 상태가 되고 차집합이 **항상 0**. stash 생성 여부를 rev-parse로 판정
7. Validation 4·5의 판정 부재 — `grep -c` 결과를 stdout에만 찍고 기대값은 주석에만 있었다. 전부 `|| exit 1` 단언으로
8. Task별 Validate에 실행 지점 없음 — 검증 표면이 둘인데 Acceptance가 전역 블록만 가리켜 Task 3~8·10~11의 단언이 산문으로만 존재했다. **Validation 10** 신설 + Acceptance가 양쪽을 요구
9. Task 11 버전 게이트 fail-open — `MAIN_V_NOW=$(git fetch … && git show …)`에서 fetch 실패 시 `&&` 단락으로 변수가 빈 문자열이 되고 `[ "1.27.0" = "" ]`가 거짓이라 **게이트 통과**. fetch·read·semver 형태를 3단계로 분리해 각각 abort
10. Validation 9가 자기 보고를 신뢰 — 스모크 스크립트의 출력 형식만 검사해 아무 일도 않고 기대 JSON만 찍는 구현이 통과. 관측 줄에 자식 `pid`를 싣게 하고 **검증 셸에서 독립적으로** `process.kill(pid,0)`으로 사망 확인
11. Task 4 총계 대조의 허점 — 참조와 소실 주석을 다른 줄에 둬도 총계는 맞는다. **같은 줄** 짝을 단언. 더불어 신규 이연 "정확히 10건"의 개수 판정과 대체 anchor 명시를 추가

9·10번은 제가 앞선 라운드에 넣은 수정 자체의 결함을 패널이 잡아낸 것이다.

12. **R8 — Validation 10의 `$T4_FILES` 사용-전-정의** (invariant HIGH). 487행이 그 변수를 쓰고
    489행이 정의했다. 0번의 `set -uo pipefail` 아래에서 그 확장은 서브셸을 죽여(`unbound
    variable`) `Task4/anchor 미래형 표지` 단언이 빈 문자열을 받는다 — **Task 4를 옳게 수행해도
    항상 실패**하므로 Acceptance가 성립 불가였다. 정의를 첫 사용 위로 올려 닫았다. 11번과 같은
    계열이다(내가 앞선 라운드에 넣은 수정 자체의 결함).

    동반된 CRITICAL("이후 검사가 전혀 실행되지 않아 손상된 git 이력이 main으로 샐 수 있다")은
    **실측으로 반증했다**: 부모 셸은 살아남고(`PARENT_EXIT=0`) 후속 단언은 정상 실행되며
    `V10_FAIL=1`로 Validation 10이 exit 1한다. 방향은 fail-closed라 통과하는 것이 없다.
    지적의 *메커니즘*은 옳고 *파급*은 반대 방향이었다 — 수정은 메커니즘을 근거로 했다.

13. **R8 — Task 4의 forward reference를 Task 11로 이관** (architect HIGH, 운영자 결정으로 수용).
    Task 4가 git-tracked 파일에 `mccp-pr-codex/<slug>.json`을 미래형으로 적으면 그 줄이
    **Task 11의 성공에 의존**하고, 출하가 중단되면 실재하지 않는 경로를 영구히 가리킨다.
    해소는 **순서**다 — Task 4는 경로가 아니라 자리표시자 `ANCHOR-PENDING(Task 11)`를 남기고,
    receipt가 실제로 생성된 뒤 Task 11 Action 3이 그것을 실제 경로로 치환한다. Validation 10은
    (a) 자리표시자 실재 (b) receipt 부재 시 경로 참조 0건을 단언하고, Task 11 Validate는
    (1) 자리표시자 소멸 (2) **기입된 경로가 실재하는 파일** 을 짝으로 단언한다.
    이로써 R5(anchor 명시)·R6(없는 receipt 참조 금지)·R8(forward 결합)이 동시에 만족된다 —
    3번 진동한 축이 "anchor를 쓰되 대상이 실재한 뒤에 쓴다"로 닫혔다.
    (선택지 중 '신규 Task 분리'는 Files to Change·Validation·Acceptance를 함께 바꿔 공격면을
    늘리므로 채택하지 않았다 — 이 loop의 기록된 실패 모드 (b)다.)

14. **R8 흡수 중 실측으로 발견한 선재 결함 — `bc` 부재** (패널이 낸 지적이 아님).
    `Task4/대체 anchor 명시` 단언이 쓰던 `grep -rhc … | paste -sd+ | bc` 관용구는 이 저장소의
    개발 환경(Git Bash)에서 **항상 깨진다**: `command -v bc` → MISSING이라 치환 결과가 빈
    문자열이 되고 `[ "" -ge 1 ]`이 `integer expression expected`로 실패한다. 즉 그 단언은
    8라운드 내내 구현과 무관하게 실패하는 상태였고 어느 리뷰어도 잡지 못했다 — **plan을 읽는
    것만으로는 잡히지 않고 실행해야 보이는 종류**다. `-h` + `wc -l`로 전면 교체(3곳)하고
    4케이스(자리표시자 유/무 × receipt 유/무)로 재현 검증했다.

15. **R9 — Task 11 `BRANCH_V` fail-open** (invariant CRITICAL). 버전 게이트가 비교의 **한쪽에만**
    보호를 걸고 있었다. `MAIN_V_NOW`는 흡수 9번에서 fetch·read·semver 3단으로 분리해 놨는데
    `BRANCH_V`는 무방비라, `plugin.json`을 못 읽으면 빈 문자열이 되고 `[ "" = "1.26.0" ]`이
    거짓이라 **게이트 통과**가 된다 — 9번이 막은 것과 **같은 fail-open이 반대편에 그대로**
    있었다. 읽기 실패 abort + semver 형태 검사를 대칭으로 추가.

16. **R9 — Task 1 머지 완료 미판정** (invariant HIGH). `git merge origin/main`의 종료 코드를 보지
    않아 MERGING(충돌 잔존) 상태에서도 Validate가 돌았다. 그 대조는 HEAD가 머지 완료라는 전제
    위에 서 있으므로, 해소 전 트리를 정본으로 읽으면 §3.5.1이 막으려는 파일 소실을 놓친다.
    `MERGE_HEAD` 존재 검사를 Validate 진입 전에 배치. (같은 자리에 `그다음 git merge origin/main.`
    이 두 줄 중복돼 있던 편집 잔재도 함께 정리했다.)

17. **R9 — 버전 게이트가 두 벌이었다** (invariant HIGH). Task 11 Validate가 Action의 비교를 한 줄로
    복제했는데 그 복제본에는 3단 보호가 없었다. **게이트를 두 벌 두면 약한 쪽이 실질 게이트가
    된다.** 복제본을 없애고 Action 블록의 출력·종료 코드를 통과 조건으로 삼도록 일원화.

18. **R9 — Validation 7의 날짜·카운트 결함 2건** (invariant MEDIUM 1건 + 실측 발견 1건).
    (a) 기준 날짜를 `date +%Y-%m-%d`로 잡아, Task 9 작성일과 검증 실행일이 어긋나면(자정 경계,
    하루 넘긴 작업, 재검증) 10건이 전부 멀쩡해도 실패했다 — 이제 R3 행에서 배치 날짜를 파생한다.
    (b) 그것을 재현하다 **`$(grep -c … || echo 0)`이 0건일 때 `"0\n0"`을 낸다**는 것을 발견했다
    (grep -c는 `0`을 출력하면서 exit 1도 한다). 뒤따르는 `$(( ))`가 `syntax error`로 깨져 단언이
    판정 자체를 못 한다. 같은 파일 464·466행은 이미 올바른 `|| true`를 쓰고 있었다 — 관용구가
    한 파일 안에서 갈려 있었다. 5시나리오(10건/RESOLVED 동반/11건/날짜 어긋남/R3 부재)로 검증.

    14번과 18(b)는 **패널이 낸 지적이 아니라 흡수 코드를 실제로 실행해 본 결과**다. plan을 읽는
    것만으로는 잡히지 않는 층이 있다는 뜻이고, 라운드를 늘리는 것으로는 닿지 않는다.

19. **R10 — Validation 5의 `$TARGET`/`$MAIN_V` 미정의** (test MEDIUM). 12번과 **완전히 같은
    계열**이다: 그 두 변수는 Task 2 Action의 셸에서만 정의되는데 전역 Validation 블록은 별도
    실행이라 존재하지 않고, `set -u` 아래에서 확장이 서브셸을 죽여 `[ "" -eq 1 ]`이
    `integer expression expected`로 깨진다 — Validation 5가 구현과 무관하게 **항상 실패**했다.
    셸 상태에 기대지 않고 디스크에서 파생하도록 고쳤다(branch plugin.json = TARGET,
    origin/main = MAIN_V) + semver 형태 검사 + "둘이 같으면 Task 2 미수행" 단언을 추가.
    마지막 단언이 없으면 상향 전 상태에서도 헤딩 유일성이 우연히 참이 되어 통과한다.

    **같은 결함이 두 번 나온 것이 이 plan의 실제 취약점을 가리킨다**: 검증 블록이 Task의 셸
    상태를 암묵적으로 물려받는다고 가정하는 자리들. 12번(`$T4_FILES`)은 정의 순서, 19번은
    블록 경계였다. 남은 `$MCCP_TMP`·`$BACKLOG`·`$T4_FILES`는 모두 블록 안에서 정의된다(확인함).

    R10의 나머지 3건은 LOW이고 리뷰어 스스로 둘을 "No defect"·"Mitigated"로 적었다. 세 번째는
    Task 5가 `.claude/plans/session-process-reclaim.plan.md`를 편집할 수 없다는 것인데,
    그 파일은 이 plan의 `Files to Change`에 명시돼 있으므로 오독이다.

## R11 — 퇴행, 그리고 루프를 멈춘 근거

**R11에서 흡수한 것은 0건이다.** plan은 R10보다 엄격히 나아졌는데(19번 수정 + 블록 자립성
전수 스캔) 판정은 1 blocking에서 4 blocking으로, pass 관점은 3에서 1로 떨어졌다. 새 지적 12건을
근거까지 읽어 대조한 결과, **실결함이 0건**이었다.

invariant CRITICAL + MEDIUM 2건은 근거를 펼치면 전부 하나의 논증이다 — **"구현자가 그 블록을
건너뛰면 아무것도 막지 못한다."** 그것은 plan의 *모든* 지시에 참이다. plan 문서는 자기 실행을
기계적으로 강제하는 런타임이 아니며, 이 plan은 이미 할 수 있는 최대치를 하고 있다: 버전 게이트를
`/mccp:pr` 호출 **앞에** 두고, guard가 혼자 충분하지 않다고 명시하고, Acceptance가 최종 상태를
다시 읽는다. 이 논증을 수용하면 어떤 plan도 승인될 수 없다 — R4·R5에서 이미 두 번 기각한
"Acceptance는 승인 이후 조건이므로 게이트가 아니다"와 같은 계열이다.
덧붙여 그 CRITICAL의 근거 중 "Validation 10에 ANCHOR-PENDING 검사가 없다"는 **사실과 다르다**:
Validation 10이 자리표시자 *존재*를, Task 11 Validate가 *소멸 + 경로 실재*를 짝으로 단언한다.

나머지도 같은 성격이다:
- architect "backlog 키워드가 아직 없다" — Task 9가 만들고 Validation 7은 그 뒤에 돈다.
  **R10의 test 리뷰어는 같은 구조를 검토하고 "forward dependency handled correctly by
  sequencing"이라 적었다.** 두 라운드가 같은 것을 정반대로 판정했다.
- architect "Task 4의 ANCHOR-PENDING이 여전히 forward reference다" — anchor 축의 **5번째 진동**.
  자리표시자는 파일 경로가 아니라 Task를 가리키며, 그 구분이 13번 수정의 전부다.
- test "Task 12의 구현 코드가 plan에 없다" — plan은 명세하고 구현이 구현한다. CREATE 대상 파일의
  전체 소스를 plan에 인라인하라는 것은 범주 오류다.
- architect "이전 판에 결함이 있었다는 주장의 diff가 없다" — plan에게 자기 변경 이력을 증명하라는
  요구다.

### 판정: 라운드를 더 늘려도 닿지 않는다

증거는 셋이다. (1) 추이가 단조가 아니다 — 5→4→1→4 blocking. plan 품질과 판정이 역행했다.
(2) 라운드 간 **상호 모순**이 관측됐다(위 forward dependency 건). 같은 입력에 대한 판정이
비결정적이라면 라운드를 늘리는 것은 표본을 늘릴 뿐 수렴을 만들지 않는다. (3) 이 세션에서 고친
실결함 7건 중 **3건은 패널이 아니라 셸을 실제로 실행해서** 나왔고(`bc` 부재 · `|| echo 0` ·
파생 검증), 그중 2건은 11라운드 동안 어느 리뷰어도 보지 못했다. 즉 남은 결함의 주된 소재지는
"더 읽으면 보이는 것"이 아니라 **"돌려야 보이는 것"**이며, 읽기 전용 패널은 구조적으로 그 층에
닿지 못한다(read-only 계약상 Bash가 없다).

### 이 세션이 실제로 얻은 것

승인은 못 얻었다. 그러나 plan에서 **실결함 7건**이 제거됐고 그중 4건은 fail-open 또는
"구현이 옳아도 항상 실패"였다 — 즉 게이트가 게이트 노릇을 못 하던 자리들이다. 게이트의 가치는
승인 도장이 아니라 이것이었다.

## R12 — 표면 축소 후 재심. 지금까지 중 최선의 라운드

**전략을 바꿔서 돌린 첫 라운드다.** R11까지는 plan을 그대로 두고 라운드만 늘렸다. R12는 운영자
결정으로 **표면을 먼저 줄인 뒤** 1회만 심사했다.

축소한 것은 하나다 — `## Multi-Perspective Fan-out`의 verbatim 원문 34건 + Meta-gaps + Patterns
(97행)을 `.claude/reviews/archive/fanout-session-process-reclaim.md`로 **귀속 정정 이동**했다.
그 fan-out은 이 followup plan이 존재하기 전에 발화했고 planPath가
`.claude/plans/session-process-reclaim.plan.md`였으므로, findings의 줄 번호·Task 번호가 전부 **다른
문서**를 가리켰다 — 리뷰어가 대조하면 실재하지 않는 앵커를 읽는다. plan 자신의 주석이 이미 그
사실을 적고 있었다. `## Rejected Findings`는 **건드리지 않았다**: 그건 재제기 방지 장치라 줄이면
축소가 아니라 게이트 무력화다. 828 → 731행.

| | R10 | R11 | R12 |
|---|---|---|---|
| blocking | 1 | 4 | **2** |
| HIGH/CRITICAL | 0 | 1 CRITICAL 포함 | **0** |
| pass 관점 | 3 | 1 | 1 (단 **architect가 findings 0**) |

**HIGH/CRITICAL이 0건인 라운드는 R10과 R12뿐이고, architect가 findings를 하나도 내지 않은 것은
12라운드 중 처음이다.** 두 blocking은 전부 MEDIUM이었고 **둘 다 실결함으로 확인돼 흡수했다** —
R11이 12건 중 0건 흡수였던 것과 대비된다.

`coverage 3/4`는 test 리뷰어가 StructuredOutput을 호출하지 않고 끝난 것이다(R2와 같은 형태).
정족수 `responded>=3 ∧ roles>=3`은 충족했으므로 판정은 미응답이 아니라 blocking 2건이 만들었다.

### 흡수 2건 (둘 다 "구현이 옳아도 항상 실패" 계열)

20. **R12 — Validation 10의 자리표시자 단언이 Task 11과 정면 충돌** (security MEDIUM).
    `v10 "Task4/anchor 자리표시자"`가 `ANCHOR-PENDING(Task 11)`의 존재(`-ge 1`)를 **무조건**
    요구하는데, Task 11 Action 3은 receipt 생성 후 그 자리표시자를 실제 경로로 **치환**하고
    그 Validate는 소멸(`-eq 0`)을 요구한다. Acceptance가 "머지 후 재검증"을 명시하므로 두 단언은
    같은 트리에서 만나고, **Task 11을 정확히 수행할수록 Validation 10이 붉어진다.**
    결정적인 것은 **바로 아래 형제 단언이 이미 같은 이유로 조건부**였다는 점이다(그 주석:
    "이 블록은 출하 후 재실행될 수 있다 … 무조건 0을 요구하면 옳은 상태를 붉게 만든다").
    처방을 알고 있으면서 자기 자신에게 적용하지 않았다. 판정 축을 receipt 실재 여부로 갈라
    출하 전에는 존재를, 출하 후에는 소멸을 요구하도록 고쳤다.
    12·19번과 같은 계열의 **네 번째** 사례다.

21. **R12 — 버전 게이트에 산출물 증거가 없다** (invariant MEDIUM의 전반부만 수용).
    Action 블록이 `version gate OK: …`를 **stdout에만** 찍는데 Acceptance는 다른 셸에서 돌아
    대조할 대상이 없었다 — "게이트가 실제로 돌았다"의 유일한 증거가 사람의 기억이었다.
    `$MCCP_TMP/version-gate.txt` 아티팩트 + **stale 판정**(기록된 branch version이 현재
    `plugin.json`과 일치해야 함 — 재상향했다면 옛 번호를 가리키므로 재실행 필요)으로 닫았다.
    5.2a가 `started-at`을 변수가 아니라 파일로 두는 것과 같은 이유다.
    나머지 절반(`/mccp:pr` Phase 0 기계 통합)은 기각했다 — 근거는 plan `## Rejected Findings`.

### 이 라운드가 말해 주는 것

R11 절은 "라운드를 늘려도 닿지 않는다"고 적었고 그 판단은 **여전히 옳다** — R12가 나아진 것은
라운드를 하나 더 돌려서가 아니라 **입력을 바꿔서**다. 다른 문서를 가리키는 97행을 걷어내자
architect의 findings가 0이 됐다. 즉 R6 architect 지적의 다수가 Validation 10 블록에 대한
것이었듯, 이번 개선도 "리뷰어가 무엇을 읽는가"가 판정을 지배한다는 같은 사실의 다른 얼굴이다.

다만 **승인은 여전히 미획득**이고(2 blocking), 이것을 "곧 수렴한다"는 신호로 읽으면 안 된다.
R10도 blocking 1까지 내려갔다가 R11에서 4로 되돌아갔다. 판정의 비결정성은 축소로 사라지지 않는다.

## R13 — coverage를 두 번의 launch로 조립했다 (기록으로 남긴다)

**이 라운드의 정족수를 액면 그대로 읽으면 안 된다.** 1차 launch에서 architect·invariant가
StructuredOutput을 호출하지 않고 끝나(`agents_empty_result: 2`) `coverage 2/4`가 됐다. 응답한
둘(security·test)은 **모두 pass, blocking 0**이었으나 정족수(3)에 미달했다. 그래서 **판정이
존재하지 않는 두 관점만** 2차로 보충 발화해 병합했다.

병합의 근거는 **plan hash 동일**이다(`685fc9e9…`를 2차 발화 직전에 재계산해 대조 — UNCHANGED).
네 관점이 같은 plan 버전을 읽었고, 리뷰어는 애초에 서로를 보지 못하므로(프롬프트: "you cannot
see the others") 한 Workflow 안에 있는지는 격리와 무관하다.

**이것이 표본 재추출이 아닌 이유**: 두 관점은 반대 판정을 낸 것이 아니라 **판정을 내리지
못했다**(하네스 오류). 없는 측정을 채우는 것과 마음에 안 드는 측정을 다시 뽑는 것은 다르다.
후자였다면 — architect가 `fail`을 냈는데 다시 띄웠다면 — 게이트 조작이다. 실제로 2차에서 그 둘은
**fail을 냈고**, 그 판정을 그대로 채택해 이 라운드는 divergent로 끝났다. 조립이 결과를 유리하게
바꾸지 않았다는 사실이 그 자체로 증거다.

**미응답은 징후이기도 하다.** R12에서 1건, R13 1차에서 2건으로 늘었다. plan이 759행이라 리뷰어가
읽는 데 예산을 쓰고 구조화 출력에 도달하지 못하는 것으로 보인다 — 표면 축소가 판정 품질뿐 아니라
**측정 가능성** 자체에 걸려 있다는 뜻이다. 2차 launch(2 에이전트)는 미응답 0이었다.

### 흡수 3건

22. **R13 — Validation 10의 단언이 YAML frontmatter를 깨는 편집을 강제** (invariant MEDIUM).
    `fix-task-applied.md:12`의 hit은 산문이 아니라 frontmatter 리스트 값(`originating_receipts:`
    아래 `  - .claude/receipts/…`)이다. Task 4의 "같은 줄에 소실 주석 병기" 규칙을 문자 그대로
    적용하면 주석이 **경로 문자열의 일부**가 되어 값이 오염되는데, `참조:주석 같은 줄 짝` 단언은
    **모든** hit에 그것을 요구한다. 즉 단언을 만족시키는 유일한 방법이 파일을 깨는 것이었다 —
    지금까지의 "구현이 옳아도 실패"와 반대 방향인 **"틀린 구현을 요구"** 형태다.
    실측으로 확인: 올바르게 고친 파일에 옛 단언이 `1`을 낸다. frontmatter 구간을 `awk`로 걷어낸
    본문만 세도록 바꾸고, frontmatter 축은 별도 단언으로 분리했다(제외만 하고 방치하면 그 참조가
    무표시로 남는다).
    리뷰어는 이것을 `:31`의 command tag "semantic ambiguity"로 제기했는데, 날카로운 지점은 그쪽이
    아니라 `:12`의 frontmatter였다 — **틀린 각도에서 실결함에 도달한 경우**다.

23. **R13 — 소실 아티팩트의 *내용* 단정이 그대로 남는다** (invariant HIGH → 실질 MEDIUM으로 판정).
    Task 4가 존재 주장은 지우지만 `STATE.md:23`의 `findings 5건 원본 severity 봉인` ·
    `codex_verdict=skipped` 같은 **값 단정**은 그대로 산다. 파일이 없는 이상 아무도 대조할 수
    없는데 검증 가능한 사실처럼 적혀 있다. Task 4의 목표가 "없는 증거를 있다고 말하는 문장의
    제거"이므로 "없는 증거의 *내용*을 단정하는 문장"도 같은 대상이다. 값을 지우지 않되
    `당시 기록에 따르면 …(대조 불가)`로 출처를 명시해 낮추도록 하고, 단언을 추가했다.
    HIGH로 받지 않은 이유는 정정 후 파일이 더 이상 존재를 주장하지 않기 때문이다 — 남은 것은
    출처 표기 문제이지 위조가 아니다.

24. **R13 — Task 5 단언이 자기 Task와 무관한 것을 재고 있었다** (test LOW).
    `Task5/identity 7 라벨`이 **test 파일**을 grep했는데, 그 파일은 이 Task가 만들지 않은 선재
    파일이라 **Task 5를 전혀 수행하지 않아도 통과**한다. Task 5의 산출물은 *plan 문서의 라벨*이다.
    plan 쪽 단언을 판정 축으로 세우고 test 실재는 보조 축으로 남겼다.

### 기각 3건 (근거는 plan `## Rejected Findings`)

- **semver glob이 `1..3`·`.2.3`·`1.2.`를 통과시킨다** (invariant **HIGH**) — **실행으로 반증.**
  전제가 "glob의 `[0-9]*`는 숫자 0개 이상"인데 그것은 정규식 문법이다. glob의 `[0-9]`는 정확히
  한 글자를 소비한다. 지적한 세 케이스가 전부 정지한다(11케이스 실측).
- **Task 11 Action 3의 치환 메커니즘 미명시** (architect MEDIUM) — 범주 오류. R11에서 같은 형태를
  이미 기각했고, slug는 `derive-decision`이 결정론적으로 산출하며, Validate가 절차가 아니라
  **결과**(자리표시자 0건 ∧ 기입 경로가 실재 파일)를 짝으로 단언한다.
- **Task 9 guard와 Validation 7의 날짜 불일치** (invariant MEDIUM) — R9 흡수 18(a)에서 이미 닫힌
  축의 재제기. Validation 7은 R3 행 자신에서 날짜를 파생한다. 리뷰어가 근거로 든 줄은 결함이
  아니라 **그 결함을 고친 주석**이다.

### 관측: 라운드 간 상호 모순이 또 나왔다

R12에서 architect가 `findings 0`으로 pass했던 **바로 그 축**(Task 11 Action 3 / ANCHOR-PENDING)을
R13 architect가 MEDIUM으로 막았다. plan은 그 사이 R12 지적을 흡수해 **엄격히 나아졌다**.
R11 절이 기록한 비결정성(같은 구조를 두 라운드가 정반대로 판정)이 재현된 것이고, 이번에는
`forward dependency` 축이 아니라 anchor 축에서 나왔다 — 그 축은 이제 **6번째 진동**이다.

## R14 — 흡수 3건, 그리고 **정밀도 붕괴로 루프를 멈춘 근거**

### 흡수 3건 (전부 실행으로 확인)

25. **R14 — Task 12가 존재하지 않는 함수를 지목** (test **HIGH**, 실측 확인).
    계약이 "`pidAlive(pid) === false`를 단언한다"고 적었으나 `session-processes.js`의 export
    37개에 `pidAlive`·`isPidAlive` **둘 다 없다**. 실제 정본은 `receipt/evidence-lock.js`의
    `isPidAlive`(`:82-91`, `EPERM→alive`)이고 `lib/dashboard-server.js`에도 동명 `pidAlive`가
    있다 — 즉 구현자는 지목된 모듈에서 찾다 실패하고 **손으로 다시 짠다**. fan-out 기록이
    `evidence-lock.js:82-91`을 "MUST reuse for all three contexts"로 못박았으므로 재구현은
    명시적 위반이다. 출처를 못박고, Validation 9의 인라인 `EPERM` 분기도 같은 함수 호출로
    교체했다(live/dead/부재 3케이스 실행 검증).

26. **R14 — base-inventory 가드가 stale 파일에 fail-open** (invariant **HIGH**).
    `$MCCP_TMP`는 `.git/mccp/tmp`라 실행 사이에 **살아남는다.** 따라서 이전 시도가 남긴
    `base-inventory.txt`가 있으면 Action 1단계를 건너뛰어도 `test -s` 가드가 만족되고, 대조는
    *옛 main* 인벤토리를 정본으로 삼아 돈다 — 그 사이 main이 추가한 파일의 소실을 놓친다.
    흡수 3번이 "파일 부재"로 막은 vacuous 대조가 **"파일 잔존"으로 재현**된 형태다.
    캡처 시점의 `origin/main` SHA를 함께 봉인하고 Validation 4가 현재와 대조하도록 했다(4케이스 검증).

27. **R14 — Task 11의 Action 라벨 충돌** (architect MEDIUM). `- **Action**:` 다음에 동급 불릿으로
    `- **Action 3 —**`이 오는데 Action 1·2가 없었다. Task 4가 "§Task 11 Action 3"을 **하중 지지
    참조**로 쓰므로 모호함이 실질적이다. `Action 1 — 버전 게이트` / `Action 2 — anchor 기입`으로
    정리하고 전 참조를 갱신했다(잔존 `Action 3` 0건).

### 기각 (근거는 plan `## Rejected Findings`)

- **security HIGH+MEDIUM×2** — "ANCHOR-PENDING·Task 4 검증에 코드 수준 강제가 없어 우회 가능".
  `구현자가 건너뛰면 막지 못한다` 계열의 **5번째** 제기(R4·R5·R11·R13에 이어). 제안된 해소는
  `/mccp:pr`·validate-cmd 개조인데 그것은 **이미 출하된 command body**라 이 사이클의 출하 대상을
  둘로 만든다(§Out of Scope가 B1·하드닝 5건에서 거부한 교환).
- **invariant CRITICAL** — "Task 11 Action이 출하 명령(`/mccp:prp-commit`·`/mccp:pr`)을 누락".
  **거짓.** 262행이 그 둘을 명시한다(grep로 확인).
- **invariant MEDIUM(EPERM/win32)** — 지적한 축은 옳으나 근거가 부정확했다. 인라인
  `EPERM→alive`는 이 저장소 정본과 **동일 의미론**이고 win32에서도 libuv가 같은 코드를 낸다.
  실제 문제는 플랫폼이 아니라 재구현이었고, 그것은 흡수 25번이 닫았다.
- **test MEDIUM×3 + LOW** — Task 9 키워드 대조(plan이 이미 1→10 대응표를 명시) · Validation 9의
  Task 12 파일 의존(순서일 뿐이고 fail-closed) · Files to Change의 Task별 diff 귀속(YAGNI) ·
  Task 5 라벨 세부(R13 흡수 24번이 이미 plan 쪽 단언을 세움).
- **invariant MEDIUM(주석 위치 고정)** — YAGNI. sentinel 문구가 자기 위치를 서술하므로 실패
  모드가 작위적이고, 흡수하면 축을 닫지 못한 채 plan만 키운다.

### 정지 판단 — 수확이 아니라 **정밀도**가 무너졌다

| | R12 | R13 | R14 |
|---|---|---|---|
| 제기 findings | 2 | 6 | **13** |
| 그중 실결함 | 2 | 3 | 3 |
| **정밀도** | **100%** | **50%** | **23%** |
| pass 관점 | 1 | 2 | **0** |
| 소비 토큰 | ~92k | ~377k | ~395k |

실결함 절대 수(3건)는 유지됐지만 **정밀도가 반씩 떨어지고 소비는 4배**가 됐다. 더 결정적인 것은
오류의 **종류**다 — R14는 262행이 정면으로 반박하는 CRITICAL과, R13에서 이미 실행으로 반증된
축의 재제기를 냈다. 즉 패널이 plan을 덜 읽고 더 단정하기 시작했다.

앞선 라운드에서 미리 못박은 정지 규칙은 "R14가 흡수 가능한 결함을 0건 내거나, 흡수가 축을 닫지
못한 채 plan만 키우면 멈춘다"였다. 흡수는 3건이었고 셋 다 축을 닫았으므로 문자 그대로는
계속해도 된다. **그럼에도 멈추는 이유는 위 표다** — 규칙이 겨냥한 것은 개수가 아니라 수확 체감이고,
정밀도 100→50→23%는 그것을 개수보다 선명하게 보여준다. R15는 findings 20건에 실결함 2~3건일
공산이 크고, 그것을 가려내는 비용을 저자가 계속 치른다.

**이 세션의 순수익**: 실결함 **8건** 제거(R12 2 · R13 3 · R14 3). 그중 fail-open 3건
(anchor 조건부 · version-gate 증거 · base-inventory stale), "틀린 구현을 요구하는 단언" 1건
(frontmatter), 구현을 막는 명세 결함 1건(pidAlive 미존재). 승인 도장은 얻지 못했으나
게이트가 게이트 노릇을 못 하던 자리들이 닫혔다 — R11 절이 적은 "게이트의 가치"가 이것이다.

## 기각한 지적 (근거는 plan `## Rejected Findings`에 있음)

- **"Acceptance가 승인 이후에만 만족되므로 게이트가 아니다"** (CRITICAL, 2회 제기) — 승인 게이트는 L1+L2이고 실제로 이 plan을 6번 막았다. Acceptance는 구현 완료 후 판정 축이며, `/mccp:plan` 템플릿 자체가 "게이트를 실제로 1회 완주"를 요구한다
- **"소실 receipt 참조를 지우지 않고 주석만 단다"** (HIGH, 2회) — 대안인 receipt 재작성은 §3.13대로 CLI 표면이 없고 손으로 쓰면 증거 위조다. 삭제하면 심사가 있었다는 사실까지 사라진다
- **"`evidence-audit.js --json`이 인자 누락으로 실행 불가"** (CRITICAL) — usage가 `[--json] [--repo-root]`뿐이고 인자 없이 정상 동작(실측 exit 0, `state=incomplete`). 다만 인접한 실제 부정확(전역 판정에 "그 decision에 대해"라는 수식)은 수용해 (a) decision 단위 `codex_verdict` / (b) 전역 감사로 분리했다
- **"`identity 7` test가 부재"** (CRITICAL) — `session-processes-reclaimable.test.js:425`에 실재. plan의 인용 경로가 틀렸던 것이고 그 부분은 Task 5에서 수정

## 수렴 실패의 성격 — 다음 세션이 알아야 할 것

두 가지가 겹쳤다.

**(a) 오실레이션.** R5에서 security가 "대체 anchor를 명시하라"(MEDIUM)고 요구해 반영했더니,
R6에서 같은 관점이 "아직 없는 receipt를 참조한다"(HIGH)로 **더 높은 등급으로** 막았다. 요구대로
고친 것이 더 크게 처벌됐다. 현재는 anchor를 **미래형**("출하 시 생성될", "아직 존재하지 않는다")으로
표기해 양쪽이 동시에 성립하도록 정리했고, Validation 10이 그 표지를 판정한다.

**(b) 공격면 증식.** 매 라운드 흡수가 검증 셸 코드를 덧대는 형태라, 그 코드가 다음 라운드의
새 공격면이 됐다 — R6 architect 지적의 다수가 R4에서 추가된 Validation 10 블록에 대한 것이었다.
plan은 약 560행이고 관점마다 다른 곳을 읽으므로, 라운드를 늘리는 것만으로 0 blocking에
도달한다는 보장이 없다. 4관점이 동시에 pass한 라운드는 한 번도 없었다(최대 2/4).

## 재개 방법

> **2026-08-17 갱신 — 아래 1번은 이미 수행했다.** 새 세션에서 R8~R11을 돌렸고(상한은 예상대로
> 리셋됨), 결과는 위 라운드 추이·R11 절에 있다. **승인은 여전히 미획득**이고, 운영자 결정으로
> 그 시점에 루프를 종료했다(우회하지 않음 — `mccp-plan-codex` receipt 부재 상태 그대로 반환).
> 현재 plan 해시는 `26fe6d39`이며 R11이 심사한 것과 **동일하다**(이후 plan 편집 없음).
> 아래 2번(Codex 전환)은 2026-08-17에 재실측했고 여전히 `exit-nonzero`·blocking이다.
>
> 다음 세션이 고를 수 있는 것: (a) 구현으로 진행하며 `/mccp:prp-implement`를 audited bypass로
> 진입 · (b) Codex 쿼터 복구 후 승인 주체 전환 · (c) plan을 축소 재구성해 공격면을 줄인 뒤 재심사.
> **라운드를 그냥 더 늘리는 것은 위 R11 절의 근거 3가지로 권하지 않는다.**

1. ~~**새 세션에서 패널 재개**~~ — 수행 완료(R8~R11). 에이전트 상한은 session-keyed라 새 세션에서
   리셋된다는 전제는 실측으로 확인됐다(R8 진입 시 granted 4/24).
2. **Codex로 승인 주체 전환** — 2026-08-17 실측 시 쿼터 소진(`exit-nonzero`, "try again at
   Aug 20th, 2026 1:13 PM"). plugin 설치·인증은 정상(`codex@openai-codex` 1.0.4). 단
   **표시된 복구 시각은 확정적이지 않으므로**(memory: `codex-quota-reset-time-not-authoritative`)
   재시도로 확인해야 한다. `MCCP_CODEX_DISABLED=1`이 user-level `settings.json`에 있어,
   실제 심사를 원하면 그 호출에 한해 `0`으로 덮어야 한다 — 그대로 두면 "심사 건너뜀"이 봉인된다.
3. **`MCCP_ALLOW_CODEX_UNAVAILABLE=1`은 승인 경로가 아니다** — non-approving receipt를 쓸 뿐
   체인을 열지 못한다.

`MCCP_ORCHESTRATION_MAX_AGENTS` 상향은 권하지 않는다. 상한은 폭주 방지 장치이고, 이번 정지는
그것이 제 역할을 한 것이다 — 수렴하지 않는 루프를 계속 돌리려고 그 장치를 올리는 것은 순서가 거꾸로다.
