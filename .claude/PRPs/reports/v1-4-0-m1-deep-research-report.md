# Implementation Report: v1.4.0 axis A — `/deep-research` → `/mccp:plan-prd` integration

## Summary

Cooperative integration of Anthropic native `/deep-research` into `/mccp:plan-prd` Phase 2.5. mccp does not invoke `/deep-research` itself (CLAUDE.md §1.4 Principle preserved); it detects evidence gaps + research-trigger keywords, emits a guide prompt only on env-confirmed availability, and injects the user's `paste:` response into the PRD body. `/mccp:plan` then sha256-digests the PRD `## References` content into a `## External Research Provenance` section in the plan body, riding on the existing `plan_hash` mechanism for mechanical chain-of-custody anchoring (no receipt schema bump).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — matched |
| Confidence | High (Plan-Codex R1 5/5 ACCEPT_NOW, all absorbed into plan body before implement) | Confirmed — zero implementation surprises |
| Files Changed | 7 (1 new lib + 1 new test + 1 new doc + 1 new dir + 3 updated cmd/changelog/prd) | 7 created/updated as planned + 1 receipt |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | Phase 2.5 — Implement-Codex gate | Complete | Cross-gate dedupe applied (plan-codex R1 verdict=approve covered all implement-time decisions). Dedupe marker injection into plan body initially broke plan_hash anchor (the known v1.3.0 "dedupe phantom-residual"); reverted edit + re-wrote implement-codex receipt for re-alignment. |
| 1 | `deep-research-detect.js` probe library | Complete | Tristate availability + AND-gated signal + stdin first-class + path-traversal guard. 236 LOC. |
| 2 | `deep-research-detect.test.js` (24 tests) | Complete | One regex bug found and fixed during write: `\s*\n` after `## Evidence` heading was greedy on `\n` → swallowed content. Fixed to `[ \t]*\r?\n`. 294 LOC. |
| 3 | `plan-prd.md` Phase 2.5 + §4.0b | Complete | Phase 2.5 EXTERNAL_RESEARCH sub-phase added between Phase 2 GROUND and Phase 3 DECIDE; §4.0b injection inside Phase 4 GENERATE handles `paste:` / `skip-research:` / `failed-research:` response grammar. |
| 4 | `integration-template.md` (M1-experimental) | Complete | Custody anchor option matrix (a/b/c/d) deliberately leaves M2/M3 free to choose. Anti-pattern §6 calls out first-axis lock-in as a structural risk. 111 LOC. |
| 5 | PRD M1 row | Complete | Status `in-progress`, Plan cell linked to plan file. M2/M3/M4 rows untouched. |
| 6 | CHANGELOG.md v1.4.0-m1 row | Complete | All three required tokens (`axis A` / `deep-research` / `integration-template`) present. Version race risk #7 noted inline. |
| 7 | `plan.md` Phase 4.5 provenance stamping | Complete | sha256 of PRD `## References` content → plan body `## External Research Provenance`. Idempotent + freshness validated via tempdir smoke test. Silent skip when PRD has no `## References`. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static syntax | Pass | `node -c deep-research-detect.js` clean. |
| Unit tests (new) | Pass | 24/24 — covers all 8 scenarios per plan spec. |
| Regression sweep | Pass | 48/48 across `impeccable-detect.test.js` + `deep-research-detect.test.js`; 464/465 across full `plugins/mccp/scripts/lib/tests/*.test.js` (1 unrelated skipped, 0 failed). |
| Probe smoke (current PRD) | Pass | Evidence-rich `.claude/prds/v1-4-0-automation-modernization.prd.md` → `research_signal=false` (false-positive prevention validated). |
| Probe smoke (Assumption fixture) | Pass | Synthetic Assumption-marker body via stdin → `research_signal=true`, `reason=ok`. |
| Provenance stamp smoke | Pass | Stamp + re-stamp (different sha256) + silent skip (no References) all validated in tempdir. |
| Receipt chain validate | Pass | `mccp:prp-implement` with explicit `--plan` + `--decision` → `ok=true`, no missing/stale/blocking. |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/deep-research-detect.js` | CREATED | +236 |
| `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` | CREATED | +294 |
| `docs/automation-modernization/integration-template.md` | CREATED | +111 |
| `plugins/mccp/commands/plan-prd.md` | UPDATED | +~120 (Phase 2.5 + §4.0b inject) |
| `plugins/mccp/commands/plan.md` | UPDATED | +~60 (Phase 4.5 provenance stamping) |
| `.claude/prds/v1-4-0-automation-modernization.prd.md` | UPDATED | M1 row Plan cell linkified |
| `CHANGELOG.md` | UPDATED | +~25 (v1.4.0-m1 row) |
| `.claude/receipts/mccp-implement-codex/v1-4-0-automation-modernization.json` | CREATED | receipt — dedupe-applied, verdict=approve |

## Deviations from Plan

- **Phase 2.5 dedupe marker bouncing** — Phase 2.5.1 instructed writing `## Codex Implementation Review` into the plan body to record cross-gate dedupe. Doing so changed `plan_hash`, which immediately broke the `mccp-plan-codex` receipt's hash anchor (`validate-cmd` reported `stale`). Reverted the plan-body edit and re-wrote the `mccp-implement-codex` receipt against the pristine plan body. This is the exact "dedupe phantom-residual" failure mode logged in v1.3.0 cycle memory; the structural fix lives in the command body spec itself (Phase 2.5.1 vs `plan_hash` invariant), not in this milestone's scope.
- **regex bug in `hasEvidenceGap`** caught during test run — `\s*\n` after `## Evidence` was too greedy and swallowed the blank line plus the next content line. Fixed to `[ \t]*\r?\n` (horizontal whitespace only). All 24 tests pass after fix.

## Issues Encountered

- **`validate-cmd` default-slug regression** — `node receipt/cli.js validate --command mccp:prp-implement` (no `--plan`/`--decision`) returns `decisionId='default'` → v0.2.8 generic-receipt quarantine block. Worked around by always passing explicit `--plan` + `--decision`. v1.3.1's "Five validate-call callsites" CHANGELOG row says callsites in commands now forward `--decision`/`--plan` correctly; this milestone confirms the runbook recovery path still works when running outside those callsites.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` | 24 | (S1a-d) tristate env override + default; (S2) false-positive on current PRD; (S3) Assumption marker + keyword; (S4/S4b) empty Evidence section variants; (S5a-b) path traversal; (S6/S6b) `--stdin` parser via spawn; (S7-c) mode-mismatch; (S8a-d) env vs filesystem precedence; helper unit tests for hasEvidenceGap / hasResearchKeyword / computeResearchSignal AND-gate |

## Next Steps

- [ ] Code review via `/mccp:code-review` (or directly `/mccp:pr` if no manual review needed — cross-gate dedupe will fire at PR step since plan-codex + implement-codex both `verdict=approve`)
- [ ] Decide `plugin.json` `version` bump at PR ship time (PRD risk #7 — current `1.3.1` candidate vs `1.4.0` minor bump)
- [ ] At PR ship: confirm `.gitignore`-friendly behavior of the new `docs/automation-modernization/` directory
- [ ] Dogfood the Phase 2.5 cooperative guide in a future PRD where evidence-gap is real (cannot dogfood inside this same cycle since the current PRD is evidence-rich)
