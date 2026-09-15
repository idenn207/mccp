# Milestone Closure — ci-full-suite-m5

## Milestone
- ID         : ci-full-suite-m5
- Name       : findings-closure
- Plan       : .claude/plans/ci-full-suite-m5.plan.md
- Status     : skipped
- Closed at  : 2026-09-14T08:32:52.397Z
- Closed by  : /mccp:milestone-close (run_id=82e50880-662d-47c9-aba7-5fd246d1398c)

## Acceptance Condition

운영자가 `/goal`에 verbatim으로 넘긴 조건:

> V1·V2·V4·V5 pass, m5-findings-closure.md records all 8 verdicts with file:line,
> V3 result and Task 3 hold reason are written in the doc and PRD M5 row,
> or stop after 10 turns

## Goal Loop Result

verdict=skipped. 운영자 응답 원문(secret mask 적용 · hit 0):

> goal-skipped: Task 3이 closure-accounting M2 행의 complete를 기다려 dispose 미적용 —
> Task 0~2와 V1·V2·V4·V5만 통과했고 M5 행은 in-progress로 남긴다

**`/goal` 조건은 충족됐고 milestone은 닫히지 않았다.** 둘은 다른 명제다 — 조건의 범위가
이번 사이클(Task 0~2와 그 기록)이고, milestone 종결은 Task 3을 요구하기 때문이다. 조건이
충족됐다는 이유로 verdict를 `done`으로 올리는 것이 이 PRD가 금지한 반올림이라 `skipped`다.

격리 lock은 표준대로 작동했다. 획득 후 Bash 호출이 **2회 실제 차단**됐고
(`goal-phase-guard` BLOCK · `owner-session-match` · `default-deny during goal-phase` —
`grep | cut` 1회 · `test -f`로 시작하는 compound 1회), 그 뒤 조건 대조는 read-only 도구
(Read)로만 수행했다. heartbeat 1회는 통과했다. 이 문서와 plan stamp는 모두
`exit --run-id` 이후(`cleared:true`)에 쓰였다.

### 이 종결이 직접 재실행한 기계적 검증

산문을 믿지 않고 이 세션에서 실제로 돌린 것들이다. 측정 HEAD는 `71e8703`이고, 문서
`docs/ci-full-suite/m5-findings-closure.md`의 측정 HEAD(`f3ed385`)보다 뒤다 — 그 사이 커밋은
문서 기록 1건이라 결과가 같다.

| 검사 | 결과 |
|---|---|
| V1 — 8건이 전부 판정 + `path:line`을 갖는다 | **`V1 ok`** · exit 0 |
| V2 — batch ↔ registry open ↔ 문서 `fixed` 집합 일치 | **`V2 ok 2`** · exit 0 (실제 `classifyEvidence` · 실제 registry 판독) |
| V3 — 봉인 의존 (read-only) | **`V3 ready — Task 3 적용 가능`** · exit 0 |
| V4 — c2 잔재 부재 | `V4 ok` · exit 0 (한계는 아래) |
| V5 — 번호 미선언 (§3.7) | `ok: no version declaration on this branch (merge-base with origin/main = 1.34.4)` · exit 0 |
| 선행 의존 — closure-accounting PRD M2 행 | **`in-progress`** (`.claude/prds/closure-accounting.prd.md` Delivery Milestones 2행) |

### 조건별 판정 (산출물 실독 대조)

| 조건 | 판정 | 근거 |
|---|---|---|
| V1·V2·V4·V5 통과 | 충족 | 위 표. 넷 다 이 세션에서 재실행 |
| 8건 판정 + file:line이 문서에 있음 | 충족 | `m5-findings-closure.md` §2 표 — `fixed` 2(`639d7374f2f4d904` · `a1ce669aebc9a95a`) · `open` 6. V1이 기계적으로 재확인 |
| V3 결과가 문서에 적힘 | 충족 | 같은 문서 기계 판독 필드 `v3-verdict: ready`(L16) · §1 표(`blocked` → `ready` 편차) |
| Task 3 보류 사유가 문서에 적힘 | 충족 | 같은 문서 §1 L36-39 · §4 — 트리거 둘 중 V3만 충족이고 M2 행이 `in-progress`라 절반만 열렸다 |
| 둘 다 PRD M5 행에 적힘 | 충족 | PRD 행의 재정정 서술: V3 `ready` · "Task 3 트리거가 그 행의 `complete`를 요구하므로 적용은 여전히 보류" |

## 반올림하지 않은 미충족

- **`dispose` 적용 0건.** `docs/ci-full-suite/m5-dispositions.jsonl`(2줄)은 준비만 됐다.
  적용 조건은 closure-accounting PRD M2 행의 `complete` 머지이고 그 행은 `in-progress`다.
- **SessionStart 승입 억제 관측 미수행.** `handoff-items.js` 표면에서 `fixed` 2건의 부재를
  확인하는 것은 `dispose` 이후에만 가능하다.
- **`open` 6건은 닫히지 않았다.** claim 원문이 santa 원장에 있었고 그 경로가 `.gitignore:53`으로
  무시돼 대조 수단이 없다. 정황(backlog에 CRITICAL 부재)은 근거로 쓰지 않았다.
- **PRD M5 행은 `in-progress`로 남는다.** 이 종결은 행 status를 바꾸지 않는다.

### plan 대비 편차 1건 — Acceptance 2번은 문자 그대로는 거짓이다

plan `## Acceptance` 2번은 "V3가 이번 사이클에서 `blocked`를 출력"을 요구하지만 실측은
`ready`다. closure-accounting M2(PR #194) 머지가 라이브 재봉인을 수행해 대상 8건을 전부
포함시켰기 때문이다. 이 편차는 은폐되지 않았다 — `m5-findings-closure.md` §1과 PRD M5 행의
재정정 서술이 전제 변화와 그 결과를 함께 적는다. **편차의 방향이 차단 완화가 아니라는 점이
중요하다**: 봉인은 더 이상 장애가 아니지만 Task 3은 M2 행 때문에 여전히 닫혀 있다.

### V4 통과의 한계

`V4 ok`는 plan에 적힌 형태로 얻은 값이고, 그 형태는 `m5-findings-closure.md` L125-127이
지적한 대로 `git -C`가 실패해도 stdout이 비어 **공허하게 통과**할 수 있다. 이번에 확인한
것은 경로 누락이 원인이 아니라는 것까지다 — c2 worktree의 보존 대상
`orchestrator-step-wiring-m4.jsonl`이 실재하고 marker `.m4-legacy-close.json`은 부재함을
Read로 직접 봤다. 종료코드를 먼저 검사하는 강화판 V4의 `v4-verdict: ok`는 이전 세션이 문서
§3에 남긴 기록이며 이 종결이 재실행하지 않았다(lock 활성 중 Bash 차단).

## 이월

- **Task 3** — 트리거는 closure-accounting M2 행의 `complete`. 적용 직전 V2·V3 재실행
  (`dispose`는 all-or-nothing이라 부분 적용이 없다).
- **escalation** — STATE.md에 `decision: ci-full-suite-m5`의 `/mccp:santa-loop`가 열려 있다.
- **`open` 6건** — registry가 claim 원문을 보관하지 않는 구조(`findings-registry.js:71-104`)가
  닫히기 전에는 개별 입증이 불가하다.

## Provenance
- Lock run_id        : 82e50880-662d-47c9-aba7-5fd246d1398c
- Lock owner session : 68fd88e9-4fa0-42a4-8f4d-fc37be2f2797
- Plan source        : .claude/plans/ci-full-suite-m5.plan.md
- Measured HEAD      : 71e8703
- Detection signal   : `{"availability":"available","goal_signal":true,"signal_ref":{"row":5,"name":"findings-closure","plan":".claude/plans/ci-full-suite-m5.plan.md","status":"in-progress"},"mode":"milestone-close","reason":"ok"}`
- Secret mask        : `maskSecrets` · hits 0 (명령 본문이 가리킨 `applySecretMask`는 model 객체용이라 문자열 경로인 `maskSecrets`를 썼다)
- mccp version       : 1.34.4
