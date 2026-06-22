---
description: Re-render the mccp status dashboard (STATUS.md + status.html) without starting a server
argument-hint: "[--raw]"
---

# /mccp:dashboard-refresh

Re-derive the `.claude/` state and re-render `.claude/cache/STATUS.md` +
`status.html`. This is the server-less refresh path — if a `/mccp:dashboard`
server is already running, its live-reload watch picks up the new files and the
open browser tab refreshes automatically within ~1s.

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

## Procedure

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/derive/cli.js" render
```

Forward `--raw` if the invocation passed it (emits an unmasked HTML with a red
ribbon — internal use only, do NOT share the output).

## Report

After render, report the output paths and whether the prior cache was stale:

```
Refreshed: .claude/cache/STATUS.md + status.html
```

If the render emits a `cache_stale` line on stderr, surface it — it means the
previous cache had not been refreshed by the auto-trigger.

## Notes

- This command does NOT start or stop the localhost server. Use
  `/mccp:dashboard` for serving.
- LLM-free, dependency-free, read-only over `.claude/` — see
  `scripts/derive/cli.js` `render`.
