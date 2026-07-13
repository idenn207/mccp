# Plan: Multi-Agent Workflow Orchestration — M3 verify 네이티브화 + worktree-merge 활성화

**Source PRD**: `.claude/prds/workflow-orchestration.prd.md`
**Selected Milestone**: M3 — verify 네이티브화 (+ 사용자 확정 확장: M2b가 이연한 **worktree-merge 활성화**로 실제 N-worker 병렬 해금)
**Complexity**: Large

## Summary

M2b는 완전한 N-worker 병렬 **스캐폴드**(partition/budget/mergeVerdicts oracle · fleet CLI · `parallel` seam · work.md Step 3.gate-parallel)를 만들되, Task 0 spike가 `isolation:'worktree'` 변경이 parent에 자동 전파되지 않음을 실측 → `merge_strategy=disable-parallel`로 실행을 **N=1로 gate off**했다. M3은 두 축을 닫는다: **(A) verify 네이티브화** — 통합 diff를 worker 밖에서 1회 adversarial review하는 workflow-native aggregate 스테이지를 **필수 pipeline 스테이지**로 강제(PRD Open Question 1 = 게이트 합성 척추 질문의 (c) pipeline-스테이지 답 + M2b가 backlog로 이연한 F4 review 축). **(B) worktree-merge 활성화** — M2b가 dormant로 남긴 worktree→parent merge 메커니즘(`dispatch-fleet-worktrees.json` map 빌드 + `git diff → git apply` collect)을 실측·실장해 `merge_strategy`를 `disable-parallel`에서 승격, 실제 병렬을 해금. 두 축은 **상보적으로 결합**한다 — B가 병렬을 켜고, A가 그 통합 결과를 cross-model(Claude↔Codex)로 검증한다. dual-review 무손상: aggregate verify는 mccp의 cross-model Codex를 pipeline 스테이지로 올릴 뿐 same-model skeptic으로 치환하지 않는다. **honest 계약**: Task 0가 어떤 merge 메커니즘도 harness 레벨에서 입증 못 하면, M3은 verify 스테이지를 정의·테스트만 하고 병렬은 M2b와 동일하게 gated로 남기며 그 사실을 PRD/receipt에 정직히 기록한다(성공을 가정하지 않는다).

## Frontier Grounding (설계 근거 = Anthropic ultracode/deep-research 실측 + M2b 계승)

> 사용자 지시(M2b 계승): 위험은 프런티어(`Workflow` primitive = ultracode, `deep-research`)에서 검증됐으니 그 구현을 따른다. 근거: `docs/research/multi-agent-orchestration-metasearch.md`(§7 verification-absent) + Explorer 실측(worktree-sync.js/dispatch-cli.js collectChangedFiles).

| M3 난제 | 프런티어/실측 해답 (출처) | M3 반영 |
|---|---|---|
| verify-absent (worker 밖 통합 검증 없음) | research §7: "verify를 pipeline 마지막 스테이지로 강제 (Codex adversarial를 workflow 네이티브 adversarial-verify 패턴으로)" | Design Decision 1 — 통합 diff aggregate adversarial-verify를 merge 후·commit 전 필수 gate 스테이지로 |
| cross-model vs same-model skeptic 충돌 | mccp §1.2 differentiator = Claude↔Codex cross-model. research §7 adversarial-verify는 same-model refute 패턴 | Design Decision 2 — 패턴만 차용(통합 diff 1회 adversarial review), invoker는 여전히 Codex(codex-invoke.js). 치환 아님 |
| worktree→parent merge 스펙 침묵 | Explorer B 실측: `git worktree list --porcelain`으로 enumerate 가능(derive/sources/worktrees.js:313 선례) · worker commit-free → `git diff → git apply`가 유일 적합(format-patch/cherry-pick는 commit 필요) | Design Decision 3 + Task 0 — collect map 빌드 + diff/apply. dispatch-cli.js collectChangedFiles(596-618) + `--worktree-map`(dormant) 재사용 |
| 통합 적용 전 부분-적용 위험 | M2b Codex F1 verdict-before-merge 불변식(이미 스캐폴드) | Design Decision 4 — mergeVerdicts ok → apply, mid-apply 실패 → rollback(commit-free라 `git checkout --`/`git clean`) |
| 비용(verify 스테이지 + N-worker) | M1 `resolveFanout`/M2b `resolveFleet` budget 하드 상한 | Design Decision 6 — verify는 1회 Codex(고정 비용) + 기존 fleet budget 게이트 무변경 |
| harness 병렬 파일 안전 | Explorer B: worker commit-free → git index race 없음 · disjoint → file race 없음 · receipt dispatchId별 유일 · STATE.md advisory lock | Design Decision 3/5 — worktree-merge(격리, F1/F2 as-designed) 우선 · A2 same-worktree(약화된 F1/F2)는 Task 0 fallback |

research §6 진단 계승: M2b가 `mergeEnvelopes`/`collectChangedFiles`/`--worktree-map`을 **N-ready로 만들어 두되 dormant**로 남겼다 — M3은 "이미 있는 hook을 실측 후 실배선 + verify 스테이지 장착"이지 greenfield가 아니다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| aggregate 스테이지 | `plugins/mccp/scripts/workflows/plan-fanout.js:199-220` | `parallel(...)` → `phase('Synthesize')` → 순수 aggregate. verify 스테이지도 parallel 뒤 barrier aggregate |
| Codex 호출 | `plugins/mccp/commands/prp-implement.md` Phase 2.5.3 + `codex-invoke.js:206` | `node codex-invoke.js adversarial-review --focus "<...>" --timeout-ms 900000 --json`. verify는 focus에 통합 diff 요약 + `--base` |
| verdict parse | `plugins/mccp/scripts/lib/codex-bridge.js:98-109` `parseVerdict` | `converged|divergent|unavailable` + `detectCriticalCategory`. verify oracle가 동일 semantics 재사용 |
| 순수 oracle 분리 | `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js` `deriveVerdict`/`mergeVerdicts` | pure judgment + `module.exports`, fs는 caller. verify.js도 pure `decideMergedVerify` |
| CLI 서브커맨드 | `plugins/mccp/scripts/lib/dispatch-cli.js` `cmdReconcileFleet`(:712) + `collectChangedFiles`(:596-618) | 신규 `collect-worktrees`/`merge-apply`/`verify-*` 서브커맨드. 기존 single/fleet back-compat |
| worktree enumerate | `plugins/mccp/scripts/derive/sources/worktrees.js:313` | `git worktree list --porcelain` 파싱(35-68) + realpath normalize(76-100). collect map 빌드에 재사용 |
| 격리 sync | `plugins/mccp/scripts/lib/worktree-sync.js:56-146` `syncEnvelopeOut`/`cleanupWorktree` | atomic rename + EXDEV fallback. diff collect가 같은 atomic 패턴 계승 |
| budget 게이트 | `plugins/mccp/scripts/lib/implement-dispatch/budget.js:130` `ENABLING_MERGE_STRATEGY` | Task 0 입증 strategy를 gate가 honor(현 `worktree-merge` 상수 확장 or 신규 값 수용) |
| receipt present-only 필드 | CLAUDE.md 다수 축(`meta.design_grounding_verdict` 등) | aggregate verify 결과를 신규 gate 대신 present-only `meta.merged_verify_*`로 stamp(경량) |
| Doc gate row | `CLAUDE.md` §1.4 표 · §4 운영 토글 | 새 축 1행 + 토글 문서화 |
| honest spike 아티팩트 | `.claude/plans/workflow-orchestration-m2b-nworker-parallel.plan.md` `## Worktree Spike Result` | Task 0 결과를 plan body에 machine-readable로 append |

## Files to Change

> 경로는 repo-root full path(§3.7 dedupe matcher 요구 — 축약 금지).

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/implement-dispatch/worktree-merge.js` | CREATE | worktree→parent collect+apply — `buildWorktreeMap({worktrees, dispatchIds})`(enumerate + dispatchId 상관), `collectWorkerDiff(worktreePath)`(`git diff --no-ext-diff`), `applyDisjointDiffs({diffs, dryRun})`(`git apply --check` → apply), `rollbackApplied(files)`(commit-free 복원). fs/git shell은 이 lib에 격리(caller는 CLI 경유) |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/worktree-merge.test.js` | CREATE | map 상관(정확/누락) · diff collect · dry-run apply · 충돌 시 실패 · rollback file-set · 빈 diff no-op |
| `plugins/mccp/scripts/lib/implement-dispatch/verify.js` | CREATE | aggregate adversarial-verify 순수 oracle — `buildVerifyFocus({changedFiles, partitions, workerFindings})`(통합 diff cross-partition 리뷰 focus 텍스트) + `decideMergedVerify({codexJson, roundCap})`(`parseVerdict` semantics 재사용 → `converged|divergent|critical|unavailable|skipped` + blocking 판정) |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/verify.test.js` | CREATE | focus 조립 · converged→pass / divergent→HALT / critical→HALT / unavailable→policy / skipped(N=1 or gated) |
| `plugins/mccp/scripts/lib/dispatch-cli.js` | UPDATE | 신규 서브커맨드: `collect-worktrees`(map JSON emit) · `merge-apply`(worktree-merge.js applyDisjointDiffs + F2 재확인 + rollback) · `verify-focus`(verify.js buildVerifyFocus emit) · `verify-decide`(codex json → verdict). single/fleet 기존 서브커맨드 back-compat |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | UPDATE | collect-worktrees map emit / merge-apply dry-run+rollback / verify-decide 5-verdict / 기존 single·fleet 회귀 그린 |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATE | Task 0 입증 strategy를 `resolveFleet` gate가 honor — Mechanism 1이면 기존 `worktree-merge` 상수 무변경, A2면 `same-worktree-atomic`을 enabling 집합에 추가. Task 0 결과에 종속(미입증 시 무변경 = 계속 gated) |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` | UPDATE | 입증 strategy → run=true / 미입증 값 → 계속 N=1 회귀 |
| `plugins/mccp/scripts/workflows/implement-dispatch.js` | UPDATE(최소) | Mechanism 1(격리 유지): 무변경 또는 correlation 신호(주석). A2 채택 시 `useIsolation` 조건 조정 + 주석 동기. IMPLEMENT_RESULT_SCHEMA 포트 무변경 |
| `plugins/mccp/commands/work.md` | UPDATE | (1) **Step 3.gate 단일 경로**에 commit 전 aggregate verify 스테이지 추가(Codex R1 F2 — worktree-merge gated여도 발화), (2) Step 3.gate-parallel 활성화: collect-worktrees → mergeVerdicts ok → **pre-apply clean assert**(F4) → merge-apply(patch 기록) → integrated `node --test` → **aggregate adversarial-verify**(verify-focus → codex-invoke.js → verify-decide) → divergent/critical 시 **patch reverse-apply rollback**(F4) + HALT, (3) verify 통과 시에만 Step 4. lifecycle 경계(M2b Codex F1) 무변경 |
| `plugins/mccp/scripts/receipt/aliases.js` | UPDATE | 신규 gate `mccp-implement-verify` 등록(produces-only, `requires_preceding:[mccp-implement-codex]`, PHASE_FROM_GATE=implement) — Codex R1 F3(합성 decision 충돌 회피 + audit anchor) |
| `plugins/mccp/scripts/receipt/schema.js` + `write.js` | UPDATE | `mccp-implement-verify` gate-id 수용 + `meta.merged_verify_verdict`(enum)/`meta.merged_verify_rounds`(int) present-only 필드 + `--merged-verify-verdict`/`--merged-verify-rounds` 플래그. `receipt_hash` 재봉인(P5 tamper-detect 무손상). migration 불필요 |
| `plugins/mccp/scripts/receipt/tests/*.test.js` | UPDATE | 신규 gate produces-only round-trip + merged_verify 필드 + validate-cmd/dedupe/PR-chain **비침습** negative test(신규 gate가 기존 chain 무영향) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.20.10 → 1.21.0`(§3.7 — M3 = PRD 마지막 milestone, M1/M2a/M2b ship 완료 → PRD 전체 완료 = minor). **조건부**: Task 0가 병렬 미해금 → verify-only 부분 ship이면 `1.20.11` patch + M2/M3 status honest |
| `CLAUDE.md` | UPDATE | §1.4 표 1행 + §4 토글(`MCCP_WORK_MERGED_VERIFY` 신규 + `MCCP_WORK_MERGE_STRATEGY` 값 확장) + §3.7 renderer footer version 동기 |
| `CHANGELOG.md` | UPDATE | 새 row |
| `.claude/prds/workflow-orchestration.prd.md` | UPDATE | M3 row pending→in-progress + Plan cell. 병렬 해금 성공 시 M2 status도 complete로(gated 축 종료) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 2026-07-08 F4 review-축 항목에 `ABSORBED in M3` 표기(row 보존, audit trail) |

## Design Decisions (이 plan이 확정하는 것)

> M2 PRD Open Question 중 M2b가 부분/이연한 **게이트 합성(c 완성형)** · **병렬 파일 쓰기 안전(merge-back 실증)**을 M3이 닫는다.

1. **aggregate adversarial-verify = 필수 pipeline 스테이지 (Open Question 1의 (c) 답).** M2b는 per-worker Implement-Codex(disjoint=sound)까지, PR-Codex는 /mccp:pr에서 cross-gate dedupe. M3은 그 사이에 **통합 diff를 worker 밖에서 1회 검증**하는 aggregate 스테이지를 넣는다. pipeline = `parallel(implement workers)` → barrier(disjoint merge-back) → integrated `node --test`(M2b) → **adversarial-verify**(M3) → commit. verify는 gate 순서로 **구조적 강제**(skip 불가) — 이것이 "verify를 pipeline 스테이지로 강제"의 mechanical 실현. per-partition 리뷰가 놓치는 cross-partition 통합 회귀(public API·import graph·shared config)를 test보다 깊은 LLM 판정으로 잡는다.

2. **cross-model 불변식 보존 — 패턴 차용이지 치환 아님.** research §7 adversarial-verify는 same-model skeptic refute 패턴이지만, mccp differentiator(§1.2 Claude↔Codex)를 지키기 위해 **invoker는 여전히 Codex**다. verify 스테이지는 통합 diff에 대해 `codex-invoke.js adversarial-review`를 1회 호출(cross-model refutation)하고 `codex-bridge.parseVerdict` semantics로 verdict를 판정한다. "adversarial-verify 패턴"은 **worker 밖 독립 검증**이라는 구조를 차용할 뿐, 리뷰어를 Claude로 바꾸지 않는다. same-model Claude skeptic 다중화(N refuters)는 blind-spot을 재도입하므로 명시 배제.

3. **worktree-merge 메커니즘 — Mechanism 1 우선, A2 fallback (Task 0 결정).** M2b spike는 `isolation:'worktree'`가 parent에 자동 전파 안 됨을 입증했으나, Explorer B는 **collect 경로가 dormant일 뿐 실장 가능**함을 확인했다:
   - **Mechanism 1 (worktree-collect, 우선)**: Workflow 반환 후 `git worktree list --porcelain`로 agent worktree enumerate → 각 worktree의 `.claude/state/dispatches/<dispatchId>.envelope.json`(또는 dispatchId sentinel)로 dispatchId↔worktree 상관 → `dispatch-fleet-worktrees.json` map 빌드 → 각 worker의 `git diff --no-ext-diff`를 verdict ok일 때만 parent에 `git apply`. **M2b 안전 불변식(F1 clean-until-verify · F2 per-worker isolated diff)을 as-designed 보존**. 의존: 상관 신호(envelope/sentinel)가 신뢰 가능해야 함 → Task 0 실측.
   - **A2 (same-worktree, fallback)**: isolation 미사용 → worker가 parent를 직접 편집. 소스 파일 race는 disjoint로, git index race는 commit-free로 없다. **그러나 Codex R1 F1 흡수 — file/git 격리 ≠ artifact 격리**: N worker가 **같은 plan**을 공유하면 decision-slug도 같아 receipt(`mccp-implement-codex/<decision>.json`)·tmp(`git-path mccp/tmp/*`)·STATE.md가 **dispatchId가 아니라 decision으로 키잉**된다 — `receipt/store.js`는 그 경로에 per-worker namespace/lock 없이 직접 write하므로, 서로소 파일을 편집해도 concurrent A2 worker가 서로의 receipt/anchor state를 덮어써 **nondeterministic unanchored verdict·audit 증거 소실**이 난다. 따라서 A2는 (i) F1 약화(clean-until-verify → rollback-on-fail), (ii) F2 약화(per-worker 격리 불가 → 통합 diff subset), **(iii) artifact 격리 미비**의 3중 약점을 지녀, **receipt/tmp/state를 dispatchId로 namespace하기 전까지 금지**(Explorer B의 "실행 안전" 결론은 file-race만 보고 artifact-race를 놓쳤다 — 정정). 이 때문에 **Mechanism 1(격리 worktree — 각 worker가 자기 worktree store에 receipt write, reconcile이 회수)이 명백한 primary**다. Task 0가 어느 쪽도 입증 못 하면 **`disable-parallel` 유지**(M2b 상태, 정직 기록).

4. **verdict-before-apply 순서 불변식 + patch-scoped rollback (M2b Codex F1 계승 + M3 Codex R1 F4 흡수).** Mechanism 1: mergeVerdicts는 **격리 worktree 결과만으로** merge-apply 전에 실행 → 집계 ok일 때만 apply → 부분 적용 0. **단 aggregate verify(DD1)는 apply·integrated-test 뒤에 돌므로, verify HALT 시점엔 patch가 이미 parent에 앉아 있다 — 이건 verify 스테이지에 대해선 verdict-before-apply가 아니다(Codex R1 F4 정확 지적).** 그러므로 rollback은 **절대 광범위 `git checkout --`/`git clean`을 쓰지 않는다** — /mccp:work는 main/master 밖 dirty feature branch를 허용하므로, 광범위 복원은 사용자의 **기존 uncommitted 변경을 되돌리거나 기존 untracked 파일을 삭제(=data loss, 되돌릴 수 없음)**한다. 대신:
   - **(pre-apply 격리)** merge-apply 직전, 적용 대상 경로(∪partition 파일)가 parent에서 **이미 clean한지 assert** — 그 경로에 사전 dirty가 있으면 HALT(사용자 변경과 worker diff 충돌 회피).
   - **(patch-scoped rollback)** `applyDisjointDiffs`가 적용한 **정확한 patch를 기록** → HALT 시 `git apply -R <recorded patch>`로 **적용분만 역적용**(worker가 추가한 것만 제거, parent의 사전 상태 보존). 신규 untracked도 patch에 기록된 파일만 제거.
   어느 메커니즘이든 **부분 성공 조용한 통과 금지** — mergeVerdicts fail-closed OR + verify HALT + patch-scoped rollback.

5. **verify receipt = 실제 gate `mccp-implement-verify` (Codex R1 F3 흡수 — 합성 decision 승격).** 초안은 `mccp-implement-codex`에 합성 decision `<slug>-merged` + present-only 필드로 stamp하려 했으나, Codex R1 F3가 두 결함을 정확히 지적했다: (i) `<slug>-merged`가 **실제 plan slug와 충돌** 가능, (ii) present-only `meta.merged_verify_verdict`는 **어떤 gate도 검사하지 않음**(dedupe/PR-chain은 `resolution.codex_verdict`만 읽음) → 기록은 되나 **toothless**. 정정: **신규 gate `mccp-implement-verify`**를 aliases.js에 등록(produces-only, `requires_preceding: [mccp-implement-codex]`, collision-resistant subject binding = plan path hash). 강제는 **2중**: (a) **runtime** — work.md Step 3의 `verify-decide` HALT가 divergent/critical 시 Step 4(commit)를 차단(1차 enforcement, receipt 유무 무관). (b) **chain audit** — 신규 gate receipt가 verdict를 anchor(감사 추적). **cross-gate dedupe·PR-Codex는 무변경**(dedupe는 plan+implement verdict만 검사) — 단 merged-verify verdict를 PR-chain-check까지 전파(divergent가 PR 단계에 survive)하는 것은 **명시 scope-out → backlog**(runtime HALT이 M3 enforcement로 충분; PR-phase 전파는 dual-review 재설계 표면이라 별도 axis). 등록 비용(aliases/schema/write CLI gate-id)은 auditability·충돌회피가 정당화하며, validate-cmd/dedupe/PR-chain **비침습**(produces-only)이라 churn은 제한적.

6. **비용·적용 범위 — verify는 단일·병렬 **양 경로**에서 발화 (Codex R1 F2 흡수 — Axis A/B 결합 해제).** 초안은 aggregate verify를 병렬 경로에만 걸어 "N=1은 per-worker Implement-Codex가 커버"라 했으나, Codex R1 F2가 정확히 지적했다: 그러면 worktree-merge가 gated일 때 **verify runtime이 0인데도** M3이 척추 질문(게이트 합성 c)을 "해결"했다고 주장하게 된다(정직성 gap). 그리고 per-worker Implement-Codex는 **worker 안**에서 도는 게이트 — aggregate verify는 **worker 밖·commit 전** workflow-external 스테이지로 층위가 다르다(중복 아님). 정정: **aggregate verify는 단일 경로(Step 3.gate)·병렬 경로(Step 3.gate-parallel) 모두에서 commit 직전 발화**한다. N=1이면 단일 worker의 통합 diff를 worker 밖에서 1회 리뷰(척추 질문의 (c) pipeline-스테이지 답이 **병렬 활성화와 무관하게 runtime을 획득**). 따라서 **Axis A는 Axis B에 결합되지 않는다** — Task 0가 disable-parallel로 강등돼도 verify 스테이지는 단일 경로에서 실제로 돌아 M3의 verify-네이티브화가 runtime 가치를 갖는다. 비용: 통합 diff당 **1회 Codex**(N 무관 고정) — fleet budget(`resolveFleet`) 무변경. (N=1 verify가 per-worker Implement-Codex와 근접 중복이 우려되면 `MCCP_WORK_MERGED_VERIFY` mode로 조절하되 default는 발화 — silent skip 금지.)

7. **honest degradation 계약(성공 미가정).** Task 0가 Mechanism 1·A2 **둘 다** harness 레벨에서 입증 실패 시: (a) `merge_strategy=disable-parallel` 유지(budget.js 무변경) → **병렬만 gated**, (b) **verify 스테이지는 단일 경로에서 runtime으로 발화**(Codex R1 F2 흡수 — Axis A는 Axis B에 결합 안 됨. verify-네이티브화는 병렬 미해금이어도 실제로 돎), (c) plugin.json은 patch(`1.20.11`)로 하향(verify ship + 병렬 gated) + PRD M3=verify complete·M2 병렬축 "gated 잔존"으로 정직 기록, (d) worktree-merge 활성화만 후속(M4)로 재이연. 이는 M2b spike 정직성 관행 계승 — plan이 "병렬 활성화 성공"을 전제하지 않되, verify-네이티브화의 runtime 가치는 degradation과 무관하게 보존된다.

## Tasks

### Task 0: worktree-merge 메커니즘 실측 spike (Design Decision 3 — 착수 전 필수)
- **Action**: 최소 2-worker 합성 케이스로 (a) **Mechanism 1 상관 신호** 실측 — Workflow `agent({isolation:'worktree'})` 2개가 서로소 파일을 편집한 뒤 `git worktree list --porcelain`로 agent worktree를 enumerate하고, 각 worktree에서 dispatchId를 신뢰 가능하게 회수(envelope 위치 / sentinel 필요 여부 / worktree-sync가 envelope를 이미 parent로 옮겼는지)해 dispatchId↔worktree map을 빌드할 수 있는지. (b) 빌드 가능하면 각 worktree `git diff`를 parent에 `git apply --check`가 통과하는지(서로소 무충돌 검증). (c) **A2 실측 — file/git 격리뿐 아니라 artifact 격리까지**(Codex R1 F1): isolation 없이 `parallel` 2 agent가 같은 parent worktree에서 서로소 파일을 동시 편집할 때 (i) git index·file 경합, **(ii) 같은 plan → 같은 decision-slug로 인한 receipt/tmp/STATE.md 덮어쓰기 경합**을 관찰. A2가 살아남으려면 artifact를 dispatchId로 namespace해야 함을 실증(namespace 없으면 A2 금지 확정). 결과를 machine-readable `merge_strategy ∈ {worktree-merge, same-worktree-atomic, disable-parallel}`로 확정하고 plan body `## Worktree Merge Spike Result`에 append. 어느 것도 입증 못 하면 `disable-parallel` + Design Decision 7 degradation 경로 확정.
- **Mirror**: M2b Task 0 spike 관행(`## Worktree Spike Result` machine-readable flag) + `derive/sources/worktrees.js` enumerate.
- **Validate**: spike 로그 + `merge_strategy` 확정값 + Mechanism 1/A2/degraded 중 선택 근거 기록. 이후 Task는 이 값에 종속.

### Task 1: worktree-merge collect+apply lib (Mechanism 1 경로)
- **Action**: `implement-dispatch/worktree-merge.js` — `buildWorktreeMap({worktrees:[{path}], dispatchIds:[], readEnvelope})`(각 worktree에서 dispatchId 상관 → `{dispatchId: worktreePath}` 또는 누락 표기) · `collectWorkerDiff(worktreePath)`(`git -C <wt> diff --no-ext-diff`, deletion 포함) · `assertPathsClean({paths, cwd})`(**Codex R1 F4** — 적용 대상 경로가 parent에서 사전 clean인지 검사, dirty면 실패) · `applyDisjointDiffs({diffs, cwd, dryRun})`(각 diff `git apply --check` 후 apply, **적용된 patch를 반환/기록**, 충돌 시 실패) · `rollbackApplied({appliedPatches, cwd})`(**Codex R1 F4 — patch-scoped 역적용**: `git apply -R <appliedPatch>`로 적용분만 제거. 광범위 `git checkout --`/`git clean` **금지** — dirty feature branch의 기존 변경·untracked 파괴=data loss). git shell은 이 모듈에 격리, 순수 판정부(map 상관·escape)는 분리. A2 채택 시 apply는 no-op(이미 parent)이나 patch 기록·역적용 rollback은 동일 계약.
- **Mirror**: `dispatch-cli.js:596-618` collectChangedFiles + `worktree-sync.js` atomic 패턴 + `derive/sources/worktrees.js` porcelain 파싱.
- **Validate**: `node --test .../tests/worktree-merge.test.js` — map 정확/dispatchId 누락 표기 / diff collect(수정·추가·삭제) / assertPathsClean(사전 dirty→실패) / dry-run 충돌 감지 / **patch reverse-apply rollback이 사전 dirty·기존 untracked를 보존** / 빈 diff no-op.

### Task 2: aggregate verify oracle
- **Action**: `implement-dispatch/verify.js` — `buildVerifyFocus({changedFiles, partitions, workerFindings, base})`(통합 cross-partition diff를 Codex adversarial-review focus 텍스트로 조립 — "N개 서로소 partition의 통합 결과에서 cross-partition 회귀(public API·import·shared config)를 challenge") + `decideMergedVerify({codexJson, roundCap, mode})`(codex json → `parseVerdict` semantics: `converged`→pass · `divergent`/`critical`→blocking HALT · `unavailable`→mode 정책(enforce=HALT/warn=pass) · N=1 or gated→`skipped`). 순수 함수, fs/Codex 호출은 caller(work.md/dispatch-cli). `MCCP_WORK_MERGED_VERIFY=off|warn|enforce`(default enforce) 파싱은 loud fail-open.
- **Mirror**: `codex-bridge.js:98-109` parseVerdict + `result-schema.js` pure oracle + `design-critique-decide.js` mode 파싱.
- **Validate**: `node --test .../tests/verify.test.js` — focus 조립 / converged→pass / divergent→HALT / critical→HALT / unavailable×{enforce→HALT, warn→pass} / skipped(gated).

### Task 3: dispatch-cli 서브커맨드 (collect/merge/verify 배선)
- **Action**: `dispatch-cli.js`에 (a) `collect-worktrees --dispatch-ids <json> --out <path>`(worktree-merge.buildWorktreeMap → `dispatch-fleet-worktrees.json` emit) · (b) `merge-apply --worktree-map <path> --partitions-file <path> [--dry-run]`(applyDisjointDiffs + collectChangedFiles로 F2 subset 재확인 + 실패 시 rollback) · (c) `verify-focus --reconcile <path> --base <ref>`(verify.buildVerifyFocus emit) · (d) `verify-decide --codex-json <path>`(verify.decideMergedVerify → verdict emit). 기존 `prepare-single`/`prepare-fleet`/`reconcile` back-compat. dormant `--worktree-map`(reconcile:712)이 실제 map을 받도록 상류 배선.
- **Mirror**: `cmdReconcileFleet`(:712) + `collectChangedFiles`(:596) 재사용.
- **Validate**: `node --test .../tests/dispatch-cli.test.js` — collect-worktrees emit / merge-apply dry-run+F2 escape+rollback / verify-decide 5-verdict / 기존 single·fleet 회귀 그린.

### Task 4: budget.js merge_strategy gate honor
- **Action**: Task 0가 입증한 strategy를 `resolveFleet`이 honor. Mechanism 1 → `ENABLING_MERGE_STRATEGY='worktree-merge'` 무변경(이미 gate). A2 → enabling 집합을 `{worktree-merge, same-worktree-atomic}`로 확장(상수 → Set). degraded → 무변경(계속 gated). 어느 경우든 미입증 값·부재는 fail-closed N=1(M2b 계승).
- **Mirror**: `budget.js:130` 기존 gate.
- **Validate**: `node --test .../tests/budget.test.js` — 입증 strategy→run=true / 미입증→N=1 회귀 + M2b 5분기 그린.

### Task 5: work.md Step 3.gate-parallel 활성화 + verify 스테이지
- **Action**: 두 경로에 verify 스테이지 배선:
  - **(단일 경로 — Step 3.gate, Codex R1 F2)** worker 종료 → reconcile ok → commit 전 **aggregate verify**: `verify-focus`(단일 worker 통합 diff) → `codex-invoke.js adversarial-review --base <base> --json` → `verify-decide`. divergent/critical/unavailable(enforce) → HALT(fix-task.md). 이 경로는 apply가 없으므로(단일 worker가 parent를 직접 편집한 M2a) rollback은 patch-scoped(worker 변경만). **worktree-merge gated여도 여기서 verify runtime을 획득**.
  - **(병렬 경로 — Step 3.gate-parallel 실배선, Mechanism 1)** `collect-worktrees`로 `dispatch-fleet-worktrees.json` 빌드 → reconcile `--worktree-map` 공급(F2 실제-diff) → **(gate FIRST)** `mergeVerdicts` verdict≠ok면 parent clean 상태 HALT → **(pre-apply clean assert, F4)** 적용 대상 경로 사전 clean 검사 → **(merge-apply, ok일 때만)** 서로소 diff apply + **patch 기록** → **(integrated test, M2b)** `node --test` → **(aggregate verify, M3)** verify-focus/decide.
  - **(공통 HALT rollback, F4)** verify divergent/critical/unavailable(enforce) → **patch reverse-apply**(`git apply -R` 기록 patch, 광범위 checkout/clean 금지) + fix-task.md HALT. converged → 진행.
  - **(receipt)** controller가 **신규 gate `mccp-implement-verify`** receipt를 원 decision에 anchor + `--merged-verify-verdict`/`--merged-verify-rounds` stamp(Codex R1 F3 — 합성 slug 아님).
  - **(commit)** verify 통과 시에만 Step 4. 모든 tmp `git rev-parse --git-path`(§3.9). lifecycle 경계(M2b Codex F1) 무변경.
- **Mirror**: `work.md` Step 3.gate(307-358) + Step 3.gate-parallel(393-434) 스캐폴드.
- **Validate**: 단일 경로(gated) → verify 발화 + converged → commit. 병렬(입증 strategy) → collect→gate→assert→merge→test→verify→commit. divergent 주입 → patch reverse-apply HALT(부분 적용 0, 사전 dirty 보존).

### Task 6: 신규 gate `mccp-implement-verify` + merged_verify 필드 (Codex R1 F3)
- **Action**: `receipt/aliases.js`에 `mccp-implement-verify` 등록(produces-only, `requires_preceding:[mccp-implement-codex]`, `PHASE_FROM_GATE=implement`). `receipt/schema.js` + `write.js`가 신규 gate-id + `meta.merged_verify_verdict`(enum `converged|divergent|critical|unavailable|skipped`)/`meta.merged_verify_rounds`(int) present-only 필드 + `--merged-verify-verdict`/`--merged-verify-rounds` 플래그 수용. `receipt_hash` 재봉인(P5 tamper-detect 무손상). validate-cmd/dedupe/PR-chain은 신규 gate를 **비침습**으로 통과(produces-only라 requires 없음) — merged-verify를 PR-chain enforcement로 승격하는 것은 명시 backlog.
- **Mirror**: `aliases.js` ALIAS_MATRIX/PHASE_FROM_GATE + `design_grounding_verdict` present-only 필드 선례.
- **Validate**: `receipt/tests/*` — 신규 gate produces-only round-trip / 필드 부재 무영향 / hash 재봉인 / validate-cmd·dedupe·PR-chain 무영향 negative test.

### Task 7: dogfood e2e + honest 검증
- **Action**: Task 0 입증 strategy로 **서로소 2-file 합성 plan**에 `MCCP_WORK_IMPLEMENT_PARALLEL=1` + `MCCP_WORK_MERGE_STRATEGY=<입증값>`로 `/mccp:work --full` 1회 — parallel 2-worker → collect → mergeVerdicts ok → pre-apply assert → merge-apply → integrated test → adversarial-verify converged → commit 관찰. 재현 5종: (verify-divergent) 통합 diff에 회귀 주입 → verify HALT + **patch reverse-apply**(부분 적용 0); (rollback-safety, Codex R1 F4) **사전 dirty 변경 + 기존 untracked 파일**이 있는 feature branch에서 verify HALT → rollback이 그 사전 변경·untracked를 **보존**(data-loss 0); (merge-conflict) 상관/apply 실패 → HALT; (gated) `MCCP_WORK_MERGE_STRATEGY=disable-parallel` → **단일 경로 + aggregate verify 여전히 발화**(Codex R1 F2 — verify runtime 확보); (single-verify) N=1 aggregate verify converged → commit. Task 0 degraded 판정 시: 병렬 dogfood는 생략하되 **단일 경로 verify는 정상 dogfood**(verify-네이티브화는 여전히 runtime).
- **Mirror**: M2b Task 7 dogfood + dashboard cycle pre-ship.
- **Validate**: 단일·병렬 경로 + `node --test`(전체 회귀 그린) + verify verdict `mccp-implement-verify` receipt anchor + 5 재현(특히 rollback-safety).

### Task 8: 버전·문서·PRD·backlog
- **Action**: `plugin.json` `1.20.10 → 1.21.0`(병렬 해금 성공 = PRD 완료 minor; degraded면 `1.20.11` patch). `CLAUDE.md` §1.4 표 1행("verify 네이티브화 + worktree-merge 활성화 (v1.21.0 M3)") + §4 토글(`MCCP_WORK_MERGED_VERIFY` off/warn/enforce + `MCCP_WORK_MERGE_STRATEGY` 값 확장). `CHANGELOG.md` row. renderer footer version 동기(§3.7). PRD M3 in-progress→(ship 시)complete + 병렬 해금 시 M2도 complete. `codex-findings-backlog.md` F4 review-축 `ABSORBED in M3` 표기.
- **Mirror**: §3.7 milestone 체크리스트 + M2b Task 8.
- **Validate**: `grep 1.21.0 plugin.json`(or 1.20.11); PRD 표 diff; footer 일치; backlog row 표기.

## Validation

```bash
# oracle 단위 테스트 (신규 2 + 확장)
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/

# verify oracle 스모크 — divergent → blocking HALT
node -e "const {decideMergedVerify}=require('./plugins/mccp/scripts/lib/implement-dispatch/verify'); console.log(decideMergedVerify({codexJson:{stdout:'divergent'},mode:'enforce'}).verdict)"  # → divergent

# worktree-merge 스모크 — 빈 diff no-op
node -e "const wm=require('./plugins/mccp/scripts/lib/implement-dispatch/worktree-merge'); console.log(wm.applyDisjointDiffs({diffs:[],cwd:'.',dryRun:true}).applied)"  # → 0

# dispatch-cli 회귀 (single·fleet back-compat + 신규 서브커맨드)
node --test plugins/mccp/scripts/lib/tests/dispatch-cli.test.js

# receipt present-only 필드 round-trip
node --test plugins/mccp/scripts/receipt/tests/

# 전체 회귀 (기존 게이트·envelope substrate·M2a/M2b 경로 무손상)
node --test

# 버전 bump 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # → 1.21.0 (or 1.20.11 degraded)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 0가 두 merge 메커니즘 모두 미입증 (harness opaque) | 중간 | Design Decision 7 degradation — verify 스캐폴드만 ship + 병렬 gated 유지 + patch 하향 + 정직 기록. 성공 미가정 |
| dispatchId↔worktree 상관 신호 불신뢰 (Mechanism 1) | 중간 | Task 0 실측이 envelope/sentinel 신뢰도 판정 → 불신뢰면 A2로, A2도 불가면 gated. 상관 실패는 map 누락 표기 → merge-apply 미실행 HALT |
| A2 same-worktree에서 harness가 실제 병렬 안 함(순차) | 중간 | Task 0 관찰. 순차면 병렬 이득 소실 → gated 유지가 정직(순차 병렬 위장 금지) |
| A2 F2 약화로 partition-escape 미검출 | 낮음(A2 채택 시만) | 통합 actual-diff ⊆ ∪partitions∪allowlist 약한 형태 + verify 스테이지가 cross-partition 회귀를 2차로 포착. 약화를 문서에 명시 |
| aggregate verify가 per-worker와 중복(N=1) | 낮음 | Design Decision 6 — N=1은 미발화(per-worker 커버), 병렬 경로만 발화 |
| verify 스테이지가 dual-review를 약화(same-model 오해) | 낮음 | Design Decision 2 — invoker는 Codex 유지(cross-model). same-model skeptic 명시 배제 |
| Codex unavailable로 verify가 상시 HALT(enforce) | 중간 | `MCCP_WORK_MERGED_VERIFY=warn` advisory + 기존 `MCCP_ALLOW_CODEX_UNAVAILABLE` 정책 계승. unavailable→policy 분기 |
| mid-apply 실패로 parent 부분 오염 | 낮음 | verdict-before-apply(Mechanism 1 clean-until-verify) + rollback(commit-free clean 복원). 부분 성공 조용한 통과 금지 |
| M3 비대화(worktree-merge + verify 동시) | 중간 | present-only 필드(신규 gate 회피, DD5) + verify 1회 Codex(fleet budget 무변경) + Task 0가 범위 조기 확정 |

## Open Questions — M3 PRD 매핑

| PRD Open Question | M3 처리 |
|---|---|
| 게이트 합성 방식(척추) | **(c) 완성 답** — aggregate adversarial-verify를 필수 pipeline 스테이지로(DD1). worker-내부(per-worker Implement-Codex) + workflow-외곽(PR-Codex) 위에 pipeline-스테이지(통합 verify) 3층 완성 |
| receipt attribution | **계승** — verify는 controller가 present-only `meta.merged_verify_*`로 stamp(신규 anchor 재설계 없음). worker 3-플래그 anchor 무변경 |
| 자체 IPC 운명 | **계승(부분 폐기)** — M2b 판정 유지. envelope는 attribution + Mechanism 1 dispatchId 상관 신호로 존속(collect map의 근거) |
| 비용 정책 | **답** — verify 1회 Codex 고정 비용 + fleet `resolveFleet` budget 무변경(DD6) |
| 병렬 파일 쓰기 안전 | **답(실증)** — Task 0가 Mechanism 1(격리 F1/F2 as-designed) or A2(약화 F1/F2) 실측 → merge-back 실배선. M2b가 미룬 실증 완료(or 정직 gated) |
| 결정론/재개 | **부분** — `resumeFromRunId` parallel 캐시 replay 계승. verify 스테이지는 결정적(순수 oracle + 1회 Codex). STATE.md N-worker handoff 통합은 잔여 |
| metric baseline | **scope 밖** — 단일 사용자 dogfood 관찰 계승(PRD 명시 open) |

## Acceptance

- [ ] Task 0 spike로 merge 메커니즘 실측 + `merge_strategy` 확정(worktree-merge / same-worktree-atomic / disable-parallel) + degradation 경로 명시
- [ ] `worktree-merge.js` oracle 단위 테스트(map 상관 / diff collect / dry-run 충돌 / rollback / 빈 diff)
- [ ] `verify.js` oracle 단위 테스트(focus 조립 / converged→pass / divergent·critical→HALT / unavailable×mode / skipped)
- [ ] `dispatch-cli` 신규 서브커맨드(collect-worktrees / merge-apply / verify-focus / verify-decide) + 기존 single·fleet 회귀 그린
- [ ] `budget.js` gate가 입증 strategy honor(미입증 → N=1 fail-closed 계승)
- [ ] 신규 gate `mccp-implement-verify` produces-only 등록 + `meta.merged_verify_*` round-trip + hash 재봉인 + validate-cmd/dedupe/PR-chain 비침습
- [ ] `MCCP_WORK_MERGE_STRATEGY=disable-parallel`(gated) → **병렬 M2a/M2b 단일 동작 무변화**(단, 단일 경로 aggregate verify는 발화)
- [ ] 입증 strategy + N>1 → collect → mergeVerdicts ok → pre-apply assert → merge-apply → integrated test → **adversarial-verify converged** → commit
- [ ] aggregate verify는 Codex(cross-model) — same-model skeptic 치환 아님(dual-review 무손상, DD2)
- [ ] `plugin.json` 1.21.0(or degraded 1.20.11) + CLAUDE.md(§1.4 + §4)/CHANGELOG/PRD/backlog 갱신
- [ ] Patterns mirrored, not reinvented (plan-fanout aggregate / parseVerdict / collectChangedFiles / resolveFleet gate / aliases 신규 gate)
- [ ] **Codex R1 F1**: A2는 file/git 격리만으론 불충분 — receipt/tmp/state가 decision-keyed라 concurrent A2 worker가 덮어씀 → dispatchId artifact namespace 전까지 금지, Task 0가 artifact 격리 실증. Mechanism 1 primary
- [ ] **Codex R1 F2**: aggregate verify가 **단일·병렬 양 경로** commit 전 발화 → worktree-merge gated여도 verify runtime 확보(Axis A ⊥ Axis B). 척추 질문 (c) 답이 병렬 활성화와 무관하게 성립
- [ ] **Codex R1 F3**: 합성 `<slug>-merged` decision 대신 **실제 gate `mccp-implement-verify`**(충돌 회피 + audit anchor). enforcement는 runtime verify-decide HALT(receipt 무관 차단). PR-chain 전파는 명시 backlog
- [ ] **Codex R1 F4**: rollback은 **patch reverse-apply**(`git apply -R` 기록 patch)만 — 광범위 checkout/clean 금지(dirty feature branch 기존 변경·untracked 파괴=data loss). pre-apply clean assert + dirty-branch rollback-safety 재현

## Design Critique

> impeccable `design_signal`은 "Design Decisions"(소프트웨어 아키텍처) 키워드 false-positive 가능. Files to Change가 전부 백엔드 오케스트레이션 `.js` + 문서(`.md`/`.json`)이고 렌더 surface(`.css/.tsx/.html/.claude/cache/*.md`) 0 — impeccable 스코프("Not for backend-only or non-UI tasks") 외.

- 라운드 수: 1
- 합치 결론: 렌더 surface 부재 → 디자인 findings 0 → `decideCritique([])` = CONVERGED
- verdict: converged

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 absorption)
- Codex raw verdict: `needs-attention` — "No-ship: the plan activates high-risk merge/verify behavior while leaving isolation, receipt gating, and rollback invariants unenforced in the actual command chain."
- 합치 결론 (absorption 후): **converged** — Codex의 4 HIGH finding을 plan 본문에 전면 흡수(A2 artifact-격리 정정 + verify 양-경로 결합해제 + 합성 decision→실제 gate 승격 + patch-scoped rollback). 4건 모두 plan-편집으로 완전 해소 → DIVERGENT_UNRESOLVED 없음 → cap 내 수렴.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why / 흡수 위치 |
  |---|---|---|---|
  | F1 A2 same-worktree는 concurrent worker 안전 아님(receipt/tmp/state가 decision-keyed → 덮어씀) | HIGH | ACCEPT_NOW | DD3 정정 + Task 0(c)/Risks — file/git 격리 ≠ artifact 격리. A2는 dispatchId namespace 전까지 금지, Mechanism 1 primary. Explorer B "실행 안전" 결론의 artifact-race 누락 정정 |
  | F2 merged verify가 worktree-merge gated 시 dormant(척추 질문 미해결) | HIGH | ACCEPT_NOW | DD6 정정 + Task 5/7 — aggregate verify를 **단일·병렬 양 경로** commit 전 발화. Axis A ⊥ Axis B, verify runtime이 병렬 활성화와 무관하게 성립 |
  | F3 합성 `<slug>-merged` receipt가 gate 강제 밖 + slug 충돌 | HIGH | ACCEPT_NOW | DD5 정정 + Files/Task 6 — 실제 gate `mccp-implement-verify`(produces-only, collision-resistant). enforcement=runtime verify-decide HALT. PR-chain 전파는 backlog |
  | F4 apply 후 rollback이 dirty feature branch 기존 변경·untracked 파괴(data loss) | HIGH | ACCEPT_NOW | DD4 정정 + Task 1/5/7 — patch reverse-apply(`git apply -R`)만, 광범위 checkout/clean 금지. pre-apply clean assert + dirty-branch rollback-safety 재현 |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md` (F3 sub-scope: merged-verify verdict를 PR-chain-check enforcement로 전파 — dual-review 재설계 표면이라 별도 axis)
- Open Questions: 없음 (auto-CRITICAL catalog 무관 — F4 data-loss는 patch reverse-apply로 해소, 미해결 아님)
- Codex session 참조: thread `019f4074-c2cd-7483-b16e-ad38d4bd686c`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

> Task 0 spike는 pre-specified 결정 트리(DD3 Mechanism 1/A2/disable-parallel + DD7 honest degradation)의 empirical 실측일 뿐 신규 아키텍처 결정이 아님 — plan-codex가 각 outcome의 handling까지 이미 검토·수렴함(4 HIGH 흡수). implement diff는 plan의 Files to Change ⊆ 관계 유지 예정.

## Worktree Merge Spike Result

<!-- Task 0 empirical probe — 2026-07-08. Machine-readable strategy flag below is consumed by resolveFleet + work.md route decision. -->

- **merge_strategy: `disable-parallel`** (N=1) — honest degradation (DD7), 사용자 확정
- **git 메커니즘: PROVEN (합성 실측, agent spawn 0)** — worktree-merge.js 활성 가능 substrate
- **live harness 상관: UNPROVEN (cost hard-ceiling 금지)** — Mechanism 1 활성화 승격 조건

### 실측 A — git 메커니즘 (합성 scratch repo 2-worktree, agent 0)

M2b는 "Workflow **스크립트** collect API 없음"을 발견했으나, 이는 **샌드박스** 한정이었다. post-`parallel()` **컨트롤러**(메인 세션)는 git 레벨 collect가 가능함을 실측:

| 관측 | 결과 |
|---|---|
| 컨트롤러가 `git worktree list --porcelain`로 agent worktree enumerate | **가능** (2개 worktree 모두 노출 — `derive/sources/worktrees.js` 선례 확인) |
| 각 worktree `git -C <wt> diff HEAD` → 서로소 patch collect | **가능** (수정·신규파일 모두 포함) |
| pre-apply clean assert (적용 대상 경로 사전 clean 검사, F4) | **가능** |
| 서로소 patch `git apply --check` → parent 무충돌 | **통과** |
| `git apply` 2개 → parent에 통합 (수정 + 신규파일) | **성공** |
| patch-scoped `git apply -R` rollback (기록 patch만 역적용, F4) | **성공** — 수정 복원 + 신규파일 제거 |
| **rollback-safety (F4)**: 사전 dirty tracked(`parent.txt`) + 기존 untracked(`user-untracked.txt`) 보존 | **보존 = data loss 0** (역적용은 기록 patch 파일만 건드림) |
| 빈 diff | `git apply --check` nonzero → lib은 **명시 no-op** 처리 필요 |
| Windows CRLF | autocrlf 정규화 noise 존재 → `--no-ext-diff` + 내용 기반 비교 유의 |

### 실측 B — live harness 상관 (미실행, cost-gated)

- Mechanism 1 end-to-end 활성화의 잔여 관건: `parallel(fleet.map(agent({isolation:'worktree'})))` 반환 후 각 agent worktree(`.claude/worktrees/agent-<uuid>`, M2b 실측 위치)에서 injected `dispatchId`를 신뢰 가능하게 회수(worktree 내 `.claude/state/dispatches/<dispatchId>.envelope.json` 잔존 여부) → worktree↔dispatchId map 빌드.
- 이 실측은 **live 2-worker Workflow 실행**을 요구하나, cost-state `hard_ceiling_reached:true`($314.50, critical tier)로 fan-out spawn이 정책상 금지됨. **미실행 = 미입증**.

### 판정 근거 (DD3 · DD7 · Codex R1 F1/F2)

- git substrate(실측 A)는 입증됐으나 harness 상관(실측 B)이 cost-gated로 미입증 → Mechanism 1 end-to-end **미완성**. A2(same-worktree)는 Codex R1 F1(artifact 격리 미비 — decision-keyed receipt/tmp/state 덮어씀)로 **금지 유지**. 유일 안전 강등: **`disable-parallel`**(M2b 계승).
- 그러나 DD6/F2에 따라 **aggregate verify 스테이지는 단일 경로(Step 3.gate)에서 실제 발화** — verify-네이티브화의 runtime 가치는 병렬 gated와 무관하게 M3에서 확보됨.
- M3는 worktree-merge.js(collect/apply/reverse-rollback) + verify.js oracle + CLI 서브커맨드 + 신규 gate `mccp-implement-verify`를 **build + unit-test**하되, N-worker EXECUTION은 `resolveFleet`이 `disable-parallel`을 소비해 **N=1 강등**. worktree-merge 활성화는 실측 B(live 상관) 입증 시 후속 승격(M4).
- 버전: **degraded patch `1.20.11 → 1.20.12`**(verify ship + 병렬 gated). PRD M3=verify complete, M2 병렬축 "gated 잔존".
