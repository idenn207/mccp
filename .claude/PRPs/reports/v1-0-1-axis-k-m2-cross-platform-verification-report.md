# Implementation Report: v1.0.1 axis K M2 — cross-platform verification

**Plan**: `.claude/plans/v1-0-1-axis-k-m2-cross-platform-verification.plan.md`
**PRD**: `.claude/prds/v1-0-1-axis-k-pr-phase-guard-pid-alive.prd.md` (M2 row)
**Branch / Worktree**: `v1.0.1-axis-k-m2` (`C:\_project\my\my-claude-code-plugin\.worktrees\v1.0.1-axis-k-m2`)
**M1 ship commit (axis K1+K2)**: `65d4c02` (PR #24, merged to main)
**Status**: Tasks 1–6 implemented + locally validated. Task 7 (PR + GHA run + rubric-URL fill-in) deferred to next step.

## Summary

M2 is a 0-source-mutation verification layer on top of M1's `lockActive()` PID-liveness branch. This implementation lands:

- 2 deterministic fixtures that exercise the real `pr-phase-lock` reclaim path with only `repoRoot()` overridden (no surrogate `tryReclaimStaleLock`/`isPidAlive`, so cross-platform syscall surfaces are genuinely covered)
- 1 static-check fixture that asserts the Windows escape path is preserved (no `PowerShell` substring in any `hooks.json` PreToolUse matcher)
- 1 GitHub Actions matrix workflow (ubuntu-latest + macos-latest) that uploads fixture stdout JSON as PR-public artifacts
- 1 audit doc skeleton for W11 rubric 4d row re-measurement, with TBD placeholders gated on the first GHA run
- 1 CHANGELOG `### Verified` sub-section under the existing v1.0.1 entry

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 6 new + 2 modified | 4 new + 2 modified |
| Source-code mutation | 0 | 0 ✓ |
| Local Windows fixture PASS | exit 0, reclaimed:true | exit 0, reclaimed:true ✓ |
| pr-phase-guard test regression | 0 (M1 baseline 75/75) | 0 (75/75 PASS) ✓ |
| F11 schema invariant | 0 fail | 0 fail (15/15 PASS) ✓ |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `axis-k-m2-reproduce.mjs` fixture | [done] | Windows local run: exit 0, `reclaimed:true`, guard stderr "stale lock reclaimed" emitted in-process |
| 2 | `axis-k-m2-windows-regression.mjs` fixture | [done] | exit 0, `powershell_matched:false`, `bash_matched:true`, `pretool_count:10` |
| 3 | `.github/workflows/axis-k-m2-cross-platform.yml` | [done] | matrix=[ubuntu-latest, macos-latest], paths filter + workflow_dispatch, artifact upload retention 30d |
| 4 | `.claude/audit/v1.0.1-axis-k-m2-rubric.md` | [done — skeleton] | TBD placeholders gated on GHA run URL + per-OS stdout paste; re-measurement procedure included |
| 5 | PRD M2 row update | [done — already in state] | row was already `in-progress` + plan path filled at /mccp:plan time; no edit needed |
| 6 | CHANGELOG `### Verified` sub-section | [done] | appended under existing v1.0.1 `### Added` block |
| 7 | PR creation + GHA run trigger + rubric URL fill | **deferred** | requires `/mccp:pr` + GHA matrix execution + post-run rubric edit |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (workflow YAML parse) | [done] | 75 lines, 2767 bytes; structure follows Task 3 skeleton |
| Local fixture 1 (reproduce) | [done] | reclaimed:true on win32, marker shape canonical (5 keys), exit 0 |
| Local fixture 2 (windows-regression) | [done] | powershell_matched:false, bash_matched:true, exit 0 |
| Unit tests — pr-phase-guard | [done] | 75/75 PASS (M1 axes 11.1–11.5 + 12.1–12.4 included, 0 regressions) |
| Unit tests — pr-phase-lock F11 | [done] | 15/15 PASS, lockBody schema unchanged |
| Plan-conflict detector | [done] | conflict:false — files-changed ⊂ plan's Files to Change list |
| GHA matrix (ubuntu + macos) | **deferred** | gated on PR creation |
| W11 rubric 4d re-measurement | **deferred — skeleton ready** | T/NS scoring needs GHA artifact stdout |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-reproduce.mjs` | CREATED | +127 |
| `plugins/mccp/scripts/hooks/tests/fixtures/axis-k-m2-windows-regression.mjs` | CREATED | +83 |
| `.github/workflows/axis-k-m2-cross-platform.yml` | CREATED | +75 |
| `.claude/audit/v1.0.1-axis-k-m2-rubric.md` | CREATED | +99 |
| `CHANGELOG.md` | UPDATED | +4 (added `### Verified` block) |
| `.claude/PRPs/reports/v1-0-1-axis-k-m2-cross-platform-verification-report.md` | CREATED | this file |

## Deviations from Plan

1. **Plan claimed `pr-phase-lock-f11.test.js` has 42/42 tests**; actual count is 15/15. CHANGELOG `### Verified` line + rubric `Success Metrics row 4` line were corrected to match reality. Mechanism: plan author estimated; actual count verified by running the test. No semantic impact (zero failure either way).
2. **PRD M2 row already in `in-progress` state with plan path filled** before Task 5 ran — `/mccp:plan` had already updated it. Task 5 was a no-op (per plan template's "update only the selected row" invariant). Documented as `[done — already in state]`.
3. **PRD M1 row remains `in-progress`** despite M1 having shipped via PR #24 (commit 65d4c02). This is out of scope for the M2 plan (which only mandates M2-row edits), but is a stale-record finding that next-cycle housekeeping (or M2 PR's reviewer) should flag. Not corrected here to honor plan template's "update only the selected row" invariant.
4. **Plan archive deferred** (template Phase 5 would normally `mv` to `.claude/PRPs/plans/completed/`, but mccp convention is `.claude/plans/archive/`, and the plan body is referenced by the not-yet-finalized rubric + the upcoming PR body). Archive should run after PR merge.
5. **Phase 2.5 (Implement-Codex gate) silently skipped** per `[[feedback-codex-permanent-bypass]]` — `MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off` permanent policy. The plan body already wrote the "Codex Implementation Review — skipped" section at /mccp:plan time. Per CLAUDE.md §3.3 + the wrapper's `classification='disabled'` short-circuit, no receipt write was attempted.

## Issues Encountered

1. **hooks.json size (27k tokens)** exceeded Read tool's 25k limit. Resolved by using Grep for the exact invariant assertions (PreToolUse matcher list + PowerShell substring absence), which is the same surface the fixture programmatically asserts.
2. **`pr-phase-lock.repoRoot(cwd)` requires a real git repo** (calls `git rev-parse --show-toplevel`). Resolved by wrapping the real lock module in an `Object.assign({}, realLockMod, { repoRoot: () => tmpRoot })` facade — only the git-traversal entry point is stubbed; `tryReclaimStaleLock` / `isPidAlive` / `readLock` remain real, so cross-platform syscall surfaces (`process.kill(pid, 0)` per-OS semantics) are genuinely exercised on each GHA runner.
3. **Plan's GHA workflow skeleton ran the reproduce fixture twice** (once for assertions, once for stdout capture). Cleaned up to a single `tee` invocation with `set -o pipefail` — preserves both exit code propagation and stdout-to-file capture. Bash is available by default on both ubuntu + macos runners.

## Tests Written

| Test artifact | Tests | Coverage |
|---|---|---|
| `axis-k-m2-reproduce.mjs` (fixture) | 5 inline assertions in 1 PASS/FAIL gate | lockActive return value, lock-file unlink, marker presence + shape (5 keys), former_pid/host/run_id/reason/ISO format |
| `axis-k-m2-windows-regression.mjs` (fixture) | 3 inline assertions | hooks.json parses, no `PowerShell` in any PreToolUse matcher, ≥1 `Bash` matcher present (sanity) |

No new test files in `tests/` — the existing `pr-phase-guard.test.js` axes 11.1–11.5 + 12.1–12.4 already cover the unit-level reclaim invariants; M2's contribution is the cross-platform fixture surface, intentionally factored as standalone scripts (single source of truth for dev + CI).

## Next Steps (Task 7 + post-PR follow-through)

1. `/mccp:prp-commit` — commit all M2 changes with descriptive message
2. `/mccp:pr` — create PR to main. PR body references this plan + report + audit rubric skeleton
3. Wait for GHA `axis-k-m2-cross-platform.yml` matrix to complete (ubuntu + macos)
4. Download artifacts: `gh run download <run-id> --name axis-k-m2-ubuntu-latest --name axis-k-m2-macos-latest`
5. Fill in TBD placeholders in `.claude/audit/v1.0.1-axis-k-m2-rubric.md` per its "Re-measurement update procedure" section
6. On PR merge: flip PRD M2 row Status `in-progress` → `complete`. Consider closing PRD M1 row stale-record in the same housekeeping commit.
