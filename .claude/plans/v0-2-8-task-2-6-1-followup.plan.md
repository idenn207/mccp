# v0.2.8 Task 2.6.1-followup — PR-Codex R1 MEDIUM/LOW + SR R1 reclassifications

> Carries the deferred findings from `v0-2-8-task-2-6-1-fix.plan.md` (PR-Codex
> Round 1 F5-F9) plus the security-reviewer Round 1 reclassification
> recommendations. NOT in scope for the 2.6.1-fix cycle.

## Origin trace

- Parent plan: `.claude/plans/v0-2-8-task-2-6-1-fix.plan.md` (PR-Codex R1
  findings absorption — F1 CRITICAL + F2/F3/F4 HIGH shipped)
- Security-Reviewer Round 1 (agent `ad882abb27571f560`) conditional APPROVE
  on the fix plan with the F5/F7 reclassification recommendations carried
  here.

## In scope

### F5 — Lock file mode 0o600 (MEDIUM)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-lock.js` `cmdEnter` | `fs.openSync(p, 'wx')` opens with default mode (typically 0o666 minus umask) — leaves `ownership_token` readable by other users on shared-tenant systems | Add `mode: 0o600` to the `openSync` call. Boundary test: stat the lock file and assert `stat.mode & 0o077 === 0`. |

**SR Round 1 note**: shared-tenant `ownership_token` exposure risk only. Not
exploitable on single-user systems, but the canonical quarantine pattern
(`v0.2.8-generic-receipt-quarantine.js`) doesn't set mode either — followup
should fix BOTH locations for consistency.

### F6 — ownership_token + symlink validation doc consistency (MEDIUM, partial)

| File | Issue | Fix |
|---|---|---|
| `CLAUDE.md` §3.5 | Documents the quarantine lock pattern (`ownership_token` + lease + heartbeat) but does not mention `pr-phase.lock` now follows the same pattern | Update §3.5 to reference both `v0.2.8-generic-receipt-quarantine.lock` AND `pr-phase.lock` as canonical examples. |

(The implementation piece of F6 — adding `ownership_token` to `pr-phase-lock`
— was absorbed by F4 in the 2.6.1-fix cycle. Remaining piece is doc-only.)

### F7 — Bash allowlist comment / chain bypass (**HIGH** — reclassified by SR Round 1, was MEDIUM)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` (lines 33-67) | `BASH_BLOCK_PATTERNS` regex catalog doesn't pre-strip `#` comments, doesn't reject `$(cmd)` substitution, doesn't reject backtick `\`cmd\``, doesn't split on `;`/`&&`/`||` chain operators before pattern matching, and doesn't catch `eval`/`bash -c`/`sh -c` indirection | Add a Bash-aware tokenizer (or use `shell-quote` package) to split the command on chain operators, strip comments, expand `$()` and backtick subshells, then apply BLOCK patterns to each segment. Reject `eval`/`bash -c`/`sh -c`/`zsh -c`/`source` outright in Codex-review subphase. |

**SR rationale for HIGH reclassification**: any one successful `git commit`
during the Codex-review subphase breaks the review-only invariant. Trivial
bypass like `git status # safe` chained with `; git commit -m fix` would
slip through current regex. This MUST land before v0.2.8 ships.

### F8 — Symlink validation on lockPath (MEDIUM)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-lock.js` `lockPath(root)` | No `fs.realpathSync` check — if `.claude/state/pr-phase.lock` is symlinked outside the repo, writes escape the contained directory | Add `realpath` containment check (mirror of `assertContained` in `v0.2.8-generic-receipt-quarantine.js` line 295-333). |

### F9 — Env var mutual exclusion check (LOW)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/commands/pr.md` (lines 486-491) | `MCCP_PR_SKIP_CODEX_REVIEW` + `MCCP_PR_DEDUPE_*` env vars not checked for mutual exclusion at Phase 0 | Add a Phase 0.2 preflight that rejects ambiguous combinations and emits a `[MCCP-GATE-STOP]` with the conflicting var names. |

## Out of scope (separate cycles)

- `codex-invoke.js` `spawnSync` → `spawn` async refactor — would enable
  in-process heartbeat but expands blast radius beyond this milestone.
  Bash background loop is the canonical Unix pattern and is sufficient for
  the lease window. Track as v0.3.x improvement if/when needed.
- `MCCP_SKIP_RECEIPT=1` session-env latch issue (observed during 2.6.1-fix
  validation — env var leaked from prior session into receipt writes,
  causing `skipped: true` records that should have been canonical). Worth
  investigating settings.json env block lifecycle.

## Validation strategy

Each finding lands with its own boundary test:

- F5: `stat(lockPath).mode & 0o077 === 0`
- F6: doc check (no test — markdown change)
- F7: test cases for `git status # git commit`, `git status; git commit`,
  `eval "git commit -m fix"`, `bash -c "git commit -m fix"`, `$(git commit)`,
  `` `git commit` ``
- F8: symlink lockPath out of repo → `cmdEnter` refuses
- F9: env var combinations table-driven test

## Receipts

This followup creates its own `mccp-plan-codex/v0-2-8-task-2-6-1-followup.json`
and `mccp-implement-codex/v0-2-8-task-2-6-1-followup.json` when scheduled.
NOT eligible for cross-gate dedupe — Bash tokenizer (F7) is a meaningful
architectural decision that needs its own review pass.
