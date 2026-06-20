# v1.3.0 Read-Side Schema Surface (Baseline)

> v1.3.0 Milestone 0 — Schema Baseline Alignment.
> Canonical inventory of the schemas the v1.3.0 dashboard derive engine reads.
> Companion: [`state-md-naming-reconciliation.md`](./state-md-naming-reconciliation.md).

## 1. Scope

This document names the read-side schema surface the v1.3.0 derive engine (M1+) may rely on. It does NOT introduce new fields. Schema bumps to any surface listed here land in their own version-suffixed docs (e.g. `envelope-schema-v2.md`) plus a schema.js update plus a migration marker.

Out-of-scope: any state outside `<repo>/.claude/` (e.g. `~/.claude/plugins/cache`, `/ECC/` frozen fork tree, user-level memory `~/.claude/projects/<slug>/memory`). The derive engine MUST NOT read these. The `/ECC/` fork is reference-only — never read by v1.3 derive.

Three schemas live in `<repo>/.claude/`:

1. Receipt schema (v1) — [`plugins/mccp/scripts/receipt/schema.js`](../../plugins/mccp/scripts/receipt/schema.js)
2. Envelope schema (v1) — [`plugins/mccp/scripts/lib/dispatch-envelope.js`](../../plugins/mccp/scripts/lib/dispatch-envelope.js) (+ [`docs/v1.2.0-orchestrator/envelope-schema.md`](../v1.2.0-orchestrator/envelope-schema.md))
3. STATE.md frontmatter (state_version=1) — [`plugins/mccp/scripts/state/state-writer.js`](../../plugins/mccp/scripts/state/state-writer.js)

A fourth surface — the PRD ↔ code identifier reconciliation — is documented in §5 below and supplemented by the companion `state-md-naming-reconciliation.md`.

## 2. Receipt schema (v1)

Every `meta.*` field `schema.js` explicitly validates, grouped by introducing version. Strictness column:

- **strict** — field is in `makeSkeleton()`, always present, type-checked unconditionally.
- **present-only** — field is optional in receipts (`undefined` is allowed); type-checked only when present. Backward-compat receipts written before the field's introducing version pass validation unchanged.
- **marker-gated** — field participates in an all-or-nothing invariant tied to another field (see v1.2.0-m1 controller attribution below).

### 2.1 Top-level fields (v0.1 baseline, all strict)

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string constant `"v1"` | Bump triggers schema-vX.md + migration. |
| `gate_id` | enum | Allowed: `plan-impeccable`, `mccp-plan-codex`, `implement-impeccable`, `mccp-implement-codex`, `pr-impeccable`, `mccp-pr-codex`, `security-reviewer`, `code-reviewer`. |
| `phase` | enum | One of `plan` / `implement` / `pr` / `review`. |
| `decision_id` | kebab-slug | Matches `^[a-z0-9][a-z0-9-]*$`. |
| `task_id` | string \| `null` | Optional refinement when one decision spans multiple tasks. |
| `plan_hash` | `sha256:<64hex>` | Content hash of the plan body at receipt-write time. |
| `design_doc_hash` | `Array<{path, sha256}>` | Possibly empty. Pinned for cross-doc traceability. |
| `base_sha` / `head_sha` | git SHA (7-40 hex) | Snapshot anchor at gate-pass time. |
| `round` | integer `[1, 10]` | YAGNI cap; R2/R3 emerge only when severity-gated escalation fires. |
| `findings` | object[] | Each carries `severity` ∈ {CRITICAL/HIGH/MEDIUM/LOW}, `area`, `description`. |
| `resolution` | object | `{converged: bool, rounds: int, accepted, rejected, open_questions}`. |
| `subject_hash` | `sha256:<64hex>` | Subject (focus + relevant inputs) hash. |
| `receipt_hash` | `sha256:<64hex>` | Self-content hash for tamper detection. |
| `meta` | object | See §2.2 + §2.3. |

### 2.2 `meta.*` strict fields (always required by `makeSkeleton()`)

| Field | Type | Introduced | Notes |
|---|---|---|---|
| `created_at` | ISO 8601 | v0.1 | Receipt-write timestamp. |
| `command` | string | v0.1 | Originating command (`/mccp:plan` etc). |
| `cwd` | string | v0.1 | Repo root at write time. |
| `git_branch` | string \| `null` | v0.1 | Branch at write time. |
| `skipped` | boolean | v0.1 | Gate fully bypassed (audit). |
| `skip_reason` | string \| `null` | v0.1 | Skip rationale. |
| `codex_skipped` | boolean | v0.1 | Codex review skipped at this gate. |
| `advisory` | boolean | v0.2.4 | Non-approving receipt (CODEX_ALLOW_UNAVAILABLE advisory mode). |
| `security_skipped` / `security_skip_reason` | boolean / string\|null | v0.2.4 | Security-reviewer auto-fallback. |
| `security_force_override` / `security_force_override_reason` | boolean / string\|null | v0.2.4 | Audited escape via `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`. |
| `impeccable_skipped` / `impeccable_skip_reason` | boolean / string\|null | v0.2.6 | Impeccable design gate fall-through. |
| `impeccable_force_override` / `impeccable_force_override_reason` | boolean / string\|null | v0.2.6 | Audited escape via `MCCP_FORCE_PR_WITHOUT_IMPECCABLE`. Reason validator strict (≥30 chars, ≥3 words, no banlist token). |

**Same-namespace invariant** (v0.2.4 + v0.2.6): `*_skipped=true` and `*_force_override=true` are mutually exclusive within the security and impeccable namespaces (4-axis state matrix). Cross-namespace combos (e.g. `security_skipped + impeccable_force_override`) are allowed.

### 2.3 `meta.*` present-only fields (additive, backward-compatible)

| Field | Type | Introduced | Notes |
|---|---|---|---|
| `codex_dedupe_at_pr` | boolean | v0.2.8 | PR step skipped Codex because plan + implement gates already converged. |
| `codex_skipped_at_pr` | boolean | v0.2.8 | PR step skipped Codex via `MCCP_PR_SKIP_CODEX_REVIEW` audited escape. Reason validator strict. |
| `codex_skip_reason` | string \| `null` | v0.2.8 | Holds the canonical `"codex_disabled"` literal when `codex_disabled_at_pr=true`, or substantive operator reason when `codex_skipped_at_pr=true`. |
| `codex_review_actionable_findings` | boolean | v0.2.8 | Codex review produced ≥1 finding (advisory, not blocking). |
| `deferred_findings_count` | non-negative integer | v0.2.9 | YAGNI triage DEFER_TO_BACKLOG count. Audit-only. |
| `codex_disabled` | boolean | v0.3.5 | `MCCP_CODEX_DISABLED=1` honored at this gate (wrapper-level first-class skip). |
| `codex_disabled_at_pr` | boolean | v0.3.5 | PR step variant of the env-policy skip. Reason MUST be canonical literal `"codex_disabled"`. |
| `codex_design_scope_excluded` | boolean | v0.3.6 | Design-scope preamble was prepended to Codex focus (impeccable available → Codex stays in security/correctness/perf scope). |
| `design_findings_dropped` | non-negative integer | v0.3.6 | Count of Codex findings the output filter dropped via DESIGN_KEYWORDS match. |
| `a11y_routed_to_impeccable` | boolean | v0.3.6 | ≥1 a11y finding routed to impeccable a11y-architect. |
| `dropped_findings_digest` | `sha256:<64hex>` \| `null` | v0.3.6 | Audit digest of joined dropped finding texts. |
| `plan_conflict_escalated` | boolean | v0.4.0 axis H | Implementation phase signaled a plan ↔ code gap (advisory; the binding surface is `STATE.md.chain_aborted`). |
| `pr_phase_lock_stale_reclaimed_at_hook` | boolean | v1.0.1 axis K | pr-phase-guard hook reclaimed an orphan pr-phase.lock on a prior invocation (audit trail for silent recovery). |
| `briefing_summary` | string \| `null` | v1.3.0-m2 | 1-line PM verdict ≤1024 chars. `null` when cost-guard skipped or LLM classification != `ok`. Empty string is explicitly rejected. |
| `briefing_token_count` | non-negative integer \| `null` | v1.3.0-m2 | Tokens consumed by the briefing call. Real value when codex-companion emits `tokenUsage`; otherwise `(focus.length + stdout.length)/4` estimate. |
| `briefing_token_estimated` | boolean | v1.3.0-m2 | When `true`, `briefing_token_count` was derived from the (input+output) char-length estimate. Codex R1 F2 absorption — distinguishes estimate-from-stdout from real-from-tokenUsage. |
| `briefing_invocation_count` | non-negative integer \| `null` | v1.3.0-m2 | Count of LLM call attempts per receipt (0 when cost-guard skipped, 1 when invoked — successful or failed). v1.3 has no retry, so the value is always 0 or 1. |

**3-way codex skip mutex** (v0.3.5): `codex_dedupe_at_pr`, `codex_skipped_at_pr`, `codex_disabled_at_pr` are mutually exclusive. Exactly one PR-step codex-skip path may be active per receipt.

### 2.4 `meta.*` marker-gated all-or-nothing fields (v1.2.0-m1)

Controller-worker attribution axis. Four fields move together under a single marker:

| Field | Type | Notes |
|---|---|---|
| `controller_context_marker_present` | boolean | Marker. Receipt was written under a dispatch-controller worker context. |
| `dispatched_by_controller_session_id` | UUID v4 | Controller session that spawned this worker. |
| `worker_dispatch_id` | UUID v4 | Worker's dispatch ID (filename anchor for envelope). |
| `ipc_envelope_path` | `^\.claude/state/dispatches/<uuid>\.envelope\.json$` | Canonical repo-relative dispatch location. |

**Invariant**: `marker_present=true` ⇒ all 3 attribution fields MUST be present + format-valid. `marker_present=false` ⇒ all 3 MUST be absent/null. Partial state (some set, some not) rejects regardless of marker. Existing v0.2.x receipts have marker=`undefined` + fields=`undefined` (counts as "marker false + 0 fields"; backward-compat read tolerance).

### 2.5 Briefing fields and `receipt_hash` (v1.3.0-m2)

`meta.briefing_summary` / `meta.briefing_token_count` / `meta.briefing_token_estimated` / `meta.briefing_invocation_count` are stamped AFTER the canonical receipt has been written to disk and are intentionally EXCLUDED from `receipt_hash` + `subject_hash`. The hash chain captures gate-pass state; briefing is metadata-on-top.

`receipt/hash.js#receiptHash` strips these 4 keys from the canonicalization input alongside `receipt_hash` itself (deep-clone via `JSON.parse(JSON.stringify(...))` so the caller's receipt object is not mutated). Backward-compat invariant: v0.2.x-era receipts lack these keys, so the strip is a no-op and `receiptHash` returns the bit-identical pre-v1.3.0-m2 value.

Tamper-detection consumers MUST recompute the hash via `receiptHash(receipt)` (which honors the carve-out) — never canonicalize the receipt independently and compare. v1.3.0-m2 added a dedicated regression test ([`receipt/tests/hash-briefing-exclusion.test.js`](../../plugins/mccp/scripts/receipt/tests/hash-briefing-exclusion.test.js)) covering all 5 invariants (stamp invariance, value-divergence invariance, backward-compat bit-identity, control non-briefing mutation surfaces, caller object non-mutation).

## 3. Envelope schema (v1)

Authoritative document: [`docs/v1.2.0-orchestrator/envelope-schema.md`](../v1.2.0-orchestrator/envelope-schema.md). Field table reproduced abbreviated:

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | constant `"v1"` | yes | Bump → new file `envelope-schema-v2.md` + migration. |
| `dispatch_id` | UUID | yes | Filename anchor + receipt `meta.worker_dispatch_id`. |
| `worker_subagent_type` | string | yes | e.g. `"mccp:code-reviewer"`. |
| `worker_started_at` / `worker_ended_at` | ISO 8601 (`ended_at` null while pending) | yes / conditional | `ended_at=null` iff `worker_exit_status="pending"`. |
| `worker_exit_status` | enum | yes | One of `pending` / `ok` / `failure` / `timeout` / `crashed`. Monotonic from `pending` to any terminal. |
| `receipts_added` | string[] | yes | Slugs of receipts the worker wrote. Controller uses to re-anchor chain. |
| `findings` | object[] | yes | Free-form per agent contract. |
| `next_action` | string \| `null` | no | Optional handoff hint. |
| `controller_session_id` | UUID | yes | Set by `prepareDispatch`, echoed back by worker. Used by `reclaimStale` to detect orphans. |
| `parent_cwd` | string | yes | Repo root the controller ran in. Used by worktree-sync to confirm cross-device fallback. |

**Strict boundary**: `additionalProperties: false`. Both the hand `validate()` and the exported `JSON_SCHEMA` reject unknown top-level keys. Any v1.3 derive code reading envelopes MUST treat unknown keys as a wire-format violation, not a forward-compat affordance.

**v1.3 derive MUST NOT write to envelopes.** Envelopes are worker-owned; only dispatch-controller workers produce them and only `reclaimStale` may overwrite (for orphan cleanup).

## 4. STATE.md frontmatter (state_version=1)

Source of truth: `state-writer.js` `emptyState()` (lines 116-170) + the `VALID_EVENTS` allowlist (lines 27-58).

### 4.1 Frontmatter fields

| Field | Type | Default | Conditional render | Introduced |
|---|---|---|---|---|
| `state_version` | constant `1` | `1` | always | v0.2 |
| `task_fingerprint` | string | `'unknown'` | always | v0.2 |
| `created_at` / `updated_at` | ISO 8601 \| null | null | always | v0.2 |
| `last_event` | one of VALID_EVENTS | `'precompact'` | always | v0.2 |
| `last_event_at` | ISO 8601 \| null | null | always | v0.2 |
| `unsafe_checkpoint` / `confirm_required` | boolean | false | always | v0.2 |
| `next_chunk` | string \| null | null | always | v0.2 |
| `session_end_imminent` / `chain_aborted` | boolean | false | always | v0.2.2 |
| `chain_progress` | string \| null | null | **only when set** | v0.2.2 |
| `last_pr_url` | string \| null | null | **only when set** | v0.2.2 |
| `dep_check_at` | ISO 8601 \| null | null | **only when set** | v0.2.3 |
| `dep_check_missing` | object \| null | null | always | v0.2.3 |
| `escalate_pending` / `escalate_pending_decision_id` | boolean / string\|null | false / null | **only when set** | v0.3.2 |
| `dispatch_id` / `dispatch_id_completed` | UUID \| null | null | **only when set** | v1.1.0 |
| `dispatch_attempt_count` | non-negative integer | 0 | always | v1.1.0 |
| `controller_session_id` | UUID \| null | null | **only when set** | v1.2.0-m1 |
| `active_dispatch_count` | non-negative integer | 0 | always | v1.2.0-m1 |

### 4.2 VALID_EVENTS allowlist (12 events)

Unknown events trigger the unknown-event downgrade branch (rewrites `last_event → precompact`). v1.3 derive engine MUST treat this list as the authoritative event vocabulary:

| Event | Introduced | Emitter |
|---|---|---|
| `stop_loop_pass` | v0.2 | Stop-loop |
| `receipt_write` | v0.2 | receipt-write helper |
| `pr_created` | v0.2 | `/mccp:pr` PR creation |
| `fix_task_applied` | v0.2 | Stop-loop fix-task absorption |
| `precompact` | v0.2 | PreCompact hook |
| `handoff_spawn` | v0.3.0 | session-spawner (when handoff actually fires) |
| `plan_conflict_escalated` | v0.4.0 | `/mccp:prp-implement` Phase 3 plan-conflict-detector |
| `resume_dispatching` | v1.1.0 | `/mccp:resume` phase 1 (dispatch in-flight) |
| `resume_dispatched` | v1.1.0 | `/mccp:resume` phase 2 success |
| `dispatch_started` | v1.2.0-m1 | dispatch-controller `prepareDispatch` |
| `dispatch_envelope_received` | v1.2.0-m1 | hybrid watcher (Task 4) on envelope receipt |
| `dispatch_chain_aborted` | v1.2.0-m1 | reclaimStale + controller crash recovery |

### 4.3 Body sections

Frontmatter is the structured surface. The body has 8 sections (`Goal`, `Plan`, `Done`, `In Progress`, `Next Step`, `Last Decision`, `Open Questions`, `Last Updated`). v1.3 derive engine reads frontmatter; body extraction is free-form NLP territory and out-of-scope for M0-M2.

## 5. PRD assumption ↔ code reality reconciliation

The v1.3.0 PRD ([`.claude/prds/v1-3-0-observability-surface-ii.prd.md`](../../.claude/prds/v1-3-0-observability-surface-ii.prd.md)) uses identifiers and assumptions that don't all match the actual schemas above. v1.3.0-m0 Task 8 amends the PRD body in place; this table is the canonical mapping for any consumer still reading older PRD revisions:

| PRD term / assumption | Actual identifier in code | Notes |
|---|---|---|
| "unknown-field-permissive validator" (receipt) | explicit allowlist + silently-ignored unknown `meta` keys | Backward-compat read tolerance only — NOT a forward-compat writer contract. New `meta.*` fields MUST land in `schema.js` BEFORE any write path stamps them. |
| `handoff_dispatching` / `handoff_dispatched` (STATE.md) | `dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count` (resume layer, v1.1.0) + `controller_session_id` / `active_dispatch_count` (controller layer, v1.2.0-m1) + VALID_EVENTS markers `resume_dispatching` / `resume_dispatched` | Two layers, two protocols. See [`state-md-naming-reconciliation.md`](./state-md-naming-reconciliation.md) for tri-state interpretation. |
| "envelope schema v1 (permissive)" | strict `additionalProperties: false` (both hand `validate()` and exported `JSON_SCHEMA`) | v1.3.0-m0 Task 4 closes the gap: hand validator now mirrors the exported strictness. |
| `meta.briefing_summary` (PRD adds in M2) | not in `schema.js` today; validates via "silently ignored" path | **M2 prerequisite**: explicit `meta.briefing_summary` + `meta.briefing_token_count` + `meta.briefing_invocation_count` MUST be added to `schema.js` BEFORE any write path stamps them. See §6 forward-compat policy. |

## 6. Forward-compat policy

The two extension paths differ:

| Surface | Backward-compat (old reads) | Forward-compat (new writes) | Bump trigger |
|---|---|---|---|
| Receipt schema | Old receipts pass validation after schema bumps add new optional fields (hand validator's "iterate known list" pattern). | New `meta.*` fields require `schema.js` update before any write path. Stamping without prior schema update is a writer contract violation. | Additive optional field: bump skeleton + validator; no version bump if backward-compatible. Removing or changing semantics of an existing field: bump `schema_version` + migration. |
| Envelope schema | Strict — old envelopes validate ONLY if every field still matches v1 contract. No silent-ignore. | New fields require a new `envelope-schema-v2.md` + `JSON_SCHEMA` update + `KNOWN_KEYS` update + migration. Both validators move together. | Any field addition/removal. |
| STATE.md frontmatter | Bump `STATE_VERSION` resets state to `emptyState()` with stderr warning. No partial migration. | New fields land in `emptyState()` + conditional render policy. New events join VALID_EVENTS. | Schema-breaking change: bump `STATE_VERSION` (rare). |

### 6.1 M2 prerequisite (binding)

M2 plan ("derive engine + briefing stamp") MUST include as its **Task 1**:

> Add `meta.briefing_summary` (string \| null), `meta.briefing_token_count` (non-negative integer \| null), `meta.briefing_invocation_count` (non-negative integer \| null) to `plugins/mccp/scripts/receipt/schema.js` (`validate()` + `makeSkeleton()`), with present-only strictness.

Without that prerequisite, the M2 write path that stamps `meta.briefing_summary` would silently rely on the v0.2.x-era "ignore unknown meta keys" path — exactly the writer contract this baseline rejects (Task 3 absorption note in the M0 plan).

**STATUS: implemented in v1.3.0-m2** — schema bump (Task 1) + hash carve-out (Task 1b, Codex R1 F1) shipped as part of `plugins/mccp/scripts/lib/briefing/` (cost-guard + invoke + index facade). Schema accepted 4 fields (the M0 prerequisite list above + the Codex R1 F2 absorption `meta.briefing_token_estimated:boolean`). See §2.3 + §2.5 for the live spec.

### 6.2 Out-of-scope (will NOT be in v1.3 derive)

- `~/.claude/plugins/cache/` — installed plugin payloads, not project state.
- `/ECC/` — frozen reference fork. Read-only audit material.
- User-level memory (`~/.claude/projects/<slug>/memory/`) — owned by the harness's auto-memory subsystem, not v1.3 derive.

What is NOT in this milestone (v1.3.0-m0): the derive engine itself, the dashboard UI, the cache layer, any new schema field. M0 freezes what M1+ may safely read; M1 builds the derive engine on top of this baseline.

## §7 — Dashboard rendering surface (v1.3.0-m3)

**STATUS: implemented in v1.3.0-m3.** STATUS.md/status.html surface freeze: see [dashboard-surface.md](./dashboard-surface.md) for the canonical 6-section structure + verdict priority chain + status triple + graceful-hide rules + fail-open invariant + HTML injection boundary. M3 is read-only consumer of M0 schema + M1 derive model + M2 briefing fields; no schema additions.

## §8 — Daily snapshot + 30-day audit window (v1.3.0-m5)

**STATUS: implemented in v1.3.0-m5.** Snapshot schema freeze + retention contract + audit-timeline 30-day read path: see [snapshot-schema.md](./snapshot-schema.md) for the canonical `snapshot-v1` JSON shape, filename-anchored retention with Codex R1 F3 skew guards, write-eligibility vs retention split (F4 absorption), always-mask invariant, and `gate_id | decision_id | receipt_hash` de-dup identity (F2 absorption). M5 adds a single optional `meta`-side surface to the receipt projection (`receipts[*].receipt_hash` via `derive/sources/receipts.js`); no envelope or STATE.md schema changes. The snapshot writer piggybacks on M4's `triggerRender` — never standalone.

## §9 — Generic interface contract (v1.3.0-m6)

**STATUS: implemented in v1.3.0-m6.** Reference impl보장 — mccp가 외부 repo에 installed될 때 derive + snapshot + renderer 모두 graceful한지를 4 fixture로 검증하고 contract을 본문화. 외부 repo의 optional sources (§1) + mccp-extension fields null projection (§2) + non-mccp gate names (§3) + NOT generic contract (§4 — path shape / STATE schema ownership / degraded-surface-is-graceful) 가 단일 문서로 묶임. 새 schema field 추가나 surface 변경 없음. 자세한 spec: [generic-interface.md](./generic-interface.md). Audit evidence matrix: [`.claude/plans/notes/v1-3-0-m6-audit.md`](../../.claude/plans/notes/v1-3-0-m6-audit.md).

## §10 — Self session identity surface (v1.4.0-m3)

**STATUS: implemented in v1.4.0-m3.** `derive/sources/state.js#scanState` adds 2 contracted, additive-only fields to `item.*` (mirror of [`active-sessions.js`](../../plugins/mccp/scripts/lib/renderer/sections/active-sessions.js) consumer). Codex Implement R1 F3 absorption — both fields are **always emitted** (never `undefined`); the renderer treats `self_session_id === null` as graceful-degrade (no marker).

| Field | Type | Resolution | Notes |
|---|---|---|---|
| `self_session_id` | string \| `null` | env → cwd → null | sanitized via `observer-sessions.resolveSessionId`. |
| `self_resolution` | enum 4값 | always set | `resolved` / `resolved-by-cwd` / `env-missing` / `unresolved`. |

Resolution chain (deterministic, in order):

1. `process.env.CLAUDE_SESSION_ID` sanitize success → `resolved`
2. ledger with `path.resolve(cwd) === path.resolve(process.cwd())` → `resolved-by-cwd`
3. env present but sanitize failed (after cwd fallback) → `unresolved`
4. env unset (after cwd fallback) → `env-missing`

The `self_resolution` enum lets consumers (and dogfood verification) tell apart "self identity unknown for known reason" vs "stale/old surface" — silent null fallback is forbidden by contract.

No envelope, STATE.md, or receipt schema additions in v1.4.0-m3. Append-only friction telemetry sidecar (`<repo>/.claude/state/m3-friction-events.jsonl`) is a producer-side measurement artifact, not part of the read-side derive surface — see [m3-friction-metric.md](../v1.4.0-multi-session/m3-friction-metric.md).
