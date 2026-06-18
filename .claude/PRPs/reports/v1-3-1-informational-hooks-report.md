# Implementation Report: v1.3.1 — Informational Hooks + Auto-Recovery

## Summary

Patch cycle on top of v1.3.0-m1 (commit `2eb0367`). Reclassifies the receipt-prompt hook from authoritarian gate to **informational signal** for the recoverable subset (`/mccp:plan`, `/mccp:prp-implement`, `/mccp:resume`) when the upstream receipt is missing-only. Mechanical integrity invariant preserved — stale, blocking, and open_critical results stay hard-block; terminal/mutating commands (`/mccp:pr`, `/mccp:code-review`) stay hard-block. Phase 0 auto-recovery in `plan.md`/`prp-implement.md` consumes the structured `mccp_receipt_gate` context the hook emits and deterministically synthesizes the missing receipt + re-validates.

Closes STATE.md `Open Questions` line 49 (3rd+ recurrence in three milestones of the 4-step hand-recovery).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small-medium (~250 LoC, no new modules, no new deps) | ~280 LoC net (close enough) |
| Confidence | High — mechanical scope | Validated by 38/38 tests + lint regression confirmation |
| Files Changed | 10 + CHANGELOG | 11 (10 + 2 new test files; lint test sub-counted with lint dir create) |
| New deps | 0 | 0 ✓ |
| Concurrency model change | None | None ✓ |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Patch 5 validate-call callsites (`--decision`/`--plan`) | done | prp-implement:295, plan:380, pr:539, code-review:128, resume:199 (latter required inline `derive-decision` for dynamic `$VALIDATE_COMMAND`) |
| 2 | Create `receipt-context-schema.js` lib + 11 unit tests | done | Pure data; `RECOVERABLE_ALLOW_LIST` is `Object.freeze`d source of truth |
| 3 | Create `validate-callsite-lint.test.js` (R2-F3 absorption) | done | 4 tests; statically scans `commands/*.md` bash fences; multi-line continuation aware; ignores inline backtick refs (e.g. `trace.md:64`) |
| 4 | Patch `receipt-prompt.js` partition logic | done | New branch inserted between tempfail and soft-mode; module-scope require with null fallback; structured `additionalContext` via schema lib |
| 5 | Add Phase 0 auto-recovery body | done | `prp-implement.md` (sub-step 0.0 under DETECT) + `plan.md` (new Phase 0 + Phase Map row); `code-review.md` intentionally excluded per R2-F2 |
| 6 | Bump `plugin.json` 1.3.0 → 1.3.1 + CHANGELOG | done | CHANGELOG row includes Changed/Added/Out-of-scope sections; note on 1.3.0 entry backfill deferred to separate axis |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | done | Node native test runner — no type-check phase in this repo (lint role taken by the new `validate-callsite-lint`) |
| Unit Tests | done | 11 schema tests + 4 lint tests (15 new) |
| Integration Tests | done | 5 informational hook tests + 4 existing receipt-prompt regression (alias-bypass + tempfail) — spawn-based with mkTmpRepo helper |
| Existing CLI surface | done | 14 existing `validate-cmd*.test.js` tests pass — CLI back-compat preserved by construction (no cli.js changes) |
| Manual mutation check | done | Temporarily stripped `--plan` from `resume.md:205` → lint correctly failed with diagnostic; restored |
| Build | N/A | Plugin loads .js modules at runtime; no compilation step |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `CHANGELOG.md` | UPDATE | +26 / −0 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | +1 / −1 |
| `plugins/mccp/commands/code-review.md` | UPDATE | +9 / −1 |
| `plugins/mccp/commands/plan.md` | UPDATE | +76 / −2 (new Phase 0 section + Phase Map row + multi-line validate) |
| `plugins/mccp/commands/pr.md` | UPDATE | +8 / −1 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | +73 / −2 (new sub-step 0.0 + multi-line validate) |
| `plugins/mccp/commands/resume.md` | UPDATE | +12 / −1 |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | +57 / −0 (module-scope schema require + informational branch) |
| `plugins/mccp/scripts/hooks/lib/receipt-context-schema.js` | CREATE | +82 (new lib + new dir) |
| `plugins/mccp/scripts/hooks/tests/receipt-context-schema.test.js` | CREATE | +118 (11 tests) |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-informational.test.js` | CREATE | +176 (5 tests) |
| `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js` | CREATE | +172 (4 tests + new lint dir) |

## Deviations from Plan

1. **CLI back-compat test (`cli-validate.test.js`)** — Plan listed an UPDATE on this file, but the file does not exist; the closest existing files are `validate-cmd.test.js`, `validate-cmd-generic-no-plan-reject.test.js`, and `validate-cmd-explicit-pass.test.js`. CLI signature is unchanged in this patch, so back-compat is preserved by construction. Verified by running all 14 existing CLI tests green. No new test added — adding a redundant one would be noise.
2. **`receipt-prompt.test.js`** — Plan listed UPDATE; file did not exist. Existing pattern is to split aspects into separate `receipt-prompt-{aspect}.test.js` files (alias-bypass, tempfail). Followed the pattern: created `receipt-prompt-informational.test.js`.
3. **Plan-codex receipt refresh during dedupe** — When Phase 2.5.1 injected the Codex Implementation Review section, the plan hash drifted and the plan-codex receipt became stale. Manually refreshed via `cli.js write --gate mccp-plan-codex` per STATE.md `Open Questions` line 51 (known post-ship receipt drift axis). Surfaces a future axis: `cli.js write --gate mccp-implement-codex` could auto-refresh the plan-codex `plan_hash` when invoked in dedupe mode (separate patch).

## Issues Encountered

- **Bash regex escaping under PowerShell harness** — Initial attempt to mutate `resume.md` via inline `node -e` with a regex literal failed due to PS-level backslash interpretation. Recovered by using the Edit tool directly for the mutation+restore.
- **Stale `resume.md.bak`** — Left by a failed `cp` from the same incident. Removed before report write.
- **Test (a-bis) initial misframe** — First version tried to assert informational ALLOW for `/mccp:plan` + missing receipt, but `/mccp:plan` has no upstream receipt → `result.ok=true` → `allowWithMessage` path (plain string `additionalContext`). Refactored the test to instead assert informational ALLOW persists with `MCCP_RECEIPT_GATE_MODE=hard` (real coverage of the v1.3.1 default change).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/receipt-context-schema.test.js` | 11 | Schema lib (`isRecoverable`, `computeMustNotProceed`, `buildAdditionalContext` shape + edge cases) |
| `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js` | 4 | Static lint across all `commands/*.md` + 2 regression synthetic + 1 inline-backtick exclusion |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-informational.test.js` | 5 | Hook partition (recoverable+missing=ALLOW, terminal=BLOCK, stale=BLOCK, gate-mode=hard regression, /mccp:code-review=BLOCK per R2-F2) |

Total new tests: **20**. All passing.

## Architecture Surface

The informational hook + Phase 0 recovery is **opt-in by command**, not by env var:
- Recoverable subset (`mccp:plan`, `mccp:prp-implement`, `mccp:resume`) gets the informational path mechanically.
- Terminal subset (`mccp:pr`, `mccp:code-review`) gets the hard-block path mechanically.
- The schema lib's `RECOVERABLE_ALLOW_LIST` is the single source of truth shared between the hook (`receipt-prompt.js`), the schema unit tests, and (indirectly via test coverage) the Phase 0 bodies.
- No new env var introduced. `MCCP_RECEIPT_GATE_MODE` survives as legacy advanced-debug toggle; the new default supersedes its `hard` semantics for the recoverable subset.

## Next Steps

- [ ] Code review via `/mccp:code-review` (PR Review Mode)
- [ ] Create PR via `/mccp:pr` (terminal gate, cross-gate dedupe via implement-codex receipt should fire)
- [ ] Backlog axis: auto-refresh plan-codex `plan_hash` on implement-codex dedupe write
- [ ] Backlog axis: CHANGELOG 1.3.0 row backfill (separate patch)
