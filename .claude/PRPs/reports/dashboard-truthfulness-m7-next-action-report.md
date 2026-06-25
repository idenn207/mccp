# Implementation Report: Dashboard Truthfulness M7 — 다음-행동 진실성 + 잘림 제거

## Summary

대시보드의 핵심 기능(다음 진행사항 추천)이 hollow `/mccp:resume`를 echo하고 Hero 설명이 문장 중간에서 `…` 잘리던 결함을 닫았다. 다음-행동을 in-progress 마일스톤의 실제 게이트 frontier에서 derive하고(STATE.md stale/hollow echo 차단), Hero 설명·진행중 위젯의 잘림을 제거했다. ledger-aware decision-state(freshness-guarded)가 frontier 정확성을 뒷받침한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 15 (plan) | 16 src/test + 4 docs (plan-hashes.js 헬퍼 추가) |
| Tests | next-action/decision-state/pipeline 갱신 | renderer 501 + derive 87 PASS (decision-state 11 + next-action 18 신규/재작성) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | ① decision-state.js — ledger-aware 승격 (freshness-guard) | 완료 | `ledgerCloseFresh`(strict decision+basename+hash). Codex F2 흡수. |
| 2 | ① pipeline.js — ledger/planHashes 전달 | 완료 | `planHashesFromModel` 공유 헬퍼(plan-hashes.js) 경유. |
| 3 | ④ next-action.js — frontier-primary + hollow 필터 (CORE) | 완료 | + converged-frontier→next-stage 정밀화(deviation). Codex F1+F3 흡수. |
| 4 | ④ status-grid.js — decisionState/hasHandoffSignal 주입 | 완료 | nextStep cell handoff_spawn 정렬 + 위젯 maxLen 56(deviation). |
| 5 | ⑤ Hero 설명 잘림 제거 | 완료 | intent-extractor `complete` 모드(첫 완결 문장) + clamp 4→6. |
| 6 | ⑤ 진행중 위젯 잘림 제거 | 완료 | `.hw-list li` 2줄 wrap + formatPlanLabel maxLen 완화. |
| 7 | 버전·footer·PRD·CHANGELOG | 완료 | 1.18.10→1.18.11 + 양 footer + M6→complete + M7 row + 1.18.10 backfill. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | 전 모듈 로드 OK (html.js template-literal backtick 회귀 1회 수정). |
| Unit Tests | Pass | renderer 501 + derive 87 PASS, 0 회귀. |
| Build | N/A | Node 라이브러리(빌드 단계 없음). |
| Integration | Pass | `cli.js render` — next-action=`/mccp:pr`(truthful frontier), hollow resume 0, Hero subtext 완결 문장, 위젯명 전체. |
| Edge Cases | Pass | F1(stale cross-cycle)·F2(hash mismatch/partial ledger)·F3(resume_state≠handoff) 회귀 단언 green. |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `parsers/decision-state.js` | UPDATE | ledger 승격 + `ledgerCloseFresh` |
| `parsers/next-action.js` | UPDATE | frontier-primary 재정렬 + HOLLOW_COMMANDS + converged-frontier 시프트 |
| `parsers/intent-extractor.js` | UPDATE | `firstSentence`/`shapeIntent` complete 모드 |
| `parsers/plan-hashes.js` | CREATE | `planHashesFromModel` 공유 헬퍼(deviation — 중복 회피) |
| `sections/pipeline.js` | UPDATE | ledger/planHashes 전달 |
| `sections/status-grid.js` | UPDATE | decisionState/hasHandoffSignal + 위젯 maxLen |
| `verdict.js` | UPDATE | Hero subtext `{ complete: true }` |
| `html.js` | UPDATE | `.verdict-sub` clamp 6 + `.hw-list li` wrap + footer |
| `markdown.js` | UPDATE | footer |
| `tests/{decision-state,next-action,dashboard-overview,i18n-surface}.test.js` | CREATE/UPDATE | 신규/갱신 |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M6→complete, M7 row |
| `plugin.json` / `CHANGELOG.md` | UPDATE | 1.18.11 + 1.18.10 backfill |

## Deviations from Plan

1. **테스트 경로**: plan은 `parsers/tests/`·`sections/tests/`를 가정했으나 실제 테스트는 모두 `renderer/tests/`에 위치(plan이 가리킨 디렉토리는 빈 상태). 실제 컨벤션 경로 사용.
2. **plan-hashes.js 신규 헬퍼**: Task 1/2/4가 inline으로 둔 planHashes 계산을 pipeline+status-grid 공유 헬퍼로 추출(중복 회피). 아키텍처 무변경, plan 의도 내.
3. **④ converged-frontier→next-stage 정밀화**: plan은 frontier short를 명령으로 직접 매핑했으나, impl 게이트가 *converged-frontier*(수렴·다음 대기)일 때 truthful next는 re-implement가 아니라 PR. plan의 truthfulness 의도를 완성하는 보정.
4. **⑤ 위젯 data cap**: plan은 html.js CSS만 명시했으나, 위젯명은 `formatPlanLabel` maxLen 30이 *데이터*를 먼저 잘랐다(CSS wrap만으론 부족). status-grid 위젯 items에 maxLen 56 전달 — 실제 수정 위치.
5. **CHANGELOG 1.18.10 backfill**: M6(커밋 97eb796)가 CHANGELOG 항목을 누락해 1.18.9→1.18.11 hole 발생. 같은 branch/PR에 묶이므로 연속성 위해 backfill.
6. **plan archive skip**: PRD M7 row 링크 + receipt plan_hash readback(/mccp:pr) 의존으로 plan을 `.claude/plans/`에 유지(prior 마일스톤 동일 컨벤션).

## Issues Encountered

- **worktree `.git/` hardcode**: 명령 본문의 `mkdir .git/mccp/tmp`가 worktree gitlink에서 실패 → `git rev-parse --git-dir` 우회(누적 부채).
- **implement→상류 plan-codex stale**: implement가 plan에 `## Codex Implementation Review` append 시 plan_hash가 어긋나 plan-codex receipt가 stale → plan-codex re-stamp로 해소(구조적 axis 후보).
- **html.js template-literal backtick**: CSS 주석에 백틱 삽입 → JS template literal 종료(SyntaxError) 1회 → 백틱 제거.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/decision-state.test.js` | 11 (신규) | ledger 승격 + F2 freshness-guard(hash mismatch/partial/null) |
| `tests/next-action.test.js` | 18 (재작성) | frontier-primary, F1(stale cross-cycle), F3(handoff), converged-frontier→PR |

## Next Steps
- [ ] 사용자 시각 확인(`.claude/cache/status.html`) — 브라우저 스크린샷 불가 환경
- [ ] `/mccp:prp-commit` → `/mccp:pr`
