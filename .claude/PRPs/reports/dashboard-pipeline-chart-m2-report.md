# Implementation Report: Dashboard Activity Step Chart (M2)

## Summary
대시보드 `status.html`의 audit-timeline 섹션을 평범한 `<ul>` 텍스트 로그에서 시간순 세로 step-chart rail로 변환. 각 receipt가 세로 connector 위 상태 노드 마커(✓ 수렴 quiet / ◐ 진행 loud)로 표시된다. 데이터 로직(snapshot read, MAX_ROWS caps, 정렬, footnote, briefing, md 출력)은 일절 변경 없이 시각 레이어만 재구성했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | ~9 (audit-timeline/html/output-constraints/DESIGN/tests×4/plugin.json/CHANGELOG) | 8 changed + 1 created |
| Test count | 신규 timeline-chart 8 + 회귀 | 305/305 pass (신규 8 + tl-node carve-out 1 + 회귀 갱신 1) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 2.5 | Implement-Codex gate | Complete | cross-gate dedupe (plan-codex 수렴 decision-set), plan-codex hash refresh |
| 1 | audit-timeline.js step-chart 변환 | Complete | NODE_TL map + renderRow HTML 재구성 + `<ol class="timeline tl-rail">` + footnote tl-note. 데이터 로직·md 불변 |
| 2 | html.js CSS rail + enhancement | Complete | `.tl-rail::before` background connector(border-left 미사용) + `.tl-node` pill + emphasis 반전 색 + PIPELINE_SCRIPT tl-step hover |
| 3 | output-constraints.js carve-out + DESIGN.md | Complete | H3_CARVEOUT에 tl-node + DESIGN.md H3 행 + v1.14.0 design intent 절 |
| 4 | tests | Complete | timeline-chart.test.js 신규 8 + output-constraints/render-integration/audit-timeline-snapshot 갱신 |
| 5 | plugin.json + CHANGELOG | Complete | 1.13.0 → 1.14.0, [1.14.0] 행 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (node -c) | Pass | audit-timeline.js / html.js 구문 OK |
| Unit Tests | Pass | 305/305 (renderer 전체 스위트) |
| Build/Render | Pass | `derive/cli.js render` 성공, `class="timeline tl-rail"` 산출 확인 |
| Integration | Pass | render-integration 합성 HTML에 timeline rail + 외부 script URL 0 |
| Security invariant | Pass | 외부 `<script src=https?://>` 0 (M1 F2 trust boundary 유지) |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATED | NODE_TL map + step-chart HTML + footnote tl-note |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | .tl-* CSS + tl-step enhancement |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATED | tl-node H3 carve-out |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATED | H3 carve-out + design intent 절 |
| `plugins/mccp/scripts/lib/renderer/tests/timeline-chart.test.js` | CREATED | 8 test |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATED | tl-node carve-out narrow 검증 |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATED | timeline rail assert |
| `plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` | UPDATED | footnote class 회귀 갱신 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.14.0 |
| `CHANGELOG.md` | UPDATED | [1.14.0] |

## Deviations from Plan
- **Plan 미archive**: receipt chain plan_hash anchor + 후속 /mccp:pr validate가 plan 경로를 참조하므로 `.claude/plans/`에 유지(M1 plan 선례 동일). prp-implement Phase 5의 archive 단계 skip.
- **a11y-severity-non-color.test.js 미수정**: 해당 파일은 severity tag 전용. timeline 노드 a11y(icon+sr-only)는 신규 timeline-chart.test.js가 lock하므로 중복 회피.

## Issues Encountered
- **Codex F1 (HIGH)**: STATE.md `chain_aborted=true`+`session_end_imminent=true`(이전 v1.4.2 세션 잔재)가 in-progress chain을 short-circuit → `state-writer.update()`로 reconcile.
- **Codex F2 (MEDIUM)**: `<span class="tl-body">`가 flow content `<blockquote>` wrap = non-conforming → `<div class="tl-body">` 전환 + containment 구조 test.
- **plan-codex receipt stale**: 2.5.1 dedupe note append로 plan_hash 변경 → plan-codex receipt를 현재 hash로 refresh(converged 플래그 유지).
- **design-lint H10/H16 advisory**: live `.claude/` 데이터(STATE.md/plan prose)의 em-dash·markdown marker에서 기인(timeline 섹션 자체는 0). 비차단, fixture 기반 테스트는 green.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `timeline-chart.test.js` | 8 | rail wrapper / converged-quiet·pending-loud / briefing containment(F2) / md 동치 / escape / footnote tl-note |
| `output-constraints.test.js` | +1 | tl-node carve-out narrow |
| `render-integration.test.js` | +2 assert | timeline rail 합성 HTML |

## Next Steps
- [ ] `/mccp:prp-commit` → `/mccp:pr` (auto-chain)
- [ ] PR merge 후 `claude plugin update` → cache `1.14.0/` 생성
- [ ] M3 (GitHub Actions 전체 비주얼 리프레시) 후속 cycle
