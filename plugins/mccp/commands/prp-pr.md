---
description: "Alias of /mccp:pr — create a GitHub PR with the full PR-Codex gate. Kept for users coming from the PRP workflow."
argument-hint: "[base-branch] (default: main)"
---

# PR Command (PRP alias)

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

For the full procedure, see [`pr.md`](./pr.md). Do not duplicate the body here — drift between the two files would silently weaken the gate.

## Why this command exists

In the legacy PRP workflow (carried in from `Wirasm/PRPs-agentic-eng` via ECC), the PR step was named `/prp-pr` to sit next to `/prp-plan`, `/prp-implement`, `/prp-commit`. mccp renamed the canonical command to `/mccp:pr` for brevity, but kept this alias so existing muscle memory keeps working.

## Forbidden

- Implementing this command's body separately from `/mccp:pr`. If a phase changes, change it in `pr.md`.
- Skipping the Phase 2.5 PR-Codex gate just because the user typed the `prp-` alias.
