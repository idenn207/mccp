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
| **2-session-context** | `context_remaining_pct` recorded — **⚠ forward-only** (see Status below) | `session-end.js` (emits `null`) | `session-activity.js` | A2 (forward-only) |
| **3-handoff-item** | Unresolved work item enumerated (denominator) or resumed (numerator) — **⚠ forward-only** | `handoff-items.js` + `session-start.js` recovery | `session-activity.js` | A4 (forward-only) |
| **4-toggle-usage** | Non-default `MCCP_*` env setting observed | `session-start.js` env-snapshot capture | `toggle-usage.js` | B3 numerator/denominator |
| **5-concurrent-session** | 2+ sessions detected overlapping (pairwise) | `session-activity.js` (hook-trace shard correlation + session-ledger heartbeat) | `session-activity.js` | B2 denominator (observed) |
| **6-conflict-window** | Concurrent sessions touched same file during overlap — **⚠ forward-only** (no live producer) | hook-trace shard diff union + PR diff audit | `session-activity.js` | B2 (forward-only) |
| **7-codex-finding** | Codex-produced finding from any gate (plan/implement/pr) | `receipt` `findings[]` count (mccp-plan/implement/pr-codex) | `recoverability-probe.js` | C1 numerator/denominator |

### Current metric status (v1.22.7 measurement-honesty downgrade)

Codex R3 cross-model review found that A2/A4/B2 could report **confidently-wrong** values, so they are downgraded to `forward-only` (not claimed-computable). The event table above describes the *intended* instrumentation; the current honest status is:

| Metric | Status | Why |
|---|---|---|
| **A2** context% | `forward-only` | `session-end.js` now emits `context_remaining_pct: null` — the old latest-wins read had no session-id/freshness binding, so a stale/cross-session sample could be mis-attributed. The producer emits null until session-bound freshness exists. |
| **A4** restore rate | `forward-only` (numerator shipped in M5; the flip is **unconfirmed**) | The old defect was *contaminated compute*, not a missing producer: the handoff scanner intersected the current session's own sidecar → first-session self-credit → fake 100%. **M5 (v1.23.8) ships the boundary-scoped numerator** — `a4-boundary-restore.js` derives it from the state journal's `prev_session_id` boundaries, so self-credit is structurally impossible (a boundary requires `prev !== cur`), genesis boundaries are excluded from the denominator, and `'unknown'` sessions are excluded outright. M5 also fixed the 4th CL-5 recurrence so the *denominator* (handoff enumeration) is no longer cwd-relative. **This row stays `forward-only` on purpose**: per UI9 only a metric that actually flips to `computed` in production counts, and that requires `claude plugin update` + one fresh session, which this cycle did not perform. Flip the row only after `derive/cli.js run --json` reports `A4.status === "computed"` with a sane numerator/denominator on a real repo. |
| **B2** conflict rate | `forward-only` | Production emits only `session_start`/`session_end`; there is no live collision producer, so a "computed 0%" would be confidently wrong. The concurrent-pairs *denominator* is still observed. |
| **A1** completion rate | `forward-only` (removed from claimed-computable) | `completions_producer_present` flips only on a `task_completed` KIND event, which no production hook emits today (session-end emits `session_end` KIND + `task_completed:false` field), so A1 is always forward-only in real derive. re-R3 F0: removed from claimed-computable — the fixture proving the compute path is not evidence of production computability. The flag stays live-derivable, so A1 can rejoin claimed-computable once a real producer is wired. |
| **B3** toggle usage | `computed` once a snapshot corpus exists | Live env-snapshot producer. The producer wrote nothing until M4 fixed its `stateDir` (cwd-relative writer vs repoRoot-fixed reader), so the corpus starts accumulating from M4 forward and B3 reports `forward-only` until the first snapshot lands. Corpus presence counts **parsed** snapshots: files that fail to parse are diagnosed (`invalid_count`), never counted as history. (Known refinement backlog: numerator uses `TOGGLE_DEFAULTS` while the denominator scans all `MCCP_*` tokens — toggles absent from the defaults table can be under-counted.) |
| **A3** resident-instruction cost | `computed` | Reads the committed `a3-baseline.json` artifact; the tokenizer never runs inside derive. Promoted to claimed-computable in M4 alongside B3, so B3 is no longer the only entry. Goes `insufficient` when CLAUDE.md no longer hashes to the artifact, rather than serving a stale figure as current. |
| **C1/C2/C3** | `forward-only` | No live findings/attribution source wired. |

The real producers (collision detection, boundary-scoped restore, session-bound context, an independent completion producer) are deferred to a follow-up milestone. `metrics-assert --fixtures` proves the compute paths against the seeded fixture; it is **not** evidence that these metrics are computable in current production.

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
- User-level MEMORY.md: only read if `MCCP_A3_READ_USER_MEMORY=1` env opt-in (M4: corrected from the non-existent `MCCP_A3_INCLUDE_MEMORY`; the code constant at `a3-instruction-cost.js` `MEMORY_ENV_FLAG` is canonical, and following the old spelling meant the component was never captured). The accepted affirmative values are `1`/`true`/`yes`/`on` (case-insensitive); anything else — including `0` — leaves the component off, so the documented `=1` and the implementation agree rather than the code accepting any non-empty string.

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
