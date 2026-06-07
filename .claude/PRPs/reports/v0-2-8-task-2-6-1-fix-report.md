# Implementation Report: v0.2.8 Task 2.6.1-FIX

> PR-Codex Round 1 findings absorption on top of commit `ee495bc`.

## Summary

Absorbed all 4 high-priority PR-Codex Round 1 findings (1 CRITICAL + 3 HIGH) into the v0.2.8 Task 2.6.1 PR workflow hardening cycle. F1 hot-fix (hook block in wrong phase) was already in working tree; F2/F3/F4 (lock library defects) implemented in this cycle. 5 MEDIUM/LOW findings deferred to `v0-2-8-task-2-6-1-followup` plan stub; F7 reclassified MEDIUM→HIGH per security-reviewer Round 1 conditional APPROVE.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | HIGH (4 absorbing fixes, holistic lock-lib rewrite, end-to-end token wiring) | HIGH — matched. |
| Confidence | MEDIUM-HIGH (canonical pattern in `v0.2.8-generic-receipt-quarantine.js`) | HIGH on landing — 3 Codex rounds refined the implementation contract before code was written. |
| Files Changed | 4 (hooks.json, pr-phase-guard.test.js, pr-phase-lock.js, pr-phase-lock-boundary.test.js) + pr.md added during R1 absorption | 5 (added pr.md per R1-F2 absorption — heartbeat wiring required) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | F1 hooks.json block PreCompact → PreToolUse + regression tests | Complete (already in working tree from prior session) | 3 invariant assertions: under PreToolUse / NOT under PreCompact / post stays under PostToolUse |
| 2 | F4 cmdEnter wx-exclusive + host + ownership_token + token returned in stdout | Complete | Mirror of `acquireLock` in `v0.2.8-generic-receipt-quarantine.js`. EEXIST → tryReclaimStaleLock → retry once. |
| 3 | F3 host-aware tri-state reclaim policy in cmdDetectStale | Complete | same-host+alive=NEVER / same-host+dead=reclaim / cross-host=mtime-only / zero-byte=mtime-only. Mirror of `tryReclaimStaleLock`. |
| 4 | F3 cmdHeartbeat subcommand (R2-F1) | Complete | Requires --run-id + --ownership-token (R3-F1: no legacy token-less path). Wrong/missing token = exit 15, no utimesSync. |
| 5 | F2 computeMutations head_sha + index_tree diff | Complete | New mutation reasons: head-changed (mid-subphase commit), index-changed (mid-subphase git add). |
| 6 | pr.md token capture + Bash background heartbeat loop + EXIT trap (R1-F2 absorption) | Complete | Heartbeat outside spawnSync window; trap kills + waits on /mccp:pr exit; 4 lock-exit sites updated to pass --ownership-token. |
| 7 | Boundary tests rewrite (d2 → live-PID NOT stale) + 17 new tests for F2/F3/F4 + R2-F1 + R3-F1/F2 | Complete | 24/24 green |
| 8 | Followup plan stub for F5/F6/F7/F8/F9 (F7 reclassified HIGH by SR R1) | Complete | `.claude/plans/v0-2-8-task-2-6-1-followup.plan.md` |

## Codex Convergence (Implement-Codex)

3 rounds, cap-as-converged via textual cleanup:

| Round | Verdict | Findings | Disposition |
|---|---|---|---|
| R1 (thread `019ea0e2...`) | needs-attention | 3 HIGH: F3 PID-only (not host-aware), heartbeat-can't-fit-in-spawnSync, test (d2) contradicts new policy | ABSORB — host-aware policy + Bash background loop + (d2) rewrite |
| R2 (thread `019ea0e8...`) | needs-attention | 1 HIGH: token not propagated end-to-end through enter/heartbeat/exit | ABSORB — enter returns token in stdout; pr.md captures; heartbeat/exit REQUIRE both run-id + token |
| R3 (thread `019ea0f0...`) | needs-attention | 2 HIGH textual contradictions: "legacy token-less path" undermines R2-F1 / F4 step text says detect-stale verifies token but R2-F1 says it doesn't | ABSORB — removed legacy path; F4 step rewritten to clarify cmdExit is ONLY token-verifying subcommand |

## Security-Reviewer (Round 1, agent `ad882abb27571f560`)

**Verdict**: Conditional APPROVE with 2 reclassifications:
- F7 (Bash allowlist comment/chain bypass) reclassified MEDIUM → HIGH — any successful `git commit` mid-Codex-review breaks invariant.
- F5 (lock file mode 0o600) tracked for shared-tenant `ownership_token` exposure.

Both carried into `v0-2-8-task-2-6-1-followup.plan.md`.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | `node -c pr-phase-lock.js` syntax OK |
| Unit Tests (boundary) | Pass | 24/24 — F2 (head-changed/index-changed), F3 (host-aware + heartbeat + token), F4 (wx + token + concurrent) |
| Unit Tests (F1 regression) | Pass | 33/33 — 3 new hooks.json invariant assertions added |
| Build | N/A | Plugin is plain Node files; no bundler |
| Full mccp test suite | 303/307 | 3 pre-existing failures in `g1-patch.test.js` (unrelated — verified by `git stash` re-run on HEAD) |
| Integration | N/A | Live `/mccp:pr` test deferred to PR creation step |
| Edge Cases | Pass | Concurrent enter, dead-pid reclaim, cross-host, zero-byte body, missing token, wrong token, wrong run-id all covered |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/hooks/hooks.json` | UPDATED | F1 — pr-phase-guard:pre block moved PreCompact → PreToolUse |
| `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` | UPDATED | F1 — 3 hooks.json invariant regression tests |
| `plugins/mccp/scripts/lib/pr-phase-lock.js` | REWRITTEN | F2 + F3 + F4 + R2-F1 + R3-F1/F2 — full quarantine canonical pattern adopted; new cmdHeartbeat subcommand |
| `plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js` | REWRITTEN | (d2) rewrite + 17 new F2/F3/F4/token tests |
| `plugins/mccp/commands/pr.md` | UPDATED | R1-F2 absorption — token capture from enter, Bash background heartbeat loop with EXIT trap, --ownership-token added to all 4 exit-call sites |
| `.claude/plans/v0-2-8-task-2-6-1-fix.plan.md` | CREATED | This fix plan (with 3 Codex rounds documented) |
| `.claude/plans/v0-2-8-task-2-6-1-followup.plan.md` | CREATED | Deferred F5-F9 + SR reclassifications |
| `.claude/PRPs/reports/v0-2-8-task-2-6-1-fix-report.md` | CREATED | This report |
| `.claude/state/STATE.md` | UPDATED | Pivot to fix-cycle entry; record convergence + decisions |
| `.claude/receipts/mccp-plan-codex/v0-2-8-task-2-6-1-fix.json` | CREATED | Upstream gate receipt |
| `.claude/receipts/mccp-implement-codex/v0-2-8-task-2-6-1-fix.json` | CREATED | This gate receipt |

## Deviations from Plan

- Added `plugins/mccp/commands/pr.md` to the file-change list per Codex R1-F2 absorption (heartbeat caller wiring). Original plan put pr.md as "caller responsibility, out of file-change list."
- Rewrote test (d2) per Codex R1-F3 absorption — previously asserted `stale:true` for live-PID + old-mtime, now asserts `stale:false` per host-aware policy.
- Did NOT re-run a 4th Codex round after R3 textual cleanup — Phase 2.5.4 3-round cap reached + findings were mechanical text fixes (not architectural divergence). Documented as "CONVERGED via textual cleanup" in plan body.

## Issues Encountered

- **`MCCP_SKIP_RECEIPT=1` env leak**: session-level env block from settings.json caused receipt writes to record `skipped: true`. Worked around with per-command `MCCP_SKIP_RECEIPT="" node ...`. Filed as MEDIUM open question in STATE.md for follow-up.
- **PostToolUseFailure hook noise**: occasional `Read` tool failures (e.g. when reading non-existent `package.json`, or when `hooks.json` exceeded 25k tokens) surfaced as L2b warnings. Worked around with grep + offset reads.
- **Loop warning false positives**: 3 distinct plan edits (R1 / R2 / R3 absorption) flagged as "same parameters" loop. Reviewed each call's content was unique; continued.

## Next Steps

- [ ] `/mccp:prp-commit "..."` — commit F1+F2+F3+F4 + heartbeat wiring + boundary tests + plan/receipts
- [ ] `/mccp:pr` — terminal PR creation gate (will re-invoke PR-Codex; expect R2 approve given R1 findings absorbed)
- [ ] After PR lands: schedule `v0-2-8-task-2-6-1-followup` cycle for F7 (HIGH — Bash allowlist tokenizer) + F5 (MEDIUM — mode 0o600) + F6/F8/F9
