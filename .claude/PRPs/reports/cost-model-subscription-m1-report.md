# Implementation Report: Cost Model — Subscription Opt-in Gate (M1)

> **작성 맥락**: 이 M1은 이전 세션(2026-07-09 22:28~22:32)에서 구현 + 양쪽 게이트(Plan-Codex / Implement-Codex)까지 완료된 상태였다. 본 리포트는 `/mccp:prp-implement` 재실행 시 워킹 트리의 완성 상태를 **검증**한 결과를 기록한다 — 재구현·덮어쓰기는 하지 않았다.

## Summary

`MCCP_SUBSCRIPTION=1|on` opt-in flag를 도입해 5개 자동화 소비처(`resolveFanout`·`resolveFleet`·`shouldSkipBriefing`·auto-chain `shouldAbort`·breakpoint-detector `detect`)가 USD cost-state/tier 게이트를 우회하도록 만들었다. 폭주 방지는 harness가 매 PostToolUse마다 bridge에 채우는 **context overflow 축**(`context_remaining_pct` + `tool_count`)으로 대체한다. flag 미설정 시 5개 소비처의 **판정(decision)은 byte-identical** — 종량제 회귀 0 (단 Task 3 writer는 subscription 무관하게 1회 best-effort `context-current.json` telemetry write를 추가 — Codex F3 정직 수용).

전면 fail-open 정책: 신호 부재/stale → 진행(unblock 최우선). 폭주 방지는 positive critical 신호(잔여 context ≤25%)에서만 발화.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 일치 |
| Files Changed | 21 (17 UPDATE + 4 CREATE, plan 표 기준) | 21 (17 tracked modified + 4 new) |
| Version bump | `1.20.15 → 1.20.16` | `1.20.16` 확인 |
| 회귀 | 종량제 판정 byte-identical | 플랜 모듈 테스트 115/115, 신규 회귀 0 |

## Tasks Completed

| # | Task | Status | Artifact |
|---|---|---|---|
| 1 | subscription oracle 모듈 | ✅ Complete | `lib/subscription.js` (173 L) — `isSubscriptionMode`·`parseOverflowThresholds`·`evaluateOverflow`·frozen `REASONS` |
| 2 | context-state snapshot 모듈 | ✅ Complete | `lib/context-state.js` (125 L) — read/write/stale + `context_ts` out-of-order reject (Codex F2) |
| 3 | ecc-context-monitor writer 배선 | ✅ Complete | `hooks/ecc-context-monitor.js` (+14) — 격리 try/catch best-effort stamp |
| 4 | resolveFanout subscription 분기 | ✅ Complete | `lib/plan-fanout/budget.js` (+24) — USD order 3-4 대체, fail-open run |
| 5 | resolveFleet subscription 분기 | ✅ Complete | `lib/implement-dispatch/budget.js` (+59) — 구조 게이트(opt-in/merge-strategy/partition/budget) 불변 |
| 6 | shouldSkipBriefing subscription 분기 | ✅ Complete | `lib/briefing/cost-guard.js` (+22) — env-off/codex-disabled/pr-phase 불변 |
| 7 | auto-chain cost-telemetry → context-overflow | ✅ Complete | `lib/auto-chain.js` (+29) — order 7만 대체, 타 trigger 불변 |
| 8 | breakpoint-detector subscription tier 파생 | ✅ Complete | `state/breakpoint-detector.js` (+60) — tier를 overflow에서 파생, 신호부재 conservative no-handoff |
| 9 | command body 배선 + SessionStart 배너 | ✅ Complete | `commands/plan.md` (+6)·`commands/work.md` (+5)·`hooks/session-start.js` (+10) |
| 10 | 문서 + version bump | ✅ Complete | `plugin.json` (1.20.16)·`CLAUDE.md` (+7)·`CHANGELOG.md` (+26) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 플랜 모듈 단위 테스트 | ✅ Pass | 115/115 (subscription/context-state/fanout/fleet/briefing/auto-chain/breakpoint-detector) |
| require 무결성 | ✅ Pass | 6개 소비처 모듈 require OK |
| Receipt 체인 | ✅ Valid | `validate --command mccp:prp-implement` exit 0 — missing/stale/blocking/open_critical 전부 empty |
| plan_hash 정합 | ✅ Match | 현재 플랜 `sha256:e6decf36…` = receipt plan_hash |
| 전체 회귀 스위트 | ⚠️ 2741/2751 pass | 6 fail — **전부 pre-existing, 이 플랜 무관** (아래 참조) |

### Gate receipts

| Gate | Verdict | advisory | 비고 |
|---|---|---|---|
| `mccp-plan-codex/cost-model-subscription-m1.json` | `converged` | false | R1 수렴 (F1 fail-open 수용, F2/F3 흡수) |
| `mccp-implement-codex/cost-model-subscription-m1.json` | `converged` | false | cross-gate dedupe 적용 (implement-time 신규 결정 없음) |

### Pre-existing test failures (이 플랜과 무관 — 회귀 아님)

6건 모두 이 플랜이 **수정하지 않은 파일/모듈**에 있으며, 커밋 HEAD(`edc9c50`)에서 이미 실패하던 것이다:

| 실패 테스트 파일 | 영역 | 근거 |
|---|---|---|
| `hooks/tests/g1-patch.test.js` (3건) | receipt-prompt/skill 훅 module-load | 훅·테스트 모두 미수정 |
| `lib/renderer/tests/verdict-label.test.js` | 대시보드 렌더러 `#drawer-data` 파싱 | 렌더러 미수정 |
| `lib/tests/design-critique-loop-e2e.test.js` | `.claude/cache/` 픽스처 존재 | 픽스처는 non-tracked test-time 산출물(§3.9) |
| `lint/tests/validate-callsite-lint.test.js` | `commands/pr.md:165` `--plan` 누락 | `pr.md` 미수정, HEAD에 이미 존재 |

이 플랜이 수정한 `plan.md`/`work.md`는 validate-callsite lint를 **통과**(오직 `pr.md`만 flag). → **신규 회귀 0**, 플랜 acceptance "종량제 회귀 0" 충족.

## Files Changed

**Modified (17, +371/-26 tracked):** `CHANGELOG.md`·`CLAUDE.md`·`plugin.json`·`commands/plan.md`·`commands/work.md`·`hooks/ecc-context-monitor.js`·`hooks/session-start.js`·`lib/auto-chain.js`·`lib/briefing/cost-guard.js`·`lib/briefing/tests/cost-guard.test.js`·`lib/implement-dispatch/budget.js`·`lib/implement-dispatch/tests/budget.test.js`·`lib/plan-fanout/budget.js`·`lib/plan-fanout/tests/budget.test.js`·`lib/tests/auto-chain.test.js`·`state/breakpoint-detector.js`·`state/tests/breakpoint-detector.test.js`

**Created (4):** `lib/subscription.js` (173 L)·`lib/context-state.js` (125 L)·`lib/tests/subscription.test.js` (135 L)·`lib/tests/context-state.test.js` (82 L)

## Design Grounding

N/A — control-plane 전용 변경(렌더 UI surface 없음), design trigger 미발화.

## Deviations from Plan

None — 플랜대로 구현됨. Codex 흡수 3건이 모두 반영됨:
- **F1 (fail-open runaway 위험)**: ACCEPT_RISK(documented) — 전면 fail-open 유지, `subscription.js` 상단 주석에 명시.
- **F2 (latest-wins 은폐)**: ACCEPT_NOW — `context-state.js`에 `context_ts` + `isOlderSample` out-of-order reject 구현.
- **F3 (무조건 write byte-identical 위반)**: ACCEPT_NOW — Summary/Acceptance를 "판정 byte-identical + 1회 best-effort write"로 정직화.

## Issues Encountered

없음. 워킹 트리에 이전 세션 구현이 완전한 상태로 존재했고, 검증 결과 게이트/테스트/receipt 모두 정합.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/subscription.test.js` | oracle 순수 로직 | 파싱·invariant·evaluateOverflow tier/fail-open |
| `lib/tests/context-state.test.js` | round-trip | 손상 파일 → null·out-of-order reject·isStale |
| `lib/plan-fanout/tests/budget.test.js` (+) | resolveFanout subscription | on/off 경로 + 회귀 불변 |
| `lib/implement-dispatch/tests/budget.test.js` (+) | resolveFleet subscription | 구조 게이트 불변 |
| `lib/briefing/tests/cost-guard.test.js` (+) | shouldSkipBriefing subscription | overflow 축 대체 |
| `lib/tests/auto-chain.test.js` (+) | shouldAbort context-overflow | overflow→abort / 신호부재→allow |
| `state/tests/breakpoint-detector.test.js` (+) | detect subscription tier | context critical/warning/green + 신호부재 no-handoff |

## Next Steps (사용자 대기 — outward-facing)

사용자 선택("리포트만 작성 후 대기")에 따라 아래는 **미실행**으로 남겨둔다:

- [ ] PRD M1 status `in-progress → complete` flip (`.claude/prds/cost-model-subscription.prd.md` Delivery Milestones 표)
- [ ] 플랜 아카이브 여부 결정 (`.claude/plans/` 유지 vs `PRPs/plans/completed/` 이동)
- [ ] `/mccp:prp-commit` — 21개 파일 + receipt + plan 커밋
- [ ] `/mccp:pr` — cross-gate dedupe로 PR-Codex 빠른 통과 예상
- [ ] (별도 축, 이 플랜 out-of-scope) pre-existing 6 failure — 특히 `pr.md:165` validate-callsite `--plan` 누락은 실제 결함이므로 후속 처리 권장
