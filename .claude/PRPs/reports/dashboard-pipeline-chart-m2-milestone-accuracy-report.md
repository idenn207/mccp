# Implementation Report: Dashboard Milestone-Record Accuracy + Terminology Unification (M2 잔여)

## Summary
대시보드 "마일스톤 기록" 섹션의 용어 통일(이정표→마일스톤)과 "날짜 미상" 정확성 결함을 닫았다. 조사 결과 "날짜 미상"은 단일 버그가 아니라 4개 근본 원인이 겹친 것이었고, Codex adversarial review가 그중 2건의 잠복 경로-해석 버그를 추가로 적발해 absorb했다. 모두 read-side 렌더링·상관 로직 — receipt/derive 스키마 불변.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 7-8 | 8 (코드 5 + 테스트 3) |
| 마일스톤 섹션 날짜 미상 | 0건 | 0건 (10→0) |
| Test | renderer+derive 전건 PASS | 312 + 68 = 380 PASS |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 용어 통일 이정표→마일스톤 | 완료 | markdown.js(앵커+heading), html.js(h2). id `milestone-history` 불변 |
| 2 | (A) source_prd 평문/백틱 매칭 + dual-path 해석 | 완료 | plans.js regex + plan-body.js `resolvePrdRef` dual-candidate (Codex F1) |
| 3 | (B) planBasename + planPath 반환 | 완료 | `extractPlanPath` — `.plan.md` 우선, `(report:…)` 무시 (Codex F2) |
| 4 | (C) git commit 시점 fallback | 완료 | `resolveGitCommitTime` — directory-preserving + completed/ archive basename 최종 후보 (Codex F2) |
| 5 | 테스트 신규 + 회귀 | 완료 | milestone-history.test.js(8) + plans-source-prd.test.js(1) + four-part assertion 갱신 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit Tests | 통과 | renderer 312 + derive 68 = 380, 0 fail |
| 렌더 산출물 | 통과 | 마일스톤 섹션 날짜 미상 0건 · dashboard M1 표시 복원 · 이정표 코드 0건 |
| 회귀 가드 | 통과 | 기존 380 테스트 무회귀 |

## Files Changed

| File | Action | 비고 |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | 앵커+heading 용어 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | h2 용어 |
| `plugins/mccp/scripts/derive/sources/plans.js` | UPDATE | `SOURCE_PRD_LINK_RE`/`SOURCE_PRD_PLAIN_RE` + `extractSourcePrd` |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | `resolvePrdRef`/`extractPlanPath`/`stripPathWrappers` + dual-path parsePlanBody |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | dual-path PRD 해석 + `resolveGitCommitTime` git fallback |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATE | assertion 용어 |
| `plugins/mccp/scripts/lib/renderer/tests/milestone-history.test.js` | CREATE | 8 test |
| `plugins/mccp/scripts/derive/tests/plans-source-prd.test.js` | CREATE | 1 test |

## Deviations from Plan
- 테스트 파일 위치: plan은 `renderer/tests/plans.test.js`로 적었으나 plans.js가 derive-layer 소스이므로 `derive/tests/plans-source-prd.test.js`로 배치(올바른 위치 교정). minor deviation, plan-conflict 아님.
- Task 4 git fallback에 `.claude/PRPs/plans/completed/<basename>` 최종 후보 추가 — PRD 셀이 archive 전 경로로 stale인 경우(v1-4-0-multi-session-m1 케이스)를 해소. Codex F2 absorption 범위 내 refinement.

## Codex Review
- Plan-Codex: needs-attention → 2 HIGH (F1 dual-path PRD 해석, F2 directory-preserving planPath) 모두 ACCEPT_NOW absorbed.
- Implement-Codex: cross-gate dedupe (동일 decision-set, 새 architectural decision 0).
- Design critique: converged (용어 rename뿐, 신규 시각 surface 0).

## Next Steps
- [ ] `/mccp:prp-commit` → `/mccp:pr`
