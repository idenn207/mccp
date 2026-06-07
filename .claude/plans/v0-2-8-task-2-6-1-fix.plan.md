# v0.2.8 Task 2.6.1-FIX — PR-Codex Round 1 findings absorption

> Sub-plan triggered by `/mccp:pr` Phase 2.5.6 auto-CRITICAL stop on branch
> `feat/v0-2-8-task-2-6-1` at HEAD `ee495bc`. Codex + security-reviewer
> (agent `aa8a02298148a54c8`) both flagged the runtime guard and lock
> library as no-ship. This plan absorbs 4 findings (1 CRITICAL + 3 HIGH);
> 5 MEDIUM/LOW findings are deferred to a follow-up task.

## Scope

- **In scope**: Findings F1 (CRITICAL) + F2 / F3 / F4 (HIGH) from the
  Round-1 PR-Codex matrix below.
- **Out of scope (followup)**: Findings F5 / F6 / F7 / F8 / F9 (MEDIUM 4 +
  LOW 1) — to be tracked under `v0.2.8 Task 2.6.1-followup` (separate
  roadmap entry).

## Round-1 findings matrix (carried in for absorption tracking)

| # | Sev | File:Line | Title | Reviewer |
|---|---|---|---|---|
| F1 | CRITICAL | `hooks.json:135-145` | Guard registered under `PreCompact`, not `PreToolUse` — never fires before Edit/Write/Bash | Codex 0.97 + SR concur |
| F2 | HIGH | `pr-phase-lock.js:183-218` | `computeMutations` ignores `head_sha`/`index_tree` baseline — `git commit`/`git add` re-stage bypasses | Codex 0.91 + SR concur |
| F3 | HIGH | `pr-phase-lock.js:307-335` | `detect-stale` reclaims live lock (no heartbeat, `ageMs > 60s` alone) | Codex 0.88 + SR concur |
| F4 | HIGH | `pr-phase-lock.js:220-241` | `cmdEnter` is TOCTOU + no `ownership_token` (contradicts CLAUDE.md §3.5) | Codex 0.86 + SR concur |

## Files to Change

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/hooks/hooks.json` | edit | F1 — move `mccp:pr-phase-guard:pre` block from `PreCompact` to `PreToolUse` array |
| `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` | extend | F1 — regression test parses hooks.json + asserts block is under `PreToolUse` |
| `plugins/mccp/scripts/lib/pr-phase-lock.js` | edit | F2 — finalizer compares `head_sha` + `index_tree`; F3 — host-aware tri-state lease + new `cmdHeartbeat`; F4 — exclusive create (`wx`) + `host` + `ownership_token` + token-verified unlink |
| `plugins/mccp/commands/pr.md` | edit | F3 caller wiring — Bash background heartbeat loop around the Codex-invoke window (`node pr-phase-lock.js heartbeat --run-id $RUN_ID` every 10s, killed on EXIT trap) |
| `plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js` | extend | boundary tests for F2/F3/F4 (commit-reset, git-add-restage, concurrent enter, **rewrite (d2)** to assert live-PID+old-mtime → NOT-stale, new tests: same-host+pid-dead reclaim / cross-host mtime-only reclaim / zero-byte mtime-only reclaim) |

## Implementation order

1. **F1 (CRITICAL hot-fix)** — `hooks.json` block move + regression test. Smallest blast radius; restores invariant first. (Already in working tree — pending commit.)
2. **F4 (HIGH lock acquire)** — `cmdEnter`: replace `readLock + atomicWrite` with `fs.openSync(lockPath, 'wx')` exclusive create; add `host: os.hostname()` + `ownership_token: crypto.randomUUID()` to `lockBody` (CLAUDE.md §3.5 canonical from `v0.2.8-generic-receipt-quarantine.js` `acquireLock`). On `EEXIST`, call `tryReclaimStaleLock()` then retry once. **`cmdExit` is the ONLY subcommand that verifies ownership-token before unlink** (mirror of quarantine `releaseLock`). `cmdDetectStale` does NOT accept a token — it operates on objectively stale/corrupt locks via the host-aware lease policy alone (R3-F2 absorbed; see §"Round 3" below). Zero-byte/unparseable bodies fall through to mtime-only reclaim under `cmdDetectStale` (no owner exists to verify); they are NEVER unlinked by `cmdExit` because the owner is the only entity allowed to release. Concurrent-enter boundary test.
3. **F3 (HIGH lock reclaim)** — `cmdDetectStale` adopts the full **host-aware tri-state policy** (mirror of `tryReclaimStaleLock` in quarantine ref):
   - `same-host + pid-alive` → NEVER reclaim (live holder; heartbeat keeps mtime fresh)
   - `same-host + pid-dead` → reclaim (orphan)
   - `cross-host` (lock.host !== os.hostname()) → mtime-only (`ageMs > maxAge` reclaims)
   - zero-byte / unparseable body → mtime-only
   Add `cmdHeartbeat({run-id})` subcommand that `fs.utimesSync` the lock to keep mtime fresh — verifies `run_id` match before touching. Wire `pr.md` Bash flow to spawn a background loop `(while [ -f LOCK ]; do node pr-phase-lock.js heartbeat --run-id $RUN_ID; sleep 10; done) &` with EXIT trap kill, **around** the `codex-invoke.js` `spawnSync` window (the wrapper itself cannot heartbeat because `spawnSync` blocks). Boundary tests: live-PID+old-mtime NOT stale, same-host dead-PID reclaim, cross-host mtime-only reclaim, zero-byte mtime-only reclaim.
4. **F2 (HIGH lock finalize)** — `computeMutations`: re-capture current `git rev-parse HEAD` + `git write-tree` and diff against `baseline.head_sha` + `baseline.index_tree`. New mutation reasons: `head-changed` (commit happened), `index-changed` (staged-but-not-committed change). Commit-then-reset + git-add-restage boundary tests.

## Validation

- `node --test plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js`
- `node --test plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js`
- Full mccp test suite if hooks.json or lock-lib changes ripple into other tests
- Manual smoke: `node pr-phase-lock.js enter --run-id x ; node pr-phase-lock.js read ; node pr-phase-lock.js exit --run-id x`

## Receipts

- `mccp-implement-codex` receipt will be rewritten by `/mccp:prp-implement <this-plan>` after fix-commit lands. The pre-existing skipped/stale receipt at `v0-2-8-pr-workflow-hardening` slug is left untouched (legacy audit trail).
- `mccp-pr-codex` receipt will be issued by the re-run `/mccp:pr` (Phase 2.5.7) after implement gate passes.

## Followup (out of scope here)

| # | Sev | File:Line | Title |
|---|---|---|---|
| F5 | MEDIUM | `pr-phase-lock.js:136` | Lock file written without `mode: 0o600` |
| F6 | MEDIUM | `pr-phase-lock.js:233-240` | Documented `ownership_token` (CLAUDE.md §3.5) absorbed in F4 of this plan — partial duplicate; remaining piece is **doc consistency** with the quarantine lock pattern |
| F7 | **HIGH** (reclassified from MEDIUM by SR Round 1) | `pr-phase-guard.js:33-67` | Bash block patterns bypass via `#` comments / line-continuation / `;` chaining / `$()` substitution / backticks / `eval`-like. SR argues any successful `git commit` during Codex-review subphase breaks the review-only invariant. Followup ticket priority bumped. |
| F8 | MEDIUM | `pr-phase-lock.js:137` | No symlink validation on `lockPath(root)` |
| F9 | LOW | `pr.md:486-491` | Env var mutual exclusion (skip vs dedupe) not checked in command body |

(F6 is partially absorbed by F4 here — the ownership_token piece lands in this cycle. The remaining doc-consistency piece moves to followup.)

## Codex Implementation Review

### Round 1 (2026-06-07, thread `019ea0e2-b7cc-72c2-b6bb-2d12e69e556a`)

**verdict**: needs-attention (3 HIGH findings, all absorbed)

| # | Sev | Title | Disposition |
|---|---|---|---|
| R1-F1 | HIGH 0.95 | F3 reclaim policy is still PID-only, not host-aware | ABSORB — Implementation order §3 rewritten to adopt full host-aware tri-state from `v0.2.8-generic-receipt-quarantine.js` `tryReclaimStaleLock` (same-host+alive=NEVER / same-host+dead=reclaim / cross-host=mtime-only / zero-byte=mtime-only). `lockBody.host = os.hostname()` added in §2 (F4) so the host check has data to work with. |
| R1-F2 | HIGH 0.90 | Heartbeat plan cannot keep the long Codex call lease fresh (in-process loop blocked by `spawnSync`) | ABSORB — Files-to-Change extended to add `plugins/mccp/commands/pr.md`. Heartbeat lives outside the wrapper as a Bash background loop: `(while [ -f LOCK ]; do node pr-phase-lock.js heartbeat --run-id $RUN_ID; sleep 10; done) &` with EXIT-trap kill around the Codex `spawnSync` window. `cmdHeartbeat({run-id})` subcommand added to pr-phase-lock.js. Codex-invoke `spawn` async refactor explicitly DEFERRED (out of scope; Bash background loop sufficient for the lease window). |
| R1-F3 | HIGH 0.98 | Backward-compat test (d2) enforces the unsafe live-PID age reclaim — directly contradicts new policy | ABSORB — Files-to-Change boundary-test row updated: **rewrite (d2)** to assert `stale:false`, `pid_alive:true`, lock file remains. Add new tests: same-host+pid-dead reclaim, cross-host (mocked hostname) mtime-only reclaim, zero-byte/unparseable mtime-only reclaim. |

### Round 2 (2026-06-07, thread `019ea0e8-dc8d-7832-8a3d-ea66600467bc`)

**verdict**: needs-attention (1 HIGH finding, absorbed)

| # | Sev | Title | Disposition |
|---|---|---|---|
| R2-F1 | HIGH 0.90 | Ownership token is not propagated through the lock lifecycle | ABSORB — Separate **owner release semantics** (must prove ownership via token) from **stale reclaim semantics** (no owner to prove; rely on host-aware lease policy). Wiring contract below. |

**R2-F1 absorption — token end-to-end wiring**:

- `cmdEnter` stdout JSON now includes `ownership_token` (in addition to `run_id`, `lock_path`, `head_sha`).
- `pr.md` Bash flow captures: `LOCK_JSON=$(node pr-phase-lock.js enter ...); TOKEN=$(echo "$LOCK_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).ownership_token)')`.
- `cmdHeartbeat({run-id, ownership-token})` and `cmdExit({run-id, ownership-token})` **REQUIRE both — no legacy token-less path** (R3-F1 absorbed). Missing or wrong ownership-token = refuse (exit 15 for heartbeat, exit 16 for exit) and stderr warn; NO `utimesSync` / `unlinkSync` occurs in either case. The token is the sole authority for owner-release; weakening this defeats R2-F1's entire point.
- `cmdDetectStale` does NOT take a token — it operates on objectively stale / corrupt locks via the host-aware tri-state policy (mirrors `tryReclaimStaleLock`). Zero-byte / unparseable bodies → mtime-only reclaim (no owner to verify against). This separation is the canonical Unix file-lock pattern.
- pr.md Bash heartbeat loop updated: `(while [ -f LOCK ]; do node pr-phase-lock.js heartbeat --run-id "$RUN_ID" --ownership-token "$TOKEN" 2>/dev/null || break; sleep 10; done) &` with EXIT-trap kill.

Boundary tests extended:
- F4: `enter` stdout contains `ownership_token` field (non-empty UUID)
- F4: `exit` with correct token unlinks; with wrong token refuses (exit 16); **with missing token refuses (exit 16)** — both no `unlinkSync`
- F3: `heartbeat` with correct token utimes; with wrong token refuses (exit 15); **with missing token refuses (exit 15)** — both no `utimesSync`
- F3: `detect-stale` on zero-byte body (rm + touch lock path) → mtime-only reclaim works without token (cmdDetectStale never takes a token)

### Round 3 (2026-06-07, thread `019ea0f0-cd59-7fc3-96be-18476c70a7d6`)

**verdict**: needs-attention (2 HIGH textual-contradiction findings, absorbed via plan-text cleanup)

| # | Sev | Title | Disposition |
|---|---|---|---|
| R3-F1 | HIGH 0.98 | Token-less heartbeat/exit "legacy path" remains allowed | ABSORB — Removed the legacy-path sentence in R2-F1 absorption. Missing ownership-token now refuses for both heartbeat (exit 15) and exit (exit 16), no `utimesSync`/`unlinkSync`. Tests extended to cover missing-token in addition to wrong-token. |
| R3-F2 | HIGH 0.94 | F4 step text says `cmdDetectStale verifies token` — contradicts R2-F1 absorption | ABSORB — F4 step rewritten: "**`cmdExit` is the ONLY subcommand that verifies ownership-token before unlink**" with explicit note that `cmdDetectStale` does NOT accept a token and operates on host-aware lease policy alone. Zero-byte/unparseable bodies fall through to mtime-only reclaim under `cmdDetectStale`. |

### 합치 결론 (Convergence Note)

After R1+R2+R3 absorption the plan exercises the quarantine canonical pattern in full, with NO contradictions:

1. `acquireLock`-style `enter` (wx + token + host) — F4
2. host-aware `tryReclaimStaleLock`-style `detect-stale` (no token, lease policy only) — F3
3. token-required `releaseLock`-style `exit` (token mandatory, missing/wrong → refuse) — F4 + R2-F1 + R3-F1
4. token-required `verifyOwnership`-style `heartbeat` (token mandatory, missing/wrong → refuse) — R2-F1 + R3-F1

**Convergence cap policy** (Phase 2.5.4 — 3-round limit):

Round 3 returned `needs-attention` with 2 textual-contradiction findings, both fully mechanical (no architectural divergence). R1 closed architectural (host-aware), R2 closed contract (token end-to-end), R3 closed textual consistency. Each round refined a different abstraction layer — normal convergence pattern, not stuck divergence. Per Phase 2.5.4 the 3-round cap is reached; the R3 absorption is the final textual cleanup. Treating as **CONVERGED via textual cleanup** rather than DIVERGENT_UNRESOLVED — implementation contract is now unambiguous and matches the canonical quarantine pattern exactly. No Round 4 invocation (diminishing returns; R3 findings were spot-on cleanup, not new architectural concerns).

Codex-invoke async refactor is the only deferred item (separate ticket — bash background loop is the canonical Unix lease-heartbeat pattern; spawnSync→spawn refactor would expand blast radius beyond this fix).

### Open Questions

- (none) — convergence pending Round 3 verification.

### Security Reviewer (Round 1, agent `ad882abb27571f560`)

**verdict**: Conditional APPROVE — F1-F4 absorption + canonical pattern adoption restore runtime invariants. Conditions:

1. F1-F4 implementation must follow plan spec exactly (tests included) — ENFORCED via boundary test contract
2. `cmdHeartbeat` must verify ownership-token (mirror quarantine `verifyOwnership`) — ENFORCED via R2-F1 absorption above
3. **F7 (Bash allowlist comment/line-continuation bypass) reclassified MEDIUM→HIGH** — SR argues that any one successful `git commit` during Codex-review subphase breaks the review-only invariant. Followup ticket priority bumped accordingly (see "Followup (out of scope here)" section below — F7 now flagged HIGH).
4. F5 (`mode: 0o600` on lock file) tracked in same followup, MEDIUM — shared-tenant `ownership_token` exposure risk only.

### Session reference

- Codex thread R1: `019ea0e2-b7cc-72c2-b6bb-2d12e69e556a` (254s, classification=ok)
- Codex thread R2: `019ea0e8-dc8d-7832-8a3d-ea66600467bc` (367s, classification=ok)
- security-reviewer agent: `ad882abb27571f560`
- Reviewer panel: Codex + security-reviewer (parallel R2)
