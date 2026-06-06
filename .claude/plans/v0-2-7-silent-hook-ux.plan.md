# Plan: v0.2.7 — Silent Hook UX Observability Surface (Milestone 2.5)

**Status**: 🚧 **CODE-COMPLETE, PR-PENDING**
**Plugin version**: 0.2.6 → **0.2.7** (current `plugin.json`)
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 2.5
**Implementation report**: [.claude/PRPs/reports/mccp-roadmap-milestone-2-5-report.md](../PRPs/reports/mccp-roadmap-milestone-2-5-report.md)
**PR-Codex R1 findings report**: [.claude/PRPs/reports/v0-2-7-pr-codex-r1-findings.md](../PRPs/reports/v0-2-7-pr-codex-r1-findings.md)
**Origin**: 2026-06-05 사용자 incident — `MCCP_RECEIPT_DEBUG=1` ON 상태에서 `/mccp:pr` 침묵
**santa-loop**: 3-round adversarial (R1 v1 → R2 v2 → R3 v3-minimal converged)

---

## Summary

ALLOW-path silent failure 제거 layered observability surface. v0.2.5 `MCCP_RECEIPT_DEBUG=1`로도 안 보이던 `/mccp:pr` 침묵 incident (INC-001-R3 흡수)를 L1 shard ledger + L2a/L2b/L2c systemMessage + G1 invariant + L5 SessionEnd compactor + `/mccp:trace` 조회 명령으로 가시화.

**Positioning**: observability + recovery hint system. NO trust claim. NO machine-enforced attestation. Claude Code hook API documented surface 안에서만 작동.

## MUST Constraints (R3 critical issues — all satisfied)

| # | Constraint | Verified |
|---|---|---|
| C1 | end-marker = `SessionEnd` (not "Pre-Stop") | `session-end-trace.js` hooks.json entry |
| C2 | `.gitignore` `.claude/state/hook-trace/` FIRST commit | `e84df19` |
| C3 | SessionStart LRU eviction = active-session lease 확인 | `evictLRU` "active lease shields" test |
| C4 | Corruption contract — temp + atomic rename, malformed shard quarantine | `hook-trace.test.js` quarantine test |
| C5 | `systemMessage` user-visibility integration test 사전 검증 | `hook-trace-integration.test.js` 5 tests |
| C6 | "live hook state" = event payload only | allowlist raw-input check |
| C7 | `MCCP_RECEIPT_DEBUG` precedence table unset default 명시 | `docs/ENVIRONMENT.md` |
| C8 | `claude --version` external probe provenance | `hook-caps.test.js` |

## Layered Design v3-minimal (R3 converged)

```
P0 (BLOCKING):
  L1  — Per-invocation shard ledger
  L2b — PostToolUseFailure surface (event-native)
  G1 patch — receipt-skill.js / receipt-prompt.js try/catch wrap

P1:
  L2a — MCCP_RECEIPT_DEBUG=1 + ALLOW path → systemMessage emit
  L2c — External version probe + cross-session inject
  L5  — SessionEnd marker + compactor
  G1 invariant — Loud Fail-Open + event-shape-specific output

P3 (opt-in):
  L4  — /mccp:trace slash command + Phase 0 preamble

Deferred (W2 separate workstream):
  L0  — subagent contract attestation (docs-only)
```

## Tasks Shipped

| # | Task | Status |
|---|---|---|
| 2.5.0 | `.gitignore` hook-trace ignore (FIRST commit, C2) | ✅ commit `e84df19` |
| 2.5.1 | hook-trace.js L1 shard ledger + 10 tests | ✅ |
| 2.5.2 | post-tool-use-failure.js L2b surface + 6 integration tests | ✅ |
| 2.5.3 | receipt-prompt.js + receipt-skill.js G1 patch + 3 tests | ✅ |
| 2.5.4 | receipt-prompt.js L2a ALLOW-path systemMessage (gated by C5) | ✅ |
| 2.5.5 | hook-caps.js + session-start-trace-injector.js (L2c) | ✅ |
| 2.5.6 | session-end-trace.js + session-end-marker.js (L5) | ✅ |
| 2.5.7 | G1 grep guard + gate-design.md G1 section | ✅ |
| 2.5.8 | `/mccp:trace` command + 9-command Phase 0 preamble | ✅ |
| 2.5.9 | docs + plugin.json 0.2.7 + (PR pending) | ⚠ PR not yet opened |

## Shipped Commits (current branch)

| Commit | Scope |
|---|---|
| `e84df19` | feat(v0.2.7): Task 2.5.0 — .gitignore for hook-trace shard ledgers |
| `9ea48b1` | feat(v0.2.7): Milestone 2.5 — Silent Hook UX observability surface (32 files, +2425) |
| `00235a8` | fix(v0.2.7): Codex Round 1 — observability layer self-corruption gaps |
| `c5f57f6` | chore(v0.2.7): ignore .claude/settings.local.json |
| `48964a5` | fix(v0.2.7): Codex Round 2 — recovery-surface gaps (PR-Codex) |
| `8319ee2` | chore(v0.2.7): Milestone 0 진행 누적 + Codex R1 PR findings 보고서 + hook-caps cache ignore |

## PR-Codex R1 Findings + Fixes (all addressed)

Detailed in [v0-2-7-pr-codex-r1-findings.md](../PRPs/reports/v0-2-7-pr-codex-r1-findings.md). Summary:

| # | Severity | Location | Fix |
|---|---|---|---|
| 1 | HIGH | session-start-bootstrap.js:143-149 | Extracted `mergeL2c()` to lib/merge-l2c.js with 9 tests |
| 2 | HIGH | lib/hook-trace.js:269-296 | LEASE_STALE_MS 5min → 24h + `renewLease()` heartbeat |
| 3 | HIGH | lib/hook-trace.js:186-200 | `appendShardAtomic` → `fs.appendFileSync` (O_APPEND, PIPE_BUF safe) |
| 4 | MEDIUM | lib/hook-trace.js:334-341 | `consolidateSession` JSON-validates every line, quarantine on first malformed |

**Test delta**: 506 → 519 tests, 0 fail.

## Tests Total

| Layer | Tests |
|---|---|
| hook-trace + integration | 15 |
| hook-caps | 12 |
| g1-guard | 7 |
| post-tool-use-failure | 6 |
| g1-patch | 3 |
| session-end-trace | 3 |
| merge-l2c (R1 fix) | 9 (+4 hook-trace concurrent) |
| **Total new** | **46+13 (R1) = 59** |

506 → 519 tests, 518 pass (1 skip), 0 fail.

## Remaining Tasks (block close)

- [ ] **PR creation** — `/mccp:pr` 호출 + PR-Codex Round 2 게이트 (R1 findings 모두 해결, R2 verdict 예상 `ok`)
- [ ] Manual smoke: `MCCP_RECEIPT_DEBUG=1` + `/mccp:*` 명령 → `systemMessage` 실제 렌더 확인
- [ ] `mccp-implement-codex/mccp-roadmap.json` 발행 (현재 working tree 부재 — receipt write 필요 또는 cross-gate dedupe 적용 후 PR-codex receipt에서 합치)

## Accepted Blind Spots (out of scope)

| ID | Scenario | Mitigation |
|---|---|---|
| B1 | StopFailure + 사용자 미재개 | manual ledger inspection |
| B2 | Power loss before shard write | data loss accepted |
| B3 | In-session Claude Code upgrade | restart required |
| B4 | Same-session concurrent ledger global ordering | per-shard scope only |
| B5 | L0 subagent contract attestation | docs-only, no enforcement (W2 separate) |

## Origin Trace

- **Brainstorm sources (3)**: Claude(저) + Claude subagent + Codex GPT-5.4
- **Adversarial review**: santa-loop R1 (v1 — 9/10 FAIL) → R2 (v2 — 9-10/10 FAIL) → R3 (v3-minimal — 3-4/10 FAIL, converged with spec gaps becoming MUST constraints)

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 2.5 (lines 451-643)에 있음. Pre-thinning history는 git log 참조.
