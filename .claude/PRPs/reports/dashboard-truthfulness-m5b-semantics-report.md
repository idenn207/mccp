# Implementation Report: Dashboard Truthfulness M5b — 표현/Hero 의미론 정합

## Summary

M5a(#2 진행중 진실성, v1.18.8)에 이어 M5의 나머지 표현 결함 6건(#1·#3·#4·#5·#6·#7)을 닫았다. 콘솔 셸 계약(oklch 토큰·드로어·비-색 마커·카드 비중첩, PR #57~#63)은 불변 — 신규 시각 시스템·신규 색 토큰 0. 데이터·개념 정합 작업.

- **#3+#7 위험/차단**: rail '미해결 위험'을 backlog HIGH/CRIT에서 **위험 섹션과 동일 소스**(plan body risks active)로 통일 → rail(45)==섹션(45)==nav 뱃지(45). backlog는 '이월 finding'(deferred) 셀로 분리. '차단' 셀 의미 툴팁.
- **#4 Hero**: `verdict.js` 우선순위 재정렬 — fresh in-progress가 backlog-deferred보다 앞(h1="현재 작업: …"). 요약체 cap(72 codepoint).
- **#1 verdict 라벨**: neutral='진행 중' / muted='대기' 분화.
- **#5 hero-version 제거**: hero 표면 version 줄(html+md) 제거, footer 유지.
- **#6 더보기→route**: 위험/질문/타임라인 섹션 route full mode(전체 렌더, 더보기 제거) + hero 위험 위젯 route 링크. md는 `<details>` 유지.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large (M5b = Task 2~7) | Large — 일치 |
| Files Changed | ~13 (Files to Change) | 21 (소스 10 + 테스트 9 + 문서 2) |
| 신규 코드 vs 표현 | 데이터/개념 정합 | renderer 5 모듈 + 20 테스트 갱신 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 2 | 위험/차단 정합 (소스 통일 + 이월 finding + 차단 툴팁) | 완료 | status-grid 5 cells, rail==섹션 45 정합 |
| 3 | Hero 재설계 (우선순위 재정렬 + 요약체) | 완료 | verdict.js fresh in-progress 우선, capIntent |
| 4 | verdict 라벨 분화 (neutral≠'대기') | 완료 | HERO_STATUS neutral='진행 중' |
| 5 | hero-version 줄 제거 | 완료 | html `.hero-version` + CSS + md versionMd 제거 |
| 6 | 더보기 → route 전체보기 링크 (full mode) | 완료 | 3 섹션 full mode + hero route 링크, 도달성(F2) |
| 7 | 테스트 + 문서 + version + PRD + CHANGELOG | 완료 | 20 테스트 갱신, dashboard-surface §2.5, v1.18.9 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (design-lint H1-H18) | Pass | 132 a11y+output-constraints+responsive+oklch 통과 |
| Unit Tests | Pass | renderer 481 + derive/stale-audit 105 = 586 PASS, 0 fail |
| Build | N/A | Node 스크립트(빌드 단계 없음) |
| Integration (e2e render) | Pass | rail==섹션 45, route-risks li-item 45(도달성), hero-version 0, footer v1.18.9 |
| Edge Cases | Pass | negative test (decision_id/legacy/stale), 도달성, md 동등 |

## Files Changed

| File | Action | 핵심 |
|---|---|---|
| `sections/status-grid.js` | UPDATE | 위험 소스 통일 + 이월 finding 셀 + 차단 툴팁, 5 cells |
| `verdict.js` | UPDATE | fresh in-progress 우선 재정렬 + capIntent |
| `html.js` | UPDATE | HERO_STATUS 분화 / heroWidget 4종 / hero-version 제거 / route 링크 CSS / footer |
| `markdown.js` | UPDATE | footer v1.18.9 |
| `sections/risks.js` · `open-questions.js` · `audit-timeline.js` | UPDATE | route full mode(html 전체, md `<details>` 유지) |
| `.claude-plugin/plugin.json` | UPDATE | 1.18.8 → 1.18.9 |
| 테스트 9개 | UPDATE | 디자인 변경 회귀 단언 갱신 |
| `CHANGELOG.md` · `dashboard-surface.md` · `dashboard-truthfulness.prd.md` | UPDATE | 1.18.9 entry / §2.5 / M5 row complete |

## Deviations from Plan

- **plugin.json 버전**: plan은 `1.18.7 → 1.18.8`을 명시했으나 M5a가 이미 1.18.8을 소비 → M5b는 §3.7(같은 PRD 연속 milestone = patch 누적)에 따라 `1.18.8 → 1.18.9`.
- **Hero 위젯 4종**: plan Task 6은 "위젯(진행중/이월 finding/위험)"을 열거하나 header-hoist 테스트가 차단 위젯을 단언 → 4종(진행중/차단/이월/위험) 유지. 차단은 pin-alert + 위젯 양쪽 보존, route-link 대상은 위험만.
- **plan archive 미실시**: repo 관행상 `.claude/plans/`에 44 plan(완료분 포함)이 유지됨 → archive 생략(PRD Plan 셀 resolve 유지 + milestone-history cross-ref 보존).

## Issues Encountered

- **차단 툴팁 URL-인코딩**: `escapeAttr`가 공백을 `%20`으로 인코딩("검토%20충돌") → title 속성엔 부적합. `escapeHtml`로 교정(공백 보존·따옴표 entity). href(`#route-risks`)는 escapeAttr 유지(공백 없음, 무해).
- **PRD M5=complete → 진행중=0**: M5b 완료로 PRD M5 row를 complete 전환(plan line 35 "M5b 완료 시 M5 → complete" + Codex F3 "명시 데이터가 1차 신호"). 결과 Hero가 "대기 / 다음 마일스톤 선택"(truthful end-state). PR 머지 전 한시적으로 실제 작업(M5b)보다 앞서나 머지 후 정합.

## Known Debt (out of M5b scope)

- **H16 advisory 1건**: STATUS.md(md) 마일스톤 드로어 요약에 `**bold**` 리터럴 1건(`extractPlanSummary`가 plan `## Summary`를 raw로 추출). **M5b 변경 전부터 존재**(milestone-history/drawer-detail surface, 미변경 파일). advisory(non-blocking). cross-section 부채로 별도 cycle 후보.
- **위험 lifecycle scope (Codex F4)**: 미해결 위험 45건은 완료 plan의 historical risk 포함 → M6 backlog 이월(`codex-findings-backlog.md` 2026-06-25 MEDIUM). M5는 rail↔섹션 표시 일관까지.

## Next Steps

- [ ] **비주얼 검증 (필수)**: `.claude/cache/status.html`을 브라우저로 확인 — Hero "현재 작업"/위젯 4종/route 링크/차단 툴팁/반응형. (이 환경은 브라우저 렌더 불가 → 사용자 육안 검토.)
- [ ] 시각 확인 후 `/mccp:prp-commit` → `/mccp:pr`
- [ ] PR 머지 후 worktree cleanup
