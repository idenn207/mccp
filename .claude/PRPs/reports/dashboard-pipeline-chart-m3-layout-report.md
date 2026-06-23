# Implementation Report: Dashboard M3 — 레이아웃 재설계 (다크 파이프라인 콘솔)

## Summary

status.html을 평면적 단일컬럼에서 **다크 파이프라인 콘솔**로 재설계. 좌측 섹션 nav 레일(작동 anchor) + 우측 목적 있는 비중첩 카드 2D(Vercel 베이스), 다크 default + light opt-in, primary→status→detail 위계, 반응형 구조적 collapse. 데이터/derive/receipt 스키마 불변(read-side 시각 레이어만).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large(외과적 — 컴포넌트 클래스 보존으로 blast radius 7 test) |
| Files Changed | ~10 | 13 (코드 2 + 테스트 6 + 문서 3 + plugin.json + CHANGELOG) |
| Test impact | ~319 대량 | 7 design-layer 갱신 + 11 신규, behavior 0 회귀 |

## Tasks Completed

| # | Task | Status |
|---|---|---|
| 1 | 다크-default 토큰 시스템 | done |
| 2 | 2D 콘솔 레이아웃 (nav 레일 + 카드) | done |
| 3 | 목적 있는 비중첩 카드 + 섹션 매핑 (section-purpose map) | done |
| 4 | 반응형 구조적 collapse (≤720px) | done |
| 5 | 정보 위계 3단계 + heading ≤3 | done |
| 6 | DESIGN.md + PRD §Design Direction 갱신 | done |
| 7 | 2-bucket 테스트 가드 + version/CHANGELOG | done |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (design-lint H1–H17) | PASS | 개정 H1/H2/H3 + 신규 H17 + H4/H6/H7 유지 |
| Unit (renderer) | PASS | 323/323 (+11 신규: responsive 6, H17 5) |
| Unit (derive) | PASS | 68/68 (render-path consumer, 0 회귀) |
| a11y | PASS | contrast/landmarks/aria/severity-non-color (양 theme) |
| Render | PASS | status.html 생성, nav+verdict+5카드+2D+반응형 확인 |

## Codex / Design gate

- Plan-Codex: needs-attention → R1 3 finding absorbed (F1 2-bucket 테스트, F2 H17 DOM-aware, F3 inert affordance 0).
- Implement-Codex: cross-gate dedupe (아키텍처 plan-codex 수렴, files ⊆ plan).
- Design critique: converged (17 H-invariant + a11y + responsive lint 통과 + PRODUCT.md anti-refs 준수).

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE (토큰+레이아웃+카드+nav+반응형) |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE (H1/H2/H3 개정 + H17) |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE (schema 17 + H3 carve + H17 5 test) |
| `plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js` | CREATE (6 test) |
| `tests/{a11y-landmarks,header-hoist,four-part-rendering,render-integration}.test.js` | UPDATE (카드 구조 assertion) |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE (supersede note + H17) |
| `.claude/prds/dashboard-pipeline-chart.prd.md` | UPDATE (§Design Direction + M3 row) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE (1.15.0→1.16.0) |
| `CHANGELOG.md` | UPDATE ([1.16.0]) |

## Deviations from Plan

- **Phase 7 auto-chain(commit→PR) 보류**: 디자인 변경을 사용자가 시각 확인 후 ship하기 위해 commit/PR 전 checkpoint. (outward-facing PR + 사용자가 명시적으로 보고 결정 원함.)

## Next Steps

- [ ] 사용자가 `.claude/cache/status.html` 브라우저로 시각 확인
- [ ] 확인/조정 후 `/mccp:prp-commit` → `/mccp:pr`
- [ ] M4: 우측 Drawer 상세 + nav active-추적 + Tailwind 터미널 prompt (본 콘솔 셸 위에)
