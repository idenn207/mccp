---
report: v0.2.7 PR-Codex Round 1 findings
date: 2026-06-05
branch: feat/v0.2.7-silent-hook-ux
head_sha: 48964a5
codex_thread_id: 019e96e5-907a-7bf2-a6c8-0eeabfb33a5f
verdict: needs-attention
ship: false
status: REJECTED-pending-fix-cycle
next_cycle: v0.2.7 fix commits (or v0.2.7.1 patch) — see Decision Log
---

# v0.2.7 PR-Codex Round 1 Findings

Codex adversarial review (PR-Codex gate) for the v0.2.7 Silent Hook UX milestone returned `needs-attention` ("No-ship: the new recovery surface can still hide its own failed compaction, and it promotes unsanitized failure text into hook-visible output.").

`/mccp:pr` invocation was **stopped before any GitHub mutation**:

- No `gh pr create` call
- No `mccp-pr-codex` receipt written
- No push to remote
- Stash with v0.2.8 pre-plan amendment was restored cleanly

User decision: separate fix cycle (terminal `/mccp:pr` does not enter fix-cycle on its own — v0.2.8 Task 2.6.1 review-only invariant rationale).

## Findings

### F-PR1 (HIGH) — SessionEnd marker can mask failed trace compaction

- **File**: [session-end-trace.js:103-106](../../plugins/mccp/scripts/hooks/session-end-trace.js#L103-L106)
- **Confidence**: 0.9
- **Body**: The registered SessionEnd path writes `.end` before attempting `consolidateSession`, then swallows compaction errors. Since crash alerting treats any session with `.end` as clean, a disk/permission/write failure after the marker leaves the session looking healthy while `consolidated.jsonl` is missing or stale. That defeats the observability surface precisely on the recovery path.
- **Recommendation**: Only write `.end` after successful consolidation, or write an explicit failure marker/status file and make `scanCrashAlerts` flag sessions with `.end` but missing/failed consolidation.

### F-PR2 (HIGH) — Tool failure surface leaks raw error text

- **File**: [post-tool-use-failure.js:50-64](../../plugins/mccp/scripts/hooks/post-tool-use-failure.js#L50-L64)
- **Confidence**: 0.84
- **Body**: `summarizeError` copies the first line of `event.error` directly into `systemMessage`, and this hook is registered for all failed tools. Tool errors commonly include command lines, file paths, stderr, tokens, URLs, or auth details; this change promotes that data into hook output/additional context without redaction or an opt-in debug gate.
- **Recommendation**: Emit only a sanitized error class/exit code by default. Redact known secret patterns and place raw stderr/error excerpts behind an explicit debug opt-in with tight length limits.

### F-PR3 (MEDIUM) — Trace recovery command is Bash-only on Windows-capable plugin

- **File**: [trace.md:24-42](../../plugins/mccp/commands/trace.md#L24-L42)
- **Confidence**: 0.91
- **Body**: The new `/mccp:trace` recovery instructions hard-code `ls -la`, `ls -dt ... | head`, `cat`, `$CLAUDE_SESSION_ID`, and `/dev/null`. In the provided environment the shell is PowerShell, where these snippets fail or use different env-var syntax, so the recovery command can break for Windows users when they need it most.
- **Recommendation**: Replace shell-specific snippets with a small Node helper script for trace inspection, or provide explicit PowerShell and POSIX branches selected by the current shell/platform.

## Codex Next Steps (as proposed by reviewer)

1. Fix the SessionEnd success/failure state model before shipping the observability milestone.
2. Add tests for compaction failure after marker write, redacted PostToolUseFailure output, and Windows/PowerShell trace execution.

## Decision Log

- **2026-06-05 (this session)**: `/mccp:pr` invoked on `feat/v0.2.7-silent-hook-ux`. Phase 2.5.3 (PR-Codex Round 1) returned `needs-attention`. Per user decision, terminal `/mccp:pr` does not auto-enter fix-cycle — stopped at Phase 2.5.4 with no receipt and no PR. Findings preserved here.
- **Next cycle entry**: open this report as context, then either:
  1. Add 3 fix commits on `feat/v0.2.7-silent-hook-ux` (F-PR1, F-PR2, F-PR3) + tests, then re-invoke `/mccp:pr` for Round 2.
  2. Or carve out a `v0.2.7.1` patch branch, fix, merge back, then `/mccp:pr` once.
- **Mirror to v0.2.8 plan**: this incident validates the Task 2.6.1 motivation (review-only invariant) — terminal `/mccp:pr` should never silently mutate after Codex findings.

## Audit Trail

- Codex companion stderr (full): `.git/mccp/tmp/codex-invoke.stderr` (working-tree-only; not committed)
- Codex thread ID for cross-reference: `019e96e5-907a-7bf2-a6c8-0eeabfb33a5f`
- Codex classification: `ok` (wrapper succeeded), `blocking: false`, `advisory: false`
- Wrapper exit: 0
- Duration: 368.2s
