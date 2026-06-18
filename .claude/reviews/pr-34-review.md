# PR Review: #34 — feat(v1.3.0-m2): observability surface II — briefing stamp

**Reviewed**: 2026-06-18
**Author**: idenn207 (박동민)
**Branch**: v1-3-0-observability-m2-briefing-stamp → main
**Decision**: APPROVE with comments

## Summary

Chain-aware code-reviewer gate. PR-Codex (R1, no actionable findings) + security-reviewer (no CRITICAL/HIGH on hash carve-out / schema / prompt-injection / path-traversal / TOCTOU axes) both converged. 422/422 tests pass across briefing + receipt-core + derive scope. Ship-ready; MEDIUM 2 / LOW 4 followups are non-blocking, queued as v1.3.0-m3 or v1.3.1 axis candidates.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

**M1 — `stampReceipt` non-atomic disk write** ([`plugins/mccp/scripts/lib/briefing/index.js:68-69`](../../plugins/mccp/scripts/lib/briefing/index.js#L68))

`fs.writeFileSync(receiptPath, json, 'utf8')` without temp-file + rename. `store.writeReceipt` typically uses an atomic helper, so this is an asymmetric pattern. Risk is **LOW security** (security-reviewer confirmed — briefing is additive metadata, not gate decision; no security boundary crossed) but **MEDIUM code-quality** for consistency + future-proofing concurrent readers. Recommend: stampReceipt routes through the same atomic helper as `store.writeReceipt`.

**M2 — `isInPRCodexReviewSubphase` catch path lacks dedicated test** ([`plugins/mccp/scripts/lib/briefing/cost-guard.js:50-61`](../../plugins/mccp/scripts/lib/briefing/cost-guard.js#L50))

Production probe's `try/catch → return false` (fail-open on corrupt JSON / fs error) is intentional but only the `lockProbe` shim is asserted in tests. Future regression of the catch branch would be silent. Recommend: 1-test addition using `mkdtempSync` to seed a corrupt lock file and call the real probe.

### LOW

**L1 — `index.test.js` "schema-invalid stamp" test cannot trigger the invariant** ([`plugins/mccp/scripts/lib/briefing/tests/index.test.js:120-149`](../../plugins/mccp/scripts/lib/briefing/tests/index.test.js#L120))

`invoke.parseSummary` caps at 1024 first, so the schema-invalid throw path inside `stampReceipt` is unreachable through the public surface. Recommend: add a separate test that calls `stampReceipt` directly with oversized summary → throw + disk file unchanged.

**L2 — CLAUDE.md cheat sheet `─ live (M1)` copy-paste** ([`CLAUDE.md:457-458`](../../CLAUDE.md#L457))

Two MCCP_BRIEFING rows are tagged `─ live (M1)` but should be `─ live (M2)`. Copy-paste artifact from dispatch-controller row.

**L3 — `BRIEFING_IN_PROGRESS` module-level state is hard to isolate in tests** ([`plugins/mccp/scripts/lib/briefing/index.js:24`](../../plugins/mccp/scripts/lib/briefing/index.js#L24))

Re-entrancy test triggers inline so current tests are OK. Future test additions risk leaks across cases. Optional: `_resetReentrancyForTest()` test-only export.

**L4 — `buildFocus` slice(0, 3) magic number** ([`plugins/mccp/scripts/lib/briefing/invoke.js:36`](../../plugins/mccp/scripts/lib/briefing/invoke.js#L36))

`correlations.slice(0, 3)` lacks a one-line rationale comment (cap on PM-verdict prompt context size).

### INFO

- `JSON.parse(JSON.stringify(receipt))` deep-clone in `hash.js` is lossless because receipt schema is plain-JSON-only. Adding Date/BigInt/Function/Symbol to the schema in the future would silently corrupt the hash — but is gated by schema validate. Comment in `hash.js:199-204` adequately captures the rationale.
- `BRIEFING_TIMEOUT_MS = 60 * 1000` (`invoke.js:18`) is 1/15 of codex default. Right-sized for a 1-line verdict output. Comment in place.
- security-reviewer finding L1 (prompt injection via receipt fields in `buildFocus`) — mitigated by `decision_id` / `gate_id` regex validation in schema.js and `open_questions` only emitting count not content. No remediation needed.

## Cross-gate dedupe + PR-Codex reuse

| Gate | Result | Round | Reuse decision |
|---|---|---|---|
| `mccp-plan-codex` | converged (refreshed) | 1 | resolution.open_questions=[] — no items to re-flag |
| `mccp-implement-codex` | converged (refreshed) | 1 | resolution.open_questions=[] — no items to re-flag |
| `mccp-pr-codex` | converged (invoked, empty summary, codex_actionable_findings=false) | 1 | no findings to dedupe; design scope excluded (`codex_design_scope_excluded=true`) |
| security-reviewer | newly invoked (Task agent) | n/a | 5 areas reviewed (hash carve-out, schema, prompt injection, path traversal, TOCTOU); 0 CRITICAL/HIGH |

## Validation Results

| Check | Result |
|---|---|
| Type check | N/A (JS project) |
| Lint | Skipped |
| Tests (briefing + receipt-core + derive) | **422/422 pass** (16.4s) |
| Build | N/A |

## Files Reviewed (PR head `1b1b648`)

**Modified** (7):
- `CLAUDE.md`
- `.claude/prds/v1-3-0-observability-surface-ii.prd.md`
- `docs/v1.3.0-observability/schema-surface.md`
- `plugins/mccp/scripts/derive/sources/receipts.js`
- `plugins/mccp/scripts/receipt/hash.js`
- `plugins/mccp/scripts/receipt/schema.js`
- `plugins/mccp/scripts/receipt/write.js`

**Added** (11):
- `.claude/PRPs/plans/completed/v1-3-0-observability-m2-briefing-stamp.plan.md`
- `.claude/PRPs/reports/v1-3-0-observability-m2-briefing-stamp-report.md`
- `plugins/mccp/scripts/lib/briefing/{cost-guard,index,invoke}.js`
- `plugins/mccp/scripts/lib/briefing/tests/{cost-guard,index,invoke}.test.js`
- `plugins/mccp/scripts/receipt/tests/{briefing-fields,hash-briefing-exclusion}.test.js`
- `plugins/mccp/scripts/derive/tests/briefing-surface.test.js`

## Followup axis (non-blocking, v1.3.0-m3 / v1.3.1 candidates)

- M1, M2, L1, L2 above (from this gate).
- STATE.md Open Questions, all 3 reproduced this cycle:
  - `prp-implement.md / pr.md 2.5.7-2.5.8 validate-cmd --decision/--plan` 누락 → mechanical 1-line patch
  - post-ship receipt drift (plan_hash mismatch after archive) → automate via `prp-implement` Phase 5/6 receipt rebase
  - `pr.md .git/` hardcode (not hit on main worktree this cycle; will hit again on sibling worktree)
- New axis from this gate: `codex-runner.js` body-builder skips body-file write when `codex_actionable_findings=false`, forcing the slash-command body to manually persist audit-trail. Spec ↔ implementation divergence.
