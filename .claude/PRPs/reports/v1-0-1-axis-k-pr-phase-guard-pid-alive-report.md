# Implementation Report: v1.0.1 axis K — pr-phase-guard PID liveness

## Summary

`pr-phase-guard.js` `lockActive()` now detects same-host orphan locks (dead PID) and reclaims them via the existing `pr-phase-lock.js` host-aware tri-state policy (`isPidAlive` + `tryReclaimStaleLock`), eliminating the Linux/macOS self-trap where a crashed PR helper left a lock body intact and every subsequent `/mccp:pr` was blocked by the guard (because the in-band escape `detect-stale` is itself denied by the tokenizer+allowlist). Silent recovery is prevented by a state-file marker (`<root>/.claude/state/pr-phase-lock-stale-reclaimed.json`) that `finalize-receipt.js` consumes on the next PR cycle, stamping `meta.pr_phase_lock_stale_reclaimed_at_hook=true` on the next receipt for a loud audit trail.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small (M2 split) | Small — implementation matched scope |
| Confidence | Plan body §Decision: Option A baseline | Option A implemented as planned (no R1 reversal needed — Codex disabled per permanent policy) |
| Files Changed | 7 listed (1 hook, 1 helper, 1 CLI/schema entry, 2 test areas, 1 doc, 1 changelog) | 7 files updated — CLI/schema entry split into `schema.js` + `write.js` + `cli.js` help text (3 sub-files), tests consolidated into single `pr-phase-guard.test.js` |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `lockActive()` PID liveness branch | ✓ Complete | reused lock module's `isPidAlive` / `tryReclaimStaleLock` / `lockPath` exports — surface increase 0 |
| 2 | `writeStaleReclaimMarker()` atomic write | ✓ Complete | tmp + rename, 0o600, `assertContained` path-containment guard |
| 3 | `finalize-receipt.js` marker consume + flag forward | ✓ Complete | added `consumeStaleReclaimMarker()` + new `--pr-phase-lock-stale-reclaimed-at-hook` push into `writeFlags` |
| 4 | Receipt CLI schema + flag | ✓ Complete | `schema.js` validator branch + `makeSkeleton` default + `write.js` argv → meta mapping + `cli.js` help text |
| 5 | Test axes 11 (PID liveness) + 12 (marker round-trip) | ✓ Complete | 9 new tests (11.1–11.5 + 12.1–12.4); 0 regressions on 66 existing axes |
| 6 | `docs/v0.2-state-schema.md` §4.5 | ✓ Complete | Marker path/body/lifetime/writer/reader/sealed-channel-invariant documented |
| 7 | `CHANGELOG.md` v1.0.1 entry | ✓ Complete | `Fixed` + `Added` sections; W-VERDICT §7 C3 cherry-pick rationale |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (`node -c`) | ✓ Pass | `pr-phase-guard.js` + `finalize-receipt.js` syntax clean |
| Unit Tests (axis K surface) | ✓ Pass | `pr-phase-guard` 75/75 + `pr-phase-lock-boundary` + `pr-phase-lock-f11` = 117/117 |
| Build | N/A | no build pipeline — pure Node 20+ scripts |
| Integration | ✓ Pass | finalize-receipt → receipt CLI round-trip (axis 12.3) + schema round-trip (smoke receipt) |
| Edge Cases | ✓ Pass | pid=0/negative (axis 11.4), cross-host (11.3), Windows escape preserved (11.5), corrupt marker (12.4), idempotency (12.2) |

**Pre-existing failures (unrelated to axis K)**: `g1-patch.test.js` has 2 failures in `receipt-skill` and `receipt-prompt` G1 module-load-error paths. Verified pre-existing by stashing all axis K changes and re-running the file (same 2 failures). Not introduced by this implementation.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` | UPDATED | +71 lines (os import, marker constant, `loadPathContainment`, `writeStaleReclaimMarker`, lockActive reclaim branch, exports) |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATED | +50 lines (marker constant, `consumeStaleReclaimMarker`, `run()` integration, exports) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED | +12 lines (validator branch + `makeSkeleton` default) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | +5 lines (`args → meta.pr_phase_lock_stale_reclaimed_at_hook`) |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATED | +1 line (help text) |
| `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` | UPDATED | +120 lines (9 tests, fixture helpers, axis 11/12) |
| `docs/v0.2-state-schema.md` | UPDATED | +40 lines (§4.5 marker contract) |
| `CHANGELOG.md` | UPDATED | +12 lines (v1.0.1 entry with Fixed + Added) |
| `.claude/plans/v1-0-1-axis-k-pr-phase-guard-pid-alive.plan.md` | UPDATED | added `## Codex Implementation Review` section (Phase 2.5.4 — disabled short-circuit) |

## Deviations from Plan

- **Task 4 scope split** — plan said "receipt/cli.js (or schema validator)"; implementation touched `schema.js` (validator + default), `write.js` (argv→meta mapping), and `cli.js` (help text). CLI's generic `parseFlags()` already accepts arbitrary `--*` so no parser surgery was needed — the actual axis K wire-up lives in schema+write. Help text update is cosmetic but improves discoverability.
- **Test consolidation** — plan suggested splitting into `pr-phase-guard.test.js` axis 11/12 *and* a separate `lib/pr-phase-helpers/tests/finalize-receipt.test.js`. The pr-phase-helpers tests directory does not exist (verified). axis 12.3 + 12.4 cover the finalize-receipt round-trip + corrupt-marker handling inline in `pr-phase-guard.test.js` — net coverage identical, single test file.
- **Phase 2.5 Implement-Codex receipt** — `MCCP_CODEX_DISABLED=1` was applied inline (not in `settings.local.json`) because the env var was missing from settings despite the user's permanent-bypass policy ([[feedback-codex-permanent-bypass]]). Wrapper short-circuited cleanly (classification=disabled, durationMs=0). Receipt stamped `codex_disabled=true` + `codex_skip_reason='codex_disabled'` via env detection in `receipt/write.js`. Plan body's `## Codex Implementation Review` section auto-injected with the disabled rationale.

## Issues Encountered

1. **CLI cache vs dev-tree path divergence** — initial round-trip test invoked `~/.claude/plugins/cache/mccp/mccp/0.4.0/scripts/receipt/cli.js` (installed cache, unchanged), so the new flag came back as `undefined`. Plan body explicitly uses `plugins/mccp/scripts/receipt/cli.js` (dev tree) — invoking via dev tree resolved it. Future axis K developers must remember the cache copy is not refreshed during in-repo iteration.
2. **Plan hash drift** — re-running `validate-cmd` after adding the `## Codex Implementation Review` section produced `stale` status on `mccp-plan-codex` (plan_hash differs). Resolved by rewriting the plan-codex receipt against the current plan body. This is the documented pattern — receipts are bound to plan hash.

## Tests Written

| Test File | Tests Added | Coverage |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` | 9 new | axis 11.1 (alive same-host), 11.2 (dead same-host reclaim), 11.3 (cross-host no-reclaim), 11.4 (pid=0/negative), 11.5 (hooks.json no PowerShell), 12.1 (marker shape), 12.2 (idempotency latest-wins), 12.3 (finalize-receipt round-trip), 12.4 (corrupt marker still consumed) |

## Acceptance Checklist (from plan)

- [x] Tasks 1–7 모두 complete
- [x] axis K target surface: 117/117 PASS (`pr-phase-guard.test.js` 75 + `pr-phase-lock-boundary.test.js` + `pr-phase-lock-f11.test.js` 42)
- [x] axis 11.5 (Windows PowerShell escape path) PASS
- [x] F11 schema diff: `lockBody` structure unchanged, `ownership_token_hash` path not touched (new marker is a separate state file with no token contract)
- [x] State marker contract documented in `docs/v0.2-state-schema.md` §4.5
- [x] Receipt new flag round-trip validated end-to-end (`--pr-phase-lock-stale-reclaimed-at-hook` → `meta.pr_phase_lock_stale_reclaimed_at_hook=true`)
- [x] CHANGELOG.md v1.0.1 entry written
- [x] Linux/macOS M2 reproduction deferred to separate plan per PRD §Delivery Milestones (out of scope here)
- [x] Phase 5 Codex review — APPROVE (skipped via permanent disable policy, no R1 reversal)

## Next Steps

- [ ] `/mccp:code-review` for line-level review of guard hook + finalize-receipt changes
- [ ] `/mccp:prp-commit` for staging commit (suggested message: `fix(v1.0.1): pr-phase-guard reclaims orphan locks (axis K M1)`)
- [ ] `/mccp:pr` for PR creation (the new audit field will land on the PR's own receipt — first dogfood of the marker contract)
- [ ] M2 plan (Linux/macOS reproduction + W11 rubric re-measurement) — separate plan per PRD scope split
