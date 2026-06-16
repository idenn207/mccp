# v1.2.0 Orchestrator — Stage 2 Milestone 1 Architecture (Foundation IPC)

> Companion docs:
> - [envelope-schema.md](envelope-schema.md) — JSON Schema reference + transition matrix
> - [operator-runbook.md](operator-runbook.md) — env vars, stuck-dispatch recovery, GC policy

## 1. Why Stage 2 exists

v1.1.0 Stage 1's Task 0 spike concluded that the upstream Agent tool cannot, by itself, serve as a multi-worker orchestrator: cross-worktree receipt reads are partial (Q1=PARTIAL) and structured returns are not surfaced (Q4=NO). Stage 2 introduces a thin IPC layer so the controller can dispatch N workers, collect their results out-of-band, and re-anchor receipt chains without depending on Agent's missing primitives.

M1 ships only the foundation IPC. The pilot (PR review fanout) and the full 6-case lifecycle live in M2/M3, gated on M1 measurement.

## 2. Decision boundaries

| Decision | Picked | Why | Alternative + reject reason |
|---|---|---|---|
| Envelope location | `<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json` | Lifecycle clarity dominates receipt-chain integration. Sits next to `STATE.md` so the same hooks/inspectors see both. | Inline into `.claude/receipts/`. Rejected: blurs "receipt = approved by gate" semantics. |
| Watcher strategy | Hybrid `fs.watch` (Monitor) + `setInterval` polling | Polling is binding (always present, can't miss); `fs.watch` is opportunistic latency reducer. Cross-platform robustness wins. | Polling only. Rejected: tail latency unbounded. fs.watch only. Rejected: silently drops on Windows. |
| Controller invocation | Caller (slash-command body) calls Agent; controller is a pure lib | `Agent` is a conversation-context tool, not a lib import. Controller stays testable. | Make controller spawn Agent itself. Rejected: not possible from `lib/`. |
| Receipt schema | 4 new optional `meta.*` fields, marker-gated all-or-nothing | Existing receipts pass unchanged (backward compat). Marker prevents silent attribution loss. | Stamp on every receipt unconditionally. Rejected: pollutes non-controller receipts. |
| Crash recovery | Heartbeat file + next-command `reclaimStale` | A dead controller can't write its own death. Host-aware tri-state reclaim mirrors `pr-phase-lock.js` and gives clear semantics across hosts. | Heartbeat-only TTL. Rejected: false positives on cross-host clock skew. |

## 3. Module map

```
plugins/mccp/scripts/
├── lib/
│   ├── dispatch-envelope.js   ─ Task 1+2: schema + atomic read/write + markStatus
│   ├── worktree-sync.js       ─ Task 3: worktree → parent atomic mv (+ EXDEV fallback)
│   ├── dispatch-watcher.js    ─ Task 4: hybrid Monitor + polling
│   ├── dispatch-controller.js ─ Task 5+12: prepareDispatch + mergeEnvelopes
│   │                            + heartbeat + reclaimStale
│   └── tests/
│       ├── dispatch-envelope.test.js
│       ├── worktree-sync.test.js
│       ├── dispatch-watcher.test.js
│       ├── dispatch-controller.test.js
│       └── dispatch-fullcycle-smoke.test.js   ─ Task 11 (Codex F1)
├── receipt/
│   ├── schema.js              ─ Task 6: 4 new meta fields + invariant
│   ├── write.js               ─ Task 6: detectDispatchContext + fail-closed
│   ├── cli.js                 ─ Task 6: 3 new flags + exit 12
│   ├── validate-cmd.js        ─ Task 6 (F3) + Task 12: envelope mismatch + reclaim boot
│   └── tests/
│       ├── schema.test.js                     ─ + Task 6 cases
│       ├── write-controller-context.test.js   ─ Task 6 (F2 fail-closed)
│       └── validate-cmd-envelope.test.js      ─ Task 6 (F3 4-row)
├── state/
│   └── state-writer.js        ─ Task 8: 3 new events + 2 new patch fields
└── migrations/
    ├── v1.2.0-dispatch-fields.js              ─ Task 7: additive no-op + marker
    └── tests/
        └── v1.2.0-dispatch-fields.test.js
```

## 4. Control flow (single dispatch wave)

```
[slash command body]
   │
   ├─ controller.prepareDispatch({workers, controllerSessionId, parentCwd})
   │     ├─ idGen() per worker → UUID dispatch_id
   │     ├─ envelope.write(<dir>/<id>.envelope.json, placeholder)
   │     │                  status=pending, ended_at=null   ← F2: nonterminal
   │     ├─ writeHeartbeat(envelopePath, {pid, host, token})
   │     │                  body + mtime ← liveness anchor
   │     └─ buildWorkerPrompt({dispatch_id, envSnapshot, basePrompt})
   │
   ├─ multi-Agent parallel call               ← caller responsibility
   │     each Agent receives the worker prompt + env propagation
   │
   ├─ refreshHeartbeat(envelopePath)          ← caller loop, ~25 step cadence
   │
   ├─ each worker:
   │     ├─ does its work
   │     ├─ writes its own receipts (with --dispatched-by-controller-session,
   │     │                          --worker-dispatch-id, --ipc-envelope-path)
   │     └─ envelope.markStatus(<path>, 'ok'|'failure', {receiptsAdded, findings})
   │                              status terminal, ended_at=ISO8601
   │
   ├─ dispatch-watcher.watch({envelopeDir, deadlineMs, onEvent})
   │     emit on new envelopes; emit timeout if deadline hit
   │
   └─ controller.mergeEnvelopes([env1, env2, …])
         ├─ receiptsAdded   ← deduplicated slugs across all envelopes
         ├─ findings        ← stamped with source_dispatch_id
         └─ failedWorkers   ← pending / non-ok / malformed entries
```

## 5. Lifecycle states (6-case scaffolding)

| Case | Scenario | M1 coverage | M2/M3 |
|---|---|---|---|
| 1 | All workers OK | ✓ full | — |
| 2 | 1 worker `failure` | ✓ full | — |
| 3 | 1 worker `timeout` (no envelope) | ✓ watcher emits, merge flags pending | — |
| 4 | 1 worker malformed envelope | ✓ merge guards | — |
| 5 | Controller crash / orphan worker | ⚠ partial — heartbeat TTL reclaim only | M3: full GC |
| 6 | Stale envelope (TTL 24h GC) | — deferred | M3 |

Case 5's minimal handling lives in Task 12 (`reclaimStale`, ttlMs default 5min). Case 6 GC is deliberately deferred because measurement guides priority — M2 dogfood will tell us how often stale envelopes accumulate.

## 6. Receipt re-anchoring (additive, non-automatic)

A controller-spawned worker writes its own receipts with the 3 attribution fields. The receipt schema's marker-gated invariant rejects any partial state. The validator (`validate-cmd.js`) treats `meta.ipc_envelope_path` as a load trigger:

```
receipt.meta.ipc_envelope_path
   ↓ load
envelope at .claude/state/dispatches/<uuid>.envelope.json
   ↓ assert
envelope.dispatch_id        === receipt.meta.worker_dispatch_id
envelope.receipts_added     ⊇ ['<gate_id>/<decision_id>']
   ↓ mismatch
blocking[].kind = "envelope-mismatch"
```

Automatic chain re-link (controller absorbs worker receipts as its own) is **out of scope for M1** — see plan body §"Out of Scope".

## 7. STATE.md surface

Task 8 adds 3 events + 2 frontmatter fields. All survive the unknown-event downgrade branch (`VALID_EVENTS` whitelist):

- `dispatch_started` — controller emits at `prepareDispatch` completion
- `dispatch_envelope_received` — watcher emits per envelope arrival
- `dispatch_chain_aborted` — reclaim / controller crash recovery emits; pairs with `chain_aborted=true`
- `controller_session_id` (UUID) — conditional emit (only when set)
- `active_dispatch_count` (int) — conditional emit (only when > 0)

## 8. Out of scope (M1)

| Item | Where it lands |
|---|---|
| Pilot (PR review fanout) integration | M2 |
| Real Agent E2E test | M2 |
| Case 6 stale envelope GC (24h TTL) | M3 |
| Receipt chain auto re-link | Stage 3+ |
| Cross-platform Monitor (Windows native inotify) | M2 watcher hardening |
| `session-spawner.js` code removal | Stage 2 M2 / Stage 3 (deprecation cycle) |

## 9. Backward compatibility audit

- **Receipt schema**: `controller_context_marker_present=undefined` + 3 attribution fields=undefined → schema-valid (backward compat). v0.2.x fixtures pass without migration. Receipt write paths that don't supply the controller flags stamp `marker_present=false` + 3 nulls — semantically identical to `undefined`.
- **STATE.md**: `controller_session_id` and `active_dispatch_count` are conditional-emit. Non-controller sessions render STATE.md unchanged.
- **Migration**: `v1.2.0-dispatch-fields.js` is noop. dry-run reports `affected=0`. Existing receipts are never rewritten.
- **CLI**: `mccp-receipt write` accepts the 3 new flags as optional. Existing callers compile and run identically.

## 10. References

- Plan: [`.claude/plans/v1-2-0-orchestrator-controller-m1.plan.md`](../../.claude/plans/v1-2-0-orchestrator-controller-m1.plan.md)
- Backlog: [`.claude/plans/v1-2-0-orchestrator-stage2-backlog.md`](../../.claude/plans/v1-2-0-orchestrator-stage2-backlog.md)
- Stage 1 spike: [`docs/v1.1.0-orchestrator/spike-upstream-primitives.md`](../v1.1.0-orchestrator/spike-upstream-primitives.md)
- Pattern source: `plugins/mccp/scripts/lib/pr-phase-lock.js` (heartbeat + tri-state reclaim)
