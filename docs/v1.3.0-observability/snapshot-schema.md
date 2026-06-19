# Snapshot schema (`snapshot-v1`)

> v1.3.0 Milestone 5 — single-purpose explainer.
> Anchor doc for [`schema-surface.md`](./schema-surface.md) §6 (snapshots subsection).
> Drives the audit-timeline 30-day window read path in `lib/renderer/sections/audit-timeline.js`.

## 1. Purpose

M5 closes the *temporal* gap left by M4. M4 keeps the live `STATUS.md` aligned with the current state of `.claude/`. M5 adds the *yesterday-and-before* dimension: a daily-frozen JSON snapshot under `.claude/cache/snapshots/YYYY-MM-DD.json` with 30-day retention, and an audit-timeline that can stretch back to 30 days by reading from those snapshots when raw receipts have rotated or been quarantined.

The snapshot writer is **piggyback-only**: it never runs standalone. It writes when M4's `triggerRender` runs and succeeds. A repo with zero activity for 3 days produces zero snapshots for those days — by design.

## 2. File layout

| Path | Notes |
|---|---|
| `<repoRoot>/.claude/cache/snapshots/` | Directory. Created on first eligible write. gitignored via `.claude/cache/` parent ignore (M3 baseline). |
| `<repoRoot>/.claude/cache/snapshots/YYYY-MM-DD.json` | One file per UTC day on which `triggerRender` fired with non-empty receipts or envelopes. Filename is the source of truth for retention; mtime is NOT consulted. |
| `<repoRoot>/.claude/cache/snapshots/<name>.<pid>-<random>.tmp` | Atomic write tmp. Renamed to final filename on success; unlinked on error. |

## 3. JSON schema (`snapshot-v1`)

```json
{
  "schema_version": "snapshot-v1",
  "snapshot_date": "YYYY-MM-DD",
  "derived_at": "<ISO timestamp from model.derived_at>",
  "model_version": "<model.schema_version — currently 'v1' for M1–M5>",
  "counts": {
    "plans": <integer>,
    "receipts": <integer>,
    "state": 0 | 1,
    "backlog": <integer>,
    "fix_task": 0 | 1,
    "pr": 0 | 1,
    "envelopes": <integer>,
    "correlations": <integer>,
    "warnings": <integer>
  },
  "receipts": [
    {
      "gate_id": "<string>",
      "decision_id": "<string>",
      "created_at": "<ISO>",
      "converged": <bool>,
      "receipt_hash": "<sha256:…> | null",
      "briefing_summary": "<string> | null",
      "briefing_token_count": <integer> | null,
      "briefing_invocation_count": <integer> | null,
      "codex_skipped_at_pr": <bool>,
      "codex_skip_reason": "<string> | null",
      "codex_dedupe_at_pr": <bool>,
      "ipc_envelope_path": "<string> | null",
      "dispatched_by_controller_session_id": "<string> | null",
      "worker_dispatch_id": "<string> | null"
    }
  ],
  "envelopes": [
    {
      "dispatch_id": "<string> | null",
      "status": "<pending | ok | failure | timeout | crashed> | null",
      "started_at": "<ISO> | null",
      "ended_at": "<ISO> | null",
      "parent_session_id": "<string> | null",
      "error": "<string> | null"
    }
  ],
  "m0_capability": {
    "contract_present": <bool> | null
  }
}
```

### 3.1 Field provenance

The `receipts[]` projection is sourced directly from `derive/sources/receipts.js extract()`. M5 added the `receipt_hash` field there explicitly so the snapshot's de-dup identity can stay aligned with the canonical receipt content digest. The 9 `meta.*` carve-out fields (briefing, codex_skip, codex_dedupe, ipc/controller attribution) mirror the M2/M3 audit-timeline consumption shape — a snapshot row carries every field the live row carries, so the timeline section can consume snapshot rows without re-projection.

`envelopes[]` is **frozen at snapshot time**. A nonterminal envelope row in a 14-day-old snapshot does NOT mean the envelope is still in flight; it means the envelope was in that state at day-N. The renderer's `worker-fanout` section always uses the live envelope source, never snapshot envelopes, so the live UI is never misled.

## 4. Retention contract (30 days, filename-anchored)

- Window: `today (UTC)` minus `30` calendar days.
- Filename parse: regex `^\d{4}-\d{2}-\d{2}\.json$` + `Date.UTC(y, m-1, d)`.
- mtime is **NOT** consulted. Archival branches that resurrect old snapshots would race against mtime-based eviction; filename-as-source-of-truth is deterministic.
- Eviction is best-effort: any single `unlinkSync` failure is logged via stderr `[mccp:snapshot] evict YYYY-MM-DD failed: <msg> (allow)` and the function continues. The new snapshot write succeeds regardless.

### 4.1 Skew guards (Codex Implement-Codex R1 F3 absorption)

Two clock-skew guards run before eviction:

| Guard | Trigger | Action | Stderr message |
|---|---|---|---|
| (a) future-dated file | Filename date > today + 1 day tolerance | NEVER unlink | `[mccp:snapshot] future-dated YYYY-MM-DD detected — eviction skipped (allow)` |
| (b) cutoff > last-render anchor | `today - 30d` > `.claude/cache/.last-render.json`'s `render_at` (parsed via `Date.parse`) | Abort entire eviction sweep; new snapshot write still proceeds | `[mccp:snapshot] cutoff > last-render.render_at — eviction aborted (clock-skew suspect)` |

The field on `.last-render.json` is `render_at` (M4 contract), NOT `derived_at`. Aligning to the actual M4 field avoids contract proliferation; missing or unparseable `render_at` is treated as "no anchor available" → skew guard (b) is a no-op.

## 5. Write eligibility vs retention (Codex Implement-Codex R1 F4 absorption)

The writer separates two responsibilities:

1. **Retention sweep** runs whenever the snapshots directory exists. Empty-state repos still get their old snapshots cleaned up.
2. **Write eligibility**: if both `sources.receipts.count === 0` AND `sources.envelopes.count === 0`, the writer short-circuits and does NOT create today's snapshot. (No archive without content.)

Without this split, an active repo whose receipts get rotated/quarantined would accumulate stale snapshots past the 30-day window because the empty-path short-circuit would skip both eviction and write.

## 6. Always-mask invariant

The snapshot writer applies `applySecretMask` + `applyPathMask` (from `derive/mask.js`) before serialization, regardless of `model.masked`. A model produced by `derive(repoRoot, { raw: true })` is NOT path-masked at derive time, but its snapshot **IS** path-masked. Snapshots live longer than the session that wrote them and must be share-safe even when the live render was raw.

Masking is idempotent (re-masking an already-masked model is a no-op), so this guard adds zero cost for the default-masked path.

## 7. Audit-timeline read path (M5 Task 3)

`sections/audit-timeline.js renderAuditTimeline(model, formatUtils, now, opts)` reads from `opts.snapshotsDir` when **all** of the following hold:

1. `opts.snapshotsDir` is a non-empty string (renderer/index.js resolves this from `model.repo_root` automatically when in raw mode; tests can pass `null` to suppress).
2. The live receipt count in the 7→30 day band is `< 5` rows.

When triggered, the renderer:

1. Reads every `YYYY-MM-DD.json` file in the directory.
2. Parses each file silently (corrupt JSON in one file does NOT break the section; the file is skipped).
3. Filters snapshot receipts to those whose `created_at` falls in the 30-day window but outside the live 7-day window.
4. De-dups by `rowKey = gate_id | decision_id | receipt_hash`, with `gate_id | decision_id | @created_at` fallback when `receipt_hash` is null (v0.2.x-era receipts).
5. Live wins on collision; the snapshot row is dropped.
6. Live rows render up to `MAX_ROWS_LIVE = 20`; archived rows fill the remaining slots up to `MAX_ROWS_ARCHIVED = 10`; absolute cap `MAX_ROWS = 30`.
7. Archived rows get `class="audit-row from-snapshot muted"` (no icon collision with M4's stale ⏱ marker; the existing `muted` token desaturates them one step below live rows).
8. A single section-level footnote `⌛ 보관 스냅샷에서 복원 · N건` surfaces once when ≥1 archived row was rendered. NOT per-row.

### 7.1 Missing-day marker (Codex Implement-Codex R1 F1 absorption)

When snapshot mode is active, the section also computes `missing_days = 30 - distinct_covered_dates`. When ≥5 days have neither live nor archived coverage, a muted footnote `보관 누락 N일` surfaces so PM can distinguish "no activity that day" from "trigger never fired". This is the simplest possible coverage-gap signal — a SessionStart backfill hook is explicitly deferred (M6 or v1.4.x).

## 8. Lifecycle: where snapshots get written

| Caller | When | Notes |
|---|---|---|
| `lib/renderer/trigger.js triggerRender()` | After successful `renderStatus()` + cache writes, before `.trigger-pending` write | The canonical M5 write site. Lazy `require('../snapshot')` so test contexts without `lib/snapshot/` still load `trigger.js`. |
| `derive/cli.js render` (manual / smoke) | Not currently wired (M5 boundary) | The CLI is read/derive only; trigger.js is the side-effect path. Smoke tests that exercise the snapshot path drive it via `triggerRender` or by calling `writeSnapshotIfNeeded` directly. |

## 9. Test surface

| Test file | Coverage |
|---|---|
| `lib/snapshot/tests/snapshot.test.js` | 12 paths: write, idempotence, empty-short-circuit-with-retention, eviction, fail-open, always-mask, future-date skew guard, last-render skew guard, parser internals, projection coverage. |
| `lib/renderer/tests/audit-timeline-snapshot.test.js` | 7 paths: no-snapshotsDir baseline, snapshot merge, de-dup collision, corrupt-JSON skip, rowKey internals, readSnapshotRows window clamp, MAX_ROWS_LIVE export. |
| `lib/renderer/tests/trigger.test.js path j` | Trigger integration: successful triggerRender with non-empty receipts writes today's snapshot. |

## 10. Cross-link

- Live source surface: [`schema-surface.md`](./schema-surface.md) §3 (receipt) + §4 (envelope) + §6 (snapshot, this doc).
- M1 derive engine: [`plugins/mccp/scripts/derive/sources/receipts.js`](../../plugins/mccp/scripts/derive/sources/receipts.js) (extract function).
- M4 trigger contract: [`plugins/mccp/scripts/lib/renderer/trigger.js`](../../plugins/mccp/scripts/lib/renderer/trigger.js).
- Implement-Codex R1 findings F1–F4 absorbed in plan body amendments + this schema doc.

> Cross-link: STATE.md schema reconciliation lives in [`state-md-naming-reconciliation.md`](./state-md-naming-reconciliation.md).
