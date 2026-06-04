---
description: "Alias of /mccp:code-review (PR Review Mode) — multi-perspective PR review with the code-reviewer gate. Kept for users coming from the ECC workflow."
argument-hint: "[PR-number-or-URL] [--focus=...] [--standalone]"
---

# Review PR Command (ECC alias)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

`/mccp:review-pr` is a **synonym for `/mccp:code-review`** when invoked with a PR number or URL. It exists because users coming from ECC expect a dedicated `review-pr` command for PR-targeted review.

**Run the body of `/mccp:code-review` verbatim**, choosing the **PR Review Mode** branch:

- Phase 1 — FETCH (PR diff, files, metadata via `gh`)
- Phase 2 — CONTEXT (CLAUDE.md, lint/TS config, conventions)
- Phase 2.5 — **CODE-REVIEWER GATE PREP** (Autonomy Contract — pull preceding gate receipts, reuse Design Review / Security Reviewer findings, prevent duplicate Codex rounds)
- Phase 3 — REVIEW (specialized agents: `code-reviewer`, `comment-analyzer`, `pr-test-analyzer`, `silent-failure-hunter`, `type-design-analyzer`, `code-simplifier`)
- Phase 6 — REPORT (deduped, severity-ranked, cross-gate dedupe noted)
- Phase 7 — Receipt write (`code-reviewer` gate) unless `--standalone` was passed

Receipt `gate_id` is still `code-reviewer` regardless of which alias the user typed. The receipt-prompt and receipt-skill hooks recognize both `/mccp:code-review` and `/mccp:review-pr` (see `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/receipt-prompt.js` command alias resolution).

## Impeccable design gate (v0.2.6 Milestone 1)

Inherited verbatim from `/mccp:code-review` Phase 2.5.2 (reuse-first). The pre-flight helper invocation `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect --mode review --base "origin/<base>" --json` runs identically. The `code-reviewer` gate is **lenient** — `meta.impeccable_skipped=true` surfaces as warning, not blocking. PR body's `## Design Review` section is reused when present to avoid double-paying impeccable cost in the same PR cycle. `Skill(impeccable, "critique PR #<N>")` only fires when reuse misses. When Skill unavailable, the fallback note `> impeccable unavailable, skipped (auto-fallback): skill-missing` is recorded in Phase 6 REPORT.

## Standalone mode

`--standalone` works identically to `/mccp:code-review --standalone` — bypasses preceding-gate receipt requirements and skips the chain-closing `code-reviewer` receipt write. Use for external PRs or repos not produced through the mccp workflow.

For the full procedure, see [`code-review.md`](./code-review.md). Do not duplicate the body here — drift between the two files would silently weaken the gate.

## Confidence rule (inherited from `/mccp:code-review`)

Only report issues with confidence ≥ 80:

- **CRITICAL**: bugs, security, data loss → blocks merge
- **HIGH**: missing tests, quality problems, style violations → fix before merge
- **MEDIUM**: maintainability concerns → consider fixing
- **LOW**: style or minor suggestions → optional

## Forbidden

- Implementing this command's body separately from `/mccp:code-review`. If a phase changes, change it in `code-review.md`.
- Skipping the Phase 2.5 CODE-REVIEWER GATE PREP just because the user typed the `review-pr` alias.
