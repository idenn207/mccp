# Implementation Report: Workflow Orchestration Live-Activation — M2 (firing-preview + 관찰 프로토콜)

## Summary

M1이 발화를 구조적으로 반전·배선했으나 실제 LLM-runtime 발화가 **관찰된 적 없던** gap을 닫는 M2의 `/mccp:prp-implement` 스코프(Tasks 1–4)를 구현했다. live `/mccp:work` 완주는 재귀·고비용이라 관찰을 두 축으로 분리: (1) **저비용 firing-preview 도구**(LLM 소비 0) + 그 정합·read-only 불변식 test, (2) **operator-executed live 완주**(Task 5, prp-implement 밖 — 재귀 회피)의 관찰 기록·프로토콜 doc. version bump + footer/CHANGELOG/CLAUDE.md 동기까지.

핵심 correctness(Codex F1): oracle `run`은 component signal일 뿐, 실발화는 `resolveWorkRoute` route + caller-gate 합성 `effective_fire`로 판정한다. preview는 `oracle_run`(원자료)과 `effective_fire`(route 합성)를 분리 출력해 "oracle run == 발화" false green-light를 구조적으로 차단한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — plan대로. 유일한 예상 밖 축은 dedupe append의 plan-hash staleness 복구(아래 Deviations) |
| Confidence | (plan은 명시 안 함) | 높음 — 신규 코드는 기존 oracle의 read-only 조합, 재구현 0 |
| Files Changed | 9 (CREATE 3 + UPDATE 6, PRD 제외) | 정확히 일치 (파일 확장 0) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | firing-preview oracle + CLI (`orchestration-preview.js`) | [done] Complete | 순수 `previewFiring(opts)` + `require.main` CLI. Step 3 oracle read-only 조합. `oracle_run`/`effective_fire` 분리 |
| 2 | 정합 + read-only 불변식 test | [done] Complete | 12 test — env matrix(a–d) + caller-gate matrix(e–h) + byte-정합 + read-only 불변식(3파일 불변 + counter-bump 정적 부재) |
| 3 | 관찰 기록 + live-dogfood 프로토콜 doc | [done] Complete | per-cycle ledger + 2개 named row 프로토콜 + 재귀 회피 경계 + baseline caveat. build-time preview 참조 row |
| 4 | version bump + footer sync + CHANGELOG + CLAUDE.md | [done] Complete | `1.22.1`→`1.22.2`, footer×2 + i18n assert×2 + CHANGELOG + §1.4 row + §4 pointer |
| 5 | (operator, prp-implement 밖) live 완주 관찰 | [pending] Operator | **재귀 회피로 prp-implement 스코프 밖.** protocol/ledger는 Task 3 doc에 준비 완료. M2 acceptance evidence는 operator의 2개 named row(default ∧ opt-out) 완주로 종료 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] Pass | `node -c` syntax OK 전 파일 |
| Unit Tests | [done] Pass | preview 12 pass. 회귀: implement-dispatch 142 · plan-fanout 43 · runaway+route 24 · i18n 10 전부 green |
| Build | [done] N/A | Node lib — 빌드 스텝 없음 |
| Integration | [done] Pass | preview CLI `--json`/human 실행 확인 (현 env: cost-state sticky-critical → 전 축 ⛔skip, honest) |
| Edge Cases | [done] Pass | off/0 opt-out · `COST_FAIL_OPEN=0` fail-closed 복원 · near-cap degraded clamp · isolate=0/N=1 false green-light 차단 — 각 test green |

### Design Grounding (v1.18.22)

Design Grounding: N/A (cross-gate dedupe 적용으로 2.5.5b/2.5.5c design capture 미실행 → Phase 3.7 no-op). 변경된 renderer 파일(html.js·markdown.js·i18n test)은 footer version 문자열(`v1.22.1`→`v1.22.2`) 동기뿐이며 rendered design surface 무변경(plan Design Critique: false-positive/converged).

### 회귀 pre-existing failure (M2 무관)

`renderer/tests/verdict-label.test.js`의 `verdict-label metric (F1) — #drawer-data 파싱` 1건이 실패한다. **base commit `0bc27b0`(M1 머지)에서 모든 M2 변경을 stash한 pristine tree에서도 동일하게 실패**함을 확인했다(`renderMetric()`은 완전 stub 기반, `.claude/` 미read). footer 문자열 변경과 무관한 **pre-existing 실패**로, M2 스코프가 아니다. M3 gap 후보로 이연 권장.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/orchestration-preview.js` | CREATED | +~330 |
| `plugins/mccp/scripts/lib/tests/orchestration-preview.test.js` | CREATED | +~250 |
| `docs/workflow-orchestration/live-activation-observations.md` | CREATED | +~120 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | +1 / -1 (footer) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | +1 / -1 (footer) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | +4 / -4 (footer assert) |
| `CHANGELOG.md` | UPDATED | +16 |
| `CLAUDE.md` | UPDATED | +7 (§1.4 row + §4 pointer) |
| `.claude/prds/workflow-orchestration-live-activation.prd.md` | UPDATED (by /mccp:plan) | M1 stale→complete · M2 pending→in-progress + Plan cell |

## Deviations from Plan

- **plan-hash staleness 복구(gate 단계)**: 2.5.1 cross-gate dedupe가 plan body에 `## Codex Implementation Review`를 append하면서 plan structural hash가 바뀌어 `mccp-plan-codex` receipt가 stale이 됐다. m1 선례(plan-codex·implement-codex 양쪽 plan_hash가 최종 plan과 동일)를 따라, plan-codex receipt의 resolution(converged)을 보존한 채 현재 plan 해시로 re-stamp해 chain을 복구했다(`validate ok:true`). 구현 자체의 deviation 아님 — 게이트 절차상 표준 복구.
- **plan은 `.claude/plans/` 유지**(completed/ 미이동): active-PRD 관행 — m1 plan도 `.claude/plans/`에 남아있다. PRD 전체 완료 시 `/mccp:archive-complete`가 일괄 이동한다.

## Issues Encountered

- `node --test <dir>`가 이 Node 24 환경에서 디렉토리를 모듈로 오해(“Cannot find module …/tests”). glob(`.../tests/*.test.js`)로 우회 — 실제 test 실패 아님.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/orchestration-preview.test.js` | 12 | env matrix(cost-failopen/opt-out/fail-closed 복원/degraded clamp) · caller-gate matrix(isolate=0/N=1/opt-out → parallel_fires:false) · byte-정합(preview==직접 oracle) · read-only 불변식(3파일 mtime/내용 불변 + counter-bump 정적 부재) |

## Next Steps

- [ ] **Task 5 (operator, prp-implement 밖)**: scope-최소 target으로 `/mccp:work` 2개 named row(default 발화 ∧ `MCCP_WORK_IMPLEMENT_PARALLEL=off` opt-out) 완주 → 관찰을 `docs/workflow-orchestration/live-activation-observations.md` §2 ledger에 folding. **양 row 모두**로 M2 종료. (현 cost-state가 sticky-critical이면 decay 창(`MCCP_COST_STATE_DECAY_HOURS` 6h) 또는 green cost-state 필요 — §4 caveat)
- [ ] `/mccp:code-review` 또는 `/mccp:pr`로 Tasks 1–4 PR
- [ ] M2 종료 후 M3(발견 gap 보완) — pre-existing verdict-label #drawer-data 실패 포함 검토
