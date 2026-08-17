# Milestone Closure — session-process-reclaim-m3

## Milestone
- ID         : session-process-reclaim-m3
- Name       : 출하 + 잔여 정리
- Plan       : .claude/plans/session-process-reclaim-followup.plan.md
- Status     : done
- Closed at  : 2026-08-17T07:13:25.851Z
- Closed by  : /mccp:milestone-close (run_id=36f0cc99-32a4-46ae-9849-9d237a2d529e)

## Acceptance Condition

plan `## Acceptance` 9항목 — (1) Task 1~12 완료 · (2) Validation 1~10 + Task별 `Validate` 통과,
전체 suite는 6a 기준선 대비 신규 실패 0 · (3) PRD 1차 지표 관측(표본 1, `pidAlive(pid)===false`) ·
(4) **머지 후 재검증** — PR이 main에 머지된 뒤 main에서 reclaim 5 suite 재실행해 0 fail ·
(5) 패턴 미러링(`freePort()`·state-writer API·§3.7 forward-only) · (6) 게이트 1회 완주 — PR 1건 이상 ∧
`mccp-pr-codex` receipt 존재 ∧ ship 판정이 no-ship 아님 ∧ `pr_codex_force_override` 계열 키 부재 ·
(7) **`git ls-tree origin/main -- …/session-processes.js`가 비어 있지 않다**(= main 도달) ·
(8) `escalate_pending`이 최종 false/미출력이고 그 앞에 R3 backlog 행이 실재 ·
(9) version 충돌 게이트가 산출물(`version-gate.txt`)로 판정되고 branch version과 일치.

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).
조건별 판정은 아래 `## Goal Loop Result`가 갖는다 — **(4)와 (7)은 본 closure의 `Closed at`
시점에 미충족이었고, 운영자가 그것을 고지받은 뒤 머지를 기다리지 않고 종료를 선택했다.**

## Goal Loop Result

verdict=done. 운영자 응답: "머지 없이 M3를 complete로 기록" (AskUserQuestion 선택지).

**라이브 `/goal` loop은 돌리지 않았다.** `goal-detect`는 `availability=available` ∧ `goal_signal=true`
∧ `signal_ref={"row":3,"name":"출하 + 잔여 정리","plan":".claude/plans/session-process-reclaim-followup.plan.md","status":"in-progress"}`
를 냈으나, acceptance 미충족 사실을 먼저 고지한 결과 운영자가 종료를 직접 판정했으므로 평가할
condition이 남지 않았다. 격리 lock은 실제로 enter/exit했고(`cleared:true`) 그 사이에 turn이
없었다. 이 사실을 숨기지 않고 기록한다 — closure의 감사 가치는 verdict가 아니라 그 verdict가
무엇을 보고 내려졌는지에 있다.

### 미달 항목 — 둘이고, 둘 다 같은 원인이다

원인은 하나다: **PR #142가 머지되지 않았다.**

- **(7) main 도달 — 미충족.** 2026-08-17 실측:
  `git ls-tree origin/main -- plugins/mccp/scripts/lib/session-processes.js`가 **빈 출력**이다.
  `origin/main` tip은 `767a2c7` "feat(v1.26.2): santa-adjudication M1 …"이고, 이 브랜치는
  origin/main 대비 27 커밋 앞·0 뒤다.
- **(4) 머지 후 재검증 — 미충족.** (7)이 성립하지 않으므로 실행 자체가 불가능하다. plan의 문언은
  "파일 존재(`git ls-tree`)는 존재 확인이지 동작 확인이 아니다 — 충돌 해소가 test를 조용히
  퇴행시켰다면 그것은 여기서만 잡힌다"이다. **그 검증은 여전히 수행되지 않았다.**

PR #142 자체는 머지 가능 상태였다 — `state=OPEN` · `mergeable=MERGEABLE` · `mergeStateStatus=CLEAN` ·
체크 2건(`ubuntu-latest`/`windows-latest` — gitignore canonical drift gate) 전부 `SUCCESS`.
즉 막힌 것이 아니라 **머지가 일어나지 않은 채로 닫혔다.**

### 충족을 실측으로 확인한 항목

- **(6) 게이트 1회 완주 — 충족.** PR #142 존재. `.claude/receipts/mccp-pr-codex/session-process-reclaim-followup.json`
  존재(git-tracked 감사 corpus, §3.12). `pr_codex_force_override` 계열 키 **부재**(`meta`에
  `pr_codex` 매칭 키 0건) — 즉 ship gate는 **우회된 것이 아니라 통과했다**. receipt의
  `resolution.codex_verdict='skipped'`이고 그 증명은 `meta.codex_disabled_at_pr=true` +
  `codex_skip_reason='codex_disabled'`(§3.5 M1 SKIP_PROOF 축)다. 나머지 override 2종도
  전부 미사용 — `security_force_override=false` · `impeccable_force_override=false` ·
  `security_skipped=false`.
  - **이 receipt가 봉인한 것은 심사가 아니라 심사의 부재다.** Codex는 user-level env 정책
    (`MCCP_CODEX_DISABLED=1`)으로 발화하지 않았다. cross-model 심사 횟수는 이 milestone 전체에서
    **0회**이며, same-model security 심사 2회(CRITICAL/HIGH 0)는 그것을 대신하지 않는다.
- **(9) version 게이트 — 충족.** `$(git rev-parse --git-path mccp/tmp)/version-gate.txt`가
  `version gate OK: branch=1.27.0 main=1.26.2`를 담고 있고, 현재 `plugin.json`의 version이
  `1.27.0`으로 **일치**하며 `1.27.0 != 1.26.2`다(stale 아티팩트 아님). §3.7 forward-only의
  7번째 재발 — 머지 *도중* main이 1.26.1 → 1.26.2를 발행해 target이 한 칸 더 밀렸다.
- **(8) `escalate_pending` — 실질 충족, 순서 guard는 미실행.** 현 STATE.md에 플래그 출력이
  없고 R3 항목은 backlog에 열린 채로 실재한다. 다만 plan Task 9가 만들려던 *순서* 증거는
  얻지 못했다 — `dfd18f4`가 담고 있던 `escalate_pending: true`를 이 plan 범위 밖의 이전 세션
  write(`d034ba2`)가 R3 backlog 행이 생기기 전에 이미 지웠기 때문이다. 플래그를 복원했다
  다시 지우는 가짜 순서는 만들지 않았다. `plan-conflict-detector` 판정은 `conflict:false`
  (minor deviation).

### 종료 시점에 새로 관측된 것 — ship receipt가 stale-head다

`node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr --check-ship-verdict`가
`ok:false`를 내며 blocking 1건을 보고한다:

```
kind: ship-gate-stale-head
receipt head_sha 99c8be8… != current HEAD 327428c…
(stale receipt for an older commit — the current diff was not reviewed). push blocked.
prior_verdict: skipped
```

**이것은 본 closure가 만든 것이 아니다.** receipt는 `99c8be8`을 anchor하는데 그 위에 이미
`28b2e9c`(evidence 커밋) · `45f42a4`(anchor 정정) · `e0550cf`(state 기록) 3건이 얹혀 있었고,
본 세션의 정리 커밋이 4번째가 됐다. 의미는 명확하다 — **PR #142에 추가 push를 하려면 ship
게이트를 다시 통과해야 한다.** 현재 열려 있는 PR의 diff 중 receipt가 심사한 범위는 `99c8be8`
까지다.

### `Status: done`이 뜻하는 것과 뜻하지 않는 것

`done`은 「구현·게이트 완주·version 게이트·backlog 이연이 확인됐고, main 도달과 그 뒤의 재검증
두 항목은 운영자가 머지를 기다리지 않기로 하여 미충족인 채 종료됐다」는 뜻이다.

「plan의 모든 문언이 이 문서가 쓰이는 순간 충족돼 있었다」는 뜻이 **아니다.** 특히
**PRD의 Hypothesis는 이 종료로 검증되지 않았다** — PRD 본문이 이미 적어 둔 대로 "main에 없는
코드로는 검증될 수 없"고, 코드는 여전히 main에 없다. 전자를 후자로 적으면 closure가 자기 stamp
시점에 대해 거짓을 말하게 된다.

### 종료 이후에도 남는 일

이 milestone이 닫혔다고 사라지지 않는 항목이다. PRD가 아카이브되므로 **활성 대시보드 스캔에서
빠진다** — 그래서 여기 남긴다.

1. **PR #142 머지.** 머지 가능 상태이며 체크는 green이다. 단, 위 stale-head 때문에 추가 push가
   필요하면 `/mccp:pr` 재진입이 선행돼야 한다.
2. **머지 후 main에서 reclaim 5 suite 1회 재실행** — acceptance (4). 파일 존재는 동작 확인이
   아니다.
3. **PR-Codex R3 미해소(HIGH)** — `dashboard-server.js:643-645`가 reuse 레코드 기록 실패 시
   경고만 하고 `reused:true`를 반환. backlog에 열린 채 등재됨(Task 9).
4. **cross-model 심사 0회** — 위 (6) 참조.
5. **POSIX symlink 봉쇄 test 2건이 win32에서 skip** — §D4 주장은 플랫폼 무관인데 검증은 아니다
   (backlog MEDIUM).

## Deviation — plan-body anchor를 싣지 않았다

`/mccp:milestone-close` Phase 4는 이 closure의 sha256을 plan 본문 `## Milestone Closure
Provenance` 섹션에 stamp할 것을 의무화한다(option B custody anchor). **이 milestone에서도 그
stamp를 싣지 않았고, 그 사실을 여기 기록한다.**

이유는 [santa-adjudication-m1.md](santa-adjudication-m1.md)가 A/B 실측과 함께 확정한 것과
동일하다 — stamp는 plan 본문을 바꾸므로 `mccp-plan-codex`·`mccp-implement-codex` receipt의
`plan_hash`가 어긋나고, 그 stale은 `MCCP_RECEIPT_GATE_MODE=soft`로도 통과되지 않는다(soft는
missing만 통과시킨다). 본 브랜치는 같은 이유로 M3 게이트 기록 자체를 plan 본문이 아니라
[.claude/notes/session-process-reclaim-followup-implement-gate.md](../notes/session-process-reclaim-followup-implement-gate.md)에
두는 회피를 이미 채택한 상태였다.

여기에는 이 milestone 고유의 사유가 하나 더 있다: **plan은 본 closure 직후 `/mccp:archive-complete`로
이동된다.** stamp를 싣고 곧바로 파일을 옮기면 anchor는 어차피 경로를 잃는다.

잃은 것은 "closure 본문이 변조되면 다음 게이트의 plan_hash mismatch로 검출된다"는 메커니즘이고,
남은 것은 **git**이다 — 이 디렉토리는 git-tracked이므로 본문이 커밋으로 봉인되고 변조는 diff로
드러난다. 저장소가 이미 아는 결함이며([codex-findings-backlog.md](../plans/codex-findings-backlog.md)
2026-08-16 HIGH 행), 권고된 진짜 수정은 closure sha256을 plan이 아니라 receipt `meta`에 싣는
것이다 — 본 이탈은 그 방향과 같다.

## Provenance
- Lock run_id        : 36f0cc99-32a4-46ae-9849-9d237a2d529e
- Lock owner session : unknown
- Plan source        : .claude/plans/session-process-reclaim-followup.plan.md
- Detection signal   : {"row":3,"name":"출하 + 잔여 정리","plan":".claude/plans/session-process-reclaim-followup.plan.md","status":"in-progress"}
- mccp version       : 1.27.0
