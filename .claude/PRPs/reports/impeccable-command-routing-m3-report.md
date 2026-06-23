# Implementation Report: Stage-Aware impeccable Command Routing — M3

## Summary
M3은 PRD의 마지막 두 축을 닫았다. **Axis A**: impeccable System 군의 `document`/`extract`를 routing 카탈로그에 `system` stage + recommend-only base로 wiring(모든 게이트·모드 recommend). **Axis B**: PR 게이트의 a11y 처리를 routing-only count에서 실제 `mccp:a11y-architect` review-only auto-invoke로 전환 — 트리거는 PR diff의 rendered surface(`rendering_surface`), 전용 a11y-review pr-phase lock window + mutations finalizer로 review-only 보증, 결과는 PR body `## Accessibility Review`에 inject, receipt `meta.a11y_auto_invoked` audit.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 14 (plan) | 13 code/doc + 1 gitignored fixture restore |
| plugin.json | 1.14.0 (plan) | **1.16.0** (deviation — main 이동) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | System 명령 routing wiring | ✅ Complete | SYSTEM_COMMANDS + document/extract recommend-only in implement/pr/PLAN_GUIDE |
| 2 | codex-result-filter a11yFindings 배열 | ✅ Complete | 4 반환 경로 + EMPTY_RESULT 동기화, count==length 동치 |
| 3 | codex-runner a11y_findings + rendering_surface | ✅ Complete | computeRenderingSurface 헬퍼, 모든 codexOutcome에서 surface 계산 |
| 4a | receipt schema + write a11y_auto_invoked | ✅ Complete | present-only boolean validator + skeleton default + arg 배선 |
| 4b | finalize-receipt --a11y-auto-invoked forward | ✅ Complete | deriveCodexFlags 분기 추가 (Codex R1 F3) |
| 5 | pr.md a11y auto-invoke (Phase 2.5.6c) + body inject | ✅ Complete | 전용 lock window + mutations hard-stop + ## Accessibility Review (Codex R1 F1/F2) |
| 6 | prp-implement.md system 단계 note | ✅ Complete | routing 표 보강, a11y는 PR 게이트 전용 명시 |
| 7 | 문서 + version bump | ✅ Complete | plugin.json 1.16.0, CHANGELOG [1.16.0], CLAUDE.md §3.10 M3 + §4 토글 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static / load smoke | ✅ Pass | 6 수정 모듈 require OK |
| Unit Tests (M3-touched) | ✅ Pass | impeccable-routing + codex-result-filter + finalize-receipt + impeccable-routing-fields: 78 pass / 0 fail |
| Receipt suite | ✅ Pass | 392 pass / 0 fail |
| Lib suite | ✅ Pass | 618 tests, 0 fail (design-critique e2e fixture 복원 후) |
| Build / Integration | N/A | plugin repo, no build step |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-routing.js` | UPDATE | SYSTEM_COMMANDS + 6 entry + export |
| `plugins/mccp/scripts/lib/codex-result-filter.js` | UPDATE | a11yFindings 배열 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATE | a11y_findings + rendering_surface + computeRenderingSurface |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | --a11y-auto-invoked forward |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | a11y_auto_invoked validator + skeleton |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | --a11y-auto-invoked arg |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 2.5.6c + ## Accessibility Review inject |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | system stage note |
| `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | UPDATE | System 명령 + count 16/7 |
| `plugins/mccp/scripts/lib/tests/codex-result-filter.test.js` | UPDATE | a11yFindings 4 test |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` | UPDATE | --a11y-auto-invoked 2 test |
| `plugins/mccp/scripts/receipt/tests/impeccable-routing-fields.test.js` | UPDATE | a11y_auto_invoked 4 test |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.13.0 → 1.16.0 |
| `CHANGELOG.md` / `CLAUDE.md` | UPDATE | [1.16.0] + §3.10 M3 + §4 토글 |

## Deviations from Plan
- **plugin.json 1.14.0 → 1.16.0**: plan은 1.14.0을 가정했으나 origin/main이 PR #53로 1.15.0에 도달. §3.7 forward-only reconcile + STATE open question에 따라 1.16.0(main 위 다음 minor)으로 상향.
- **Axis B 전면 재설계 (Codex Plan-Codex R1 흡수)**: 초기 plan은 "Codex a11y finding 존재 → a11y-architect 호출 + 단순 Task" 였으나 Codex 3 finding(F1 preamble starvation / F2 lock window 밖 실행 / F3 finalize-receipt 미경유)을 R1에서 흡수해 rendering_surface 트리거 + 전용 lock window + finalize-receipt forward로 재설계. plan body에 반영 후 구현.

## Issues Encountered
- design-critique-loop-e2e F) 테스트가 gitignored fixture(`.claude/cache/test-fixture-status.html`)를 요구 — fresh worktree에 부재해 실패. M2 dogfood 산출물이라 M3와 무관한 환경 의존 실패. §3.9 문서대로 fixture 복원(gitignored, commit 안 됨)으로 해소.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| impeccable-routing.test.js | +2 | System 명령 게이트×모드 recommend, SYSTEM_COMMANDS frozen, count 16/7 |
| codex-result-filter.test.js | +4 | a11yFindings 동치/identity/empty/EMPTY_RESULT |
| finalize-receipt.test.js | +2 | --a11y-auto-invoked forward present/absent |
| impeccable-routing-fields.test.js | +4 | a11y_auto_invoked round-trip/present-only/non-boolean/legacy |

## Next Steps
- [ ] Commit via `/mccp:prp-commit`
- [ ] PR via `/mccp:pr` (PR #55 reconcile — main 1.15.0 → 이 branch 1.16.0)
