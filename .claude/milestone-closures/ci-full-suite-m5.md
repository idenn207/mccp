# Milestone Closure — ci-full-suite-m5

## Milestone
- ID         : ci-full-suite-m5
- Name       : findings-closure
- Plan       : .claude/plans/ci-full-suite-m5.plan.md
- Status     : done
- Closed at  : 2026-09-15T05:02:31.182Z
- Closed by  : /mccp:milestone-close (run_id=586f78a0-4f8a-41a4-8fa8-9f35708d51b5)

## Acceptance Condition

운영자가 `/goal`에 verbatim으로 넘긴 조건:

> V1·V2·V3·V4·V5 pass, Task 3 dispose applied (2 fixed), PRD M5 row complete, or stop after 10 turns

## Goal Loop Result

verdict=done. 조건 세 항이 전부 기계적으로 충족됐다(아래 표). 이 run에는 `goal-*` grammar 응답이
없다 — 조건이 작업 지시를 겸했고, 운영자는 도중에 한 번 판단(Task 3 보류 해제)을 내렸으며,
판정은 그 뒤의 실측으로 내렸다. secret mask(`maskSecrets`)는 조건 원문에 적용했고 hits 0이다.

**이전 run(`82e50880…`, verdict `skipped`, 커밋 `eee0c3b`)을 대체한다.** 그 run은 Task 3이
closure-accounting M2 행의 `complete`를 기다린다는 이유로 닫지 않았다. 이 run에서 운영자가
2026-09-15에 그 보류를 해제했다.

### 절차 편차 — lock을 판정 전에 풀었다

명령 본문은 lock을 유지한 채 조건을 평가하고 grammar 응답 뒤에 `exit`한다. 이번에는 조건 자체가
쓰기(`dispose` · PRD 편집)를 요구했고, `goal-phase-guard`는 owner 세션의 Edit/Write와 allowlist 밖
Bash를 막는다(`goal-phase-guard.js:45`, `:76-87`). 그래서 운영자 승인 직후
`goal-phase-lock.js exit`(`cleared:true`)로 격리를 풀고 작업했다. 조건 평가 전 lock 해제는 이
closure의 격리 보장이 **작업 이후 구간에만** 성립한다는 뜻이다. 작업 자체는 커밋 `e270165`에
전부 남아 있다. lock 활성 구간에 수행한 것은 읽기 전용 조회뿐이다(`gh api` · `gh pr list` ·
`git show` · `git diff` · `cat | grep`).

### 조건별 판정 (측정 HEAD `e270165`)

| 조건 | 판정 | 근거 |
|---|---|---|
| V1 | 충족 | `V1 ok` — 적용·편집 후 재실행 |
| V2 | 충족 | `V2 ok 2` — 실제 `classifyEvidence` · 실제 registry open 대조 |
| V3 | 충족 | `V3 ready — Task 3 적용 가능` (2/2 봉인 내) |
| V4 | 충족 | `V4 ok` — `git -C` 종료코드를 먼저 검사하는 강화판(plan 원형의 공허 통과 결함을 피한 형태) |
| V5 | 충족 | `ok: no version declaration on this branch (merge-base with origin/main = 1.34.4)` |
| Task 3 dispose (2 fixed) | 충족 | `dispose --batch docs/ci-full-suite/m5-dispositions.jsonl` → `ok:true` · `appended 2` · `rejected []`. verify: fixed 1 → 3 · `open` 1740 → 1738 · invalid 0 · binding_mismatch 0 · unmatched 0 |
| SessionStart 억제 (plan Task 3 후속 확인) | 충족 | 두 id의 `suppressedFindingIds` false → true. `enumerateOpenFindings` 결과에서 부재 |
| PRD M5 행 complete | 충족 | `.claude/prds/ci-full-suite.prd.md` 5행 status `complete` + 정정 서술 |

### Task 3 트리거 편차 — 반올림하지 않는다

plan Task 3의 트리거는 "closure-accounting PRD M2 행이 `complete`로 main에 머지되고 V3가
`ready`"다. **첫 절은 적용 시점에 문자 그대로 거짓이었다** — main(`gh api` 판독)과
c11 커밋(`git show c11-closure-accounting:`) 모두 `in-progress`이고, `complete`는 c11 작업
트리의 미커밋 편집에만 있었다. 운영자는 이 사실을 고지받은 뒤 적용을 승인했다(판정 원장이
append-only라 되돌릴 수 없다는 점 포함). 트리거가 지키려던 실질 전제는 적용 직전에 각각
재확인했다: 봉인 포함(V3) · M2 라이브 재봉인 `after.denominator_gap.count 0` ·
c11 후속 변경(`debt-inventory.js` 분모 필터 1곳)이 batch 계약 무변경. 기록은
`docs/ci-full-suite/m5-findings-closure.md` §4.1.

## 반올림하지 않은 것

- **`open` 6건은 닫히지 않았다.** claim 원문 부재(§2.2)로 원장에 싣지 않았고 여전히 승입된다.
  M5 `done`은 "8건이 닫혔다"가 아니라 "재검증 · 입증분 적용 · c2 잔재 되돌림이 완결됐다"이다.
- **`verify`의 `ok`는 `false`다.** 원인은 `open === 0` 한 항뿐이고(`debt-inventory.js:922-924`)
  적용 전후 동일하다. closure-accounting M2 설계상 `open > 0`은 정상 상태다.
- **plan `## Acceptance` 2번(V3 `blocked`)은 문자 그대로 거짓이다** — 이전 run이 기록한 편차 그대로이며
  (`m5-findings-closure.md` §1) 이 run이 바꾸지 않았다.

## 이월

- **escalation** — STATE.md의 `decision: ci-full-suite-m5` `/mccp:santa-loop`는 이 closure와 별개로 열려 있다.
- **`open` 6건** — registry가 claim 원문을 보관하지 않는 구조(`findings-registry.js:71-104`)가 닫히기 전에는 개별 입증 불가.
- **closure-accounting M2 행 머지** — c11의 미커밋 `complete` 편집이 main에 도달하면 Task 3 트리거가 사후에 문자 그대로도 참이 된다.

## Provenance
- Lock run_id        : 586f78a0-4f8a-41a4-8fa8-9f35708d51b5
- Lock owner session : d110aa98-ab01-4cdd-bb08-8b362f4feba6
- Plan source        : .claude/plans/ci-full-suite-m5.plan.md
- Measured HEAD      : e270165
- Supersedes         : run 82e50880-662d-47c9-aba7-5fd246d1398c (verdict skipped, commit eee0c3b)
- Detection signal   : `{"availability":"available","goal_signal":true,"signal_ref":{"row":5,"name":"findings-closure","plan":".claude/plans/ci-full-suite-m5.plan.md","status":"in-progress"},"mode":"milestone-close","reason":"ok"}`
- Secret mask        : `maskSecrets` · hits 0
- mccp version       : 1.34.4
