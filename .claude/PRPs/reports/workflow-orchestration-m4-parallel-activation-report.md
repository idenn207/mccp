# Implementation Report: workflow-orchestration M4 — 병렬 활성화 (worktree-merge live)

## Summary

PRD `workflow-orchestration`의 마지막 milestone. M2b/M3가 build+unit-test로 완비하되 cost hard-ceiling으로 미실측이던 **live harness 상관(Workflow worktree↔dispatchId)**을 live dogfood로 empirical 입증하고, `MCCP_WORK_MERGE_STRATEGY` default를 `disable-parallel`→`worktree-merge`로 flip해 N-worker 병렬 implement를 해금했다. `plugin.json` `1.20.15 → 1.21.0` (PRD 전체 완료 minor).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (dogfood-surfaced `-uall` 결함 1건 추가 흡수) |
| merge_strategy | worktree-merge(입증) / disable-parallel(미입증) | **worktree-merge (PROVEN)** — 2회 live dogfood |
| correlation 메커니즘 | seed-required / harness-copy / unproven | **seed-required** (parent placeholder 미복사, gitignored) |
| Files Changed | 10 (plan) | 12 (+ backlog append, standard) |

## Live Empirical Evidence

| Run | 목적 | 결과 |
|---|---|---|
| wf_1f689994-fb8 | Task 0 topology probe (2 isolation:'worktree' agents) | worktree=`<repo>/.claude/worktrees/wf_<runId>-<N>` · 컨트롤러 enumerable·잔존 · dispatches dir ABSENT(seed-required) · mark ENOENT without seed · collect missing without seed |
| wf_98047bb7-1b1 | Task 4 happy-path (2 seeding workers) | seedCreated=true·markOk=true 양쪽 · collect WITH seed→correlate(map 2/2, missing 0) · reconcile worktree-read→ok · merge-apply applied:2 · integrated OK · rollback-apply reversed:2→parent clean |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | live correlation dogfood spike | [done] | merge_strategy=worktree-merge PROVEN, seed-required |
| 1 | seed-envelope + worker prompt first-step + F2 정규화 | [done] | `seedEnvelope` idempotent + `resolveEnvelopePathForWorktree` |
| 2 | reconcile terminal envelope worktree-read | [done] | map 있으면 worktree read, 없으면 parent fallback |
| 3 | merge-apply rollback hole(F1) + default flip + work.md wiring | [done] | patches-out 실패 시 rollbackApplied → parent clean |
| 4 | dogfood 재현 5 scenarios + honest 검증 | [done] | happy live + 2-5 결정적 test |
| 5 | 버전·문서·PRD·backlog | [done] | 1.21.0 + CLAUDE.md/CHANGELOG/PRD/footer 동기 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit Tests (M4-relevant) | [done] Pass | dispatch-cli 59 · dispatch-envelope 42 · implement-dispatch 200 = **301 green** |
| Live dogfood (happy-path) | [done] Pass | seed→mark→collect→reconcile→merge-apply→integrated→rollback 전 체인 |
| Full-suite regression | [done] No new failures | full-parallel `node --test`의 pre-existing red 4개는 M4 무관(아래) |

### Pre-existing failures (M4 무관, 정직 기록)

full-parallel `node --test`(222 파일)에 M4 무관 pre-existing red 4개 — 전부 origin/main과 diff 0인 파일:
- `pr.md:165` validate-callsite-lint `--plan` 누락 (601f629 v1.20.3 #86 이래 불변). backlog 기록.
- module-load hook test 3개(receipt-prompt/receipt-skill) — **standalone 실행 시 통과**, full-parallel concurrency-flaky. 이전 세션(p6)에도 pre-existing 확인.

M4 신규 실패 **0**.

## Files Changed

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/dispatch-envelope.js` | UPDATED | `seedEnvelope` idempotent 헬퍼 |
| `plugins/mccp/scripts/lib/dispatch-cli.js` | UPDATED | `seed-envelope` 서브커맨드 · `resolveEnvelopePathForWorktree`(F2) · mark 정규화 · reconcile worktree-read(Task 2) · merge-apply F1 rollback · collectChangedFiles `-uall` · worker prompt seed first-step |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | UPDATED | M4 회귀 7 test(seed/F2/prompt/reconcile-worktree/F1/-uall) |
| `plugins/mccp/commands/work.md` | UPDATED | merge_strategy default flip + gate-parallel 문서 |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATED | Decision-order 주석 sync (상수 무변경) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.20.15 → 1.21.0 |
| `CLAUDE.md` | UPDATED | §1.4 표 1행 + §4 토글 default |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer v1.21.0 |
| `CHANGELOG.md` | UPDATED | [1.21.0] |
| `.claude/prds/workflow-orchestration.prd.md` | UPDATED | M4 complete + M2/M3 gated 축 종료 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | pre-existing pr.md lint 기록 |

## Codex 흡수 (plan-time)

- **F1**: merge-apply patches-out write 실패 rollback hole 폐쇄 (parent 복원, patch-scoped).
- **F2**: seed/mark worktree-root(`git rev-parse --show-toplevel`) 정규화 + 하위 assert.

## Deviations from Plan

- **`collectChangedFiles` `--untracked-files=all` 추가** (plan 미명시) — Task 4 happy-path live dogfood이 노출한 실제 결함: default `--porcelain`가 untracked 신규 디렉토리를 `dir/`로 축약해 file-level partition과 false partition-escape. dogfood 없이는 발견 불가했던 축으로, Task 4의 목적(honest 검증)에 부합해 흡수 + 회귀 test.

## Notes

- **cost-state**: Task 0/4 live dogfood을 위해 cost-state를 임시 green으로 리셋(사용자 확정) 후, dogfood 완료 시 원본($314.50/critical, hard_ceiling)으로 **원복**. 백업은 scratchpad.
- **plan 아카이브**: §3.11 관례상 완료 plan은 `.claude/plans/`에 유지(ECC default `completed/` 이동 대신). PRD 전체 완료 → `/mccp:archive-complete` 대상(별도 human-gate).

## Next Steps
- [ ] `/mccp:prp-commit` — M4 변경 커밋
- [ ] `/mccp:pr` — PR 생성 (PR-Codex; cross-gate dedupe 후보 — plan+implement 양 게이트 converged)
- [ ] (선택) `/mccp:archive-complete` — PRD 전체 완료 → PRD+plans archived/ 이동
- [ ] (별도 cycle) pr.md:165 validate-callsite `--plan` 추가 (backlog)
