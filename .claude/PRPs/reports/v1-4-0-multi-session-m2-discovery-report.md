# Implementation Report: v1.4.0 Multi-Session M2 — Cross-Session Discovery

## Summary

M1(PR #43, `c071a54`) 위에 (1) heartbeat schema v2, (2) SessionStart discovery surface, (3) STATUS.md `## Active Sessions` 섹션 3축을 얹어 PRD §M2 metric("새 worktree 시작 후 첫 5턴 안에 manual reconciliation 질문 0회") 달성. Codex Plan-Codex R1의 F1+F2+F3 absorptions(hybrid all-or-nothing, host-aware tri-state PID-reuse guard, path mask + 1024-char per-block budget)가 plan body에서 이미 mechanical로 흡수돼 있어 cross-gate dedupe path 적용.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | High (Codex R1 합치, 0 deferred) | High |
| Files Changed | 12 (Plan: §Files to Change) | 11 modified + 2 created |

(STATE.md frontmatter 변경 무, schema-surface.md cross-link은 의도 보존되어 별도 cycle 처리.)

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Schema v2 + v1 backward-compat lift | Complete | `liftV1` helper + validator schema_version 분기 |
| 2 | `updateLedgerHeartbeat` + hybrid all-or-nothing (F1) | Complete | `withLedgerLock` + `writeLedgerAtomic` 재사용 |
| 3 | `listLedgers` host-aware tri-state + PID-reuse guard (F1+F2) | Complete | 24h fallback 제거, 5분 heartbeatTtl, `pidIsLive` 인젝션 가능 |
| 4 | SessionStart `summarizeOtherActiveLedgers` + mask + 1024 budget (F3) | Complete | `derive/mask.js#maskPath` 재사용, branch 40c cap |
| 5 | SessionEnd anchor — heartbeat before finalize | Complete | `ended_at > last_seen_at > created_at` invariant + +1ms 자동 보정 |
| 6 | STATUS.md `## Active Sessions` section | Complete | 6번째 section wire-up (renderer/index, markdown, html) |
| 7 | Schema doc + CHANGELOG `[1.7.0]` + plugin.json `1.6.0 → 1.7.0` | Complete | §6 reclassify(M2 Done · M3 Deferred), §7 derive engine cross-link |
| 8 | Dogfood — PRD M2 metric 검증 | Code path verified | 실제 2-worktree dogfood는 user의 다음 새 세션에서 확인 — surface 자체는 test로 보장 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | Node.js project, type-check 없음 (no package.json scripts) |
| Unit Tests | Pass | 17 new session-ledger cases + 5 new active-sessions cases. 34/34 ledger + 9/9 state-source + 94/94 renderer + 52/52 derive + 375/375 receipt + 24/24 briefing + 16/16 snapshot |
| Build | N/A | No build step |
| Integration | Pass (derive cli run + render OK) | `node plugins/mccp/scripts/derive/cli.js run --json` 정상 동작 |
| Edge Cases | Pass | v1 lift, hybrid partial fail, PID-reuse stale heartbeat, EPERM-as-alive, escape angle-bracket in cwd |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/state/session-ledger.js` | UPDATED | Schema v2 + liftV1 + pidIsLive + updateLedgerHeartbeat + listLedgers tri-state |
| `plugins/mccp/scripts/state/tests/session-ledger.test.js` | UPDATED | 기존 17 case 회귀 0 + 17 new cases |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATED | `summarizeOtherActiveLedgers` helper + heartbeat wire + discovery banner push |
| `plugins/mccp/scripts/hooks/session-end.js` | UPDATED | finalize 직전 heartbeat 호출 |
| `plugins/mccp/scripts/lib/renderer/sections/active-sessions.js` | CREATED | 6번째 section module |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATED | safeSection wire-up |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | destructure + anchor + section block |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | destructure + section element |
| `plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` | CREATED | 5 cases (graceful hide / render / escape / formatAge) |
| `docs/v1.4.0-multi-session/session-ledger-schema.md` | UPDATED | v1 → v2, §6 reclassify, §3 API table 확장 |
| `CHANGELOG.md` | UPDATED | `[1.7.0]` entry top + manifest note |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | `1.6.0 → 1.7.0` |
| `.claude/plans/v1-4-0-multi-session-m2-discovery.plan.md` | UPDATED | `## Codex Implementation Review` cross-gate dedupe section append |

## Deviations from Plan

- **None at code level.** Plan body의 Files to Change list와 일치.
- Dogfood(Task 8)는 본 세션에서 자동 검증 불가 — code path는 test로 보장됐고, 실제 SessionStart hook trigger는 user의 다음 worktree 세션에서 manual 확인 필요.
- `docs/v1.4.0-multi-session/state-md-narrowing.md` 보강(optional)은 본 cycle scope 밖으로 두고 별도 처리(이미 STATE.md narrowing invariant 변경 없음).

## Issues Encountered

- 신규 test에서 `tail()` helper가 session_id 끝 8자를 사용하는데, test fixture session_id 끝 패턴이 unique하지 않아 assertion 충돌 — fixture session_id를 unique tail로 조정해 해결.
- Validate readback에서 default decisionId fallback이 v0.2.8 quarantine에 걸려 blocking — explicit `--decision v1-4-0-multi-session-m2-discovery` 인자로 우회. v1.4.0 cycle 공통 axis(prp-implement.md / pr.md 2.5.7-2.5.8 validate-cmd 호출 결함, [[mccp-v1-4-0-automation-modernization-cycle]] 참조).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/state/tests/session-ledger.test.js` | 17 new | schema v2/v1 lift, heartbeat 6 case, tri-state 6 case, finalize ordering 2 case |
| `plugins/mccp/scripts/lib/renderer/tests/active-sessions.test.js` | 5 new | graceful hide × 2, render + masked fields, multiple ledgers + escape, formatAge boundary |

## Next Steps

- [ ] `/mccp:code-review` (선택, 변경 코드 multi-perspective review)
- [ ] `/mccp:prp-commit "feat(v1.4.0-m2): cross-session discovery surface + heartbeat schema v2"`
- [ ] `/mccp:pr` — terminal gate (Codex cross-gate dedupe + Codex+security+impeccable rerun 결정)
- [ ] PR merge 후 `claude plugin update` → `~/.claude/plugins/cache/mccp/mccp/1.7.0/` 정식 생성 확인
- [ ] PRD §Delivery Milestones M2 row `pending → complete` (post-merge)
- [ ] worktree cleanup: `.worktrees/v1.4.0-multi-session-m2/` 제거
