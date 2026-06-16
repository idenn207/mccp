# v1.2.0 Orchestrator — Operator Runbook (M1)

> Audience: operators running mccp with `dispatch-controller` enabled.
> Companion docs: [architecture.md](architecture.md), [envelope-schema.md](envelope-schema.md).

## 1. Environment variables

| Variable | Default | Purpose | Status |
|---|---|---|---|
| `MCCP_ORCHESTRATOR_POLL_MS` | `500` | `dispatch-watcher` polling interval in ms. Lower = faster envelope detection, higher CPU. | live (M1) |
| `MCCP_DISPATCH_CONTEXT` | `0` | Worker-side flag. When `1`, `mccp-receipt write` auto-stamps the controller-context marker + requires all 3 attribution flags. Set by the controller as it builds the worker prompt. | live (M1) |
| `MCCP_HEARTBEAT_TTL_MS` | `300000` (5 min) | Override for `reclaimStale` TTL via caller-supplied `ttlMs`. (Currently lib-level only; not env-honoured yet — env wire-up will land if dogfood signals need.) | M2 reservation |

> **Note**: M1 does NOT yet expose `MCCP_ORCHESTRATOR_PILOT` (M2 carries the pilot vertical), nor a kill switch for the controller layer (the controller is opt-in by the caller invoking `prepareDispatch`).

## 2. Inspecting an in-flight dispatch

```bash
# List active dispatches under this repo.
ls .claude/state/dispatches/
# Each entry pair: <uuid>.envelope.json  +  <uuid>.heartbeat (until terminal)

# Read the current envelope state.
cat .claude/state/dispatches/<uuid>.envelope.json | jq .worker_exit_status

# Read the heartbeat body (controller liveness).
cat .claude/state/dispatches/<uuid>.heartbeat
# Expect: { controller_pid, controller_host, started_at,
#           ownership_token_hash, last_heartbeat_at }

# Cross-check: is the controller PID still alive?
# Same host:
ps -p $(jq -r .controller_pid < .claude/state/dispatches/<uuid>.heartbeat)
# Cross-host: trust mtime; if older than MCCP_HEARTBEAT_TTL_MS, treat as orphaned.
```

## 3. Recovering a stuck dispatch

### 3.1 The "happy" recovery path — let `reclaimStale` run

`validate-cmd.js` boot calls `reclaimStale` automatically on every receipt gate entry. The next `/mccp:*` invocation will:

1. Scan `.claude/state/dispatches/` for `*.heartbeat` files.
2. Apply tri-state policy (same-host + pid-alive = skip, same-host + pid-dead = reclaim, cross-host = mtime-only).
3. Rewrite reclaimable envelopes with `worker_exit_status='crashed'` + `worker_ended_at=<now>`.
4. Unlink the heartbeat file.
5. Surface a warning in the validator result: `dispatch-controller reclaimed N stale heartbeat(s)`.

This is fail-open: an exception during reclaim degrades to a logged warning, never blocks the gate.

### 3.2 Manual recovery

If `reclaimStale` was disabled (e.g., `opts.skipReclaim` in a custom caller), or the envelope schema is invalid (corrupt):

```bash
# Inspect the broken envelope.
cat .claude/state/dispatches/<uuid>.envelope.json

# Option A — declare it crashed manually (validates against schema).
node -e '
const env = require("./plugins/mccp/scripts/lib/dispatch-envelope");
const result = env.markStatus(
  ".claude/state/dispatches/<uuid>.envelope.json",
  "crashed",
  { endedAt: new Date().toISOString() }
);
console.log(result);'

# Option B — full reset (delete envelope + heartbeat). The next dispatch wave
# uses a fresh dispatch_id, so historical records can be archived.
mv .claude/state/dispatches/<uuid>.envelope.json \
   .claude/state/dispatches/<uuid>.envelope.json.archived-$(date +%s)
rm -f .claude/state/dispatches/<uuid>.heartbeat
```

### 3.3 If `validate-cmd` is blocking on `envelope-mismatch`

Symptoms: `validate-cmd` returns `blocking[].kind === "envelope-mismatch"` for a receipt that includes `meta.ipc_envelope_path`.

Causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| `envelope load failed at <path>: envelope not found` | Receipt references an envelope that no longer exists (deleted, archived). | Re-write the receipt without controller-context flags, or restore the envelope from your archive. |
| `envelope dispatch_id "<A>" does not match receipt.meta.worker_dispatch_id "<B>"` | Envelope was overwritten by an unrelated worker (e.g. a re-used dispatch_id). | Inspect both fields. If the receipt is the authoritative artifact, archive the envelope and create a fresh one carrying the recorded `worker_dispatch_id`. |
| `envelope.receipts_added missing self slug "<gate>/<decision>"` | Worker forgot to add its own receipt slug to the envelope. | Edit envelope `receipts_added` to include the slug, or re-write the receipt with `MCCP_DISPATCH_CONTEXT` unset (treat as standalone). |

## 4. GC policy

M1 ships only the heartbeat-based reclaim (~5 min default TTL). The 24h stale-envelope GC is M3.

Manual GC for now:

```bash
# Archive envelopes older than 24h (POSIX). Tune cadence per repo.
find .claude/state/dispatches/ -name "*.envelope.json" -mtime +1 \
  -exec mv {} {}.archived \;
```

This is safe: archived envelopes are not read by the watcher (the regex requires `.envelope.json` exact extension), and the controller never re-reads completed envelopes.

## 5. Common operator questions

**Q: My receipt write fails with `DISPATCH_MARKER_MISSING_FIELDS` (exit 12).**

A: You either passed one of the 3 controller-context flags without the other two, OR `MCCP_DISPATCH_CONTEXT=1` is in your env but you didn't pass any flag. The all-or-nothing invariant is intentional (F2 absorption — silent attribution loss). Either pass all 3 flags + the envelope path that exists on disk, or unset `MCCP_DISPATCH_CONTEXT` and drop all 3 flags.

**Q: `STATE.md` shows `active_dispatch_count: 3` but I don't see any in-flight dispatches.**

A: The controller didn't update STATE.md after merging. Either the controller crashed before the final write, or the caller didn't call `state-writer.update({active_dispatch_count: 0})` after `mergeEnvelopes`. Manual fix: `node -e "require('./plugins/mccp/scripts/state/state-writer').update(process.cwd(), {active_dispatch_count: 0})"`.

**Q: Can I run `dispatch-controller` from a worktree?**

A: Yes — `parentCwd` is whatever you pass to `prepareDispatch`. Workers running in their own worktrees use `worktree-sync.syncEnvelopeOut` to atomically move their envelope back to the parent. Cross-device renames (EXDEV) fall back to copy+unlink automatically.

**Q: Watcher reports `mode: "polling"` even on Linux. Is fs.watch broken?**

A: Possible causes: (a) the envelope directory didn't exist when the watcher started (fs.watch errors on ENOENT), (b) you forced polling via `opts.watcherFactory`, (c) Linux inotify hit a resource limit. Check `/proc/sys/fs/inotify/max_user_watches`. The polling path is the binding always-on safety net so functionality is unaffected — only tail latency increases by up to `pollMs` (500ms default).

## 6. References

- [architecture.md](architecture.md) — decision boundaries, module map, control flow
- [envelope-schema.md](envelope-schema.md) — field-by-field schema reference
- `plugins/mccp/scripts/lib/dispatch-controller.js` — `reclaimStale`, `writeHeartbeat`, `refreshHeartbeat` source
- `plugins/mccp/scripts/receipt/validate-cmd.js` — envelope mismatch + boot-time reclaim integration
