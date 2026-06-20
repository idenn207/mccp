# Session-Ledger Schema v2

> v1.4.0-m2 — Multi-Session Continuity Primitive + Cross-Session Discovery.
> Canonical schema spec for per-session JSON files written by SessionStart hook
> and finalized by SessionEnd hook. Discovery surface for cross-worktree active
> session detection. Distinct from dispatch-envelope schema (see [§5](#5-relation-to-other-schemas)).
>
> **v2 bump**: adds `last_seen_at` (ISO8601, required) for heartbeat-driven
> active reclaim. v1 ledgers are read-lifted to v2 in memory; the on-disk file
> is rewritten on the next heartbeat / finalize. No forced migration.

## 1. Purpose

The session-ledger surface answers a single question: **"which Claude Code
sessions are currently active under this project, and which worktrees are
they tied to?"**

Before v1.5.0-m1 the only cross-session signal mccp tracked was
[`observer-sessions.js`](../../plugins/mccp/scripts/lib/observer-sessions.js)
leases (`{sessionId, cwd, pid, updatedAt}`) plus
[STATE.md](../../plugins/mccp/scripts/state/state-writer.js), which is a
single-worktree summary. Neither answered "is there another active session
in a sibling worktree?". When two worktrees rolled the same PR in parallel
(PR #38 ↔ #39 incident, 2026-06-18), each session's STATE.md silently
overwrote the other's narrative on main — last-write-wins.

The session ledger is the **per-session, append-once JSON file** that gives
the M1 primitive: every active Claude session is discoverable from any
sibling cwd via [`listLedgers({activeOnly:true})`](#3-public-api). M2 plans
the SessionStart hook surface that makes this *visible* in-session.

## 2. Schema v2

| Field | Type | Required | Producer | Notes |
|---|---|---|---|---|
| `schema_version` | `"v2"` (const, v1 read-lifted) | yes | `createLedger`, `updateLedgerHeartbeat` | v1 ledgers are read-lifted to v2 in memory; disk file rewrites on next heartbeat/finalize. |
| `session_id` | UUID v4 | yes | sanitized via [`observer-sessions.resolveSessionId`](../../plugins/mccp/scripts/lib/observer-sessions.js) | Matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. |
| `created_at` | ISO8601 | yes | SessionStart hook | **Canonical name** — *not* `started_at`. Receipt + STATE.md use the same word (Codex Plan-Codex R1 F3 absorption). |
| `last_seen_at` | ISO8601 | yes (v2) | `createLedger` (= `created_at`), `updateLedgerHeartbeat` (= `nowIso()`), `finalizeLedger` (unchanged) | **v1.4.0-m2 add**. Heartbeat anchor for host-aware tri-state active reclaim (§3 `listLedgers`). v1 read-lift sets `last_seen_at = created_at`. |
| `ended_at` | ISO8601 or `null` | yes | SessionEnd hook | `null` while session is live. `finalizeLedger` sets it; auto-bumped past `last_seen_at + 1ms` to preserve ordering. |
| `cwd` | absolute path | yes | SessionStart hook | Identifies which worktree the session is running in. |
| `git_branch` | string or `null` | yes | SessionStart hook (`git rev-parse --abbrev-ref HEAD`) | `null` if no git working tree or HEAD detached. **Canonical name** — *not* `branch`. |
| `pid` | positive integer | yes | SessionStart hook | M2 PID-liveness probe (`process.kill(pid, 0)`) — see §3 `listLedgers` tri-state filter. |
| `host` | string | yes | `os.hostname()` | Cross-machine collision anchor; relevant when global ledger directory is mounted (sync, NFS). Tri-state filter checks `host === os.hostname()` to decide PID probe vs heartbeat-only path. |
| `project_id` | `/^[a-z0-9_-]{1,64}$/` | yes | `observer-sessions.computeProjectId` | sha256(remote URL or cwd).slice(0,12). The literal `"global"` is also accepted (no projectRoot case). |
| `claude_version` | string or `null` | yes | SessionStart hook payload (best-effort) | `null` in minimum-spec mode where `claude --version` is unreachable. |

Strict invariants:

- Top-level `additionalProperties: false`. Adding a key requires a v2 schema
  doc + producer + validator update in lock step.
- All fields are required (with explicit `null` allowed where typed).
- `created_at` and `ended_at` MUST satisfy
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$`.

## 3. Public API

Defined in [`plugins/mccp/scripts/state/session-ledger.js`](../../plugins/mccp/scripts/state/session-ledger.js).

| Symbol | Purpose |
|---|---|
| `SCHEMA_VERSION` | Constant `'v2'` (current write version). |
| `SCHEMA_VERSIONS_SUPPORTED` | `['v1', 'v2']` — read paths lift v1 to v2 in memory. |
| `KNOWN_KEYS_V1` / `KNOWN_KEYS_V2` | Frozen Sets of valid top-level keys per schema version. `KNOWN_KEYS` alias preserved for back-compat (= v2). |
| `LEDGER_SUBDIR` | `'.session-ledgers'` — namespace subdir (NOT `'.observer-sessions'`; see [§5](#5-relation-to-other-schemas)). |
| `DEFAULT_HEARTBEAT_TTL_MS` | `300_000` (5 min) — active filter cutoff. `DEFAULT_ACTIVE_TTL_MS` alias preserved for back-compat (same value). The legacy 24h cap is **removed** in v2 (false-immortal source — Codex Implement R1 F2 absorption). |
| `VALID_SCOPES` | `['global', 'repo', 'hybrid']`. |
| `validate(ledger)` | Hand-rolled strict validator — branches on `schema_version` (v1 vs v2 known-keys). Returns `{ok, errors}`. |
| `liftV1(ledger)` | In-memory v1 → v2 lift. Returns new object (does not mutate input). `last_seen_at` anchors at `created_at`. |
| `pidIsLive(pid)` | POSIX-style `process.kill(pid, 0)` probe. Windows `EPERM` → `true` (insufficient signal permission ≠ dead). |
| `resolveLedgerScope({env?, projectContext?, cwd?})` | Returns `{paths, primary, scope}`. Default scope is `global`. |
| `createLedger({sessionId, cwd, gitBranch, projectContext?, scopeOverride?, ...})` | Atomic write to scope's primary (and secondary for hybrid). Stamps `last_seen_at = created_at`. |
| `updateLedgerHeartbeat({sessionId, projectContext?, scopeOverride?, timestamp?})` | Atomic mutate `last_seen_at`. v1 ledger on disk → in-place schema bump to v2. **Hybrid all-or-nothing invariant** (Codex Implement R1 F1 absorption): when scope=hybrid and ≥1 existing path fails, returns `ok=false`. Missing-ledger case returns `ok=true, noop=true` (idempotent). |
| `finalizeLedger({sessionId, endedAt?, projectContext?, scopeOverride?})` | Atomic mutate `ended_at` across all scope paths. Auto-bumps `endedAt` past `last_seen_at + 1ms` to preserve ordering. No-op when ledger absent. |
| `readLedger({sessionId, projectContext?, scopeOverride?})` | Schema-validated read; first hit across scope paths wins. v1 read-lifted to v2 in memory. |
| `listLedgers({activeOnly?, heartbeatTtlMs?, activeTtlMs?, projectContext?, scopeOverride?, pidIsLive?, selfHost?})` | Scope-aware directory scan + **host-aware tri-state active filter** (Codex Implement R1 F1+F2 absorption). Hybrid dedupe: newest `last_seen_at` wins (degraded=true tracks displacement). Active classification: cross-host trusts heartbeat freshness alone; same-host requires `(pidIsLive AND fresh heartbeat)` — stale heartbeat with live PID is treated as PID-reuse suspicion and classified inactive. `pidIsLive` + `selfHost` are injection points for tests. |

All writers use advisory file locks (`.lock` file via `openSync('wx')`,
LOCK_MAX_RETRIES=50, LOCK_RETRY_MS=20, LOCK_STALE_MS=30000) — same constants
as `state-writer.js` (no new code path). All writes are atomic (tmp +
`renameSync`) — same as dispatch-envelope.

## 4. Storage scope policy

`MCCP_SESSION_LEDGER_SCOPE` controls where ledgers live.

| Scope | Default | Path resolution |
|---|---|---|
| `global` (default) | yes | `<projectDir>/.session-ledgers/<session_id>.json` where `projectDir = ~/.local/share/ecc-homunculus/projects/<projectId>/` (sha256(remote∥cwd) 12-char namespace). Cross-worktree discoverable. |
| `repo` | opt-in | `<repoRoot>/.claude/state/session-ledgers/<session_id>.json`. Audit / dogfood mode. Falls back to `global` path when there is no git working tree (matches `observer-sessions` behavior). |
| `hybrid` | opt-in | Writes to BOTH locations. `listLedgers` reads both and dedupes by session_id with `global` precedence. Use when you want repo-local audit AND cross-worktree discovery. |

`.gitignore` includes `.claude/state/session-ledgers/` so the repo opt-in
scope cannot accidentally leak ledgers in commits.

## 5. Relation to other schemas

| Surface | What it tracks | Lifecycle | Why it stays separate |
|---|---|---|---|
| **session-ledger** (this doc) | Per Claude session (creation through finalization). | Created on SessionStart, finalized on SessionEnd. | Discovery primitive — see [§1](#1-purpose). |
| **STATE.md** ([`state-writer.js`](../../plugins/mccp/scripts/state/state-writer.js)) | Current worktree's narrative (`goal`, `nextStep`, `last_event`). | Updated by Stop / PreCompact / SessionStart hooks. | Single-worktree summary. **STATE.md frontmatter is NOT mutated by M1**. The first plan revision added `session_id` + `session_ledger_path` to frontmatter; Codex Implement R1 F2 showed that `HASH_EXCLUDE_FRONTMATTER_KEYS` (the hash-skip path in `state-writer.update`) prevents anchor persistence when *only* the excluded fields change. Anchoring inside STATE.md is incompatible with the noise-elimination invariant (v0.3.6 axis 2). Discovery moved entirely to the ledger directory scan. |
| **observer-sessions lease** ([`observer-sessions.js`](../../plugins/mccp/scripts/lib/observer-sessions.js) `writeSessionLease`) | Loose `{sessionId, cwd, pid, updatedAt}` heartbeat used by the homunculus observer. | Written each SessionStart; not finalized. | Existing surface. We share the **projectDir** anchor but use a **different subdirectory** (`.session-ledgers` vs `.observer-sessions`) to avoid path collision (Codex Implement R1 F1 absorption). |
| **dispatch-envelope** ([`dispatch-envelope.js`](../../plugins/mccp/scripts/lib/dispatch-envelope.js)) | Controller↔worker IPC payload. | Created at dispatch start, terminated by worker. | Different lifecycle (controller-spawned worker, not user session). We **reuse helper layers** (atomic tmp + rename, hand-written validate, KNOWN_KEYS Set, advisory lock) but **schema documents are separate**. `envelope.additionalProperties: false` invariant stays intact. |
| **receipt** ([`receipt/cli.js`](../../plugins/mccp/scripts/receipt/cli.js)) | Gate audit chain (Plan-Codex, Implement-Codex, PR-Codex…). | Written per gate completion. | Different scope. Receipt `meta.created_at` shares the canonical name. |

## 6. M2 Done · M3 Deferred

### Done in M2 (v1.4.0-m2, this cycle)

- **Heartbeat-based active reclaim**: `updateLedgerHeartbeat` + `last_seen_at` ship the
  host-aware tri-state filter mirroring `pr-phase.lock` ([CLAUDE.md §3.6](../../CLAUDE.md#36-atomic-state-locks)).
  Crash-orphaned ledgers drop out of `listLedgers({activeOnly:true})` after 5 minutes
  instead of 24 hours. The 24h fallback is **removed** to eliminate the false-immortal
  source (Codex Implement R1 F2 absorption).
- **SessionStart discovery surface**: `summarizeOtherActiveLedgers` in
  [`session-start.js`](../../plugins/mccp/scripts/hooks/session-start.js) injects
  `Other active mccp sessions in this project:` into the first system-reminder.
  All fields are field-capped + the block has a 1024-char per-block hard budget
  (Codex Implement R1 F3 absorption — protects the 8000-char SessionStart cap).
  `cwd` runs through `derive/mask.js#applyPathMask` (re-uses receipt mask).
- **STATUS.md `## Active Sessions` section**: M3 renderer surfaces
  `state.item.active_session_ledgers` as a 5-column table (session, branch, cwd,
  host, age). Graceful hide when 0 ledgers — keeps single-worktree dashboards quiet.

### Deferred to M3

- **Retention GC**: finalized ledgers older than 60 days. Currently manual.
- **Self-identification in renderer**: M3 dashboard surfaces all active sessions
  but does not mark the local one. Postponed pending an audit of how PMs use the
  surface (do they want the local entry struck through? Hidden? Marked `(this worktree)`?).

## 7. Compatibility with v1.3.0 derive engine

[`derive/sources/state.js`](../../plugins/mccp/scripts/derive/sources/state.js)
surfaces `item.active_session_ledgers` (array of the seven user-visible
fields: session_id, cwd, git_branch, created_at, host, pid, project_id) via
the scope-aware `listLedgers({activeOnly:true})` (Codex Implement R1 F3
absorption — never hardcodes a repo path). The new v2 `last_seen_at` field is
**not surfaced** to the dashboard model (audit-only); the active filter happens
at the source-scan layer so the rest of the pipeline stays version-blind.
STATUS.md M3 renderer adds a dedicated `## Active Sessions` section that reads
the surfaced array — see [§6](#6-m2-done--m3-deferred).

## 8. References

- Plan: [`.claude/plans/v1-4-0-multi-session-m1-continuity-primitive.plan.md`](../../.claude/plans/v1-4-0-multi-session-m1-continuity-primitive.plan.md)
- PRD: [`.claude/prds/v1-4-0-multi-session-first-class.prd.md`](../../.claude/prds/v1-4-0-multi-session-first-class.prd.md)
- v1.3.0 schema baseline: [`docs/v1.3.0-observability/schema-surface.md`](../v1.3.0-observability/schema-surface.md)
- STATE.md narrowing explainer: [`./state-md-narrowing.md`](./state-md-narrowing.md)
- Loud fail-open principle: [CLAUDE.md §3.4](../../CLAUDE.md#34-코드-스타일--컨벤션)
