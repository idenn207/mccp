# Implementation Report: v1.3.0 Milestone 0 — Schema Baseline Alignment

## Summary

Froze the read-side schema surface (receipt + envelope + STATE.md frontmatter) that the v1.3.0 dashboard derive engine (M1+) will rely on. Closed the dual-validator gap on dispatch envelopes (hand `validate()` now mirrors `JSON_SCHEMA.additionalProperties:false`). Amended the PRD body in place to remove stale `handoff_dispatching` / `handoff_dispatched` identifiers that don't exist in `state-writer.js`. No receipt schema fields added; no new migration marker. Net surface: 2 new docs + 1 strict validator change + 2 new regression test files.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium (docs-heavy, low code surface) | Medium — matched. Code change limited to 1 function in `dispatch-envelope.js` + 1 added export. |
| Confidence | High (Codex R1 absorbed all 4 findings) | High — no implement-time decisions surfaced; cross-gate dedupe applied. |
| Files Changed | 8 (per plan Files to Change) | 8 (5 modified + 3 created — matches). Plus 2 untouched git artifacts (scaffold plans + receipt copy). |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | schema-surface.md | Complete | 6 sections + reconciliation table + M2 prerequisite + forward-compat policy. |
| 2 | state-md-naming-reconciliation.md | Complete | Mapping table (5 frontmatter fields + 2 VALID_EVENTS) + tri-state interpretation (5 rows). |
| 3 | v1-3-0-baseline.test.js | Complete | 10 tests (expanded from plan's 4 — covers both branches of each invariant). |
| 4 | dispatch-envelope strict + forward-compat test | Complete | 4a code change (KNOWN_KEYS rejection loop) + 4b test (5 tests, expanded from plan's 3 — added multi-key + schema-bump-path mention) + 4c regression green. |
| 5 | DROPPED per Codex R1 F4 absorption | N/A | Migration marker not created (no receipt schema delta). |
| 6 | .gitignore | Complete | `.claude/cache/` rule appended. |
| 7 | CLAUDE.md | Complete | §1.4 row added + §5 troubleshooting reference. |
| 8 | PRD body amend + Errata | Complete | 3 body locations rewritten (Open Questions, Risks, Compatibility table) + Errata appended. Stale names cleared from PRD body (descriptive errata avoids re-introducing them). |
| 9 | Validation pass | Complete | 945/945 tests green across receipt/state/lib (1 skipped — platform-conditional). |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | No type-checker for plain JS; relies on test coverage. |
| Unit Tests | Pass | 945 tests across 3 directories (receipt: 361, state: 144, lib: 440 + 1 skipped). |
| Build | N/A | Plain Node project; no build step. |
| Integration | N/A | M0 has no integration surface — schema docs + validator hardening only. |
| Edge Cases | Pass | Receipt all-or-nothing invariant tested both branches; 3-way mutex tested 2 collision pairs + happy path; envelope strict reject tested with multi-key + bumped schema_version. |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `docs/v1.3.0-observability/schema-surface.md` | CREATED | +151 |
| `docs/v1.3.0-observability/state-md-naming-reconciliation.md` | CREATED | +63 |
| `plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js` | CREATED | +151 |
| `plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js` | CREATED | +95 |
| `plugins/mccp/scripts/lib/dispatch-envelope.js` | UPDATED | +30 / -0 |
| `.gitignore` | UPDATED | +5 / -0 |
| `CLAUDE.md` | UPDATED | +2 / -1 |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATED | +14 / -3 |
| `.claude/plans/v1-3-0-observability-m0-schema-baseline.plan.md` | UPDATED | +4 / -0 (Codex Implementation Review dedupe note) |

Untouched (verified): `plugins/mccp/scripts/receipt/schema.js`, `plugins/mccp/scripts/state/state-writer.js`, existing receipt JSON files.

## Deviations from Plan

| Area | Deviation | Why | Plan-conflict detector verdict |
|---|---|---|---|
| Test count for Task 3 | 10 tests instead of 4 | Both branches of each invariant pinned (e.g. 3-way mutex tested across 2 collision pairs + happy path). Tightens regression surface without expanding scope. | minor — within plan's "4 cases" Codex R1 F2 absorption note (which was the binding constraint, not the test count). |
| Test count for Task 4b | 5 tests instead of 3 | Added (a) multi-unknown-key test, (b) schema-bump-path-mentioned-in-error test. Each surfaces a separate failure mode without expanding scope. | minor — within plan's invariant set. |
| Removed over-defensive "frozen Set" test from Task 4b | The first iteration added `KNOWN_KEYS is frozen` test; `Object.freeze` on a Set wrapper doesn't actually prevent `add()`/`delete()` in non-strict mode. Removed because real protection is "JSON_SCHEMA + hand validator agree" test (still present). | The test was checking JS language semantics, not the schema contract. | minor — removed before commit. |
| PRD Errata wording | Descriptive ("two non-existent frontmatter identifiers") instead of literal-quoted. | Plan's acceptance criterion `! grep -q "handoff_dispatching"` would fail if literal names appear anywhere in the PRD, even in audit context. Reconciliation doc carries the literal mapping. | minor — audit value preserved via cross-doc link. |

## Issues Encountered

| Issue | Resolution |
|---|---|
| `validate-cmd` CLI falls back to `default` slug even with `--plan` or matching git branch | Known CLI bug from STATE.md Open Questions (v1.0.1 W-VERDICT M axis candidate). Runtime UserPromptExpansion hook derives slug correctly — the bug is local to the CLI subcommand. Bypassed via `--decision` override per STATE.md guidance. Validate-with-explicit-decision returned `ok:true exit:0`. |
| `node --test <dir>` directory mode failing under Node v24.11.1 | Switched to glob expansion `node --test path/*.test.js`. Same tests, deterministic enumeration. 945/945 pass. |
| `Object.freeze(new Set([...]))` does not protect Set internals | Removed the over-defensive test asserting it does. The real contract — "JSON_SCHEMA + hand validator agree on additionalProperties" — has its own dedicated test. |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js` | 10 | Backward-compat read tolerance (v0.2.x-era receipts); v1.2.0-m1 controller attribution all-or-nothing invariant (4 branch combinations); v0.3.5 3-way codex skip mutex (3 collision/pass cases); v1.0.1 `pr_phase_lock_stale_reclaimed_at_hook` optional boolean (3 cases). |
| `plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js` | 5 | Unknown-key rejection (single + multi); schema-bump-path error mention; `schema_version` constant invariant; JSON_SCHEMA ↔ hand-validate consistency (every property in both, no drift). |

## Codex Adversarial Review Status

| Gate | Slug | Round | State | Notes |
|---|---|---|---|---|
| `mccp-plan-codex` | `v1-3-0-observability-m0-schema-baseline` | 1 | Converged | 4 findings all ACCEPT_NOW, absorbed into plan body. |
| `mccp-implement-codex` | `v1-3-0-observability-m0-schema-baseline` | 1 | Converged | Cross-gate dedupe applied — decision set already converged in plan-codex; no new implement-time decisions detected; files-changed ⊆ plan's Files to Change list. |

## Next Steps

- [ ] `/mccp:code-review` to review changes (optional — Codex chain already converged).
- [ ] `/mccp:prp-commit` to stage + commit with descriptive message.
- [ ] `/mccp:pr` to open PR with PR-Codex review (cross-gate dedupe should apply per v0.2.8 invariant).
- [ ] Move on to v1.3.0 M1 (derive engine) — plan already exists at `.claude/plans/v1-3-0-observability-m1-derive-engine.plan.md` (scaffold-committed alongside M0 — forward reference).
- [ ] **plugin.json version bump** to `1.3.0` per CLAUDE.md §3.7 — Milestone PR obligation. Branch is `v1-3-0-observability-m0-schema-baseline`; plugin.json should reflect this cycle's ship.

## Acceptance Checklist

- [x] `docs/v1.3.0-observability/schema-surface.md` exists with 6 named sections + PRD-reconciliation table + M2 prerequisite note
- [x] `docs/v1.3.0-observability/state-md-naming-reconciliation.md` exists with mapping table + tri-state table
- [x] `plugins/mccp/scripts/lib/dispatch-envelope.js` `validate()` rejects unknown top-level keys (Task 4a code change)
- [x] `plugins/mccp/scripts/receipt/tests/v1-3-0-baseline.test.js` green (10 tests, none asserting arbitrary writer-injected unknown-key acceptance)
- [x] `plugins/mccp/scripts/lib/tests/dispatch-envelope-forward-compat.test.js` green (5 tests, including unknown-key rejection)
- [x] Existing receipt + state-writer + dispatch-envelope test suites remain green (945 total, 0 fail, 1 platform-skipped)
- [x] `.gitignore` carries `.claude/cache/` entry
- [x] `CLAUDE.md` §1.4 table has v1.3.0 schema baseline row; §5 references schema-surface.md
- [x] PRD Milestone 0 row Status = `in-progress` and Plan cell links to this plan
- [x] PRD body free of `handoff_dispatching` / `handoff_dispatched` references; Errata section appended (descriptive, no literal name re-introduction)
- [x] No migration marker created under `.claude/receipts/.migrations/v1.3.0-*` (Task 5 dropped per Codex R1 F4)
- [x] No mutations to `schema.js`, `state-writer.js`, or any existing receipt JSON
