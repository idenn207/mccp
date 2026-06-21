# Implementation Report: v1.3.0 디자인 게이트 — Mechanical Enforcement (M1)

## Summary

v1.3.0 dashboard surface(M3 STATUS.md/status.html)에서 발견된 3겹 silent failure(detector blind spot + sub-plan artifact gap + receipt unobservability)를 M1 wedge로 흡수. Codex R1 absorption으로 detector 양방향 확장(diff + artifact)에 더해 strict-gate validator + 7-path whitelist까지 M1 단일 milestone에 self-sufficient 형태로 묶음.

Scope는 user-confirmed 2026-06-20에 따라 **M1만** (Tasks 1-5). M2~M4는 별도 cycle/branch로 분리.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium-Large (4 axis 분할 권장) | M1만 ship — Medium |
| Confidence | High (Codex R1 3 findings absorbed) | High — 모든 absorption fixture pass |
| Files Changed | 12 (M1 scope) | 12 |
| LOC | ~1,000 | +1,037 / -40 |

## Tasks Completed (M1 — Tasks 1-5)

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Receipt schema에 silent-skip 2 필드 추가 | Complete | `schema.js` + `cli.js` + `write.js` patched, additive (schema_version 유지) |
| 2 | impeccable-detect에 silent-skip surface | Complete | `detect()` return에 `silent_skip` + `silent_skip_reason` 추가 |
| 3 | 4 command 본문에 silent-skip forward 패치 | Complete | `plan.md` / `prp-implement.md` / `pr.md` / `plan-prd.md` 모두 패치 |
| 4 | Design surface path 화이트리스트 (양방향 detection) | Complete | F1+F3 absorption — 7 path, `findDesignSignalInDiff` + `findDesignSignalInArtifact` 양쪽 |
| 5 | validate-cmd 확장 + audited-escape mutex guard | Complete | F2 부분 absorption — informational warning (M1 ship 후 재절충: strict-gate blocking 대신 warning, M2에서 SKILL first-step wire 후 승격) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | n/a | Node native, no separate type-check stage |
| Unit Tests | Pass | 543 tests passing (receipt 378/379 · derive 52/52 · renderer 89/89 · impeccable-detect-design-surface 15/15 · impeccable-skipped 10/10) |
| Build | n/a | Node native, no build stage |
| Integration | Pass | M1 contract test (`impeccable-skipped.test.js#5,6`) — silent_skip이 informational warning만, blocking 아님 |
| Edge Cases | Pass | Fixture C overshoot guard (state-writer.js 변경 → signal=false) · audited escape recovery (force_override-only → silent_skip suppress) |

## Files Changed (commit `ec4e7a0`)

| File | Action | Lines |
|---|---|---|
| `.claude/plans/v1-3-0-design-gate-mechanical-enforcement.plan.md` | CREATED | +354 |
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATED | +110 / -7 |
| `plugins/mccp/scripts/lib/tests/impeccable-detect-design-surface.test.js` | CREATED | +303 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED | +41 / -0 |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATED | +2 / -0 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | +8 / -0 |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATED | +29 / -0 |
| `plugins/mccp/scripts/receipt/tests/impeccable-skipped.test.js` | UPDATED | +85 / -0 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATED | +25 / -0 |
| `plugins/mccp/commands/plan.md` | UPDATED | +30 / -18 |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | +34 / -20 |
| `plugins/mccp/commands/pr.md` | UPDATED | +20 / -13 |
| `plugins/mccp/commands/plan-prd.md` | UPDATED | +15 / -3 |

Net: +1,037 / -40 across 13 files.

## Deviations from Plan

- **Task 5 re-renegotiation** (M1 ship 직전 code-review absorption): 원안의 strict-gate blocking이 backend-only plan(`design_signal=false` + `skill_available=true`)에서도 fire해 비-UI cycle 전체를 차단하는 false-positive risk를 발견. M1 단계에서는 `warnings[].kind='impeccable_silent_skip'` informational만 emit하도록 downgrade. strict-gate 승격은 M2에서 SKILL first-step + critique loop wire 후 재평가. plan body Risks 표 + Task 5에 반영.
- **finalize-receipt.js defense-in-depth 추가** (audited escape mutex): `IMPECCABLE_FORCE_OVERRIDE_REASON` 활성 시 silent_skip flag suppress. helper가 한 번 더 차단하는 2중 guard.
- **WRITE 블록 eval→array 정합화** (M1 cleanup, code-review M1 finding): `plan.md` + `prp-implement.md`의 `eval` 패턴을 bash array(`WRITE_FLAGS=(...)`)로 교체. `pr.md`와 정합화 + quoting 안전성 확보.

## Issues Encountered

- 없음. Codex R1 finding 3건 모두 plan-body absorption으로 R2 escalation 조건 미충족 (cap=1).
- M1 implementation receipt(`mccp-implement-codex/v1-3-0-design-gate-mechanical-enforcement.json`)의 `head_sha`가 `b2045100`을 가리키는 stale receipt를 발견했지만, 이는 Phase 2.5.6 시점(implement 시작 전) anchor라 정상. ship된 commit `ec4e7a0`는 receipt write 이후 작성된 산출물.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/impeccable-detect-design-surface.test.js` | 15 tests | 7-path whitelist · 양방향 detection · silent_skip surface · overshoot guard |
| `plugins/mccp/scripts/receipt/tests/impeccable-skipped.test.js` (확장) | +7 cases | M1 contract (informational warning) · audited escape recovery |

## Open Questions

다음은 user confirmation 필요:

1. **PR scope** — 본 worktree(`chore/v1.3.0-prd-status-roll`)에 M1 + b204510(Linear renderer polish) + c6d5182(PRD status roll) 3 commit이 섞여 있음. 단일 PR로 묶을지 vs M1만 별도 branch로 cherry-pick할지 (plan Open Question #4: 별도 branch 권장).
2. **plugin.json bump** — M1 단독 ship 시 patch bump (1.6.0 → 1.6.1)인지 minor bump(1.7.0)인지. plan acceptance criteria는 "M1~M4 통합 ship 시점에만 minor bump"로 명시.

## Next Steps

- [ ] Code review via `/mccp:code-review` (PR scope 확정 후)
- [ ] Plan archive (M1만 ship된 상태에서 plan은 M2~M4 잔여 — archive 보류 권장)
- [ ] Create PR via `/mccp:pr` (PR scope + plugin.json bump 결정 후)
