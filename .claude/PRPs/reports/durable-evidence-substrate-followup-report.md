# Implementation Report: durable-evidence-substrate — Phase A follow-up

## Summary

Absorbed the Phase A PR-Codex **No-ship** (R1, 3 actionable) + the Implement-Codex
R1 (No-ship, 3 HIGH) before the branch's first PR. All work folds into the still-
unshipped `1.22.4` (no version bump). The three defects all undercut the evidence
substrate's own guarantee: the audit green-lit the inconsistencies it exists to
expose (F2), the durability step published historical local paths (F1) and was
fail-open before push (F3), and — surfaced across 6 non-converged plan-Codex
rounds — leaking blobs live in unpushed ancestor commits and in committed design
artifacts, not just receipts (F-H/F-I).

**Deliberate stop**: all code + tools are implemented, tested, and dry-run-verified
against the real corpus. The **destructive deployment sequence (Task 6: real-corpus
`--apply`, unpushed-history rewrite, public push)** was NOT executed autonomously —
it is an operator-run mechanical chain culminating in an irreversible public push,
and the runbook is handed off below (see "Next Steps / Task 6 runbook").

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | high (risky rebind) | high — matched |
| New/changed files | 8 (+2 unplanned) | evidence-audit.js, +test; v1.22.4-cwd-rebind.js, +test; **history-leak-scan.js, +test (unplanned but tested — F-H/F-I gate as a lib not inline bash)**; pr.md; cwd-normalization.test.js (fixture leak fixed); CLAUDE.md; CHANGELOG.md |
| Tests | binding + audit | 54 new/changed, all green |
| Gates | plan-Codex divergent | plan + Implement-Codex both No-ship → both absorbed, receipt sealed `divergent` |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | F2 graduated audit states + nonzero exits | [done] | ladder degraded/blind/inconsistent/incomplete/ok (exit 1/2/3/4/0) |
| 2 | F2 tests | [done] | 20 total incl. IF1 advisory/skipped total-agreement cases |
| 3 | F1 cwd-rebind tool | [done] | fail-closed lock + TOCTOU + new→receipt→unlink-old + post-apply scan + exact-manifest gate + IF2 re-read validation |
| 4 | F1 rebind tests | [done] | 16 tests incl. F-A/F-B/F-C/F-D/F-E/F-G |
| 5 | F3 + F1 guard + F-H/F-I pr.md gate | [done] | pr.md fail-closed + history-leak-scan lib (10+1 tests) |
| 6 | run rebind + history rewrite + artifact redaction | **[deferred — operator runbook]** | dry-run verified (33/9/19/E6-excluded); mutation/history-rewrite/push NOT executed (irreversible/outward-facing, user away) |

## Codex-gate absorptions (this cycle)

- **F2** (audit exits 0 on contradiction) → graduated `inconsistent`(3)/`incomplete`(4) states.
- **Implement-Codex IF1** (agreement check only for `converged` ledger verdict) → `verdictsAgree` **total** check; advisory/skipped mismatch now `inconsistent`/nonzero; real corpus regression 0.
- **Implement-Codex IF2** (receipt overwrite not crash-safe) → already atomic (tmp+rename); added post-write re-read validation.
- **F1** (historical absolute cwd published) → cwd-rebind tool; the one sanctioned §3.12 re-seal (rehash + atomic tracked-ledger re-key).
- **F3** (durability fail-open before push) → pr.md evidence-commit fail-closed; block push on commit failure.
- **F-H/F-I + Implement-Codex IF3** (ancestor-commit + non-receipt-artifact leaks) → pre-push all-blob HISTORY-leak gate (`history-leak-scan.js`), repo-root-anchored + separator-flexible (catches JSON double-backslash), line/fixture-specific allowlist (DEFAULT allowlist = the scanner's OWN test fixture, sole entry).

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (node -c) | [done] Pass | all 3 new .js |
| Unit Tests | [done] Pass | 54 new/changed; receipt 442/443 (1 pre-existing skip); completion-ledger 19; no regression |
| Dry-run (real corpus) | [done] Pass | 33 receipts planned, 9 tracked ledger re-keys, 19 dangling untouched, 0 collisions, E6 excluded |
| Live gate (real corpus) | [done] Pass | history-leak-scan flags exactly the 33 committed receipts + Phase A plan (Task 6 targets); own sources clean |

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/evidence-audit.js` | UPDATED (F2 + IF1) |
| `plugins/mccp/scripts/lib/tests/evidence-audit.test.js` | UPDATED |
| `plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js` | CREATED (F1) |
| `plugins/mccp/scripts/migrations/tests/v1.22.4-cwd-rebind.test.js` | CREATED |
| `plugins/mccp/scripts/lib/history-leak-scan.js` | CREATED (F-H/F-I) |
| `plugins/mccp/scripts/lib/tests/history-leak-scan.test.js` | CREATED |
| `plugins/mccp/commands/pr.md` | UPDATED (F1/F3/F-H/F-I Phase 3) |
| `plugins/mccp/scripts/receipt/tests/cwd-normalization.test.js` | UPDATED (fixture latent-leak → synthetic) |
| `CLAUDE.md` | UPDATED (§3.12 sanctioned re-seal) |
| `CHANGELOG.md` | UPDATED (1.22.4 follow-up subsection) |

## Deviations from Plan

- **history-leak-scan as a tested library** (not the plan's inline pr.md bash). Rationale: a security-critical all-blob gate deserves unit tests + a precise, separator-flexible, allowlist-aware implementation rather than an untested regex blob. pr.md invokes it. (Adds 2 unplanned files; plan is already divergent so cross-gate dedupe fail-closes regardless.)
- **cwd-normalization.test.js fixture fix** (not in plan Files to Change). The new gate surfaced a latent repo-root leak in a Phase A test fixture; fixing it to a synthetic path removes the leak at the source (preferable to an allowlist entry).

## Next Steps — Task 6 operator runbook (destructive; run when ready)

The remaining Task 6 chain mutates the tracked corpus, rewrites unpushed history,
and pushes. It was intentionally NOT auto-executed. Run as ONE sequence:

```bash
# 0. confirm plan (already verified): 33 receipts, 9 tracked re-keys, 0 collisions, E6 excluded
node plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js --dry-run

# 1. redact the working-tree corpus (fail-closed lock + TOCTOU + post-apply scan)
node plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js --apply     # exit 0 = clean

# 2. redact committed/committable design artifacts (F-I) — replace <drive>:\...\<repo>
#    absolute paths with placeholders in the Phase A plan + this follow-up plan + the
#    findings report (repo-root + old-repo-name forms).

# 3. rewrite unpushed history so NO commit in origin/main..HEAD leaks (Method A):
git reset --soft origin/main            # un-commits Phase A; working tree (redacted) kept
node plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js --stage      # exact-manifest gate
git commit -m "feat(evidence): durable-evidence-substrate 1.22.4 (redacted corpus + follow-up)"

# 4. MANDATORY pre-push gate — must print leaks=0 before pushing:
node plugins/mccp/scripts/lib/history-leak-scan.js

# 5. push + PR (or run /mccp:pr, whose Phase 3 re-runs steps 1/3.0a + 4 as fail-closed gates)
```

- Idempotent: re-running `--apply` heals any partial state; the post-apply scan +
  exact-manifest gate refuse a bad state before commit.
- Reversible pre-push: `git reflog` restores the pre-rewrite HEAD; nothing is public
  until `git push`.
- The plan is NOT archived to `completed/` yet — Task 6 (history rewrite) references it.
