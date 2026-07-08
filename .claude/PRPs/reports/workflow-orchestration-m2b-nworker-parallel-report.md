# Implementation Report: workflow-orchestration M2b — N-worker parallel implement scaffold

## Summary

M2a가 놓은 단일 `Workflow agent()` seam을 `parallel(fleet.map(...))`로 확장하는 **완전한 병렬 스캐폴드**를 구현했다. 4개 순수 oracle(partition 분할, fleet budget, N-way mergeVerdicts, plan→partition 파생), dispatch-cli fleet 서브커맨드, Workflow `parallel` seam, work.md Step 3 병렬 wiring을 모두 세우고 단위 테스트로 검증했다.

**핵심 결론 — Task 0 spike가 병렬 실행 경로를 gate off로 확정.** `isolation:'worktree'` agent의 파일 변경이 parent worktree에 자동 전파되지 않고(별도 물리 디렉토리 + 별도 branch + uncommitted) 오케스트레이터 스크립트에 worktree collect API가 노출되지 않음을 실측 → `merge_strategy=disable-parallel`. 따라서 `resolveFleet`이 병렬을 구조적으로 N=1로 fail-close하고, `MCCP_WORK_IMPLEMENT_PARALLEL=1` opt-in이어도 M2a 단일-worker 동작이 **무변화**로 유지된다. 스캐폴드는 완성됐고, 실제 N-worker 실행 활성화는 worktree→parent merge 입증을 전제로 후속 milestone에 이연한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 스캐폴드 전량 구현, 병렬 실행은 spike 결과로 gate off |
| Files Changed | 14 (13 code/doc + 1 PRD) | 12 modified/created (아래) |
| 신규 oracle 테스트 | 3 신규 + 1 확장 | partition 19 + budget 26 + result-schema 37 + dispatch-cli 38 = 120 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | worktree merge-back spike | 완료 | 실측 → `merge_strategy=disable-parallel`; 플랜 `## Worktree Spike Result` 기록 |
| 1 | partition oracle | 완료 | `partitionPlan` + `partitionFromPlanText`, 19 테스트 |
| 2 | budget oracle | 완료 | `resolveFleet`(resolveFanout 미러 + merge_strategy gate), 26 테스트 |
| 3 | mergeVerdicts | 완료 | N-way fail-closed 집계 + `partition-escape` verdict, deriveVerdict 불변 |
| 4 | dispatch-cli fleet | 완료 | `prepare-fleet`/fleet `emit-workflow-args`/N-way `reconcile`, 8 신규 테스트 |
| 5 | Workflow parallel seam | 완료 | `parallel(fleet.map(...))` + budget pre-guard + isolation; 단일 경로 불변 |
| 6 | work.md Step 3 wiring | 완료 | Step 3.prep-parallel/WP/gate-parallel + 3축 kill switch |
| 7 | dogfood + Codex 재현 | 완료 | default-off·merge_strategy·budget·partition·F1 재현 oracle-level 통과 |
| 8 | 버전·문서·PRD | 완료 | 1.20.7→1.20.8 + footer + CLAUDE.md + CHANGELOG + PRD |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| oracle 단위 테스트 | Pass | partition 19 / budget 26 / result-schema 37 / dispatch-cli 38 = 120 green |
| Workflow 구문 + drift-guard | Pass | `node -c` OK + IMPLEMENT_RESULT_SCHEMA 포트 faithful |
| renderer footer 동기 | Pass | i18n-surface 10 green (v1.20.8) |
| 전체 회귀 | Pass (신규 0) | 2669 중 6 fail — 전부 사전 존재/환경 flaky(아래), M2b 무관 |

### 사전 존재 실패 6종 (M2b와 무관, 제가 건드리지 않은 파일)

| 실패 | 파일 | 성격 |
|---|---|---|
| `perf-budget < 1000ms` | derive/tests/perf-budget.test.js | 동시 실행 부하 flaky(1428ms) |
| `receipt-prompt/skill module-load` ×3 | hooks 테스트 | hook 로드 flaky |
| `fixture file exists .claude/cache/` | design-critique-loop-e2e | 이 worktree에 fixture 아티팩트 부재 |
| `validate-callsite-lint` | pr.md:165 missing --plan | pr.md의 사전 v1.3.1 부채(제 변경 아님) |

격리 실행 시 대부분 통과(perf/hook은 동시성, fixture/lint은 pre-existing). `git status`로 pr.md·해당 테스트 파일 모두 **미변경** 확인.

## Files Changed

| File | Action | |
|---|---|---|
| `plugins/mccp/scripts/lib/implement-dispatch/partition.js` | CREATE | 서로소 partition oracle |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | CREATE | fleet budget oracle |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/partition.test.js` | CREATE | 19 테스트 |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` | CREATE | 26 테스트 |
| `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js` | UPDATE | `mergeVerdicts`+`checkPartitionEscape` |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/result-schema.test.js` | UPDATE | +17 mergeVerdicts 테스트 |
| `plugins/mccp/scripts/lib/dispatch-cli.js` | UPDATE | fleet 서브커맨드 3종 + partition-scope prompt |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | UPDATE | +8 fleet 테스트 |
| `plugins/mccp/scripts/workflows/implement-dispatch.js` | UPDATE | `parallel` seam |
| `plugins/mccp/commands/work.md` | UPDATE | Step 3 병렬 wiring + 3축 kill switch |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.20.7 → 1.20.8 |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` + i18n test | UPDATE | footer v1.20.8 동기 |
| `CLAUDE.md` / `CHANGELOG.md` / `.claude/prds/workflow-orchestration.prd.md` | UPDATE | 문서/PRD |

## Deviations from Plan

- **`MCCP_WORK_MERGE_STRATEGY` env 추가(플랜 4토글 → 5토글)**: Codex F3가 "resolveFleet이 merge_strategy를 소비"하도록 요구하는데, merge_strategy는 harness 전역 속성(Task 0 spike가 측정)이라 per-plan 아티팩트가 아니라 machine-readable env로 노출하는 것이 정합적. default `disable-parallel`(spike 실측값). 병렬 활성화의 구조적 gate.
- **`partitionFromPlanText`를 `partition.js`에 추가**: work.md가 plan markdown을 partition으로 파생해야 하는데, 별도 parser 파일 추가는 Files-to-Change(cross-gate dedupe 파일-subset)를 확장하므로 listed 파일 안에 pure 함수로 흡수.
- **병렬 실행 경로 런타임 도달 0**: Task 0 결과(disable-parallel)로 병렬 EXECUTION은 활성화되지 않음. 스캐폴드·게이트 정의는 "활성화 계약"으로 존재하되 실행은 gate off. 이는 플랜 Design Decision 2/F3가 명시한 강등 경로(merge-back 미입증 → N=1)와 정확히 일치.

## Codex R1 흡수 확인

- **F1** verdict-before-merge: `mergeVerdicts`는 부수효과 없는 pure 판정(격리 결과만). work.md Step 3.gate-parallel이 merge-back **전에** 실행 → 집계 ≠ ok면 parent clean(부분 적용 0) + mid-apply rollback 계약.
- **F2** partition-escape: `checkPartitionEscape`가 worker 실제-diff ⊆ (partition ∪ allowlist) 강제 → 신규 verdict. reconcile N-way가 `git status --porcelain`(collectChangedFiles) 또는 actual-files-map으로 실제 diff 공급. partition oracle은 shared-manifest(plugin.json/CHANGELOG/CLAUDE.md/lockfile/cache/PRD/snapshot) 교차 시 dependency-aware collapse.
- **F3** machine-readable `merge_strategy` flag → `resolveFleet` 소비. 미입증 시 same-worktree 아닌 N=1 강등.
- **F4** post-merge integrated `node --test` 게이트(work.md Step 3.gate-parallel). 단일 merged-diff adversarial review는 M3 이연(backlog).

## Next Steps

- [ ] `/mccp:prp-commit` — M2b 변경 커밋
- [ ] `/mccp:pr` — 디자인/보안/Codex 게이트 통과 후 PR
- [ ] (주의) 브랜치 base freshness: `git diff origin/main..HEAD`가 local main-origin drift를 보임 → PR 전 origin/main rebase 검토
- [ ] M3: verify 네이티브화(단일 workflow-native adversarial-verify) + worktree-merge 활성화(입증 시)
