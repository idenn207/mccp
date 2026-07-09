# Plan: Multi-Agent Workflow Orchestration — M4 병렬 활성화 (worktree-merge live)

**Source PRD**: `.claude/prds/workflow-orchestration.prd.md`
**Selected Milestone**: M4 — 병렬 활성화 (worktree-merge live). M2b 병렬 스캐폴드 + M3 worktree-merge substrate는 완비, cost hard-ceiling으로 미실측된 **live harness 상관(Workflow worktree↔dispatchId)** 입증 → `merge_strategy`를 `worktree-merge`로 승격해 N-worker 병렬 실행 해금.
**Complexity**: Medium

## Summary

M2b/M3은 N-worker 병렬의 **모든 substrate**를 build + unit-test로 완비하되(`worktree-merge.js` collect/apply/patch-scoped rollback · `verify.js` aggregate adversarial-verify · `dispatch-cli.js` 5 서브커맨드 · `budget.js` `resolveFleet` merge-strategy gate · `implement-dispatch.js` `parallel` seam · `work.md` Step 3.prep-parallel/route/WP/gate-parallel), Task 0 spike가 **live harness 상관(실측 B)**을 cost hard-ceiling($314.50 critical)으로 미실측 → `merge_strategy=disable-parallel`로 병렬을 N=1 gate off했다. M4는 그 **단 하나 남은 미입증 축**을 닫는다: 실제 disjoint 2-file plan을 `/mccp:work` 병렬로 완주(**전체 e2e dogfood — 사용자 확정**)해 `parallel(fleet.map(agent({isolation:'worktree'})))` 반환 후 컨트롤러가 worktree↔dispatchId map을 신뢰 가능하게 빌드할 수 있음을 **empirical하게 입증**하고, 입증되면 `MCCP_WORK_MERGE_STRATEGY` default를 `disable-parallel`에서 `worktree-merge`로 **승격**(사용자 확정)해 병렬을 default 동작으로 해금한다. **결정적 correlation 제약 발견**: `.claude/state/dispatches/`는 gitignored라 fresh worktree에 parent envelope가 복사되지 않고, `dispatch-envelope.markStatus`는 ENOENT 시 생성하지 않으므로(no create-if-missing), worker의 in-worktree `mark`가 실패 → collect 상관 실패. 따라서 M4는 단순 flip이 아니라 **worker가 자기 worktree에 correlation artifact(envelope seed)를 write하게 하는 실질 배선**(seed + reconcile envelope-read-from-worktree)을 요구한다. **honest degradation 계약(M2b/M3 계승)**: Task 0 dogfood가 상관을 신뢰 가능하게 입증 못 하면 default를 flip하지 않고 blocker를 `## Live Correlation Spike Result`에 정직 기록 + patch bump + M4 gated 잔존(성공 미가정). 병렬이 켜져도 cost guard 3중(PARALLEL=1 opt-in · cost-state fail-closed · tier autoDisable)은 무변경 — default flip은 "gate를 없애는 것"이 아니라 "구조적 merge_strategy gate를 열되 비용/opt-in gate는 유지".

## Frontier Grounding (설계 근거 = M3 실측 A 계승 + gitignore/markStatus 제약 발견)

> M3 Task 0 실측 A는 **git 메커니즘(enumerate/collect/disjoint-apply/patch-scoped reverse-apply/rollback-safety=data-loss 0)을 합성 scratch repo로 PROVEN**했다. M4는 그 위에서 **live harness 상관(실측 B)**만 남았다 — 그것이 곧 이 milestone의 척추.

| M4 난제 | 실측/제약 근거 | M4 반영 |
|---|---|---|
| worktree↔dispatchId 상관 신호 (실측 B, M3 미실측) | M3 spike: "worktree 내 `<dispatchId>.envelope.json` 잔존 여부 / sentinel 필요 여부" open. `collect-worktrees`(dispatch-cli.js:875-917)는 `buildWorktreeMap`이 각 worktree의 `.claude/state/dispatches/*.envelope.json` 파일명으로 상관 | Design Decision 1/2 + Task 0 — 전체 e2e dogfood로 실측. correlation artifact가 worktree에 잔존하는 정확한 topology 확정 |
| fresh worktree에 parent envelope 부재 | **발견**: `.gitignore:84` `.claude/state/dispatches/` gitignored → `git worktree add`(clean checkout)는 gitignored working-tree 파일 미복사. `prepare-fleet`이 parent에 쓴 envelope는 worktree에 없음 | Design Decision 2 — worker가 자기 worktree에 envelope를 **seed**(신규 first-step)해야 상관 성립. 단 harness가 working-tree를 복사하면 no-op |
| worker in-worktree mark 실패 | **발견**: `dispatch-envelope.markStatus`(dispatch-envelope.js:200-203)는 envelope ENOENT 시 `{ok:false,'envelope not found'}` — **create-if-missing 없음**. worktree에 envelope 부재 시 worker의 terminal mark가 실패 | Design Decision 2 — `seed-envelope` 서브커맨드(또는 `mark --create`) + worker prompt first-step. seed 후 mark 성공, collect 상관 성립 |
| reconcile가 parent envelope를 읽음 | fleet `reconcile`(dispatch-cli.js:678-680)은 `inp.envelopePath`(절대 parent 경로)로 envelope read. worker가 in-worktree mark하면 parent envelope는 pending 잔존 → reconcile mismatch | Design Decision 3 — reconcile terminal envelope를 **worktree map에서** 읽도록 배선(collect가 빌드한 map → `<wt>/.claude/state/dispatches/<id>.envelope.json`). harness 복사 시엔 parent read 유지 |
| 병렬 활성화 default 태세 | 사용자 확정: 입증 후 default를 worktree-merge로 flip | Design Decision 4 — `work.md` `${MCCP_WORK_MERGE_STRATEGY:-disable-parallel}` → `:-worktree-merge`. budget.js gate 무변경(이미 enabling value). cost guard 3중 유지 |
| 성공 미보장 (harness opaque) | M2b/M3 honest degradation 관행 | Design Decision 6 — dogfood 실패 시 flip 안 함 + blocker 기록 + patch bump + gated 잔존 |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/dispatch-cli.js:447` `cmdMark` | 신규 `seed-envelope` 서브커맨드도 동일 `cmd*` 네이밍 + rest 파싱 + `emit()` 반환 |
| Errors | `plugins/mccp/scripts/lib/dispatch-envelope.js:200-203` ENOENT 분기 | seed는 존재 시 no-op(idempotent) · 부재 시 생성. loud fail; caller는 exit code 분기 |
| envelope write | `plugins/mccp/scripts/lib/dispatch-envelope.js:220-236` `write()` (atomic tmp+rename) | seed-envelope가 `write()` 재사용해 pending envelope 생성 (dispatchId/host/pid 포함) |
| worker prompt first-step | `plugins/mccp/scripts/lib/dispatch-cli.js:132-153` `buildImplementWorkerBasePrompt` HARD GUARDRAILS | seed 지시를 attribution 플래그 블록 앞에 first-step으로 삽입 (partition worker) |
| worktree enumerate | `plugins/mccp/scripts/lib/dispatch-cli.js:898-905` `git worktree list --porcelain` + self 필터 | collect-worktrees 로직 무변경 — Task 0가 실제 worktree 경로 노출을 확인 |
| Tests | `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` (기존 single/fleet/collect) | seed-envelope idempotent + reconcile-from-worktree 회귀. 기존 back-compat 그린 |
| Doc gate row | `CLAUDE.md` §1.4 표 · §4 토글 | M4 1행 + `MCCP_WORK_MERGE_STRATEGY` default 변경 문서화 |
| honest spike 아티팩트 | `.claude/plans/workflow-orchestration-m3-verify-native.plan.md` `## Worktree Merge Spike Result` | Task 0 결과를 `## Live Correlation Spike Result`에 machine-readable로 append |

## Files to Change

> 경로는 repo-root full path(§3.7 dedupe matcher 요구 — 축약 금지). ★ = Task 0 dogfood 결과에 종속(harness가 working-tree를 복사하면 seed 관련 항목 no-op/축소).

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/dispatch-envelope.js` | UPDATE ★ | `seedEnvelope(envelopePath, {dispatchId, controllerSessionId})` 헬퍼 — envelope 부재 시 pending envelope를 atomic `write()`로 생성(idempotent: 존재 시 no-op), worker의 in-worktree mark 선행 조건 확보. `markStatus`는 무변경(seed가 선seed) |
| `plugins/mccp/scripts/lib/dispatch-cli.js` | UPDATE ★ | (1) 신규 `seed-envelope --envelope <repo-rel> --dispatch-id <id> --controller-session <sid>` 서브커맨드 → `seedEnvelope` 호출 + **worktree-root 정규화**(Codex F2 — repo-relative를 `git rev-parse --show-toplevel` 기준으로 resolve + resolved 경로가 worktree 하위인지 assert; `mark`도 동일 정규화). (2) `buildImplementWorkerBasePrompt`에 seed first-step 삽입(partition worker). (3) fleet `reconcile`이 terminal envelope를 **worktree map 경로**에서 읽도록 옵션(`--worktree-map` 활용 — 이미 diff용으로 소비 중, envelope-read까지 확장). (4) **`cmdMergeApply` patches-out 실패 rollback hole 폐쇄**(Codex F1 — apply 성공 후 `patches-out` write 실패 시 `rollbackApplied({appliedPatches})`로 즉시 역적용 후 ERROR_EXIT. 현재는 역적용 없이 반환 → parent가 worker 변경으로 dirty인데 rollback 아티팩트 부재. M4가 이 경로를 도달 가능하게 만들기 전 필수 폐쇄) |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | UPDATE | seed-envelope idempotent(부재→생성 / 존재→no-op) · worker prompt seed 라인 · reconcile-from-worktree envelope read · 기존 single/fleet/collect 회귀 그린 |
| `plugins/mccp/commands/work.md` | UPDATE | (1) Step 3.prep-parallel `MERGE_STRATEGY="${MCCP_WORK_MERGE_STRATEGY:-disable-parallel}"`(:159) → `:-worktree-merge` **default flip**. (2) Step 3.WP worker seed first-step(dispatch-cli가 prompt에 주입하므로 문서 동기만). (3) Step 3.gate-parallel reconcile을 worktree-envelope read로 배선 + `merge_strategy=disable-parallel` 현행-주의 노트(:447) 활성화 문구로 갱신. (4) §128-129 doc default 갱신 |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATE(주석만) | `ENABLING_MERGE_STRATEGY='worktree-merge'`(:49) **무변경** — 이미 enabling value. Decision-order 주석의 "M2b spike measured disable-parallel" → "M4 default flipped to worktree-merge" 동기 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.20.15 → 1.21.0`(§3.7 — M4 = PRD 마지막 milestone, M1/M2/M3 ship 완료 → PRD 전체 완료 = minor). **조건부**: Task 0 degraded → `1.20.16` patch + M4 gated 잔존 |
| `CLAUDE.md` | UPDATE | §1.4 표 1행("병렬 활성화 worktree-merge live (v1.21.0 M4)") + §4 토글 `MCCP_WORK_MERGE_STRATEGY` default `disable-parallel`→`worktree-merge` 갱신 + §3.7 renderer footer version 동기 |
| `plugins/mccp/scripts/lib/renderer/html.js` + `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | user-visible footer version `1.20.15`→`1.21.0` 동기(§3.7 — surface drift 회피) |
| `CHANGELOG.md` | UPDATE | 새 row |
| `.claude/prds/workflow-orchestration.prd.md` | UPDATE | M4 row pending→in-progress + Plan cell. 병렬 해금 성공 시 M4 complete + M2/M3 "gated" 축 종료(complete) |

## Design Decisions (이 plan이 확정하는 것)

> M2b/M3가 gated로 남긴 **병렬 활성화**를 M4가 닫는다. PRD Open Question "병렬 파일 쓰기 안전"의 live-harness 실증 답.

1. **전체 e2e dogfood = Task 0 (사용자 확정).** correlation 입증은 합성 probe가 아니라 **실제 disjoint 2-file plan을 `/mccp:work --full` 병렬로 완주**하는 것이다 — collect → mergeVerdicts ok → pre-apply clean assert → merge-apply → integrated `node --test` → aggregate adversarial-verify converged → commit 전 과정을 live로 관찰. 이 dogfood가 곧 acceptance test(별도 cheap probe 아님). fan-out 비용(PRD 위험 #1)은 사용자가 명시 수용했고, cost guard 3중(아래 DD4)이 runaway를 막는다.

2. **correlation 신호 = worker-seeded in-worktree envelope (근본 원인 해소).** 발견한 3중 제약 — (i) `.claude/state/dispatches/` gitignored → fresh worktree에 parent envelope 부재, (ii) `git worktree add` clean checkout은 gitignored 파일 미복사, (iii) `markStatus` no create-if-missing — 때문에 worker의 in-worktree `mark`가 ENOENT로 실패하고 collect 상관이 `missing`으로 fail-close한다. 해소: worker가 **FIRST STEP으로 `dispatch-cli.js seed-envelope`를 호출**해 자기 worktree(`CWD`)에 `<dispatchId>.envelope.json` pending envelope를 생성 → 이후 terminal `mark`가 성공하고, `collect-worktrees`의 `buildWorktreeMap`이 그 파일명으로 worktree↔dispatchId를 상관한다. **단 harness가 working-tree(gitignored 포함)를 worktree로 복사한다면**(Task 0가 판정) seed는 idempotent no-op이 되고 parent envelope가 그대로 상관 가능 — 어느 경우든 seed는 안전(존재 시 no-op).

3. **reconcile terminal envelope = worktree map 경로에서 read.** worker가 in-worktree에서 mark하면 parent의 prepare-written envelope는 `pending`으로 stale 잔존한다. fleet `reconcile`이 절대 parent 경로(`inp.envelopePath`)로 읽으면 pending을 보고 mismatch → 오탐 HALT. 따라서 Step 3.gate-parallel은 `collect-worktrees`가 빌드한 map으로 **각 worker의 terminal envelope를 `<worktreePath>/.claude/state/dispatches/<id>.envelope.json`에서** 읽어 reconcile에 공급한다. `reconcile`은 이미 `--worktree-map`을 diff용으로 소비(dispatch-cli.js:661)하므로 envelope-read까지 그 map을 확장 소비. harness 복사 판정 시엔 parent read 유지(back-compat).

4. **merge_strategy default flip = worktree-merge (사용자 확정) — 단 cost/opt-in gate 무변경.** `work.md` Step 3.prep-parallel의 `${MCCP_WORK_MERGE_STRATEGY:-disable-parallel}`를 `:-worktree-merge`로. 이는 **구조적 merge_strategy gate만** 여는 것 — 병렬 실제 발화는 여전히 (a) `MCCP_WORK_IMPLEMENT_PARALLEL=1` 명시 opt-in, (b) partition oracle N>1, (c) `resolveFleet`의 cost-state 존재(부재 시 `COST_STATE_UNKNOWN` fail-closed N=1), (d) tier ∉ autoDisable{notice,warning,critical} 4중 AND를 요구한다. 즉 default flip 후에도 cost-state 없거나 고비용 tier면 자동으로 N=1. `budget.js` `ENABLING_MERGE_STRATEGY`는 이미 `worktree-merge` 상수라 **무변경**(default가 그 값과 일치하게 되는 것).

5. **runtime self-verify safe-HALT (aggressive default flip의 belt).** default flip으로 병렬이 더 쉽게 켜지므로, correlation이 runtime에 실패하면 안전해야 한다. `collect-worktrees`는 map missing/ambiguous 시 `ERROR_EXIT`(dispatch-cli.js:916) → Step 3.gate-parallel이 merge-apply **이전에** HALT → parent clean(부분 적용 0). merge-apply의 pre-apply clean assert(F4) + verdict-before-merge(mergeVerdicts ok일 때만 apply)가 이미 스캐폴드. M4는 이 belt를 문서화·dogfood로 실증할 뿐 신규 안전장치 추가 없음.

6. **honest degradation (M2b/M3 lineage, 성공 미가정).** Task 0 dogfood가 correlation을 신뢰 가능하게 입증 못 하면(worktree가 `git worktree list`에 안 뜸 / envelope seed가 worktree에 안 잔존 / harness가 `parallel()` 반환 후 worktree 자동 제거 등): (a) default flip **안 함**(`disable-parallel` 유지), (b) 구체 blocker를 `## Live Correlation Spike Result`에 machine-readable로 기록, (c) `1.20.16` patch bump + PRD M4 pending 유지(또는 "blocked-on-<사유>"), (d) verify-네이티브화(M3)는 이미 runtime이므로 무영향. M3 "PROVEN git substrate + UNPROVEN live correlation" 정직성 그대로 계승.

## Tasks

### Task 0: 전체 e2e dogfood correlation spike (Design Decision 1 — 착수 전 필수, 사용자 확정)
- **Action**: 서로소 2-file 합성 plan(예: 독립 util 2개 추가)에 대해 `MCCP_WORK_IMPLEMENT_PARALLEL=1` + `MCCP_WORK_MERGE_STRATEGY=worktree-merge` + cost-state green으로 `/mccp:work --full` 1회를 live 실행. 관찰 항목: (a) harness가 `isolation:'worktree'` worktree를 **어디에** 두는가(경로 레이아웃) + `parallel()` 반환 후 컨트롤러 `git worktree list --porcelain`에 **여전히 노출**되는가(자동 제거 여부), (b) worker의 CWD가 worktree인가 + repo-relative `mark`가 worktree에 쓰는가, (c) worker가 `seed-envelope` 없이 mark하면 ENOENT 실패하는가(제약 재확인) / seed 후 성공하는가, (d) `<worktree>/.claude/state/dispatches/<id>.envelope.json`이 잔존해 `collect-worktrees`가 상관하는가, (e) reconcile terminal envelope를 parent vs worktree 어디서 읽어야 정확한가. 결과를 `merge_strategy ∈ {worktree-merge(입증), disable-parallel(미입증)}` + correlation 메커니즘(seed 필요/harness-copy/불가)으로 확정하고 plan body `## Live Correlation Spike Result`에 append.
- **Mirror**: M3 Task 0 `## Worktree Merge Spike Result` machine-readable 관행 + `derive/sources/worktrees.js` enumerate.
- **Validate**: dogfood 로그 + `merge_strategy` 확정값 + correlation topology 근거 기록. 이후 Task는 이 값에 종속(seed 배선 여부·reconcile read 위치).

### Task 1: seed-envelope 서브커맨드 + worker prompt first-step + worktree-root 정규화 (Design Decision 2 · Codex F2)
- **Action**: `dispatch-envelope.js`에 `seedEnvelope(envelopePath, {dispatchId, controllerSessionId})`(부재 시 pending envelope atomic `write()` · 존재 시 no-op idempotent). `dispatch-cli.js`에 `seed-envelope --envelope <repo-rel> --dispatch-id <id> --controller-session <sid>` 서브커맨드 + `buildImplementWorkerBasePrompt`의 attribution 블록 **앞에** seed first-step 삽입("Before anything else, seed your envelope in THIS worktree: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js seed-envelope --envelope <ipcEnvelopePath> ...`"). **Codex F2 흡수 — worktree-root 정규화**: `seed-envelope`와 `mark`는 repo-relative envelope 경로를 `CWD`가 아니라 **worktree 루트(`git rev-parse --show-toplevel`)** 기준으로 resolve하고, resolved 경로가 그 worktree 하위인지 assert(worker CWD가 subdir여도 seed/mark가 올바른 `<worktree>/.claude/state/dispatches`에 착지 → collect가 `missing` 오판 안 함). Task 0가 harness-copy로 판정하면 seed는 그대로 두되(idempotent no-op) 문서에 "복사 harness에선 no-op" 명시.
- **Mirror**: `dispatch-envelope.js:220` `write()` atomic + `dispatch-cli.js:447` `cmdMark` 파싱 + `:132` prompt first-step + `git rev-parse --show-toplevel`(§3.9 worktree-safe 관행).
- **Validate**: `node --test .../tests/dispatch-cli.test.js` — seed 부재→생성 / 존재→no-op / 잘못된 dispatchId reject / worker prompt에 seed 라인 존재 / **CWD=subdir에서도 seed/mark가 worktree-root `.claude/state/dispatches`에 착지**(Codex F2 회귀) / resolved 경로가 worktree 밖이면 reject.

### Task 2: reconcile terminal envelope worktree-read 배선 (Design Decision 3)
- **Action**: fleet `reconcile`이 `--worktree-map` 제공 시 각 worker terminal envelope를 `<worktreeMap[id]>/.claude/state/dispatches/<id>.envelope.json`에서 읽도록 확장(현재 diff-collect에만 map 소비). map 부재/harness-copy 판정 시 기존 parent `envelopePath` read fallback. worker 반환값 ∧ (worktree)envelope ∧ store 3자 `mergeVerdicts` 무변경.
- **Mirror**: `dispatch-cli.js:644` `cmdReconcileFleet` + `:661` `--worktree-map` 소비.
- **Validate**: `node --test` — worktree-map envelope read → terminal / map 부재 → parent fallback / pending parent + terminal worktree envelope 시 mismatch 오탐 없음.

### Task 3: merge-apply rollback hole 폐쇄 + merge_strategy default flip + work.md 배선 (Design Decision 4/5 · Codex F1)
- **Action**: **Codex F1 흡수(선행 필수) — `cmdMergeApply` patches-out 실패 rollback**: `applyDisjointDiffs`가 이미 parent에 apply한 뒤 `fs.writeFileSync(patches-out)`가 실패하면(dispatch-cli.js:976-979 현재 역적용 없이 ERROR_EXIT) `worktreeMerge.rollbackApplied({appliedPatches: applied.appliedPatches, cwd: repoRoot})`로 **즉시 patch-scoped 역적용** 후 rollback 결과를 emit + ERROR_EXIT. parent를 apply-전 상태로 복원해 "merge-apply 실패 = parent clean" 계약(work.md:442)을 실제로 지킨다. 그 다음: `work.md` Step 3.prep-parallel `:-disable-parallel` → `:-worktree-merge`. Step 3.gate-parallel reconcile을 worktree-envelope read로(Task 2). Step 3.WP worker seed first-step 문서 동기(dispatch-cli가 prompt 주입). `:447` 현행-주의 노트를 "M4 활성화 — merge_strategy default=worktree-merge, cost guard 3중 유지"로 갱신. §128-129 doc default 갱신. `budget.js` 주석 동기(상수 무변경).
- **Mirror**: `work.md:157-204` Step 3.prep-parallel + `:394-447` Step 3.gate-parallel 스캐폴드 + `worktree-merge.js:306` `rollbackApplied`.
- **Validate**: **patches-out write 강제 실패 주입 → apply된 patch가 rollback되어 parent clean**(Codex F1 회귀) / default 미설정 → worktree-merge / `MCCP_WORK_MERGE_STRATEGY=disable-parallel` 명시 → N=1 gated(back-compat) / cost-state 부재 → N=1(fail-closed 무변경).

### Task 4: dogfood 재현 + honest 검증 (Design Decision 6)
- **Action**: Task 0 입증 strategy로 재현 5종: (happy) 병렬 2-worker → collect → mergeVerdicts ok → pre-apply assert → merge-apply → integrated test → adversarial-verify converged → commit; (verify-divergent) 통합 diff 회귀 주입 → verify HALT + patch reverse-apply(부분 적용 0); (rollback-safety, F4) 사전 dirty tracked + 기존 untracked feature branch에서 verify HALT → rollback이 그 사전 변경·untracked 보존(data-loss 0); (correlation-fail) seed 제거/worktree 미노출 시 collect missing → merge-apply 이전 HALT(parent clean, DD5); (gated back-compat) `MCCP_WORK_MERGE_STRATEGY=disable-parallel` 명시 → 단일 경로 + aggregate verify 여전히 발화(M3 무손상). Task 0 degraded 판정 시: 병렬 재현 생략 + DD6 degradation 경로 확정(flip 안 함, blocker 기록).
- **Mirror**: M3 Task 7 dogfood + dashboard cycle pre-ship.
- **Validate**: 병렬 경로 5 재현(특히 correlation-fail safe-HALT + rollback-safety) + `node --test` 전체 회귀 그린 + `mccp-implement-verify` receipt anchor.

### Task 5: 버전·문서·PRD·backlog (§3.7)
- **Action**: `plugin.json` `1.20.15 → 1.21.0`(병렬 해금 = PRD 완료 minor; degraded면 `1.20.16` patch). `CLAUDE.md` §1.4 표 1행 + §4 `MCCP_WORK_MERGE_STRATEGY` default 갱신. renderer footer(`html.js`/`markdown.js`) version 동기. `CHANGELOG.md` row. PRD M4 in-progress→(ship 시)complete + M2/M3 gated 축 complete. degraded면 M4 pending 유지.
- **Mirror**: §3.7 milestone 체크리스트 + M3 Task 8.
- **Validate**: `grep 1.21.0 plugin.json`(or 1.20.16); PRD 표 diff; footer 일치.

## Validation

```bash
# dispatch-cli 회귀 (single·fleet·collect back-compat + 신규 seed-envelope + reconcile worktree-read)
node --test plugins/mccp/scripts/lib/tests/dispatch-cli.test.js

# seed-envelope 스모크 — 부재→생성 / 존재→no-op
node plugins/mccp/scripts/lib/dispatch-cli.js seed-envelope --envelope /tmp/x.envelope.json --dispatch-id 00000000-0000-4000-8000-000000000000 --controller-session 11111111-1111-4111-8111-111111111111

# collect-worktrees 상관 (map 정확 / missing → ERROR_EXIT)
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/worktree-merge.test.js

# budget gate 회귀 (worktree-merge → run 가능 / disable-parallel 명시 → N=1)
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js

# 전체 회귀 (기존 게이트·envelope substrate·M2a/M2b/M3 경로 무손상)
node --test

# 버전 bump 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # → 1.21.0 (or 1.20.16 degraded)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 0 dogfood가 correlation 미입증 (harness가 worktree 자동 제거 / `git worktree list` 미노출) | 중간 | DD6 degradation — flip 안 함 + blocker 기록 + patch bump + gated 잔존. 성공 미가정 |
| seed-envelope가 worktree에 잔존 안 함 (harness가 반환 시 gitignored 파일 정리) | 중간 | Task 0 실측. 잔존 안 하면 correlation 대체 신호(sentinel/changed-file∩partition) 재검토 or gated |
| default flip으로 의도치 않은 병렬 발화 | 낮음 | cost guard 3중 무변경(PARALLEL=1 opt-in + cost-state fail-closed + tier autoDisable). flip은 구조적 gate만 염 |
| dogfood fan-out 비용 폭증 | 중간 | 2-worker 최소 케이스 + `resolveFleet` budget/tier gate + `MCCP_WORK_PARALLEL_MAX` cap. 사용자 명시 수용 |
| reconcile worktree-read 오배선으로 정상 worker 오탐 HALT | 낮음 | Task 2 pending-parent + terminal-worktree mismatch 회귀 test. map 부재 시 parent fallback |
| correlation runtime 실패 시 parent 오염 | 낮음 | DD5 safe-HALT — collect missing → merge-apply 이전 HALT(parent clean). verdict-before-merge + pre-apply assert 스캐폴드 |

## Open Questions — M4 PRD 매핑

| PRD Open Question | M4 처리 |
|---|---|
| 게이트 합성 방식(척추) | **계승(M3 (c) 완성)** — aggregate verify는 M3에서 이미 pipeline 스테이지. M4는 병렬 경로 활성화만 |
| receipt attribution | **계승** — 3-플래그 anchor + seed envelope는 correlation용(별도 anchor 재설계 없음) |
| 자체 IPC 운명 | **계승(부분 폐기)** — envelope는 attribution + M4 correlation 신호로 존속. Workflow가 liveness 소유 |
| 비용 정책 | **답** — cost guard 3중 무변경. default flip은 비용 gate 미영향 |
| 병렬 파일 쓰기 안전 | **답(live 실증)** — Task 0 dogfood가 worktree 격리 + disjoint + collect/merge/verify를 live로 입증. M2b/M3가 미룬 실증 완료(or 정직 gated) |
| 결정론/재개 | **부분** — `resumeFromRunId` parallel 캐시 replay 계승. STATE.md N-worker handoff 통합은 잔여(별도 축) |
| metric baseline | **scope 밖** — 단일 사용자 dogfood 관찰 계승(PRD 명시 open) |

## Acceptance

- [ ] Task 0 전체 e2e dogfood로 live correlation 실측 + `merge_strategy` 확정(worktree-merge 입증 / disable-parallel 미입증) + correlation topology(seed/harness-copy/불가) 기록
- [ ] `seed-envelope` 서브커맨드 idempotent(부재→생성 / 존재→no-op) + worker prompt first-step 삽입
- [ ] reconcile terminal envelope worktree-read 배선(map 있으면 worktree / 없으면 parent fallback) + pending-parent 오탐 없음
- [ ] `MCCP_WORK_MERGE_STRATEGY` default `disable-parallel`→`worktree-merge` flip + cost guard 3중 무변경(PARALLEL=1 opt-in / cost-state fail-closed / tier autoDisable)
- [ ] 병렬 5 재현: happy / verify-divergent patch reverse-apply / rollback-safety data-loss 0 / correlation-fail safe-HALT(parent clean) / gated back-compat(단일+verify 발화)
- [ ] aggregate verify는 Codex(cross-model) 무변경 — same-model skeptic 치환 아님(dual-review 무손상, M3 DD2 계승)
- [ ] `node --test` 전체 회귀 그린(기존 게이트·M2a/M2b/M3 경로 무손상) + `mccp-implement-verify` receipt anchor
- [ ] `plugin.json` 1.21.0(or degraded 1.20.16) + CLAUDE.md(§1.4 + §4)/CHANGELOG/PRD/renderer footer 갱신
- [ ] Patterns mirrored, not reinvented (envelope write / cmdMark / worktree enumerate / resolveFleet gate)
- [ ] honest degradation: Task 0 미입증 시 flip 안 함 + blocker 기록 + M4 gated 잔존(성공 미가정, M2b/M3 계승)
- [ ] **Codex F1**: `cmdMergeApply`가 apply 성공 후 `patches-out` write 실패 시 `rollbackApplied`로 parent 복원(현재 역적용 없이 ERROR_EXIT → parent 오염 + rollback 아티팩트 부재) — write-failure 회귀 test로 parent clean 입증. default flip 전 선행 폐쇄
- [ ] **Codex F2**: `seed-envelope`/`mark`가 repo-relative 경로를 worktree 루트(`git rev-parse --show-toplevel`) 기준 resolve + worktree 하위 assert — worker CWD=subdir 회귀 test로 collect `missing` 오판 회피

## Live Correlation Spike Result

<!-- Task 0 empirical dogfood — 2026-07-09 실행 (Workflow run wf_1f689994-fb8, 2 isolation:'worktree' agents, subagent_tokens=120403). 아래는 live 관찰값. -->

- **merge_strategy: `worktree-merge` (PROVEN)** — worktree가 `parallel()` 반환 후에도 컨트롤러 `git worktree list --porcelain`에 잔존하고(에이전트 완료 시 unlock), seed 시 correlation 성립. flip 조건 충족.
- **correlation 메커니즘: `seed-required` (harness-copy 아님)** — 각 worker 워크트리에서 `.claude/state/dispatches/`가 **ABSENT**(`dispatchDirListing=ABSENT`, `myPlaceholderVisible=false`) → parent placeholder가 fresh worktree에 미복사(`.gitignore` gitignored + clean checkout). seed 없는 `mark`는 `exit 1` + `envelope not found`(DD2 constraint c 확인). seed 없는 `collect-worktrees`는 `{map:{}, missing:[id1,id2], unmatchedWorktrees:[wt1,wt2]}` + `exit 1`(fail-closed HALT). → worker가 first-step으로 in-worktree seed해야 collect가 correlate.
- **harness worktree 레이아웃: `<repo>/.claude/worktrees/wf_<runId>-<N>`** — repo 내부 `.claude/worktrees/` 하위(별도 branch `worktree-wf_<runId>-<N>`, HEAD=현재 commit clean checkout). worker CWD=worktree root(`git rev-parse --show-toplevel`=worktree, `--git-dir`=`.git/worktrees/<name>`, `--git-common-dir`=`.git`, `isSeparateWorktree=true`). 컨트롤러가 `git worktree list`로 enumerate(self 필터 후 unmatchedWorktrees로 노출). **주의(F2 근거)**: 한 worker가 `show-toplevel`을 parent로 보고(CWD가 순간 worktree 밖) — subdir/외부 CWD에서 repo-relative resolve가 어긋날 수 있음을 실측 → seed/mark는 `show-toplevel` 기준 resolve + 하위 assert 필요.
- **reconcile 읽기 위치: worktree** — worker가 in-worktree seed→mark하므로 terminal envelope는 `<worktree>/.claude/state/dispatches/<id>.envelope.json`에 존재. parent placeholder는 pending 잔존(worker가 parent를 못 봄) → reconcile는 worktree-map 경로에서 읽어야 정확(Task 2).
- **버전 태세: `1.21.0` (minor, PROVEN)** — correlation 입증 → default flip + PRD 완료 minor. degraded 경로(1.20.16) 미발동.

### Task 4 happy-path live dogfood (run wf_98047bb7-1b1, 2026-07-09)

2-worker `parallel(isolation:'worktree')` full-chain 완주 확인:

- **seed live 작동**: 두 worker 모두 `seedCreated=true` + `markOk=true` — worker가 first-step `seed-envelope`로 자기 worktree에 pending envelope 생성 → terminal `mark` 성공(seed 없이는 Task 0에서 ENOENT였음).
- **collect WITH seed → correlate**: `collect-worktrees`가 `{map:{2 ids→worktrees}, missing:[], unmatchedWorktrees:[]}` + exit 0 반환(Task 0의 "seed 없이 missing"의 정확한 complement).
- **reconcile worktree-read → ok**: worktree terminal envelope read(Task 2) → verdict `ok`(parent placeholder는 pending 잔존이지만 map으로 worktree read해 오탐 회피).
- **merge-apply → parent**: `{ok:true, applied:2, files:[util-0.js, util-1.js]}` — 서로소 diff를 parent에 적용.
- **integrated + rollback**: 적용된 2 파일 valid JS(util0(10)=10, util1(10)=11); `rollback-apply`(F4 patch reverse) `{ok:true, reversed:2}` → parent clean 복원.
- **dogfood-surfaced 결함 + 수정**: `collectChangedFiles`가 default `git status --porcelain`로 untracked 신규 디렉토리를 `dogfood-m4/`로 축약 → file-level partition `dogfood-m4/util-0.js`와 false partition-escape. `--untracked-files=all`로 수정(worktree-merge collectWorkerDiff의 `ls-files --others` file granularity와 일치) + 회귀 test.

### Task 4 scenarios 2-5 (deterministic test coverage)

happy-path(1) 외 4 scenario는 결정적 단위 test가 커버(비용 절약, 메커니즘 검증):

- **verify-divergent**: `verify-decide` divergent/critical/unavailable×enforce → block (verify.test.js).
- **rollback-safety (F4, data-loss 0)**: merge-apply rollback + 사전 dirty pre-apply-dirty HALT + patch-scoped reverse (worktree-merge.test.js 12 + F1 patches-out-write-failure test).
- **correlation-fail safe-HALT**: `collect-worktrees` missing dispatchId → ERROR_EXIT(merge-apply 이전, parent clean) (dispatch-cli.test.js).
- **gated back-compat**: `resolveFleet` merge_strategy≠worktree-merge → N=1 (budget.test.js 26).

### 회귀 (honest)

M4 관련 test suite 301개(dispatch-cli 59 · dispatch-envelope 42 · implement-dispatch 200) 전부 green. full-parallel `node --test`(222 파일)에는 M4 무관 pre-existing red 4개(pr.md:165 validate-callsite-lint `--plan` 누락[601f629 이래 불변] + module-load hook test 3개[standalone 통과, concurrency-flaky]) — 전부 origin/main과 diff 0인 파일, backlog 기록. M4 신규 실패 0.

## Design Critique

> `design_signal=true`는 Files to Change의 renderer 파일(`plugins/mccp/scripts/lib/renderer/html.js` · `markdown.js`)이 design whitelist에 걸린 결과다. 그러나 이 파일들에 대한 M4 변경은 **user-visible footer의 version 문자열 sync(§3.7 기계적 요구 — plugin.json bump 시 surface drift 회피)**일 뿐, 시각/위계/레이아웃/색상 어떤 디자인 결정도 도입하지 않는다. 나머지 Files to Change는 전부 백엔드 오케스트레이션 `.js` + 문서(`.md`/`.json`)이고 렌더 surface(`.css/.tsx/.html/.claude/cache/*.md`)의 신규 도입 0 — impeccable 스코프("Not for backend-only or non-UI tasks") 외. M3 plan(동일 PRD 계보)의 false-positive 처리 계승.

- 라운드 수: 1
- 합치 결론: 렌더 surface 신규 도입 0 → 디자인 findings 0 → `decideCritique([])` = CONVERGED
- verdict: converged

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 absorption)
- Codex raw verdict: `needs-attention` — "No ship: the plan would activate a dormant merge path that still has a concrete parent-worktree pollution failure, and the proposed correlation signal still depends on unproven worker CWD behavior."
- 합치 결론 (absorption 후): **converged** — Codex의 2 finding(1 HIGH + 1 MEDIUM)을 plan 본문에 전면 흡수(merge-apply patches-out 실패 rollback hole 폐쇄 + seed/mark worktree-root 정규화). 둘 다 기존 substrate hardening(신규 아키텍처 결정 아님)이라 plan-편집으로 완전 해소 → DIVERGENT_UNRESOLVED 없음 → cap 내 수렴.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why / 흡수 위치 |
  |---|---|---|---|
  | F1 merge-apply가 apply 성공 후 `patches-out` write 실패 시 역적용 없이 ERROR_EXIT → parent dirty + rollback 아티팩트 부재 | HIGH | ACCEPT_NOW | Files(dispatch-cli.js) + Task 3 + Acceptance — write 실패 시 `rollbackApplied({appliedPatches})` 즉시 역적용 후 ERROR_EXIT. "merge-apply 실패=parent clean" 계약을 실제로 보증. M4가 이 경로를 도달 가능하게 만들기 전 선행 폐쇄 + write-failure 회귀 test |
  | F2 seed/mark가 repo-relative 경로를 CWD 기준 write → worker CWD=subdir면 엉뚱한 곳에 seed, collect는 worktree-root 스캔 → `missing` 오판(fail-closed지만 default flip 후 costly HALT) | MEDIUM | ACCEPT_NOW | Files(dispatch-cli.js) + Task 1 + Acceptance — repo-relative를 `git rev-parse --show-toplevel` 기준 resolve + worktree 하위 assert + CWD=subdir 회귀 test. correlation 신호를 robust하게(M4 척추) |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL catalog 무관 — F1 parent 오염은 rollback hole 폐쇄로 해소, 미해결 아님. F2는 fail-closed라 안전, 정규화로 robust化)
- Codex session 참조: thread `019f45ba-1a4c-78c2-a1ad-6b347977ab2e`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applies.

> Task 0 dogfood는 pre-specified 결정 트리(DD1 e2e dogfood + DD2 seed correlation + DD6 honest degradation)의 empirical 실측일 뿐 신규 아키텍처 결정이 아님 — plan-codex가 각 outcome의 handling(입증→flip / 미입증→gated 잔존)까지 이미 검토·수렴함(2 finding 흡수). implement diff는 plan의 Files to Change ⊆ 관계 유지 예정.
