# Milestone Closure — ci-full-suite-m2

## Milestone
- ID         : ci-full-suite-m2
- Name       : suite-green (정정 — 원명 `runtime-reduction`)
- Plan       : .claude/plans/ci-full-suite-m2.plan.md
- Status     : done
- Closed at  : 2026-09-03T06:51:45.263Z
- Closed by  : /mccp:milestone-close (run_id=da54bae5-c5e3-4290-8bc9-3f4b7047803f)

## Acceptance Condition

운영자가 `/goal`에 verbatim으로 넘긴 조건:

> ci-full-suite M2 acceptance is settled: the six-branch decomposition of the 16 red files is recorded with per-branch attribution, the Linux 3-run measurement is either merged into the container or explicitly deferred with a written reason, and any unmet plan acceptance item is recorded rather than rounded up — or stop after 15 turns

## Goal Loop Result

verdict=done — **운영자 판정**이며, 이번에는 `/goal` 루프가 **실제로 돌았다.**

이 디렉토리의 선례 3건(`env-contract-integrity-m2` · `gate-guard-integrity-m3` ·
`review-loop-bypass-m2`)은 모두 "`/goal` 루프는 돌지 않았다"를 기록한다. 이 문서는 그
계보에서 처음으로 Phase 2~3을 실제로 통과했다 — 운영자가 `/goal <condition>`을 직접
호출했고, session-scoped Stop hook이 활성인 상태에서 조건 대조가 수행됐다. 격리 lock도
표준대로 작동했다: 획득 직후 어시스턴트의 Bash 호출이 default-deny로 실제 차단됐고
(`goal-phase-guard` BLOCK, owner-session-match), 그 뒤 대조는 read-only 도구로만 수행했다.

운영자 응답 원문: «M2를 complete로 닫을 수 있게 모든 작업을 진행해줘.» 직전 turn에서
미충족 1건(Acceptance 산출물 2번)과 Linux 3회 미완을 보고했고, 운영자가 그 위에서 complete
종결을 재확인했다. 따라서 미충족분은 삭제·완화가 아니라 **기록된 채로 이연**된다.

### 조건별 판정 (산출물 실독 대조)

| 조건 | 판정 | 근거 |
|---|---|---|
| 6갈래 분해가 갈래별 귀속과 함께 기록 | 충족 | plan의 `## red 16파일 — 6갈래 분해`(16파일 × 6갈래, 관측된 오류 + 귀속)와 m2-green.md §2 판정표(판정 + 수리 지점). 두 표의 역할이 다르다 — 전자는 계획 시점 근거, 후자는 실행 후 결과이며 §1이 갈래 H 귀속의 정정 이력을 담는다 |
| Linux 3회가 병합 또는 사유와 함께 명시 이연 | 충족 (이연) | 컨테이너 9원소 실독 결과 M2 label Linux 원소 **0개**. m2-green.md §5c가 미완임을 제목에 달고 사유·의존 6건·후속 행동(격리 + 티켓)을 적는다 |
| 미충족 acceptance 항목이 반올림 없이 기록 | 충족 | m2-green.md §5b가 산출물 2번을 명시 미충족으로 적고 "green으로 반올림하지 않는다"고 선언한다. §7이 미주장 6건을 추가 열거 |

### 계획 Acceptance 산출물 4항목 — 실물 대조

1. **충족** — M2 label 원소 최소 3개, 각각 ok/attribution/redaction. 컨테이너에
   `local-m2-r1`~`r4` 4원소가 있고 벽시계 382 / 372 / 431 / 453초가 m2-green.md §5 표와
   일치한다. 컨테이너 전체 9원소가 모두 `ok:true` · `attribution:complete` ·
   `redaction_ok:true`다.
2. **미충족** — 3원소의 `failing` 집합 동일 또는 전부 격리 등재. r2·r3·r4의 집합이
   `{}` · `{post-edit-format-md}` · `{}`로 변한다. 격리하지 않은 사유는 §5b에 기록돼 있다.
3. **충족** — 갈래 H 검증이 봉인 존재 상태에서 통과. §3이 봉인 2개 존재를 확인한 뒤
   `pass 88 · fail 0`을 기록하고, §3a가 시임이 캡 강제를 끄지 않는다는 음성 통제를 담는다.
4. **충족** — `codex-reachability` 분류 수가 CLAUDE.md §3.3의 15종과 1:1.
   `EXPECTED_CLASSIFICATION_COUNT = 15` 단일 상수 + 3개 표면 각각 단언.
   `round-cap-reached`는 기존 5 kind 어디에 넣어도 사유가 거짓이 되므로 신규 kind
   `budget-spent`를 만들었다.

### 이 종결이 적용한 보정 2건

- **m2-green.md §5b 집계 보정.** "충족된 것은 1번과 3번이다"가 4번을 누락하고 있었다.
  4번의 충족은 §2 D행과 §6이 이미 기록했으므로 누락은 집계 한 줄에만 있었고 방향도
  보수적이었으나(충족을 덜 셈), 그 줄만 읽는 독자에게 4번의 상태가 보이지 않아 보정했다.
  보정 사실 자체를 인용 블록으로 남겨 원래 문장을 추적 가능하게 했다.
- **plan `## Acceptance` 상태 기록.** 체크박스 4개가 전부 비어 있어 무엇이 충족이고
  무엇이 아닌지 plan만 읽고는 알 수 없었다. 항목별 실제 상태를 달되 **부분 충족을
  체크하지 않았다** — Task 6은 4개 action 중 3개, Validation은 0~4·6 통과이므로 둘 다
  미체크로 두고 무엇이 남았는지를 본문에 적었다.

### 이 종결이 발견한 명령 본문 결함 (수리하지 않고 보고)

`commands/milestone-close.md` Phase 4의 mask 스니펫이 존재하지 않는 API를 부른다 —
`applySecretMask(text).text`. 실제 `applySecretMask(model)`은 **model 객체**를 제자리
변형하며 문자열을 받지 않고, 문자열용 함수는 `maskSecrets(text, opts) → { masked, hits }`다.
지시대로 실행하면 `Goal Loop Result`에 `undefined`가 실린다(이 세션에서 1회 재현 후 폐기).
선례 closure 3건은 모두 본문을 직접 작성했으므로 그 스니펫은 **여태 실행된 적이 없는 잠재
결함**이며 기존 산출물은 오염되지 않았다. 이 문서는 `maskSecrets`**만으로** 작성했다 —
같은 모듈의 `scrubAbsPaths`는 이 용도에 부적합하다. POSIX 절대경로 휴리스틱이 슬래시
명령 이름 `/goal` · `/mccp:pr`을 repo 밖 경로로 오인해 `<outside-repo:...>`로 훼손하고,
숫자 사이의 ` / ` 구분자까지 먹는다(`382 / 372 / 431 / 453초` → `382 <outside-repo:_> …`).
1회 재현 후 폐기했다. README가 요구하는 것은 secret mask이고 본문은 이미 repo-relative
경로만 쓴다. 수리는 배포 표면(`plugins/mccp/commands/`) 변경이라 이 사이클에 끼워 넣지 않고
별도 축으로 보고한다 — 우산 PRD의 서명 실패 모드("기계는 만들어지고 그것을 부르는 한 줄이
빠진다")가 이 명령 자신에게서 재현된 사례다.

### 반올림하지 않은 잔여 — M3이 회수한다

Linux 3회 측정에 갈래 F 2건(`dispatch-fullcycle-smoke` · `review-verdict-corpus-hash`) ·
R 2건(`validate-cmd` · `review-single-pass-fields`) · P 2건(`mask` · `santa-loop-cap` DD3)의
최종 판정이 걸려 있다. 로컬 4회에서 이 6건은 한 번도 실패하지 않았으나 그것은 Linux 판정이
아니다. 3회 뒤에도 남으면 삭제가 아니라 사유를 붙인 `--exclude-from` 명시 격리 + 티켓이다(UI4).
신규 flaky `post-edit-format-md.test.js`는 원인 귀속이 불가한 상태로 남는다 — reporter가
`nesting !== 0` 이벤트를 버려 어느 단언이 깨졌는지 산출에 남지 않으며, 그 공백은 별도 축으로
backlog에 등재돼 있다.

### 이 종결이 주장하지 않는 것

- **스위트가 green이라고 주장하지 않는다.** Windows 로컬이 red 1 → 0으로 향했을 뿐이고
  Linux 3회가 없다.
- **커버리지 100%를 주장하지 않는다.** 분모 정의(OQ5)는 M3 소유다.
- **Windows runner matrix 필요 여부를 답하지 않는다.** 갈래 H 재귀속으로 M1 §6의 근거가
  약해졌을 뿐이고 판단은 M3 소유다(OQ3).
- **cross-model 반증을 받았다고 주장하지 않는다.** 이 사이클의 Implement-Codex는 운영자
  정책(`MCCP_CODEX_DISABLED=1`)으로 발화하지 않았다. Codex 축의 회수 지점은 `/mccp:pr`이다.

## 종결 후 보정 — Linux 측정이 도착했다 (2026-09-03)

이 절은 **종결 판정 이후에 도착한 증거**를 기록한다. 위 본문은 종결 시점(06:51)의 상태이고,
이 절은 그 뒤 PR #177의 CI가 낸 것이다. 위를 고쳐 쓰지 않는 이유는 무엇을 알고 닫았는지가
감사 대상이기 때문이다.

### 무엇이 도착했나

PR #177의 `test-suite baseline measurement` (run `33734889607`, head `bab00a8`)가
Linux 원소 **2개**(node 20 · 24)를 냈다. **3개가 아니다** — matrix는 Node 버전당 1회다.

| | node 20 | node 24 |
|---|---|---|
| `ok` | true | true |
| `attribution` | complete | complete |
| `redaction_ok` | **false** | **false** |
| `files_total` / `per_file` | 380 / 380 | 380 / 380 |
| 벽시계 | 120.5초 | 123.4초 |
| red 파일 수 | **6** | **5** |

### 이것이 계획 Acceptance를 어떻게 바꾸는가 — 개수가 아니라 **성립 조건**이 바뀐다

**미충족은 여전히 1건이다(산출물 2번).** 개수를 늘려 적고 싶은 유혹이 있으나 그것은 부정확하다 —
산출물 1번은 **컨테이너 내용에 대한 진술**이고("`2026-09-01-suite-baseline.json`에 M2 label
원소가 최소 3개 존재하고 각각 …"), Linux 원소는 그 컨테이너에 **병합되지 않았다**. 실독하면
컨테이너의 M2 원소는 `local-m2-r1`~`r4` 4개뿐이고 넷 다 `ok` · `attribution:complete` ·
`redaction_ok:true`이므로 산출물 1번은 **문자 그대로 충족이다.**

**바뀐 것은 그 충족이 조건부임이 드러난 것이다.** 산출물 1번은 지금 이 순간
`redaction_ok=false`인 원소가 컨테이너 밖에 있기 때문에만 참이다. m2-green.md §5c와 STATE.md가
예고한 다음 행동(Linux 측정을 컨테이너에 병합)을 실제로 수행하면 산출물 1번은 **그 즉시 거짓이
된다.** 즉 현재의 충족은 실패하는 측정을 아직 들여놓지 않아서 성립하는 **공허한 충족**이고,
이 milestone이 반올림을 거부한 이유가 정확히 그런 종류의 성립을 경계하기 위해서였다.

그래서 이 절이 기록하는 것은 "미충족이 하나 늘었다"가 아니라 **"산출물 1번을 계속 충족으로
유지하는 유일한 방법이 실패 데이터를 병합하지 않는 것이다"** 라는 사실이다. 그 사실은 개수보다
무겁다. M3이 Linux 데이터를 병합하는 순간 산출물 1번이 미충족으로 전환되며, 그것은 회귀가
아니라 이미 존재하던 상태가 기록에 도달하는 것이다.

산출물 2번은 무변경 미충족이고, Linux가 그것을 **강화**한다 — 로컬 r2·r3·r4가 이미 갈렸는데
Linux 두 원소도 6 대 5로 갈린다(`dispatch-fullcycle-smoke`가 node 20에서만 red).
산출물 3번·4번은 무변경 충족.

### `redaction_ok=false`의 진단 — 유출이 아니고, 정규식 결함도 아니다

`redaction_hits`는 양쪽 모두 **정확히 1건**이고 `redaction_degraded:[]` ·
`redaction_scan_truncated:false`다. 매치는 red test의 단언 diff에 실린 **합성 fixture 리터럴**
`C:/repo/.claude/plans/x.plan.md`이며, `win-drive-abs`가 그것을 잡았다 — **설계대로**다.
그 규칙은 `(?<![A-Za-z0-9])[A-Za-z]:[\/]`로 드라이브 문자 앞 경계를 이미 갖고 있고
(`redact.js:133-135`가 그 목적이 `https://`의 `s:/` 배제임을 명시한다), 여기서는 그
경계를 통과한 진짜 드라이브 모양 문자열을 잡은 것이다.

**따라서 드러난 것은 결함이 아니라 결합이다: `redaction_ok`는 test greenness와 독립이 아니다.**
계획은 `ok` · `attribution` · `redaction_ok`를 독립 조건으로 다뤘으나, 실패한 test의 단언
텍스트가 경로 모양 fixture를 담으면 redaction 조건이 함께 무너진다. **red 하나가 Acceptance
조건 둘을 깬다.** M3이 이 측정을 merge-gating으로 승격시키기 전에 닫아야 한다 — 아니면 무관한
test 하나가 붉어질 때마다 유출 게이트가 함께 붉어져 신호가 죽는다. 수리 후보는 (a) 해당 red를
고치는 것(근본) · (b) fixture를 드라이브 모양이 아닌 값으로 바꾸는 것 · (c) 스캔 대상에서
단언 diff를 분리하는 것이며, (b)는 증상만 가리고 (c)는 탐지 표면을 좁히므로 (a)가 우선이다.

### "Linux 판정 대기 6건"의 실제 판정 — 3 red · 3 green

위 `### 반올림하지 않은 잔여` 절이 열거한 6건에 Linux 답이 왔다:

| 갈래 | 항목 | Linux 판정 |
|---|---|---|
| F | `dispatch-fullcycle-smoke` | **red** (node 20에서만 — node 24는 green) |
| F | `review-verdict-corpus-hash` | green |
| R | `validate-cmd` | green |
| R | `review-single-pass-fields` | green |
| P | `mask` | **red** (양쪽) |
| P | `santa-loop-cap` | **red** (양쪽) |

즉 6건 중 3건이 실재하는 Linux red이고 3건은 해소다. `dispatch-fullcycle-smoke`는 Node
버전 간에도 갈리므로 flaky 축이 추가로 의심된다 — 2원소로는 판정할 수 없다.

### 열거 밖의 Linux red 3건 — M2의 변경이 아니다

`leadtime.test.js` · `msw-m8-producers.test.js` · `receipt-linkage-fields.test.js`가
Linux에서 red인데, 셋 다 **main 쪽 작업이 마지막으로 건드린 파일**이다(각각 leadtime-observability
M3 `8107d5a` · orchestrator-step-wiring `5e4732e` · review-record-linkage M3 `9bd78b5`).
이 브랜치가 병합으로 받아온 트리의 관측이지 M2가 만든 red가 아니므로 M2에 귀속하지 않는다.
소유 축에 전달할 사실로만 남긴다.

### 그럼에도 verdict는 `done`을 유지한다

운영자가 `/goal`에 넘긴 수용 조건 3절은 **전부 여전히 충족**이다:

1. 6갈래 분해가 갈래별 귀속과 함께 기록 — 충족이고, 이 보정이 **더 강화**한다(대기 6건 중 3건이 판정됐다)
2. Linux 3회가 병합 또는 사유와 함께 명시 이연 — 여전히 **이연**이다. 측정은 도착했으나 3회가
   아니라 2회이고 컨테이너에 병합되지 않았으며, 사유는 m2-green.md §5c와 이 절이 적는다
3. 미충족 acceptance 항목이 반올림 없이 기록 — 충족이고, 이 보정이 미충족을 1건에서 **2건으로
   늘려 적는다**. 줄이지 않는다

수용 조건은 *측정이 통과할 것*을 요구하지 않았고 *측정을 병합하거나 사유와 함께 이연할 것*을
요구했다. M2의 축은 red 16파일의 분해와 귀속이었고 그것은 성립했으며, Linux 데이터는 그
귀속을 반증한 것이 아니라 진전시켰다. `redaction_ok` 결합을 닫는 것은 ci-enforcement(M3)의
소유이고, 여기서 그것을 쫓는 것은 milestone 경계를 넘는 것이다.

**이 판정을 뒤집을 조건**: Linux red 3건(`mask` · `santa-loop-cap` · `dispatch-fullcycle-smoke`)
중 하나라도 M2가 수리했다고 주장한 갈래의 회귀로 밝혀지면, 그것은 M2가 닫았다고 적은 것이
닫히지 않았다는 뜻이므로 종결을 재검토해야 한다. 현재까지 그 증거는 없다 — 세 건 모두 M1이
Linux 전용 red로 이미 열거했고 M2가 수리를 주장하지 않은 항목이다.

## Provenance
- Lock run_id        : da54bae5-c5e3-4290-8bc9-3f4b7047803f
- Lock owner session : d4a212b0-961a-46d1-a48d-39faf59209d8
- Plan source        : .claude/plans/ci-full-suite-m2.plan.md
- Detection signal   : {"row":2,"name":"suite-green (정정 — 원명 `runtime-reduction`)","plan":".claude/plans/ci-full-suite-m2.plan.md","status_at_detect":"in-progress","availability":"available","goal_signal":true,"reason":"ok"}
- mccp version       : 1.34.5
- Mask applied       : derive/mask.js#maskSecrets (secret hits: 0). `#scrubAbsPaths`는 의도적 미적용 — 상단 결함 절 참조
