---
description: "Alias of /mccp:pr — create a GitHub PR with the full PR-Codex gate. Kept for users coming from the PRP workflow."
argument-hint: "[base-branch] (default: main)"
---

# PR Command (PRP alias)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

`/mccp:prp-pr` is a **synonym for `/mccp:pr`**. It exists because users coming from the PRP (Plan-Reason-Pattern) workflow expect the `prp-` prefix on commit / pr commands. Behavior, phases, gates, and receipt chain are identical.

**Run the body of `/mccp:pr` verbatim**, including:

- Phase 1 — VALIDATE
- Phase 2 — DISCOVER (template, commits, files, planning artifacts)
- Phase 2.5 — **PR-CODEX GATE** (Autonomy Contract, all 8 sub-steps)
- Phase 3 — PUSH
- Phase 4 — CREATE (with `--body-file` flow from §2.5.4 persisted body)
- Phase 5 — VERIFY
- Phase 6 — OUTPUT

Receipt `gate_id` is still `mccp-pr-codex` regardless of which alias the user typed. The receipt-prompt and receipt-skill hooks recognize both `/mccp:pr` and `/mccp:prp-pr` (see `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/receipt-prompt.js` command alias resolution).

### Impeccable design gate (v0.2.6 Milestone 1)

Inherited verbatim from `/mccp:pr` Phase 2.5.1. The pre-flight helper invocation `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect --mode pr --base "origin/<base>" --json` runs identically, and `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape applies identically. The receipt records `meta.impeccable_skipped` / `meta.impeccable_force_override` on the same `mccp-pr-codex` receipt regardless of which alias the user typed. The impeccable invocations are also identical: since v1.31.3 the parent reads the resolved call form off the `[mccp:impeccable] call-form:` stderr line rather than hardcoding a name, so this alias fires the design axis through whichever channel the user installed. When that line is absent or the resolved call is unavailable, the fallback note `> impeccable unavailable, skipped (auto-fallback): skill-missing` is injected into the PR body's `## Design Review` section identically.

### Review-only invariant + PR-phase guard (v0.2.8 Task 2.6.1)

The full Task 2.6.1 surface inherits verbatim:

- **Phase 0.2** — `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape preflight runs identically (reason validator strict, exit 1 on rejection).
- **Phase 2.5.2** — cross-gate dedupe `CODEX_DEDUPE_AT_PR=1` export on `skip_safe=true` is identical; receipt records `meta.codex_dedupe_at_pr=true`.
- **Phase 2.5.3** — `pr-phase-lock.js enter` runs at the same point. The `pr-phase-guard.js` PreToolUse + PostToolUse hooks read the lock file (single source of truth) and apply default-deny on write tools + Bash sub-allowlist regardless of which alias triggered them.
- **Phase 2.5.6b** — `pr-phase-lock.js exit` finalizer runs identically. Any mutation evidence (porcelain delta or `dirty_content_hashes` re-check) blocks receipt write.
- **Phase 2.5.7** — receipt write forwards `--codex-dedupe-at-pr` / `--codex-skipped-at-pr` / `--codex-skip-reason` / `--codex-actionable-findings` identically.

The runtime guard does **not** distinguish between the two aliases — it inspects the lock file directly. The receipt `gate_id` remains `mccp-pr-codex`.

For the full procedure, see [`pr.md`](./pr.md). Do not duplicate the body here — drift between the two files would silently weaken the gate.

## Why this command exists

In the legacy PRP workflow (carried in from `Wirasm/PRPs-agentic-eng` via ECC), the PR step was named `/prp-pr` to sit next to `/prp-plan`, `/prp-implement`, `/prp-commit`. mccp renamed the canonical command to `/mccp:pr` for brevity, but kept this alias so existing muscle memory keeps working.

## Forbidden

- Implementing this command's body separately from `/mccp:pr`. If a phase changes, change it in `pr.md`.
- Skipping the Phase 2.5 PR-Codex gate just because the user typed the `prp-` alias.
