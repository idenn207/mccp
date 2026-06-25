# Implementation Report: Dashboard Truthfulness M5a — 진행중 진실성 (데이터 의미론)

**Plan**: `.claude/plans/dashboard-truthfulness-m5-semantics.plan.md` (Task 1 / M5a 부분 ship — M5b Task 2~7 잔여)
**Branch**: dashboard-truthfulness-m4
**Decision**: dashboard-truthfulness-m5-semantics

## Summary

derive 모델의 "진행 중" 카운트가 현실과 어긋나던 결함(#2)을 닫았다. 근본 원인은 두 층이었다:
(1) `parseDeliveryMilestones`가 Plan 셀에서 `(...)` 마크다운 링크만 추출해 **backtick bare-path PRD**(dashboard-truthfulness 등)의 모든 마일스톤을 집계에서 누락 — 정작 현재 작업은 안 보이고, (2) 다수 옛 cycle PRD의 stale `in-progress` 마커가 그대로 노출. 결과적으로 대시보드는 "진행 중"으로 옛 shipped cycle 4~8건을 보여주고 현재 작업(M5)은 비표시였다. 코드 3축(파서 버그 수정 + 완료 자동감지 + 신선도 가드) + stale PRD 7건 데이터 정리로 **진행 중 = 1건(M5)** 달성.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large (M5 전체) | M5a 부분 = Medium |
| Scope | Task 1~7 | Task 1 + 데이터 정리 (M5a). Task 2~7 = M5b 분리 |
| Files Changed | 13 (M5 전체) | 13 (M5a: code 3 + 신규 test 1 + PRD 8 + plan/report) |

## Tasks Completed (M5a)

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | #2 진행중 진실성 — 완료 자동감지 + 신선도 가드 + 데이터 정리 | 완료 | 3축 전부 + Codex F1/F2/F3 흡수 |
| — | Task 2~7 (위험/차단·Hero·verdict·version·route·문서) | 이연 | M5b (사용자 결정 2026-06-25) |

## Codex Adversarial Review (흡수)

- **Plan-Codex** (3 HIGH): F1 OR-기반 완료감지 → exact decision_id + plan_hash freshness, F2 route overflow 도달성(M5b Task 6), F3 PRD double in-progress → M4 명시 complete.
- **Implement-Codex** (2 HIGH): F1 `is_stale` 플래그 부재 → **plan_hash 상관**(correlate.js Kind 4 메커니즘), F2 PRD working-tree double in-progress → 즉시 데이터 수정. F4(위험 lifecycle scope) backlog 이월.

## 구현 상세

- `parsers/plan-body.js` — `parseDeliveryMilestones`가 `extractPlanPath` 재사용(backtick bare-path 추출, Complete/Lifecycle 파서와 일관) + parsePlanBody 완료 override 레이어(plan_hash-fresh terminal receipt OR ledger) + 활동기반 신선도 가드(`MCCP_DASHBOARD_STALE_DAYS` 기본 14).
- `parsers/decision-state.js` — `isMilestoneClosed({decisionId, planBasename, currentPlanHash, receipts, ledgerItems})` helper(기존 SSoT 확장). terminal gate(mccp-pr-codex/code-reviewer) converged + exact decision_id + fresh plan_hash, OR ledger converged. generic/legacy/stale/모호 매핑은 fail-closed.
- `sections/status-grid.js` — in-progress 카운트 = fresh only(stale 제외, muted 별도 표기).
- 데이터 정리 8 PRD row: dashboard-truthfulness M4→complete + M5 추가, v0.3.5/v0.4.0(axis H)/v1.4.2-m1·m2/v0.3.6(×3)/v1.0.1-axis-k-m2/serve-refresh/console-redesign-m4 → complete.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (node --test) | Pass | renderer 466 + derive/stale-audit 105 + 신규 15 = 585, 0 fail |
| Unit (신규) | Pass | `completion-detect.test.js` 15케이스 (Codex F1 negative e/f/g/h 포함) |
| e2e render | Pass | `derive/cli.js render` → 진행 중 = 1 (M5) |
| Regression | Pass | 0 회귀 (parseDeliveryMilestones 변경 광범위에도) |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | parse 버그 + override + 신선도 |
| `plugins/mccp/scripts/lib/renderer/parsers/decision-state.js` | UPDATE | isMilestoneClosed |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | fresh-only count |
| `plugins/mccp/scripts/lib/renderer/tests/completion-detect.test.js` | CREATE | 15 케이스 |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M5 추가 + M4 complete |
| `.claude/prds/{v0-3-5,v0-4-0-orchestrator,v1-4-2-dashboard-overhaul,v0-3-6,v1-0-1-axis-k…,dashboard-serve-refresh,dashboard-console-redesign}.prd.md` | UPDATE | stale in-progress → complete |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | F4 이월 |

## Deviations from Plan

- **범위 분할(M5a/M5b)**: 비용 critical + 세션 길이로 Task 1만 ship(사용자 결정). plan Risk "범위 과대" + Open Question "범위 분할" 발동.
- **데이터 정리 확대**: parse 버그 수정이 추가 stale 마커(v0.3.6/v1.0.1/serve-refresh/console-redesign-m4)를 노출 → 사용자 "데이터까지 정리" 결정으로 7건 전부 정리. git-commit-time이 bulk commit으로 오염 + STATE.md task_fingerprint(`dashboard-pipeline-chart`)가 cycle-prefix 없어 cycle/activity 가드 모두 무력 → 데이터 정리가 유일 신뢰 메커니즘으로 확인.

## Issues Encountered

- implement 게이트의 F1/F2 plan 편집이 plan_hash 변경 → plan-codex receipt stale → re-anchor 복구(plan_hash freshness 메커니즘의 정상 작동, 아이러니하게 F1 그 자체).
- H16 advisory 1건(risk-list, pre-existing 부채) — 비차단, M5b Task 2 영역.

## Next Steps (M5b, 다음 세션)
- [ ] Task 2 위험/차단 정합 / Task 3 Hero / Task 4 verdict 라벨 / Task 5 hero-version / Task 6 route 링크(F2 full-render) / Task 7 문서·version·impeccable audit·polish
- [ ] M5b 완료 시 PRD M5 row → complete + plugin.json bump + plan archive
