# Implementation Report: Cost Model — Harness-Cost Accuracy (M2)

**Plan**: `.claude/plans/cost-model-subscription-m2.plan.md`
**PRD**: `.claude/prds/cost-model-subscription.prd.md` (Milestone 2)
**Branch**: `v1.21.2-cost-model-subscription-m2`
**Version**: `1.21.1 → 1.21.2` (단일 milestone patch, §3.7)

## Summary

두 축으로 "부풀려진 가상 비용"의 정확도 근원을 닫았다.

- **Axis A (harness writer 배선)** — 번들 statusline(`ecc-statusline.js`)이 매 렌더마다 harness 실비(`cost.total_cost_usd`)를 per-session 캐시(`harness-cost-<sid>.json`)로 stamp. cost-tracker(Stop) · ecc-context-monitor(PostToolUse)가 fresh 시 실비를 우선 소비. 소비 측은 이미 완비돼 있었고 비어 있던 생산 측을 채웠다.
- **Axis B (threshold SoT 통일)** — `ecc-context-monitor.js`의 로컬 `50/80/100` 상수를 `cost-thresholds.js#getHandoffCostThresholds()`로 통일. `MCCP_HANDOFF_THRESHOLDS_USD` env override가 tier · `hard_ceiling` · **STATE.md abort 채널**(`session_end_imminent`/`chain_aborted`) 전부에 도달 — env 즉효완화(500/800/1000)가 절반만 먹던 leak 봉인.

writer 미설치 커스텀 statusline은 transcript-sum fallback 유지 → **회귀 0**. sticky monotonic-MAX 잔존값 제거는 M3(time-based decay) 몫.

## Implement-Codex Gate — 흡수한 findings

Codex verdict=`needs-attention`(HIGH 1 + MED 3) → 4건 전부 구현-시점 흡수 → converged.

| Finding | Sev | 흡수 |
|---|---|---|
| F1 freshness guard가 `bridge.last_timestamp`(ISO 활동시각)에 keying → 타입 불일치 + harness 항상 older → **Axis A 무력화** | HIGH | `ecc-metrics-bridge.js`가 cost **값 변경 시에만** numeric `cost_sample_ts`(epoch초) stamp. `resolveSessionCost`는 `harness.ts >= bridge.cost_sample_ts`(동일 단위·정확 비교)로 판정. `last_timestamp` 비교 폐기 |
| F2 `tierFor`는 `>=`, plan은 `cost > threshold` → 정확 임계값에서 tier=critical인데 hard_ceiling/chain_aborted=false | MED | comparator `>=`로 통일: evaluateConditions · hardCeiling · STATE.md 전부 per-call `getHandoffCostThresholds()` `>=` |
| F3 statusline이 캐시에 write하지만 표시는 여전히 `bridge.total_cost_usd` | MED | `renderStatusline`이 `data.cost.total_cost_usd`(live harness) 유한·≥0 시 표시 우선, 부재 시 bridge fallback |
| F4 dual read API 단일 validator 부재 + meta shape 혼용 | MED | private `readHarnessCostRecord`가 모든 검증 SoT. `readHarnessCost`/`readHarnessCostMeta`는 얇은 adapter. shape `{cost_usd,ts}` 고정 |

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (Implement-Codex F1 흡수로 ecc-metrics-bridge.js 1파일 scope 확장) |
| Files Changed | 13 (plan) | 15 (+ecc-metrics-bridge.js·test = F1 흡수, + renderer footer 2 = §3.7 sync) |

## Tasks Completed

| # | Task | Status |
|---|---|---|
| 1 | harness-cost.js 공용 lib (단일 validator) | ✅ |
| 2 | harness-cost.test.js (round-trip·stale/future/corrupt/negative·F4 parity·tmp leak) | ✅ |
| 3 | cost-tracker.js inline→lib (byte-identical, os require 제거) | ✅ |
| 4 | ecc-statusline.js writer 배선 + F3 render source | ✅ |
| 5 | ecc-statusline.test.js (writer 호출/격리 + F3 + extractHarnessCost) | ✅ |
| 6 | ecc-context-monitor.js Axis A+B / F1+F2 + ecc-metrics-bridge.js F1 | ✅ |
| 7 | ecc-context-monitor.test.js 확장 + ecc-metrics-bridge.test.js 신규 | ✅ |
| 8 | docs + version bump + footer sync + CLAUDE.md + CHANGELOG + PRD | ✅ |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (require integrity) | ✅ Pass | 5 hook modules + 2 renderer 모두 clean load |
| Unit Tests | ✅ Pass | M2 신규/확장 42 test green |
| Full lib suite | ✅ (회귀 0) | 789 tests, 784 pass, **2 fail = pre-existing** (codex-companion smoke env-dependent · design-critique-loop-e2e fixture 미tracked — clean base에서 동일 실패 확인) |
| Full hooks suite | ✅ (회귀 0) | 247 tests, 244 pass, **3 fail = pre-existing** (g1-patch receipt hooks — clean base 동일) |
| Build / Integration | N/A | package.json·dev server 없음 (`node --test` 프로젝트) |

**회귀 검증**: 5개 실패는 `git stash --include-untracked`로 clean base(main)에서 동일하게 재현 → 전부 M2 무관 pre-existing. 종량제 경로(subscription unset·harness cache miss·transcript-sum fallback) 불변 확증.

## Design Grounding

N/A — control-plane 변경(rendered surface 없음, `impeccable-detect` `design_signal=false`). Phase 2.5.5c capture 없음 → Phase 3.7 no-op.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/harness-cost.js` | CREATE |
| `plugins/mccp/scripts/lib/tests/harness-cost.test.js` | CREATE |
| `plugins/mccp/scripts/hooks/cost-tracker.js` | UPDATE (dedupe) |
| `plugins/mccp/scripts/hooks/ecc-statusline.js` | UPDATE (writer + F3) |
| `plugins/mccp/scripts/hooks/tests/ecc-statusline.test.js` | CREATE |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE (Axis A+B / F1+F2) |
| `plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js` | UPDATE (+Axis A/B/F1/F2) |
| `plugins/mccp/scripts/hooks/ecc-metrics-bridge.js` | UPDATE (F1 cost_sample_ts) |
| `plugins/mccp/scripts/hooks/tests/ecc-metrics-bridge.test.js` | CREATE (F1) |
| `docs/harness-cost-contract.md` | CREATE |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE (footer v1.21.2) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE (footer v1.21.2) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE (1.21.2) |
| `CLAUDE.md` | UPDATE (§5 pointer) |
| `CHANGELOG.md` | UPDATE (1.21.2 row) |
| `.claude/prds/cost-model-subscription.prd.md` | UPDATE (M2 status) |

## Deviations from Plan

- **ecc-metrics-bridge.js scope 확장** — Implement-Codex F1(freshness guard 무력화)을 정확히 흡수하려면 bridge가 numeric `cost_sample_ts`를 stamp해야 했다. plan Files to Change에 행 추가 + Codex Implementation Review에 명시. 이는 Implement-Codex 게이트의 정상 작동(plan-time가 놓친 구현 결함 포착).
- **renderer footer 2파일** — §3.7 version-sync 표준 의무(plan Files to Change에 후행 추가).
- **F2 exact-boundary 의미 변경** — 정확히 임계값($50/$80/$100)에서 이제 `>=`로 tier와 일치하게 발화(이전 `>`는 boundary miss). float cost 특성상 exact-boundary hit은 드물고, tier·hard_ceiling·STATE.md 정합성이 우선.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr`
- [ ] (M3) time-based decay로 sticky monotonic-MAX + 이미 set된 STATE.md abort flag 제거
