---
description: Write an mccp gate receipt (mccp-plan-codex, mccp-implement-codex, mccp-pr-codex, etc.) after a gate has been completed
argument-hint: "<gate_id> <decision-slug> <plan-path> [--design-doc <path>] [--findings-file <path>] [--resolution-file <path>] [--auto-round]"
---

# /mccp:receipt-write

This command writes a structured JSON receipt for an mccp command gate that you just completed (Plan-Codex, Implement-Codex, PR-Codex, etc.). The receipt becomes the mechanical proof that the gate ran against a specific plan/design/git state, and is checked by hooks before subsequent `/mccp:*` commands.

## Usage

The user-supplied arguments are positional + optional flags. Forward them to the CLI:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
  --gate <gate_id> \
  --decision <decision-slug> \
  --plan <plan-path> \
  [--design-doc <path>] \
  [--findings-file <path>] \
  [--resolution-file <path>] \
  [--auto-round] \
  [--codex-skipped]
```

## Required arguments

| Flag | Description |
|------|-------------|
| `--gate <id>` | One of: `mccp-plan-codex`, `mccp-implement-codex`, `mccp-pr-codex`, `security-reviewer`, `code-reviewer`. Impeccable-side gates (`plan-impeccable`, `implement-impeccable`, `pr-impeccable`) are also accepted for users who install impeccable alongside mccp |
| `--decision <slug>` | Kebab-case identifier for the decision/feature (e.g. `dashboard-ui`). Must match across the plan → implement → pr chain |
| `--plan <path>` | Path to the plan markdown file. Hashed for staleness detection |

## Common patterns

After running `/codex:adversarial-review` on a plan and the round converged:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
  --gate mccp-plan-codex \
  --decision feature-x \
  --plan .claude/plans/feature-x.plan.md \
  --findings-file .claude/tmp/findings.json \
  --resolution-file .claude/tmp/resolution.json
```

After a follow-up Codex round on the same decision:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
  --gate mccp-plan-codex \
  --decision feature-x \
  --plan .claude/plans/feature-x.plan.md \
  --auto-round    # bumps round from N to N+1
```

## What gets stored

The receipt is written to `<repo>/.claude/receipts/<gate_id>/<decision-slug>.json` and contains:

- `gate_id`, `phase`, `decision_id`, `task_id`, `round`
- `plan_hash` (SHA-256 of canonicalized plan markdown)
- `design_doc_hash[]` (per-file SHA-256 for any `--design-doc`)
- `base_sha`, `head_sha` (git refs at write time)
- `findings[]`, `resolution{accepted, rejected, open_questions}`
- `subject_hash` (RFC 8785 JCS canonical hash of the dedupe key — used by hooks)
- `receipt_hash` (full-receipt hash — tamper detection)
- `meta.created_at`, `meta.command`, `meta.skipped`, `meta.codex_skipped`

Successful write returns the receipt path on stdout (exit 0). Schema validation failure → exit 2.

## Bypass

If you must write a receipt that skips a gate (e.g. Codex unavailable), set `MCCP_SKIP_RECEIPT=1` in the environment OR pass `--codex-skipped`. The skip reason is recorded in `meta.skipped` / `meta.codex_skipped`, and the next `/mccp:*` command's preflight will surface it.

## Notes

- This is the manual ingress. The hook layer does **not** auto-write receipts (Phase 1 MVP — Stop+transcript-parser deferred to Phase 2 upgrade).
- The `--decision <slug>` must match across the entire plan → implement → pr chain. Drift breaks the chain.
- If you forget to write a receipt after a gate, the next `/mccp:*` command will block at preflight and tell you exactly which gate is missing.

See `${CLAUDE_PLUGIN_ROOT}/scripts/receipt/README.md` for full schema and storage details.
