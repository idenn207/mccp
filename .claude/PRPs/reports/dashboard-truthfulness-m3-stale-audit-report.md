# Implementation Report: Dashboard Truthfulness M3 — 위험·질문 은퇴 + 마일스톤 lifecycle

## Summary

M3을 *render-side 추정 은퇴*에서 **평가 기반 소스 최신화(해결 마커)**로 재설계해 구현했다. 세 부분 전부 ship:

1. **비파괴 해결 마커 컨벤션 + 결정적 render** — 위험/OQ 라인 끝(trailing)의 `<!--mccp:resolved reason="…" at="…"-->` 마커를 render가 읽어 메인에서 빼고 "해결됨 N건" 접힘으로만 노출. resolved 신호는 마커뿐(bare `[x]`/status 추정 0). 셀 split 이전 라인 단위 strip으로 표 무손상. trailing-only 인식으로 컨벤션을 *문서화*하는 plan 본문이 거짓 은퇴되지 않음.
2. **`/mccp:dashboard-audit` 재사용 명령 + stale-audit lib** — enumerate(active 항목) → agent 평가(증거) → human-gate → 결정적 applier(per-file lock + content-hash CAS + batch + 재-parse 검증 + 오매칭 skip).
3. **마일스톤 lifecycle** — `dropped` status + pending/dropped default-off 토글(비-색 ◌/⊘) + stale in-progress status 최신화.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (9 tasks, ~16 신규/수정 파일) |
| Confidence | — | 높음 (549 test PASS, 0 회귀) |
| Files Changed | ~22 | 33 (코드 13 + 테스트 9 + docs/version/PRD/CHANGELOG 4 + dogfood plan 편집 ~33) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 해결 마커 컨벤션 (resolution-marker.js) | 완료 | trailing-anchored (메타-케이스 차단 — plan 자기-문서화 거짓 은퇴 방지) |
| 2 | plan-body 파서 확장 (resolved/dropped/lifecycle) | 완료 | withMeta 셀 split 이전 strip + VALID_STATUSES dropped + lifecycle 파서 |
| 3 | resolution-classify + index wiring | 완료 | dedupe 직후 annotateResolution (fail-open) |
| 4 | risks/open-questions active·resolved 분할 | 완료 | 드로어 detail 유지(H18) + stripMarker 누출 0 |
| 5 | milestone-history lifecycle 토글 | 완료 | early-return 앞 파싱(Codex F3 lifecycle-only PRD) |
| 6 | stale-audit lib (enumerate + apply) | 완료 | F3 lock + hash CAS + batch + locate↔parseRisks parity(off-by-one fix) |
| 7 | `/mccp:dashboard-audit` 명령 | 완료 | enumerate→evaluate→human-gate→apply→render |
| 8 | 테스트 전체 + 디자인 lint | 완료 | 신규 5 + 갱신 5 테스트, headline (a)-(g) 커버 |
| 9 | dogfood + 문서 + version + PRD | 완료 | dogfood 273건 은퇴, docs/version/PRD/CHANGELOG 갱신 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | JS, no type-check (lint via design-constraints) |
| Unit Tests | Pass | renderer 446 + derive 87 + stale-audit 16 = 549 |
| Build | N/A | no build step |
| Integration | Pass | derive render → status.html/STATUS.md 산출 정상 |
| Edge Cases | Pass | 메타-케이스(trailing-only) + F1/F2/F3 회귀 |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `renderer/parsers/resolution-marker.js` | CREATE | trailing-anchored 마커 (isResolved/stripLineMarker/stripMarker/escapeMarkerReason/buildMarker) |
| `renderer/parsers/resolution-classify.js` | CREATE | annotateResolution 전파 seam |
| `renderer/parsers/plan-body.js` | UPDATE | withMeta + resolved flag + dropped + parseDeliveryMilestonesLifecycle |
| `renderer/index.js` | UPDATE | annotateResolution wiring |
| `renderer/sections/{risks,open-questions}.js` | UPDATE | active·resolved 분할 |
| `renderer/sections/milestone-history.js` | UPDATE | lifecycle 토글 |
| `renderer/html.js`, `markdown.js` | UPDATE | ms-lifecycle CSS + footer v1.18.5 |
| `lib/stale-audit/{enumerate,apply,index,locate}.js` | CREATE | 결정적 audit lib |
| `commands/dashboard-audit.md` | CREATE | 재사용 명령 |
| `renderer/tests/*` (5 신규 + 5 갱신), `stale-audit/tests/*` (2 신규) | CREATE/UPDATE | 549 test |
| `.claude-plugin/plugin.json` | UPDATE | 1.18.4 → 1.18.5 |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | §2.2 마커/audit/lifecycle |
| `CHANGELOG.md` | UPDATE | [1.18.5] row |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M2 complete + M3 in-progress + 재설계 문구 |
| `.claude/plans/*.plan.md` (~33), `.claude/prds/*.prd.md` (3) | UPDATE | dogfood 해결 마커 + 마일스톤 flip (비파괴) |

## Deviations from Plan

- **dogfood 스코프 (사용자 위임)**: 평가/판단을 Claude에 위임받아, 증거 강한 set만 마킹 — (1) `completed/` 아카이브 plan 위험/OQ 220건, (2) PRD 마일스톤 ship 완료 active plan 위험/OQ 257+16건, (3) completed/ plan 가진 in-progress 마일스톤 4건 flip. **genuinely 현재/pending 4개 plan은 보수적으로 live 유지**(dashboard-truthfulness-m3 본 cycle + pipeline-chart-m3-layout/v0-4-0-axis-h/v1-0-1-axis-k-m2 pending). 결과: 대시보드 위험 274 visible → active 31 / resolved 243, OQ → active 8 / resolved 30 (PRD "~230 해소" 타깃 초과).
- **locate off-by-one fix (계획 외 발견)**: dogfood 중 `findRisksTableLine`이 malformed(embedded `|`) 행을 parseRisks와 다르게 카운트해 ordinal drift → text-mismatch skip 발견. plan Task 6 "enumerate↔apply 동일 파서" parity 위반이라 fix + 회귀 테스트 추가. applier의 text-mismatch 가드가 잘못된 편집을 안전하게 차단했음(0 corruption).
- **plan 미아카이브**: 본 cycle 미ship(PR 전)이라 plan을 completed/로 이동하지 않음 — ship/PR cycle에서 worktree cleanup과 함께 처리.

## Issues Encountered

- **메타-케이스**: M3 plan 자신이 마커 컨벤션을 본문에 문서화(backtick 안 `<!--mccp:resolved-->`)해, 초기 anywhere-match reader가 그 risk를 거짓 resolved 처리 → **trailing-only 인식**으로 해소(원칙적 fix: 컨벤션 자체가 "행 끝 마커").
- **derive plans source = active only**: 대시보드는 active `.claude/plans/`만 렌더 → 초기 completed/ 마킹이 대시보드에 무영향 → PRD-status/ship-evidence 기반 active plan 마킹으로 교정.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `resolution-marker.test.js` | 13 | trailing/메타-케이스/escape/buildMarker |
| `resolution-classify.test.js` | 5 | 전파·정규화·fail-open |
| `milestone-lifecycle.test.js` | 5 | 토글·완료0·비-색 마커·default-collapsed |
| `stale-audit/enumerate.test.js` | 5 | active 추출·마커 제외·ref 안정성·fail-open |
| `stale-audit/apply.test.js` | 11 | F3 hash-mismatch·batch·idempotency·재-parse·오매칭·parity |
| `plan-body-parser/sections/milestone-history/markdown-equivalence/output-constraints` | 갱신 | M3 surface 회귀 |

## Known Limitations

- H16 design-lint advisory 1건 — 다른 plan들의 verbose mitigation 본문 raw `**`/백틱(기존 데이터, M3 무관, HEAD에서도 동일 fire 확인). advisory(렌더 비차단).
- 남은 active 위험/OQ는 genuinely 현재/pending 4개 plan에서만. 추가 정리는 `/mccp:dashboard-audit` 재실행(재사용 명령).

## M3-b 후속 — 위험·질문 진실성 *표현*(탭·전용 nav·뱃지)

M3-a가 *데이터*를 truthful하게 만들었으나(해결 마커), *표현*이 오해를 유발했다(사용자 피드백 2026-06-25): 트레일링 "해결됨 243건" 큰 숫자가 메인 흐름에서 "위험 250개" 착시, "해결됨 30건"이 ~40 미해결 착시. M3-b가 그 표현 gap을 닫는다.

### Tasks Completed (M3-b)

| # | Task | Status | Notes |
|---|---|---|---|
| 10 | active/완화됨 CSS-only 탭 빌더 + 위험/OQ 패널 적용 | 완료 | `parsers/tabs.js` 순수 빌더(radio+flex order+인접 :checked, JS 0). 트레일링 details → 탭. resolved 숫자는 탭 label 뱃지에만 |
| 11 | empty state 문구 | 완료 | `발견된 위험이 없습니다.` / `미해결 질문이 없습니다.` |
| 12 | nav 전용 질문 entry + route 분리 + 섹션 뱃지 | 완료 | route-attention → route-risks/route-questions. nav 위험+미해결질문 2 entry + neutral active count 뱃지 |
| 13 | OQ 진실성 — 결정 로그 ≠ 미해결 (접근 A) | 완료 | `/mccp:dashboard-audit` dogfood — active OQ 8건 = 이 plan 결정 로그. human-gate 사용자 전체 승인 후 7 `(결정)`/`(해소)`를 비파괴 resolved 마커링(증거 인용), `(defer)` 1건 live 유지. 결과: nav "미해결 질문 8→1", 해결됨 탭 30→37. 41 risks는 보수적 live(per-risk 증거 필요 → 재실행). 0 abort/error/누출 |
| 13b | stale-audit apply.js lock fail-closed (Codex M3-b F4) | 완료 | `withFileLock` fail-open → fail-closed + write-0 회귀 테스트 |
| 14 | STATUS.md 동등 + 테스트 전체 | 완료 | 탭 → `완화됨/해결됨 N건` md 접힘. tabs.test.js 신규 + sections/console-shell/markdown-equivalence/i18n 갱신 |
| 15 | impeccable critique | 완료 | **CONVERGED** — 4 Output Constraints 충족, 강조색 0, raw marker 누출 0. detector 2건(em-dash·numbered)은 source-data artifact(M3-b chrome 아님). 정식 a11y는 PR 단계 a11y-architect |
| 16 | version + 문서 | 완료 | plugin.json 1.18.5→1.18.6 + 양 footer + CHANGELOG [1.18.6] + dashboard-surface.md §2.3 |

### Files Changed (M3-b)

| File | Action | Notes |
|---|---|---|
| `renderer/parsers/tabs.js` | CREATE | CSS-only 탭 빌더(순수) |
| `renderer/sections/{risks,open-questions}.js` | UPDATE | 트레일링 details → 탭 + empty state + activeCount 반환 |
| `renderer/html.js` | UPDATE | route 분리 + nav 2 entry + count 뱃지 + 탭 CSS + footer 1.18.6 |
| `renderer/markdown.js` | UPDATE | footer 1.18.6 |
| `lib/stale-audit/apply.js` | UPDATE | withFileLock fail-closed (F4) + lockMaxRetries seam |
| `renderer/tests/tabs.test.js` | CREATE | 6 test |
| `renderer/tests/{sections,console-shell,markdown-equivalence,i18n-surface}.test.js` + `stale-audit/tests/apply.test.js` | UPDATE | 탭/route/fail-closed assertion 갱신 |
| `.claude-plugin/plugin.json`, `CHANGELOG.md`, `docs/.../dashboard-surface.md` | UPDATE | 1.18.6 + M3-b 문서 |

### Validation (M3-b)

556 test PASS (renderer 452 + derive 87 + stale-audit 17), 0 회귀. design-lint H16 advisory 1건(기존 데이터, M3-b 무관). raw 기능 마커 누출 0. nav 뱃지=truthful active count(위험 41·질문 8), 탭 label=완화됨 243/해결됨 30(메인 흐름 비노출).

### Deviation (M3-b)

- **risks 41건 live 유지(보수)**: Task 13 dogfood은 증거가 airtight한 OQ 결정 로그 7건으로 한정. 41 active risks는 현재/pending cycle과 ship'd 잔여가 섞여 있어 per-risk ship 증거가 필요 → audit 계약상 "불확실→live"로 보수 유지. 재실행 가능한 capability라 별도 `/mccp:dashboard-audit` 실행으로 정리 가능.

## Next Steps

- [ ] **status.html 육안 확인** (`.claude/cache/status.html` — 사용자 시각 검증, PR 전 필수)
- [ ] `/mccp:prp-commit` 으로 커밋
- [ ] `/mccp:pr` 로 PR 생성 (PRD M3 row complete + worktree cleanup)
- [ ] (선택) `/mccp:dashboard-audit` 재실행으로 ship'd-plan 잔여 위험 per-risk 정리
