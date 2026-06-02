---
description: Validate the mccp gate receipt chain for a given /mccp:* command (preflight check)
argument-hint: "<command> [<decision-slug>] [--plan <path>]"
---

# /mccp:receipt-validate

Runs the same preflight validation the hook system would run, but invoked manually. Useful when you want to check the receipt state before triggering a real `/mccp:*` command, or when debugging a hook block.

## Usage

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js preflight \
  --command <command> \
  --decision <decision-slug> \
  [--plan <plan-path>]
```

## Examples

```bash
# Will /mccp:prp-implement go through for decision "feature-x"?
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js preflight \
  --command /mccp:prp-implement \
  --decision feature-x

# Same but also re-hash the plan file on disk vs receipt to catch staleness
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js preflight \
  --command /mccp:prp-implement \
  --decision feature-x \
  --plan .claude/plans/feature-x.plan.md
```

## Exit codes

| Exit | Meaning |
|------|---------|
| 0 | OK — gate would pass |
| 2 | Blocked — at least one of: missing receipt, stale plan hash, schema-invalid receipt, CRITICAL open question, skipped preceding gate |
| 1 | Invocation error (no command, not a git repo, etc.) |

## Output

JSON to stdout:

```json
{
  "ok": false,
  "command": "mccp:prp-implement",
  "decisionId": "feature-x",
  "missing": [{"gate_id":"mccp-plan-codex", "decision_id":"feature-x", "reason":"no receipt written"}],
  "stale":   [],
  "blocking":[],
  "open_critical":[]
}
```

When `ok=false`, the CLI also writes a human-readable block report to stderr with the `[MCCP-RECEIPT-GATE]` prefix.

## Bypass

`MCCP_SKIP_RECEIPT=1` in the environment turns this into a no-op (still logs the bypass to stderr).
