# PR Review: #11 — feat(v0.3.0): S10b auto-handoff — cost-tier breakpoint + session spawn

**Reviewed**: 2026-06-08
**Author**: 박동민 (idenn207)
**Branch**: feat/v0-3-0-auto-handoff → main
**Decision**: APPROVE with comments

## Summary

v0.3.0 S10b auto-handoff lands cleanly. 4 새 모듈 (cost-thresholds / breakpoint-detector / session-spawner / auto-handoff hook) + 3 wiring 변경이 architecture §4 priority policy를 충실히 구현. 새 모듈 42 tests, 인접 모듈 13 tests (env-isolated 재실행) 모두 PASS. PR body의 security-reviewer reuse PASS와 cross-검증 일치. CRITICAL/HIGH/MEDIUM 없음.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

**L1 — PR body의 test 개수 underreport** (doc nit, non-blocking)
- 위치: PR #11 body `Testing` 섹션, `Tests (4 modules, 40 tests, all PASS)`
- 실제: 42 tests (`cost-thresholds 10 + breakpoint-detector 10 + session-spawner 12 + auto-handoff 10`)
- Suggested fix: PR body 수정 — `40 tests` → `42 tests`. Skip 권장 (merge 후 자동 반영 안 됨).

**L2 — `stop-review-loop.test.js:194` 환경 격리 부재** (이 PR의 결함 아님, 기존 테스트 hygiene 이슈)
- 위치: [plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js:180-199](plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js#L180-L199) — "path 7: enforce + STOP_LOOP_CODEX=1 + critical → block + escalate"
- 증상: 부모 shell에 `MCCP_CODEX_DISABLED=1`이 set돼 있으면 `codex-bridge.parseCodexResult`가 verdict='unavailable'로 short-circuit돼 hook이 block path가 아닌 allow path를 타고, 테스트 어설션 `decoded.decision === 'block'` 실패.
- 검증: env unset 후 13/13 PASS, env set 시 path 7만 실패. PR diff는 stop-review-loop.js의 allow path만 추가 — block path 무수정.
- Suggested fix: test 시작 시 `const prev = process.env.MCCP_CODEX_DISABLED; delete process.env.MCCP_CODEX_DISABLED;` + finally에서 복원. **Follow-up PR backlog 권장** — 이 PR scope 밖.

**L3 — `cost-state.isStale()` 호출지의 freshness 임계값 명시성** (cosmetic, optional)
- 위치: `breakpoint-detector.js:42` (`COST_STATE_MAX_AGE_MS = 5_000`) vs `auto-chain.js:40` (`COST_STALE_MS = 3600 * 1000`)
- 관찰: 같은 `cost-state.isStale(N)` API를 두 consumer가 720배 차이나는 N으로 호출. 의도 (hot-path Stop hook vs minute-scale orchestration) 자체는 sound 하지만, [cost-state.js:162](plugins/mccp/scripts/lib/cost-state.js#L162)의 isStale 함수 위에 한 줄짜리 주석 — "Consumer-controlled freshness window. breakpoint-detector uses 5s (hot path), auto-chain uses 1h (orchestration scale)." — 가 있으면 grep으로 발견하는 reader의 혼동을 줄여줍니다.
- Suggested fix: optional comment 추가. 이 PR scope 밖.

## Validation Results

| Check | Result | Note |
|---|---|---|
| Type check | Skipped | Plain JavaScript, no tsc/package.json |
| Lint | Skipped | No lint script configured |
| Tests (new modules) | Pass | 42/42 PASS in 211ms |
| Tests (adjacent — cost-state, state-writer, stop-review-loop) | Pass | 13/13 PASS with env-clean shell (env-induced false-positive isolated — see L2) |
| Build | Skipped | No build step |

## Cross-Gate Context Reuse

- **PR-Codex**: receipt `mccp-pr-codex/v0-3-0-auto-handoff.json` converged round=1 (audited skip via `MCCP_PR_SKIP_CODEX_REVIEW`, reason recorded). `resolution.open_questions=[]` → no preceding-gate CRITICAL.
- **PR-Impeccable**: `design_signal=false` + `skill_available=false`, PR body `## Design Review` is the auto-fallback skip note. No design surface to re-verify.
- **Security-reviewer (PR step)**: PR body의 `### Security Reviewer` PASS. argv-array spawn 패턴 / env parsing robustness / path containment / race-lock ownership_token_hash 모두 검증. Code-reviewer 본 review에서 race-lock test fixture가 canonical schema (`ownership_token_hash`, host-aware tri-state) 그대로 사용함을 확인 — spot-check 일치.

## Architecture Validation

- **Single source of truth** (cost-thresholds.js — architecture §4 promise): grep 결과 `getHandoffCostThresholds()` 호출지가 `cost-state.js` 한 곳 — 약속 honored. 다른 모듈에서 `50/80/100` literal 인라인 안 함.
- **AND-gate priority policy** (breakpoint-detector.js — architecture §4): green / notice → no handoff. critical → unconditional. warning → safe-event + no fix-task. 4가지 priority가 코드 흐름과 1:1 매핑.
- **Hook chain ordering**: `mccp:stop:review-loop` → `mccp:stop:auto-handoff` → `stop:format-typecheck`. review-loop가 `stop_loop_pass` 신호를 STATE.md에 기록한 직후 auto-handoff의 AND-gate가 그 신호를 읽도록 보장됨. auto-handoff 주석의 wiring 의도와 일치.
- **Race-lock pattern reuse**: session-spawner.js가 pr-phase-lock.js의 `hashToken` / `tryReclaimStaleLock` 재사용. ownership_token raw value는 메모리에만, hash만 lock body에 — CLAUDE.md §3.6의 canonical schema 일관.
- **Loud fail-open**: ledger write 실패 (`auto-handoff.js:64-68`) + STATE.md signal 실패 (`stop-review-loop.js:137-139`) 둘 다 stderr 기록 후 ALLOW — [feedback-loud-fail-open](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-loud-fail-open.md) 원칙 honored.

## Files Reviewed

새 모듈 (Added):
- `plugins/mccp/scripts/lib/cost-thresholds.js` — full read
- `plugins/mccp/scripts/state/breakpoint-detector.js` — full read
- `plugins/mccp/scripts/state/session-spawner.js` — full read
- `plugins/mccp/scripts/hooks/auto-handoff.js` — full read
- `plugins/mccp/scripts/lib/tests/cost-thresholds.test.js` — spot-checked, executed
- `plugins/mccp/scripts/state/tests/breakpoint-detector.test.js` — spot-checked, executed
- `plugins/mccp/scripts/state/tests/session-spawner.test.js` — spot-checked, executed
- `plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` — spot-checked, executed

Modified:
- `plugins/mccp/hooks/hooks.json` — chain order verified
- `plugins/mccp/scripts/hooks/stop-review-loop.js` — full read, diff additive (allow path only)
- `plugins/mccp/scripts/lib/cost-state.js` — full read
- `plugins/mccp/scripts/state/state-writer.js` — diff-only, single-line `VALID_EVENTS` add

Docs (skipped — informational):
- `CLAUDE.md`, `docs/v0.2-architecture.md`, `plugins/mccp/.claude-plugin/plugin.json`
- `.claude/PRPs/plans/completed/v0-3-0-auto-handoff.plan.md`, `.claude/PRPs/reports/v0-3-0-auto-handoff-report.md`
- `.claude/plans/v0-3-0-auto-handoff.plan.md` (deleted, moved to completed/)
