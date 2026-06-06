# PR-Codex R6 Findings — Task 2.6.5 implementation

**Cycle**: v0.2.8 Task 2.6.5 PR-Codex R6 (= plan acceptance line 328 "R6 verification BLOCKING — ship invariant")
**Date**: 2026-06-06
**Branch**: `feat/v0-2-8-task-2-6-5-validate-cmd-quarantine` vs `origin/main`
**Codex thread**: `019e9cc3-f470-7382-8c74-f05c30591c0f`
**Duration**: 297.9s
**Classification**: ok / blocking=false (transport-level OK)
**Verdict**: **needs-attention**
**Summary**: *"No-ship: the migration adds unsafe filesystem behavior and the advertised tempfail semantics do not survive the validate/preflight call path."*

PR-Codex R6 was the planned ship-readiness gate for Task 2.6.5. It found 3 ship-blockers the Implement-Codex R5 absorption-text review missed. **PR NOT created** — moving to Task 2.6.5a fix-cycle.

---

## Finding 1 — HIGH (0.82) — Migration can rename outside the repo

**File**: `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js:175-184`

The migration trusts `receipt.path` and blindly renames it. That path comes from receipt-store directory scanning, where gate directories are treated as directories via `statSync`, which follows symlinks/junctions. A repository can make `.claude/receipts/mccp-plan-codex` point outside the worktree; the auto-triggered migration will then rename an external `default.json` or `main.json` to `.legacy*` before any receipt/schema validation. This is a new path-normalization attack surface with data-loss impact.

**Recommendation**: Before renaming, use `lstat`/`realpath` to reject symlinked or junctioned receipt gate directories and enforce that resolved source and target paths remain under `<repoRoot>/.claude/receipts/<gate>`; add a symlink/junction regression test.

## Finding 2 — HIGH (0.86) — Lock can be stolen while live

**File**: `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js:93-140`

The lock is created with `openSync('wx')` and then populated in a separate write. A contending process that observes the just-created empty or partially written lock will parse it as invalid and immediately unlink it. Separately, any lock older than 60s is reclaimed even when the PID is still alive. Because `releaseLock` unlinks the path without checking ownership, a stale original holder can also delete a newer holder's lock. That breaks the winner/loser invariant and can run multiple migrations concurrently instead of forcing bounded-poll loser semantics.

**Recommendation**: Treat unparsable locks as held until their file mtime exceeds the stale threshold, do not reclaim age-stale locks while the recorded same-host PID is alive, and include a unique token in the lock body that `releaseLock` verifies before unlinking.

## Finding 3 — MEDIUM (0.9) — Tempfail exit is not propagated

**File**: `plugins/mccp/scripts/receipt/validate-cmd.js:90-99`

On migration timeout, `validateCommand` hides `EX_TEMPFAIL` inside a blocking entry and returns a normal `ok=false` validation result. The existing CLI/preflight callers convert any `ok=false` result to exit 2, so the advertised EX_TEMPFAIL-on-timeout behavior is lost outside the standalone migration CLI. Automation cannot distinguish a transient lock wait from a real gate failure, which makes retries and recovery unreliable.

**Recommendation**: Return a top-level `exitCode` or `tempfail` field from `validateCommand` and update `receipt/cli.js` and `receipt/preflight.js` to exit 75 for this case; cover both validate and preflight with tests.

## Next Steps (Codex)

1. Block release until path containment and lock ownership are fixed.
2. Add regression coverage for symlink/junction receipt dirs, live-lock contention, and validate/preflight exit 75 propagation.

---

## Task 2.6.5a — proposed fix cycle scope

Three discrete fixes, each with regression test before merge:

| Fix | Files | Test |
|---|---|---|
| (a) **lstat/realpath path-containment guard** in `listGenericReceipts` and migration rename loop. Reject symlinked/junctioned gate dirs; assert resolved paths under `<repoRoot>/.claude/receipts/<gate>` | `plugins/mccp/scripts/receipt/store.js`, `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | `path-containment.test.js` — symlink/junction fixture rejected; resolved path canary outside `.claude/receipts/<gate>` → throw |
| (b) **Lock ownership token + stricter stale criterion** — write unique token in single `writeFileSync` (replace `wx` + separate populate), `releaseLock` verifies token before unlink, stale reclaim requires (PID dead) **AND** (mtime > threshold), unparsable locks treated as held until mtime exceeds threshold | `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | `lock-ownership.test.js` — (1) live-lock steal attempted, rejected; (2) age-stale + pid-alive lock NOT reclaimed; (3) unparsable lock respected until mtime expires |
| (c) **Tempfail exit propagation** — `validateCommand` returns `{ ok, exitCode?, tempfail? }`. `receipt/cli.js` + `receipt/preflight.js` propagate `tempfail=true` → exit 75 | `plugins/mccp/scripts/receipt/validate-cmd.js`, `plugins/mccp/scripts/receipt/cli.js`, `plugins/mccp/scripts/receipt/preflight.js` | `tempfail-propagation.test.js` — validate-cmd + preflight both exit 75 on poll timeout |

Suggested order: (b) → (a) → (c) (lock is the highest-risk concurrency bug, containment is the highest-impact data-loss bug, tempfail is the simplest exit-code change).

After fix: invoke `/mccp:plan` to wrap as `Task 2.6.5a` (or absorb into existing plan as a new finding under `## Codex Implementation Review` since Implement-Codex R5 marked Task 2.6.5 "mechanically closed" but the actual code drift these findings expose was outside review scope).

## Audit trail

- Codex raw JSON: `.git/mccp/tmp/pr-codex-r6-result.json` (3754 bytes, branch-local, ephemeral)
- Codex stdout wrapper: `.git/mccp/tmp/codex-invoke.stdout.json` (same call, full wrapper output)
- Receipt status: **NOT WRITTEN** — Phase 2.5.7 skipped because Phase 2.5.6 determined ship-blocker findings. No `.claude/receipts/mccp-pr-codex/v0-2-8-pr-workflow-hardening.json` written this cycle.
- PR status: **NOT CREATED** — Phase 3 / Phase 4 skipped. No `gh pr create` call made.
- Working tree: clean (STATE.md timestamp cosmetic only).
