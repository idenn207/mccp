---
description: Serve the mccp status dashboard on localhost with live-reload (auto-renders first)
argument-hint: "[--port <n>] [--no-open] [--write]"
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

## Write mode (`--write`, optional) — obsolete-resolve

By default the dashboard is **read-only**: it has no mutation route at all. With
`--write`, the same single server additionally enables in-context "제외(obsolete)"
buttons in the risk/question drawer. Clicking one records a **non-destructive
resolution marker** (`<!--mccp:resolved reason="…" at="…"-->`) on the source
`.md` row via `stale-audit/apply.js`, and the dashboard re-renders so the item
collapses out of the active list.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dashboard-server.js" --write
```

- **Read-only by default (P1)**: without `--write` the POST route is never
  registered — there is no mutation surface for a malicious page to hit. The
  exposure window is limited to the lifetime of an explicit `--write` session.
- **Security model**: writes are closed with (1) a loopback **Host allowlist**
  (non-loopback `Host` → reject, blocks DNS-rebinding), (2) an **Origin/Referer**
  check against the server's configured origin (not the request `Host`),
  (3) a per-process **nonce** header, (4) an **opaque item-id** — the browser
  never sends a path; the server re-enumerates and maps the id back to a
  server-derived ref, (5) `.claude/**/*.md` **containment**, and (6) fail-closed
  `apply.js` (per-file lock + content-hash CAS). Any check failing leaves the
  source unchanged.
- **Reversibility + audit-trail**: a reason (≥ 2 words) is required and is
  recorded in the marker. To undo, delete the trailing `<!--mccp:resolved …-->`
  marker from the source row.
- **Uncertain items → `/mccp:dashboard-audit`**: the write button is for
  in-context single items you're sure about. For bulk or evidence-gated
  retirement, use `/mccp:dashboard-audit` instead.
- Cross-worktree overview aggregates never get a write button (the button is
  only on this repo's drawer risk/question items); containment is the 2nd guard.

## Notes

- The cached `status.html` stays byte-pristine — the live-reload `<script>` (and,
  in `--write` mode, the resolve-action `<script>` + nonce) are injected
  on-the-fly at serve time, never written to disk.
- To re-render without (re)starting the server, use `/mccp:dashboard-refresh`.
- The PID file lives at `.claude/cache/.dashboard-server.pid` (gitignored) and
  is scoped to this repo + cache path + **mode bit**, so a stale PID copied
  across worktrees never reuses another checkout's server, and a default request
  never reuses a `--write` server (or vice-versa).
