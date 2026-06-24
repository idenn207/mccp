# Implementation Report: Dashboard Truthfulness M2 — 개요 → '대시보드' 재구성

## Summary

콘솔 셸 첫 route(`#route-overview`)를 카운트-only hero에서 **호스트 프로젝트 현재 상태를 명시하는 '대시보드'**로 재구성했다. (1) 라우트/네비/탭/STATUS.md 섹션 '개요'→'대시보드' 재명명(route id·`data-route` 식별자 불변, 표시 텍스트만), (2) 버전을 derive 레이어 additive `model.host_version` snapshot에서 소비(host meta→CHANGELOG→git-tag→plan-cycle→미상 사다리, F2), (3) 진행중·차단·위험을 카운트가 아닌 **항목 이름**으로 나열(top-3 + 접힘), (4) 다음 행동을 STATE.md `Next Step`에서 추출한 실행가능 full command line + 복사 버튼으로(F1). 렌더 데이터 조립은 `status-grid.js` 한 곳에 집중, html/markdown 컴포저는 산출 cell만 소비 — STATUS.md plain-text 동등본 불변.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | ~24 | 23 (4 new source/test + 7 test updates + 4 src + 4 docs/meta) |
| New modules | 2 (host-version, next-action) | 2 |
| Test regressions | 0 (gate) | 0 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | host-version 폴백 사다리 (derive) | [done] Complete | `allowGit:false`로 derive spawn-free 유지(perf budget) — F2-외 추가 결정 |
| 1b | derive `model.host_version` 와이어 | [done] Complete | additive top-level, MODEL_VERSION 'v1' 불변 |
| 2 | next-action 파서 (full command line + REQUIRES_ARG) | [done] Complete | F1 — 순수 함수, in-progress 폴백 resolved path |
| 3 | status-grid → dashboard 데이터 조립 일원화 | [done] Complete | md/html/cells 키 불변 + version/nextAction 추가 |
| 4 | html.js 재명명 + hero 재구성 | [done] Complete | axis-legend → named-widget, hero CSS(신규 색 토큰 0) |
| 5 | markdown.js STATUS.md 동등본 | [done] Complete | `## 현황`→`## 대시보드` + grid.md 확장 |
| 6 | 깨지는 테스트 갱신 + 신규 테스트 | [done] Complete | 7 update + 3 new(host-version/next-action/dashboard-overview) |
| 7 | 문서 + version bump + PRD | [done] Complete | plugin.json 1.18.4 + 양 footer + docs §2.1/§12. PRD는 plan 작성자가 이미 갱신 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (require) | [done] Pass | 신규 모듈 4종 syntax OK |
| Renderer suite | [done] Pass | 408/408 (0 회귀) |
| Derive suite | [done] Pass | 87/87 (perf-budget 포함 — git spawn 제거로 해소) |
| Design constraints + a11y | [done] Pass | 101/101 (output-constraints/design-invariants/a11y-severity/oklch) |
| Cross-dir import | [done] Pass | impeccable-detect-design-surface 15/15 |
| E2E render | [done] Pass | `## 대시보드` + `v1.18.4 · CHANGELOG` + named widgets + `/mccp:resume` + route id 동결 |

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/derive/host-version.js` | CREATED |
| `plugins/mccp/scripts/lib/renderer/parsers/next-action.js` | CREATED |
| `plugins/mccp/scripts/derive/tests/host-version.test.js` | CREATED |
| `plugins/mccp/scripts/lib/renderer/tests/next-action.test.js` | CREATED |
| `plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js` | CREATED |
| `plugins/mccp/scripts/derive/{index,model}.js` | UPDATED |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATED |
| `plugins/mccp/scripts/lib/renderer/tests/{a11y-aria-labels,console-shell,header-hoist,i18n-surface,integration,renderer-generic}.test.js` | UPDATED |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | UPDATED |
| `docs/v1.3.0-observability/{dashboard-surface,schema-surface}.md` | UPDATED |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED (1.18.3 → 1.18.4) |
| `CHANGELOG.md`, `.claude/prds/dashboard-truthfulness.prd.md` | UPDATED |

## Deviations from Plan

1. **host-version git-tag rung은 derive에서 spawn-free(`allowGit:false`)로 skip**. 초기 구현은 derive 시점에 `git describe`를 spawn했으나 `perf-budget.test.js`(1000ms 예산)를 전체 스위트 부하에서 초과시켰다(git spawn은 cold ~600ms + 부하). derive는 "read-only·dep-free·fast" 계약이므로 git-tag rung을 derive 경로에서 opt-out(rung 자체는 injection으로 보존·테스트). mccp repo는 CHANGELOG가 먼저 hit하므로 실효 동작 무변경.
2. **plan 아카이브 미실행**. 명령 Phase 5는 plan을 `completed/`로 이동하라고 하나, plan-codex/implement-codex receipt가 `.claude/plans/` 경로의 plan_hash를 참조하므로 지금 이동하면 다음 `/mccp:pr` 게이트의 plan 검증이 깨진다. §3.8 표준대로 PR merge 후 worktree cleanup과 함께 아카이브.

## Known Artifacts (범위 밖)

- **실데이터 렌더에서 design-lint H16 advisory 1건**. `renderRisks`의 `relatedOpenQuestion` 교차참조가 본 plan OQ의 긴 `**bold**` 텍스트를 truncate하며 unpaired `**`를 남긴 것 — **risks 섹션(기존 코드) 동작**이지 본 M2 dashboard 위젯 산출물이 아니다. synthetic 데이터 `markdown-equivalence` 테스트(`design_constraint_violations === []`)가 통과해 신규 코드의 H16 0를 증명한다. `risks.js`는 본 plan Files to Change 밖이므로 수정하지 않았다(후속 axis 후보: relatedOpenQuestion truncation의 marker-safe 처리).

## Next Steps

- [ ] **사용자 시각 확인 필수** — `.claude/cache/status.html`을 브라우저로 열어 대시보드 hero(version 줄·named-widget·next-action 복사) 육안 검증 (이 환경은 스크린샷 불가). 가능하면 impeccable `audit`/`polish` 대조.
- [ ] 확인 후 `/mccp:prp-commit` → `/mccp:pr`. (현재 cost-tier critical — auto-chain은 비용 트리거로 abort 예상. 수동 진행 권장.)
- [ ] PR merge 후 PRD M2 row complete + plan 아카이브 + worktree cleanup (§3.8).
