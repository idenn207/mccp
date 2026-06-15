# Changelog

All notable ship milestones for **my-claude-code-plugin (mccp)** are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Note on versioning**: the project ship tag (e.g. `v1.0.0`) and the inner plugin manifest (`plugins/mccp/.claude-plugin/plugin.json` — currently `0.4.0`) are intentionally decoupled. Plugin semver tracks the mccp namespace's internal API surface; project ship tags track W-VERDICT-gated milestones bundled across the repo.

## [1.0.1] — Unreleased

First patch cycle after v1.0.0 ship. Cherry-picks the axis K item from the W-VERDICT §7 roadmap (C3 — cross-platform `pr-phase.lock` hardening — M1 only; M2 reproduction matrix deferred to a separate plan).

### Fixed

- **axis K** — `pr-phase-guard` hook now reclaims orphan locks left by crashed PR helpers (same-host + dead PID), eliminating Linux/macOS self-trap when `/mccp:pr` is re-invoked after a helper crash. The hook reuses `pr-phase-lock.js`'s host-aware tri-state policy (`isPidAlive` + `tryReclaimStaleLock`), so live PIDs are never disturbed (`NEVER reclaim` invariant). Cross-host orphan locks fall through to the existing block path. Silent recovery is prevented by a state-file marker (`<root>/.claude/state/pr-phase-lock-stale-reclaimed.json`) that `finalize-receipt.js` consumes on the next PR cycle, stamping `meta.pr_phase_lock_stale_reclaimed_at_hook=true` on the receipt. See [docs/v0.2-state-schema.md §4.5](docs/v0.2-state-schema.md) for the marker contract.

### Added

- `meta.pr_phase_lock_stale_reclaimed_at_hook` — additive optional boolean field on receipt schema; default `false`. Existing receipts pass schema validation unchanged (no migration script required).
- `--pr-phase-lock-stale-reclaimed-at-hook` flag on `node plugins/mccp/scripts/receipt/cli.js write` — forwarded by `finalize-receipt.js` when a stale-reclaim marker is consumed.
- Test axes 11.1–11.5 (PID liveness fixtures incl. Windows escape-path preservation) + 12.1–12.4 (marker shape, idempotency, finalize-receipt round-trip, corrupt-marker handling) in `plugins/mccp/scripts/hooks/tests/pr-phase-guard.test.js` — 9 new tests, 0 regressions on existing axes 1–10.

## [1.0.0] — 2026-06-15

First W-VERDICT-gated release. Ship recommendation derived from synthesis of 11 worktree dogfood audits ([W-VERDICT §7 Cherry-pick Roadmap](.claude/audit/v1.0.0-release-verification-verdict.md#7-cherry-pick-roadmap-pre-tag-vs-post-tag)) classified as **CONDITIONAL** with two pre-tag requirements (C1 + C2). Both shipped; C3 (cross-platform `pr-phase.lock` hardening) deferred to v1.0.x axis K.

### Pre-tag conditions met (C1 + C2)

- **C1** — PR [#20](https://github.com/idenn207/mccp/pull/20) `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` (commit `e892d27`). Absorbs W11 audit 11j+11k MEDIUM → LOW; partially resolves W4 4a (receipt write read-first failure hint absence).
- **C2** — PR [#21](https://github.com/idenn207/mccp/pull/21) `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` (commit `8d6504c`). Resolves W10 F-W10-1 doc-vs-code drift by demoting CLAUDE.md §4 "live" label to "LLM-observed" (W-VERDICT §6 axis M).

### Severity tally (post-C1+C2)

| Tier | Pre-W-VERDICT | Post-ship | Δ |
|---|---|---|---|
| BLOCKING | 1 | 1 | 0 (env-conditional; Linux/macOS true-BLOCKING deferred to v1.0.x axis K) |
| HIGH | 8 | **7** | **−1** (C2 axis M demote) |
| MEDIUM | 13 | 12 | −1 (C1 11j/11k MED → LOW) |
| LOW | 12 | 14 | +2 (C1 absorption) |
| PASS / INFO / NTH | 60+ | 60+ | — |

### Known Issues (release notes — non-blocking on Windows)

- **W4 4d** `pr-phase.lock` self-trap on `/mccp:pr` re-entry. Windows workaround: invoke `node plugins/mccp/scripts/lib/pr-phase-lock.js detect-stale` via PowerShell tool (outside `pr-phase-guard.js` PreToolUse hook scope). Linux/macOS escalate via process kill + new session. Permanent fix: v1.0.x axis K (`pid_alive` validation + auto-release).
- **W4 4a** Receipt write read-first failure surface. Manual `rm <receipt>` + write re-run. C1 patch resolves the `writeBlockReason()` recovery surface; full symmetry across all classifications is v1.0.x axis L.
- **W7 docs/v0.2-*** prefix (`docs/v0.2-architecture.md`, `docs/v0.2-state-schema.md`) gives a stale first impression post-tag. v1.0.x axis N housekeeping (rename + content sync).
- **W6 STATE.md frontmatter** regression (`task_fingerprint` synthetic patch + `last_event` precedence drift). Observability-only — dual-reviewer chain does not consume STATE.md frontmatter (grep-verified).
- **W1 F-W1-1** `/mccp:work` classification metadata leakage. `.claude/audit/*` and similar metadata trigger full-chain when user intent is trivial. Workaround: explicit `--trivial` override.

### Ship history (chronological)

| PR | Commit | Title | Surface |
|---|---|---|---|
| [#20](https://github.com/idenn207/mccp/pull/20) | `e892d27` | `fix(v1.0.0): preflight.js writeBlockReason() recovery surface` | C1 — W11 11j+11k MEDIUM → LOW |
| [#21](https://github.com/idenn207/mccp/pull/21) | `8d6504c` | `docs(v1.0.0): demote MCCP_AUTO_CHAIN_SKIP_PR to LLM-observed` | C2 — W10 F-W10-1 HIGH demote (HIGH 8→7) |

### Supporting artifacts

- [.claude/audit/v1.0.0-release-verification-verdict.md](.claude/audit/v1.0.0-release-verification-verdict.md) — synthesis verdict
- [.claude/audit/v1.0.0-*.md](.claude/audit/) — 11 individual worktree audit ledgers (baseline, codex-backoff, impeccable, receipts, handoff, state-continuity, docs-sync, dual-reviewer, goal-loop, env-matrix, fallback-ux)
- [.claude/plans/v1-0-0-release-verification.plan.md](.claude/plans/v1-0-0-release-verification.plan.md) — verification plan + acceptance rules
- [.claude/plans/v1-0-0-preflight-recovery-surface.plan.md](.claude/plans/v1-0-0-preflight-recovery-surface.plan.md) — C1 patch plan

### Post-merge manual step

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

The CHANGELOG entry above commits as part of the release notes PR; the annotated tag is created manually post-merge.

---

*Prior ship history (v0.2.x – v0.4.0) lives in commit history and PRs (`git log --grep "v0\\."`). v1.0.0 marks the first release-verification-gated milestone where a synthesized verdict (`.claude/audit/v1.0.0-release-verification-verdict.md`) and a documented Cherry-pick Roadmap gated the tag decision.*
