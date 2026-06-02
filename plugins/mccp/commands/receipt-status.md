---
description: Show all mccp gate receipts in the current repo, with their gate, decision, round, and convergence state
argument-hint: "[--gate <gate_id>] [--json]"
---

# /mccp:receipt-status

List every receipt in the current git repo's `<repo>/.claude/receipts/` tree. Useful before a `/mccp:*` command to verify the chain state, or to debug a hook block.

## Usage

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status [--gate <gate_id>] [--json]
```

## Examples

```bash
# All receipts in the repo (human-readable)
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status

# Only mccp-plan-codex receipts
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status --gate mccp-plan-codex

# Machine-readable
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status --json
```

## Output (human format)

```
mccp-plan-codex/feature-x       round=2  base=eb2d340b  converged          at 2026-06-02T05:00:00Z
mccp-implement-codex/feature-x  round=1  base=eb2d340b  open [1 open]      at 2026-06-02T07:30:00Z
mccp-pr-codex/feature-x         round=1  base=eb2d340b  converged SKIPPED  at 2026-06-02T09:15:00Z
```

Columns:
- `gate_id/decision_id` — receipt identity
- `round=N` — most recent round number (rounds accumulate via `--auto-round`)
- `base=<sha8>` — git merge-base at write time
- `converged` / `open [N open]` — resolution state + open question count
- `SKIPPED` — present if `meta.skipped=true` (gate was bypassed)
- `at <iso>` — `meta.created_at`

## JSON output

`--json` emits the same data as a structured array. Useful when piping into other tooling.

## Exit codes

| Exit | Meaning |
|------|---------|
| 0 | Listed successfully (zero receipts is still success) |
| 1 | Not a git repository |
