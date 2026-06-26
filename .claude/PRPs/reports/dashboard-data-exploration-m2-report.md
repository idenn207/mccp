# Implementation Report: Dashboard Data Exploration — M2 (필터 + 정렬)

**Plan**: `.claude/plans/dashboard-data-exploration-m2.plan.md`
**PRD**: `.claude/prds/dashboard-data-exploration.prd.md` (M2)
**Branch**: `dashboard-data-exploration`
**plugin.json**: `1.18.15 → 1.18.16`

## Summary

M1이 깐 PE 토대(`data-prd` + `[data-js="on"]` reveal hook + `client/explore.js`) 위에서, 위험·질문 항목에 **필터(PRD축·plan축, AND 조합)** + **정렬(위험도순·시간순)** 컨트롤 바를 추가했다. 컨트롤은 `.js-only`라 JS-off 시 사라지고 전체 항목이 손실 없이 보인다(PE 불변). 순수 필터/정렬 로직(`compareItems`/`matchFilter`)을 UMD 모듈(`parsers/explore-sort.js`)로 분리해 node 테스트와 browser inline 엔진이 single-source 공유(drift 0). Codex F1(`data-ord` = severity 정렬 이전 parse chronology), F2(emit gate `.prd-group` OR `.explore-bar`), F3(한 `.li-item` 집합당 컨트롤러 1개), F4(PRD M2/M3 reconcile) 4 finding 모두 흡수. **배치는 impeccable critique + 사용자 확정으로 panel-header 통합**(각 컨트롤 바가 자기 위험·질문 패널의 `panel-head` 우측에 통합 — scope=배치 일치). 초기 *전역 사이드바 배치* 는 scope↔placement 불일치(5 route 중 2개만 제어 + inert chrome), 위험·질문 옵션 결합 cross-route 빈 상태, nav 무게감, 키보드 탭순서 비용으로 폐기 — dual-path 토글(`MCCP_EXPLORE_CONTROL_PLACEMENT`)도 함께 제거. 각 패널 바는 자기 route 옵션만 소비(옵션 결합 0).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 13 (Files to Change) | 12 (plan-body.js 불요) + i18n test 정합 + PRD(F4, 기 작성) |
| Tests | explore-sort + explore-controls 신규 | renderer 566 PASS (신규 9+9) + derive 114 PASS |

## Tasks Completed

| # | Task | Status |
|---|---|---|
| 1 | 항목 data 속성(data-plan/sev/ord) + 필터 옵션 메타 (risks·open-questions) | [done] |
| 2 | pure 필터/정렬 로직 + UMD (explore-sort.js) | [done] |
| 3 | 컨트롤 바 마크업 빌더 (html.js) — panel-head 통합(`renderPanel` tools) | [done] |
| 4 | 필터/정렬 엔진 (explore.js 확장) — DOM wiring, scope=route 단일 컨트롤러 | [done] |
| 5 | 배치 평가 → impeccable critique + 사용자 확정(panel-header 통합, global 폐기) | [done] |
| 6 | 컨트롤 CSS (neutral) + reveal + `[hidden]` 규칙 | [done] |
| 7 | lint carve-out(H16/H10 data-plan·value) + H19 가드 검증 | [done] |
| 8 | a11y(aria-label·live-region·focus-visible) + 반응형 wrap | [done] |
| 9 | 버전 bump + footer 동기화 + CHANGELOG + 회귀 0 | [done] |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (node -c) | [done] Pass | 6 changed JS 파일 전부 parse clean |
| Unit Tests | [done] Pass | renderer 566 + derive 114 = 680 PASS, 0 fail |
| Build | N/A | plugin JS (빌드 단계 없음) |
| Integration (real render) | [done] Pass | route·global 양 산출물 design-lint = pre-existing H16만(M2 신규 위반 0) |
| Edge Cases | [done] Pass | F1 chronology≠severity · F2 flat 섹션 · no-JS degrade · sentinel 매칭 |

### Plan Validation 커맨드 (canonical global render)

- `.explore-bar` 단일 global 바 emit · `data-plan` 406 li-item 전부 부여
- `aria-live="polite"`/`role="status"` 결과 수 live-region present
- inline network primitive(H19): 0 · external `<script src>`(H13): 0 · `window.__mccpExplore` emitted
- version drift `1.18.15`(renderer+plugin.json): 0

### 배치 비교(Task 5, F3 별도 산출물)

- route: `.claude/cache/status.html`(2 scope-local 바) / global: scratchpad `status-global.html`(1 사이드바 바). 둘 다 활성 컨트롤러 1개(both-live 0). 사용자 확정 → **global**(중복 컨트롤 회피·단일 HTML 관리). route 는 `MCCP_EXPLORE_CONTROL_PLACEMENT=route` 명시 토글로 보존.

## Files Changed

| File | Action |
|---|---|
| `parsers/explore-sort.js` | CREATED — compareItems/matchFilter pure UMD |
| `tests/explore-sort.test.js` | CREATED — 9 test (정렬·필터·sentinel·fail-open·UMD) |
| `tests/explore-controls.test.js` | CREATED — 9 test (마크업·배치 토글·no-JS·H16/H19·F1·F2) |
| `sections/risks.js` | UPDATED — data-plan/sev/ord + `_chronoIndex`(F1) + filterOptions |
| `sections/open-questions.js` | UPDATED — data-plan/sev/ord(`_mergedIndex`) + filterOptions |
| `client/explore.js` | UPDATED — M2 필터/정렬 엔진(scope=route 단일 컨트롤러 F3, DOM-only). global `:target`/hashchange 제거 + 결과 수 panel-head 갱신 + 초기화 dirty 토글 |
| `html.js` | UPDATED — buildExploreBar(`.ex-filters` 그룹 + 정렬 분리 + 초기화 hidden) + `renderPanel` tools/count(panel-head 통합) + EXPLORE_SORT_JS inline + emit gate(F2) + CSS(고정폭·focus offset·status zone) + footer. global 배치/`MCCP_EXPLORE_CONTROL_PLACEMENT` dual-path 제거 |
| `output-constraints.js` | UPDATED — H10/H16 carve-out에 `data-plan`+`value` |
| `markdown.js` | UPDATED — footer v1.18.16 |
| `tests/i18n-surface.test.js` | UPDATED — footer assertion 1.18.16 |
| `DESIGN.md` | UPDATED — M2 필터/정렬 + 배치 결정 + 사이드바 explore 바 |
| `plugin.json` | UPDATED — 1.18.16 |
| `CHANGELOG.md` | UPDATED — v1.18.16 row |
| `.claude/prds/...exploration.prd.md` | UPDATED — M2/M3 행 F4 reconcile(planning 시 기 작성) |

## Deviations from Plan

1. **`plan-body.js` 미변경(plan "필요 시")** — plan 필터 옵션 표시명을 `item.source` basename 에서 직접 파생(섹션 내)해 planPrd 맵 확장 불요. Files to Change 13 → 실제 12 + i18n test 정합.

2. **H16/H10 carve-out에 `value` 추가(plan은 `data-plan`만 명시)** — 구현 중 발견: PRD prdKey sentinel(`__global__`)이 M1 grouping 산물이라 select `<option value="__global__">`에 불가피하게 노출되어 H16 bold-underscore false-positive. attribute value 는 markdown 미렌더이므로 carve-out이 원칙적으로 옳음(title/alt/aria-label 동일).

3. **H10 em-dash 회귀 자체-검출 후 수정** — stash 비교로 M2가 H10(em-dash) 신규 발화함을 확인. 원인: option label 이 PRD H1 raw(em-dash 가능)를 정규화 없이 노출(그룹 summary 는 `normalizeProse` 통과). `buildExploreBar` label 을 `normalizeProse` 통과로 수정 → 실데이터 H10 0(M2 신규 위반 0, 잔여 H16은 pre-existing entity-backtick standing 부채).

4. **engine `items[i]` → `lis[i]` 리네임** — H18 index-mapping-residue 정규식(`items[i]`)이 엔진 inline 코드를 false-positive. 루프 변수 리네임으로 회피(기능 무변).

5. **배치 = panel-header 통합(plan default 는 route, 초기 ship 은 global)** — impeccable critique + Task 5 사용자 확정(2026-06-26): 글로벌 사이드바 배치를 재고한 결과 scope↔placement 불일치(위험·질문 2개 route 만 제어 + 나머지 inert chrome), 위험·질문 옵션 결합 cross-route 빈 상태, nav 무게감, 키보드 탭순서가 필터를 페이지 nav 앞에 두는 비용이 드러나 **패널 헤더 통합**으로 전환(컨트롤이 제어 대상 리스트 바로 위 head 에 거주). `renderPanel(tools)` 주입점 1개로 위험·질문 패널 head 우측에 통합되고, 각 패널이 자기 route `filterOptions` 만 소비해 옵션 결합이 사라진다. dual-path 토글(`MCCP_EXPLORE_CONTROL_PLACEMENT`)·global 사이드바 배치·`parseExplorePlacement`/`globalExploreOptions` 제거. F3(단일 컨트롤러)는 각 바가 `closest('.route')` scope 라 유지.

6. **plan 미archive** — mccp 관행상 milestone plan 은 `.claude/plans/`에 유지(ship 시점 archive). 형제 dashboard cycle plan 들과 일치 + PR 단계 design-critique chain-check/receipt scoping 이 plan 경로 참조.

7. **컨트롤 형태 2차 UI/UX 이터레이션(사용자 시각 피드백 2026-06-26)** — panel-header 통합 후 실 렌더 스크린샷 리뷰에서 4개 결함 식별·수정: (a) **위험·질문 패널 불일치** — native `<select>` 가 widest option 으로 auto-size 해 옵션이 다른 두 패널이 다른 폭으로 렌더 → PRD·plan select 폭 고정(`12rem`)으로 일치. (b) **결과 수 위치** — 정렬·초기화 사이에 끼어 cluttered → panel-head 제목 옆 status zone 으로 이동(`renderPanel` emit, `:empty` 숨김). (c) **focus outline 인접 침범** — `outline-offset:2px`+gap `0.35rem` → `1px`+`0.5rem` 로 clearance 확보. (d) **전체 형태**(GitHub Issues·Linear·Vercel 레퍼런스) — 필터군(`.ex-filters`) ↔ 정렬 분리, 초기화 `hidden`(dirty 시 노출, 점진적 공개). native affordance 유지(커스텀 드롭다운 reinvent 금지 — product ban). 신규 회귀 테스트 1개 추가(`explore-controls` 11 test).

## Issues Encountered

- **~~global 바 옵션 결합~~ (해소됨)**: 초기 global 단일 바는 위험+질문 옵션을 합쳐 cross-route 빈 상태 위험이 있었으나, panel-header 통합 전환으로 각 패널이 자기 route 옵션만 노출 → 옵션 결합 0(impeccable critique P2 해소).
- **필터 select 옵션 밀도(잔여 관찰)**: 실데이터에서 PRD 47·plan 48 옵션이 native `<select>`에 채워짐(Wall of Options). 배치와 무관한 별도 축 — native select 타입어헤드로 완화되고, 근본 해결은 **M3(검색)** 의 자연스러운 범위. panel-header 분리로 각 select 가 route별로 약간 짧아짐.
- **"시간순"은 실 timestamp 아님** — `data-ord`=parse 방출 순(append 시간 근사). 신규 derive 필드는 PRD ③ out-of-scope, plan Risk 표에 정직히 문서화.

## Next Steps

- [ ] `/mccp:code-review` 로 변경 review (권장)
- [ ] `/mccp:prp-commit` → `/mccp:pr` (PRD M2 status complete 표시 + plan archive 는 ship 시점)
