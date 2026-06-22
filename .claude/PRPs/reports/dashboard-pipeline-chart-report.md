# Implementation Report: Dashboard Gate-Pipeline Chart (M1)

## Summary
mccp 진행 현황 대시보드(`status.html`)에 receipt를 `decision_id`별로 묶어 게이트 진행(plan-codex → implement-codex → pr-codex)을 가로 파이프라인 스테퍼로 보여주는 신규 섹션을 추가했다. inline SVG/CSS baseline(JS 없이 상태 표시) + vendored-inline jQuery progressive enhancement(노드 툴팁 + focusable 행). self-contained 유지(외부 script URL 0). GitHub Actions 절제 미학.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 12 | 11 changed + 1 vendored 디렉토리 |
| Tests | pipeline + output-constraints + render-integration | 296/296 PASS (신규 10 + 5) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | pipeline.js 신규 섹션 | Complete | canonical 정규화(F1) + status-aware collapse(F3) + a11y + escape |
| 2 | html.js 조립 + CSS + jQuery enhancement | Complete | vendored-inline jQuery slim 3.7.1 (외부 src 0, F2) |
| 3 | index.js wire | Complete | safeSection('pipeline') grid 다음 |
| 4 | output-constraints carve-out + DESIGN.md | Complete | H3 pipe-node carve-out + docs/DESIGN.md 근거. H4는 SVG/수평라인으로 회피 |
| 5 | markdown.js 분기 | Complete | `## 게이트 파이프라인` 텍스트 표현(D4) |
| 6 | plugin.json + CHANGELOG | Complete | 1.12.0 → 1.13.0 (1.12.0은 #52 선점) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit Tests | Pass | 296/296 (renderer suite) |
| Render smoke | Pass | 파이프라인 섹션 렌더 + jQuery inline + 외부 URL 0 |
| design-lint | Pass (advisory) | H3 위반 0(carve-out 정상). H10/H16은 기존 content-driven advisory(plan/receipt 본문 em-dash), 제 코드 무관 |
| Version | Pass | plugin.json=1.13.0 |

## Deviations from Plan

- **D1 진화**: plan 초안은 CDN, Codex F2가 vendored-inline으로 뒤집음 → 최종 vendored-inline jQuery slim (사용자 "jQuery 적극 활용" 결정 honoring + 보안).
- **범위**: 3-milestone 묶음 → 사용자 결정으로 **M1만** ship (M2/M3 후속 cycle).
- **버전**: 세션 중 origin/main이 v1.12.0(#52)로 전진 → 브랜치 ff-rebase + 1.13.0으로 bump 변경.
- **H4 carve-out**: plan은 H4 carve-out 가능성 명시 → 연결선을 `.pipe-edge` 수평 라인(height+background)으로 구현해 **H4 carve-out 불필요**(border-left 미사용).
- **four-part-rendering.test.js**: sections positional fixture가 8요소로 갱신 필요(pipeline 삽입) — wiring 회귀 수정(minor).
- **output-constraints H10/H16 `<script>` strip**: vendored jQuery가 lint에 false-positive를 내 `<code>`/`<pre>`처럼 `<script>`도 strip(정확한 수정 + 잠금 테스트 추가).

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` | CREATE |
| `plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js` | CREATE |
| `plugins/mccp/scripts/lib/renderer/vendor/jquery-3.7.1.slim.min.js` | CREATE (vendored) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATE |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE (1.13.0) |
| `CHANGELOG.md` | UPDATE |
| `PRODUCT.md` / `DESIGN.md` (root) | init 셋업 (impeccable) |

## Next Steps
- [ ] `/mccp:pr` PR 생성 (origin/main v1.12.0 base)
- [ ] M2 활동 로그 step chart / M3 GitHub Actions 전체 리프레시 (후속 cycle)
