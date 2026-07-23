---
status: proposed
decision: durable-evidence-substrate-followup
---

# durable-evidence-substrate — Phase A follow-up (PR-Codex No-ship absorption)

## Summary

Absorb the three actionable findings from the Phase A PR-Codex **No-ship** (round 1)
before the branch's first PR. All work folds into the still-unshipped `1.22.4`
(Phase A's PR was halted, so no version bump — this completes 1.22.4, it does not
start a new milestone):

- **F1 (HIGH)** — the 33 git-tracked ship receipts all carry an absolute `meta.cwd`
  (many leak the **old repo name** `my-claude-code-plugin`), and Phase 3
  stages the receipt directory wholesale, so `git push` publishes those local paths
  into public history irreversibly. Fix by **pulling the Phase B rebind forward**:
  redact each receipt's `cwd` to repo-relative AND atomically re-key the **git-tracked**
  ledger entries bound to it, so the ledger↔receipt binding is preserved (no dangling, no
  duplicate) while the leak is removed. The re-key set is **tracked-only** (Codex R1 F-A:
  the untracked E6 entry is hash-bound and would otherwise be mutated), and a **mandatory
  fail-closed post-apply invariant scan** proves no new dangling/duplicate binding before the
  corpus may be committed (Codex R1 F-B: the cross-file rewrite is not itself crash-atomic).
  **Plan-Codex ran 5 rounds on F1 and did not converge** — it hardened the working-tree tool
  substantially (F-A tracked-only filter, F-B crash-safety + lock, F-C index-independent scan,
  F-D fail-closed lock, F-E/F-F/F-G exact-manifest staging gate) and then surfaced a
  **fundamental new axis in R5 (F-H, verified)**: working-tree redaction never removes the
  leaking blobs already in the unpushed Phase A ancestor commits, so a pre-push **history**
  gate + an unpushed-history rewrite are required. The history-rewrite strategy is now
  **RESOLVED** (Method A: `reset --soft origin/main` + rebind + re-commit; ordering ii; ledger
  `commit_sha` reconciliation moot — measured 0 refs; see `## F-H Resolution`). A self-caught
  §3.12 reconciliation (F1 is the sanctioned re-seal §3.12 anticipated) adds a `CLAUDE.md` edit.
- **F2 (HIGH)** — `evidence-audit.js` returns `state:"ok"` + exit 0 for any comparable
  pair once parsing succeeds, so a `false_positive` (ledger says converged, receipt
  says divergent) or a broken hash binding still green-lights. Introduce non-ok states
  + nonzero exits for the integrity violations the tool exists to expose.
- **F3 (HIGH)** — the Phase 3 evidence-commit is fail-open: a failed `git commit`
  only warns, then pushes anyway, leaving receipts working-tree-only and recreating
  the blind-audit failure Phase A closes. Middle-ground fix: keep PR creation
  unblocked, but **block the push** when the evidence-commit failed.

F4 (MEDIUM, PR-not-idempotent-after-evidence-push) is already documented+accepted
(§203) and its `[MCCP-PUSH-HALT]` wording was reconciled this cycle — out of scope
here; a resume-path is optional hardening deferred to backlog.

Findings source-of-truth: `.claude/PRPs/reports/durable-evidence-substrate-pr-codex-findings.md`.

## Problem / Context

Phase A made ship receipts a git-tracked audit corpus (evidence durability, E1/E5).
The dogfood PR-Codex run on that change surfaced that the durability mechanism (a)
publishes historical local paths (F1), (b) is verified by an audit tool that
green-lights the exact inconsistencies it should expose (F2), and (c) is itself
fail-open before push (F3). All three undercut the substrate's own guarantee, so
they must be closed before the corpus is pushed to a shared remote.

**Empirical scope (measured 2026-07-22, re-verified this gate)**: 33 tracked ship receipts,
all with absolute `meta.cwd` (21 leak the old repo name `my-claude-code-plugin`, 12 the
current `mccp`). 29 ledger files; **10** are hash-bound to a ship receipt
(`entry.receipt_hash === receipt.receipt_hash`), of which **9 are git-tracked** and **1 is
the untracked E6 entry** (`live-activation-m3-pr-codex-absorption__c8b9175d489a.json`,
excluded from re-key — Codex R1 F-A); 23 receipts are unbound; 19 ledger entries reference
hashes with no matching tracked receipt (**pre-existing dangling** — a separate data-quality
issue, NOT created by this PR and NOT in scope to repair). F1 rebind must preserve the **9
tracked live bindings** and create **zero new dangling entries among tracked ledger files**
(the untracked E6 becoming locally dangling is accepted — Phase B).

## Patterns to Mirror

| Concern | Mirror | Why |
|---|---|---|
| cwd normalization | `receipt/write.js#normalizeReceiptCwd` | already the canonical repo-relative + `<outside-repo>` mapper; reuse verbatim (do NOT reimplement) |
| receipt hashing | `receipt/hash.js#receiptHash` | canonical digest incl. `meta.cwd` (no carve-out — §3.12); the rebind's whole point is to recompute it |
| ledger id derivation | `lib/completion-ledger/store.js#entryId` | `<decision>__<hash[sans sha256:][:12]>` — rebind MUST derive the new filename identically |
| ledger entry schema | `store.js#validateEntry` (`KNOWN_ENTRY_KEYS`) | strict schema; the rebind rewrites entries and must keep them valid |
| migration tool shape | `scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | dry-run default, `--apply`, idempotent, atomic tmp+rename, loud fail-closed |
| audit state precedence | `lib/evidence-audit.js#audit` (existing `blind`/`degraded`) | extend the precedence ladder, don't rewrite it |

## Files to Change

Full repo-root paths (per CLAUDE.md §1.2 P1 — enables cross-gate dedupe at PR):

| Path | Action | For |
|---|---|---|
| `plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js` | CREATE | F1 — cwd redaction + atomic ledger re-key tool |
| `plugins/mccp/scripts/migrations/tests/v1.22.4-cwd-rebind.test.js` | CREATE | F1 — rebind correctness + idempotency + binding-preservation |
| `plugins/mccp/scripts/lib/evidence-audit.js` | UPDATE | F2 — non-ok states (`inconsistent`/`incomplete`) + nonzero exits |
| `plugins/mccp/scripts/lib/tests/evidence-audit.test.js` | UPDATE | F2 — assert false_positive / hash_bound<comparable / unverifiable FAIL |
| `plugins/mccp/commands/pr.md` | UPDATE | F3 — block push on evidence-commit failure; F1 — pre-commit absolute-cwd guard; **F-H — pre-push HISTORY-leak gate (scan `origin/main..HEAD` receipt blobs)** |
| `.claude/receipts/mccp-pr-codex/*.json` | REWRITE (via tool) | F1 — 33 receipts, cwd → repo-relative, hash recomputed |
| `.claude/state/completion-ledger/*.json` | REWRITE (via tool) | F1 — **9 tracked** bound entries re-keyed (filename + `entry.receipt_hash`); untracked E6 excluded |
| `CHANGELOG.md` | UPDATE | note the follow-up absorption under the unshipped 1.22.4 row |
| `CLAUDE.md` | UPDATE | §3.12 — document the v1.22.4 cwd-rebind as the one sanctioned re-seal (rehash + atomic ledger re-key); no-rehash invariant still holds for all other writers |

**No `plugin.json` bump** — 1.22.4 is unshipped; this completes it (§3.7: a bump is
per-ship, and Phase A + this follow-up ship together as one 1.22.4 PR).

## Step-by-Step Tasks

Order: F2 first (contained, low-risk, no corpus mutation) → F1 (the risky rebind) →
F3 (small pr.md edit). Validate after each.

### Task 1 — F2: graduated audit states + nonzero exits

MIRROR: `evidence-audit.js#audit` existing `blind`/`degraded` precedence.

1. Extend the state precedence ladder (most-severe first), keeping `blind`/`degraded`:
   - hard read error → `degraded` (exit 1) — unchanged.
   - `comparable === 0` (and no read error) → `blind` (exit 2) — unchanged.
   - **NEW** `false_positive > 0` OR `hash_bound < comparable` → `inconsistent` (exit 3)
     — a comparable pair that JOINED by decision_id but disagrees on verdict or
     hash binding is a real integrity violation.
   - **NEW** `unverifiable > 0` (ledger entry, no matching receipt = coverage gap) →
     `incomplete` (exit 4) — distinct, softer than `inconsistent` but still non-ok.
   - `parse_failures > 0` → `degraded` (exit 1) — unchanged.
   - else → `ok` (exit 0).
2. `inconsistent` outranks `incomplete` outranks `degraded`-from-parse when several hold
   (most-severe wins); document the exact ordering in a header comment.
3. CLI: emit a per-state loud stderr line + the corresponding exit code. Keep `--json`
   shape additive (new `state` enum values only — no field removals).
4. **Expected-and-honest**: on the *current* repo the audit will now report `incomplete`
   (19 pre-existing dangling ledger entries → `unverifiable`) and possibly `inconsistent`.
   That is the tool working as intended, not a regression — the plan explicitly accepts
   a non-zero audit exit on today's corpus. Repairing the 19 dangling entries is a
   separate data-quality axis (out of scope).

### Task 2 — F2 tests

MIRROR: existing `evidence-audit.test.js` `mkTree` fixture builder.

- `inconsistent`: `false_positive > 0` → `state==='inconsistent'`, exit-code oracle nonzero.
- `inconsistent`: `hash_bound < comparable` (comparable pair, mismatched hash) → `inconsistent`.
- `incomplete`: `unverifiable > 0`, zero false_positive → `state==='incomplete'`, nonzero.
- precedence: `false_positive>0` AND `unverifiable>0` → `inconsistent` (most-severe wins).
- regression: a fully-clean bound corpus still → `ok` exit 0 (no false alarm).
- `blind`/`degraded` unchanged (keep existing assertions green).

### Task 3 — F1: cwd-rebind tool

CREATE `scripts/migrations/v1.22.4-cwd-rebind.js`. MIRROR the quarantine migration's
dry-run/apply/idempotent/atomic shape. Reuse `normalizeReceiptCwd`, `receiptHash`,
`entryId`.

Algorithm (fail-closed, all-or-nothing per run; guarded by a migration lock):

1. **Acquire a dedicated FAIL-CLOSED migration lock (Codex R1 F-B + R2 F-D)** — before any
   read/plan, take a single-writer lock. Mirror only the *shape* of `store.js#withLedgerLock`
   (`fs.openSync(lock, 'wx')`, PID+ISO body, stale reclaim at 30s) — **NOT its behavior**:
   `withLedgerLock` is fail-OPEN (it warns `proceeding without lock` and continues, store.js
   L180-183), which would preserve the exact race window this lock must close. This migration
   flips that branch: **if acquisition fails after bounded retries (contended, or a live
   non-stale holder), exit non-zero BEFORE planning or writing** — never proceed unlocked.
   Release in `finally`. **Scope of this lock is honest and narrow (Codex R2 F-F)**: it
   serializes rebind-vs-rebind only. Normal `writeReceipt`/`writeEntry` writers do NOT take
   this lock (making every corpus writer share it is an invasive, out-of-scope change), so a
   concurrent gate write could still land during the migration. That residual is closed
   **mechanically at staging time, not by the lock** — the post-stage cached-set allowlist
   gate (step 8) refuses the commit if ANY staged path/hash is outside the in-memory plan, so
   a stray concurrent write is detected and the operator re-runs (idempotent). The lock
   prevents the common case (double-run); the allowlist gate is the guarantee.
2. **Plan phase (pure, no writes)** — enumerate `.claude/receipts/mccp-pr-codex/*.json`.
   For each receipt:
   - `newCwd = normalizeReceiptCwd(meta.cwd, repoRoot)`.
   - If `newCwd === meta.cwd` → already relative → skip (idempotency).
   - Else clone, set `meta.cwd = newCwd`, `newHash = receiptHash(clone)`; record
     `{ file, oldHash, newHash, clone }`.
3. **Binding index (pure, TRACKED ledger files only — Codex R1 F-A)** — enumerate the ledger
   dir but **filter to git-tracked files** (one `git ls-files .claude/state/completion-ledger/`
   set; a file absent from it is untracked → excluded). Over the tracked set, map
   `oldHash → [trackedLedgerFile...]` via `entry.receipt_hash`, reading RAW (no dedup — a
   decision may have N files). **The untracked E6 entry
   `live-activation-m3-pr-codex-absorption__c8b9175d489a.json` is git-untracked and
   hash-bound (`c8b9175d489a…`) to its tracked receipt — the original algorithm would have
   re-keyed/unlinked it, violating safety invariant (a). The tracked-only filter is what
   makes invariant (a) actually hold.** Its bound receipt is still redacted (it is tracked +
   leaks the current repo path), which leaves E6 pointing at the old hash = **locally
   dangling**; that is accepted (E6 is already Phase-B poison, local-only, never pushed — see
   §Out of Scope). This is the whole point: **re-key only what is pushed; never mutate
   untracked local ledger state.** Empirically (2026-07-22): **9 tracked bound entries** are
   re-keyed; the 1 untracked bound entry (E6) is excluded.
4. **Pre-flight validation (fail-closed — abort whole run, write nothing)** if any of:
   - a computed `newHash` collides with a *different* receipt's hash (would merge identities);
   - a target ledger filename `<decision>__<newHash[:12]>.json` already exists AND is not
     the same tracked entry being re-keyed (collision);
   - `normalizeReceiptCwd` returned an absolute path or empty (must be `.`, a relative
     path, or `<outside-repo>` — never a leak).
5. **Apply phase (`--apply` only; default dry-run prints the plan)** — per receipt, in a
   **crash-recoverable order (Codex R1 F-B)**. Immediately before writing, **re-read the
   on-disk receipt and assert its hash still equals the planned `oldHash`** (a TOCTOU guard —
   abort the whole run if it changed under us). Then, per receipt:
   a. For each bound TRACKED ledger file: clone the entry, set `entry.receipt_hash = newHash`,
      `validateEntry`, write the NEW-named file (`entryId`) — **do not unlink the old file yet**.
   b. Write the redacted receipt with `newHash` **via direct `fs.writeFileSync`** (atomic
      tmp+rename), NOT `store.writeReceipt` — the overwrite guard forbids a tracked-hash
      change, but this IS the one sanctioned rebind and it re-keys the binding atomically
      per file (guard's E4 concern satisfied). Document this bypass loudly in the tool header.
   c. Now unlink each OLD-named ledger file.
   Ordering rationale: **new-ledger → receipt → unlink-old** means every crash window leaves
   an over-count with at least one intact binding, never a missing one. A crash after (a)
   leaves old-receipt(oldHash) + old-ledger(oldHash, still bound) + new-ledger(newHash,
   dangling); a crash after (b) leaves new-ledger(newHash, bound) + old-ledger(oldHash, now
   dangling). Both are healed by an idempotent re-run and are caught by step 7 **before
   anything is committed**. (This closes the receipt-first gap: the original order rewrote the
   receipt before its ledger, so a crash between left the ledger pointing at a hash no
   receipt had — a real dangling window.)
6. **Idempotency** — a second `--apply` finds every cwd already relative → 0 changes.
7. **Post-apply invariant scan — SELF-CONTAINED, fail-closed, MANDATORY before commit (Codex
   R1 F-B + R2 F-C)** — the scan must NOT re-query `git ls-files` here: immediately after the
   fs rename, the new-named ledger files are untracked-in-index and the old tracked paths are
   index-deleted, so an index-based "tracked corpus" scan would exclude the very new bindings
   it must verify (R2 F-C). Instead the scan is driven by the tool's **in-memory plan** —
   the exact `{ oldName → newName }` rename map + redacted-receipt set from steps 2-3 — and
   re-reads **disk**. Assert, else **exit non-zero and refuse to signal the corpus is
   committable**: (i) each of the 9 new-named ledger files exists on disk and its
   `entry.receipt_hash` equals its receipt's new hash (the 9 bindings preserved); (ii) each
   old-named ledger file is gone (no leftover old+new duplicate); (iii) **zero NEW dangling
   among the intended tracked set** (pre-run tracked ledger basenames with the 9 renames
   applied — the untracked E6 is not in this set, so its post-redaction local dangling does
   not count). This is the crash-safety backstop — a partial state cannot reach `git push`
   because Task 6 runs this scan and only stages/commits on a clean exit.
8. **Explicit planned-path staging + mandatory post-stage allowlist gate (Codex R2 F-C + R3
   F-E + R3 F-F)** — the rename made the new ledger files untracked and index-deleted the old;
   the scan (step 7) is disk-based so it is correct now, but the *index* is not yet consistent.
   Staging must be **explicit from the in-memory plan — NEVER `git add -A .claude/state/
   completion-ledger/`**, because whole-directory staging would sweep in the untracked E6
   entry the scan deliberately excluded (R3 F-E), re-publishing exactly what §Out-of-Scope
   defers to Phase B. Instead the tool emits (or Task 6 runs) the exact staged set:
   `git add -u .claude/receipts/mccp-pr-codex/ .claude/state/completion-ledger/` (records the
   receipt rewrites + the 9 old-ledger deletions) **plus** an explicit `git add --` of only the
   9 planned new-named ledger files. Then a **mandatory post-stage EXACT-MANIFEST gate (Codex
   R3 F-F + R4 F-G)** — an allowlist (reject out-of-plan paths) is NOT sufficient, because a
   concurrent `writeEntry` (outside the migration lock) can recreate one of the 9 unlinked old
   ledger files between the scan and staging: if the recreated content matches HEAD, `git add
   -u` silently skips the planned deletion (old file survives → duplicate/dangling); if it
   differs, an allowlist still passes it (R4 F-G). So the gate asserts the staged index is
   **EXACTLY** the planned manifest, no more and no less: `git diff --cached --name-status`
   must equal precisely the 33 receipt paths as `M`, the 9 old-named ledger paths as `D`, and
   the 9 new-named ledger paths as `A` — every planned deletion present, every status correct,
   and each staged blob hash matching the expected redacted-receipt / new-ledger content. Any
   missing deletion, wrong status, unexpected extra path (E6 or a concurrent writer's change),
   or content mismatch → **abort before commit** (unstage + non-zero exit). This exact
   manifest subsumes the allowlist and is the terminal guarantee: only the exact in-memory
   planned set, with the exact intended statuses/content, can reach the commit. The optional
   `--verify` subcommand runs this manifest check. pr.md's Task 5 guard stays the cheap
   absolute-cwd assertion (it has no rebind plan in context and must not attempt this scan).
9. **Safety invariant (restated)** — the tool NEVER writes/renames/unlinks: (a) any
   git-untracked ledger file (the E6 entry — enforced by step 3's tracked-only filter, not
   merely asserted), (b) the 19 pre-existing dangling ledger entries (no matching receipt →
   no `oldHash` key → never visited).

### Task 4 — F1: rebind tests

CREATE `scripts/migrations/tests/v1.22.4-cwd-rebind.test.js`. Temp-repo fixtures:

- bound pair (receipt + **tracked** ledger entry, absolute cwd) → `--apply` → receipt cwd is
  `.`/`<outside-repo>`, receipt_hash changed, ledger file renamed to new hash, internal
  `entry.receipt_hash` updated, **binding still holds** (new hashes equal).
- old-repo cwd (bare token `my-claude-code-plugin`, repoRoot = different) → `<outside-repo>`
  (no path leaked). Construct fixture paths in JS (never via a bash heredoc — Windows `\`
  literals collapse in the Bash tool, see [[bash-tool-backslash-collapse]]); the assertion is
  platform-aware because `path.relative`/`isAbsolute` differ on POSIX vs win32.
- unbound receipt (no ledger entry) → cwd redacted, no ledger write.
- **E6-untracked untouched (Codex R1 F-A)**: an **untracked** ledger file hash-bound to a
  redacted receipt → after `--apply` that untracked file is **byte-for-byte unchanged** (not
  renamed, not unlinked); the receipt IS redacted; the now-orphaned entry is locally dangling
  (documented-acceptable). Assert the tracked-only filter excluded it.
- **TOCTOU guard (Codex R1 F-B)**: mutate the on-disk receipt hash between plan and apply →
  the whole run aborts (all-or-nothing), nothing partially written.
- **crash-recovery / over-count (Codex R1 F-B)**: seed a partial state (both old- and
  new-named ledger files present for one decision) → idempotent re-run + post-apply scan
  converge to clean (bound preserved, 0 new tracked dangling, no duplicate).
- **post-apply invariant scan fail-closed (Codex R1 F-B)**: craft a state that would leave a
  NEW tracked dangling → the scan exits non-zero and the run does NOT signal committable.
- **post-apply scan is index-independent (Codex R2 F-C)**: after `--apply` but BEFORE any
  `git add`, the new ledger files are untracked-in-index; assert the step-7 scan still passes
  (it reads the in-memory rename map + disk, never `git ls-files`), and that a `git ls-files`
  based scan at that moment would wrongly miss them (proves the bug the design avoids).
- **fail-closed migration lock (Codex R2 F-D)**: a pre-held live (non-stale) lock → `--apply`
  exits non-zero BEFORE any write (contrast with `withLedgerLock` which would proceed); a
  stale lock (mtime > 30s) is reclaimed and the run proceeds.
- **explicit staging excludes E6 (Codex R3 F-E)**: with the untracked E6 file present, the
  planned-set staging (`git add -u` + explicit new names) leaves E6 UNSTAGED, and the
  post-stage allowlist gate would ABORT if E6 (or any out-of-plan path) were staged. Contrast:
  assert `git add -A <ledgerdir>` WOULD stage E6 (proves the bug the design avoids).
- **post-stage exact-manifest gate rejects concurrent write (Codex R3 F-F + R4 F-G)**: (a) a
  stray staged path outside the plan → abort; (b) a **missing planned deletion** — simulate a
  concurrent `writeEntry` recreating one of the 9 old ledger files so `git add -u` skips its
  `D`, leaving the manifest short one deletion → the exact-manifest gate aborts before commit
  (an allowlist would have passed it); (c) a staged blob whose content hash ≠ expected → abort.
- idempotency: second `--apply` = 0 changes.
- collision pre-flight: crafted duplicate target → whole run aborts, nothing written.
- dangling (no-receipt) ledger entries untouched.
- (integration) after rebind, `evidence-audit` `hash_bound` for the 9 tracked bound set is
  unchanged (Task 1's stricter tool still finds them bound); tracked dangling count did not grow.

### Task 5 — F3 + F1 guard: pr.md Phase 3

UPDATE `commands/pr.md` Phase 3:

- **F3**: capture the evidence-commit exit; on non-zero, print
  `[MCCP-EVIDENCE-STOP] evidence-commit failed — NOT pushing (receipts would be
  working-tree-only, recreating blind audit).` and **exit before `git push`**. PR
  creation is only reached when the commit succeeded. (Commit is still not forced when
  there is nothing to stage — that path is unchanged.)
- **F1 defense-in-depth**: before staging, assert no receipt under
  `.claude/receipts/mccp-pr-codex/` has an absolute `meta.cwd` (reuse a one-line node
  check). If any is found, `[MCCP-EVIDENCE-STOP]` with the offending file + instruction
  to run `v1.22.4-cwd-rebind.js --apply`. This keeps a future absolute-cwd receipt from
  ever being published, independent of the one-shot rebind.
- **F1/F-B post-apply gate (defense-in-depth)**: the pr.md absolute-cwd guard is the
  cheap pre-stage check; the *authoritative* corpus-integrity gate is the rebind tool's own
  fail-closed post-apply invariant scan (Task 3 step 7), which the operator runs at rebind
  time (Task 6) before ever reaching `/mccp:pr`. pr.md does not re-run the full binding scan
  (it has no rebind context), so its guard stays the one-line absolute-cwd assertion.
- **F-H/F-I — MANDATORY pre-push HISTORY-leak gate, ALL blobs (Codex R5 + R6, verified)**: the
  working-tree redaction + exact-manifest gate only protect the *staged/final tree*. They do
  NOT remove leaking content from **ancestor commits**, and — critically (Codex R6 F-I) — the
  leak is NOT confined to receipt blobs. Verified: `origin/main..HEAD` commits `4936461` +
  `61db53f` carry absolute `meta.cwd` in receipts, AND the committed **design artifacts
  themselves** (this plan + the `durable-evidence-substrate-pr-codex-findings.md` report)
  embed the same absolute paths. A receipt-only gate would pass while the plan/report commits
  publish `<drive>:\…` into public history. So Phase 3.1, **before `git push`**, must scan
  **every text blob** reachable in `origin/<base>..HEAD` (not just `mccp-pr-codex/` — e.g.
  `git rev-list origin/<base>..HEAD` × `git ls-tree -r` per commit, or `git log -p`) for an
  absolute local-path pattern (`[A-Za-z]:[\\/]` drive-letter + repo-root prefix), with a
  **documented allowlist** for intentional path literals (test fixtures, CLAUDE.md examples),
  and **HALT with `[MCCP-EVIDENCE-STOP]` if any non-allowlisted blob leaks**. This is the
  terminal push-time guarantee: no history path — receipt or artifact — can leak. Recovery is
  Task 6's unpushed-history redaction + committed-artifact placeholder pass.

### Task 6 — run the rebind + CHANGELOG

- Mechanical chain (Codex R2 F-C — one sequence, no gaps):
  1. `node plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js --dry-run` (must show 33
     receipts planned, **9 tracked** ledger re-keys, 0 collisions, E6 excluded).
  2. `--apply` — takes the fail-closed lock, applies with TOCTOU + new→receipt→unlink-old
     ordering, and runs the **self-contained fail-closed post-apply scan (Task 3 step 7)**. A
     non-zero exit means DO NOT stage/commit — inspect and re-run (idempotent heals partial state).
  3. Only on a clean apply, stage the **explicit planned set** (Codex R3 F-E — NEVER
     `git add -A` the ledger dir, which would sweep in untracked E6):
     `git add -u .claude/receipts/mccp-pr-codex/ .claude/state/completion-ledger/` **plus**
     `git add --` of only the 9 new-named ledger files. Then the **mandatory post-stage
     EXACT-MANIFEST gate (Codex R4 F-G)**: assert `git diff --cached --name-status` equals
     precisely 33 `M` receipts + 9 `D` old-ledger + 9 `A` new-ledger (every planned deletion
     present, correct status, expected content hash); abort + unstage on any missing deletion,
     wrong status, extra path (E6 or concurrent write), or content mismatch. Optionally
     `--verify`, then commit the rewritten corpus.
- **Unpushed-history redaction (Codex R5 F-H — RESOLVED: Method A + ordering ii)**: Phase A
  commits `4936461` + `61db53f` (unpushed) already carry leaking receipt blobs, so a
  top-of-branch redaction commit is NOT enough — the branch history must be rewritten so NO
  commit in `origin/main..HEAD` contains an absolute receipt cwd. The branch is **unpushed**
  (verified), so the rewrite is local-only and safe. **Ordering (ii)**: this runs AFTER the
  rebind tool exists (Task 3/4) and redacts **only Phase A**: `git reset --soft origin/main` →
  run the rebind on the working tree (redacts 33 receipts + re-keys 9 tracked ledger, with the
  exact-manifest gate) → re-commit the Phase A content as fresh commit(s) whose receipt blobs
  are already relative. The follow-up's own commits (F2 / pr.md / tests) then sit on top and add
  no leaking blob (new receipts are `normalizeReceiptCwd`-relative by construction). The Task 5
  pre-push history gate must then pass (scans all `origin/main..HEAD` receipt blobs). Ledger
  `commit_sha` reconciliation is **moot** (measured: 0 ledger entries reference the Phase A
  commits; binding is via `receipt_hash`). See `## F-H Resolution`.
- **Committed-artifact redaction (Codex R6 F-I)**: before push, redact the absolute local paths
  in EVERY committed artifact that embeds them — not just receipts. Known offenders in this
  branch: **this plan** (`durable-evidence-substrate-followup.plan.md`) and the
  **findings report** (`durable-evidence-substrate-pr-codex-findings.md`), both of which cite
  `<drive>:\_project\my\mccp` / `…\my-claude-code-plugin` literally. Replace with placeholders
  (e.g. `<repo-root>` / `<old-repo-name>`) that preserve meaning without a drive-letter path.
  The broadened Task 5 pre-push gate (all blobs) is the enforcement — a missed artifact HALTs
  the push. (Codex focus prompts / `<gitdir>/mccp/tmp/*` are NOT committed, so they are out of
  scope.)
- `CHANGELOG.md`: add the follow-up absorption note under the unshipped 1.22.4 row.

## Validation Commands

```bash
# F2
node --test plugins/mccp/scripts/lib/tests/evidence-audit.test.js
# F1
node --test plugins/mccp/scripts/migrations/tests/v1.22.4-cwd-rebind.test.js
# rebind dry-run (must show 33 receipts planned, 9 TRACKED ledger re-keys, 0 collisions, E6 excluded)
node plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js --dry-run
# F-A: the untracked E6 ledger file is byte-for-byte unchanged after --apply (record hash, apply, re-check)
node -e 'const cp=require("child_process"),f=".claude/state/completion-ledger/live-activation-m3-pr-codex-absorption__c8b9175d489a.json";const h=cp.execFileSync("git",["hash-object",f],{encoding:"utf8"}).trim();require("fs").writeFileSync(process.env.TMPDIR+"/e6.hash",h);console.log("E6 pre-apply hash",h)'
# ... run --apply ... then assert the E6 hash is identical (byte-for-byte untouched)
# post-apply: no absolute cwd remains
node -e 'const fs=require("fs"),p=require("path"),d=".claude/receipts/mccp-pr-codex";let bad=0;for(const f of fs.readdirSync(d)){const c=JSON.parse(fs.readFileSync(p.join(d,f),"utf8")).meta.cwd;if(p.isAbsolute(c)||/[A-Za-z]:\\/.test(c)){bad++;console.log("LEAK",f,c);}}process.exit(bad?1:0)'
# post-apply: bound set still binds (hash_bound preserved) — audit reports honestly
node plugins/mccp/scripts/lib/evidence-audit.js --json
# full receipt suite (guard/hash/store unaffected)
node --test plugins/mccp/scripts/receipt/tests/*.test.js
```

## Acceptance Criteria

- [ ] F2: `evidence-audit` returns a non-ok state + nonzero exit for `false_positive>0`,
      `hash_bound<comparable` (`inconsistent`), and `unverifiable>0` (`incomplete`);
      a clean bound corpus still returns `ok`/0. Tests assert each FAILS (not just counters).
- [ ] F1: after `--apply`, zero receipts have an absolute `meta.cwd`; old-repo paths map to
      `<outside-repo>` (no path leaked); the **9 tracked** live bindings are preserved (0 new
      dangling among tracked ledger entries); re-run is a no-op. pre-flight aborts
      all-or-nothing on any collision; the TOCTOU guard aborts if a receipt changes under the run.
- [ ] F1 F-A (Codex R1): the re-key set is git-tracked-only — the untracked E6 ledger entry is
      **byte-for-byte untouched** (its redacted receipt leaves it locally dangling, accepted → Phase B).
- [ ] F1 F-B (Codex R1): the fail-closed **post-apply invariant scan** passes before commit —
      it exits non-zero on any new tracked dangling or duplicate; a seeded partial state heals
      via idempotent re-run + scan.
- [ ] F1 F-C (Codex R2): the post-apply scan is **index-independent** (driven by the in-memory
      rename map + disk, never `git ls-files` post-rename), so it verifies the new bindings that
      are not yet staged; staging (`git add -A`) happens only after a clean scan.
- [ ] F1 F-D (Codex R2): the migration lock is **fail-closed** — acquisition failure exits
      non-zero before any write (does NOT inherit `withLedgerLock`'s fail-open proceed).
- [ ] F1 F-E (Codex R3): staging is **explicit planned-path** (`git add -u` + explicit new
      names), NEVER `git add -A` the ledger dir; the untracked E6 file is left UNSTAGED.
- [ ] F1 F-F/F-G (Codex R3+R4): a **mandatory post-stage EXACT-MANIFEST gate** aborts the
      commit unless `git diff --cached --name-status` equals precisely 33 `M` + 9 `D` + 9 `A`
      with expected content hashes — catching a missing planned deletion (concurrent-writer
      recreate), wrong status, stray path (E6), or content mismatch. The migration lock's scope
      is documented as rebind-vs-rebind only; the exact-manifest gate is the terminal guarantee.
- [ ] F1 F-H (Codex R5, verified — RESOLVED Method A + ordering ii): pr.md HALTs `git push` if
      ANY receipt blob reachable in `origin/main..HEAD` (all ancestor commits, not just the tip
      tree) has an absolute cwd; the unpushed Phase A history is rewritten (`reset --soft
      origin/main` → rebind → re-commit) so no reachable commit leaks. `commit_sha` reconciliation
      is moot (0 ledger refs to Phase A commits).
- [ ] §3.12 reconciliation: `CLAUDE.md` §3.12 documents the v1.22.4 cwd-rebind as the one
      sanctioned re-seal (rehash + atomic ledger re-key); the no-rehash invariant + `writeReceipt`
      guard still hold for every other writer.
- [ ] F1 F-I (Codex R6, verified): the pre-push gate scans **all** blobs in `origin/main..HEAD`
      (not just receipts) for absolute-path leaks with a documented allowlist; every committed
      artifact that embeds absolute paths (this plan, the findings report) is redacted to
      placeholders before push. **[This plan-gate did NOT converge — 6 Codex rounds, all No-ship;
      receipt sealed `divergent`; F-I broadened-gate + artifact redaction re-reviewed at implement/PR.]**
- [ ] F1 guard: pr.md refuses to evidence-commit when any staged receipt has an absolute cwd.
- [ ] F3: pr.md blocks `git push` when the evidence-commit failed; PR creation only on commit
      success; a genuine no-op (nothing staged) still proceeds unblocked.
- [ ] The 19 pre-existing dangling ledger entries + the untracked E6 entry are untouched.
- [ ] No `plugin.json` bump (folds into unshipped 1.22.4). CHANGELOG notes the absorption.

## Risks / Out of Scope

- **Rebind corrupting the corpus** — the highest risk; mitigated by dry-run default,
  all-or-nothing pre-flight, migration lock, TOCTOU re-read guard, new-ledger→receipt→
  unlink-old ordering (every crash window is a recoverable over-count, never a missing
  binding), a **fail-closed post-apply invariant scan before commit**, idempotent re-run, and
  binding-preservation tests. plan-Codex R1 attacked exactly here and found two live corruption
  paths — the untracked-E6 mutation (F-A) and the cross-file crash-atomicity gap (F-B) — both
  now absorbed above; see `## Codex Adversarial Review`.
- **Untracked E6 becoming locally dangling** — redacting E6's tracked receipt (required to
  stop the leak) orphans the untracked E6 ledger entry locally. Accepted: E6 is already
  Phase-B poison, is never pushed, and Phase B owns its reconciliation.
- **Ancestor-history leak (Codex R5 F-H, verified — the plan-gate did NOT converge here)** —
  the working-tree redaction never removes the leaking blobs already committed in unpushed
  Phase A history (`4936461`, `61db53f`). A pre-push history gate (Task 5) is the mechanical
  backstop, but the *recovery* — how to rewrite the unpushed history so no reachable commit
  leaks, and how to reconcile ledger `commit_sha` provenance after the SHAs change — is an
  **UNRESOLVED design axis** carried into implementation. See Open Questions.

## F-H Resolution (Codex R5 — resolved by operator-delegated design decision, 2026-07-23)

The R5 open axis is now **decided** (the three sub-questions resolved against measured facts):

1. **Rewrite mechanism → `git reset --soft origin/main` + rebind + re-commit (Method A).** For
   a 2-commit unpushed branch this is the pragmatic winner: Bash-friendly (no interactive
   rebase, no external tool), a single redaction code path (the rebind tool itself — no
   duplicated cwd logic in a `filter-repo` blob callback), and it guarantees no leaking blob in
   `origin/main..HEAD` (fresh commits from the redacted working tree). `filter-repo` is
   rejected as disproportionate (install uncertainty, all-ref rewrite, logic duplication) for 2
   unpushed commits; its only advantage (commit-structure preservation) has near-zero value
   pre-first-PR.
2. **Ledger `commit_sha` reconciliation → MOOT (measured 2026-07-23).** All 29 ledger entries'
   `commit_sha` were checked: **0 reference the Phase A commits** (`4936461`/`61db53f`). The
   ledger↔receipt binding is via `receipt_hash` (which the rebind re-keys atomically), never
   `commit_sha`. Rewriting the Phase A commits therefore breaks no ledger binding. (The ledger
   `commit_sha` already point at older, mostly-non-ancestor-of-main historical tips — the very
   dangling that §3.12 switched to merge-commit to stop — but that is independent of Phase A.)
3. **§3.12 merge-commit interaction → no conflict.** That policy preserves *already-pushed*
   evidence SHA reachability; F-H is a **pre-first-push local rewrite** of unpushed commits, so
   nothing pushed is affected.

**Ordering (ii)** — build the rebind tool first (Task 3/4), redact **only Phase A** (reset
--soft → rebind → re-commit Phase A as fresh redacted commits), then implement the follow-up
(F2 / F1-tool-consumers / F3+F-H pr.md) on top as normal commits (their new receipts are
already `normalizeReceiptCwd`-relative, so they add no leaking blob). Task 5's pre-push HISTORY
gate is the final mechanical backstop regardless of ordering.

## §3.12 no-rehash invariant reconciliation (self-caught this gate)

F1's whole purpose — recomputing `receipt_hash` to redact `meta.cwd` — is exactly what CLAUDE.md
§3.12 ("재봉인 금지 / no-rehash invariant") forbids. But §3.12 forbade it because a naive
re-seal breaks the ledger binding (dangling/duplicate, E4) and it deferred the leak to a "Phase
B rebind." **F1 IS that rebind, pulled forward, and it re-keys the ledger atomically so the E4
concern §3.12 protected against does not arise.** So F1 is the sanctioned evolution §3.12
anticipated, not a blind violation — but §3.12's unconditional "절대 재계산하지 않는다" wording
must be updated. `CLAUDE.md` §3.12 is added to Files to Change: document that the v1.22.4
cwd-rebind is the **one sanctioned re-seal** (rehash + atomic ledger re-key preserves the
binding), while the no-rehash invariant continues to hold for every OTHER writer and the
`store.writeReceipt` guard still fail-closed HALTs all un-sanctioned tracked-hash changes.
- **Overwrite-guard bypass** — the tool deliberately writes tracked receipts via direct fs
  (not `store.writeReceipt`). Justified only because it re-keys the binding atomically;
  any other tracked-hash change stays forbidden.
- **Out of scope**: repairing the 19 pre-existing dangling ledger entries (separate data
  axis); F4 resume-path (documented/accepted, optional hardening → backlog); the E6
  untracked ledger entry (Phase B).

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; `--impeccable-available` design-scope preamble active → Codex focused on correctness/security)
- 라운드 수: **6** (R1–R6, 각 라운드 classification=`ok`, verdict=`needs-attention`/No-ship — **한 번도 CONVERGED 없음**)
- 합치 결론: **DIVERGENT.** 6 라운드 모두 실제·검증된 결함을 반환했다. F2/F3는 R1에서 이의 없이 수렴했고, F1(cwd-rebind) 작업트리 도구는 F-A~F-G 7건 흡수로 크게 견고해졌으며, **R5의 새로운 축 F-H(unpushed 조상 커밋 leak)는 Method A + ordering (ii)로 해소**(operator 위임 결정, `commit_sha` 재조정 moot 실측)됐다. 그러나 **R6가 또 하나의 새로운 leak class F-I를 표면화**했다 — pre-push 게이트가 receipt blob만 스캔하는데, 커밋될 **plan/report 아티팩트 자체가 같은 절대경로를 leak**한다. 6연속 No-ship + R6의 신규 leak class → 거짓 `converged` 봉인을 거부한다(memory F5 교훈: 거짓 수렴은 PR-Codex dedupe를 무력화). Receipt는 `codex_verdict=divergent`로 봉인 → PR 단계 dedupe fail-closed → PR-Codex 실발화(재검토 보장).
- YAGNI Triage:
  | Finding | Round | Severity | Verdict | Why / 흡수 |
  |---|---|---|---|---|
  | F-A: rebind이 untracked E6 엔트리를 mutate (실측: E6가 tracked receipt에 hash-bound) | R1 | HIGH | ACCEPT_NOW | Task 3 step 3 — re-key 대상을 **git-tracked ledger만**으로 필터(9 tracked, E6 제외). 흡수 완료. |
  | F-B: receipt→ledger 순서가 crash 시 dangling window; withLedgerLock fail-open | R1 | HIGH | ACCEPT_NOW | Task 3 — fail-closed lock + TOCTOU re-read + new→receipt→unlink-old 순서 + fail-closed post-apply 불변식 스캔. 흡수 완료. |
  | F-C: post-apply 스캔이 rename 후 `git ls-files`로 신규 파일을 놓침 | R2 | HIGH | ACCEPT_NOW | Task 3 step 7 — 스캔을 in-memory rename map + disk 기반으로(인덱스 비의존). 흡수 완료. |
  | F-D: migration lock이 withLedgerLock의 fail-open을 상속 | R2 | HIGH | ACCEPT_NOW | Task 3 step 1 — 획득 실패 시 fail-closed exit(shape만 mirror, behavior는 flip). 흡수 완료. |
  | F-E: `git add -A` 디렉토리 스테이징이 untracked E6를 재-publish | R3 | HIGH | ACCEPT_NOW | Task 3 step 8 / Task 6 — explicit planned-path 스테이징(`git add -u` + 명시 신규명). 흡수 완료. |
  | F-F: dedicated lock이 일반 writer는 배제 못 함 | R3 | MEDIUM | ACCEPT_NOW | lock scope를 정직히 narrow(rebind-vs-rebind) + post-stage allowlist→exact-manifest 게이트가 concurrent write backstop. 흡수 완료. |
  | F-G: post-stage allowlist가 계획된 **삭제 누락**을 못 잡음(concurrent recreate) | R4 | HIGH | ACCEPT_NOW | Task 3 step 8 — allowlist를 **EXACT-MANIFEST**(정확히 33 M + 9 D + 9 A, content hash)로 강화. 흡수 완료. |
  | **F-H: 작업트리 redaction이 unpushed 조상 커밋(`4936461`+`61db53f`)의 leaking blob을 제거 못 함 → `git push`가 전체 history를 publish** | R5 | HIGH | ACCEPT_NOW (**RESOLVED**) | Task 5 pre-push HISTORY 게이트 + Task 6 Method A(`reset --soft`+rebind+재커밋, ordering ii). `commit_sha` 재조정 moot(실측 0 refs). `## F-H Resolution` 참조. |
  | **F-I: pre-push 게이트가 receipt blob만 스캔 — 커밋될 plan/report 아티팩트가 같은 절대경로를 leak** | R6 | HIGH | ACCEPT_NOW (**mechanism 미검증**) | Task 5 — 게이트를 **전 blob** 스캔으로 확장(allowlist 포함) + Task 6 — committed 아티팩트(plan·report) placeholder redaction. broadened-gate 실효는 implement/PR 재검토. |
- Deferred to backlog: 0 (모든 finding ACCEPT_NOW — DEFER 없음)
- Open Questions: F-H는 해소됨(`## F-H Resolution`). **잔여: F-I broadened-gate(전 blob 스캔 + allowlist)와 committed-artifact redaction의 실효는 실제 diff에서 검증돼야 함** — Implement-Codex + PR-Codex 재검토 대상.
- Codex thread 참조: R1 `019f8af1-a00d-7a51-bc7c-df6d7bf6e05b` (이후 라운드 stdout는 `<gitdir>/mccp/tmp/plan-codex-r{2..6}-stdout.json`)
- **결론**: 이 plan-gate는 **6 라운드에서 한 번도 수렴하지 않았다**. F1 작업트리 도구 + F-H history 축 설계는 견고해졌으나, R6가 새 leak class(F-I: 아티팩트 자체 leak)를 표면화했고 그 broadened-gate 실효는 미검증이라 정직하게 `divergent`로 기록한다(거짓 converged 거부). `/mccp:prp-implement`로 진행 가능하되(plan-codex는 lenient gate), 구현자는 F-H Resolution(Method A)대로 구현하고 F-I(전-blob 게이트 + 아티팩트 redaction)를 반드시 포함해야 하며, Implement-Codex + PR-Codex가 재검토한다.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; `--impeccable-available` design-scope preamble active)
- 라운드 수: **1** (classification=`ok`; 구조화 `.result.verdict=needs-attention` = No-ship)
- 합치 결론: **DIVERGENT (needs-attention).** 구현 착수 전 implement-time 결정(F2 사다리·rebind 분해·exact-manifest·fail-closed lock·Method A history·전-blob 게이트)을 Codex에 제시. **주의(memory F5 실증 3회차)**: free-text `codex-bridge.parseVerdict`는 `converged`를 반환했으나 이는 finding 본문의 경고문을 오인한 그 버그다 — 구조화 `.result.verdict`(=`needs-attention`)를 SoT로 채택. Receipt `codex_verdict=divergent`로 봉인 → PR 단계 dedupe fail-closed → PR-Codex 실발화(재검토 보장).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why / 흡수 |
  |---|---|---|---|
  | IF1: F2 audit이 `entry.verdict==='converged'`일 때만 agreement 검사 — advisory/skipped ledger verdict는 무검증 통과(exit 0). stale/tampered ledger가 disagreement를 은폐 가능 | HIGH | ACCEPT_NOW | `verdictsAgree` **total 검사**로 교체 — 모든 comparable pair가 positively corroborate돼야 ok(`ok + false_positive === comparable`). advisory/skipped mismatch가 이제 `inconsistent`/nonzero. 실측 corpus(10 전부 converged)는 결과 불변(regression 0). advisory/skipped 테스트 5건 추가. 흡수 완료. |
  | IF2: receipt overwrite가 crash-safe하지 않음(plan이 "direct fs.writeFileSync"라 서술) | HIGH | ACCEPT_NOW (**이미 구현됨**) | 구현은 plan 문구와 달리 이미 `writeAtomic`(tmp+rename) 사용 = Codex 권고와 동일. 추가로 write 직후 **re-read 검증**(landed hash === newHash 아니면 abort) belt-and-suspenders 추가. 흡수 완료. |
  | IF3: 커밋될 plan/report 아티팩트 자체가 절대경로 leak(plan L16 `C:\...`, report L24) — 전-blob 게이트가 모든 push를 막거나 allowlist가 leak class를 은폐 | HIGH | ACCEPT_NOW | 이미 plan F-I 범위. Task 5 전-blob pre-push 게이트(line/fixture-specific allowlist, directory-wide 금지) + Task 6 plan·report placeholder redaction. 흡수 완료(아래 Task 5/6). |
- Deferred to backlog: 0 (모든 finding ACCEPT_NOW)
- Open Questions: 없음. F-I 실효는 Task 5/6 실제 diff에서 검증 + PR-Codex 재검토.
- Codex thread 참조: R1 `019f8b5e-f233-7682-88a6-05c8dbfc89e0`
- **결론**: Implement-Codex R1 = No ship(3 HIGH 전부 ACCEPT_NOW·흡수 완료·backlog 이연 0). IF1은 내 코드에 실재한 결함이라 즉시 수정(total agreement), IF2는 이미 atomic write로 충족, IF3는 Task 5/6 소유. 정직하게 `divergent` 봉인 — plan-codex도 divergent라 cross-gate dedupe는 어느 쪽이든 fail-closed로 PR-Codex를 재발화한다.
