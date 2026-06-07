# v0.2.8 Task 2.6.1-followup — PR-Codex R1 MEDIUM/LOW + SR R1 reclassifications + R2 NEW CRITICAL/HIGH

**Status**: 🟢 **DECISIONS APPROVED** (2026-06-07) — F10 path (a) Node wrappers + F11 fresh-only breaking
**Plugin version**: 0.2.7 → publish-blocked until F10 ships, then **0.2.8** (Task 2.6.4 unblocked downstream)
**Parent**: [v0-2-8-pr-workflow-hardening.plan.md](v0-2-8-pr-workflow-hardening.plan.md) (Milestone 2.6 — Task 2.6.1 base shipped via PR #7 / commit `e3b8c7b`)
**Roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 2.6 — index entry remains v0.2.8

> Carries the deferred findings from `v0-2-8-task-2-6-1-fix.plan.md` (PR-Codex
> Round 1 F5-F9) plus the security-reviewer Round 1 reclassification
> recommendations, plus PR-Codex Round 2 NEW findings F10 (CRITICAL —
> self-application failure / publish blocker) and F11 (HIGH — ownership_token
> plaintext exposure). NOT in scope for the 2.6.1-fix cycle (already shipped).

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

**PR-Codex R2 reinforcement (2026-06-07)**: Codex R2 independently flagged
the mutating-constructs sub-issue (HIGH) — specifically `echo x>file`,
`echo x | tee file`, `awk system()`, `find -exec`. The regex allowlist
permits broad heads (`echo`, `awk`, `find`, `cat`) and the BLOCK pattern
only catches narrow spaced `>` redirection. F7 fix MUST also cover:

- no-space redirects (`echo x>file`)
- fd redirects (`cmd 2>file`)
- pipe-to-mutator (`echo x | tee file`, `cat in | sponge out`)
- `awk system("cmd")` / `awk -e 'BEGIN{system(...)}'`
- `find ... -exec mutator {} \;`
- `find ... -delete`

These belong in the same tokenizer pass as F7 — splitting cleanly into a
separate finding would fragment the review. Add corresponding regression
tests in the F7 boundary suite.

### F10 — Bash allowlist policy redesign (**CRITICAL** — PR-Codex R2 NEW, blocks publish)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` lines 142-147 (`classifyBash`) | Allowlist matches commands by raw-string-prefix regex; legitimate /mccp:pr Phase 2.5 patterns — multi-line `if [ ... ]; then ... fi`, `VAR=$(node ...)`, heredoc body writes (`cat > "$F" <<EOF`), `BODY_FILE=$(node ... pr-body --action write ...)` — all fall through to default-deny. **Once hook is active in plugin install path, pr.md as written cannot complete its own gate.** Self-application meta-defect: the guard built to enforce the review-only invariant blocks the flow that produces the receipt that validates the invariant. | Replace head-token regex allowlist with one of: (a) **Node wrapper commands** — extract Phase 2.5 Bash blocks into dedicated `plugins/mccp/scripts/lib/pr-phase-helpers/*.js` callables, allowlist only `node <repo>/plugins/mccp/scripts/lib/pr-phase-helpers/*.js` exact paths. (b) **Conservative shell parser** — use a real shell tokenizer (`shell-quote` or similar) to enumerate every command in a multi-line/multi-statement block and apply policy to each. Add an integration test that runs the exact pr.md Phase 2.5 Bash blocks under an active lock — that test currently does not exist and would have caught this. |

**Why CRITICAL**: self-application failure. Without this fix, anyone updating
to v0.2.8 finds `/mccp:pr` permanently broken when the new hook activates.
Workaround `MCCP_PR_PHASE_LOCK_DISABLE=1` would defeat the whole milestone.

**Why deferred from 2.6.1-fix**: discovered at PR-Codex R2 only after the
fix commit landed. Allowlist policy redesign is a non-trivial architectural
decision (Node wrappers vs shell parser) that warrants its own plan-codex
round, not a same-cycle R3 absorption.

**Current-environment safety**: development worktree's hook is NOT in the
plugin install path (`~/.claude/plugins/cache/mccp/mccp/0.2.7/`) so the
defect does not block this very PR. v0.2.8 publish reactivates the threat.
F10 MUST land before plugin.json version bump (Task 2.6.4).

### F11 — Ownership token hashing (**HIGH** — PR-Codex R2 NEW)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-lock.js` `cmdEnter` lines 304-309 | Raw `ownership_token` (crypto.randomUUID) is written into `.claude/state/pr-phase.lock` in plaintext, AND pr.md exports the same token into the child Codex/heartbeat process environment. Combined with the guard's read-allowlist (cat/head/awk on text files), the token is not a meaningful secret inside the review subphase — read-only inspection or inherited env exposes it. | Store `sha256(token)` (or HMAC with a per-session key) in the lock file. On `exit`/`heartbeat`, hash the presented token and compare. Don't export raw token into child env — use a separate sealed channel (file under `.git/mccp/tmp/` with restrictive mode, deleted after read). Block direct reads of `pr-phase.lock` while the guard is active (add to BLOCK pattern catalog with a path-specific rule). |

**Relation to F5**: F5 fixes lock-file mode (0o600), F11 fixes token
storage representation. Both needed — mode prevents OTHER users from
reading, hashing makes the lock-file value useless even if read.

**Why deferred from 2.6.1-fix**: discovered at PR-Codex R2 only after the
fix commit landed. Hash representation change is breaking to any in-flight
locks — needs a migration / fresh-only policy decided during followup plan.

### F8 — Symlink validation on lockPath (MEDIUM)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-lock.js` `lockPath(root)` | No `fs.realpathSync` check — if `.claude/state/pr-phase.lock` is symlinked outside the repo, writes escape the contained directory | Add `realpath` containment check (mirror of `assertContained` in `v0.2.8-generic-receipt-quarantine.js` line 295-333). |

### F9 — Env var mutual exclusion check (LOW)

| File | Issue | Fix |
|---|---|---|
| `plugins/mccp/commands/pr.md` (lines 486-491) | `MCCP_PR_SKIP_CODEX_REVIEW` + `MCCP_PR_DEDUPE_*` env vars not checked for mutual exclusion at Phase 0 | Add a Phase 0.2 preflight that rejects ambiguous combinations and emits a `[MCCP-GATE-STOP]` with the conflicting var names. |

## Approved Decisions (2026-06-07)

### Decision 1: F10 = Node wrappers (path a) ✅

pr.md Phase 2.5 Bash logic moves into `plugins/mccp/scripts/lib/pr-phase-helpers/*.js`. The `pr-phase-guard.js` `BASH_ALLOW_PATTERNS` reduces to ONE path-anchored pattern matching `pr-phase-helpers/*.js` exactly, plus a minimal read-only catalog (`gh api`, `git status|log|diff|rev-parse`, `cat .git/mccp/tmp/codex-invoke.stderr` exact filename only — NOT `cat .git/mccp/tmp/*`; `*.token` / `*.tok` reads explicitly denied per R3-F2).

- **Rejected B (shell parser)**: tokenizer surface area too large; false-positive risk for legitimate Phase 2.5 patterns; either a new `shell-quote` dep or a 200+ line custom tokenizer.
- **Rejected C (hybrid)**: scope too large for one followup cycle.

This decision determines F7 ordering: **tokenizer (chain-split + mutating-construct detect) runs FIRST against every Bash command**, including those that would otherwise match the helper-path allowlist. Helper-path match is the *post-tokenizer trust gate* — necessary but not sufficient (R2-F1 + R3-F1 absorption). `node helper.js; git commit` fails at chain-split before the allowlist is consulted.

### Decision 2: F11 = ownership_token_hash + stdout-pipe IPC ✅

`ownership_token` storage transitions from raw UUID in `lockBody` + raw UUID in `cmdEnter` stdout to:

- `lockBody.ownership_token_hash = sha256(token).hex` (raw token NEVER in lock file)
- `cmdEnter` returns raw token in **stdout JSON**, but only safe because `codex-runner.js` is the SOLE caller, spawning `cmdEnter` with `stdio: ['ignore', 'pipe', 'inherit']` — the stdout pipe is anonymous, private to parent process, never written to filesystem (R3-F2 absorption: file-based sealed channel DROPPED; stdout pipe IPC throughout)
- pr.md NEVER calls `cmdEnter` after F10 path (a) refactor — Bash shell capture (`LOCK_JSON=$(node ... enter ...)`) is eliminated because all Phase 2.5 logic moves into codex-runner.js

Existing in-flight v0.2.7 locks (valid JSON + `ownership_token` raw + no `ownership_token_hash`) are handled by the host-aware tri-state legacy policy (R2-F2 absorption in Task 2 §6): same-host+pid-alive=NEVER reclaim (protects live v0.2.7 holder during upgrade); same-host+pid-dead=reclaim; cross-host or zero-byte=mtime-lease path. `cmdEnter` startup pre-check invokes `tryReclaimStaleLock` which respects live-PID invariant. NO parse-error or zero-byte path is required — v0.2.7 locks parse fine.

- **Rejected**: dual-field transitional schema. Zero value for ephemeral state; permanent schema noise.
- **Rejected**: file-based sealed channel (initial R1+R2 proposal). R3-F2 absorption: `.git/mccp/tmp/<uuid>.token` files create a race window between write and unlink that's readable via any allowlisted `cat .git/mccp/tmp/`. Stdout-pipe IPC eliminates the leak surface entirely.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Audited escape preflight | [pr.md:65-78](../../plugins/mccp/commands/pr.md#L65-L78) Phase 0.2 | env reason ≥30 chars + ≥3 words via force-override-reason validator |
| Reason validator helper | [force-override-reason.js](../../plugins/mccp/scripts/receipt/lib/force-override-reason.js) | namespace-aware strict/lenient + banlist + URL-only + placeholder REJECT |
| Path containment (F8 target) | [v0.2.8-generic-receipt-quarantine.js:295-333](../../plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js#L295-L333) `assertContained` | `realpath` + `.endsWith(path.sep)` prefix match, throws `PATH_ESCAPES_GATE` |
| Host-aware tri-state lock | [pr-phase-lock.js:180-211](../../plugins/mccp/scripts/lib/pr-phase-lock.js#L180-L211) `tryReclaimStaleLock` | same-host+alive=NEVER / same-host+dead=reclaim / cross-host+zero-byte=mtime-only |
| Token-required exit/heartbeat | [pr-phase-lock.js:367-428](../../plugins/mccp/scripts/lib/pr-phase-lock.js#L367-L428) | `--ownership-token` mandatory; mismatch=exit 15/16 with no mutation |
| WRITE_FLAGS array build | [pr.md:486-522](../../plugins/mccp/commands/pr.md#L486-L522) | conditional flag append + array spread to node CLI |
| Sealed channel for secrets (NEW — F11) | (none — first instance) | file under `.git/mccp/tmp/` mode 0o600 + unlink after first read |
| Helper CLI shape | [pr-phase-lock.js:600-614](../../plugins/mccp/scripts/lib/pr-phase-lock.js#L600-L614) `main(argv)` switch | subcommand + `parseArgs` + JSON stdout + numeric exit |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/pr-phase-helpers/dedupe-check.js` | CREATE | F10 — wraps Phase 2.5.2 cross-gate dedupe analysis |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | CREATE | F10 — wraps lock enter + heartbeat fork + codex-invoke + lock exit |
| `plugins/mccp/scripts/lib/pr-phase-helpers/body-builder.js` | CREATE | F10 — atomic write of `## Codex Adversarial Review` / `## Security Reviewer Override` / `## Impeccable Override` sections into body-file |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | CREATE | F10 — Phase 2.5.7 WRITE_FLAGS array build + receipt CLI invoke |
| ~~`plugins/mccp/scripts/lib/pr-phase-helpers/sealed-token.js`~~ | ~~CREATE~~ | **DROPPED (R3-F2)** — file-based sealed channel replaced by stdout-pipe IPC inside codex-runner.js |
| `plugins/mccp/scripts/lib/pr-phase-helpers/stdout-pipe-ipc.js` | CREATE | F11 R3-F2 — `spawnAndCaptureToken(cmdArgs) -> {stdout, token}` and `spawnAndPipeToken(cmdArgs, token) -> {stdout, exitCode}` helpers; pure stdout-pipe IPC, no filesystem |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/dedupe-check.test.js` | CREATE | F10 unit |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js` | CREATE | F10 unit |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/body-builder.test.js` | CREATE | F10 unit |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` | CREATE | F10 unit |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/stdout-pipe-ipc.test.js` | CREATE | F11 unit — verify stdout pipe is anonymous, never written to FS, parent-process-only readable |
| `plugins/mccp/scripts/lib/path-containment.js` | CREATE | F8 — extract `assertContained` to shared lib |
| `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | UPDATE | F8 — import from path-containment.js + back-compat re-export |
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` | UPDATE | F10 — `BASH_ALLOW_PATTERNS` rewritten to helper-path-anchored + minimal read-only catalog; F7 — tokenizer (chain split / comment strip / subst reject / mutating-construct detect); F11 — block reads of `pr-phase.lock` |
| `plugins/mccp/scripts/lib/pr-phase-lock.js` | UPDATE | F11 — `ownership_token_hash` + sealed-token integration; F5 — `fs.openSync(p, 'wx', 0o600)`; F8 — `assertContained` on lockPath before write |
| `plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js` | EXTEND | F5 stat-mode + F8 symlink-reject + F11 hash storage / no-raw-stdout / sealed path |
| `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` | EXTEND | F7 (12 bypass cases) + F10 helper-path allowlist integration |
| `plugins/mccp/commands/pr.md` | UPDATE | F10 — Phase 2.5 Bash blocks replaced with helper CLI calls; F9 — Phase 0.3 mutual-exclusion preflight (`MCCP_PR_SKIP_CODEX_REVIEW` ⊕ `CODEX_DEDUPE_AT_PR`) |
| `CLAUDE.md` | UPDATE | F6 — §3.5 references BOTH `pr-phase.lock` AND `v0.2.8-generic-receipt-quarantine.lock`; replace `ownership_token` → `ownership_token_hash` + sealed channel note |

## Tasks

Ordered so architectural decisions land first (F10) and dependencies resolve cleanly. F10 and F11 are independent and could run in parallel, but the helper allowlist tightening (F7) depends on F10 being concrete.

### Task 1 — F10 Node wrappers (CRITICAL, publish blocker)

**Action**:

1. Create `pr-phase-helpers/dedupe-check.js`:
   - argv: `--decision <slug>` `--cwd <path>` `--json`.
   - Reads `mccp-plan-codex/<slug>.json` + `mccp-implement-codex/<slug>.json`, applies the current Phase 2.5.2 dedupe rule (both verdict=approve + same plan_hash + not skipped → `skip_safe=true`).
   - stdout: `{ ok, skip_safe, residual: [string], dedupe_note: string, sources: [string] }`.
2. Create `pr-phase-helpers/codex-runner.js`:
   - argv: `--base <branch>` `--decision <slug>` `--skip-reason <text>` `--dedupe` `--body-file <path>` `--cwd <path>` `--json`.
   - Internally: `pr-phase-lock.js enter` → read sealed-path → background heartbeat (forked child kept alive via `child_process.spawn` detached + EXIT signal cleanup) → `codex-invoke.js adversarial-review` → `pr-phase-lock.js exit` → emit `{ ok, codex_outcome, codex_rounds, codex_summary, codex_actionable_findings, lock_exit_ok, mutations }`.
   - Skip / dedupe short-circuits still acquire and release the lock (review-only invariant must apply even on skip paths — matches current pr.md Phase 2.5.3 logic).
3. Create `pr-phase-helpers/body-builder.js`:
   - argv: `--section codex|security|impeccable` `--body-file <path>` `--content-file <path>` `--cwd <path>`.
   - Atomically inserts or replaces the named heading section in `body-file` (mirror of current Phase 2.5.4 / 2.5.5b inline Bash).
4. Create `pr-phase-helpers/finalize-receipt.js`:
   - argv: `--decision <slug>` `--codex-result <json-file>` `--plan <path>` plus conditional flags `--codex-skip-reason` `--codex-dedupe` `--security-force-override-reason` `--codex-actionable-findings`.
   - Builds the WRITE_FLAGS list internally + invokes `receipt/cli.js write` via `child_process.spawnSync`. Propagates exit code.
5. Create `pr-phase-helpers/stdout-pipe-ipc.js` (R3-F2 absorption — file-based sealed channel DROPPED entirely):
   - `spawnAndCaptureToken(cmdArgs, opts) -> { stdoutJSON, rawToken }` — spawns child with `stdio: ['ignore', 'pipe', 'inherit']`, captures stdout, parses JSON, extracts `ownership_token`. Returns full stdoutJSON + extracted rawToken. Anonymous pipe — never filesystem-visible.
   - `spawnAndPipeToken(cmdArgs, rawToken, opts) -> { stdout, exitCode }` — spawns child with `stdio: ['pipe', 'pipe', 'inherit']`, writes `rawToken + '\n'` to child.stdin, closes; captures stdout. Token NEVER in argv, env, or filesystem.
   - Pure IPC, no FS state — `mode 0o600` / symlink containment / unlink-after-read all N/A (no file).

**Mirror**: `pr-phase-lock.js main(argv)` switch + `parseArgs`; existing Phase 2.5.7 WRITE_FLAGS pattern for `finalize-receipt.js` argv shape.

6. **R2-F1 absorption — Helper trust boundary via content-hash manifest + tokenizer-first**:
   - `pr-phase-lock.js cmdEnter` captures `lock.helper_manifest = { [absolutePath]: 'sha256:' + sha256(fileContent) }` for each helper in the installed plugin cache at lock entry time. Stored in lock body.
   - `pr-phase-guard.js classifyBashCommand` rewrites order: **tokenizer (F7) runs FIRST**, then helper-path allowlist match. Even `node <installed helper>; git commit` fails because chain-split rejects segment 2.
   - On helper-path allow attempt: hook re-computes sha256 of the helper file AT INVOCATION TIME and compares to `lock.helper_manifest[absolutePath]`. Mismatch → DENY with reason `helper-content-changed-during-lock`. Defeats the "edit helper in cache mid-lock" attack.
   - Allowlist pattern still anchored to `realpath(${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/[a-z-]+\.js)`, but path match is *necessary not sufficient* — content hash match is the actual trust gate.
   - Regression tests in `pr-phase-guard.test.js`: (a) modified-helper-in-repo + active lock → DENY (path-mismatch); (b) modified-helper-in-cache + active lock → DENY (hash-mismatch); (c) `node helper; git commit` → DENY (tokenizer chain-split rejects mutator segment); (d) untouched cache helper + active lock → ALLOW.

**Validate** (R2-F1 hardened):

- Unit tests per helper (5 new test files).
- Integration test in `pr-phase-guard.test.js`: spawn each helper under active lock → all PASS only when helper file content matches `lock.helper_manifest`.
- `helper-manifest-mutation.test.js` (NEW): rewrite cache helper byte mid-lock → next invocation DENY.
- `tokenizer-before-allowlist.test.js` (NEW): `node helper.js; git commit` → DENY (chain rejected before allowlist match).

### Task 2 — F11 ownership_token hashing + sealed channel (HIGH)

**Action**:

1. `pr-phase-lock.js cmdEnter` (R3-F2 — stdout-pipe IPC contract, file sealed channel DROPPED):
   - Compute `token = crypto.randomUUID()`.
   - Compute `lockBody.ownership_token_hash = crypto.createHash('sha256').update(token).digest('hex')`. DROP `lockBody.ownership_token`.
   - stdout JSON: `{ ok, lock_path, run_id, ownership_token: <raw>, host, head_sha, dirty_paths, helper_manifest }`. Raw token IS in stdout, but safe because ONLY production caller is `codex-runner.js` spawning with `stdio: ['ignore', 'pipe', 'inherit']` — anonymous pipe, never filesystem-visible.
   - **`pr-phase-guard.js` denies `pr-phase-lock.js enter` Bash invocations during Codex-review subphase**: extends BASH_BLOCK_PATTERNS with `/\bpr-phase-lock\.js\b\s+enter\b/`. codex-runner spawns cmdEnter via Node `child_process.spawn` (not Bash), so the hook never sees those internal calls — only Bash-shell paths get blocked. This eliminates the historical `LOCK_JSON=$(node ... enter ...)` Bash capture path that could leak raw token into shell vars.
2. `pr-phase-lock.js cmdExit` / `cmdHeartbeat` (R2-F3 absorption — **stdin pipe is the only production contract**):
   - **PRODUCTION CONTRACT**: accept `--ownership-token-stdin` flag (no value). Read raw token from `process.stdin` to EOF, then close.
   - Compute `sha256(stdinBuf.toString('utf8').trim()).hex` and compare to `lock.ownership_token_hash`.
   - Mismatch path unchanged: exit 15 (heartbeat) / 16 (exit) + stderr + NO mutation.
   - Raw `--ownership-token <raw>` argv form is **REJECTED at production code path** (exit 17 + stderr) UNLESS `MCCP_LOCK_TEST_ARGV_TOKEN=1` is set. Env var is documented as test-only; production callers MUST NOT export it.
3. `pr-phase-guard.js`:
   - Extend `BASH_BLOCK_PATTERNS` with path-specific deny rule: any `cat|head|tail|less|more|sed|awk|grep|node` against `.claude/state/pr-phase.lock` → DENY. Defense-in-depth even though the lock file no longer contains plaintext token after this Task.
   - **R2-F1 absorption** — block any Bash that includes `MCCP_LOCK_TEST_ARGV_TOKEN=1` substring during Codex-review subphase. Defense-in-depth against accidental production leak.
4. `codex-runner.js` (Task 1) — **stdout-capture IN + stdin-pipe OUT, all in-memory** (R3-F2):
   - Spawn `cmdEnter` via `stdoutPipeIpc.spawnAndCaptureToken()` with `stdio: ['ignore', 'pipe', 'inherit']`. Parse stdout JSON, extract `rawToken` + `helper_manifest`. Hold in memory.
   - Spawn `cmdHeartbeat` / `cmdExit` via `stdoutPipeIpc.spawnAndPipeToken(args, rawToken)` with argv `[..., '--ownership-token-stdin']` (no raw value). Helper writes `rawToken + '\n'` to child.stdin, then closes.
   - Background heartbeat loop: forked child holds token in memory + `setInterval` for utimes — token written once at fork-time via stdin, never repeated, never logged.
   - **No `.git/mccp/tmp/*.token` files. No `readSealedAndUnlink`. No race window.**
5. `pr.md` Phase 2.5.3: drop the `TOKEN=$(echo "$LOCK_JSON" | node -e ...)` line entirely. pr.md never touches the raw token after F10 refactor; only delegates to `codex-runner.js` which owns the entire token lifecycle in-process.
6. **R2-F2 absorption — legacy-schema reclaim PRESERVES host-aware tri-state**:
   - `tryReclaimStaleLock` legacy-schema branch (when `body.ownership_token && !body.ownership_token_hash`) does NOT bypass the same-host+alive=NEVER invariant.
   - Logic: legacy-schema discriminator runs AFTER the host-aware policy. (a) `same-host + pid-alive` → NEVER reclaim regardless of schema (live v0.2.7 holder protected). (b) `same-host + pid-dead` → reclaim immediately (legacy-schema confirms orphan + same as new-schema path). (c) `cross-host` or zero-byte → mtime-lease path (legacy or new schema both wait for lease expiry).
   - `cmdEnter` startup pre-check: read existing lock, if `body.ownership_token && !body.ownership_token_hash`, invoke `tryReclaimStaleLock` (which respects the live-PID invariant) before retry-once flow.

**Mirror**: existing `cmdExit` / `cmdHeartbeat` token mismatch exit codes; `force-override-reason.js` for argv validation pattern.

**Mirror**: existing `cmdExit` / `cmdHeartbeat` token mismatch exit codes; `force-override-reason.js` for argv validation pattern; host-aware tri-state from `tryReclaimStaleLock` (preserved through R2-F2 absorption).

**Validate**:

- `pr-phase-lock-boundary.test.js`: lock body schema has `ownership_token_hash` not `ownership_token`; raw token NEVER in `cmdEnter` stdout.
- `sealed-token.test.js`: stat mode `& 0o077 === 0`; second `readSealedAndUnlink` throws ENOENT; out-of-tree sealed path rejected with `PATH_ESCAPES_GATE`.
- `stdin-token-roundtrip.test.js` (NEW — R2-F3): spawn `cmdExit` + `cmdHeartbeat` with stdin pipe, correct token → success; wrong token → exit 15/16; no `MCCP_LOCK_TEST_ARGV_TOKEN` set + raw argv → exit 17 (production-rejected).
- `no-token-in-argv.test.js` (R1-F3 hardened): during active heartbeat loop, `ps -e -o pid,args` contains 0 instances of token UUID.
- `legacy-v027-lock-reclaim.test.js` (R1-F2 + R2-F2): (a) legacy lock body + same-host + pid-alive → `tryReclaimStaleLock` returns false (NOT reclaimed); (b) legacy lock body + same-host + pid-dead → reclaim immediately; (c) legacy lock body + cross-host + within-lease → mtime path (NOT reclaimed); (d) legacy lock body + cross-host + past-lease → reclaim.

### Task 3 — F7 Bash tokenizer (HIGH, narrowed by F10)

**Action**:

1. With F10's helper-only allowlist dominant, residual Bash patterns in pr.md Phase 2.5 (post-refactor) are ~5 read-only commands. F7's mission: ensure they cannot be chained or wrapped to invoke mutators.
2. Add preprocessing to `classifyBashCommand` (mutate the local `trimmed` string before pattern match):
   - **Comment strip**: remove `#` and everything to EOL, respecting `'…'` `"…"` quoting (track quote state, do not strip `#` inside quoted strings).
   - **Indirect-invocation reject**: substring match `eval`, `bash -c`, `sh -c`, `zsh -c`, `source ` → DENY immediately.
   - **Subshell reject**: substring match `$(` or `` ` `` → DENY immediately (cannot reliably statically resolve subshell content; conservative deny).
3. Add segment split:
   - Tokenize on `;` `&&` `||` at depth 0 (track `'` `"` `(` nesting).
   - Each segment must independently match BLOCK rules (none) and ALLOW rules (one).
4. Extend `BASH_BLOCK_PATTERNS` with explicit mutating-construct detection:
   - `/\S>\S/` no-space redirect (after stripping quotes).
   - `/\d>/` or `/\d>>/` fd redirect.
   - `/\|\s*(tee|sponge)\b/` pipe-to-mutator.
   - `/\bawk\b[^|;&]*\bsystem\s*\(/` awk system call.
   - `/\bfind\b[^|;&]*\b-(exec|delete)\b/` find mutator.

**Mirror**: existing `BASH_BLOCK_PATTERNS` regex-loop structure + `classifyBashCommand` flow.

**Validate** (12 bypass cases — boundary test, all must DENY):

- `git status; git commit`
- `git status && git commit`
- `git status || git commit`
- `git status # pretend safe ; git commit` (chain inside comment — comment-strip kills the chain, but a literal `;` after `#` is gone → bare `git status` passes; **adjust expectation**: this one PASSES because the chain became inert)
- `eval "git commit -m fix"`
- `bash -c "git commit -m fix"`
- `sh -c "git push"`
- `$(git commit -m fix)`
- `` `git commit -m fix` ``
- `echo x>file`
- `cmd 2>file`
- `echo x | tee file`
- `awk 'BEGIN{system("rm x")}'`
- `find . -name x -delete`
- `find . -name x -exec rm {} \;`

### Task 4 — F5 lock-file mode 0o600 (MEDIUM)

**Action**:

1. `pr-phase-lock.js cmdEnter`: change `fs.openSync(p, 'wx')` → `fs.openSync(p, 'wx', 0o600)` (both occurrences in the `tryOpen` closure).
2. ~~`sealed-token.js writeSealed`: mode 0o600~~ **DROPPED (R3-F2)** — no file-based sealed channel; stdout-pipe IPC has no FS state to harden.
3. `v0.2.8-generic-receipt-quarantine.js acquireLock`: same `0o600` mode (cross-file consistency — shared-tenant concern is identical).

**Validate**:

- Boundary tests in `pr-phase-lock-boundary.test.js` + `sealed-token.test.js`: `(fs.statSync(p).mode & 0o077) === 0`.

### Task 5 — F8 symlink containment (MEDIUM)

**Action**:

1. Create `plugins/mccp/scripts/lib/path-containment.js`:
   - Move source of `assertContained` here (currently lives in `v0.2.8-generic-receipt-quarantine.js`).
   - Export `assertContained(targetPath, expectedParentDir, repoRoot)`.
2. `v0.2.8-generic-receipt-quarantine.js`: import + re-export for back-compat.
3. `pr-phase-lock.js cmdEnter` (and any other lock-path writer): call `assertContained(lockPath(root), path.dirname(lockPath(root)), root)` before `fs.openSync`.
4. ~~`sealed-token.js writeSealed`: containment check~~ **DROPPED (R3-F2)** — no sealed-token file to contain.

**Validate**:

- `pr-phase-lock-boundary.test.js`: create `.claude/state/pr-phase.lock` as symlink to `/tmp/external`. `cmdEnter` must throw `PATH_ESCAPES_GATE` and exit non-zero.
- Existing `path-containment.test.js` continues to PASS unchanged (re-exported symbol).

### Task 6 — F9 env var mutual exclusion (LOW)

**Action**:

1. pr.md Phase 0.3 (NEW, immediately after Phase 0.2):
   ```bash
   if [ -n "${MCCP_PR_SKIP_CODEX_REVIEW:-}" ] && [ "${CODEX_DEDUPE_AT_PR:-0}" = "1" ]; then
     echo "[MCCP-GATE-STOP] MCCP_PR_SKIP_CODEX_REVIEW + CODEX_DEDUPE_AT_PR mutually exclusive." 1>&2
     echo "  CODEX_DEDUPE_AT_PR is normally derived by Phase 2.5.2; explicit pre-export + skip env is ambiguous." 1>&2
     exit 1
   fi
   ```
2. Receipt CLI schema invariant (already enforces `codex_skipped_at_pr` ⊕ `codex_dedupe_at_pr`) — pr.md preflight is defense-in-depth + faster failure.

**Validate**:

- `pr-mutex-preflight.test.js`: table-driven `[ skip=set, dedupe=0 ]` → PASS; `[ skip=unset, dedupe=1 ]` → PASS; `[ skip=set, dedupe=1 ]` → STOP exit 1.

### Task 7 — F6 doc update (MEDIUM, doc-only)

**Action**:

1. `CLAUDE.md §3.5`:
   - Add paragraph listing BOTH `v0.2.8-generic-receipt-quarantine.lock` AND `pr-phase.lock` as canonical examples of the lease + heartbeat + ownership-token-hash pattern.
   - Replace `ownership_token` references with `ownership_token_hash`; document the **stdout-pipe IPC contract** (codex-runner spawns cmdEnter with anonymous pipe; raw token never touches filesystem) — R3-F2 absorption.
   - Document the **upgrade scenario**: v0.2.7 locks (raw `ownership_token` + no `ownership_token_hash`) are handled by the host-aware tri-state legacy policy — same-host+pid-alive=NEVER reclaim protects live holder.

**Validate**:

- `grep -c "pr-phase.lock" CLAUDE.md` ≥ 1.
- `grep "ownership_token_hash" CLAUDE.md` ≥ 1.
- `grep "stdout-pipe IPC\|stdout-pipe-ipc" CLAUDE.md` ≥ 1.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| F10 Node-helper refactor breaks pr.md control flow (env propagation, exit-code semantics, body-file mutation order) | High | High | Each helper emits JSON to stdout consumed via `node -e 'JSON.parse'`; helpers exit non-zero on hard errors to preserve `if [ $? -ne 0 ]` pattern; integration test runs full Phase 2.5 end-to-end under active lock BEFORE the followup PR commits |
| F11 ownership_token_hash + stdout-pipe IPC: in-flight v0.2.7 lock during upgrade overlap | Medium | Low | Host-aware tri-state legacy policy (R2-F2): same-host+pid-alive=NEVER reclaim protects live v0.2.7 holder; `cmdEnter` startup pre-check + `tryReclaimStaleLock` legacy-schema discriminator; CLAUDE.md §3.5 documents the upgrade scenario explicitly |
| F7 tokenizer over-conservative — false-positive on legitimate residual Phase 2.5 Bash | Medium | Medium | Tokenizer runs FIRST (R2-F1 + R3-F1) against ALL Bash including helper-path matches; allowlist match is post-tokenizer trust gate; tokenizer's residual scope is the read-only catalog (~5 patterns) so false-positive surface is bounded |
| Helper test surface (~6 new test files) inflates test runtime | Low | Low | Helpers are pure-ish (subprocess stubs in tests); total addition expected <100 cases |
| ~~sealed-token file leak between writeSealed/readSealedAndUnlink~~ | ~~Medium~~ | ~~Medium~~ | **OBVIATED by R3-F2**: file-based sealed channel dropped; stdout-pipe IPC has no FS state to leak |
| Refactor scope leak — pr.md Phase 2.5 has security-reviewer + impeccable sub-steps wired via Bash; helper extraction tempts further refactor | Medium | Medium | Strict scope: helpers absorb ONLY Codex-review subphase + finalize-receipt + body-builder for the 3 audit sections. security/impeccable preflights stay in pr.md Phase 0.x |
| F10 self-application meta-defect re-introduced via a future hook update | Low (post-cycle) | High | Integration test that runs pr.md Phase 2.5 under active lock is the canonical regression — add to CI checklist |

## Acceptance

- [ ] **F10** integration test runs pr.md Phase 2.5 end-to-end under active lock — 0 hook DENY, 0 mutations, receipt written
- [ ] **F10** `pr-phase-guard.js BASH_ALLOW_PATTERNS` includes ONE path-anchored pattern matching `pr-phase-helpers/[a-z-]+\.js` AND a minimal read-only catalog (≤5 patterns)
- [ ] **F11** `pr-phase.lock` body contains `ownership_token_hash` (sha256 hex), NEVER `ownership_token`
- [ ] **F11 (R3-F2)** `cmdEnter` stdout contains raw `ownership_token` BUT the only production caller spawns it with `stdio: ['ignore', 'pipe', 'inherit']` (anonymous pipe). NEVER any `*.token` files on disk.
- [ ] **F11 (R3-F2)** `pr-phase-guard.js` BASH_BLOCK_PATTERNS denies `pr-phase-lock.js enter` via Bash during Codex-review subphase (defense-in-depth against accidental Bash regression)
- [ ] **F11 (R3-F2)** `stdout-pipe-ipc.test.js` PASSES: anonymous pipe, never on FS, parent-only readable
- [ ] **F7** all 14 tokenizer bypass cases (chain x3, indirect-invoke x3, subshell x2, no-space-redirect, fd-redirect, pipe-to-tee, awk-system, find-delete, find-exec) produce DENY in `pr-phase-guard.test.js`
- [ ] **F5** `(fs.statSync(pr-phase.lock).mode & 0o077) === 0` AND same for `v0.2.8-generic-receipt-quarantine.lock` (sealed-token file row OBVIATED by R3-F2)
- [ ] **F8** symlink-out-of-repo `lockPath` → `cmdEnter` exits non-zero with `PATH_ESCAPES_GATE` (sealed-token containment row OBVIATED by R3-F2)
- [ ] **F9** `MCCP_PR_SKIP_CODEX_REVIEW` + `CODEX_DEDUPE_AT_PR=1` both set → pr.md Phase 0.3 STOP exit 1
- [ ] **F6** CLAUDE.md §3.5 references BOTH lock files + `ownership_token_hash` + stdout-pipe IPC contract + legacy v0.2.7 upgrade scenario
- [ ] Full mccp test suite passes (303+ test baseline preserved; new test count ≥30)
- [ ] PR-Codex Round 2 verdict ≠ `needs-attention` (F10 CRITICAL + F11 HIGH absorbed; residual findings ≤ MEDIUM)
- [ ] After this followup PR lands: v0.2.8 Task 2.6.4 (plugin.json 0.2.7→0.2.8 bump + announce PR) is unblocked downstream
- [ ] Self-dogfood: this followup's own `/mccp:pr` run completes under the new hook without `[MCCP-GATE-STOP]` (proves F10 fixes the self-application meta-defect)

## Open Questions

- **MEDIUM — security-reviewer reuse**: F10 Node-helper refactor changes the `pr-phase-guard.js` attack surface (path-anchored allowlist). Trigger a `mccp:security-reviewer` Task pass during `/mccp:prp-implement` for this followup (extra gate cost) or rely on PR-Codex R2 alone? **Recommendation**: rely on PR-Codex R2 — it already flagged F10/F11 and convergence on the helper surface is straightforward; extra security-reviewer round is incremental cost for marginal coverage.
- **LOW — sealed-token startup sweep policy**: 1-hour mtime sweep in codex-runner (current Risks-table proposal) vs delete-on-process-exit via Node `process.on('exit')` (stronger but doesn't catch SIGKILL). **Recommendation**: BOTH — `process.on('exit')` covers happy path + SIGINT/SIGTERM via signal handlers; 1-hour sweep covers SIGKILL/crash.
- **LOW — back-compat re-export in `v0.2.8-generic-receipt-quarantine.js`**: F8 helper extraction inverts source location. Keep re-export indefinitely or schedule removal post-v0.2.8? **Recommendation**: keep indefinitely — re-export is a one-line cost and avoids breaking any external caller that imports from the migration file.
- **LOW — `MCCP_PR_PHASE_LOCK_DISABLE` escape hatch**: should followup add an env var to bypass the lock entirely for break-glass recovery (e.g. hook itself is broken)? **Recommendation**: NO — that defeats the milestone. If the hook is broken, the fix is to disable the plugin or downgrade, not bypass the lock.

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

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill 미등록 — plan-codex는 lenient gate이므로 `meta.impeccable_skipped=true` warning으로 처리. 본 plan은 markdown 텍스트 / 구조 / 정책 결정 중심이며 UI/디자인 surface 없음 — `design_signal=false` 일치.)

## Codex Adversarial Review

- **호출**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- **라운드 수**: R1 (verdict `needs-attention`, 3 findings → 3 ABSORBED → Tasks/Acceptance amended → R2 verification pending)
- **합치 결론 (R1)**: "No-ship: the plan still has trust-boundary holes in the new helper allowlist and token handling, plus an upgrade-lock recovery assumption that is not supported by the described legacy schema." 3 findings 전부 substantive, plan body로 흡수 후 R2 재검증.

### R1 absorptions (3/3 ACCEPTED)

| # | Sev | Title | Disposition |
|---|---|---|---|
| R1-F1 | CRITICAL 0.78 | Helper allowlist can bless mutable code under review (self-application meta-defect re-emerges via repo-path helpers) | **ABSORB → Task 1 amended**: `BASH_ALLOW_PATTERNS` matches `realpath(${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/[a-z-]+\.js)` — installed plugin cache path, NOT repo working-tree path. Helpers modified in the repo do NOT match. Dev workflow constraint: `/plugin update mccp` reinstall required between helper edits and test. Add regression test: modified-helper-in-repo + active lock → DENY. |
| R1-F2 | HIGH 0.86 | Fresh-only recovery relies on parse-error legacy locks won't produce (v0.2.7 lock body has raw `ownership_token` + valid JSON, not parse error) | **ABSORB → Task 2 amended**: `tryReclaimStaleLock` extended with legacy-schema detection — if `body.ownership_token && !body.ownership_token_hash`, reclaim immediately (no mtime wait). New fixture test `legacy-v027-lock-reclaim.test.js` with hand-crafted v0.2.7 lock body. CLAUDE.md §3.5 documents the legacy-schema immediate-reclaim semantics. |
| R1-F3 | MEDIUM 0.70 | Raw token still exposed via subprocess argv (`--ownership-token <raw>` visible to same-user process inspection) | **ABSORB → Task 2 amended**: token propagation between codex-runner and pr-phase-lock subprocesses switches from argv to **stdin pipe**. `codex-runner.js` spawns heartbeat/exit with `stdin: 'pipe'`, writes raw token bytes, closes stdin. `pr-phase-lock.js cmdHeartbeat`/`cmdExit` read stdin when `--ownership-token-stdin` flag is set (no `--ownership-token` argv accepted in production code path; the legacy argv form is retained ONLY in unit-test fixtures with explicit `MCCP_LOCK_TEST_ARGV_TOKEN=1` opt-in). Regression test: `ps -e -o pid,args | grep ownership-token` returns 0 hits during active lock. |

### R1 Task amendments (applied above)

- **Task 1 (F10)**:
  - `pr-phase-guard.js` `BASH_ALLOW_PATTERNS` pattern becomes:
    ```js
    // R1-F1 absorption — pin to installed plugin cache realpath
    const HELPERS_REAL = (() => {
      try { return fs.realpathSync(path.join(process.env.CLAUDE_PLUGIN_ROOT, 'scripts', 'lib', 'pr-phase-helpers')); }
      catch { return null; }
    })();
    // Allowlist match: command starts with `node <HELPERS_REAL>/<helper>.js`
    ```
    where `<helper>.js` is one of the 5 fixed helper names. Hook re-resolves on each PreToolUse call to handle plugin updates mid-session.
  - New regression test in `pr-phase-guard.test.js`: write a fake helper to a temp repo working-tree path, invoke under active lock with that repo path argv → DENY.

- **Task 2 (F11)** — additional surface:
  - `tryReclaimStaleLock` legacy-schema branch (immediate reclaim, no mtime wait).
  - `cmdEnter` also pre-checks for legacy lock at startup and proactively reclaims before retry-once flow.
  - `sealed-token.js` + `codex-runner.js` stdin-pipe token propagation; argv token disabled outside test opt-in.
  - `legacy-v027-lock-reclaim.test.js` (NEW) + `no-token-in-argv.test.js` (NEW).

### R1 acceptance additions (BLOCKING)

- [ ] **R1-F1** `pr-phase-guard.js` allowlist regex matches `realpath(${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/[a-z-]+\.js)` — repo-path helpers do NOT match
- [ ] **R1-F1** modified-helper-in-repo regression test PASSES (write to helper in repo working tree → invoke under active lock → DENY)
- [ ] **R1-F2** `legacy-v027-lock-reclaim.test.js` PASSES — legacy v0.2.7 lock body (`ownership_token` raw + no `ownership_token_hash`) is reclaimed immediately by `tryReclaimStaleLock` regardless of mtime
- [ ] **R1-F2** CLAUDE.md §3.5 documents legacy-schema immediate-reclaim path
- [ ] **R1-F3** `no-token-in-argv.test.js` PASSES — `ps -e -o pid,args` during active lock contains 0 instances of token UUID
- [ ] **R1-F3** `cmdHeartbeat`/`cmdExit` production path REJECTS `--ownership-token <raw>` argv (only stdin pipe accepted unless `MCCP_LOCK_TEST_ARGV_TOKEN=1`)

### R2 verification (verdict `needs-attention`, 3 findings → 3 ABSORBED → Task bodies PROMOTED → R3 verification pending)

R2 합치 결론: "No-ship: the R1 absorptions still leave a helper trust-boundary bypass, a live-upgrade lock race, and contradictory token propagation requirements that can preserve argv exposure." R2의 핵심 통찰 — R1 absorptions이 plan body의 *기록*에만 머물고 *primary Task action contract*에는 반영되지 않은 contradiction을 Codex가 line-cite. 본 R2 absorption은 amendment 대신 Task body 본문 직접 promotion으로 처리.

### R2 absorptions (3/3 ACCEPTED, Task body PROMOTED)

| # | Sev | Title | Disposition |
|---|---|---|---|
| R2-F1 | CRITICAL 0.86 | Helper allowlist still treats mutable installed helper code as trusted (cache pinning alone insufficient; tokenizer doesn't run before helper match) | **PROMOTED to Task 1 §6**: content-hash manifest captured at lock entry (`lock.helper_manifest`); hook re-computes sha256 at invocation time and compares; tokenizer runs FIRST so `node helper; git commit` chain is rejected at segment level before allowlist match; path match is *necessary not sufficient* — content hash is the trust gate. Tests `helper-manifest-mutation.test.js` + `tokenizer-before-allowlist.test.js` added. |
| R2-F2 | HIGH 0.83 | Legacy-schema immediate reclaim violates same-host+alive=NEVER invariant (could steal live v0.2.7 lock during upgrade) | **PROMOTED to Task 2 §6**: legacy-schema discriminator runs AFTER host-aware policy. (a) same-host+pid-alive → NEVER reclaim regardless of schema; (b) same-host+pid-dead → reclaim immediately (legacy + new schema both); (c) cross-host or zero-byte → mtime-lease path. `cmdEnter` startup pre-check invokes `tryReclaimStaleLock` (which respects live-PID invariant). Test `legacy-v027-lock-reclaim.test.js` covers 4 cases — (a)/(b)/(c)/(d) host+pid combinations. |
| R2-F3 | HIGH 0.91 | Task body still instructs argv token propagation, contradicting R1-F3 absorption record | **PROMOTED to Task 2 §2+§4**: stdin pipe is the ONLY production contract throughout primary action. `cmdExit`/`cmdHeartbeat` accept `--ownership-token-stdin` flag, read from `process.stdin` to EOF. Raw argv form REJECTED at production code path (exit 17) UNLESS `MCCP_LOCK_TEST_ARGV_TOKEN=1`. `codex-runner.js` spawns subprocesses with `stdio: ['pipe', 'inherit', 'inherit']`, writes token to child stdin then closes. Background heartbeat fork holds token in memory + setInterval (no per-tick stdin write). pr-phase-guard.js additionally blocks Bash containing `MCCP_LOCK_TEST_ARGV_TOKEN=1` substring during Codex-review subphase. Test `stdin-token-roundtrip.test.js` added. |

### R2 acceptance additions (BLOCKING)

- [ ] **R2-F1** `lock.helper_manifest` field present in `cmdEnter` JSON output + each helper has sha256 hex value
- [ ] **R2-F1** `helper-manifest-mutation.test.js` PASSES (cache helper rewritten mid-lock → next invocation DENY)
- [ ] **R2-F1** `tokenizer-before-allowlist.test.js` PASSES (`node <helper>.js; git commit` → DENY at chain-split, not allowlist)
- [ ] **R2-F2** `legacy-v027-lock-reclaim.test.js` 4-case matrix PASSES — same-host+alive=NEVER preserved for legacy bodies
- [ ] **R2-F3** `stdin-token-roundtrip.test.js` PASSES — stdin path success + argv path REJECTED in production
- [ ] **R2-F3** production `cmdExit`/`cmdHeartbeat` invocation with raw `--ownership-token <raw>` argv AND no `MCCP_LOCK_TEST_ARGV_TOKEN=1` → exit 17 + stderr
- [ ] **R2-F3** `pr-phase-guard.js` denies Bash containing `MCCP_LOCK_TEST_ARGV_TOKEN=1` substring during Codex-review subphase

### R3 verification (verdict `needs-attention`, 3 findings → 3 ABSORBED via textual-cleanup + sealed-channel rethink → **cap-at-3 reached, plan body re-promoted as single source of truth**)

R3 합치 결론: "No-ship: the R2 fixes are promoted into task bodies, but the plan still contains contradictory source-of-truth text for R2-F1/R2-F2 and leaves a raw-token file path inside an allowed read surface." R3 surfaced two textual-contradiction findings (R3-F1 / R3-F3) plus one architectural sharpening (R3-F2 sealed-token race). Phase 5.4 cap-at-3 reached — substantive convergence via plan body rewrites instead of an R4 round.

### R3 absorptions (3/3 ACCEPTED, plan body PROMOTED)

| # | Sev | Title | Disposition |
|---|---|---|---|
| R3-F1 | HIGH 0.94 | Helper allowlist ordering still contradicted in Approved Decision §1 + Risks table (tokenizer-vs-allowlist order) | **PROMOTED**: Approved Decision §1 last sentence rewritten — "tokenizer (chain-split + mutating-construct detect) runs FIRST against every Bash command, including helper-path matches. Helper-path match is the post-tokenizer trust gate — necessary but not sufficient." Risks table inverted likewise. Single source of truth restored across plan body. |
| R3-F2 | HIGH 0.80 | Sealed token file `.git/mccp/tmp/<uuid>.token` is readable via allowlisted `cat .git/mccp/tmp/` between writeSealed/unlink; same-user race attacker can steal ownership | **PROMOTED — file-based sealed channel DROPPED entirely**: `sealed-token.js` helper removed from Files to Change + replaced with `stdout-pipe-ipc.js`. Tasks 1 §5, 2 §1, 2 §4 rewritten. F5/F8 sealed-token rows obviated. `cat .git/mccp/tmp/` allowlist narrowed to exact filename `cat .git/mccp/tmp/codex-invoke.stderr`. `*.token`/`*.tok` reads explicitly denied. `cmdEnter` returns raw token in stdout — safe because codex-runner.js (sole production caller) spawns with `stdio: ['ignore', 'pipe', 'inherit']` anonymous pipe. BASH_BLOCK_PATTERNS additionally denies `pr-phase-lock.js enter` via Bash during Codex-review subphase (eliminates Bash shell variable capture leak). |
| R3-F3 | MEDIUM 0.88 | Decision 2 still documents fresh-only parse-error / zero-byte recovery path (contradicts R2-F2 promotion's host-aware tri-state legacy policy) | **PROMOTED**: Decision 2 body rewritten — title becomes "F11 = ownership_token_hash + stdout-pipe IPC". Legacy v0.2.7 lock recovery text replaced with host-aware tri-state semantics: same-host+pid-alive=NEVER reclaim; same-host+pid-dead=reclaim; cross-host/zero-byte=mtime-lease. Risks table line on F11 fresh-only inverted likewise. |

### R3 acceptance additions (BLOCKING)

- [ ] **R3-F1** Approved Decision §1 ending + Risks table F7 row both state "tokenizer runs FIRST" — `grep -n "matches before tokenization\|allowlist runs BEFORE F7" .claude/plans/v0-2-8-task-2-6-1-followup.plan.md` returns 0 lines (post-R3 invariant)
- [ ] **R3-F2** Files to Change has NO `sealed-token.js` row (strikethrough only); `stdout-pipe-ipc.js` row present; `cat .git/mccp/tmp/codex-invoke.stderr` (exact filename) is the only `.git/mccp/tmp/` read-allowlist match; `\.tok(en)?$` is a BLOCK pattern
- [ ] **R3-F3** Decision 2 body NEVER mentions "parse-error" or "zero-byte" as recovery path for v0.2.7 locks — only tri-state legacy policy

### Convergence note (cap-at-3 reached)

After R1+R2+R3 absorption the plan exercises:

1. **F10 path (a)** with content-hash manifest + tokenizer-first allowlist (NOT cache pinning alone).
2. **F11 stdout-pipe IPC** between codex-runner.js ↔ pr-phase-lock subprocesses (NO filesystem token state). Token in stdout JSON is safe because only the anonymous-pipe parent reads it.
3. **F7 tokenizer FIRST** against ALL Bash including helper-path matches (chain-split + comment-strip + indirect-invoke reject + subshell reject + mutating-construct detect).
4. **Legacy v0.2.7 lock** handled by host-aware tri-state preserving live-PID invariant.
5. **F5/F8** scoped to lock files only (sealed-token file rows obviated).
6. **F9 mutex preflight**, **F6 doc update**, **Self-dogfood acceptance** all unchanged.

R4 verification deferred — Phase 5.4 cap-at-3 policy. The R3 findings were all textual / architectural-sharpening type, not new defects; the plan body now serves as the single source of truth with R1/R2/R3 audit trail preserved in this section. Per prior cycle precedent (v0-2-8-task-2-6-1-fix.plan.md R3 cap-as-converged), the implementation contract is unambiguous.

### Codex session 참조

- R1: threadId `019ea190-ab01-7121-8567-1f9c4e952133` (raw: `.git/mccp/tmp/codex-r1-followup.json`)
- R2: threadId `019ea195-76d9-7003-8754-0abf8db973d0` (raw: `.git/mccp/tmp/codex-r2-followup.json`)
- R3: threadId `019ea19b-e21a-7201-8d03-f0bfe8f2a585` (raw: `.git/mccp/tmp/codex-r3-followup.json`)

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1+R2+R3 absorptions, cap-at-3 reached, implementation contract unambiguous per Convergence note). No new implement-time decisions detected. Cross-gate dedupe applied.

- **Round**: dedupe-applied (no implement-Codex round invoked)
- **합치 결론**: see `## Codex Adversarial Review` §Convergence note — F10 path (a) Node wrappers + content-hash manifest + tokenizer-first; F11 stdout-pipe IPC + ownership_token_hash + host-aware tri-state legacy; F7 tokenizer FIRST; F5/F8 lock-file scoped; F9/F6 unchanged.
- **수용/거부**: all 9 Plan-Codex absorptions (R1-F1/F2/F3 + R2-F1/F2/F3 + R3-F1/F2/F3) carry into implementation as-is; no implement-time deltas.
- **Open Questions**: security-reviewer reuse (Plan §Open Questions §1 recommendation: skip, rely on PR-Codex R2 dual-coverage) — applied here per user decision 2026-06-07.
- **session**: cross-gate dedupe (no Codex session for implement gate)

### Security Reviewer

> security-reviewer skipped (plan recommendation): rely on PR-Codex R2 dual-coverage; F10/F11 already R2-flagged + R2 absorbed into plan body as Task 1/2 contracts. Will be re-reviewed at /mccp:pr gate (terminal Codex round).

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing

(Followup plan implementation is library/hook code — no UI/design surface — design_signal=false expected.)
