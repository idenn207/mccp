# Implementation Report: Workflow Orchestration Live Activation — M1

## Summary

fan-out(`MCCP_PLAN_FANOUT`)·병렬 implement(`MCCP_WORK_IMPLEMENT_PARALLEL`)를 **default 발화**로 반전하고(단일은 명시적 opt-out), cost-state 부재 시 `COST_STATE_UNKNOWN` fail-closed skip을 **fail-open(green 가정)**으로 뒤집었다. 폭주 방지는 구조적 per-dispatch 상한 + USD critical/`hard_ceiling` bomb-detector + **cost-state 독립 누적 worker-launch 절대 상한**으로 재정의(notice/warning tier autoDisable 제거). 실제 LLM 발화 없이 seed→mark→collect→reconcile 배선을 관측하는 저비용 검증 harness(합성 git-worktree e2e)를 추가해 M2 live 완주 전 배선 끊김을 사전 제거했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (설계대로) |
| Files Changed | 15 (create 5 + update 8 + verify 1 + doc) | create 5 + update 10 (footer sync 2 + footer test 1 추가) |
| New tests | 3 파일 | 3 신규 파일(27 tests) + 2 갱신 파일 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | fan-out oracle 발화 반전 (`plan-fanout/budget.js`) | [done] | default on + `costFailOpen` + critical-only narrow + `hard_ceiling` skip + injected `runawayClamp` |
| 2 | parallel oracle 발화 반전 (`implement-dispatch/budget.js`) | [done] | 동형. fail-open 경로 reason=`cost-failopen`. merge-strategy/single-partition/budget-cap gate 불변 |
| 3 | command-body default 반전 + 발화 로그 (`work.md`·`plan.md`) | [done] | `PARALLEL :-0→:-1`, WORKFLOW default 미변경(Codex F1), route oracle 위임, costFailOpen+runaway forward |
| 4a | cost-state 독립 runaway 안전판 (`orchestration-runaway.js` CREATE) | [done] | pure `clampForRunaway` + 세션 키 counter(lock+atomic) + `MCCP_ORCHESTRATION_MAX_AGENTS` |
| 4b | work route oracle (`implement-dispatch/route.js` CREATE) | [done] | `resolveWorkRoute` 순수 함수, work.md bash가 단일 SoT로 호출 |
| 5 | 저비용 검증 harness (`dispatch-wiring-harness.test.js` CREATE) | [done] | 합성 worktree seed→mark→collect→reconcile → verdict ok + anchor + F1 no-leak + merge/rollback smoke, LLM 0회 |
| 6 | fanout-* agent install-cache blocker 해소 | [done] | 4/4 frontmatter·도구셋(Read/Grep/Glob only) 검증 통과 — 손상 없어 수정 불요. version bump이 fresh cache 확보 |
| 7 | version bump + CHANGELOG | [done] | `1.22.0 → 1.22.1` + html.js/markdown.js footer sync + CHANGELOG row |
| 8 | 문서화 (`CLAUDE.md`) | [done] | §1.4 row + §4 토글 default 반전·kill switch·runaway cap |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| plan-fanout/tests | [done] Pass | 43/43 |
| implement-dispatch/tests (incl route + harness) | [done] Pass | 142/142 |
| lib/tests (incl orchestration-runaway) | [done] Pass* | 818/822 pass; **1 pre-existing fail (clean main도 806/810 fail 1 — 본 milestone 무관)** + 3 skip |
| renderer/tests i18n-surface (footer) | [done] Pass | 10/10 (stale v1.21.2 → v1.22.1 sync) |
| plugin.json version | [done] | 1.22.1 |
| fanout agent frontmatter | [done] | 4/4 (no Write/Edit/Bash) |

\* dispatch 전 회귀(플랜 acceptance): implement-dispatch 142/142 + plan-fanout 43/43 전량 green. lib/tests의 1 실패는 clean main(stash 대조)에서도 동일 재현되는 pre-existing failure로 본 변경과 무관(verdict-label/derive 계열, 내 diff가 해당 모듈 미touch).

### Design Grounding (v1.18.22)

Design Grounding: N/A (no design trigger — cross-gate dedupe 경로로 2.5.5b/2.5.5c skip + 전 변경이 backend JS로 렌더 surface 없음).

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-fanout/budget.js` | UPDATED | 발화 반전 + fail-open + critical-only + runawayClamp DI |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATED | 동형 + fail-open reason |
| `plugins/mccp/scripts/lib/orchestration-runaway.js` | CREATED | cost-state 독립 runaway 안전판 |
| `plugins/mccp/scripts/lib/implement-dispatch/route.js` | CREATED | `resolveWorkRoute` 오라클 |
| `plugins/mccp/commands/work.md` | UPDATED | default 반전 + route oracle 위임 + forward |
| `plugins/mccp/commands/plan.md` | UPDATED | fan-out default on + forward + 발화 로그 |
| `plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js` | UPDATED | 반전/fail-open/critical-only/runaway case |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` | UPDATED | 동형 |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/route.test.js` | CREATED | env 조합 전수(12) |
| `plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js` | CREATED | 우회 불가 + degraded clamp + counter(12) |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/dispatch-wiring-harness.test.js` | CREATED | 합성 worktree e2e(3, LLM 0회) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.22.0 → 1.22.1 |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer v1.22.1 sync |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer 테스트 v1.22.1 (stale 복구) |
| `CHANGELOG.md` / `CLAUDE.md` | UPDATED | v1.22.1 row + §4 토글 |

## Deviations from Plan

- **runaway clamp 배선을 의존성 주입(DI)으로**: 플랜 Task 1/2가 budget.js에 "runaway clamp 적용"을 요구했으나, budget.js의 "pure, dep-free" 불변식(모듈 헤더에 강하게 명시)을 보존하기 위해 `opts.runawayClamp` 함수 주입 방식을 택했다(기존 `costStateRead`/`tierFor`/`contextStateRead` 주입 패턴 미러). disk I/O는 `orchestration-runaway.js`가 소유하고 command body가 counter를 읽어 closure로 전달. 결과·불변식 동일, 결합도 최소.
- **footer 테스트 v1.21.2→v1.22.1 동반 수정**: footer version(html.js/markdown.js)을 §3.7대로 bump하면서, 이미 stale였던(1.22.0 사이클 누락) `i18n-surface.test.js` footer assert 2건을 함께 sync. 내가 편집한 표면의 직접 테스트라 in-scope 유지.
- **plan 미archive (§3.11)**: prp-implement Phase 5 default는 `completed/` 이동이나, live-activation PRD는 M1만 완료(다중 milestone)이고 plan 경로가 receipt/PR에서 참조되므로 `.claude/plans/`에 유지. 전체 PRD 완료 시 `/mccp:archive-complete`로 이관.

## Issues Encountered

- **harness collect-worktrees ambiguous (Windows 8.3 short-name)**: `os.tmpdir()`가 short name(`SKYPAR~1`)을, git worktree list가 long name(`skypark207`)을 보고해 self-filter 실패 → root의 parent placeholder envelope까지 세어 ambiguous. `setupRepo`가 git canonical toplevel을 root로 반환하도록 수정해 해소(실제 repo 경로엔 8.3 mismatch 없어 프로덕션 무해 — 테스트 아티팩트).
- **plan-codex receipt stale (recovery+dedupe 순서)**: Phase 0.0 recovery가 (dedupe 섹션 추가 전) plan-codex receipt를 써서, 2.5.1 dedupe가 `## Codex Implementation Review`를 추가하며 plan hash 변경 → stale. plan 실질 리뷰 내용 불변이므로 plan-codex receipt를 현재 hash로 refresh해 복구(§3.1).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `implement-dispatch/tests/route.test.js` | 12 | route 결정 env 조합 전수 + 4 route 도달성 |
| `tests/orchestration-runaway.test.js` | 12 | clamp 우회 불가 + degraded floor + counter session reset |
| `implement-dispatch/tests/dispatch-wiring-harness.test.js` | 3 | 합성 e2e ok+anchor / F1 no-leak / merge+rollback patch smoke |
| `plan-fanout/tests/budget.test.js` | +갱신 | 28 (반전/fail-open/critical-only/hard_ceiling/runaway) |
| `implement-dispatch/tests/budget.test.js` | +갱신 | 39 (동형) |

## Next Steps

- [ ] `/mccp:pr`로 PR 생성 (PR-Codex 게이트 — 메모리 노트: legacy plan receipt로 dedupe fail-closed 가능, 재발화 후 converged 확인)
- [ ] M2 — 실제 LLM-runtime 발화 관찰 + calibrated 2차 임계 (backlog)
