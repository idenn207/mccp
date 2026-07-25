# Measurement Instrumentation (v1.22.6-m2)

## Overview

M2 implements **observable instrumentation** for the multi-session work-loop platform without invoking additional LLM calls. Metrics are **computed from existing lifecycle signals**, not synthesized or requested.

This document specifies:
- **7 Event types** → producer source (file:line) → derive layer → dashboard section
- **No-LLM contract** (verification checklist)
- **Anti-gaming integrity rules** (mechanical enforcement at compute time)
- **Retention & GC policy** (bounded allowlist schema, field/line caps, expiration)
- **A3 instruction-cost release contract** (Python runtime, tiktoken pinned version)

## 7 Events → Producer → Derive → Dashboard

| Event | Numerator Semantics | Producer (file:line) | Derive Source | Metric IDs |
|---|---|---|---|---|
| **1-session-start** | Session initialized successfully | `session-start.js:L668` `createLedger` | `session-activity.js` | A1 denominator |
| **2-session-context** | `context_remaining_pct` recorded | `session-end.js:L336` (read from context-state) | `session-activity.js` | A2 numerator/denominator |
| **3-handoff-item** | Unresolved work item enumerated (denominator) or resumed (numerator) | `handoff-items.js` + `session-start.js` recovery | `session-activity.js` | A4 numerator/denominator |
| **4-toggle-usage** | Non-default `MCCP_*` env setting observed | `session-start.js` env-snapshot capture | `toggle-usage.js` | B3 numerator/denominator |
| **5-concurrent-session** | 2+ sessions detected overlapping (pairwise) | `session-activity.js` (hook-trace shard correlation + session-ledger heartbeat) | `session-activity.js` | B2 denominator |
| **6-conflict-window** | Concurrent sessions touched same file during overlap | hook-trace shard diff union + PR diff audit | `session-activity.js` | B2 numerator |
| **7-codex-finding** | Codex-produced finding from any gate (plan/implement/pr) | `receipt` `findings[]` count (mccp-plan/implement/pr-codex) | `recoverability-probe.js` | C1 numerator/denominator |

## No-LLM Contract

The following files **MUST NOT** contain:
- `require('...codex-invoke...')`
- `require('...briefing/invoke...')`
- `Skill('...')`
- `Agent(...)`
- Network requests (fetch, http)

**Verified modules** (non-exhaustive list):
- `plugins/mccp/scripts/hooks/session-start.js` (writes msw-events + env-snapshot)
- `plugins/mccp/scripts/hooks/session-end.js` (writes msw-events)
- `plugins/mccp/scripts/state/msw-events.js` (sidecar append-only log)
- `plugins/mccp/scripts/state/toggle-snapshot.js` (env scan + capture)
- `plugins/mccp/scripts/state/handoff-items.js` (state.md frontmatter read)
- `plugins/mccp/scripts/derive/sources/session-activity.js` (correlate ledger + events)
- `plugins/mccp/scripts/derive/sources/toggle-usage.js` (env-snapshot aggregation)
- `plugins/mccp/scripts/lib/msw-metrics/index.js` (metric compute)
- `plugins/mccp/scripts/lib/renderer/sections/msw-metrics.js` (dashboard render)

## Anti-Gaming Integrity Rules

Applied at **compute time** (msw-metrics/index.js), mechanical enforcement:

### A1: Session Initialization Integrity
- **Rule 1**: `numerator` ≤ `denominator` (session counts can't exceed total sessions).
- **Rule 2**: `numerator` growth > 50% month-over-month OR single-jump > 3x prior baseline → flagged `integrity_ok: false` (possible session splitting).
- **Rule 3**: `created_at` (ledger timestamp) > `initiated_at` (event timestamp) → `invalid` (temporal paradox, discard record).
- **Enforcement**: if any rule violated, status = `invalid`, not rendered in baseline.

### A2: Context Information Completeness
- **Rule**: Sessions with `context_remaining_pct` unrecorded → excluded from denominator (record producer coverage via msw-events `producer` field).
- **Enforcement**: `coverage` field tracks which producer was present; `insufficient` if <50% coverage.

### A4: Handoff Recovery Matching
- **Rule**: Handoff items enumerated in session N must be *structurally* matched in session N+1 recovery (same slug/category, ignoring completion status).
- **Enforcement**: Cross-session matching algorithm ignores order, cardinality mismatch is red flag.

### B1: Setting Independence Audit
- **Rule**: Concurrent sessions must diff their env-snapshot to confirm actual independence (not both running same config due to stale snapshot).
- **Enforcement**: `different_env_snapshot=true` required for B1 numerator credit. Identical snapshots → same-config → not independent.

### B2: Concurrent Conflict Avoidance
- **Rule 1**: Denominator = count of pairwise session overlaps (same session cluster in time). Denominator 0 → `invalid`.
- **Rule 2**: Numerator = overlaps where no shared file was modified. Numerator > denominator → data corruption (files can't be "un-modified"), status = `invalid`.
- **Enforcement**: merged-diff audit cross-checks against hook-trace per-shard writes.

### B3: Toggle Coverage Ceiling
- **Rule**: Numerator ≤ `runtime_surface_count` (99 scripts). Non-default toggle count can't exceed total toggles.
- **Enforcement**: `toggle-snapshot.js` scans runtime surface to re-assert count.

### C1: PR Recoverability Thresholds
- **Rule 1**: Stratified sample of 40 PRs across gates/base-sha.
- **Rule 2**: ≥60% of sampled PRs parse successfully (metadata extractable).
- **Rule 3**: ≥75% of parsed PRs match findings count ±5% (allow for post-hoc edits).
- **Rule 4**: ≤5 cells-per-row (structured table consistency).
- **Enforcement**: `recoverability-probe.js` runs as read-only diagnostic; result feeds `coverage` + `status`.

## Retention & Garbage Collection

### Event Log (`msw-events.jsonl`)

**File location**: `.claude/state/msw-events/<session_id>.jsonl` (git-ignored)

**Schema** (bounded allowlist, per-field char cap):

```json
{
  "kind": "session-start" | "session-end" | "context-recorded" | ... ,
  "ts": "<ISO timestamp>",
  "session_id": "<session_id>",
  "created_at": "<ISO>",
  "ended_at": "<ISO>" | null,
  "task_slug": "string<512" | null,
  "task_completed": boolean | null,
  "context_remaining_pct": <number 0-100> | null,
  "producer": "session-start" | "session-end" | "hook-trace" | "context-state" | null
}
```

- **Field cap**: 256 chars per field (mirrors hook-trace `FIELD_MAX_CHARS`)
- **Line size cap**: ~4KB per line (exceeded lines truncated + `truncated: true` flag)
- **Malformed line handling**: skip + log diagnostic (per-session digest, fail-open)
- **Retention GC** (per-file):
  - `PER_SHARD_MAX_BYTES`: 64KB per file
  - `MAX_ENTRIES`: 100 entries per file
  - `MAX_GLOBAL_BYTES`: 100MB across all `.claude/state/msw-events/`
  - **LRU eviction**: oldest entries dropped when cap exceeded

### Environment Snapshot (`.env-snapshot.json`)

**File location**: `.claude/state/<session_id>.env-snapshot.json` (git-ignored)

**Schema** (name + boolean only, no raw values):

```json
{
  "session_id": "<session_id>",
  "captured_at": "<ISO>",
  "toggles": [
    {
      "name": "MCCP_SUBSCRIPTION",
      "non_default": true,
      "class": "subscription"
    },
    {
      "name": "MCCP_DESIGN_CRITIQUE_MAX_RETRY",
      "non_default": false,
      "class": "design"
    }
  ]
}
```

- **Raw value stored**: ❌ **NEVER**. Only metadata (name, boolean, class) preserved.
- **Secret names redacted**: Names matching `_KEY`, `_SECRET`, `_TOKEN` → redacted as `*_REDACTED` (v1.22.5 redaction pattern).
- **Retention**: per-session file, no GC (ledger entry deletion implies snapshot deletion).

## A3 Instruction-Cost Release Contract

### Tokent Computation

**Payload 3-part source**:
1. CLAUDE.md (project instruction)
2. MEMORY.md index (user auto-memory, **opt-in only**)
3. STATE.md frontmatter (session context)

**Token counting**:
- **Runtime**: Python 3.8+ with `tiktoken` package
- **Model**: `o200k_base` encoding (GPT-4.0 era)
- **Tokenizer pin**: `tiktoken==0.7.0` (exact version required for reproducibility)
- **Fallback**: If tokenizer unavailable or Python not found → status = `baseline-unavailable` (loud log, not silent pass)

**Artifact storage**:
- Raw CLAUDE.md / MEMORY.md / STATE.md text: ❌ **NEVER stored**
- Stored only: count (integer) + sha256 (hex digest)
- User-level MEMORY.md: only read if `MCCP_A3_INCLUDE_MEMORY=1` env opt-in

### Integration

- **Producer**: `a3-instruction-cost.js` (pure, no LLM)
- **Derive source**: invoked by `msw-metrics/index.js` at compute time
- **Dashboard**: C2 metric (value = percentage of context used, if baseline exists)

---

## Dogfood Protocol (M2 Acceptance)

1. **Seed fixture** (synth historic data):
   - 3 simulated session records with known metrics (A1=3/3, B3=2/5, C1=12/16)
   - Run `/mccp:work --resume` to validate compute produces expected values

2. **Live cycle** (operator-executed, outside recurse guard):
   - Full `/mccp:work` chain in participant environment
   - Collect msw-events sidecar + toggle-snapshot + resulting metrics
   - Verify anti-gaming flags are correct (no false integrity_ok)
   - Verify no-LLM compliance via grep denylist

3. **Snapshot archive**:
   - Save `.claude/cache/STATUS.md` + `.claude/cache/status.html` → docs/multi-session-work-loop/m2-dogfood-snapshot-*.{md,html}
   - Capture metrics digest for audit trail (§Evidence Durability, CLAUDE.md §3.12)

---

## Related Docs

- [measurement-feasibility.md](./measurement-feasibility.md) — Gate & prerequisites (frozen at plan-codex)
- [measurement-label-protocol.md](./measurement-label-protocol.md) — Label semantics & C1 recovery rules
- [CLAUDE.md §1.4](../../CLAUDE.md#14-v02-자동-게이트-레이어receipt-chain-위) — v1.3.0-m2 briefing stamp (cost-tier policy)
- [CLAUDE.md §3.12](../../CLAUDE.md#312-증거-내구성-계약) — Evidence durability contract (git-tracked ship receipt)
