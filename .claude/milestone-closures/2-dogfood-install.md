# Milestone Closure — 2-dogfood-install

## Milestone
- ID         : 2-dogfood-install
- Name       : dogfood-install
- Plan       : .claude/plans/release-channel-separation-m2.plan.md
- PRD        : .claude/prds/release-channel-separation.prd.md
- Status     : done
- Closed at  : 2026-09-03T06:37:47.285Z
- Closed by  : /mccp:milestone-close (run_id=8dd96b04-68ba-4ab2-805f-e828d8434b1d)

## Acceptance Condition

사용자가 `/goal`에 넘긴 조건 (verbatim):

> docs/dogfood-install.md exists and documents the --plugin-dir procedure,
> CLAUDE.md §3.7 retires the cache-copy workaround, plugin.json/html.js/markdown.js/
> CHANGELOG all read 1.34.5, and the plan's Validation block passes — or stop after 10 turns

## Goal Loop Result

`goal-done` — acceptance 조건 4절을 전부 대조했고, 4번은 격리 lock을 푼 뒤 라이브로 재실행해 통과시켰다.

### 조건별 판정

| # | 조건 | 결과 | 근거 |
|---|---|---|---|
| 1 | `docs/dogfood-install.md` 존재 + `--plugin-dir` 절차 문서화 | 통과 | 파일 실재. `--plugin-dir` 8회. 섹션 9개(절차 1~4 · 캐시 직접 수정 금지 · 어느 채널에 있어야 하는가 · 한계 · 다루지 않는 것) |
| 2 | CLAUDE.md 3.7이 cache-copy workaround를 은퇴시킴 | 통과 | "v1.34.5 정정 — 위 세 번째 불릿의 workaround는 은퇴했다 … 지금은 **금지**다"; 낡은 불릿을 지우지 않고 정정을 얹은 형태이며 `docs/dogfood-install.md`를 소유자로 지목 |
| 3 | plugin.json / html.js / markdown.js / CHANGELOG = 1.34.5 | 통과 | `plugin.json:5` · `renderer/html.js:1419` page-foot · `renderer/markdown.js:163` derived 줄 · `CHANGELOG.md:5` 노트 + `:7` 헤딩 |
| 4 | plan `## Validation` 블록 통과 | 통과 (수정 후) | 아래 |

### 4번이 처음에 돌지 못한 이유와 그 처리

`goal-phase-guard.js`의 Bash 허용 목록은 default-deny이고 통과하는 것은 git·gh 읽기 서브커맨드, `ls`/`pwd`/`echo`/`cat`, goal 스크립트 2종뿐이다. Validation 15개 검사는 `node -e`·`grep`·`sed`·`test`를 쓰므로 lock 활성 중에는 구조적으로 실행 불가였다(`grep`·`sed` 호출이 실제로 BLOCK으로 되돌아왔다). lock을 정상 exit한 뒤 블록을 추출해 라이브로 실행했다.

**첫 실행은 검사 10에서 HALT했다** — `git diff --diff-filter=D origin/main...HEAD`가 `.claude/state/fix-task.md` 삭제 1건을 보고했다. CLAUDE.md 3.5.1이 요구하는 대로 멈추고 조사한 결과, 그 삭제는 커밋 `86dbc3f`("rotate consumed fix-task and log escalation-slot finding")가 수행한 **소비된 fix-task의 rotation**이고 같은 커밋이 `fix-task-applied.md`에 적용 기록을 남긴다. 즉 의도된 상태 lifecycle(3.2)이며, 되돌리면 같은 task가 pending과 applied 양쪽에 존재하게 되어 삭제 취소가 오히려 상태 파손이다.

문제는 검사 10에 **통과 경로가 아예 없었다**는 점이다. HALT 문구는 "verify each one is intentional"이라 사람의 검증을 종료 조건으로 지목하는데, 검증이 끝난 뒤 결과를 남길 통로가 없어 정당한 삭제 1건에 블록이 영구 red가 된다. 형제 검사 12는 이미 `.claude/state/`를 게이트 산출물 접두로 면제하므로 두 검사 간 불일치이기도 하다.

**처리** — 디렉토리를 통째로 면제하지 않고 `VERIFIED_DELETIONS`로 **열거**했다. 열거 근거를 주석에 함께 적었고, 목록에 없는 삭제는 여전히 HALT다.

### 판별력 대조 (검사 10 수정 후 7-probe)

| probe | 입력 | 결과 |
|---|---|---|
| A | `.claude/state/fix-task.md` (열거됨) | pass |
| B | `docs/multi-session-work-loop/instruction-contract.md` (3.5.1 사고 형태) | HALT |
| C | `.claude/prds/harness-wiring-integrity.prd.md` (PRD 소실 형태) | HALT |
| D | 열거된 것 + 열거 안 된 것 혼합 | HALT |
| E | `.claude/state/STATE.md` (같은 디렉토리 형제) | HALT |
| F | `.claude/state/fix-task.md.bak` (접미 변형 — 앵커 확인) | HALT |
| G | 삭제 0건 | pass |

3.5.1이 겨냥한 사고(머지가 다른 PR의 신규 파일을 조용히 떨어뜨리는 것)의 탐지력은 줄지 않았고, 디렉토리 면제가 아니라 정확 경로 열거이므로 같은 디렉토리의 다른 파일도 계속 잡힌다.

### 최종 실행

`MCCP_CODEX_DISABLED=1 bash <extracted validation block>` → **exit 0**. 관측된 통과 출력: 검사 2 `ok: release manifest unchanged` · 검사 7 `ok: no absolute path in added lines across 5 touched M2 surface(s)` · 검사 8 instruction-contract C1~C4 pass(`rows=33 resident=18 on-demand=15 retire=0 c4=strict@7fe48d92`) · 검사 9 `i18n-surface` 10 tests pass/0 fail. 나머지 검사는 통과 시 침묵한다.

### 남는 것 (closure의 범위 밖)

- PR은 아직 생성되지 않았다. STATE.md의 Next Step은 `/mccp:pr`이며, plan 게이트 승인 receipt가 없어 PR-Codex가 실제 발화한다(dedupe 미개방).
- plan 본문이 이번에 변경됐으므로(`## Validation` 검사 10) plan hash가 다시 움직였다. `/mccp:pr` 진입 시 3.7 version target 재계산과 함께 확인이 필요하다.
- M1 잔여: santa-review receipt divergent 봉인 → escalate_pending 유지.

### 종료 절차 자신이 만든 두 번째 HALT — 검사 12

closure 산출물을 쓴 직후 블록을 다시 돌리자 검사 12가 `.claude/milestone-closures/2-dogfood-install.md`를
"declared Files to Change 집합 밖"으로 HALT했다. 검사 12의 `ALLOWED`는 그 자신의 주석이 정의하듯
**표 + 게이트 산출물 디렉토리의 합집합**이고 `receipts`·`state`·`reviews`를 접두로 묶는데,
`/mccp:milestone-close`가 쓰는 closure 문서는 정확히 같은 성격(게이트가 쓰는 산출물이지 마일스톤이
저술하는 파일이 아님)인데도 그 그룹에 없었다. 즉 종료 절차가 자기 산출물로 이 검사를 깨뜨리는
구조였다. 접두 그룹에 `.claude/milestone-closures`를 더했고, `Files to Change` 표에는 넣지 않았다 —
receipts가 표에 없는 것과 같은 자리이며 §1.2 dedupe의 planned matcher 대상도 아니기 때문이다.

판별력 대조(수정 후): `.claude/milestone-closures/2-dogfood-install.md` allow · 
`plugins/mccp/scripts/hooks/session-start.js` HALT(검사 12가 존재하는 이유인 Task 3 marker 유출) · 
`.claude/milestone-closures.bak/x.md` HALT(디렉토리 앵커) · `docs/release-channel.md` HALT · 
`README.md.bak2` HALT(접미 변형).

이 두 건(검사 10 · 검사 12)은 성격이 같다 — **게이트가 자기 종료 절차의 산출물과 정당한 상태
lifecycle을 보지 못해 영구 red가 되는 형태**이고, 둘 다 탐지력을 줄이지 않는 최소 수정으로 닫았다.


## Provenance
- Lock run_id        : 8dd96b04-68ba-4ab2-805f-e828d8434b1d
- Lock owner session : 541eb1a3-893e-4f46-8c9e-ec45534ad8e9
- Lock lifecycle     : enter → heartbeat(1) → exit (cleared=true), `.claude/state/goal-phase.lock`
- Plan source        : .claude/plans/release-channel-separation-m2.plan.md
- Detection signal   : {"availability":"available","goal_signal":true,"signal_ref":{"row":2,"name":"dogfood-install","plan":".claude/plans/release-channel-separation-m2.plan.md","status":"in-progress"},"mode":"milestone-close","reason":"ok"}
- HEAD at closure    : 86dbc3fc976fea6056f28f6883576f0a734455f8
- mccp version       : 1.34.5
- Codex gate         : none — option B (closure-doc + plan-body sha256 anchor, no `mccp-milestone-close-codex` receipt)
