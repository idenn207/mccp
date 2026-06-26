# Implementation Report: Dashboard Data Exploration — M3 (검색 + 잔여 탐색 축)

**Plan**: `.claude/plans/dashboard-data-exploration-m3.plan.md`
**Decision slug**: `dashboard-data-exploration-m3`
**Branch**: `dashboard-data-exploration` (worktree `.worktrees/dashboard-data-exploration/`)
**Date**: 2026-06-26

## Summary

PRD ③(dashboard-data-exploration)의 마지막 마일스톤. 세 표면을 닫았다:

1. **검색 wiring** — 형태만 있던 사이드바 검색을 실제 `<form role="search">` + `<input type="search">`로 wiring. 문서 전역 `.li-item`(위험·질문)을 헤더/요약(`.li-main`) 텍스트로 cross-route 동시에 좁힌다(150ms debounce, 단축키 0). 매칭 페이지를 nav-link 뱃지(`.nav-search-count`) + 전역 `aria-live` live-region("전체 N개 일치 · 위험 8 · 질문 2")으로 surface.
2. **검색 ↔ 필터 AND 합성** — 가시성 reason 모델(`_hf`=필터, `_hs`=검색 expando + 공유 `recompute`). 한 `.li-item`의 가시성 = `!(_hf || _hs)`. 두 컨트롤러가 자기 reason 만 set → 경쟁 0.
3. **멀티세션 잔여축** — `#route-activity` 멀티세션 테이블에 진행상태·worktree 필터 + 진행순 정렬 바(`buildSessionBar`) full 구현. 행 `data-status`/`data-worktree`/`data-progress-rank`/`data-activity-ord`. 작업범위순 정렬은 PRD 명시대로 보류.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (8 task, 2 신규 controller + reason 모델 리팩터) |
| Files Changed | 13 (계획) | 15 (계획 11 + 정당화된 deviation 4) |
| Tests | explore-sort 확장 + explore-search 신규 | renderer 590 PASS (M2 569 → +21), consumer 37 PASS |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | pure 로직 확장 (explore-sort.js) | 완료 | progress mode + status/worktree 필터 + textMatch. 단위 8 신규. |
| 2 | 멀티세션 행 data 속성 + filterOptions (multi-session.js) | 완료 | KIND_META.rank SSoT + activity-ord recency 스캔. |
| 3 | 검색 입력 wiring + 사이드바 마크업 (html.js) | 완료 | form/input/live-region/nav 슬롯 + neutral CSS. kbd "F" 제거. |
| 4 | 가시성 reason 모델 + 검색 컨트롤러 (explore.js) | 완료 | `_hf`/`_hs` + recompute + 검색/세션 컨트롤러. IF1·IF2 흡수. |
| 5 | 멀티세션 바 빌더 + 컨트롤러 (html.js + explore.js) | 완료 | buildSessionBar + sessionBarHtml + 세션 패널 head 통합. |
| 6 | emit gate 확장 + lint carve-out | 완료 | hasSearchTargets 축 + H16 4 속성 carve-out. |
| 7 | 컨트롤 CSS (neutral) + a11y + 반응형 | 완료 | 강조색 0(focus-visible 제외) + tr[hidden] 보강. |
| 8 | 버전 bump + footer + CHANGELOG + DESIGN.md | 완료 | plugin.json/footer ×2/CHANGELOG/DESIGN 동기화 `1.18.16→1.18.17`. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (syntax) | PASS | `node --check explore.js` OK (no tsc/eslint in project — node-native). |
| Unit Tests | PASS | renderer 590 + stale-audit/completion-ledger 37. |
| Build | N/A | plain JS, no build step. |
| Integration (render) | PASS | `derive/cli.js render` design-lint clean (no violation) + 9/9 plan greps. |
| Edge Cases | PASS | no-JS degrade · H16/H19 clean · F1/F2/IF1/IF2 회귀. |

## Codex Implement-Codex Gate

- R1 · classification=ok · blocking=false · threadId `019f03a8-4d22-72d3-8f1e-9a91c644056d`.
- 2 MEDIUM finding 흡수(둘 다 ACCEPT_NOW, HIGH/CRITICAL 0 → R2 미escalate):
  - **IF1**: `data-js="on"`을 EX 확인 *뒤*로 이동 — `EXPLORE_SORT_JS` 누락 시 `.js-only` 컨트롤 dead-UI + 검색 Enter-navigate 회귀 차단.
  - **IF2**: 세션 바 소유권 분리(`:not([data-explore-scope="session"])` vs `[data-explore-scope="session"]`) — M2 wireBar 이중 바인딩·무효 sort reset 차단.

## Deviations from Plan (minor — 정당화)

계획 Files-to-Change(11) + 아래 4 파일. 모두 minor·정당화 deviation(plan↔구현 gap 아님 — 전 validation PASS):

1. **`parsers/plan-body.js`** (계획 외) — `extractPrdLabel`에 inline code/bold 마커 strip 추가. **WHY**: 실데이터 plan H1(`v1.0.1 axis K — \`pr-phase-guard.js\` …`)이 prd-group `<summary>` 라벨에서 `escapeHtml`로 `&#96;` 인코딩 → H16 entity-backtick(absolute-ban) 발화. SSoT(라벨 추출 지점) 1-함수 수정으로 차단. 라벨은 display-only(prdKey 는 path 파생 — 매칭 무영향). renderer 외 consumer(completion-ledger/stale-audit)는 `extractPrdLabel` 미사용 — 37 test PASS 확인. **이 H16은 pre-existing(M1 prd-label + M2 option-label 경로 동일, origin/main 식별)이며 M3 회귀 아님.** option label 측은 html.js `plainLabel`(계획 내 buildExploreBar/buildSessionBar)로 흡수.
2. **`tests/console-shell.test.js`** (계획 외) — 검색 affordance test 를 신규 `<form>`/`<input type=search>` 마크업으로 갱신(이전 `<div class=search>` + kbd "F" assertion). **WHY**: Task 3 가 검색 마크업을 바꿈 → 기존 test maintenance(계획 변경의 필연).
3. **`tests/i18n-surface.test.js`** (계획 외) — footer 버전 assertion `1.18.16 → 1.18.17`. **WHY**: Task 8 버전 bump 의 필연 maintenance.
4. **`tests/multi-session.test.js`** (계획 외) — self-row regex 를 attribute-tolerant 로(`<tr class="self">` → `<tr class="self"[ >]`). **WHY**: Task 2 가 `<tr>`에 data 속성 추가 → 기존 test maintenance.

## Issues Encountered

- **plan-conflict-detector false-positive (도구 버그, 비차단)**: `scripts/lib/plan-conflict-detector.js#parseFilesToChange`가 Files-to-Change 테이블 첫 셀의 backtick 래핑을 strip 하지 않아(`` `DESIGN.md` `` ≠ `DESIGN.md`), 모든 mccp 표준 plan(경로를 backtick 으로 감싸는 포맷)에서 planned-file 매칭이 0 → 항상 `file-expansion` CONFLICT=1 오발. 본 milestone 도 명시적으로 계획된 CHANGELOG.md/DESIGN.md 를 "unplanned"로 오분류. **escalate 미실행**(axis H 의도 = 진짜 plan↔구현 gap; 본 건은 도구 parse 버그 + 전 validation PASS). 별도 patch axis 후보(backtick strip 1-line).
- **worktree `.git/` 는 파일**: Codex tmp 경로에 `.git/mccp/tmp` 하드코드가 `mkdir: Not a directory` 실패 → `git rev-parse --git-dir`로 진짜 gitdir 사용(재발 부채 — [[feedback-pr-worktree-gh-first]]).
- **render-time H16 advisory**: 실데이터 render 가 처음 H16 entity-backtick(2) 보고 → plainLabel + extractPrdLabel strip 으로 0. 잔여 단일 `&#96;`은 unpaired(risk 소스 데이터 noise) → H16 미발화.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/explore-search.test.js` (신규) | 12 | 검색 마크업·nav 슬롯·세션 바·행 data 속성·emit gate·no-JS·H16/H19·F1·F2·IF1·IF2 |
| `tests/explore-sort.test.js` (확장) | +8 | progress mode·status/worktree 필터·textMatch(NFC·대소문자·빈·미스) |

## Next Steps

- [ ] `/mccp:prp-commit` — M3 커밋 (이 보고서는 outward-facing PR 전 review 지점).
- [ ] `/mccp:pr` — PR 생성(impeccable audit/polish a11y·반응형 + Plan 명시 ship 전 검토). PR 직전 origin/main rebase(squash-merge divergence 재발 부채).
- [ ] PRD M3 row complete + Success Metric reconcile + plan archival은 ship(PR merge) 시점(M1/M2 convention).
- 도구 부채: plan-conflict-detector backtick strip patch.
