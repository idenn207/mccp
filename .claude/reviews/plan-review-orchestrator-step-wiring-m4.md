# Plan Review Panel — orchestrator-step-wiring-m4

**Plan**: `.claude/plans/orchestrator-step-wiring-m4.plan.md` · **Plan version**: `sha256:4284fe6a03e7ca2e53971d53a0c789a161cd668547ae6d3ac493e7420aa45b21`
**Verdict**: `divergent` via `hybrid`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=true
**Layers**: L1 converged · L2 converged · L3 divergent
**Halted at**: `5.2e`

> Reason: L1+L2 converged but L3 (Codex) returned divergent

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | LOW | DD8 says the second banner line gives the operator the action that makes the locations converge, but the path it prints is relative to the plugin root. In a user repo (or the repo root) nothing exists at that relative path, so the suggested action cannot be copied and run as written. | Plan Task 3 step 3: "수렴: scripts/migrations/msw-events-common-dir.js" and "경로는 plugin-root 상대라". The plan's own Acceptance runs the tool as `node plugins/mccp/scripts/migrations/msw-events-common-dir.js`, i.e. from the repo root. |
| security | LOW | Task 2의 격리 스니펫에는 신뢰 경계를 넘을 여지가 없지만, 파일 수 기준 서명이 좁다. 서명은 session_id/producer/kind 세 필드만 대조하므로 이론적으로는 같은 모양의 실제 이벤트가 섞여 함께 옮겨질 수 있다. 다만 실제 세션 id는 's1'이 아니고 옮긴 파일은 삭제가 아니라 `.quarantine/` 격리이므로, 데이터 손실로 이어지는 경로가 없다. | plan L188 필터 `e.session_id==="s1"&&e.producer==="receipt-prompt"&&e.kind==="task_started"` · DD6 'mv 1회로 되돌림' |
| test | MEDIUM | Task 1's new assertion only proves nothing was written to the real shared corpus. It never shows the hook still emitted into the temp repo. In a bare `git init` tmpdir with no `.claude/settings.json`, `/mccp:pr` likely takes the blocked path or resolves to a `'default'` decision, and the hook emits nothing on either path. So the test would also stay green if emission broke entirely, and the original assertion of test (d) that the gate really fires in this repo is quietly weakened. The revert check (cwd back to `process.cwd()` turns red) does hold, so the contamination fix itself can be refuted. | plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js:53 comment says the command needs prior receipts, so this repo gives a real verdict. plugins/mccp/scripts/hooks/receipt-prompt.js:184-186 (no emit on the blocked path) and :208 (the 'default' decision returns early). Plan Task 1 adds only the assertion that the real-repo file does not exist. |
| test | LOW | Task 3 check (e) says the field leaves numerator, denominator and value unchanged, measured as 'the same value as before the field was added'. That baseline cannot be captured once the field exists, so the check has no fixed oracle unless literal expected numbers are written into the test. | Plan Task 3 Validate (e): the fixture from (a) must give the same values as before the field was introduced. |
| test | LOW | Task 2's Validate line is the migration snippet itself, not a check of it. Nothing confirms the reader's A1 numbers dropped after quarantine, except a manual Acceptance note. | Plan Task 2 Validate block (the node -e rename script) and the Acceptance line asking to record the denominator drop. |
| invariant | LOW | Task 3 can raise a wrong 'this location only' warning when the shared directory resolves but cannot be read (EACCES on stat, or one shard fails to read). In that case the shared key set stays empty, so every local A1 event counts as local-only. The error falls on the loud side and the separate `degraded` flag is already set, so no gate opens. No test covers the case where the signal and `degraded` both appear. | plugins/mccp/scripts/derive/sources/session-activity.js:148 sets sharedDir before the probe; :183 sets degraded but only skips the candidate; the plan says `a1_local_only_events = sharedDir ? \|local − shared\| : null` (Task 3.1) |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 1) Checked the Task 3 key-collection point against the scan loop at plugins/mccp/scripts/derive/sources/session-activity.js:218-244. The dedupe `continue`s are at :236 and :240, so collecting keys before them is possible. `dirIsShared` exists at :220 and `sharedDir` at :141-160. The third candidate at :162 is cwd-local with shared:false, so it lands in the local set, which is correct. 2) Checked DD4. When the shared dir is resolved but absent, the stat loop at :180-184 skips the dir while `sharedDir` stays non-null. `\|local − shared\|` then counts every local event, as the plan claims. 3) Checked DD3's claim that its key matches the migration's. `keyOf` and `legacyKeyOf` at plugins/mccp/scripts/migrations/msw-events-common-dir.js:49-56 match the reader's `legacyKeyOf` at session-activity.js:216. 4) Checked the Task 4 citations. work-orchestrator.js:631-636 narrows `reason` but stores the result of `resolveWorkUnit` unnarrowed. `safeField` at :355-357 is defined through `narrowReason`, so the mirror is real. 5) Checked the Task 5 citation. cli.js:346-350 does leak `err.message` right under the F9 comment. The catch block at work-orchestrator.js:639-646 is the pattern the plan says it is. 6) Checked layering. The new field is present-only and flows from the scan through `computeA1` to the CLI. The reader still does no I/O side effects (DD2 rejects migration from the reader), and the numerator/denominator are untouched (Validate e). Nothing structural rose above LOW. |
| security | pass | 1) Task 4 `safeField`가 정말 절대경로를 지우는지 확인했다. work-orchestrator.js:331-357의 narrowReason은 scrubControl, scrubAbsPaths, oneLineExcerpt를 차례로 거치고, mask.js:87-91은 repoRoot와 상관없이 ABS_PATH_TOKEN_RE에 맞는 모든 토큰을 치환한다. 그래서 '/home/someone/...' 누출 시나리오는 막힌다. 2) Task 5는 `scrubAbsPaths(msg, process.cwd())`를 쓰는데 fx.main이 cwd 밖의 tmp 경로라도 같은 정규식이 토큰 단위로 가린다. Validate 단언을 통과할 수 있으므로 거짓 주장이 아니다. require가 실패하면 'unreportable'로 떨어져 원문이 새지 않는다. 3) Task 3의 둘째 줄은 plugin-root 상대 경로 리터럴과 숫자만 담는다. 사용자 제어 문자열이 배너로 들어가는 주입 경로는 없다. 4) Task 1은 hook을 임시 git 저장소 cwd에서, 매 실행마다 다른 sid로 띄운다. 그래서 실제 공유 corpus를 더는 오염시키지 않고, sid는 SESSION_ID_RE 허용 문자 집합 안에 있다. 5) Task 2의 격리 대상은 git common dir 아래 추적되지 않는 경로라 git-tracked 산출물로 새지 않는다. 한 줄이라도 서명과 다르면 전체를 거부한다. 6) 게이트 판정 필드, override, 봉인 필드는 하나도 건드리지 않는다(UI3). 따라서 권한 상승이나 부분 상태를 믿는 경로가 없다. HIGH 이상의 결함은 찾지 못했다. |
| test | pass | Read the plan. Checked whether Task 5's preload interception can work: cli.js:319 requires session-activity inside the try, and the catch at :346-350 passes err.message through unchanged, so the fault can be injected and the check can fail before the fix. Read receipt-prompt.js:204-248 to see whether Task 1's test is vacuous: its revert check holds, but it no longer shows the hook still emits. Checked that Task 3's checks (b) and (c) would catch the dedupe-order and kind-filter bugs named in the plan's Risks. Checked that the Validation command runs the test files for every edited source file: all edited sources have a test there, and Task 6 is checked with derive run. Found no untested load-bearing claim of HIGH or CRITICAL severity. |
| invariant | pass | This plan changes only measurement and display (UI3). I looked for any spot where a check that used to block now lets things through. 1) Task 3 null/degraded directions: I read session-activity.js:141-190 and checked resolution error, resolver throw, a shared dir that is missing vs unreadable, and non-git input. None of these approves anything or changes the A1 numerator or denominator. The worst case is a wrong warning on the loud side (LOW). 2) Task 3 dedupe ordering: the plan requires keys to be collected before the `continue` at :236/:240, and Validate (b) catches the wrong order. 3) Task 5 catch: exit 0 fail-open was already there (UI4). The change only narrows the message, and the case where require fails ends in 'unreportable' rather than printing the raw message. 4) Task 2 quarantine: it moves nothing unless every line matches the test signature, it keeps the data rather than deleting it, and undoing it is a single mv. An empty file is moved without harm. It does not touch any receipt or hash. 5) Task 4 safeField: this narrows input at write time. Existing test (5) pins the slug join key, so the join cannot silently change. 6) Gate anchoring: DD7 moves the decision slug to -m4 because the PRD-slug ledger already hit its cap. That keeps receipts tied to the new plan text and does not reuse or re-key a sealed receipt. I found no receipt schema, digest or ship-gate change. 7) Rollback: every code change sits in a CLI or derive reader, so reverting the code restores the old behaviour, and the data move can be undone with mv. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "hybrid",
  "layers": {
    "l1": "converged",
    "l2": "converged",
    "l3": "divergent"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": true
  },
  "wall_clock_ms": 315501,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:4284fe6a03e7ca2e53971d53a0c789a161cd668547ae6d3ac493e7420aa45b21",
  "plan_path": ".claude/plans/orchestrator-step-wiring-m4.plan.md",
  "recorded_at": "2026-09-14T04:46:57.833Z"
}
```
