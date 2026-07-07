# Implementation Report: workflow-orchestration M2a — single-worker Workflow 이전

## Summary

`/mccp:work` Step 3의 implement 격리 위임 채널을 `Task`에서 `Workflow` primitive의 `agent()`로 **등가 이전**할 수 있게 했다(병렬화 전 — M2b가 `parallel`로 확장할 seam). 핵심은 회수 판정을 **반환값 ∧ envelope ∧ receipt-store 3자 reconciliation**(`deriveVerdict`)으로 통일한 것으로, 기존 envelope-only `merge`를 Workflow·Task **양 경로**에서 대체하며 F1 invariant + F2 reconciliation + F3 anchor 검증을 회수 채널 불문 적용한다. `MCCP_WORK_IMPLEMENT_WORKFLOW` default-off kill switch로 3-state(인라인 / Task-격리 / Workflow-격리), Workflow 미가용은 fail-open으로 Task 경로 유지.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (일치) |
| Confidence | — | High — 순수 oracle + CLI substrate 재사용, LLM-runtime leg만 미검증 |
| Files Changed | 9 (Files to Change) + Task 4 footer sync | 13 (3 created, 10 modified) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | result-schema + 3자 reconciliation oracle | [done] Complete | `deriveVerdict` 6-verdict, invariant-first fail-closed (아래 Deviation 참조) |
| 1 | worker prompt schema 반환 계약 + `emit-workflow-args` | [done] Complete | structured 반환 계약 envelope mark와 병존 |
| 2 | Workflow 스크립트 (얇게) | [done] Complete | 단일 `agent()`, self-contained schema 포트 |
| 3 | work.md Step 3 wiring (lifecycle 경계 + reconcile/anchor gate) | [done] Complete | 3-state 재구성 + `reconcile` 서브커맨드(아래 Deviation) + worktree-safe tmp |
| 4 | 버전·문서·PRD milestone | [done] Complete | 1.20.4→1.20.5, footer 동기, PRD milestone(이미 갱신됨) |
| 5 | dogfood e2e | [done] Complete | 실제 CLI 바이너리 e2e 9/9 (LLM-runtime leg는 미실행 — 아래 Issues) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] Pass | `node -c` 5개 신규/변경 JS + `bash -n` work.md 4 블록 전부 |
| Unit Tests | [done] Pass | result-schema 22 + dispatch-cli 29 + i18n-surface 10 = 61/61 |
| Build | N/A | 순수 Node 스크립트 (빌드 스텝 없음) |
| Integration | [done] Pass | dogfood e2e 9/9 (실제 `dispatch-cli.js` 바이너리, git sandbox) |
| Edge Cases | [done] Pass | oracle 6 verdict 분기 + first-match 순서 + bare-input 정규화 |

전체 회귀(`node --test`, 전 트리): **2717개 중 2706 pass, 6 fail — 6개 전부 pre-existing/환경적, M2a 유발 0건**(base HEAD 57c6b64에서 동일 실패 확정). 상세는 Issues 참조.

### Design Grounding (v1.18.22)

N/A (no design trigger). 순수 백엔드 orchestration — rendered design surface 0. Cross-gate dedupe 경로가 2.5.5b/2.5.5c를 건너뛰었고, 플랜 자체 Design Critique는 CONVERGED(impeccable scope 밖).

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/implement-dispatch/result-schema.js` | CREATED | +~230 |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/result-schema.test.js` | CREATED | +~230 |
| `plugins/mccp/scripts/workflows/implement-dispatch.js` | CREATED | +~55 |
| `plugins/mccp/scripts/lib/dispatch-cli.js` | UPDATED | +192 |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | UPDATED | +203 |
| `plugins/mccp/commands/work.md` | UPDATED | +144/-48 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1/-1 (1.20.4→1.20.5) |
| `CLAUDE.md` | UPDATED | §1.4 표 1행 + §4 토글 |
| `CHANGELOG.md` | UPDATED | [1.20.5] row |
| `.claude/prds/workflow-orchestration.prd.md` | UPDATED | M1 complete + M2 in-progress (선반영) |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer v1.20.5 동기 (Task 4) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer assertion v1.20.5 (footer bump 귀결) |

## Deviations from Plan

1. **oracle 판정 순서 = invariant-first** (플랜 라인 60 내부 모순 해소). 플랜 라인 60은 reconcile(2·3·4)을 invariant(5)보다 먼저 뒀으나, 플랜 라인 105 smoke test(`deriveVerdict({status:'ok',receiptsAdded:['mccp-pr-codex/foo.json']})` → `invariant-violation`)와 Risk 라인 122 Codex F1 belt-and-suspenders("반환값 receiptsAdded에서 mccp-pr-codex leak 검출 → HARD HALT")는 둘 다 **반환값 단독·최우선** invariant 발화를 요구한다. invariant(PR/commit leak = 되돌릴 수 없는 외부 상태)는 가장 심각하므로 reconcile-mismatch로 마스킹되면 안 된다 — 안전·테스트가능성·Codex 의도 3자가 invariant-first를 가리켜 그렇게 구현. 플랜 라인 60 순번은 오류로 판단, smoke test가 교정. **새 아키텍처 결정 아님** — 플랜의 명시 Validation/Risk 요구 충족.

2. **`dispatch-cli.js reconcile` 서브커맨드 추가** (Task 3d의 Bash→`deriveVerdict` wiring). 플랜은 work.md가 `deriveVerdict({...})`를 호출한다고 명시했으나 Bash에서 fs-read 주입 + 호출을 거대 inline `node -e` blob으로 하면 취약하다. `merge`의 sibling로 `reconcile`(envelope+store 읽기 + `--result-file` Workflow / `--from-envelope` Task 자동 판별)을 두어 깨끗·**테스트 가능**하게 했다. 플랜의 "dispatch-cli.js UPDATE" 파일 범위 안 + `merge`→`deriveVerdict` 통일(Task 3e) 요구의 기계적 실현 — 새 아키텍처 결정·파일 확장 아님.

3. **plan을 archive하지 않고 `.claude/plans/` 유지** (M1 선례 + workflow-orchestration cycle 관행). M1 plan(`workflow-orchestration-m1-plan-fanout.plan.md`)이 `.claude/plans/`에 있고 PRD Plan-cell이 거기를 가리키므로, 일관성 + receipt `plan_hash` 보존 + PRD 링크 무손상을 위해 M2a plan도 유지. 완료 마커는 PRD Delivery Milestones status.

4. **renderer footer sync 3파일** (Task 4 "footer version 동기" 귀결). `html.js`/`markdown.js` footer + 그 assertion을 검증하는 `i18n-surface.test.js`는 Files to Change 표에 없지만 Task 4가 명시한 §3.7 footer 동기 + bump의 기계적 필연(assertion 미갱신 시 회귀). 새 표면 확장 0.

## Issues Encountered

- **전체 회귀 6 fail 전부 M2a 무관 (base HEAD에서 동일 실패 확정 / 환경적)**:
  - `receipt-prompt`/`receipt-skill` module-load G1 (3): base 실패 — receipt hook 미수정.
  - `perf-budget < 1000ms`: 동시 부하 flake — 격리 시 통과.
  - `validate-callsite-lint` (pr.md:165 missing --plan): base 실패 — pr.md 미수정(v1.3.1 미완 migration).
  - `design-critique-loop-e2e F) fixture`: base 실패 — design-critique 미수정.
  - 검증 방법: `git stash -u`로 base HEAD 복원 후 동일 실패 재현 확인.
- **dogfood LLM-runtime leg 미실행 (정직 고지)**: cost-tier=critical + 실제 `/mccp:work --full`은 진짜 agent를 spawn하는 고비용·재귀적 작업이라, LLM이 실제 `Workflow`/`Task` tool을 호출하는 leg는 **실행하지 않았다**. 대신 실제 `dispatch-cli.js` 바이너리를 통해 Step 3 파이프라인 전체(prepare-single → emit-workflow-args → mark → reconcile)를 git sandbox에서 e2e 구동해 on/off 양 경로 + 4 Codex 흡수(F1 lifecycle·F2 reconcile·F3 anchor·invariant)를 재현했다(9/9). LLM `agent()` 실행 자체는 plan-fanout과 동일하게 단위검증 불가한 샌드박스 leg다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `implement-dispatch/tests/result-schema.test.js` | 22 | schema 무결성 + 6 verdict 전 분기 + invariant-first 순서 + bare-input |
| `tests/dispatch-cli.test.js` (신규분) | 11 | schema 반환 계약(1) + emit-workflow-args(3) + reconcile Workflow/Task/F1/F2/F3(7) |
| `renderer/tests/i18n-surface.test.js` (갱신분) | 2 | footer v1.20.5 동기 가드 |
| dogfood-m2a.js (scratchpad e2e) | 9 | 실제 CLI 바이너리 파이프라인 on/off + 4 흡수 |

## Next Steps

- [ ] `/mccp:code-review` 로 변경 review
- [ ] `/mccp:prp-commit` 로 커밋
- [ ] `/mccp:pr` 로 PR (cross-gate dedupe → PR-Codex 정상 대조; plan-codex + implement-codex receipt anchored)
- [ ] M2b (다음 milestone): N-worker `parallel` 병렬화 · 자체 IPC 완전 폐기 재평가 · 게이트 pipeline 합성 · attribution structural-input 승격 · `resumeFromRunId`/STATE.md 통합
