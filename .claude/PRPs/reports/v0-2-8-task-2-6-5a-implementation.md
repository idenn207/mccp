---
report_id: v0-2-8-task-2-6-5a-implementation
plan: .claude/plans/v0-2-8-task-2-6-5a-pr-codex-fixes.plan.md
source_findings: .claude/PRPs/reports/v0-2-8-task-2-6-5a-pr-codex-findings.md
parent_plan: v0-2-8-pr-workflow-hardening
branch: feat/v0-2-8-task-2-6-5-validate-cmd-quarantine
completed_at: 2026-06-06
status: ready-for-r6-reverify
---

# Implementation Report: v0.2.8 Task 2.6.5a — PR-Codex R6 ship-blocker fixes

## Summary

PR-Codex R6 returned `verdict=needs-attention` against Task 2.6.5 with 3 ship-blockers (lock contention, path-containment, tempfail propagation). Task 2.6.5a absorbed these into a converged plan (Plan-Codex R1+R2+R3) and implemented the fixes across **3 source modules + 1 new shared classifier + 5 consumer paths + 7 new test files** in this report cycle. After all tests land, R6 must be re-invoked against the new diff — that is the next gate.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (held — no scope creep) |
| Confidence | High (3 Codex rounds of plan-time absorption) | Confirmed at implement-time — only 1 implementation-time deviation needed (heartbeat shape) |
| Files Changed | 12 (per plan) | 13 — added CLAUDE.md (planned), classify.js (planned), and 1 unplanned helper export (`isSafeGateDir` in `store.js`) |
| New test axes | 16 (i–μ) | 16 axes implemented + 1 unplanned (γ-edge prefix-match defeat case) = 17 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| A1 | Lock rewrite — `wx`-only + ownership token + lease-based reclaim | [done] Complete | **Deviation**: in-loop heartbeat (every 25 renames) replaces plan's `setInterval(15s)` — see §Deviations |
| A2 | Path-containment guard — `store.js` symlink rejection + migration realpath canary | [done] Complete | `assertContained` signature extended to `(receiptPath, expectedGateDir, repoRoot?)` mid-implementation after (β) test caught a tautology in the original signature |
| A3 | Tempfail canonical shape + shared classifier across 5 consumers | [done] Complete | All 5 consumer paths wired: `cli.js`, `preflight.js`, `receipt-prompt.js`, `receipt-skill.js`, `auto-chain.js` |
| A4 | CLAUDE.md §3.3 fail-closed matrix + §4 quarantine runbook step 5 | [done] Complete | `exit 75` row added; runbook step 5 documents lock-token contract |
| A5 | Implementation report | [done] This file | |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (node syntax) | [done] Pass | `node --test` boots all files without syntax error |
| Unit Tests (A1) | [done] Pass | 17/17 axes — existing (a–h3) + new (i–o) |
| Unit Tests (A2) | [done] Pass | 4/4 axes — (α) symlink rejection (Windows junction worked w/o admin), (β) out-of-tree canary, (γ) normal, (γ-edge) prefix-match defeat |
| Unit Tests (A3) | [done] Pass | 14 axes total — classify (ι.a–f), precedence (η/θ), propagation (δ/ε/ζ), hooks (κ/λ), auto-chain (μ) |
| Full Receipt + Migration Suite | [done] Pass (260/260 with clean env) | 30 pre-existing failures observed under user shell env, root cause: `MCCP_SKIP_RECEIPT=1` env leakage into `cli.js write` — unrelated to this task |
| Build | N/A | This is a Node-direct project (no transpile step) |
| Integration (real `/mccp:pr` happy path) | Deferred to R6 re-verification | R6 is the canonical ship-readiness gate against the new diff |

## Files Changed

| File | Action | Lines (approx) |
|---|---|---|
| `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | UPDATE | +120 / -25 (lock rewrite, heartbeat, token, path-containment helper) |
| `plugins/mccp/scripts/receipt/store.js` | UPDATE | +30 / -4 (`isSafeGateDir` helper + symlink rejection in `listReceipts` / `listGenericReceipts`) |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | +9 / -1 (top-level `tempfail`/`exitCode` + `kind: "tempfail"` in blocking) |
| `plugins/mccp/scripts/receipt/classify.js` | CREATE | +50 (new shared helper) |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | +15 / -2 (classify wiring with fail-open load) |
| `plugins/mccp/scripts/receipt/preflight.js` | UPDATE | +25 / -5 (classify wiring + TEMPFAIL label + writeBlockReason kind dispatch) |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | +25 / 0 (tempfail → ALLOW + retry systemMessage path) |
| `plugins/mccp/scripts/hooks/receipt-skill.js` | UPDATE | +25 / 0 (same pattern as receipt-prompt) |
| `plugins/mccp/scripts/lib/auto-chain.js` | UPDATE | +30 / -5 (`receipt-tempfail` reason trigger + `TEMPFAIL_EXIT=75` + machine-readable stdout JSON) |
| `plugins/mccp/scripts/migrations/tests/v0.2.8-generic-receipt-quarantine.test.js` | UPDATE | +210 / -25 (7 new axes + 3 existing axes re-signed) |
| `plugins/mccp/scripts/migrations/tests/path-containment.test.js` | CREATE | +135 (4 axes incl γ-edge) |
| `plugins/mccp/scripts/receipt/tests/classify.test.js` | CREATE | +55 (6 axes) |
| `plugins/mccp/scripts/receipt/tests/tempfail-propagation.test.js` | CREATE | +110 (3 axes) |
| `plugins/mccp/scripts/receipt/tests/tempfail-precedence.test.js` | CREATE | +55 (2 axes) |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-tempfail.test.js` | CREATE | +75 |
| `plugins/mccp/scripts/hooks/tests/receipt-skill-tempfail.test.js` | CREATE | +75 |
| `plugins/mccp/scripts/lib/tests/auto-chain-tempfail.test.js` | CREATE | +80 |
| `CLAUDE.md` | UPDATE | +9 / -0 (§3.3 tempfail row, §4 runbook step 5) |

## Deviations from Plan

### Deviation 1 — Heartbeat shape: `setInterval(15s)` → in-loop `fs.utimesSync` every 25 renames

**What changed**: Plan §A1 specified `setInterval(() => fs.utimesSync(lockPath, now, now), HEARTBEAT_INTERVAL_MS=15s)` registered immediately after `acquireLock` and cleared in `finally` before `releaseLock`. Implementation uses an in-loop counter: after every `HEARTBEAT_BATCH_SIZE=25` rename ops, call `refreshLockHeartbeat(repoRoot)` which is a thin wrapper around `fs.utimesSync(lockPath, now, now)`. No `setInterval`, no async migrate(), no setImmediate yield.

**Why**: Node `setInterval` callbacks only fire when control returns to the event loop. `migrate()` is synchronous and runs without yielding — so a registered `setInterval(15s)` would never actually refresh the lock during a long sync migration. The plan's R2 absorption note recognized this and accepted "async migrate()" as the cascade cost. However, making `migrate()` async cascades to `validateCommand` (called sync from 5 consumer paths: cli/preflight/receipt-prompt/receipt-skill/auto-chain). That cascade conflicts with A3's classifier wiring (which assumes sync `validateCommand`). The in-loop counter is functionally equivalent — mtime stays fresh during the rename loop — and avoids the cascade entirely.

**Risk mitigation**: Axis `(n)` directly verifies `refreshLockHeartbeat` advances lock mtime forward. Axis `(o)` runs the full-matrix migration (GATE_IDS × {default, main} = 16 receipts) and asserts it completes well under `LEASE_TTL_MS / 2` (30 seconds) — actual measured runtime: ~0.4 seconds. The defensive `setImmediate` yield discussed in plan §A1 is not needed because no realistic single-migrate() call approaches even half of LEASE_TTL.

### Deviation 2 — `assertContained` signature: `(path, gateDir)` → `(path, expectedGateDir, repoRoot?)`

**What changed**: Initial implementation matched the plan exactly: `assertContained(receiptPath, gateDir)` where `gateDir = path.dirname(receipt.path)`. The path-containment test axis `(β)` caught the tautology — receipt's own dirname is always its parent, so the prefix check always passes for synthetic receipts pointing outside the repo. The corrected signature passes `expectedGateDir = path.join(repoRoot, '.claude/receipts', receipt.gate_id)` and (optionally) `repoRoot` for the additional check that the resolved gate dir falls under `<repoRoot>/.claude/receipts/`.

**Why**: The intent of the plan note "Also assert resolvedGateDir.startsWith(realpath(<repoRoot>/.claude/receipts) + sep)" required the function to know repoRoot. The first implementation missed this. Test (β) caught it — exactly the regression coverage axis the plan absorbed.

**Risk mitigation**: No additional risk — the corrected signature is strictly more restrictive than the planned shape. Migration call site updated to pass repoRoot. Tests (β) and (γ-edge) confirm the prefix-match edge cases are closed.

## Absorption Notes for Implementation-Codex Round

This Task 2.6.5a implementation entered Phase 2.5 with **cross-gate dedupe applied** (Phase 2.5.1) — the plan body's R1+R2+R3 Plan-Codex absorption text was treated as the decision audit trail. No Implement-Codex R-loop was invoked because no new implement-time decisions were introduced beyond the two deviations documented above (both decided unilaterally within the plan's `### Handling Deviations` allowance and recorded in this report).

Security-reviewer (Phase 2.5.5) was invoked via Task tool subagent for A1 token + A2 path containment. Verdict: APPROVE-WITH-CAVEATS. Caveats covered:
1. Token field MUST be added to lock body — landed in A1.
2. Mandatory heartbeat MUST be wired — landed in A1 (as in-loop counter per Deviation 1).
3. Symlink rejection MUST be added to `listGenericReceipts` — landed in A2.
4. Schema-level concern about `blocking[].kind = "tempfail"` — false alarm (schema.js validates receipt JSON on disk; `result.blocking[]` is runtime in-memory only). Resolved at review-absorption time.

Impeccable design review (Phase 2.5.5b) detected `skill_available: false` — strict skip with `IMPECCABLE_SKIPPED_REASON="skill-missing"`. Receipt records `meta.impeccable_skipped=true`. Downstream `/mccp:pr` will block on this; operator may install impeccable plugin OR pass `MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<substantive reason>"` at PR time. This is independent of design relevance — implementation has no UI surface anyway.

## Environment-Leakage Observation (Test Run Note)

Full suite run under user's shell environment produced 30 failures concentrated in pre-existing tests that write receipts via `cli.js write`. Root cause: user's dev environment has `MCCP_SKIP_RECEIPT=1`, `MCCP_FORCE_PR_WITHOUT_IMPECCABLE=<reason>`, `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER=<reason>` as **persistent** env vars (intended for streamlined dev cycles), not one-shot. When `cli.js write` runs inside a test, these env vars leak into the receipt's `meta.skipped` / `meta.security_force_override` axes — making the test's expected fields wrong.

Same suite run with `env -u MCCP_SKIP_RECEIPT -u MCCP_FORCE_PR_WITHOUT_IMPECCABLE -u MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`: **260/260 pass**. This is a pre-existing observability gap in the dev environment (not in the code under test), not introduced by Task 2.6.5a. Filing as a follow-up note for the test harness — consider having tests internally unset bypass env vars before spawning subprocess CLI calls.

## Tests Written

| Test File | Axes | Coverage |
|---|---|---|
| `v0.2.8-generic-receipt-quarantine.test.js` (extended) | (i)–(o) | Lock token + lease-based reclaim + in-loop heartbeat + sync-loop guard |
| `path-containment.test.js` (new) | (α), (β), (γ), (γ-edge) | Symlink rejection + realpath canary + prefix-match edge |
| `classify.test.js` (new) | (ι.a)–(ι.f) | Shared classifier — all 3 kinds + impossible-case + null/undefined defensive + fail-closed unknown |
| `tempfail-propagation.test.js` (new) | (δ), (ε), (ζ) | cli + preflight exit 75 + non-tempfail regression |
| `tempfail-precedence.test.js` (new) | (η), (θ) | Mixed-case precedence + shape invariant |
| `receipt-prompt-tempfail.test.js` (new) | (κ) | UserPromptExpansion hook tempfail → ALLOW + retry systemMessage |
| `receipt-skill-tempfail.test.js` (new) | (λ) | PreToolUse(Skill) hook tempfail → ALLOW + retry systemMessage |
| `auto-chain-tempfail.test.js` (new) | (μ) | auto-chain check → exit 75 + machine-readable retry signal |

## Issues Encountered

1. **(β) test caught a tautology in `assertContained`** — see Deviation 2. Fix landed; new axis pins the corrected behavior.
2. **Environment-variable leakage in full suite** — see §Environment-Leakage Observation. Not a code issue; documented for follow-up.

No issues required code rollback or scope expansion.

## Next Steps

- [ ] **R6 re-verification (BLOCKING — ship invariant)**: PR-Codex must be re-invoked against the new diff via `node scripts/lib/codex-invoke.js adversarial-review --focus "<diff summary A1+A2+A3>"`. The original R6 Codex thread (`019e9cc3-f470-7382-8c74-f05c30591c0f`) referenced in focus prompt for continuity. PR creation for v0.2.8 remains blocked until R6 returns `verdict=approve`.
- [ ] Optional follow-up: have the receipt CLI internally unset `MCCP_SKIP_RECEIPT` / `MCCP_FORCE_PR_WITHOUT_*` when invoked from test harness (avoid env leakage) — out of scope for this report.
- [ ] Commit + PR via `/mccp:prp-commit` and `/mccp:pr` after R6 re-verification approves.
