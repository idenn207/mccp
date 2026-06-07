# Implementation Report: v0.2.8 PR Workflow Hardening — Finalize Cycle

**Plan**: `.claude/plans/v0-2-8-pr-workflow-hardening.plan.md` + `.claude/plans/v0-2-8-task-2-6-1-followup.plan.md`
**Branch**: `feat/v0-2-8-finalize`
**Date**: 2026-06-07/08
**Predecessor PRs**: #6 (Task 2.6.5 quarantine) → #7 (Task 2.6.1 base + R1) → #8 (Task 2.6.1-followup F10+F11+F7)
**This cycle**: closes v0.2.8 by absorbing the remaining acceptance items.

---

## Summary

v0.2.8 PR Workflow Hardening milestone was previously shipped in three discrete PRs, but a tail of acceptance items remained: Task 2.6.2 (markdownlint α+β IDE delegation), Task 2.6.3 (CLAUDE.md docs), Task 2.6.4 (plugin.json bump + final PR), F9 (Phase 0.3 mutex preflight), and F6 (CLAUDE.md §3.5 lock pattern docs). This cycle delivers all five — with the Q5 empirical probe confirming the R2-F2 silent-failure trap is real in the current VSCode 1.123.0 and that the R4-F3 strict count-based success gate correctly catches it.

---

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Tasks completed (in this cycle) | 5 (2.6.2 + 2.6.3 + 2.6.4 + F9 + F6) | 5 — all five shipped |
| New helpers required | 1 (find-code-cli.js) | 1 |
| Architectural decisions | 0 new (dedupe of R1-R6 + IMPL-R1-R5) | 0 — cross-gate dedupe applied |
| Implement-Codex gate | required | satisfied via dedupe + impeccable skip-reason |

---

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | F6 — CLAUDE.md §3.5 / new §3.6 atomic state locks doc | ✅ Complete | Added §3.6 documenting both `pr-phase.lock` and `v0.2.8-generic-receipt-quarantine.lock`. Renamed `ownership_token` → `ownership_token_hash` + stdout-pipe IPC contract + legacy v0.2.7 upgrade scenario (host-aware tri-state). §4 quarantine runbook updated to cite §3.6 + new terminology. |
| 2 | 2.6.3 — CLAUDE.md §1.2 dual-reviewer + §4 cheat sheet env vars | ✅ Complete | §1.2 bullet added: PR step protection via cross-gate dedupe + review-only invariant + `MCCP_PR_SKIP_CODEX_REVIEW`. §4 added `MCCP_PR_SKIP_CODEX_REVIEW` and `CODEX_DEDUPE_AT_PR` lines including F9 mutex note. |
| 3 | F9 — pr.md Phase 0.3 mutex preflight | ✅ Complete | New Phase 0.3 subsection in `pr.md` rejects `MCCP_PR_SKIP_CODEX_REVIEW` + `CODEX_DEDUPE_AT_PR=1` simultaneous-set with `[MCCP-GATE-STOP]` exit 1. Defense-in-depth above the schema XOR already enforced by `receipt/schema.js:239`. |
| 4 | F9 — `pr-mutex-preflight.test.js` | ✅ Complete | 5 tests, all PASS: skip-only, dedupe-only, both→exit 1, pr.md regression guard, schema XOR safety net. Bash extraction-and-run approach so the test follows the actual snippet in pr.md, not a JS reimplementation. |
| 5 | 2.6.2 Q5 — Empirical probe | ✅ Complete | Real fixture (5 known violations), real `code` CLI invoke, `npx markdownlint-cli --json` pre/post. Result: **α_status = silent_failure** — VSCode 1.123.0 emits `Warning: 'command' is not in the list of known options` and exits 0 without executing the commandId. Documented at `.claude/PRPs/reports/q5-vscode-markdownlint-probe-2026-06-07.md`. |
| 6 | 2.6.2 — `post-edit-format.js` `.md` branch | ✅ Complete | Added α (code CLI) + β (markdownlint-cli) paths with R4-F3 strict count-based success gate (`lintClean || lintStrictlyReduced || noLintBin`). `STDERR_BAD_RE` extended to match VSCode 1.123.0 warning text. New `find-code-cli.js` helper. Telemetry on stderr as `[mccp:markdownlint] {...}` JSON (no hook-trace allowlist change). |
| 7 | 2.6.2 — `post-edit-format-md.test.js` | ✅ Complete | 5 tests, all PASS: α PASS, α silent_failure → β fallback, α explicit_failure (commandid-not-found) → β fallback, β-only, no-CLI silent noop. All deps injected so tests never touch real PATH/VSCode. |
| 8 | 2.6.4 — plugin.json bump + roadmap drift | ✅ Complete (re-interpreted) | plugin.json was already bumped to 0.2.8 in PR #7 (commit `e3b8c7b`). The remaining drift was roadmap status: "Current plugin version" line, v0.2.7/v0.2.8 ship history rows, and acceptance checkboxes all corrected. |

---

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Phase 2.5 Implement-Codex gate | ✅ Pass | Cross-gate dedupe applied (no new architectural decisions). impeccable skipped (`skill-missing`). Receipt re-stamped after plan body update for hash hygiene. validate exit 0. |
| New tests | ✅ 10 / 10 | 5 F9 tests + 5 Task 2.6.2 tests |
| Regression (affected areas) | ✅ 29 / 29 | post-edit-format + pr-codex-* + pr-mutex-preflight all green |
| Grep guards (roadmap §Validation) | ✅ | `Skill(impeccable` present in 7 commands; `Skill(security-reviewer` 0; ECC legacy refs only in historical `spike-results.md` doc; plugin.json version = 0.2.8 |
| Full sweep (`node --test` across hooks/receipt/lib/state/migrations) | (running in background — see Phase 6 OUTPUT) | |

---

## Files Changed

| File | Action | Why |
|---|---|---|
| `CLAUDE.md` | UPDATE | F6 new §3.6 atomic state locks; 2.6.3 §1.2 + §4 dedupe wording + env vars; quarantine runbook updated to `ownership_token_hash` |
| `plugins/mccp/commands/pr.md` | UPDATE | F9 new Phase 0.3 mutex preflight |
| `plugins/mccp/scripts/hooks/post-edit-format.js` | UPDATE | 2.6.2 `.md` branch + α/β paths + R4-F3 strict count gate + telemetry |
| `plugins/mccp/scripts/hooks/tests/post-edit-format-md.test.js` | CREATE | 2.6.2 dependency-injected α/β tests (5-axis) |
| `plugins/mccp/scripts/lib/find-code-cli.js` | CREATE | 2.6.2 VSCode CLI resolver helper |
| `plugins/mccp/scripts/receipt/tests/pr-mutex-preflight.test.js` | CREATE | F9 Bash-extracted preflight tests + schema XOR safety net |
| `.claude/PRPs/reports/q5-fixture/probe.md` | CREATE | Q5 fixture with 5 known violations |
| `.claude/PRPs/reports/q5-vscode-markdownlint-probe-2026-06-07.md` | CREATE | Q5 empirical probe record + dead-α classification |
| `.claude/PRPs/reports/v0-2-8-finalize-report.md` | CREATE | This report |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATE | Status drift fix (v0.2.7 ship date + v0.2.8 row + acceptance checkboxes + "Current plugin version: 0.2.8") |
| `.claude/plans/v0-2-8-pr-workflow-hardening.plan.md` | UPDATE | Cross-gate dedupe note for this finalize cycle + impeccable skip note |
| `.claude/receipts/mccp-plan-codex/v0-2-8-pr-workflow-hardening.json` | UPDATE | Re-stamped with new plan_hash + impeccable_skipped meta |
| `.claude/receipts/mccp-implement-codex/v0-2-8-pr-workflow-hardening.json` | UPDATE | Re-stamped (was `skipped:true` placeholder) — now approving + impeccable_skipped meta |

---

## Deviations from Plan

| Deviation | Why |
|---|---|
| Task 2.6.4 plugin.json bump was a re-interpretation — plugin.json was already 0.2.8 before this cycle (PR #7 e3b8c7b). | Scoped Task 2.6.4 down to roadmap status drift cleanup. No code change to `plugin.json` itself. |
| F9 test uses Bash extraction of the actual snippet from pr.md rather than a JS reimplementation. | Aligns with the followup plan's "table-driven preflight" intent and ensures the test stays bound to the source-of-truth Bash. JS reimplementation would diverge silently. |
| Markdown telemetry uses `[mccp:markdownlint] ...` stderr JSON, not the `stateWriter.recordTelemetry` API referenced in the plan body. | `recordTelemetry` does not exist in the codebase; the hook-trace ledger has a strict field allowlist (`SHARD_ENTRY_FIELDS`) that does not include markdown-specific fields. Adding telemetry there would have been a separate plumbing project. stderr emission is captured by hook stdio for observability today. |
| `STDERR_BAD_RE` extended to include `'command' is not in the list` for the VSCode 1.123.0 warning shape. | Empirical Q5 probe finding. Without this branch, dead-α invocations would classify as `noop-exit-0` instead of the cleaner `commandid-not-found`. |

---

## Issues Encountered

| Issue | Resolution |
|---|---|
| `MCCP_SKIP_RECEIPT=1` session env latch silently marks receipts as `meta.skipped=true`. Surfaced when re-stamping `mccp-plan-codex/v0-2-8-pr-workflow-hardening.json`. | Documented in STATE.md Open Questions. Workaround: `unset MCCP_SKIP_RECEIPT` in every Bash call that writes a receipt (shell state does NOT persist across Bash tool calls). Tracked as v0.2.4 cycle settings.json env block lifecycle debt. |
| Q5 empirical probe revealed VSCode 1.123.0 silently rejects `--command` flag. | Documented at `.claude/PRPs/reports/q5-vscode-markdownlint-probe-2026-06-07.md`. R4-F3 strict count-based gate correctly classifies the dead-α path → β runs. α retained for forward compatibility. |
| IDE markdownlint diagnostics (MD024, MD060) fired during every CLAUDE.md edit. | Ignored per `[[feedback-no-markdownlint-fix-cycle]]` user feedback memory + this very task (2.6.2) ships the trigger that will eventually fix them via the `.md` branch hook. |

---

## Next Steps

- [ ] Commit via `/mccp:prp-commit`
- [ ] Phase 7 AUTO-CHAIN → `/mccp:pr` to create the finalize PR. PR step will need `MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<reason>"` audited escape because `impeccable_skipped=true` is in the implement-codex receipt.
- [ ] Future cycle: investigate `MCCP_SKIP_RECEIPT` session-env latch lifecycle (carry from v0.2.4 debt).
- [ ] Future cycle: v0.3.0 S10b auto-handoff implementation (next active milestone per roadmap).
