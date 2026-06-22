---
description: Serve the mccp status dashboard on localhost with live-reload (auto-renders first)
argument-hint: "[--port <n>] [--no-open]"
---

# /mccp:dashboard

Render the latest STATUS and serve `.claude/cache/status.html` on `127.0.0.1`
with live-reload. The browser tab auto-refreshes whenever the dashboard cache
changes (receipt write, envelope move, `/mccp:dashboard-refresh`, etc).

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

## Procedure

### 1 — Refresh the cache first (freshness guarantee)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/derive/cli.js" render
```

If render fails, do NOT abort — the server can still serve the prior (stale)
cache. Print a loud note that the dashboard may be stale and continue.

### 2 — Start the server in the background

The server keeps running (event loop alive), so start it as a background
process. Forward any `--port <n>` / `--no-open` arguments from the invocation.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dashboard-server.js" $ARGUMENTS
```

Behavior (see `scripts/lib/dashboard-server.js`):

- Binds `127.0.0.1` only — never externally exposed.
- Default port `7333`. If **our** dashboard for this repo is already running, it
  reuses it and just re-opens the browser (no second server).
- If port `7333` is held by a **foreign** process, it fails loudly and asks for
  `--port <n>` — it does NOT silently fall forward to another port (so a
  bookmark at `:7333` never shows the wrong dashboard).
- Opens the default browser (skip with `--no-open`); if the OS open call fails
  it prints the URL for manual opening.

### 3 — Report

Print the served URL, the PID, and the stop instruction:

```
Dashboard: http://127.0.0.1:<port>/  (live-reload on)
Stop: kill <pid>
```

## Notes

- The cached `status.html` stays byte-pristine — the live-reload `<script>` is
  injected on-the-fly at serve time, not written to disk.
- To re-render without (re)starting the server, use `/mccp:dashboard-refresh`.
- The PID file lives at `.claude/cache/.dashboard-server.pid` (gitignored) and
  is scoped to this repo + cache path, so a stale PID copied across worktrees
  never reuses another checkout's server.
