# Plan: Dashboard Data Exploration — M3 (검색 + 잔여 탐색 축)

**Source PRD**: `.claude/prds/dashboard-data-exploration.prd.md`
**Selected Milestone**: M3 — 검색 + 잔여 탐색 축
**Complexity**: Large

## Summary

M1(PRD 그룹핑 + PE 토대)·M2(위험·질문 필터/정렬) 위에서 PRD ③의 마지막 마일스톤을 닫는다. 세 표면을 추가한다: (1) **형태만 있던 사이드바 검색 입력**을 실제 `<input type="search">`로 wiring해 **전 페이지 `.li-item` 항목을 동시에** 헤더/요약 텍스트로 좁히고(매칭 페이지를 nav 뱃지 + live-region으로 surface), (2) M2 explore-bar 필터와 **AND 합성**(검색은 문서 전역, 필터는 route-scoped — 한 `.li-item`의 가시성 = 모든 reason의 AND), (3) M2에서 이관된 **잔여 축**을 멀티세션 표면(`#route-activity`의 `<table class="multi-session">`)에 full 구현 — **진행상태·worktree 필터 + 진행순 정렬**. 작업범위순 정렬은 'PRD 기준 작업 진행도' 재기획 전까지 보류(PRD 명시). JS 비활성 시 검색 입력·컨트롤 숨김 + 전체 항목 손실 없이 표시(PE 불변), STATUS.md는 인터랙션 없는 전체 평문 그룹 동등 유지.

## Scope 결정 (사용자 확인 2026-06-26)

| 축 | 결정 | 근거 |
|---|---|---|
| 검색 적용 scope | **전 페이지 항목 동시(cross-route)** | 사이드바 검색이 문서 전역 `.li-item`을 좁힘 + 매칭 페이지를 nav 뱃지/live-region으로 surface해 점프. `:target` 단일-뷰 라우팅은 유지(검색은 가시성만 토글, 라우팅 미변경 — DOM-move 0). |
| 검색 매칭 범위 | **항목 헤더/요약만(`.li-main` 텍스트)** | 화면에 보이는 줄만 매칭 → 빠르고 예측 가능. 접힌 드로어 detail(영향/완화/결정)은 제외(별도 색인 불요, 안 보이는 텍스트 매칭 노이즈 회피). |
| 잔여 축 | **PRD대로 full 구현** | 진행상태·worktree 필터 + 진행순 정렬을 멀티세션 테이블에 완비 → PRD Success Metric 4필터/4정렬 충족. 멀티세션이 단일 healthy worktree면 테이블 자체가 graceful-hide라 컨트롤도 동반 미렌더(emit gate). |
| 작업범위순 정렬 | **보류(미구현)** | PRD 명시 — 'PRD 기준 작업 진행도'로 재기획 전까지 연기. 정렬 select에 미노출. |
| URL/뷰 영속 | 안 함(세션 내) | PRD Out of scope + `:target` 라우팅 충돌 회피(M1·M2 선례 계승). |
| 단축키 | 없음 | 사용자 명시 요청. 기존 `.search` 의 "F" kbd 힌트 제거(오해 소지). |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| pure 로직 + UMD | `plugins/mccp/scripts/lib/renderer/parsers/explore-sort.js:14` | IIFE + `module.exports`(node) + `window.__mccpExplore`(browser) single-source. M3는 `compareItems`에 `progress` mode, `matchFilter`에 `status`/`worktree` 축(additive), 신규 `textMatch` 순수 함수 추가 — M2 표면 무변경(빈 축 = 전체, 기존 descriptor엔 신규 필드 부재 → 무시). |
| PE client 엔진 | `plugins/mccp/scripts/lib/renderer/client/explore.js:12` | IIFE + `'use strict'` + `data-js="on"` 마커 + null-guard early-return. DOM-only(네트워크 primitive 0 — H19). M3는 visibility reason 모델(JS expando `_hf`/`_hs`)로 검색↔필터 합성 + 검색 컨트롤러 + 멀티세션 바 컨트롤러 추가. |
| 가시성 합성(독립 필터 AND) | `explore.js:162` (`apply()` 의 `lis[i].hidden = !match`) | M2는 `hidden` 직접 set. M3는 reason 분리: explore-bar는 `el._hf`(filter), 검색은 `el._hs`(search) set 후 공유 `recompute(el)`(`el.hidden = el._hf || el._hs`). expando라 lint 표면 0(DOM attribute 미사용). |
| 조건부 inline `<script>` emit gate | `html.js:1253` (`hasPrdGroups \|\| exploreBarRendered`) | gate를 **검색 타겟(`.li-item` 존재) OR 멀티세션 바**로 확장 — 검색/잔여축이 prd-group 부재 route에서도 wiring. 외부 src 0(H13). |
| 컨트롤 바 빌더 | `html.js:1000` (`buildExploreBar`) | `.explore-bar.js-only` + `role="group"` + native `<select aria-label>` + reset. M3 멀티세션 바(`buildSessionBar`)는 같은 chrome·토큰 재사용(진행상태/worktree select + 진행순 sort). |
| `.js-only` reveal hook | `html.js:461` | `.js-only{display:none}` + `[data-js="on"] .js-only{display:revert}`. 검색 `<form>`·멀티세션 바에 부착(JS off 숨김). |
| 행 기반 섹션 + data 속성 | `sections/multi-session.js:212` (`htmlRows.push(trOpen + …)`) | `<tr>`에 `data-status`(kind)·`data-worktree`(안정 키)·`data-progress-rank`(blocked3>degraded2>active1>idle0)·`data-activity-ord`(recency tie-break) 추가 + `filterOptions` 노출. `worktreeStatusKind`/`KIND_META` 재사용(신규 색·kind 0). |
| 항목 data 속성 선례 | `sections/risks.js:121` (`prdAttr`/`exploreAttr`) | `data-prd`/`data-plan`/`data-sev`/`data-ord` 부여 패턴 — 멀티세션 행 data 속성이 동형. |
| neutral 토큰 chrome | `html.js:213` (`.search` CSS)·`html.js:425` (`.prd-group`) | `--muted`/`--faint`/`--border`/`--panel`/`--panel-2`만 — 강조색 예산 0(Constraint 2, focus-visible outline 제외). 검색 input은 기존 `.search` 토큰 계승. |
| nav 뱃지 | `html.js:1100` (`navCountHtml`) | active count 뱃지 패턴 → 검색 매칭 count 뱃지(`.nav-search-count`, 검색 활성 시만, neutral)로 미러. |
| 빈 상태 | `explore.js:128` (`emptyState`) | `.explore-empty` role=status 메시지 — 검색 0 매칭 route에 일반화(explore-bar 없는 route 포함). |
| lint carve-out | `output-constraints.js:367`·`:225` (H16 attribute strip) | `(?:title\|alt\|aria-label\|data-prd\|data-plan\|value)` → `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord` 추가(`data-worktree` 브랜치명 `_` paired-underscore false-positive 차단). H19는 확장 스크립트 자동 스캔(검증만). |
| 테스트 | `tests/explore-sort.test.js`·`tests/explore-controls.test.js`·`tests/a11y-aria-labels.test.js` | `node --test` pure 단위 + 렌더 산출물 마크업/aria/no-JS degrade assertion. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/explore-sort.js` | UPDATE | `compareItems`에 `progress` mode(`data-progress-rank` desc, tie-break `data-activity-ord` asc) + `matchFilter`에 `status`/`worktree` 축(additive AND, 빈=전체) + 신규 순수 `textMatch(haystack, needle)`(NFC normalize + lowercase + 빈 needle=전체 true). UMD 유지. M2 표면 불변. |
| `plugins/mccp/scripts/lib/renderer/client/explore.js` | UPDATE | (1) visibility reason 모델(`_hf`/`_hs` expando + 공유 `recompute`) — M2 `apply()`를 reason-set으로 리팩터(검색 빈 값이면 M2와 동일 동작). (2) **검색 컨트롤러** — 사이드바 input(debounce ~150ms) → 문서 전역 `.li-item` 의 `.li-main` 텍스트 `textMatch` → `_hs` set + recompute, nav-link 뱃지 갱신, 전역 live-region("전체 N개 일치 · 위험 8 · 질문 2"), route별 빈 상태. (3) **멀티세션 바 컨트롤러** — `<tr>` status/worktree 필터 + 진행순 정렬(`<tbody>` 행 재배열) + 결과 수. |
| `plugins/mccp/scripts/lib/renderer/sections/multi-session.js` | UPDATE | `<tr>`에 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord` 부여(`worktreeStatusKind`/`KIND_META` 재사용). 섹션 결과에 `filterOptions: { statuses:[{key,label}], worktrees:[{key,label}] }` 노출(중복 제거·결정적 순서). progress-rank: blocked3>degraded2>active1>idle0. activity-ord: `last_activity` 최신순 index(없으면 말단). md 무변경. |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | (1) 사이드바 `.search` div → `<form class="search js-only" role="search">` + `<input type="search" class="search-input" aria-label="항목 검색" placeholder="찾기…">` + 검색 아이콘(kbd "F" 제거). (2) 전역 검색 live-region(`<p class="search-status" role="status" aria-live="polite">` sr-only, 사이드바). (3) nav-link에 `.nav-search-count` 슬롯(검색 활성 시 JS 채움). (4) 멀티세션 바 빌더 `buildSessionBar({options})` + `#route-activity` 멀티세션 카드 head/위에 emit(`exploreBarHtml` 미러, li-count 대신 행≥2 + 옵션≥2 gate). (5) emit gate를 `hasSearchTargets(=문서 `.li-item` 존재) OR hasPrdGroups OR exploreBarRendered OR sessionBarRendered`로 확장. (6) 검색/멀티세션 바 CSS(neutral). (7) footer `1.18.16 → 1.18.17`. |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | H16 attribute carve-out(라인 225·367) 두 사이트에 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord` 추가. H19는 확장 explore.js + explore-sort.js 자동 cover(추가 변경 0 — 검증만). |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `1.18.16 → 1.18.17` 동기화(§3.7 drift 방지). 검색/필터/정렬은 HTML 전용 → md 무변경(멀티세션 평문 행 = no-JS 동등). |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` `1.18.16 → 1.18.17`(patch — PRD ③ 마지막 마일스톤, §3.7). PR 직전 main pull 후 forward-only reconcile(병렬 cycle version 경쟁 재발 부채 인지). |
| `plugins/mccp/scripts/lib/renderer/tests/explore-sort.test.js` | UPDATE | `progress` mode 정렬(rank desc + activity-ord tie-break) · `status`/`worktree` 필터 AND · `textMatch`(NFC·대소문자·빈 needle·한글 부분일치·미스) 단위 테스트 추가. M2 케이스 회귀 0. |
| `plugins/mccp/scripts/lib/renderer/tests/explore-search.test.js` | CREATE | 렌더 산출물: 검색 `<form>`/`<input type="search">` 마크업·`.js-only`·`role="search"`·aria-label·kbd 제거 · live-region 존재 · `.nav-search-count` 슬롯 · 멀티세션 바 마크업 + `data-status`/`data-worktree`/`data-progress-rank` · emit gate 확장(검색 타겟만 있고 prd-group/explore-bar 부재여도 explore `<script>` emit) · no-JS degrade(script-strip 후 전체 항목 가시) · H16 `data-worktree` carve-out clean · H19 검색/잔여축 스크립트 network primitive 0. **F1 회귀: 폼에 `action=` 부재 + inline explore.js 본문이 `submit` 리스너 + `preventDefault` 보유(소스 스캔 — explore-controls.test H19 소스 스캔 미러).** **F2 회귀: inline explore.js의 검색 wiring guard가 `bars.length`에 종속되지 않음 — guard `if (!EX) return;` 패턴 + 검색 타겟만 있고 explore-bar 부재인 fixture render에서 explore `<script>` emit + `.search-input` 마크업 동시 존재(둘 다 있으면 wiring 도달 가능, 둘 중 하나라도 빠지면 RED).** |
| `DESIGN.md` | UPDATE | PE 절에 검색 wiring + 멀티세션 잔여축 컨트롤 추가(M1·M2 invariant 개정 위 누적) + 검색 cross-route 가시성 모델 기록. |
| `CHANGELOG.md` | UPDATE | v1.18.17 row 추가. |

## Tasks

### Task 1: pure 로직 확장 (explore-sort.js)
- **Action**: (a) `compareItems(a,b,mode)`에 `mode='progress'` 분기 — `data-progress-rank` desc, 동률 `data-activity-ord` asc(안정 tie-break). `VALID_MODES`에 `progress:1` 추가. (b) `matchFilter(desc, filters)`에 `status`/`worktree` 축 추가 — `filters.status` 비면 전체, 있으면 `desc.status===filters.status`; `worktree` 동형. 기존 `prd`/`plan` 축과 AND 누적(M2 descriptor엔 status/worktree 부재 → `desc.status` undefined, filter 빈 값일 때만 호출되므로 무영향). (c) 신규 `textMatch(haystack, needle)`: `needle` 빈/null → true(전체); 양쪽 `String().normalize('NFC').toLowerCase()` 후 `haystack.includes(needle)`. 부수효과 0·DOM 미접근·네트워크 primitive 0(H19 clean). UMD api에 `textMatch` 추가.
- **Mirror**: `explore-sort.js:30` (`compareItems` 구조)·`:43` (`matchFilter` AND)·`:53` (UMD api 객체).
- **Validate**: `node --test explore-sort.test.js` — progress 정렬(rank 우선 + activity tie-break), status/worktree AND, textMatch(빈=전체·NFC·대소문자·한글 부분·미스), M2 severity/time/prd/plan 회귀 0.

### Task 2: 멀티세션 행 data 속성 + 필터 옵션 (multi-session.js)
- **Action**: `items.forEach` 루프에서 각 행 kind(`worktreeStatusKind(it)`) 계산값을 재사용해 `<tr>`에 `data-status="<kind>"`(blocked/degraded/active/idle) · `data-worktree="<key>"`(안정 키 — `it.branch || basename(it.path)` 정규화) · `data-progress-rank="<3|2|1|0>"`(KIND_META tone 아닌 명시 RANK_MAP) · `data-activity-ord="<idx>"` 부여. `data-activity-ord`는 render 전 `items`를 `last_activity` desc로 1회 스캔해 recency index 박음(없으면 말단 정수). 섹션 반환 객체에 `filterOptions: { statuses:[{key,label}], worktrees:[{key,label}] }` 노출(present한 kind/worktree만, 결정적 순서: statuses는 RANK desc, worktrees는 등장순). `is_self` 행도 동일 속성(self도 필터 대상).
- **rank 출처 불변**: `data-progress-rank`는 진행순 정렬의 유일 키 — `worktreeStatusKind` 우선순위(blocked>degraded>active>idle)와 1:1. KIND_META에 `rank` 필드를 추가해 SSoT화(색/아이콘/라벨/tone/rank 한곳).
- **Mirror**: `multi-session.js:172` (`kind` 계산)·`:207` (`trOpen`)·`:212` (`htmlRows.push`)·`risks.js:124` (`exploreAttr` 부여 형태).
- **Validate**: `node -e` minimal model(worktrees 2행 — blocked+active) 렌더 → 각 `<tr>`에 4개 data 속성 + `filterOptions.statuses`/`.worktrees`에 present 항목만 + progress-rank가 status와 정합.

### Task 3: 검색 입력 wiring + 사이드바 마크업 (html.js)
- **Action**: 사이드바 `.search` div(라인 1123, `aria-hidden`)를 교체 — `<form class="search js-only" role="search" aria-label="항목 검색"><svg ic-search/><input type="search" class="search-input" aria-label="항목 검색" placeholder="찾기…" autocomplete="off"></form>` (kbd "F" span 제거 — 단축키 없음). **`<form>`은 `role="search"` 시맨틱(스크린리더 landmark)을 위해 유지하되, native `<form>`은 Enter 시 submit하므로(Codex F1) 검색 컨트롤러(Task 4)가 `submit` → `e.preventDefault()`를 바인딩한다 — `action`/`method` 미지정 + preventDefault로 Enter가 페이지 reload·navigate·상태(route/필터/검색) 손실을 일으키지 않게 한다.** 바로 아래 sr-only 전역 live-region `<p class="search-status" role="status" aria-live="polite"></p>`(JS가 "전체 N개 일치 · 위험 8 · 질문 2" 채움, 빈 검색 시 빈 텍스트). nav-link 각각에 검색 매칭 슬롯 `<span class="nav-search-count"></span>`(빈, JS 활성 시 채움 — neutral). `.search`/`.search-input`/`.search-status`(sr-only)/`.nav-search-count` CSS는 기존 토큰만.
- **Mirror**: `html.js:1123` (`.search` 위치)·`html.js:213` (`.search` CSS)·`html.js:1137` (nav-link 구조)·`html.js:461` (`.js-only`).
- **Validate**: render → 사이드바에 `<input type="search">` + `role="search"` + `.js-only` + live-region + nav-link `.nav-search-count` 슬롯. kbd "F" 부재. `aria-hidden` 부재(이제 인터랙티브). 폼 `action`/`method` 미지정. `/mccp:dashboard`에서 검색 input에 텍스트 입력 후 Enter → `location` 불변 + route/필터 상태 유지(F1 회귀).

### Task 4: 가시성 reason 모델 + 검색 컨트롤러 (explore.js)
- **Action**: (a) **init guard refactor (Codex F2)** — 현재 `explore.js:65` `var EX = window.__mccpExplore; var bars = d.querySelectorAll('.explore-bar'); if (!EX || !bars.length) return;`는 `.explore-bar` 부재 시 early-return해 검색 입력이 wiring 안 된다. guard를 **`if (!EX) return;`로 낮추고**(pure 로직은 검색·바 양쪽 다 필요), 이후 ① 검색 컨트롤러를 `.search-input` 존재 시 **bars와 독립 실행**, ② bar 컨트롤러는 `if (bars.length) { for (...) wireBar(...) }`로 bars 존재 시에만 loop. `EX` 부재(스크립트 누락) 시에만 no-op(PE 불변). (b) **reason 모델** — `recompute(el){ el.hidden = !!(el._hf || el._hs); }`. M2 `apply()`의 `lis[i].hidden = !match`를 `lis[i]._hf = !match; recompute(lis[i])`로 변경(검색 미사용 시 `_hs` undefined → 기존과 동일 결과). (c) **검색 컨트롤러** — `.search-input` 존재 시: **부모 `<form>`에 `submit` → `e.preventDefault()` 바인딩(F1 — Enter no-navigate)** + input 이벤트(150ms debounce) → `var q=input.value;` 문서 전역 `.li-item` 순회, `txt = (li.querySelector('.li-main')||li).textContent`, `li._hs = !EX.textMatch(txt, q); recompute(li)`. 이후 (1) 각 nav-link `.nav-search-count`를 해당 route(`#route-<data-route>`) 가시 `.li-item` 수로 갱신(q 비면 빈), (2) `.search-status` live-region에 전체 매칭 합 + per-route 분해, (3) explore-bar 보유 route는 그 바의 count/탭/빈상태 refresh를 재호출(합성된 가시성 반영), (4) explore-bar 없는 route는 검색 컨트롤러가 직접 빈 상태(`.explore-empty` 일반화) 표시. q 비면 모든 `_hs` clear + recompute + 뱃지/상태 초기화.
- **합성 불변(F-search1)**: 한 `.li-item`의 최종 가시성 = `!(_hf || _hs)`. explore-bar(`_hf`)와 검색(`_hs`)은 서로의 reason을 건드리지 않음 → 두 컨트롤러가 같은 `hidden`을 두고 경쟁하지 않음(독립 필터 AND 표준 패턴). 검색·필터 어느 쪽이 바뀌든 recompute가 진실원.
- **Mirror**: `explore.js:63-65` (`EX`/`bars` guard — F2 refactor 대상)·`:162` (`apply()`)·`:168` (`.li-item` 순회)·`:128` (`emptyState`)·`:148` (`updateTabCounts` 미러로 nav 뱃지)·`:239` (`for ... wireBar` — bars 존재 시에만 loop로 이동).
- **Validate**: 프로토타입 render 후 `/mccp:dashboard` — 검색어 입력 시 전 route `.li-item` 좁힘 + nav 뱃지 + live-region 갱신, 위험 route에서 explore-bar 필터와 AND(둘 다 적용 시 교집합만), 검색 clear 시 복원. **explore-bar 부재 route(예: 타임라인·마일스톱 전용)에서도 검색 input이 동작(F2 — `bars.length===0`에 막히지 않음)**. **검색 input Enter 시 navigate 안 함(F1)**. JS strip 시 전체 가시.

### Task 5: 멀티세션 바 빌더 + 컨트롤러 (html.js + explore.js)
- **Action**: (a) html.js `buildSessionBar({options})` → `.explore-bar.js-only`(chrome 재사용) + 진행상태 `<select data-axis="status" aria-label="진행상태 필터">`(전체 + statuses) + worktree `<select data-axis="worktree" aria-label="worktree 필터">`(전체 + worktrees) + 정렬 `<select data-axis="sort">`(진행순 default — value `progress`) + reset. statuses/worktrees 옵션 2개 미만이면 해당 select 생략(M2 buildExploreBar 선례). `#route-activity` 멀티세션 카드 head(또는 카드 직상단)에 emit — `multiSession`이 present(=테이블 렌더)이고 행≥2일 때만. `sessionBarRendered=true` set(emit gate). (b) explore.js 멀티세션 컨트롤러 — `.explore-bar[data-explore-scope="session"]`(또는 multi-session 테이블 인접)을 찾아 `<tbody> tr`을 descriptor(`{status,worktree,rank,activityOrd}`)로 읽어 `matchFilter`(status/worktree)로 `tr.hidden` 토글 + `compareItems(...,'progress')`로 `<tbody>` 행 재배열 + 결과 수. self 행도 동일 취급.
- **Mirror**: `html.js:1000` (`buildExploreBar`)·`html.js:1038` (`exploreBarHtml` gate)·`explore.js:106` (`sortList` 행 재배열)·`explore.js:76` (`wireBar`).
- **Validate**: worktrees 2행 fixture render → 멀티세션 카드에 `.explore-bar`(status/worktree/진행순) + 행 data 속성. 필터 시 행 hide + 진행순 정렬 시 blocked 먼저. 단일 healthy worktree fixture는 테이블·바 모두 미렌더(graceful hide). JS off 시 바 숨김 + 전체 행 표시.

### Task 6: emit gate 확장 + lint carve-out (html.js + output-constraints.js)
- **Action**: (a) html.js inline 스크립트 emit gate(라인 1255)를 `(hasSearchTargets || hasPrdGroups || exploreBarRendered || sessionBarRendered) && EXPLORE_JS`로 확장. `hasSearchTargets` = `[risks, questions, timeline, milestoneHistory].some(s => s && typeof s.html==='string' && s.html.includes('class="li-item"'))`. (b) output-constraints.js H16 carve-out 두 사이트(225·367)에 `data-status|data-worktree|data-progress-rank|data-activity-ord` 추가. H19는 변경 0(확장 스크립트 자동 스캔 — 검증만).
- **Mirror**: `html.js:1253` (gate)·`output-constraints.js:367`·`:225` (carve-out)·`:491` (H19 script 스캔 루프).
- **Validate**: 검색 타겟만 있고 prd-group/explore-bar 부재인 fixture에서 explore `<script>` emit 확인. `data-worktree="v1_18_x"` 류 값이 H16 발화 안 함. explore.js에 `fetch('https://…')` 주입 시 H19 RED, 제거 시 GREEN.

### Task 7: 컨트롤 CSS (neutral) + a11y + 반응형
- **Action**: 검색 input + 멀티세션 바 CSS는 `--muted`/`--faint`/`--border`/`--panel`/`--panel-2`만(강조색 예산 0, Constraint 2 — focus-visible outline 제외). input은 native(키보드 기본·단축키 0). `.search-status` sr-only(`position:absolute;clip`). `.nav-search-count`는 `.nav-count` 토큰 미러(neutral). `border-radius` 기존 토큰(H3) · `border-left` 없음(H4). 멀티세션 바는 좁은 폭 wrap(flex-wrap). 각 select `aria-label`, 결과 수 live-region, 빈 상태 명시 메시지, reset aria. v1.4.2 M3 a11y 패턴 계승.
- **Mirror**: `html.js:213` (`.search`)·`html.js:425` (`.prd-group` neutral)·`html.js:435` (focus-visible)·`tests/a11y-aria-labels.test.js`·`tests/responsive-layout.test.js`.
- **Validate**: `node --test a11y-*.test.js responsive-layout.test.js oklch-conformance design-invariants` PASS. `.search`/`.explore-bar[session]` 규칙에 `--accent` 부재(focus 제외). ship 전 `/impeccable audit`(a11y·반응형) + `/impeccable polish`(PR 단계 권장).

### Task 8: 버전 bump + footer + CHANGELOG + 테스트 회귀 0
- **Action**: plugin.json `1.18.16 → 1.18.17`. html.js page-foot(라인 1220) + markdown.js footer(라인 127) 2곳 `1.18.17` 동기화. CHANGELOG v1.18.17 row(검색 wiring + 멀티세션 잔여축). DESIGN.md PE 절 갱신. 전체 렌더 스위트 회귀 0.
- **Mirror**: §3.7(footer drift)·직전 CHANGELOG/M2 row.
- **Validate**: `grep -rn "1.18.16" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/plugin.json` → 0. `node --test plugins/mccp/scripts/lib/renderer/tests/` 전부 PASS.

## Validation

```bash
# 1. 렌더러 전체 테스트(회귀 0)
node --test plugins/mccp/scripts/lib/renderer/tests/

# 2. 렌더 산출물 생성
node plugins/mccp/scripts/derive/cli.js render

# 3. 검색 입력 wiring (형태만 → 실제 input)
grep -c '<input type="search"' .claude/cache/status.html        # >= 1
grep -c 'role="search"' .claude/cache/status.html               # >= 1
grep -c 'class="kbd"' .claude/cache/status.html                 # 0 (kbd "F" 제거)
grep -cE 'aria-live="polite"|class="search-status"' .claude/cache/status.html  # >= 1

# 4. 멀티세션 잔여축 (행 data 속성 + 바) — worktrees 2+ 환경에서
grep -cE 'data-status=|data-worktree=|data-progress-rank=' .claude/cache/status.html

# 5. 가드 — inline script network primitive 0 (H19) · 외부 src 0 (H13)
grep -cE 'fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon' .claude/cache/status.html  # 0
grep -c '<script src' .claude/cache/status.html                 # 0

# 6. no-JS degrade — 전체 항목 가시(검색/필터는 client 전용)
grep -c 'li-item' .claude/cache/status.html                     # 전체 항목 존재

# 7. 버전 drift 0
grep -rn "1.18.16" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/plugin.json  # 0
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 검색(`_hs`)과 explore-bar(`_hf`)가 같은 `hidden` 두고 경쟁 → 상태 발산 | 중 | reason 분리 모델(Task 4 F-search1) — 가시성 = `!(_hf\|\|_hs)`, 두 컨트롤러는 자기 reason만 set + 공유 recompute. 독립 필터 AND 표준 패턴. |
| reason 모델 리팩터가 M2 필터/정렬 회귀 | 중 | 검색 미사용 시 `_hs` undefined → recompute 결과 = M2와 동일. explore-sort.test + explore-controls.test M2 케이스 회귀 0 유지 + reason 합성 신규 테스트. |
| 멀티세션 테이블이 단일 healthy worktree면 잔여축 컨트롤 dead | 저 | emit gate — `multiSession` present(테이블 렌더) + 행≥2일 때만 바 emit. graceful-hide 경로(단일 healthy)는 테이블·바 동반 미렌더(Task 5). |
| `data-worktree` 브랜치명 `_`가 H16 bold-underscore false-positive | 중 | Task 6 — H16 carve-out에 `data-worktree` 등 4속성 추가(M2 `data-plan` 선례). |
| 검색 cross-route 가시성이 `:target` 라우팅과 충돌 | 중 | 검색은 가시성(`hidden`)만 토글, 라우팅·DOM 위치 미변경(DOM-move 0). 한 번에 한 route만 보이되 nav 뱃지/live-region이 cross-page 매칭 surface(점프는 기존 nav). |
| "전 페이지 모아 보기"가 통합 결과 패널 기대일 수 있음 | 중 | MVP는 in-place 필터 + nav 뱃지 + live-region(통합 패널은 DOM-move/중복 ID 위험으로 out-of-scope). Phase 4 사용자 확인 + impeccable audit로 평가. |
| inline 엔진 JS가 후속 편집서 외부 fetch 도입 | 중 | H19가 explore.js + explore-sort.js 본문 자동 스캔(Task 6 검증). |
| 진행순 정렬이 실제 진행도 아닌 status 우선순위 근사 | 저 | `data-progress-rank`=status kind 우선순위(blocked>degraded>active>idle)로 정직히 문서화. '작업범위순'(LOC/파일)은 PRD대로 보류. |
| 검색 매칭이 헤더만이라 본문 키워드 미스 | 저 | 결정(헤더/요약만) — 안 보이는 텍스트 매칭 노이즈 회피. drawer detail 매칭은 후속 가능(plan-time 명시). |
| 대량 항목(230 위험) 검색 지연 | 저 | 단순 substring + 150ms debounce. 단일 개발자 규모 충분. |
| 병렬 cycle version 경쟁(main이 1.18.17 선점) | 저 | PR 직전 main pull 후 forward-only reconcile(직전 cycle 재발 부채 인지). |
| 컨트롤 a11y 회귀(키보드/aria) | 중 | native input/select + aria-label + live-region. a11y 테스트 + impeccable audit. |
| 검색 `<form>` Enter 시 native submit → 페이지 reload·navigate로 route/필터/검색 상태 손실 (Codex F1) | 중 | 검색 컨트롤러가 부모 `<form>`에 `submit` → `e.preventDefault()` 바인딩 + `action`/`method` 미지정. explore-search.test 소스 스캔(submit+preventDefault) + `/mccp:dashboard` Enter no-navigate 회귀. |
| emit gate 확장했으나 `explore.js:65` `!bars.length` early-return이 검색 wiring 차단 → 검색 input dead (Codex F2) | 중 | init guard를 `if (!EX) return;`로 낮추고 검색 wiring을 bars와 독립 실행(Task 4a). explore-bar 부재 fixture에서 검색 동작 회귀(script emit + `.search-input` + wiring 도달). |

## Acceptance
- [ ] 사이드바 검색이 실제 `<input type="search">`로 wiring(형태만 → 동작) + kbd "F" 제거 + `.js-only`
- [ ] 검색이 **전 페이지 `.li-item`을 동시 좁힘**(헤더/요약 텍스트 매칭) + nav-link 매칭 뱃지 + 전역 live-region 결과 수(전체 + per-route 분해)
- [ ] 검색(`_hs`)과 M2 explore-bar 필터(`_hf`)가 **AND 합성**(둘 다 적용 시 교집합만) — 가시성 = `!(_hf||_hs)`, 두 컨트롤러 무경쟁(F-search1)
- [ ] 검색 0 매칭 route에 빈 상태 메시지(explore-bar 유무 무관) + 검색 clear 시 전체 복원
- [ ] 검색 `<form>`이 Enter 시 submit/navigate 안 함 — `submit` → `preventDefault` + `action` 미지정 (Codex F1)
- [ ] explore-bar 부재 route에서도 검색 input wiring 동작 — init guard가 `bars.length`에 종속 안 됨 (Codex F2)
- [ ] 멀티세션 표면에 **진행상태·worktree 필터 + 진행순 정렬** 컨트롤(잔여 축 full) — 행 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord`
- [ ] 진행순 정렬이 status 우선순위(blocked>degraded>active>idle) + activity tie-break로 행 재배열
- [ ] 단일 healthy worktree(테이블 graceful-hide)면 멀티세션 바도 동반 미렌더(dead control 0)
- [ ] 작업범위순 정렬은 미구현(보류) — 정렬 select 미노출(PRD reconcile)
- [ ] JS 제거 시 검색 입력·컨트롤 숨김 + 전체 항목 손실 없이 가시(`.js-only` degrade) + STATUS.md 평문 동등(검색/필터/정렬 HTML 전용)
- [ ] pure 로직(`compareItems` progress mode · `matchFilter` status/worktree · `textMatch`) UMD + node 단위 테스트, inline 엔진 H19/H16 clean
- [ ] emit gate 확장 — 검색 타겟만 있어도(prd-group/explore-bar 부재) explore `<script>` emit
- [ ] plugin.json + footer 2곳 `1.18.17` 동기화
- [ ] `node --test` 렌더 스위트 전부 PASS, design-lint H1-H19 clean(회귀 0)
- [ ] PRD M3 row complete + Success Metric 검색/필터(4축)/정렬(진행순 추가) reconcile
- [ ] Patterns mirrored, not reinvented

## Open Questions (plan-time 해소)
- vendored JS 전달: M1 inline `<script>`(EXPLORE_JS) + M2 explore-sort.js 누적 → M3도 inline 누적(별도 파일/CDN 0). <!--mccp:resolved reason="M3 SHIPPED PR #71 (squash 301e4f7, v1.18.17) — 결정대로 inline 누적 확정. html.js가 client/explore.js(M3 검색 컨트롤러 포함)를 fs.readFileSync 후 inline <script>로 emit(별도 파일/CDN 0). M1 inline 패턴 + M2 explore-sort.js 누적을 M3가 그대로 계승 — H13(외부 src 0)·H19(network primitive 0) lint이 본문 자동 스캔." at="2026-06-30T13:06:10Z"-->
- 컨트롤 통합 vs 섹션별: 검색=사이드바(global wayfinding), 필터/정렬=panel-head(M2 canonical), 멀티세션 잔여축=멀티세션 카드 head. 각 컨트롤이 제어 대상 인접(scope↔placement 일치). <!--mccp:resolved reason="M3 SHIPPED — scope↔placement 일치 확정. 검색=사이드바 <form class='search js-only' role='search'> + <input type='search' class='search-input'>(html.js:1334, global wayfinding), 필터/정렬=panel-head(M2 canonical), 멀티세션 잔여축=멀티세션 카드 head <div class='explore-bar' data-explore-scope='session'>(explore-search.test.js:129). 각 컨트롤이 제어 대상 인접." at="2026-06-30T13:06:10Z"-->
- 필터 축 데이터 소스: 진행상태/worktree는 ②멀티세션 스캐너(`model.sources.worktrees`) surface 소비(③은 ①·② 후 진입 불변). <!--mccp:resolved reason="M3 SHIPPED — 진행상태/worktree 필터를 ②멀티세션 표면에 구현. multi-session.js가 derive model.sources.worktrees의 pure function(파일 헤더 line 4)으로 worktree당 1행 + 진행상태(worktreeStatusKind)·worktree 필터·진행순(data-progress-rank) 정렬을 소비. ③은 ①·② 후 진입 불변 가정 유지." at="2026-06-30T13:06:10Z"-->
- "작업범위순" 정의: 보류(PRD 명시 — 'PRD 기준 작업 진행도' 재기획 전까지). 정렬 select 미노출. <!--mccp:deferred reason="보류 결정은 유효(PRD 명시)하나 여전히 미해소 open — 'PRD 기준 작업 진행도' 재기획 전까지 정렬 select 미노출(M3 Scope). m2 plan line 170 deferred 항목과 동일 질문. STATE.md Open Questions(작업범위순 정렬 측정 단위 마일스톤/파일/LOC — PRD 기준 진행도 재기획 시 확정)에 active로 tracked. resolved 아님 — 측정 단위 미정 future-work로 정직히 open 유지." at="2026-06-30T13:06:10Z"-->
- 검색 매칭 범위: **헤더/요약만**(`.li-main` 텍스트) — 사용자 결정. drawer detail 제외. <!--mccp:resolved reason="M3 SHIPPED — 매칭 범위 = 화면 가시 줄(헤더/요약)만으로 확정. explore.js가 문서 전역 .li-item을 li.querySelector('.li-main') 텍스트로 좁힘(explore.js:196,201). 접힌 드로어 detail 제외 — 사용자 결정대로 wiring." at="2026-06-30T13:06:10Z"-->
- no-JS degrade 검증: `.js-only` 숨김 + script-strip 회귀 테스트(M1·M2 패턴 계승). <!--mccp:resolved reason="M3 SHIPPED — explore-search.test.js test (f) 'no-JS degrade — script 제거 후 전체 항목 + 멀티세션 행 가시'(line 168) ship. 검색 <form>·explore-bar는 .js-only로 JS off 시 숨김 + script strip 후 전체 .li-item·멀티세션 행 가시 회귀 보장. M1·M2 PE 불변 패턴([data-js='on'] reveal hook, guard가 data-js set 앞 — test 라인 231) 계승 확인." at="2026-06-30T13:06:10Z"-->

## Design Critique

- 호출: `Skill(impeccable, critique)` — frontend-design-direction SKILL.md `## Output Constraints` 4 anchor first-step Read 후 plan-stage 디자인 표면 critique (v1.3.0-m2 retry loop, §3.9).
- 라운드 수: 1 (R0) · Verdict: CONVERGED (`design-critique-decide.js#decideCritique`, cap=2)
- 기존 계약 대조: DESIGN.md One Voice Rule(signal-blue ≤1/viewport) + Exception-Only Rule(red/amber 예외만) + panel-head 통합 canonical(M2) + PE(`.js-only`/`data-js="on"`) — 플랜이 충실히 미러링. 사이드바 검색 affordance는 현재 `aria-hidden` placeholder(DESIGN.md §5 Navigation)를 M3가 wiring.
- 4 Output Constraints 평가:
  | Constraint | 결과 | 근거 |
  |---|---|---|
  | 정보 위계 3단계 | PASS | 컨트롤만 추가, heading depth 미증가 |
  | 강조색 화면당 1개 | PASS | 검색/멀티세션 컨트롤 neutral 토큰 예산 0, focus-visible signal-blue는 단일 포커스 carve-out |
  | raw markdown marker 금지 | PASS | 렌더 HTML, H16 carve-out은 신규 data 속성 false-positive 차단용(마커 도입 아님) |
  | 한 화면 항목 수 상한 | PASS(LOW) | 멀티세션 바 4 컨트롤 = Miller 경계선, 옵션<2 생략으로 실제 보통 2-3 |
- LOW 관찰(non-blocking): C1 neutral 동시표시(One Voice 위반 없음) · C2 멀티세션 바 4컨트롤 경계선 · C3 heading/markdown clean. HIGH/CRITICAL 0.

## Design Routing Guide

routing mode: auto (implement 단계에서 발효). implement 게이트가 stage-appropriate impeccable 명령을 라우팅하며, 여기서는 체크리스트만이다. `critique`은 §3.9 retry loop가 소유(plan-stage CONVERGED). plan 단계는 렌더 UI 부재로 invoke 없음(recommend-only).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1) · classification=ok · blocking=false · durationMs≈361s · threadId `019f0388-3e33-76e2-849d-67a61c6c52e2`
- 합치 결론: 핵심 아키텍처(가시성 reason 모델 `_hf`/`_hs` AND 합성 · cross-route 검색 가시성 · 멀티세션 진행순 키 · emit gate 확장)는 건전 — HIGH/CRITICAL 0. 검색 wiring 표면에 구체적 MEDIUM 정확성 갭 2건, R1에서 플랜에 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 검색 `<form>`은 `type="search"`라도 Enter 시 native submit → action 없으면 페이지 reload/navigate로 route·필터·검색 상태 손실. 플랜 Task 3 "submit 무동작" 주장이 틀림(confidence 0.92) | MEDIUM | ACCEPT_NOW | 실제 버그 + 흡수 cheap. 검색 컨트롤러가 `submit` → `e.preventDefault()` 바인딩 + Enter no-navigate 회귀. Task 3·4·5·Risks·Acceptance 개정. |
  | F2 — emit gate를 `hasSearchTargets`로 확장해도 `explore.js:65` `if (!EX \|\| !bars.length) return;`가 `.explore-bar` 부재 시 early-return → 검색 입력 wiring 안 됨(`bars.length===0`). 소스 확인 완료(confidence 0.86) | MEDIUM | ACCEPT_NOW | 실제 통합 갭. init 분리 — guard를 `if (!EX) return;`로 낮추고 검색 wiring을 bars와 독립 실행, bar 컨트롤러만 bars 존재 시 loop. Task 4·6·5·Risks·Acceptance 개정. |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0 — security/atomic-state/schema-breakage catalog 해당 없음)
- Codex session 참조: threadId `019f0388-3e33-76e2-849d-67a61c6c52e2` (working-tree mode, 1 unstaged + 1 untracked)

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1) · classification=ok · blocking=false · durationMs≈261s · threadId `019f03a8-4d22-72d3-8f1e-9a91c644056d`
- 합치 결론: 핵심 아키텍처(가시성 reason 모델 `_hf`/`_hs` AND 합성 · cross-route 검색 · 멀티세션 진행순 키 · emit gate 확장)는 plan-codex와 동일하게 건전 — HIGH/CRITICAL 0. 검색 wiring/세션 바 통합 표면에 MEDIUM 통합 갭 2건, R1에서 코드에 흡수(plan body도 개정).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | IF1 — `explore.js`가 EX 체크 *이전에* `data-js="on"`을 set → `EXPLORE_SORT_JS`(=`window.__mccpExplore`) 누락/실패 시 `.js-only` 컨트롤(검색 `<form>` 포함)이 보이지만 inert. 검색 폼은 submit→preventDefault 미바인딩으로 Enter-navigate 회귀(confidence 0.82) | MEDIUM | ACCEPT_NOW | 실제 degraded-dep 버그. `data-js="on"` set 을 `if (!EX) return;` guard *뒤로* 이동 — EX 부재 시 `.js-only` 숨김 유지(baseline 전체 가시·inert 컨트롤 0). prd-toggle 은 `.js-only` 아님(동적 주입)이라 무영향. |
  | IF2 — 세션 바가 `.explore-bar.js-only` 재사용 → M2 `wireBar` 루프(`querySelectorAll('.explore-bar')`)가 세션 바도 이중 바인딩: 행 컨트롤러와 경쟁 + `#route-activity` 무관 `.li-item`(타임라인/마일스톤) 카운트 + 세션 sort 를 무효 `severity` 로 reset(confidence 0.86) | MEDIUM | ACCEPT_NOW | 실제 통합 갭. 소유권 분리 — M2 리스트 컨트롤러는 `.explore-bar:not([data-explore-scope="session"])`만 loop, 세션 컨트롤러는 `[data-explore-scope="session"]`만 소유(`<tbody><tr>` 대상, mode `progress`). explore-search.test 에 세션 바 변경이 리스트 컨트롤러 미발화 회귀. |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0 — security/atomic-state/schema-breakage catalog 해당 없음)
- Codex session 참조: threadId `019f03a8-4d22-72d3-8f1e-9a91c644056d` (working-tree mode)
