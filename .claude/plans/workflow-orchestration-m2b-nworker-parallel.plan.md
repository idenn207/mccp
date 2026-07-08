# Plan: Multi-Agent Workflow Orchestration — M2b N-worker parallel implement

**Source PRD**: `.claude/prds/workflow-orchestration.prd.md`
**Selected Milestone**: M2 — implement 병렬화 (second sub-milestone **M2b**: N-worker `parallel` 병렬화 · 자체 IPC 폐기 평가 · 게이트 pipeline 구조화)
**Complexity**: Large

## Summary

M2a가 `/mccp:work` Step 3 implement 위임을 **단일** `Workflow agent()`로 등가 이전했다(회수 = 반환값 ∧ envelope ∧ store 3자 reconciliation). M2b는 그 seam(`implement-dispatch.js`의 단일 `agent()`)을 **`parallel(fleet.map(...))`으로 확장**해 실제 N-worker 병렬 implement를 해금한다. 안전은 내 불확실성이 아니라 **프런티어의 검증된 패턴**에 grounding한다 — file-race는 Workflow 스펙이 명시한 `isolation:'worktree'`로(anthropics/claude-code#10599 + mccp가 이미 수렴), gate 합성은 canonical pipeline 패턴(parallel → barrier → aggregate)으로. 핵심 안전 불변식은 **disjoint-partition**: partition oracle이 파일 겹침·task 상호의존을 감지하면 N=1로 fail-close하므로, 병렬 worker들은 **서로소 file-set**만 편집하고 worktree→parent merge가 구조적으로 무충돌이다. 회수는 M2a `deriveVerdict`를 per-worker로 돌린 뒤 **fail-closed 집계**(`mergeVerdicts`)한다. 비용은 M1 `resolveFanout` 미러(budget.total 하드 상한 + cost-tier autoDisable). `MCCP_WORK_IMPLEMENT_PARALLEL` default-off kill switch로 M2a 단일-worker 동작이 기본 유지되고, N-worker는 명시 opt-in + partition이 실제로 쪼개질 때만 발화한다. 자체 IPC는 **부분 폐기**(Workflow 런타임이 liveness를 소유 → heartbeat/reclaim/watcher는 Workflow 경로에서 redundant, envelope는 attribution·reconcile 아티팩트로 존속). verify를 단일 workflow-native adversarial-verify 스테이지로 내리는 것은 M3(verify 네이티브화)로 명시 이연.

## Frontier Grounding (설계 근거 = Anthropic ultracode/deep-research 실측)

> 사용자 지시: 위험은 프런티어(Anthropic `Workflow` primitive = ultracode, `deep-research`)에서 검증됐으니 그 구현을 따른다. 근거는 `docs/research/multi-agent-orchestration-metasearch.md`(=`/deep-research` 산출물 + `Workflow` tool 1차 스펙).

| M2b 난제 | 프런티어 해답 (출처) | M2b 반영 |
|---|---|---|
| 병렬 파일 쓰기 race | `isolation:'worktree'` — "agents mutate files in parallel and would otherwise conflict; auto-removed if unchanged" (Workflow 스펙) + anthropics/claude-code#10599 커뮤니티 수렴 | Design Decision 1/2 — worktree 격리 per worker + disjoint 불변식 |
| gate 합성 | canonical pipeline: "차원별 → 완료 즉시 병렬 verify"; adversarial verify 패턴 (Workflow 스펙 §3/§4) | Design Decision 4 — parallel→barrier→aggregate. adversarial-verify 스테이지化는 M3 |
| 비용 폭증(fan-out 3×) | `budget.total` 하드 상한 + pre-guard skip (Workflow 스펙 budget) | Design Decision 6 — `resolveFleet` (M1 `resolveFanout` 미러) |
| retry 폭발 | `MCCP_GATE_ROUND_CAP` 전파 (research §4) | worker 내부 게이트가 기존 cap 상속 (Design Decision 4) |
| verification-absent | verify를 pipeline 스테이지로 강제 (research §7) | reconcile+anchor가 필수 aggregate 스테이지 (Design Decision 3) |
| orchestrator context overflow | 스크립트 변수 회수 (Workflow 구조적 해결) | 메인은 per-worker 요약만 회수(M2a 계승) |

research §6 진단: `prepareDispatch`(workers 배열)·`mergeEnvelopes`(N envelope 집계)는 **이미 N-ready** — M2a가 single로만 사용. M2b는 "이미 있는 N을 해금 + 프런티어 안전장치 장착"이지 greenfield가 아니다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| `parallel` seam | `plugins/mccp/scripts/workflows/plan-fanout.js:199-220` | `parallel(fleet.map(p => () => agent(prompt,{agentType,isolation,effort,schema})))` + budget pre-guard + self-contained 포트 |
| N-way 집계 | `plugins/mccp/scripts/lib/dispatch-controller.js:216-266` `mergeEnvelopes` | receiptsAdded union / findings / failedWorkers, pending·non-ok=failed |
| per-worker verdict | `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js:122-263` `deriveVerdict` | 반환값 ∧ envelope ∧ store 3자 reconcile, 8-step first-match fail-closed |
| N-worker prepare | `plugins/mccp/scripts/lib/dispatch-controller.js:123-214` `prepareDispatch` | workers 배열 → per-dispatch placeholder + prompt (이미 N 지원) |
| budget oracle | `plugins/mccp/scripts/lib/plan-fanout/budget.js` `resolveFanout` | `parseXxx(env)` loud fail-open + cost-tier autoDisable + `minRemaining=est×fleetSize` |
| worker prompt | `plugins/mccp/scripts/lib/dispatch-cli.js:111-166` `buildImplementWorkerBasePrompt` | 명시 guardrail + 3-플래그 attribution + envelope mark + schema 반환 (per-partition planPath로 재사용) |
| lifecycle 경계 | `plugins/mccp/commands/work.md:184-296` Step 3.route/W/gate | pre-invocation fallback + started 표식 후 fail-closed HALT (Codex F1) |
| oracle 분리 | `plugins/mccp/scripts/lib/implement-dispatch/tests/*` · `plan-fanout/tests/*` | Node native runner, 순수 oracle 단위 테스트 (샌드박스 실행은 dogfood) |
| Doc gate row | `CLAUDE.md` §1.4 표 · §4 운영 토글 | 새 축 1행 + 토글 env 문서화 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/implement-dispatch/partition.js` | CREATE | `partitionPlan({planFiles, tasks, maxWorkers})` 순수 oracle — plan의 Files-to-Change/Tasks를 **서로소 file-set**으로 분할. 파일 겹침·task 상호의존 감지 시 단일 partition(N=1) fail-close |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/partition.test.js` | CREATE | disjoint 분할 / 겹침→N=1 / 상호의존→N=1 / maxWorkers cap / 빈 plan 처리 |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | CREATE | `resolveFleet({env, costStateRead, tierFor, requestedN})` — budget.total 하드 상한 + cost-tier autoDisable + per-worker estimate → N cap 또는 N=1 강등. `resolveFanout` 미러 |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` | CREATE | env-off / cost-state-unknown→N=1 / tier autoDisable / budget-insufficient→N cap / 정상 N |
| `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js` | UPDATE | `mergeVerdicts(perWorker[])` 추가 — 각 worker에 `deriveVerdict` 실행 후 fail-closed 집계(most-severe-first, receiptsAdded union, F1/anchor 전 worker 검사). `deriveVerdict`는 불변 |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/result-schema.test.js` | UPDATE | mergeVerdicts: 전원 ok→ok / 1명 invariant→invariant-violation / 1명 unanchored→unanchored / mismatch 전파 / union 정확성 |
| `plugins/mccp/scripts/lib/dispatch-cli.js` | UPDATE | `prepare-fleet`(partitions→N-worker prepareDispatch + per-partition planPath 주입) + `emit-workflow-args` fleet shape(per-worker args 배열 + expectedAnchors) + `reconcile` N-way(`--results-dir`/fleet args → `mergeVerdicts`). 단일 서브커맨드는 back-compat 유지 |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | UPDATE | prepare-fleet N-worker emit / fleet args 배열 / N-way reconcile verdict 집계 / 기존 single 회귀 그린 |
| `plugins/mccp/scripts/workflows/implement-dispatch.js` | UPDATE | 단일 `agent()` → `parallel(fleet.map(p => () => agent(p.workerPrompt,{agentType, isolation:'worktree', label, phase, schema})))`. budget pre-guard(plan-fanout 미러). N=1이면 단일 경로 유지. 반환 `{results:[...], dispatchIds:[...], skipped, reason}` |
| `plugins/mccp/commands/work.md` | UPDATE | Step 3에 `MCCP_WORK_IMPLEMENT_PARALLEL` 하위 축 + partition→prepare-fleet→Workflow parallel→**disjoint merge-back**→N-way reconcile gate. lifecycle 경계(Codex F1) N-worker 확장 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.20.7 → 1.20.8` patch bump (§3.7 단일 sub-milestone) |
| `CLAUDE.md` | UPDATE | §1.4 표 1행 + §4 토글 4종 문서화 |
| `CHANGELOG.md` | UPDATE | 새 row |
| `.claude/prds/workflow-orchestration.prd.md` | UPDATE | M2 Plan cell에 M2b plan 경로 추가(M2a 링크 보존, sub-milestone 누적) |

## Design Decisions (이 plan이 확정하는 것)

> M2의 PRD Open Question 6개 중 M2a가 미룬 **병렬 파일 쓰기 안전**·**게이트 합성(c)**·**비용 정책(N-worker)**을 M2b가 답한다. verify 네이티브화(단일 adversarial-verify 스테이지)는 M3.

1. **disjoint-partition 불변식 = file-race 안전의 근원 (프런티어 grounding).** `partition.js`는 plan의 `Files to Change`/`Tasks`를 **파일 교집합이 공집합인 그룹**으로만 분할한다. 한 파일을 두 task가 건드리거나 task가 `Mirror: Task N` 등으로 상호의존하면 그 그룹들은 **하나로 병합**되어 N이 준다. 극단적으로 전부 얽히면 N=1(=M2a 단일 worker). 이는 소심함이 아니라 **정확성 전제**: 프런티어 지침("worktree isolation when agents would otherwise conflict")의 대우 — 서로소면 애초에 conflict가 없으므로 merge-back이 구조적으로 무충돌이다.

2. **`isolation:'worktree'` per worker + 명시 merge-back (프런티어 file-race 해답).** Workflow 스펙이 병렬 파일 변형에 지정한 격리 primitive를 **회피 대상이 아니라 THE 해답으로 confident하게 채택**한다. 각 worker는 fresh worktree에서 자기 partition의 서로소 파일만 편집. **불확실 지점**: Workflow worktree→parent로 변경이 어떻게 흐르는지 스펙이 침묵(research §4·§8 open question). 따라서 **Task 0 spike**로 (a) `isolation:'worktree'` 변경의 parent 도달 여부·경로, (b) 서로소 merge-back 메커니즘을 **실측 후** 최종 확정한다. spike 결과는 **machine-readable strategy flag**(`merge_strategy ∈ {worktree-merge, same-worktree, disable-parallel}`)로 아티팩트에 기록되고 `resolveFleet`/Workflow args가 이를 소비한다 (Codex R1 F3 흡수). spike가 worktree→parent 자동 merge를 **입증하지 못하면** `disable-parallel`(N=1)로 강등한다 — same-worktree fallback(A2)은 F2의 hard 실제-diff subset 검증 + atomic merge 보호가 실장되기 **전까지 금지**(안전장치 없는 즉흥 same-worktree 병렬 경로 생성 차단). A2는 그 보호가 갖춰진 뒤에만 옵션이며, 그전까지 merge-back 미입증 = N=1이 유일한 강등 경로다.

3. **N-way `mergeVerdicts` = per-worker `deriveVerdict` + fail-closed 집계.** M2a oracle을 재사용해 각 worker의 반환값 ∧ envelope ∧ store를 **개별 3자 reconcile**한 뒤, 집계 규칙: (i) 어느 worker든 `invariant-violation`(mccp-pr-codex leak) → 집계 `invariant-violation`(최우선, HARD). (ii) `unanchored` 존재 → `unanchored`. (iii) `reconcile-mismatch`/`result-unreadable`/`failed` 중 하나라도 → 그 verdict(most-severe-first). (iv) 전원 `ok` → `ok` + receiptsAdded union. `mergeEnvelopes`의 pending·non-ok=failed 규칙을 per-worker deriveVerdict가 이미 계승하므로, 집계는 그 위의 fail-closed OR다. 부분 성공(일부 ok·일부 실패)도 **전체 HALT** — 서로소라도 부분 적용은 plan 무결성을 깬다.

   **Codex R1 F1(HIGH) 흡수 — verdict-before-merge 순서 불변식.** `mergeVerdicts`는 worker들의 **격리 worktree 결과**(반환값 ∧ envelope ∧ store)만으로 판정하며, **parent worktree에 어떤 diff도 적용되기 전에** 실행된다. 집계 ≠ ok면 parent는 여전히 clean → **부분 적용 0**(untrusted dirty state 불가). 오직 집계 ok일 때만 merge-back 단계로 진입하고, merge-back 자체가 mid-apply 실패하면 적용분을 **rollback**한다(worker는 commit 안 하므로 `git checkout --`/`git clean`으로 복원). 기존 plan은 merge-back → 집계 순서라 실패 worker의 부분 변경이 이미 parent에 앉은 뒤 halt됐다 — 이 순서를 뒤집는 것이 핵심 수정.

   **Codex R1 F2(HIGH) 흡수 — partition-escape verdict.** per-worker 판정에 각 worker의 **실제 변경+untracked 파일**(worker worktree의 `git status --porcelain`/`git diff --name-only`)이 자기 partition ∪ 명시 shared-output allowlist의 subset인지 검사를 추가한다 — 벗어나면 신규 fail-closed verdict `partition-escape`. prompt-level guardrail("이 파일들만 편집")만으로는 lockfile/snapshot/generated 산출물 편집을 막지 못하므로, disjointness는 **실제 diff로 강제**된다.

4. **per-worker Implement-Codex (Design X), gate-pipeline = parallel→barrier→aggregate.** 각 worker는 M2a worker 계약 그대로 자기 partition에 prp-implement Phase 2.5~4(Implement-Codex 게이트 포함)를 구동 — dual-review가 worker 안에서 실측된다. **서로소 partition은 독립 리뷰 단위**라 per-partition 게이팅이 파편화가 아니라 sound하다(PR-Codex가 PR 시점에 전체 재대조). pipeline 구조 = `parallel(implement workers)` → barrier(disjoint merge-back) → `mergeVerdicts`(필수 verify-aggregate 스테이지). **단일 workflow-native adversarial-verify 스테이지**(worker 밖에서 merged diff 1회 검증)로 내리는 (c) 완성형은 dual-review 재설계라 **M3(verify 네이티브화)**로 이연 — M2b는 구조만 세운다.

   **Codex R1 F4(MEDIUM) 흡수 — post-merge integrated test 게이트.** merge-back 후 parent가 통합 diff를 담은 상태에서 Step 4(commit) **전에** integrated validation(full 또는 affected `node --test`)을 1회 실행한다 — 실패 시 rollback(F1 계약) + HALT. 이는 서로소 partition이 각자 local review(per-worker Implement-Codex)를 통과해도 통합 시 깨지는 회귀(public API / import graph / shared config / test fixture)를 Step 4 이전에 잡는다. 단, 단일 merged-diff **adversarial review**(worker 밖 1회 LLM verify)는 dual-review 재설계라 여전히 **M3 이연**(DEFER_TO_BACKLOG) — M2b는 통합 **test** 게이트까지 owns, 통합 **review**는 M3. 즉 F4의 test 축은 지금, review 축은 M3.

5. **자체 IPC = 부분 폐기 (자체 IPC 운명 답).** Workflow 런타임이 worker liveness·동시성(~16 cap)·재개(journal/`resumeFromRunId`)를 **소유**하므로, 수동 Task async fanout용으로 만든 `dispatch-controller` **heartbeat/reclaimStale/watcher는 Workflow 경로에서 redundant → 미사용**(prepare-fleet가 `skipHeartbeat:true` 유지). envelope는 **존속** — 이유: receipt `ipc_envelope_path` anchor(`ENVELOPE_PATH_RE`)·dashboard derive(`sources/envelopes.js`)·reconcile SSoT가 요구. 즉 "liveness IPC 폐기, data 아티팩트 존속". 완전 폐기(envelope 제거)는 receipt attribution을 structural input으로 승격하는 별도 재설계(M2a Codex F3 후보) → 이연.

6. **비용 = N-worker budget pre-guard (`resolveFleet`, M1 미러).** N-worker는 토큰을 N배 쓴다(research §4: 5-agent 3×). `resolveFleet`이 (i) `MCCP_WORK_IMPLEMENT_PARALLEL`!=1 → N=1, (ii) cost-state missing/corrupt → N=1(고비용 fail-closed, `resolveFanout` 미러), (iii) cost-tier ∈ autoDisable(notice+) → N=1, (iv) `budget.total` 설정 시 `remaining() < est×N` → N을 감당 가능 수로 cap. Workflow 스크립트도 `parallel` 직전 budget pre-guard(plan-fanout 동일). `budget.total` 미설정 시 구조적 상한(`MCCP_WORK_PARALLEL_MAX` default 4 + partition N)만 유효.

7. **lifecycle 경계(Codex F1) N-worker 확장.** started 표식 **전**에만 강등 가능(N→1 또는 Task/인라인). Workflow `parallel`이 N worker를 이미 spawn한 뒤 회수 실패 시 **경쟁 재spawn 금지** — fail-closed HALT + `resumeFromRunId` 재개 지시(Workflow가 부분 완료 worker를 캐시 replay). N worker의 F1 invariant(mccp-pr-codex leak)는 `mergeVerdicts`가 **전원 검사** — 하나라도 leak 시 HARD HALT(commit/PR은 여전히 controller Step 4/5 전용).

8. **kill switch 3+1 계층.** `MCCP_WORK_ISOLATE_IMPLEMENT`(인라인 vs 격리) > `MCCP_WORK_IMPLEMENT_WORKFLOW`(Task vs Workflow) > **`MCCP_WORK_IMPLEMENT_PARALLEL`(1 vs N, 신규)** > partition 결과(N=1이면 자동 단일). default: parallel off → **M2a 단일-worker Workflow 동작 무변화**. standalone `/mccp:prp-implement`엔 미적용(격리 locus는 work.md 한정, M2a 계승).

## Tasks

### Task 0: worktree merge-back spike (Design Decision 2 실측 — 착수 전 필수)
- **Action**: 최소 2-worker 합성 케이스로 Workflow `agent({isolation:'worktree'})`가 서로소 파일 2개를 편집했을 때 (a) 변경이 parent worktree에 도달하는지, (b) 도달 경로(자동 merge / 명시 collect 필요 / worktree 경로 스크립트 노출 여부)를 실측 기록. 도달 안 하면 fallback A2(same-worktree disjoint) 설계로 전환하고 tool-level race 잔여 위험을 Codex 게이트 입력으로 명시. 결과를 plan body `## Worktree Spike Result`에 append(신규 코드 최소, 관측 아티팩트).
- **Mirror**: M2a Task 0 self-contained worker spike 관행.
- **Validate**: spike 로그 + Design Decision 2의 primary(worktree) vs fallback(A2) 확정 근거 기록.

### Task 1: partition oracle
- **Action**: `implement-dispatch/partition.js` — `partitionPlan({planFiles:[{path,taskIds}], tasks:[{id,mirrors:[]}], maxWorkers}) → { partitions:[{files:[],taskIds:[]}], n, reason, collapsed:bool }`. 알고리즘: 파일→task union-find, 상호의존(`mirrors`/명시 dependency)로 그룹 병합 → 서로소 컴포넌트가 partition. 파일 겹침 있으면 병합. `n = min(components, maxWorkers)`, 초과 시 작은 컴포넌트를 합쳐 maxWorkers로. 전부 얽히거나 파싱 실패 → `{n:1, collapsed:true, reason}`. 순수 함수. **Codex R1 F2 흡수 — dependency-aware collapse**: 파일명 disjoint뿐 아니라 (a) generated/shared 산출물(lockfile · snapshot · `.claude/cache/*` · `plugin.json`/`CHANGELOG.md` 등 공유 매니페스트), (b) import/test-impact edge(같은 모듈을 import하거나 같은 test 파일이 커버하는 partition)가 교차하면 해당 컴포넌트를 **병합(serialize)**한다. shared-output allowlist는 별도 frozen 상수. '이름만 서로소'인 partition이 런타임에 공유 산출물을 건드려 merge 충돌 나는 경우를 사전 collapse.
- **Mirror**: `plan-fanout/perspectives.js` 순수 oracle export 형태 + `mergeEnvelopes` 집계 사고.
- **Validate**: `node --test .../tests/partition.test.js` — 2 서로소→n=2 / 파일 겹침→n=1 collapsed / mirror 의존→병합 / maxWorkers=1→n=1 / 빈 plan→n=1.

### Task 2: budget oracle
- **Action**: `implement-dispatch/budget.js` — `resolveFleet({env, costStateRead, tierFor, requestedN}) → { n, run:bool, reason, minRemaining }`. skip/강등 순서(first match): parallel env-off→n=1 · cost-state-unknown→n=1(fail-closed) · tier autoDisable→n=1 · budget-insufficient→n cap. `MCCP_WORK_PARALLEL_MAX`(default 4) · `MCCP_WORK_PARALLEL_BUDGET`(default 150000/worker) · `MCCP_WORK_PARALLEL_AUTODISABLE_TIER`(default `notice,warning,critical`) 파싱은 loud fail-open + default.
- **Mirror**: `plan-fanout/budget.js` `resolveFanout` 逐節(env parse·cost-state·tier·minRemaining=est×N).
- **Validate**: `node --test .../tests/budget.test.js` — 위 5 분기 + 파싱 비정상→default+warn.

### Task 3: mergeVerdicts (result-schema 확장)
- **Action**: `result-schema.js`에 `mergeVerdicts(perWorker[]) → { verdict, receiptsAdded, perWorker:[], invariantViolations, unanchored, mismatches, failedReason }` 추가. 각 원소 `{result, envelope, receiptStore, expectedAnchor}`를 `deriveVerdict`에 통과 → Design Decision 3 집계 규칙(most-severe-first, receiptsAdded union, 전 worker F1/anchor). `deriveVerdict` 시그니처·8-step 불변. frozen 상수·`module.exports` 추가. **Codex R1 F2 흡수**: 각 원소에 `actualFiles`(worker worktree 실제 변경+untracked) + `partitionFiles` + `sharedAllowlist`를 추가 입력으로 받아 subset 검사 → 벗어나면 신규 verdict `partition-escape`(most-severe에서 `invariant-violation` → `unanchored` 다음 우선). verdict enum: `ok|failed|invariant-violation|unanchored|partition-escape|reconcile-mismatch|result-unreadable`. **Codex R1 F1 흡수**: `mergeVerdicts`는 **parent 미적용 상태**(격리 worktree 결과만)에서 호출됨을 전제로 한 pure 판정 — 적용/merge 부수효과 없음.
- **Mirror**: 자기 파일 `deriveVerdict` + `mergeEnvelopes` 집계.
- **Validate**: `node --test .../tests/result-schema.test.js`(기존 회귀 그린) + 신규 — 전원 ok / 1 invariant→invariant-violation / 1 unanchored→unanchored / 1 reconcile-mismatch 전파 / union dedupe.

### Task 4: dispatch-cli fleet 서브커맨드
- **Action**: `dispatch-cli.js`에 (a) `prepare-fleet --plan <path> --controller-session <uuid> --partitions-file <json>` — partition별 planPath/파일목록을 worker prompt에 주입(partition scope를 guardrail로 명시: "이 파일들만 편집") + `prepareDispatch(workers=[N])` 재사용 + per-worker `ipcEnvelopePath`/`expectedAnchor` emit. (b) `emit-workflow-args` fleet 인지 — 배열 args + `expectedAnchors[]`. (c) `reconcile` N-way — `--results-dir`(per-worker 반환) 또는 fleet args → 각 worker `deriveVerdict` 입력 조립 → `mergeVerdicts` → 집계 verdict emit. 단일(`prepare-single`/single reconcile) 경로 back-compat 보존. **Codex R1 F2 흡수**: reconcile N-way는 각 worker worktree에서 **실제 변경 파일 목록**(`git -C <worktree> status --porcelain` + `git diff --name-only`)을 수집해 `mergeVerdicts`의 subset 검사(`actualFiles`)에 공급 — partition-escape를 prompt가 아닌 실제 diff로 판정. prepare-fleet의 partition scope guardrail은 1차 방어(prompt), reconcile의 실제-diff subset은 2차 mechanical 강제.
- **Mirror**: `cmdPrepareSingle`/`cmdEmitWorkflowArgs`/`cmdReconcile` + `buildImplementWorkerBasePrompt`(partition 파일 scope 문구 추가).
- **Validate**: `node --test .../tests/dispatch-cli.test.js` — prepare-fleet N emit / per-worker anchor 고유 / reconcile-fleet 집계 / 기존 single 회귀.

### Task 5: Workflow 스크립트 병렬화 (seam 확장)
- **Action**: `workflows/implement-dispatch.js` — `args.fleet`(worker prompt 배열) 수신. budget pre-guard(plan-fanout 미러: `budget.total && remaining()<minRemaining` → skip/강등). `phase('Implement')` → `const results = await parallel(fleet.map(w => () => agent(w.workerPrompt, {agentType:w.agentType||'general-purpose', isolation:'worktree', label:'implement:'+w.dispatchId, phase:'Implement', schema:IMPLEMENT_RESULT_SCHEMA})))`. 반환 `{results, dispatchIds, skipped, reason}`. `fleet.length===1`이면 M2a 단일 경로(isolation은 partition 무의미 시 생략 가능 — Task 0 spike 결과 반영). `Date.now`/`Math.random` 미사용. IMPLEMENT_RESULT_SCHEMA 포트 동기 유지.
- **Mirror**: `plan-fanout.js:199-220`(`parallel` + budget pre-guard) + 자기 파일 M2a 단일 경로.
- **Validate**: `node -c workflows/implement-dispatch.js`(구문). 실행은 Task 7 dogfood(샌드박스 단위 테스트 불가 — oracle이 로직 커버, plan-fanout 동일 한계).

### Task 6: work.md Step 3 병렬 wiring (lifecycle 경계 + disjoint merge + N-way gate)
- **Action**: Step 3에 `MCCP_WORK_IMPLEMENT_PARALLEL` 축. 흐름:
  - **(prep)** partition oracle 실행 → `resolveFleet`로 N 확정(Task 0 `merge_strategy` 소비 — `disable-parallel`이면 N=1) → `prepare-fleet` → `emit-workflow-args`(fleet). N=1이면 M2a 경로 그대로.
  - **(route)** pre-invocation 경계(Codex F1 lifecycle): parallel opt-in AND Workflow 가용 AND N>1 AND `merge_strategy≠disable-parallel` → Step 3.WP(parallel), 아니면 M2a Step 3.W(단일)/Step 3.I(Task)/Step 3.F(인라인)로 강등.
  - **(invoke)** `dispatch-workflow-started` 표식 후 `Workflow({scriptPath, args:{fleet}})` → per-worker 반환을 `results-dir`에 영속. worker 변경은 **격리 worktree에만** 존재(parent 여전히 clean). 표식 후 회수 실패 = fail-closed HALT(N개 경쟁 재spawn 금지, `resumeFromRunId` 재개).
  - **(gate FIRST — Codex R1 F1)** merge-back **전에** `reconcile` N-way → 각 worker worktree 실제-diff 수집(F2) → `mergeVerdicts`. verdict ≠ ok면 fix-task HALT(`invariant-violation`/`unanchored`/`partition-escape` HARD). **이 시점 parent는 clean → 부분 적용 0.** 순서 역전이 이 게이트의 핵심 안전 계약.
  - **(merge-back — 집계 ok일 때만)** 각 worker의 서로소 변경을 parent에 staged apply. apply 직전 actual-diff ⊆ partition∪allowlist 재확인(F2). mid-apply 실패 시 이미 적용된 분을 **rollback**(worker commit 없음 → `git checkout --`/`git clean`) + HALT.
  - **(integrated test — Codex R1 F4)** merge-back 후 Step 4 **전에** integrated `node --test`(full 또는 affected) 1회 → 실패 시 rollback + HALT. (merged-diff adversarial *review*는 M3.)
  - **(commit)** 전부 green이면 Step 4로 진입.
  - 모든 tmp는 `git rev-parse --git-path`(worktree-safe, §3.9).
- **Mirror**: `work.md:184-296` Step 3.route/W/gate + §3.9 shell-state 독립 아티팩트.
- **Validate**: parallel off → M2a 단일 경로 무변화. on + N>1 + green → parallel 관찰(Task 7). started 후 회수 실패 → HALT(N 경쟁 재spawn 0). partition 겹침 합성 → N=1 강등.

### Task 7: dogfood e2e + Codex 흡수 재현
- **Action**: `MCCP_WORK_IMPLEMENT_PARALLEL=1`로 **서로소 2-file 합성 plan**에 `/mccp:work --full` 1회 — parallel 2-worker → disjoint merge → `mergeVerdicts` `ok` → Step 4 관찰. 대조: parallel off → M2a 단일 경로 동일. 재현 4종: (F1) 1 worker mccp-pr-codex leak → `invariant-violation` HARD HALT; (parallel-partial) 1 worker fail → 전체 HALT(부분 적용 금지); (merge) 겹침 partition 합성 → N=1 강등(무충돌 보장); (budget) cost-state notice → N=1 강등.
- **Mirror**: M2a Task 5 dogfood 4종 + dashboard cycle pre-ship.
- **Validate**: on/off 양 경로 + `node --test`(전체 회귀 그린) + N-worker receipt 각각 3-플래그 anchored + F1/partial/merge/budget 재현.

### Task 8: 버전·문서·PRD
- **Action**: `plugin.json` `1.20.7→1.20.8`. `CLAUDE.md` §1.4 표 1행("N-worker parallel implement (v1.20.8 M2b)") + §4 토글 4종(`MCCP_WORK_IMPLEMENT_PARALLEL` default off, `MCCP_WORK_PARALLEL_MAX`, `MCCP_WORK_PARALLEL_BUDGET`, `MCCP_WORK_PARALLEL_AUTODISABLE_TIER`). `CHANGELOG.md` row. PRD M2 Plan cell에 M2b 경로 추가(M2a 보존). renderer footer version 동기(§3.7).
- **Mirror**: §3.7 milestone 체크리스트 + M2a Task 4.
- **Validate**: `grep 1.20.8 plugin.json`; PRD 표 diff; footer 일치.

## Validation

```bash
# oracle 단위 테스트 (신규 3 + 확장 1)
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/

# Workflow 스크립트 구문 + dispatch-cli 회귀
node -c plugins/mccp/scripts/workflows/implement-dispatch.js
node --test plugins/mccp/scripts/lib/tests/dispatch-cli.test.js

# mergeVerdicts 스모크 — 1 worker invariant leak → 집계 invariant-violation
node -e "const {mergeVerdicts}=require('./plugins/mccp/scripts/lib/implement-dispatch/result-schema'); console.log(mergeVerdicts([{result:{status:'ok',receiptsAdded:['mccp-pr-codex/x.json']}}]).verdict)"  # → invariant-violation

# partition 스모크 — 파일 겹침 → n=1 collapsed
node -e "const {partitionPlan}=require('./plugins/mccp/scripts/lib/implement-dispatch/partition'); console.log(partitionPlan({planFiles:[{path:'a.js',taskIds:['t1']},{path:'a.js',taskIds:['t2']}],tasks:[{id:'t1'},{id:'t2'}],maxWorkers:4}).n)"  # → 1

# 전체 회귀 (기존 게이트·envelope substrate·M2a 단일 경로 무손상)
node --test

# 버전 bump 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # → 1.20.8
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| worktree→parent merge 메커니즘 스펙 침묵 (research §8 open) | 높음 | **Task 0 spike 착수 전 실측**. worktree 자동 도달 확인 or fallback A2(same-worktree disjoint). Codex 게이트가 잔여 tool-level race 판정 |
| partition oracle 과분할로 파일 겹침 놓침 → merge 충돌 | 중간 | union-find 서로소 불변식 + 겹침/상호의존 감지 시 병합 → N=1 fail-close. Task 7 겹침 재현 |
| N-worker 비용 N배 폭증 (research §4) | 높음 | `resolveFleet` budget.total 하드 상한 + cost-tier autoDisable + `MCCP_WORK_PARALLEL_MAX`. default off |
| 부분 성공(일부 worker fail) 조용히 통과 | 중간→낮음 | `mergeVerdicts` fail-closed OR — 하나라도 non-ok면 전체 HALT(부분 적용 금지) |
| gate 파편화로 dual-review 약화 | 중간→낮음 | disjoint partition = 독립 리뷰 단위(per-partition sound). PR-Codex 전체 재대조. 단일 verify 스테이지는 M3 |
| Workflow 호출 후 N 경쟁 재spawn (Codex F1 N-확장) | 중간→낮음 | started 표식 후 회수 실패 = fail-closed HALT, `resumeFromRunId` 재개(재spawn 0) |
| Workflow 미가용/parallel 미지원 환경 | 중간 | default off + 강등 계층(N→1→Task→인라인, 전부 fail-open) |
| verify 네이티브화 미완으로 M2 목표 부분 | 낮음 | M2b는 병렬+구조, verify 단일-스테이지化는 M3 명시 이연(정직 표기) |

## Open Questions — M2 PRD 매핑

| PRD Open Question | M2b 처리 |
|---|---|
| 게이트 합성 방식 | **부분 답** — pipeline 구조(parallel→barrier→aggregate) + per-worker 게이트(Design X, disjoint=sound). 단일 workflow-native adversarial-verify 스테이지(c 완성형)는 M3 |
| receipt attribution | **N-way 답** — 각 worker receipt 3-플래그 anchor + `mergeVerdicts`가 전원 anchor 검증(미anchor→unanchored HALT) |
| 자체 IPC 운명 | **답(부분 폐기)** — Workflow 런타임이 liveness 소유 → heartbeat/reclaim/watcher Workflow 경로 redundant 미사용. envelope는 attribution·reconcile 아티팩트 존속. 완전 폐기는 attribution structural 승격 재설계로 이연 |
| 비용 정책(budget↔cost-tier) | **답** — `resolveFleet` budget.total 하드 상한 + cost-tier autoDisable + per-worker estimate (M1 `resolveFanout` 미러) |
| 병렬 파일 쓰기 안전 | **답** — disjoint-partition 불변식 + `isolation:'worktree'`(프런티어 해답). merge-back 메커니즘은 Task 0 spike 실측 확정 |
| 결정론/재개 | **부분** — `resumeFromRunId`가 parallel worker 캐시 replay(started 후 회수 실패 재개 경로). STATE.md N-worker handoff 통합은 M3 |

## Acceptance

- [ ] Task 0 spike로 worktree→parent merge 메커니즘 실측 + Design Decision 2 primary/fallback 확정
- [ ] `partition` oracle 단위 테스트(서로소→N / 겹침→N=1 collapsed / 상호의존→병합 / maxWorkers cap)
- [ ] `budget` oracle 단위 테스트(env-off/cost-state-unknown/tier autoDisable/budget cap)
- [ ] `mergeVerdicts` 단위 테스트(전원 ok / invariant / unanchored / mismatch 전파 / union) + `deriveVerdict` 기존 회귀 그린
- [ ] `prepare-fleet`/N-way `reconcile` + 기존 single 서브커맨드 회귀 그린
- [ ] Workflow 스크립트 `node -c` + `parallel` seam + budget pre-guard
- [ ] `MCCP_WORK_IMPLEMENT_PARALLEL` 미설정(default off) → **M2a 단일-worker Workflow 동작 무변화**
- [ ] `=1` + N>1 + Workflow 가용 → parallel worker → disjoint merge → `mergeVerdicts` `ok` → Step 4
- [ ] 겹침 partition → N=1 강등(무충돌 보장); cost-state notice → N=1 강등
- [ ] worker 1명 mccp-pr-codex leak → `invariant-violation` HARD HALT; 1명 fail → 전체 HALT(부분 적용 금지)
- [ ] Workflow started 표식 후 회수 실패 → fail-closed HALT(N 경쟁 재spawn 0)
- [ ] N-worker receipt 각각 3-플래그 controller-anchored; dual-review 무손상(PR cross-gate dedupe 정상)
- [ ] `plugin.json` 1.20.8 + CLAUDE.md(§1.4 표 + §4 토글 4종)/CHANGELOG/PRD milestone 갱신
- [ ] Patterns mirrored, not reinvented (prepareDispatch/mergeEnvelopes N-ready 재사용, deriveVerdict per-worker, resolveFanout budget 미러)
- [ ] **Codex R1 F1**: `mergeVerdicts`가 merge-back **전에** 격리 worktree 결과로 실행 — 집계 ≠ ok 시 parent clean(부분 적용 0) + mid-apply rollback 계약
- [ ] **Codex R1 F2**: worker 실제 변경 파일 ⊄ (partition ∪ allowlist) → `partition-escape` HALT(prompt 아닌 실제-diff 강제) + partition oracle dependency-aware collapse
- [ ] **Codex R1 F3**: Task 0 `merge_strategy` flag → `resolveFleet` 소비; merge-back 미입증 → N=1(same-worktree fallback 금지, 보호 실장 전까지)
- [ ] **Codex R1 F4**: merge-back 후 Step 4 전 integrated `node --test` 게이트; 단일 merged-diff adversarial review는 M3 이연(backlog)

## Design Critique

> impeccable `design_signal`은 "Design Decisions"(소프트웨어 아키텍처 설계) 키워드 false-positive. `signal_files=["<keyword:design>"]`. Files to Change가 전부 백엔드 오케스트레이션 `.js` + 문서(`.md`/`.json`)이고 렌더 surface(`.css/.tsx/.html/.claude/cache/*.md`) 0 — impeccable 스코프("Not for backend-only or non-UI tasks") 외.

- 라운드 수: 1
- 합치 결론: 렌더 surface 부재 → 디자인 findings 0 → `decideCritique([])` = CONVERGED
- verdict: converged

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.5/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 absorption)
- Codex raw verdict: `needs-attention` — "No-ship: the plan's core safety claims are not enforceable yet, and the aggregate halt can happen after untrusted partial changes already land in the parent worktree."
- 합치 결론 (absorption 후): **converged** — Codex의 2 HIGH + 2 MEDIUM finding을 plan 본문에 흡수(verdict-before-merge 순서 불변식 · 실제-diff subset 강제 · machine-readable merge_strategy flag · post-merge integrated test 게이트). merged-diff adversarial *review*만 M3 이연.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why / 흡수 위치 |
  |---|---|---|---|
  | F1 aggregate halt runs after merge-back | HIGH | ACCEPT_NOW | Design Decision 3 + Task 6 재정렬 — `mergeVerdicts`를 **merge-back 전에** 격리 worktree 결과로 실행. 집계 ok일 때만 parent 적용 → 부분 적용 0 + mid-apply rollback 계약 |
  | F2 partition disjointness is only prompt-level | HIGH | ACCEPT_NOW | Design Decision 3 + Task 1/3/4 — dependency-aware collapse + 신규 `partition-escape` verdict + 각 worker 실제 변경 파일 subset(⊆ partition ∪ allowlist) mechanical 강제 |
  | F3 fallback strategy is not wired | MEDIUM | ACCEPT_NOW | Design Decision 2 — Task 0 spike가 machine-readable `merge_strategy`(worktree-merge/same-worktree/disable-parallel) 산출 → `resolveFleet` 소비. merge-back 미입증 시 same-worktree 아닌 **N=1(disable-parallel)** 강등 |
  | F4 merged-diff verification is deferred | MEDIUM | ACCEPT_NOW(test) + DEFER(review) | Design Decision 4 — merge-back 후 Step 4 전 integrated `node --test` 게이트 추가(ACCEPT). 단일 merged-diff **adversarial review**는 dual-review 재설계라 **M3 이연**(DEFER_TO_BACKLOG) |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (F4 merged-diff adversarial-review → M3 verify 네이티브화)
- Open Questions: 없음 (auto-CRITICAL catalog 무관 — secret/data-loss/irreversible-migration/auth-bypass/external-dest/crypto 해당 없음)
- Codex session 참조: thread `019f3d6b-6014-7b90-821a-f19590356962`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

## Worktree Spike Result

<!-- Task 0 empirical probe — 2026-07-08. Machine-readable strategy flag below is consumed by resolveFleet + work.md route decision. -->

- **merge_strategy: `disable-parallel`** (N=1)

### 실측 (Agent tool `isolation:'worktree'`, 단일 probe)

격리 agent에게 `git rev-parse --show-toplevel` 확인 → 그 root에 sentinel(`M2B_WORKTREE_SPIKE_SENTINEL.txt`) 작성 → parent 도달 여부 실측:

| 관측 | 결과 |
|---|---|
| 격리 worktree 위치 | `C:/_project/my/mccp/.claude/worktrees/agent-<uuid>` (parent와 **다른 물리 디렉토리**) |
| 격리 worktree branch | `worktree-agent-<uuid>` (parent branch와 **분리**) |
| sentinel이 parent worktree(`.worktrees/research-workflow-orchestration`)에 도달? | **아니오** (부재) |
| sentinel이 main repo root(`C:/_project/my/mccp`)에 도달? | **아니오** (부재) |
| 격리 worktree 상태 | 변경됨 → auto-remove 안 됨(kept). sentinel은 **uncommitted**(branch HEAD `3372bb0` 그대로) |
| Workflow 스크립트가 worktree 경로/변경을 collect하는 API | **없음** — 반환값만이 유일 채널 |

### 판정 근거 (Design Decision 2 · Codex F3)

- `isolation:'worktree'` 변경은 parent worktree working tree에 **자동 전파되지 않는다**. 별도 디렉토리 + 별도 branch에 uncommitted로 남으며, 오케스트레이터 스크립트에 worktree→parent **merge/collect 메커니즘이 노출되지 않는다**(harness가 lifecycle을 opaque하게 소유, "auto-removed if unchanged").
- 즉 **worktree→parent auto-merge 미입증**. Design Decision 2가 명시한 대로, 미입증 시 same-worktree fallback(A2)은 atomic-merge 보호가 실장되기 전까지 **금지** → 유일 강등 경로는 **N=1(`disable-parallel`)**.
- M2b는 병렬 **scaffold**(partition/budget/mergeVerdicts oracle · fleet CLI · `parallel` seam · work.md wiring)를 완성하고 단위 테스트로 검증하되, 실제 N-worker EXECUTION은 `resolveFleet`이 `merge_strategy='disable-parallel'`을 소비해 **N=1로 강등**한다. `MCCP_WORK_IMPLEMENT_PARALLEL=1` opt-in이어도 merge_strategy가 이 값인 한 M2a 단일-worker Workflow 동작이 유지된다.
- 활성화(worktree-merge 승격)는 (a) worktree-collect API 발견/사용, 또는 (b) same-worktree atomic 병렬 병합 보호 실장을 전제로 하는 **후속 milestone**으로 이연. 이 spike 아티팩트가 그 승격의 전제 근거가 된다.
