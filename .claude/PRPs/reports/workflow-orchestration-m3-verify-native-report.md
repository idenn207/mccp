# Implementation Report: workflow-orchestration M3 — verify 네이티브화 + worktree-merge substrate

**Plan**: `.claude/plans/workflow-orchestration-m3-verify-native.plan.md`
**Branch**: `v1-21-0-workflow-orchestration-m3`
**Version**: `1.20.11 → 1.20.12` (degraded patch — verify ship + 병렬 gated, DD7)
**Date**: 2026-07-08

## Summary

M3의 두 축을 **정직하게 부분 종료**:

- **(A) verify 네이티브화 — SHIPPED (runtime)**: 통합 diff를 worker 밖에서 1회 cross-model(Codex) adversarial review하는 `Step 3.verify`를 `/mccp:work`의 **필수 pipeline 스테이지**로 장착. PRD Open Question 1(c)(게이트 합성 척추)의 답. **DD6/Codex R1 F2 — 단일 경로에서도 발화**하므로 병렬 gated여도 실제 runtime 가치 확보.
- **(B) worktree-merge substrate — BUILT + DORMANT**: collect/apply/patch-scoped rollback lib + dispatch-cli 서브커맨드 + 신규 gate를 완비·unit-test하되, `merge_strategy=disable-parallel`로 실행 gated.

## Task 0 spike 결과 (merge_strategy 결정)

| 축 | 결과 |
|---|---|
| git 메커니즘(enumerate·diff·apply·reverse-apply·rollback-safety) | **PROVEN** (합성 scratch repo 2-worktree, agent spawn 0) |
| live harness 상관(Workflow worktree↔dispatchId) | **UNPROVEN** — cost `hard_ceiling_reached:true`($314.50)로 live 2-worker probe 정책상 금지 |

→ 사용자 확정 **honest degradation (DD7)**: `merge_strategy=disable-parallel`, 병렬 gated, verify는 단일 경로 발화.

## Tasks

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | worktree-merge spike | 완료 | 합성 실측(git 메커니즘 입증) + `disable-parallel` 확정, plan body에 machine-readable 기록 |
| 1 | `worktree-merge.js` + tests | 완료 | 12 tests (pure + real-git F4 rollback-safety) |
| 2 | `verify.js` oracle + tests | 완료 | 20 tests (focus/mode/verdict/block matrix) |
| 3 | dispatch-cli 서브커맨드 + tests | 완료 | collect-worktrees/merge-apply/rollback-apply/verify-focus/verify-decide + 47 tests green |
| 4 | budget.js merge_strategy gate | 무변경(조건부) | disable-parallel → `ENABLING_MERGE_STRATEGY='worktree-merge'` gate 무변경 = 계속 gated (plan 규정대로) |
| 5 | work.md Step 3.verify wiring | 완료 | 공유 verify 스테이지 + F4 patch reverse-apply + collect/merge-apply 배선 |
| 6 | 신규 gate `mccp-implement-verify` + merged_verify 필드 | 완료 | produces-only, non-invasive, present-only 필드 + 11 tests |
| 7 | dogfood e2e | 완료 | Step 3.verify bash 시퀀스 e2e(mocked converged) + 5 재현 unit-test 커버 |
| 8 | 버전·문서·PRD·backlog | 완료 | 1.20.12 + footer sync + CLAUDE.md §1.4/§4 + CHANGELOG + PRD + backlog |

## Codex R1 4H 흡수 (plan-codex 수렴 승계)

- **F1** — A2 same-worktree artifact-격리 미비(decision-keyed receipt/tmp/state 덮어씀) → Mechanism 1 primary, A2 금지.
- **F2** — verify 양-경로(단일·병렬) commit 전 발화 → 병렬 gated여도 verify runtime 확보(Axis A ⊥ Axis B).
- **F3** — 합성 `<slug>-merged` decision → 실제 gate `mccp-implement-verify`(produces-only, non-invasive). PR-chain 전파는 backlog.
- **F4** — 광범위 checkout/clean rollback → **patch reverse-apply**만(dirty feature branch data-loss 회피). pre-apply clean assert + rollback-safety 재현.

## Validation

| Level | Status | Notes |
|---|---|---|
| implement-dispatch oracle | ✅ 114 pass | verify + worktree-merge + budget + partition + result-schema |
| dispatch-cli | ✅ 47 pass | 기존 single/fleet 회귀 + M3 서브커맨드 |
| receipt (merged-verify + schema + aliases + write) | ✅ green | 신규 gate round-trip + tamper-protection + non-invasive |
| renderer i18n-surface (footer version) | ✅ green | v1.20.12 동기 |
| 전체 sweep (`node --test`, 220 files) | ⚠️ 1 pre-existing fail | `pr.md:165` validate-callsite-lint(--plan 누락) — **HEAD(642d032)에 이미 존재**, M3 무관. pr.md는 unmodified. M3 변경은 100% green |

## Deviations from Plan

- **budget.js / budget.test.js / implement-dispatch.js 무변경** — disable-parallel(honest degradation) 결과로 plan의 조건부 UPDATE가 no-op으로 해소(plan Task 4/5 명시: "미입증 시 무변경 = 계속 gated"). 정확히 규정대로.
- **cli.js usage 문자열** — write 플래그 추가의 자연스러운 확장(Files to Change의 write.js UPDATE 범위).
- **plan 미archive** — dashboard/workflow-orchestration cycle 관행(완료 plan은 `.claude/plans/` 유지 — M1/M2a/M2b 동일). PRD status 테이블 + CHANGELOG가 완료 마커.

## Known / Deferred

- **pr.md:165 pre-existing lint fail** — M3 scope 밖(pr.md는 Files to Change 아님, dedupe 무손상 위해 미수정). 별도 1-line fix(--plan 추가) 권장.
- **worktree-merge 활성화(live 상관 입증)** → M4 이연.
- **merged-verify verdict의 PR-chain 전파** → backlog(2026-07-08 row).

## Next Steps

- [ ] 사용자 검토 후 `/mccp:prp-commit` + `/mccp:pr` (commit/PR은 outward — 사용자 트리거)
- [ ] (선택) pr.md:165 pre-existing lint fix 별도 처리
