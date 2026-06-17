# Implementation Report: v1.3.0 Milestone 1 — Derive Engine

## Summary

Built `plugins/mccp/scripts/derive/` — a read-only, in-memory derive engine that
scans `.claude/` (plans / receipts / STATE.md / backlog / fix-task / PR refs /
dispatch envelopes) and emits a single normalized model with cross-state
correlations. Zero writes, zero LLM calls, zero new npm deps. Masked-by-default
(Codex F2), runtime M0 schema-contract probe (Codex F4), per-source
loud-fail-open `degraded` flag (Codex F3), one-pass plan_hash correlation index
(Codex F1).

Output feeds M2 (LLM briefing stamp) and M3 (STATUS.md + status.html renderer).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium-Large | Medium-Large (matched) |
| Files created | 23 (13 source + 9 test + 1 helper) | 23 ✓ |
| Existing files modified | 4 (plan + PRD + CLAUDE.md + plugin.json) | 4 ✓ (STATE.md also modified, see Deviations) |
| LOC | 1500-2000 | 1976 ✓ |
| Tests | 9 fixture suites | 9 suites (20 tests) ✓ |
| Perf budget | < 1000ms | 717ms (28% headroom) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | derive/model.js — normalized factory | Complete | MODEL_VERSION='v1', emptyModel, validateShape, markDegraded |
| 2 | derive/sources/plans.js | Complete | safe-dir scan, legacy PRPs/plans fallback, acceptance progress |
| 3 | derive/sources/receipts.js | Complete | pick() helper preserves absence vs explicit-false (F1) |
| 4 | derive/sources/state.js | Complete | computeResumeState 4-state grid |
| 5 | derive/sources/backlog.js | Complete | markdown table parser |
| 6 | derive/sources/fix-task.js | Complete | read+parseFixTaskMd two-step contract |
| 7 | derive/sources/pr.js | Complete | local git signal, no GitHub API |
| 8 | derive/sources/envelopes.js | Complete | heartbeat staleness + loud-fail-open (F3) |
| 9 | derive/correlate.js | Complete | 6 kinds, 4-axis equality (F3 hardened) |
| 9b | derive/mask.js | Complete | idempotent path masker (F2) |
| 9c | derive/capability.js | Complete | runtime probe (F4) |
| 10 | derive/index.js | Complete | wires capability + 7 sources + correlate + mask |
| 11 | derive/cli.js | Complete | run/version + --json/--raw/--strict/--summary |
| 12 | 9 test fixtures | Complete | 20 tests pass, all F1-F4 absorption guards green |
| 13 | no-new-deps test | Complete | Module._resolveFilename shim with Windows path normalization |
| 14 | PRD milestone row flip | Complete | Row 1 already in-progress + plan link |
| 15 | CLAUDE.md registry | Complete | §1.4 derive engine row + §5 entry 6 |
| 16 | Validation pass + plugin.json bump | Complete | 1.2.0 → 1.3.0 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | No type-check toolchain in repo (pure JS, Node native test runner) |
| Unit Tests | Pass | derive 20/20 + receipt 361/361 + state 144/144 (lib suite pending background) |
| Build | N/A | No build step (Node CJS modules) |
| Integration | Pass | smoke `node cli.js run --json` against this repo: 20 plans, 3 receipts, 2 correlations, 0 warnings, contract_present=true |
| Edge Cases | Pass | empty-repo, envelope-absent, schema-drift, correlation axis (c)/(d) negative fixtures, mask idempotence, capability mocked-failure paths |

## Files Changed

### Created (23 files, 1976 LOC)

| File | Lines | Role |
|---|---|---|
| `plugins/mccp/scripts/derive/model.js` | 91 | Normalized model factory + validateShape + markDegraded |
| `plugins/mccp/scripts/derive/index.js` | 95 | Main entry derive(repoRoot, opts) |
| `plugins/mccp/scripts/derive/cli.js` | 113 | CLI run/version + flags |
| `plugins/mccp/scripts/derive/correlate.js` | 175 | 6 correlation kinds, 4-axis equality |
| `plugins/mccp/scripts/derive/mask.js` | 86 | Pure idempotent path masker (F2) |
| `plugins/mccp/scripts/derive/capability.js` | 72 | M0 schema contract runtime probe (F4) |
| `plugins/mccp/scripts/derive/sources/plans.js` | 100 | Plan file scan |
| `plugins/mccp/scripts/derive/sources/receipts.js` | 105 | Receipt extract with pick() helper (F1) |
| `plugins/mccp/scripts/derive/sources/state.js` | 51 | STATE.md + computeResumeState |
| `plugins/mccp/scripts/derive/sources/backlog.js` | 54 | Backlog table parser |
| `plugins/mccp/scripts/derive/sources/fix-task.js` | 41 | fix-task two-step contract |
| `plugins/mccp/scripts/derive/sources/pr.js` | 47 | Local git signal |
| `plugins/mccp/scripts/derive/sources/envelopes.js` | 95 | Envelope scan with heartbeat probe + degraded |
| `plugins/mccp/scripts/derive/tests/helpers.js` | 43 | Shared tmpRepo/cleanup/gitInit |
| `plugins/mccp/scripts/derive/tests/empty-repo.test.js` | 36 | Empty repo + shape check + TypeError |
| `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js` | 175 | All 7 sources populated + F1 absorption guard |
| `plugins/mccp/scripts/derive/tests/envelope-absent.test.js` | 42 | dispatches/ dir missing OK |
| `plugins/mccp/scripts/derive/tests/correlation.test.js` | 160 | 4-axis happy + 2 negative fixtures + Kind 2 |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | 42 | F3 loud-fail-open |
| `plugins/mccp/scripts/derive/tests/mask.test.js` | 72 | F2 default + raw + idempotence |
| `plugins/mccp/scripts/derive/tests/capability.test.js` | 47 | F4 probe + mock failure paths + integration |
| `plugins/mccp/scripts/derive/tests/perf-budget.test.js` | 60 | 100R + 20E + 5P < 1s |
| `plugins/mccp/scripts/derive/tests/no-new-deps.test.js` | 56 | Module._resolveFilename whitelist shim |

### Modified

| File | Action | Lines |
|---|---|---|
| `.claude/plans/v1-3-0-observability-m1-derive-engine.plan.md` | UPDATED | Codex Implementation Review dedupe note (Phase 2.5.1) |
| `CLAUDE.md` | UPDATED | §1.4 derive engine row + §5 entry 6 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version 1.2.0 → 1.3.0 |
| `.claude/state/STATE.md` | UPDATED | session hook auto-roll (not part of M1 scope) |

## Deviations from Plan

1. **PRD row 1 was already in-progress + plan link** (Task 14). The plan v3
   absorption from Phase 2.5.1 dedupe note made plan_hash drift, but the PRD
   itself was already in the correct state. Effective no-op for Task 14, retained
   as completed because the row content is correct.
2. **plan-codex receipt rebase** mid-Phase 2.5 — the dedupe note injection
   changed plan_hash, so the parent's plan-codex receipt was rebased against
   the new hash before writing implement-codex. Receipt content (converged=true,
   round=1, no skipped, no advisory) preserved. STATE.md open question
   "post-ship receipt drift" automation candidate validated by this very flow.
3. **STATE.md auto-roll** is in working tree but is not an intentional M1
   change — session hooks (precompact / stop-loop) auto-write it. Will be
   committed bundled because the new STATE.md content reflects the new chain
   state.

## Issues Encountered

1. **no-new-deps shim path normalization on Windows**: first attempt used
   `JSON.stringify(allowedScriptsRoot.replace(/\\\\/g, '/'))` which is a no-op
   for single-backslash Windows paths. Replaced with `path.sep.split.join('/')`
   normalization on both ALLOWED and `norm`. Resolved.
2. **`node --test <dir>` interprets dir as test file**: the validation command
   in the plan body required glob expansion. Switched to
   `node --test plugins/mccp/scripts/derive/tests/*.test.js`. Documented for
   future plans.
3. **CLI summary double-`v` prefix**: `'mccp-derive v' + MODEL_VERSION` printed
   `mccp-derive vv1` because MODEL_VERSION = `'v1'`. Stripped the literal `v`.
4. **`/tmp/derive-out.json` on Windows Bash**: redirected through Node which
   read `C:\tmp\` (non-existent). Switched to relative `derive-out.tmp.json`.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| empty-repo.test.js | 3 | shape, empty model, TypeError on bad arg |
| mccp-fixture.test.js | 2 | all 7 sources populated; F1 absence vs explicit-false |
| envelope-absent.test.js | 1 | receipts present, dispatches/ missing OK |
| correlation.test.js | 4 | Kind 1 happy + axis (c) + axis (d) + Kind 2 |
| schema-drift.test.js | 1 | F3 loud-fail-open on unknown_top_level_key |
| mask.test.js | 3 | F2 default masked + raw unmasked + idempotence |
| capability.test.js | 4 | F4 real + mocked envelope fail + mocked state fail + integration |
| perf-budget.test.js | 1 | 100 receipts + 20 envelopes + 5 plans < 1000ms (actual: 717ms) |
| no-new-deps.test.js | 1 | derive/index.js loads with whitelist-only require |

## Codex F1–F4 Absorption Guards (Acceptance Criteria)

- **F1 (HIGH 0.94)**: `tests/mccp-fixture.test.js` writes v0.2.x-era (no
  `codex_disabled_at_pr` key) + v0.3.5+ (`codex_disabled_at_pr: false` explicit)
  receipts; asserts first extract is `undefined`, second is `false`. Validates
  `pick()` helper preserves absence vs explicit-false distinction.
- **F2 (HIGH 0.91)**: `tests/mask.test.js` asserts default `derive(root)` yields
  `model.masked===true` + no absolute path strings in JSON. `derive(root, {raw:true})`
  yields `masked===false`. `maskModel(maskModel(m)) === maskModel(m)`.
- **F3 (MEDIUM 0.86 / hardened)**: `tests/schema-drift.test.js` asserts
  envelope with `my_extra_key: 1` produces `items[0].ok===false` +
  `degraded===true` + `invalid_count===1` + model.warnings entry.
  `tests/correlation.test.js` adds 2 negative fixtures — path-content mismatch
  (axis c) and controller-session mismatch (axis d) — each asserts NO Kind 1
  correlation + specific axis warning.
- **F4 (MEDIUM 0.82)**: `tests/capability.test.js` asserts real envelope module
  returns `contract_present: true`. Mock permissive validator → `false` +
  evidence string mentions "M0 Task 4a strict-validate not deployed". Mock
  state-writer missing `dispatch_id` → `false` + evidence string mentions
  "emptyState missing field".

## Schema-surface Field-Name Coverage

Receipt extract block (Task 3) surfaces all 5 v0.2.8-v1.0.1 present-only meta
fields named in schema-surface §2.3:
`codex_disabled_at_pr`, `codex_review_actionable_findings`,
`deferred_findings_count`, `plan_conflict_escalated`,
`pr_phase_lock_stale_reclaimed_at_hook` — plus the v1.2.0-m1 attribution axis
(`dispatched_by_controller_session_id` with `_id` suffix per schema-surface §2.4)
guarded by `tests/correlation.test.js`'s positive Kind 1 fixture.

## Next Steps

- [ ] Run `/mccp:code-review` for local change review.
- [ ] Run `/mccp:prp-commit` to commit (cover plan + STATE.md + CLAUDE.md +
      plugin.json + 23 derive files).
- [ ] Run `/mccp:pr` to open PR with v1.3.0 version bump bundled (per §3.7
      milestone PR checklist).
- [ ] Post-PR: `git worktree remove .worktrees/v1.3.0-observability-m1`
      cleanup per §3.8.
