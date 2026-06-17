# STATE.md Naming Reconciliation (PRD → code)

> v1.3.0 Milestone 0 — single-purpose explainer.
> Anchor doc for [`schema-surface.md`](./schema-surface.md) §5.
> Drives M3 dashboard rendering and any derive consumer reading STATE.md.

## 1. The mismatch

The v1.3.0 PRD ([`.claude/prds/v1-3-0-observability-surface-ii.prd.md`](../../.claude/prds/v1-3-0-observability-surface-ii.prd.md)) opens with:

> STATE.md `handoff_dispatching` ↔ `handoff_dispatched` 2-phase atomic marker의 tri-state(미설정/dispatching/dispatched) 해석 표시 톤

The actual STATE.md frontmatter schema — [`plugins/mccp/scripts/state/state-writer.js`](../../plugins/mccp/scripts/state/state-writer.js) `emptyState()` — has **no fields named `handoff_dispatching` or `handoff_dispatched`**. Two-phase atomic dispatch tracking exists, but under different identifiers and across two layers (resume v1.1.0 + controller v1.2.0-m1).

The PRD body has been amended in place by M0 Task 8 to use the correct identifiers; this doc preserves the mapping for any consumer still reading older PRD revisions, future PRDs that re-use the wrong naming, or M3 dashboard implementers cross-referencing the original draft.

## 2. Mapping table

The PRD's single 2-phase marker concept maps to **five frontmatter fields** plus **two VALID_EVENTS markers**, split across two layers:

| PRD term | Actual STATE.md frontmatter field | Introduced | Layer | Semantic |
|---|---|---|---|---|
| `handoff_dispatching` (phase 1 marker) | `dispatch_id` | v1.1.0 Stage 1 Task 1.5 | resume | UUID set by `/mccp:resume` phase 1 just before the dispatched command runs. Conditional render (only emit when set). |
| `handoff_dispatched` (phase 2 marker) | `dispatch_id_completed` | v1.1.0 Stage 1 Task 1.5 | resume | UUID set by `/mccp:resume` phase 2 only when the dispatched command produced a success receipt. Conditional render. |
| (implicit retry counter) | `dispatch_attempt_count` | v1.1.0 Stage 1 Task 1.5 | resume | Integer, incremented per phase 1 entry. Phase 1 short-circuits to in-flight at count < 3, `resume_giveup` at count ≥ 3 (manual recovery required). |
| (not present in PRD) | `controller_session_id` | v1.2.0-m1 Task 8 | controller | UUID set by `prepareDispatch`, cleared on chain abort or successful merge of all envelopes. Conditional render. |
| (not present in PRD) | `active_dispatch_count` | v1.2.0-m1 Task 8 | controller | Integer count of in-flight dispatches under this controller. Watcher decrements as envelopes arrive; `reclaimStale` forces to 0 on chain abort. |

Plus two **VALID_EVENTS** markers (assigned to `last_event`, not frontmatter fields):

| PRD term | Actual VALID_EVENTS marker | Introduced | Emitter |
|---|---|---|---|
| (phase 1 event tag) | `resume_dispatching` | v1.1.0 Stage 1 Task 1.5 | `/mccp:resume` phase 1 |
| (phase 2 event tag) | `resume_dispatched` | v1.1.0 Stage 1 Task 1.5 | `/mccp:resume` phase 2 (clears `handoff_spawn` via `clearHandoff=true` when used) |

**Two layers, two protocols**: the resume layer (v1.1.0) tracks `/mccp:resume` 2-phase dispatch for honest handoff after a session end. The controller layer (v1.2.0-m1) tracks dispatch-controller orchestration for multi-worker fanout. A single STATE.md may carry both simultaneously (e.g. a session resumed via `/mccp:resume` that then spawns dispatch-controller workers).

## 3. Tri-state interpretation policy

The PRD assumed three discrete states (`미설정` / `dispatching` / `dispatched`). The actual two-layer reality has more cells in the state grid. v1.3.0 M3 dashboard MUST render this tuple consistently. **Read both layers; render the most actionable signal first.**

| Tuple state | controller_session_id | active_dispatch_count | dispatch_id | dispatch_id_completed | dispatch_attempt_count | Derive interpretation |
|---|---|---|---|---|---|---|
| All unset | null | 0 | null | null | 0 | Quiet — no controller, no resume in flight. M3: render nothing in the dispatch surface. |
| Controller in flight | UUID | > 0 | null | null | 0 | dispatch-controller has spawned ≥1 worker; envelopes pending. M3: render controller layer; list active dispatches. |
| Resume phase 1 pending (in-flight) | null | 0 | UUID (set) | null | ≥ 1 | `/mccp:resume` phase 1 wrote `resume_dispatching`; the dispatched command has not produced a success receipt yet. May be retried (counter < 3) or stuck mid-dispatch. M3: render resume layer; "phase 2 pending" badge. |
| Resume cycle completed | null | 0 | (any) | UUID (set) | ≥ 1 | Phase 2 success — the dispatched command landed a receipt. `dispatch_id_completed` is the sentinel. M3: render "resume completed" with completion UUID. |
| Resume giveup | null | 0 | UUID (set) | null | ≥ 3 | Phase 1 has retried 3 times without a phase-2 success path. Manual recovery required (check `fix-task.md`, then re-enter the original command). M3: render alert state. |

### 3.1 Cross-layer composition

A STATE.md MAY exhibit both layers simultaneously (e.g. resume layer mid-cycle while controller layer spawns dispatches). Renderer MUST treat the layers as independent surfaces; do not collapse `dispatch_id` and `controller_session_id` into a single field. The controller layer changes more frequently (sub-second envelope updates) than the resume layer (per-command-cycle).

### 3.2 Conditional render policy (v1.3 derive responsibility)

`dispatch_id` / `dispatch_id_completed` / `controller_session_id` are conditional-emit in `state-writer.js` (only rendered when set). v1.3 derive engine MUST handle the absence-as-null contract: a field missing from STATE.md frontmatter equals `null`, not undefined-behavior. `dispatch_attempt_count` and `active_dispatch_count` are integer-typed and always emit; default 0.

## 4. Where the PRD body was amended

v1.3.0-m0 Task 8 amended the PRD in three places to use the correct identifiers:

1. **Open Questions section** — replaced the `handoff_dispatching` / `handoff_dispatched` reference with the correct two-layer identifier set + reference to this doc.
2. **Risks section** — replaced the "STATE.md handoff signal 오해석" risk row to mention both layers (resume `dispatch_id` + `dispatch_id_completed` and controller `controller_session_id` + `active_dispatch_count`).
3. **Errata section** (appended at end) — records the body amendment date + links to this doc as the authoritative mapping.

Future PRDs MUST use the correct identifiers from §2 and §3; this doc serves as a sanity check, not a long-term shim.
