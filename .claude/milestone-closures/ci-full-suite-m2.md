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

## Provenance
- Lock run_id        : da54bae5-c5e3-4290-8bc9-3f4b7047803f
- Lock owner session : d4a212b0-961a-46d1-a48d-39faf59209d8
- Plan source        : .claude/plans/ci-full-suite-m2.plan.md
- Detection signal   : {"row":2,"name":"suite-green (정정 — 원명 `runtime-reduction`)","plan":".claude/plans/ci-full-suite-m2.plan.md","status_at_detect":"in-progress","availability":"available","goal_signal":true,"reason":"ok"}
- mccp version       : 1.34.5
- Mask applied       : derive/mask.js#maskSecrets (secret hits: 0). `#scrubAbsPaths`는 의도적 미적용 — 상단 결함 절 참조
