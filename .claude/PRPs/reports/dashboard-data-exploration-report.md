# Implementation Report: Dashboard Data Exploration — M1 (PRD-수준 그룹핑 + PE 토대)

**Plan**: `.claude/plans/dashboard-data-exploration.plan.md`
**PRD**: `.claude/prds/dashboard-data-exploration.prd.md` (M1)
**Branch**: `dashboard-data-exploration`
**plugin.json**: `1.18.14 → 1.18.15`

## Summary

대시보드의 고-volume 항목 리스트(위험·미해결 질문)를 소속 PRD별 접힘 그룹(`<details class="prd-group">`)으로 묶었다. 그룹은 native `<details>`로 렌더되어 JS 없이도 완전 동작(graceful degrade 구조적 보장). 항목마다 `data-prd` + `<html data-js="on">` 마커로 M2(필터/정렬)·M3(검색) PE 토대를 깔았다. PRD provenance 키는 canonical plan path, `data-prd`는 prdPath 파생 prdKey(Codex F2). 신규 H19가 inline `<script>` 본문 network primitive를 mechanical 차단(Codex F1).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 13 (Files to Change) | 13 planned + 3 test 정합 update |
| Tests | prd-grouping.test.js 신규 | renderer 544 PASS (신규 10) + derive 114 PASS |

## Tasks Completed

| # | Task | Status |
|---|---|---|
| 1 | PRD provenance 배선 (plan-body planPrd, canonical-path 키) | [done] |
| 2 | 순수 그룹핑 헬퍼 (prd-group.js, path-keyed) | [done] |
| 3 | 위험·질문 섹션 그룹핑 렌더 (data-prd + 조건부 chrome) | [done] |
| 4 | PE 토대 client (explore.js) + html.js 배선 (CSS·script emit) | [done] |
| 5 | invariant 개정 (DESIGN.md JS-0 → routing-한정 + PE, 3→5 route) | [done] |
| 6 | 버전 bump + footer 동기화 + CHANGELOG | [done] |
| 7 | inline-script network-primitive 가드 (H19, Codex F1) | [done] |
| 8 | 테스트 + 회귀 0 (prd-grouping.test.js) | [done] |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (node -c) | [done] Pass | 9 changed JS 파일 전부 parse clean |
| Unit Tests | [done] Pass | renderer 544 + derive 114 = 658 PASS, 0 fail |
| Build | N/A | plugin JS (빌드 단계 없음) |
| Integration (real render) | [done] Pass | `derive/cli.js render` → design-lint **clean** (H1-H19) |
| Edge Cases | [done] Pass | 충돌 케이스(동명 basename·동일 H1 라벨·source_prd 부재·STATE.md OQ) + no-JS degrade |

### Plan Validation 커맨드 (전부 통과)

- `prd-group` occurrences: 19 (>0) · `data-prd`: 31 (>0)
- external `<script src>` (H13): 0 · network primitive (H19): 0
- no-JS degrade: script strip 후 388 li-item 가시, closed prd-group 0 (전부 default open)
- version drift `1.18.14`: 0 · DESIGN.md "3 route": 0 ("JS 0"은 PE 문맥만)
- 실데이터 grouping: route-risks 2 PRD 그룹(data-exploration:8 + pipeline-chart:6), route-questions flat 단일그룹(truthfulness:15, data-prd 토대만)

## Files Changed

| File | Action |
|---|---|
| `parsers/prd-group.js` | CREATED — groupByPrd + canonicalPlanPath + prdSlug |
| `client/explore.js` | CREATED — PE 토대(data-js + 그룹 토글, DOM-only) |
| `tests/prd-grouping.test.js` | CREATED — 10 test |
| `parsers/plan-body.js` | UPDATED — planPrd Map + extractPrdLabel/derivePrdKey |
| `sections/risks.js` | UPDATED — PRD 그룹핑 + data-prd + H10 라벨 정규화 + H16 cue 마커 strip |
| `sections/open-questions.js` | UPDATED — PRD 그룹핑 + data-prd + H10 라벨 정규화 |
| `html.js` | UPDATED — explore.js inline + .prd-group CSS + script emit + footer |
| `output-constraints.js` | UPDATED — H19 신규 + H10/H16 data-prd carve-out |
| `markdown.js` | UPDATED — footer v1.18.15 |
| `DESIGN.md` / `docs/v1.3.0-observability/DESIGN.md` | UPDATED — JS-0 invariant routing-한정 개정 |
| `plugin.json` | UPDATED — 1.18.15 |
| `CHANGELOG.md` | UPDATED — v1.18.15 row |

## Deviations from Plan

1. **3개 기존 테스트 파일 정합 update (plan Files to Change 외)** — `tests/drawer.test.js`(li-item 정확-매칭 regex를 additive `data-prd`에 tolerant하게 loosen, 의도 'li nests copy-btn' 보존), `tests/output-constraints.test.js`(RULES 18→19, H19 추가 반영), `tests/i18n-surface.test.js`(footer 1.18.14→1.18.15). 모두 plan의 additive 변경(data-prd/H19/version)이 강제하는 assertion 정합 — 아키텍처 divergence 아님.

2. **H10/H16 pre-existing 누출을 plan 파일 내에서 방어 수정** — 실데이터 렌더에서 (a) PRD H1 제목의 em-dash가 그룹 라벨로 노출(H10, **내 회귀**) → `normalizeProse` 통과로 해소, (b) risk `relatedOpenQuestion` 40자 truncate가 dangling `**`를 남겨 H16 cross-document pair 매칭(**pre-existing**) → risks.js cue에서 emphasis/code 마커 strip으로 해소. 둘 다 plan의 Files to Change(risks.js/output-constraints.js) 내 처리.

3. **`data-prd` sentinel(`__global__`/`__unknown__`)이 H16 bold-underscore에 매칭** → H10/H16 attribute-strip에 `data-prd` carve-out 추가(기존 title/alt/aria-label과 동일 원칙 — 머신 속성은 렌더 prose 아님). H16 핵심 가시-텍스트 검출은 불변.

## Issues Encountered

- **plan-conflict-detector.js false-positive (검출됨, 미수정 — follow-up 권장)**: detector가 CONFLICT=true 반환했으나 근거가 CHANGELOG.md/DESIGN.md 등 **plan에 명시된** 파일을 "unplanned"로 지목 — 명백한 false-positive. 근본 원인은 `normalizePath`가 plan 테이블 셀의 markdown 백틱(`` `path` ``)을 strip하지 않아 13개 planned 파일 전부 매칭 실패. 백틱 strip 시 실제 expansion은 위 3개 test + plan/PRD meta뿐. detector의 own philosophy("false positives stop legitimate work, conservative=conflict false")에 따라 이 false-positive로 올바른 구현을 abort하지 않음. **Backlog 후보: `normalizePath`에 백틱/code-span strip 추가.**

## Next Steps

- [ ] `/mccp:code-review` 로 변경 review (권장)
- [ ] `/mccp:prp-commit` → `/mccp:pr` 로 commit + PR (PRD M1 status complete 표시 + plan archive는 ship 시점)
