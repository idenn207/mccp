---
description: Inspect mccp hook-trace shards for the current and recent sessions
---

# /mccp:trace

Read the L1 hook-trace ledger and surface what happened — current session's
per-invocation shards plus any prior session's `consolidated.jsonl`. Use this
when a `/mccp:*` command appears to do nothing (silent fail-open) or a hook
emits a recovery hint pointing to `.claude/state/hook-trace/<session_id>/`.

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

## Phase 0 — Confirm scope

Decide which session's trace to read:
- **default** (no argument) — current session + up to 3 most recent prior sessions.
- **`<session_id>`** — inspect a specific prior session.

## Phase 1 — Read shards

Working directory: project repo root. Trace lives at `.claude/state/hook-trace/`.

```bash
# Current session shards (per-tool-use JSONL):
ls -la .claude/state/hook-trace/$CLAUDE_SESSION_ID 2>/dev/null || true

# Most recent 3 sessions overall (sorted by mtime):
ls -dt .claude/state/hook-trace/*/ 2>/dev/null | head -3
```

For each session dir, summarize:
- `.end` marker presence → SessionEnd compaction occurred (or not — likely silent failure)
- Per-shard `<tool_use_id>-<phase>.jsonl` files — each line is one observation
- `consolidated.jsonl` — present after SessionEnd ran the L5 compactor
- `.quarantine/` — malformed shards isolated by C4 corruption contract

## Phase 2 — Read hook-caps

```bash
cat .claude/state/hook-caps.json 2>/dev/null || echo "(no hook-caps probe yet)"
```

Surface:
- `version` + `supported_features` — Claude Code binary probe result
- `error_class` / `stderr_capture` — if non-empty, probe failed; L2c minimum-spec mode active
- `probed_at` — staleness check (24h cadence in default config)

## Phase 3 — Format output

Group entries by `command_name` then by `tool_use_id`. For each:
- `gate_decision` (ALLOW / BLOCK / OBSERVED / ALLOW_DUE_TO_INTERNAL_ERROR / …)
- `layer` (L1 / L2a / L2b / G1 / …)
- `exception_class` if present
- `ts`

Prefix any session that lacks `.end` with a warning — that's the case the
silent-hook UX milestone targets.

## Phase 4 — Recovery hints

If a recent prior session shows BLOCK decisions or G1 internal errors, suggest:
- `/mccp:receipt-status` — inspect the receipt chain that gated the block
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate --command <slug>` — diagnose stale receipts
- `MCCP_RECEIPT_DEBUG=1` then re-run the command — verbose stderr
- `MCCP_SKIP_RECEIPT=1` — one-shot bypass

If a session is quarantined (`.quarantine/` populated), the corrupted shard
was rotated. The next `recordWrite` lands cleanly — no further action needed.

## Acceptance

- Reports current session entries (if any) ✓
- Reports up to 3 prior sessions (or the explicit `<session_id>`) ✓
- Flags sessions without `.end` marker ✓
- Surfaces `hook-caps.json` health ✓
