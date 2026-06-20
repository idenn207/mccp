# Implementation Report: v1.4.0 Multi-Session M3 — Friction Zero

## Summary

PRD M3 metric ("한 cycle 내 2~5 worktree 병렬 cycle을 reconciliation 질문 없이 완주") 도달을 위한 3축 shipped:

1. **STATUS.md self/other 시각 구분** — derive surface 2 contracted fields(`self_session_id` + `self_resolution` 4 enum) + renderer self-row marker. env → cwd → null deterministic resolution chain.
2. **Friction-telemetry sidecar** — `<repo>/.claude/state/m3-friction-events.jsonl` append-only producer-side measurement. SessionStart hook이 banner inject 시점에 1줄 record. concurrent SessionStart 양립.
3. **Backlog stale row absorption** — F4 heartbeat-based reclaim row가 v1.4.0-m2 PR #46에 의해 실제 absorbed임을 audit trail에 마킹.

## Assessment vs Reality

| Metric | Predicted | Actual |
|---|---|---|
| Complexity | Small-Medium | Small-Medium (matched) |
| Confidence | High | High |
| Files Changed | 14 | 16 (UPDATE 12 + CREATE 4) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | derive state.js — self_session_id + self_resolution enum | Complete | 7 new test cases pass. Codex R1 F3 absorption — always-emit contract. |
| 2 | renderer active-sessions.js — self/other 시각 구분 | Complete | 3 new test cases pass. graceful degrade preserved (null fallback no marker). |
| 3 | friction-telemetry.js append-only sidecar primitive | Complete | 6 test cases including concurrent 2-process loss-0 regression + worktree `.git` file detection. Codex R1 F1 absorption — no in-band cap. |
| 4 | SessionStart hook banner-inject signal wiring | Complete | try/catch facade + best-effort git branch probe. session-start 회귀 8/8 green. |
| 5 | stale backlog row 정리 + .gitignore | Complete | row 2 ABSORBED 마킹 + row 3 신규(F1 retention deferral) + .gitignore 1줄. |
| 6 | docs + CHANGELOG + plugin.json bump | Complete | schema-surface.md §10 신설 + m3-friction-metric.md 신설 + CHANGELOG [1.8.0] + plugin.json 1.7.0→1.8.0. |
| 7 | 2-worktree full-cycle dogfood | Manual — pending user | 사용자 cycle close 시점에 수동 검증. 절차는 docs/v1.4.0-multi-session/m3-friction-metric.md §4. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | No new TS — pure JS. lint via existing tooling. |
| Unit Tests | Pass | derive 59/59, renderer 97/97, friction-telemetry 6/6, session-start 8/8 green. |
| Build | N/A | No build step (Node CJS modules). |
| Integration | Pass | E2E `derive run --json | jq .sources.state.item` returns `self_session_id` + `self_resolution=env-missing`. `derive render` succeeds; active-sessions section graceful-hides at 0 ledgers. |
| Edge Cases | Pass | concurrent 2-process append loss-0, CRLF/LF mix, EACCES no-throw, worktree `.git` file detection. |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/derive/sources/state.js` | UPDATED | +66 / -7. 2 new exports (`resolveSelfSessionId`) + item surface. |
| `plugins/mccp/scripts/derive/tests/state-source.test.js` | UPDATED | +84 / -0. 7 new test cases. |
| `plugins/mccp/scripts/lib/renderer/sections/active-sessions.js` | UPDATED | +21 / -10. self-row marker (md + html). |
| `plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` | UPDATED | +93 / -0. 3 new self-marker test cases. |
| `plugins/mccp/scripts/lib/friction-telemetry.js` | CREATED | +119. append-only sidecar primitive. |
| `plugins/mccp/scripts/lib/tests/friction-telemetry.test.js` | CREATED | +138. 6 test cases. |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATED | +24 / -1. banner-inject signal wiring. |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATED | +20 / -0. §10 self session identity surface. |
| `docs/v1.4.0-multi-session/state-md-narrowing.md` | UPDATED | +7 / -0. v1.4.0-m3 self/other 단락. |
| `docs/v1.4.0-multi-session/m3-friction-metric.md` | CREATED | +110. measurement protocol explainer. |
| `.gitignore` | UPDATED | +4 / -0. m3-friction-events.jsonl 1 path. |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | row 2 ABSORBED + row 3 new (already in plan write). |
| `CHANGELOG.md` | UPDATED | +27 / -1. [1.8.0] entry. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version 1.7.0 → 1.8.0. |
| `.claude/plans/v1-4-0-multi-session-m3-friction-zero.plan.md` | CREATED | + Codex Implementation Review cross-gate dedupe marker. |
| `.claude/prds/v1-4-0-multi-session-first-class.prd.md` | UPDATED (prior) | M3 cycle promotion (Phase 0 prep). |

## Deviations from Plan

None for Task 1-6 — implemented exactly as planned. Task 7 (manual dogfood) deferred to the user's cycle-close step per its inherent nature (multi-session human-time observation).

## Issues Encountered

1. **plan-codex receipt stale after Implementation Review inject** — cross-gate dedupe marker 1 line added to plan body shifted plan hash; required `mccp-plan-codex` receipt refresh via `MCCP_CODEX_DISABLED=1` write. Known mccp slash-command axis (CLAUDE.md memory) — receipt CLI does not auto-refresh on dedupe inject.
2. **`receipt validate-cmd` default fallback** — first read-back without `--decision/--plan` returned generic `default` slug + v0.2.8 quarantine block. Resolved by explicit `--decision/--plan` re-invocation. Same known axis as above.
3. **Test framework — `unresolved` enum trigger** — `sanitizeSessionId` returns hash for most non-alphanumeric input; only pure punctuation strings (no meaningful chars after `\p{P}+\s` strip) return null. Test case updated to use `'!@.,'` for deterministic unresolved-branch trigger.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/derive/tests/state-source.test.js` | +7 new | resolveSelfSessionId 4 enum × 5 case + scanState/collectActiveSessionLedgers self surface |
| `plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` | +3 new | self-marker null/match-one/stale-no-match |
| `plugins/mccp/scripts/lib/tests/friction-telemetry.test.js` | 6 new | round-trip / WARN / concurrent / CRLF / EACCES / worktree .git file |

Total: 16 new test cases. Zero regressions.

## Next Steps

- [ ] Code review via `/mccp:code-review`
- [ ] User dogfood Task 7 per `docs/v1.4.0-multi-session/m3-friction-metric.md` §4 (2 worktree 병렬 cycle 1회)
- [ ] Commit via `/mccp:prp-commit`
- [ ] PR via `/mccp:pr` — cycle close note 포함
- [ ] Post-merge: `~/.claude/plugins/cache/mccp/mccp/1.8.0/` 정식 생성 확인 + worktree cleanup
