# Implementation Report: Dashboard Interactivity — M2 개요 진행중 마일스톤 + worktree

## Summary

개요(`route-overview`)에 worktree별 진행중 마일스톤을 노출하는 "진행 중 마일스톤" 패널을 추가했다. derive `worktrees` source(M1 산출)를 **재스캔 없이** 재사용 — `renderMultiSession`이 표 early-return 앞에서 per-item detail+projection을 1-pass 계산해 `result.overview = { items, total, shown }`을 방출하고, `renderActiveMilestones`가 그 projection을 route-overview용 `.panel`로 렌더한다. STATUS.md `## 대시보드`에 plain-text 동등본 동기. 전부 read-only 렌더 변경(신규 스캔·서버 mutation 0).

핵심 설계 결정(plan에서 Codex 수렴):
- **F1 lifecycle-fresh 3중 gate**: overview 후보 ⟺ `active`(freshness) AND (`milestone_hint` OR `current_gate`) AND NOT just-shipped(`mccp-pr-codex` + `gate_converged`). stale STATE.md/완료 마일스톤을 "거짓 진행중"에서 제외.
- **F2 visibility 분리**: 개요 패널 visibility를 멀티세션 *표* visibility에서 분리 — healthy-single worktree도 `{overview, details}`를 반환(표 패널만 `multiSession.html` gate). 단일 worktree(가장 흔한 케이스)의 active 마일스톤이 개요에 노출됨.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (정확) |
| Files Changed | 7 | 7 |
| 신규 detail | 0 (drawer 재사용) | 0 (detailMap 키 재사용) |
| 테스트 회귀 | 0 | 0 (638/638 green) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | in-progress overview projection + visibility 분리 (`multi-session.js`) | [done] | 표 loop와 단일 pass 공유, F1 eligibility + F2 분리 |
| 2 | 개요 "진행 중 마일스톤" 패널 (`html.js`) | [done] | `renderActiveMilestones` + `renderPanel` 재사용(ic-flag, h3) + dot discipline |
| 3 | STATUS.md `## 대시보드` 동등 (`markdown.js`) | [done] | plain ASCII 라벨 + worktree 라인 + F2 가드 2곳 |
| 4 | 회귀 가드 테스트 확장 | [done] | multi-session +10, dashboard-overview +5 |
| 5 | version bump + footer 동기 | [done] | plugin.json + html/markdown footer + i18n-surface 단언 1.18.20 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] N/A | 순수 JS, 별도 type-check/lint 도구 없음 |
| Unit Tests | [done] Pass | 638/638 (`node --test` 렌더러 전 스위트) |
| Build | [done] N/A | 빌드 스텝 없음 |
| Integration | [done] Pass | `MCCP_MULTI_SESSION_SCAN=1 ... cli.js render` 실행 clean, design-lint violation 0 |
| Edge Cases | [done] Pass | graceful hide / healthy-single / overflow / stale·just-shipped 제외 모두 테스트 |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/multi-session.js` | UPDATE | +64 / -... |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | +63 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | +31 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | +1 / -1 |
| `plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js` | UPDATE | +139 |
| `plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js` | UPDATE | +95 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | +/-4 |

총 7 files, +385 / -13.

## Deviations from Plan

1. **2+ 케이스 overview 행 display-only (H18 흡수)**: plan은 overview 행이 "동일 detailId 참조 → 드로어 재사용"을 명시했으나, output-constraints **H18 invariant**가 *중복 `data-detail-id`*를 violation으로 검출한다(표 행 + overview 행이 같은 id → 중복). 해소: overview 행은 `data-detail-id`를 **표가 없을 때만**(healthy-single = 그 worktree 드로어 유일 trigger) 방출하고, 표가 있는 2+ 케이스에선 display-only(표 행이 canonical trigger, foot 링크 `#route-activity`가 드로어 경로). **신규 detail 0**(drawer 재사용) 의도는 유지 — trigger 속성 *위치*만 H18에 맞춤. minor 정련(architectural decision 불변).
2. **milestoneHint truncate(72) 추가**: plan projection은 `plainSummary(milestone_hint)`(무 truncate)였으나, 실제 milestone_hint가 STATE.md goal 전문이라 매우 길어 패널이 verbose해짐. PRODUCT.md "Compact" 품질을 위해 projection에 `truncate(…, 72)` 적용(표 셀 48보다 관대, html/md 데이터 동등 유지). 테스트 hint는 모두 <72라 단언 불변.
3. **plan-conflict-detector false-positive (escalate 안 함)**: 검증 결과 `conflict: true | signal: file-expansion`. 원인은 `parseFilesToChange`가 plan Files to Change cell의 backtick(`` `path` ``)을 strip하지 않아 `isInPlan` 매칭이 전부 실패 — memory `[[mccp-dashboard-data-exploration-cycle]]`에 기록된 동일 backtick false-positive. 변경 7개 파일은 plan Files to Change와 **정확히 일치**하므로 실제 plan-구현 갭 없음. escalate는 정확한 구현을 abort하므로 미실행. detector 1줄 수정(backtick strip)은 본 M2 scope 밖 — recurring debt.
4. **Plan 미archive**: ECC Phase 5 archive(`mv to completed/`)는 mccp receipt chain이 plan을 `.claude/plans/` 경로로 참조하므로 미적용 — 이동 시 `/mccp:pr` chain-check readback이 깨짐. mccp receipt 모델이 ECC archive 스텝을 supersede.

## Issues Encountered

- **H18 중복-id**: 드로어 스크립트가 모든 `[data-detail-id]`에 generic 바인딩 + H18이 중복 id를 차단 → overview 행의 detailId 재사용이 2+ 케이스에서 중복 위반. 위 Deviation 1로 해소(tablePresent 분기).
- **CSS 주석 문자열 충돌**: 신규 CSS 주석(`/* ... "진행 중 마일스톤" 패널 ... */`)이 `<style>` 안에 들어가 `r.html`이 worktrees 부재에도 그 문자열을 포함 → 테스트 regex를 `<h3 class="panel-title">진행 중 마일스톤</h3>`로 특정(실제 패널 검증).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/multi-session.test.js` | +10 (ov1~ov10) | projection eligibility(idle/stale/just-shipped/무신호 제외) · rank/recency 정렬 · CAP slice · self · detailId 재사용 · F2 healthy-single |
| `tests/dashboard-overview.test.js` | +5 | route-overview 패널 present · overflow foot 링크 · F2 healthy-single 표 hidden · graceful 부재 · STATUS.md plain-text 동등 · design-lint clean |

## Next Steps
- [ ] `/mccp:prp-commit` 로 커밋
- [ ] `/mccp:pr` 로 PR 생성 (M2 milestone)
- [ ] (debt) plan-conflict-detector backtick strip 1줄 수정 — 별도 cycle
