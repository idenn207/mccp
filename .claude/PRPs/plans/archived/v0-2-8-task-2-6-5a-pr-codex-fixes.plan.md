---
plan_id: v0-2-8-task-2-6-5a-pr-codex-fixes
parent_plan: v0-2-8-pr-workflow-hardening
source_findings: .claude/PRPs/reports/v0-2-8-task-2-6-5a-pr-codex-findings.md
codex_thread: 019e9cc3-f470-7382-8c74-f05c30591c0f
status: pending
complexity: Medium
created_at: 2026-06-06
---

# Plan: v0.2.8 Task 2.6.5a — PR-Codex R6 ship-blocker fixes

**Source PRD**: `.claude/PRPs/reports/v0-2-8-task-2-6-5a-pr-codex-findings.md` (PR-Codex R6 findings, 2026-06-06)
**Selected Milestone**: v0.2.8 Task 2.6.5a (fix-cycle on top of shipped Task 2.6.5 — commits `6a2cbd0`, `90895f4`)
**Complexity**: Medium

## Summary

PR-Codex R6 (planned ship-readiness gate for Task 2.6.5) returned `verdict=needs-attention` with 3 ship-blockers that the Implement-Codex R5 absorption-text review missed. Task 2.6.5a is a focused fix-cycle that adds (b) lock ownership token + stricter stale criterion, (a) path-containment guard for generic-receipt quarantine, and (c) tempfail exit propagation through `validate-cmd`/`preflight`/`cli`. After all three fixes land with regression tests, R6 is re-invoked against the new diff — the same Codex thread (`019e9cc3-...`) is referenced for continuity. PR creation for v0.2.8 remains blocked until R6 returns `verdict=approve`.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Atomic write (anchor for lock body) | [`v0.2.8-generic-receipt-quarantine.js:74-80`](../../plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js#L74-L80) (`writeMarkerAtomic` tmp+rename) | All-or-nothing on-disk visibility — applied to lock body: single `writeFileSync` after token generation, not `openSync('wx')` + separate `writeSync` |
| Ownership token verification | [`validate-cmd.js:173-181`](../../plugins/mccp/scripts/receipt/validate-cmd.js#L173-L181) (`subjectHash` mismatch → `stale` push) | "fingerprint stored at write, re-derive at consume, mismatch = ownership transferred" — mirror for `releaseLock` |
| Path resolution + git root | [`hash.js gitRepoRoot`](../../plugins/mccp/scripts/receipt/hash.js) + `path.resolve` already used in [`store.js:14`](../../plugins/mccp/scripts/receipt/store.js#L14) | Normalize-then-compare prefix — for path containment, `fs.realpathSync(receipt.path)` startsWith `fs.realpathSync(receiptsDir(repoRoot)/<gate>)` |
| Tempfail return shape | [`evaluateForDedupe` return + CLI mapping](../../plugins/mccp/scripts/receipt/cli.js#L292-L305) (`{ ok, ...extra }` → cli exits 2 when `!ok`) | Extend result type with `exitCode?` and `tempfail?` top-level fields; CLI/preflight check `tempfail` BEFORE the generic `ok→2` mapping |
| Errors | [`validate-cmd.js:53-63`](../../plugins/mccp/scripts/receipt/validate-cmd.js#L53-L63) (`not a git repository` → `blocking._meta` entry with `result.reason`) | New conditions emit one `blocking` push with `_meta` gate_id + descriptive `reason`; symlink rejection follows the same shape |
| Tests | [`v0.2.8-generic-receipt-quarantine.test.js`](../../plugins/mccp/scripts/migrations/tests/v0.2.8-generic-receipt-quarantine.test.js) — `mkTmpRepo` helper + `test()` per axis, axis tag in title | One test file per finding; axis-named tests; `mkTmpRepo()` from `receipt/tests/helpers.js` reused for filesystem fixtures |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` | UPDATE | Findings 1+2: rewrite `acquireLock`/`releaseLock`/`tryReclaimStaleLock` (ownership token + stricter stale); add path-containment guard in `renameWithCollisionSafety` |
| `plugins/mccp/scripts/receipt/store.js` | UPDATE | Finding 1: `listGenericReceipts` uses `lstatSync` + realpath check; skips symlinked/junctioned gate dirs |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | F3: top-level `result.tempfail`/`result.exitCode` + `blocking[]` entry with `kind: "tempfail"` |
| `plugins/mccp/scripts/receipt/classify.js` | **CREATE** | **R2 F2**: shared `classifyValidationResult(result)` helper used by ALL 5 consumer paths |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | F3: `cmdValidate` calls `classifyValidationResult` → tempfail=75/block=2/ok=0 |
| `plugins/mccp/scripts/receipt/preflight.js` | UPDATE | F3: `preflight()` calls `classifyValidationResult` → tempfail=75/block=2/ok=0; `writeBlockReason` labels `kind:"tempfail"` entries as `TEMPFAIL` |
| **`plugins/mccp/scripts/hooks/receipt-prompt.js`** | **UPDATE** | **R2 F2**: PreToolUse hook calls `classifyValidationResult` — tempfail → ALLOW + retry systemMessage (NOT block) |
| **`plugins/mccp/scripts/hooks/receipt-skill.js`** | **UPDATE** | **R2 F2**: PreToolUse Skill hook same shape as receipt-prompt |
| **`plugins/mccp/scripts/lib/auto-chain.js`** | **UPDATE** | **R2 F2**: orchestrator calls `classifyValidationResult` — tempfail → abort chain + retry hint (NOT hard-fail) |
| `plugins/mccp/scripts/migrations/tests/v0.2.8-generic-receipt-quarantine.test.js` | UPDATE | Add axes `(i)`-`(o)` — 7 new (R1 F1/F2 + R2 F1 mandatory heartbeat) |
| `plugins/mccp/scripts/migrations/tests/path-containment.test.js` | CREATE | F1: symlink/junction gate dir → reject; canary outside `.claude/receipts/<gate>` → throw |
| `plugins/mccp/scripts/receipt/tests/tempfail-propagation.test.js` | CREATE | F3 axes `(δ)`, `(ε)`, `(ζ)` |
| `plugins/mccp/scripts/receipt/tests/tempfail-precedence.test.js` | CREATE | R1 F3 axes `(η)`, `(θ)` precedence + invariant |
| `plugins/mccp/scripts/receipt/tests/classify.test.js` | **CREATE** | **R2 F2** axis `(ι)` — classifier coverage |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-tempfail.test.js` | **CREATE** | **R2 F2** axis `(κ)` — receipt-prompt tempfail handling |
| `plugins/mccp/scripts/hooks/tests/receipt-skill-tempfail.test.js` | **CREATE** | **R2 F2** axis `(λ)` — receipt-skill tempfail handling |
| `plugins/mccp/scripts/lib/tests/auto-chain-tempfail.test.js` | **CREATE** | **R2 F2** axis `(μ)` — auto-chain tempfail handling |
| `CLAUDE.md` | UPDATE | §4 quarantine runbook: note "lock body now includes ownership token; do not hand-edit lock file"; §3.3 fail-closed matrix: add exit-75 row for tempfail |
| `.claude/PRPs/reports/v0-2-8-task-2-6-5a-implementation.md` | CREATE | Implementation report after fixes land — referenced by R6 re-invocation |

## Tasks

### Task A1: Lock acquisition invariant + lease-based reclaim + ownership token (Findings 1+2 — MEDIUM 0.78 + HIGH 0.86) — R1 absorption

**Lock acquisition invariant (R1 F1 absorption — single exclusive primitive)**:
- The ONLY allowed lock-acquire primitive is `fs.openSync(path, 'wx')` — exclusive create on POSIX, exclusive create on Windows. NO tmp+rename fallback.
- After successful `openSync('wx')`, immediately `fs.writeSync(fd, JSON.stringify({pid, started_at, host, token}))` then `fs.closeSync(fd)`. The token is `crypto.randomUUID()`.
- Between `openSync('wx')` (lock created) and `writeSync` (body populated), the file is zero-byte. A contender sees `EEXIST` (correct — we hold ownership). On `tryReclaimStaleLock`, an empty body MUST be treated as HELD (do NOT reclaim) — only the lease check (below) can reclaim it.
- Rationale: `wx` alone guarantees create-if-absent ownership but not body visibility. tmp+rename guarantees body visibility but not create-new ownership unless paired with exclusive create. Picking ONE primitive and treating partial/empty bodies as held closes both holes without dual-mode complexity.

**Lease-based reclaim + MANDATORY heartbeat (R1 F2 + R2 F1 absorption — mtime-driven, PID secondary)**:
- New constant `LEASE_TTL_MS = 60_000` (60s — same value as the deprecated `STALE_LOCK_MS`).
- New constant `HEARTBEAT_INTERVAL_MS = 15_000` (`LEASE_TTL_MS / 4` — refresh 4× per lease window for safety margin against scheduler jitter and slow filesystems).
- `tryReclaimStaleLock` orphan criterion: reclaim when **`pidDead` OR `mtime > LEASE_TTL`**. mtime is the primary signal — independent of `started_at`, independent of body parseability. PID liveness is a secondary "early reclaim if obviously dead" optimization.
- **MANDATORY heartbeat (R2 F1 absorption)**: every call to `acquireLock` MUST register a heartbeat. `migrate()` wires `setInterval(() => fs.utimesSync(lockPath, now, now), HEARTBEAT_INTERVAL_MS)` immediately after acquire and `clearInterval` in `finally` BEFORE `releaseLock`. Without this, a live holder running past 60s gets its lock stolen (R2 F1 critique). Heartbeat is not opt-in — every lock holder pays this cost. Heartbeat overhead is `fs.utimesSync` (one syscall) every 15s — negligible.
- **Sync-loop heartbeat caveat**: Node timers are dispatched between sync events. A long-running sync loop (e.g. 200 `renameSync` calls) could starve the heartbeat. Mitigation: A1 implementation MUST yield to the event loop between batches if the migration scans > 50 receipts. Concretely: after every 50 rename ops, `await new Promise(r => setImmediate(r))` (requires `migrate()` to become async — acceptable change; callers already `await` via systemMessage hook contract). **Decision at implement-time**: if benchmarks show 200-receipt migration completes under HEARTBEAT_INTERVAL_MS/2 (7.5s), the yield is unnecessary; document in implementation report.
- Why mtime+PID is not enough alone (R2 F1 reasoning): mtime > LEASE_TTL by itself is reclaimable independent of PID liveness — so a slow-disk holder past LEASE_TTL has its lock stolen even while alive. Mandatory heartbeat closes this by ensuring mtime stays fresh while holder is genuinely active. The ownership token (below) is the secondary defense — even if reclaim races, the original holder's `releaseLock` won't clobber the new winner's lock.
- Unparsable lock body: treated as held until `mtime > LEASE_TTL`. NEVER reclaim an unparsable body purely on age of `started_at` parsing (it has no `started_at` to parse).

**Ownership token (cross-cuts F1+F2)**:
- `acquireLock` returns `{ lockPath, token }` (was: just the path).
- `releaseLock(repoRoot, token)` re-reads lock body, verifies `body.token === token` BEFORE unlink. Mismatch → no-op + stderr warn (do not throw — release lives in `finally`).
- `migrate()` finally-block threads the returned `token` into `releaseLock`.
- Why: ensures a reclaimed-then-stolen lock can't be unlinked by the original holder. Without this, an original holder waking up after lease expiry would clobber the new winner's lock.

**Mirror**: `subjectHash` ownership-verification (write fingerprint, verify at consume). Lease-mtime pattern mirrors Unix lockfile convention (e.g. `flock(2)` semantics in single-machine context).

**Validate**:
```bash
node --test plugins/mccp/scripts/migrations/tests/v0.2.8-generic-receipt-quarantine.test.js
# New axes (i), (j), (k), (l), (m) must pass.
```

**Regression coverage** (added to existing test file as new `test()` blocks):
- `(i) lock token rejected on steal`: P1 acquires lock → gets token T1. P2 reads lock file, rewrites it with its own token T2 (steal attempt). P1's `releaseLock(repoRoot, T1)` no-op + stderr warn. Lock file MUST still exist after P1's release.
- `(j) zero-byte lock treated as held until mtime-stale (R1 F1 absorption)`: Test writes a zero-byte lock file via `fs.openSync('wx')` then immediate `closeSync` (no body write). `tryReclaimStaleLock()` returns `false` while `mtime` is fresh. Backdate `mtime` past `LEASE_TTL` via `fs.utimesSync` → returns `true`, file unlinked. This is the contention-window test Codex specifically requested.
- `(k) unparsable lock respected until mtime-stale`: write `"corrupt-not-json"` to lock; fresh mtime → reclaim returns `false`; backdate mtime → reclaim returns `true`.
- `(l) live-but-unrelated PID with stale/future timestamps reclaimed by mtime (R1 F2 absorption)`: write body with `pid = process.pid` (alive), `started_at = "9999-01-01T00:00:00.000Z"` (future). Set file mtime past `LEASE_TTL`. `tryReclaimStaleLock()` returns `true` — mtime trumps PID liveness. This is the PID-reuse / wrong-started_at regression Codex specifically requested.
- `(m) live PID + fresh mtime not reclaimed (lease respected)`: write body with `pid = process.pid` (alive), valid recent `started_at`, fresh mtime. Reclaim returns `false` — lease still valid.
- `(n) mandatory heartbeat keeps live holder safe past LEASE_TTL (R2 F1 absorption)`: simulate P1 holding lock with mandatory heartbeat active for `LEASE_TTL + 30s`. While P1 holds, P2 calls `tryReclaimStaleLock()` every 10s. Assert: every P2 reclaim attempt returns `false` (P1's heartbeat keeps mtime fresh). After P1 releases, P2's next reclaim succeeds. This is the Codex-requested "P1 heartbeats past LEASE_TTL while P2 must not reclaim" axis. Test uses fake timers (`node:timers/promises`) to avoid 90s real-time test.
- `(o) sync-loop starvation guard (R2 F1 absorption — defensive)`: synthetic case where `migrate()` is forced to scan 200 receipts. Assert heartbeat fires at least once during the rename loop (verifies `setImmediate` yield is wired if needed). If migration runs faster than `HEARTBEAT_INTERVAL_MS/2`, assert no yield is necessary and test skips — implementer documents the runtime in implementation report.

**R1 absorption note for implementer**: do NOT layer tmp+rename atop `wx`. The two are mutually exclusive lock-acquire primitives. The risk table row "Ownership token write race ... wx vs tmp+rename" (below in Risks) is RESOLVED by this absorption — A1 mandates `wx`-only.

### Task A2: Path-containment guard for generic-receipt quarantine (Finding 1 — HIGH 0.82)

**Action**:
- Add `assertContained(receiptPath, gateDir)` helper in migration script:
  ```
  const resolvedReceipt = fs.realpathSync(receiptPath);
  const resolvedGateDir = fs.realpathSync(gateDir);
  if (!resolvedReceipt.startsWith(resolvedGateDir + path.sep)) throw Error('path escapes gate dir');
  // Also assert resolvedGateDir.startsWith(realpath(<repoRoot>/.claude/receipts) + sep)
  ```
- Call before `fs.renameSync` in `renameWithCollisionSafety` — both for source (`receipt.path`) AND computed target (`targetPath` / `collisionTarget`).
- In `store.js listGenericReceipts` (and `listReceipts` upstream), skip gate dirs where `fs.lstatSync(gateDir).isSymbolicLink()` returns `true`. On Windows, also reject junctions: `fs.lstatSync(gateDir).isSymbolicLink() || lstatSync(gateDir).isDirectory() === false`. Emit a structured skip-warning via the optional `opts.systemMessage` (caller already wired in `validateCommand`).

**Mirror**: `store.js:60` (`statSync().isDirectory()` followed by directory iteration) — pattern is correct in shape, just needs `lstat` swap + realpath canary.

**Validate**:
```bash
node --test plugins/mccp/scripts/migrations/tests/path-containment.test.js
```

**Regression coverage** (new file `path-containment.test.js`):
- `(α) symlinked gate dir rejected by listGenericReceipts`: in tmp repo, replace `.claude/receipts/mccp-plan-codex` with a symlink to `<tmp>/external-receipts/mccp-plan-codex`, plant `default.json` inside the external dir. `listGenericReceipts(repo)` must NOT return that receipt. Test SKIPPED on Windows where symlink creation needs admin — assert behavior on POSIX, use junction on Windows via `fs.symlinkSync(target, link, 'junction')` if available.
- `(β) realpath canary outside gate dir → migration throws`: construct a `receipt` object with `decision_id="default"` and `path="<external-path>/default.json"` (not actually under repo). Call `renameWithCollisionSafety(receipt)` directly → must throw with `code` matching the path-escape sentinel; source must NOT be renamed.
- `(γ) normal in-tree path still passes`: standard `mccp-plan-codex/default.json` under repo's real `.claude/receipts/` succeeds (regression guard against false-positive containment check).

### Task A3: Tempfail canonical shape + exit propagation (Finding 3 — MEDIUM 0.74) — R1 absorption

**Canonical tempfail shape + shared classifier (R1 F3 + R2 F2 absorption — single source of truth, kind-marked blocking, ALL consumers via shared helper)**:
- Decision: **top-level `result.tempfail` is the canonical signal**; the `blocking[]` entry is preserved for backward JSON compatibility but MUST carry `kind: "tempfail"` to disambiguate from hard blocks.
- `validate-cmd.js validateCommand`: in the `mres.status === 'in-progress-aborted'` branch (currently lines 90-99):
  - Set `result.tempfail = true` (top-level boolean).
  - Set `result.exitCode = migrationModule.EX_TEMPFAIL`.
  - Push `{ gate_id: '_meta', decision_id, reason, kind: 'tempfail', tempfail_exit: 75 }` into `blocking[]` (the `kind` field is NEW — distinguishes from hard blocks which have no `kind`).
- **Consumer precedence contract** (documented in receipt schema docs + CLAUDE.md §3.3):
  1. If `result.tempfail === true` → caller MUST treat as retryable. exit code 75.
  2. Else if `result.ok === false` → hard block. exit code 2.
  3. Else → success. exit code 0.

**Shared classifier (R2 F2 absorption — all 5 consumer paths use one helper)**:
- New file `plugins/mccp/scripts/receipt/classify.js` exporting `classifyValidationResult(result)` → returns one of `'tempfail' | 'block' | 'ok'`. The helper applies the precedence contract above as a single source of truth.
- Repo audit (Codex R2 F2 + manual `grep validateCommand`) identified 5 direct callers of `validateCommand`. All 5 MUST be migrated to the shared classifier:

| Caller | File | Existing gating | New behavior |
|---|---|---|---|
| `cli.js cmdValidate` | [cli.js:189](plugins/mccp/scripts/receipt/cli.js#L189) | `result.ok ? 0 : 2` | `classify → 'tempfail' → 75 / 'block' → 2 / 'ok' → 0` |
| `preflight.js preflight` | [preflight.js:53](plugins/mccp/scripts/receipt/preflight.js#L53) | `!result.ok → writeBlockReason + return 2` | `classify → 'tempfail' → stderr TEMPFAIL + return 75 / 'block' → writeBlockReason + 2 / 'ok' → 0` |
| `receipt-prompt.js` PreToolUse hook | [receipt-prompt.js:232](plugins/mccp/scripts/hooks/receipt-prompt.js#L232) | gates on `result.ok` + renders `result.blocking` as ALLOW/BLOCK systemMessage | `classify → 'tempfail' → emit "TEMPFAIL: migration in progress, retry shortly" + ALLOW (hook does not block; user retries naturally)` |
| `receipt-skill.js` PreToolUse hook | [receipt-skill.js:163](plugins/mccp/scripts/hooks/receipt-skill.js#L163) | same shape as receipt-prompt | same shape — tempfail → emit retry-systemMessage + ALLOW |
| `auto-chain.js` next-step orchestrator | [auto-chain.js:130](plugins/mccp/scripts/lib/auto-chain.js#L130) | uses `v.ok` to decide auto-chain abort | `classify → 'tempfail' → abort chain + emit machine-readable `{ reason: 'receipt-tempfail', retryable: true }` to stdout JSON + exit code **75** (mirrors cli/preflight). NOT only a stderr hint — callers that consume exit status get the retryable signal (R3 plan-level refinement). |

- `writeBlockReason` (preflight): when rendering blocking entries, special-case `b.kind === 'tempfail'` → label as `TEMPFAIL` not `INVALID`. Keeps human-readable output consistent with machine-readable precedence.

**Why dual-signaling is acceptable here**: Codex F3 critique was that ambiguous dual-signaling is bad. The fix is to make the dual signals consistent — `result.tempfail === true` IFF `blocking[].some(b => b.kind === 'tempfail')`. Old JSON consumers (no precedence logic) still see `ok=false` + a blocking entry, which is correct ("not ok"); new consumers using the documented precedence get the retry semantics. This is invariant-by-construction, not just convention — A3 includes a schema-validation test.

**Mirror**: `cli.js:300-302` `evaluateForDedupe → result.ok → exit 2` mapping — extend with precedence layer, do not override.

**Validate**:
```bash
node --test plugins/mccp/scripts/receipt/tests/tempfail-propagation.test.js
node --test plugins/mccp/scripts/receipt/tests/tempfail-precedence.test.js
```

**Regression coverage** (new file `tempfail-propagation.test.js` + companion `tempfail-precedence.test.js`):
- `(δ) validate exit 75 on migration-in-progress`: tmp repo + stuck winner (lock with `pid=process.pid`, no marker). Spawn `node scripts/receipt/cli.js validate --command mccp:pr --cwd <tmp>` via `execFileSync` with `stdio: 'pipe'`. Catch thrown error; assert `err.status === 75`. Parse JSON from `err.stdout` → assert `tempfail === true`, `exitCode === 75`, and EXACTLY ONE `blocking[]` entry with `kind === 'tempfail'`.
- `(ε) preflight exit 75 same scenario`: same setup; spawn preflight; assert exit 75, stderr matches `/TEMPFAIL/` (NOT `/INVALID/`).
- `(ζ) non-tempfail blocking still exits 2 (regression)`: tmp repo with no migration trigger and no required receipts. Spawn validate; assert exit 2, no `kind` field present, no `tempfail` field, `ok === false`.
- `(η) precedence contract (R1 F3 absorption)`: hand-craft a synthetic validate result via `validateCommand` direct call where `tempfail === true` AND `blocking[]` has both a `kind: "tempfail"` entry AND a hard-block entry (simulated mixed case). Assert: `classifyValidationResult(result)` returns `'tempfail'`, `cli.js` cmdValidate returns 75 (precedence respects tempfail-first). Document this case as the precedence-contract canary.
- `(θ) invariant: tempfail field ↔ blocking-kind-tempfail`: synthetic validate result with `tempfail === true` but NO `kind: "tempfail"` in `blocking[]` MUST throw a `result.warnings` entry (or similar schema-shape inconsistency warning) — the two MUST stay in sync.
- `(ι) classifier coverage — all 3 cases (R2 F2 absorption)`: NEW file `classify.test.js`. For each of `'tempfail'`, `'block'`, `'ok'`, construct a representative result object and assert `classifyValidationResult(result)` returns the expected label. Includes a fixture where `tempfail === true` AND `ok === true` (impossible-per-construction but defensive — classifier must still return `'tempfail'`).
- `(κ) receipt-prompt tempfail → ALLOW + retry systemMessage (R2 F2 absorption)`: NEW `receipt-prompt-tempfail.test.js`. Construct PreToolUse-style synthetic input where validate-cmd would return tempfail. Invoke the hook entry point; assert the hook emits ALLOW (does not block the tool call) AND emits a systemMessage containing `/TEMPFAIL/` or `/retry/`. This proves hook does NOT misclassify transient migration as a hard gate failure.
- `(λ) receipt-skill tempfail → ALLOW + retry systemMessage (R2 F2 absorption)`: NEW `receipt-skill-tempfail.test.js`. Same shape as κ but for `receipt-skill.js` hook (Skill invocation gate).
- `(μ) auto-chain tempfail → abort chain + machine-readable retry signal + exit 75 (R2 F2 + R3 absorption)`: NEW `auto-chain-tempfail.test.js`. Invoke auto-chain with `--validate-command mccp:prp-implement` against a tmp repo where validate-cmd returns tempfail. Assert: (1) chain does NOT continue to the next step, (2) stdout JSON contains `{ reason: 'receipt-tempfail', retryable: true }`, (3) **exit code is 75** (NOT 0, NOT 2 — orchestration scripts checking exit codes get the canonical tempfail signal mirroring cli/preflight). R3 plan-level refinement: stderr-only hint was insufficient for callers that consume exit status.

### Task A4: CLAUDE.md update (small)

**Action**: append to §4 quarantine runbook a one-paragraph note: "v0.2.8 Task 2.6.5a hardening — lock body now includes an ownership token; do not hand-edit `<repo>/.claude/receipts/.migrations/v0.2.8-generic-quarantine.lock`. Editing invalidates the holder's release check and the lock will be reclaimed only when (a) the recorded PID is dead OR (b) the lock body is unparsable AND file mtime is older than 60s." Append to §3.3 fail-closed matrix: new row `tempfail` (exit 75) — "transient migration-in-progress signal; caller retries shortly; not a hard fail."

**Mirror**: existing §3.3 table rows (classification | 원인 | 기본 동작 | Advisory).

**Validate**: `grep -c "exit 75" CLAUDE.md` returns ≥ 1 after edit.

### Task A5: Implementation report

**Action**: After A1-A4 land with all tests green, write `.claude/PRPs/reports/v0-2-8-task-2-6-5a-implementation.md` summarizing:
- (1) diff scope per finding (file + LOC delta);
- (2) test additions per axis;
- (3) absorption notes for any Codex round during implement step (Implement-Codex R1-Rn);
- (4) explicit statement that R6 re-invocation is the next gate.

**Mirror**: `.claude/PRPs/reports/v0-2-8-task-2-6-5-implementation.md` (Task 2.6.5 report, commit `90895f4`).

**Validate**: file exists; contains the four sections; cross-links to source findings file.

## Validation

```bash
# After all tasks complete, run the targeted test surface:
node --test plugins/mccp/scripts/migrations/tests/v0.2.8-generic-receipt-quarantine.test.js
node --test plugins/mccp/scripts/migrations/tests/path-containment.test.js
node --test plugins/mccp/scripts/receipt/tests/tempfail-propagation.test.js

# Full receipt + migration suite (sanity / no regressions):
node --test plugins/mccp/scripts/receipt/tests/*.test.js
node --test plugins/mccp/scripts/migrations/tests/*.test.js

# Static guard: migration source should NOT contain new hardcoded path lists or skip path-containment check.
grep -n "renameSync" plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js
# Each renameSync must be immediately preceded by assertContained() call.
```

After validation, re-invoke PR-Codex R6 against the new diff. Per plan acceptance §328 (parent plan), R6 must return `verdict=approve` before v0.2.8 PR creation proceeds.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `fs.realpathSync` throws on dangling symlink → migration crashes on first scan | MEDIUM | Wrap in try/catch; treat throw as "skip + warn" (loud fail-open per [memory: feedback-loud-fail-open]) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Windows junction handling differs from POSIX symlink (`lstatSync` reports different) | MEDIUM | A2 test `(α)` branches on `process.platform === 'win32'` and uses `symlinkSync(target, link, 'junction')`; on platforms without symlink-create permission, skip the test with `t.skip()` (Node 20 test runner) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| ~~Ownership token write race~~ — RESOLVED by R1 F1 absorption (A1 mandates `wx`-only; partial/empty bodies treated as held until mtime lease expires; no tmp+rename fallback) | — | — |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Tempfail exit 75 collides with sysexits convention used by another caller (CI scripts assume non-zero = failure, retry logic absent) | LOW-MEDIUM | Document in CLAUDE.md §3.3 + receipts runbook; existing automation already treats non-zero as failure — exit 75 is strictly less harmful (signals retry instead of hard fail). PR description should call out the new exit code |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| ~~Lease-mtime reclaim race~~ — RESOLVED by R2 F1 absorption (mandatory heartbeat closes live-holder reclaim race; ownership token is secondary defense; axes `(n)` + `(o)` prove it) | — | — |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| ~~Consumer precedence ambiguity~~ — RESOLVED by R2 F2 absorption (shared `classifyValidationResult` applied at all 5 consumer paths; precedence contract enforced by helper, not convention) | — | — |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Heartbeat starves under sync-loop hot path (very large receipt set blocks event loop past `HEARTBEAT_INTERVAL_MS`) | LOW | A1 implementation MUST yield with `setImmediate` between batches if scan exceeds 50 receipts. Axis `(o)` proves the yield is wired (or skipped if migration completes under `HEARTBEAT_INTERVAL_MS/2`). |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Shared classifier introduces new dependency layer — 5 consumer paths now require the helper to be loaded | LOW | `classify.js` is a tiny pure-function module (no I/O, no `require` of optional deps). Failure mode: classify module load throws → callers fall back to old `result.ok` gating with a stderr warn (loud fail-open per [memory: feedback-loud-fail-open]). |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| R6 re-invocation finds additional findings outside A1-A3 scope (e.g. schema concern, doc inconsistency) | MEDIUM | If R6 returns a fresh finding cycle, treat as Task 2.6.5b (NOT 2.6.5a re-spin) — preserves audit trail. Decision at R6 result time |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Implement-Codex R-loop during A1-A3 raises orthogonal concerns | LOW-MEDIUM | Plan-level rule: absorb only into THIS plan; do NOT expand to other v0.2.8 tasks. Append `## Codex Implementation Review` section per round |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] A1 — lock invariant (`wx`-only) + lease-based reclaim + MANDATORY heartbeat + ownership token: 7 new test axes `(i)`-`(o)` pass; existing 9 axes still pass; `releaseLock` ownership mismatch path emits stderr warn but does not throw; zero-byte and unparsable lock bodies held until `mtime > LEASE_TTL`; live-but-unrelated PID with future/stale `started_at` IS reclaimed by mtime (R1 F2); MANDATORY heartbeat keeps live holder safe past `LEASE_TTL` (R2 F1 axis `(n)`); 200-receipt scan does not starve heartbeat (axis `(o)`)
- [ ] A2 — path-containment guard: `path-containment.test.js` 3 axes `(α)`, `(β)`, `(γ)` pass; `listGenericReceipts` rejects symlinked gate dirs; `renameWithCollisionSafety` throws on out-of-tree source/target
- [ ] A3 — tempfail canonical shape + shared classifier covers ALL consumers: `tempfail-propagation.test.js` 3 axes `(δ)`, `(ε)`, `(ζ)` + `tempfail-precedence.test.js` 2 axes `(η)`, `(θ)` + `classify.test.js` axis `(ι)` + `receipt-prompt-tempfail.test.js` axis `(κ)` + `receipt-skill-tempfail.test.js` axis `(λ)` + `auto-chain-tempfail.test.js` axis `(μ)` pass; `classifyValidationResult` consumed by 5 callers (cli, preflight, receipt-prompt, receipt-skill, auto-chain); hooks emit ALLOW on tempfail (NOT block); auto-chain aborts chain on tempfail (NOT hard-fail)
- [ ] A4 — CLAUDE.md §3.3 has `tempfail` (exit 75) row; §4 has lock-token note
- [ ] A5 — implementation report exists with 4 sections + cross-links
- [ ] Full receipt + migration test suite: all green (no regressions in 9 existing axes or any other receipt tests)
- [ ] **R6 re-verification (BLOCKING — ship invariant)**: PR-Codex re-invoked against the new diff via `node scripts/lib/codex-invoke.js adversarial-review --focus "<diff summary covering A1+A2+A3>"`. Verdict MUST be `approve` before /mccp:pr proceeds. Same Codex thread `019e9cc3-f470-7382-8c74-f05c30591c0f` referenced in focus prompt for continuity.
- [ ] Patterns mirrored, not reinvented (see Patterns to Mirror table)

## Open Questions

- LOW — Should `.claude/PRPs/reports/v0-2-8-task-2-6-5a-pr-codex-findings.md` (currently untracked per `git status`) be committed in the same commit as A1-A3, or in a preceding doc-only commit for chronological audit clarity? Recommend: doc-only commit FIRST (matches `Implement-Codex R5 absorption` pattern in commit `9e994e5`). <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->
- LOW — Should A4 CLAUDE.md update land in the same commit as A1-A3, or as a separate doc commit? Recommend: with A3 (the user-facing change that motivates the doc). <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->
- LOW — If A1 forces a tmp+rename for lock body, the lock dir needs `<lock>.tmp.<pid>` cleanup on crash. Should the migration include an opportunistic sweep for orphan tmp files at start of `acquireLock`? Defer to R6 — only add if R6 flags. <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->

---

## Codex Adversarial Review

### Round 1 (2026-06-06) — absorbed

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.7/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- Codex thread: `019e9d0b-ff84-7a10-9736-f7dd0b719b70` (distinct from R6 source thread `019e9cc3-...`)
- Verdict: `needs-attention` — 3 findings
- Findings absorbed:
  - **R1 F1 (MEDIUM 0.78) — Lock acquisition semantics remain ambiguous** → A1 rewritten to mandate `wx`-only exclusive primitive; tmp+rename removed as a fallback; zero-byte and unparsable lock bodies treated as HELD until lease expires. New test axis `(j)` proves zero-byte-lock-held invariant.
  - **R1 F2 (HIGH 0.86) — Live PID stale locks can block forever** → A1 reclaim criterion changed from `pidDead || ageStale` to `pidDead || mtime > LEASE_TTL`. mtime is primary (OS-attested, monotonic), PID is secondary signal. New test axis `(l)` proves live-PID + future-started_at + stale-mtime → reclaimed. Heartbeat decision deferred to implement-time per 90th-percentile runtime data.
  - **R1 F3 (MEDIUM 0.74) — Tempfail is still encoded as a hard block** → A3 introduces canonical precedence contract: `result.tempfail === true` is single source of truth; `blocking[]` entry preserved with NEW `kind: "tempfail"` field for backward compat; consumer precedence (`tempfail → ok → success` → exit `75 → 2 → 0`) documented in CLAUDE.md §3.3. New test axes `(η)` precedence canary + `(θ)` invariant (`tempfail` field ↔ `blocking[].kind === "tempfail"`).
- Rejected suggestions: none (all 3 findings absorbed verbatim with explicit test axes).
- Open Questions after R1: none rated CRITICAL. One MEDIUM remains on heartbeat necessity (deferred to implement-time).

### Round 2 (2026-06-06) — absorbed

- 호출: 같은 fail-closed Bash wrapper, 별도 thread
- Codex thread: `019e9d13-6f7c-74d2-befa-5e8f18a4d7b2`
- Verdict: `needs-attention` — 2 findings (both HIGH)
- Findings absorbed:
  - **R2 F1 (HIGH 0.88) — Live lock can still be stolen after 60s** → A1 heartbeat changed from "opt-in" to **MANDATORY** for every acquired lock. `migrate()` registers `setInterval(fs.utimesSync, HEARTBEAT_INTERVAL_MS=15s)` immediately after acquire and clears in finally. Sync-loop starvation guard: `setImmediate` yield after every 50 rename ops if scan exceeds 50 receipts. New axes `(n)` heartbeat-keeps-live-holder-safe-past-LEASE_TTL + `(o)` sync-loop-starvation-guard. Ownership token reframed as secondary defense (prevents old holder from clobbering new winner after race; mandatory heartbeat is the primary "no race in the first place" mechanism).
  - **R2 F2 (HIGH 0.91) — Tempfail precedence misses direct validateCommand consumers** → A3 scope expanded from cli.js+preflight.js (2 paths) to **5 paths via shared classifier**. NEW file `plugins/mccp/scripts/receipt/classify.js` exports `classifyValidationResult(result)` → `'tempfail' | 'block' | 'ok'`. 3 NEW consumer-side updates: `receipt-prompt.js` PreToolUse hook (tempfail → ALLOW + retry systemMessage), `receipt-skill.js` PreToolUse Skill hook (same shape), `auto-chain.js` orchestrator (tempfail → abort chain + retry hint, NOT hard-fail). 4 NEW test files: `classify.test.js` axis `(ι)`, `receipt-prompt-tempfail.test.js` axis `(κ)`, `receipt-skill-tempfail.test.js` axis `(λ)`, `auto-chain-tempfail.test.js` axis `(μ)`. Verification: `grep -rn "validateCommand"` on `plugins/mccp/scripts/` confirmed all 3 Codex-named consumers exist at the exact line numbers Codex cited (`receipt-prompt.js:232`, `receipt-skill.js:163`, `auto-chain.js:130`) — no Codex hallucination.
- Rejected suggestions: none (both findings absorbed verbatim).
- Open Questions after R2: none rated CRITICAL.

### Round 3 (2026-06-06) — partial absorption + max-round cap

- 호출: 같은 fail-closed Bash wrapper
- Codex thread: `019e9d1a-6264-7220-a952-bfe7851e865e`
- Verdict: `needs-attention` — 2 findings (both HIGH 0.94 / 0.96)
- **Lens shift**: R3 transitioned from plan-adequacy critique (R1/R2 mode) to working-tree implementation verification, citing literal line numbers in `v0.2.8-generic-receipt-quarantine.js:116-126` (`tryReclaimStaleLock`) and `validate-cmd.js:87-99` (the in-progress-aborted branch). Both findings observe correctly that the working tree does not yet contain R2's promised changes — which is structurally true because we are in `/mccp:plan` Phase 5, not `/mccp:prp-implement` execution. The plan ALREADY commits to these implementations via Task A1/A3 + Acceptance items + R2 absorption record.
- Plan-actionable refinement absorbed:
  - **R3 → A3 auto-chain exit code refinement**: Codex R3 F2 specifically flagged "stderr-only retry hint is insufficient because callers consume exit status". A3's auto-chain row + axis `(μ)` updated to require **exit code 75** mirroring cli/preflight (NOT just stderr) PLUS machine-readable `{ reason: 'receipt-tempfail', retryable: true }` in stdout JSON. This is a substantive plan-level upgrade — orchestration scripts now get the canonical tempfail signal via exit code, not only via human-readable stderr text.
- Non-plan-actionable findings (DIVERGENT_UNRESOLVED at max round):
  - **R3 F1 working-tree heartbeat absence** + **R3 F2 working-tree classifier absence** are TRUE-by-construction observations about the code state, NOT plan-level gaps. The plan already commits to these changes; verification belongs to PR-Codex R6 against the post-implementation diff, not to plan-codex.
- Max-round cap reached (3/3). Plan-level critique convergence: **CONVERGED** (R1 + R2 + R3 plan-actionable refinement all absorbed; remaining R3 findings are implementation-verification scope, not plan-adequacy gaps). Acknowledged as `DIVERGENT_UNRESOLVED` for the implementation-verification axis only; the plan stands.
- Open Questions after R3: none rated CRITICAL. Plan ready for `/mccp:prp-implement`.

### Convergence Summary

- 3 rounds executed (R1 → R2 → R3). R1 + R2 closed substantive plan-level gaps. R3 introduced a lens shift to code-verification but its sole plan-actionable refinement (auto-chain exit code) was absorbed.
- All 7 findings across rounds are now either absorbed or scoped to PR-Codex R6 (implementation diff review, post-/mccp:prp-implement).
- Plan ships to `/mccp:prp-implement` with explicit DIVERGENT_UNRESOLVED note: the working-tree implementation must materialize before R6 re-verification can return `verdict=approve`.

---

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1+R2+R3). No new implement-time decisions detected — every file path, abstraction shape (`classify.js` exports, 5 consumer wirings), test axis (i–μ), exit-code mapping (75/2/0), heartbeat cadence (15s, MANDATORY), and concurrency primitive (`wx`-only) is pre-committed in the plan body. Cross-gate dedupe applied per Phase 2.5.1.

### Security Reviewer (Phase 2.5.5)

Plan touches two security-adjacent areas — invoked `security-reviewer` subagent.

**Verdict**: APPROVE-WITH-CAVEATS. No CRITICAL/HIGH findings → no MCCP-GATE-STOP.

**Area 1 — Lock ownership token**:
- Q1 `crypto.randomUUID()` cryptographic sufficiency → **OK**. RFC 4122 v4 = ~122 bits entropy. Token is a uniqueness identifier authorizing RELEASE, not a secret. PRNG attacks N/A (attacker has no fd before `writeSync` completes).
- Q2 race window between `openSync('wx')` and `writeSync` → **closed by R1 F1 absorption** (zero-byte lock treated as HELD until `mtime > LEASE_TTL`). Implementer MUST land the token field in lock body — plan commits, do not skip.
- Q3 same-UID adversary reading T1 then race-acquiring → **N/A**. `wx` is atomic kernel-level exclusive create. Token authorizes RELEASE (verify-before-unlink), not ACQUIRE. Knowing T1 doesn't help an attacker acquire.

**Area 2 — Path containment**:
- Q4 `fs.realpathSync` on dangling symlink throws ENOENT → confirmed. Plan's "loud fail-open" (try/catch + skip+warn) is correct. Windows note: `lstatSync().isSymbolicLink()` on a junction differs from POSIX symlink behavior — A2 test (axis `α`) `process.platform === 'win32'` branch uses `symlinkSync(target, link, 'junction')`.
- Q5 TOCTOU between `realpathSync` and `renameSync` → defense in depth, not isolation. Workstation-level attacker can already edit receipts directly. Acceptable.
- Q6 guard MUST also apply to `<gateDir>` itself → **plan already does** (Task A2: `lstatSync(gateDir).isSymbolicLink() === true` → skip in `listGenericReceipts`). Sufficient.

**Implementation-time caveats absorbed**:
1. Lock body token field — A1 commits. Implementer must add `token: crypto.randomUUID()` to lock body + thread through `releaseLock(repoRoot, token)` signature change. Without this, the defense degrades to current state.
2. Mandatory heartbeat — A1 commits (`setInterval(fs.utimesSync, 15s)`). Without this, lease-mtime defense is incomplete (live holder past 60s can be stolen). Axes `(n)` `(o)` verify.
3. Symlink rejection in `listGenericReceipts` — A2 commits. Current `store.js:77-83` does not yet include `lstatSync().isSymbolicLink()` check.

**Reviewer also raised a schema-level concern** about `blocking[].kind = "tempfail"` colliding with `schema.js`. **Resolved at review-absorption time**: `schema.js` validates *receipt JSON on disk* (`gate_id`, `meta`, `findings[]`, `resolution{}`), NOT the runtime `validateCommand` result object. `result.blocking[]` is in-memory only — adding `kind` is schema-safe.

### Impeccable Design Review (Phase 2.5.5b)

`impeccable-detect.js detect --mode implement --json` → `{ skill_available: false, design_signal: false, reason: "skill-missing" }`.

Per plan decision table (SKILL_AVAIL=0, any SIGNAL → record skip + strict gate enforcement):

> impeccable unavailable, skipped (auto-fallback): skill-missing

Receipt-write (Phase 2.5.6) forwards `--impeccable-skipped --impeccable-skip-reason "skill-missing"`. Downstream `/mccp:pr` will block on this receipt — user may install impeccable plugin OR pass `MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<substantive reason>"` at PR time (≥30 chars, ≥3 words, not URL-only — schema enforces).

Note: this implementation has no UI surface anyway (concurrency/filesystem/CLI semantics only). The strict-skip is a v0.2.6 invariant decoupled from actual design need — it records skill availability, not design relevance.
