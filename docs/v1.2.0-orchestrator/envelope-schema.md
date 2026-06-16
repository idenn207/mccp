# Dispatch Envelope Schema (v1)

> v1.2.0 Stage 2 Milestone 1 — foundation IPC.
> Reference module: [`plugins/mccp/scripts/lib/dispatch-envelope.js`](../../plugins/mccp/scripts/lib/dispatch-envelope.js).
> Spike evidence: [`docs/v1.1.0-orchestrator/spike-upstream-primitives.md`](../v1.1.0-orchestrator/spike-upstream-primitives.md).

## Why this exists

The v1.1.0 Stage 1 Task 0 spike concluded that the upstream `Agent` tool does not, by itself, return structured controller-worker IPC across worktree boundaries. Stage 2 M1 inserts the **envelope** as the single source of truth a worker writes when it terminates, and the parent controller (or a successor command via `reclaimStale`) reads to make dispatch decisions.

Each envelope:

- is produced by exactly one worker
- lives at `<parent_cwd>/.claude/state/dispatches/<dispatch_id>.envelope.json`
- is written atomically (`*.tmp` → rename, Task 2)
- is **never edited in place**; transitions overwrite via the same atomic rename
- is treated as adverse evidence if missing past a watcher deadline (Task 4)

## Field table

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | string constant `"v1"` | yes | Future bumps will land via new file `envelope-schema-v2.md` + migration. |
| `dispatch_id` | UUID (any flavor) | yes | Anchored to the controller-provided ID. Used as filename and as `receipt.meta.worker_dispatch_id`. |
| `worker_subagent_type` | string | yes | e.g. `"mccp:code-reviewer"`. |
| `worker_started_at` | ISO 8601 | yes | UTC strongly recommended. |
| `worker_ended_at` | ISO 8601 \| `null` | conditional | **Must be `null` when `worker_exit_status="pending"`** and **must be ISO 8601 when the status is terminal**. Codex Implement-Codex R1 F2 absorption. |
| `worker_exit_status` | enum | yes | See [Lifecycle states](#lifecycle-states). |
| `receipts_added` | string[] | yes | Slugs of receipts the worker wrote inside its worktree (e.g. `"mccp-code-reviewer/<decision>.json"`). Controller uses this to re-anchor the chain (Task 6, F3 absorption). |
| `findings` | object[] | yes | Free-form per agent contract; `mergeEnvelopes` is the only consumer. |
| `next_action` | string \| `null` | no | Optional handoff hint. |
| `controller_session_id` | UUID | yes | Injected by the controller at `prepareDispatch`; worker echoes it back. Used to detect orphaned envelopes whose controller is gone (Task 12 `reclaimStale`). |
| `parent_cwd` | string | yes | The repo root the controller was running in. Used by `worktree-sync.js` (Task 3) to confirm cross-device fallback target. |

`additionalProperties: false` — any unknown key is a schema violation (caught by `validate()` and by the JSON Schema export).

## Lifecycle states (`worker_exit_status`)

```
            prepareDispatch                worker termination
                   │                                │
                   ▼                                ▼
             ┌──────────┐                    ┌──────────────┐
controller → │ pending  │ ── (worker write) →│   ok          │
   write     └──────────┘                    │   failure     │
                                             │   timeout     │
                                             │   crashed     │
                                             └──────────────┘
                                              (terminal — set by
                                               worker, or by
                                               `reclaimStale` for
                                               crashed orphans)
```

| State | Set by | Terminal | `worker_ended_at` |
|---|---|---|---|
| `pending` | controller (`prepareDispatch`) | no | **MUST be `null`** |
| `ok` | worker (`markStatus`, Task 2) | yes | ISO 8601 (worker termination time) |
| `failure` | worker | yes | ISO 8601 |
| `timeout` | watcher synthesizing on deadline miss (Task 4) **OR** worker self-declared | yes | ISO 8601 (deadline or self-time) |
| `crashed` | `reclaimStale` (Task 12) for orphan workers | yes | ISO 8601 (reclaim time) |

Codex Implement-Codex R1 F2 absorption: `pending` was added so the controller's placeholder write at `prepareDispatch` does not have to lie with a terminal status or fail its own schema. The state machine is now strictly monotonic from `pending` to any terminal.

## JSON Schema (Draft-07)

The constant `JSON_SCHEMA` is exported from [`plugins/mccp/scripts/lib/dispatch-envelope.js`](../../plugins/mccp/scripts/lib/dispatch-envelope.js) and is the **same** structure shown below (kept inline for editor inspection):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://my-claude-code-plugin/schemas/v1.2.0-dispatch-envelope.json",
  "title": "Dispatch Envelope",
  "type": "object",
  "required": [
    "schema_version", "dispatch_id", "worker_subagent_type",
    "worker_started_at", "worker_exit_status", "receipts_added",
    "findings", "controller_session_id", "parent_cwd"
  ],
  "additionalProperties": false,
  "properties": {
    "schema_version": { "const": "v1" },
    "dispatch_id": { "type": "string", "pattern": "<UUID regex>" },
    "worker_subagent_type": { "type": "string", "minLength": 1 },
    "worker_started_at": { "type": "string", "pattern": "<ISO8601 regex>" },
    "worker_ended_at": {
      "oneOf": [
        { "type": "string", "pattern": "<ISO8601 regex>" },
        { "type": "null" }
      ]
    },
    "worker_exit_status": {
      "enum": ["pending", "ok", "failure", "timeout", "crashed"]
    },
    "receipts_added": { "type": "array", "items": { "type": "string", "minLength": 1 } },
    "findings": { "type": "array", "items": { "type": "object" } },
    "next_action": {
      "oneOf": [
        { "type": "string", "minLength": 1 },
        { "type": "null" }
      ]
    },
    "controller_session_id": { "type": "string", "pattern": "<UUID regex>" },
    "parent_cwd": { "type": "string", "minLength": 1 }
  },
  "allOf": [
    {
      "if": { "properties": { "worker_exit_status": { "const": "pending" } } },
      "then": { "properties": { "worker_ended_at": { "type": "null" } } }
    },
    {
      "if": {
        "properties": {
          "worker_exit_status": { "enum": ["ok", "failure", "timeout", "crashed"] }
        }
      },
      "then": { "properties": { "worker_ended_at": { "type": "string" } } }
    }
  ]
}
```

The hand-rolled `validate()` is the authoritative checker inside mccp (no JSON Schema validator dependency); the `JSON_SCHEMA` constant exists for external consumers and for editor schema-completion tools.

## Example envelopes

### Placeholder (right after `prepareDispatch`)

```json
{
  "schema_version": "v1",
  "dispatch_id": "019eced3-cce9-7be3-81a1-c8a5c30a27fe",
  "worker_subagent_type": "mccp:code-reviewer",
  "worker_started_at": "2026-06-16T05:00:00Z",
  "worker_ended_at": null,
  "worker_exit_status": "pending",
  "receipts_added": [],
  "findings": [],
  "next_action": null,
  "controller_session_id": "019ecedf-1234-5678-9abc-def012345678",
  "parent_cwd": "C:/_project/my/my-claude-code-plugin"
}
```

### Terminal (`ok` after worker termination)

```json
{
  "schema_version": "v1",
  "dispatch_id": "019eced3-cce9-7be3-81a1-c8a5c30a27fe",
  "worker_subagent_type": "mccp:code-reviewer",
  "worker_started_at": "2026-06-16T05:00:00Z",
  "worker_ended_at": "2026-06-16T05:01:30.123Z",
  "worker_exit_status": "ok",
  "receipts_added": [
    "mccp-code-reviewer/v1-2-0-orchestrator-controller-m1.json"
  ],
  "findings": [
    {
      "severity": "MEDIUM",
      "area": "envelope-schema",
      "description": "schema_version forward-compat unspecified"
    }
  ],
  "next_action": "queue next dispatch",
  "controller_session_id": "019ecedf-1234-5678-9abc-def012345678",
  "parent_cwd": "C:/_project/my/my-claude-code-plugin"
}
```

## Validation contract

`envelope.validate(input)` returns `{ ok: boolean, errors: string[] }`. The function is pure (no fs, no env) and does not throw on malformed input — every violation lands in `errors[]`. The empty/null/non-object cases return `ok: false` with the message `envelope must be an object`.

See [`plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js`](../../plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js) for the regression table.

## What is NOT in this milestone

- `validate/read/write/markStatus` runtime functions (Task 2)
- Worktree-to-parent atomic mv (Task 3)
- Hybrid Monitor + polling watcher (Task 4)
- `dispatch-controller` core (Task 5)
- Receipt schema extension (Task 6 — `meta.dispatched_by_controller_session_id`, `meta.worker_dispatch_id`, `meta.ipc_envelope_path`)
- `reclaimStale` heartbeat + next-command recovery (Task 12)
- Migration `v1.2.0-dispatch-fields.js` (Task 7)

This milestone defines only the wire format. The interpreting code follows in Tasks 2 through 12.
