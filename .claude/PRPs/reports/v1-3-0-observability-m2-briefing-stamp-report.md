# Implementation Report: v1.3.0-m2 LLM Briefing Stamp + Cost Telemetry

## Summary

Wired a single, capped, cost-tier-gated LLM call into the receipt write path. Each `receipt-write` produces a ≤200-token "briefing summary" plus token-usage telemetry, stamped into `meta.*` as 4 new schema fields (Codex R1 F2 added `briefing_token_estimated:boolean` on top of the original 3-field plan). Receipt write is fail-open throughout: briefing failure never poisons the canonical receipt.

The cost-tier guard (`tierFor(cost_usd) ≥ 'notice'`) auto-disables the LLM call so the $50 notice threshold acts as the indirect monthly-budget enforcer. PR-phase re-entrancy is mechanically blocked via `pr-phase.lock subphase=codex-review` probe (Codex R1 F3 absorption). `receipt_hash` carves out `briefing_*` so stamping never invalidates the tamper-detect digest (Codex R1 F1 absorption, via JSON deep-clone to prevent caller-object mutation).

derive engine's `sources/receipts.js` widened by 3 keys so M3's audit-timeline renderer can consume `briefing_summary` read-only.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium (9–12 hours human) | 1 LLM-session turn (~3 batches) |
| New schema fields | 3 (plan) → 4 (Codex R1 F2) | 4 (matches absorbed scope) |
| New lib files | 3 (cost-guard, invoke, index) | 3 (exact match) |
| New test files | 5 | 6 (added `hash-briefing-exclusion.test.js` per Task 1b) |
| External deps added | 0 | 0 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | schema.js — 4 present-only meta fields | [done] | validate() + makeSkeleton() |
| 1b | hash.js — receiptHash carve-out | [done] | deep-clone via JSON to prevent caller-object mutation |
| 2 | briefing/cost-guard.js | [done] | 9 paths incl. PR_PHASE_LOCKED (Codex R1 F3) |
| 3 | briefing/invoke.js | [done] | Token estimate is (focus+stdout)/4 (Codex R1 F2) |
| 4 | briefing/index.js | [done] | BRIEFING_IN_PROGRESS re-entrancy guard + stamp-only-receipt path |
| 5 | receipt/write.js — wire triggerBriefing | [done] | After triggerEscalateIfNeeded, belt-and-suspenders try/catch |
| 6 | derive/sources/receipts.js — widen pick() | [done] | 3 keys added, M1 absence-semantics preserved |
| 7 | briefing-fields.test.js | [done] | 9 schema assertions |
| 7b | hash-briefing-exclusion.test.js | [done] | 5 hash invariants (Codex R1 F1) |
| 8 | cost-guard/invoke/index tests | [done] | 9 + 9 + 6 paths |
| 8b | derive briefing-surface.test.js | [done] | 3 paths (absence vs explicit null) |
| 9 | Manual dogfood verification | [done] | cost-tier-critical skip path confirmed (current cost_usd=$210.99, > $100 ceiling) — receipt stamped with `summary=null, token_count=0, token_estimated=false, invocation_count=0` + loud stderr signal |
| 10 | schema-surface.md update | [done] | §2.3 + §2.5 (Briefing fields and receipt_hash) + §6.1 STATUS line |
| 11 | PRD + CLAUDE.md updates | [done] | PRD M1/M2 rows already updated in prior session; CLAUDE.md §1.4 row + §4 toggles added |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| New M2 tests (6 files) | [done] Pass | 41/41 assertions |
| Receipt + derive regression | [done] Pass | 422/422 (was 381 before) — zero regression |
| Briefing wire-in dogfood | [done] Pass | Cost-tier critical correctly auto-disables LLM; receipt re-write stamps skip-path metadata |
| Receipt-chain validate | [done] Pass | `mccp:prp-implement` chain returned `ok:true` (Phase 2.5.7) |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | +48 |
| `plugins/mccp/scripts/receipt/hash.js` | UPDATE | +18 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | +11 |
| `plugins/mccp/scripts/derive/sources/receipts.js` | UPDATE | +6 |
| `plugins/mccp/scripts/lib/briefing/cost-guard.js` | CREATE | ~100 |
| `plugins/mccp/scripts/lib/briefing/invoke.js` | CREATE | ~155 |
| `plugins/mccp/scripts/lib/briefing/index.js` | CREATE | ~130 |
| `plugins/mccp/scripts/receipt/tests/briefing-fields.test.js` | CREATE | ~140 |
| `plugins/mccp/scripts/receipt/tests/hash-briefing-exclusion.test.js` | CREATE | ~85 |
| `plugins/mccp/scripts/lib/briefing/tests/cost-guard.test.js` | CREATE | ~115 |
| `plugins/mccp/scripts/lib/briefing/tests/invoke.test.js` | CREATE | ~135 |
| `plugins/mccp/scripts/lib/briefing/tests/index.test.js` | CREATE | ~155 |
| `plugins/mccp/scripts/derive/tests/briefing-surface.test.js` | CREATE | ~85 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | +14 |
| `CLAUDE.md` | UPDATE | +5 |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | +4 / -3 (pre-existing — carried from prior session) |

## Deviations from Plan

- **Plan-codex receipt refresh**: Phase 2.5.1 dedupe injection mutates plan body, which invalidates the plan-codex receipt's `plan_hash`. Worked around by re-running `mccp:plan-codex` write with current plan hash (per STATE.md's documented "post-ship receipt drift" workaround). This is a chain-design artifact: dedupe section is meant to short-circuit Codex re-review, but mechanically alters plan content. v1.3.x continuation candidate: receipt-write should optionally pin plan_hash to a stored snapshot rather than re-deriving on each gate.
- **No worktree created**: per CLAUDE.md §3.8 the M2 plan suggested `.worktrees/v1.3.0-observability-m2/`. Skipped because the implementation was single-session linear (no parallel dogfood). Branch `v1-3-0-observability-m2-briefing-stamp` created on the main cwd.
- **Hash.js deep-clone fix beyond plan spec**: plan's Task 1b pseudo-code showed `JSON.parse(JSON.stringify(receipt))` correctly, but the existing `receiptHash` used shallow `Object.assign({}, receipt)`. Implementing the deep clone was strictly necessary — without it, `delete clone.meta.briefing_*` would mutate the caller-owned receipt's meta. The test `receiptHash does not mutate the caller-owned receipt object` exercises this exact invariant.
- **`plugin.json` not bumped**: explicit acceptance criterion. Already at `1.3.0` from prior cycle's deferred bump; v1.3.0-m2 ships under same minor version.

## Issues Encountered

- **Fixture meta.command missing**: 6 of 41 new tests initially failed because `meta.command` (required by validator) wasn't set in test fixtures. Fixed by adding `s.meta.command = 'mccp:test';` to 3 fixture helpers. Took 1 short retry cycle.
- **PostToolUse loop warning**: hook reported sequential Edit calls to `schema-surface.md` as a "stuck loop" false positive. The calls were 3 distinct edits to different sections (§2.3 rows, §2.5 new subsection, §6.1 STATUS line). Confirmed not actually looping.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `receipt/tests/briefing-fields.test.js` | 9 | schema validate + makeSkeleton |
| `receipt/tests/hash-briefing-exclusion.test.js` | 5 | Codex R1 F1 carve-out invariants |
| `lib/briefing/tests/cost-guard.test.js` | 9 | env policy × cost-tier × PR-phase guard |
| `lib/briefing/tests/invoke.test.js` | 9 | classification mapping + token estimate |
| `lib/briefing/tests/index.test.js` | 6 | end-to-end stamping + fail-open + re-entrancy |
| `derive/tests/briefing-surface.test.js` | 3 | derive widen with absence vs explicit-null |
| **Total** | **41** | — |

## Next Steps

- [ ] Code review via `/mccp:code-review`
- [ ] Commit via `/mccp:prp-commit`
- [ ] PR via `/mccp:pr`
- [ ] Post-merge: STATE.md roll + PRD M2 status → `complete` (next cycle's first chore)
- [ ] Memory roll: mark mccp v1.3.0 Cycle entry with M2 ship under "현재 minor cycle" line
