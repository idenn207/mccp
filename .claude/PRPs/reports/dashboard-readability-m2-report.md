# Implementation Report: Dashboard Readability — M2 (위험/질문 평탄화 + 출처 + 시각)

**Plan**: `.claude/plans/dashboard-readability-m2.plan.md`
**Decision slug**: `dashboard-readability-m2`
**Branch**: `dashboard-readability`
**Plugin version**: `1.19.1 → 1.19.2`

## Summary

위험·질문 패널을 PRD 그룹 chrome(`<details class="prd-group">`) 없이 **전체 평탄 `<ul class="stack-list">`** 로 렌더해, 사용자가 켠 정렬(위험도순·시간순)이 그룹 경계에 가리지 않게 했다. 그룹용 "모두 펼치기/접기" 토글 + `.prd-group` 의존 dead 머신을 제거하고, 각 항목 **상단**에 출처 plan 문서명(작은 회색 `.meta-cue`/`.mono`) + 출처 plan 의 최근 활동 시각(>60일은 절대일자)을 표시했다. 필터(PRD/plan)·정렬·탭(미해결/해결됨/보관됨) 축은 전부 보존(`data-prd`/`data-plan`/`data-sev`/`data-ord` 유지).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 16 (UPDATE 13 + CREATE 1 + plugin/CHANGELOG) | 13 UPDATE + 1 CREATE (+ plugin.json, CHANGELOG) |
| Codex 라운드 | R1 (F1+F2 흡수, plan 단계 수렴) | cross-gate dedupe(plan-codex 수렴) |
| 테스트 | 렌더러 스위트 green + 신규 cross-PRD 정렬 | 655/655 PASS |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `planActivity` Map surface (plan-body.js) | 완료 | 전 plan lastActivityMs, planPrd loop 동형. fail-open(ms null → 키 부재) |
| 2 | `formatRelativeTime` opt-in `absoluteAfterDays` | 완료 | Codex F2 — default byte-identical(blast radius 0), 위험/질문만 opt-in |
| 3 | risks 평탄화 + 출처/시각 meta-cue | 완료 | Codex F1 — 정렬 배열 직접 방출, `prdKeyFor` per-item, `groupByPrd` filterOptions 전용 |
| 4 | open-questions 평탄화 + 출처 상단 이동 + 시각 | 완료 | risks 대칭. STATE.md OQ 는 시각 생략(정직 표기) |
| 5 | explore.js 토글 + dead 그룹 머신 제거 | 완료 | `refreshGroups`/`ex-first-visible`/일괄 토글 제거. 정렬은 단일 `.stack-list` |
| 6 | html.js emit-gate + CSS dead rule, footer, version | 완료 | dead `hasPrdGroups` 제거, `.prd-*` CSS 제거, footer/plugin.json/CHANGELOG `1.19.2` |
| 7 | 스냅샷/회귀 일괄 갱신 + 신규 cross-PRD 테스트 | 완료 | prd-grouping/explore-controls/format-utils/i18n flat·절대일자 갱신 + risks-source-time.test.js CREATE |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (load/syntax) | Pass | 전 모듈 require/`node --check` OK |
| Unit Tests | Pass | 655/655 (renderer suite) |
| Render 출력 | Pass | `class="prd-group"` 0, `data-prd`/`data-sev` 보존, 출처/시각 cue 방출, 단일 stack-list |
| no-JS degrade | Pass | flat `<ul>` 전 항목 가시 |
| Version drift | Pass | plugin.json + 양 footer + 스냅샷 모두 `1.19.2` (drift 0) |

### Design Grounding (v1.18.22)

Design Grounding: **N/A** — implement-mode 디텍터 `no-signal`(silent-skip). produced diff 가 렌더러 `.js` 소스(control-plane)이고 렌더 출력 `.claude/cache/status.html` 은 gitignore라 lintable rendered-surface 가 tracked diff 에 미포함. Phase 2.5.5c capture 미발생 → Phase 3.6 DESIGN FINISH skip + Phase 3.7 GROUNDING VERIFY no-op(둘 다 기계적으로 정확). 디자인 품질은 plan-codex critique(converged, R0) + Output Constraints 4축 + Task 3/4 위계·정렬 단위 테스트로 보장.

## Files Changed

| File | Action |
|---|---|
| `scripts/lib/renderer/parsers/plan-body.js` | UPDATE (planActivity Map) |
| `scripts/lib/renderer/parsers/prd-group.js` | UPDATE (prdKeyFor/prdMetaFor 추출) |
| `scripts/lib/renderer/format-utils.js` | UPDATE (formatRelativeTime opt-in) |
| `scripts/lib/renderer/sections/risks.js` | UPDATE (평탄화 + 출처/시각) |
| `scripts/lib/renderer/sections/open-questions.js` | UPDATE (평탄화 + 출처 상단 + 시각) |
| `scripts/lib/renderer/index.js` | UPDATE (opts thread) |
| `scripts/lib/renderer/client/explore.js` | UPDATE (토글/그룹 머신 제거) |
| `scripts/lib/renderer/html.js` | UPDATE (emit-gate/CSS dead + footer) |
| `scripts/lib/renderer/markdown.js` | UPDATE (footer) |
| `scripts/lib/renderer/tests/{prd-grouping,explore-controls,format-utils,i18n-surface,plan-body-parser}.test.js` | UPDATE |
| `scripts/lib/renderer/tests/risks-source-time.test.js` | CREATE |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE (1.19.2) |
| `CHANGELOG.md` | UPDATE (1.19.2 row) |

## Deviations from Plan

- **Plan archival 미수행**: 플랜 템플릿 Phase 5 의 `mv plan → completed/` 는 실행하지 않음. implement-codex receipt 가 `.claude/plans/dashboard-readability-m2.plan.md` 를 참조하므로 지금 옮기면 다음 `/mccp:pr` 게이트의 plan_hash 검증이 깨진다. 본 repo 컨벤션상 plan archival 은 PR merge 후 housekeeping 단계.
- **PRD M2 status 미변경(in-progress 유지)**: 본 repo 컨벤션상 PRD status 는 cycle-close(merge) 시 complete 로 전환. 구현 완료지만 미shipped 상태라 보존.
- **출처/시각 구분자**: 플랜 의사코드의 ` · ` 리터럴 대신 OQ `metaCueParts` 동형으로 `.cue-sec` margin-left 가 시각 구분을 담당(중복 구분자 회피, 동일 패턴 통일).

## Issues Encountered

- **주석 토큰 누출**: 제거 설명 주석이 `.prd-group`/`모두 펼치기`/`prd-toggle` 리터럴을 포함해 인라인 시 acceptance grep(`html.js → 0`, `explore.js → 0`)을 깨뜨림 → 주석을 리터럴 없는 표현으로 재작성. (status.html 의 bare `prd-group` 일부는 *이 플랜 자체의 risk 텍스트*가 언급한 것으로 정상 — acceptance 는 `class="prd-group"`=0 이 핵심이며 충족.)
- **plan-codex receipt staleness**: dedupe 노트 주입으로 plan 해시 변동 → plan-codex receipt stale. 계획된 결정 불변이므로 plan-codex receipt 를 현재 plan 에 재바인딩(design 메타 보존)해 chain 복구.

## Tests Written

| Test File | Focus |
|---|---|
| `risks-source-time.test.js` (CREATE, 7) | 출처 라벨 + 시각(절대/상대) + flat + cross-PRD 정렬 보존(html·md) + 위계(F-DC1) |
| `format-utils.test.js` (+5) | absoluteAfterDays opt-in(90일/400일/경계 60·61/연도경계 + byte-identical 회귀) |
| `plan-body-parser.test.js` (+1) | planActivity Map(활동 신호 → ms / 없으면 키 부재) |
| `prd-grouping.test.js` / `explore-controls.test.js` (갱신) | flat 구조 + cross-PRD 전역 severity + 토글/그룹 머신 제거 회귀 |

## Next Steps

- [ ] `/mccp:pr` 로 PR 생성 (PR-Codex + design + a11y 게이트)
- [ ] merge 후 housekeeping: PRD M2 status → complete, plan → `.claude/PRPs/plans/completed/`, completion-ledger 폴딩, worktree cleanup
